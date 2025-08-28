/**
 * DIContainer - простой Dependency Injection контейнер
 * Управляет зависимостями между сервисами и компонентами
 */

class DIContainer {
    constructor() {
        // Реестр сервисов
        this.services = new Map();
        this.factories = new Map();
        this.instances = new Map();
        
        // Конфигурация сервисов
        this.serviceConfig = new Map();
        
        // Граф зависимостей для отслеживания циклических зависимостей
        this.dependencyGraph = new Map();
        
        // Статус инициализации
        this.initialized = false;
        
        this.setupCoreServices();
    }

    /**
     * Настройка базовых сервисов
     */
    setupCoreServices() {
        // Регистрируем базовые сервисы
        this.registerFactory('ConfigService', () => {
            // ВАЖНО: Всегда используем глобальный ConfigService если он есть
            if (window.configService) {
                return window.configService;
            }
            
            // Если глобального нет, создаем новый и делаем его глобальным
            const configService = new ConfigService();
            
            // Автоматически загружаем настройки из Chrome Storage
            if (typeof chrome !== 'undefined' && chrome.storage) {
                configService.loadFromStorage(chrome.storage).catch(error => {
                    console.warn('Не удалось загрузить настройки из Chrome Storage:', error);
                });
            }
            
            // Делаем его глобальным
            window.configService = configService;
            
            return configService;
        }, { singleton: true, dependencies: [] });

        this.registerFactory('ValidationService', () => {
            return new ValidationService();
        }, { singleton: true, dependencies: [] });

        this.registerFactory('ErrorHandlingService', (container) => {
            const configService = container.get('ConfigService');
            return new ErrorHandlingService(configService);
        }, { singleton: true, dependencies: ['ConfigService'] });

        this.registerFactory('Database', () => {
            // Используем глобальный экземпляр db, если он существует, иначе создаем новый
            if (typeof window !== 'undefined' && window.db) {
                return window.db;
            }
            if (typeof NeocenkaDB !== 'undefined') {
                const db = new NeocenkaDB();
                // Инициализируем базу данных асинхронно в фоне
                setTimeout(() => {
                    db.init().catch(error => {
                        console.warn('⚠️ База данных не инициализирована:', error.message);
                    });
                }, 100);
                return db;
            }
            throw new Error('NeocenkaDB не загружен');
        }, { singleton: true, dependencies: [] });

        // Регистрируем legacy компоненты
        this.registerFactory('DataState', () => {
            if (typeof DataState !== 'undefined') {
                return new DataState();
            }
            throw new Error('DataState не загружен');
        }, { singleton: true, dependencies: [] });

        this.registerFactory('EventBus', () => {
            if (typeof EventBus !== 'undefined') {
                return new EventBus();
            }
            throw new Error('EventBus не загружен');
        }, { singleton: true, dependencies: [] });

        this.registerFactory('GlobalErrorReporter', (container) => {
            const errorHandler = container.get('ErrorHandlingService');
            const configService = container.get('ConfigService');
            return new GlobalErrorReporter(errorHandler, configService);
        }, { singleton: true, dependencies: ['ErrorHandlingService', 'ConfigService'] });

        // Data Services
        this.registerFactory('SegmentService', (container) => {
            if (typeof SegmentService === 'undefined') {
                throw new Error('SegmentService не загружен');
            }
            const database = container.get('Database');
            const validationService = container.get('ValidationService');
            const errorHandler = container.get('ErrorHandlingService');
            return new SegmentService(database, validationService, errorHandler);
        }, { singleton: true, dependencies: ['Database', 'ValidationService', 'ErrorHandlingService'] });

        this.registerFactory('ReferenceDataService', (container) => {
            if (typeof ReferenceDataService === 'undefined') {
                throw new Error('ReferenceDataService не загружен');
            }
            const database = container.get('Database');
            const configService = container.get('ConfigService');
            const errorHandler = container.get('ErrorHandlingService');
            return new ReferenceDataService(database, configService, errorHandler);
        }, { singleton: true, dependencies: ['Database', 'ConfigService', 'ErrorHandlingService'] });

        // UI Components
        this.registerFactory('SegmentModal', (container) => {
            if (typeof SegmentModal === 'undefined') {
                throw new Error('SegmentModal не загружен');
            }
            const validationService = container.get('ValidationService');
            const configService = container.get('ConfigService');
            return new SegmentModal(validationService, configService);
        }, { singleton: true, dependencies: ['ValidationService', 'ConfigService'] });

        // SegmentTable отключен - используется legacy версия из SegmentsManager  
        /*
        this.registerFactory('SegmentTable', (container) => {
            if (typeof SegmentTable === 'undefined') {
                throw new Error('SegmentTable не загружен');
            }
            const configService = container.get('ConfigService');
            const validationService = container.get('ValidationService');
            return new SegmentTable(configService, validationService);
        }, { singleton: true, dependencies: ['ConfigService', 'ValidationService'] });
        */

        this.registerFactory('SegmentChart', (container) => {
            if (typeof SegmentChart === 'undefined') {
                throw new Error('SegmentChart не загружен');
            }
            const configService = container.get('ConfigService');
            return new SegmentChart(configService);
        }, { singleton: true, dependencies: ['ConfigService'] });

        // Map Components
        this.registerFactory('MapRenderer', (container) => {
            if (typeof MapRenderer === 'undefined') {
                throw new Error('MapRenderer не загружен');
            }
            const configService = container.get('ConfigService');
            const errorHandler = container.get('ErrorHandlingService');
            return new MapRenderer(configService, errorHandler);
        }, { singleton: true, dependencies: ['ConfigService', 'ErrorHandlingService'] });

        this.registerFactory('MarkerManager', (container) => {
            if (typeof MarkerManager === 'undefined') {
                throw new Error('MarkerManager не загружен');
            }
            const mapRenderer = container.has('MapRenderer') ? container.get('MapRenderer') : null;
            const configService = container.get('ConfigService');
            const errorHandler = container.has('ErrorHandlingService') ? container.get('ErrorHandlingService') : null;
            return new MarkerManager(mapRenderer, configService, errorHandler);
        }, { singleton: true, dependencies: ['ConfigService'] });

        // AI Services - Универсальные AI сервисы
        this.registerFactory('UniversalAIService', (container) => {
            if (typeof UniversalAIService === 'undefined') {
                throw new Error('UniversalAIService не загружен');
            }
            return new UniversalAIService(container);
        }, { singleton: true, dependencies: ['ConfigService', 'ErrorHandlingService', 'EventBus'] });

        // AI Analysis Services - Специализированные сервисы анализа
        this.registerFactory('AIAreaAnalysisService', (container) => {
            if (typeof AIAreaAnalysisService === 'undefined') {
                throw new Error('AIAreaAnalysisService не загружен');
            }
            const service = new AIAreaAnalysisService(container);
            // Инициализация будет вызвана асинхронно при первом использовании
            return service;
        }, { singleton: true, dependencies: ['UniversalAIService', 'ConfigService'] });

        // AI провайдеры регистрируются автоматически через LLMProviderFactory
        // Базовые классы должны быть доступны глобально для фабрики
        this.registerFactory('LLMProviderFactory', () => {
            if (typeof window !== 'undefined' && window.llmProviderFactory) {
                return window.llmProviderFactory;
            }
            if (typeof LLMProviderFactory !== 'undefined') {
                return new LLMProviderFactory();
            }
            throw new Error('LLMProviderFactory не загружен');
        }, { singleton: true, dependencies: [] });

        // AI UI Components - Компоненты интерфейса AI чата
        this.registerFactory('AIChatInterface', (container) => {
            if (typeof AIChatInterface === 'undefined') {
                throw new Error('AIChatInterface не загружен');
            }
            // AIChatInterface сам найдет подходящий контейнер для UI
            const uiContainer = document.body;
            return new AIChatInterface(uiContainer, container);
        }, { singleton: true, dependencies: ['EventBus', 'ConfigService', 'UniversalAIService'] });
    }

