# GeometryUtils.js - Документация

> **Файл:** `utils/geometry-utils.js`  
> **Размер:** ~800 строк  
> **Назначение:** Геопространственные вычисления и геометрические операции  
> **Паттерн:** Static Utility Class

## Обзор

GeometryUtils предоставляет набор статических методов для работы с геопространственными данными. Основное применение - определение принадлежности точек (адресов) к полигональным областям на карте и выполнение геометрических расчетов.

## Основные возможности

- 📍 **Point-in-Polygon** - проверка вхождения точки в полигон (Ray Casting Algorithm)
- 🗺️ **Spatial Filtering** - фильтрация объектов по географическим областям  
- 📏 **Distance Calculations** - расчет расстояний между точками
- 🎯 **Bounds Operations** - работа с ограничивающими прямоугольниками
- 🔍 **Spatial Indexing** - оптимизация пространственных запросов через RBush

## Ключевые алгоритмы

### Point-in-Polygon (Ray Casting)
```javascript
static isPointInPolygon(point, polygon) {
    if (!point || !polygon || polygon.length < 3) {
        return false;
    }

    const lat = point.lat;
    const lng = point.lng;
    let inside = false;

    // Ray casting алгоритм
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        
        if (((pi.lat > lat) !== (pj.lat > lat)) &&
            (lng < (pj.lng - pi.lng) * (lat - pi.lat) / (pj.lat - pi.lat) + pi.lng)) {
            inside = !inside;
        }
    }

    return inside;
}
```

**Принцип работы:**
1. Проводим луч от точки в произвольном направлении
2. Подсчитываем количество пересечений луча с рёбрами полигона
3. Если количество нечётное - точка внутри, если чётное - снаружи

### Haversine Distance Formula
```javascript
static calculateDistance(point1, point2) {
    const R = 6371; // Радиус Земли в километрах
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Расстояние в километрах
}
```

## Основные методы

### Пространственная фильтрация

#### `getAddressesInMapArea(addresses, mapArea)`
Находит все адреса, входящие в заданную область карты.

```javascript
// Фильтрация адресов по полигону
const addressesInArea = GeometryUtils.getAddressesInMapArea(addresses, {
    polygon: [
        { lat: 55.0, lng: 82.0 },
        { lat: 55.1, lng: 82.0 },
        { lat: 55.1, lng: 82.1 },
        { lat: 55.0, lng: 82.1 }
    ]
});

// Возвращает: Address[]
```

#### `getListingsInMapArea(listings, addresses, mapArea)`
Фильтрует объявления по географической области через связанные адреса.

```javascript
const listingsInArea = GeometryUtils.getListingsInMapArea(
    allListings,
    allAddresses, 
    selectedArea
);
// Алгоритм:
// 1. Находим адреса в области
// 2. Получаем ID этих адресов  
// 3. Фильтруем объявления по address_id
```

#### `getObjectsInMapArea(objects, addresses, mapArea)`
Аналогично для объектов недвижимости.

### Геометрические вычисления

#### `calculateBounds(points)`
Вычисляет ограничивающий прямоугольник для набора точек.

```javascript
const bounds = GeometryUtils.calculateBounds([
    { lat: 55.0, lng: 82.0 },
    { lat: 55.1, lng: 82.1 },
    { lat: 54.9, lng: 81.9 }
]);

// Результат:
// {
//     north: 55.1,
//     south: 54.9,
//     east: 82.1,
//     west: 81.9,
//     center: { lat: 55.0, lng: 82.0 }
// }
```

#### `expandBounds(bounds, factor)`
Расширяет границы области на заданный коэффициент.

```javascript
const expandedBounds = GeometryUtils.expandBounds(originalBounds, 1.2);
// Увеличивает область на 20% в каждую сторону
```

### Пространственные индексы

#### `createSpatialIndex(items)`
Создаёт пространственный индекс для быстрого поиска используя RBush.

