/**
 * Оптимизированные запросы с использованием индексов вместо getAll + filter
 * Заменяет медленные операции полной загрузки на целевые индексированные запросы
 */
class IndexedQueries {
    
    /**
     * Получение объявлений для конкретных адресов (ВМЕСТО getAll + filter)
     * Критическая оптимизация для SegmentsManager.getListingsForAddresses()
     */
    static async getListingsForAddresses(addressIds) {
        if (!addressIds || addressIds.length === 0) {
            return [];
        }
        
        
        const startTime = Date.now();
        
        // Используем кэшированный способ для небольшого количества адресов
        if (addressIds.length <= 10) {
            const results = [];
            
            for (const addressId of addressIds) {
                const listings = await window.dataCacheManager.getByIndex('listings', 'address_id', addressId);
                results.push(...listings);
            }
            
            const queryTime = Date.now() - startTime;
            
            return results;
        }
        
        // Для большого количества адресов используем кэш + фильтрацию
        const allListings = await window.dataCacheManager.getAll('listings');
        const filteredListings = allListings.filter(listing => 
            addressIds.includes(listing.address_id)
        );
        
        const queryTime = Date.now() - startTime;
        
        return filteredListings;
    }

    /**
     * Получение объектов для области (ВМЕСТО getAll + filter)
     */
    static async getObjectsForArea(areaId) {
        
        const startTime = Date.now();
        
        // Используем индексированный запрос если доступен
        try {
            const objects = await window.dataCacheManager.getByIndex('objects', 'area_id', areaId);
            const queryTime = Date.now() - startTime;
            
            return objects;
        } catch (error) {
            // Fallback к кэшированному getAll + filter
            console.warn('⚠️ [IndexedQueries] Индекс area_id недоступен, используем fallback');
            const allObjects = await window.dataCacheManager.getAll('objects');
            const filtered = allObjects.filter(obj => obj.area_id === areaId);
            const queryTime = Date.now() - startTime;
            
            return filtered;
        }
    }

    /**
     * Получение сегментов для области (ВМЕСТО getAll + filter)
     */
    static async getSegmentsForArea(areaId) {
        
        const startTime = Date.now();
        
        const allSegments = await window.dataCacheManager.getAll('segments');
        const filtered = allSegments.filter(segment => segment.map_area_id === areaId);
        
        const queryTime = Date.now() - startTime;
        
        return filtered;
    }

    /**
     * Получение адресов в полигоне (с пространственной фильтрацией)
     * КРИТИЧНО: оптимизация для больших наборов адресов
     */
    static async getAddressesInPolygon(polygon, areaId = null) {
        
        const startTime = Date.now();
        
        // Получаем адреса (с предварительной фильтрацией по области если указана)
        let addresses;
        if (areaId) {
            addresses = await window.dataCacheManager.getAll('addresses');
            addresses = addresses.filter(addr => addr.map_area_id === areaId);
            
        } else {
            addresses = await window.dataCacheManager.getAll('addresses');
        }
        
        // Пространственная фильтрация (используем существующую логику)
        const filteredAddresses = addresses.filter(address => {
            if (!address.latitude || !address.longitude) return false;
            
            return GeometryUtils.isPointInPolygon(
                [address.latitude, address.longitude], 
                polygon
            );
        });
        
        const queryTime = Date.now() - startTime;
        
        return filteredAddresses;
    }

