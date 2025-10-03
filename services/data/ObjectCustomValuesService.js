/**
 * ObjectCustomValuesService - сервис для управления значениями дополнительных параметров объектов
 * Следует принципам архитектуры v0.1 и SOLID
 */

class ObjectCustomValuesService {
    constructor(database, customParametersService, validationService, errorHandler) {
        this.database = database;
        this.customParametersService = customParametersService;
        this.validationService = validationService;
        this.errorHandler = errorHandler;

        // Кэш значений для производительности
        this.valuesCache = new Map();
        this.cacheTimeouts = new Map();

        // Конфигурация кэширования
        this.cacheConfig = {
            ttl: 180000, // 3 минуты (короче чем параметры, т.к. значения изменяются чаще)
            maxSize: 500
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
            // Настраиваем периодическую очистку кэша
            this.setupCacheCleanup();

            // Подписываемся на изменения параметров
            if (this.customParametersService) {
                this.customParametersService.on('parameterDeleted', this.handleParameterDeleted.bind(this));
                this.customParametersService.on('parameterUpdated', this.handleParameterUpdated.bind(this));
            }

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'initialize'
            });
        }
    }

    /**
     * Получение всех значений дополнительных параметров для объекта
     */
    async getObjectValues(objectId) {
        try {
            const cacheKey = `object_values_${objectId}`;

            // Проверяем кэш
            if (this.valuesCache.has(cacheKey)) {
                return this.valuesCache.get(cacheKey);
            }

            // Получаем значения из базы данных
            const rawValues = await this.database.getObjectCustomValues(objectId);

            // Получаем активные параметры для валидации
            const activeParameters = await this.customParametersService.getParameters(true);
            const parametersMap = new Map(activeParameters.map(p => [p.id, p]));

            // Формируем структурированный результат
            const values = {};
            const valuesWithMeta = [];

            for (const rawValue of rawValues) {
                const parameter = parametersMap.get(rawValue.parameter_id);
                if (parameter) {
                    // Создаем модель значения для валидации и форматирования
                    const valueModel = new ObjectCustomValueModel(rawValue);

                    values[rawValue.parameter_id] = rawValue.value;
                    valuesWithMeta.push({
                        ...rawValue,
                        parameter: parameter,
                        displayValue: valueModel.formatDisplayValue(parameter),
                        isValid: valueModel.validateValueByType(parameter).length === 0
                    });
                }
            }

            const result = {
                objectId: objectId,
                values: values,
                valuesWithMeta: valuesWithMeta
            };

            // Кэшируем результат
            this.setCacheValue(cacheKey, result);

            return result;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'getObjectValues',
                params: { objectId }
            });
            return { objectId: objectId, values: {}, valuesWithMeta: [] };
        }
    }

    /**
     * Получение конкретного значения параметра для объекта
     */
    async getObjectValue(objectId, parameterId) {
        try {
            const cacheKey = `object_value_${objectId}_${parameterId}`;

            if (this.valuesCache.has(cacheKey)) {
                return this.valuesCache.get(cacheKey);
            }

            const rawValue = await this.database.getObjectCustomValue(objectId, parameterId);

            if (rawValue) {
                // Получаем информацию о параметре
                const parameter = await this.customParametersService.getParameter(parameterId);
                if (parameter) {
                    const valueModel = new ObjectCustomValueModel(rawValue);
                    const result = {
                        ...rawValue,
                        parameter: parameter,
                        displayValue: valueModel.formatDisplayValue(parameter),
                        isValid: valueModel.validateValueByType(parameter).length === 0
                    };

                    this.setCacheValue(cacheKey, result);
                    return result;
                }
            }

            return null;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'getObjectValue',
                params: { objectId, parameterId }
            });
            return null;
        }
    }

    /**
     * Установка значения дополнительного параметра для объекта
     */
    async setObjectValue(objectId, parameterId, value) {
        try {
            // Получаем информацию о параметре
            const parameter = await this.customParametersService.getParameter(parameterId);
            if (!parameter) {
                throw new Error(`Параметр с ID ${parameterId} не найден`);
            }

            if (!parameter.is_active) {
                throw new Error(`Параметр "${parameter.name}" неактивен`);
            }

            // Валидация значения
            const validationErrors = await this.customParametersService.validateParameterValue(parameterId, value);
            if (validationErrors.length > 0) {
                throw new Error(`Ошибки валидации: ${validationErrors.join(', ')}`);
            }

            // Получаем текущее значение для сравнения
            const currentValue = await this.database.getObjectCustomValue(objectId, parameterId);

            // Сохраняем значение в базе данных
            const savedValue = await this.database.setObjectCustomValue(objectId, parameterId, value);

            // Очищаем кэш для этого объекта и параметра
            this.invalidateObjectCache(objectId);

            // Эмитим событие
            await this.emitEvent('valueChanged', {
                objectId: objectId,
                parameter: parameter,
                value: savedValue,
                oldValue: currentValue,
                isNew: !currentValue
            });

            return savedValue;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'setObjectValue',
                params: { objectId, parameterId, value }
            });
            throw error;
        }
    }

    /**
     * Массовая установка значений параметров для объекта
     */
    async setObjectValues(objectId, values) {
        try {
            const results = [];
            const errors = [];

            // Получаем все активные параметры для валидации
            const activeParameters = await this.customParametersService.getParameters(true);
            const parametersMap = new Map(activeParameters.map(p => [p.id, p]));

            // Обрабатываем каждое значение
            for (const [parameterId, value] of Object.entries(values)) {
                try {
                    // Проверяем, что параметр существует и активен
                    if (!parametersMap.has(parameterId)) {
                        errors.push(`Параметр с ID ${parameterId} не найден или неактивен`);
                        continue;
                    }

                    const result = await this.setObjectValue(objectId, parameterId, value);
                    results.push(result);

                } catch (error) {
                    errors.push(`Ошибка для параметра ${parameterId}: ${error.message}`);
                }
            }

            // Эмитим событие о массовом обновлении
            await this.emitEvent('valuesUpdated', {
                objectId: objectId,
                results: results,
                errors: errors
            });

            return {
                success: results.length,
                errors: errors,
                results: results
            };

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'setObjectValues',
                params: { objectId, values }
            });
            throw error;
        }
    }

    /**
     * Удаление значения дополнительного параметра для объекта
     */
    async deleteObjectValue(objectId, parameterId) {
        try {
            const existingValue = await this.database.getObjectCustomValue(objectId, parameterId);
            if (!existingValue) {
                return null; // Значение уже отсутствует
            }

            // Получаем информацию о параметре
            const parameter = await this.customParametersService.getParameter(parameterId);

            // Удаляем значение
            await this.database.deleteObjectCustomValue(objectId, parameterId);

            // Очищаем кэш
            this.invalidateObjectCache(objectId);

            // Эмитим событие
            await this.emitEvent('valueDeleted', {
                objectId: objectId,
                parameter: parameter,
                deletedValue: existingValue
            });

            return existingValue;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'deleteObjectValue',
                params: { objectId, parameterId }
            });
            throw error;
        }
    }

    /**
     * Удаление всех значений дополнительных параметров для объекта
     */
    async deleteAllObjectValues(objectId) {
        try {
            const existingValues = await this.database.getObjectCustomValues(objectId);

            if (existingValues.length === 0) {
                return [];
            }

            // Удаляем все значения
            const results = await this.database.deleteAllObjectCustomValues(objectId);

            // Очищаем кэш
            this.invalidateObjectCache(objectId);

            // Эмитим событие
            await this.emitEvent('allValuesDeleted', {
                objectId: objectId,
                deletedValues: existingValues
            });

            return results;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'deleteAllObjectValues',
                params: { objectId }
            });
            throw error;
        }
    }

    /**
     * Получение всех значений конкретного параметра
     */
    async getValuesByParameter(parameterId) {
        try {
            const cacheKey = `parameter_values_${parameterId}`;

            if (this.valuesCache.has(cacheKey)) {
                return this.valuesCache.get(cacheKey);
            }

            const rawValues = await this.database.getValuesByCustomParameter(parameterId);
            const parameter = await this.customParametersService.getParameter(parameterId);

            const values = rawValues.map(rawValue => {
                const valueModel = new ObjectCustomValueModel(rawValue);
                return {
                    ...rawValue,
                    parameter: parameter,
                    displayValue: valueModel.formatDisplayValue(parameter),
                    isValid: valueModel.validateValueByType(parameter).length === 0
                };
            });

            this.setCacheValue(cacheKey, values);
            return values;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'getValuesByParameter',
                params: { parameterId }
            });
            return [];
        }
    }

    /**
     * Получение статистики использования значений параметра
     */
    async getParameterValueStats(parameterId) {
        try {
            const values = await this.getValuesByParameter(parameterId);
            const parameter = await this.customParametersService.getParameter(parameterId);

            const stats = {
                parameterId: parameterId,
                parameterName: parameter?.name || 'Неизвестный параметр',
                parameterType: parameter?.type || 'unknown',
                totalObjects: values.length,
                filledObjects: values.filter(v => !new ObjectCustomValueModel(v).isEmptyValue()).length,
                emptyObjects: 0,
                valueDistribution: {}
            };

            stats.emptyObjects = stats.totalObjects - stats.filledObjects;

            // Анализируем распределение значений по типу параметра
            if (parameter) {
                switch (parameter.type) {
                    case 'boolean':
                        stats.valueDistribution = {
                            'true': values.filter(v => v.value === true).length,
                            'false': values.filter(v => v.value === false).length
                        };
                        break;

                    case 'select':
                    case 'multiselect':
                        const distribution = {};
                        values.forEach(v => {
                            if (Array.isArray(v.value)) {
                                v.value.forEach(val => {
                                    distribution[val] = (distribution[val] || 0) + 1;
                                });
                            } else if (v.value) {
                                distribution[v.value] = (distribution[v.value] || 0) + 1;
                            }
                        });
                        stats.valueDistribution = distribution;
                        break;

                    case 'rating':
                        for (let i = 1; i <= 5; i++) {
                            stats.valueDistribution[i] = values.filter(v => v.value === i).length;
                        }
                        break;

                    case 'number':
                    case 'currency':
                    case 'percentage':
                        const numValues = values.filter(v => typeof v.value === 'number').map(v => v.value);
                        if (numValues.length > 0) {
                            stats.valueDistribution = {
                                min: Math.min(...numValues),
                                max: Math.max(...numValues),
                                avg: numValues.reduce((a, b) => a + b, 0) / numValues.length,
                                count: numValues.length
                            };
                        }
                        break;
                }
            }

            return stats;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'ObjectCustomValuesService',
                method: 'getParameterValueStats',
                params: { parameterId }
            });
            return {
                parameterId: parameterId,
                totalObjects: 0,
                filledObjects: 0,
                emptyObjects: 0,
                valueDistribution: {}
            };
        }
    }

    /**
     * Обработчик удаления параметра
     */
    async handleParameterDeleted(data) {
        try {
            const { parameter } = data;
            // Очищаем кэш для этого параметра
            this.invalidateParameterCache(parameter.id);

        } catch (error) {
            console.warn('Error handling parameter deletion:', error);
        }
    }

    /**
     * Обработчик обновления параметра
     */
    async handleParameterUpdated(data) {
        try {
            const { parameter } = data;
            // Очищаем кэш для этого параметра
            this.invalidateParameterCache(parameter.id);

        } catch (error) {
            console.warn('Error handling parameter update:', error);
        }
    }

    /**
     * Управление кэшем
     */
    setCacheValue(key, value) {
        // Очищаем старый таймаут если есть
        if (this.cacheTimeouts.has(key)) {
            clearTimeout(this.cacheTimeouts.get(key));
        }

        // Устанавливаем значение
        this.valuesCache.set(key, value);

        // Устанавливаем таймаут на удаление
        const timeout = setTimeout(() => {
            this.valuesCache.delete(key);
            this.cacheTimeouts.delete(key);
        }, this.cacheConfig.ttl);

        this.cacheTimeouts.set(key, timeout);

        // Проверяем размер кэша
        if (this.valuesCache.size > this.cacheConfig.maxSize) {
            const keysToDelete = Array.from(this.valuesCache.keys()).slice(0,
                this.valuesCache.size - this.cacheConfig.maxSize + 1);

            keysToDelete.forEach(key => {
                if (this.cacheTimeouts.has(key)) {
                    clearTimeout(this.cacheTimeouts.get(key));
                    this.cacheTimeouts.delete(key);
                }
                this.valuesCache.delete(key);
            });
        }
    }

    invalidateObjectCache(objectId) {
        const keysToDelete = [];
        for (const key of this.valuesCache.keys()) {
            if (key.startsWith(`object_value_${objectId}`) || key.startsWith(`object_values_${objectId}`)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => {
            if (this.cacheTimeouts.has(key)) {
                clearTimeout(this.cacheTimeouts.get(key));
                this.cacheTimeouts.delete(key);
            }
            this.valuesCache.delete(key);
        });
    }

    invalidateParameterCache(parameterId) {
        const keysToDelete = [];
        for (const key of this.valuesCache.keys()) {
            if (key.includes(`_${parameterId}`) || key.startsWith(`parameter_values_${parameterId}`)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => {
            if (this.cacheTimeouts.has(key)) {
                clearTimeout(this.cacheTimeouts.get(key));
                this.cacheTimeouts.delete(key);
            }
            this.valuesCache.delete(key);
        });
    }

    invalidateCache() {
        this.valuesCache.clear();
        this.cacheTimeouts.forEach(timeout => clearTimeout(timeout));
        this.cacheTimeouts.clear();
    }

    setupCacheCleanup() {
        // Очистка кэша каждые 5 минут
        setInterval(() => {
            const now = Date.now();
            for (const [key, timeout] of this.cacheTimeouts.entries()) {
                if (now - timeout > this.cacheConfig.ttl) {
                    this.valuesCache.delete(key);
                    clearTimeout(timeout);
                    this.cacheTimeouts.delete(key);
                }
            }
        }, 300000); // 5 минут
    }

    /**
     * Система событий
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    async emitEvent(event, data) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            for (const handler of handlers) {
                try {
                    await handler(data);
                } catch (error) {
                    console.warn(`Error in event handler for ${event}:`, error);
                }
            }
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        this.invalidateCache();
        this.eventHandlers.clear();

        // Отписываемся от событий customParametersService
        if (this.customParametersService) {
            this.customParametersService.off('parameterDeleted', this.handleParameterDeleted.bind(this));
            this.customParametersService.off('parameterUpdated', this.handleParameterUpdated.bind(this));
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObjectCustomValuesService;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.ObjectCustomValuesService = ObjectCustomValuesService;
}