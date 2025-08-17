/**
 * ApplicationController - главный контроллер приложения
 * Координирует работу всех контроллеров и сервисов
 * Реализует паттерн Application Controller для управления потоком приложения
 */

class ApplicationController {
    constructor() {
        // DI контейнер
        this.container = null;
        
        // Основные контроллеры
        this.controllers = new Map();
        
        // Состояние приложения
        this.state = {
            initialized: false,
            loading: false,
            currentPage: null,
            user: null,
            errors: []
        };
        
        // Основные сервисы
        this.configService = null;
        this.errorHandler = null;
        this.errorReporter = null;
        this.dataState = null;
        
        // Роутинг
        this.routes = new Map();
        this.currentRoute = null;
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Конфигурация приложения
        this.appConfig = this.getDefaultAppConfig();
        
        this.initialize();
    }

    /**
     * Получение конфигурации приложения по умолчанию
     */
    getDefaultAppConfig() {
        return {
            version: '1.0.0',
            debug: false,
            pages: {
                main: { controller: 'MainController', title: 'Главная' },
                area: { controller: 'AreaController', title: 'Области' },
                segments: { controller: 'SegmentController', title: 'Сегменты' },
                settings: { controller: 'SettingsController', title: 'Настройки' }
            },
            services: {
                autoStart: true,
                healthCheck: true
            }
        };
    }

    /**
     * Инициализация главного контроллера
     */
    async initialize() {
        try {
            this.state.loading = true;
            this.emit('app:loading-start');

            // 1. Инициализируем DI контейнер
            await this.setupDIContainer();
            
            // 2. Регистрируем сервисы
            await this.registerServices();
            
            // 3. Инициализируем сервисы
            await this.initializeServices();
            
            // 4. Настраиваем контроллеры
            await this.setupControllers();
            
            // 5. Настраиваем роутинг
            this.setupRouting();
            
            // 6. Настраиваем глобальные обработчики событий
            this.setupGlobalEventHandlers();
            
            // 7. Загружаем начальные данные
            await this.loadInitialData();
            
            this.state.initialized = true;
            this.state.loading = false;
            
            this.emit('app:initialized');
            // console.log('🚀 ApplicationController инициализирован (SegmentTable используется из legacy кода)');

        } catch (error) {
            this.state.loading = false;
            await this.handleInitializationError(error);
        }
    }

    /**
     * Настройка DI контейнера
     */
    async setupDIContainer() {
        // Импортируем или создаём контейнер
        if (typeof diContainer !== 'undefined') {
            this.container = diContainer;
        } else if (typeof DIContainer !== 'undefined') {
            this.container = new DIContainer();
        } else {
            throw new Error('DI контейнер недоступен');
        }
    }

