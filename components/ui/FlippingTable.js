/**
 * FlippingTable - компонент таблицы для отчёта доходности флиппинг
 * Копирует структуру таблицы дубликатов с заменой колонки "Фильтр" на "Доходность"
 * Следует архитектуре v0.1
 */
class FlippingTable {
    constructor(tableElementId, errorHandlingService, configService, dataState = null) {
        this.tableElementId = tableElementId;
        this.errorHandlingService = errorHandlingService;
        this.configService = configService;
        this.dataState = dataState;
        
        this.tableElement = document.getElementById(tableElementId);
        this.dataTable = null;
        this.objects = [];
        this.addresses = []; // Кэш адресов для helper методов
        
        this.debugEnabled = false;
        this.loadDebugSettings();
    }

    /**
     * Загрузка настроек отладки
     */
    async loadDebugSettings() {
        try {
            const debugConfig = await this.configService.get('debug.enabled');
            this.debugEnabled = debugConfig === true;
        } catch (error) {
            this.debugEnabled = false;
        }
    }

    /**
     * Загрузка адресов для helper методов
     */
    async loadAddresses() {
        try {
            this.addresses = await window.db.getAll('addresses');
        } catch (error) {
            console.error('Ошибка загрузки адресов для FlippingTable:', error);
            this.addresses = [];
        }
    }

