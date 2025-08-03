/**
 * Content script для парсинга страниц Avito.ru
 */

// Проверяем, не был ли класс уже объявлен
if (typeof AvitoParser === 'undefined') {

class AvitoParser {
    constructor() {
        //console.log('AvitoParser constructor called');

        this.isListingPage = this.checkIsListingPage();
        //console.log('isListingPage:', this.isListingPage);

        if (this.isListingPage) {
            this.setupMessageListener();

            // ✅ ДОБАВЛЯЕМ: Глобальный доступ к экземпляру парсера
            window.avitoParserInstance = this;
            window.AvitoParser = AvitoParser; // Делаем класс глобально доступным

            //console.log('✅ AvitoParser доступен глобально как window.avitoParserInstance');
        }
        this.setupAPIInterception();
        this.foundPriceHistory = null;
        
        // Инициализируем отладочный режим
        this.initDebugMode();
        
        // Инициализируем отслеживание изменений цен при скроллинге
        setTimeout(() => {
            this.initScrollPriceTracking();
        }, 3000); // Даём время странице загрузиться
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
     * @param {...any} args - аргументы для console.log
     */
    debugLog(...args) {
        // Проверяем доступность глобального отладочного логгера
        if (window.debugLogger && window.debugLogger.isEnabled()) {
            window.debugLogger.log(...args);
        }
        // Fallback: если логгер недоступен, но пользователь мог включить отладку в localStorage
        else if (localStorage.getItem('neocenka_debug_mode') === 'true') {
            console.log('[DEBUG]', ...args);
        }
    }

    /**
     * Проверка, является ли текущая страница страницей объявления
     */
    checkIsListingPage() {
        const url = window.location.href;
        // console.log('Checking if listing page, URL:', url);

        // Проверяем, что это страница квартиры и содержит ID объявления
        const isListingPage = url.includes('/kvartiry/') &&
            url.match(/\/kvartiry\/.*_\d+/) &&
            !url.includes('/list/');

        // console.log('Is listing page:', isListingPage);
        return isListingPage;
    }

    /**
     * Настройка слушателя сообщений от popup
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('📨 Message received:', request);

            if (request.action === 'parseCurrentListing') {
                console.log('🎯 Processing parseCurrentListing');

                if (this.isListingPage) {
                    console.log('✅ Parser instance available');

                    // ВАЖНО: Используем async/await для правильной обработки Promise
                    this.parseCurrentListing()
                        .then(data => {
                            console.log('📊 Parsed data:', data);

                            if (data) {
                                sendResponse({ success: true, data: data });
                            } else {
                                sendResponse({ success: false, error: 'Не удалось извлечь данные объявления' });
                            }
                        })
                        .catch(error => {
                            console.error('❌ Error in parseCurrentListing:', error);
                            sendResponse({ success: false, error: error.message || 'Ошибка парсинга' });
                        });

                    // КРИТИЧНО: Возвращаем true для асинхронного ответа
                    return true;

                } else {
                    sendResponse({ success: false, error: 'Неподходящая страница для парсинга' });
                }

            } else if (request.action === 'startMassParsing') {
                console.log('🎯 Processing startMassParsing');

                // Запускаем массовый парсинг
                this.startMassParsing(request.settings)
                    .then(result => {
                        sendResponse({ success: true, data: result });
                    })
                    .catch(error => {
                        console.error('❌ Error in startMassParsing:', error);
                        sendResponse({ success: false, error: error.message || 'Ошибка массового парсинга' });
                    });

                return true; // Асинхронный ответ

            } else if (request.action === 'parseMassByFilter') {
                console.log('🎯 Processing parseMassByFilter');

                // Запускаем парсинг по фильтру
                this.parseMassByFilter(request.areaId)
                    .then(result => {
                        sendResponse({ success: true, parsed: result.parsed, errors: result.errors });
                    })
                    .catch(error => {
                        console.error('❌ Error in parseMassByFilter:', error);
                        sendResponse({ success: false, error: error.message || 'Ошибка парсинга по фильтру' });
                    });

                return true; // Асинхронный ответ

            } else {
                sendResponse({ success: false, error: 'Неизвестное действие' });
            }
        });
    }

    /**
     * Обработчик сообщений (альтернативный метод)
     */
    handleMessage(request, sender, sendResponse) {
        console.log('📨 AvitoParser handleMessage:', request);

        if (request.action === 'parseCurrentListing') {
            console.log('🎯 Processing parseCurrentListing');

            if (this.isListingPage) {
                console.log('✅ Parser instance available');

                // ВАЖНО: Используем async/await для правильной обработки Promise
                this.parseCurrentListing()
                    .then(data => {
                        console.log('📊 Parsed data:', data);

                        if (data) {
                            sendResponse({ success: true, data: data });
                        } else {
                            sendResponse({ success: false, error: 'Не удалось извлечь данные объявления' });
                        }
                    })
                    .catch(error => {
                        console.error('❌ Error in parseCurrentListing:', error);
                        sendResponse({ success: false, error: error.message || 'Ошибка парсинга' });
                    });

                // КРИТИЧНО: Возвращаем true для асинхронного ответа
                return true;

            } else {
                sendResponse({ success: false, error: 'Неподходящая страница для парсинга' });
            }

        } else if (request.action === 'startMassParsing') {
            console.log('🎯 Processing startMassParsing');

            // Запускаем массовый парсинг
            this.startMassParsing(request.settings)
                .then(result => {
                    sendResponse({ success: true, data: result });
                })
                .catch(error => {
                    console.error('❌ Error in startMassParsing:', error);
                    sendResponse({ success: false, error: error.message || 'Ошибка массового парсинга' });
                });

            return true; // Асинхронный ответ

        } else {
            sendResponse({ success: false, error: 'Неизвестное действие' });
        }

        return false;
    }

    /**
     * Основная функция парсинга объявления
     */

    async parseCurrentListing() {
        console.log('🚀 === НАЧАЛО ПАРСИНГА ОБЪЯВЛЕНИЯ ===');
        console.log('📍 URL:', window.location.href);
        console.log('⏰ Время начала:', new Date().toLocaleTimeString());

        // ВАЖНО: Инициализируем переменную data в начале функции
        let data = {};
        let criticalErrors = 0;
        let optionalWarnings = 0;

        try {
            // ===== 1. ПРОВЕРКА СТАТУСА ОБЪЯВЛЕНИЯ =====
            this.debugLog('\n🔍 === ШАГ 1: ПРОВЕРКА СТАТУСА ===');
            const status = this.checkListingStatus();
            this.debugLog(`📊 Статус объявления: ${status}`);

            if (status !== 'active') {
                console.log('❌ Объявление неактивно, прекращаем парсинг. Статус:', status);
                return null;
            }
            this.debugLog('✅ Объявление активно, продолжаем парсинг');
            
            // Устанавливаем статус в данных объявления
            data.status = status;

            // ===== 2. ИЗВЛЕЧЕНИЕ БАЗОВОЙ ИНФОРМАЦИИ =====
            this.debugLog('\n📝 === ШАГ 2: БАЗОВАЯ ИНФОРМАЦИЯ ===');

            try {
                const external_id = this.extractExternalId();
                this.debugLog(`🆔 External ID: "${external_id}"`);
                if (!external_id) {
                    this.debugLog('❌ КРИТИЧЕСКАЯ ОШИБКА: External ID не найден');
                    criticalErrors++;
                }
                data.external_id = external_id;
            } catch (error) {
                this.debugLog('❌ Ошибка извлечения External ID:', error.message);
                criticalErrors++;
                data.external_id = null;
            }

            try {
                const title = this.extractTitle();
                //console.log(`📋 Заголовок: "${title}"`);
                if (!title) {
                    //console.log('⚠️ Заголовок не найден');
                    optionalWarnings++;
                }
                data.title = title;
            } catch (error) {
                console.log('❌ Ошибка извлечения заголовка:', error.message);
                optionalWarnings++;
                data.title = null;
            }

            try {
                const address = this.extractAddress();
                //console.log(`📍 Адрес: "${address}"`);
                if (!address) {
                    //console.log('⚠️ Адрес не найден');
                    optionalWarnings++;
                }
                data.address = address;
            } catch (error) {
                console.log('❌ Ошибка извлечения адреса:', error.message);
                optionalWarnings++;
                data.address = null;
            }

            try {
                const price = this.extractPrice();
                //console.log(`💰 Цена: ${price ? this.formatPrice(price) : 'НЕ НАЙДЕНА'}`);
                if (!price) {
                    //console.log('❌ КРИТИЧЕСКАЯ ОШИБКА: Цена не найдена');
                    criticalErrors++;
                }
                data.price = price;
            } catch (error) {
                console.log('❌ Ошибка извлечения цены:', error.message);
                criticalErrors++;
                data.price = null;
            }

            // ===== 3. КООРДИНАТЫ И МЕДИА =====
            //console.log('\n🗺️ === ШАГ 3: КООРДИНАТЫ И МЕДИА ===');

            try {
                const coordinates = this.extractCoordinates();
                //console.log(`📍 Координаты: lat=${coordinates?.lat}, lon=${coordinates?.lon}`);
                data.coordinates = coordinates;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения координат:', error.message);
                optionalWarnings++;
                data.coordinates = null;
            }

            try {
                const photos = this.extractPhotos();
                //console.log(`📸 Фотографий: ${photos ? photos.length : 0}`);
                if (photos && photos.length > 0) {
                    //console.log('📸 Первое фото:', photos[0]?.substring(0, 50) + '...');
                }
                data.photos = photos;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения фотографий:', error.message);
                optionalWarnings++;
                data.photos = [];
            }

            // ===== 4. ПАРСИНГ ПЛОЩАДЕЙ =====
            //console.log('\n📐 === ШАГ 4: ПАРСИНГ ПЛОЩАДЕЙ ===');

            try {
                const area_total = this.extractTotalArea();
                //console.log(`📐 Общая площадь: ${area_total} м²`);
                data.area_total = area_total;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения общей площади:', error.message);
                optionalWarnings++;
                data.area_total = null;
            }

            try {
                const area_kitchen = this.extractKitchenArea();
                //console.log(`🍳 Площадь кухни: ${area_kitchen} м²`);
                data.area_kitchen = area_kitchen;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения площади кухни:', error.message);
                optionalWarnings++;
                data.area_kitchen = null;
            }

            try {
                const area_living = this.extractLivingArea();
                //console.log(`🏠 Жилая площадь: ${area_living} м²`);
                data.area_living = area_living;
                //console.log('✅ Найдены площади: общая, кухня, жилая');
            } catch (error) {
                console.log('⚠️ Ошибка извлечения жилой площади:', error.message);
                optionalWarnings++;
                data.area_living = null;
            }

            // ===== 5. ЭТАЖИ И КОМНАТЫ =====
            //console.log('\n🏢 === ШАГ 5: ЭТАЖИ И КОМНАТЫ ===');

            try {
                const floor = this.extractFloor();
                //console.log(`🏢 Этаж: ${floor}`);
                data.floor = floor;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения этажа:', error.message);
                optionalWarnings++;
                data.floor = null;
            }

            try {
                const total_floors = this.extractFloorsTotal();
                //console.log(`🏗️ Этажность: ${total_floors}`);
                data.total_floors = total_floors;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения этажности:', error.message);
                optionalWarnings++;
                data.total_floors = null;
            }

            try {
                const rooms = this.extractRooms();
                //console.log(`🚪 Комнат: ${rooms}`);
                data.rooms = rooms;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения количества комнат:', error.message);
                optionalWarnings++;
                data.rooms = null;
            }

            try {
                const property_type = this.extractPropertyType();
                //console.log(`🏠 Тип недвижимости: ${property_type}`);
                data.property_type = property_type;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения типа недвижимости:', error.message);
                optionalWarnings++;
                data.property_type = null;
            }

            // ===== 6. ДОПОЛНИТЕЛЬНЫЕ ХАРАКТЕРИСТИКИ =====
            //console.log('\n🔧 === ШАГ 6: ДОПОЛНИТЕЛЬНЫЕ ХАРАКТЕРИСТИКИ ===');

            const additionalParams = [
                { key: 'renovation', param: 'Ремонт', emoji: '🔧' },
                { key: 'house_type', param: 'Тип дома', emoji: '🏗️' },
                { key: 'construction_year', param: 'Год постройки', emoji: '📅' },
                { key: 'bathroom', param: 'Санузел', emoji: '🚿' },
                { key: 'balcony', param: 'Балкон', emoji: '🪟' },
                { key: 'ceiling_height', param: 'Высота потолков', emoji: '📏' }
            ];

            additionalParams.forEach(({ key, param, emoji }) => {
                try {
                    const value = this.findParamValue(param);
                    //console.log(`${emoji} ${param}: ${value || '❌ НЕ УКАЗАН'}`);
                    data[key] = value;
                } catch (error) {
                    console.log(`⚠️ Ошибка извлечения ${param}:`, error.message);
                    optionalWarnings++;
                    data[key] = null;
                }
            });

            // ===== 7. ИНФОРМАЦИЯ О ПРОДАВЦЕ =====
            //console.log('\n👤 === ШАГ 7: ИНФОРМАЦИЯ О ПРОДАВЦЕ ===');

            try {
                const seller_name = this.extractSellerName();
                //console.log(`👤 Имя продавца: "${seller_name}"`);
                data.seller_name = seller_name;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения имени продавца:', error.message);
                optionalWarnings++;
                data.seller_name = null;
            }

            try {
                const seller_type = this.extractSellerType();
                //console.log(`🏢 Тип продавца: "${seller_type}"`);
                data.seller_type = seller_type;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения типа продавца:', error.message);
                optionalWarnings++;
                data.seller_type = null;
            }

            // ===== 8. ДАТЫ И МЕТРИКИ =====
            //console.log('\n📊 === ШАГ 8: ДАТЫ И МЕТРИКИ ===');

            try {
                const listing_date = this.extractListingDate();
                //console.log(`📅 Дата размещения: ${listing_date || '❌ НЕ НАЙДЕНА'}`);
                data.listing_date = listing_date;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения даты размещения:', error.message);
                optionalWarnings++;
                data.listing_date = null;
            }

            try {
                const last_update_date = this.extractUpdateDate();
                //console.log(`🔄 Дата обновления: ${last_update_date || '❌ НЕ НАЙДЕНА'}`);
                data.last_update_date = last_update_date;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения даты обновления:', error.message);
                optionalWarnings++;
                data.last_update_date = null;
            }

            try {
                const views_count = this.extractViewsCount();
                //console.log(`👀 Просмотров: ${views_count}`);
                data.views_count = views_count;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения количества просмотров:', error.message);
                optionalWarnings++;
                data.views_count = null;
            }

            try {
                const description = this.extractDescription();
                //console.log(`📄 Описание: ${description ? description.substring(0, 100) + '...' : '❌ НЕ НАЙДЕНО'}`);
                data.description = description;
            } catch (error) {
                console.log('⚠️ Ошибка извлечения описания:', error.message);
                optionalWarnings++;
                data.description = null;
            }

            // ===== 8.5. ПАРСИНГ ИСТОРИИ ЦЕН =====
            console.log('\n💰 === ШАГ 8.5: ПАРСИНГ ИСТОРИИ ЦЕН ===');

            try {
                const priceHistory = await this.parsePriceHistoryEnhanced();
                if (priceHistory && priceHistory.length > 0) {
                    console.log('✅ История цен найдена:', priceHistory);
                    data.price_history = priceHistory;
                } else {
                    console.log('❌ История цен не найдена');
                    data.price_history = [];
                }
            } catch (error) {
                console.log('❌ Ошибка при парсинге истории цен:', error.message);
                optionalWarnings++;
                data.price_history = [];
            }

            // ===== 9. ОБЯЗАТЕЛЬНЫЕ ПОЛЯ =====
            //console.log('\n🛠️ === ШАГ 9: УСТАНОВКА ОБЯЗАТЕЛЬНЫХ ПОЛЕЙ ===');

            // Очищаем URL от context параметров
            data.url = this.cleanUrl(window.location.href);
            //console.log(`🔗 Очищенный URL: ${data.url}`);

            // Устанавливаем источник
            data.source = 'avito';

            // Устанавливаем временные метки
            data.parsed_at = new Date();

            if (data.price_history && data.price_history.length > 0) {
                // Ищем самую раннюю дату в истории цен
                let earliestDate = null;

                for (const historyItem of data.price_history) {
                    let itemDate = null;

                    // Обрабатываем разные форматы дат
                    if (historyItem.fullDate) {
                        // Формат DD.MM.YYYY
                        itemDate = this.parseDate(historyItem.fullDate);
                    } else if (historyItem.timestamp) {
                        // Unix timestamp
                        itemDate = new Date(historyItem.timestamp);
                    } else if (historyItem.date) {
                        // Русская дата (например, "19 апреля")
                        itemDate = this.parseRussianDate(historyItem.date);
                    }

                    if (itemDate && (!earliestDate || itemDate < earliestDate)) {
                        earliestDate = itemDate;
                    }
                }

                if (earliestDate) {
                    data.listing_date = earliestDate;
                    // console.log(`📅 Дата создания объявления установлена из истории цен: ${earliestDate.toLocaleDateString()}`);
                } else {
                    data.listing_date = new Date();
                    console.log('⚠️ Не удалось определить дату из истории цен, используем текущую дату');
                }
            } else {
                // Если истории цен нет, используем текущую дату
                data.listing_date = new Date();
                console.log('⚠️ История цен не найдена, используем текущую дату');
            }

            console.log('✅ Обязательные поля установлены');
            //console.log('✅ Обязательные поля установлены');

            // ===== ИТОГОВЫЙ ОТЧЕТ =====
            //console.log('\n📊 === ИТОГОВЫЙ ОТЧЕТ ПАРСИНГА ===');
            //console.log(`⏰ Время завершения: ${new Date().toLocaleTimeString()}`);
            //console.log(`✅ Критических ошибок: ${criticalErrors}`);
            //console.log(`⚠️ Предупреждений: ${optionalWarnings}`);
            //console.log(`📊 Статус: ${criticalErrors > 0 ? '❌ ОШИБКА' : optionalWarnings > 0 ? '⚠️ С ПРЕДУПРЕЖДЕНИЯМИ' : '✅ УСПЕШНО'}`);

            if (criticalErrors > 0) {
                console.log('🚨 ВНИМАНИЕ: Есть критические ошибки! Объявление может быть сохранено некорректно.');
            }

            //console.log('\n📋 === ФИНАЛЬНЫЕ ДАННЫЕ ===');
            //console.log('📊 Объект данных:', data);
            //console.log('🏁 === КОНЕЦ ПАРСИНГА ОБЪЯВЛЕНИЯ ===\n');

            return data;

        } catch (error) {
            console.log('\n💥 === КРИТИЧЕСКАЯ ОШИБКА ===');
            console.error('❌ Критическая ошибка парсинга объявления:', error);
            console.error('📍 Stack trace:', error.stack);
            console.log('⏰ Время ошибки:', new Date().toLocaleTimeString());
            console.log('🔚 === КОНЕЦ С ОШИБКОЙ ===\n');
            
            // Отправляем отчет об ошибке в Telegram
            if (typeof reportParsingError === 'function') {
                reportParsingError({
                    parameter: 'общий парсинг объявления',
                    error: `${error.name}: ${error.message}`,
                    url: window.location.href,
                    source: 'avito',
                    method: 'parseCurrentListing',
                    context: {
                        stack: error.stack,
                        userAgent: navigator.userAgent
                    }
                });
            }
            
            return null;
        }
    }

    // Дополнительный метод для парсинга даты в формате DD.MM.YYYY
    /**
     * Парсинг даты в формате DD.MM.YYYY
     * @param {string} dateStr - строка даты
     * @returns {Date|null} объект Date или null
     */
    parseDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;

        const parts = dateStr.split('.');
        if (parts.length !== 3) return null;

        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // месяцы в JS начинаются с 0
        const year = parseInt(parts[2]);

        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

        return new Date(year, month, day);
    }


    /**
     * Вспомогательный метод для форматирования цены
     */
    formatPrice(price) {
        if (!price) return 'N/A';
        return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
    }

    /**
     * ДОПОЛНИТЕЛЬНЫЙ метод для быстрой диагностики всех полей
     */
    quickDiagnostic() {
        //console.log('🔍 === БЫСТРАЯ ДИАГНОСТИКА ===');

        const results = {
            external_id: this.extractExternalId(),
            title: this.extractTitle(),
            price: this.extractPrice(),
            area_total: this.extractTotalArea(),
            area_kitchen: this.extractKitchenArea(),
            area_living: this.extractLivingArea(),
            floor: this.extractFloor(),
            rooms: this.extractRooms()
        };

        console.table(results);
        return results;
    }

    /**
     * Проверка готовности страницы к парсингу
     */
    isPageReady() {
        // Проверяем основные элементы
        const hasTitle = !!document.querySelector('h1[itemprop="name"]');
        const hasPrice = !!document.querySelector('[data-marker="item-view/item-price"]');
        const hasParams = !!document.querySelector('#bx_item-params') || !!document.querySelector('.params-paramsList-_awNW');

        //console.log('🔍 Проверка готовности страницы:');
        //console.log('  📋 Заголовок найден:', hasTitle);
        //console.log('  💰 Цена найдена:', hasPrice);
        //console.log('  📊 Параметры найдены:', hasParams);

        return hasTitle && hasPrice;
    }

    /**
     * Ожидание загрузки элементов
     */
    async waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Элемент ${selector} не найден за ${timeout}ms`));
            }, timeout);
        });
    }

    // Метод для парсинга истории цен в классе AvitoParser
    async parsePriceHistoryEnhanced() {
        console.log('💰 === ПАРСИНГ ИСТОРИИ ЦЕН (ENHANCED) ===');

        try {
            // Находим кнопку истории цен
            const button = this.findPriceHistoryButtonPrecise();
            if (!button) {
                console.log('❌ Кнопка истории цен не найдена');
                
                // Отправляем отчет об ошибке в Telegram
                if (typeof reportSelectorError === 'function') {
                    reportSelectorError(
                        'история цены (кнопка)',
                        [
                            'p.T7ujv.Tdsqf.dsi88.cujIu.aStJv',
                            'div.K5h5l p[tabindex="0"]',
                            'p[aria-haspopup="true"][aria-expanded="false"]'
                        ],
                        window.location.href,
                        'findPriceHistoryButtonPrecise'
                    );
                }
                
                return [];
            }

            console.log('✅ Кнопка найдена, активируем tooltip...');

            // Активируем tooltip с правильными событиями
            return new Promise((resolve) => {
                let resolved = false;

                // Наблюдатель за изменениями DOM
                const observer = new MutationObserver((mutations) => {
                    if (resolved) return;

                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) {
                                const text = node.textContent || '';
                                // Проверяем, содержит ли элемент данные о ценах и датах
                                if (text.includes('₽') &&
                                    (text.includes('янв') || text.includes('фев') || text.includes('мар') ||
                                        text.includes('апр') || text.includes('май') || text.includes('июн') ||
                                        text.includes('июл') || text.includes('авг') || text.includes('сен') ||
                                        text.includes('окт') || text.includes('ноя') || text.includes('дек'))) {

                                    console.log('✅ Tooltip с историей цен обнаружен!');
                                    resolved = true;
                                    observer.disconnect();

                                    // Извлекаем историю цен
                                    const history = this.extractPriceHistoryFromTooltip(node);
                                    resolve(history);
                                }
                            }
                        });
                    });
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                // Активируем tooltip
                this.activatePriceHistoryTooltipImproved(button);

                // Таймаут на случай, если tooltip не появится
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        observer.disconnect();
                        console.log('⏱️ Таймаут ожидания tooltip');
                        resolve([]);
                    }
                }, 5000); // Увеличиваем таймаут до 5 секунд
            });

        } catch (error) {
            console.error('❌ Ошибка при парсинге истории цен:', error);
            return [];
        }
    }

    /**
     * Точный поиск кнопки истории цен
     */
    findPriceHistoryButtonPrecise() {
        console.log('🎯 === ТОЧНЫЙ ПОИСК КНОПКИ ИСТОРИИ ЦЕН ===');

        // Ищем по классам из разметки
        const selectors = [
            'p.T7ujv.Tdsqf.dsi88.cujIu.aStJv',
            'div.K5h5l p[tabindex="0"]',
            'p[aria-haspopup="true"][aria-expanded="false"]',
            '.price-history-entry-point-iKhax',
            '.K5h5l.price-history-entry-point-iKhax',
            '[class*="price-history-entry-point"]'
        ];

        let button = null;

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                console.log(`Селектор "${selector}": найдено ${elements.length} элементов`);

                elements.forEach(el => {
                    const text = el.textContent || '';
                    if (text.includes('история цены') || text.includes('История цены')) {
                        button = el;
                        console.log('✅ Найден элемент истории цен:', el);
                    }
                });
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        // Если не нашли, ищем по тексту
        if (!button) {
            const allP = document.querySelectorAll('p');
            allP.forEach(p => {
                if (p.textContent && (p.textContent.includes('история цены') || p.textContent.includes('История цены'))) {
                    button = p;
                    console.log('✅ Найден элемент по тексту:', p);
                }
            });
        }

        return button;
    }

    /**
     * Улучшенная активация tooltip истории цен
     */
    activatePriceHistoryTooltipImproved(button) {
        console.log('🚀 === АКТИВАЦИЯ TOOLTIP ИСТОРИИ ЦЕН ===');

        // Сначала устанавливаем фокус
        if (button.focus) {
            button.focus();
            console.log('📍 Фокус установлен');
        }

        // Пробуем разные события
        const events = [
            new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }),
            new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }),
            new PointerEvent('pointerenter', { bubbles: true, cancelable: true }),
            new PointerEvent('pointerover', { bubbles: true, cancelable: true }),
            new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: button.getBoundingClientRect().left + 10,
                clientY: button.getBoundingClientRect().top + 10
            })
        ];

        events.forEach((event, index) => {
            setTimeout(() => {
                console.log(`Отправляем событие ${event.type}`);
                button.dispatchEvent(event);

                // Также пробуем на родительский элемент
                if (button.parentElement) {
                    button.parentElement.dispatchEvent(event);
                }
            }, index * 100);
        });

        // Проверяем изменение aria-expanded через секунду
        setTimeout(() => {
            const expanded = button.getAttribute('aria-expanded');
            console.log('aria-expanded после активации:', expanded);

            if (expanded === 'true') {
                console.log('✅ Tooltip активирован!');
            } else {
                console.log('⚠️ aria-expanded все еще false, tooltip может не открыться');
            }
        }, 1000);
    }

    /**
     * Извлечение истории цен из tooltip с точным парсингом
     */
    extractPriceHistoryFromTooltip(element) {
        console.log('📊 === ИЗВЛЕЧЕНИЕ ИСТОРИИ ЦЕН ИЗ TOOLTIP ===');

        const priceHistory = [];
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // месяцы в JS 0-11

        // Словарь для преобразования названий месяцев в числовые значения
        const monthMap = {
            'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
            'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
            'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
        };

        try {
            // Находим все блоки с записями об изменении цены
            const historyEntries = element.querySelectorAll('div[style*="--module-spacer-column-gap: var(--theme-gap-0)"]');

            let prevYear = currentYear;
            let prevMonth = currentMonth;

            historyEntries.forEach(entry => {
                // Извлекаем дату
                const dateElement = entry.querySelector('p:first-child');
                const dateText = dateElement ? dateElement.textContent.trim() : null;

                // Парсим дату
                let day, month, monthNum, year;
                if (dateText) {
                    const dateParts = dateText.split(' ');
                    day = parseInt(dateParts[0]);
                    month = dateParts[1];
                    monthNum = monthMap[month.toLowerCase()] || 0;

                    // Определяем год
                    if (monthNum > prevMonth) {
                        // Если текущий месяц в записи больше предыдущего, значит это прошлый год
                        prevYear--;
                    }
                    prevMonth = monthNum;

                    year = prevYear;
                }

                // Извлекаем цену
                const priceElement = entry.querySelector('p.obLSF') ||
                    entry.querySelector('p:last-child');
                const price = priceElement ? priceElement.textContent.trim() : null;

                // Извлекаем изменение цены (если есть)
                const changeElement = entry.parentElement.querySelector('p[class*="_3rH6"]');
                let change = null;
                let changeType = null;

                if (changeElement) {
                    change = changeElement.textContent.trim();
                    // Определяем тип изменения (увеличение/уменьшение)
                    changeType = changeElement.classList.contains('FcB0L') ? 'increase' :
                        changeElement.classList.contains('LTb57') ? 'decrease' :
                            null;
                }

                // Проверяем, является ли запись публикацией
                const isPublication = entry.parentElement.querySelector('p[style*="color: rgb(117, 117, 117)"]') !== null;

                if (dateText && price) {
                    const formattedDate = `${day.toString().padStart(2, '0')}.${monthNum.toString().padStart(2, '0')}.${year}`;

                    priceHistory.push({
                        date: dateText,
                        fullDate: formattedDate,
                        year,
                        price,
                        change: isPublication ? null : change,
                        changeType: isPublication ? null : changeType,
                        isPublication,
                        timestamp: new Date(year, monthNum - 1, day).getTime()
                    });
                }
            });

            // Сортируем по дате (от новых к старым)
            priceHistory.sort((a, b) => b.timestamp - a.timestamp);

            console.log('📈 Найдено записей истории цен:', priceHistory.length);
            priceHistory.forEach(entry => {
                console.log(`  📅 ${entry.date}: ${entry.price}${entry.change ? ` (${entry.change})` : ''}`);
            });

            return priceHistory;

        } catch (error) {
            console.error('❌ Ошибка извлечения истории цен:', error);
            return [];
        }
    }


    // Вспомогательный метод для поиска кнопки
    findPriceHistoryButton() {
        const selectors = [
            '.price-history-entry-point-iKhax',
            '[class*="price-history-entry-point"]',
            'p[aria-haspopup="true"][tabindex="0"]:contains("История цены")'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.textContent && el.textContent.includes('История цены')) {
                    return el;
                }
            }
        }

        // Поиск по тексту
        const allP = document.querySelectorAll('p');
        for (const p of allP) {
            if (p.textContent && p.textContent.trim() === 'История цены') {
                return p;
            }
        }

        return null;
    }

    // Метод активации tooltip
    activateTooltip(button) {
        // Фокус
        if (button.focus) button.focus();

        // События
        const events = [
            new MouseEvent('mouseenter', { bubbles: true, cancelable: true }),
            new MouseEvent('mouseover', { bubbles: true, cancelable: true }),
            new PointerEvent('pointerenter', { bubbles: true })
        ];

        events.forEach((event, index) => {
            setTimeout(() => {
                button.dispatchEvent(event);
                if (button.parentElement) {
                    button.parentElement.dispatchEvent(event);
                }
            }, index * 100);
        });
    }

    /**
     * ДОПОЛНИТЕЛЬНЫЙ метод для отладки истории цен
     * Добавить как отдельный метод в AvitoParser
     */
    async debugPriceHistory() {
        console.log('🔍 Отладка парсинга истории цен...');

        try {
            // Проверяем наличие элемента-триггера
            const priceHistoryElement = document.querySelector('.price-history-entry-point-iKhax');
            console.log('🎯 Элемент истории цен:', priceHistoryElement);

            if (!priceHistoryElement) {
                console.log('❌ Элемент-триггер истории цен не найден');

                // Ищем альтернативные селекторы
                const alternatives = [
                    '[class*="price-history"]',
                    '[class*="priceHistory"]',
                    '[data-marker*="price"]',
                    '.item-price-history',
                    '.price-changes'
                ];

                for (const selector of alternatives) {
                    const alt = document.querySelector(selector);
                    if (alt) {
                        console.log(`🔍 Найден альтернативный элемент: ${selector}`, alt);
                    }
                }
                return [];
            }

            // Проверяем React Fiber
            const fiberKeys = Object.keys(priceHistoryElement).filter(key =>
                key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
            );

            console.log('🔗 React Fiber ключи:', fiberKeys);

            if (fiberKeys.length === 0) {
                console.log('❌ React Fiber не найден');
                return [];
            }

            // Исследуем структуру Fiber
            for (const fiberKey of fiberKeys) {
                const fiber = priceHistoryElement[fiberKey];
                console.log(`🧬 Исследуем ${fiberKey}:`, fiber);

                // Проверяем различные пути к данным
                const paths = [
                    'child?.sibling?.memoizedState?.memoizedState',
                    'memoizedProps?.children?.props?.priceHistory',
                    'stateNode?.state?.priceHistory',
                    'return?.memoizedState?.priceHistory'
                ];

                for (const path of paths) {
                    try {
                        const pathParts = path.split('.');
                        let current = fiber;

                        for (const part of pathParts) {
                            if (part.includes('?')) {
                                const cleanPart = part.replace('?', '');
                                current = current?.[cleanPart];
                            } else {
                                current = current[part];
                            }
                        }

                        if (current && current.priceHistory) {
                            console.log(`✅ Найдены данные по пути ${path}:`, current.priceHistory);
                            return current.priceHistory;
                        }
                    } catch (e) {
                        // Игнорируем ошибки при исследовании путей
                    }
                }
            }

            console.log('❌ Данные истории цен не найдены ни по одному пути');
            return [];

        } catch (error) {
            console.error('❌ Ошибка отладки истории цен:', error);
            return [];
        }
    }


    /**
 * ОКОНЧАТЕЛЬНОЕ РЕШЕНИЕ: Парсинг истории цен из портального контейнера
 * Заменить метод extractPriceHistory() в avito-parser.js
 */
    /**
     * ИСПРАВЛЕНИЕ СИНТАКСИЧЕСКОЙ ОШИБКИ
     * Заменить метод extractPriceHistory() в avito-parser.js
     */
    async extractPriceHistory() {  // ← ДОБАВИТЬ async!
        console.log('💰 Парсинг истории цен...');

        try {
            // МЕТОД 1: ПОИСК В ПОРТАЛЬНОМ КОНТЕЙНЕРЕ (приоритетный для модальных окон)
            console.log('🔍 Метод 1: Поиск в портальном контейнере...');
            const portalHistory = this.extractFromPortalContainer();
            if (portalHistory && portalHistory.length > 0) {
                console.log(`✅ Найдено ${portalHistory.length} записей в портальном контейнере`);
                return portalHistory;
            }

            // МЕТОД 2: СИМУЛЯЦИЯ НАВЕДЕНИЯ НА КНОПКУ + ПАРСИНГ ПОРТАЛА
            console.log('🔍 Метод 2: Симуляция наведения и парсинг...');
            const hoverHistory = await this.triggerHoverAndParse();
            if (hoverHistory && hoverHistory.length > 0) {
                console.log(`✅ Найдено ${hoverHistory.length} записей после hover`);
                return hoverHistory;
            }

            // МЕТОД 3: РЕЗЕРВНЫЙ ПОИСК В DOM
            console.log('🔍 Метод 3: Резервный поиск в DOM...');
            const domHistory = this.extractFromDOMSearch();
            if (domHistory && domHistory.length > 0) {
                console.log(`✅ Найдено ${domHistory.length} записей в DOM`);
                return domHistory;
            }

            console.log('❌ История цен не найдена ни одним методом');
            return [];

        } catch (error) {
            console.error('❌ Ошибка парсинга истории цен:', error);
            return [];
        }
    }

    /**
     * МЕТОД 1: Извлечение из портального контейнера
     */
    extractFromPortalContainer() {
        console.log('🔍 Поиск в портальном контейнере...');

        try {
            // Ищем контейнер портала
            const portalContainer = document.querySelector('[data-marker="portals-container"]');
            if (!portalContainer) {
                console.log('❌ Портальный контейнер не найден');
                return null;
            }

            console.log('✅ Найден портальный контейнер');

            // Ищем tooltip с историей цен
            const tooltip = portalContainer.querySelector('[role="tooltip"]');
            if (!tooltip) {
                console.log('❌ Tooltip в портальном контейнере не найден');
                return null;
            }

            console.log('✅ Найден tooltip с историей цен');

            // Парсим данные из tooltip
            return this.parseHistoryFromTooltip(tooltip);

        } catch (error) {
            console.error('❌ Ошибка поиска в портальном контейнере:', error);
            return null;
        }
    }

    /**
     * Исправленный метод поиска в портальном контейнере
     */
    async searchInPortalContainer() {
        console.log('🔍 Поиск в портальном контейнере...');

        try {
            const portalContainer = document.querySelector('[data-marker="portals-container"]');
            if (!portalContainer) {
                console.log('❌ Портальный контейнер не найден');
                return null;
            }

            console.log('✅ Найден портальный контейнер');

            // Ищем tooltip с историей цен
            const tooltip = portalContainer.querySelector('[role="tooltip"]');
            if (!tooltip) {
                console.log('❌ Tooltip в портальном контейнере не найден');
                return null;
            }

            console.log('✅ Найден tooltip с историей цен');

            // Парсим данные из tooltip
            return this.parseHistoryFromTooltip(tooltip);

        } catch (error) {
            console.error('❌ Ошибка поиска в портальном контейнере:', error);
            return null;
        }
    }

    /**
     * Исправленный парсинг истории цен из tooltip
     */
    parseHistoryFromTooltip(tooltip) {
        console.log('📊 Парсинг данных из tooltip...');

        try {
            const historyEntries = [];

            // Ищем все элементы с датами (содержат месяцы)
            const dateElements = Array.from(tooltip.querySelectorAll('p')).filter(p => {
                const text = p.textContent.trim();
                // Проверяем, содержит ли текст месяц
                return /\b(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/.test(text);
            });

            console.log(`🔍 Найдено ${dateElements.length} элементов с датами`);

            for (let i = 0; i < dateElements.length; i++) {
                const dateElement = dateElements[i];
                const dateText = dateElement.textContent.trim();

                console.log(`📅 Обрабатываем дату ${i + 1}: "${dateText}"`);

                // Ищем ближайший элемент с ценой
                const priceElement = this.findNearestPriceElement(dateElement);

                if (priceElement) {
                    const priceText = priceElement.textContent.trim();
                    console.log(`💰 Найдена цена: "${priceText}"`);

                    // Парсим дату и цену
                    const date = this.parseRussianDate(dateText);
                    const price = this.extractPriceFromText(priceText);

                    if (date && price > 1000) {
                        // Проверяем, есть ли информация о типе изменения
                        const changeInfo = this.findChangeInfo(dateElement);

                        const entry = {
                            date: date,
                            price: price,
                            type: changeInfo.type,
                            change: changeInfo.change,
                            original_date: dateText,
                            original_price: priceText
                        };

                        historyEntries.push(entry);
                        console.log(`✅ Добавлена запись истории:`, entry);
                    } else {
                        console.log(`❌ Не удалось распарсить: дата=${date}, цена=${price}`);
                    }
                } else {
                    console.log(`❌ Не найдена цена для даты: "${dateText}"`);
                }
            }

            // Сортируем по дате (новые сначала)
            historyEntries.sort((a, b) => b.date.getTime() - a.date.getTime());

            console.log(`📊 Итого найдено ${historyEntries.length} записей истории`);
            return historyEntries;

        } catch (error) {
            console.error('❌ Ошибка парсинга tooltip:', error);
            return [];
        }
    }

    /**
     * Поиск ближайшего элемента с ценой относительно элемента с датой
     */
    findNearestPriceElement(dateElement) {
        // Ищем в том же родительском контейнере
        const parent = dateElement.closest('.d1zrJ.ZiGJm.Ib0ZQ.vKB2A[style*="--module-spacer-column-gap: var(--theme-gap-16)"]');

        if (parent) {
            // Ищем элемент с ценой в том же контейнере
            const priceElements = parent.querySelectorAll('p');
            for (const p of priceElements) {
                const text = p.textContent.trim();
                if (/\d[\d\s]*₽/.test(text)) {
                    return p;
                }
            }
        }

        // Если не найдено в том же контейнере, ищем в соседних элементах
        let sibling = dateElement.nextElementSibling;
        while (sibling) {
            if (sibling.tagName === 'P' && /\d[\d\s]*₽/.test(sibling.textContent)) {
                return sibling;
            }
            // Ищем внутри соседнего элемента
            const priceInSibling = sibling.querySelector('p');
            if (priceInSibling && /\d[\d\s]*₽/.test(priceInSibling.textContent)) {
                return priceInSibling;
            }
            sibling = sibling.nextElementSibling;
        }

        // Ищем в родительских элементах
        let currentParent = dateElement.parentElement;
        while (currentParent && currentParent !== document.body) {
            const priceElements = currentParent.querySelectorAll('p');
            for (const p of priceElements) {
                if (p !== dateElement && /\d[\d\s]*₽/.test(p.textContent)) {
                    return p;
                }
            }
            currentParent = currentParent.parentElement;
        }

        return null;
    }

    /**
     * Поиск информации об изменении цены (повышение/понижение/публикация)
     */
    findChangeInfo(dateElement) {
        const result = {
            type: 'unknown',
            change: null
        };

        // Ищем в родительском контейнере текст с информацией об изменении
        const parent = dateElement.closest('.d1zrJ.ZiGJm.Ib0ZQ.WgkzZ.vKB2A[style*="--module-spacer-row-gap: var(--theme-gap-0)"]');

        if (parent) {
            const texts = Array.from(parent.querySelectorAll('p')).map(p => p.textContent.trim());

            for (const text of texts) {
                if (text.includes('Публикация')) {
                    result.type = 'publication';
                    break;
                } else if (/\d+\s*₽/.test(text) && text.includes('₽') && !text.includes(' ')) {
                    // Это может быть изменение цены
                    const changeMatch = text.match(/([0-9\s]+)\s*₽/);
                    if (changeMatch) {
                        const changeAmount = parseInt(changeMatch[1].replace(/\s/g, ''));
                        if (changeAmount > 0) {
                            result.type = 'price_change';
                            result.change = changeAmount;
                        }
                    }
                }
            }
        }

        return result;
    }

    /**
     * Извлечение цены из текста
     */
    extractPriceFromText(text) {
        if (!text) return 0;

        // Убираем все кроме цифр и пробелов, затем убираем пробелы
        const cleanText = text.replace(/[^\d\s]/g, '').replace(/\s/g, '');
        const price = parseInt(cleanText);

        return isNaN(price) ? 0 : price;
    }

    /**
     * Обновленный основной метод парсинга истории цен
     */
    async parsePriceHistory() {
        console.log('💰 === ПАРСИНГ ИСТОРИИ ЦЕН (ОБНОВЛЕННЫЙ) ===');

        try {
            // Находим кнопку истории цен с правильными селекторами
            const button = this.findPriceHistoryButton();
            if (!button) {
                console.log('❌ Кнопка истории цен не найдена');
                return [];
            }

            console.log('✅ Кнопка найдена:', button);

            // Проверяем, не открыт ли уже tooltip
            let tooltip = document.querySelector('[role="tooltip"]');
            if (tooltip && tooltip.textContent.includes('₽')) {
                console.log('✅ Tooltip уже открыт, парсим данные');
                return this.parseTooltipData(tooltip);
            }

            // Если tooltip закрыт, открываем его
            console.log('🖱️ Активируем tooltip...');

            return new Promise((resolve) => {
                let resolved = false;

                // Устанавливаем observer для отслеживания появления tooltip
                const observer = new MutationObserver((mutations) => {
                    if (resolved) return;

                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1 && node.getAttribute &&
                                node.getAttribute('role') === 'tooltip') {
                                const text = node.textContent || '';
                                if (text.includes('₽') && (text.includes('янв') || text.includes('фев') ||
                                    text.includes('мар') || text.includes('апр') || text.includes('май') ||
                                    text.includes('июн') || text.includes('июл') || text.includes('авг') ||
                                    text.includes('сен') || text.includes('окт') || text.includes('ноя') ||
                                    text.includes('дек'))) {
                                    console.log('✅ Tooltip с историей цен обнаружен!');
                                    resolved = true;
                                    observer.disconnect();

                                    // Небольшая задержка для полной загрузки
                                    setTimeout(() => {
                                        const history = this.parseTooltipData(node);
                                        resolve(history);
                                    }, 100);
                                }
                            }
                        });
                    });
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                // Активируем tooltip
                this.activatePriceHistoryTooltip(button);

                // Таймаут
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        observer.disconnect();
                        console.log('⏱️ Таймаут ожидания tooltip');
                        resolve([]);
                    }
                }, 3000);
            });

        } catch (error) {
            console.error('Ошибка при парсинге истории цен:', error);
            return [];
        }
    }


    findPriceHistoryButton() {
        console.log('🔍 Поиск кнопки истории цен...');

        // Актуальные селекторы для кнопки
        const selectors = [
            '.price-history-entry-point-iKhax',
            '.K5h5l.price-history-entry-point-iKhax',
            '[class*="price-history-entry-point"]',
            'p[aria-haspopup="true"][tabindex="0"]',
            'div.K5h5l p[tabindex="0"]'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const text = el.textContent || '';
                if (text.includes('История цены') || text.includes('История цен')) {
                    console.log(`✅ Кнопка найдена по селектору: ${selector}`);
                    return el;
                }
            }
        }

        // Поиск по тексту
        const allP = document.querySelectorAll('p');
        for (const p of allP) {
            if (p.textContent && (p.textContent.trim() === 'История цены' ||
                p.textContent.trim() === 'История цен')) {
                console.log('✅ Кнопка найдена по тексту');
                return p;
            }
        }

        console.log('❌ Кнопка не найдена ни одним методом');
        return null;
    }

    activatePriceHistoryTooltip(button) {
        console.log('🖱️ Активация tooltip...');

        // Сначала фокус
        if (button.focus) {
            button.focus();
            console.log('📍 Фокус установлен');
        }

        // Последовательность событий как на реальном сайте
        const events = [
            new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }),
            new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }),
            new PointerEvent('pointerenter', { bubbles: true, cancelable: true }),
            new PointerEvent('pointerover', { bubbles: true, cancelable: true })
        ];

        events.forEach((event, index) => {
            setTimeout(() => {
                console.log(`  Отправка события: ${event.type}`);
                button.dispatchEvent(event);

                // Также на родительский элемент
                if (button.parentElement) {
                    button.parentElement.dispatchEvent(event);
                }
            }, index * 50);
        });
    }


    parseTooltipData(tooltipElement) {
        console.log('📊 Парсинг данных из tooltip...');

        const priceHistory = [];
        const currentYear = new Date().getFullYear();

        // Паттерны
        const datePattern = /(\d{1,2})\s*(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/gi;
        const pricePattern = /(\d{1,3}(?:\s?\d{3})*)\s*₽/g;

        // Маппинг месяцев
        const monthMap = {
            'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3,
            'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7,
            'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
        };

        // Получаем текст
        const fullText = tooltipElement.textContent;
        console.log('Текст tooltip:', fullText);

        // Разбиваем на логические части
        const lines = fullText.split(/(?=\d{1,2}\s*(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря))/gi);

        lines.forEach(line => {
            const dateMatch = line.match(datePattern);
            const priceMatches = [...line.matchAll(pricePattern)];

            if (dateMatch && priceMatches.length > 0) {
                const day = parseInt(dateMatch[1]);
                const monthName = dateMatch[2].toLowerCase();
                const month = monthMap[monthName];

                // Создаем дату
                let date = new Date(currentYear, month, day);

                // Проверяем, не в будущем ли дата
                if (date > new Date()) {
                    date.setFullYear(currentYear - 1);
                }

                // Основная цена - первая найденная
                const mainPrice = parseInt(priceMatches[0][1].replace(/\s/g, ''));

                // Изменение цены (если есть вторая цена)
                let priceChange = null;
                if (priceMatches.length > 1) {
                    priceChange = parseInt(priceMatches[1][1].replace(/\s/g, ''));
                }

                const entry = {
                    date: date.toISOString().split('T')[0],
                    date_formatted: `${day} ${dateMatch[2]}`,
                    price: mainPrice,
                    price_formatted: priceMatches[0][0]
                };

                if (priceChange) {
                    entry.price_change = priceChange;
                    entry.price_change_formatted = `${priceChange.toLocaleString('ru-RU')} ₽`;
                }

                // Проверяем, не публикация ли это
                if (line.toLowerCase().includes('публикация')) {
                    entry.is_publication = true;
                }

                priceHistory.push(entry);
                console.log('  Добавлена запись:', entry);
            }
        });

        // Сортируем по дате (новые первые)
        priceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

        console.log(`✅ Распарсено записей: ${priceHistory.length}`);
        return priceHistory;
    }

    /**
     * МЕТОД 3: Улучшенная активация tooltip
     */
    async extractFromTooltipAdvanced() {
        try {
            const button = document.querySelector('.price-history-entry-point-iKhax');
            if (!button) {
                console.log('❌ Кнопка истории цен не найдена');
                return [];
            }

            console.log('🖱️ Кнопка найдена, активируем tooltip...');

            // Устанавливаем мониторинг портала перед активацией
            const portal = document.querySelector('[data-marker="portals-container"]');
            if (!portal) {
                console.log('❌ Портальный контейнер не найден');
                return [];
            }

            let tooltipFound = false;
            const history = [];

            // Устанавливаем наблюдатель за изменениями
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE &&
                            node.getAttribute && node.getAttribute('role') === 'tooltip') {
                            console.log('🎯 Tooltip появился:', node);

                            const tooltipText = node.textContent;
                            const parsedHistory = this.parseTooltipHistory(tooltipText);

                            if (parsedHistory.length > 0) {
                                history.push(...parsedHistory);
                                tooltipFound = true;
                            }
                        }
                    });
                });
            });

            observer.observe(portal, { childList: true, subtree: true });

            // Последовательность событий для активации
            const activationSequence = [
                () => button.focus(),
                () => {
                    const rect = button.getBoundingClientRect();
                    button.dispatchEvent(new MouseEvent('mouseenter', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    }));
                },
                () => {
                    const rect = button.getBoundingClientRect();
                    button.dispatchEvent(new MouseEvent('mouseover', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    }));
                },
                () => button.click()
            ];

            // Выполняем последовательность с задержками
            for (const action of activationSequence) {
                action();
                await this.wait(300);

                if (tooltipFound) break;
            }

            // Ждем еще немного на случай задержки
            await this.wait(1000);

            observer.disconnect();

            return history;

        } catch (error) {
            console.error('❌ Ошибка активации tooltip:', error);
            return [];
        }
    }

    /**
     * 🎯 МЕТОД 4: API перехват XHR/Fetch запросов
     */
    setupAPIInterception() {
        // console.log('📡 Настройка API перехвата...');

        try {
            const originalFetch = window.fetch;
            const originalXHROpen = XMLHttpRequest.prototype.open;

            // Перехват fetch
            window.fetch = function (...args) {
                return originalFetch.apply(this, args).then(response => {
                    if (args[0].includes('price') || args[0].includes('history')) {
                        console.log('🔍 API запрос с историей цен:', args[0]);
                        return response.clone().json().then(data => {
                            if (data.priceHistory) {
                                // console.log('💰 Найдена история в API:', data.priceHistory);
                                window.foundPriceHistory = data.priceHistory;
                            }
                            return response;
                        }).catch(() => response); // В случае ошибки парсинга возвращаем оригинальный response
                    }
                    return response;
                });
            };

            // Перехват XHR
            XMLHttpRequest.prototype.open = function (method, url, ...args) {
                this.addEventListener('load', function () {
                    if (url.includes('price') || url.includes('history')) {
                        try {
                            const data = JSON.parse(this.responseText);
                            if (data.priceHistory) {
                                // console.log('💰 XHR история цен:', data.priceHistory);
                                window.foundPriceHistory = data.priceHistory;
                            }
                        } catch (e) {
                            // Игнорируем ошибки парсинга
                        }
                    }
                });

                return originalXHROpen.call(this, method, url, ...args);
            };

            // console.log('✅ API перехват настроен');

        } catch (error) {
            console.error('❌ Ошибка настройки API перехвата:', error);
        }
    }

    /**
     * Поиск истории вокруг ID в тексте
     */
    findHistoryAroundId(text, currentId) {
        const positions = [];
        let pos = 0;

        // Находим все позиции ID
        while ((pos = text.indexOf(currentId, pos)) !== -1) {
            positions.push(pos);
            pos += currentId.length;
        }

        // Для каждой позиции ищем контекст с историей
        for (const position of positions.slice(0, 5)) {
            const start = Math.max(0, position - 1000);
            const end = Math.min(text.length, position + 1000);
            const context = text.substring(start, end);

            if (context.includes('priceHistory') || context.includes('price_history')) {
                console.log('🎯 Найден контекст с историей вокруг ID');

                // Пытаемся извлечь JSON
                const jsonMatch = context.match(/"priceHistory"\s*:\s*(\[.*?\])/);
                if (jsonMatch) {
                    try {
                        const historyArray = JSON.parse(jsonMatch[1]);
                        return this.formatPriceHistory(historyArray);
                    } catch (e) {
                        continue;
                    }
                }
            }
        }

        return [];
    }


    /**
     * 🔍 Проверка видимого tooltip
     */
    checkForVisibleTooltip() {
        try {
            // Проверяем портальный контейнер
            const portalContainer = document.querySelector('[data-marker="portals-container"]');
            if (portalContainer) {
                const tooltip = portalContainer.querySelector('[role="tooltip"]');
                if (tooltip) {
                    const rect = tooltip.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        return tooltip;
                    }
                }
            }

            // Проверяем все tooltip на странице
            const tooltips = document.querySelectorAll('[role="tooltip"]');
            for (const tooltip of tooltips) {
                const rect = tooltip.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 &&
                    (tooltip.textContent.includes('₽') || tooltip.textContent.includes('руб'))) {
                    return tooltip;
                }
            }

            return null;

        } catch (error) {
            console.error('❌ Ошибка проверки tooltip:', error);
            return null;
        }
    }

    /**
     * 📊 Парсинг истории из tooltip
     */
    parseTooltipHistory(text) {
        const history = [];

        // Паттерны для поиска дат и цен
        const patterns = [
            /(\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря))\s+([0-9\s]+)\s*₽/g,
            /(\d{1,2}\.\d{1,2})\s+([0-9\s]+)\s*₽/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const dateStr = match[1];
                const priceStr = match[2].replace(/\s/g, '');
                const price = parseInt(priceStr);

                if (price > 1000) {
                    history.push({
                        date: this.parseRussianDate(dateStr),
                        price: price,
                        type: 'price_change'
                    });
                }
            }
        }

        return history;
    }

    /**
     * 📊 Форматирование истории цен в стандартный формат
     */
    formatPriceHistory(rawHistory) {
        if (!Array.isArray(rawHistory)) return [];

        return rawHistory.map(item => {
            // Обрабатываем разные форматы данных
            if (typeof item === 'object' && item !== null) {
                return {
                    date: item.date || item.timestamp || new Date().toISOString().split('T')[0],
                    price: item.price || item.amount || 0,
                    type: item.type || 'price_change'
                };
            }

            return item;
        }).filter(item => item.price > 0)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    /**
     * ⏱️ Вспомогательный метод ожидания
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Диагностика истории цен
     */
    async debugPriceHistoryExtraction() {
        console.log('\n🔍 === ДИАГНОСТИКА ИЗВЛЕЧЕНИЯ ИСТОРИИ ЦЕН ===');

        const currentId = this.extractExternalId();
        console.log('🎯 ID объявления:', currentId);

        // Проверяем dataLayer
        const dataLayerResult = this.extractFromDataLayer(currentId);
        console.log('📊 DataLayer:', dataLayerResult.length > 0 ? '✅ Найдено' : '❌ Не найдено');

        // Проверяем script теги
        const scriptResult = this.extractFromScriptTags();
        console.log('📜 Script теги:', scriptResult.length > 0 ? '✅ Найдено' : '❌ Не найдено');

        // Проверяем React Fiber
        const fiberResult = this.extractFromReactFiber();
        console.log('⚛️ React Fiber:', fiberResult.length > 0 ? '✅ Найдено' : '❌ Не найдено');

        // Проверяем кнопку tooltip
        const button = document.querySelector('.price-history-entry-point-iKhax');
        console.log('🖱️ Кнопка tooltip:', button ? '✅ Найдена' : '❌ Не найдена');

        const finalResult = await this.parsePriceHistory();
        console.log('🏁 Итоговый результат:', finalResult);

        return finalResult;
    }


    /**
     * Симуляция наведения мыши на элемент истории цен
     */
    async simulateHoverAndParse() {
        console.log('🖱️ Симуляция наведения на кнопку истории цен...');

        const button = this.findPriceHistoryButton();
        if (!button) {
            console.log('❌ Кнопка истории цен не найдена');
            return null;
        }

        console.log('✅ Найдена кнопка истории цен');

        // Активируем tooltip
        this.activatePriceHistoryTooltip(button);

        // Ждем появления tooltip
        return new Promise((resolve) => {
            let checkCount = 0;
            const checkInterval = setInterval(() => {
                const tooltip = document.querySelector('[role="tooltip"]');

                if (tooltip && tooltip.textContent.includes('₽')) {
                    clearInterval(checkInterval);
                    console.log('✅ Tooltip появился');

                    // Парсим данные
                    const history = this.parseTooltipData(tooltip);
                    resolve(history);
                } else if (checkCount > 30) { // 3 секунды
                    clearInterval(checkInterval);
                    console.log('❌ Timeout: tooltip не появился');
                    resolve(null);
                }

                checkCount++;
            }, 100);
        });
    }

    /**
     * Ожидание появления tooltip
     */
    async waitForTooltip() {
        const maxAttempts = 30;
        const delay = 100;

        for (let i = 0; i < maxAttempts; i++) {
            const tooltip = await this.searchInPortalContainer();
            if (tooltip && tooltip.length > 0) {
                console.log(`✅ Tooltip появился после ${i * delay}мс`);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log('⏰ Время ожидания tooltip истекло');
        return false;
    }

    /**
     * МЕТОД 2: Симуляция наведения на кнопку и парсинг появившегося содержимого
     */
    async triggerHoverAndParse() {
        console.log('🖱️ Симуляция наведения на кнопку истории цен...');

        try {
            // Находим кнопку истории цен
            const historyButton = document.querySelector('.price-history-entry-point-iKhax');
            if (!historyButton) {
                console.log('❌ Кнопка истории цен не найдена');
                return null;
            }

            console.log('✅ Найдена кнопка истории цен');

            // Симулируем mouseenter
            const mouseEnterEvent = new MouseEvent('mouseenter', {
                view: window,
                bubbles: true,
                cancelable: true
            });

            historyButton.dispatchEvent(mouseEnterEvent);
            console.log('🖱️ Событие mouseenter отправлено');

            // Ждем появления tooltip
            const maxWaitTime = 3000; // 3 секунды
            const checkInterval = 100; // проверяем каждые 100мс
            let waitTime = 0;

            while (waitTime < maxWaitTime) {
                const portalHistory = this.extractFromPortalContainer();
                if (portalHistory && portalHistory.length > 0) {
                    console.log('✅ Tooltip появился, данные найдены');
                    return portalHistory;
                }

                await new Promise(resolve => setTimeout(resolve, checkInterval));
                waitTime += checkInterval;
            }

            console.log('⏰ Время ожидания tooltip истекло');
            return null;

        } catch (error) {
            console.error('❌ Ошибка симуляции hover:', error);
            return null;
        }
    }


    /**
     * Резервный поиск в DOM
     */
    async fallbackDOMSearch() {
        console.log('🔍 Резервный поиск в DOM...');

        try {
            const historyEntries = [];

            // Ищем все возможные контейнеры с историей цен
            const containerSelectors = [
                '[data-marker="portals-container"]',
                '.price-history-container',
                '.tooltip-container',
                '[role="tooltip"]',
                '.popover-content'
            ];

            for (const selector of containerSelectors) {
                const containers = document.querySelectorAll(selector);

                for (const container of containers) {
                    if (container.textContent.includes('₽') &&
                        /\b(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/.test(container.textContent)) {

                        console.log(`📦 Найден потенциальный контейнер с историей: ${selector}`);
                        const data = this.parseHistoryFromTooltip(container);

                        if (data && data.length > 0) {
                            historyEntries.push(...data);
                        }
                    }
                }
            }

            return historyEntries;

        } catch (error) {
            console.error('❌ Ошибка резервного поиска:', error);
            return [];
        }
    }

    /**
     * Отладочный метод для анализа структуры tooltip
     */
    debugTooltipStructure(tooltip) {
        console.log('🔍 Анализ структуры tooltip...');

        console.log('📋 Текстовое содержимое tooltip:');
        console.log(tooltip.textContent);

        console.log('📋 HTML структура tooltip:');
        console.log(tooltip.innerHTML.substring(0, 1000));

        console.log('📋 Все элементы p в tooltip:');
        const pElements = tooltip.querySelectorAll('p');
        pElements.forEach((p, index) => {
            console.log(`P[${index}]: "${p.textContent.trim()}" - classes: ${p.className}`);
        });

        console.log('📋 Элементы с датами:');
        const dateElements = Array.from(pElements).filter(p => {
            const text = p.textContent.trim();
            return /\b(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/.test(text);
        });
        dateElements.forEach((p, index) => {
            console.log(`Дата[${index}]: "${p.textContent.trim()}"`);
        });

        console.log('📋 Элементы с ценами:');
        const priceElements = Array.from(pElements).filter(p => {
            const text = p.textContent.trim();
            return /\d[\d\s]*₽/.test(text);
        });
        priceElements.forEach((p, index) => {
            console.log(`Цена[${index}]: "${p.textContent.trim()}"`);
        });
    }


    /**
     * МЕТОД 3: Резервный поиск в DOM
     */
    extractFromDOMSearch() {
        console.log('🔍 Резервный поиск в DOM...');

        try {
            const historyEntries = [];

            // Ищем все элементы, содержащие российские месяцы и цены
            const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

            const allElements = document.querySelectorAll('*');

            for (const element of allElements) {
                const text = element.textContent;
                if (!text) continue;

                // Проверяем, содержит ли текст месяц и цену
                const hasMonth = monthNames.some(month => text.includes(month));
                const hasPrice = text.includes('₽') && /\d+/.test(text);

                if (hasMonth && hasPrice && text.length < 100) { // Ограничиваем длину текста
                    console.log(`🔍 Проверяем элемент: "${text}"`);

                    // Пробуем извлечь дату и цену
                    const patterns = [
                        /(\d{1,2}\s+\w+)\s+([0-9\s]+)\s*₽/,
                        /(\d{1,2}\.\d{1,2})\s+([0-9\s]+)\s*₽/
                    ];

                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            const dateText = match[1].trim();
                            const priceText = match[2].trim();

                            const parsedDate = this.parseRussianDate(dateText);
                            const parsedPrice = this.parsePrice(priceText);

                            if (parsedDate && parsedPrice > 0) {
                                const entry = {
                                    date: parsedDate,
                                    price: parsedPrice,
                                    formatted_date: parsedDate.toLocaleDateString('ru-RU'),
                                    formatted_price: new Intl.NumberFormat('ru-RU').format(parsedPrice) + ' ₽',
                                    original_text: text.trim()
                                };

                                // Проверяем на дубликаты
                                const isDuplicate = historyEntries.some(existing =>
                                    existing.date.getTime() === entry.date.getTime() &&
                                    existing.price === entry.price
                                );

                                if (!isDuplicate) {
                                    console.log(`✅ Найдена запись в DOM:`, entry);
                                    historyEntries.push(entry);
                                }
                            }
                            break;
                        }
                    }
                }
            }

            // Сортируем по дате (новые сначала)
            historyEntries.sort((a, b) => b.date.getTime() - a.date.getTime());

            return historyEntries.length > 0 ? historyEntries : null;

        } catch (error) {
            console.error('❌ Ошибка резервного поиска:', error);
            return null;
        }
    }

    /**
     * Парсинг русских дат
     */
    parseRussianDate(dateStr) {
        if (!dateStr) return null;

        const monthMap = {
            'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3,
            'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7,
            'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
        };

        // Паттерн для "DD месяц" (например, "19 апреля")
        const match = dateStr.match(/(\d{1,2})\s+(\w+)/);
        if (!match) return null;

        const day = parseInt(match[1]);
        const monthName = match[2].toLowerCase();
        const monthNum = monthMap[monthName];

        if (isNaN(day) || monthNum === undefined) return null;

        // Определяем год (текущий или предыдущий)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Если месяц в будущем относительно текущего, то это прошлый год
        let year = currentYear;
        if (monthNum > currentMonth || (monthNum === currentMonth && day > now.getDate())) {
            year = currentYear - 1;
        }

        return new Date(year, monthNum, day);
    }


    /**
     * 🔍 Полная диагностика всех методов парсинга истории цен
     */
    async runFullPriceHistoryDiagnostic() {
        console.log('\n🔍 === ПОЛНАЯ ДИАГНОСТИКА ИСТОРИИ ЦЕН ===');
        console.log(`⏰ Время начала: ${new Date().toLocaleTimeString()}`);

        const methods = [
            {
                name: 'HTML парсинг',
                method: () => this.extractPriceHistoryFromHTML(),
                description: 'Поиск priceHistory в исходном коде HTML'
            },
            {
                name: 'Script теги',
                method: () => this.extractFromScriptTags(),
                description: 'Извлечение из JavaScript кода в тегах <script>'
            },
            {
                name: 'React Fiber',
                method: () => this.extractFromReactFiber(),
                description: 'Обход React компонентов через Fiber'
            },
            {
                name: 'Симуляция hover',
                method: () => this.advancedTooltipActivation(),
                description: 'Активация tooltip через имитацию пользователя'
            },
            {
                name: 'API перехват',
                method: () => window.foundPriceHistory || null,
                description: 'Данные, перехваченные из AJAX запросов'
            }
        ];

        const results = {};

        for (const { name, method, description } of methods) {
            console.log(`\n🔄 Тестируем: ${name}`);
            console.log(`📝 ${description}`);

            try {
                const startTime = performance.now();
                const result = await method();
                const endTime = performance.now();
                const duration = Math.round(endTime - startTime);

                results[name] = {
                    success: result && result.length > 0,
                    count: result?.length || 0,
                    duration: duration,
                    data: result?.slice(0, 2) || null
                };

                if (result && result.length > 0) {
                    console.log(`✅ ${name}: Найдено ${result.length} записей за ${duration}мс`);
                    console.log(`📊 Примеры данных:`, result.slice(0, 2));
                } else {
                    console.log(`❌ ${name}: Данные не найдены (${duration}мс)`);
                }

            } catch (error) {
                console.log(`💥 ${name}: Ошибка - ${error.message}`);
                results[name] = {
                    success: false,
                    error: error.message,
                    duration: 0
                };
            }
        }

        // Итоговый отчет
        console.log('\n📊 === ИТОГОВЫЙ ОТЧЕТ ===');
        const successful = Object.values(results).filter(r => r.success).length;
        console.log(`✅ Успешных методов: ${successful}/${methods.length}`);

        if (successful > 0) {
            const bestMethod = Object.entries(results)
                .filter(([_, r]) => r.success)
                .sort(([_, a], [__, b]) => b.count - a.count)[0];

            console.log(`🏆 Лучший метод: ${bestMethod[0]} (${bestMethod[1].count} записей)`);
        }

        console.log('🔚 === КОНЕЦ ДИАГНОСТИКИ ===\n');
        return results;
    }

    /**
     * 🧪 Тест разных способов активации tooltip
     */
    async tryDifferentActivationMethods() {
        console.log('\n🧪 === ТЕСТ АКТИВАЦИИ TOOLTIP ===');

        const priceButton = document.querySelector('.price-history-entry-point-iKhax');
        if (!priceButton) {
            console.log('❌ Кнопка истории цен не найдена');
            return false;
        }

        const methods = [
            {
                name: 'MouseEnter',
                action: () => priceButton.dispatchEvent(new MouseEvent('mouseenter'))
            },
            {
                name: 'MouseOver',
                action: () => priceButton.dispatchEvent(new MouseEvent('mouseover'))
            },
            {
                name: 'Focus',
                action: () => priceButton.focus()
            },
            {
                name: 'Click',
                action: () => priceButton.click()
            },
            {
                name: 'PointerEnter',
                action: () => priceButton.dispatchEvent(new PointerEvent('pointerenter'))
            }
        ];

        for (const { name, action } of methods) {
            console.log(`🔄 Тестируем: ${name}`);

            try {
                action();
                await this.wait(300);

                const tooltip = this.checkForVisibleTooltip();
                if (tooltip) {
                    console.log(`✅ ${name}: Tooltip активирован!`);
                    return true;
                } else {
                    console.log(`❌ ${name}: Tooltip не появился`);
                }

            } catch (error) {
                console.log(`💥 ${name}: Ошибка - ${error.message}`);
            }
        }

        console.log('🔚 === КОНЕЦ ТЕСТА АКТИВАЦИИ ===\n');
        return false;
    }


    /**
     * Парсинг цены из текста
     */
    parsePrice(priceText) {
        if (!priceText) return 0;

        // Убираем все кроме цифр
        const cleanPrice = priceText.replace(/[^\d]/g, '');
        const price = parseInt(cleanPrice);

        return isNaN(price) ? 0 : price;
    }

    /**
     * Парсинг данных из открытой формы истории цены
     * @returns {Promise<Array>} массив записей истории цены
     */
    async parsePriceHistoryData() {
        console.log('📊 Парсинг данных истории цены из открытой формы...');

        const historyEntries = [];

        try {
            // Ищем контейнер с историей цены
            const portalsContainer = document.querySelector('[data-marker="portals-container"]');
            if (!portalsContainer) {
                console.log('❌ Контейнер портала не найден');
                return [];
            }

            // Ищем активную форму с историей
            const historyContainer = this.findHistoryContentInPortals(portalsContainer);
            if (!historyContainer) {
                console.log('❌ Контейнер истории цены не найден');
                return [];
            }

            console.log('✅ Найден контейнер истории цены:', historyContainer);

            // Пробуем разные способы парсинга структуры
            const parsedData = await this.tryMultipleParseMethods(historyContainer);

            if (parsedData.length > 0) {
                console.log(`✅ Успешно распарсено ${parsedData.length} записей истории`);
                return parsedData;
            } else {
                console.log('⚠️ Данные истории не найдены в контейнере');
                return [];
            }

        } catch (error) {
            console.error('❌ Ошибка при парсинге данных истории:', error);
            return [];
        }
    }

    /**
 * Парсинг всех цен в контейнере
 */
    parseAllPricesInContainer(container, priceHistory) {
        const text = container.textContent;
        console.log('📦 Парсим контейнер:', text.substring(0, 200));

        // Ищем все упоминания цен с датами
        const pricePatterns = [
            /(\d{1,2}\s+\w+)\s+([0-9\s]+)\s*₽/g,
            /(\d{1,2}\.\d{1,2})\s+([0-9\s]+)/g
        ];

        pricePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const item = this.parsePriceHistoryItem(match[0]);
                if (item) {
                    priceHistory.push(item);
                }
            }
        });
    }

    /**
     * Глобальный поиск истории цен на странице
     */
    globalSearchPriceHistory(priceHistory) {
        const pageText = document.body.textContent;

        // Ищем все упоминания месяцев с ценами
        const monthPricePattern = /(\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря))\s+([0-9\s]+)\s*₽/g;

        let match;
        while ((match = monthPricePattern.exec(pageText)) !== null) {
            const item = this.parsePriceHistoryItem(match[0]);
            if (item) {
                priceHistory.push(item);
            }
        }
    }

    /**
     * Парсинг русской даты
     */
    parseRussianDate(dateStr) {
        const monthMap = {
            'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3,
            'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7,
            'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
        };

        // "13 июня"
        const monthDayMatch = dateStr.match(/(\d{1,2})\s+(\w+)/);
        if (monthDayMatch) {
            const day = parseInt(monthDayMatch[1]);
            const monthName = monthDayMatch[2];
            const month = monthMap[monthName];

            if (month !== undefined) {
                const currentYear = new Date().getFullYear();
                return new Date(currentYear, month, day);
            }
        }

        // "13.06"
        const dotMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})/);
        if (dotMatch) {
            const day = parseInt(dotMatch[1]);
            const month = parseInt(dotMatch[2]) - 1; // Месяцы с 0
            const currentYear = new Date().getFullYear();
            return new Date(currentYear, month, day);
        }

        return new Date(); // Fallback к текущей дате
    }

    /**
     * Парсинг цены из текста
     * @param {string} priceText текст с ценой
     * @returns {number|null} цена или null
     */
    parsePrice(priceText) {
        if (!priceText) return null;

        const cleanPrice = priceText.replace(/[^\d]/g, '');
        const price = parseInt(cleanPrice);

        return price > 0 ? price : null;
    }

    /**
     * Проверка статуса объявления
     */
    checkListingStatus() {
        // Проверяем на наличие уведомления о снятом объявлении
        const closedWarning = document.querySelector('[data-marker="item-view/closed-warning"]');
        if (closedWarning && closedWarning.textContent.includes('снято с публикации')) {
            return 'archived';
        }

        // Проверяем на класс закрытого объявления
        const closedBlock = document.querySelector('.closed-warning-block-_5cSD');
        if (closedBlock) {
            return 'archived';
        }

        // Проверяем на другие индикаторы снятого объявления
        const errorSelectors = [
            '.item-view-warning',
            '.item-expired',
            '[data-marker="item-view/item-removed"]',
            '.style-closed-HV2__'
        ];

        for (const selector of errorSelectors) {
            if (document.querySelector(selector)) {
                return 'archived';
            }
        }

        // Проверяем редирект или отсутствие основного контента
        if (!document.querySelector('h1')) {
            return 'archived';
        }

        // Проверяем на 404 или другие ошибки по URL
        if (window.location.href.includes('/404') || window.location.href.includes('/error')) {
            return 'archived';
        }

        return 'active';
    }

    /**
     * извлечение ID объявления из URL
     */
    extractExternalId() {
        console.log('🆔 Извлекаем внешний ID...');

        const url = window.location.href;
        console.log(`URL: ${url}`);

        // ✅ Рабочий паттерн из диагностики: ID = 7348952051
        const patterns = [
            /\/kvartiry\/.*_(\d+)(?:\?|#|$)/,  // ✅ РАБОТАЕТ
            /_(\d+)(?:\?|#|$)/,                // ✅ РАБОТАЕТ
            /\/(\d{8,})(?:\?|#|$)/             // Для длинных ID
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                const id = String(match[1]); // Убеждаемся, что возвращаем строку
                console.log(`✅ ID найден через паттерн "${pattern}": ${id} (тип: ${typeof id})`);
                return id;
            }
        }

        console.log('❌ Внешний ID не найден');
        return '';
    }

    /**
     * Извлечение заголовка
     */
    extractTitle() {
        console.log('📝 Извлекаем заголовок...');

        const titleSelectors = [
            // ✅ РАБОЧИЕ селекторы из диагностики
            'h1[itemprop="name"]',              // ✅ РАБОТАЕТ
            'h1',                               // ✅ РАБОТАЕТ
            '[data-marker="item-view/title-info"]', // ✅ НАЙДЕН

            // Резервные селекторы
            '.EEPdn.T7ujv.hQ3Iv.zjI_7.cujIu.uxSuu', // Из диагностики
            'h1.EEPdn.T7ujv.hQ3Iv.zjI_7.cujIu.uxSuu'
        ];

        for (const selector of titleSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    const title = element.textContent.trim();
                    console.log(`✅ Заголовок найден через "${selector}": "${title}"`);
                    return title;
                }
            } catch (error) {
                console.log(`⚠️ Ошибка с селектором "${selector}":`, error.message);
            }
        }

        console.log('❌ Заголовок не найден');
        return '';
    }

    /**
     * Извлечение адреса
     */
    extractAddress() {
        console.log('📍 Извлекаем адрес...');

        const addressSelectors = [
            // ✅ РАБОЧИЙ селектор из диагностики
            '[itemprop="address"]', // ✅ РАБОТАЕТ: "Москва, Симферопольский б-р, 30к1..."

            // Альтернативные селекторы
            '[data-marker*="location"]',
            '.item-address'
        ];

        for (const selector of addressSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    let address = element.textContent.trim();

                    // Очищаем адрес от информации о метро (берем только до первого названия станции)
                    const metroMatch = address.match(/^([^А-Я]*[А-Я][^А-Я]*?(?:ул\.|пр\.|б-р|бульвар|проспект|улица)[^А-Я]*?\d+[^\d]*?)([А-Я])/);
                    if (metroMatch) {
                        address = metroMatch[1].trim();
                    }

                    if (address.length > 5) { // Минимальная длина адреса
                        console.log(`✅ Адрес найден через "${selector}": "${address}"`);
                        return address;
                    }
                }
            } catch (error) {
                console.log(`⚠️ Ошибка с селектором адреса "${selector}":`, error.message);
            }
        }

        console.log('❌ Адрес не найден');
        return '';
    }

    /**
     * Извлечение координат из карты
     */
    extractCoordinates() {
        const mapSelectors = [
            '[data-map-lat][data-map-lon]',
            '.leaflet-container [data-lat][data-lng]'
        ];

        for (const selector of mapSelectors) {
            const mapContainer = document.querySelector(selector);
            if (mapContainer) {
                const lat = mapContainer.getAttribute('data-map-lat') || mapContainer.getAttribute('data-lat');
                const lon = mapContainer.getAttribute('data-map-lon') || mapContainer.getAttribute('data-lng');

                if (lat && lon) {
                    return {
                        lat: parseFloat(lat),
                        lon: parseFloat(lon)
                    };
                }
            }
        }

        return { lat: null, lon: null };
    }

    /**
     * Извлечение цены
     */
    extractPrice() {
        console.log('💰 Извлекаем цену...');

        const priceSelectors = [
            // ✅ РАБОЧИЕ селекторы из диагностики
            '[data-marker="item-view/item-price"]',  // ✅ РАБОТАЕТ: "16 500 000 ₽"
            '[itemprop="price"]',                    // ✅ РАБОТАЕТ: "16 500 000 ₽"
            '[data-marker="item-view/item-price-container"]'
        ];

        for (const selector of priceSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    const priceText = element.textContent.trim();
                    console.log(`🔍 Найден элемент цены "${selector}": "${priceText}"`);

                    // Извлекаем числовое значение цены
                    const priceMatch = priceText.match(/(\d[\d\s]*\d|\d+)/);
                    if (priceMatch) {
                        const price = parseInt(priceMatch[1].replace(/\s/g, ''));
                        if (price > 1000) { // Разумная цена для недвижимости
                            console.log(`✅ Цена найдена: ${price}`);
                            return price;
                        }
                    }
                }
            } catch (error) {
                console.log(`⚠️ Ошибка с селектором цены "${selector}":`, error.message);
            }
        }

        console.log('❌ Цена не найдена');
        return null;
    }

    /**
     * Извлечение описания
     */
    extractDescription() {
        const descSelectors = [
            '[data-marker="item-view/item-description"]',
            '.item-description-text',
            '.item-description-html'
        ];

        for (const selector of descSelectors) {
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
        const photoSelectors = [
            '[data-marker="image-preview/item"] img',
            '.gallery-img-wrapper img',
            '.image-frame img'
        ];

        photoSelectors.forEach(selector => {
            const photoElements = document.querySelectorAll(selector);
            photoElements.forEach(img => {
                const src = img.src || img.getAttribute('data-src');
                if (src && !photos.includes(src)) {
                    // Получаем версию изображения в большом разрешении
                    const largeSrc = src.replace(/\/\d+x\d+\//, '/1200x900/');
                    photos.push(largeSrc);
                }
            });
        });

        return photos;
    }

    /**
     * Извлечение даты размещения
     */
    extractListingDate() {
        const dateSelectors = [
            '[data-marker="item-view/item-date"]',
            '.title-info-metadata-item time'
        ];

        for (const selector of dateSelectors) {
            const dateEl = document.querySelector(selector);
            if (dateEl) {
                const dateText = dateEl.textContent.trim();
                return this.parseAvitoDate(dateText);
            }
        }

        return null;
    }

    /**
     * Извлечение даты обновления
     */
    extractUpdateDate() {
        return this.extractListingDate();
    }

    /**
     * Извлечение количества просмотров
     */
    extractViewsCount() {
        const viewsSelectors = [
            '[data-marker="item-view/total-views"]',
            '.title-info-metadata-item .style-title-info-metadata-item-redesign__item-text'
        ];

        for (const selector of viewsSelectors) {
            const viewsEl = document.querySelector(selector);
            if (viewsEl && viewsEl.textContent.includes('просмотр')) {
                const viewsText = viewsEl.textContent.replace(/[^\d]/g, '');
                const views = parseInt(viewsText);
                if (views > 0) {
                    return views;
                }
            }
        }

        return null;
    }

    /**
     * Извлечение имени продавца
     */
    extractSellerName() {
        const sellerSelectors = [
            '[data-marker="seller-info/name"] a',
            '[data-marker="seller-info/name"] span',
            '.seller-info-name a',
            '.seller-info-name span'
        ];

        for (const selector of sellerSelectors) {
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
        const labelSelectors = [
            '[data-marker="seller-info/label"]',
            '.seller-info-label'
        ];

        for (const selector of labelSelectors) {
            const labelEl = document.querySelector(selector);
            if (labelEl) {
                return labelEl.textContent.trim();
            }
        }

        return '';
    }

    /**
     * Извлечение типа недвижимости
     */
    extractPropertyType() {
        const title = this.extractTitle();
        if (title.includes('Студия')) return 'studio';
        if (title.includes('1-к')) return '1k';
        if (title.includes('2-к')) return '2k';
        if (title.includes('3-к')) return '3k';
        if (title.includes('4-к') || title.includes('5-к') || title.includes('6-к')) return '4k+';
        return '';
    }

    /**
     * Извлечение общей площади
     */
    extractTotalArea() {
        console.log('📐 Извлекаем общую площадь...');

        // Метод 1: Из заголовка (самый надежный для данной страницы)
        const title = this.extractTitle();
        if (title) {
            // Ищем паттерн "39,9 м²" в заголовке
            const areaMatch = title.match(/(\d+(?:[.,]\d+)?)\s*м²/);
            if (areaMatch) {
                const area = parseFloat(areaMatch[1].replace(',', '.'));
                console.log(`✅ Площадь найдена в заголовке: ${area} м²`);
                return area;
            }
        }

        // Метод 2: Поиск в параметрах
        const paramResult = this.findParamValue('общая площадь');
        if (paramResult) {
            const areaMatch = paramResult.match(/(\d+(?:[.,]\d+)?)/);
            if (areaMatch) {
                const area = parseFloat(areaMatch[1].replace(',', '.'));
                console.log(`✅ Площадь найдена в параметрах: ${area} м²`);
                return area;
            }
        }

        console.log('❌ Общая площадь не найдена');
        return null;
    }

    /**
     * Извлечение площади кухни
     */
    extractKitchenArea() {
        console.log('🍳 Извлекаем площадь кухни...');

        // Метод 1: Поиск в параметрах (основной)
        const areaParam = this.findParamValue('Площадь кухни');
        if (areaParam) {
            console.log('Найдена площадь кухни в параметрах:', areaParam);
            const match = areaParam.match(/(\d+(?:[.,]\d+)?)/);
            if (match) {
                const area = parseFloat(match[1].replace(',', '.'));
                console.log(`✅ Площадь кухни из параметров: ${area} м²`);
                return area;
            }
        }

        // Метод 2: Прямой поиск в контейнере параметров
        const paramsContainer = document.querySelector('#bx_item-params');
        if (paramsContainer) {
            console.log('Проверяем контейнер параметров для площади кухни');
            const html = paramsContainer.innerHTML;

            // Ищем "Площадь кухни" в HTML
            const kitchenMatch = html.match(/Площадь кухни[^>]*>([^<]*)/i);
            if (kitchenMatch) {
                const areaText = kitchenMatch[1];
                console.log('Найден текст площади кухни в HTML:', areaText);

                const numberMatch = areaText.match(/(\d+(?:[.,]\d+)?)/);
                if (numberMatch) {
                    const area = parseFloat(numberMatch[1].replace(',', '.'));
                    console.log(`✅ Площадь кухни из HTML: ${area} м²`);
                    return area;
                }
            }
        }

        // Метод 3: Поиск по альтернативным селекторам
        const alternativeSelectors = [
            '.params-paramsList-_awNW li',
            '#bx_item-params li',
            '[data-marker="item-view/item-params"] li',
            '.params-paramsList__item'
        ];

        for (const selector of alternativeSelectors) {
            const paramItems = document.querySelectorAll(selector);
            console.log(`Проверяем селектор ${selector} для площади кухни, найдено элементов:`, paramItems.length);

            for (const item of paramItems) {
                const text = item.textContent;

                if (text.toLowerCase().includes('площадь кухни') ||
                    (text.toLowerCase().includes('кухня') && text.toLowerCase().includes('м²'))) {

                    console.log('Найден элемент с площадью кухни:', text);
                    const match = text.match(/(\d+(?:[.,]\d+)?)\s*м²?/);
                    if (match) {
                        const area = parseFloat(match[1].replace(',', '.'));
                        console.log(`✅ Площадь кухни из альтернативных селекторов: ${area} м²`);
                        return area;
                    }
                }
            }
        }

        console.log('❌ Площадь кухни не найдена');
        return null;
    }

    /**
     * Извлечение жилой площади
     */
    extractLivingArea() {
        console.log('🏠 Извлекаем жилую площадь...');

        // Метод 1: Поиск в параметрах (основной)
        const areaParam = this.findParamValue('Жилая площадь');
        if (areaParam) {
            console.log('Найдена жилая площадь в параметрах:', areaParam);
            const match = areaParam.match(/(\d+(?:[.,]\d+)?)/);
            if (match) {
                const area = parseFloat(match[1].replace(',', '.'));
                console.log(`✅ Жилая площадь из параметров: ${area} м²`);
                return area;
            }
        }

        // Метод 2: Прямой поиск в контейнере параметров
        const paramsContainer = document.querySelector('#bx_item-params');
        if (paramsContainer) {
            console.log('Проверяем контейнер параметров для жилой площади');
            const html = paramsContainer.innerHTML;

            // Ищем "Жилая площадь" в HTML
            const livingMatch = html.match(/Жилая площадь[^>]*>([^<]*)/i);
            if (livingMatch) {
                const areaText = livingMatch[1];
                console.log('Найден текст жилой площади в HTML:', areaText);

                const numberMatch = areaText.match(/(\d+(?:[.,]\d+)?)/);
                if (numberMatch) {
                    const area = parseFloat(numberMatch[1].replace(',', '.'));
                    console.log(`✅ Жилая площадь из HTML: ${area} м²`);
                    return area;
                }
            }
        }

        // Метод 3: Поиск по альтернативным селекторам
        const alternativeSelectors = [
            '.params-paramsList-_awNW li',
            '#bx_item-params li',
            '[data-marker="item-view/item-params"] li',
            '.params-paramsList__item'
        ];

        for (const selector of alternativeSelectors) {
            const paramItems = document.querySelectorAll(selector);
            console.log(`Проверяем селектор ${selector} для жилой площади, найдено элементов:`, paramItems.length);

            for (const item of paramItems) {
                const text = item.textContent;

                if (text.toLowerCase().includes('жилая площадь') ||
                    (text.toLowerCase().includes('жилая') && text.toLowerCase().includes('м²'))) {

                    console.log('Найден элемент с жилой площадью:', text);
                    const match = text.match(/(\d+(?:[.,]\d+)?)\s*м²?/);
                    if (match) {
                        const area = parseFloat(match[1].replace(',', '.'));
                        console.log(`✅ Жилая площадь из альтернативных селекторов: ${area} м²`);
                        return area;
                    }
                }
            }
        }

        console.log('❌ Жилая площадь не найдена');
        return null;
    }

    /**
     * Отладка парсинга всех площадей - РАСШИРЕННАЯ ВЕРСИЯ
     */
    debugAllAreasParsing() {
        console.log('=== 🔍 ДИАГНОСТИКА ПАРСИНГА ВСЕХ ПЛОЩАДЕЙ ===');

        // Проверяем заголовок
        const title = this.extractTitle();
        console.log('📝 Заголовок:', title);

        // Проверяем контейнер параметров
        const paramsContainer = document.querySelector('#bx_item-params');
        if (paramsContainer) {
            console.log('✅ Контейнер параметров найден');
            console.log('📄 HTML параметров (первые 1000 символов):',
                paramsContainer.innerHTML.substring(0, 1000));

            // Ищем все упоминания площадей в HTML
            const html = paramsContainer.innerHTML;
            const areaMatches = {
                'Общая площадь': html.match(/Общая площадь[^>]*>([^<]*)/i),
                'Площадь кухни': html.match(/Площадь кухни[^>]*>([^<]*)/i),
                'Жилая площадь': html.match(/Жилая площадь[^>]*>([^<]*)/i)
            };

            console.log('🔍 Поиск площадей в HTML:');
            Object.entries(areaMatches).forEach(([type, match]) => {
                if (match) {
                    console.log(`  ✅ ${type}: "${match[1]}"`);
                } else {
                    console.log(`  ❌ ${type}: не найдена`);
                }
            });
        } else {
            console.log('❌ Контейнер параметров НЕ найден');
        }

        // Проверяем элементы параметров
        const paramItems = document.querySelectorAll('.params-paramsList-_awNW .params-paramsList__item-_2Y2O');
        console.log(`📋 Найдено элементов параметров: ${paramItems.length}`);

        paramItems.forEach((item, index) => {
            const text = item.textContent.trim();
            if (text.toLowerCase().includes('площадь')) {
                console.log(`  📐 Параметр ${index + 1}: "${text}"`);
            }
        });

        // Тестируем все методы извлечения площадей
        console.log('🧪 ТЕСТИРОВАНИЕ МЕТОДОВ:');

        const totalArea = this.extractTotalArea();
        console.log(`📐 Общая площадь: ${totalArea || 'НЕ НАЙДЕНА'} м²`);

        const kitchenArea = this.extractKitchenArea();
        console.log(`🍳 Площадь кухни: ${kitchenArea || 'НЕ НАЙДЕНА'} м²`);

        const livingArea = this.extractLivingArea();
        console.log(`🏠 Жилая площадь: ${livingArea || 'НЕ НАЙДЕНА'} м²`);

        console.log('=== 🏁 КОНЕЦ ДИАГНОСТИКИ ПЛОЩАДЕЙ ===');

        return {
            total: totalArea,
            kitchen: kitchenArea,
            living: livingArea
        };
    }

    /**
     * Извлечение этажа
     */
    extractFloor() {
        console.log('🏢 Извлекаем этаж...');

        // Из заголовка
        const title = this.extractTitle();
        if (title) {
            // Ищем паттерн "12/25 эт."
            const floorMatch = title.match(/(\d+)\/\d+\s*эт\./);
            if (floorMatch) {
                const floor = parseInt(floorMatch[1]);
                console.log(`✅ Этаж найден в заголовке: ${floor}`);
                return floor;
            }
        }

        // Альтернативный поиск в параметрах
        const paramResult = this.findParamValue('этаж');
        if (paramResult) {
            const floorMatch = paramResult.match(/(\d+)/);
            if (floorMatch) {
                const floor = parseInt(floorMatch[1]);
                console.log(`✅ Этаж найден в параметрах: ${floor}`);
                return floor;
            }
        }

        console.log('❌ Этаж не найден');
        return null;
    }

    /**
     * Извлечение этажности дома
     */
    extractFloorsTotal() {
        console.log('🏗️ Извлекаем общее количество этажей...');

        // Из заголовка
        const title = this.extractTitle();
        if (title) {
            // Ищем паттерн "12/25 эт."
            const floorsMatch = title.match(/\d+\/(\d+)\s*эт\./);
            if (floorsMatch) {
                const floors = parseInt(floorsMatch[1]);
                console.log(`✅ Этажность найдена в заголовке: ${floors}`);
                return floors;
            }
        }

        // Альтернативный поиск в параметрах
        const paramResult = this.findParamValue('этажность') || this.findParamValue('этажей в доме');
        if (paramResult) {
            const floorsMatch = paramResult.match(/(\d+)/);
            if (floorsMatch) {
                const floors = parseInt(floorsMatch[1]);
                console.log(`✅ Этажность найдена в параметрах: ${floors}`);
                return floors;
            }
        }

        console.log('❌ Этажность не найдена');
        return null;
    }

    /**
     * Извлечение количества комнат
     */
    extractRooms() {
        console.log('🚪 Извлекаем количество комнат...');

        // Из заголовка
        const title = this.extractTitle();
        if (title) {
            // Ищем паттерн "1-к. квартира"
            const roomsMatch = title.match(/(\d+)-к\.\s*квартира/i);
            if (roomsMatch) {
                const rooms = parseInt(roomsMatch[1]);
                console.log(`✅ Количество комнат найдено в заголовке: ${rooms}`);
                return rooms;
            }
        }

        // Альтернативный поиск в параметрах
        const paramResult = this.findParamValue('количество комнат') || this.findParamValue('комнат');
        if (paramResult) {
            const roomsMatch = paramResult.match(/(\d+)/);
            if (roomsMatch) {
                const rooms = parseInt(roomsMatch[1]);
                console.log(`✅ Количество комнат найдено в параметрах: ${rooms}`);
                return rooms;
            }
        }

        console.log('❌ Количество комнат не найдено');
        return null;
    }

    /**
     * Извлечение состояния ремонта
     */
    extractCondition() {
        const conditionParam = this.findParamValue('Ремонт');
        return conditionParam || '';
    }

    /**
     * Извлечение типа дома
     */
    extractHouseType() {
        const houseTypeParam = this.findParamValue('Тип дома');
        return houseTypeParam || '';
    }

    /**
     * Извлечение года постройки
     */
    extractYearBuilt() {
        const yearParam = this.findParamValue('Год постройки');
        if (yearParam) {
            const match = yearParam.match(/(\d{4})/);
            return match ? parseInt(match[1]) : null;
        }
        return null;
    }

    /**
     * Извлечение типа санузла
     */
    extractBathroomType() {
        const bathroomParam = this.findParamValue('Санузел');
        return bathroomParam || '';
    }

    /**
     * Извлечение наличия балкона
     */
    extractBalcony() {
        const balconyParam = this.findParamValue('Балкон');
        if (balconyParam) {
            return !balconyParam.toLowerCase().includes('нет');
        }
        return null;
    }

    /**
     * Извлечение высоты потолков
     */
    extractCeilingHeight() {
        const ceilingParam = this.findParamValue('Высота потолков');
        if (ceilingParam) {
            const match = ceilingParam.match(/(\d+(?:\.\d+)?)/);
            return match ? parseFloat(match[1]) : null;
        }
        return null;
    }

    /**
     * Поиск значения параметра по имени
     */
    findParamValue(paramName) {
        console.log('Ищем параметр:', paramName);

        // ОБНОВЛЕННЫЕ селекторы для новой структуры Авито
        const paramSelectors = [
            // Новая структура 2024
            '.params-paramsList-_awNW .params-paramsList__item-_2Y2O',
            '#bx_item-params .params-paramsList__item-_2Y2O',

            // Резервные селекторы для разных версий
            '.params-paramsList__item',
            '[data-marker="item-view/item-params"] .params-paramsList__item',
            '.item-params .params-list .params-list-item',
            '[data-marker="item-params"] .params-item',
            '.item-view-params .item-view-params-item',
            '.item-params-list .item-params-list-item',
            '.params-list-wrapper .params-item'
        ];

        for (const selector of paramSelectors) {
            const paramItems = document.querySelectorAll(selector);
            console.log(`Селектор ${selector}: найдено ${paramItems.length} элементов`);

            for (const item of paramItems) {
                const text = item.textContent;
                console.log('Проверяем текст параметра:', text);

                if (text.toLowerCase().includes(paramName.toLowerCase())) {
                    console.log('Найден подходящий параметр:', text);

                    // Пробуем разные способы извлечения значения
                    const colonSplit = text.split(':');
                    if (colonSplit.length > 1) {
                        const value = colonSplit[1].trim();
                        console.log('Значение после двоеточия:', value);
                        return value;
                    }

                    // Если нет двоеточия, возвращаем весь текст
                    return text.trim();
                }
            }
        }

        console.log('Параметр не найден:', paramName);
        
        // Отправляем отчет об ошибке в Telegram
        if (typeof reportSelectorError === 'function') {
            reportSelectorError(
                paramName,
                paramSelectors,
                window.location.href,
                'findParamValue'
            );
        }
        
        return null;
    }

    /**
     * Парсинг даты в формате Avito
     */
    parseAvitoDate(dateText) {
        try {
            const now = new Date();

            if (dateText.includes('сегодня')) {
                return now;
            } else if (dateText.includes('вчера')) {
                const yesterday = new Date(now);
                yesterday.setDate(now.getDate() - 1);
                return yesterday;
            } else if (dateText.includes('дня') || dateText.includes('дней')) {
                const daysMatch = dateText.match(/(\d+)\s*дня|дней/);
                if (daysMatch) {
                    const daysAgo = parseInt(daysMatch[1]);
                    const date = new Date(now);
                    date.setDate(now.getDate() - daysAgo);
                    return date;
                }
            } else {
                // Пробуем стандартный формат даты
                const dateMatch = dateText.match(/(\d{1,2})\s*(\w+)\s*(\d{4})?/);
                if (dateMatch) {
                    const day = parseInt(dateMatch[1]);
                    const monthName = dateMatch[2];
                    const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();

                    const monthMap = {
                        'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3,
                        'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7,
                        'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
                    };

                    const month = monthMap[monthName];
                    if (month !== undefined) {
                        return new Date(year, month, day);
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing date:', dateText, error);
        }

        return null;
    }

    /**
     * Генерация краткого названия объявления
     */
    generateName(data) {
        const parts = [];

        // Тип недвижимости
        if (data.property_type) {
            const typeMap = {
                'studio': 'Студия',
                '1k': '1к',
                '2k': '2к',
                '3k': '3к',
                '4k+': '4к+'
            };
            parts.push(typeMap[data.property_type] || data.property_type);
        }

        // Площадь
        if (data.area_total) {
            parts.push(`${data.area_total}м²`);
        }

        // Этаж
        if (data.floor) {
            if (data.floors_total) {
                parts.push(`${data.floor}/${data.floors_total}эт`);
            } else {
                parts.push(`${data.floor}эт`);
            }
        }

        // Адрес (сокращенный)
        if (data.address) {
            const addressParts = data.address.split(',');
            if (addressParts.length > 1) {
                parts.push(addressParts[1].trim());
            }
        }

        return parts.join(', ') || 'Квартира';
    }

    debugAreaParsing() {
        console.log('=== ДИАГНОСТИКА ПАРСИНГА ПЛОЩАДИ ===');

        // Проверяем заголовок
        const title = this.extractTitle();
        console.log('Заголовок:', title);

        // Проверяем все возможные селекторы параметров (обновленные)
        const selectors = [
            '#bx_item-params',
            '[data-marker="item-view/item-params"]',
            '.params-paramsList-_awNW',
            '.item-params',
            '[data-marker="item-params"]',
            '.item-view-params'
        ];

        selectors.forEach(selector => {
            const container = document.querySelector(selector);
            if (container) {
                console.log(`Контейнер ${selector} найден:`, container);
                console.log('HTML содержимое:', container.innerHTML.substring(0, 1000));

                // Проверяем элементы параметров внутри
                const items = container.querySelectorAll('li, .params-paramsList__item-_2Y2O, .params-item');
                console.log(`Элементов параметров внутри: ${items.length}`);

                items.forEach((item, index) => {
                    if (index < 5) { // Показываем первые 5
                        console.log(`  Параметр ${index + 1}:`, item.textContent);
                    }
                });
            } else {
                console.log(`Контейнер ${selector} НЕ найден`);
            }
        });

        // Ищем любые элементы со словом "площадь"
        const allElements = document.querySelectorAll('*');
        let areaElements = [];
        allElements.forEach(el => {
            if (el.textContent && el.textContent.toLowerCase().includes('площадь')) {
                areaElements.push({
                    tagName: el.tagName,
                    className: el.className,
                    textContent: el.textContent.trim(),
                    selector: this.getElementSelector(el)
                });
            }
        });

        console.log('Элементы со словом "площадь":', areaElements.slice(0, 10)); // Показываем первые 10
        console.log('=== КОНЕЦ ДИАГНОСТИКИ ===');
    }


    getElementSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }

        if (element.className) {
            return `.${element.className.split(' ')[0]}`;
        }

        const dataMarker = element.getAttribute('data-marker');
        if (dataMarker) {
            return `[data-marker="${dataMarker}"]`;
        }

        return element.tagName.toLowerCase();
    }

    /**
     * Очистка URL от параметров контекста и временных параметров
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
                'from'
            ];

            // Удаляем нежелательные параметры
            paramsToRemove.forEach(param => {
                urlObj.searchParams.delete(param);
            });

            // Возвращаем очищенный URL
            const cleanedUrl = urlObj.toString();
            console.log('URL очищен:', url, '→', cleanedUrl);
            return cleanedUrl;

        } catch (error) {
            console.error('Ошибка при очистке URL:', error);
            return url; // Возвращаем исходный URL если не удалось очистить
        }
    }

    /**
     * Поиск элементов по тексту (альтернатива :contains)
     * @param {string} text искомый текст
     * @returns {Element[]} массив найденных элементов
     */
    getElementsByText(text) {
        const elements = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function (node) {
                    return node.textContent.includes(text) ?
                        NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim() === text) {
                elements.push(node);
            }
        }

        return elements;
    }

    /**
     * Имитация события mouseenter для открытия формы
     * @param {Element} triggerElement элемент-триггер
     * @returns {Promise<void>}
     */
    async triggerPriceHistoryOpen(triggerElement) {
        console.log('🖱️ Имитируем mouseenter для открытия формы...');

        try {
            // Создаем событие mouseenter
            const mouseEnterEvent = new MouseEvent('mouseenter', {
                bubbles: true,
                cancelable: true,
                view: window
            });

            // Создаем событие mouseover (может потребоваться)
            const mouseOverEvent = new MouseEvent('mouseover', {
                bubbles: true,
                cancelable: true,
                view: window
            });

            // Фокусируемся на элементе (если он поддерживает focus)
            if (triggerElement.focus) {
                triggerElement.focus();
            }

            // Отправляем события
            triggerElement.dispatchEvent(mouseOverEvent);
            triggerElement.dispatchEvent(mouseEnterEvent);

            // Для элементов с tabindex можем попробовать событие focus
            if (triggerElement.hasAttribute('tabindex')) {
                const focusEvent = new FocusEvent('focus', {
                    bubbles: true,
                    cancelable: true
                });
                triggerElement.dispatchEvent(focusEvent);
            }

            // Даем время для обработки события
            await this.delay(100);

            console.log('✅ События отправлены, ждем реакции...');

        } catch (error) {
            console.error('❌ Ошибка при отправке событий:', error);
            throw error;
        }
    }

    /**
     * Ожидание появления контейнера с историей цены
     * @param {number} maxWaitTime максимальное время ожидания в мс
     * @returns {Promise<Element|null>} контейнер с историей или null
     */
    async waitForPriceHistoryContainer(maxWaitTime = 3000) {
        console.log('⏳ Ждем появления контейнера с историей цены...');

        const startTime = Date.now();
        const checkInterval = 100; // проверяем каждые 100мс

        return new Promise((resolve) => {
            const checkForContainer = () => {
                // Ищем контейнер портала
                const portalsContainer = document.querySelector('[data-marker="portals-container"]');

                if (portalsContainer) {
                    console.log('✅ Найден portals-container:', portalsContainer);

                    // Ищем внутри контейнера блоки с историей цены
                    const historyContainer = this.findHistoryContentInPortals(portalsContainer);

                    if (historyContainer) {
                        console.log('✅ Найден контент истории цены!');
                        resolve(historyContainer);
                        return;
                    }
                }

                // Проверяем таймаут
                if (Date.now() - startTime > maxWaitTime) {
                    console.log('❌ Таймаут ожидания контейнера истории цены');
                    resolve(null);
                    return;
                }

                // Продолжаем проверку
                setTimeout(checkForContainer, checkInterval);
            };

            checkForContainer();
        });
    }

    /**
     * Поиск контента истории цены в контейнере порталов
     * @param {Element} portalsContainer контейнер порталов
     * @returns {Element|null} элемент с историей цены или null
     */
    findHistoryContentInPortals(portalsContainer) {
        console.log('🔍 Поиск контента истории в portals-container...');

        // Ищем дочерние элементы с theme классами
        const themeElements = portalsContainer.querySelectorAll('[class*="theme"]');

        for (const element of themeElements) {
            // Проверяем, есть ли внутри элемента контент, связанный с историей цен
            if (this.containsPriceHistoryContent(element)) {
                console.log('✅ Найден элемент с контентом истории цены:', element);
                return element;
            }
        }

        // Дополнительный поиск по ключевым словам
        const allChildren = portalsContainer.querySelectorAll('*');
        for (const child of allChildren) {
            if (child.textContent && (
                child.textContent.includes('История цены') ||
                child.textContent.includes('₽') ||
                child.textContent.includes('руб')
            )) {
                console.log('✅ Найден элемент по содержимому:', child);
                return child.closest('[class*="theme"]') || child;
            }
        }

        console.log('❌ Контент истории цены не найден в portals-container');
        return null;
    }

    /**
     * Проверка, содержит ли элемент контент истории цены
     * @param {Element} element проверяемый элемент
     * @returns {boolean} true если содержит контент истории
     */
    containsPriceHistoryContent(element) {
        // Проверяем размер элемента (история цены должна иметь заметный размер)
        const rect = element.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 50) {
            return false;
        }

        // Проверяем наличие текста с ценами или датами
        const text = element.textContent || '';
        const hasPrice = /\d+[\s,]?\d*\s*₽/.test(text) || /\d+[\s,]?\d*\s*руб/.test(text);
        const hasDate = /\d{1,2}\.\d{1,2}\.\d{4}/.test(text) || /\d{1,2}\s+\w+/.test(text);

        // Проверяем наличие элементов, характерных для истории цен
        const hasChartElements = element.querySelector('svg') ||
            element.querySelector('[class*="chart"]') ||
            element.querySelector('[class*="history"]') ||
            element.querySelector('[class*="price"]');

        return (hasPrice && hasDate) || hasChartElements;
    }

    /**
     * Утилита задержки
     * @param {number} ms время задержки в миллисекундах
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    testParserMethods() {
        console.log('🧪 === ТЕСТ МЕТОДОВ ПАРСЕРА ===');

        const methods = [
            'extractExternalId',
            'extractTitle',
            'extractPrice',
            'extractAddress',
            'extractTotalArea',
            'extractFloor',
            'extractFloorsTotal',
            'extractRooms'
        ];

        const results = {};

        methods.forEach(methodName => {
            try {
                const result = this[methodName]();
                results[methodName] = result;
                console.log(`✅ ${methodName}: ${JSON.stringify(result)}`);
            } catch (error) {
                results[methodName] = `ОШИБКА: ${error.message}`;
                console.log(`❌ ${methodName}: ${error.message}`);
            }
        });

        console.log('📊 Итоги тестирования:', results);
        return results;
    }

    /**
     * Массовый парсинг объявлений Avito
     */
    async startMassParsing(settings) {
        console.log('🚀 === НАЧАЛО МАССОВОГО ПАРСИНГА ===');
        console.log('⚙️ Настройки:', settings);

        try {
            // Создаем панель мониторинга
            this.createMonitoringPanel();
            
            // Проверяем, что мы на странице с фильтром объявлений
            if (!this.isListingsPage()) {
                throw new Error('Не найдена страница со списком объявлений');
            }

            this.parsingState = {
                isRunning: true,
                isPaused: false,
                currentPhase: 'collecting', // 'collecting' | 'parsing' | 'completed'
                totalLinks: 0,
                collectedLinks: 0,
                totalProcessed: 0,
                successfullyParsed: 0,
                errors: 0,
                skipped: 0, // Пропущенные объявления (уже существующие)
                errorLinks: [],
                listings: []
            };

            // Обновляем панель
            this.updateMonitoringPanel();

            // Получаем ссылки на объявления
            console.log('🔍 Поиск объявлений на странице...');
            let allListingLinks = await this.collectListingLinks(settings);
            console.log(`📋 Найдено объявлений: ${allListingLinks.length}`);

            if (allListingLinks.length === 0) {
                this.parsingState.currentPhase = 'completed';
                this.updateMonitoringPanel();
                throw new Error('Не найдено объявлений для парсинга');
            }

            // Фильтруем только новые объявления (которых нет в базе)
            console.log('🔍 Проверяем существующие объявления в базе данных...');
            const newListingLinks = await this.filterNewListings(allListingLinks);
            const skippedCount = allListingLinks.length - newListingLinks.length;
            this.parsingState.skipped = skippedCount;
            console.log(`📊 Из ${allListingLinks.length} найденных объявлений: ${newListingLinks.length} новых, ${skippedCount} пропущено`);

            if (newListingLinks.length === 0) {
                console.log('ℹ️ Все найденные объявления уже есть в базе данных');
                this.parsingState.currentPhase = 'completed';
                this.updateMonitoringPanel();
                return this.parsingState;
            }

            // Обновляем состояние
            this.parsingState.currentPhase = 'parsing';
            this.parsingState.totalLinks = newListingLinks.length;
            this.parsingState.collectedLinks = newListingLinks.length;
            this.updateMonitoringPanel();

            // Парсим только новые объявления
            for (let i = 0; i < newListingLinks.length; i++) {
                // Проверяем состояние парсинга
                if (!this.parsingState.isRunning) {
                    console.log('⏹️ Парсинг остановлен пользователем');
                    break;
                }
                
                // Ожидаем, если парсинг на паузе
                while (this.parsingState.isPaused && this.parsingState.isRunning) {
                    await this.delay(1000);
                }
                
                const link = newListingLinks[i];
                console.log(`📄 Обработка ${i + 1}/${newListingLinks.length}: ${link} (только новые)`);

                try {
                    // Открываем объявление в новой вкладке
                    const listingData = await this.parseSingleListingFromLink(link);
                    
                    if (listingData) {
                        this.parsingState.successfullyParsed++;
                        this.parsingState.listings.push(listingData);
                        console.log(`✅ Успешно спарсено: ${listingData.title}`);
                    } else {
                        this.parsingState.errors++;
                        this.parsingState.errorLinks.push(link);
                        console.log(`❌ Не удалось спарсить объявление`);
                    }

                } catch (error) {
                    this.parsingState.errors++;
                    this.parsingState.errorLinks.push(link);
                    console.error(`❌ Ошибка парсинга объявления ${link}:`, error);
                }

                this.parsingState.totalProcessed++;
                this.updateMonitoringPanel();

                // Задержка между запросами
                if (i < allListingLinks.length - 1 && this.parsingState.isRunning) {
                    console.log(`⏳ Ожидание ${settings.delay}мс...`);
                    await this.delay(settings.delay);
                }
            }

            this.parsingState.currentPhase = 'completed';
            this.parsingState.isRunning = false;
            this.updateMonitoringPanel();

            console.log('🎉 === МАССОВЫЙ ПАРСИНГ ЗАВЕРШЁН ===');
            console.log('📊 Статистика:', this.parsingState);

            return {
                totalProcessed: this.parsingState.totalProcessed,
                successfullyParsed: this.parsingState.successfullyParsed,
                errors: this.parsingState.errors,
                listings: this.parsingState.listings
            };

        } catch (error) {
            if (this.parsingState) {
                this.parsingState.currentPhase = 'completed';
                this.parsingState.isRunning = false;
                this.updateMonitoringPanel();
            }
            console.error('❌ Ошибка массового парсинга:', error);
            throw error;
        }
    }

    /**
     * Проверка, что мы на странице со списком объявлений
     */
    isListingsPage() {
        const url = window.location.href;
        return (url.includes('/kvartiry/') || url.includes('/komnaty/')) && 
               !url.match(/\/kvartiry\/.*_\d+/) && // Не детальная страница
               (document.querySelector('.styles-container-rnTvX') || 
                document.querySelector('[data-marker="catalog-serp"]'));
    }

    /**
     * Сбор ссылок на объявления с прокруткой (упрощенная и улучшенная версия)
     */
    async collectListingLinks(settings) {
        const allLinks = new Set();
        let scrollAttempts = 0;
        const maxScrolls = settings.maxPages || 50; // Увеличиваем лимит для сбора всех объявлений
        let previousCount = 0;
        let stableCount = 0;

        console.log('📜 Начинаем сбор ссылок с прокруткой...');
        
        // Функция для сбора текущих ссылок
        const collectCurrentLinks = () => {
            console.log('🔍 Ищем объявления на странице...');
            
            // Пробуем основной селектор для объявлений
            let listings = document.querySelectorAll('.styles-snippet-ZgKUd');
            
            if (listings.length === 0) {
                // Альтернативные селекторы
                const selectors = [
                    '[data-marker="item"]',
                    '.item-snippet',
                    '.snippet-horizontal',
                    '[data-item-id]',
                    '.iva-item-root',
                    '[class*="snippet"]'
                ];
                
                for (const selector of selectors) {
                    listings = document.querySelectorAll(selector);
                    if (listings.length > 0) {
                        console.log(`✅ Используем селектор: ${selector}, найдено: ${listings.length}`);
                        break;
                    }
                }
            } else {
                console.log(`✅ Используем основной селектор: .styles-snippet-ZgKUd, найдено: ${listings.length}`);
            }
            
            let newLinksCount = 0;
            Array.from(listings).forEach((listing, index) => {
                const link = listing.querySelector('a[href*="/kvartiry/"], a[href*="/komnaty/"]');
                
                if (link && link.href && link.href.match(/_\d+/)) {
                    const fullUrl = link.href.includes('http') ? link.href : `https://www.avito.ru${link.href}`;
                    if (!allLinks.has(fullUrl)) {
                        allLinks.add(fullUrl);
                        newLinksCount++;
                        console.log(`🔗 Ссылка ${allLinks.size}: ${fullUrl}`);
                    }
                }
            });
            
            return newLinksCount;
        };

        // Первоначальный сбор ссылок
        let newLinks = collectCurrentLinks();
        console.log(`📄 Начальный сбор: ${allLinks.size} ссылок`);

        // Собираем ВСЕ доступные объявления через прокрутку
        while (scrollAttempts < maxScrolls) {
            console.log(`🔄 Попытка прокрутки ${scrollAttempts + 1}/${maxScrolls} (текущих ссылок: ${allLinks.size})`);
            
            // Новый подход: ищем видимый активный контейнер на главной странице
            let mainContainer = null;
            
            // Сначала ищем контейнер, который реально видим и содержит объявления
            const containers = [
                '.styles-container-rnTvX.styles-realty-ab__container-YQJua.styles-container_redesign-Xd3mW[tabindex="0"]',
                '.styles-container-rnTvX.styles-realty-ab__container-YQJua',
                '.styles-container-rnTvX',
                '[data-marker="catalog-serp"]',
                '.catalog-serp',
                '.styles-root-IbSNJ',
                '.side-block-wrapper-RLPes'
            ];
            
            for (const selector of containers) {
                const candidate = document.querySelector(selector);
                if (candidate) {
                    const rect = candidate.getBoundingClientRect();
                    const isVisible = rect.top >= -100 && rect.top <= window.innerHeight + 100; // Более гибкая проверка видимости
                    const hasAds = candidate.querySelectorAll('.styles-snippet-ZgKUd').length > 0;
                    
                    console.log(`🔍 Проверяем контейнер ${selector}:`);
                    console.log(`   - Позиция: top=${rect.top}, visible=${isVisible}`);
                    console.log(`   - Объявления: ${hasAds ? candidate.querySelectorAll('.styles-snippet-ZgKUd').length : 0}`);
                    
                    if (isVisible && hasAds) {
                        mainContainer = candidate;
                        console.log(`✅ Выбран видимый контейнер с объявлениями: ${selector}`);
                        break;
                    } else if (!mainContainer && candidate) {
                        mainContainer = candidate; // Запасной вариант
                        console.log(`⚠️ Запасной контейнер: ${selector}`);
                    }
                }
            }
            
            if (mainContainer) {
                console.log(`🎯 Найден контейнер: ${mainContainer.className}`);
                
                // Проверяем, видим ли контейнер
                const rect = mainContainer.getBoundingClientRect();
                const isVisible = rect.top >= -100 && rect.top <= window.innerHeight + 100;
                
                if (!isVisible) {
                    console.log('⚠️ Контейнер не видим, используем альтернативный подход - прокрутка страницы');
                    
                    // Альтернативный подход для невидимых контейнеров
                    await this.handleInvisibleContainer();
                    
                } else {
                    console.log('✅ Контейнер видим, работаем с ним напрямую');
                
                try {
                    // Шаг 1: Контейнер уже в видимой области
                    
                    // Сначала пробуем scrollIntoView
                    mainContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.delay(1500);
                    
                    // Проверяем позицию
                    let rect = mainContainer.getBoundingClientRect();
                    console.log(`📐 Позиция после scrollIntoView: top=${rect.top}, left=${rect.left}, width=${rect.width}, height=${rect.height}`);
                    
                    // Если контейнер все еще не в видимой области, используем альтернативный подход
                    if (rect.top < 0 || rect.top > window.innerHeight) {
                        console.log('⚠️ Контейнер не в видимой области, пробуем альтернативный подход');
                        
                        // Используем offsetTop для точного позиционирования
                        const containerOffsetTop = mainContainer.offsetTop || 0;
                        const targetScrollPosition = Math.max(0, containerOffsetTop - 100); // Оставляем 100px сверху
                        
                        console.log(`📍 Прокручиваем страницу к позиции: ${targetScrollPosition} (offsetTop контейнера: ${containerOffsetTop})`);
                        window.scrollTo({ top: targetScrollPosition, behavior: 'smooth' });
                        await this.delay(1500);
                        
                        // Обновляем позицию
                        rect = mainContainer.getBoundingClientRect();
                        console.log(`📐 Финальная позиция контейнера: top=${rect.top}, видимость: ${rect.top >= 0 && rect.top <= window.innerHeight}`);
                    } else {
                        console.log('✅ Контейнер в видимой области');
                    }
                    
                    // Шаг 2: ОБЯЗАТЕЛЬНО кликаем по контейнеру для активации
                    mainContainer.focus();
                    mainContainer.setAttribute('tabindex', '0');
                    
                    // Кликаем по краю контейнера как указал пользователь (левый верхний угол + 1px)
                    const clickX = rect.left + 1;
                    const clickY = rect.top + 1;
                    
                    console.log(`👆 Кликаем по краю контейнера (левый верхний угол + 1px): x=${clickX}, y=${clickY}`);
                    
                    // Обязательный клик для активации контейнера
                    const clickEvent = new MouseEvent('click', {
                        clientX: clickX,
                        clientY: clickY,
                        bubbles: true,
                        cancelable: true
                    });
                    mainContainer.dispatchEvent(clickEvent);
                    
                    // Дополнительный focus и mousedown для большей надежности
                    const mouseDownEvent = new MouseEvent('mousedown', {
                        clientX: clickX,
                        clientY: clickY,
                        bubbles: true,
                        cancelable: true
                    });
                    mainContainer.dispatchEvent(mouseDownEvent);
                    
                    await this.delay(500);
                    
                    // Шаг 3: Ищем ПРАВИЛЬНЫЙ прокручиваемый контейнер 
                    let scrollableContainer = mainContainer;
                    
                    // Сначала проверяем, можно ли прокручивать основной контейнер
                    if (mainContainer.scrollHeight > mainContainer.clientHeight) {
                        console.log(`✅ Основной контейнер прокручиваемый: scrollHeight=${mainContainer.scrollHeight}, clientHeight=${mainContainer.clientHeight}`);
                        scrollableContainer = mainContainer;
                    } else {
                        // Ищем самый большой прокручиваемый дочерний контейнер (игнорируем маленькие элементы)
                        const possibleScrollContainers = mainContainer.querySelectorAll('div');
                        let bestContainer = null;
                        let bestSize = 0;
                        
                        for (const container of possibleScrollContainers) {
                            if (container.scrollHeight > container.clientHeight) {
                                const containerSize = container.scrollHeight * container.clientHeight;
                                console.log(`🔍 Найден прокручиваемый контейнер: ${container.className || 'без класса'}, размер: ${containerSize}px²`);
                                
                                // Берем контейнер с наибольшей площадью прокрутки
                                if (containerSize > bestSize && containerSize > 10000) { // Минимум 10000px² для исключения мелких элементов
                                    bestContainer = container;
                                    bestSize = containerSize;
                                }
                            }
                        }
                        
                        if (bestContainer) {
                            console.log(`✅ Выбран лучший прокручиваемый контейнер: ${bestContainer.className || 'без класса'}`);
                            scrollableContainer = bestContainer;
                        } else {
                            console.log(`⚠️ Прокручиваемый контейнер не найден, используем основной`);
                        }
                    }
                    
                    const initialScrollTop = scrollableContainer.scrollTop;
                    const initialScrollHeight = scrollableContainer.scrollHeight;
                    const initialClientHeight = scrollableContainer.clientHeight;
                    console.log(`📐 Начальное состояние: scrollTop=${initialScrollTop}, scrollHeight=${initialScrollHeight}, clientHeight=${initialClientHeight}`);
                    
                    // Проверяем, нужна ли вообще прокрутка
                    if (initialScrollHeight <= initialClientHeight) {
                        console.log('📏 Контейнер не нуждается в прокрутке (весь контент видим), используем клавиши навигации');
                        
                        // Контейнер не прокручиваемый - используем только scrollTop с задержкой
                        console.log('📏 Контейнер не нуждается в прокрутке, ожидаем загрузки...');
                        await this.delay(3000);
                        
                    } else {
                        // Пробуем обычную прокрутку
                        console.log('📏 Контейнер прокручиваемый, пробуем стандартные методы прокрутки');
                        
                        // Шаг 4: Прокручиваем значительно больше для гарантированной загрузки новых объявлений
                        const scrollAmount = Math.max(1000, initialClientHeight * 0.8); // Минимум 1000px или 80% высоты контейнера
                        const targetScroll = Math.min(initialScrollTop + scrollAmount, initialScrollHeight - initialClientHeight);
                        
                        console.log(`🔄 Планируем прокрутку на ${scrollAmount}px (до позиции ${targetScroll})`);
                        
                        // ЕДИНСТВЕННЫЙ РАБОТАЮЩИЙ МЕТОД: Прямая установка scrollTop
                        scrollableContainer.scrollTop = targetScroll;
                        console.log(`🔄 Установка scrollTop=${targetScroll}, результат=${scrollableContainer.scrollTop}`);
                        
                        await this.delay(2000);
                        
                        // Проверяем результат
                        const finalScrollTop = scrollableContainer.scrollTop;
                        const scrollDistance = finalScrollTop - initialScrollTop;
                        console.log(`📏 Прокрутка выполнена: начальная=${initialScrollTop}, финальная=${finalScrollTop}, дистанция=${scrollDistance}px`);
                        
                        console.log('⏳ Ожидаем загрузки новых объявлений...');
                        await this.delay(2000);
                    }
                    
                    // Шаг 5: Дополнительное время ожидания для полной загрузки новых объявлений
                    console.log('⏳ Финальное ожидание загрузки...');
                    await this.delay(4000);
                    
                    console.log(`✅ Прокрутка завершена`);
                    
                } catch (e) {
                    console.log('⚠️ Ошибка при прокрутке контейнера:', e);
                }
                }
            } else {
                console.log('⚠️ Контейнер не найден, пробуем прокрутку всей страницы');
                
                // Прокрутка всей страницы
                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'smooth'
                });
                
                await this.delay(2000);
            }
            
            // Собираем новые ссылки после прокрутки
            newLinks = collectCurrentLinks();
            console.log(`📄 После прокрутки ${scrollAttempts + 1}: ${allLinks.size} ссылок (+${newLinks})`);

            // Обновляем панель мониторинга
            if (this.parsingState) {
                this.parsingState.collectedLinks = allLinks.size;
                this.updateMonitoringPanel();
            }

            // Проверяем, добавились ли новые ссылки
            if (allLinks.size === previousCount) {
                stableCount++;
                console.log(`⚠️ Количество ссылок не изменилось: ${allLinks.size} (попытка ${stableCount}/5)`);
                if (stableCount >= 5) {
                    console.log('🔄 Количество ссылок стабилизировалось после 5 попыток, завершаем сбор');
                    break;
                }
            } else {
                stableCount = 0;
                console.log(`✅ Новые ссылки найдены: +${allLinks.size - previousCount} (всего: ${allLinks.size})`);
            }
            
            previousCount = allLinks.size;
            scrollAttempts++;
        }

        // Финальный поиск дополнительных ссылок на всей странице
        console.log(`🔍 Финальный поиск дополнительных ссылок...`);
        const allPageLinks = document.querySelectorAll('a[href*="/kvartiry/"], a[href*="/komnaty/"]');
        
        let additionalCount = 0;
        allPageLinks.forEach(link => {
            if (link.href && link.href.match(/_\d+/)) {
                const fullUrl = link.href.includes('http') ? link.href : `https://www.avito.ru${link.href}`;
                if (!allLinks.has(fullUrl)) {
                    allLinks.add(fullUrl);
                    additionalCount++;
                }
            }
        });
        
        if (additionalCount > 0) {
            console.log(`✅ Найдено ${additionalCount} дополнительных ссылок`);
        }

        console.log(`🎯 Итого собрано уникальных ссылок: ${allLinks.size}`);
        console.log(`📈 Результат сбора: найдено ${allLinks.size} уникальных объявлений для парсинга`);
        return Array.from(allLinks);
    }

    /**
     * Создание панели мониторинга
     */
    createMonitoringPanel() {
        // Удаляем существующую панель
        const existingPanel = document.getElementById('neocenka-monitoring-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'neocenka-monitoring-panel';
        panel.innerHTML = `
            <div class="neocenka-panel-header">
                <h3>🚀 Массовый парсинг</h3>
                <button id="neocenka-close-panel">×</button>
            </div>
            <div class="neocenka-panel-content">
                <div class="neocenka-phase" id="neocenka-phase">
                    <span class="neocenka-phase-icon">🔍</span>
                    <span class="neocenka-phase-text">Поиск объявлений...</span>
                </div>
                
                <div class="neocenka-progress-section" id="neocenka-collecting-section">
                    <div class="neocenka-progress-label">Найдено объявлений: <span id="neocenka-collected-count">0</span></div>
                    <div class="neocenka-progress-bar">
                        <div class="neocenka-progress-fill neocenka-collecting-bar" id="neocenka-collecting-progress" style="width: 0%"></div>
                    </div>
                </div>
                
                <div class="neocenka-progress-section" id="neocenka-parsing-section" style="display: none;">
                    <div class="neocenka-progress-label">Парсинг: <span id="neocenka-parsed-count">0</span> / <span id="neocenka-total-count">0</span></div>
                    <div class="neocenka-progress-bar">
                        <div class="neocenka-progress-fill" id="neocenka-parsing-progress" style="width: 0%"></div>
                    </div>
                    <div class="neocenka-stats">
                        <span class="neocenka-stat neocenka-success">✅ <span id="neocenka-success-count">0</span></span>
                        <span class="neocenka-stat neocenka-error">❌ <span id="neocenka-error-count">0</span></span>
                    </div>
                </div>
                
                <div class="neocenka-controls" id="neocenka-controls">
                    <button id="neocenka-pause-btn" class="neocenka-btn neocenka-btn-warning">⏸️ Пауза</button>
                    <button id="neocenka-stop-btn" class="neocenka-btn neocenka-btn-danger">⏹️ Остановить</button>
                </div>
                
                <div class="neocenka-retry-section" id="neocenka-retry-section" style="display: none;">
                    <div class="neocenka-retry-message">
                        Ошибки парсинга: <span id="neocenka-retry-count">0</span> объявлений
                    </div>
                    <button id="neocenka-retry-btn" class="neocenka-btn neocenka-btn-primary">🔄 Повторить парсинг</button>
                </div>
            </div>
        `;

        // Добавляем стили
        const style = document.createElement('style');
        style.textContent = `
            #neocenka-monitoring-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 320px;
                background: #fff;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                border: 1px solid #e5e7eb;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
            }
            
            .neocenka-panel-header {
                padding: 16px 20px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 12px 12px 0 0;
            }
            
            .neocenka-panel-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }
            
            #neocenka-close-panel {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: background-color 0.2s;
            }
            
            #neocenka-close-panel:hover {
                background-color: rgba(255,255,255,0.2);
            }
            
            .neocenka-panel-content {
                padding: 20px;
            }
            
            .neocenka-phase {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 16px;
                padding: 12px;
                background: #f8fafc;
                border-radius: 8px;
                font-weight: 500;
            }
            
            .neocenka-phase-icon {
                font-size: 16px;
            }
            
            .neocenka-progress-section {
                margin-bottom: 16px;
            }
            
            .neocenka-progress-label {
                margin-bottom: 8px;
                font-weight: 500;
                color: #374151;
            }
            
            .neocenka-progress-bar {
                width: 100%;
                height: 8px;
                background: #e5e7eb;
                border-radius: 4px;
                overflow: hidden;
            }
            
            .neocenka-progress-fill {
                height: 100%;
                transition: width 0.3s ease;
                border-radius: 4px;
                position: relative;
                overflow: hidden;
            }
            
            .neocenka-collecting-bar {
                background: linear-gradient(90deg, #3b82f6, #1d4ed8);
                animation: neocenka-collecting-pulse 2s ease-in-out infinite;
            }
            
            .neocenka-progress-fill:not(.neocenka-collecting-bar) {
                background: linear-gradient(90deg, #10b981, #059669);
            }
            
            @keyframes neocenka-collecting-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            .neocenka-progress-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
                animation: neocenka-progress-shine 1.5s ease-in-out infinite;
            }
            
            @keyframes neocenka-progress-shine {
                0% { left: -100%; }
                100% { left: 100%; }
            }
            
            .neocenka-stats {
                display: flex;
                gap: 16px;
                margin-top: 8px;
            }
            
            .neocenka-stat {
                font-weight: 500;
            }
            
            .neocenka-success {
                color: #059669;
            }
            
            .neocenka-error {
                color: #dc2626;
            }
            
            .neocenka-controls {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
            }
            
            .neocenka-btn {
                flex: 1;
                padding: 8px 12px;
                border: none;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .neocenka-btn-primary {
                background: #3b82f6;
                color: white;
            }
            
            .neocenka-btn-primary:hover {
                background: #2563eb;
            }
            
            .neocenka-btn-warning {
                background: #f59e0b;
                color: white;
            }
            
            .neocenka-btn-warning:hover {
                background: #d97706;
            }
            
            .neocenka-btn-danger {
                background: #ef4444;
                color: white;
            }
            
            .neocenka-btn-danger:hover {
                background: #dc2626;
            }
            
            .neocenka-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .neocenka-retry-section {
                background: #fef3c7;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid #f59e0b;
            }
            
            .neocenka-retry-message {
                margin-bottom: 8px;
                color: #92400e;
                font-weight: 500;
                font-size: 13px;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(panel);

        // Обработчики событий
        document.getElementById('neocenka-close-panel').addEventListener('click', () => {
            panel.remove();
        });

        document.getElementById('neocenka-pause-btn').addEventListener('click', () => {
            this.toggleParsing();
        });

        document.getElementById('neocenka-stop-btn').addEventListener('click', () => {
            this.stopParsing();
        });

        document.getElementById('neocenka-retry-btn').addEventListener('click', () => {
            this.retryFailedParsing();
        });
    }

    /**
     * Обновление панели мониторинга
     */
    updateMonitoringPanel() {
        if (!this.parsingState) return;

        const phase = document.getElementById('neocenka-phase');
        const collectingSection = document.getElementById('neocenka-collecting-section');
        const parsingSection = document.getElementById('neocenka-parsing-section');
        const retrySection = document.getElementById('neocenka-retry-section');
        const controls = document.getElementById('neocenka-controls');

        // Обновляем фазу
        if (this.parsingState.currentPhase === 'collecting') {
            phase.querySelector('.neocenka-phase-icon').textContent = '🔍';
            phase.querySelector('.neocenka-phase-text').textContent = 'Поиск объявлений...';
            collectingSection.style.display = 'block';
            parsingSection.style.display = 'none';
        } else if (this.parsingState.currentPhase === 'parsing') {
            phase.querySelector('.neocenka-phase-icon').textContent = '🚀';
            phase.querySelector('.neocenka-phase-text').textContent = this.parsingState.isPaused ? 'Парсинг на паузе' : 'Парсинг объявлений...';
            collectingSection.style.display = 'none';
            parsingSection.style.display = 'block';
        } else if (this.parsingState.currentPhase === 'completed') {
            phase.querySelector('.neocenka-phase-icon').textContent = '✅';
            phase.querySelector('.neocenka-phase-text').textContent = 'Парсинг завершен';
            controls.style.display = 'none';
        }

        // Обновляем прогресс сбора
        document.getElementById('neocenka-collected-count').textContent = this.parsingState.collectedLinks;
        
        // Обновляем прогресс-бар сбора (анимированный во время поиска)
        if (this.parsingState.currentPhase === 'collecting') {
            // Симулируем прогресс на основе количества найденных ссылок
            const estimatedProgress = Math.min((this.parsingState.collectedLinks / 20) * 100, 90); // Максимум 90% до завершения
            document.getElementById('neocenka-collecting-progress').style.width = estimatedProgress + '%';
        } else if (this.parsingState.collectedLinks > 0) {
            // Завершаем на 100% когда переходим к парсингу
            document.getElementById('neocenka-collecting-progress').style.width = '100%';
        }

        // Обновляем прогресс парсинга
        if (this.parsingState.totalLinks > 0) {
            const progressPercent = (this.parsingState.totalProcessed / this.parsingState.totalLinks) * 100;
            document.getElementById('neocenka-parsing-progress').style.width = progressPercent + '%';
            document.getElementById('neocenka-parsed-count').textContent = this.parsingState.totalProcessed;
            document.getElementById('neocenka-total-count').textContent = this.parsingState.totalLinks;
            document.getElementById('neocenka-success-count').textContent = this.parsingState.successfullyParsed;
            document.getElementById('neocenka-error-count').textContent = this.parsingState.errors;
        }

        // Обновляем счетчик пропущенных объявлений (уже существующих в базе)
        if (this.parsingState.skipped > 0) {
            const skippedElement = document.getElementById('neocenka-skipped-count');
            if (skippedElement) {
                skippedElement.textContent = this.parsingState.skipped;
                // Показываем элемент, если он был скрыт
                const skippedSection = skippedElement.closest('.neocenka-stat-item');
                if (skippedSection) {
                    skippedSection.style.display = 'block';
                }
            }
        }

        // Обновляем кнопку паузы
        const pauseBtn = document.getElementById('neocenka-pause-btn');
        if (pauseBtn) {
            if (this.parsingState.isPaused) {
                pauseBtn.innerHTML = '▶️ Продолжить';
                pauseBtn.className = 'neocenka-btn neocenka-btn-primary';
            } else {
                pauseBtn.innerHTML = '⏸️ Пауза';
                pauseBtn.className = 'neocenka-btn neocenka-btn-warning';
            }
        }

        // Показываем секцию повтора, если есть ошибки
        if (this.parsingState.currentPhase === 'completed' && this.parsingState.errors > 0) {
            document.getElementById('neocenka-retry-count').textContent = this.parsingState.errors;
            retrySection.style.display = 'block';
        } else {
            retrySection.style.display = 'none';
        }
    }

    /**
     * Переключение паузы/продолжения парсинга
     */
    toggleParsing() {
        if (this.parsingState) {
            this.parsingState.isPaused = !this.parsingState.isPaused;
            this.updateMonitoringPanel();
            console.log(this.parsingState.isPaused ? '⏸️ Парсинг поставлен на паузу' : '▶️ Парсинг продолжен');
        }
    }

    /**
     * Остановка парсинга
     */
    stopParsing() {
        if (this.parsingState) {
            this.parsingState.isRunning = false;
            this.parsingState.isPaused = false;
            this.parsingState.currentPhase = 'completed';
            this.updateMonitoringPanel();
            console.log('⏹️ Парсинг остановлен пользователем');
        }
    }

    /**
     * Повторный парсинг ошибочных объявлений
     */
    async retryFailedParsing() {
        if (!this.parsingState || this.parsingState.errorLinks.length === 0) return;

        console.log(`🔄 Повторный парсинг ${this.parsingState.errorLinks.length} ошибочных объявлений`);

        const errorLinks = [...this.parsingState.errorLinks];
        this.parsingState.errorLinks = [];
        this.parsingState.errors = 0;
        this.parsingState.currentPhase = 'parsing';
        this.parsingState.isRunning = true;
        this.parsingState.isPaused = false;
        this.parsingState.totalLinks = errorLinks.length;
        this.parsingState.totalProcessed = 0;
        this.updateMonitoringPanel();

        // Парсим ошибочные ссылки
        for (let i = 0; i < errorLinks.length; i++) {
            if (!this.parsingState.isRunning) break;
            
            while (this.parsingState.isPaused && this.parsingState.isRunning) {
                await this.delay(1000);
            }
            
            const link = errorLinks[i];
            console.log(`🔄 Повтор ${i + 1}/${errorLinks.length}: ${link}`);

            try {
                const listingData = await this.parseSingleListingFromLink(link);
                
                if (listingData) {
                    this.parsingState.successfullyParsed++;
                    this.parsingState.listings.push(listingData);
                    console.log(`✅ Повторно успешно: ${listingData.title}`);
                } else {
                    this.parsingState.errors++;
                    this.parsingState.errorLinks.push(link);
                }
            } catch (error) {
                this.parsingState.errors++;
                this.parsingState.errorLinks.push(link);
                console.error(`❌ Повторная ошибка ${link}:`, error);
            }

            this.parsingState.totalProcessed++;
            this.updateMonitoringPanel();

            if (i < errorLinks.length - 1 && this.parsingState.isRunning) {
                await this.delay(2000); // Меньшая задержка для повторов
            }
        }

        this.parsingState.currentPhase = 'completed';
        this.parsingState.isRunning = false;
        this.updateMonitoringPanel();
        
        console.log('🔄 Повторный парсинг завершен');
    }

    /**
     * Обработка невидимых контейнеров - прокрутка всей страницы
     */
    async handleInvisibleContainer() {
        console.log('🌐 Альтернативный подход: прокрутка всей страницы для загрузки новых объявлений');
        
        // Фокусируемся на document для клавиатурных событий
        document.body.focus();
        
        // Прокрутка страницы вниз
        window.scrollBy({ top: 800, behavior: 'smooth' });
        await this.delay(1000);
        
        // Серия нажатий Page Down и стрелок вниз на всей странице
        for (let i = 0; i < 5; i++) {
            // Page Down
            const pageDownEvent = new KeyboardEvent('keydown', {
                key: 'PageDown',
                code: 'PageDown',
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(pageDownEvent);
            await this.delay(200);
            
            // Несколько нажатий стрелки вниз
            for (let j = 0; j < 10; j++) {
                const arrowDownEvent = new KeyboardEvent('keydown', {
                    key: 'ArrowDown',
                    code: 'ArrowDown',
                    bubbles: true,
                    cancelable: true
                });
                document.dispatchEvent(arrowDownEvent);
                await this.delay(50);
            }
            
            // Проверяем количество объявлений
            const currentCount = document.querySelectorAll('.styles-snippet-ZgKUd').length;
            console.log(`🌐 После цикла ${i + 1}: найдено ${currentCount} объявлений`);
            
            if (currentCount > 10) {
                console.log(`✅ Новые объявления загружены через прокрутку страницы!`);
                break;
            }
        }
    }

    /**
     * Парсинг отдельного объявления по ссылке
     */
    async parseSingleListingFromLink(url) {
        return new Promise((resolve) => {
            // Отправляем запрос в background script для открытия и парсинга
            chrome.runtime.sendMessage({
                action: 'openTabAndParse',
                url: url
                // НЕ передаем segmentId - объявления находятся по координатам
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Ошибка связи с background script:', chrome.runtime.lastError);
                    resolve(null);
                    return;
                }

                if (response && response.success) {
                    resolve(response.data);
                } else {
                    console.error('Ошибка парсинга в новой вкладке:', response?.error);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Задержка
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Фильтрует только новые объявления (которых нет в базе данных)
     */
    async filterNewListings(listingLinks) {
        const newLinks = [];
        
        console.log(`🔍 Начинаем фильтрацию ${listingLinks.length} объявлений...`);
        
        for (let i = 0; i < listingLinks.length; i++) {
            const link = listingLinks[i];
            try {
                // Извлекаем ID объявления из ссылки используя тот же метод что и при парсинге
                const patterns = [
                    /\/kvartiry\/.*_(\d+)(?:\?|#|$)/,  // Полный паттерн
                    /_(\d+)(?:\?|#|$)/,                // ID перед параметрами
                    /\/(\d{8,})(?:\?|#|$)/             // Для длинных ID
                ];
                
                let externalId = null;
                for (const pattern of patterns) {
                    const match = link.match(pattern);
                    if (match && match[1]) {
                        externalId = match[1];
                        break;
                    }
                }
                
                if (!externalId) {
                    console.log(`⚠️ Не удалось извлечь ID из ссылки: ${link}`);
                    continue;
                }
                console.log(`📋 Проверяем объявление ${i + 1}/${listingLinks.length}: ID ${externalId} (тип: ${typeof externalId}), полная ссылка: ${link}`);
                
                // Убеждаемся, что ID - строка
                externalId = String(externalId);
                
                // Проверяем, есть ли объявление в базе
                const existingListing = await this.checkListingExists('avito', externalId);
                console.log(`🔍 Результат проверки для ID ${externalId}: exists=${existingListing}`);
                
                if (!existingListing) {
                    newLinks.push(link);
                    console.log(`✅ Новое объявление добавлено: ${externalId}`);
                } else {
                    console.log(`⏭️ Объявление уже существует, пропускаем: ${externalId}`);
                }
                
            } catch (error) {
                console.error(`❌ Ошибка проверки объявления ${link}:`, error);
                // В случае ошибки добавляем в список для парсинга
                newLinks.push(link);
                console.log(`⚠️ Добавляем в список из-за ошибки: ${link}`);
            }
        }
        
        console.log(`📊 Фильтрация завершена: ${newLinks.length} новых из ${listingLinks.length} найденных`);
        
        // Отладочная информация: выводим список всех external_id в базе
        try {
            const allListings = await this.getAllListingsForDebug();
            console.log(`🗄️ Всего объявлений в базе: ${allListings.length}`);
            const avitoListings = allListings.filter(l => l.source === 'avito');
            console.log(`🟡 Avito объявлений в базе: ${avitoListings.length}`);
            
            if (avitoListings.length > 0) {
                console.log(`📋 Первые 5 Avito external_id в базе:`, avitoListings.slice(0, 5).map(l => `"${l.external_id}" (${typeof l.external_id})`));
            }
        } catch (error) {
            console.log(`⚠️ Не удалось получить отладочную информацию о базе:`, error);
        }
        
        return newLinks;
    }

    /**
     * Получает все объявления из базы данных для отладки
     */
    async getAllListingsForDebug() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getAllListings'
            });
            
            if (response && response.success) {
                return response.listings || [];
            } else {
                console.log('Не удалось получить объявления для отладки');
                return [];
            }
        } catch (error) {
            console.error('Ошибка получения объявлений для отладки:', error);
            return [];
        }
    }

    /**
     * Проверяет существование объявления в базе данных
     */
    async checkListingExists(source, externalId) {
        try {
            // Отправляем запрос в background script для проверки базы данных
            const response = await chrome.runtime.sendMessage({
                action: 'checkListingExists',
                source: source,
                externalId: externalId
            });
            
            const exists = response && response.success && response.exists;
            return exists;
            
        } catch (error) {
            console.error('Ошибка проверки существования объявления:', error);
            return false; // В случае ошибки считаем объявление новым
        }
    }

    /**
     * Массовый парсинг объявлений по фильтру
     */
    async parseMassByFilter(areaId) {
        console.log('🚀 Начинаем массовый парсинг по фильтру для области:', areaId);
        
        try {
            // Ждем загрузки страницы
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Проверяем, что мы на странице фильтра (список объявлений)
            const isCatalogPage = window.location.href.includes('/kvartiry/') && 
                                  !window.location.href.match(/\/kvartiry\/.*_\d+/);
            
            if (!isCatalogPage) {
                throw new Error('Не на странице каталога объявлений');
            }

            // Получаем список ссылок на объявления с проверкой изменений цен
            const listingData = await this.extractListingLinksWithPriceCheck();
            const { allLinks, priorityLinks } = listingData;
            
            console.log(`📋 Найдено ${allLinks.length} объявлений для парсинга`);
            console.log(`💱 Из них ${priorityLinks.length} с изменившимися ценами`);
            
            if (allLinks.length === 0) {
                return { parsed: 0, errors: 1 };
            }

            // Приоритизируем объявления с изменившимися ценами
            const linksToProcess = [
                ...priorityLinks, // Сначала объявления с изменившимися ценами
                ...allLinks.filter(link => !priorityLinks.includes(link)) // Затем остальные
            ];

            // Ограничиваем количество для тестирования (можно убрать)
            const maxListings = Math.min(linksToProcess.length, 10);
            const finalLinksToProcess = linksToProcess.slice(0, maxListings);
            
            let parsed = 0;
            let errors = 0;

            // Парсим каждое объявление
            for (const [index, link] of finalLinksToProcess.entries()) {
                const isPriority = priorityLinks.includes(link);
                const statusPrefix = isPriority ? '💱 [ЦЕНА ИЗМЕНЕНА]' : '📄';
                try {
                    console.log(`${statusPrefix} Парсинг объявления ${index + 1}/${finalLinksToProcess.length}: ${link}`);
                    
                    // Открываем объявление в новой вкладке через background script
                    const result = await chrome.runtime.sendMessage({
                        action: 'openTabAndParse',
                        url: link
                    });

                    if (result && result.success) {
                        parsed++;
                        console.log(`✅ Объявление спарсено успешно`);
                    } else {
                        errors++;
                        console.log(`❌ Ошибка парсинга: ${result?.error}`);
                    }
                    
                    // Пауза между запросами
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    console.error(`❌ Ошибка обработки ссылки ${link}:`, error);
                    errors++;
                }
            }

            console.log(`📊 Массовый парсинг завершен. Успешно: ${parsed}, ошибок: ${errors}`);
            return { parsed, errors };

        } catch (error) {
            console.error('❌ Ошибка массового парсинга:', error);
            return { parsed: 0, errors: 1 };
        }
    }

    /**
     * Извлечение ссылок на объявления со страницы каталога
     */
    extractListingLinks() {
        const links = [];
        
        // Селекторы для ссылок на объявления на Avito
        const selectors = [
            'a[href*="/kvartiry/"][href*="_"]',
            '[data-marker="item"] a[href*="/kvartiry/"]',
            '.iva-item-titleStep-pdebR a',
            '.iva-item-title a'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            
            for (const element of elements) {
                const href = element.href;
                
                // Проверяем, что это ссылка на объявление квартиры
                if (href && 
                    href.includes('/kvartiry/') && 
                    href.match(/\/kvartiry\/.*_\d+/) &&
                    !links.includes(href)) {
                    
                    links.push(href);
                }
            }
        }

        // Убираем дубли и возвращаем уникальные ссылки
        return [...new Set(links)];
    }

    /**
     * Извлечение цены из элемента списка объявлений
     */
    extractPriceFromListingElement(listingElement) {
        try {
            // Селекторы для цены в элементе списка (на основе предоставленного HTML)
            const priceSelectors = [
                '[data-marker="item-price"] meta[itemprop="price"]', // Метатег с ценой
                '[data-marker="item-price"] [itemprop="price"]',    // Элемент с itemprop="price"
                '[data-marker="item-price"]',                       // Прямой маркер цены
                '.price-root-tm5ut .price-price-ZMrtW',             // Из структуры HTML
                '.price-priceContent-I4I3p strong span',           // Текст цены
                '[class*="price"] strong',                          // Общий селектор цены
                '[class*="Price"] strong'                           // Вариант с заглавной буквы
            ];

            for (const selector of priceSelectors) {
                const priceElement = listingElement.querySelector(selector);
                if (priceElement) {
                    let priceText = '';
                    
                    // Если это метатег, берем content
                    if (priceElement.tagName === 'META') {
                        priceText = priceElement.getAttribute('content');
                    } else {
                        priceText = priceElement.textContent || priceElement.innerText || '';
                    }
                    
                    // Очищаем и парсим цену
                    const cleanPrice = priceText.replace(/[^\d]/g, '');
                    if (cleanPrice) {
                        const price = parseInt(cleanPrice);
                        if (price > 0) {
                            this.debugLog(`💰 Найдена цена в списке: ${price} (селектор: ${selector})`);
                            return price;
                        }
                    }
                }
            }

            this.debugLog('⚠️ Цена в элементе списка не найдена');
            return null;

        } catch (error) {
            this.debugLog('❌ Ошибка извлечения цены из элемента списка:', error);
            return null;
        }
    }

    /**
     * Извлечение external_id из ссылки в элементе списка
     */
    extractExternalIdFromLink(listingElement) {
        try {
            const linkElement = listingElement.querySelector('a[href*="/kvartiry/"][href*="_"]');
            if (!linkElement) {
                this.debugLog('⚠️ Ссылка на объявление не найдена в элементе списка');
                return null;
            }

            const href = linkElement.href;
            const patterns = [
                /\/kvartiry\/.*_(\d+)(?:\?|#|$)/,  // Полный паттерн
                /_(\d+)(?:\?|#|$)/,                // ID перед параметрами
                /\/(\d{8,})(?:\?|#|$)/             // Для длинных ID
            ];

            for (const pattern of patterns) {
                const match = href.match(pattern);
                if (match && match[1]) {
                    const externalId = String(match[1]);
                    this.debugLog(`🆔 Найден external_id в ссылке: ${externalId}`);
                    return externalId;
                }
            }

            this.debugLog('⚠️ External ID не найден в ссылке');
            return null;

        } catch (error) {
            this.debugLog('❌ Ошибка извлечения external_id из ссылки:', error);
            return null;
        }
    }

    /**
     * Проверка изменения цены объявления в списке
     */
    async checkPriceChangeInListing(listingElement) {
        try {
            // Извлекаем external_id и текущую цену
            const externalId = this.extractExternalIdFromLink(listingElement);
            const currentPrice = this.extractPriceFromListingElement(listingElement);

            if (!externalId || !currentPrice) {
                this.debugLog('⚠️ Не удалось извлечь ID или цену для проверки изменений');
                return false;
            }

            // Проверяем существующее объявление в базе данных
            const result = await chrome.runtime.sendMessage({
                action: 'checkListingExists',
                source: 'avito',
                externalId: externalId
            });

            if (result && result.success && result.exists) {
                // Получаем полные данные объявления для сравнения цены
                const allListingsResult = await chrome.runtime.sendMessage({
                    action: 'getAllListings'
                });

                if (allListingsResult && allListingsResult.success) {
                    const existingListing = allListingsResult.listings.find(
                        l => l.source === 'avito' && l.external_id === externalId
                    );

                    if (existingListing && existingListing.price !== currentPrice) {
                        this.debugLog(`💱 Обнаружено изменение цены для ID ${externalId}: ${existingListing.price} → ${currentPrice}`);
                        return true; // Цена изменилась, нужно перепарсить
                    } else {
                        this.debugLog(`✅ Цена для ID ${externalId} не изменилась: ${currentPrice}`);
                        return false; // Цена не изменилась
                    }
                } else {
                    this.debugLog('⚠️ Не удалось получить данные объявлений для сравнения цен');
                    return false;
                }
            } else {
                this.debugLog(`🆕 Объявление ID ${externalId} новое, будет спарсено`);
                return false; // Новое объявление, не считается изменением цены
            }

        } catch (error) {
            this.debugLog('❌ Ошибка проверки изменения цены:', error);
            return false;
        }
    }

    /**
     * Расширенное извлечение ссылок с проверкой изменений цен
     */
    async extractListingLinksWithPriceCheck() {
        const links = [];
        const linksNeedingUpdate = []; // Объявления с изменившимися ценами
        
        // Селекторы для элементов объявлений (контейнеры, а не ссылки)
        const listingSelectors = [
            '[data-marker="item"]',                     // Основной маркер элемента
            '.styles-snippet-ZgKUd',                    // Из предоставленного HTML
            '.iva-item-root',                           // Альтернативные селекторы
            '[class*="snippet"]',
            '[class*="item-root"]'
        ];

        for (const selector of listingSelectors) {
            const listingElements = document.querySelectorAll(selector);
            this.debugLog(`📋 Найдено ${listingElements.length} элементов по селектору: ${selector}`);
            
            for (const listingElement of listingElements) {
                try {
                    // Находим ссылку на объявление внутри элемента
                    const linkElement = listingElement.querySelector('a[href*="/kvartiry/"][href*="_"]');
                    if (!linkElement) continue;

                    const href = linkElement.href;
                    
                    // Проверяем, что это валидная ссылка на объявление
                    if (href && 
                        href.includes('/kvartiry/') && 
                        href.match(/\/kvartiry\/.*_\d+/) &&
                        !links.includes(href)) {
                        
                        // Проверяем изменение цены
                        const priceChanged = await this.checkPriceChangeInListing(listingElement);
                        
                        if (priceChanged) {
                            this.debugLog(`💱 Добавляем в приоритетный список (изменена цена): ${href}`);
                            linksNeedingUpdate.push(href);
                        }
                        
                        links.push(href);
                    }
                } catch (error) {
                    this.debugLog('❌ Ошибка обработки элемента объявления:', error);
                }
            }
            
            // Если нашли элементы по этому селектору, не продолжаем поиск по другим
            if (listingElements.length > 0) {
                break;
            }
        }

        this.debugLog(`📊 Найдено объявлений: ${links.length}, с изменениями цен: ${linksNeedingUpdate.length}`);
        
        return {
            allLinks: [...new Set(links)],
            priorityLinks: [...new Set(linksNeedingUpdate)]
        };
    }

    /**
     * Инициализация отслеживания изменений цен при скроллинге
     */
    initScrollPriceTracking() {
        try {
            // Проверяем, что мы на странице каталога
            const isCatalogPage = window.location.href.includes('/kvartiry/') && 
                                  !window.location.href.match(/\/kvartiry\/.*_\d+/);
            
            if (!isCatalogPage) {
                this.debugLog('📍 Не на странице каталога, отслеживание цен отключено');
                return;
            }

            this.debugLog('👀 Инициализация отслеживания изменений цен при скроллинге');

            // Наблюдатель за появлением новых элементов объявлений
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Проверяем, добавились ли новые элементы объявлений
                            const newListings = node.querySelectorAll ? 
                                node.querySelectorAll('[data-marker="item"], .styles-snippet-ZgKUd, [class*="snippet"]') : 
                                [];
                            
                            if (newListings.length > 0) {
                                this.debugLog(`📋 Обнаружены новые объявления при скроллинге: ${newListings.length}`);
                                this.checkNewListingsForPriceChanges(newListings);
                            }
                        }
                    });
                });
            });

            // Наблюдаем за изменениями в контейнере объявлений
            const listingContainer = document.querySelector('[data-marker="catalog-serp"]') || 
                                   document.querySelector('.items-items') || 
                                   document.querySelector('.catalog-serp') ||
                                   document.body;

            if (listingContainer) {
                observer.observe(listingContainer, {
                    childList: true,
                    subtree: true
                });
                this.debugLog('✅ Наблюдатель за скроллингом установлен');
            } else {
                this.debugLog('⚠️ Контейнер объявлений не найден');
            }

            // Также проверяем существующие объявления при инициализации
            setTimeout(() => {
                this.checkExistingListingsForPriceChanges();
            }, 2000);

        } catch (error) {
            this.debugLog('❌ Ошибка инициализации отслеживания цен:', error);
        }
    }

    /**
     * Проверка новых объявлений на изменения цен
     */
    async checkNewListingsForPriceChanges(listingElements) {
        try {
            this.debugLog(`🔍 Проверка ${listingElements.length} новых объявлений на изменения цен`);
            
            for (const listingElement of listingElements) {
                const priceChanged = await this.checkPriceChangeInListing(listingElement);
                
                if (priceChanged) {
                    // Получаем ссылку на объявление
                    const linkElement = listingElement.querySelector('a[href*="/kvartiry/"][href*="_"]');
                    if (linkElement) {
                        const href = linkElement.href;
                        this.debugLog(`💱 НАЙДЕНО ИЗМЕНЕНИЕ ЦЕНЫ! Добавляем в очередь на перепарсинг: ${href}`);
                        
                        // Добавляем визуальную метку
                        this.markListingAsChanged(listingElement);
                        
                        // Можно добавить в очередь на автоматический перепарсинг
                        this.queueListingForReparse(href);
                    }
                }
            }
        } catch (error) {
            this.debugLog('❌ Ошибка проверки новых объявлений:', error);
        }
    }

    /**
     * Проверка существующих объявлений на изменения цен
     */
    async checkExistingListingsForPriceChanges() {
        try {
            const existingListings = document.querySelectorAll('[data-marker="item"], .styles-snippet-ZgKUd, [class*="snippet"]');
            if (existingListings.length > 0) {
                this.debugLog(`🔍 Проверка ${existingListings.length} существующих объявлений на изменения цен`);
                await this.checkNewListingsForPriceChanges(existingListings);
            }
        } catch (error) {
            this.debugLog('❌ Ошибка проверки существующих объявлений:', error);
        }
    }

    /**
     * Визуальная метка объявления с изменившейся ценой
     */
    markListingAsChanged(listingElement) {
        try {
            // Добавляем яркую рамку и иконку
            listingElement.style.border = '3px solid #ff6b35';
            listingElement.style.boxShadow = '0 0 10px rgba(255, 107, 53, 0.5)';
            listingElement.style.position = 'relative';
            
            // Добавляем значок изменения цены
            const badge = document.createElement('div');
            badge.innerHTML = '💱 ЦЕНА ИЗМЕНЕНА';
            badge.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                background: #ff6b35;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                z-index: 1000;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            `;
            
            listingElement.appendChild(badge);
            
            this.debugLog('✅ Добавлена визуальная метка изменения цены');
        } catch (error) {
            this.debugLog('❌ Ошибка добавления визуальной метки:', error);
        }
    }

    /**
     * Добавление объявления в очередь на перепарсинг
     */
    queueListingForReparse(href) {
        try {
            // Инициализируем очередь, если её нет
            if (!window.priceChangeQueue) {
                window.priceChangeQueue = [];
            }
            
            // Добавляем в очередь, если ещё нет
            if (!window.priceChangeQueue.includes(href)) {
                window.priceChangeQueue.push(href);
                this.debugLog(`📋 Добавлено в очередь перепарсинга: ${href}`);
                this.debugLog(`📊 Размер очереди: ${window.priceChangeQueue.length}`);
            }
        } catch (error) {
            this.debugLog('❌ Ошибка добавления в очередь:', error);
        }
    }

}