    /**
     * Регистрация фабрики сервиса
     * @param {string} name - имя сервиса
     * @param {function} factory - фабрика создания сервиса
     * @param {object} config - конфигурация сервиса
     */
    registerFactory(name, factory, config = {}) {
        this.factories.set(name, factory);
        this.serviceConfig.set(name, {
            singleton: config.singleton !== false, // По умолчанию singleton
            dependencies: config.dependencies || [],
            initialized: false,
            lazy: config.lazy !== false // По умолчанию lazy loading
        });
        
        // Обновляем граф зависимостей
        this.dependencyGraph.set(name, config.dependencies || []);
        
        return this;
    }

    /**
     * Регистрация готового экземпляра сервиса
     * @param {string} name - имя сервиса
     * @param {object} instance - экземпляр сервиса
     */
    registerInstance(name, instance) {
        this.instances.set(name, instance);
        this.serviceConfig.set(name, {
            singleton: true,
            dependencies: [],
            initialized: true,
            lazy: false
        });
        
        this.dependencyGraph.set(name, []);
        
        return this;
    }

    /**
     * Получение сервиса по имени
     * @param {string} name - имя сервиса
     * @returns {object} экземпляр сервиса
     */
    get(name) {
        try {
            // Проверяем готовый экземпляр
            if (this.instances.has(name)) {
                return this.instances.get(name);
            }

            // Проверяем конфигурацию
            const config = this.serviceConfig.get(name);
            if (!config) {
                throw new Error(`Сервис '${name}' не зарегистрирован`);
            }

            // Если singleton и уже создан
            if (config.singleton && this.instances.has(name)) {
                return this.instances.get(name);
            }

            // Создаём новый экземпляр
            return this.createService(name);

        } catch (error) {
            console.error(`Ошибка получения сервиса '${name}':`, error);
            throw error;
        }
    }

