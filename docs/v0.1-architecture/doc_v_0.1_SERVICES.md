# Сервисы Neocenka Extension v0.1

## Обзор сервисной архитектуры

В версии 0.1 внедрена полноценная сервисная архитектура, основанная на принципах **Service Layer Pattern** и **Dependency Injection**. Все сервисы организованы в иерархическую структуру с четким разделением ответственности.

## Структура сервисов

```
/services/
├── core/                    # Базовые системные сервисы
│   ├── ValidationService.js        # Централизованная валидация
│   ├── ConfigService.js            # Управление конфигурацией  
│   ├── ErrorHandlingService.js     # Обработка ошибок
│   ├── DIContainer.js              # Dependency Injection
│   └── GlobalErrorReporter.js      # Глобальный мониторинг
└── data/                    # Сервисы работы с данными
    ├── SegmentService.js           # Бизнес-логика сегментов
    └── ReferenceDataService.js     # Справочные данные
```

---

## Core Services (Базовые сервисы)

### ValidationService

**Файл:** `/services/core/ValidationService.js`  
**Назначение:** Централизованная валидация всех типов данных в приложении  
**Зависимости:** Нет (базовый сервис)

#### Основные методы:

```javascript
// Универсальный метод валидации
validate(type, data) {
    return {
        isValid: boolean,
        errors: string[],      // Критические ошибки
        warnings: string[]     // Предупреждения
    }
}

// Специализированные валидаторы
validateSegment(segmentData) { /* Валидация сегментов */ }
validateAddress(addressData) { /* Валидация адресов */ }
validateListing(listingData) { /* Валидация объявлений */ }
validateCoordinates(lat, lng) { /* Валидация координат */ }
validatePriceHistory(history) { /* Валидация истории цен */ }
```

#### Поддерживаемые типы валидации:

- **segments** - Сегменты с фильтрами
- **addresses** - Адреса недвижимости  
- **listings** - Объявления с сайтов
- **coordinates** - Географические координаты
- **price_history** - История изменения цен
- **real_estate_objects** - Объекты недвижимости

#### Пример использования:

```javascript
const validationService = container.get('ValidationService');

const segmentData = {
    name: 'Новостройки центра',
    map_area_id: 'area_123',
    filters: {
        house_series_id: ['series_modern'],
        build_year_from: 2020
    }
};

const result = validationService.validate('segments', segmentData);

if (!result.isValid) {
    console.error('Ошибки валидации:', result.errors);
}

if (result.warnings.length > 0) {
    console.warn('Предупреждения:', result.warnings);
}
```

#### Правила валидации:

**Сегменты:**
- Обязательные поля: `name`, `map_area_id`
- Уникальность имени в пределах области
- Корректность ID справочников в фильтрах
- Логическая совместимость фильтров (например, `build_year_from` <= `build_year_to`)

**Адреса:**
- Обязательные поля: `address`, `coordinates`
- Формат координат: `{lat: number, lng: number}`
- Диапазоны координат для России
- Валидация почтовых индексов

---

### ConfigService

**Файл:** `/services/core/ConfigService.js`  
**Назначение:** Реактивное управление конфигурацией приложения  
**Зависимости:** Нет (базовый сервис)

#### Основные методы:

```javascript
// Основные операции
get(path)                    // Получение значения по пути
set(path, value)             // Установка с уведомлениями
subscribe(path, callback)    // Подписка на изменения
unsubscribe(path, callback)  // Отписка от изменений

// Специализированные методы
getUIConfig(component)       // UI настройки компонента
getDatabaseConfig()          // Настройки базы данных  
getPerformanceConfig()       // Настройки производительности
getAPIConfig(service)        // Настройки внешних API

// Состояние и персистентность
setState(section, data)      // Установка секции конфигурации
getState(section)           // Получение секции
persist()                   // Сохранение в localStorage
restore()                   // Восстановление из localStorage
```

#### Структура конфигурации:

```javascript
{
    // UI настройки
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
    
    // База данных
    database: {
        version: 17,
        enableDebug: false,
        backupInterval: 3600000
    },
    
    // Производительность  
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
    
    // Внешние API
    api: {
        inpars: {
            endpoint: 'https://api.inpars.ru',
            timeout: 30000,
            rateLimit: 10
        }
    },
    
    // Отладка и мониторинг
    debug: {
        enabled: false,
        logLevel: 'warn',
        components: ['SegmentService', 'MapController']
    }
}
```

#### Пример использования:

```javascript
const configService = container.get('ConfigService');

// Получение настроек
const mapConfig = configService.getUIConfig('map');
const defaultZoom = configService.get('ui.map.defaultZoom');

// Установка настроек
configService.set('ui.theme', 'dark');

// Реактивные обновления
configService.subscribe('ui.theme', (newTheme, oldTheme) => {
    document.body.className = `theme-${newTheme}`;
});

// Настройки производительности
const cacheConfig = configService.getPerformanceConfig();
const maxMarkers = configService.get('performance.ui.maxVisibleMarkers');
```

---

### ErrorHandlingService

**Файл:** `/services/core/ErrorHandlingService.js`  
**Назначение:** Централизованная обработка ошибок с автоматическими повторами  
**Зависимости:** `ConfigService`

#### Основные методы:

```javascript
// Основной метод обработки ошибок
async handleError(error, context = {}) {
    // Возвращает обработанный результат или повторное выполнение
}

// Повторное выполнение с различными стратегиями
async retry(fn, options = {}) {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential',  // 'linear', 'exponential', 'fixed'
    retryCondition: (error) => boolean
}

// Классификация ошибок
classifyError(error) {
    return {
        type: 'network'|'database'|'validation'|'parsing'|'ui'|'permission',
        severity: 'low'|'medium'|'high'|'critical',
        recoverable: boolean,
        userMessage: string
    }
}

// Стратегии обработки
shouldRetry(error, context, attempt) { /* Логика повтора */ }
getRetryDelay(attempt, baseDelay, strategy) { /* Вычисление задержки */ }
createUserFriendlyMessage(error, context) { /* Сообщение пользователю */ }
```

#### Типы ошибок и стратегии:

**Network Errors (Сетевые ошибки):**
- Автоматический повтор с экспоненциальной задержкой
- Максимум 3 попытки
- Уведомление пользователя при провале

**Database Errors (Ошибки БД):**
- Проверка целостности данных
- Автоматическое восстановление из backup
- Логирование для анализа

**Validation Errors (Ошибки валидации):**
- Немедленное отображение пользователю
- Подсветка проблемных полей
- Без автоматических повторов

**Parsing Errors (Ошибки парсинга):**
- Повтор с альтернативными стратегиями
- Fallback к backup парсерам
- Подробное логирование

#### Пример использования:

```javascript
const errorHandler = container.get('ErrorHandlingService');

// Обработка с контекстом
try {
    const result = await someDatabaseOperation();
} catch (error) {
    await errorHandler.handleError(error, {
        operation: 'database',
        table: 'segments',
        userId: currentUser.id,
        component: 'SegmentService'
    });
}

// Повторное выполнение
const data = await errorHandler.retry(async () => {
    return await fetchExternalAPI();
}, {
    maxAttempts: 5,
    delay: 2000,
    backoff: 'exponential',
    retryCondition: (error) => error.code === 'NETWORK_ERROR'
});
```

---

### DIContainer (Dependency Injection)

**Файл:** `/services/core/DIContainer.js`  
**Назначение:** Управление зависимостями и жизненным циклом сервисов  
**Зависимости:** Нет (базовый сервис)

#### Основные методы:

```javascript
// Регистрация сервисов
registerFactory(name, factory, config = {}) {
    config: {
        singleton: boolean,     // Singleton или новый экземпляр
        dependencies: string[], // Массив зависимостей
        lazy: boolean          // Ленивая инициализация
    }
}

registerInstance(name, instance) { /* Готовый экземпляр */ }

// Получение сервисов
get(name) { /* Получение сервиса по имени */ }
has(name) { /* Проверка регистрации */ }

// Инициализация и управление
async initialize() { /* Инициализация всех сервисов */ }
rebuild(name) { /* Пересборка сервиса */ }
createChild() { /* Дочерний контейнер */ }

// Диагностика
getState() { /* Состояние контейнера */ }
getMetrics() { /* Метрики производительности */ }
validateDependencyGraph() { /* Проверка циклов */ }
```