/**
 * ИСПРАВЛЕННАЯ ИНИЦИАЛИЗАЦИЯ AVITO PARSER
 * Заменить код в конце файла avito-parser.js
 */

// Функция для надежной инициализации парсера
function initializeAvitoParser() {
    console.log('🚀 Начинаем инициализацию AvitoParser...');
    console.log('Current URL:', window.location.href);
    console.log('Current hostname:', window.location.hostname);

    try {
        // Проверяем, что мы на правильном сайте
        if (!window.location.hostname.includes('avito.ru')) {
            console.log('❌ Неподходящий сайт, парсер не инициализирован');
            return false;
        }

        // Проверяем, не создан ли уже экземпляр
        if (window.avitoParserInstance) {
            console.log('✅ AvitoParser уже инициализирован');
            return true;
        }

        // Создаем экземпляр парсера
        const parser = new AvitoParser();
        console.log('✅ AvitoParser создан успешно');
        console.log('✅ isListingPage:', parser.isListingPage);

        // Делаем парсер доступным глобально
        window.avitoParser = parser;
        window.avitoParserInstance = parser;
        window.AvitoParser = AvitoParser;

        console.log('✅ AvitoParser полностью инициализирован');
        return true;

    } catch (error) {
        console.error('❌ Ошибка создания AvitoParser:', error);
        return false;
    }
}

