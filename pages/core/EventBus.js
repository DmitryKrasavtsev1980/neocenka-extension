/**
 * Система событий для связи между модулями
 * Event bus for inter-module communication
 */

class EventBus {
    constructor() {
        this.events = {};
        this.onceEvents = {};
        this.maxListeners = 100;
        
        // Отладочная информация
        this.debug = false;
        this.eventHistory = [];
        this.maxHistorySize = 1000;
    }
    
    /**
     * Включение отладочного режима
     */
    enableDebug() {
        this.debug = true;
    }
    
    /**
     * Отключение отладочного режима
     */
    disableDebug() {
        this.debug = false;
    }
    
    /**
     * Подписка на событие
     */
    on(event, callback, context = null) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        if (!this.events[event]) {
            this.events[event] = [];
        }
        
        // Проверка лимита слушателей
        if (this.events[event].length >= this.maxListeners) {
            console.warn(`Event "${event}" has reached maximum listeners limit (${this.maxListeners})`);
        }
        
        const listener = {
            callback,
            context,
            id: this.generateId()
        };
        
        this.events[event].push(listener);
        
        if (this.debug) {
        }
        
        // Возвращаем ID для возможности отписки
        return listener.id;
    }
    
    /**
     * Одноразовая подписка на событие
     */
    once(event, callback, context = null) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        if (!this.onceEvents[event]) {
            this.onceEvents[event] = [];
        }
        
        const listener = {
            callback,
            context,
            id: this.generateId()
        };
        
        this.onceEvents[event].push(listener);
        
        if (this.debug) {
        }
        
        return listener.id;
    }
    
    /**
     * Отписка от события
     */
    off(event, callbackOrId) {
        let removed = false;
        
        // Отписка от обычных событий
        if (this.events[event]) {
            if (typeof callbackOrId === 'string') {
                // Отписка по ID
                const index = this.events[event].findIndex(listener => listener.id === callbackOrId);
                if (index !== -1) {
                    this.events[event].splice(index, 1);
                    removed = true;
                }
            } else {
                // Отписка по callback
                const index = this.events[event].findIndex(listener => listener.callback === callbackOrId);
                if (index !== -1) {
                    this.events[event].splice(index, 1);
                    removed = true;
                }
            }
            
            if (this.events[event].length === 0) {
                delete this.events[event];
            }
        }
        
        // Отписка от одноразовых событий
        if (this.onceEvents[event]) {
            if (typeof callbackOrId === 'string') {
                const index = this.onceEvents[event].findIndex(listener => listener.id === callbackOrId);
                if (index !== -1) {
                    this.onceEvents[event].splice(index, 1);
                    removed = true;
                }
            } else {
                const index = this.onceEvents[event].findIndex(listener => listener.callback === callbackOrId);
                if (index !== -1) {
                    this.onceEvents[event].splice(index, 1);
                    removed = true;
                }
            }
            
            if (this.onceEvents[event].length === 0) {
                delete this.onceEvents[event];
            }
        }
        
        if (this.debug && removed) {
        }
        
        return removed;
    }
    
    /**
     * Отписка от всех событий
     */
    offAll(event) {
        let removed = false;
        
        if (this.events[event]) {
            delete this.events[event];
            removed = true;
        }
        
        if (this.onceEvents[event]) {
            delete this.onceEvents[event];
            removed = true;
        }
        
        if (this.debug && removed) {
        }
        
        return removed;
    }
    
    /**
     * Испускание события
     */
    emit(event, data = null) {
        // Защита от undefined события
        if (!event || event === 'undefined') {
            console.error('EventBus: Попытка emit с undefined/null событием:', event);
            return;
        }
        
        const timestamp = Date.now();
        
        // Сохраняем в истории
        this.addToHistory(event, data, timestamp);
        
        if (this.debug) {
        }
        
        let listenersCount = 0;
        
        // Выполняем обычные слушатели
        if (this.events[event]) {
            this.events[event].forEach(listener => {
                try {
                    if (listener.context) {
                        listener.callback.call(listener.context, data, event);
                    } else {
                        listener.callback(data, event);
                    }
                    listenersCount++;
                } catch (error) {
                    console.error(`EventBus: Error in listener for "${event}":`, error);
                }
            });
        }
        
        // Выполняем одноразовые слушатели
        if (this.onceEvents[event]) {
            const onceListeners = [...this.onceEvents[event]];
            delete this.onceEvents[event];
            
            onceListeners.forEach(listener => {
                try {
                    if (listener.context) {
                        listener.callback.call(listener.context, data, event);
                    } else {
                        listener.callback(data, event);
                    }
                    listenersCount++;
                } catch (error) {
                    console.error(`EventBus: Error in once listener for "${event}":`, error);
                }
            });
        }
        
        if (this.debug) {
        }
        
        return listenersCount;
    }
    
    /**
     * Асинхронное испускание события
     */
    async emitAsync(event, data = null) {
        const timestamp = Date.now();
        
        // Сохраняем в истории
        this.addToHistory(event, data, timestamp);
        
        if (this.debug) {
        }
        
        const promises = [];
        
        // Выполняем обычные слушатели
        if (this.events[event]) {
            this.events[event].forEach(listener => {
                const promise = new Promise(async (resolve, reject) => {
                    try {
                        let result;
                        if (listener.context) {
                            result = await listener.callback.call(listener.context, data, event);
                        } else {
                            result = await listener.callback(data, event);
                        }
                        resolve(result);
                    } catch (error) {
                        console.error(`EventBus: Error in async listener for "${event}":`, error);
                        reject(error);
                    }
                });
                promises.push(promise);
            });
        }
        
        // Выполняем одноразовые слушатели
        if (this.onceEvents[event]) {
            const onceListeners = [...this.onceEvents[event]];
            delete this.onceEvents[event];
            
            onceListeners.forEach(listener => {
                const promise = new Promise(async (resolve, reject) => {
                    try {
                        let result;
                        if (listener.context) {
                            result = await listener.callback.call(listener.context, data, event);
                        } else {
                            result = await listener.callback(data, event);
                        }
                        resolve(result);
                    } catch (error) {
                        console.error(`EventBus: Error in async once listener for "${event}":`, error);
                        reject(error);
                    }
                });
                promises.push(promise);
            });
        }
        
        try {
            const results = await Promise.all(promises);
            
            if (this.debug) {
            }
            
            return results;
        } catch (error) {
            console.error(`EventBus: Error in async emit for "${event}":`, error);
            throw error;
        }
    }
    
    /**
     * Проверка наличия слушателей для события
     */
    hasListeners(event) {
        return (this.events[event] && this.events[event].length > 0) ||
               (this.onceEvents[event] && this.onceEvents[event].length > 0);
    }
    
    /**
     * Получение количества слушателей для события
     */
    getListenersCount(event) {
        const regularCount = this.events[event] ? this.events[event].length : 0;
        const onceCount = this.onceEvents[event] ? this.onceEvents[event].length : 0;
        return regularCount + onceCount;
    }
    
    /**
     * Получение списка всех событий
     */
    getEventNames() {
        const regularEvents = Object.keys(this.events);
        const onceEvents = Object.keys(this.onceEvents);
        return [...new Set([...regularEvents, ...onceEvents])];
    }
    
    /**
     * Добавление в историю событий
     */
    addToHistory(event, data, timestamp) {
        this.eventHistory.push({
            event,
            data,
            timestamp,
            date: new Date(timestamp).toISOString()
        });
        
        // Ограничиваем размер истории
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }
    
    /**
     * Получение истории событий
     */
    getHistory(limit = 100) {
        return this.eventHistory.slice(-limit);
    }
    
    /**
     * Очистка истории
     */
    clearHistory() {
        this.eventHistory = [];
    }
    
    /**
     * Генерация уникального ID
     */
    generateId() {
        return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Получение статистики
     */
    getStats() {
        return {
            events: Object.keys(this.events).length,
            onceEvents: Object.keys(this.onceEvents).length,
            totalListeners: Object.values(this.events).reduce((sum, listeners) => sum + listeners.length, 0) +
                           Object.values(this.onceEvents).reduce((sum, listeners) => sum + listeners.length, 0),
            historySize: this.eventHistory.length,
            maxHistorySize: this.maxHistorySize
        };
    }
    
    /**
     * Сброс всех событий
     */
    reset() {
        this.events = {};
        this.onceEvents = {};
        this.eventHistory = [];
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventBus;
} else {
    window.EventBus = EventBus;
}