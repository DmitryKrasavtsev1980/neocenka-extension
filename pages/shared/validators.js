/**
 * Валидаторы для различных типов данных
 * Validators for different data types
 */

class Validators {
    /**
     * Валидация адреса
     */
    static validateAddress(address) {
        const errors = [];
        
        if (!address) {
            errors.push('Адрес не может быть пустым');
            return { isValid: false, errors };
        }
        
        // Проверка обязательных полей
        if (!address.address || address.address.trim().length === 0) {
            errors.push('Поле "Адрес" обязательно для заполнения');
        }
        
        if (!address.type) {
            errors.push('Тип недвижимости должен быть указан');
        } else {
            const validTypes = ['house', 'house_with_land', 'land', 'commercial', 'building'];
            if (!validTypes.includes(address.type)) {
                errors.push('Некорректный тип недвижимости');
            }
        }
        
        // Проверка координат
        if (address.coordinates) {
            if (!this.isValidCoordinates(address.coordinates.lat, address.coordinates.lng)) {
                errors.push('Некорректные координаты');
            }
        }
        
        // Проверка этажности
        if (address.floors_count !== null && address.floors_count !== undefined) {
            if (!Number.isInteger(address.floors_count) || address.floors_count < 1 || address.floors_count > 100) {
                errors.push('Количество этажей должно быть от 1 до 100');
            }
        }
        
        // Проверка года постройки
        if (address.build_year !== null && address.build_year !== undefined) {
            const currentYear = new Date().getFullYear();
            if (!Number.isInteger(address.build_year) || address.build_year < 1800 || address.build_year > currentYear) {
                errors.push(`Год постройки должен быть от 1800 до ${currentYear}`);
            }
        }
        
        // Проверка количества подъездов
        if (address.entrances_count !== null && address.entrances_count !== undefined) {
            if (!Number.isInteger(address.entrances_count) || address.entrances_count < 1 || address.entrances_count > 50) {
                errors.push('Количество подъездов должно быть от 1 до 50');
            }
        }
        
        // Проверка газоснабжения
        if (address.gas_supply !== null && address.gas_supply !== undefined) {
            if (typeof address.gas_supply !== 'boolean') {
                errors.push('Газоснабжение должно быть булевым значением');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Валидация объявления
     */
    static validateListing(listing) {
        const errors = [];
        
        if (!listing) {
            errors.push('Объявление не может быть пустым');
            return { isValid: false, errors };
        }
        
        // Проверка обязательных полей
        if (!listing.title || listing.title.trim().length === 0) {
            errors.push('Заголовок объявления обязателен');
        }
        
        if (!listing.url || !this.isValidUrl(listing.url)) {
            errors.push('Некорректный URL объявления');
        }
        
        if (!listing.source) {
            errors.push('Источник объявления обязателен');
        } else {
            const validSources = ['avito', 'cian', 'manual', 'inpars'];
            if (!validSources.includes(listing.source)) {
                errors.push('Некорректный источник объявления');
            }
        }
        
        // Проверка цены
        if (listing.price !== null && listing.price !== undefined) {
            if (!Number.isFinite(listing.price) || listing.price < 0) {
                errors.push('Цена должна быть положительным числом');
            }
        }
        
        // Проверка площади
        if (listing.area !== null && listing.area !== undefined) {
            if (!Number.isFinite(listing.area) || listing.area <= 0) {
                errors.push('Площадь должна быть положительным числом');
            }
        }
        
        // Проверка этажа
        if (listing.floor !== null && listing.floor !== undefined) {
            if (!Number.isInteger(listing.floor) || listing.floor < 1) {
                errors.push('Этаж должен быть положительным целым числом');
            }
        }
        
        // Проверка статуса
        if (listing.status) {
            const validStatuses = ['active', 'inactive', 'sold', 'removed', 'archived'];
            if (!validStatuses.includes(listing.status)) {
                errors.push('Некорректный статус объявления');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Валидация сегмента
     */
    static validateSegment(segment) {
        const errors = [];
        
        if (!segment) {
            errors.push('Сегмент не может быть пустым');
            return { isValid: false, errors };
        }
        
        // Проверка обязательных полей
        if (!segment.name || segment.name.trim().length === 0) {
            errors.push('Название сегмента обязательно');
        }
        
        if (!segment.map_area_id) {
            errors.push('ID области обязателен');
        }
        
        // Проверка фильтров
        if (segment.filters) {
            const filterValidation = this.validateSegmentFilters(segment.filters);
            if (!filterValidation.isValid) {
                errors.push(...filterValidation.errors);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Валидация фильтров сегмента
     */
    static validateSegmentFilters(filters) {
        const errors = [];
        
        if (!filters) {
            return { isValid: true, errors: [] };
        }
        
        // Проверка типов недвижимости
        if (filters.type && Array.isArray(filters.type)) {
            const validTypes = ['house', 'house_with_land', 'land', 'commercial', 'building'];
            const invalidTypes = filters.type.filter(type => !validTypes.includes(type));
            if (invalidTypes.length > 0) {
                errors.push(`Некорректные типы недвижимости: ${invalidTypes.join(', ')}`);
            }
        }
        
        // Проверка этажности
        if (filters.floors_from !== null && filters.floors_from !== undefined) {
            if (!Number.isInteger(filters.floors_from) || filters.floors_from < 1 || filters.floors_from > 100) {
                errors.push('Минимальное количество этажей должно быть от 1 до 100');
            }
        }
        
        if (filters.floors_to !== null && filters.floors_to !== undefined) {
            if (!Number.isInteger(filters.floors_to) || filters.floors_to < 1 || filters.floors_to > 100) {
                errors.push('Максимальное количество этажей должно быть от 1 до 100');
            }
        }
        
        if (filters.floors_from && filters.floors_to && filters.floors_from > filters.floors_to) {
            errors.push('Минимальное количество этажей не может быть больше максимального');
        }
        
        // Проверка годов постройки
        const currentYear = new Date().getFullYear();
        
        if (filters.build_year_from !== null && filters.build_year_from !== undefined) {
            if (!Number.isInteger(filters.build_year_from) || filters.build_year_from < 1800 || filters.build_year_from > currentYear) {
                errors.push(`Минимальный год постройки должен быть от 1800 до ${currentYear}`);
            }
        }
        
        if (filters.build_year_to !== null && filters.build_year_to !== undefined) {
            if (!Number.isInteger(filters.build_year_to) || filters.build_year_to < 1800 || filters.build_year_to > currentYear) {
                errors.push(`Максимальный год постройки должен быть от 1800 до ${currentYear}`);
            }
        }
        
        if (filters.build_year_from && filters.build_year_to && filters.build_year_from > filters.build_year_to) {
            errors.push('Минимальный год постройки не может быть больше максимального');
        }
        
        // Проверка газоснабжения
        if (filters.gas_supply && Array.isArray(filters.gas_supply)) {
            const validGasValues = ['', 'true', 'false'];
            const invalidGasValues = filters.gas_supply.filter(value => !validGasValues.includes(value));
            if (invalidGasValues.length > 0) {
                errors.push(`Некорректные значения газоснабжения: ${invalidGasValues.join(', ')}`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Валидация области
     */
    static validateArea(area) {
        const errors = [];
        
        if (!area) {
            errors.push('Область не может быть пустой');
            return { isValid: false, errors };
        }
        
        // Проверка обязательных полей
        if (!area.name || area.name.trim().length === 0) {
            errors.push('Название области обязательно');
        }
        
        // Проверка полигона
        if (area.polygon) {
            if (!Array.isArray(area.polygon)) {
                errors.push('Полигон должен быть массивом');
            } else if (area.polygon.length < 3) {
                errors.push('Полигон должен содержать минимум 3 точки');
            } else {
                const invalidPoints = area.polygon.filter(point => 
                    !point || !this.isValidCoordinates(point.lat, point.lng)
                );
                if (invalidPoints.length > 0) {
                    errors.push('Полигон содержит некорректные координаты');
                }
            }
        }
        
        // Проверка URL фильтров
        if (area.avito_filter_url && !this.isValidUrl(area.avito_filter_url)) {
            errors.push('Некорректный URL фильтра Avito');
        }
        
        if (area.cian_filter_url && !this.isValidUrl(area.cian_filter_url)) {
            errors.push('Некорректный URL фильтра Cian');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Валидация ID
     */
    static validateId(id) {
        if (!id) {
            return { isValid: false, errors: ['ID не может быть пустым'] };
        }
        
        if (typeof id !== 'string') {
            return { isValid: false, errors: ['ID должен быть строкой'] };
        }
        
        // Проверка формата ID
        const idPattern = /^(id_\d+_[a-z0-9]+|osm_\w+_\d+)$/;
        if (!idPattern.test(id)) {
            return { isValid: false, errors: ['Некорректный формат ID'] };
        }
        
        return { isValid: true, errors: [] };
    }
    
    /**
     * Валидация координат
     */
    static isValidCoordinates(lat, lng) {
        return !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
    }
    
    /**
     * Валидация URL
     */
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * Валидация email
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    /**
     * Валидация телефона
     */
    static isValidPhone(phone) {
        const phoneRegex = /^(?:\+7|8)[\s\-]?\(?(\d{3})\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})$/;
        return phoneRegex.test(phone);
    }
    
    /**
     * Валидация формы
     */
    static validateForm(formData, rules) {
        const errors = {};
        let isValid = true;
        
        for (const [field, fieldRules] of Object.entries(rules)) {
            const value = formData[field];
            const fieldErrors = [];
            
            // Проверка обязательности
            if (fieldRules.required && (value === null || value === undefined || value === '')) {
                fieldErrors.push('Поле обязательно для заполнения');
            }
            
            // Если поле пустое и не обязательное, пропускаем дальнейшие проверки
            if ((value === null || value === undefined || value === '') && !fieldRules.required) {
                continue;
            }
            
            // Проверка типа
            if (fieldRules.type) {
                switch (fieldRules.type) {
                    case 'string':
                        if (typeof value !== 'string') {
                            fieldErrors.push('Значение должно быть строкой');
                        }
                        break;
                    case 'number':
                        if (typeof value !== 'number' || isNaN(value)) {
                            fieldErrors.push('Значение должно быть числом');
                        }
                        break;
                    case 'email':
                        if (!this.isValidEmail(value)) {
                            fieldErrors.push('Некорректный email');
                        }
                        break;
                    case 'url':
                        if (!this.isValidUrl(value)) {
                            fieldErrors.push('Некорректный URL');
                        }
                        break;
                    case 'phone':
                        if (!this.isValidPhone(value)) {
                            fieldErrors.push('Некорректный номер телефона');
                        }
                        break;
                }
            }
            
            // Проверка длины
            if (fieldRules.minLength && value.length < fieldRules.minLength) {
                fieldErrors.push(`Минимальная длина: ${fieldRules.minLength} символов`);
            }
            
            if (fieldRules.maxLength && value.length > fieldRules.maxLength) {
                fieldErrors.push(`Максимальная длина: ${fieldRules.maxLength} символов`);
            }
            
            // Проверка диапазона
            if (fieldRules.min !== undefined && value < fieldRules.min) {
                fieldErrors.push(`Минимальное значение: ${fieldRules.min}`);
            }
            
            if (fieldRules.max !== undefined && value > fieldRules.max) {
                fieldErrors.push(`Максимальное значение: ${fieldRules.max}`);
            }
            
            // Проверка паттерна
            if (fieldRules.pattern && !fieldRules.pattern.test(value)) {
                fieldErrors.push(fieldRules.patternMessage || 'Некорректный формат');
            }
            
            // Проверка массива значений
            if (fieldRules.in && !fieldRules.in.includes(value)) {
                fieldErrors.push(`Значение должно быть одним из: ${fieldRules.in.join(', ')}`);
            }
            
            // Кастомная валидация
            if (fieldRules.custom && typeof fieldRules.custom === 'function') {
                const customResult = fieldRules.custom(value, formData);
                if (customResult !== true) {
                    fieldErrors.push(customResult);
                }
            }
            
            if (fieldErrors.length > 0) {
                errors[field] = fieldErrors;
                isValid = false;
            }
        }
        
        return { isValid, errors };
    }
    
    /**
     * Валидация файла
     */
    static validateFile(file, options = {}) {
        const errors = [];
        
        if (!file) {
            errors.push('Файл не выбран');
            return { isValid: false, errors };
        }
        
        // Проверка размера
        if (options.maxSize && file.size > options.maxSize) {
            errors.push(`Размер файла не должен превышать ${this.formatFileSize(options.maxSize)}`);
        }
        
        // Проверка типа
        if (options.allowedTypes && !options.allowedTypes.includes(file.type)) {
            errors.push(`Разрешенные типы файлов: ${options.allowedTypes.join(', ')}`);
        }
        
        // Проверка расширения
        if (options.allowedExtensions) {
            const extension = file.name.split('.').pop().toLowerCase();
            if (!options.allowedExtensions.includes(extension)) {
                errors.push(`Разрешенные расширения: ${options.allowedExtensions.join(', ')}`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Санитизация данных
     */
    static sanitize(data, type = 'string') {
        if (data === null || data === undefined) {
            return null;
        }
        
        switch (type) {
            case 'string':
                return String(data).trim();
            case 'number':
                const num = Number(data);
                return isNaN(num) ? null : num;
            case 'boolean':
                return Boolean(data);
            case 'html':
                return String(data).replace(/<[^>]*>/g, '');
            case 'url':
                try {
                    return new URL(data).href;
                } catch {
                    return null;
                }
            default:
                return data;
        }
    }
    
    /**
     * Форматирование размера файла
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Validators;
} else {
    window.Validators = Validators;
}