    /**
     * Регистрация сервисов в DI контейнере
     */
    async registerServices() {
        // Регистрируем специализированные сервисы данных
        this.container.registerFactory('SegmentService', (container) => {
            return new SegmentService(
                container.get('Database'),
                container.get('ValidationService'),
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['Database', 'ValidationService', 'ConfigService', 'ErrorHandlingService'] });

        this.container.registerFactory('ReferenceDataService', (container) => {
            return new ReferenceDataService(
                container.get('Database'),
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['Database', 'ConfigService', 'ErrorHandlingService'] });

        // Регистрируем UI компоненты
        this.container.registerFactory('SegmentModal', (container) => {
            return new SegmentModal(
                container.get('ValidationService'),
                container.get('ConfigService')
            );
        }, { singleton: true, dependencies: ['ValidationService', 'ConfigService'] });

        // SegmentTable отключен - используется legacy версия из SegmentsManager
        /*
        this.container.registerFactory('SegmentTable', (container) => {
            return new SegmentTable(
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['ConfigService', 'ErrorHandlingService'] });
        */

        this.container.registerFactory('SegmentChart', (container) => {
            return new SegmentChart(
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['ConfigService', 'ErrorHandlingService'] });

        // Регистрируем компоненты карты
        this.container.registerFactory('MapRenderer', (container) => {
            return new MapRenderer(
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['ConfigService', 'ErrorHandlingService'] });

        this.container.registerFactory('MarkerManager', (container) => {
            return new MarkerManager(
                container.get('MapRenderer'),
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['MapRenderer', 'ConfigService', 'ErrorHandlingService'] });

        // Регистрируем GlobalErrorReporter
        this.container.registerFactory('GlobalErrorReporter', (container) => {
            return new GlobalErrorReporter(
                container.get('ErrorHandlingService'),
                container.get('ConfigService')
            );
        }, { singleton: true, dependencies: ['ErrorHandlingService', 'ConfigService'] });

        // Регистрируем компоненты для флиппинг-отчёта
        this.container.registerFactory('RealEstateObjectService', (container) => {
            const database = window.db;
            const validationService = container.get('ValidationService');
            const errorHandlingService = container.get('ErrorHandlingService');
            const configService = container.get('ConfigService');
            
            return new RealEstateObjectService(database, validationService, errorHandlingService, configService);
        }, { singleton: true, dependencies: ['ValidationService', 'ErrorHandlingService', 'ConfigService'] });

        this.container.registerFactory('FlippingController', async (container) => {
            const flippingController = new FlippingController(container);
            await flippingController.initialize();
            return flippingController;
        }, { singleton: true, dependencies: ['RealEstateObjectService'] });
    }

    /**
     * Инициализация сервисов
     */
    async initializeServices() {
        try {
            // Инициализируем DI контейнер
            await this.container.initialize();
            
            // Получаем основные сервисы
            this.configService = this.container.get('ConfigService');
            this.errorHandler = this.container.get('ErrorHandlingService');
            this.errorReporter = this.container.get('GlobalErrorReporter');
            this.dataState = this.container.get('DataState');
            
        } catch (error) {
            throw new Error(`Ошибка инициализации сервисов: ${error.message}`);
        }
    }

    /**
     * Настройка контроллеров
     */
    async setupControllers() {
        // Регистрируем и создаём контроллеры
        await this.registerControllers();
        
        // Инициализируем контроллеры
        for (const [name, controller] of this.controllers) {
            if (typeof controller.initialize === 'function') {
                await controller.initialize();
            }
        }
    }

    /**
     * Безопасное получение сервиса - возвращает null если сервис не доступен
     */
    safeGetService(serviceName) {
        try {
            return this.container.get(serviceName);
        } catch (error) {
            console.warn(`⚠️ Сервис ${serviceName} не доступен: ${error.message}`);
            return null;
        }
    }

    /**
     * Регистрация контроллеров
     */
    async registerControllers() {
        // SegmentController - создаем только если все зависимости доступны
        try {
            this.controllers.set('SegmentController', new SegmentController({
                segmentService: this.container.get('SegmentService'),
                referenceDataService: this.container.get('ReferenceDataService'),
                validationService: this.container.get('ValidationService'),
                configService: this.configService,
                errorHandler: this.errorHandler,
                dataState: this.dataState,
                segmentModal: this.safeGetService('SegmentModal'),
                // segmentTable: this.safeGetService('SegmentTable'), // Отключён - используется legacy версия
                segmentChart: this.safeGetService('SegmentChart'),
                mapRenderer: this.safeGetService('MapRenderer'),
                markerManager: this.safeGetService('MarkerManager')
            }));
        } catch (error) {
            console.warn('⚠️ SegmentController не создан:', error.message);
        }

        // MapController - создаем только если все зависимости доступны
        try {
            this.controllers.set('MapController', new MapController({
                configService: this.configService,
                errorHandler: this.errorHandler,
                dataState: this.dataState,
                mapRenderer: this.safeGetService('MapRenderer'),
                markerManager: this.safeGetService('MarkerManager')
            }));
        } catch (error) {
            console.warn('⚠️ MapController не создан:', error.message);
        }

        // Делаем контроллеры доступными глобально для отладки и интеграции
        if (typeof window !== 'undefined') {
            window.segmentController = this.controllers.get('SegmentController');
            window.mapController = this.controllers.get('MapController');
            window.appController = this;
        }
    }

    /**
     * Настройка роутинга
     */
    setupRouting() {
        // Простой роутер на основе hash
        this.routes.set('main', {
            path: '#main',
            controller: 'SegmentController',
            title: 'Главная'
        });
        
        this.routes.set('area', {
            path: '#area', 
            controller: 'MapController',
            title: 'Управление областями'
        });
        
        this.routes.set('segments', {
            path: '#segments',
            controller: 'SegmentController', 
            title: 'Сегменты'
        });

        // Обработчик изменения hash
        window.addEventListener('hashchange', () => {
            this.handleRouteChange();
        });

        // Обработка начального роута
        this.handleRouteChange();
    }

    /**
     * Обработка изменения роута
     */
    handleRouteChange() {
        const hash = window.location.hash || '#main';
        const route = Array.from(this.routes.values()).find(r => r.path === hash);
        
        if (route) {
            this.navigateToRoute(route);
        } else {
            // Неизвестный роут - перенаправляем на главную
            this.navigate('main');
        }
    }

    /**
     * Навигация к роуту
     */
    async navigateToRoute(route) {
        try {
            this.currentRoute = route;
            this.state.currentPage = route.controller;
            
            // Обновляем заголовок страницы
            if (route.title) {
                document.title = `${route.title} - Neocenka Extension`;
            }
            
            // Активируем соответствующий контроллер
            const controller = this.controllers.get(route.controller);
            if (controller && typeof controller.activate === 'function') {
                await controller.activate();
            }
            
            this.emit('route:changed', { route, controller: route.controller });
            
        } catch (error) {
            await this.errorHandler.handleError(error, {
                context: 'navigation',
                route: route.path
            });
        }
    }

    /**
     * Программная навигация
     */
    navigate(routeName, params = {}) {
        const route = this.routes.get(routeName);
        if (route) {
            let path = route.path;
            
            // Добавляем параметры если есть
            if (Object.keys(params).length > 0) {
                const searchParams = new URLSearchParams(params);
                path += '?' + searchParams.toString();
            }
            
            window.location.hash = path.substring(1); // Убираем #
        } else {
            console.warn(`Роут '${routeName}' не найден`);
        }
    }

    /**
     * Настройка глобальных обработчиков событий
     */
    setupGlobalEventHandlers() {
        // Глобальные клавиатурные сокращения
        document.addEventListener('keydown', (e) => {
            this.handleGlobalKeydown(e);
        });

        // Обработка ошибок на уровне приложения
        this.addEventListener('controller:error', (data) => {
            this.handleControllerError(data);
        });

        // Обработка изменений состояния данных
        this.dataState.subscribe('*', (key, newValue, oldValue) => {
            this.emit('data:changed', { key, newValue, oldValue });
        });

        // Обработка событий контроллеров
        this.controllers.forEach((controller, name) => {
            if (typeof controller.addEventListener === 'function') {
                controller.addEventListener('*', (eventType, data) => {
                    this.emit(`controller:${name.toLowerCase()}:${eventType}`, data);
                });
            }
        });
    }

    /**
     * Обработка глобальных клавиатурных сокращений
     */
    handleGlobalKeydown(e) {
        // Только если не в поле ввода
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
            return;
        }

        // Сокращения с Ctrl/Cmd
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '1':
                    e.preventDefault();
                    this.navigate('main');
                    break;
                case '2':
                    e.preventDefault();
                    this.navigate('area');
                    break;
                case '3':
                    e.preventDefault();
                    this.navigate('segments');
                    break;
                case '/':
                    e.preventDefault();
                    this.focusSearch();
                    break;
            }
        }

        // Сокращения без модификаторов
        switch (e.key) {
            case 'Escape':
                this.handleEscapeKey();
                break;
        }
    }

    /**
     * Загрузка начальных данных
     */
    async loadInitialData() {
        try {
            // Загружаем конфигурацию
            await this.loadConfiguration();
            
            // Загружаем данные пользователя
            await this.loadUserData();
            
            // Загружаем справочные данные
            await this.loadReferenceData();
            
        } catch (error) {
            console.warn('Ошибка загрузки начальных данных:', error);
            // Не критичная ошибка - продолжаем работу
        }
    }

    /**
     * Загрузка конфигурации
     */
    async loadConfiguration() {
        // Загружаем конфигурацию из localStorage или chrome.storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get('appConfig');
            if (result.appConfig) {
                this.appConfig = { ...this.appConfig, ...result.appConfig };
            }
        }
        
        // Применяем конфигурацию к сервисам (используем set вместо setState)
        this.configService.set('app', this.appConfig);
    }

    /**
     * Загрузка данных пользователя
     */
    async loadUserData() {
        // Заглушка для загрузки пользовательских данных
        this.state.user = {
            id: 'user_' + Date.now(),
            preferences: {},
            lastActivity: new Date()
        };
    }

    /**
     * Загрузка справочных данных
     */
    async loadReferenceData() {
        try {
            const referenceService = this.container.get('ReferenceDataService');
            
            // Загружаем основные справочники
            const referenceTypes = ['house_series', 'house_classes', 'wall_materials'];
            const referenceData = {};
            
            for (const type of referenceTypes) {
                referenceData[type] = await referenceService.getAll(type);
            }
            
            this.dataState.setState('referenceData', referenceData);
            
        } catch (error) {
            console.warn('Ошибка загрузки справочных данных:', error);
        }
    }

    /**
     * Обработка ошибок инициализации
     */
    async handleInitializationError(error) {
        console.error('❌ Критическая ошибка инициализации ApplicationController:', error);
        
        this.state.errors.push({
            type: 'initialization',
            message: error.message,
            timestamp: new Date(),
            critical: true
        });
        
        // Показываем пользователю сообщение об ошибке
        this.showCriticalError(error);
        
        this.emit('app:initialization-error', { error });
    }

    /**
     * Обработка ошибок контроллеров
     */
    async handleControllerError(data) {
        const { controller, error, context } = data;
        
        await this.errorHandler.handleError(error, {
            ...context,
            source: 'ApplicationController',
            controller: controller
        });
    }

    /**
     * Отображение критической ошибки
     */
    showCriticalError(error) {
        const errorElement = document.createElement('div');
        errorElement.className = 'critical-error-overlay';
        errorElement.innerHTML = `
            <div class="critical-error-content">
                <h2>⚠️ Критическая ошибка приложения</h2>
                <p>Произошла критическая ошибка при инициализации приложения:</p>
                <pre class="error-details">${error.message}</pre>
                <div class="error-actions">
                    <button onclick="location.reload()" class="btn btn-primary">
                        Перезагрузить страницу
                    </button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn btn-secondary">
                        Закрыть
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(errorElement);
    }

    /**
     * Обработка клавиши Escape
     */
    handleEscapeKey() {
        // Закрытие модальных окон, отмена действий
        this.emit('global:escape');
    }

    /**
     * Фокус на поиск
     */
    focusSearch() {
        const searchInput = document.querySelector('[data-role="search"], input[type="search"], .search-input');
        if (searchInput) {
            searchInput.focus();
        }
    }

    /**
     * Публичные методы управления приложением
     */
    
    /**
     * Получение состояния приложения
     */
    getApplicationState() {
        return {
            ...this.state,
            controllers: Array.from(this.controllers.keys()),
            services: this.container?.getRegisteredServices() || [],
            currentRoute: this.currentRoute,
            health: this.errorReporter?.getSystemHealth() || null
        };
    }

    /**
     * Получение контроллера по имени
     */
    getController(name) {
        return this.controllers.get(name);
    }

    /**
     * Получение сервиса через DI контейнер
     */
    getService(name) {
        return this.container?.get(name);
    }

    /**
     * Обновление конфигурации приложения
     */
    async updateConfiguration(updates) {
        this.appConfig = { ...this.appConfig, ...updates };
        
        // Сохраняем в storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.set({ appConfig: this.appConfig });
        }
        
        // Обновляем в сервисе конфигурации
        this.configService.setState('app', this.appConfig);
        
        this.emit('config:updated', { config: this.appConfig });
    }

    /**
     * Перезапуск приложения
     */
    async restart() {
        try {
            this.emit('app:restart-start');
            
            // Уничтожаем контроллеры
            for (const [name, controller] of this.controllers) {
                if (typeof controller.destroy === 'function') {
                    controller.destroy();
                }
            }
            this.controllers.clear();
            
            // Уничтожаем DI контейнер
            if (this.container && typeof this.container.destroy === 'function') {
                this.container.destroy();
            }
            
            // Сбрасываем состояние
            this.state = {
                initialized: false,
                loading: false,
                currentPage: null,
                user: null,
                errors: []
            };
            
            // Перезапускаем
            await this.initialize();
            
            this.emit('app:restart-complete');
            
        } catch (error) {
            await this.handleInitializationError(error);
        }
    }

    // === СИСТЕМА СОБЫТИЙ ===

    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(eventType, data = {}) {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Корректное завершение работы приложения
     */
    async shutdown() {
        try {
            this.emit('app:shutdown-start');
            
            // Сохраняем состояние
            await this.saveApplicationState();
            
            // Уничтожаем контроллеры
            for (const [name, controller] of this.controllers) {
                if (typeof controller.destroy === 'function') {
                    controller.destroy();
                }
            }
            
            // Уничтожаем сервисы
            if (this.container && typeof this.container.destroy === 'function') {
                this.container.destroy();
            }
            
            // Очищаем обработчики событий
            this.eventHandlers.clear();
            
            this.emit('app:shutdown-complete');
            
        } catch (error) {
            console.error('Ошибка при завершении работы приложения:', error);
        }
    }

    /**
     * Сохранение состояния приложения
     */
    async saveApplicationState() {
        try {
            const stateToSave = {
                lastRoute: this.currentRoute?.path,
                timestamp: Date.now(),
                userPreferences: this.state.user?.preferences
            };
            
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.set({ applicationState: stateToSave });
            }
            
        } catch (error) {
            console.warn('Ошибка сохранения состояния приложения:', error);
        }
    }
}

// Создаём и экспортируем глобальный экземпляр
const applicationController = new ApplicationController();

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ApplicationController, applicationController };
} else {
    window.ApplicationController = ApplicationController;
    window.applicationController = applicationController;
}

// Автоматическое завершение работы при закрытии страницы
window.addEventListener('beforeunload', () => {
    applicationController.shutdown();
});