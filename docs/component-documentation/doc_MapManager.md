# MapManager.js - Документация

> **Файл:** `pages/managers/MapManager.js`  
> **Размер:** ~2250 строк  
> **Назначение:** Управление интерактивными картами в приложении Neocenka  

## Обзор

MapManager является одним из ключевых компонентов системы, отвечающим за все аспекты работы с картами: от инициализации Leaflet до управления слоями маркеров и пространственными запросами.

## Основная ответственность

- 🗺️ **Инициализация карт** - создание и настройка Leaflet карт
- 📍 **Управление маркерами** - создание, обновление и удаление маркеров адресов и объявлений
- 🎨 **Система фильтров** - визуализация данных по различным критериям (год, серия домов, материал стен)
- 🔗 **Кластеризация** - группировка маркеров для улучшения производительности
- 🎯 **Пространственные запросы** - фильтрация объектов по геометрическим областям
- 🖼️ **Слои карты** - управление различными типами отображаемых данных

## Архитектура класса

### Конструктор и инициализация
```javascript
constructor(dataState, eventBus, progressManager) {
    // Зависимости через параметры (частичная DI)
    this.dataState = dataState;
    this.eventBus = eventBus;
    this.progressManager = progressManager;
    
    // Объекты Leaflet карты
    this.map = null;                    // Основной объект карты
    this.drawnItems = null;            // Слой нарисованных объектов
    this.drawControl = null;           // Контроллер рисования
    this.areaPolygonLayer = null;      // Слой полигона области
    
    // Система слоев
    this.mapLayers = {
        addresses: null,               // Слой адресов
        objects: null,                // Слой объектов недвижимости
        listings: null                // Слой объявлений
    };
    
    // Оптимизация производительности
    this.spatialIndex = window.geoUtils || new GeoUtils();
    this.indexedAddresses = new Map();
    this.markerCache = new Map();
}
```

### Система событий
```javascript
bindEvents() {
    // Подписка на события приложения
    this.eventBus.on(CONSTANTS.EVENTS.AREA_LOADED, this.onAreaLoaded);
    this.eventBus.on(CONSTANTS.EVENTS.ADDRESSES_LOADED, this.loadAddressesOnMap);
    this.eventBus.on(CONSTANTS.EVENTS.LISTINGS_IMPORTED, this.loadListingsOnMap);
    this.eventBus.on(CONSTANTS.EVENTS.MAP_FILTER_CHANGED, this.toggleMapFilter);
}
```

## Ключевые методы

### Инициализация карты
```javascript
async initializeMap(mapElementId = 'map') {
    // Создание Leaflet карты
    // Настройка тайловых слоев (OpenStreetMap)
    // Добавление контроллеров рисования
    // Настройка событий карты
}
```

### Управление маркерами
```javascript
async loadAddressesOnMap() {
    // Загрузка и отображение маркеров адресов
    // Применение фильтров
    // Кластеризация для производительности
    // Обновление UI
}

createAddressMarker(address) {
    // Создание индивидуального маркера адреса
    // Настройка popup окон
    // Применение стилизации по фильтрам
}
```

### Система фильтров
```javascript
toggleMapFilter(filterType) {
    // Переключение активного фильтра
    // Обновление отображения маркеров
    // Синхронизация с состоянием приложения
}

// Поддерживаемые фильтры:
// - 'year' - год постройки
// - 'series' - серия дома  
// - 'material' - материал стен
// - 'floors' - этажность
```

### Пространственные операции
```javascript
filterAddressesByPolygon(addresses, polygon) {
    // Фильтрация адресов по геометрической области
    // Использование пространственных индексов
    // Оптимизация производительности
}
```

## Интеграции

### Leaflet.js
- **Версия:** Последняя стабильная
- **Плагины:** Leaflet.draw для рисования полигонов
- **Тайлы:** OpenStreetMap
- **Кластеризация:** Встроенная система группировки маркеров

### DataState интеграция
```javascript
// Синхронизация с глобальным состоянием
const addresses = this.dataState.getState('addresses');
const currentArea = this.dataState.getState('currentArea');
this.dataState.setState('activeMapFilter', filterType);
```

### EventBus взаимодействие
```javascript
// Публикация событий
this.eventBus.emit(CONSTANTS.EVENTS.MAP_INITIALIZED, {mapId: 'map'});
this.eventBus.emit(CONSTANTS.EVENTS.MARKERS_UPDATED, markerData);

// Подписка на события
this.eventBus.on(CONSTANTS.EVENTS.AREA_UPDATED, this.refreshMapData);
```

## Оптимизации производительности

### Кэширование маркеров
```javascript
// Переиспользование созданных маркеров
this.markerCache = new Map();

getOrCreateMarker(addressId) {
    if (!this.markerCache.has(addressId)) {
        this.markerCache.set(addressId, this.createAddressMarker(address));
    }
    return this.markerCache.get(addressId);
}
```

### Пространственные индексы
```javascript
// Использование RBush для быстрых пространственных запросов
this.spatialIndex = new GeoUtils();
this.spatialIndex.addAddresses(addresses);
const filtered = this.spatialIndex.getAddressesInPolygon(polygon);
```

