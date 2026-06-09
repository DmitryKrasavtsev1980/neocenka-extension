/**
 * Сервис актуализации объявлений Авито
 *
 * Алгоритм:
 * 1. Открывает URL объявления в новой вкладке
 * 2. Ждёт загрузки страницы
 * 3. Через service worker инъектирует парсер (читает __staticRouterHydrationData)
 * 4. Получает: статус, цена, фото, продавец, просмотры, история цены
 * 5. Объединяет с существующими данными объявления
 * 6. Сохраняет в БД
 */

import type { Ad, PriceHistoryItem } from '@/types';
import { adsRepository } from '@/db/repositories/ads.repository';

/** Результат актуализации */
export interface AvitoActualizeResult {
  success: boolean;
  ad?: Ad;
  changes?: string[];
  error?: string;
}

/** Отправить сообщение в service worker и дождаться ответа */
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

/** Найти существующую вкладку с этим URL или создать новую */
async function findOrCreateTab(url: string): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: url.replace(/\/$/, '') + '*' });
  if (tabs.length > 0 && tabs[0].id) {
    await chrome.tabs.reload(tabs[0].id);
    await waitForTabLoad(tabs[0].id);
    return tabs[0];
  }

  const tab = await chrome.tabs.create({ url, active: false });
  if (!tab.id) throw new Error('Не удалось создать вкладку');
  await waitForTabLoad(tab.id);
  return tab;
}

/** Ждать завершения загрузки вкладки */
function waitForTabLoad(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === 'complete') {
        setTimeout(resolve, 2000);
        return;
      }

      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);

      const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 2000);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * Актуализировать объявление Авито
 */
