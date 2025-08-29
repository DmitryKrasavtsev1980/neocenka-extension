/**
 * Сервис обновления объявлений Cian
 * Реализует интерфейс BaseListingUpdateService для работы с объявлениями Cian
 * Переиспользует логику из ParsingManager.updateListings()
 */

console.log('📦 [CianUpdate] Скрипт CianListingUpdateService.js загружен');

class CianListingUpdateService extends BaseListingUpdateService {
    constructor(config = {}) {
        console.log('🏗️ [CianUpdate] Создается экземпляр CianListingUpdateService');
        super(config);
        this.source = 'cian';
        this.supportedSources = ['cian'];
        
        // Ссылки на основные компоненты системы
        this.db = null;
        this.progressManager = null;
        this.parsingManager = null;
        
        // Текущий ID области для парсинга
        this.currentAreaId = null;
        
        this.debugEnabled = false;
    }

    /**
     * Инициализация сервиса
     * @param {Object} dependencies - Зависимости системы
     */
    async initialize(dependencies = {}) {
        try {
            // Получаем доступ к основным компонентам
            this.db = dependencies.db || window.db;
            this.progressManager = dependencies.progressManager || window.progressManager;
            
            if (!this.db) {
                throw new Error('Database не доступна для CianListingUpdateService');
            }

            // Проверяем debug режим
            this.debugEnabled = await this.isDebugEnabled();
            
            // Тестируем связь с background script
            await this.testBackgroundConnection();
            
            this.initialized = true;
        } catch (error) {
            this.handleError(error, 'initialize');
            throw error;
        }
    }

    /**
     * Тест связи с background script
     */
    async testBackgroundConnection() {
        console.log('🔍 [CianUpdate] Тестируем связь с background script...');
        
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.runtime) {
                console.error('❌ [CianUpdate] Chrome extension API недоступен');
                resolve(false);
                return;
            }

