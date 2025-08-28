/**
 * Интеграционный слой современной архитектуры для страницы area.js
 * Расширяет существующую интеграцию сервисов полным функционалом модульной архитектуры
 */

class AreaArchitectureIntegration {
    constructor() {
        this.applicationController = null;
        this.diContainer = null;
        this.segmentController = null;
        this.mapController = null;
        this.legacyAreaPage = null;
        this.initialized = false;
        
        this.initialize();
    }
    
    /**
     * Инициализация v0.1 архитектуры
     */
    async initialize() {
        try {
            await this.debugLog('🏗️ Area: Начинаем инициализацию модульной архитектуры...');
            
            // 1. Ожидаем готовности базы данных в самом начале  
            await this.waitForDatabaseReady();
            
            // 2. Синхронизируем AI настройки до создания любых сервисов
            await this.syncAISettings();
            
            // 3. Инициализируем ApplicationController (создает DIContainer)
            await this.initializeApplicationController();
            
            // 4. Регистрируем новые сервисы для флиппинг-отчёта
            await this.registerFlippingServices();
            
            // 5. Получаем контроллеры
            await this.initializeControllers();
            
            // 6. Проверяем готовность DIContainer для AI инициализации
            const diReady = await this.checkDIContainerReady();
            if (diReady) {
                // 7. Инициализируем AI-интерфейс только когда DIContainer готов
                await this.initializeAIInterface();
            } else {
                console.warn('⚠️ AI-интерфейс не будет инициализирован из-за проблем с DIContainer');
            }
            
            // 8. Настраиваем интеграцию с legacy кодом
            await this.setupLegacyIntegration();
            
            // 5. Подписываемся на события
            this.setupEventListeners();
            
            this.initialized = true;
            await this.debugLog('✅ Area: Модульная архитектура инициализирована успешно');
            
        } catch (error) {
            console.error('❌ Area: Ошибка инициализации модульной архитектуры:', error);
        }
    }
    
    /**
     * Инициализация ApplicationController
     */
    async initializeApplicationController() {
        console.log('🔄 Инициализация ApplicationController...');
        
        if (typeof ApplicationController === 'undefined') {
            console.error('❌ ApplicationController не загружен');
            throw new Error('ApplicationController не загружен');
        }
        
        // База данных уже готова на этом этапе
        this.applicationController = new ApplicationController();
        console.log('✅ ApplicationController создан');
        
        this.diContainer = this.applicationController.container;
        console.log('📦 DIContainer получен:', !!this.diContainer);
        
        // Ждем инициализации
        let attempts = 0;
        while (!this.applicationController.state.initialized && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!this.applicationController.state.initialized) {
            console.error('❌ ApplicationController не смог инициализироваться за 5 секунд');
            throw new Error('ApplicationController не смог инициализироваться за 5 секунд');
        }
        
        console.log('✅ ApplicationController инициализирован');
        await this.debugLog('✅ Area: ApplicationController инициализирован');
    }
    
    /**
     * Регистрация сервисов для флиппинг-отчёта
     */
    async registerFlippingServices() {
        try {
            // FlippingController и RealEstateObjectService теперь регистрируются в ApplicationController
            // Этот метод оставлен для совместимости, но не выполняет никаких действий
            
            await this.debugLog('✅ Area: Сервисы флиппинг-отчёта регистрируются в ApplicationController');

        } catch (error) {
            console.error('❌ Area: Ошибка регистрации сервисов флиппинг:', error);
        }
    }

    /**
     * Инициализация контроллеров
     */
    async initializeControllers() {
        // SegmentController
        this.segmentController = this.applicationController.controllers.get('SegmentController');
        if (!this.segmentController) {
            await this.debugLog('⚠️ Area: SegmentController не найден в ApplicationController');
        } else {
            await this.debugLog('✅ Area: SegmentController готов');
        }
        
        // MapController  
        this.mapController = this.applicationController.controllers.get('MapController');
        if (!this.mapController) {
            await this.debugLog('⚠️ Area: MapController не найден в ApplicationController');
        } else {
            await this.debugLog('✅ Area: MapController готов');
        }

        // FlippingController - должен быть доступен через ApplicationController
        try {
            this.flippingController = await this.diContainer.get('FlippingController');
            await this.debugLog('✅ Area: FlippingController получен через ApplicationController');
            
            // Делаем FlippingController доступным глобально для интеграции
            window.flippingController = this.flippingController;
        } catch (error) {
            await this.debugLog('⚠️ Area: FlippingController не найден в ApplicationController:', error.message);
            this.flippingController = null;
            window.flippingController = null;
        }
    }
    
