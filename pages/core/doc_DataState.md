# DataState.js - Документация

> **Файл:** `pages/core/DataState.js`  
> **Размер:** ~300 строк  
> **Назначение:** Централизованное управление состоянием приложения  
> **Паттерн:** Observer + State Manager

## Обзор

DataState является основой архитектуры приложения, реализующей централизованное управление состоянием по принципу single source of truth. Класс предоставляет реактивную систему для синхронизации данных между компонентами.

## Ключевые возможности

- 🏪 **Централизованное хранение** - единое место для всего состояния приложения
- 📡 **Реактивные обновления** - автоматические уведомления об изменениях
- 💾 **Кэширование** - оптимизация производительности через кэш
- 🔒 **Type Safety** - базовая проверка типов данных  
- 🎯 **Подписки** - Observer pattern для слабой связанности

## Архитектура

### Структура состояния
```javascript
class DataState {
    constructor() {
        // === ОСНОВНЫЕ ДАННЫЕ ===
        this.currentAreaId = null;          // ID текущей области
        this.currentArea = null;            // Объект текущей области
        this.addresses = [];                // Массив адресов
        this.listings = [];                 // Массив объявлений
        this.segments = [];                 // Массив сегментов  
        this.realEstateObjects = [];       // Массив объектов недвижимости
        
        // === СОСТОЯНИЕ ПРОЦЕССОВ ===
        this.processing = {
            parsing: false,                 // Идет ли парсинг
            updating: false,               // Идет ли обновление  
            addresses: false,              // Загружаются ли адреса
            duplicates: false              // Обрабатываются ли дубликаты
        };
        
        // === UI СОСТОЯНИЕ ===
        this.selectedDuplicates = new Set(); // Выбранные дубликаты
        this.selectedElements = new Set();   // Выбранные элементы
        this.activeMapFilter = null;         // Активный фильтр карты
        
        // === РЕАКТИВНАЯ СИСТЕМА ===
        this.subscribers = {};               // Подписчики на изменения
        this.cache = {};                    // Кэш вычислений
        this.flags = {};                    // Флаги состояния
    }
}
```

## Основные методы

### Управление состоянием

#### `setState(property, value)`
Устанавливает значение свойства и уведомляет подписчиков.

```javascript
// Установка данных
dataState.setState('addresses', addressesArray);
dataState.setState('currentArea', areaObject);

// Автоматическое уведомление подписчиков
// Очистка кэша для data properties
```

#### `getState(property)`
Получает значение свойства состояния.

```javascript
const addresses = dataState.getState('addresses');
const currentArea = dataState.getState('currentArea');
const processingState = dataState.getState('processing');
```

### Система подписок (Observer Pattern)

#### `subscribe(property, callback)`
Подписывается на изменения конкретного свойства.

```javascript
// Подписка на изменения адресов
dataState.subscribe('addresses', (newAddresses, oldAddresses) => {
    updateMapMarkers(newAddresses);
    updateAddressTable(newAddresses);
});

// Подписка на изменения области
dataState.subscribe('currentArea', (newArea) => {
    if (newArea) {
        loadAreaData(newArea.id);
    }
});
```

#### `unsubscribe(property, callback)`
Отменяет подписку на изменения.

```javascript
const handler = (addresses) => updateUI(addresses);

// Подписка
dataState.subscribe('addresses', handler);

// Отписка (важно для предотвращения memory leaks)
dataState.unsubscribe('addresses', handler);
```

### Утилитарные методы

#### `getAllStates()`
Возвращает snapshot всего состояния для отладки.

```javascript
const currentState = dataState.getAllStates();
// {
//   currentAreaId: "area_123",
//   addresses: [...],
//   processing: { parsing: false, ... },
//   flags: { mapInitialized: true, ... }
// }
```

#### `clearCache()`
Очищает кэш вычислений.

```javascript
// Ручная очистка кэша
dataState.clearCache();

// Автоматическая очистка при изменении data properties
```

## Интеграции

### EventBus интеграция
DataState работает совместно с EventBus для координации обновлений:

```javascript
// В менеджерах
class AddressManager {
    async loadAddresses() {
        const addresses = await this.fetchAddresses();
        
        // Обновляем состояние (триггерит подписчиков)
        this.dataState.setState('addresses', addresses);
        
        // Опционально: генерируем событие
        this.eventBus.emit('addresses-loaded', addresses);
    }
}

// В UI компонентах
class MapManager {
    constructor(dataState) {
        // Подписываемся на изменения
        dataState.subscribe('addresses', this.updateMapMarkers.bind(this));
    }
}
```

### Кэширование
DataState автоматически управляет кэшем для оптимизации:

```javascript
// Данные кэшируются автоматически при вычислениях
const expensiveCalculation = dataState.getOrCache('statistics', () => {
    return calculateComplexStatistics(addresses);
});

// Кэш автоматически очищается при изменении данных
dataState.setState('addresses', newAddresses); // cache очищен
```

## Паттерны использования

### 1. Компонент с подпиской
```javascript
class UIComponent {
    constructor(dataState) {
        this.dataState = dataState;
        this.boundHandlers = new Map();
        this.setupSubscriptions();
    }
    
    setupSubscriptions() {
        // Создаем bound функции для возможности отписки
        const addressHandler = this.onAddressesChanged.bind(this);
        this.boundHandlers.set('addresses', addressHandler);
        
        this.dataState.subscribe('addresses', addressHandler);
    }
    
    onAddressesChanged(addresses) {
        this.renderAddresses(addresses);
    }
    
    destroy() {
        // Важно: отписываемся при уничтожении компонента
        this.boundHandlers.forEach((handler, property) => {
            this.dataState.unsubscribe(property, handler);
        });
    }
}
```

### 2. Реактивные обновления
```javascript
// Автоматическая синхронизация UI
class Dashboard {
    constructor(dataState) {
        // При изменении любых данных обновляем дашборд
        ['addresses', 'listings', 'segments'].forEach(property => {
            dataState.subscribe(property, () => this.updateDashboard());
        });
    }
    
    updateDashboard() {
        const addresses = this.dataState.getState('addresses');
        const listings = this.dataState.getState('listings');
        
        this.renderStatistics({ addresses, listings });
    }
}
```

### 3. Состояние процессов
```javascript
// Управление индикаторами загрузки
class LoadingManager {
    constructor(dataState) {
        dataState.subscribe('processing', this.updateLoadingUI.bind(this));
    }
    
    updateLoadingUI(processing) {
        if (processing.addresses) {
            this.showSpinner('Загрузка адресов...');
        } else if (processing.parsing) {
            this.showSpinner('Парсинг данных...');
        } else {
            this.hideSpinner();
        }
    }
}
```

## Проблемы текущей реализации

### 1. Отсутствие типизации
```javascript
// ❌ ПРОБЛЕМА: Нет проверки типов
dataState.setState('addresses', "invalid data"); // Не валидируется

// ✅ РЕШЕНИЕ: Добавить валидацию
setState(property, value) {
    this.validateValue(property, value);
    // ...
}
```

### 2. Прямая мутация объектов
```javascript
// ❌ ПРОБЛЕМА: Прямая мутация
const addresses = dataState.getState('addresses');
addresses.push(newAddress); // Мутация без уведомления

// ✅ РЕШЕНИЕ: Иммутабельные обновления
const addresses = [...dataState.getState('addresses'), newAddress];
dataState.setState('addresses', addresses);
```

### 3. Отсутствие namespace для свойств
```javascript
// ❌ ПРОБЛЕМА: Все свойства в одном пространстве имен
dataState.setState('isLoading', true);       // UI state
dataState.setState('addresses', addresses);  // Business data

// ✅ РЕШЕНИЕ: Namespace структура
dataState.setState('ui.isLoading', true);
dataState.setState('data.addresses', addresses);
```

## Рекомендации по улучшению

### 1. Добавление типизации
```typescript
interface AppState {
    data: {
        currentArea: Area | null;
        addresses: Address[];
        listings: Listing[];
        segments: Segment[];
    };
    ui: {
        selectedItems: Set<string>;
        activeFilter: string | null;
    };
    processing: {
        parsing: boolean;
        updating: boolean;
    };
}

class TypedDataState {
    private state: AppState;
    
    setState<K extends keyof AppState>(key: K, value: AppState[K]): void {
        // Type-safe updates
    }
    
    getState<K extends keyof AppState>(key: K): AppState[K] {
        // Type-safe access
    }
}
```

