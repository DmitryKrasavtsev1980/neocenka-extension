/**
 * ClaudeProvider - провайдер для Anthropic Claude API
 * Реализует интеграцию с Claude API для универсального AI сервиса
 */

class ClaudeProvider extends BaseLLMService {
    constructor(config) {
        const defaultConfig = {
            provider: 'claude',
            baseUrl: 'https://api.anthropic.com/v1',
            model: 'claude-3-sonnet-20240229',
            version: '2023-06-01',
            ...config
        };

        super(defaultConfig);
        
        this.version = this.config.version;
        this.maxRetries = this.config.maxRetries || 3;
        this.retryDelay = this.config.retryDelay || 1000; // 1 секунда
    }

    /**
     * Отправка запроса к Claude API
     * @param {string} prompt - текст запроса
     * @param {object} options - дополнительные опции
     * @returns {Promise<object>} - стандартизированный ответ
     */
    async sendRequest(prompt, options = {}) {
        const request = this.formatRequest(prompt, options);
        
        try {
            this.log('info', 'Sending request to Claude API', { 
                model: request.model,
                maxTokens: request.max_tokens 
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
     * Выполнение HTTP запроса к Claude API с retry логикой
     * @param {object} request - форматированный запрос
     * @returns {Promise<object>} - ответ от API
     */
    async makeAPICall(request, retryCount = 0) {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': this.version,
                    'content-type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
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
        const retryableErrors = [500, 502, 503, 504, 429];
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
     * Форматирование запроса для Claude API
     * @param {string} prompt - текст запроса
     * @param {object} options - опции запроса
     * @returns {object} - форматированный запрос
     */
    formatRequest(prompt, options) {
        return {
            model: options.model || this.config.model,
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature || 0.7,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            // Дополнительные параметры Claude
            ...(options.systemMessage && {
                system: options.systemMessage
            }),
            ...(options.stopSequences && {
                stop_sequences: options.stopSequences
            })
        };
    }

    /**
     * Парсинг ответа Claude API в стандартный формат
     * @param {object} response - ответ от Claude API
     * @returns {object} - стандартизированный ответ
     */
    parseResponse(response) {
        if (!response || !response.content || !response.content[0]) {
            throw new Error('Invalid response format from Claude API');
        }

        const content = response.content[0].text;
        const usage = {
            inputTokens: response.usage?.input_tokens || 0,
            outputTokens: response.usage?.output_tokens || 0
        };

        const metadata = {
            model: response.model,
            stopReason: response.stop_reason,
            stopSequence: response.stop_sequence
        };

        return this.createStandardResponse(content, usage, metadata);
    }

    /**
     * Расчет стоимости запроса для Claude API
     * @param {object} usage - информация об использовании токенов
     * @returns {number} - стоимость в долларах
     */
    calculateCost(usage) {
        // Цены Claude API (приблизительные)
        const inputCostPer1M = 3.0;   // $3 за 1M input токенов
        const outputCostPer1M = 15.0; // $15 за 1M output токенов

        const inputCost = (usage.inputTokens / 1000000) * inputCostPer1M;
        const outputCost = (usage.outputTokens / 1000000) * outputCostPer1M;

        return inputCost + outputCost;
    }

    /**
     * Получение поддерживаемых функций Claude
     * @returns {array}
     */
    getSupportedFeatures() {
        return [
            'text-completion',
            'conversation',
            'system-prompts',
            'stop-sequences',
            'large-context', // до 200K токенов
            'multilingual'
        ];
    }

    /**
     * Получение лимитов Claude API
     * @returns {object}
     */
    getLimits() {
        return {
            maxTokens: 200000, // максимальный контекст
            maxOutputTokens: 4096,
            requestsPerMinute: 4000,
            requestsPerDay: 40000,
            maxRequestSize: '10MB'
        };
    }

    /**
     * Специальная обработка ошибок Claude API
     * @param {Error} error - ошибка
     * @returns {Error} - стандартизированная ошибка
     */
    handleAPIError(error) {
        // Специфичные ошибки Claude
        if (error.message.includes('maximum context length')) {
            return new Error('Claude context limit exceeded: Reduce prompt size or use a model with larger context');
        }

        if (error.message.includes('overloaded')) {
            return new Error('Claude API is overloaded: Please try again later');
        }

        if (error.message.includes('invalid_request_error')) {
            return new Error('Claude API request error: Check request format and parameters');
        }

        // Используем базовую обработку для остальных ошибок
        return super.handleAPIError(error);
    }

    /**
     * Проверка доступности Claude API
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        try {
            const response = await this.sendRequest('Hi', { maxTokens: 10 });
            return response && response.content;
        } catch (error) {
            this.log('warn', 'Claude API availability check failed', { error: error.message });
            return false;
        }
    }

    /**
     * Получение информации о модели Claude
     * @returns {object}
     */
    getModelInfo() {
        const modelInfo = {
            'claude-3-sonnet-20240229': {
                name: 'Claude 3 Sonnet',
                contextWindow: 200000,
                outputLimit: 4096,
                strengths: ['analysis', 'reasoning', 'coding', 'math']
            },
            'claude-3-haiku-20240307': {
                name: 'Claude 3 Haiku',
                contextWindow: 200000,
                outputLimit: 4096,
                strengths: ['speed', 'simple-tasks', 'cost-effective']
            },
            'claude-3-opus-20240229': {
                name: 'Claude 3 Opus',
                contextWindow: 200000,
                outputLimit: 4096,
                strengths: ['complex-reasoning', 'creative-writing', 'advanced-analysis']
            }
        };

        return modelInfo[this.config.model] || modelInfo['claude-3-sonnet-20240229'];
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClaudeProvider;
} else {
    window.ClaudeProvider = ClaudeProvider;
}