    /**
     * Создание экземпляра сервиса
     * @private
     */
    createService(name, creationStack = new Set()) {
        // Проверка циклических зависимостей
        if (creationStack.has(name)) {
            const cycle = Array.from(creationStack).join(' -> ') + ' -> ' + name;
            throw new Error(`Обнаружена циклическая зависимость: ${cycle}`);
        }

        creationStack.add(name);

        try {
            const factory = this.factories.get(name);
            if (!factory) {
                throw new Error(`Фабрика для сервиса '${name}' не найдена`);
            }

            const config = this.serviceConfig.get(name);
            
            // Создаём зависимости
            const dependencies = {};
            for (const depName of config.dependencies) {
                if (creationStack.has(depName)) {
                    // Пропускаем циклические зависимости, они будут инициализированы позже
                    continue;
                }
                dependencies[depName] = this.createService(depName, new Set(creationStack));
            }

            // Создаём экземпляр сервиса
            const instance = factory.call(null, this, dependencies);

            // Сохраняем экземпляр для singleton
            if (config.singleton) {
                this.instances.set(name, instance);
            }

            // Отмечаем как инициализированный
            config.initialized = true;

            return instance;

        } finally {
            creationStack.delete(name);
        }
    }

    /**
     * Проверка наличия сервиса
     * @param {string} name - имя сервиса
     * @returns {boolean}
     */
    has(name) {
        return this.factories.has(name) || this.instances.has(name);
    }

    /**
     * Получение списка всех зарегистрированных сервисов
     * @returns {string[]}
     */
    getRegisteredServices() {
        const fromFactories = Array.from(this.factories.keys());
        const fromInstances = Array.from(this.instances.keys());
        return [...new Set([...fromFactories, ...fromInstances])];
    }

