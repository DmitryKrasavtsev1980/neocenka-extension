/**
 * Инициализация AI сервисов для страницы настроек
 * Регистрирует все необходимые зависимости в DIContainer
 */

(function() {
    'use strict';
    
    // Ждём загрузки всех зависимостей
    if (typeof window.DIContainer === 'undefined' || 
        typeof window.EventBus === 'undefined' ||
        typeof window.DataState === 'undefined') {
        console.warn('⚠️ AI Settings Init: Ждём загрузки зависимостей...');
        setTimeout(arguments.callee, 100);
        return;
    }
    
    console.log('🚀 Инициализация AI сервисов для страницы настроек...');
    
    // Создаём глобальный DIContainer если его еще нет
    if (!window.diContainer) {
        window.diContainer = new DIContainer();
        console.log('✅ DIContainer создан');
    }
    
    const container = window.diContainer;
    
    // Регистрация базовых сервисов
    if (!container.has('EventBus')) {
        container.registerSingleton('EventBus', EventBus);
        console.log('✅ EventBus зарегистрирован');
    }
    
    if (!container.has('DataState')) {
        container.registerSingleton('DataState', DataState);
        console.log('✅ DataState зарегистрирован');
    }
    
    if (!container.has('ValidationService')) {
        container.registerSingleton('ValidationService', ValidationService);
        console.log('✅ ValidationService зарегистрирован');
    }
    
    if (!container.has('ConfigService')) {
        // ВАЖНО: Сначала проверяем, есть ли уже глобальный экземпляр
        if (!window.configService) {
            window.configService = new ConfigService();
            console.log('📝 Создан новый глобальный ConfigService');
        }
        
        // Регистрируем как фабрику, которая всегда возвращает глобальный экземпляр
        container.register('ConfigService', () => window.configService);
        console.log('✅ ConfigService зарегистрирован (используется глобальный экземпляр)');
    }
    
    if (!container.has('ErrorHandlingService')) {
        container.registerSingleton('ErrorHandlingService', ErrorHandlingService);
        console.log('✅ ErrorHandlingService зарегистрирован');
    }
    
    // Регистрация AI провайдеров
    if (typeof YandexProvider !== 'undefined' && !container.has('YandexProvider')) {
        container.registerFactory('YandexProvider', (config) => new YandexProvider(config));
        console.log('✅ YandexProvider зарегистрирован');
    }
    
    if (typeof ClaudeProvider !== 'undefined' && !container.has('ClaudeProvider')) {
        container.registerFactory('ClaudeProvider', (config) => new ClaudeProvider(config));
        console.log('✅ ClaudeProvider зарегистрирован');
    }
    
    // Регистрация LLMProviderFactory
    if (typeof LLMProviderFactory !== 'undefined' && !container.has('LLMProviderFactory')) {
        container.registerSingleton('LLMProviderFactory', () => {
            const eventBus = container.get('EventBus');
            const configService = container.get('ConfigService');
            const factory = new LLMProviderFactory(container, eventBus, configService);
            
            // Регистрируем провайдеры вручную, если они не были зарегистрированы автоматически
            if (typeof YandexProvider !== 'undefined' && !factory.hasProvider('yandex')) {
                factory.registerProvider('yandex', YandexProvider, {
                    name: 'YandexGPT',
                    description: 'Российский AI сервис, оптимизированный для русского языка',
                    features: ['russian-optimized', 'cost-effective', 'local-hosting'],
                    costLevel: 'low',
                    quality: 'good',
                    languages: ['ru', 'en'],
                    defaultConfig: {
                        model: 'yandexgpt-lite/latest',
                        temperature: 0.6,
                        maxTokens: 2000
                    }
                });
                console.log('✅ YandexProvider зарегистрирован в фабрике');
            }
            
            if (typeof ClaudeProvider !== 'undefined' && !factory.hasProvider('claude')) {
                factory.registerProvider('claude', ClaudeProvider, {
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
                console.log('✅ ClaudeProvider зарегистрирован в фабрике');
            }
            
            return factory;
        });
        console.log('✅ LLMProviderFactory зарегистрирован');
    }
    
    // Регистрация UniversalAIService
    if (typeof UniversalAIService !== 'undefined' && !container.has('UniversalAIService')) {
        container.registerSingleton('UniversalAIService', () => {
            const factory = container.get('LLMProviderFactory');
            // ВАЖНО: Всегда используем глобальный ConfigService для синхронизации настроек
            const configService = window.configService || container.get('ConfigService');
            const eventBus = container.get('EventBus');
            const errorHandler = container.get('ErrorHandlingService');
            
            const service = new UniversalAIService(factory, configService, eventBus, errorHandler);
            
            // Инициализируем сервис
            service.initialize().then(() => {
                console.log('✅ UniversalAIService инициализирован');
            }).catch(error => {
                console.warn('⚠️ Ошибка инициализации UniversalAIService:', error);
            });
            
            return service;
        });
        console.log('✅ UniversalAIService зарегистрирован');
    }
    
    console.log('✅ Все AI сервисы зарегистрированы в DIContainer');
    
    // Запускаем событие готовности AI
    if (window.EventBus) {
        const eventBus = container.get('EventBus');
        eventBus.emit('ai:services:ready', { container });
    }
    
})();