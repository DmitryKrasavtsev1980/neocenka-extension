# API референс Neocenka Extension v0.1

## Обзор API

В версии 0.1 внедрена многоуровневая API архитектура, включающая внутренние API сервисов, внешние интеграции и публичные методы для взаимодействия с расширением.

## Структура API

```
API Architecture v0.1
├── Internal Service APIs              # Внутренние API сервисов
│   ├── ValidationService API         # Валидация данных
│   ├── ConfigService API             # Управление конфигурацией
│   ├── SegmentService API            # Работа с сегментами
│   └── ReferenceDataService API      # Справочные данные
├── Component APIs                     # API компонентов  
│   ├── SegmentModal API              # Модальные окна
│   ├── SegmentTable API              # Таблицы
│   ├── SegmentChart API              # Графики
│   └── MapRenderer API               # Карты
├── Controller APIs                    # API контроллеров
│   ├── ApplicationController API     # Главный контроллер
│   ├── SegmentController API         # Контроллер сегментов
│   └── MapController API             # Контроллер карты
├── External APIs                      # Внешние интеграции
│   ├── Inpars.ru API Client         # Внешние данные недвижимости
│   ├── Avito Parser API             # Парсинг Avito
│   └── Cian Parser API              # Парсинг Cian  
└── Public Extension API              # Публичный API расширения
    ├── Chrome Extension API         # Взаимодействие с браузером
    ├── Content Script API           # API контент скриптов
    └── Background Service API       # Background Worker API
```

---

## Internal Service APIs

### ValidationService API

**Namespace:** `neocenka.services.ValidationService`

#### Методы валидации:

```javascript
// Универсальная валидация по типу
validate(type: string, data: object): ValidationResult
/**
 * @param type - Тип данных: 'segments'|'addresses'|'listings'|'coordinates'|'price_history'
 * @param data - Данные для валидации
 * @returns {
 *   isValid: boolean,
 *   errors: string[],
 *   warnings: string[]
 * }
 */

// Специализированные валидаторы
validateSegment(segmentData: SegmentData): ValidationResult
validateAddress(addressData: AddressData): ValidationResult  
validateListing(listingData: ListingData): ValidationResult
validateCoordinates(lat: number, lng: number): ValidationResult
validatePriceHistory(history: PriceHistoryItem[]): ValidationResult

// Валидация диапазонов
validateRange(from: number, to: number, fieldName: string): ValidationResult
/**
 * @param from - Начальное значение
 * @param to - Конечное значение  
 * @param fieldName - Название поля для ошибок
 */

// Валидация справочных данных
validateReferenceIds(type: string, ids: string[]): Promise<ValidationResult>
/**
 * @param type - Тип справочника: 'house_series'|'house_classes'|'wall_materials'
 * @param ids - Массив ID для проверки
 */
```

#### Типы данных:

```typescript
interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

interface SegmentData {
    name: string;
    description?: string;
    map_area_id: string;
    filters: SegmentFilters;
}

interface SegmentFilters {
    house_series_id?: string[];
    house_class_id?: string[];
    wall_material_id?: string[];
    floors_from?: number;
    floors_to?: number;
    build_year_from?: number;
    build_year_to?: number;
    area_from?: number;
    area_to?: number;
    price_from?: number;
    price_to?: number;
}
```

#### Пример использования:

```javascript
// Валидация сегмента
const segmentData = {
    name: 'Новостройки центра',
    map_area_id: 'area_123',
    filters: {
        house_series_id: ['series_modern'],
        build_year_from: 2020,
        build_year_to: 2024,
        price_from: 3000000,
        price_to: 8000000
    }
};

const result = await validationService.validate('segments', segmentData);

if (!result.isValid) {
    console.error('Ошибки валидации:', result.errors);
}

if (result.warnings.length > 0) {
    console.warn('Предупреждения:', result.warnings);
}
```

---

### ConfigService API

**Namespace:** `neocenka.services.ConfigService`

#### Управление конфигурацией:

