/**
 * Логика страницы управления областью
 */

class AreaPage {
    constructor() {
        this.currentAreaId = null;
        this.currentArea = null;
        this.map = null;
        this.drawnPolygon = null;
        this.drawControl = null;

        // Слои для карты
        this.mapLayers = {
            addresses: null,
            objects: null,
            listings: null
        };

        // Кластеризация маркеров
        this.markerCluster = null;

        this.addressesTable = null;
        this.duplicatesTable = null;
        
        // Данные для работы
        this.addresses = [];
        this.listings = [];
        this.segments = [];

        // Состояние обработки данных
        this.processing = {
            parsing: false,
            updating: false,
            addresses: false,
            duplicates: false
        };

        // Ключ для сохранения состояния в localStorage
        this.storageKey = 'neocenka_area_progress_';

        // Инициализируем высокопроизводительные геоутилиты
        this.geoUtils = new GeoUtils();
        this.spatialManager = spatialIndexManager;
        
        // Инициализируем OSM API для загрузки адресов
        this.osmAPI = new OSMOverpassAPI();

        // Состояние фильтров карты
        this.activeMapFilter = null;

        // Состояние выбранных элементов в таблице дублей
        this.selectedDuplicates = new Set();
        

        // SlimSelect instance для категорий Inpars
        this.inparsCategoriesSlimSelect = null;
        
        // SlimSelect instances для фильтров обработки
        this.processingAddressSlimSelect = null;
        this.processingPropertyTypeSlimSelect = null;
        this.processingStatusSlimSelect = null;
    }

    /**
     * Очистка ресурсов при уничтожении компонента
     */
    destroy() {
        try {
            // Уничтожаем SlimSelect если они были созданы
            if (this.inparsCategoriesSlimSelect) {
                this.inparsCategoriesSlimSelect.destroy();
                this.inparsCategoriesSlimSelect = null;
            }
            
            if (this.processingAddressSlimSelect) {
                this.processingAddressSlimSelect.destroy();
                this.processingAddressSlimSelect = null;
            }
            
            if (this.processingPropertyTypeSlimSelect) {
                this.processingPropertyTypeSlimSelect.destroy();
                this.processingPropertyTypeSlimSelect = null;
            }
            
            if (this.processingStatusSlimSelect) {
                this.processingStatusSlimSelect.destroy();
                this.processingStatusSlimSelect = null;
            }

            // Очищаем карту если она была создана
            if (this.map) {
                this.map.remove();
                this.map = null;
            }

            // Уничтожаем DataTables если они были созданы
            if (this.addressesTable) {
                this.addressesTable.destroy();
                this.addressesTable = null;
            }

            if (this.duplicatesTable) {
                this.duplicatesTable.destroy();
                this.duplicatesTable = null;
            }

            console.log('AreaPage ресурсы очищены');

        } catch (error) {
            console.error('Ошибка при очистке ресурсов AreaPage:', error);
        }
    }

    /**
     * Инициализация страницы
     */
    async init() {
        try {
            // Получаем ID области из URL параметров
            const urlParams = new URLSearchParams(window.location.search);
            this.currentAreaId = urlParams.get('id');

            if (!this.currentAreaId) {
                this.showError('ID области не указан');
                return;
            }

            // Загружаем данные области
            await this.loadAreaData();

            // Инициализируем компоненты
            await this.initMap();
            this.initDataTable();
            this.bindEvents();
            this.bindDataTableEvents();

            // Загружаем статистику и адреса
            await this.loadAreaStats();
            await this.loadAddresses();
            await this.loadDuplicatesTable();
            
            // Инициализируем фильтры обработки
            await this.initProcessingFilters();
            
            // Инициализируем панель Inpars
            await this.initInparsPanel();
            
            // Восстанавливаем состояние панели Inpars
            this.restoreInparsPanelState();

            // Восстанавливаем состояние таблицы адресов
            this.restoreAddressTableState();

            // Восстанавливаем состояние прогресса
            this.restoreProgressState();

        } catch (error) {
            console.error('Error initializing area page:', error);
            this.showError('Ошибка инициализации страницы: ' + error.message);
        }
    }

    /**
     * Загрузка данных области
     */
    async loadAreaData() {
        try {
            const areaData = await db.get('map_areas', this.currentAreaId);

            if (!areaData) {
                throw new Error('Область не найдена');
            }

            // Создаем экземпляр MapAreaModel для доступа к методам
            this.currentArea = new MapAreaModel(areaData);

            // Обновляем заголовок и описание
            document.getElementById('areaTitle').textContent = this.currentArea.name;

            // Устанавливаем хлебные крошки
            this.setBreadcrumbs();

        } catch (error) {
            console.error('Error loading area data:', error);
            throw error;
        }
    }

    /**
     * Установка хлебных крошек
     */
    setBreadcrumbs() {
        const breadcrumbsContainer = document.getElementById('breadcrumbs-container');
        if (breadcrumbsContainer && typeof createBreadcrumbs === 'function') {
            createBreadcrumbs([
                { text: 'Главная', href: 'main.html' },
                { text: 'Области', href: 'main.html' },
                { text: this.currentArea.name, href: null }
            ]);
        }
    }

