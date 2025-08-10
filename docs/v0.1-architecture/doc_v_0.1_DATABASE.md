# База данных Neocenka Extension v0.1

## Обзор системы базы данных

Neocenka Extension использует **IndexedDB** как основное хранилище данных с комплексной реляционной структурой. Текущая версия базы данных: **17** с поддержкой миграций и пространственных индексов.

## Архитектура данных

### Основные принципы:
- **Реляционная модель** - полная поддержка связей между сущностями
- **Пространственные индексы** - RBush для географических запросов
- **Версионирование** - автоматические миграции схемы
- **Индексирование** - составные индексы для производительности
- **Резервное копирование** - автоматическое создание backup данных

---

## Схема базы данных v17

### Основные таблицы:

```javascript
const DATABASE_SCHEMA = {
    version: 17,
    tables: {
        // Географические области
        map_areas: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'created_at', keyPath: 'created_at' },
                { name: 'updated_at', keyPath: 'updated_at' }
            ]
        },
        
        // Адреса недвижимости  
        addresses: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'address_hash', keyPath: 'address_hash', unique: true },
                { name: 'coordinates', keyPath: ['coordinates.lat', 'coordinates.lng'] },
                { name: 'house_series_id', keyPath: 'house_series_id' },
                { name: 'house_class_id', keyPath: 'house_class_id' },
                { name: 'wall_material_id', keyPath: 'wall_material_id' },
                { name: 'build_year', keyPath: 'build_year' },
                { name: 'floors', keyPath: 'floors' },
                { name: 'updated_at', keyPath: 'updated_at' }
            ]
        },
        
        // Сегменты для фильтрации
        segments: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'map_area_id', keyPath: 'map_area_id' },
                { name: 'created_at', keyPath: 'created_at' },
                { name: 'updated_at', keyPath: 'updated_at' }
            ]
        },
        
        // Объекты недвижимости (агрегированные)
        real_estate_objects: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'address_id', keyPath: 'address_id' },
                { name: 'coordinates', keyPath: ['coordinates.lat', 'coordinates.lng'] },
                { name: 'price_current', keyPath: 'price_current' },
                { name: 'area', keyPath: 'area' },
                { name: 'rooms', keyPath: 'rooms' },
                { name: 'floor', keyPath: 'floor' },
                { name: 'created_at', keyPath: 'created_at' },
                { name: 'updated_at', keyPath: 'updated_at' }
            ]
        },
        
        // Объявления с внешних сайтов
        listings: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'real_estate_object_id', keyPath: 'real_estate_object_id' },
                { name: 'address_id', keyPath: 'address_id' },
                { name: 'external_id', keyPath: ['source', 'external_id'], unique: true },
                { name: 'source', keyPath: 'source' },
                { name: 'price', keyPath: 'price' },
                { name: 'price_per_sqm', keyPath: 'price_per_sqm' },
                { name: 'created_at', keyPath: 'created_at' },
                { name: 'updated_at', keyPath: 'updated_at' },
                { name: 'is_active', keyPath: 'is_active' }
            ]
        },
        
        // История изменения цен
        price_history: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'real_estate_object_id', keyPath: 'real_estate_object_id' },
                { name: 'listing_id', keyPath: 'listing_id' },
                { name: 'date', keyPath: 'date' },
                { name: 'object_date', keyPath: ['real_estate_object_id', 'date'] }
            ]
        },
        
        // Справочник серий домов
        house_series: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'name', keyPath: 'name', unique: true }
            ]
        },
        
        // Справочник классов домов
        house_classes: {
            keyPath: 'id',  
            autoIncrement: false,
            indexes: [
                { name: 'name', keyPath: 'name', unique: true },
                { name: 'rating', keyPath: 'rating' }
            ]
        },
        
        // Справочник материалов стен
        wall_materials: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'name', keyPath: 'name', unique: true }
            ]
        },
        
        // Отчеты и аналитика
        reports: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'segment_id', keyPath: 'segment_id' },
                { name: 'report_type', keyPath: 'report_type' },
                { name: 'created_at', keyPath: 'created_at' }
            ]
        },
        
        // Настройки приложения
        settings: {
            keyPath: 'key',
            autoIncrement: false,
            indexes: []
        }
    }
};
```

