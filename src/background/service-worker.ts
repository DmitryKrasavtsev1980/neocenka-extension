/**
 * Service Worker для Chrome Extension
 * Обрабатывает chrome.scripting.executeScript вызовы от UI-страниц
 */

// Установка / обновление расширения
chrome.runtime.onInstalled.addListener((details) => {
  const version = chrome.runtime.getManifest().version;

  if (details.reason === 'install') {
    console.log('Расширение установлено, версия', version);
  } else if (details.reason === 'update') {
    const prevVersion = details.previousVersion || '?';
    console.log(`Расширение обновлено: ${prevVersion} → ${version}`);
  }
});

// ============================================================
// Функции парсинга — injectируются в страницу через executeScript
// ============================================================

interface ParsedListing {
  name: string;
  phones: string[];
  address: string;
  price: number | null;
  url: string;
  seller_type: string;
  rooms: string;
  area: number | null;
  floor: string;
}

// Фаза 1: кликаем все кнопки телефонов для раскрытия номеров
function clickCianPhones(): number {
  let clicked = 0;
  const cards = document.querySelectorAll('article[data-name="CardComponent"]');
  cards.forEach(card => {
    try {
      const phoneBtn = card.querySelector('[data-mark="PhoneButton"]') as HTMLButtonElement;
      if (phoneBtn && phoneBtn.textContent?.includes('...')) {
        phoneBtn.click();
        clicked++;
      }
    } catch { /* skip */ }
  });
  return clicked;
}

// Фаза 2: парсинг данных (вызывается после задержки)
function parseCianPage(): ParsedListing[] {
  const results: ParsedListing[] = [];
  const cards = document.querySelectorAll('article[data-name="CardComponent"]');
  cards.forEach(card => {
    try {
      const titleLink = card.querySelector('[data-name="TitleComponent"]') as HTMLAnchorElement
        || card.querySelector('a[href*="/sale/"]') as HTMLAnchorElement
        || card.querySelector('a[href*="/rent/"]') as HTMLAnchorElement;
      const url = titleLink?.href || '';

      const titleEl = card.querySelector('[data-mark="OfferTitle"]');
      const subtitleEl = card.querySelector('[data-mark="OfferSubtitle"]');
      const titleText = titleEl?.textContent?.trim() || '';
      const subtitleText = subtitleEl?.textContent?.trim() || '';

      const geoLabels = card.querySelectorAll('[data-name="GeoLabel"]');
      const addressParts: string[] = [];
      geoLabels.forEach(el => addressParts.push(el.textContent.trim()));
      const address = addressParts.join(', ');

      const priceEl = card.querySelector('[data-mark="MainPrice"]');
      const priceText = priceEl?.textContent?.replace(/\s/g, '').replace(/[^\d]/g, '') || '';
      const price = priceText ? parseInt(priceText, 10) : null;

      const branding = card.querySelector('[data-name="BrandingLevelWrapper"]');
      const sellerText = branding?.textContent?.trim() || '';
      const sellerType = sellerText.includes('Собственник') ? 'owner' : 'agent';

      const areaMatch = subtitleText.match(/(\d+[,.]?\d*)\s*м²/);
      const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null;

      const roomsMatch = titleText.match(/(\d+[+-]?к(?:омн)?\.?|студия)/i);
      const rooms = roomsMatch ? roomsMatch[1] : '';

      const floorMatch = subtitleText.match(/(\d+)\s*\/\s*(\d+)\s*эт/);
      const floor = floorMatch ? `${floorMatch[1]}/${floorMatch[2]}` : '';

      // Телефон: после клика номера появляются как plain text
      // Собираем ВСЕ номера (может быть несколько)
      const phones: string[] = [];
      const allText = card.querySelectorAll('span, a, p, div');
      for (const el of allText) {
        const t = el.textContent?.trim() || '';
        const phoneMatch = t.match(/^\+?\d[\d\s\-()]{9,}$/);
        if (phoneMatch && !t.includes('...') && t.length >= 10) {
          const cleaned = t.replace(/[^\d+]/g, '');
          if (!phones.includes(cleaned)) {
            phones.push(cleaned);
          }
        }
      }
      // Fallback: если не нашли раскрытые номера, берём из кнопки
      if (phones.length === 0) {
        const phoneEl = card.querySelector('[data-mark="PhoneButton"]');
        const phoneText = phoneEl?.textContent?.trim() || '';
        if (phoneText) phones.push(phoneText.replace(/[^\d+]/g, ''));
      }
      const name = sellerText.includes('Собственник') ? 'Собственник' : '';

      results.push({ name, phones, address, price, url, seller_type: sellerType, rooms, area, floor });
    } catch { /* skip */ }
  });
  return results;
}

function parseAvitoPage(): ParsedListing[] {
  const results: ParsedListing[] = [];
  // Карточки: на карте — itemprop="Product", в списке — data-marker="item"
  const cards = document.querySelectorAll(
    '[itemtype="http://schema.org/Product"], [data-marker="item"]'
  );
  cards.forEach(card => {
    try {
      // Заголовок и ссылка: data-marker="title" — надёжный селектор
      const titleLink = card.querySelector('[data-marker="title"]') as HTMLAnchorElement
        || card.querySelector('[data-marker="item-title"] a') as HTMLAnchorElement
        || card.querySelector('a[itemprop="url"]') as HTMLAnchorElement;
      const url = titleLink?.href || '';
      const titleText = titleLink?.textContent?.trim() || '';

      if (!url) return;

      // Адрес: data-marker="item-location" (карта) или item-address (список)
      const locationEl = card.querySelector('[data-marker="item-location"]')
        || card.querySelector('[data-marker="item-address"]');
      let address = '';
      if (locationEl) {
        const paragraphs = locationEl.querySelectorAll('p');
        if (paragraphs.length > 0) {
          address = [...paragraphs].map(p => p.textContent?.trim()).filter(Boolean).join(', ');
        } else {
          address = locationEl.textContent?.trim() || '';
        }
      }

      // Цена: itemprop="price" content="9997000" — самое надёжное
      const priceMeta = card.querySelector('[itemprop="price"]');
      const priceContent = priceMeta?.getAttribute('content') || '';
      let price: number | null = null;
      if (priceContent) {
        price = parseInt(priceContent, 10);
      } else {
        const priceEl = card.querySelector('[data-marker="item-price"], [class*="price"]');
        const priceText = priceEl?.textContent?.replace(/\s/g, '').replace(/[^\d]/g, '') || '';
        price = priceText ? parseInt(priceText, 10) : null;
      }

      // Имя продавца (доступно не во всех видах страницы)
      const nameEl = card.querySelector('[data-marker="seller-info/name"]');
      const name = nameEl?.textContent?.trim() || '';

      // Тип продавца (доступно не во всех видах страницы)
      const sellerLabel = card.querySelector('[data-marker="seller-info/label"]');
      const isCompany = !!card.querySelector('[class*="shop"], [class*="company"]')
        || (sellerLabel && !sellerLabel.textContent?.includes('Собственник'));
      const sellerType = isCompany ? 'agent' : 'owner';

      const roomsMatch = titleText.match(/(\d+[+-]?к(?:омн)?\.?|студия)/i);
      const rooms = roomsMatch ? roomsMatch[1] : '';

      const areaMatch = titleText.match(/(\d+[,.]?\d*)\s*м²/);
      const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null;

      const floorMatch = titleText.match(/(\d+)\s*\/\s*(\d+)\s*эт/);
      const floor = floorMatch ? `${floorMatch[1]}/${floorMatch[2]}` : '';

      // Телефон: на Авито скрыт до клика/наведения, не пытаемся извлечь
      const phones: string[] = [];

      results.push({ name, phones, address, price, url, seller_type: sellerType, rooms, area, floor });
    } catch { /* skip */ }
  });
  return results;
}

