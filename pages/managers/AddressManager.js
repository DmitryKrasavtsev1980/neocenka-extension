/**
 * Менеджер адресов
 * Управляет загрузкой, отображением, редактированием и валидацией адресов
 */

class AddressManager {
    constructor(dataState, eventBus, progressManager) {
        this.dataState = dataState;
        this.eventBus = eventBus;
        this.progressManager = progressManager;
        
        // Таблица адресов
        this.addressesTable = null;
        
        // Справочники
        this.houseSeries = [];
        this.houseClasses = [];
        this.wallMaterials = [];
        this.ceilingMaterials = [];
        
        // Состояние
        this.isLoading = false;
        this.currentEditingAddress = null;
        
        // Конфигурация
        this.config = {
            pageLength: 10,
            osmAPI: null,
            smartMatcher: null
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
            
            this.eventBus.on(CONSTANTS.EVENTS.AREA_CHANGED, async (area) => {
                await this.onAreaChanged(area);
            });
        }
        
        // Привязка к кнопкам
        this.bindButtons();
        
        // Привязка к таблице
        this.bindTableEvents();
        
        // Привязка к модальным окнам
        this.bindModalEvents();
    }
    
    /**
     * Привязка к кнопкам
     */
    bindButtons() {
        // Кнопка добавления адреса
        document.getElementById('addAddressBtn')?.addEventListener('click', () => {
            this.openAddAddressModal();
        });
        
        // Кнопка загрузки адресов из API
        document.getElementById('loadAddressesBtn')?.addEventListener('click', () => {
            this.loadAddressesFromAPI();
        });
        
        // Кнопка экспорта адресов
        document.getElementById('exportAddressesBtn')?.addEventListener('click', () => {
            this.exportAddressesToFile();
        });
        
        // Импорт адресов
        document.getElementById('importAddressesFile')?.addEventListener('change', (event) => {
            this.importAddressesFromFile(event);
        });
    }
    