    /**
     * Инициализация AI-интерфейса
     */
    async initializeAIInterface() {
        try {
            // Проверяем доступность необходимых классов
            if (typeof AIChatInterface === 'undefined') {
                await this.debugLog('⚠️ AIChatInterface не загружен, пропускаем инициализацию AI');
                return;
            }
            
            console.log('🔄 Принудительная пересоздания AI сервисов с актуальными настройками...');
            
            // Создаем UniversalAIService заново, он будет использовать актуальные настройки из ConfigService
            const universalAI = this.diContainer.get('UniversalAIService');
            console.log('✅ UniversalAIService создан заново');
            
            // Получаем AI-интерфейс из DI контейнера
            const aiInterface = this.diContainer.get('AIChatInterface');
            
            // Ждем полной инициализации AI-интерфейса
            let attempts = 0;
            while (!aiInterface.isInitialized && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (aiInterface.isInitialized) {
                await this.debugLog('✅ Area: AI-интерфейс инициализирован');
                console.log('✅ AI-интерфейс инициализирован');
                
                // Сохраняем ссылки для легкого доступа
                this.aiInterface = aiInterface;
                this.universalAI = universalAI;
                
                // Проверяем доступность AI
                setTimeout(async () => {
                    try {
                        const isAvailable = await universalAI.isAvailable();
                        const providers = await universalAI.getAvailableProviders();
                        console.log('🎯 AI доступность:', isAvailable);
                        console.log('📡 Доступные провайдеры:', providers);
                        
                        if (isAvailable) {
                            console.log('🎉 AI-ассистент готов к работе!');
                        }
                    } catch (error) {
                        console.warn('⚠️ Ошибка проверки AI доступности:', error);
                    }
                }, 1000);
                
            } else {
                await this.debugLog('⚠️ Area: AI-интерфейс не смог инициализироваться за отведенное время');
                console.warn('⚠️ AI-интерфейс не смог инициализироваться за отведенное время');
            }
            
        } catch (error) {
            await this.debugLog('❌ Area: Ошибка инициализации AI-интерфейса:', error.message);
            console.error('❌ Ошибка инициализации AI-интерфейса:', error);
        }
    }
    
    /**
     * Настройка интеграции с legacy кодом
     */
    async setupLegacyIntegration() {
        // Ждем инициализации legacy AreaPage
        let attempts = 0;
        while (!window.areaPage && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.areaPage) {
            this.legacyAreaPage = window.areaPage;
            await this.debugLog('✅ Area: Legacy AreaPage найден');
            
            // Расширяем legacy объект
            this.extendLegacyWithV01Methods();
            
            // Интегрируем с существующими менеджерами
            await this.integrateLegacyManagers();
        } else {
            await this.debugLog('⚠️ Area: Legacy AreaPage не найден');
        }
    }
    
    /**
     * Расширение legacy объекта методами v0.1
     */
    extendLegacyWithV01Methods() {
        if (!this.legacyAreaPage) return;
        
        // Добавляем доступ к v0.1 архитектуре
        this.legacyAreaPage.v01 = {
            applicationController: this.applicationController,
            diContainer: this.diContainer,
            segmentController: this.segmentController,
            mapController: this.mapController,
            
            // Получение сервисов
            getService: (serviceName) => {
                return this.diContainer.get(serviceName);
            },
            
            // Получение UI компонентов
            getUIComponent: (componentName) => {
                return this.diContainer.get(componentName);
            },
            
            // Методы для работы с сегментами через v0.1
            segments: {
                create: async (segmentData) => {
                    if (this.segmentController) {
                        return await this.segmentController.createSegment(segmentData);
                    }
                    throw new Error('SegmentController не доступен');
                },
                
                update: async (segmentId, segmentData) => {
                    if (this.segmentController) {
                        return await this.segmentController.updateSegment(segmentId, segmentData);
                    }
                    throw new Error('SegmentController не доступен');
                },
                
                delete: async (segmentId) => {
                    if (this.segmentController) {
                        return await this.segmentController.deleteSegment(segmentId);
                    }
                    throw new Error('SegmentController не доступен');
                },
                
                showModal: (mode, segmentData = null) => {
                    const segmentModal = this.diContainer.get('SegmentModal');
                    if (segmentModal) {
                        return segmentModal.show(mode, segmentData);
                    }
                    throw new Error('SegmentModal не доступен');
                }
            },
            
            // Методы для работы с картой через v0.1
            map: {
                render: (container, options = {}) => {
                    if (this.mapController) {
                        return this.mapController.createMap(container, options);
                    }
                    throw new Error('MapController не доступен');
                },
                
                updateMarkers: (addresses) => {
                    if (this.mapController) {
                        return this.mapController.updateAddressMarkers(addresses);
                    }
                    throw new Error('MapController не доступен');
                }
            },
            
            // AI-интерфейс
            ai: this.aiInterface || null,
            
            // Методы для работы с AI
            openAIChat: () => {
                if (this.aiInterface) {
                    this.aiInterface.openChat();
                } else {
                    console.warn('AI-интерфейс недоступен');
                }
            },
            
            analyzeListings: (listings) => {
                if (this.aiInterface) {
                    this.aiInterface.analyzeDuplicates(listings);
                } else {
                    console.warn('AI-интерфейс недоступен');
                }
            },
            
            createSegmentation: (area, objects) => {
                if (this.aiInterface) {
                    this.aiInterface.createSegmentation(area, objects);
                } else {
                    console.warn('AI-интерфейс недоступен');
                }
            }
        };
        
        this.debugLog('✅ Area: Legacy AreaPage расширен методами v0.1');
    }
    
    /**
     * Интеграция с существующими legacy менеджерами
     */
    async integrateLegacyManagers() {
        if (!this.legacyAreaPage) return;
        
        // Интеграция с SegmentsManager
        if (this.legacyAreaPage.segmentsManager && this.segmentController) {
            // Подменяем некоторые методы legacy менеджера на v0.1
            const originalShowModal = this.legacyAreaPage.segmentsManager.showSegmentModal;
            this.legacyAreaPage.segmentsManager.showSegmentModal = (mode, segmentData = null) => {
                try {
                    return this.legacyAreaPage.v01.segments.showModal(mode, segmentData);
                } catch (error) {
                    // Fallback на original метод
                    return originalShowModal.call(this.legacyAreaPage.segmentsManager, mode, segmentData);
                }
            };
            
            await this.debugLog('✅ Area: SegmentsManager интегрирован с v0.1');
        }
        
        // Интеграция с MapManager
        if (this.legacyAreaPage.mapManager && this.mapController) {
            // Сохраняем ссылку на legacy MapManager для совместимости
            this.mapController.legacyMapManager = this.legacyAreaPage.mapManager;
            
            await this.debugLog('✅ Area: MapManager интегрирован с v0.1');
        }
    }
    
    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        const eventBus = this.diContainer.get('EventBus');
        
        // События сегментов
        eventBus.on('segment:created', async (segmentData) => {
            await this.debugLog('✅ Area: Segment created:', segmentData.id);
            
            // Уведомляем legacy код
            if (this.legacyAreaPage && this.legacyAreaPage.loadSegments) {
                this.legacyAreaPage.loadSegments();
            }
        });
        
        eventBus.on('segment:updated', async (segmentData) => {
            await this.debugLog('✅ Area: Segment updated:', segmentData.id);
            
            // Обновляем таблицы и карту
            if (this.legacyAreaPage) {
                if (this.legacyAreaPage.loadSegments) {
                    this.legacyAreaPage.loadSegments();
                }
                if (this.legacyAreaPage.displaySegmentsOnMap) {
                    this.legacyAreaPage.displaySegmentsOnMap();
                }
            }
        });
        
        eventBus.on('segment:deleted', async (segmentId) => {
            await this.debugLog('✅ Area: Segment deleted:', segmentId);
            
            // Обновляем UI
            if (this.legacyAreaPage && this.legacyAreaPage.loadSegments) {
                this.legacyAreaPage.loadSegments();
            }
        });
    }
    
