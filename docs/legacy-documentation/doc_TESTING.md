# Testing Guide - Neocenka Extension

> **Версия:** v1.0  
> **Дата:** Август 2025  
> **Статус:** 🔴 Требует значительных улучшений  

## Содержание

1. [Текущее состояние тестирования](#текущее-состояние-тестирования)
2. [Структура тестов](#структура-тестов)
3. [Типы тестов](#типы-тестов)
4. [Запуск тестов](#запуск-тестов)
5. [Проблемы и недостатки](#проблемы-и-недостатки)
6. [Рекомендации по улучшению](#рекомендации-по-улучшению)

---

## Текущее состояние тестирования

### 📊 Общая статистика

- **Юнит-тесты:** ❌ Отсутствуют
- **Интеграционные тесты:** ⚠️ Частично (через HTML файлы)
- **E2E тесты:** ❌ Отсутствуют
- **Покрытие кода:** ❌ Не измеряется (~0%)
- **Автоматизация:** ❌ Только ручное тестирование

### 🎯 Текущий подход

Все тестирование происходит через HTML страницы в директории `/tests/`:

```
tests/
├── index.html                     # Центр тестирования
├── test-*.html                    # Специфичные тесты
└── js/
    ├── testing-center.js          # Утилиты тестирования
    ├── test-*.js                  # Логика тестов
    └── database-tester.js         # Тесты БД
```

---

## Структура тестов

### Главный тестовый центр

**Файл:** `tests/index.html`
- Центральная точка входа для всех тестов
- Навигация по различным тест-сьютам
- Общие утилиты и настройки

### Специализированные тесты

#### Database Tests
- **Файлы:** `test-database-init.html`, `test-db-migration.html`
- **Назначение:** Тестирование схемы БД, миграций, CRUD операций
- **Статус:** ✅ Работают, но требуют ручного запуска

#### Parser Tests  
- **Файлы:** `test-avito-parser-integration.html`, `verify-area-parsing.html`
- **Назначение:** Тестирование парсеров Avito/Cian
- **Статус:** ⚠️ Частично работают, зависят от живых сайтов

#### UI Tests
- **Файлы:** `test-main-page-button.html`, `test-navigation.html`
- **Назначение:** Тестирование UI компонентов
- **Статус:** ⚠️ Базовое тестирование взаимодействий

#### Geometry Tests
- **Файлы:** `test-geometry-utils.html`, `test-geo-performance.html`  
- **Назначение:** Тестирование геопространственных вычислений
- **Статус:** ✅ Хорошее покрытие алгоритмов

#### API Integration Tests
- **Файлы:** `test-inpars-price-history.html`, `debug-inpars-data.html`
- **Назначение:** Тестирование внешних API
- **Статус:** ⚠️ Зависят от доступности внешних сервисов

### Пример тестового файла

```html
<!-- test-geometry-utils.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Geometry Utils Test</title>
    <script src="../utils/geometry-utils.js"></script>
    <script src="js/testing-center.js"></script>
</head>
<body>
    <div id="test-results"></div>
    
    <script>
        const testSuite = new TestSuite('GeometryUtils');
        
        testSuite.addTest('Point in Polygon', () => {
            const point = {lat: 55.0, lng: 82.0};
            const polygon = [
                {lat: 54.9, lng: 81.9},
                {lat: 55.1, lng: 81.9}, 
                {lat: 55.1, lng: 82.1},
                {lat: 54.9, lng: 82.1}
            ];
            
            const result = GeometryUtils.isPointInPolygon(point, polygon);
            assert(result === true, 'Point should be inside polygon');
        });
        
        testSuite.run();
    </script>
</body>
</html>
```

---

## Типы тестов

### 1. Unit Tests (Отсутствуют) 

**Что должно тестироваться:**
```javascript
// Пример отсутствующих юнит-тестов
describe('AddressManager', () => {
    describe('validateAddress', () => {
        it('should reject address without coordinates', () => {
            const manager = new AddressManager();
            const result = manager.validateAddress({address: 'Test'});
            expect(result.valid).toBe(false);
        });
    });
});

describe('GeometryUtils', () => {
    describe('calculateDistance', () => {
        it('should calculate distance between two points', () => {
            const distance = GeometryUtils.calculateDistance(
                {lat: 0, lng: 0}, 
                {lat: 1, lng: 1}
            );
            expect(distance).toBeCloseTo(157.2, 1);
        });
    });
});
```

### 2. Integration Tests (Частично реализованы)

**Текущие интеграционные тесты:**

#### Database Integration
```javascript
// test-database-init.html
async function testDatabaseMigration() {
    try {
        await window.db.initialize();
        
        // Test schema creation
        const stores = await window.db.getStoreNames();
        assert(stores.includes('addresses'), 'Addresses store should exist');
        assert(stores.includes('segments'), 'Segments store should exist');
        
        // Test basic CRUD
        const testAddress = {
            address: 'Test Address',
            coordinates: {lat: 55.0, lng: 82.0},
            type: 'apartment'
        };
        
        const id = await window.db.add('addresses', testAddress);
        const retrieved = await window.db.get('addresses', id);
        
        assert(retrieved.address === 'Test Address', 'Address should be saved and retrieved');
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

#### Parser Integration  
```javascript
// test-avito-parser-integration.html
function testAvitoParser() {
    // Тестирование на реальной странице Avito
    if (window.location.hostname !== 'avito.ru') {
        return { success: false, error: 'Must run on Avito.ru' };
    }
    
    const parser = new AvitoParser();
    const data = parser.extractListingData();
    
    assert(data.price > 0, 'Price should be extracted');
    assert(data.address.length > 0, 'Address should be extracted');
    
    return { success: true, data };
}
```

### 3. E2E Tests (Отсутствуют)

**Что должно быть:**
```javascript
// Пример отсутствующих E2E тестов
describe('Complete Workflow', () => {
    it('should create area, add addresses, create segment', async () => {
        // 1. Open area page
        await page.goto('/pages/area.html');
        
        // 2. Create new area
        await page.click('#createAreaBtn');
        await page.fill('#areaName', 'Test Area');
        await page.click('#saveAreaBtn');
        
        // 3. Draw polygon on map
        await page.click('.leaflet-draw-draw-polygon');
        await drawPolygonOnMap(page);
        
        // 4. Add addresses
        await page.click('#importAddressesBtn');
        // ... continue workflow
        
        // 5. Create segment
        await page.click('#createSegmentBtn');
        // ... verify segment creation
    });
});
```

---

## Запуск тестов

### Текущий процесс (ручной)

1. **Открыть тестовый центр:**
   ```
   chrome-extension://[extension-id]/tests/index.html
   ```

2. **Выбрать нужный тест:**
   - Database tests → `test-database-init.html`
   - Parser tests → `test-avito-parser-integration.html`
   - UI tests → `test-navigation.html`

3. **Просмотреть результаты:**
   - Результаты отображаются в браузере
   - Ошибки выводятся в консоль
   - Нет агрегации результатов

### Утилиты тестирования

```javascript
// testing-center.js - основные утилиты
class TestSuite {
    constructor(name) {
        this.name = name;
        this.tests = [];
        this.results = [];
    }
    
    addTest(name, testFunction) {
        this.tests.push({ name, testFunction });
    }
    
    async run() {
        for (const test of this.tests) {
            try {
                await test.testFunction();
                this.results.push({ name: test.name, status: 'passed' });
            } catch (error) {
                this.results.push({ 
                    name: test.name, 
                    status: 'failed', 
                    error: error.message 
                });
            }
        }
        this.displayResults();
    }
}

// Простые assert функции
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}
```

---

## Проблемы и недостатки

### 🔴 Критические проблемы

1. **Отсутствие автоматизации**
   - Все тесты запускаются вручную
   - Нет CI/CD интеграции
   - Результаты не сохраняются

2. **Нет юнит-тестов**
   - Невозможно тестировать изолированные компоненты
   - Рефакторинг очень рискован
   - Отладка сложна

3. **Зависимость от внешних сервисов**
   ```javascript
   // ❌ ПРОБЛЕМА: Тест зависит от живого сайта
   function testAvitoParser() {
       if (!window.location.href.includes('avito.ru')) {
           throw new Error('Must run on Avito.ru');
       }
       // Тест может сломаться при изменении сайта
   }
   ```

4. **Отсутствие моков и стабов**
   ```javascript
   // ❌ ПРОБЛЕМА: Прямые вызовы внешних API
   async function testInparsIntegration() {
       const result = await InparsService.getBuildingInfo('real address');
       // Тест зависит от доступности API
   }
   ```

### 🟡 Средние проблемы

1. **Нет покрытия кода**
   - Неизвестно, какая часть кода протестирована
   - Невозможно отследить регрессии

2. **Отсутствие параллелизации**
   - Тесты выполняются последовательно
   - Долгое время выполнения

3. **Плохая изоляция тестов**
   ```javascript
   // ❌ ПРОБЛЕМА: Тесты могут влиять друг на друга
   let globalTestData = [];
   
   function test1() {
       globalTestData.push('data1'); // Влияет на test2
   }
   
   function test2() {
       assertEqual(globalTestData.length, 0); // Может упасть
   }
   ```

---

## Рекомендации по улучшению

### Phase 1: Настройка инфраструктуры тестирования

#### 1. Добавить Jest для юнит-тестов

```bash
npm install --save-dev jest @types/jest
```

```javascript
// package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "jest": {
    "testEnvironment": "jsdom",
    "setupFilesAfterEnv": ["<rootDir>/tests/setup.js"],
    "coverageDirectory": "coverage",
    "collectCoverageFrom": [
      "pages/**/*.js",
      "utils/**/*.js",
      "services/**/*.js",
      "!**/*.test.js"
    ]
  }
}
```

#### 2. Создать тестовые утилиты

```javascript
// tests/setup.js
global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    },
    runtime: {
        sendMessage: jest.fn()
    }
};

// Mock IndexedDB
global.indexedDB = require('fake-indexeddb');
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
```

### Phase 2: Написание юнит-тестов

#### Тесты для утилит
```javascript
// tests/utils/geometry-utils.test.js
describe('GeometryUtils', () => {
    describe('isPointInPolygon', () => {
        test('should return true for point inside polygon', () => {
            const point = { lat: 55.0, lng: 82.0 };
            const polygon = [
                { lat: 54.9, lng: 81.9 },
                { lat: 55.1, lng: 81.9 },
                { lat: 55.1, lng: 82.1 },
                { lat: 54.9, lng: 82.1 }
            ];
            
            const result = GeometryUtils.isPointInPolygon(point, polygon);
            expect(result).toBe(true);
        });
        
        test('should return false for point outside polygon', () => {
            const point = { lat: 56.0, lng: 82.0 };
            const polygon = [
                { lat: 54.9, lng: 81.9 },
                { lat: 55.1, lng: 81.9 },
                { lat: 55.1, lng: 82.1 },
                { lat: 54.9, lng: 82.1 }
            ];
            
            const result = GeometryUtils.isPointInPolygon(point, polygon);
            expect(result).toBe(false);
        });
    });
    
    describe('calculateDistance', () => {
        test('should calculate correct distance between points', () => {
            const point1 = { lat: 0, lng: 0 };
            const point2 = { lat: 1, lng: 1 };
            
            const distance = GeometryUtils.calculateDistance(point1, point2);
            expect(distance).toBeCloseTo(157.2, 1);
        });
    });
});
```

#### Тесты для менеджеров
```javascript
// tests/managers/address-manager.test.js
describe('AddressManager', () => {
    let addressManager;
    let mockDataState;
    let mockEventBus;
    
    beforeEach(() => {
        mockDataState = {
            getState: jest.fn(),
            setState: jest.fn()
        };
        
        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn()
        };
        
        addressManager = new AddressManager(mockDataState, mockEventBus);
    });
    
    describe('validateAddress', () => {
        test('should validate correct address', () => {
            const address = {
                address: 'Test Street 1',
                coordinates: { lat: 55.0, lng: 82.0 },
                type: 'apartment'
            };
            
            const result = addressManager.validateAddress(address);
            expect(result.isValid).toBe(true);
        });
        
        test('should reject address without coordinates', () => {
            const address = {
                address: 'Test Street 1',
                type: 'apartment'
            };
            
            const result = addressManager.validateAddress(address);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('coordinates required');
        });
    });
});
```

### Phase 3: Интеграционные тесты с моками

```javascript
// tests/integration/segment-workflow.test.js
describe('Segment Workflow Integration', () => {
    let segmentManager;
    let addressManager; 
    let mockDatabase;
    
    beforeEach(() => {
        mockDatabase = {
            get: jest.fn(),
            add: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        };
        
        addressManager = new AddressManager(mockDataState, mockEventBus);
        segmentManager = new SegmentManager(mockDataState, mockEventBus);
    });
    
    test('should create segment with addresses', async () => {
        // Setup test data
        const addresses = [
            { id: '1', address: 'Test 1', coordinates: { lat: 55.0, lng: 82.0 } },
            { id: '2', address: 'Test 2', coordinates: { lat: 55.1, lng: 82.1 } }
        ];
        
        mockDatabase.getAll.mockResolvedValue(addresses);
        
        // Create segment
        const segmentData = {
            name: 'Test Segment',
            filters: { property_type: ['apartment'] }
        };
        
        const segment = await segmentManager.createSegment(segmentData);
        
        // Verify
        expect(segment.id).toBeDefined();
        expect(mockDatabase.add).toHaveBeenCalledWith('segments', expect.objectContaining({
            name: 'Test Segment'
        }));
    });
});
```

### Phase 4: E2E тесты с Playwright

```javascript
// tests/e2e/area-management.spec.js
import { test, expect } from '@playwright/test';

