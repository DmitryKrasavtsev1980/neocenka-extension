/**
 * Сервис парсинга объявлений CIAN/Авито для CRM
 * Открывает URL в скрытой вкладке, отправляет сообщение content script,
 * получает данные и создаёт лиды в IndexedDB
 */

import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmParsingSource } from '@/types';

export interface ParsedListing {
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

export function detectSourceType(url: string): 'cian' | 'avito' {
  if (url.includes('cian.ru')) return 'cian';
  if (url.includes('avito.ru')) return 'avito';
  throw new Error('Неподдерживаемый источник. Используйте ссылку на cian.ru или avito.ru');
}

/**
 * Парсинг одного источника — создаёт ЛИДЫ из новых объявлений
 * Сравнивает с уже известными лидами по URL объявления
 */
export async function parseSourceForLeads(
  source: CrmParsingSource,
  onProgress?: ProgressCallback,
): Promise<{ newLeads: number; skipped: number; found: number }> {
  onProgress?.({ stage: 'opening', detail: `Открытие ${source.source_type.toUpperCase()}...`, found: 0, created: 0, duplicates: 0 });

  const tab = await chrome.tabs.create({ url: source.url, active: false });

  try {
    await waitForTabLoad(tab.id!);
    await sleep(3000); // больше времени на динамический контент

    onProgress?.({ stage: 'parsing', detail: `Парсинг объявлений...`, found: 0, created: 0, duplicates: 0 });

    const response = await chrome.tabs.sendMessage(tab.id!, { action: 'parseListings' });

    if (!response?.success) {
      throw new Error(response?.error || 'Content script не ответил');
    }

    const listings: ParsedListing[] = response.listings || [];
    const found = listings.length;

    onProgress?.({ stage: 'saving', detail: `Найдено ${found}. Проверка дубликатов...`, found, created: 0, duplicates: 0 });

    // Получаем все известные URL лидов — для быстрой проверки
    const knownUrls = await crmRepository.getKnownLeadUrls();

    const now = new Date().toISOString();
    let newLeads = 0;
    let skipped = 0;

    for (const l of listings) {
      // Пропускаем без имени и телефона
      if (!l.name && !l.phone) {
        skipped++;
        continue;
      }

      // Проверяем, было ли уже такое объявление
      if (l.url && knownUrls.has(l.url)) {
        skipped++;
        continue;
      }

      // Создаём лид
      await crmRepository.addLead({
        source: source.source_type,
        source_url: l.url || undefined,
        contact_name: l.name || 'Без имени',
        contact_phone: l.phone || '',
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

      // Добавляем в knownUrls чтобы не создать дубликат из этого же пакета
      if (l.url) knownUrls.add(l.url);
      newLeads++;
    }

    // Обновляем источник парсинга
    if (source.id) {
      await crmRepository.updateParsingSource(source.id, {
        last_parsed_at: now,
        listings_count: (source.listings_count || 0) + newLeads,
      });
    } else {
      await crmRepository.addParsingSource({
        url: source.url,
        source_type: source.source_type,
        pipeline_id: source.pipeline_id,
        stage_id: source.stage_id,
        last_parsed_at: now,
        listings_count: newLeads,
        created_at: now,
      });
    }

    onProgress?.({
      stage: 'done',
      detail: `Готово: ${newLeads} новых лидов, ${skipped} пропущено`,
      found,
      created: newLeads,
      duplicates: skipped,
    });

    return { newLeads, skipped, found };
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
 * Старый API — для обратной совместимости с CrmDealsPage
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
