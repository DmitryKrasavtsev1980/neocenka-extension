/**
 * Фабрика провайдеров для обновления объявлений
 * Автоматически определяет и создает подходящий провайдер для источника объявлений
 * Поддерживает только сайты: Cian и Avito (Inpars - это API сервис, не источник для обновления)
 */
class ListingUpdateProviderFactory {
    constructor() {
        this.providers = new Map();
        this.initialized = false;
        this.debugEnabled = false;
        
        // Регистрация известных провайдеров
        this.registerKnownProviders();
    }

    /**
     * Регистрация известных провайдеров
     */
    registerKnownProviders() {
        // Регистрируем провайдеры только для сайтов (не API сервисов)
        this.providerConfigs = {
            'cian': {
                className: 'CianListingUpdateService',
                sources: ['cian'],
                priority: 1,
                available: () => typeof CianListingUpdateService !== 'undefined'
            },
            'avito': {
                className: 'AvitoListingUpdateService', 
                sources: ['avito'],
                priority: 2,
                available: () => typeof AvitoListingUpdateService !== 'undefined'
            }
        };
    }

    /**
     * Инициализация фабрики
     * @param {Object} dependencies - Зависимости системы
     */
    async initialize(dependencies = {}) {
        try {
            this.debugEnabled = await this.isDebugEnabled(dependencies.db);
            
            // Инициализируем доступные провайдеры
            for (const [providerName, config] of Object.entries(this.providerConfigs)) {
                if (config.available()) {
                    await this.initializeProvider(providerName, config, dependencies);
                }
            }
            
            this.initialized = true;
            // ListingUpdateProviderFactory инициализирована
            
        } catch (error) {
            console.error('❌ Ошибка инициализации ListingUpdateProviderFactory:', error);
            throw error;
        }
    }

    /**
     * Инициализация конкретного провайдера
     * @param {string} providerName - Имя провайдера
     * @param {Object} config - Конфигурация провайдера
     * @param {Object} dependencies - Зависимости системы
     */
    async initializeProvider(providerName, config, dependencies) {
        try {
            const ProviderClass = window[config.className];
            if (!ProviderClass) {
                await this.debugLog(`Провайдер ${config.className} не найден`);
                return;
            }

            const provider = new ProviderClass();
            
            // Инициализируем провайдер если у него есть метод initialize
            if (typeof provider.initialize === 'function') {
                await provider.initialize(dependencies);
            }

            this.providers.set(providerName, provider);
            // Провайдер инициализирован
            
        } catch (error) {
            await this.debugLog(`Ошибка инициализации провайдера ${providerName}:`, error.message);
        }
    }

    /**
     * Получение провайдера для источника
     * @param {string} source - Название источника (cian, avito)
     * @returns {BaseListingUpdateService|null} Провайдер или null
     */
    getProvider(source) {
        if (!this.initialized) {
            console.warn('⚠️ ListingUpdateProviderFactory не инициализирована');
            return null;
        }

        const normalizedSource = source.toLowerCase();
        
        // Ищем прямое совпадение
        if (this.providers.has(normalizedSource)) {
            return this.providers.get(normalizedSource);
        }

        // Ищем провайдер, который поддерживает этот источник
        for (const [providerName, provider] of this.providers) {
            const supportedSources = provider.getSupportedSources();
            if (supportedSources.includes(normalizedSource)) {
                return provider;
            }
        }

        return null;
    }

    /**
     * Автоматическое определение провайдера по URL объявления
     * @param {string} url - URL объявления
     * @returns {BaseListingUpdateService|null} Провайдер или null
     */
    getProviderForUrl(url) {
        if (!url) return null;

        const source = this.detectSourceFromUrl(url);
        return source ? this.getProvider(source) : null;
    }

    /**
     * Получение провайдера для множественных источников
     * @param {Array<string>|string} sources - Источники ('all' или массив)
     * @returns {Array<BaseListingUpdateService>} Массив провайдеров
     */
    getProvidersForSources(sources) {
        if (!this.initialized) {
            console.warn('⚠️ ListingUpdateProviderFactory не инициализирована');
            return [];
        }

        if (sources === 'all') {
            return Array.from(this.providers.values());
        }

        if (typeof sources === 'string') {
            const provider = this.getProvider(sources);
            return provider ? [provider] : [];
        }

        if (Array.isArray(sources)) {
            return sources
                .map(source => this.getProvider(source))
                .filter(provider => provider !== null);
        }

        return [];
    }

