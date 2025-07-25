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
        
        // SlimSelect экземпляры для модального окна
        this.modalSlimSelects = {
            houseSeriesSelect: null,
            houseClassSelect: null,
            wallMaterialSelect: null,
            ceilingMaterialSelect: null,
            typeSelect: null,
            gasSupplySelect: null,
            individualHeatingSelect: null
        };
        
        // SlimSelect для фильтра по источнику
        this.sourceFilterSlimSelect = null;
        
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
            
            this.eventBus.on(CONSTANTS.EVENTS.ADDRESS_DELETED, async (data) => {
                // Обновляем таблицу после удаления адреса
                await this.loadAddresses();
                console.log('✅ AddressManager: Таблица обновлена после удаления адреса');
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.ADDRESS_EDIT_REQUESTED, async (address) => {
                // Обрабатываем запрос на редактирование адреса
                await this.editAddress(address.id);
                console.log('✅ AddressManager: Обработан запрос на редактирование адреса:', address.id);
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
        
        // Кнопка удаления всех адресов области
        document.getElementById('deleteAllAddressesBtn')?.addEventListener('click', () => {
            this.deleteAllAddressesInArea();
        });
        
        // Кнопка умного определения адресов (ML)
        document.getElementById('processAddressesSmartBtn')?.addEventListener('click', () => {
            this.processAddressesSmart();
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
                    // Отправляем событие для редактирования адреса
                    this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_EDIT_REQUESTED, { id: addressId });
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
        
        // Кнопка отмены редактирования
        document.getElementById('cancelEditAddress')?.addEventListener('click', () => {
            this.closeEditAddressModal();
        });
        
        // Форма редактирования адреса
        document.getElementById('editAddressForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAddressEdit();
        });
        
        // Обработчики модальных окон справочников
        this.bindReferenceModalEvents();
        
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
        await this.loadReferenceData();
        await this.initializeAddressTable();
        await this.loadAddresses();
        await this.loadListings();
        await this.loadObjects();
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
        try {
            // Проверка готовности элементов
            const tableElement = document.getElementById('addressesTable');
            if (!tableElement) {
                console.error('❌ AddressManager: Элемент addressesTable не найден в DOM');
                return;
            }
            
            if (!$ || !$.fn.DataTable) {
                console.error('❌ AddressManager: jQuery или DataTable не загружены');
                return;
            }
            
            console.log('🔄 AddressManager: Инициализация таблицы адресов');
            
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
                // Используем setTimeout для выполнения после присвоения this.addressesTable
                setTimeout(() => {
                    this.onTableDraw();
                }, 0);
            }
            });
            
            console.log('✅ AddressManager: Таблица адресов инициализирована');
            
            // Инициализируем фильтр по источнику
            this.initSourceFilter();
            
        } catch (error) {
            console.error('❌ AddressManager: Ошибка инициализации таблицы адресов:', error);
        }
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
        try {
            if (!this.addressesTable || !this.addressesTable.page || typeof this.addressesTable.page.info !== 'function') {
                // Проверяем, что таблица полностью инициализирована
                if (!this.addressesTable) {
                    // Таблица еще создается, пропускаем этот вызов
                    return;
                }
                console.warn('⚠️ AddressManager: Table not fully initialized for onTableDraw');
                return;
            }
        
        const info = this.addressesTable.page.info();
        
            // Обновляем счетчики
            this.updateAddressCounters(info);
            
            // Уведомляем о обновлении таблицы
            this.eventBus.emit(CONSTANTS.EVENTS.TABLE_UPDATED, {
                table: 'addresses',
                info,
                timestamp: new Date()
            });
            
        } catch (error) {
            console.error('❌ AddressManager: Ошибка в onTableDraw:', error);
        }
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
            
            // ОПТИМИЗАЦИЯ: Загружаем все объявления один раз вместо множественных запросов
            console.log('⚡ Оптимизированная загрузка счетчиков объявлений...');
            const allListings = await window.db.getAll('listings');
            
            // Группируем объявления по address_id для быстрого подсчета
            const listingsByAddress = {};
            allListings.forEach(listing => {
                if (listing.address_id) {
                    if (!listingsByAddress[listing.address_id]) {
                        listingsByAddress[listing.address_id] = [];
                    }
                    listingsByAddress[listing.address_id].push(listing);
                }
            });
            
            // Добавляем счетчики объявлений для каждого адреса
            for (const address of addresses) {
                const addressListings = listingsByAddress[address.id] || [];
                address.objects_count = 0;
                address.listings_count = addressListings.length;
                
                // Нормализуем обязательные поля для DataTables
                if (!address.source) {
                    address.source = 'manual';
                }
            }
            
            // Сохраняем адреса в состояние
            this.dataState.setState('addresses', addresses);
            
            // Сохраняем объявления в состояние для использования другими менеджерами
            // Это избежит повторной загрузки в loadListings()
            this.dataState.setState('allListingsCache', allListings);
            console.log('💾 Кешированы объявления для оптимизации:', allListings.length);
            
            // Обновляем таблицу
            if (this.addressesTable) {
                this.addressesTable.clear();
                this.addressesTable.rows.add(addresses);
                this.addressesTable.draw();
                
                // Инициализируем фильтр по источнику после обновления таблицы
                this.initSourceFilter();
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
                console.warn('❌ AddressManager.editAddress: Адрес не найден:', addressId);
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
        const addressTextElement = document.getElementById('editAddressText');
        const addressTypeElement = document.getElementById('editAddressType');
        
        if (addressTextElement) {
            addressTextElement.value = address.address || '';
        }
        if (addressTypeElement) {
            addressTypeElement.value = address.type || 'house';
        }
        
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
        
        // Индивидуальное отопление
        const individualHeatingValue = address.individual_heating === null || address.individual_heating === undefined ? '' : address.individual_heating.toString();
        const individualHeatingElement = document.getElementById('editIndividualHeating');
        if (individualHeatingElement) {
            individualHeatingElement.value = individualHeatingValue;
        }
        
        // Количественные поля
        document.getElementById('editFloorsCount').value = address.floors_count || '';
        document.getElementById('editBuildYear').value = address.build_year || '';
        document.getElementById('editEntrancesCount').value = address.entrances_count || '';
        document.getElementById('editLivingSpaces').value = address.living_spaces_count || '';
        
        // Чекбоксы
        document.getElementById('editHasPlayground').checked = address.has_playground || false;
        document.getElementById('editHasSportsArea').checked = address.has_sports_area || false;
        
        // Обновляем ссылки на внешние сервисы
        this.updateExternalServiceLinks(address);
    }
    
    /**
     * Вычисление центра полигона области
     */
    getAreaPolygonCenter() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea || !currentArea.polygon) {
            return CONSTANTS.MAP_CONFIG.DEFAULT_CENTER;
        }
        
        const polygon = currentArea.polygon;
        let latSum = 0;
        let lngSum = 0;
        let pointCount = 0;
        
        // Вычисляем центр масс полигона
        for (const point of polygon) {
            latSum += point.lat;
            lngSum += point.lng;
            pointCount++;
        }
        
        if (pointCount === 0) {
            return CONSTANTS.MAP_CONFIG.DEFAULT_CENTER;
        }
        
        return [latSum / pointCount, lngSum / pointCount];
    }
    
    /**
     * Инициализация карты в модальном окне редактирования
     */
    initEditAddressMap(address) {
        // Уничтожаем существующую карту
        if (this.editAddressMap) {
            this.editAddressMap.remove();
        }
        
        // Определяем центр карты и нужно ли создавать маркер
        let center;
        let shouldCreateMarker = false;
        let isNewAddress = !address.id && !address.coordinates;
        
        if (address.coordinates) {
            // Существующий адрес - используем его координаты
            center = [address.coordinates.lat, address.coordinates.lng];
            shouldCreateMarker = true;
        } else {
            // Новый адрес - используем центр полигона области
            center = this.getAreaPolygonCenter();
            shouldCreateMarker = true; // Создаем маркер в центре полигона для нового адреса
        }
        
        this.editAddressMap = L.map('editAddressMap', {
            center: center,
            zoom: 16
        });
        
        // Добавляем тайлы
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.editAddressMap);
        
        // Добавляем маркер
        if (shouldCreateMarker) {
            this.editAddressMarker = L.marker([center[0], center[1]], {
                draggable: true
            }).addTo(this.editAddressMap);
            
            // Обработчик перетаскивания маркера
            this.editAddressMarker.on('dragend', async (event) => {
                const position = event.target.getLatLng();
                await this.updateAddressCoordinates(position.lat, position.lng);
            });
            
            // Отображаем координаты сразу при создании маркера
            this.updateMapCoordinatesText(center[0], center[1]);
            
            // Для новых адресов сразу выполняем обратное геокодирование
            if (isNewAddress) {
                // Обновляем currentEditingAddress с начальными координатами
                if (!this.currentEditingAddress) {
                    this.currentEditingAddress = {
                        coordinates: { lat: center[0], lng: center[1] }
                    };
                } else {
                    this.currentEditingAddress.coordinates = { lat: center[0], lng: center[1] };
                }
                
                // Выполняем обратное геокодирование для получения адреса
                setTimeout(async () => {
                    await this.updateAddressCoordinates(center[0], center[1]);
                }, 500);
            }
        } else {
            // Если маркер не создается, сбрасываем текст координат
            this.resetMapCoordinatesText();
        }
        
        // Обработчик клика по карте
        this.editAddressMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            
            if (this.editAddressMarker) {
                this.editAddressMarker.setLatLng([lat, lng]);
            } else {
                this.editAddressMarker = L.marker([lat, lng], {
                    draggable: true
                }).addTo(this.editAddressMap);
                
                this.editAddressMarker.on('dragend', async (event) => {
                    const position = event.target.getLatLng();
                    await this.updateAddressCoordinates(position.lat, position.lng);
                });
            }
            
            await this.updateAddressCoordinates(lat, lng);
        });
        
        // Принудительно обновляем размер карты
        setTimeout(() => {
            if (this.editAddressMap) {
                this.editAddressMap.invalidateSize();
            }
        }, 200);
    }
    
    /**
     * Обновление координат адреса
     */
    async updateAddressCoordinates(lat, lng) {
        if (this.currentEditingAddress) {
            this.currentEditingAddress.coordinates = { lat, lng };
            
            // Показываем индикатор загрузки в поле адреса
            const addressInput = document.getElementById('editAddressText');
            let originalPlaceholder = '';
            if (addressInput) {
                originalPlaceholder = addressInput.placeholder;
                addressInput.placeholder = 'Поиск адреса...';
                addressInput.disabled = true;
            }
            
            // Выполняем обратное геокодирование для получения адреса
            try {
                if (!this.config.osmAPI) {
                    this.config.osmAPI = new OSMOverpassAPI();
                }
                
                const geocodedAddress = await this.config.osmAPI.reverseGeocode(lat, lng);
                
                if (geocodedAddress) {
                    // Обновляем поле адреса в форме
                    if (addressInput) {
                        addressInput.value = geocodedAddress;
                        this.currentEditingAddress.address = geocodedAddress;
                    }
                    
                    await Helpers.debugLog(`🔄 Обратное геокодирование: ${geocodedAddress} для координат ${lat}, ${lng}`);
                } else {
                    await Helpers.debugLog(`⚠️ Не удалось найти адрес для координат ${lat}, ${lng}`);
                }
                
            } catch (error) {
                console.error('Ошибка обратного геокодирования:', error);
                await Helpers.debugLog(`❌ Ошибка обратного геокодирования: ${error.message}`);
            } finally {
                // Восстанавливаем состояние поля адреса
                if (addressInput) {
                    addressInput.disabled = false;
                    addressInput.placeholder = originalPlaceholder;
                }
            }
            
            // Обновляем текст с координатами под картой
            this.updateMapCoordinatesText(lat, lng);
            
            // Обновляем ссылки на внешние сервисы при изменении координат
            this.updateExternalServiceLinks(this.currentEditingAddress);
        }
    }
    
    /**
     * Обновление текста с координатами под картой
     */
    updateMapCoordinatesText(lat, lng) {
        const coordinatesText = document.getElementById('mapCoordinatesText');
        if (coordinatesText) {
            const formattedLat = parseFloat(lat).toFixed(6);
            const formattedLng = parseFloat(lng).toFixed(6);
            coordinatesText.textContent = `Перетащите маркер на карте для изменения координат (${formattedLat}, ${formattedLng})`;
        }
    }
    
    /**
     * Сброс текста координат к исходному состоянию
     */
    resetMapCoordinatesText() {
        const coordinatesText = document.getElementById('mapCoordinatesText');
        if (coordinatesText) {
            coordinatesText.textContent = 'Перетащите маркер на карте для изменения координат';
        }
    }
    
    /**
     * Обновление ссылок на внешние сервисы (2ГИС, Яндекс Карты, Панорамы)
     * @param {Object} address - Данные адреса
     */
    updateExternalServiceLinks(address) {
        if (!address || !address.coordinates) {
            return;
        }

        const { lat, lng } = address.coordinates;
        const addressText = address.address || '';

        // Определяем город для 2ГИС на основе адреса
        let cityFor2gis = 'novosibirsk'; // по умолчанию
        if (addressText.toLowerCase().includes('москва')) {
            cityFor2gis = 'moscow';
        } else if (addressText.toLowerCase().includes('санкт-петербург') || addressText.toLowerCase().includes('спб')) {
            cityFor2gis = 'spb';
        } else if (addressText.toLowerCase().includes('екатеринбург')) {
            cityFor2gis = 'ekaterinburg';
        } else if (addressText.toLowerCase().includes('казань')) {
            cityFor2gis = 'kazan';
        } else if (addressText.toLowerCase().includes('нижний новгород')) {
            cityFor2gis = 'nizhniy_novgorod';
        }

        // Формируем ссылки
        const links = {
            '2gis': `https://2gis.ru/${cityFor2gis}/search/${encodeURIComponent(addressText)}`,
            'yandex': `https://yandex.ru/maps/?whatshere[point]=${lng},${lat}&whatshere[zoom]=17`,
            'panorama': `https://yandex.ru/maps/?panorama[point]=${lng},${lat}&panorama[direction]=0,0&panorama[span]=130.000000,71.919192`
        };

        // Обновляем href у ссылок
        const link2gis = document.getElementById('url-2gis-address');
        const linkYandex = document.getElementById('url-yandex-address');
        const linkPanorama = document.getElementById('url-yandex-panorama-address');

        if (link2gis) {
            link2gis.href = links['2gis'];
        }
        if (linkYandex) {
            linkYandex.href = links['yandex'];
        }
        if (linkPanorama) {
            linkPanorama.href = links['panorama'];
        }
    }
    
    /**
     * Инициализация всех SlimSelect экземпляров для модального окна
     */
    async initModalSlimSelects() {
        try {
            // Уничтожаем существующие экземпляры
            this.destroyModalSlimSelects();
            
            // Добавляем стили для SlimSelect
            this.addSlimSelectCSS();
            
            // Загружаем справочные данные
            await this.loadReferenceData();
            
            // Инициализируем базовые селекты (тип, газоснабжение, индивидуальное отопление)
            this.initBasicModalSelects();
            
            await Helpers.debugLog('✅ SlimSelect экземпляры инициализированы для модального окна');
        } catch (error) {
            console.error('❌ Ошибка инициализации SlimSelect в модальном окне:', error);
        }
    }
    
    /**
     * Показ модального окна адреса
     */
    showAddressModal(address) {
        const modal = document.getElementById('editAddressModal');
        if (modal) {
            modal.classList.remove('hidden');
            
            // Устанавливаем текущий редактируемый адрес
            this.currentEditingAddress = address.id ? { ...address } : {};
            
            // Обновляем заголовок
            const title = document.getElementById('address-modal-title');
            if (title) {
                title.textContent = address.id ? 'Редактировать адрес' : 'Добавить адрес';
            }
            
            // Инициализируем SlimSelect после отображения модального окна
            setTimeout(async () => {
                await this.initModalSlimSelects();
                // Очищаем форму для нового адреса или заполняем данными существующего
                if (!address.id) {
                    this.clearAddressForm();
                } else {
                    this.populateAddressForm(address);
                }
            }, 50);
            
            // Инициализируем карту после того, как модальное окно станет видимым
            setTimeout(() => {
                this.initEditAddressMap(address);
            }, 100);
            
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
     * Заполнение формы данными адреса
     */
    populateAddressForm(address) {
        // Заполняем основные поля
        const addressInput = document.getElementById('editAddressText');
        if (addressInput) {
            addressInput.value = address.address || '';
        }
        
        // Устанавливаем тип адреса через SlimSelect
        if (this.modalSlimSelects.typeSelect) {
            this.modalSlimSelects.typeSelect.setSelected(address.type || 'house');
        }
        
        // Устанавливаем газоснабжение через SlimSelect
        if (this.modalSlimSelects.gasSupplySelect) {
            this.modalSlimSelects.gasSupplySelect.setSelected(address.gas_supply !== undefined && address.gas_supply !== null ? address.gas_supply.toString() : '');
        }
        
        // Устанавливаем индивидуальное отопление через SlimSelect
        if (this.modalSlimSelects.individualHeatingSelect) {
            this.modalSlimSelects.individualHeatingSelect.setSelected(address.individual_heating !== undefined && address.individual_heating !== null ? address.individual_heating.toString() : '');
        }
        
        // Устанавливаем справочные значения
        if (this.modalSlimSelects.houseSeriesSelect && address.house_series_id) {
            this.modalSlimSelects.houseSeriesSelect.setSelected(address.house_series_id);
        }
        
        if (this.modalSlimSelects.houseClassSelect && address.house_class_id) {
            this.modalSlimSelects.houseClassSelect.setSelected(address.house_class_id);
        }
        
        if (this.modalSlimSelects.wallMaterialSelect && address.wall_material_id) {
            this.modalSlimSelects.wallMaterialSelect.setSelected(address.wall_material_id);
        }
        
        if (this.modalSlimSelects.ceilingMaterialSelect && address.ceiling_material_id) {
            this.modalSlimSelects.ceilingMaterialSelect.setSelected(address.ceiling_material_id);
        }
        
        // Заполняем числовые поля
        const floorsInput = document.getElementById('editFloorsCount');
        if (floorsInput) {
            floorsInput.value = address.floors_count || '';
        }
        
        const buildYearInput = document.getElementById('editBuildYear');
        if (buildYearInput) {
            buildYearInput.value = address.build_year || '';
        }
        
        const entrancesInput = document.getElementById('editEntrancesCount');
        if (entrancesInput) {
            entrancesInput.value = address.entrances_count || '';
        }
        
        const livingSpacesInput = document.getElementById('editLivingSpaces');
        if (livingSpacesInput) {
            livingSpacesInput.value = address.living_spaces_count || '';
        }
        
        // Заполняем чекбоксы
        const playgroundCheckbox = document.getElementById('editHasPlayground');
        if (playgroundCheckbox) {
            playgroundCheckbox.checked = address.has_playground || false;
        }
        
        const sportsAreaCheckbox = document.getElementById('editHasSportsArea');
        if (sportsAreaCheckbox) {
            sportsAreaCheckbox.checked = address.has_sports_area || false;
        }
    }
    
    /**
     * Очистка формы адреса
     */
    clearAddressForm() {
        // Очищаем текстовые поля
        const addressInput = document.getElementById('editAddressText');
        if (addressInput) {
            addressInput.value = '';
        }
        
        // Сбрасываем SlimSelect к дефолтным значениям
        if (this.modalSlimSelects.typeSelect) {
            this.modalSlimSelects.typeSelect.setSelected('house');
        }
        
        if (this.modalSlimSelects.gasSupplySelect) {
            this.modalSlimSelects.gasSupplySelect.setSelected('');
        }
        
        if (this.modalSlimSelects.individualHeatingSelect) {
            this.modalSlimSelects.individualHeatingSelect.setSelected('');
        }
        
        if (this.modalSlimSelects.houseSeriesSelect) {
            this.modalSlimSelects.houseSeriesSelect.setSelected('');
        }
        
        if (this.modalSlimSelects.houseClassSelect) {
            this.modalSlimSelects.houseClassSelect.setSelected('');
        }
        
        if (this.modalSlimSelects.wallMaterialSelect) {
            this.modalSlimSelects.wallMaterialSelect.setSelected('');
        }
        
        if (this.modalSlimSelects.ceilingMaterialSelect) {
            this.modalSlimSelects.ceilingMaterialSelect.setSelected('');
        }
        
        // Очищаем числовые поля
        const floorsInput = document.getElementById('editFloorsCount');
        if (floorsInput) {
            floorsInput.value = '';
        }
        
        const buildYearInput = document.getElementById('editBuildYear');
        if (buildYearInput) {
            buildYearInput.value = '';
        }
        
        const entrancesInput = document.getElementById('editEntrancesCount');
        if (entrancesInput) {
            entrancesInput.value = '';
        }
        
        const livingSpacesInput = document.getElementById('editLivingSpaces');
        if (livingSpacesInput) {
            livingSpacesInput.value = '';
        }
        
        // Сбрасываем чекбоксы
        const playgroundCheckbox = document.getElementById('editHasPlayground');
        if (playgroundCheckbox) {
            playgroundCheckbox.checked = false;
        }
        
        const sportsAreaCheckbox = document.getElementById('editHasSportsArea');
        if (sportsAreaCheckbox) {
            sportsAreaCheckbox.checked = false;
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
        
        // Уничтожаем SlimSelect экземпляры
        this.destroyModalSlimSelects();
        
        // Сбрасываем текст координат
        this.resetMapCoordinatesText();
        
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
                individual_heating: formData.get('individual_heating') ? formData.get('individual_heating') === 'true' : null,
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
                console.warn('❌ AddressManager.deleteAddress: Адрес не найден:', addressId);
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
     * Удаление всех адресов в области
     */
    async deleteAllAddressesInArea() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            this.progressManager.showError('Область не выбрана');
            return;
        }
        
        try {
            // Получаем все адреса из базы данных
            const allAddresses = await window.db.getAll('addresses');
            
            // Фильтруем адреса, которые входят в полигон области
            const areaAddresses = allAddresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                // Используем метод проверки точки в полигоне из базы данных
                return window.db.isPointInPolygon(address.coordinates, currentArea.polygon);
            });
            
            if (areaAddresses.length === 0) {
                this.progressManager.showInfo('В области нет адресов для удаления');
                return;
            }
            
            // Показываем подтверждение удаления
            const confirmed = confirm(
                `Вы уверены, что хотите удалить ВСЕ адреса в области "${currentArea.name}"?\n\n` +
                `Будет удалено: ${areaAddresses.length} адресов\n\n` +
                `Это действие необратимо и также удалит все связанные объявления и объекты!`
            );
            
            if (!confirmed) {
                return;
            }
            
            // Блокируем кнопку
            const button = document.getElementById('deleteAllAddressesBtn');
            if (button) {
                button.disabled = true;
                button.innerHTML = '🗑️ Удаление...';
            }
            
            // Инициализируем прогресс-бар
            this.progressManager.createProgressBar('delete-data', 'delete-dataProgress');
            
            await Helpers.debugLog(`🗑️ === НАЧАЛО МАССОВОГО УДАЛЕНИЯ АДРЕСОВ ===`);
            await Helpers.debugLog(`🗑️ Удаляем ${areaAddresses.length} адресов в области: ${currentArea.name}`);
            
            let deletedCount = 0;
            let errorCount = 0;
            
            // Удаляем адреса по одному с обновлением прогресса
            for (let i = 0; i < areaAddresses.length; i++) {
                const address = areaAddresses[i];
                const progress = ((i + 1) / areaAddresses.length) * 100;
                
                try {
                    // Обновляем прогресс
                    this.progressManager.updateProgressBar(
                        'delete-data', 
                        progress, 
                        `Удаление адреса ${i + 1} из ${areaAddresses.length}: ${address.address || 'Без названия'}`
                    );
                    
                    // Удаляем связанные объявления
                    const listings = await window.db.getListingsByAddress(address.id);
                    for (const listing of listings) {
                        await window.db.deleteListing(listing.id);
                    }
                    
                    // Удаляем связанные объекты недвижимости
                    const objects = await window.db.getObjectsByAddress(address.id);
                    for (const object of objects) {
                        await window.db.deleteObject(object.id);
                    }
                    
                    // Удаляем сам адрес
                    await window.db.delete('addresses', address.id);
                    
                    // Уведомляем об удалении
                    this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_DELETED, {
                        address,
                        timestamp: new Date()
                    });
                    
                    deletedCount++;
                    
                    await Helpers.debugLog(`✅ Удален адрес: ${address.address} (${address.id})`);
                    
                } catch (error) {
                    console.error(`Ошибка удаления адреса ${address.id}:`, error);
                    errorCount++;
                }
                
                // Небольшая задержка для UI
                if (i % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            // Завершаем прогресс
            this.progressManager.updateProgressBar('delete-data', 100, 'Завершено');
            
            // Обновляем данные
            await this.refreshAddressData();
            
            const resultMessage = `Удалено адресов: ${deletedCount}${errorCount > 0 ? `, ошибок: ${errorCount}` : ''}`;
            
            if (errorCount === 0) {
                this.progressManager.showSuccess(resultMessage);
            } else {
                this.progressManager.showWarning(resultMessage);
            }
            
            await Helpers.debugLog(`🗑️ === ЗАВЕРШЕНИЕ МАССОВОГО УДАЛЕНИЯ ===`);
            await Helpers.debugLog(`🗑️ Результат: удалено ${deletedCount}, ошибок ${errorCount}`);
            
        } catch (error) {
            console.error('Error deleting all addresses in area:', error);
            this.progressManager.showError('Ошибка массового удаления адресов: ' + error.message);
        } finally {
            // Восстанавливаем кнопку
            const button = document.getElementById('deleteAllAddressesBtn');
            if (button) {
                button.disabled = false;
                button.innerHTML = `
                    <svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                    Удалить все адреса области
                `;
            }
        }
    }
    
    /**
     * Обновление данных адресов
     */
    async refreshAddressData() {
        try {
            await Helpers.debugLog('🔄 Обновление данных адресов');
            
            // Обновляем адреса (событие ADDRESSES_LOADED вызовется автоматически)
            await this.loadAddresses();
            
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
            this.progressManager.createProgressBar('import-addresses', 'import-addressesProgress');
            
            // Колбэк для отслеживания прогресса
            const progressCallback = (message, percent) => {
                this.progressManager.updateProgressBar('import-addresses', percent, message);
            };
            
            // Загружаем адреса
            const osmAddresses = await this.config.osmAPI.loadAddressesForArea(currentArea, progressCallback);
            
            if (osmAddresses.length === 0) {
                this.progressManager.updateProgressBar('import-addresses', 100, 'Завершено');
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
            
            this.progressManager.updateProgressBar('import-addresses', 100, 'Завершено');
            
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
                const mapAreaModel = new MapAreaModel(currentArea);
                return addressModel.belongsToMapArea(mapAreaModel);
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
            const polygonImported = await this.handlePolygonImport(importData, currentArea);
            
            // Импорт справочников (если присутствуют)
            if (importData.reference_data) {
                await this.importReferenceData(importData.reference_data);
            }
            
            // Получаем актуальную область (может быть обновлена полигоном)
            const actualArea = this.dataState.getState('currentArea');
            
            // Определяем, какие адреса импортировать
            let areaAddresses;
            
            if (actualArea.polygon && Array.isArray(actualArea.polygon) && actualArea.polygon.length >= 3) {
                // У области есть полигон - фильтруем адреса по нему
                console.log('🔍 Фильтруем адреса по существующему полигону области');
                areaAddresses = addresses.filter(address => {
                    if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                        return false;
                    }
                    
                    const addressModel = new AddressModel(address);
                    const mapAreaModel = new MapAreaModel(actualArea);
                    return addressModel.belongsToMapArea(mapAreaModel);
                });
            } else if (polygonImported) {
                // Полигон был импортирован из файла - импортируем все адреса из файла
                console.log('📥 Полигон импортирован - импортируем все адреса из файла');
                areaAddresses = addresses.filter(address => {
                    return address.coordinates && address.coordinates.lat && address.coordinates.lng;
                });
            } else {
                // Нет полигона ни в области, ни в файле - не можем определить принадлежность
                console.log('❌ Нет полигона для фильтрации адресов');
                areaAddresses = [];
            }
            
            if (areaAddresses.length === 0) {
                const message = polygonImported ? 
                    'В файле нет адресов с корректными координатами' :
                    'Ни один адрес из файла не входит в текущую область';
                this.progressManager.showWarning(message);
                return;
            }
            
            // Импортируем адреса
            const { importedCount, skippedCount } = await this.importAddresses(areaAddresses, actualArea);
            
            // Обновляем данные
            await this.refreshAddressData();
            
            let importMessage = `Импортировано: ${importedCount} адресов${skippedCount > 0 ? `, пропущено: ${skippedCount}` : ''}`;
            if (polygonImported) {
                importMessage += '. Полигон области обновлен из файла';
            }
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
        
        // Всегда перезаписываем полигон области данными из файла
        const hasExistingPolygon = currentArea.polygon && Array.isArray(currentArea.polygon) && currentArea.polygon.length >= 3;
        console.log(`📥 Импортируем полигон из файла (${hasExistingPolygon ? 'перезаписываем существующий' : 'создаем новый'})`);
        
        try {
            // Импортируем полигон
            const updatedArea = {
                ...currentArea,
                polygon: importData.area_polygon,
                updated_at: new Date()
            };
            
            await window.db.update('map_areas', updatedArea);
            this.dataState.setState('currentArea', updatedArea);
            
            console.log('✅ Полигон успешно импортирован в область:', updatedArea.polygon.length, 'точек');
            
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
        
        console.log('📥 Начинаем импорт адресов:', addresses.length, 'адресов для обработки');
        
        // Получаем существующие адреса для проверки дубликатов
        const existingAddresses = await window.db.getAll('addresses');
        console.log('📊 Существующих адресов в базе:', existingAddresses.length);
        
        for (const address of addresses) {
            try {
                console.log('🔍 Обработка адреса:', address.address);
                
                // Проверяем дубликаты
                const duplicate = existingAddresses.find(existing => 
                    existing.address === address.address && 
                    existing.coordinates &&
                    Math.abs(existing.coordinates.lat - address.coordinates.lat) < 0.0001 &&
                    Math.abs(existing.coordinates.lng - address.coordinates.lng) < 0.0001
                );
                
                if (duplicate) {
                    console.log('⚠️ Пропускаем дубликат:', address.address);
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
                    console.log('❌ Адрес не прошел валидацию:', address.address, validation.errors);
                    skippedCount++;
                    continue;
                }
                
                await window.db.add('addresses', newAddress);
                importedCount++;
                console.log('✅ Адрес успешно импортирован:', address.address);
                
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
     * Загрузка объявлений для области
     */
    async loadListings() {
        try {
            console.log('🚀 AddressManager.loadListings: Начинаем загрузку объявлений для области');
            console.log('🔍 AddressManager.loadListings: DataState экземпляр:', this.dataState);
            await Helpers.debugLog('📋 Загрузка объявлений для области...');
            
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                console.log('❌ AddressManager.loadListings: Область не выбрана');
                await Helpers.debugLog('❌ Область не выбрана для загрузки объявлений');
                return;
            }
            
            console.log('📍 AddressManager.loadListings: Область:', currentArea.name, 'ID:', currentArea.id);
            
            // ОПТИМИЗАЦИЯ: Используем кешированные объявления если доступны
            let allListings = this.dataState.getState('allListingsCache');
            if (!allListings) {
                console.log('📦 Загружаем объявления из БД (кеш недоступен)');
                allListings = await window.db.getAll('listings');
            } else {
                console.log('⚡ Используем кешированные объявления:', allListings.length);
            }
            let areaListings = [];
            
            await Helpers.debugLog(`📊 Всего объявлений в базе: ${allListings.length}`);
            await Helpers.debugLog(`🔍 Полигон области: ${currentArea.polygon ? currentArea.polygon.length : 0} точек`);
            
            if (currentArea.polygon && currentArea.polygon.length >= 3) {
                // Фильтруем объявления по полигону области
                areaListings = allListings.filter(listing => {
                    if (!listing.coordinates || !listing.coordinates.lat || !listing.coordinates.lng) {
                        return false;
                    }
                    
                    // Используем метод проверки точки в полигоне из базы данных
                    const isInside = window.db.isPointInPolygon(listing.coordinates, currentArea.polygon);
                    if (isInside) {
                        //console.log('🎯 Объявление в области:', listing.title, listing.coordinates);
                    }
                    return isInside;
                });
                
                await Helpers.debugLog(`🔍 Объявлений с координатами: ${allListings.filter(l => l.coordinates && l.coordinates.lat && l.coordinates.lng).length}`);
                
                // Проверим первые 3 объявления для отладки
                const debugListings = allListings.slice(0, 3);
                for (const listing of debugListings) {
                    if (listing.coordinates) {
                        const isInside = window.db.isPointInPolygon(listing.coordinates, currentArea.polygon);
                        console.log(`🔍 Отладка: ${listing.title} (${listing.coordinates.lat}, ${listing.coordinates.lng}) -> ${isInside ? 'ВНУТРИ' : 'ВНЕ'} области`);
                    }
                }
            } else {
                await Helpers.debugLog('⚠️ Область не имеет полигона, объявления не загружены');
                if (!currentArea.polygon) {
                    await Helpers.debugLog('❌ Полигон полностью отсутствует');
                } else {
                    await Helpers.debugLog(`❌ Полигон слишком мал: ${currentArea.polygon.length} точек (нужно минимум 3)`);
                }
            }
            
            await Helpers.debugLog(`📊 Объявлений для области найдено: ${areaListings.length}`);
            
            // Сохраняем объявления в состояние
            console.log(`🔧 AddressManager.loadListings: Сохраняем ${areaListings.length} объявлений в DataState`);
            this.dataState.setState('listings', areaListings);
            console.log(`✅ AddressManager.loadListings: Объявления сохранены. Проверка:`, this.dataState.getState('listings')?.length);
            
            // Уведомляем о загрузке объявлений
            this.eventBus.emit(CONSTANTS.EVENTS.LISTINGS_LOADED, {
                listings: areaListings,
                count: areaListings.length,
                area: currentArea,
                timestamp: new Date()
            });
            
            // Дополнительно уведомляем о том, что статистику нужно обновить
            this.eventBus.emit(CONSTANTS.EVENTS.AREA_UPDATED, currentArea);
            
            await Helpers.debugLog('✅ Объявления загружены в состояние');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки объявлений:', error);
            this.progressManager.showError('Ошибка загрузки объявлений: ' + error.message);
        }
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
        // Уничтожаем существующие SlimSelect экземпляры
        this.destroyModalSlimSelects();
        
        // Серии домов
        const houseSeriesSelect = document.getElementById('editHouseSeries');
        if (houseSeriesSelect) {
            houseSeriesSelect.innerHTML = '<option value="">Выберите серию...</option>';
            this.houseSeries.forEach(series => {
                houseSeriesSelect.innerHTML += `<option value="${series.id}">${series.name}</option>`;
            });
            
            this.modalSlimSelects.houseSeriesSelect = new SlimSelect({
                select: '#editHouseSeries',
                settings: {
                    searchText: 'Поиск...',
                    searchPlaceholder: 'Поиск серии дома',
                    searchingText: 'Поиск...',
                    placeholderText: 'Выберите серию...'
                },
                events: {
                    afterChange: (newVal) => {
                        this.updateReferenceActionButton('houseSeriesActionBtn', newVal);
                    }
                }
            });
            
            // Применяем стили Tailwind к SlimSelect
            this.applySlimSelectStyles('#editHouseSeries');
        }
        
        // Классы домов
        const houseClassSelect = document.getElementById('editHouseClass');
        if (houseClassSelect) {
            houseClassSelect.innerHTML = '<option value="">Выберите класс...</option>';
            this.houseClasses.forEach(houseClass => {
                houseClassSelect.innerHTML += `<option value="${houseClass.id}">${houseClass.name}</option>`;
            });
            
            this.modalSlimSelects.houseClassSelect = new SlimSelect({
                select: '#editHouseClass',
                settings: {
                    searchText: 'Поиск...',
                    searchPlaceholder: 'Поиск класса дома',
                    searchingText: 'Поиск...',
                    placeholderText: 'Выберите класс...'
                },
                events: {
                    afterChange: (newVal) => {
                        this.updateReferenceActionButton('houseClassActionBtn', newVal);
                    }
                }
            });
            this.applySlimSelectStyles('#editHouseClass');
        }
        
        // Материалы стен
        const wallMaterialSelect = document.getElementById('editWallMaterial');
        if (wallMaterialSelect) {
            wallMaterialSelect.innerHTML = '<option value="">Выберите материал...</option>';
            this.wallMaterials.forEach(material => {
                wallMaterialSelect.innerHTML += `<option value="${material.id}">${material.name}</option>`;
            });
            
            this.modalSlimSelects.wallMaterialSelect = new SlimSelect({
                select: '#editWallMaterial',
                settings: {
                    searchText: 'Поиск...',
                    searchPlaceholder: 'Поиск материала стен',
                    searchingText: 'Поиск...',
                    placeholderText: 'Выберите материал...'
                },
                events: {
                    afterChange: (newVal) => {
                        this.updateReferenceActionButton('wallMaterialActionBtn', newVal);
                    }
                }
            });
            this.applySlimSelectStyles('#editWallMaterial');
        }
        
        // Материалы перекрытий
        const ceilingMaterialSelect = document.getElementById('editCeilingMaterial');
        if (ceilingMaterialSelect) {
            ceilingMaterialSelect.innerHTML = '<option value="">Выберите материал...</option>';
            this.ceilingMaterials.forEach(material => {
                ceilingMaterialSelect.innerHTML += `<option value="${material.id}">${material.name}</option>`;
            });
            
            this.modalSlimSelects.ceilingMaterialSelect = new SlimSelect({
                select: '#editCeilingMaterial',
                settings: {
                    searchText: 'Поиск...',
                    searchPlaceholder: 'Поиск материала перекрытий',
                    searchingText: 'Поиск...',
                    placeholderText: 'Выберите материал...'
                },
                events: {
                    afterChange: (newVal) => {
                        this.updateReferenceActionButton('ceilingMaterialActionBtn', newVal);
                    }
                }
            });
            this.applySlimSelectStyles('#editCeilingMaterial');
        }
        
        // Инициализируем SlimSelect для основных селектов
        this.initBasicModalSelects();
    }
    
    /**
     * Инициализация базовых SlimSelect для модального окна
     */
    initBasicModalSelects() {
        // Тип недвижимости
        const typeSelect = document.getElementById('editAddressType');
        if (typeSelect && !this.modalSlimSelects.typeSelect) {
            this.modalSlimSelects.typeSelect = new SlimSelect({
                select: '#editAddressType',
                settings: {
                    placeholderText: 'Выберите тип...'
                }
            });
            this.applySlimSelectStyles('#editAddressType');
        }
        
        // Газоснабжение
        const gasSupplySelect = document.getElementById('editGasSupply');
        if (gasSupplySelect && !this.modalSlimSelects.gasSupplySelect) {
            this.modalSlimSelects.gasSupplySelect = new SlimSelect({
                select: '#editGasSupply',
                settings: {
                    placeholderText: 'Выберите...'
                }
            });
            this.applySlimSelectStyles('#editGasSupply');
        }
        
        // Индивидуальное отопление
        const individualHeatingSelect = document.getElementById('editIndividualHeating');
        if (individualHeatingSelect && !this.modalSlimSelects.individualHeatingSelect) {
            this.modalSlimSelects.individualHeatingSelect = new SlimSelect({
                select: '#editIndividualHeating',
                settings: {
                    placeholderText: 'Выберите...'
                }
            });
            this.applySlimSelectStyles('#editIndividualHeating');
        }
    }
    
    /**
     * Привязка событий для модальных окон справочников
     */
    bindReferenceModalEvents() {
        // Серия дома
        document.getElementById('saveHouseSeries')?.addEventListener('click', () => {
            this.saveHouseSeries();
        });
        document.getElementById('cancelHouseSeries')?.addEventListener('click', () => {
            this.closeModal('houseSeriesModal');
        });
        
        // Класс дома
        document.getElementById('saveHouseClass')?.addEventListener('click', () => {
            this.saveHouseClass();
        });
        document.getElementById('cancelHouseClass')?.addEventListener('click', () => {
            this.closeModal('houseClassModal');
        });
        
        // Материал стен
        document.getElementById('saveWallMaterial')?.addEventListener('click', () => {
            this.saveWallMaterial();
        });
        document.getElementById('cancelWallMaterial')?.addEventListener('click', () => {
            this.closeModal('wallMaterialModal');
        });
        
        // Материал перекрытий
        document.getElementById('saveCeilingMaterial')?.addEventListener('click', () => {
            this.saveCeilingMaterial();
        });
        document.getElementById('cancelCeilingMaterial')?.addEventListener('click', () => {
            this.closeModal('ceilingMaterialModal');
        });
    }
    
    /**
     * Закрытие модального окна
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            // Очищаем форму
            const form = modal.querySelector('form');
            if (form) {
                form.reset();
            }
        }
    }
    
    /**
     * Обновление кнопки действия справочника
     */
    updateReferenceActionButton(buttonId, selectedValue) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        
        if (selectedValue && selectedValue.length > 0 && selectedValue[0] && selectedValue[0].value) {
            // Есть выбранное значение - показываем "Редактировать"
            button.innerHTML = '<svg class="-ml-0.5 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>Редактировать';
            button.className = button.className.replace('bg-blue-600 hover:bg-blue-700', 'bg-green-600 hover:bg-green-700');
        } else {
            // Нет выбранного значения - показываем "Добавить"
            button.innerHTML = '+ Добавить';
            button.className = button.className.replace('bg-green-600 hover:bg-green-700', 'bg-blue-600 hover:bg-blue-700');
        }
    }
    
    /**
     * Добавление CSS стилей для SlimSelect
     */
    addSlimSelectCSS() {
        if (!document.getElementById('slimselect-tailwind-styles')) {
            const style = document.createElement('style');
            style.id = 'slimselect-tailwind-styles';
            style.textContent = `
                /* SlimSelect стили в стиле Tailwind для модального окна редактирования адреса */
                #editAddressModal .ss-main {
                    margin-top: 0.25rem !important;
                    margin-bottom: 0 !important;
                    width: 100% !important;
                    position: relative !important;
                    flex: 1 !important;
                }
                
                #editAddressModal .ss-single-selected {
                    display: flex !important;
                    align-items: center !important;
                    width: 100% !important;
                    height: 2.375rem !important;
                    min-height: 2.375rem !important;
                    max-height: 2.375rem !important;
                    padding: 0.375rem 2.5rem 0.375rem 0.75rem !important;
                    font-size: 0.875rem !important;
                    line-height: 1.5rem !important;
                    color: #111827 !important;
                    background-color: white !important;
                    background-image: none !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 0.375rem !important;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
                    transition: all 0.15s ease-in-out !important;
                    cursor: pointer !important;
                    box-sizing: border-box !important;
                }
                
                #editAddressModal .ss-single-selected:hover {
                    border-color: #9ca3af !important;
                }
                
                #editAddressModal .ss-single-selected:focus,
                #editAddressModal .ss-main:focus-within .ss-single-selected,
                #editAddressModal .ss-main.ss-open .ss-single-selected {
                    outline: 2px solid #4f46e5 !important;
                    outline-offset: 2px !important;
                    border-color: #4f46e5 !important;
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1) !important;
                }
                
                #editAddressModal .ss-arrow {
                    position: absolute !important;
                    top: 50% !important;
                    right: 0.75rem !important;
                    transform: translateY(-50%) !important;
                    width: 0 !important;
                    height: 0 !important;
                    border: 4px solid transparent !important;
                    border-top-color: #6b7280 !important;
                    border-bottom: none !important;
                    transition: transform 0.15s ease-in-out !important;
                }
                
                #editAddressModal .ss-main.ss-open .ss-arrow {
                    transform: translateY(-50%) rotate(180deg) !important;
                }
                
                #editAddressModal .ss-content {
                    position: absolute !important;
                    z-index: 9999 !important;
                    width: 100% !important;
                    max-height: 200px !important;
                    margin-top: 0.25rem !important;
                    background-color: white !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 0.375rem !important;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
                    overflow: hidden !important;
                }
                
                #editAddressModal .ss-list {
                    max-height: 160px !important;
                    overflow-y: auto !important;
                    padding: 0.25rem 0 !important;
                }
                
                #editAddressModal .ss-option {
                    display: flex !important;
                    align-items: center !important;
                    padding: 0.5rem 0.75rem !important;
                    font-size: 0.875rem !important;
                    line-height: 1.25rem !important;
                    color: #111827 !important;
                    cursor: pointer !important;
                    transition: background-color 0.15s ease-in-out !important;
                }
                
                #editAddressModal .ss-option:hover {
                    background-color: #f3f4f6 !important;
                }
                
                #editAddressModal .ss-option.ss-highlighted {
                    background-color: #4f46e5 !important;
                    color: white !important;
                }
                
                #editAddressModal .ss-option.ss-disabled {
                    color: #9ca3af !important;
                    cursor: not-allowed !important;
                    background-color: transparent !important;
                }
                
                #editAddressModal .ss-search {
                    padding: 0.5rem !important;
                    border-bottom: 1px solid #e5e7eb !important;
                }
                
                #editAddressModal .ss-search input {
                    width: 100% !important;
                    padding: 0.375rem 0.75rem !important;
                    font-size: 0.875rem !important;
                    line-height: 1.25rem !important;
                    color: #111827 !important;
                    background-color: white !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 0.25rem !important;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
                    transition: all 0.15s ease-in-out !important;
                    box-sizing: border-box !important;
                }
                
                #editAddressModal .ss-search input:focus {
                    outline: 2px solid #4f46e5 !important;
                    outline-offset: 2px !important;
                    border-color: #4f46e5 !important;
                }
                
                #editAddressModal .ss-search input::placeholder {
                    color: #9ca3af !important;
                }
                
                /* Дополнительные стили для placeholder */
                #editAddressModal .ss-placeholder {
                    color: #9ca3af !important;
                    font-style: normal !important;
                }
                
                /* Стили для мультивыбора (если используется) */
                #editAddressModal .ss-values {
                    display: flex !important;
                    flex-wrap: wrap !important;
                    gap: 0.25rem !important;
                }
                
                #editAddressModal .ss-value {
                    display: flex !important;
                    align-items: center !important;
                    padding: 0.25rem 0.5rem !important;
                    background-color: #e5e7eb !important;
                    border-radius: 0.25rem !important;
                    font-size: 0.75rem !important;
                    line-height: 1rem !important;
                    color: #374151 !important;
                }
                
                #editAddressModal .ss-value-delete {
                    margin-left: 0.25rem !important;
                    cursor: pointer !important;
                    color: #6b7280 !important;
                }
                
                #editAddressModal .ss-value-delete:hover {
                    color: #374151 !important;
                }
                
                /* Дополнительные стили для выравнивания элементов в flex контейнерах */
                #editAddressModal .flex.gap-2 {
                    align-items: flex-start !important;
                }
                
                #editAddressModal .flex.gap-2 .ss-main {
                    margin-top: 0.25rem !important;
                    flex: 1 !important;
                }
                
                /* Стили для кнопок в flex контейнерах */
                #editAddressModal .flex.gap-2 button {
                    margin-top: 0.25rem !important;
                    height: 2.375rem !important;
                    min-height: 2.375rem !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    /**
     * Применение стилей Tailwind к SlimSelect
     */
    applySlimSelectStyles(selectId) {
        // Добавляем CSS стили один раз
        this.addSlimSelectCSS();
    }
    
    /**
     * Уничтожение SlimSelect экземпляров модального окна
     */
    destroyModalSlimSelects() {
        Object.keys(this.modalSlimSelects).forEach(key => {
            if (this.modalSlimSelects[key]) {
                this.modalSlimSelects[key].destroy();
                this.modalSlimSelects[key] = null;
            }
        });
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
    
    openHouseSeriesModal() {
        // Проверяем, нужно ли редактировать или добавлять
        const select = document.getElementById('editHouseSeries');
        if (select && select.value) {
            // Редактирование существующей серии
            this.showEditHouseSeriesModal(select.value);
        } else {
            // Добавление новой серии
            this.showHouseSeriesModal();
        }
    }

    showHouseSeriesModal() {
        const modal = document.getElementById('houseSeriesModal');
        const form = document.getElementById('houseSeriesForm');
        const title = document.getElementById('house-series-modal-title');
        
        if (modal && form) {
            // Очищаем форму для новой серии
            form.reset();
            document.getElementById('houseSeriesId').value = '';
            
            // Устанавливаем заголовок
            if (title) {
                title.textContent = 'Добавить серию дома';
            }
            
            modal.classList.remove('hidden');
        } else {
            console.warn('❌ Модальное окно houseSeriesModal не найдено');
        }
    }

    async showEditHouseSeriesModal(seriesId) {
        try {
            const series = await window.db.get('house_series', seriesId);
            if (!series) {
                this.progressManager.showError('Серия дома не найдена');
                return;
            }

            const modal = document.getElementById('houseSeriesModal');
            const form = document.getElementById('houseSeriesForm');
            const title = document.getElementById('house-series-modal-title');
            
            if (modal && form) {
                // Заполняем форму данными серии
                document.getElementById('houseSeriesId').value = series.id;
                document.getElementById('houseSeriesName').value = series.name || '';
                
                // Устанавливаем заголовок
                if (title) {
                    title.textContent = 'Редактировать серию дома';
                }
                
                modal.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error loading house series for edit:', error);
            this.progressManager.showError('Ошибка загрузки серии дома');
        }
    }
    
    openHouseClassModal() {
        // Проверяем, нужно ли редактировать или добавлять
        const select = document.getElementById('editHouseClass');
        if (select && select.value) {
            // Редактирование существующего класса
            this.showEditHouseClassModal(select.value);
        } else {
            // Добавление нового класса
            this.showHouseClassModal();
        }
    }

    showHouseClassModal() {
        const modal = document.getElementById('houseClassModal');
        const form = document.getElementById('houseClassForm');
        const title = document.getElementById('house-class-modal-title');
        
        if (modal && form) {
            // Очищаем форму для нового класса
            form.reset();
            document.getElementById('houseClassId').value = '';
            document.getElementById('houseClassColor').value = '#3b82f6';
            
            // Устанавливаем заголовок
            if (title) {
                title.textContent = 'Добавить класс дома';
            }
            
            modal.classList.remove('hidden');
        } else {
            console.warn('❌ Модальное окно houseClassModal не найдено');
        }
    }

    async showEditHouseClassModal(classId) {
        try {
            const houseClass = await window.db.get('house_classes', classId);
            if (!houseClass) {
                this.progressManager.showError('Класс дома не найден');
                return;
            }

            const modal = document.getElementById('houseClassModal');
            const form = document.getElementById('houseClassForm');
            const title = document.getElementById('house-class-modal-title');
            
            if (modal && form) {
                // Заполняем форму данными класса
                document.getElementById('houseClassId').value = houseClass.id;
                document.getElementById('houseClassName').value = houseClass.name || '';
                document.getElementById('houseClassColor').value = houseClass.color || '#3b82f6';
                
                // Устанавливаем заголовок
                if (title) {
                    title.textContent = 'Редактировать класс дома';
                }
                
                modal.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error loading house class for edit:', error);
            this.progressManager.showError('Ошибка загрузки класса дома');
        }
    }
    
    openWallMaterialModal() {
        // Проверяем, нужно ли редактировать или добавлять
        const select = document.getElementById('editWallMaterial');
        if (select && select.value) {
            // Редактирование существующего материала
            this.showEditWallMaterialModal(select.value);
        } else {
            // Добавление нового материала
            this.showWallMaterialModal();
        }
    }

    showWallMaterialModal() {
        const modal = document.getElementById('wallMaterialModal');
        const form = document.getElementById('wallMaterialForm');
        const title = document.getElementById('wall-material-modal-title');
        
        if (modal && form) {
            // Очищаем форму для нового материала
            form.reset();
            document.getElementById('wallMaterialId').value = '';
            document.getElementById('wallMaterialColor').value = '#3b82f6';
            
            // Устанавливаем заголовок
            if (title) {
                title.textContent = 'Добавить материал стен';
            }
            
            modal.classList.remove('hidden');
        } else {
            console.warn('❌ Модальное окно wallMaterialModal не найдено');
        }
    }

    async showEditWallMaterialModal(materialId) {
        try {
            const material = await window.db.get('wall_materials', materialId);
            if (!material) {
                this.progressManager.showError('Материал стен не найден');
                return;
            }

            const modal = document.getElementById('wallMaterialModal');
            const form = document.getElementById('wallMaterialForm');
            const title = document.getElementById('wall-material-modal-title');
            
            if (modal && form) {
                // Заполняем форму данными материала
                document.getElementById('wallMaterialId').value = material.id;
                document.getElementById('wallMaterialName').value = material.name || '';
                document.getElementById('wallMaterialColor').value = material.color || '#3b82f6';
                
                // Устанавливаем заголовок
                if (title) {
                    title.textContent = 'Редактировать материал стен';
                }
                
                modal.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error loading wall material for edit:', error);
            this.progressManager.showError('Ошибка загрузки материала стен');
        }
    }
    
    openCeilingMaterialModal() {
        // Проверяем, нужно ли редактировать или добавлять
        const select = document.getElementById('editCeilingMaterial');
        if (select && select.value) {
            // Редактирование существующего материала
            this.showEditCeilingMaterialModal(select.value);
        } else {
            // Добавление нового материала
            this.showCeilingMaterialModal();
        }
    }

    showCeilingMaterialModal() {
        const modal = document.getElementById('ceilingMaterialModal');
        const form = document.getElementById('ceilingMaterialForm');
        const title = document.getElementById('ceiling-material-modal-title');
        
        if (modal && form) {
            // Очищаем форму для нового материала
            form.reset();
            document.getElementById('ceilingMaterialId').value = '';
            
            // Устанавливаем заголовок
            if (title) {
                title.textContent = 'Добавить материал перекрытий';
            }
            
            modal.classList.remove('hidden');
        } else {
            console.warn('❌ Модальное окно ceilingMaterialModal не найдено');
        }
    }

    async showEditCeilingMaterialModal(materialId) {
        try {
            const material = await window.db.get('ceiling_materials', materialId);
            if (!material) {
                this.progressManager.showError('Материал перекрытий не найден');
                return;
            }

            const modal = document.getElementById('ceilingMaterialModal');
            const form = document.getElementById('ceilingMaterialForm');
            const title = document.getElementById('ceiling-material-modal-title');
            
            if (modal && form) {
                // Заполняем форму данными материала
                document.getElementById('ceilingMaterialId').value = material.id;
                document.getElementById('ceilingMaterialName').value = material.name || '';
                
                // Устанавливаем заголовок
                if (title) {
                    title.textContent = 'Редактировать материал перекрытий';
                }
                
                modal.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error loading ceiling material for edit:', error);
            this.progressManager.showError('Ошибка загрузки материала перекрытий');
        }
    }
    
    /**
     * Сохранение серии дома
     */
    async saveHouseSeries() {
        try {
            const form = document.getElementById('houseSeriesForm');
            const formData = new FormData(form);
            
            const seriesId = formData.get('id');
            const series = {
                name: formData.get('name').trim()
            };

            if (!series.name) {
                this.progressManager.showError('Пожалуйста, введите название серии дома');
                return;
            }

            if (seriesId) {
                // Редактирование существующей серии
                series.id = seriesId;
                series.updated_at = new Date().toISOString();
                
                // Получаем существующую серию для сохранения created_at
                const existingSeries = await window.db.get('house_series', seriesId);
                if (existingSeries) {
                    series.created_at = existingSeries.created_at;
                }
            } else {
                // Создание новой серии
                series.id = Helpers.generateId();
                series.created_at = new Date().toISOString();
                series.updated_at = series.created_at;
            }

            if (seriesId) {
                await window.db.update('house_series', series);
            } else {
                await window.db.add('house_series', series);
            }
            
            this.closeModal('houseSeriesModal');
            await this.loadReferenceData();
            
            this.progressManager.showSuccess(seriesId ? 'Серия дома обновлена' : 'Серия дома добавлена');

        } catch (error) {
            console.error('Error saving house series:', error);
            this.progressManager.showError('Ошибка сохранения серии дома: ' + error.message);
        }
    }

    /**
     * Сохранение класса дома
     */
    async saveHouseClass() {
        try {
            const form = document.getElementById('houseClassForm');
            const formData = new FormData(form);
            
            const classId = formData.get('id');
            const houseClass = {
                name: formData.get('name').trim(),
                color: formData.get('color') || '#3b82f6'
            };

            if (!houseClass.name) {
                this.progressManager.showError('Пожалуйста, введите название класса дома');
                return;
            }

            if (classId) {
                // Редактирование существующего класса
                houseClass.id = classId;
                houseClass.updated_at = new Date().toISOString();
                
                // Получаем существующий класс для сохранения created_at
                const existingClass = await window.db.get('house_classes', classId);
                if (existingClass) {
                    houseClass.created_at = existingClass.created_at;
                }
            } else {
                // Создание нового класса
                houseClass.id = Helpers.generateId();
                houseClass.created_at = new Date().toISOString();
                houseClass.updated_at = houseClass.created_at;
            }

            if (classId) {
                await window.db.update('house_classes', houseClass);
            } else {
                await window.db.add('house_classes', houseClass);
            }
            
            this.closeModal('houseClassModal');
            await this.loadReferenceData();
            
            this.progressManager.showSuccess(classId ? 'Класс дома обновлен' : 'Класс дома добавлен');

        } catch (error) {
            console.error('Error saving house class:', error);
            this.progressManager.showError('Ошибка сохранения класса дома: ' + error.message);
        }
    }

    /**
     * Сохранение материала стен
     */
    async saveWallMaterial() {
        try {
            const form = document.getElementById('wallMaterialForm');
            const formData = new FormData(form);
            
            const materialId = formData.get('id');
            const material = {
                name: formData.get('name').trim(),
                color: formData.get('color') || '#3b82f6'
            };

            if (!material.name) {
                this.progressManager.showError('Пожалуйста, введите название материала стен');
                return;
            }

            if (materialId) {
                // Редактирование существующего материала
                material.id = materialId;
                material.updated_at = new Date().toISOString();
                
                // Получаем существующий материал для сохранения created_at
                const existingMaterial = await window.db.get('wall_materials', materialId);
                if (existingMaterial) {
                    material.created_at = existingMaterial.created_at;
                }
            } else {
                // Создание нового материала
                material.id = Helpers.generateId();
                material.created_at = new Date().toISOString();
                material.updated_at = material.created_at;
            }

            if (materialId) {
                await window.db.update('wall_materials', material);
            } else {
                await window.db.add('wall_materials', material);
            }
            
            this.closeModal('wallMaterialModal');
            await this.loadReferenceData();
            
            this.progressManager.showSuccess(materialId ? 'Материал стен обновлен' : 'Материал стен добавлен');

        } catch (error) {
            console.error('Error saving wall material:', error);
            this.progressManager.showError('Ошибка сохранения материала стен: ' + error.message);
        }
    }

    /**
     * Сохранение материала перекрытий
     */
    async saveCeilingMaterial() {
        try {
            const form = document.getElementById('ceilingMaterialForm');
            const formData = new FormData(form);
            
            const materialId = formData.get('id');
            const material = {
                name: formData.get('name').trim()
            };

            if (!material.name) {
                this.progressManager.showError('Пожалуйста, введите название материала перекрытий');
                return;
            }

            if (materialId) {
                // Редактирование существующего материала
                material.id = materialId;
                material.updated_at = new Date().toISOString();
                
                // Получаем существующий материал для сохранения created_at
                const existingMaterial = await window.db.get('ceiling_materials', materialId);
                if (existingMaterial) {
                    material.created_at = existingMaterial.created_at;
                }
            } else {
                // Создание нового материала
                material.id = Helpers.generateId();
                material.created_at = new Date().toISOString();
                material.updated_at = material.created_at;
            }

            if (materialId) {
                await window.db.update('ceiling_materials', material);
            } else {
                await window.db.add('ceiling_materials', material);
            }
            
            this.closeModal('ceilingMaterialModal');
            await this.loadReferenceData();
            
            this.progressManager.showSuccess(materialId ? 'Материал перекрытий обновлен' : 'Материал перекрытий добавлен');

        } catch (error) {
            console.error('Error saving ceiling material:', error);
            this.progressManager.showError('Ошибка сохранения материала перекрытий: ' + error.message);
        }
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
     * Инициализация фильтра по источнику для таблицы адресов
     */
    initSourceFilter() {
        try {
            // Уничтожаем существующий SlimSelect если есть
            if (this.sourceFilterSlimSelect) {
                this.sourceFilterSlimSelect.destroy();
                this.sourceFilterSlimSelect = null;
            }

            // Очищаем контейнер фильтра
            const sourceFilterContainer = document.getElementById('sourceFilter');
            if (!sourceFilterContainer) {
                console.warn('⚠️ AddressManager: Контейнер sourceFilter не найден');
                return;
            }
            
            sourceFilterContainer.innerHTML = '';

            if (!this.addressesTable) {
                console.warn('⚠️ AddressManager: Таблица адресов не инициализирована');
                return;
            }

            // Получаем колонку с источниками (первая колонка, индекс 0)
            const column = this.addressesTable.column(0);
            
            // Создаем select элемент
            const select = document.createElement('select');
            select.id = 'sourceFilterSelect';
            select.className = 'text-sm';
            
            // Добавляем опцию "Все источники"
            const allOption = document.createElement('option');
            allOption.value = '';
            allOption.textContent = 'Все источники';
            select.appendChild(allOption);
            
            // Получаем уникальные источники из данных колонки
            const uniqueSources = [];
            column.data().unique().each(function(value) {
                if (value && value.trim() && !uniqueSources.includes(value.trim())) {
                    uniqueSources.push(value.trim());
                }
            });

            // Сортируем источники
            uniqueSources.sort();
            
            // Добавляем опции для каждого источника
            uniqueSources.forEach(source => {
                const option = document.createElement('option');
                option.value = source;
                option.textContent = CONSTANTS.DATA_SOURCE_NAMES[source] || source;
                select.appendChild(option);
            });
            
            sourceFilterContainer.appendChild(select);

            console.log('🔍 Найдено источников для фильтра:', uniqueSources);

            // Инициализируем SlimSelect
            this.sourceFilterSlimSelect = new SlimSelect({
                select: '#sourceFilterSelect',
                settings: {
                    showSearch: false,
                    placeholderText: 'Все источники'
                },
                events: {
                    afterChange: (newVal) => {
                        const val = newVal && newVal.length > 0 ? newVal[0].value : '';
                        const searchVal = val ? '^' + $.fn.dataTable.util.escapeRegex(val) + '$' : '';
                        column.search(searchVal, true, false).draw();
                        
                        console.log('🔍 Фильтр по источнику изменен:', val || 'Все источники');
                    }
                }
            });
            
            console.log('✅ Фильтр по источнику инициализирован');

        } catch (error) {
            console.error('❌ Ошибка инициализации фильтра по источнику:', error);
        }
    }
    
    /**
     * Загрузка объектов недвижимости для области
     */
    async loadObjects() {
        try {
            await Helpers.debugLog('🏢 Загрузка объектов недвижимости для области...');
            
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                await Helpers.debugLog('❌ Область не выбрана для загрузки объектов');
                return;
            }
            
            // Получаем все объекты из базы данных
            const allObjects = await window.db.getAll('objects');
            
            // Получаем адреса области для фильтрации объектов
            const addresses = await window.db.getAll('addresses');
            const areaAddresses = addresses.filter(address => address.map_area_id === currentArea.id);
            const areaAddressIds = new Set(areaAddresses.map(addr => addr.id));
            const addressesMap = new Map(addresses.map(addr => [addr.id, addr]));
            
            // Фильтруем объекты по адресам в области
            const areaObjects = allObjects.filter(object => 
                object.address_id && 
                areaAddressIds.has(object.address_id) && 
                object.status !== 'deleted'
            ).map(object => ({
                ...object,
                address: addressesMap.get(object.address_id)
            })).filter(object => object.address);
            
            await Helpers.debugLog(`📊 Объектов для области найдено: ${areaObjects.length}`);
            
            // Сохраняем объекты в состояние
            this.dataState.setState('objects', areaObjects);
            
            // Уведомляем о загрузке объектов
            this.eventBus.emit(CONSTANTS.EVENTS.DATA_LOADED, {
                type: 'objects',
                objects: areaObjects,
                count: areaObjects.length,
                area: currentArea,
                timestamp: new Date()
            });
            
            await Helpers.debugLog('✅ Объекты загружены в состояние');
            
        } catch (error) {
            console.error('❌ Ошибка загрузки объектов:', error);
            this.progressManager.showError('Ошибка загрузки объектов: ' + error.message);
        }
    }
    
    /**
     * Обработка адресов с использованием умного алгоритма с ML
     */
    async processAddressesSmart() {
        if (this.isLoading) {
            console.log('⚠️ Обработка адресов уже выполняется');
            return;
        }

        try {
            this.isLoading = true;
            console.log('🧠 Начинаем умное определение адресов с ML');
            this.progressManager.updateProgressBar('addresses', 0, 'Инициализация умного алгоритма...');

            // Загружаем объявления для обработки умным алгоритмом
            const allListings = await window.db.getAll('listings');
            const targetListings = allListings.filter(listing => {
                const needsProcessing = 
                    !listing.address_id || 
                    listing.address_match_confidence === 'very_low' ||
                    listing.address_match_confidence === 'low' ||
                    (listing.address_match_confidence === 'medium' && listing.address_match_score < 0.75);
                
                const hasCoordinates = listing.coordinates && 
                    listing.coordinates.lat && 
                    (listing.coordinates.lng || listing.coordinates.lon);
                
                return needsProcessing && hasCoordinates;
            });

            if (targetListings.length === 0) {
                this.progressManager.showInfo('Нет объявлений для обработки умным алгоритмом');
                return;
            }

            this.progressManager.updateProgressBar('addresses', 10, 
                `🧠 Найдено ${targetListings.length} объявлений для умной обработки`);

            // Загружаем все адреса
            const allAddresses = await window.db.getAll('addresses');
            if (allAddresses.length === 0) {
                this.progressManager.showError('В базе данных нет адресов для сопоставления');
                return;
            }

            this.progressManager.updateProgressBar('addresses', 20, 
                `📍 Загружено ${allAddresses.length} адресов из базы`);

            // Инициализируем умный алгоритм
            if (!window.smartAddressMatcher) {
                this.progressManager.showError('Умный алгоритм определения адресов не инициализирован');
                return;
            }

            const smartMatcher = window.smartAddressMatcher;
            if (window.spatialIndexManager) {
                smartMatcher.spatialIndex = window.spatialIndexManager;
            }

            this.progressManager.updateProgressBar('addresses', 30, 
                '🧠 Запуск умного алгоритма с машинным обучением...');

            // Обрабатываем объявления меньшими батчами для ML-алгоритма
            const batchSize = 20;
            let processedCount = 0;
            let significantImprovements = 0;
            let results = {
                processed: 0,
                matched: 0,
                improved: 0,
                significantlyImproved: 0,
                perfect: 0,
                high: 0,
                medium: 0,
                low: 0,
                veryLow: 0,
                noMatch: 0,
                errors: 0,
                methodStats: {},
                avgProcessingTime: 0,
                totalProcessingTime: 0
            };

            const startTime = Date.now();

            for (let i = 0; i < targetListings.length; i += batchSize) {
                const batch = targetListings.slice(i, i + batchSize);
                const progress = 30 + ((i / targetListings.length) * 60);
                
                this.progressManager.updateProgressBar('addresses', progress, 
                    `🧠 Умная ML-обработка ${i + 1}-${Math.min(i + batchSize, targetListings.length)} из ${targetListings.length}`);

                // Обрабатываем батч
                for (const listing of batch) {
                    try {
                        const oldConfidence = listing.address_match_confidence;
                        const oldScore = listing.address_match_score || 0;

                        const matchResult = await smartMatcher.matchAddressSmart(listing, allAddresses);
                        processedCount++;
                        results.processed++;
                        results.totalProcessingTime += matchResult.processingTime || 0;

                        console.log(`🧠 ML-результат для ${listing.id}: ${matchResult.confidence} (${matchResult.method}), скор: ${matchResult.score?.toFixed(3)}, время: ${matchResult.processingTime}ms`);

                        if (matchResult.address) {
                            results.matched++;

                            // Проверяем улучшение
                            const confidenceLevels = ['none', 'very_low', 'low', 'medium', 'high', 'perfect'];
                            const oldLevel = confidenceLevels.indexOf(oldConfidence || 'none');
                            const newLevel = confidenceLevels.indexOf(matchResult.confidence);
                            
                            if (newLevel > oldLevel || matchResult.score > oldScore + 0.1) {
                                results.improved++;
                                
                                // Значительное улучшение
                                if (newLevel > oldLevel + 1 || matchResult.score > oldScore + 0.2) {
                                    significantImprovements++;
                                    results.significantlyImproved++;
                                    console.log(`🎯 Значительное улучшение для ${listing.id}: ${oldConfidence}(${oldScore.toFixed(3)}) → ${matchResult.confidence}(${matchResult.score.toFixed(3)})`);
                                } else {
                                    console.log(`✅ Улучшение для ${listing.id}: ${oldConfidence}(${oldScore.toFixed(3)}) → ${matchResult.confidence}(${matchResult.score.toFixed(3)})`);
                                }
                            }

                            // Обновляем объявление
                            listing.address_id = matchResult.address.id;
                            listing.address_match_confidence = matchResult.confidence;
                            listing.address_match_method = matchResult.method;
                            listing.address_match_score = matchResult.score;
                            listing.address_distance = matchResult.distance;
                            listing.updated_at = new Date();

                            // Дополнительные метрики от умного алгоритма
                            if (matchResult.textSimilarity !== undefined) {
                                listing.address_text_similarity = matchResult.textSimilarity;
                            }
                            if (matchResult.semanticSimilarity !== undefined) {
                                listing.address_semantic_similarity = matchResult.semanticSimilarity;
                            }
                            if (matchResult.structuralSimilarity !== undefined) {
                                listing.address_structural_similarity = matchResult.structuralSimilarity;
                            }
                            if (matchResult.fuzzyScore !== undefined) {
                                listing.address_fuzzy_score = matchResult.fuzzyScore;
                            }

                            // Обновляем статус обработки
                            if (listing.processing_status === 'address_needed') {
                                listing.processing_status = 'duplicate_check_needed';
                            }

                            await window.db.update('listings', listing);

                            // Статистика по уровням доверия
                            switch (matchResult.confidence) {
                                case 'perfect':
                                    results.perfect++;
                                    break;
                                case 'high':
                                    results.high++;
                                    break;
                                case 'medium':
                                    results.medium++;
                                    break;
                                case 'low':
                                    results.low++;
                                    break;
                                case 'very_low':
                                    results.veryLow++;
                                    break;
                            }

                            // Статистика методов
                            const method = matchResult.method;
                            results.methodStats[method] = (results.methodStats[method] || 0) + 1;

                        } else {
                            results.noMatch++;
                        }
                    } catch (error) {
                        results.errors++;
                        console.error('Ошибка умной обработки объявления:', error);
                    }
                }

                // Задержка для ML-алгоритма
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            const totalTime = Date.now() - startTime;
            results.avgProcessingTime = results.totalProcessingTime / results.processed;

            this.progressManager.updateProgressBar('addresses', 100, '🧠 Умная ML-обработка завершена');

            // Получаем статистику алгоритма
            const algorithmStats = smartMatcher.getStats();

            // Обновляем данные и события
            await this.loadAddresses();

            // Показываем детальный результат
            const methodStatsText = Object.entries(results.methodStats)
                .map(([method, count]) => `  • ${method}: ${count}`)
                .join('\n');

            const message = `🧠 Умная ML-обработка адресов завершена:

📊 Общая статистика:
• Обработано: ${results.processed}
• Найдены адреса: ${results.matched}
• Улучшено: ${results.improved}
• Значительно улучшено: ${results.significantlyImproved}

🎯 По уровням точности:
• Идеальная точность: ${results.perfect}
• Высокая точность: ${results.high}
• Средняя точность: ${results.medium}
• Низкая точность: ${results.low}
• Очень низкая: ${results.veryLow}
• Не найдено: ${results.noMatch}
• Ошибок: ${results.errors}

🔧 ML-методы определения:
${methodStatsText}

⚡ Производительность:
• Общее время: ${(totalTime / 1000).toFixed(1)}с
• Среднее время на объявление: ${results.avgProcessingTime.toFixed(1)}мс
• Кэш размер: ${algorithmStats.cacheSize}
• Общий успех ML: ${algorithmStats.overallSuccessRate.toFixed(1)}%

🧠 Использован умный алгоритм с машинным обучением!`;

            this.progressManager.showSuccess(message);

        } catch (error) {
            console.error('❌ Error in smart ML address processing:', error);
            this.progressManager.showError('Ошибка умного определения адресов: ' + error.message);
        } finally {
            this.isLoading = false;
            // Прогресс-бар автоматически скрывается при 100%
        }
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