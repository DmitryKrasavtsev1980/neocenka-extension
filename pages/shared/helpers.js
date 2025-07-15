/**
 * Вспомогательные функции для всего приложения
 * Helper functions for the entire application
 */

class Helpers {
    /**
     * Генерация уникального ID
     */
    static generateId() {
        return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Проверка настроек отладки
     */
    static async isDebugEnabled() {
        try {
            const settings = await window.db.getSettings();
            return settings.find(s => s.key === 'debug_enabled')?.value === true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Отладочное сообщение с проверкой настроек
     */
    static async debugLog(message, ...args) {
        if (await this.isDebugEnabled()) {
            console.log(message, ...args);
        }
    }
    
    /**
     * Форматирование даты
     */
    static formatDate(date, format = 'full') {
        if (!date) return '';
        
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) return '';
        
        const options = {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        switch (format) {
            case 'short':
                return dateObj.toLocaleDateString('ru-RU');
            case 'medium':
                return dateObj.toLocaleDateString('ru-RU', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            case 'time':
                return dateObj.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            case 'full':
            default:
                return dateObj.toLocaleDateString('ru-RU', options);
        }
    }
    
    /**
     * Форматирование цены
     */
    static formatPrice(price) {
        if (!price || isNaN(price)) return '';
        
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(price);
    }
    
    /**
     * Форматирование числа
     */
    static formatNumber(number, decimals = 0) {
        if (!number || isNaN(number)) return '';
        
        return new Intl.NumberFormat('ru-RU', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    }
    
    /**
     * Форматирование адреса
     */
    static formatAddress(address) {
        if (!address) return '';
        
        if (typeof address === 'string') {
            return address;
        }
        
        const parts = [];
        if (address.street) parts.push(address.street);
        if (address.house_number) parts.push(address.house_number);
        if (address.city) parts.push(address.city);
        
        return parts.join(', ');
    }
    
    /**
     * Обрезка текста
     */
    static truncateText(text, maxLength = 100) {
        if (!text) return '';
        
        if (text.length <= maxLength) return text;
        
        return text.substring(0, maxLength) + '...';
    }
    
    /**
     * Escape HTML
     */
    static escapeHtml(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Debounce функция
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    /**
     * Throttle функция
     */
    static throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    /**
     * Глубокое клонирование объекта
     */
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (obj instanceof Set) return new Set(Array.from(obj).map(item => this.deepClone(item)));
        if (obj instanceof Map) return new Map(Array.from(obj).map(([key, value]) => [this.deepClone(key), this.deepClone(value)]));
        
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    }
    
    /**
     * Проверка на пустое значение
     */
    static isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }
    
    /**
     * Получение значения из вложенного объекта
     */
    static getNestedValue(obj, path, defaultValue = null) {
        if (!obj || !path) return defaultValue;
        
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined || !current.hasOwnProperty(key)) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }
    
    /**
     * Установка значения в вложенном объекте
     */
    static setNestedValue(obj, path, value) {
        if (!obj || !path) return;
        
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
    }
    
    /**
     * Сравнение объектов
     */
    static isEqual(obj1, obj2) {
        if (obj1 === obj2) return true;
        
        if (obj1 === null || obj2 === null) return false;
        if (typeof obj1 !== typeof obj2) return false;
        
        if (typeof obj1 !== 'object') return obj1 === obj2;
        
        if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
        
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        
        if (keys1.length !== keys2.length) return false;
        
        for (const key of keys1) {
            if (!keys2.includes(key)) return false;
            if (!this.isEqual(obj1[key], obj2[key])) return false;
        }
        
        return true;
    }
    
    /**
     * Слияние объектов
     */
    static merge(target, ...sources) {
        if (!target || typeof target !== 'object') return target;
        
        sources.forEach(source => {
            if (source && typeof source === 'object') {
                Object.keys(source).forEach(key => {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        target[key] = this.merge(target[key] || {}, source[key]);
                    } else {
                        target[key] = source[key];
                    }
                });
            }
        });
        
        return target;
    }
    
    /**
     * Создание Promise с таймаутом
     */
    static withTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Operation timed out')), timeout);
            })
        ]);
    }
    
    /**
     * Пауза выполнения
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Повторение операции с задержкой
     */
    static async retry(operation, maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await this.sleep(delay);
            }
        }
    }
    
    /**
     * Батчинг операций
     */
    static async batch(items, batchSize, processor) {
        const results = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await processor(batch);
            results.push(...batchResults);
        }
        
        return results;
    }
    
    /**
     * Фильтрация массива с условием
     */
    static filterBy(array, conditions) {
        if (!Array.isArray(array)) return [];
        
        return array.filter(item => {
            return Object.keys(conditions).every(key => {
                const condition = conditions[key];
                const value = this.getNestedValue(item, key);
                
                if (typeof condition === 'function') {
                    return condition(value);
                }
                
                if (Array.isArray(condition)) {
                    return condition.includes(value);
                }
                
                return value === condition;
            });
        });
    }
    
    /**
     * Группировка массива по ключу
     */
    static groupBy(array, key) {
        if (!Array.isArray(array)) return {};
        
        return array.reduce((groups, item) => {
            const groupKey = this.getNestedValue(item, key);
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(item);
            return groups;
        }, {});
    }
    
    /**
     * Сортировка массива
     */
    static sortBy(array, key, order = 'asc') {
        if (!Array.isArray(array)) return [];
        
        return array.sort((a, b) => {
            const aValue = this.getNestedValue(a, key);
            const bValue = this.getNestedValue(b, key);
            
            if (aValue < bValue) return order === 'asc' ? -1 : 1;
            if (aValue > bValue) return order === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    /**
     * Валидация email
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
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
     * Валидация координат
     */
    static isValidCoordinates(lat, lng) {
        return !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
    }
    
    /**
     * Нормализация строки
     */
    static normalizeString(str) {
        if (!str) return '';
        
        return str.trim()
                  .replace(/\s+/g, ' ')
                  .toLowerCase();
    }
    
    /**
     * Извлечение чисел из строки
     */
    static extractNumbers(str) {
        if (!str) return [];
        
        const matches = str.match(/\d+/g);
        return matches ? matches.map(Number) : [];
    }
    
    /**
     * Конвертация размера файла
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    /**
     * Получение расширения файла
     */
    static getFileExtension(filename) {
        if (!filename) return '';
        
        const parts = filename.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }
    
    /**
     * Проверка типа файла
     */
    static isImageFile(filename) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
        return imageExtensions.includes(this.getFileExtension(filename));
    }
    
    /**
     * Генерация случайного цвета
     */
    static generateRandomColor() {
        const colors = [
            '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
            '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    /**
     * Преобразование цвета в RGB
     */
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    /**
     * Сохранение в localStorage
     */
    static saveToStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }
    
    /**
     * Загрузка из localStorage
     */
    static loadFromStorage(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            return defaultValue;
        }
    }
    
    /**
     * Удаление из localStorage
     */
    static removeFromStorage(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error('Failed to remove from localStorage:', error);
        }
    }
    
    /**
     * Копирование в буфер обмена
     */
    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }
    
    /**
     * Скачивание файла
     */
    static downloadFile(data, filename, mimeType = 'application/octet-stream') {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }
    
    /**
     * Чтение файла
     */
    static readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e.target.error);
            reader.readAsText(file);
        });
    }
    
    /**
     * Проверка поддержки браузера
     */
    static getBrowserSupport() {
        return {
            localStorage: typeof(Storage) !== 'undefined',
            webWorkers: typeof(Worker) !== 'undefined',
            geolocation: 'geolocation' in navigator,
            notifications: 'Notification' in window,
            clipboard: 'clipboard' in navigator,
            serviceWorker: 'serviceWorker' in navigator
        };
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Helpers;
} else {
    window.Helpers = Helpers;
}