### 2. Иммутабельные обновления
```javascript
class ImmutableDataState {
    setState(property, updater) {
        const newValue = typeof updater === 'function' 
            ? updater(this.getState(property))
            : updater;
            
        // Создаем новое состояние вместо мутации
        this[property] = this.deepClone(newValue);
        this.notifySubscribers(property, newValue);
    }
    
    // Helper for array updates
    updateArray(property, updater) {
        this.setState(property, currentArray => updater([...currentArray]));
    }
}
```

### 3. Computed values
```javascript
class ComputedDataState extends DataState {
    constructor() {
        super();
        this.computed = {};
        this.computedDependencies = {};
    }
    
    defineComputed(name, dependencies, computeFn) {
        this.computedDependencies[name] = dependencies;
        
        // Подписываемся на изменения зависимостей
        dependencies.forEach(dep => {
            this.subscribe(dep, () => {
                delete this.computed[name]; // Invalidate cache
            });
        });
        
        Object.defineProperty(this, name, {
            get: () => {
                if (!(name in this.computed)) {
                    this.computed[name] = computeFn();
                }
                return this.computed[name];
            }
        });
    }
}

// Использование
dataState.defineComputed('addressesInCurrentArea', ['addresses', 'currentArea'], () => {
    const addresses = dataState.getState('addresses');
    const area = dataState.getState('currentArea');
    return addresses.filter(addr => addr.map_area_id === area?.id);
});
```

## Тестирование

### Unit тесты
```javascript
describe('DataState', () => {
    let dataState;
    
    beforeEach(() => {
        dataState = new DataState();
    });
    
    describe('setState/getState', () => {
        it('should store and retrieve values', () => {
            const testValue = [1, 2, 3];
            dataState.setState('test', testValue);
            expect(dataState.getState('test')).toEqual(testValue);
        });
    });
    
    describe('subscriptions', () => {
        it('should notify subscribers on changes', () => {
            const mockCallback = jest.fn();
            dataState.subscribe('test', mockCallback);
            
            dataState.setState('test', 'new value');
            
            expect(mockCallback).toHaveBeenCalledWith('new value', undefined);
        });
        
        it('should allow unsubscribing', () => {
            const mockCallback = jest.fn();
            dataState.subscribe('test', mockCallback);
            dataState.unsubscribe('test', mockCallback);
            
            dataState.setState('test', 'new value');
            
            expect(mockCallback).not.toHaveBeenCalled();
        });
    });
});
```

## API Reference

### Core Methods

#### `setState(property: string, value: any): void`
Устанавливает значение свойства и уведомляет подписчиков.

**Параметры:**
- `property` - имя свойства состояния
- `value` - новое значение

**Побочные эффекты:**
- Очищает кэш для data properties
- Вызывает подписчиков

#### `getState(property: string): any`  
Получает текущее значение свойства.

#### `subscribe(property: string, callback: Function): void`
Подписывается на изменения свойства.

**Callback signature:** `(newValue, oldValue) => void`

#### `unsubscribe(property: string, callback: Function): void`
Отменяет подписку на изменения.

### Utility Methods

#### `getAllStates(): object`
Возвращает копию всего текущего состояния.

#### `clearCache(): void`
Очищает кэш вычислений.

#### `isDataProperty(property: string): boolean`
Проверяет, является ли свойство данными (требует очистки кэша).

## Связанные файлы

- [`EventBus.js`](doc_EventBus.md) - система событий
- [`ProgressManager.js`](doc_ProgressManager.md) - управление состоянием загрузки
- [`../managers/MapManager.js`](../managers/doc_MapManager.md) - потребитель состояния
- [`../shared/constants.js`](../shared/doc_constants.md) - константы

## Заключение

DataState является фундаментом архитектуры приложения, обеспечивающим централизованное и реактивное управление состоянием. При правильном использовании значительно упрощает координацию между компонентами.

**Рекомендации:**
- ✅ Используйте для всех данных приложения
- ✅ Всегда отписывайтесь от подписок при уничтожении компонентов
- ❌ Не мутируйте полученные объекты напрямую
- ❌ Не злоупотребляйте подписками (используйте batch updates)

---

*DataState реализует упрощенную версию Redux/MobX паттернов управления состоянием.*