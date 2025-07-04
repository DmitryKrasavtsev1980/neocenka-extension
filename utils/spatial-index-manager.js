/**
 * Менеджер пространственных индексов для оптимизации геопространственных запросов
 */

class SpatialIndexManager {
    constructor() {
        this.indexes = new Map();
        this.geoUtils = new GeoUtils();
    }

    /**
     * Создание или обновление индекса для определенного типа данных
     * @param {string} indexName - Имя индекса (например, 'listings', 'addresses')
     * @param {Array} data - Данные для индексирования
     * @param {Function} getCoordsFunction - Функция извлечения координат
     */
    async createIndex(indexName, data, getCoordsFunction) {

        const geoUtils = new GeoUtils();
        geoUtils.buildSpatialIndex(data, getCoordsFunction);

        this.indexes.set(indexName, {
            geoUtils: geoUtils,
            dataCount: data.length,
            lastUpdated: new Date(),
            getCoordsFunction: getCoordsFunction
        });

    }

    /**
     * Получение объектов в области с использованием индекса
     * @param {string} indexName - Имя индекса
     * @param {Array|Object} polygon - Полигон области
     * @returns {Array} Найденные объекты
     */
    findInArea(indexName, polygon) {
        const index = this.indexes.get(indexName);
        if (!index) {
            console.warn(`Index ${indexName} not found`);
            return [];
        }

        return index.geoUtils.findItemsInPolygon(polygon);
    }

    /**
     * Проверка актуальности индекса
     * @param {string} indexName - Имя индекса
     * @param {number} maxAgeMinutes - Максимальный возраст индекса в минутах
     * @returns {boolean}
     */
    isIndexFresh(indexName, maxAgeMinutes = 30) {
        const index = this.indexes.get(indexName);
        if (!index) return false;

        const ageMinutes = (new Date() - index.lastUpdated) / (1000 * 60);
        return ageMinutes < maxAgeMinutes;
    }

    /**
     * Обновление индекса если он устарел
     * @param {string} indexName - Имя индекса
     * @param {Function} dataProvider - Функция для получения свежих данных
     * @param {number} maxAgeMinutes - Максимальный возраст индекса
     */
    async refreshIndexIfNeeded(indexName, dataProvider, maxAgeMinutes = 30) {
        if (!this.isIndexFresh(indexName, maxAgeMinutes)) {
            const freshData = await dataProvider();
            const existingIndex = this.indexes.get(indexName);
            const getCoordsFunction = existingIndex ? existingIndex.getCoordsFunction : (item) => item.coordinates;
            
            await this.createIndex(indexName, freshData, getCoordsFunction);
        }
    }

    /**
     * Получение статистики по всем индексам
     * @returns {Object} Статистика
     */
    getIndexesStats() {
        const stats = {};
        this.indexes.forEach((index, name) => {
            stats[name] = {
                dataCount: index.dataCount,
                lastUpdated: index.lastUpdated,
                isBuilt: index.geoUtils.isIndexBuilt,
                ...index.geoUtils.getIndexStats()
            };
        });
        return stats;
    }

    /**
     * Удаление индекса
     * @param {string} indexName - Имя индекса
     */
    removeIndex(indexName) {
        const index = this.indexes.get(indexName);
        if (index) {
            index.geoUtils.clearIndex();
            this.indexes.delete(indexName);
        }
    }

    /**
     * Очистка всех индексов
     */
    clearAllIndexes() {
        this.indexes.forEach((index, name) => {
            index.geoUtils.clearIndex();
        });
        this.indexes.clear();
    }

    /**
     * Проверка наличия индекса
     * @param {string} indexName - Имя индекса
     * @returns {boolean}
     */
    hasIndex(indexName) {
        return this.indexes.has(indexName);
    }

    /**
     * Оценка производительности - сравнение индексированного и обычного поиска
     * @param {string} indexName - Имя индекса
     * @param {Array} data - Данные для сравнения
     * @param {Array} polygon - Полигон для тестирования
     * @returns {Object} Результаты сравнения
     */
    async benchmarkSearch(indexName, data, polygon) {
        const index = this.indexes.get(indexName);
        if (!index) {
            throw new Error(`Index ${indexName} not found`);
        }

        // Тест индексированного поиска
        console.time('Indexed search');
        const indexedResults = this.findInArea(indexName, polygon);
        console.timeEnd('Indexed search');

        // Тест обычного поиска
        console.time('Linear search');
        const geoUtils = new GeoUtils();
        const linearResults = data.filter(item => {
            if (!item.coordinates || !item.coordinates.lat || !item.coordinates.lng) {
                return false;
            }
            return geoUtils.isPointInPolygon(item.coordinates, polygon);
        });
        console.timeEnd('Linear search');

        return {
            indexedCount: indexedResults.length,
            linearCount: linearResults.length,
            resultsMatch: indexedResults.length === linearResults.length,
            dataSize: data.length,
            indexName: indexName
        };
    }
}

// Глобальный экземпляр менеджера индексов
const spatialIndexManager = new SpatialIndexManager();

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SpatialIndexManager, spatialIndexManager };
}