```javascript
// Получение значений
get(path: string): any
/**
 * @param path - Путь к значению через точку, например 'ui.map.defaultZoom'
 * @returns Значение по указанному пути
 */

getUIConfig(component?: string): object
/**
 * @param component - Название компонента: 'map'|'table'|'modal'|null
 * @returns UI конфигурация для компонента или вся UI конфигурация
 */

getDatabaseConfig(): object
getPerformanceConfig(): object  
getAPIConfig(service?: string): object

// Установка значений
set(path: string, value: any): void
/**
 * @param path - Путь к значению
 * @param value - Новое значение
 * Автоматически уведомляет подписчиков об изменении
 */

setState(section: string, data: object): void
/**
 * @param section - Секция конфигурации: 'ui'|'database'|'performance'|'api'
 * @param data - Данные для установки
 */

// Подписки на изменения
subscribe(path: string, callback: Function): string
/**
 * @param path - Путь для отслеживания
 * @param callback - Функция обратного вызова (newValue, oldValue) => void
 * @returns ID подписки для отмены
 */

unsubscribe(path: string, subscriptionId: string): void

// Персистентность
persist(): Promise<void>
/**
 * Сохранение конфигурации в localStorage
 */

restore(): Promise<void>
/**
 * Восстановление конфигурации из localStorage
 */
```

#### Структура конфигурации:

```javascript
const DEFAULT_CONFIG = {
    ui: {
        theme: 'light',
        language: 'ru',
        map: {
            defaultZoom: 13,
            centerNsk: [55.0084, 82.9357],
            clustering: {
                enabled: true,
                distance: 50
            }
        },
        table: {
            pageSize: 25,
            showExport: true
        }
    },
    database: {
        version: 17,
        enableDebug: false,
        backupInterval: 3600000
    },
    performance: {
        cache: {
            ttl: 1800000,
            maxSize: 100
        },
        ui: {
            maxVisibleMarkers: 1000,
            debounceInterval: 300
        }
    },
    api: {
        inpars: {
            endpoint: 'https://api.inpars.ru',
            timeout: 30000,
            rateLimit: 10
        }
    }
};
```

#### Пример использования:

```javascript
// Получение настроек карты
const mapConfig = configService.getUIConfig('map');
const defaultZoom = configService.get('ui.map.defaultZoom');

// Изменение темы
configService.set('ui.theme', 'dark');

// Подписка на изменения темы
const subscriptionId = configService.subscribe('ui.theme', (newTheme, oldTheme) => {
    document.body.className = `theme-${newTheme}`;
});

// Отмена подписки
configService.unsubscribe('ui.theme', subscriptionId);
```

---

### SegmentService API

**Namespace:** `neocenka.services.SegmentService`

#### CRUD операции:

```javascript
// Создание сегмента
async create(segmentData: SegmentData): Promise<Segment>
/**
 * @param segmentData - Данные нового сегмента
 * @returns Созданный сегмент с ID
 * @throws ValidationError при ошибках валидации
 * @throws DatabaseError при ошибках БД
 */

// Получение сегмента по ID
async getById(segmentId: string): Promise<Segment | null>

// Получение сегментов области
async getByAreaId(areaId: string): Promise<Segment[]>

// Обновление сегмента
async update(segmentId: string, updates: Partial<SegmentData>): Promise<Segment>
/**
 * @param segmentId - ID сегмента
 * @param updates - Частичные обновления
 */

// Удаление сегмента
async delete(segmentId: string): Promise<boolean>
/**
 * @param segmentId - ID сегмента для удаления
 * @returns true при успешном удалении
 */

// Получение всех сегментов
async getAll(filter?: Function): Promise<Segment[]>
```

#### Статистика и аналитика:

```javascript
// Статистика сегмента
async getStatistics(segmentId: string): Promise<SegmentStatistics>
/**
 * @returns {
 *   addressCount: number,
 *   objectCount: number, 
 *   listingCount: number,
 *   averagePrice: number,
 *   priceRange: { min: number, max: number },
 *   areaDistribution: ChartData,
 *   priceDistribution: ChartData,
 *   buildYearDistribution: ChartData,
 *   lastUpdated: Date
 * }
 */

// Кэшированная статистика
getCachedStatistics(segmentId: string): SegmentStatistics | null

// Инвалидация кэша
invalidateCache(key?: string): void
/**
 * @param key - Конкретный ключ кэша или null для полной очистки
 */
```

#### Экспорт и импорт:

```javascript
// Экспорт сегментов
async export(segmentIds: string[], format: 'json' | 'csv' | 'excel'): Promise<string | Blob>
/**
 * @param segmentIds - Массив ID сегментов для экспорта
 * @param format - Формат экспорта
 * @returns Данные в указанном формате
 */

// Импорт сегментов
async import(data: string | object, options: ImportOptions): Promise<ImportResult>
/**
 * @param data - Данные для импорта
 * @param options - Опции импорта
 * @returns {
 *   imported: number,
 *   skipped: number, 
 *   errors: ImportError[]
 * }
 */
```

