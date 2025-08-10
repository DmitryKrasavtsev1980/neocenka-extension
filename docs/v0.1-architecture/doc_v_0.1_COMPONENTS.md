# Компоненты Neocenka Extension v0.1

## Обзор компонентной архитектуры

В версии 0.1 внедрена полноценная компонентная архитектура, основанная на принципах **Single Responsibility** и **Event-Driven Design**. Все компоненты извлечены из монолитного SegmentsManager и разделены на специализированные модули.

## Структура компонентов

```
/components/
├── ui/                          # Пользовательский интерфейс
│   ├── SegmentModal.js                # Модальные окна сегментов
│   ├── SegmentTable.js                # Таблицы сегментов
│   └── SegmentChart.js                # Графики и аналитика
└── map/                         # Компоненты карты
    ├── MapRenderer.js                 # Отрисовка Leaflet карт
    └── MarkerManager.js               # Управление маркерами
```

---

## UI Components (Компоненты пользовательского интерфейса)

### SegmentModal

**Файл:** `/components/ui/SegmentModal.js`  
**Назначение:** Модальные окна для создания и редактирования сегментов  
**Зависимости:** `ValidationService`, `ReferenceDataService`

#### Основные методы:

```javascript
class SegmentModal {
    // Отображение модальных окон
    showCreateModal(areaId) {
        // Показывает модальное окно создания сегмента
        // Инициализирует форму с данными области
        // Загружает справочные данные
    }
    
    showEditModal(segment) {
        // Показывает модальное окно редактирования
        // Заполняет форму существующими данными
        // Настраивает валидацию для обновления
    }
    
    hideModal() {
        // Скрывает активное модальное окно
        // Очищает форму и сбрасывает валидацию
    }
    
    // Управление данными формы
    populateForm(segmentData) {
        // Заполнение полей формы данными сегмента
        // Установка значений селектов и inputs
    }
    
    collectFormData() {
        // Сбор данных из всех полей формы
        // Возвращает объект с данными сегмента
        return {
            name: string,
            description: string,
            map_area_id: string,
            filters: FilterObject
        }
    }
    
    resetForm() {
        // Сброс формы к состоянию по умолчанию
        // Очистка всех полей и ошибок валидации
    }
    
    // Работа со справочными данными
    updateSelectOptions(type, options) {
        // Обновление опций в селектах
        // type: 'house_series' | 'house_classes' | 'wall_materials'
    }
    
    loadReferenceData() {
        // Асинхронная загрузка справочных данных
        // Заполнение всех селектов актуальными данными
    }
    
    // Валидация
    validateForm() {
        // Клиентская валидация формы
        // Возвращает результат валидации
        return {
            isValid: boolean,
            errors: FieldErrors,
            warnings: FieldWarnings
        }
    }
    
    displayValidationErrors(errors) {
        // Отображение ошибок валидации в UI
        // Подсветка проблемных полей
    }
    
    clearValidationErrors() {
        // Очистка всех ошибок валидации
    }
}
```

#### События:

```javascript
// Система событий SegmentModal
modal.addEventListener('segment:save', (data) => {
    // Событие сохранения сегмента
    // data: { mode: 'create'|'edit', segmentData: Object }
});

modal.addEventListener('segment:cancel', () => {
    // Событие отмены операции
});

modal.addEventListener('segment:delete', (segmentId) => {
    // Событие удаления сегмента (только в режиме редактирования)
});

modal.addEventListener('validation:error', (errors) => {
    // Событие ошибок валидации
});
```

#### HTML структура формы:

```html
<div id="segmentModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 id="modalTitle">Создание сегмента</h3>
            <span class="close">&times;</span>
        </div>
        
        <form id="segmentForm" class="modal-body">
            <!-- Основная информация -->
            <div class="form-section">
                <h4>Основная информация</h4>
                <div class="form-group">
                    <label for="segmentName">Название сегмента*</label>
                    <input type="text" id="segmentName" name="name" required>
                    <div class="error-message"></div>
                </div>
                <div class="form-group">
                    <label for="segmentDescription">Описание</label>
                    <textarea id="segmentDescription" name="description"></textarea>
                </div>
            </div>
            
            <!-- Фильтры недвижимости -->
            <div class="form-section">
                <h4>Фильтры недвижимости</h4>
                
                <!-- Серии домов -->
                <div class="form-group">
                    <label for="houseSeriesSelect">Серии домов</label>
                    <select id="houseSeriesSelect" name="house_series_id" multiple>
                        <!-- Опции загружаются динамически -->
                    </select>
                </div>
                
                <!-- Классы домов -->
                <div class="form-group">
                    <label for="houseClassSelect">Классы домов</label>
                    <select id="houseClassSelect" name="house_class_id" multiple>
                        <!-- Опции загружаются динамически -->
                    </select>
                </div>
                
                <!-- Материалы стен -->
                <div class="form-group">
                    <label for="wallMaterialSelect">Материалы стен</label>
                    <select id="wallMaterialSelect" name="wall_material_id" multiple>
                        <!-- Опции загружаются динамически -->
                    </select>
                </div>
            </div>
            
            <!-- Числовые диапазоны -->
            <div class="form-section">
                <h4>Диапазоны</h4>
                
                <div class="range-group">
                    <label>Этажность</label>
                    <div class="range-inputs">
                        <input type="number" name="floors_from" placeholder="От" min="1">
                        <span>—</span>
                        <input type="number" name="floors_to" placeholder="До" min="1">
                    </div>
                </div>
                
                <div class="range-group">
                    <label>Год постройки</label>
                    <div class="range-inputs">
                        <input type="number" name="build_year_from" placeholder="От" min="1800">
                        <span>—</span>
                        <input type="number" name="build_year_to" placeholder="До" max="2030">
                    </div>
                </div>
                
                <div class="range-group">
                    <label>Площадь (м²)</label>
                    <div class="range-inputs">
                        <input type="number" name="area_from" placeholder="От" min="1" step="0.1">
                        <span>—</span>
                        <input type="number" name="area_to" placeholder="До" step="0.1">
                    </div>
                </div>
                
                <div class="range-group">
                    <label>Цена (руб.)</label>
                    <div class="range-inputs">
                        <input type="number" name="price_from" placeholder="От" min="0" step="1000">
                        <span>—</span>
                        <input type="number" name="price_to" placeholder="До" step="1000">
                    </div>
                </div>
            </div>
        </form>
        
        <div class="modal-footer">
            <button type="button" id="saveSegmentBtn" class="btn btn-primary">
                Сохранить
            </button>
            <button type="button" id="cancelSegmentBtn" class="btn btn-secondary">
                Отмена
            </button>
            <button type="button" id="deleteSegmentBtn" class="btn btn-danger" style="display: none;">
                Удалить
            </button>
        </div>
    </div>
</div>
```

#### Пример использования:

```javascript
// Инициализация модального окна
const modal = new SegmentModal(container.get('ValidationService'));

// Подписка на события
modal.addEventListener('segment:save', async (eventData) => {
    const { mode, segmentData } = eventData;
    
    if (mode === 'create') {
        await segmentController.createSegment(segmentData);
    } else {
        await segmentController.updateSegment(segmentData);
    }
});

// Показ модального окна создания
modal.showCreateModal('area_123');

// Показ модального окна редактирования
modal.showEditModal(existingSegment);
```

---

### SegmentTable

**Файл:** `/components/ui/SegmentTable.js`  
**Назначение:** Таблица для отображения и управления сегментами  
**Зависимости:** `DataTables`, `SegmentService`

#### Основные методы:

