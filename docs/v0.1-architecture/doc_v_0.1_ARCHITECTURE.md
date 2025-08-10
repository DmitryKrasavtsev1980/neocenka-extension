# Архитектура Neocenka Extension v0.1

## Обзор архитектурных изменений

Версия 0.1 представляет собой фундаментальную переработку архитектуры с переходом от монолитной структуры к модульной, основанной на принципах SOLID и современных паттернах проектирования.

### Основные архитектурные принципы

1. **Single Responsibility Principle** - Каждый компонент имеет одну четко определенную ответственность
2. **Dependency Injection** - Слабая связанность через инверсию зависимостей  
3. **Event-Driven Architecture** - Асинхронная коммуникация через события
4. **Service Layer Pattern** - Разделение бизнес-логики от презентационного слоя
5. **Observer Pattern** - Реактивные обновления состояния

## Архитектурные слои

### 1. Application Layer (Прикладной слой)
```
ApplicationController
    ├── Управление жизненным циклом приложения
    ├── Маршрутизация и навигация
    ├── Глобальные обработчики событий
    └── Координация контроллеров
```

**Файл:** `/controllers/ApplicationController.js`
**Ответственность:**
- Инициализация всего приложения
- Управление DI контейнером
- Роутинг между страницами
- Глобальные клавиатурные сокращения
- Обработка критических ошибок

### 2. Controller Layer (Слой контроллеров)
```
SegmentController              MapController
    ├── Coordination                ├── Map rendering
    ├── UI Events                   ├── Marker management  
    ├── Business Logic              ├── User interactions
    └── Data Flow                   └── Geographic operations
```

#### SegmentController
**Файл:** `/controllers/SegmentController.js`
**Зависимости:**
- SegmentService (данные)
- ReferenceDataService (справочники)
- ValidationService (валидация)
- UI Components (модал, таблица, графики)

**Ключевые методы:**
- `showCreateModal()` - Создание нового сегмента
- `editSegment(id)` - Редактирование существующего
- `handleSegmentSave(data)` - Сохранение с валидацией
- `selectSegment(id)` - Выбор и выделение на карте

#### MapController  
**Файл:** `/controllers/MapController.js`
**Зависимости:**
- MapRenderer (отрисовка)
- MarkerManager (маркеры)
- DataState (состояние данных)

**Ключевые методы:**
- `createMap(container)` - Создание карты
- `updateAddressMarkers(addresses)` - Обновление маркеров
- `fitToVisibleData()` - Автоподгонка масштаба
- `toggleDrawingMode()` - Режим рисования

### 3. Service Layer (Сервисный слой)

#### Core Services (Базовые сервисы)

##### ValidationService
**Файл:** `/services/core/ValidationService.js`
**Назначение:** Централизованная валидация всех типов данных

```javascript
class ValidationService {
    validate(type, data) {
        // Возвращает: { isValid: boolean, errors: string[], warnings: string[] }
    }
    
    validateSegment(segmentData) { /* ... */ }
    validateAddress(addressData) { /* ... */ }
    validateListing(listingData) { /* ... */ }
    validateCoordinates(lat, lng) { /* ... */ }
}
```

##### ConfigService  
**Файл:** `/services/core/ConfigService.js`
**Назначение:** Реактивное управление конфигурацией

```javascript
class ConfigService {
    get(path) { /* Получение значения по пути */ }
    set(path, value) { /* Установка с уведомлениями */ }
    subscribe(path, callback) { /* Подписка на изменения */ }
    
    // Специализированные методы
    getUIConfig(component) { /* UI настройки */ }
    getDatabaseConfig() { /* Настройки БД */ }
    getPerformanceConfig() { /* Настройки производительности */ }
}
```

##### ErrorHandlingService
**Файл:** `/services/core/ErrorHandlingService.js` 
**Назначение:** Обработка ошибок с автоматическими повторами

```javascript
class ErrorHandlingService {
    async handleError(error, context) {
        // Классификация ошибки
        // Стратегия обработки
        // Логирование и уведомления
        // Автоматические повторы при необходимости
    }
    
    async retry(fn, options) { /* Повторное выполнение */ }
    classifyError(error) { /* Тип ошибки */ }
    shouldRetry(error, context) { /* Логика повтора */ }
}
```

##### DIContainer (Dependency Injection)
**Файл:** `/services/core/DIContainer.js`
**Назначение:** Управление зависимостями и жизненным циклом сервисов