function getNextPageUrlFunc(): string | null {
  // ЦИАН: кнопка "Дальше"
  const allLinks = document.querySelectorAll('a');
  for (const a of allLinks) {
    const text = a.textContent.trim();
    if (text === 'Дальше' && a.href) {
      return a.href;
    }
  }
  // Авито: кнопка "Следующая" или ссылка с rel="next"
  const nextRel = document.querySelector('a[rel="next"]');
  if (nextRel) return (nextRel as HTMLAnchorElement).href;

  // Fallback: если на странице есть карточки, конструируем URL следующей страницы
  const hasCards = document.querySelectorAll('article[data-name="CardComponent"]').length > 0
    || document.querySelectorAll('[itemtype="http://schema.org/Product"], [data-marker="item"]').length > 0;
  if (hasCards) {
    try {
      const url = new URL(window.location.href);
      const currentPage = parseInt(url.searchParams.get('p') || '1', 10);
      url.searchParams.set('p', String(currentPage + 1));
      return url.href;
    } catch { /* ignore */ }
  }

  return null;
}

// Переустановка фильтра продавцов на Авито
// Авито «теряет» фильтр user=1 при открытии URL — нужно переселектнуть
async function reapplyAvitoSellerFilter(): Promise<boolean> {
  // Помощник: ждёт обновления текста кнопки «Показать N объявлений»
  async function waitForButtonUpdate(maxMs: number): Promise<string> {
    const btns = document.querySelectorAll('button');
    let btn: HTMLElement | null = null;
    for (const b of btns) {
      const t = b.textContent?.trim() || '';
      if (t.startsWith('Показать') && t.includes('объявл')) { btn = b as HTMLElement; break; }
    }
    if (!btn) return '';
    const before = btn.textContent?.trim() || '';
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      await new Promise(r => setTimeout(r, 200));
      const now = btn.textContent?.trim() || '';
      if (now !== before) return now;
    }
    return before;
  }

  // Помощник: ищет <label> радио-кнопок «Неважно» и «Частные»
  // ВАЖНО: кликать нужно по <label>, а не по <input> — React не реагирует на .click() на input
  function findSellerRadios(): { nevazhno: HTMLElement | null; chastnye: HTMLElement | null } {
    // Способ 1: по data-marker (самый надёжный)
    const marker0 = document.querySelector('[data-marker="user/option(0)"]');
    const marker1 = document.querySelector('[data-marker="user/option(1)"]');

    // Способ 2: fallback — по тексту в <label> с input[type="radio"]
    if (!marker0 || !marker1) {
      const radios = document.querySelectorAll('input[type="radio"]');
      let nevazhno: HTMLElement | null = null;
      let chastnye: HTMLElement | null = null;

      for (const r of radios) {
        const label = r.closest('label') || r.parentElement;
        const text = label?.textContent?.trim() || '';
        if (text === 'Неважно') nevazhno = (label || r) as HTMLElement;
        if (text === 'Частные') chastnye = (label || r) as HTMLElement;
      }
      return { nevazhno: marker0 || nevazhno, chastnye: marker1 || chastnye };
    }

    return { nevazhno: marker0 as HTMLElement, chastnye: marker1 as HTMLElement };
  }

  // 1. Проверяем открыта ли панель фильтров (ищем кнопку «Показать N объявлений»)
  const isPanelOpen = (() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      const t = b.textContent?.trim() || '';
      if (t.startsWith('Показать') && t.includes('объявл')) return true;
    }
    return false;
  })();

  if (!isPanelOpen) {
    // Кликаем кнопку «Фильтры» для открытия панели
    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const btn of allButtons) {
      if (btn.textContent?.includes('Фильтры')) {
        (btn as HTMLElement).click();
        break;
      }
    }
    // Ждём появления кнопки «Показать» (до 5 сек)
    let panelOpened = false;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent?.trim().startsWith('Показать') && b.textContent?.includes('объявл')) {
          panelOpened = true;
          break;
        }
      }
      if (panelOpened) break;
    }
    if (!panelOpened) return false;
    // Панель открылась, но радио-кнопки могут ещё рендериться — ждём
  }

  // 2. Ждём появления <label> «Неважно»/«Частные» (до 10 сек)
  // После открытия панели Авито рендерит фильтры асинхронно — кнопка «Показать»
  // появляется через ~200мс, а радио-кнопки — позже
  let sellerRadios = findSellerRadios();
  for (let i = 0; i < 50 && (!sellerRadios.nevazhno || !sellerRadios.chastnye); i++) {
    await new Promise(r => setTimeout(r, 200));
    sellerRadios = findSellerRadios();
  }

  if (!sellerRadios.chastnye) {
    return false; // не нашли «Частные»
  }

  // 3. Переключаем фильтр: Неважно → Частные
  // Кликаем по <label> (React не реагирует на .click() на <input>)
  // Сначала «Неважно», потом «Частные» — чтобы гарантированно переключить состояние
  if (sellerRadios.nevazhno) {
    sellerRadios.nevazhno.click();
    await waitForButtonUpdate(5000);
    await new Promise(r => setTimeout(r, 1000));
    // ВАЖНО: после клика React перерисовывает radio group — старые ссылки не валидны!
    sellerRadios = findSellerRadios();
  }

  sellerRadios.chastnye.click();
  await waitForButtonUpdate(8000);

  // 4. Кликаем «Показать N объявлений»
  const submitBtns = document.querySelectorAll('button');
  let submitBtn: HTMLElement | null = null;
  for (const btn of submitBtns) {
    const text = btn.textContent?.trim() || '';
    if (text.startsWith('Показать') && text.includes('объявл')) {
      submitBtn = btn as HTMLElement;
      break;
    }
  }
  if (submitBtn) {
    submitBtn.click();
    // Ждём перезагрузки результатов (навигация или DOM-обновление)
    await new Promise(r => setTimeout(r, 5000));
  }

  return !!submitBtn;
}

// Проверка что фильтр продавцов сработал на Авито
// Проверяем URL-параметр user=1 и количество карточек
function checkAvitoSellerFilter(): { applied: boolean; userParam: boolean; cardCount: number; url: string } {
  const url = window.location.href;
  const userParam = /[?&]user=1(&|$)/.test(url);
  const cardCount = document.querySelectorAll('[itemtype="http://schema.org/Product"], [data-marker="item"]').length;
  return { applied: userParam, userParam, cardCount, url };
}

