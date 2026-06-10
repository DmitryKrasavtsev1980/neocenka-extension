/**
 * Сервис актуализации объявлений ЦИАН
 *
 * Алгоритм:
 * 1. Открывает URL объявления в новой вкладке
 * 2. Ждёт загрузки страницы
 * 3. Через service worker инъектирует парсер
 * 4. Получает: статус, цена, фото, дата обновления, история цены
 * 5. Объединяет с существующими данными объявления
 * 6. Сохраняет в БД
 */

import type { Ad, PriceHistoryItem } from '@/types';
import { adsRepository } from '@/db/repositories/ads.repository';

/** Результат актуализации */
export interface ActualizeResult {
  success: boolean;
  ad?: Ad;
  changes?: string[];
  error?: string;
}

/** Извлечь offerId из URL ЦИАН */
function extractCianOfferId(url: string): number | null {
  // https://novosibirsk.cian.ru/sale/flat/327741636/
  const match = url.match(/\/(\d{4,})\/?/);
  return match ? parseInt(match[1], 10) : null;
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
  // Проверяем, есть ли уже открытая вкладка с этим URL
  const tabs = await chrome.tabs.query({ url: url.replace(/\/$/, '') + '*' });
  if (tabs.length > 0 && tabs[0].id) {
    // Перезагружаем страницу для свежих данных
    await chrome.tabs.reload(tabs[0].id);
    await chrome.tabs.update(tabs[0].id, { active: true });
    // Ждём загрузки
    await waitForTabLoad(tabs[0].id);
    return tabs[0];
  }

  // Создаём новую вкладку
  const tab = await chrome.tabs.create({ url, active: false });
  if (!tab.id) throw new Error('Не удалось создать вкладку');
  await waitForTabLoad(tab.id);
  return tab;
}

/** Ждать завершения загрузки вкладки */
function waitForTabLoad(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve) => {
    // Проверяем текущее состояние вкладки
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === 'complete') {
        // Уже загружена — ждём рендер JS
        setTimeout(resolve, 3000);
        return;
      }

      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(); // Таймаут — продолжаем
      }, timeoutMs);

      const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          // Задержка для рендера React-компонентов ЦИАН
          setTimeout(resolve, 3000);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * Актуализировать объявление ЦИАН
 *
 * @param ad Существующее объявление
 * @returns Результат с обновлёнными данными
 */
