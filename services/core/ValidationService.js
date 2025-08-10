/**
 * ValidationService - централизованная валидация данных
 * Заменяет разбросанную по коду валидацию единым сервисом
 */

class ValidationService {
    constructor() {
        this.validators = new Map();
        this.setupDefaultValidators();
    }

    /**
     * Настройка валидаторов по умолчанию
     */
    setupDefaultValidators() {
        // Валидация адресов
        this.validators.set('address', {
            required: ['address', 'coordinates', 'type', 'map_area_id'],
            validate: this.validateAddress.bind(this)
        });

        // Валидация сегментов
        this.validators.set('segment', {
            required: ['name', 'map_area_id'],
            validate: this.validateSegment.bind(this)
        });

        // Валидация областей карты
        this.validators.set('map_area', {
            required: ['name', 'polygon'],
            validate: this.validateMapArea.bind(this)
        });

        // Валидация объявлений
        this.validators.set('listing', {
            required: ['address_id', 'title', 'price', 'source', 'url'],
            validate: this.validateListing.bind(this)
        });

        // Валидация координат
        this.validators.set('coordinates', {
            validate: this.validateCoordinates.bind(this)
        });
    }

    /**
     * Основной метод валидации
     * @param {string} type - тип объекта для валидации
     * @param {object} data - данные для валидации
     * @returns {ValidationResult}
     */
    validate(type, data) {
        const validator = this.validators.get(type);
        
        if (!validator) {
            return {
                isValid: false,
                errors: [`Неизвестный тип объекта для валидации: ${type}`]
            };
        }

        const errors = [];

        // Проверка обязательных полей
        if (validator.required) {
            const missingFields = validator.required.filter(field => {
                return data[field] === undefined || data[field] === null || data[field] === '';
            });

            if (missingFields.length > 0) {
                errors.push(`Отсутствуют обязательные поля: ${missingFields.join(', ')}`);
            }
        }

        // Специфичная валидация
        if (validator.validate && errors.length === 0) {
            const specificErrors = validator.validate(data);
            errors.push(...specificErrors);
        }

        return {
            isValid: errors.length === 0,
            errors: errors,
            warnings: []
        };
    }

    /**
     * Валидация адреса
     */
    validateAddress(address) {
        const errors = [];

        // Проверка формата адреса
        if (typeof address.address !== 'string' || address.address.trim().length === 0) {
            errors.push('Адрес должен быть непустой строкой');
        } else if (address.address.length < 5) {
            errors.push('Адрес слишком короткий (минимум 5 символов)');
        } else if (address.address.length > 500) {
            errors.push('Адрес слишком длинный (максимум 500 символов)');
        }

        // Проверка координат
        const coordsValidation = this.validate('coordinates', address.coordinates);
        if (!coordsValidation.isValid) {
            errors.push(...coordsValidation.errors);
        }

        // Проверка типа недвижимости
        const validTypes = ['apartment', 'house', 'commercial'];
        if (!validTypes.includes(address.type)) {
            errors.push(`Недопустимый тип недвижимости. Допустимые: ${validTypes.join(', ')}`);
        }

        // Проверка числовых полей
        if (address.floors_count !== undefined) {
            if (!Number.isInteger(address.floors_count) || address.floors_count < 1 || address.floors_count > 100) {
                errors.push('Количество этажей должно быть целым числом от 1 до 100');
            }
        }

        if (address.build_year !== undefined) {
            const currentYear = new Date().getFullYear();
            if (!Number.isInteger(address.build_year) || address.build_year < 1800 || address.build_year > currentYear + 5) {
                errors.push(`Год постройки должен быть от 1800 до ${currentYear + 5}`);
            }
        }

        if (address.ceiling_height !== undefined) {
            if (typeof address.ceiling_height !== 'number' || address.ceiling_height < 2.0 || address.ceiling_height > 5.0) {
                errors.push('Высота потолков должна быть числом от 2.0 до 5.0 метров');
            }
        }

        return errors;
    }

    /**
     * Валидация сегмента
     */
    validateSegment(segment) {
        const errors = [];

        // Проверка имени сегмента
        if (typeof segment.name !== 'string' || segment.name.trim().length === 0) {
            errors.push('Имя сегмента должно быть непустой строкой');
        } else if (segment.name.length < 2) {
            errors.push('Имя сегмента слишком короткое (минимум 2 символа)');
        } else if (segment.name.length > 100) {
            errors.push('Имя сегмента слишком длинное (максимум 100 символов)');
        }

        // Проверка описания (если есть)
        if (segment.description !== undefined && segment.description !== null) {
            if (typeof segment.description !== 'string') {
                errors.push('Описание должно быть строкой');
            } else if (segment.description.length > 1000) {
                errors.push('Описание слишком длинное (максимум 1000 символов)');
            }
        }

        // Проверка фильтров
        if (segment.filters) {
            const filtersErrors = this.validateSegmentFilters(segment.filters);
            errors.push(...filtersErrors);
        }

        return errors;
    }