```javascript
class DIContainer {
    registerFactory(name, factory, config) { /* Регистрация */ }
    get(name) { /* Получение сервиса */ }
    initialize() { /* Инициализация всех сервисов */ }
    
    // Продвинутые функции
    createChild() { /* Дочерний контейнер */ }
    rebuild(name) { /* Пересборка сервиса */ }
    validateDependencyGraph() { /* Проверка циклов */ }
}
```

##### GlobalErrorReporter
**Файл:** `/services/core/GlobalErrorReporter.js`
**Назначение:** Глобальный мониторинг системы и отчетность

```javascript
class GlobalErrorReporter {
    reportError(error, context) { /* Отчет об ошибке */ }
    getSystemHealth() { /* Состояние системы */ }
    getErrorStats() { /* Статистика ошибок */ }
    
    // Мониторинг
    performHealthCheck() { /* Health check */ }
    collectPerformanceMetrics() { /* Метрики производительности */ }
    setupReportingScheduler() { /* Автоотчеты */ }
}
```

#### Data Services (Сервисы данных)

##### SegmentService  
**Файл:** `/services/data/SegmentService.js`
**Назначение:** Бизнес-логика работы с сегментами

```javascript
class SegmentService {
    async create(segmentData) {
        // Валидация через ValidationService
        // Сохранение в БД
        // Кэширование
        // Уведомление об изменениях
    }
    
    async getByAreaId(areaId) { /* Сегменты области */ }
    async getStatistics(segmentId) { /* Статистика сегмента */ }
    async export(segmentIds, format) { /* Экспорт данных */ }
    
    // Кэширование и оптимизация
    invalidateCache(key) { /* Инвалидация кэша */ }
    updateCacheEntry(key, data) { /* Обновление кэша */ }
}
```

##### ReferenceDataService
**Файл:** `/services/data/ReferenceDataService.js` 
**Назначение:** Управление справочными данными

```javascript
class ReferenceDataService {
    async getAll(referenceType) { /* Все элементы справочника */ }
    async getById(referenceType, id) { /* Элемент по ID */ }
    async search(referenceType, query) { /* Поиск в справочнике */ }
    
    // CRUD операции
    async create(referenceType, data) { /* Создание */ }
    async update(referenceType, id, updates) { /* Обновление */ }
    async delete(referenceType, id) { /* Удаление с проверкой использования */ }
    
    // Инициализация данных по умолчанию
    async initializeDefaultData() { /* Справочники по умолчанию */ }
    checkUsage(referenceType, id) { /* Проверка использования */ }
}
```

### 4. Component Layer (Слой компонентов)

#### UI Components

##### SegmentModal
**Файл:** `/components/ui/SegmentModal.js`
**Назначение:** Модальные окна для работы с сегментами

```javascript
class SegmentModal {
    showCreateModal(areaId) { /* Создание нового сегмента */ }
    showEditModal(segment) { /* Редактирование существующего */ }
    updateSelectOptions(type, options) { /* Обновление селектов */ }
    
    // Валидация форм
    validateForm() { /* Клиентская валидация */ }
    displayValidationErrors(errors) { /* Отображение ошибок */ }
    
    // События
    addEventListener('segment:save', handler) { /* Событие сохранения */ }
    addEventListener('segment:delete', handler) { /* Событие удаления */ }
}
```

##### SegmentTable
**Файл:** `/components/ui/SegmentTable.js`
**Назначение:** Таблицы для отображения сегментов

```javascript
class SegmentTable {
    updateData(segments) { /* Обновление данных */ }
    addSegment(segment) { /* Добавление строки */ }
    updateSegment(id, segment) { /* Обновление строки */ }
    removeSegment(id) { /* Удаление строки */ }
    
    // Фильтрация и сортировка
    applyFilter(filterFn) { /* Применение фильтра */ }
    clearFilter() { /* Очистка фильтров */ }
    sortBy(column, direction) { /* Сортировка */ }
    
    // DataTables интеграция
    initializeDataTable() { /* Инициализация DataTables */ }
    refreshDataTable() { /* Обновление таблицы */ }
}
```

##### SegmentChart
**Файл:** `/components/ui/SegmentChart.js`
**Назначение:** Графики и аналитика для сегментов

