/**
 * ErrorHandlingService - централизованная обработка ошибок
 * Заменяет разбросанную по коду обработку ошибок единым сервисом
 */

class ErrorHandlingService {
    constructor(configService) {
        this.configService = configService;
        this.errorQueue = [];
        this.errorHistory = [];
        this.listeners = new Map();
        this.retryAttempts = new Map();
        
        // Настройка обработчиков по умолчанию
        this.setupDefaultHandlers();
        
        // Инициализация глобального обработчика
        this.setupGlobalErrorHandler();
        
        // Периодическая очистка истории
        setInterval(() => this.cleanupHistory(), 300000); // 5 минут
    }

    /**
     * Настройка обработчиков по умолчанию
     */
    setupDefaultHandlers() {
        // Обработчики по типам ошибок
        this.handlers = new Map([
            ['network', this.handleNetworkError.bind(this)],
            ['database', this.handleDatabaseError.bind(this)],
            ['validation', this.handleValidationError.bind(this)],
            ['parsing', this.handleParsingError.bind(this)],
            ['ui', this.handleUIError.bind(this)],
            ['permission', this.handlePermissionError.bind(this)],
            ['unknown', this.handleUnknownError.bind(this)]
        ]);

        // Конфигурация retry логики
        this.retryConfig = new Map([
            ['network', { maxAttempts: 3, delay: 1000, backoff: 2 }],
            ['database', { maxAttempts: 2, delay: 500, backoff: 1.5 }],
            ['parsing', { maxAttempts: 1, delay: 0, backoff: 1 }],
            ['ui', { maxAttempts: 0, delay: 0, backoff: 1 }]
        ]);
    }

    /**
     * Главный метод обработки ошибок
     * @param {Error|string} error - ошибка или сообщение
     * @param {object} context - контекст ошибки
     * @returns {Promise<ErrorResult>}
     */
    async handleError(error, context = {}) {
        try {
            // Нормализация ошибки
            const normalizedError = this.normalizeError(error, context);
            
            // Добавляем в историю
            this.addToHistory(normalizedError);
            
            // Определяем тип ошибки
            const errorType = this.classifyError(normalizedError);
            
            // Проверяем нужно ли retry
            const shouldRetry = this.shouldRetry(normalizedError, errorType);
            
            // Получаем обработчик
            const handler = this.handlers.get(errorType) || this.handlers.get('unknown');
            
            // Обрабатываем ошибку
            const result = await handler(normalizedError, context);
            
            // Уведомляем слушателей
            this.notifyListeners('error', { error: normalizedError, result, context });
            
            // Логирование если включено
            this.logError(normalizedError, context, result);
            
            return {
                ...result,
                errorType,
                canRetry: shouldRetry,
                errorId: normalizedError.id
            };
            
        } catch (handlingError) {
            // Если сам обработчик ошибок сломался
            console.error('Критическая ошибка в ErrorHandlingService:', handlingError);
            return {
                handled: false,
                shouldRetry: false,
                userMessage: 'Произошла критическая ошибка',
                canRetry: false
            };
        }
    }

    /**
     * Нормализация ошибки к единому формату
     */
    normalizeError(error, context) {
        const timestamp = new Date();
        const id = this.generateErrorId();

        if (error instanceof Error) {
            return {
                id,
                name: error.name,
                message: error.message,
                stack: error.stack,
                timestamp,
                context: { ...context },
                original: error
            };
        }

        if (typeof error === 'string') {
            return {
                id,
                name: 'GenericError',
                message: error,
                stack: null,
                timestamp,
                context: { ...context },
                original: error
            };
        }

        if (typeof error === 'object' && error !== null) {
            return {
                id,
                name: error.name || 'ObjectError',
                message: error.message || JSON.stringify(error),
                stack: error.stack || null,
                timestamp,
                context: { ...context },
                original: error
            };
        }

        return {
            id,
            name: 'UnknownError',
            message: String(error),
            stack: null,
            timestamp,
            context: { ...context },
            original: error
        };
    }