#### События сервиса:

```javascript
// Подписка на события
addEventListener(eventType: string, handler: Function): void
removeEventListener(eventType: string, handler: Function): void

// Типы событий:
'segment:created'    // { segment: Segment }
'segment:updated'    // { segment: Segment, changes: object }  
'segment:deleted'    // { segmentId: string }
'statistics:updated' // { segmentId: string, statistics: SegmentStatistics }
```

---

### ReferenceDataService API

**Namespace:** `neocenka.services.ReferenceDataService`

#### Работа со справочниками:

```javascript
// Получение всех элементов справочника
async getAll(referenceType: ReferenceType): Promise<ReferenceItem[]>
/**
 * @param referenceType - 'house_series'|'house_classes'|'wall_materials'
 */

// Получение элемента по ID
async getById(referenceType: ReferenceType, id: string): Promise<ReferenceItem | null>

// Получение нескольких элементов
async getByIds(referenceType: ReferenceType, ids: string[]): Promise<ReferenceItem[]>

// Поиск в справочнике
async search(referenceType: ReferenceType, query: string): Promise<ReferenceItem[]>
/**
 * @param query - Поисковый запрос по названию/описанию
 */
```

#### CRUD операции:

```javascript
// Создание элемента справочника
async create(referenceType: ReferenceType, data: ReferenceItemData): Promise<ReferenceItem>

// Обновление элемента
async update(referenceType: ReferenceType, id: string, updates: Partial<ReferenceItemData>): Promise<ReferenceItem>

// Удаление элемента
async delete(referenceType: ReferenceType, id: string): Promise<boolean>
/**
 * @throws ReferenceInUseError если элемент используется
 */

// Проверка использования элемента
async checkUsage(referenceType: ReferenceType, id: string): Promise<UsageInfo>
/**
 * @returns {
 *   inUse: boolean,
 *   usageCount: number,
 *   usageDetails: UsageDetail[]
 * }
 */
```

#### Инициализация:

```javascript
// Инициализация данных по умолчанию
async initializeDefaultData(): Promise<void>
/**
 * Создает справочники по умолчанию если их нет
 */

// Статистика использования
getUsageStatistics(): Promise<{ [referenceType: string]: { [id: string]: number } }>
```

---

## Component APIs

### SegmentModal API

**Namespace:** `neocenka.components.SegmentModal`

#### Управление модальными окнами:

```javascript
// Показ модальных окон
showCreateModal(areaId: string): void
/**
 * @param areaId - ID области для создания сегмента
 */

showEditModal(segment: Segment): void
/**
 * @param segment - Сегмент для редактирования
 */

hideModal(): void

// Работа с формой
populateForm(segmentData: SegmentData): void
collectFormData(): SegmentData
resetForm(): void
validateForm(): ValidationResult

// Обновление справочных данных
updateSelectOptions(type: ReferenceType, options: ReferenceItem[]): void
loadReferenceData(): Promise<void>

// Отображение ошибок
displayValidationErrors(errors: { [field: string]: string[] }): void
clearValidationErrors(): void
```

#### События модального окна:

```javascript
// События
'segment:save'     // { mode: 'create'|'edit', segmentData: SegmentData }
'segment:cancel'   // {}
'segment:delete'   // { segmentId: string }
'validation:error' // { errors: ValidationErrors }
```

---

### SegmentTable API

**Namespace:** `neocenka.components.SegmentTable`

#### Управление данными таблицы:

```javascript
// Обновление данных
updateData(segments: Segment[]): void
addSegment(segment: Segment): void
updateSegment(segmentId: string, segmentData: Segment): void  
removeSegment(segmentId: string): void

// Фильтрация и поиск
applyFilter(filterFunction: (segment: Segment) => boolean): void
clearFilter(): void
search(query: string): void

// Сортировка
sortBy(columnName: string, direction: 'asc' | 'desc'): void

// Выбор строк
selectSegment(segmentId: string): void
getSelectedSegments(): string[]
clearSelection(): void

// DataTables интеграция
initializeDataTable(options?: object): void
refreshDataTable(): void
destroyDataTable(): void
```

#### События таблицы:

```javascript
'segment:select'   // { segmentId: string }
'segment:edit'     // { segmentId: string }
'segment:view'     // { segmentId: string }
'segment:delete'   // { segmentId: string }
'filter:change'    // { filterParams: object }
```

---

### SegmentChart API

**Namespace:** `neocenka.components.SegmentChart`

#### Создание графиков:

```javascript
// Создание различных типов графиков
createAreaDistributionChart(data: ChartData, containerId: string): ApexChart
createPriceDistributionChart(data: ChartData, containerId: string): ApexChart  
createPriceHistoryChart(data: ChartData, containerId: string): ApexChart
createBuildYearDistributionChart(data: ChartData, containerId: string): ApexChart

// Управление графиками
updateChart(chartId: string, newData: ChartData): void
destroyChart(chartId: string): void
destroyAllCharts(): void

// Конфигурация
getDefaultChartOptions(): object
applyTheme(theme: 'light' | 'dark'): void
```

#### Типы данных графиков:

```typescript
interface ChartData {
    labels?: string[];
    values: number[];
    series?: ChartSeries[];
    categories?: string[];
}

interface ChartSeries {
    name: string;
    data: number[];
    color?: string;
}
```

---

### MapRenderer API

**Namespace:** `neocenka.components.MapRenderer`

#### Создание и управление картой:

```javascript
// Создание карты
async createMap(containerId: string, options?: MapOptions): Promise<L.Map>
/**
 * @param containerId - ID DOM элемента для карты
 * @param options - Опции Leaflet карты
 */

// Управление слоями
addLayer(layerId: string, layer: L.Layer, options?: LayerOptions): void
removeLayer(layerId: string): void
toggleLayer(layerId: string, visible: boolean): void

// Навигация
setView(center: [number, number], zoom: number, options?: object): void
fitBounds(bounds: L.LatLngBounds, options?: object): void
getBounds(): L.LatLngBounds

// Контролы
addControl(controlId: string, control: L.Control, position?: string): void
removeControl(controlId: string): void
createDrawingControl(options?: object): L.Control.Draw

// Утилиты
latLngToContainerPoint(latlng: L.LatLng): L.Point
containerPointToLatLng(point: L.Point): L.LatLng
takeScreenshot(options?: ScreenshotOptions): Promise<string | Blob>
```

---

### MarkerManager API

**Namespace:** `neocenka.components.MarkerManager`

#### Управление маркерами:

```javascript
// Создание маркеров
createMarker(markerId: string, latLng: [number, number], options?: MarkerOptions): L.Marker
createMarkersFromData(items: object[], mapperFunction: Function): { [id: string]: L.Marker }

// Отображение маркеров
showMarker(markerId: string, layerId?: string): void
hideMarker(markerId: string): void  
removeMarker(markerId: string): void

// Групповые операции
showGroup(groupName: string, layerId?: string): void
hideGroup(groupName: string): void
createGroup(groupName: string, markerIds: string[]): void

// Кластеризация
toggleClustering(enabled: boolean): void

// Фильтрация
filterMarkers(filterFunction: Function): { [id: string]: L.Marker }
searchNearby(center: L.LatLng, radiusMeters: number): object

// Навигация
fitBounds(markerIds?: string[], options?: object): void
```

---

## Controller APIs

### ApplicationController API

**Namespace:** `neocenka.controllers.ApplicationController`

#### Жизненный цикл приложения:

```javascript
// Инициализация
async initialize(): Promise<void>
/**
 * Полная инициализация приложения:
 * - Настройка DI контейнера
 * - Регистрация сервисов
 * - Инициализация контроллеров
 * - Настройка роутинга
 * - Загрузка начальных данных
 */

async shutdown(): Promise<void>
/**
 * Корректное завершение работы
 */

// Управление контроллерами
getController(name: string): Controller | null
/**
 * @param name - Имя контроллера: 'segment'|'map'
 */

// Выполнение команд
async executeCommand(command: string, params?: object): Promise<any>
/**
 * @param command - Команда в формате 'controller.method'
 * @examples
 * - 'segment.showCreateModal'
 * - 'map.fitToVisibleData'
 */

// Маршрутизация
handleRouteChange(): void
setupRouting(): void

// Глобальные обработчики
handleGlobalKeyboard(event: KeyboardEvent): void
handleGlobalError(event: ErrorEvent): void
```

#### События приложения:

```javascript
'app:ready'           // Приложение инициализировано
'app:error'           // Критическая ошибка
'route:change'        // Изменение маршрута
'shortcut:new-segment' // Ctrl+N
'shortcut:save'       // Ctrl+S  
'shortcut:escape'     // Escape
'window:resize'       // Изменение размера окна
```

---

### SegmentController API

**Namespace:** `neocenka.controllers.SegmentController`

#### Основные операции:

```javascript
// Управление модальными окнами
async showCreateModal(areaId: string): Promise<void>
async editSegment(segmentId: string): Promise<void>

// Обработка событий
async handleSegmentSave(eventData: { mode: string, segmentData: SegmentData }): Promise<void>
handleSegmentCancel(): void
async handleSegmentDelete(segmentId: string): Promise<void>

// Просмотр и выбор
async viewSegment(segmentId: string): Promise<void>
selectSegment(segmentId: string): void

// Загрузка данных
async loadSegmentsForArea(areaId: string): Promise<void>
async refreshCurrentData(): Promise<void>

// Экспорт
async exportSegments(segmentIds?: string[], format?: string): Promise<void>
```

#### События контроллера:

```javascript
'segment:saved'        // { mode: string, segment: Segment }
'segment:selected'     // { segmentId: string }
'segment:viewed'       // { segment: Segment, statistics: SegmentStatistics }
'segments:loaded'      // { areaId: string, segments: Segment[] }
```

---

### MapController API

**Namespace:** `neocenka.controllers.MapController`

#### Управление картой:

```javascript
// Создание карты
async createMap(containerId: string, options?: object): Promise<L.Map>

// Управление областями
async loadAreaPolygons(areaIds?: string[]): Promise<void>
selectArea(areaId: string): void

// Управление маркерами
async updateAddressMarkers(addresses: Address[]): Promise<void>
async highlightSegmentData(segmentId: string): Promise<void>

// Режим рисования
toggleDrawingMode(enabled: boolean): void

// Навигация
fitToVisibleData(): void
```

#### События карты:

```javascript
'map:initialized'          // { map: L.Map }
'area:selected'           // { areaId: string }
'marker:selected'         // { markerId: string, address: Address }
'drawing-mode:toggled'    // { enabled: boolean }
'polygon:created'         // { coordinates: number[][], layer: L.Layer }
```

---

## External APIs

### Inpars.ru API Client

**Namespace:** `neocenka.external.InparsAPIClient`

#### Методы API:

```javascript
// Поиск объектов недвижимости
async searchRealEstate(query: InparsSearchQuery): Promise<InparsResponse>
/**
 * @param query - {
 *   address?: string,
 *   coordinates?: { lat: number, lng: number },
 *   radius?: number,
 *   propertyType?: string,
 *   limit?: number
 * }
 */

// Получение деталей объекта
async getObjectDetails(objectId: string): Promise<InparsObjectDetails>

// Получение истории цен
async getPriceHistory(objectId: string, period?: string): Promise<InparsPriceHistory>

// Получение аналитики по району
async getAreaAnalytics(bounds: LatLngBounds): Promise<InparsAreaAnalytics>
```

#### Конфигурация клиента:

```javascript
class InparsAPIClient {
    constructor(config: {
        apiKey: string,
        endpoint: string,
        timeout: number,
        rateLimit: number
    })
    
    // Методы конфигурации
    setApiKey(apiKey: string): void
    setTimeout(timeout: number): void
    setRateLimit(requestsPerSecond: number): void
}
```

---

## Public Extension API

### Chrome Extension API

**Namespace:** `window.neocenka`

#### Публичные методы для внешнего использования:

```javascript
// Инициализация расширения
window.neocenka.init(): Promise<void>

// Получение данных
window.neocenka.getSegments(areaId?: string): Promise<Segment[]>
window.neocenka.getAreas(): Promise<MapArea[]>
window.neocenka.getStatistics(segmentId: string): Promise<SegmentStatistics>

// Создание сегментов программно
window.neocenka.createSegment(segmentData: SegmentData): Promise<Segment>

// Экспорт данных
window.neocenka.exportData(options: ExportOptions): Promise<string | Blob>
/**
 * @param options - {
 *   type: 'segments'|'areas'|'all',
 *   format: 'json'|'csv'|'excel',
 *   ids?: string[]
 * }
 */

// События расширения
window.neocenka.on(eventType: string, handler: Function): string
window.neocenka.off(eventType: string, handlerId: string): void

// Доступные события:
'segment:created'
'segment:updated'
'segment:deleted'
'area:selected'
'data:exported'
```

#### Пример использования:

```javascript
// Инициализация
await window.neocenka.init();

// Получение всех сегментов
const segments = await window.neocenka.getSegments();

// Подписка на события
const handlerId = window.neocenka.on('segment:created', (segment) => {
    console.log('Создан новый сегмент:', segment);
});

// Создание сегмента
const newSegment = await window.neocenka.createSegment({
    name: 'Тестовый сегмент',
    map_area_id: 'area_123',
    filters: {
        build_year_from: 2020,
        price_to: 5000000
    }
});

// Экспорт данных
const csvData = await window.neocenka.exportData({
    type: 'segments',
    format: 'csv'
});
```

