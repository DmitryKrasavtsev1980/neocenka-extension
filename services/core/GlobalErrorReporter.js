/**
 * GlobalErrorReporter - глобальная система мониторинга и отчётности об ошибках
 * Расширяет ErrorHandlingService функциональностью мониторинга и аналитики
 */

class GlobalErrorReporter {
    constructor(errorHandler, configService) {
        this.errorHandler = errorHandler;
        this.configService = configService;
        
        // Хранилище ошибок
        this.errorLog = [];
        this.sessionErrors = new Map(); // По типам ошибок
        this.performanceMetrics = {
            apiCalls: new Map(),
            userActions: new Map(),
            componentRenders: new Map()
        };
        
        // Конфигурация репортера
        this.config = this.getReporterConfig();
        
        // Состояние системы мониторинга
        this.monitoring = {
            enabled: true,
            healthCheckInterval: null,
            lastHealthCheck: null,
            systemHealth: 'healthy' // 'healthy', 'warning', 'critical'
        };
        
        // Очередь для отправки ошибок
        this.reportQueue = [];
        this.reportingInProgress = false;
        
        // Статистика сессии
        this.sessionStats = {
            startTime: Date.now(),
            errorsCount: 0,
            warningsCount: 0,
            userActions: 0,
            performanceIssues: 0
        };
        
        // Ограничение частоты отчётов
        this.lastLongTaskReport = null;
        
        this.initialize();
    }

    /**
     * Получение конфигурации репортера
     */
    getReporterConfig() {
        const config = this.configService?.get('errorReporting') || {};
        
        return {
            enabled: config.enabled !== false,
            logLevel: config.logLevel || 'warn', // 'error', 'warn', 'info', 'debug'
            maxLogEntries: config.maxLogEntries || 1000,
            
            // Конфигурация отправки отчётов
            reporting: {
                enabled: config.reporting?.enabled || false,
                endpoint: config.reporting?.endpoint || null,
                apiKey: config.reporting?.apiKey || null,
                batchSize: config.reporting?.batchSize || 10,
                flushInterval: config.reporting?.flushInterval || 300000 // 5 минут
            },
            
            // Конфигурация мониторинга здоровья
            healthCheck: {
                enabled: config.healthCheck?.enabled !== false,
                interval: config.healthCheck?.interval || 60000, // 1 минута
                thresholds: {
                    errorRate: config.healthCheck?.thresholds?.errorRate || 0.1, // 10% ошибок
                    responseTime: config.healthCheck?.thresholds?.responseTime || 5000, // 5 секунд
                    memoryUsage: config.healthCheck?.thresholds?.memoryUsage || 0.8 // 80% памяти
                }
            },
            
            // Фильтрация ошибок
            filters: {
                ignoreErrors: config.filters?.ignoreErrors || [],
                ignoreUrls: config.filters?.ignoreUrls || [],
                ignoreUserAgents: config.filters?.ignoreUserAgents || []
            },
            
            // Персональные данные
            privacy: {
                sanitizeData: config.privacy?.sanitizeData !== false,
                excludePersonalInfo: config.privacy?.excludePersonalInfo !== false
            }
        };
    }

    /**
     * Инициализация глобального репортера ошибок
     */
    async initialize() {
        try {
            // Настраиваем глобальные обработчики ошибок
            this.setupGlobalHandlers();
            
            // Расширяем стандартный ErrorHandlingService
            this.enhanceErrorHandler();
            
            // Запускаем мониторинг здоровья системы
            if (this.config.healthCheck.enabled) {
                this.startHealthMonitoring();
            }
            
            // Настраиваем автоматическую отправку отчётов
            if (this.config.reporting.enabled) {
                this.setupReportingScheduler();
            }
            
            // Настраиваем мониторинг производительности
            this.setupPerformanceMonitoring();
            
            console.log('GlobalErrorReporter инициализирован');

        } catch (error) {
            console.error('Ошибка инициализации GlobalErrorReporter:', error);
        }
    }

