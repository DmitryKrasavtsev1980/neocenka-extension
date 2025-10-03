/**
 * Инициализация компонента управления дополнительными параметрами для страницы настроек
 * Следует принципам архитектуры v0.1 и SOLID
 */

class CustomParametersSettingsInitializer {
    constructor() {
        this.diContainer = null;
        this.customParametersManagerPanel = null;
        this.isInitialized = false;
    }

    /**
     * Инициализация компонента управления параметрами
     */
    async initialize() {
        try {
            if (this.isInitialized) {
                return;
            }

            console.log('🎯 Инициализация управления дополнительными параметрами в настройках...');

            // Ждем готовности базы данных
            await this.waitForDatabase();

            // Инициализируем DI контейнер
            console.log('🔧 Инициализируем DI контейнер...');

            if (window.DIContainer && typeof window.DIContainer.get === 'function') {
                console.log('✅ Используем глобальный DIContainer');
                this.diContainer = window.DIContainer;
            } else {
                console.warn('⚠️ Глобальный DIContainer недоступен');
                console.log('window.DIContainer:', window.DIContainer);
                console.log('typeof window.DIContainer:', typeof window.DIContainer);
                if (window.DIContainer) {
                    console.log('DIContainer.get:', window.DIContainer.get);
                    console.log('typeof DIContainer.get:', typeof window.DIContainer.get);
                }

                console.log('🏗️ Создаем локальную версию DI контейнера...');
                await this.initializeLocalDI();

                console.log('🔍 После создания локального DI контейнера:');
                console.log('this.diContainer:', this.diContainer);
                console.log('typeof this.diContainer.get:', typeof (this.diContainer && this.diContainer.get));
            }

            // Проверяем что DI контейнер корректен
            if (!this.diContainer || typeof this.diContainer.get !== 'function') {
                console.error('❌ Финальная проверка DI контейнера провалилась');
                console.error('❌ this.diContainer:', this.diContainer);
                console.error('❌ this.diContainer существует:', !!this.diContainer);
                console.error('❌ this.diContainer.get существует:', !!(this.diContainer && this.diContainer.get));
                console.error('❌ Тип this.diContainer.get:', typeof (this.diContainer && this.diContainer.get));
                throw new Error('DI контейнер не был правильно инициализирован');
            }

            console.log('✅ DI контейнер готов к использованию');

            // Получаем контейнер для компонента
            const container = document.getElementById('custom-parameters-manager-container');
            if (!container) {
                console.error('Контейнер для управления параметрами не найден');
                return;
            }

            // Проверяем доступность необходимых классов и констант
            if (typeof CustomParametersService === 'undefined') {
                throw new Error('CustomParametersService не загружен');
            }
            if (typeof ObjectCustomValuesService === 'undefined') {
                throw new Error('ObjectCustomValuesService не загружен');
            }
            if (typeof CustomParametersManagerPanel === 'undefined') {
                throw new Error('CustomParametersManagerPanel не загружен');
            }
            if (typeof PARAMETER_TYPES === 'undefined') {
                throw new Error('PARAMETER_TYPES константа не загружена');
            }
            if (typeof CustomParameterModel === 'undefined') {
                throw new Error('CustomParameterModel не загружен');
            }
            if (typeof ObjectCustomValueModel === 'undefined') {
                throw new Error('ObjectCustomValueModel не загружен');
            }

            console.log('🔧 Получаем сервисы из DI контейнера...');

            // Получаем сервисы из DI контейнера с обработкой ошибок
            let customParametersService, objectCustomValuesService, validationService, errorHandler;

            try {
                customParametersService = this.diContainer.get('CustomParametersService');
                console.log('✅ CustomParametersService получен');
            } catch (error) {
                console.error('❌ Ошибка получения CustomParametersService:', error);
                throw error;
            }

            try {
                objectCustomValuesService = this.diContainer.get('ObjectCustomValuesService');
                console.log('✅ ObjectCustomValuesService получен');
            } catch (error) {
                console.error('❌ Ошибка получения ObjectCustomValuesService:', error);
                throw error;
            }

            try {
                validationService = this.diContainer.get('ValidationService');
                console.log('✅ ValidationService получен');
            } catch (error) {
                console.error('❌ Ошибка получения ValidationService:', error);
                throw error;
            }

            try {
                errorHandler = this.diContainer.get('ErrorHandlingService');
                console.log('✅ ErrorHandlingService получен');
            } catch (error) {
                console.error('❌ Ошибка получения ErrorHandlingService:', error);
                throw error;
            }

            console.log('✅ Все сервисы получены успешно');

            // Создаем и инициализируем компонент управления параметрами
            this.customParametersManagerPanel = new CustomParametersManagerPanel(
                container,
                customParametersService,
                objectCustomValuesService,
                validationService,
                errorHandler
            );

            await this.customParametersManagerPanel.initialize();

            this.isInitialized = true;
            console.log('✅ Управление дополнительными параметрами успешно инициализировано');

        } catch (error) {
            console.error('❌ Ошибка инициализации управления параметрами:', error);
            this.showErrorMessage();
        }
    }

