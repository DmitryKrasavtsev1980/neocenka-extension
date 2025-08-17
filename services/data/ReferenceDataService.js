/**
 * ReferenceDataService - сервис управления справочными данными
 * Централизованное управление справочниками (серии домов, классы, материалы и т.д.)
 */

class ReferenceDataService {
    constructor(database, configService, errorHandler) {
        this.database = database;
        this.configService = configService;
        this.errorHandler = errorHandler;
        
        // Кэш справочных данных
        this.referencesCache = new Map();
        this.cacheTimestamps = new Map();
        
        // Конфигурация кэширования
        this.cacheConfig = this.configService?.get('performance.cache') || {
            ttl: 1800000, // 30 минут для справочников
            maxSize: 50
        };
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Статистика использования
        this.usageStats = new Map();
        
        // Временно отключаем автоинициализацию до решения проблемы с базой данных
        // this.initialize();
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            // Инициализируем справочные данные по умолчанию
            await this.initializeDefaultData();
            
            // Настраиваем периодическую очистку кэша
            this.setupCacheCleanup();
            
        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'initialize'
            });
        }
    }

    /**
     * Инициализация справочных данных по умолчанию
     */
    async initializeDefaultData() {
        const referenceTypes = [
            'house_series',
            'house_classes', 
            'wall_materials',
            'ceiling_materials',
            'house_problems'
        ];

        for (const type of referenceTypes) {
            try {
                const existing = await this.database.getAll(type);
                if (existing.length === 0) {
                    await this.createDefaultData(type);
                }
            } catch (error) {
                console.warn(`Ошибка инициализации справочника ${type}:`, error);
            }
        }
    }

    /**
     * Создание данных по умолчанию для справочников
     */
    async createDefaultData(referenceType) {
        const defaultData = this.getDefaultDataForType(referenceType);
        
        for (const item of defaultData) {
            try {
                await this.database.add(referenceType, {
                    ...item,
                    created_at: new Date(),
                    updated_at: new Date()
                });
            } catch (error) {
                console.warn(`Ошибка создания записи в ${referenceType}:`, error);
            }
        }
    }

    /**
     * Получение данных по умолчанию для типа справочника
     */
    getDefaultDataForType(type) {
        const defaults = {
            house_series: [
                {
                    id: 'series_khrushchev',
                    name: 'Хрущёвка',
                    description: 'Панельные и кирпичные дома 1950-1980х годов',
                    years_built: '1950-1980',
                    typical_features: 'Низкие потолки (2.5м), малые площади квартир, совмещенный санузел'
                },
                {
                    id: 'series_stalin',
                    name: 'Сталинка',
                    description: 'Кирпичные дома сталинского периода',
                    years_built: '1930-1955',
                    typical_features: 'Высокие потолки (3-4м), просторные квартиры, толстые стены'
                },
                {
                    id: 'series_brezhnevka',
                    name: 'Брежневка',
                    description: 'Улучшенная панельная застройка',
                    years_built: '1960-1990',
                    typical_features: 'Улучшенная планировка, раздельные санузлы, лифты'
                },
                {
                    id: 'series_modern',
                    name: 'Современная постройка',
                    description: 'Дома построенные после 1990 года',
                    years_built: '1990-настоящее время',
                    typical_features: 'Современные материалы, улучшенные планировки, энергоэффективность'
                }
            ],
            
            house_classes: [
                {
                    id: 'class_economy',
                    name: 'Эконом',
                    description: 'Базовый класс жилья',
                    rating: 1,
                    characteristics: 'Минимальные требования к отделке и инфраструктуре'
                },
                {
                    id: 'class_comfort',
                    name: 'Комфорт',
                    description: 'Средний класс жилья',
                    rating: 2,
                    characteristics: 'Улучшенная отделка, развитая инфраструктура'
                },
                {
                    id: 'class_comfort_plus',
                    name: 'Комфорт+',
                    description: 'Повышенный класс комфорта',
                    rating: 3,
                    characteristics: 'Качественная отделка, хорошая инфраструктура'
                },
                {
                    id: 'class_business',
                    name: 'Бизнес',
                    description: 'Бизнес-класс',
                    rating: 4,
                    characteristics: 'Высококачественная отделка, развитая инфраструктура'
                },
                {
                    id: 'class_elite',
                    name: 'Элитное',
                    description: 'Элитное жилье',
                    rating: 5,
                    characteristics: 'Премиальная отделка, эксклюзивная инфраструктура'
                }
            ],
            
            wall_materials: [
                {
                    id: 'material_brick',
                    name: 'Кирпич',
                    description: 'Кирпичные стены',
                    thermal_properties: 'Хорошая теплоизоляция',
                    durability: 'Высокая',
                    advantages: 'Долговечность, экологичность, теплоизоляция'
                },
                {
                    id: 'material_panel',
                    name: 'Панель',
                    description: 'Панельные стены',
                    thermal_properties: 'Средняя теплоизоляция',
                    durability: 'Средняя',
                    advantages: 'Быстрое строительство, относительная дешевизна'
                },
                {
                    id: 'material_monolith',
                    name: 'Монолит',
                    description: 'Монолитно-каркасные стены',
                    thermal_properties: 'Хорошая теплоизоляция',
                    durability: 'Высокая',
                    advantages: 'Прочность, свободная планировка, долговечность'
                },
                {
                    id: 'material_wood',
                    name: 'Дерево',
                    description: 'Деревянные стены',
                    thermal_properties: 'Отличная теплоизоляция',
                    durability: 'Средняя',
                    advantages: 'Экологичность, натуральность, теплоизоляция'
                }
            ],
            
            ceiling_materials: [
                {
                    id: 'ceiling_concrete',
                    name: 'Железобетон',
                    description: 'Железобетонные перекрытия',
                    load_capacity: 'Высокая',
                    sound_insulation: 'Средняя'
                },
                {
                    id: 'ceiling_wood',
                    name: 'Деревянные балки',
                    description: 'Деревянные перекрытия',
                    load_capacity: 'Средняя',
                    sound_insulation: 'Низкая'
                },
                {
                    id: 'ceiling_metal',
                    name: 'Металлические балки',
                    description: 'Металлические перекрытия',
                    load_capacity: 'Высокая',
                    sound_insulation: 'Низкая'
                }
            ],
            
            house_problems: [
                {
                    id: 'problem_none',
                    name: 'Без проблем',
                    description: 'Дом в хорошем состоянии',
                    severity: 'none'
                },
                {
                    id: 'problem_minor_repair',
                    name: 'Требует косметического ремонта',
                    description: 'Незначительные проблемы с отделкой',
                    severity: 'minor'
                },
                {
                    id: 'problem_major_repair',
                    name: 'Требует капитального ремонта',
                    description: 'Серьёзные проблемы с инженерными системами',
                    severity: 'major'
                },
                {
                    id: 'problem_emergency',
                    name: 'Аварийное состояние',
                    description: 'Дом в аварийном состоянии, требует расселения',
                    severity: 'critical'
                }
            ]
        };

        return defaults[type] || [];
    }

    /**
     * Получение всех элементов справочника
     * @param {string} referenceType - тип справочника
     * @returns {Promise<object[]>} элементы справочника
     */
    async getAll(referenceType) {
        try {
            // Проверяем кэш
            const cached = this.getFromCache(referenceType);
            if (cached) {
                this.recordUsage(referenceType);
                return cached;
            }

            // Загружаем из базы данных
            const data = await this.database.getAll(referenceType);
            
            // Сортируем по имени
            data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            // Добавляем в кэш
            this.addToCache(referenceType, data);
            this.recordUsage(referenceType);

            return data;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'getAll',
                referenceType
            });
            return [];
        }
    }

    /**
     * Получение элемента справочника по ID
     * @param {string} referenceType - тип справочника  
     * @param {string} id - ID элемента
     * @returns {Promise<object|null>} элемент или null
     */
    async getById(referenceType, id) {
        try {
            // Сначала пробуем найти в кэше всех элементов
            const allItems = await this.getAll(referenceType);
            const item = allItems.find(item => item.id === id);
            
            if (item) {
                return item;
            }

            // Если не найден, загружаем напрямую из БД
            return await this.database.get(referenceType, id);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'getById',
                referenceType,
                id
            });
            return null;
        }
    }

    /**
     * Получение элементов справочника по нескольким ID
     * @param {string} referenceType - тип справочника
     * @param {string[]} ids - массив ID
     * @returns {Promise<object[]>} найденные элементы
     */
    async getByIds(referenceType, ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }

        try {
            const allItems = await this.getAll(referenceType);
            return allItems.filter(item => ids.includes(item.id));

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'getByIds',
                referenceType,
                ids
            });
            return [];
        }
    }

    /**
     * Поиск элементов справочника по имени
     * @param {string} referenceType - тип справочника
     * @param {string} query - поисковый запрос
     * @returns {Promise<object[]>} найденные элементы
     */
    async search(referenceType, query) {
        if (!query || query.trim().length === 0) {
            return await this.getAll(referenceType);
        }

        try {
            const allItems = await this.getAll(referenceType);
            const queryLower = query.toLowerCase();

            return allItems.filter(item => {
                const name = (item.name || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                
                return name.includes(queryLower) || description.includes(queryLower);
            });

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'search',
                referenceType,
                query
            });
            return [];
        }
    }

    /**
     * Создание нового элемента справочника
     * @param {string} referenceType - тип справочника
     * @param {object} data - данные элемента
     * @returns {Promise<object>} созданный элемент
     */
    async create(referenceType, data) {
        try {
            // Валидация данных
            this.validateReferenceData(referenceType, data);

            // Проверка уникальности ID
            if (data.id) {
                const existing = await this.getById(referenceType, data.id);
                if (existing) {
                    throw new Error('Элемент с таким ID уже существует');
                }
            }

            // Подготовка данных
            const itemToCreate = {
                id: data.id || this.generateId(referenceType),
                ...data,
                created_at: new Date(),
                updated_at: new Date()
            };

            // Сохранение в базу данных
            await this.database.add(referenceType, itemToCreate);

            // Инвалидируем кэш
            this.invalidateCache(referenceType);

            // Уведомляем о создании
            this.emit('reference:created', { 
                type: referenceType, 
                item: itemToCreate 
            });

            return itemToCreate;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'create',
                referenceType,
                data
            });
            throw error;
        }
    }

    /**
     * Обновление элемента справочника
     * @param {string} referenceType - тип справочника
     * @param {string} id - ID элемента
     * @param {object} updates - обновления
     * @returns {Promise<object>} обновлённый элемент
     */
    async update(referenceType, id, updates) {
        try {
            // Получаем существующий элемент
            const existing = await this.getById(referenceType, id);
            if (!existing) {
                throw new Error('Элемент справочника не найден');
            }

            // Подготавливаем обновления
            const updatedItem = {
                ...existing,
                ...updates,
                updated_at: new Date()
            };

            // Валидация
            this.validateReferenceData(referenceType, updatedItem);

            // Сохранение
            await this.database.update(referenceType, updatedItem);

            // Инвалидируем кэш
            this.invalidateCache(referenceType);

            // Уведомляем об обновлении
            this.emit('reference:updated', { 
                type: referenceType, 
                id, 
                item: updatedItem,
                changes: updates
            });

            return updatedItem;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'update',
                referenceType,
                id,
                updates
            });
            throw error;
        }
    }

    /**
     * Удаление элемента справочника
     * @param {string} referenceType - тип справочника
     * @param {string} id - ID элемента
     * @returns {Promise<void>}
     */
    async delete(referenceType, id) {
        try {
            // Проверяем существование элемента
            const existing = await this.getById(referenceType, id);
            if (!existing) {
                throw new Error('Элемент справочника не найден');
            }

            // Проверяем, используется ли элемент
            const isUsed = await this.checkUsage(referenceType, id);
            if (isUsed) {
                throw new Error('Невозможно удалить используемый элемент справочника');
            }

            // Удаляем из базы данных
            await this.database.delete(referenceType, id);

            // Инвалидируем кэш
            this.invalidateCache(referenceType);

            // Уведомляем об удалении
            this.emit('reference:deleted', { 
                type: referenceType, 
                id, 
                item: existing 
            });

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ReferenceDataService',
                method: 'delete',
                referenceType,
                id
            });
            throw error;
        }
    }

    /**
     * Проверка использования элемента справочника в других таблицах
     */
    async checkUsage(referenceType, id) {
        try {
            // Определяем какие таблицы могут использовать данный справочник
            const tablesToCheck = this.getRelatedTables(referenceType);
            
            for (const table of tablesToCheck) {
                const items = await this.database.getAll(table.name);
                const hasUsage = items.some(item => {
                    const fieldValue = item[table.field];
                    if (Array.isArray(fieldValue)) {
                        return fieldValue.includes(id);
                    }
                    return fieldValue === id;
                });
                
                if (hasUsage) {
                    return true;
                }
            }
            
            return false;

        } catch (error) {
            console.warn('Ошибка проверки использования справочника:', error);
            return false; // Безопасно разрешаем удаление при ошибке проверки
        }
    }

    /**
     * Получение связанных таблиц для типа справочника
     */
    getRelatedTables(referenceType) {
        const relations = {
            house_series: [
                { name: 'addresses', field: 'house_series_id' },
                { name: 'segments', field: 'filters.house_series_id' }
            ],
            house_classes: [
                { name: 'addresses', field: 'house_class_id' },
                { name: 'segments', field: 'filters.house_class_id' }
            ],
            wall_materials: [
                { name: 'addresses', field: 'wall_material_id' },
                { name: 'segments', field: 'filters.wall_material_id' }
            ],
            ceiling_materials: [
                { name: 'addresses', field: 'ceiling_material_id' }
            ],
            house_problems: [
                { name: 'addresses', field: 'house_problem_id' }
            ]
        };

        return relations[referenceType] || [];
    }

    /**
     * Валидация данных справочника
     */
    validateReferenceData(referenceType, data) {
        // Базовая валидация
        if (!data.name || data.name.trim().length === 0) {
            throw new Error('Название элемента справочника обязательно');
        }

        if (data.name.length > 255) {
            throw new Error('Название слишком длинное (максимум 255 символов)');
        }

        // Специфичная валидация по типам
        switch (referenceType) {
            case 'house_classes':
                if (data.rating && (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5)) {
                    throw new Error('Рейтинг класса должен быть целым числом от 1 до 5');
                }
                break;

            case 'house_problems':
                const validSeverities = ['none', 'minor', 'major', 'critical'];
                if (data.severity && !validSeverities.includes(data.severity)) {
                    throw new Error(`Недопустимый уровень серьезности. Допустимые: ${validSeverities.join(', ')}`);
                }
                break;
        }
    }

    /**
     * Генерация уникального ID для справочника
     */
    generateId(referenceType) {
        const prefix = referenceType.replace(/s$/, ''); // Убираем 's' в конце
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    /**
     * Получение статистики использования справочников
     */
    getUsageStatistics() {
        const stats = {};
        
        this.usageStats.forEach((count, type) => {
            stats[type] = {
                accessCount: count,
                lastAccessed: this.cacheTimestamps.get(type)
            };
        });

        return stats;
    }

    /**
     * Запись статистики использования
     */
    recordUsage(referenceType) {
        const currentCount = this.usageStats.get(referenceType) || 0;
        this.usageStats.set(referenceType, currentCount + 1);
    }

    // === МЕТОДЫ РАБОТЫ С КЭШЕМ ===

    getFromCache(key) {
        if (this.referencesCache.has(key)) {
            const timestamp = this.cacheTimestamps.get(key);
            if (timestamp && (Date.now() - timestamp < this.cacheConfig.ttl)) {
                return this.referencesCache.get(key);
            } else {
                this.removeFromCache(key);
            }
        }
        return null;
    }

    addToCache(key, data) {
        if (this.referencesCache.size >= this.cacheConfig.maxSize) {
            this.cleanupCache();
        }

        this.referencesCache.set(key, data);
        this.cacheTimestamps.set(key, Date.now());
    }

    removeFromCache(key) {
        this.referencesCache.delete(key);
        this.cacheTimestamps.delete(key);
    }

    invalidateCache(key) {
        this.removeFromCache(key);
    }

    cleanupCache() {
        const now = Date.now();
        const keysToRemove = [];

        this.cacheTimestamps.forEach((timestamp, key) => {
            if (now - timestamp >= this.cacheConfig.ttl) {
                keysToRemove.push(key);
            }
        });

        keysToRemove.forEach(key => this.removeFromCache(key));
    }

    setupCacheCleanup() {
        setInterval(() => {
            this.cleanupCache();
        }, this.cacheConfig.ttl);
    }

    clearCache() {
        this.referencesCache.clear();
        this.cacheTimestamps.clear();
    }

    // === СИСТЕМА СОБЫТИЙ ===

    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(eventType, data = {}) {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Получение состояния сервиса
     */
    getServiceState() {
        return {
            cacheSize: this.referencesCache.size,
            cacheHits: this.usageStats,
            cachedTypes: Array.from(this.referencesCache.keys()),
            lastCleanup: this.lastCleanup || null
        };
    }

    /**
     * Уничтожение сервиса
     */
    destroy() {
        this.clearCache();
        this.eventHandlers.clear();
        this.usageStats.clear();
        
        this.database = null;
        this.configService = null;
        this.errorHandler = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReferenceDataService;
} else {
    window.ReferenceDataService = ReferenceDataService;
}