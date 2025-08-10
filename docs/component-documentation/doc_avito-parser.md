# AvitoParser.js - Документация

> **Файл:** `content-scripts/avito-parser.js`  
> **Размер:** ~2000+ строк  
> **Назначение:** Content Script для парсинга данных с сайта Avito.ru  
> **Тип:** Парсер недвижимости + API перехватчик

## Обзор

AvitoParser является ключевым компонентом для извлечения данных о недвижимости с сайта Avito.ru. Работает как content script в браузере, анализирует DOM структуру страниц и перехватывает API вызовы для сбора максимально полной информации об объявлениях.

## Основные возможности

- 🎯 **Парсинг объявлений** - извлечение данных из HTML страниц
- 📡 **API перехват** - мониторинг AJAX запросов Avito  
- 💰 **История цен** - отслеживание изменений стоимости
- 🔍 **Детекция списков** - определение страниц с объявлениями
- 🛡️ **Стелс-режим** - скрытое логирование без засветки в консоли
- 📱 **Адаптивность** - поддержка мобильной и десктопной версий

## Архитектура

### Инициализация
```javascript
class AvitoParser {
    constructor() {
        // Определяем тип страницы
        this.isListingPage = this.checkIsListingPage();
        
        // Настраиваем перехват сообщений
        if (this.isListingPage) {
            this.setupMessageListener();
            window.avitoParserInstance = this; // Глобальный доступ
        }
        
        // Перехватываем API вызовы
        this.setupAPIInterception();
        
        // Отслеживаем изменения цен при скролле
        this.initScrollPriceTracking();
    }
}
```

### Безопасное логирование
```javascript
// Отправка логов в background script без засветки в консоли сайта
safeLog(level, ...args) {
    const message = {
        action: 'debugLog',
        level: level,
        source: 'avito-parser',
        url: window.location.href,
        timestamp: new Date().toISOString(),
        data: args.map(arg => this.serialize(arg))
    };
    
    chrome.runtime.sendMessage(message).catch(() => {
        // Молчаливо игнорируем ошибки
    });
}
```

## Ключевые методы

### Определение типа страницы
```javascript
checkIsListingPage() {
    const url = window.location.href;
    const currentPath = window.location.pathname;
    
    // Проверяем различные паттерны URL Avito
    const listingPatterns = [
        /\/realty\/.*\/sell/,           // Продажа недвижимости
        /\/realty\/.*\/rent/,           // Аренда недвижимости  
        /\/nedvizhimost\//,             // Старый формат
    ];
    
    return listingPatterns.some(pattern => pattern.test(url));
}
```

### Парсинг данных объявления
```javascript
extractListingData() {
    try {
        const data = {
            // Основная информация
            title: this.extractTitle(),
            price: this.extractPrice(),
            address: this.extractAddress(),
            description: this.extractDescription(),
            
            // Характеристики
            area: this.extractArea(),
            rooms: this.extractRooms(),
            floor: this.extractFloor(),
            totalFloors: this.extractTotalFloors(),
            
            // Метаданные
            url: window.location.href,
            images: this.extractImages(),
            publishDate: this.extractPublishDate(),
            lastUpdate: this.extractLastUpdate(),
            
            // Контакты продавца
            seller: this.extractSellerInfo(),
            
            // История цен (если доступна)
            priceHistory: this.foundPriceHistory
        };
        
        return data;
    } catch (error) {
        this.safeLog('error', 'Ошибка извлечения данных:', error);
        return null;
    }
}
```

### API перехват
```javascript
setupAPIInterception() {
    // Перехватываем XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (url.includes('/api/') || url.includes('price_history')) {
            this.addEventListener('load', () => {
                window.avitoParserInstance?.handleAPIResponse(url, this.response);
            });
        }
        return originalXHROpen.apply(this, arguments);
    };
    
    // Перехватываем Fetch API
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const url = args[0];
        
        if (typeof url === 'string' && (url.includes('/api/') || url.includes('price_history'))) {
            const clonedResponse = response.clone();
            const data = await clonedResponse.text();
            window.avitoParserInstance?.handleAPIResponse(url, data);
        }
        
        return response;
    };
}
```

