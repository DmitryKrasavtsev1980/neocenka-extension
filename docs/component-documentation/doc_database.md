# Database.js - Документация

> **Файл:** `data/database.js`  
> **Размер:** ~3000+ строк  
> **Назначение:** Обертка над IndexedDB для управления данными приложения  
> **Версия:** 25 (текущая версия БД)  
> **Паттерн:** Database Wrapper + Repository

## Обзор

NeocenkaDB является центральным компонентом для работы с данными, предоставляя высокоуровневый API для работы с IndexedDB. Класс управляет схемой базы данных, миграциями, CRUD операциями и обеспечивает целостность данных.

## Ключевые возможности

- 📊 **Schema Management** - управление структурой БД с версионированием
- 🔄 **Automatic Migrations** - автоматические миграции при обновлениях
- 🔍 **Indexed Queries** - оптимизированные запросы через индексы
- 💾 **CRUD Operations** - полный набор операций с данными
- 🏗️ **Reference Data** - управление справочными данными
- 📈 **Performance Optimization** - кэширование и оптимизация запросов

## Схема базы данных (версия 25)

### Основные таблицы

#### `map_areas` - Области на карте
```javascript
{
    id: string,
    name: string,
    polygon: LatLng[],        // Полигон области
    filters_url: string,      // URL фильтров для парсинга
    created_at: Date,
    updated_at: Date,
    
    // Индексы: name, created_at
}
```

#### `addresses` - Адреса недвижимости  
```javascript
{
    id: string,
    address: string,
    coordinates: [lat, lng],
    type: 'apartment' | 'house' | 'commercial',
    map_area_id: string,
    
    // Характеристики зданий
    house_series_id: string,
    house_class_id: string,
    wall_material_id: string,
    ceiling_material_id: string,
    house_problem_id: string,
    floors_count: number,
    build_year: number,
    ceiling_height: number,
    commercial_spaces: string,
    comment: string,
    
    created_at: Date,
    updated_at: Date,
    
    // Индексы: address, map_area_id, coordinates, type
}
```

#### `segments` - Сегменты анализа
```javascript
{
    id: string,
    name: string,
    description: string,
    map_area_id: string,
    
    // Фильтры сегмента
    filters: {
        house_series_id: string[],
        house_class_id: string[],
        wall_material_id: string[],
        floors_from: number,
        floors_to: number,
        build_year_from: number,
        build_year_to: number,
        property_type: string[]
    },
    
    created_at: Date,
    updated_at: Date,
    
    // Индексы: name, map_area_id, created_at
}
```

#### `listings` - Объявления с сайтов
```javascript
{
    id: string,
    address_id: string,
    title: string,
    price: number,
    area: number,
    rooms: number,
    floor: number,
    total_floors: number,
    source: 'avito' | 'cian',
    url: string,
    images: string[],
    description: string,
    parsed_at: Date,
    
    // История изменений
    price_history: Array<{
        date: Date,
        price: number
    }>,
    
    // Индексы: address_id, source, price, parsed_at
}
```

### Справочные таблицы

#### `house_series` - Серии домов
```javascript
{
    id: string,
    name: string,
    description: string,
    years_built: string,      // Период строительства
    typical_features: string
}
```

#### `house_classes` - Классы домов
```javascript
{
    id: string,
    name: string,
    description: string,
    rating: number           // Класс недвижимости (1-5)
}
```

#### `wall_materials` - Материалы стен
```javascript
{
    id: string,
    name: string,
    description: string,
    thermal_properties: string
}
```

## Основные методы

### Инициализация и соединение

#### `async init()`
Инициализирует соединение с БД и выполняет необходимые миграции.

```javascript
const db = new NeocenkaDB();
await db.init();

// Автоматически выполняются:
// 1. Создание схемы (если первый запуск)
// 2. Миграции до текущей версии
// 3. Инициализация справочных данных
```

### CRUD операции

#### `async add(storeName, data)`
Добавляет новую запись в указанную таблицу.

```javascript
const newAddress = {
    address: 'ул. Ленина, 1',
    coordinates: [55.0, 82.0],
    type: 'apartment',
    map_area_id: 'area_123'
};

const addressId = await db.add('addresses', newAddress);
// Возвращает: сгенерированный ID
```

#### `async get(storeName, id)`
Получает запись по ID.

```javascript
const address = await db.get('addresses', addressId);
// Возвращает: объект или null
```

#### `async getAll(storeName, indexName?, key?)`
Получает все записи или записи по индексу.

```javascript
// Все адреса
const allAddresses = await db.getAll('addresses');

// Адреса в конкретной области
const areaAddresses = await db.getAll('addresses', 'map_area_id', 'area_123');
```

#### `async update(storeName, data)`
Обновляет существующую запись.

