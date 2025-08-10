# Контроллеры Neocenka Extension v0.1

## Обзор контроллерной архитектуры

В версии 0.1 внедрена полноценная контроллерная архитектура, основанная на паттернах **MVC (Model-View-Controller)** и **Mediator**. Контроллеры выступают как координаторы между UI компонентами, сервисами данных и бизнес-логикой.

## Иерархия контроллеров

```
ApplicationController                    # Главный контроллер приложения
    ├── SegmentController               # Контроллер сегментов недвижимости
    ├── MapController                   # Контроллер карты и геоданных
    ├── ReportsController               # Контроллер отчетов (legacy)
    └── SettingsController              # Контроллер настроек (legacy)
```

## Принципы работы контроллеров

1. **Координация компонентов** - Контроллеры не содержат бизнес-логику, а координируют взаимодействие
2. **Event-driven архитектура** - Взаимодействие через события, а не прямые вызовы
3. **Dependency Injection** - Все зависимости внедряются через DI контейнер
4. **Single Responsibility** - Каждый контроллер отвечает за свою предметную область

---

## ApplicationController

**Файл:** `/controllers/ApplicationController.js`  
**Назначение:** Главный контроллер приложения, координирует все остальные контроллеры  
**Зависимости:** `DIContainer`, `EventBus`, `DataState`, все остальные контроллеры

### Основные методы:

