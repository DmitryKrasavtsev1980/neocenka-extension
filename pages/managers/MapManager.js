/**
 * Менеджер карты
 * Управляет отображением карты, маркеров и фильтров
 */

class MapManager {
    constructor(dataState, eventBus, progressManager) {
        this.dataState = dataState;
        this.eventBus = eventBus;
        this.progressManager = progressManager;
        
        // Объекты карты
        this.map = null;
        this.drawnItems = null;
        this.drawControl = null;
        this.drawnPolygon = null;
        this.areaPolygonLayer = null;
        
        // Слои карты
        this.mapLayers = {
            addresses: null,
            objects: null,
            listings: null
        };
        
        // Кластеризация маркеров
        this.addressesCluster = null;
        this.listingsCluster = null;
        
        // Состояние карты
        this.mapState = {
            initialized: false,
            activeFilter: null,
            defaultCenter: CONSTANTS.MAP_CONFIG.DEFAULT_CENTER,
            defaultZoom: CONSTANTS.MAP_CONFIG.DEFAULT_ZOOM
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
            
            this.eventBus.on(CONSTANTS.EVENTS.ADDRESSES_LOADED, async (addresses) => {
                await this.loadAddressesOnMap();
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.LISTINGS_LOADED, async (listings) => {
                await this.loadListingsOnMap();
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.MAP_FILTER_CHANGED, (filterType) => {
                this.toggleMapFilter(filterType);
            });
        }
        
        // Привязка к кнопкам фильтров
        this.bindFilterButtons();
        
        // Привязка к кнопке обновления карты
        document.getElementById('refreshMapBtn')?.addEventListener('click', () => {
            this.refreshMapData();
        });
    }
    
    /**
     * Привязка к кнопкам фильтров
     */
    bindFilterButtons() {
        const filterButtons = [
            { id: 'filterByYear', type: 'year' },
            { id: 'filterBySeries', type: 'series' },
            { id: 'filterByFloors', type: 'floors' },
            { id: 'filterByObjects', type: 'objects' },
            { id: 'filterByListings', type: 'listings' }
        ];
        
        filterButtons.forEach(({ id, type }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => {
                    this.toggleMapFilter(type);
                });
            }
        });
    }
    
    /**
     * Обработка загрузки области
     */
    async onAreaLoaded(area) {
        if (!this.mapState.initialized) {
            await this.initMap();
        }
        
        this.displayAreaPolygon();
        await this.loadMapData();
    }
    
