/**
 * MapRenderer - компонент отрисовки карты
 * Извлечён из MapManager для разделения ответственности за отрисовку
 */

class MapRenderer {
    constructor(configService, errorHandler) {
        this.configService = configService;
        this.errorHandler = errorHandler;
        
        // Экземпляр карты
        this.map = null;
        this.mapContainer = null;
        
        // Слои карты
        this.layers = new Map();
        this.activeLayers = new Set();
        
        // Конфигурация карты
        this.config = this.getMapConfig();
        
        // Состояние карты
        this.state = {
            initialized: false,
            loading: false,
            center: null,
            zoom: this.config.defaultZoom,
            bounds: null
        };
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Кэш тайлов для оптимизации
        this.tileCache = new Map();
        
        this.initialize();
    }

    /**
     * Получение конфигурации карты
     */
    getMapConfig() {
        const mapConfig = this.configService?.getUIConfig('map') || {};
        
        return {
            defaultZoom: mapConfig.defaultZoom || 13,
            minZoom: mapConfig.minZoom || 10,
            maxZoom: mapConfig.maxZoom || 18,
            center: mapConfig.centerNsk || [55.0084, 82.9357], // Новосибирск
            tileLayer: {
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            },
            controls: {
                zoom: true,
                attribution: true,
                scale: true,
                fullscreen: false
            },
            interaction: {
                doubleClickZoom: true,
                dragging: true,
                keyboard: true,
                scrollWheelZoom: true,
                touchZoom: true
            }
        };
    }

