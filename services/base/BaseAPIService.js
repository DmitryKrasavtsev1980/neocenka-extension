/**
 * Базовый класс для всех API сервисов
 * Обеспечивает общую функциональность: rate limiting, error handling, authentication
 */
class BaseAPIService {
    constructor(config = {}) {
        this.name = config.name || 'BaseAPIService';
        this.baseURL = config.baseURL || '';
        this.timeout = config.timeout || 30000;
        this.retryAttempts = config.retryAttempts || 3;
        this.retryDelay = config.retryDelay || 1000;
        
        // Rate limiting config
        this.rateLimit = {
            requests: config.rateLimit?.requests || 10,
            window: config.rateLimit?.window || 60000, // 1 minute
            queue: []
        };
        
        // Authentication
        this.auth = config.auth || null;
        
        // Request interceptors
        this.requestInterceptors = [];
        this.responseInterceptors = [];
        
        // Event emitter for service events
        this.listeners = new Map();
        
        this.initializeService();
    }

    /**
     * Инициализация сервиса
     */
    async initializeService() {
        this.emit('service:initializing', { service: this.name });
        
        try {
            await this.onInitialize();
            this.emit('service:initialized', { service: this.name });
        } catch (error) {
            this.emit('service:error', { service: this.name, error });
            throw error;
        }
    }

    /**
     * Переопределяется в дочерних классах для специфичной инициализации
     */
    async onInitialize() {
        // Переопределить в дочерних классах
    }

    /**
     * Основной метод для выполнения HTTP запросов
     */
    async request(endpoint, options = {}) {
        const url = this.buildURL(endpoint);
        const config = this.buildRequestConfig(options);
        
        return await this.executeWithRateLimit(() => 
            this.executeWithRetry(() => this.performRequest(url, config))
        );
    }

    /**
     * Выполнение запроса с соблюдением rate limit
     */
    async executeWithRateLimit(requestFn) {
        return new Promise((resolve, reject) => {
            this.rateLimit.queue.push({
                execute: requestFn,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            this.processRateLimitQueue();
        });
    }

    /**
     * Обработка очереди с rate limiting
     */
    processRateLimitQueue() {
        if (this.rateLimit.queue.length === 0) return;
        
        const now = Date.now();
        const windowStart = now - this.rateLimit.window;
        
        // Удаляем старые записи из истории
        this.rateLimit.history = (this.rateLimit.history || [])
            .filter(timestamp => timestamp > windowStart);
        
        // Проверяем, можем ли выполнить запрос
        if (this.rateLimit.history.length < this.rateLimit.requests) {
            const request = this.rateLimit.queue.shift();
            this.rateLimit.history.push(now);
            
            request.execute()
                .then(request.resolve)
                .catch(request.reject);
            
            // Планируем обработку следующего запроса
            if (this.rateLimit.queue.length > 0) {
                setTimeout(() => this.processRateLimitQueue(), 100);
            }
        } else {
            // Ждем до освобождения слота
            const oldestRequest = this.rateLimit.history[0];
            const waitTime = oldestRequest + this.rateLimit.window - now + 100;
            
            setTimeout(() => this.processRateLimitQueue(), waitTime);
        }
    }

    /**
     * Выполнение запроса с повторными попытками
     */
    async executeWithRetry(requestFn, attempt = 1) {
        try {
            return await requestFn();
        } catch (error) {
            if (attempt >= this.retryAttempts) {
                throw error;
            }
            
            const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
            await this.sleep(delay);
            
            return this.executeWithRetry(requestFn, attempt + 1);
        }
    }

    /**
     * Выполнение HTTP запроса
     */
    async performRequest(url, config) {
        this.emit('request:start', { url, config });
        
        try {
            // Применяем request interceptors
            for (const interceptor of this.requestInterceptors) {
                config = await interceptor(config) || config;
            }
            
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            let data = await response.json();
            
            // Применяем response interceptors
            for (const interceptor of this.responseInterceptors) {
                data = await interceptor(data, response) || data;
            }
            
            this.emit('request:success', { url, data });
            return data;
            
        } catch (error) {
            this.emit('request:error', { url, error });
            throw error;
        }
    }

    /**
     * Построение URL
     */
    buildURL(endpoint) {
        if (endpoint.startsWith('http')) {
            return endpoint;
        }
        
        const base = this.baseURL.endsWith('/') ? this.baseURL.slice(0, -1) : this.baseURL;
        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        
        return `${base}${path}`;
    }

    /**
     * Построение конфигурации запроса
     */
    buildRequestConfig(options) {
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers
            },
            ...options
        };
        
        // Добавляем аутентификацию
        if (this.auth) {
            if (this.auth.type === 'bearer') {
                config.headers['Authorization'] = `Bearer ${this.auth.token}`;
            } else if (this.auth.type === 'basic') {
                config.headers['Authorization'] = `Basic ${btoa(this.auth.username + ':')}`;
            } else if (this.auth.type === 'apikey') {
                config.headers[this.auth.header || 'X-API-Key'] = this.auth.key;
            }
        }
        
        // Добавляем тело запроса
        if (config.method !== 'GET' && options.data) {
            if (typeof options.data === 'object') {
                config.body = JSON.stringify(options.data);
            } else {
                config.body = options.data;
            }
        }
        
        return config;
    }

    /**
     * Добавление request interceptor
     */
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
    }

    /**
     * Добавление response interceptor
     */
    addResponseInterceptor(interceptor) {
        this.responseInterceptors.push(interceptor);
    }

    /**
     * Event emitter functionality
     */
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(listener);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Утилиты
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            name: this.name,
            baseURL: this.baseURL,
            isInitialized: true,
            queueLength: this.rateLimit.queue.length,
            requestsInWindow: (this.rateLimit.history || []).length,
            rateLimit: this.rateLimit.requests
        };
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        this.rateLimit.queue = [];
        this.rateLimit.history = [];
        this.listeners.clear();
        this.emit('service:destroyed', { service: this.name });
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BaseAPIService;
}