    /**
     * Инициализация карты
     */
    async initMap() {
        try {
            if (this.mapState.initialized) {
                await Helpers.debugLog('🗺️ Карта уже инициализирована');
                return;
            }
            
            await Helpers.debugLog('🗺️ Инициализация карты');
            
            // Создаем карту
            this.map = L.map('map').setView(this.mapState.defaultCenter, this.mapState.defaultZoom);
            
            // Добавляем слой карты
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.map);
            
            // Инициализируем слои карты
            this.initMapLayers();
            
            // Инициализируем инструменты рисования
            this.initDrawControls();
            
            // Если у области есть полигон, создаем его слой
            const currentArea = this.dataState.getState('currentArea');
            if (currentArea && this.hasAreaPolygon(currentArea)) {
                this.displayAreaPolygon();
            }
            
            // Активируем фильтр по умолчанию
            this.setDefaultMapFilter();
            
            this.mapState.initialized = true;
            this.dataState.setState('flags', {
                ...this.dataState.getState('flags'),
                mapInitialized: true
            });
            
            // Уведомляем о инициализации
            this.eventBus.emit(CONSTANTS.EVENTS.MAP_INITIALIZED, {
                mapId: 'map',
                timestamp: new Date()
            });
            
            await Helpers.debugLog('✅ Карта инициализирована');
            
        } catch (error) {
            console.error('Error initializing map:', error);
            this.progressManager.showError('Ошибка инициализации карты');
            throw error;
        }
    }
    
    /**
     * Инициализация слоев карты
     */
    initMapLayers() {
        // Создаем группы слоев (только адреса включены по умолчанию)
        this.mapLayers.addresses = L.layerGroup().addTo(this.map);
        this.mapLayers.objects = L.layerGroup();
        this.mapLayers.listings = L.layerGroup();
        
        // Инициализируем кластеризацию для адресов (не создаем сразу)
        this.addressesCluster = null;
        
        // Инициализируем кластеризацию для объявлений (не создаем сразу)
        this.listingsCluster = null;
        
        // Создаем контроллер слоев
        const overlayMaps = {
            "📍 Адреса": this.mapLayers.addresses,
            "🏠 Объекты": this.mapLayers.objects,
            "📋 Объявления": this.mapLayers.listings
        };
        
        // Добавляем полигон области, если он существует
        if (this.areaPolygonLayer) {
            overlayMaps["🔷 Полигон области"] = this.areaPolygonLayer;
        }
        
        // Добавляем контроллер на карту
        const layerControl = L.control.layers(null, overlayMaps, {
            position: 'topleft',
            collapsed: false
        }).addTo(this.map);
        
        // Добавляем полигон области на карту по умолчанию (если есть)
        if (this.areaPolygonLayer) {
            this.areaPolygonLayer.addTo(this.map);
        }
        
        // Добавляем обработчики для управления кластерами
        this.map.on('overlayadd', (e) => {
            Helpers.debugLog('Layer added:', e.name);
            if (e.name === '📍 Адреса' && this.addressesCluster) {
                this.addressesCluster.markerLayer.addTo(this.map);
                this.addressesCluster.clusterLayer.addTo(this.map);
            } else if (e.name === '📋 Объявления' && this.listingsCluster) {
                this.listingsCluster.markerLayer.addTo(this.map);
                this.listingsCluster.clusterLayer.addTo(this.map);
            }
        });
        
        this.map.on('overlayremove', (e) => {
            Helpers.debugLog('Layer removed:', e.name);
            if (e.name === '📍 Адреса' && this.addressesCluster) {
                this.map.removeLayer(this.addressesCluster.markerLayer);
                this.map.removeLayer(this.addressesCluster.clusterLayer);
            } else if (e.name === '📋 Объявления' && this.listingsCluster) {
                this.map.removeLayer(this.listingsCluster.markerLayer);
                this.map.removeLayer(this.listingsCluster.clusterLayer);
            }
        });
    }
    
    /**
     * Инициализация инструментов рисования
     */
    initDrawControls() {
        // Создаем группу для рисования
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);
        
        // Если есть существующий полигон, добавляем его в группу для редактирования
        if (this.areaPolygonLayer) {
            // Сначала удаляем полигон с карты (если он был добавлен напрямую)
            if (this.map.hasLayer(this.areaPolygonLayer)) {
                this.map.removeLayer(this.areaPolygonLayer);
            }
            // Добавляем полигон в группу редактирования (это автоматически добавит его на карту)
            this.drawnItems.addLayer(this.areaPolygonLayer);
        }
        
        // Настройки инструментов рисования
        const drawControl = new L.Control.Draw({
            position: 'topright',
            draw: {
                polygon: {
                    allowIntersection: false,
                    drawError: {
                        color: '#e1e047',
                        message: '<strong>Ошибка:</strong> границы полигона не должны пересекаться!'
                    },
                    shapeOptions: {
                        color: CONSTANTS.MAP_CONFIG.POLYGON_COLOR,
                        fillColor: CONSTANTS.MAP_CONFIG.POLYGON_COLOR,
                        fillOpacity: CONSTANTS.MAP_CONFIG.POLYGON_FILL_OPACITY
                    }
                },
                polyline: false,
                rectangle: false,
                circle: false,
                marker: false,
                circlemarker: false
            },
            edit: {
                featureGroup: this.drawnItems,
                remove: true
            }
        });
        
        this.drawControl = drawControl;
        this.map.addControl(drawControl);
        
        // Обработчики событий рисования
        this.map.on(L.Draw.Event.CREATED, (e) => {
            this.onPolygonCreated(e);
        });
        
        this.map.on(L.Draw.Event.EDITED, (e) => {
            this.onPolygonEdited(e);
        });
        
        this.map.on(L.Draw.Event.DELETED, (e) => {
            this.onPolygonDeleted(e);
        });
    }
    
    /**
     * Обработка создания полигона
     */
    onPolygonCreated(e) {
        const layer = e.layer;
        
        // Удаляем предыдущий полигон из группы редактирования
        if (this.drawnPolygon && this.drawnItems.hasLayer(this.drawnPolygon)) {
            this.drawnItems.removeLayer(this.drawnPolygon);
        }
        if (this.areaPolygonLayer && this.drawnItems.hasLayer(this.areaPolygonLayer)) {
            this.drawnItems.removeLayer(this.areaPolygonLayer);
        }
        
        // Также удаляем полигоны напрямую с карты
        if (this.drawnPolygon && this.map.hasLayer(this.drawnPolygon)) {
            this.map.removeLayer(this.drawnPolygon);
        }
        if (this.areaPolygonLayer && this.map.hasLayer(this.areaPolygonLayer)) {
            this.map.removeLayer(this.areaPolygonLayer);
        }
        
        // Добавляем новый полигон
        this.drawnPolygon = layer;
        this.areaPolygonLayer = layer;
        this.drawnItems.addLayer(layer);
        
        // Сохраняем полигон в область
        this.savePolygon();
    }
    
    /**
     * Обработка редактирования полигона
     */
    onPolygonEdited(e) {
        // Обновляем все отредактированные слои
        const layers = e.layers;
        layers.eachLayer((layer) => {
            // Обновляем ссылки на полигон
            this.drawnPolygon = layer;
            this.areaPolygonLayer = layer;
        });
        
        // Сохраняем изменения
        this.savePolygon();
    }
    
    /**
     * Обработка удаления полигона
     */
    onPolygonDeleted(e) {
        // Очищаем все ссылки на полигон
        this.drawnPolygon = null;
        this.areaPolygonLayer = null;
        
        // Очищаем полигон в области
        const currentArea = this.dataState.getState('currentArea');
        if (currentArea) {
            currentArea.polygon = [];
            this.dataState.setState('currentArea', currentArea);
        }
        
        // Уведомляем о изменении
        this.eventBus.emit(CONSTANTS.EVENTS.AREA_UPDATED, {
            area: currentArea,
            polygonDeleted: true,
            timestamp: new Date()
        });
    }
    
    /**
     * Сохранение полигона
     */
    async savePolygon() {
        if (!this.drawnPolygon) return;
        
        try {
            // Извлекаем координаты из полигона
            const latLngs = this.drawnPolygon.getLatLngs()[0];
            const polygon = latLngs.map(point => ({
                lat: point.lat,
                lng: point.lng
            }));
            
            // Обновляем область
            const currentArea = this.dataState.getState('currentArea');
            if (currentArea) {
                currentArea.polygon = polygon;
                this.dataState.setState('currentArea', currentArea);
                
                // Сохраняем в базу данных
                await window.db.update('map_areas', currentArea);
                
                // Уведомляем о изменении
                this.eventBus.emit(CONSTANTS.EVENTS.AREA_UPDATED, {
                    area: currentArea,
                    polygonChanged: true,
                    timestamp: new Date()
                });
                
                await Helpers.debugLog('✅ Полигон сохранен');
            }
            
        } catch (error) {
            console.error('Error saving polygon:', error);
            this.progressManager.showError('Ошибка сохранения полигона');
        }
    }
    
    /**
     * Отображение полигона области
     */
    displayAreaPolygon() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea || !this.hasAreaPolygon(currentArea)) {
            return;
        }
        
        // Если полигон уже существует, не создаем его повторно
        if (this.areaPolygonLayer) {
            Helpers.debugLog('🔷 Полигон области уже отображен, пропускаем повторное создание');
            return;
        }
        
        Helpers.debugLog('🔷 Создаем полигон области на карте');
        
        // Конвертируем координаты в формат Leaflet
        const latLngs = currentArea.polygon.map(point => [point.lat, point.lng]);
        
        // Создаем полигон как отдельный слой
        this.areaPolygonLayer = L.polygon(latLngs, {
            color: CONSTANTS.MAP_CONFIG.POLYGON_COLOR,
            fillColor: CONSTANTS.MAP_CONFIG.POLYGON_COLOR,
            fillOpacity: CONSTANTS.MAP_CONFIG.POLYGON_FILL_OPACITY,
            weight: 2,
            opacity: CONSTANTS.MAP_CONFIG.POLYGON_OPACITY
        });
        
        // Сохраняем ссылку на полигон для редактирования
        this.drawnPolygon = this.areaPolygonLayer;
        
        // Добавляем полигон в группу для редактирования (если группа уже создана)
        if (this.drawnItems) {
            this.drawnItems.addLayer(this.areaPolygonLayer);
        } else {
            // Если группа еще не создана, добавляем полигон напрямую на карту
            this.map.addLayer(this.areaPolygonLayer);
        }
        
        // Центрируем карту на полигоне только если панель карты видима
        const mapContent = document.getElementById('mapPanelContent');
        if (mapContent && mapContent.style.display !== 'none') {
            this.map.fitBounds(this.areaPolygonLayer.getBounds());
        }
    }
    
    /**
     * Загрузка всех данных на карту
     */
    async loadMapData() {
        if (!this.mapState.initialized) {
            await Helpers.debugLog('🗺️ Карта не инициализирована, пропускаем загрузку данных');
            return;
        }
        
        try {
            await Helpers.debugLog('🔄 === ОБНОВЛЕНИЕ ВСЕХ ДАННЫХ КАРТЫ ===');
            
            // Отображаем полигон области
            this.displayAreaPolygon();
            
            await Helpers.debugLog('📍 Загружаем адреса на карту...');
            await this.loadAddressesOnMap();
            
            await Helpers.debugLog('🏢 Загружаем объекты на карту...');
            await this.loadObjectsOnMap();
            
            await Helpers.debugLog('📋 Загружаем объявления на карту...');
            await this.loadListingsOnMap();
            
            // Уведомляем об обновлении
            this.eventBus.emit(CONSTANTS.EVENTS.MAP_UPDATED, {
                timestamp: new Date()
            });
            
            await Helpers.debugLog('✅ Обновление карты завершено');
            
        } catch (error) {
            console.error('Error loading map data:', error);
            this.progressManager.showError('Ошибка загрузки данных карты');
        }
    }
    
    /**
     * Загрузка адресов на карту
     */
    async loadAddressesOnMap() {
        try {
            const addresses = this.dataState.getState('addresses') || [];
            
            // Очищаем предыдущие маркеры
            this.mapLayers.addresses.clearLayers();
            if (this.addressesCluster) {
                this.addressesCluster.clearMarkers();
            }
            
            if (addresses.length === 0) {
                await Helpers.debugLog('📍 Нет адресов для отображения на карте');
                return;
            }
            
            const markers = [];
            
            addresses.forEach(address => {
                if (address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                    const marker = this.createAddressMarker(address);
                    markers.push(marker);
                }
            });
            
            // Если адресов много, используем кластеризацию
            if (addresses.length > 20) {
                // Создаем кластер если его еще нет
                if (!this.addressesCluster) {
                    this.addressesCluster = new MarkerCluster(this.map, {
                        maxClusterRadius: 80,
                        disableClusteringAtZoom: 16,
                        zoomToBoundsOnClick: true,
                        spiderfyOnMaxZoom: true,
                        animate: true
                    });
                }
                this.addressesCluster.addMarkers(markers);
                await Helpers.debugLog(`📍 Загружено ${addresses.length} адресов на карту с кластеризацией`);
            } else {
                // Для небольшого количества адресов добавляем прямо на карту
                markers.forEach(marker => {
                    this.mapLayers.addresses.addLayer(marker);
                });
                await Helpers.debugLog(`📍 Загружено ${addresses.length} адресов на карту`);
            }
            
        } catch (error) {
            console.error('Error loading addresses on map:', error);
        }
    }
    
    /**
     * Загрузка объектов на карту
     */
    async loadObjectsOnMap() {
        try {
            const objects = this.dataState.getState('realEstateObjects') || [];
            
            // Очищаем предыдущие маркеры
            this.mapLayers.objects.clearLayers();
            
            objects.forEach(object => {
                if (object.address?.coordinates?.lat && object.address?.coordinates?.lng) {
                    const marker = this.createObjectMarker(object);
                    this.mapLayers.objects.addLayer(marker);
                }
            });
            
            await Helpers.debugLog(`🏢 Загружено ${objects.length} объектов на карту`);
            
        } catch (error) {
            console.error('Error loading objects on map:', error);
        }
    }
    
    /**
     * Загрузка объявлений на карту
     */
    async loadListingsOnMap() {
        try {
            const listings = this.dataState.getState('listings') || [];
            
            // Очищаем предыдущие маркеры
            this.mapLayers.listings.clearLayers();
            if (this.listingsCluster) {
                this.listingsCluster.clearMarkers();
            }
            
            if (listings.length === 0) {
                await Helpers.debugLog('📋 Нет объявлений для отображения на карте');
                return;
            }
            
            const markers = [];
            
            listings.forEach(listing => {
                if (listing.coordinates && listing.coordinates.lat && listing.coordinates.lng) {
                    const marker = this.createListingMarker(listing);
                    markers.push(marker);
                }
            });
            
            // Если объявлений много, используем кластеризацию
            if (listings.length > 20) {
                // Создаем кластер если его еще нет
                if (!this.listingsCluster) {
                    this.listingsCluster = new MarkerCluster(this.map, {
                        maxClusterRadius: 60,
                        disableClusteringAtZoom: 16,
                        zoomToBoundsOnClick: true,
                        spiderfyOnMaxZoom: true,
                        animate: true
                    });
                }
                this.listingsCluster.addMarkers(markers);
                // Скрываем кластер объявлений по умолчанию
                if (!this.map.hasLayer(this.mapLayers.listings)) {
                    this.map.removeLayer(this.listingsCluster.markerLayer);
                    this.map.removeLayer(this.listingsCluster.clusterLayer);
                }
                await Helpers.debugLog(`📋 Загружено ${listings.length} объявлений на карту с кластеризацией`);
            } else {
                // Для небольшого количества объявлений добавляем прямо на карту
                markers.forEach(marker => {
                    this.mapLayers.listings.addLayer(marker);
                });
                await Helpers.debugLog(`📋 Загружено ${listings.length} объявлений на карту`);
            }
            
        } catch (error) {
            console.error('Error loading listings on map:', error);
        }
    }
    
    /**
     * Создание маркера адреса
     */
    createAddressMarker(address) {
        const color = this.getAddressColor(address);
        
        const marker = L.marker([address.coordinates.lat, address.coordinates.lng], {
            icon: L.divIcon({
                className: 'address-marker',
                html: `<div style="background: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        });
        
        marker.bindPopup(this.createAddressPopup(address));
        
        return marker;
    }
    
    /**
     * Создание маркера объекта
     */
    createObjectMarker(object) {
        const marker = L.marker([object.address.coordinates.lat, object.address.coordinates.lng], {
            icon: L.divIcon({
                className: 'object-marker',
                html: '<div style="background: #10b981; width: 14px; height: 14px; border-radius: 3px; border: 2px solid white;"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            })
        });
        
        marker.bindPopup(this.createObjectPopup(object));
        
        return marker;
    }
    
    /**
     * Создание маркера объявления
     */
    createListingMarker(listing) {
        const color = this.getListingColor(listing);
        
        const marker = L.marker([listing.coordinates.lat, listing.coordinates.lng], {
            icon: L.divIcon({
                className: 'listing-marker',
                html: `<div style="background: ${color}; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            })
        });
        
        marker.bindPopup(this.createListingPopup(listing));
        
        return marker;
    }
    
    /**
     * Получение цвета для адреса
     */
    getAddressColor(address) {
        switch (this.mapState.activeFilter) {
            case 'year':
                return this.getYearColor(address.build_year);
            case 'series':
                return this.getSeriesColor(address.house_series_id);
            case 'floors':
                return this.getFloorsColor(address.floors_count);
            default:
                return CONSTANTS.DATA_SOURCE_COLORS[address.source] || '#6B7280';
        }
    }
    
    /**
     * Получение цвета для объявления
     */
    getListingColor(listing) {
        return CONSTANTS.DATA_SOURCE_COLORS[listing.source] || '#6B7280';
    }
    
    /**
     * Получение цвета по году постройки
     */
    getYearColor(year) {
        if (!year) return '#6B7280';
        
        if (year < 1950) return '#DC2626';
        if (year < 1970) return '#F59E0B';
        if (year < 1990) return '#10B981';
        if (year < 2010) return '#3B82F6';
        return '#8B5CF6';
    }
    
    /**
     * Получение цвета по серии дома
     */
    getSeriesColor(seriesId) {
        // Можно получить из справочника house_series
        return Helpers.generateRandomColor();
    }
    
    /**
     * Получение цвета по этажности
     */
    getFloorsColor(floors) {
        if (!floors) return '#6B7280';
        
        if (floors <= 2) return '#10B981';
        if (floors <= 5) return '#3B82F6';
        if (floors <= 10) return '#F59E0B';
        return '#DC2626';
    }
    
    /**
     * Создание popup для адреса
     */
    createAddressPopup(address) {
        return `
            <div class="max-w-xs">
                <div class="font-medium text-gray-900 mb-2">📍 ${address.address}</div>
                <div class="text-sm text-gray-600 space-y-1">
                    <div>Тип: ${CONSTANTS.PROPERTY_TYPE_NAMES[address.type] || address.type}</div>
                    ${address.floors_count ? `<div>Этажей: ${address.floors_count}</div>` : ''}
                    ${address.build_year ? `<div>Год: ${address.build_year}</div>` : ''}
                    <div>Источник: ${CONSTANTS.DATA_SOURCE_NAMES[address.source] || address.source}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Создание popup для объекта
     */
    createObjectPopup(object) {
        return `
            <div class="max-w-xs">
                <div class="font-medium text-gray-900 mb-2">🏠 ${object.name || object.address?.address || 'Объект'}</div>
                <div class="text-sm text-gray-600 space-y-1">
                    <div>Тип: ${object.property_type || 'Не указан'}</div>
                    <div>Объявлений: ${object.listings_count || 0}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Создание popup для объявления
     */
    createListingPopup(listing) {
        return `
            <div class="max-w-xs">
                <div class="font-medium text-gray-900 mb-2">📋 ${Helpers.truncateText(listing.title, 50)}</div>
                <div class="text-sm text-gray-600 space-y-1">
                    ${listing.price ? `<div>Цена: ${Helpers.formatPrice(listing.price)}</div>` : ''}
                    ${listing.area ? `<div>Площадь: ${listing.area} м²</div>` : ''}
                    ${listing.floor ? `<div>Этаж: ${listing.floor}</div>` : ''}
                    <div>Источник: ${CONSTANTS.DATA_SOURCE_NAMES[listing.source] || listing.source}</div>
                </div>
                <div class="mt-2">
                    <a href="${listing.url}" target="_blank" class="text-blue-600 hover:text-blue-800 text-xs">
                        Открыть объявление →
                    </a>
                </div>
            </div>
        `;
    }
    
    /**
     * Переключение фильтра карты
     */
    toggleMapFilter(filterType) {
        // Сбрасываем все кнопки фильтров
        const filterButtons = [
            'filterByYear',
            'filterBySeries',
            'filterByFloors',
            'filterByObjects',
            'filterByListings'
        ];
        
        filterButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                // Возвращаем к обычному состоянию (белый фон)
                button.className = 'inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500';
            }
        });
        
        // Если тот же фильтр - отключаем
        if (this.mapState.activeFilter === filterType) {
            this.mapState.activeFilter = null;
            this.dataState.setState('activeMapFilter', null);
            await Helpers.debugLog('🔄 Фильтр отключен');
            return;
        }
        
        // Активируем новый фильтр
        this.mapState.activeFilter = filterType;
        this.dataState.setState('activeMapFilter', filterType);
        
        const activeButton = document.getElementById(`filterBy${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`);
        
        if (activeButton) {
            // Устанавливаем активное состояние (sky цвет)
            activeButton.className = 'inline-flex items-center px-3 py-2 border border-sky-300 shadow-sm text-sm leading-4 font-medium rounded-md text-sky-700 bg-sky-100 hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500';
        }
        
        // Уведомляем о смене фильтра
        this.eventBus.emit(CONSTANTS.EVENTS.MAP_FILTER_CHANGED, {
            filterType,
            timestamp: new Date()
        });
        
        // Перезагружаем адреса с новым фильтром
        this.loadAddressesOnMap();
        
        await Helpers.debugLog(`🎯 Активирован фильтр: ${filterType}`);
    }
    
    /**
     * Установка фильтра по умолчанию
     */
    setDefaultMapFilter() {
        // Устанавливаем активный фильтр
        this.mapState.activeFilter = 'year';
        this.dataState.setState('activeMapFilter', 'year');
        
        // Активируем кнопку "Год"
        const yearButton = document.getElementById('filterByYear');
        if (yearButton) {
            yearButton.className = 'inline-flex items-center px-3 py-2 border border-sky-300 shadow-sm text-sm leading-4 font-medium rounded-md text-sky-700 bg-sky-100 hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500';
        }
        
        Helpers.debugLog('🎯 Фильтр "Год" активирован по умолчанию');
        
        // Загружаем данные на карту
        this.loadMapData();
    }
    
    /**
     * Обновление данных карты
     */
    async refreshMapData() {
        try {
            await this.loadMapData();
            this.progressManager.showSuccess('Карта обновлена');
        } catch (error) {
            console.error('Error refreshing map data:', error);
            this.progressManager.showError('Ошибка обновления карты');
        }
    }
    
    /**
     * Проверка наличия полигона в области
     */
    hasAreaPolygon(area) {
        return area && 
               area.polygon && 
               Array.isArray(area.polygon) && 
               area.polygon.length >= 3;
    }
    
    /**
     * Центрирование карты на области
     */
    centerOnArea() {
        const currentArea = this.dataState.getState('currentArea');
        if (currentArea && this.hasAreaPolygon(currentArea) && this.areaPolygonLayer) {
            this.map.fitBounds(this.areaPolygonLayer.getBounds());
        }
    }
    
    /**
     * Получение границ карты
     */
    getMapBounds() {
        if (!this.map) return null;
        return this.map.getBounds();
    }
    
    /**
     * Получение центра карты
     */
    getMapCenter() {
        if (!this.map) return null;
        return this.map.getCenter();
    }
    
    /**
     * Получение масштаба карты
     */
    getMapZoom() {
        if (!this.map) return null;
        return this.map.getZoom();
    }
    
    /**
     * Получение состояния карты
     */
    getMapState() {
        return {
            ...this.mapState,
            bounds: this.getMapBounds(),
            center: this.getMapCenter(),
            zoom: this.getMapZoom()
        };
    }
    
    /**
     * Уничтожение менеджера карты
     */
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        
        if (this.eventBus) {
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.ADDRESSES_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.LISTINGS_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.MAP_FILTER_CHANGED);
        }
        
        // Очистка обработчиков
        document.getElementById('refreshMapBtn')?.removeEventListener('click', this.refreshMapData);
        
        this.mapState.initialized = false;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapManager;
} else {
    window.MapManager = MapManager;
}