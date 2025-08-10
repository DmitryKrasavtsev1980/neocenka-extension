/**
 * MarkerManager - управление маркерами на карте
 * Извлечён из MapManager для специализации на работе с маркерами
 */

class MarkerManager {
    constructor(mapRenderer, configService, errorHandler) {
        this.mapRenderer = mapRenderer;
        this.configService = configService;
        this.errorHandler = errorHandler;
        
        // Коллекции маркеров
        this.markers = new Map();
        this.markerGroups = new Map();
        
        // Кластеризация маркеров
        this.markerClusterGroup = null;
        this.clusteringEnabled = false;
        
        // Кэш иконок для производительности
        this.iconCache = new Map();
        
        // Конфигурация
        this.config = this.getMarkerConfig();
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Счётчики для статистики
        this.stats = {
            totalMarkers: 0,
            visibleMarkers: 0,
            clusteredMarkers: 0
        };
        
        this.initialize();
    }

    /**
     * Получение конфигурации маркеров
     */
    getMarkerConfig() {
        const performanceConfig = this.configService?.get('performance.ui') || {};
        
        return {
            maxVisibleMarkers: performanceConfig.maxVisibleMarkers || 1000,
            clusterDistance: this.configService?.get('ui.map.markerClusterDistance') || 50,
            
            // Настройки иконок по умолчанию
            defaultIcon: {
                iconUrl: '/images/markers/default-marker.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowUrl: '/images/markers/marker-shadow.png',
                shadowSize: [41, 41]
            },
            
            // Предустановленные типы маркеров
            iconTypes: {
                address: {
                    iconUrl: '/images/markers/address-marker.svg',
                    iconSize: [20, 20],
                    className: 'marker-address'
                },
                listing: {
                    iconUrl: '/images/markers/listing-marker.svg', 
                    iconSize: [25, 25],
                    className: 'marker-listing'
                },
                selected: {
                    iconUrl: '/images/markers/selected-marker.svg',
                    iconSize: [30, 30],
                    className: 'marker-selected'
                }
            }
        };
    }

