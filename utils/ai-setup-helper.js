/**
 * AI Setup Helper - вспомогательный скрипт для быстрой настройки AI провайдеров
 * Можно запустить в консоли браузера для настройки API-ключей
 */

class AISetupHelper {
    constructor() {
        // Пробуем получить ConfigService из DIContainer или используем глобальный
        try {
            this.configService = window.diContainer?.get('ConfigService');
        } catch (e) {
            // Если не получилось из контейнера, используем глобальный
            this.configService = window.configService;
        }
        
        if (!this.configService) {
            // Если все еще нет, создаем глобальный экземпляр
            window.configService = new ConfigService();
            this.configService = window.configService;
            console.log('📝 Создан новый экземпляр ConfigService');
        }
    }

    /**
     * Настройка YandexGPT провайдера
     * @param {string} apiKey - API ключ YandexGPT
     * @param {string} folderId - Folder ID из Yandex Cloud
     * @param {string} model - модель (по умолчанию yandexgpt-lite/latest)
     */
    async setupYandexGPT(apiKey, folderId, model = 'yandexgpt-lite/latest') {
        try {
            const config = {
                apiKey: apiKey,
                folderId: folderId,
                model: model
            };

            // Сохраняем в ConfigService
            await this.configService.set('ai.providers.yandex', config);
            
            // Сохраняем в Chrome Storage
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await this.configService.saveToStorage(chrome.storage);
            }

            // ВАЖНО: Также сохраняем в IndexedDB для совместимости с UI формой
            if (window.db) {
                await window.db.set('settings', 'yandex_api_key', apiKey);
                await window.db.set('settings', 'yandex_folder_id', folderId);
                await window.db.set('settings', 'yandex_model', model);
                console.log('💾 Настройки YandexGPT сохранены в IndexedDB');
            }
            
            console.log('✅ YandexGPT настроен успешно!');
            console.log('Конфигурация:', {
                folderId: folderId,
                model: model,
                apiKey: apiKey.substring(0, 10) + '...'
            });

            // Синхронизируем настройки в ConfigService из базы данных
            await this.syncConfigFromDatabase();

            // Перезагружаем AI сервис
            await this.reloadAIService();
            
        } catch (error) {
            console.error('❌ Ошибка настройки YandexGPT:', error);
        }
    }

    /**
     * Синхронизирует настройки AI из IndexedDB в ConfigService
     */
    async syncConfigFromDatabase() {
        try {
            if (!window.db) {
                console.warn('⚠️ База данных недоступна для синхронизации настроек');
                return;
            }

            // Загружаем настройки YandexGPT из базы
            const yandexApiKey = await window.db.get('settings', 'yandex_api_key');
            const yandexFolderId = await window.db.get('settings', 'yandex_folder_id');  
            const yandexModel = await window.db.get('settings', 'yandex_model');

            if (yandexApiKey && yandexFolderId) {
                const yandexConfig = {
                    apiKey: yandexApiKey,
                    folderId: yandexFolderId,
                    model: yandexModel || 'yandexgpt-lite/latest'
                };
                
                this.configService.set('ai.providers.yandex', yandexConfig);
                console.log('🔄 Настройки YandexGPT синхронизированы из базы данных');
            }

            // Можно добавить синхронизацию других провайдеров
            const claudeApiKey = await window.db.get('settings', 'claude_api_key');
            if (claudeApiKey) {
                const claudeModel = await window.db.get('settings', 'claude_model');
                const claudeConfig = {
                    apiKey: claudeApiKey,
                    model: claudeModel || 'claude-3-sonnet-20240229'
                };
                
                this.configService.set('ai.providers.claude', claudeConfig);
                console.log('🔄 Настройки Claude синхронизированы из базы данных');
            }

        } catch (error) {
            console.error('❌ Ошибка синхронизации настроек из базы данных:', error);
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
            
            // Сохраняем в Chrome Storage
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await this.configService.saveToStorage(chrome.storage);
            }
            
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

            // Сохраняем в Chrome Storage
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await this.configService.saveToStorage(chrome.storage);
            }

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
            // Сначала удаляем старый экземпляр UniversalAIService из контейнера
            if (window.diContainer && window.diContainer.has('UniversalAIService')) {
                // Удаляем из кэша синглтонов
                if (window.diContainer.singletons) {
                    window.diContainer.singletons.delete('UniversalAIService');
                }
            }
            
            // Получаем новый экземпляр AI сервиса (он будет создан заново с новыми настройками)
            const universalAI = window.diContainer?.get('UniversalAIService');
            
            // Проверяем, есть ли AIChatInterface (он может отсутствовать на странице настроек)
            let aiInterface = null;
            try {
                aiInterface = window.diContainer?.get('AIChatInterface');
            } catch (e) {
                console.log('📝 AIChatInterface не загружен (это нормально для страницы настроек)');
            }

            if (universalAI) {
                console.log('🔄 UniversalAIService создан заново с актуальными настройками');
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
            } else if (universalAI) {
                // Если AIChatInterface нет, просто проверяем доступность сервиса
                const available = await universalAI.isAvailable();
                const providers = await universalAI.getAvailableProviders();
                console.log('🔍 AI сервис доступен:', available);
                console.log('📡 Доступные провайдеры:', providers);
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