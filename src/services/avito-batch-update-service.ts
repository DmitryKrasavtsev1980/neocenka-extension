/**
 * Сервис массового обновления объявлений Авито
 *
 * Двухфазный алгоритм (аналог CIAN):
 * Фаза 1 — Быстрая проверка: fetch HTML → извлечь цену + статус из __staticRouterHydrationData
 * Фаза 2 — Полный парсинг: навигация + inject парсера (фото, продавец, просмотры) только для изменившихся
 * Фаза 3 — Пересчёт объектов
 */

import type { Ad, PriceHistoryItem } from '@/types';
import { adsRepository } from '@/db/repositories/ads.repository';
import { db } from '@/db/database';
import { actualizeAvitoAd } from '@/services/avito-update-service';

/** Прогресс batch-обновления */
export interface AvitoBatchProgress {
  phase: 'check' | 'parse' | 'done';
  total: number;
  current: number;
  changed: number;
  updated: number;
  errors: Array<{ url: string; error: string }>;
  currentUrl?: string;
}

/** Колбэк прогресса */
export type AvitoProgressCallback = (progress: AvitoBatchProgress) => void;

/** Итог batch-обновления */
export interface AvitoBatchResult {
  total: number;
  checked: number;
  changed: number;
  updated: number;
  unchanged: number;
  errors: Array<{ url: string; error: string }>;
}

/** Отправить сообщение в service worker */
function sendMessageToWorker<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

/** Создать фоновую вкладку на avito.ru для HTML-fetch */
async function createAvitoBackgroundTab(): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create({
    url: 'https://www.avito.ru/',
    active: false,
  });
  if (!tab.id) throw new Error('Не удалось создать вкладку');

  await new Promise<void>(resolve => {
    chrome.tabs.get(tab.id!, tabInfo => {
      if (tabInfo.status === 'complete') {
        setTimeout(resolve, 1000);
        return;
      }
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 15000);
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tab.id && info.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });

  return tab;
}

/**
 * Быстрая проверка объявления через HTML-fetch (без навигации)
 */
async function checkAdQuick(
  tabId: number,
  ad: Ad,
): Promise<{ price: number | null; status: 'active' | 'archived'; error?: string }> {
  const response = await sendMessageToWorker<{
    success: boolean;
    data?: { price: number | null; status: 'active' | 'archived'; error?: string };
    error?: string;
  }>({
    type: 'CHECK_AVITO_AD_HTML',
    tabId,
    url: ad.url,
  });

  if (!response?.success || !response.data) {
    return { price: null, status: 'archived', error: response?.error || 'Не удалось проверить' };
  }

  return response.data;
}

