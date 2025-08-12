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
            
            // 1. Инициализируем ApplicationController
            await this.initializeApplicationController();
            
            // 2. Регистрируем новые сервисы для флиппинг-отчёта
            await this.registerFlippingServices();
            
            // 3. Получаем контроллеры
            await this.initializeControllers();
            
            // 3. Настраиваем интеграцию с legacy кодом
            await this.setupLegacyIntegration();
            
            // 4. Подписываемся на события
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
        if (typeof ApplicationController === 'undefined') {
            throw new Error('ApplicationController не загружен');
        }
        
        this.applicationController = new ApplicationController();
        this.diContainer = this.applicationController.container;
        
        // Ждем инициализации
        let attempts = 0;
        while (!this.applicationController.state.initialized && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!this.applicationController.state.initialized) {
            throw new Error('ApplicationController не смог инициализироваться за 5 секунд');
        }
        
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
     * Отладочное логирование
     */
    async debugLog(message, ...args) {
        try {
            if (window.db && window.db.db) {
                const settings = await window.db.getSettings();
                const debugEnabled = settings.find(s => s.key === 'debug_enabled')?.value === true;
                
                if (debugEnabled) {
                    console.log(message, ...args);
                }
            }
        } catch (error) {
            // Игнорируем ошибки логирования
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