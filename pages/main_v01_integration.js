/**
 * Интеграционный слой для постепенного перехода на архитектуру v0.1
 * Инициализирует новую архитектуру параллельно с legacy кодом
 */

class MainPageV01Integration {
    constructor() {
        this.applicationController = null;
        this.diContainer = null;
        this.legacyMainPage = null;
        this.initialized = false;
        
        this.initialize();
    }
    
    /**
     * Инициализация v0.1 архитектуры
     */
    async initialize() {
        try {
            await this.debugLog('🏗️ Начинаем инициализацию архитектуры v0.1...');
            
            // 1. Инициализируем ApplicationController
            await this.initializeApplicationController();
            
            // 2. Получаем DI контейнер
            this.diContainer = this.applicationController.container;
            await this.debugLog('✅ DI контейнер готов');
            
            // 3. Настраиваем интеграцию с legacy кодом
            await this.setupLegacyIntegration();
            
            // 4. Подписываемся на события
            this.setupEventListeners();
            
            this.initialized = true;
            await this.debugLog('✅ Архитектура v0.1 инициализирована успешно');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации архитектуры v0.1:', error);
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
        await this.debugLog('✅ ApplicationController создан');
        
        // Ждем инициализации
        let attempts = 0;
        while (!this.applicationController.state.initialized && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!this.applicationController.state.initialized) {
            throw new Error('ApplicationController не смог инициализироваться за 5 секунд');
        }
        
        await this.debugLog('✅ ApplicationController инициализирован');
    }
    
    /**
     * Настройка интеграции с legacy кодом
     */
    async setupLegacyIntegration() {
        // Ждем инициализации legacy MainPage
        let attempts = 0;
        while (!window.mainPage && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.mainPage) {
            this.legacyMainPage = window.mainPage;
            await this.debugLog('✅ Legacy MainPage найден');
            
            // Добавляем методы v0.1 к legacy объекту
            this.extendLegacyWithV01Methods();
        } else {
            await this.debugLog('⚠️ Legacy MainPage не найден, продолжаем без интеграции');
        }
    }
    
    /**
     * Расширение legacy объекта методами v0.1
     */
    extendLegacyWithV01Methods() {
        if (!this.legacyMainPage) return;
        
        // Добавляем доступ к v0.1 архитектуре
        this.legacyMainPage.v01 = {
            applicationController: this.applicationController,
            diContainer: this.diContainer,
            
            // Получение сервисов
            getService: (serviceName) => {
                return this.diContainer.get(serviceName);
            },
            
            // Получение контроллеров
            getController: (controllerName) => {
                return this.applicationController.controllers.get(controllerName);
            },
            
            // Получение компонентов
            getComponent: (componentName) => {
                return this.diContainer.get(componentName);
            }
        };
        
        this.debugLog('✅ Legacy MainPage расширен методами v0.1');
    }
    
    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // События от EventBus
        const eventBus = this.diContainer.get('EventBus');
        
        // Подписываемся на глобальные события
        eventBus.on('app:error', (error) => {
            console.error('🚨 Global application error:', error);
        });
        
        eventBus.on('segment:created', (segmentData) => {
            this.debugLog('✅ Segment created:', segmentData.id);
        });
        
        eventBus.on('segment:updated', (segmentData) => {
            this.debugLog('✅ Segment updated:', segmentData.id);
        });
        
        eventBus.on('segment:deleted', (segmentId) => {
            this.debugLog('✅ Segment deleted:', segmentId);
        });
    }
    
    /**
     * Отладочное логирование
     */
    async debugLog(message, ...args) {
        try {
            // Проверяем настройки отладки
            if (window.db && window.db.db) {
                const settings = await window.db.getSettings();
                const debugEnabled = settings.find(s => s.key === 'debug_enabled')?.value === true;
                
                if (debugEnabled) {
                    console.log(message, ...args);
                }
            }
        } catch (error) {
            // Если не можем проверить настройки, просто не логируем
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
    
    /**
     * Получение сервиса через DI контейнер
     */
    getService(serviceName) {
        if (!this.isReady()) {
            console.warn(`⚠️ Архитектура v0.1 не готова, сервис ${serviceName} недоступен`);
            return null;
        }
        
        return this.diContainer.get(serviceName);
    }
    
    /**
     * Получение контроллера
     */
    getController(controllerName) {
        if (!this.isReady()) {
            console.warn(`⚠️ Архитектура v0.1 не готова, контроллер ${controllerName} недоступен`);
            return null;
        }
        
        return this.applicationController.controllers.get(controllerName);
    }
}

// Глобальная инициализация
window.addEventListener('DOMContentLoaded', () => {
    // Создаем интеграцию v0.1
    window.mainPageV01Integration = new MainPageV01Integration();
});

// Экспортируем для использования в других скриптах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MainPageV01Integration;
}