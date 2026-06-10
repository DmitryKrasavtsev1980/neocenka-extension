/**
 * Сервис массового обновления объявлений ЦИАН
 *
 * Двухфазный алгоритм:
 * Фаза 1 — Быстрая проверка: fetch HTML → JSON-LD (цена + статус) без навигации
 * Фаза 2 — Полный парсинг: навигация + inject парсера (фото, история, дата) только для изменившихся
 * Фаза 3 — Пересчёт объектов
 */

import type { Ad, AdObject, PriceHistoryItem } from '@/types';
import { adsRepository } from '@/db/repositories/ads.repository';
import { db } from '@/db/database';
import { actualizeCianAd } from '@/services/cian-update-service';

/** Прогресс batch-обновления */
export interface BatchProgress {
  /** Текущая фаза */
  phase: 'check' | 'parse' | 'done';
  /** Всего объявлений */
  total: number;
  /** Обработано в текущей фазе */
  current: number;
  /** Кол-во изменившихся (нужен полный парсинг) */
  changed: number;
  /** Кол-во успешно обновлённых */
  updated: number;
  /** Ошибки */
  errors: Array<{ url: string; error: string }>;
  /** URL текущего объявления */
  currentUrl?: string;
}

/** Колбэк прогресса */
export type ProgressCallback = (progress: BatchProgress) => void;

/** Итог batch-обновления */
export interface BatchResult {
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

/** Создать фоновую вкладку на cian.ru для HTML-fetch */
async function createCianBackgroundTab(): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create({
    url: 'https://www.cian.ru/',
    active: false,
  });
  if (!tab.id) throw new Error('Не удалось создать вкладку');

  // Ждём загрузки
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
          setTimeout(resolve, 1000);
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
    type: 'CHECK_CIAN_AD_HTML',
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

