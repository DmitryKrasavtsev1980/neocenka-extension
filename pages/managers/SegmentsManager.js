/**
 * Менеджер сегментов
 * Управляет созданием, редактированием и отображением сегментов недвижимости
 */

class SegmentsManager {
    constructor(dataState, eventBus, progressManager) {
        this.dataState = dataState;
        this.eventBus = eventBus;
        this.progressManager = progressManager;
        
        // Таблица сегментов
        this.segmentsTable = null;
        
        // Состояние сегментов
        this.segmentsState = {
            segments: [],
            expandedRows: new Set(),
            selectedSegment: null,
            editingSegment: null,
            modalOpen: false
        };
        
        // Справочники
        this.houseSeries = [];
        this.houseClasses = [];
        this.wallMaterials = [];
        this.ceilingMaterials = [];
        
        // Конфигурация
        this.config = {
            pageLength: 10,
            maxSegments: 50,
            defaultFilters: {
                type: ['apartment'],
                floors_from: 1,
                floors_to: 25,
                build_year_from: 1950,
                build_year_to: new Date().getFullYear()
            }
        };
        
        // Привязываем события
        this.bindEvents();
    }
    
    /**
     * Привязка событий
     */
    bindEvents() {
        if (this.eventBus) {
            this.eventBus.on(CONSTANTS.EVENTS.AREA_LOADED, async (area) => {
                await this.onAreaLoaded(area);
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.ADDRESSES_LOADED, async () => {
                await this.updateSegmentsData();
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.AREA_CHANGED, async (area) => {
                await this.onAreaChanged(area);
            });
        }
        
        // Привязка к кнопкам
        this.bindButtons();
        
        // Привязка к модальным окнам
        this.bindModalEvents();
        
        // Привязка к панели управления
        this.bindPanelEvents();
    }
    
    /**
     * Привязка к кнопкам
     */
    bindButtons() {
        // Кнопка создания сегмента
        document.getElementById('createSegmentBtn')?.addEventListener('click', () => {
            this.openCreateSegmentModal();
        });
        
        // Кнопка создания подсегмента
        document.getElementById('createSubsegmentBtn')?.addEventListener('click', () => {
            this.openCreateSubsegmentModal();
        });
        
        // Кнопка обновления сегментов
        document.getElementById('refreshSegmentsBtn')?.addEventListener('click', () => {
            this.refreshSegments();
        });
        
        // Кнопка экспорта сегментов
        document.getElementById('exportSegmentsBtn')?.addEventListener('click', () => {
            this.exportSegments();
        });
        
        // Кнопка импорта сегментов
        document.getElementById('importSegmentsFile')?.addEventListener('change', (event) => {
            this.importSegments(event);
        });
    }
    
    /**
     * Привязка к модальным окнам
     */
    bindModalEvents() {
        // Модальное окно сегмента
        document.getElementById('segmentModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'segmentModal') {
                this.closeSegmentModal();
            }
        });
        
        // Кнопка закрытия модального окна
        document.getElementById('closeSegmentModal')?.addEventListener('click', () => {
            this.closeSegmentModal();
        });
        
        // Кнопка отмены в модальном окне
        document.getElementById('cancelSegmentBtn')?.addEventListener('click', () => {
            this.closeSegmentModal();
        });
        
        // Кнопка сохранения сегмента
        document.getElementById('saveSegmentBtn')?.addEventListener('click', () => {
            this.saveSegment();
        });
        
        // Форма сегмента
        document.getElementById('segmentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSegment();
        });
    }
    
    /**
     * Привязка к панели управления
     */
    bindPanelEvents() {
        // Сворачивание/разворачивание панели
        document.getElementById('segmentsPanelHeader')?.addEventListener('click', () => {
            this.toggleSegmentsPanel();
        });
        
        // Делегированные обработчики для таблицы
        document.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (!button) return;
            
            const action = button.getAttribute('data-action');
            const segmentId = button.getAttribute('data-segment-id');
            
            if (!segmentId) return;
            
            switch (action) {
                case 'edit-segment':
                    this.editSegment(segmentId);
                    break;
                case 'delete-segment':
                    this.deleteSegment(segmentId);
                    break;
                case 'create-subsegment':
                    this.createSubsegment(segmentId);
                    break;
                case 'view-segment':
                    this.viewSegment(segmentId);
                    break;
                case 'toggle-segment':
                    this.toggleSegmentExpansion(segmentId);
                    break;
            }
        });
    }
    
    /**
     * Обработка загрузки области
     */
    async onAreaLoaded(area) {
        try {
            await this.loadReferenceData();
            await this.loadSegments();
            await this.initializeSegmentsTable();
            await this.updateSegmentsData();
            
        } catch (error) {
            console.error('Error on area loaded:', error);
        }
    }
    
    /**
     * Обработка изменения области
     */
    async onAreaChanged(area) {
        try {
            await this.loadSegments();
            await this.updateSegmentsData();
            
        } catch (error) {
            console.error('Error on area changed:', error);
        }
    }
    
    /**
     * Загрузка справочных данных
     */
    async loadReferenceData() {
        try {
            this.houseSeries = await window.db.getAll('house_series');
            this.houseClasses = await window.db.getAll('house_classes');
            this.wallMaterials = await window.db.getAll('wall_materials');
            this.ceilingMaterials = await window.db.getAll('ceiling_materials');
            
            await Helpers.debugLog('✅ Справочные данные для сегментов загружены');
            
        } catch (error) {
            console.error('Error loading reference data:', error);
        }
    }
    
    /**
     * Загрузка сегментов
     */
    async loadSegments() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                this.segmentsState.segments = [];
                return;
            }
            
            const allSegments = await window.db.getAll('segments');
            this.segmentsState.segments = allSegments.filter(segment => 
                segment.map_area_id === currentArea.id
            );
            
            // Обновляем состояние
            this.dataState.setState('segments', this.segmentsState.segments);
            
            await Helpers.debugLog(`📊 Загружено ${this.segmentsState.segments.length} сегментов`);
            
        } catch (error) {
            console.error('Error loading segments:', error);
            this.segmentsState.segments = [];
        }
    }
    
    /**
     * Инициализация таблицы сегментов
     */
    async initializeSegmentsTable() {
        const tableElement = document.getElementById('segmentsTable');
        if (!tableElement) {
            await Helpers.debugLog('⚠️ Таблица сегментов не найдена');
            return;
        }
        
        // Уничтожаем существующую таблицу
        if (this.segmentsTable) {
            this.segmentsTable.destroy();
        }
        
        this.segmentsTable = new DataTable(tableElement, {
            pageLength: this.config.pageLength,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'Все']],
            language: CONSTANTS.DATATABLES_LANGUAGE,
            order: [[1, 'asc']], // Сортировка по названию
            columnDefs: [
                { 
                    targets: 0, 
                    orderable: false,
                    className: 'details-control',
                    width: '30px',
                    render: (data, type, row) => this.renderExpandColumn(data, type, row)
                },
                { 
                    targets: 1, 
                    render: (data, type, row) => this.renderNameColumn(data, type, row)
                },
                { 
                    targets: 2, 
                    render: (data, type, row) => this.renderAddressesColumn(data, type, row)
                },
                { 
                    targets: 3, 
                    render: (data, type, row) => this.renderSubsegmentsColumn(data, type, row)
                },
                { 
                    targets: 4, 
                    render: (data, type, row) => this.renderFiltersColumn(data, type, row)
                },
                { 
                    targets: 5, 
                    orderable: false,
                    render: (data, type, row) => this.renderActionsColumn(data, type, row)
                }
            ],
            initComplete: () => {
                this.restoreSegmentsPanelState();
            }
        });
        
        // Обработка разворачивания строк
        this.segmentsTable.on('click', 'td.details-control', (e) => {
            const tr = e.target.closest('tr');
            const row = this.segmentsTable.row(tr);
            
            if (row.child.isShown()) {
                row.child.hide();
                tr.classList.remove('shown');
            } else {
                row.child(this.createSegmentChildContent(row.data())).show();
                tr.classList.add('shown');
            }
        });
        
        await Helpers.debugLog('✅ Таблица сегментов инициализирована');
    }
    
    /**
     * Обновление данных сегментов
     */
    async updateSegmentsData() {
        if (!this.segmentsTable) return;
        
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) return;
            
            const addresses = this.dataState.getState('addresses') || [];
            
            // Обновляем статистику для каждого сегмента
            const segmentsWithStats = await Promise.all(
                this.segmentsState.segments.map(async (segment) => {
                    const stats = await this.calculateSegmentStats(segment, addresses);
                    return {
                        ...segment,
                        stats
                    };
                })
            );
            
            // Обновляем таблицу
            this.segmentsTable.clear();
            this.segmentsTable.rows.add(segmentsWithStats);
            this.segmentsTable.draw();
            
            await Helpers.debugLog('✅ Данные сегментов обновлены');
            
        } catch (error) {
            console.error('Error updating segments data:', error);
        }
    }
    
    /**
     * Расчет статистики сегмента
     */
    async calculateSegmentStats(segment, addresses) {
        try {
            const filteredAddresses = this.filterAddressesBySegment(addresses, segment);
            
            const stats = {
                addressesCount: filteredAddresses.length,
                subsegmentsCount: segment.subsegments?.length || 0,
                averagePrice: 0,
                priceRange: { min: 0, max: 0 },
                typeDistribution: {},
                floorDistribution: {},
                yearDistribution: {}
            };
            
            if (filteredAddresses.length > 0) {
                // Распределение по типам
                filteredAddresses.forEach(address => {
                    const type = address.type || 'unknown';
                    stats.typeDistribution[type] = (stats.typeDistribution[type] || 0) + 1;
                });
                
                // Распределение по этажности
                filteredAddresses.forEach(address => {
                    if (address.floors_count) {
                        const floors = address.floors_count;
                        stats.floorDistribution[floors] = (stats.floorDistribution[floors] || 0) + 1;
                    }
                });
                
                // Распределение по годам
                filteredAddresses.forEach(address => {
                    if (address.build_year) {
                        const decade = Math.floor(address.build_year / 10) * 10;
                        stats.yearDistribution[decade] = (stats.yearDistribution[decade] || 0) + 1;
                    }
                });
                
                // Получаем данные об объявлениях для расчета цен
                const listings = await this.getListingsForAddresses(filteredAddresses);
                const prices = listings.filter(l => l.price).map(l => l.price);
                
                if (prices.length > 0) {
                    stats.averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
                    stats.priceRange.min = Math.min(...prices);
                    stats.priceRange.max = Math.max(...prices);
                }
            }
            
            return stats;
            
        } catch (error) {
            console.error('Error calculating segment stats:', error);
            return {
                addressesCount: 0,
                subsegmentsCount: 0,
                averagePrice: 0,
                priceRange: { min: 0, max: 0 },
                typeDistribution: {},
                floorDistribution: {},
                yearDistribution: {}
            };
        }
    }
    
    /**
     * Фильтрация адресов по сегменту
     */
    filterAddressesBySegment(addresses, segment) {
        if (!segment.filters) return addresses;
        
        return addresses.filter(address => {
            const filters = segment.filters;
            
            // Фильтр по типу недвижимости
            if (filters.type && filters.type.length > 0) {
                if (!filters.type.includes(address.type)) {
                    return false;
                }
            }
            
            // Фильтр по этажности
            if (filters.floors_from && address.floors_count < filters.floors_from) {
                return false;
            }
            if (filters.floors_to && address.floors_count > filters.floors_to) {
                return false;
            }
            
            // Фильтр по году постройки
            if (filters.build_year_from && address.build_year < filters.build_year_from) {
                return false;
            }
            if (filters.build_year_to && address.build_year > filters.build_year_to) {
                return false;
            }
            
            // Фильтр по серии дома
            if (filters.house_series_id && filters.house_series_id.length > 0) {
                if (!filters.house_series_id.includes(address.house_series_id)) {
                    return false;
                }
            }
            
            // Фильтр по классу дома
            if (filters.house_class_id && filters.house_class_id.length > 0) {
                if (!filters.house_class_id.includes(address.house_class_id)) {
                    return false;
                }
            }
            
            // Фильтр по материалу стен
            if (filters.wall_material_id && filters.wall_material_id.length > 0) {
                if (!filters.wall_material_id.includes(address.wall_material_id)) {
                    return false;
                }
            }
            
            // Фильтр по материалу перекрытий
            if (filters.ceiling_material_id && filters.ceiling_material_id.length > 0) {
                if (!filters.ceiling_material_id.includes(address.ceiling_material_id)) {
                    return false;
                }
            }
            
            // Фильтр по газоснабжению
            if (filters.gas_supply && filters.gas_supply.length > 0) {
                const gasSupplyStr = address.gas_supply ? 'true' : 'false';
                if (!filters.gas_supply.includes(gasSupplyStr)) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    /**
     * Получение объявлений для адресов
     */
    async getListingsForAddresses(addresses) {
        try {
            const addressIds = addresses.map(addr => addr.id);
            const allListings = await window.db.getAll('listings');
            
            return allListings.filter(listing => 
                addressIds.includes(listing.address_id)
            );
            
        } catch (error) {
            console.error('Error getting listings for addresses:', error);
            return [];
        }
    }
    
    /**
     * Открытие модального окна создания сегмента
     */
    openCreateSegmentModal() {
        this.segmentsState.editingSegment = null;
        this.segmentsState.modalOpen = true;
        
        // Очищаем форму
        this.clearSegmentForm();
        
        // Заполняем справочники
        this.populateSegmentFormSelects();
        
        // Показываем модальное окно
        const modal = document.getElementById('segmentModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Устанавливаем заголовок
            const title = document.getElementById('segmentModalTitle');
            if (title) {
                title.textContent = 'Создать сегмент';
            }
        }
    }
    
    /**
     * Открытие модального окна создания подсегмента
     */
    openCreateSubsegmentModal() {
        // Подсегмент - это обычный сегмент с родительским ID
        this.openCreateSegmentModal();
        
        // Меняем заголовок
        const title = document.getElementById('segmentModalTitle');
        if (title) {
            title.textContent = 'Создать подсегмент';
        }
    }
    
    /**
     * Редактирование сегмента
     */
    editSegment(segmentId) {
        const segment = this.segmentsState.segments.find(s => s.id === segmentId);
        if (!segment) return;
        
        this.segmentsState.editingSegment = segment;
        this.segmentsState.modalOpen = true;
        
        // Заполняем форму данными сегмента
        this.populateSegmentForm(segment);
        
        // Заполняем справочники
        this.populateSegmentFormSelects();
        
        // Показываем модальное окно
        const modal = document.getElementById('segmentModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Устанавливаем заголовок
            const title = document.getElementById('segmentModalTitle');
            if (title) {
                title.textContent = 'Редактировать сегмент';
            }
        }
    }
    
    /**
     * Удаление сегмента
     */
    async deleteSegment(segmentId) {
        const segment = this.segmentsState.segments.find(s => s.id === segmentId);
        if (!segment) return;
        
        const confirmed = confirm(`Вы уверены, что хотите удалить сегмент "${segment.name}"?`);
        if (!confirmed) return;
        
        try {
            await window.db.delete('segments', segmentId);
            
            // Обновляем данные
            await this.loadSegments();
            await this.updateSegmentsData();
            
            // Уведомляем об удалении
            this.eventBus.emit(CONSTANTS.EVENTS.SEGMENT_DELETED, {
                segmentId,
                segment,
                timestamp: new Date()
            });
            
            this.progressManager.showSuccess('Сегмент удален');
            
        } catch (error) {
            console.error('Error deleting segment:', error);
            this.progressManager.showError('Ошибка удаления сегмента');
        }
    }
    
    /**
     * Создание подсегмента
     */
    createSubsegment(parentSegmentId) {
        const parentSegment = this.segmentsState.segments.find(s => s.id === parentSegmentId);
        if (!parentSegment) return;
        
        this.segmentsState.editingSegment = null;
        this.segmentsState.modalOpen = true;
        
        // Очищаем форму
        this.clearSegmentForm();
        
        // Заполняем справочники
        this.populateSegmentFormSelects();
        
        // Устанавливаем родительский сегмент
        const parentIdField = document.getElementById('segmentParentId');
        if (parentIdField) {
            parentIdField.value = parentSegmentId;
        }
        
        // Показываем модальное окно
        const modal = document.getElementById('segmentModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Устанавливаем заголовок
            const title = document.getElementById('segmentModalTitle');
            if (title) {
                title.textContent = `Создать подсегмент для "${parentSegment.name}"`;
            }
        }
    }
    
    /**
     * Просмотр сегмента
     */
    viewSegment(segmentId) {
        const segment = this.segmentsState.segments.find(s => s.id === segmentId);
        if (!segment) return;
        
        // Можно открыть отдельное окно просмотра или показать детали
        this.segmentsState.selectedSegment = segment;
        
        // Уведомляем о выборе сегмента
        this.eventBus.emit(CONSTANTS.EVENTS.SEGMENT_SELECTED, {
            segment,
            timestamp: new Date()
        });
        
        // Можно добавить визуализацию на карте
        this.eventBus.emit(CONSTANTS.EVENTS.MAP_FILTER_CHANGED, {
            filterType: 'segment',
            segmentId,
            timestamp: new Date()
        });
    }
    
    /**
     * Переключение разворачивания сегмента
     */
    toggleSegmentExpansion(segmentId) {
        if (this.segmentsState.expandedRows.has(segmentId)) {
            this.segmentsState.expandedRows.delete(segmentId);
        } else {
            this.segmentsState.expandedRows.add(segmentId);
        }
    }
    
    /**
     * Закрытие модального окна сегмента
     */
    closeSegmentModal() {
        this.segmentsState.modalOpen = false;
        this.segmentsState.editingSegment = null;
        
        const modal = document.getElementById('segmentModal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // Очищаем форму
        this.clearSegmentForm();
    }
    
    /**
     * Сохранение сегмента
     */
    async saveSegment() {
        try {
            const formData = this.getSegmentFormData();
            
            // Валидация
            const validation = Validators.validateSegment(formData);
            if (!validation.isValid) {
                this.progressManager.showError('Ошибка валидации: ' + validation.errors.join(', '));
                return;
            }
            
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                this.progressManager.showError('Область не выбрана');
                return;
            }
            
            let segment;
            
            if (this.segmentsState.editingSegment) {
                // Обновляем существующий сегмент
                segment = {
                    ...this.segmentsState.editingSegment,
                    ...formData,
                    updated_at: new Date()
                };
                
                await window.db.update('segments', segment);
                
                // Уведомляем об обновлении
                this.eventBus.emit(CONSTANTS.EVENTS.SEGMENT_UPDATED, {
                    segment,
                    timestamp: new Date()
                });
                
            } else {
                // Создаем новый сегмент
                segment = {
                    id: 'seg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    map_area_id: currentArea.id,
                    ...formData,
                    created_at: new Date(),
                    updated_at: new Date()
                };
                
                await window.db.add('segments', segment);
                
                // Уведомляем о создании
                this.eventBus.emit(CONSTANTS.EVENTS.SEGMENT_CREATED, {
                    segment,
                    timestamp: new Date()
                });
            }
            
            // Обновляем данные
            await this.loadSegments();
            await this.updateSegmentsData();
            
            // Закрываем модальное окно
            this.closeSegmentModal();
            
            this.progressManager.showSuccess(
                this.segmentsState.editingSegment ? 'Сегмент обновлен' : 'Сегмент создан'
            );
            
        } catch (error) {
            console.error('Error saving segment:', error);
            this.progressManager.showError('Ошибка сохранения сегмента');
        }
    }
    
    /**
     * Получение данных из формы сегмента
     */
    getSegmentFormData() {
        const form = document.getElementById('segmentForm');
        if (!form) return {};
        
        const formData = new FormData(form);
        const data = {};
        
        // Обычные поля
        data.name = formData.get('name')?.trim() || '';
        data.description = formData.get('description')?.trim() || '';
        data.parent_id = formData.get('parent_id') || null;
        
        // Фильтры
        data.filters = {};
        
        // Типы недвижимости (множественный выбор)
        const types = formData.getAll('type');
        if (types.length > 0) {
            data.filters.type = types;
        }
        
        // Этажность
        const floorsFrom = formData.get('floors_from');
        const floorsTo = formData.get('floors_to');
        if (floorsFrom) data.filters.floors_from = parseInt(floorsFrom);
        if (floorsTo) data.filters.floors_to = parseInt(floorsTo);
        
        // Год постройки
        const yearFrom = formData.get('build_year_from');
        const yearTo = formData.get('build_year_to');
        if (yearFrom) data.filters.build_year_from = parseInt(yearFrom);
        if (yearTo) data.filters.build_year_to = parseInt(yearTo);
        
        // Серии домов (множественный выбор)
        const houseSeries = formData.getAll('house_series_id');
        if (houseSeries.length > 0) {
            data.filters.house_series_id = houseSeries;
        }
        
        // Классы домов (множественный выбор)
        const houseClasses = formData.getAll('house_class_id');
        if (houseClasses.length > 0) {
            data.filters.house_class_id = houseClasses;
        }
        
        // Материалы стен (множественный выбор)
        const wallMaterials = formData.getAll('wall_material_id');
        if (wallMaterials.length > 0) {
            data.filters.wall_material_id = wallMaterials;
        }
        
        // Материалы перекрытий (множественный выбор)
        const ceilingMaterials = formData.getAll('ceiling_material_id');
        if (ceilingMaterials.length > 0) {
            data.filters.ceiling_material_id = ceilingMaterials;
        }
        
        // Газоснабжение (множественный выбор)
        const gasSupply = formData.getAll('gas_supply');
        if (gasSupply.length > 0) {
            data.filters.gas_supply = gasSupply;
        }
        
        return data;
    }
    
    /**
     * Заполнение формы сегмента
     */
    populateSegmentForm(segment) {
        const form = document.getElementById('segmentForm');
        if (!form) return;
        
        // Основные поля
        form.querySelector('[name="name"]').value = segment.name || '';
        form.querySelector('[name="description"]').value = segment.description || '';
        form.querySelector('[name="parent_id"]').value = segment.parent_id || '';
        
        if (segment.filters) {
            // Типы недвижимости
            if (segment.filters.type) {
                segment.filters.type.forEach(type => {
                    const checkbox = form.querySelector(`[name="type"][value="${type}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            // Этажность
            if (segment.filters.floors_from) {
                form.querySelector('[name="floors_from"]').value = segment.filters.floors_from;
            }
            if (segment.filters.floors_to) {
                form.querySelector('[name="floors_to"]').value = segment.filters.floors_to;
            }
            
            // Год постройки
            if (segment.filters.build_year_from) {
                form.querySelector('[name="build_year_from"]').value = segment.filters.build_year_from;
            }
            if (segment.filters.build_year_to) {
                form.querySelector('[name="build_year_to"]').value = segment.filters.build_year_to;
            }
            
            // Серии домов
            if (segment.filters.house_series_id) {
                segment.filters.house_series_id.forEach(seriesId => {
                    const checkbox = form.querySelector(`[name="house_series_id"][value="${seriesId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            // Классы домов
            if (segment.filters.house_class_id) {
                segment.filters.house_class_id.forEach(classId => {
                    const checkbox = form.querySelector(`[name="house_class_id"][value="${classId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            // Материалы стен
            if (segment.filters.wall_material_id) {
                segment.filters.wall_material_id.forEach(materialId => {
                    const checkbox = form.querySelector(`[name="wall_material_id"][value="${materialId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            // Материалы перекрытий
            if (segment.filters.ceiling_material_id) {
                segment.filters.ceiling_material_id.forEach(materialId => {
                    const checkbox = form.querySelector(`[name="ceiling_material_id"][value="${materialId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            // Газоснабжение
            if (segment.filters.gas_supply) {
                segment.filters.gas_supply.forEach(gasValue => {
                    const checkbox = form.querySelector(`[name="gas_supply"][value="${gasValue}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
        }
    }
    
    /**
     * Очистка формы сегмента
     */
    clearSegmentForm() {
        const form = document.getElementById('segmentForm');
        if (!form) return;
        
        form.reset();
        
        // Очищаем все чекбоксы
        const checkboxes = form.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    /**
     * Заполнение селектов в форме сегмента
     */
    populateSegmentFormSelects() {
        // Серии домов
        const houseSeriesContainer = document.getElementById('houseSeriesContainer');
        if (houseSeriesContainer) {
            houseSeriesContainer.innerHTML = this.houseSeries.map(series => `
                <label class="inline-flex items-center">
                    <input type="checkbox" name="house_series_id" value="${series.id}" class="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
                    <span class="ml-2 text-sm text-gray-700">${series.name}</span>
                </label>
            `).join('');
        }
        
        // Классы домов
        const houseClassesContainer = document.getElementById('houseClassesContainer');
        if (houseClassesContainer) {
            houseClassesContainer.innerHTML = this.houseClasses.map(houseClass => `
                <label class="inline-flex items-center">
                    <input type="checkbox" name="house_class_id" value="${houseClass.id}" class="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
                    <span class="ml-2 text-sm text-gray-700">${houseClass.name}</span>
                </label>
            `).join('');
        }
        
        // Материалы стен
        const wallMaterialsContainer = document.getElementById('wallMaterialsContainer');
        if (wallMaterialsContainer) {
            wallMaterialsContainer.innerHTML = this.wallMaterials.map(material => `
                <label class="inline-flex items-center">
                    <input type="checkbox" name="wall_material_id" value="${material.id}" class="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
                    <span class="ml-2 text-sm text-gray-700">${material.name}</span>
                </label>
            `).join('');
        }
        
        // Материалы перекрытий
        const ceilingMaterialsContainer = document.getElementById('ceilingMaterialsContainer');
        if (ceilingMaterialsContainer) {
            ceilingMaterialsContainer.innerHTML = this.ceilingMaterials.map(material => `
                <label class="inline-flex items-center">
                    <input type="checkbox" name="ceiling_material_id" value="${material.id}" class="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
                    <span class="ml-2 text-sm text-gray-700">${material.name}</span>
                </label>
            `).join('');
        }
    }
    
    /**
     * Обновление сегментов
     */
    async refreshSegments() {
        try {
            await this.loadSegments();
            await this.updateSegmentsData();
            this.progressManager.showSuccess('Сегменты обновлены');
            
        } catch (error) {
            console.error('Error refreshing segments:', error);
            this.progressManager.showError('Ошибка обновления сегментов');
        }
    }
    
    /**
     * Экспорт сегментов
     */
    async exportSegments() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                this.progressManager.showError('Область не выбрана');
                return;
            }
            
            const exportData = {
                area: {
                    id: currentArea.id,
                    name: currentArea.name
                },
                segments: this.segmentsState.segments,
                reference_data: {
                    house_series: this.houseSeries,
                    house_classes: this.houseClasses,
                    wall_materials: this.wallMaterials,
                    ceiling_materials: this.ceilingMaterials
                },
                exported_at: new Date().toISOString(),
                version: '1.0'
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `segments_${currentArea.name}_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            
            this.progressManager.showSuccess('Сегменты экспортированы');
            
        } catch (error) {
            console.error('Error exporting segments:', error);
            this.progressManager.showError('Ошибка экспорта сегментов');
        }
    }
    
    /**
     * Импорт сегментов
     */
    async importSegments(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importData = JSON.parse(text);
            
            if (!importData.segments || !Array.isArray(importData.segments)) {
                throw new Error('Некорректный формат файла');
            }
            
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                this.progressManager.showError('Область не выбрана');
                return;
            }
            
            // Валидация и импорт сегментов
            let importedCount = 0;
            
            for (const segment of importData.segments) {
                const validation = Validators.validateSegment(segment);
                if (validation.isValid) {
                    const newSegment = {
                        ...segment,
                        id: 'seg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        map_area_id: currentArea.id,
                        created_at: new Date(),
                        updated_at: new Date()
                    };
                    
                    await window.db.add('segments', newSegment);
                    importedCount++;
                }
            }
            
            // Импорт справочных данных (если есть)
            if (importData.reference_data) {
                await this.importReferenceData(importData.reference_data);
            }
            
            // Обновляем данные
            await this.loadSegments();
            await this.updateSegmentsData();
            
            this.progressManager.showSuccess(`Импортировано ${importedCount} сегментов`);
            
        } catch (error) {
            console.error('Error importing segments:', error);
            this.progressManager.showError('Ошибка импорта сегментов: ' + error.message);
        }
        
        // Очищаем input
        event.target.value = '';
    }
    
    /**
     * Импорт справочных данных
     */
    async importReferenceData(referenceData) {
        try {
            const tables = ['house_series', 'house_classes', 'wall_materials', 'ceiling_materials'];
            
            for (const table of tables) {
                if (referenceData[table] && Array.isArray(referenceData[table])) {
                    for (const item of referenceData[table]) {
                        // Проверяем, существует ли уже такой элемент
                        const existing = await window.db.get(table, item.id);
                        if (!existing) {
                            await window.db.add(table, item);
                        }
                    }
                }
            }
            
            // Обновляем справочные данные
            await this.loadReferenceData();
            
        } catch (error) {
            console.error('Error importing reference data:', error);
        }
    }
    
    /**
     * Переключение панели сегментов
     */
    toggleSegmentsPanel() {
        const panel = document.getElementById('segmentsPanelContent');
        const chevron = document.getElementById('segmentsPanelChevron');
        
        if (!panel || !chevron) return;
        
        const isVisible = panel.style.display !== 'none';
        
        if (isVisible) {
            panel.style.display = 'none';
            chevron.style.transform = 'rotate(0deg)';
        } else {
            panel.style.display = 'block';
            chevron.style.transform = 'rotate(90deg)';
        }
        
        // Сохраняем состояние
        const currentArea = this.dataState.getState('currentArea');
        if (currentArea) {
            localStorage.setItem(`segmentsPanel_${currentArea.id}`, !isVisible);
        }
    }
    
    /**
     * Восстановление состояния панели сегментов
     */
    restoreSegmentsPanelState() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) return;
        
        const savedState = localStorage.getItem(`segmentsPanel_${currentArea.id}`);
        const isExpanded = savedState === 'true';
        
        const panel = document.getElementById('segmentsPanelContent');
        const chevron = document.getElementById('segmentsPanelChevron');
        
        if (panel && chevron) {
            if (isExpanded) {
                panel.style.display = 'block';
                chevron.style.transform = 'rotate(90deg)';
            } else {
                panel.style.display = 'none';
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    }
    
    /**
     * Рендеринг колонки разворачивания
     */
    renderExpandColumn(data, type, row) {
        const hasSubsegments = row.subsegments && row.subsegments.length > 0;
        const isExpanded = this.segmentsState.expandedRows.has(row.id);
        
        if (hasSubsegments) {
            return `<span class="cursor-pointer" data-action="toggle-segment" data-segment-id="${row.id}">
                ${isExpanded ? '▼' : '▶'}
            </span>`;
        }
        
        return '<span class="text-gray-400">—</span>';
    }
    
    /**
     * Рендеринг колонки названия
     */
    renderNameColumn(data, type, row) {
        const icon = row.parent_id ? '└─' : '📊';
        const nameClass = row.parent_id ? 'text-gray-700 text-sm' : 'font-medium text-gray-900';
        
        return `<div class="flex items-center">
            <span class="mr-2">${icon}</span>
            <span class="${nameClass}">${row.name}</span>
        </div>`;
    }
    
    /**
     * Рендеринг колонки адресов
     */
    renderAddressesColumn(data, type, row) {
        const count = row.stats?.addressesCount || 0;
        return `<span class="text-gray-900">${count}</span>`;
    }
    
    /**
     * Рендеринг колонки подсегментов
     */
    renderSubsegmentsColumn(data, type, row) {
        const count = row.stats?.subsegmentsCount || 0;
        return `<span class="text-gray-700">${count}</span>`;
    }
    
    /**
     * Рендеринг колонки фильтров
     */
    renderFiltersColumn(data, type, row) {
        const filters = row.filters || {};
        const filterCount = Object.keys(filters).filter(key => filters[key] && filters[key].length > 0).length;
        
        return `<span class="text-sm text-gray-600">${filterCount} фильтров</span>`;
    }
    
    /**
     * Рендеринг колонки действий
     */
    renderActionsColumn(data, type, row) {
        const actions = [];
        
        actions.push(`<button class="text-blue-600 hover:text-blue-800 text-xs" data-action="view-segment" data-segment-id="${row.id}">Просмотр</button>`);
        actions.push(`<button class="text-green-600 hover:text-green-800 text-xs" data-action="edit-segment" data-segment-id="${row.id}">Изменить</button>`);
        actions.push(`<button class="text-purple-600 hover:text-purple-800 text-xs" data-action="create-subsegment" data-segment-id="${row.id}">Подсегмент</button>`);
        actions.push(`<button class="text-red-600 hover:text-red-800 text-xs" data-action="delete-segment" data-segment-id="${row.id}">Удалить</button>`);
        
        return actions.join(' | ');
    }
    
    /**
     * Создание содержимого дочерней строки сегмента
     */
    createSegmentChildContent(segment) {
        const stats = segment.stats || {};
        
        return `
            <div class="p-4 bg-gray-50 rounded">
                <div class="grid grid-cols-3 gap-6">
                    <div>
                        <h6 class="font-medium text-gray-900 mb-2">Статистика</h6>
                        <div class="text-sm space-y-1">
                            <div>Адресов: ${stats.addressesCount || 0}</div>
                            <div>Подсегментов: ${stats.subsegmentsCount || 0}</div>
                            <div>Средняя цена: ${stats.averagePrice ? Helpers.formatPrice(stats.averagePrice) : '—'}</div>
                            <div>Диапазон цен: ${stats.priceRange && stats.priceRange.min ? 
                                `${Helpers.formatPrice(stats.priceRange.min)} - ${Helpers.formatPrice(stats.priceRange.max)}` : '—'}</div>
                        </div>
                    </div>
                    <div>
                        <h6 class="font-medium text-gray-900 mb-2">Распределение по типам</h6>
                        <div class="text-sm space-y-1">
                            ${Object.entries(stats.typeDistribution || {}).map(([type, count]) => `
                                <div>${CONSTANTS.PROPERTY_TYPE_NAMES[type] || type}: ${count}</div>
                            `).join('')}
                        </div>
                    </div>
                    <div>
                        <h6 class="font-medium text-gray-900 mb-2">Фильтры</h6>
                        <div class="text-sm space-y-1">
                            ${this.renderSegmentFiltersInfo(segment.filters || {})}
                        </div>
                    </div>
                </div>
                ${segment.description ? `<div class="mt-4">
                    <h6 class="font-medium text-gray-900 mb-2">Описание</h6>
                    <p class="text-sm text-gray-600">${segment.description}</p>
                </div>` : ''}
            </div>
        `;
    }
    
    /**
     * Рендеринг информации о фильтрах сегмента
     */
    renderSegmentFiltersInfo(filters) {
        const info = [];
        
        if (filters.type && filters.type.length > 0) {
            info.push(`Типы: ${filters.type.map(t => CONSTANTS.PROPERTY_TYPE_NAMES[t] || t).join(', ')}`);
        }
        
        if (filters.floors_from || filters.floors_to) {
            const from = filters.floors_from || '—';
            const to = filters.floors_to || '—';
            info.push(`Этажность: ${from} - ${to}`);
        }
        
        if (filters.build_year_from || filters.build_year_to) {
            const from = filters.build_year_from || '—';
            const to = filters.build_year_to || '—';
            info.push(`Год постройки: ${from} - ${to}`);
        }
        
        if (filters.house_series_id && filters.house_series_id.length > 0) {
            info.push(`Серий домов: ${filters.house_series_id.length}`);
        }
        
        if (filters.house_class_id && filters.house_class_id.length > 0) {
            info.push(`Классов домов: ${filters.house_class_id.length}`);
        }
        
        if (filters.wall_material_id && filters.wall_material_id.length > 0) {
            info.push(`Материалов стен: ${filters.wall_material_id.length}`);
        }
        
        if (filters.ceiling_material_id && filters.ceiling_material_id.length > 0) {
            info.push(`Материалов перекрытий: ${filters.ceiling_material_id.length}`);
        }
        
        if (filters.gas_supply && filters.gas_supply.length > 0) {
            info.push(`Газоснабжение: ${filters.gas_supply.join(', ')}`);
        }
        
        return info.length > 0 ? info.map(i => `<div>${i}</div>`).join('') : '<div class="text-gray-500">Фильтры не установлены</div>';
    }
    
    /**
     * Получение состояния сегментов
     */
    getSegmentsState() {
        return {
            segments: this.segmentsState.segments,
            selectedSegment: this.segmentsState.selectedSegment,
            expandedRows: Array.from(this.segmentsState.expandedRows),
            modalOpen: this.segmentsState.modalOpen
        };
    }
    
    /**
     * Получение сегмента по ID
     */
    getSegmentById(segmentId) {
        return this.segmentsState.segments.find(s => s.id === segmentId);
    }
    
    /**
     * Получение подсегментов для сегмента
     */
    getSubsegments(parentId) {
        return this.segmentsState.segments.filter(s => s.parent_id === parentId);
    }
    
    /**
     * Уничтожение менеджера сегментов
     */
    destroy() {
        if (this.segmentsTable) {
            this.segmentsTable.destroy();
            this.segmentsTable = null;
        }
        
        if (this.eventBus) {
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.ADDRESSES_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_CHANGED);
        }
        
        // Очистка обработчиков
        document.getElementById('createSegmentBtn')?.removeEventListener('click', this.openCreateSegmentModal);
        document.getElementById('createSubsegmentBtn')?.removeEventListener('click', this.openCreateSubsegmentModal);
        document.getElementById('refreshSegmentsBtn')?.removeEventListener('click', this.refreshSegments);
        document.getElementById('exportSegmentsBtn')?.removeEventListener('click', this.exportSegments);
        document.getElementById('importSegmentsFile')?.removeEventListener('change', this.importSegments);
        
        document.getElementById('closeSegmentModal')?.removeEventListener('click', this.closeSegmentModal);
        document.getElementById('cancelSegmentBtn')?.removeEventListener('click', this.closeSegmentModal);
        document.getElementById('saveSegmentBtn')?.removeEventListener('click', this.saveSegment);
        
        document.getElementById('segmentsPanelHeader')?.removeEventListener('click', this.toggleSegmentsPanel);
        
        // Очистка состояния
        this.segmentsState.expandedRows.clear();
        this.segmentsState.segments = [];
        this.segmentsState.selectedSegment = null;
        this.segmentsState.editingSegment = null;
        this.segmentsState.modalOpen = false;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentsManager;
} else {
    window.SegmentsManager = SegmentsManager;
}