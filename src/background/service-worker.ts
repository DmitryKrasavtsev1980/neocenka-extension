/**
 * Service Worker для Chrome Extension
 * Обрабатывает chrome.scripting.executeScript вызовы от UI-страниц
 */

// Установка расширения
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Расширение установлено');
  } else if (details.reason === 'update') {
    console.log('Расширение обновлено до версии', chrome.runtime.getManifest().version);
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

  if (!scrollContainer) return document.querySelectorAll('[itemtype="http://schema.org/Product"], [data-marker="item"]').length;

  const limit = maxCards || 9999;
  const step = scrollContainer.clientHeight; // прокрутка на высоту видимой области
  let prevCount = 0;
  let stableRounds = 0;

  while (stableRounds < 5) {
    // Инкрементальная прокрутка — чтобы сработали все lazy-loading триггеры
    scrollContainer.scrollTop += step;
    await new Promise(r => setTimeout(r, 2000));

    const currentCount = document.querySelectorAll('[itemtype="http://schema.org/Product"], [data-marker="item"]').length;
    if (currentCount >= limit) break;

    const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 50;

    if (currentCount === prevCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
    }
    prevCount = currentCount;

    // Если дошли до низа и количество стабильно — заканчиваем
    if (atBottom && stableRounds >= 2) break;
  }

  return document.querySelectorAll('[itemtype="http://schema.org/Product"], [data-marker="item"]').length;
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
