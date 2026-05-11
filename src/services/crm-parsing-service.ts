/**
 * Сервис парсинга объявлений CIAN/Авито для CRM
 * Открывает URL в видимой вкладке, делегирует парсинг в background service worker
 * (chrome.scripting доступен только в service worker)
 * Получает данные и создаёт лиды в IndexedDB
 *
 * CIAN:  пагинация по страницам (p=1, p=2, ...), на каждой странице ~28 карточек
 * Avito: одна страница с прокруткой панели, карточки подгружаются lazy-loading
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

// ─── Helpers для связи с service worker ─────────────────────────────

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

async function executeParser(tabId: number, sourceType: 'cian' | 'avito'): Promise<ParsedListing[]> {
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

async function getAvitoApiUrl(tabId: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_AVITO_API_URL', tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка получения API URL'));
          return;
        }
        resolve(response.url || null);
      },
    );
  });
}

interface AvitoApiPage {
  totalCount: number;
  items: any[];
}

async function fetchAvitoApiPage(tabId: number, apiUrl: string, page: number, limit: number = 50): Promise<AvitoApiPage> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_AVITO_API_PAGE', tabId, apiUrl, page, limit },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Ошибка API запроса'));
          return;
        }
        resolve({ totalCount: response.totalCount || 0, items: response.items || [] });
      },
    );
  });
}

/** Конвертация данных API Авито в ParsedListing */
function avitoItemToParsedListing(item: any): ParsedListing {
  const title = item.title || '';
  const roomsMatch = title.match(/(\d+[+-]?к(?:омн)?\.?|студия)/i);
  const areaMatch = title.match(/(\d+[,.]?\d*)\s*м²/);
  const floorMatch = title.match(/(\d+)\s*\/\s*(\d+)\s*эт/);

  return {
    name: '',
    phones: [],
    address: item.addressDetailed?.locationName || item.location?.name || '',
    price: item.priceDetailed?.value || null,
    url: item.urlPath ? 'https://www.avito.ru' + item.urlPath : '',
    seller_type: item.type || '',
    rooms: roomsMatch ? roomsMatch[1] : '',
    area: areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null,
    floor: floorMatch ? `${floorMatch[1]}/${floorMatch[2]}` : '',
  };
}

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

// ─── Сохранение лидов (общее) ───────────────────────────────────────

