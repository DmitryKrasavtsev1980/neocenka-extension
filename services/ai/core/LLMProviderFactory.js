/**
 * LLMProviderFactory - фабрика для создания провайдеров LLM
 * Централизованное создание и управление экземплярами провайдеров
 */

class LLMProviderFactory {
    constructor() {
        // Реестр доступных провайдеров
        this.providers = new Map();
        this.instances = new Map(); // Кэш созданных экземпляров
        
        // Регистрируем встроенные провайдеры
        this.registerDefaultProviders();
    }

    /**
     * Регистрация встроенных провайдеров
     */
    registerDefaultProviders() {
        // Проверяем, что провайдеры доступны перед регистрацией
        if (typeof ClaudeProvider !== 'undefined') {
            this.registerProvider('claude', ClaudeProvider, {
            name: 'Claude (Anthropic)',
            description: 'Высококачественный AI от Anthropic с большим контекстом',
            features: ['large-context', 'reasoning', 'coding', 'analysis'],
            costLevel: 'high',
            quality: 'excellent',
            languages: ['en', 'ru', 'multi'],
            defaultConfig: {
                model: 'claude-3-sonnet-20240229',
                temperature: 0.7,
                maxTokens: 1024
            }
            });
        } else {
            console.warn('ClaudeProvider не загружен, пропускаем регистрацию');
        }

        if (typeof YandexProvider !== 'undefined') {
            this.registerProvider('yandex', YandexProvider, {
            name: 'YandexGPT',
            description: 'Российский AI сервис, оптимизированный для русского языка',
            features: ['russian-optimized', 'cost-effective', 'local-hosting'],
            costLevel: 'low',
            quality: 'good',
            languages: ['ru', 'en'],
            defaultConfig: {
                model: 'yandexgpt-lite',
                temperature: 0.6,
                maxTokens: 2000
            }
            });
        } else {
            console.warn('YandexProvider не загружен, пропускаем регистрацию');
        }

        // Заглушки для будущих провайдеров
        this.registerProvider('openai', null, {
            name: 'OpenAI GPT',
            description: 'Популярный AI сервис от OpenAI',
            features: ['versatile', 'high-quality', 'popular'],
            costLevel: 'medium',
            quality: 'excellent',
            languages: ['en', 'multi'],
            status: 'planned'
        });

        this.registerProvider('gigachat', null, {
            name: 'GigaChat (Sber)',
            description: 'Российский AI сервис от Сбера',
            features: ['russian-language', 'free-tier', 'local-hosting'],
            costLevel: 'free',
            quality: 'good',
            languages: ['ru', 'en'],
            status: 'planned'
        });
    }

    /**
     * Регистрация нового провайдера
     * @param {string} name - имя провайдера
     * @param {Class} providerClass - класс провайдера
     * @param {object} metadata - метаданные провайдера
     */
    registerProvider(name, providerClass, metadata = {}) {
        this.providers.set(name, {
            class: providerClass,
            metadata: {
                name: metadata.name || name,
                description: metadata.description || '',
                features: metadata.features || [],
                costLevel: metadata.costLevel || 'unknown',
                quality: metadata.quality || 'unknown',
                languages: metadata.languages || ['en'],
                status: metadata.status || 'available',
                defaultConfig: metadata.defaultConfig || {},
                ...metadata
            }
        });
    }

    /**
     * Проверка, зарегистрирован ли провайдер
     * @param {string} name - имя провайдера
     * @returns {boolean} true если провайдер зарегистрирован
     */
    hasProvider(name) {
        return this.providers.has(name.toLowerCase());
    }
    