---

### Content Script API

**Namespace:** `neocenka.contentScript`

#### API для взаимодействия с парсерами:

```javascript
// Парсинг страницы
async parsePage(url: string, parserType: 'avito' | 'cian'): Promise<ParseResult>
/**
 * @returns {
 *   success: boolean,
 *   data: ParsedListing[],
 *   errors: string[],
 *   metadata: ParseMetadata
 * }
 */

// Получение метаданных страницы
getPageMetadata(): PageMetadata
/**
 * @returns {
 *   url: string,
 *   title: string,
 *   totalCount: number,
 *   currentPage: number,
 *   filters: object
 * }
 */

// Автоматический парсинг
startAutoParsing(options: AutoParsingOptions): string
/**
 * @param options - {
 *   interval: number,
 *   maxPages: number,
 *   onProgress: Function
 * }
 * @returns ID задачи парсинга
 */

stopAutoParsing(taskId: string): void
```

---

### Background Service API

**Namespace:** Chrome Extension Background Script

#### Service Worker методы:

```javascript
// Управление парсингом
chrome.runtime.sendMessage({
    action: 'startParsing',
    data: {
        urls: string[],
        parserType: 'avito' | 'cian'
    }
}): Promise<ParseResult>

// Управление данными
chrome.runtime.sendMessage({
    action: 'syncData'
}): Promise<SyncResult>

// Экспорт данных
chrome.runtime.sendMessage({
    action: 'exportData',
    data: ExportOptions
}): Promise<ExportResult>

// Получение статистики
chrome.runtime.sendMessage({
    action: 'getStatistics',
    data: { segmentId?: string }
}): Promise<Statistics>
```

---

## Обработка ошибок API

### Стандартные типы ошибок:

```javascript
// Базовый класс ошибок
class NeocenkaError extends Error {
    constructor(message: string, code: string, context?: object) {
        super(message);
        this.name = 'NeocenkaError';
        this.code = code;
        this.context = context;
        this.timestamp = new Date();
    }
}

// Специфические ошибки
class ValidationError extends NeocenkaError {}        // Ошибки валидации
class DatabaseError extends NeocenkaError {}         // Ошибки БД
class NetworkError extends NeocenkaError {}          // Сетевые ошибки
class ReferenceInUseError extends NeocenkaError {}   // Справочник используется
class ConfigurationError extends NeocenkaError {}   // Ошибки конфигурации
```

### Стандартные коды ошибок:

```javascript
const ERROR_CODES = {
    // Валидация
    VALIDATION_FAILED: 'E001',
    INVALID_DATA_FORMAT: 'E002',
    REQUIRED_FIELD_MISSING: 'E003',
    
    // База данных
    DATABASE_CONNECTION_FAILED: 'E101',
    RECORD_NOT_FOUND: 'E102',
    DUPLICATE_KEY: 'E103',
    
    // Сеть
    NETWORK_TIMEOUT: 'E201',
    API_RATE_LIMIT: 'E202',
    EXTERNAL_API_ERROR: 'E203',
    
    // Бизнес-логика
    REFERENCE_IN_USE: 'E301',
    SEGMENT_OVERLAP: 'E302',
    AREA_INVALID_POLYGON: 'E303'
};
```

---

## Конфигурация API

### Настройки таймаутов:

```javascript
const API_CONFIG = {
    timeouts: {
        database: 5000,      // 5 секунд
        externalAPI: 30000,  // 30 секунд
        fileExport: 60000,   // 1 минута
        parsing: 120000      // 2 минуты
    },
    
    retries: {
        database: 3,
        externalAPI: 3,
        networkRequest: 3
    },
    
    rateLimit: {
        inparsAPI: 10,       // запросов в секунду
        avitoParser: 2,      // запросов в секунду
        cianParser: 3        // запросов в секунду
    }
};
```

---

**API v0.1 обеспечивает:**
- ✅ **Единообразные интерфейсы** для всех уровней системы
- ✅ **Строгую типизацию** через TypeScript определения
- ✅ **Обработку ошибок** с детальной классификацией
- ✅ **Асинхронность** через Promise/async-await
- ✅ **Event-driven коммуникацию** между компонентами
- ✅ **Внешние интеграции** с контролем скорости запросов
- ✅ **Публичный API** для расширяемости приложения