test.describe('Area Management', () => {
    test('should create and manage area', async ({ page }) => {
        // Navigate to extension
        await page.goto('chrome-extension://[extension-id]/pages/area.html');
        
        // Create new area
        await page.click('#createAreaBtn');
        await page.fill('#areaName', 'Test Area E2E');
        await page.click('#saveAreaBtn');
        
        // Verify area created
        await expect(page.locator('.area-item')).toContainText('Test Area E2E');
        
        // Draw polygon
        await page.click('.leaflet-draw-draw-polygon');
        
        // Simulate polygon drawing (complex interaction)
        const mapElement = page.locator('#map');
        await mapElement.click({ position: { x: 100, y: 100 } });
        await mapElement.click({ position: { x: 200, y: 100 } });
        await mapElement.click({ position: { x: 200, y: 200 } });
        await mapElement.click({ position: { x: 100, y: 200 } });
        await mapElement.click({ position: { x: 100, y: 100 } }); // Close polygon
        
        // Verify polygon created
        await expect(page.locator('.leaflet-interactive')).toBeVisible();
    });
});
```

### Phase 5: CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
    
    - name: Run E2E tests
      run: npx playwright test
```

---

## Заключение

Текущее состояние тестирования в проекте Neocenka требует кардинального улучшения. Отсутствие юнит-тестов и автоматизации создает значительные риски при разработке и рефакторинге.

**Приоритетные действия:**
1. 🚨 **КРИТИЧНО**: Настроить Jest и написать юнит-тесты для утилит
2. 🔴 **ВАЖНО**: Создать моки для внешних зависимостей  
3. 🟡 **ЖЕЛАТЕЛЬНО**: Добавить E2E тесты с Playwright
4. 🟡 **ЖЕЛАТЕЛЬНО**: Настроить CI/CD с автоматическим запуском тестов

При правильной реализации система тестирования значительно повысит качество кода и скорость разработки.

---

*Testing Guide v1.0 для Neocenka Extension v0.3.4*