```javascript
class SegmentTable {
    // Управление данными
    updateData(segments) {
        // Полное обновление данных таблицы
        // Пересоздание всех строк
    }
    
    addSegment(segment) {
        // Добавление новой строки в таблицу
        // Анимация появления
    }
    
    updateSegment(segmentId, segmentData) {
        // Обновление существующей строки
        // Подсветка изменений
    }
    
    removeSegment(segmentId) {
        // Удаление строки из таблицы
        // Анимация исчезновения
    }
    
    // Фильтрация и поиск
    applyFilter(filterFunction) {
        // Применение пользовательского фильтра
        // filterFunction: (segment) => boolean
    }
    
    clearFilter() {
        // Очистка всех активных фильтров
    }
    
    search(query) {
        // Глобальный поиск по таблице
    }
    
    // Сортировка
    sortBy(columnName, direction = 'asc') {
        // Сортировка по указанной колонке
        // direction: 'asc' | 'desc'
    }
    
    // Выбор строк
    selectSegment(segmentId) {
        // Выделение строки сегмента
        // Эмиссия события выбора
    }
    
    getSelectedSegments() {
        // Получение массива выбранных сегментов
        return segmentIds[];
    }
    
    clearSelection() {
        // Очистка выбора всех строк
    }
    
    // DataTables интеграция
    initializeDataTable(options = {}) {
        // Инициализация DataTables с настройками
    }
    
    refreshDataTable() {
        // Принудительное обновление DataTables
    }
    
    destroyDataTable() {
        // Уничтожение DataTables instance
    }
}
```

#### Конфигурация DataTables:

```javascript
const defaultTableConfig = {
    // Базовые настройки
    responsive: true,
    pageLength: 25,
    lengthMenu: [10, 25, 50, 100],
    searching: true,
    ordering: true,
    info: true,
    
    // Языковая локализация
    language: {
        "lengthMenu": "Показать _MENU_ записей",
        "zeroRecords": "Сегменты не найдены",
        "info": "Показано с _START_ по _END_ из _TOTAL_ записей",
        "infoEmpty": "Показано 0 записей",
        "infoFiltered": "(отфильтровано из _MAX_ записей)",
        "search": "Поиск:",
        "paginate": {
            "first": "Первая",
            "last": "Последняя",
            "next": "Следующая",
            "previous": "Предыдущая"
        }
    },
    
    // Определение колонок
    columns: [
        {
            title: "Название",
            data: "name",
            render: function(data, type, row) {
                return `<a href="#" class="segment-name" data-id="${row.id}">${data}</a>`;
            }
        },
        {
            title: "Область",
            data: "area_name",
            orderable: true
        },
        {
            title: "Описание",
            data: "description",
            orderable: false,
            render: function(data) {
                return data ? truncateText(data, 50) : '—';
            }
        },
        {
            title: "Объектов",
            data: "object_count",
            className: "text-center",
            render: function(data) {
                return `<span class="badge badge-info">${data || 0}</span>`;
            }
        },
        {
            title: "Средняя цена",
            data: "average_price",
            className: "text-right",
            render: function(data) {
                return data ? formatPrice(data) : '—';
            }
        },
        {
            title: "Обновлено",
            data: "updated_at",
            render: function(data) {
                return formatDate(data, 'dd.MM.yyyy');
            }
        },
        {
            title: "Действия",
            data: null,
            orderable: false,
            render: function(data, type, row) {
                return `
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary edit-segment" data-id="${row.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-info view-segment" data-id="${row.id}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-segment" data-id="${row.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            }
        }
    ],
    
    // Обработчики событий
    drawCallback: function() {
        // Вызывается после каждой перерисовки
        this.bindActionEvents();
    }
};
```

#### События таблицы:

```javascript
// События SegmentTable
table.addEventListener('segment:select', (segmentId) => {
    // Выбор сегмента
});

table.addEventListener('segment:edit', (segmentId) => {
    // Запрос редактирования
});

table.addEventListener('segment:view', (segmentId) => {
    // Запрос просмотра деталей
});

table.addEventListener('segment:delete', (segmentId) => {
    // Запрос удаления
});