// Инициализируем парсер при загрузке
if (window.location.hostname.includes('avito.ru')) {
    // Пробуем инициализировать сразу
    if (!initializeAvitoParser()) {
        // Если не получилось, пробуем через небольшую задержку
        setTimeout(() => {
            initializeAvitoParser();
        }, 500);
    }
}

// Дополнительная инициализация для страниц с объявлениями
if (typeof window !== 'undefined' && window.location.href.includes('avito.ru')) {
    // Обеспечиваем глобальную доступность класса
    window.AvitoParser = AvitoParser;

    // Автоматически создаем экземпляр для страниц объявлений
    if (window.location.href.includes('/kvartiry/') || window.location.href.includes('/komnaty/')) {
        console.log('🎯 Обнаружена страница с объявлениями');

        // Задержка для полной загрузки DOM
        setTimeout(() => {
            if (!window.avitoParserInstance) {
                console.log('🔄 Повторная попытка инициализации...');
                initializeAvitoParser();
            }
        }, 1000);

        // Еще одна попытка через большую задержку
        setTimeout(() => {
            if (!window.avitoParserInstance) {
                console.log('🔄 Финальная попытка инициализации...');
                initializeAvitoParser();
            }
        }, 3000);
    }
}

} // Закрываем проверку typeof AvitoParser

