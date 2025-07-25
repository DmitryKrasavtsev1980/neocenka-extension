/**
 * Менеджер дублей
 * Управляет обработкой дублей объявлений и их объединением в объекты недвижимости
 */

console.log('📁 Загружаем DuplicatesManager.js');

class DuplicatesManager {
    constructor(dataState, eventBus, progressManager) {
        this.dataState = dataState;
        this.eventBus = eventBus;
        this.progressManager = progressManager;
        
        // Таблица дублей
        this.duplicatesTable = null;
        
        // Состояние дублей
        this.duplicatesState = {
            selectedDuplicates: new Set(),
            expandedRows: new Set(),
            processing: false,
            currentAlgorithm: 'basic'
        };
        
        // Статистика дублей
        this.duplicatesStats = {
            total: 0,
            needProcessing: 0,
            processed: 0,
            merged: 0,
            efficiency: 0
        };
        
        // Конфигурация
        this.config = {
            pageLength: 10,
            accuracyThreshold: 0.85,
            defaultAlgorithm: 'basic'
        };
        
        // Флаги состояния
        this.isLoadingTable = false;
        
        // Cache для адресов (необходимо для helper методов)
        this.addresses = [];
        
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
                console.log('📨 DuplicatesManager: Получено событие ADDRESSES_LOADED');
                
                // Загружаем адреса для helper методов
                await this.loadAddresses();
                
                // Теперь можем безопасно инициализировать таблицу дублей
                if (!this.duplicatesTable) {
                    await this.initializeDuplicatesTable();
                    await this.loadDuplicatesTable();
                    await this.updateDuplicatesStats();
                } else {
                    // Если таблица уже создана, просто обновляем данные
                    await this.loadDuplicatesTable();
                    await this.updateDuplicatesStats();
                }
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.LISTINGS_LOADED, async () => {
                console.log('📨 DuplicatesManager: Получено событие LISTINGS_LOADED - обновляем данные');
                // Только обновляем данные если таблица уже инициализирована
                if (this.duplicatesTable) {
                    await this.loadDuplicatesTable();
                    await this.updateDuplicatesStats();
                } else {
                    console.log('⚠️ DuplicatesManager: Таблица еще не инициализирована, пропускаем обновление');
                }
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.AREA_CHANGED, async () => {
                console.log('📨 DuplicatesManager: Получено событие AREA_CHANGED');
                await this.loadDuplicatesTable();
                await this.updateDuplicatesStats();
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.LISTING_UPDATED, async () => {
                console.log('📨 DuplicatesManager: Получено событие LISTING_UPDATED');
                await this.loadDuplicatesTable();
                await this.updateDuplicatesStats();
            });
        }
        
        // Привязка к кнопкам
        this.bindButtons();
        
        // Привязка к событиям таблицы
        this.bindTableEvents();
        
        // Привязка к панели управления
        this.bindPanelEvents();
    }
    
    /**
     * Привязка к кнопкам
     */
    bindButtons() {
        // Кнопки обработки дублей
        document.getElementById('processDuplicatesBtn')?.addEventListener('click', () => {
            this.processDuplicates();
        });
        
        document.getElementById('processDuplicatesAdvancedBtn')?.addEventListener('click', () => {
            this.processDuplicatesAdvanced();
        });
        
        // Кнопки управления дублями
        document.getElementById('mergeDuplicatesBtn')?.addEventListener('click', () => {
            this.mergeDuplicates();
        });
        
        document.getElementById('splitDuplicatesBtn')?.addEventListener('click', () => {
            this.splitDuplicates();
        });
        
        // Фильтр статусов
        document.getElementById('duplicatesStatusFilter')?.addEventListener('change', (e) => {
            this.applyProcessingFilters();
        });
        
        // Кнопка очистки всех фильтров
        document.getElementById('clearProcessingFiltersBtn')?.addEventListener('click', () => {
            this.clearAllProcessingFilters();
        });
        
        // Кнопка подтверждения адреса
        document.getElementById('correctAddressBtn')?.addEventListener('click', () => {
            this.markAddressAsCorrect();
        });
    }
    
    /**
     * Привязка к событиям таблицы
     */
    bindTableEvents() {
        // Делегированные обработчики для динамически создаваемых элементов (используем jQuery как в старой версии)
        $(document).on('change', '.duplicate-checkbox', (e) => {
            console.log('🔄 jQuery event handler for duplicate checkbox');
            this.handleDuplicateSelection(e.target);
        });
        
        document.addEventListener('click', (e) => {
            
            // Обработка кнопки "Выбрать все"
            if (e.target.matches('#selectAllDuplicates')) {
                this.selectAllDuplicates(e.target.checked);
            }
            
            // Обработка кнопки "Очистить выбор"
            if (e.target.matches('#clearDuplicatesSelection')) {
                this.clearDuplicatesSelection();
            }
            
            // Обработчик кликов по адресам в таблице дублей (точная копия из старой версии)
            if (e.target.matches('.clickable-address')) {
                const listingId = e.target.dataset.listingId;
                if (listingId) {
                    this.showListingDetails(listingId);
                }
            }
            
            // Обработчики кнопок фильтра обработки в таблице дублей (точная копия из старой версии)
            if (e.target.matches('.processing-filter-btn') || e.target.closest('.processing-filter-btn')) {
                const button = e.target.matches('.processing-filter-btn') ? e.target : e.target.closest('.processing-filter-btn');
                const rowId = button.dataset.rowId;
                const rowType = button.dataset.rowType;
                this.openProcessingFilter(rowId, rowType);
            }
            
            // Обработчики кнопок удаления активных фильтров (точная копия из старой версии)
            if (e.target.matches('.remove-filter-btn')) {
                const filterType = e.target.dataset.filterType;
                this.removeActiveFilter(filterType);
            }
        });
    }
    
    /**
     * Событие загрузки области
     */
    async onAreaLoaded(area) {
        try {
            console.log('📨 DuplicatesManager: Получено событие AREA_LOADED');
            console.log('🗺️ DuplicatesManager: Область загружена:', area.name);
            
            // Просто инициализируем фильтры - таблица будет инициализирована при получении ADDRESSES_LOADED
            await this.initProcessingFilters();
            
            console.log('✅ DuplicatesManager: Базовая инициализация завершена, ждем адреса...');
            
        } catch (error) {
            console.error('❌ DuplicatesManager: Ошибка при загрузке области:', error);
        }
    }
    
    /**
     * Привязка к панели управления
     */
    bindPanelEvents() {
        // Сворачивание/разворачивание панели
        document.getElementById('duplicatesPanelHeader')?.addEventListener('click', () => {
            this.toggleDuplicatesPanel();
        });
        
        // Привязываем события фильтров
        this.bindProcessingFilterEvents();
    }
    
    /**
     * Загрузка таблицы дублей (как в старой версии)
     */
    async loadDuplicatesTable() {
        // Защита от множественных вызовов
        if (this.isLoadingTable) {
            console.log('⚠️ Таблица дублей уже загружается, пропускаем...');
            return;
        }
        
        this.isLoadingTable = true;
        
        try {
            console.log('📋 Загрузка таблицы дублей');
            
            // Сохраняем состояние открытых child rows перед обновлением
            const expandedRows = this.saveExpandedRowsState();
            
            // Загружаем объявления, которые попадают в область (полигон)
            const allListings = await this.getListingsInArea();
            console.log('📋 Загружено объявлений:', allListings.length);
            if (allListings.length > 0) {
                console.log('🔍 Пример объявления:', allListings[0]);
            }
            
            // Исключаем объявления со статусом "processed"
            const listings = allListings.filter(listing => listing.processing_status !== 'processed');
            console.log('📋 Объявлений после фильтрации (исключены "processed"):', listings.length);
            
            // Загружаем объекты недвижимости
            const objects = await this.getRealEstateObjects();
            console.log('📋 Загружено объектов:', objects.length);
            if (objects.length > 0) {
                console.log('🔍 Пример объекта:', objects[0]);
            }
            
            // Объединяем данные для таблицы
            const tableData = [
                ...listings.map(item => ({...item, type: 'listing'})),
                ...objects.map(item => ({...item, type: 'object'}))
            ];
            
            console.log(`📋 Загружено ${tableData.length} элементов для таблицы дублей (${listings.length} объявлений + ${objects.length} объектов)`);
            console.log('🔍 Первые 3 элемента tableData:', tableData.slice(0, 3));
            
            // Детальная диагностика первого элемента
            if (tableData.length > 0) {
                const firstItem = tableData[0];
                console.log('🔍 ДИАГНОСТИКА первого элемента:');
                console.log('- id:', firstItem.id);
                console.log('- type:', firstItem.type);
                console.log('- status:', firstItem.status);
                console.log('- created_at:', firstItem.created_at);
                console.log('- updated_at:', firstItem.updated_at);
                console.log('- price:', firstItem.price);
                console.log('- address:', firstItem.address);
                console.log('- address_id:', firstItem.address_id);
                console.log('- property_type:', firstItem.property_type);
                console.log('- area_total:', firstItem.area_total);
                console.log('- floor:', firstItem.floor);
                console.log('- floors_total:', firstItem.floors_total);
            }
            
            // Сохраняем данные в переменные класса для использования в других функциях
            this.listings = listings;
            this.objects = objects;
            
            // Очищаем выбранные элементы при перезагрузке
            this.duplicatesState.selectedDuplicates.clear();
            
            // Инициализируем таблицу если нужно
            if (!this.duplicatesTable) {
                console.log('🔧 Инициализируем таблицу дублей...');
                this.initializeDuplicatesTable();
            }
            
            // Обновляем данные в DataTable
            if (this.duplicatesTable) {
                console.log('📊 Обновляем данные в DataTable...');
                this.duplicatesTable.clear();
                this.duplicatesTable.rows.add(tableData);
                this.duplicatesTable.draw();
                
                console.log('✅ Данные добавлены в таблицу, записей:', this.duplicatesTable.rows().count());
                
                // Применяем текущие фильтры (включая статус и фильтры обработки)
                this.applyProcessingFilters();
                
                // Восстанавливаем состояние открытых child rows после небольшой задержки
                setTimeout(() => {
                    this.restoreExpandedRowsState(expandedRows);
                }, 300);
            } else {
                console.error('❌ duplicatesTable не инициализирована!');
            }
            
            // Обновляем UI выбора
            this.updateDuplicatesSelection();
            
        } catch (error) {
            console.error('❌ Ошибка загрузки таблицы дублей:', error);
            if (this.progressManager) {
                this.progressManager.showError('Ошибка загрузки данных: ' + error.message);
            }
        } finally {
            this.isLoadingTable = false;
        }
    }
    
