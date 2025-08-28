/**
 * ConfigService - централизованное управление конфигурацией
 * Заменяет разбросанные по коду константы и настройки
 */

class ConfigService {
    constructor() {
        this.config = new Map();
        this.listeners = new Map();
        this.setupDefaultConfig();
    }

    /**
     * Настройка конфигурации по умолчанию
     */
    setupDefaultConfig() {
        // UI Configuration
        this.config.set('ui', {
            // Таблицы
            table: {
                defaultPageSize: 25,
                pageSizeOptions: [10, 25, 50, 100],
                defaultSorting: { column: 'created_at', direction: 'desc' }
            },
            
            // Модальные окна
            modal: {
                animationDuration: 300,
                backdropClick: true,
                escapeKey: true
            },
            
            // Карты
            map: {
                defaultZoom: 13,
                minZoom: 10,
                maxZoom: 18,
                centerNsk: [55.0084, 82.9357], // Новосибирск
                markerClusterDistance: 50,
                updateDebounceMs: 300
            },
            
            // Графики
            charts: {
                animationDuration: 500,
                colorScheme: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
                defaultHeight: 400
            }
        });

        // Database Configuration  
        this.config.set('database', {
            name: 'NeocenkaDB',
            version: 25,
            
            // Лимиты
            limits: {
                maxAddressesPerArea: 10000,
                maxListingsPerAddress: 100,
                maxSegmentsPerArea: 50,
                maxPolygonPoints: 1000
            },
            
            // Индексы для оптимизации
            indexes: {
                addresses: ['address', 'map_area_id', 'coordinates', 'type'],
                listings: ['address_id', 'source', 'price', 'parsed_at'],
                segments: ['name', 'map_area_id', 'created_at']
            },
            
            // Cleanup настройки
            cleanup: {
                oldListingsDays: 365, // Старые объявления
                orphanedAddressesDays: 30, // Адреса без объявлений
                tempDataHours: 24 // Временные данные
            }
        });

        // API Configuration
        this.config.set('api', {
            // Внешние сервисы
            external: {
                inpars: {
                    baseUrl: 'https://api.inpars.ru',
                    timeout: 10000,
                    retries: 3,
                    rateLimit: {
                        requests: 60,
                        window: 60000 // 1 минута
                    }
                },
                
                overpass: {
                    baseUrl: 'https://overpass-api.de/api/interpreter',
                    timeout: 30000,
                    retries: 2
                }
            },
            
            // Content Scripts
            contentScripts: {
                avito: {
                    selectors: {
                        price: [
                            '[data-marker="item-price"] .price-value-string',
                            '[data-marker="item-price"] span[content]'
                        ],
                        address: [
                            '[data-marker="item-address"] .item-address-georeferences-item__content'
                        ],
                        title: [
                            '[data-marker="item-title"]',
                            '.title-info-title-text'
                        ]
                    },
                    
                    timeouts: {
                        pageLoad: 10000,
                        elementWait: 5000,
                        apiResponse: 15000
                    }
                },
                
                cian: {
                    selectors: {
                        price: [
                            '[data-testid="price-amount"]',
                            '.a10a3f92e9--price--3UEMK'
                        ],
                        address: [
                            '[data-name="GeoLabel"]',
                            '.a10a3f92e9--address-text--1m9G5'
                        ]
                    },
                    
                    timeouts: {
                        pageLoad: 10000,
                        elementWait: 5000
                    }
                }
            }
        });

        // Performance Configuration
        this.config.set('performance', {
            // Кэширование
            cache: {
                maxSize: 1000, // Максимальное количество элементов
                ttl: 300000, // 5 минут
                cleanupInterval: 60000 // 1 минута
            },
            
            // Батчинг операций
            batching: {
                databaseOperations: 50,
                uiUpdates: 100,
                debounceMs: 250
            },
            
            // Лимиты для UI
            ui: {
                maxVisibleMarkers: 1000,
                maxTableRows: 500,
                virtualScrollThreshold: 100,
                mapUpdateThrottle: 200
            },
            
            // Memory management
            memory: {
                maxImageCache: 50, // Количество изображений
                maxGeometryCache: 200, // Геометрических объектов
                cleanupInterval: 300000 // 5 минут
            }
        });

        // Security Configuration
        this.config.set('security', {
            // CSP настройки
            csp: {
                allowInlineStyles: false,
                allowInlineScripts: false,
                reportViolations: true
            },
            
            // Валидация
            validation: {
                strictMode: true,
                sanitizeInputs: true,
                maxStringLength: 10000
            },
            
            // Debug режим
            debug: {
                enabled: false, // По умолчанию отключен
                logLevel: 'warn',
                logToConsole: false, // Безопасность content scripts
                logToStorage: true
            }
        });

        // Business Logic Configuration
        this.config.set('business', {
            // Дубликаты
            duplicateDetection: {
                addressSimilarityThreshold: 0.8,
                priceMatchThreshold: 0.05, // 5%
                maxDistance: 100, // метры
                algorithms: {
                    default: 'levenshtein',
                    fallback: 'cosine'
                }
            },
            
            // Аналитика
            analytics: {
                priceChangeThreshold: 0.1, // 10%
                outlierDetectionSigma: 2,
                minSampleSize: 10,
                confidenceLevel: 0.95
            },
            
            // Геокодирование
            geocoding: {
                maxRetries: 3,
                cacheResults: true,
                cacheTTL: 86400000, // 24 часа
                fallbackProviders: ['overpass', 'manual']
            }
        });

        // Development Configuration
        this.config.set('development', {
            // Тестирование
            testing: {
                mockData: false,
                mockAPIs: false,
                generateTestData: false
            },
            
            // Отладка
            debugging: {
                verboseLogging: false,
                trackPerformance: true,
                profileMemory: false
            }
        });

        // AI Configuration
        this.config.set('ai', {
            // Общие настройки
            primaryProvider: 'yandex',
            fallbackChain: ['yandex', 'claude'],
            enabled: false,
            costOptimization: true,
            
            // Провайдеры - важно инициализировать пустые объекты
            providers: {
                yandex: {},
                claude: {},
                openai: {},
                gigachat: {}
            },
            
            // Бюджеты
            budget: {
                daily: 1.0,
                perRequest: 0.05
            }
        });
    }

