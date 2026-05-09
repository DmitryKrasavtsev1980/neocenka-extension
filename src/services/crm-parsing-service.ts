/**
 * Сервис парсинга объявлений CIAN/Авито для CRM
 * Открывает URL в скрытой вкладке, делегирует парсинг в background service worker
 * (chrome.scripting доступен только в service worker)
 * Получает данные и создаёт лиды в IndexedDB
 */

import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmParsingSource } from '@/types';

export interface ParsedListing {
  name: string;
  phones: string[];       // массив нормализованных номеров
  address: string;
  price: number | null;
  url: string;
  seller_type: string;
  rooms: string;
  area: number | null;
  floor: string;
}

export type ParsingProgress = {
  stage: 'opening' | 'parsing' | 'saving' | 'done' | 'error';
  detail: string;
  found: number;
  created: number;
  duplicates: number;
};

type ProgressCallback = (progress: ParsingProgress) => void;

export function detectSourceType(url: string): 'cian' | 'avito' {
  if (url.includes('cian.ru')) return 'cian';
  if (url.includes('avito.ru')) return 'avito';
  throw new Error('Неподдерживаемый источник. Используйте ссылку на cian.ru или avito.ru');
}

/**
 * Кликает кнопки телефонов на CIAN для раскрытия номеров
 */
async function clickPhoneButtons(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CLICK_PHONE_BUTTONS', tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка клика'));
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * Делегирует парсинг в background service worker через sendMessage
 * chrome.scripting.executeScript доступен только в service worker
 */
async function injectParser(tabId: number, sourceType: 'cian' | 'avito'): Promise<ParsedListing[]> {
  // Для CIAN — сначала кликаем телефоны, ждём раскрытия, потом парсим
  if (sourceType === 'cian') {
    await clickPhoneButtons(tabId);
    await sleep(1500);
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXECUTE_PARSER', tabId, sourceType },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка парсинга'));
          return;
        }
        resolve(response.listings || []);
      },
    );
  });
}

/**
 * Получает URL следующей страницы через background service worker
 */
async function getNextPageUrl(tabId: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_NEXT_PAGE_URL', tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка получения URL'));
          return;
        }
        resolve(response.url || null);
      },
    );
  });
}

/**
 * Парсинг одного источника — создаёт ЛИДЫ из новых объявлений
 * Поддерживает пагинацию: проходит все страницы с результатами
 */
