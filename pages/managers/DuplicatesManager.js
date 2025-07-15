/**
 * Менеджер дублей
 * Управляет обработкой дублей объявлений и их объединением в объекты недвижимости
 */

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
        
        // Привязываем события
        this.bindEvents();
    }
    
    /**
     * Привязка событий
     */
    bindEvents() {
        if (this.eventBus) {
            this.eventBus.on(CONSTANTS.EVENTS.LISTINGS_LOADED, async () => {
                await this.loadDuplicatesTable();
                await this.updateDuplicatesStats();
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.AREA_CHANGED, async () => {
                await this.loadDuplicatesTable();
                await this.updateDuplicatesStats();
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.LISTING_UPDATED, async () => {
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
    }
    
    /**
     * Привязка к событиям таблицы
     */
    bindTableEvents() {
        // Делегированные обработчики для динамически создаваемых элементов
        document.addEventListener('click', (e) => {
            // Обработка чекбоксов
            if (e.target.matches('.duplicate-checkbox')) {
                this.handleDuplicateSelection(e.target);
            }
            
            // Обработка кнопки "Выбрать все"
            if (e.target.matches('#selectAllDuplicates')) {
                this.selectAllDuplicates(e.target.checked);
            }
            
            // Обработка кнопки "Очистить выбор"
            if (e.target.matches('#clearDuplicatesSelection')) {
                this.clearDuplicatesSelection();
            }
        });
    }
    
    /**
     * Привязка к панели управления
     */
    bindPanelEvents() {
        // Сворачивание/разворачивание панели
        document.getElementById('duplicatesPanelHeader')?.addEventListener('click', () => {
            this.toggleDuplicatesPanel();
        });
    }
    
    /**
     * Загрузка таблицы дублей
     */
    async loadDuplicatesTable() {
        try {
            await Helpers.debugLog('📋 Загрузка таблицы дублей');
            
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                await Helpers.debugLog('❌ Область не выбрана');
                return;
            }
            
            // Сохраняем состояние развернутых строк
            this.saveExpandedRowsState();
            
            // Получаем данные
            const listings = await this.getDuplicateListings(currentArea.id);
            const realEstateObjects = await this.getRealEstateObjects(currentArea.id);
            
            // Очищаем выбранные элементы
            this.clearDuplicatesSelection();
            
            // Инициализируем таблицу если нужно
            if (!this.duplicatesTable) {
                this.initializeDuplicatesTable();
            }
            
            // Готовим данные для таблицы
            const tableData = this.prepareDuplicatesTableData(listings, realEstateObjects);
            
            // Обновляем таблицу
            this.duplicatesTable.clear();
            this.duplicatesTable.rows.add(tableData);
            this.duplicatesTable.draw();
            
            // Восстанавливаем состояние развернутых строк
            this.restoreExpandedRowsState();
            
            // Привязываем события к новым элементам
            this.bindDuplicateRowEvents();
            
            await Helpers.debugLog(`✅ Таблица дублей загружена. Записей: ${tableData.length}`);
            
        } catch (error) {
            console.error('Error loading duplicates table:', error);
            this.progressManager.showError('Ошибка загрузки таблицы дублей');
        }
    }
    
    /**
     * Инициализация таблицы дублей
     */
    initializeDuplicatesTable() {
        const tableElement = document.getElementById('duplicatesTable');
        if (!tableElement) {
            console.error('Таблица дублей не найдена');
            return;
        }
        
        this.duplicatesTable = new DataTable(tableElement, {
            pageLength: this.config.pageLength,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'Все']],
            language: CONSTANTS.DATATABLES_LANGUAGE,
            order: [[2, 'desc']], // Сортировка по дате
            columnDefs: [
                { 
                    targets: 0, 
                    orderable: false,
                    className: 'select-checkbox',
                    render: (data, type, row) => this.renderCheckboxColumn(data, type, row)
                },
                { 
                    targets: 1, 
                    orderable: false,
                    render: (data, type, row) => this.renderExpandColumn(data, type, row)
                },
                { 
                    targets: 2, 
                    render: (data, type, row) => this.renderDateColumn(data, type, row)
                },
                { 
                    targets: 3, 
                    render: (data, type, row) => this.renderAddressColumn(data, type, row)
                },
                { 
                    targets: 4, 
                    render: (data, type, row) => this.renderPriceColumn(data, type, row)
                },
                { 
                    targets: 5, 
                    render: (data, type, row) => this.renderSourceColumn(data, type, row)
                },
                { 
                    targets: 6, 
                    render: (data, type, row) => this.renderStatusColumn(data, type, row)
                },
                { 
                    targets: 7, 
                    orderable: false,
                    render: (data, type, row) => this.renderActionsColumn(data, type, row)
                }
            ],
            initComplete: () => {
                this.restoreDuplicatesPanelState();
            }
        });
        
        // Обработка разворачивания строк
        this.duplicatesTable.on('click', 'td.details-control', (e) => {
            const tr = e.target.closest('tr');
            const row = this.duplicatesTable.row(tr);
            
            if (row.child.isShown()) {
                row.child.hide();
                tr.classList.remove('shown');
            } else {
                row.child(this.createChildRowContent(row.data())).show();
                tr.classList.add('shown');
            }
        });
    }
    
    /**
     * Подготовка данных для таблицы дублей
     */
    prepareDuplicatesTableData(listings, realEstateObjects) {
        const tableData = [];
        
        // Добавляем объявления
        listings.forEach(listing => {
            if (listing.address) {
                tableData.push({
                    id: listing.id,
                    type: 'listing',
                    data: listing,
                    date: listing.created_at,
                    address: listing.address.address,
                    price: listing.price,
                    source: listing.source,
                    status: listing.status,
                    selectable: listing.status === 'duplicate_check_needed'
                });
            }
        });
        
        // Добавляем объекты недвижимости
        realEstateObjects.forEach(object => {
            if (object.address) {
                tableData.push({
                    id: object.id,
                    type: 'real_estate_object',
                    data: object,
                    date: object.created_at,
                    address: object.address.address,
                    price: object.average_price,
                    source: 'merged',
                    status: object.status,
                    selectable: true,
                    listings_count: object.listings_count || 0
                });
            }
        });
        
        return tableData;
    }
    
    /**
     * Получение объявлений для обработки дублей
     */
    async getDuplicateListings(areaId) {
        try {
            const allListings = await window.db.getAll('listings');
            const areaListings = allListings.filter(listing => listing.map_area_id === areaId);
            
            // Получаем адреса для объявлений
            const addresses = await window.db.getAll('addresses');
            const addressesMap = new Map(addresses.map(addr => [addr.id, addr]));
            
            return areaListings.map(listing => ({
                ...listing,
                address: addressesMap.get(listing.address_id)
            })).filter(listing => listing.address);
            
        } catch (error) {
            console.error('Error getting duplicate listings:', error);
            return [];
        }
    }
    
    /**
     * Получение объектов недвижимости
     */
    async getRealEstateObjects(areaId) {
        try {
            const allObjects = await window.db.getAll('real_estate_objects');
            const areaObjects = allObjects.filter(object => object.map_area_id === areaId);
            
            // Получаем адреса для объектов
            const addresses = await window.db.getAll('addresses');
            const addressesMap = new Map(addresses.map(addr => [addr.id, addr]));
            
            return areaObjects.map(object => ({
                ...object,
                address: addressesMap.get(object.address_id)
            })).filter(object => object.address);
            
        } catch (error) {
            console.error('Error getting real estate objects:', error);
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
            const listings = await this.getDuplicateListings(currentArea.id);
            const needProcessing = listings.filter(listing => listing.status === 'duplicate_check_needed');
            
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
            const listings = await this.getDuplicateListings(currentArea.id);
            const needProcessing = listings.filter(listing => listing.status === 'duplicate_check_needed');
            
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
        const row = checkbox.closest('tr');
        const rowData = this.duplicatesTable.row(row).data();
        
        if (!rowData || !rowData.selectable) {
            return;
        }
        
        const itemId = rowData.id;
        const itemType = rowData.type;
        const itemKey = `${itemType}_${itemId}`;
        
        if (checkbox.checked) {
            this.duplicatesState.selectedDuplicates.add(itemKey);
        } else {
            this.duplicatesState.selectedDuplicates.delete(itemKey);
        }
        
        // Обновляем UI
        this.updateDuplicatesSelection();
        this.updateSelectAllCheckbox();
    }
    
    /**
     * Выбор всех дублей
     */
    selectAllDuplicates(checked) {
        const checkboxes = document.querySelectorAll('.duplicate-checkbox');
        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                checkbox.checked = checked;
                this.handleDuplicateSelection(checkbox);
            }
        });
    }
    
    /**
     * Очистка выбора дублей
     */
    clearDuplicatesSelection() {
        this.duplicatesState.selectedDuplicates.clear();
        
        // Сбрасываем все чекбоксы
        const checkboxes = document.querySelectorAll('.duplicate-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Обновляем UI
        this.updateDuplicatesSelection();
        this.updateSelectAllCheckbox();
    }
    
    /**
     * Обновление UI выбора дублей
     */
    updateDuplicatesSelection() {
        const selectedCount = this.duplicatesState.selectedDuplicates.size;
        
        // Обновляем счетчик
        const counterElement = document.getElementById('selectedDuplicatesCount');
        if (counterElement) {
            counterElement.textContent = selectedCount;
        }
        
        // Активируем/деактивируем кнопки
        const mergeButton = document.getElementById('mergeDuplicatesBtn');
        const splitButton = document.getElementById('splitDuplicatesBtn');
        
        if (mergeButton) {
            mergeButton.disabled = selectedCount < 2;
        }
        
        if (splitButton) {
            splitButton.disabled = selectedCount === 0;
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
            await window.db.add('real_estate_objects', realEstateObject);
            
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
                    const realEstateObject = await window.db.get('real_estate_objects', id);
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
                        await window.db.delete('real_estate_objects', id);
                        
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
     * Применение фильтров обработки
     */
    applyProcessingFilters() {
        if (!this.duplicatesTable) return;
        
        // Получаем значения фильтров
        const addressFilter = document.getElementById('processingAddressFilter')?.value || '';
        const propertyTypeFilter = document.getElementById('processingPropertyTypeFilter')?.value || '';
        const statusFilter = document.getElementById('processingStatusFilter')?.value || '';
        const sourceFilter = document.getElementById('sourceFilter')?.value || '';
        
        // Применяем фильтры к таблице
        this.duplicatesTable
            .column(3).search(addressFilter)
            .column(5).search(sourceFilter)
            .column(6).search(statusFilter)
            .draw();
    }
    
    /**
     * Обновление статистики дублей
     */
    async updateDuplicatesStats() {
        try {
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) return;
            
            // Получаем данные для статистики
            const listings = await this.getDuplicateListings(currentArea.id);
            const realEstateObjects = await this.getRealEstateObjects(currentArea.id);
            
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
     * Сохранение состояния развернутых строк
     */
    saveExpandedRowsState() {
        if (!this.duplicatesTable) return;
        
        this.duplicatesState.expandedRows.clear();
        
        const expandedRows = document.querySelectorAll('#duplicatesTable tr.shown');
        expandedRows.forEach(row => {
            const rowData = this.duplicatesTable.row(row).data();
            if (rowData) {
                this.duplicatesState.expandedRows.add(`${rowData.type}_${rowData.id}`);
            }
        });
    }
    
    /**
     * Восстановление состояния развернутых строк
     */
    restoreExpandedRowsState() {
        if (!this.duplicatesTable || this.duplicatesState.expandedRows.size === 0) return;
        
        setTimeout(() => {
            this.duplicatesTable.rows().every(function() {
                const rowData = this.data();
                const rowKey = `${rowData.type}_${rowData.id}`;
                
                if (this.duplicatesState.expandedRows.has(rowKey)) {
                    const row = this.node();
                    const detailsControl = row.querySelector('.details-control');
                    if (detailsControl) {
                        detailsControl.click();
                    }
                }
            }.bind(this));
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
     * Рендеринг колонки адреса
     */
    renderAddressColumn(data, type, row) {
        return Helpers.truncateText(row.address, 50);
    }
    
    /**
     * Рендеринг колонки цены
     */
    renderPriceColumn(data, type, row) {
        if (!row.price) return '—';
        return Helpers.formatPrice(row.price);
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
     * Рендеринг колонки статуса
     */
    renderStatusColumn(data, type, row) {
        const statusName = CONSTANTS.PROCESSING_STATUS_NAMES[row.status] || row.status;
        const statusColor = CONSTANTS.STATUS_COLORS[row.status] || '#6B7280';
        
        return `<span class="px-2 py-1 rounded text-xs" style="background-color: ${statusColor}20; color: ${statusColor};">${statusName}</span>`;
    }
    
    /**
     * Рендеринг колонки действий
     */
    renderActionsColumn(data, type, row) {
        const actions = [];
        
        if (row.type === 'listing') {
            actions.push(`<button class="text-blue-600 hover:text-blue-800 text-xs" onclick="openListing('${row.data.url}')">Открыть</button>`);
        }
        
        if (row.type === 'real_estate_object') {
            actions.push(`<button class="text-green-600 hover:text-green-800 text-xs" onclick="viewObject('${row.id}')">Просмотр</button>`);
        }
        
        return actions.join(' | ');
    }
    
    /**
     * Создание содержимого дочерней строки
     */
    createChildRowContent(rowData) {
        if (rowData.type === 'listing') {
            return this.createListingChildContent(rowData.data);
        } else if (rowData.type === 'real_estate_object') {
            return this.createObjectChildContent(rowData.data);
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
                            <div>Площадь: ${listing.area || '—'} м²</div>
                            <div>Этаж: ${listing.floor || '—'}</div>
                            <div>Комнат: ${listing.rooms || '—'}</div>
                            <div>Создано: ${Helpers.formatDate(listing.created_at)}</div>
                        </div>
                    </div>
                    <div>
                        <h6 class="font-medium mb-2">Дополнительно</h6>
                        <div class="text-sm space-y-1">
                            <div>ID: ${listing.id}</div>
                            <div>Источник: ${CONSTANTS.DATA_SOURCE_NAMES[listing.source] || listing.source}</div>
                            <div>Статус: ${CONSTANTS.PROCESSING_STATUS_NAMES[listing.status] || listing.status}</div>
                        </div>
                    </div>
                </div>
                ${listing.description ? `<div class="mt-3"><h6 class="font-medium">Описание</h6><p class="text-sm text-gray-600">${Helpers.truncateText(listing.description, 200)}</p></div>` : ''}
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
                            <div>Средняя цена: ${Helpers.formatPrice(object.average_price) || '—'}</div>
                            <div>Мин. цена: ${Helpers.formatPrice(object.min_price) || '—'}</div>
                            <div>Макс. цена: ${Helpers.formatPrice(object.max_price) || '—'}</div>
                        </div>
                    </div>
                    <div>
                        <h6 class="font-medium mb-2">Дополнительно</h6>
                        <div class="text-sm space-y-1">
                            <div>ID: ${object.id}</div>
                            <div>Тип: ${object.property_type || '—'}</div>
                            <div>Создан: ${Helpers.formatDate(object.created_at)}</div>
                            <div>Обновлен: ${Helpers.formatDate(object.updated_at)}</div>
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
     * Уничтожение менеджера дублей
     */
    destroy() {
        if (this.duplicatesTable) {
            this.duplicatesTable.destroy();
            this.duplicatesTable = null;
        }
        
        if (this.eventBus) {
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
}