---

## Модели данных

### MapArea (Географическая область)

```javascript
{
    id: 'area_uuid_v4',                    // UUID области
    name: 'Название области',              // Пользовательское имя
    description: 'Описание области',       // Описание (опционально)
    polygon_coords: [                      // Координаты полигона
        [lat1, lng1],
        [lat2, lng2],
        // ... остальные точки
    ],
    filter_url_avito: 'https://...',       // URL фильтра Avito
    filter_url_cian: 'https://...',        // URL фильтра Cian
    color: '#007cba',                      // Цвет для отображения
    is_active: true,                       // Активна ли область
    created_at: Date,                      // Дата создания
    updated_at: Date,                      // Дата обновления
    
    // Кэшированная статистика
    cached_stats: {
        address_count: 145,
        object_count: 267,  
        segment_count: 8,
        last_updated: Date
    }
}
```

### Address (Адрес недвижимости)

```javascript
{
    id: 'addr_uuid_v4',                   // UUID адреса
    address: 'г. Новосибирск, ул. Ленина, 1', // Полный адрес
    address_hash: 'hash_string',          // Хэш для дедупликации
    
    // Географические координаты
    coordinates: {
        lat: 55.0084,                     // Широта
        lng: 82.9357                      // Долгота  
    },
    
    // Характеристики здания
    house_series_id: 'series_modern',     // ID серии дома
    house_class_id: 'class_comfort',      // ID класса дома
    wall_material_id: 'material_brick',   // ID материала стен
    floors: 9,                            // Количество этажей
    build_year: 2015,                     // Год постройки
    
    // Разбор адреса
    address_components: {
        city: 'Новосибирск',
        street: 'ул. Ленина',
        house_number: '1',
        postal_code: '630000',
        district: 'Центральный район'
    },
    
    // Геокодирование
    geocoding_source: 'manual|api|parser', // Источник координат
    geocoding_accuracy: 'exact|approximate', // Точность геокодирования
    
    // Статистика
    object_count: 12,                     // Количество объектов по адресу
    active_listings_count: 8,             // Активных объявлений
    average_price: 4500000,               // Средняя цена
    price_per_sqm_avg: 85000,            // Цена за кв.м
    
    // Метаданные
    created_at: Date,                     // Дата создания
    updated_at: Date,                     // Дата обновления
    last_seen: Date,                      // Последнее обнаружение
    verification_status: 'verified|pending|invalid' // Статус верификации
}
```

### Segment (Сегмент)

```javascript
{
    id: 'segment_uuid_v4',                // UUID сегмента
    name: 'Новостройки центра',           // Название сегмента
    description: 'Описание сегмента',     // Описание (опционально)
    map_area_id: 'area_uuid',             // ID области
    
    // Фильтры недвижимости
    filters: {
        // Справочные фильтры (массивы ID)
        house_series_id: ['series_modern', 'series_stalin'],
        house_class_id: ['class_business', 'class_comfort'],
        wall_material_id: ['material_brick', 'material_monolith'],
        
        // Диапазонные фильтры
        floors_from: 5,                   // Этажность от
        floors_to: 25,                    // Этажность до
        build_year_from: 2010,            // Год постройки от
        build_year_to: 2024,              // Год постройки до
        
        // Фильтры по площади
        area_from: 40.0,                  // Площадь от (м²)
        area_to: 120.0,                   // Площадь до (м²)
        
        // Фильтры по цене
        price_from: 3000000,              // Цена от (руб.)
        price_to: 8000000,                // Цена до (руб.)
        price_per_sqm_from: 60000,        // Цена за м² от
        price_per_sqm_to: 120000,         // Цена за м² до
        
        // Фильтры по комнатам и этажам
        rooms: [1, 2, 3],                 // Количество комнат
        floor_from: 2,                    // Этаж от
        floor_to: 20,                     // Этаж до
        not_first_floor: true,            // Исключить первый этаж
        not_last_floor: true              // Исключить последний этаж
    },
    
    // Метаданные
    created_at: Date,                     // Дата создания
    updated_at: Date,                     // Дата обновления
    created_by: 'user_id',                // Создатель
    
    // Кэшированная статистика
    cached_stats: {
        address_count: 45,                // Адресов в сегменте
        object_count: 123,                // Объектов в сегменте
        listing_count: 187,               // Объявлений в сегменте
        
        // Ценовая статистика
        price_avg: 4850000,
        price_median: 4700000,
        price_min: 2100000,
        price_max: 8500000,
        price_per_sqm_avg: 89500,
        
        // Характеристики
        area_avg: 65.2,
        rooms_distribution: {1: 15, 2: 45, 3: 35, 4: 5},
        
        last_calculated: Date             // Дата расчета статистики
    }
}
```

