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
  const cards = document.querySelectorAll(
    '[data-marker="item"], [itemtype="http://schema.org/Product"], .iva-item-list'
  );
  cards.forEach(card => {
    try {
      const linkEl = card.querySelector('[data-marker="item-title"] a, a[itemprop="url"], a[href*="/nedvizhimost/"]') as HTMLAnchorElement
        || card.querySelector('a[href^="/"]') as HTMLAnchorElement;
      const url = linkEl?.href || '';
      const titleText = linkEl?.getAttribute('title') || linkEl?.textContent?.trim() || '';

      const addressEl = card.querySelector('[class*="geo"], [data-marker="item-address"], [class*="address"]');
      const address = addressEl?.textContent?.trim() || '';

      const priceEl = card.querySelector('[data-marker="item-price"], [itemprop="price"], [class*="price"]');
      const priceMeta = priceEl?.getAttribute('content') || '';
      const priceText = priceMeta || priceEl?.textContent?.replace(/\s/g, '').replace(/[^\d]/g, '') || '';
      const price = priceText ? parseInt(priceText, 10) : null;

      const nameEl = card.querySelector('[data-marker="seller-info/name"], [class*="seller"] span, [class*="author"]');
      const name = nameEl?.textContent?.trim() || '';

      const isCompany = !!card.querySelector('[class*="shop"], [class*="company"], [data-marker="seller-info/label"]');
      const sellerType = isCompany ? 'agent' : 'owner';

      const roomsMatch = titleText.match(/(\d+[+-]?к(?:омн)?\.?|студия)/i);
      const rooms = roomsMatch ? roomsMatch[1] : '';

      const areaMatch = titleText.match(/(\d+[,.]?\d*)\s*м²/);
      const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null;

      const floorMatch = titleText.match(/(\d+)\s*\/\s*(\d+)\s*эт/);
      const floor = floorMatch ? `${floorMatch[1]}/${floorMatch[2]}` : '';

      const phoneEl = card.querySelector('[data-marker="phone-button"], [class*="phone"]');
      const phoneRaw = phoneEl?.textContent?.trim().replace(/[^\d+]/g, '') || '';
      const phones = phoneRaw ? [phoneRaw] : [];

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
  return null;
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