// Прокрутка панели Авито (on-map) для подгрузки всех карточек
// Возвращает количество загруженных карточек
async function scrollAvitoList(maxCards?: number): Promise<number> {
  // Ищем контейнер со скроллом (левая панель с карточками на карте)
  const candidates = document.querySelectorAll('*');
  let scrollContainer: Element | null = null;
  for (const el of candidates) {
    const style = window.getComputedStyle(el);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 100) {
      scrollContainer = el;
      break;
    }
  }

  const cardSelector = '[itemtype="http://schema.org/Product"], [data-marker="item"]';
  if (!scrollContainer) return document.querySelectorAll(cardSelector).length;

  const limit = maxCards || 9999;
  const step = Math.floor(scrollContainer.clientHeight * 0.8); // 80% высоты — плавнее скролл
  let prevCount = 0;
  let stableRounds = 0;

  while (stableRounds < 15) {
    scrollContainer.scrollTop += step;
    // Даём больше времени на подгрузку lazy-loading карточек
    await new Promise(r => setTimeout(r, 3000));

    const currentCount = document.querySelectorAll(cardSelector).length;
    if (currentCount >= limit) break;

    if (currentCount === prevCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
    }
    prevCount = currentCount;

    // Если卡片数 стабильно и скролл не двигается — пробуем ещё раз с большей паузой
    const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 50;
    if (atBottom && stableRounds >= 5) break;
  }

  return document.querySelectorAll(cardSelector).length;
}

// ============================================================
// Актуализация объявления ЦИАН — парсинг карточки
// ============================================================

interface CianDetailParsed {
  status: 'active' | 'archived';
  price: number | null;
  photos: string[];
  updatedDate: string | null;     // ISO дата последнего обновления
  priceHistory: Array<{ date: string; price: number }>;
}

/** Парсинг русской даты: "25 мая 2026", "27 апр, 10:55", "вчера, 13:30" и т.д. */
function parseRussianDate(dateStr: string): Date | null {
  const now = new Date();
  const months: Record<string, number> = {
    'января': 0, 'янв': 0,
    'февраля': 1, 'фев': 1,
    'марта': 2, 'мар': 2,
    'апреля': 3, 'апр': 3,
    'мая': 4, 'май': 4,
    'июня': 5, 'июн': 5,
    'июля': 6, 'июл': 6,
    'августа': 7, 'авг': 7,
    'сентября': 8, 'сен': 8,
    'октября': 9, 'окт': 9,
    'ноября': 10, 'ноя': 10,
    'декабря': 11, 'дек': 11,
  };

  if (dateStr.startsWith('вчера')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    return d;
  }

  if (dateStr.startsWith('сегодня')) {
    const d = new Date(now);
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    return d;
  }

  // "27 апр, 10:55" или "25 мая 2026" или "25 мая"
  const parts = dateStr.match(/(\d{1,2})\s+([a-zA-Zа-яА-ЯёЁ]+)\s*(\d{4})?/);
  if (!parts) return null;

  const day = parseInt(parts[1]);
  const monthStr = parts[2].toLowerCase();
  const month = months[monthStr];
  if (month === undefined) return null;

  let year: number;
  if (parts[3]) {
    year = parseInt(parts[3]);
  } else {
    year = now.getFullYear();
    if (new Date(year, month, day) > now) year--;
  }

  const d = new Date(year, month, day);
  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
  return d;
}

/** Парсинг страницы объявления ЦИАН (инъекция через executeScript — ВСЁ внутри одной функции!) */
function parseCianDetailPage(): CianDetailParsed {
  // Вспомогательная функция парсинга русских дат — встроена внутрь,
  // потому что executeScript инъектирует только тело этой функции
  function parseRuDate(dateStr: string): Date | null {
    const now = new Date();
    const months: Record<string, number> = {
      'января': 0, 'янв': 0,
      'февраля': 1, 'фев': 1,
      'марта': 2, 'мар': 2,
      'апреля': 3, 'апр': 3,
      'мая': 4, 'май': 4,
      'июня': 5, 'июн': 5,
      'июля': 6, 'июл': 6,
      'августа': 7, 'авг': 7,
      'сентября': 8, 'сен': 8,
      'октября': 9, 'окт': 9,
      'ноября': 10, 'ноя': 10,
      'декабря': 11, 'дек': 11,
    };
    if (dateStr.startsWith('вчера')) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      const m = dateStr.match(/(\d{1,2}):(\d{2})/);
      if (m) d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
      return d;
    }
    if (dateStr.startsWith('сегодня')) {
      const d = new Date(now);
      const m = dateStr.match(/(\d{1,2}):(\d{2})/);
      if (m) d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
      return d;
    }
    // "27 апр, 10:55" или "25 мая 2026" или "25 мая"
    const parts = dateStr.match(/(\d{1,2})\s+([a-zA-Zа-яА-ЯёЁ]+)\s*(\d{4})?/);
    if (!parts) return null;
    const day = parseInt(parts[1]);
    const monthStr = parts[2].toLowerCase();
    const month = months[monthStr];
    if (month === undefined) return null;
    let year: number;
    if (parts[3]) {
      year = parseInt(parts[3]);
    } else {
      year = now.getFullYear();
      if (new Date(year, month, day) > now) year--;
    }
    const d = new Date(year, month, day);
    const tm = dateStr.match(/(\d{1,2}):(\d{2})/);
    if (tm) d.setHours(parseInt(tm[1]), parseInt(tm[2]), 0, 0);
    return d;
  }

  // Проверка что мы на странице объявления ЦИАН
  const offerCard = document.querySelector('[data-testid="price-amount"]')
    || document.querySelector('#photos')
    || document.querySelector('[data-name="OfferUnpublished"]');
  if (!offerCard) {
    // Не страница объявления — капча, 404, ошибка сервера
    const pageTitle = document.title || '';
    const bodyText = document.body?.innerText?.slice(0, 500) || '';
    if (bodyText.includes('капч') || bodyText.toLowerCase().includes('captcha')) {
      throw new Error('Страница требует прохождения капчи');
    }
    if (pageTitle.includes('404') || bodyText.includes('не найдено') || bodyText.includes('удалено')) {
      throw new Error('Объявление не найдено (404). Возможно, оно было удалено.');
    }
    throw new Error('Не удалось найти карточку объявления. Страница: ' + pageTitle);
  }

  const result: CianDetailParsed = {
    status: 'active',
    price: null,
    photos: [],
    updatedDate: null,
    priceHistory: [],
  };

  // 1. Статус: архивное или активное
  const unpublished = document.querySelector('[data-name="OfferUnpublished"]');
  if (unpublished) result.status = 'archived';

  // 2. Цена
  const priceEl = document.querySelector('[data-testid="price-amount"]');
  if (priceEl) {
    const priceText = priceEl.textContent?.replace(/\s/g, '').replace(/[^\d]/g, '') || '';
    if (priceText) result.price = parseInt(priceText, 10);
  }

  // 3. Фото — только из галереи объявления (#photos), не из "похожих объявлений"
  // Дедупликация по ID фото: /images/{ID}-{suffix}.jpg — суффиксы -1 (основное), -2 (превью)
  const galleryContainer = document.querySelector('#photos') || document.querySelector('[class*="photo_gallery_container"]');
  const imgEls = galleryContainer
    ? galleryContainer.querySelectorAll('img[src*="images.cdn-cian.ru/images/"]')
    : [];
  const seenIds = new Set<string>();
  imgEls.forEach(img => {
    const src = (img as HTMLImageElement).src;
    if (!src) return;
    const idMatch = src.match(/\/images\/(\d+)-/);
    const photoId = idMatch ? idMatch[1] : src.split('?')[0];
    if (seenIds.has(photoId)) return;
    seenIds.add(photoId);
    result.photos.push(src);
  });

  // 4. Дата обновления
  const updatedEl = document.querySelector('[data-testid="metadata-updated-date"]');
  if (updatedEl) {
    const text = updatedEl.textContent?.trim() || '';
    const dateMatch = text.match(/Обновлено:\s*(.+)/);
    if (dateMatch) {
      const d = parseRuDate(dateMatch[1].trim());
      if (d) result.updatedDate = d.toISOString();
    }
  }

  // 5. История цены из DOM
  const historyRows = document.querySelectorAll('tr[class*="history-event"]');
  historyRows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      const dateText = cells[0]?.textContent?.trim() || '';
      const priceText = cells[1]?.textContent?.replace(/\s/g, '').replace(/[^\d]/g, '') || '';
      if (dateText && priceText) {
        const price = parseInt(priceText, 10);
        if (!isNaN(price)) {
          const d = parseRuDate(dateText);
          if (d) result.priceHistory.push({ date: d.toISOString(), price });
        }
      }
    }
  });

  return result;
}

