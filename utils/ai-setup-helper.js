/**
 * AI Setup Helper - вспомогательный скрипт для быстрой настройки AI провайдеров
 * Можно запустить в консоли браузера для настройки API-ключей
 */

class AISetupHelper {
    constructor() {
        this.configService = window.diContainer?.get('ConfigService');
        if (!this.configService) {
            console.error('❌ ConfigService недоступен. Убедитесь, что расширение загружено.');
            return;
        }
    }

    /**
     * Настройка YandexGPT провайдера
     * @param {string} apiKey - API ключ YandexGPT
     * @param {string} folderId - Folder ID из Yandex Cloud
     * @param {string} model - модель (по умолчанию yandexgpt-lite)
     */
    async setupYandexGPT(apiKey, folderId, model = 'yandexgpt-lite') {
        try {
            const config = {
                apiKey: apiKey,
                folderId: folderId,
                model: model
            };

            await this.configService.set('ai.providers.yandex', config);
            
            console.log('✅ YandexGPT настроен успешно!');
            console.log('Конфигурация:', {
                folderId: folderId,
                model: model,
                apiKey: apiKey.substring(0, 10) + '...'
            });

            // Перезагружаем AI сервис
            await this.reloadAIService();
            
        } catch (error) {
            console.error('❌ Ошибка настройки YandexGPT:', error);
        }
    }

    /**
     * Настройка Claude провайдера
     * @param {string} apiKey - API ключ Claude
     * @param {string} model - модель (по умолчанию claude-3-sonnet-20240229)
     */
    async setupClaude(apiKey, model = 'claude-3-sonnet-20240229') {
        try {
            const config = {
                apiKey: apiKey,
                model: model
            };

            await this.configService.set('ai.providers.claude', config);
            
            console.log('✅ Claude настроен успешно!');
            console.log('Конфигурация:', {
                model: model,
                apiKey: apiKey.substring(0, 10) + '...'
            });

            // Перезагружаем AI сервис
            await this.reloadAIService();
            
        } catch (error) {
            console.error('❌ Ошибка настройки Claude:', error);
        }
    }

    /**
     * Настройка основных параметров AI
     * @param {string} primaryProvider - основной провайдер (yandex, claude)
     * @param {boolean} enabled - включен ли AI-чат
     */
    async setupAIGeneral(primaryProvider = 'yandex', enabled = true) {
        try {
            const aiConfig = {
                primaryProvider: primaryProvider,
                fallbackChain: primaryProvider === 'yandex' ? ['yandex', 'claude'] : ['claude', 'yandex'],
                costOptimization: true,
                autoLanguageDetection: true,
                maxRetries: 3,
                budget: {
                    daily: 1.0,
                    perRequest: 0.05
                }
            };

            const chatConfig = {
                enabled: enabled,
                autoOpen: false,
                preferredProvider: primaryProvider,
                maxHistoryMessages: 50
            };

            await this.configService.set('ai', aiConfig);
            await this.configService.set('aiChat', chatConfig);

            console.log('✅ Общие настройки AI обновлены!');
            console.log('Основной провайдер:', primaryProvider);

            // Перезагружаем AI сервис
            await this.reloadAIService();

        } catch (error) {
            console.error('❌ Ошибка настройки общих параметров AI:', error);
        }
    }

    /**
     * Перезагрузка AI сервиса
     */
    async reloadAIService() {
        try {
            // Получаем текущий AI сервис
            const universalAI = window.diContainer?.get('UniversalAIService');
            const aiInterface = window.diContainer?.get('AIChatInterface');

            if (universalAI) {
                // Перезапускаем AI сервис
                await universalAI.initialize();
                console.log('🔄 UniversalAIService перезагружен');
            }

            if (aiInterface) {
                // Проверяем доступность
                setTimeout(async () => {
                    const available = await universalAI.isAvailable();
                    console.log('🔍 AI доступность:', available);
                    
                    if (available) {
                        console.log('🎉 AI-ассистент готов к работе!');
                        console.log('Попробуйте нажать на кнопку чата в правом нижнем углу.');
                    } else {
                        console.log('⚠️ AI-ассистент пока недоступен. Проверьте настройки API-ключей.');
                    }
                }, 1000);
            }

        } catch (error) {
            console.error('❌ Ошибка перезагрузки AI сервиса:', error);
        }
    }