    /**
     * Создание экземпляра провайдера
     * @param {string} name - имя провайдера
     * @param {object} config - конфигурация провайдера
     * @param {boolean} useCache - использовать кэш экземпляров
     * @returns {BaseLLMService} - экземпляр провайдера
     */
    create(name, config = {}, useCache = true) {
        if (!name) {
            throw new Error('Provider name is required');
        }

        const providerInfo = this.providers.get(name.toLowerCase());
        if (!providerInfo) {
            throw new Error(`Unknown provider: ${name}. Available providers: ${this.getAvailableProviders().join(', ')}`);
        }

        if (!providerInfo.class) {
            throw new Error(`Provider ${name} is not implemented yet (status: ${providerInfo.metadata.status})`);
        }

        // Генерируем ключ для кэша
        const cacheKey = `${name}-${JSON.stringify(config)}`;
        
        // Проверяем кэш
        if (useCache && this.instances.has(cacheKey)) {
            return this.instances.get(cacheKey);
        }

        try {
            // Объединяем конфигурацию по умолчанию с переданной
            const mergedConfig = {
                ...providerInfo.metadata.defaultConfig,
                ...config,
                provider: name.toLowerCase()
            };

            // Создаем экземпляр
            const instance = new providerInfo.class(mergedConfig);
            
            // Сохраняем в кэш
            if (useCache) {
                this.instances.set(cacheKey, instance);
            }

            return instance;

        } catch (error) {
            throw new Error(`Failed to create ${name} provider: ${error.message}`);
        }
    }

    /**
     * Создание провайдера с автоматическим выбором конфигурации
     * @param {object} requirements - требования к провайдеру
     * @returns {BaseLLMService} - экземпляр оптимального провайдера
     */
    createOptimal(requirements = {}) {
        const {
            language = 'auto',
            costLevel = 'any',
            quality = 'good',
            features = [],
            taskType = 'general'
        } = requirements;

        const optimal = this.selectOptimalProvider(requirements);
        
        if (!optimal) {
            throw new Error('No suitable provider found for the given requirements');
        }

        return this.create(optimal.name, optimal.config);
    }

    /**
     * Выбор оптимального провайдера на основе требований
     * @param {object} requirements - требования
     * @returns {object} - информация об оптимальном провайдере
     */
    selectOptimalProvider(requirements) {
        const {
            language = 'auto',
            costLevel = 'any',
            quality = 'good',
            features = [],
            taskType = 'general',
            budget = null
        } = requirements;

        const available = this.getAvailableProviders(true);
        const candidates = [];

        for (const providerName of available) {
            const info = this.providers.get(providerName);
            const metadata = info.metadata;
            let score = 0;

            // Оценка по языку
            if (language === 'ru' && metadata.languages.includes('ru')) {
                score += 10;
                if (metadata.features.includes('russian-optimized')) {
                    score += 5;
                }
            }

            // Оценка по стоимости
            const costScores = { free: 15, low: 12, medium: 8, high: 5 };
            score += costScores[metadata.costLevel] || 0;

            // Оценка по качеству
            const qualityScores = { excellent: 10, good: 7, fair: 4 };
            if (quality === 'excellent' && metadata.quality === 'excellent') {
                score += 10;
            } else if (quality === 'good' && ['good', 'excellent'].includes(metadata.quality)) {
                score += 7;
            }

            // Оценка по функциям
            const matchedFeatures = features.filter(f => metadata.features.includes(f));
            score += matchedFeatures.length * 2;

            // Оценка по типу задачи
            if (taskType === 'analysis' && metadata.features.includes('analysis')) {
                score += 5;
            }
            if (taskType === 'russian' && metadata.features.includes('russian-optimized')) {
                score += 8;
            }

            candidates.push({
                name: providerName,
                score: score,
                metadata: metadata,
                config: this.getOptimalConfig(providerName, requirements)
            });
        }

        // Сортируем по убыванию оценки
        candidates.sort((a, b) => b.score - a.score);

        return candidates.length > 0 ? candidates[0] : null;
    }