/** Получить историю цены через скрытое API ЦИАН (инъекция через executeScript) */
function fetchCianPriceHistoryApi(offerId: number): Promise<Array<{ date: string; price: number }>> {
  return fetch(
    `/price-estimator/v1/get-estimation-and-trend-web/?cianOfferId=${offerId}`,
    { credentials: 'include' }
  )
    .then(r => r.json())
    .then((data: any) => {
      const history: Array<{ date: string; price: number }> = [];
      // API возвращает priceHistory с timestamp (ms) и price
      if (data?.priceHistory && Array.isArray(data.priceHistory)) {
        for (const item of data.priceHistory) {
          if (item.date && item.price) {
            history.push({
              date: new Date(item.date).toISOString(),
              price: item.price,
            });
          }
        }
      }
      return history;
    })
    .catch(() => [] as Array<{ date: string; price: number }>);
}

/** Кликнуть кнопку раскрытия виджета истории цены */
function clickCianPriceHistoryButton(): boolean {
  // Кнопка «История цены»
  const btn = document.querySelector('[data-testid="price-history-widget"]') as HTMLElement;
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

/**
 * Быстрая проверка объявления CIAN через HTML-fetch (без навигации).
 * Вызывается через executeScript в контексте вкладки cian.ru.
 * Возвращает цену и статус из JSON-LD.
 */
function checkCianAdHtml(url: string): Promise<{ price: number | null; status: 'active' | 'archived'; error?: string }> {
  return fetch(url, { credentials: 'include' })
    .then(r => {
      if (!r.ok) {
        console.log(`[CIAN] checkHtml: ${url} → HTTP ${r.status}`);
        return { price: null, status: 'archived' as const, error: `HTTP ${r.status}` };
      }
      // Проверка редиректа: если fetch перешёл на другой URL (например, страницу поиска),
      // значит объявление снято с публикации
      const finalUrl = r.url;
      if (finalUrl !== url) {
        // CIAN URL объявления содержит /flat/ или /rent/ или /sale/ и числовой ID в конце
        const origIdMatch = url.match(/\/(\d{7,})\/?$/);
        const finalIdMatch = finalUrl.match(/\/(\d{7,})\/?$/);
        if (!origIdMatch || !finalIdMatch || origIdMatch[1] !== finalIdMatch[1]) {
          console.log(`[CIAN] checkHtml: redirect detected ${url} → ${finalUrl} → archived`);
          return { price: null as null, status: 'archived' as const, error: 'Redirect to non-ad page' };
        }
      }
      return r.text().then(html => {
        // JSON-LD — цена и базовые данные
        let price: number | null = null;
        let status: 'active' | 'archived' = 'active';

        const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
        if (ldMatch) {
          try {
            const ld = JSON.parse(ldMatch[1]);
            if (ld?.offers?.price) price = ld.offers.price;
            if (ld?.description?.includes('снято с публикации')) status = 'archived';
          } catch { /* не удалось распарсить JSON-LD */ }
        }

        // Дополнительно проверяем по HTML-маркерам
        if (html.includes('OfferUnpublished')) status = 'archived';
        // Если нет цены из JSON-LD — пробуем найти в HTML
        if (price === null) {
          const priceMatch = html.match(/"price"\s*:\s*(\d{5,})/);
          if (priceMatch) price = parseInt(priceMatch[1], 10);
        }

        console.log(`[CIAN] checkHtml: ${url} → status=${status}, price=${price}`);
        return { price, status };
      });
    })
    .catch(err => ({
      price: null as null,
      status: 'archived' as const,
      error: err instanceof Error ? err.message : String(err),
    }));
}

// ============================================================
// Актуализация объявления Авито — парсинг карточки
// ============================================================

interface AvitoDetailParsed {
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
  logs?: string[];
}

/**
 * Парсинг русской даты (встроенная копия для executeScript)
 * Форматы: "25 мая 2026", "27 апр, 10:55", "вчера, 13:30", "15 мая в 09:15"
 */
function parseRuDateAvito(dateStr: string): Date | null {
  const now = new Date();
  const months: Record<string, number> = {
    'января': 0, 'янв': 0, 'февраля': 1, 'фев': 1,
    'марта': 2, 'мар': 2, 'апреля': 3, 'апр': 3,
    'мая': 4, 'май': 4, 'июня': 5, 'июн': 5,
    'июля': 6, 'июл': 6, 'августа': 7, 'авг': 7,
    'сентября': 8, 'сен': 8, 'октября': 9, 'окт': 9,
    'ноября': 10, 'ноя': 10, 'декабря': 11, 'дек': 11,
  };
  if (dateStr.startsWith('вчера')) {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    const m = dateStr.match(/(\d{1,2}):(\d{2})/);
    if (m) d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
    return d;
  }
  if (dateStr.startsWith('сегодня')) {
    const d = new Date(now);
    const m = dateStr.match(/(\d{1,2}):(\d{2})/);
    if (m) d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
    return d;
  }
  // "15 мая в 09:15" или "27 апр, 10:55" или "25 мая 2026"
  const cleaned = dateStr.replace(/\s*в\s*/, ' ');
  const parts = cleaned.match(/(\d{1,2})\s+([a-zA-Zа-яА-ЯёЁ]+)\s*(\d{4})?/);
  if (!parts) return null;
  const day = parseInt(parts[1]);
  const month = months[parts[2].toLowerCase()];
  if (month === undefined) return null;
  let year = parts[3] ? parseInt(parts[3]) : now.getFullYear();
  if (!parts[3] && new Date(year, month, day) > now) year--;
  const d = new Date(year, month, day);
  const tm = dateStr.match(/(\d{1,2}):(\d{2})/);
  if (tm) d.setHours(parseInt(tm[1]), parseInt(tm[2]), 0, 0);
  return d;
}

/**
 * Простой инжектируемый скрипт для чтения __staticRouterHydrationData со страницы Avito.
 * Возвращает минимальный объект — только url, title, bodySnippet, metaPrice и JSON-строку данных.
 * Весь парсинг делается в service worker.
 */
function readAvitoPageData(): {
  url: string;
  title: string;
  bodySnippet: string;
  metaPrice: string | null;
  buyerItemJson: string | null;
  loaderKeys: string[];
  itemId: number | null;
  categoryId: number | null;
  microCategoryId: number | null;
} {
  const data = (window as any).__staticRouterHydrationData;
  let buyerItemJson: string | null = null;
  let loaderKeys: string[] = [];
  let itemId: number | null = null;
  let categoryId: number | null = null;
  let microCategoryId: number | null = null;
  try {
    if (data?.loaderData) {
      loaderKeys = Object.keys(data.loaderData);
      for (const key of loaderKeys) {
        if (data.loaderData[key]?.buyerItem) {
          const bi = data.loaderData[key].buyerItem;
          buyerItemJson = JSON.stringify(bi);
          const item = bi.item;
          if (item) {
            itemId = item.id || null;
            categoryId = item.category?.id || null;
            microCategoryId = item.microCategoryId || item.microCategory?.id || null;
          }
          break;
        }
      }
    }
  } catch {}
  const metaPriceEl = document.querySelector('meta[property="product:price:amount"]');
  return {
    url: location.href,
    title: document.title,
    bodySnippet: (document.body?.innerText || '').slice(0, 500),
    metaPrice: metaPriceEl ? metaPriceEl.getAttribute('content') : null,
    buyerItemJson,
    loaderKeys,
    itemId,
    categoryId,
    microCategoryId,
  };
}

/**
 * Получение истории изменения цены через скрытое API Авито.
 * Вызывается через executeScript в контексте вкладки avito.ru.
 * API: GET /web/1/realty/price/history/{itemId}?categoryID=&microcatID=&offset=0&limit=40
 */
function fetchAvitoPriceHistory(itemId: number, categoryId: number, microCategoryId: number): Promise<Array<{ date: string; price: number }>> {
  return fetch(
    `/web/1/realty/price/history/${itemId}?categoryID=${categoryId}&microcatID=${microCategoryId}&offset=0&limit=40`,
    { credentials: 'include' }
  )
    .then(r => r.json())
    .then((data: any) => {
      const history: Array<{ date: string; price: number }> = [];
      if (data?.result?.items && Array.isArray(data.result.items)) {
        for (const item of data.result.items) {
          if (item.date && item.price) {
            history.push({
              date: new Date(item.date * 1000).toISOString(),
              price: item.price,
            });
          }
        }
      }
      return history;
    })
    .catch(() => [] as Array<{ date: string; price: number }>);
}

/**
 * Парсинг данных __staticRouterHydrationData в service worker.
 * Вызывается после readAvitoPageData — получает JSON-строку и разбирает её.
 */
function parseAvitoHydrationData(pageData: {
  url: string;
  title: string;
  bodySnippet: string;
  metaPrice: string | null;
  buyerItemJson: string | null;
  loaderKeys: string[];
}): AvitoDetailParsed & { error?: string } {
  const result: AvitoDetailParsed & { error?: string } = {
    status: 'active',
    price: null,
    pricePerMeter: null,
    photos: [],
    updatedDate: null,
    datePublished: null,
    sellerName: null,
    sellerType: null,
    views: null,
    priceHistory: [],
  };

  // Проверяем что мы на странице объявления, а не на списке
  const isListingPage = !pageData.url.match(/\/\d{8,}$/) && !pageData.url.match(/_\d{8,}/);
  if (isListingPage) {
    result.status = 'archived';
    return result;
  }

  // Пробуем распарсить buyerItem
  let buyerItem: any = null;
  if (pageData.buyerItemJson) {
    try {
      buyerItem = JSON.parse(pageData.buyerItemJson);
    } catch (e) {
      console.error('[Avito] Ошибка парсинга buyerItemJson:', e);
    }
  }

  if (!buyerItem) {
    // Нет JSON данных — проверяем страницу
    const bodyText = pageData.bodySnippet || '';
    const pageTitle = pageData.title || '';

    if (bodyText.includes('Объявление закрыто') || bodyText.includes('объявление не найдено') ||
        bodyText.includes('объявление удалено') || bodyText.includes('404') ||
        pageTitle.includes('404') ||
        pageTitle === 'Авито — Объявления на сайте Авито') {
      result.status = 'archived';
      return result;
    }

    if (bodyText.toLowerCase().includes('captcha') || bodyText.includes('подтвердите, что вы не робот')) {
      result.error = 'Страница требует прохождения капчи';
      return result;
    }

    // Если есть metaPrice — используем хотя бы цену
    if (pageData.metaPrice) {
      result.price = parseInt(pageData.metaPrice, 10);
      return result;
    }

    result.error = 'Не найдены данные объявления. Страница: ' + pageTitle;
    return result;
  }

  const item = buyerItem.item || buyerItem;
  const seller = buyerItem.seller || item?.seller || {};
  const priceData = buyerItem.priceDataDTO || {};
  const galleryInfo = buyerItem.galleryInfo || {};
  const viewStat = buyerItem.viewStat || {};
  const priceHistoryData = buyerItem.priceHistory || {};

  // 1. Статус
  if (item.isActive === true) {
    result.status = 'active';
  } else {
    result.status = 'archived';
  }
  if (item.isClosed || item.isDeleted || item.isExpired) {
    result.status = 'archived';
  }

  // 2. Цена
  if (item.price?.value != null) {
    result.price = item.price.value;
  } else if (item.formattedPrice?.string) {
    const priceText = String(item.formattedPrice.string).replace(/\s/g, '').replace(/[^\d]/g, '');
    if (priceText) result.price = parseInt(priceText, 10);
  }
  if (result.price === null && pageData.metaPrice) {
    result.price = parseInt(pageData.metaPrice, 10);
  }

  // 3. Цена за м²
  if (priceData.normalizedPrice) {
    const ppmText = String(priceData.normalizedPrice).replace(/[^\d]/g, '');
    if (ppmText) result.pricePerMeter = parseInt(ppmText, 10);
  }

  // 4. Фото
  const media = galleryInfo.media || [];
  const seenPhotoIds = new Set<string>();
  for (const m of media) {
    const images = m.images || {};
    const url = images['1280x960'] || images['640x480'] || m.defaultUrl || '';
    if (!url) continue;
    const idMatch = url.match(/\/img\/(\d+)/) || url.match(/\/(\d{10,})/);
    const photoId = idMatch ? idMatch[1] : url.split('?')[0];
    if (seenPhotoIds.has(photoId)) continue;
    seenPhotoIds.add(photoId);
    result.photos.push(url);
  }
  if (result.photos.length === 0 && Array.isArray(item.images)) {
    for (const imgId of item.images) {
      result.photos.push(`https://60.img.avito.st/image/1/${imgId}`);
    }
  }

  // 5. Дата публикации
  if (item.sortFormatedDate) {
    const d = parseRuDateAvito(item.sortFormatedDate);
    if (d) result.datePublished = d.toISOString();
  }
  if (item.finishTime) {
    result.updatedDate = new Date(item.finishTime * 1000).toISOString();
  }

  // 6. Продавец
  if (seller.name) result.sellerName = seller.name;
  const sellerLabel = seller.labels?.nominative || '';
  if (sellerLabel === 'Собственник') result.sellerType = 'owner';
  else if (sellerLabel === 'Риелтор' || sellerLabel === 'Агент') result.sellerType = 'agent';
  else if (sellerLabel === 'Компания') result.sellerType = 'company';
  else if (seller.isCompany === true) result.sellerType = 'company';
  else if (seller.isCompany === false && !sellerLabel) result.sellerType = 'owner';

  // 7. Просмотры
  if (viewStat.totalViews != null) result.views = viewStat.totalViews;

  // 8. История цены
  if (Array.isArray(priceHistoryData.records)) {
    for (const rec of priceHistoryData.records) {
      if (rec.date && rec.price) {
        result.priceHistory.push({
          date: new Date(rec.date).toISOString(),
          price: rec.price,
        });
      }
    }
  }

  return result;
}

/**
 * Быстрая проверка объявления Авито через HTML-fetch (без навигации)
 * Вызывается через executeScript в контексте вкладки avito.ru.
 * Извлекает цену и статус из JSON встроенного в HTML.
 */
function checkAvitoAdHtml(url: string): Promise<{ price: number | null; status: 'active' | 'archived'; error?: string }> {
  return fetch(url, { credentials: 'include' })
    .then(r => {
      if (r.status === 404) {
        console.log(`[Avito] checkHtml: ${url} → 404`);
        return { price: null as null, status: 'archived' as const };
      }
      if (!r.ok) {
        console.log(`[Avito] checkHtml: ${url} → HTTP ${r.status}`);
        return { price: null as null, status: 'archived' as const, error: `HTTP ${r.status}` };
      }
      // Проверка редиректа: если fetch перешёл на другой URL (например, страницу поиска),
      // значит объявление удалено/архивировано
      const finalUrl = r.url;
      if (finalUrl !== url) {
        // Проверяем, что финальный URL — это страница объявления (содержит длинный числовой ID)
        const adIdMatch = finalUrl.match(/\/(\d{8,})/);
        const origIdMatch = url.match(/\/(\d{8,})/);
        if (!adIdMatch || !origIdMatch || adIdMatch[1] !== origIdMatch[1]) {
          console.log(`[Avito] checkHtml: redirect detected ${url} → ${finalUrl} → archived`);
          return { price: null as null, status: 'archived' as const, error: 'Redirect to non-ad page' };
        }
      }
      return r.text().then(html => {
        let price: number | null = null;
        let status: 'active' | 'archived' = 'active';

        // Способ 1: извлечь JSON из __staticRouterHydrationData
        const hydrationMatch = html.match(/window\.__staticRouterHydrationData\s*=\s*JSON\.parse\("([\s\S]*?)"\)\s*;?\s*<\/script>/);
        if (hydrationMatch) {
          try {
            // Двойное экранирование: JSON.parse внутри строки
            const jsonStr = hydrationMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const data = JSON.parse(jsonStr);
            const routeData = data?.loaderData;
            if (routeData) {
              let item: any = null;
              for (const key of Object.keys(routeData)) {
                const bi = routeData[key]?.buyerItem;
                if (bi) { item = bi.item || bi; break; }
              }
              if (item) {
                if (item.price?.value != null) price = item.price.value;
                else if (item.formattedPrice?.string) {
                  const p = String(item.formattedPrice.string).replace(/\s/g, '').replace(/[^\d]/g, '');
                  if (p) price = parseInt(p, 10);
                }
                if (item.isActive !== true || item.isClosed || item.isDeleted) status = 'archived';
              }
            }
          } catch { /* JSON parse failed */ }
        }

        // Способ 2: мета-теги
        if (price === null) {
          const metaMatch = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="(\d+)"/);
          if (metaMatch) price = parseInt(metaMatch[1], 10);
        }

        // Способ 3: маркеры в HTML
        if (html.includes('Объявление закрыто') || html.includes('closedItem')) {
          status = 'archived';
        }

        console.log(`[Avito] checkHtml: ${url} → status=${status}, price=${price}`);
        return { price, status };
      });
    })
    .catch(err => ({
      price: null as null,
      status: 'archived' as const,
      error: err instanceof Error ? err.message : String(err),
    }));
}

