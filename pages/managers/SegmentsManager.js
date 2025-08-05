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
        this.houseProblems = [];
        
        // Активный фильтр отображения маркеров
        this.activeSegmentMapFilter = 'year';
        
        // Флаг для предотвращения двойной перерисовки карты
        this.isUpdatingMap = false;
        
        // Флаг для отключения обработчиков событий во время заполнения формы
        this.isFillingForm = false;
        
        // График распределения площадей
        this.areaDistributionChart = null;
        
        // Состояние подсегментов
        this.subsegmentsState = {
            subsegments: [],
            selectedSubsegment: null,
            editingSubsegment: null
        };
        
        // Флаг инициализации событий подсегментов
        this.subsegmentEventsInitialized = false;
        
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
        
        // Привязка к фильтрам карты
        this.bindMapFilterEvents();
        
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
                // console.log('🔵 SegmentsManager: Клик по кнопке создания сегмента');
                this.openCreateSegmentModal();
            });
            // console.log('✅ SegmentsManager: Кнопка создания сегмента привязана');
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
        
        // Кнопка отмены убрана - остается только кнопка "Закрыть"
        
        // Кнопка закрытия в футере модального окна
        document.getElementById('closeSegmentModalFooterBtn')?.addEventListener('click', () => {
            this.closeSegmentModal();
        });
        
        // Кнопка сохранения сегмента - используем только submit формы
        document.getElementById('saveSegmentBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            // Программно отправляем форму
            document.getElementById('segmentForm')?.requestSubmit();
        });
        
        // Кнопка отмены изменений
        document.getElementById('cancelChangesBtn')?.addEventListener('click', () => {
            this.cancelChanges();
        });
        
        // Форма сегмента
        document.getElementById('segmentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSegment();
        });
        
        // Динамическое обновление при изменении фильтров
        this.bindFilterChangeEvents();
    }
    
    /**
     * Привязка событий изменения фильтров для динамического обновления
     */
    bindFilterChangeEvents() {
        const form = document.getElementById('segmentForm');
        if (!form) return;
        
        // Обработчик для всех элементов формы
        const updateHandler = async () => {
            // Пропускаем обновления во время заполнения формы
            if (this.isFillingForm) {
                console.log('🔍 Пропускаем обновление - форма заполняется');
                return;
            }
            
            await this.updateSegmentNameFromFilters();
            this.updateSegmentMapWithFilters();
            this.updateAreaDistributionChart();
            // checkForChanges вызывается внутри updateSegmentNameFromFilters
        };
        
        // Привязываем к изменениям всех полей фильтров
        const filterSelectors = [
            'select[name="type"]',
            'select[name="house_class_id"]', 
            'select[name="house_series_id"]',
            'select[name="wall_material_id"]',
            'select[name="ceiling_material_id"]',
            'select[name="gas_supply"]',
            'select[name="individual_heating"]',
            'select[name="closed_territory"]',
            'select[name="underground_parking"]',
            'select[name="commercial_spaces"]',
            'input[name="floors_from"]',
            'input[name="floors_to"]',
            'input[name="build_year_from"]',
            'input[name="build_year_to"]',
            'input[name="ceiling_height_from"]',
            'input[name="ceiling_height_to"]',
            'select[name="addresses"]'
        ];
        
        filterSelectors.forEach(selector => {
            const elements = form.querySelectorAll(selector);
            elements.forEach(element => {
                if (element.tagName === 'SELECT') {
                    element.addEventListener('change', updateHandler);
                    
                    // Для SlimSelect нужно добавить обработчик на объект слимселекта
                    setTimeout(() => {
                        if (element.slimSelect) {
                            element.slimSelect.onChange = updateHandler;
                        }
                    }, 100);
                } else if (element.tagName === 'INPUT') {
                    element.addEventListener('input', updateHandler);
                }
            });
        });
    }
    
    /**
     * Обновление названия сегмента на основе текущих фильтров
     */
    async updateSegmentNameFromFilters() {
        const form = document.getElementById('segmentForm');
        const nameInput = document.getElementById('segmentName');
        if (!form || !nameInput) return;
        
        try {
            const filters = this.getSegmentFormData().filters;
            const generatedName = await this.generateSegmentName(filters);
            nameInput.value = generatedName;
        } catch (error) {
            console.warn('Ошибка генерации названия сегмента:', error);
        }
        
        // Проверяем есть ли изменения после обновления названия
        this.checkForChanges();
    }
    
    /**
     * Проверка наличия изменений в форме
     */
    checkForChanges() {
        if (!this.segmentsState.savedSegmentData) {
            // Если нет сохраненных данных, считаем что есть изменения
            this.updateSaveButtonState(true);
            return;
        }
        
        const currentData = this.getSegmentFormData();
        const hasChanges = JSON.stringify(currentData) !== JSON.stringify(this.segmentsState.savedSegmentData);
        
        this.updateSaveButtonState(hasChanges);
    }
    
    /**
     * Обновление состояния кнопки сохранения
     */
    updateSaveButtonState(hasChanges = false) {
        const saveBtn = document.getElementById('saveSegmentBtn');
        const indicator = document.getElementById('unsavedChangesIndicator');
        
        if (saveBtn) {
            saveBtn.disabled = !hasChanges;
        }
        
        if (indicator) {
            if (hasChanges) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    }
    
    /**
     * Отмена изменений - возврат к сохраненному состоянию
     */
    cancelChanges() {
        if (!this.segmentsState.savedSegmentData) return;
        
        // Заполняем форму сохраненными данными
        this.fillSegmentForm(this.segmentsState.savedSegmentData);
        
        // Обновляем состояние кнопок
        this.updateSaveButtonState(false);
        
        // Обновляем карту
        this.updateSegmentMapWithFilters();
    }
    
    /**
     * Генерация названия сегмента на основе фильтров
     * Формат: Название области, Серии [список], Классы [список], Года [список], Этажность [список]
     */
    async generateSegmentName(filters) {
        const parts = [];
        
        try {
            // 1. Название области
            const currentArea = this.dataState.getState('currentArea');
            if (currentArea && currentArea.name) {
                parts.push(currentArea.name);
            }
            
            // 2. Серии домов
            if (filters.house_series_id && filters.house_series_id.length > 0) {
                const seriesNames = [];
                for (const seriesId of filters.house_series_id) {
                    try {
                        const series = await window.db.get('house_series', seriesId);
                        if (series && series.name) {
                            seriesNames.push(series.name);
                        }
                    } catch (error) {
                        console.warn('Не удалось получить серию:', seriesId);
                    }
                }
                if (seriesNames.length > 0) {
                    parts.push(`Серии [${seriesNames.join(', ')}]`);
                }
            }
            
            // 3. Классы домов
            if (filters.house_class_id && filters.house_class_id.length > 0) {
                const classNames = [];
                for (const classId of filters.house_class_id) {
                    try {
                        const houseClass = await window.db.get('house_classes', classId);
                        if (houseClass && houseClass.name) {
                            classNames.push(houseClass.name);
                        }
                    } catch (error) {
                        console.warn('Не удалось получить класс дома:', classId);
                    }
                }
                if (classNames.length > 0) {
                    parts.push(`Класс [${classNames.join(', ')}]`);
                }
            }
            
            // 4. Годы постройки (диапазон или список конкретных годов)
            if (filters.build_year_from || filters.build_year_to) {
                const fromYear = filters.build_year_from || 1800;
                const toYear = filters.build_year_to || new Date().getFullYear();
                
                // Если диапазон небольшой (до 10 лет), показываем все годы
                if (toYear - fromYear <= 10) {
                    const years = [];
                    for (let year = fromYear; year <= toYear; year++) {
                        years.push(year.toString());
                    }
                    parts.push(`Года [${years.join(', ')}]`);
                } else {
                    // Иначе показываем диапазон
                    parts.push(`Года [${fromYear}-${toYear}]`);
                }
            }
            
            // 5. Этажность (диапазон или список конкретных этажей)
            if (filters.floors_from || filters.floors_to) {
                const fromFloors = filters.floors_from || 1;
                const toFloors = filters.floors_to || 100;
                
                // Если диапазон небольшой (до 15 этажей), показываем все этажи
                if (toFloors - fromFloors <= 15) {
                    const floors = [];
                    for (let floor = fromFloors; floor <= toFloors; floor++) {
                        floors.push(floor.toString());
                    }
                    parts.push(`Этажность [${floors.join(', ')}]`);
                } else {
                    // Иначе показываем диапазон
                    parts.push(`Этажность [${fromFloors}-${toFloors}]`);
                }
            }
            
        } catch (error) {
            console.error('Ошибка генерации названия сегмента:', error);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Новый сегмент';
    }
    
    /**
     * Обновление карты сегмента с учетом фильтров (прозрачность маркеров)
     */
    updateSegmentMapWithFilters() {
        if (!this.segmentMap || !this.segmentAddressesLayer) return;
        
        // Предотвращаем двойную перерисовку
        if (this.isUpdatingMap) {
            console.log('🔍 Пропускаем обновление карты - уже обновляется');
            return;
        }
        
        try {
            const filters = this.getSegmentFormData().filters;
            
            // Используем небольшую задержку чтобы убедиться что элементы существуют
            setTimeout(() => {
                // Перерисовываем маркеры с учетом фильтров
                this.segmentAddressesLayer.eachLayer((marker) => {
                    const address = marker.addressData;
                    if (address) {
                        const matchesFilters = this.addressMatchesFilters(address, filters);
                        const element = marker.getElement();
                        
                        if (element) {
                            // Устанавливаем прозрачность: 0% для подходящих, 50% для не подходящих
                            element.style.opacity = matchesFilters ? '1.0' : '0.5';
                        }
                    }
                });
            }, 10);
        } catch (error) {
            console.error('Ошибка обновления карты сегмента:', error);
        }
    }
    
    /**
     * Проверка соответствия адреса фильтрам сегмента
     */
    addressMatchesFilters(address, filters) {
        // Проверка типа недвижимости
        if (filters.type && filters.type.length > 0) {
            if (!filters.type.includes(address.type)) {
                return false;
            }
        }
        
        // Проверка этажности
        if (filters.floors_from && address.floors_count < filters.floors_from) {
            return false;
        }
        if (filters.floors_to && address.floors_count > filters.floors_to) {
            return false;
        }
        
        // Проверка года постройки
        if (filters.build_year_from && address.build_year < filters.build_year_from) {
            return false;
        }
        if (filters.build_year_to && address.build_year > filters.build_year_to) {
            return false;
        }
        
        // Проверка высоты потолков
        if (filters.ceiling_height_from && address.ceiling_height && 
            parseFloat(address.ceiling_height) < filters.ceiling_height_from) {
            return false;
        }
        if (filters.ceiling_height_to && address.ceiling_height &&
            parseFloat(address.ceiling_height) > filters.ceiling_height_to) {
            return false;
        }
        
        // Проверка булевых полей
        const booleanFields = [
            'gas_supply', 'individual_heating', 'closed_territory', 
            'underground_parking', 'commercial_spaces'
        ];
        
        for (const field of booleanFields) {
            if (filters[field] && filters[field].length > 0) {
                const addressValue = address[field];
                let addressValueStr;
                
                if (addressValue === undefined || addressValue === null) {
                    addressValueStr = '';
                } else {
                    addressValueStr = addressValue.toString();
                }
                
                if (!filters[field].includes(addressValueStr)) {
                    return false;
                }
            }
        }
        
        // Проверка справочных полей (серии, классы, материалы)
        const referenceFields = [
            'house_series_id', 'house_class_id', 'wall_material_id', 'ceiling_material_id'
        ];
        
        for (const field of referenceFields) {
            if (filters[field] && filters[field].length > 0) {
                if (!address[field] || !filters[field].includes(address[field])) {
                    return false;
                }
            }
        }
        
        // Проверка выбранных адресов
        if (filters.addresses && filters.addresses.length > 0) {
            if (!filters.addresses.includes(address.id)) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Привязка к фильтрам карты
     */
    bindMapFilterEvents() {
        const filterButtons = [
            'segmentFilterByYear',
            'segmentFilterBySeries', 
            'segmentFilterByFloors',
            'segmentFilterByObjects',
            'segmentFilterByListings',
            'segmentFilterByHouseClass',
            'segmentFilterByHouseProblems',
            'segmentFilterByCommercialSpaces',
            'segmentFilterByComment'
        ];
        
        filterButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', (e) => {
                    const filter = e.target.getAttribute('data-filter');
                    this.setSegmentMapFilter(filter);
                });
            }
        });
    }
    
    /**
     * Установка фильтра карты сегмента
     */
    setSegmentMapFilter(filterType) {
        this.activeSegmentMapFilter = filterType;
        
        // Обновляем стили кнопок
        this.updateSegmentFilterButtons(filterType);
        
        // Перерисовываем маркеры
        this.redrawSegmentMapMarkers();
    }
    
    /**
     * Обновление стилей кнопок фильтров
     */
    updateSegmentFilterButtons(activeFilter) {
        const filterButtons = document.querySelectorAll('[data-filter]');
        filterButtons.forEach(button => {
            const filter = button.getAttribute('data-filter');
            if (filter === activeFilter) {
                button.classList.remove('bg-white', 'border-gray-300', 'text-gray-700');
                button.classList.add('bg-indigo-50', 'border-indigo-500', 'text-indigo-700');
            } else {
                button.classList.remove('bg-indigo-50', 'border-indigo-500', 'text-indigo-700');
                button.classList.add('bg-white', 'border-gray-300', 'text-gray-700');
            }
        });
    }
    
    /**
     * Перерисовка маркеров на карте сегмента
     */
    async redrawSegmentMapMarkers() {
        if (!this.segmentMap || !this.segmentAddressesLayer) return;
        
        try {
            // Удаляем существующие маркеры
            this.segmentMap.removeLayer(this.segmentAddressesLayer);
            
            // Получаем адреса
            const addresses = this.dataState.getState('addresses') || [];
            const addressesWithCoords = addresses.filter(addr => 
                addr.coordinates && 
                addr.coordinates.lat && 
                addr.coordinates.lng
            );
            
            // Получаем текущие фильтры сегмента (если форма инициализирована)
            let filters = {};
            try {
                filters = this.getSegmentFormData().filters;
            } catch (error) {
                // Форма еще не инициализирована, используем пустые фильтры
                filters = {};
            }
            
            // Создаем новую группу маркеров
            this.segmentAddressesLayer = L.layerGroup();
            
            // Добавляем маркеры с новым стилем
            for (const address of addressesWithCoords) {
                const marker = await this.createTriangularAddressMarker(address);
                this.segmentAddressesLayer.addLayer(marker);
            }
            
            // Добавляем слой на карту
            this.segmentAddressesLayer.addTo(this.segmentMap);
            
            // После добавления на карту применяем прозрачность
            setTimeout(() => {
                this.segmentAddressesLayer.eachLayer((marker) => {
                    const address = marker.addressData;
                    if (address) {
                        const matchesFilters = this.addressMatchesFilters(address, filters);
                        const element = marker.getElement();
                        
                        if (element) {
                            // Устанавливаем прозрачность: 0% для подходящих, 50% для не подходящих
                            element.style.opacity = matchesFilters ? '1.0' : '0.5';
                        }
                    }
                });
            }, 50);
            
        } catch (error) {
            console.error('❌ Ошибка перерисовки маркеров:', error);
        }
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
            
            // Обработка раскрытия подсегментов
            const expandSubsegmentsBtn = e.target.closest('.expand-segment-subsegments');
            if (expandSubsegmentsBtn) {
                e.preventDefault();
                e.stopPropagation();
                
                const segmentId = expandSubsegmentsBtn.getAttribute('data-segment-id');
                this.toggleSegmentSubsegments(segmentId, expandSubsegmentsBtn);
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
            // console.log('🔄 Загружаем справочные данные из базы данных...');
            
            // Загружаем данные из базы данных
            this.houseSeries = await window.db.getAll('house_series') || [];
            this.houseClasses = await window.db.getAll('house_classes') || [];
            this.wallMaterials = await window.db.getAll('wall_materials') || [];
            this.ceilingMaterials = await window.db.getAll('ceiling_materials') || [];
            this.houseProblems = await window.db.getAll('house_problems') || [];
            
            // console.log('📊 Загружено справочных данных:', this.houseSeries.length, this.houseClasses.length, this.wallMaterials.length, this.ceilingMaterials.length, this.houseProblems.length);
            
            // console.log('✅ Справочные данные для сегментов загружены');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки справочных данных:', error);
            
            // Создаем пустые массивы при ошибке
            this.houseSeries = [];
            this.houseClasses = [];
            this.wallMaterials = [];
            this.ceilingMaterials = [];
            this.houseProblems = [];
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
            order: [[0, 'asc']], // Сортировка по названию
            columnDefs: [
                { 
                    targets: 0, 
                    render: (data, type, row) => this.renderNameColumn(data, type, row)
                },
                { 
                    targets: 1, 
                    render: (data, type, row) => this.renderAddressesColumn(data, type, row)
                },
                { 
                    targets: 2, 
                    render: (data, type, row) => this.renderSubsegmentsColumn(data, type, row)
                },
                { 
                    targets: 3, 
                    orderable: false,
                    render: (data, type, row) => this.renderActionsColumn(data, type, row)
                }
            ],
            initComplete: () => {
                // Панель уже восстановлена в area.js, здесь ничего не делаем
            }
        });
        
        // Обработка разворачивания строк убрана - больше нет раскрываемых панелей
        
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
            
            // Получаем подсегменты из базы данных
            const subsegments = await window.db.getSubsegmentsBySegment(segment.id);
            
            const stats = {
                addressesCount: filteredAddresses.length,
                subsegmentsCount: subsegments?.length || 0,
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
        // Адреса уже отфильтрованы по области в основном приложении
        // Здесь фильтруем только по характеристикам сегмента
        // console.log(`🔍 Фильтрация адресов для сегмента "${segment.name}":`, { totalAddresses: addresses.length, segmentFilters: segment.filters });
        
        if (!segment.filters) {
            console.log('⚠️ У сегмента нет фильтров, возвращаем все адреса');
            return addresses;
        }
        
        const filteredAddresses = addresses.filter(address => {
            const filters = segment.filters;
            
            // Фильтр по конкретным адресам (приоритетный)
            if (filters.addresses && Array.isArray(filters.addresses) && filters.addresses.length > 0) {
                // Если указан список конкретных адресов, возвращаем только их
                return filters.addresses.includes(address.id);
            }
            
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
        
        // console.log(`📍 После фильтрации: ${filteredAddresses.length} из ${addresses.length} адресов`);
        return filteredAddresses;
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
        // console.log('🔵 SegmentsManager: Открываем модальное окно создания сегмента');
        
        this.segmentsState.editingSegment = null;
        this.segmentsState.modalOpen = true;
        
        // Заполняем ID области (форма уже очищена при закрытии предыдущего модального окна)
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (currentArea) {
                const mapAreaIdField = document.getElementById('segmentMapAreaId');
                if (mapAreaIdField) {
                    mapAreaIdField.value = currentArea.id;
                }
            }
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка установки ID области:', error);
        }
        
        // Показываем модальное окно
        const modal = document.getElementById('segmentModal');
        if (modal) {
            // console.log('✅ SegmentsManager: Модальное окно найдено, показываем');
            
            // Убираем класс hidden и показываем модальное окно
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            
            // Устанавливаем заголовок
            const title = document.getElementById('segment-modal-title');
            if (title) {
                title.textContent = 'Создать сегмент';
                // console.log('✅ SegmentsManager: Заголовок модального окна установлен');
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
                    
                    // Для нового сегмента изначально есть изменения (пустая форма)
                    this.updateSaveButtonState(true);
                    
                } catch (error) {
                    console.error('❌ SegmentsManager: Ошибка инициализации модального окна:', error);
                }
            }, 100);
            
            // console.log('✅ SegmentsManager: Модальное окно должно быть видимым');
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
            // console.log('✅ SegmentsManager: Модальное окно найдено, показываем');
            
            // Убираем класс hidden и показываем модальное окно
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            
            // Устанавливаем заголовок (пробуем оба варианта ID)
            const title = document.getElementById('segmentModalTitle') || document.getElementById('segment-modal-title');
            if (title) {
                title.textContent = 'Редактировать сегмент';
                // console.log('✅ SegmentsManager: Заголовок модального окна установлен');
            } else {
                console.warn('⚠️ SegmentsManager: Заголовок модального окна не найден');
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
                    this.fillSegmentForm(segment);
                    
                    // Сохраняем текущие данные как сохраненное состояние
                    this.segmentsState.savedSegmentData = { ...this.getSegmentFormData() };
                    
                    // Обновляем состояние кнопок (для редактирования изначально нет изменений)
                    this.updateSaveButtonState(false);
                    
                    // И инициализируем карту
                    this.initializeSegmentMap();
                    
                    // Загружаем подсегменты для редактируемого сегмента
                    setTimeout(() => {
                        this.loadSubsegments();
                    }, 500);
                    
                } catch (error) {
                    console.error('❌ SegмentsManager: Ошибка инициализации модального окна редактирования:', error);
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
            'segmentIndividualHeating',
            'segmentClosedTerritory',
            'segmentUndergroundParking',
            'segmentCommercialSpaces',
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
        
        // Сбрасываем выделение подсегмента
        this.subsegmentsState.selectedSubsegment = null;
        this.highlightSubsegmentOnChart(null);
        
        // Очищаем форму
        this.clearSegmentForm();
    }
    
    /**
     * Сохранение сегмента
     */
    async saveSegment() {
        console.log('🔍 saveSegment() вызван в', new Date().toISOString());
        console.log('🔍 editingSegment текущий:', this.segmentsState.editingSegment);
        
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
            const isEditingMode = this.segmentsState.editingSegment !== null;
            console.log('🔍 Режим сохранения (до изменений):', isEditingMode ? 'Редактирование' : 'Создание');
            console.log('🔍 ID редактируемого сегмента:', this.segmentsState.editingSegment?.id || 'нет');
            
            if (isEditingMode) {
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
            
            // Сохраняем текущее состояние формы как сохраненное
            this.segmentsState.savedSegmentData = { ...formData };
            
            // Устанавливаем editingSegment только если мы редактировали существующий сегмент
            if (isEditingMode) {
                this.segmentsState.editingSegment = segment;
            } else {
                // Для новых сегментов переходим в режим редактирования после создания
                this.segmentsState.editingSegment = segment;
                console.log('🔍 Переход в режим редактирования для нового сегмента:', segment.id);
            }
            
            // Обновляем состояние кнопок
            this.updateSaveButtonState();
            
            // Обновляем график распределения площадей (данные сегмента могли измениться)
            this.updateAreaDistributionChart();
            
            // НЕ закрываем модальное окно после сохранения
            // this.closeSegmentModal();
            
            const isEditing = this.segmentsState.editingSegment !== null;
            console.log('🔍 Режим сохранения:', isEditing ? 'Редактирование' : 'Создание');
            console.log('🔍 ID сегмента:', segment.id);
            
            this.progressManager.showSuccess(
                isEditing ? 'Сегмент обновлен' : 'Сегмент создан'
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
        data.map_area_id = formData.get('map_area_id') || null;
        
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
        
        // Индивидуальное отопление (множественный выбор)
        const individualHeating = formData.getAll('individual_heating');
        if (individualHeating.length > 0) {
            data.filters.individual_heating = individualHeating;
        }
        
        // Закрытая территория (множественный выбор)
        const closedTerritory = formData.getAll('closed_territory');
        if (closedTerritory.length > 0) {
            data.filters.closed_territory = closedTerritory;
        }
        
        // Подземная парковка (множественный выбор)
        const undergroundParking = formData.getAll('underground_parking');
        if (undergroundParking.length > 0) {
            data.filters.underground_parking = undergroundParking;
        }
        
        // Коммерческие помещения (множественный выбор)
        const commercialSpaces = formData.getAll('commercial_spaces');
        if (commercialSpaces.length > 0) {
            data.filters.commercial_spaces = commercialSpaces;
        }
        
        // Высота потолков
        const ceilingHeightFrom = formData.get('ceiling_height_from');
        const ceilingHeightTo = formData.get('ceiling_height_to');
        if (ceilingHeightFrom) data.filters.ceiling_height_from = parseFloat(ceilingHeightFrom);
        if (ceilingHeightTo) data.filters.ceiling_height_to = parseFloat(ceilingHeightTo);
        
        // Адреса (множественный выбор)
        const addresses = formData.getAll('addresses');
        if (addresses.length > 0) {
            data.filters.addresses = addresses;
        }
        
        return data;
    }
    
    /**
     * Заполнение формы сегмента (устаревший метод, заменен на fillSegmentForm)
     * Удален так как работал с чекбоксами, а теперь используется SlimSelect
     */
    
    /**
     * Очистка формы сегмента
     */
    clearSegmentForm() {
        const form = document.getElementById('segmentForm');
        if (!form) return;
        
        console.log('🔄 Очищаем форму сегмента');
        
        form.reset();
        
        // Очищаем все чекбоксы
        const checkboxes = form.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Очищаем все SlimSelect элементы
        const selects = form.querySelectorAll('select');
        selects.forEach(select => {
            if (select.slimSelect) {
                select.slimSelect.setSelected([]);
            }
        });
        
        // Очищаем сохраненные данные
        this.segmentsState.savedSegmentData = null;
        
        // Обновляем состояние кнопок
        this.updateSaveButtonState(true); // Новая форма имеет изменения
        
        console.log('✅ Форма сегмента очищена');
    }
    
    /**
     * Заполнение формы данными сегмента
     */
    fillSegmentForm(segmentData) {
        const form = document.getElementById('segmentForm');
        if (!form || !segmentData) return;
        
        // Устанавливаем флаг заполнения формы
        this.isFillingForm = true;
        console.log('🔍 Начинаем заполнение формы сегмента');
        
        // Форма уже очищена при закрытии предыдущего модального окна
        
        // Заполняем основные поля
        const nameInput = document.getElementById('segmentName');
        if (nameInput) nameInput.value = segmentData.name || '';
        
        const descriptionInput = document.getElementById('segmentDescription');
        if (descriptionInput) descriptionInput.value = segmentData.description || '';
        
        // Заполняем скрытое поле map_area_id
        const mapAreaIdInput = document.getElementById('segmentMapAreaId');
        if (mapAreaIdInput) mapAreaIdInput.value = segmentData.map_area_id || '';
        
        // Заполняем фильтры
        if (segmentData.filters) {
            const filters = segmentData.filters;
            
            // Типы недвижимости
            if (filters.type) {
                const typeSelect = document.getElementById('segmentType');
                if (typeSelect && typeSelect.slimSelect) {
                    typeSelect.slimSelect.setSelected(filters.type);
                }
            }
            
            // Этажность
            const floorsFromInput = document.getElementById('segmentFloorsFrom');
            if (floorsFromInput) floorsFromInput.value = filters.floors_from || '';
            
            const floorsToInput = document.getElementById('segmentFloorsTo');
            if (floorsToInput) floorsToInput.value = filters.floors_to || '';
            
            // Годы постройки
            const yearFromInput = document.getElementById('segmentBuildYearFrom');
            if (yearFromInput) yearFromInput.value = filters.build_year_from || '';
            
            const yearToInput = document.getElementById('segmentBuildYearTo');
            if (yearToInput) yearToInput.value = filters.build_year_to || '';
            
            // Заполняем множественные селекты
            const multiSelects = [
                { fieldName: 'house_class_id', elementId: 'segmentHouseClass' },
                { fieldName: 'house_series_id', elementId: 'segmentHouseSeries' },
                { fieldName: 'wall_material_id', elementId: 'segmentWallMaterial' },
                { fieldName: 'ceiling_material_id', elementId: 'segmentCeilingMaterial' },
                { fieldName: 'gas_supply', elementId: 'segmentGasSupply' },
                { fieldName: 'individual_heating', elementId: 'segmentIndividualHeating' },
                { fieldName: 'closed_territory', elementId: 'segmentClosedTerritory' },
                { fieldName: 'underground_parking', elementId: 'segmentUndergroundParking' },
                { fieldName: 'commercial_spaces', elementId: 'segmentCommercialSpaces' },
                { fieldName: 'addresses', elementId: 'segmentAddresses' }
            ];
            
            multiSelects.forEach(({ fieldName, elementId }) => {
                const element = document.getElementById(elementId);
                if (element && element.slimSelect) {
                    // Устанавливаем значения или пустой массив, если их нет
                    const values = filters[fieldName] || [];
                    element.slimSelect.setSelected(values);
                }
            });
            
            // Высота потолков
            const ceilingFromInput = document.getElementById('segmentCeilingHeightFrom');
            if (ceilingFromInput) ceilingFromInput.value = filters.ceiling_height_from || '';
            
            const ceilingToInput = document.getElementById('segmentCeilingHeightTo');
            if (ceilingToInput) ceilingToInput.value = filters.ceiling_height_to || '';
        }
        
        // Сбрасываем флаг заполнения формы через небольшую задержку
        setTimeout(() => {
            this.isFillingForm = false;
            console.log('🔍 Заполнение формы завершено');
            
            // Теперь можно обновить карту и график с актуальными фильтрами
            this.updateSegmentMapWithFilters();
            this.updateAreaDistributionChart();
        }, 200);
    }
    
    /**
     * Очистка всех полей формы (без сброса справочных данных)
     */
    clearFormFields() {
        const form = document.getElementById('segmentForm');
        if (!form) return;
        
        // Очищаем текстовые поля и скрытые поля
        const textInputs = form.querySelectorAll('input[type="text"], input[type="number"], input[type="hidden"], textarea');
        textInputs.forEach(input => input.value = '');
        
        // Очищаем все SlimSelect элементы
        const selects = form.querySelectorAll('select');
        selects.forEach(select => {
            if (select.slimSelect) {
                select.slimSelect.setSelected([]);
            }
        });
    }
    
    /**
     * Заполнение селектов в форме сегмента
     */
    async populateSegmentFormSelects() {
        try {
            // console.log('🔄 SegmentsManager: Заполняем селекты формы сегмента');
            
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
            
            // console.log('✅ SegmentsManager: Все селекты заполнены');
            
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
            
            // console.log(`🔄 SegmentsManager: Загружаем ${addressesInArea.length} адресов в селект`);
            console.log('🔍 Текущая область:', currentArea.name, 'ID:', currentArea.id);
            console.log('🔍 Всего адресов:', addresses.length);
            
            const addressesSelect = document.getElementById('segmentAddresses');
            if (addressesSelect) {
                addressesSelect.innerHTML = addressesInArea.map(address => 
                    `<option value="${address.id}">${address.address}</option>`
                ).join('');
                
                // console.log('✅ SegmentsManager: Список адресов заполнен');
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
            
            // console.log('🔄 SegmentsManager: Инициализируем карту сегмента');
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
                    
                    // Инициализируем активный фильтр по умолчанию
                    this.setSegmentMapFilter('year');
                    
                    // Загружаем адреса области
                    this.loadAddressesOnMap();
                    
                    // Инициализируем график распределения площадей
                    setTimeout(() => {
                        this.initializeAreaDistributionChart();
                    }, 300);
                    
                    // Инициализируем фильтр подсегментов
                    setTimeout(() => {
                        this.initializeSubsegmentFilter();
                    }, 400);
                }
            }, 200);
            
            // console.log('✅ SegmentsManager: Карта сегмента инициализирована');
            
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
            
            // Устанавливаем флаг обновления карты
            this.isUpdatingMap = true;
            
            // Добавляем полигон области на карту
            this.displayAreaPolygon(currentArea);
            
            const addresses = this.dataState.getState('addresses') || [];
            // Все адреса с координатами - фильтрация по полигону делается в основном приложении
            const addressesWithCoords = addresses.filter(addr => 
                addr.coordinates && 
                addr.coordinates.lat && 
                addr.coordinates.lng
            );
            
            // console.log(`🔄 SegmentsManager: Загружаем ${addressesWithCoords.length} адресов на карту`);
            
            // Очищаем существующие маркеры
            if (this.segmentAddressesLayer) {
                this.segmentMap.removeLayer(this.segmentAddressesLayer);
            }
            
            // Создаем группу маркеров для адресов
            this.segmentAddressesLayer = L.layerGroup();
            
            // Получаем текущие фильтры сегмента (если форма инициализирована)
            let filters = {};
            try {
                filters = this.getSegmentFormData().filters;
            } catch (error) {
                // Форма еще не инициализирована, используем пустые фильтры
                filters = {};
            }
            
            // Добавляем маркеры для каждого адреса
            for (const address of addressesWithCoords) {
                const marker = await this.createTriangularAddressMarker(address);
                this.segmentAddressesLayer.addLayer(marker);
            }
            
            // Добавляем слой на карту
            this.segmentAddressesLayer.addTo(this.segmentMap);
            
            // После добавления на карту применяем прозрачность
            setTimeout(() => {
                this.segmentAddressesLayer.eachLayer((marker) => {
                    const address = marker.addressData;
                    if (address) {
                        const matchesFilters = this.addressMatchesFilters(address, filters);
                        const element = marker.getElement();
                        
                        if (element) {
                            // Устанавливаем прозрачность: 0% для подходящих, 50% для не подходящих
                            element.style.opacity = matchesFilters ? '1.0' : '0.5';
                        }
                    }
                });
            }, 50);
            
            // Подгоняем масштаб карты под область или адреса
            if (this.segmentAreaPolygon) {
                this.segmentMap.fitBounds(this.segmentAreaPolygon.getBounds(), { padding: [20, 20] });
            } else if (addressesWithCoords.length > 0) {
                const bounds = L.latLngBounds(
                    addressesWithCoords.map(addr => [addr.coordinates.lat, addr.coordinates.lng])
                );
                this.segmentMap.fitBounds(bounds, { padding: [20, 20] });
            }
            
            // console.log(`✅ SegmentsManager: Загружено ${addressesWithCoords.length} адресов на карту`);
            
        } catch (error) {
            console.error('❌ SegmentsManager: Ошибка загрузки адресов на карту:', error);
        } finally {
            // Сбрасываем флаг обновления карты через небольшую задержку
            setTimeout(() => {
                this.isUpdatingMap = false;
                console.log('🔍 Флаг isUpdatingMap сброшен');
            }, 100);
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
            
            // console.log('✅ SegmentsManager: Полигон области добавлен на карту');
            
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
     * Создание треугольного маркера адреса (как в MapManager)
     */
    async createTriangularAddressMarker(address) {
        // Определяем высоту маркера по этажности
        const floorCount = address.floors_count || 0;
        let markerHeight;
        if (floorCount >= 1 && floorCount <= 5) {
            markerHeight = 10;
        } else if (floorCount > 5 && floorCount <= 10) {
            markerHeight = 15;
        } else if (floorCount > 10 && floorCount <= 20) {
            markerHeight = 20;
        } else if (floorCount > 20) {
            markerHeight = 25;
        } else {
            markerHeight = 10; // По умолчанию
        }
        
        // Определяем цвет маркера
        let markerColor = '#3b82f6'; // Цвет по умолчанию
        if (address.wall_material_id) {
            try {
                const wallMaterial = await window.db.get('wall_materials', address.wall_material_id);
                if (wallMaterial && wallMaterial.color) {
                    markerColor = wallMaterial.color;
                }
            } catch (error) {
                console.warn('SegmentsManager: Не удалось получить материал стен для адреса:', address.id);
            }
        }
        
        // Определяем текст на маркере в зависимости от активного фильтра
        let labelText = '';
        switch (this.activeSegmentMapFilter) {
            case 'year':
                labelText = address.build_year || '';
                break;
            case 'series':
                if (address.house_series_id) {
                    try {
                        const houseSeries = await window.db.get('house_series', address.house_series_id);
                        labelText = houseSeries ? houseSeries.name : '';
                    } catch (error) {
                        console.warn('SegmentsManager: Не удалось получить серию дома:', address.house_series_id);
                    }
                }
                break;
            case 'floors':
                labelText = address.floors_count || '';
                break;
            case 'objects':
                try {
                    const objects = await window.db.getObjectsByAddress(address.id);
                    labelText = objects.length > 0 ? objects.length.toString() : '';
                } catch (error) {
                    console.warn('SegmentsManager: Не удалось получить объекты для адреса:', address.id);
                }
                break;
            case 'listings':
                try {
                    const listings = await window.db.getListingsByAddress(address.id);
                    labelText = listings.length > 0 ? listings.length.toString() : '';
                } catch (error) {
                    console.warn('SegmentsManager: Не удалось получить объявления для адреса:', address.id);
                }
                break;
            case 'house_class':
                if (address.house_class_id) {
                    try {
                        const houseClass = await window.db.get('house_classes', address.house_class_id);
                        labelText = houseClass ? houseClass.name : '';
                    } catch (error) {
                        console.warn('SegmentsManager: Не удалось получить класс дома:', address.house_class_id);
                    }
                }
                break;
            case 'house_problems':
                if (address.house_problem_id) {
                    try {
                        const houseProblem = await window.db.get('house_problems', address.house_problem_id);
                        labelText = houseProblem ? houseProblem.name : '';
                    } catch (error) {
                        console.warn('SegmentsManager: Не удалось получить проблему дома:', address.house_problem_id);
                    }
                }
                break;
            case 'commercial_spaces':
                if (address.commercial_spaces !== undefined) {
                    const commercialSpacesOptions = ['Не указано', 'Да', 'Нет'];
                    labelText = commercialSpacesOptions[address.commercial_spaces] || 'Не указано';
                }
                break;
            case 'comment':
                // Показываем только если есть комментарий
                labelText = address.comment && address.comment.trim() ? 'Есть комментарий' : '';
                break;
            default:
                labelText = address.build_year || '';
        }
        
        // Создаем HTML для маркера с треугольником
        let markerHtml = `
            <div class="leaflet-marker-icon-wrapper" style="position: relative;">
                <div style="
                    width: 0; 
                    height: 0; 
                    border-left: 7.5px solid transparent; 
                    border-right: 7.5px solid transparent; 
                    border-top: ${markerHeight}px solid ${markerColor};
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
                "></div>`;
        
        // Добавляем корону для класса дома
        if (this.activeSegmentMapFilter === 'house_class' && address.house_class_id) {
            try {
                const houseClass = await window.db.get('house_classes', address.house_class_id);
                if (houseClass && houseClass.color) {
                    markerHtml += `
                        <div style="
                            position: absolute;
                            top: -12px;
                            left: 0px;
                            width: 15px;
                            height: 12px;
                            background: ${houseClass.color};
                            clip-path: polygon(0% 100%, 20% 0%, 40% 70%, 60% 0%, 80% 70%, 100% 0%, 100% 100%);
                            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
                        "></div>`;
                }
            } catch (error) {
                console.warn('SegmentsManager: Не удалось получить класс дома для короны:', address.house_class_id);
            }
        }
        
        // Добавляем прямоугольник для проблем дома
        if (this.activeSegmentMapFilter === 'house_problems' && address.house_problem_id) {
            try {
                const houseProblem = await window.db.get('house_problems', address.house_problem_id);
                if (houseProblem && houseProblem.color) {
                    markerHtml += `
                        <div style="
                            position: absolute;
                            top: -12px;
                            left: 0px;
                            width: 15px;
                            height: 12px;
                            background: ${houseProblem.color};
                            border-radius: 1px;
                            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
                        "></div>`;
                }
            } catch (error) {
                console.warn('SegmentsManager: Не удалось получить проблему дома для прямоугольника:', address.house_problem_id);
            }
        }
        
        // Добавляем текст метки
        if (labelText) {
            markerHtml += `
                <span class="leaflet-marker-iconlabel" style="
                    position: absolute; 
                    left: 15px; 
                    top: 0px; 
                    font-size: 11px; 
                    font-weight: 600; 
                    color: #374151; 
                    background: rgba(255,255,255,0.9); 
                    padding: 1px 4px; 
                    border-radius: 3px; 
                    white-space: nowrap;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                ">${labelText}</span>`;
        }
        
        markerHtml += '</div>';
        
        const marker = L.marker([address.coordinates.lat, address.coordinates.lng], {
            addressId: address.id,
            icon: L.divIcon({
                className: 'address-marker',
                html: markerHtml,
                iconSize: [15, markerHeight],
                iconAnchor: [7.5, markerHeight]
            })
        });
        
        // Создаем пустой popup, содержимое будет обновляться динамически
        marker.bindPopup('Загрузка...', {
            maxWidth: 300,
            className: 'segment-address-popup-container'
        });
        
        // Добавляем обработчики событий для кнопок в popup
        marker.on('popupopen', async () => {
            // Обновляем содержимое popup с актуальными данными
            const popupContent = await this.createSegmentAddressPopup(address);
            marker.setPopupContent(popupContent);
            
            // Добавляем небольшую задержку чтобы popup успел отрендериться
            setTimeout(() => {
                this.bindSegmentPopupEvents(address);
            }, 10);
        });
        
        // Убираем автоматическое переключение при клике на маркер
        // Теперь переключение происходит только через кнопки в popup
        // marker.on('click', () => {
        //     this.toggleAddressSelection(address.id);
        // });
        
        // Сохраняем данные адреса в маркере для фильтрации
        marker.addressData = address;
        
        return marker;
    }
    
    /**
     * Создание popup для адреса в сегменте
     */
    async createSegmentAddressPopup(address) {
        // Получаем справочные данные
        let houseSeriesText = 'Не указана';
        let houseClassText = 'Не указан';
        let wallMaterialText = 'Не указан';
        let ceilingMaterialText = 'Не указан';
        
        try {
            // Серия дома
            if (address.house_series_id) {
                const houseSeries = await window.db.get('house_series', address.house_series_id);
                if (houseSeries) houseSeriesText = houseSeries.name;
            }
            
            // Класс дома
            if (address.house_class_id) {
                const houseClass = await window.db.get('house_classes', address.house_class_id);
                if (houseClass) houseClassText = houseClass.name;
            }
            
            // Материал стен
            if (address.wall_material_id) {
                const wallMaterial = await window.db.get('wall_materials', address.wall_material_id);
                if (wallMaterial) wallMaterialText = wallMaterial.name;
            }
            
            // Материал перекрытий
            if (address.ceiling_material_id) {
                const ceilingMaterial = await window.db.get('ceiling_materials', address.ceiling_material_id);
                if (ceilingMaterial) ceilingMaterialText = ceilingMaterial.name;
            }
        } catch (error) {
            console.warn('SegmentsManager: Ошибка получения справочных данных:', error);
        }
        
        // Подготавливаем текстовые значения
        const typeText = CONSTANTS.PROPERTY_TYPE_NAMES[address.type] || address.type || 'Не указан';
        const sourceText = CONSTANTS.DATA_SOURCE_NAMES[address.source] || address.source || 'Не указан';
        const gasSupplyText = address.gas_supply ? 'Да' : (address.gas_supply === false ? 'Нет' : 'Не указано');
        const individualHeatingText = address.individual_heating ? 'Да' : (address.individual_heating === false ? 'Нет' : 'Не указано');
        
        // Проверяем находится ли адрес в текущем фильтре
        const currentFilters = this.getSegmentFormData().filters;
        const isInFilter = currentFilters.addresses && currentFilters.addresses.includes(address.id);
        
        // Кнопка добавления/удаления из фильтра
        const filterButtonText = isInFilter ? '- Удалить из фильтра' : '+ Добавить в фильтр';
        const filterButtonClass = isInFilter ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700';
        
        // Дополнительные параметры
        const closedTerritoryText = address.closed_territory ? 'Да' : (address.closed_territory === false ? 'Нет' : 'Не указано');
        const undergroundParkingText = address.underground_parking ? 'Да' : (address.underground_parking === false ? 'Нет' : 'Не указано');
        const commercialSpacesText = address.commercial_spaces ? 'Да' : (address.commercial_spaces === false ? 'Нет' : 'Не указано');
        const ceilingHeightText = address.ceiling_height ? `${address.ceiling_height} м` : 'Не указано';
        const entrancesText = address.entrances_count || 'Не указано';
        
        return `
            <div class="segment-address-popup" style="width: 320px; max-width: 320px; max-height: 400px; display: flex; flex-direction: column;">
                <!-- Хедер -->
                <div class="popup-header bg-gray-50 p-3 border-b border-gray-200 rounded-t-lg flex-shrink-0">
                    <div class="flex items-center text-gray-900 text-sm font-semibold mb-1">
                        <span class="text-blue-600 mr-2">📍</span>
                        Информация об адресе
                    </div>
                    <div class="address-title font-medium text-gray-800 text-sm leading-tight">
                        ${address.address || 'Адрес не указан'}
                    </div>
                </div>
                
                <!-- Скроллируемый блок с параметрами -->
                <div class="popup-content p-3 overflow-y-auto flex-grow" style="max-height: 240px;">
                    <!-- Основные характеристики -->
                    <div class="mb-3">
                        <div class="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Основные характеристики</div>
                        <div class="space-y-1.5 text-xs text-gray-600">
                            <div class="flex justify-between">
                                <span class="font-medium">Тип недвижимости:</span>
                                <span>${typeText}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Этажей:</span>
                                <span>${address.floors_count || 'Не указано'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Подъездов:</span>
                                <span>${entrancesText}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Год постройки:</span>
                                <span>${address.build_year || 'Не указан'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Высота потолков:</span>
                                <span>${ceilingHeightText}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Конструктивные особенности -->
                    <div class="mb-3">
                        <div class="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Конструкция</div>
                        <div class="space-y-1.5 text-xs text-gray-600">
                            <div class="flex justify-between">
                                <span class="font-medium">Серия дома:</span>
                                <span class="text-right">${houseSeriesText}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Класс дома:</span>
                                <span class="text-right">${houseClassText}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Материал стен:</span>
                                <span class="text-right">${wallMaterialText}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Материал перекрытий:</span>
                                <span class="text-right">${ceilingMaterialText}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Инфраструктура -->
                    <div class="mb-3">
                        <div class="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Инфраструктура</div>
                        <div class="space-y-1.5 text-xs text-gray-600">
                            <div class="flex justify-between">
                                <span class="font-medium">Газоснабжение:</span>
                                <span class="flex items-center">
                                    ${gasSupplyText}
                                    ${address.gas_supply ? '<span class="ml-1 text-green-600">✓</span>' : address.gas_supply === false ? '<span class="ml-1 text-red-600">✗</span>' : ''}
                                </span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Индивидуальное отопление:</span>
                                <span class="flex items-center">
                                    ${individualHeatingText}
                                    ${address.individual_heating ? '<span class="ml-1 text-green-600">✓</span>' : address.individual_heating === false ? '<span class="ml-1 text-red-600">✗</span>' : ''}
                                </span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Закрытая территория:</span>
                                <span class="flex items-center">
                                    ${closedTerritoryText}
                                    ${address.closed_territory ? '<span class="ml-1 text-green-600">✓</span>' : address.closed_territory === false ? '<span class="ml-1 text-red-600">✗</span>' : ''}
                                </span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Подземная парковка:</span>
                                <span class="flex items-center">
                                    ${undergroundParkingText}
                                    ${address.underground_parking ? '<span class="ml-1 text-green-600">✓</span>' : address.underground_parking === false ? '<span class="ml-1 text-red-600">✗</span>' : ''}
                                </span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Коммерческие помещения:</span>
                                <span class="flex items-center">
                                    ${commercialSpacesText}
                                    ${address.commercial_spaces ? '<span class="ml-1 text-green-600">✓</span>' : address.commercial_spaces === false ? '<span class="ml-1 text-red-600">✗</span>' : ''}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Дополнительная информация -->
                    <div class="mb-3">
                        <div class="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Дополнительно</div>
                        <div class="space-y-1.5 text-xs text-gray-600">
                            <div class="flex justify-between">
                                <span class="font-medium">Источник данных:</span>
                                <span>${sourceText}</span>
                            </div>
                            ${address.comment ? `
                            <div class="pt-1">
                                <span class="font-medium">Комментарий:</span>
                                <div class="mt-1 p-2 bg-gray-50 rounded text-xs italic">
                                    ${address.comment}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Футер с кнопками -->
                <div class="popup-footer p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg flex-shrink-0">
                    <div class="flex justify-center">
                        <button data-action="toggle-filter" data-address-id="${address.id}" 
                                class="px-4 py-2 text-sm ${filterButtonClass} text-white rounded-md transition-colors font-medium shadow-sm hover:shadow-md">
                            ${filterButtonText}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Привязка событий для кнопок в popup сегмента
     */
    bindSegmentPopupEvents(address) {
        console.log('🔗 Привязываем события для popup адреса:', address.id);
        
        // Только кнопка добавления/удаления из фильтра (кнопки редактирования и удаления убраны)
        const toggleBtn = document.querySelector(`[data-action="toggle-filter"][data-address-id="${address.id}"]`);
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleAddressInFilter(address.id);
            });
            console.log('✅ Кнопка фильтра привязана для адреса:', address.id);
        } else {
            console.warn('⚠️ Кнопка фильтра не найдена для адреса:', address.id);
        }
    }
    
    // Методы editAddress и deleteAddress убраны, так как соответствующие кнопки удалены из popup
    
    /**
     * Переключение адреса в фильтре сегмента
     */
    toggleAddressInFilter(addressId) {
        const addressesSelect = document.getElementById('segmentAddresses');
        if (!addressesSelect || !addressesSelect.slimSelect) {
            console.warn('Селект адресов не найден или не инициализирован');
            return;
        }
        
        // Получаем текущие выбранные адреса
        const currentSelected = addressesSelect.slimSelect.getSelected();
        
        // Проверяем есть ли адрес в выборе
        const isSelected = currentSelected.includes(addressId);
        
        let newSelected;
        if (isSelected) {
            // Удаляем из выборки
            newSelected = currentSelected.filter(id => id !== addressId);
        } else {
            // Добавляем в выборку
            newSelected = [...currentSelected, addressId];
        }
        
        // Устанавливаем новую выборку
        addressesSelect.slimSelect.setSelected(newSelected);
        
        // Показываем уведомление
        const message = isSelected ? 'Адрес удален из фильтра' : 'Адрес добавлен в фильтр';
        if (this.progressManager) {
            this.progressManager.showSuccess(message);
        }
        
        // Принудительно закрываем все popup
        if (this.segmentMap) {
            this.segmentMap.closePopup();
        }
        
        // Обновляем карту и состояние кнопок
        this.updateSegmentMapWithFilters();
        this.checkForChanges();
    }
    
    /**
     * Создание маркера адреса (старый метод, оставляем для совместимости)
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
        
        // Убираем автоматическое переключение при клике на маркер (старый метод)
        // Теперь переключение происходит только через кнопки в popup
        // marker.on('click', () => {
        //     this.toggleAddressSelection(address.id);
        // });
        
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
     * Переключение выбора адреса (устаревший метод, заменен на toggleAddressInFilter)
     * Оставлен для совместимости со старыми маркерами
     */
    toggleAddressSelection(addressId) {
        // Перенаправляем на новый метод
        this.toggleAddressInFilter(addressId);
    }
    
    /**
     * Обновление стилей маркеров на карте
     */
    updateMapMarkersStyle() {
        if (!this.segmentAddressesLayer || !this.segmentMap) return;
        
        const addressSelect = document.getElementById('segmentAddresses');
        const selectedAddresses = addressSelect?.slimSelect?.getSelected() || [];
        
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
        // Убираем функционал раскрытия, просто возвращаем пустую ячейку
        return '';
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
     * Переключение отображения подсегментов сегмента
     */
    async toggleSegmentSubsegments(segmentId, buttonElement) {
        try {
            // Получаем строку таблицы
            const tr = $(buttonElement).closest('tr');
            const row = this.segmentsTable.row(tr);
            
            if (row.child.isShown()) {
                // Скрываем дочернюю строку
                row.child.hide();
                tr.removeClass('shown');
                $(buttonElement).find('svg').css('transform', 'rotate(0deg)');
            } else {
                // Показываем дочернюю строку с подсегментами
                await this.showSegmentSubsegments(row, segmentId);
                tr.addClass('shown');
                $(buttonElement).find('svg').css('transform', 'rotate(180deg)');
            }
        } catch (error) {
            console.error('❌ Ошибка переключения подсегментов:', error);
        }
    }

    /**
     * Показать подсегменты сегмента в дочерней строке
     */
    async showSegmentSubsegments(row, segmentId) {
        try {
            // Получаем подсегменты из базы данных
            const subsegments = await window.db.getSubsegmentsBySegment(segmentId);
            
            if (subsegments.length === 0) {
                const childHtml = `
                    <div class="p-4 text-center text-gray-500 italic">
                        Подсегменты не созданы
                    </div>
                `;
                row.child(childHtml).show();
                return;
            }

            // Создаем HTML таблицу с подсегментами
            const childHtml = this.createSubsegmentsChildTable(subsegments);
            row.child(childHtml).show();
            
        } catch (error) {
            console.error('❌ Ошибка загрузки подсегментов:', error);
            row.child('<div class="p-4 text-center text-red-500">Ошибка загрузки подсегментов</div>').show();
        }
    }

    /**
     * Создать HTML таблицу подсегментов для дочерней строки
     */
    createSubsegmentsChildTable(subsegments) {
        const rows = subsegments.map(subsegment => {
            const filters = subsegment.filters || {};
            const propertyTypes = this.formatPropertyTypes(filters.property_type) || 'Не указано';
            
            let areaText = 'Не указано';
            if (filters.area_from || filters.area_to) {
                const from = filters.area_from || 1;
                const to = filters.area_to || '∞';
                areaText = `${from} - ${to}`;
            }
            
            let floorsText = 'Не указано';
            if (filters.floor_from || filters.floor_to) {
                const from = filters.floor_from || 1;
                const to = filters.floor_to || '∞';
                floorsText = `${from} - ${to}`;
            }
            
            let priceText = 'Не указано';
            if (filters.price_from || filters.price_to) {
                const from = filters.price_from ? this.formatPrice(filters.price_from) : '1';
                const to = filters.price_to ? this.formatPrice(filters.price_to) : '∞';
                priceText = `${from} - ${to}`;
            }

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-2 text-sm font-medium text-gray-900">${subsegment.name}</td>
                    <td class="px-4 py-2 text-sm text-gray-600">${propertyTypes}</td>
                    <td class="px-4 py-2 text-sm text-gray-600">${areaText}</td>
                    <td class="px-4 py-2 text-sm text-gray-600">${floorsText}</td>
                    <td class="px-4 py-2 text-sm text-gray-600">${priceText}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="p-4 bg-gray-50 border-t border-gray-200">
                <h4 class="text-sm font-medium text-gray-900 mb-3">Подсегменты:</h4>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 bg-white rounded-md shadow-sm border border-gray-300">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип недвижимости</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Площадь (м²)</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Этажи</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг колонки подсегментов
     */
    renderSubsegmentsColumn(data, type, row) {
        const count = row.stats?.subsegmentsCount || 0;
        
        if (count > 0) {
            return `<span class="text-gray-700 cursor-pointer hover:text-blue-600 expand-segment-subsegments" data-segment-id="${row.id}" title="Нажмите для просмотра подсегментов">
                <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
                ${count}
            </span>`;
        } else {
            return `<span class="text-gray-700">${count}</span>`;
        }
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
        return `
            <div class="flex space-x-2">
                <button class="edit-segment-btn inline-flex items-center px-3 py-1 text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors" 
                        data-action="edit-segment" data-segment-id="${row.id}">
                    ✏️ Редактировать
                </button>
                <button class="delete-segment-btn inline-flex items-center px-3 py-1 text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 transition-colors" 
                        data-action="delete-segment" data-segment-id="${row.id}">
                    🗑️ Удалить
                </button>
            </div>
        `;
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
        document.getElementById('saveSegmentBtn')?.removeEventListener('click', this.saveSegment);
        
        document.getElementById('segmentsPanelHeader')?.removeEventListener('click', this.toggleSegmentsPanel);
        
        // Очистка состояния
        this.segmentsState.expandedRows.clear();
        this.segmentsState.segments = [];
        this.segmentsState.selectedSegment = null;
        this.segmentsState.editingSegment = null;
        this.segmentsState.modalOpen = false;
        
        // Очистка графика
        if (this.areaDistributionChart) {
            this.areaDistributionChart.destroy();
            this.areaDistributionChart = null;
        }
        
        // Очистка состояния подсегментов
        this.subsegmentsState.subsegments = [];
        this.subsegmentsState.selectedSubsegment = null;
        this.subsegmentsState.editingSubsegment = null;
    }
    
    /**
     * Инициализация графика распределения площадей
     */
    initializeAreaDistributionChart() {
        try {
            const chartContainer = document.getElementById('areaDistributionChart');
            if (!chartContainer) {
                console.warn('⚠️ Контейнер графика не найден');
                return;
            }
            
            
            // Очищаем существующий график
            if (this.areaDistributionChart) {
                this.areaDistributionChart.destroy();
                this.areaDistributionChart = null;
            }
            
            // Получаем данные для графика
            const chartData = this.prepareChartData();
            
            const options = {
                title: {
                    text: 'Распределение площадей',
                    align: 'center',
                    style: {
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#374151'
                    }
                },
                series: chartData,
                chart: {
                    height: 350,
                    type: 'scatter',
                    zoom: {
                        enabled: true,
                        type: 'xy'
                    },
                    toolbar: {
                        show: true,
                        tools: {
                            download: true,
                            selection: true,
                            zoom: true,
                            zoomin: true,
                            zoomout: true,
                            pan: true,
                            reset: true
                        }
                    }
                },
                xaxis: {
                    tickAmount: 4,
                    title: {
                        text: 'Тип недвижимости',
                        style: {
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#6B7280'
                        }
                    }
                },
                yaxis: {
                    title: {
                        text: 'Площадь (м²)',
                        style: {
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#6B7280'
                        }
                    },
                    tickAmount: 15,
                    offsetY: 5,
                    labels: {
                        style: {
                            fontSize: '11px',
                            colors: '#6B7280'
                        }
                    }
                },
                colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'],
                markers: {
                    size: 6,
                    hover: {
                        size: 8
                    }
                },
                tooltip: {
                    theme: 'light',
                    x: {
                        formatter: function(val, opts) {
                            const categories = ['Студия', '1к', '2к', '3к', '4к+'];
                            return categories[val] || 'Неизвестно';
                        }
                    },
                    y: {
                        formatter: function(val) {
                            return val + ' м²';
                        }
                    }
                },
                legend: {
                    position: 'top',
                    horizontalAlign: 'center',
                    floating: false,
                    offsetY: -10,
                    fontSize: '12px'
                },
                grid: {
                    borderColor: '#f3f4f6',
                    strokeDashArray: 3
                }
            };
            
            this.areaDistributionChart = new ApexCharts(chartContainer, options);
            this.areaDistributionChart.render();
            
            console.log('✅ График распределения площадей инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации графика:', error);
        }
    }
    
    /**
     * Подготовка данных для графика из объявлений
     */
    prepareChartData() {
        try {
            // Получаем текущий редактируемый сегмент
            const currentSegment = this.segmentsState.editingSegment;
            if (!currentSegment) {
                console.warn('⚠️ Нет текущего сегмента для графика');
                return [];
            }
            
            console.log('🔍 Текущий сегмент для графика:', {
                id: currentSegment.id,
                name: currentSegment.name,
                filters: currentSegment.filters,
                hasFilters: !!currentSegment.filters,
                filtersKeys: currentSegment.filters ? Object.keys(currentSegment.filters) : 'нет'
            });
            
            // Получаем адреса из состояния
            const addresses = this.dataState.getState('addresses') || [];
            console.log(`🔍 Всего адресов в области: ${addresses.length}`);
            
            // Фильтруем адреса по сегменту
            const segmentAddresses = this.filterAddressesBySegment(addresses, currentSegment);
            console.log(`📍 Адресов в сегменте "${currentSegment.name}": ${segmentAddresses.length}`);
            
            // Получаем все объявления из состояния
            const allListings = this.dataState.getState('listings') || [];
            console.log(`📋 Всего объявлений в области: ${allListings.length}`);
            
            // Фильтруем объявления только для адресов сегмента
            // Сегмент определяется адресами, поэтому все объявления этих адресов включаются
            const filteredListings = allListings.filter(listing => {
                return listing.address_id && segmentAddresses.some(addr => addr.id === listing.address_id);
            });
            console.log(`🎯 Объявлений в сегменте: ${filteredListings.length}`);
            
            // Группируем данные по типам недвижимости
            const seriesData = {
                'Студия': [],
                '1к': [],
                '2к': [],
                '3к': [],
                '4к+': []
            };
            
            filteredListings.forEach((listing) => {
                if (!listing.area_total || !listing.property_type) {
                    return;
                }
                
                let category = 'Студия';
                const roomsCount = this.extractRoomsCount(listing.property_type);
                
                if (roomsCount === 0) {
                    category = 'Студия';
                } else if (roomsCount === 1) {
                    category = '1к';
                } else if (roomsCount === 2) {
                    category = '2к';
                } else if (roomsCount === 3) {
                    category = '3к';
                } else if (roomsCount >= 4) {
                    category = '4к+';
                }
                
                // Добавляем точку данных [x, y] где x - позиция категории, y - площадь
                const categoryIndex = ['Студия', '1к', '2к', '3к', '4к+'].indexOf(category);
                const dataPoint = [categoryIndex, listing.area_total];
                seriesData[category].push(dataPoint);  
            });
            
            // Преобразуем в формат ApexCharts с проверкой на пустые данные
            const categories = ['Студия', '1к', '2к', '3к', '4к+'];
            const series = categories.map((category, index) => ({
                name: category,
                data: seriesData[category].length > 0 ? seriesData[category] : [[index, 0]]
            }));
            
            return series;
            
        } catch (error) {
            console.error('❌ Ошибка подготовки данных графика:', error);
            // Возвращаем пример данных в случае ошибки
            return [
                { name: "Студия", data: [[0, 23], [0, 22], [0, 24]] },
                { name: "1к", data: [[1, 29], [1, 31], [1, 32]] },
                { name: "2к", data: [[2, 43], [2, 44], [2, 45]] },
                { name: "3к", data: [[3, 64], [3, 63], [3, 60]] },
                { name: "4к+", data: [[4, 84], [4, 88], [4, 90]] }
            ];
        }
    }
    
    /**
     * Извлечение количества комнат из property_type
     */
    extractRoomsCount(propertyType) {
        if (!propertyType) return 0;
        
        const type = propertyType.toLowerCase();
        
        if (type.includes('студия') || type.includes('studio')) {
            return 0;
        }
        
        // Ищем цифры в строке
        const match = type.match(/(\d+)/);
        if (match) {
            const rooms = parseInt(match[1]);
            return rooms;
        }
        
        // Если не нашли цифры, пытаемся определить по ключевым словам
        if (type.includes('однокомнатная') || type.includes('1к') || type.includes('1-к')) return 1;
        if (type.includes('двухкомнатная') || type.includes('2к') || type.includes('2-к')) return 2;
        if (type.includes('трехкомнатная') || type.includes('3к') || type.includes('3-к')) return 3;
        if (type.includes('четырехкомнатная') || type.includes('4к') || type.includes('4-к')) return 4;
        
        return 0; // По умолчанию студия
    }
    
    /**
     * Проверка соответствия объявления фильтрам сегмента
     */
    listingMatchesSegmentFilters(listing, filters) {
        try {
            if (!listing || !filters) return true;
            
            // Проверяем тип недвижимости (тип дома: дом/квартира/коммерческая)
            if (filters.type && filters.type.length > 0) {
                const listingType = listing.property_type?.toLowerCase() || '';
                const matchesType = filters.type.some(filterType => {
                    switch (filterType) {
                        case 'house':
                            return listingType.includes('дом') || listingType.includes('house');
                        case 'apartment':
                            return listingType.includes('квартира') || listingType.includes('apartment') || 
                                   listingType.includes('студия') || listingType.includes('к');
                        case 'commercial':
                            return listingType.includes('коммерч') || listingType.includes('commercial');
                        default:
                            return listingType.includes(filterType);
                    }
                });
                if (!matchesType) return false;
            }
            
            // Проверяем количество комнат (property_type: 1k, 2k, 3k и т.д.)
            if (filters.property_type && filters.property_type.length > 0) {
                if (!filters.property_type.includes(listing.property_type)) {
                    return false;
                }
            }
            
            // Проверяем этаж
            if (filters.floors_from || filters.floors_to) {
                const floor = listing.floor;
                if (floor) {
                    if (filters.floors_from && floor < filters.floors_from) return false;
                    if (filters.floors_to && floor > filters.floors_to) return false;
                }
            }
            
            // Проверяем год постройки
            if (filters.build_year_from || filters.build_year_to) {
                const year = listing.build_year;
                if (year) {
                    if (filters.build_year_from && year < filters.build_year_from) return false;
                    if (filters.build_year_to && year > filters.build_year_to) return false;
                }
            }
            
            // Проверяем общую площадь
            if (filters.area_from || filters.area_to) {
                const area = listing.area_total || listing.area;
                if (area) {
                    if (filters.area_from && area < filters.area_from) return false;
                    if (filters.area_to && area > filters.area_to) return false;
                }
            }
            
            // Проверяем диапазон этажа
            if (filters.floor_from || filters.floor_to) {
                const floor = listing.floor;
                if (floor) {
                    if (filters.floor_from && floor < filters.floor_from) return false;  
                    if (filters.floor_to && floor > filters.floor_to) return false;
                }
            }
            
            // Проверяем цену (если нужно для будущих фильтров)
            if (filters.price_from || filters.price_to) {
                const price = listing.price;
                if (price) {
                    if (filters.price_from && price < filters.price_from) return false;
                    if (filters.price_to && price > filters.price_to) return false;
                }
            }
            
            return true;
            
        } catch (error) {
            console.warn('Ошибка проверки фильтров объявления:', error);
            return true;
        }
    }
    
    /**
     * Обновление данных графика при изменении фильтров
     */
    updateAreaDistributionChart() {
        if (!this.areaDistributionChart) return;
        
        try {
            console.log('🔄 Обновление данных графика');
            const chartData = this.prepareChartData();
            this.areaDistributionChart.updateSeries(chartData);
            console.log('✅ График обновлен');
        } catch (error) {
            console.error('❌ Ошибка обновления графика:', error);
        }
    }
    
    /**
     * Инициализация фильтра подсегментов
     */
    initializeSubsegmentFilter() {
        try {
            console.log('🔄 Инициализация фильтра подсегментов');
            
            // Привязываем обработчики событий
            this.bindSubsegmentEvents();
            
            // Инициализируем SlimSelect для типа недвижимости
            this.initializeSubsegmentSlimSelects();
            
            console.log('✅ Фильтр подсегментов инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации фильтра подсегментов:', error);
        }
    }
    
    /**
     * Инициализация SlimSelect для подсегментов
     */
    initializeSubsegmentSlimSelects() {
        try {
            const propertyTypeSelect = document.getElementById('subsegmentPropertyType');
            if (propertyTypeSelect && !propertyTypeSelect.slimSelect) {
                propertyTypeSelect.slimSelect = new SlimSelect({
                    select: propertyTypeSelect,
                    settings: {
                        allowDeselect: true,
                        closeOnSelect: false
                    }
                });
                console.log('✅ SlimSelect для типа недвижимости подсегмента инициализирован');
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации SlimSelect подсегментов:', error);
        }
    }
    
    /**
     * Привязка событий для подсегментов
     */
    bindSubsegmentEvents() {
        // Проверяем, что события еще не привязаны
        if (this.subsegmentEventsInitialized) {
            return;
        }
        
        // Выбор подсегмента из списка
        document.getElementById('subsegmentSelect')?.addEventListener('change', (e) => {
            this.onSubsegmentSelect(e.target.value);
        });
        
        // Сохранение подсегмента
        document.getElementById('saveSubsegmentBtn')?.addEventListener('click', () => {
            this.saveSubsegment();
        });
        
        // Удаление подсегмента
        document.getElementById('deleteSubsegmentBtn')?.addEventListener('click', () => {
            this.deleteSubsegment();
        });
        
        // Снятие выделения при клике вне строк таблицы
        document.getElementById('subsegmentsTable')?.addEventListener('click', (e) => {
            // Если клик не по строке таблицы, снимаем выделение
            if (!e.target.closest('tbody tr[data-subsegment-id]')) {
                this.clearSubsegmentSelection();
            }
        });
        
        // Обновление названия при изменении полей
        const updateNameHandler = () => {
            this.updateSubsegmentName();
        };
        
        document.getElementById('subsegmentPropertyType')?.addEventListener('change', updateNameHandler);
        document.getElementById('subsegmentAreaFrom')?.addEventListener('input', updateNameHandler);
        document.getElementById('subsegmentAreaTo')?.addEventListener('input', updateNameHandler);
        document.getElementById('subsegmentFloorFrom')?.addEventListener('input', updateNameHandler);
        document.getElementById('subsegmentFloorTo')?.addEventListener('input', updateNameHandler);
        document.getElementById('subsegmentPriceFrom')?.addEventListener('input', updateNameHandler);
        document.getElementById('subsegmentPriceTo')?.addEventListener('input', updateNameHandler);
        
        // Отмечаем, что события инициализированы
        this.subsegmentEventsInitialized = true;
        console.log('✅ События подсегментов инициализированы');
    }
    
    /**
     * Обработка выбора подсегмента
     */
    async onSubsegmentSelect(subsegmentId) {
        try {
            if (!subsegmentId) {
                // Создание нового подсегмента
                this.clearSubsegmentForm();
                this.subsegmentsState.editingSubsegment = null;
                document.getElementById('deleteSubsegmentBtn').disabled = true;
                // Обновляем график без выделения подсегмента
                this.updateChartForSubsegment(null);
                return;
            }
            
            // Редактирование существующего подсегмента
            const subsegment = this.subsegmentsState.subsegments.find(s => s.id === subsegmentId);
            if (subsegment) {
                this.fillSubsegmentForm(subsegment);
                this.subsegmentsState.editingSubsegment = subsegment;
                document.getElementById('deleteSubsegmentBtn').disabled = false;
                // Обновляем график с выделением выбранного подсегмента
                this.updateChartForSubsegment(subsegmentId);
            }
            
        } catch (error) {
            console.error('❌ Ошибка выбора подсегмента:', error);
        }
    }
    
    /**
     * Загрузка подсегментов для текущего сегмента
     */
    async loadSubsegments() {
        try {
            const currentSegment = this.segmentsState.editingSegment;
            if (!currentSegment) {
                this.subsegmentsState.subsegments = [];
                this.updateSubsegmentSelect();
                return;
            }
            
            // Загружаем подсегменты из базы данных
            const subsegments = await window.db.getAll('subsegments');
            this.subsegmentsState.subsegments = subsegments.filter(s => s.segment_id === currentSegment.id);
            
            console.log(`🔍 Загружено подсегментов: ${this.subsegmentsState.subsegments.length}`);
            
            // Обновляем селект и таблицу
            this.updateSubsegmentSelect();
            this.updateSubsegmentsTable();
            
        } catch (error) {
            console.error('❌ Ошибка загрузки подсегментов:', error);
        }
    }
    
    /**
     * Обновление селекта подсегментов
     */
    updateSubsegmentSelect() {
        const select = document.getElementById('subsegmentSelect');
        if (!select) return;
        
        // Сохраняем текущий выбор
        const currentValue = select.value;
        
        // Очищаем опции
        select.innerHTML = '<option value="">Создать новый подсегмент</option>';
        
        // Добавляем подсегменты
        this.subsegmentsState.subsegments.forEach(subsegment => {
            const option = document.createElement('option');
            option.value = subsegment.id;
            option.textContent = subsegment.name;
            select.appendChild(option);
        });
        
        // Восстанавливаем выбор
        if (currentValue) {
            select.value = currentValue;
        }
    }
    
    /**
     * Сохранение подсегмента
     */
    async saveSubsegment() {
        try {
            const currentSegment = this.segmentsState.editingSegment;
            if (!currentSegment) {
                this.progressManager.showError('Сначала сохраните сегмент');
                return;
            }
            
            // Получаем данные формы
            const formData = this.getSubsegmentFormData();
            
            // Валидация
            if (!formData.name.trim()) {
                this.progressManager.showError('Название подсегмента не может быть пустым');
                return;
            }
            
            let subsegment;
            const isEditing = this.subsegmentsState.editingSubsegment !== null;
            
            if (isEditing) {
                // Обновляем существующий подсегмент
                subsegment = {
                    ...this.subsegmentsState.editingSubsegment,
                    ...formData,
                    updated_at: new Date()
                };
                
                await window.db.update('subsegments', subsegment);
                console.log('✅ Подсегмент обновлен:', subsegment.id);
                
            } else {
                // Создаем новый подсегмент
                subsegment = {
                    id: 'subseg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    segment_id: currentSegment.id,
                    ...formData,
                    created_at: new Date(),
                    updated_at: new Date()
                };
                
                await window.db.add('subsegments', subsegment);
                console.log('✅ Подсегмент создан:', subsegment.id);
            }
            
            // Обновляем состояние
            this.subsegmentsState.editingSubsegment = subsegment;
            await this.loadSubsegments();
            
            // Обновляем таблицу сегментов (количество подсегментов могло измениться)
            await this.updateSegmentsData();
            
            // Устанавливаем созданный/обновленный подсегмент как выбранный
            document.getElementById('subsegmentSelect').value = subsegment.id;
            document.getElementById('deleteSubsegmentBtn').disabled = false;
            
            this.progressManager.showSuccess(
                isEditing ? 'Подсегмент обновлен' : 'Подсегмент создан'
            );
            
            // Уведомляем об изменении подсегмента
            this.eventBus.emit(
                isEditing ? CONSTANTS.EVENTS.SUBSEGMENT_UPDATED : CONSTANTS.EVENTS.SUBSEGMENT_CREATED,
                {
                    subsegment,
                    timestamp: new Date()
                }
            );
            
        } catch (error) {
            console.error('❌ Ошибка сохранения подсегмента:', error);
            this.progressManager.showError('Ошибка сохранения подсегмента');
        }
    }
    
    /**
     * Удаление подсегмента
     */
    async deleteSubsegment() {
        try {
            const subsegment = this.subsegmentsState.editingSubsegment;
            if (!subsegment) return;
            
            if (confirm(`Удалить подсегмент "${subsegment.name}"?`)) {
                await window.db.delete('subsegments', subsegment.id);
                
                // Обновляем состояние
                this.clearSubsegmentForm();
                this.subsegmentsState.editingSubsegment = null;
                await this.loadSubsegments();
                
                // Обновляем таблицу сегментов (количество подсегментов могло измениться) 
                await this.updateSegmentsData();
                
                // Сбрасываем селект
                document.getElementById('subsegmentSelect').value = '';
                document.getElementById('deleteSubsegmentBtn').disabled = true;
                
                this.progressManager.showSuccess('Подсегмент удален');
                console.log('✅ Подсегмент удален:', subsegment.id);
                
                // Уведомляем об удалении подсегмента
                this.eventBus.emit(CONSTANTS.EVENTS.SUBSEGMENT_DELETED, {
                    subsegment,
                    timestamp: new Date()
                });
            }
            
        } catch (error) {
            console.error('❌ Ошибка удаления подсегмента:', error);
            this.progressManager.showError('Ошибка удаления подсегмента');
        }
    }
    
    /**
     * Получение данных формы подсегмента
     */
    getSubsegmentFormData() {
        const propertyTypeSelect = document.getElementById('subsegmentPropertyType');
        const propertyTypes = propertyTypeSelect?.slimSelect?.getSelected() || [];
        
        return {
            name: document.getElementById('subsegmentName')?.value?.trim() || '',
            filters: {
                property_type: propertyTypes,
                area_from: parseInt(document.getElementById('subsegmentAreaFrom')?.value) || null,
                area_to: parseInt(document.getElementById('subsegmentAreaTo')?.value) || null,
                floor_from: parseInt(document.getElementById('subsegmentFloorFrom')?.value) || null,
                floor_to: parseInt(document.getElementById('subsegmentFloorTo')?.value) || null,
                price_from: parseInt(document.getElementById('subsegmentPriceFrom')?.value) || null,
                price_to: parseInt(document.getElementById('subsegmentPriceTo')?.value) || null
            }
        };
    }
    
    /**
     * Заполнение формы подсегмента
     */
    fillSubsegmentForm(subsegment) {
        try {
            // Основные поля
            document.getElementById('subsegmentId').value = subsegment.id || '';
            document.getElementById('subsegmentSegmentId').value = subsegment.segment_id || '';
            document.getElementById('subsegmentName').value = subsegment.name || '';
            
            // Фильтры
            const filters = subsegment.filters || {};
            
            // Тип недвижимости
            const propertyTypeSelect = document.getElementById('subsegmentPropertyType');
            if (propertyTypeSelect?.slimSelect) {
                propertyTypeSelect.slimSelect.setSelected(filters.property_type || []);
            }
            
            // Площадь
            document.getElementById('subsegmentAreaFrom').value = filters.area_from || '';
            document.getElementById('subsegmentAreaTo').value = filters.area_to || '';
            
            // Этажи
            document.getElementById('subsegmentFloorFrom').value = filters.floor_from || '';
            document.getElementById('subsegmentFloorTo').value = filters.floor_to || '';
            
            // Цена
            document.getElementById('subsegmentPriceFrom').value = filters.price_from || '';
            document.getElementById('subsegmentPriceTo').value = filters.price_to || '';
            
        } catch (error) {
            console.error('❌ Ошибка заполнения формы подсегмента:', error);
        }
    }
    
    /**
     * Очистка формы подсегмента
     */
    clearSubsegmentForm() {
        document.getElementById('subsegmentId').value = '';
        document.getElementById('subsegmentSegmentId').value = '';
        document.getElementById('subsegmentName').value = '';
        
        // Очищаем SlimSelect
        const propertyTypeSelect = document.getElementById('subsegmentPropertyType');
        if (propertyTypeSelect?.slimSelect) {
            propertyTypeSelect.slimSelect.setSelected([]);
        }
        
        // Очищаем поля
        document.getElementById('subsegmentAreaFrom').value = '';
        document.getElementById('subsegmentAreaTo').value = '';
        document.getElementById('subsegmentFloorFrom').value = '';
        document.getElementById('subsegmentFloorTo').value = '';
        document.getElementById('subsegmentPriceFrom').value = '';
        document.getElementById('subsegmentPriceTo').value = '';
    }
    
    /**
     * Обновление названия подсегмента
     */
    updateSubsegmentName() {
        try {
            const formData = this.getSubsegmentFormData();
            const name = this.generateSubsegmentName(formData.filters);
            document.getElementById('subsegmentName').value = name;
        } catch (error) {
            console.warn('Ошибка обновления названия подсегмента:', error);
        }
    }
    
    /**
     * Генерация названия подсегмента
     */
    generateSubsegmentName(filters) {
        const parts = [];
        
        // Типы недвижимости
        if (filters.property_type && filters.property_type.length > 0) {
            const typeNames = filters.property_type.map(type => {
                switch (type) {
                    case 'studio': return 'Ст';
                    case '1k': return '1к';
                    case '2k': return '2к';
                    case '3k': return '3к';
                    case '4k': return '4к+';
                    default: return type;
                }
            });
            parts.push(`ТН[${typeNames.join(',')}]`);
        }
        
        // Площадь
        if (filters.area_from || filters.area_to) {
            const from = filters.area_from || 1;
            const to = filters.area_to || '∞';
            parts.push(`П[${from}-${to}]`);
        }
        
        // Этажи
        if (filters.floor_from || filters.floor_to) {
            const from = filters.floor_from || 1;
            const to = filters.floor_to || 100;
            parts.push(`Этажи [${from} - ${to}]`);
        }
        
        // Цена
        if (filters.price_from || filters.price_to) {
            const from = filters.price_from ? this.formatPrice(filters.price_from) : '1';
            const to = filters.price_to ? this.formatPrice(filters.price_to) : '∞';
            parts.push(`Цена [${from} - ${to}]`);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Новый подсегмент';
    }
    
    /**
     * Форматирование цены
     */
    formatPrice(price) {
        if (price >= 1000000) {
            return (price / 1000000).toFixed(1).replace('.0', '') + ' млн';
        } else if (price >= 1000) {
            return (price / 1000).toFixed(0) + ' тыс';
        } else {
            return price.toString();
        }
    }
    
    /**
     * Обновление таблицы подсегментов
     */
    updateSubsegmentsTable() {
        const tbody = document.querySelector('#subsegmentsTable tbody');
        if (!tbody) return;
        
        // Очищаем таблицу
        tbody.innerHTML = '';
        
        // Добавляем строки
        this.subsegmentsState.subsegments.forEach(subsegment => {
            const row = this.createSubsegmentTableRow(subsegment);
            tbody.appendChild(row);
        });
        
        if (this.subsegmentsState.subsegments.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">
                    Подсегменты не созданы
                </td>
            `;
            tbody.appendChild(row);
        }
    }
    
    /**
     * Форматирование типов недвижимости для отображения
     */
    formatPropertyTypes(propertyTypes) {
        if (!propertyTypes || !Array.isArray(propertyTypes) || propertyTypes.length === 0) {
            return 'Не указано';
        }

        const typeMap = {
            'studio': 'Студия',
            '1k': '1-комнатная',
            '2k': '2-комнатная', 
            '3k': '3-комнатная',
            '4k': '4+ комнатная'
        };

        return propertyTypes.map(type => typeMap[type] || type).join(', ');
    }

    /**
     * Создание строки таблицы подсегмента
     */
    createSubsegmentTableRow(subsegment) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 cursor-pointer';
        row.dataset.subsegmentId = subsegment.id;
        
        // Форматируем данные
        const filters = subsegment.filters || {};
        const propertyTypes = this.formatPropertyTypes(filters.property_type) || 'Не указано';
        
        let areaText = 'Не указано';
        if (filters.area_from || filters.area_to) {
            const from = filters.area_from || 1;
            const to = filters.area_to || '∞';
            areaText = `${from} - ${to}`;
        }
        
        let floorsText = 'Не указано';
        if (filters.floor_from || filters.floor_to) {
            const from = filters.floor_from || 1;
            const to = filters.floor_to || '∞';
            floorsText = `${from} - ${to}`;
        }
        
        let priceText = 'Не указано';
        if (filters.price_from || filters.price_to) {
            const from = filters.price_from ? this.formatPrice(filters.price_from) : '1';
            const to = filters.price_to ? this.formatPrice(filters.price_to) : '∞';
            priceText = `${from} - ${to}`;
        }
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                ${subsegment.name}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${propertyTypes}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${areaText}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${floorsText}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${priceText}
            </td>
        `;
        
        // Обработчик клика для выделения строки
        row.addEventListener('click', () => {
            this.selectSubsegmentInTable(subsegment.id);
        });
        
        return row;
    }
    
    /**
     * Выделение подсегмента в таблице
     */
    selectSubsegmentInTable(subsegmentId) {
        // Убираем выделение с других строк
        document.querySelectorAll('#subsegmentsTable tbody tr').forEach(row => {
            row.classList.remove('bg-purple-50', 'border-purple-200');
        });
        
        // Выделяем выбранную строку
        const selectedRow = document.querySelector(`#subsegmentsTable tbody tr[data-subsegment-id="${subsegmentId}"]`);
        if (selectedRow) {
            selectedRow.classList.add('bg-purple-50', 'border-purple-200');
        }
        
        // Обновляем график с выделением
        this.highlightSubsegmentOnChart(subsegmentId);
        
        // Сохраняем выбранный подсегмент
        this.subsegmentsState.selectedSubsegment = subsegmentId;
    }

    /**
     * Снятие выделения подсегмента
     */
    clearSubsegmentSelection() {
        // Убираем выделение со всех строк
        document.querySelectorAll('#subsegmentsTable tbody tr').forEach(row => {
            row.classList.remove('bg-purple-50', 'border-purple-200');
        });
        
        // Сбрасываем выделение на графике
        this.highlightSubsegmentOnChart(null);
        
        // Очищаем состояние
        this.subsegmentsState.selectedSubsegment = null;
    }
    
    /**
     * Получить цвет категории
     */
    getCategoryColor(category, opacity = 1) {
        const colors = {
            'Студия': `rgba(239, 68, 68, ${opacity})`, // red-500
            '1к': `rgba(245, 158, 11, ${opacity})`, // amber-500
            '2к': `rgba(234, 179, 8, ${opacity})`, // yellow-500
            '3к': `rgba(34, 197, 94, ${opacity})`, // green-500
            '4к+': `rgba(59, 130, 246, ${opacity})` // blue-500
        };
        return colors[category] || `rgba(107, 114, 128, ${opacity})`;
    }

    /**
     * Проверка соответствия объявления фильтрам подсегмента
     */
    listingMatchesSubsegmentFilters(listing, filters) {
        try {
            if (!filters) return true;

            // Проверка типа недвижимости
            if (filters.property_type && filters.property_type.length > 0) {
                if (!filters.property_type.includes(listing.property_type)) {
                    return false;
                }
            }

            // Проверка диапазона площади
            if (filters.area_from && listing.area_total < filters.area_from) {
                return false;
            }
            if (filters.area_to && listing.area_total > filters.area_to) {
                return false;
            }

            // Проверка диапазона этажа
            if (filters.floor_from && listing.floor < filters.floor_from) {
                return false;
            }
            if (filters.floor_to && listing.floor > filters.floor_to) {
                return false;
            }

            // Проверка диапазона цены
            if (filters.price_from && listing.price < filters.price_from) {
                return false;
            }
            if (filters.price_to && listing.price > filters.price_to) {
                return false;
            }

            return true;
        } catch (error) {
            console.error('❌ Ошибка проверки фильтров подсегмента:', error);
            return false;
        }
    }

    /**
     * Создание серий с выделением подсегмента
     */
    createHighlightedSeries(baseChartData, listings, selectedSubsegment) {
        try {
            // Создаем новые серии с разделением на обычные и выделенные точки
            const highlightedSeries = [];
            
            // Для каждой категории создаем две серии: обычную и выделенную
            const categories = ['Студия', '1к', '2к', '3к', '4к+'];
            
            categories.forEach((category, categoryIndex) => {
                // Находим базовую серию для этой категории
                const baseSeries = baseChartData.find(series => series.name === category);
                if (!baseSeries || !baseSeries.data.length) return;
                
                const normalPoints = [];
                const highlightedPoints = [];
                
                // Проходим по всем точкам данных и определяем, какие выделить
                baseSeries.data.forEach(point => {
                    if (point[0] === categoryIndex && point[1] > 0) {
                        // Находим объявление с такой же площадью в этой категории
                        const matchingListing = listings.find(listing => {
                            if (!listing.area_total || !listing.property_type) return false;
                            
                            const roomsCount = this.extractRoomsCount(listing.property_type);
                            let listingCategory = 'Студия';
                            
                            if (roomsCount === 0) listingCategory = 'Студия';
                            else if (roomsCount === 1) listingCategory = '1к';
                            else if (roomsCount === 2) listingCategory = '2к';
                            else if (roomsCount === 3) listingCategory = '3к';
                            else if (roomsCount >= 4) listingCategory = '4к+';
                            
                            return listingCategory === category && listing.area_total === point[1];
                        });
                        
                        if (matchingListing && this.listingMatchesSubsegmentFilters(matchingListing, selectedSubsegment.filters)) {
                            highlightedPoints.push(point);
                        } else {
                            normalPoints.push(point);
                        }
                    }
                });
                
                // Добавляем обычную серию (затемненную)
                if (normalPoints.length > 0) {
                    highlightedSeries.push({
                        name: category,
                        data: normalPoints,
                        color: this.getCategoryColor(category, 0.3) // Полупрозрачный
                    });
                }
                
                // Добавляем выделенную серию (фиолетовым цветом)
                if (highlightedPoints.length > 0) {
                    highlightedSeries.push({
                        name: `${category} (выделено)`,
                        data: highlightedPoints,
                        color: '#8B5CF6' // Фиолетовый цвет
                    });
                }
                
                // Если нет данных, добавляем пустую серию
                if (normalPoints.length === 0 && highlightedPoints.length === 0) {
                    highlightedSeries.push({
                        name: category,
                        data: [[categoryIndex, 0]]
                    });
                }
            });
            
            return highlightedSeries;
            
        } catch (error) {
            console.error('❌ Ошибка создания выделенных серий:', error);
            return baseChartData;
        }
    }

    /**
     * Выделение подсегмента на графике
     */
    highlightSubsegmentOnChart(subsegmentId) {
        try {
            if (!this.areaDistributionChart) {
                console.warn('⚠️ График не инициализирован');
                return;
            }

            // Получаем базовые данные графика
            const baseChartData = this.prepareChartData();
            
            if (!subsegmentId) {
                // Если подсегмент не выбран, показываем обычные данные
                this.areaDistributionChart.updateSeries(baseChartData);
                return;
            }

            // Найдем выбранный подсегмент
            const selectedSubsegment = this.subsegmentsState.subsegments.find(s => s.id === subsegmentId);
            if (!selectedSubsegment) {
                console.warn('⚠️ Подсегмент не найден:', subsegmentId);
                return;
            }

            // Получаем текущий сегмент, адреса и объявления
            const currentSegment = this.segmentsState.editingSegment;
            if (!currentSegment) {
                console.warn('⚠️ Нет текущего сегмента для выделения');
                return;
            }
            
            const addresses = this.dataState.getState('addresses') || [];
            const allListings = this.dataState.getState('listings') || [];
            
            // Фильтруем адреса по сегменту
            const segmentAddresses = this.filterAddressesBySegment(addresses, currentSegment);
            
            // Получаем объявления только для адресов сегмента
            const segmentListings = allListings.filter(listing => {
                return listing.address_id && segmentAddresses.some(addr => addr.id === listing.address_id);
            });
            
            // Дополнительно фильтруем по фильтрам сегмента
            const filteredListings = segmentListings.filter(listing => {
                return this.listingMatchesSegmentFilters(listing, currentSegment.filters || {});
            });

            // Создаем новые серии с выделением
            const highlightedSeries = this.createHighlightedSeries(baseChartData, filteredListings, selectedSubsegment);
            
            // Обновляем график
            this.areaDistributionChart.updateSeries(highlightedSeries);
            
        } catch (error) {
            console.error('❌ Ошибка выделения подсегмента на графике:', error);
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentsManager;
} else {
    window.SegmentsManager = SegmentsManager;
}