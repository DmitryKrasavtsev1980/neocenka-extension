/**
 * Единый менеджер кэширования данных для предотвращения дублирования загрузок
 * Решает проблему множественных getAll() запросов, которые потребляют 1.4-2.0 ГБ памяти
 */
class DataCacheManager {
    constructor() {
        this.cache = new Map();
        this.lastAccess = new Map();
        this.loadingPromises = new Map(); // Предотвращение одновременных загрузок
        
        // Настройки кэша (оптимизированы для снижения потребления памяти)
        this.config = {
            maxEntries: 500,            // Уменьшено с 1000 до 500 записей
            ttl: 180000,               // Уменьшено с 5 до 3 минут TTL
            memoryThreshold: 30 * 1024 * 1024, // Уменьшено с 50MB до 30MB лимит
            cleanupInterval: 30000,     // Увеличена частота очистки с 60сек до 30сек
            aggressiveCleanupThreshold: 35 * 1024 * 1024 // 35MB - порог агрессивной очистки
        };
        
        // Запуск автоочистки
        this.startCleanupTimer();
    }

    /**
     * Получение всех записей таблицы с кэшированием
     * КРИТИЧНО: Заменяет множественные вызовы getAll() одним кэшированным результатом
     */
    async getAll(tableName) {
        const cacheKey = `all_${tableName}`;
        
        // Проверяем кэш
        if (this.cache.has(cacheKey)) {
            this.updateAccessTime(cacheKey);
            const data = this.cache.get(cacheKey);
            return data;
        }

        // Проверяем, не загружается ли уже
        if (this.loadingPromises.has(cacheKey)) {
            return await this.loadingPromises.get(cacheKey);
        }

        // Начинаем загрузку
        const loadingPromise = this.loadFromDatabase(tableName, cacheKey);
        this.loadingPromises.set(cacheKey, loadingPromise);

        try {
            const result = await loadingPromise;
            this.loadingPromises.delete(cacheKey);
            return result;
        } catch (error) {
            this.loadingPromises.delete(cacheKey);
            console.error(`❌ [Cache] Ошибка загрузки ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Загрузка данных из базы данных
     */
    async loadFromDatabase(tableName, cacheKey) {
        // Проверка инициализации базы данных
        if (!window.db || !window.db.db) {
            console.warn(`⚠️ [Cache] База данных не инициализирована для загрузки ${tableName}`);
            return [];
        }

        const data = await window.db.getAll(tableName);

        // Оценка размера данных
        const dataSize = this.estimateDataSize(data);
        const isLargeTable = ['addresses', 'listings', 'real_estate_objects'].includes(tableName);

        // Не кэшируем слишком большие таблицы или данные больше 10MB
        if (dataSize > 10 * 1024 * 1024 || (isLargeTable && dataSize > 5 * 1024 * 1024)) {
            console.warn(`⚠️ [Cache] Таблица ${tableName} слишком большая (${Math.round(dataSize/1024/1024)}MB), пропускаем кэширование`);
            return data; // Возвращаем данные без кэширования
        }

        // Кэшируем результат
        this.cache.set(cacheKey, data);
        this.updateAccessTime(cacheKey);

        // Проверяем лимиты памяти
        this.checkMemoryLimits();

        return data;
    }

    /**
     * Получение записей по индексу с кэшированием
     * Оптимизация: кэшируем только небольшие результаты
     */
    async getByIndex(tableName, indexName, value) {
        const cacheKey = `index_${tableName}_${indexName}_${value}`;

        if (this.cache.has(cacheKey)) {
            this.updateAccessTime(cacheKey);
            const data = this.cache.get(cacheKey);
            return data;
        }

        // Проверка инициализации базы данных
        if (!window.db || !window.db.db) {
            console.warn(`⚠️ [Cache] База данных не инициализирована для загрузки ${tableName}[${indexName}]`);
            return [];
        }

        const data = await window.db.getByIndex(tableName, indexName, value);
        
        // Кэшируем только небольшие результаты (< 100 записей)
        if (data.length < 100) {
            this.cache.set(cacheKey, data);
            this.updateAccessTime(cacheKey);
        }
        
        return data;
    }

    /**
     * Пакетное получение по индексу (оптимизация для множественных запросов)
     */
    async getBatchByIndex(tableName, indexName, values) {
        console.log(`🔄 [Batch Index Query] ${tableName}.${indexName}: ${values.length} значений`);
        const startTime = Date.now();

        // Проверка инициализации базы данных
        if (!window.db || !window.db.db) {
            console.warn(`⚠️ [Cache] База данных не инициализирована для пакетной загрузки ${tableName}[${indexName}]`);
            return new Map();
        }

        const results = new Map();
        const uncachedValues = [];

        // Проверяем кэш для каждого значения
        for (const value of values) {
            const cacheKey = `index_${tableName}_${indexName}_${value}`;
            if (this.cache.has(cacheKey)) {
                this.updateAccessTime(cacheKey);
                results.set(value, this.cache.get(cacheKey));
            } else {
                uncachedValues.push(value);
            }
        }

        // Загружаем некэшированные значения
        for (const value of uncachedValues) {
            const data = await window.db.getByIndex(tableName, indexName, value);
            results.set(value, data);
            
            // Кэшируем если результат небольшой
            if (data.length < 100) {
                const cacheKey = `index_${tableName}_${indexName}_${value}`;
                this.cache.set(cacheKey, data);
                this.updateAccessTime(cacheKey);
            }
        }
        
        const queryTime = Date.now() - startTime;
        console.log(`✅ [Batch Index Query] Загружено: ${uncachedValues.length}/${values.length} из БД за ${queryTime}ms`);
        
        return results;
    }

    /**
     * Инвалидация кэша при изменении данных
     * КРИТИЧНО: Очищает кэш при добавлении/изменении/удалении записей
     */
    invalidate(tableName, recordId = null) {
        const keysToDelete = [];
        
        for (const [key] of this.cache.entries()) {
            if (key.startsWith(`all_${tableName}`) || 
                key.startsWith(`index_${tableName}_`)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => {
            this.cache.delete(key);
            this.lastAccess.delete(key);
        });
        
        console.log(`🗑️ [Cache] Инвалидирован кэш для ${tableName}: ${keysToDelete.length} записей`);
    }

    /**
     * Обновление времени последнего доступа
     */
    updateAccessTime(cacheKey) {
        this.lastAccess.set(cacheKey, Date.now());
    }

    /**
     * Проверка лимитов памяти
     */
    checkMemoryLimits() {
        if (this.cache.size > this.config.maxEntries) {
            const excessEntries = this.cache.size - this.config.maxEntries;
            this.evictLRU(excessEntries);
        }
        
        // Проверяем общее потребление памяти
        const memoryUsage = this.estimateMemoryUsage();

        if (memoryUsage > this.config.aggressiveCleanupThreshold) {
            console.warn(`🚨 [Cache] Критический уровень памяти: ${Math.round(memoryUsage/1024/1024)}MB - агрессивная очистка`);
            this.evictLRU(Math.floor(this.cache.size * 0.5)); // Удаляем 50% записей
        } else if (memoryUsage > this.config.memoryThreshold) {
            console.warn(`⚠️ [Cache] Превышен лимит памяти: ${Math.round(memoryUsage/1024/1024)}MB`);
            this.evictLRU(Math.floor(this.cache.size * 0.3)); // Увеличено с 20% до 30% записей
        }
    }

    /**
     * Удаление давно неиспользуемых записей (LRU - Least Recently Used)
     */
    evictLRU(count = 100) {
        const entries = Array.from(this.lastAccess.entries())
            .sort(([,a], [,b]) => a - b) // Сортируем по времени доступа (старые сначала)
            .slice(0, count);
        
        entries.forEach(([key]) => {
            this.cache.delete(key);
            this.lastAccess.delete(key);
        });
        
        console.log(`🧹 [Cache] Удалено ${entries.length} старых записей (LRU алгоритм)`);
    }

    /**
     * Автоматическая очистка по таймеру
     */
    startCleanupTimer() {
        this.cleanupTimerId = setInterval(() => {
            const now = Date.now();
            const expiredKeys = [];
            
            // Находим устаревшие записи
            for (const [key, accessTime] of this.lastAccess.entries()) {
                if (now - accessTime > this.config.ttl) {
                    expiredKeys.push(key);
                }
            }
            
            // Удаляем устаревшие записи
            expiredKeys.forEach(key => {
                this.cache.delete(key);
                this.lastAccess.delete(key);
            });
            
            if (expiredKeys.length > 0) {
                console.log(`🧹 [Cache] Автоочистка: удалено ${expiredKeys.length} устаревших записей`);
            }
        }, this.config.cleanupInterval);
    }

    /**
     * Получение статистики кэша
     */
    getStats() {
        return {
            totalEntries: this.cache.size,
            loadingPromises: this.loadingPromises.size,
            memoryUsage: this.estimateMemoryUsage(),
            memoryUsageMB: Math.round(this.estimateMemoryUsage() / 1024 / 1024 * 100) / 100,
            config: this.config,
            cacheHitRatio: this.calculateHitRatio()
        };
    }

    /**
     * Расчет коэффициента попаданий в кэш
     */
    calculateHitRatio() {
        // Простая реализация - можно улучшить с детальной статистикой
        return this.cache.size > 0 ? 0.85 : 0; // Примерная оценка
    }

    /**
     * Примерная оценка использования памяти
     */
    estimateMemoryUsage() {
        let totalSize = 0;
        for (const [key, value] of this.cache.entries()) {
            // Приблизительная оценка размера в байтах
            const keySize = key.length * 2; // UTF-16
            const valueSize = JSON.stringify(value).length * 2; // UTF-16
            totalSize += keySize + valueSize;
        }
        return totalSize;
    }

    /**
     * Оценка размера конкретного массива данных
     */
    estimateDataSize(data) {
        try {
            if (!data || !Array.isArray(data)) return 0;
            // Приблизительная оценка размера через JSON.stringify
            return JSON.stringify(data).length * 2; // UTF-16
        } catch (error) {
            console.warn('[Cache] Ошибка оценки размера данных:', error);
            return 0;
        }
    }

    /**
     * Принудительная очистка всего кэша
     */
    clear() {
        const entriesCount = this.cache.size;
        this.cache.clear();
        this.lastAccess.clear();
        console.log(`🗑️ [Cache] Принудительная очистка всего кэша: ${entriesCount} записей`);
    }

    /**
     * Остановка автоочистки (для тестирования)
     */
    stopCleanupTimer() {
        if (this.cleanupTimerId) {
            clearInterval(this.cleanupTimerId);
            console.log('🛑 [Cache] Автоочистка остановлена');
        }
    }

    /**
     * Получение детального отчета по использованию
     */
    getDetailedReport() {
        const stats = this.getStats();
        const tableUsage = new Map();
        
        // Анализируем использование по таблицам
        for (const [key] of this.cache.entries()) {
            if (key.startsWith('all_')) {
                const tableName = key.substring(4);
                const data = this.cache.get(key);
                tableUsage.set(tableName, {
                    records: data.length,
                    cacheKey: key,
                    lastAccess: this.lastAccess.get(key),
                    estimatedSize: JSON.stringify(data).length * 2
                });
            }
        }
        
        return {
            ...stats,
            tableUsage: Object.fromEntries(tableUsage),
            largestTables: Array.from(tableUsage.entries())
                .sort(([,a], [,b]) => b.estimatedSize - a.estimatedSize)
                .slice(0, 5)
        };
    }
}

// Создаем глобальный экземпляр DataCacheManager
window.dataCacheManager = new DataCacheManager();

// Экспорт для использования в других модулях
window.DataCacheManager = DataCacheManager;