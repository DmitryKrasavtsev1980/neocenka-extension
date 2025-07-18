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
        
        // Привязка к панели управления (только кнопки таблицы)
        this.bindPanelEvents();
    }
    
    /**
     * Инициализация таблицы сегментов
     */
    initializeTable() {
        const tableElement = document.getElementById('segmentsTable');
        if (!tableElement) {
            console.warn('⚠️ Таблица сегментов не найдена');
            return;
        }
        
        if (this.segmentsTable) {
            this.segmentsTable.destroy();
        }
        
        try {
            this.segmentsTable = $('#segmentsTable').DataTable({
                responsive: true,
                pageLength: 25,
                lengthChange: false,
                searching: false,
                ordering: true,
                info: true,
                autoWidth: false,
                language: {
                    "processing": "Подождите...",
                    "search": "Поиск:",
                    "lengthMenu": "Показать _MENU_ записей",
                    "info": "Записи с _START_ до _END_ из _TOTAL_ записей",
                    "infoEmpty": "Записи с 0 до 0 из 0 записей",
                    "infoFiltered": "(отфильтровано из _MAX_ записей)",
                    "loadingRecords": "Загрузка записей...",
                    "zeroRecords": "Записи отсутствуют.",
                    "emptyTable": "В таблице отсутствуют данные",
                    "paginate": {
                        "first": "Первая",
                        "previous": "Предыдущая",
                        "next": "Следующая",
                        "last": "Последняя"
                    }
                },
                columnDefs: [
                    {
                        targets: 0,
                        orderable: false,
                        className: 'details-control text-center',
                        width: '30px',
                        render: function(data, type, row) {
                            return '<i class="fas fa-plus-circle text-gray-400 hover:text-blue-600 cursor-pointer"></i>';
                        }
                    },
                    {
                        targets: 1,
                        render: function(data, type, row) {
                            return `<span class="font-medium text-gray-900">${data || 'Без названия'}</span>`;
                        }
                    },
                    {
                        targets: 2,
                        className: 'text-center',
                        render: function(data, type, row) {
                            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${data || 0}</span>`;
                        }
                    },
                    {
                        targets: 3,
                        className: 'text-center',
                        render: function(data, type, row) {
                            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">${data || 0}</span>`;
                        }
                    },
                    {
                        targets: 4,
                        orderable: false,
                        className: 'text-right',
                        width: '120px',
                        render: function(data, type, row) {
                            return `
                                <div class="flex justify-end space-x-2">
                                    <button type="button" class="edit-segment-btn inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200" data-segment-id="${row.id}">
                                        Изменить
                                    </button>
                                    <button type="button" class="delete-segment-btn inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200" data-segment-id="${row.id}">
                                        Удалить
                                    </button>
                                </div>
                            `;
                        }
                    }
                ],
                drawCallback: () => {
                    // Проверяем наличие данных
                    const info = this.segmentsTable.page.info();
                    if (info.recordsTotal === 0) {
                        $('#segmentsTableEmpty').removeClass('hidden');
                        $('#segmentsTable_wrapper').addClass('hidden');
                    } else {
                        $('#segmentsTableEmpty').addClass('hidden');
                        $('#segmentsTable_wrapper').removeClass('hidden');
                    }
                }
            });
            
            console.log('✅ Таблица сегментов инициализирована');
        } catch (error) {
            console.error('❌ Ошибка инициализации таблицы сегментов:', error);
        }
    }

    /**
     * Привязка к кнопкам
     */
    bindButtons() {
        // Кнопка создания сегмента
        const createBtn = document.getElementById('createSegmentBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                console.log('🔵 SegmentsManager: Клик по кнопке создания сегмента');
                this.openCreateSegmentModal();
            });
            console.log('✅ SegmentsManager: Кнопка создания сегмента привязана');
        } else {
            console.warn('⚠️ SegmentsManager: Кнопка #createSegmentBtn не найдена');
        }
        
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
        document.getElementById('closeSegmentModalBtn')?.addEventListener('click', () => {
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
        // Управление панелью перенесено в UIManager
        // Здесь только обработчики кнопок таблицы
        
        // Делегированные обработчики для таблицы
        document.addEventListener('click', (e) => {
            // Обработка кнопок с data-action
            const actionButton = e.target.closest('[data-action]');
            if (actionButton) {
                const action = actionButton.getAttribute('data-action');
                const segmentId = actionButton.getAttribute('data-segment-id');
                
                if (segmentId) {
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
                }
                return;
            }
            
            // Обработка кнопок с классами (для DataTables)
            const editBtn = e.target.closest('.edit-segment-btn');
            if (editBtn) {
                const segmentId = editBtn.getAttribute('data-segment-id');
                if (segmentId) {
                    this.editSegment(segmentId);
                }
                return;
            }
            
            const deleteBtn = e.target.closest('.delete-segment-btn');
            if (deleteBtn) {
                const segmentId = deleteBtn.getAttribute('data-segment-id');
                if (segmentId) {
                    this.deleteSegment(segmentId);
                }
                return;
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
            console.log('🔄 Загружаем справочные данные из базы данных...');
            
            // Загружаем данные из базы данных
            this.houseSeries = await window.db.getAll('house_series') || [];
            this.houseClasses = await window.db.getAll('house_classes') || [];
            this.wallMaterials = await window.db.getAll('wall_materials') || [];
            this.ceilingMaterials = await window.db.getAll('ceiling_materials') || [];
            
            console.log('📊 Загружено справочных данных:');
            console.log('- Серии домов:', this.houseSeries.length, this.houseSeries);
            console.log('- Классы домов:', this.houseClasses.length, this.houseClasses);
            console.log('- Материалы стен:', this.wallMaterials.length, this.wallMaterials);
            console.log('- Материалы перекрытий:', this.ceilingMaterials.length, this.ceilingMaterials);
            
            console.log('✅ Справочные данные для сегментов загружены');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки справочных данных:', error);
            
            // Создаем пустые массивы при ошибке
            this.houseSeries = [];
            this.houseClasses = [];
            this.wallMaterials = [];
            this.ceilingMaterials = [];
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
            language: {
                "processing": "Подождите...",
                "search": "Поиск:",
                "lengthMenu": "Показать _MENU_ записей",
                "info": "Записи с _START_ до _END_ из _TOTAL_ записей",
                "infoEmpty": "Записи с 0 до 0 из 0 записей",
                "infoFiltered": "(отфильтровано из _MAX_ записей)",
                "loadingRecords": "Загрузка записей...",
                "zeroRecords": "Записи отсутствуют.",
                "emptyTable": "В таблице отсутствуют данные",
                "paginate": {
                    "first": "Первая",
                    "previous": "Предыдущая",
                    "next": "Следующая",
                    "last": "Последняя"
                }
            },
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
                // Панель уже восстановлена в area.js, здесь ничего не делаем
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
        console.log('🔵 SegmentsManager: Открываем модальное окно создания сегмента');
        
        this.segmentsState.editingSegment = null;
        this.segmentsState.modalOpen = true;
        
        // Очищаем форму
        try {
            this.clearSegmentForm();
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка очистки формы:', error);
        }
        
        // Показываем модальное окно
        const modal = document.getElementById('segmentModal');
        if (modal) {
            console.log('✅ SegmentsManager: Модальное окно найдено, показываем');
            
            // Убираем класс hidden и показываем модальное окно
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            
            // Устанавливаем заголовок
            const title = document.getElementById('segment-modal-title');
            if (title) {
                title.textContent = 'Создать сегмент';
                console.log('✅ SegmentsManager: Заголовок модального окна установлен');
            } else {
                console.warn('⚠️ SegmentsManager: Заголовок #segment-modal-title не найден');
            }
            
            // Инициализируем содержимое модального окна после показа
            setTimeout(async () => {
                try {
                    // Принудительно загружаем справочные данные
                    console.log('🔄 Принудительная загрузка справочных данных');
                    await this.loadReferenceData();
                    
                    // Сначала заполняем селекты данными
                    await this.populateSegmentFormSelects();
                    
                    // Затем инициализируем SlimSelect
                    this.initializeSlimSelects();
                    
                    // И инициализируем карту
                    this.initializeSegmentMap();
                    
                } catch (error) {
                    console.error('❌ SegmentsManager: Ошибка инициализации модального окна:', error);
                }
            }, 100);
            
            console.log('✅ SegmentsManager: Модальное окно должно быть видимым');
        } else {
            console.error('❌ SegmentsManager: Модальное окно #segmentModal не найдено');
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
        
        // Показываем модальное окно
        const modal = document.getElementById('segmentModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Устанавливаем заголовок
            const title = document.getElementById('segmentModalTitle');
            if (title) {
                title.textContent = 'Редактировать сегмент';
            }
            
            // Инициализируем содержимое модального окна после показа
            setTimeout(async () => {
                try {
                    // Принудительно загружаем справочные данные
                    console.log('🔄 Принудительная загрузка справочных данных для редактирования');
                    await this.loadReferenceData();
                    
                    // Сначала заполняем селекты данными
                    await this.populateSegmentFormSelects();
                    
                    // Затем инициализируем SlimSelect
                    this.initializeSlimSelects();
                    
                    // Заполняем форму данными сегмента
                    this.populateSegmentForm(segment);
                    
                    // И инициализируем карту
                    this.initializeSegmentMap();
                    
                } catch (error) {
                    console.error('❌ SegmentsManager: Ошибка инициализации модального окна редактирования:', error);
                }
            }, 100);
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
     * Инициализация SlimSelect для всех селектов в модальном окне
     */
    initializeSlimSelects() {
        const selectors = [
            'segmentType',
            'segmentHouseClass', 
            'segmentHouseSeries',
            'segmentWallMaterial',
            'segmentCeilingMaterial',
            'segmentGasSupply',
            'segmentAddresses'
        ];
        
        selectors.forEach(selectorId => {
            const element = document.getElementById(selectorId);
            if (element && !element.slimSelect) {
                try {
                    element.slimSelect = new SlimSelect({
                        select: element,
                        settings: {
                            searchPlaceholder: 'Поиск...',
                            searchText: 'Нет результатов',
                            searchHighlight: true,
                            closeOnSelect: false,
                            showSearch: true,
                            placeholderText: 'Выберите значения...'
                        }
                    });
                    
                    console.log(`✅ SlimSelect инициализирован для ${selectorId}`);
                } catch (error) {
                    console.error(`❌ Ошибка инициализации SlimSelect для ${selectorId}:`, error);
                }
            }
        });
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
            modal.classList.add('hidden');
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
    async populateSegmentFormSelects() {
        try {
            console.log('🔄 SegmentsManager: Заполняем селекты формы сегмента');
            
            // Сначала убедимся, что данные загружены
            if (!this.houseClasses || !this.houseSeries || !this.wallMaterials || !this.ceilingMaterials) {
                console.warn('⚠️ SegmentsManager: Справочные данные не загружены, повторная загрузка');
                await this.loadReferenceData();
            }
            
            // Заполняем классы домов
            const houseClassSelect = document.getElementById('segmentHouseClass');
            if (houseClassSelect) {
                console.log('🔍 Данные для классов домов:', this.houseClasses);
                houseClassSelect.innerHTML = this.houseClasses.map(houseClass => 
                    `<option value="${houseClass.id}">${houseClass.name}</option>`
                ).join('');
                console.log(`✅ Заполнен селект классов домов: ${this.houseClasses.length} элементов`);
                console.log('🔍 HTML классов домов:', houseClassSelect.innerHTML);
            } else {
                console.error('❌ Элемент #segmentHouseClass не найден');
            }
            
            // Заполняем серии домов
            const houseSeriesSelect = document.getElementById('segmentHouseSeries');
            if (houseSeriesSelect) {
                console.log('🔍 Данные для серий домов:', this.houseSeries);
                houseSeriesSelect.innerHTML = this.houseSeries.map(series => 
                    `<option value="${series.id}">${series.name}</option>`
                ).join('');
                console.log(`✅ Заполнен селект серий домов: ${this.houseSeries.length} элементов`);
                console.log('🔍 HTML серий домов:', houseSeriesSelect.innerHTML);
            } else {
                console.error('❌ Элемент #segmentHouseSeries не найден');
            }
            
            // Заполняем материалы стен
            const wallMaterialSelect = document.getElementById('segmentWallMaterial');
            if (wallMaterialSelect) {
                console.log('🔍 Данные для материалов стен:', this.wallMaterials);
                wallMaterialSelect.innerHTML = this.wallMaterials.map(material => 
                    `<option value="${material.id}">${material.name}</option>`
                ).join('');
                console.log(`✅ Заполнен селект материалов стен: ${this.wallMaterials.length} элементов`);
                console.log('🔍 HTML материалов стен:', wallMaterialSelect.innerHTML);
            } else {
                console.error('❌ Элемент #segmentWallMaterial не найден');
            }
            
            // Заполняем материалы перекрытий
            const ceilingMaterialSelect = document.getElementById('segmentCeilingMaterial');
            if (ceilingMaterialSelect) {
                console.log('🔍 Данные для материалов перекрытий:', this.ceilingMaterials);
                ceilingMaterialSelect.innerHTML = this.ceilingMaterials.map(material => 
                    `<option value="${material.id}">${material.name}</option>`
                ).join('');
                console.log(`✅ Заполнен селект материалов перекрытий: ${this.ceilingMaterials.length} элементов`);
                console.log('🔍 HTML материалов перекрытий:', ceilingMaterialSelect.innerHTML);
            } else {
                console.error('❌ Элемент #segmentCeilingMaterial не найден');
            }
            
            // Заполняем адреса из текущей области
            await this.populateAddressesSelect();
            
            console.log('✅ SegmentsManager: Все селекты заполнены');
            
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка заполнения селектов:', error);
        }
    }
    
    /**
     * Заполнение списка адресов
     */
    async populateAddressesSelect() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                console.error('❌ SegmentsManager: Нет текущей области');
                console.log('🔍 Все состояния dataState:', this.dataState.getAllStates());
                return;
            }
            
            const addresses = this.dataState.getState('addresses') || [];
            // Все адреса - фильтрация по области должна быть уже применена в основном коде
            const addressesInArea = addresses.filter(addr => 
                addr.coordinates && addr.coordinates.lat && addr.coordinates.lng
            );
            
            console.log(`🔄 SegmentsManager: Загружаем ${addressesInArea.length} адресов в селект`);
            console.log('🔍 Текущая область:', currentArea.name, 'ID:', currentArea.id);
            console.log('🔍 Всего адресов:', addresses.length);
            
            const addressesSelect = document.getElementById('segmentAddresses');
            if (addressesSelect) {
                addressesSelect.innerHTML = addressesInArea.map(address => 
                    `<option value="${address.id}">${address.address}</option>`
                ).join('');
                
                console.log('✅ SegmentsManager: Список адресов заполнен');
            } else {
                console.error('❌ SegmentsManager: Элемент #segmentAddresses не найден');
            }
            
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка заполнения адресов:', error);
        }
    }
    
    /**
     * Инициализация карты в модальном окне сегмента
     */
    initializeSegmentMap() {
        try {
            const mapContainer = document.getElementById('segmentMap');
            if (!mapContainer) {
                console.error('❌ SegmentsManager: Контейнер карты не найден');
                return;
            }
            
            console.log('🔄 SegmentsManager: Инициализируем карту сегмента');
            console.log('🔍 Контейнер карты:', mapContainer);
            console.log('🔍 Размеры контейнера:', mapContainer.offsetWidth, 'x', mapContainer.offsetHeight);
            
            // Очищаем существующую карту
            if (this.segmentMap) {
                console.log('🔄 Очищаем существующую карту');
                this.segmentMap.remove();
                this.segmentMap = null;
                this.segmentAreaPolygon = null;
                this.segmentAddressesLayer = null;
            }
            
            // Создаем новую карту
            this.segmentMap = L.map('segmentMap').setView([55.7558, 37.6176], 10);
            console.log('✅ Карта создана:', this.segmentMap);
            
            // Добавляем тайловый слой
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.segmentMap);
            console.log('✅ Тайловый слой добавлен');
            
            // Принудительно обновляем размеры карты
            setTimeout(() => {
                if (this.segmentMap) {
                    this.segmentMap.invalidateSize();
                    console.log('✅ Размеры карты обновлены');
                    
                    // Загружаем адреса области
                    this.loadAddressesOnMap();
                }
            }, 200);
            
            console.log('✅ SegmentsManager: Карта сегмента инициализирована');
            
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка инициализации карты:', error);
        }
    }
    
    /**
     * Загрузка адресов на карту
     */
    async loadAddressesOnMap() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea || !this.segmentMap) {
                console.error('❌ SegmentsManager: Нет текущей области или карты');
                console.log('🔍 currentArea:', currentArea);
                console.log('🔍 segmentMap:', this.segmentMap);
                console.log('🔍 Все состояния dataState:', this.dataState.getAllStates());
                return;
            }
            
            // Добавляем полигон области на карту
            this.displayAreaPolygon(currentArea);
            
            const addresses = this.dataState.getState('addresses') || [];
            // Все адреса с координатами - фильтрация по полигону делается в основном приложении
            const addressesWithCoords = addresses.filter(addr => 
                addr.coordinates && 
                addr.coordinates.lat && 
                addr.coordinates.lng
            );
            
            console.log(`🔄 SegmentsManager: Загружаем ${addressesWithCoords.length} адресов на карту`);
            
            // Очищаем существующие маркеры
            if (this.segmentAddressesLayer) {
                this.segmentMap.removeLayer(this.segmentAddressesLayer);
            }
            
            // Создаем группу маркеров для адресов
            this.segmentAddressesLayer = L.layerGroup();
            
            // Добавляем маркеры для каждого адреса
            addressesWithCoords.forEach(address => {
                const marker = this.createAddressMarker(address);
                this.segmentAddressesLayer.addLayer(marker);
            });
            
            // Добавляем слой на карту
            this.segmentAddressesLayer.addTo(this.segmentMap);
            
            // Подгоняем масштаб карты под область или адреса
            if (this.segmentAreaPolygon) {
                this.segmentMap.fitBounds(this.segmentAreaPolygon.getBounds(), { padding: [20, 20] });
            } else if (addressesWithCoords.length > 0) {
                const bounds = L.latLngBounds(
                    addressesWithCoords.map(addr => [addr.coordinates.lat, addr.coordinates.lng])
                );
                this.segmentMap.fitBounds(bounds, { padding: [20, 20] });
            }
            
            console.log(`✅ SegmentsManager: Загружено ${addressesWithCoords.length} адресов на карту`);
            
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка загрузки адресов на карту:', error);
        }
    }
    
    /**
     * Отображение полигона области (как в MapManager)
     */
    displayAreaPolygon(area) {
        try {
            if (!area || !this.hasAreaPolygon(area)) {
                console.warn('⚠️ SegmentsManager: У области нет полигона или он некорректен');
                return;
            }
            
            // Если полигон уже существует, не создаем его повторно
            if (this.segmentAreaPolygon) {
                console.log('🔷 Полигон области уже отображен, пропускаем повторное создание');
                return;
            }
            
            console.log('🔷 Создаем полигон области на карте');
            
            // Конвертируем координаты в формат Leaflet
            const latLngs = area.polygon.map(point => [point.lat, point.lng]);
            
            // Создаем полигон как отдельный слой
            this.segmentAreaPolygon = L.polygon(latLngs, {
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.1,
                weight: 2,
                opacity: 0.8
            }).addTo(this.segmentMap);
            
            // Добавляем popup с информацией об области
            this.segmentAreaPolygon.bindPopup(`
                <div class="text-sm">
                    <strong>Область: ${area.name}</strong><br>
                    Создана: ${new Date(area.created_at).toLocaleDateString()}
                </div>
            `);
            
            console.log('✅ SegmentsManager: Полигон области добавлен на карту');
            
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка добавления полигона области:', error);
        }
    }
    
    /**
     * Проверка наличия полигона в области (как в MapManager)
     */
    hasAreaPolygon(area) {
        return area && 
               area.polygon && 
               Array.isArray(area.polygon) && 
               area.polygon.length >= 3;
    }
    
    /**
     * Создание маркера адреса (как в MapManager)
     */
    createAddressMarker(address) {
        const color = this.getAddressColor(address);
        
        const marker = L.marker([address.coordinates.lat, address.coordinates.lng], {
            addressId: address.id,
            icon: L.divIcon({
                className: 'address-marker',
                html: `<div style="background: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        });
        
        marker.bindPopup(this.createAddressPopup(address));
        
        // Добавляем обработчик клика для выбора адреса
        marker.on('click', () => {
            this.toggleAddressSelection(address.id);
        });
        
        return marker;
    }
    
    /**
     * Создание popup для адреса (как в MapManager)
     */
    createAddressPopup(address) {
        const propertyTypeNames = {
            'house': 'Дом',
            'house_with_land': 'Дом с участком',
            'land': 'Участок',
            'commercial': 'Коммерческая',
            'building': 'Здание'
        };
        
        return `
            <div class="max-w-xs">
                <div class="font-medium text-gray-900 mb-2">📍 ${address.address}</div>
                <div class="text-sm text-gray-600 space-y-1">
                    <div>Тип: ${propertyTypeNames[address.type] || address.type}</div>
                    ${address.floors_count ? `<div>Этажей: ${address.floors_count}</div>` : ''}
                    ${address.build_year ? `<div>Год: ${address.build_year}</div>` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Получение цвета для адреса (как в MapManager)
     */
    getAddressColor(address) {
        const typeColors = {
            'house': '#3b82f6',
            'house_with_land': '#10b981',
            'land': '#f59e0b',
            'commercial': '#ef4444',
            'building': '#8b5cf6'
        };
        
        return typeColors[address.type] || '#6b7280';
    }

    /**
     * Переключение выбора адреса
     */
    toggleAddressSelection(addressId) {
        const addressSelect = document.getElementById('segmentAddresses');
        if (!addressSelect || !addressSelect.slimSelect) return;
        
        const currentValues = addressSelect.slimSelect.selected() || [];
        const isSelected = currentValues.includes(addressId);
        
        if (isSelected) {
            // Убираем из выбора
            const newValues = currentValues.filter(id => id !== addressId);
            addressSelect.slimSelect.set(newValues);
        } else {
            // Добавляем в выбор
            addressSelect.slimSelect.set([...currentValues, addressId]);
        }
        
        // Обновляем внешний вид маркеров
        this.updateMapMarkersStyle();
    }
    
    /**
     * Обновление стилей маркеров на карте
     */
    updateMapMarkersStyle() {
        if (!this.segmentAddressesLayer || !this.segmentMap) return;
        
        const addressSelect = document.getElementById('segmentAddresses');
        const selectedAddresses = addressSelect?.slimSelect?.selected() || [];
        
        // Обновляем стили всех маркеров
        this.segmentAddressesLayer.eachLayer(layer => {
            if (layer.options && layer.options.addressId) {
                const isSelected = selectedAddresses.includes(layer.options.addressId);
                layer.setOpacity(isSelected ? 1.0 : 0.5);
                
                // Можно добавить изменение иконки для выбранных адресов
                if (isSelected) {
                    layer.getElement()?.style.setProperty('filter', 'hue-rotate(120deg)');
                } else {
                    layer.getElement()?.style.removeProperty('filter');
                }
            }
        });
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
    
    // Методы управления панелью удалены - управление через UIManager
    
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