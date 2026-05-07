/**
 * Content script для парсинга объявлений ЦИАН
 * Внедряется на страницы cian.ru
 * Слушает сообщения от расширения и возвращает спарсенные данные
 */

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

function parseCianListings(): ParsedListing[] {
  const results: ParsedListing[] = [];

  // Варианты селекторов карточек на ЦИАН
  const cards = document.querySelectorAll(
    '[data-mark="Offer"] article, .catalog-card-item, ._93444fe79c--card--ibPJC, article[class*="card"]'
  );

  cards.forEach(card => {
    try {
      // Заголовок / ссылка
      const linkEl = card.querySelector('a[href*="/sale/"]') as HTMLAnchorElement
        || card.querySelector('a[href*="/rent/"]') as HTMLAnchorElement
        || card.querySelector('a[href*="/cat.php"]') as HTMLAnchorElement
        || card.querySelector('a') as HTMLAnchorElement;

      const url = linkEl?.href || '';
      const titleText = linkEl?.textContent?.trim() || '';

      // Адрес
      const addressEl = card.querySelector('[data-mark="OfferAddress"], [class*="address"], [class*="geo"] span');
      const address = addressEl?.textContent?.trim() || '';

      // Цена
      const priceEl = card.querySelector('[data-mark="OfferPrice"], [class*="price"] span, [class*="price"]');
      const priceText = priceEl?.textContent?.replace(/\s/g, '').replace(/[^\d]/g, '') || '';
      const price = priceText ? parseInt(priceText, 10) : null;

      // Имя продавца
      const nameEl = card.querySelector('[data-mark="OfferContactName"], [class*="contact"] span, [class*="author"]');
      const name = nameEl?.textContent?.trim() || '';

      // Тип продавца
      const sellerEl = card.querySelector('[class*="agent"], [class*="owner"]');
      const sellerType = sellerEl ? 'agent' : 'owner';

      // Комнатность из заголовка
      const roomsMatch = titleText.match(/(\d+[+-]?к(?:омн)?\.?|студия)/i);
      const rooms = roomsMatch ? roomsMatch[1] : '';

      // Площадь
      const areaEl = card.querySelector('[class*="area"], [class*="size"]');
      const areaText = areaEl?.textContent?.replace(',', '.').replace(/[^\d.]/g, '') || '';
      const area = areaText ? parseFloat(areaText) : null;

      // Этаж
      const floorEl = card.querySelector('[class*="floor"]');
      const floor = floorEl?.textContent?.trim() || '';

      // Телефон — на ЦИАН нужно нажать кнопку раскрытия, берём из data-атрибута если есть
      const phoneEl = card.querySelector('[data-mark="OfferContactPhone"], [class*="phone"] a');
      const phone = phoneEl?.textContent?.trim().replace(/[^\d+]/g, '') || '';

      results.push({
        name,
        phone,
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
      const listings = parseCianListings();
      sendResponse({ success: true, listings, count: listings.length });
    } catch (e) {
      sendResponse({ success: false, error: String(e), listings: [], count: 0 });
    }
    return true; // async response
  }
});