// ============================================================
// Обработка сообщений от UI-страниц
// ============================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATS') {
    getDatabaseStats()
      .then((stats) => sendResponse({ success: true, stats }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Клик по кнопкам телефонов (фаза 1 — раскрытие номеров)
  if (message.type === 'CLICK_PHONE_BUTTONS') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: clickCianPhones,
    }).then(results => {
      const clicked = (results && results.length > 0) ? results[0].result || 0 : 0;
      sendResponse({ success: true, clicked });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Переустановка фильтра продавцов на Авито
  if (message.type === 'REAPPLY_AVITO_FILTERS') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: reapplyAvitoSellerFilter,
    }).then(results => {
      const applied = (results && results.length > 0) ? results[0].result || false : false;
      sendResponse({ success: true, applied });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Проверка что фильтр продавцов сработал
  if (message.type === 'CHECK_AVITO_FILTER') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: checkAvitoSellerFilter,
    }).then(results => {
      const info = (results && results.length > 0) ? results[0].result : null;
      sendResponse({ success: true, ...info });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Прокрутка Авито для подгрузки всех карточек (on-map вид)
  if (message.type === 'SCROLL_AVITO_LIST') {
    const injection: chrome.scripting.ScriptInjection = {
      target: { tabId: message.tabId },
      func: scrollAvitoList,
    };
    if (message.maxCards != null) {
      injection.args = [message.maxCards];
    }
    chrome.scripting.executeScript(injection).then(results => {
      const loaded = (results && results.length > 0) ? results[0].result || 0 : 0;
      sendResponse({ success: true, loaded });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Парсинг страницы (фаза 2 — после раскрытия телефонов)
  if (message.type === 'EXECUTE_PARSER') {
    const parseFunc = message.sourceType === 'cian' ? parseCianPage : parseAvitoPage;
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: parseFunc,
    }).then(results => {
      const listings = (results && results.length > 0) ? results[0].result || [] : [];
      sendResponse({ success: true, listings });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Получить URL следующей страницы
  if (message.type === 'GET_NEXT_PAGE_URL') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: getNextPageUrlFunc,
    }).then(results => {
      const url = (results && results.length > 0) ? results[0].result || null : null;
      sendResponse({ success: true, url });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Получить URL Avito API — сначала из performance entries, затем через PerformanceObserver
  if (message.type === 'GET_AVITO_API_URL') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: () => {
        // Быстрая проверка: берём последний /map/items из буфера
        const resources = performance.getEntriesByType('resource');
        let lastApiEntry: PerformanceResourceTiming | null = null;
        for (const r of resources) {
          if ((r as PerformanceResourceTiming).name.includes('/map/items')) {
            lastApiEntry = r as PerformanceResourceTiming;
          }
        }
        if (lastApiEntry) return lastApiEntry.name;

        // Если в буфере пусто — ждём появления через PerformanceObserver
        return new Promise<string | null>((resolve) => {
          let resolved = false;
          const observer = new PerformanceObserver((list: PerformanceObserverEntryList) => {
            for (const entry of list.getEntries()) {
              if (entry.name.includes('/map/items')) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  observer.disconnect();
                  resolve(entry.name);
                }
                return;
              }
            }
          });
          observer.observe({ type: 'resource' });
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              observer.disconnect();
              resolve(null);
            }
          }, 10000);
        });
      },
    }).then(results => {
      const url = (results && results.length > 0) ? results[0].result || null : null;
      sendResponse({ success: true, url });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Получить страницу данных через Avito API
  if (message.type === 'FETCH_AVITO_API_PAGE') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: (apiUrl: string, page: number, limit: number) => {
        const url = new URL(apiUrl, window.location.origin);
        url.searchParams.set('page', String(page));
        url.searchParams.set('limit', String(limit));
        return fetch(url.pathname + url.search, {
          headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' }
        }).then(r => r.json() as Promise<{ totalCount: number; items: any[] }>);
      },
      args: [message.apiUrl, message.page, message.limit || 50],
    }).then(results => {
      const data = (results && results.length > 0) ? results[0].result : null;
      sendResponse({ success: true, totalCount: data?.totalCount || 0, items: data?.items || [] });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // ─── Отправка сообщений через чаты Авито / ЦИАН ────────────────────

  // Открыть чат на Авито (icebreakers textarea уже на странице)
  if (message.type === 'OPEN_AVITO_CHAT') {
    // На Авито поле ввода уже доступно на странице (icebreakers)
    // Проверяем его наличие
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: () => {
        const textarea = document.querySelector('[data-marker="icebreakers/textarea"]');
        if (!textarea) {
          // Fallback: нажимаем кнопку "Написать сообщение"
          const writeBtn = document.querySelector('[data-marker="messenger-button/button"]');
          if (writeBtn) {
            (writeBtn as HTMLElement).click();
            return { success: true };
          }
          return { success: false, error: 'Не найдено поле ввода чата на странице Авито' };
        }
        return { success: true };
      },
    }).then(results => {
      const r = results?.[0]?.result || { success: false, error: 'No result' };
      sendResponse(r);
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Открыть чат на ЦИАН (нажать "Написать")
  if (message.type === 'OPEN_CIAN_CHAT') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: () => {
        const writeBtn = document.querySelector('[data-name="SendMessageButton"] button');
        if (!writeBtn) {
          return { success: false, error: 'Не найдена кнопка "Написать" на странице ЦИАН' };
        }
        (writeBtn as HTMLElement).click();
        return { success: true };
      },
    }).then(results => {
      const r = results?.[0]?.result || { success: false, error: 'No result' };
      sendResponse(r);
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Ввести текст и отправить сообщение
  if (message.type === 'TYPE_AND_SEND_MESSAGE') {
    const text = message.text as string;
    const tabId = message.tabId as number;

    // ─── Авито: MAIN world — вызов React onChange напрямую ────────────
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN' as any,
      func: (text: string) => {
        const ta = document.querySelector('[data-marker="icebreakers/textarea"]');
        if (!ta) return { found: false };

        // Ключевой момент: React — controlled component.
        // dispatchEvent('input') вызывает React-обработчик, который СБРАСЫВАЕТ
        // значение обратно к внутреннему state. Поэтому вызываем onChange напрямую.

        // 1. Найти React props на элементе
        const reactKey = Object.keys(ta).find(k => k.startsWith('__reactProps'));
        const reactProps = reactKey ? (ta as any)[reactKey] : null;

        if (reactProps?.onChange) {
          // 2. Установить значение через native setter
          const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
          if (desc?.set) desc.set.call(ta, text);

          // 3. Вызвать React onChange напрямую — React прочитает ta.value
          //    и обновит свой внутренний state, после чего перерендерит
          //    textarea с нашим текстом
          reactProps.onChange({ target: ta, currentTarget: ta });

          ta.focus();
          return { found: true, success: true, method: 'react-onChange' };
        }

        // Fallback: если React props не найдены — обычный метод
        const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        if (desc?.set) desc.set.call(ta, text);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.focus();
        return { found: true, success: (ta as HTMLTextAreaElement).value === text, method: 'fallback-dispatch' };
      },
      args: [text],
    }).then(results => {
      const r = results?.[0]?.result as any;
      if (r?.found) {
        // Авито текст вставлен (или попытка сделана)
        sendResponse({ success: true });
        return;
      }

      // ─── ЦИАН: чат в iframe — isolated world ────────────────────────
      chrome.scripting.executeScript({
        target: { tabId },
        func: (text: string) => {
          const fillOnly = text.startsWith('__FILL_ONLY__');
          const actualText = fillOnly ? text.substring('__FILL_ONLY__'.length) : text;

          const findChatIframe = (): HTMLIFrameElement | null => {
            const iframes = document.querySelectorAll('iframe');
            for (const f of iframes) {
              if (f.src && f.src.includes('/dialogs/')) return f as HTMLIFrameElement;
            }
            return null;
          };

          const chatIframe = findChatIframe();
          if (!chatIframe?.contentDocument) {
            return { success: false, error: 'Не найден чат ЦИАН. Возможно, нужно авторизоваться.' };
          }

          const chatDoc = chatIframe.contentDocument;
          const chatTextarea = chatDoc.querySelector('textarea[placeholder="Написать сообщение"]') as HTMLTextAreaElement | null;
          if (!chatTextarea) {
            return { success: false, error: 'Не найдено поле ввода в чате ЦИАН' };
          }

          chatTextarea.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          setter?.call(chatTextarea, actualText);
          chatTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          chatTextarea.dispatchEvent(new Event('change', { bubbles: true }));

          return { success: true };
        },
        args: [text],
      }).then(results2 => {
        sendResponse(results2?.[0]?.result || { success: false, error: 'No result' });
      }).catch(err => sendResponse({ success: false, error: err.message }));
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ─── Актуализация объявления ЦИАН ────────────────────────

  if (message.type === 'ACTUALIZE_CIAN_AD') {
    const tabId = message.tabId as number;
    const offerId = message.offerId as number | undefined;

    // Шаг 1: парсим основные данные со страницы
    chrome.scripting.executeScript({
      target: { tabId },
      func: parseCianDetailPage,
    }).then(async (results) => {
      if (!results || results.length === 0) {
        sendResponse({ success: false, error: 'executeScript вернул пустой результат. Возможно вкладка ещё загружается.' });
        return;
      }
      const parsed: CianDetailParsed | null = results[0].result;
      if (!parsed) {
        // Функция либо бросила ошибку (results[0].error), либо вернула undefined
        const errObj = results[0].error;
        const errMsg = errObj
          ? (errObj.message || errObj.description || JSON.stringify(errObj))
          : 'Результат пуст. Возможно страница ещё загружается.';
        sendResponse({ success: false, error: errMsg });
        return;
      }

      // Шаг 2: пробуем получить историю цены через API (без DOM-взаимодействия)
      let apiHistory: Array<{ date: string; price: number }> = [];
      if (offerId) {
        try {
          const apiResults = await chrome.scripting.executeScript({
            target: { tabId },
            func: fetchCianPriceHistoryApi,
            args: [offerId],
          });
          apiHistory = (apiResults && apiResults.length > 0) ? apiResults[0].result || [] : [];
        } catch { /* API может быть недоступно */ }
      }

      // Если API не дал историю — пробуем кликнуть кнопку и прочитать из DOM
      let domHistory: Array<{ date: string; price: number }> = [];
      if (apiHistory.length === 0 && parsed.priceHistory.length === 0) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: clickCianPriceHistoryButton,
          });
          // Ждём раскрытия виджета
          await new Promise(r => setTimeout(r, 1500));
          // Повторно парсим страницу — теперь таблица истории видна
          const histResults = await chrome.scripting.executeScript({
            target: { tabId },
            func: parseCianDetailPage,
          });
          const reparsed: CianDetailParsed | null = (histResults && histResults.length > 0) ? histResults[0].result : null;
          domHistory = reparsed?.priceHistory || [];
        } catch { /* не удалось */ }
      }

      // Объединяем историю: приоритет API > DOM после клика > DOM без клика
      const finalHistory = apiHistory.length > 0 ? apiHistory
        : domHistory.length > 0 ? domHistory
        : parsed.priceHistory;

      sendResponse({
        success: true,
        data: {
          status: parsed.status,
          price: parsed.price,
          photos: parsed.photos,
          updatedDate: parsed.updatedDate,
          priceHistory: finalHistory,
        },
      });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Быстрая проверка CIAN объявления через HTML-fetch (без навигации)
  if (message.type === 'CHECK_CIAN_AD_HTML') {
    const tabId = message.tabId as number;
    let url = message.url as string;
    // Нормализация URL — CIAN редиректит https→http и добавляет trailing slash
    if (url.includes('cian.ru') && !url.endsWith('/')) url += '/';
    url = url.replace('http://', 'https://');

    chrome.scripting.executeScript({
      target: { tabId },
      func: checkCianAdHtml,
      args: [url],
    }).then(results => {
      if (!results || results.length === 0) {
        sendResponse({ success: false, error: 'executeScript вернул пустой результат' });
        return;
      }
      const data = results[0].result;
      if (results[0].error) {
        sendResponse({ success: false, error: results[0].error.message || String(results[0].error) });
        return;
      }
      sendResponse({ success: true, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Быстрая проверка CIAN объявления через fetch из service worker (без вкладки)
  if (message.type === 'CHECK_CIAN_AD_STATUS') {
    let url = message.url as string;
    // CIAN редиректит https→http и добавляет trailing slash — это вызывает CORS.
    // Предотвращаем: добавляем слэш и гарантируем https.
    if (url.includes('cian.ru') && !url.endsWith('/')) url += '/';
    url = url.replace('http://', 'https://');
    console.log(`[CIAN] CHECK_STATUS: ${url}`);
    fetch(url, { credentials: 'include' })
      .then(r => {
        if (!r.ok) {
          console.log(`[CIAN] CHECK_STATUS: ${url} → HTTP ${r.status} → archived`);
          sendResponse({ success: true, data: { status: 'archived' as const, price: null, error: `HTTP ${r.status}` } });
          return;
        }
        // Проверка редиректа: если fetch перешёл на другой URL — объявление снято
        const finalUrl = r.url;
        if (finalUrl !== url) {
          const origIdMatch = url.match(/\/(\d{7,})\/?$/);
          const finalIdMatch = finalUrl.match(/\/(\d{7,})\/?$/);
          if (!origIdMatch || !finalIdMatch || origIdMatch[1] !== finalIdMatch[1]) {
            console.log(`[CIAN] CHECK_STATUS: redirect ${url} → ${finalUrl} → archived`);
            sendResponse({ success: true, data: { status: 'archived' as const, price: null, error: 'Redirect to non-ad page' } });
            return;
          }
        }
        return r.text().then(html => {
          let price: number | null = null;
          let status: 'active' | 'archived' = 'active';
          const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
          if (ldMatch) {
            try {
              const ld = JSON.parse(ldMatch[1]);
              if (ld?.offers?.price) price = ld.offers.price;
              if (ld?.description?.includes('снято с публикации')) status = 'archived';
            } catch { /* не удалось распарсить JSON-LD */ }
          }
          if (html.includes('OfferUnpublished')) status = 'archived';
          if (price === null) {
            const priceMatch = html.match(/"price"\s*:\s*(\d{5,})/);
            if (priceMatch) price = parseInt(priceMatch[1], 10);
          }
          console.log(`[CIAN] CHECK_STATUS: ${url} → status=${status}, price=${price}`);
          sendResponse({ success: true, data: { status, price, error: undefined } });
        });
      })
      .catch(err => {
        console.log(`[CIAN] CHECK_STATUS: ${url} → error: ${err instanceof Error ? err.message : String(err)}`);
        // НЕ считаем ошибку сети признаком архивации — возвращаем success:false,
        // чтобы actualizeCianAd перешёл к полному парсингу вместо архивации
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      });
    return true;
  }

  // ─── Актуализация объявления Авито ────────────────────────

  if (message.type === 'ACTUALIZE_AVITO_AD') {
    const tabId = message.tabId as number;
    console.log(`[Avito] ACTUALIZE_AVITO_AD: tabId=${tabId}`);
    let responded = false;
    const safeRespond = (msg: unknown) => {
      if (responded) return;
      responded = true;
      try { sendResponse(msg); } catch { /* channel already closed */ }
    };

    // Шаг 1: читаем данные страницы через инъекцию в MAIN world (чтобы видеть window.__staticRouterHydrationData)
    const readPageData = async (): Promise<{
      url: string; title: string; bodySnippet: string; metaPrice: string | null;
      buyerItemJson: string | null; loaderKeys: string[];
      itemId: number | null; categoryId: number | null; microCategoryId: number | null;
    } | null> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: readAvitoPageData,
          world: 'MAIN',
        });
        if (res && res.length > 0 && res[0].result) {
          const pd = res[0].result;
          if (pd.buyerItemJson) return pd; // данные есть — успех
          console.log(`[Avito] Попытка чтения ${attempt + 1}: buyerItemJson=null, ждём 3 сек...`);
        }
        await new Promise(r => setTimeout(r, 3000));
      }
      // Последняя попытка — вернём что есть
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: readAvitoPageData,
        world: 'MAIN',
      });
      return (res && res.length > 0) ? res[0].result : null;
    };

    readPageData().then(async (pageData) => {
      if (!pageData) {
        safeRespond({ success: false, error: 'Не удалось прочитать данные вкладки' });
        return;
      }

      // Шаг 2: получаем историю цены через API Авито
      let priceHistory: Array<{ date: string; price: number }> = [];
      if (pageData.itemId && pageData.categoryId && pageData.microCategoryId) {
        try {
          const histResults = await chrome.scripting.executeScript({
            target: { tabId },
            func: fetchAvitoPriceHistory,
            args: [pageData.itemId, pageData.categoryId, pageData.microCategoryId],
            world: 'MAIN',
          });
          priceHistory = (histResults && histResults.length > 0) ? histResults[0].result || [] : [];
        } catch { /* API может быть недоступен */ }
      }

      // Шаг 3: парсим данные в service worker
      const parsed = parseAvitoHydrationData(pageData);
      console.log(`[Avito] Спарсено: status=${parsed.status}, price=${parsed.price}, photos=${parsed.photos.length}, priceHistory=${priceHistory.length}`);

      if (parsed.error) {
        safeRespond({ success: false, error: parsed.error });
        return;
      }

      safeRespond({
        success: true,
        data: {
          status: parsed.status,
          price: parsed.price,
          pricePerMeter: parsed.pricePerMeter,
          photos: parsed.photos,
          updatedDate: parsed.updatedDate,
          datePublished: parsed.datePublished,
          sellerName: parsed.sellerName,
          sellerType: parsed.sellerType,
          views: parsed.views,
          priceHistory: priceHistory.length > 0 ? priceHistory : parsed.priceHistory,
        },
      });
    }).catch(err => {
      console.error('[Avito] executeScript catch:', err.message);
      safeRespond({ success: false, error: err.message });
    });
    return true;
  }

  // Быстрая проверка Авито объявления через HTML-fetch (без навигации)
  if (message.type === 'CHECK_AVITO_AD_HTML') {
    const tabId = message.tabId as number;
    const url = message.url as string;

    chrome.scripting.executeScript({
      target: { tabId },
      func: checkAvitoAdHtml,
      args: [url],
      world: 'MAIN',
    }).then(results => {
      if (!results || results.length === 0) {
        sendResponse({ success: false, error: 'executeScript вернул пустой результат' });
        return;
      }
      const data = results[0].result;
      if (results[0].error) {
        sendResponse({ success: false, error: results[0].error.message || String(results[0].error) });
        return;
      }
      sendResponse({ success: true, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  return false;
});

// Импорт функций для работы с БД
async function getDatabaseStats() {
  return {
    totalDeals: 0,
    totalImports: 0,
    years: [],
    regions: [],
  };
}

export {};
