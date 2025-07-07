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
            console.log('🚀 Initializing service integration...');
            
            // Ждем готовности сервисов
            this.serviceManager = await ServiceConfig.waitForServices();
            console.log('✅ ServiceManager ready');
            
            // Получаем сервис Inpars
            this.inparsService = this.serviceManager.getService('inpars');
            console.log('✅ InparsService ready');
            
            // Инициализируем UI панель
            await this.initInparsPanel();
            console.log('✅ InparsPanel ready');
            
            // Настраиваем обработчики событий
            this.setupEventHandlers();
            console.log('✅ Event handlers configured');
            
        } catch (error) {
            console.error('❌ Failed to initialize service integration:', error);
            this.showError('Ошибка инициализации сервисов: ' + error.message);
        }
    }

    /**
     * Инициализация панели Inpars
     */
    async initInparsPanel() {
        // Находим контейнер для панели в HTML
        const panelContainer = document.getElementById('inparsPanelContainer');
        
        if (!panelContainer) {
            console.error('Inpars panel container not found in HTML');
            return;
        }
        
        // Создаем новую панель с использованием InparsPanel компонента
        this.inparsPanel = new InparsPanel(panelContainer, this.serviceManager);
        
        // Настраиваем функцию получения полигона
        this.inparsPanel.setPolygonProvider(() => {
            return this.areaPage.currentArea?.polygon || [];
        });
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventHandlers() {
        // События завершения импорта
        if (this.inparsPanel && this.inparsPanel.container) {
            this.inparsPanel.container.addEventListener('import:completed', (event) => {
                this.onImportCompleted(event.detail);
            });
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
            console.log('✅ All services are ready');
        });
        
        document.addEventListener('inpars:ready', () => {
            console.log('✅ Inpars service is ready');
        });
    }

    /**
     * Обработчик завершения импорта
     */
    async onImportCompleted(result) {
        try {
            console.log('📊 Import completed:', result);
            
            // Обрабатываем полученные объявления через существующую логику
            if (result.listings && result.listings.length > 0) {
                await this.processImportedListings(result.listings);
            }
            
            // Обновляем интерфейс
            await this.areaPage.loadListingsOnMap();
            await this.areaPage.loadAreaStats();
            
            // Показываем уведомление
            this.showSuccess(`Успешно импортировано ${result.listings.length} объявлений`);
            
        } catch (error) {
            console.error('❌ Error processing import results:', error);
            this.showError('Ошибка обработки результатов импорта: ' + error.message);
        }
    }

    /**
     * Обработка импортированных объявлений
     */
    async processImportedListings(listings) {
        let newCount = 0;
        let updatedCount = 0;
        let errorCount = 0;
        
        for (const listing of listings) {
            try {
                // Проверяем, существует ли объявление
                const existingListing = await db.getListingByExternalId(
                    listing.source,
                    listing.external_id
                );
                
                if (existingListing) {
                    // Обновляем существующее
                    await db.updateListing({
                        ...listing,
                        id: existingListing.id,
                        created_at: existingListing.created_at,
                        updated_at: new Date()
                    });
                    updatedCount++;
                } else {
                    // Создаем новое объявление
                    listing.map_area_id = this.areaPage.currentAreaId;
                    listing.created_at = new Date();
                    listing.updated_at = new Date();
                    await db.addListing(listing);
                    newCount++;
                }
                
            } catch (error) {
                console.error('Error processing listing:', error);
                errorCount++;
            }
        }
        
        console.log(`📊 Import results: ${newCount} new, ${updatedCount} updated, ${errorCount} errors`);
        return { newCount, updatedCount, errorCount };
    }

    /**
     * Обработчик загрузки объявлений
     */
    onListingsLoaded(data) {
        console.log(`✅ Loaded ${data.count} listings from Inpars`);
        
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
            
            console.log('✅ Service settings updated');
            
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
        if (this.areaPage.showNotification) {
            this.areaPage.showNotification(message, 'success');
        } else {
            console.log('✅ ' + message);
        }
    }

    showError(message) {
        if (this.areaPage.showNotification) {
            this.areaPage.showNotification(message, 'error');
        } else {
            console.error('❌ ' + message);
        }
    }

    showWarning(message) {
        if (this.areaPage.showNotification) {
            this.areaPage.showNotification(message, 'warning');
        } else {
            console.warn('⚠️ ' + message);
        }
    }

    showInfo(message) {
        if (this.areaPage.showNotification) {
            this.areaPage.showNotification(message, 'info');
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
            console.log('🚀 Initializing services...');
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