    /**
     * Инициализация карты
     */
    async initMap() {
        try {
            // Создаем карту
            this.map = L.map('map').setView([55.7558, 37.6176], 11); // Москва по умолчанию

            // Добавляем слой карты
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.map);

            // Если у области есть полигон, создаем его слой
            if (this.currentArea.polygon && this.currentArea.polygon.length > 0) {
                this.displayAreaPolygon();
            }

            // Инициализируем слои карты
            this.initMapLayers();

            // Инициализируем инструменты рисования
            this.initDrawControls();

            // Активируем фильтр "Год" по умолчанию (это также загрузит данные на карту)
            this.setDefaultMapFilter();

        } catch (error) {
            console.error('Error initializing map:', error);
            throw error;
        }
    }

    /**
     * Отображение полигона области на карте
     */
    displayAreaPolygon() {
        if (!this.currentArea.polygon || this.currentArea.polygon.length === 0) {
            return;
        }

        // Если полигон уже существует, не создаем его повторно
        if (this.areaPolygonLayer) {
            console.log('🔷 Полигон области уже отображен, пропускаем повторное создание');
            return;
        }

        console.log('🔷 Создаем полигон области на карте');

        // Конвертируем координаты в формат Leaflet
        const latLngs = this.currentArea.polygon.map(point => [point.lat, point.lng]);

        // Создаем полигон как отдельный слой
        this.areaPolygonLayer = L.polygon(latLngs, {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            weight: 2
        });

        // Сохраняем ссылку на полигон для редактирования
        this.drawnPolygon = this.areaPolygonLayer;

        // Добавляем полигон в группу для редактирования (если группа уже создана)
        // Если группа еще не создана, полигон будет добавлен в неё позже в initDrawControls()
        if (this.drawnItems) {
            this.drawnItems.addLayer(this.areaPolygonLayer);
        } else {
            // Если группа еще не создана, добавляем полигон напрямую на карту
            this.map.addLayer(this.areaPolygonLayer);
        }

        // Центрируем карту на полигоне
        this.map.fitBounds(this.areaPolygonLayer.getBounds());
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
                        color: '#3b82f6',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.2
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
            const layer = e.layer;

            // Удаляем предыдущий полигон из группы редактирования (это автоматически удалит его с карты)
            if (this.drawnPolygon && this.drawnItems.hasLayer(this.drawnPolygon)) {
                this.drawnItems.removeLayer(this.drawnPolygon);
            }
            if (this.areaPolygonLayer && this.drawnItems.hasLayer(this.areaPolygonLayer)) {
                this.drawnItems.removeLayer(this.areaPolygonLayer);
            }
            
            // Также удаляем полигоны напрямую с карты (на случай если они были добавлены не через drawnItems)
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
        });

        this.map.on(L.Draw.Event.EDITED, (e) => {
            // Обновляем все отредактированные слои
            const layers = e.layers;
            layers.eachLayer((layer) => {
                // Обновляем ссылки на полигон
                this.drawnPolygon = layer;
                this.areaPolygonLayer = layer;
            });
            
            // Сохраняем изменения
            this.savePolygon();
        });

        this.map.on(L.Draw.Event.DELETED, (e) => {
            // Очищаем все ссылки на полигон
            this.drawnPolygon = null;
            this.areaPolygonLayer = null;
            this.currentArea.polygon = [];
            this.saveAreaChanges();
        });
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
            console.log('Layer added:', e.name);
            if (e.name === '📍 Адреса' && this.addressesCluster) {
                this.addressesCluster.markerLayer.addTo(this.map);
                this.addressesCluster.clusterLayer.addTo(this.map);
            } else if (e.name === '📋 Объявления' && this.listingsCluster) {
                this.listingsCluster.markerLayer.addTo(this.map);
                this.listingsCluster.clusterLayer.addTo(this.map);
            }
        });

        this.map.on('overlayremove', (e) => {
            console.log('Layer removed:', e.name);
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
     * Загрузка данных на карту
     */
    async loadMapData() {
        try {
            console.log(`🔄 === ОБНОВЛЕНИЕ ВСЕХ ДАННЫХ КАРТЫ ===`);
            
            // Отображаем полигон области
            this.displayAreaPolygon();
            
            console.log(`📍 Загружаем адреса на карту...`);
            await this.loadAddressesOnMap();
            
            console.log(`🏢 Загружаем объекты на карту...`);
            await this.loadObjectsOnMap();
            
            console.log(`📋 Загружаем объявления на карту...`);
            await this.loadListingsOnMap();
            
            console.log(`✅ Обновление карты завершено`);
        } catch (error) {
            console.error('Error loading map data:', error);
        }
    }

    /**
     * Загрузка адресов на карту
     */
    async loadAddressesOnMap() {
        try {
            const addresses = await this.getAddressesInArea();
            
            // Закрываем все popup перед обновлением
            if (this.map) {
                this.map.closePopup();
            }
            
            // Очищаем предыдущие маркеры
            this.mapLayers.addresses.clearLayers();
            if (this.addressesCluster) {
                this.addressesCluster.clearMarkers();
            }

            // Проверяем, есть ли адреса для обработки
            if (!Array.isArray(addresses) || addresses.length === 0) {
                return;
            }

            const markers = [];
            
            for (const address of addresses) {
                try {
                    if (address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                        // Получаем цвет материала стен
                        let markerColor = '#3b82f6'; // Цвет по умолчанию
                        if (address.wall_material_id) {
                            try {
                                const wallMaterial = await db.get('wall_materials', address.wall_material_id);
                                if (wallMaterial && wallMaterial.color) {
                                    markerColor = wallMaterial.color;
                                }
                            } catch (error) {
                                console.warn('Не удалось получить материал стен для адреса:', address.id);
                            }
                        }

                        // Определяем высоту маркера в зависимости от этажности
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
                            markerHeight = 10; // По умолчанию для адресов без указанной этажности
                        }

                        // Определяем текст для отображения рядом с маркером в зависимости от активного фильтра
                        let labelText = '';
                        switch (this.activeMapFilter) {
                            case 'year':
                                labelText = address.build_year || '';
                                break;
                            case 'series':
                                if (address.house_series_id) {
                                    try {
                                        const houseSeries = await db.get('house_series', address.house_series_id);
                                        labelText = houseSeries ? houseSeries.name : '';
                                    } catch (error) {
                                        labelText = '';
                                    }
                                }
                                break;
                            case 'floors':
                                labelText = address.floors_count || '';
                                break;
                            case 'objects':
                                // Подсчитываем количество объектов для этого адреса
                                try {
                                    const objects = await db.getObjectsByAddress(address.id);
                                    labelText = objects.length.toString();
                                } catch (error) {
                                    labelText = '0';
                                }
                                break;
                            case 'listings':
                                // Подсчитываем количество объявлений для этого адреса
                                try {
                                    const listings = await db.getListingsByAddress(address.id);
                                    labelText = listings.length.toString();
                                    if (listings.length > 0) {
                                        console.log(`📍 Адрес ${address.address} имеет ${listings.length} объявлений`);
                                    }
                                } catch (error) {
                                    console.error(`Ошибка подсчета объявлений для адреса ${address.id}:`, error);
                                    labelText = '0';
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

                        const typeText = this.getAddressTypeText(address.type);
                        
                        // Получаем название материала стен
                        let wallMaterialText = 'Не указан';
                        if (address.wall_material_id) {
                            try {
                                const wallMaterial = await db.get('wall_materials', address.wall_material_id);
                                if (wallMaterial) {
                                    wallMaterialText = wallMaterial.name;
                                }
                            } catch (error) {
                                console.warn('Не удалось получить материал стен для popup:', address.id);
                            }
                        }
                        
                        marker.bindPopup(`
                            <div class="address-popup">
                                <div class="header">
                                    <strong>📍 Адрес</strong><br>
                                    <div class="address-title">${address.address || 'Не указан'}</div>
                                </div>
                                
                                <div class="meta">
                                    <small>Тип: <strong>${typeText}</strong></small><br>
                                    <small>Источник: ${address.source || 'Не указан'}</small>
                                    ${address.floors_count ? `<br><small>Этажей: ${address.floors_count}</small>` : ''}
                                    <br><small>Материал: <strong>${wallMaterialText}</strong></small>
                                </div>
                                
                                <div class="actions" style="margin-top: 12px; display: flex; gap: 8px;">
                                    <button data-action="edit-address" data-address-id="${address.id}" 
                                            class="btn btn-primary btn-sm">
                                        ✏️ Редактировать
                                    </button>
                                    <button data-action="delete-address" data-address-id="${address.id}" 
                                            class="btn btn-danger btn-sm">
                                        🗑️ Удалить
                                    </button>
                                </div>
                            </div>
                        `, {
                            maxWidth: 280,
                            className: 'address-popup-container'
                        });

                        markers.push(marker);
                    }
                } catch (markerError) {
                    console.error(`Ошибка создания маркера для адреса ${address.id}:`, markerError);
                }
            }

            // Если адресов много, используем кластеризацию
            if (addresses.length > 20) {
                // Создаем кластер если его еще нет
                if (!this.addressesCluster) {
                    this.addressesCluster = new MarkerCluster(this.map, {
                        maxClusterRadius: 60,
                        disableClusteringAtZoom: 16,
                        zoomToBoundsOnClick: true,
                        spiderfyOnMaxZoom: true,
                        animate: true
                    });
                }
                this.addressesCluster.addMarkers(markers);
                console.log(`📍 Загружено ${addresses.length} адресов на карту с кластеризацией`);
            } else {
                // Для небольшого количества адресов добавляем прямо на карту
                markers.forEach(marker => {
                    this.mapLayers.addresses.addLayer(marker);
                });
                console.log(`📍 Загружено ${addresses.length} адресов на карту`);
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
            const addresses = await this.getAddressesInArea();
            const objects = [];

            // УДАЛЕН: загрузка объектов недвижимости

            // Очищаем предыдущие маркеры
            this.mapLayers.objects.clearLayers();

            objects.forEach(object => {
                if (object.address?.coordinates?.lat && object.address?.coordinates?.lng) {
                    const marker = L.marker([object.address.coordinates.lat, object.address.coordinates.lng], {
                        icon: L.divIcon({
                            className: 'object-marker',
                            html: '<div style="background: #10b981; width: 14px; height: 14px; border-radius: 3px; border: 2px solid white;"></div>',
                            iconSize: [18, 18],
                            iconAnchor: [9, 9]
                        })
                    });

                    marker.bindPopup(`
                        <div>
                            <strong>🏠 Объект</strong><br>
                            ${object.name || object.address?.address || 'Не указан'}<br>
                            <small>Тип: ${object.property_type || 'Не указан'}</small><br>
                            <small>Объявлений: ${object.listings_count || 0}</small>
                        </div>
                    `);

                    this.mapLayers.objects.addLayer(marker);
                }
            });

            debugLogger.log(`Загружено ${objects.length} объектов на карту`);
        } catch (error) {
            console.error('Error loading objects on map:', error);
        }
    }

    /**
     * Загрузка объявлений на карту
     */
    async loadListingsOnMap() {
        try {
            const listings = await this.getListingsInArea();
            
            // Очищаем предыдущие маркеры
            this.mapLayers.listings.clearLayers();
            if (this.listingsCluster) {
                this.listingsCluster.clearMarkers();
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
                // Скрываем кластер объявлений по умолчанию, так как слой не включен
                if (!this.map.hasLayer(this.mapLayers.listings)) {
                    this.map.removeLayer(this.listingsCluster.markerLayer);
                    this.map.removeLayer(this.listingsCluster.clusterLayer);
                }
                console.log(`📋 Загружено ${listings.length} объявлений на карту с кластеризацией`);
            } else {
                // Для небольшого количества объявлений добавляем прямо на карту
                markers.forEach(marker => {
                    this.mapLayers.listings.addLayer(marker);
                });
                console.log(`📋 Загружено ${listings.length} объявлений на карту`);
            }

            // Обновляем счетчик в интерфейсе
            this.updateListingsCount(listings.length);

        } catch (error) {
            console.error('Error loading listings on map:', error);
        }
    }

    /**
     * Создание маркера для объявления
     * @param {Object} listing - Данные объявления
     * @returns {L.Marker} Leaflet маркер
     */
    createListingMarker(listing) {
        // Определяем цвет маркера по статусу
        let color = '#ef4444'; // красный по умолчанию
        if (listing.status === 'active') color = '#22c55e'; // зеленый
        else if (listing.status === 'archived') color = '#6b7280'; // серый
        else if (listing.status === 'needs_processing') color = '#f59e0b'; // желтый
        else if (listing.status === 'processing') color = '#3b82f6'; // синий

        // Создаем иконку в зависимости от источника
        const sourceIcon = listing.source === 'avito' ? '🟢' : '🔵';
        
        const marker = L.circleMarker([listing.coordinates.lat, listing.coordinates.lng], {
            radius: 8,
            fillColor: color,
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
            listingData: listing // Сохраняем данные для кластеризации
        });

        // Создаем подробный popup
        const popupContent = this.createListingPopup(listing, color);
        marker.bindPopup(popupContent, {
            maxWidth: 320,
            className: 'listing-popup-container'
        });

        // Добавляем событие наведения для предварительного просмотра
        marker.on('mouseover', () => {
            if (!marker.isPopupOpen()) {
                marker.bindTooltip(`
                    <div style="font-size: 12px;">
                        <strong>${listing.title || 'Без названия'}</strong><br>
                        ${listing.price ? new Intl.NumberFormat('ru-RU').format(listing.price) + ' ₽' : 'Цена не указана'}
                    </div>
                `, { direction: 'top', offset: [0, -10] }).openTooltip();
            }
        });

        marker.on('mouseout', () => {
            marker.closeTooltip();
        });

        return marker;
    }

    /**
     * Создание содержимого popup для объявления
     * @param {Object} listing - Данные объявления
     * @param {string} color - Цвет статуса
     * @returns {string} HTML содержимое popup
     */
    createListingPopup(listing, color) {
        const price = listing.price ? new Intl.NumberFormat('ru-RU').format(listing.price) + ' ₽' : 'Цена не указана';
        const source = listing.source === 'avito' ? 'Авито' : listing.source === 'cian' ? 'Циан' : 'Неизвестно';
        const sourceIcon = listing.source === 'avito' ? '🟢' : '🔵';
        
        // Форматируем дату создания
        const createdDate = listing.created_at ? new Date(listing.created_at).toLocaleDateString('ru-RU') : 'Неизвестно';
        const lastSeen = listing.last_seen ? new Date(listing.last_seen).toLocaleDateString('ru-RU') : 'Неизвестно';

        return `
            <div class="listing-popup">
                <div class="header">
                    <div class="title">${listing.title || 'Без названия'}</div>
                    <div class="price" style="color: ${color};">${price}</div>
                </div>
                
                <div class="meta">
                    ${sourceIcon} Источник: <strong>${source}</strong>
                </div>
                
                <div class="meta">
                    📅 Создано: ${createdDate}
                </div>
                
                ${listing.last_seen ? `
                    <div class="meta">
                        👁️ Последний просмотр: ${lastSeen}
                    </div>
                ` : ''}
                
                ${listing.property_type ? `
                    <div class="meta">
                        🏠 Тип: ${this.getPropertyTypeText(listing.property_type)}
                    </div>
                ` : ''}
                
                ${listing.operation_type ? `
                    <div class="meta">
                        💼 Операция: ${this.getOperationTypeText(listing.operation_type)}
                    </div>
                ` : ''}
                
                <div style="margin: 8px 0;">
                    <span class="status ${listing.status}">${this.getStatusText(listing.status)}</span>
                </div>
                
                ${listing.coordinates ? `
                    <div class="meta">
                        📍 Координаты: ${listing.coordinates.lat.toFixed(6)}, ${listing.coordinates.lng.toFixed(6)}
                    </div>
                ` : ''}
                
                <div class="actions" style="display: flex; gap: 8px;">
                    <button class="btn btn-primary view-listing-details" data-listing-id="${listing.id}">
                        👁️ Открыть
                    </button>
                    ${listing.url ? `
                        <a href="${listing.url}" target="_blank" class="btn btn-primary">
                            🔗 Открыть на ${this.getSourceName(listing.source)}
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Получение текста типа недвижимости
     * @param {string} propertyType - Тип недвижимости
     * @returns {string} Текст типа
     */
    getPropertyTypeText(propertyType) {
        const types = {
            'apartment': 'Квартира',
            'room': 'Комната',
            'house': 'Дом',
            'land': 'Участок',
            'commercial': 'Коммерческая',
            'garage': 'Гараж'
        };
        return types[propertyType] || propertyType;
    }

    /**
     * Получение названия источника
     * @param {string} source - Источник объявления
     * @returns {string} Название источника
     */
    getSourceName(source) {
        const sources = {
            'avito': 'Авито',
            'cian': 'Циан',
            'yandex': 'Яндекс.Недвижимость',
            'domclick': 'ДомКлик'
        };
        return sources[source] || 'сайте';
    }

    /**
     * Рендеринг информации о точности определения адреса
     * @param {Object} listing - Объявление
     * @returns {string} HTML с информацией о точности
     */
    renderAddressAccuracyInfo(listing) {
        let addressInfo = '';
        let accuracyInfo = '';
        let coordinatesInfo = '';

        if (listing.address_id) {
            // Адрес определён через связанный address_id
            const linkedAddress = this.getAddressNameById(listing.address_id);
            addressInfo = `
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Определённый адрес:</span>
                    <div class="mt-1 flex items-center space-x-2">
                        <select id="addressSelect_${listing.id}" class="text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">-- Выберите адрес --</option>
                        </select>
                        <button id="saveAddress_${listing.id}" class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            Сохранить
                        </button>
                    </div>
                </div>
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Адрес из объявления:</span>
                    <span class="text-sm text-gray-600 ml-2">${this.escapeHtml(listing.address || 'Не указан')}</span>
                </div>
            `;
            
            // Информация о точности определения на основе реальных полей
            if (listing.address_match_confidence) {
                const confidence = this.getAddressConfidenceText(listing.address_match_confidence);
                const method = this.getAddressMethodText(listing.address_match_method);
                const distance = listing.address_distance ? ` (${Math.round(listing.address_distance)}м)` : '';
                const score = listing.address_match_score ? ` • Оценка: ${(listing.address_match_score * 100).toFixed(0)}%` : '';
                
                accuracyInfo = `
                    <div class="mb-2">
                        <span class="text-sm font-medium text-gray-500">Точность:</span>
                        <span class="text-sm ${this.getConfidenceColor(listing.address_match_confidence)} ml-2">${confidence}${distance}</span>
                    </div>
                    <div class="mb-2">
                        <span class="text-xs text-gray-500">Метод: ${method}${score}</span>
                    </div>
                `;
            } else {
                accuracyInfo = `
                    <div class="mb-2">
                        <span class="text-sm font-medium text-gray-500">Точность:</span>
                        <span class="text-sm text-green-600 ml-2">Адрес определён</span>
                    </div>
                `;
            }
            coordinatesInfo = 'Используются координаты определённого адреса';
        } else {
            // Адрес не определён, используем данные из объявления
            addressInfo = `
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Адрес из объявления:</span>
                    <span class="text-sm text-gray-900 ml-2">${this.escapeHtml(listing.address || 'Не указан')}</span>
                </div>
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Определить адрес:</span>
                    <div class="mt-1 flex items-center space-x-2">
                        <select id="addressSelect_${listing.id}" class="text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">-- Выберите адрес --</option>
                        </select>
                        <button id="saveAddress_${listing.id}" class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                            Сохранить
                        </button>
                    </div>
                </div>
            `;
            
            accuracyInfo = `
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Статус:</span>
                    <span class="text-sm text-orange-600 ml-2">Адрес не определён</span>
                </div>
                <div class="mb-2">
                    <span class="text-xs text-gray-500">Требуется обработка для определения адреса</span>
                </div>
            `;
            coordinatesInfo = 'Используются координаты из объявления';
        }

        // Координаты для отображения
        const coords = this.getListingCoordinates(listing);
        const coordsDisplay = coords ? 
            `<div class="mb-2">
                <span class="text-sm font-medium text-gray-500">Координаты:</span>
                <span class="text-sm text-gray-700 ml-2">${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</span>
                <span class="text-xs text-gray-500 block">${coordinatesInfo}</span>
            </div>` : 
            `<div class="mb-2">
                <span class="text-sm text-red-600">⚠️ Координаты не найдены</span>
            </div>`;

        return addressInfo + accuracyInfo + coordsDisplay;
    }

    /**
     * Инициализация выпадающего списка адресами с SlimSelect
     * @param {string} listingId - ID объявления
     * @param {string} currentAddressId - Текущий ID адреса
     */
    async initializeAddressSelector(listingId, currentAddressId) {
        try {
            const selectElement = document.getElementById(`addressSelect_${listingId}`);
            if (!selectElement) return;

            // Загружаем только адреса из текущей области
            const addresses = await this.getAddressesInArea();
            
            // Очищаем текущие опции
            selectElement.innerHTML = '<option value="">-- Выберите адрес --</option>';
            
            // Добавляем опции для каждого адреса
            addresses.forEach(address => {
                const option = document.createElement('option');
                option.value = address.id;
                option.textContent = address.address;
                
                // Выбираем текущий адрес
                if (address.id === currentAddressId) {
                    option.selected = true;
                }
                
                selectElement.appendChild(option);
            });
            
            // Инициализируем SlimSelect
            const slimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    placeholderText: '-- Выберите адрес --',
                    searchPlaceholder: 'Поиск адреса...',
                    searchText: 'Не найдено',
                    searchHighlight: true,
                    closeOnSelect: true
                }
            });
            
            // Сохраняем экземпляр SlimSelect для последующего использования
            this[`addressSlimSelect_${listingId}`] = slimSelect;
            
            console.log(`📍 Загружено ${addresses.length} адресов в выпадающий список`);
            
        } catch (error) {
            console.error('Ошибка инициализации выпадающего списка адресов:', error);
        }
    }

    /**
     * Сохранение выбранного адреса для объявления
     * @param {string} listingId - ID объявления
     */
    async saveListingAddress(listingId) {
        try {
            const select = document.getElementById(`addressSelect_${listingId}`);
            if (!select) {
                console.error('Селектор адреса не найден:', `addressSelect_${listingId}`);
                return;
            }

            const selectedAddressId = select.value;
            console.log(`🔄 Сохраняем адрес для объявления ${listingId}:`, selectedAddressId);
            
            // Получаем текущее объявление
            const listing = await db.getListing(listingId);
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                return;
            }

            // Обновляем адрес
            listing.address_id = selectedAddressId || null;
            
            // Если адрес выбран, сбрасываем информацию о автоматическом определении
            if (selectedAddressId) {
                listing.address_match_confidence = 'manual';
                listing.address_match_method = 'manual_selection';
                listing.address_match_score = 1.0;
                listing.address_distance = null;
            } else {
                // Если адрес убран, очищаем информацию о совпадении
                listing.address_match_confidence = null;
                listing.address_match_method = null;
                listing.address_match_score = null;
                listing.address_distance = null;
            }
            
            // Сохраняем в базе данных
            await db.updateListing(listing);
            
            console.log(`✅ Адрес обновлен для объявления ${listingId}:`, selectedAddressId);
            
            // Обновляем информацию о местоположении без перезагрузки всего модального окна
            const locationContent = document.getElementById(`locationPanelContent-${listingId}`);
            if (locationContent) {
                // Получаем обновленное объявление
                const updatedListing = await db.getListing(listingId);
                
                // Обновляем только информацию об адресе
                const addressInfoHtml = this.renderAddressAccuracyInfo(updatedListing);
                const mapContainer = document.getElementById(`listing-map-${listingId}`);
                const mapHtml = mapContainer ? mapContainer.outerHTML : '';
                
                locationContent.innerHTML = addressInfoHtml + mapHtml;
                
                // Повторно инициализируем адресный селектор
                setTimeout(() => {
                    this.initializeAddressSelector(listingId, updatedListing.address_id);
                    
                    // Добавляем обработчик для кнопки сохранения
                    const saveButton = document.getElementById(`saveAddress_${listingId}`);
                    if (saveButton) {
                        saveButton.addEventListener('click', () => {
                            this.saveListingAddress(listingId);
                        });
                    }
                    
                    // Если карта была инициализирована, переинициализируем её
                    if (mapContainer && mapContainer._leafletMap) {
                        this.renderListingMap(updatedListing);
                    }
                }, 100);
            }
            
            // Обновляем таблицу дублей
            await this.loadDuplicatesTable();
            
        } catch (error) {
            console.error('Ошибка сохранения адреса:', error);
            alert('Ошибка при сохранении адреса: ' + error.message);
        }
    }

    /**
     * Получение текста уровня уверенности в определении адреса
     * @param {string} confidence - Уровень уверенности
     * @returns {string} Читаемый текст
     */
    getAddressConfidenceText(confidence) {
        const confidenceMap = {
            'high': 'Высокая',
            'medium': 'Средняя', 
            'low': 'Низкая',
            'very_low': 'Очень низкая',
            'manual': 'Вручную',
            'none': 'Не определена'
        };
        return confidenceMap[confidence] || confidence;
    }

    /**
     * Получение CSS класса цвета для уровня уверенности
     * @param {string} confidence - Уровень уверенности
     * @returns {string} CSS класс
     */
    getConfidenceColor(confidence) {
        const colorMap = {
            'high': 'text-green-600',
            'medium': 'text-yellow-600',
            'low': 'text-orange-600', 
            'very_low': 'text-red-600',
            'none': 'text-gray-500'
        };
        return colorMap[confidence] || 'text-gray-500';
    }

    /**
     * Получение описания метода определения адреса
     * @param {string} method - Метод определения
     * @returns {string} Описание метода
     */
    getAddressMethodText(method) {
        const methodMap = {
            'exact_geo': 'Точное совпадение по координатам',
            'near_geo_text': 'Поиск рядом + анализ текста',
            'extended_geo_text': 'Расширенный поиск + анализ текста',
            'global_text': 'Глобальный поиск по тексту',
            'manual': 'Вручную',
            'manual_selection': 'Ручной выбор',
            'no_match': 'Совпадения не найдены'
        };
        return methodMap[method] || method || 'Неизвестно';
    }

    /**
     * Получение координат объявления (из адреса или из объявления)
     * @param {Object} listing - Объявление
     * @returns {Object|null} Координаты {lat, lng} или null
     */
    getListingCoordinates(listing) {
        // Сначала пытаемся получить координаты из связанного адреса
        if (listing.address_id) {
            const address = this.addresses.find(addr => addr.id === listing.address_id);
            if (address && address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                return {
                    lat: parseFloat(address.coordinates.lat),
                    lng: parseFloat(address.coordinates.lng)
                };
            }
        }

        // Если не найдены, используем координаты из объявления
        if (listing.coordinates) {
            // Учитываем разные форматы координат
            const lat = listing.coordinates.lat || listing.coordinates.lon;
            const lng = listing.coordinates.lng || listing.coordinates.lon;
            
            if (lat && lng) {
                return { 
                    lat: parseFloat(lat), 
                    lng: parseFloat(lng) 
                };
            }
        }

        return null;
    }

    /**
     * Получение текста типа операции
     * @param {string} operationType - Тип операции
     * @returns {string} Текст операции
     */
    getOperationTypeText(operationType) {
        const operations = {
            'sell': 'Продажа',
            'rent': 'Аренда',
            'rent_long': 'Долгосрочная аренда',
            'rent_short': 'Краткосрочная аренда'
        };
        return operations[operationType] || operationType;
    }

    /**
     * Получение текста типа адреса
     * @param {string} type - Тип адреса
     * @returns {string} Текст типа адреса
     */
    getAddressTypeText(type) {
        switch(type) {
            case 'house':
            case 'building':
                return 'Дом';
            case 'house_with_land':
                return 'Дом с участком';
            case 'land':
                return 'Участок';
            case 'commercial':
                return 'Коммерция';
            default:
                return 'Здание';
        }
    }

    /**
     * Редактирование адреса
     * @param {string} addressId - ID адреса
     */
    async editAddress(addressId) {
        try {
            console.log(`🔄 Открытие формы редактирования адреса: ${addressId}`);
            
            // Получаем данные адреса
            const address = await db.get('addresses', addressId);
            if (!address) {
                this.showError('Адрес не найден');
                return;
            }

            // Заполняем форму данными адреса
            this.fillAddressForm(address);
            
            // Показываем модальное окно
            this.showAddressModal(address);
            
        } catch (error) {
            console.error('Error opening edit address modal:', error);
            this.showError('Ошибка открытия формы редактирования: ' + error.message);
        }
    }

    /**
     * Заполнение формы редактирования адреса
     * @param {Object} address - Данные адреса
     */
    async fillAddressForm(address) {
        document.getElementById('editAddressText').value = address.address || '';
        document.getElementById('editAddressType').value = address.type || 'house';
        
        // Загружаем серии домов в select
        await this.loadHouseSeries();
        document.getElementById('editHouseSeries').value = address.house_series_id || '';
        
        // Загружаем материалы стен в select
        await this.loadWallMaterials();
        document.getElementById('editWallMaterial').value = address.wall_material_id || '';
        
        // Загружаем материалы перекрытий в select
        await this.loadCeilingMaterials();
        document.getElementById('editCeilingMaterial').value = address.ceiling_material_id || '';
        
        // Газоснабжение
        const gasSupplyValue = address.gas_supply === null || address.gas_supply === undefined ? '' : address.gas_supply.toString();
        document.getElementById('editGasSupply').value = gasSupplyValue;
        
        document.getElementById('editFloorsCount').value = address.floors_count || '';
        document.getElementById('editBuildYear').value = address.build_year || '';
        document.getElementById('editEntrancesCount').value = address.entrances_count || '';
        document.getElementById('editLivingSpaces').value = address.living_spaces_count || '';
        document.getElementById('editHasPlayground').checked = address.has_playground || false;
        document.getElementById('editHasSportsArea').checked = address.has_sports_area || false;
        
        // Обновляем ссылки на внешние сервисы
        this.updateExternalServiceLinks(address);
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
     * Показ модального окна редактирования адреса
     * @param {Object} address - Данные адреса
     */
    showAddressModal(address) {
        const modal = document.getElementById('editAddressModal');
        modal.classList.remove('hidden');
        
        // Инициализируем карту в модальном окне
        setTimeout(() => {
            this.initEditAddressMap(address);
        }, 100);
        
        // Сохраняем ID редактируемого адреса
        this.editingAddressId = address.id;
    }

    /**
     * Инициализация карты в модальном окне редактирования
     * @param {Object} address - Данные адреса
     */
    initEditAddressMap(address) {
        const mapContainer = document.getElementById('editAddressMap');
        
        // Удаляем существующую карту если есть
        if (this.editAddressMap) {
            this.editAddressMap.remove();
        }
        
        // Создаем новую карту
        this.editAddressMap = L.map('editAddressMap').setView([
            address.coordinates.lat, 
            address.coordinates.lng
        ], 16);
        
        // Добавляем тайлы OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.editAddressMap);
        
        // Добавляем перетаскиваемый маркер
        this.editAddressMarker = L.marker([
            address.coordinates.lat, 
            address.coordinates.lng
        ], {
            draggable: true
        }).addTo(this.editAddressMap);
        
        // Сохраняем новые координаты при перетаскивании
        this.editAddressMarker.on('dragend', async (event) => {
            const marker = event.target;
            const position = marker.getLatLng();
            console.log(`📍 Новые координаты: ${position.lat}, ${position.lng}`);
            
            // Обновляем визуальную подсказку о том, что координаты изменены
            const coordsDisplay = document.querySelector('#editAddressMap + p');
            if (coordsDisplay) {
                coordsDisplay.innerHTML = `
                    <span style="color: #059669; font-weight: 500;">
                        ✅ Координаты обновлены: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}
                    </span><br>
                    <span style="font-size: 12px; color: #6b7280;">
                        🔍 Поиск адреса по координатам...
                    </span>
                `;
            }
            
            // Выполняем reverse geocoding для получения адреса
            try {
                const osmAPI = new OSMOverpassAPI();
                const foundAddress = await osmAPI.reverseGeocode(position.lat, position.lng);
                
                if (foundAddress) {
                    // Подставляем найденный адрес в поле формы
                    const addressField = document.getElementById('editAddressText');
                    if (addressField) {
                        addressField.value = foundAddress;
                        console.log(`✅ Адрес найден и подставлен: ${foundAddress}`);
                    }
                    
                    // Обновляем подсказку
                    if (coordsDisplay) {
                        coordsDisplay.innerHTML = `
                            <span style="color: #059669; font-weight: 500;">
                                ✅ Координаты обновлены: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}
                            </span><br>
                            <span style="color: #10b981; font-size: 12px;">
                                📍 Найден адрес: ${foundAddress}
                            </span>
                        `;
                    }
                } else {
                    // Адрес не найден
                    if (coordsDisplay) {
                        coordsDisplay.innerHTML = `
                            <span style="color: #059669; font-weight: 500;">
                                ✅ Координаты обновлены: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}
                            </span><br>
                            <span style="color: #f59e0b; font-size: 12px;">
                                ⚠️ Адрес по координатам не найден
                            </span>
                        `;
                    }
                }
            } catch (error) {
                console.error('Ошибка при поиске адреса:', error);
                if (coordsDisplay) {
                    coordsDisplay.innerHTML = `
                        <span style="color: #059669; font-weight: 500;">
                            ✅ Координаты обновлены: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}
                        </span><br>
                        <span style="color: #ef4444; font-size: 12px;">
                            ❌ Ошибка поиска адреса
                        </span>
                    `;
                }
            }
        });
    }

    /**
     * Удаление адреса
     * @param {string} addressId - ID адреса
     */
    async deleteAddress(addressId) {
        try {
            // Получаем данные адреса для отображения в подтверждении
            const address = await db.get('addresses', addressId);
            if (!address) {
                this.showError('Адрес не найден');
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

            console.log(`🗑️ Удаление адреса: ${addressId}`);
            
            // Удаляем адрес из базы данных
            await db.delete('addresses', addressId);
            
            // Обновляем карту как при нажатии кнопки "Обновить карту"
            await this.refreshMapData();
            
            // Также обновляем таблицу и статистику
            await this.loadAddresses();
            await this.loadAreaStats();
            
            this.showSuccess('Адрес успешно удален');
            
        } catch (error) {
            console.error('Error deleting address:', error);
            this.showError('Ошибка удаления адреса: ' + error.message);
        }
    }

    /**
     * Обновление данных адресов после изменений
     */
    async refreshAddressData() {
        try {
            // Обновляем карту
            await this.loadAddressesOnMap();
            
            // Обновляем таблицу
            await this.loadAddresses();
            
            // Обновляем статистику
            await this.loadAreaStats();
            
        } catch (error) {
            console.error('Error refreshing address data:', error);
        }
    }

    /**
     * Принудительное обновление всех данных адресов с очисткой кэша
     */
    async forceRefreshAddressData() {
        try {
            console.log(`🔄 === ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ ДАННЫХ АДРЕСОВ ===`);
            
            // Очищаем пространственный индекс
            if (this.spatialManager) {
                console.log(`🗑️ Очищаем пространственный индекс адресов`);
                this.spatialManager.clearIndex('addresses');
                // Также удаляем сам индекс для полного пересоздания
                if (this.spatialManager.hasIndex('addresses')) {
                    this.spatialManager.removeIndex('addresses');
                }
            }
            
            // Очищаем слой адресов на карте
            if (this.mapLayers && this.mapLayers.addresses) {
                console.log(`🗺️ Очищаем слой адресов на карте`);
                this.mapLayers.addresses.clearLayers();
            }
            
            // Принудительно перезагружаем адреса на карту
            console.log(`📍 Перезагружаем адреса на карту`);
            await this.loadAddressesOnMap();
            
            // Принудительно перезагружаем таблицу адресов
            console.log(`📋 Перезагружаем таблицу адресов`);
            await this.loadAddresses();
            
            // Обновляем статистику области
            console.log(`📊 Обновляем статистику области`);
            await this.loadAreaStats();
            
            console.log(`✅ Принудительное обновление данных завершено`);
            
        } catch (error) {
            console.error('Error force refreshing address data:', error);
            this.showError('Ошибка обновления данных: ' + error.message);
        }
    }

    /**
     * Сохранение изменений адреса
     */
    async saveAddressEdit() {
        try {
            // Собираем данные из формы
            const formData = new FormData(document.getElementById('editAddressForm'));
            const addressData = {
                address: formData.get('address'),
                type: formData.get('type'),
                house_series_id: formData.get('house_series_id') || null,
                wall_material_id: formData.get('wall_material_id') || null,
                ceiling_material_id: formData.get('ceiling_material_id') || null,
                gas_supply: formData.get('gas_supply') ? formData.get('gas_supply') === 'true' : null,
                floors_count: formData.get('floors_count') ? parseInt(formData.get('floors_count')) : null,
                build_year: formData.get('build_year') ? parseInt(formData.get('build_year')) : null,
                entrances_count: formData.get('entrances_count') ? parseInt(formData.get('entrances_count')) : null,
                living_spaces_count: formData.get('living_spaces_count') ? parseInt(formData.get('living_spaces_count')) : null,
                has_playground: formData.get('has_playground') === 'on',
                has_sports_area: formData.get('has_sports_area') === 'on',
                map_area_id: this.currentAreaId,
                source: 'manual',
                updated_at: new Date().toISOString()
            };

            // Получаем новые координаты с карты
            if (this.editAddressMarker) {
                const position = this.editAddressMarker.getLatLng();
                addressData.coordinates = {
                    lat: position.lat,
                    lng: position.lng
                };
            }

            const isNewAddress = !this.editingAddressId;
            
            if (isNewAddress) {
                // Создаем новый адрес
                addressData.id = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                addressData.created_at = new Date().toISOString();
                
                console.log(`🆕 Создание нового адреса:`, addressData);
                await db.add('addresses', addressData);
                this.showSuccess('Новый адрес создан');
            } else {
                // Обновляем существующий адрес
                addressData.id = this.editingAddressId;
                
                console.log(`💾 Обновление адреса:`, addressData);
                await db.update('addresses', addressData);
                this.showSuccess('Адрес обновлен');
            }

            // Закрываем модальное окно
            this.closeEditAddressModal();

            // Обновляем карту как при нажатии кнопки "Обновить карту"
            await this.refreshMapData();
            
            // Также обновляем таблицу и статистику
            await this.loadAddresses();
            await this.loadAreaStats();

            this.showSuccess('Адрес успешно обновлен');

        } catch (error) {
            console.error('Error saving address edit:', error);
            this.showError('Ошибка сохранения адреса: ' + error.message);
        }
    }

    /**
     * Закрытие модального окна редактирования адреса
     */
    closeEditAddressModal() {
        const modal = document.getElementById('editAddressModal');
        modal.classList.add('hidden');
        
        // Очищаем ID редактируемого адреса
        this.editingAddressId = null;
        
        // Удаляем карту из модального окна
        if (this.editAddressMap) {
            this.editAddressMap.remove();
            this.editAddressMap = null;
        }
        
        // Очищаем маркер
        this.editAddressMarker = null;
    }

    /**
     * Обновление счетчика объявлений в интерфейсе
     * @param {number} count - Количество объявлений
     */
    updateListingsCount(count) {
        const listingsCountElement = document.getElementById('listingsCount');
        if (listingsCountElement) {
            listingsCountElement.textContent = count.toLocaleString('ru-RU');
        }
    }

    /**
     * Получение текста статуса объявления
     */
    getStatusText(status) {
        const statusMap = {
            'active': 'Активно',
            'archived': 'Архивировано',
            'needs_processing': 'Требует обработки',
            'processing': 'Обрабатывается'
        };
        return statusMap[status] || 'Неизвестно';
    }

    /**
     * Обновление данных на карте
     */
    async refreshMapData() {
        try {
            await this.loadMapData();
        } catch (error) {
            console.error('Error refreshing map data:', error);
        }
    }

    /**
     * Сохранение полигона
     */
    async savePolygon() {
        if (!this.drawnPolygon) return;

        try {
            const latLngs = this.drawnPolygon.getLatLngs()[0];
            this.currentArea.polygon = latLngs.map(point => ({
                lat: point.lat,
                lng: point.lng
            }));

            // Обновляем слой полигона области
            if (this.areaPolygonLayer) {
                this.areaPolygonLayer.setLatLngs(latLngs);
            }

            await this.saveAreaChanges();
            this.showSuccess('Полигон области сохранен');

        } catch (error) {
            console.error('Error saving polygon:', error);
            this.showError('Ошибка сохранения полигона: ' + error.message);
        }
    }

    /**
     * Сохранение изменений области
     */
    async saveAreaChanges() {
        try {
            this.currentArea.updated_at = new Date();
            await db.updateMapArea(this.currentArea);
        } catch (error) {
            console.error('Error saving area changes:', error);
            throw error;
        }
    }

    /**
     * Инициализация таблиц данных
     */
    initDataTable() {
        try {
            // Инициализация таблицы адресов
            this.addressesTable = $('#addressesTable').DataTable({
                language: {
                    url: '../libs/datatables/ru.json'
                },
                pageLength: 10,
                ordering: true,
                searching: true,
                columns: [
                    { data: 'address', title: 'Адрес' },
                    {
                        data: 'type',
                        title: 'Тип',
                        render: function (data) {
                            switch(data) {
                                case 'house':
                                case 'building':
                                    return 'Дом';
                                case 'house_with_land':
                                    return 'Дом с участком';
                                case 'land':
                                    return 'Участок';
                                case 'commercial':
                                    return 'Коммерция';
                                default:
                                    return 'Здание';
                            }
                        }
                    },
                    {
                        data: null,
                        title: 'Конструктив',
                        render: function (data) {
                            const parts = [];
                            if (data.house_series) parts.push(data.house_series);
                            if (data.wall_material) parts.push(data.wall_material);
                            if (data.building_type) parts.push(data.building_type);
                            if (data.floors_count) parts.push(`${data.floors_count} эт.`);
                            return parts.join(', ') || '-';
                        }
                    },
                    { data: 'objects_count', title: 'Объектов', defaultContent: '0' },
                    { data: 'listings_count', title: 'Объявлений', defaultContent: '0' },
                    {
                        data: null,
                        title: 'Действия',
                        orderable: false,
                        render: function (data, type, row) {
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
                    }
                ]
            });

            // Инициализация таблицы дублей
            this.duplicatesTable = $('#duplicatesTable').DataTable({
                language: {
                    url: '../libs/datatables/ru.json'
                },
                pageLength: 10,
                ordering: true,
                searching: true,
                order: [[5, 'desc']], // Сортировка по дате обновления (колонка 5)
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
                        render: function (data, type, row) {
                            const isListing = row.type === 'listing';
                            const statusBadges = {
                                'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
                                'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
                                'needs_processing': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Требует обработки</span>'
                            };
                            
                            let html = statusBadges[row.status] || `<span class="text-xs text-gray-500">${row.status}</span>`;
                            
                            if (isListing && row.processing_status) {
                                const processingBadges = {
                                    'address_needed': '<br><span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Определить адрес</span>',
                                    'duplicate_check_needed': '<br><span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Обработать на дубли</span>',
                                    'processed': '<br><span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Обработано</span>'
                                };
                                html += processingBadges[row.processing_status] || '';
                            }
                            
                            return html;
                        }
                    },
                    // 3. Дата создания
                    { 
                        data: 'listing_date', 
                        title: 'Создано',
                        render: function (data, type, row) {
                            // Используем listing_date, а если его нет - то created_at
                            const dateValue = data || row.created_at;
                            if (!dateValue) return '—';
                            const date = new Date(dateValue);
                            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            return `<div class="text-xs">${dateStr}</div>`;
                        }
                    },
                    // 4. Дата обновления
                    { 
                        data: 'updated_at', 
                        title: 'Обновлено',
                        render: function (data, type, row) {
                            if (!data) return '—';
                            const date = new Date(data);
                            const now = new Date();
                            const diffTime = Math.abs(now - date);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            const daysAgo = diffDays === 1 ? '1 день назад' : `${diffDays} дн. назад`;
                            const color = diffDays > 7 ? 'text-red-600' : 'text-green-600';
                            
                            return `<div class="text-xs">
                                ${dateStr}<br>
                                <span class="${color}">${daysAgo}</span>
                            </div>`;
                        }
                    },
                    // 5. Характеристики
                    { 
                        data: null, 
                        title: 'Характеристики',
                        render: function (data, type, row) {
                            const isListing = row.type === 'listing';
                            if (!isListing) {
                                return `<div class="text-xs text-gray-600">${row.name || 'Объект недвижимости'}</div>`;
                            }
                            
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
                            
                            return `<div class="text-xs text-gray-900 max-w-xs" title="${parts.join(', ')}">${parts.join(', ')}</div>`;
                        }
                    },
                    // 6. Адрес
                    { 
                        data: 'address', 
                        title: 'Адрес',
                        render: (data, type, row) => {
                            const addressFromDb = this.getAddressNameById(row.address_id);
                            const addressText = data || 'Адрес не указан';
                            const addressFromDbText = addressFromDb || 'Адрес не определен';
                            
                            const addressClass = addressText === 'Адрес не указан' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800';
                            const addressFromDbClass = addressFromDbText === 'Адрес не определен' ? 'text-red-500' : 'text-gray-500';
                            
                            return `<div class="text-xs max-w-xs">
                                <div class="${addressClass} cursor-pointer clickable-address truncate" data-listing-id="${row.id}">${addressText}</div>
                                <div class="${addressFromDbClass} truncate">${addressFromDbText}</div>
                            </div>`;
                        }
                    },
                    // 7. Цена
                    { 
                        data: null, 
                        title: 'Цена',
                        render: function (data, type, row) {
                            if (!row.price) return '<div class="text-xs">—</div>';
                            
                            const price = `${row.price.toLocaleString()} ₽`;
                            let pricePerMeter = '';
                            
                            if (row.price_per_meter) {
                                pricePerMeter = `${row.price_per_meter.toLocaleString()} ₽/м²`;
                            } else if (row.price && row.area_total) {
                                const calculated = Math.round(row.price / row.area_total);
                                pricePerMeter = `${calculated.toLocaleString()} ₽/м²`;
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
                        render: function (data, type, row) {
                            const isListing = row.type === 'listing';
                            if (!isListing) return '<div class="text-xs text-gray-500">—</div>';
                            
                            const sellerType = row.seller_type === 'private' ? 'Собственник' : 
                                             row.seller_type === 'agency' ? 'Агент' : 
                                             row.seller_type || 'Не указано';
                            
                            const sellerName = row.seller_name || 'Не указано';
                            
                            return `<div class="text-xs max-w-xs">
                                <div class="text-gray-900 truncate" title="${sellerType}">${sellerType}</div>
                                <div class="text-gray-500 truncate" title="${sellerName}">${sellerName}</div>
                            </div>`;
                        }
                    }
                ]
            });

        } catch (error) {
            console.error('Error initializing data tables:', error);
        }
    }

    /**
     * Привязка событий
     */
    bindEvents() {
        // Редактирование области
        document.getElementById('editAreaBtn')?.addEventListener('click', () => {
            this.openEditAreaModal();
        });


        // Загрузка адресов
        document.getElementById('loadAddressesBtn')?.addEventListener('click', () => {
            this.loadAddressesFromAPI();
        });

        // Обновление карты
        document.getElementById('refreshMapBtn')?.addEventListener('click', () => {
            this.refreshMapData();
        });

        // Обработка данных
        document.getElementById('parseListingsBtn')?.addEventListener('click', () => {
            this.parseListings();
        });

        document.getElementById('updateListingsBtn')?.addEventListener('click', () => {
            this.updateListings();
        });

        document.getElementById('processAddressesBtn')?.addEventListener('click', () => {
            this.processAddresses();
        });

        document.getElementById('processDuplicatesBtn')?.addEventListener('click', () => {
            this.processDuplicates();
        });

        document.getElementById('deleteListingsBtn')?.addEventListener('click', () => {
            this.deleteListings();
        });

        // Панель импорта Inpars
        document.getElementById('loadInparsListingsBtn')?.addEventListener('click', () => {
            this.loadInparsListings();
        });

        // Сворачивание панели Inpars
        document.getElementById('inparsPanelHeader')?.addEventListener('click', () => {
            this.toggleInparsPanel();
        });

        // Сворачивание таблицы адресов
        document.getElementById('addressTableHeader')?.addEventListener('click', () => {
            this.toggleAddressTable();
        });

        // Модальное окно деталей объявления
        document.getElementById('closeModalBtn')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('closeModalBtn2')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('openListingBtn')?.addEventListener('click', () => {
            this.openCurrentListing();
        });

        // Модальное окно редактирования области
        document.getElementById('editAreaForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAreaEdit();
        });

        document.getElementById('cancelEditArea')?.addEventListener('click', () => {
            this.closeEditAreaModal();
        });

        // Кнопки открытия ссылок в модальном окне редактирования области
        document.getElementById('openAvitoBtn')?.addEventListener('click', () => {
            this.openAvitoFilter();
        });

        document.getElementById('openCianBtn')?.addEventListener('click', () => {
            this.openCianFilter();
        });

        // Обработчики изменения URL-ов для активации/деактивации кнопок
        document.getElementById('editAvitoUrl')?.addEventListener('input', () => {
            this.updateFilterButtons();
        });

        document.getElementById('editCianUrl')?.addEventListener('input', () => {
            this.updateFilterButtons();
        });

        // Добавление адреса
        document.getElementById('addAddressBtn')?.addEventListener('click', () => {
            this.addAddress();
        });

        // Модальное окно редактирования адреса
        document.getElementById('editAddressForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAddressEdit();
        });

        document.getElementById('cancelEditAddress')?.addEventListener('click', () => {
            this.closeEditAddressModal();
        });

        // Закрытие модального окна при клике на фон
        document.getElementById('editAddressModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'editAddressModal') {
                this.closeEditAddressModal();
            }
        });

        // Обработчики кнопок в popup и таблице через делегирование событий
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

        // Обработчики для кнопок в popup объявлений
        document.addEventListener('click', (e) => {
            // Кнопка "Открыть" для объявления
            if (e.target.classList.contains('view-listing-details')) {
                const listingId = e.target.getAttribute('data-listing-id');
                if (listingId) {
                    this.showListingDetails(listingId);
                }
                return;
            }
        });

        // Обработчик изменения select материала стен
        document.getElementById('editWallMaterial')?.addEventListener('change', () => {
            this.updateWallMaterialButton();
        });

        // Кнопка добавления/редактирования материала стен
        document.getElementById('wallMaterialActionBtn')?.addEventListener('click', () => {
            const select = document.getElementById('editWallMaterial');
            if (select.value) {
                // Редактирование существующего материала
                this.showEditWallMaterialModal(select.value);
            } else {
                // Добавление нового материала
                this.showWallMaterialModal();
            }
        });

        // Кнопки модального окна материалов стен
        document.getElementById('cancelWallMaterial')?.addEventListener('click', () => {
            this.hideWallMaterialModal();
        });

        document.getElementById('saveWallMaterial')?.addEventListener('click', () => {
            this.saveWallMaterial();
        });

        // Закрытие модального окна по клику вне его
        document.getElementById('wallMaterialModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'wallMaterialModal') {
                this.hideWallMaterialModal();
            }
        });

        // ===== ОБРАБОТЧИКИ ДЛЯ СЕРИЙ ДОМОВ =====

        // Обработчик изменения select серии дома
        document.getElementById('editHouseSeries')?.addEventListener('change', () => {
            this.updateHouseSeriesButton();
        });

        // Кнопка добавления/редактирования серии дома
        document.getElementById('houseSeriesActionBtn')?.addEventListener('click', () => {
            const select = document.getElementById('editHouseSeries');
            if (select.value) {
                // Редактирование существующей серии
                this.showEditHouseSeriesModal(select.value);
            } else {
                // Добавление новой серии
                this.showHouseSeriesModal();
            }
        });

        // Кнопки модального окна серий домов
        document.getElementById('cancelHouseSeries')?.addEventListener('click', () => {
            this.hideHouseSeriesModal();
        });

        document.getElementById('saveHouseSeries')?.addEventListener('click', () => {
            this.saveHouseSeries();
        });

        // Закрытие модального окна по клику вне его
        document.getElementById('houseSeriesModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'houseSeriesModal') {
                this.hideHouseSeriesModal();
            }
        });

        // ===== ОБРАБОТЧИКИ ДЛЯ МАТЕРИАЛОВ ПЕРЕКРЫТИЙ =====

        // Обработчик изменения select материала перекрытий
        document.getElementById('editCeilingMaterial')?.addEventListener('change', () => {
            this.updateCeilingMaterialButton();
        });

        // Кнопка добавления/редактирования материала перекрытий
        document.getElementById('ceilingMaterialActionBtn')?.addEventListener('click', () => {
            const select = document.getElementById('editCeilingMaterial');
            if (select.value) {
                // Редактирование существующего материала
                this.showEditCeilingMaterialModal(select.value);
            } else {
                // Добавление нового материала
                this.showCeilingMaterialModal();
            }
        });

        // Кнопки модального окна материалов перекрытий
        document.getElementById('cancelCeilingMaterial')?.addEventListener('click', () => {
            this.hideCeilingMaterialModal();
        });

        document.getElementById('saveCeilingMaterial')?.addEventListener('click', () => {
            this.saveCeilingMaterial();
        });

        // Закрытие модального окна по клику вне его
        document.getElementById('ceilingMaterialModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'ceilingMaterialModal') {
                this.hideCeilingMaterialModal();
            }
        });

        // ===== ОБРАБОТЧИКИ ДЛЯ КНОПОК ФИЛЬТРОВ КАРТЫ =====

        // Обработчики кнопок фильтров над картой
        document.getElementById('filterByYear')?.addEventListener('click', () => {
            this.toggleMapFilter('year');
        });

        document.getElementById('filterBySeries')?.addEventListener('click', () => {
            this.toggleMapFilter('series');
        });

        document.getElementById('filterByFloors')?.addEventListener('click', () => {
            this.toggleMapFilter('floors');
        });

        document.getElementById('filterByObjects')?.addEventListener('click', () => {
            this.toggleMapFilter('objects');
        });

        document.getElementById('filterByListings')?.addEventListener('click', () => {
            this.toggleMapFilter('listings');
        });

        // ===== ОБРАБОТЧИКИ ДЛЯ ТАБЛИЦЫ ДУБЛЕЙ =====

        // Фильтр статусов дублей
        document.getElementById('duplicatesStatusFilter')?.addEventListener('change', () => {
            this.loadDuplicatesTable();
        });

        // Выбор всех элементов в таблице дублей
        document.getElementById('selectAllDuplicates')?.addEventListener('change', (e) => {
            this.selectAllDuplicates(e.target.checked);
        });

        // Очистка выбора
        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
            this.clearDuplicatesSelection();
        });

        // Кнопки операций с дублями
        document.getElementById('mergeDuplicatesBtn')?.addEventListener('click', () => {
            this.mergeDuplicates();
        });

        document.getElementById('splitDuplicatesBtn')?.addEventListener('click', () => {
            this.splitDuplicates();
        });


        // Обработчики фильтров для применения
        document.getElementById('processingAddressFilter')?.addEventListener('change', () => {
            this.applyProcessingFilters();
        });

        document.getElementById('processingPropertyTypeFilter')?.addEventListener('change', () => {
            this.applyProcessingFilters();
        });

        document.getElementById('processingFloorFilter')?.addEventListener('input', () => {
            this.applyProcessingFilters();
        });

    }

    /**
     * Привязка событий для DataTables
     */
    bindDataTableEvents() {
        // Обработчик "Выбрать все" для таблицы дублей
        $(document).on('change', '#selectAllDuplicates', (e) => {
            this.selectAllDuplicates(e.target.checked);
        });

        // Обработчики кнопок фильтра обработки в таблице дублей
        $(document).on('click', '.processing-filter-btn', (e) => {
            const button = e.currentTarget;
            const rowId = button.dataset.rowId;
            const rowType = button.dataset.rowType;
            this.openProcessingFilter(rowId, rowType);
        });

        // Обработчики кнопок удаления активных фильтров
        $(document).on('click', '.remove-filter-btn', (e) => {
            const button = e.currentTarget;
            const filterType = button.dataset.filterType;
            this.removeActiveFilter(filterType);
        });

        // Обработчик кликов по адресам в таблице дублей
        $(document).on('click', '.clickable-address', (e) => {
            const listingId = e.currentTarget.dataset.listingId;
            if (listingId) {
                this.showListingDetails(listingId);
            }
        });
    }

    /**
     * Загрузка статистики области
     */
    async loadAreaStats() {
        try {
            // Загружаем адреса в области
            const addresses = await this.getAddressesInArea();

            // Считаем объекты и объявления в области
            let objectsCount = 0;
            let listingsCount = 0;

            if (addresses.length > 0) {
                const addressIds = addresses.map(addr => addr.id);

                const listings = await Promise.all(
                    addressIds.map(id => db.getListingsByAddress(id))
                );

                // УДАЛЕН: подсчет объектов
                listingsCount = listings.flat().length;
            }

            // Получаем объявления, которые попадают в полигон области
            const areaListings = await this.getListingsInArea();

            // Вычисляем площадь полигона области (если есть)
            let areaSize = '-';
            if (this.currentArea.polygon && this.currentArea.polygon.length > 0) {
                try {
                    // Простая формула для вычисления площади полигона (приблизительно)
                    let area = 0;
                    const polygon = this.currentArea.polygon;
                    for (let i = 0; i < polygon.length; i++) {
                        const j = (i + 1) % polygon.length;
                        area += polygon[i].lat * polygon[j].lng;
                        area -= polygon[j].lat * polygon[i].lng;
                    }
                    area = Math.abs(area) / 2;
                    areaSize = `≈ ${area.toFixed(3)} км²`;
                } catch (error) {
                    console.warn('Ошибка вычисления площади:', error);
                }
            }

            // Обновляем статистику
            document.getElementById('segmentsCount').textContent = areaSize;
            document.getElementById('addressesCount').textContent = addresses.length;
            document.getElementById('objectsCount').textContent = objectsCount;
            document.getElementById('listingsCount').textContent = Math.max(listingsCount, areaListings.length);

        } catch (error) {
            console.error('Error loading area stats:', error);
        }
    }

    /**
     * Получение адресов в области
     */
    async getAddressesInArea() {
        if (!this.currentArea.polygon || this.currentArea.polygon.length === 0) {
            console.warn('Полигон области отсутствует или пуст');
            return [];
        }

        try {
            const allAddresses = await db.getAddresses();
            //console.log(`🔍 Диагностика getAddressesInArea:`);
            //console.log(`📊 Всего адресов в БД: ${allAddresses.length}`);
            //console.log(`🗺️ Полигон области (${this.currentArea.polygon.length} точек):`, this.currentArea.polygon);
            
            // Проверяем формат адресов
            if (allAddresses.length > 0) {
                //console.log(`📋 Пример первого адреса:`, allAddresses[0]);
            }
            
            // Используем пространственный индекс для быстрого поиска адресов
            await this.ensureAddressesIndex(allAddresses);
            
            const addressesInArea = this.spatialManager.findInArea('addresses', this.currentArea.polygon);
            //console.log(`✅ Адресов найдено в области: ${addressesInArea.length}`);
            
            if (addressesInArea.length > 0) {
                //console.log(`📋 Пример найденного адреса:`, addressesInArea[0]);
            }
            
            // Дополнительная проверка: мануальная фильтрация для сравнения
            //console.log(`🔬 Выполняем мануальную проверку для сравнения...`);
            const manualCheck = allAddresses.filter(address => {
                // Проверяем разные форматы координат
                let coords = null;
                if (address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                    coords = address.coordinates;
                } else if (address.coordinates && address.coordinates.lat && address.coordinates.lon) {
                    coords = { lat: address.coordinates.lat, lng: address.coordinates.lon };
                } else if (address.lat && address.lng) {
                    coords = { lat: address.lat, lng: address.lng };
                }
                
                if (!coords) {
                    //console.warn(`⚠️ Адрес без координат:`, address);
                    return false;
                }
                
                try {
                    const isInside = this.geoUtils.isPointInPolygon(coords, this.currentArea.polygon);
                    if (isInside) {
                        //console.log(`  ✓ ${address.address} (${coords.lat}, ${coords.lng}) - внутри полигона`);
                    } else {
                        //console.log(`  ✗ ${address.address} (${coords.lat}, ${coords.lng}) - вне полигона`);
                    }
                    return isInside;
                } catch (error) {
                    console.error('Error checking point in polygon:', error);
                    return false;
                }
            });
            //console.log(`🧪 Мануальная проверка найдено: ${manualCheck.length} адресов`);
            
            return addressesInArea;
        } catch (error) {
            console.error('Error getting addresses in area:', error);
            return [];
        }
    }

    /**
     * Обеспечение наличия актуального пространственного индекса для адресов
     */
    async ensureAddressesIndex(addresses) {
        try {
            console.log(`🔧 Создание индекса для ${addresses.length} адресов`);
            
            // Принудительно удаляем старый индекс для пересоздания с новой логикой
            if (this.spatialManager.hasIndex('addresses')) {
                console.log(`🗑️ Удаляем существующий индекс адресов`);
                this.spatialManager.removeIndex('addresses');
            }

            // Анализируем координаты адресов перед созданием индекса
            let validAddresses = 0;
            let invalidAddresses = 0;
            
            const getCoordinatesFunction = (address) => {
                // Поддерживаем различные форматы координат
                let coords = null;
                
                if (address.coordinates) {
                    coords = {
                        lat: address.coordinates.lat || address.coordinates.latitude,
                        lng: address.coordinates.lng || address.coordinates.lon || address.coordinates.longitude
                    };
                }
                // Прямые координаты в объекте
                else if (address.lat || address.latitude) {
                    coords = {
                        lat: address.lat || address.latitude,
                        lng: address.lng || address.lon || address.longitude
                    };
                }
                
                if (coords && coords.lat && coords.lng && !isNaN(coords.lat) && !isNaN(coords.lng)) {
                    validAddresses++;
                    return coords;
                } else {
                    invalidAddresses++;
                    return null;
                }
            };

            // Создаем новый индекс с исправленной функцией извлечения координат
            if (!this.spatialManager.hasIndex('addresses')) {
                console.log(`🏗️ Создаем новый индекс адресов`);
                await this.spatialManager.createIndex(
                    'addresses',
                    addresses,
                    getCoordinatesFunction
                );
            }
            
            console.log(`✅ Индекс создан: ${validAddresses} валидных адресов, ${invalidAddresses} невалидных`);
            console.log(`📊 Статистика индексов:`, this.spatialManager.getIndexesStats());
            
        } catch (error) {
            console.error('Error ensuring addresses index:', error);
        }
    }

    /**
     * Получает настройки обновления из chrome.storage
     */
    async getUpdateSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['neocenka_settings'], (result) => {
                const settings = result.neocenka_settings || {};
                resolve(settings);
            });
        });
    }

    /**
     * Получение объявлений в области
     */
    async getListingsInArea() {
        if (!this.currentArea.polygon || this.currentArea.polygon.length === 0) {
            debugLogger.log('Полигон области отсутствует или пуст');
            return [];
        }

        try {
            const allListings = await db.getListings();
            debugLogger.log(`Всего объявлений в БД: ${allListings.length}`);
            debugLogger.log(`Полигон области (${this.currentArea.polygon.length} точек):`, this.currentArea.polygon);
            
            
            
            const listingsWithCoords = allListings.filter(listing => {
                // Проверяем различные форматы координат
                const hasCoordinatesObject = listing.coordinates && 
                                           (listing.coordinates.lat || listing.coordinates.latitude) && 
                                           (listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude);
                const hasDirectCoords = (listing.lat || listing.latitude) && 
                                      (listing.lng || listing.lon || listing.longitude);
                return hasCoordinatesObject || hasDirectCoords;
            });
            
            
            // Диагностика: границы полигона и объявлений
            if (this.currentArea.polygon && this.currentArea.polygon.length > 0) {
                const polygonBounds = this.geoUtils.getPolygonBounds(this.currentArea.polygon);
                debugLogger.log('Границы полигона области:', polygonBounds);
                
                if (listingsWithCoords.length > 0) {
                    const listingBounds = {
                        minLat: Math.min(...listingsWithCoords.map(l => parseFloat(l.coordinates.lat))),
                        maxLat: Math.max(...listingsWithCoords.map(l => parseFloat(l.coordinates.lat))),
                        minLng: Math.min(...listingsWithCoords.map(l => parseFloat(l.coordinates.lng))),
                        maxLng: Math.max(...listingsWithCoords.map(l => parseFloat(l.coordinates.lng)))
                    };
                    debugLogger.log('Границы объявлений:', listingBounds);
                    
                    // Проверяем пересечение границ
                    const boundsOverlap = !(
                        polygonBounds.maxLat < listingBounds.minLat ||
                        polygonBounds.minLat > listingBounds.maxLat ||
                        polygonBounds.maxLng < listingBounds.minLng ||
                        polygonBounds.minLng > listingBounds.maxLng
                    );
                    debugLogger.log('Пересекаются ли границы полигона и объявлений:', boundsOverlap);
                }
            }

            // Проверяем валидность полигона
            if (!this.geoUtils.isValidPolygon(this.currentArea.polygon)) {
                console.error('Невалидный полигон области');
                return [];
            }


            // Используем пространственный индекс для быстрого поиска
            await this.ensureListingsIndex(allListings);
            
            const listingsInArea = this.spatialManager.findInArea('listings', this.currentArea.polygon);

            debugLogger.log(`Объявлений в области: ${listingsInArea.length}`);

            // Если результатов нет, выводим диагностическую информацию
            if (listingsInArea.length === 0) {
                const bounds = this.geoUtils.getPolygonBounds(this.currentArea.polygon);
                const center = this.geoUtils.getPolygonCenter(this.currentArea.polygon);
                const area = this.geoUtils.getPolygonArea(this.currentArea.polygon);

                debugLogger.log('ДИАГНОСТИКА: Ни одно объявление не попало в полигон');
                debugLogger.log('Границы полигона:', bounds);
                debugLogger.log('Центр полигона:', center);
                debugLogger.log(`Площадь полигона: ${(area / 1000000).toFixed(2)} км²`);

                // Проверяем несколько объявлений вручную для отладки
                const listingsWithCoords = allListings.filter(listing => {
                    const hasCoordinatesObject = listing.coordinates && 
                                               (listing.coordinates.lat || listing.coordinates.latitude) && 
                                               (listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude);
                    const hasDirectCoords = (listing.lat || listing.latitude) && 
                                          (listing.lng || listing.lon || listing.longitude);
                    return hasCoordinatesObject || hasDirectCoords;
                }).slice(0, 3);

                if (listingsWithCoords.length > 0) {
                    debugLogger.log('Тестируем первые 3 объявления:');
                    listingsWithCoords.forEach(listing => {
                        // Нормализуем координаты для тестирования
                        let normalizedCoords = null;
                        if (listing.coordinates) {
                            normalizedCoords = {
                                lat: listing.coordinates.lat || listing.coordinates.latitude,
                                lng: listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude
                            };
                        } else if (listing.lat || listing.latitude) {
                            normalizedCoords = {
                                lat: listing.lat || listing.latitude,
                                lng: listing.lng || listing.lon || listing.longitude
                            };
                        }
                        
                        const isInside = normalizedCoords ? this.geoUtils.isPointInPolygon(normalizedCoords, this.currentArea.polygon) : false;
                        debugLogger.log(`Объявление ${listing.id}:`, {
                            originalCoords: listing.coordinates,
                            normalizedCoords: normalizedCoords,
                            isInside: isInside,
                            title: listing.title || 'Без названия',
                            source: listing.source
                        });
                    });
                }
            }

            return listingsInArea;
        } catch (error) {
            console.error('Error getting listings in area:', error);
            return [];
        }
    }

    /**
     * Обеспечение наличия актуального пространственного индекса для объявлений
     */
    async ensureListingsIndex(listings) {
        try {
            // Принудительно удаляем старый индекс для пересоздания с новой логикой
            if (this.spatialManager.hasIndex('listings')) {
                this.spatialManager.removeIndex('listings');
            }

            // Создаем новый индекс с исправленной функцией извлечения координат
            if (!this.spatialManager.hasIndex('listings')) {
                await this.spatialManager.createIndex(
                    'listings',
                    listings,
                    (listing) => {
                        // Поддерживаем различные форматы координат
                        let coords = null;
                        if (listing.coordinates) {
                            coords = {
                                lat: listing.coordinates.lat || listing.coordinates.latitude,
                                lng: listing.coordinates.lng || listing.coordinates.lon || listing.coordinates.longitude
                            };
                        }
                        // Прямые координаты в объекте
                        else if (listing.lat || listing.latitude) {
                            coords = {
                                lat: listing.lat || listing.latitude,
                                lng: listing.lng || listing.lon || listing.longitude
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
     * Загрузка адресов в таблицу
     */
    async loadAddresses() {
        try {
            console.log(`📋 Загрузка адресов в таблицу...`);
            const addresses = await this.getAddressesInArea();
            console.log(`📊 Адресов для отображения: ${addresses.length}`);

            // Добавляем счетчики объявлений для каждого адреса
            for (const address of addresses) {
                const listings = await db.getListingsByAddress(address.id);

                address.objects_count = 0; // УДАЛЕН: подсчет объектов
                address.listings_count = listings.length;
            }

            // Сохраняем адреса в переменную класса для использования в других функциях
            this.addresses = addresses;

            // Очищаем и заполняем таблицу
            if (this.addressesTable) {
                console.log(`🔄 Обновляем таблицу адресов`);
                this.addressesTable.clear();
                this.addressesTable.rows.add(addresses); // Раскомментировал эту строку!
                this.addressesTable.draw();
                console.log(`✅ Таблица обновлена`);
            } else {
                console.warn(`⚠️ Таблица адресов не инициализирована`);
            }

        } catch (error) {
            console.error('Error loading addresses:', error);
            this.showError('Ошибка загрузки адресов: ' + error.message);
        }
    }


    /**
     * Открытие модального окна редактирования области
     */
    openEditAreaModal() {
        document.getElementById('editAreaName').value = this.currentArea.name;
        document.getElementById('editAvitoUrl').value = this.currentArea.avito_filter_url || '';
        document.getElementById('editCianUrl').value = this.currentArea.cian_filter_url || '';

        // Обновляем состояние кнопок
        this.updateFilterButtons();

        document.getElementById('editAreaModal').classList.remove('hidden');
    }

    /**
     * Закрытие модального окна редактирования области
     */
    closeEditAreaModal() {
        document.getElementById('editAreaModal').classList.add('hidden');
    }

    /**
     * Сохранение изменений области
     */
    async saveAreaEdit() {
        try {
            const formData = new FormData(document.getElementById('editAreaForm'));

            this.currentArea.name = formData.get('name');
            this.currentArea.avito_filter_url = formData.get('avito_filter_url');
            this.currentArea.cian_filter_url = formData.get('cian_filter_url');

            await this.saveAreaChanges();

            // Обновляем заголовок
            document.getElementById('areaTitle').textContent = this.currentArea.name;
            this.setBreadcrumbs();

            this.closeEditAreaModal();
            this.showSuccess('Область успешно обновлена');

        } catch (error) {
            console.error('Error saving area edit:', error);
            this.showError('Ошибка сохранения: ' + error.message);
        }
    }

    /**
     * Заглушки для методов обработки данных
     */
    async loadAddressesFromAPI() {
        console.log(`🚀 === НАЧАЛО ЗАГРУЗКИ АДРЕСОВ ИЗ OSM ===`);
        
        if (!this.currentArea || !this.currentArea.polygon) {
            console.error(`❌ Область не имеет полигона для загрузки адресов`);
            this.showError('Область не имеет полигона для загрузки адресов');
            return;
        }

        console.log(`✅ Полигон области найден, точек: ${this.currentArea.polygon.length}`);

        try {
            // Создаем экземпляр OSM API
            console.log(`🔧 Создаем экземпляр OSM API...`);
            const osmAPI = new OSMOverpassAPI();
            
            // Валидируем полигон
            console.log(`🔍 Валидируем полигон...`);
            const validation = osmAPI.validatePolygon(this.currentArea.polygon);
            console.log(`📊 Результат валидации:`, validation);
            
            if (!validation.valid) {
                console.error(`❌ Полигон невалиден: ${validation.error}`);
                this.showError(`Некорректный полигон: ${validation.error}`);
                return;
            }

            // Проверяем статус Overpass API
            console.log(`🌐 Проверяем статус Overpass API...`);
            this.showInfo('Проверка доступности Overpass API...');
            
            const apiStatus = await osmAPI.getAPIStatus();
            console.log(`📡 Статус API:`, apiStatus);
            
            if (!apiStatus.available) {
                console.error(`❌ Overpass API недоступен:`, apiStatus);
                this.showError('Overpass API недоступен. Попробуйте позже.');
                return;
            }

            console.log(`✅ API доступен, начинаем загрузку...`);
            this.showInfo('Загрузка адресов из OpenStreetMap...');
            
            // Прогресс для пользователя
            let progressDialog = null;
            
            // Создаем модальное окно прогресса
            console.log(`🖥️ Создаем модальное окно прогресса...`);
            progressDialog = this.createProgressModal('Загрузка адресов OSM');
            
            // Колбэк для отслеживания прогресса
            const progressCallback = (message, percent) => {
                console.log(`📈 Прогресс: ${percent}% - ${message}`);
                if (progressDialog) {
                    progressDialog.updateProgress(percent, message);
                }
            };

            // Загружаем адреса
            console.log(`🌍 Начинаем загрузку адресов из OSM...`);
            const osmAddresses = await osmAPI.loadAddressesForArea(this.currentArea, progressCallback);
            console.log(`📦 Получено адресов: ${osmAddresses ? osmAddresses.length : 'null'}`);

            // Закрываем модальное окно прогресса
            if (progressDialog) {
                progressDialog.close();
            }

            if (osmAddresses.length === 0) {
                this.showInfo('В указанной области не найдено адресов OSM');
                return;
            }

            // Сохраняем адреса в базу данных
            this.showInfo(`Сохранение ${osmAddresses.length} адресов...`);
            
            let savedCount = 0;
            let skippedCount = 0;
            
            for (const address of osmAddresses) {
                try {
                    // Проверяем, есть ли уже такой адрес
                    const existingAddresses = await db.getAll('addresses');
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
                    address.map_area_id = this.currentAreaId;
                    
                    // Сохраняем в базу
                    await db.add('addresses', address);
                    savedCount++;
                    
                } catch (error) {
                    console.error('Error saving address:', error);
                }
            }

            // Обновляем карту и статистику
            await this.loadAreaStats();
            await this.loadAddresses();
            await this.loadAddressesOnMap();

            // Показываем результат
            let resultMessage = `Загрузка завершена: ${savedCount} новых адресов`;
            if (skippedCount > 0) {
                resultMessage += `, ${skippedCount} пропущено (дубли)`;
            }
            
            this.showSuccess(resultMessage);

        } catch (error) {
            console.error('Error loading addresses from OSM:', error);
            this.showError('Ошибка загрузки адресов: ' + error.message);
        }
    }

    /**
     * Создание модального окна прогресса
     */
    createProgressModal(title) {
        // Создаем элементы модального окна
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 overflow-y-auto';
        modal.innerHTML = `
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div class="sm:flex sm:items-start">
                            <div class="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">
                                    ${title}
                                </h3>
                                <div class="space-y-4">
                                    <div class="w-full bg-gray-200 rounded-full h-3">
                                        <div id="osmProgressBar" class="bg-blue-600 h-3 rounded-full transition-all duration-300" style="width: 0%"></div>
                                    </div>
                                    <div id="osmProgressText" class="text-sm text-gray-600">
                                        Инициализация...
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        return {
            updateProgress: (percent, message) => {
                const progressBar = modal.querySelector('#osmProgressBar');
                const progressText = modal.querySelector('#osmProgressText');
                
                if (progressBar) {
                    progressBar.style.width = percent + '%';
                }
                if (progressText) {
                    progressText.textContent = message;
                }
            },
            close: () => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }
        };
    }

    async parseListings() {
        if (this.processing.parsing) {
            this.showInfo('Парсинг уже выполняется');
            return;
        }

        if (!this.currentArea.avito_filter_url && !this.currentArea.cian_filter_url) {
            this.showError('Не указаны URL фильтров для парсинга');
            return;
        }

        try {
            this.processing.parsing = true;
            debugLogger.log('Начинаем парсинг объявлений для области:', this.currentArea.name);
            this.updateProgressBar('parsing', 0, 'Начало парсинга...');

            let totalParsed = 0;
            let totalErrors = 0;

            // Парсинг Avito если есть URL
            if (this.currentArea.avito_filter_url) {
                this.updateProgressBar('parsing', 20, 'Парсинг Avito...');
                debugLogger.log('🚀 Начинаем парсинг Avito для области');
                try {
                    const avitoResult = await this.parseAvitoForArea();
                    debugLogger.log('✅ Парсинг Avito завершен:', avitoResult);
                    totalParsed += avitoResult.parsed;
                    totalErrors += avitoResult.errors;
                    this.updateProgressBar('parsing', 50, 'Парсинг Avito завершен');
                } catch (error) {
                    debugLogger.error('❌ Ошибка парсинга Avito:', error);
                    console.error('Ошибка парсинга Avito:', error);
                    totalErrors++;
                }
            }

            // Парсинг Cian если есть URL
            if (this.currentArea.cian_filter_url) {
                this.updateProgressBar('parsing', 60, 'Парсинг Cian...');
                try {
                    const cianResult = await this.parseCianForArea();
                    totalParsed += cianResult.parsed;
                    totalErrors += cianResult.errors;
                } catch (error) {
                    console.error('Ошибка парсинга Cian:', error);
                    totalErrors++;
                }
            }

            debugLogger.log('🏁 Завершаем парсинг. Всего обработано:', totalParsed, 'ошибок:', totalErrors);
            this.updateProgressBar('parsing', 100, 'Парсинг завершен');
            
            // Обновляем статистику и карту
            debugLogger.log('📊 Обновляем статистику и карту');
            await this.loadAreaStats();
            await this.loadAddresses();
            await this.refreshMapData();

            this.showSuccess(`Парсинг завершен. Обработано: ${totalParsed}, ошибок: ${totalErrors}`);
            debugLogger.log('✅ Парсинг полностью завершен');

        } catch (error) {
            console.error('Error during parsing:', error);
            this.showError('Ошибка парсинга: ' + error.message);
        } finally {
            this.processing.parsing = false;
            this.hideProgressBar('parsing');
        }
    }

    async updateListings() {
        if (this.processing.updating) {
            this.showInfo('Обновление уже выполняется');
            return;
        }

        try {
            this.processing.updating = true;
            debugLogger.log('Начинаем обновление объявлений для области:', this.currentArea.name);
            this.updateProgressBar('updating', 0, 'Поиск объявлений...');

            // Получаем настройки обновления
            const settings = await this.getUpdateSettings();
            const updateIntervalDays = settings.update_days || 7;
            
            debugLogger.log(`Интервал обновления: ${updateIntervalDays} дней`);

            // Получаем все объявления в области
            const allAreaListings = await this.getListingsInArea();
            
            if (allAreaListings.length === 0) {
                this.showInfo('В области нет объявлений для обновления');
                return;
            }

            // Фильтруем объявления по статусу и дате последнего обновления
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - updateIntervalDays);
            
            const areaListings = allAreaListings.filter(listing => {
                // Обновляем только активные объявления
                if (listing.status !== 'active') {
                    debugLogger.log(`Пропускаем объявление ${listing.id}: статус "${listing.status}" (не активное)`);
                    return false;
                }
                
                // Проверяем дату последнего обновления
                if (!listing.updated_at) {
                    return true; // Если нет даты обновления, обновляем
                }
                
                const lastUpdate = new Date(listing.updated_at);
                const needsUpdate = lastUpdate < cutoffDate;
                
                if (!needsUpdate) {
                    debugLogger.log(`Пропускаем объявление ${listing.id}: обновлено ${lastUpdate.toLocaleDateString()}`);
                }
                
                return needsUpdate;
            });

            if (areaListings.length === 0) {
                const activeListings = allAreaListings.filter(l => l.status === 'active').length;
                this.showInfo(`Нет объявлений для обновления. Активных: ${activeListings} из ${allAreaListings.length}, все обновлены в течение ${updateIntervalDays} дней`);
                return;
            }

            this.updateProgressBar('updating', 10, `Найдено ${areaListings.length} активных объявлений для обновления (из ${allAreaListings.length} всего)`);

            let updatedCount = 0;
            let errorCount = 0;
            const batchSize = 5; // Обрабатываем по 5 объявлений одновременно

            // Разбиваем на батчи для избежания перегрузки
            for (let i = 0; i < areaListings.length; i += batchSize) {
                const batch = areaListings.slice(i, i + batchSize);
                const progress = 10 + ((i / areaListings.length) * 80);
                
                this.updateProgressBar('updating', progress, 
                    `Обновляем объявления ${i + 1}-${Math.min(i + batchSize, areaListings.length)} из ${areaListings.length}`);

                // Обрабатываем батч
                const batchPromises = batch.map(listing => this.updateSingleListing(listing));
                const batchResults = await Promise.allSettled(batchPromises);

                // Подсчитываем результаты
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        updatedCount++;
                    } else {
                        errorCount++;
                        debugLogger.error('Ошибка обновления объявления:', result.reason || result.value?.error);
                    }
                });

                // Небольшая задержка между батчами
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            this.updateProgressBar('updating', 100, 'Обновление завершено');
            
            // Обновляем статистику и карту
            await this.loadAreaStats();
            await this.loadAddresses();
            await this.refreshMapData();

            const skippedCount = allAreaListings.length - areaListings.length;
            let resultMessage = `Обновление завершено. Обновлено: ${updatedCount}`;
            if (errorCount > 0) {
                resultMessage += `, ошибок: ${errorCount}`;
            }
            if (skippedCount > 0) {
                resultMessage += `, пропущено: ${skippedCount} (неактивные или недавно обновлены)`;
            }
            
            this.showSuccess(resultMessage);

        } catch (error) {
            console.error('Error during updating:', error);
            this.showError('Ошибка обновления: ' + error.message);
        } finally {
            this.processing.updating = false;
            this.hideProgressBar('updating');
        }
    }

    /**
     * Обновление одного объявления
     */
    async updateSingleListing(listing) {
        try {
            // Проверяем, что объявление имеет URL для обновления
            if (!listing.url) {
                return { success: false, error: 'URL объявления отсутствует' };
            }

            debugLogger.log('Обновляем объявление:', listing.url);

            // Создаем вкладку для обновления объявления
            const tab = await this.createTabWithRetry(listing.url, 2);
            
            try {
                // Ждем загрузки страницы и инжектируем content script
                await this.waitForPageLoad(tab.id);
                await this.injectContentScript(tab.id);
                
                // Запрашиваем обновленные данные объявления
                const response = await this.waitForContentScriptAndParse(tab.id, {
                    action: 'parseCurrentListing',
                    areaId: this.currentAreaId,
                    existingListingId: listing.id
                });

                // Закрываем вкладку
                try {
                    chrome.tabs.remove(tab.id);
                } catch (closeError) {
                    debugLogger.log('Не удалось закрыть вкладку:', closeError);
                }

                if (response && response.success && response.data) {
                    // Сохраняем обновленные данные
                    const updatedListing = {
                        ...listing,
                        ...response.data,
                        id: listing.id, // Сохраняем оригинальный ID
                        created_at: listing.created_at, // Сохраняем дату создания
                        updated_at: new Date()
                    };

                    // Проверяем изменение цены
                    if (listing.price !== response.data.price) {
                        if (!updatedListing.price_history) {
                            updatedListing.price_history = listing.price_history || [];
                        }
                        updatedListing.price_history.push({
                            date: new Date(),
                            old_price: listing.price,
                            new_price: response.data.price
                        });
                    }

                    await db.update('listings', updatedListing);
                    return { success: true, updated: true };
                } else {
                    // Если объявление не найдено, помечаем как архивное
                    listing.status = 'archived';
                    listing.last_seen = new Date();
                    listing.updated_at = new Date();
                    await db.update('listings', listing);
                    
                    return { success: true, archived: true };
                }

            } catch (error) {
                // Закрываем вкладку в случае ошибки
                try {
                    chrome.tabs.remove(tab.id);
                } catch (closeError) {
                    debugLogger.log('Не удалось закрыть вкладку после ошибки:', closeError);
                }
                throw error;
            }

        } catch (error) {
            debugLogger.error('Ошибка обновления объявления:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Загрузка материалов стен в select
     */
    async loadWallMaterials() {
        try {
            const materials = await db.getAll('wall_materials');
            const select = document.getElementById('editWallMaterial');
            
            // Сохраняем текущее значение
            const currentValue = select.value;
            
            // Очищаем существующие опции (кроме первой)
            select.innerHTML = '<option value="">Выберите материал...</option>';
            
            // Добавляем материалы
            materials.forEach(material => {
                const option = document.createElement('option');
                option.value = material.id;
                option.textContent = material.name;
                select.appendChild(option);
            });
            
            // Восстанавливаем значение
            if (currentValue) {
                select.value = currentValue;
            }
            
            // Обновляем кнопку
            this.updateWallMaterialButton();
            
        } catch (error) {
            console.error('Ошибка загрузки материалов стен:', error);
        }
    }

    /**
     * Обновление кнопки действия с материалом стен
     */
    updateWallMaterialButton() {
        const select = document.getElementById('editWallMaterial');
        const button = document.getElementById('wallMaterialActionBtn');
        
        if (select.value) {
            button.textContent = '✏️ Редактировать';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500';
        } else {
            button.textContent = '+ Добавить';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';
        }
    }

    /**
     * Показать модальное окно добавления материала стен
     */
    showWallMaterialModal() {
        document.getElementById('wallMaterialModal').classList.remove('hidden');
        document.querySelector('#wallMaterialModal .modal-title').textContent = 'Добавить материал стен';
        document.getElementById('wallMaterialName').focus();
    }

    /**
     * Показать модальное окно редактирования материала стен
     */
    async showEditWallMaterialModal(materialId) {
        try {
            const material = await db.get('wall_materials', materialId);
            if (!material) {
                this.showError('Материал не найден');
                return;
            }

            // Заполняем форму данными материала
            document.getElementById('wallMaterialId').value = material.id;
            document.getElementById('wallMaterialName').value = material.name;
            document.getElementById('wallMaterialColor').value = material.color;

            // Меняем заголовок модального окна
            document.querySelector('#wallMaterialModal .modal-title').textContent = 'Редактировать материал стен';
            
            // Показываем модальное окно
            document.getElementById('wallMaterialModal').classList.remove('hidden');
            document.getElementById('wallMaterialName').focus();
            
        } catch (error) {
            console.error('Ошибка загрузки материала для редактирования:', error);
            this.showError('Ошибка загрузки материала: ' + error.message);
        }
    }

    /**
     * Скрыть модальное окно материала стен
     */
    hideWallMaterialModal() {
        document.getElementById('wallMaterialModal').classList.add('hidden');
        document.getElementById('wallMaterialForm').reset();
        document.getElementById('wallMaterialId').value = '';
        document.getElementById('wallMaterialColor').value = '#3b82f6';
    }

    /**
     * Сохранить материал стен (создание или редактирование)
     */
    async saveWallMaterial() {
        try {
            const form = document.getElementById('wallMaterialForm');
            const formData = new FormData(form);
            
            const materialId = formData.get('id');
            const material = {
                name: formData.get('name').trim(),
                color: formData.get('color')
            };

            if (!material.name) {
                this.showError('Название материала обязательно');
                return;
            }

            // Проверяем уникальность названия (исключая редактируемый материал)
            const existingMaterials = await db.getAll('wall_materials');
            const duplicate = existingMaterials.find(m => 
                m.name.toLowerCase() === material.name.toLowerCase() && m.id !== materialId
            );

            if (duplicate) {
                this.showError('Материал с таким названием уже существует');
                return;
            }

            let savedMaterial;
            
            if (materialId) {
                // Редактирование существующего материала
                material.id = materialId;
                material.updated_at = new Date();
                savedMaterial = await db.update('wall_materials', material);
                this.showSuccess('Материал стен обновлен успешно');
            } else {
                // Создание нового материала
                savedMaterial = await db.add('wall_materials', material);
                this.showSuccess('Материал стен добавлен успешно');
            }
            
            // Обновляем select
            await this.loadWallMaterials();
            
            // Выбираем материал
            document.getElementById('editWallMaterial').value = savedMaterial.id;
            this.updateWallMaterialButton();
            
            // Закрываем модальное окно
            this.hideWallMaterialModal();
            
        } catch (error) {
            console.error('Ошибка сохранения материала стен:', error);
            this.showError('Ошибка сохранения материала: ' + error.message);
        }
    }

    // ===== МЕТОДЫ ДЛЯ СЕРИЙ ДОМОВ =====

    /**
     * Загрузка серий домов в select
     */
    async loadHouseSeries() {
        try {
            const series = await db.getAll('house_series');
            const select = document.getElementById('editHouseSeries');
            
            // Сохраняем текущее значение
            const currentValue = select.value;
            
            // Очищаем существующие опции (кроме первой)
            select.innerHTML = '<option value="">Выберите серию...</option>';
            
            // Добавляем серии
            series.forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.name;
                select.appendChild(option);
            });
            
            // Восстанавливаем значение
            if (currentValue) {
                select.value = currentValue;
            }
            
            // Обновляем кнопку
            this.updateHouseSeriesButton();
            
        } catch (error) {
            console.error('Ошибка загрузки серий домов:', error);
        }
    }

    /**
     * Обновление кнопки действия с серией дома
     */
    updateHouseSeriesButton() {
        const select = document.getElementById('editHouseSeries');
        const button = document.getElementById('houseSeriesActionBtn');
        
        if (select.value) {
            button.textContent = '✏️ Редактировать';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500';
        } else {
            button.textContent = '+ Добавить';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';
        }
    }

    /**
     * Показать модальное окно добавления серии дома
     */
    showHouseSeriesModal() {
        document.getElementById('houseSeriesModal').classList.remove('hidden');
        document.querySelector('#houseSeriesModal .modal-title').textContent = 'Добавить серию дома';
        document.getElementById('houseSeriesName').focus();
    }

    /**
     * Показать модальное окно редактирования серии дома
     */
    async showEditHouseSeriesModal(seriesId) {
        try {
            const series = await db.get('house_series', seriesId);
            if (!series) {
                this.showError('Серия дома не найдена');
                return;
            }

            // Заполняем форму данными серии
            document.getElementById('houseSeriesId').value = series.id;
            document.getElementById('houseSeriesName').value = series.name;

            // Меняем заголовок модального окна
            document.querySelector('#houseSeriesModal .modal-title').textContent = 'Редактировать серию дома';
            
            // Показываем модальное окно
            document.getElementById('houseSeriesModal').classList.remove('hidden');
            document.getElementById('houseSeriesName').focus();
            
        } catch (error) {
            console.error('Ошибка загрузки серии для редактирования:', error);
            this.showError('Ошибка загрузки серии: ' + error.message);
        }
    }

    /**
     * Скрыть модальное окно серии дома
     */
    hideHouseSeriesModal() {
        document.getElementById('houseSeriesModal').classList.add('hidden');
        document.getElementById('houseSeriesForm').reset();
        document.getElementById('houseSeriesId').value = '';
    }

    /**
     * Сохранить серию дома (создание или редактирование)
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
                this.showError('Название серии обязательно');
                return;
            }

            // Проверяем уникальность названия (исключая редактируемую серию)
            const existingSeries = await db.getAll('house_series');
            const duplicate = existingSeries.find(s => 
                s.name.toLowerCase() === series.name.toLowerCase() && s.id !== seriesId
            );

            if (duplicate) {
                this.showError('Серия с таким названием уже существует');
                return;
            }

            let savedSeries;
            
            if (seriesId) {
                // Редактирование существующей серии
                series.id = seriesId;
                series.updated_at = new Date();
                savedSeries = await db.update('house_series', series);
                this.showSuccess('Серия дома обновлена успешно');
            } else {
                // Создание новой серии
                savedSeries = await db.add('house_series', series);
                this.showSuccess('Серия дома добавлена успешно');
            }
            
            // Обновляем select
            await this.loadHouseSeries();
            
            // Выбираем серию
            document.getElementById('editHouseSeries').value = savedSeries.id;
            this.updateHouseSeriesButton();
            
            // Закрываем модальное окно
            this.hideHouseSeriesModal();
            
        } catch (error) {
            console.error('Ошибка сохранения серии дома:', error);
            this.showError('Ошибка сохранения серии: ' + error.message);
        }
    }

    // ===== МЕТОДЫ ДЛЯ МАТЕРИАЛОВ ПЕРЕКРЫТИЙ =====

    /**
     * Загрузка материалов перекрытий в select
     */
    async loadCeilingMaterials() {
        try {
            const materials = await db.getAll('ceiling_materials');
            const select = document.getElementById('editCeilingMaterial');
            
            // Сохраняем текущее значение
            const currentValue = select.value;
            
            // Очищаем существующие опции (кроме первой)
            select.innerHTML = '<option value="">Выберите материал...</option>';
            
            // Добавляем материалы
            materials.forEach(material => {
                const option = document.createElement('option');
                option.value = material.id;
                option.textContent = material.name;
                select.appendChild(option);
            });
            
            // Восстанавливаем значение
            if (currentValue) {
                select.value = currentValue;
            }
            
            // Обновляем кнопку
            this.updateCeilingMaterialButton();
            
        } catch (error) {
            console.error('Ошибка загрузки материалов перекрытий:', error);
        }
    }

    /**
     * Обновление кнопки действия с материалом перекрытий
     */
    updateCeilingMaterialButton() {
        const select = document.getElementById('editCeilingMaterial');
        const button = document.getElementById('ceilingMaterialActionBtn');
        
        if (select.value) {
            button.textContent = '✏️ Редактировать';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500';
        } else {
            button.textContent = '+ Добавить';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';
        }
    }

    /**
     * Показать модальное окно добавления материала перекрытий
     */
    showCeilingMaterialModal() {
        document.getElementById('ceilingMaterialModal').classList.remove('hidden');
        document.querySelector('#ceilingMaterialModal .modal-title').textContent = 'Добавить материал перекрытий';
        document.getElementById('ceilingMaterialName').focus();
    }

    /**
     * Показать модальное окно редактирования материала перекрытий
     */
    async showEditCeilingMaterialModal(materialId) {
        try {
            const material = await db.get('ceiling_materials', materialId);
            if (!material) {
                this.showError('Материал перекрытий не найден');
                return;
            }

            // Заполняем форму данными материала
            document.getElementById('ceilingMaterialId').value = material.id;
            document.getElementById('ceilingMaterialName').value = material.name;

            // Меняем заголовок модального окна
            document.querySelector('#ceilingMaterialModal .modal-title').textContent = 'Редактировать материал перекрытий';
            
            // Показываем модальное окно
            document.getElementById('ceilingMaterialModal').classList.remove('hidden');
            document.getElementById('ceilingMaterialName').focus();
            
        } catch (error) {
            console.error('Ошибка загрузки материала для редактирования:', error);
            this.showError('Ошибка загрузки материала: ' + error.message);
        }
    }

    /**
     * Скрыть модальное окно материала перекрытий
     */
    hideCeilingMaterialModal() {
        document.getElementById('ceilingMaterialModal').classList.add('hidden');
        document.getElementById('ceilingMaterialForm').reset();
        document.getElementById('ceilingMaterialId').value = '';
    }

    /**
     * Сохранить материал перекрытий (создание или редактирование)
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
                this.showError('Название материала обязательно');
                return;
            }

            // Проверяем уникальность названия (исключая редактируемый материал)
            const existingMaterials = await db.getAll('ceiling_materials');
            const duplicate = existingMaterials.find(m => 
                m.name.toLowerCase() === material.name.toLowerCase() && m.id !== materialId
            );

            if (duplicate) {
                this.showError('Материал с таким названием уже существует');
                return;
            }

            let savedMaterial;
            
            if (materialId) {
                // Редактирование существующего материала
                material.id = materialId;
                material.updated_at = new Date();
                savedMaterial = await db.update('ceiling_materials', material);
                this.showSuccess('Материал перекрытий обновлен успешно');
            } else {
                // Создание нового материала
                savedMaterial = await db.add('ceiling_materials', material);
                this.showSuccess('Материал перекрытий добавлен успешно');
            }
            
            // Обновляем select
            await this.loadCeilingMaterials();
            
            // Выбираем материал
            document.getElementById('editCeilingMaterial').value = savedMaterial.id;
            this.updateCeilingMaterialButton();
            
            // Закрываем модальное окно
            this.hideCeilingMaterialModal();
            
        } catch (error) {
            console.error('Ошибка сохранения материала перекрытий:', error);
            this.showError('Ошибка сохранения материала: ' + error.message);
        }
    }

    /**
     * Переключение фильтра карты
     * @param {string} filterType - Тип фильтра (year, series, floors, objects, listings)
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
        if (this.activeMapFilter === filterType) {
            this.activeMapFilter = null;
            console.log('🔄 Фильтр отключен');
            return;
        }

        // Активируем новый фильтр
        this.activeMapFilter = filterType;
        const activeButton = document.getElementById(`filterBy${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`);
        
        if (activeButton) {
            // Устанавливаем активное состояние (sky цвет)
            activeButton.className = 'inline-flex items-center px-3 py-2 border border-sky-300 shadow-sm text-sm leading-4 font-medium rounded-md text-sky-700 bg-sky-100 hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500';
        }

        console.log(`🎯 Активирован фильтр: ${filterType}`);
        
        // Здесь можно добавить логику применения фильтра к карте
        this.applyMapFilter(filterType);
    }

    /**
     * Применение фильтра к карте
     * @param {string} filterType - Тип фильтра
     */
    async applyMapFilter(filterType) {
        console.log(`📍 Применяем фильтр "${filterType}" к карте`);
        
        // Перерисовываем маркеры адресов с новыми подписями только если адреса уже загружены
        if (this.addressesCluster || (this.mapLayers.addresses && this.mapLayers.addresses.getLayers().length > 0)) {
            await this.loadAddressesOnMap();
        } else {
            console.log(`📍 Адреса еще не загружены, фильтр будет применен при загрузке`);
        }
    }

    /**
     * Установка фильтра по умолчанию (Год)
     */
    setDefaultMapFilter() {
        // Устанавливаем активный фильтр
        this.activeMapFilter = 'year';
        
        // Активируем кнопку "Год"
        const yearButton = document.getElementById('filterByYear');
        if (yearButton) {
            yearButton.className = 'inline-flex items-center px-3 py-2 border border-sky-300 shadow-sm text-sm leading-4 font-medium rounded-md text-sky-700 bg-sky-100 hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500';
        }
        
        console.log('🎯 Фильтр "Год" активирован по умолчанию');
        
        // Загружаем все данные на карту при первой инициализации
        this.loadMapData();
    }

    async processAddresses() {
        if (this.processing.addresses) {
            this.showInfo('Обработка адресов уже выполняется');
            return;
        }

        try {
            this.processing.addresses = true;
            console.log('🚀 Начинаем определение адресов для объявлений');
            this.updateProgressBar('addresses', 0, 'Подготовка данных...');

            // Загружаем объявления без привязанных адресов
            const allListings = await db.getListings();
            const unprocessedListings = allListings.filter(listing => 
                !listing.address_id && 
                listing.coordinates && 
                listing.coordinates.lat && 
                (listing.coordinates.lng || listing.coordinates.lon)
            );

            if (unprocessedListings.length === 0) {
                this.showInfo('Нет объявлений для обработки (все уже имеют привязанные адреса)');
                return;
            }

            this.updateProgressBar('addresses', 10, `Найдено ${unprocessedListings.length} объявлений для обработки`);

            // Загружаем все адреса
            const allAddresses = await db.getAddresses();
            if (allAddresses.length === 0) {
                this.showError('В базе данных нет адресов для сопоставления');
                return;
            }

            this.updateProgressBar('addresses', 20, `Загружено ${allAddresses.length} адресов из базы`);

            // Инициализируем алгоритм сопоставления
            const AddressMatcher = await this.loadAddressMatcher();
            const matcher = new AddressMatcher(this.spatialManager);

            this.updateProgressBar('addresses', 30, 'Запуск алгоритма сопоставления...');

            // Обрабатываем объявления батчами для отображения прогресса
            const batchSize = 50;
            let processedCount = 0;
            let matchedCount = 0;
            let results = {
                processed: 0,
                matched: 0,
                highConfidence: 0,
                mediumConfidence: 0,
                lowConfidence: 0,
                noMatch: 0,
                errors: 0
            };

            for (let i = 0; i < unprocessedListings.length; i += batchSize) {
                const batch = unprocessedListings.slice(i, i + batchSize);
                const progress = 30 + ((i / unprocessedListings.length) * 60);
                
                this.updateProgressBar('addresses', progress, 
                    `Обработка объявлений ${i + 1}-${Math.min(i + batchSize, unprocessedListings.length)} из ${unprocessedListings.length}`);

                // Обрабатываем батч
                for (const listing of batch) {
                    try {
                        const matchResult = await matcher.matchAddress(listing, allAddresses);
                        processedCount++;
                        results.processed++;

                        if (matchResult.address) {
                            matchedCount++;
                            results.matched++;

                            // Обновляем объявление в базе данных
                            listing.address_id = matchResult.address.id;
                            listing.address_match_confidence = matchResult.confidence;
                            listing.address_match_method = matchResult.method;
                            listing.address_match_score = matchResult.score;
                            listing.address_distance = matchResult.distance;
                            listing.updated_at = new Date();

                            // Изменяем processing_status с 'address_needed' на 'duplicate_check_needed'
                            // когда адрес успешно определен
                            if (listing.processing_status === 'address_needed') {
                                listing.processing_status = 'duplicate_check_needed';
                            }

                            await db.update('listings', listing);

                            // Статистика по уровням доверия
                            switch (matchResult.confidence) {
                                case 'high':
                                    results.highConfidence++;
                                    break;
                                case 'medium':
                                    results.mediumConfidence++;
                                    break;
                                case 'low':
                                case 'very_low':
                                    results.lowConfidence++;
                                    break;
                            }
                        } else {
                            results.noMatch++;
                        }
                    } catch (error) {
                        results.errors++;
                        console.error('Ошибка обработки объявления:', error);
                    }
                }

                // Небольшая задержка для обновления UI
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            this.updateProgressBar('addresses', 100, 'Обработка завершена');

            // Обновляем карту и статистику
            await this.loadAreaStats();
            await this.refreshMapData();

            // Показываем результат
            const message = `
                Обработка адресов завершена:
                • Обработано: ${results.processed}
                • Найдены адреса: ${results.matched}
                • Высокая точность: ${results.highConfidence}
                • Средняя точность: ${results.mediumConfidence}
                • Низкая точность: ${results.lowConfidence}
                • Не найдено: ${results.noMatch}
                • Ошибок: ${results.errors}
            `;

            this.showSuccess(message);

        } catch (error) {
            console.error('Error processing addresses:', error);
            this.showError('Ошибка определения адресов: ' + error.message);
        } finally {
            this.processing.addresses = false;
            this.hideProgressBar('addresses');
        }
    }

    /**
     * Загрузка модуля AddressMatcher
     */
    async loadAddressMatcher() {
        // Динамическая загрузка модуля
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '../utils/addressMatcher.js';
            script.onload = () => {
                resolve(window.AddressMatcher || AddressMatcher);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async processDuplicates() {
        this.showInfo('Функция обработки дублей будет реализована позже');
    }

    /**
     * Удаление всех объявлений входящих в область
     */
    async deleteListings() {
        try {
            // Проверяем что область существует
            if (!this.currentArea || !this.currentAreaId) {
                this.showError('Область не загружена');
                return;
            }

            // Загружаем все объявления
            const allListings = await db.getListings();
            
            // Фильтруем объявления, входящие в полигон области
            const listingsInArea = allListings.filter(listing => {
                if (!listing.coordinates || !listing.coordinates.lat || !(listing.coordinates.lng || listing.coordinates.lon)) {
                    return false;
                }
                
                const lat = listing.coordinates.lat;
                const lng = listing.coordinates.lng || listing.coordinates.lon;
                
                return this.currentArea.containsPoint(lat, lng);
            });

            if (listingsInArea.length === 0) {
                this.showInfo('В области нет объявлений для удаления');
                return;
            }

            // Показываем диалог подтверждения
            const confirmed = confirm(
                `Вы действительно хотите удалить ${listingsInArea.length} объявлений из области "${this.currentArea.name}"?\n\n` +
                `Это действие нельзя отменить.`
            );

            if (!confirmed) {
                return;
            }

            // Удаляем объявления
            let deletedCount = 0;
            let errorCount = 0;

            for (const listing of listingsInArea) {
                try {
                    await db.delete('listings', listing.id);
                    deletedCount++;
                } catch (error) {
                    console.error(`Ошибка удаления объявления ${listing.id}:`, error);
                    errorCount++;
                }
            }

            // Обновляем карту и таблицы
            await this.loadMapData();
            if (this.duplicatesTable) {
                await this.loadDuplicatesTable();
            }

            // Показываем результат
            if (errorCount === 0) {
                this.showSuccess(`Успешно удалено ${deletedCount} объявлений из области`);
            } else {
                this.showWarning(`Удалено ${deletedCount} объявлений, ошибок: ${errorCount}`);
            }

            console.log(`🗑️ Удалено объявлений: ${deletedCount}, ошибок: ${errorCount}`);

        } catch (error) {
            console.error('Ошибка удаления объявлений:', error);
            this.showError(`Ошибка удаления объявлений: ${error.message}`);
        }
    }

    // ===== МЕТОДЫ ДЛЯ ТАБЛИЦЫ ДУБЛЕЙ =====

    /**
     * Загрузка данных в таблицу дублей
     */
    async loadDuplicatesTable() {
        try {
            // Загружаем объявления, которые попадают в область (полигон)
            const listings = await this.getListingsInArea();

            // УДАЛЕН: работа с объектами
            const tableData = [
                ...listings.map(item => ({...item, type: 'listing'}))
            ];

            console.log(`📋 Загружено ${tableData.length} элементов для таблицы дублей`);

            // Сохраняем listings в переменную класса для использования в других функциях
            this.listings = listings;

            // Очищаем выбранные элементы при перезагрузке
            this.selectedDuplicates.clear();

            // Обновляем данные в DataTable
            if (this.duplicatesTable) {
                this.duplicatesTable.clear();
                this.duplicatesTable.rows.add(tableData);
                
                // Применяем текущие фильтры (включая статус и фильтры обработки)
                this.applyProcessingFilters();
            }

            // Обновляем UI выбора
            this.updateDuplicatesSelection();

            // Добавляем обработчики для чекбоксов после обновления таблицы
            setTimeout(() => {
                this.bindDuplicateRowEvents();
            }, 100);

        } catch (error) {
            console.error('Ошибка загрузки таблицы дублей:', error);
            this.showError('Ошибка загрузки данных: ' + error.message);
        }
    }



    /**
     * Получение текста типа недвижимости
     */
    getPropertyTypeText(propertyType) {
        const types = {
            'studio': 'Студия',
            '1k': '1к',
            '2k': '2к',
            '3k': '3к',
            '4k+': '4к+'
        };
        return types[propertyType] || propertyType;
    }

    /**
     * Получение бейджа статуса
     */
    getStatusBadge(status) {
        const badges = {
            'active': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
            'archived': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
            'needs_processing': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Требует обработки</span>'
        };
        return badges[status] || `<span class="text-sm text-gray-500">${status}</span>`;
    }

    /**
     * Привязка событий для строк таблицы дублей
     */
    bindDuplicateRowEvents() {
        const checkboxes = document.querySelectorAll('.duplicate-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.handleDuplicateSelection(checkbox);
            });
        });
    }

    /**
     * Обработка выбора элемента в таблице дублей
     */
    handleDuplicateSelection(checkbox) {
        const itemId = checkbox.dataset.id;
        const itemType = checkbox.dataset.type;
        const key = `${itemType}_${itemId}`;

        if (checkbox.checked) {
            this.selectedDuplicates.add(key);
        } else {
            this.selectedDuplicates.delete(key);
        }

        this.updateDuplicatesSelection();
    }

    /**
     * Выбор всех элементов в таблице дублей
     */
    selectAllDuplicates(checked) {
        const checkboxes = document.querySelectorAll('.duplicate-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            this.handleDuplicateSelection(checkbox);
        });
    }

    /**
     * Очистка выбора в таблице дублей
     */
    clearDuplicatesSelection() {
        this.selectedDuplicates.clear();
        document.querySelectorAll('.duplicate-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.getElementById('selectAllDuplicates').checked = false;
        this.updateDuplicatesSelection();
    }

    /**
     * Обновление UI выбора дублей
     */
    updateDuplicatesSelection() {
        const selectedCount = this.selectedDuplicates.size;
        const selectedInfo = document.getElementById('selectedItemsInfo');
        const selectedCountEl = document.getElementById('selectedItemsCount');
        const mergeBtnEl = document.getElementById('mergeDuplicatesBtn');
        const splitBtnEl = document.getElementById('splitDuplicatesBtn');

        if (selectedCount > 0) {
            selectedInfo.classList.remove('hidden');
            selectedCountEl.textContent = `${selectedCount} элементов выбрано`;
            mergeBtnEl.disabled = selectedCount < 2;
            splitBtnEl.disabled = false;
        } else {
            selectedInfo.classList.add('hidden');
            mergeBtnEl.disabled = true;
            splitBtnEl.disabled = true;
        }
    }

    /**
     * Объединение дублей
     */
    async mergeDuplicates() {
        if (this.selectedDuplicates.size < 2) {
            this.showError('Выберите минимум 2 элемента для объединения');
            return;
        }

        const selectedItems = Array.from(this.selectedDuplicates);
        console.log('🔗 Объединение дублей:', selectedItems);
        
        // Здесь будет логика объединения дублей
        this.showInfo(`Функция объединения ${selectedItems.length} элементов будет реализована позже`);
    }

    /**
     * Разбивка дублей
     */
    async splitDuplicates() {
        if (this.selectedDuplicates.size === 0) {
            this.showError('Выберите элементы для разбивки дублей');
            return;
        }

        const selectedItems = Array.from(this.selectedDuplicates);
        console.log('✂️ Разбивка дублей:', selectedItems);
        
        // Здесь будет логика разбивки дублей
        this.showInfo(`Функция разбивки ${selectedItems.length} элементов будет реализована позже`);
    }

    // Удален дублирующий метод parseAvitoForArea - используется метод ниже

    /**
     * Парсинг Cian для области
     */
    async parseCianForArea() {
        try {
            debugLogger.log('Начинаем парсинг Cian по фильтру:', this.currentArea.cian_filter_url);
            
            // Отправляем сообщение в background script для начала парсинга
            const response = await chrome.runtime.sendMessage({
                action: 'parseMassByFilter',
                source: 'cian',
                filterUrl: this.currentArea.cian_filter_url,
                areaId: this.currentArea.id
            });

            if (response && response.success) {
                return {
                    parsed: response.parsed || 0,
                    errors: response.errors || 0
                };
            } else {
                throw new Error(response?.error || 'Неизвестная ошибка парсинга Cian');
            }
        } catch (error) {
            console.error('Ошибка парсинга Cian:', error);
            return { parsed: 0, errors: 1 };
        }
    }

    /**
     * Просмотр деталей элемента
     */
    async viewDuplicateDetails(id, type) {
        console.log(`👁️ Просмотр деталей ${type}:`, id);
        
        try {
            const storeName = type === 'listing' ? 'listings' : 'objects';
            const item = await db.get(storeName, id);
            
            if (!item) {
                this.showError('Элемент не найден');
                return;
            }

            // Показываем детали в модальном окне или консоли
            console.log('Детали элемента:', item);
            this.showInfo('Детали отображены в консоли разработчика');
            
        } catch (error) {
            console.error('Ошибка загрузки деталей:', error);
            this.showError('Ошибка загрузки деталей: ' + error.message);
        }
    }

    /**
     * Удаление элемента
     */
    async deleteDuplicate(id, type) {
        if (!confirm(`Вы уверены, что хотите удалить этот ${type === 'listing' ? 'объявление' : 'объект'}?`)) {
            return;
        }

        try {
            const storeName = type === 'listing' ? 'listings' : 'objects';
            await db.delete(storeName, id);
            
            this.showSuccess(`${type === 'listing' ? 'Объявление' : 'Объект'} удален`);
            
            // Обновляем таблицу
            await this.loadDuplicatesTable();
            
            // Убираем из выбранных если был выбран
            this.selectedDuplicates.delete(`${type}_${id}`);
            this.updateDuplicatesSelection();
            
        } catch (error) {
            console.error('Ошибка удаления:', error);
            this.showError('Ошибка удаления: ' + error.message);
        }
    }

    async addAddress() {
        if (!this.currentArea || !this.currentArea.polygon) {
            this.showError('Область не имеет полигона для добавления адреса');
            return;
        }

        try {
            console.log(`🆕 Открытие формы добавления нового адреса`);
            
            // Получаем центр полигона области
            const center = this.geoUtils.getPolygonCenter(this.currentArea.polygon);
            console.log(`📍 Центр полигона:`, center);
            
            // Создаем новый адрес с координатами в центре полигона
            const newAddress = {
                id: null, // null означает новый адрес
                address: '', // Будет заполнено через reverse geocoding
                coordinates: {
                    lat: center.lat,
                    lng: center.lng
                },
                type: 'house',
                map_area_id: this.currentAreaId,
                source: 'manual',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Заполняем форму данными нового адреса
            await this.fillAddressForm(newAddress);
            
            // Показываем модальное окно
            this.showAddressModal(newAddress);
            
            // Устанавливаем режим создания нового адреса
            this.editingAddressId = null;
            
            // Выполняем reverse geocoding для получения адреса по координатам центра
            setTimeout(async () => {
                try {
                    console.log(`🔍 Поиск адреса для центра полигона...`);
                    const osmAPI = new OSMOverpassAPI();
                    const foundAddress = await osmAPI.reverseGeocode(center.lat, center.lng);
                    
                    if (foundAddress) {
                        const addressField = document.getElementById('editAddressText');
                        if (addressField) {
                            addressField.value = foundAddress;
                            console.log(`✅ Адрес найден и подставлен: ${foundAddress}`);
                        }
                    }
                } catch (error) {
                    console.error('Ошибка при поиске адреса для центра:', error);
                }
            }, 200);

        } catch (error) {
            console.error('Error opening add address form:', error);
            this.showError('Ошибка открытия формы добавления адреса: ' + error.message);
        }
    }


    /**
     * Диагностическая функция для полной проверки системы адресов
     * Вызывается из консоли браузера: areaPage.diagnosticAddressSystem()
     */
    async diagnosticAddressSystem() {
        console.log(`🔍 === ДИАГНОСТИКА СИСТЕМЫ АДРЕСОВ ===`);
        
        try {
            // 1. Проверяем текущую область
            console.log(`🏢 Текущая область:`, this.currentArea);
            
            if (!this.currentArea || !this.currentArea.polygon) {
                console.error(`❌ Область не загружена или не имеет полигона`);
                return;
            }
            
            console.log(`📐 Полигон области (${this.currentArea.polygon.length} точек):`, this.currentArea.polygon);
            
            // 2. Проверяем базу данных
            console.log(`💾 Проверяем базу данных...`);
            const allAddresses = await db.getAddresses();
            console.log(`📊 Всего адресов в БД: ${allAddresses.length}`);
            
            if (allAddresses.length === 0) {
                console.warn(`⚠️ В базе данных нет адресов! Добавьте тестовый адрес или загрузите из OSM`);
                return;
            }
            
            // 3. Показываем примеры адресов
            console.log(`📋 Примеры адресов из БД:`);
            allAddresses.slice(0, 3).forEach((addr, index) => {
                console.log(`  ${index + 1}. ${addr.address} - ${addr.coordinates?.lat}, ${addr.coordinates?.lng}`);
            });
            
            // 4. Проверяем пространственный индекс
            console.log(`🗂️ Проверяем пространственный индекс...`);
            await this.ensureAddressesIndex(allAddresses);
            
            // 5. Проверяем поиск по области
            console.log(`🎯 Выполняем поиск адресов в области...`);
            const addressesInArea = this.spatialManager.findInArea('addresses', this.currentArea.polygon);
            console.log(`✅ Найдено адресов через индекс: ${addressesInArea.length}`);
            
            // 6. Мануальная проверка
            console.log(`🧪 Мануальная проверка точек в полигоне...`);
            let manualCount = 0;
            allAddresses.forEach(address => {
                if (address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                    const isInside = this.geoUtils.isPointInPolygon(address.coordinates, this.currentArea.polygon);
                    if (isInside) {
                        manualCount++;
                        console.log(`  ✓ ${address.address} - внутри полигона`);
                    }
                }
            });
            console.log(`🧪 Мануальная проверка найдено: ${manualCount} адресов`);
            
            // 7. Проверяем центр полигона
            const center = this.geoUtils.getPolygonCenter(this.currentArea.polygon);
            console.log(`📍 Центр полигона: ${center.lat}, ${center.lng}`);
            
            // 8. Проверяем площадь полигона
            const area = this.geoUtils.getPolygonArea(this.currentArea.polygon);
            console.log(`📏 Площадь полигона: ${(area / 1000000).toFixed(2)} км²`);
            
            // 9. Итоговый отчет
            console.log(`📈 === ИТОГОВЫЙ ОТЧЕТ ===`);
            console.log(`📊 Адресов в БД: ${allAddresses.length}`);
            console.log(`🎯 Найдено через индекс: ${addressesInArea.length}`);
            console.log(`🧪 Найдено мануально: ${manualCount}`);
            console.log(`✅ Диагностика завершена`);
            
            if (addressesInArea.length !== manualCount) {
                console.error(`❌ ПРОБЛЕМА: Результаты индекса и мануальной проверки не совпадают!`);
            } else {
                console.log(`✅ Пространственный индекс работает корректно`);
            }
            
        } catch (error) {
            console.error(`❌ Ошибка диагностики:`, error);
        }
    }

    /**
     * Диагностика конкретной точки в полигоне
     */
    testPointInPolygon(lat, lng) {
        const point = { lat: lat, lng: lng };
        console.log(`🧪 Тестируем точку: lat=${lat}, lng=${lng}`);
        console.log(`📐 Полигон:`, this.currentArea.polygon);
        
        try {
            // Тест с разными методами
            const result1 = this.geoUtils.isPointInPolygon(point, this.currentArea.polygon);
            console.log(`🔍 GeoUtils.isPointInPolygon: ${result1}`);
            
            // Тест с созданием GeoJSON вручную
            const geoPoint = this.geoUtils.createPoint(lat, lng);
            const geoPolygon = this.geoUtils.createPolygon(this.currentArea.polygon);
            console.log(`📍 GeoJSON Point:`, geoPoint);
            console.log(`🗺️ GeoJSON Polygon:`, geoPolygon);
            
            const result2 = turf.booleanPointInPolygon(geoPoint, geoPolygon);
            console.log(`🌍 Turf.booleanPointInPolygon: ${result2}`);
            
            return { geoUtils: result1, turf: result2 };
        } catch (error) {
            console.error(`❌ Ошибка тестирования:`, error);
            return null;
        }
    }

    async deleteAddress(addressId) {
        if (confirm('Вы уверены, что хотите удалить этот адрес?')) {
            try {
                await db.deleteAddress(addressId);
                await this.loadAddresses();
                await this.loadAreaStats();
                this.showSuccess('Адрес удален');
                this.refreshAddressData();
            } catch (error) {
                console.error('Error deleting address:', error);
                this.showError('Ошибка удаления адреса: ' + error.message);
            }
        }
    }

    /**
     * Парсинг Avito для области
     */
    async parseAvitoForArea() {
        try {
            debugLogger.log('Запускаем парсинг Avito для области:', this.currentArea.name);
            
            return new Promise((resolve) => {
                // Добавляем задержку перед созданием вкладки
                setTimeout(() => {
                    this.createTabWithRetry(this.currentArea.avito_filter_url, 3)
                        .then(async (newTab) => {
                            debugLogger.log('Открыта вкладка Avito:', newTab.id);
                            
                            try {
                                // Ждем загрузки страницы и инжектируем content script
                                await this.waitForPageLoad(newTab.id);
                                await this.injectContentScript(newTab.id);
                                
                                // Запускаем парсинг
                                const response = await this.waitForContentScriptAndParse(newTab.id, {
                                    areaId: this.currentAreaId,
                                    areaName: this.currentArea.name,
                                    maxPages: 10, // Можно сделать настраиваемым
                                    delay: 2000,
                                    avitoFilterUrl: this.currentArea.avito_filter_url,
                                    listingsContainer: '.styles-container-rnTvX',
                                    listingSelector: '.styles-snippet-ZgKUd',
                                    linkSelector: 'a[href*="/kvartiry/"]'
                                });

                                // НЕ закрываем вкладку для отладки
                                debugLogger.log('Парсинг Avito завершен, вкладка остается открытой для отладки');

                                if (response && response.success) {
                                    resolve({ parsed: response.parsed || 0, errors: response.errors || 0 });
                                } else {
                                    throw new Error(response?.error || 'Ошибка парсинга Avito');
                                }
                            } catch (error) {
                                debugLogger.error('Ошибка парсинга Avito:', error);
                                // НЕ закрываем вкладку в случае ошибки для отладки
                                debugLogger.log('Ошибка парсинга, вкладка остается открытой для отладки');
                                resolve({ parsed: 0, errors: 1 });
                            }
                        })
                        .catch((error) => {
                            debugLogger.error('Не удалось создать вкладку:', error);
                            resolve({ parsed: 0, errors: 1 });
                        });
                }, 500); // Задержка 500мс перед созданием вкладки
            });
        } catch (error) {
            console.error('Error parsing Avito:', error);
            return { parsed: 0, errors: 1 };
        }
    }

    /**
     * Создание вкладки с повторными попытками
     */
    async createTabWithRetry(url, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await new Promise((resolve, reject) => {
                    chrome.tabs.create({ url: url, active: false }, (newTab) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(newTab);
                        }
                    });
                });
            } catch (error) {
                debugLogger.log(`Попытка ${attempt}/${maxRetries} создания вкладки неудачна:`, error.message);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Экспоненциальная задержка между попытками
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }


    /**
     * Обновление прогресс-бара
     */
    updateProgressBar(type, percentage, message) {
        // Показываем контейнер прогресса
        this.showProgressBar(type);
        
        const progressElement = document.getElementById(`${type}Progress`);
        const progressBarElement = document.getElementById(`${type}ProgressBar`);
        
        if (progressElement) {
            progressElement.textContent = `${Math.round(percentage * 100) / 100}%`;
        }
        
        if (progressBarElement) {
            progressBarElement.style.width = `${percentage}%`;
        }

        // Показываем сообщение о состоянии если есть
        if (message) {
            const statusElement = document.getElementById(`${type}Status`);
            if (statusElement) {
                statusElement.textContent = message;
                statusElement.classList.remove('hidden');
            }
        }

        // Сохраняем состояние
        this.saveProgressState(type, percentage, message, percentage < 100);
    }

    /**
     * Скрытие прогресс-бара
     */
    hideProgressBar(type) {
        const progressContainer = document.querySelector(`[data-progress="${type}"]`);
        if (progressContainer) {
            progressContainer.classList.add('hidden');
        }
        
        // Скрываем также статус
        const statusElement = document.getElementById(`${type}Status`);
        if (statusElement) {
            statusElement.classList.add('hidden');
        }
        
        // Сбрасываем прогресс
        this.resetProgressBar(type);
        
        // Очищаем сохраненное состояние
        this.clearProgressState(type);
    }

    /**
     * Показ прогресс-бара
     */
    showProgressBar(type) {
        const progressContainer = document.querySelector(`[data-progress="${type}"]`);
        if (progressContainer) {
            progressContainer.classList.remove('hidden');
        }
    }

    /**
     * Сброс прогресс-бара
     */
    resetProgressBar(type) {
        const progressElement = document.getElementById(`${type}Progress`);
        const progressBarElement = document.getElementById(`${type}ProgressBar`);
        
        if (progressElement) {
            progressElement.textContent = '0%';
        }
        
        if (progressBarElement) {
            progressBarElement.style.width = '0%';
        }
    }

    /**
     * Ожидание загрузки страницы
     */
    async waitForPageLoad(tabId) {
        return new Promise((resolve) => {
            const checkPageLoad = () => {
                chrome.tabs.get(tabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        resolve();
                        return;
                    }
                    
                    if (tab.status === 'complete') {
                        setTimeout(resolve, 2000); // Дополнительная задержка после загрузки
                    } else {
                        setTimeout(checkPageLoad, 500);
                    }
                });
            };
            
            checkPageLoad();
        });
    }

    /**
     * Принудительная инжекция content script
     */
    async injectContentScript(tabId) {
        try {
            debugLogger.log('Принудительная инжекция content script...');
            
            // Инжектируем зависимости
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['data/database.js']
            });
            
            
            // Инжектируем основной парсер
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content-scripts/avito-parser.js']
            });
            
            debugLogger.log('Content script успешно инжектирован');
            
            // Дополнительная задержка для инициализации
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            debugLogger.error('Ошибка инжекции content script:', error);
            throw error;
        }
    }

    /**
     * Ожидание готовности content script и запуск парсинга
     */
    async waitForContentScriptAndParse(tabId, settings) {
        const maxAttempts = 10;
        const attemptDelay = 2000;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                debugLogger.log(`Попытка ${attempt}/${maxAttempts} связаться с content script...`);
                
                // Пытаемся отправить сообщение
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'parseMassByFilter',
                    areaId: settings.areaId,
                    areaName: settings.areaName,
                    maxPages: settings.maxPages || 10,
                    delay: settings.delay || 2000
                });
                
                // Если получили ответ, возвращаем его
                debugLogger.log('Content script ответил:', response);
                return response;
                
            } catch (error) {
                debugLogger.log(`Попытка ${attempt} неудачна:`, error.message);
                
                if (attempt === maxAttempts) {
                    // Последняя попытка - возвращаем ошибку
                    throw new Error(`Не удалось связаться с content script после ${maxAttempts} попыток: ${error.message}`);
                }
                
                // Ждем перед следующей попыткой
                await new Promise(resolve => setTimeout(resolve, attemptDelay));
            }
        }
    }

    /**
     * Сохранение состояния прогресса
     */
    saveProgressState(type, percentage, message, isActive = true) {
        if (!this.currentAreaId) return;

        const stateKey = this.storageKey + this.currentAreaId;
        let savedState = {};
        
        try {
            const existing = localStorage.getItem(stateKey);
            if (existing) {
                savedState = JSON.parse(existing);
            }
        } catch (error) {
            console.warn('Ошибка чтения сохраненного состояния:', error);
        }

        savedState[type] = {
            percentage: percentage,
            message: message,
            isActive: isActive,
            timestamp: new Date().toISOString()
        };

        try {
            localStorage.setItem(stateKey, JSON.stringify(savedState));
        } catch (error) {
            console.warn('Ошибка сохранения состояния:', error);
        }
    }

    /**
     * Восстановление состояния прогресса
     */
    restoreProgressState() {
        if (!this.currentAreaId) return;

        const stateKey = this.storageKey + this.currentAreaId;
        
        try {
            const savedState = localStorage.getItem(stateKey);
            if (!savedState) return;

            const state = JSON.parse(savedState);
            const now = new Date();

            // Восстанавливаем состояние только если операции были недавно (в течение часа)
            for (const [type, data] of Object.entries(state)) {
                const timestamp = new Date(data.timestamp);
                const hoursDiff = (now - timestamp) / (1000 * 60 * 60);

                if (hoursDiff < 1 && data.isActive) {
                    // Восстанавливаем прогресс-бар
                    this.updateProgressBar(type, data.percentage, data.message);
                    
                    // Если операция была не завершена, показываем предупреждение
                    if (data.percentage < 100) {
                        this.showInfo(`Восстановлено состояние операции "${type}": ${data.message}`);
                    }
                }
            }
        } catch (error) {
            console.warn('Ошибка восстановления состояния:', error);
        }
    }

    /**
     * Очистка состояния прогресса
     */
    clearProgressState(type = null) {
        if (!this.currentAreaId) return;

        const stateKey = this.storageKey + this.currentAreaId;
        
        try {
            if (type === null) {
                // Очищаем все состояние
                localStorage.removeItem(stateKey);
            } else {
                // Очищаем состояние конкретной операции
                const savedState = localStorage.getItem(stateKey);
                if (savedState) {
                    const state = JSON.parse(savedState);
                    delete state[type];
                    localStorage.setItem(stateKey, JSON.stringify(state));
                }
            }
        } catch (error) {
            console.warn('Ошибка очистки состояния:', error);
        }
    }

    /**
     * Методы для показа уведомлений
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    /**
     * Обновление состояния кнопок фильтров Avito и Cian
     */
    updateFilterButtons() {
        const avitoUrl = document.getElementById('editAvitoUrl')?.value?.trim();
        const cianUrl = document.getElementById('editCianUrl')?.value?.trim();
        
        const avitoBtn = document.getElementById('openAvitoBtn');
        const cianBtn = document.getElementById('openCianBtn');
        
        if (avitoBtn) {
            avitoBtn.disabled = !avitoUrl || !this.isValidUrl(avitoUrl);
        }
        
        if (cianBtn) {
            cianBtn.disabled = !cianUrl || !this.isValidUrl(cianUrl);
        }
    }

    /**
     * Проверка корректности URL
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Открытие фильтра Avito в новой вкладке
     */
    openAvitoFilter() {
        const avitoUrl = document.getElementById('editAvitoUrl')?.value?.trim();
        if (avitoUrl && this.isValidUrl(avitoUrl)) {
            chrome.tabs.create({ url: avitoUrl });
        }
    }

    /**
     * Открытие фильтра Cian в новой вкладке
     */
    openCianFilter() {
        const cianUrl = document.getElementById('editCianUrl')?.value?.trim();
        if (cianUrl && this.isValidUrl(cianUrl)) {
            chrome.tabs.create({ url: cianUrl });
        }
    }

    /**
     * Открытие фильтра обработки - заполнение фильтров данными из объявления
     */
    async openProcessingFilter(id, type) {
        try {
            console.log(`Заполнение фильтра обработки для ${type} с ID: ${id}`);
            
            // Получаем данные объявления
            let listing = null;
            if (type === 'listing') {
                listing = await db.get('listings', id);
            }
            
            if (!listing) {
                this.showError('Не удалось загрузить данные объявления');
                return;
            }
            
            // Заполняем фильтры данными из объявления
            await this.fillProcessingFilters(listing);
            
            this.showSuccess('Фильтр обработки заполнен данными из объявления');
            
        } catch (error) {
            console.error('Ошибка при заполнении фильтра обработки:', error);
            this.showError('Ошибка при заполнении фильтра обработки: ' + error.message);
        }
    }

    /**
     * Заполнение фильтров обработки данными из объявления
     */
    async fillProcessingFilters(listing) {
        try {
            // Заполняем адрес из справочника адресов
            if (listing.address_id && this.processingAddressSlimSelect) {
                this.processingAddressSlimSelect.setSelected([listing.address_id]);
                this.showClearButton('clearAddressFilterBtn');
            }
            
            // Заполняем тип недвижимости
            if (listing.property_type && this.processingPropertyTypeSlimSelect) {
                this.processingPropertyTypeSlimSelect.setSelected([listing.property_type]);
                this.showClearButton('clearPropertyTypeFilterBtn');
            }
            
            // Заполняем этаж
            if (listing.floor) {
                const floorInput = document.getElementById('processingFloorFilter');
                if (floorInput) {
                    floorInput.value = listing.floor;
                    this.showClearButton('clearFloorFilterBtn');
                }
            }
            
            // Заполняем статус обработки
            if (listing.processing_status && this.processingStatusSlimSelect) {
                this.processingStatusSlimSelect.setSelected([listing.processing_status]);
                this.showClearButton('clearProcessingStatusFilterBtn');
            }
            
            // Применяем фильтры
            await this.applyProcessingFilters();
            
        } catch (error) {
            console.error('Ошибка при заполнении фильтров:', error);
            throw error;
        }
    }

    /**
     * Применение фильтров обработки к таблице
     */
    async applyProcessingFilters() {
        try {
            // Получаем значения фильтров из SlimSelect и обычных элементов
            const addressFilter = this.processingAddressSlimSelect?.getSelected()?.[0] || '';
            const propertyTypeFilter = this.processingPropertyTypeSlimSelect?.getSelected()?.[0] || '';
            const floorFilter = document.getElementById('processingFloorFilter')?.value || '';
            
            // Получаем значение основного фильтра статусов
            const statusFilter = document.getElementById('duplicatesStatusFilter')?.value || 'all';
            
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
     * Очистка всех фильтров обработки
     */
    clearAllProcessingFilters() {
        try {
            // Очищаем фильтры SlimSelect
            if (this.processingAddressSlimSelect) {
                this.processingAddressSlimSelect.setSelected([]);
            }
            if (this.processingPropertyTypeSlimSelect) {
                this.processingPropertyTypeSlimSelect.setSelected([]);
            }
            
            // Очищаем обычные поля
            const floorInput = document.getElementById('processingFloorFilter');
            if (floorInput) {
                floorInput.value = '';
            }
            
            // Кнопки очистки больше не используются
            
            // Применяем фильтры (теперь пустые)
            this.applyProcessingFilters();
            
            this.showSuccess('Все фильтры очищены');
            
        } catch (error) {
            console.error('Ошибка при очистке фильтров:', error);
            this.showError('Ошибка при очистке фильтров: ' + error.message);
        }
    }

    /**
     * Очистка конкретного фильтра
     */
    clearSingleFilter(filterId) {
        try {
            // Определяем тип фильтра и очищаем соответствующим образом
            switch (filterId) {
                case 'processingAddressFilter':
                    if (this.processingAddressSlimSelect) {
                        this.processingAddressSlimSelect.setSelected([]);
                    }
                    break;
                case 'processingPropertyTypeFilter':
                    if (this.processingPropertyTypeSlimSelect) {
                        this.processingPropertyTypeSlimSelect.setSelected([]);
                    }
                    break;
                case 'processingFloorFilter':
                    const filterElement = document.getElementById(filterId);
                    if (filterElement) {
                        filterElement.value = '';
                    }
                    break;
            }
            
            // Кнопки очистки больше не используются
            
            // Применяем фильтры
            this.applyProcessingFilters();
            
            this.showSuccess('Фильтр очищен');
            
        } catch (error) {
            console.error('Ошибка при очистке фильтра:', error);
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
     * Скрыть кнопку очистки фильтра
     */
    hideClearButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.add('hidden');
        }
    }

    /**
     * Обновление отображения активных фильтров
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
                container.classList.remove('hidden');
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
            } else {
                container.classList.add('hidden');
            }
            
        } catch (error) {
            console.error('Ошибка при обновлении отображения активных фильтров:', error);
        }
    }

    /**
     * Удаление активного фильтра
     */
    removeActiveFilter(filterType) {
        try {
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
            }
        } catch (error) {
            console.error('Ошибка при удалении активного фильтра:', error);
        }
    }

    /**
     * Инициализация фильтров обработки
     */
    async initProcessingFilters() {
        try {
            console.log('🔧 Инициализация фильтров обработки...');
            
            // Инициализируем SlimSelect для адресов
            await this.initAddressFilter();
            
            // Инициализируем SlimSelect для типа недвижимости
            await this.initPropertyTypeFilter();
            
            // Добавляем обработчики событий
            this.bindProcessingFilterEvents();
            
            console.log('✅ Фильтры обработки инициализированы');
            
        } catch (error) {
            console.error('Ошибка при инициализации фильтров обработки:', error);
            this.showError('Ошибка инициализации фильтров: ' + error.message);
        }
    }

    /**
     * Инициализация фильтра адресов с SlimSelect
     */
    async initAddressFilter() {
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
     * Инициализация фильтра типа недвижимости с SlimSelect
     */
    async initPropertyTypeFilter() {
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
     * Привязка обработчиков событий для фильтров обработки
     */
    bindProcessingFilterEvents() {
        try {
            // Кнопка "Очистить все фильтры"
            const clearAllBtn = document.getElementById('clearProcessingFiltersBtn');
            if (clearAllBtn) {
                clearAllBtn.addEventListener('click', () => {
                    this.clearAllProcessingFilters();
                });
            }

            // Кнопки очистки отдельных фильтров
            const clearButtons = [
                { id: 'clearAddressFilterBtn', filterId: 'processingAddressFilter' },
                { id: 'clearPropertyTypeFilterBtn', filterId: 'processingPropertyTypeFilter' },
                { id: 'clearFloorFilterBtn', filterId: 'processingFloorFilter' },
                { id: 'clearProcessingStatusFilterBtn', filterId: 'processingStatusFilter' }
            ];

            clearButtons.forEach(({ id, filterId }) => {
                const button = document.getElementById(id);
                if (button) {
                    button.addEventListener('click', () => {
                        this.clearSingleFilter(filterId, id);
                    });
                }
            });

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
            console.error('Ошибка при привязке событий фильтров:', error);
        }
    }

    /**
     * Обработчик изменения фильтра адресов
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
            console.error('Ошибка при изменении фильтра адресов:', error);
        }
    }

    /**
     * Обработчик изменения фильтра типа недвижимости
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
            console.error('Ошибка при изменении фильтра типа недвижимости:', error);
        }
    }

    /**
     * Обработчик изменения фильтра статуса обработки
     */
    onProcessingStatusFilterChange(newVal) {
        try {
            if (newVal && newVal.length > 0) {
                this.showClearButton('clearProcessingStatusFilterBtn');
            } else {
                this.hideClearButton('clearProcessingStatusFilterBtn');
            }
            this.applyProcessingFilters();
        } catch (error) {
            console.error('Ошибка при изменении фильтра статуса обработки:', error);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const colors = {
            success: 'bg-green-100 border-green-500 text-green-700',
            error: 'bg-red-100 border-red-500 text-red-700',
            info: 'bg-blue-100 border-blue-500 text-blue-700'
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

        document.getElementById('notifications').appendChild(notification);

        // Автоматическое удаление через 5 секунд
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    // ===== МЕТОДЫ ДЛЯ РАБОТЫ С INPARS =====

    /**
     * Инициализация SlimSelect для категорий Inpars
     */
    initInparsCategoriesSlimSelect() {
        try {
            console.log('🔧 Начинаем инициализацию SlimSelect...');
            
            const selectElement = document.getElementById('inparsCategoriesSelect');
            console.log('📋 Select элемент найден:', !!selectElement);
            console.log('📦 SlimSelect загружен:', typeof SlimSelect !== 'undefined');
            
            if (!selectElement) {
                console.error('❌ Элемент select с ID inparsCategoriesSelect не найден');
                return;
            }
            
            if (typeof SlimSelect === 'undefined') {
                console.error('❌ Библиотека SlimSelect не загружена');
                return;
            }

            // Если уже инициализирован, уничтожаем предыдущий экземпляр
            if (this.inparsCategoriesSlimSelect) {
                console.log('🗑️ Уничтожаем предыдущий экземпляр SlimSelect');
                this.inparsCategoriesSlimSelect.destroy();
            }

            // Создаем новый экземпляр SlimSelect
            console.log('⚙️ Создаем новый экземпляр SlimSelect...');
            this.inparsCategoriesSlimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    multiple: true,
                    closeOnSelect: false,
                    searchPlaceholder: 'Поиск категорий...',
                    searchText: 'Не найдено',
                    placeholderText: 'Выберите категории',
                    allowDeselect: true,
                    hideSelected: false
                },
                events: {
                    beforeChange: (newVal, oldVal) => {
                        console.log('Изменение выбора категорий:', newVal);
                        return true;
                    },
                    afterChange: (newVal) => {
                        this.onInparsCategoriesChange(newVal);
                    }
                }
            });

            console.log('✅ SlimSelect для категорий Inpars инициализирован');

        } catch (error) {
            console.error('❌ Ошибка инициализации SlimSelect:', error);
        }
    }

    /**
     * Обработчик изменения выбора категорий
     */
    onInparsCategoriesChange(selectedValues) {
        console.log('Выбранные категории Inpars:', selectedValues);
        // Здесь можно добавить дополнительную логику при изменении выбора
        
        // Обновляем счетчик выбранных категорий в UI если нужно
        this.updateSelectedCategoriesCount(selectedValues.length);
    }

    /**
     * Обновление счетчика выбранных категорий
     */
    updateSelectedCategoriesCount(count) {
        // Можно добавить отображение количества выбранных категорий
        // например, в label или отдельном элементе
        const label = document.querySelector('label[for="inparsCategoriesSelect"]');
        if (label) {
            const baseText = 'Категории недвижимости';
            if (count > 0) {
                label.textContent = `${baseText} (выбрано: ${count})`;
            } else {
                label.textContent = baseText;
            }
        }
    }

    /**
     * Очистка выбора категорий
     */
    clearSelectedCategories() {
        if (this.inparsCategoriesSlimSelect) {
            this.inparsCategoriesSlimSelect.setSelected([]);
        }
    }

    /**
     * Сворачивание/разворачивание панели Inpars
     */
    toggleInparsPanel() {
        const content = document.getElementById('inparsPanelContent');
        const chevron = document.getElementById('inparsPanelChevron');
        
        if (!content || !chevron) return;

        const isHidden = content.style.display === 'none';
        
        if (isHidden) {
            // Разворачиваем
            content.style.display = 'block';
            chevron.style.transform = 'rotate(0deg)';
            localStorage.setItem('inparsPanelCollapsed', 'false');
        } else {
            // Сворачиваем
            content.style.display = 'none';
            chevron.style.transform = 'rotate(-90deg)';
            localStorage.setItem('inparsPanelCollapsed', 'true');
        }
    }

    /**
     * Сворачивание/разворачивание таблицы адресов
     */
    toggleAddressTable() {
        const content = document.getElementById('addressTableContent');
        const chevron = document.getElementById('addressTableChevron');
        
        if (!content || !chevron) return;

        const isHidden = content.style.display === 'none';
        
        if (isHidden) {
            // Разворачиваем
            content.style.display = 'block';
            chevron.style.transform = 'rotate(0deg)';
            localStorage.setItem('addressTableCollapsed', 'false');
        } else {
            // Сворачиваем
            content.style.display = 'none';
            chevron.style.transform = 'rotate(-90deg)';
            localStorage.setItem('addressTableCollapsed', 'true');
        }
    }

    /**
     * Восстановление состояния таблицы адресов
     */
    restoreAddressTableState() {
        const isCollapsed = localStorage.getItem('addressTableCollapsed');
        // По умолчанию таблица адресов свёрнута
        const shouldCollapse = isCollapsed === null || isCollapsed === 'true';
        
        if (shouldCollapse) {
            const content = document.getElementById('addressTableContent');
            const chevron = document.getElementById('addressTableChevron');
            
            if (content && chevron) {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
            }
        }
    }

    /**
     * Восстановление состояния панели Inpars
     */
    restoreInparsPanelState() {
        const isCollapsed = localStorage.getItem('inparsPanelCollapsed') === 'true';
        if (isCollapsed) {
            const content = document.getElementById('inparsPanelContent');
            const chevron = document.getElementById('inparsPanelChevron');
            
            if (content && chevron) {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
            }
        }
    }

    /**
     * Инициализация панели Inpars
     */
    async initInparsPanel() {
        try {
            // Инициализируем SlimSelect для категорий
            this.initInparsCategoriesSlimSelect();
            
            // Загружаем категории в селектор
            await this.loadInparsCategories();
            
            // Проверяем доступность API токена
            await this.checkInparsToken();
            
        } catch (error) {
            console.error('Ошибка инициализации панели Inpars:', error);
        }
    }

    /**
     * Загрузка категорий Inpars в селектор
     */
    async loadInparsCategories() {
        try {
            console.log('📂 Начинаем загрузку категорий Inpars...');
            
            if (!this.inparsCategoriesSlimSelect) {
                console.warn('❌ SlimSelect не инициализирован');
                return;
            }

            // Устанавливаем состояние загрузки
            console.log('⏳ Устанавливаем состояние загрузки...');
            this.inparsCategoriesSlimSelect.setData([
                { text: 'Загрузка категорий...', value: '', disabled: true }
            ]);

            // Сначала проверяем все категории в базе
            const totalCategories = await db.getInparsCategories();
            console.log(`📊 Всего категорий в БД: ${totalCategories.length}`);
            
            if (totalCategories.length > 0) {
                // Показываем структуру первой категории
                console.log('🔍 Структура первой категории:', totalCategories[0]);
                
                // Анализируем поля (проверяем и snake_case и camelCase)
                const sectionIds = [...new Set(totalCategories.map(cat => cat.section_id || cat.sectionId).filter(id => id !== null && id !== undefined))];
                const typeIds = [...new Set(totalCategories.map(cat => cat.type_id || cat.typeId).filter(id => id !== null && id !== undefined))];
                console.log('📈 Уникальные section_id/sectionId:', sectionIds);
                console.log('📈 Уникальные type_id/typeId:', typeIds);
            }

            // Пробуем разные стратегии фильтрации
            let allCategories = [];
            
            // 1. Пробуем двойную фильтрацию
            console.log('🔎 Применяем фильтрацию по sectionId=1 и typeId=2...');
            allCategories = await db.getInparsCategoriesBySectionAndType(1, 2);
            console.log(`📋 Категории после двойной фильтрации: ${allCategories.length}`);
            
            // 2. Если нет результатов, пробуем только по section_id=1
            if (allCategories.length === 0) {
                console.log('⚠️ Нет категорий с двойной фильтрацией, пробуем только по section_id=1...');
                allCategories = await db.getInparsCategoriesBySection(1);
                console.log(`📋 Категории только по section_id=1: ${allCategories.length}`);
            }
            
            // 3. Если всё ещё пустые, берем все категории
            if (allCategories.length === 0) {
                console.log('⚠️ Нет категорий даже по section_id=1, загружаем все категории...');
                allCategories = await db.getInparsCategories();
                console.log(`📋 Все категории из БД: ${allCategories.length}`);
                
                if (allCategories.length === 0) {
                    this.inparsCategoriesSlimSelect.setData([
                        { text: 'Категории не загружены. Импортируйте категории в настройках.', value: '', disabled: true }
                    ]);
                    return;
                }
            }

            // Фильтруем категории с валидными именами (проверяем и name и title)
            console.log('🧹 Фильтруем категории с валидными именами...');
            const validCategories = allCategories.filter(category => {
                const categoryName = category.name || category.title;
                const isValid = categoryName && categoryName.trim() !== '';
                if (!isValid) {
                    console.log('❌ Категория с невалидным именем:', category);
                }
                return isValid;
            });
            console.log(`✅ Категории с валидными именами: ${validCategories.length}`);

            if (validCategories.length === 0) {
                this.inparsCategoriesSlimSelect.setData([
                    { text: 'Нет подходящих категорий (sectionId=1, typeId=2)', value: '', disabled: true }
                ]);
                return;
            }

            // Строим иерархическую структуру
            console.log('🏗️ Строим иерархическую структуру...');
            const hierarchy = this.buildCategoryHierarchy(validCategories);
            console.log('📊 Корневых категорий в иерархии:', hierarchy.length);
            
            // Подготавливаем данные для SlimSelect
            console.log('⚙️ Подготавливаем данные для SlimSelect...');
            const slimSelectData = this.prepareCategoriesForSlimSelect(hierarchy, 0);
            console.log('📝 Подготовлено элементов для SlimSelect:', slimSelectData.length);
            
            // Добавляем опцию "Все категории" в начало
            slimSelectData.unshift({
                text: 'Все категории (показаны доступные)',
                value: '',
                selected: false
            });

            // Загружаем данные в SlimSelect
            console.log('🔄 Загружаем данные в SlimSelect...');
            this.inparsCategoriesSlimSelect.setData(slimSelectData);

            console.log(`✅ Загружено ${validCategories.length} категорий Inpars`);

        } catch (error) {
            console.error('❌ Ошибка загрузки категорий Inpars:', error);
            if (this.inparsCategoriesSlimSelect) {
                this.inparsCategoriesSlimSelect.setData([
                    { text: 'Ошибка загрузки категорий', value: '', disabled: true }
                ]);
            }
        }
    }

    /**
     * Построение иерархической структуры категорий
     */
    buildCategoryHierarchy(categories) {
        const categoryMap = new Map();
        const rootCategories = [];

        // Создаем мапу всех категорий
        categories.forEach(category => {
            categoryMap.set(category.inpars_id, {
                ...category,
                children: []
            });
        });

        // Строим иерархию
        categories.forEach(category => {
            const categoryNode = categoryMap.get(category.inpars_id);
            
            if (category.parent_id && categoryMap.has(category.parent_id)) {
                // Добавляем к родительской категории
                categoryMap.get(category.parent_id).children.push(categoryNode);
            } else {
                // Корневая категория
                rootCategories.push(categoryNode);
            }
        });

        return rootCategories;
    }

    /**
     * Подготовка данных категорий для SlimSelect
     */
    prepareCategoriesForSlimSelect(categories, level) {
        const data = [];
        
        categories.forEach(category => {
            // Формируем текст с отступами для иерархии
            const indent = '　'.repeat(level); // Используем широкий пробел для лучшего отображения
            const categoryName = category.name || category.title;
            let text = indent + categoryName;
            
            // Добавляем статус неактивной категории
            const isActive = category.is_active !== false; // по умолчанию активна
            if (!isActive) {
                text += ' (неактивна)';
            }
            
            data.push({
                text: text,
                value: category.inpars_id.toString(),
                disabled: !isActive,
                selected: false
            });

            // Рекурсивно добавляем дочерние категории
            if (category.children && category.children.length > 0) {
                const childrenData = this.prepareCategoriesForSlimSelect(category.children, level + 1);
                data.push(...childrenData);
            }
        });
        
        return data;
    }

    /**
     * Проверка доступности токена API Inpars
     */
    async checkInparsToken() {
        try {
            const token = await db.getSetting('inpars_api_token');
            const statusElement = document.getElementById('inparsLoadStatus');
            const loadButton = document.getElementById('loadInparsListingsBtn');

            if (!token) {
                if (statusElement) {
                    statusElement.innerHTML = '<span class="text-red-600">⚠️ Токен API не настроен</span>';
                }
                if (loadButton) {
                    loadButton.disabled = true;
                    loadButton.textContent = 'Настройте токен API';
                }
                return false;
            }

            if (statusElement) {
                statusElement.textContent = '✅ API готов к работе';
                statusElement.className = 'text-sm text-green-600';
            }
            
            // Обновляем статус в информационной панели
            const apiStatusElement = document.getElementById('inparsApiStatus');
            if (apiStatusElement) {
                apiStatusElement.textContent = '✅ Активен';
                apiStatusElement.className = 'font-medium text-green-600';
            }
            if (loadButton) {
                loadButton.disabled = false;
                loadButton.textContent = 'Загрузить объявления';
            }

            return true;

        } catch (error) {
            console.error('Ошибка проверки токена Inpars:', error);
            return false;
        }
    }

    /**
     * Основной метод загрузки объявлений из Inpars
     */
    async loadInparsListings() {
        try {
            // Проверяем готовность
            if (!this.currentArea) {
                this.showNotification('Область не загружена', 'error');
                return;
            }

            if (!this.currentArea.polygon || this.currentArea.polygon.length < 3) {
                this.showNotification('Полигон области не определен', 'error');
                return;
            }

            const hasToken = await this.checkInparsToken();
            if (!hasToken) {
                this.showNotification('Токен API Inpars не настроен. Перейдите в настройки.', 'error');
                return;
            }

            // Получаем выбранные категории
            const selectedCategories = this.getSelectedCategories();
            
            // Получаем выбранные источники
            const selectedSources = this.getSelectedSources();

            console.log(`Начинаем импорт из Inpars:`, {
                polygon: this.currentArea.polygon.length + ' точек',
                categories: selectedCategories.length,
                sources: selectedSources.length
            });

            // Показываем прогресс
            this.showImportProgress('Подготовка к импорту...', 0);

            // Запускаем импорт
            const result = await window.inparsAPI.importAllListingsByPolygon(
                this.currentArea.polygon,
                selectedCategories,
                selectedSources,
                (progress) => this.updateImportProgress(progress)
            );

            if (result.success) {
                // Обрабатываем полученные данные
                await this.processInparsListings(result.listings);
                
                this.showNotification(
                    `Импорт завершен! Загружено ${result.totalCount} объявлений за ${result.totalPages} страниц`, 
                    'success'
                );
                
                // Обновляем карту и таблицы
                await this.refreshMapData();
                
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Ошибка импорта из Inpars:', error);
            this.showNotification(`Ошибка импорта: ${error.message}`, 'error');
        } finally {
            this.hideImportProgress();
        }
    }

    /**
     * Получение выбранных категорий
     */
    getSelectedCategories() {
        if (this.inparsCategoriesSlimSelect) {
            // Используем SlimSelect API для получения выбранных значений
            const selected = this.inparsCategoriesSlimSelect.getSelected();
            const values = selected.map(item => item.value).filter(value => value && value !== '');
            
            console.log(`📋 Выбрано категорий: ${values.length}`, values);
            
            return values;
        } else {
            // Fallback для обычного select элемента
            const select = document.getElementById('inparsCategoriesSelect');
            if (!select) return [];

            const selectedOptions = Array.from(select.selectedOptions);
            const values = selectedOptions.map(option => option.value).filter(value => value);
            
            console.log(`📋 Выбрано категорий (fallback): ${values.length}`, values);
            
            return values;
        }
    }

    /**
     * Получение выбранных источников
     */
    getSelectedSources() {
        // Поскольку выбор источников убран из интерфейса, возвращаем все основные источники
        return ['avito', 'cian'];
    }

    /**
     * Показ прогресса импорта
     */
    showImportProgress(message, percentage = 0) {
        const statusElement = document.getElementById('inparsStatus');
        const loadButton = document.getElementById('loadInparsListingsBtn');
        
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="flex items-center space-x-2">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span class="text-blue-600">${message}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
                </div>
            `;
        }
        
        if (loadButton) {
            loadButton.disabled = true;
            loadButton.textContent = 'Импорт...';
        }
    }

    /**
     * Обновление прогресса импорта
     */
    updateImportProgress(progress) {
        // Элементы нового прогресс-бара
        const progressContainer = document.getElementById('inparsLoadProgress');
        const statusElement = document.getElementById('inparsLoadStatus');
        const percentageElement = document.getElementById('inparsLoadPercentage');
        const progressBar = document.getElementById('inparsProgressBar');
        const currentPageElement = document.getElementById('inparsCurrentPage');
        const loadedCountElement = document.getElementById('inparsLoadedCount');
        const elapsedTimeElement = document.getElementById('inparsElapsedTime');
        
        if (!progressContainer || !statusElement) return;

        // Показываем прогресс-бар при первом обновлении
        if (progressContainer.classList.contains('hidden')) {
            progressContainer.classList.remove('hidden');
            this.importStartTime = Date.now();
        }

        if (progress.status === 'loading') {
            // Обновляем статус
            statusElement.textContent = progress.message || 'Загрузка объявлений...';
            
            // Примерный расчет процента (не можем знать точно сколько страниц будет)
            const estimatedProgress = Math.min((progress.page * 15), 85); // До 85% пока не завершится
            
            if (percentageElement) {
                percentageElement.textContent = `${Math.round(estimatedProgress)}%`;
            }
            
            if (progressBar) {
                progressBar.style.width = `${estimatedProgress}%`;
            }
            
            // Обновляем статистику
            if (currentPageElement) {
                currentPageElement.textContent = progress.page || 1;
            }
            
            if (loadedCountElement) {
                loadedCountElement.textContent = progress.totalLoaded || 0;
            }
            
            // Рассчитываем время
            if (elapsedTimeElement && this.importStartTime) {
                const elapsed = Math.floor((Date.now() - this.importStartTime) / 1000);
                elapsedTimeElement.textContent = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m ${elapsed%60}s`;
            }
            
        } else if (progress.status === 'completed') {
            // Завершение загрузки
            statusElement.textContent = progress.message || 'Загрузка завершена';
            
            if (percentageElement) {
                percentageElement.textContent = '100%';
            }
            
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.classList.remove('bg-blue-600');
                progressBar.classList.add('bg-green-600');
            }
            
            // Скрываем прогресс через 3 секунды
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                // Сбрасываем стили
                if (progressBar) {
                    progressBar.style.width = '0%';
                    progressBar.classList.remove('bg-green-600');
                    progressBar.classList.add('bg-blue-600');
                }
            }, 3000);
            
        } else if (progress.status === 'error') {
            // Ошибка загрузки
            statusElement.textContent = progress.message || 'Ошибка загрузки';
            
            if (progressBar) {
                progressBar.classList.remove('bg-blue-600');
                progressBar.classList.add('bg-red-600');
            }
            
            // Скрываем прогресс через 5 секунд
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                // Сбрасываем стили
                if (progressBar) {
                    progressBar.style.width = '0%';
                    progressBar.classList.remove('bg-red-600');
                    progressBar.classList.add('bg-blue-600');
                }
            }, 5000);
        }
    }

    /**
     * Скрытие прогресса импорта
     */
    hideImportProgress() {
        const statusElement = document.getElementById('inparsStatus');
        const loadButton = document.getElementById('loadInparsListingsBtn');
        
        if (statusElement) {
            statusElement.innerHTML = '<span class="text-green-600">✅ API готов к работе</span>';
        }
        
        if (loadButton) {
            loadButton.disabled = false;
            loadButton.textContent = 'Загрузить объявления';
        }
    }

    /**
     * Обработка полученных объявлений из Inpars
     */
    async processInparsListings(inparsListings) {
        try {
            let imported = 0;
            let updated = 0;
            let errors = 0;

            for (const inparsListing of inparsListings) {
                try {
                    // Конвертируем данные Inpars в модель расширения
                    const listing = ListingModel.fromInparsAPI(inparsListing);
                    
                    // Проверяем, существует ли уже такое объявление
                    const existingListing = await db.getListingByExternalId(listing.source, listing.external_id);
                    
                    if (existingListing) {
                        // Обновляем существующее объявление если данные новее
                        const existingDate = new Date(existingListing.last_update_date);
                        const newDate = new Date(listing.last_update_date);
                        
                        if (newDate > existingDate) {
                            listing.id = existingListing.id;
                            listing.address_id = existingListing.address_id;
                            listing.created_at = existingListing.created_at;
                            
                            await db.updateListing(listing);
                            updated++;
                        }
                    } else {
                        // Добавляем новое объявление
                        await db.addListing(listing);
                        imported++;
                    }
                    
                } catch (error) {
                    console.error('Ошибка обработки объявления:', error);
                    errors++;
                }
            }

            console.log(`Обработка завершена: импортировано ${imported}, обновлено ${updated}, ошибок ${errors}`);
            
            return { imported, updated, errors };

        } catch (error) {
            console.error('Ошибка обработки объявлений Inpars:', error);
            throw error;
        }
    }

    /**
     * Показать детали объявления в модальном окне
     */
    async showListingDetails(listingId) {
        try {
            const listing = this.listings.find(l => l.id === listingId);
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                return;
            }

            const modalContent = document.getElementById('modalContent');
            modalContent.innerHTML = this.renderListingDetails(listing);

            // Сохраняем URL для кнопки "Открыть объявление"
            this.currentListingUrl = listing.url;

            // Показываем модальное окно
            document.getElementById('listingModal').classList.remove('hidden');

            // Инициализируем Fotorama и график цены после отображения модального окна
            setTimeout(() => {
                const galleryElement = document.getElementById(`listing-gallery-${listingId}`);
                if (galleryElement && window.$ && $.fn.fotorama) {
                    $(galleryElement).fotorama();
                }
                
                // Инициализируем график изменения цены
                this.renderPriceChart(listing);
                
                // Карта местоположения будет инициализирована при разворачивании панели
                
                // Добавляем обработчик для сворачивания панели местоположения
                const locationHeader = document.getElementById(`locationPanelHeader-${listingId}`);
                if (locationHeader) {
                    locationHeader.addEventListener('click', () => {
                        this.toggleLocationPanel(listingId);
                    });
                }
                
                // Инициализируем выпадающий список адресами
                this.initializeAddressSelector(listingId, listing.address_id);
                
                // Добавляем обработчик для сохранения адреса
                const saveButton = document.getElementById(`saveAddress_${listingId}`);
                if (saveButton) {
                    saveButton.addEventListener('click', () => {
                        this.saveListingAddress(listingId);
                    });
                }
                
                // Добавляем обработчик для сворачивания панели истории цен
                const priceHistoryHeader = document.getElementById(`priceHistoryPanelHeader-${listingId}`);
                if (priceHistoryHeader) {
                    priceHistoryHeader.addEventListener('click', () => {
                        this.togglePriceHistoryPanel(listingId);
                    });
                }
                
                // Инициализируем таблицу истории цен
                this.initializePriceHistoryTable(listingId, listing);
                
                // Добавляем обработчик для добавления новой цены
                const addPriceButton = document.getElementById(`addPriceEntry-${listingId}`);
                if (addPriceButton) {
                    addPriceButton.addEventListener('click', () => {
                        this.addPriceEntry(listingId);
                    });
                }
                
                // Инициализируем модальное окно редактирования цены
                this.initializePriceEditModal(listingId);
            }, 100);

        } catch (error) {
            console.error('Ошибка загрузки деталей:', error);
            // Можно добавить уведомление об ошибке
        }
    }

    /**
     * Рендер деталей объявления
     */
    renderListingDetails(listing) {
        // Обрабатываем фотографии
        const photos = this.getListingPhotos(listing);
        
        console.log(`📸 Объявление ${listing.id}: найдено фотографий: ${photos.length}`);
        console.log('📸 Поля с фотографиями в объявлении:', {
            photos: listing.photos,
            images: listing.images,
            photo_urls: listing.photo_urls,
            main_photo: listing.main_photo,
            photo: listing.photo,
            image_url: listing.image_url
        });
        
        return `
            <!-- Карта местоположения -->
            <div class="mb-6">
                <div class="bg-white shadow overflow-hidden sm:rounded-md border border-gray-200">
                    <div class="px-4 py-3 cursor-pointer" id="locationPanelHeader-${listing.id}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <span class="text-lg font-medium text-gray-900">📍 Местоположение</span>
                                <span class="text-sm ${this.getAddressStatusClass(listing)}">${this.getAddressStatusText(listing)}</span>
                            </div>
                            <svg id="locationPanelChevron-${listing.id}" class="h-5 w-5 text-gray-400 transform transition-transform duration-200" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                    </div>
                    <div id="locationPanelContent-${listing.id}" class="px-4 pb-4" style="display: none;">
                        ${this.renderAddressAccuracyInfo(listing)}
                        <div id="listing-map-${listing.id}" class="h-64 bg-gray-200 rounded-md mt-3">
                            <!-- Карта будет отрендерена здесь -->
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Фотогалерея -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Фотографии ${photos.length > 0 ? `(${photos.length})` : '(не найдены)'}</h4>
                ${photos.length > 0 ? `
                    <div class="fotorama" 
                         data-nav="thumbs" 
                         data-width="100%" 
                         data-height="400"
                         data-thumbheight="50"
                         data-thumbwidth="50"
                         data-allowfullscreen="true"
                         data-transition="slide"
                         data-loop="true"
                         id="listing-gallery-${listing.id}">
                        ${photos.map(photo => `<img src="${photo}" alt="Фото объявления">`).join('')}
                    </div>
                ` : `
                    <div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                        📷 Фотографии не найдены
                    </div>
                `}
            </div>
            
            <!-- График изменения цены -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">График изменения цены</h4>
                <div id="listing-price-chart-${listing.id}" class="w-full">
                    <!-- График будет отрендерен здесь -->
                </div>
            </div>
            
            <!-- История изменения цен -->
            <div class="mb-6">
                <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div id="priceHistoryPanelHeader-${listing.id}" class="px-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors duration-150">
                        <div class="flex items-center justify-between">
                            <h4 class="text-lg font-medium text-gray-900">История изменения цен</h4>
                            <svg id="priceHistoryPanelChevron-${listing.id}" class="h-5 w-5 text-gray-400 transform transition-transform duration-200 rotate-[-90deg]" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                    </div>
                    <div id="priceHistoryPanelContent-${listing.id}" class="px-4 pb-4" style="display: none;">
                        <div class="mt-4 mb-4">
                            <button id="addPriceEntry-${listing.id}" class="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                Добавить изменение цены
                            </button>
                        </div>
                        <div class="overflow-x-auto">
                            <table id="priceHistoryTable-${listing.id}" class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    <!-- Данные будут загружены через DataTable -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Модальное окно редактирования цены -->
            <div id="editPriceModal-${listing.id}" class="hidden fixed inset-0 z-50 overflow-y-auto" aria-labelledby="edit-price-modal-title" role="dialog" aria-modal="true">
                <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-4 text-center sm:block sm:p-0">
                    <!-- Overlay -->
                    <div class="fixed inset-0 z-0 transition-opacity" style="background-color: rgba(0, 0, 0, 0.1);" aria-hidden="true"></div>
                    
                    <!-- Выравнивание центра -->
                    <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                    
                    <!-- Содержимое модального окна -->
                    <div class="inline-block align-bottom bg-white border rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md relative z-10">
                        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div class="sm:flex sm:items-start">
                                <div class="w-full">
                                    <!-- Заголовок -->
                                    <div class="mb-4">
                                        <h3 class="text-lg font-medium leading-6 text-gray-900" id="editPriceModalTitle-${listing.id}">
                                            Редактировать цену
                                        </h3>
                                    </div>
                                    
                                    <!-- Форма -->
                                    <form id="editPriceForm-${listing.id}">
                                        <div class="mb-4">
                                            <label for="priceInput-${listing.id}" class="block text-sm font-medium text-gray-700 mb-2">
                                                Цена (₽)
                                            </label>
                                            <input type="text" id="priceInput-${listing.id}" 
                                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                   placeholder="Введите цену">
                                        </div>
                                        <div class="mb-6">
                                            <label for="dateInput-${listing.id}" class="block text-sm font-medium text-gray-700 mb-2">
                                                Дата изменения
                                            </label>
                                            <input type="datetime-local" id="dateInput-${listing.id}" 
                                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button type="submit" form="editPriceForm-${listing.id}" id="saveEditPrice-${listing.id}" 
                                    class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">
                                Сохранить
                            </button>
                            <button type="button" id="cancelEditPrice-${listing.id}" 
                                    class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm">
                                Отмена
                            </button>
                        </div>
                    </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Основная информация -->
                <div>
                    <h4 class="text-lg font-medium text-gray-900 mb-4">Основная информация</h4>
                    <dl class="space-y-3">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Заголовок</dt>
                            <dd class="text-sm text-gray-900">${this.escapeHtml(listing.title || '-')}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Адрес</dt>
                            <dd class="text-sm text-gray-900">${this.escapeHtml(listing.address || '-')}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Цена</dt>
                            <dd class="text-sm text-gray-900">${this.formatPrice(listing.price)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Цена за м²</dt>
                            <dd class="text-sm text-gray-900">${listing.price_per_meter ? this.formatPrice(listing.price_per_meter) + '/м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Источник</dt>
                            <dd class="text-sm text-gray-900">${listing.source}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Статус</dt>
                            <dd class="text-sm text-gray-900">${this.getStatusText(listing.status)}</dd>
                        </div>
                    </dl>
                </div>

                <!-- Характеристики недвижимости -->
                <div>
                    <h4 class="text-lg font-medium text-gray-900 mb-4">Характеристики</h4>
                    <dl class="space-y-3">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Тип недвижимости</dt>
                            <dd class="text-sm text-gray-900">${this.formatPropertyType(listing.property_type)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Общая площадь</dt>
                            <dd class="text-sm text-gray-900">${listing.area_total ? listing.area_total + ' м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Жилая площадь</dt>
                            <dd class="text-sm text-gray-900">${listing.area_living ? listing.area_living + ' м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Площадь кухни</dt>
                            <dd class="text-sm text-gray-900">${listing.area_kitchen ? listing.area_kitchen + ' м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Этаж</dt>
                            <dd class="text-sm text-gray-900">${listing.floor ? `${listing.floor}${listing.total_floors || listing.floors_total ? ` из ${listing.total_floors || listing.floors_total}` : ''}` : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Количество комнат</dt>
                            <dd class="text-sm text-gray-900">${listing.rooms || '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Состояние</dt>
                            <dd class="text-sm text-gray-900">${listing.condition || '-'}</dd>
                        </div>
                    </dl>
                </div>

                <!-- Дополнительная информация -->
                <div class="lg:col-span-2">
                    <h4 class="text-lg font-medium text-gray-900 mb-4">Дополнительная информация</h4>
                    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Сегмент</dt>
                            <dd class="text-sm text-gray-900">${this.getSegmentName(listing.segment_id)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">External ID</dt>
                            <dd class="text-sm text-gray-900">${listing.external_id || '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Дата добавления</dt>
                            <dd class="text-sm text-gray-900">${this.formatDate(listing.created_at || listing.listing_date)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Последнее обновление</dt>
                            <dd class="text-sm text-gray-900">${this.formatDate(listing.updated_at || listing.last_update_date)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Последняя проверка</dt>
                            <dd class="text-sm text-gray-900">${this.formatDate(listing.last_seen)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Продавец</dt>
                            <dd class="text-sm text-gray-900">${listing.seller_name || '-'}</dd>
                        </div>
                    </dl>

                    ${listing.description ? `
                        <div class="mt-6">
                            <dt class="text-sm font-medium text-gray-500 mb-2">Описание</dt>
                            <dd class="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">${this.escapeHtml(listing.description)}</dd>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Получить фотографии объявления
     */
    getListingPhotos(listing) {
        const photos = [];
        
        // Проверяем различные возможные поля с фотографиями
        if (listing.photos && Array.isArray(listing.photos)) {
            photos.push(...listing.photos);
        } else if (listing.images && Array.isArray(listing.images)) {
            photos.push(...listing.images);
        } else if (listing.photo_urls && Array.isArray(listing.photo_urls)) {
            photos.push(...listing.photo_urls);
        } else if (listing.main_photo) {
            photos.push(listing.main_photo);
        }
        
        // Проверяем поля с одиночными фотографиями
        if (listing.photo && !photos.includes(listing.photo)) {
            photos.push(listing.photo);
        }
        
        if (listing.image_url && !photos.includes(listing.image_url)) {
            photos.push(listing.image_url);
        }
        
        // Фильтруем валидные URL
        return photos.filter(photo => 
            photo && 
            typeof photo === 'string' && 
            (photo.startsWith('http://') || photo.startsWith('https://'))
        );
    }

    /**
     * Закрыть модальное окно
     */
    closeModal() {
        // Уничтожаем Fotorama перед закрытием модального окна
        const galleries = document.querySelectorAll('.fotorama');
        galleries.forEach(gallery => {
            if (window.$ && $.fn.fotorama) {
                $(gallery).fotorama().data('fotorama')?.destroy();
            }
        });
        
        document.getElementById('listingModal').classList.add('hidden');
        this.currentListingUrl = null;
    }

    /**
     * Открыть текущее объявление
     */
    openCurrentListing() {
        if (this.currentListingUrl) {
            chrome.tabs.create({ url: this.currentListingUrl });
        }
    }

    /**
     * Получить текстовое описание статуса
     */
    getStatusText(status) {
        const statusMap = {
            'active': 'Активное',
            'archived': 'Архивное',
            'sold': 'Продано',
            'withdrawn': 'Снято с продажи'
        };
        return statusMap[status] || status;
    }

    /**
     * Получить название сегмента
     */
    getSegmentName(segmentId) {
        if (!segmentId) return '-';
        const segment = this.segments.find(s => s.id === segmentId);
        return segment ? segment.name : `Сегмент ${segmentId}`;
    }

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Обрезать текст
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Получить название адреса по ID
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses) return '';
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address : '';
    }

    /**
     * Форматирование цены
     */
    formatPrice(price) {
        if (!price || price === 0) return '₽0';
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(price);
    }

    /**
     * Форматирование даты
     */
    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Форматирование типа недвижимости
     */
    formatPropertyType(type) {
        const types = {
            'studio': 'Студия',
            '1k': '1к',
            '2k': '2к', 
            '3k': '3к',
            '4k+': '4к+',
            'house': 'Дом',
            'land': 'Участок',
            'commercial': 'Коммерческая'
        };
        return types[type] || type || '-';
    }

    /**
     * Рендер графика изменения цены для объявления
     */
    renderPriceChart(listing) {
        try {
            const chartContainer = document.getElementById(`listing-price-chart-${listing.id}`);
            if (!chartContainer) {
                console.warn('Контейнер графика не найден');
                return;
            }

            // Подготавливаем данные для графика из истории цен
            const priceHistory = this.preparePriceHistoryData(listing);
            
            if (priceHistory.length === 0) {
                chartContainer.innerHTML = '<div class="text-center text-gray-500 py-8">История цен отсутствует</div>';
                return;
            }

            const seriesData = priceHistory.map(item => [item.date, item.price]);
            const prices = priceHistory.map(item => item.price);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);

            let series = [{
                "name": "<span class=\"text-sky-500\">цена</span>",
                "data": seriesData
            }];
            let colors = ["#56c2d6"];
            let widths = ["3"];

            var options = {
                chart: {
                    height: 300,
                    locales: [{
                        "name": "ru",
                        "options": {
                            "months": [
                                "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                                "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
                            ],
                            "shortMonths": [
                                "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
                                "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
                            ],
                            "days": [
                                "Воскресенье", "Понедельник", "Вторник", "Среда", 
                                "Четверг", "Пятница", "Суббота"
                            ],
                            "shortDays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
                            "toolbar": {
                                "exportToSVG": "Сохранить SVG",
                                "exportToPNG": "Сохранить PNG",
                                "exportToCSV": "Сохранить CSV",
                                "menu": "Меню",
                                "selection": "Выбор",
                                "selectionZoom": "Выбор с увеличением",
                                "zoomIn": "Увеличить",
                                "zoomOut": "Уменьшить",
                                "pan": "Перемещение",
                                "reset": "Сбросить увеличение"
                            }
                        }
                    }],
                    defaultLocale: "ru",
                    type: 'line',
                    shadow: {
                        enabled: false,
                        color: 'rgba(187,187,187,0.47)',
                        top: 3,
                        left: 2,
                        blur: 3,
                        opacity: 1
                    },
                    toolbar: {
                        show: false
                    }
                },
                stroke: {
                    curve: 'stepline',
                    width: widths
                },
                series: series,
                colors: colors,
                xaxis: {
                    type: 'datetime',
                    labels: {
                        format: 'dd MMM'
                    }
                },
                markers: {
                    size: 4,
                    opacity: 0.9,
                    colors: ["#56c2d6"],
                    strokeColor: "#fff",
                    strokeWidth: 2,
                    style: 'inverted',
                    hover: {
                        size: 8
                    }
                },
                tooltip: {
                    shared: false,
                    intersect: true,
                    x: {
                        format: 'dd MMM yyyy'
                    },
                    y: {
                        formatter: (value) => this.formatPrice(value)
                    }
                },
                yaxis: {
                    min: Math.floor(minPrice * 0.95),
                    max: Math.ceil(maxPrice * 1.05),
                    title: {
                        text: 'Цена, ₽'
                    },
                    labels: {
                        formatter: (value) => this.formatPrice(value)
                    }
                },
                grid: {
                    show: true,
                    position: 'back',
                    xaxis: {
                        lines: {
                            show: true,
                        }
                    },
                    yaxis: {
                        lines: {
                            show: true,
                        }
                    },
                    borderColor: '#eeeeee',
                },
                legend: {
                    show: false
                },
                responsive: [{
                    breakpoint: 600,
                    options: {
                        chart: {
                            toolbar: {
                                show: false
                            }
                        }
                    }
                }]
            };

            // Очищаем контейнер и создаем график
            chartContainer.innerHTML = '';
            const chart = new ApexCharts(chartContainer, options);
            chart.render();

        } catch (error) {
            console.error('Ошибка создания графика цены:', error);
            const chartContainer = document.getElementById(`listing-price-chart-${listing.id}`);
            if (chartContainer) {
                chartContainer.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки графика</div>';
            }
        }
    }

    /**
     * Подготовка данных истории цен для графика
     */
    preparePriceHistoryData(listing) {
        const history = [];
        
        // Добавляем текущую цену
        if (listing.price) {
            const currentDate = new Date(listing.updated_at || listing.last_update_date || listing.created_at || Date.now());
            history.push({
                date: currentDate.getTime(),
                price: parseInt(listing.price)
            });
        }

        // Добавляем историю цен если есть
        if (listing.price_history && Array.isArray(listing.price_history)) {
            listing.price_history.forEach(item => {
                if ((item.new_price || item.price) && item.date) {
                    history.push({
                        date: new Date(item.date).getTime(),
                        price: parseInt(item.new_price || item.price)
                    });
                }
            });
        }

        // Сортируем по дате
        history.sort((a, b) => a.date - b.date);
        
        // Убираем дубликаты цен подряд
        const filtered = [];
        for (let i = 0; i < history.length; i++) {
            if (i === 0 || history[i].price !== history[i-1].price) {
                filtered.push(history[i]);
            }
        }

        return filtered;
    }

    /**
     * Рендер карты местоположения объявления
     * @param {Object} listing - Объявление
     */
    renderListingMap(listing) {
        try {
            const mapContainer = document.getElementById(`listing-map-${listing.id}`);
            if (!mapContainer) {
                console.warn('Контейнер карты не найден');
                return;
            }

            // Получаем координаты для отображения
            const coords = this.getListingCoordinates(listing);
            if (!coords) {
                mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">⚠️ Координаты не найдены</div>';
                return;
            }

            console.log(`🗺️ Инициализируем карту для объявления ${listing.id} с координатами:`, coords);

            // Создаем карту
            const listingMap = L.map(`listing-map-${listing.id}`, {
                center: [coords.lat, coords.lng],
                zoom: 16,
                zoomControl: true,
                scrollWheelZoom: false
            });

            // Добавляем слой карты
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(listingMap);

            // Добавляем маркер объявления
            const listingMarker = L.marker([coords.lat, coords.lng], {
                icon: L.divIcon({
                    className: 'listing-marker',
                    html: `<div style="background: #3b82f6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(listingMap);

            // Добавляем popup к маркеру
            const markerPopupContent = `
                <div style="min-width: 200px;">
                    <strong>${this.escapeHtml(listing.title || 'Объявление')}</strong><br>
                    <span style="color: #6b7280; font-size: 12px;">${this.escapeHtml(listing.address || 'Адрес не указан')}</span><br>
                    <span style="color: #059669; font-weight: bold;">${this.formatPrice(listing.price)}</span>
                    ${listing.price_per_meter ? `<br><span style="color: #6b7280; font-size: 12px;">${this.formatPrice(listing.price_per_meter)}/м²</span>` : ''}
                </div>
            `;
            listingMarker.bindPopup(markerPopupContent);

            // Если есть связанный адрес, добавляем дополнительный маркер
            if (listing.address_id && listing.address_id !== coords.source) {
                const linkedAddress = this.addresses.find(addr => addr.id === listing.address_id);
                if (linkedAddress && linkedAddress.coordinates && 
                    linkedAddress.coordinates.lat && linkedAddress.coordinates.lng) {
                    
                    const addressCoords = {
                        lat: parseFloat(linkedAddress.coordinates.lat),
                        lng: parseFloat(linkedAddress.coordinates.lng)
                    };

                    // Проверяем, что координаты адреса отличаются от координат объявления
                    const distance = this.calculateDistance(coords, addressCoords);
                    if (distance > 10) { // Если расстояние больше 10 метров
                        const addressMarker = L.marker([addressCoords.lat, addressCoords.lng], {
                            icon: L.divIcon({
                                className: 'address-marker',
                                html: `<div style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🏠</div>`,
                                iconSize: [20, 20],
                                iconAnchor: [10, 10]
                            })
                        }).addTo(listingMap);

                        addressMarker.bindPopup(`
                            <div style="min-width: 150px;">
                                <strong>Определённый адрес</strong><br>
                                <span style="color: #6b7280; font-size: 12px;">${this.escapeHtml(linkedAddress.address || 'Адрес')}</span><br>
                                <span style="color: #059669; font-size: 11px;">Расстояние: ${Math.round(distance)}м</span>
                            </div>
                        `);

                        // Добавляем линию между маркерами
                        L.polyline([
                            [coords.lat, coords.lng],
                            [addressCoords.lat, addressCoords.lng]
                        ], {
                            color: '#6b7280',
                            weight: 2,
                            opacity: 0.7,
                            dashArray: '5, 5'
                        }).addTo(listingMap);

                        // Подгоняем вид карты под оба маркера
                        const group = new L.featureGroup([listingMarker, addressMarker]);
                        listingMap.fitBounds(group.getBounds().pad(0.1));
                    }
                }
            }

            // Сохраняем ссылку на карту для возможной очистки
            mapContainer._leafletMap = listingMap;

        } catch (error) {
            console.error('Ошибка инициализации карты объявления:', error);
            const mapContainer = document.getElementById(`listing-map-${listing.id}`);
            if (mapContainer) {
                mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки карты</div>';
            }
        }
    }

    /**
     * Переключение видимости панели истории цен
     */
    togglePriceHistoryPanel(listingId) {
        const content = document.getElementById(`priceHistoryPanelContent-${listingId}`);
        const chevron = document.getElementById(`priceHistoryPanelChevron-${listingId}`);
        
        if (!content || !chevron) return;

        const isHidden = content.style.display === 'none';
        
        if (isHidden) {
            // Разворачиваем
            content.style.display = 'block';
            chevron.style.transform = 'rotate(0deg)';
        } else {
            // Сворачиваем
            content.style.display = 'none';
            chevron.style.transform = 'rotate(-90deg)';
        }
    }

    /**
     * Инициализация таблицы истории цен
     */
    async initializePriceHistoryTable(listingId, listing) {
        try {
            const tableElement = document.getElementById(`priceHistoryTable-${listingId}`);
            if (!tableElement) return;

            // Подготавливаем данные для таблицы
            const tableData = this.preparePriceHistoryTableData(listing);

            // Инициализируем DataTable
            const dataTable = $(tableElement).DataTable({
                data: tableData,
                language: {
                    url: '../libs/datatables/ru.json'
                },
                pageLength: 10,
                searching: false,
                ordering: true,
                order: [[0, 'desc']], // Сортировка по дате (новые сверху)
                columnDefs: [
                    {
                        targets: 2, // Колонка "Действия"
                        orderable: false,
                        searchable: false,
                        className: 'text-center',
                        width: '120px'
                    }
                ],
                columns: [
                    {
                        title: 'Дата',
                        data: 'date',
                        render: function (data, type, row) {
                            if (type === 'display') {
                                const date = new Date(data);
                                return date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
                            }
                            return data;
                        }
                    },
                    {
                        title: 'Цена',
                        data: 'price',
                        render: function (data, type, row) {
                            if (type === 'display') {
                                return new Intl.NumberFormat('ru-RU').format(data) + ' ₽';
                            }
                            return data;
                        }
                    },
                    {
                        title: 'Действия',
                        data: null,
                        render: function (data, type, row) {
                            return `
                                <div class="flex space-x-2 justify-center">
                                    <button class="edit-price-btn text-blue-600 hover:text-blue-800 text-sm" data-listing-id="${listingId}" data-index="${row.index}">
                                        Редактировать
                                    </button>
                                    <button class="delete-price-btn text-red-600 hover:text-red-800 text-sm" data-listing-id="${listingId}" data-index="${row.index}">
                                        Удалить
                                    </button>
                                </div>
                            `;
                        }
                    }
                ]
            });

            // Сохраняем ссылку на DataTable
            this[`priceHistoryTable_${listingId}`] = dataTable;

            // Добавляем обработчики для кнопок редактирования и удаления
            $(tableElement).on('click', '.edit-price-btn', (e) => {
                const index = $(e.target).data('index');
                this.editPriceEntry(listingId, index);
            });

            $(tableElement).on('click', '.delete-price-btn', (e) => {
                const index = $(e.target).data('index');
                this.deletePriceEntry(listingId, index);
            });

            console.log(`📊 Инициализирована таблица истории цен для объявления ${listingId}`);

        } catch (error) {
            console.error('Ошибка инициализации таблицы истории цен:', error);
        }
    }

    /**
     * Подготовка данных для таблицы истории цен
     */
    preparePriceHistoryTableData(listing) {
        const data = [];
        let index = 0;

        // Добавляем текущую цену как последнюю запись
        if (listing.price) {
            data.push({
                date: listing.updated_at || listing.created_at || new Date(),
                price: listing.price,
                index: index++,
                isCurrent: true
            });
        }

        // Добавляем историю изменений цен
        if (listing.price_history && Array.isArray(listing.price_history)) {
            listing.price_history.forEach(historyItem => {
                if (historyItem.date && historyItem.new_price) {
                    data.push({
                        date: historyItem.date,
                        price: historyItem.new_price,
                        index: index++,
                        isCurrent: false
                    });
                }
            });
        }

        return data;
    }

    /**
     * Инициализация модального окна редактирования цены
     */
    initializePriceEditModal(listingId) {
        const modal = document.getElementById(`editPriceModal-${listingId}`);
        const form = document.getElementById(`editPriceForm-${listingId}`);
        const priceInput = document.getElementById(`priceInput-${listingId}`);
        const dateInput = document.getElementById(`dateInput-${listingId}`);
        const cancelButton = document.getElementById(`cancelEditPrice-${listingId}`);
        
        if (!modal || !form || !priceInput || !dateInput || !cancelButton) return;

        // Форматирование цены при вводе
        priceInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^\d]/g, ''); // Убираем все кроме цифр
            if (value) {
                // Форматируем с разделителями тысяч
                value = parseInt(value).toLocaleString('ru-RU');
            }
            e.target.value = value;
        });

        // Закрытие модального окна
        const closeModal = () => {
            modal.classList.add('hidden');
            form.reset();
            priceInput.value = '';
            dateInput.value = '';
            this.currentEditingPriceIndex = null;
        };

        // Обработчик отмены
        cancelButton.addEventListener('click', closeModal);

        // Закрытие по клику на фон (overlay)
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('z-0')) {
                closeModal();
            }
        });

        // Обработчик отправки формы
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const priceValue = priceInput.value.replace(/[^\d]/g, ''); // Убираем форматирование
            const price = parseInt(priceValue);
            const date = new Date(dateInput.value);

            if (!price || price <= 0) {
                alert('Пожалуйста, введите корректную цену');
                return;
            }

            if (!dateInput.value || isNaN(date.getTime())) {
                alert('Пожалуйста, выберите корректную дату');
                return;
            }

            this.savePriceEntry(listingId, this.currentEditingPriceIndex, price, date);
            closeModal();
        });
    }

    /**
     * Добавление новой записи о цене
     */
    addPriceEntry(listingId) {
        this.currentEditingPriceIndex = null;
        
        // Заполняем модальное окно для добавления
        const modal = document.getElementById(`editPriceModal-${listingId}`);
        const title = document.getElementById(`editPriceModalTitle-${listingId}`);
        const dateInput = document.getElementById(`dateInput-${listingId}`);
        
        if (!modal || !title || !dateInput) return;

        title.textContent = 'Добавить изменение цены';
        
        // Устанавливаем текущую дату и время
        const now = new Date();
        const isoString = now.getFullYear() + '-' + 
            String(now.getMonth() + 1).padStart(2, '0') + '-' + 
            String(now.getDate()).padStart(2, '0') + 'T' +
            String(now.getHours()).padStart(2, '0') + ':' + 
            String(now.getMinutes()).padStart(2, '0');
        dateInput.value = isoString;
        
        modal.classList.remove('hidden');
    }

    /**
     * Редактирование записи о цене
     */
    editPriceEntry(listingId, index) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) return;

        const tableData = this.preparePriceHistoryTableData(listing);
        const entry = tableData.find(item => item.index === index);
        
        if (!entry) return;

        this.currentEditingPriceIndex = index;

        // Заполняем модальное окно для редактирования
        const modal = document.getElementById(`editPriceModal-${listingId}`);
        const title = document.getElementById(`editPriceModalTitle-${listingId}`);
        const priceInput = document.getElementById(`priceInput-${listingId}`);
        const dateInput = document.getElementById(`dateInput-${listingId}`);
        
        if (!modal || !title || !priceInput || !dateInput) return;

        title.textContent = 'Редактировать цену';
        
        // Заполняем текущие значения
        priceInput.value = entry.price.toLocaleString('ru-RU');
        
        // Форматируем дату для datetime-local
        const date = new Date(entry.date);
        const isoString = date.getFullYear() + '-' + 
            String(date.getMonth() + 1).padStart(2, '0') + '-' + 
            String(date.getDate()).padStart(2, '0') + 'T' +
            String(date.getHours()).padStart(2, '0') + ':' + 
            String(date.getMinutes()).padStart(2, '0');
        dateInput.value = isoString;
        
        modal.classList.remove('hidden');
    }

    /**
     * Удаление записи о цене
     */
    async deletePriceEntry(listingId, index) {
        if (!confirm('Удалить эту запись из истории цен?')) {
            return;
        }

        try {
            const listing = await db.getListing(listingId);
            if (!listing) return;

            const tableData = this.preparePriceHistoryTableData(listing);
            const entry = tableData.find(item => item.index === index);
            
            if (!entry) return;

            if (entry.isCurrent) {
                alert('Нельзя удалить текущую цену объявления');
                return;
            }

            // Удаляем из истории цен
            if (listing.price_history && Array.isArray(listing.price_history)) {
                listing.price_history = listing.price_history.filter(item => {
                    const itemDate = new Date(item.date);
                    const entryDate = new Date(entry.date);
                    return !(itemDate.getTime() === entryDate.getTime() && item.new_price === entry.price);
                });
            }

            // Сохраняем в БД
            await db.updateListing(listing);

            // Обновляем таблицу
            this.refreshPriceHistoryTable(listingId, listing);

            console.log(`✅ Удалена запись из истории цен для объявления ${listingId}`);

        } catch (error) {
            console.error('Ошибка удаления записи:', error);
            alert('Ошибка при удалении записи');
        }
    }

    /**
     * Сохранение записи о цене
     */
    async savePriceEntry(listingId, index, price, date) {
        try {
            const listing = await db.getListing(listingId);
            if (!listing) return;

            if (!listing.price_history) {
                listing.price_history = [];
            }

            if (index !== null && index !== undefined) {
                // Редактируем существующую запись
                const tableData = this.preparePriceHistoryTableData(listing);
                const entry = tableData.find(item => item.index === index);
                
                if (entry && entry.isCurrent) {
                    // Обновляем текущую цену
                    listing.price = price;
                    listing.updated_at = date;
                } else if (entry) {
                    // Обновляем запись в истории
                    const historyIndex = listing.price_history.findIndex(item => {
                        const itemDate = new Date(item.date);
                        const entryDate = new Date(entry.date);
                        return itemDate.getTime() === entryDate.getTime() && item.new_price === entry.price;
                    });
                    
                    if (historyIndex !== -1) {
                        listing.price_history[historyIndex].new_price = price;
                        listing.price_history[historyIndex].date = date;
                    }
                }
            } else {
                // Добавляем новую запись
                listing.price_history.push({
                    date: date,
                    old_price: listing.price,
                    new_price: price
                });
                
                // Обновляем текущую цену если новая дата позже
                const currentDate = new Date(listing.updated_at || listing.created_at);
                if (date > currentDate) {
                    listing.price = price;
                    listing.updated_at = date;
                }
            }

            // Сохраняем в БД
            await db.updateListing(listing);

            // Обновляем таблицу и график
            this.refreshPriceHistoryTable(listingId, listing);

            console.log(`✅ Сохранена запись в истории цен для объявления ${listingId}`);

        } catch (error) {
            console.error('Ошибка сохранения записи:', error);
            alert('Ошибка при сохранении записи');
        }
    }

    /**
     * Обновление таблицы истории цен
     */
    refreshPriceHistoryTable(listingId, listing) {
        const dataTable = this[`priceHistoryTable_${listingId}`];
        if (dataTable) {
            const newData = this.preparePriceHistoryTableData(listing);
            dataTable.clear();
            dataTable.rows.add(newData);
            dataTable.draw();
        }
    }

    /**
     * Вычисление расстояния между двумя точками (формула Haversine)
     * @param {Object} point1 - Первая точка {lat, lng}
     * @param {Object} point2 - Вторая точка {lat, lng}
     * @returns {number} Расстояние в метрах
     */
    calculateDistance(point1, point2) {
        const R = 6371e3; // Радиус Земли в метрах
        const φ1 = point1.lat * Math.PI / 180;
        const φ2 = point2.lat * Math.PI / 180;
        const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
        const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    /**
     * Получение текста статуса адреса для свёрнутого состояния
     * @param {Object} listing - Объявление
     * @returns {string} Краткий статус адреса
     */
    getAddressStatusText(listing) {
        if (listing.address_id) {
            if (listing.address_match_confidence) {
                const confidence = this.getAddressConfidenceText(listing.address_match_confidence);
                const distance = listing.address_distance ? ` (${Math.round(listing.address_distance)}м)` : '';
                return `${confidence}${distance}`;
            } else {
                return 'Определён';
            }
        } else {
            return 'Не определён';
        }
    }

    /**
     * Получение CSS класса для статуса адреса
     * @param {Object} listing - Объявление  
     * @returns {string} CSS класс для цвета
     */
    getAddressStatusClass(listing) {
        if (listing.address_id) {
            if (listing.address_match_confidence) {
                return this.getConfidenceColor(listing.address_match_confidence);
            } else {
                return 'text-green-600';
            }
        } else {
            return 'text-orange-600';
        }
    }

    /**
     * Переключение состояния панели местоположения
     * @param {string} listingId - ID объявления
     */
    toggleLocationPanel(listingId) {
        const content = document.getElementById(`locationPanelContent-${listingId}`);
        const chevron = document.getElementById(`locationPanelChevron-${listingId}`);
        
        if (!content || !chevron) return;

        const isHidden = content.style.display === 'none';
        
        if (isHidden) {
            // Разворачиваем
            content.style.display = 'block';
            chevron.style.transform = 'rotate(0deg)';
            
            // Если карта ещё не была инициализирована, инициализируем её
            const mapContainer = document.getElementById(`listing-map-${listingId}`);
            if (mapContainer && !mapContainer._leafletMap) {
                // Небольшая задержка для корректного отображения карты
                setTimeout(() => {
                    const listing = this.listings.find(l => l.id === listingId);
                    if (listing) {
                        this.renderListingMap(listing);
                    }
                }, 100);
            }
        } else {
            // Сворачиваем
            content.style.display = 'none';
            chevron.style.transform = 'rotate(-90deg)';
        }
    }

}

// Глобальная переменная для доступа к экземпляру класса
let areaPage;

// Делаем класс доступным глобально
window.AreaPage = AreaPage;