export async function actualizeAvitoAd(ad: Ad): Promise<AvitoActualizeResult> {
  if (!ad.url || !ad.url.includes('avito.ru')) {
    return { success: false, error: 'URL объявления не содержит avito.ru' };
  }

  const changes: string[] = [];
  let tabId: number | undefined;

  try {
    // 1. Открываем вкладку
    const tab = await findOrCreateTab(ad.url);
    tabId = tab.id;

    // 2. Отправляем запрос в service worker для парсинга (с retry)
    let response: {
      success: boolean;
      data?: {
        status: 'active' | 'archived';
        price: number | null;
        pricePerMeter: number | null;
        photos: string[];
        updatedDate: string | null;
        datePublished: string | null;
        sellerName: string | null;
        sellerType: string | null;
        views: number | null;
        priceHistory: Array<{ date: string; price: number }>;
      };
      error?: string;
    } | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      console.log(`[Avito Update] Попытка ${attempt + 1}/3, tabId=${tab.id}, URL=${ad.url}`);
      response = await sendMessageToWorker<{
        success: boolean;
        data?: {
          status: 'active' | 'archived';
          price: number | null;
          pricePerMeter: number | null;
          photos: string[];
          updatedDate: string | null;
          datePublished: string | null;
          sellerName: string | null;
          sellerType: string | null;
          views: number | null;
          priceHistory: Array<{ date: string; price: number }>;
        };
        error?: string;
      }>({
        type: 'ACTUALIZE_AVITO_AD',
        tabId: tab.id,
      });

      console.log(`[Avito Update] Попытка ${attempt + 1} ответ:`, response ? `success=${response.success}, error=${response.error || 'none'}` : 'null');

      if (response?.success && response.data) break;

      if (attempt < 2) {
        console.log(`[Avito Update] Ожидание 3 сек перед повторной попыткой...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (!response?.success || !response.data) {
      return { success: false, error: response?.error || 'Не удалось спарсить данные' };
    }

    const parsed = response.data;

    // 3. Обновляем статус
    if (parsed.status !== ad.status) {
      changes.push(`Статус: ${ad.status} → ${parsed.status}`);
    }

    // 4. Обновляем цену и историю
    const currentPrice = parsed.price;
    const lastHistoryEntry = (ad.price_history || []).slice(-1)[0];
    const lastKnownPrice = lastHistoryEntry?.price ?? ad.price;

    if (currentPrice !== null && currentPrice !== lastKnownPrice) {
      changes.push(`Цена: ${lastKnownPrice?.toLocaleString('ru-RU') || '—'} → ${currentPrice.toLocaleString('ru-RU')} ₽`);
    }

    // 5. Обновляем историю цены — сливаем записи из API Авито с существующими
    // Дедупликация по дню + цене (т.к. форматы дат могут отличаться: UTC vs timezone)
    const toDayPriceKey = (date: string, price: number) => {
      const d = new Date(date);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return `${day}|${price}`;
    };
    const existingKeys = new Set(
      (ad.price_history || []).map(h => toDayPriceKey(h.date, h.new_price ?? h.price))
    );
    const newHistoryEntries: PriceHistoryItem[] = [];
    for (const entry of parsed.priceHistory) {
      const key = toDayPriceKey(entry.date, entry.price);
      if (!existingKeys.has(key)) {
        newHistoryEntries.push({ date: entry.date, price: entry.price });
        existingKeys.add(key);
      }
    }
    if (newHistoryEntries.length > 0) {
      changes.push(`История цены: +${newHistoryEntries.length} записей`);
    }

    // 6. Добавляем новые фото (дедупликация по ID из URL)
    const extractPhotoId = (url: string): string | null => {
      // Авито формат: .../img/ID или .../ID_1280x960 или числовой ID в конце
      const match = url.match(/\/img\/(\d+)/) || url.match(/\/(\d{10,})/);
      return match ? match[1] : url.split('?')[0];
    };
    const existingPhotoIds = new Set((ad.photos || []).map(p => extractPhotoId(p)));
    const newPhotos = parsed.photos.filter(p => {
      const id = extractPhotoId(p);
      return !existingPhotoIds.has(id);
    });
    if (newPhotos.length > 0) {
      changes.push(`Фото: +${newPhotos.length} новых`);
    }

    // 7. Дата обновления
    const mergedHistory = [...(ad.price_history || []), ...newHistoryEntries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let resolvedUpdatedDate: string | undefined;
    if (parsed.status === 'active') {
      resolvedUpdatedDate = new Date().toISOString();
      changes.push('Дата обновления: текущая (активное)');
    } else if (parsed.updatedDate) {
      resolvedUpdatedDate = parsed.updatedDate;
      changes.push(`Дата обновления: ${parsed.updatedDate}`);
    } else if (parsed.datePublished) {
      resolvedUpdatedDate = parsed.datePublished;
      changes.push(`Дата обновления: из даты публикации (${parsed.datePublished})`);
    } else if (newHistoryEntries.length > 0) {
      resolvedUpdatedDate = mergedHistory[mergedHistory.length - 1].date;
      changes.push(`Дата обновления: из истории цены`);
    }

    // 8. Продавец
    if (parsed.sellerName && parsed.sellerName !== ad.seller_info?.name) {
      changes.push(`Продавец: ${parsed.sellerName}`);
    }

    // 9. Просмотры
    if (parsed.views !== null) {
      changes.push(`Просмотры: ${parsed.views}`);
    }

    // 10. Формируем обновлённые данные
    const mergedPhotos = [...(ad.photos || []), ...newPhotos];

    const updates: Partial<Ad> = {
      status: parsed.status,
      price: parsed.price ?? ad.price,
      price_per_meter: parsed.pricePerMeter ?? (parsed.price && ad.area_total ? Math.round(parsed.price / ad.area_total) : ad.price_per_meter),
      price_history: mergedHistory,
      photos: mergedPhotos,
      photos_count: mergedPhotos.length,
      processing_status: 'processed',
      parsed_at: new Date().toISOString(),
    };
    if (resolvedUpdatedDate) {
      updates.updated = resolvedUpdatedDate;
    }

    // Сохраняем в БД
    if (ad.id) {
      await adsRepository.update(ad.id, updates);
    }

    const updatedAd = { ...ad, ...updates };

    return {
      success: true,
      ad: updatedAd,
      changes: changes.length > 0 ? changes : ['Изменений не обнаружено'],
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  } finally {
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}