#### Конфигурация сервисов:

```javascript
// Пример регистрации сервисов в ApplicationController
await this.setupDIContainer() {
    // Базовые сервисы
    this.container.registerFactory('ConfigService', () => {
        return new ConfigService();
    }, { singleton: true, dependencies: [] });

    this.container.registerFactory('ValidationService', () => {
        return new ValidationService();
    }, { singleton: true, dependencies: [] });

    this.container.registerFactory('ErrorHandlingService', (container) => {
        const configService = container.get('ConfigService');
        return new ErrorHandlingService(configService);
    }, { singleton: true, dependencies: ['ConfigService'] });

    // Сервисы данных
    this.container.registerFactory('SegmentService', (container) => {
        return new SegmentService(
            container.get('Database'),
            container.get('ValidationService'),
            container.get('ConfigService'),
            container.get('ErrorHandlingService')
        );
    }, { singleton: true, dependencies: ['Database', 'ValidationService', 'ConfigService', 'ErrorHandlingService'] });
}
```

#### Автоматическое разрешение зависимостей:

1. **Топологическая сортировка** - Сервисы инициализируются в правильном порядке
2. **Проверка циклов** - Обнаружение циклических зависимостей
3. **Lazy Loading** - Сервисы создаются при первом обращении
4. **Singleton Management** - Контроль единичных экземпляров

---

### GlobalErrorReporter

**Файл:** `/services/core/GlobalErrorReporter.js`  
**Назначение:** Глобальный мониторинг системы и отчетность об ошибках  
**Зависимости:** `ErrorHandlingService`, `ConfigService`

#### Основные методы:

```javascript
// Отчеты об ошибках
reportError(error, context = {}) { /* Регистрация ошибки */ }
reportWarning(message, context = {}) { /* Предупреждение */ }  
reportInfo(message, context = {}) { /* Информационное событие */ }

// Мониторинг системы
getSystemHealth() { 
    return {
        status: 'healthy'|'warning'|'critical',
        errorRate: number,
        memoryUsage: number,
        responseTime: number
    }
}

performHealthCheck() { /* Проверка здоровья системы */ }
getErrorStats() { /* Статистика ошибок */ }
getSessionStats() { /* Статистика сессии */ }

// Конфигурация мониторинга
setupPerformanceMonitoring() { /* Мониторинг производительности */ }
setupReportingScheduler() { /* Автоматическая отправка отчетов */ }
```

#### Конфигурация мониторинга:

```javascript
{
    enabled: true,
    logLevel: 'warn',
    maxLogEntries: 1000,
    
    // Отправка отчетов
    reporting: {
        enabled: false,
        endpoint: null,
        apiKey: null,
        batchSize: 10,
        flushInterval: 300000
    },
    
    // Health checks
    healthCheck: {
        enabled: true,
        interval: 60000,
        thresholds: {
            errorRate: 0.1,
            responseTime: 5000,
            memoryUsage: 0.8
        }
    },
    
    // Фильтрация ошибок
    filters: {
        ignoreErrors: ['ResizeObserver loop limit exceeded'],
        ignoreUrls: ['/favicon.ico'],
        ignoreUserAgents: ['bot', 'crawler']
    }
}
```

#### Глобальные обработчики:

```javascript
// Автоматическое перехватывание ошибок
window.addEventListener('error', (event) => {
    globalErrorReporter.handleGlobalError({
        type: 'javascript',
        message: event.message,
        source: event.filename,
        line: event.lineno,
        stack: event.error?.stack
    });
});

window.addEventListener('unhandledrejection', (event) => {
    globalErrorReporter.handleGlobalError({
        type: 'promise',
        message: event.reason?.message,
        error: event.reason
    });
});
```

---

## Data Services (Сервисы данных)

### SegmentService