### RealEstateObject (Объект недвижимости)

```javascript
{
    id: 'object_uuid_v4',                 // UUID объекта
    address_id: 'addr_uuid',              // ID адреса
    
    // Дублированные для быстрого доступа
    coordinates: {
        lat: 55.0084,
        lng: 82.9357
    },
    
    // Основные характеристики
    rooms: 2,                             // Количество комнат
    area: 65.5,                           // Общая площадь (м²)
    area_living: 45.2,                    // Жилая площадь (м²)
    area_kitchen: 12.8,                   // Площадь кухни (м²)
    floor: 5,                             // Этаж
    total_floors: 9,                      // Всего этажей в доме
    
    // Ценовая информация
    price_current: 4500000,               // Текущая цена (руб.)
    price_per_sqm: 85000,                 // Цена за м² (руб.)
    price_history_count: 5,               // Количество изменений цены
    
    // Дополнительные характеристики
    balcony: true,                        // Наличие балкона
    loggia: false,                        // Наличие лоджии
    separate_bathroom: true,              // Раздельный санузел
    renovation: 'cosmetic|major|design|none', // Ремонт
    
    // Статистика объявлений
    listing_count: 3,                     // Количество объявлений
    active_listing_count: 1,              // Активных объявлений
    first_seen: Date,                     // Первое обнаружение
    last_seen: Date,                      // Последнее обнаружение
    
    // Состояние объекта
    is_duplicate: false,                  // Является дубликатом
    master_object_id: null,               // ID мастер-объекта (если дубликат)
    confidence_score: 0.95,               // Уверенность в объединении
    
    // Источники данных
    sources: ['avito', 'cian'],           // Источники данных
    external_ids: {                       // ID во внешних системах
        avito: '1234567890',
        cian: '987654321'
    },
    
    // Метаданные
    created_at: Date,                     // Дата создания
    updated_at: Date,                     // Дата обновления
    verified_at: Date                     // Дата верификации
}
```

### Listing (Объявление)

```javascript
{
    id: 'listing_uuid_v4',                // UUID объявления
    real_estate_object_id: 'object_uuid', // ID объекта недвижимости
    address_id: 'addr_uuid',              // ID адреса
    
    // Внешние идентификаторы
    source: 'avito|cian|inpars',          // Источник
    external_id: '1234567890',            // ID во внешней системе
    external_url: 'https://...',          // Ссылка на объявление
    
    // Ценовая информация
    price: 4500000,                       // Цена (руб.)
    price_per_sqm: 85000,                 // Цена за м² (руб.)
    price_currency: 'RUB',                // Валюта
    price_history: [                      // История изменений цены
        { date: Date, price: 4600000 },
        { date: Date, price: 4500000 }
    ],
    
    // Характеристики
    rooms: 2,                             // Количество комнат
    area: 65.5,                           // Площадь (м²)
    floor: 5,                             // Этаж
    
    // Информация о продавце
    seller_type: 'owner|agent|agency',    // Тип продавца
    seller_name: 'Имя продавца',          // Имя продавца
    seller_phone: '+7xxxxxxxxxx',         // Телефон (хэшированный)
    agency_name: 'Название агентства',    // Название агентства
    
    // Описание и медиа
    title: 'Заголовок объявления',        // Заголовок
    description: 'Описание объявления',   // Описание
    photos: [                             // Фотографии
        {
            url: 'https://...',
            thumbnail_url: 'https://...',
            order: 1
        }
    ],
    
    // Парсинг и обработка
    parsed_at: Date,                      // Дата парсинга
    raw_data: {...},                      // Сырые данные (для отладки)
    parsing_version: '1.2.3',             // Версия парсера
    
    // Статус объявления
    is_active: true,                      // Активно ли объявление
    deactivated_at: Date,                 // Дата деактивации
    deactivation_reason: 'sold|removed|blocked', // Причина деактивации
    
    // Метаданные
    created_at: Date,                     // Дата создания
    updated_at: Date,                     // Дата обновления
    last_checked: Date                    // Последняя проверка
}
```