table.addEventListener('filter:change', (filterParams) => {
    // Изменение фильтров
});
```

#### HTML структура:

```html
<div id="segmentTableContainer" class="table-container">
    <!-- Панель инструментов -->
    <div class="table-toolbar">
        <div class="toolbar-left">
            <button id="createSegmentBtn" class="btn btn-primary">
                <i class="fas fa-plus"></i> Создать сегмент
            </button>
            <button id="exportSegmentsBtn" class="btn btn-secondary">
                <i class="fas fa-download"></i> Экспорт
            </button>
        </div>
        
        <div class="toolbar-right">
            <div class="search-box">
                <input type="text" id="tableSearch" placeholder="Поиск сегментов..." class="form-control">
            </div>
        </div>
    </div>
    
    <!-- Таблица -->
    <table id="segmentsTable" class="display table table-striped table-hover">
        <thead>
            <tr>
                <th>Название</th>
                <th>Область</th>
                <th>Описание</th>
                <th>Объектов</th>
                <th>Средняя цена</th>
                <th>Обновлено</th>
                <th>Действия</th>
            </tr>
        </thead>
        <tbody>
            <!-- Данные загружаются динамически -->
        </tbody>
    </table>
</div>
```

---

### SegmentChart

**Файл:** `/components/ui/SegmentChart.js`  
**Назначение:** Графики и аналитические диаграммы для сегментов  
**Зависимости:** `ApexCharts`, `SegmentService`

#### Основные методы:

```javascript
class SegmentChart {
    // Создание графиков
    createAreaDistributionChart(data, containerId) {
        // Круговая диаграмма распределения площадей
        const options = {
            series: data.values,
            labels: data.labels,
            chart: {
                type: 'donut',
                height: 350
            },
            title: {
                text: 'Распределение по площадям'
            }
        };
        return new ApexCharts(document.querySelector(containerId), options);
    }
    
    createPriceDistributionChart(data, containerId) {
        // Гистограмма распределения цен
        const options = {
            series: [{
                name: 'Количество объектов',
                data: data.values
            }],
            chart: {
                type: 'column',
                height: 350
            },
            xaxis: {
                categories: data.priceRanges,
                title: {
                    text: 'Диапазон цен (руб.)'
                }
            },
            title: {
                text: 'Распределение по ценам'
            }
        };
        return new ApexCharts(document.querySelector(containerId), options);
    }
    
    createPriceHistoryChart(data, containerId) {
        // Линейный график истории изменения цен
        const options = {
            series: [{
                name: 'Средняя цена',
                data: data.prices
            }],
            chart: {
                type: 'line',
                height: 350,
                zoom: {
                    enabled: true
                }
            },
            xaxis: {
                categories: data.dates,
                type: 'datetime'
            },
            title: {
                text: 'История изменения цен'
            }
        };
        return new ApexCharts(document.querySelector(containerId), options);
    }
    
    createBuildYearDistributionChart(data, containerId) {
        // Столбчатая диаграмма по годам постройки
        const options = {
            series: [{
                name: 'Количество объектов',
                data: data.counts
            }],
            chart: {
                type: 'bar',
                height: 350
            },
            xaxis: {
                categories: data.periods,
                title: {
                    text: 'Период постройки'
                }
            },
            title: {
                text: 'Распределение по годам постройки'
            }
        };
        return new ApexCharts(document.querySelector(containerId), options);
    }
    
    // Управление существующими графиками
    updateChart(chartId, newData) {
        // Обновление данных существующего графика
        const chart = this.charts[chartId];
        if (chart) {
            chart.updateSeries(newData);
        }
    }
    
    destroyChart(chartId) {
        // Уничтожение графика и освобождение памяти
        const chart = this.charts[chartId];
        if (chart) {
            chart.destroy();
            delete this.charts[chartId];
        }
    }
    
    destroyAllCharts() {
        // Уничтожение всех активных графиков
        Object.keys(this.charts).forEach(chartId => {
            this.destroyChart(chartId);
        });
    }
    