    /**
     * Инициализация таблицы дублей
     */
    initializeDuplicatesTable() {
        const tableElement = document.getElementById('duplicatesTable');
        if (!tableElement) {
            console.error('❌ Таблица дублей не найдена');
            return;
        }
        
        console.log('🔄 Начинаем инициализацию таблицы дублей...');
        console.log('🔍 tableElement:', tableElement);
        console.log('🔍 jQuery доступен:', typeof $ !== 'undefined');
        
        try {
            // Используем jQuery DataTables как в старой версии
            this.duplicatesTable = $('#duplicatesTable').DataTable({
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
                            return `<input type="checkbox" class="duplicate-checkbox focus:ring-indigo-500 h-3 w-3 text-indigo-600 border-gray-300 rounded" data-id="${row.id}" data-type="${row.type}">`;
                        }
                    },
                    {
                        targets: 1, // Фильтр обработки
                        orderable: false,
                        searchable: false,
                        className: 'dt-body-center text-xs',
                        width: '60px',
                        render: function (data, type, row) {
                            return `<button class="text-gray-600 hover:text-gray-900 p-1 processing-filter-btn" data-row-id="${row.id}" data-row-type="${row.type}" title="Фильтр обработки">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                                </svg>
                            </button>`;
                        }
                    },
                    {
                        targets: [3, 4, 5], // Даты
                        className: 'text-xs'
                    },
                    {
                        targets: [6, 7, 8], // Характеристики, адрес, цена, контакт  
                        className: 'text-xs'
                    }
                ],
                columns: [
                    // 0. Чекбокс
                    { 
                        data: null, 
                        title: '<input type="checkbox" id="selectAllDuplicates" class="focus:ring-indigo-500 h-3 w-3 text-indigo-600 border-gray-300 rounded">' 
                    },
                    // 1. Фильтр обработки
                    { 
                        data: null, 
                        title: 'Фильтр'
                    },
                    // 2. Статус
                    { 
                        data: null, 
                        title: 'Статус',
                        render: (data, type, row) => {
                            const isListing = row.type === 'listing';
                            const statusBadges = {
                                'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
                                'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
                                'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
                                'needs_processing': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Требует обработки</span>'
                            };
                            
                            let html = statusBadges[row.status] || `<span class="text-xs text-gray-500">${row.status}</span>`;
                            
                            if (isListing && row.processing_status) {
                                const processingBadges = {
                                    'address_needed': '<br><span class="inline-flex items-center px-1 py-0.5 text-nowrap rounded-full text-xs font-medium bg-orange-100 text-orange-800" style="font-size: 10px;">Определить адрес</span>',
                                    'duplicate_check_needed': '<br><span class="inline-flex items-center text-nowrap px-1 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" style="font-size: 10px;">Обр. на дубли</span>',
                                    'processed': ''
                                };
                                html += processingBadges[row.processing_status] || '';
                            } else if (!isListing) {
                                // Для объектов показываем количество объявлений с кнопкой разворачивания
                                const listingsCount = row.listings_count || 0;
                                const activeCount = row.active_listings_count || 0;
                                if (listingsCount > 0) {
                                    html += `<br><span class="text-xs text-gray-600 cursor-pointer hover:text-blue-600 expand-object-listings" data-object-id="${row.id}" title="Нажмите для просмотра объявлений">
                                        <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                        Объявления: ${listingsCount} (${activeCount} акт.)
                                    </span>`;
                                } else {
                                    html += `<br><span class="text-xs text-gray-600">Объявления: ${listingsCount} (${activeCount} акт.)</span>`;
                                }
                            }
                            
                            return html;
                        }
                    },
                    // 3. Дата создания
                    { 
                        data: 'created', 
                        title: 'Создано',
                        render: (data, type, row) => {
                            // Используем created (дата создания на источнике), а если его нет - то created_at (дата добавления в базу)
                            const dateValue = data || row.created_at;
                            if (!dateValue) return '—';
                            const createdDate = new Date(dateValue);
                            
                            // Для сортировки возвращаем timestamp
                            if (type === 'sort' || type === 'type') {
                                return createdDate.getTime();
                            }
                            
                            const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            
                            // Вычисляем экспозицию объявления (от создания до последнего обновления или до сегодня)
                            const updatedValue = row.updated || row.updated_at;
                            const endDate = updatedValue ? new Date(updatedValue) : new Date();
                            const diffTime = Math.abs(endDate - createdDate);
                            const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            return `<div class="text-xs">
                                ${dateStr}<br>
                                <span class="text-gray-500" style="font-size: 10px;">эксп. ${exposureDays} дн.</span>
                            </div>`;
                        }
                    },
                    // 4. Дата обновления
                    { 
                        data: 'updated', 
                        title: 'Обновлено',
                        render: (data, type, row) => {
                            // Используем updated (дата обновления на источнике), а если его нет - то updated_at (дата обновления в базе)
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
                    // 5. Характеристики
                    { 
                        data: null, 
                        title: 'Характеристики',
                        render: (data, type, row) => {
                            const isListing = row.type === 'listing';
                            const parts = [];
                            
                            // Тип квартиры
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
                            
                            // Площади
                            const areas = [];
                            if (row.area_total) areas.push(row.area_total);
                            if (row.area_living) areas.push(row.area_living);
                            if (row.area_kitchen) areas.push(row.area_kitchen);
                            if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
                            
                            // Этаж/этажность
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
                    // 6. Адрес
                    { 
                        data: 'address', 
                        title: 'Адрес',
                        render: (data, type, row) => {
                            const isListing = row.type === 'listing';
                            const addressFromDb = this.getAddressNameById(row.address_id);
                            
                            if (isListing) {
                                const addressText = data || 'Адрес не указан';
                                let addressFromDbText = addressFromDb || 'Адрес не определен';
                                
                                // Проверяем точность определения адреса и добавляем её в скобках
                                const hasLowConfidence = row.address_match_confidence === 'low' || row.address_match_confidence === 'very_low';
                                const isManualConfidence = row.address_match_confidence === 'manual';
                                const isAddressNotFound = addressFromDbText === 'Адрес не определен';
                                
                                // Добавляем точность в скобках для адресов с низкой точностью
                                if (hasLowConfidence && !isAddressNotFound) {
                                    const confidenceText = row.address_match_confidence === 'low' ? 'Низкая' : 'Очень низкая';
                                    addressFromDbText += ` (${confidenceText})`;
                                } else if (isManualConfidence && !isAddressNotFound) {
                                    addressFromDbText += ` (Подтвержден)`;
                                }
                                
                                const addressClass = addressText === 'Адрес не указан' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800';
                                
                                // Подсвечиваем красным только неопределенные адреса и адреса с низкой точностью (НЕ manual)
                                const addressFromDbClass = (isAddressNotFound || (hasLowConfidence && !isManualConfidence)) ? 'text-red-500' : 'text-gray-500';
                                
                                return `<div class="text-xs max-w-xs">
                                    <div class="${addressClass} cursor-pointer clickable-address truncate" data-listing-id="${row.id}">${addressText}</div>
                                    <div class="${addressFromDbClass} truncate">${addressFromDbText}</div>
                                </div>`;
                            } else {
                                // Для объектов показываем только адрес из базы (кликабельный)
                                const addressText = addressFromDb || 'Адрес не определен';
                                const addressClass = addressText === 'Адрес не определен' ? 'text-red-500' : 'text-blue-600 hover:text-blue-800 cursor-pointer';
                                
                                return `<div class="text-xs max-w-xs">
                                    <div class="${addressClass} truncate clickable-object-address" data-object-id="${row.id}">${addressText}</div>
                                </div>`;
                            }
                        }
                    },
                    // 7. Цена
                    { 
                        data: null, 
                        title: 'Цена',
                        render: (data, type, row) => {
                            const isListing = row.type === 'listing';
                            const priceValue = isListing ? row.price : row.current_price;
                            
                            if (!priceValue) return '<div class="text-xs">—</div>';
                            
                            const price = priceValue.toLocaleString();
                            let pricePerMeter = '';
                            
                            if (row.price_per_meter) {
                                pricePerMeter = row.price_per_meter.toLocaleString();
                            } else if (priceValue && row.area_total) {
                                const calculated = Math.round(priceValue / row.area_total);
                                pricePerMeter = calculated.toLocaleString();
                            }
                            
                            return `<div class="text-xs">
                                <div class="text-green-600 font-medium">${price}</div>
                                ${pricePerMeter ? `<div class="text-gray-500">${pricePerMeter}</div>` : ''}
                            </div>`;
                        }
                    },
                    // 8. Контакт
                    { 
                        data: null, 
                        title: 'Контакт',
                        render: (data, type, row) => {
                            const isListing = row.type === 'listing';
                            
                            if (isListing) {
                                const sellerType = row.seller_type === 'private' ? 'Собственник' : 
                                                 row.seller_type === 'agency' ? 'Агент' : 
                                                 row.seller_type === 'agent' ? 'Агент' :
                                                 row.seller_type === 'owner' ? 'Собственник' :
                                                 row.seller_type || 'Не указано';
                                
                                const sellerName = row.seller_name || 'Не указано';
                                
                                return `<div class="text-xs max-w-xs">
                                    <div class="text-gray-900 truncate" title="${sellerType}">${sellerType}</div>
                                    <div class="text-gray-500 truncate" title="${sellerName}">${sellerName}</div>
                                </div>`;
                            } else {
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
                    }
                ],
            initComplete: () => {
                console.log('🎉 DataTable инициализирована');
                this.restoreDuplicatesPanelState();
            },
            drawCallback: () => {
                console.log('🔄 DataTable перерисована, строк отображено:', this.duplicatesTable ? this.duplicatesTable.rows({page: 'current'}).count() : 0);
            }
        });
        
        console.log('✅ Таблица дублей инициализирована');
        console.log('🔍 duplicatesTable объект:', this.duplicatesTable);
        
        } catch (error) {
            console.error('❌ Ошибка инициализации таблицы дублей:', error);
            throw error;
        }
    }
    
    // Метод prepareDuplicatesTableData больше не нужен - данные передаются напрямую в DataTables
    
    /**
     * Получение объявлений в области (точная копия из старой версии)
     */
    async getListingsInArea() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea || !currentArea.polygon || currentArea.polygon.length === 0) {
            console.log('Полигон области отсутствует или пуст');
            return [];
        }

        try {
            const allListings = await window.db.getAll('listings');
            console.log(`Всего объявлений в БД: ${allListings.length}`);
            console.log(`Полигон области (${currentArea.polygon.length} точек):`, currentArea.polygon);
            
            // Фильтрация объявлений с координатами
            const listingsWithCoords = allListings.filter(listing => {
                // Проверяем различные форматы координат
                const hasCoordinatesObject = listing.coordinates && 
                                           (listing.coordinates.lat || listing.coordinates.latitude) && 
                                           (listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude);
                const hasDirectCoords = (listing.lat || listing.latitude) && 
                                      (listing.lng || listing.lon || listing.longitude);
                return hasCoordinatesObject || hasDirectCoords;
            });
            
            console.log(`Объявлений с координатами: ${listingsWithCoords.length}`);
            
            // Диагностика: границы полигона и объявлений
            if (currentArea.polygon && currentArea.polygon.length > 0 && listingsWithCoords.length > 0) {
                const listingBounds = {
                    minLat: Math.min(...listingsWithCoords.map(l => parseFloat(l.coordinates?.lat || l.lat))),
                    maxLat: Math.max(...listingsWithCoords.map(l => parseFloat(l.coordinates?.lat || l.lat))),
                    minLng: Math.min(...listingsWithCoords.map(l => parseFloat(l.coordinates?.lng || l.lng))),
                    maxLng: Math.max(...listingsWithCoords.map(l => parseFloat(l.coordinates?.lng || l.lng)))
                };
                console.log('Границы объявлений:', listingBounds);
            }

            // Используем пространственный индекс для быстрого поиска если доступен
            if (window.spatialIndexManager) {
                await this.ensureListingsIndex(allListings);
                const listingsInArea = window.spatialIndexManager.findInArea('listings', currentArea.polygon);
                console.log(`Объявлений в области (через пространственный индекс): ${listingsInArea.length}`);
                return listingsInArea.map(listing => ({...listing, type: 'listing'}));
            }

            // Fallback: ручная проверка каждого объявления
            const listingsInArea = [];
            for (const listing of listingsWithCoords) {
                let coords = null;
                if (listing.coordinates) {
                    coords = {
                        lat: parseFloat(listing.coordinates.lat || listing.coordinates.latitude),
                        lng: parseFloat(listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude)
                    };
                } else if (listing.lat || listing.latitude) {
                    coords = {
                        lat: parseFloat(listing.lat || listing.latitude),
                        lng: parseFloat(listing.lng || listing.lon || listing.longitude)
                    };
                }

                if (coords && this.isPointInPolygon([coords.lat, coords.lng], currentArea.polygon)) {
                    listingsInArea.push({...listing, type: 'listing'});
                }
            }

            console.log(`Объявлений в области: ${listingsInArea.length}`);

            // Если результатов нет, выводим диагностическую информацию
            if (listingsInArea.length === 0 && listingsWithCoords.length > 0) {
                console.log('ДИАГНОСТИКА: Ни одно объявление не попало в полигон');
                
                // Проверяем первые 3 объявления вручную для отладки
                const testListings = listingsWithCoords.slice(0, 3);
                console.log('Тестируем первые 3 объявления:');
                testListings.forEach(listing => {
                    let normalizedCoords = null;
                    if (listing.coordinates) {
                        normalizedCoords = {
                            lat: parseFloat(listing.coordinates.lat || listing.coordinates.latitude),
                            lng: parseFloat(listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude)
                        };
                    }
                    
                    const isInside = normalizedCoords ? this.isPointInPolygon([normalizedCoords.lat, normalizedCoords.lng], currentArea.polygon) : false;
                    console.log(`Объявление ${listing.id}:`, {
                        originalCoords: listing.coordinates,
                        normalizedCoords: normalizedCoords,
                        isInside: isInside,
                        title: listing.title || 'Без названия',
                        source: listing.source
                    });
                });
            }

            return listingsInArea;
        } catch (error) {
            console.error('Error getting listings in area:', error);
            return [];
        }
    }
    
    /**
     * Обеспечение наличия актуального пространственного индекса для объявлений (из старой версии)
     */
    async ensureListingsIndex(listings) {
        try {
            // Принудительно удаляем старый индекс для пересоздания с новой логикой
            if (window.spatialIndexManager && window.spatialIndexManager.hasIndex('listings')) {
                window.spatialIndexManager.removeIndex('listings');
            }

            // Создаем новый индекс с исправленной функцией извлечения координат
            if (window.spatialIndexManager && !window.spatialIndexManager.hasIndex('listings')) {
                await window.spatialIndexManager.createIndex(
                    'listings',
                    listings,
                    (listing) => {
                        // Поддерживаем различные форматы координат
                        let coords = null;
                        if (listing.coordinates) {
                            coords = {
                                lat: parseFloat(listing.coordinates.lat || listing.coordinates.latitude),
                                lng: parseFloat(listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude)
                            };
                        }
                        // Прямые координаты в объекте
                        else if (listing.lat || listing.latitude) {
                            coords = {
                                lat: parseFloat(listing.lat || listing.latitude),
                                lng: parseFloat(listing.lng || listing.lon || listing.longitude)
                            };
                        }
                        
                        return coords;
                    }
                );
            }
        } catch (error) {
            console.error('Error ensuring listings index:', error);
        }
    }
    
    /**
     * Проверка нахождения точки в полигоне
     */
    isPointInPolygon(point, polygon) {
        try {
            const [lat, lng] = point;
            let inside = false;
            
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                // Полигон содержит объекты {lat: ..., lng: ...}
                const xi = polygon[i].lat;
                const yi = polygon[i].lng;
                const xj = polygon[j].lat;
                const yj = polygon[j].lng;
                
                if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            
            return inside;
        } catch (error) {
            console.error('❌ Ошибка в isPointInPolygon:', error, { point, polygon });
            return false;
        }
    }
    
    /**
     * Получение объектов недвижимости в области
     */
    async getRealEstateObjects() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea || !currentArea.polygon) {
                console.log('⚠️ Нет области или полигона');
                return [];
            }
            
