/**
 * Content script для парсинга объявлений Авито
 * Внедряется на страницы avito.ru
 * Слушает сообщения от расширения и возвращает спарсенные данные
 *
 * Работает с двумя видами страниц:
 * - Список (list): карточки с data-marker="item"
 * - Карта (on-map): карточки с itemprop="Product"
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

  // Карточки: на карте — itemprop="Product", в списке — data-marker="item"
  const cards = document.querySelectorAll(
    '[itemtype="http://schema.org/Product"], [data-marker="item"]'
  );

  cards.forEach(card => {
    try {
      // Заголовок и ссылка: data-marker="title" — ссылка с текстом объявления
      const titleLink = card.querySelector('[data-marker="title"]') as HTMLAnchorElement
        || card.querySelector('[data-marker="item-title"] a') as HTMLAnchorElement
        || card.querySelector('a[itemprop="url"]') as HTMLAnchorElement;

      const url = titleLink?.href || '';
      const titleText = titleLink?.textContent?.trim() || '';

      if (!url) return; // пропускаем карточки без ссылки

      // Адрес: data-marker="item-location" (карта) или item-address (список)
      const locationEl = card.querySelector('[data-marker="item-location"]')
        || card.querySelector('[data-marker="item-address"]');
      let address = '';
      if (locationEl) {
        // В on-map виде адрес состоит из нескольких <p> (город, улица)
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
        // Fallback: парсим из data-marker="item-price" текста
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

      // Площадь из заголовка: "Коттедж 153,2 м² на участке 9,2 сот."
      const areaMatch = titleText.match(/(\d+[,.]?\d*)\s*м²/);
      const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null;

      // Комнатность из заголовка (для квартир)
      const roomsMatch = titleText.match(/(\d+[+-]?к(?:омн)?\.?|студия)/i);
      const rooms = roomsMatch ? roomsMatch[1] : '';

      // Этаж из заголовка
      const floorMatch = titleText.match(/(\d+)\s*\/\s*(\d+)\s*эт/);
      const floor = floorMatch ? `${floorMatch[1]}/${floorMatch[2]}` : '';

      // Телефон: на Авито скрыт до клика/наведения, не пытаемся извлечь
      const phones: string[] = [];

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
