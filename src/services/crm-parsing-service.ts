/**
 * Сервис парсинга объявлений CIAN/Авито для CRM
 * Открывает URL в скрытой вкладке, делегирует парсинг в background service worker
 * (chrome.scripting доступен только в service worker)
 * Получает данные и создаёт лиды в IndexedDB
 */

import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmParsingSource } from '@/types';

/** Нормализация URL — убираем query-параметры и хеш для сравнения дубликатов */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

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
 * Переустанавливает фильтр продавцов на Авито (кликает Неважно → Частные → Показать)
 */
async function reapplyAvitoFilter(tabId: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'REAPPLY_AVITO_FILTERS', tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка переустановки фильтра'));
          return;
        }
        resolve(response.applied || false);
      },
    );
  });
}

/**
 * Проверяет что фильтр продавцов сработал на Авито
 */
async function checkAvitoFilter(tabId: number): Promise<{ applied: boolean; cardCount: number }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CHECK_AVITO_FILTER', tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка проверки фильтра'));
          return;
        }
        resolve({ applied: response.applied || false, cardCount: response.cardCount || 0 });
      },
    );
  });
}

/**
 * Прокручивает панель Авито для подгрузки всех карточек (on-map вид)
 */
async function scrollAvitoList(tabId: number): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SCROLL_AVITO_LIST', tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка прокрутки'));
          return;
        }
        resolve(response.loaded || 0);
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

  // Для Авито — переустанавливаем фильтр продавцов и прокручиваем панель
  if (sourceType === 'avito') {
    // Переустановка фильтра с проверкой (до 3 попыток)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await reapplyAvitoFilter(tabId);
      } catch { /* страница могла навигировать — это нормально */ }
      // После клика «Показать» страница навигирует — ждём загрузки
      await waitForTabLoad(tabId);
      await sleep(3000);

      // Проверяем что фильтр сработал (URL содержит user=1)
      try {
        const check = await checkAvitoFilter(tabId);
        if (check.applied) break; // фильтр сработал
        if (attempt < 2) {
          // Фильтр не сработал — пробуем ещё раз
          await sleep(2000);
        }
      } catch {
        // Не удалось проверить — продолжаем парсинг
        break;
      }
    }
    await scrollAvitoList(tabId);
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
 * Парсинг одной страницы: навигация → клик телефонов → парсинг → сохранение лидов
 * Возвращает кол-во найденных/созданных/пропущенных на этой странице
 */
