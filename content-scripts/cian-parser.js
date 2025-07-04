/**
 * Content script для парсинга объявлений на Cian.ru
 * УЛУЧШЕННАЯ ВЕРСИЯ с исправлениями аналогичными Avito:
 * 1. Множественные методы поиска площадей
 * 2. Очистка URL от параметров
 * 3. Улучшенные селекторы для 2025 года
 * 4. Диагностические функции
 * 5. Методы отладки парсинга
 */

class CianParser {
  constructor() {
    this.isListingPage = this.checkIfListingPage();
    this.isListPage = this.checkIfListPage();
    this.init();
  }

  init() {
    // Слушаем сообщения от popup и background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Указываем, что ответ будет асинхронным
    });
  }

  /**
   * Извлечение года постройки
   */
  extractYearBuilt() {
    const yearInfo = this.findCharacteristicValue('Год постройки');
    if (yearInfo) {
      const match = yearInfo.match(/(\d{4})/);
      return match ? parseInt(match[1]) : null;
    }
    return null;
  }

  /**
   * Извлечение типа санузла
   */
  extractBathroomType() {
    const bathroomInfo = this.findCharacteristicValue('Санузел');
    return bathroomInfo ? bathroomInfo.trim() : '';
  }

  /**
   * Извлечение информации о балконе
   */
  extractBalcony() {
    const balconyInfo = this.findCharacteristicValue('Балкон');
    if (balconyInfo) {
      const balcony = balconyInfo.toLowerCase();
      return !balcony.includes('нет') && !balcony.includes('без');
    }
    return false;
  }

  /**
   * Извлечение высоты потолков
   */
  extractCeilingHeight() {
    const ceilingInfo = this.findCharacteristicValue('Высота потолков');
    if (ceilingInfo) {
      const match = ceilingInfo.match(/(\d+(?:[\.,]\d+)?)/);
      return match ? parseFloat(match[1].replace(',', '.')) : null;
    }
    return null;
  }

  /**
   * Парсинг всех объявлений на странице списка
   */
  async parseAllListingsOnPage(segmentId, delay) {
    const result = { new: 0, updated: 0, errors: 0 };

    try {
      // Получаем все ссылки на объявления
      const listingLinks = this.extractListingLinks();

      console.log(`Cian: Найдено ${listingLinks.length} объявлений для парсинга`);

      for (let i = 0; i < listingLinks.length; i++) {
        try {
          const link = listingLinks[i];
          console.log(`Cian: Парсим объявление ${i + 1}/${listingLinks.length}: ${link}`);

          // Открываем объявление в новой вкладке
          await this.openListingInNewTab(link);

          // Ждем задержку между запросами
          if (i > 0) {
            await this.sleep(delay * 1000);
          }

        } catch (error) {
          console.error(`Cian: Ошибка при парсинге объявления ${i + 1}:`, error);
          result.errors++;
        }
      }

    } catch (error) {
      console.error('Cian: Ошибка при парсинге списка:', error);
      result.errors++;
    }

    return result;
  }

  /**
   * Извлечение ссылок на объявления со страницы списка
   */
  extractListingLinks() {
    const links = [];
    const selectors = [
      '[data-name="LinkWrapper"] a',
      '[data-name="CardComponent"] a',
      '.a10a3f92e9--link--39dQH'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const href = el.href;
        if (href && href.includes('/sale/flat/') && href.match(/\/\d+\/$/)) {
          const fullUrl = new URL(href, window.location.origin).href;
          if (!links.includes(fullUrl)) {
            links.push(fullUrl);
          }
        }
      });
    });

    return links;
  }

  /**
   * Открытие объявления в новой вкладке
   */
  async openListingInNewTab(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'openTab',
        url: url
      }, resolve);
    });
  }

  /**
   * Задержка
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Инициализируем парсер только на нужных страницах
if (window.location.hostname.includes('cian.ru')) {
  console.log('🚀 Cian parser script loaded!');
  console.log('Current URL:', window.location.href);
  console.log('Current hostname:', window.location.hostname);

  try {
    console.log('✅ Hostname matches, creating Cian parser...');
    const parser = new CianParser();
    console.log('✅ CianParser created successfully');
    console.log('✅ isListingPage:', parser.isListingPage);

    // Делаем парсер доступным глобально для отладки
    window.cianParser = parser;

  } catch (error) {
    console.error('❌ Error creating CianParser:', error);
  }
} else {
  console.log('❌ Wrong hostname, Cian parser not initialized');
}

console.log('✅ Cian parser initialization complete'); Проверяем, находимся ли мы на странице объявления
   */
  checkIfListingPage() {
    const url = window.location.href;
    return /cian\.ru\/sale\/flat\/\d+/.test(url);
  }

  /**
   * Проверяем, находимся ли мы на странице списка объявлений
   */
  checkIfListPage() {
    const url = window.location.href;
    return /cian\.ru\/sale\/flat/.test(url) && !this.isListingPage;
  }

  /**
   * Обработчик сообщений
   */
  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'parseListing':
          if (this.isListingPage) {
            const listingData = await this.parseCurrentListing();
            if (listingData) {
              // Отправляем данные в background script
              const response = await chrome.runtime.sendMessage({
                action: 'parseListing',
                listingData: listingData,
                segmentId: request.segmentId
              });
              sendResponse(response);
            } else {
              sendResponse({ success: false, error: 'Не удалось извлечь данные объявления' });
            }
          } else {
            sendResponse({ success: false, error: 'Это не страница объявления' });
          }
          break;

        case 'parseAllListings':
          if (this.isListPage) {
            const result = await this.parseAllListingsOnPage(request.segmentId, request.delay);
            sendResponse(result);
          } else {
            sendResponse({ success: false, error: 'Это не страница списка объявлений' });
          }
          break;

        case 'checkStatus':
          const status = this.checkListingStatus();
          sendResponse({ status: status });
          break;

        case 'diagnoseArea':
          this.diagnoseTotalAreaElements();
          sendResponse({ success: true, message: 'Диагностика завершена, проверьте консоль' });
          break;

        default:
          sendResponse({ success: false, error: 'Неизвестное действие' });
      }
    } catch (error) {
      console.error('Ошибка в CianParser:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Парсинг текущего объявления
   */
  async parseCurrentListing() {
    try {
      // Проверяем статус объявления
      const status = this.checkListingStatus();
      if (status !== 'active') {
        return null;
      }

      const data = {
        source: 'cian',
        external_id: this.extractExternalId(),
        url: this.cleanUrl(window.location.href), // ✅ ОЧИЩАЕМ URL
        title: this.extractTitle(),
        address: this.extractAddress(),
        coordinates: this.extractCoordinates(),
        price: this.extractPrice(),
        description: this.extractDescription(),
        photos: this.extractPhotos(),
        listing_date: this.extractListingDate(),
        last_update_date: this.extractUpdateDate(),
        views_count: this.extractViewsCount(),
        seller_name: this.extractSellerName(),
        seller_type: this.extractSellerType(),

        // Характеристики квартиры
        property_type: this.extractPropertyType(),
        area_total: this.extractTotalArea(),
        area_kitchen: this.extractKitchenArea(),
        area_living: this.extractLivingArea(),
        floor: this.extractFloor(),
        floors_total: this.extractFloorsTotal(),
        rooms: this.extractRooms(),
        condition: this.extractCondition(),
        house_type: this.extractHouseType(),
        year_built: this.extractYearBuilt(),
        bathroom_type: this.extractBathroomType(),
        has_balcony: this.extractBalcony(),
        ceiling_height: this.extractCeilingHeight(),

        // Системные поля
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        last_seen: new Date()
      };

      console.log('Cian: Parsed listing data:', data);
      return data;

    } catch (error) {
      console.error('Cian: Error parsing listing:', error);
      return null;
    }
  }

  /**
   * Проверка статуса объявления
   */
  checkListingStatus() {
    // Проверяем на наличие индикаторов архивного объявления
    const archiveIndicators = [
      '.text--color_gray_60',
      '[data-name="ArchivedOfferLabel"]',
      '.a10a3f92e9--removed--3HKV7'
    ];

    for (const selector of archiveIndicators) {
      const indicator = document.querySelector(selector);
      if (indicator && indicator.textContent.includes('архив')) {
        return 'archived';
      }
    }

    return 'active';
  }

  /**
   * ✅ НОВОЕ: Очистка URL от параметров контекста и временных параметров
   */
  cleanUrl(url) {
    try {
      const urlObj = new URL(url);

      // Список параметров для удаления
      const paramsToRemove = [
        'context',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
        '_gl',
        'fbclid',
        'gclid',
        'yclid',
        'ref',
        'source',
        'from',
        'deal_type',
        'engine_version',
        'in_favorites_list'
      ];

      // Удаляем нежелательные параметры
      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // Возвращаем очищенный URL
      const cleanedUrl = urlObj.toString();
      console.log('Cian: URL очищен:', url, '→', cleanedUrl);
      return cleanedUrl;

    } catch (error) {
      console.error('Cian: Ошибка при очистке URL:', error);
      return url; // Возвращаем исходный URL если не удалось очистить
    }
  }

  /**
   * Извлечение external_id из URL
   */
  extractExternalId() {
    const url = window.location.href;
    const patterns = [
      /\/flat\/(\d+)\//,        // Стандартный формат: /flat/123456/
      /\/flat\/(\d+)$/,         // В конце URL: /flat/123456
      /\/flat\/(\d+)#/,         // Перед якорем: /flat/123456#section
      /\/flat\/(\d+)\?/,        // Перед параметрами: /flat/123456?param=...
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        console.log(`Cian: External ID extracted using pattern ${pattern.source}: ${match[1]}`);
        return match[1];
      }
    }

    console.warn('Cian: No external ID found in URL:', url);
    return '';
  }

  /**
   * ✅ УЛУЧШЕННОЕ: Поиск значения характеристики по имени с множественными селекторами
   */
  findCharacteristicValue(paramName) {
    console.log('Cian: Ищем характеристику:', paramName);

    // Обновленные селекторы для новой структуры Cian 2025
    const paramSelectors = [
      // Новая структура 2025
      '[data-testid="object-summary-description-info"] div',
      '[data-name="ObjectSummaryDescription"] div',
      '[data-name="BtiInfo"] div',
      '.a10a3f92e9--info--3GNWS div',

      // Резервные селекторы
      '[data-name="GeneralInfo"] div',
      '.object-summary-description-info div',
      '.a10a3f92e9--item--28HrH',
      '.object-item div',
      '.summary-description div'
    ];

    for (const selector of paramSelectors) {
      const paramItems = document.querySelectorAll(selector);
      console.log(`Cian: Селектор ${selector}: найдено ${paramItems.length} элементов`);

      for (const item of paramItems) {
        const text = item.textContent;
        if (text.toLowerCase().includes(paramName.toLowerCase())) {
          console.log('Cian: Найдена подходящая характеристика:', text);

          // Пробуем разные способы извлечения значения
          const colonSplit = text.split(':');
          if (colonSplit.length > 1) {
            const value = colonSplit[1].trim();
            console.log('Cian: Значение после двоеточия:', value);
            return value;
          }

          // Если нет двоеточия, возвращаем весь текст
          return text.trim();
        }
      }
    }

    console.log('Cian: Характеристика не найдена:', paramName);
    return null;
  }

  /**
   * ✅ КРИТИЧНО УЛУЧШЕННОЕ: Извлечение общей площади с множественными методами
   */
  extractTotalArea() {
    console.log('Cian: Парсинг площади: начинаем поиск');

    // Метод 1: Поиск в характеристиках (основной)
    const areaParam = this.findCharacteristicValue('Общая площадь');
    if (areaParam) {
      console.log('Cian: Найдена площадь в характеристиках:', areaParam);
      const match = areaParam.match(/(\d+(?:[.,]\d+)?)/);
      if (match) {
        const area = parseFloat(match[1].replace(',', '.'));
        console.log('Cian: Извлеченная площадь из характеристик:', area);
        return area;
      }
    }

    // Метод 2: Поиск в заголовке объявления
    const title = this.extractTitle();
    console.log('Cian: Ищем площадь в заголовке:', title);
    if (title) {
      const titlePatterns = [
        /(\d+(?:[.,]\d+)?)\s*м²/i,
        /(\d+(?:[.,]\d+)?)\s*кв\.?\s*м/i,
        /(\d+(?:[.,]\d+)?)\s*м\s*2/i,
        /площадь\s*(\d+(?:[.,]\d+)?)/i
      ];

      for (const pattern of titlePatterns) {
        const match = title.match(pattern);
        if (match) {
          const area = parseFloat(match[1].replace(',', '.'));
          console.log('Cian: Площадь найдена в заголовке:', area);
          return area;
        }
      }
    }

    // Метод 3: Прямой поиск текста "м²" на странице
    const areaElements = document.querySelectorAll('*');
    for (const el of areaElements) {
      const text = el.textContent;
      if (text && text.includes('м²') && text.length < 50) {
        const match = text.match(/(\d+(?:[.,]\d+)?)\s*м²/);
        if (match) {
          const area = parseFloat(match[1].replace(',', '.'));
          if (area > 10 && area < 1000) { // Разумные границы для площади
            console.log('Cian: Площадь найдена прямым поиском:', area, 'в тексте:', text);
            return area;
          }
        }
      }
    }

    // Метод 4: Альтернативные селекторы
    const alternativeSelectors = [
      '[data-testid="object-summary-description-info"]',
      '[data-name="GeneralInfo"]',
      '.a10a3f92e9--info--3GNWS'
    ];

    for (const selector of alternativeSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        const text = container.textContent;
        const areaMatch = text.match(/общая[^:]*:?\s*(\d+(?:[.,]\d+)?)/i);
        if (areaMatch) {
          const area = parseFloat(areaMatch[1].replace(',', '.'));
          console.log('Cian: Площадь найдена альтернативным способом:', area);
          return area;
        }
      }
    }

    console.log('Cian: Площадь не найдена ни одним методом');
    return null;
  }

  /**
   * ✅ НОВОЕ: Диагностическая функция для поиска площади
   */
  diagnoseTotalAreaElements() {
    console.log('=== CIAN: ДИАГНОСТИКА ЭЛЕМЕНТОВ ПЛОЩАДИ ===');

    const areaKeywords = ['площад', 'м²', 'кв', 'общая'];
    const areaElements = [];

    document.querySelectorAll('*').forEach(el => {
      if (el.children.length === 0) { // Только листовые элементы
        const text = el.textContent.toLowerCase();
        for (const keyword of areaKeywords) {
          if (text.includes(keyword) && text.length < 100) {
            areaElements.push({
              text: text.trim(),
              selector: this.getElementSelector(el)
            });
            break;
          }
        }
      }
    });

    console.log('Cian: Элементы с ключевыми словами площади:', areaElements.slice(0, 15));
    console.log('=== CIAN: КОНЕЦ ДИАГНОСТИКИ ===');
  }

  /**
   * Получение селектора элемента
   */
  getElementSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className) {
      return `.${element.className.split(' ')[0]}`;
    }

    const dataName = element.getAttribute('data-name');
    if (dataName) {
      return `[data-name="${dataName}"]`;
    }

    const dataTestId = element.getAttribute('data-testid');
    if (dataTestId) {
      return `[data-testid="${dataTestId}"]`;
    }

    return element.tagName.toLowerCase();
  }

  /**
   * ✅ УЛУЧШЕННОЕ: Извлечение заголовка с новыми селекторами
   */
  extractTitle() {
    const titleSelectors = [
      '[data-name="CardHeaderTitle"] h1',
      '[data-name="ObjectCardHeaderTitle"] h1',
      'h1[data-testid="object-card-title"]',
      '.a10a3f92e9--container--39vnl h1',
      'h1', // Простой селектор h1
      'h1[data-name*="title"]' // Комбинированный
    ];

    for (const selector of titleSelectors) {
      const titleEl = document.querySelector(selector);
      if (titleEl && titleEl.textContent.trim()) {
        console.log(`Cian: Заголовок найден селектором ${selector}:`, titleEl.textContent.trim());
        return titleEl.textContent.trim();
      }
    }

    console.log('Cian: Заголовок не найден ни одним селектором');
    return '';
  }

  /**
   * Извлечение адреса
   */
  extractAddress() {
    const selectors = [
      '[data-name="AddressContainer"] span',
      '[data-name="GeolocationContainer"] span',
      '[data-testid="address-link"]',
      '.a10a3f92e9--address--1SJ4d'
    ];

    for (const selector of selectors) {
      const addressEl = document.querySelector(selector);
      if (addressEl) {
        return addressEl.textContent.trim();
      }
    }
    return '';
  }

  /**
   * Извлечение координат
   */
  extractCoordinates() {
    // Координаты могут быть в data-атрибутах карты
    const mapEl = document.querySelector('[data-latitude][data-longitude]');
    if (mapEl) {
      return {
        lat: parseFloat(mapEl.getAttribute('data-latitude')),
        lon: parseFloat(mapEl.getAttribute('data-longitude'))
      };
    }

    // Или в глобальных переменных страницы
    if (window.cianConfig && window.cianConfig.geo) {
      const geo = window.cianConfig.geo;
      return {
        lat: geo.latitude,
        lon: geo.longitude
      };
    }

    return { lat: null, lon: null };
  }

  /**
   * Извлечение цены
   */
  extractPrice() {
    const selectors = [
      '[data-testid="price-amount"]',
      '[data-name="PriceContainer"] span',
      '.a10a3f92e9--price_value--3F7Vi',
      '.a10a3f92e9--amount--3bJyV'
    ];

    for (const selector of selectors) {
      const priceEl = document.querySelector(selector);
      if (priceEl) {
        const priceText = priceEl.textContent.replace(/[^\d]/g, '');
        const price = parseInt(priceText);
        if (price > 0) return price;
      }
    }
    return null;
  }

  /**
   * Извлечение описания
   */
  extractDescription() {
    const selectors = [
      '[data-name="Description"]',
      '[data-name="ObjectDescriptionContainer"]',
      '.a10a3f92e9--container--2_ccs'
    ];

    for (const selector of selectors) {
      const descEl = document.querySelector(selector);
      if (descEl) {
        return descEl.textContent.trim();
      }
    }
    return '';
  }

  /**
   * Извлечение фотографий
   */
  extractPhotos() {
    const photos = [];
    const selectors = [
      '[data-name="GallerySlider"] img',
      '[data-name="PhotoGallery"] img',
      '.a10a3f92e9--slider--2XBGL img'
    ];

    selectors.forEach(selector => {
      const photoElements = document.querySelectorAll(selector);
      photoElements.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
        if (src && !photos.includes(src) && !src.includes('placeholder')) {
          photos.push(src);
        }
      });
    });

    return photos;
  }

  /**
   * Извлечение даты размещения
   */
  extractListingDate() {
    const selectors = [
      '[data-name="PublishedLabel"]',
      '[data-name="DateContainer"]',
      '.a10a3f92e9--date--2GFXc'
    ];

    for (const selector of selectors) {
      const dateEl = document.querySelector(selector);
      if (dateEl) {
        const dateText = dateEl.textContent.trim();
        return this.parseCianDate(dateText);
      }
    }
    return new Date();
  }

  /**
   * Извлечение даты обновления
   */
  extractUpdateDate() {
    return this.extractListingDate(); // Пока используем дату размещения
  }

  /**
   * Парсинг даты в формате Cian
   */
  parseCianDate(dateText) {
    const now = new Date();

    if (dateText.includes('сегодня')) {
      return now;
    }

    if (dateText.includes('вчера')) {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return yesterday;
    }

    // Парсим даты вида "размещено 15 мая"
    const dateRegex = /(\d{1,2})\s+(\w+)/;
    const match = dateText.match(dateRegex);

    if (match) {
      const day = parseInt(match[1]);
      const monthName = match[2];

      const months = {
        'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
        'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
      };

      const month = months[monthName];
      if (month !== undefined) {
        const date = new Date(now.getFullYear(), month, day);

        // Если дата в будущем, значит это прошлый год
        if (date > now) {
          date.setFullYear(now.getFullYear() - 1);
        }

        return date;
      }
    }

    return now;
  }

  /**
   * Извлечение количества просмотров
   */
  extractViewsCount() {
    const selectors = [
      '[data-name="ViewsCounter"]',
      '.a10a3f92e9--views--3yqbd'
    ];

    for (const selector of selectors) {
      const viewsEl = document.querySelector(selector);
      if (viewsEl) {
        const viewsText = viewsEl.textContent.replace(/[^\d]/g, '');
        return parseInt(viewsText) || null;
      }
    }
    return null;
  }

  /**
   * Извлечение имени продавца
   */
  extractSellerName() {
    const selectors = [
      '[data-name="AuthorAsideInfo"] a',
      '[data-name="OfferAuthor"] a',
      '.a10a3f92e9--link--39dQH'
    ];

    for (const selector of selectors) {
      const sellerEl = document.querySelector(selector);
      if (sellerEl) {
        return sellerEl.textContent.trim();
      }
    }
    return '';
  }

  /**
   * Извлечение типа продавца
   */
  extractSellerType() {
    const selectors = [
      '[data-name="OfferAuthor"] span',
      '.a10a3f92e9--agentName--3K4UO'
    ];

    for (const selector of selectors) {
      const typeEl = document.querySelector(selector);
      if (typeEl && typeEl.textContent.includes('агент')) {
        return 'Агентство';
      }
    }
    return 'Частное лицо';
  }

  /**
   * Извлечение типа недвижимости
   */
  extractPropertyType() {
    const title = this.extractTitle();
    if (title.includes('Студия')) return 'studio';
    if (title.includes('1-комн')) return '1k';
    if (title.includes('2-комн')) return '2k';
    if (title.includes('3-комн')) return '3k';
    if (title.includes('4-комн') || title.includes('5-комн') || title.includes('6-комн')) return '4k+';

    // Альтернативные варианты
    const rooms = this.extractRooms();
    if (rooms === 0) return 'studio';
    if (rooms === 1) return '1k';
    if (rooms === 2) return '2k';
    if (rooms === 3) return '3k';
    if (rooms >= 4) return '4k+';

    return '';
  }

  /**
   * ✅ УЛУЧШЕННОЕ: Извлечение площади кухни
   */
  extractKitchenArea() {
    const areaInfo = this.findCharacteristicValue('Площадь кухни');
    if (areaInfo) {
      const match = areaInfo.match(/(\d+(?:[\.,]\d+)?)/);
      return match ? parseFloat(match[1].replace(',', '.')) : null;
    }
    return null;
  }

  /**
   * ✅ УЛУЧШЕННОЕ: Извлечение жилой площади
   */
  extractLivingArea() {
    const areaInfo = this.findCharacteristicValue('Жилая площадь');
    if (areaInfo) {
      const match = areaInfo.match(/(\d+(?:[\.,]\d+)?)/);
      return match ? parseFloat(match[1].replace(',', '.')) : null;
    }
    return null;
  }

  /**
   * Извлечение этажа
   */
  extractFloor() {
    const floorInfo = this.findCharacteristicValue('Этаж');
    if (floorInfo) {
      const match = floorInfo.match(/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }
    return null;
  }

  /**
   * Извлечение общего количества этажей
   */
  extractFloorsTotal() {
    const floorInfo = this.findCharacteristicValue('Этаж');
    if (floorInfo) {
      const match = floorInfo.match(/из\s+(\d+)/);
      return match ? parseInt(match[1]) : null;
    }
    return null;
  }

  /**
   * Извлечение количества комнат
   */
  extractRooms() {
    const roomsInfo = this.findCharacteristicValue('Комнат');
    if (roomsInfo) {
      const match = roomsInfo.match(/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }

    // Альтернативный способ - из заголовка
    const title = this.extractTitle();
    if (title.includes('Студия')) return 0;
    const roomMatch = title.match(/(\d+)-комн/);
    return roomMatch ? parseInt(roomMatch[1]) : null;
  }

  /**
   * Извлечение состояния ремонта
   */
  extractCondition() {
    const repairInfo = this.findCharacteristicValue('Ремонт');
    if (repairInfo) {
      const repair = repairInfo.toLowerCase();
      if (repair.includes('дизайнерский')) return 'Дизайнерский';
      if (repair.includes('евро')) return 'Евроремонт';
      if (repair.includes('косметический')) return 'Эконом';
      if (repair.includes('хорошее')) return 'Жилое состояние';
      if (repair.includes('без ремонта')) return 'Бетон';
      if (repair.includes('требует')) return 'Не жилое состояние';
    }
    return '';
  }

  /**
   * Извлечение типа дома
   */
  extractHouseType() {
    const houseInfo = this.findCharacteristicValue('Тип дома');
    return houseInfo ? houseInfo.trim() : '';
  }

  /**
   *