    /**
     * Получение оптимальной конфигурации для провайдера
     * @param {string} providerName - имя провайдера
     * @param {object} requirements - требования
     * @returns {object} - конфигурация
     */
    getOptimalConfig(providerName, requirements) {
        const provider = this.providers.get(providerName);
        const config = { ...provider.metadata.defaultConfig };

        // Корректировки конфигурации на основе требований
        if (requirements.taskType === 'creative') {
            config.temperature = 0.9;
        } else if (requirements.taskType === 'analysis') {
            config.temperature = 0.3;
        }

        if (requirements.maxTokens) {
            config.maxTokens = requirements.maxTokens;
        }

        return config;
    }

    /**
     * Получение списка доступных провайдеров
     * @param {boolean} onlyImplemented - только реализованные провайдеры
     * @returns {string[]} - список имен провайдеров
     */
    getAvailableProviders(onlyImplemented = false) {
        const providers = Array.from(this.providers.keys());
        
        if (onlyImplemented) {
            return providers.filter(name => {
                const info = this.providers.get(name);
                return info.class && info.metadata.status !== 'planned';
            });
        }

        return providers;
    }

    /**
     * Получение информации о провайдере
     * @param {string} name - имя провайдера
     * @returns {object} - информация о провайдере
     */
    getProviderInfo(name) {
        const provider = this.providers.get(name.toLowerCase());
        if (!provider) {
            throw new Error(`Provider ${name} not found`);
        }

        return {
            name: name,
            ...provider.metadata,
            isImplemented: !!provider.class,
            isAvailable: provider.class && provider.metadata.status === 'available'
        };
    }

    /**
     * Получение информации о всех провайдерах
     * @returns {object[]} - массив информации о провайдерах
     */
    getAllProvidersInfo() {
        return Array.from(this.providers.keys()).map(name => this.getProviderInfo(name));
    }

    /**
     * Создание нескольких провайдеров для fallback
     * @param {string[]} providers - список провайдеров в порядке приоритета
     * @param {object} baseConfig - базовая конфигурация
     * @returns {BaseLLMService[]} - массив экземпляров провайдеров
     */
    createFallbackChain(providers, baseConfig = {}) {
        const instances = [];
        
        for (const providerName of providers) {
            try {
                const instance = this.create(providerName, baseConfig);
                instances.push(instance);
            } catch (error) {
                console.warn(`Failed to create fallback provider ${providerName}:`, error.message);
            }
        }

        if (instances.length === 0) {
            throw new Error('No fallback providers could be created');
        }

        return instances;
    }

    /**
     * Очистка кэша экземпляров
     */
    clearCache() {
        // Уничтожаем экземпляры, если у них есть метод destroy
        for (const instance of this.instances.values()) {
            if (typeof instance.destroy === 'function') {
                try {
                    instance.destroy();
                } catch (error) {
                    console.warn('Error destroying provider instance:', error);
                }
            }
        }

        this.instances.clear();
    }

    /**
     * Получение статистики использования провайдеров
     * @returns {object} - статистика по провайдерам
     */
    getUsageStats() {
        const stats = {};
        
        for (const [key, instance] of this.instances.entries()) {
            const [providerName] = key.split('-');
            if (!stats[providerName]) {
                stats[providerName] = {
                    instancesCount: 0,
                    totalRequests: 0,
                    totalTokens: 0,
                    totalCost: 0,
                    errors: 0
                };
            }

            stats[providerName].instancesCount++;
            
            if (typeof instance.getStats === 'function') {
                const instanceStats = instance.getStats();
                stats[providerName].totalRequests += instanceStats.requestsCount || 0;
                stats[providerName].totalTokens += instanceStats.tokensUsed || 0;
                stats[providerName].totalCost += instanceStats.totalCost || 0;
                stats[providerName].errors += instanceStats.errors || 0;
            }
        }

        return stats;
    }
}

// Создаем синглтон фабрики
const llmProviderFactory = new LLMProviderFactory();

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LLMProviderFactory, llmProviderFactory };
} else {
    window.LLMProviderFactory = LLMProviderFactory;
    window.llmProviderFactory = llmProviderFactory;
}