    /**
     * Инициализация всех сервисов
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Проверяем граф зависимостей на циклы
            this.validateDependencyGraph();

            // Получаем порядок инициализации
            const initOrder = this.getInitializationOrder();

            // Инициализируем сервисы в правильном порядке
            for (const serviceName of initOrder) {
                const config = this.serviceConfig.get(serviceName);
                if (config && !config.lazy && !config.initialized) {
                    this.get(serviceName);
                }
            }

            // Инициализируем асинхронные сервисы
            await this.initializeAsyncServices();

            this.initialized = true;

        } catch (error) {
            console.error('Ошибка инициализации DI контейнера:', error);
            throw error;
        }
    }

    /**
     * Валидация графа зависимостей на циклические ссылки
     * @private
     */
    validateDependencyGraph() {
        const visited = new Set();
        const recursionStack = new Set();

        const hasCycle = (node) => {
            if (recursionStack.has(node)) {
                return true;
            }
            if (visited.has(node)) {
                return false;
            }

            visited.add(node);
            recursionStack.add(node);

            const dependencies = this.dependencyGraph.get(node) || [];
            for (const dep of dependencies) {
                if (hasCycle(dep)) {
                    return true;
                }
            }

            recursionStack.delete(node);
            return false;
        };

        for (const service of this.dependencyGraph.keys()) {
            if (hasCycle(service)) {
                throw new Error(`Обнаружена циклическая зависимость в сервисе: ${service}`);
            }
        }
    }

    /**
     * Получение порядка инициализации сервисов (топологическая сортировка)
     * @private
     */
    getInitializationOrder() {
        const visited = new Set();
        const result = [];

        const visit = (node) => {
            if (visited.has(node)) {
                return;
            }

            visited.add(node);
            const dependencies = this.dependencyGraph.get(node) || [];
            
            for (const dep of dependencies) {
                visit(dep);
            }

            result.push(node);
        };

        for (const service of this.dependencyGraph.keys()) {
            visit(service);
        }

        return result;
    }

    /**
     * Инициализация асинхронных сервисов
     * @private
     */
    async initializeAsyncServices() {
        const promises = [];

        for (const [name, instance] of this.instances.entries()) {
            if (instance && typeof instance.initialize === 'function') {
                promises.push(
                    instance.initialize().catch(error => {
                        console.error(`Ошибка инициализации сервиса '${name}':`, error);
                    })
                );
            }
        }

        await Promise.all(promises);
    }

    /**
     * Создание дочернего контейнера (scoped container)
     * @returns {DIContainer}
     */
    createChild() {
        const child = new DIContainer();
        
        // Копируем фабрики и конфигурации из родительского контейнера
        this.factories.forEach((factory, name) => {
            child.factories.set(name, factory);
        });
        
        this.serviceConfig.forEach((config, name) => {
            child.serviceConfig.set(name, { ...config });
        });
        
        this.dependencyGraph.forEach((deps, name) => {
            child.dependencyGraph.set(name, [...deps]);
        });

        // Singleton сервисы наследуются от родителя
        this.instances.forEach((instance, name) => {
            const config = this.serviceConfig.get(name);
            if (config && config.singleton) {
                child.instances.set(name, instance);
            }
        });

        return child;
    }

    /**
     * Принудительная пересборка сервиса
     * @param {string} name - имя сервиса
     */
    rebuild(name) {
        if (this.instances.has(name)) {
            // Уничтожаем старый экземпляр
            const instance = this.instances.get(name);
            if (instance && typeof instance.destroy === 'function') {
                try {
                    instance.destroy();
                } catch (error) {
                    console.warn(`Ошибка уничтожения сервиса '${name}':`, error);
                }
            }

            this.instances.delete(name);
            
            const config = this.serviceConfig.get(name);
            if (config) {
                config.initialized = false;
            }
        }

        // Пересоздаём сервис
        return this.get(name);
    }

    /**
     * Получение информации о состоянии контейнера
     * @returns {object}
     */
    getState() {
        const state = {
            initialized: this.initialized,
            registeredServices: this.getRegisteredServices().length,
            initializedServices: this.instances.size,
            services: {}
        };

        // Добавляем информацию о каждом сервисе
        for (const [name, config] of this.serviceConfig.entries()) {
            state.services[name] = {
                initialized: config.initialized,
                singleton: config.singleton,
                lazy: config.lazy,
                dependencies: config.dependencies,
                hasInstance: this.instances.has(name)
            };
        }

        return state;
    }

