/**
 * Базовый абстрактный класс для сервисов обновления объявлений
 * Определяет единый интерфейс для работы с различными источниками объявлений
 */
class BaseListingUpdateService {
    constructor(config = {}) {
        this.config = {
            batchSize: 5,
            maxAgeDays: 7,
            retryAttempts: 3,
            retryDelay: 1000,
            ...config
        };
        
        this.stats = {
            total: 0,
            updated: 0,
            failed: 0,
            skipped: 0,
            startTime: null,
            endTime: null
        };
    }

    /**
     * Обновление объявлений по области
     * @param {string|number} areaId - ID области
     * @param {Object} options - Настройки обновления
     * @returns {Promise<Object>} Результат обновления
     */
    async updateListingsByArea(areaId, options = {}) {
        throw new Error(`updateListingsByArea method must be implemented by ${this.constructor.name}`);
    }

    /**
     * Обновление конкретного объявления по ID
     * @param {string|number} listingId - ID объявления
     * @param {Object} options - Настройки обновления
     * @returns {Promise<Object>} Результат обновления
     */
    async updateListingById(listingId, options = {}) {
        throw new Error(`updateListingById method must be implemented by ${this.constructor.name}`);
    }

    /**
     * Получение списка объявлений, требующих обновления
     * @param {string|number} areaId - ID области
     * @param {number} maxAgeDays - Максимальный возраст в днях
     * @returns {Promise<Array>} Массив объявлений для обновления
     */
    async getUpdateableListings(areaId, maxAgeDays = null) {
        throw new Error(`getUpdateableListings method must be implemented by ${this.constructor.name}`);
    }

    /**
     * Валидация результатов обновления
     * @param {Object} results - Результаты обновления
     * @returns {Promise<boolean>} Результат валидации
     */
    async validateUpdateResults(results) {
        return results && 
               typeof results.updated === 'number' && 
               typeof results.failed === 'number' &&
               results.updated >= 0 && 
               results.failed >= 0;
    }

    /**
     * Инициализация статистики
     */
    initStats() {
        this.stats = {
            total: 0,
            updated: 0,
            failed: 0,
            skipped: 0,
            startTime: new Date(),
            endTime: null
        };
    }

    /**
     * Завершение статистики
     */
    finishStats() {
        this.stats.endTime = new Date();
        this.stats.duration = this.stats.endTime - this.stats.startTime;
    }

    /**
     * Получение текущей статистики
     * @returns {Object} Статистика обновления
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Обновление прогресса
     * @param {number} current - Текущий прогресс
     * @param {number} total - Общее количество
     * @param {string} message - Сообщение о статусе
     */
    updateProgress(current, total, message) {
        const progress = Math.round((current / total) * 100);
        
        if (this.onProgress && typeof this.onProgress === 'function') {
            this.onProgress({
                current,
                total,
                progress,
                message,
                stats: this.getStats()
            });
        }
    }

    /**
     * Установка callback для прогресса
     * @param {Function} callback - Функция обратного вызова
     */
    setProgressCallback(callback) {
        this.onProgress = callback;
    }

    /**
     * Проверка доступности сервиса
     * @returns {Promise<boolean>} Доступность сервиса
     */
    async isServiceAvailable() {
        return true; // По умолчанию доступен, переопределяется в наследниках
    }

    /**
     * Получение поддерживаемых источников
     * @returns {Array<string>} Массив поддерживаемых источников
     */
    getSupportedSources() {
        return []; // Переопределяется в наследниках
    }

    /**
     * Определение источника объявления по URL
     * @param {string} url - URL объявления
     * @returns {string|null} Название источника или null
     */
    detectSourceFromUrl(url) {
        if (!url) return null;
        
        const urlLower = url.toLowerCase();
        
        if (urlLower.includes('cian.ru')) return 'cian';
        if (urlLower.includes('avito.ru')) return 'avito';
        if (urlLower.includes('youla.ru')) return 'youla';
        
        return null;
    }

    /**
     * Подготовка конфигурации для обновления
     * @param {Object} options - Входные настройки
     * @returns {Object} Подготовленная конфигурация
     */
    prepareConfig(options = {}) {
        return {
            batchSize: options.batchSize || this.config.batchSize,
            maxAgeDays: options.maxAgeDays || this.config.maxAgeDays,
            retryAttempts: options.retryAttempts || this.config.retryAttempts,
            retryDelay: options.retryDelay || this.config.retryDelay,
            source: options.source || 'all',
            ...options
        };
    }

    /**
     * Логирование с проверкой debug режима
     * @param {...any} args - Аргументы для логирования
     */
    async debugLog(...args) {
        if (typeof window !== 'undefined' && window.Helpers && window.Helpers.debugLog) {
            await window.Helpers.debugLog('[BaseListingUpdate]', ...args);
        }
    }

    /**
     * Обработка ошибок
     * @param {Error} error - Ошибка
     * @param {string} context - Контекст ошибки
     */
    handleError(error, context = 'Unknown') {
        console.error(`❌ [${this.constructor.name}] Ошибка в ${context}:`, error);
        
        if (this.onError && typeof this.onError === 'function') {
            this.onError(error, context);
        }
    }

    /**
     * Установка callback для ошибок
     * @param {Function} callback - Функция обратного вызова для ошибок
     */
    setErrorCallback(callback) {
        this.onError = callback;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BaseListingUpdateService;
} else {
    window.BaseListingUpdateService = BaseListingUpdateService;
}