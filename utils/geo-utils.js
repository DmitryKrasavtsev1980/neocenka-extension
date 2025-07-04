/**
 * Высокопроизводительный класс для работы с геоданными
 * Использует Turf.js для геопространственных операций и RBush для пространственного индексирования
 */

class GeoUtils {
    constructor() {
        this.spatialIndex = new RBush();
        this.indexedData = new Map(); // Хранилище данных по ID
        this.isIndexBuilt = false;
    }

    /**
     * Конвертация координат в GeoJSON Point
     * @param {number} lat - Широта
     * @param {number} lng - Долгота
     * @returns {Object} GeoJSON Point
     */
    createPoint(lat, lng) {
        if (typeof lat === 'object' && lat.lat && lat.lng) {
            return turf.point([parseFloat(lat.lng), parseFloat(lat.lat)]);
        }
        // GeoJSON формат: [lng, lat]
        return turf.point([parseFloat(lng), parseFloat(lat)]);
    }

    /**
     * Конвертация массива координат в GeoJSON Polygon
     * @param {Array} coordinates - Массив точек [{lat, lng}]
     * @returns {Object} GeoJSON Polygon
     */
    createPolygon(coordinates) {
        if (!Array.isArray(coordinates) || coordinates.length < 3) {
            throw new Error('Polygon must have at least 3 coordinates');
        }

        // Конвертируем в формат GeoJSON [lng, lat]  
        const coords = coordinates.map(coord => [
            parseFloat(coord.lng || coord.lon || coord.longitude),
            parseFloat(coord.lat || coord.latitude)
        ]);

        // Замыкаем полигон, если не замкнут
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            coords.push([first[0], first[1]]);
        }