    // Конфигурация и темы
    getDefaultChartOptions() {
        // Базовые настройки для всех типов графиков
        return {
            chart: {
                fontFamily: 'Inter, system-ui, sans-serif',
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: false,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: false,
                        reset: true
                    }
                }
            },
            theme: {
                mode: 'light',
                palette: 'palette1'
            },
            colors: ['#008FFB', '#00E396', '#FEB019', '#FF4560', '#775DD0'],
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'smooth'
            },
            grid: {
                borderColor: '#e7e7e7',
                row: {
                    colors: ['#f3f3f3', 'transparent'],
                    opacity: 0.5
                }
            }
        };
    }
    
    applyTheme(theme) {
        // Применение темы ко всем графикам
        // theme: 'light' | 'dark'
        const themeConfig = {
            mode: theme,
            palette: theme === 'dark' ? 'palette2' : 'palette1'
        };
        
        Object.values(this.charts).forEach(chart => {
            chart.updateOptions({
                theme: themeConfig
            });
        });
    }
}
```

#### Типы данных для графиков:

```javascript
// Данные для диаграммы распределения площадей
const areaDistributionData = {
    labels: ['< 40 м²', '40-60 м²', '60-80 м²', '80-100 м²', '> 100 м²'],
    values: [15, 35, 25, 20, 5]
};

// Данные для распределения цен
const priceDistributionData = {
    priceRanges: ['< 3 млн', '3-5 млн', '5-7 млн', '7-10 млн', '> 10 млн'],
    values: [8, 25, 30, 15, 7]
};

// Данные для истории цен
const priceHistoryData = {
    dates: ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05'],
    prices: [4500000, 4600000, 4750000, 4800000, 4900000]
};

// Данные для распределения по годам постройки
const buildYearData = {
    periods: ['до 1960', '1960-1980', '1980-2000', '2000-2010', 'после 2010'],
    counts: [5, 12, 20, 35, 28]
};
```

#### HTML контейнеры для графиков:

```html
<div id="chartContainer" class="charts-container">
    <!-- Панель управления графиками -->
    <div class="chart-controls">
        <div class="chart-tabs">
            <button class="tab-button active" data-chart="distribution">Распределение</button>
            <button class="tab-button" data-chart="prices">Цены</button>
            <button class="tab-button" data-chart="history">История</button>
            <button class="tab-button" data-chart="timeline">Временная шкала</button>
        </div>
        
        <div class="chart-options">
            <select id="chartTheme" class="form-select">
                <option value="light">Светлая тема</option>
                <option value="dark">Темная тема</option>
            </select>
            <button id="exportChart" class="btn btn-secondary">Экспорт</button>
        </div>
    </div>
    
    <!-- Контейнеры графиков -->
    <div id="areaDistributionChart" class="chart-panel active"></div>
    <div id="priceDistributionChart" class="chart-panel"></div>
    <div id="priceHistoryChart" class="chart-panel"></div>
    <div id="buildYearChart" class="chart-panel"></div>
</div>
```

---

## Map Components (Компоненты карты)

### MapRenderer

**Файл:** `/components/map/MapRenderer.js`  
**Назначение:** Отрисовка и управление Leaflet картами  
**Зависимости:** `Leaflet`, `ConfigService`

#### Основные методы:

```javascript
class MapRenderer {
    // Создание и инициализация карты
    async createMap(containerId, options = {}) {
        // Создание экземпляра Leaflet карты
        // Настройка базовых слоев и контролов
        const defaultOptions = {
            center: [55.0084, 82.9357], // Новосибирск
            zoom: 13,
            maxZoom: 18,
            minZoom: 5,
            zoomControl: true,
            attributionControl: true
        };
        
        const mapOptions = { ...defaultOptions, ...options };
        this.map = L.map(containerId, mapOptions);
        
        // Добавление базового слоя
        await this.addBaseLayer();
        
        return this.map;
    }
    
    // Управление слоями
    addLayer(layerId, layer, options = {}) {
        // Добавление слоя на карту
        // Регистрация в реестре слоев
        this.layers[layerId] = {
            layer: layer,
            visible: options.visible !== false,
            zIndex: options.zIndex || 1000
        };
        
        if (this.layers[layerId].visible) {
            this.map.addLayer(layer);
        }
    }
    