    /**
     * Привязка к событиям таблицы
     */
    bindTableEvents() {
        // Делегированные обработчики для динамически создаваемых элементов
        document.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (!button) return;
            
            const action = button.getAttribute('data-action');
            const addressId = button.getAttribute('data-address-id');
            
            if (!addressId) return;
            
            switch (action) {
                case 'edit-address':
                    this.editAddress(addressId);
                    break;
                case 'delete-address':
                    this.deleteAddress(addressId);
                    break;
            }
        });
    }
    
    /**
     * Привязка к событиям модального окна
     */
    bindModalEvents() {
        // Кнопки закрытия модального окна
        document.getElementById('closeEditAddressModal')?.addEventListener('click', () => {
            this.closeEditAddressModal();
        });
        
        // Форма редактирования адреса
        document.getElementById('editAddressForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAddressEdit();
        });
        
        // Кнопки добавления новых элементов в справочники
        document.getElementById('houseSeriesActionBtn')?.addEventListener('click', () => {
            this.openHouseSeriesModal();
        });
        
        document.getElementById('houseClassActionBtn')?.addEventListener('click', () => {
            this.openHouseClassModal();
        });
        
        document.getElementById('wallMaterialActionBtn')?.addEventListener('click', () => {
            this.openWallMaterialModal();
        });
        
        document.getElementById('ceilingMaterialActionBtn')?.addEventListener('click', () => {
            this.openCeilingMaterialModal();
        });
    }
    
    /**
     * Обработка загрузки области
     */
    async onAreaLoaded(area) {
        await this.loadAddresses();
        await this.loadReferenceData();
        await this.initializeAddressTable();
    }
    
    /**
     * Обработка изменения области
     */
    async onAreaChanged(area) {
        await this.loadAddresses();
    }
    
    /**
     * Инициализация таблицы адресов
     */
    async initializeAddressTable() {
        if (this.addressesTable) {
            this.addressesTable.destroy();
        }
        
        this.addressesTable = $('#addressesTable').DataTable({
            ...CONSTANTS.TABLE_CONFIG,
            pageLength: this.config.pageLength,
            columns: [
                { 
                    data: 'source', 
                    title: 'Источник',
                    render: (data) => this.renderSourceBadge(data)
                },
                { 
                    data: 'address', 
                    title: 'Адрес',
                    render: (data) => Helpers.truncateText(data, 50)
                },
                {
                    data: 'type',
                    title: 'Тип',
                    render: (data) => CONSTANTS.PROPERTY_TYPE_NAMES[data] || data
                },
                {
                    data: null,
                    title: 'Конструктив',
                    render: (data) => this.renderConstructiveInfo(data)
                },
                { 
                    data: 'objects_count', 
                    title: 'Объектов', 
                    defaultContent: '0',
                    className: 'text-center'
                },
                { 
                    data: 'listings_count', 
                    title: 'Объявлений', 
                    defaultContent: '0',
                    className: 'text-center'
                },
                {
                    data: null,
                    title: 'Действия',
                    orderable: false,
                    className: 'text-right',
                    render: (data, type, row) => this.renderActions(row)
                }
            ],
            drawCallback: () => {
                this.onTableDraw();
            }
        });
        
        // Инициализируем фильтр по источнику
        this.initSourceFilter();
    }
    
    /**
     * Рендеринг бейджа источника
     */
    renderSourceBadge(source) {
        const colors = {
            'osm': 'bg-blue-100 text-blue-800',
            'manual': 'bg-green-100 text-green-800',
            'ml': 'bg-purple-100 text-purple-800',
            'imported': 'bg-orange-100 text-orange-800',
            'avito': 'bg-red-100 text-red-800',
            'cian': 'bg-yellow-100 text-yellow-800'
        };
        
        const colorClass = colors[source] || 'bg-gray-100 text-gray-800';
        const sourceName = CONSTANTS.DATA_SOURCE_NAMES[source] || source;
        
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}">${sourceName}</span>`;
    }
    
    /**
     * Рендеринг конструктивной информации
     */
    renderConstructiveInfo(data) {
        const parts = [];
        
        if (data.house_series) parts.push(data.house_series);
        if (data.wall_material) parts.push(data.wall_material);
        if (data.building_type) parts.push(data.building_type);
        if (data.floors_count) parts.push(`${data.floors_count} эт.`);
        if (data.build_year) parts.push(`${data.build_year} г.`);
        
        return parts.join(', ') || '-';
    }
    
    /**
     * Рендеринг действий
     */
    renderActions(row) {
        return `
            <div class="flex space-x-2">
                <button data-action="edit-address" data-address-id="${row.id}" 
                        class="text-blue-600 hover:text-blue-900 text-sm">
                    Редактировать
                </button>
                <button data-action="delete-address" data-address-id="${row.id}" 
                        class="text-red-600 hover:text-red-900 text-sm">
                    Удалить
                </button>
            </div>
        `;
    }
    
    /**
     * Обработка отрисовки таблицы
     */
    onTableDraw() {
        const info = this.addressesTable.page.info();
        
        // Обновляем счетчики
        this.updateAddressCounters(info);
        
        // Уведомляем о обновлении таблицы
        this.eventBus.emit(CONSTANTS.EVENTS.TABLE_UPDATED, {
            table: 'addresses',
            info,
            timestamp: new Date()
        });
    }
    
    /**
     * Обновление счетчиков адресов
     */
    updateAddressCounters(info) {
        const counterElement = document.getElementById('addressesCount');
        if (counterElement) {
            counterElement.textContent = info.recordsTotal;
        }
    }
    
    /**
     * Загрузка адресов
     */
    async loadAddresses() {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            
            await Helpers.debugLog('📋 Загрузка адресов в таблицу...');
            
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                await Helpers.debugLog('❌ Область не выбрана');
                return;
            }
            
            const addresses = await this.getAddressesInArea(currentArea.id);
            await Helpers.debugLog(`📊 Адресов для отображения: ${addresses.length}`);
            
            // Инициализируем ML-алгоритм определения адресов
            await this.initializeSmartMatcher();
            
            // Добавляем счетчики объявлений для каждого адреса
            for (const address of addresses) {
                const listings = await this.getListingsByAddress(address.id);
                address.objects_count = 0;
                address.listings_count = listings.length;
                
                // Нормализуем обязательные поля для DataTables
                if (!address.source) {
                    address.source = 'manual';
                }
            }
            
            // Сохраняем адреса в состояние
            this.dataState.setState('addresses', addresses);
            
            // Обновляем таблицу
            if (this.addressesTable) {
                this.addressesTable.clear();
                this.addressesTable.rows.add(addresses);
                this.addressesTable.draw();
            }
            
            // Уведомляем о загрузке
            this.eventBus.emit(CONSTANTS.EVENTS.ADDRESSES_LOADED, {
                addresses,
                count: addresses.length,
                area: currentArea,
                timestamp: new Date()
            });
            
            await Helpers.debugLog('✅ Адреса загружены');
            
        } catch (error) {
            console.error('Error loading addresses:', error);
            this.progressManager.showError('Ошибка загрузки адресов: ' + error.message);
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * Инициализация Smart Matcher
     */
    async initializeSmartMatcher() {
        if (typeof SmartAddressMatcher !== 'undefined' && !this.config.smartMatcher) {
            try {
                this.config.smartMatcher = new SmartAddressMatcher();
                await Helpers.debugLog('🧠 SmartAddressMatcher инициализирован');
            } catch (error) {
                await Helpers.debugLog('Failed to initialize SmartAddressMatcher:', error);
            }
        }
    }
    
    /**
     * Получение адресов в области
     */
    async getAddressesInArea(areaId) {
        try {
            const allAddresses = await window.db.getAll('addresses');
            return allAddresses.filter(address => address.map_area_id === areaId);
        } catch (error) {
            console.error('Error getting addresses in area:', error);
            return [];
        }
    }
    
    /**
     * Получение объявлений по адресу
     */
    async getListingsByAddress(addressId) {
        try {
            const allListings = await window.db.getAll('listings');
            return allListings.filter(listing => listing.address_id === addressId);
        } catch (error) {
            console.error('Error getting listings by address:', error);
            return [];
        }
    }
    
    /**
     * Редактирование адреса
     */
    async editAddress(addressId) {
        try {
            await Helpers.debugLog(`🔄 Открытие формы редактирования адреса: ${addressId}`);
            
            // Получаем данные адреса
            const address = await window.db.get('addresses', addressId);
            if (!address) {
                this.progressManager.showError('Адрес не найден');
                return;
            }
            
            this.currentEditingAddress = address;
            
            // Заполняем форму данными адреса
            await this.fillAddressForm(address);
            
            // Показываем модальное окно
            this.showAddressModal(address);
            
        } catch (error) {
            console.error('Error opening edit address modal:', error);
            this.progressManager.showError('Ошибка открытия формы редактирования: ' + error.message);
        }
    }
    
    /**
     * Заполнение формы адреса
     */
    async fillAddressForm(address) {
        // Основные поля
        document.getElementById('editAddressText').value = address.address || '';
        document.getElementById('editAddressType').value = address.type || 'house';
        
        // Загружаем и заполняем справочники
        await this.loadReferenceData();
        
        // Серия дома
        document.getElementById('editHouseSeries').value = address.house_series_id || '';
        
        // Класс дома
        document.getElementById('editHouseClass').value = address.house_class_id || '';
        
        // Материал стен
        document.getElementById('editWallMaterial').value = address.wall_material_id || '';
        
        // Материал перекрытий
        document.getElementById('editCeilingMaterial').value = address.ceiling_material_id || '';
        
        // Газоснабжение
        const gasSupplyValue = address.gas_supply === null || address.gas_supply === undefined ? '' : address.gas_supply.toString();
        document.getElementById('editGasSupply').value = gasSupplyValue;
        
        // Количественные поля
        document.getElementById('editFloorsCount').value = address.floors_count || '';
        document.getElementById('editBuildYear').value = address.build_year || '';
        document.getElementById('editEntrancesCount').value = address.entrances_count || '';
        document.getElementById('editLivingSpaces').value = address.living_spaces_count || '';
        
        // Чекбоксы
        document.getElementById('editHasPlayground').checked = address.has_playground || false;
        document.getElementById('editHasSportsArea').checked = address.has_sports_area || false;
        
        // Инициализируем карту для редактирования
        this.initEditAddressMap(address);
    }
    
    /**
     * Инициализация карты в модальном окне редактирования
     */
    initEditAddressMap(address) {
        // Уничтожаем существующую карту
        if (this.editAddressMap) {
            this.editAddressMap.remove();
        }
        
        // Создаем новую карту
        const center = address.coordinates ? 
            [address.coordinates.lat, address.coordinates.lng] : 
            CONSTANTS.MAP_CONFIG.DEFAULT_CENTER;
        
        this.editAddressMap = L.map('editAddressMap', {
            center: center,
            zoom: 16
        });
        
        // Добавляем тайлы
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.editAddressMap);
        
        // Добавляем маркер
        if (address.coordinates) {
            this.editAddressMarker = L.marker([address.coordinates.lat, address.coordinates.lng], {
                draggable: true
            }).addTo(this.editAddressMap);
            
            // Обработчик перетаскивания маркера
            this.editAddressMarker.on('dragend', (event) => {
                const position = event.target.getLatLng();
                this.updateAddressCoordinates(position.lat, position.lng);
            });
        }
        
        // Обработчик клика по карте
        this.editAddressMap.on('click', (e) => {
            const { lat, lng } = e.latlng;
            
            if (this.editAddressMarker) {
                this.editAddressMarker.setLatLng([lat, lng]);
            } else {
                this.editAddressMarker = L.marker([lat, lng], {
                    draggable: true
                }).addTo(this.editAddressMap);
                
                this.editAddressMarker.on('dragend', (event) => {
                    const position = event.target.getLatLng();
                    this.updateAddressCoordinates(position.lat, position.lng);
                });
            }
            
            this.updateAddressCoordinates(lat, lng);
        });
    }
    
    /**
     * Обновление координат адреса
     */
    updateAddressCoordinates(lat, lng) {
        if (this.currentEditingAddress) {
            this.currentEditingAddress.coordinates = { lat, lng };
        }
    }
    
    /**
     * Показ модального окна адреса
     */
    showAddressModal(address) {
        const modal = document.getElementById('editAddressModal');
        if (modal) {
            modal.classList.remove('hidden');
            
            // Обновляем заголовок
            const title = document.getElementById('address-modal-title');
            if (title) {
                title.textContent = address.id ? 'Редактировать адрес' : 'Добавить адрес';
            }
            
            // Уведомляем об открытии
            this.eventBus.emit(CONSTANTS.EVENTS.MODAL_OPENED, {
                modalId: 'editAddressModal',
                type: CONSTANTS.MODAL_TYPES.ADDRESS_EDIT,
                data: address,
                timestamp: new Date()
            });
        }
    }
    
    /**
     * Закрытие модального окна редактирования
     */
    closeEditAddressModal() {
        const modal = document.getElementById('editAddressModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        // Уничтожаем карту
        if (this.editAddressMap) {
            this.editAddressMap.remove();
            this.editAddressMap = null;
        }
        
        // Очищаем текущий редактируемый адрес
        this.currentEditingAddress = null;
        
        // Уведомляем о закрытии
        this.eventBus.emit(CONSTANTS.EVENTS.MODAL_CLOSED, {
            modalId: 'editAddressModal',
            type: CONSTANTS.MODAL_TYPES.ADDRESS_EDIT,
            timestamp: new Date()
        });
    }
    
    /**
     * Сохранение изменений адреса
     */
    async saveAddressEdit() {
        try {
            const form = document.getElementById('editAddressForm');
            if (!form) return;
            
            const formData = new FormData(form);
            
            // Собираем данные из формы
            const addressData = {
                id: this.currentEditingAddress?.id || Helpers.generateId(),
                address: formData.get('address'),
                type: formData.get('type'),
                house_series_id: formData.get('house_series_id') || null,
                house_class_id: formData.get('house_class_id') || null,
                wall_material_id: formData.get('wall_material_id') || null,
                ceiling_material_id: formData.get('ceiling_material_id') || null,
                gas_supply: formData.get('gas_supply') ? formData.get('gas_supply') === 'true' : null,
                floors_count: formData.get('floors_count') ? parseInt(formData.get('floors_count')) : null,
                build_year: formData.get('build_year') ? parseInt(formData.get('build_year')) : null,
                entrances_count: formData.get('entrances_count') ? parseInt(formData.get('entrances_count')) : null,
                living_spaces_count: formData.get('living_spaces_count') ? parseInt(formData.get('living_spaces_count')) : null,
                has_playground: formData.get('has_playground') === 'on',
                has_sports_area: formData.get('has_sports_area') === 'on',
                coordinates: this.currentEditingAddress?.coordinates || null,
                map_area_id: this.dataState.getState('currentAreaId'),
                source: this.currentEditingAddress?.source || 'manual',
                created_at: this.currentEditingAddress?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            // Валидация
            const validation = Validators.validateAddress(addressData);
            if (!validation.isValid) {
                this.progressManager.showError('Ошибка валидации: ' + validation.errors.join(', '));
                return;
            }
            
            // Сохраняем в базу данных
            if (this.currentEditingAddress?.id) {
                await window.db.update('addresses', addressData);
                
                // Уведомляем об обновлении
                this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_UPDATED, {
                    address: addressData,
                    oldAddress: this.currentEditingAddress,
                    timestamp: new Date()
                });
            } else {
                await window.db.add('addresses', addressData);
                
                // Уведомляем о добавлении
                this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_ADDED, {
                    address: addressData,
                    timestamp: new Date()
                });
            }
            
            // Закрываем модальное окно
            this.closeEditAddressModal();
            
            // Обновляем данные
            await this.refreshAddressData();
            
            this.progressManager.showSuccess('Адрес успешно сохранен');
            
        } catch (error) {
            console.error('Error saving address:', error);
            this.progressManager.showError('Ошибка сохранения адреса: ' + error.message);
        }
    }
    
    /**
     * Удаление адреса
     */
    async deleteAddress(addressId) {
        try {
            // Получаем данные адреса для отображения в подтверждении
            const address = await window.db.get('addresses', addressId);
            if (!address) {
                this.progressManager.showError('Адрес не найден');
                return;
            }
            
            // Показываем подтверждение удаления
            const confirmed = confirm(
                `Вы уверены, что хотите удалить адрес?\n\n` +
                `"${address.address}"\n\n` +
                `Это действие необратимо.`
            );
            
            if (!confirmed) {
                return;
            }
            
            await Helpers.debugLog(`🗑️ Удаление адреса: ${addressId}`);
            
            // Удаляем адрес из базы данных
            await window.db.delete('addresses', addressId);
            
            // Уведомляем об удалении
            this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_DELETED, {
                address,
                timestamp: new Date()
            });
            
            // Обновляем данные
            await this.refreshAddressData();
            
            this.progressManager.showSuccess('Адрес успешно удален');
            
        } catch (error) {
            console.error('Error deleting address:', error);
            this.progressManager.showError('Ошибка удаления адреса: ' + error.message);
        }
    }
    
    /**
     * Обновление данных адресов
     */
    async refreshAddressData() {
        try {
            await Helpers.debugLog('🔄 Обновление данных адресов');
            
            // Обновляем адреса
            await this.loadAddresses();
            
            // Уведомляем об обновлении
            this.eventBus.emit(CONSTANTS.EVENTS.ADDRESSES_UPDATED, {
                timestamp: new Date()
            });
            
        } catch (error) {
            console.error('Error refreshing address data:', error);
            this.progressManager.showError('Ошибка обновления данных: ' + error.message);
        }
    }
    
    /**
     * Принудительное обновление данных адресов
     */
    async forceRefreshAddressData() {
        try {
            await Helpers.debugLog('🔄 === ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ ДАННЫХ АДРЕСОВ ===');
            
            // Очищаем пространственный индекс
            const spatialManager = window.spatialIndexManager;
            if (spatialManager) {
                await Helpers.debugLog('🗑️ Очищаем пространственный индекс адресов');
                spatialManager.clearIndex('addresses');
                if (spatialManager.hasIndex('addresses')) {
                    spatialManager.removeIndex('addresses');
                }
            }
            
            // Принудительно перезагружаем адреса
            await this.loadAddresses();
            
            // Уведомляем об обновлении
            this.eventBus.emit(CONSTANTS.EVENTS.ADDRESSES_UPDATED, {
                forced: true,
                timestamp: new Date()
            });
            
        } catch (error) {
            console.error('Error force refreshing address data:', error);
            this.progressManager.showError('Ошибка обновления данных: ' + error.message);
        }
    }
    
    /**
     * Загрузка адресов из API
     */
    async loadAddressesFromAPI() {
        await Helpers.debugLog('🚀 === НАЧАЛО ЗАГРУЗКИ АДРЕСОВ ИЗ OSM ===');
        
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea || !currentArea.polygon) {
            await Helpers.debugLog('❌ Область не имеет полигона для загрузки адресов');
            this.progressManager.showError('Область не имеет полигона для загрузки адресов');
            return;
        }
        
        try {
            // Создаем экземпляр OSM API
            if (!this.config.osmAPI) {
                this.config.osmAPI = new OSMOverpassAPI();
            }
            
            // Валидируем полигон
            const validation = this.config.osmAPI.validatePolygon(currentArea.polygon);
            if (!validation.valid) {
                await Helpers.debugLog(`❌ Полигон невалиден: ${validation.error}`);
                this.progressManager.showError(`Некорректный полигон: ${validation.error}`);
                return;
            }
            
            // Проверяем статус Overpass API
            const apiStatus = await this.config.osmAPI.getAPIStatus();
            if (!apiStatus.available) {
                await Helpers.debugLog('❌ Overpass API недоступен:', apiStatus);
                this.progressManager.showError('Overpass API недоступен. Попробуйте позже.');
                return;
            }
            
            // Показываем прогресс
            this.progressManager.createProgressBar('addresses-import', 'addressesImportProgress');
            
            // Колбэк для отслеживания прогресса
            const progressCallback = (message, percent) => {
                this.progressManager.updateProgressBar('addresses-import', percent, message);
            };
            
            // Загружаем адреса
            const osmAddresses = await this.config.osmAPI.loadAddressesForArea(currentArea, progressCallback);
            
            if (osmAddresses.length === 0) {
                this.progressManager.updateProgressBar('addresses-import', 100, 'Завершено');
                this.progressManager.showInfo('В указанной области не найдено адресов OSM');
                return;
            }
            
            // Сохраняем адреса в базу данных
            let savedCount = 0;
            let skippedCount = 0;
            
            for (const address of osmAddresses) {
                // Проверяем дубликаты
                const existingAddresses = await window.db.getAll('addresses');
                const duplicate = existingAddresses.find(existing => 
                    existing.source === 'osm' && 
                    existing.osm_id === address.osm_id && 
                    existing.osm_type === address.osm_type
                );
                
                if (duplicate) {
                    skippedCount++;
                    continue;
                }
                
                // Привязываем адрес к текущей области
                address.map_area_id = currentArea.id;
                
                // Сохраняем в базу
                await window.db.add('addresses', address);
                savedCount++;
                
                // Уведомляем о добавлении
                this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_ADDED, {
                    address,
                    source: 'osm',
                    timestamp: new Date()
                });
            }
            
            this.progressManager.updateProgressBar('addresses-import', 100, 'Завершено');
            
            // Обновляем данные
            await this.refreshAddressData();
            
            const message = `Загружено ${savedCount} адресов из OSM${skippedCount > 0 ? `, пропущено дубликатов: ${skippedCount}` : ''}`;
            this.progressManager.showSuccess(message);
            
        } catch (error) {
            console.error('Error loading addresses from API:', error);
            this.progressManager.showError('Ошибка загрузки адресов: ' + error.message);
        }
    }
    
    /**
     * Экспорт адресов в файл
     */
    async exportAddressesToFile() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            this.progressManager.showError('Область не выбрана');
            return;
        }
        
        try {
            const button = document.getElementById('exportAddressesBtn');
            if (button) {
                button.disabled = true;
                button.innerHTML = '📤 Экспорт...';
            }
            
            // Получаем все адреса из базы данных
            const allAddresses = await window.db.getAll('addresses');
            
            // Фильтруем адреса, которые входят в полигон области
            const areaAddresses = allAddresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                const addressModel = new AddressModel(address);
                return addressModel.belongsToMapArea(currentArea);
            });
            
            if (areaAddresses.length === 0) {
                this.progressManager.showWarning('Нет адресов для экспорта в данной области');
                return;
            }
            
            // Получаем справочники для экспорта
            const referenceData = await this.getReferenceDataForExport();
            
            // Создаем экспортируемый объект
            const exportData = {
                metadata: {
                    export_date: new Date().toISOString(),
                    area_name: currentArea.name,
                    area_id: currentArea.id,
                    total_addresses: areaAddresses.length,
                    export_version: '1.2',
                    includes_polygon: currentArea.polygon && currentArea.polygon.length > 0,
                    includes_references: true
                },
                area_polygon: currentArea.polygon || [],
                addresses: areaAddresses,
                reference_data: referenceData
            };
            
            // Создаем и скачиваем файл
            const fileName = `addresses_${currentArea.name}_${new Date().toISOString().split('T')[0]}.json`;
            Helpers.downloadFile(JSON.stringify(exportData, null, 2), fileName, 'application/json');
            
            this.progressManager.showSuccess(`Экспортировано ${areaAddresses.length} адресов`);
            
        } catch (error) {
            console.error('Ошибка экспорта адресов:', error);
            this.progressManager.showError('Ошибка при экспорте адресов');
        } finally {
            const button = document.getElementById('exportAddressesBtn');
            if (button) {
                button.disabled = false;
                button.innerHTML = '📤 Экспорт адресов';
            }
        }
    }
    
    /**
     * Получение справочных данных для экспорта
     */
    async getReferenceDataForExport() {
        const [houseSeries, houseClasses, wallMaterials, ceilingMaterials] = await Promise.all([
            window.db.getAll('house_series'),
            window.db.getAll('house_classes'),
            window.db.getAll('wall_materials'),
            window.db.getAll('ceiling_materials')
        ]);
        
        return {
            house_series: houseSeries,
            house_classes: houseClasses,
            wall_materials: wallMaterials,
            ceiling_materials: ceilingMaterials
        };
    }
    
    /**
     * Импорт адресов из файла
     */
    async importAddressesFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            this.progressManager.showError('Область не выбрана');
            return;
        }
        
        try {
            const button = document.getElementById('importAddressesBtn');
            if (button) {
                button.disabled = true;
                button.innerHTML = '📥 Импорт...';
            }
            
            // Читаем файл
            const fileContent = await Helpers.readFile(file);
            let importData;
            
            try {
                importData = JSON.parse(fileContent);
            } catch (parseError) {
                throw new Error('Неверный формат JSON файла');
            }
            
            // Валидируем структуру файла
            this.validateImportData(importData);
            
            const addresses = importData.addresses;
            if (!Array.isArray(addresses) || addresses.length === 0) {
                throw new Error('Файл не содержит адресов для импорта');
            }
            
            // Обработка полигона области
            await this.handlePolygonImport(importData, currentArea);
            
            // Импорт справочников (если присутствуют)
            if (importData.reference_data) {
                await this.importReferenceData(importData.reference_data);
            }
            
            // Фильтруем адреса, которые входят в полигон текущей области
            const areaAddresses = addresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                const addressModel = new AddressModel(address);
                return addressModel.belongsToMapArea(currentArea);
            });
            
            if (areaAddresses.length === 0) {
                this.progressManager.showWarning('Ни один адрес из файла не входит в текущую область');
                return;
            }
            
            // Импортируем адреса
            const { importedCount, skippedCount } = await this.importAddresses(areaAddresses, currentArea);
            
            // Обновляем данные
            await this.refreshAddressData();
            
            const importMessage = `Импортировано: ${importedCount} адресов${skippedCount > 0 ? `, пропущено: ${skippedCount}` : ''}`;
            this.progressManager.showSuccess(importMessage);
            
        } catch (error) {
            console.error('Ошибка при импорте адресов:', error);
            this.progressManager.showError(`Ошибка при импорте: ${error.message}`);
        } finally {
            const button = document.getElementById('importAddressesBtn');
            if (button) {
                button.disabled = false;
                button.innerHTML = '📥 Импорт адресов';
            }
            
            // Очищаем input
            event.target.value = '';
        }
    }
    
    /**
     * Валидация данных импорта
     */
    validateImportData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Неверная структура файла');
        }
        
        if (!data.metadata) {
            throw new Error('Файл не содержит метаданных');
        }
        
        if (!data.addresses || !Array.isArray(data.addresses)) {
            throw new Error('Файл не содержит массива адресов');
        }
        
        // Проверяем версию формата
        const version = data.metadata.export_version;
        if (version && !['1.0', '1.1', '1.2'].includes(version)) {
            console.warn('Версия формата файла отличается от поддерживаемых (1.0, 1.1, 1.2)');
        }
        
        // Валидируем полигон если он присутствует
        if (data.area_polygon !== undefined) {
            if (!Array.isArray(data.area_polygon)) {
                throw new Error('Полигон области должен быть массивом координат');
            }
            
            if (data.area_polygon.length > 0) {
                data.area_polygon.forEach((point, i) => {
                    if (!point || typeof point !== 'object' || 
                        typeof point.lat !== 'number' || typeof point.lng !== 'number') {
                        throw new Error(`Неверная структура точки полигона в позиции ${i}`);
                    }
                });
                
                if (data.area_polygon.length < 3) {
                    console.warn('Полигон содержит менее 3 точек и будет проигнорирован');
                }
            }
        }
    }
    
    /**
     * Обработка импорта полигона
     */
    async handlePolygonImport(importData, currentArea) {
        if (!importData.area_polygon || !Array.isArray(importData.area_polygon) || importData.area_polygon.length < 3) {
            return false;
        }
        
        // Если полигон уже существует, игнорируем
        if (currentArea.polygon && currentArea.polygon.length >= 3) {
            return false;
        }
        
        try {
            // Импортируем полигон
            const updatedArea = {
                ...currentArea,
                polygon: importData.area_polygon,
                updated_at: new Date()
            };
            
            await window.db.update('map_areas', updatedArea);
            this.dataState.setState('currentArea', updatedArea);
            
            // Уведомляем об обновлении
            this.eventBus.emit(CONSTANTS.EVENTS.AREA_UPDATED, {
                area: updatedArea,
                polygonImported: true,
                timestamp: new Date()
            });
            
            return true;
            
        } catch (error) {
            console.error('Ошибка при импорте полигона:', error);
            return false;
        }
    }
    
    /**
     * Импорт справочных данных
     */
    async importReferenceData(referenceData) {
        if (!referenceData || typeof referenceData !== 'object') {
            return;
        }
        
        const referenceTypes = ['house_series', 'house_classes', 'wall_materials', 'ceiling_materials'];
        
        for (const refType of referenceTypes) {
            if (referenceData[refType] && Array.isArray(referenceData[refType])) {
                await this.importReferenceType(refType, referenceData[refType]);
            }
        }
    }
    
    /**
     * Импорт одного типа справочных данных
     */
    async importReferenceType(refType, refData) {
        try {
            const existing = await window.db.getAll(refType);
            
            for (const item of refData) {
                // Проверяем дубликаты по названию
                const duplicate = existing.find(e => e.name === item.name);
                if (duplicate) {
                    continue;
                }
                
                // Создаем новый элемент
                const newItem = {
                    ...item,
                    id: item.id || Helpers.generateId(),
                    created_at: item.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                await window.db.add(refType, newItem);
            }
            
        } catch (error) {
            console.error(`Ошибка импорта справочника ${refType}:`, error);
        }
    }
    
    /**
     * Импорт адресов
     */
    async importAddresses(addresses, currentArea) {
        let importedCount = 0;
        let skippedCount = 0;
        
        // Получаем существующие адреса для проверки дубликатов
        const existingAddresses = await window.db.getAll('addresses');
        
        for (const address of addresses) {
            try {
                // Проверяем дубликаты
                const duplicate = existingAddresses.find(existing => 
                    existing.address === address.address && 
                    existing.coordinates &&
                    Math.abs(existing.coordinates.lat - address.coordinates.lat) < 0.0001 &&
                    Math.abs(existing.coordinates.lng - address.coordinates.lng) < 0.0001
                );
                
                if (duplicate) {
                    skippedCount++;
                    continue;
                }
                
                // Создаем новый адрес
                const newAddress = {
                    ...address,
                    id: Helpers.generateId(),
                    map_area_id: currentArea.id,
                    source: 'imported',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                // Валидируем
                const validation = Validators.validateAddress(newAddress);
                if (!validation.isValid) {
                    skippedCount++;
                    continue;
                }
                
                await window.db.add('addresses', newAddress);
                importedCount++;
                
                // Уведомляем о добавлении
                this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_ADDED, {
                    address: newAddress,
                    source: 'import',
                    timestamp: new Date()
                });
                
            } catch (error) {
                console.error('Ошибка при импорте адреса:', error);
                skippedCount++;
            }
        }
        
        return { importedCount, skippedCount };
    }
    
    /**
     * Загрузка справочных данных
     */
    async loadReferenceData() {
        try {
            const [houseSeries, houseClasses, wallMaterials, ceilingMaterials] = await Promise.all([
                window.db.getAll('house_series'),
                window.db.getAll('house_classes'),
                window.db.getAll('wall_materials'),
                window.db.getAll('ceiling_materials')
            ]);
            
            this.houseSeries = houseSeries;
            this.houseClasses = houseClasses;
            this.wallMaterials = wallMaterials;
            this.ceilingMaterials = ceilingMaterials;
            
            // Обновляем селекты
            this.updateReferenceSelects();
            
        } catch (error) {
            console.error('Error loading reference data:', error);
        }
    }
    
    /**
     * Обновление селектов справочных данных
     */
    updateReferenceSelects() {
        // Серии домов
        const houseSeriesSelect = document.getElementById('editHouseSeries');
        if (houseSeriesSelect) {
            houseSeriesSelect.innerHTML = '<option value="">Выберите серию...</option>';
            this.houseSeries.forEach(series => {
                houseSeriesSelect.innerHTML += `<option value="${series.id}">${series.name}</option>`;
            });
        }
        
        // Классы домов
        const houseClassSelect = document.getElementById('editHouseClass');
        if (houseClassSelect) {
            houseClassSelect.innerHTML = '<option value="">Выберите класс...</option>';
            this.houseClasses.forEach(houseClass => {
                houseClassSelect.innerHTML += `<option value="${houseClass.id}">${houseClass.name}</option>`;
            });
        }
        
        // Материалы стен
        const wallMaterialSelect = document.getElementById('editWallMaterial');
        if (wallMaterialSelect) {
            wallMaterialSelect.innerHTML = '<option value="">Выберите материал...</option>';
            this.wallMaterials.forEach(material => {
                wallMaterialSelect.innerHTML += `<option value="${material.id}">${material.name}</option>`;
            });
        }
        
        // Материалы перекрытий
        const ceilingMaterialSelect = document.getElementById('editCeilingMaterial');
        if (ceilingMaterialSelect) {
            ceilingMaterialSelect.innerHTML = '<option value="">Выберите материал...</option>';
            this.ceilingMaterials.forEach(material => {
                ceilingMaterialSelect.innerHTML += `<option value="${material.id}">${material.name}</option>`;
            });
        }
    }
    
    /**
     * Инициализация фильтра по источнику
     */
    initSourceFilter() {
        const addresses = this.dataState.getState('addresses') || [];
        const sources = [...new Set(addresses.map(addr => addr.source))];
        
        const filterSelect = document.getElementById('sourceFilter');
        if (filterSelect && this.sourceFilterSlimSelect) {
            this.sourceFilterSlimSelect.destroy();
        }
        
        if (filterSelect) {
            // Очищаем и заполняем опции
            filterSelect.innerHTML = '<option value="">Все источники</option>';
            sources.forEach(source => {
                const sourceName = CONSTANTS.DATA_SOURCE_NAMES[source] || source;
                filterSelect.innerHTML += `<option value="${source}">${sourceName}</option>`;
            });
            
            // Инициализируем SlimSelect
            this.sourceFilterSlimSelect = new SlimSelect({
                select: '#sourceFilter',
                placeholder: 'Все источники',
                allowDeselect: true,
                showSearch: false
            });
            
            // Обработчик изменения фильтра
            this.sourceFilterSlimSelect.onChange = (info) => {
                this.applySourceFilter(info.value);
            };
        }
    }
    
    /**
     * Применение фильтра по источнику
     */
    applySourceFilter(source) {
        if (!this.addressesTable) return;
        
        if (source) {
            this.addressesTable.column(0).search(source).draw();
        } else {
            this.addressesTable.column(0).search('').draw();
        }
    }
    
    /**
     * Открытие модального окна добавления адреса
     */
    openAddAddressModal() {
        this.currentEditingAddress = null;
        this.showAddressModal({});
    }
    
    /**
     * Открытие модальных окон справочников
     */
    openHouseSeriesModal() {
        // Логика открытия модального окна серий домов
        this.eventBus.emit(CONSTANTS.EVENTS.MODAL_OPENED, {
            modalId: 'houseSeriesModal',
            timestamp: new Date()
        });
    }
    
    openHouseClassModal() {
        // Логика открытия модального окна классов домов
        this.eventBus.emit(CONSTANTS.EVENTS.MODAL_OPENED, {
            modalId: 'houseClassModal',
            timestamp: new Date()
        });
    }
    
    openWallMaterialModal() {
        // Логика открытия модального окна материалов стен
        this.eventBus.emit(CONSTANTS.EVENTS.MODAL_OPENED, {
            modalId: 'wallMaterialModal',
            timestamp: new Date()
        });
    }
    
    openCeilingMaterialModal() {
        // Логика открытия модального окна материалов перекрытий
        this.eventBus.emit(CONSTANTS.EVENTS.MODAL_OPENED, {
            modalId: 'ceilingMaterialModal',
            timestamp: new Date()
        });
    }
    
    /**
     * Получение состояния менеджера
     */
    getState() {
        return {
            isLoading: this.isLoading,
            addressesCount: this.dataState.getState('addresses')?.length || 0,
            currentEditingAddress: this.currentEditingAddress,
            tableInitialized: !!this.addressesTable
        };
    }
    
    /**
     * Уничтожение менеджера
     */
    destroy() {
        // Уничтожаем таблицу
        if (this.addressesTable) {
            this.addressesTable.destroy();
            this.addressesTable = null;
        }
        
        // Уничтожаем SlimSelect
        if (this.sourceFilterSlimSelect) {
            this.sourceFilterSlimSelect.destroy();
            this.sourceFilterSlimSelect = null;
        }
        
        // Уничтожаем карту
        if (this.editAddressMap) {
            this.editAddressMap.remove();
            this.editAddressMap = null;
        }
        
        // Отписываемся от событий
        if (this.eventBus) {
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_CHANGED);
        }
        
        // Очищаем обработчики
        document.removeEventListener('click', this.bindTableEvents);
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AddressManager;
} else {
    window.AddressManager = AddressManager;
}