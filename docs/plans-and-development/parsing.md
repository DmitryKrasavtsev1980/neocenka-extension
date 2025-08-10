# Запрос
Нужно проработать концепцию работы расширения, предложить технологии по реализации и план поместить в  
  '/mnt/c/Projects/neocenka-extension/parsing.md', описание: у расширения есть функции парсинга, это: 1. 
  массовый парсинг по фильтру новых объявлений. 2. парсинг нового объявления. 3. обновление активных     
  объявлений. Проблема: сайты меняют вёрстку и нужно поддерживать парсеры в актуальном состоянии. Делать 
  обновление расширения, это сложно для пользователя. Я хотел бы вынести код парсинга за пределы
  расширения, чтобы если парсер сломан и дорабатывается у пользователей было сообщение, что парсинг в    
  текущий момент ограничен, но как только новая версия кода парсинга появится, то сразу будет доступна в 
  расширении и пользователь сможет запускать процессы парсинга. Есть ли возможность создать такую        
  архитектуру расширения? напиши план реализации и возможные варианты.

  нужно чтобы сам парсинг происходил у  
  пользователя в браузере


# Концепция динамической загрузки парсеров

## Проблема

Расширение Neocenka использует парсеры для извлечения данных с сайтов недвижимости (Avito.ru, Cian.ru). Основные проблемы:

1. **Изменение верстки сайтов** - сайты регулярно обновляют HTML-структуру, что ломает селекторы
2. **Сложность обновления** - для исправления парсеров нужно обновлять все расширение
3. **Время простоя** - пока готовится обновление, парсинг не работает
4. **Антипарсинг защита** - сайты могут детектировать устаревшие парсеры

## Концепция решения

**Динамическая загрузка кода парсеров** - парсинг происходит локально в браузере пользователя, но код парсера загружается из внешнего источника.

### Преимущества
- ✅ Парсинг остается локальным (безопасность)
- ✅ Мгновенные обновления парсеров без обновления расширения
- ✅ Откат к предыдущей версии при проблемах
- ✅ A/B тестирование новых версий парсеров
- ✅ Централизованное управление совместимостью

## Архитектура решения

### 1. Текущая архитектура
```
Chrome Extension
├── content-scripts/
│   ├── avito-parser.js (статический)
│   ├── cian-parser.js (статический)
│   └── avito-test-history-price.js (статический)
├── background/
│   └── background.js
└── pages/
    └── управление данными
```

### 2. Новая архитектура
```
Chrome Extension
├── content-scripts/
│   ├── parser-loader.js (загрузчик)
│   └── parser-interface.js (интерфейс)
├── services/
│   ├── parser-updater.js (обновления)
│   └── parser-cache.js (кэширование)
└── parsers/ (локальное хранилище)
    ├── avito-parser-v1.2.3.js
    ├── cian-parser-v1.1.5.js
    └── metadata.json

Внешний сервер парсеров
├── api/
│   ├── /versions - список версий
│   ├── /download/{parser}/{version} - загрузка
│   └── /status - статус работоспособности
└── parsers/
    ├── avito-parser.js
    ├── cian-parser.js
    └── metadata.json
```

## Технические решения

### Вариант 1: GitHub + CDN (Рекомендуется)

**Репозиторий парсеров:**
```
neocenka-parsers/
├── parsers/
│   ├── avito/
│   │   ├── parser.js
│   │   ├── metadata.json
│   │   └── tests.js
│   └── cian/
│       ├── parser.js
│       ├── metadata.json
│       └── tests.js
├── api/
│   └── versions.json
└── .github/workflows/
    └── release.yml
```

**API через GitHub Pages:**
- `https://parsers.neocenka.com/api/versions.json`
- `https://parsers.neocenka.com/parsers/avito/parser.js`

**Преимущества:**
- ✅ Бесплатно
- ✅ Контроль версий
- ✅ Автоматические релизы
- ✅ CDN распространение

