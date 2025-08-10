# API Reference - Neocenka Extension

> **Версия:** v0.3.4  
> **Дата:** Август 2025  
> **Тип:** Полный справочник API  

## Содержание

1. [Обзор API](#обзор-api)
2. [Core Architecture API](#core-architecture-api)
3. [Managers API](#managers-api)
4. [Services API](#services-api)
5. [Data Layer API](#data-layer-api)
6. [Events API](#events-api)
7. [External APIs](#external-apis)
8. [Utils API](#utils-api)

---

## Обзор API

Neocenka Extension построен на модульной архитектуре с четкими API границами между компонентами. Все внутренние API следуют принципам:

- 🎯 **Единственная ответственность** для каждого модуля
- 📡 **Event-driven communication** между слоями  
- 🔒 **Immutable data** где это возможно
- 📝 **Promise-based** асинхронные операции

---

## Core Architecture API

### DataState API

Централизованное управление состоянием приложения.

```javascript
interface DataStateAPI {
    // === CORE STATE MANAGEMENT ===
    
    setState(property: string, value: any): void;
    getState(property: string): any;
    getAllStates(): Record<string, any>;
    clearCache(): void;
    
    // === REACTIVE SUBSCRIPTIONS ===
    
    subscribe(property: string, callback: StateChangeCallback): void;
    unsubscribe(property: string, callback: StateChangeCallback): void;
    
    // === STATE PROPERTIES ===
    
    currentAreaId: string | null;           // ID текущей области
    currentArea: Area | null;               // Объект области
    addresses: Address[];                   // Массив адресов
    listings: Listing[];                    // Массив объявлений
    segments: Segment[];                    // Массив сегментов
    realEstateObjects: RealEstateObject[]; // Объекты недвижимости
    processing: ProcessingState;            // Состояние процессов
    selectedDuplicates: Set<string>;        // Выбранные дубликаты
    activeMapFilter: string | null;         // Активный фильтр карты
}

type StateChangeCallback = (newValue: any, oldValue: any) => void;

interface ProcessingState {
    parsing: boolean;       // Идет парсинг
    updating: boolean;      // Идет обновление
    addresses: boolean;     // Загружаются адреса
    duplicates: boolean;    // Обрабатываются дубликаты
}
```

**Пример использования:**
```javascript
// Подписка на изменения
dataState.subscribe('addresses', (newAddresses, oldAddresses) => {
    updateUI(newAddresses);
});

// Обновление состояния
dataState.setState('addresses', updatedAddresses);

// Получение данных
const currentArea = dataState.getState('currentArea');
```

### EventBus API

Система событий для слабой связанности компонентов.

```javascript
interface EventBusAPI {
    // === EVENT MANAGEMENT ===
    
    on(eventType: string, handler: EventHandler): void;
    off(eventType: string, handler: EventHandler): void;
    emit(eventType: string, data?: any): void;
    once(eventType: string, handler: EventHandler): void;
    
    // === UTILITY ===
    
    clear(): void;                          // Очистить все подписки
    getHandlers(eventType: string): EventHandler[];
}

type EventHandler = (data: any) => void | Promise<void>;

// Стандартные события системы
const EVENTS = {
    // Data Events
    ADDRESSES_LOADED: 'addresses-loaded',
    LISTINGS_IMPORTED: 'listings-imported',
    AREA_UPDATED: 'area-updated',
    SEGMENT_CREATED: 'segment-created',
    
    // UI Events  
    MAP_INITIALIZED: 'map-initialized',
    MODAL_OPENED: 'modal-opened',
    FILTER_CHANGED: 'filter-changed',
    
    // Process Events
    PARSING_STARTED: 'parsing-started',
    PARSING_COMPLETED: 'parsing-completed',
    ERROR_OCCURRED: 'error-occurred'
};
```

**Пример использования:**
```javascript
// Подписка на событие
eventBus.on(EVENTS.ADDRESSES_LOADED, (addresses) => {
    renderAddresses(addresses);
});

// Генерация события
eventBus.emit(EVENTS.ADDRESSES_LOADED, addressesArray);

// Одноразовая подписка
eventBus.once(EVENTS.MAP_INITIALIZED, () => {
    loadInitialData();
});
```

### ProgressManager API

Управление индикаторами прогресса и уведомлениями.

```javascript
interface ProgressManagerAPI {
    // === PROGRESS INDICATORS ===
    
    showProgress(message: string, progress?: number): void;
    updateProgress(progress: number, message?: string): void;
    hideProgress(): void;
    
    // === NOTIFICATIONS ===
    
    showSuccess(message: string, duration?: number): void;
    showError(message: string, error?: Error): void;
    showWarning(message: string): void;
    showInfo(message: string): void;
    
    // === LOADING STATES ===
    
    setLoading(component: string, isLoading: boolean): void;
    isLoading(component?: string): boolean;
    
    // === OVERLAY MANAGEMENT ===
    
    showOverlay(config: OverlayConfig): void;
    hideOverlay(): void;
}

interface OverlayConfig {
    message: string;
    spinner?: boolean;
    progress?: number;
    cancelable?: boolean;
    onCancel?: () => void;
}
```

---

## Managers API

### MapManager API

Управление интерактивными картами.

```javascript
interface MapManagerAPI {
    // === MAP INITIALIZATION ===
    
    initializeMap(containerId: string): Promise<void>;
    destroyMap(): void;
    
    // === MARKERS MANAGEMENT ===
    
    addMarker(config: MarkerConfig): Marker;
    removeMarker(markerId: string): void;
    updateMarker(markerId: string, updates: Partial<MarkerConfig>): void;
    clearMarkers(): void;
    
    // === LAYERS MANAGEMENT ===
    
    addLayer(layer: Layer): void;
    removeLayer(layerId: string): void;
    toggleLayer(layerId: string, visible: boolean): void;
    
    // === FILTERS ===
    
    setMapFilter(filterType: MapFilterType): void;
    getActiveFilter(): MapFilterType | null;
    
    // === SPATIAL QUERIES ===
    
    getMarkersInBounds(bounds: Bounds): Marker[];
    getMarkersInPolygon(polygon: Coordinate[]): Marker[];
    
    // === EVENTS ===
    
    on(event: MapEvent, handler: MapEventHandler): void;
    off(event: MapEvent, handler: MapEventHandler): void;
}

interface MarkerConfig {
    id: string;
    position: LatLng;
    icon?: IconConfig;
    popup?: PopupConfig;
    data?: any;
}

type MapFilterType = 'year' | 'series' | 'material' | 'floors' | 'class';
type MapEvent = 'click' | 'zoom' | 'move' | 'marker-click' | 'marker-hover';
```

### AddressManager API

Управление адресами и геокодированием.

```javascript
interface AddressManagerAPI {
    // === CRUD OPERATIONS ===
    
    createAddress(addressData: CreateAddressRequest): Promise<Address>;
    updateAddress(id: string, updates: UpdateAddressRequest): Promise<Address>;
    deleteAddress(id: string): Promise<void>;
    getAddress(id: string): Promise<Address | null>;
    
    // === BULK OPERATIONS ===
    
    loadAddresses(areaId?: string): Promise<Address[]>;
    importAddresses(addresses: ImportAddressData[]): Promise<ImportResult>;
    exportAddresses(format: ExportFormat): Promise<ExportData>;
    
    // === GEOCODING ===
    
    geocodeAddress(address: string): Promise<GeocodingResult>;
    reverseGeocode(lat: number, lng: number): Promise<string>;
    
    // === VALIDATION ===
    
    validateAddress(address: Partial<Address>): ValidationResult;
    normalizeAddress(address: string): string;
    
    // === SEARCH ===
    
    searchAddresses(query: AddressSearchQuery): Promise<Address[]>;
    findNearbyAddresses(lat: number, lng: number, radius: number): Promise<Address[]>;
}

interface CreateAddressRequest {
    address: string;
    coordinates?: LatLng;
    type: 'apartment' | 'house' | 'commercial';
    map_area_id: string;
    house_series_id?: string;
    house_class_id?: string;
    wall_material_id?: string;
    floors_count?: number;
    build_year?: number;
}

interface GeocodingResult {
    address: string;
    coordinates: LatLng;
    confidence: number;
    components: AddressComponents;
}
```

### SegmentsManager API

⚠️ **Примечание:** Этот API требует рефакторинга (см. [архитектурные проблемы](doc_ARCHITECTURE_ISSUES.md))

```javascript
interface SegmentsManagerAPI {
    // === SEGMENTS CRUD ===
    
    createSegment(segmentData: CreateSegmentRequest): Promise<Segment>;
    updateSegment(id: string, updates: UpdateSegmentRequest): Promise<Segment>;
    deleteSegment(id: string): Promise<void>;
    loadSegments(areaId?: string): Promise<Segment[]>;
    
    // === SEGMENT ANALYSIS ===
    
    calculateSegmentStatistics(segmentId: string): Promise<SegmentStatistics>;
    generateSegmentReport(segmentId: string, format: ReportFormat): Promise<Report>;
    
    // === UI MANAGEMENT ===
    
    showCreateModal(): void;
    showEditModal(segmentId: string): void;
    hideModal(): void;
    
    // === MAP INTEGRATION ===
    
    initializeSegmentMap(containerId: string): Promise<void>;
    updateSegmentMapView(segmentId: string): void;
    
    // === FILTERS ===
    
    applySegmentFilters(filters: SegmentFilters): Promise<void>;
    clearSegmentFilters(): void;
}

interface CreateSegmentRequest {
    name: string;
    map_area_id: string;
    filters: SegmentFilters;
    description?: string;
}

interface SegmentFilters {
    house_series_id?: string[];
    house_class_id?: string[];
    wall_material_id?: string[];
    floors_from?: number;
    floors_to?: number;
    build_year_from?: number;
    build_year_to?: number;
    property_type?: PropertyType[];
}
```

---

## Services API

### BaseAPIService API

Базовый класс для всех внешних API интеграций.

```javascript
interface BaseAPIServiceAPI {
    // === HTTP OPERATIONS ===
    
    get<T>(endpoint: string, params?: QueryParams): Promise<T>;
    post<T>(endpoint: string, data?: any): Promise<T>;
    put<T>(endpoint: string, data?: any): Promise<T>;
    delete<T>(endpoint: string): Promise<T>;
    
    // === CONFIGURATION ===
    
    setBaseURL(url: string): void;
    setHeaders(headers: Record<string, string>): void;
    setTimeout(timeout: number): void;
    
    // === INTERCEPTORS ===
    
    addRequestInterceptor(interceptor: RequestInterceptor): void;
    addResponseInterceptor(interceptor: ResponseInterceptor): void;
    
    // === RATE LIMITING ===
    
    setRateLimit(requestsPerMinute: number): void;
    getRemainingRequests(): number;
}

type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
type ResponseInterceptor = (response: APIResponse) => APIResponse | Promise<APIResponse>;
```

### InparsService API

Интеграция с Inpars.ru API.

```javascript
interface InparsServiceAPI extends BaseAPIServiceAPI {
    // === BUILDING INFO ===
    
    getBuildingInfo(address: string): Promise<BuildingInfo>;
    getBuildingsByIds(ids: string[]): Promise<BuildingInfo[]>;
    
    // === SUBSCRIPTION MANAGEMENT ===
    
    getSubscriptionStatus(): Promise<SubscriptionStatus>;
    updateSubscription(planId: string): Promise<SubscriptionResult>;
    
    // === PRICE HISTORY ===
    
    getPriceHistory(buildingId: string): Promise<PriceHistoryData>;
    
    // === BULK OPERATIONS ===
    
    enrichAddresses(addresses: Address[]): Promise<EnrichmentResult>;
}

interface BuildingInfo {
    id: string;
    address: string;
    coordinates: LatLng;
    buildYear: number;
    floors: number;
    material: string;
    series?: string;
    class?: string;
    problems?: string[];
    priceHistory?: PricePoint[];
}

interface SubscriptionStatus {
    isActive: boolean;
    plan: string;
    requestsRemaining: number;
    resetDate: Date;
}
```

---

## Data Layer API

### Database API

Работа с IndexedDB.

```javascript
interface DatabaseAPI {
    // === INITIALIZATION ===
    
    initialize(): Promise<void>;
    getVersion(): number;
    migrate(toVersion: number): Promise<void>;
    
    // === CRUD OPERATIONS ===
    
    get<T>(storeName: string, key: string): Promise<T | null>;
    getAll<T>(storeName: string): Promise<T[]>;
    add<T>(storeName: string, data: T): Promise<string>;
    put<T>(storeName: string, data: T): Promise<void>;
    delete(storeName: string, key: string): Promise<void>;
    
    // === BULK OPERATIONS ===
    
    bulkAdd<T>(storeName: string, items: T[]): Promise<void>;
    bulkUpdate<T>(storeName: string, items: T[]): Promise<void>;
    bulkDelete(storeName: string, keys: string[]): Promise<void>;
    
    // === QUERIES ===
    
    query<T>(storeName: string, query: QueryOptions): Promise<T[]>;
    count(storeName: string, query?: QueryOptions): Promise<number>;
    
    // === TRANSACTIONS ===
    
    transaction<T>(storeNames: string[], mode: 'readonly' | 'readwrite', 
                   callback: (tx: Transaction) => Promise<T>): Promise<T>;
}

interface QueryOptions {
    index?: string;
    range?: IDBKeyRange;
    direction?: 'next' | 'prev';
    limit?: number;
    offset?: number;
}
```

### Models API

Модели данных с валидацией.

```javascript
// Address Model
interface Address {
    id: string;
    address: string;
    coordinates: LatLng;
    type: 'apartment' | 'house' | 'commercial';
    map_area_id: string;
    house_series_id?: string;
    house_class_id?: string;
    wall_material_id?: string;
    ceiling_material_id?: string;
    floors_count?: number;
    build_year?: number;
    comment?: string;
    created_at: Date;
    updated_at: Date;
}

// Listing Model  
interface Listing {
    id: string;
    address_id: string;
    title: string;
    price: number;
    area: number;
    rooms?: number;
    floor?: number;
    total_floors?: number;
    source: 'avito' | 'cian';
    url: string;
    images?: string[];
    description?: string;
    parsed_at: Date;
    price_history?: PricePoint[];
}

// Segment Model
interface Segment {
    id: string;
    name: string;
    description?: string;
    map_area_id: string;
    filters: SegmentFilters;
    created_at: Date;
    updated_at: Date;
    statistics?: SegmentStatistics;
}

// Common Types
interface LatLng {
    lat: number;
    lng: number;
}

interface PricePoint {
    date: Date;
    price: number;
}
```

---

## Events API

### Стандартные события системы

```javascript
const CONSTANTS = {
    EVENTS: {
        // === DATA EVENTS ===
        ADDRESSES_LOADED: 'addresses-loaded',
        LISTINGS_IMPORTED: 'listings-imported', 
        SEGMENTS_LOADED: 'segments-loaded',
        AREA_UPDATED: 'area-updated',
        
        // === PROCESS EVENTS ===
        PARSING_STARTED: 'parsing-started',
        PARSING_COMPLETED: 'parsing-completed',
        GEOCODING_STARTED: 'geocoding-started',
        GEOCODING_COMPLETED: 'geocoding-completed',
        
        // === UI EVENTS ===
        MAP_INITIALIZED: 'map-initialized',
        MAP_FILTER_CHANGED: 'map-filter-changed',
        MODAL_OPENED: 'modal-opened',
        MODAL_CLOSED: 'modal-closed',
        
        // === ERROR EVENTS ===
        ERROR_OCCURRED: 'error-occurred',
        NETWORK_ERROR: 'network-error',
        VALIDATION_ERROR: 'validation-error'
    }
};
```

### Event Payloads

```javascript
// Data Events
interface AddressesLoadedEvent {
    addresses: Address[];
    areaId: string;
    timestamp: Date;
}

interface ListingsImportedEvent {
    listings: Listing[];
    source: 'avito' | 'cian';
    count: number;
    timestamp: Date;
}

// Process Events  
interface ParsingCompletedEvent {
    source: string;
    itemsProcessed: number;
    errors: string[];
    duration: number;
    timestamp: Date;
}

// UI Events
interface MapFilterChangedEvent {
    previousFilter: string | null;
    newFilter: string;
    timestamp: Date;
}

// Error Events
interface ErrorOccurredEvent {
    error: Error;
    context: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
}
```

---

## External APIs

### Inpars.ru API

```javascript
// Base URL: https://api.inpars.ru/
// Authentication: API Key in headers

interface InparsAPIEndpoints {
    // Building Information
    'GET /building/info': {
        params: { address: string };
        response: InparsBuildingInfo;
    };
    
    // Subscription Status  
    'GET /subscription/status': {
        response: InparsSubscriptionStatus;
    };
    
    // Price History
    'GET /building/price-history': {
        params: { building_id: string };
        response: InparsPriceHistory;
    };
}

interface InparsBuildingInfo {
    id: string;
    address: string;
    coordinates: [number, number];
    building_year: number;
    floors: number;
    material: string;
    series?: string;
    class_rating?: string;
    problems?: string[];
}
```

### Overpass API (OpenStreetMap)

```javascript
// Base URL: https://overpass-api.de/api/interpreter
// Format: Overpass QL

interface OverpassQuery {
    query: string;      // Overpass QL query
    format: 'json' | 'xml';
    timeout?: number;
}

// Example query for geocoding
const geocodingQuery = `
[out:json][timeout:25];
(
  way["addr:street"~"${streetName}"]["addr:housenumber"~"${houseNumber}"];
  relation["addr:street"~"${streetName}"]["addr:housenumber"~"${houseNumber}"];
);
out center;
`;
```

---

## Utils API

### GeometryUtils API

Геопространственные вычисления.

```javascript
interface GeometryUtilsAPI {
    // === POINT IN POLYGON ===
    
    isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean;
    getPointsInPolygon(points: LatLng[], polygon: LatLng[]): LatLng[];
    
    // === DISTANCE CALCULATIONS ===
    
    calculateDistance(point1: LatLng, point2: LatLng): number;
    calculateBearing(from: LatLng, to: LatLng): number;
    
    // === BOUNDS OPERATIONS ===
    
    getBounds(points: LatLng[]): Bounds;
    expandBounds(bounds: Bounds, factor: number): Bounds;
    
    // === SPATIAL INDEXING ===
    
    createSpatialIndex(items: SpatialItem[]): SpatialIndex;
    queryIndex(index: SpatialIndex, bounds: Bounds): SpatialItem[];
}

interface Bounds {
    north: number;
    south: number;
    east: number;
    west: number;
}
```

### DuplicateDetector API

Поиск и обработка дубликатов.

```javascript
interface DuplicateDetectorAPI {
    // === DETECTION ===
    
    findDuplicates(items: any[], config: DetectionConfig): DuplicateGroup[];
    findSimilar(item: any, candidates: any[], threshold: number): SimilarityResult[];
    
    // === MERGING ===
    
    mergeDuplicates(group: DuplicateGroup): any;
    suggestMergeStrategy(group: DuplicateGroup): MergeStrategy;
    
    // === CONFIGURATION ===
    
    setAlgorithm(algorithm: 'levenshtein' | 'cosine' | 'ml'): void;
    setThreshold(threshold: number): void;
}

interface DuplicateGroup {
    items: any[];
    confidence: number;
    reasons: string[];
    suggestedMaster: any;
}
```

---

## Error Handling

### Стандартные типы ошибок

```javascript
class NeocenkaError extends Error {
    constructor(message: string, code: string, context?: any) {
        super(message);
        this.name = 'NeocenkaError';
        this.code = code;
        this.context = context;
        this.timestamp = new Date();
    }
}

class ValidationError extends NeocenkaError {
    constructor(field: string, value: any, message: string) {
        super(`Validation failed for ${field}: ${message}`, 'VALIDATION_ERROR', {
            field,
            value
        });
    }
}

class NetworkError extends NeocenkaError {
    constructor(url: string, status: number, message: string) {
        super(`Network error: ${message}`, 'NETWORK_ERROR', {
            url,
            status
        });
    }
}

class DatabaseError extends NeocenkaError {
    constructor(operation: string, store: string, message: string) {
        super(`Database error in ${operation}: ${message}`, 'DATABASE_ERROR', {
            operation,
            store
        });
    }
}
```

---

## Заключение

Этот API reference покрывает все основные интерфейсы Neocenka Extension. При разработке новых функций следуйте этим паттернам для обеспечения консистентности.

**Ключевые принципы:**
- 🎯 Promise-based асинхронные операции
- 📡 Event-driven communication  
- 🔒 Валидация входных данных
- 📝 Типизированные интерфейсы
- ⚡ Оптимизация производительности

---

*API Reference v1.0 для Neocenka Extension v0.3.4*