```javascript
const spatialIndex = GeometryUtils.createSpatialIndex(addresses.map(addr => ({
    minX: addr.coordinates.lng,
    minY: addr.coordinates.lat,
    maxX: addr.coordinates.lng,
    maxY: addr.coordinates.lat,
    data: addr
})));

// Быстрый поиск в области
const nearbyAddresses = spatialIndex.search({
    minX: 82.0, minY: 55.0,
    maxX: 82.1, maxY: 55.1
});
```

## Оптимизации производительности

### Пространственное индексирование
```javascript
// Для больших наборов данных используется RBush индекс
class OptimizedGeometryUtils {
    static buildAddressIndex(addresses) {
        const rbush = new RBush();
        
        const items = addresses.map(addr => ({
            minX: addr.coordinates.lng,
            minY: addr.coordinates.lat,
            maxX: addr.coordinates.lng,
            maxY: addr.coordinates.lat,
            address: addr
        }));
        
        rbush.load(items);
        return rbush;
    }
    
    static queryAddressesInBounds(index, bounds) {
        return index.search({
            minX: bounds.west,
            minY: bounds.south,
            maxX: bounds.east,
            maxY: bounds.north
        }).map(item => item.address);
    }
}
```

### Кэширование результатов
```javascript
// Кэш для результатов point-in-polygon
const polygonCache = new Map();

static isPointInPolygonCached(point, polygon) {
    const polygonHash = this.hashPolygon(polygon);
    const pointKey = `${point.lat},${point.lng}`;
    const cacheKey = `${polygonHash}:${pointKey}`;
    
    if (polygonCache.has(cacheKey)) {
        return polygonCache.get(cacheKey);
    }
    
    const result = this.isPointInPolygon(point, polygon);
    polygonCache.set(cacheKey, result);
    return result;
}
```

## Координатные системы

### Поддержка различных форматов координат
```javascript
static normalizeCoordinates(coordinates) {
    // Массив [lat, lng]
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
        return { lat: coordinates[0], lng: coordinates[1] };
    }
    
    // Объект {lat, lng}
    if (coordinates.lat !== undefined && coordinates.lng !== undefined) {
        return coordinates;
    }
    
    // Объект {latitude, longitude}
    if (coordinates.latitude !== undefined && coordinates.longitude !== undefined) {
        return { lat: coordinates.latitude, lng: coordinates.longitude };
    }
    
    throw new Error('Неподдерживаемый формат координат');
}
```

### Валидация координат
```javascript
static validateCoordinates(point) {
    if (!point || typeof point !== 'object') {
        return false;
    }
    
    const lat = point.lat;
    const lng = point.lng;
    
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return false;
    }
    
    // Проверка диапазонов
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return false;
    }
    
    return true;
}
```

## Специализированные алгоритмы

### Nearest Point на полигоне
```javascript
static nearestPointOnPolygon(point, polygon) {
    let minDistance = Infinity;
    let nearestPoint = null;
    
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        const segmentPoint = this.nearestPointOnSegment(point, polygon[i], polygon[j]);
        const distance = this.calculateDistance(point, segmentPoint);
        
        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = segmentPoint;
        }
    }
    
    return { point: nearestPoint, distance: minDistance };
}
```

### Polygon Area Calculation
```javascript
static calculatePolygonArea(polygon) {
    if (!polygon || polygon.length < 3) {
        return 0;
    }
    
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += polygon[i].lng * polygon[j].lat;
        area -= polygon[j].lng * polygon[i].lat;
    }
    
    return Math.abs(area / 2);
}
```

## Интеграция с картами

### Leaflet.js интеграция
```javascript
// Конвертация в формат Leaflet
static toLeafletLatLngBounds(bounds) {
    return L.latLngBounds(
        L.latLng(bounds.south, bounds.west),
        L.latLng(bounds.north, bounds.east)
    );
}

static fromLeafletPolygon(leafletPolygon) {
    return leafletPolygon.getLatLngs()[0].map(latlng => ({
        lat: latlng.lat,
        lng: latlng.lng
    }));
}
```