### Вариант 2: Собственный API сервер

**Бэкенд на Node.js/Python:**
```javascript
// API эндпоинты
GET /api/parsers/versions - список версий
GET /api/parsers/{name}/{version} - загрузка парсера
POST /api/parsers/report - отчет об ошибках
GET /api/parsers/status - статус работоспособности
```

### Вариант 3: Chrome Extension Storage + Background Sync

**Использование встроенных возможностей Chrome:**
```javascript
// background.js
chrome.alarms.create('updateParsers', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(updateParsersFromServer);
```

## План реализации

### Этап 1: Подготовка инфраструктуры
1. **Создать репозиторий парсеров** - `neocenka-parsers`
2. **Настроить GitHub Actions** - автоматическая сборка и деплой
3. **Создать API для версий** - `versions.json` с метаданными
4. **Добавить тесты парсеров** - проверка работоспособности

### Этап 2: Разработка загрузчика
1. **ParserLoader класс** - загрузка и кэширование парсеров
2. **ParserInterface** - унифицированный интерфейс для всех парсеров
3. **Система версионирования** - семантическое версионирование
4. **Fallback механизм** - откат к локальным парсерам при сбоях

### Этап 3: Миграция существующих парсеров
1. **Извлечь парсеры** - вынести avito-parser.js, cian-parser.js
2. **Стандартизировать интерфейс** - единый API для всех парсеров
3. **Добавить метаданные** - версии, совместимость, зависимости
4. **Создать тесты** - проверка селекторов и логики

### Этап 4: Интеграция в расширение
1. **Обновить manifest.json** - разрешения для внешних запросов
2. **Заменить статические парсеры** - на динамический loader
3. **Добавить UI уведомления** - статус парсеров, обновления
4. **Система отчетов** - отправка ошибок разработчикам

## Техническая реализация

### ParserLoader класс
```javascript
class ParserLoader {
    constructor() {
        this.cache = new Map();
        this.fallbackParsers = new Map();
        this.serverUrl = 'https://parsers.neocenka.com';
    }

    async loadParser(name, version = 'latest') {
        // 1. Проверить кэш
        const cached = this.cache.get(`${name}@${version}`);
        if (cached && this.isValid(cached)) {
            return cached;
        }

        // 2. Загрузить с сервера
        try {
            const parser = await this.downloadParser(name, version);
            this.cache.set(`${name}@${version}`, parser);
            return parser;
        } catch (error) {
            // 3. Fallback к локальному парсеру
            return this.getFallbackParser(name);
        }
    }

    async downloadParser(name, version) {
        const url = `${this.serverUrl}/parsers/${name}/${version}/parser.js`;
        const response = await fetch(url);
        const code = await response.text();
        
        // Выполняем код в безопасном контексте
        return this.executeParser(code);
    }

    executeParser(code) {
        // Создаем изолированный контекст для выполнения
        const context = {
            document,
            window: {
                location: window.location
            }
        };
        
        // Выполняем код парсера
        const func = new Function('context', code);
        return func(context);
    }
}
```

### Стандартный интерфейс парсера
```javascript
// Каждый парсер должен реализовать этот интерфейс
class ParserInterface {
    constructor() {
        this.name = 'avito-parser';
        this.version = '1.2.3';
        this.compatibility = ['avito.ru'];
    }

    // Проверка совместимости с текущей страницей
    isCompatible() {
        return this.compatibility.some(domain => 
            window.location.hostname.includes(domain)
        );
    }

    // Основные методы парсинга
    async parseListing() { throw new Error('Not implemented'); }
    async parseListings() { throw new Error('Not implemented'); }
    async updateListing() { throw new Error('Not implemented'); }
    
    // Проверка работоспособности
    async healthCheck() {
        try {
            // Проверяем ключевые селекторы
            const title = document.querySelector(this.selectors.title);
            return !!title;
        } catch (error) {
            return false;
        }
    }
}
```