            chrome.runtime.sendMessage({
                action: 'checkHealth'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ [CianUpdate] Background script не отвечает:', chrome.runtime.lastError.message);
                    resolve(false);
                    return;
                }
                
                console.log('✅ [CianUpdate] Background script отвечает:', response);
                resolve(true);
            });
        });
    }

    /**
     * Проверка debug режима
     */
    async isDebugEnabled() {
        try {
            if (this.db) {
                const debugSetting = await this.db.get('settings', 'debug_enabled');
                return debugSetting?.value === true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Обновление объявлений по области
     * @param {string|number} areaId - ID области
     * @param {Object} options - Настройки обновления
     * @returns {Promise<Object>} Результат обновления
     */
    async updateListingsByArea(areaId, options = {}) {
        try {
            await this.debugLog('Начинаем обновление объявлений Cian для области:', areaId);
            
            // Устанавливаем текущую область для парсинга
            this.currentAreaId = areaId;
            
            const config = this.prepareConfig(options);
            this.initStats();

            // Получаем область
            const area = await this.db.get('map_areas', areaId);
            if (!area) {
                throw new Error(`Область с ID ${areaId} не найдена`);
            }

            // Получаем объявления для обновления
            const listingsToUpdate = await this.getUpdateableListings(areaId, config.maxAgeDays);
            
            if (listingsToUpdate.length === 0) {
                await this.debugLog('Нет объявлений Cian для обновления в области:', area.name);
                this.finishStats();
                return {
                    success: true,
                    message: 'Нет объявлений для обновления',
                    stats: this.getStats()
                };
            }

            this.stats.total = listingsToUpdate.length;
            this.updateProgress(0, this.stats.total, `Найдено ${this.stats.total} объявлений Cian для обновления`);

            // Обновляем батчами
            let updatedCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < listingsToUpdate.length; i += config.batchSize) {
                const batch = listingsToUpdate.slice(i, i + config.batchSize);
                const batchResults = await this.updateBatch(batch, config);
                
                // Подсчитываем результаты батча
                batchResults.forEach(result => {
                    if (result.success) {
                        updatedCount++;
                        this.stats.updated++;
                    } else {
                        errorCount++;
                        this.stats.failed++;
                    }
                });

                // Обновляем прогресс
                const currentProgress = Math.min(i + config.batchSize, listingsToUpdate.length);
                this.updateProgress(
                    currentProgress, 
                    this.stats.total,
                    `Обновлено: ${updatedCount}, ошибок: ${errorCount}`
                );

                // Пауза между батчами
                if (i + config.batchSize < listingsToUpdate.length) {
                    await this.delay(1000);
                }
            }

            this.finishStats();
            
            if (this.debugEnabled) {
                await this.debugLog(`Завершено обновление объявлений Cian: обновлено ${updatedCount}, ошибок ${errorCount}`);
            }

            return {
                success: true,
                message: `Обновлено ${updatedCount} объявлений Cian из ${listingsToUpdate.length}`,
                stats: this.getStats()
            };

        } catch (error) {
            this.handleError(error, 'updateListingsByArea');
            this.finishStats();
            return {
                success: false,
                message: `Ошибка обновления объявлений Cian: ${error.message}`,
                error: error.message,
                stats: this.getStats()
            };
        }
    }

    /**
     * Обновление конкретного объявления по ID
     * @param {string|number} listingId - ID объявления
     * @param {Object} options - Настройки обновления
     * @returns {Promise<Object>} Результат обновления
     */
    async updateListingById(listingId, options = {}) {
        try {
            await this.debugLog('Обновляем объявление Cian по ID:', listingId);

            // Получаем объявление из базы
            const listing = await this.db.getListing(listingId);
            if (!listing) {
                throw new Error(`Объявление с ID ${listingId} не найдено`);
            }

            // Проверяем, что это объявление Cian
            const source = this.detectSourceFromUrl(listing.url);
            if (source !== 'cian') {
                throw new Error(`Объявление ${listingId} не является объявлением Cian (источник: ${source})`);
            }

            this.initStats();
            this.stats.total = 1;

            // Используем существующую логику из UIManager
            const result = await this.updateSingleListingUsingUIManager(listing);
            
            this.stats.updated = result.success ? 1 : 0;
            this.stats.failed = result.success ? 0 : 1;
            this.finishStats();

            return result;

        } catch (error) {
            this.handleError(error, 'updateListingById');
            return {
                success: false,
                message: `Ошибка обновления объявления: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Получение списка объявлений Cian, требующих обновления
     * @param {string|number} areaId - ID области
     * @param {number} maxAgeDays - Максимальный возраст в днях
     * @returns {Promise<Array>} Массив объявлений для обновления
     */
    async getUpdateableListings(areaId, maxAgeDays = null) {
        try {
            const ageDays = maxAgeDays || this.config.maxAgeDays;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - ageDays);

            // Получаем все объявления в области
            const allListings = await this.getListingsInArea(areaId);
            
            // Фильтруем только объявления Cian, которые нуждаются в обновлении
            const cianListings = allListings.filter(listing => {
                // Проверяем источник
                const source = this.detectSourceFromUrl(listing.url);
                if (source !== 'cian') {
                    return false;
                }

                // Обновляем только активные объявления
                if (listing.status !== 'active') {
                    return false;
                }

                // Проверяем дату последнего обновления
                if (!listing.updated_at) {
                    return true; // Если нет даты обновления, обновляем
                }

                const lastUpdate = new Date(listing.updated_at);
                return lastUpdate < cutoffDate;
            });

            if (this.debugEnabled) {
                await this.debugLog(`Найдено ${cianListings.length} объявлений Cian для обновления из ${allListings.length} всего`);
            }
            
            return cianListings;

        } catch (error) {
            this.handleError(error, 'getUpdateableListings');
            return [];
        }
    }

    /**
     * Получение объявлений в области (использует геопространственный поиск)
     * @param {string|number} areaId - ID области
     * @returns {Promise<Array>} Массив объявлений
     */
    async getListingsInArea(areaId) {
        try {
            if (this.debugEnabled) {
                await this.debugLog(`Поиск объявлений в области ${areaId}`);
            }
            
            // Используем существующий метод БД для геопространственного поиска
            const areaAddresses = await this.db.getAddressesInMapArea(areaId);
            
            if (areaAddresses.length === 0) {
                return [];
            }

            // Получаем все объявления для этих адресов
            const areaListings = [];
            for (const address of areaAddresses) {
                const addressListings = await this.db.getListingsByAddress(address.id);
                areaListings.push(...addressListings);
            }

            if (this.debugEnabled) {
                await this.debugLog(`Найдено ${areaListings.length} объявлений в области через геопоиск`);
            }
            
            return areaListings;

        } catch (error) {
            this.handleError(error, 'getListingsInArea');
            return [];
        }
    }

    /**
     * Обновление батча объявлений
     * @param {Array} batch - Массив объявлений для обновления
     * @param {Object} config - Конфигурация
     * @returns {Promise<Array>} Результаты обновления
     */
    async updateBatch(batch, config) {
        const promises = batch.map(listing => this.updateSingleListing(listing, config));
        const results = await Promise.allSettled(promises.map(p => p.then(r => ({ success: true, result: r })).catch(e => ({ success: false, error: e }))));
        
        return results.map(r => r.value || { success: false, error: r.reason });
    }

    /**
     * Обновление одного объявления через прямой парсинг
     * @param {Object} listing - Объявление для обновления
     * @param {Object} config - Конфигурация
     * @returns {Promise<Object>} Результат обновления
     */
    async updateSingleListing(listing, config) {
        try {
            // Прямое обновление через парсинг URL
            const result = await this.updateListingDirectly(listing);
            return result;
            
        } catch (error) {
            await this.debugLog(`Ошибка обновления объявления ${listing.id}:`, error.message);
            throw error;
        }
    }

    /**
     * Прямое обновление объявления через создание вкладки и парсинг
     * @param {Object} listing - Объявление для обновления
     * @returns {Promise<Object>} Результат обновления
     */
    async updateListingDirectly(listing) {
        let tab = null;
        try {
            // Создаем вкладку для парсинга (как в UIManager)
            tab = await this.createTabWithRetry(listing.url, 2);
            
            // Ждем загрузки страницы и инжектируем content script
            await this.waitForPageLoad(tab.id);
            await this.injectContentScript(tab.id, listing.url);
            
            // Запрашиваем обновленные данные объявления
            const response = await this.waitForContentScriptAndParse(tab.id, {
                action: 'parseCurrentListing',
                areaId: this.currentAreaId || null,
                existingListingId: listing.id
            });
            
            if (response && response.success && response.data) {
                // Полная обработка результатов парсинга (как в UIManager)
                await this.processParsingResults(listing, response.data);
                
                return {
                    success: true,
                    listingId: listing.id,
                    message: 'Объявление успешно обновлено через прямой парсинг',
                    data: response.data
                };
            } else {
                throw new Error(response?.error || 'Парсинг не вернул данные');
            }

        } catch (error) {
            return {
                success: false,
                listingId: listing.id,
                error: error.message,
                message: `Ошибка обновления объявления: ${error.message}`
            };
        } finally {
            // Закрываем вкладку в любом случае
            if (tab && tab.id) {
                try {
                    await chrome.tabs.remove(tab.id);
                } catch (closeError) {
                    // Игнорируем ошибки закрытия
                }
            }
        }
    }

    /**
     * Обработка результатов парсинга (полная копия логики из UIManager)
     */
    async processParsingResults(listing, responseData) {
        try {
            // Парсим дату обновления из строки типа "Обновлено: 31 июл, 09:01"
            let updatedDate = new Date();
            if (responseData.updated_date) {
                try {
                    // Извлекаем дату из строки "Обновлено: 31 июл, 09:01"
                    const dateMatch = responseData.updated_date.match(/(\d{1,2})\s+(янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек),?\s+(\d{1,2}):(\d{2})/i);
                    if (dateMatch) {
                        const day = parseInt(dateMatch[1]);
                        const monthName = dateMatch[2];
                        const hours = parseInt(dateMatch[3]);
                        const minutes = parseInt(dateMatch[4]);
                        
                        const monthMap = {
                            'янв': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'мая': 4, 'май': 4, 'июн': 5,
                            'июл': 6, 'авг': 7, 'сен': 8, 'окт': 9, 'ноя': 10, 'дек': 11
                        };
                        
                        const currentDate = new Date();
                        const currentYear = currentDate.getFullYear();
                        const month = monthMap[monthName.toLowerCase()];
                        
                        if (month !== undefined) {
                            // Создаем дату с текущим годом
                            updatedDate = new Date(currentYear, month, day, hours, minutes);
                            
                            // Если получившаяся дата больше текущей - значит это прошлый год
                            if (updatedDate > currentDate) {
                                updatedDate = new Date(currentYear - 1, month, day, hours, minutes);
                            }
                        }
                    }
                } catch (dateError) {
                    // Игнорируем ошибки парсинга даты
                }
            }
            
            // Создаем обновленное объявление, изменяя только необходимые поля
            const updatedListing = {
                ...listing, // Сохраняем все существующие данные
                updated_at: new Date() // Системная дата обновления
            };
            
            // Обрабатываем историю цен - сохраняем существующую
            let priceHistory = listing.price_history || [];
            
            // Если история пустая, создаем базовую запись с датой создания
            if (priceHistory.length === 0 && listing.created) {
                priceHistory = [{
                    date: listing.created,
                    price: listing.price,
                    source: 'initial'
                }];
            }
            
            // Обрабатываем архивный статус
            const isArchived = responseData.status === 'archived';
            if (isArchived) {
                updatedListing.status = 'archived';
                // Для архивных объявлений устанавливаем дату закрытия с сайта (только если есть)
                if (responseData.updated_date) {
                    updatedListing.updated = updatedDate; // Дата закрытия с сайта
                    updatedListing.last_seen = updatedDate;
                }
            } else {
                // Для активных объявлений ВСЕГДА ставим текущую дату парсинга
                updatedListing.updated = new Date();
                updatedListing.status = 'active';
            }
            
            // Проверяем изменение цены в любом случае
            const priceChanged = listing.price !== responseData.price;
            
            // 1. Если из парсинга пришла история цен - объединяем с существующей
            if (responseData.price_history && responseData.price_history.length > 0) {
                const newHistory = responseData.price_history.map(entry => ({
                    date: entry.date,
                    price: entry.price
                }));
                
                // Объединяем с существующей историей, избегая дублей
                const filteredExistingHistory = priceHistory.filter(entry => entry.price && entry.price > 0);
                const combinedHistory = [...filteredExistingHistory];
                for (const newEntry of newHistory) {
                    // Добавляем только записи с валидным полем price
                    if (newEntry.price && newEntry.price > 0) {
                        const exists = combinedHistory.some(existing => 
                            existing.date === newEntry.date && existing.price === newEntry.price
                        );
                        if (!exists) {
                            combinedHistory.push(newEntry);
                        }
                    }
                }
                
                // Сортируем по дате и обновляем историю
                priceHistory = combinedHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                // Берем последнюю цену из истории
                const sortedByDateDesc = priceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
                updatedListing.price = sortedByDateDesc[0].price;
                
            } else {
                // 2. Если истории нет, но цена изменилась
                if (priceChanged) {
                    updatedListing.price = responseData.price;
                    
                    // Определяем дату для записи
                    const dateForEntry = isArchived ? updatedDate : new Date();
                    
                    // Добавляем новую запись в историю
                    priceHistory = [...priceHistory];
                    priceHistory.push({
                        date: dateForEntry.toISOString(),
                        price: responseData.price
                    });
                    priceHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
                }
            }
            
            updatedListing.price_history = priceHistory;
            
            // Сохраняем в базу данных
            await this.db.update('listings', updatedListing);
            
            // Обновляем связанный объект недвижимости (как в UIManager)
            if (typeof window !== 'undefined' && window.realEstateObjectManager && updatedListing.object_id) {
                try {
                    await window.realEstateObjectManager.updateObjectOnListingChange(
                        listing.id, 
                        listing, 
                        updatedListing
                    );
                    await this.debugLog('✅ CianUpdate: Связанный объект недвижимости обновлен');
                } catch (error) {
                    await this.debugLog('❌ CianUpdate: Ошибка обновления объекта недвижимости:', error.message);
                }
            }
            
        } catch (error) {
            throw new Error(`Ошибка обработки результатов парсинга: ${error.message}`);
        }
    }

    /**
     * Создание вкладки с повторными попытками (из UIManager)
     */
    async createTabWithRetry(url, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await new Promise((resolve, reject) => {
                    chrome.tabs.create({ url: url, active: false }, (newTab) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(newTab);
                        }
                    });
                });
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                await this.delay(1000 * attempt);
            }
        }
    }

    /**
     * Ожидание загрузки страницы (из UIManager)
     */
    async waitForPageLoad(tabId) {
        return new Promise((resolve) => {
            const checkPageLoad = () => {
                chrome.tabs.get(tabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        resolve();
                        return;
                    }
                    
                    if (tab.status === 'complete') {
                        setTimeout(resolve, 2000); // Дополнительная задержка после загрузки
                    } else {
                        setTimeout(checkPageLoad, 500);
                    }
                });
            };
            
            checkPageLoad();
        });
    }

    /**
     * Инжекция content script (из UIManager)
     */
    async injectContentScript(tabId, listingUrl) {
        try {
            // Определяем какой парсер использовать
            const isCian = listingUrl.includes('cian.ru');
            
            if (!isCian) {
                throw new Error(`Неподдерживаемый сайт для CianListingUpdateService: ${listingUrl}`);
            }
            
            // Инжектируем зависимости
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['data/database.js', 'utils/error-reporter.js']
            });
            
            // Инжектируем Cian парсер
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content-scripts/cian-parser.js']
            });
            
            // Дополнительная задержка для инициализации Cian
            await new Promise(resolve => setTimeout(resolve, 5000));
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Ожидание content script и парсинг (из UIManager)
     */
    async waitForContentScriptAndParse(tabId, settings) {
        const maxAttempts = 15;
        const attemptDelay = 3000;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Сначала проверяем готовность простым ping
                try {
                    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
                } catch (pingError) {
                    // Если не отвечает на ping, ждем больше
                    if (attempt < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, attemptDelay));
                        continue;
                    }
                }
                
                // Теперь пытаемся отправить основное сообщение
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'parseCurrentListing',
                    areaId: settings.areaId,
                    existingListingId: settings.existingListingId
                });
                
                return response;
                
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw new Error(`Content script не отвечает после ${maxAttempts} попыток: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, attemptDelay));
            }
        }
    }


    /**
     * Задержка выполнения
     * @param {number} ms - Миллисекунды задержки
     * @returns {Promise} Promise с задержкой
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Проверка доступности сервиса Cian
     * @returns {Promise<boolean>} Доступность сервиса
     */
    async isServiceAvailable() {
        try {
            // Проверяем доступность Chrome extension API и базы данных
            return !!(this.db && typeof chrome !== 'undefined' && chrome.runtime);
        } catch (error) {
            return false;
        }
    }

    /**
     * Получение поддерживаемых источников
     * @returns {Array<string>} Массив поддерживаемых источников
     */
    getSupportedSources() {
        return this.supportedSources;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CianListingUpdateService;
} else {
    window.CianListingUpdateService = CianListingUpdateService;
}