---

## Справочные данные

### HouseSeries (Серии домов)

```javascript
{
    id: 'series_khrushchev',              // Уникальный ID
    name: 'Хрущёвка',                     // Название серии
    description: 'Панельные и кирпичные дома...', // Описание
    years_built: '1950-1980',             // Период строительства
    typical_features: 'Низкие потолки...', // Типичные особенности
    wall_materials: ['brick', 'panel'],   // Типичные материалы
    floors_typical: [5, 9],               // Типичная этажность
    is_active: true,                      // Используется ли
    usage_count: 145                      // Количество адресов с этой серией
}
```

### HouseClass (Классы домов)

```javascript
{
    id: 'class_business',                 // Уникальный ID
    name: 'Бизнес',                       // Название класса
    description: 'Бизнес-класс',          // Описание
    rating: 4,                            // Рейтинг (1-5)
    characteristics: 'Высококачественная отделка...', // Характеристики
    price_range: {                        // Ценовой диапазон
        min: 80000,                       // за м²
        max: 150000
    },
    is_active: true,                      // Используется ли
    usage_count: 89                       // Количество адресов
}
```

### WallMaterial (Материалы стен)

```javascript
{
    id: 'material_brick',                 // Уникальный ID
    name: 'Кирпич',                       // Название материала
    description: 'Кирпичные стены',       // Описание
    thermal_properties: 'Хорошая теплоизоляция', // Теплосвойства
    durability: 'Высокая',                // Долговечность
    advantages: 'Долговечность, экологичность', // Преимущества
    disadvantages: 'Высокая стоимость',   // Недостатки
    is_active: true,                      // Используется ли
    usage_count: 234                      // Количество адресов
}
```

---

## Индексы и производительность

### Составные индексы:

```javascript
// Для быстрого поиска объявлений по источнику и внешнему ID
{ name: 'external_id', keyPath: ['source', 'external_id'], unique: true }

// Для поиска по координатам
{ name: 'coordinates', keyPath: ['coordinates.lat', 'coordinates.lng'] }

// Для истории цен по объекту и дате
{ name: 'object_date', keyPath: ['real_estate_object_id', 'date'] }
```

### Пространственные индексы:

```javascript
// RBush индекс для географических запросов
class SpatialIndex {
    constructor() {
        this.rbush = new RBush();
        this.addressIndex = new Map(); // markerId -> addressId
    }
    
    // Добавление адреса в пространственный индекс
    addAddress(address) {
        const item = {
            minX: address.coordinates.lng - 0.0001,
            minY: address.coordinates.lat - 0.0001,  
            maxX: address.coordinates.lng + 0.0001,
            maxY: address.coordinates.lat + 0.0001,
            addressId: address.id
        };
        
        this.rbush.insert(item);
        this.addressIndex.set(item.addressId, address);
    }
    
    // Поиск адресов в прямоугольнике
    searchInBounds(bounds) {
        const items = this.rbush.search({
            minX: bounds.west,
            minY: bounds.south,
            maxX: bounds.east, 
            maxY: bounds.north
        });
        
        return items.map(item => this.addressIndex.get(item.addressId));
    }
    
    // Поиск в радиусе
    searchInRadius(center, radiusKm) {
        const degreeRadius = radiusKm / 111.32; // Примерное преобразование
        
        return this.searchInBounds({
            west: center.lng - degreeRadius,
            south: center.lat - degreeRadius,
            east: center.lng + degreeRadius,
            north: center.lat + degreeRadius
        }).filter(address => {
            const distance = this.calculateDistance(center, address.coordinates);
            return distance <= radiusKm;
        });
    }
}
```