    /**
     * Инициализация компонента
     */
    async initialize() {
        try {
            // Проверяем доступность Leaflet
            if (typeof L === 'undefined') {
                throw new Error('Библиотека Leaflet не загружена');
            }

            // Настраиваем иконки по умолчанию
            this.setupDefaultIcons();

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'initialize'
            });
        }
    }

    /**
     * Настройка иконок по умолчанию
     */
    setupDefaultIcons() {
        // Исправляем путь к иконкам Leaflet
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: '/lib/leaflet/images/marker-icon-2x.png',
            iconUrl: '/lib/leaflet/images/marker-icon.png',
            shadowUrl: '/lib/leaflet/images/marker-shadow.png',
        });
    }

    /**
     * Создание карты в указанном контейнере
     * @param {string|HTMLElement} container - контейнер карты
     * @param {object} options - дополнительные опции
     * @returns {Promise<L.Map>}
     */
    async createMap(container, options = {}) {
        try {
            if (this.map) {
                this.destroyMap();
            }

            this.state.loading = true;

            // Определяем контейнер
            this.mapContainer = typeof container === 'string' 
                ? document.getElementById(container) 
                : container;

            if (!this.mapContainer) {
                throw new Error('Контейнер карты не найден');
            }

            // Очищаем контейнер
            this.mapContainer.innerHTML = '';

            // Объединяем конфигурацию с переданными опциями
            const mapOptions = {
                center: options.center || this.config.center,
                zoom: options.zoom || this.config.defaultZoom,
                minZoom: this.config.minZoom,
                maxZoom: this.config.maxZoom,
                zoomControl: this.config.controls.zoom,
                attributionControl: this.config.controls.attribution,
                ...options
            };

            // Создаём карту
            this.map = L.map(this.mapContainer, mapOptions);

            // Добавляем базовый тайловый слой
            const tileLayer = L.tileLayer(this.config.tileLayer.url, {
                attribution: this.config.tileLayer.attribution,
                maxZoom: this.config.tileLayer.maxZoom
            });

            tileLayer.addTo(this.map);
            this.layers.set('base', tileLayer);

            // Добавляем дополнительные контролы
            this.setupControls();

            // Настраиваем обработчики событий карты
            this.setupMapEventHandlers();

            // Обновляем состояние
            this.updateState();

            this.state.initialized = true;
            this.state.loading = false;

            // Уведомляем о создании карты
            this.emit('map:created', { map: this.map });

            return this.map;

        } catch (error) {
            this.state.loading = false;
            await this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'createMap',
                container: container
            });
            throw error;
        }
    }

    /**
     * Настройка дополнительных контролов
     */
    setupControls() {
        if (!this.map) return;

        // Контрол масштаба
        if (this.config.controls.scale) {
            L.control.scale({
                position: 'bottomleft',
                metric: true,
                imperial: false
            }).addTo(this.map);
        }

        // Контрол полноэкранного режима (если доступен)
        if (this.config.controls.fullscreen && L.control.fullscreen) {
            L.control.fullscreen({
                position: 'topleft'
            }).addTo(this.map);
        }
    }

    /**
     * Настройка обработчиков событий карты
     */
    setupMapEventHandlers() {
        if (!this.map) return;

        // Основные события карты
        this.map.on('zoomend', () => {
            this.updateState();
            this.emit('map:zoom', { zoom: this.map.getZoom() });
        });

        this.map.on('moveend', () => {
            this.updateState();
            this.emit('map:move', { 
                center: this.map.getCenter(),
                bounds: this.map.getBounds() 
            });
        });

        this.map.on('click', (e) => {
            this.emit('map:click', { 
                latlng: e.latlng,
                layerPoint: e.layerPoint,
                containerPoint: e.containerPoint
            });
        });

        this.map.on('dblclick', (e) => {
            this.emit('map:dblclick', { latlng: e.latlng });
        });

        // События загрузки
        this.map.on('load', () => {
            this.emit('map:load');
        });

        this.map.on('loading', () => {
            this.emit('map:loading');
        });

        this.map.on('loadend', () => {
            this.emit('map:loadend');
        });

        // События изменения размера
        this.map.on('resize', () => {
            this.updateState();
            this.emit('map:resize');
        });
    }

    /**
     * Обновление внутреннего состояния
     */
    updateState() {
        if (!this.map) return;

        this.state.center = this.map.getCenter();
        this.state.zoom = this.map.getZoom();
        this.state.bounds = this.map.getBounds();
    }

    /**
     * Добавление слоя на карту
     * @param {string} layerId - ID слоя
     * @param {L.Layer} layer - слой Leaflet
     * @param {object} options - опции слоя
     */
    addLayer(layerId, layer, options = {}) {
        if (!this.map) {
            throw new Error('Карта не инициализирована');
        }

        try {
            // Удаляем существующий слой с таким ID
            this.removeLayer(layerId);

            // Добавляем новый слой
            layer.addTo(this.map);
            this.layers.set(layerId, layer);
            this.activeLayers.add(layerId);

            // Сохраняем опции слоя
            if (options.zIndex !== undefined) {
                layer.setZIndex(options.zIndex);
            }

            this.emit('layer:added', { layerId, layer, options });

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'addLayer',
                layerId
            });
        }
    }

    /**
     * Удаление слоя с карты
     * @param {string} layerId - ID слоя
     */
    removeLayer(layerId) {
        if (!this.layers.has(layerId)) {
            return;
        }

        try {
            const layer = this.layers.get(layerId);
            
            if (this.map && this.map.hasLayer(layer)) {
                this.map.removeLayer(layer);
            }

            this.layers.delete(layerId);
            this.activeLayers.delete(layerId);

            this.emit('layer:removed', { layerId });

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'removeLayer',
                layerId
            });
        }
    }

    /**
     * Показать/скрыть слой
     * @param {string} layerId - ID слоя
     * @param {boolean} visible - видимость слоя
     */
    toggleLayer(layerId, visible) {
        if (!this.layers.has(layerId)) {
            return;
        }

        const layer = this.layers.get(layerId);

        try {
            if (visible && !this.activeLayers.has(layerId)) {
                layer.addTo(this.map);
                this.activeLayers.add(layerId);
                this.emit('layer:shown', { layerId });
            } else if (!visible && this.activeLayers.has(layerId)) {
                this.map.removeLayer(layer);
                this.activeLayers.delete(layerId);
                this.emit('layer:hidden', { layerId });
            }
        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'toggleLayer',
                layerId,
                visible
            });
        }
    }

    /**
     * Установка центра и зума карты
     * @param {L.LatLng|Array} center - центр карты
     * @param {number} zoom - уровень зума
     * @param {object} options - опции анимации
     */
    setView(center, zoom, options = {}) {
        if (!this.map) {
            throw new Error('Карта не инициализирована');
        }

        try {
            this.map.setView(center, zoom, {
                animate: options.animate !== false,
                duration: options.duration || 0.5,
                ...options
            });
            
            this.updateState();
            
        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'setView',
                center,
                zoom
            });
        }
    }

    /**
     * Подгонка карты под границы
     * @param {L.LatLngBounds} bounds - границы
     * @param {object} options - опции подгонки
     */
    fitBounds(bounds, options = {}) {
        if (!this.map) {
            throw new Error('Карта не инициализирована');
        }

        try {
            this.map.fitBounds(bounds, {
                padding: options.padding || [10, 10],
                maxZoom: options.maxZoom || this.config.maxZoom,
                animate: options.animate !== false,
                ...options
            });
            
            this.updateState();
            
        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'fitBounds',
                bounds
            });
        }
    }

    /**
     * Получение текущих границ карты
     * @returns {L.LatLngBounds}
     */
    getBounds() {
        return this.map ? this.map.getBounds() : null;
    }

    /**
     * Получение центра карты
     * @returns {L.LatLng}
     */
    getCenter() {
        return this.map ? this.map.getCenter() : null;
    }

    /**
     * Получение текущего зума
     * @returns {number}
     */
    getZoom() {
        return this.map ? this.map.getZoom() : this.config.defaultZoom;
    }

    /**
     * Преобразование координат в пиксели контейнера
     * @param {L.LatLng} latlng - координаты
     * @returns {L.Point}
     */
    latLngToContainerPoint(latlng) {
        return this.map ? this.map.latLngToContainerPoint(latlng) : null;
    }

    /**
     * Преобразование пикселей в координаты
     * @param {L.Point} point - точка в пикселях
     * @returns {L.LatLng}
     */
    containerPointToLatLng(point) {
        return this.map ? this.map.containerPointToLatLng(point) : null;
    }

    /**
     * Инвалидация размера карты (после изменения размера контейнера)
     */
    invalidateSize() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
                this.updateState();
            }, 100);
        }
    }

    /**
     * Установка стиля курсора
     * @param {string} cursor - CSS курсор
     */
    setCursor(cursor) {
        if (this.mapContainer) {
            this.mapContainer.style.cursor = cursor;
        }
    }

    /**
     * Создание пользовательского контрола
     * @param {object} options - опции контрола
     * @returns {L.Control}
     */
    createControl(options) {
        const CustomControl = L.Control.extend({
            options: {
                position: options.position || 'topright'
            },
            
            onAdd: function(map) {
                const container = L.DomUtil.create('div', options.className || 'leaflet-custom-control');
                
                if (options.html) {
                    container.innerHTML = options.html;
                }

                if (options.onClick) {
                    L.DomEvent.on(container, 'click', options.onClick);
                }

                // Предотвращаем всплытие событий
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                return container;
            },
            
            onRemove: function(map) {
                if (options.onRemove) {
                    options.onRemove();
                }
            }
        });

        return new CustomControl();
    }

    /**
     * Добавление пользовательского контрола
     * @param {string} controlId - ID контрола
     * @param {object} options - опции контрола
     */
    addControl(controlId, options) {
        if (!this.map) {
            throw new Error('Карта не инициализирована');
        }

        const control = this.createControl(options);
        control.addTo(this.map);
        
        this.layers.set(`control_${controlId}`, control);
        
        this.emit('control:added', { controlId, control });
        
        return control;
    }

    /**
     * Создание скриншота карты
     * @param {object} options - опции скриншота
     * @returns {Promise<string>} Data URL изображения
     */
    async takeScreenshot(options = {}) {
        if (!this.map) {
            throw new Error('Карта не инициализирована');
        }

        return new Promise((resolve, reject) => {
            try {
                // Используем leaflet-image если доступен
                if (typeof leafletImage !== 'undefined') {
                    leafletImage(this.map, (err, canvas) => {
                        if (err) {
                            reject(err);
                        } else {
                            const dataUrl = canvas.toDataURL(options.format || 'image/png', options.quality || 0.9);
                            resolve(dataUrl);
                        }
                    });
                } else {
                    reject(new Error('leaflet-image library not available'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Получение списка активных слоёв
     * @returns {string[]}
     */
    getActiveLayers() {
        return Array.from(this.activeLayers);
    }

    /**
     * Получение слоя по ID
     * @param {string} layerId - ID слоя
     * @returns {L.Layer|null}
     */
    getLayer(layerId) {
        return this.layers.get(layerId) || null;
    }

    /**
     * Очистка всех слоёв (кроме базового)
     */
    clearLayers() {
        const layersToRemove = Array.from(this.layers.keys()).filter(id => id !== 'base');
        
        layersToRemove.forEach(layerId => {
            this.removeLayer(layerId);
        });

        this.emit('layers:cleared');
    }

    /**
     * Получение состояния карты
     * @returns {object}
     */
    getState() {
        return {
            ...this.state,
            layersCount: this.layers.size,
            activeLayersCount: this.activeLayers.size,
            hasMap: !!this.map
        };
    }

    /**
     * Проверка инициализации карты
     * @returns {boolean}
     */
    isInitialized() {
        return this.state.initialized && !!this.map;
    }

    /**
     * Проверка видимости карты
     * @returns {boolean}
     */
    isVisible() {
        return this.mapContainer && 
               this.mapContainer.offsetParent !== null &&
               this.mapContainer.offsetWidth > 0 && 
               this.mapContainer.offsetHeight > 0;
    }

    /**
     * Уничтожение карты
     */
    destroyMap() {
        try {
            if (this.map) {
                // Удаляем все слои
                this.layers.forEach((layer, id) => {
                    if (id !== 'base') {
                        this.map.removeLayer(layer);
                    }
                });

                // Уничтожаем карту
                this.map.remove();
                this.map = null;
            }

            // Очищаем состояние
            this.layers.clear();
            this.activeLayers.clear();
            this.state.initialized = false;

            // Очищаем контейнер
            if (this.mapContainer) {
                this.mapContainer.innerHTML = '';
                this.mapContainer = null;
            }

            this.emit('map:destroyed');

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MapRenderer',
                method: 'destroyMap'
            });
        }
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
     * Уничтожение компонента
     */
    destroy() {
        this.destroyMap();
        this.eventHandlers.clear();
        this.tileCache.clear();
        
        this.configService = null;
        this.errorHandler = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapRenderer;
} else {
    window.MapRenderer = MapRenderer;
}