    /**
     * Классификация типа ошибки
     */
    classifyError(error) {
        const message = error.message.toLowerCase();
        const name = error.name.toLowerCase();
        
        // Network errors
        if (name.includes('network') || 
            message.includes('fetch') || 
            message.includes('connection') ||
            message.includes('timeout') ||
            name.includes('typeerror') && message.includes('failed to fetch')) {
            return 'network';
        }

        // Database errors
        if (name.includes('database') ||
            message.includes('indexeddb') ||
            message.includes('transaction') ||
            message.includes('objectstore')) {
            return 'database';
        }

        // Validation errors
        if (name.includes('validation') ||
            message.includes('invalid') ||
            message.includes('required') ||
            message.includes('валидация')) {
            return 'validation';
        }

        // Parsing errors
        if (name.includes('syntax') ||
            name.includes('parse') ||
            message.includes('unexpected token') ||
            message.includes('json') ||
            error.context?.source === 'parser') {
            return 'parsing';
        }

        // Permission errors
        if (name.includes('permission') ||
            message.includes('access denied') ||
            message.includes('forbidden') ||
            message.includes('unauthorized')) {
            return 'permission';
        }

        // UI errors
        if (message.includes('element') ||
            message.includes('dom') ||
            message.includes('querySelector') ||
            error.context?.component) {
            return 'ui';
        }

        return 'unknown';
    }

    /**
     * Обработка сетевых ошибок
     */
    async handleNetworkError(error, context) {
        const userMessages = {
            'connection': 'Проблемы с подключением к интернету',
            'timeout': 'Превышено время ожидания ответа',
            'fetch': 'Ошибка загрузки данных',
            'default': 'Сетевая ошибка'
        };

        let messageType = 'default';
        const message = error.message.toLowerCase();
        
        if (message.includes('timeout')) messageType = 'timeout';
        else if (message.includes('connection')) messageType = 'connection';
        else if (message.includes('fetch')) messageType = 'fetch';

        return {
            handled: true,
            severity: 'medium',
            userMessage: userMessages[messageType],
            shouldRetry: true,
            retryDelay: 2000,
            actions: ['retry', 'skip'],
            suggestions: [
                'Проверьте подключение к интернету',
                'Попробуйте повторить операцию',
                'Обратитесь к администратору, если проблема повторяется'
            ]
        };
    }

    /**
     * Обработка ошибок базы данных
     */
    async handleDatabaseError(error, context) {
        const userMessages = {
            'quota': 'Недостаточно места для хранения данных',
            'transaction': 'Ошибка выполнения операции с базой данных',
            'version': 'Конфликт версий базы данных',
            'access': 'Нет доступа к базе данных',
            'default': 'Ошибка базы данных'
        };

        let messageType = 'default';
        const message = error.message.toLowerCase();
        
        if (message.includes('quota')) messageType = 'quota';
        else if (message.includes('transaction')) messageType = 'transaction';
        else if (message.includes('version')) messageType = 'version';
        else if (message.includes('access') || message.includes('blocked')) messageType = 'access';

        const severity = messageType === 'quota' ? 'high' : 'medium';
        
        return {
            handled: true,
            severity,
            userMessage: userMessages[messageType],
            shouldRetry: messageType !== 'quota',
            retryDelay: 1000,
            actions: messageType === 'quota' ? ['cleanup', 'contact_support'] : ['retry', 'reload'],
            suggestions: this.getDatabaseErrorSuggestions(messageType)
        };
    }

    /**
     * Обработка ошибок валидации
     */
    async handleValidationError(error, context) {
        return {
            handled: true,
            severity: 'low',
            userMessage: error.message || 'Данные не прошли валидацию',
            shouldRetry: false,
            actions: ['fix_data'],
            suggestions: [
                'Проверьте правильность введённых данных',
                'Убедитесь, что все обязательные поля заполнены',
                'Обратитесь к справке для уточнения формата данных'
            ]
        };
    }

