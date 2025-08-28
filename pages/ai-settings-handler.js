/**
 * AI Settings Handler - обработчик формы настроек AI
 * Управляет сохранением/загрузкой настроек AI провайдеров в базу данных
 */

class AISettingsHandler {
    constructor() {
        this.db = null;
        this.form = null;
        
        this.init();
    }

    /**
     * Инициализация обработчика
     */
    async init() {
        // Ждем готовности базы данных
        await this.waitForDatabase();
        
        // Получаем форму
        this.form = document.getElementById('aiSettingsForm');
        if (!this.form) {
            console.warn('AI Settings Form не найдена');
            return;
        }

        // Привязываем обработчики событий
        this.bindEvents();
        
        // Загружаем существующие настройки
        await this.loadSettings();
        
        // Проверяем статус подключений
        await this.updateConnectionStatus();
        
        console.log('✅ AI Settings Handler инициализирован');
    }

    /**
     * Ожидание готовности базы данных
     */
    async waitForDatabase() {
        let attempts = 0;
        while (attempts < 50) {
            if (window.db && typeof window.db.getSettings === 'function') {
                this.db = window.db;
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        throw new Error('База данных не готова');
    }

    /**
     * Привязка обработчиков событий
     */
    bindEvents() {
        // Кнопка сохранения настроек AI
        const saveBtn = document.getElementById('saveAISettingsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // Кнопки тестирования провайдеров
        const testYandexBtn = document.getElementById('testYandexBtn');
        if (testYandexBtn) {
            testYandexBtn.addEventListener('click', () => this.testProvider('yandex'));
        }

        const testClaudeBtn = document.getElementById('testClaudeBtn');
        if (testClaudeBtn) {
            testClaudeBtn.addEventListener('click', () => this.testProvider('claude'));
        }

        // Кнопка тестирования всех провайдеров
        const testAllBtn = document.getElementById('testAllAIBtn');
        if (testAllBtn) {
            testAllBtn.addEventListener('click', () => this.testAllProviders());
        }

        // Показать/скрыть пароли
        this.addPasswordToggleHandlers();
    }

    /**
     * Добавление обработчиков для показа/скрытия паролей
     */
    addPasswordToggleHandlers() {
        const passwordFields = ['yandexApiKey', 'claudeApiKey'];
        
        passwordFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!field) return;

            // Создаем кнопку показа/скрытия пароля
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'absolute inset-y-0 right-0 pr-3 flex items-center';
            toggleBtn.innerHTML = `
                <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            `;

            // Делаем поле относительно позиционированным
            field.parentElement.style.position = 'relative';
            field.style.paddingRight = '2.5rem';
            field.parentElement.appendChild(toggleBtn);

            // Обработчик переключения видимости
            toggleBtn.addEventListener('click', () => {
                if (field.type === 'password') {
                    field.type = 'text';
                    toggleBtn.innerHTML = `
                        <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.464 8.464M9.878 9.878l-2.044-2.044m9.012 9.012l2.044 2.044M9.878 9.878L7.05 7.05m12.928 12.928L18.364 18.364M9.878 9.878l8.486 8.486M7.05 7.05L5.636 5.636m0 0l-2.044-2.044M5.636 5.636l2.044 2.044" />
                        </svg>
                    `;
                } else {
                    field.type = 'password';
                    toggleBtn.innerHTML = `
                        <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    `;
                }
            });
        });
    }

    /**
     * Загрузка существующих настроек
     */
    async loadSettings() {
        try {
            const settings = await this.db.getSettings();
            
            // Ищем настройки AI
            const aiEnabled = this.findSetting(settings, 'ai_enabled');
            const primaryProvider = this.findSetting(settings, 'ai_primary_provider');
            
            // YandexGPT настройки
            const yandexApiKey = this.findSetting(settings, 'yandex_api_key');
            const yandexFolderId = this.findSetting(settings, 'yandex_folder_id');
            const yandexModel = this.findSetting(settings, 'yandex_model');
            
            // Claude настройки
            const claudeApiKey = this.findSetting(settings, 'claude_api_key');
            const claudeModel = this.findSetting(settings, 'claude_model');

            // Заполняем форму
            this.setFieldValue('aiEnabled', aiEnabled?.value || false);
            this.setFieldValue('primaryProvider', primaryProvider?.value || 'yandex');
            
            this.setFieldValue('yandexApiKey', yandexApiKey?.value || '');
            this.setFieldValue('yandexFolderId', yandexFolderId?.value || '');
            this.setFieldValue('yandexModel', yandexModel?.value || 'yandexgpt-lite');
            
            this.setFieldValue('claudeApiKey', claudeApiKey?.value || '');
            this.setFieldValue('claudeModel', claudeModel?.value || 'claude-3-sonnet-20240229');

            console.log('✅ Настройки AI загружены');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки настроек AI:', error);
        }
    }

