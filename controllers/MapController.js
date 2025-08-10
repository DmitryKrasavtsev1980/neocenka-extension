/**
 * MapController - главный контроллер управления картой
 * Координирует работу MapRenderer и MarkerManager
 * Заменяет монолитный MapManager соблюдением принципа единственной ответственности
 */

class MapController {
    constructor(dependencies) {
        // Внедрённые зависимости
        this.configService = dependencies.configService;
        this.errorHandler = dependencies.errorHandler;
        this.dataState = dependencies.dataState;
        
        // Компоненты карты
        this.mapRenderer = dependencies.mapRenderer;
        this.markerManager = dependencies.markerManager;
        
        // Состояние контроллера
        this.state = {
            initialized: false,
            currentMapId: null,
            activeInteraction: null, // 'drawing', 'measuring', 'selecting'
            drawingMode: false,
            selectedObjects: new Set()
        };
        
        // Инструменты для работы с картой
        this.drawingTools = null;
        this.measurementTools = null;
        
        // Слои для различных данных
        this.dataLayers = new Map();
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Контекст взаимодействия с картой
        this.interactionContext = {
            polygon: null,
            currentDrawing: null,
            measurements: []
        };
        
        this.initialize();
    }

    /**
     * Инициализация контроллера карты
     */
    async initialize() {
        try {
            // Настраиваем связи между компонентами карты
            this.setupMapComponentBindings();
            
            // Подписываемся на изменения данных
            this.setupDataSubscriptions();
            
            // Настраиваем обработчики взаимодействия с картой
            this.setupMapInteractionHandlers();
            
            this.state.initialized = true;
            this.emit('controller:initialized');
            
        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'MapController',
                method: 'initialize'
            });
        }
    }

    /**
     * Настройка связей между компонентами карты
     */
    setupMapComponentBindings() {
        // Связываем события MapRenderer
        this.mapRenderer.addEventListener('map:created', (data) => {
            this.onMapCreated(data.map);
        });

        this.mapRenderer.addEventListener('map:click', (data) => {
            this.handleMapClick(data);
        });

        this.mapRenderer.addEventListener('map:move', (data) => {
            this.handleMapMove(data);
        });

        this.mapRenderer.addEventListener('map:zoom', (data) => {
            this.handleMapZoom(data);
        });

        // Связываем события MarkerManager
        this.markerManager.addEventListener('marker:click', (data) => {
            this.handleMarkerClick(data);
        });

        this.markerManager.addEventListener('marker:hover', (data) => {
            this.handleMarkerHover(data);
        });

        this.markerManager.addEventListener('markers:filtered', (data) => {
            this.emit('map:markers-filtered', data);
        });
    }

    /**
     * Настройка подписок на изменения данных
     */
    setupDataSubscriptions() {
        // Подписываемся на изменения адресов
        this.dataState.subscribe('addresses', (newAddresses) => {
            this.updateAddressMarkers(newAddresses);
        });

        // Подписываемся на изменения объявлений
        this.dataState.subscribe('listings', (newListings) => {
            this.updateListingMarkers(newListings);
        });

        // Подписываемся на изменения областей карты
        this.dataState.subscribe('mapAreas', (newAreas) => {
            this.updateAreaPolygons(newAreas);
        });

        // Подписываемся на изменения сегментов
        this.dataState.subscribe('segments', (newSegments) => {
            this.updateSegmentVisualization(newSegments);
        });
    }

    /**
     * Настройка обработчиков взаимодействия с картой
     */
    setupMapInteractionHandlers() {
        // Глобальные обработчики для элементов управления картой
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-map-action="toggle-markers"]')) {
                e.preventDefault();
                this.toggleMarkerVisibility(e.target.dataset.markerType);
            }
            
            if (e.target.matches('[data-map-action="fit-bounds"]')) {
                e.preventDefault();
                this.fitToVisibleData();
            }
            
            if (e.target.matches('[data-map-action="toggle-drawing"]')) {
                e.preventDefault();
                this.toggleDrawingMode();
            }
        });

        // Обработчики клавиатурных сокращений
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'f':
                        e.preventDefault();
                        this.fitToVisibleData();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.toggleDrawingMode();
                        break;
                }
            }
        });
    }

    /**
     * Создание карты в указанном контейнере
     * @param {string|HTMLElement} container - контейнер карты
     * @param {object} options - опции создания
     * @returns {Promise<void>}
     */
    async createMap(container, options = {}) {
        try {
            // Создаём карту через MapRenderer
            const map = await this.mapRenderer.createMap(container, options);
            this.state.currentMapId = container;
            
            // Инициализируем MarkerManager после создания карты
            await this.markerManager.initialize();
            
            // Настраиваем инструменты рисования если доступны
            this.setupDrawingTools();
            
            // Загружаем данные на карту
            await this.loadInitialData();
            
            this.emit('map:ready', { map, containerId: this.state.currentMapId });
            
        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'MapController',
                method: 'createMap',
                container
            });
        }
    }

    /**
     * Обработка создания карты
     */
    onMapCreated(map) {
        // Настраиваем дополнительные слои
        this.setupDataLayers();
        
        // Применяем настройки из конфигурации
        this.applyMapConfiguration();
    }

    /**
     * Настройка слоёв данных
     */
    setupDataLayers() {
        // Создаём слои для различных типов данных
        const layerConfigs = [
            { id: 'addresses', name: 'Адреса', visible: true },
            { id: 'listings', name: 'Объявления', visible: true },
            { id: 'areas', name: 'Области', visible: true },
            { id: 'segments', name: 'Сегменты', visible: false },
            { id: 'heatmap', name: 'Тепловая карта', visible: false }
        ];

        layerConfigs.forEach(config => {
            const layer = L.layerGroup();
            this.mapRenderer.addLayer(config.id, layer);
            this.dataLayers.set(config.id, {
                layer,
                config,
                visible: config.visible
            });
            
            if (!config.visible) {
                this.mapRenderer.toggleLayer(config.id, false);
            }
        });
    }

    /**
     * Применение конфигурации карты
     */
    applyMapConfiguration() {
        const mapConfig = this.configService.get('ui.map') || {};
        
        // Применяем настройки кластеризации
        if (mapConfig.clustering) {
            this.markerManager.toggleClustering(mapConfig.clustering.enabled);
        }
        
        // Применяем настройки отображения
        if (mapConfig.display) {
            this.updateDisplaySettings(mapConfig.display);
        }
    }

    /**
     * Загрузка начальных данных на карту
     */
    async loadInitialData() {
        try {
            // Загружаем адреса
            const addresses = this.dataState.getState('addresses') || [];
            if (addresses.length > 0) {
                this.updateAddressMarkers(addresses);
            }

            // Загружаем области
            const mapAreas = this.dataState.getState('mapAreas') || [];
            if (mapAreas.length > 0) {
                this.updateAreaPolygons(mapAreas);
            }

            // Подгоняем карту под данные
            if (addresses.length > 0 || mapAreas.length > 0) {
                setTimeout(() => this.fitToVisibleData(), 500);
            }

        } catch (error) {
            console.warn('Ошибка загрузки начальных данных на карту:', error);
        }
    }

    /**
     * Настройка инструментов рисования
     */
    setupDrawingTools() {
        // Проверяем доступность Leaflet.draw
        if (typeof L.Draw !== 'undefined') {
            this.drawingTools = new L.Control.Draw({
                position: 'topright',
                draw: {
                    polygon: {
                        allowIntersection: false,
                        drawError: {
                            color: '#e1e100',
                            message: 'Полигон не должен пересекать сам себя'
                        }
                    },
                    rectangle: true,
                    circle: false,
                    marker: true,
                    circlemarker: false,
                    polyline: false
                },
                edit: {
                    featureGroup: this.getEditableLayer(),
                    remove: true
                }
            });

            this.mapRenderer.map.addControl(this.drawingTools);
            this.setupDrawingEventHandlers();
        }
    }

    /**
     * Получение слоя для редактирования
     */
    getEditableLayer() {
        if (!this.editableLayer) {
            this.editableLayer = new L.FeatureGroup();
            this.mapRenderer.addLayer('editable', this.editableLayer);
        }
        return this.editableLayer;
    }

    /**
     * Настройка обработчиков событий рисования
     */
    setupDrawingEventHandlers() {
        const map = this.mapRenderer.map;

        map.on('draw:created', (e) => {
            this.handleDrawingCreated(e);
        });

        map.on('draw:edited', (e) => {
            this.handleDrawingEdited(e);
        });

        map.on('draw:deleted', (e) => {
            this.handleDrawingDeleted(e);
        });

        map.on('draw:drawstart', () => {
            this.state.drawingMode = true;
            this.emit('drawing:started');
        });

        map.on('draw:drawstop', () => {
            this.state.drawingMode = false;
            this.emit('drawing:stopped');
        });
    }

    /**
     * Обработка создания нового элемента рисования
     */
    handleDrawingCreated(e) {
        const layer = e.layer;
        const type = e.layerType;

        this.getEditableLayer().addLayer(layer);

        // Добавляем данные к слою
        layer._neocenkaData = {
            id: `drawn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: type,
            created: new Date(),
            geometry: this.extractGeometry(layer)
        };

        this.emit('drawing:created', {
            layer,
            type,
            geometry: layer._neocenkaData.geometry
        });
    }

    /**
     * Извлечение геометрии из слоя
     */
    extractGeometry(layer) {
        if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
            return {
                type: 'polygon',
                coordinates: layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng])
            };
        } else if (layer instanceof L.Marker) {
            const latlng = layer.getLatLng();
            return {
                type: 'point',
                coordinates: [latlng.lat, latlng.lng]
            };
        }
        return null;
    }

    /**
     * Обновление маркеров адресов
     */
    updateAddressMarkers(addresses) {
        // Очищаем предыдущие маркеры адресов
        this.markerManager.hideGroup('addresses');

        // Создаём новые маркеры
        const markers = this.markerManager.createMarkersFromData(
            addresses,
            (address, index) => ({
                id: `address_${address.id}`,
                position: address.coordinates,
                iconType: 'address',
                group: 'addresses',
                data: address,
                popup: {
                    content: this.createAddressPopupContent(address)
                },
                tooltip: {
                    content: address.address,
                    options: { permanent: false }
                }
            })
        );

        // Показываем маркеры на соответствующем слое
        this.markerManager.showGroup('addresses', 'addresses');

        this.emit('addresses:updated', { count: addresses.length });
    }

    /**
     * Создание содержимого popup для адреса
     */
    createAddressPopupContent(address) {
        return `
            <div class="address-popup">
                <h4>${address.address}</h4>
                ${address.house_series_id ? `<p><strong>Серия:</strong> ${address.house_series_id}</p>` : ''}
                ${address.build_year ? `<p><strong>Год постройки:</strong> ${address.build_year}</p>` : ''}
                ${address.floors_count ? `<p><strong>Этажей:</strong> ${address.floors_count}</p>` : ''}
                <div class="popup-actions">
                    <button onclick="window.mapController.viewAddressDetails('${address.id}')" class="btn btn-sm btn-primary">
                        Подробности
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Обновление маркеров объявлений
     */
    updateListingMarkers(listings) {
        // Фильтруем объявления с координатами
        const listingsWithCoords = listings.filter(listing => 
            listing.address_id && this.getAddressCoordinates(listing.address_id)
        );

        this.markerManager.hideGroup('listings');

        const markers = this.markerManager.createMarkersFromData(
            listingsWithCoords,
            (listing, index) => {
                const coords = this.getAddressCoordinates(listing.address_id);
                return {
                    id: `listing_${listing.id}`,
                    position: coords,
                    iconType: 'listing',
                    group: 'listings',
                    data: listing,
                    popup: {
                        content: this.createListingPopupContent(listing)
                    }
                };
            }
        );

        this.markerManager.showGroup('listings', 'listings');

        this.emit('listings:updated', { count: listingsWithCoords.length });
    }

    /**
     * Получение координат адреса по ID
     */
    getAddressCoordinates(addressId) {
        const addresses = this.dataState.getState('addresses') || [];
        const address = addresses.find(a => a.id === addressId);
        return address ? address.coordinates : null;
    }

    /**
     * Создание содержимого popup для объявления
     */
    createListingPopupContent(listing) {
        return `
            <div class="listing-popup">
                <h4>${listing.title || 'Объявление'}</h4>
                <p><strong>Цена:</strong> ${this.formatPrice(listing.price)}</p>
                ${listing.area ? `<p><strong>Площадь:</strong> ${listing.area} м²</p>` : ''}
                ${listing.source ? `<p><strong>Источник:</strong> ${listing.source}</p>` : ''}
                <div class="popup-actions">
                    <button onclick="window.mapController.viewListingDetails('${listing.id}')" class="btn btn-sm btn-primary">
                        Подробности
                    </button>
                    ${listing.url ? `<a href="${listing.url}" target="_blank" class="btn btn-sm btn-outline-primary">Открыть</a>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Обновление полигонов областей
     */
    updateAreaPolygons(mapAreas) {
        // Очищаем предыдущие полигоны
        const areasLayer = this.dataLayers.get('areas')?.layer;
        if (areasLayer) {
            areasLayer.clearLayers();
        }

        // Создаём полигоны для областей
        mapAreas.forEach(area => {
            if (area.polygon_coordinates && area.polygon_coordinates.length > 0) {
                const polygon = L.polygon(area.polygon_coordinates, {
                    color: area.color || '#3388ff',
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.1
                });

                polygon.bindPopup(`
                    <h4>${area.name}</h4>
                    <p>${area.description || 'Область на карте'}</p>
                    <button onclick="window.mapController.selectArea('${area.id}')" class="btn btn-sm btn-primary">
                        Выбрать область
                    </button>
                `);

                polygon._neocenkaData = {
                    id: area.id,
                    type: 'area',
                    data: area
                };

                areasLayer?.addLayer(polygon);
            }
        });

        this.emit('areas:updated', { count: mapAreas.length });
    }

    /**
     * Переключение видимости маркеров
     */
    toggleMarkerVisibility(markerType) {
        const layerData = this.dataLayers.get(markerType);
        if (layerData) {
            layerData.visible = !layerData.visible;
            this.mapRenderer.toggleLayer(markerType, layerData.visible);
            
            this.emit('layer:toggled', {
                layerId: markerType,
                visible: layerData.visible
            });
        }
    }

    /**
     * Подгонка карты под видимые данные
     */
    fitToVisibleData() {
        try {
            const bounds = this.calculateDataBounds();
            if (bounds && bounds.isValid()) {
                this.mapRenderer.fitBounds(bounds, {
                    padding: [20, 20],
                    maxZoom: 16
                });
            } else {
                // Fallback к центру Новосибирска
                this.mapRenderer.setView([55.0084, 82.9357], 13);
            }
        } catch (error) {
            console.warn('Ошибка подгонки карты под данные:', error);
        }
    }

    /**
     * Вычисление границ для всех видимых данных
     */
    calculateDataBounds() {
        const allCoordinates = [];

        // Собираем координаты адресов
        const addresses = this.dataState.getState('addresses') || [];
        addresses.forEach(address => {
            if (address.coordinates) {
                allCoordinates.push(address.coordinates);
            }
        });

        // Собираем координаты областей
        const mapAreas = this.dataState.getState('mapAreas') || [];
        mapAreas.forEach(area => {
            if (area.polygon_coordinates) {
                area.polygon_coordinates.forEach(coord => {
                    allCoordinates.push(coord);
                });
            }
        });

        if (allCoordinates.length === 0) {
            return null;
        }

        return L.latLngBounds(allCoordinates);
    }

    /**
     * Переключение режима рисования
     */
    toggleDrawingMode() {
        this.state.drawingMode = !this.state.drawingMode;
        
        if (this.state.drawingMode) {
            this.state.activeInteraction = 'drawing';
        } else {
            this.state.activeInteraction = null;
        }

        this.emit('drawing:mode-changed', {
            enabled: this.state.drawingMode
        });
    }

    /**
     * Обработчики событий карты
     */
    handleMapClick(data) {
        this.emit('map:clicked', data);
        
        // Если в режиме выбора, обрабатываем выбор
        if (this.state.activeInteraction === 'selecting') {
            this.handleLocationSelect(data.latlng);
        }
    }

    handleMapMove(data) {
        this.emit('map:moved', data);
        
        // Обновляем URL с координатами (если настроено)
        this.updateURLWithMapState();
    }

    handleMapZoom(data) {
        this.emit('map:zoomed', data);
        
        // Управляем детализацией отображения в зависимости от зума
        this.adjustDetailLevel(data.zoom);
    }

    handleMarkerClick(data) {
        const markerData = data.marker._neocenkaData;
        
        if (markerData) {
            this.emit('marker:selected', {
                id: markerData.id,
                type: markerData.type,
                data: markerData.data
            });
            
            // Выделяем маркер
            this.selectMarker(data.markerId);
        }
    }

    handleMarkerHover(data) {
        // Можно добавить эффекты при наведении
        this.emit('marker:hovered', data);
    }

    /**
     * Выбор маркера
     */
    selectMarker(markerId) {
        // Сбрасываем предыдущий выбор
        this.clearSelection();
        
        // Выделяем новый маркер
        this.state.selectedObjects.add(markerId);
        this.markerManager.updateMarkerIcon(markerId, 'selected');
        
        this.emit('selection:changed', {
            selectedIds: Array.from(this.state.selectedObjects)
        });
    }

    /**
     * Очистка выделения
     */
    clearSelection() {
        this.state.selectedObjects.forEach(markerId => {
            const marker = this.markerManager.getMarker(markerId);
            if (marker && marker._neocenkaData) {
                // Восстанавливаем оригинальную иконку
                const originalType = marker._neocenkaData.type;
                this.markerManager.updateMarkerIcon(markerId, originalType);
            }
        });
        
        this.state.selectedObjects.clear();
        this.emit('selection:cleared');
    }

    /**
     * Форматирование цены
     */
    formatPrice(price) {
        if (!price) return 'Не указана';
        
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(price);
    }

    /**
     * Управление детализацией в зависимости от зума
     */
    adjustDetailLevel(zoom) {
        // При большом приближении показываем больше деталей
        const showDetails = zoom >= 15;
        
        this.dataLayers.forEach((layerData, layerId) => {
            if (layerId === 'detailed' && layerData.visible !== showDetails) {
                this.toggleMarkerVisibility('detailed');
            }
        });
    }

    /**
     * Обновление URL с состоянием карты (если настроено)
     */
    updateURLWithMapState() {
        if (this.configService.get('ui.map.saveStateInURL')) {
            const center = this.mapRenderer.getCenter();
            const zoom = this.mapRenderer.getZoom();
            
            if (center && zoom) {
                const url = new URL(window.location);
                url.searchParams.set('lat', center.lat.toFixed(6));
                url.searchParams.set('lng', center.lng.toFixed(6));
                url.searchParams.set('z', zoom.toString());
                
                window.history.replaceState(null, '', url);
            }
        }
    }

    /**
     * Публичные методы для внешнего взаимодействия
     */
    
    // Просмотр деталей адреса
    viewAddressDetails(addressId) {
        this.emit('address:view-details', { addressId });
    }
    
    // Просмотр деталей объявления
    viewListingDetails(listingId) {
        this.emit('listing:view-details', { listingId });
    }
    
    // Выбор области
    selectArea(areaId) {
        this.dataState.setState('currentAreaId', areaId);
        this.emit('area:selected', { areaId });
    }

    /**
     * Получение состояния контроллера
     */
    getState() {
        return {
            ...this.state,
            mapReady: this.mapRenderer.isInitialized(),
            markersCount: this.markerManager.getStats(),
            layersStatus: this.getLayersStatus(),
            visibleBounds: this.mapRenderer.getBounds()
        };
    }

    /**
     * Получение статуса слоёв
     */
    getLayersStatus() {
        const status = {};
        this.dataLayers.forEach((layerData, layerId) => {
            status[layerId] = {
                visible: layerData.visible,
                config: layerData.config
            };
        });
        return status;
    }

    // === СИСТЕМА СОБЫТИЙ ===

    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(eventType, data = {}) {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Уничтожение контроллера
     */
    destroy() {
        // Очищаем обработчики событий
        this.eventHandlers.clear();
        
        // Уничтожаем компоненты
        if (this.mapRenderer && typeof this.mapRenderer.destroy === 'function') {
            this.mapRenderer.destroy();
        }
        
        if (this.markerManager && typeof this.markerManager.destroy === 'function') {
            this.markerManager.destroy();
        }
        
        // Очищаем слои
        this.dataLayers.clear();
        
        // Очищаем ссылки
        this.configService = null;
        this.errorHandler = null;
        this.dataState = null;
        this.mapRenderer = null;
        this.markerManager = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapController;
} else {
    window.MapController = MapController;
}