    /**
     * Обработка ошибок парсинга
     */
    async handleParsingError(error, context) {
        return {
            handled: true,
            severity: 'medium',
            userMessage: 'Ошибка обработки данных с сайта',
            shouldRetry: false,
            actions: ['skip', 'manual_entry'],
            suggestions: [
                'Возможно, изменилась структура сайта',
                'Попробуйте обновить расширение',
                'Введите данные вручную или обратитесь к разработчикам'
            ]
        };
    }

    /**
     * Обработка UI ошибок
     */
    async handleUIError(error, context) {
        return {
            handled: true,
            severity: 'low',
            userMessage: 'Ошибка интерфейса',
            shouldRetry: false,
            actions: ['reload_page', 'reset_view'],
            suggestions: [
                'Перезагрузите страницу',
                'Очистите кэш браузера',
                'Отключите и включите расширение'
            ]
        };
    }

    /**
     * Обработка ошибок доступа
     */
    async handlePermissionError(error, context) {
        return {
            handled: true,
            severity: 'high',
            userMessage: 'Недостаточно прав доступа',
            shouldRetry: false,
            actions: ['check_permissions', 'contact_support'],
            suggestions: [
                'Проверьте настройки расширения в браузере',
                'Убедитесь, что расширение имеет необходимые разрешения',
                'Обратитесь к администратору'
            ]
        };
    }

    /**
     * Обработка неизвестных ошибок
     */
    async handleUnknownError(error, context) {
        return {
            handled: true,
            severity: 'medium',
            userMessage: 'Произошла неожиданная ошибка',
            shouldRetry: true,
            retryDelay: 1000,
            actions: ['retry', 'reload', 'contact_support'],
            suggestions: [
                'Попробуйте повторить операцию',
                'Перезагрузите страницу',
                'Если проблема повторяется, обратитесь к разработчикам'
            ]
        };
    }

    /**
     * Проверка нужно ли делать retry
     */
    shouldRetry(error, errorType) {
        const retryConfig = this.retryConfig.get(errorType);
        if (!retryConfig || retryConfig.maxAttempts === 0) {
            return false;
        }

        const attempts = this.retryAttempts.get(error.id) || 0;
        return attempts < retryConfig.maxAttempts;
    }

    /**
     * Выполнение retry операции
     */
    async retry(errorId, operation) {
        const attempts = this.retryAttempts.get(errorId) || 0;
        const errorRecord = this.errorHistory.find(e => e.id === errorId);
        
        if (!errorRecord) {
            throw new Error('Error record not found for retry');
        }

        const errorType = this.classifyError(errorRecord);
        const retryConfig = this.retryConfig.get(errorType);
        
        if (!retryConfig || attempts >= retryConfig.maxAttempts) {
            throw new Error('Maximum retry attempts exceeded');
        }

        // Увеличиваем счетчик попыток
        this.retryAttempts.set(errorId, attempts + 1);

        // Вычисляем задержку с exponential backoff
        const delay = retryConfig.delay * Math.pow(retryConfig.backoff, attempts);
        
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        try {
            const result = await operation();
            // Успешно - сбрасываем счетчик
            this.retryAttempts.delete(errorId);
            return result;
        } catch (retryError) {
            // Обрабатываем ошибку retry
            return this.handleError(retryError, { 
                isRetry: true, 
                originalErrorId: errorId,
                attempt: attempts + 1 
            });
        }
    }

    /**
     * Настройка глобального обработчика ошибок
     */
    setupGlobalErrorHandler() {
        // Обработка необработанных ошибок
        if (typeof window !== 'undefined') {
            window.addEventListener('error', (event) => {
                this.handleError(event.error, {
                    source: 'global',
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                });
            });

            // Обработка необработанных promise rejections
            window.addEventListener('unhandledrejection', (event) => {
                this.handleError(event.reason, {
                    source: 'unhandled_promise',
                    promise: event.promise
                });
            });
        }
    }

