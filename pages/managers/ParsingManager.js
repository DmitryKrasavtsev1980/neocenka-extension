/**
 * Менеджер парсинга данных
 * Управляет парсингом объявлений с Avito и Cian
 */

class ParsingManager {
    constructor(dataState, eventBus, progressManager) {
        this.dataState = dataState;
        this.eventBus = eventBus;
        this.progressManager = progressManager;
        
        // Настройки парсинга
        this.settings = {
            maxPages: 10,
            delay: 2000,
            batchSize: 5,
            updateIntervalDays: 7,
            maxRetries: 3
        };
        
        // Состояние парсинга
        this.parsing = {
            isActive: false,
            isUpdating: false,
            currentOperation: null,
            totalProgress: 0
        };
        
        // Привязываем события
        this.bindEvents();
    }
    
    /**
     * Привязка событий
     */
    bindEvents() {
        if (this.eventBus) {
            this.eventBus.on(CONSTANTS.EVENTS.AREA_CHANGED, async (area) => {
                await this.onAreaChanged(area);
            });
        }
        
        // Привязка к кнопкам
        document.getElementById('parseListingsBtn')?.addEventListener('click', () => {
            this.parseListings();
        });
        
        document.getElementById('updateListingsBtn')?.addEventListener('click', () => {
            this.updateListings();
        });
    }
    
    /**
     * Обработка изменения области
     */
    async onAreaChanged(area) {
        if (this.parsing.isActive) {
            await Helpers.debugLog('🔄 Остановка парсинга из-за изменения области');
            await this.stopParsing();
        }
    }
    
    /**
     * Основная функция парсинга объявлений
     */
    async parseListings() {
        if (this.parsing.isActive) {
            this.progressManager.showInfo('Парсинг уже выполняется');
            return;
        }
        
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            this.progressManager.showError('Область не выбрана');
            return;
        }
        
        if (!currentArea.avito_filter_url && !currentArea.cian_filter_url) {
            this.progressManager.showError('Не указаны URL фильтров для парсинга');
            return;
        }
        
