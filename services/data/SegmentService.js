/**
 * SegmentService - специализированный сервис для работы с сегментами
 * Извлечён из SegmentsManager для соблюдения принципа единственной ответственности
 */

class SegmentService {
    constructor(database, validationService, configService, errorHandler) {
        this.database = database;
        this.validationService = validationService;
        this.configService = configService;
        this.errorHandler = errorHandler;
        
        // Кэш сегментов для производительности
        this.segmentsCache = new Map();
        this.cacheTimeouts = new Map();
        
        // Конфигурация кэширования
        this.cacheConfig = this.configService?.get('performance.cache') || {
            ttl: 300000, // 5 минут
            maxSize: 1000
        };
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        this.initialize();
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            // Загружаем лимиты из конфигурации
            this.limits = this.configService?.getDatabaseLimits() || {
                maxSegmentsPerArea: 50
            };
            
            // Инициализируем периодическую очистку кэша
            this.setupCacheCleanup();
            
        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'initialize'
            });
        }
    }

    /**
     * Создание нового сегмента
     * @param {object} segmentData - данные сегмента
     * @returns {Promise<object>} созданный сегмент
     */
    async create(segmentData) {
        try {
            // Валидация данных
            const validation = this.validationService.validate('segment', segmentData);
            if (!validation.isValid) {
                throw new Error(`Ошибка валидации: ${validation.errors.join(', ')}`);
            }

            // Проверка лимитов
            await this.checkLimits(segmentData.map_area_id);

            // Проверка уникальности имени в области
            await this.checkNameUniqueness(segmentData.name, segmentData.map_area_id);

            // Подготовка данных для сохранения
            const segmentToCreate = {
                id: this.generateId(),
                name: segmentData.name,
                description: segmentData.description || null,
                map_area_id: segmentData.map_area_id,
                filters: segmentData.filters || {},
                created_at: new Date(),
                updated_at: new Date()
            };

            // Сохранение в базу данных
            await this.database.add('segments', segmentToCreate);

            // Обновляем кэш
            this.updateCache(segmentToCreate);

            // Уведомляем о создании
            this.emit('segment:created', { segment: segmentToCreate });

            return segmentToCreate;

        } catch (error) {
            const handledError = await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'create',
                data: segmentData
            });
            
            if (handledError?.shouldRetry) {
                // Можно реализовать retry логику
                throw new Error(`Ошибка создания сегмента: ${error.message}`);
            }
            
            throw error;
        }
    }

    /**
     * Получение сегмента по ID
     * @param {string} segmentId - ID сегмента
     * @returns {Promise<object|null>} сегмент или null
     */
    async getById(segmentId) {
        try {
            // Проверяем кэш
            const cached = this.getFromCache(segmentId);
            if (cached) {
                return cached;
            }

            // Загружаем из базы данных
            const segment = await this.database.get('segments', segmentId);
            
            if (segment) {
                // Добавляем в кэш
                this.addToCache(segment);
            }

            return segment;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'getById',
                segmentId
            });
            return null;
        }
    }

    /**
     * Получение всех сегментов для области
     * @param {string} mapAreaId - ID области карты
     * @returns {Promise<object[]>} массив сегментов
     */
    async getByAreaId(mapAreaId) {
        try {
            const cacheKey = `area:${mapAreaId}`;
            
            // Проверяем кэш
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                return cached;
            }

            // Загружаем из базы данных
            const segments = await this.database.getAll('segments', 'map_area_id', mapAreaId);
            
            // Сортируем по дате создания (новые первые)
            segments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // Добавляем в кэш
            this.addToCache(segments, cacheKey);

            return segments;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'getByAreaId',
                mapAreaId
            });
            return [];
        }
    }

    /**
     * Обновление сегмента
     * @param {string} segmentId - ID сегмента
     * @param {object} updates - обновления
     * @returns {Promise<object>} обновлённый сегмент
     */
    async update(segmentId, updates) {
        try {
            // Получаем текущий сегмент
            const existingSegment = await this.getById(segmentId);
            if (!existingSegment) {
                throw new Error('Сегмент не найден');
            }

            // Подготавливаем данные для обновления
            const dataToUpdate = {
                ...existingSegment,
                ...updates,
                updated_at: new Date()
            };

            // Валидация обновлённых данных
            const validation = this.validationService.validate('segment', dataToUpdate);
            if (!validation.isValid) {
                throw new Error(`Ошибка валидации: ${validation.errors.join(', ')}`);
            }

            // Проверка уникальности имени (если имя изменилось)
            if (updates.name && updates.name !== existingSegment.name) {
                await this.checkNameUniqueness(updates.name, existingSegment.map_area_id, segmentId);
            }

            // Сохранение в базу данных
            await this.database.update('segments', dataToUpdate);

            // Обновляем кэш
            this.updateCache(dataToUpdate);

            // Уведомляем об обновлении
            this.emit('segment:updated', { 
                segmentId, 
                segment: dataToUpdate, 
                changes: updates 
            });

            return dataToUpdate;

        } catch (error) {
            const handledError = await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'update',
                segmentId,
                updates
            });
            
            throw error;
        }
    }

    /**
     * Удаление сегмента
     * @param {string} segmentId - ID сегмента
     * @returns {Promise<void>}
     */
    async delete(segmentId) {
        try {
            // Получаем сегмент перед удалением
            const segment = await this.getById(segmentId);
            if (!segment) {
                throw new Error('Сегмент не найден');
            }

            // Удаляем из базы данных
            await this.database.delete('segments', segmentId);

            // Удаляем из кэша
            this.removeFromCache(segmentId);
            
            // Обновляем кэш области
            const areaCacheKey = `area:${segment.map_area_id}`;
            this.invalidateCache(areaCacheKey);

            // Уведомляем об удалении
            this.emit('segment:deleted', { segmentId, segment });

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'delete',
                segmentId
            });
            throw error;
        }
    }

    /**
     * Поиск сегментов по критериям
     * @param {object} criteria - критерии поиска
     * @returns {Promise<object[]>} найденные сегменты
     */
    async search(criteria) {
        try {
            let segments = [];

            // Если указана область, загружаем сегменты только из неё
            if (criteria.map_area_id) {
                segments = await this.getByAreaId(criteria.map_area_id);
            } else {
                // Загружаем все сегменты (может быть медленно)
                segments = await this.database.getAll('segments');
            }

            // Применяем фильтры
            return this.applySearchCriteria(segments, criteria);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'search',
                criteria
            });
            return [];
        }
    }

    /**
     * Применение критериев поиска к массиву сегментов
     */
    applySearchCriteria(segments, criteria) {
        let filtered = [...segments];

        // Поиск по имени
        if (criteria.name) {
            const nameLower = criteria.name.toLowerCase();
            filtered = filtered.filter(segment => 
                segment.name.toLowerCase().includes(nameLower)
            );
        }

        // Поиск по описанию
        if (criteria.description) {
            const descLower = criteria.description.toLowerCase();
            filtered = filtered.filter(segment => 
                segment.description && segment.description.toLowerCase().includes(descLower)
            );
        }

        // Фильтр по дате создания
        if (criteria.created_after) {
            const afterDate = new Date(criteria.created_after);
            filtered = filtered.filter(segment => 
                new Date(segment.created_at) >= afterDate
            );
        }

        if (criteria.created_before) {
            const beforeDate = new Date(criteria.created_before);
            filtered = filtered.filter(segment => 
                new Date(segment.created_at) <= beforeDate
            );
        }

        // Фильтр по наличию определённых фильтров в сегменте
        if (criteria.has_filters) {
            filtered = filtered.filter(segment => {
                const filters = segment.filters || {};
                return criteria.has_filters.some(filterType => {
                    const filterValue = filters[filterType];
                    return filterValue !== undefined && filterValue !== null && 
                           (Array.isArray(filterValue) ? filterValue.length > 0 : true);
                });
            });
        }

        return filtered;
    }

    /**
     * Получение статистики по сегменту
     * @param {string} segmentId - ID сегмента
     * @returns {Promise<object>} статистика
     */
    async getStatistics(segmentId) {
        try {
            const segment = await this.getById(segmentId);
            if (!segment) {
                throw new Error('Сегмент не найден');
            }

            // Пока возвращаем базовую статистику
            // В будущем здесь будет интеграция с другими сервисами для подсчёта объектов
            return {
                segmentId: segmentId,
                name: segment.name,
                objectCount: 0, // Требует интеграции с AddressService
                averagePrice: 0, // Требует интеграции с ListingService
                priceRange: { min: 0, max: 0 },
                lastUpdated: segment.updated_at,
                hasActiveFilters: this.hasActiveFilters(segment.filters)
            };

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'getStatistics',
                segmentId
            });
            return null;
        }
    }

    /**
     * Проверка наличия активных фильтров
     */
    hasActiveFilters(filters) {
        if (!filters || typeof filters !== 'object') {
            return false;
        }

        return Object.keys(filters).some(key => {
            const value = filters[key];
            if (Array.isArray(value)) {
                return value.length > 0;
            }
            return value !== undefined && value !== null && value !== '';
        });
    }

    /**
     * Дублирование сегмента
     * @param {string} segmentId - ID сегмента для дублирования
     * @param {object} overrides - переопределения для нового сегмента
     * @returns {Promise<object>} новый сегмент
     */
    async duplicate(segmentId, overrides = {}) {
        try {
            const originalSegment = await this.getById(segmentId);
            if (!originalSegment) {
                throw new Error('Исходный сегмент не найден');
            }

            // Подготавливаем данные для нового сегмента
            const newSegmentData = {
                name: overrides.name || `${originalSegment.name} (копия)`,
                description: overrides.description || originalSegment.description,
                map_area_id: overrides.map_area_id || originalSegment.map_area_id,
                filters: overrides.filters || { ...originalSegment.filters }
            };

            // Создаём новый сегмент
            return await this.create(newSegmentData);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'duplicate',
                segmentId,
                overrides
            });
            throw error;
        }
    }

    /**
     * Экспорт сегментов в различных форматах
     * @param {string[]} segmentIds - массив ID сегментов
     * @param {string} format - формат экспорта ('json', 'csv')
     * @returns {Promise<string>} данные в указанном формате
     */
    async export(segmentIds, format = 'json') {
        try {
            const segments = await Promise.all(
                segmentIds.map(id => this.getById(id))
            );

            const validSegments = segments.filter(segment => segment !== null);

            switch (format) {
                case 'json':
                    return JSON.stringify(validSegments, null, 2);
                    
                case 'csv':
                    return this.convertToCSV(validSegments);
                    
                default:
                    throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
            }

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'SegmentService',
                method: 'export',
                segmentIds,
                format
            });
            throw error;
        }
    }

    /**
     * Конвертация в CSV формат
     */
    convertToCSV(segments) {
        if (segments.length === 0) return '';

        const headers = [
            'ID',
            'Название', 
            'Описание',
            'ID области',
            'Фильтры',
            'Дата создания',
            'Дата обновления'
        ];

        const csvRows = [headers.join(',')];

        segments.forEach(segment => {
            const row = [
                segment.id,
                `"${(segment.name || '').replace(/"/g, '""')}"`,
                `"${(segment.description || '').replace(/"/g, '""')}"`,
                segment.map_area_id || '',
                `"${JSON.stringify(segment.filters || {}).replace(/"/g, '""')}"`,
                segment.created_at ? new Date(segment.created_at).toISOString() : '',
                segment.updated_at ? new Date(segment.updated_at).toISOString() : ''
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    /**
     * Проверка лимитов создания сегментов
     */
    async checkLimits(mapAreaId) {
        const existingSegments = await this.getByAreaId(mapAreaId);
        
        if (existingSegments.length >= this.limits.maxSegmentsPerArea) {
            throw new Error(
                `Превышен лимит сегментов для области (максимум ${this.limits.maxSegmentsPerArea})`
            );
        }
    }

    /**
     * Проверка уникальности имени сегмента в области
     */
    async checkNameUniqueness(name, mapAreaId, excludeId = null) {
        const existingSegments = await this.getByAreaId(mapAreaId);
        
        const duplicate = existingSegments.find(segment => 
            segment.name.toLowerCase() === name.toLowerCase() &&
            segment.id !== excludeId
        );

        if (duplicate) {
            throw new Error('Сегмент с таким именем уже существует в данной области');
        }
    }

    /**
     * Генерация уникального ID
     */
    generateId() {
        return `segment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // === МЕТОДЫ РАБОТЫ С КЭШЕМ ===

    /**
     * Получение из кэша
     */
    getFromCache(key) {
        if (this.segmentsCache.has(key)) {
            const cached = this.segmentsCache.get(key);
            
            // Проверяем TTL
            if (Date.now() - cached.timestamp < this.cacheConfig.ttl) {
                return cached.data;
            } else {
                // Удаляем устаревшие данные
                this.removeFromCache(key);
            }
        }
        return null;
    }

    /**
     * Добавление в кэш
     */
    addToCache(data, key = null) {
        // Проверяем размер кэша
        if (this.segmentsCache.size >= this.cacheConfig.maxSize) {
            this.cleanupCache();
        }

        const cacheKey = key || (Array.isArray(data) ? `area:${data[0]?.map_area_id}` : data.id);
        
        this.segmentsCache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
        });
    }

    /**
     * Обновление кэша
     */
    updateCache(segment) {
        // Обновляем индивидуальный кэш
        this.addToCache(segment);
        
        // Инвалидируем кэш области
        const areaCacheKey = `area:${segment.map_area_id}`;
        this.invalidateCache(areaCacheKey);
    }

    /**
     * Удаление из кэша
     */
    removeFromCache(key) {
        this.segmentsCache.delete(key);
        
        if (this.cacheTimeouts.has(key)) {
            clearTimeout(this.cacheTimeouts.get(key));
            this.cacheTimeouts.delete(key);
        }
    }

    /**
     * Инвалидация кэша по ключу
     */
    invalidateCache(key) {
        this.removeFromCache(key);
    }

    /**
     * Очистка устаревших данных из кэша
     */
    cleanupCache() {
        const now = Date.now();
        const keysToRemove = [];

        this.segmentsCache.forEach((cached, key) => {
            if (now - cached.timestamp >= this.cacheConfig.ttl) {
                keysToRemove.push(key);
            }
        });

        keysToRemove.forEach(key => this.removeFromCache(key));
    }

    /**
     * Настройка периодической очистки кэша
     */
    setupCacheCleanup() {
        setInterval(() => {
            this.cleanupCache();
        }, this.cacheConfig.ttl);
    }

    /**
     * Очистка всего кэша
     */
    clearCache() {
        this.segmentsCache.clear();
        this.cacheTimeouts.forEach(timeout => clearTimeout(timeout));
        this.cacheTimeouts.clear();
    }

    // === СИСТЕМА СОБЫТИЙ ===

    /**
     * Добавление слушателя событий
     */
    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * Удаление слушателя событий
     */
    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Генерация события
     */
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
     * Получение статистики кэша
     */
    getCacheStats() {
        return {
            size: this.segmentsCache.size,
            maxSize: this.cacheConfig.maxSize,
            ttl: this.cacheConfig.ttl,
            hitRatio: 0 // Можно добавить подсчёт hit/miss
        };
    }

    /**
     * Уничтожение сервиса
     */
    destroy() {
        // Очищаем кэш
        this.clearCache();
        
        // Очищаем обработчики событий
        this.eventHandlers.clear();
        
        // Очищаем ссылки
        this.database = null;
        this.validationService = null;
        this.configService = null;
        this.errorHandler = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentService;
} else {
    window.SegmentService = SegmentService;
}