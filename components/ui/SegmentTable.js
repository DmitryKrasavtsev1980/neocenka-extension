/**
 * SegmentTable - компонент управления таблицей сегментов
 * Извлечён из SegmentsManager для соблюдения принципа единственной ответственности
 */

class SegmentTable {
    constructor(configService, validationService) {
        this.configService = configService;
        this.validationService = validationService;
        
        this.tableElement = null;
        this.dataTable = null;
        this.tableContainer = null;
        
        // Данные таблицы
        this.segments = [];
        this.filteredSegments = [];
        
        // Конфигурация
        this.config = this.getTableConfig();
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Кэш для производительности
        this.rowCache = new Map();
        
        this.initialize();
    }

    /**
     * Получение конфигурации таблицы
     */
    getTableConfig() {
        const uiConfig = this.configService?.getUIConfig('table') || {};
        
        return {
            pageSize: uiConfig.defaultPageSize || 25,
            pageSizeOptions: uiConfig.pageSizeOptions || [10, 25, 50, 100],
            sorting: uiConfig.defaultSorting || { column: 'created_at', direction: 'desc' },
            language: {
                emptyTable: 'Нет данных для отображения',
                info: 'Показано _START_ - _END_ из _TOTAL_ записей',
                infoEmpty: 'Показано 0 - 0 из 0 записей',
                infoFiltered: '(отфильтровано из _MAX_ записей)',
                lengthMenu: 'Показать _MENU_ записей',
                loadingRecords: 'Загрузка...',
                processing: 'Обработка...',
                search: 'Поиск:',
                zeroRecords: 'Записи не найдены',
                paginate: {
                    first: 'Первая',
                    last: 'Последняя',
                    next: 'Следующая',
                    previous: 'Предыдущая'
                }
            }
        };
    }

    /**
     * Инициализация таблицы
     */
    initialize() {
        this.tableElement = document.getElementById('segmentsTable');
        this.tableContainer = document.getElementById('segmentsTableContainer');
        
        if (!this.tableElement) {
            console.warn('⚠️ Элемент таблицы сегментов не найден (нормально для страниц без таблицы сегментов)');
            return;
        }

        // Инициализируем DataTable
        this.initializeDataTable();
        
        // Настраиваем обработчики событий
        this.setupEventListeners();
    }

    /**
     * Инициализация DataTable
     */
    initializeDataTable() {
        if (this.dataTable) {
            this.dataTable.destroy();
        }

        const columns = this.getColumnDefinitions();
        
        this.dataTable = $(this.tableElement).DataTable({
            // Основные настройки
            data: this.segments,
            columns: columns,
            
            // Пагинация
            paging: true,
            pageLength: this.config.pageSize,
            lengthMenu: this.config.pageSizeOptions,
            
            // Сортировка
            ordering: true,
            order: [[this.getColumnIndex('created_at'), 'desc']],
            
            // Поиск
            searching: true,
            searchDelay: 300,
            
            // Отображение
            info: true,
            processing: false,
            serverSide: false,
            
            // Локализация
            language: this.config.language,
            
            // Responsive (проверяем наличие плагина)
            responsive: $.fn.dataTable?.Responsive ? {
                details: {
                    display: $.fn.dataTable.Responsive.display.childRowImmediate,
                    type: 'column',
                    target: 'tr'
                }
            } : false,
            
            // Колонки
            columnDefs: [
                {
                    targets: 'no-sort',
                    orderable: false
                },
                {
                    targets: 'actions-column',
                    width: '120px',
                    className: 'text-center'
                },
                {
                    targets: 'date-column',
                    type: 'date',
                    render: this.renderDateColumn
                }
            ],
            
            // Callbacks
            drawCallback: () => this.onTableDraw(),
            initComplete: () => this.onTableInit(),
            
            // Стили
            dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
                 '<"row"<"col-sm-12"tr>>' +
                 '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
            
            // Класс таблицы
            className: 'table table-striped table-hover'
        });
    }

    /**
     * Определение колонок таблицы
     */
    getColumnDefinitions() {
        return [
            {
                title: 'Название',
                data: 'name',
                name: 'name',
                render: this.renderNameColumn.bind(this),
                className: 'segment-name-column'
            },
            {
                title: 'Описание',
                data: 'description',
                name: 'description',
                render: this.renderDescriptionColumn.bind(this),
                className: 'segment-description-column'
            },
            {
                title: 'Фильтры',
                data: 'filters',
                name: 'filters',
                render: this.renderFiltersColumn.bind(this),
                orderable: false,
                className: 'segment-filters-column'
            },
            {
                title: 'Объекты',
                data: null,
                name: 'object_count',
                render: this.renderObjectCountColumn.bind(this),
                className: 'text-center segment-count-column'
            },
            {
                title: 'Создан',
                data: 'created_at',
                name: 'created_at',
                render: this.renderDateColumn.bind(this),
                className: 'date-column'
            },
            {
                title: 'Действия',
                data: null,
                name: 'actions',
                render: this.renderActionsColumn.bind(this),
                orderable: false,
                className: 'actions-column no-sort text-center'
            }
        ];
    }

