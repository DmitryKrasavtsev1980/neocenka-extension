# Документация Neocenka Extension

Организованная структура документации проекта Neocenka Extension для анализа рынка недвижимости.

## 📁 Структура документации

### 📋 [Планы и развитие](/plans-and-development/)
Документы с планами развития, техническими заданиями и roadmap проекта:

- [`TODO.md`](/plans-and-development/TODO.md) - Основной план развития с архитектурой и задачами
- [`SEGMENTS_TASK_STATE.md`](/plans-and-development/SEGMENTS_TASK_STATE.md) - Состояние задач по сегментам
- [`comparative_analysis_updated.md`](/plans-and-development/comparative_analysis_updated.md) - Обновленный сравнительный анализ
- [`update_listing.md`](/plans-and-development/update_listing.md) - Планы обновления листингов
- [`import_addresses_geojson.md`](/plans-and-development/import_addresses_geojson.md) - Импорт адресов из GeoJSON
- [`parsing.md`](/plans-and-development/parsing.md) - Планы развития парсинга
- [`PANEL_REPORTS.md`](/plans-and-development/PANEL_REPORTS.md) - Панель отчетов

### 🏗️ [Технические руководства](/technical-guides/)
Инструкции и руководства по техническим аспектам:

- [`UPDATE_GUIDE.md`](/technical-guides/UPDATE_GUIDE.md) - Руководство по системе обновлений
- [`ARCHITECTURE_INTEGRATION.md`](/technical-guides/ARCHITECTURE_INTEGRATION.md) - Интеграция новой архитектуры
- [`REFACTORING_README.md`](/technical-guides/REFACTORING_README.md) - Руководство по рефакторингу

### 📚 [Архитектура v0.1](/v0.1-architecture/)
Документация архитектуры v0.1 (интегрирована с legacy кодом):

- [`doc_v_0.1_PROJECT_OVERVIEW.md`](/v0.1-architecture/doc_v_0.1_PROJECT_OVERVIEW.md) - Обзор проекта v0.1
- [`doc_v_0.1_ARCHITECTURE.md`](/v0.1-architecture/doc_v_0.1_ARCHITECTURE.md) - Архитектура системы
- [`doc_v_0.1_SERVICES.md`](/v0.1-architecture/doc_v_0.1_SERVICES.md) - Сервисная архитектура
- [`doc_v_0.1_COMPONENTS.md`](/v0.1-architecture/doc_v_0.1_COMPONENTS.md) - UI компоненты
- [`doc_v_0.1_CONTROLLERS.md`](/v0.1-architecture/doc_v_0.1_CONTROLLERS.md) - Контроллеры
- [`doc_v_0.1_DATABASE.md`](/v0.1-architecture/doc_v_0.1_DATABASE.md) - База данных
- [`doc_v_0.1_API.md`](/v0.1-architecture/doc_v_0.1_API.md) - API референс

### 📦 [Компонентная документация](/component-documentation/)
Документация отдельных компонентов системы:

- [`doc_MapManager.md`](/component-documentation/doc_MapManager.md) - Менеджер карты
- [`doc_SegmentsManager.md`](/component-documentation/doc_SegmentsManager.md) - Менеджер сегментов
- [`doc_DataState.md`](/component-documentation/doc_DataState.md) - Управление состоянием
- [`doc_avito-parser.md`](/component-documentation/doc_avito-parser.md) - Парсер Avito
- [`doc_geometry-utils.md`](/component-documentation/doc_geometry-utils.md) - Геометрические утилиты
- [`doc_database.md`](/component-documentation/doc_database.md) - Работа с базой данных
- [`HTMLExportManager.md`](/component-documentation/HTMLExportManager.md) - Экспорт в HTML

### 📜 [Устаревшая документация](/legacy-documentation/)
Документация предыдущих версий (до архитектурного рефакторинга):

- [`doc_PROJECT_OVERVIEW.md`](/legacy-documentation/doc_PROJECT_OVERVIEW.md) - Старый обзор проекта
- [`doc_ARCHITECTURE_ISSUES.md`](/legacy-documentation/doc_ARCHITECTURE_ISSUES.md) - Архитектурные проблемы
- [`doc_API_REFERENCE.md`](/legacy-documentation/doc_API_REFERENCE.md) - Старый API референс
- [`doc_TESTING.md`](/legacy-documentation/doc_TESTING.md) - Тестирование

## 🚀 Быстрый старт

### Для разработчиков
1. Начните с [обзора проекта v0.1](/v0.1-documentation/doc_v_0.1_PROJECT_OVERVIEW.md)
2. Изучите [новую архитектуру](/v0.1-documentation/doc_v_0.1_ARCHITECTURE.md)
3. Ознакомьтесь с [руководством по интеграции](/technical-guides/ARCHITECTURE_INTEGRATION.md)

### Для понимания развития
1. Ознакомьтесь с [основным планом развития](/plans-and-development/TODO.md)
2. Изучите [архитектурные проблемы](/legacy-documentation/doc_ARCHITECTURE_ISSUES.md) которые были решены
3. Посмотрите [техническое руководство](/technical-guides/UPDATE_GUIDE.md)

## 🔄 История изменений

- **v0.1** - Архитектурный рефакторинг с внедрением SOLID принципов
- **Legacy** - Первоначальная версия с монолитной архитектурой

## 🛠️ Инструменты разработки

Проект использует современный технологический стек:
- **Chrome Extension Manifest V3**
- **IndexedDB** для локального хранения
- **Leaflet + OpenStreetMap** для карт
- **ApexCharts** для аналитики
- **DataTables** для таблиц
- **Tailwind CSS** для стилизации

## 📞 Поддержка

При возникновении вопросов:
1. Проверьте соответствующую документацию по теме
2. Изучите техническое руководство
3. Обратитесь к архитектурной документации v0.1