    /**
     * Ожидание готовности базы данных
     */
    async waitForDatabase() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 150; // Увеличиваем количество попыток еще больше

            const checkDatabase = () => {
                attempts++;

                // Проверяем различные способы доступа к базе данных
                const dbExists = window.db; // Исправлено: используем window.db вместо window.database
                const dbReady = dbExists && (dbExists.db || dbExists.isInitialized);
                const hasDbMethods = dbExists && typeof dbExists.getCustomParameters === 'function';
                const dbVersion = dbExists && dbExists.db && dbExists.db.version;

                if (attempts % 10 === 0 || attempts <= 5) { // Логируем каждые 10 попыток или первые 5
                    console.log(`Попытка ${attempts}/${maxAttempts}:`);
                    console.log('- window.db:', !!dbExists);
                    console.log('- db.db:', !!(dbExists && dbExists.db));
                    console.log('- db.isInitialized:', !!(dbExists && dbExists.isInitialized));
                    console.log('- db.getCustomParameters:', !!(dbExists && dbExists.getCustomParameters));
                    console.log('- db version:', dbVersion);
                }

                // База данных должна существовать, быть готова и иметь все нужные методы
                if (hasDbMethods && dbReady) {
                    console.log('✅ База данных полностью готова (попытка:', attempts, ')');
                    console.log('- Версия БД:', dbVersion);
                    resolve();
                    return;
                }

                if (attempts >= maxAttempts) {
                    console.warn(`⚠️ Превышено время ожидания базы данных (${maxAttempts} попыток)`);
                    console.warn('Последнее состояние:');
                    console.warn('- window.db:', !!dbExists);
                    console.warn('- hasDbMethods:', hasDbMethods);
                    console.warn('- dbReady:', dbReady);

                    // Пробуем продолжить работу, возможно что-то сработает
                    resolve();
                    return;
                }

                setTimeout(checkDatabase, 300); // Еще больше увеличиваем интервал
            };