    /**
     * Получение индекса колонки по имени
     */
    getColumnIndex(columnName) {
        const columns = this.getColumnDefinitions();
        return columns.findIndex(col => col.name === columnName);
    }

    /**
     * Рендеринг колонки названия
     */
    renderNameColumn(data, type, row) {
        if (type === 'display') {
            const name = this.escapeHtml(data || 'Без названия');
            const description = row.description ? ` title="${this.escapeHtml(row.description)}"` : '';
            
            return `<span class="segment-name" data-segment-id="${row.id}"${description}>
                        <strong>${name}</strong>
                    </span>`;
        }
        return data || '';
    }

    /**
     * Рендеринг колонки описания
     */
    renderDescriptionColumn(data, type, row) {
        if (type === 'display') {
            if (!data) {
                return '<span class="text-muted">—</span>';
            }
            
            const truncated = data.length > 100 ? data.substring(0, 100) + '...' : data;
            const fullText = data.length > 100 ? ` title="${this.escapeHtml(data)}"` : '';
            
            return `<span class="segment-description"${fullText}>${this.escapeHtml(truncated)}</span>`;
        }
        return data || '';
    }

    /**
     * Рендеринг колонки фильтров
     */
    renderFiltersColumn(data, type, row) {
        if (type === 'display') {
            if (!data || typeof data !== 'object') {
                return '<span class="text-muted">Без фильтров</span>';
            }

            const filters = [];

            // Серии домов
            if (data.house_series_id && data.house_series_id.length > 0) {
                filters.push(`Серии: ${data.house_series_id.length}`);
            }

            // Классы домов
            if (data.house_class_id && data.house_class_id.length > 0) {
                filters.push(`Классы: ${data.house_class_id.length}`);
            }

            // Материалы стен
            if (data.wall_material_id && data.wall_material_id.length > 0) {
                filters.push(`Материалы: ${data.wall_material_id.length}`);
            }

            // Диапазон этажей
            if (data.floors_from !== undefined || data.floors_to !== undefined) {
                const from = data.floors_from || 'любой';
                const to = data.floors_to || 'любой';
                filters.push(`Этажи: ${from} — ${to}`);
            }

            // Диапазон годов
            if (data.build_year_from !== undefined || data.build_year_to !== undefined) {
                const from = data.build_year_from || 'любой';
                const to = data.build_year_to || 'любой';
                filters.push(`Годы: ${from} — ${to}`);
            }

            // Типы недвижимости
            if (data.property_type && data.property_type.length > 0) {
                const typeNames = {
                    'apartment': 'Квартиры',
                    'house': 'Дома',
                    'commercial': 'Коммерция'
                };
                const types = data.property_type.map(type => typeNames[type] || type).join(', ');
                filters.push(`Типы: ${types}`);
            }

            if (filters.length === 0) {
                return '<span class="text-muted">Без фильтров</span>';
            }

            const displayFilters = filters.slice(0, 2);
            const remainingCount = filters.length - displayFilters.length;
            
            let html = displayFilters.map(filter => 
                `<small class="badge badge-secondary me-1">${filter}</small>`
            ).join('');

            if (remainingCount > 0) {
                html += `<small class="badge badge-light">+${remainingCount}</small>`;
            }

            return html;
        }
        
        // For sorting and filtering
        return JSON.stringify(data);
    }

    /**
     * Рендеринг колонки количества объектов
     */
    renderObjectCountColumn(data, type, row) {
        if (type === 'display') {
            // Здесь должен быть подсчёт объектов в сегменте
            // Пока заглушка
            const count = row.object_count || 0;
            
            if (count === 0) {
                return '<span class="text-muted">0</span>';
            }
            
            return `<span class="badge badge-primary">${count}</span>`;
        }
        
        return row.object_count || 0;
    }

    /**
     * Рендеринг колонки даты
     */
    renderDateColumn(data, type, row) {
        if (type === 'display') {
            if (!data) {
                return '<span class="text-muted">—</span>';
            }
            
            const date = new Date(data);
            if (isNaN(date.getTime())) {
                return '<span class="text-muted">—</span>';
            }
            
            const formatted = date.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `<span class="text-nowrap" title="${date.toLocaleString('ru-RU')}">${formatted}</span>`;
        }
        
        return data;
    }

