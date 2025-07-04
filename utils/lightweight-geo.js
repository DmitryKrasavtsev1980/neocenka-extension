/**
 * Легкая геопространственная библиотека для Chrome Extensions
 * Замена Turf.js без использования eval() для соответствия CSP
 */

class LightweightGeo {
    /**
     * Создание точки в формате GeoJSON
     * @param {number} lng - Долгота
     * @param {number} lat - Широта
     * @returns {Object} GeoJSON Point
     */
    static point(lng, lat) {
        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lng, lat]
            },
            properties: {}
        };
    }

    /**
     * Создание полигона в формате GeoJSON
     * @param {Array} coordinates - Массив координат
     * @returns {Object} GeoJSON Polygon
     */
    static polygon(coordinates) {
        return {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: coordinates
            },
            properties: {}
        };
    }

    /**
     * Проверка, находится ли точка внутри полигона
     * Использует алгоритм ray casting
     * @param {Object} point - GeoJSON Point или {lat, lng}
     * @param {Object} polygon - GeoJSON Polygon или массив координат
     * @returns {boolean}
     */
    static booleanPointInPolygon(point, polygon) {
        let coords;
        let pointCoords;

        // Нормализуем входные данные
        if (point.type === 'Feature' && point.geometry.type === 'Point') {
            pointCoords = point.geometry.coordinates;
        } else if (point.lat !== undefined && point.lng !== undefined) {
            pointCoords = [point.lng, point.lat];
        } else if (Array.isArray(point)) {
            pointCoords = point;
        } else {
            return false;
        }

        if (polygon.type === 'Feature' && polygon.geometry.type === 'Polygon') {
            coords = polygon.geometry.coordinates[0];
        } else if (Array.isArray(polygon)) {
            if (polygon[0] && polygon[0].lat !== undefined) {
                // Конвертируем из {lat, lng} в [lng, lat]
                coords = polygon.map(p => [p.lng, p.lat]);
            } else {
                coords = polygon;
            }
        } else {
            return false;
        }

        return this.pointInPolygon(pointCoords, coords);
    }

    /**
     * Алгоритм ray casting для определения точки в полигоне
     * @param {Array} point - [lng, lat]
     * @param {Array} polygon - [[lng, lat], ...]
     * @returns {boolean}
     */
    static pointInPolygon(point, polygon) {
        const [x, y] = point;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Вычисление центроида полигона
     * @param {Object} polygon - GeoJSON Polygon или массив координат
     * @returns {Object} GeoJSON Point
     */
    static centroid(polygon) {
        let coords;

        if (polygon.type === 'Feature' && polygon.geometry.type === 'Polygon') {
            coords = polygon.geometry.coordinates[0];
        } else if (Array.isArray(polygon)) {
            if (polygon[0] && polygon[0].lat !== undefined) {
                coords = polygon.map(p => [p.lng, p.lat]);
            } else {
                coords = polygon;
            }
        } else {
            return this.point(0, 0);
        }

        let totalX = 0;
        let totalY = 0;
        const len = coords.length;

        for (let i = 0; i < len; i++) {
            totalX += coords[i][0];
            totalY += coords[i][1];
        }

        return this.point(totalX / len, totalY / len);
    }

    /**
     * Вычисление bounding box
     * @param {Object} feature - GeoJSON Feature
     * @returns {Array} [minLng, minLat, maxLng, maxLat]
     */
    static bbox(feature) {
        let coords;

        if (feature.type === 'Feature') {
            if (feature.geometry.type === 'Polygon') {
                coords = feature.geometry.coordinates[0];
            } else if (feature.geometry.type === 'Point') {
                const [lng, lat] = feature.geometry.coordinates;
                return [lng, lat, lng, lat];
            }
        } else if (Array.isArray(feature)) {
            coords = feature;
        }

        if (!coords || coords.length === 0) {
            return [0, 0, 0, 0];
        }

        let minLng = coords[0][0];
        let minLat = coords[0][1];
        let maxLng = coords[0][0];
        let maxLat = coords[0][1];

        for (let i = 1; i < coords.length; i++) {
            const [lng, lat] = coords[i];
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
        }

        return [minLng, minLat, maxLng, maxLat];
    }

    /**
     * Вычисление площади полигона (приблизительно)
     * @param {Object} polygon - GeoJSON Polygon
     * @returns {number} Площадь в квадратных метрах
     */
    static area(polygon) {
        let coords;

        if (polygon.type === 'Feature' && polygon.geometry.type === 'Polygon') {
            coords = polygon.geometry.coordinates[0];
        } else if (Array.isArray(polygon)) {
            if (polygon[0] && polygon[0].lat !== undefined) {
                coords = polygon.map(p => [p.lng, p.lat]);
            } else {
                coords = polygon;
            }
        } else {
            return 0;
        }

        if (coords.length < 3) return 0;

        // Используем формулу Shoelace (простая версия)
        let area = 0;
        const len = coords.length;

        for (let i = 0; i < len; i++) {
            const j = (i + 1) % len;
            area += coords[i][0] * coords[j][1];
            area -= coords[j][0] * coords[i][1];
        }

        area = Math.abs(area) / 2;

        // Конвертируем из градусов в метры (приблизительно)
        // Используем среднюю широту для более точного расчета
        const avgLat = coords.reduce((sum, coord) => sum + coord[1], 0) / len;
        const latFactor = 111000; // метров на градус широты
        const lngFactor = 111000 * Math.cos(avgLat * Math.PI / 180); // метров на градус долготы

        return area * latFactor * lngFactor;
    }

    /**
     * Расчет расстояния между двумя точками (формула Haversine)
     * @param {Object} from - GeoJSON Point или {lat, lng}
     * @param {Object} to - GeoJSON Point или {lat, lng}
     * @param {Object} options - Опции (units: 'meters', 'kilometers')
     * @returns {number} Расстояние
     */
    static distance(from, to, options = { units: 'meters' }) {
        let fromCoords, toCoords;

        // Нормализуем координаты
        if (from.type === 'Feature') {
            fromCoords = from.geometry.coordinates;
        } else if (from.lat !== undefined) {
            fromCoords = [from.lng, from.lat];
        } else {
            fromCoords = from;
        }

        if (to.type === 'Feature') {
            toCoords = to.geometry.coordinates;
        } else if (to.lat !== undefined) {
            toCoords = [to.lng, to.lat];
        } else {
            toCoords = to;
        }

        const [lng1, lat1] = fromCoords;
        const [lng2, lat2] = toCoords;

        const R = 6371000; // Радиус Земли в метрах
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return options.units === 'kilometers' ? distance / 1000 : distance;
    }

    /**
     * Создание буферной зоны вокруг точки (упрощенная версия)
     * @param {Object} point - GeoJSON Point
     * @param {number} radius - Радиус в километрах
     * @param {Object} options - Опции
     * @returns {Object} GeoJSON Polygon
     */
    static buffer(point, radius, options = {}) {
        let coords;

        if (point.type === 'Feature') {
            coords = point.geometry.coordinates;
        } else if (point.lat !== undefined) {
            coords = [point.lng, point.lat];
        } else {
            coords = point;
        }

        const [lng, lat] = coords;
        const steps = options.steps || 16;
        const radiusInDegrees = radius / 111; // Приблизительно

        const bufferCoords = [];
        for (let i = 0; i < steps; i++) {
            const angle = (2 * Math.PI * i) / steps;
            const x = lng + radiusInDegrees * Math.cos(angle);
            const y = lat + radiusInDegrees * Math.sin(angle);
            bufferCoords.push([x, y]);
        }

        // Замыкаем полигон
        bufferCoords.push(bufferCoords[0]);

        return this.polygon([bufferCoords]);
    }

    /**
     * Проверка валидности полигона
     * @param {Array|Object} polygon - Массив координат или GeoJSON
     * @returns {boolean}
     */
    static isValidPolygon(polygon) {
        try {
            let coords;

            if (Array.isArray(polygon)) {
                if (polygon.length < 3) return false;
                coords = polygon;
            } else if (polygon.type === 'Feature' && polygon.geometry.type === 'Polygon') {
                coords = polygon.geometry.coordinates[0];
            } else {
                return false;
            }

            // Проверяем, что все координаты валидны
            return coords.every(coord => {
                const lat = coord.lat !== undefined ? coord.lat : coord[1];
                const lng = coord.lng !== undefined ? coord.lng : coord[0];
                return typeof lat === 'number' && typeof lng === 'number' &&
                       lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
            });
        } catch (error) {
            return false;
        }
    }
}

// Создаем глобальный объект turf для совместимости
window.turf = LightweightGeo;

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LightweightGeo;
}