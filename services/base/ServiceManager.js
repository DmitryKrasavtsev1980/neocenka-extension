/**
 * Центральный менеджер сервисов
 * Управляет жизненным циклом всех сервисов в приложении
 */
class ServiceManager {
    constructor() {
        this.services = new Map();
        this.config = new Map();
        this.listeners = new Map();
        this.isInitialized = false;
        
        // Регистрируем глобальный обработчик ошибок
        this.setupGlobalErrorHandler();
    }

    /**
     * Регистрация сервиса
     */
    registerService(name, ServiceClass, config = {}) {
        if (this.services.has(name)) {
            throw new Error(`Service '${name}' is already registered`);
        }
        
        this.config.set(name, { ServiceClass, config });
        this.emit('service:registered', { name, config });
        
        return this;
    }

    /**
     * Инициализация всех зарегистрированных сервисов
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn('ServiceManager is already initialized');
            return;
        }
        
        this.emit('manager:initializing');
        
        try {
            // Инициализируем сервисы в порядке регистрации
            for (const [name, { ServiceClass, config }] of this.config) {
                await this.initializeService(name, ServiceClass, config);
            }
            
            this.isInitialized = true;
            this.emit('manager:initialized');
            
        } catch (error) {
            this.emit('manager:error', { error });
            throw error;
        }
    }

    /**
     * Инициализация отдельного сервиса
     */
    async initializeService(name, ServiceClass, config) {
        try {
            this.emit('service:initializing', { name });
            
            const serviceInstance = new ServiceClass({
                name,
                ...config
            });
            
            // Подписываемся на события сервиса
            this.setupServiceEventHandlers(name, serviceInstance);
            
            this.services.set(name, serviceInstance);
            this.emit('service:initialized', { name });
            
            return serviceInstance;
            
        } catch (error) {
            this.emit('service:error', { name, error });
            throw new Error(`Failed to initialize service '${name}': ${error.message}`);
        }
    }

    /**
     * Получение экземпляра сервиса
     */
    getService(name) {
        const service = this.services.get(name);
        
        if (!service) {
            throw new Error(`Service '${name}' is not registered or not initialized`);
        }
        
        return service;
    }

    /**
     * Проверка существования сервиса
     */
    hasService(name) {
        return this.services.has(name);
    }

    /**
     * Получение всех сервисов
     */
    getAllServices() {
        return Array.from(this.services.entries()).reduce((acc, [name, service]) => {
            acc[name] = service;
            return acc;
        }, {});
    }

    /**
     * Получение статуса всех сервисов
     */
    getServicesStatus() {
        const status = {
            manager: {
                isInitialized: this.isInitialized,
                servicesCount: this.services.size
            },
            services: {}
        };
        
        for (const [name, service] of this.services) {
            try {
                status.services[name] = service.getStatus ? service.getStatus() : { name, status: 'unknown' };
            } catch (error) {
                status.services[name] = { name, status: 'error', error: error.message };
            }
        }
        
        return status;
    }

    /**
     * Перезапуск сервиса
     */
    async restartService(name) {
        if (!this.config.has(name)) {
            throw new Error(`Service '${name}' is not registered`);
        }
        
        // Останавливаем сервис если он запущен
        if (this.services.has(name)) {
            await this.stopService(name);
        }
        
        // Инициализируем заново
        const { ServiceClass, config } = this.config.get(name);
        return await this.initializeService(name, ServiceClass, config);
    }

    /**
     * Остановка сервиса
     */
    async stopService(name) {
        const service = this.services.get(name);
        
        if (service) {
            try {
                if (typeof service.destroy === 'function') {
                    await service.destroy();
                }
                
                this.services.delete(name);
                this.emit('service:stopped', { name });
                
            } catch (error) {
                this.emit('service:error', { name, error });
                throw error;
            }
        }
    }

    /**
     * Остановка всех сервисов
     */
    async shutdown() {
        this.emit('manager:shutting_down');
        
        const shutdownPromises = [];
        
        for (const name of this.services.keys()) {
            shutdownPromises.push(this.stopService(name));
        }
        
        await Promise.allSettled(shutdownPromises);
        
        this.isInitialized = false;
        this.emit('manager:shutdown');
    }

    /**
     * Настройка обработчиков событий сервиса
     */
    setupServiceEventHandlers(name, service) {
        if (typeof service.on === 'function') {
            // Проксируем события сервиса через менеджер
            service.on('request:start', (data) => {
                this.emit('service:request:start', { service: name, ...data });
            });
            
            service.on('request:success', (data) => {
                this.emit('service:request:success', { service: name, ...data });
            });
            
            service.on('request:error', (data) => {
                this.emit('service:request:error', { service: name, ...data });
            });
            
            service.on('service:error', (data) => {
                this.emit('service:error', { service: name, ...data });
            });
        }
    }

    /**
     * Настройка глобального обработчика ошибок
     */
    setupGlobalErrorHandler() {
        this.on('service:error', ({ service, error }) => {
            console.error(`Service '${service}' error:`, error);
            
            // Здесь можно добавить логику для отправки ошибок в внешние системы мониторинга
        });
    }

    /**
     * Event emitter functionality
     */
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(listener);
        return this;
    }

    off(event, listener) {
        if (this.listeners.has(event)) {
            const listeners = this.listeners.get(event);
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
        return this;
    }

    emit(event, data = {}) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error in ServiceManager event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Создание легкого метода для быстрого доступа к сервисам
     */
    createServiceProxy() {
        return new Proxy(this, {
            get(target, prop) {
                if (typeof prop === 'string' && target.hasService(prop)) {
                    return target.getService(prop);
                }
                return target[prop];
            }
        });
    }

    /**
     * Конфигурация сервисов из объекта
     */
    static fromConfig(config) {
        const manager = new ServiceManager();
        
        for (const [name, serviceConfig] of Object.entries(config)) {
            const { service: ServiceClass, ...options } = serviceConfig;
            manager.registerService(name, ServiceClass, options);
        }
        
        return manager;
    }
}

// Singleton instance для глобального использования
let globalServiceManager = null;

/**
 * Получение глобального экземпляра ServiceManager
 */
function getServiceManager() {
    if (!globalServiceManager) {
        globalServiceManager = new ServiceManager();
    }
    return globalServiceManager;
}

/**
 * Установка глобального экземпляра ServiceManager
 */
function setServiceManager(manager) {
    globalServiceManager = manager;
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ServiceManager, getServiceManager, setServiceManager };
} else {
    // Для браузера добавляем в глобальную область
    window.ServiceManager = ServiceManager;
    window.getServiceManager = getServiceManager;
    window.setServiceManager = setServiceManager;
}