async function saveListings(
  listings: ParsedListing[],
  source: CrmParsingSource,
  knownUrls: Set<string>,
  now: string,
): Promise<{ newCount: number; skippedCount: number }> {
  let newCount = 0;
  let skippedCount = 0;

  for (const l of listings) {
    if (!l.url && !l.name && (!l.phones || l.phones.length === 0)) {
      skippedCount++;
      continue;
    }
    if (l.url && knownUrls.has(normalizeUrl(l.url))) {
      skippedCount++;
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
    newCount++;
  }

  return { newCount, skippedCount };
}

// ─── Авито: одна страница, прокрутка ────────────────────────────────

/**
 * Парсинг Авито — одна страница с прокруткой панели.
 * 1. Открыть URL
 * 2. Применить фильтр продавцов (Частные)
 * 3. Прокрутить панель для подгрузки всех карточек
 * 4. Спарсить все карточки
 * 5. Сохранить новые лиды
 */
async function parseAvitoSource(
  source: CrmParsingSource,
  onProgress?: ProgressCallback,
): Promise<{ newLeads: number; skipped: number; found: number }> {
  onProgress?.({ stage: 'opening', detail: 'Открытие АВИТО...', found: 0, created: 0, duplicates: 0 });

  const knownUrls = await crmRepository.getKnownLeadUrls();
  const now = new Date().toISOString();
  let totalFound = 0;
  let totalNew = 0;
  let totalSkipped = 0;
  const pg = () => ({ found: totalFound, created: totalNew, duplicates: totalSkipped });

  // Открываем отдельное окно для парсинга.
  const prevWindow = await chrome.windows.getCurrent();
  const win = await chrome.windows.create({ url: source.url, focused: true, width: 1024, height: 768 });
  const tabId = win.tabs![0].id!;
  const winId = win.id!;
  if (prevWindow.id) {
    await chrome.windows.update(prevWindow.id, { focused: true }).catch(() => {});
  }

  try {
    // Ждём загрузки страницы (Avito делает первый API-запрос при загрузке)
    await waitForTabLoad(tabId);
    await sleep(3000);

    // Получаем API URL из performance entries страницы (первый запрос при загрузке)
    onProgress?.({ stage: 'parsing', detail: 'Поиск API Авито...', ...pg() });
    let apiUrl = await getAvitoApiUrl(tabId);

    // Если source URL содержит фильтр "Частные" (user=1),
    // добавляем его в API URL — Avito использует параметр user=1
    const needPrivateFilter = /[?&]user=1(&|$)/.test(source.url);
    if (apiUrl && needPrivateFilter && !apiUrl.includes('user=')) {
      try {
        const u = new URL(apiUrl);
        u.searchParams.set('user', '1');
        // params[178133] конфликтует с user=1 — убираем
        u.searchParams.delete('params[178133]');
        apiUrl = u.href;
      } catch { /* ignore URL parse errors */ }
    }

    // Если API URL не найден (не on-map страница) — фолбэк на фильтр + скролл
    if (!apiUrl) {
      onProgress?.({ stage: 'parsing', detail: 'API не найден, применяется фильтр и прокрутка...', ...pg() });

      // Применяем фильтр «Частные» через UI (до 3 попыток)
      if (needPrivateFilter) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await reapplyAvitoFilter(tabId);
          } catch { /* страница могла навигировать */ }
          await waitForTabLoad(tabId);
          await sleep(3000);
          try {
            const check = await checkAvitoFilter(tabId);
            if (check.applied) break;
            if (attempt < 2) await sleep(2000);
          } catch { break; }
        }
      }

      await scrollAvitoList(tabId);
      const listings = await executeParser(tabId, 'avito');
      totalFound = listings.length;

      onProgress?.({ stage: 'saving', detail: `Найдено ${totalFound} объявлений. Проверка...`, ...pg() });
      const { newCount, skippedCount } = await saveListings(listings, source, knownUrls, now);
      totalNew = newCount;
      totalSkipped = skippedCount;
    } else {
      // === API-подход: быстрая пагинация ===
      // Первый запрос — получаем totalCount
      const firstPage = await fetchAvitoApiPage(tabId, apiUrl, 1, 50);
      const totalCount = firstPage.totalCount;
      const totalPages = Math.ceil(totalCount / 50);

      onProgress?.({ stage: 'parsing', detail: `Найдено ${totalCount} объявлений. Страниц: ${totalPages}. Загрузка...`, ...pg() });

      // Обрабатываем первую страницу
      const firstListings = firstPage.items.map(avitoItemToParsedListing);
      totalFound = firstListings.length;
      onProgress?.({ stage: 'saving', detail: `Стр. 1/${totalPages}: ${firstListings.length} объявлений. Проверка...`, ...pg() });
      const { newCount, skippedCount } = await saveListings(firstListings, source, knownUrls, now);
      totalNew += newCount;
      totalSkipped += skippedCount;

      // Остальные страницы
      for (let page = 2; page <= totalPages; page++) {
        onProgress?.({ stage: 'parsing', detail: `Загрузка стр. ${page}/${totalPages}... (${totalFound}/${totalCount})`, ...pg() });
        const pageData = await fetchAvitoApiPage(tabId, apiUrl, page, 50);
        const listings = pageData.items.map(avitoItemToParsedListing);
        totalFound += listings.length;

        onProgress?.({ stage: 'saving', detail: `Стр. ${page}/${totalPages}: +${listings.length} (${totalFound}/${totalCount}). Проверка...`, ...pg() });
        const result = await saveListings(listings, source, knownUrls, now);
        totalNew += result.newCount;
        totalSkipped += result.skippedCount;
      }
    }

    // Обновляем источник
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
      detail: `Готово: ${totalNew} новых лидов, ${totalSkipped} пропущено из ${totalFound}`,
      found: totalFound,
      created: totalNew,
      duplicates: totalSkipped,
    });

    window.dispatchEvent(new CustomEvent('crm-data-changed'));
    return { newLeads: totalNew, skipped: totalSkipped, found: totalFound };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[CRM] Ошибка парсинга Авито: ${errMsg}`);
    onProgress?.({
      stage: 'error',
      detail: `Ошибка: ${errMsg}. Сохранено ${totalNew} лидов.`,
      found: totalFound,
      created: totalNew,
      duplicates: totalSkipped,
    });
    throw e;
  } finally {
    try { await chrome.windows.remove(winId); } catch { /* окно уже закрыто */ }
  }
}

// ─── CIAN: пагинация по страницам ───────────────────────────────────

/**
 * Парсинг CIAN — пагинация по страницам (p=1, p=2, ...).
 * 1. Открыть первую страницу (с сортировкой по дате)
 * 2. Кликнуть телефоны → спарсить карточки → сохранить лиды
 * 3. Перейти на следующую страницу (прямой URL p=N)
 * 4. Повторять пока не: пустая страница / дубликаты / ошибка / зацикливание
 */
async function parseCianSource(
  source: CrmParsingSource,
  onProgress?: ProgressCallback,
): Promise<{ newLeads: number; skipped: number; found: number }> {
  onProgress?.({ stage: 'opening', detail: 'Открытие CIAN...', found: 0, created: 0, duplicates: 0 });

  // Добавляем сортировку по дате (сначала новые) для оптимизации повторного парсинга
  let startUrl = source.url;
  if (!startUrl.includes('sort=')) {
    const sep = startUrl.includes('?') ? '&' : '?';
    startUrl += sep + 'sort=creation_date_desc';
  }

  // Базовый URL для пагинации (без параметра p)
  let cianBasePageUrl = '';
  try {
    const u = new URL(startUrl);
    u.searchParams.delete('p');
    cianBasePageUrl = u.href;
  } catch {
    cianBasePageUrl = startUrl.replace(/[&?]p=\d+/, '');
  }

  const knownUrls = await crmRepository.getKnownLeadUrls();
  const sessionUrls = new Set<string>(); // для детекции зацикливания
  const now = new Date().toISOString();
  const totalFound = { value: 0 };
  const totalNew = { value: 0 };
  const totalSkipped = { value: 0 };
  let pageNum = 0;
  let emptyPages = 0;
  let consecutiveErrors = 0;
  const MAX_ERRORS = 3;

  let currentUrl: string | null = startUrl;
  let lastNavigatedUrl: string | null = startUrl;

  const pg = () => ({ found: totalFound.value, created: totalNew.value, duplicates: totalSkipped.value });

  // CIAN блокирует скрытые вкладки (капча) — открываем отдельное окно
  const prevWindow = await chrome.windows.getCurrent();
  const win = await chrome.windows.create({ url: currentUrl, focused: true, width: 1024, height: 768 });
  const tabId = win.tabs![0].id!;
  const winId = win.id!;
  if (prevWindow.id) {
    await chrome.windows.update(prevWindow.id, { focused: true }).catch(() => {});
  }

  try {
    while (currentUrl) {
      pageNum++;
      const prevNewCount = totalNew.value;

      // ── Навигация + загрузка страницы ──
      let pageLoaded = false;
      for (let navAttempt = 0; navAttempt <= 1; navAttempt++) {
        try {
          if (pageNum > 1) {
            onProgress?.({ stage: 'opening', detail: `Страница ${pageNum}...${navAttempt > 0 ? ' (повтор)' : ''}`, ...pg() });
            await chrome.tabs.update(tabId, { url: currentUrl });
          }
          await waitForTabLoad(tabId);
          await sleep(6000);
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
            currentUrl = cianBasePageUrl + (cianBasePageUrl.includes('?') ? '&' : '?') + 'p=' + (pageNum + 1);
            continue;
          }
        }
      }

      // ── Парсинг страницы (с ретраями) ──
      let listings: ParsedListing[] = [];
      let parsed = false;

      for (let parseAttempt = 0; parseAttempt <= 1; parseAttempt++) {
        try {
          // Кликаем телефоны → ждём → парсим
          await clickPhoneButtons(tabId);
          await sleep(1500);

          listings = await executeParser(tabId, 'cian');
          totalFound.value += listings.length;
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
            currentUrl = cianBasePageUrl + (cianBasePageUrl.includes('?') ? '&' : '?') + 'p=' + (pageNum + 1);
            break;
          }
        }
      }

      if (!parsed) continue;
      if (!currentUrl) break;

      // ── Сохранение лидов ──
      onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: найдено ${listings.length}. Проверка...`, ...pg() });
      const { newCount, skippedCount } = await saveListings(listings, source, knownUrls, now);
      totalNew.value += newCount;
      totalSkipped.value += skippedCount;

      // ── Проверки остановки ──

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

      // Детекция зацикливания: все URL уже были в этой сессии
      if (listings.length > 0 && pageNum > 1) {
        const currentUrls = listings.filter(l => l.url).map(l => normalizeUrl(l.url!));
        if (currentUrls.length > 0 && currentUrls.every(u => sessionUrls.has(u))) {
          onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: все объявления уже были на предыдущих страницах — достигнута последняя страница`, ...pg() });
          break;
        }
      }

      // Нет новых лидов (CIAN отсортирован по дате — значит дальше новых нет)
      if (pageNum > 1 && totalNew.value === prevNewCount) {
        onProgress?.({ stage: 'saving', detail: `Стр. ${pageNum}: новых лидов не найдено — остановка`, ...pg() });
        break;
      }

      // Добавляем URL текущей страницы в сессионный набор
      for (const l of listings) {
        if (l.url) sessionUrls.add(normalizeUrl(l.url));
      }

      // ── Пагинация ──
      if (listings.length === 0) {
        currentUrl = null;
      } else {
        const nextUrl = cianBasePageUrl + (cianBasePageUrl.includes('?') ? '&' : '?') + 'p=' + (pageNum + 1);
        if (nextUrl === lastNavigatedUrl) {
          currentUrl = null;
        } else {
          lastNavigatedUrl = currentUrl;
          currentUrl = nextUrl;
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

    window.dispatchEvent(new CustomEvent('crm-data-changed'));
    return { newLeads: totalNew.value, skipped: totalSkipped.value, found: totalFound.value };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[CRM] Фатальная ошибка CIAN на стр. ${pageNum}: ${errMsg}`);
    onProgress?.({
      stage: 'error',
      detail: `Ошибка на стр. ${pageNum}: ${errMsg}. Сохранено ${totalNew.value} лидов.`,
      found: totalFound.value,
      created: totalNew.value,
      duplicates: totalSkipped.value,
    });
    throw e;
  } finally {
    try { await chrome.windows.remove(winId); } catch { /* окно уже закрыто */ }
  }
}

// ─── Единая точка входа ─────────────────────────────────────────────

export async function parseSourceForLeads(
  source: CrmParsingSource,
  onProgress?: ProgressCallback,
): Promise<{ newLeads: number; skipped: number; found: number }> {
  if (source.source_type === 'avito') {
    return parseAvitoSource(source, onProgress);
  }
  return parseCianSource(source, onProgress);
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

// ─── Утилиты ────────────────────────────────────────────────────────

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(poll);
      reject(new Error('Таймаут загрузки страницы'));
    }, 30000);

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
