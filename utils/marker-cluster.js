/**
 * Кластеризация маркеров для Leaflet карт
 * Простая реализация кластеризации без внешних зависимостей
 */

class MarkerCluster {
    constructor(map, options = {}) {
        this.map = map;
        this.options = {
            maxClusterRadius: 80,
            iconCreateFunction: null,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            singleMarkerMode: false,
            disableClusteringAtZoom: 18,
            removeOutsideVisibleBounds: true,
            animate: true,
            animateAddingMarkers: false,
            ...options
        };
        
        this.markers = [];
        this.clusters = [];
        this.markerLayer = L.layerGroup().addTo(map);
        this.clusterLayer = L.layerGroup().addTo(map);
        
        // Подписываемся на события карты
        this.map.on('zoomend', () => this.refresh());
        this.map.on('moveend', () => this.refresh());
    }

    /**
     * Добавление маркера в кластер
     * @param {L.Marker} marker - Leaflet маркер
     */
    addMarker(marker) {
        marker._cluster = this;
        this.markers.push(marker);
        this.refresh();
    }

    /**
     * Добавление массива маркеров
     * @param {Array} markers - Массив маркеров
     */
    addMarkers(markers) {
        markers.forEach(marker => {
            marker._cluster = this;
            this.markers.push(marker);
        });
        this.refresh();
    }

    /**
     * Удаление маркера
     * @param {L.Marker} marker - Маркер для удаления
     */
    removeMarker(marker) {
        const index = this.markers.indexOf(marker);
        if (index > -1) {
            this.markers.splice(index, 1);
            this.refresh();
        }
    }

    /**
     * Очистка всех маркеров
     */
    clearMarkers() {
        this.markers = [];
        this.markerLayer.clearLayers();
        this.clusterLayer.clearLayers();
    }

    /**
     * Обновление кластеров
     */
    refresh() {
        this.markerLayer.clearLayers();
        this.clusterLayer.clearLayers();
        
        const zoom = this.map.getZoom();
        
        // Если масштаб слишком большой, показываем все маркеры
        if (zoom >= this.options.disableClusteringAtZoom) {
            this.markers.forEach(marker => {
                this.markerLayer.addLayer(marker);
            });
            return;
        }

        // Создаем кластеры
        this.clusters = this.createClusters();
        
        // Отображаем кластеры и одиночные маркеры
        this.clusters.forEach(cluster => {
            if (cluster.markers.length === 1) {
                this.markerLayer.addLayer(cluster.markers[0]);
            } else {
                const clusterMarker = this.createClusterMarker(cluster);
                this.clusterLayer.addLayer(clusterMarker);
            }
        });
    }

    /**
     * Создание кластеров из маркеров
     * @returns {Array} Массив кластеров
     */
    createClusters() {
        const clusters = [];
        const processedMarkers = new Set();

        this.markers.forEach(marker => {
            if (processedMarkers.has(marker)) return;

            const cluster = {
                center: marker.getLatLng(),
                markers: [marker],
                bounds: L.latLngBounds([marker.getLatLng()])
            };

            processedMarkers.add(marker);

            // Находим близкие маркеры
            this.markers.forEach(otherMarker => {
                if (processedMarkers.has(otherMarker)) return;

                const distance = this.map.distance(
                    marker.getLatLng(),
                    otherMarker.getLatLng()
                );

                const pixelDistance = this.map.latLngToLayerPoint(marker.getLatLng())
                    .distanceTo(this.map.latLngToLayerPoint(otherMarker.getLatLng()));

                if (pixelDistance <= this.options.maxClusterRadius) {
                    cluster.markers.push(otherMarker);
                    cluster.bounds.extend(otherMarker.getLatLng());
                    processedMarkers.add(otherMarker);
                }
            });

            // Вычисляем центр кластера
            if (cluster.markers.length > 1) {
                cluster.center = cluster.bounds.getCenter();
            }

            clusters.push(cluster);
        });

        return clusters;
    }

    /**
     * Создание маркера кластера
     * @param {Object} cluster - Кластер
     * @returns {L.Marker} Маркер кластера
     */
    createClusterMarker(cluster) {
        const count = cluster.markers.length;
        const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';
        
        const icon = L.divIcon({
            html: `<div class="listing-cluster ${size}">${count}</div>`,
            className: 'listing-cluster-icon',
            iconSize: L.point(size === 'small' ? 30 : size === 'medium' ? 40 : 50, 
                             size === 'small' ? 30 : size === 'medium' ? 40 : 50)
        });

        const marker = L.marker(cluster.center, { icon });

        // Обработчик клика по кластеру
        marker.on('click', () => {
            if (this.options.zoomToBoundsOnClick) {
                if (this.map.getZoom() >= this.options.disableClusteringAtZoom - 1) {
                    // Если уже близко к максимальному зуму, показываем spider
                    this.spiderfy(cluster);
                } else {
                    // Зумируем к границам кластера
                    this.map.fitBounds(cluster.bounds, { padding: [20, 20] });
                }
            }
        });

        // Popup с информацией о кластере
        const popupContent = this.createClusterPopup(cluster);
        marker.bindPopup(popupContent);

        return marker;
    }

