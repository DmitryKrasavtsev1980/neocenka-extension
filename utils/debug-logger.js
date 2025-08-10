/**
 * Debug Logger - система управления отладочными сообщениями
 * Позволяет включать/выключать отладочные сообщения через настройки
 */

class DebugLogger {
    constructor() {
        this.isDebugEnabled = false;
        this.loadDebugSettings();
    }

    /**
     * Загружает настройки отладки из базы данных
     */
    async loadDebugSettings() {
        try {
            if (window.db) {
                await window.db.init();
                const debugMode = await window.db.getSetting('debug_mode');
                this.isDebugEnabled = debugMode === true || debugMode === 'true';
            }
        } catch (error) {
            // Если не удалось загрузить настройки, отладка по умолчанию выключена
            this.isDebugEnabled = false;
        }
    }

    /**
     * Устанавливает режим отладки
     * @param {boolean} enabled - включить/выключить отладку
     */
    setDebugMode(enabled) {
        this.isDebugEnabled = enabled;
    }

    /**
     * Проверяет, включена ли отладка
     * @returns {boolean}
     */
    isEnabled() {
        return this.isDebugEnabled;
    }

    /**
     * Выводит обычное сообщение в консоль (если отладка включена)
     */
    log(...args) {
        if (this.isDebugEnabled) {
        }
    }

    /**
     * Выводит информационное сообщение в консоль (если отладка включена)
     * @param {...any} args - аргументы для console.info
     */
    info(...args) {
        if (this.isDebugEnabled) {
            console.info('[DEBUG INFO]', ...args);
        }
    }

    /**
     * Выводит предупреждение в консоль (если отладка включена)
     * @param {...any} args - аргументы для console.warn
     */
    warn(...args) {
        if (this.isDebugEnabled) {
            console.warn('[DEBUG WARN]', ...args);
        }
    }

    /**
     * Выводит ошибку в консоль (всегда, независимо от настроек отладки)
     * @param {...any} args - аргументы для console.error
     */
    error(...args) {
        // Ошибки выводим всегда
        console.error('[ERROR]', ...args);
    }

    /**
     * Выводит группированные сообщения (если отладка включена)
     * @param {string} groupName - название группы
     * @param {Function} callback - функция, которая выполняется внутри группы
     */
    group(groupName, callback) {
        if (this.isDebugEnabled) {
            console.group(`[DEBUG] ${groupName}`);
            try {
                callback();
            } finally {
                console.groupEnd();
            }
        }
    }

    /**
     * Выводит таблицу данных (если отладка включена)
     * @param {any} data - данные для отображения в виде таблицы
     */
    table(data) {
        if (this.isDebugEnabled) {
            console.table(data);
        }
    }

    /**
     * Измеряет время выполнения операции (если отладка включена)
     * @param {string} label - метка для измерения
     */
    time(label) {
        if (this.isDebugEnabled) {
            console.time(`[DEBUG] ${label}`);
        }
    }

    /**
     * Завершает измерение времени (если отладка включена)
     * @param {string} label - метка для измерения
     */
    timeEnd(label) {
        if (this.isDebugEnabled) {
            console.timeEnd(`[DEBUG] ${label}`);
        }
    }
}

// Создаем глобальный экземпляр логгера
const debugLogger = new DebugLogger();

// Экспортируем для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = debugLogger;
}

// Делаем доступным в глобальной области
window.debugLogger = debugLogger;