```javascript
const updatedAddress = {
    id: addressId,
    address: 'ул. Ленина, 1а', // Изменили адрес
    // ... остальные поля
    updated_at: new Date()
};

await db.update('addresses', updatedAddress);
```

#### `async delete(storeName, id)`
Удаляет запись по ID.

```javascript
await db.delete('addresses', addressId);
```

### Специализированные методы

#### Работа с адресами
```javascript
// Поиск адресов по области
async getAddressesByMapArea(areaId) {
    return this.getAll('addresses', 'map_area_id', areaId);
}

// Поиск адресов по типу недвижимости
async getAddressesByType(type) {
    return this.getAll('addresses', 'type', type);
}

// Поиск адресов по координатам (в радиусе)
async findAddressesInRadius(centerLat, centerLng, radiusKm) {
    const allAddresses = await this.getAll('addresses');
    
    return allAddresses.filter(addr => {
        const distance = this.calculateDistance(
            [centerLat, centerLng], 
            addr.coordinates
        );
        return distance <= radiusKm;
    });
}
```

#### Работа с объявлениями
```javascript
// Получение объявлений по адресу
async getListingsByAddress(addressId) {
    return this.getAll('listings', 'address_id', addressId);
}

// Получение объявлений по источнику
async getListingsBySource(source) {
    return this.getAll('listings', 'source', source);
}

// Поиск объявлений в ценовом диапазоне
async getListingsByPriceRange(minPrice, maxPrice) {
    const allListings = await this.getAll('listings');
    
    return allListings.filter(listing => 
        listing.price >= minPrice && listing.price <= maxPrice
    );
}
```

## Система миграций

### Принцип работы
```javascript
// При изменении version в конструкторе запускается onupgradeneeded
constructor() {
    this.version = 25; // Увеличиваем версию
}

request.onupgradeneeded = (event) => {
    this.db = event.target.result;
    this.createStores(); // Создаем новые таблицы/индексы
};

// После успешного соединения выполняются data migrations
request.onsuccess = async () => {
    await this.migrateDataToNewVersion();
};
```

### Примеры миграций

#### Миграция v19: Добавление поля house_problem_id
```javascript
async migrateAddressesToV19() {
    const addresses = await this.getAll('addresses');
    
    for (const address of addresses) {
        if (!address.house_problem_id) {
            address.house_problem_id = null; // Значение по умолчанию
            address.updated_at = new Date();
            await this.update('addresses', address);
        }
    }
}
```

#### Миграция v20: Изменение структуры чекбоксов
```javascript
async migrateAddressesToV20() {
    const addresses = await this.getAll('addresses');
    
    for (const address of addresses) {
        // Конвертируем старые boolean поля в новую структуру
        if (typeof address.has_balcony === 'boolean') {
            address.features = {
                has_balcony: address.has_balcony,
                has_parking: address.has_parking || false,
                has_elevator: address.has_elevator || false
            };
            
            // Удаляем старые поля
            delete address.has_balcony;
            delete address.has_parking;
            
            await this.update('addresses', address);
        }
    }
}
```

## Управление справочными данными

### Инициализация справочников
```javascript
async initDefaultData() {
    // Серии домов
    await this.initDefaultHouseSeries();
    // Классы домов  
    await this.initDefaultHouseClasses();
    // Материалы стен
    await this.initDefaultWallMaterials();
    // И так далее...
}

async initDefaultHouseSeries() {
    const existingSeries = await this.getAll('house_series');
    if (existingSeries.length === 0) {
        const defaultSeries = [
            {
                id: 'series_khrushchev',
                name: 'Хрущёвка',
                description: 'Панельные дома 1950-1980х годов',
                years_built: '1950-1980',
                typical_features: 'Низкие потолки, малая площадь'
            },
            {
                id: 'series_stalin',
                name: 'Сталинка', 
                description: 'Кирпичные дома 1930-1950х годов',
                years_built: '1930-1950',
                typical_features: 'Высокие потолки, толстые стены'
            }
            // ... другие серии
        ];
        
        for (const series of defaultSeries) {
            await this.add('house_series', series);
        }
    }
}
```

## Оптимизация производительности

### Индексирование
```javascript
// Создание составных индексов для частых запросов
createStores() {
    const addressesStore = this.db.createObjectStore('addresses', { keyPath: 'id' });
    
    // Простые индексы
    addressesStore.createIndex('map_area_id', 'map_area_id');
    addressesStore.createIndex('type', 'type');
    
    // Составной индекс для комплексных запросов
    addressesStore.createIndex('area_type', ['map_area_id', 'type']);
}

// Использование составных индексов
async getAddressesByAreaAndType(areaId, type) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction('addresses', 'readonly');
        const store = transaction.objectStore('addresses');
        const index = store.index('area_type');
        
        const request = index.getAll([areaId, type]);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
```