        try {
            this.parsing.isActive = true;
            this.parsing.currentOperation = 'parsing';
            this.dataState.setState('processing', { 
                ...this.dataState.getState('processing'), 
                parsing: true 
            });
            
            await Helpers.debugLog('📊 Начинаем парсинг объявлений для области:', currentArea.name);
            
            // Уведомляем о начале парсинга
            this.eventBus.emit(CONSTANTS.EVENTS.PARSING_STARTED, {
                area: currentArea,
                timestamp: new Date()
            });
            
            this.progressManager.updateProgressBar('parsing', 0, 'Начало парсинга...');
            
            let totalParsed = 0;
            let totalErrors = 0;
            
            // Парсинг Avito если есть URL
            if (currentArea.avito_filter_url) {
                this.progressManager.updateProgressBar('parsing', 20, 'Парсинг Avito...');
                await Helpers.debugLog('🚀 Начинаем парсинг Avito для области');
                
                try {
                    const avitoResult = await this.parseAvitoForArea(currentArea);
                    await Helpers.debugLog('✅ Парсинг Avito завершен:', avitoResult);
                    
                    totalParsed += avitoResult.parsed;
                    totalErrors += avitoResult.errors;
                    
                    this.progressManager.updateProgressBar('parsing', 50, 'Парсинг Avito завершен');
                    
                    // Уведомляем о прогрессе
                    this.eventBus.emit(CONSTANTS.EVENTS.PARSING_PROGRESS, {
                        source: 'avito',
                        parsed: avitoResult.parsed,
                        errors: avitoResult.errors,
                        progress: 50
                    });
                    
                } catch (error) {
                    await Helpers.debugLog('❌ Ошибка парсинга Avito:', error);
                    console.error('Ошибка парсинга Avito:', error);
                    totalErrors++;
                    
                    this.eventBus.emit(CONSTANTS.EVENTS.PARSING_ERROR, {
                        source: 'avito',
                        error: error.message
                    });
                }
            }
            
            // Парсинг Cian если есть URL
            if (currentArea.cian_filter_url) {
                this.progressManager.updateProgressBar('parsing', 60, 'Парсинг Cian...');
                await Helpers.debugLog('🚀 Начинаем парсинг Cian для области');
                
                try {
                    const cianResult = await this.parseCianForArea(currentArea);
                    await Helpers.debugLog('✅ Парсинг Cian завершен:', cianResult);
                    
                    totalParsed += cianResult.parsed;
                    totalErrors += cianResult.errors;
                    
                    this.progressManager.updateProgressBar('parsing', 90, 'Парсинг Cian завершен');
                    
                    // Уведомляем о прогрессе
                    this.eventBus.emit(CONSTANTS.EVENTS.PARSING_PROGRESS, {
                        source: 'cian',
                        parsed: cianResult.parsed,
                        errors: cianResult.errors,
                        progress: 90
                    });
                    
                } catch (error) {
                    await Helpers.debugLog('❌ Ошибка парсинга Cian:', error);
                    console.error('Ошибка парсинга Cian:', error);
                    totalErrors++;
                    
                    this.eventBus.emit(CONSTANTS.EVENTS.PARSING_ERROR, {
                        source: 'cian',
                        error: error.message
                    });
                }
            }
            
            await Helpers.debugLog('🏁 Завершаем парсинг. Всего обработано:', totalParsed, 'ошибок:', totalErrors);
            this.progressManager.updateProgressBar('parsing', 100, 'Парсинг завершен');
            
            // Уведомляем о завершении парсинга
            this.eventBus.emit(CONSTANTS.EVENTS.PARSING_COMPLETED, {
                area: currentArea,
                totalParsed,
                totalErrors,
                timestamp: new Date()
            });
            
            this.progressManager.showSuccess(`Парсинг завершен. Обработано: ${totalParsed}, ошибок: ${totalErrors}`);
            await Helpers.debugLog('✅ Парсинг полностью завершен');
            
        } catch (error) {
            console.error('Error during parsing:', error);
            this.progressManager.showError('Ошибка парсинга: ' + error.message);
            
            this.eventBus.emit(CONSTANTS.EVENTS.PARSING_ERROR, {
                source: 'general',
                error: error.message
            });
            
        } finally {
            this.parsing.isActive = false;
            this.parsing.currentOperation = null;
            this.dataState.setState('processing', { 
                ...this.dataState.getState('processing'), 
                parsing: false 
            });
            
            // Скрываем прогресс-бар через 2 секунды
            setTimeout(() => {
                this.progressManager.updateProgressBar('parsing', 0, '');
            }, 2000);
        }
    }
    
    /**
     * Парсинг Avito для области
     */
    async parseAvitoForArea(area) {
        try {
            await Helpers.debugLog('Запускаем парсинг Avito для области:', area.name);
            
            return new Promise((resolve) => {
                // Добавляем задержку перед созданием вкладки
                setTimeout(() => {
                    this.createTabWithRetry(area.avito_filter_url, this.settings.maxRetries)
                        .then(async (newTab) => {
                            await Helpers.debugLog('Открыта вкладка Avito:', newTab.id);
                            
                            try {
                                // Ждем загрузки страницы и инжектируем content script
                                await this.waitForPageLoad(newTab.id);
                                await this.injectContentScript(newTab.id);
                                
                                // Запускаем парсинг
                                const response = await this.waitForContentScriptAndParse(newTab.id, {
                                    areaId: area.id,
                                    areaName: area.name,
                                    maxPages: this.settings.maxPages,
                                    delay: this.settings.delay,
                                    avitoFilterUrl: area.avito_filter_url,
                                    listingsContainer: '.styles-container-rnTvX',
                                    listingSelector: '.styles-snippet-ZgKUd',
                                    linkSelector: 'a[href*=\"/kvartiry/\"]'
                                });
                                
                                // НЕ закрываем вкладку для отладки
                                await Helpers.debugLog('Парсинг Avito завершен, вкладка остается открытой для отладки');
                                
                                if (response && response.success) {
                                    resolve({ parsed: response.parsed || 0, errors: response.errors || 0 });
                                } else {
                                    throw new Error(response?.error || 'Ошибка парсинга Avito');
                                }
                                
                            } catch (error) {
                                await Helpers.debugLog('Ошибка парсинга Avito:', error);
                                // НЕ закрываем вкладку в случае ошибки для отладки
                                await Helpers.debugLog('Ошибка парсинга, вкладка остается открытой для отладки');
                                resolve({ parsed: 0, errors: 1 });
                            }
                        })
                        .catch((error) => {
                            Helpers.debugLog('Не удалось создать вкладку:', error);
                            resolve({ parsed: 0, errors: 1 });
                        });
                }, 500); // Задержка 500мс перед созданием вкладки
            });
        } catch (error) {
            console.error('Error parsing Avito:', error);
            return { parsed: 0, errors: 1 };
        }
    }
    
    /**
     * Парсинг Cian для области
     */
    async parseCianForArea(area) {
        try {
            await Helpers.debugLog('Начинаем парсинг Cian по фильтру:', area.cian_filter_url);
            
            // Отправляем сообщение в background script для начала парсинга
            const response = await chrome.runtime.sendMessage({
                action: 'parseMassByFilter',
                source: 'cian',
                filterUrl: area.cian_filter_url,
                areaId: area.id
            });
            
            if (response && response.success) {
                return {
                    parsed: response.parsed || 0,
                    errors: response.errors || 0
                };
            } else {
                throw new Error(response?.error || 'Неизвестная ошибка парсинга Cian');
            }
        } catch (error) {
            console.error('Ошибка парсинга Cian:', error);
            return { parsed: 0, errors: 1 };
        }
    }
    
    /**
     * Обновление существующих объявлений
     */
    async updateListings() {
        if (this.parsing.isUpdating) {
            this.progressManager.showInfo('Обновление уже выполняется');
            return;
        }
        
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            this.progressManager.showError('Область не выбрана');
            return;
        }
        
        try {
            this.parsing.isUpdating = true;
            this.dataState.setState('processing', { 
                ...this.dataState.getState('processing'), 
                updating: true 
            });
            
            await Helpers.debugLog('Начинаем обновление объявлений для области:', currentArea.name);
            this.progressManager.updateProgressBar('updating', 0, 'Поиск объявлений...');
            
            // Получаем настройки обновления
            const settings = await this.getUpdateSettings();
            const updateIntervalDays = settings.update_days || this.settings.updateIntervalDays;
            
            await Helpers.debugLog(`Интервал обновления: ${updateIntervalDays} дней`);
            
            // Получаем все объявления в области
            const allAreaListings = await this.getListingsInArea(currentArea.id);
            
            if (allAreaListings.length === 0) {
                this.progressManager.showInfo('В области нет объявлений для обновления');
                return;
            }
            
            // Фильтруем объявления по статусу и дате последнего обновления
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - updateIntervalDays);
            
            const areaListings = allAreaListings.filter(listing => {
                // Обновляем только активные объявления
                if (listing.status !== 'active') {
                    Helpers.debugLog(`Пропускаем объявление ${listing.id}: статус \"${listing.status}\" (не активное)`);
                    return false;
                }
                
                // Проверяем дату последнего обновления
                if (!listing.updated_at) {
                    return true; // Если нет даты обновления, обновляем
                }
                
                const lastUpdate = new Date(listing.updated_at);
                const needsUpdate = lastUpdate < cutoffDate;
                
                if (!needsUpdate) {
                    Helpers.debugLog(`Пропускаем объявление ${listing.id}: обновлено ${lastUpdate.toLocaleDateString()}`);
                }
                
                return needsUpdate;
            });
            
            if (areaListings.length === 0) {
                const activeListings = allAreaListings.filter(l => l.status === 'active').length;
                this.progressManager.showInfo(`Нет объявлений для обновления. Активных: ${activeListings} из ${allAreaListings.length}, все обновлены в течение ${updateIntervalDays} дней`);
                return;
            }
            
            this.progressManager.updateProgressBar('updating', 10, 
                `Найдено ${areaListings.length} активных объявлений для обновления (из ${allAreaListings.length} всего)`);
            
            let updatedCount = 0;
            let errorCount = 0;
            const batchSize = this.settings.batchSize;
            
            // Разбиваем на батчи для избежания перегрузки
            for (let i = 0; i < areaListings.length; i += batchSize) {
                const batch = areaListings.slice(i, i + batchSize);
                const progress = 10 + ((i / areaListings.length) * 80);
                
                this.progressManager.updateProgressBar('updating', progress, 
                    `Обновляем объявления ${i + 1}-${Math.min(i + batchSize, areaListings.length)} из ${areaListings.length}`);
                
                // Обрабатываем батч
                const batchPromises = batch.map(listing => this.updateSingleListing(listing));
                const batchResults = await Promise.allSettled(batchPromises);
                
                // Подсчитываем результаты
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        updatedCount++;
                    } else {
                        errorCount++;
                        Helpers.debugLog('Ошибка обновления объявления:', result.reason || result.value?.error);
                    }
                });
                
                // Небольшая задержка между батчами
                await Helpers.sleep(1000);
            }
            
            this.progressManager.updateProgressBar('updating', 100, 'Обновление завершено');

            // Инвалидируем весь кеш после массового обновления
            if (window.dataCacheManager && updatedCount > 0) {
                await window.dataCacheManager.invalidate('listings');
                await window.dataCacheManager.invalidate('objects');
            }

            // Уведомляем о завершении обновления
            this.eventBus.emit(CONSTANTS.EVENTS.LISTINGS_UPDATED, {
                area: currentArea,
                totalUpdated: updatedCount,
                totalErrors: errorCount,
                totalSkipped: allAreaListings.length - areaListings.length,
                timestamp: new Date()
            });
            
            const skippedCount = allAreaListings.length - areaListings.length;
            let resultMessage = `Обновление завершено. Обновлено: ${updatedCount}`;
            if (errorCount > 0) {
                resultMessage += `, ошибок: ${errorCount}`;
            }
            if (skippedCount > 0) {
                resultMessage += `, пропущено: ${skippedCount} (неактивные или недавно обновлены)`;
            }
            
            this.progressManager.showSuccess(resultMessage);
            
        } catch (error) {
            console.error('Error during updating:', error);
            this.progressManager.showError('Ошибка обновления: ' + error.message);
            
            this.eventBus.emit(CONSTANTS.EVENTS.PARSING_ERROR, {
                source: 'updating',
                error: error.message
            });
            
        } finally {
            this.parsing.isUpdating = false;
            this.dataState.setState('processing', { 
                ...this.dataState.getState('processing'), 
                updating: false 
            });
            
            // Скрываем прогресс-бар через 2 секунды
            setTimeout(() => {
                this.progressManager.updateProgressBar('updating', 0, '');
            }, 2000);
        }
    }
    
    /**
     * Обновление одного объявления
     */
    async updateSingleListing(listing) {
        try {
            // Проверяем, что объявление имеет URL для обновления
            if (!listing.url) {
                return { success: false, error: 'URL объявления отсутствует' };
            }
            
            await Helpers.debugLog('Обновляем объявление:', listing.url);
            
            // Создаем вкладку для обновления объявления
            const tab = await this.createTabWithRetry(listing.url, 2);
            
            try {
                // Ждем загрузки страницы и инжектируем content script
                await this.waitForPageLoad(tab.id);
                await this.injectContentScript(tab.id);
                
                // Запрашиваем обновленные данные объявления
                const response = await this.waitForContentScriptAndParse(tab.id, {
                    action: 'parseCurrentListing',
                    areaId: this.dataState.getState('currentAreaId'),
                    existingListingId: listing.id
                });
                
                // Закрываем вкладку
                try {
                    chrome.tabs.remove(tab.id);
                } catch (closeError) {
                    await Helpers.debugLog('Не удалось закрыть вкладку:', closeError);
                }
                
                if (response && response.success && response.data) {
                    // Сохраняем обновленные данные
                    const updatedListing = {
                        ...listing,
                        ...response.data,
                        id: listing.id, // Сохраняем оригинальный ID
                        created_at: listing.created_at, // Сохраняем дату создания
                        updated_at: new Date(),
                        // ВАЖНО: Сохраняем source_metadata для корректного отображения источников
                        source_metadata: listing.source_metadata
                    };
                    
                    // Проверяем изменение цены
                    if (listing.price !== response.data.price) {
                        if (!updatedListing.price_history) {
                            updatedListing.price_history = listing.price_history || [];
                        }
                        updatedListing.price_history.push({
                            date: new Date(),
                            old_price: listing.price,
                            new_price: response.data.price
                        });
                    }
                    
                    await window.db.update('listings', updatedListing);

                    // Инвалидируем кеш объявления
                    if (window.dataCacheManager) {
                        await window.dataCacheManager.invalidate('listings', listing.id);
                        if (updatedListing.object_id) {
                            await window.dataCacheManager.invalidate('objects', updatedListing.object_id);
                        }
                    }

                    // Уведомляем об обновлении
                    this.eventBus.emit(CONSTANTS.EVENTS.LISTING_UPDATED, {
                        listing: updatedListing,
                        oldListing: listing,
                        priceChanged: listing.price !== response.data.price
                    });

                    return { success: true, updated: true };
                } else {
                    // Если объявление не найдено, помечаем как архивное
                    const archivedListing = {
                        ...listing,
                        status: 'archived',
                        last_seen: new Date(),
                        updated_at: new Date()
                    };
                    
                    await window.db.update('listings', archivedListing);

                    // Инвалидируем кеш объявления
                    if (window.dataCacheManager) {
                        await window.dataCacheManager.invalidate('listings', listing.id);
                        if (archivedListing.object_id) {
                            await window.dataCacheManager.invalidate('objects', archivedListing.object_id);
                        }
                    }

                    // Уведомляем об архивации
                    this.eventBus.emit(CONSTANTS.EVENTS.LISTING_UPDATED, {
                        listing: archivedListing,
                        oldListing: listing,
                        archived: true
                    });

                    return { success: true, archived: true };
                }
                
            } catch (error) {
                // Закрываем вкладку в случае ошибки
                try {
                    chrome.tabs.remove(tab.id);
                } catch (closeError) {
                    await Helpers.debugLog('Не удалось закрыть вкладку после ошибки:', closeError);
                }
                throw error;
            }
            
        } catch (error) {
            await Helpers.debugLog('Ошибка обновления объявления:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Создание вкладки с повторными попытками
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
                await Helpers.debugLog(`Попытка ${attempt}/${maxRetries} создания вкладки неудачна:`, error.message);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Экспоненциальная задержка между попытками
                const delay = Math.pow(2, attempt) * 1000;
                await Helpers.sleep(delay);
            }
        }
    }
    
    /**
     * Ожидание загрузки страницы
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
     * Инжекция content script
     */
    async injectContentScript(tabId) {
        try {
            await Helpers.debugLog('Принудительная инжекция content script...');
            
            // Инжектируем зависимости
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['data/database.js']
            });
            
            // Инжектируем основной парсер
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content-scripts/avito-parser.js']
            });
            
            await Helpers.debugLog('Content script успешно инжектирован');
            
            // Дополнительная задержка для инициализации
            await Helpers.sleep(3000);
            
        } catch (error) {
            await Helpers.debugLog('Ошибка инжекции content script:', error);
            throw error;
        }
    }
    
    /**
     * Ожидание content script и парсинг
     */
    async waitForContentScriptAndParse(tabId, settings) {
        const maxAttempts = 10;
        const attemptDelay = 2000;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await Helpers.debugLog(`Попытка ${attempt}/${maxAttempts} связаться с content script...`);
                
                // Пытаемся отправить сообщение
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'parseMassByFilter',
                    areaId: settings.areaId,
                    areaName: settings.areaName,
                    maxPages: settings.maxPages || 10,
                    delay: settings.delay || 2000
                });
                
                // Если получили ответ, возвращаем его
                await Helpers.debugLog('Content script ответил:', response);
                return response;
                
            } catch (error) {
                await Helpers.debugLog(`Попытка ${attempt} неудачна:`, error.message);
                
                if (attempt === maxAttempts) {
                    // Последняя попытка - возвращаем ошибку
                    throw new Error(`Не удалось связаться с content script после ${maxAttempts} попыток: ${error.message}`);
                }
                
                // Ждем перед следующей попыткой
                await Helpers.sleep(attemptDelay);
            }
        }
    }
    
    /**
     * Получение настроек обновления
     */
    async getUpdateSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['neocenka_settings'], (result) => {
                const settings = result.neocenka_settings || {};
                resolve(settings);
            });
        });
    }
    
    /**
     * Получение объявлений в области
     */
    async getListingsInArea(areaId) {
        try {
            const allListings = await window.dataCacheManager.getAll('listings');
            return allListings.filter(listing => listing.map_area_id === areaId);
        } catch (error) {
            console.error('Ошибка получения объявлений области:', error);
            return [];
        }
    }
    
    /**
     * Остановка текущего парсинга
     */
    async stopParsing() {
        if (this.parsing.isActive) {
            this.parsing.isActive = false;
            this.progressManager.showWarning('Парсинг остановлен');
            
            this.eventBus.emit(CONSTANTS.EVENTS.PARSING_ERROR, {
                source: 'general',
                error: 'Парсинг остановлен пользователем'
            });
        }
    }
    
    /**
     * Получение статуса парсинга
     */
    getParsingStatus() {
        return {
            isActive: this.parsing.isActive,
            isUpdating: this.parsing.isUpdating,
            currentOperation: this.parsing.currentOperation,
            totalProgress: this.parsing.totalProgress
        };
    }
    
    /**
     * Обновление настроек парсинга
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }
    
    /**
     * Получение текущих настроек
     */
    getSettings() {
        return { ...this.settings };
    }
    
    /**
     * Уничтожение менеджера
     */
    destroy() {
        if (this.eventBus) {
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_CHANGED);
        }
        
        // Остановка активного парсинга
        this.stopParsing();
        
        // Очистка обработчиков
        document.getElementById('parseListingsBtn')?.removeEventListener('click', this.parseListings);
        document.getElementById('updateListingsBtn')?.removeEventListener('click', this.updateListings);
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParsingManager;
} else {
    window.ParsingManager = ParsingManager;
}