            checkDatabase();
        });
    }

    /**
     * Инициализация локальной версии DI контейнера
     */
    async initializeLocalDI() {
        console.log('🏗️ Создаем локальный DI контейнер...');

        // Создаем базовые сервисы
        const configService = {
            get: (key) => {
                const defaults = {
                    'performance.cache': { ttl: 300000, maxSize: 100 },
                    'database.limits': {
                        maxParametersPerObject: 50,
                        maxParameterNameLength: 100,
                        maxOptionsCount: 50
                    }
                };
                return defaults[key];
            },
            getDatabaseLimits: () => ({
                maxParametersPerObject: 50,
                maxParameterNameLength: 100,
                maxOptionsCount: 50
            })
        };

        const validationService = {
            validate: async (data, rules) => []
        };

        const errorHandler = {
            handleError: async (error, context) => {
                console.error('Error:', error, context);
            }
        };

        // Создаем простой DI контейнер
        const container = {
            services: new Map(),

            register: function(name, service) {
                this.services.set(name, service);
            },

            get: function(name) {
                if (this.services.has(name)) {
                    return this.services.get(name);
                }

                // Создаем сервисы по запросу
                switch (name) {
                    case 'Database':
                        if (!window.db) {
                            throw new Error('База данных недоступна. Убедитесь, что database.js загружен и инициализирован.');
                        }
                        if (typeof window.db.getCustomParameters !== 'function') {
                            throw new Error('База данных не содержит методов для работы с параметрами. Версия базы данных может быть устаревшей.');
                        }
                        this.services.set(name, window.db);
                        return window.db;
                    case 'ConfigService':
                        this.services.set(name, configService);
                        return configService;
                    case 'ValidationService':
                        this.services.set(name, validationService);
                        return validationService;
                    case 'ErrorHandlingService':
                        this.services.set(name, errorHandler);
                        return errorHandler;
                    case 'CustomParametersService':
                        const customParamsService = new CustomParametersService(
                            this.get('Database'),
                            this.get('ValidationService'),
                            this.get('ConfigService'),
                            this.get('ErrorHandlingService')
                        );
                        this.services.set(name, customParamsService);
                        return customParamsService;
                    case 'ObjectCustomValuesService':
                        const valuesService = new ObjectCustomValuesService(
                            this.get('Database'),
                            this.get('CustomParametersService'),
                            this.get('ValidationService'),
                            this.get('ConfigService'),
                            this.get('ErrorHandlingService')
                        );
                        this.services.set(name, valuesService);
                        return valuesService;
                    default:
                        throw new Error(`Service ${name} not found`);
                }
            }
        };

        this.diContainer = container;

        console.log('✅ Локальный DI контейнер создан:', this.diContainer);
        console.log('✅ Метод get доступен:', typeof this.diContainer.get);
    }

    /**
     * Показать сообщение об ошибке
     */
    showErrorMessage() {
        const container = document.getElementById('custom-parameters-manager-container');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                    </svg>
                    <h3 class="mt-2 text-sm font-medium text-gray-900">
                        Ошибка загрузки
                    </h3>
                    <p class="mt-1 text-sm text-gray-500">
                        Не удалось инициализировать управление дополнительными параметрами.<br>
                        Попробуйте обновить страницу.
                    </p>
                    <div class="mt-6">
                        <button
                            id="reload-page-btn"
                            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                        >
                            Обновить страницу
                        </button>
                    </div>
                </div>
            `;

            // Добавляем обработчик для кнопки перезагрузки
            const reloadBtn = container.querySelector('#reload-page-btn');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => location.reload());
            }
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        if (this.customParametersManagerPanel) {
            this.customParametersManagerPanel.destroy();
            this.customParametersManagerPanel = null;
        }

        this.isInitialized = false;
    }
}

// Глобальная переменная для инициализатора
let customParametersSettingsInitializer = null;

// Инициализируем при загрузке DOM
document.addEventListener('DOMContentLoaded', async () => {
    customParametersSettingsInitializer = new CustomParametersSettingsInitializer();

    // Даем время на загрузку всех зависимостей и базы данных
    const initWithRetry = async (attempt = 1) => {
        try {
            await customParametersSettingsInitializer.initialize();
        } catch (error) {
            if (attempt < 3) {
                console.log(`Повторная попытка инициализации (${attempt + 1}/3) через 2 секунды...`);
                setTimeout(() => initWithRetry(attempt + 1), 2000);
            } else {
                console.error('Не удалось инициализировать управление параметрами после 3 попыток:', error);
            }
        }
    };

    // Увеличиваем время ожидания до 3 секунд
    setTimeout(() => initWithRetry(), 3000);
});

// Очищаем ресурсы при выгрузке страницы
window.addEventListener('beforeunload', () => {
    if (customParametersSettingsInitializer) {
        customParametersSettingsInitializer.destroy();
    }
});

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomParametersSettingsInitializer;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.CustomParametersSettingsInitializer = CustomParametersSettingsInitializer;
}