    /**
     * Настройка глобальных обработчиков ошибок
     */
    setupGlobalHandlers() {
        // Обработчик необработанных JavaScript ошибок
        window.addEventListener('error', (event) => {
            this.handleGlobalError({
                type: 'javascript',
                message: event.message,
                source: event.filename,
                line: event.lineno,
                column: event.colno,
                error: event.error,
                stack: event.error?.stack
            });
        });

        // Обработчик необработанных Promise rejection
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError({
                type: 'promise',
                message: event.reason?.message || 'Unhandled Promise Rejection',
                error: event.reason,
                stack: event.reason?.stack
            });
        });

        // Обработчик ошибок Extension API
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onConnect.addListener((port) => {
                port.onDisconnect.addListener(() => {
                    if (chrome.runtime.lastError) {
                        this.handleGlobalError({
                            type: 'extension',
                            message: chrome.runtime.lastError.message,
                            context: 'runtime.onConnect'
                        });
                    }
                });
            });
        }
    }

    /**
     * Расширение стандартного ErrorHandlingService
     */
    enhanceErrorHandler() {
        if (!this.errorHandler) return;

        // Сохраняем оригинальный метод handleError
        const originalHandleError = this.errorHandler.handleError.bind(this.errorHandler);

        // Заменяем метод на расширенную версию
        this.errorHandler.handleError = async (error, context = {}) => {
            // Вызываем оригинальный обработчик
            const result = await originalHandleError(error, context);
            
            // Добавляем в наш мониторинг
            this.reportError(error, {
                ...context,
                source: 'ErrorHandlingService',
                handled: true
            });
            
            return result;
        };
    }

    /**
     * Обработка глобальных ошибок
     */
    handleGlobalError(errorInfo) {
        if (!this.config.enabled) return;

        // Проверяем фильтры
        if (this.shouldIgnoreError(errorInfo)) {
            return;
        }

        // Создаём стандартизированную запись об ошибке
        const errorEntry = this.createErrorEntry(errorInfo);

        // Добавляем в лог
        this.addToLog(errorEntry);

        // Обновляем статистику сессии
        this.updateSessionStats(errorEntry);

        // Обновляем здоровье системы
        this.updateSystemHealth();

        // Добавляем в очередь для отправки
        if (this.config.reporting.enabled) {
            this.queueForReporting(errorEntry);
        }

        // Логируем в консоль если включен соответствующий уровень
        this.logToConsole(errorEntry);
    }

    /**
     * Создание стандартизированной записи об ошибке
     */
    createErrorEntry(errorInfo) {
        const entry = {
            id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            timestamp: new Date().toISOString(),
            level: this.determineErrorLevel(errorInfo),
            
            // Основная информация об ошибке
            type: errorInfo.type || 'unknown',
            message: errorInfo.message || 'Unknown error',
            stack: errorInfo.stack || null,
            
            // Контекст
            context: {
                ...errorInfo.context,
                url: window.location.href,
                userAgent: navigator.userAgent,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                timestamp: Date.now()
            },
            
            // Системная информация
            system: {
                memory: this.getMemoryInfo(),
                performance: this.getPerformanceSnapshot(),
                extension: this.getExtensionInfo()
            },
            
            // Пользовательская сессия
            session: {
                id: this.getSessionId(),
                duration: Date.now() - this.sessionStats.startTime,
                errorsCount: this.sessionStats.errorsCount,
                userActions: this.sessionStats.userActions
            }
        };

        // Санитизируем персональные данные
        if (this.config.privacy.sanitizeData) {
            this.sanitizeErrorEntry(entry);
        }

        return entry;
    }

    /**
     * Определение уровня ошибки
     */
    determineErrorLevel(errorInfo) {
        if (errorInfo.type === 'promise' && errorInfo.message?.includes('NetworkError')) {
            return 'warn';
        }
        
        if (errorInfo.type === 'extension') {
            return 'error';
        }
        
        if (errorInfo.message?.includes('ResizeObserver loop limit exceeded')) {
            return 'info';
        }
        
        return 'error';
    }

    /**
     * Проверка, следует ли игнорировать ошибку
     */
    shouldIgnoreError(errorInfo) {
        const filters = this.config.filters;
        
        // Игнорируем по сообщению
        if (filters.ignoreErrors.some(pattern => 
            errorInfo.message?.includes(pattern)
        )) {
            return true;
        }
        
        // Игнорируем по URL источника
        if (errorInfo.source && filters.ignoreUrls.some(pattern => 
            errorInfo.source.includes(pattern)
        )) {
            return true;
        }
        
        // Игнорируем по user agent
        if (filters.ignoreUserAgents.some(pattern => 
            navigator.userAgent.includes(pattern)
        )) {
            return true;
        }
        
        return false;
    }

    /**
     * Публичный метод для отчёта об ошибках
     */
    reportError(error, context = {}) {
        const errorInfo = {
            type: context.type || 'application',
            message: error.message || error.toString(),
            stack: error.stack,
            error: error,
            context: context
        };

        this.handleGlobalError(errorInfo);
    }

    /**
     * Отчёт о предупреждении
     */
    reportWarning(message, context = {}) {
        this.handleGlobalError({
            type: 'warning',
            message: message,
            context: context,
            level: 'warn'
        });
    }

    /**
     * Отчёт об информационном событии
     */
    reportInfo(message, context = {}) {
        if (this.config.logLevel === 'info' || this.config.logLevel === 'debug') {
            this.handleGlobalError({
                type: 'info',
                message: message,
                context: context,
                level: 'info'
            });
        }
    }

    /**
     * Мониторинг производительности
     */
    setupPerformanceMonitoring() {
        // Мониторинг Navigation API
        if ('performance' in window && 'getEntriesByType' in performance) {
            setInterval(() => {
                this.collectPerformanceMetrics();
            }, 30000); // Каждые 30 секунд
        }

        // Мониторинг длительных задач (Long Tasks)
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.duration > 100) { // Задачи дольше 100мс (увеличен порог)
                            // Ограничиваем частоту отчётов о длительных задачах
                            const now = Date.now();
                            if (!this.lastLongTaskReport || now - this.lastLongTaskReport > 5000) { // Не чаще раза в 5 сек
                                this.reportInfo('Long task detected', {
                                    duration: Math.round(entry.duration),
                                    startTime: Math.round(entry.startTime),
                                    name: entry.name
                                });
                                this.lastLongTaskReport = now;
                            }
                        }
                    }
                });
                
                observer.observe({ entryTypes: ['longtask'] });
            } catch (error) {
                console.warn('Long task monitoring не поддерживается:', error);
            }
        }
    }

    /**
     * Сбор метрик производительности
     */
    collectPerformanceMetrics() {
        try {
            const navigation = performance.getEntriesByType('navigation')[0];
            if (navigation) {
                this.performanceMetrics.navigation = {
                    loadTime: navigation.loadEventEnd - navigation.loadEventStart,
                    domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                    firstPaint: this.getFirstPaint(),
                    timestamp: Date.now()
                };
            }

            // Метрики памяти
            if ('memory' in performance) {
                this.performanceMetrics.memory = {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit,
                    timestamp: Date.now()
                };
            }

        } catch (error) {
            console.warn('Ошибка сбора метрик производительности:', error);
        }
    }

    /**
     * Получение времени первой отрисовки
     */
    getFirstPaint() {
        try {
            const paintEntries = performance.getEntriesByType('paint');
            const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
            return firstPaint ? firstPaint.startTime : null;
        } catch {
            return null;
        }
    }

    /**
     * Запуск мониторинга здоровья системы
     */
    startHealthMonitoring() {
        this.monitoring.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheck.interval);
    }

    /**
     * Проверка здоровья системы
     */
    performHealthCheck() {
        try {
            const healthData = {
                timestamp: Date.now(),
                errorRate: this.calculateErrorRate(),
                memoryUsage: this.calculateMemoryUsage(),
                responseTime: this.calculateAverageResponseTime(),
                activeConnections: this.getActiveConnectionsCount()
            };

            // Определяем общее здоровье системы
            const previousHealth = this.monitoring.systemHealth;
            this.monitoring.systemHealth = this.assessSystemHealth(healthData);

            // Если здоровье ухудшилось, создаём отчёт
            if (this.monitoring.systemHealth !== previousHealth) {
                this.reportSystemHealthChange(previousHealth, this.monitoring.systemHealth, healthData);
            }

            this.monitoring.lastHealthCheck = healthData;

        } catch (error) {
            this.reportError(error, {
                context: 'health-check',
                method: 'performHealthCheck'
            });
        }
    }

    /**
     * Вычисление среднего времени отклика
     */
    calculateAverageResponseTime() {
        if (!this.performanceMetrics.apiCalls || this.performanceMetrics.apiCalls.size === 0) {
            return 0;
        }

        let totalTime = 0;
        let count = 0;

        for (const [apiName, metrics] of this.performanceMetrics.apiCalls) {
            if (metrics.responseTimes && metrics.responseTimes.length > 0) {
                const average = metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
                totalTime += average;
                count++;
            }
        }

        return count > 0 ? Math.round(totalTime / count) : 0;
    }

    /**
     * Получение количества активных соединений
     */
    getActiveConnectionsCount() {
        // Простая эвристика для подсчета активных соединений
        try {
            if (navigator.connection) {
                return navigator.connection.downlink ? 1 : 0;
            }
            // Fallback - считаем что есть соединение если нет ошибок сети
            const recentNetworkErrors = this.errorLog.filter(entry => 
                Date.now() - new Date(entry.timestamp).getTime() < 30000 && // Последние 30 секунд
                entry.message && entry.message.toLowerCase().includes('network')
            );
            return recentNetworkErrors.length === 0 ? 1 : 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Оценка здоровья системы
     */
    assessSystemHealth(healthData) {
        const thresholds = this.config.healthCheck.thresholds;
        
        if (healthData.errorRate > thresholds.errorRate * 2 || 
            healthData.memoryUsage > thresholds.memoryUsage) {
            return 'critical';
        }
        
        if (healthData.errorRate > thresholds.errorRate || 
            healthData.responseTime > thresholds.responseTime) {
            return 'warning';
        }
        
        return 'healthy';
    }

    /**
     * Вычисление частоты ошибок
     */
    calculateErrorRate() {
        const recentErrors = this.errorLog.filter(entry => 
            Date.now() - new Date(entry.timestamp).getTime() < 300000 // Последние 5 минут
        );
        
        const totalActions = this.sessionStats.userActions || 1;
        return recentErrors.length / totalActions;
    }

    /**
     * Вычисление использования памяти
     */
    calculateMemoryUsage() {
        if ('memory' in performance) {
            return performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
        }
        return 0;
    }

    /**
     * Настройка планировщика отчётности
     */
    setupReportingScheduler() {
        setInterval(() => {
            this.flushReportQueue();
        }, this.config.reporting.flushInterval);

        // Отправка при закрытии страницы
        window.addEventListener('beforeunload', () => {
            this.flushReportQueue(true);
        });
    }

    /**
     * Добавление в очередь отчётности
     */
    queueForReporting(errorEntry) {
        this.reportQueue.push(errorEntry);

        // Если очередь заполнена, отправляем немедленно
        if (this.reportQueue.length >= this.config.reporting.batchSize) {
            this.flushReportQueue();
        }
    }

    /**
     * Отправка очереди отчётов
     */
    async flushReportQueue(synchronous = false) {
        if (this.reportingInProgress || this.reportQueue.length === 0) {
            return;
        }

        if (!this.config.reporting.endpoint || !this.config.reporting.apiKey) {
            console.warn('Endpoint или API key для отчётности не настроены');
            return;
        }

        this.reportingInProgress = true;

        try {
            const batch = this.reportQueue.splice(0, this.config.reporting.batchSize);
            
            const reportData = {
                batch_id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                timestamp: new Date().toISOString(),
                errors: batch,
                meta: {
                    session: this.sessionStats,
                    performance: this.performanceMetrics,
                    health: this.monitoring.systemHealth
                }
            };

            if (synchronous) {
                // Синхронная отправка при закрытии страницы
                navigator.sendBeacon(
                    this.config.reporting.endpoint,
                    JSON.stringify(reportData)
                );
            } else {
                // Асинхронная отправка
                await this.sendErrorReport(reportData);
            }

        } catch (error) {
            console.error('Ошибка отправки отчёта об ошибках:', error);
            // Возвращаем ошибки обратно в очередь при неудаче
            // (можно улучшить логику повторных попыток)
        } finally {
            this.reportingInProgress = false;
        }
    }

    /**
     * Отправка отчёта об ошибках
     */
    async sendErrorReport(reportData) {
        try {
            const response = await fetch(this.config.reporting.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.reporting.apiKey}`,
                    'X-Extension-Version': this.getExtensionVersion()
                },
                body: JSON.stringify(reportData)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Отчёт об ошибках отправлен:', result);

        } catch (error) {
            throw new Error(`Не удалось отправить отчёт: ${error.message}`);
        }
    }

    /**
     * Получение информации о расширении
     */
    getExtensionInfo() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            return {
                id: chrome.runtime.id,
                version: this.getExtensionVersion()
            };
        }
        return null;
    }

    /**
     * Получение версии расширения
     */
    getExtensionVersion() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
                return chrome.runtime.getManifest().version;
            }
        } catch {
            // Игнорируем ошибки получения манифеста
        }
        return 'unknown';
    }

    /**
     * Санитизация персональных данных
     */
    sanitizeErrorEntry(entry) {
        // Удаляем чувствительную информацию из URL
        if (entry.context.url) {
            const url = new URL(entry.context.url);
            url.search = ''; // Удаляем query parameters
            url.hash = ''; // Удаляем hash
            entry.context.url = url.toString();
        }

        // Санитизируем stack trace
        if (entry.stack) {
            entry.stack = entry.stack.replace(/\/Users\/[^\/]+/g, '/Users/***');
            entry.stack = entry.stack.replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\***');
        }

        // Удаляем персональную информацию из сообщений об ошибках
        if (entry.message) {
            entry.message = entry.message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***');
            entry.message = entry.message.replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '****-****-****-****');
        }
    }

    /**
     * Добавление в лог ошибок
     */
    addToLog(errorEntry) {
        this.errorLog.unshift(errorEntry);

        // Ограничиваем размер лога
        if (this.errorLog.length > this.config.maxLogEntries) {
            this.errorLog = this.errorLog.slice(0, this.config.maxLogEntries);
        }

        // Обновляем статистику по типам ошибок
        const errorType = errorEntry.type;
        const currentCount = this.sessionErrors.get(errorType) || 0;
        this.sessionErrors.set(errorType, currentCount + 1);
    }

    /**
     * Обновление статистики сессии
     */
    updateSessionStats(errorEntry) {
        if (errorEntry.level === 'error') {
            this.sessionStats.errorsCount++;
        } else if (errorEntry.level === 'warn') {
            this.sessionStats.warningsCount++;
        }
    }

    /**
     * Обновление здоровья системы
     */
    updateSystemHealth() {
        // Простая эвристика для определения здоровья
        const recentErrors = this.errorLog.filter(entry => 
            Date.now() - new Date(entry.timestamp).getTime() < 60000 // Последняя минута
        ).length;

        if (recentErrors > 10) {
            this.monitoring.systemHealth = 'critical';
        } else if (recentErrors > 3) {
            this.monitoring.systemHealth = 'warning';
        } else if (this.monitoring.systemHealth === 'warning' && recentErrors === 0) {
            this.monitoring.systemHealth = 'healthy';
        }
    }

    /**
     * Логирование в консоль
     */
    logToConsole(errorEntry) {
        const levels = ['error', 'warn', 'info', 'debug'];
        const configLevel = levels.indexOf(this.config.logLevel);
        const entryLevel = levels.indexOf(errorEntry.level);

        if (entryLevel <= configLevel) {
            const logMethod = console[errorEntry.level] || console.log;
            logMethod(`[GlobalErrorReporter] ${errorEntry.message}`, errorEntry);
        }
    }

    /**
     * Получение ID сессии
     */
    getSessionId() {
        if (!this.sessionId) {
            this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        }
        return this.sessionId;
    }

    /**
     * Получение информации о памяти
     */
    getMemoryInfo() {
        if ('memory' in performance) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }
        return null;
    }

    /**
     * Получение снимка производительности
     */
    getPerformanceSnapshot() {
        try {
            return {
                now: performance.now(),
                timing: performance.timing ? {
                    navigationStart: performance.timing.navigationStart,
                    loadEventEnd: performance.timing.loadEventEnd
                } : null
            };
        } catch {
            return null;
        }
    }

    /**
     * Публичные методы для получения статистики
     */
    
    getErrorStats() {
        return {
            total: this.errorLog.length,
            byType: Object.fromEntries(this.sessionErrors),
            byLevel: this.groupErrorsByLevel(),
            recent: this.getRecentErrors(10)
        };
    }

    getSessionStats() {
        return {
            ...this.sessionStats,
            sessionId: this.getSessionId(),
            systemHealth: this.monitoring.systemHealth,
            uptime: Date.now() - this.sessionStats.startTime
        };
    }

    getSystemHealth() {
        return {
            status: this.monitoring.systemHealth,
            lastCheck: this.monitoring.lastHealthCheck,
            errorRate: this.calculateErrorRate(),
            memoryUsage: this.calculateMemoryUsage()
        };
    }

    /**
     * Группировка ошибок по уровням
     */
    groupErrorsByLevel() {
        const levels = {};
        this.errorLog.forEach(entry => {
            levels[entry.level] = (levels[entry.level] || 0) + 1;
        });
        return levels;
    }

    /**
     * Получение недавних ошибок
     */
    getRecentErrors(count = 10) {
        return this.errorLog.slice(0, count);
    }

    /**
     * Очистка логов ошибок
     */
    clearErrorLog() {
        this.errorLog = [];
        this.sessionErrors.clear();
        this.sessionStats.errorsCount = 0;
        this.sessionStats.warningsCount = 0;
    }

    /**
     * Уничтожение репортера
     */
    destroy() {
        if (this.monitoring.healthCheckInterval) {
            clearInterval(this.monitoring.healthCheckInterval);
        }
        
        // Отправляем оставшиеся отчёты
        if (this.reportQueue.length > 0) {
            this.flushReportQueue(true);
        }
        
        this.errorLog = [];
        this.sessionErrors.clear();
        this.performanceMetrics = { apiCalls: new Map(), userActions: new Map(), componentRenders: new Map() };
        
        this.errorHandler = null;
        this.configService = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalErrorReporter;
} else {
    window.GlobalErrorReporter = GlobalErrorReporter;
}