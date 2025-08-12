/**
 * FlippingTable - компонент таблицы для отчёта доходности флиппинг
 * Копирует структуру таблицы дубликатов с заменой колонки "Фильтр" на "Доходность"
 * Следует архитектуре v0.1
 */
class FlippingTable {
    constructor(tableElementId, errorHandlingService, configService) {
        this.tableElementId = tableElementId;
        this.errorHandlingService = errorHandlingService;
        this.configService = configService;
        
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
     * Получение названия адреса по ID
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses.length) return null;
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address_string : null;
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

            if (this.debugEnabled) {
                console.log('🏠 FlippingTable: Таблица инициализирована');
            }
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
            order: [[4, 'desc']], // Сортировка по дате обновления (колонка 5)
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
                        // Пока показываем заглушку, в будущем здесь будет расчёт доходности
                        return `<div class="text-xs text-center">
                            <span class="text-gray-400">—</span>
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
                        
                        // Тип квартиры
                        if (row.rooms !== null && row.rooms !== undefined) {
                            if (row.rooms === 0) {
                                parts.push('Студия');
                            } else {
                                parts.push(`${row.rooms}-к`);
                            }
                            parts.push('квартира');
                        }
                        
                        // Площади
                        const areas = [];
                        if (row.area) areas.push(row.area);
                        if (row.area_living) areas.push(row.area_living);
                        if (row.area_kitchen) areas.push(row.area_kitchen);
                        if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
                        
                        // Этаж/этажность
                        if (row.floor && row.total_floors) {
                            parts.push(`${row.floor}/${row.total_floors} эт.`);
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
        if (this.debugEnabled) {
            console.log('🏠 FlippingTable: DataTable инициализирована');
        }
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
                
                if (this.debugEnabled) {
                    console.log('🏠 FlippingTable: Свернули объявления для объекта:', objectId);
                }
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
                
                if (this.debugEnabled) {
                    console.log('🏠 FlippingTable: Развернули объявления для объекта:', objectId, 'количество:', listings.length);
                }
            }
        } catch (error) {
            console.error('❌ FlippingTable: Ошибка разворачивания объявлений:', error);
        }
    }

    /**
     * Создание дочерней строки с объявлениями (копия из DuplicatesManager)
     */
    createListingsChildRow(listings, parentObject) {
        const listingsHtml = listings.map(listing => {
            const status = listing.status || 'unknown';
            const statusBadge = this.createListingStatusBadge(status);
            const price = listing.price ? new Intl.NumberFormat('ru-RU').format(listing.price) + ' ₽' : '—';
            const publishDate = listing.publish_date ? new Date(listing.publish_date).toLocaleDateString('ru-RU') : '—';
            const updateDate = listing.last_check ? new Date(listing.last_check).toLocaleDateString('ru-RU') : '—';
            
            return `
                <tr class="listing-row text-xs">
                    <td class="pl-12 py-2">
                        <div class="flex items-center space-x-2">
                            ${statusBadge}
                            <span class="text-blue-600 hover:underline">
                                <a href="${listing.url}" target="_blank" class="flex items-center space-x-1">
                                    <span>${listing.source || 'Источник'}</span>
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                    </svg>
                                </a>
                            </span>
                        </div>
                    </td>
                    <td class="py-2">${publishDate}</td>
                    <td class="py-2">${updateDate}</td>
                    <td class="py-2">—</td>
                    <td class="py-2">${listing.address || parentObject.address?.address_string || '—'}</td>
                    <td class="py-2 font-medium text-green-600">${price}</td>
                    <td class="py-2">${listing.seller_name || '—'}</td>
                </tr>
            `;
        }).join('');
        
        return `
            <div class="p-2 bg-gray-50">
                <div class="text-sm font-medium text-gray-700 mb-2">
                    Объявления объекта (${listings.length} шт.)
                </div>
                <table class="w-full text-xs">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="px-2 py-1 text-left">Статус / Источник</th>
                            <th class="px-2 py-1 text-left">Создано</th>
                            <th class="px-2 py-1 text-left">Обновлено</th>
                            <th class="px-2 py-1 text-left">Характеристики</th>
                            <th class="px-2 py-1 text-left">Адрес</th>
                            <th class="px-2 py-1 text-left">Цена</th>
                            <th class="px-2 py-1 text-left">Контакт</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${listingsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Создание бейджа статуса объявления
     */
    createListingStatusBadge(status) {
        const statusConfig = {
            'active': { text: 'Активное', class: 'bg-green-100 text-green-800' },
            'archive': { text: 'Архивное', class: 'bg-gray-100 text-gray-800' },
            'archived': { text: 'Архивное', class: 'bg-gray-100 text-gray-800' },
            'sold': { text: 'Продано', class: 'bg-blue-100 text-blue-800' },
            'unknown': { text: 'Неизвестно', class: 'bg-gray-100 text-gray-800' }
        };
        
        const config = statusConfig[status] || statusConfig['unknown'];
        return `<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${config.class}">${config.text}</span>`;
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
     * Уничтожение таблицы
     */
    destroy() {
        // Удаляем обработчики событий
        $(document).off('click', '.expand-object-listings');
        
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