/** Объединить историю цен из массива объявлений */
function mergePriceHistory(ads: Ad[]): PriceHistoryItem[] {
  type Entry = { date: string; price: number; adId: number };
  const entries: Entry[] = [];

  for (const ad of ads) {
    if (ad.price_history && ad.price_history.length > 0) {
      for (const h of ad.price_history) {
        const price = h.new_price ?? h.price;
        if (price != null && h.date) {
          entries.push({ date: h.date, price, adId: ad.id ?? 0 });
        }
      }
    }
    if (ad.price != null) {
      const date = ad.updated || ad.created || new Date().toISOString();
      entries.push({ date, price: ad.price, adId: ad.id ?? 0 });
    }
  }

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const seen = new Set<string>();
  const unique: PriceHistoryItem[] = [];
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    const key = `${day}|${e.price}|${e.adId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ date: e.date, new_price: e.price, price: e.price });
  }

  return unique;
}

/** Пересчитать и сохранить объект по ID */
async function recalculateObject(objectId: number): Promise<void> {
  const objectAds = await db.ads.where('object_id').equals(objectId).toArray();
  if (objectAds.length === 0) return;

  const typeCounts: Record<string, number> = {};
  for (const ad of objectAds) {
    if (ad.property_type) typeCounts[ad.property_type] = (typeCounts[ad.property_type] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const hasActive = objectAds.some(a => a.status === 'active');
  const status = hasActive ? 'active' : 'archived';

  const dates = objectAds.map(a => a.created).filter((v): v is string => !!v);
  const updatedDates = objectAds.map(a => a.updated || a.created).filter((v): v is string => !!v);
  const earliest = dates.length > 0 ? dates.sort()[0] : null;
  const latest = updatedDates.length > 0 ? updatedDates.sort().reverse()[0] : null;

  const priceHistory = mergePriceHistory(objectAds);
  const currentPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].new_price ?? priceHistory[priceHistory.length - 1].price ?? null : null;

  const areas = objectAds.map(a => a.area_total).filter((v): v is number => v != null);
  const areaTotal = areas.length > 0 ? Math.min(...areas) : null;
  const pricePerMeter = (currentPrice != null && areaTotal != null && areaTotal > 0)
    ? Math.round(currentPrice / areaTotal)
    : null;

  const hasOwner = objectAds.some(a => a.seller_type === 'owner' || a.seller_info?.type === 'owner');
  const ownerStatus = hasOwner ? 'есть от собственника' : 'только от агентов';

  const addressIds = [...new Set(objectAds.map(a => a.address_id).filter((v): v is number => v != null))];
  const commonAddressId = addressIds.length > 0 ? addressIds[0] : null;

  await db.table('ad_objects').update(objectId, {
    address_id: commonAddressId,
    property_type: dominantType,
    area_total: areaTotal,
    status,
    current_price: currentPrice,
    price_per_meter: pricePerMeter,
    price_history: priceHistory,
    listings_count: objectAds.length,
    active_listings_count: objectAds.filter(a => a.status === 'active').length,
    owner_status: ownerStatus,
    created: earliest,
    updated: latest,
    last_recalculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Массовое обновление Avito объявлений
 */
export async function batchUpdateAvitoAds(
  ads: Ad[],
  onProgress?: AvitoProgressCallback,
  archiveDays?: number,
): Promise<AvitoBatchResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (archiveDays ?? 7));

  const avitoAds = ads.filter(ad => {
    if (!ad.url?.includes('avito.ru')) return false;
    if (ad.status === 'active') return true;
    if (ad.updated) {
      return new Date(ad.updated) >= cutoff;
    }
    return false;
  });

  const result: AvitoBatchResult = {
    total: avitoAds.length,
    checked: 0,
    changed: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  if (avitoAds.length === 0) return result;

  let progress: AvitoBatchProgress = {
    phase: 'check',
    total: avitoAds.length,
    current: 0,
    changed: 0,
    updated: 0,
    errors: [],
  };

  const emit = () => {
    progress = { ...progress };
    onProgress?.(progress);
  };

  let tabId: number | undefined;

  try {
    // ФАЗА 1: Быстрая проверка всех объявлений
    tabId = (await createAvitoBackgroundTab()).id;
    const needFullParse: Ad[] = [];

    for (let i = 0; i < avitoAds.length; i++) {
      const ad = avitoAds[i];
      progress.current = i + 1;
      progress.currentUrl = ad.url;
      emit();

      try {
        const checked = await checkAdQuick(tabId, ad);

        if (checked.error) {
          // Редирект или 404/410 — объявление точно архивировано
          if (checked.error.includes('Redirect to non-ad page') || checked.error.includes('HTTP 404') || checked.error.includes('HTTP 410')) {
            await adsRepository.update(ad.id!, {
              status: 'archived',
              parsed_at: new Date().toISOString(),
            });
            result.updated++;
            if (ad.object_id) {
              await recalculateObject(ad.object_id);
            }
          } else {
            needFullParse.push(ad);
          }
          continue;
        }

        const priceChanged = checked.price !== null && checked.price !== ad.price;
        const statusChanged = checked.status !== ad.status;

        if (priceChanged || statusChanged) {
          needFullParse.push(ad);
          progress.changed = needFullParse.length;
        } else {
          // Данные на Avito не изменились.
          // parsed_at — когда последний раз проверяли.
          // updated для active — когда последний раз подтвердили, что объявление ещё активное
          // (после архивации даст дату последнего подтверждения активности).
          // Для archived updated не трогаем — там остаётся последняя подтверждённая активная дата.
          const updates: Partial<Ad> = { parsed_at: new Date().toISOString() };
          const bumpedUpdated = ad.status === 'active';
          if (bumpedUpdated) {
            updates.updated = new Date().toISOString();
          }
          await adsRepository.update(ad.id!, updates);
          result.unchanged++;
          // Если updated сдвинулся — нужно пересчитать объект, чтобы его updated тоже обновился
          if (bumpedUpdated && ad.object_id) {
            await recalculateObject(ad.object_id);
          }
        }
      } catch {
        needFullParse.push(ad);
      }

      result.checked++;

      // Задержка между запросами (Авито строже с rate limit)
      if (i < avitoAds.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Закрываем фоновую вкладку
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => {});
      tabId = undefined;
    }

    // ФАЗА 2: Полный парсинг изменившихся
    if (needFullParse.length > 0) {
      progress.phase = 'parse';
      progress.total = needFullParse.length;
      progress.current = 0;
      emit();

      for (let i = 0; i < needFullParse.length; i++) {
        const ad = needFullParse[i];
        progress.current = i + 1;
        progress.currentUrl = ad.url;
        emit();

        try {
          const actualizeResult = await actualizeAvitoAd(ad);
          if (actualizeResult.success && actualizeResult.ad) {
            result.updated++;
            if (actualizeResult.ad.object_id) {
              await recalculateObject(actualizeResult.ad.object_id);
            }
          } else {
            result.errors.push({ url: ad.url || '', error: actualizeResult.error || 'Неизвестная ошибка' });
            progress.errors = [...result.errors];
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push({ url: ad.url || '', error: msg });
          progress.errors = [...result.errors];
        }

        // Задержка между полными парсингами
        if (i < needFullParse.length - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    result.changed = needFullParse.length;
  } finally {
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
    progress.phase = 'done';
    progress.currentUrl = undefined;
    emit();
  }

  return result;
}