```javascript
class ApplicationController {
    constructor() {
        this.container = null;
        this.controllers = new Map();
        this.eventHandlers = new Map();
        this.initialized = false;
    }
    
    // Жизненный цикл приложения
    async initialize() {
        // Основная инициализация приложения
        try {
            // 1. Настройка DI контейнера
            await this.setupDIContainer();
            
            // 2. Регистрация всех сервисов
            await this.registerServices();
            
            // 3. Инициализация сервисов
            await this.initializeServices();
            
            // 4. Настройка контроллеров
            await this.setupControllers();
            
            // 5. Настройка глобального роутинга
            this.setupRouting();
            
            // 6. Загрузка начальных данных
            await this.loadInitialData();
            
            // 7. Настройка глобальных обработчиков
            this.setupGlobalEventHandlers();
            
            this.initialized = true;
            this.emit('app:ready');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации приложения:', error);
            await this.handleInitializationError(error);
        }
    }
    
    async shutdown() {
        // Корректное завершение работы приложения
        try {
            // 1. Сохранение состояния приложения
            await this.saveApplicationState();
            
            // 2. Уничтожение контроллеров
            for (const [name, controller] of this.controllers) {
                if (controller.destroy) {
                    await controller.destroy();
                }
            }
            
            // 3. Уничтожение сервисов
            if (this.container && this.container.destroy) {
                this.container.destroy();
            }
            
            // 4. Очистка обработчиков событий
            this.eventHandlers.clear();
            this.controllers.clear();
            
            this.initialized = false;
            
        } catch (error) {
            console.error('❌ Ошибка при завершении приложения:', error);
        }
    }
    
    // Настройка DI контейнера
    async setupDIContainer() {
        // Создание и конфигурация DI контейнера
        this.container = new DIContainer();
        
        // Регистрация базового экземпляра контейнера
        this.container.registerInstance('DIContainer', this.container);
        this.container.registerInstance('ApplicationController', this);
    }
    
    // Регистрация сервисов
    async registerServices() {
        // Базовые сервисы (без зависимостей)
        this.container.registerFactory('ConfigService', () => {
            return new ConfigService();
        }, { singleton: true, dependencies: [] });

        this.container.registerFactory('ValidationService', () => {
            return new ValidationService();
        }, { singleton: true, dependencies: [] });

        // Сервисы с зависимостями
        this.container.registerFactory('ErrorHandlingService', (container) => {
            const configService = container.get('ConfigService');
            return new ErrorHandlingService(configService);
        }, { singleton: true, dependencies: ['ConfigService'] });

        this.container.registerFactory('GlobalErrorReporter', (container) => {
            const errorHandlingService = container.get('ErrorHandlingService');
            const configService = container.get('ConfigService');
            return new GlobalErrorReporter(errorHandlingService, configService);
        }, { singleton: true, dependencies: ['ErrorHandlingService', 'ConfigService'] });

        // Сервисы данных
        this.container.registerFactory('SegmentService', (container) => {
            return new SegmentService(
                container.get('Database'),
                container.get('ValidationService'),
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['Database', 'ValidationService', 'ConfigService', 'ErrorHandlingService'] });

        this.container.registerFactory('ReferenceDataService', (container) => {
            return new ReferenceDataService(
                container.get('Database'),
                container.get('ConfigService'),
                container.get('ErrorHandlingService')
            );
        }, { singleton: true, dependencies: ['Database', 'ConfigService', 'ErrorHandlingService'] });

        // UI компоненты
        this.container.registerFactory('SegmentModal', (container) => {
            return new SegmentModal(
                container.get('ValidationService'),
                container.get('ReferenceDataService')
            );
        }, { singleton: true, dependencies: ['ValidationService', 'ReferenceDataService'] });

        this.container.registerFactory('SegmentTable', () => {
            return new SegmentTable();
        }, { singleton: true, dependencies: [] });

        this.container.registerFactory('SegmentChart', () => {
            return new SegmentChart();
        }, { singleton: true, dependencies: [] });

        // Компоненты карты
        this.container.registerFactory('MapRenderer', (container) => {
            return new MapRenderer(container.get('ConfigService'));
        }, { singleton: true, dependencies: ['ConfigService'] });

        this.container.registerFactory('MarkerManager', (container) => {
            return new MarkerManager(container.get('MapRenderer'));
        }, { singleton: true, dependencies: ['MapRenderer'] });
    }
    
    // Инициализация сервисов
    async initializeServices() {
        // Инициализация в правильном порядке (топологическая сортировка)
        await this.container.initialize();
    }
    
    // Настройка контроллеров
    async setupControllers() {
        // Создание контроллеров с внедрением зависимостей
        this.controllers.set('segment', new SegmentController(
            this.container.get('SegmentService'),
            this.container.get('SegmentModal'),
            this.container.get('SegmentTable'),
            this.container.get('SegmentChart'),
            this.container.get('ValidationService')
        ));
        
        this.controllers.set('map', new MapController(
            this.container.get('MapRenderer'),
            this.container.get('MarkerManager'),
            this.container.get('DataState')
        ));
        
        // Инициализация контроллеров
        for (const [name, controller] of this.controllers) {
            if (controller.initialize) {
                await controller.initialize();
            }
        }
    }
    
    // Маршрутизация
    setupRouting() {
        // Настройка роутинга между страницами
        window.addEventListener('hashchange', this.handleRouteChange.bind(this));
        
        // Обработка начального маршрута
        this.handleRouteChange();
    }
    
    handleRouteChange() {
        // Обработка изменения маршрута
        const hash = window.location.hash.slice(1); // Убираем #
        const [page, action, id] = hash.split('/');
        
        // Эмиссия события навигации
        this.emit('route:change', {
            page: page || 'main',
            action: action || 'index',
            id: id || null
        });
    }
    
    // Загрузка начальных данных
    async loadInitialData() {
        // Загрузка данных, необходимых для старта приложения
        try {
            // Инициализация справочных данных
            const referenceService = this.container.get('ReferenceDataService');
            await referenceService.initializeDefaultData();
            
            // Загрузка настроек пользователя
            const configService = this.container.get('ConfigService');
            await configService.restore();
            
        } catch (error) {
            console.error('❌ Ошибка загрузки начальных данных:', error);
        }
    }
    
    // Глобальные обработчики событий
    setupGlobalEventHandlers() {
        // Глобальные клавиатурные сокращения
        document.addEventListener('keydown', this.handleGlobalKeyboard.bind(this));
        
        // Обработка критических ошибок
        window.addEventListener('error', this.handleGlobalError.bind(this));
        window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
        
        // Обработка изменения размера окна
        window.addEventListener('resize', debounce(this.handleWindowResize.bind(this), 250));
    }
    
    handleGlobalKeyboard(event) {
        // Обработка глобальных клавиатурных сокращений
        const { ctrlKey, shiftKey, altKey, code } = event;
        
        // Ctrl+N - создать новый сегмент
        if (ctrlKey && !shiftKey && code === 'KeyN') {
            event.preventDefault();
            this.emit('shortcut:new-segment');
        }
        
        // Ctrl+S - сохранить данные
        if (ctrlKey && !shiftKey && code === 'KeyS') {
            event.preventDefault();
            this.emit('shortcut:save');
        }
        
        // Escape - закрыть модальные окна
        if (code === 'Escape') {
            this.emit('shortcut:escape');
        }
    }
    
    handleGlobalError(event) {
        // Обработка критических JavaScript ошибок
        const errorReporter = this.container.get('GlobalErrorReporter');
        errorReporter.handleGlobalError({
            type: 'javascript',
            message: event.message,
            source: event.filename,
            line: event.lineno,
            column: event.colno,
            stack: event.error?.stack
        });
    }
    
    handleUnhandledRejection(event) {
        // Обработка необработанных Promise rejections
        const errorReporter = this.container.get('GlobalErrorReporter');
        errorReporter.handleGlobalError({
            type: 'promise',
            message: event.reason?.message || 'Unhandled promise rejection',
            error: event.reason
        });
    }
    
    handleWindowResize() {
        // Обработка изменения размера окна
        this.emit('window:resize', {
            width: window.innerWidth,
            height: window.innerHeight
        });
    }
    
    // Управление состоянием приложения
    async saveApplicationState() {
        // Сохранение состояния приложения
        const configService = this.container.get('ConfigService');
        await configService.persist();
    }
    
    // Получение контроллеров
    getController(name) {
        // Получение контроллера по имени
        return this.controllers.get(name);
    }
    
    // API для внешнего использования
    async executeCommand(command, params = {}) {
        // Выполнение команды через контроллеры
        const [controllerName, action] = command.split('.');
        const controller = this.controllers.get(controllerName);
        
        if (controller && typeof controller[action] === 'function') {
            return await controller[action](params);
        } else {
            throw new Error(`Команда не найдена: ${command}`);
        }
    }
}
```

### События ApplicationController:

```javascript
// События жизненного цикла
app.addEventListener('app:ready', () => {
    // Приложение полностью инициализировано
});

app.addEventListener('app:error', (error) => {
    // Критическая ошибка приложения
});

// События навигации
app.addEventListener('route:change', (routeData) => {
    // Изменение маршрута
});

// Глобальные события
app.addEventListener('shortcut:new-segment', () => {
    // Клавиатурное сокращение создания сегмента
});

app.addEventListener('window:resize', (dimensions) => {
    // Изменение размера окна
});
```

---

## SegmentController

**Файл:** `/controllers/SegmentController.js`  
**Назначение:** Контроллер для управления сегментами недвижимости  
**Зависимости:** `SegmentService`, `SegmentModal`, `SegmentTable`, `SegmentChart`, `ValidationService`

### Основные методы:

```javascript
class SegmentController {
    constructor(segmentService, segmentModal, segmentTable, segmentChart, validationService) {
        this.segmentService = segmentService;
        this.segmentModal = segmentModal;
        this.segmentTable = segmentTable;
        this.segmentChart = segmentChart;
        this.validationService = validationService;
        
        this.currentAreaId = null;
        this.selectedSegmentId = null;
        this.initialized = false;
    }
    
    // Инициализация контроллера
    async initialize() {
        // Настройка событийных связей между компонентами
        this.setupComponentBindings();
        
        // Подписка на глобальные события
        this.setupGlobalEventListeners();
        
        this.initialized = true;
    }
    
    setupComponentBindings() {
        // Привязка событий от SegmentModal
        this.segmentModal.addEventListener('segment:save', async (eventData) => {
            await this.handleSegmentSave(eventData);
        });
        
        this.segmentModal.addEventListener('segment:cancel', () => {
            this.handleSegmentCancel();
        });
        
        this.segmentModal.addEventListener('segment:delete', async (segmentId) => {
            await this.handleSegmentDelete(segmentId);
        });
        
        // Привязка событий от SegmentTable
        this.segmentTable.addEventListener('segment:select', (segmentId) => {
            this.selectSegment(segmentId);
        });
        
        this.segmentTable.addEventListener('segment:edit', (segmentId) => {
            this.editSegment(segmentId);
        });
        
        this.segmentTable.addEventListener('segment:view', (segmentId) => {
            this.viewSegment(segmentId);
        });
        
        this.segmentTable.addEventListener('segment:delete', async (segmentId) => {
            await this.confirmAndDeleteSegment(segmentId);
        });
        
        // Привязка событий сервиса
        this.segmentService.addEventListener('segment:created', (data) => {
            this.onSegmentCreated(data.segment);
        });
        
        this.segmentService.addEventListener('segment:updated', (data) => {
            this.onSegmentUpdated(data.segment);
        });
        
        this.segmentService.addEventListener('segment:deleted', (data) => {
            this.onSegmentDeleted(data.segmentId);
        });
    }
    
    setupGlobalEventListeners() {
        // Глобальные события приложения
        eventBus.on('route:change', (routeData) => {
            if (routeData.page === 'segments') {
                this.handleRouteChange(routeData);
            }
        });
        
        eventBus.on('shortcut:new-segment', () => {
            if (this.currentAreaId) {
                this.showCreateModal(this.currentAreaId);
            }
        });
        
        eventBus.on('shortcut:escape', () => {
            this.segmentModal.hideModal();
        });
    }
    
    // Основные операции с сегментами
    async showCreateModal(areaId) {
        // Показать модальное окно создания сегмента
        this.currentAreaId = areaId;
        
        try {
            // Загрузка справочных данных
            await this.segmentModal.loadReferenceData();
            
            // Показ модального окна
            this.segmentModal.showCreateModal(areaId);
            
            // Эмиссия события
            this.emit('segment-modal:shown', { mode: 'create', areaId });
            
        } catch (error) {
            console.error('❌ Ошибка при показе модального окна создания:', error);
            this.showErrorMessage('Не удалось открыть окно создания сегмента');
        }
    }
    
    async editSegment(segmentId) {
        // Редактирование существующего сегмента
        try {
            // Загрузка данных сегмента
            const segment = await this.segmentService.getById(segmentId);
            
            if (!segment) {
                throw new Error(`Сегмент с ID ${segmentId} не найден`);
            }
            
            // Загрузка справочных данных
            await this.segmentModal.loadReferenceData();
            
            // Показ модального окна с данными
            this.segmentModal.showEditModal(segment);
            
            // Эмиссия события
            this.emit('segment-modal:shown', { mode: 'edit', segmentId, segment });
            
        } catch (error) {
            console.error('❌ Ошибка при редактировании сегмента:', error);
            this.showErrorMessage('Не удалось загрузить данные сегмента для редактирования');
        }
    }
    
    async handleSegmentSave(eventData) {
        // Обработка сохранения сегмента
        const { mode, segmentData } = eventData;
        
        try {
            // Валидация данных
            const validation = await this.validationService.validate('segments', segmentData);
            
            if (!validation.isValid) {
                // Показ ошибок валидации
                this.segmentModal.displayValidationErrors(validation.errors);
                return;
            }
            
            let savedSegment;
            
            if (mode === 'create') {
                // Создание нового сегмента
                savedSegment = await this.segmentService.create(segmentData);
                this.showSuccessMessage('Сегмент успешно создан');
                
            } else if (mode === 'edit') {
                // Обновление существующего сегмента
                savedSegment = await this.segmentService.update(segmentData.id, segmentData);
                this.showSuccessMessage('Сегмент успешно обновлен');
            }
            
            // Скрытие модального окна
            this.segmentModal.hideModal();
            
            // Эмиссия события успешного сохранения
            this.emit('segment:saved', { mode, segment: savedSegment });
            
        } catch (error) {
            console.error('❌ Ошибка при сохранении сегмента:', error);
            this.showErrorMessage('Не удалось сохранить сегмент: ' + error.message);
        }
    }
    
    handleSegmentCancel() {
        // Обработка отмены операции
        this.segmentModal.hideModal();
        this.emit('segment-operation:cancelled');
    }
    
    async handleSegmentDelete(segmentId) {
        // Обработка удаления сегмента из модального окна
        await this.confirmAndDeleteSegment(segmentId);
    }
    
    async confirmAndDeleteSegment(segmentId) {
        // Подтверждение и удаление сегмента
        const confirmed = await this.showConfirmDialog(
            'Удаление сегмента',
            'Вы действительно хотите удалить этот сегмент? Это действие нельзя отменить.',
            'danger'
        );
        
        if (confirmed) {
            try {
                await this.segmentService.delete(segmentId);
                this.showSuccessMessage('Сегмент успешно удален');
                
                // Скрытие модального окна если оно открыто
                if (this.segmentModal.isVisible && this.segmentModal.currentSegmentId === segmentId) {
                    this.segmentModal.hideModal();
                }
                
            } catch (error) {
                console.error('❌ Ошибка при удалении сегмента:', error);
                this.showErrorMessage('Не удалось удалить сегмент: ' + error.message);
            }
        }
    }
    
    // Операции просмотра и выбора
    async viewSegment(segmentId) {
        // Просмотр деталей сегмента
        try {
            const segment = await this.segmentService.getById(segmentId);
            const statistics = await this.segmentService.getStatistics(segmentId);
            
            // Обновление графиков
            await this.updateChartsForSegment(segment, statistics);
            
            // Выбор сегмента
            this.selectSegment(segmentId);
            
            this.emit('segment:viewed', { segment, statistics });
            
        } catch (error) {
            console.error('❌ Ошибка при просмотре сегмента:', error);
            this.showErrorMessage('Не удалось загрузить данные сегмента');
        }
    }
    
    selectSegment(segmentId) {
        // Выбор сегмента (выделение в таблице, на карте)
        this.selectedSegmentId = segmentId;
        
        // Обновление UI
        this.segmentTable.selectSegment(segmentId);
        
        // Эмиссия события для других компонентов (например, карты)
        this.emit('segment:selected', { segmentId });
    }
    
    // Обновление данных
    async loadSegmentsForArea(areaId) {
        // Загрузка сегментов для области
        try {
            this.currentAreaId = areaId;
            
            const segments = await this.segmentService.getByAreaId(areaId);
            
            // Обновление таблицы
            this.segmentTable.updateData(segments);
            
            // Очистка выбора
            this.selectedSegmentId = null;
            
            this.emit('segments:loaded', { areaId, segments });
            
        } catch (error) {
            console.error('❌ Ошибка при загрузке сегментов:', error);
            this.showErrorMessage('Не удалось загрузить сегменты области');
        }
    }
    
    async refreshCurrentData() {
        // Обновление текущих данных
        if (this.currentAreaId) {
            await this.loadSegmentsForArea(this.currentAreaId);
        }
    }
    
    // Обработчики событий сервиса
    onSegmentCreated(segment) {
        // Реакция на создание нового сегмента
        this.segmentTable.addSegment(segment);
        
        // Автовыбор нового сегмента
        this.selectSegment(segment.id);
    }
    
    onSegmentUpdated(segment) {
        // Реакция на обновление сегмента
        this.segmentTable.updateSegment(segment.id, segment);
        
        // Обновление графиков если сегмент выбран
        if (this.selectedSegmentId === segment.id) {
            this.updateChartsForSegment(segment);
        }
    }
    
    onSegmentDeleted(segmentId) {
        // Реакция на удаление сегмента
        this.segmentTable.removeSegment(segmentId);
        
        // Очистка выбора если удален выбранный сегмент
        if (this.selectedSegmentId === segmentId) {
            this.selectedSegmentId = null;
            this.segmentChart.destroyAllCharts();
        }
    }
    
    // Управление графиками
    async updateChartsForSegment(segment, statistics = null) {
        // Обновление графиков для сегмента
        try {
            if (!statistics) {
                statistics = await this.segmentService.getStatistics(segment.id);
            }
            
            // Создание/обновление графиков
            if (statistics.areaDistribution) {
                this.segmentChart.updateChart('areaDistribution', statistics.areaDistribution);
            }
            
            if (statistics.priceDistribution) {
                this.segmentChart.updateChart('priceDistribution', statistics.priceDistribution);
            }
            
            if (statistics.priceHistory) {
                this.segmentChart.updateChart('priceHistory', statistics.priceHistory);
            }
            
        } catch (error) {
            console.error('❌ Ошибка при обновлении графиков:', error);
        }
    }
    
    // Маршрутизация
    handleRouteChange(routeData) {
        // Обработка изменения маршрута
        const { action, id } = routeData;
        
        switch (action) {
            case 'create':
                if (id) { // id здесь - areaId
                    this.showCreateModal(id);
                }
                break;
                
            case 'edit':
                if (id) {
                    this.editSegment(id);
                }
                break;
                
            case 'view':
                if (id) {
                    this.viewSegment(id);
                }
                break;
                
            case 'area':
                if (id) {
                    this.loadSegmentsForArea(id);
                }
                break;
        }
    }
    
    // Экспорт и импорт
    async exportSegments(segmentIds = null, format = 'json') {
        // Экспорт сегментов
        try {
            const exportData = await this.segmentService.export(
                segmentIds || [this.selectedSegmentId],
                format
            );
            
            // Скачивание файла
            this.downloadFile(exportData, `segments_export.${format}`);
            
            this.showSuccessMessage('Данные успешно экспортированы');
            
        } catch (error) {
            console.error('❌ Ошибка при экспорте:', error);
            this.showErrorMessage('Не удалось экспортировать данные');
        }
    }
    
    // Утилитные методы
    showSuccessMessage(message) {
        // Показ сообщения об успехе
        // Интеграция с системой уведомлений
    }
    
    showErrorMessage(message) {
        // Показ сообщения об ошибке
        // Интеграция с системой уведомлений
    }
    
    async showConfirmDialog(title, message, type = 'warning') {
        // Показ диалога подтверждения
        // Возвращает Promise<boolean>
        return new Promise((resolve) => {
            // Реализация модального диалога подтверждения
        });
    }
    
    downloadFile(data, filename) {
        // Скачивание файла
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    // Уничтожение контроллера
    async destroy() {
        // Очистка ресурсов контроллера
        this.segmentChart.destroyAllCharts();
        this.eventHandlers.clear();
        this.initialized = false;
    }
}
```