// Простой и надежный обработчик сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 GLOBAL: Получено сообщение:', request);
    
    if (request.action === 'ping') {
        console.log('🏓 AvitoParser: Получен ping, отвечаем pong');
        sendResponse({ success: true, message: 'pong' });
        return;
    }
    
    if (request.action === 'parseCurrentListing') {
        console.log('🎯 GLOBAL: Processing parseCurrentListing');
        
        // Проверяем, что это страница объявления
        const url = window.location.href;
        const isListingPage = url.includes('/kvartiry/') && 
                            url.match(/\/kvartiry\/.*_\d+/) && 
                            !url.includes('/list/');
        
        if (!isListingPage) {
            console.log('❌ GLOBAL: Неподходящая страница для парсинга');
            sendResponse({ success: false, error: 'Неподходящая страница для парсинга' });
            return;
        }
        
        // Создаем парсер и выполняем парсинг
        try {
            const parser = new AvitoParser();
            console.log('✅ GLOBAL: Парсер создан');
            
            parser.parseCurrentListing()
                .then(data => {
                    console.log('📊 GLOBAL: Parsed data:', data);
                    if (data) {
                        sendResponse({ success: true, data: data });
                    } else {
                        sendResponse({ success: false, error: 'Не удалось извлечь данные объявления' });
                    }
                })
                .catch(error => {
                    console.error('❌ GLOBAL: Error in parseCurrentListing:', error);
                    sendResponse({ success: false, error: error.message || 'Ошибка парсинга' });
                });
                
            return true; // Асинхронный ответ
            
        } catch (error) {
            console.error('❌ GLOBAL: Ошибка создания парсера:', error);
            sendResponse({ success: false, error: 'Ошибка создания парсера: ' + error.message });
            return;
        }
    } else if (request.action === 'parseMassByFilter') {
        console.log('🎯 GLOBAL: Processing parseMassByFilter');
        
        // Проверяем, что это страница со списком объявлений
        const url = window.location.href;
        const isFilterPage = url.includes('/kvartiry') && 
                            (url.includes('?') || url.includes('#')) && 
                            !url.match(/\/kvartiry\/.*_\d+/); // Не страница конкретного объявления
        
        if (!isFilterPage) {
            console.log('❌ GLOBAL: Неподходящая страница для массового парсинга');
            sendResponse({ success: false, error: 'Неподходящая страница для массового парсинга' });
            return;
        }
        
        // Создаем парсер и запускаем массовый парсинг с полным интерфейсом
        try {
            const parser = new AvitoParser();
            console.log('✅ GLOBAL: Парсер создан для массового парсинга');
            
            // Используем правильный метод startMassParsing с настройками
            const settings = {
                areaId: request.areaId,
                areaName: request.areaName || 'Неизвестная область',
                maxPages: 10,
                delay: 2000,
                listingsContainer: '.styles-container-rnTvX',
                listingSelector: '.styles-snippet-ZgKUd',
                linkSelector: 'a[href*="/kvartiry/"]'
            };
            
            parser.startMassParsing(settings)
                .then(result => {
                    console.log('📊 GLOBAL: Mass parsing result:', result);
                    sendResponse({ success: true, parsed: result.parsed || result.successfullyParsed, errors: result.errors });
                })
                .catch(error => {
                    console.error('❌ GLOBAL: Error in startMassParsing:', error);
                    sendResponse({ success: false, error: error.message || 'Ошибка массового парсинга' });
                });
                
            return true; // Асинхронный ответ
            
        } catch (error) {
            console.error('❌ GLOBAL: Ошибка создания парсера для массового парсинга:', error);
            sendResponse({ success: false, error: 'Ошибка создания парсера: ' + error.message });
            return;
        }
    }
    
    // Обработка других действий
    sendResponse({ success: false, error: 'Неизвестное действие: ' + request.action });
});