  // Преобладающий тип
  const typeCounts: Record<string, number> = {};
  for (const ad of objectAds) {
    if (ad.property_type) typeCounts[ad.property_type] = (typeCounts[ad.property_type] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Статус
  const hasActive = objectAds.some(a => a.status === 'active');
  const status = hasActive ? 'active' : 'archived';

  // Даты
  const dates = objectAds.map(a => a.created).filter((v): v is string => !!v);
  const updatedDates = objectAds.map(a => a.updated || a.created).filter((v): v is string => !!v);
  const earliest = dates.length > 0 ? dates.sort()[0] : null;
  const latest = updatedDates.length > 0 ? updatedDates.sort().reverse()[0] : null;

  // Цена
  const priceHistory = mergePriceHistory(objectAds);
  const currentPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].new_price ?? priceHistory[priceHistory.length - 1].price ?? null : null;

  // Площадь
  const areas = objectAds.map(a => a.area_total).filter((v): v is number => v != null);
  const areaTotal = areas.length > 0 ? Math.min(...areas) : null;
  const pricePerMeter = (currentPrice != null && areaTotal != null && areaTotal > 0)
    ? Math.round(currentPrice / areaTotal)
    : null;

  // Статус собственника
  const hasOwner = objectAds.some(a => a.seller_type === 'owner' || a.seller_info?.type === 'owner');
  const ownerStatus = hasOwner ? 'есть от собственника' : 'только от агентов';

  // Адрес
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
 * Массовое обновление CIAN объявлений
 */
export async function batchUpdateCianAds(
  ads: Ad[],
  onProgress?: ProgressCallback,
  archiveDays?: number,
): Promise<BatchResult> {
  // Фильтруем CIAN объявления:
  // - Активные — всегда
  // - Архивные — только если обновлялись не более N дней назад
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (archiveDays ?? 7));

  const cianAds = ads.filter(ad => {
    if (!ad.url?.includes('cian.ru')) return false;
    if (ad.status === 'active') return true;
    // Архивные — проверяем дату обновления
    if (ad.updated) {
      return new Date(ad.updated) >= cutoff;
    }
    // Нет даты обновления — пропускаем
    return false;
  });

  const result: BatchResult = {
    total: cianAds.length,
    checked: 0,
    changed: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  if (cianAds.length === 0) return result;

  let progress: BatchProgress = {
    phase: 'check',
    total: cianAds.length,
    current: 0,
    changed: 0,
    updated: 0,
    errors: [],
  };

  // Каждый вызов создаёт новый объект → React видит изменение и ререндерит
  const emit = () => {
    progress = { ...progress };
    onProgress?.(progress);
  };

  let tabId: number | undefined;

  try {
    // ФАЗА 1: Быстрая проверка всех объявлений
    tabId = (await createCianBackgroundTab()).id;
    const needFullParse: Ad[] = [];

    for (let i = 0; i < cianAds.length; i++) {
      const ad = cianAds[i];
      progress.current = i + 1;
      progress.currentUrl = ad.url;
      emit();

      try {
        const checked = await checkAdQuick(tabId, ad);

        if (checked.error) {
          // HTTP 404/410 — объявление удалено, сразу в архив
          if (checked.error.includes('HTTP 404') || checked.error.includes('HTTP 410')) {
            await adsRepository.update(ad.id!, {
              status: 'archived',
              parsed_at: new Date().toISOString(),
            });
            result.updated++;
            if (ad.object_id) {
              await recalculateObject(ad.object_id);
            }
          } else {
            // Другая ошибка — ставим в очередь на полный парсинг
            needFullParse.push(ad);
          }
          continue;
        }

        // Сравниваем с текущими данными
        const priceChanged = checked.price !== null && checked.price !== ad.price;
        const statusChanged = checked.status !== ad.status;

        if (priceChanged || statusChanged) {
          needFullParse.push(ad);
          progress.changed = needFullParse.length;
        } else {
          // Без изменений — обновляем только parsed_at
          await adsRepository.update(ad.id!, { parsed_at: new Date().toISOString() });
          result.unchanged++;
        }
      } catch {
        // Ошибка — ставим в очередь на полный парсинг
        needFullParse.push(ad);
      }

      result.checked++;

      // Задержка между запросами, чтобы не получить бан от CIAN
      if (i < cianAds.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
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
          const actualizeResult = await actualizeCianAd(ad);
          if (actualizeResult.success && actualizeResult.ad) {
            result.updated++;
            // Пересчитываем объект, если объявление привязано
            if (actualizeResult.ad.object_id) {
              await recalculateObject(actualizeResult.ad.object_id);
            }
          } else {
            const errMsg = actualizeResult.error || 'Неизвестная ошибка';
            // Если объявление удалено (404/не найдено) — помечаем как архивное
            if (errMsg.includes('404') || errMsg.includes('не найдено') || errMsg.includes('удалено')) {
              await adsRepository.update(ad.id!, {
                status: 'archived',
                parsed_at: new Date().toISOString(),
              });
              result.updated++;
              if (ad.object_id) {
                await recalculateObject(ad.object_id);
              }
            } else {
              result.errors.push({ url: ad.url || '', error: errMsg });
              progress.errors = [...result.errors];
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Если объявление удалено (404/не найдено) — помечаем как архивное
          if (msg.includes('404') || msg.includes('не найдено') || msg.includes('удалено')) {
            await adsRepository.update(ad.id!, {
              status: 'archived',
              parsed_at: new Date().toISOString(),
            });
            result.updated++;
            if (ad.object_id) {
              await recalculateObject(ad.object_id);
            }
          } else {
            result.errors.push({ url: ad.url || '', error: msg });
            progress.errors = [...result.errors];
          }
        }

        // Задержка между полными парсингами (каждый и так ~5-10 сек из-за загрузки)
        if (i < needFullParse.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    result.changed = needFullParse.length;
  } finally {
    // Закрываем вкладку если ещё открыта
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
    progress.phase = 'done';
    progress.currentUrl = undefined;
    emit();
  }

  return result;
}