    /**
     * Добавление слушателя событий ошибок
     */
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(listener);
    }

    /**
     * Удаление слушателя
     */
    removeEventListener(type, listener) {
        if (this.listeners.has(type)) {
            const listeners = this.listeners.get(type);
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Уведомление слушателей
     */
    notifyListeners(type, data) {
        if (this.listeners.has(type)) {
            this.listeners.get(type).forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error('Ошибка в обработчике событий ошибок:', error);
                }
            });
        }
    }

    /**
     * Добавление в историю ошибок
     */
    addToHistory(error) {
        this.errorHistory.unshift(error);
        
        // Ограничиваем размер истории
        const maxHistorySize = 100;
        if (this.errorHistory.length > maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(0, maxHistorySize);
        }
    }

    /**
     * Получение истории ошибок
     */
    getErrorHistory(limit = 50) {
        return this.errorHistory.slice(0, limit);
    }

    /**
     * Получение статистики ошибок
     */
    getErrorStatistics() {
        const now = Date.now();
        const hour = 60 * 60 * 1000;
        const day = 24 * hour;

        const lastHour = this.errorHistory.filter(e => 
            now - e.timestamp.getTime() < hour
        );
        
        const lastDay = this.errorHistory.filter(e => 
            now - e.timestamp.getTime() < day
        );

        const byType = {};
        this.errorHistory.forEach(error => {
            const type = this.classifyError(error);
            byType[type] = (byType[type] || 0) + 1;
        });

        return {
            total: this.errorHistory.length,
            lastHour: lastHour.length,
            lastDay: lastDay.length,
            byType,
            mostFrequent: Object.entries(byType)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
        };
    }

    /**
     * Очистка истории ошибок
     */
    cleanupHistory() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 часа
        
        this.errorHistory = this.errorHistory.filter(error => 
            now - error.timestamp.getTime() < maxAge
        );

        // Очищаем старые retry счетчики
        const activeErrors = new Set(this.errorHistory.map(e => e.id));
        for (const [errorId] of this.retryAttempts) {
            if (!activeErrors.has(errorId)) {
                this.retryAttempts.delete(errorId);
            }
        }
    }

    /**
     * Логирование ошибки
     */
    logError(error, context, result) {
        if (!this.configService?.isDebugEnabled()) {
            return;
        }

        const logLevel = this.configService?.get('security.debug.logLevel') || 'error';
        const shouldLog = ['error', 'warn', 'debug'].includes(logLevel);
        
        if (shouldLog) {
            const logData = {
                error: {
                    id: error.id,
                    type: this.classifyError(error),
                    message: error.message,
                    timestamp: error.timestamp
                },
                context,
                result: {
                    handled: result.handled,
                    severity: result.severity,
                    shouldRetry: result.shouldRetry
                }
            };

            // Сохраняем в storage вместо console для безопасности
            this.saveToStorage(logData);
        }
    }

    /**
     * Сохранение логов в storage
     */
    async saveToStorage(logData) {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const key = `error_log_${Date.now()}`;
                await chrome.storage.local.set({ [key]: logData });
            }
        } catch (error) {
            // Молчаливо игнорируем ошибки логирования
        }
    }

    /**
     * Генерация ID ошибки
     */
    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Получение рекомендаций для ошибок БД
     */
    getDatabaseErrorSuggestions(messageType) {
        switch (messageType) {
            case 'quota':
                return [
                    'Очистите данные приложения в настройках браузера',
                    'Удалите старые неиспользуемые области',
                    'Экспортируйте данные и начните с чистой базы'
                ];
            case 'version':
                return [
                    'Обновите расширение до последней версии',
                    'Перезапустите браузер',
                    'Сообщите разработчикам о проблеме'
                ];
            default:
                return [
                    'Попробуйте повторить операцию',
                    'Перезагрузите страницу',
                    'Проверьте доступность браузера'
                ];
        }
    }

    /**
     * Создание обёртки для функций с автоматической обработкой ошибок
     */
    createErrorWrapper(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                const result = await this.handleError(error, {
                    ...context,
                    function: fn.name,
                    arguments: args
                });
                
                if (result.shouldRetry && typeof fn.retry === 'function') {
                    return this.retry(result.errorId, () => fn.retry(...args));
                }
                
                throw error; // Пробрасываем дальше после обработки
            }
        };
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandlingService;
} else {
    window.ErrorHandlingService = ErrorHandlingService;
}