---

## Миграции базы данных

### История версий:

```javascript
const MIGRATION_HISTORY = {
    1: 'Начальная схема',
    2: 'Добавлены справочники',
    3: 'История цен',
    4: 'Геокоординаты',
    5: 'Пространственные индексы',
    6: 'Кэшированная статистика',
    7: 'Дедупликация объявлений',
    8: 'Источники данных',
    9: 'Статусы объявлений',
    10: 'Расширенные характеристики',
    11: 'Информация о продавце',
    12: 'Медиа файлы',
    13: 'Парсинг метаданные',
    14: 'Справочник классов домов',
    15: 'Материалы стен',
    16: 'Верификация данных',
    17: 'Оптимизация индексов' // текущая версия
};
```

### Пример миграции v16 → v17:

```javascript
async function migrateToVersion17(db, transaction) {
    console.log('🔄 Миграция базы данных до версии 17...');
    
    try {
        // 1. Добавление новых индексов для производительности
        const addressStore = transaction.objectStore('addresses');
        
        // Индекс по году постройки
        if (!addressStore.indexNames.contains('build_year')) {
            addressStore.createIndex('build_year', 'build_year', { unique: false });
        }
        
        // Составной индекс для координат  
        if (!addressStore.indexNames.contains('coordinates')) {
            addressStore.createIndex('coordinates', ['coordinates.lat', 'coordinates.lng'], { unique: false });
        }
        
        // 2. Добавление индекса статуса верификации
        if (!addressStore.indexNames.contains('verification_status')) {
            addressStore.createIndex('verification_status', 'verification_status', { unique: false });
        }
        
        // 3. Обновление существующих записей
        const addressRequest = addressStore.getAll();
        addressRequest.onsuccess = function() {
            const addresses = addressRequest.result;
            
            addresses.forEach(address => {
                // Добавляем статус верификации если отсутствует
                if (!address.verification_status) {
                    address.verification_status = 'pending';
                }
                
                // Обновляем запись
                addressStore.put(address);
            });
        };
        
        // 4. Оптимизация таблицы объявлений
        const listingStore = transaction.objectStore('listings');
        
        // Индекс активности
        if (!listingStore.indexNames.contains('is_active')) {
            listingStore.createIndex('is_active', 'is_active', { unique: false });
        }
        
        console.log('✅ Миграция к версии 17 завершена успешно');
        
    } catch (error) {
        console.error('❌ Ошибка миграции к версии 17:', error);
        throw error;
    }
}
```

---

## API базы данных

### Database Class