    /**
     * Поиск настройки по ключу
     */
    findSetting(settings, key) {
        return settings.find(s => s.key === key);
    }

    /**
     * Установка значения поля формы
     */
    setFieldValue(fieldId, value) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        if (field.type === 'checkbox') {
            field.checked = Boolean(value);
        } else {
            field.value = value;
        }
    }

    /**
     * Получение значения поля формы
     */
    getFieldValue(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return null;

        if (field.type === 'checkbox') {
            return field.checked;
        }
        return field.value;
    }

    /**
     * Сохранение настроек
     */
    async saveSettings() {
        const saveBtn = document.getElementById('saveAISettingsBtn');
        const originalText = saveBtn.textContent;
        
        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Сохранение...';

            // Собираем данные из формы
            const settings = [
                { key: 'ai_enabled', value: this.getFieldValue('aiEnabled') },
                { key: 'ai_primary_provider', value: this.getFieldValue('primaryProvider') },
                
                { key: 'yandex_api_key', value: this.getFieldValue('yandexApiKey') },
                { key: 'yandex_folder_id', value: this.getFieldValue('yandexFolderId') },
                { key: 'yandex_model', value: this.getFieldValue('yandexModel') },
                
                { key: 'claude_api_key', value: this.getFieldValue('claudeApiKey') },
                { key: 'claude_model', value: this.getFieldValue('claudeModel') }
            ];

            // Сохраняем каждую настройку
            for (const setting of settings) {
                await this.db.saveSetting(setting.key, setting.value);
            }

            // Также сохраняем в ConfigService для совместимости с AI Setup Helper
            await this.saveToConfigService();

            // Показываем успешное сообщение
            this.showNotification('✅ Настройки AI сохранены успешно', 'success');
            
            // Обновляем статус подключений
            setTimeout(() => {
                this.updateConnectionStatus();
            }, 1000);

        } catch (error) {
            console.error('❌ Ошибка сохранения настроек AI:', error);
            this.showNotification('❌ Ошибка сохранения настроек', 'error');
            
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }

    /**
     * Сохранение в ConfigService для совместимости
     */
    async saveToConfigService() {
        try {
            // Используем AI Setup Helper если доступен
            if (window.aiSetup && window.aiSetup.configService) {
                const yandexApiKey = this.getFieldValue('yandexApiKey');
                const yandexFolderId = this.getFieldValue('yandexFolderId');
                const claudeApiKey = this.getFieldValue('claudeApiKey');
                const primaryProvider = this.getFieldValue('primaryProvider');

                // Настройка YandexGPT
                if (yandexApiKey && yandexFolderId) {
                    await window.aiSetup.setupYandexGPT(yandexApiKey, yandexFolderId, this.getFieldValue('yandexModel'));
                }

                // Настройка Claude
                if (claudeApiKey) {
                    await window.aiSetup.setupClaude(claudeApiKey, this.getFieldValue('claudeModel'));
                }

                // Общие настройки
                await window.aiSetup.setupAIGeneral(primaryProvider, this.getFieldValue('aiEnabled'));
            }
        } catch (error) {
            console.warn('Не удалось синхронизировать с ConfigService:', error);
        }
    }

    /**
     * Тестирование провайдера
     */
    async testProvider(providerName) {
        const testBtn = document.getElementById(`test${providerName.charAt(0).toUpperCase() + providerName.slice(1)}Btn`);
        const originalText = testBtn.textContent;
        
        try {
            testBtn.disabled = true;
            testBtn.textContent = 'Тестирование...';

            let apiKey, additionalParams = {};
            
            if (providerName === 'yandex') {
                apiKey = this.getFieldValue('yandexApiKey');
                additionalParams.folderId = this.getFieldValue('yandexFolderId');
                additionalParams.model = this.getFieldValue('yandexModel');
            } else if (providerName === 'claude') {
                apiKey = this.getFieldValue('claudeApiKey');
                additionalParams.model = this.getFieldValue('claudeModel');
            }

            if (!apiKey) {
                this.showNotification(`❌ Введите API-ключ для ${providerName}`, 'error');
                return;
            }

            // Тестируем через AI Setup Helper
            if (window.aiSetup) {
                if (providerName === 'yandex' && additionalParams.folderId) {
                    await window.aiSetup.setupYandexGPT(apiKey, additionalParams.folderId, additionalParams.model);
                } else if (providerName === 'claude') {
                    await window.aiSetup.setupClaude(apiKey, additionalParams.model);
                }

                // Проверяем доступность
                const universalAI = window.diContainer?.get('UniversalAIService');
                if (universalAI) {
                    const isAvailable = await universalAI.isAvailable();
                    if (isAvailable) {
                        this.showNotification(`✅ ${providerName} подключен успешно`, 'success');
                        this.updateProviderStatus(providerName, 'connected');
                    } else {
                        this.showNotification(`❌ ${providerName} недоступен`, 'error');
                        this.updateProviderStatus(providerName, 'error');
                    }
                }
            }

        } catch (error) {
            console.error(`Ошибка тестирования ${providerName}:`, error);
            this.showNotification(`❌ Ошибка подключения к ${providerName}`, 'error');
            this.updateProviderStatus(providerName, 'error');
            
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = originalText;
        }
    }

    /**
     * Тестирование всех провайдеров
     */
    async testAllProviders() {
        await this.testProvider('yandex');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Пауза между тестами
        await this.testProvider('claude');
    }

    /**
     * Обновление статуса подключений
     */
    async updateConnectionStatus() {
        try {
            // Проверяем YandexGPT
            const yandexApiKey = this.getFieldValue('yandexApiKey');
            const yandexFolderId = this.getFieldValue('yandexFolderId');
            
            if (yandexApiKey && yandexFolderId) {
                this.updateProviderStatus('yandex', 'configured');
            } else {
                this.updateProviderStatus('yandex', 'not_configured');
            }

            // Проверяем Claude
            const claudeApiKey = this.getFieldValue('claudeApiKey');
            
            if (claudeApiKey) {
                this.updateProviderStatus('claude', 'configured');
            } else {
                this.updateProviderStatus('claude', 'not_configured');
            }

        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
        }
    }

    /**
     * Обновление статуса провайдера в UI
     */
    updateProviderStatus(provider, status) {
        const statusElement = document.getElementById(`${provider}Status`);
        if (!statusElement) return;

        const indicator = statusElement.querySelector('div');
        const text = statusElement.querySelector('span');

        switch (status) {
            case 'connected':
                indicator.className = 'w-3 h-3 rounded-full bg-green-400 mr-3';
                text.textContent = `${provider}: подключен`;
                text.className = 'text-sm text-green-600';
                break;
                
            case 'configured':
                indicator.className = 'w-3 h-3 rounded-full bg-yellow-400 mr-3';
                text.textContent = `${provider}: настроен`;
                text.className = 'text-sm text-yellow-600';
                break;
                
            case 'error':
                indicator.className = 'w-3 h-3 rounded-full bg-red-400 mr-3';
                text.textContent = `${provider}: ошибка подключения`;
                text.className = 'text-sm text-red-600';
                break;
                
            default:
                indicator.className = 'w-3 h-3 rounded-full bg-gray-300 mr-3';
                text.textContent = `${provider}: не настроен`;
                text.className = 'text-sm text-gray-500';
        }
    }

    /**
     * Показ уведомления
     */
    showNotification(message, type = 'info') {
        // Простое уведомление - можно заменить на более красивое
        const notification = document.createElement('div');
        notification.className = `
            fixed top-4 right-4 z-50 max-w-sm w-full
            ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'}
            text-white px-4 py-2 rounded-lg shadow-lg text-sm
            transform translate-x-0 opacity-100 transition-all duration-300
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Удаляем через 4 секунды
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('aiSettingsForm')) {
        window.aiSettingsHandler = new AISettingsHandler();
    }
});

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AISettingsHandler;
}