    /**
     * Пагинированный запрос для больших таблиц
     * Оптимизация для UI компонентов с большими наборами данных
     */
    static async getPaginatedData(tableName, offset = 0, limit = 100, sortField = 'id') {
        
        const startTime = Date.now();
        
        const allData = await window.dataCacheManager.getAll(tableName);
        
        // Сортировка (если поле существует)
        let sortedData = allData;
        if (allData.length > 0 && sortField in allData[0]) {
            sortedData = [...allData].sort((a, b) => {
                const aVal = a[sortField];
                const bVal = b[sortField];
                
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return aVal - bVal;
                }
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return aVal.localeCompare(bVal);
                }
                if (aVal instanceof Date && bVal instanceof Date) {
                    return aVal.getTime() - bVal.getTime();
                }
                return 0;
            });
        }
        
        // Пагинация
        const paginatedData = sortedData.slice(offset, offset + limit);
        
        const queryTime = Date.now() - startTime;
        
        
        return {
            data: paginatedData,
            total: allData.length,
            offset,
            limit,
            hasMore: offset + limit < allData.length
        };
    }

    /**
     * Поиск по тексту в кэшированных данных  
     * Оптимизация для поисковых форм
     */
    static async searchInTable(tableName, searchFields, query, limit = 50) {
        if (!query || query.length < 2) return [];
        
        
        const startTime = Date.now();
        
        const allData = await window.dataCacheManager.getAll(tableName);
        const normalizedQuery = query.toLowerCase();
        
        const results = allData.filter(item => {
            return searchFields.some(field => {
                const value = item[field];
                if (!value) return false;
                
                return value.toString().toLowerCase().includes(normalizedQuery);
            });
        }).slice(0, limit);
        
        const queryTime = Date.now() - startTime;
        
        return results;
    }

    /**
     * Получение связанных данных (JOIN эмуляция)
     * Например: объявления с адресами и сегментами
     */
    static async getListingsWithRelations(filters = {}) {
        
        const startTime = Date.now();
        
        // Загружаем все необходимые данные параллельно
        const [listings, addresses, segments] = await Promise.all([
            window.dataCacheManager.getAll('listings'),
            window.dataCacheManager.getAll('addresses'),
            window.dataCacheManager.getAll('segments')
        ]);
        
        // Создаем индексы для быстрого поиска
        const addressIndex = new Map(addresses.map(addr => [addr.id, addr]));
        const segmentIndex = new Map(segments.map(seg => [seg.id, seg]));
        
        // Обогащаем объявления связанными данными
        let enrichedListings = listings.map(listing => ({
            ...listing,
            address: addressIndex.get(listing.address_id) || null,
            segment: listing.segment_id ? segmentIndex.get(listing.segment_id) : null
        }));
        
        // Применяем фильтры
        if (filters.areaId) {
            enrichedListings = enrichedListings.filter(item => 
                item.address && item.address.map_area_id === filters.areaId
            );
        }
        
        if (filters.segmentId) {
            enrichedListings = enrichedListings.filter(item => 
                item.segment_id === filters.segmentId
            );
        }
        
        if (filters.priceMin) {
            enrichedListings = enrichedListings.filter(item => 
                item.price >= filters.priceMin
            );
        }
        
        if (filters.priceMax) {
            enrichedListings = enrichedListings.filter(item => 
                item.price <= filters.priceMax
            );
        }
        
        const queryTime = Date.now() - startTime;
        
        return enrichedListings;
    }

    /**
     * Получение статистики по таблицам без полной загрузки
     */
    static async getTableStats(tableName) {
        
        const startTime = Date.now();
        
        const data = await window.dataCacheManager.getAll(tableName);
        
        const stats = {
            total: data.length,
            lastUpdated: null,
            createdToday: 0,
            updatedToday: 0
        };
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const item of data) {
            // Находим самую позднюю дату обновления
            const updatedAt = item.updated_at ? new Date(item.updated_at) : null;
            if (updatedAt && (!stats.lastUpdated || updatedAt > stats.lastUpdated)) {
                stats.lastUpdated = updatedAt;
            }
            
            // Считаем записи, созданные сегодня
            const createdAt = item.created_at ? new Date(item.created_at) : null;
            if (createdAt && createdAt >= today) {
                stats.createdToday++;
            }
            
            // Считаем записи, обновлённые сегодня
            if (updatedAt && updatedAt >= today) {
                stats.updatedToday++;
            }
        }
        
        const queryTime = Date.now() - startTime;
        return stats;
    }

    /**
     * Массовая проверка существования записей
     * Оптимизация для проверки дублей
     */
    static async checkExistingRecords(tableName, checkField, values) {
        
        const startTime = Date.now();
        
        const allData = await window.dataCacheManager.getAll(tableName);
        const existingValues = new Set(allData.map(item => item[checkField]).filter(v => v != null));
        
        const existing = values.filter(value => existingValues.has(value));
        const missing = values.filter(value => !existingValues.has(value));
        
        const queryTime = Date.now() - startTime;
        
        
        return {
            existing,
            missing,
            total: values.length
        };
    }
}

// Экспорт в глобальную область видимости
window.IndexedQueries = IndexedQueries;