```javascript
class Database {
    constructor() {
        this.db = null;
        this.version = 17;
        this.name = 'NeocenkaExtension';
        this.spatialIndex = new SpatialIndex();
    }
    
    // Подключение к базе данных
    async connect() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                this.handleUpgrade(event);
            };
        });
    }
    
    // CRUD операции
    async add(tableName, data) {
        const transaction = this.db.transaction(tableName, 'readwrite');
        const store = transaction.objectStore(tableName);
        
        // Генерация ID если не указан
        if (!data.id) {
            data.id = this.generateId(tableName);
        }
        
        // Временные метки
        const now = new Date();
        if (!data.created_at) data.created_at = now;
        data.updated_at = now;
        
        return new Promise((resolve, reject) => {
            const request = store.add(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }
    
    async get(tableName, id) {
        const transaction = this.db.transaction(tableName, 'readonly');
        const store = transaction.objectStore(tableName);
        
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async update(tableName, id, updates) {
        const transaction = this.db.transaction(tableName, 'readwrite');
        const store = transaction.objectStore(tableName);
        
        return new Promise((resolve, reject) => {
            // Сначала получаем существующую запись
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const existingData = getRequest.result;
                if (!existingData) {
                    reject(new Error(`Record with id ${id} not found`));
                    return;
                }
                
                // Объединяем с обновлениями
                const updatedData = {
                    ...existingData,
                    ...updates,
                    id: id, // Убеждаемся что ID не изменился
                    updated_at: new Date()
                };
                
                // Обновляем запись
                const putRequest = store.put(updatedData);
                putRequest.onsuccess = () => resolve(updatedData);
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
    
    async delete(tableName, id) {
        const transaction = this.db.transaction(tableName, 'readwrite');
        const store = transaction.objectStore(tableName);
        
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    // Запросы по индексам
    async getByIndex(tableName, indexName, value) {
        const transaction = this.db.transaction(tableName, 'readonly');
        const store = transaction.objectStore(tableName);
        const index = store.index(indexName);
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAll(tableName, filter = null) {
        const transaction = this.db.transaction(tableName, 'readonly');
        const store = transaction.objectStore(tableName);
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                let results = request.result;
                
                // Применение фильтра
                if (filter && typeof filter === 'function') {
                    results = results.filter(filter);
                }
                
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    // Пространственные запросы
    async getAddressesInBounds(bounds) {
        // Быстрый поиск через R-Tree индекс
        return this.spatialIndex.searchInBounds(bounds);
    }
    
    async getAddressesNearby(center, radiusKm) {
        return this.spatialIndex.searchInRadius(center, radiusKm);
    }
    
    // Статистические запросы
    async getSegmentStatistics(segmentId) {
        // Получение сегмента
        const segment = await this.get('segments', segmentId);
        if (!segment) throw new Error('Segment not found');
        
        // Получение всех объектов области
        const allObjects = await this.getByIndex('real_estate_objects', 'address_id');
        
        // Фильтрация по условиям сегмента
        const filteredObjects = this.filterObjectsBySegment(allObjects, segment.filters);
        
        // Вычисление статистики
        return this.calculateObjectStatistics(filteredObjects);
    }
    
    // Резервное копирование
    async createBackup() {
        const backup = {
            version: this.version,
            timestamp: new Date().toISOString(),
            data: {}
        };
        
        const tableNames = [...this.db.objectStoreNames];
        
        for (const tableName of tableNames) {
            backup.data[tableName] = await this.getAll(tableName);
        }
        
        return backup;
    }
    
    async restoreFromBackup(backupData) {
        // Проверка версии
        if (backupData.version > this.version) {
            throw new Error('Backup version is newer than current database version');
        }
        
        // Очистка текущих данных
        await this.clearAllTables();
        
        // Восстановление данных
        for (const [tableName, records] of Object.entries(backupData.data)) {
            const transaction = this.db.transaction(tableName, 'readwrite');
            const store = transaction.objectStore(tableName);
            
            for (const record of records) {
                await new Promise((resolve, reject) => {
                    const request = store.add(record);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
        }
        
        // Перестройка пространственных индексов
        await this.rebuildSpatialIndexes();
    }
    
    // Утилитные методы
    generateId(tableName) {
        const prefix = {
            'map_areas': 'area_',
            'addresses': 'addr_', 
            'segments': 'segment_',
            'real_estate_objects': 'object_',
            'listings': 'listing_',
            'price_history': 'price_',
            'reports': 'report_'
        }[tableName] || 'item_';
        
        return prefix + this.generateUUID();
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
```

---

**База данных v17 обеспечивает:**
- ✅ **Полную реляционность** с поддержкой связей между таблицами
- ✅ **Высокую производительность** через оптимизированные индексы
- ✅ **Пространственные запросы** для работы с геоданными
- ✅ **Автоматические миграции** при обновлении схемы
- ✅ **Дедупликацию данных** на уровне базы
- ✅ **Резервное копирование** и восстановление
- ✅ **Статистические агрегации** для аналитики