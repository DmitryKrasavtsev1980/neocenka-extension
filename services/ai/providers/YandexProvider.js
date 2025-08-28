/**
 * YandexProvider - провайдер для Yandex GPT API
 * Реализует интеграцию с YandexGPT для универсального AI сервиса
 */

class YandexProvider extends BaseLLMService {
    constructor(config) {
        const defaultConfig = {
            provider: 'yandex',
            baseUrl: 'https://llm.api.cloud.yandex.net/foundationModels/v1',
            model: 'yandexgpt-lite/latest',
            ...config
        };

        super(defaultConfig);
        
        this.folderId = this.config.folderId;
        this.iamToken = this.config.iamToken; // Альтернатива API ключу
        this.maxRetries = this.config.maxRetries || 3;
        this.retryDelay = this.config.retryDelay || 2000; // 2 секунды для Yandex
        
        if (!this.folderId) {
            throw new Error('folderId is required for YandexGPT');
        }
    }

    /**
     * Отправка запроса к YandexGPT API
     * @param {string} prompt - текст запроса
     * @param {object} options - дополнительные опции
     * @returns {Promise<object>} - стандартизированный ответ
     */
    async sendRequest(prompt, options = {}) {
        const request = this.formatRequest(prompt, options);
        
        try {
            this.log('info', 'Sending request to YandexGPT API', { 
                model: this.getModelUri(),
                maxTokens: request.completionOptions.maxTokens 
            });

            const response = await this.makeAPICall(request);
            const standardResponse = this.parseResponse(response);
            
            // Обновляем статистику
            this.updateStats(standardResponse.usage, standardResponse.cost);
            
            this.log('info', 'Request successful', {
                tokensUsed: standardResponse.usage.totalTokens,
                cost: standardResponse.cost
            });

            return standardResponse;

        } catch (error) {
            this.log('error', 'Request failed', { error: error.message });
            throw this.handleAPIError(error);
        }
    }

