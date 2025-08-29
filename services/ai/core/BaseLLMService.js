/**
 * BaseLLMService - базовый класс для всех LLM провайдеров
 * Определяет единый интерфейс для работы с различными AI сервисами
 */

class BaseLLMService {
    constructor(config) {
        this.config = config;
        this.provider = config.provider;
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl;
        
        // Валидация обязательных параметров
        this.validateConfig();
        
        // Статистика использования
        this.stats = {
            requestsCount: 0,
            tokensUsed: 0,
            totalCost: 0,
            errors: 0,
            lastRequestTime: null
        };
    }

    /**
     * Валидация конфигурации провайдера
     */
    validateConfig() {
        if (!this.provider) {
            throw new Error('Provider name is required');
        }
        if (!this.apiKey) {
            throw new Error(`API key is required for provider: ${this.provider}`);
        }
    }

    /**
     * Основной метод для отправки запроса к LLM
     * Должен быть переопределен в каждом провайдере
     * @param {string} prompt - текст запроса
     * @param {object} options - дополнительные опции
     * @returns {Promise<object>} - стандартизированный ответ
     */
    async sendRequest(prompt, options = {}) {
        throw new Error(`sendRequest method must be implemented by ${this.provider} provider`);
    }

    /**
     * Форматирование запроса для конкретного провайдера
     * @param {string} prompt - текст запроса
     * @param {object} options - опции запроса
     * @returns {object} - форматированный запрос
     */
    formatRequest(prompt, options) {
        throw new Error(`formatRequest method must be implemented by ${this.provider} provider`);
    }

    /**
     * Парсинг ответа провайдера в стандартный формат
     * @param {object} response - ответ от API провайдера
     * @returns {object} - стандартизированный ответ
     */
    parseResponse(response) {
        throw new Error(`parseResponse method must be implemented by ${this.provider} provider`);
    }

    /**
     * Стандартизированный формат ответа
     * @param {string} content - текст ответа
     * @param {object} usage - информация об использовании токенов
     * @param {object} metadata - дополнительная информация
     * @returns {object}
     */
    createStandardResponse(content, usage, metadata = {}) {
        return {
            content,
            usage: {
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
                totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0)
            },
            metadata: {
                provider: this.provider,
                model: this.config.model,
                requestTime: new Date().toISOString(),
                ...metadata
            },
            cost: this.calculateCost(usage)
        };
    }

    /**
     * Расчет стоимости запроса
     * @param {object} usage - информация об использовании токенов
     * @returns {number} - стоимость в долларах
     */
    calculateCost(usage) {
        // Базовая реализация, переопределяется в провайдерах
        return 0;
    }

    /**
     * Обновление статистики использования
     * @param {object} usage - использованные токены
     * @param {number} cost - стоимость запроса
     */
    updateStats(usage, cost) {
        this.stats.requestsCount++;
        this.stats.tokensUsed += usage.totalTokens || 0;
        this.stats.totalCost += cost || 0;
        this.stats.lastRequestTime = new Date();
    }

    /**
     * Обновление статистики ошибок
     */
    updateErrorStats() {
        this.stats.errors++;
    }

    /**
     * Получение статистики использования
     * @returns {object}
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Сброс статистики
     */
    resetStats() {
        this.stats = {
            requestsCount: 0,
            tokensUsed: 0,
            totalCost: 0,
            errors: 0,
            lastRequestTime: null
        };
    }

    /**
     * Проверка доступности провайдера
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        try {
            // Простой тестовый запрос
            await this.sendRequest('test', { maxTokens: 1 });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Получение информации о провайдере
     * @returns {object}
     */
    getProviderInfo() {
        return {
            name: this.provider,
            model: this.config.model,
            baseUrl: this.baseUrl,
            features: this.getSupportedFeatures(),
            limits: this.getLimits()
        };
    }

    /**
     * Получение поддерживаемых функций
     * Переопределяется в провайдерах
     * @returns {array}
     */
    getSupportedFeatures() {
        return ['text-completion'];
    }

    /**
     * Получение лимитов провайдера
     * Переопределяется в провайдерах
     * @returns {object}
     */
    getLimits() {
        return {
            maxTokens: 4000,
            requestsPerMinute: 60,
            requestsPerDay: 1000
        };
    }

    /**
     * Обработка ошибок API
     * @param {Error} error - ошибка
     * @returns {Error} - стандартизированная ошибка
     */
    handleAPIError(error) {
        this.updateErrorStats();

        // Стандартизируем различные типы ошибок
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            switch (status) {
                case 401:
                    return new Error(`Authentication failed for ${this.provider}: Invalid API key`);
                case 403:
                    return new Error(`Access forbidden for ${this.provider}: Check permissions`);
                case 429:
                    return new Error(`Rate limit exceeded for ${this.provider}: ${data?.message || 'Too many requests'}`);
                case 500:
                case 502:
                case 503:
                    return new Error(`${this.provider} service unavailable: ${data?.message || 'Server error'}`);
                default:
                    return new Error(`${this.provider} API error (${status}): ${data?.message || error.message}`);
            }
        }

        return new Error(`${this.provider} request failed: ${error.message}`);
    }

    /**
     * Логирование с префиксом провайдера
     * @param {string} level - уровень логирования
     * @param {string} message - сообщение
     * @param {object} data - дополнительные данные
     */
    log(level, message, data = {}) {
        const logData = {
            provider: this.provider,
            timestamp: new Date().toISOString(),
            ...data
        };

        // Логи отключены
    }

    /**
     * Уничтожение экземпляра сервиса
     */
    destroy() {
        // Очистка ресурсов, если необходимо
        this.config = null;
        this.stats = null;
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BaseLLMService;
} else {
    window.BaseLLMService = BaseLLMService;
}