```javascript
class SegmentChart {
    createAreaDistributionChart(data) { /* Диаграмма распределения площадей */ }
    createPriceDistributionChart(data) { /* Распределение цен */ }
    createBuildYearDistributionChart(data) { /* По годам постройки */ }
    
    // Управление графиками
    updateChart(chartId, newData) { /* Обновление данных */ }
    destroyChart(chartId) { /* Уничтожение графика */ }
    
    // ApexCharts интеграция
    getDefaultChartOptions() { /* Настройки по умолчанию */ }
    applyTheme(theme) { /* Применение темы */ }
}
```

#### Map Components

##### MapRenderer
**Файл:** `/components/map/MapRenderer.js`
**Назначение:** Отрисовка карты Leaflet

```javascript
class MapRenderer {
    async createMap(container, options) { /* Создание карты */ }
    addLayer(layerId, layer, options) { /* Добавление слоя */ }
    removeLayer(layerId) { /* Удаление слоя */ }
    toggleLayer(layerId, visible) { /* Переключение видимости */ }
    
    // Навигация
    setView(center, zoom, options) { /* Установка позиции */ }
    fitBounds(bounds, options) { /* Подгонка под границы */ }
    
    // Контролы
    addControl(controlId, options) { /* Добавление контрола */ }
    createControl(options) { /* Создание кастомного контрола */ }
    
    // Утилиты
    latLngToContainerPoint(latlng) { /* Конвертация координат */ }
    takeScreenshot(options) { /* Скриншот карты */ }
}
```

##### MarkerManager  
**Файл:** `/components/map/MarkerManager.js`
**Назначение:** Управление маркерами на карте

```javascript
class MarkerManager {
    createMarker(markerId, options) { /* Создание маркера */ }
    showMarker(markerId, layerId) { /* Отображение на карте */ }
    hideMarker(markerId) { /* Скрытие маркера */ }
    removeMarker(markerId) { /* Удаление маркера */ }
    
    // Группировка
    showGroup(groupName, layerId) { /* Показать группу */ }
    hideGroup(groupName) { /* Скрыть группу */ }
    
    // Кластеризация
    toggleClustering(enabled) { /* Включение/выключение кластеров */ }
    
    // Массовые операции
    createMarkersFromData(items, mapperFn) { /* Создание из данных */ }
    filterMarkers(filterFn) { /* Фильтрация маркеров */ }
    fitBounds(options) { /* Подгонка под маркеры */ }
}
```

### 5. Data Layer (Слой данных)

#### Core Systems (Основные системы)

##### DataState
**Файл:** `/pages/core/DataState.js`
**Назначение:** Централизованное управление состоянием

```javascript
class DataState {
    setState(key, value) { /* Установка состояния */ }
    getState(key) { /* Получение состояния */ }
    subscribe(key, callback) { /* Подписка на изменения */ }
    unsubscribe(key, callback) { /* Отписка */ }
    
    // Реактивность
    notifySubscribers(key, newValue, oldValue) { /* Уведомления */ }
    
    // Персистентность  
    persist(key) { /* Сохранение в localStorage */ }
    restore(key) { /* Восстановление из localStorage */ }
}
```

##### EventBus
**Файл:** `/pages/core/EventBus.js`
**Назначение:** Система межкомпонентных событий

```javascript
class EventBus {
    on(eventType, handler) { /* Подписка на событие */ }
    off(eventType, handler) { /* Отписка */ }
    emit(eventType, data) { /* Генерация события */ }
    once(eventType, handler) { /* Однократная подписка */ }
    
    // Продвинутые функции
    pipe(fromEvent, toEvent) { /* Пересылка события */ }
    filter(eventType, filterFn) { /* Фильтрация событий */ }
    debounce(eventType, delay) { /* Debouncing */ }
}
```

## Паттерны взаимодействия

### 1. Dependency Injection Flow
```
ApplicationController
    ↓ создает и инициализирует
DIContainer
    ↓ регистрирует фабрики
Services (ValidationService, ConfigService, etc.)
    ↓ внедряются в
Controllers (SegmentController, MapController)
    ↓ используют
Components (SegmentModal, SegmentTable, etc.)
```

### 2. Event Flow
```
UI Component (SegmentModal)
    ↓ emit: 'segment:save'
Controller (SegmentController)  
    ↓ обрабатывает событие
Service (SegmentService)
    ↓ выполняет бизнес-логику
    ↓ emit: 'segment:created'
DataState
    ↓ обновляет состояние
    ↓ notify subscribers
UI Components (SegmentTable, SegmentChart)
    ↓ реагируют на изменения
```