    /**
     * Инициализация менеджера маркеров
     */
    async initialize() {
        try {
            // Проверяем доступность библиотеки кластеризации
            if (typeof L.markerClusterGroup !== 'undefined') {
                this.setupClusterGroup();
            }

            // Предзагружаем иконки
            await this.preloadIcons();

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'MarkerManager',
                method: 'initialize'
            });
        }
    }

    /**
     * Настройка группы кластеризации
     */
    setupClusterGroup() {
        this.markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: this.config.clusterDistance,
            disableClusteringAtZoom: 16,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            
            // Кастомная иконка кластера
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                let className = 'marker-cluster-small';
                
                if (count > 10) {
                    className = 'marker-cluster-medium';
                }
                if (count > 100) {
                    className = 'marker-cluster-large';
                }

                return L.divIcon({
                    html: `<div><span>${count}</span></div>`,
                    className: `marker-cluster ${className}`,
                    iconSize: L.point(40, 40)
                });
            }
        });

        // Обработчики событий кластеров
        this.markerClusterGroup.on('clusterclick', (event) => {
            this.emit('cluster:click', {
                cluster: event.layer,
                markers: event.layer.getAllChildMarkers()
            });
        });

        this.markerClusterGroup.on('spiderfied', (event) => {
            this.emit('cluster:spiderfied', {
                cluster: event.cluster,
                markers: event.markers
            });
        });
    }

    /**
     * Предзагрузка иконок для кэширования
     */
    async preloadIcons() {
        const iconPromises = [];
        
        Object.entries(this.config.iconTypes).forEach(([type, iconConfig]) => {
            if (iconConfig.iconUrl) {
                const promise = this.loadIcon(iconConfig)
                    .then(icon => this.iconCache.set(type, icon))
                    .catch(error => {
                        // Создаем fallback иконку, если не удалось загрузить
                        const fallbackIcon = {
                            iconUrl: this.createFallbackIcon(type),
                            iconSize: iconConfig.iconSize || [25, 25],
                            iconAnchor: iconConfig.iconAnchor || [12, 25]
                        };
                        this.iconCache.set(type, fallbackIcon);
                        console.warn(`⚠️ Использую fallback иконку для ${type}:`, error.message);
                    });
                iconPromises.push(promise);
            }
        });

        await Promise.allSettled(iconPromises);
    }

    /**
     * Создание fallback иконки
     */
    createFallbackIcon(type) {
        // Создаем простую SVG иконку
        const colors = {
            address: '#3B82F6',
            listing: '#10B981', 
            selected: '#EF4444'
        };
        
        const color = colors[type] || '#6B7280';
        const svg = `
            <svg width="25" height="25" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12.5" cy="12.5" r="10" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="12.5" cy="12.5" r="4" fill="white"/>
            </svg>
        `;
        
        return 'data:image/svg+xml;base64,' + btoa(svg);
    }

    /**
     * Загрузка иконки
     */
    loadIcon(iconConfig) {
        return new Promise((resolve, reject) => {
            const icon = L.icon(iconConfig);
            
            // Проверяем загрузку изображения иконки
            const img = new Image();
            img.onload = () => resolve(icon);
            img.onerror = () => reject(new Error('Failed to load icon'));
            img.src = iconConfig.iconUrl;
        });
    }

    /**
     * Создание маркера
     * @param {string} markerId - уникальный ID маркера
     * @param {object} options - опции маркера
     * @returns {L.Marker}
     */
    createMarker(markerId, options) {
        try {
            // Валидация параметров
            if (!markerId || !options.position) {
                throw new Error('markerId и position обязательны для создания маркера');
            }

            // Удаляем существующий маркер с таким ID
            this.removeMarker(markerId);

            // Получаем иконку
            const icon = this.getIcon(options.iconType, options.iconConfig);

            // Создаём маркер
            const marker = L.marker(options.position, {
                icon: icon,
                title: options.title || '',
                alt: options.alt || options.title || '',
                opacity: options.opacity !== undefined ? options.opacity : 1,
                zIndexOffset: options.zIndex || 0,
                ...options.leafletOptions
            });

            // Добавляем пользовательские данные
            marker._neocenkaData = {
                id: markerId,
                type: options.type || 'default',
                data: options.data || {},
                created: new Date()
            };

            // Настраиваем popup если указан
            if (options.popup) {
                this.setupMarkerPopup(marker, options.popup);
            }

            // Настраиваем tooltip если указан
            if (options.tooltip) {
                this.setupMarkerTooltip(marker, options.tooltip);
            }

            // Настраиваем обработчики событий
            this.setupMarkerEvents(marker, options.events);

            // Сохраняем маркер
            this.markers.set(markerId, marker);
            this.stats.totalMarkers++;

            // Добавляем в соответствующую группу
            this.addToGroup(marker, options.group);

            this.emit('marker:created', { markerId, marker, options });

            return marker;

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MarkerManager',
                method: 'createMarker',
                markerId,
                options
            });
            return null;
        }
    }

    /**
     * Получение иконки для маркера
     */
    getIcon(iconType, iconConfig) {
        // Используем кэшированную иконку если есть
        if (iconType && this.iconCache.has(iconType)) {
            return this.iconCache.get(iconType);
        }

        // Создаём кастомную иконку
        if (iconConfig) {
            const icon = L.icon({
                ...this.config.defaultIcon,
                ...iconConfig
            });
            
            // Кэшируем созданную иконку
            if (iconType) {
                this.iconCache.set(iconType, icon);
            }
            
            return icon;
        }

        // Используем иконку по умолчанию
        return L.icon(this.config.defaultIcon);
    }

    /**
     * Настройка popup для маркера
     */
    setupMarkerPopup(marker, popupOptions) {
        if (typeof popupOptions === 'string') {
            marker.bindPopup(popupOptions);
        } else if (typeof popupOptions === 'object') {
            const content = popupOptions.content || '';
            const options = {
                maxWidth: 300,
                className: 'marker-popup',
                ...popupOptions.options
            };
            
            marker.bindPopup(content, options);
        }
    }

    /**
     * Настройка tooltip для маркера
     */
    setupMarkerTooltip(marker, tooltipOptions) {
        if (typeof tooltipOptions === 'string') {
            marker.bindTooltip(tooltipOptions);
        } else if (typeof tooltipOptions === 'object') {
            const content = tooltipOptions.content || '';
            const options = {
                permanent: false,
                className: 'marker-tooltip',
                ...tooltipOptions.options
            };
            
            marker.bindTooltip(content, options);
        }
    }

    /**
     * Настройка событий маркера
     */
    setupMarkerEvents(marker, events) {
        if (!events || typeof events !== 'object') {
            return;
        }

        Object.entries(events).forEach(([eventType, handler]) => {
            if (typeof handler === 'function') {
                marker.on(eventType, (e) => {
                    handler(e, marker._neocenkaData);
                });
            }
        });

        // Базовые события для всех маркеров
        marker.on('click', (e) => {
            this.emit('marker:click', {
                markerId: marker._neocenkaData.id,
                marker: marker,
                event: e
            });
        });

        marker.on('mouseover', (e) => {
            this.emit('marker:hover', {
                markerId: marker._neocenkaData.id,
                marker: marker,
                event: e
            });
        });
    }

    /**
     * Добавление маркера в группу
     */
    addToGroup(marker, groupName) {
        if (!groupName) {
            groupName = 'default';
        }

        if (!this.markerGroups.has(groupName)) {
            this.markerGroups.set(groupName, []);
        }

        this.markerGroups.get(groupName).push(marker);
    }

    /**
     * Отображение маркера на карте
     * @param {string} markerId - ID маркера
     * @param {string} layerId - ID слоя для добавления
     */
    showMarker(markerId, layerId = 'markers') {
        const marker = this.markers.get(markerId);
        if (!marker) {
            console.warn(`Маркер ${markerId} не найден`);
            return;
        }

        try {
            if (this.clusteringEnabled && this.markerClusterGroup) {
                this.markerClusterGroup.addLayer(marker);
                
                // Добавляем группу кластеров на карту если её там нет
                if (!this.mapRenderer.getLayer('clusters')) {
                    this.mapRenderer.addLayer('clusters', this.markerClusterGroup);
                }
            } else {
                // Создаём обычную группу маркеров если её нет
                let markerGroup = this.mapRenderer.getLayer(layerId);
                if (!markerGroup) {
                    markerGroup = L.layerGroup();
                    this.mapRenderer.addLayer(layerId, markerGroup);
                }
                
                markerGroup.addLayer(marker);
            }

            this.stats.visibleMarkers++;
            this.emit('marker:shown', { markerId, marker });

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MarkerManager',
                method: 'showMarker',
                markerId
            });
        }
    }

    /**
     * Скрытие маркера с карты
     * @param {string} markerId - ID маркера
     */
    hideMarker(markerId) {
        const marker = this.markers.get(markerId);
        if (!marker) {
            return;
        }

        try {
            if (this.clusteringEnabled && this.markerClusterGroup) {
                this.markerClusterGroup.removeLayer(marker);
            } else {
                // Удаляем из всех слоёв
                this.mapRenderer.getActiveLayers().forEach(layerId => {
                    const layer = this.mapRenderer.getLayer(layerId);
                    if (layer && typeof layer.removeLayer === 'function') {
                        try {
                            layer.removeLayer(marker);
                        } catch (e) {
                            // Маркера может не быть в этом слое
                        }
                    }
                });
            }

            this.stats.visibleMarkers = Math.max(0, this.stats.visibleMarkers - 1);
            this.emit('marker:hidden', { markerId, marker });

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MarkerManager',
                method: 'hideMarker',
                markerId
            });
        }
    }

    /**
     * Удаление маркера
     * @param {string} markerId - ID маркера
     */
    removeMarker(markerId) {
        const marker = this.markers.get(markerId);
        if (!marker) {
            return;
        }

        try {
            // Скрываем маркер с карты
            this.hideMarker(markerId);

            // Удаляем из групп
            this.markerGroups.forEach((markers, groupName) => {
                const index = markers.indexOf(marker);
                if (index > -1) {
                    markers.splice(index, 1);
                }
            });

            // Удаляем из коллекции
            this.markers.delete(markerId);
            this.stats.totalMarkers = Math.max(0, this.stats.totalMarkers - 1);

            this.emit('marker:removed', { markerId });

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MarkerManager',
                method: 'removeMarker',
                markerId
            });
        }
    }

    /**
     * Обновление позиции маркера
     * @param {string} markerId - ID маркера
     * @param {L.LatLng|Array} newPosition - новая позиция
     * @param {object} options - опции анимации
     */
    updateMarkerPosition(markerId, newPosition, options = {}) {
        const marker = this.markers.get(markerId);
        if (!marker) {
            console.warn(`Маркер ${markerId} не найден`);
            return;
        }

        try {
            if (options.animate) {
                // Анимированное перемещение (если поддерживается)
                if (typeof marker.slideTo === 'function') {
                    marker.slideTo(newPosition, {
                        duration: options.duration || 1000,
                        keepAtCenter: options.keepAtCenter || false
                    });
                } else {
                    marker.setLatLng(newPosition);
                }
            } else {
                marker.setLatLng(newPosition);
            }

            this.emit('marker:moved', { markerId, marker, newPosition, oldPosition: marker.getLatLng() });

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MarkerManager',
                method: 'updateMarkerPosition',
                markerId,
                newPosition
            });
        }
    }

    /**
     * Обновление иконки маркера
     * @param {string} markerId - ID маркера
     * @param {string} iconType - тип иконки или конфигурация
     * @param {object} iconConfig - конфигурация иконки
     */
    updateMarkerIcon(markerId, iconType, iconConfig) {
        const marker = this.markers.get(markerId);
        if (!marker) {
            console.warn(`Маркер ${markerId} не найден`);
            return;
        }

        try {
            const newIcon = this.getIcon(iconType, iconConfig);
            marker.setIcon(newIcon);

            this.emit('marker:icon-updated', { markerId, marker, iconType });

        } catch (error) {
            this.errorHandler?.handleError(error, {
                component: 'MarkerManager',
                method: 'updateMarkerIcon',
                markerId,
                iconType
            });
        }
    }

    /**
     * Получение маркера по ID
     * @param {string} markerId - ID маркера
     * @returns {L.Marker|null}
     */
    getMarker(markerId) {
        return this.markers.get(markerId) || null;
    }

    /**
     * Получение всех маркеров группы
     * @param {string} groupName - имя группы
     * @returns {L.Marker[]}
     */
    getGroupMarkers(groupName) {
        return this.markerGroups.get(groupName) || [];
    }

    /**
     * Отображение всех маркеров группы
     * @param {string} groupName - имя группы
     * @param {string} layerId - ID слоя
     */
    showGroup(groupName, layerId = 'markers') {
        const markers = this.getGroupMarkers(groupName);
        
        markers.forEach(marker => {
            const markerId = marker._neocenkaData?.id;
            if (markerId) {
                this.showMarker(markerId, layerId);
            }
        });

        this.emit('group:shown', { groupName, count: markers.length });
    }

    /**
     * Скрытие всех маркеров группы
     * @param {string} groupName - имя группы
     */
    hideGroup(groupName) {
        const markers = this.getGroupMarkers(groupName);
        
        markers.forEach(marker => {
            const markerId = marker._neocenkaData?.id;
            if (markerId) {
                this.hideMarker(markerId);
            }
        });

        this.emit('group:hidden', { groupName, count: markers.length });
    }

    /**
     * Включение/выключение кластеризации
     * @param {boolean} enabled - включить кластеризацию
     */
    toggleClustering(enabled) {
        if (!this.markerClusterGroup) {
            console.warn('Кластеризация не поддерживается');
            return;
        }

        this.clusteringEnabled = enabled;

        if (enabled) {
            // Переносим все видимые маркеры в кластер
            this.markers.forEach((marker, markerId) => {
                this.hideMarker(markerId);
                this.showMarker(markerId, 'clusters');
            });
        } else {
            // Переносим маркеры из кластера в обычные слои
            this.markerClusterGroup.clearLayers();
            this.mapRenderer.removeLayer('clusters');
            
            this.markers.forEach((marker, markerId) => {
                this.showMarker(markerId, 'markers');
            });
        }

        this.emit('clustering:toggled', { enabled });
    }

    /**
     * Подгонка карты под все видимые маркеры
     * @param {object} options - опции подгонки
     */
    fitBounds(options = {}) {
        const visibleMarkers = [];
        
        if (this.clusteringEnabled && this.markerClusterGroup) {
            visibleMarkers.push(...this.markerClusterGroup.getLayers());
        } else {
            // Собираем маркеры со всех слоёв
            this.mapRenderer.getActiveLayers().forEach(layerId => {
                const layer = this.mapRenderer.getLayer(layerId);
                if (layer && typeof layer.getLayers === 'function') {
                    visibleMarkers.push(...layer.getLayers().filter(l => l instanceof L.Marker));
                }
            });
        }

        if (visibleMarkers.length === 0) {
            return;
        }

        const group = new L.featureGroup(visibleMarkers);
        this.mapRenderer.fitBounds(group.getBounds(), options);
    }

    /**
     * Фильтрация маркеров по критериям
     * @param {function} filterFn - функция фильтрации
     * @param {object} options - опции фильтрации
     */
    filterMarkers(filterFn, options = {}) {
        let hiddenCount = 0;
        let shownCount = 0;

        this.markers.forEach((marker, markerId) => {
            const shouldShow = filterFn(marker, marker._neocenkaData);
            
            if (shouldShow) {
                this.showMarker(markerId, options.layerId);
                shownCount++;
            } else {
                this.hideMarker(markerId);
                hiddenCount++;
            }
        });

        this.emit('markers:filtered', {
            shown: shownCount,
            hidden: hiddenCount,
            total: this.markers.size
        });
    }

    /**
     * Очистка всех маркеров
     */
    clear() {
        // Удаляем все маркеры
        const markerIds = Array.from(this.markers.keys());
        markerIds.forEach(markerId => {
            this.removeMarker(markerId);
        });

        // Очищаем группы
        this.markerGroups.clear();

        // Очищаем кластеры
        if (this.markerClusterGroup) {
            this.markerClusterGroup.clearLayers();
        }

        // Сбрасываем статистику
        this.stats = {
            totalMarkers: 0,
            visibleMarkers: 0,
            clusteredMarkers: 0
        };

        this.emit('markers:cleared');
    }

    /**
     * Получение статистики маркеров
     * @returns {object}
     */
    getStats() {
        return {
            ...this.stats,
            groupsCount: this.markerGroups.size,
            clusteringEnabled: this.clusteringEnabled
        };
    }

    /**
     * Создание маркеров из массива данных
     * @param {Array} items - массив объектов для создания маркеров
     * @param {function} mapperFn - функция преобразования объекта в опции маркера
     * @param {object} commonOptions - общие опции для всех маркеров
     */
    createMarkersFromData(items, mapperFn, commonOptions = {}) {
        const createdMarkers = [];

        items.forEach((item, index) => {
            try {
                const markerOptions = mapperFn(item, index);
                const markerId = markerOptions.id || `data_marker_${index}`;
                
                const marker = this.createMarker(markerId, {
                    ...commonOptions,
                    ...markerOptions
                });
                
                if (marker) {
                    createdMarkers.push(marker);
                }
            } catch (error) {
                console.warn(`Ошибка создания маркера для элемента ${index}:`, error);
            }
        });

        this.emit('markers:bulk-created', {
            count: createdMarkers.length,
            total: items.length
        });

        return createdMarkers;
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
     * Уничтожение менеджера маркеров
     */
    destroy() {
        this.clear();
        this.eventHandlers.clear();
        this.iconCache.clear();
        
        this.mapRenderer = null;
        this.configService = null;
        this.errorHandler = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkerManager;
} else {
    window.MarkerManager = MarkerManager;
}