    /**
     * Получение значения конфигурации
     * @param {string} path - путь к настройке (например, 'ui.table.defaultPageSize')
     * @returns {any} значение или undefined
     */
    get(path) {
        const parts = path.split('.');
        let current = this.config;
        
        for (const part of parts) {
            if (current instanceof Map) {
                current = current.get(part);
            } else if (current && typeof current === 'object') {
                current = current[part];
            } else {
                return undefined;
            }
            
            if (current === undefined) {
                return undefined;
            }
        }
        
        return current;
    }

    /**
     * Установка значения конфигурации
     * @param {string} path - путь к настройке
     * @param {any} value - новое значение
     */
    set(path, value) {
        const parts = path.split('.');
        const lastPart = parts.pop();
        
        let current = this.config;
        
        // Навигация до предпоследнего элемента
        for (const part of parts) {
            if (current instanceof Map) {
                if (!current.has(part)) {
                    current.set(part, {});
                }
                current = current.get(part);
            } else if (current && typeof current === 'object') {
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            } else {
                throw new Error(`Невозможно установить значение по пути: ${path}`);
            }
        }
        
        // Установка значения
        if (current instanceof Map) {
            const oldValue = current.get(lastPart);
            current.set(lastPart, value);
            this.notifyListeners(path, value, oldValue);
        } else if (current && typeof current === 'object') {
            const oldValue = current[lastPart];
            current[lastPart] = value;
            this.notifyListeners(path, value, oldValue);
        }
    }

    /**
     * Получение всей секции конфигурации
     * @param {string} section - имя секции
     * @returns {object} копия секции конфигурации
     */
    getSection(section) {
        const sectionData = this.config.get(section);
        return sectionData ? this.deepClone(sectionData) : undefined;
    }

    /**
     * Обновление секции конфигурации
     * @param {string} section - имя секции
     * @param {object} updates - обновления
     */
    updateSection(section, updates) {
        const currentSection = this.config.get(section) || {};
        const updatedSection = { ...currentSection, ...updates };
        this.config.set(section, updatedSection);
        this.notifyListeners(section, updatedSection, currentSection);
    }

