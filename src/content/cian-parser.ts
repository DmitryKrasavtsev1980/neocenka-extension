/**
 * Content script для парсинга объявлений ЦИАН
 * Внедряется на страницы cian.ru
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

function parseCianListings(): ParsedListing[] {
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

      // Телефон: ищем все раскрытые номера
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
      if (phones.length === 0) {
        const phoneEl = card.querySelector('[data-mark="PhoneButton"]');
        const phoneText = phoneEl?.textContent?.trim() || '';
        if (phoneText) phones.push(phoneText.replace(/[^\d+]/g, ''));
      }
      const name = sellerText.includes('Собственник') ? 'Собственник' : '';

      results.push({ name, phones, address, price, url, seller_type: sellerType, rooms, area, floor });
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