### Отслеживание динамических изменений
```javascript
initScrollPriceTracking() {
    // Отслеживаем появление новых объявлений при скролле
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Проверяем на новые объявления
                        this.checkForNewListings(node);
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
```

## Алгоритмы извлечения данных

### Извлечение цены
```javascript
extractPrice() {
    const selectors = [
        '[data-marker="item-price"] .price-value-string',
        '[data-marker="item-price"] span[content]',
        '.price-info .price-value',
        '.js-price-info-header .price'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            const priceText = element.textContent || element.getAttribute('content');
            const price = this.parsePrice(priceText);
            if (price > 0) {
                return price;
            }
        }
    }
    
    return null;
}

parsePrice(priceText) {
    if (!priceText) return null;
    
    // Убираем все кроме цифр
    const numbers = priceText.replace(/[^\d]/g, '');
    const price = parseInt(numbers, 10);
    
    return isNaN(price) ? null : price;
}
```

### Извлечение адреса
```javascript
extractAddress() {
    const selectors = [
        '[data-marker="item-address"] .item-address-georeferences-item__content',
        '[data-marker="item-address"] span[class*="geo"]',
        '.item-address-georeferences .item-address-georeferences-item',
        '.geo-root-zPwY7 .geo-georeferences'
    ];
    
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            // Собираем полный адрес из частей
            const addressParts = Array.from(elements)
                .map(el => el.textContent?.trim())
                .filter(text => text && text.length > 0);
                
            if (addressParts.length > 0) {
                return addressParts.join(', ');
            }
        }
    }
    
    return null;
}
```

### Извлечение изображений
```javascript
extractImages() {
    const images = [];
    
    // Основные изображения в галерее
    const galleryImages = document.querySelectorAll('.gallery-img-wrapper img, .photo-slider-image img');
    galleryImages.forEach(img => {
        const src = img.src || img.dataset.src;
        if (src && !src.includes('placeholder')) {
            images.push(this.normalizeImageUrl(src));
        }
    });
    
    // Миниатюры
    const thumbnails = document.querySelectorAll('.gallery-thumbnails img');
    thumbnails.forEach(img => {
        const src = img.src || img.dataset.src;
        if (src && !src.includes('placeholder')) {
            const fullSize = this.convertThumbnailToFull(src);
            if (!images.includes(fullSize)) {
                images.push(fullSize);
            }
        }
    });
    
    return images;
}

normalizeImageUrl(url) {
    // Конвертируем в полноразмерную версию
    return url.replace(/\/\d+x\d+\//, '/1200x900/');
}
```

## Обработка различных типов страниц

### Страница отдельного объявления
```javascript
parseItemPage() {
    return {
        type: 'item',
        data: this.extractListingData(),
        coordinates: this.extractCoordinates(),
        contact: this.extractContactInfo(),
        similar: this.extractSimilarListings()
    };
}
```

### Страница списка объявлений
```javascript
parseListingPage() {
    const listings = [];
    const itemElements = document.querySelectorAll('[data-marker="item"]');
    
    itemElements.forEach(element => {
        try {
            const listing = this.extractListingFromElement(element);
            if (listing) {
                listings.push(listing);
            }
        } catch (error) {
            this.safeLog('warn', 'Ошибка парсинга элемента списка:', error);
        }
    });
    
    return {
        type: 'listing',
        items: listings,
        pagination: this.extractPagination(),
        filters: this.extractActiveFilters(),
        totalCount: this.extractTotalCount()
    };
}
```

## Обработка API ответов

### Анализ перехваченных данных
```javascript
handleAPIResponse(url, responseData) {
    try {
        // Пытаемся парсить JSON
        let data;
        try {
            data = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
        } catch (e) {
            return; // Не JSON данные
        }
        
        // История цен
        if (url.includes('price_history') || (data && data.priceHistory)) {
            this.foundPriceHistory = this.processPriceHistory(data);
            this.safeLog('info', 'Найдена история цен:', this.foundPriceHistory);
        }
        
        // Дополнительная информация об объявлении
        if (url.includes('/item/') && data.item) {
            this.processItemData(data.item);
        }
        
        // Геоданные
        if ((url.includes('geo') || url.includes('map')) && data.coordinates) {
            this.processGeoData(data.coordinates);
        }
        
    } catch (error) {
        this.safeLog('error', 'Ошибка обработки API ответа:', error);
    }
}
```