    /**
     * Рендеринг колонки действий
     */
    renderActionsColumn(data, type, row) {
        if (type === 'display') {
            const segmentId = row.id;
            
            return `
                <div class="btn-group" role="group">
                    <button type="button" 
                            class="btn btn-sm btn-outline-primary edit-segment-btn" 
                            data-segment-id="${segmentId}"
                            title="Редактировать сегмент">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" 
                            class="btn btn-sm btn-outline-info view-segment-btn" 
                            data-segment-id="${segmentId}"
                            title="Просмотр сегмента">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" 
                            class="btn btn-sm btn-outline-danger delete-segment-btn" 
                            data-segment-id="${segmentId}"
                            title="Удалить сегмент">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        
        return '';
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Клики по кнопкам действий
        $(this.tableElement).on('click', '.edit-segment-btn', (e) => {
            const segmentId = $(e.currentTarget).data('segment-id');
            this.emit('segment:edit', { segmentId });
        });

        $(this.tableElement).on('click', '.view-segment-btn', (e) => {
            const segmentId = $(e.currentTarget).data('segment-id');
            this.emit('segment:view', { segmentId });
        });

        $(this.tableElement).on('click', '.delete-segment-btn', (e) => {
            const segmentId = $(e.currentTarget).data('segment-id');
            
            if (confirm('Вы уверены, что хотите удалить этот сегмент?')) {
                this.emit('segment:delete', { segmentId });
            }
        });

        // Двойной клик по строке для редактирования
        $(this.tableElement).on('dblclick', 'tbody tr', (e) => {
            const data = this.dataTable.row(e.currentTarget).data();
            if (data && data.id) {
                this.emit('segment:edit', { segmentId: data.id });
            }
        });

        // Клик по названию сегмента
        $(this.tableElement).on('click', '.segment-name', (e) => {
            const segmentId = $(e.currentTarget).data('segment-id');
            this.emit('segment:select', { segmentId });
        });
    }

    /**
     * Обработка завершения отрисовки таблицы
     */
    onTableDraw() {
        // Добавляем tooltips для кнопок, только если Bootstrap доступен
        if (typeof $.fn.tooltip === 'function') {
            $('[title]', this.tableElement).tooltip();
        } else {
            console.warn('⚠️ Bootstrap tooltips не загружены, пропускаем инициализацию tooltips');
        }
        
        // Обновляем статистику
        this.updateTableStatistics();
        
        // Уведомляем о перерисовке
        this.emit('table:drawn');
    }

    /**
     * Обработка завершения инициализации таблицы
     */
    onTableInit() {
        // Настраиваем дополнительные стили
        this.applyCustomStyles();
        
        // Уведомляем об инициализации
        this.emit('table:initialized');
    }

    /**
     * Применение кастомных стилей
     */
    applyCustomStyles() {
        // Добавляем классы для responsive поведения
        $(this.tableElement).addClass('table-responsive-md');
        
        // Настраиваем высоту контейнера таблицы
        if (this.tableContainer) {
            const maxHeight = this.configService?.get('performance.ui.maxTableRows') * 50 || 25000;
            $(this.tableContainer).css('max-height', `${maxHeight}px`);
        }
    }

    /**
     * Обновление данных таблицы
     */
    updateData(segments) {
        if (!this.tableElement) {
            console.warn('⚠️ SegmentTable не инициализирован, обновление данных пропущено');
            return;
        }
        
        this.segments = segments || [];
        this.filteredSegments = [...this.segments];
        
        if (this.dataTable) {
            this.dataTable.clear();
            this.dataTable.rows.add(this.segments);
            this.dataTable.draw();
        }
        
        this.updateRowCache();
        this.emit('table:data-updated', { count: this.segments.length });
    }

    /**
     * Добавление нового сегмента в таблицу
     */
    addSegment(segment) {
        if (!this.validationService.isValid('segment', segment)) {
            console.error('Попытка добавить невалидный сегмент в таблицу');
            return;
        }

        this.segments.unshift(segment); // Добавляем в начало
        this.filteredSegments = [...this.segments];
        
        if (this.dataTable) {
            this.dataTable.row.add(segment);
            this.dataTable.draw();
        }
        
        this.updateRowCache();
        this.emit('table:segment-added', { segment });
    }

    /**
     * Обновление существующего сегмента в таблице
     */
    updateSegment(segmentId, updatedData) {
        const index = this.segments.findIndex(s => s.id === segmentId);
        
        if (index === -1) {
            console.error('Сегмент не найден для обновления:', segmentId);
            return;
        }

        // Обновляем в данных
        this.segments[index] = { ...this.segments[index], ...updatedData };
        this.filteredSegments = [...this.segments];
        
        // Обновляем в таблице
        if (this.dataTable) {
            const row = this.dataTable.row((idx, data) => data.id === segmentId);
            if (row.length > 0) {
                row.data(this.segments[index]);
                row.draw();
            }
        }
        
        this.updateRowCache();
        this.emit('table:segment-updated', { segmentId, segment: this.segments[index] });
    }

    /**
     * Удаление сегмента из таблицы
     */
    removeSegment(segmentId) {
        const index = this.segments.findIndex(s => s.id === segmentId);
        
        if (index === -1) {
            console.error('Сегмент не найден для удаления:', segmentId);
            return;
        }

        // Удаляем из данных
        const removedSegment = this.segments.splice(index, 1)[0];
        this.filteredSegments = [...this.segments];
        
        // Удаляем из таблицы
        if (this.dataTable) {
            const row = this.dataTable.row((idx, data) => data.id === segmentId);
            if (row.length > 0) {
                row.remove();
                this.dataTable.draw();
            }
        }
        
        this.updateRowCache();
        this.emit('table:segment-removed', { segmentId, segment: removedSegment });
    }

    /**
     * Получение сегмента по ID
     */
    getSegment(segmentId) {
        return this.segments.find(s => s.id === segmentId);
    }

    /**
     * Получение выбранных сегментов
     */
    getSelectedSegments() {
        // Пока не реализован множественный выбор
        return [];
    }

    /**
     * Применение фильтра к таблице
     */
    applyFilter(filterFn) {
        this.filteredSegments = this.segments.filter(filterFn);
        
        if (this.dataTable) {
            // DataTables поддерживает кастомные фильтры через API
            $.fn.dataTable.ext.search.pop(); // Удаляем предыдущий фильтр
            $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
                return filterFn(rowData);
            });
            
            this.dataTable.draw();
        }
        
        this.emit('table:filter-applied');
    }

    /**
     * Сброс фильтра
     */
    clearFilter() {
        this.filteredSegments = [...this.segments];
        
        if (this.dataTable) {
            $.fn.dataTable.ext.search.pop();
            this.dataTable.search('').draw();
        }
        
        this.emit('table:filter-cleared');
    }

    /**
     * Поиск в таблице
     */
    search(query) {
        if (this.dataTable) {
            this.dataTable.search(query).draw();
        }
        
        this.emit('table:searched', { query });
    }

    /**
     * Обновление кэша строк
     */
    updateRowCache() {
        this.rowCache.clear();
        this.segments.forEach(segment => {
            this.rowCache.set(segment.id, segment);
        });
    }

    /**
     * Обновление статистики таблицы
     */
    updateTableStatistics() {
        const info = this.dataTable ? this.dataTable.page.info() : null;
        
        if (info) {
            this.emit('table:statistics-updated', {
                total: info.recordsTotal,
                filtered: info.recordsDisplay,
                start: info.start + 1,
                end: info.end,
                page: info.page + 1,
                pages: info.pages
            });
        }
    }

    /**
     * Экспорт данных таблицы
     */
    exportData(format = 'json') {
        const data = this.filteredSegments;
        
        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);
            
            case 'csv':
                return this.convertToCSV(data);
            
            case 'excel':
                // Требует библиотеку для Excel
                console.warn('Excel экспорт не реализован');
                return null;
                
            default:
                return data;
        }
    }

    /**
     * Конвертация в CSV формат
     */
    convertToCSV(data) {
        if (data.length === 0) return '';
        
        const headers = ['Название', 'Описание', 'Создан', 'Обновлён'];
        const csvRows = [headers.join(',')];
        
        data.forEach(segment => {
            const row = [
                `"${(segment.name || '').replace(/"/g, '""')}"`,
                `"${(segment.description || '').replace(/"/g, '""')}"`,
                segment.created_at ? new Date(segment.created_at).toLocaleString('ru-RU') : '',
                segment.updated_at ? new Date(segment.updated_at).toLocaleString('ru-RU') : ''
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }

    /**
     * Утилита для экранирования HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Добавление слушателя событий
     */
    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * Удаление слушателя событий
     */
    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Генерация события
     */
    emit(eventType, data = {}) {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Получение состояния таблицы
     */
    getState() {
        return {
            totalSegments: this.segments.length,
            filteredSegments: this.filteredSegments.length,
            currentPage: this.dataTable ? this.dataTable.page() : 0,
            pageSize: this.config.pageSize,
            searchQuery: this.dataTable ? this.dataTable.search() : '',
            isInitialized: !!this.dataTable
        };
    }

    /**
     * Уничтожение компонента
     */
    destroy() {
        // Уничтожаем DataTable
        if (this.dataTable) {
            this.dataTable.destroy();
            this.dataTable = null;
        }
        
        // Очищаем обработчики событий
        this.eventHandlers.clear();
        
        // Очищаем данные
        this.segments = [];
        this.filteredSegments = [];
        this.rowCache.clear();
        
        // Очищаем ссылки на элементы
        this.tableElement = null;
        this.tableContainer = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentTable;
} else {
    window.SegmentTable = SegmentTable;
}