            // Используем realEstateObjectManager для получения объектов с фильтрами
            if (window.realEstateObjectManager) {
                const objects = await window.realEstateObjectManager.getObjectsWithFilters();
                return objects.map(object => ({
                    ...object,
                    type: 'object'
                }));
            }
            
            // Fallback: базовая логика
            const allObjects = await window.db.getAll('objects');
            const addresses = await window.db.getAll('addresses');
            const addressesMap = new Map(addresses.map(addr => [addr.id, addr]));
            
            const filteredObjects = [];
            for (const object of allObjects) {
                if (object.status === 'deleted') continue;
                
                const address = addressesMap.get(object.address_id);
                if (address && address.latitude && address.longitude) {
                    const point = [address.latitude, address.longitude];
                    if (this.isPointInPolygon(point, currentArea.polygon)) {
                        filteredObjects.push({
                            ...object,
                            address: address,
                            type: 'object'
                        });
                    }
                }
            }
            
            console.log(`🏠 Найдено ${filteredObjects.length} объектов недвижимости в области`);
            return filteredObjects;
            
        } catch (error) {
            console.error('❌ Ошибка получения объектов недвижимости:', error);
            return [];
        }
    }
    
    /**
     * Основная обработка дублей
     */
    async processDuplicates() {
        if (this.duplicatesState.processing) {
            this.progressManager.showInfo('Обработка дублей уже выполняется');
            return;
        }
        
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            this.progressManager.showError('Область не выбрана');
            return;
        }
        
        try {
            this.duplicatesState.processing = true;
            this.duplicatesState.currentAlgorithm = 'basic';
            
            this.progressManager.updateProgressBar('duplicates', 0, 'Запуск обработки дублей...');
            
            // Инициализируем детектор дублей
            const duplicateDetector = new DuplicateDetector();
            
            // Получаем объявления для обработки
            const listings = await this.getListingsInArea();
            const needProcessing = listings.filter(listing => listing.processing_status === 'duplicate_check_needed');
            
            if (needProcessing.length === 0) {
                this.progressManager.showInfo('Нет объявлений для обработки дублей');
                return;
            }
            
            this.progressManager.updateProgressBar('duplicates', 20, 
                `Обработка ${needProcessing.length} объявлений...`);
            
            // Обрабатываем дубли
            const results = await duplicateDetector.process(needProcessing, currentArea.id);
            
            this.progressManager.updateProgressBar('duplicates', 80, 'Сохранение результатов...');
            
            // Сохраняем результаты
            await this.saveDuplicateResults(results);
            
            this.progressManager.updateProgressBar('duplicates', 100, 'Обработка завершена');
            
            // Обновляем данные
            await this.loadDuplicatesTable();
            await this.updateDuplicatesStats();
            
            // Уведомляем о завершении
            this.eventBus.emit(CONSTANTS.EVENTS.DUPLICATES_PROCESSED, {
                area: currentArea,
                algorithm: 'basic',
                processed: results.processed,
                merged: results.merged,
                timestamp: new Date()
            });
            
            this.progressManager.showSuccess(
                `Обработка дублей завершена. Обработано: ${results.processed}, объединено: ${results.merged}`
            );
            
        } catch (error) {
            console.error('Error processing duplicates:', error);
            this.progressManager.showError('Ошибка обработки дублей: ' + error.message);
            
        } finally {
            this.duplicatesState.processing = false;
            
            // Скрываем прогресс-бар через 2 секунды
            setTimeout(() => {
                this.progressManager.updateProgressBar('duplicates', 0, '');
            }, 2000);
        }
    }
    
    /**
     * Продвинутая обработка дублей
     */
    async processDuplicatesAdvanced() {
        if (this.duplicatesState.processing) {
            this.progressManager.showInfo('Обработка дублей уже выполняется');
            return;
        }
        
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            this.progressManager.showError('Область не выбрана');
            return;
        }
        
        try {
            this.duplicatesState.processing = true;
            this.duplicatesState.currentAlgorithm = 'advanced';
            
            this.progressManager.updateProgressBar('duplicates', 0, 'Запуск продвинутой обработки дублей...');
            
            // Проверяем наличие продвинутого детектора
            if (!window.advancedDuplicateDetector) {
                throw new Error('Продвинутый детектор дублей не доступен');
            }
            
            // Получаем объявления для обработки
            const listings = await this.getListingsInArea();
            const needProcessing = listings.filter(listing => listing.processing_status === 'duplicate_check_needed');
            
            if (needProcessing.length === 0) {
                this.progressManager.showInfo('Нет объявлений для обработки дублей');
                return;
            }
            
            this.progressManager.updateProgressBar('duplicates', 20, 
                `Продвинутая обработка ${needProcessing.length} объявлений...`);
            
            // Обрабатываем дубли продвинутым алгоритмом
            const results = await window.advancedDuplicateDetector.process(needProcessing, currentArea.id);
            
            this.progressManager.updateProgressBar('duplicates', 80, 'Сохранение результатов...');
            
            // Сохраняем результаты
            await this.saveDuplicateResults(results);
            
            this.progressManager.updateProgressBar('duplicates', 100, 'Продвинутая обработка завершена');
            
            // Обновляем данные
            await this.loadDuplicatesTable();
            await this.updateDuplicatesStats();
            
            // Уведомляем о завершении
            this.eventBus.emit(CONSTANTS.EVENTS.DUPLICATES_PROCESSED, {
                area: currentArea,
                algorithm: 'advanced',
                processed: results.processed,
                merged: results.merged,
                timestamp: new Date()
            });
            
            this.progressManager.showSuccess(
                `Продвинутая обработка дублей завершена. Обработано: ${results.processed}, объединено: ${results.merged}`
            );
            
        } catch (error) {
            console.error('Error processing duplicates (advanced):', error);
            this.progressManager.showError('Ошибка продвинутой обработки дублей: ' + error.message);
            
        } finally {
            this.duplicatesState.processing = false;
            
            // Скрываем прогресс-бар через 2 секунды
            setTimeout(() => {
                this.progressManager.updateProgressBar('duplicates', 0, '');
            }, 2000);
        }
    }
    
    /**
     * Сохранение результатов обработки дублей
     */
    async saveDuplicateResults(results) {
        try {
            // Сохраняем обновленные объявления
            if (results.updatedListings) {
                for (const listing of results.updatedListings) {
                    await window.db.update('listings', listing);
                }
            }
            
            // Сохраняем новые объекты недвижимости
            if (results.newRealEstateObjects) {
                for (const object of results.newRealEstateObjects) {
                    await window.db.add('real_estate_objects', object);
                }
            }
            
            await Helpers.debugLog('✅ Результаты обработки дублей сохранены');
            
        } catch (error) {
            console.error('Error saving duplicate results:', error);
            throw error;
        }
    }
    
    /**
     * Обработка выбора дубля
     */
    handleDuplicateSelection(checkbox) {
        console.log('🔄 handleDuplicateSelection called for checkbox:', checkbox);
        const itemId = checkbox.dataset.id;
        const itemType = checkbox.dataset.type;
        const key = `${itemType}_${itemId}`;

        console.log('🔄 Checkbox data:', { itemId, itemType, key, checked: checkbox.checked });

        if (checkbox.checked) {
            this.duplicatesState.selectedDuplicates.add(key);
        } else {
            this.duplicatesState.selectedDuplicates.delete(key);
        }

        console.log('📊 Selected duplicates after change:', Array.from(this.duplicatesState.selectedDuplicates));

        this.updateDuplicatesSelection();
        this.updateSelectAllCheckbox();
    }
    
    /**
     * Обновление состояния чекбокса "Выбрать все" (точная копия из старой версии)
     */
    updateSelectAllCheckbox() {
        const allCheckboxes = document.querySelectorAll('.duplicate-checkbox');
        const selectAllCheckbox = document.getElementById('selectAllDuplicates');
        
        if (selectAllCheckbox && allCheckboxes.length > 0) {
            const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
            selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
        }
    }
    
    /**
     * Выбор всех дублей (точная копия из старой версии)
     */
    selectAllDuplicates(checked) {
        const checkboxes = document.querySelectorAll('.duplicate-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            this.handleDuplicateSelection(checkbox);
        });
    }
    
    /**
     * Очистка выбора дублей
     */
    clearDuplicatesSelection() {
        this.duplicatesState.selectedDuplicates.clear();
        document.querySelectorAll('.duplicate-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        const selectAllCheckbox = document.getElementById('selectAllDuplicates');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        this.updateDuplicatesSelection();
    }
    
    /**
     * Обновление UI выбора дублей (точная копия из старой версии)
     */
    updateDuplicatesSelection() {
        console.log('🔄 updateDuplicatesSelection called, selectedCount:', this.duplicatesState.selectedDuplicates.size);
        const selectedCount = this.duplicatesState.selectedDuplicates.size;
        const selectedInfo = document.getElementById('selectedItemsInfo');
        const selectedCountEl = document.getElementById('selectedItemsCount');
        const mergeBtnEl = document.getElementById('mergeDuplicatesBtn');
        const splitBtnEl = document.getElementById('splitDuplicatesBtn');
        const correctAddressBtnEl = document.getElementById('correctAddressBtn');

        if (selectedCount > 0) {
            if (selectedInfo) selectedInfo.classList.remove('hidden');
            
            const elementText = selectedCount === 1 ? 'элемент выбран' : 'элементов выбрано';
            if (selectedCountEl) selectedCountEl.textContent = `${selectedCount} ${elementText}`;
            
            if (mergeBtnEl) mergeBtnEl.disabled = selectedCount < 1;
            if (splitBtnEl) splitBtnEl.disabled = false;
            
            // Показываем кнопку "Верный адрес" только при фильтре "Определить адрес"
            let processingStatusFilter = '';
            if (this.processingStatusSlimSelect) {
                const selected = this.processingStatusSlimSelect.getSelected();
                processingStatusFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            // Также проверим значение элемента напрямую
            const directValue = document.getElementById('processingStatusFilter')?.value || '';
            
            const actualFilter = processingStatusFilter || directValue;
            
            if (correctAddressBtnEl) {
                if (actualFilter === 'address_needed') {
                    correctAddressBtnEl.classList.remove('hidden');
                    correctAddressBtnEl.disabled = false;
                } else {
                    correctAddressBtnEl.classList.add('hidden');
                }
            }
        } else {
            if (selectedInfo) selectedInfo.classList.add('hidden');
            if (mergeBtnEl) mergeBtnEl.disabled = true;
            if (splitBtnEl) splitBtnEl.disabled = true;
            if (correctAddressBtnEl) correctAddressBtnEl.classList.add('hidden');
        }
        
        // Обновляем текст кнопок
        const actionPanel = document.getElementById('duplicatesActionPanel');
        if (actionPanel) {
            actionPanel.style.display = selectedCount > 0 ? 'block' : 'none';
        }
    }
    
    /**
     * Обновление главного чекбокса
     */
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAllDuplicates');
        if (!selectAllCheckbox) return;
        
        const allCheckboxes = document.querySelectorAll('.duplicate-checkbox:not(:disabled)');
        const checkedCheckboxes = document.querySelectorAll('.duplicate-checkbox:checked:not(:disabled)');
        
        if (checkedCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCheckboxes.length === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
    
    /**
     * Объединение дублей
     */
    async mergeDuplicates() {
        if (this.duplicatesState.selectedDuplicates.size < 2) {
            this.progressManager.showWarning('Выберите минимум 2 элемента для объединения');
            return;
        }
        
        try {
            const selectedItems = Array.from(this.duplicatesState.selectedDuplicates);
            const listings = [];
            
            // Получаем данные выбранных объявлений
            for (const itemKey of selectedItems) {
                const [type, id] = itemKey.split('_');
                if (type === 'listing') {
                    const listing = await window.db.get('listings', id);
                    if (listing) {
                        listings.push(listing);
                    }
                }
            }
            
            if (listings.length < 2) {
                this.progressManager.showWarning('Недостаточно объявлений для объединения');
                return;
            }
            
            // Проверяем, что все объявления относятся к одному адресу
            const addressIds = [...new Set(listings.map(l => l.address_id))];
            if (addressIds.length > 1) {
                this.progressManager.showWarning('Можно объединять только объявления одного адреса');
                return;
            }
            
            // Создаем объект недвижимости
            const realEstateObject = await this.createRealEstateObject(listings);
            
            // Сохраняем объект
            await window.db.add('objects', realEstateObject);
            
            // Обновляем статусы объявлений
            for (const listing of listings) {
                await window.db.update('listings', {
                    ...listing,
                    status: 'merged',
                    real_estate_object_id: realEstateObject.id,
                    updated_at: new Date()
                });
            }
            
            // Обновляем данные
            await this.loadDuplicatesTable();
            await this.updateDuplicatesStats();
            
            // Уведомляем об объединении
            this.eventBus.emit(CONSTANTS.EVENTS.DUPLICATES_MERGED, {
                objectId: realEstateObject.id,
                listingIds: listings.map(l => l.id),
                timestamp: new Date()
            });
            
            this.progressManager.showSuccess(`Объединено ${listings.length} объявлений в объект недвижимости`);
            
        } catch (error) {
            console.error('Error merging duplicates:', error);
            this.progressManager.showError('Ошибка объединения дублей: ' + error.message);
        }
    }
    
    /**
     * Разбивка дублей
     */
    async splitDuplicates() {
        if (this.duplicatesState.selectedDuplicates.size === 0) {
            this.progressManager.showWarning('Выберите объекты для разбивки');
            return;
        }
        
        // Подтверждение операции
        const confirmed = confirm('Вы уверены, что хотите разбить выбранные объекты на отдельные объявления?');
        if (!confirmed) {
            return;
        }
        
        try {
            const selectedItems = Array.from(this.duplicatesState.selectedDuplicates);
            let splitCount = 0;
            
            // Обрабатываем каждый выбранный объект
            for (const itemKey of selectedItems) {
                const [type, id] = itemKey.split('_');
                if (type === 'real_estate_object') {
                    // Получаем объект недвижимости
                    const realEstateObject = await window.db.get('objects', id);
                    if (realEstateObject) {
                        // Получаем связанные объявления
                        const allListings = await window.db.getAll('listings');
                        const relatedListings = allListings.filter(l => l.real_estate_object_id === id);
                        
                        // Восстанавливаем статус объявлений
                        for (const listing of relatedListings) {
                            await window.db.update('listings', {
                                ...listing,
                                status: 'duplicate_check_needed',
                                real_estate_object_id: null,
                                updated_at: new Date()
                            });
                        }
                        
                        // Удаляем объект недвижимости
                        await window.db.delete('objects', id);
                        
                        splitCount++;
                    }
                }
            }
            
            if (splitCount === 0) {
                this.progressManager.showWarning('Нет подходящих объектов для разбивки');
                return;
            }
            
            // Обновляем данные
            await this.loadDuplicatesTable();
            await this.updateDuplicatesStats();
            
            // Уведомляем о разбивке
            this.eventBus.emit(CONSTANTS.EVENTS.DUPLICATES_SPLIT, {
                splitCount,
                timestamp: new Date()
            });
            
            this.progressManager.showSuccess(`Разбито ${splitCount} объектов на отдельные объявления`);
            
        } catch (error) {
            console.error('Error splitting duplicates:', error);
            this.progressManager.showError('Ошибка разбивки дублей: ' + error.message);
        }
    }
    
    /**
     * Создание объекта недвижимости из объявлений
     */
    async createRealEstateObject(listings) {
        const firstListing = listings[0];
        const address = await window.db.get('addresses', firstListing.address_id);
        
        // Вычисляем статистику
        const prices = listings.filter(l => l.price).map(l => l.price);
        const areas = listings.filter(l => l.area).map(l => l.area);
        
        const averagePrice = prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : null;
        const averageArea = areas.length > 0 ? areas.reduce((sum, a) => sum + a, 0) / areas.length : null;
        
        return {
            id: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: `Объект: ${address?.address || 'Неизвестный адрес'}`,
            address_id: firstListing.address_id,
            map_area_id: firstListing.map_area_id,
            property_type: firstListing.property_type || 'apartment',
            status: 'active',
            listings_count: listings.length,
            average_price: averagePrice,
            min_price: prices.length > 0 ? Math.min(...prices) : null,
            max_price: prices.length > 0 ? Math.max(...prices) : null,
            average_area: averageArea,
            created_at: new Date(),
            updated_at: new Date()
        };
    }
    
    /**
     * Применение фильтров обработки (как в старой версии)
     */
    async applyProcessingFilters() {
        try {
            if (!this.duplicatesTable) {
                console.log('⚠️ applyProcessingFilters: duplicatesTable не инициализирована');
                return;
            }
            
            // Получаем значения фильтров из SlimSelect и обычных элементов
            let addressFilter = '';
            if (this.processingAddressSlimSelect) {
                const selected = this.processingAddressSlimSelect.getSelected();
                addressFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            let propertyTypeFilter = '';
            if (this.processingPropertyTypeSlimSelect) {
                const selected = this.processingPropertyTypeSlimSelect.getSelected();
                propertyTypeFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            let processingStatusFilter = '';
            if (this.processingStatusSlimSelect) {
                const selected = this.processingStatusSlimSelect.getSelected();
                processingStatusFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            const floorFilter = document.getElementById('processingFloorFilter')?.value || '';
            
            // Получаем значение основного фильтра статусов
            const statusFilter = document.getElementById('duplicatesStatusFilter')?.value || 'all';
            
            console.log('🔧 Применение фильтров:', {
                addressFilter,
                propertyTypeFilter,
                floorFilter,
                processingStatusFilter,
                statusFilter
            });
            
            // Очищаем предыдущие кастомные фильтры для этой таблицы
            $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(fn => 
                !fn.toString().includes('duplicatesTable')
            );
            
            // Применяем объединенный фильтр к DataTables
            $.fn.dataTable.ext.search.push((settings, data, dataIndex) => {
                // Проверяем, что это наша таблица
                if (settings.nTable.id !== 'duplicatesTable') {
                    return true;
                }
                
                const rowData = this.duplicatesTable.row(dataIndex).data();
                
                // Основной фильтр по статусу (активный/архивный)
                if (statusFilter !== 'all' && rowData.status !== statusFilter) {
                    return false;
                }
                
                // Фильтры обработки применяются только если они заполнены
                
                // Фильтр по адресу (из справочника)
                if (addressFilter && rowData.address_id !== addressFilter) {
                    return false;
                }
                
                // Фильтр по типу недвижимости
                if (propertyTypeFilter && rowData.property_type !== propertyTypeFilter) {
                    return false;
                }
                
                // Фильтр по этажу
                if (floorFilter && rowData.floor != parseInt(floorFilter)) {
                    return false;
                }
                
                // Фильтр по статусу обработки (только для объявлений)
                if (processingStatusFilter) {
                    // Объекты недвижимости не имеют статуса обработки, поэтому скрываем их при фильтрации
                    if (rowData.type === 'object') {
                        return false;
                    }
                    
                    // Для объявлений применяем фильтр по статусу обработки
                    if (processingStatusFilter === 'address_needed') {
                        // Показываем объявления:
                        // 1. С processing_status === 'address_needed' 
                        // 2. ИЛИ с низкой точностью определения адреса (address_match_confidence: 'low' или 'very_low')
                        // НО НЕ показываем адреса со статусом 'manual' (уже подтвержденные)
                        const hasAddressNeededStatus = rowData.processing_status === 'address_needed';
                        const hasLowAddressConfidence = rowData.address_match_confidence === 'low' || rowData.address_match_confidence === 'very_low';
                        const isManualConfidence = rowData.address_match_confidence === 'manual';
                        
                        // Скрываем если нет нужного статуса ИЛИ если адрес уже подтвержден вручную
                        if ((!hasAddressNeededStatus && !hasLowAddressConfidence) || isManualConfidence) {
                            return false;
                        }
                    } else {
                        // Для остальных фильтров - простое сравнение
                        if (rowData.processing_status !== processingStatusFilter) {
                            return false;
                        }
                    }
                }
                
                return true;
            });
            
            // Перерисовываем таблицу
            this.duplicatesTable.draw();
            
            console.log('🔍 После применения фильтров - видимых строк:', this.duplicatesTable.rows({search: 'applied'}).count());
            
            // Обновляем отображение активных фильтров
            this.updateActiveFiltersDisplay();
            
            // Показываем кнопку "Верный адрес" только при фильтре "address_needed"
            const correctAddressBtn = document.getElementById('correctAddressBtn');
            if (correctAddressBtn) {
                if (processingStatusFilter === 'address_needed') {
                    correctAddressBtn.classList.remove('hidden');
                } else {
                    correctAddressBtn.classList.add('hidden');
                }
            }
            
        } catch (error) {
            console.error('❌ Ошибка при применении фильтров:', error);
            if (this.progressManager) {
                this.progressManager.showError('Ошибка при применении фильтров: ' + error.message);
            }
        }
    }
    
    /**
     * Получение названия адреса по ID (точная копия из старой версии)
     */
    getAddressNameById(addressId) {
        if (!addressId) return '';
        const addresses = this.dataState.getState('addresses') || [];
        const address = addresses.find(addr => addr.id === addressId);
        return address ? address.address : '';
    }
    
    /**
     * Показать детали объявления в модальном окне (точная копия из старой версии)
     */
    async showListingDetails(listingId) {
        try {
            console.log('📋 Показываем детали объявления:', listingId);
            
            // Сначала ищем в загруженных объявлениях
            const listings = this.dataState.getState('listings') || [];
            let listing = listings.find(l => l.id === listingId);
            
            // Если не найдено, ищем в базе данных
            if (!listing) {
                console.log('Объявление не найдено в состоянии, ищем в базе данных:', listingId);
                listing = await window.db.get('listings', listingId);
            }
            
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                if (this.progressManager) {
                    this.progressManager.showError('Объявление не найдено');
                }
                return;
            }

            // Используем существующую логику модального окна из MapManager
            this.eventBus.emit(CONSTANTS.EVENTS.MODAL_OPENED, {
                modalType: CONSTANTS.MODAL_TYPES.LISTING_DETAIL,
                listing: listing
            });
            
            console.log('👁️ DuplicatesManager: Запрошен просмотр деталей объявления:', listing.id);
            
        } catch (error) {
            console.error('❌ Ошибка показа деталей объявления:', error);
            if (this.progressManager) {
                this.progressManager.showError('Ошибка загрузки деталей объявления: ' + error.message);
            }
        }
    }
    
    /**
     * Открыть фильтр обработки с данными из строки таблицы (точная копия из старой версии)
     */
    async openProcessingFilter(id, type) {
        try {
            console.log(`🔍 Заполнение фильтра обработки для ${type} с ID: ${id}`);
            
            let dataForFilter = null;
            
            if (type === 'listing') {
                // Получаем данные объявления
                dataForFilter = await window.db.get('listings', id);
                if (!dataForFilter) {
                    if (this.progressManager) {
                        this.progressManager.showError('Не удалось загрузить данные объявления');
                    }
                    return;
                }
            } else if (type === 'object') {
                // Получаем данные объекта недвижимости
                dataForFilter = await window.db.get('objects', id);
                if (!dataForFilter) {
                    if (this.progressManager) {
                        this.progressManager.showError('Не удалось загрузить данные объекта недвижимости');
                    }
                    return;
                }
            } else {
                if (this.progressManager) {
                    this.progressManager.showError('Неизвестный тип элемента');
                }
                return;
            }
            
            // Заполняем фильтры данными
            await this.fillProcessingFilters(dataForFilter);
            
            const elementType = type === 'listing' ? 'объявления' : 'объекта недвижимости';
            if (this.progressManager) {
                this.progressManager.showSuccess(`Фильтр обработки заполнен данными из ${elementType}`);
            }
            
        } catch (error) {
            console.error('❌ Ошибка при заполнении фильтра обработки:', error);
            if (this.progressManager) {
                this.progressManager.showError('Ошибка при заполнении фильтра обработки: ' + error.message);
            }
        }
    }
    
    /**
     * Заполнение фильтров обработки данными из объявления или объекта недвижимости
     */
    async fillProcessingFilters(data) {
        try {
            console.log('📝 Заполняем фильтры данными:', data);
            
            // Заполняем адрес из справочника адресов
            if (data.address_id && this.processingAddressSlimSelect) {
                this.processingAddressSlimSelect.setSelected([data.address_id]);
                this.showClearButton('clearAddressFilterBtn');
            }
            
            // Заполняем тип недвижимости
            if (data.property_type && this.processingPropertyTypeSlimSelect) {
                this.processingPropertyTypeSlimSelect.setSelected([data.property_type]);
                this.showClearButton('clearPropertyTypeFilterBtn');
            }
            
            // Заполняем этаж (точная копия из старой версии)
            if (data.floor) {
                const floorInput = document.getElementById('processingFloorFilter');
                if (floorInput) {
                    floorInput.value = data.floor;
                    this.showClearButton('clearFloorFilterBtn');
                }
            }
            
            // Статус обработки НЕ заполняем при нажатии на кнопку - он работает как глобальный фильтр
            
            // Применяем фильтры
            await this.applyProcessingFilters();
            
        } catch (error) {
            console.error('❌ Ошибка заполнения фильтров:', error);
        }
    }
    
    /**
     * Показать кнопку очистки фильтра
     */
    showClearButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.remove('hidden');
        }
    }
    
    /**
     * Удаление активного фильтра (точная копия из старой версии)
     */
    removeActiveFilter(filterType) {
        try {
            console.log('🗑️ Удаляем активный фильтр:', filterType);
            
            switch (filterType) {
                case 'address':
                    this.clearSingleFilter('processingAddressFilter');
                    break;
                case 'property_type':
                    this.clearSingleFilter('processingPropertyTypeFilter');
                    break;
                case 'floor':
                    this.clearSingleFilter('processingFloorFilter');
                    break;
                case 'status':
                    this.clearSingleFilter('processingStatusFilter');
                    break;
                default:
                    console.warn('⚠️ Неизвестный тип фильтра для удаления:', filterType);
            }
        } catch (error) {
            console.error('❌ Ошибка при удалении активного фильтра:', error);
        }
    }
    
    /**
     * Очистка отдельного фильтра (точная копия из старой версии)
     */
    clearSingleFilter(filterId) {
        try {
            console.log('🧹 Очищаем фильтр:', filterId);
            
            // Определяем тип фильтра и очищаем соответствующим образом
            switch (filterId) {
                case 'processingAddressFilter':
                    if (this.processingAddressSlimSelect) {
                        this.processingAddressSlimSelect.setSelected([]);
                    }
                    this.hideClearButton('clearAddressFilterBtn');
                    break;
                case 'processingPropertyTypeFilter':
                    if (this.processingPropertyTypeSlimSelect) {
                        this.processingPropertyTypeSlimSelect.setSelected([]);
                    }
                    this.hideClearButton('clearPropertyTypeFilterBtn');
                    break;
                case 'processingFloorFilter':
                    const filterElement = document.getElementById('processingFloorFilter');
                    if (filterElement) {
                        filterElement.value = '';
                    }
                    this.hideClearButton('clearFloorFilterBtn');
                    break;
                case 'processingStatusFilter':
                    if (this.processingStatusSlimSelect) {
                        this.processingStatusSlimSelect.setSelected([]);
                    }
                    this.hideClearButton('clearProcessingStatusFilterBtn');
                    break;
                default:
                    console.warn('⚠️ Неизвестный фильтр для очистки:', filterId);
            }
            
            // Применяем фильтры после очистки
            this.applyProcessingFilters();
            
        } catch (error) {
            console.error('❌ Ошибка при очистке фильтра:', error);
        }
    }
    
    /**
     * Скрыть кнопку очистки фильтра
     */
    hideClearButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.add('hidden');
        }
    }
    
    /**
     * Обновление статистики дублей
     */
    async updateDuplicatesStats() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) return;
            
            // Получаем данные для статистики
            const listings = await this.getListingsInArea();
            const realEstateObjects = await this.getRealEstateObjects();
            
            // Подсчитываем статистику
            const stats = this.calculateDuplicatesStats(listings, realEstateObjects);
            
            // Сохраняем статистику
            this.duplicatesStats = stats;
            
            // Обновляем UI
            this.updateDuplicatesCounters(stats);
            this.updateDuplicatesStatusChart(stats);
            this.updateDuplicatesAccuracyStats();
            
            // Сохраняем в состояние
            this.dataState.setState('duplicatesStats', stats);
            
        } catch (error) {
            console.error('Error updating duplicates stats:', error);
        }
    }
    
    /**
     * Расчет статистики дублей
     */
    calculateDuplicatesStats(listings, realEstateObjects) {
        const statusCounts = {
            duplicate_check_needed: 0,
            duplicate_processed: 0,
            merged: 0,
            no_duplicates: 0
        };
        
        // Подсчитываем статусы объявлений
        listings.forEach(listing => {
            if (statusCounts.hasOwnProperty(listing.status)) {
                statusCounts[listing.status]++;
            }
        });
        
        // Добавляем объекты недвижимости как "merged"
        statusCounts.merged += realEstateObjects.length;
        
        const total = listings.length;
        const needProcessing = statusCounts.duplicate_check_needed;
        const processed = statusCounts.duplicate_processed + statusCounts.no_duplicates;
        const merged = statusCounts.merged;
        
        // Расчет эффективности
        const efficiency = total > 0 ? ((processed + merged) / total) * 100 : 0;
        
        return {
            total,
            needProcessing,
            processed,
            merged,
            efficiency: Math.round(efficiency),
            statusCounts
        };
    }
    
    /**
     * Обновление счетчиков дублей
     */
    updateDuplicatesCounters(stats) {
        const elements = {
            duplicatesNeedProcessing: document.getElementById('duplicatesNeedProcessing'),
            duplicatesProcessed: document.getElementById('duplicatesProcessed'),
            duplicatesMerged: document.getElementById('duplicatesMerged'),
            duplicatesEfficiency: document.getElementById('duplicatesEfficiency')
        };
        
        if (elements.duplicatesNeedProcessing) {
            elements.duplicatesNeedProcessing.textContent = stats.needProcessing;
        }
        
        if (elements.duplicatesProcessed) {
            elements.duplicatesProcessed.textContent = stats.processed;
        }
        
        if (elements.duplicatesMerged) {
            elements.duplicatesMerged.textContent = stats.merged;
        }
        
        if (elements.duplicatesEfficiency) {
            elements.duplicatesEfficiency.textContent = stats.efficiency + '%';
        }
    }
    
    /**
     * Обновление диаграммы статусов дублей
     */
    updateDuplicatesStatusChart(stats) {
        const chartElement = document.getElementById('duplicatesStatusChart');
        if (!chartElement) return;
        
        const chartData = {
            series: [
                stats.needProcessing,
                stats.processed,
                stats.merged
            ],
            labels: [
                'Требуют обработки',
                'Обработано',
                'Объединено'
            ]
        };
        
        const chartOptions = {
            chart: {
                type: 'donut',
                height: 200
            },
            colors: ['#EF4444', '#10B981', '#3B82F6'],
            legend: {
                position: 'bottom'
            },
            responsive: [{
                breakpoint: 480,
                options: {
                    chart: {
                        height: 300
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }]
        };
        
        if (window.duplicatesStatusChartInstance) {
            window.duplicatesStatusChartInstance.destroy();
        }
        
        window.duplicatesStatusChartInstance = new ApexCharts(chartElement, {
            ...chartOptions,
            series: chartData.series,
            labels: chartData.labels
        });
        
        window.duplicatesStatusChartInstance.render();
    }
    
    /**
     * Обновление информации о точности
     */
    updateDuplicatesAccuracyStats() {
        const accuracyElement = document.getElementById('duplicatesAccuracy');
        if (!accuracyElement) return;
        
        const threshold = this.config.accuracyThreshold;
        const algorithm = this.duplicatesState.currentAlgorithm;
        
        let accuracyText = `Порог точности: ${Math.round(threshold * 100)}%`;
        if (algorithm === 'advanced') {
            accuracyText += ' (Продвинутый алгоритм)';
        }
        
        accuracyElement.textContent = accuracyText;
    }
    
    /**
     * Переключение панели дублей
     */
    toggleDuplicatesPanel() {
        const panel = document.getElementById('duplicatesPanelContent');
        const icon = document.getElementById('duplicatesPanelIcon');
        
        if (!panel || !icon) return;
        
        const isVisible = panel.style.display !== 'none';
        
        if (isVisible) {
            panel.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        } else {
            panel.style.display = 'block';
            icon.style.transform = 'rotate(90deg)';
        }
        
        // Сохраняем состояние
        const currentArea = this.dataState.getState('currentArea');
        if (currentArea) {
            localStorage.setItem(`duplicatesPanel_${currentArea.id}`, !isVisible);
        }
    }
    
    /**
     * Восстановление состояния панели дублей
     */
    restoreDuplicatesPanelState() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) return;
        
        const savedState = localStorage.getItem(`duplicatesPanel_${currentArea.id}`);
        const isExpanded = savedState === 'true';
        
        const panel = document.getElementById('duplicatesPanelContent');
        const icon = document.getElementById('duplicatesPanelIcon');
        
        if (panel && icon) {
            if (isExpanded) {
                panel.style.display = 'block';
                icon.style.transform = 'rotate(90deg)';
            } else {
                panel.style.display = 'none';
                icon.style.transform = 'rotate(0deg)';
            }
        }
    }
    
    /**
     * Инициализация фильтров обработки
     */
    async initProcessingFilters() {
        try {
            console.log('🔍 Инициализация фильтров обработки');
            
            // Инициализируем все фильтры
            await this.initProcessingStatusFilter();
            await this.initProcessingAddressFilter();
            await this.initProcessingPropertyTypeFilter();
            
            console.log('✅ Фильтры обработки инициализированы');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации фильтров обработки:', error);
        }
    }
    
    /**
     * Инициализация фильтра статуса обработки
     */
    async initProcessingStatusFilter() {
        try {
            const selectElement = document.getElementById('processingStatusFilter');
            if (!selectElement) {
                console.warn('⚠️ Элемент processingStatusFilter не найден');
                return;
            }
            
            // Инициализируем SlimSelect
            this.processingStatusSlimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    placeholderText: 'Выберите статус',
                    allowDeselect: true,
                    closeOnSelect: true
                },
                events: {
                    afterChange: (newVal) => {
                        this.onProcessingStatusFilterChange(newVal);
                    }
                }
            });
            
            console.log('📋 Фильтр статуса обработки инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка при инициализации фильтра статуса обработки:', error);
            throw error;
        }
    }
    
    /**
     * Получение адресов в области (из старой версии)
     */
    async getAddressesInArea() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea || !currentArea.polygon) {
                console.log('⚠️ Нет области или полигона для получения адресов');
                return [];
            }
            
            // Получаем все адреса из базы данных
            const allAddresses = await window.db.getAll('addresses');
            
            // Фильтруем адреса, которые входят в полигон области
            const areaAddresses = allAddresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                // Используем AddressModel для проверки принадлежности к области
                if (window.AddressModel) {
                    const addressModel = new window.AddressModel(address);
                    return addressModel.belongsToMapArea(currentArea);
                }
                
                // Fallback: простая проверка точки в полигоне
                return this.isPointInPolygon([address.coordinates.lat, address.coordinates.lng], currentArea.polygon);
            });
            
            console.log(`📍 Найдено ${areaAddresses.length} адресов в области`);
            return areaAddresses;
            
        } catch (error) {
            console.error('❌ Ошибка получения адресов в области:', error);
            return [];
        }
    }

    /**
     * Инициализация фильтра адресов (как в старой версии)
     */
    async initProcessingAddressFilter() {
        try {
            const selectElement = document.getElementById('processingAddressFilter');
            if (!selectElement) {
                console.warn('Элемент processingAddressFilter не найден');
                return;
            }

            // Загружаем адреса в области
            const addresses = await this.getAddressesInArea();
            
            // Очищаем существующие опции (кроме первой "Все адреса")
            while (selectElement.children.length > 1) {
                selectElement.removeChild(selectElement.lastChild);
            }
            
            // Добавляем опции для каждого адреса
            addresses.forEach(address => {
                const option = document.createElement('option');
                option.value = address.id;
                option.textContent = address.address;
                selectElement.appendChild(option);
            });

            // Инициализируем SlimSelect
            this.processingAddressSlimSelect = new SlimSelect({
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

            console.log(`📍 Загружено ${addresses.length} адресов для фильтра`);
            
        } catch (error) {
            console.error('Ошибка при инициализации фильтра адресов:', error);
            throw error;
        }
    }
    
    /**
     * Инициализация фильтра типа недвижимости (как в старой версии)
     */
    async initProcessingPropertyTypeFilter() {
        try {
            const selectElement = document.getElementById('processingPropertyTypeFilter');
            if (!selectElement) {
                console.warn('Элемент processingPropertyTypeFilter не найден');
                return;
            }

            // Инициализируем SlimSelect
            this.processingPropertyTypeSlimSelect = new SlimSelect({
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

            console.log('🏠 Фильтр типа недвижимости инициализирован');
            
        } catch (error) {
            console.error('Ошибка при инициализации фильтра типа недвижимости:', error);
            throw error;
        }
    }
    
    /**
     * Обработчик изменения фильтра статуса обработки
     */
    onProcessingStatusFilterChange(newVal) {
        try {
            console.log('🔄 Processing status filter changed:', newVal);
            
            if (newVal && newVal.length > 0) {
                this.showClearButton('clearProcessingStatusFilterBtn');
            } else {
                this.hideClearButton('clearProcessingStatusFilterBtn');
            }
            this.applyProcessingFilters();
        } catch (error) {
            console.error('❌ Ошибка при изменении фильтра статуса обработки:', error);
        }
    }
    
    /**
     * Обработчик изменения фильтра адресов (из старой версии)
     */
    onAddressFilterChange(newVal) {
        try {
            if (newVal && newVal.length > 0) {
                this.showClearButton('clearAddressFilterBtn');
            } else {
                this.hideClearButton('clearAddressFilterBtn');
            }
            this.applyProcessingFilters();
        } catch (error) {
            console.error('❌ Ошибка при изменении фильтра адресов:', error);
        }
    }

    /**
     * Обработчик изменения фильтра типа недвижимости (из старой версии)
     */
    onPropertyTypeFilterChange(newVal) {
        try {
            if (newVal && newVal.length > 0) {
                this.showClearButton('clearPropertyTypeFilterBtn');
            } else {
                this.hideClearButton('clearPropertyTypeFilterBtn');
            }
            this.applyProcessingFilters();
        } catch (error) {
            console.error('❌ Ошибка при изменении фильтра типа недвижимости:', error);
        }
    }
    
    /**
     * Привязка событий фильтров
     */
    bindProcessingFilterEvents() {
        try {
            // Поле ввода этажа
            const floorInput = document.getElementById('processingFloorFilter');
            if (floorInput) {
                floorInput.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (value) {
                        this.showClearButton('clearFloorFilterBtn');
                    } else {
                        this.hideClearButton('clearFloorFilterBtn');
                    }
                    this.applyProcessingFilters();
                });
                
                floorInput.addEventListener('keyup', (e) => {
                    if (e.key === 'Enter') {
                        this.applyProcessingFilters();
                    }
                });
            }
            
            console.log('🔗 Обработчики событий фильтров привязаны');
            
        } catch (error) {
            console.error('❌ Ошибка при привязке событий фильтров:', error);
        }
    }
    
    /**
     * Показать кнопку очистки
     */
    showClearButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.remove('hidden');
        }
    }
    
    /**
     * Скрыть кнопку очистки
     */
    hideClearButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.add('hidden');
        }
    }
    
    /**
     * Очистка всех фильтров обработки
     */
    clearAllProcessingFilters() {
        try {
            // Очищаем все фильтры
            if (this.processingAddressSlimSelect) {
                this.processingAddressSlimSelect.setSelected([]);
            }
            
            if (this.processingPropertyTypeSlimSelect) {
                this.processingPropertyTypeSlimSelect.setSelected([]);
            }
            
            if (this.processingStatusSlimSelect) {
                this.processingStatusSlimSelect.setSelected([]);
            }
            
            const floorFilter = document.getElementById('processingFloorFilter');
            if (floorFilter) {
                floorFilter.value = '';
            }
            
            // Применяем фильтры
            this.applyProcessingFilters();
            
            if (this.progressManager) {
                this.progressManager.showSuccess('Все фильтры очищены');
            }
            
        } catch (error) {
            console.error('❌ Ошибка при очистке всех фильтров:', error);
        }
    }
    
    /**
     * Применение фильтров обработки к таблице (из старой версии)
     */
    async applyProcessingFilters() {
        try {
            // Получаем значения фильтров из SlimSelect и обычных элементов
            let addressFilter = '';
            if (this.processingAddressSlimSelect) {
                const selected = this.processingAddressSlimSelect.getSelected();
                addressFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            let propertyTypeFilter = '';
            if (this.processingPropertyTypeSlimSelect) {
                const selected = this.processingPropertyTypeSlimSelect.getSelected();
                propertyTypeFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            let processingStatusFilter = '';
            if (this.processingStatusSlimSelect) {
                const selected = this.processingStatusSlimSelect.getSelected();
                processingStatusFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            const floorFilter = document.getElementById('processingFloorFilter')?.value || '';
            
            // Получаем значение основного фильтра статусов
            const statusFilter = document.getElementById('duplicatesStatusFilter')?.value || 'all';
            
            console.log('🔧 Применение фильтров:', {
                addressFilter,
                propertyTypeFilter,
                floorFilter,
                processingStatusFilter,
                statusFilter
            });
            
            // Очищаем предыдущие кастомные фильтры для этой таблицы
            $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(fn => 
                !fn.toString().includes('duplicatesTable')
            );
            
            // Применяем объединенный фильтр к DataTables
            $.fn.dataTable.ext.search.push((settings, data, dataIndex) => {
                // Проверяем, что это наша таблица
                if (settings.nTable.id !== 'duplicatesTable') {
                    return true;
                }
                
                const rowData = this.duplicatesTable.row(dataIndex).data();
                
                // Основной фильтр по статусу (активный/архивный)
                if (statusFilter !== 'all' && rowData.status !== statusFilter) {
                    return false;
                }
                
                // Фильтры обработки применяются только если они заполнены
                
                // Фильтр по адресу (из справочника)
                if (addressFilter && rowData.address_id !== addressFilter) {
                    return false;
                }
                
                // Фильтр по типу недвижимости
                if (propertyTypeFilter && rowData.property_type !== propertyTypeFilter) {
                    return false;
                }
                
                // Фильтр по этажу
                if (floorFilter && rowData.floor != parseInt(floorFilter)) {
                    return false;
                }
                
                // Фильтр по статусу обработки (только для объявлений)
                if (processingStatusFilter) {
                    //console.log('🔍 Processing status filter:', processingStatusFilter, 'row type:', rowData.type, 'row processing_status:', rowData.processing_status, 'address_match_confidence:', rowData.address_match_confidence);
                    
                    // Объекты недвижимости не имеют статуса обработки, поэтому скрываем их при фильтрации
                    if (rowData.type === 'object') {
                        return false;
                    }
                    
                    // Для объявлений применяем фильтр по статусу обработки
                    if (processingStatusFilter === 'address_needed') {
                        // Показываем объявления:
                        // 1. С processing_status === 'address_needed' 
                        // 2. ИЛИ с низкой точностью определения адреса (address_match_confidence: 'low' или 'very_low')
                        // НО НЕ показываем адреса со статусом 'manual' (уже подтвержденные)
                        const hasAddressNeededStatus = rowData.processing_status === 'address_needed';
                        const hasLowAddressConfidence = rowData.address_match_confidence === 'low' || rowData.address_match_confidence === 'very_low';
                        const isManualConfidence = rowData.address_match_confidence === 'manual';
                        
                        // console.log('📍 Address needed check:', {
                        //     hasAddressNeededStatus: hasAddressNeededStatus,
                        //     hasLowAddressConfidence: hasLowAddressConfidence,
                        //     isManualConfidence: isManualConfidence,
                        //     shouldShow: (hasAddressNeededStatus || hasLowAddressConfidence) && !isManualConfidence
                        // });
                        
                        // Скрываем если нет нужного статуса ИЛИ если адрес уже подтвержден вручную
                        if ((!hasAddressNeededStatus && !hasLowAddressConfidence) || isManualConfidence) {
                            return false;
                        }
                    } else {
                        // Для остальных фильтров - простое сравнение
                        if (rowData.processing_status !== processingStatusFilter) {
                            return false;
                        }
                    }
                }
                
                return true;
            });
            
            // Перерисовываем таблицу
            this.duplicatesTable.draw();
            
            // Обновляем отображение активных фильтров
            this.updateActiveFiltersDisplay();
            
        } catch (error) {
            console.error('Ошибка при применении фильтров:', error);
            this.showError('Ошибка при применении фильтров: ' + error.message);
        }
    }
    
    /**
     * Обновление отображения активных фильтров (из старой версии)
     */
    updateActiveFiltersDisplay() {
        try {
            const addressFilter = this.processingAddressSlimSelect?.getSelected()?.[0] || '';
            const propertyTypeFilter = this.processingPropertyTypeSlimSelect?.getSelected()?.[0] || '';
            const floorFilter = document.getElementById('processingFloorFilter')?.value || '';
            const activeFilters = [];
            
            if (addressFilter) {
                // Получаем красивое название адреса из SlimSelect
                let addressText = addressFilter;
                
                try {
                    // Поиск в оригинальном select элементе для получения текста
                    const selectElement = document.getElementById('processingAddressFilter');
                    if (selectElement) {
                        const selectedOption = selectElement.querySelector(`option[value="${addressFilter}"]`);
                        if (selectedOption) {
                            const optionText = selectedOption.textContent;
                            if (optionText && optionText !== addressFilter) {
                                addressText = optionText;
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Ошибка получения текста адреса:', error);
                }
                
                activeFilters.push({ type: 'address', text: `Адрес: ${addressText}` });
            }
            
            if (propertyTypeFilter) {
                // Преобразуем технические значения в читаемые
                const propertyTypeMap = {
                    'studio': 'Студия',
                    '1k': '1-к квартира',
                    '2k': '2-к квартира', 
                    '3k': '3-к квартира',
                    '4k+': '4+ к квартира'
                };
                const propertyTypeText = propertyTypeMap[propertyTypeFilter] || propertyTypeFilter;
                activeFilters.push({ type: 'property_type', text: `Тип: ${propertyTypeText}` });
            }
            
            if (floorFilter) {
                activeFilters.push({ type: 'floor', text: `Этаж: ${floorFilter}` });
            }
            
            const container = document.getElementById('activeFiltersContainer');
            const tagsContainer = document.getElementById('activeFilterTags');
            
            if (activeFilters.length > 0) {
                container?.classList.remove('hidden');
                if (tagsContainer) {
                    tagsContainer.innerHTML = activeFilters.map(filter => 
                        `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            ${filter.text}
                            <button type="button" class="ml-1 text-blue-600 hover:text-blue-800 remove-filter-btn" data-filter-type="${filter.type}">
                                <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                                </svg>
                            </button>
                        </span>`
                    ).join('');
                }
            } else {
                container?.classList.add('hidden');
            }
            
        } catch (error) {
            console.error('Ошибка при обновлении отображения активных фильтров:', error);
        }
    }
    
    /**
     * Подтверждение правильности адреса
     */
    async markAddressAsCorrect() {
        try {
            const selectedItems = Array.from(this.duplicatesState.selectedDuplicates);
            if (selectedItems.length === 0) {
                if (this.progressManager) {
                    this.progressManager.showWarning('Выберите объявления для подтверждения адреса');
                }
                return;
            }
            
            let updatedCount = 0;
            
            for (const itemKey of selectedItems) {
                const [type, id] = itemKey.split('_');
                if (type === 'listing') {
                    const listing = await window.db.get('listings', id);
                    if (listing) {
                        // Обновляем address_match_confidence на 'manual'
                        await window.db.update('listings', {
                            ...listing,
                            address_match_confidence: 'manual',
                            updated_at: new Date()
                        });
                        
                        // Добавляем положительный пример для ML обучения
                        if (window.smartAddressMatcher) {
                            await window.smartAddressMatcher.addPositiveExample(listing);
                        }
                        
                        updatedCount++;
                    }
                }
            }
            
            if (updatedCount > 0) {
                // Обновляем таблицу
                await this.loadDuplicatesTable();
                
                if (this.progressManager) {
                    this.progressManager.showSuccess(`Подтверждено ${updatedCount} адресов`);
                }
            }
            
        } catch (error) {
            console.error('❌ Ошибка подтверждения адреса:', error);
            if (this.progressManager) {
                this.progressManager.showError('Ошибка подтверждения адреса: ' + error.message);
            }
        }
    }
    
    /**
     * Сохранение состояния развернутых строк
     */
    saveExpandedRowsState() {
        if (!this.duplicatesTable) return [];
        
        const expandedRows = [];
        const shownRows = document.querySelectorAll('#duplicatesTable tr.shown');
        
        shownRows.forEach(row => {
            const rowData = this.duplicatesTable.row(row).data();
            if (rowData) {
                expandedRows.push(`${rowData.type}_${rowData.id}`);
            }
        });
        
        return expandedRows;
    }
    
    /**
     * Восстановление состояния развернутых строк
     */
    restoreExpandedRowsState(expandedRows) {
        if (!this.duplicatesTable || !expandedRows || expandedRows.length === 0) return;
        
        setTimeout(() => {
            this.duplicatesTable.rows().every(function() {
                const rowData = this.data();
                const rowKey = `${rowData.type}_${rowData.id}`;
                
                if (expandedRows.includes(rowKey)) {
                    const row = this.node();
                    const detailsControl = row.querySelector('.details-control');
                    if (detailsControl) {
                        detailsControl.click();
                    }
                }
                return true;
            });
        }, 100);
    }
    
    /**
     * Привязка событий к строкам таблицы
     */
    bindDuplicateRowEvents() {
        // Привязка уже реализована в bindTableEvents через делегирование
    }
    
    /**
     * Рендеринг колонки с чекбоксом
     */
    renderCheckboxColumn(data, type, row) {
        if (!row.selectable) {
            return '<span class="text-gray-400">—</span>';
        }
        
        const itemKey = `${row.type}_${row.id}`;
        const checked = this.duplicatesState.selectedDuplicates.has(itemKey) ? 'checked' : '';
        
        return `<input type="checkbox" class="duplicate-checkbox" data-id="${row.id}" data-type="${row.type}" ${checked}>`;
    }
    
    /**
     * Рендеринг колонки разворачивания
     */
    renderExpandColumn(data, type, row) {
        return '<span class="details-control cursor-pointer">▶</span>';
    }
    
    /**
     * Рендеринг колонки даты
     */
    renderDateColumn(data, type, row) {
        if (!row.date) return '—';
        return Helpers.formatDate(row.date);
    }
    
    /**
     * Рендеринг колонки адреса (точная копия из старой версии)
     */
    renderAddressColumn(data, type, row) {
        const isListing = row.type === 'listing';
        const addressFromDb = this.getAddressNameById(row.address_id);
        
        if (isListing) {
            const addressText = row.address || data || 'Адрес не указан';
            let addressFromDbText = addressFromDb || (row.address_id ? 'Адрес не определен' : '');
            
            // Проверяем точность определения адреса и добавляем её в скобках
            const hasLowConfidence = row.address_match_confidence === 'low' || row.address_match_confidence === 'very_low';
            const isManualConfidence = row.address_match_confidence === 'manual';
            const isAddressNotFound = addressFromDbText === 'Адрес не определен';
            
            // Добавляем точность в скобках для адресов с низкой точностью
            if (hasLowConfidence && !isAddressNotFound) {
                const confidenceText = row.address_match_confidence === 'low' ? 'Низкая' : 'Очень низкая';
                addressFromDbText += ` (${confidenceText})`;
            } else if (isManualConfidence && !isAddressNotFound) {
                addressFromDbText += ` (Подтвержден)`;
            }
            
            const addressClass = addressText === 'Адрес не указан' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800';
            
            // Подсвечиваем красным только неопределенные адреса и адреса с низкой точностью (НЕ manual)
            const addressFromDbClass = (isAddressNotFound || (hasLowConfidence && !isManualConfidence)) ? 'text-red-500' : 'text-gray-500';
            
            return `<div class="text-xs max-w-xs">
                <div class="${addressClass} cursor-pointer clickable-address truncate" data-listing-id="${row.id}">${addressText}</div>
                <div class="${addressFromDbClass} truncate">${addressFromDbText}</div>
            </div>`;
        } else {
            // Для объектов показываем только адрес из базы (кликабельный)
            const addressText = addressFromDb || 'Адрес не определен';
            const addressClass = addressText === 'Адрес не определен' ? 'text-red-500' : 'text-blue-600 hover:text-blue-800 cursor-pointer';
            
            return `<div class="text-xs max-w-xs">
                <div class="${addressClass} truncate clickable-object-address" data-object-id="${row.id}">${addressText}</div>
            </div>`;
        }
    }
    
    /**
     * Рендеринг колонки цены (точная копия из старой версии)
     */
    renderPriceColumn(data, type, row) {
        const isListing = row.type === 'listing';
        const priceValue = isListing ? row.price : row.current_price;
        
        if (!priceValue) return '<div class="text-xs">—</div>';
        
        const price = priceValue.toLocaleString();
        let pricePerMeter = '';
        
        if (row.price_per_meter) {
            pricePerMeter = row.price_per_meter.toLocaleString();
        } else if (priceValue && row.area_total) {
            const calculated = Math.round(priceValue / row.area_total);
            pricePerMeter = calculated.toLocaleString();
        }
        
        return `<div class="text-xs">
            <div class="text-green-600 font-medium">${price}</div>
            ${pricePerMeter ? `<div class="text-gray-500">${pricePerMeter}</div>` : ''}
        </div>`;
    }
    
    /**
     * Рендеринг колонки источника
     */
    renderSourceColumn(data, type, row) {
        const sourceName = CONSTANTS.DATA_SOURCE_NAMES[row.source] || row.source;
        const sourceColor = CONSTANTS.DATA_SOURCE_COLORS[row.source] || '#6B7280';
        
        return `<span class="px-2 py-1 rounded text-xs" style="background-color: ${sourceColor}20; color: ${sourceColor};">${sourceName}</span>`;
    }
    
    /**
     * Рендеринг колонки статуса (как в старой версии)
     */
    renderStatusColumn(data, type, row) {
        const isListing = row.type === 'listing';
        const statusBadges = {
            'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
            'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
            'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
            'needs_processing': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Требует обработки</span>'
        };
        
        let html = statusBadges[row.status] || `<span class="text-xs text-gray-500">${row.status}</span>`;
        
        if (isListing && row.processing_status) {
            const processingBadges = {
                'address_needed': '<br><span class="inline-flex items-center px-1 py-0.5 text-nowrap rounded-full text-xs font-medium bg-orange-100 text-orange-800" style="font-size: 10px;">Определить адрес</span>',
                'duplicate_check_needed': '<br><span class="inline-flex items-center text-nowrap px-1 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" style="font-size: 10px;">Обр. на дубли</span>',
                'processed': ''
            };
            html += processingBadges[row.processing_status] || '';
        } else if (!isListing) {
            // Для объектов показываем количество объявлений с кнопкой разворачивания
            const listingsCount = row.listings_count || 0;
            const activeCount = row.active_listings_count || 0;
            if (listingsCount > 0) {
                html += `<br><span class="text-xs text-gray-600 cursor-pointer hover:text-blue-600 expand-object-listings" data-object-id="${row.id}" title="Нажмите для просмотра объявлений">
                    <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                    Объявления: ${listingsCount} (${activeCount} акт.)
                </span>`;
            } else {
                html += `<br><span class="text-xs text-gray-600">Объявления: ${listingsCount} (${activeCount} акт.)</span>`;
            }
        }
        
        return html;
    }
    
    /**
     * Рендеринг колонки даты создания (из старой версии)
     */
    renderCreatedColumn(data, type, row) {
        if (!row.created_at) return '—';
        
        try {
            const date = new Date(row.created_at);
            const now = new Date();
            const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
            
            return `
                <div class="text-xs">
                    <div>${date.toLocaleDateString('ru-RU')}</div>
                    <div class="text-gray-500 text-xs">${daysDiff} дн.</div>
                </div>
            `;
        } catch (e) {
            return '—';
        }
    }
    
    /**
     * Рендеринг колонки даты обновления (из старой версии)
     */
    renderUpdatedColumn(data, type, row) {
        if (!row.updated_at) return '—';
        
        try {
            const date = new Date(row.updated_at);
            const now = new Date();
            const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
            
            return `
                <div class="text-xs">
                    <div>${date.toLocaleDateString('ru-RU')}</div>
                    <div class="text-gray-500 text-xs">${daysDiff} дн. назад</div>
                </div>
            `;
        } catch (e) {
            return '—';
        }
    }
    
    /**
     * Рендеринг колонки характеристик (точная копия из старой версии)
     */
    renderCharacteristicsColumn(data, type, row) {
        const isListing = row.type === 'listing';
        const parts = [];
        
        // Тип квартиры
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
        
        // Площади
        const areas = [];
        if (row.area_total) areas.push(row.area_total);
        if (row.area_living) areas.push(row.area_living);
        if (row.area_kitchen) areas.push(row.area_kitchen);
        if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
        
        // Этаж/этажность
        if (row.floor && row.total_floors) {
            parts.push(`${row.floor}/${row.total_floors} эт.`);
        } else if (row.floor && row.floors_total) {
            // Поддержка старого поля floors_total для совместимости
            parts.push(`${row.floor}/${row.floors_total} эт.`);
        }
        
        const characteristicsText = parts.length > 0 ? parts.join(', ') : 'Не указано';
        
        return `<div class="text-xs text-gray-900 max-w-xs" title="${characteristicsText}">${characteristicsText}</div>`;
    }
    
    /**
     * Рендеринг колонки контакта (точная копия из старой версии)
     */
    renderContactColumn(data, type, row) {
        const isListing = row.type === 'listing';
        
        if (isListing) {
            const sellerType = row.seller_type === 'private' ? 'Собственник' : 
                             row.seller_type === 'agency' ? 'Агент' : 
                             row.seller_type === 'agent' ? 'Агент' :
                             row.seller_type === 'owner' ? 'Собственник' :
                             row.seller_type || 'Не указано';
            
            const sellerName = row.seller_name || 'Не указано';
            
            return `<div class="text-xs max-w-xs">
                <div class="text-gray-900 truncate" title="${sellerType}">${sellerType}</div>
                <div class="text-gray-500 truncate" title="${sellerName}">${sellerName}</div>
            </div>`;
        } else {
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
    
    /**
     * Получить название адреса по ID (из старой версии)
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses) return '';
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address : '';
    }
    
    /**
     * Рендеринг колонки действий (удалена из старой версии)
     */
    renderActionsColumn(data, type, row) {
        // В старой версии не было колонки действий
        return '';
    }
    
    /**
     * Создание содержимого дочерней строки
     */
    createChildRowContent(rowData) {
        if (rowData.type === 'listing') {
            return this.createListingChildContent(rowData);
        } else if (rowData.type === 'real_estate_object') {
            return this.createObjectChildContent(rowData);
        }
        return '';
    }
    
    /**
     * Создание содержимого дочерней строки для объявления
     */
    createListingChildContent(listing) {
        return `
            <div class="p-4 bg-gray-50 rounded">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <h6 class="font-medium mb-2">Детали объявления</h6>
                        <div class="text-sm space-y-1">
                            <div>Площадь: ${listing.area_total || listing.area || '—'} м²</div>
                            <div>Этаж: ${listing.floor || '—'}</div>
                            <div>Комнат: ${listing.rooms || '—'}</div>
                            <div>Создано: ${listing.created_at ? new Date(listing.created_at).toLocaleDateString() : '—'}</div>
                        </div>
                    </div>
                    <div>
                        <h6 class="font-medium mb-2">Дополнительно</h6>
                        <div class="text-sm space-y-1">
                            <div>ID: ${listing.id}</div>
                            <div>Источник: ${CONSTANTS.DATA_SOURCE_NAMES[listing.source] || listing.source}</div>
                            <div>Статус: ${listing.status || '—'}</div>
                        </div>
                    </div>
                </div>
                ${listing.description ? `<div class="mt-3"><h6 class="font-medium">Описание</h6><p class="text-sm text-gray-600">${listing.description.substring(0, 200)}${listing.description.length > 200 ? '...' : ''}</p></div>` : ''}
            </div>
        `;
    }
    
    /**
     * Создание содержимого дочерней строки для объекта
     */
    createObjectChildContent(object) {
        return `
            <div class="p-4 bg-gray-50 rounded">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <h6 class="font-medium mb-2">Статистика объекта</h6>
                        <div class="text-sm space-y-1">
                            <div>Объявлений: ${object.listings_count || 0}</div>
                            <div>Средняя цена: ${object.average_price ? object.average_price.toLocaleString() + ' ₽' : '—'}</div>
                            <div>Мин. цена: ${object.min_price ? object.min_price.toLocaleString() + ' ₽' : '—'}</div>
                            <div>Макс. цена: ${object.max_price ? object.max_price.toLocaleString() + ' ₽' : '—'}</div>
                        </div>
                    </div>
                    <div>
                        <h6 class="font-medium mb-2">Дополнительно</h6>
                        <div class="text-sm space-y-1">
                            <div>ID: ${object.id}</div>
                            <div>Тип: ${object.property_type || '—'}</div>
                            <div>Создан: ${object.created_at ? new Date(object.created_at).toLocaleDateString() : '—'}</div>
                            <div>Обновлен: ${object.updated_at ? new Date(object.updated_at).toLocaleDateString() : '—'}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Получение статуса обработки дублей
     */
    getProcessingStatus() {
        return {
            processing: this.duplicatesState.processing,
            algorithm: this.duplicatesState.currentAlgorithm,
            selected: this.duplicatesState.selectedDuplicates.size,
            stats: this.duplicatesStats
        };
    }
    
    /**
     * Показать сообщение об ошибке (из старой версии)
     */
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    /**
     * Показать уведомление (из старой версии)
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const colors = {
            success: 'bg-green-100 border-green-500 text-green-700',
            error: 'bg-red-100 border-red-500 text-red-700',
            info: 'bg-blue-100 border-blue-500 text-blue-700',
            warning: 'bg-yellow-100 border-yellow-500 text-yellow-700'
        };

        notification.className = `border-l-4 p-4 mb-4 ${colors[type]} rounded shadow-lg`;
        notification.innerHTML = `
            <div class="flex justify-between items-center">
                <span>${message}</span>
                <button class="text-lg leading-none notification-close-btn">&times;</button>
            </div>
        `;

        // Add event listener for close button instead of inline onclick
        const closeBtn = notification.querySelector('.notification-close-btn');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });
        
        const notificationsContainer = document.getElementById('notifications');
        if (notificationsContainer) {
            notificationsContainer.appendChild(notification);
        } else {
            console.warn('⚠️ Контейнер notifications не найден');
        }

        // Автоматическое удаление через 5 секунд
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
    
    /**
     * Загрузка адресов для helper методов
     */
    async loadAddresses() {
        try {
            this.addresses = await window.db.getAll('addresses');
            console.log(`📍 DuplicatesManager: Загружено ${this.addresses.length} адресов для helper методов`);
        } catch (error) {
            console.error('❌ Ошибка загрузки адресов в DuplicatesManager:', error);
            this.addresses = [];
        }
    }

    /**
     * Получить название адреса по ID (точная копия из старой версии)
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses) return '';
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address : '';
    }

    /**
     * Уничтожение менеджера дублей
     */
    destroy() {
        if (this.duplicatesTable) {
            this.duplicatesTable.destroy();
            this.duplicatesTable = null;
        }
        
        if (this.eventBus) {
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.ADDRESSES_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.LISTINGS_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_CHANGED);
            this.eventBus.offAll(CONSTANTS.EVENTS.LISTING_UPDATED);
        }
        
        // Уничтожение графиков
        if (window.duplicatesStatusChartInstance) {
            window.duplicatesStatusChartInstance.destroy();
            window.duplicatesStatusChartInstance = null;
        }
        
        // Очистка обработчиков
        document.getElementById('processDuplicatesBtn')?.removeEventListener('click', this.processDuplicates);
        document.getElementById('processDuplicatesAdvancedBtn')?.removeEventListener('click', this.processDuplicatesAdvanced);
        document.getElementById('mergeDuplicatesBtn')?.removeEventListener('click', this.mergeDuplicates);
        document.getElementById('splitDuplicatesBtn')?.removeEventListener('click', this.splitDuplicates);
        document.getElementById('duplicatesStatusFilter')?.removeEventListener('change', this.applyProcessingFilters);
        document.getElementById('duplicatesPanelHeader')?.removeEventListener('click', this.toggleDuplicatesPanel);
        
        // Очистка состояния
        this.duplicatesState.selectedDuplicates.clear();
        this.duplicatesState.expandedRows.clear();
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DuplicatesManager;
} else {
    window.DuplicatesManager = DuplicatesManager;
    console.log('✅ DuplicatesManager доступен в window:', typeof window.DuplicatesManager);
}