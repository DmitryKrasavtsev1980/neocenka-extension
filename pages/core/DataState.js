/**
 * Управление состоянием данных приложения
 * Centralized state management for the area page
 */

class DataState {
    constructor() {
        // Основные данные
        this.currentAreaId = null;
        this.currentArea = null;
        this.addresses = [];
        this.listings = [];
        this.segments = [];
        this.realEstateObjects = [];
        
        // Состояние обработки данных
        this.processing = {
            parsing: false,
            updating: false,
            addresses: false,
            duplicates: false
        };
        
        // Выбранные элементы
        this.selectedDuplicates = new Set();
        this.selectedElements = new Set();
        
        // Фильтры
        this.activeMapFilter = null;
        this.processingFilters = {};
        
        // Подписчики на изменения
        this.subscribers = {};
        
        // Кэш для производительности
        this.cache = {};
        
        // Флаги состояния
        this.flags = {
            mapInitialized: false,
            dataLoaded: false,
            servicesInitialized: false
        };
    }
    
    /**
     * Подписка на изменения состояния
     */
    subscribe(property, callback) {
        if (!this.subscribers[property]) {
            this.subscribers[property] = [];
        }
        this.subscribers[property].push(callback);
    }
    
    /**
     * Отписка от изменений
     */
    unsubscribe(property, callback) {
        if (this.subscribers[property]) {
            this.subscribers[property] = this.subscribers[property].filter(cb => cb !== callback);
        }
    }
    
    /**
     * Установка значения состояния
     */
    setState(property, value) {
        const oldValue = this[property];
        this[property] = value;
        
        // Очищаем кэш если изменились данные
        if (this.isDataProperty(property)) {
            this.cache = {};
        }
        
        // Уведомляем подписчиков
        if (this.subscribers[property]) {
            this.subscribers[property].forEach(callback => {
                callback(value, oldValue);
            });
        }
    }
    
    /**
     * Получение значения состояния
     */
    getState(property) {
        return this[property];
    }
    
    /**
     * Обновление объекта в состоянии
     */
    updateState(property, updates) {
        if (typeof this[property] === 'object' && !Array.isArray(this[property])) {
            this.setState(property, { ...this[property], ...updates });
        } else {
            console.warn(`Cannot update non-object property: ${property}`);
        }
    }
    
    /**
     * Добавление элемента в массив
     */
    addToArray(property, item) {
        if (Array.isArray(this[property])) {
            const newArray = [...this[property], item];
            this.setState(property, newArray);
        } else {
            console.warn(`Cannot add to non-array property: ${property}`);
        }
    }
    
    /**
     * Удаление элемента из массива
     */
    removeFromArray(property, predicate) {
        if (Array.isArray(this[property])) {
            const newArray = this[property].filter(item => !predicate(item));
            this.setState(property, newArray);
        } else {
            console.warn(`Cannot remove from non-array property: ${property}`);
        }
    }
    
    /**
     * Обновление элемента в массиве
     */
    updateInArray(property, predicate, updates) {
        if (Array.isArray(this[property])) {
            const newArray = this[property].map(item => {
                if (predicate(item)) {
                    return { ...item, ...updates };
                }
                return item;
            });
            this.setState(property, newArray);
        } else {
            console.warn(`Cannot update in non-array property: ${property}`);
        }
    }
    
    /**
     * Получение кэшированного значения
     */
    getCached(key, generator) {
        if (this.cache[key]) {
            return this.cache[key];
        }
        
        const value = generator();
        this.cache[key] = value;
        return value;
    }
    
    /**
     * Очистка кэша
     */
    clearCache(key = null) {
        if (key) {
            delete this.cache[key];
        } else {
            this.cache = {};
        }
    }
    
    /**
     * Проверка является ли свойство данными
     */
    isDataProperty(property) {
        const dataProperties = ['addresses', 'listings', 'segments', 'realEstateObjects', 'currentArea'];
        return dataProperties.includes(property);
    }
    
    /**
     * Получение статистики по данным
     */
    getStats() {
        return {
            addresses: this.addresses.length,
            listings: this.listings.length,
            segments: this.segments.length,
            realEstateObjects: this.realEstateObjects.length,
            selectedDuplicates: this.selectedDuplicates.size,
            processingStatus: this.processing
        };
    }
    
    /**
     * Сброс всех данных
     */
    reset() {
        this.currentAreaId = null;
        this.currentArea = null;
        this.addresses = [];
        this.listings = [];
        this.segments = [];
        this.realEstateObjects = [];
        this.selectedDuplicates.clear();
        this.selectedElements.clear();
        this.processing = {
            parsing: false,
            updating: false,
            addresses: false,
            duplicates: false
        };
        this.activeMapFilter = null;
        this.processingFilters = {};
        this.cache = {};
        this.flags = {
            mapInitialized: false,
            dataLoaded: false,
            servicesInitialized: false
        };
    }
    
    /**
     * Экспорт состояния для отладки
     */
    exportState() {
        return {
            currentAreaId: this.currentAreaId,
            currentArea: this.currentArea,
            addresses: this.addresses,
            listings: this.listings,
            segments: this.segments,
            realEstateObjects: this.realEstateObjects,
            processing: this.processing,
            selectedDuplicates: Array.from(this.selectedDuplicates),
            activeMapFilter: this.activeMapFilter,
            processingFilters: this.processingFilters,
            flags: this.flags,
            stats: this.getStats()
        };
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataState;
} else {
    window.DataState = DataState;
}