    /**
     * Создание popup для кластера
     * @param {Object} cluster - Кластер
     * @returns {string} HTML содержимое popup
     */
    createClusterPopup(cluster) {
        const count = cluster.markers.length;
        const listings = cluster.markers.map(m => m.options.listingData).filter(Boolean);
        
        // Группируем по статусу
        const statusGroups = {};
        listings.forEach(listing => {
            const status = listing.status || 'unknown';
            statusGroups[status] = (statusGroups[status] || 0) + 1;
        });

        // Подсчитываем цены
        const prices = listings.map(l => l.price).filter(p => p && p > 0);
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

        return `
            <div class="listing-popup">
                <div class="header">
                    <div class="title">🏢 Кластер объявлений</div>
                    <div style="font-size: 14px; color: #6b7280;">
                        ${count} объявлений в этой области
                    </div>
                </div>
                
                ${Object.keys(statusGroups).length > 0 ? `
                    <div style="margin-bottom: 8px;">
                        <strong>По статусам:</strong><br>
                        ${Object.entries(statusGroups).map(([status, count]) => 
                            `<span class="status ${status}">${this.getStatusText(status)}: ${count}</span>`
                        ).join(' ')}
                    </div>
                ` : ''}
                
                ${avgPrice > 0 ? `
                    <div style="margin-bottom: 8px;">
                        <strong>Цены:</strong><br>
                        <div style="font-size: 14px;">
                            Средняя: <strong>${new Intl.NumberFormat('ru-RU').format(Math.round(avgPrice))} ₽</strong><br>
                            ${minPrice !== maxPrice ? `От ${new Intl.NumberFormat('ru-RU').format(minPrice)} до ${new Intl.NumberFormat('ru-RU').format(maxPrice)} ₽` : ''}
                        </div>
                    </div>
                ` : ''}
                
                <div style="font-size: 12px; color: #6b7280;">
                    Кликните для увеличения или нажмите Ctrl+Click для просмотра списка
                </div>
            </div>
        `;
    }

    /**
     * Spiderfy эффект - разворачивание кластера в отдельные маркеры
     * @param {Object} cluster - Кластер для разворачивания
     */
    spiderfy(cluster) {
        const center = cluster.center;
        const markers = cluster.markers;
        const radius = 50; // Радиус разворачивания
        
        // Удаляем кластер
        this.clusterLayer.clearLayers();
        
        // Размещаем маркеры по кругу
        markers.forEach((marker, index) => {
            const angle = (360 / markers.length) * index;
            const radian = (angle * Math.PI) / 180;
            
            const lat = center.lat + (radius / 111000) * Math.sin(radian);
            const lng = center.lng + (radius / (111000 * Math.cos(center.lat * Math.PI / 180))) * Math.cos(radian);
            
            const newMarker = L.marker([lat, lng], {
                icon: marker.options.icon,
                ...marker.options
            });
            
            // Копируем popup
            if (marker.getPopup()) {
                newMarker.bindPopup(marker.getPopup().getContent());
            }
            
            this.markerLayer.addLayer(newMarker);
            
            // Анимация появления
            if (this.options.animate) {
                newMarker.setOpacity(0);
                setTimeout(() => {
                    newMarker.setOpacity(1);
                }, index * 50);
            }
        });
    }

    /**
     * Получение текста статуса
     * @param {string} status - Код статуса
     * @returns {string} Текст статуса
     */
    getStatusText(status) {
        const statusMap = {
            'active': 'Активно',
            'archived': 'Архив',
            'needs_processing': 'Обработка',
            'processing': 'В работе'
        };
        return statusMap[status] || 'Неизвестно';
    }

    /**
     * Получение всех маркеров
     * @returns {Array} Массив маркеров
     */
    getMarkers() {
        return this.markers;
    }

    /**
     * Получение количества маркеров
     * @returns {number} Количество маркеров
     */
    getMarkersCount() {
        return this.markers.length;
    }

    /**
     * Удаление кластера с карты
     */
    remove() {
        this.map.off('zoomend moveend');
        this.map.removeLayer(this.markerLayer);
        this.map.removeLayer(this.clusterLayer);
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkerCluster;
}