    /**
     * Получение адресов в области (по аналогии с DuplicatesManager)
     */
    async getAddressesInArea() {
        try {
            // Пробуем несколько способов получить currentArea
            let currentArea = null;
            
            // Используем тот же подход, что и в DuplicatesManager - прямое обращение к dataState
            if (this.dataState && this.dataState.getState) {
                currentArea = this.dataState.getState('currentArea');
            } else if (window.areaPage && window.areaPage.dataState && window.areaPage.dataState.getState) {
                currentArea = window.areaPage.dataState.getState('currentArea');
            } else if (window.duplicatesManager && window.duplicatesManager.dataState && window.duplicatesManager.dataState.getState) {
                currentArea = window.duplicatesManager.dataState.getState('currentArea');
            }
            
            // Дополнительная проверка - пробуем получить напрямую
            if (!currentArea && window.areaPage && window.areaPage.currentArea) {
                currentArea = window.areaPage.currentArea;
            }

            
            // Проверяем тип currentArea и при необходимости создаем MapAreaModel
            if (currentArea) {
                
                // Если currentArea не является MapAreaModel, создаем его
                if (!(currentArea instanceof window.MapAreaModel) && window.MapAreaModel) {
                    currentArea = new window.MapAreaModel(currentArea);
                }
            }

            if (!currentArea || !currentArea.polygon) {
                return []; // Возвращаем пустой массив, если нет области
            }
            
            // Получаем все адреса из базы данных (как в DuplicatesManager)
            const allAddresses = await window.db.getAll('addresses');
            
            
            // Фильтруем адреса, которые входят в полигон области
            let invalidCount = 0;
            let checkedCount = 0;
            
            const areaAddresses = allAddresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    invalidCount++;
                    return false;
                }
                
                checkedCount++;
                
                // Используем AddressModel для проверки принадлежности к области
                if (window.AddressModel) {
                    const addressModel = new window.AddressModel(address);
                    const belongs = addressModel.belongsToMapArea(currentArea);
                    return belongs;
                }
                
                // Fallback: простая проверка точки в полигоне
                const result = this.isPointInPolygon([address.coordinates.lat, address.coordinates.lng], currentArea.polygon);
                return result;
            });
            
            
            return areaAddresses;
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка получения адресов в области:', error);
            return []; // В случае ошибки возвращаем пустой массив
        }
    }

    /**
     * Проверка точки в полигоне (fallback метод)
     */
    isPointInPolygon(point, polygon) {
        try {
            const x = point[0], y = point[1];
            let inside = false;
            
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i][0], yi = polygon[i][1];
                const xj = polygon[j][0], yj = polygon[j][1];
                
                if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            
            return inside;
        } catch (error) {
            return false;
        }
    }

    /**
     * Получение названия адреса по ID
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses.length) return null;
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address : null;
    }

    /**
     * Инициализация таблицы
     */
    async initialize() {
        try {
            if (!this.tableElement) {
                throw new Error(`Элемент таблицы с ID "${this.tableElementId}" не найден`);
            }

            // Загружаем адреса
            await this.loadAddresses();

            this.initializeDataTable();
            
            // Инициализируем фильтры
            await this.initializeFilters();

        } catch (error) {
            console.error('❌ FlippingTable: Ошибка инициализации:', error);
            throw error;
        }
    }

    /**
     * Инициализация DataTable
     */
    initializeDataTable() {
        if (this.dataTable) {
            this.dataTable.destroy();
        }

        // Точная копия инициализации из DuplicatesManager
        this.dataTable = $(this.tableElement).DataTable({
            language: {
                url: '../libs/datatables/ru.json'
            },
            pageLength: 10,
            ordering: true,
            searching: true,
            order: [[1, 'desc']], // Сортировка по доходности по убыванию (колонка 2)
            columnDefs: [
                {
                    targets: 0, // Колонка с чекбоксами
                    orderable: false,
                    searchable: false,
                    className: 'dt-body-center text-xs',
                    width: '40px',
                    render: function (data, type, row) {
                        return `<input type="checkbox" class="flipping-checkbox focus:ring-indigo-500 h-3 w-3 text-indigo-600 border-gray-300 rounded" data-id="${row.id}">`;
                    }
                },
                {
                    targets: 1, // Доходность (заменяет "Фильтр")
                    orderable: true,
                    searchable: false,
                    className: 'dt-body-center text-xs',
                    width: '80px'
                },
                {
                    targets: [3, 4], // Даты
                    className: 'text-xs'
                },
                {
                    targets: [5, 6, 7, 8], // Характеристики, адрес, цена, контакт  
                    className: 'text-xs'
                }
            ],
            columns: [
                // 0. Чекбокс (копия из DuplicatesManager)
                { 
                    data: null, 
                    title: '<input type="checkbox" id="selectAllFlippingObjects" class="focus:ring-indigo-500 h-3 w-3 text-indigo-600 border-gray-300 rounded">' 
                },
                // 1. Доходность (заменяет "Фильтр")
                { 
                    data: null, 
                    title: 'Доходность',
                    render: (data, type, row) => {
                        // Получаем рассчитанную доходность из объекта
                        const flippingProfitability = row.flippingProfitability;
                        
                        if (!flippingProfitability || !flippingProfitability.current) {
                            return `<div class="text-xs text-center cursor-pointer hover:bg-gray-50 p-1 rounded profitability-details" data-object-id="${row.id}">
                                <span class="text-gray-400">Ожидание..</span>
                            </div>`;
                        }

                        // Определяем цвет по уровню доходности (текущий сценарий)
                        const current = flippingProfitability.current;
                        const annualROI = current.annualROI || 0;
                        let colorClass = 'text-gray-600';
                        if (annualROI >= 20) colorClass = 'text-green-600';
                        else if (annualROI >= 10) colorClass = 'text-yellow-600';
                        else if (annualROI < 0) colorClass = 'text-red-600';

                        return `<div class="text-xs text-center cursor-pointer hover:bg-gray-50 p-1 rounded profitability-details" data-object-id="${row.id}">
                            <div class="${colorClass} font-medium">${annualROI.toFixed(1)}% год.</div>
                            <div class="text-gray-400" style="font-size: 10px;">прибыль: ${new Intl.NumberFormat('ru-RU').format(Math.round(current.netProfit || 0))} ₽</div>
                        </div>`;
                    }
                },
                // 2. Статус (копия из DuplicatesManager для объектов)
                { 
                    data: null, 
                    title: 'Статус',
                    render: (data, type, row) => {
                        const statusBadges = {
                            'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
                            'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
                            'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>'
                        };
                        
                        let html = statusBadges[row.status] || `<span class="text-xs text-gray-500">${row.status || 'Активный'}</span>`;
                        
                        // Показываем количество объявлений с кнопкой разворачивания
                        const listingsCount = row.listings_count || 0;
                        const activeCount = row.active_listings_count || 0;
                        if (listingsCount > 0) {
                            html += `<br><span class="text-xs text-nowrap text-gray-600 cursor-pointer hover:text-blue-600 expand-object-listings" data-object-id="${row.id}" title="Нажмите для просмотра объявлений">
                                <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                                Объявления: ${listingsCount} (${activeCount} акт.)
                            </span>`;
                        } else {
                            html += `<br><span class="text-xs text-nowrap text-gray-600">Объявления: ${listingsCount} (${activeCount} акт.)</span>`;
                        }
                        
                        return html;
                    }
                },
                // 3. Дата создания (копия из DuplicatesManager)
                { 
                    data: 'created_at', 
                    title: 'Создано',
                    render: (data, type, row) => {
                        const dateValue = data || row.created_at;
                        if (!dateValue) return '—';
                        const createdDate = new Date(dateValue);
                        
                        // Для сортировки возвращаем timestamp
                        if (type === 'sort' || type === 'type') {
                            return createdDate.getTime();
                        }
                        
                        const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                        
                        // Вычисляем экспозицию объекта
                        const updatedValue = row.updated_at;
                        const endDate = updatedValue ? new Date(updatedValue) : new Date();
                        const diffTime = Math.abs(endDate - createdDate);
                        const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        return `<div class="text-xs">
                            ${dateStr}<br>
                            <span class="text-gray-500" style="font-size: 10px;">эксп. ${exposureDays} дн.</span>
                        </div>`;
                    }
                },
                // 4. Дата обновления (копия из DuplicatesManager)
                { 
                    data: 'updated_at', 
                    title: 'Обновлено',
                    render: (data, type, row) => {
                        const dateValue = data || row.updated_at;
                        if (!dateValue) return '—';
                        const date = new Date(dateValue);
                        
                        // Для сортировки возвращаем timestamp
                        if (type === 'sort' || type === 'type') {
                            return date.getTime();
                        }
                        
                        const now = new Date();
                        const diffTime = Math.abs(now - date);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                        const daysAgo = diffDays === 1 ? '1 день назад' : `${diffDays} дн. назад`;
                        const color = diffDays > 7 ? 'text-red-600' : 'text-green-600';
                        
                        return `<div class="text-xs">
                            ${dateStr}<br>
                            <span class="${color}" style="font-size: 10px;">${daysAgo}</span>
                        </div>`;
                    }
                },
                // 5. Характеристики (копия из DuplicatesManager для объектов)
                { 
                    data: null, 
                    title: 'Характеристики',
                    render: (data, type, row) => {
                        const parts = [];
                        
                        // Тип недвижимости (правильная реализация как в дублях)
                        if (row.property_type) {
                            const types = {
                                'studio': 'Студия',
                                '1k': '1-к',
                                '2k': '2-к',
                                '3k': '3-к',
                                '4k+': '4-к+'
                            };
                            parts.push(types[row.property_type] || row.property_type);
                            parts.push('квартира');
                        }
                        
                        // Площади (правильные поля)
                        const areas = [];
                        if (row.area_total) areas.push(row.area_total);
                        if (row.area_living) areas.push(row.area_living);
                        if (row.area_kitchen) areas.push(row.area_kitchen);
                        if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
                        
                        // Этаж/этажность (поддержка обеих версий полей)
                        if (row.floor && row.total_floors) {
                            parts.push(`${row.floor}/${row.total_floors} эт.`);
                        } else if (row.floor && row.floors_total) {
                            // Поддержка старого поля floors_total для совместимости
                            parts.push(`${row.floor}/${row.floors_total} эт.`);
                        }
                        
                        const characteristicsText = parts.length > 0 ? parts.join(', ') : 'Не указано';
                        
                        return `<div class="text-xs text-gray-900 max-w-xs" title="${characteristicsText}">${characteristicsText}</div>`;
                    }
                },
                // 6. Адрес (копия из DuplicatesManager для объектов)
                { 
                    data: null, 
                    title: 'Адрес',
                    render: (data, type, row) => {
                        const addressFromDb = this.getAddressNameById(row.address_id);
                        const addressText = addressFromDb || 'Адрес не определен';
                        const addressClass = addressText === 'Адрес не определен' ? 'text-red-500' : 'text-blue-600 hover:text-blue-800 cursor-pointer';
                        
                        return `<div class="text-xs max-w-xs">
                            <div class="${addressClass} truncate clickable-object-address" data-object-id="${row.id}">${addressText}</div>
                        </div>`;
                    }
                },
                // 7. Цена (копия из DuplicatesManager для объектов)
                { 
                    data: null, 
                    title: 'Цена',
                    render: (data, type, row) => {
                        const priceValue = row.current_price || row.price;
                        
                        if (!priceValue) return '<div class="text-xs">—</div>';
                        
                        const price = priceValue.toLocaleString();
                        let pricePerMeter = '';
                        
                        if (row.price_per_meter) {
                            pricePerMeter = row.price_per_meter.toLocaleString();
                        } else if (priceValue && row.area) {
                            const calculated = Math.round(priceValue / row.area);
                            pricePerMeter = calculated.toLocaleString();
                        }
                        
                        return `<div class="text-xs">
                            <div class="text-green-600 font-medium">${price}</div>
                            ${pricePerMeter ? `<div class="text-gray-500">${pricePerMeter}</div>` : ''}
                        </div>`;
                    }
                },
                // 8. Контакт (копия из DuplicatesManager для объектов)
                { 
                    data: null, 
                    title: 'Контакт',
                    render: (data, type, row) => {
                        // Для объектов показываем статус собственника
                        const ownerStatus = row.owner_status || 'только от агентов';
                        const statusColor = ownerStatus === 'есть от собственника' ? 'text-green-600' :
                                           ownerStatus === 'было от собственника' ? 'text-yellow-600' :
                                           'text-gray-600';
                        
                        return `<div class="text-xs max-w-xs">
                            <div class="${statusColor} font-medium">${ownerStatus}</div>
                        </div>`;
                    }
                }
            ],
            // Обработчики событий
            drawCallback: () => this.onTableDraw(),
            initComplete: () => this.onTableInit()
        });
    }

    /**
     * Обновление данных таблицы
     */
    async updateData(objects, profitabilityParameters = {}) {
        try {
            this.objects = objects || [];
            this.profitabilityParameters = profitabilityParameters;
            

            if (!this.dataTable) {
                await this.initialize();
            }

            // Попытаемся загрузить адреса в фильтр при первом обновлении данных
            // Если currentArea недоступен сейчас, адреса можно будет загрузить позже через refreshAddressFilter()
            if (this.objects.length > 0) {
                await this.loadFlippingAddressFilter();
            }

            // Очищаем таблицу и добавляем новые данные
            this.dataTable.clear();
            
            if (this.objects.length > 0) {
                this.dataTable.rows.add(this.objects);
            }
            
            this.dataTable.draw();
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка в updateData:', error);
            throw error;
        }
    }

    /**
     * Обработчик отрисовки таблицы
     */
    onTableDraw() {
        // Настройка обработчиков событий для новых элементов
        this.setupRowEventHandlers();
    }

    /**
     * Обработчик инициализации таблицы
     */
    onTableInit() {
    }

    /**
     * Настройка обработчиков событий для строк таблицы
     */
    setupRowEventHandlers() {
        // Обработчик выбора всех чекбоксов
        const selectAllCheckbox = document.getElementById('selectAllFlippingObjects');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = this.tableElement.querySelectorAll('.flipping-checkbox');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = e.target.checked;
                });
            });
        }

        // Обработчики отдельных чекбоксов
        const checkboxes = this.tableElement.querySelectorAll('.flipping-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const allCheckboxes = this.tableElement.querySelectorAll('.flipping-checkbox');
                const checkedCount = this.tableElement.querySelectorAll('.flipping-checkbox:checked').length;
                
                if (selectAllCheckbox) {
                    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
                    selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
                }
            });
        });

        // Обработчик клика на колонку доходности
        $(document).off('click', '.profitability-details');
        $(document).on('click', '.profitability-details', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const objectId = $(e.currentTarget).data('object-id');
            if (!objectId) return;
            
            this.toggleProfitabilityDetails(objectId, e.currentTarget);
        });

        // Обработчик разворачивания объявлений (точная копия из DuplicatesManager)
        $(document).off('click', '.expand-object-listings');
        $(document).on('click', '.expand-object-listings', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const objectId = $(e.currentTarget).data('object-id');
            if (!objectId) return;
            
            this.toggleObjectListings(objectId, e.currentTarget);
        });
    }

    /**
     * Получение выбранных объектов
     */
    getSelectedObjects() {
        const selectedIds = [];
        const checkboxes = this.tableElement.querySelectorAll('.flipping-checkbox:checked');
        
        checkboxes.forEach(checkbox => {
            selectedIds.push(parseInt(checkbox.dataset.id));
        });
        
        return this.objects.filter(obj => selectedIds.includes(obj.id));
    }

    /**
     * Разворачивание/сворачивание объявлений объекта (точная копия из DuplicatesManager)
     */
    async toggleObjectListings(objectId, clickedElement) {
        try {
            const row = this.dataTable.row($(clickedElement).closest('tr'));
            const rowData = row.data();
            
            if (!rowData) return;
            
            if (row.child.isShown()) {
                // Сворачиваем
                row.child.hide();
                $(clickedElement).find('svg').removeClass('transform rotate-180');
            } else {
                // Разворачиваем - загружаем объявления
                const listings = await window.db.getByIndex('listings', 'object_id', objectId);
                
                if (!listings || listings.length === 0) {
                    this.showNoListingsMessage(row);
                    return;
                }
                
                const childContent = this.createListingsChildRow(listings, rowData);
                row.child(childContent, 'child-row').show();
                $(clickedElement).find('svg').addClass('transform rotate-180');
            }
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка разворачивания объявлений:', error);
        }
    }

    /**
     * Создание дочерней таблицы с объявлениями (по аналогии с DuplicatesManager)
     */
    createListingsChildRow(listings, parentObject) {
        // Сортируем по дате обновления (убывание)
        const sortedListings = listings.sort((a, b) => {
            const timestampA = new Date(a.updated || a.updated_at || a.created || a.created_at || 0).getTime();
            const timestampB = new Date(b.updated || b.updated_at || b.created || b.created_at || 0).getTime();
            return timestampB - timestampA;
        });

        const tableHtml = `
            <div class="bg-gray-50 p-4">
                <h4 class="text-sm font-medium text-gray-900 mb-3">Объявления объекта (${listings.length})</h4>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Создано</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Обновлено</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Характеристики</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Адрес</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Контакт</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${sortedListings.map(listing => this.createChildListingRow(listing)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        return tableHtml;
    }

    /**
     * Создать строку в дочерней таблице объявлений (точная копия из DuplicatesManager)
     */
    createChildListingRow(listing) {
        // 1. Статус (копируем логику из родительской таблицы)
        const statusBadges = {
            'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
            'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
            'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>'
        };
        
        let statusHtml = statusBadges[listing.status] || `<span class="text-xs text-gray-500">${listing.status}</span>`;
        
        // НЕ добавляем статус обработки для дочерней таблицы как в старой версии
        
        // 2. Дата создания
        const dateValue = listing.created || listing.created_at;
        let createdHtml = '—';
        if (dateValue) {
            const createdDate = new Date(dateValue);
            const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
            
            // Вычисляем экспозицию
            const updatedValue = listing.updated || listing.updated_at;
            const endDate = updatedValue ? new Date(updatedValue) : new Date();
            const diffTime = Math.abs(endDate - createdDate);
            const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            createdHtml = `<div class="text-xs">
                ${dateStr}<br>
                <span class="text-gray-500" style="font-size: 10px;">эксп. ${exposureDays} дн.</span>
            </div>`;
        }
        
        // 3. Дата обновления
        const updatedDateValue = listing.updated || listing.updated_at;
        let updatedHtml = '—';
        if (updatedDateValue) {
            const date = new Date(updatedDateValue);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const daysAgo = diffDays === 1 ? '1 день назад' : `${diffDays} дн. назад`;
            const color = diffDays > 7 ? 'text-red-600' : 'text-green-600';
            
            updatedHtml = `<div class="text-xs">
                ${dateStr}<br>
                <span class="${color}" style="font-size: 10px;">${daysAgo}</span>
            </div>`;
        }
        
        // 4. Характеристики
        const parts = [];
        
        if (listing.property_type) {
            const types = {
                'studio': 'Студия',
                '1k': '1-к',
                '2k': '2-к',
                '3k': '3-к',
                '4k+': '4-к+'
            };
            parts.push(types[listing.property_type] || listing.property_type);
            parts.push('квартира');
        }
        
        // Площади
        const areas = [];
        if (listing.area_total) areas.push(listing.area_total);
        if (listing.area_living) areas.push(listing.area_living);
        if (listing.area_kitchen) areas.push(listing.area_kitchen);
        if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
        
        // Этаж/этажность
        if (listing.floor && listing.total_floors) {
            parts.push(`${listing.floor}/${listing.total_floors} эт.`);
        } else if (listing.floor && listing.floors_total) {
            parts.push(`${listing.floor}/${listing.floors_total} эт.`);
        }
        
        const characteristicsText = parts.length > 0 ? parts.join(', ') : 'Не указано';
        
        // 5. Адрес
        const addressFromDb = this.getAddressNameById(listing.address_id);
        const addressText = listing.address || 'Адрес не указан';
        let addressFromDbText = addressFromDb || 'Адрес не определен';
        
        // Проверяем точность определения адреса
        const hasLowConfidence = listing.address_match_confidence === 'low' || listing.address_match_confidence === 'very_low';
        const isManualConfidence = listing.address_match_confidence === 'manual';
        const isAddressNotFound = addressFromDbText === 'Адрес не определен';
        
        if (hasLowConfidence && !isAddressNotFound) {
            const confidenceText = listing.address_match_confidence === 'low' ? 'Низкая' : 'Очень низкая';
            addressFromDbText += ` (${confidenceText})`;
        } else if (isManualConfidence && !isAddressNotFound) {
            addressFromDbText += ` (Подтвержден)`;
        }
        
        const addressClass = addressText === 'Адрес не указан' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800';
        const addressFromDbClass = (isAddressNotFound || (hasLowConfidence && !isManualConfidence)) ? 'text-red-500' : 'text-gray-500';
        
        const addressHtml = `<div class="text-xs max-w-xs">
            <div class="${addressClass} cursor-pointer clickable-address truncate" data-listing-id="${listing.id}">${addressText}</div>
            <div class="${addressFromDbClass} truncate">${addressFromDbText}</div>
        </div>`;
        
        // 6. Цена
        const priceValue = listing.price;
        let priceHtml = '<div class="text-xs">—</div>';
        if (priceValue) {
            const price = priceValue.toLocaleString();
            let pricePerMeter = '';
            
            if (listing.price_per_meter) {
                pricePerMeter = listing.price_per_meter.toLocaleString();
            } else if (priceValue && listing.area_total) {
                const calculated = Math.round(priceValue / listing.area_total);
                pricePerMeter = calculated.toLocaleString();
            }
            
            priceHtml = `<div class="text-xs">
                <div class="text-green-600 font-medium">${price}</div>
                ${pricePerMeter ? `<div class="text-gray-500">${pricePerMeter}</div>` : ''}
            </div>`;
        }
        
        // 7. Контакт с источником
        const sellerType = listing.seller_type === 'private' ? 'Собственник' : 
                          listing.seller_type === 'agency' ? 'Агент' : 
                          listing.seller_type === 'agent' ? 'Агент' :
                          listing.seller_type === 'owner' ? 'Собственник' :
                          listing.seller_type || 'Не указано';
        
        const sellerName = listing.seller_name || 'Не указано';
        
        // Получаем источник для первой строки контакта
        const sourceUrl = listing.url || '#';
        let sourceName = 'Неизвестно';
        
        // Получаем имя источника из source_metadata.original_source
        if (listing.source_metadata && listing.source_metadata.original_source) {
            sourceName = listing.source_metadata.original_source;
        } else if (listing.source) {
            // Fallback к обычному source с переводом
            sourceName = listing.source === 'avito' ? 'avito.ru' : listing.source === 'cian' ? 'cian.ru' : listing.source;
        }
        
        const contactHtml = `<div class="text-xs max-w-xs">
            <div class="text-blue-600 hover:text-blue-800 truncate" title="${sourceName}">
                <a href="${sourceUrl}" target="_blank">${sourceName}</a>
            </div>
            <div class="text-gray-900 truncate" title="${sellerType}">${sellerType}</div>
            <div class="text-gray-500 truncate" title="${sellerName}">${sellerName}</div>
        </div>`;
        
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-3 py-2 whitespace-nowrap text-xs">${statusHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${createdHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${updatedHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs"><div class="text-xs text-gray-900 max-w-xs" title="${characteristicsText}">${characteristicsText}</div></td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${addressHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${priceHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${contactHtml}</td>
            </tr>
        `;
    }


    /**
     * Публичный метод для обновления фильтра адресов (когда currentArea становится доступен)
     */
    async refreshAddressFilter() {
        try {
            await this.loadFlippingAddressFilter();
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка обновления фильтра адресов:', error);
        }
    }

    /**
     * Показ сообщения об отсутствии объявлений
     */
    showNoListingsMessage(row) {
        const noListingsContent = `
            <div class="p-4 bg-gray-50 text-center text-gray-500 text-sm">
                Объявления для этого объекта не найдены
            </div>
        `;
        
        row.child(noListingsContent, 'child-row').show();
    }

    /**
     * Разворачивание/сворачивание подробностей доходности
     */
    async toggleProfitabilityDetails(objectId, clickedElement) {
        try {
            const row = this.dataTable.row($(clickedElement).closest('tr'));
            const rowData = row.data();
            
            if (!rowData) return;
            
            if (row.child.isShown()) {
                // Сворачиваем
                row.child.hide();
            } else {
                // Разворачиваем - показываем подробный расчёт
                const profitability = rowData.flippingProfitability;
                
                if (!profitability) {
                    const noProfitabilityContent = `
                        <div class="p-4 bg-gray-50 text-center text-gray-500 text-sm">
                            Расчёт доходности недоступен для этого объекта
                        </div>
                    `;
                    row.child(noProfitabilityContent, 'child-row').show();
                    return;
                }
                
                const childContent = this.createProfitabilityDetailsContent(profitability, rowData);
                row.child(childContent, 'child-row').show();
            }
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка отображения деталей доходности:', error);
        }
    }

    /**
     * Создание содержимого с подробным расчётом доходности
     */
    createProfitabilityDetailsContent(profitability, objectData) {
        // Поддержка новой структуры flippingProfitability и старой profitability
        let current, target;
        
        if (objectData.flippingProfitability && objectData.flippingProfitability.fullData) {
            // Новая структура с двумя сценариями из сервиса
            current = objectData.flippingProfitability.fullData.currentPrice;
            target = objectData.flippingProfitability.fullData.targetPrice;
        } else if (objectData.flippingProfitability) {
            // Структура из менеджера
            current = objectData.flippingProfitability.current;
            target = objectData.flippingProfitability.target;
        } else {
            // Старая структура (обратная совместимость)
            current = profitability.currentPrice || profitability;
            target = profitability.targetPrice || null;
        }

        // Скрываем колонку целевой цены если текущая доходность превышает целевую
        const targetROI = this.profitabilityParameters?.profitabilityPercent;
        
        if (target && current && targetROI && current.annualROI >= targetROI) {
            target = null; // Скрываем колонку целевой цены
        }
        
        const formatCurrency = (amount) => {
            if (amount === undefined || amount === null || isNaN(amount)) {
                return '—';
            }
            return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ₽';
        };
        
        const formatPercent = (percent) => {
            if (percent === undefined || percent === null || isNaN(percent)) {
                return '—';
            }
            return (Math.round(percent * 10) / 10).toFixed(1) + '%';
        };
        
        const formatProjectDuration = (days) => {
            if (!days || isNaN(days)) {
                return '—';
            }
            const totalDays = Math.round(days);
            const months = Math.floor(totalDays / 30);
            const remainingDays = totalDays % 30;
            
            if (months > 0 && remainingDays > 0) {
                return `${totalDays} дн. (${months} мес. ${remainingDays} дн.)`;
            } else if (months > 0) {
                return `${totalDays} дн. (${months} мес.)`;
            } else {
                return `${totalDays} дн.`;
            }
        };
        
        // Проверка наличия данных для текущего сценария
        if (!current) {
            console.error('❌ Данные для current не найдены:', {
                profitability,
                objectData,
                flippingProfitability: objectData?.flippingProfitability
            });
            return '<div class="text-center text-red-500 py-4">Данные расчёта доходности отсутствуют</div>';
        }

        let targetColumn = '';
        if (target) {
            targetColumn = `
                <td class="py-2 px-3 text-center">
                    <div class="text-xs">
                        <div class="font-medium text-blue-600">${formatCurrency(target.targetPrice || target.purchasePrice)}</div>
                        <div class="text-green-600">-${target.discount || 0}%</div>
                    </div>
                </td>
                <td class="py-2 px-3 text-center">${formatCurrency(target.renovationCost)}</td>
                <td class="py-2 px-3 text-center">${formatCurrency(target.additionalExpenses)}</td>
                <td class="py-2 px-3 text-center">${formatCurrency(target.taxes)}</td>
                <td class="py-2 px-3 text-center font-medium">${formatCurrency(target.totalCosts)}</td>
                <td class="py-2 px-3 text-center">${formatCurrency(target.salePrice)}</td>
                <td class="py-2 px-3 text-center font-medium text-green-600">${formatCurrency(target.netProfit)}</td>
                <td class="py-2 px-3 text-center font-bold text-green-600">${formatPercent(target.annualROI)}</td>
                <td class="py-2 px-3 text-center">${formatProjectDuration(target.totalProjectDays)}</td>
            `;
        } else {
            targetColumn = '<td colspan="9" class="py-2 px-3 text-center text-gray-400 text-xs">Расчёт целевой цены недоступен</td>';
        }

        // Раздел прибыли теперь отображается в строке "Прибыль" в таблице

        return `
            <div class="p-4 bg-gray-50">
                <div class="text-sm font-medium text-gray-700 mb-3">
                    Расчёт доходности для объекта #${objectData.id}
                </div>
                
                <div class="overflow-x-auto">
                    <table class="w-full text-xs border border-gray-300">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="py-2 px-3 text-left border-r">Параметр</th>
                                <th class="py-2 px-3 text-center border-r">При тек. цене</th>
                                ${target ? '<th class="py-2 px-3 text-center">Цель. цена</th>' : ''}
                            </tr>
                        </thead>
                        <tbody class="bg-white">
                            <tr class="border-t">
                                <td class="py-2 px-3 font-medium border-r">Покупка</td>
                                <td class="py-2 px-3 text-center border-r">
                                    ${this.profitabilityParameters?.financing === 'mortgage' && current.financing && current.financing.downPayment !== undefined && current.financing.interestCosts !== undefined ? 
                                        `<div class="font-medium">${formatCurrency(objectData.current_price || objectData.currentPrice || objectData.price)} (${formatCurrency(current.financing.downPayment)} + ${formatCurrency(current.financing.interestCosts)} = ${formatCurrency(current.purchasePrice)})</div>`
                                        : `<div class="font-medium">${formatCurrency(objectData.current_price || objectData.currentPrice || objectData.price || current.purchasePrice)}</div>`
                                    }
                                </td>
                                ${target ? `<td class="py-2 px-3 text-center">
                                    <div class="text-blue-600 font-medium">${formatCurrency(target.targetPrice || target.purchasePrice)}</div>
                                    <div class="text-green-600 text-xs">-${target.discount || 0}%</div>
                                    ${this.profitabilityParameters?.financing === 'mortgage' && target.financing && target.financing.downPayment && target.financing.interestCosts ? 
                                        `<div class="text-xs text-gray-600">
                                            (${formatCurrency(target.financing.downPayment)} + ${formatCurrency(target.financing.interestCosts)} = ${formatCurrency(target.purchasePrice || target.totalCosts)})
                                        </div>` : ''
                                    }
                                </td>` : ''}
                            </tr>
                            <tr class="border-t">
                                <td class="py-2 px-3 font-medium border-r">Ремонт</td>
                                <td class="py-2 px-3 text-center border-r">${formatCurrency(current.renovationCost)}</td>
                                ${target ? `<td class="py-2 px-3 text-center">${formatCurrency(target.renovationCost)}</td>` : ''}
                            </tr>
                            <tr class="border-t">
                                <td class="py-2 px-3 font-medium border-r">Доп. расходы</td>
                                <td class="py-2 px-3 text-center border-r">${formatCurrency(current.additionalExpenses)}</td>
                                ${target ? `<td class="py-2 px-3 text-center">${formatCurrency(target.additionalExpenses)}</td>` : ''}
                            </tr>
                            <tr class="border-t">
                                <td class="py-2 px-3 font-medium border-r">Налоги</td>
                                <td class="py-2 px-3 text-center border-r">${formatCurrency(current.taxes)}</td>
                                ${target ? `<td class="py-2 px-3 text-center">${formatCurrency(target.taxes)}</td>` : ''}
                            </tr>
                            <tr class="border-t bg-gray-50">
                                <td class="py-2 px-3 font-bold border-r">Всего вложения</td>
                                <td class="py-2 px-3 text-center font-bold border-r">${formatCurrency(current.totalCosts)}</td>
                                ${target ? `<td class="py-2 px-3 text-center font-bold">${formatCurrency(target.totalCosts)}</td>` : ''}
                            </tr>
                            <tr class="border-t">
                                <td class="py-2 px-3 font-medium border-r">Продажа</td>
                                <td class="py-2 px-3 text-center border-r">${formatCurrency(current.salePrice)}</td>
                                ${target ? `<td class="py-2 px-3 text-center">${formatCurrency(target.salePrice)}</td>` : ''}
                            </tr>
                            <tr class="border-t bg-green-50">
                                <td class="py-2 px-3 font-bold border-r">Прибыль</td>
                                <td class="py-2 px-3 text-center font-bold text-green-600 border-r">
                                    ${current.profitSharing && current.profitSharing.flipper > 0 ? 
                                        (this.profitabilityParameters?.participants === 'flipper-investor' && current.profitSharing.investor > 0) ?
                                            `<div>Ф: ${formatCurrency(current.profitSharing.flipper)} / И: ${formatCurrency(current.profitSharing.investor)}</div>` :
                                            `<div>Ф: ${formatCurrency(current.profitSharing.flipper)}</div>` :
                                        `${formatCurrency(current.netProfit)}`
                                    }
                                </td>
                                ${target ? `<td class="py-2 px-3 text-center font-bold text-green-600">
                                    ${target.profitSharing && target.profitSharing.flipper > 0 ? 
                                        (this.profitabilityParameters?.participants === 'flipper-investor' && target.profitSharing.investor > 0) ?
                                            `<div>Ф: ${formatCurrency(target.profitSharing.flipper)} / И: ${formatCurrency(target.profitSharing.investor)}</div>` :
                                            `<div>Ф: ${formatCurrency(target.profitSharing.flipper)}</div>` :
                                        `${formatCurrency(target.netProfit)}`
                                    }
                                </td>` : ''}
                            </tr>
                            <tr class="border-t bg-blue-50">
                                <td class="py-2 px-3 font-bold border-r">Доходность</td>
                                <td class="py-2 px-3 text-center font-bold text-blue-600 border-r">${formatPercent(current.annualROI)} год.</td>
                                ${target ? `<td class="py-2 px-3 text-center font-bold text-blue-600">${formatPercent(target.annualROI)} год.</td>` : ''}
                            </tr>
                            <tr class="border-t">
                                <td class="py-2 px-3 font-medium border-r">Срок проекта</td>
                                <td class="py-2 px-3 text-center border-r">${formatProjectDuration(current.totalProjectDays)}</td>
                                ${target ? `<td class="py-2 px-3 text-center">${formatProjectDuration(target.totalProjectDays)}</td>` : ''}
                            </tr>
                        </tbody>
                    </table>
                </div>

            </div>
        `;
    }

    /**
     * Инициализация фильтров (по аналогии с DuplicatesManager)
     */
    async initializeFilters() {
        try {
            // Инициализируем фильтр по адресу (без загрузки данных)
            this.initFlippingAddressFilterElement();
            
            // Инициализируем фильтр по типу недвижимости
            this.initFlippingPropertyTypeFilter();
            
            // Инициализируем фильтр по статусу
            this.initFlippingStatusFilter();
            
            // Привязываем события кнопок очистки
            this.bindFilterClearButtons();
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка инициализации фильтров:', error);
        }
    }

    /**
     * Инициализация элемента фильтра по адресу (без загрузки данных)
     */
    initFlippingAddressFilterElement() {
        try {
            const selectElement = document.getElementById('flippingAddressFilter');
            if (!selectElement) return;

            // Инициализируем SlimSelect с пустым списком
            this.flippingAddressSlimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    searchPlaceholder: 'Поиск адресов...',
                    searchText: 'Адрес не найден',
                    placeholderText: 'Выберите адрес',
                    allowDeselect: true,
                    closeOnSelect: true
                },
                events: {
                    afterChange: (newVal) => {
                        this.onAddressFilterChange(newVal);
                    }
                }
            });
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка инициализации элемента фильтра адресов:', error);
        }
    }

    /**
     * Загрузка данных в фильтр адресов (вызывается по требованию)
     */
    async loadFlippingAddressFilter() {
        try {
            
            // Пытаемся обновить dataState перед загрузкой адресов
            if (!this.dataState) {
                if (window.areaPage?.dataState) {
                    this.dataState = window.areaPage.dataState;
                } else if (window.duplicatesManager?.dataState) {
                    this.dataState = window.duplicatesManager.dataState;
                } else {
                }
            }
            
            const selectElement = document.getElementById('flippingAddressFilter');
            if (!selectElement) {
                return;
            }

            // Очищаем существующие опции (кроме первой "Все адреса")
            while (selectElement.children.length > 1) {
                selectElement.removeChild(selectElement.lastChild);
            }
            
            // Загружаем адреса в области
            const areaAddresses = await this.getAddressesInArea();
            
            // Добавляем опции для каждого адреса в области
            areaAddresses.forEach(address => {
                const option = document.createElement('option');
                option.value = address.id;
                option.textContent = address.address;
                selectElement.appendChild(option);
            });

            // Обновляем SlimSelect
            if (this.flippingAddressSlimSelect) {
                this.flippingAddressSlimSelect.destroy();
                this.initFlippingAddressFilterElement();
            }
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка загрузки данных фильтра адресов:', error);
        }
    }

    /**
     * Инициализация фильтра по типу недвижимости
     */
    initFlippingPropertyTypeFilter() {
        try {
            const selectElement = document.getElementById('flippingPropertyTypeFilter');
            if (!selectElement) return;

            // Инициализируем SlimSelect
            this.flippingPropertyTypeSlimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    placeholderText: 'Выберите тип',
                    allowDeselect: true,
                    closeOnSelect: true
                },
                events: {
                    afterChange: (newVal) => {
                                    this.onPropertyTypeFilterChange(newVal);
                    }
                }
            });
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка инициализации фильтра типа недвижимости:', error);
        }
    }

    /**
     * Инициализация фильтра по статусу
     */
    initFlippingStatusFilter() {
        try {
            const selectElement = document.getElementById('flippingStatusFilter');
            if (!selectElement) return;

            // Инициализируем SlimSelect
            this.flippingStatusSlimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    placeholderText: 'Выберите статус',
                    allowDeselect: true,
                    closeOnSelect: true
                },
                events: {
                    afterChange: (newVal) => {
                                    this.onStatusFilterChange(newVal);
                    }
                }
            });
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка инициализации фильтра статуса:', error);
        }
    }

    /**
     * Обработчик изменения фильтра адресов
     */
    onAddressFilterChange(newVal) {
        try {
            this.applyFilters();
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка при изменении фильтра адресов:', error);
        }
    }

    /**
     * Обработчик изменения фильтра типа недвижимости
     */
    onPropertyTypeFilterChange(newVal) {
        try {
            this.applyFilters();
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка при изменении фильтра типа недвижимости:', error);
        }
    }

    /**
     * Обработчик изменения фильтра статуса
     */
    onStatusFilterChange(newVal) {
        try {
            this.applyFilters();
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка при изменении фильтра статуса:', error);
        }
    }

    /**
     * Применение всех фильтров к таблице
     */
    applyFilters() {
        if (!this.dataTable) return;

        try {
            let filteredData = [...this.objects];
            // Фильтр по адресу
            const addressFilter = this.flippingAddressSlimSelect?.getSelected()?.[0] || '';
            if (addressFilter) {
                const beforeCount = filteredData.length;
                filteredData = filteredData.filter(obj => obj.address_id == addressFilter);
            }

            // Фильтр по типу недвижимости
            const propertyTypeFilter = this.flippingPropertyTypeSlimSelect?.getSelected()?.[0] || '';
            if (propertyTypeFilter) {
                const beforeCount = filteredData.length;
                filteredData = filteredData.filter(obj => obj.property_type === propertyTypeFilter);
            }

            // Фильтр по статусу
            const statusFilter = this.flippingStatusSlimSelect?.getSelected()?.[0] || '';
            if (statusFilter) {
                const beforeCount = filteredData.length;
                filteredData = filteredData.filter(obj => obj.status === statusFilter);
            }

            
            // Обновляем таблицу с отфильтрованными данными
            this.dataTable.clear().rows.add(filteredData).draw();
            
            // Обновляем активные фильтры
            this.updateActiveFilters();
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка применения фильтров:', error);
        }
    }

    /**
     * Привязка кнопок очистки фильтров
     */
    bindFilterClearButtons() {
        try {
            // Кнопка очистки всех фильтров
            const clearAllBtn = document.getElementById('clearAllFlippingFiltersBtn');
            if (clearAllBtn) {
                clearAllBtn.addEventListener('click', () => {
                    this.clearAllFilters();
                });
            }
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка привязки кнопок очистки:', error);
        }
    }

    /**
     * Очистка одного фильтра
     */
    clearSingleFilter(filterId) {
        try {
            switch (filterId) {
                case 'flippingAddressFilter':
                    if (this.flippingAddressSlimSelect) {
                        this.flippingAddressSlimSelect.setSelected([]);
                    }
                    break;
                case 'flippingPropertyTypeFilter':
                    if (this.flippingPropertyTypeSlimSelect) {
                        this.flippingPropertyTypeSlimSelect.setSelected([]);
                    }
                    break;
                case 'flippingStatusFilter':
                    if (this.flippingStatusSlimSelect) {
                        this.flippingStatusSlimSelect.setSelected([]);
                    }
                    break;
            }
            this.applyFilters();
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка очистки фильтра:', error);
        }
    }

    /**
     * Очистка всех фильтров
     */
    clearAllFilters() {
        try {
            this.clearSingleFilter('flippingAddressFilter');
            this.clearSingleFilter('flippingPropertyTypeFilter');
            this.clearSingleFilter('flippingStatusFilter');
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка очистки всех фильтров:', error);
        }
    }


    /**
     * Обновление отображения активных фильтров
     */
    updateActiveFilters() {
        try {
            const activeFiltersContainer = document.getElementById('flippingActiveFiltersContainer');
            const activeFilterTags = document.getElementById('flippingActiveFilterTags');
            
            if (!activeFiltersContainer || !activeFilterTags) return;

            // Очищаем теги
            activeFilterTags.innerHTML = '';
            
            const activeFilters = [];

            // Проверяем фильтр по адресу
            const addressFilter = this.flippingAddressSlimSelect?.getSelected()?.[0]?.value || '';
            if (addressFilter) {
                const addressText = this.getAddressNameById(addressFilter) || `ID: ${addressFilter}`;
                activeFilters.push({
                    type: 'address',
                    text: `Адрес: ${addressText}`,
                    onRemove: () => this.clearSingleFilter('flippingAddressFilter')
                });
            }

            // Проверяем фильтр по типу недвижимости
            const propertyTypeFilter = this.flippingPropertyTypeSlimSelect?.getSelected()?.[0]?.value || '';
            if (propertyTypeFilter) {
                const typeText = this.flippingPropertyTypeSlimSelect?.getSelected()?.[0]?.text || propertyTypeFilter;
                activeFilters.push({
                    type: 'property_type',
                    text: `Тип: ${typeText}`,
                    onRemove: () => this.clearSingleFilter('flippingPropertyTypeFilter')
                });
            }

            // Проверяем фильтр по статусу
            const statusFilter = this.flippingStatusSlimSelect?.getSelected()?.[0]?.value || '';
            if (statusFilter) {
                const statusText = this.flippingStatusSlimSelect?.getSelected()?.[0]?.text || statusFilter;
                activeFilters.push({
                    type: 'status',
                    text: `Статус: ${statusText}`,
                    onRemove: () => this.clearSingleFilter('flippingStatusFilter')
                });
            }

            // Показываем/скрываем контейнер активных фильтров
            if (activeFilters.length > 0) {
                // Создаем теги для активных фильтров
                activeFilters.forEach(filter => {
                    const tag = document.createElement('span');
                    tag.className = 'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800';
                    tag.innerHTML = `
                        ${filter.text}
                        <button type="button" class="ml-1 flex-shrink-0 h-3 w-3 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-600 focus:outline-none focus:bg-blue-500 focus:text-white">
                            <span class="sr-only">Удалить фильтр</span>
                            <svg class="h-2 w-2" fill="currentColor" viewBox="0 0 8 8">
                                <path d="M7.71 0.29a1 1 0 0 0-1.42 0L4 2.59 1.71 0.29A1 1 0 0 0 0.29 1.71L2.59 4 0.29 6.29A1 1 0 0 0 1.71 7.71L4 5.41l2.29 2.3A1 1 0 0 0 7.71 6.29L5.41 4l2.3-2.29A1 1 0 0 0 7.71 0.29z"/>
                            </svg>
                        </button>
                    `;
                    
                    // Привязываем событие удаления
                    tag.querySelector('button').addEventListener('click', filter.onRemove);
                    
                    activeFilterTags.appendChild(tag);
                });
                
                activeFiltersContainer.classList.remove('hidden');
            } else {
                activeFiltersContainer.classList.add('hidden');
            }
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка обновления активных фильтров:', error);
        }
    }

    /**
     * Установка фильтра по адресу (для использования из popup карты)
     */
    setAddressFilter(addressId) {
        try {
            if (this.flippingAddressSlimSelect && addressId) {
                this.flippingAddressSlimSelect.setSelected([addressId.toString()]);
                this.applyFilters();
            }
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка установки фильтра по адресу:', error);
        }
    }

    /**
     * Обновление dataState (вызывается когда он становится доступен)
     */
    updateDataState(dataState) {
        this.dataState = dataState;
    }

    /**
     * Метод для обновления данных фильтра адресов (вызывается из FlippingProfitabilityManager)
     */
    async refreshFlippingAddressFilter() {
        try {
            // Пытаемся обновить dataState перед загрузкой адресов
            if (!this.dataState) {
                if (window.areaPage?.dataState) {
                    this.dataState = window.areaPage.dataState;
                } else if (window.duplicatesManager?.dataState) {
                    this.dataState = window.duplicatesManager.dataState;
                }
            }
            
            const selectElement = document.getElementById('flippingAddressFilter');
            if (!selectElement) return;

            // Очищаем существующие опции (кроме первой "Все адреса")
            while (selectElement.children.length > 1) {
                selectElement.removeChild(selectElement.lastChild);
            }

            const areaAddresses = await this.getAddressesInArea();
            
            // Добавляем опции для каждого адреса в области
            areaAddresses.forEach(address => {
                const option = document.createElement('option');
                option.value = address.id;
                option.textContent = address.address;
                selectElement.appendChild(option);
            });

            // Пересоздаем SlimSelect
            if (this.flippingAddressSlimSelect) {
                this.flippingAddressSlimSelect.destroy();
                this.flippingAddressSlimSelect = null;
            }
            
            this.initFlippingAddressFilterElement();
            
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка обновления фильтра адресов:', error);
        }
    }

    /**
     * Уничтожение таблицы
     */
    destroy() {
        // Удаляем обработчики событий
        $(document).off('click', '.expand-object-listings');
        $(document).off('click', '.profitability-details');
        
        if (this.dataTable) {
            this.dataTable.destroy();
            this.dataTable = null;
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingTable;
}