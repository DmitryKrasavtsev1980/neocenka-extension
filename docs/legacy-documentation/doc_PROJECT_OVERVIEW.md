# Neocenka Extension - Полная документация проекта

> **Версия проекта:** 0.3.4  
> **Дата документации:** Август 2025  
> **Платформа:** Chrome Extension Manifest V3  

## Содержание

1. [Обзор проекта](#обзор-проекта)
2. [Архитектура системы](#архитектура-системы)
3. [Структура файлов](#структура-файлов)
4. [Основные компоненты](#основные-компоненты)
5. [API и интерфейсы](#api-и-интерфейсы)
6. [База данных](#база-данных)
7. [Интеграции](#интеграции)
8. [Развертывание и сборка](#развертывание-и-сборка)
9. [Тестирование](#тестирование)
10. [Ссылки на документацию файлов](#ссылки-на-документацию-файлов)

---

## Обзор проекта

**Neocenka** - это Chrome-расширение для профессионального анализа рынка недвижимости, предназначенное для риелторов, инвесторов и аналитиков рынка. Расширение автоматизирует процесс сбора, обработки и анализа данных с ведущих российских площадок недвижимости.

### Основные возможности

- **Парсинг объявлений** с Avito.ru и Cian.ru с автоматическим извлечением метаданных
- **Геопространственный анализ** с интерактивными картами на базе Leaflet/OpenStreetMap
- **Сегментирование рынка** по различным критериям (серия домов, материал стен, год постройки)
- **Аналитические отчеты** с графиками и экспортом в различные форматы
- **Управление дубликатами** с продвинутыми алгоритмами детекции
- **Интеграция с внешними API** (Inpars.ru, Overpass API)

### Целевая аудитория

- Риелторы для анализа локальных сегментов рынка
- Инвесторы для поиска недооцененных активов
- Девелоперы для исследования конкуренции
- Аналитики рынка недвижимости

---

## Архитектура системы

Проект построен на модульной архитектуре с четким разделением ответственности:

### Общая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                 Chrome Extension Manifest V3                │
├─────────────────────────────────────────────────────────────┤
│  Background Script │    Content Scripts    │   Extension UI  │
│                    │                       │                 │
│  • Service Worker  │  • Avito Parser      │  • Popup        │
│  • Auto-updater    │  • Cian Parser       │  • Area Manager │
│  • Subscription    │  • Page Enhancement  │  • Analytics    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│      Core              Managers              Services        │
│                                                             │
│  • DataState          • MapManager          • InparsService │
│  • EventBus           • AddressManager      • ServiceManager│
│  • ProgressManager    • SegmentsManager     • BaseAPIService│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                              │
├─────────────────────────────────────────────────────────────┤
│    Database           Models              Utilities         │
│                                                             │
│  • IndexedDB         • AddressModel       • GeometryUtils  │
│  • Migration System  • ListingModel       • DuplicateDetect│
│  • Schema v17        • SegmentModel       • AddressMatcher │
└─────────────────────────────────────────────────────────────┘
```

### Архитектурные принципы

1. **Модульность** - каждый компонент имеет четко определенную ответственность
2. **Разделение слоев** - четкое разграничение UI, бизнес-логики и данных
3. **Event-driven** - использование EventBus для слабой связанности компонентов
4. **Расширяемость** - легкое добавление новых источников данных и функций
5. **Производительность** - оптимизация работы с большими объемами данных

---

## Структура файлов

### Корневая структура

```
neocenka-extension/
├── 📄 manifest.json              # Манифест расширения
├── 📄 package.json               # NPM конфигурация
├── 📄 CLAUDE.md                  # Документация для ИИ-ассистента
├── 📄 README.md                  # Основная документация
├── 📄 doc_*.md                   # Файлы документации (этот файл)
│
├── 📁 background/                # Service Worker
│   └── 📄 background.js          # [→ doc_background.md](background/doc_background.md)
│
├── 📁 content-scripts/           # Парсеры сайтов
│   ├── 📄 avito-parser.js        # [→ doc_avito-parser.md](content-scripts/doc_avito-parser.md)
│   ├── 📄 cian-parser.js         # [→ doc_cian-parser.md](content-scripts/doc_cian-parser.md)
│   └── 📄 parser-styles.css      # Стили для парсеров
│
├── 📁 popup/                     # Popup интерфейс
│   ├── 📄 popup.html             # HTML popup
│   ├── 📄 popup.js               # [→ doc_popup.md](popup/doc_popup.md)
│   └── 📄 popup.css              # Стили popup
│
├── 📁 pages/                     # Основные страницы приложения
│   ├── 📄 area.html              # Страница управления областями
│   ├── 📄 area.js                # [→ doc_area.md](pages/doc_area.md)
│   ├── 📄 main.html              # Главная страница аналитики
│   ├── 📄 main.js                # [→ doc_main.md](pages/doc_main.md)
│   ├── 📄 settings.html          # Страница настроек
│   │
│   ├── 📁 core/                  # Базовые компоненты архитектуры
│   │   ├── 📄 DataState.js       # [→ doc_DataState.md](pages/core/doc_DataState.md)
│   │   ├── 📄 EventBus.js        # [→ doc_EventBus.md](pages/core/doc_EventBus.md)
│   │   └── 📄 ProgressManager.js # [→ doc_ProgressManager.md](pages/core/doc_ProgressManager.md)
│   │
│   ├── 📁 managers/              # Менеджеры функционала
│   │   ├── 📄 MapManager.js      # [→ doc_MapManager.md](pages/managers/doc_MapManager.md)
│   │   ├── 📄 AddressManager.js  # [→ doc_AddressManager.md](pages/managers/doc_AddressManager.md)
│   │   ├── 📄 SegmentsManager.js # [→ doc_SegmentsManager.md](pages/managers/doc_SegmentsManager.md)
│   │   ├── 📄 UIManager.js       # [→ doc_UIManager.md](pages/managers/doc_UIManager.md)
│   │   └── 📄 [другие менеджеры] # Полный список в соответствующих файлах
│   │
│   └── 📁 shared/                # Общие утилиты
│       ├── 📄 constants.js       # [→ doc_constants.md](pages/shared/doc_constants.md)
│       ├── 📄 helpers.js         # [→ doc_helpers.md](pages/shared/doc_helpers.md)
│       └── 📄 validators.js      # [→ doc_validators.md](pages/shared/doc_validators.md)
│
├── 📁 data/                      # Модели данных и БД
│   ├── 📄 database.js            # [→ doc_database.md](data/doc_database.md)
│   ├── 📄 models.js              # [→ doc_models.md](data/doc_models.md)
│   └── 📄 storage.js             # [→ doc_storage.md](data/doc_storage.md)
│
├── 📁 services/                  # Внешние сервисы
│   ├── 📄 ServiceConfig.js       # [→ doc_ServiceConfig.md](services/doc_ServiceConfig.md)
│   ├── 📁 base/                  # Базовые сервисы
│   │   ├── 📄 BaseAPIService.js  # [→ doc_BaseAPIService.md](services/base/doc_BaseAPIService.md)
│   │   └── 📄 ServiceManager.js  # [→ doc_ServiceManager.md](services/base/doc_ServiceManager.md)
│   ├── 📁 external/              # Внешние интеграции
│   │   └── 📄 InparsService.js   # [→ doc_InparsService.md](services/external/doc_InparsService.md)
│   └── 📁 ui/                    # UI сервисы
│       └── 📄 InparsPanel.js     # [→ doc_InparsPanel.md](services/ui/doc_InparsPanel.md)
│
├── 📁 utils/                     # Утилиты и вспомогательные функции
│   ├── 📄 geometry-utils.js      # [→ doc_geometry-utils.md](utils/doc_geometry-utils.md)
│   ├── 📄 duplicate-detector.js  # [→ doc_duplicate-detector.md](utils/doc_duplicate-detector.md)
│   ├── 📄 address-matcher.js     # [→ doc_address-matcher.md](utils/doc_address-matcher.md)
│   └── 📄 [другие утилиты]       # Полный список в соответствующих файлах
│
├── 📁 components/                # Переиспользуемые UI компоненты
│   ├── 📄 navigation.js          # [→ doc_navigation.md](components/doc_navigation.md)
│   ├── 📄 breadcrumbs.js         # [→ doc_breadcrumbs.md](components/doc_breadcrumbs.md)
│   └── 📄 footer.js              # [→ doc_footer.md](components/doc_footer.md)
│
├── 📁 tests/                     # Тесты
│   └── 📄 [тестовые файлы]       # [→ doc_TESTING.md](doc_TESTING.md)
│
└── 📁 libs/                      # Внешние библиотеки
    ├── 📁 leaflet/               # Картографическая библиотека
    ├── 📁 apexcharts/            # Библиотека графиков
    └── 📁 [другие библиотеки]
```

---

## Основные компоненты

### 1. Core Architecture (pages/core/)

**DataState.js** - Централизованное управление состоянием приложения
- Хранение текущих данных сессии
- Реактивные обновления состояния
- Интеграция с EventBus

**EventBus.js** - Система событий для слабой связанности компонентов
- Паттерн Observer для межкомпонентного взаимодействия
- Типизированные события
- Отладка и логирование событий

**ProgressManager.js** - Управление UI состояниями загрузки
- Индикаторы прогресса
- Уведомления пользователю
- Обработка ошибок

### 2. Business Logic Managers (pages/managers/)

**MapManager.js** - Управление интерактивными картами
- Интеграция с Leaflet
- Слои маркеров и полигонов
- Кластеризация для производительности
- Пространственные запросы

**AddressManager.js** - Работа с адресами и геокодированием
- CRUD операции адресов
- Геокодирование через внешние сервисы
- Нормализация адресных данных
- Интеграция с реестрами

**SegmentsManager.js** - Управление сегментами рынка
- Создание и редактирование сегментов
- Фильтрация по различным критериям
- Аналитические расчеты
- Экспорт отчетов

### 3. External Services (services/)

**BaseAPIService.js** - Базовый класс для API интеграций
- HTTP клиент с обработкой ошибок
- Rate limiting
- Кэширование ответов
- Авторизация

**InparsService.js** - Интеграция с Inpars.ru API
- Получение дополнительных данных о недвижимости
- Управление подписками
- Обогащение парсенных данных

### 4. Data Layer (data/)

**database.js** - Работа с IndexedDB
- Схема базы данных версии 17
- Миграции между версиями
- Транзакционная модель
- Индексирование для производительности

**models.js** - Модели данных
- AddressModel - модель адресов
- ListingModel - модель объявлений  
- SegmentModel - модель сегментов
- Валидация и нормализация данных

---

## API и интерфейсы

### Внутренние API

#### EventBus API
```javascript
// Подписка на события
eventBus.on('ADDRESS_UPDATED', handler);

// Генерация событий
eventBus.emit('ADDRESS_UPDATED', addressData);

// Основные события системы
CONSTANTS.EVENTS = {
    ADDRESSES_LOADED: 'addresses-loaded',
    LISTINGS_IMPORTED: 'listings-imported',
    AREA_UPDATED: 'area-updated',
    SEGMENT_CREATED: 'segment-created'
};
```

#### DataState API
```javascript
// Получение состояния
const addresses = dataState.getState('addresses');
const currentArea = dataState.getState('currentArea');

// Установка состояния
dataState.setState('addresses', addressesArray);
dataState.setState('listings', listingsArray);
```

### Внешние API

#### Inpars.ru API
- **Базовый URL:** `https://api.inpars.ru/`
- **Авторизация:** API ключ в заголовках
- **Rate Limits:** 100 запросов/минуту
- **Основные endpoints:**
  - `/building/info` - информация о здании
  - `/subscription/status` - статус подписки

#### Overpass API (OpenStreetMap)
- **Базовый URL:** `https://overpass-api.de/api/`
- **Формат:** Overpass QL
- **Использование:** геокодирование и получение геоданных

---

## База данных

### Схема IndexedDB (версия 17)

#### Основные таблицы

**map_areas** - Области анализа
```sql
id (string, primary key)
name (string)
polygon (array of coordinates)
created_at (timestamp)
updated_at (timestamp)
```

**addresses** - Адреса недвижимости
```sql
id (string, primary key)
address (string)
coordinates (object: {lat, lng})
map_area_id (string, foreign key)
house_series_id (string)
house_class_id (string)
wall_material_id (string)
floors_count (integer)
build_year (integer)
created_at (timestamp)
```

**listings** - Объявления о продаже/аренде
```sql
id (string, primary key)  
address_id (string, foreign key)
title (string)
price (integer)
area (float)
source (string: 'avito'|'cian')
url (string)
parsed_at (timestamp)
```

**segments** - Сегменты рынка
```sql
id (string, primary key)
name (string)
map_area_id (string, foreign key)
filters (object)
created_at (timestamp)
```

#### Справочные таблицы

- **house_series** - Серии домов
- **house_classes** - Классы недвижимости  
- **wall_materials** - Материалы стен
- **ceiling_materials** - Материалы перекрытий
- **house_problems** - Проблемы домов

### Индексы производительности

- Пространственный индекс на `addresses.coordinates` (RBush)
- Составной индекс на `listings(address_id, parsed_at)`
- Индекс на `segments.map_area_id`

---

## Интеграции

### Парсинг сайтов

#### Avito.ru
- **Content Script:** `avito-parser.js`
- **Поддерживаемые страницы:** карточки объявлений, списки
- **Извлекаемые данные:** цена, площадь, адрес, характеристики
- **Особенности:** история цен, фотографии

#### Cian.ru  
- **Content Script:** `cian-parser.js`
- **Поддерживаемые страницы:** карточки объявлений, каталог
- **Извлекаемые данные:** цена, площадь, адрес, планировка
- **Особенности:** детальная планировка, ЖК информация

### Внешние сервисы

#### GitHub API
- **Использование:** автоматические обновления расширения
- **Endpoint:** проверка релизов через GitHub API
- **Частота:** проверка при запуске приложения

#### Overpass API
- **Использование:** геокодирование адресов
- **Формат запросов:** Overpass QL
- **Кэширование:** локальное кэширование результатов

---

## Развертывание и сборка

### Команды сборки
```bash
# Установка зависимостей
npm install

# Сборка CSS (development)
npm run build-css

# Сборка CSS (production)  
npm run build

# Упаковка расширения
npm run package

# Полная сборка с ZIP
npm run build-extension
```

### Структура релиза
```
neocenka-extension-v0.3.4.zip
├── manifest.json
├── background/
├── content-scripts/
├── popup/
├── pages/
├── data/
├── utils/
├── services/
├── libs/
└── icons/
```

### Процесс обновления
1. GitHub Actions собирает релиз
2. Обновляется `updates.xml`
3. Extension автоматически проверяет обновления
4. Пользователь получает уведомление об обновлении

---

## Тестирование

### Структура тестов
- **Модульные тесты:** `/tests/js/`
- **Интеграционные тесты:** `/tests/*.html`
- **Ручное тестирование:** через HTML страницы

### Ключевые тест-кейсы
- Парсинг данных с Avito/Cian
- Геопространственные вычисления
- Миграции базы данных
- API интеграции
- UI компоненты

### Запуск тестов
```bash
# Открыть тестовую страницу в браузере
open tests/index.html

# Специфичные тесты
open tests/test-database-init.html
open tests/test-geometry-utils.html
```

---

## Ссылки на документацию файлов

### Core Architecture
- [DataState.js](pages/core/doc_DataState.md) - Управление состоянием
- [EventBus.js](pages/core/doc_EventBus.md) - Система событий  
- [ProgressManager.js](pages/core/doc_ProgressManager.md) - Индикаторы прогресса

### Managers
- [MapManager.js](pages/managers/doc_MapManager.md) - Управление картами
- [AddressManager.js](pages/managers/doc_AddressManager.js) - Работа с адресами
- [SegmentsManager.js](pages/managers/doc_SegmentsManager.md) - Управление сегментами
- [UIManager.js](pages/managers/doc_UIManager.md) - UI компоненты

### Services  
- [BaseAPIService.js](services/base/doc_BaseAPIService.md) - Базовый API сервис
- [InparsService.js](services/external/doc_InparsService.md) - Inpars интеграция

### Data Layer
- [database.js](data/doc_database.md) - IndexedDB работа
- [models.js](data/doc_models.md) - Модели данных

### Utils
- [geometry-utils.js](utils/doc_geometry-utils.md) - Геометрические вычисления
- [duplicate-detector.js](utils/doc_duplicate-detector.md) - Поиск дубликатов

### Content Scripts
- [avito-parser.js](content-scripts/doc_avito-parser.md) - Парсер Avito
- [cian-parser.js](content-scripts/doc_cian-parser.md) - Парсер Cian

### Additional Documentation  
- [doc_ARCHITECTURE_ISSUES.md](doc_ARCHITECTURE_ISSUES.md) - Архитектурные проблемы и рекомендации
- [doc_API_REFERENCE.md](doc_API_REFERENCE.md) - Справочник API
- [doc_TESTING.md](doc_TESTING.md) - Руководство по тестированию

---

## Контакты и поддержка

- **GitHub:** https://github.com/DmitryKrasavtsev1980/neocenka-extension
- **Версия документации:** v1.0 (август 2025)
- **Автор документации:** Claude Code Assistant

---

*Эта документация автоматически сгенерирована на основе анализа кодовой базы проекта Neocenka Extension v0.3.4*