export async function parseSourceForLeads(
  source: CrmParsingSource,
  onProgress?: ProgressCallback,
): Promise<{ newLeads: number; skipped: number; found: number }> {
  onProgress?.({ stage: 'opening', detail: `Открытие ${source.source_type.toUpperCase()}...`, found: 0, created: 0, duplicates: 0 });

  // Добавляем сортировку по дате (сначала новые) для оптимизации повторного парсинга
  let startUrl = source.url;
  if (source.source_type === 'cian' && !startUrl.includes('sort=')) {
    const sep = startUrl.includes('?') ? '&' : '?';
    startUrl += sep + 'sort=creation_date_desc';
  }

  // Получаем все известные URL лидов — для быстрой проверки дубликатов
  const knownUrls = await crmRepository.getKnownLeadUrls();
  const now = new Date().toISOString();
  let totalNew = 0;
  let totalSkipped = 0;
  let totalFound = 0;
  let pageNum = 0;

  let currentUrl: string | null = startUrl;
  const tab = await chrome.tabs.create({ url: currentUrl, active: false });

  try {
    while (currentUrl) {
      pageNum++;
      if (pageNum > 1) {
        onProgress?.({ stage: 'opening', detail: `Страница ${pageNum}...`, found: totalFound, created: totalNew, duplicates: totalSkipped });
        await chrome.tabs.update(tab.id!, { url: currentUrl });
        await waitForTabLoad(tab.id!);
        await sleep(3000);
      } else {
        await waitForTabLoad(tab.id!);
        await sleep(3000);
      }

      onProgress?.({ stage: 'parsing', detail: `Парсинг страницы ${pageNum}...`, found: totalFound, created: totalNew, duplicates: totalSkipped });

      const listings = await injectParser(tab.id!, source.source_type);
      totalFound += listings.length;

      onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: найдено ${listings.length}. Всего ${totalFound}. Проверка...`, found: totalFound, created: totalNew, duplicates: totalSkipped });

      for (const l of listings) {
        if (!l.name && (!l.phones || l.phones.length === 0)) {
          totalSkipped++;
          continue;
        }
        if (l.url && knownUrls.has(l.url)) {
          totalSkipped++;
          continue;
        }

        await crmRepository.addLead({
          source: source.source_type,
          source_url: l.url || undefined,
          contact_name: l.name || 'Без имени',
          phones: (l.phones || []).map(n => ({ number: n })),
          contact_email: undefined,
          ad_data: {
            address: l.address || undefined,
            price: l.price ?? undefined,
            property_type: l.rooms || undefined,
            area_total: l.area ?? undefined,
            floor: l.floor ? parseInt(l.floor.split('/')[0]) : undefined,
            floors_total: l.floor ? parseInt(l.floor.split('/')[1]) : undefined,
            url: l.url || undefined,
            description: l.seller_type ? `Продавец: ${l.seller_type}` : undefined,
          },
          pipeline_id: source.pipeline_id,
          stage_id: source.stage_id,
          status: 'new',
          notes: undefined,
          created_at: now,
          updated_at: now,
        });

        if (l.url) knownUrls.add(l.url);
        totalNew++;
      }

      // Оптимизация: если на этой странице все дубли — нет смысла идти дальше (отсортировано по дате)
      const allDuplicates = listings.length > 0 && listings.every(l => (!l.name && (!l.phones || l.phones.length === 0)) || (l.url && knownUrls.has(l.url)));
      if (allDuplicates && pageNum > 1) {
        currentUrl = null; // все дубли — останавливаемся
      } else {
        currentUrl = await getNextPageUrl(tab.id!);
      }
    }

    // Обновляем источник парсинга
    if (source.id) {
      await crmRepository.updateParsingSource(source.id, {
        last_parsed_at: now,
        listings_count: (source.listings_count || 0) + totalNew,
      });
    } else {
      await crmRepository.addParsingSource({
        url: source.url,
        source_type: source.source_type,
        pipeline_id: source.pipeline_id,
        stage_id: source.stage_id,
        last_parsed_at: now,
        listings_count: totalNew,
        created_at: now,
      });
    }

    onProgress?.({
      stage: 'done',
      detail: `Готово: ${totalNew} новых лидов, ${totalSkipped} пропущено из ${totalFound} на ${pageNum} стр.`,
      found: totalFound,
      created: totalNew,
      duplicates: totalSkipped,
    });

    // Уведомляем об изменении CRM данных (для обновления счётчиков в меню)
    window.dispatchEvent(new CustomEvent('crm-data-changed'));

    return { newLeads: totalNew, skipped: totalSkipped, found: totalFound };
  } catch (e) {
    onProgress?.({
      stage: 'error',
      detail: `Ошибка: ${e instanceof Error ? e.message : String(e)}`,
      found: 0,
      created: 0,
      duplicates: 0,
    });
    throw e;
  } finally {
    try { await chrome.tabs.remove(tab.id!); } catch { /* вкладка уже закрыта */ }
  }
}

/**
 * Запуск парсинга всех источников
 */
export async function parseAllSources(
  sources: CrmParsingSource[],
  onProgress?: (current: number, total: number, progress: ParsingProgress) => void,
): Promise<{ totalNew: number; totalSkipped: number; totalFound: number }> {
  let totalNew = 0;
  let totalSkipped = 0;
  let totalFound = 0;

  for (let i = 0; i < sources.length; i++) {
    onProgress?.(i + 1, sources.length, {
      stage: 'opening',
      detail: `Источник ${i + 1}/${sources.length}: ${sources[i].source_type}`,
      found: 0,
      created: 0,
      duplicates: 0,
    });

    try {
      const result = await parseSourceForLeads(sources[i], (p) => {
        onProgress?.(i + 1, sources.length, p);
      });
      totalNew += result.newLeads;
      totalSkipped += result.skipped;
      totalFound += result.found;
    } catch {
      // Продолжаем со следующим источником
    }

    if (i < sources.length - 1) {
      await sleep(3000);
    }
  }

  return { totalNew, totalSkipped, totalFound };
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Таймаут загрузки страницы'));
    }, 30000);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @deprecated Используйте parseSourceForLeads
 * Старый API — для обратной совместимости
 */
export async function parseUrl(
  url: string,
  pipelineId: number,
  stageId: number,
  onProgress?: ProgressCallback,
): Promise<{ inserted: number; duplicates: number; found: number }> {
  const sourceType = detectSourceType(url);
  const result = await parseSourceForLeads(
    {
      url,
      source_type: sourceType,
      pipeline_id: pipelineId,
      stage_id: stageId,
      listings_count: 0,
      created_at: new Date().toISOString(),
    },
    onProgress,
  );
  return {
    inserted: result.newLeads,
    duplicates: result.skipped,
    found: result.found,
  };
}