**Файл:** `/services/data/SegmentService.js`  
**Назначение:** Бизнес-логика работы с сегментами недвижимости  
**Зависимости:** `Database`, `ValidationService`, `ConfigService`, `ErrorHandlingService`

#### Основные методы:

```javascript
// CRUD операции
async create(segmentData) {
    // 1. Валидация данных
    // 2. Сохранение в БД  
    // 3. Кэширование
    // 4. Уведомление об изменениях
    return createdSegment;
}

async update(segmentId, updates) { /* Обновление сегмента */ }
async delete(segmentId) { /* Удаление с проверкой связей */ }
async getById(segmentId) { /* Получение по ID */ }
async getByAreaId(areaId) { /* Сегменты области */ }

// Аналитика и статистика  
async getStatistics(segmentId) {
    return {
        addressCount: number,
        objectCount: number,
        listingCount: number,
        averagePrice: number,
        priceRange: { min: number, max: number },
        lastUpdated: Date
    }
}

// Экспорт и импорт
async export(segmentIds, format = 'json') { /* Экспорт данных */ }
async import(data, options = {}) { /* Импорт сегментов */ }

// Кэширование и оптимизация
invalidateCache(key) { /* Инвалидация кэша */ }
getCachedStatistics(segmentId) { /* Кэшированная статистика */ }
```

#### Структура данных сегмента:

```javascript
{
    id: 'segment_uuid',
    name: 'Название сегмента',
    description: 'Описание сегмента',
    map_area_id: 'area_uuid',
    
    // Фильтры
    filters: {
        // Серии домов
        house_series_id: ['series_modern', 'series_stalin'],
        
        // Классы домов  
        house_class_id: ['class_business', 'class_comfort'],
        
        // Материалы стен
        wall_material_id: ['material_brick', 'material_monolith'],
        
        // Диапазоны
        floors_from: 5,
        floors_to: 25,
        build_year_from: 2010,
        build_year_to: 2024,
        
        // Площади
        area_from: 40,
        area_to: 120,
        
        // Цены
        price_from: 3000000,
        price_to: 8000000
    },
    
    // Метаданные
    created_at: Date,
    updated_at: Date,
    created_by: 'user_id',
    
    // Статистика (кэшируется)
    cached_stats: {
        address_count: 45,
        object_count: 123,
        last_calculated: Date
    }
}
```

#### Кэширование и производительность:

```javascript
// Многоуровневое кэширование
class SegmentService {
    constructor() {
        this.cache = {
            segments: new Map(),        // Кэш сегментов
            statistics: new Map(),      // Кэш статистики
            queries: new Map()          // Кэш запросов
        };
        
        this.cacheConfig = {
            segmentTTL: 1800000,       // 30 минут
            statisticsTTL: 600000,     // 10 минут
            queryTTL: 300000           // 5 минут
        };
    }
    
    // Оптимизированный поиск сегментов
    async getByAreaId(areaId) {
        const cacheKey = `area_segments_${areaId}`;
        
        if (this.cache.queries.has(cacheKey)) {
            return this.cache.queries.get(cacheKey);
        }
        
        const segments = await this.database.getByIndex('segments', 'map_area_id', areaId);
        this.cache.queries.set(cacheKey, segments);
        
        return segments;
    }
}
```

---

### ReferenceDataService

**Файл:** `/services/data/ReferenceDataService.js`  
**Назначение:** Управление справочными данными (серии домов, классы, материалы)  
**Зависимости:** `Database`, `ConfigService`, `ErrorHandlingService`

#### Основные методы:

```javascript
// Получение справочных данных
async getAll(referenceType) { /* Все элементы справочника */ }
async getById(referenceType, id) { /* Элемент по ID */ }
async getByIds(referenceType, ids) { /* Несколько элементов */ }
async search(referenceType, query) { /* Поиск по названию/описанию */ }

// CRUD операции
async create(referenceType, data) { /* Создание элемента */ }
async update(referenceType, id, updates) { /* Обновление */ }
async delete(referenceType, id) { /* Удаление с проверкой использования */ }

// Инициализация и управление
async initializeDefaultData() { /* Создание данных по умолчанию */ }
async checkUsage(referenceType, id) { /* Проверка использования */ }
getUsageStatistics() { /* Статистика использования */ }
```