    removeLayer(layerId) {
        // Удаление слоя с карты
        const layerInfo = this.layers[layerId];
        if (layerInfo) {
            this.map.removeLayer(layerInfo.layer);
            delete this.layers[layerId];
        }
    }
    
    toggleLayer(layerId, visible) {
        // Переключение видимости слоя
        const layerInfo = this.layers[layerId];
        if (layerInfo) {
            if (visible && !layerInfo.visible) {
                this.map.addLayer(layerInfo.layer);
                layerInfo.visible = true;
            } else if (!visible && layerInfo.visible) {
                this.map.removeLayer(layerInfo.layer);
                layerInfo.visible = false;
            }
        }
    }
    
    // Навигация и позиционирование
    setView(center, zoom, options = {}) {
        // Установка центра и масштаба карты
        this.map.setView(center, zoom, options);
    }
    
    fitBounds(bounds, options = {}) {
        // Подгонка карты под указанные границы
        const defaultOptions = {
            padding: [20, 20],
            maxZoom: 16
        };
        this.map.fitBounds(bounds, { ...defaultOptions, ...options });
    }
    
    getBounds() {
        // Получение текущих границ видимой области
        return this.map.getBounds();
    }
    
    // Контролы и виджеты
    addControl(controlId, control, position = 'topright') {
        // Добавление контрола на карту
        this.controls[controlId] = {
            control: control,
            position: position
        };
        
        control.addTo(this.map);
    }
    
    removeControl(controlId) {
        // Удаление контрола
        const controlInfo = this.controls[controlId];
        if (controlInfo) {
            this.map.removeControl(controlInfo.control);
            delete this.controls[controlId];
        }
    }
    
    createDrawingControl(options = {}) {
        // Создание контрола рисования полигонов
        const drawOptions = {
            position: 'topright',
            draw: {
                polygon: {
                    allowIntersection: false,
                    drawError: {
                        color: '#e1e100',
                        message: '<strong>Ошибка:</strong> границы не должны пересекаться!'
                    },
                    shapeOptions: {
                        color: '#97009c'
                    }
                },
                polyline: false,
                circle: false,
                rectangle: false,
                marker: false,
                circlemarker: false
            },
            edit: {
                featureGroup: options.editableFeatureGroup,
                remove: true
            }
        };
        
        return new L.Control.Draw({ ...drawOptions, ...options });
    }
    
    // Утилиты карты
    latLngToContainerPoint(latlng) {
        // Конвертация географических координат в пиксели контейнера
        return this.map.latLngToContainerPoint(latlng);
    }
    
    containerPointToLatLng(point) {
        // Конвертация пикселей в географические координаты
        return this.map.containerPointToLatLng(point);
    }
    
    // Снимки экрана
    async takeScreenshot(options = {}) {
        // Создание скриншота карты
        const defaultOptions = {
            width: 1024,
            height: 768,
            format: 'png'
        };
        
        // Реализация через html2canvas или leaflet-image
        // Возвращает blob или base64
    }
    
    // Базовые слои карты
    async addBaseLayer(type = 'osm') {
        // Добавление базового слоя карты
        const baseLayers = {
            osm: {
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                maxZoom: 18
            },
            satellite: {
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: 'Esri, DigitalGlobe, GeoEye, Earthstar Geographics',
                maxZoom: 17
            }
        };
        
        const layerConfig = baseLayers[type] || baseLayers.osm;
        const baseLayer = L.tileLayer(layerConfig.url, layerConfig);
        
        this.addLayer('base', baseLayer);
        return baseLayer;
    }
}
```

#### События карты:

```javascript
// События MapRenderer
renderer.addEventListener('map:ready', (map) => {
    // Карта инициализирована и готова к использованию
});

renderer.addEventListener('layer:added', (layerId, layer) => {
    // Слой добавлен на карту
});

renderer.addEventListener('layer:removed', (layerId) => {
    // Слой удален с карты
});