### Batch операции
```javascript
async bulkAdd(storeName, items) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const results = [];
        let completed = 0;
        
        items.forEach((item, index) => {
            const request = store.add({
                ...item,
                id: item.id || this.generateId(),
                created_at: new Date(),
                updated_at: new Date()
            });
            
            request.onsuccess = () => {
                results[index] = request.result;
                completed++;
                
                if (completed === items.length) {
                    resolve(results);
                }
            };
        });
        
        transaction.onerror = () => reject(transaction.error);
    });
}
```

### Курсоры для больших данных
```javascript
async processLargeDataset(storeName, processor) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor) {
                // Обрабатываем запись
                processor(cursor.value);
                cursor.continue(); // Переходим к следующей записи
            } else {
                // Завершили обход
                resolve();
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}
```

## Работа с настройками

### Системные настройки
```javascript
async getSetting(key) {
    const setting = await this.get('settings', key);
    return setting ? setting.value : null;
}

async setSetting(key, value) {
    const setting = {
        key: key,
        value: value,
        updated_at: new Date()
    };
    
    await this.update('settings', setting);
}
```

### Пользовательские настройки
```javascript
async getUserPreferences() {
    return {
        debug_mode: await this.getSetting('debug_mode'),
        default_area: await this.getSetting('default_area'),
        map_zoom: await this.getSetting('map_zoom'),
        table_page_size: await this.getSetting('table_page_size')
    };
}

async updateUserPreferences(preferences) {
    for (const [key, value] of Object.entries(preferences)) {
        await this.setSetting(key, value);
    }
}
```

## Error Handling и валидация

### Валидация данных
```javascript
validateAddress(address) {
    const errors = [];
    
    if (!address.address || address.address.trim().length === 0) {
        errors.push('Адрес не может быть пустым');
    }
    
    if (!address.coordinates || !Array.isArray(address.coordinates) || 
        address.coordinates.length !== 2) {
        errors.push('Некорректные координаты');
    }
    
    if (!['apartment', 'house', 'commercial'].includes(address.type)) {
        errors.push('Неверный тип недвижимости');
    }
    
    return errors;
}

async addWithValidation(storeName, data) {
    const errors = this.validate(storeName, data);
    
    if (errors.length > 0) {
        throw new ValidationError(`Ошибки валидации: ${errors.join(', ')}`);
    }
    
    return this.add(storeName, data);
}
```

### Обработка ошибок соединения
```javascript
async withRetry(operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Ждем перед повторной попыткой
            await new Promise(resolve => 
                setTimeout(resolve, 1000 * attempt)
            );
        }
    }
}
```

## Testing Database Operations

### Mock Database для тестов
```javascript
class MockNeocenkaDB extends NeocenkaDB {
    constructor() {
        super();
        this.mockData = new Map();
    }
    
    async add(storeName, data) {
        const id = data.id || this.generateId();
        const storeData = this.mockData.get(storeName) || new Map();
        storeData.set(id, { ...data, id });
        this.mockData.set(storeName, storeData);
        return id;
    }
    
    async get(storeName, id) {
        const storeData = this.mockData.get(storeName);
        return storeData ? storeData.get(id) : null;
    }
}
```

## API Reference

### Core Methods

#### `async init(): Promise<void>`
Инициализирует соединение с БД и выполняет миграции.

#### `async add(storeName: string, data: object): Promise<string>`
Добавляет новую запись и возвращает её ID.

#### `async get(storeName: string, id: string): Promise<object | null>`
Получает запись по ID.

#### `async getAll(storeName: string, indexName?: string, key?: any): Promise<object[]>`
Получает записи, опционально по индексу.

#### `async update(storeName: string, data: object): Promise<void>`
Обновляет существующую запись.

#### `async delete(storeName: string, id: string): Promise<void>`
Удаляет запись по ID.

### Utility Methods

#### `generateId(): string`
Генерирует уникальный ID для новых записей.

#### `async getSetting(key: string): Promise<any>`
Получает системную настройку.

#### `async setSetting(key: string, value: any): Promise<void>`
Устанавливает системную настройку.

## Связанные файлы

- [`models.js`](doc_models.md) - модели данных и валидация
- [`../pages/core/DataState.js`](../pages/core/doc_DataState.md) - состояние приложения
- [`../services/external/InparsService.js`](../services/external/doc_InparsService.md) - внешние данные

## Заключение

NeocenkaDB обеспечивает надежное и производительное хранение данных для приложения. Система миграций позволяет безопасно обновлять схему БД, а индексы обеспечивают быстрые запросы даже для больших объемов данных.

**Рекомендации:**
- ✅ Используйте индексы для часто запрашиваемых полей
- ✅ Выполняйте валидацию данных перед сохранением  
- ✅ Используйте транзакции для связанных операций
- ❌ Не забывайте обновлять версию БД при изменении схемы

---

*Database.js является фундаментом для всех операций с данными в Neocenka Extension.*