/**
 * ParameterTypeUtils - утилиты для работы с типами дополнительных параметров
 * Обеспечивает единообразную обработку всех типов параметров
 */

const ParameterTypeUtils = {
    /**
     * Получить список поддерживаемых типов параметров
     */
    getSupportedTypes() {
        return Object.keys(PARAMETER_TYPES || {});
    },

    /**
     * Проверить, поддерживается ли тип
     */
    isTypeSupported(type) {
        return this.getSupportedTypes().includes(type);
    },

    /**
     * Получить конфигурацию типа параметра
     */
    getTypeConfig(type) {
        const baseConfig = {
            name: PARAMETER_TYPES[type] || type,
            supportsOptions: false,
            supportsValidation: true,
            supportsMinMax: false,
            supportsPattern: false,
            supportsFileTypes: false,
            inputType: 'text',
            defaultValue: null,
            validationRules: {}
        };

        switch (type) {
            case 'string':
                return {
                    ...baseConfig,
                    supportsPattern: true,
                    inputType: 'text',
                    defaultValue: '',
                    validationRules: {
                        maxLength: 1000
                    }
                };

            case 'textarea':
                return {
                    ...baseConfig,
                    supportsPattern: true,
                    inputType: 'textarea',
                    defaultValue: '',
                    validationRules: {
                        maxLength: 10000
                    }
                };

            case 'number':
                return {
                    ...baseConfig,
                    supportsMinMax: true,
                    inputType: 'number',
                    defaultValue: 0,
                    validationRules: {
                        type: 'number'
                    }
                };

            case 'currency':
                return {
                    ...baseConfig,
                    supportsMinMax: true,
                    inputType: 'number',
                    defaultValue: 0,
                    validationRules: {
                        type: 'number',
                        min: 0,
                        step: 0.01
                    }
                };

            case 'percentage':
                return {
                    ...baseConfig,
                    supportsMinMax: true,
                    inputType: 'number',
                    defaultValue: 0,
                    validationRules: {
                        type: 'number',
                        min: 0,
                        max: 100,
                        step: 0.1
                    }
                };

            case 'boolean':
                return {
                    ...baseConfig,
                    inputType: 'checkbox',
                    defaultValue: false,
                    supportsValidation: false,
                    validationRules: {
                        type: 'boolean'
                    }
                };

            case 'select':
                return {
                    ...baseConfig,
                    supportsOptions: true,
                    inputType: 'select',
                    defaultValue: null,
                    validationRules: {
                        requiresOptions: true
                    }
                };

            case 'multiselect':
                return {
                    ...baseConfig,
                    supportsOptions: true,
                    inputType: 'select',
                    defaultValue: [],
                    validationRules: {
                        requiresOptions: true,
                        multiple: true
                    }
                };

            case 'date':
                return {
                    ...baseConfig,
                    inputType: 'date',
                    defaultValue: null,
                    validationRules: {
                        type: 'date'
                    }
                };

            case 'rating':
                return {
                    ...baseConfig,
                    supportsMinMax: true,
                    inputType: 'range',
                    defaultValue: 0,
                    validationRules: {
                        type: 'number',
                        min: 1,
                        max: 5,
                        step: 1
                    }
                };

            case 'range':
                return {
                    ...baseConfig,
                    inputType: 'text',
                    defaultValue: { min: null, max: null },
                    validationRules: {
                        type: 'object',
                        properties: ['min', 'max']
                    }
                };

            case 'url':
                return {
                    ...baseConfig,
                    supportsPattern: true,
                    inputType: 'url',
                    defaultValue: '',
                    validationRules: {
                        type: 'url',
                        pattern: '^https?://.+$'
                    }
                };

            case 'coordinates':
                return {
                    ...baseConfig,
                    inputType: 'text',
                    defaultValue: { lat: null, lng: null },
                    validationRules: {
                        type: 'object',
                        properties: ['lat', 'lng'],
                        latRange: [-90, 90],
                        lngRange: [-180, 180]
                    }
                };

            case 'file':
                return {
                    ...baseConfig,
                    supportsFileTypes: true,
                    inputType: 'file',
                    defaultValue: null,
                    validationRules: {
                        type: 'file',
                        maxSize: 10 * 1024 * 1024 // 10MB
                    }
                };

            default:
                return baseConfig;
        }
    },

    /**
     * Получить правила валидации для типа
     */
    getValidationRules(type) {
        const config = this.getTypeConfig(type);
        return config.validationRules;
    },

    /**
     * Валидация значения по типу
     */
    validateValue(type, value, validationConfig = {}) {
        const errors = [];
        const typeConfig = this.getTypeConfig(type);

        // Проверка на пустое значение
        if (validationConfig.required && this.isEmptyValue(type, value)) {
            errors.push('Поле обязательно для заполнения');
            return errors;
        }

        // Если значение пустое и поле не обязательно, валидация пройдена
        if (this.isEmptyValue(type, value)) {
            return errors;
        }

        // Валидация по типу
        switch (type) {
            case 'string':
            case 'textarea':
                if (typeof value !== 'string') {
                    errors.push('Значение должно быть строкой');
                } else {
                    if (validationConfig.maxLength && value.length > validationConfig.maxLength) {
                        errors.push(`Максимальная длина: ${validationConfig.maxLength} символов`);
                    }
                    if (validationConfig.pattern) {
                        const regex = new RegExp(validationConfig.pattern);
                        if (!regex.test(value)) {
                            errors.push('Значение не соответствует требуемому формату');
                        }
                    }
                }
                break;

            case 'number':
            case 'currency':
            case 'percentage':
                const numValue = Number(value);
                if (isNaN(numValue)) {
                    errors.push('Значение должно быть числом');
                } else {
                    if (validationConfig.min !== null && validationConfig.min !== undefined && numValue < validationConfig.min) {
                        errors.push(`Минимальное значение: ${validationConfig.min}`);
                    }
                    if (validationConfig.max !== null && validationConfig.max !== undefined && numValue > validationConfig.max) {
                        errors.push(`Максимальное значение: ${validationConfig.max}`);
                    }
                    if (type === 'percentage' && (numValue < 0 || numValue > 100)) {
                        errors.push('Значение должно быть от 0 до 100');
                    }
                }
                break;

            case 'boolean':
                if (typeof value !== 'boolean') {
                    errors.push('Значение должно быть true или false');
                }
                break;

            case 'select':
                if (validationConfig.options && !validationConfig.options.includes(value)) {
                    errors.push('Выберите одно из предложенных значений');
                }
                break;

            case 'multiselect':
                if (!Array.isArray(value)) {
                    errors.push('Значение должно быть массивом');
                } else if (validationConfig.options) {
                    for (const val of value) {
                        if (!validationConfig.options.includes(val)) {
                            errors.push(`Значение "${val}" не входит в список допустимых`);
                            break;
                        }
                    }
                }
                break;

            case 'date':
                const dateValue = new Date(value);
                if (isNaN(dateValue.getTime())) {
                    errors.push('Неверный формат даты');
                }
                break;

            case 'rating':
                const ratingValue = Number(value);
                if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
                    errors.push('Рейтинг должен быть от 1 до 5');
                }
                break;

            case 'range':
                if (typeof value !== 'object' || value.min === undefined || value.max === undefined) {
                    errors.push('Диапазон должен содержать минимальное и максимальное значения');
                } else {
                    const min = Number(value.min);
                    const max = Number(value.max);
                    if (!isNaN(min) && !isNaN(max) && min > max) {
                        errors.push('Минимальное значение не может быть больше максимального');
                    }
                }
                break;

            case 'url':
                try {
                    new URL(value);
                } catch {
                    errors.push('Неверный формат URL');
                }
                break;

            case 'coordinates':
                if (typeof value !== 'object' || value.lat === undefined || value.lng === undefined) {
                    errors.push('Координаты должны содержать широту и долготу');
                } else {
                    const lat = Number(value.lat);
                    const lng = Number(value.lng);
                    if (isNaN(lat) || isNaN(lng)) {
                        errors.push('Координаты должны быть числами');
                    } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                        errors.push('Неверные координаты');
                    }
                }
                break;

            case 'file':
                if (typeof value !== 'object' || !value.name) {
                    errors.push('Неверный формат файла');
                } else {
                    if (validationConfig.maxSize && value.size > validationConfig.maxSize) {
                        const maxSizeMB = Math.round(validationConfig.maxSize / 1024 / 1024);
                        errors.push(`Максимальный размер файла: ${maxSizeMB}MB`);
                    }
                    if (validationConfig.fileTypes && validationConfig.fileTypes.length > 0) {
                        const fileExtension = value.name.split('.').pop().toLowerCase();
                        if (!validationConfig.fileTypes.includes(fileExtension)) {
                            errors.push(`Допустимые типы файлов: ${validationConfig.fileTypes.join(', ')}`);
                        }
                    }
                }
                break;
        }

        return errors;
    },

    /**
     * Проверка на пустое значение
     */
    isEmptyValue(type, value) {
        if (value === null || value === undefined) {
            return true;
        }

        switch (type) {
            case 'string':
            case 'textarea':
            case 'url':
                return value.trim() === '';

            case 'number':
            case 'currency':
            case 'percentage':
            case 'rating':
                return isNaN(Number(value)) || value === '';

            case 'boolean':
                return false; // Boolean всегда имеет значение

            case 'multiselect':
                return !Array.isArray(value) || value.length === 0;

            case 'select':
            case 'date':
                return value === '';

            case 'range':
                return !value || (!value.min && !value.max);

            case 'coordinates':
                return !value || (!value.lat && !value.lng);

            case 'file':
                return !value || !value.name;

            default:
                return !value;
        }
    },

    /**
     * Форматирование значения для отображения
     */
    formatValue(type, value) {
        if (this.isEmptyValue(type, value)) {
            return '';
        }

        switch (type) {
            case 'boolean':
                return value ? 'Да' : 'Нет';

            case 'currency':
                return new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: 'RUB'
                }).format(value);

            case 'percentage':
                return `${value}%`;

            case 'date':
                return new Date(value).toLocaleDateString('ru-RU');

            case 'rating':
                return '★'.repeat(value) + '☆'.repeat(5 - value) + ` (${value}/5)`;

            case 'range':
                return `${value.min || '?'} — ${value.max || '?'}`;

            case 'multiselect':
                return Array.isArray(value) ? value.join(', ') : String(value);

            case 'coordinates':
                return `${value.lat || '?'}, ${value.lng || '?'}`;

            case 'file':
                return value.name || 'Файл';

            case 'url':
                return `<a href="${value}" target="_blank" class="text-indigo-600 hover:text-indigo-800 underline">${value}</a>`;

            default:
                return String(value);
        }
    },

    /**
     * Форматирование значения для отображения (только текст, без HTML)
     */
    formatDisplayValue(type, value) {
        const formatted = this.formatValue(type, value);

        // Удаляем HTML теги для безопасного отображения
        if (type === 'url') {
            return value;
        }

        return formatted;
    },

    /**
     * Конвертация значения из строки в правильный тип
     */
    convertValue(type, rawValue) {
        if (rawValue === null || rawValue === undefined || rawValue === '') {
            return this.getTypeConfig(type).defaultValue;
        }

        switch (type) {
            case 'string':
            case 'textarea':
            case 'url':
                return String(rawValue);

            case 'number':
            case 'currency':
            case 'percentage':
                const numValue = Number(rawValue);
                return isNaN(numValue) ? this.getTypeConfig(type).defaultValue : numValue;

            case 'boolean':
                if (typeof rawValue === 'boolean') return rawValue;
                return rawValue === 'true' || rawValue === '1' || rawValue === 1;

            case 'rating':
                const rating = Number(rawValue);
                if (isNaN(rating) || rating < 1 || rating > 5) {
                    return this.getTypeConfig(type).defaultValue;
                }
                return Math.round(rating);

            case 'multiselect':
                if (Array.isArray(rawValue)) return rawValue;
                if (typeof rawValue === 'string') {
                    return rawValue.split(',').map(v => v.trim()).filter(v => v);
                }
                return [];

            case 'select':
            case 'date':
                return String(rawValue);

            case 'range':
                if (typeof rawValue === 'object' && rawValue.min !== undefined && rawValue.max !== undefined) {
                    return rawValue;
                }
                return this.getTypeConfig(type).defaultValue;

            case 'coordinates':
                if (typeof rawValue === 'object' && rawValue.lat !== undefined && rawValue.lng !== undefined) {
                    return {
                        lat: Number(rawValue.lat) || null,
                        lng: Number(rawValue.lng) || null
                    };
                }
                return this.getTypeConfig(type).defaultValue;

            case 'file':
                if (typeof rawValue === 'object' && rawValue.name) {
                    return rawValue;
                }
                return this.getTypeConfig(type).defaultValue;

            default:
                return rawValue;
        }
    },

    /**
     * Сериализация значения для сохранения в БД
     */
    serializeValue(type, value) {
        if (this.isEmptyValue(type, value)) {
            return null;
        }

        switch (type) {
            case 'date':
                return new Date(value).toISOString();

            case 'range':
            case 'coordinates':
            case 'file':
                return JSON.stringify(value);

            default:
                return value;
        }
    },

    /**
     * Десериализация значения из БД
     */
    deserializeValue(type, serializedValue) {
        if (serializedValue === null || serializedValue === undefined) {
            return this.getTypeConfig(type).defaultValue;
        }

        switch (type) {
            case 'range':
            case 'coordinates':
            case 'file':
                try {
                    return JSON.parse(serializedValue);
                } catch {
                    return this.getTypeConfig(type).defaultValue;
                }

            case 'multiselect':
                if (Array.isArray(serializedValue)) {
                    return serializedValue;
                }
                try {
                    const parsed = JSON.parse(serializedValue);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }

            default:
                return this.convertValue(type, serializedValue);
        }
    },

    /**
     * Сравнение значений одного типа
     */
    compareValues(type, value1, value2) {
        // Конвертируем в одинаковый формат
        const v1 = this.convertValue(type, value1);
        const v2 = this.convertValue(type, value2);

        switch (type) {
            case 'range':
            case 'coordinates':
                return JSON.stringify(v1) === JSON.stringify(v2);

            case 'multiselect':
                if (!Array.isArray(v1) || !Array.isArray(v2)) return false;
                return v1.length === v2.length && v1.every(item => v2.includes(item));

            case 'file':
                return v1?.name === v2?.name;

            default:
                return v1 === v2;
        }
    },

    /**
     * Создание HTML элемента ввода для типа
     */
    createInputElement(type, parameterId, value, options = {}) {
        const config = this.getTypeConfig(type);
        const element = document.createElement('input');

        // Базовые атрибуты
        element.id = `param_${parameterId}`;
        element.name = `param_${parameterId}`;
        element.type = config.inputType;

        // Устанавливаем значение
        if (value !== null && value !== undefined) {
            if (type === 'boolean') {
                element.checked = Boolean(value);
            } else {
                element.value = value;
            }
        }

        // Добавляем атрибуты валидации
        if (options.required) {
            element.required = true;
        }

        if (config.supportsMinMax) {
            if (options.min !== null && options.min !== undefined) {
                element.min = options.min;
            }
            if (options.max !== null && options.max !== undefined) {
                element.max = options.max;
            }
        }

        return element;
    },

    /**
     * Создание примера значения для типа
     */
    getExampleValue(type) {
        switch (type) {
            case 'string':
                return 'Пример текста';
            case 'textarea':
                return 'Многострочный\nтекст примера';
            case 'number':
                return 42;
            case 'currency':
                return 1000000;
            case 'percentage':
                return 15.5;
            case 'boolean':
                return true;
            case 'select':
                return 'Опция 1';
            case 'multiselect':
                return ['Опция 1', 'Опция 2'];
            case 'date':
                return new Date().toISOString().split('T')[0];
            case 'rating':
                return 4;
            case 'range':
                return { min: 100, max: 200 };
            case 'url':
                return 'https://example.com';
            case 'coordinates':
                return { lat: 55.751244, lng: 37.618423 };
            case 'file':
                return { name: 'example.pdf', size: 1024, type: 'application/pdf' };
            default:
                return null;
        }
    }
};

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParameterTypeUtils;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.ParameterTypeUtils = ParameterTypeUtils;
}