    /**
     * Подписка на изменения конфигурации
     * @param {string} path - путь к настройке для отслеживания
     * @param {function} callback - функция обратного вызова
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        this.listeners.get(path).push(callback);
    }

    /**
     * Отписка от изменений
     * @param {string} path - путь к настройке
     * @param {function} callback - функция обратного вызова
     */
    unsubscribe(path, callback) {
        if (this.listeners.has(path)) {
            const callbacks = this.listeners.get(path);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Уведомление подписчиков об изменениях
     * @private
     */
    notifyListeners(path, newValue, oldValue) {
        if (this.listeners.has(path)) {
            this.listeners.get(path).forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('Ошибка в callback конфигурации:', error);
                }
            });
        }
    }

    /**
     * Загрузка конфигурации из хранилища
     * @param {object} storage - объект для работы с хранилищем (Chrome Storage API)
     */
    async loadFromStorage(storage) {
        try {
            const result = await storage.local.get(['neocenka_config']);
            if (result.neocenka_config) {
                const savedConfig = JSON.parse(result.neocenka_config);
                this.mergeConfig(savedConfig);
            }
        } catch (error) {
            console.error('Ошибка загрузки конфигурации:', error);
        }
    }

    /**
     * Сохранение конфигурации в хранилище
     * @param {object} storage - объект для работы с хранилищем
     */
    async saveToStorage(storage) {
        try {
            const configToSave = this.exportConfig();
            await storage.local.set({
                neocenka_config: JSON.stringify(configToSave)
            });
        } catch (error) {
            console.error('Ошибка сохранения конфигурации:', error);
        }
    }

    /**
     * Объединение конфигурации с сохранённой
     * @private
     */
    mergeConfig(savedConfig) {
        Object.keys(savedConfig).forEach(section => {
            if (this.config.has(section)) {
                const currentSection = this.config.get(section);
                const mergedSection = this.deepMerge(currentSection, savedConfig[section]);
                this.config.set(section, mergedSection);
            }
        });
    }

    /**
     * Экспорт конфигурации для сохранения
     * @returns {object} конфигурация для сериализации
     */
    exportConfig() {
        const exported = {};
        for (const [key, value] of this.config.entries()) {
            exported[key] = this.deepClone(value);
        }
        return exported;
    }

    /**
     * Сброс к настройкам по умолчанию
     */
    resetToDefault() {
        this.config.clear();
        this.setupDefaultConfig();
    }

    /**
     * Получение настроек производительности для компонента
     * @param {string} component - имя компонента
     * @returns {object} настройки производительности
     */
    getPerformanceConfig(component) {
        return this.get(`performance.${component}`) || {};
    }

    /**
     * Получение настроек UI для компонента
     * @param {string} component - имя компонента
     * @returns {object} настройки UI
     */
    getUIConfig(component) {
        return this.get(`ui.${component}`) || {};
    }

    /**
     * Проверка включен ли debug режим
     * @returns {boolean}
     */
    isDebugEnabled() {
        return this.get('security.debug.enabled') === true;
    }

    /**
     * Получение лимитов базы данных
     * @returns {object} лимиты
     */
    getDatabaseLimits() {
        return this.get('database.limits') || {};
    }

    /**
     * Глубокое клонирование объекта
     * @private
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (obj instanceof Date) {
            return new Date(obj);
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.deepClone(item));
        }
        
        const cloned = {};
        Object.keys(obj).forEach(key => {
            cloned[key] = this.deepClone(obj[key]);
        });
        
        return cloned;
    }

    /**
     * Глубокое объединение объектов
     * @private
     */
    deepMerge(target, source) {
        const result = this.deepClone(target);
        
        Object.keys(source).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        });
        
        return result;
    }

    /**
     * Валидация конфигурации
     * @returns {object} результат валидации
     */
    validateConfig() {
        const errors = [];
        const warnings = [];

        // Проверка UI настроек
        const uiConfig = this.get('ui');
        if (uiConfig) {
            const pageSize = uiConfig.table?.defaultPageSize;
            if (pageSize && (pageSize < 10 || pageSize > 1000)) {
                warnings.push('Размер страницы таблицы вне рекомендуемого диапазона (10-1000)');
            }

            const zoom = uiConfig.map?.defaultZoom;
            if (zoom && (zoom < 1 || zoom > 20)) {
                errors.push('Неверный уровень масштабирования карты');
            }
        }

        // Проверка производительности
        const perfConfig = this.get('performance');
        if (perfConfig) {
            const maxMarkers = perfConfig.ui?.maxVisibleMarkers;
            if (maxMarkers && maxMarkers > 10000) {
                warnings.push('Слишком большое количество маркеров может снизить производительность');
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }
}

// Создаем глобальный экземпляр
const configService = new ConfigService();

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConfigService, configService };
} else {
    window.ConfigService = ConfigService;
    window.configService = configService;
}