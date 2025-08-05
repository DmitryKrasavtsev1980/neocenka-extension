/**
 * Интеграция сервисной архитектуры в area.js
 * Заменяет старую интеграцию Inpars на новую модульную архитектуру
 */

/**
 * Дополнение к классу AreaPage для интеграции с новыми сервисами
 */
class AreaServicesIntegration {
    constructor(areaPageInstance) {
        this.areaPage = areaPageInstance;
        this.serviceManager = null;
        this.inparsService = null;
        this.inparsPanel = null;
        
        this.initialize();
    }

    /**
     * Инициализация интеграции сервисов
     */
    async initialize() {
        try {
            // console.log('🚀 Initializing service integration...');
            
            // Ждем готовности сервисов
            this.serviceManager = await ServiceConfig.waitForServices();
            // console.log('✅ ServiceManager ready');
            
            // Получаем сервис Inpars
            this.inparsService = this.serviceManager.getService('inpars');
            // console.log('✅ InparsService ready');
            
            // InparsPanel инициализируется в area.js через initInparsPanel()
            
            // Настраиваем обработчики событий
            this.setupEventHandlers();
            // console.log('✅ Event handlers configured');
            
        } catch (error) {
            console.error('❌ Failed to initialize service integration:', error);
            this.showError('Ошибка инициализации сервисов: ' + error.message);
        }
    }

    // Метод initInparsPanel удален - панель инициализируется в area.js

    /**
     * Настройка обработчиков событий
     */
    setupEventHandlers() {
        // События завершения импорта - слушаем на контейнере из initInparsPanel
        const inparsContainer = document.getElementById('inparsPanelContainer');
        if (inparsContainer) {
            inparsContainer.addEventListener('import:completed', (event) => {
                this.onImportCompleted(event.detail);
            });
            // console.log('✅ Event listener для import:completed добавлен на inparsPanelContainer');
        } else {
            console.error('❌ inparsPanelContainer не найден для добавления event listener');
        }
        
        // События сервиса Inpars
        this.inparsService.on('listings:loaded', (data) => {
            this.onListingsLoaded(data);
        });
        
        this.inparsService.on('listings:error', (data) => {
            this.onImportError(data.error);
        });
        
        this.inparsService.on('subscription:invalid', (data) => {
            this.onSubscriptionError(data.error);
        });
        
        // События глобальные
        document.addEventListener('services:ready', () => {
            // console.log('✅ All services are ready');
        });
        
        document.addEventListener('inpars:ready', () => {
            // console.log('✅ Inpars service is ready');
        });
    }

    /**
     * Обработчик завершения импорта
     */
    async onImportCompleted(result) {
        try {
            // console.log('📊 Import completed:', result);
            // console.log('📊 result.count:', result.count);
            // console.log('📊 result.listings:', result.listings);
            // console.log('📊 result.listings?.length:', result.listings?.length);
            
            // Обрабатываем полученные объявления через существующую логику
            if (result.listings && result.listings.length > 0) {
                await this.processImportedListings(result.listings);
                
                // После сохранения в БД обновляем DataState новыми данными из базы
                // console.log('🔄 Обновляем DataState после импорта...');
                if (this.areaPage.addressManager) {
                    await this.areaPage.addressManager.loadListings();
                }
            }
            
            // Обновляем интерфейс - уведомляем менеджеры об обновлении данных
            if (this.areaPage.eventBus) {
                this.areaPage.eventBus.emit(CONSTANTS.EVENTS.LISTINGS_IMPORTED, {
                    result,
                    timestamp: new Date()
                });
            }
            
            // Показываем уведомление
            const importedCount = (result.listings && result.listings.length) || result.count || 0;
            // console.log('🔍 Отладка уведомления: result =', result);
            // console.log('🔍 Отладка уведомления: importedCount =', importedCount);
            
            if (importedCount > 0) {
                this.showSuccess(`Успешно импортировано ${importedCount} объявлений`);
            } else {
                this.showSuccess('Импорт завершен');
            }
            
        } catch (error) {
            console.error('❌ Error processing import results:', error);
            this.showError('Ошибка обработки результатов импорта: ' + error.message);
        }
    }

