/**
 * RealEstateObjectService - сервис для работы с объектами недвижимости
 * Следует архитектуре v0.1 с использованием DI и обработкой ошибок
 */
class RealEstateObjectService {
    constructor(database, validationService, errorHandlingService, configService) {
        this.database = database;
        this.validationService = validationService;
        this.errorHandlingService = errorHandlingService;
        this.configService = configService;
        
        // Кэш для оптимизации
        this.objectsCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 минут
        
        this.debugEnabled = false;
        this.loadDebugSettings();
    }

    /**
     * Загрузка настроек отладки
     */
    async loadDebugSettings() {
        try {
            const debugConfig = await this.configService.get('debug.enabled');
            this.debugEnabled = debugConfig === true;
        } catch (error) {
            this.debugEnabled = false;
        }
    }

    /**
     * Получение объектов недвижимости по сегменту
     */
    async getObjectsBySegment(segmentId, options = {}) {

        // Проверяем кэш
        const cacheKey = `segment_${segmentId}`;
        const cached = this.objectsCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.data;
        }

        if (!window.db) {
            console.error('RealEstateObjectService: window.db недоступен');
            return [];
        }

        try {
            // Используем тот же метод что и таблица дублей - window.db.getObjectsBySegment()
            const objects = await window.db.getObjectsBySegment(segmentId);
            
            
            if (!objects || !Array.isArray(objects)) {
                return [];
            }

            // Если нужны адреса - загружаем их для каждого объекта
            if (options.includeAddress && objects.length > 0) {
                for (const obj of objects) {
                    if (obj.address_id) {
                        obj.address = await window.db.getAddress(obj.address_id);
                    }
                }
            }

            // Кэшируем результат
            this.objectsCache.set(cacheKey, {
                data: objects,
                timestamp: Date.now()
            });
            
            return objects;
            
        } catch (error) {
            console.error('RealEstateObjectService: Ошибка при загрузке объектов:', error);
            return [];
        }
    }

    /**
     * Фильтрация объектов по параметрам
     */
    filterObjects(objects, filters) {
        if (!objects || objects.length === 0) return [];

        const filtered = objects.filter(obj => {
            // Фильтр по количеству комнат
            if (filters.rooms && filters.rooms.length > 0) {
                const objRooms = obj.rooms ? obj.rooms.toString() : 'studio';
                const roomsMatch = filters.rooms.some(room => {
                    if (room === 'studio') return objRooms === 'studio' || objRooms === '0';
                    if (room === '4+') return parseInt(objRooms) >= 4;
                    return objRooms === room;
                });
                if (!roomsMatch) return false;
            }

            // Фильтр по цене
            if (obj.price) {
                if (filters.priceFrom && obj.price < filters.priceFrom) return false;
                if (filters.priceTo && obj.price > filters.priceTo) return false;
            }

            // Дополнительные фильтры можно добавить здесь

            return true;
        });


        return filtered;
    }

    /**
     * Расчёт доходности для объекта (заглушка)
     */
    calculateProfitability(object, parameters) {
        // TODO: Реализовать расчёт доходности по модели флиппинг
        
        // Временная заглушка - случайная доходность от -5% до 35%
        const mockProfitability = Math.random() * 40 - 5;
        
        return {
            annualReturn: mockProfitability,
            totalProfit: object.price ? object.price * (mockProfitability / 100) : 0,
            renovationCosts: parameters.renovationType === 'manual' ? 
                (parameters.workCost + parameters.materialsCost) : 
                Math.floor(object.price * 0.15), // 15% от стоимости
            holdingPeriod: parameters.renovationSpeed * 12, // в месяцах
            taxAmount: 0 // будет рассчитано позже
        };
    }

    /**
     * Получение статистики по объектам
     */
    getObjectsStatistics(objects) {
        if (!objects || objects.length === 0) {
            return {
                total: 0,
                averagePrice: 0,
                priceRange: { min: 0, max: 0 },
                roomDistribution: {}
            };
        }

        const prices = objects.map(obj => obj.price || 0).filter(price => price > 0);
        const roomCounts = {};
        
        objects.forEach(obj => {
            const rooms = obj.rooms || 'studio';
            roomCounts[rooms] = (roomCounts[rooms] || 0) + 1;
        });

        return {
            total: objects.length,
            averagePrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
            priceRange: {
                min: prices.length > 0 ? Math.min(...prices) : 0,
                max: prices.length > 0 ? Math.max(...prices) : 0
            },
            roomDistribution: roomCounts
        };
    }

    /**
     * Очистка кэша
     */
    clearCache() {
        this.objectsCache.clear();
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealEstateObjectService;
}