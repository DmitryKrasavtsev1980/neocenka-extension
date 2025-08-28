/**
 * UniversalAIService - универсальный AI сервис для работы с множественными LLM провайдерами
 * Обеспечивает единую точку доступа ко всем AI функциям с автоматической оптимизацией
 */

class UniversalAIService {
    constructor(diContainer) {
        this.diContainer = diContainer;
        this.configService = diContainer.get('ConfigService');
        this.errorHandler = diContainer.get('ErrorHandlingService');
        this.eventBus = diContainer.get('EventBus');
        
        // Фабрика провайдеров
        this.providerFactory = window.llmProviderFactory || new LLMProviderFactory();
        
        // Текущий активный провайдер
        this.currentProvider = null;
        this.fallbackProviders = [];
        
        // Настройки по умолчанию
        this.defaultSettings = {
            primaryProvider: 'yandex', // Дешевый по умолчанию
            fallbackChain: ['yandex', 'claude'],
            costOptimization: true,
            autoLanguageDetection: true,
            maxRetries: 3,
            budget: {
                daily: 1.0, // $1 в день
                perRequest: 0.05 // $0.05 за запрос
            }
        };

        // Инициализация
        this.initialize();
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            // Загружаем настройки
            await this.loadSettings();
            
            // Создаем основного провайдера
            await this.initializePrimaryProvider();
            
            // Создаем fallback провайдеров
            await this.initializeFallbackProviders();
            
            this.emit('ai-service-initialized', { 
                provider: this.currentProvider?.provider,
                fallbacks: this.fallbackProviders.map(p => p.provider)
            });

        } catch (error) {
            this.errorHandler.handleError(error, { context: 'AI_SERVICE_INIT_FAILED' });
            throw error;
        }
    }

    /**
     * Загрузка настроек AI сервиса
     */
    async loadSettings() {
        try {
            // ConfigService.get() синхронный
            const settings = this.configService.get('ai') || {};
            this.settings = { ...this.defaultSettings, ...settings };
        } catch (error) {
            this.settings = this.defaultSettings;
            console.warn('Failed to load AI settings, using defaults:', error);
        }
    }

    /**
     * Сохранение настроек AI сервиса
     */
    async saveSettings() {
        try {
            await this.configService.set('ai', this.settings);
        } catch (error) {
            console.error('Failed to save AI settings:', error);
        }
    }

    /**
     * Инициализация основного провайдера
     */
    async initializePrimaryProvider() {
        try {
            const providerConfig = await this.getProviderConfig(this.settings.primaryProvider);
            
            // Отладка: выводим полученную конфигурацию
            console.log(`🔍 [UniversalAI] Конфигурация для ${this.settings.primaryProvider}:`, providerConfig);
            
            // Проверяем наличие необходимых ключей
            if (!this.hasRequiredCredentials(this.settings.primaryProvider, providerConfig)) {
                this.log('warn', `Primary provider ${this.settings.primaryProvider} missing credentials, will show as unavailable`, {
                    provider: this.settings.primaryProvider,
                    config: providerConfig,
                    hasApiKey: !!providerConfig.apiKey,
                    hasFolderId: !!providerConfig.folderId
                });
                this.currentProvider = null;
                return;
            }
            
            this.currentProvider = this.providerFactory.create(this.settings.primaryProvider, providerConfig);
            
            this.log('info', `Primary provider initialized: ${this.settings.primaryProvider}`);
        } catch (error) {
            this.log('error', `Failed to initialize primary provider: ${error.message}`);
            // Пробуем fallback
            await this.switchToFallback();
        }
    }

    /**
     * Инициализация fallback провайдеров
     */
    async initializeFallbackProviders() {
        this.fallbackProviders = [];
        
        for (const providerName of this.settings.fallbackChain) {
            if (providerName === this.currentProvider?.provider) continue;
            
            try {
                const config = await this.getProviderConfig(providerName);
                const provider = this.providerFactory.create(providerName, config);
                this.fallbackProviders.push(provider);
            } catch (error) {
                this.log('warn', `Failed to initialize fallback provider ${providerName}: ${error.message}`);
            }
        }
    }

    /**
     * Получение конфигурации провайдера
     * @param {string} providerName - имя провайдера
     * @returns {object} - конфигурация
     */
    async getProviderConfig(providerName) {
        try {
            const path = `ai.providers.${providerName}`;
            // ConfigService.get() синхронный, не нужен await
            const config = this.configService.get(path);
            
            console.log(`📋 [UniversalAI] Получение конфигурации по пути '${path}':`, config);
            return config || {};
        } catch (error) {
            console.error(`❌ [UniversalAI] Ошибка получения конфигурации для ${providerName}:`, error);
            return {};
        }
    }

    /**
     * Проверка наличия необходимых учетных данных для провайдера
     * @param {string} providerName - имя провайдера
     * @param {object} config - конфигурация провайдера
     * @returns {boolean} - есть ли необходимые данные
     */
    hasRequiredCredentials(providerName, config) {
        switch (providerName) {
            case 'yandex':
                return !!(config.apiKey && config.folderId);
            
            case 'claude':
                return !!config.apiKey;
            
            case 'openai':
                return !!config.apiKey;
            
            case 'gigachat':
                return !!config.clientId && !!config.clientSecret;
            
            default:
                return false;
        }
    }

    /**
     * Основной метод для отправки запросов к AI
     * @param {string} prompt - текст запроса
     * @param {object} options - опции запроса
     * @returns {Promise<object>} - ответ AI
     */
    async sendRequest(prompt, options = {}) {
        const startTime = Date.now();
        
        try {
            // Предварительная обработка запроса
            const processedOptions = await this.preprocessRequest(prompt, options);
            
            // Выбор оптимального провайдера
            const provider = this.selectProvider(prompt, processedOptions);
            
            this.log('info', 'Sending AI request', {
                provider: provider.provider,
                promptLength: prompt.length,
                options: processedOptions
            });

            // Отправка запроса
            const response = await provider.sendRequest(prompt, processedOptions);
            
            // Постобработка ответа
            const processedResponse = this.postprocessResponse(response, options);
            
            // Логирование и эмит событий
            const duration = Date.now() - startTime;
            this.logSuccess(provider, response, duration);
            this.emit('ai-request-success', { provider: provider.provider, duration, cost: response.cost });
            
            return processedResponse;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logError(error, duration);
            
            // Пробуем fallback, если основной провайдер не сработал
            if (this.shouldTryFallback(error, options)) {
                return await this.sendRequestWithFallback(prompt, options);
            }
            
            throw this.errorHandler.handleError('AI_REQUEST_FAILED', error);
        }
    }

    /**
     * Отправка запроса с автоматическим fallback
     * @param {string} prompt - текст запроса
     * @param {object} options - опции запроса
     * @returns {Promise<object>} - ответ AI
     */
    async sendRequestWithFallback(prompt, options = {}) {
        const providers = [this.currentProvider, ...this.fallbackProviders].filter(p => p);
        let lastError = null;

        for (const provider of providers) {
            try {
                this.log('info', `Trying provider: ${provider.provider}`);
                const response = await provider.sendRequest(prompt, options);
                
                this.emit('ai-fallback-success', { 
                    provider: provider.provider,
                    failedProvider: this.currentProvider?.provider
                });
                
                return response;
                
            } catch (error) {
                lastError = error;
                this.log('warn', `Provider ${provider.provider} failed: ${error.message}`);
                continue;
            }
        }

        this.emit('ai-all-providers-failed', { error: lastError });
        throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
    }

    /**
     * Предварительная обработка запроса
     * @param {string} prompt - текст запроса
     * @param {object} options - опции
     * @returns {object} - обработанные опции
     */
    async preprocessRequest(prompt, options) {
        const processed = { ...options };

        // Автоматическое определение языка
        if (this.settings.autoLanguageDetection && !processed.language) {
            processed.language = this.detectLanguage(prompt);
        }

        // Определение типа задачи
        if (!processed.taskType) {
            processed.taskType = this.detectTaskType(prompt);
        }

        // Лимит бюджета
        if (!processed.maxCost && this.settings.budget.perRequest) {
            processed.maxCost = this.settings.budget.perRequest;
        }

        return processed;
    }

    /**
     * Постобработка ответа
     * @param {object} response - ответ от провайдера
     * @param {object} originalOptions - оригинальные опции
     * @returns {object} - обработанный ответ
     */
    postprocessResponse(response, originalOptions) {
        // Добавляем дополнительную информацию
        return {
            ...response,
            timestamp: new Date().toISOString(),
            serviceVersion: '1.0.0',
            processingInfo: {
                language: originalOptions.language,
                taskType: originalOptions.taskType,
                optimized: true
            }
        };
    }

    /**
     * Выбор оптимального провайдера для запроса
     * @param {string} prompt - текст запроса
     * @param {object} options - опции запроса
     * @returns {BaseLLMService} - выбранный провайдер
     */
    selectProvider(prompt, options) {
        if (!this.settings.costOptimization) {
            return this.currentProvider;
        }

        // Простые эвристики для выбора провайдера
        
        // Для русского языка предпочитаем YandexGPT
        if (options.language === 'ru' && this.hasProvider('yandex')) {
            return this.getProvider('yandex');
        }

        // Для сложных задач предпочитаем Claude
        if (options.taskType === 'analysis' || options.taskType === 'complex-reasoning') {
            if (this.hasProvider('claude')) {
                return this.getProvider('claude');
            }
        }

        // Для простых задач используем более дешевые провайдеры
        if (options.taskType === 'simple' || options.taskType === 'chat') {
            if (this.hasProvider('yandex')) {
                return this.getProvider('yandex');
            }
        }

        // По умолчанию используем текущего провайдера
        if (this.currentProvider) {
            return this.currentProvider;
        }
        
        // Если текущего провайдера нет, ищем любого доступного
        const availableProvider = this.getAnyAvailableProvider();
        if (availableProvider) {
            this.log('warn', 'Primary provider not available, using fallback', {
                fallback: availableProvider.provider
            });
            return availableProvider;
        }
        
        // Если вообще нет доступных провайдеров
        throw new Error('No available AI providers. Please check your API keys and configuration.');
    }

    /**
     * Определение языка текста
     * @param {string} text - текст для анализа
     * @returns {string} - код языка
     */
    detectLanguage(text) {
        // Простое определение русского языка
        const cyrillicCount = (text.match(/[а-яё]/gi) || []).length;
        const latinCount = (text.match(/[a-z]/gi) || []).length;
        const totalLetters = cyrillicCount + latinCount;
        
        if (totalLetters === 0) return 'unknown';
        
        const cyrillicRatio = cyrillicCount / totalLetters;
        return cyrillicRatio > 0.5 ? 'ru' : 'en';
    }

    /**
     * Определение типа задачи
     * @param {string} prompt - текст запроса
     * @returns {string} - тип задачи
     */
    detectTaskType(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        
        // Ключевые слова для разных типов задач
        const patterns = {
            'analysis': /анализ|проанализируй|сравни|оцени|исследуй|изучи/,
            'segmentation': /сегмент|группир|класс|категор|раздел/,
            'duplicates': /дубл|повтор|одинаков|схож|копи/,
            'chat': /привет|как дела|что такое|расскажи|объясни/,
            'address': /адрес|местоположение|координат|геопозиц/
        };

        for (const [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(lowerPrompt)) {
                return type;
            }
        }

        return 'general';
    }

    /**
     * Проверка наличия провайдера
     * @param {string} providerName - имя провайдера
     * @returns {boolean}
     */
    hasProvider(providerName) {
        return this.currentProvider?.provider === providerName || 
               this.fallbackProviders.some(p => p.provider === providerName);
    }

    /**
     * Получение провайдера по имени
     * @param {string} providerName - имя провайдера
     * @returns {BaseLLMService|null}
     */
    getProvider(providerName) {
        if (this.currentProvider?.provider === providerName) {
            return this.currentProvider;
        }
        
        return this.fallbackProviders.find(p => p.provider === providerName) || null;
    }

    /**
     * Получение любого доступного провайдера
     * @returns {object|null} - первый доступный провайдер
     */
    getAnyAvailableProvider() {
        // Сначала пытаемся использовать основного провайдера
        if (this.currentProvider) {
            return this.currentProvider;
        }
        
        // Затем ищем среди fallback провайдеров
        if (this.fallbackProviders.length > 0) {
            return this.fallbackProviders[0];
        }
        
        return null;
    }

    /**
     * Переключение на fallback провайдера
     */
    async switchToFallback() {
        if (this.fallbackProviders.length === 0) {
            throw new Error('No fallback providers available');
        }

        const oldProvider = this.currentProvider;
        this.currentProvider = this.fallbackProviders.shift();
        
        if (oldProvider) {
            this.fallbackProviders.push(oldProvider);
        }

        this.emit('ai-provider-switched', {
            from: oldProvider?.provider,
            to: this.currentProvider.provider
        });

        this.log('info', `Switched to fallback provider: ${this.currentProvider.provider}`);
    }

    /**
     * Проверка необходимости fallback
     * @param {Error} error - ошибка
     * @param {object} options - опции запроса
     * @returns {boolean}
     */
    shouldTryFallback(error, options) {
        // Не используем fallback, если это явно запрещено
        if (options.noFallback) return false;
        
        // Используем fallback для временных ошибок
        const temporaryErrors = [
            'rate limit',
            'service unavailable', 
            'timeout',
            'overloaded'
        ];

        const errorMessage = error.message.toLowerCase();
        return temporaryErrors.some(pattern => errorMessage.includes(pattern));
    }

    // === Специальные методы для разных типов задач ===

    /**
     * Анализ объявлений на дубли
     * @param {object} listing - основное объявление
     * @param {array} similarListings - похожие объявления
     * @returns {Promise<object>} - результат анализа дублей
     */
    async analyzeDuplicates(listing, similarListings) {
        const prompt = `
Проанализируй объявления на дубли и определи, какие из них описывают одну и ту же недвижимость.

Основное объявление:
${JSON.stringify(listing, null, 2)}

Похожие объявления:
${similarListings.map((l, i) => `${i + 1}. ${JSON.stringify(l, null, 2)}`).join('\n')}

Ответь в формате JSON:
{
  "duplicates": [
    {
      "listings": [id1, id2, ...],
      "confidence": 0.9,
      "reasoning": "объяснение почему это дубли"
    }
  ],
  "unique": [id3, id4, ...],
  "uncertain": [
    {
      "listings": [id5, id6],
      "reason": "недостаточно данных для определения"
    }
  ]
}
`;

        const response = await this.sendRequest(prompt, {
            taskType: 'duplicates',
            language: 'ru',
            maxTokens: 2000,
            temperature: 0.3
        });

        return this.parseDuplicateAnalysis(response.content);
    }

    /**
     * Автоматическое присвоение адреса объявлению
     * @param {object} listing - объявление
     * @param {array} nearbyAddresses - близкие адреса
     * @returns {Promise<object>} - результат присвоения адреса
     */
    async assignAddress(listing, nearbyAddresses) {
        const prompt = `
Определи наиболее подходящий адрес для данного объявления на основе описания, координат и других характеристик.

Объявление:
${JSON.stringify(listing, null, 2)}

Возможные адреса:
${nearbyAddresses.map((addr, i) => `${i + 1}. ${JSON.stringify(addr, null, 2)}`).join('\n')}

Ответь в формате JSON:
{
  "selectedAddress": {
    "id": "адрес_id",
    "confidence": 0.85,
    "reasoning": "объяснение выбора"
  },
  "alternatives": [
    {
      "id": "другой_адрес_id",
      "confidence": 0.6,
      "reasoning": "возможная альтернатива"
    }
  ]
}
`;

        const response = await this.sendRequest(prompt, {
            taskType: 'address',
            language: 'ru',
            maxTokens: 1500,
            temperature: 0.2
        });

        return this.parseAddressAssignment(response.content);
    }

    /**
     * Автоматическая сегментация по области
     * @param {string} areaId - ID области
     * @returns {Promise<object>} - результат сегментации
     */
    async autoSegmentation(areaId) {
        // Получаем данные области
        const database = this.diContainer.get('Database');
        const addresses = await database.getAddressesByArea(areaId);
        
        const prompt = `
На основе характеристик зданий создай логичные сегменты для анализа рынка недвижимости.

Данные зданий:
${addresses.slice(0, 100).map(addr => JSON.stringify({
            id: addr.id,
            address: addr.address,
            house_type: addr.house_type,
            construction_year: addr.construction_year,
            floors_total: addr.floors_total,
            wall_material: addr.wall_material,
            house_class: addr.house_class
        })).join('\n')}

Создай сегменты на основе:
- Типа дома (кирпичный, панельный, монолитный)
- Года постройки (новостройки, современное жилье, старый фонд)
- Этажности (малоэтажные, среднеэтажные, высотные)
- Класса жилья (эконом, комфорт, бизнес)

Ответь в формате JSON:
{
  "segments": [
    {
      "name": "Кирпичные дома 2000-2020",
      "criteria": {
        "wall_material": "кирпичный",
        "construction_year_min": 2000,
        "construction_year_max": 2020
      },
      "addressIds": [id1, id2, ...],
      "description": "Современные кирпичные дома"
    }
  ]
}
`;

        const response = await this.sendRequest(prompt, {
            taskType: 'segmentation',
            language: 'ru',
            maxTokens: 3000,
            temperature: 0.4
        });

        return this.parseSegmentation(response.content);
    }

    // === Вспомогательные методы парсинга ===

    /**
     * Парсинг результата анализа дублей
     * @param {string} content - текст ответа AI
     * @returns {object} - распарсенный результат
     */
    parseDuplicateAnalysis(content) {
        try {
            return JSON.parse(content);
        } catch (error) {
            this.log('error', 'Failed to parse duplicate analysis result', { content });
            return { duplicates: [], unique: [], uncertain: [] };
        }
    }

    /**
     * Парсинг результата присвоения адреса
     * @param {string} content - текст ответа AI
     * @returns {object} - распарсенный результат
     */
    parseAddressAssignment(content) {
        try {
            return JSON.parse(content);
        } catch (error) {
            this.log('error', 'Failed to parse address assignment result', { content });
            return { selectedAddress: null, alternatives: [] };
        }
    }

    /**
     * Парсинг результата сегментации
     * @param {string} content - текст ответа AI
     * @returns {object} - распарсенный результат
     */
    parseSegmentation(content) {
        try {
            return JSON.parse(content);
        } catch (error) {
            this.log('error', 'Failed to parse segmentation result', { content });
            return { segments: [] };
        }
    }

    // === Управление провайдерами ===

    /**
     * Смена активного провайдера
     * @param {string} providerName - имя нового провайдера
     * @param {object} config - конфигурация провайдера
     */
    async switchProvider(providerName, config = {}) {
        try {
            const newProvider = this.providerFactory.create(providerName, config);
            
            // Проверяем доступность
            const isAvailable = await newProvider.isAvailable();
            if (!isAvailable) {
                throw new Error(`Provider ${providerName} is not available`);
            }

            const oldProvider = this.currentProvider;
            this.currentProvider = newProvider;

            // Обновляем настройки
            this.settings.primaryProvider = providerName;
            await this.saveSettings();

            this.emit('ai-provider-switched', {
                from: oldProvider?.provider,
                to: providerName
            });

            this.log('info', `Switched to provider: ${providerName}`);

        } catch (error) {
            this.errorHandler.handleError('AI_PROVIDER_SWITCH_FAILED', error);
            throw error;
        }
    }

    /**
     * Получение статистики использования AI
     * @returns {object} - статистика
     */
    getUsageStats() {
        const factoryStats = this.providerFactory.getUsageStats();
        const currentStats = this.currentProvider ? {
            [this.currentProvider.provider]: this.currentProvider.getStats()
        } : {};

        return {
            factory: factoryStats,
            current: currentStats,
            fallbacks: this.fallbackProviders.map(p => ({
                provider: p.provider,
                stats: p.getStats()
            }))
        };
    }

    /**
     * Получение информации о доступных провайдерах
     * @returns {object[]} - информация о провайдерах
     */
    getAvailableProviders() {
        return this.providerFactory.getAllProvidersInfo();
    }

    // === Логирование и события ===

    /**
     * Логирование успешного запроса
     */
    logSuccess(provider, response, duration) {
        this.log('info', 'AI request completed successfully', {
            provider: provider.provider,
            duration: `${duration}ms`,
            tokensUsed: response.usage.totalTokens,
            cost: `$${response.cost.toFixed(4)}`
        });
    }

    /**
     * Логирование ошибки
     */
    logError(error, duration) {
        this.log('error', 'AI request failed', {
            error: error.message,
            duration: `${duration}ms`
        });
    }

    /**
     * Универсальное логирование
     */
    log(level, message, data = {}) {
        console[level](`[UniversalAI] ${message}`, data);
    }

    /**
     * Отправка события
     */
    emit(eventName, data) {
        if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(eventName, data);
        }
    }

    /**
     * Проверка доступности AI сервисов
     * @returns {boolean} - доступен ли хотя бы один провайдер
     */
    async isAvailable() {
        // Если есть активный провайдер, проверяем его доступность
        if (this.currentProvider) {
            try {
                return await this.currentProvider.isAvailable();
            } catch (error) {
                this.log('warn', 'Current provider availability check failed:', error.message);
            }
        }

        // Проверяем fallback провайдеров
        for (const provider of this.fallbackProviders) {
            try {
                const available = await provider.isAvailable();
                if (available) return true;
            } catch (error) {
                this.log('warn', `Fallback provider ${provider.provider} availability check failed:`, error.message);
            }
        }

        // Если провайдеры не инициализированы, но есть учетные данные, считаем доступным
        if (!this.currentProvider && this.fallbackProviders.length === 0) {
            const availableProviders = await this.getAvailableProviders();
            return availableProviders.length > 0;
        }

        return false;
    }

    /**
     * Получение списка доступных провайдеров (с учетными данными)
     * @returns {Promise<string[]>} - массив имен доступных провайдеров
     */
    async getAvailableProviders() {
        const availableProviders = [];
        const allProviders = ['yandex', 'claude', 'openai', 'gigachat'];

        for (const providerName of allProviders) {
            try {
                const config = await this.getProviderConfig(providerName);
                if (this.hasRequiredCredentials(providerName, config)) {
                    availableProviders.push(providerName);
                }
            } catch (error) {
                // Игнорируем ошибки при проверке конфигурации
            }
        }

        return availableProviders;
    }

    /**
     * Уничтожение сервиса
     */
    destroy() {
        if (this.currentProvider) {
            this.currentProvider.destroy();
        }

        this.fallbackProviders.forEach(provider => {
            if (provider.destroy) provider.destroy();
        });

        this.providerFactory.clearCache();
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UniversalAIService;
} else {
    window.UniversalAIService = UniversalAIService;
}