async function processOnePage(
  tabId: number,
  sourceType: 'cian' | 'avito',
  source: CrmParsingSource,
  knownUrls: Set<string>,
  now: string,
  pageNum: number,
  onProgress?: ProgressCallback,
  totalFound?: { value: number },
  totalNew?: { value: number },
  totalSkipped?: { value: number },
): Promise<{ listings: ParsedListing[]; newOnPage: number; skippedOnPage: number }> {
  const tf = totalFound || { value: 0 };
  const tn = totalNew || { value: 0 };
  const ts = totalSkipped || { value: 0 };

  onProgress?.({ stage: 'parsing', detail: `Парсинг страницы ${pageNum}...`, found: tf.value, created: tn.value, duplicates: ts.value });

  const listings = await injectParser(tabId, sourceType);
  tf.value += listings.length;

  let newOnPage = 0;
  let skippedOnPage = 0;

  onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: найдено ${listings.length}. Всего ${tf.value}. Проверка...`, found: tf.value, created: tn.value, duplicates: ts.value });

  for (const l of listings) {
    if (!l.url && !l.name && (!l.phones || l.phones.length === 0)) {
      skippedOnPage++;
      continue;
    }
    if (l.url && knownUrls.has(normalizeUrl(l.url))) {
      skippedOnPage++;
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

    if (l.url) knownUrls.add(normalizeUrl(l.url));
    newOnPage++;
  }

  tn.value += newOnPage;
  ts.value += skippedOnPage;

  return { listings, newOnPage, skippedOnPage };
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

  // Для CIAN: подготавливаем базовый URL для пагинации (без параметра p)
  let cianBasePageUrl = '';
  if (source.source_type === 'cian') {
    try {
      const u = new URL(startUrl);
      u.searchParams.delete('p');
      cianBasePageUrl = u.href;
    } catch {
      cianBasePageUrl = startUrl.replace(/[&?]p=\d+/, '');
    }
  }

  // Получаем все известные URL лидов — для быстрой проверки дубликатов
  const knownUrls = await crmRepository.getKnownLeadUrls();
  // URL текущей сессии парсинга — для детекции зацикливания (CIAN показывает первую страницу после последней)
  const sessionUrls = new Set<string>();
  const now = new Date().toISOString();
  const totalFound = { value: 0 };
  const totalNew = { value: 0 };
  const totalSkipped = { value: 0 };
  let pageNum = 0;
  let emptyPages = 0;
  let consecutiveErrors = 0;
  const MAX_ERRORS = 3;

  let currentUrl: string | null = startUrl;
  let lastNavigatedUrl: string | null = null;
  // CIAN блокирует скрытые вкладки (капча) — открываем видимую
  const tab = await chrome.tabs.create({ url: currentUrl, active: true });
  lastNavigatedUrl = startUrl;

  const pg = () => ({ found: totalFound.value, created: totalNew.value, duplicates: totalSkipped.value });

  try {
    while (currentUrl) {
      pageNum++;

      // Навигация + загрузка страницы (с ретраями)
      let pageLoaded = false;
      for (let navAttempt = 0; navAttempt <= 1; navAttempt++) {
        try {
          if (pageNum > 1) {
            onProgress?.({ stage: 'opening', detail: `Страница ${pageNum}...${navAttempt > 0 ? ' (повтор)' : ''}`, ...pg() });
            await chrome.tabs.update(tab.id!, { url: currentUrl });
            await waitForTabLoad(tab.id!);
            await sleep(source.source_type === 'cian' ? 6000 : 3000);
          } else {
            await waitForTabLoad(tab.id!);
            await sleep(source.source_type === 'cian' ? 6000 : 3000);
          }
          pageLoaded = true;
          break;
        } catch (navErr) {
          const errMsg = navErr instanceof Error ? navErr.message : String(navErr);
          console.warn(`[CRM] Ошибка загрузки стр. ${pageNum} (попытка ${navAttempt + 1}): ${errMsg}`);
          if (navAttempt === 0) {
            onProgress?.({ stage: 'opening', detail: `Стр. ${pageNum}: ошибка загрузки, повтор через 5с...`, ...pg() });
            await sleep(5000);
          } else {
            onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: не загрузилась (${errMsg}). Пропуск.`, ...pg() });
            // Конструируем URL следующей страницы и продолжаем
            currentUrl = source.source_type === 'cian'
              ? cianBasePageUrl + (cianBasePageUrl.includes('?') ? '&' : '?') + 'p=' + (pageNum + 1)
              : null;
            if (source.source_type !== 'cian') break;
            continue;
          }
        }
      }
      if (!pageLoaded && source.source_type !== 'cian') break;

      // Парсинг страницы (с ретраями)
      let listings: ParsedListing[] = [];
      let parsed = false;
      const prevNewCount = totalNew.value;
      for (let parseAttempt = 0; parseAttempt <= 1; parseAttempt++) {
        try {
          const result = await processOnePage(
            tab.id!, source.source_type, source, knownUrls, now, pageNum, onProgress,
            totalFound, totalNew, totalSkipped,
          );
          listings = result.listings;
          parsed = true;
          consecutiveErrors = 0;
          break;
        } catch (parseErr) {
          const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          console.warn(`[CRM] Ошибка парсинга стр. ${pageNum} (попытка ${parseAttempt + 1}): ${errMsg}`);
          if (parseAttempt === 0) {
            onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: ошибка парсинга, повтор через 5с... (${errMsg})`, ...pg() });
            await sleep(5000);
          } else {
            consecutiveErrors++;
            onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: ошибка — ${errMsg}. Пропуск (${consecutiveErrors}/${MAX_ERRORS}).`, ...pg() });
            if (consecutiveErrors >= MAX_ERRORS) {
              onProgress?.({ stage: 'saving', detail: `${consecutiveErrors} страниц подряд с ошибками — остановка`, ...pg() });
              currentUrl = null;
              break;
            }
            // Конструируем URL следующей страницы и продолжаем
            if (source.source_type === 'cian') {
              currentUrl = cianBasePageUrl + (cianBasePageUrl.includes('?') ? '&' : '?') + 'p=' + (pageNum + 1);
            } else {
              try {
                currentUrl = await getNextPageUrl(tab.id!);
              } catch { currentUrl = null; }
            }
            break;
          }
        }
      }

      if (!parsed) continue; // ошибка — переходим к следующей странице
      if (!currentUrl) break; // остановка по лимиту ошибок

      // Пустая страница (капча/антибот)
      if (listings.length === 0) {
        emptyPages++;
        if (emptyPages >= 2) {
          onProgress?.({ stage: 'saving', detail: `Страница ${pageNum} пустая — остановка`, ...pg() });
          break;
        }
      } else {
        emptyPages = 0;
      }

      // Детекция зацикливания: проверяем ДО добавления URL текущей страницы
      // Если ВСЕ URL с этой страницы уже были на предыдущих страницах сессии → конец
      if (listings.length > 0 && pageNum > 1) {
        const currentUrls = listings.filter(l => l.url).map(l => normalizeUrl(l.url!));
        if (currentUrls.length > 0 && currentUrls.every(u => sessionUrls.has(u))) {
          onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: все объявления уже были на предыдущих страницах — достигнута последняя страница`, ...pg() });
          currentUrl = null;
          break;
        }
      }

      // Если на странице не было новых лидов (все дубликаты из БД) — останавливаемся
      if (pageNum > 1 && totalNew.value === prevNewCount) {
        onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: новых лидов не найдено — остановка`, ...pg() });
        currentUrl = null;
        break;
      }

      // Теперь добавляем URL текущей страницы в сессионный набор
      for (const l of listings) {
        if (l.url) sessionUrls.add(normalizeUrl(l.url));
      }

      // Пагинация
      if (source.source_type === 'cian') {
        if (listings.length === 0) {
          currentUrl = null;
        } else {
          const nextP = pageNum + 1;
          const nextUrl = cianBasePageUrl + (cianBasePageUrl.includes('?') ? '&' : '?') + 'p=' + nextP;
          // Защита от зацикливания: если следующий URL совпадает с предыдущим
          if (nextUrl === lastNavigatedUrl) {
            currentUrl = null;
          } else {
            lastNavigatedUrl = currentUrl;
            currentUrl = nextUrl;
          }
        }
      } else {
        try {
          const nextUrl = await getNextPageUrl(tab.id!);
          // Авито: если getNextPageUrl вернул тот же URL или null — конец
          if (!nextUrl || nextUrl === currentUrl || nextUrl === lastNavigatedUrl) {
            currentUrl = null;
          } else {
            lastNavigatedUrl = currentUrl;
            currentUrl = nextUrl;
          }
        } catch (e) {
          console.warn(`[CRM] Ошибка получения URL следующей страницы: ${e instanceof Error ? e.message : String(e)}`);
          currentUrl = null;
        }
      }
    }

    // Обновляем источник парсинга
    if (source.id) {
      await crmRepository.updateParsingSource(source.id, {
        last_parsed_at: now,
        listings_count: (source.listings_count || 0) + totalNew.value,
      });
    } else {
      await crmRepository.addParsingSource({
        url: source.url,
        source_type: source.source_type,
        pipeline_id: source.pipeline_id,
        stage_id: source.stage_id,
        last_parsed_at: now,
        listings_count: totalNew.value,
        created_at: now,
      });
    }

    onProgress?.({
      stage: 'done',
      detail: `Готово: ${totalNew.value} новых лидов, ${totalSkipped.value} пропущено из ${totalFound.value} на ${pageNum} стр.`,
      found: totalFound.value,
      created: totalNew.value,
      duplicates: totalSkipped.value,
    });

    // Уведомляем об изменении CRM данных (для обновления счётчиков в меню)
    window.dispatchEvent(new CustomEvent('crm-data-changed'));

    return { newLeads: totalNew.value, skipped: totalSkipped.value, found: totalFound.value };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[CRM] Фатальная ошибка на стр. ${pageNum}: ${errMsg}`);
    onProgress?.({
      stage: 'error',
      detail: `Ошибка на стр. ${pageNum}: ${errMsg}. Сохранено ${totalNew.value} лидов.`,
      found: totalFound.value,
      created: totalNew.value,
      duplicates: totalSkipped.value,
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
      clearInterval(poll);
      reject(new Error('Таймаут загрузки страницы'));
    }, 30000);

    // Poll tab status instead of event listener — avoids race condition
    // when page has already loaded before listener is registered
    const poll = setInterval(() => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          clearTimeout(timeout);
          clearInterval(poll);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (tab.status === 'complete') {
          clearTimeout(timeout);
          clearInterval(poll);
          resolve();
        }
      });
    }, 500);
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
