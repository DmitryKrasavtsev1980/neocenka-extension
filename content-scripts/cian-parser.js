/**
 * Content script для парсинга страниц Cian.ru
 * Переписанная версия, основанная на структуре AvitoParser
 */

// Проверяем, не был ли класс уже объявлен
if (typeof CianParser === 'undefined') {

class CianParser {
    constructor() {
        // console.log('CianParser constructor called');

        this.isListingPage = this.checkIsListingPage();
        // console.log('isListingPage:', this.isListingPage);

        if (this.isListingPage) {
            this.setupMessageListener();

            // Глобальный доступ к экземпляру парсера
            window.cianParserInstance = this;
            window.CianParser = CianParser; // Делаем класс глобально доступным

            // console.log('✅ CianParser доступен глобально как window.cianParserInstance');
        }
        
        // Инициализируем отладочный режим
        this.initDebugMode();
    }

    /**
     * Инициализирует отладочный режим
     */
    async initDebugMode() {
        try {
            // Пробуем загрузить настройку отладки через chrome.storage
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['neocenka_debug_mode'], (result) => {
                    if (result.neocenka_debug_mode === true) {
                        localStorage.setItem('neocenka_debug_mode', 'true');
                    }
                });
            }
        } catch (error) {
            // Игнорируем ошибки инициализации отладки
        }
    }

    /**
     * Выводит отладочное сообщение в консоль (если отладка включена)
     */
    debugLog(...args) {
        // НЕ выводим отладочные сообщения в production для безопасности
        // Сайт может отслеживать // console.log для обнаружения парсеров
        
        // Только если явно включена отладка через настройки расширения
        if (window.debugLogger && window.debugLogger.isEnabled()) {
            window.debugLogger.log(...args);
        }
        
        // Временно отключено для безопасности:
        // else if (localStorage.getItem('neocenka_debug_mode') === 'true') {
        //     // console.log('[DEBUG]', ...args);
        // }
    }

    /**
     * Проверка, является ли текущая страница страницей объявления
     */
    checkIsListingPage() {
        const url = window.location.href;
        // console.log('Checking if listing page, URL:', url);

        // Проверяем, что это страница квартиры и содержит ID объявления
        const isListingPage = url.includes('/sale/flat/') &&
            url.match(/\/sale\/flat\/\d+/) &&
            !url.includes('/list/');

        // console.log('Is listing page:', isListingPage);
        return isListingPage;
    }

    /**
     * Настройка слушателя сообщений от popup
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // console.log('📨 CianParser Message received:', request);

            if (request.action === 'parseCurrentListing') {
                // console.log('🎯 CianParser: Processing parseCurrentListing');

                if (this.isListingPage) {
                    // console.log('✅ CianParser: Parser instance available');

                    // Используем async/await для правильной обработки Promise
                    this.parseCurrentListing()
                        .then(data => {
                            // console.log('📊 CianParser: Parsed data:', data);

                            if (data) {
                                sendResponse({ success: true, data: data });
                            } else {
                                sendResponse({ success: false, error: 'Не удалось извлечь данные объявления' });
                            }
                        })
                        .catch(error => {
                            // console.error('❌ CianParser: Error in parseCurrentListing:', error);
                            sendResponse({ success: false, error: error.message || 'Ошибка парсинга' });
                        });

                    // КРИТИЧНО: Возвращаем true для асинхронного ответа
                    return true;

                } else {
                    sendResponse({ success: false, error: 'Неподходящая страница для парсинга' });
                }

            } else if (request.action === 'ping') {
                // console.log('🏓 CianParser: Получен ping, отвечаем pong');
                sendResponse({ success: true, message: 'pong' });
                return;

            } else {
                sendResponse({ success: false, error: 'Неизвестное действие' });
            }
        });
    }

    /**
     * Обработчик сообщений (альтернативный метод)
     */
    handleMessage(request, sender, sendResponse) {
        // console.log('📨 CianParser handleMessage:', request);

        if (request.action === 'parseCurrentListing') {
            // console.log('🎯 CianParser: Processing parseCurrentListing');

            if (this.isListingPage) {
                // console.log('✅ CianParser: Parser instance available');

                // Используем async/await для правильной обработки Promise
                this.parseCurrentListing()
                    .then(data => {
                        // console.log('📊 CianParser: Parsed data:', data);

                        if (data) {
                            sendResponse({ success: true, data: data });
                        } else {
                            sendResponse({ success: false, error: 'Не удалось извлечь данные объявления' });
                        }
                    })
                    .catch(error => {
                        // console.error('❌ CianParser: Error in parseCurrentListing:', error);
                        sendResponse({ success: false, error: error.message || 'Ошибка парсинга' });
                    });

                // КРИТИЧНО: Возвращаем true для асинхронного ответа
                return true;

            } else {
                sendResponse({ success: false, error: 'Неподходящая страница для парсинга' });
            }

        } else {
            sendResponse({ success: false, error: 'Неизвестное действие' });
        }

        return false;
    }

    /**
     * Основная функция парсинга объявления
     */
    async parseCurrentListing() {
        // console.log('🚀 === CianParser: НАЧАЛО ПАРСИНГА ОБЪЯВЛЕНИЯ ===');
        // console.log('📍 URL:', window.location.href);
        // console.log('⏰ Время начала:', new Date().toLocaleTimeString());

        let data = {};
        let criticalErrors = 0;
        let optionalWarnings = 0;

        try {
            // ===== 1. ПРОВЕРКА СТАТУСА ОБЪЯВЛЕНИЯ =====
            this.debugLog('\n🔍 === ШАГ 1: ПРОВЕРКА СТАТУСА ===');
            const status = this.checkListingStatus();
            this.debugLog(`📊 Статус объявления: ${status}`);

            // Устанавливаем статус в данных объявления (продолжаем парсинг даже для archived)
            data.status = status;
            
            if (status === 'needs_processing') {
                // console.log('❌ Страница недоступна или повреждена, прекращаем парсинг. Статус:', status);
                return null;
            }
            
            this.debugLog(`✅ Статус определен: ${status}, продолжаем парсинг`);

            // ===== 2. ИЗВЛЕЧЕНИЕ БАЗОВОЙ ИНФОРМАЦИИ =====
            this.debugLog('\n📝 === ШАГ 2: БАЗОВАЯ ИНФОРМАЦИЯ ===');

            try {
                const external_id = this.extractExternalId();
                this.debugLog(`🆔 External ID: "${external_id}"`);
                if (!external_id) {
                    throw new Error('Не удалось извлечь ID объявления');
                }
                data.external_id = external_id;
            } catch (error) {
                // console.error('❌ Критическая ошибка: не удалось извлечь ID объявления:', error);
                criticalErrors++;
                return null;
            }

            // Источник и URL
            data.source = 'cian';
            data.url = this.cleanUrl(window.location.href);
            this.debugLog(`🔗 Очищенный URL: "${data.url}"`);

            // Заголовок
            try {
                data.title = this.extractTitle();
                this.debugLog(`📋 Заголовок: "${data.title}"`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь заголовок:', error);
                data.title = 'Без названия';
                optionalWarnings++;
            }

            // Цена
            try {
                data.price = this.extractPrice();
                this.debugLog(`💰 Цена: ${data.price} руб.`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь цену:', error);
                data.price = 0;
                optionalWarnings++;
            }

            // Описание
            try {
                data.description = this.extractDescription();
                this.debugLog(`📄 Описание (длина): ${data.description ? data.description.length : 0} символов`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь описание:', error);
                data.description = '';
                optionalWarnings++;
            }

            // Адрес
            try {
                data.address = this.extractAddress();
                this.debugLog(`📍 Адрес: "${data.address}"`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь адрес:', error);
                data.address = '';
                optionalWarnings++;
            }

            // ===== 3. ХАРАКТЕРИСТИКИ КВАРТИРЫ =====
            this.debugLog('\n🏠 === ШАГ 3: ХАРАКТЕРИСТИКИ КВАРТИРЫ ===');

            try {
                data.room_count = this.extractRoomCount();
                this.debugLog(`🚪 Количество комнат: ${data.room_count}`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь количество комнат:', error);
                data.room_count = null;
                optionalWarnings++;
            }

            try {
                data.total_area = this.extractTotalArea();
                this.debugLog(`📐 Общая площадь: ${data.total_area} м²`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь общую площадь:', error);
                data.total_area = null;
                optionalWarnings++;
            }

            try {
                data.floor = this.extractFloor();
                data.total_floors = this.extractTotalFloors();
                this.debugLog(`🏢 Этаж: ${data.floor} из ${data.total_floors}`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь этаж:', error);
                data.floor = null;
                data.total_floors = null;
                optionalWarnings++;
            }

            // ===== 4. ДОПОЛНИТЕЛЬНЫЕ ХАРАКТЕРИСТИКИ =====
            this.debugLog('\n🔧 === ШАГ 4: ДОПОЛНИТЕЛЬНЫЕ ХАРАКТЕРИСТИКИ ===');

            try {
                data.year_built = this.extractYearBuilt();
                this.debugLog(`🏗️ Год постройки: ${data.year_built}`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь год постройки:', error);
                data.year_built = null;
                optionalWarnings++;
            }

            try {
                data.bathroom_type = this.extractBathroomType();
                this.debugLog(`🚿 Тип санузла: "${data.bathroom_type}"`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь тип санузла:', error);
                data.bathroom_type = '';
                optionalWarnings++;
            }

            try {
                data.balcony = this.extractBalcony();
                this.debugLog(`🪟 Балкон: ${data.balcony ? 'есть' : 'нет'}`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь информацию о балконе:', error);
                data.balcony = false;
                optionalWarnings++;
            }

            try {
                data.ceiling_height = this.extractCeilingHeight();
                this.debugLog(`📏 Высота потолков: ${data.ceiling_height} м`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь высоту потолков:', error);
                data.ceiling_height = null;
                optionalWarnings++;
            }

            // ===== 5. ИСТОРИЯ ЦЕН =====
            this.debugLog('\n💰 === ШАГ 5: ИСТОРИЯ ЦЕН ===');
            
            try {
                data.price_history = await this.extractPriceHistory();
                this.debugLog(`📈 История цен: ${data.price_history ? data.price_history.length : 0} записей`);
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь историю цен:', error);
                data.price_history = [];
                optionalWarnings++;
            }

            // ===== 6. ДАТА ОБНОВЛЕНИЯ =====
            try {
                data.updated_date = this.extractUpdatedDate();
            } catch (error) {
                // console.warn('⚠️ Не удалось извлечь дату обновления:', error);
                data.updated_date = null;
                optionalWarnings++;
            }

            // ===== 7. ФИНАЛИЗАЦИЯ =====
            data.parsed_at = new Date();
            
            // console.log(`✅ === CianParser: ПАРСИНГ ЗАВЕРШЕН ===`);
            // console.log(`📊 Критических ошибок: ${criticalErrors}`);
            // console.log(`⚠️ Предупреждений: ${optionalWarnings}`);
            // console.log(`⏰ Время завершения: ${new Date().toLocaleTimeString()}`);
            
            return data;

        } catch (error) {
            // console.error('❌ Критическая ошибка парсинга:', error);
            return null;
        }
    }

    /**
     * Проверка статуса объявления
     */
    checkListingStatus() {
        this.debugLog('🔍 Проверяем статус объявления...');
        
        // Проверяем наличие сообщения "Объявление снято с публикации"
        const removedMessages = [
            'Объявление снято с публикации',
            'объявление снято с публикации',
            'Снято с публикации',
            'снято с публикации',
            'Объявление неактуально',
            'объявление неактуально'
        ];
        
        // Ищем текст в любых элементах
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
            const text = element.textContent || '';
            for (const message of removedMessages) {
                if (text.includes(message)) {
                    this.debugLog(`📍 Найдено сообщение о снятии: "${message}"`);
                    return 'archived';
                }
            }
        }
        
        // Проверяем CSS классы для снятых объявлений
        const removedSelectors = [
            '.offer-expired',
            '.offer-removed', 
            '[data-testid="offer-expired"]',
            '.a10a3f92e9--removed--',
            '.offer-status-removed',
            '.offer-inactive',
            '.listing-removed'
        ];

        for (const selector of removedSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                this.debugLog(`📍 Найден CSS селектор снятого объявления: ${selector}`);
                return 'archived';
            }
        }
        
        // Проверяем заголовок страницы
        const pageTitle = document.title || '';
        if (pageTitle.includes('снято') || pageTitle.includes('неактуально') || pageTitle.includes('удален')) {
            this.debugLog('📍 Заголовок страницы указывает на снятое объявление');
            return 'archived';
        }

        // Проверяем наличие основных элементов страницы
        const titleElement = document.querySelector('[data-testid="offer-title"], h1');
        
        if (!titleElement) {
            this.debugLog('❌ Заголовок не найден - статус needs_processing');
            return 'needs_processing';
        }

        // Для архивных объявлений цена может отсутствовать, это нормально
        const priceElement = document.querySelector('[data-testid="price-amount"], [data-testid="offer-price"]');
        if (!priceElement) {
            this.debugLog('⚠️ Цена не найдена - возможно объявление архивное');
        }

        this.debugLog('✅ Основные элементы найдены');
        return 'active';
    }

    /**
     * Извлечение ID объявления из URL
     */
    extractExternalId() {
        const url = window.location.href;
        const match = url.match(/\/sale\/flat\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Очистка URL от параметров
     */
    cleanUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.origin + urlObj.pathname;
        } catch (error) {
            return url;
        }
    }

    /**
     * Извлечение заголовка объявления
     */
    extractTitle() {
        const selectors = [
            '[data-testid="offer-title"]',
            'h1[data-testid="offer-title"]',
            '.a10a3f92e9--title--vlZwT',
            'h1'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }
        
        throw new Error('Не найден заголовок объявления');
    }

    /**
     * Извлечение цены
     */
    extractPrice() {
        const selectors = [
            '[data-testid="price-amount"]',
            '[data-testid="offer-price"]',
            '.a10a3f92e9--price--vlBHe',
            '.a10a3f92e9--amount--Wt4mg'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const priceText = element.textContent.replace(/[^\d]/g, '');
                const price = parseInt(priceText);
                if (price && price > 0) {
                    return price;
                }
            }
        }
        
        // Для архивных объявлений цена может отсутствовать
        this.debugLog('⚠️ Цена не найдена - возможно архивное объявление');
        return 0;
    }

    /**
     * Извлечение описания
     */
    extractDescription() {
        const selectors = [
            '[data-testid="offer-description-text"]',
            '.a10a3f92e9--description--ByeBu',
            '.offer-description-text'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }
        
        return ''; // Описание может отсутствовать
    }

    /**
     * Извлечение адреса
     */
    extractAddress() {
        const selectors = [
            '[data-testid="address-text"]',
            '.a10a3f92e9--address--u2a3U',
            '.offer-address-text'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }
        
        return ''; // Адрес может отсутствовать
    }

    /**
     * Извлечение количества комнат
     */
    extractRoomCount() {
        const titleElement = document.querySelector('[data-testid="offer-title"], h1');
        if (titleElement) {
            const title = titleElement.textContent;
            const match = title.match(/(\d+)-комн/);
            if (match) {
                return parseInt(match[1]);
            }
        }
        
        return null;
    }

    /**
     * Извлечение общей площади
     */
    extractTotalArea() {
        const area = this.findCharacteristicValue('Общая площадь');
        if (area) {
            const match = area.match(/(\d+(?:[,\.]\d+)?)/);
            if (match) {
                return parseFloat(match[1].replace(',', '.'));
            }
        }
        
        return null;
    }

    /**
     * Извлечение этажа
     */
    extractFloor() {
        const floor = this.findCharacteristicValue('Этаж');
        if (floor) {
            const match = floor.match(/(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }
        
        return null;
    }

    /**
     * Извлечение общего количества этажей
     */
    extractTotalFloors() {
        const floor = this.findCharacteristicValue('Этаж');
        if (floor) {
            const match = floor.match(/из (\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }
        
        return null;
    }

    /**
     * Извлечение года постройки
     */
    extractYearBuilt() {
        const yearInfo = this.findCharacteristicValue('Год постройки');
        if (yearInfo) {
            const match = yearInfo.match(/(\d{4})/);
            if (match) {
                return parseInt(match[1]);
            }
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
            const match = ceilingInfo.match(/(\d+(?:[.,]\d+)?)/);
            if (match) {
                return parseFloat(match[1].replace(',', '.'));
            }
        }
        
        return null;
    }

    /**
     * Извлечение даты обновления объявления
     */
    extractUpdatedDate() {
        // Сначала ищем по точному селектору
        const metadataElement = document.querySelector('[data-testid="metadata-updated-date"]');
        
        if (metadataElement) {
            const text = metadataElement.textContent || '';
            return text.trim(); // Возвращаем сырой текст
        }
        
        // Альтернативный поиск в контейнере метаданных
        const metadataContainer = document.querySelector('[data-name="OfferMetaData"]');
        
        if (metadataContainer) {
            const text = metadataContainer.textContent || '';
            
            // Ищем подстроку с "Обновлено" в тексте
            const match = text.match(/Обновлено:[^0-9]*\d{1,2}\s+\w+[,\s]*\d{2}:\d{2}/i);
            if (match) {
                return match[0].trim(); // Возвращаем найденную подстроку
            }
        }
        
        return null;
    }

    /**
     * Парсинг русской даты с временем
     */
    parseRussianDateWithTime(dateString) {
        const months = {
            'янв': 0, 'января': 0,
            'фев': 1, 'февраля': 1,
            'мар': 2, 'марта': 2,
            'апр': 3, 'апреля': 3,
            'мая': 4, 'май': 4,
            'июн': 5, 'июня': 5,
            'июл': 6, 'июля': 6,
            'авг': 7, 'августа': 7,
            'сен': 8, 'сентября': 8,
            'окт': 9, 'октября': 9,
            'ноя': 10, 'ноября': 10,
            'дек': 11, 'декабря': 11
        };
        
        try {
            // Убираем запятые и лишние пробелы
            const cleaned = dateString.trim().replace(',', '');
            
            // Пробуем разные форматы
            // Формат: "31 июл, 09:01" или "31 июл 09:01"
            let match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{1,2}):(\d{2})/);
            if (match) {
                const day = parseInt(match[1]);
                const monthName = match[2].toLowerCase();
                const hour = parseInt(match[3]);
                const minute = parseInt(match[4]);
                
                const month = months[monthName];
                if (month !== undefined) {
                    // Год берем текущий, так как обычно в объявлениях не указывают год
                    const year = new Date().getFullYear();
                    return new Date(year, month, day, hour, minute);
                }
            }
            
            // Формат: "31 июл"
            match = cleaned.match(/(\d{1,2})\s+(\w+)/);
            if (match) {
                const day = parseInt(match[1]);
                const monthName = match[2].toLowerCase();
                
                const month = months[monthName];
                if (month !== undefined) {
                    const year = new Date().getFullYear();
                    return new Date(year, month, day);
                }
            }
            
            return null;
        } catch (error) {
            // console.error('Ошибка парсинга даты с временем:', error);
            return null;
        }
    }

    /**
     * Поиск значения характеристики по названию
     */
    findCharacteristicValue(characteristicName) {
        // Пробуем разные селекторы для характеристик
        const selectors = [
            '[data-testid="object-summary-description-item"]',
            '.a10a3f92e9--item--KxHEQ',
            '.offer-summary-item'
        ];
        
        for (const selector of selectors) {
            const items = document.querySelectorAll(selector);
            for (const item of items) {
                const text = item.textContent;
                if (text.includes(characteristicName)) {
                    // Извлекаем значение после двоеточия или тире
                    const match = text.match(new RegExp(characteristicName + '[:\\-]?\\s*(.+)', 'i'));
                    if (match) {
                        return match[1].trim();
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Извлечение истории цен
     */
    async extractPriceHistory() {
        this.debugLog('💰 Начинаем извлечение истории цен...');
        
        try {
            // Сначала ищем уже видимую историю цен в DOM
            let priceHistory = this.findVisiblePriceHistory();
            if (priceHistory.length > 0) {
                this.debugLog(`✅ Найдена видимая история цен: ${priceHistory.length} записей`);
                return priceHistory;
            }
            
            // Ищем кнопку истории цен по новой структуре
            const priceHistoryButton = document.querySelector('[data-name="PriceHistoryButton"]');
            if (!priceHistoryButton) {
                this.debugLog('❌ Кнопка истории цен [data-name="PriceHistoryButton"] не найдена');
                return [];
            }
            
            this.debugLog('📍 Найдена кнопка истории цен');
            
            // Наводим мышь на кнопку для появления popup
            try {
                this.debugLog('🖱️ Наводим мышь на кнопку истории цен...');
                
                // Пробуем несколько способов активации popup
                const events = [
                    new MouseEvent('mouseenter', { view: window, bubbles: true, cancelable: true }),
                    new MouseEvent('mouseover', { view: window, bubbles: true, cancelable: true }),
                    new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true }),
                    new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true })
                ];
                
                for (const event of events) {
                    priceHistoryButton.dispatchEvent(event);
                    await this.sleep(100);
                }
                
                // Проверяем появление popup несколько раз
                let priceHistoryWidget = null;
                for (let attempt = 1; attempt <= 5; attempt++) {
                    this.debugLog(`🔍 Попытка ${attempt}/5 найти popup...`);
                    
                    await this.sleep(300);
                    priceHistoryWidget = document.querySelector('[data-testid="price-history-widget"]');
                    
                    if (priceHistoryWidget) {
                        this.debugLog(`✅ Popup найден на попытке ${attempt}`);
                        break;
                    }
                    
                    // Повторно активируем hover
                    const hoverEvent = new MouseEvent('mouseover', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    priceHistoryButton.dispatchEvent(hoverEvent);
                }
                
                if (!priceHistoryWidget) {
                    this.debugLog('❌ Popup с историей цен так и не появился после всех попыток');
                    
                    // Пробуем найти popup в других местах DOM
                    const allPopups = document.querySelectorAll('.a10a3f92e9--popup--fimrB, .popup, .tooltip');
                    this.debugLog(`🔍 Найдено ${allPopups.length} других popup элементов`);
                    
                    for (const popup of allPopups) {
                        if (popup.textContent.includes('История цены')) {
                            this.debugLog('✅ Найден popup с текстом "История цены"');
                            const widget = popup.querySelector('[data-testid="price-history-widget"]');
                            if (widget) {
                                priceHistoryWidget = widget;
                                break;
                            }
                        }
                    }
                }
                
                if (!priceHistoryWidget) {
                    this.debugLog('❌ Popup с историей цен не найден нигде');
                    return [];
                }
                
                this.debugLog('✅ Найден popup с историей цен, начинаем парсинг');
                
                // Парсим таблицу с историей
                priceHistory = this.parsePriceHistoryTable(priceHistoryWidget);
                
                // Убираем мышь с кнопки для скрытия popup
                const mouseLeaveEvent = new MouseEvent('mouseleave', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                priceHistoryButton.dispatchEvent(mouseLeaveEvent);
                
                this.debugLog(`✅ Извлечено ${priceHistory.length} записей истории цен`);
                return priceHistory;
                
            } catch (hoverError) {
                this.debugLog('⚠️ Ошибка при наведении мыши:', hoverError.message);
                return [];
            }
            
        } catch (error) {
            this.debugLog('❌ Ошибка при извлечении истории цен:', error.message);
            return [];
        }
    }
    
    /**
     * Поиск видимой истории цен в DOM
     */
    findVisiblePriceHistory() {
        const priceHistory = [];
        
        try {
            this.debugLog('🔍 Ищем уже видимую историю цен в DOM...');
            
            // Сначала проверяем, есть ли уже popup в DOM
            const existingWidget = document.querySelector('[data-testid="price-history-widget"]');
            if (existingWidget) {
                this.debugLog('✅ Найден существующий popup с историей цен');
                return this.parsePriceHistoryTable(existingWidget);
            }
            
            // Ищем элементы, которые могут содержать историю цен
            const historySelectors = [
                '.a10a3f92e9--history-event--xUQ_P', // Строки таблицы истории
                '.price-history-item',
                '.history-item',
                '.price-change-item',
                '[data-testid*="price-history"]',
                '[data-testid*="history"]'
            ];
            
            for (const selector of historySelectors) {
                const items = document.querySelectorAll(selector);
                this.debugLog(`🔍 Найдено ${items.length} элементов для селектора: ${selector}`);
                
                for (const item of items) {
                    const historyItem = this.parsePriceHistoryItem(item.textContent);
                    if (historyItem) {
                        priceHistory.push(historyItem);
                    }
                }
            }
            
            this.debugLog(`📊 Найдено ${priceHistory.length} записей в видимой истории`);
            
        } catch (error) {
            this.debugLog('⚠️ Ошибка поиска видимой истории:', error.message);
        }
        
        return priceHistory;
    }
    
    /**
     * Поиск истории цен в модальных окнах
     */
    findModalPriceHistory() {
        const priceHistory = [];
        
        try {
            // Ищем модальные окна
            const modalSelectors = [
                '[data-testid="price-history-modal"]',
                '.modal',
                '.popup',
                '.tooltip',
                '.price-history-modal',
                '.overlay'
            ];
            
            for (const selector of modalSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (element.textContent.includes('История цены') || 
                        element.textContent.includes('история цены')) {
                        
                        // Парсим историю цен из модального окна
                        const rows = element.querySelectorAll('tr, .history-item, .price-item, div');
                        
                        for (const row of rows) {
                            const historyItem = this.parsePriceHistoryItem(row.textContent);
                            if (historyItem) {
                                priceHistory.push(historyItem);
                            }
                        }
                        
                        if (priceHistory.length > 0) {
                            this.debugLog(`📍 Найдено модальное окно с историей: ${selector}`);
                            return priceHistory;
                        }
                    }
                }
            }
            
        } catch (error) {
            this.debugLog('⚠️ Ошибка поиска модальной истории:', error.message);
        }
        
        return priceHistory;
    }
    
    /**
     * Парсинг одного элемента истории цен
     */
    parsePriceHistoryItem(text) {
        try {
            const trimmedText = text.trim();
            
            // Ищем паттерн: дата + цена
            const dateMatch = trimmedText.match(/(\d{1,2}\s+\w+\s+\d{4})/);
            const priceMatch = trimmedText.match(/(\d[\d\s]*)\s*[₽р]/);
            
            if (dateMatch && priceMatch) {
                const date = this.parseRussianDate(dateMatch[1]);
                const price = parseInt(priceMatch[1].replace(/\s/g, ''));
                
                if (date && price && price > 0) {
                    this.debugLog(`📅 Найдена запись истории: ${dateMatch[1]} - ${price} ₽`);
                    return {
                        date: date,
                        price: price
                    };
                }
            }
            
        } catch (error) {
            // Игнорируем ошибки парсинга отдельных элементов
        }
        
        return null;
    }
    
    /**
     * Парсинг таблицы истории цен из popup
     */
    parsePriceHistoryTable(widget) {
        const priceHistory = [];
        
        try {
            // Ищем таблицу с историей в widget
            const historyTable = widget.querySelector('.a10a3f92e9--history--JRbxR');
            if (!historyTable) {
                this.debugLog('❌ Таблица истории цен не найдена');
                return [];
            }
            
            // Парсим строки таблицы
            const rows = historyTable.querySelectorAll('.a10a3f92e9--history-event--xUQ_P');
            this.debugLog(`📊 Найдено ${rows.length} строк в таблице истории`);
            
            for (const row of rows) {
                try {
                    // Извлекаем дату
                    const dateCell = row.querySelector('.a10a3f92e9--event-date--BvijC');
                    if (!dateCell) continue;
                    
                    const dateText = dateCell.textContent.trim();
                    this.debugLog(`📅 Обрабатываем дату: "${dateText}"`);
                    
                    // Извлекаем цену
                    const priceCell = row.querySelector('.a10a3f92e9--event-price--xNv2v');
                    if (!priceCell) continue;
                    
                    const priceText = priceCell.textContent.trim();
                    this.debugLog(`💰 Обрабатываем цену: "${priceText}"`);
                    
                    // Парсим дату (формат: "29 июл 2025")
                    const date = this.parseRussianDateWithYear(dateText);
                    if (!date) {
                        this.debugLog(`⚠️ Не удалось распарсить дату: "${dateText}"`);
                        continue;
                    }
                    
                    // Парсим цену (формат: "5 300 000 ₽")
                    const priceMatch = priceText.match(/(\d[\d\s]*)/);
                    if (!priceMatch) {
                        this.debugLog(`⚠️ Не удалось распарсить цену: "${priceText}"`);
                        continue;
                    }
                    
                    const price = parseInt(priceMatch[1].replace(/\s/g, ''));
                    if (!price || price <= 0) {
                        this.debugLog(`⚠️ Некорректная цена: ${price}`);
                        continue;
                    }
                    
                    // Добавляем запись в историю
                    priceHistory.push({
                        date: date,
                        price: price
                    });
                    
                    this.debugLog(`✅ Добавлена запись: ${dateText} - ${price} ₽`);
                    
                } catch (rowError) {
                    this.debugLog(`⚠️ Ошибка обработки строки: ${rowError.message}`);
                    continue;
                }
            }
            
            // Сортируем по дате (от старых к новым)
            priceHistory.sort((a, b) => a.date - b.date);
            
            this.debugLog(`✅ Успешно извлечено ${priceHistory.length} записей истории цен`);
            return priceHistory;
            
        } catch (error) {
            this.debugLog(`❌ Ошибка парсинга таблицы истории: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Парсинг русской даты с годом (формат: "29 июл 2025")
     */
    parseRussianDateWithYear(dateString) {
        const months = {
            'янв': 0, 'января': 0,
            'фев': 1, 'февраля': 1,
            'мар': 2, 'марта': 2,
            'апр': 3, 'апреля': 3,
            'мая': 4, 'май': 4,
            'июн': 5, 'июня': 5,
            'июл': 6, 'июля': 6,
            'авг': 7, 'августа': 7,
            'сен': 8, 'сентября': 8,
            'окт': 9, 'октября': 9,
            'ноя': 10, 'ноября': 10,
            'дек': 11, 'декабря': 11
        };
        
        try {
            const parts = dateString.trim().split(/\s+/);
            if (parts.length !== 3) {
                this.debugLog(`⚠️ Неправильный формат даты: "${dateString}", ожидается 3 части`);
                return null;
            }
            
            const day = parseInt(parts[0]);
            const monthName = parts[1].toLowerCase();
            const year = parseInt(parts[2]);
            
            const month = months[monthName];
            if (month === undefined) {
                this.debugLog(`⚠️ Неизвестный месяц: "${monthName}"`);
                return null;
            }
            
            const date = new Date(year, month, day);
            this.debugLog(`✅ Дата распарсена: ${date.toISOString().split('T')[0]}`);
            return date;
            
        } catch (error) {
            this.debugLog(`❌ Ошибка парсинга даты с годом: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Парсинг русской даты в объект Date
     */
    parseRussianDate(dateString) {
        const months = {
            'янв': 0, 'января': 0,
            'фев': 1, 'февраля': 1,
            'мар': 2, 'марта': 2,
            'апр': 3, 'апреля': 3,
            'мая': 4, 'май': 4,
            'июн': 5, 'июня': 5,
            'июл': 6, 'июля': 6,
            'авг': 7, 'августа': 7,
            'сен': 8, 'сентября': 8,
            'окт': 9, 'октября': 9,
            'ноя': 10, 'ноября': 10,
            'дек': 11, 'декабря': 11
        };
        
        try {
            const parts = dateString.trim().split(/\s+/);
            if (parts.length !== 3) return null;
            
            const day = parseInt(parts[0]);
            const monthName = parts[1].toLowerCase();
            const year = parseInt(parts[2]);
            
            const month = months[monthName];
            if (month === undefined) return null;
            
            return new Date(year, month, day);
        } catch (error) {
            // console.error('Ошибка парсинга даты:', error);
            return null;
        }
    }
    
    /**
     * Задержка в миллисекундах
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Инициализируем парсер только на нужных страницах
if (window.location.hostname.includes('cian.ru')) {
  // console.log('🚀 Cian parser script loaded!');
  // console.log('Current URL:', window.location.href);
  // console.log('Current hostname:', window.location.hostname);

  try {
    // console.log('✅ Hostname matches, creating Cian parser...');
    const parser = new CianParser();
    // console.log('✅ CianParser created successfully');
    // console.log('✅ isListingPage:', parser.isListingPage);

    // Делаем парсер доступным глобально для отладки
    window.cianParser = parser;

  } catch (error) {
    // console.error('❌ Error creating CianParser:', error);
  }
} else {
  // console.log('❌ Wrong hostname, Cian parser not initialized');
}

// console.log('✅ Cian parser initialization complete');

// Глобальный обработчик сообщений для совместимости
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // console.log('📨 GLOBAL CianParser: Получено сообщение:', request);
    
    if (request.action === 'ping') {
        // console.log('🏓 GLOBAL CianParser: Получен ping, отвечаем pong');
        sendResponse({ success: true, message: 'pong' });
        return;
    }
    
    if (request.action === 'parseCurrentListing') {
        // console.log('🎯 GLOBAL CianParser: Processing parseCurrentListing');
        
        // Проверяем, что это страница объявления
        const url = window.location.href;
        const isListingPage = /\.?cian\.ru\/sale\/flat\/\d+/.test(url);
        
        if (!isListingPage) {
            // console.log('❌ GLOBAL CianParser: Неподходящая страница для парсинга');
            sendResponse({ success: false, error: 'Неподходящая страница для парсинга' });
            return;
        }
        
        // Пытаемся использовать существующий экземпляр или создать новый
        let parserInstance = window.cianParserInstance || window.cianParser;
        
        if (!parserInstance) {
            // console.log('🔧 GLOBAL CianParser: Создаем новый экземпляр парсера');
            try {
                parserInstance = new CianParser();
                window.cianParserInstance = parserInstance;
                // console.log('✅ GLOBAL CianParser: Новый парсер создан успешно');
            } catch (error) {
                // console.error('❌ GLOBAL CianParser: Ошибка создания парсера:', error);
                sendResponse({ success: false, error: 'Не удалось создать парсер' });
                return;
            }
        }
        
        if (parserInstance && parserInstance.parseCurrentListing) {
            // console.log('✅ GLOBAL CianParser: Используем экземпляр парсера');
            
            parserInstance.parseCurrentListing()
                .then(data => {
                    // console.log('📊 GLOBAL CianParser: Данные получены:', data);
                    if (data) {
                        sendResponse({ success: true, data: data });
                    } else {
                        sendResponse({ success: false, error: 'Не удалось извлечь данные объявления' });
                    }
                })
                .catch(error => {
                    // console.error('❌ GLOBAL CianParser: Ошибка парсинга:', error);
                    sendResponse({ success: false, error: error.message || 'Ошибка парсинга' });
                });
                
            return true; // Асинхронный ответ
        } else {
            // console.error('❌ GLOBAL CianParser: Парсер недоступен');
            sendResponse({ success: false, error: 'Парсер недоступен' });
        }
    }
});

} // Закрываем проверку typeof CianParser