export async function actualizeCianAd(ad: Ad): Promise<ActualizeResult> {
  if (!ad.url || !ad.url.includes('cian.ru')) {
    return { success: false, error: 'URL объявления не содержит cian.ru' };
  }

  const changes: string[] = [];
  let tabId: number | undefined;

  try {
    // 0. Предварительная проверка через service worker (fetch без навигации)
    const quickCheck = await sendMessageToWorker<{
      success: boolean;
      data?: { price: number | null; status: 'active' | 'archived'; error?: string };
      error?: string;
    }>({
      type: 'CHECK_CIAN_AD_STATUS',
      url: ad.url,
    });

    // Если fetch вернул HTTP 404/410 — объявление удалено, не открываем вкладку
    const quickError = quickCheck?.data?.error;
    if (quickError && (quickError.includes('HTTP 404') || quickError.includes('HTTP 410'))) {
      const updates: Partial<Ad> = {
        status: 'archived',
        parsed_at: new Date().toISOString(),
        processing_status: 'processed',
      };
      if (ad.id) {
        await adsRepository.update(ad.id, updates);
      }
      const updatedAd = { ...ad, ...updates };
      return {
        success: true,
        ad: updatedAd,
        changes: ['Объявление удалено (404). Статус изменён на «архивное».'],
      };
    }

    // Если по quick check видно что статус archived (снято с публикации)
    if (quickCheck?.success && quickCheck.data?.status === 'archived' && quickCheck.data.price === null) {
      const updates: Partial<Ad> = {
        status: 'archived',
        parsed_at: new Date().toISOString(),
        processing_status: 'processed',
      };
      if (ad.id) {
        await adsRepository.update(ad.id, updates);
      }
      const updatedAd = { ...ad, ...updates };
      return {
        success: true,
        ad: updatedAd,
        changes: ['Объявление снято с публикации. Статус изменён на «архивное».'],
      };
    }

    // 1. Открываем вкладку
    const tab = await findOrCreateTab(ad.url);
    tabId = tab.id;

    // 2. Извлекаем offerId для API
    const offerId = extractCianOfferId(ad.url);

    // 3. Отправляем запрос в service worker для парсинга (с retry)
    let response: {
      success: boolean;
      data?: {
        status: 'active' | 'archived';
        price: number | null;
        photos: string[];
        updatedDate: string | null;
        priceHistory: Array<{ date: string; price: number }>;
      };
      error?: string;
    } | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      response = await sendMessageToWorker<{
        success: boolean;
        data?: {
          status: 'active' | 'archived';
          price: number | null;
          photos: string[];
          updatedDate: string | null;
          priceHistory: Array<{ date: string; price: number }>;
        };
        error?: string;
      }>({
        type: 'ACTUALIZE_CIAN_AD',
        tabId: tab.id,
        offerId,
      });

      if (response?.success && response.data) break;

      // Не удалось — ждём и пробуем снова
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (!response?.success || !response.data) {
      return { success: false, error: response?.error || 'Не удалось спарсить данные' };
    }

    const parsed = response.data;

    // 4. Обновляем статус
    if (parsed.status !== ad.status) {
      changes.push(`Статус: ${ad.status} → ${parsed.status}`);
    }

    // 5. Обновляем цену
    if (parsed.price !== null && parsed.price !== ad.price) {
      changes.push(`Цена: ${ad.price?.toLocaleString('ru-RU') || '—'} → ${parsed.price.toLocaleString('ru-RU')} ₽`);
    }

    // 6. Обновляем историю цены — добавляем новые записи
    const existingDates = new Set((ad.price_history || []).map(h => h.date));
    const newHistoryEntries: PriceHistoryItem[] = [];
    for (const entry of parsed.priceHistory) {
      if (!existingDates.has(entry.date)) {
        newHistoryEntries.push({
          date: entry.date,
          price: entry.price,
        });
      }
    }
    if (newHistoryEntries.length > 0) {
      changes.push(`История цены: +${newHistoryEntries.length} записей`);
    }

    // 7. Добавляем новые фото (сравнение по ID фото из URL)
    // CIAN URL формат: images.cdn-cian.ru/images/{ID}-{suffix}.jpg
    // ID — уникальный идентификатор фото, суффикс (-1, -2) — размер
    const extractPhotoId = (url: string): string | null => {
      const match = url.match(/\/images\/(\d+)-/);
      return match ? match[1] : url.split('?')[0]; // fallback на полный URL без query
    };
    const existingPhotoIds = new Set((ad.photos || []).map(p => extractPhotoId(p)));
    const newPhotos = parsed.photos.filter(p => {
      const id = extractPhotoId(p);
      return !existingPhotoIds.has(id);
    });
    if (newPhotos.length > 0) {
      changes.push(`Фото: +${newPhotos.length} новых`);
    }

    // 8. Дата обновления
    const mergedHistory = [...(ad.price_history || []), ...newHistoryEntries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let resolvedUpdatedDate: string | undefined;
    if (parsed.status === 'active') {
      // Активное — текущая дата актуализации
      resolvedUpdatedDate = new Date().toISOString();
      changes.push('Дата обновления: текущая (активное)');
    } else if (parsed.updatedDate) {
      // Архивное, есть дата на странице
      resolvedUpdatedDate = parsed.updatedDate;
      changes.push(`Дата обновления: ${parsed.updatedDate}`);
    } else if (newHistoryEntries.length > 0) {
      // Архивное, нет даты на странице — берём дату последнего изменения цены
      resolvedUpdatedDate = mergedHistory[mergedHistory.length - 1].date;
      changes.push(`Дата обновления: из истории цены (${resolvedUpdatedDate})`);
    }
    // Иначе — не меняем дату (ни на странице, ни в истории ничего нового)

    // 9. Формируем обновлённые данные
    const mergedPhotos = [...(ad.photos || []), ...newPhotos];

    const updates: Partial<Ad> = {
      status: parsed.status,
      price: parsed.price ?? ad.price,
      price_per_meter: parsed.price && ad.area_total ? Math.round(parsed.price / ad.area_total) : ad.price_per_meter,
      price_history: mergedHistory,
      photos: mergedPhotos,
      photos_count: mergedPhotos.length,
      processing_status: 'processed',
      parsed_at: new Date().toISOString(),
    };
    // Добавляем updated только если определили новую дату
    if (resolvedUpdatedDate) {
      updates.updated = resolvedUpdatedDate;
    }

    // 10. Сохраняем в БД
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
    // Закрываем вкладку актуализации
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}
