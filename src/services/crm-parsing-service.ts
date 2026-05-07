/**
 * Сервис парсинга объявлений CIAN/Авито для CRM
 * Открывает URL в скрытой вкладке, отправляет сообщение content script,
 * получает данные и создаёт клиентов в IndexedDB
 */

import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmClient } from '@/types';

interface ParsedListing {
  name: string;
  phone: string;
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

function detectSourceType(url: string): 'cian' | 'avito' {
  if (url.includes('cian.ru')) return 'cian';
  if (url.includes('avito.ru')) return 'avito';
  throw new Error('Неподдерживаемый источник. Используйте ссылку на cian.ru или avito.ru');
}

/**
 * Парсинг одной страницы
 */
export async function parseUrl(
  url: string,
  pipelineId: number,
  stageId: number,
  onProgress?: ProgressCallback,
): Promise<{ inserted: number; duplicates: number; found: number }> {
  const sourceType = detectSourceType(url);

  onProgress?.({ stage: 'opening', detail: `Открытие страницы...`, found: 0, created: 0, duplicates: 0 });

  // Создаём вкладку
  const tab = await chrome.tabs.create({ url, active: false });

  try {
    // Ждём загрузки страницы
    await waitForTabLoad(tab.id!);

    // Небольшая задержка для рендера динамического контента
    await sleep(2000);

    onProgress?.({ stage: 'parsing', detail: `Парсинг объявлений...`, found: 0, created: 0, duplicates: 0 });

    // Отправляем сообщение content script
    const response = await chrome.tabs.sendMessage(tab.id!, { action: 'parseListings' });

    if (!response?.success) {
      throw new Error(response?.error || 'Ошибка парсинга');
    }

    const listings: ParsedListing[] = response.listings || [];
    const found = listings.length;

    onProgress?.({ stage: 'saving', detail: `Найдено ${found}. Сохранение...`, found, created: 0, duplicates: 0 });

    // Создаём клиентов из спарсенных данных
    const now = new Date().toISOString();
    const clients: Omit<CrmClient, 'id'>[] = listings
      .filter(l => l.name || l.phone) // Только с именем или телефоном
      .map(l => ({
        full_name: l.name || 'Без имени',
        phone: l.phone || '',
        source: sourceType as CrmClient['source'],
        source_url: l.url,
        pipeline_id: pipelineId,
        stage_id: stageId,
        ad_data: {
          address: l.address,
          price: l.price ?? undefined,
          property_type: l.rooms || undefined,
          area_total: l.area ?? undefined,
          floor: l.floor ? parseInt(l.floor.split('/')[0]) : undefined,
          floors_total: l.floor ? parseInt(l.floor.split('/')[1]) : undefined,
          url: l.url,
        },
        status: 'active' as const,
        created_at: now,
        updated_at: now,
      }));

    const result = await crmRepository.bulkInsertClients(clients);

    // Сохраняем источник парсинга
    await crmRepository.addParsingSource({
      url,
      source_type: sourceType,
      pipeline_id: pipelineId,
      stage_id: stageId,
      last_parsed_at: now,
      listings_count: found,
      created_at: now,
    });

    onProgress?.({
      stage: 'done',
      detail: `Готово: ${result.inserted} новых, ${result.duplicates} дубликатов`,
      found,
      created: result.inserted,
      duplicates: result.duplicates,
    });

    return { inserted: result.inserted, duplicates: result.duplicates, found };
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
    // Закрываем вкладку
    try {
      await chrome.tabs.remove(tab.id!);
    } catch {
      // Вкладка уже может быть закрыта
    }
  }
}

/**
 * Парсинг нескольких URL
 */
export async function parseMultipleUrls(
  urls: string[],
  pipelineId: number,
  stageId: number,
  onProgress?: (current: number, total: number, progress: ParsingProgress) => void,
): Promise<{ totalInserted: number; totalDuplicates: number; totalFound: number }> {
  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalFound = 0;

  for (let i = 0; i < urls.length; i++) {
    onProgress?.(i + 1, urls.length, {
      stage: 'opening',
      detail: `URL ${i + 1}/${urls.length}`,
      found: 0,
      created: 0,
      duplicates: 0,
    });

    try {
      const result = await parseUrl(urls[i], pipelineId, stageId, (p) => {
        onProgress?.(i + 1, urls.length, p);
      });
      totalInserted += result.inserted;
      totalDuplicates += result.duplicates;
      totalFound += result.found;
    } catch {
      // Продолжаем со следующим URL
    }

    // Пауза между запросами
    if (i < urls.length - 1) {
      await sleep(3000);
    }
  }

  return { totalInserted, totalDuplicates, totalFound };
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