renderer.addEventListener('bounds:changed', (bounds) => {
    // Изменились границы видимой области
});
```

---

### MarkerManager

**Файл:** `/components/map/MarkerManager.js`  
**Назначение:** Управление маркерами и кластеризацией на карте  
**Зависимости:** `Leaflet`, `MarkerClusterer`

#### Основные методы:

```javascript
class MarkerManager {
    // Создание маркеров
    createMarker(markerId, latLng, options = {}) {
        // Создание отдельного маркера
        const defaultOptions = {
            icon: this.getDefaultIcon(options.type || 'default'),
            title: options.title || '',
            alt: options.alt || '',
            riseOnHover: true,
            zIndexOffset: options.zIndexOffset || 0
        };
        
        const marker = L.marker(latLng, { ...defaultOptions, ...options });
        
        // Привязка popup если есть данные
        if (options.popupContent) {
            marker.bindPopup(options.popupContent, {
                maxWidth: 300,
                minWidth: 200
            });
        }
        
        // Привязка tooltip
        if (options.tooltip) {
            marker.bindTooltip(options.tooltip, {
                permanent: false,
                direction: 'top',
                offset: [0, -20]
            });
        }
        
        this.markers[markerId] = marker;
        return marker;
    }
    
    createMarkersFromData(dataItems, mapperFunction) {
        // Массовое создание маркеров из данных
        // mapperFunction: (item) => { id, latLng, options }
        const markers = {};
        
        dataItems.forEach(item => {
            const markerData = mapperFunction(item);
            if (markerData && markerData.latLng) {
                markers[markerData.id] = this.createMarker(
                    markerData.id,
                    markerData.latLng,
                    markerData.options || {}
                );
            }
        });
        
        return markers;
    }
    
    // Отображение маркеров
    showMarker(markerId, layerId = 'default') {
        // Показать маркер на указанном слое
        const marker = this.markers[markerId];
        if (marker && this.mapRenderer) {
            const layer = this.getOrCreateLayer(layerId);
            layer.addLayer(marker);
            marker._layerId = layerId;
        }
    }
    
    hideMarker(markerId) {
        // Скрыть маркер
        const marker = this.markers[markerId];
        if (marker && marker._layerId) {
            const layer = this.layers[marker._layerId];
            if (layer) {
                layer.removeLayer(marker);
            }
        }
    }
    
    removeMarker(markerId) {
        // Полное удаление маркера
        this.hideMarker(markerId);
        delete this.markers[markerId];
    }
    
    // Групповые операции
    showGroup(groupName, layerId = 'default') {
        // Показать группу маркеров
        const groupMarkers = this.groups[groupName] || [];
        groupMarkers.forEach(markerId => {
            this.showMarker(markerId, layerId);
        });
    }
    
    hideGroup(groupName) {
        // Скрыть группу маркеров
        const groupMarkers = this.groups[groupName] || [];
        groupMarkers.forEach(markerId => {
            this.hideMarker(markerId);
        });
    }
    
    createGroup(groupName, markerIds) {
        // Создание группы маркеров
        this.groups[groupName] = markerIds;
    }
    
    // Кластеризация
    toggleClustering(enabled) {
        // Включение/выключение кластеризации
        if (enabled && !this.clusterGroup) {
            this.clusterGroup = L.markerClusterGroup({
                maxClusterRadius: 50,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                iconCreateFunction: this.createClusterIcon.bind(this)
            });
            
            // Перенос маркеров в кластер
            Object.values(this.markers).forEach(marker => {
                if (marker._layerId) {
                    this.hideMarker(marker._markerId);
                    this.clusterGroup.addLayer(marker);
                }
            });
            
            this.mapRenderer.addLayer('clusters', this.clusterGroup);
            this.clusteringEnabled = true;
            
        } else if (!enabled && this.clusterGroup) {
            this.mapRenderer.removeLayer('clusters');
            this.clusterGroup = null;
            this.clusteringEnabled = false;
            
            // Восстановление маркеров на обычные слои
            // TODO: реализовать восстановление позиций
        }
    }
    