    /**
     * Просмотр текущих настроек AI
     */
    async showCurrentConfig() {
        try {
            const aiConfig = await this.configService.get('ai');
            const chatConfig = await this.configService.get('aiChat');
            const yandexConfig = await this.configService.get('ai.providers.yandex');
            const claudeConfig = await this.configService.get('ai.providers.claude');

            console.log('📋 Текущие настройки AI:');
            console.log('Общие настройки:', aiConfig);
            console.log('Настройки чата:', chatConfig);
            
            if (yandexConfig && yandexConfig.apiKey) {
                console.log('YandexGPT:', {
                    configured: true,
                    folderId: yandexConfig.folderId,
                    model: yandexConfig.model,
                    apiKey: yandexConfig.apiKey.substring(0, 10) + '...'
                });
            } else {
                console.log('YandexGPT: не настроен');
            }

            if (claudeConfig && claudeConfig.apiKey) {
                console.log('Claude:', {
                    configured: true,
                    model: claudeConfig.model,
                    apiKey: claudeConfig.apiKey.substring(0, 10) + '...'
                });
            } else {
                console.log('Claude: не настроен');
            }

            // Проверка доступности
            const universalAI = window.diContainer?.get('UniversalAIService');
            if (universalAI) {
                const available = await universalAI.isAvailable();
                const availableProviders = await universalAI.getAvailableProviders();
                console.log('🔍 Статус доступности:', available);
                console.log('📡 Доступные провайдеры:', availableProviders);
            }

        } catch (error) {
            console.error('❌ Ошибка получения настроек:', error);
        }
    }

    /**
     * Быстрая настройка для тестирования (демо-режим)
     */
    async setupDemo() {
        console.log('⚠️ Демо-режим: Настройка тестовой конфигурации без реальных API-ключей');
        
        // Включаем AI-чат но с предупреждением об отсутствии ключей
        await this.setupAIGeneral('yandex', true);
        
        console.log('✅ Демо-режим активирован');
        console.log('💡 Для полноценной работы добавьте реальные API-ключи:');
        console.log('   aiSetup.setupYandexGPT("YOUR_API_KEY", "YOUR_FOLDER_ID")');
    }

    /**
     * Очистка всех настроек AI
     */
    async clearAllSettings() {
        try {
            await this.configService.remove('ai');
            await this.configService.remove('aiChat');
            await this.configService.remove('ai.providers.yandex');
            await this.configService.remove('ai.providers.claude');
            
            console.log('🗑️ Все настройки AI очищены');
            
        } catch (error) {
            console.error('❌ Ошибка очистки настроек:', error);
        }
    }
}

// Создаем глобальный экземпляр для удобства использования в консоли
if (typeof window !== 'undefined') {
    window.aiSetup = new AISetupHelper();
    
    // Выводим инструкции в консоль
    console.log(`
🤖 AI Setup Helper загружен!

Быстрые команды:
- aiSetup.setupYandexGPT("API_KEY", "FOLDER_ID") - настроить YandexGPT
- aiSetup.setupClaude("API_KEY") - настроить Claude
- aiSetup.setupAIGeneral("yandex") - выбрать основной провайдер
- aiSetup.showCurrentConfig() - показать текущие настройки
- aiSetup.setupDemo() - демо-режим для тестирования
- aiSetup.clearAllSettings() - очистить все настройки

Пример настройки YandexGPT:
aiSetup.setupYandexGPT("AQVN...", "b1g2ab3c4def5gh6");
`);
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AISetupHelper;
}