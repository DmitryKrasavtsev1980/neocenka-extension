/**
 * Content script для парсинга объявлений Авито
 * Внедряется на страницы avito.ru
 * Слушает сообщения от расширения и возвращает спарсенные данные
 */

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

function parseAvitoListings(): ParsedListing[] {
  const results: ParsedListing[] = [];

  // Селекторы карточек объявлений Авито
  const cards = document.querySelectorAll(
    '[data-marker="item"], [itemtype="http://schema.org/Product"], .iva-item-list'
  );

  cards.forEach(card => {
    try {
      // Ссылка
      const linkEl = card.querySelector('[data-marker="item-title"] a, a[itemprop="url"], a[href*="/nedvizhimost/"]') as HTMLAnchorElement
        || card.querySelector('a[href^="/"]') as HTMLAnchorElement;

      const url = linkEl?.href || '';
      const titleText = linkEl?.getAttribute('title') || linkEl?.textContent?.trim() || '';

      // Адрес
      const addressEl = card.querySelector('[class*="geo"], [data-marker="item-address"], [class*="address"]');
      const address = addressEl?.textContent?.trim() || '';

      // Цена
      const priceEl = card.querySelector('[data-marker="item-price"], [itemprop="price"], [class*="price"]');
      const priceMeta = priceEl?.getAttribute('content') || '';
      const priceText = priceMeta || priceEl?.textContent?.replace(/\s/g, '').replace(/[^\d]/g, '') || '';
      const price = priceText ? parseInt(priceText, 10) : null;

      // Имя продавца
      const nameEl = card.querySelector('[data-marker="seller-info/name"], [class*="seller"] span, [class*="author"]');
      const name = nameEl?.textContent?.trim() || '';

      // Тип продавца
      const isCompany = !!card.querySelector('[class*="shop"], [class*="company"], [data-marker="seller-info/label"]');
      const sellerType = isCompany ? 'agent' : 'owner';

      // Комнатность из заголовка
      const roomsMatch = titleText.match(/(\d+[+-]?к(?:омн)?\.?|студия)/i);
      const rooms = roomsMatch ? roomsMatch[1] : '';

      // Площадь
      const areaMatch = titleText.match(/(\d+[,.]?\d*)\s*м²/);
      const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null;

      // Этаж
      const floorMatch = titleText.match(/(\d+)\s*\/\s*(\d+)\s*эт/);
      const floor = floorMatch ? `${floorMatch[1]}/${floorMatch[2]}` : '';

      // Телефон — на Авито нужно раскрыть, берём если есть
      const phoneEl = card.querySelector('[data-marker="phone-button"], [class*="phone"]');
      const phoneRaw = phoneEl?.textContent?.trim().replace(/[^\d+]/g, '') || '';
      const phones = phoneRaw ? [phoneRaw] : [];

      results.push({
        name,
        phones,
        address,
        price,
        url,
        seller_type: sellerType,
        rooms,
        area,
        floor,
      });
    } catch {
      // Пропускаем проблемные карточки
    }
  });

  return results;
}

// Слушаем сообщения от расширения
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'parseListings') {
    try {
      const listings = parseAvitoListings();
      sendResponse({ success: true, listings, count: listings.length });
    } catch (e) {
      sendResponse({ success: false, error: String(e), listings: [], count: 0 });
    }
    return true; // async response
  }
});