        return turf.polygon([coords]);
    }

    /**
     * Проверка, находится ли точка внутри полигона (высокопроизводительная)
     * @param {Object|Array} point - Точка {lat, lng} или GeoJSON Point
     * @param {Object|Array} polygon - Полигон [{lat, lng}] или GeoJSON Polygon
     * @returns {boolean}
     */
    isPointInPolygon(point, polygon) {
        try {
            let geoPoint, geoPolygon;

            // Конвертируем точку
            if (Array.isArray(point) || (point.type && point.type === 'Point')) {
                geoPoint = point;
            } else {
                geoPoint = this.createPoint(point.lat, point.lng);
            }

            // Конвертируем полигон
            if (Array.isArray(polygon)) {
                geoPolygon = this.createPolygon(polygon);
            } else {
                geoPolygon = polygon;
            }

            return turf.booleanPointInPolygon(geoPoint, geoPolygon);
        } catch (error) {
            console.error('Error in isPointInPolygon:', error);
            return false;
        }
    }

    /**
     * Построение пространственного индекса для быстрого поиска
     * @param {Array} items - Массив объектов с координатами
     * @param {Function} getCoords - Функция извлечения координат из объекта
     */
    buildSpatialIndex(items, getCoords = (item) => item.coordinates) {
        this.spatialIndex.clear();
        this.indexedData.clear();

        const indexItems = [];

        items.forEach((item, index) => {
            const coords = getCoords(item);
            if (coords && coords.lat && (coords.lng || coords.lon)) {
                const lat = parseFloat(coords.lat);
                const lng = parseFloat(coords.lng || coords.lon);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    const bbox = {
                        minX: lng,
                        minY: lat,
                        maxX: lng,
                        maxY: lat,
                        id: item.id || index
                    };
                    
                    indexItems.push(bbox);
                    // Сохраняем объект с нормализованными координатами в формате {lat, lng}
                    const itemWithNormalizedCoords = {
                        ...item,
                        coordinates: {
                            lat: lat,
                            lng: lng
                        }
                    };
                    this.indexedData.set(bbox.id, itemWithNormalizedCoords);
                }
            }
        });

        this.spatialIndex.load(indexItems);
        this.isIndexBuilt = true;
    }

    /**
     * Быстрый поиск объектов в заданной области с использованием пространственного индекса
     * @param {Object|Array} polygon - Полигон области
     * @returns {Array} Найденные объекты
     */
    findItemsInPolygon(polygon) {
        if (!this.isIndexBuilt) {
            console.warn('Spatial index not built. Use buildSpatialIndex() first.');
            return [];
        }


        try {
            let geoPolygon;
            if (Array.isArray(polygon)) {
                geoPolygon = this.createPolygon(polygon);
            } else {
                geoPolygon = polygon;
            }

            // Получаем bounding box полигона для быстрого предварительного отбора
            const bbox = turf.bbox(geoPolygon);
            const searchArea = {
                minX: bbox[0],
                minY: bbox[1],
                maxX: bbox[2],
                maxY: bbox[3]
            };

            // Быстрый поиск кандидатов в индексе
            const candidates = this.spatialIndex.search(searchArea);

            // Точная проверка на пересечение с полигоном
            const results = [];
            candidates.forEach(candidate => {
                const item = this.indexedData.get(candidate.id);
                if (item) {
                    // Создаем точку вручную в GeoJSON формате
                    const point = {
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "Point",
                            coordinates: [
                                parseFloat(item.coordinates.lng),
                                parseFloat(item.coordinates.lat)
                            ]
                        }
                    };
                    
                    const isInPolygon = turf.booleanPointInPolygon(point, geoPolygon);
                    
                    if (isInPolygon) {
                        results.push(item);
                    }
                }
            });
            
            return results;

        } catch (error) {
            console.error('Error in findItemsInPolygon:', error);
            return [];
        }
    }

    /**
     * Получение центра полигона
     * @param {Object|Array} polygon - Полигон
     * @returns {Object} Центр {lat, lng}
     */
    getPolygonCenter(polygon) {
        try {
            let geoPolygon;
            if (Array.isArray(polygon)) {
                geoPolygon = this.createPolygon(polygon);
            } else {
                geoPolygon = polygon;
            }

            const center = turf.centroid(geoPolygon);
            return {
                lat: center.geometry.coordinates[1],
                lng: center.geometry.coordinates[0]
            };
        } catch (error) {
            console.error('Error getting polygon center:', error);
            return { lat: 0, lng: 0 };
        }
    }

    /**
     * Вычисление площади полигона в квадратных метрах
     * @param {Object|Array} polygon - Полигон
     * @returns {number} Площадь в м²
     */
    getPolygonArea(polygon) {
        try {
            let geoPolygon;
            if (Array.isArray(polygon)) {
                geoPolygon = this.createPolygon(polygon);
            } else {
                geoPolygon = polygon;
            }

            return turf.area(geoPolygon);
        } catch (error) {
            console.error('Error calculating polygon area:', error);
            return 0;
        }
    }

    /**
     * Вычисление bounding box полигона
     * @param {Object|Array} polygon - Полигон
     * @returns {Object} {minLat, minLng, maxLat, maxLng}
     */
    getPolygonBounds(polygon) {
        try {
            let geoPolygon;
            if (Array.isArray(polygon)) {
                geoPolygon = this.createPolygon(polygon);
            } else {
                geoPolygon = polygon;
            }

            const bbox = turf.bbox(geoPolygon);
            return {
                minLng: bbox[0],
                minLat: bbox[1],
                maxLng: bbox[2],
                maxLat: bbox[3]
            };
        } catch (error) {
            console.error('Error getting polygon bounds:', error);
            return { minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 };
        }
    }

    /**
     * Расчет расстояния между двумя точками в метрах
     * @param {Object} point1 - Первая точка {lat, lng}
     * @param {Object} point2 - Вторая точка {lat, lng}
     * @returns {number} Расстояние в метрах
     */
    calculateDistance(point1, point2) {
        try {
            const from = this.createPoint(point1.lat, point1.lng);
            const to = this.createPoint(point2.lat, point2.lng);
            return turf.distance(from, to, { units: 'meters' });
        } catch (error) {
            console.error('Error calculating distance:', error);
            return 0;
        }
    }

    /**
     * Создание буферной зоны вокруг точки
     * @param {Object} point - Точка {lat, lng}
     * @param {number} radius - Радиус в метрах
     * @returns {Object} GeoJSON Polygon буферной зоны
     */
    createBuffer(point, radius) {
        try {
            const geoPoint = this.createPoint(point.lat, point.lng);
            return turf.buffer(geoPoint, radius / 1000, { units: 'kilometers' });
        } catch (error) {
            console.error('Error creating buffer:', error);
            return null;
        }
    }

    /**
     * Проверка валидности полигона
     * @param {Array} coordinates - Массив координат
     * @returns {boolean}
     */
    isValidPolygon(coordinates) {
        if (!Array.isArray(coordinates) || coordinates.length < 3) {
            return false;
        }

        try {
            const polygon = this.createPolygon(coordinates);
            return polygon && polygon.type === 'Feature' && polygon.geometry.type === 'Polygon';
        } catch (error) {
            return false;
        }
    }

    /**
     * Конвертация Leaflet полигона в GeoJSON
     * @param {Object} leafletPolygon - Полигон Leaflet
     * @returns {Object} GeoJSON Polygon
     */
    leafletToGeoJSON(leafletPolygon) {
        try {
            const latLngs = leafletPolygon.getLatLngs()[0];
            const coordinates = latLngs.map(latlng => ({
                lat: latlng.lat,
                lng: latlng.lng
            }));
            return this.createPolygon(coordinates);
        } catch (error) {
            console.error('Error converting Leaflet to GeoJSON:', error);
            return null;
        }
    }

    /**
     * Получение статистики по пространственному индексу
     * @returns {Object} Статистика
     */
    getIndexStats() {
        return {
            isBuilt: this.isIndexBuilt,
            itemsCount: this.indexedData.size,
            indexSize: this.spatialIndex.data.children ? this.spatialIndex.data.children.length : 0
        };
    }

    /**
     * Очистка индекса
     */
    clearIndex() {
        this.spatialIndex.clear();
        this.indexedData.clear();
        this.isIndexBuilt = false;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeoUtils;
}