// Функции для тестирования в консоли
window.testAvitoParser = function () {
    console.log('🧪 === ТЕСТИРОВАНИЕ AVITO PARSER ===');

    if (!window.avitoParserInstance) {
        console.log('❌ Создаем экземпляр парсера...');
        try {
            window.avitoParserInstance = new AvitoParser();
        } catch (error) {
            console.error('❌ Ошибка создания парсера:', error);
            return null;
        }
    }

    return window.avitoParserInstance.quickDiagnostic();
};

window.parseAvitoListing = async function () {
    // console.log('🎯 === ПОЛНЫЙ ПАРСИНГ ОБЪЯВЛЕНИЯ ===');

    if (!window.avitoParserInstance) {
        try {
            window.avitoParserInstance = new AvitoParser();
        } catch (error) {
            console.error('❌ Ошибка создания парсера:', error);
            return null;
        }
    }

    try {
        const data = await window.avitoParserInstance.parseCurrentListing();
        console.log('📦 Результат парсинга:', data);
        return data;
    } catch (error) {
        console.error('❌ Ошибка парсинга:', error);
        return null;
    }
};

// Функция для проверки готовности страницы
window.checkPageReady = function () {
    if (!window.avitoParserInstance) {
        window.avitoParserInstance = new AvitoParser();
    }
    return window.avitoParserInstance.isPageReady();
};

// console.log('✅ AvitoParser загружен. Доступные команды в консоли:');
// console.log('  - testAvitoParser() // Тест отдельных методов');
// console.log('  - parseAvitoListing() // Полный парсинг объявления (async)');
// console.log('  - checkPageReady() // Проверка готовности страницы');

// console.log('✅ Parser initialization complete');