#### Поддерживаемые справочники:

**house_series (Серии домов):**
```javascript
{
    id: 'series_khrushchev',
    name: 'Хрущёвка',
    description: 'Панельные и кирпичные дома 1950-1980х годов',
    years_built: '1950-1980',
    typical_features: 'Низкие потолки (2.5м), малые площади квартир'
}
```

**house_classes (Классы домов):**
```javascript
{
    id: 'class_business',
    name: 'Бизнес',
    description: 'Бизнес-класс',
    rating: 4,
    characteristics: 'Высококачественная отделка, развитая инфраструктура'
}
```

**wall_materials (Материалы стен):**
```javascript
{
    id: 'material_brick',
    name: 'Кирпич',
    description: 'Кирпичные стены',
    thermal_properties: 'Хорошая теплоизоляция',
    durability: 'Высокая',
    advantages: 'Долговечность, экологичность'
}
```

#### Автоматическая инициализация:

```javascript
// При первом запуске создаются справочники по умолчанию
const defaultData = {
    house_series: [
        { id: 'series_khrushchev', name: 'Хрущёвка', /* ... */ },
        { id: 'series_stalin', name: 'Сталинка', /* ... */ },
        { id: 'series_brezhnevka', name: 'Брежневка', /* ... */ },
        { id: 'series_modern', name: 'Современная постройка', /* ... */ }
    ],
    // ... другие справочники
};

// Проверка использования при удалении
async checkUsage(referenceType, id) {
    const relations = {
        house_series: [
            { name: 'addresses', field: 'house_series_id' },
            { name: 'segments', field: 'filters.house_series_id' }
        ],
        // ... другие связи
    };
    
    for (const relation of relations[referenceType] || []) {
        const items = await this.database.getAll(relation.name);
        const hasUsage = items.some(item => /* проверка использования */);
        if (hasUsage) return true;
    }
    
    return false;
}
```

---

## Интеграция сервисов

### Пример полного цикла работы:

```javascript
// 1. Пользователь создает сегмент через UI
segmentModal.emit('segment:save', segmentData);

// 2. SegmentController обрабатывает событие  
async handleSegmentSave(eventData) {
    const { mode, data } = eventData;
    
    // 3. Валидация через ValidationService
    const validation = this.validationService.validate('segments', data);
    
    if (!validation.isValid) {
        // Показать ошибки пользователю
        return;
    }
    
    // 4. Сохранение через SegmentService
    const savedSegment = await this.segmentService.create(data);
    
    // 5. Обновление UI
    this.segmentTable.addSegment(savedSegment);
    this.segmentChart.updateChart('distribution', savedSegment);
}

// 6. SegmentService выполняет бизнес-логику
async create(segmentData) {
    // Валидация
    const validation = await this.validationService.validate('segments', segmentData);
    if (!validation.isValid) {
        throw new ValidationError(validation.errors);
    }
    
    // Сохранение
    const segment = await this.database.add('segments', {
        id: generateId(),
        ...segmentData,
        created_at: new Date(),
        updated_at: new Date()
    });
    
    // Кэширование
    this.cache.segments.set(segment.id, segment);
    
    // Уведомления
    this.emit('segment:created', { segment });
    
    return segment;
}
```

### Обработка ошибок в сервисах:

```javascript
// Любая ошибка в сервисе проходит через ErrorHandlingService
try {
    const result = await this.database.add('segments', data);
    return result;
} catch (error) {
    // Автоматическая обработка с повторами и логированием
    return await this.errorHandler.handleError(error, {
        service: 'SegmentService',
        method: 'create',
        data: data
    });
}
```

---

**Все сервисы работают как единая экосистема, обеспечивая:**
- ✅ **Централизованную валидацию** данных
- ✅ **Реактивную конфигурацию** с live-обновлениями  
- ✅ **Надежную обработку ошибок** с автоповторами
- ✅ **Управление зависимостями** через DI
- ✅ **Глобальный мониторинг** здоровья системы
- ✅ **Эффективное кэширование** для производительности
- ✅ **Слабую связанность** компонентов