    /**
     * Валидация фильтров сегмента
     */
    validateSegmentFilters(filters) {
        const errors = [];

        // Проверка диапазонов этажей
        if (filters.floors_from !== undefined || filters.floors_to !== undefined) {
            if (filters.floors_from !== undefined) {
                if (!Number.isInteger(filters.floors_from) || filters.floors_from < 1) {
                    errors.push('Минимальное количество этажей должно быть положительным целым числом');
                }
            }
            
            if (filters.floors_to !== undefined) {
                if (!Number.isInteger(filters.floors_to) || filters.floors_to < 1) {
                    errors.push('Максимальное количество этажей должно быть положительным целым числом');
                }
            }

            if (filters.floors_from !== undefined && filters.floors_to !== undefined) {
                if (filters.floors_from > filters.floors_to) {
                    errors.push('Минимальное количество этажей не может быть больше максимального');
                }
            }
        }

        // Проверка диапазонов года постройки
        if (filters.build_year_from !== undefined || filters.build_year_to !== undefined) {
            const currentYear = new Date().getFullYear();
            
            if (filters.build_year_from !== undefined) {
                if (!Number.isInteger(filters.build_year_from) || filters.build_year_from < 1800) {
                    errors.push('Минимальный год постройки должен быть не меньше 1800');
                }
            }
            
            if (filters.build_year_to !== undefined) {
                if (!Number.isInteger(filters.build_year_to) || filters.build_year_to > currentYear + 5) {
                    errors.push(`Максимальный год постройки не может быть больше ${currentYear + 5}`);
                }
            }

            if (filters.build_year_from !== undefined && filters.build_year_to !== undefined) {
                if (filters.build_year_from > filters.build_year_to) {
                    errors.push('Минимальный год постройки не может быть больше максимального');
                }
            }
        }

        // Проверка массивов ID
        const arrayFields = ['house_series_id', 'house_class_id', 'wall_material_id', 'property_type'];
        arrayFields.forEach(field => {
            if (filters[field] !== undefined) {
                if (!Array.isArray(filters[field])) {
                    errors.push(`Поле ${field} должно быть массивом`);
                } else {
                    const invalidItems = filters[field].filter(item => typeof item !== 'string');
                    if (invalidItems.length > 0) {
                        errors.push(`Все элементы ${field} должны быть строками`);
                    }
                }
            }
        });

        return errors;
    }

    /**
     * Валидация области карты
     */
    validateMapArea(mapArea) {
        const errors = [];

        // Проверка имени области
        if (typeof mapArea.name !== 'string' || mapArea.name.trim().length === 0) {
            errors.push('Имя области должно быть непустой строкой');
        } else if (mapArea.name.length < 2) {
            errors.push('Имя области слишком короткое (минимум 2 символа)');
        } else if (mapArea.name.length > 100) {
            errors.push('Имя области слишком длинное (максимум 100 символов)');
        }

        // Проверка полигона
        if (!Array.isArray(mapArea.polygon)) {
            errors.push('Полигон должен быть массивом координат');
        } else {
            if (mapArea.polygon.length < 3) {
                errors.push('Полигон должен содержать минимум 3 точки');
            } else if (mapArea.polygon.length > 1000) {
                errors.push('Полигон содержит слишком много точек (максимум 1000)');
            }

            // Проверка каждой точки полигона
            mapArea.polygon.forEach((point, index) => {
                const coordsValidation = this.validate('coordinates', point);
                if (!coordsValidation.isValid) {
                    errors.push(`Неверные координаты в точке ${index + 1} полигона`);
                }
            });
        }

        // Проверка URL фильтров (если есть)
        if (mapArea.filters_url !== undefined && mapArea.filters_url !== null) {
            if (typeof mapArea.filters_url !== 'string') {
                errors.push('URL фильтров должен быть строкой');
            } else if (mapArea.filters_url.length > 0) {
                try {
                    new URL(mapArea.filters_url);
                } catch (e) {
                    errors.push('Некорректный URL фильтров');
                }
            }
        }

        return errors;
    }