### События SegmentController:

```javascript
// События операций с сегментами
controller.addEventListener('segment:saved', (data) => {
    // Сегмент успешно сохранен
});

controller.addEventListener('segment:selected', (data) => {
    // Сегмент выбран
});

controller.addEventListener('segment:viewed', (data) => {
    // Открыт просмотр сегмента
});

// События модального окна
controller.addEventListener('segment-modal:shown', (data) => {
    // Показано модальное окно
});

controller.addEventListener('segment-operation:cancelled', () => {
    // Операция отменена
});

// События загрузки данных
controller.addEventListener('segments:loaded', (data) => {
    // Сегменты загружены для области
});
```

---

## MapController

**Файл:** `/controllers/MapController.js`  
**Назначение:** Контроллер для управления картой и геопространственными данными  
**Зависимости:** `MapRenderer`, `MarkerManager`, `DataState`

### Основные методы:

```javascript
class MapController {
    constructor(mapRenderer, markerManager, dataState) {
        this.mapRenderer = mapRenderer;
        this.markerManager = markerManager;
        this.dataState = dataState;
        
        this.map = null;
        this.currentAreaId = null;
        this.drawingMode = false;
        this.initialized = false;
    }
    
    // Инициализация контроллера
    async initialize() {
        // Настройка событийных связей
        this.setupComponentBindings();
        
        // Подписка на изменения состояния
        this.setupDataStateSubscriptions();
        
        this.initialized = true;
    }
    
    setupComponentBindings() {
        // События карты
        this.mapRenderer.addEventListener('map:ready', (map) => {
            this.onMapReady(map);
        });
        
        this.mapRenderer.addEventListener('layer:added', (layerId, layer) => {
            this.onLayerAdded(layerId, layer);
        });
        
        this.mapRenderer.addEventListener('bounds:changed', (bounds) => {
            this.onBoundsChanged(bounds);
        });
        
        // События маркеров
        this.markerManager.addEventListener('marker:click', (markerId, data) => {
            this.onMarkerClick(markerId, data);
        });
        
        this.markerManager.addEventListener('marker:hover', (markerId, data) => {
            this.onMarkerHover(markerId, data);
        });
        
        // Глобальные события
        eventBus.on('segment:selected', (data) => {
            this.highlightSegmentData(data.segmentId);
        });
        
        eventBus.on('window:resize', (dimensions) => {
            this.handleWindowResize(dimensions);
        });
    }
    
    setupDataStateSubscriptions() {
        // Подписка на изменения состояния данных
        this.dataState.subscribe('currentArea', (newAreaId, oldAreaId) => {
            this.onAreaChanged(newAreaId, oldAreaId);
        });
        
        this.dataState.subscribe('visibleMarkers', (markerIds) => {
            this.updateVisibleMarkers(markerIds);
        });
        
        this.dataState.subscribe('mapSettings', (settings) => {
            this.applyMapSettings(settings);
        });
    }
    
    // Основные операции с картой
    async createMap(containerId, options = {}) {
        // Создание карты в указанном контейнере
        try {
            this.map = await this.mapRenderer.createMap(containerId, options);
            
            // Настройка базовых элементов карты
            await this.setupMapControls();
            await this.setupMapLayers();
            
            // Эмиссия события готовности
            this.emit('map:initialized', { map: this.map });
            
            return this.map;
            
        } catch (error) {
            console.error('❌ Ошибка при создании карты:', error);
            throw error;
        }
    }
    
    async setupMapControls() {
        // Настройка контролов карты
        // Контрол масштаба
        const scaleControl = L.control.scale({
            position: 'bottomleft',
            metric: true,
            imperial: false
        });
        this.mapRenderer.addControl('scale', scaleControl);
        
        // Контрол слоев
        const layersControl = L.control.layers({}, {}, {
            position: 'topright',
            collapsed: true
        });
        this.mapRenderer.addControl('layers', layersControl);
        
        // Контрол рисования (создается по требованию)
        this.drawingControl = null;
    }
    
    async setupMapLayers() {
        // Настройка слоев карты
        // Слой для полигонов областей
        const areaLayer = L.featureGroup();
        this.mapRenderer.addLayer('areas', areaLayer);
        
        // Слой для маркеров объектов
        const markersLayer = L.featureGroup();
        this.mapRenderer.addLayer('markers', markersLayer);
        
        // Слой для выделенных элементов
        const highlightLayer = L.featureGroup();
        this.mapRenderer.addLayer('highlights', highlightLayer);
    }
    
    // Управление областями
    async loadAreaPolygons(areaIds = null) {
        // Загрузка и отображение полигонов областей
        try {
            const areas = areaIds ? 
                await this.getAreasByIds(areaIds) :
                await this.getAllAreas();
            
            const areaLayer = this.mapRenderer.layers['areas'].layer;
            areaLayer.clearLayers();
            
            areas.forEach(area => {
                if (area.polygon_coords) {
                    const polygon = L.polygon(area.polygon_coords, {
                        color: area.color || '#007cba',
                        weight: 2,
                        opacity: 0.8,
                        fillOpacity: 0.2
                    });
                    
                    // Привязка данных и событий
                    polygon.areaId = area.id;
                    polygon.bindPopup(this.createAreaPopup(area));
                    polygon.on('click', () => this.onAreaClick(area.id));
                    
                    areaLayer.addLayer(polygon);
                }
            });
            
            this.emit('area-polygons:loaded', { areas });
            
        } catch (error) {
            console.error('❌ Ошибка при загрузке полигонов областей:', error);
        }
    }
    
    onAreaClick(areaId) {
        // Обработка клика по области
        this.selectArea(areaId);
        this.emit('area:selected', { areaId });
    }
    
    selectArea(areaId) {
        // Выбор области
        this.currentAreaId = areaId;
        this.dataState.setState('currentArea', areaId);
        
        // Загрузка данных для области
        this.loadAreaData(areaId);
    }
    
    // Управление маркерами
    async updateAddressMarkers(addresses) {
        // Обновление маркеров адресов на карте
        try {
            // Создание маркеров из данных адресов
            const markers = this.markerManager.createMarkersFromData(addresses, (address) => ({
                id: address.id,
                latLng: [address.coordinates.lat, address.coordinates.lng],
                options: {
                    type: 'listing',
                    title: address.address,
                    popupContent: this.createAddressPopup(address),
                    tooltip: this.createAddressTooltip(address),
                    data: address
                }
            }));
            
            // Показ маркеров на карте
            Object.keys(markers).forEach(markerId => {
                this.markerManager.showMarker(markerId, 'markers');
            });
            
            // Подгонка карты под маркеры
            if (Object.keys(markers).length > 0) {
                this.markerManager.fitBounds();
            }
            
            this.emit('address-markers:updated', { addresses, markers });
            
        } catch (error) {
            console.error('❌ Ошибка при обновлении маркеров адресов:', error);
        }
    }
    
    onMarkerClick(markerId, data) {
        // Обработка клика по маркеру
        const markerData = data.data; // Данные адреса/объекта
        
        // Эмиссия события для других компонентов
        this.emit('marker:selected', { 
            markerId, 
            address: markerData 
        });
        
        // Центрирование карты на маркере (опционально)
        const marker = this.markerManager.markers[markerId];
        if (marker) {
            this.mapRenderer.setView(marker.getLatLng(), this.map.getZoom());
        }
    }
    
    onMarkerHover(markerId, data) {
        // Обработка наведения на маркер
        this.emit('marker:hover', { markerId, data: data.data });
    }
    
    // Управление видимостью
    updateVisibleMarkers(markerIds) {
        // Обновление видимых маркеров
        // Скрыть все маркеры
        Object.keys(this.markerManager.markers).forEach(markerId => {
            this.markerManager.hideMarker(markerId);
        });
        
        // Показать только указанные маркеры
        markerIds.forEach(markerId => {
            this.markerManager.showMarker(markerId, 'markers');
        });
    }
    
    async highlightSegmentData(segmentId) {
        // Выделение данных сегмента на карте
        try {
            // Получение адресов сегмента
            const segmentAddresses = await this.getAddressesBySegment(segmentId);
            
            // Очистка предыдущих выделений
            const highlightLayer = this.mapRenderer.layers['highlights'].layer;
            highlightLayer.clearLayers();
            
            // Создание выделенных маркеров
            segmentAddresses.forEach(address => {
                const marker = L.circleMarker([address.coordinates.lat, address.coordinates.lng], {
                    radius: 8,
                    color: '#ff4444',
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.3
                });
                
                highlightLayer.addLayer(marker);
            });
            
            // Подгонка карты под выделенные данные
            if (segmentAddresses.length > 0) {
                const bounds = L.latLngBounds(segmentAddresses.map(addr => 
                    [addr.coordinates.lat, addr.coordinates.lng]
                ));
                this.mapRenderer.fitBounds(bounds, { padding: [20, 20] });
            }
            
            this.emit('segment-data:highlighted', { segmentId, addresses: segmentAddresses });
            
        } catch (error) {
            console.error('❌ Ошибка при выделении данных сегмента:', error);
        }
    }
    
    // Режим рисования
    toggleDrawingMode(enabled) {
        // Переключение режима рисования полигонов
        this.drawingMode = enabled;
        
        if (enabled && !this.drawingControl) {
            // Создание контрола рисования
            const editableFeatureGroup = new L.FeatureGroup();
            this.map.addLayer(editableFeatureGroup);
            
            this.drawingControl = this.mapRenderer.createDrawingControl({
                editableFeatureGroup: editableFeatureGroup
            });
            
            this.mapRenderer.addControl('drawing', this.drawingControl);
            
            // Обработчики событий рисования
            this.map.on('draw:created', (event) => {
                this.onDrawingCreated(event);
            });
            
            this.map.on('draw:edited', (event) => {
                this.onDrawingEdited(event);
            });
            
            this.map.on('draw:deleted', (event) => {
                this.onDrawingDeleted(event);
            });
            
        } else if (!enabled && this.drawingControl) {
            // Удаление контрола рисования
            this.mapRenderer.removeControl('drawing');
            this.drawingControl = null;
        }
        
        this.emit('drawing-mode:toggled', { enabled });
    }
    
    onDrawingCreated(event) {
        // Обработка создания нового полигона
        const layer = event.layer;
        const coordinates = layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
        
        this.emit('polygon:created', { 
            coordinates,
            layer,
            type: event.layerType
        });
    }
    
    onDrawingEdited(event) {
        // Обработка редактирования полигонов
        const layers = event.layers;
        layers.eachLayer((layer) => {
            const coordinates = layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
            this.emit('polygon:edited', { coordinates, layer });
        });
    }
    
    onDrawingDeleted(event) {
        // Обработка удаления полигонов
        const layers = event.layers;
        layers.eachLayer((layer) => {
            this.emit('polygon:deleted', { layer });
        });
    }
    
    // Навигация карты
    fitToVisibleData() {
        // Автоподгонка карты под видимые данные
        const visibleBounds = this.calculateVisibleDataBounds();
        
        if (visibleBounds) {
            this.mapRenderer.fitBounds(visibleBounds, {
                padding: [50, 50],
                maxZoom: 16
            });
        }
    }
    
    calculateVisibleDataBounds() {
        // Вычисление границ видимых данных
        const bounds = L.latLngBounds();
        let hasData = false;
        
        // Добавление границ полигонов областей
        const areaLayer = this.mapRenderer.layers['areas'].layer;
        areaLayer.eachLayer(layer => {
            bounds.extend(layer.getBounds());
            hasData = true;
        });
        
        // Добавление позиций маркеров
        Object.values(this.markerManager.markers).forEach(marker => {
            if (marker._layerId) { // Только видимые маркеры
                bounds.extend(marker.getLatLng());
                hasData = true;
            }
        });
        
        return hasData ? bounds : null;
    }
    
    // Обработчики событий
    onMapReady(map) {
        // Карта готова к использованию
        this.map = map;
        this.emit('map:ready', { map });
    }
    
    onLayerAdded(layerId, layer) {
        // Слой добавлен на карту
        this.emit('layer:added', { layerId, layer });
    }
    
    onBoundsChanged(bounds) {
        // Изменились границы видимой области карты
        this.emit('bounds:changed', { bounds });
        
        // Сохранение позиции карты в состоянии
        this.dataState.setState('mapPosition', {
            center: this.map.getCenter(),
            zoom: this.map.getZoom(),
            bounds: bounds
        });
    }
    
    onAreaChanged(newAreaId, oldAreaId) {
        // Изменилась текущая область
        if (newAreaId !== oldAreaId) {
            this.loadAreaData(newAreaId);
        }
    }
    
    async loadAreaData(areaId) {
        // Загрузка данных для области
        if (areaId) {
            // Загрузка адресов области
            const addresses = await this.getAddressesByArea(areaId);
            await this.updateAddressMarkers(addresses);
        }
    }
    
    handleWindowResize(dimensions) {
        // Обработка изменения размера окна
        if (this.map) {
            // Принудительное обновление размеров карты
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    }
    
    // Создание popup и tooltip
    createAreaPopup(area) {
        // Создание popup для области
        return `
            <div class="area-popup">
                <h4>${area.name}</h4>
                <p>${area.description || 'Описание не указано'}</p>
                <div class="area-stats">
                    <div>Объектов: <strong>${area.object_count || 0}</strong></div>
                    <div>Сегментов: <strong>${area.segment_count || 0}</strong></div>
                </div>
                <div class="area-actions">
                    <button onclick="app.controller.segment.showCreateModal('${area.id}')" class="btn btn-sm btn-primary">
                        Создать сегмент
                    </button>
                </div>
            </div>
        `;
    }
    
    createAddressPopup(address) {
        // Создание popup для адреса
        return `
            <div class="address-popup">
                <h4>${address.address}</h4>
                <div class="address-details">
                    ${address.house_series ? `<div>Серия: ${address.house_series}</div>` : ''}
                    ${address.floors ? `<div>Этажей: ${address.floors}</div>` : ''}
                    ${address.build_year ? `<div>Год постройки: ${address.build_year}</div>` : ''}
                </div>
                <div class="address-stats">
                    <div>Объектов: <strong>${address.object_count || 0}</strong></div>
                    ${address.average_price ? `<div>Средняя цена: <strong>${this.formatPrice(address.average_price)}</strong></div>` : ''}
                </div>
            </div>
        `;
    }
    
    createAddressTooltip(address) {
        // Создание tooltip для адреса
        const price = address.average_price ? 
            ` • ${this.formatPrice(address.average_price)}` : '';
        return `${address.address}${price}`;
    }
    
    // Утилиты
    formatPrice(price) {
        // Форматирование цены
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0
        }).format(price);
    }
    
    // Методы получения данных (заглушки - должны быть реализованы через сервисы)
    async getAllAreas() {
        // Получение всех областей
        // Реализация через Database/AreaService
    }
    
    async getAreasByIds(areaIds) {
        // Получение областей по ID
        // Реализация через Database/AreaService
    }
    
    async getAddressesByArea(areaId) {
        // Получение адресов области
        // Реализация через Database/AddressService
    }
    
    async getAddressesBySegment(segmentId) {
        // Получение адресов сегмента
        // Реализация через Database/SegmentService
    }
    
    // Уничтожение контроллера
    async destroy() {
        // Очистка ресурсов контроллера
        if (this.drawingControl) {
            this.mapRenderer.removeControl('drawing');
        }
        
        this.markerManager.destroyAllMarkers?.();
        
        this.eventHandlers.clear();
        this.initialized = false;
    }
}
```