    /**
     * Определение источника по URL (только для сайтов с объявлениями)
     * @param {string} url - URL объявления
     * @returns {string|null} Название источника или null
     */
    detectSourceFromUrl(url) {
        if (!url) return null;
        
        const urlLower = url.toLowerCase();
        
        // Только сайты с объявлениями, которые можно парсить для обновления
        if (urlLower.includes('cian.ru')) return 'cian';
        if (urlLower.includes('avito.ru')) return 'avito';
        
        // Другие источники не поддерживаются для обновления
        // (Inpars - это API сервис, не сайт для парсинга)
        return null;
    }

    /**
     * Получение списка доступных провайдеров
     * @returns {Array<string>} Массив имен доступных провайдеров
     */
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }

    /**
     * Получение статистики провайдеров
     * @returns {Object} Статистика по провайдерам
     */
    getProvidersStats() {
        const stats = {};
        
        for (const [providerName, provider] of this.providers) {
            stats[providerName] = {
                available: true,
                supportedSources: provider.getSupportedSources(),
                serviceAvailable: provider.isServiceAvailable ? provider.isServiceAvailable() : true,
                lastUsed: provider.lastUsed || null
            };
        }

        return stats;
    }

    /**
     * Проверка доступности провайдера
     * @param {string} providerName - Имя провайдера
     * @returns {Promise<boolean>} Доступность провайдера
     */
    async isProviderAvailable(providerName) {
        const provider = this.providers.get(providerName);
        if (!provider) return false;

        if (typeof provider.isServiceAvailable === 'function') {
            return await provider.isServiceAvailable();
        }

        return true;
    }

    /**
     * Получение оптимального провайдера для источника
     * @param {string} source - Источник
     * @returns {Promise<BaseListingUpdateService|null>} Лучший провайдер
     */
    async getBestProvider(source) {
        const providers = this.getProvidersForSources([source]);
        
        if (providers.length === 0) return null;
        if (providers.length === 1) return providers[0];

        // Выбираем провайдер с наивысшим приоритетом и доступностью
        let bestProvider = null;
        let bestPriority = Infinity;

        for (const provider of providers) {
            const available = await provider.isServiceAvailable();
            if (!available) continue;

            const providerName = this.getProviderName(provider);
            const config = this.providerConfigs[providerName];
            const priority = config ? config.priority : 999;

            if (priority < bestPriority) {
                bestPriority = priority;
                bestProvider = provider;
            }
        }

        return bestProvider;
    }

    /**
     * Получение имени провайдера по экземпляру
     * @param {BaseListingUpdateService} provider - Экземпляр провайдера
     * @returns {string|null} Имя провайдера
     */
    getProviderName(provider) {
        for (const [name, prov] of this.providers) {
            if (prov === provider) return name;
        }
        return null;
    }

    /**
     * Получение информации о поддерживаемых источниках
     * @returns {Object} Информация об источниках
     */
    getSupportedSourcesInfo() {
        return {
            websites: ['cian', 'avito'], // Сайты для парсинга и обновления
            apiServices: ['inpars'], // API сервисы (не для обновления)
            currentlySupported: this.getAvailableProviders()
        };
    }

    /**
     * Проверка debug режима
     * @param {Object} db - База данных
     * @returns {Promise<boolean>} Debug режим включен
     */
    async isDebugEnabled(db) {
        try {
            if (db) {
                const debugSetting = await db.get('settings', 'debug_enabled');
                return debugSetting?.value === true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Логирование с проверкой debug режима
     * @param {...any} args - Аргументы для логирования
     */
    async debugLog(...args) {
        if (this.debugEnabled && typeof window !== 'undefined' && window.Helpers && window.Helpers.debugLog) {
            await window.Helpers.debugLog('[ListingUpdateFactory]', ...args);
        }
    }

    /**
     * Очистка ресурсов
     */
    cleanup() {
        this.providers.clear();
        this.initialized = false;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ListingUpdateProviderFactory;
} else {
    window.ListingUpdateProviderFactory = ListingUpdateProviderFactory;
}