### MapBox GL JS интеграция  
```javascript
static toMapboxBounds(bounds) {
    return new mapboxgl.LngLatBounds(
        [bounds.west, bounds.south],
        [bounds.east, bounds.north]
    );
}
```

## Тестирование геометрических функций

### Unit тесты для Point-in-Polygon
```javascript
describe('GeometryUtils.isPointInPolygon', () => {
    const squarePolygon = [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 0, lng: 1 }
    ];
    
    test('point inside square', () => {
        const point = { lat: 0.5, lng: 0.5 };
        expect(GeometryUtils.isPointInPolygon(point, squarePolygon)).toBe(true);
    });
    
    test('point outside square', () => {
        const point = { lat: 2, lng: 2 };
        expect(GeometryUtils.isPointInPolygon(point, squarePolygon)).toBe(false);
    });
    
    test('point on edge', () => {
        const point = { lat: 0.5, lng: 0 };
        // Edge case: точка на границе
        expect(GeometryUtils.isPointInPolygon(point, squarePolygon)).toBe(false);
    });
});
```

## Performance Benchmarks

### Производительность алгоритмов
```javascript
// Бенчмарк point-in-polygon
function benchmarkPointInPolygon() {
    const polygon = generateRandomPolygon(100); // 100 вершин
    const points = generateRandomPoints(10000); // 10k точек
    
    console.time('point-in-polygon');
    const results = points.map(point => 
        GeometryUtils.isPointInPolygon(point, polygon)
    );
    console.timeEnd('point-in-polygon');
    
    // Типичный результат: ~50ms для 10k точек на polygon 100 вершин
}
```

### Оптимизация для больших данных
```javascript
// Для >10k адресов используется spatial partitioning
static filterLargeAddressSet(addresses, polygon) {
    // 1. Создаем bounds полигона
    const bounds = this.calculateBounds(polygon);
    
    // 2. Грубая фильтрация по bounds (быстро)
    const candidateAddresses = addresses.filter(addr => 
        this.isPointInBounds(addr.coordinates, bounds)
    );
    
    // 3. Точная фильтрация по полигону (медленно, но меньше точек)
    return candidateAddresses.filter(addr => 
        this.isPointInPolygon(addr.coordinates, polygon)
    );
}
```

## API Reference

### Core Methods

#### `isPointInPolygon(point, polygon): boolean`
**Параметры:**
- `point: {lat: number, lng: number}` - проверяемая точка
- `polygon: Array<{lat: number, lng: number}>` - вершины полигона

**Возвращает:** `boolean` - true если точка внутри полигона

#### `calculateDistance(point1, point2): number`
**Параметры:**
- `point1, point2: {lat: number, lng: number}` - координаты точек

**Возвращает:** `number` - расстояние в километрах (Haversine formula)

#### `getAddressesInMapArea(addresses, mapArea): Address[]`
**Параметры:**
- `addresses: Address[]` - массив адресов для фильтрации
- `mapArea: {polygon: Array}` - область с полигоном

**Возвращает:** `Address[]` - адреса внутри области

## Связанные файлы

- [`../pages/managers/MapManager.js`](../pages/managers/doc_MapManager.md) - использует для пространственных запросов
- [`../data/database.js`](../data/doc_database.md) - spatial индексы в БД
- [`duplicate-detector.js`](doc_duplicate-detector.md) - географические дубликаты

## Заключение

GeometryUtils является фундаментальной утилитой для всех геопространственных операций в приложении. Оптимизирован для работы с большими наборами данных и обеспечивает точные геометрические вычисления.

**Рекомендации:**
- ✅ Используйте spatial индексы для больших наборов данных (>1000 точек)
- ✅ Кэшируйте результаты point-in-polygon для повторяющихся запросов  
- ✅ Валидируйте входные координаты
- ❌ Не используйте для real-time обновлений без оптимизации

---

*GeometryUtils использует проверенные математические алгоритмы для обеспечения точности геопространственных вычислений.*