### 3. Error Handling Flow
```
Component/Service
    ↓ выбрасывает ошибку
ErrorHandlingService
    ↓ классифицирует и обрабатывает
    ↓ определяет стратегию
GlobalErrorReporter
    ↓ логирует и мониторит
    ↓ отправляет отчеты (опционально)
UI
    ↓ показывает пользователю уведомление
```

## Жизненный цикл приложения

### 1. Инициализация
```javascript
// 1. ApplicationController создается автоматически
const applicationController = new ApplicationController();

// 2. Инициализация компонентов
await applicationController.initialize() {
    // 2.1. Настройка DI контейнера
    await this.setupDIContainer();
    
    // 2.2. Регистрация сервисов
    await this.registerServices();
    
    // 2.3. Инициализация сервисов  
    await this.initializeServices();
    
    // 2.4. Настройка контроллеров
    await this.setupControllers();
    
    // 2.5. Настройка роутинга
    this.setupRouting();
    
    // 2.6. Загрузка начальных данных
    await this.loadInitialData();
}
```

### 2. Выполнение операций
```javascript
// Пользователь создает сегмент:
// UI → Controller → Service → Database → UI обновление

// 1. UI событие
segmentModal.emit('segment:save', segmentData);

// 2. Controller обработка
segmentController.handleSegmentSave(segmentData);

// 3. Service выполнение
const segment = await segmentService.create(segmentData);

// 4. Уведомление об изменениях
segmentService.emit('segment:created', { segment });

// 5. UI обновление
segmentTable.addSegment(segment);
```

### 3. Завершение работы
```javascript
// Graceful shutdown
await applicationController.shutdown() {
    // 3.1. Сохранение состояния
    await this.saveApplicationState();
    
    // 3.2. Уничтожение контроллеров
    this.controllers.forEach(controller => controller.destroy());
    
    // 3.3. Уничтожение сервисов
    this.container.destroy();
    
    // 3.4. Очистка обработчиков
    this.eventHandlers.clear();
}
```

## Конфигурация архитектуры

### Service Registration
```javascript
// В ApplicationController.registerServices()
this.container.registerFactory('SegmentService', (container) => {
    return new SegmentService(
        container.get('Database'),
        container.get('ValidationService'), 
        container.get('ConfigService'),
        container.get('ErrorHandlingService')
    );
}, { 
    singleton: true, 
    dependencies: ['Database', 'ValidationService', 'ConfigService', 'ErrorHandlingService'] 
});
```

### Event Binding
```javascript
// В SegmentController.setupComponentBindings()
this.segmentModal.addEventListener('segment:save', async (data) => {
    await this.handleSegmentSave(data);
});

this.segmentService.addEventListener('segment:created', (data) => {
    this.onSegmentCreated(data.segment);
});
```

## Производительность и оптимизация

### Кэширование
- **Service Level Caching** - Кэш на уровне сервисов данных
- **Component State Caching** - Кэширование состояния UI компонентов  
- **Query Result Caching** - Кэширование результатов запросов к БД

### Lazy Loading
- **Component Lazy Loading** - Компоненты загружаются по требованию
- **Service Lazy Initialization** - Сервисы инициализируются при первом использовании
- **Data Lazy Loading** - Данные загружаются порциями

### Event Optimization
- **Event Debouncing** - Группировка частых событий
- **Event Batching** - Пакетная обработка событий
- **Memory Leak Prevention** - Автоматическая отписка от событий

## Расширяемость архитектуры

### Добавление новых сервисов
1. Создать класс сервиса в соответствующей директории
2. Зарегистрировать фабрику в DIContainer  
3. Объявить зависимости
4. Использовать через DI в контроллерах/компонентах

### Добавление новых компонентов
1. Создать класс компонента с событийным интерфейсом
2. Зарегистрировать в DIContainer при необходимости
3. Подключить к соответствующему контроллеру
4. Настроить обработку событий

### Добавление новых контроллеров
1. Создать контроллер с зависимостями через DI
2. Зарегистрировать в ApplicationController
3. Настроить маршрутизацию при необходимости
4. Добавить инициализацию в жизненный цикл

---

**Эта архитектура обеспечивает:**
- ✅ Модульность и тестируемость
- ✅ Слабую связанность компонентов  
- ✅ Легкую расширяемость
- ✅ Централизованное управление ошибками
- ✅ Реактивность и производительность
- ✅ Соответствие современным стандартам разработки