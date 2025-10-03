/**
 * CustomParametersService - сервис для управления дополнительными параметрами объектов
 * Следует принципам архитектуры v0.1 и SOLID
 */

class CustomParametersService {
    constructor(database, validationService, configService, errorHandler) {
        this.database = database;
        this.validationService = validationService;
        this.configService = configService;
        this.errorHandler = errorHandler;

        // Кэш параметров для производительности
        this.parametersCache = new Map();
        this.cacheTimeouts = new Map();

        // Конфигурация кэширования
        this.cacheConfig = this.configService?.get('performance.cache') || {
            ttl: 300000, // 5 минут
            maxSize: 100
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
                maxParametersPerObject: 50,
                maxParameterNameLength: 100,
                maxOptionsCount: 50
            };

            // Инициализируем периодическую очистку кэша
            this.setupCacheCleanup();

            // Создаем базовые параметры если их нет
            await this.initializeDefaultParameters();

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'initialize'
            });
        }
    }

    /**
     * Получение всех параметров
     */
    async getParameters(activeOnly = false) {
        try {
            const cacheKey = `parameters_${activeOnly}`;

            // Проверяем кэш
            if (this.parametersCache.has(cacheKey)) {
                return this.parametersCache.get(cacheKey);
            }

            let parameters;
            if (activeOnly) {
                parameters = await this.database.getActiveCustomParameters();
                console.log(`🔍 CustomParametersService: Загружено активных параметров: ${parameters?.length || 0}`, parameters);
            } else {
                parameters = await this.database.getCustomParameters();
                console.log(`🔍 CustomParametersService: Загружено всех параметров: ${parameters?.length || 0}`, parameters);
            }

            // Сортируем по порядку отображения
            parameters.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

            // Кэшируем результат
            this.setCacheValue(cacheKey, parameters);

            return parameters;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'getParameters',
                params: { activeOnly }
            });
            return [];
        }
    }

    /**
     * Получение параметра по ID
     */
    async getParameter(parameterId) {
        try {
            const cacheKey = `parameter_${parameterId}`;

            if (this.parametersCache.has(cacheKey)) {
                return this.parametersCache.get(cacheKey);
            }

            const parameter = await this.database.getCustomParameter(parameterId);

            if (parameter) {
                this.setCacheValue(cacheKey, parameter);
            }

            return parameter;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'getParameter',
                params: { parameterId }
            });
            return null;
        }
    }

    /**
     * Создание нового параметра
     */
    async createParameter(parameterData) {
        try {
            // Валидация данных параметра
            const validationErrors = await this.validateParameterData(parameterData);
            if (validationErrors.length > 0) {
                throw new Error(`Ошибки валидации: ${validationErrors.join(', ')}`);
            }

            // Проверяем лимиты
            const existingCount = (await this.getParameters()).length;
            if (existingCount >= this.limits.maxParametersPerObject) {
                throw new Error(`Превышен лимит параметров: ${this.limits.maxParametersPerObject}`);
            }

            // Создаем модель параметра
            const parameter = new CustomParameterModel({
                ...parameterData,
                display_order: parameterData.display_order || existingCount
            });

            // Сохраняем в базе данных
            const savedParameter = await this.database.addCustomParameter(parameter);

            // Очищаем кэш
            this.invalidateCache();

            // Эмитим событие
            await this.emitEvent('parameterCreated', { parameter: savedParameter });

            return savedParameter;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'createParameter',
                params: { parameterData }
            });
            throw error;
        }
    }

    /**
     * Обновление параметра
     */
    async updateParameter(parameterId, updateData) {
        try {
            // Получаем существующий параметр
            const existingParameter = await this.getParameter(parameterId);
            if (!existingParameter) {
                throw new Error(`Параметр с ID ${parameterId} не найден`);
            }

            // Объединяем данные
            const updatedData = { ...existingParameter, ...updateData, id: parameterId };

            // Валидация обновленных данных
            const validationErrors = await this.validateParameterData(updatedData);
            if (validationErrors.length > 0) {
                throw new Error(`Ошибки валидации: ${validationErrors.join(', ')}`);
            }

            // Обновляем в базе данных
            const updatedParameter = await this.database.updateCustomParameter(updatedData);

            // Очищаем кэш
            this.invalidateCache();

            // Эмитим событие
            await this.emitEvent('parameterUpdated', {
                parameter: updatedParameter,
                oldParameter: existingParameter
            });

            return updatedParameter;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'updateParameter',
                params: { parameterId, updateData }
            });
            throw error;
        }
    }

    /**
     * Удаление параметра
     */
    async deleteParameter(parameterId) {
        try {
            const existingParameter = await this.getParameter(parameterId);
            if (!existingParameter) {
                throw new Error(`Параметр с ID ${parameterId} не найден`);
            }

            // Удаляем параметр (каскадно удалятся и все его значения)
            await this.database.deleteCustomParameter(parameterId);

            // Очищаем кэш
            this.invalidateCache();

            // Эмитим событие
            await this.emitEvent('parameterDeleted', { parameter: existingParameter });

            return true;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'deleteParameter',
                params: { parameterId }
            });
            throw error;
        }
    }

    /**
     * Изменение порядка параметров
     */
    async reorderParameters(parameterIds) {
        try {
            const operations = [];

            for (let i = 0; i < parameterIds.length; i++) {
                const parameterId = parameterIds[i];
                const parameter = await this.getParameter(parameterId);

                if (parameter) {
                    parameter.display_order = i;
                    operations.push(this.database.updateCustomParameter(parameter));
                }
            }

            // Выполняем все операции
            await Promise.all(operations);

            // Очищаем кэш
            this.invalidateCache();

            // Эмитим событие
            await this.emitEvent('parametersReordered', { parameterIds });

            return true;

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'reorderParameters',
                params: { parameterIds }
            });
            throw error;
        }
    }

    /**
     * Получение параметров по типу
     */
    async getParametersByType(type) {
        try {
            const allParameters = await this.getParameters(true);
            return allParameters.filter(param => param.type === type);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'getParametersByType',
                params: { type }
            });
            return [];
        }
    }

    /**
     * Валидация данных параметра
     */
    async validateParameterData(data) {
        const errors = [];

        // Используем модель для базовой валидации
        const parameter = new CustomParameterModel(data);
        const modelErrors = parameter.validate();
        errors.push(...modelErrors);

        // Дополнительная валидация
        if (data.name && data.name.length > this.limits.maxParameterNameLength) {
            errors.push(`Название параметра слишком длинное (максимум ${this.limits.maxParameterNameLength} символов)`);
        }

        if (data.options && data.options.length > this.limits.maxOptionsCount) {
            errors.push(`Слишком много вариантов выбора (максимум ${this.limits.maxOptionsCount})`);
        }

        // Проверяем уникальность названия (кроме текущего параметра)
        if (data.name) {
            const existingParameters = await this.getParameters();
            const duplicateName = existingParameters.find(p =>
                p.name.toLowerCase() === data.name.toLowerCase() && p.id !== data.id
            );

            if (duplicateName) {
                errors.push(`Параметр с названием "${data.name}" уже существует`);
            }
        }

        return errors;
    }

    /**
     * Валидация значения параметра
     */
    async validateParameterValue(parameterId, value) {
        try {
            const parameter = await this.getParameter(parameterId);
            if (!parameter) {
                return ['Параметр не найден'];
            }

            const valueModel = new ObjectCustomValueModel({
                parameter_id: parameterId,
                value: value
            });

            return valueModel.validateValueByType(parameter);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'validateParameterValue',
                params: { parameterId, value }
            });
            return ['Ошибка валидации значения'];
        }
    }

    /**
     * Получение статистики использования параметров
     */
    async getParametersStats() {
        try {
            return await this.database.getCustomParametersStats();

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                service: 'CustomParametersService',
                method: 'getParametersStats'
            });
            return { total: 0, active: 0, byType: {} };
        }
    }

    /**
     * Создание базовых параметров по умолчанию
     */
    async initializeDefaultParameters() {
        try {
            // Проверяем готовность БД
            if (!this.database || !this.database.db) {
                console.log('🔄 База данных не готова, пропускаем инициализацию параметров по умолчанию');
                return;
            }

            const existingParameters = await this.getParameters();
            if (existingParameters.length > 0) {
                return; // Параметры уже есть
            }

            // Создаем базовые параметры для недвижимости
            const defaultParameters = [
                {
                    name: 'Состояние подъезда',
                    type: 'rating',
                    validation: { required: false, min: 1, max: 5 },
                    display_order: 0
                },
                {
                    name: 'Год последнего ремонта',
                    type: 'date',
                    validation: { required: false },
                    display_order: 1
                },
                {
                    name: 'Тип парковки',
                    type: 'select',
                    options: ['Нет', 'Уличная', 'Подземная', 'Крытая'],
                    validation: { required: false },
                    display_order: 2
                },
                {
                    name: 'Затраты на ремонт',
                    type: 'currency',
                    validation: { required: false, min: 0 },
                    display_order: 3
                },
                {
                    name: 'Дополнительные заметки',
                    type: 'textarea',
                    validation: { required: false },
                    display_order: 4
                }
            ];

            for (const paramData of defaultParameters) {
                await this.createParameter(paramData);
            }

        } catch (error) {
            // Не критично если не удалось создать параметры по умолчанию
            console.warn('Не удалось создать параметры по умолчанию:', error);
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
        this.parametersCache.set(key, value);

        // Устанавливаем таймаут на удаление
        const timeout = setTimeout(() => {
            this.parametersCache.delete(key);
            this.cacheTimeouts.delete(key);
        }, this.cacheConfig.ttl);

        this.cacheTimeouts.set(key, timeout);

        // Проверяем размер кэша
        if (this.parametersCache.size > this.cacheConfig.maxSize) {
            // Удаляем самые старые записи
            const keysToDelete = Array.from(this.parametersCache.keys()).slice(0,
                this.parametersCache.size - this.cacheConfig.maxSize + 1);

            keysToDelete.forEach(key => {
                if (this.cacheTimeouts.has(key)) {
                    clearTimeout(this.cacheTimeouts.get(key));
                    this.cacheTimeouts.delete(key);
                }
                this.parametersCache.delete(key);
            });
        }
    }

    invalidateCache() {
        this.parametersCache.clear();
        this.cacheTimeouts.forEach(timeout => clearTimeout(timeout));
        this.cacheTimeouts.clear();
    }

    setupCacheCleanup() {
        // Очистка кэша каждые 10 минут
        setInterval(() => {
            const now = Date.now();
            for (const [key, timeout] of this.cacheTimeouts.entries()) {
                if (now - timeout > this.cacheConfig.ttl) {
                    this.parametersCache.delete(key);
                    clearTimeout(timeout);
                    this.cacheTimeouts.delete(key);
                }
            }
        }, 600000); // 10 минут
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
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomParametersService;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.CustomParametersService = CustomParametersService;
}