### Система обновлений
```javascript
class ParserUpdater {
    constructor() {
        this.checkInterval = 30 * 60 * 1000; // 30 минут
        this.serverUrl = 'https://parsers.neocenka.com';
    }

    async checkUpdates() {
        try {
            const response = await fetch(`${this.serverUrl}/api/versions.json`);
            const versions = await response.json();
            
            for (const [parser, version] of Object.entries(versions)) {
                const currentVersion = this.getCurrentVersion(parser);
                if (this.isNewerVersion(version, currentVersion)) {
                    await this.updateParser(parser, version);
                    this.notifyUser(`Парсер ${parser} обновлен до версии ${version}`);
                }
            }
        } catch (error) {
            console.error('Ошибка проверки обновлений:', error);
        }
    }

    async updateParser(name, version) {
        const loader = new ParserLoader();
        await loader.loadParser(name, version);
        
        // Сохраняем в локальное хранилище
        await chrome.storage.local.set({
            [`parser_${name}_version`]: version,
            [`parser_${name}_updated`]: Date.now()
        });
    }
}
```

## Безопасность

### Проверка кода парсеров
1. **Подпись кода** - цифровые подписи для проверки подлинности
2. **CSP ограничения** - Content Security Policy для внешнего кода
3. **Sandbox выполнение** - изоляция кода парсеров
4. **Whitelisted домены** - только доверенные источники

### Защита от вредоносного кода
```javascript
class SecureParserExecutor {
    execute(code) {
        // Проверяем на запрещенные функции
        const forbidden = ['eval', 'Function', 'XMLHttpRequest'];
        if (forbidden.some(fn => code.includes(fn))) {
            throw new Error('Небезопасный код');
        }

        // Выполняем в ограниченном контексте
        const sandbox = {
            document: this.createDocumentProxy(),
            console: this.createSecureConsole()
        };

        return this.runInSandbox(code, sandbox);
    }
}
```

## Мониторинг и отчетность

### Система отчетов об ошибках
```javascript
class ErrorReporter {
    async reportError(parser, error, context) {
        const report = {
            parser: parser.name,
            version: parser.version,
            error: error.message,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: Date.now(),
            context
        };

        // Отправляем отчет разработчикам
        await fetch('https://api.neocenka.com/errors', {
            method: 'POST',
            body: JSON.stringify(report)
        });
    }
}
```

### Аналитика использования
- Статистика успешности парсинга
- Популярность различных функций
- Время работы парсеров
- География использования

## Внедрение

### Фаза 1: Параллельная работа (1-2 недели)
- Новая система работает параллельно со старой
- Тестирование на части пользователей
- Сбор метрик производительности

### Фаза 2: Постепенный переход (2-3 недели)
- Перевод пользователей на новую систему
- Мониторинг ошибок и быстрые исправления
- Откат при критических проблемах

### Фаза 3: Полный переход (1 неделя)
- Удаление старых парсеров
- Финальная оптимизация
- Документация для пользователей

## Альтернативные подходы

### WebAssembly (WASM)
- Компиляция парсеров в WASM для лучшей производительности
- Сложность разработки, но потенциально быстрее

### Service Workers
- Использование SW для фонового обновления парсеров
- Лучшая производительность, но сложность отладки

### Hybrid подход
- Критические парсеры встроены в расширение
- Дополнительные функции загружаются динамически

## Заключение

Динамическая загрузка парсеров решает основную проблему поддержки актуальности без частых обновлений расширения. Рекомендуется начать с варианта GitHub + CDN как наиболее простого и надежного решения.

**Ожидаемые результаты:**
- 🚀 Время внедрения исправлений: с недель до минут
- 📈 Стабильность парсинга: 99%+ uptime
- 👥 Удобство для пользователей: автоматические обновления
- 🔧 Удобство для разработчиков: централизованное управление