### События MapController:

```javascript
// События карты
controller.addEventListener('map:initialized', (data) => {
    // Карта инициализирована
});

controller.addEventListener('map:ready', (data) => {
    // Карта готова к использованию
});

// События областей
controller.addEventListener('area:selected', (data) => {
    // Область выбрана
});

controller.addEventListener('area-polygons:loaded', (data) => {
    // Полигоны областей загружены
});

// События маркеров
controller.addEventListener('marker:selected', (data) => {
    // Маркер выбран
});

controller.addEventListener('address-markers:updated', (data) => {
    // Маркеры адресов обновлены
});

// События рисования
controller.addEventListener('drawing-mode:toggled', (data) => {
    // Режим рисования переключен
});

controller.addEventListener('polygon:created', (data) => {
    // Полигон создан
});

// События выделения
controller.addEventListener('segment-data:highlighted', (data) => {
    // Данные сегмента выделены на карте
});
```

---

## Интеграция контроллеров

### Пример полного взаимодействия:

```javascript
// 1. Инициализация приложения
const app = new ApplicationController();
await app.initialize();

// 2. Пользователь выбирает область на карте
mapController.addEventListener('area:selected', (data) => {
    // Автоматическая загрузка сегментов для области
    segmentController.loadSegmentsForArea(data.areaId);
});

// 3. Пользователь выбирает сегмент в таблице
segmentController.addEventListener('segment:selected', (data) => {
    // Автоматическое выделение данных на карте
    mapController.highlightSegmentData(data.segmentId);
});

// 4. Создание нового сегмента
segmentController.addEventListener('segment:saved', (data) => {
    // Обновление маркеров на карте
    if (data.mode === 'create') {
        mapController.loadAreaData(data.segment.map_area_id);
    }
});

// 5. Глобальные команды
app.executeCommand('segment.showCreateModal', { areaId: 'area_123' });
app.executeCommand('map.fitToVisibleData');
```

### Управление состоянием между контроллерами:

```javascript
// Использование DataState для синхронизации
dataState.subscribe('currentArea', (areaId) => {
    segmentController.loadSegmentsForArea(areaId);
    mapController.loadAreaData(areaId);
});

dataState.subscribe('selectedSegment', (segmentId) => {
    mapController.highlightSegmentData(segmentId);
    segmentController.viewSegment(segmentId);
});
```

---

**Контроллерная архитектура обеспечивает:**
- ✅ **Четкое разделение ответственности** между UI, логикой и данными
- ✅ **Event-driven коммуникацию** без прямых зависимостей
- ✅ **Централизованное управление** жизненным циклом приложения
- ✅ **Легкую тестируемость** каждого контроллера в изоляции
- ✅ **Расширяемость** для добавления новых контроллеров
- ✅ **Единообразие** паттернов взаимодействия