    createClusterIcon(cluster) {
        // Создание иконки кластера
        const childCount = cluster.getChildCount();
        let className = 'marker-cluster-';
        
        if (childCount < 10) {
            className += 'small';
        } else if (childCount < 100) {
            className += 'medium';
        } else {
            className += 'large';
        }
        
        return L.divIcon({
            html: `<div><span>${childCount}</span></div>`,
            className: `marker-cluster ${className}`,
            iconSize: L.point(40, 40)
        });
    }
    
    // Фильтрация и поиск
    filterMarkers(filterFunction) {
        // Фильтрация маркеров по функции
        // filterFunction: (marker, markerId) => boolean
        const filteredMarkers = {};
        
        Object.entries(this.markers).forEach(([markerId, marker]) => {
            if (filterFunction(marker, markerId)) {
                filteredMarkers[markerId] = marker;
                this.showMarker(markerId);
            } else {
                this.hideMarker(markerId);
            }
        });
        
        return filteredMarkers;
    }
    
    searchNearby(center, radiusMeters) {
        // Поиск маркеров в радиусе от точки
        const nearby = {};
        
        Object.entries(this.markers).forEach(([markerId, marker]) => {
            const distance = center.distanceTo(marker.getLatLng());
            if (distance <= radiusMeters) {
                nearby[markerId] = {
                    marker: marker,
                    distance: distance
                };
            }
        });
        
        return nearby;
    }
    
    // Подгонка карты под маркеры
    fitBounds(markerIds = null, options = {}) {
        // Подгонка карты под границы маркеров
        const markersToFit = markerIds ? 
            markerIds.map(id => this.markers[id]).filter(Boolean) :
            Object.values(this.markers);
        
        if (markersToFit.length === 0) return;
        
        const group = new L.featureGroup(markersToFit);
        this.mapRenderer.fitBounds(group.getBounds(), options);
    }
    
    // Иконки маркеров
    getDefaultIcon(type) {
        // Получение иконки по типу маркера
        const iconConfigs = {
            default: {
                iconUrl: '/images/marker-default.png',
                shadowUrl: '/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            },
            listing: {
                iconUrl: '/images/marker-listing.png',
                iconSize: [20, 32],
                iconAnchor: [10, 32],
                popupAnchor: [0, -32]
            },
            segment: {
                iconUrl: '/images/marker-segment.png',
                iconSize: [30, 45],
                iconAnchor: [15, 45],
                popupAnchor: [0, -45]
            }
        };
        
        const config = iconConfigs[type] || iconConfigs.default;
        return L.icon(config);
    }
}
```

#### Пример использования компонентов карты:

```javascript
// Инициализация компонентов карты
const mapRenderer = new MapRenderer();
const markerManager = new MarkerManager(mapRenderer);

// Создание карты
const map = await mapRenderer.createMap('mapContainer', {
    center: [55.0084, 82.9357],
    zoom: 13
});

// Создание маркеров из данных
const addresses = await getAddressesBySegment(segmentId);
const markers = markerManager.createMarkersFromData(addresses, (address) => ({
    id: address.id,
    latLng: [address.coordinates.lat, address.coordinates.lng],
    options: {
        type: 'listing',
        title: address.address,
        popupContent: createAddressPopup(address),
        tooltip: `${address.address}<br>Цена: ${formatPrice(address.price)}`
    }
}));

// Показ маркеров с кластеризацией
markerManager.toggleClustering(true);
markerManager.showGroup('current_segment');

// Подгонка карты под маркеры
markerManager.fitBounds();
```

---

**Все компоненты работают в единой экосистеме обеспечивая:**
- ✅ **Модульность** - каждый компонент решает свою задачу
- ✅ **Переиспользование** - компоненты могут использоваться в разных контекстах  
- ✅ **Event-driven коммуникацию** - слабая связанность через события
- ✅ **Единообразие** - общие интерфейсы и паттерны
- ✅ **Производительность** - оптимизированные операции с DOM
- ✅ **Расширяемость** - легкое добавление новых типов компонентов