    /**
     * Валидация объявления
     */
    validateListing(listing) {
        const errors = [];

        // Проверка заголовка
        if (typeof listing.title !== 'string' || listing.title.trim().length === 0) {
            errors.push('Заголовок объявления должен быть непустой строкой');
        } else if (listing.title.length > 500) {
            errors.push('Заголовок слишком длинный (максимум 500 символов)');
        }

        // Проверка цены
        if (typeof listing.price !== 'number' || listing.price <= 0) {
            errors.push('Цена должна быть положительным числом');
        } else if (listing.price > 1000000000) {
            errors.push('Цена не может превышать 1 миллиард');
        }

        // Проверка площади (если есть)
        if (listing.area !== undefined) {
            if (typeof listing.area !== 'number' || listing.area <= 0) {
                errors.push('Площадь должна быть положительным числом');
            } else if (listing.area > 10000) {
                errors.push('Площадь не может превышать 10000 кв.м.');
            }
        }

        // Проверка количества комнат (если есть)
        if (listing.rooms !== undefined) {
            if (!Number.isInteger(listing.rooms) || listing.rooms < 0 || listing.rooms > 20) {
                errors.push('Количество комнат должно быть целым числом от 0 до 20');
            }
        }

        // Проверка этажа (если есть)
        if (listing.floor !== undefined) {
            if (!Number.isInteger(listing.floor) || listing.floor < 1 || listing.floor > 200) {
                errors.push('Этаж должен быть целым числом от 1 до 200');
            }
        }

        // Проверка источника
        const validSources = ['avito', 'cian'];
        if (!validSources.includes(listing.source)) {
            errors.push(`Недопустимый источник. Допустимые: ${validSources.join(', ')}`);
        }

        // Проверка URL
        if (typeof listing.url !== 'string' || listing.url.length === 0) {
            errors.push('URL должен быть непустой строкой');
        } else {
            try {
                new URL(listing.url);
            } catch (e) {
                errors.push('Некорректный URL объявления');
            }
        }

        return errors;
    }

    /**
     * Валидация координат
     */
    validateCoordinates(coordinates) {
        const errors = [];

        if (!coordinates) {
            errors.push('Координаты не указаны');
            return errors;
        }

        let lat, lng;

        // Поддержка разных форматов координат
        if (Array.isArray(coordinates)) {
            if (coordinates.length < 2) {
                errors.push('Массив координат должен содержать минимум 2 элемента');
                return errors;
            }
            [lat, lng] = coordinates;
        } else if (typeof coordinates === 'object') {
            if (coordinates.lat !== undefined && coordinates.lng !== undefined) {
                lat = coordinates.lat;
                lng = coordinates.lng;
            } else if (coordinates.latitude !== undefined && coordinates.longitude !== undefined) {
                lat = coordinates.latitude;
                lng = coordinates.longitude;
            } else {
                errors.push('Объект координат должен содержать lat/lng или latitude/longitude');
                return errors;
            }
        } else {
            errors.push('Координаты должны быть массивом или объектом');
            return errors;
        }

        // Проверка типов
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            errors.push('Координаты должны быть числами');
            return errors;
        }

        // Проверка диапазонов
        if (lat < -90 || lat > 90) {
            errors.push('Широта должна быть в диапазоне от -90 до 90');
        }

        if (lng < -180 || lng > 180) {
            errors.push('Долгота должна быть в диапазоне от -180 до 180');
        }

        // Проверка на разумность (если это не мировые координаты)
        if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) {
            errors.push('Координаты слишком близки к нулю (возможно, не определены)');
        }

        return errors;
    }

    /**
     * Добавление кастомного валидатора
     */
    addValidator(type, validator) {
        this.validators.set(type, validator);
    }

    /**
     * Получение списка доступных типов валидации
     */
    getAvailableValidators() {
        return Array.from(this.validators.keys());
    }

    /**
     * Быстрая проверка валидности без подробностей
     */
    isValid(type, data) {
        const result = this.validate(type, data);
        return result.isValid;
    }

    /**
     * Валидация массива объектов
     */
    validateMany(type, dataArray) {
        if (!Array.isArray(dataArray)) {
            return {
                isValid: false,
                errors: ['Данные должны быть массивом'],
                results: []
            };
        }

        const results = dataArray.map((item, index) => ({
            index: index,
            ...this.validate(type, item)
        }));

        const hasErrors = results.some(result => !result.isValid);
        const allErrors = results
            .filter(result => !result.isValid)
            .map(result => `Объект ${result.index}: ${result.errors.join(', ')}`)
            .flat();

        return {
            isValid: !hasErrors,
            errors: allErrors,
            results: results
        };
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationService;
} else {
    window.ValidationService = ValidationService;
}