### Ленивая загрузка
```javascript
// Динамические обновления на основе уровня масштабирования
setupViewportUpdates() {
    this.map.on('zoomend moveend', debounce(() => {
        if (this.map.getZoom() >= 14) {
            this.updateVisibleMarkers();
        }
    }, 500));
}
```

## Проблемы текущей реализации

### 🔴 Архитектурные проблемы

1. **Нарушение SRP** - класс выполняет слишком много функций:
   - Управление картой
   - Создание маркеров
   - Обработка событий
   - Пространственные вычисления

2. **Плотная связанность** - прямые ссылки на DOM элементы:
   ```javascript
   document.getElementById('refreshMapBtn')?.addEventListener(...) // ❌
   ```

3. **Смешивание слоев** - бизнес-логика смешана с UI логикой

### 🟡 Проблемы производительности

1. **Неоптимальные DOM операции**:
   ```javascript
   // Множественные обращения к DOM в циклах
   for (let address of addresses) {
       const marker = this.createAddressMarker(address); // Создает DOM элементы
   }
   ```

2. **Отсутствие виртуализации** при большом количестве маркеров (>1000)

3. **Неэффективная кластеризация** - пересчет при каждом изменении

### 🟡 Проблемы сопровождения

1. **Размер файла** - 2250+ строк в одном файле
2. **Отсутствие типизации** - нет JSDoc или TypeScript
3. **Смешанные ответственности** - сложность тестирования

## Рекомендации по улучшению

### Краткосрочные улучшения

1. **Разделение на модули**:
   ```javascript
   // Разбить на специализированные классы
   class MapRenderer {           // Только рендеринг карты
   class MarkerManager {         // Только управление маркерами  
   class LayerManager {          // Только управление слоями
   class SpatialQueryEngine {    // Только пространственные запросы
   ```

2. **Добавление типизации**:
   ```typescript
   interface MarkerConfig {
       id: string;
       position: LatLng;
       icon: IconConfig;
       popup?: PopupConfig;
   }
   ```

3. **Оптимизация производительности**:
   ```javascript
   class VirtualMarkerManager {
       // Виртуализация больших наборов маркеров
       renderVisibleMarkers(viewport: Bounds) { /* */ }
   }
   ```

### Долгосрочные улучшения

1. **Event-driven архитектура**:
   ```javascript
   class MapEventHandler {
       // Отдельный класс для обработки событий карты
       handleMarkerClick(event: MarkerClickEvent) { /* */ }
       handleZoomChange(event: ZoomChangeEvent) { /* */ }
   }
   ```

2. **Dependency Injection**:
   ```javascript
   @Injectable()
   class MapManager {
       constructor(
           @Inject('MarkerRenderer') private markerRenderer: IMarkerRenderer,
           @Inject('SpatialIndex') private spatialIndex: ISpatialIndex
       ) {}
   }
   ```

3. **Reactive Programming**:
   ```javascript
   // Использование RxJS для реактивных обновлений
   this.dataState.addresses$
       .pipe(
           debounceTime(300),
           switchMap(addresses => this.updateMarkers(addresses))
       )
       .subscribe();
   ```

## Тестирование

### Текущее состояние
- ❌ Юнит-тестов нет
- ❌ Интеграционных тестов нет  
- ⚠️ Только ручное тестирование через UI

### Рекомендуемые тесты
```javascript
describe('MapManager', () => {
    describe('marker creation', () => {
        it('should create marker with correct properties', () => {
            const marker = mapManager.createAddressMarker(mockAddress);
            expect(marker.getLatLng()).toEqual(mockAddress.coordinates);
        });
    });
    
    describe('spatial filtering', () => {
        it('should filter addresses by polygon', () => {
            const filtered = mapManager.filterAddressesByPolygon(addresses, polygon);
            expect(filtered).toHaveLength(expectedCount);
        });
    });
});
```

## API Reference

### Публичные методы

#### `initializeMap(mapElementId: string): Promise<void>`
Инициализирует карту в указанном DOM элементе.

#### `loadAddressesOnMap(): Promise<void>`  
Загружает и отображает адреса на карте с применением фильтров.

#### `toggleMapFilter(filterType: string): void`
Переключает активный фильтр отображения маркеров.

#### `addMarker(config: MarkerConfig): Marker`
Добавляет новый маркер на карту.

#### `removeMarker(markerId: string): void`
Удаляет маркер с карты.

### События

#### `MAP_INITIALIZED`
Испускается после успешной инициализации карты.
```javascript
{
    mapId: string,
    center: LatLng,
    zoom: number
}
```

#### `MARKERS_UPDATED` 
Испускается при обновлении маркеров на карте.
```javascript
{
    markersCount: number,
    visibleCount: number,
    filterType: string
}
```

## Связанные файлы

- [`pages/core/DataState.js`](../core/doc_DataState.md) - управление состоянием
- [`pages/core/EventBus.js`](../core/doc_EventBus.md) - система событий  
- [`utils/geometry-utils.js`](../../utils/doc_geometry-utils.md) - геопространственные вычисления
- [`pages/shared/constants.js`](../shared/doc_constants.md) - константы приложения

---

*Документация создана автоматически на основе анализа кода MapManager.js v0.3.4*