    /**
     * Создание декоратора для автоматического внедрения зависимостей
     * @param {string[]} dependencies - массив имён зависимостей
     * @returns {function}
     */
    createDecorator(dependencies) {
        return (target) => {
            const original = target;
            
            const decorated = function(...args) {
                const injected = dependencies.map(dep => this.get(dep));
                return new original(...injected, ...args);
            };

            decorated.prototype = original.prototype;
            return decorated.bind(this);
        };
    }

    /**
     * Middleware для обработки ошибок сервисов
     * @param {function} errorHandler - обработчик ошибок
     */
    setErrorHandler(errorHandler) {
        this.errorHandler = errorHandler;
    }

    /**
     * Регистрация конфигурации для нескольких сервисов
     * @param {object} config - конфигурация сервисов
     */
    configure(config) {
        Object.entries(config).forEach(([name, serviceConfig]) => {
            if (serviceConfig.factory) {
                this.registerFactory(name, serviceConfig.factory, serviceConfig);
            } else if (serviceConfig.instance) {
                this.registerInstance(name, serviceConfig.instance);
            }
        });

        return this;
    }

    /**
     * Получение метрик производительности
     * @returns {object}
     */
    getMetrics() {
        const metrics = {
            totalServices: this.getRegisteredServices().length,
            initializedServices: this.instances.size,
            memoryUsage: this.calculateMemoryUsage(),
            dependencyDepth: this.calculateMaxDependencyDepth()
        };

        return metrics;
    }

    /**
     * Примерный расчёт использования памяти
     * @private
     */
    calculateMemoryUsage() {
        // Простая эвристика для оценки использования памяти
        let size = 0;
        
        this.instances.forEach((instance, name) => {
            size += this.estimateObjectSize(instance);
        });

        return {
            estimated: size,
            unit: 'bytes',
            instanceCount: this.instances.size
        };
    }

    /**
     * Примерная оценка размера объекта
     * @private
     */
    estimateObjectSize(obj) {
        let size = 0;
        
        try {
            const serialized = JSON.stringify(obj);
            size = serialized.length * 2; // Примерно 2 байта на символ
        } catch (error) {
            size = 1000; // Fallback для несериализуемых объектов
        }

        return size;
    }

    /**
     * Вычисление максимальной глубины зависимостей
     * @private
     */
    calculateMaxDependencyDepth() {
        let maxDepth = 0;

        const getDepth = (serviceName, visited = new Set()) => {
            if (visited.has(serviceName)) {
                return 0; // Избегаем циклов
            }

            visited.add(serviceName);
            const dependencies = this.dependencyGraph.get(serviceName) || [];
            
            if (dependencies.length === 0) {
                return 1;
            }

            let maxChildDepth = 0;
            for (const dep of dependencies) {
                const depth = getDepth(dep, new Set(visited));
                maxChildDepth = Math.max(maxChildDepth, depth);
            }

            return maxChildDepth + 1;
        };

        for (const serviceName of this.dependencyGraph.keys()) {
            const depth = getDepth(serviceName);
            maxDepth = Math.max(maxDepth, depth);
        }

        return maxDepth;
    }

    /**
     * Очистка и уничтожение всех сервисов
     */
    destroy() {
        // Уничтожаем все созданные экземпляры
        this.instances.forEach((instance, name) => {
            if (instance && typeof instance.destroy === 'function') {
                try {
                    instance.destroy();
                } catch (error) {
                    console.warn(`Ошибка уничтожения сервиса '${name}':`, error);
                }
            }
        });

        // Очищаем все данные
        this.services.clear();
        this.factories.clear();
        this.instances.clear();
        this.serviceConfig.clear();
        this.dependencyGraph.clear();

        this.initialized = false;
    }
}

// Создаём глобальный экземпляр контейнера
const diContainer = new DIContainer();

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DIContainer, diContainer };
} else {
    window.DIContainer = DIContainer;
    window.diContainer = diContainer;
}