    /**
     * Выполнение HTTP запроса к YandexGPT API с retry логикой
     * @param {object} request - форматированный запрос
     * @returns {Promise<object>} - ответ от API
     */
    async makeAPICall(request, retryCount = 0) {
        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            // Используем либо API ключ, либо IAM токен
            if (this.iamToken) {
                headers['Authorization'] = `Bearer ${this.iamToken}`;
            } else {
                headers['Authorization'] = `Api-Key ${this.apiKey}`;
            }

            const response = await fetch(`${this.baseUrl}/completion`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            return await response.json();

        } catch (error) {
            // Retry логика для временных ошибок
            if (retryCount < this.maxRetries && this.shouldRetry(error)) {
                this.log('warn', `Request failed, retrying (${retryCount + 1}/${this.maxRetries})`, {
                    error: error.message
                });
                
                await this.delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
                return this.makeAPICall(request, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Определяет, стоит ли повторять запрос при ошибке
     * @param {Error} error - ошибка
     * @returns {boolean}
     */
    shouldRetry(error) {
        const retryableErrors = [429, 500, 502, 503, 504];
        return retryableErrors.some(code => error.message.includes(code.toString()));
    }

    /**
     * Задержка для retry логики
     * @param {number} ms - миллисекунды
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Получение полного URI модели
     * @returns {string}
     */
    getModelUri() {
        return `gpt://${this.folderId}/${this.config.model}`;
    }

    /**
     * Форматирование запроса для YandexGPT API
     * @param {string} prompt - текст запроса
     * @param {object} options - опции запроса
     * @returns {object} - форматированный запрос
     */
    formatRequest(prompt, options) {
        const messages = [];

        // Добавляем системное сообщение, если есть
        if (options.systemMessage) {
            messages.push({
                role: 'system',
                text: options.systemMessage
            });
        }

        // Добавляем основное сообщение пользователя
        messages.push({
            role: 'user',
            text: prompt
        });

        return {
            modelUri: this.getModelUri(),
            completionOptions: {
                stream: false,
                temperature: options.temperature || 0.6,
                maxTokens: options.maxTokens?.toString() || '2000'
            },
            messages: messages
        };
    }

    /**
     * Парсинг ответа YandexGPT API в стандартный формат
     * @param {object} response - ответ от YandexGPT API
     * @returns {object} - стандартизированный ответ
     */
    parseResponse(response) {
        if (!response || !response.result || !response.result.alternatives || !response.result.alternatives[0]) {
            throw new Error('Invalid response format from YandexGPT API');
        }

        const alternative = response.result.alternatives[0];
        const content = alternative.message.text;
        
        const usage = {
            inputTokens: response.result.usage?.inputTextTokens || 0,
            outputTokens: response.result.usage?.completionTokens || 0
        };

        const metadata = {
            model: this.config.model,
            finishReason: alternative.status || 'completed'
        };

        return this.createStandardResponse(content, usage, metadata);
    }

    /**
     * Расчет стоимости запроса для YandexGPT API
     * @param {object} usage - информация об использовании токенов
     * @returns {number} - стоимость в долларах
     */
    calculateCost(usage) {
        // Цены YandexGPT (приблизительные)
        const costPer1000Tokens = 0.001; // 1₽ за 1000 токенов ≈ $0.01
        const totalTokens = usage.inputTokens + usage.outputTokens;
        
        return (totalTokens / 1000) * costPer1000Tokens;
    }

    /**
     * Получение поддерживаемых функций YandexGPT
     * @returns {array}
     */
    getSupportedFeatures() {
        return [
            'text-completion',
            'conversation',
            'system-prompts',
            'russian-language', // Оптимизирован для русского языка
            'streaming' // Поддерживает streaming ответы
        ];
    }

    /**
     * Получение лимитов YandexGPT API
     * @returns {object}
     */
    getLimits() {
        const limits = {
            'yandexgpt-lite': {
                maxTokens: 8000,
                maxOutputTokens: 2000,
                requestsPerMinute: 20,
                requestsPerDay: 2000
            },
            'yandexgpt': {
                maxTokens: 8000,
                maxOutputTokens: 2000,
                requestsPerMinute: 20,
                requestsPerDay: 1000
            }
        };

        return limits[this.config.model] || limits['yandexgpt-lite'];
    }

    /**
     * Специальная обработка ошибок YandexGPT API
     * @param {Error} error - ошибка
     * @returns {Error} - стандартизированная ошибка
     */
    handleAPIError(error) {
        // Специфичные ошибки YandexGPT
        if (error.message.includes('INVALID_ARGUMENT')) {
            return new Error('YandexGPT invalid argument: Check request parameters and model URI');
        }

        if (error.message.includes('UNAUTHENTICATED')) {
            return new Error('YandexGPT authentication failed: Check API key or IAM token');
        }

        if (error.message.includes('PERMISSION_DENIED')) {
            return new Error('YandexGPT permission denied: Check folder access and model permissions');
        }

        if (error.message.includes('RESOURCE_EXHAUSTED')) {
            return new Error('YandexGPT quota exceeded: Wait before making new requests');
        }

        // Используем базовую обработку для остальных ошибок
        return super.handleAPIError(error);
    }

    /**
     * Проверка доступности YandexGPT API
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        try {
            const response = await this.sendRequest('Привет', { maxTokens: 10 });
            return response && response.content;
        } catch (error) {
            this.log('warn', 'YandexGPT API availability check failed', { error: error.message });
            return false;
        }
    }

    /**
     * Получение информации о модели YandexGPT
     * @returns {object}
     */
    getModelInfo() {
        const modelInfo = {
            'yandexgpt-lite': {
                name: 'YandexGPT Lite',
                contextWindow: 8000,
                outputLimit: 2000,
                strengths: ['russian-language', 'cost-effective', 'general-tasks'],
                optimizedFor: 'russian'
            },
            'yandexgpt': {
                name: 'YandexGPT',
                contextWindow: 8000,
                outputLimit: 2000,
                strengths: ['russian-language', 'complex-reasoning', 'detailed-analysis'],
                optimizedFor: 'russian'
            }
        };

        return modelInfo[this.config.model] || modelInfo['yandexgpt-lite'];
    }

    /**
     * Определение русскоязычного текста
     * @param {string} text - текст для проверки
     * @returns {boolean}
     */
    isRussianText(text) {
        const cyrillicPattern = /[а-яё]/i;
        const cyrillicCount = (text.match(/[а-яё]/gi) || []).length;
        const totalLetters = (text.match(/[a-zа-яё]/gi) || []).length;
        
        return totalLetters > 0 && (cyrillicCount / totalLetters) > 0.5;
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YandexProvider;
} else {
    window.YandexProvider = YandexProvider;
}