    /**
     * Ожидание готовности базы данных
     */
    async waitForDatabaseReady() {
        let attempts = 0;
        const maxAttempts = 100; // 10 секунд максимум
        
        while (attempts < maxAttempts) {
            try {
                if (window.db && typeof window.db.getAll === 'function') {
                    // Проверяем, что БД действительно готова к работе
                    await window.db.getAll('addresses');
                    return;
                }
            } catch (error) {
                // БД ещё не готова, продолжаем ждать
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        throw new Error('База данных не готова после 10 секунд ожидания');
    }

    /**
     * Отладочное логирование
     */
    async debugLog(message, ...args) {
        try {
            if (window.db && window.db.db) {
                const settings = await window.db.getSettings();
                const debugEnabled = settings.find(s => s.key === 'debug_enabled')?.value === true;
            }
        } catch (error) {
            // Игнорируем ошибки логирования
        }
    }
    
    /**
     * Синхронизирует AI настройки из IndexedDB в ConfigService
     */
    async syncAISettings() {
        try {
            console.log('🔄 Area: Синхронизация AI настроек из базы данных...');
            await this.debugLog('🔄 Area: Синхронизация AI настроек из базы данных...');
            
            console.log('🔍 Проверяем доступность:', {
                'window.db': !!window.db,
                'window.configService': !!window.configService
            });

            if (!window.db) {
                console.log('⚠️ Area: База данных недоступна для синхронизации AI настроек');
                await this.debugLog('⚠️ Area: База данных недоступна для синхронизации AI настроек');
                return;
            }

            if (!window.configService) {
                console.log('⚠️ Area: ConfigService недоступен для синхронизации AI настроек');
                await this.debugLog('⚠️ Area: ConfigService недоступен для синхронизации AI настроек');
                return;
            }

            // Загружаем настройки YandexGPT из базы
            console.log('🔍 Загружаем настройки YandexGPT из базы...');
            const yandexApiKey = await window.db.get('settings', 'yandex_api_key');
            console.log('📋 YandexGPT API Key:', yandexApiKey ? 'найден' : 'не найден');
            
            const yandexFolderId = await window.db.get('settings', 'yandex_folder_id');
            console.log('📋 YandexGPT Folder ID:', yandexFolderId ? 'найден' : 'не найден');
            
            const yandexModel = await window.db.get('settings', 'yandex_model');
            console.log('📋 YandexGPT Model:', yandexModel || 'не найден, будет использован по умолчанию');

            if (yandexApiKey && yandexFolderId) {
                const yandexConfig = {
                    apiKey: yandexApiKey.value || yandexApiKey,
                    folderId: yandexFolderId.value || yandexFolderId,
                    model: (yandexModel && yandexModel.value) || yandexModel || 'yandexgpt-lite/latest'
                };
                
                console.log('💾 Сохраняем конфигурацию YandexGPT в ConfigService:', yandexConfig);
                window.configService.set('ai.providers.yandex', yandexConfig);
                
                
                console.log('✅ Настройки YandexGPT синхронизированы из базы данных');
                await this.debugLog('✅ Area: Настройки YandexGPT синхронизированы из базы данных');
            } else {
                console.log('⚠️ Настройки YandexGPT не найдены в базе данных');
                await this.debugLog('⚠️ Area: Настройки YandexGPT не найдены в базе данных');
            }

            // Загружаем настройки Claude из базы
            const claudeApiKey = await window.db.get('settings', 'claude_api_key');
            if (claudeApiKey) {
                const claudeModel = await window.db.get('settings', 'claude_model');
                const claudeConfig = {
                    apiKey: claudeApiKey.value || claudeApiKey,
                    model: (claudeModel && claudeModel.value) || claudeModel || 'claude-3-sonnet-20240229'
                };
                
                window.configService.set('ai.providers.claude', claudeConfig);
                await this.debugLog('✅ Area: Настройки Claude синхронизированы из базы данных');
            }

            console.log('🎯 Синхронизация AI настроек завершена');

        } catch (error) {
            console.error('❌ Area: Ошибка синхронизации AI настроек:', error);
        }
    }

    /**
     * Проверяет готовность DIContainer для создания AI сервисов
     */
    async checkDIContainerReady() {
        try {
            console.log('🔄 Проверка готовности DIContainer для AI инициализации...');
            
            // Получаем diContainer из applicationController если он создан  
            const diContainer = this.diContainer || this.applicationController?.container;
            
            
            if (diContainer) {
                // НЕ создаем AI сервисы заранее - просто подтверждаем готовность DIContainer
                console.log('✅ DIContainer готов для создания AI сервисов с актуальными настройками');
                await this.debugLog('🔄 Area: DIContainer готов для AI инициализации');
                return true;
            } else {
                console.log('⚠️ DIContainer недоступен');
                await this.debugLog('⚠️ Area: DIContainer недоступен для AI инициализации');
                return false;
            }
        } catch (error) {
            console.error('❌ Ошибка проверки готовности DIContainer:', error);
            return false;
        }
    }

    /**
     * Проверка готовности архитектуры v0.1
     */
    isReady() {
        return this.initialized && 
               this.applicationController && 
               this.applicationController.state.initialized;
    }
}

// Глобальная инициализация
window.addEventListener('DOMContentLoaded', () => {
    // Небольшая задержка, чтобы дать время legacy коду инициализироваться
    setTimeout(() => {
        window.areaArchitectureIntegration = new AreaArchitectureIntegration();
    }, 1000);
});

// Экспортируем для использования в других скриптах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AreaPageV01Integration;
}