### Обработка истории цен
```javascript
processPriceHistory(data) {
    try {
        // Различные форматы данных истории цен
        let priceHistory = null;
        
        if (data.priceHistory && Array.isArray(data.priceHistory)) {
            priceHistory = data.priceHistory;
        } else if (data.price_changes) {
            priceHistory = data.price_changes;
        } else if (data.history) {
            priceHistory = data.history;
        }
        
        if (priceHistory && priceHistory.length > 0) {
            return priceHistory.map(item => ({
                date: new Date(item.date || item.timestamp),
                price: parseInt(item.price || item.value, 10),
                change: item.change || null
            })).filter(item => !isNaN(item.price));
        }
        
        return null;
    } catch (error) {
        this.safeLog('error', 'Ошибка обработки истории цен:', error);
        return null;
    }
}
```

## Обработка сообщений от расширения

### Коммуникация с background script
```javascript
setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
            switch (message.action) {
                case 'parseCurrentPage':
                    const pageData = this.parseCurrentPage();
                    sendResponse({ success: true, data: pageData });
                    break;
                    
                case 'extractListingData':
                    const listingData = this.extractListingData();
                    sendResponse({ success: true, data: listingData });
                    break;
                    
                case 'getPageInfo':
                    sendResponse({
                        success: true,
                        data: {
                            url: window.location.href,
                            isListingPage: this.isListingPage,
                            title: document.title
                        }
                    });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            this.safeLog('error', 'Ошибка обработки сообщения:', error);
            sendResponse({ success: false, error: error.message });
        }
    });
}
```

## Проблемы и ограничения

### 1. Изменения в DOM структуре Avito
```javascript
// ❌ ПРОБЛЕМА: Хрупкие селекторы
const priceElement = document.querySelector('.specific-class-name');

// ✅ РЕШЕНИЕ: Множественные селекторы с fallback
const selectors = [
    '.price-new-format',
    '.price-old-format', 
    '[data-marker="price"]',
    '.legacy-price'
];
```

### 2. Anti-bot защита
- Avito использует различные методы детекции автоматизации
- Необходима осторожность с частотой запросов
- Важно не оставлять следов в консоли сайта

### 3. Динамическая загрузка контента
```javascript
// Обработка lazy-loading содержимого
waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        setTimeout(() => {
            observer.disconnect();
            reject(new Error('Element not found within timeout'));
        }, timeout);
    });
}
```

## API Reference

### Основные методы

#### `extractListingData(): object | null`
Извлекает данные текущего объявления.

**Возвращает:**
```javascript
{
    title: string,
    price: number,
    address: string,
    area: number,
    rooms: number,
    floor: number,
    totalFloors: number,
    url: string,
    images: string[],
    seller: object,
    priceHistory: array
}
```

#### `parseCurrentPage(): object`
Анализирует текущую страницу и возвращает извлеченные данные.

#### `checkIsListingPage(): boolean`
Определяет, является ли текущая страница страницей с объявлениями.

### События и сообщения

#### Сообщения от расширения
- `parseCurrentPage` - парсинг текущей страницы
- `extractListingData` - извлечение данных объявления
- `getPageInfo` - получение информации о странице

#### Исходящие события
- `debugLog` - отладочная информация
- `dataExtracted` - данные извлечены  
- `apiIntercepted` - перехвачен API вызов

## Связанные файлы

- [`cian-parser.js`](doc_cian-parser.md) - парсер для Cian.ru
- [`../background/background.js`](../background/doc_background.md) - background script
- [`../pages/managers/ParsingManager.js`](../pages/managers/doc_ParsingManager.md) - координация парсинга

## Заключение

AvitoParser является критически важным компонентом для сбора данных о недвижимости. Требует постоянного обновления для адаптации к изменениям в структуре сайта Avito.ru.

**Рекомендации:**
- ✅ Регулярно обновлять селекторы DOM элементов  
- ✅ Мониторить изменения API эндпоинтов
- ✅ Поддерживать стелс-режим работы
- ❌ Не превышать лимиты запросов к сайту

---

*Парсер работает в content-script окружении с ограниченным доступом к Chrome Extensions API.*