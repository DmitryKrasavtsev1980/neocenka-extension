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
            activeFilter: 'year', // по умолчанию показываем год постройки
            defaultCenter: CONSTANTS.MAP_CONFIG.DEFAULT_CENTER,
            defaultZoom: CONSTANTS.MAP_CONFIG.DEFAULT_ZOOM
        };
        
        // Активный фильтр для отображения информации на маркерах (синхронизируем с mapState)
        this.activeMapFilter = this.mapState.activeFilter;
        
        // События фильтров привязываются в bindEvents()
        
        // Устанавливаем начальное состояние кнопок фильтров и DataState
        setTimeout(() => {
            this.dataState.setState('activeMapFilter', this.activeMapFilter);
            this.updateFilterButtons(this.activeMapFilter);
        }, 100);
        
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
            
            // Удален обработчик ADDRESS_DELETED - теперь перезагрузка происходит прямо в deleteAddress()
            
            this.eventBus.on(CONSTANTS.EVENTS.LISTINGS_LOADED, async (listings) => {
                await this.loadListingsOnMap();
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.MAP_FILTER_CHANGED, (data) => {
                const filterType = typeof data === 'string' ? data : data.filterType;
                this.toggleMapFilter(filterType);
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.PANEL_TOGGLED, (data) => {
                this.onPanelToggled(data);
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
                    this.setMapFilter(type);
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
        
        // Центрируем карту на области после загрузки
        this.centerOnArea();
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
            this.map.fitBounds(this.areaPolygonLayer.getBounds(), CONSTANTS.MAP_CONFIG.FIT_BOUNDS_OPTIONS);
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
            
            for (const address of addresses) {
                if (address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                    const marker = await this.createAddressMarker(address);
                    markers.push(marker);
                }
            }
            
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
    async createAddressMarker(address) {
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
                console.warn('MapManager: Не удалось получить материал стен для адреса:', address.id);
            }
        }
        
        // Определяем текст на маркере в зависимости от активного фильтра
        let labelText = '';
        switch (this.activeMapFilter) {
            case 'year':
                labelText = address.build_year || '';
                break;
            case 'series':
                if (address.house_series_id) {
                    try {
                        const houseSeries = await window.db.get('house_series', address.house_series_id);
                        labelText = houseSeries ? houseSeries.name : '';
                    } catch (error) {
                        console.warn('MapManager: Не удалось получить серию дома:', address.house_series_id);
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
                    console.warn('MapManager: Не удалось получить объекты для адреса:', address.id);
                }
                break;
            default:
                labelText = address.build_year || '';
        }
        
        const marker = L.marker([address.coordinates.lat, address.coordinates.lng], {
            icon: L.divIcon({
                className: 'address-marker',
                html: `
                    <div class="leaflet-marker-icon-wrapper" style="position: relative;">
                        <div style="
                            width: 0; 
                            height: 0; 
                            border-left: 7.5px solid transparent; 
                            border-right: 7.5px solid transparent; 
                            border-top: ${markerHeight}px solid ${markerColor};
                            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
                        "></div>
                        ${labelText ? `<span class="leaflet-marker-iconlabel" style="
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
                        ">${labelText}</span>` : ''}
                    </div>
                `,
                iconSize: [15, markerHeight],
                iconAnchor: [7.5, markerHeight]
            })
        });
        
        // Сохраняем данные адреса в маркере для оптимизации
        marker.addressData = address;
        
        // Создаем popup асинхронно
        this.createAddressPopup(address).then(popupContent => {
            marker.bindPopup(popupContent, {
                maxWidth: 280,
                className: 'address-popup-container'
            });
            
            // Добавляем обработчики событий для кнопок в popup
            marker.on('popupopen', () => {
                this.bindPopupEvents(address);
            });
        });
        
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
    async createAddressPopup(address) {
        // Получаем дополнительную информацию о материале стен
        let wallMaterialText = 'Не указан';
        if (address.wall_material_id) {
            try {
                const wallMaterial = await window.db.get('wall_materials', address.wall_material_id);
                if (wallMaterial) {
                    wallMaterialText = wallMaterial.name;
                }
            } catch (error) {
                console.warn('MapManager: Не удалось получить материал стен:', error);
            }
        }
        
        const typeText = CONSTANTS.PROPERTY_TYPE_NAMES[address.type] || address.type || 'Не указан';
        const sourceText = CONSTANTS.DATA_SOURCE_NAMES[address.source] || address.source || 'Не указан';
        
        return `
            <div class="address-popup max-w-xs">
                <div class="header mb-3">
                    <div class="font-bold text-gray-900 text-lg">📍 Адрес</div>
                    <div class="address-title font-medium text-gray-800">${address.address || 'Не указан'}</div>
                </div>
                
                <div class="meta text-sm text-gray-600 space-y-1 mb-3">
                    <div>Тип: <strong>${typeText}</strong></div>
                    <div>Источник: ${sourceText}</div>
                    ${address.floors_count ? `<div>Этажей: ${address.floors_count}</div>` : ''}
                    ${address.build_year ? `<div>Год постройки: ${address.build_year}</div>` : ''}
                    <div>Материал: <strong>${wallMaterialText}</strong></div>
                </div>
                
                <div class="actions flex gap-2">
                    <button data-action="edit-address" data-address-id="${address.id}" 
                            class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                        ✏️ Редактировать
                    </button>
                    <button data-action="delete-address" data-address-id="${address.id}" 
                            class="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                        🗑️ Удалить
                    </button>
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
    async toggleMapFilter(filterType) {
        // Проверяем тип параметра
        if (typeof filterType !== 'string') {
            console.warn('MapManager: filterType должен быть строкой, получен:', typeof filterType, filterType);
            return;
        }
        
        // Если тот же фильтр - отключаем
        if (this.mapState.activeFilter === filterType) {
            this.mapState.activeFilter = null;
            this.activeMapFilter = null;
            this.dataState.setState('activeMapFilter', null);
            this.updateFilterButtons(null);
            await Helpers.debugLog('🔄 Фильтр отключен');
            return;
        }
        
        // Активируем новый фильтр
        this.mapState.activeFilter = filterType;
        this.activeMapFilter = filterType;
        this.dataState.setState('activeMapFilter', filterType);
        
        // Обновляем кнопки фильтров
        this.updateFilterButtons(filterType);
        
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
            
            // После обновления данных центрируем карту на области
            this.centerOnArea();
            
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
        if (currentArea && this.hasAreaPolygon(currentArea)) {
            // Получаем полигон области - сначала из MapManager, затем из area.js как fallback
            let areaPolygon = this.areaPolygonLayer;
            if (!areaPolygon && window.areaPage?.areaPolygonLayer) {
                areaPolygon = window.areaPage.areaPolygonLayer;
            }
            
            if (areaPolygon && this.map) {
                this.map.fitBounds(areaPolygon.getBounds(), CONSTANTS.MAP_CONFIG.FIT_BOUNDS_OPTIONS);
                Helpers.debugLog('🗺️ MapManager: Карта центрирована на области');
            } else {
                Helpers.debugLog('⚠️ MapManager: Не удалось центрировать карту - полигон или карта не найдены');
            }
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
     * Обработка переключения панели
     */
    onPanelToggled(data) {
        const { panelName, expanded } = data;
        
        // Обрабатываем только события панели карты
        if (panelName === 'map' && expanded && this.map) {
            // Небольшая задержка для завершения анимации CSS
            setTimeout(async () => {
                try {
                    // Обновляем размеры карты
                    this.map.invalidateSize();
                    
                    // Получаем полигон области - сначала из MapManager, затем из area.js как fallback
                    let areaPolygon = this.areaPolygonLayer;
                    if (!areaPolygon && window.areaPage?.areaPolygonLayer) {
                        areaPolygon = window.areaPage.areaPolygonLayer;
                    }
                    
                    // Если есть полигон области, подгоняем зум
                    if (areaPolygon) {
                        this.map.fitBounds(areaPolygon.getBounds(), CONSTANTS.MAP_CONFIG.FIT_BOUNDS_OPTIONS);
                        await Helpers.debugLog('🗺️ MapManager: Карта центрирована на полигоне области');
                    } else {
                        await Helpers.debugLog('⚠️ MapManager: Полигон области не найден для центрирования');
                    }
                    
                    await Helpers.debugLog('🗺️ MapManager: Карта обновлена после показа панели');
                } catch (error) {
                    console.error('❌ MapManager: Ошибка обновления карты:', error);
                }
            }, 100);
        }
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
            this.eventBus.offAll(CONSTANTS.EVENTS.PANEL_TOGGLED);
        }
        
        // Очистка обработчиков
        document.getElementById('refreshMapBtn')?.removeEventListener('click', this.refreshMapData);
        
        this.mapState.initialized = false;
    }
    
    /**
     * Установка фильтра карты
     */
    setMapFilter(filterType) {
        // Активируем фильтр - синхронизируем оба свойства
        this.activeMapFilter = filterType;
        this.mapState.activeFilter = filterType;
        this.dataState.setState('activeMapFilter', filterType);
        
        // Обновляем активную кнопку
        this.updateFilterButtons(filterType);
        
        // Перерисовываем маркеры с новой информацией
        this.refreshAddressMarkers();
        
        console.log(`🗺️ MapManager: Установлен фильтр карты: ${filterType}`);
    }
    
    /**
     * Обновление активной кнопки фильтра
     */
    updateFilterButtons(activeFilter) {
        // Маппинг фильтров к ID кнопок
        const filterToButtonId = {
            'year': 'filterByYear',
            'series': 'filterBySeries', 
            'floors': 'filterByFloors',
            'objects': 'filterByObjects',
            'listings': 'filterByListings'
        };
        
        // Базовые классы для кнопок
        const baseClasses = 'inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500';
        const inactiveClasses = 'text-gray-700 bg-white hover:bg-gray-50 border-gray-300';
        const activeClasses = 'text-sky-700 bg-sky-100 hover:bg-sky-200 border-sky-300';
        
        const allButtons = Object.values(filterToButtonId);
        const activeButtonId = activeFilter ? filterToButtonId[activeFilter] : null;
        
        allButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                if (buttonId === activeButtonId && activeFilter) {
                    // Активная кнопка - устанавливаем sky цвета
                    button.className = `${baseClasses} ${activeClasses}`;
                } else {
                    // Неактивная кнопка - возвращаем обычные цвета
                    button.className = `${baseClasses} ${inactiveClasses}`;
                }
            }
        });
        
        console.log(`🎯 MapManager: Подсвечена кнопка фильтра: ${activeButtonId} (${activeFilter})`);
    }
    
    /**
     * Обновление маркеров адресов с новой информацией (оптимизированное)
     */
    async refreshAddressMarkers() {
        try {
            // Для оптимизации производительности просто перезагружаем адреса
            // TODO: В будущем можно оптимизировать обновление существующих маркеров
            await this.loadAddressesOnMap();
            
            console.log(`🔄 MapManager: Маркеры адресов обновлены`);
            
        } catch (error) {
            console.error('MapManager: Ошибка обновления маркеров адресов:', error);
        }
    }
    
    
    /**
     * Удаление конкретного адреса с карты
     */
    async removeAddressFromMap(address) {
        try {
            let found = false;
            
            // Проверяем кластер адресов
            if (this.addressesCluster && this.addressesCluster.markerLayer) {
                this.addressesCluster.markerLayer.eachLayer((marker) => {
                    if (marker.addressData && marker.addressData.id === address.id) {
                        if (this.addressesCluster.removeMarker) {
                            this.addressesCluster.removeMarker(marker);
                        } else {
                            this.addressesCluster.markerLayer.removeLayer(marker);
                        }
                        found = true;
                        console.log('🗑️ Адрес удален из кластера:', address.id);
                    }
                });
            }
            
            // Проверяем обычные маркеры
            if (this.mapLayers.addresses) {
                this.mapLayers.addresses.eachLayer((marker) => {
                    if (marker.addressData && marker.addressData.id === address.id) {
                        this.mapLayers.addresses.removeLayer(marker);
                        found = true;
                        console.log('🗑️ Адрес удален из слоя:', address.id);
                    }
                });
            }
            
            if (!found) {
                console.warn('⚠️ Адрес не найден на карте для удаления, выполняем полную перезагрузку:', address.id);
                // Выполняем полную перезагрузку если адрес не найден
                await this.loadAddressesOnMap();
            } else {
                console.log('✅ Адрес успешно удален с карты:', address.id);
            }
            
        } catch (error) {
            console.warn('MapManager: Ошибка удаления адреса с карты, выполняем полную перезагрузку:', error);
            // При ошибке выполняем полную перезагрузку
            await this.loadAddressesOnMap();
        }
    }
    
    /**
     * Очистка всех маркеров адресов с карты
     */
    clearAddresses() {
        if (this.mapLayers.addresses) {
            this.mapLayers.addresses.clearLayers();
        }
        if (this.addressesCluster) {
            this.addressesCluster.clearMarkers();
        }
    }
    
    /**
     * Привязка событий для кнопок в popup
     */
    bindPopupEvents(address) {
        // Кнопка редактирования адреса
        const editBtn = document.querySelector(`[data-action="edit-address"][data-address-id="${address.id}"]`);
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Останавливаем всплытие чтобы AddressManager не обработал событие
                this.editAddress(address);
            });
        }
        
        // Кнопка удаления адреса
        const deleteBtn = document.querySelector(`[data-action="delete-address"][data-address-id="${address.id}"]`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Останавливаем всплытие чтобы AddressManager не обработал событие
                this.deleteAddress(address);
            });
        }
    }
    
    /**
     * Редактирование адреса
     */
    editAddress(address) {
        // Отправляем событие для открытия модального окна редактирования адреса
        this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_EDIT_REQUESTED, address);
        console.log('🖊️ MapManager: Запрошено редактирование адреса:', address.id);
    }
    
    /**
     * Удаление адреса
     */
    async deleteAddress(address) {
        if (confirm(`Удалить адрес "${address.address}"?`)) {
            try {
                await window.db.delete('addresses', address.id);
                
                console.log('🗑️ MapManager: Адрес удален из БД:', address.id);
                
                // Простое решение - полная перезагрузка карты и таблицы
                await this.loadAddressesOnMap();
                
                // Уведомляем AddressManager о необходимости обновить таблицу
                this.eventBus.emit(CONSTANTS.EVENTS.ADDRESS_DELETED, {
                    address,
                    timestamp: new Date()
                });
                
                console.log('✅ MapManager: Карта и таблица обновлены после удаления');
                
            } catch (error) {
                console.error('MapManager: Ошибка удаления адреса:', error);
            }
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapManager;
} else {
    window.MapManager = MapManager;
}