    /**
     * Обработка импортированных объявлений
     */
    async processImportedListings(listings) {
        // console.log(`🔍 processImportedListings: Получено ${listings.length} объявлений для сохранения`);
        // console.log(`🔍 processImportedListings: currentAreaId = ${this.areaPage.currentAreaId}`);
        
        // Устанавливаем map_area_id для всех объявлений
        const processedListings = listings.map(listing => ({
            ...listing,
            map_area_id: this.areaPage.currentAreaId,
            created_at: listing.created_at || new Date(),
            updated_at: new Date()
        }));
        
        // console.log(`🔍 processImportedListings: Первое объявление после обработки:`, processedListings[0]);
        
        try {
            // console.log(`💾 processImportedListings: Вызываем db.saveListings с ${processedListings.length} объявлениями`);
            
            // Используем единый метод сохранения с правильной обработкой истории цен
            const result = await window.db.saveListings(processedListings);
            
            // console.log(`📊 Import results: ${result.added} new, ${result.updated} updated, ${result.skipped} errors`);
            return { 
                newCount: result.added, 
                updatedCount: result.updated, 
                errorCount: result.skipped 
            };
            
        } catch (error) {
            console.error('❌ Error saving listings:', error);
            return { newCount: 0, updatedCount: 0, errorCount: listings.length };
        }
    }

    /**
     * Обработчик загрузки объявлений
     */
    onListingsLoaded(data) {
        // console.log(`✅ Loaded ${data.count} listings from Inpars`);
        
        // Можно добавить дополнительную логику обработки
        if (data.count === 0) {
            this.showWarning('Объявления не найдены в указанной области');
        }
    }

    /**
     * Обработчик ошибок импорта
     */
    onImportError(error) {
        console.error('❌ Import error:', error);
        this.showError('Ошибка импорта данных: ' + error.message);
    }

    /**
     * Обработчик ошибок подписки
     */
    onSubscriptionError(error) {
        console.error('❌ Subscription error:', error);
        this.showError('Проблема с подпиской Inpars: ' + error.message);
        
        // Можно добавить редирект на настройки
        this.showInfo('Проверьте настройки API токена в разделе настроек');
    }

    /**
     * Обновление настроек сервиса
     */
    async updateServiceSettings(settings) {
        try {
            if (settings.inparsToken && this.inparsService) {
                this.inparsService.setToken(settings.inparsToken);
            }
            
            if (settings.inparsEnabledSources && this.inparsService) {
                this.inparsService.setEnabledSources(settings.inparsEnabledSources);
            }
            
            // console.log('✅ Service settings updated');
            
        } catch (error) {
            console.error('❌ Failed to update service settings:', error);
        }
    }

    /**
     * Получение статуса всех сервисов
     */
    getServicesStatus() {
        if (!this.serviceManager) {
            return { status: 'not_initialized' };
        }
        
        return this.serviceManager.getServicesStatus();
    }

    /**
     * Утилиты для уведомлений (интегрируются с существующей системой)
     */
    showSuccess(message) {
        // console.log('🔍 showSuccess вызван с message =', message, typeof message);
        if (this.areaPage.showSuccess) {
            this.areaPage.showSuccess(message);
        } else {
            // console.log('✅ ' + message);
        }
    }

    showError(message) {
        if (this.areaPage.showError) {
            this.areaPage.showError(message);
        } else {
            console.error('❌ ' + message);
        }
    }

    showWarning(message) {
        if (this.areaPage.showInfo) {
            this.areaPage.showInfo(message);
        } else {
            console.warn('⚠️ ' + message);
        }
    }

    showInfo(message) {
        if (this.areaPage.showInfo) {
            this.areaPage.showInfo(message);
        } else {
            console.info('ℹ️ ' + message);
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        if (this.inparsPanel) {
            this.inparsPanel.destroy();
            this.inparsPanel = null;
        }
        
        this.serviceManager = null;
        this.inparsService = null;
    }
}

/**
 * Глобальная функция для интеграции с существующим area.js
 */
async function initializeAreaServicesIntegration(areaPageInstance) {
    try {
        // Инициализируем сервисы если еще не инициализированы
        if (!window.serviceManager || !window.serviceManager.isInitialized) {
            // console.log('🚀 Initializing services...');
            window.serviceManager = await ServiceConfig.initializeServices();
        }
        
        // Создаем интеграцию
        const integration = new AreaServicesIntegration(areaPageInstance);
        
        // Сохраняем ссылку для использования в area.js
        areaPageInstance.servicesIntegration = integration;
        
        return integration;
        
    } catch (error) {
        console.error('❌ Failed to initialize services integration:', error);
        throw error;
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AreaServicesIntegration, initializeAreaServicesIntegration };
} else {
    // Для браузера добавляем в глобальную область
    window.AreaServicesIntegration = AreaServicesIntegration;
    window.initializeAreaServicesIntegration = initializeAreaServicesIntegration;
}