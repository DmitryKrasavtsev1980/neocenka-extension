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
        this.sourcesChartInstance = null;
        this.addressConfidenceChartInstance = null;
        this.addressMethodsChartInstance = null;
        this.duplicatesStatusChartInstance = null;
        
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
        
        // Менеджеры будут инициализированы в init() после загрузки DOM

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
        

        // Интеграция с сервисами
        this.servicesIntegration = null;
        
        // SlimSelect instances для фильтров обработки
        this.processingAddressSlimSelect = null;
        this.processingPropertyTypeSlimSelect = null;
        this.processingStatusSlimSelect = null;
        this.sourceFilterSlimSelect = null;
    }
    
    /**
     * Проверка настроек отладки
     */
    async isDebugEnabled() {
        try {
            const settings = await window.db.getSettings();
            return settings.find(s => s.key === 'debug_enabled')?.value === true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Отладочное сообщение с проверкой настроек
     */
    async debugLog(message, ...args) {
        if (await this.isDebugEnabled()) {
            console.log(message, ...args);
        }
    }
    
    /**
     * Проверка существования полигона в области
     */
    hasAreaPolygon() {
        return this.currentArea && 
               this.currentArea.polygon && 
               Array.isArray(this.currentArea.polygon) && 
               this.currentArea.polygon.length >= 3;
    }

    /**
     * Очистка ресурсов при уничтожении компонента
     */
    destroy() {
        try {
            // Уничтожаем интеграцию с сервисами если она была создана
            if (this.servicesIntegration) {
                this.servicesIntegration.destroy();
                this.servicesIntegration = null;
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
            
            if (this.sourceFilterSlimSelect) {
                this.sourceFilterSlimSelect.destroy();
                this.sourceFilterSlimSelect = null;
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

            // Уничтожаем графики если они были созданы
            if (this.sourcesChartInstance) {
                this.sourcesChartInstance.destroy();
                this.sourcesChartInstance = null;
            }

            if (this.addressConfidenceChartInstance) {
                this.addressConfidenceChartInstance.destroy();
                this.addressConfidenceChartInstance = null;
            }

            if (this.addressMethodsChartInstance) {
                this.addressMethodsChartInstance.destroy();
                this.addressMethodsChartInstance = null;
            }

            if (this.duplicatesStatusChartInstance) {
                this.duplicatesStatusChartInstance.destroy();
                this.duplicatesStatusChartInstance = null;
            }

            console.log('AreaPage ресурсы очищены');

        } catch (error) {
            console.error('Ошибка при очистке ресурсов AreaPage:', error);
        }
    }
    
    /**
     * Инициализация менеджеров
     */
    initializeManagers() {
        // Инициализируем DataState
        this.dataState = new DataState();
        
        // Инициализируем EventBus
        this.eventBus = new EventBus();
        
        // Инициализируем ProgressManager
        this.progressManager = new ProgressManager();
        
        // Инициализируем UIManager
        this.uiManager = new UIManager(this.dataState, this.eventBus, this.progressManager);
        
        // Инициализируем SegmentsManager
        this.segmentsManager = new SegmentsManager(this.dataState, this.eventBus, this.progressManager);
    }

    /**
     * Инициализация компонентов интерфейса
     */
    async initUIComponents() {
        // Инициализируем навигацию
        if (typeof NavigationComponent !== 'undefined') {
            const navigation = new NavigationComponent();
            const navContainer = document.getElementById('navigation-container');
            if (navContainer) {
                navContainer.innerHTML = navigation.render();
                navigation.init();
                await Helpers.debugLog('✅ Навигация инициализирована');
            }
        }
        
        // Инициализируем хлебные крошки
        if (typeof BreadcrumbsComponent !== 'undefined') {
            const breadcrumbs = BreadcrumbsComponent.forPage('area');
            const breadcrumbsContainer = document.getElementById('breadcrumbs-container');
            if (breadcrumbsContainer) {
                breadcrumbsContainer.innerHTML = breadcrumbs.render();
                await Helpers.debugLog('✅ Хлебные крошки инициализированы');
            }
        }
        
        // Инициализируем футер
        if (typeof FooterComponent !== 'undefined') {
            const footer = new FooterComponent();
            const footerContainer = document.getElementById('footer-container');
            if (footerContainer) {
                footerContainer.innerHTML = footer.render();
                await Helpers.debugLog('✅ Футер инициализирован');
            }
        }
    }

    /**
     * Инициализация страницы
     */
    async init() {
        try {
            console.log('🚀 Инициализация страницы области...');
            
            // Инициализируем менеджеры (после загрузки DOM и готовности БД)
            this.initializeManagers();
            
            // Инициализируем компоненты интерфейса
            await this.initUIComponents();
            
            // Получаем ID области из URL параметров
            const urlParams = new URLSearchParams(window.location.search);
            this.currentAreaId = urlParams.get('id');
            
            console.log('🔍 ID области из URL:', this.currentAreaId);

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
            
            // Инициализируем интеграцию с сервисами
            await this.initServicesIntegration();
            
            // Инициализируем таблицу сегментов
            this.segmentsManager.initializeTable();
            
            // Загружаем данные сегментов для текущей области
            await this.segmentsManager.loadSegments();
            
            // Новая система управления панелями через UIManager
            if (this.uiManager) {
                // Инициализируем панели по умолчанию
                this.uiManager.initializePanelsDefaults();
                
                // Восстанавливаем состояние панелей
                this.uiManager.restorePanelStates(this.currentArea);
                
                console.log('✅ Новая система управления панелями активирована');
            }

            // Восстанавливаем состояние таблицы адресов
            this.restoreAddressTableState();

            // Очищаем старые ключи localStorage
            this.cleanupOldPanelKeys();

            // Восстанавливаем состояние прогресса
            this.restoreProgressState();
            
            // Показываем контент страницы
            const areaContent = document.getElementById('area-content');
            if (areaContent) {
                areaContent.classList.remove('hidden');
                console.log('✅ Контент страницы отображен');
            }

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
            console.log('📂 Загрузка данных области с ID:', this.currentAreaId);
            const areaData = await db.get('map_areas', this.currentAreaId);
            console.log('📋 Данные области загружены:', areaData);

            if (!areaData) {
                throw new Error('Область не найдена');
            }

            // Создаем экземпляр MapAreaModel для доступа к методам
            this.currentArea = new MapAreaModel(areaData);
            
            // Синхронизируем с dataState для доступа из менеджеров
            this.dataState.setState('currentArea', this.currentArea);

            // Обновляем заголовок и описание
            document.getElementById('areaTitle').textContent = this.currentArea.name;

            // Устанавливаем хлебные крошки
            this.setBreadcrumbs();

            // Уведомляем менеджеры о загрузке области
            this.eventBus.emit(CONSTANTS.EVENTS.AREA_LOADED, {
                area: this.currentArea,
                timestamp: new Date()
            });

            // Выводим все объявления и адреса в консоль при загрузке страницы
            await this.logAllListings();
            await this.logAllAddresses();
            await this.logLowAccuracyListings();

        } catch (error) {
            console.error('Error loading area data:', error);
            throw error;
        }
    }

    /**
     * Вывод всех объявлений в консоль
     */
    async logAllListings() {
        try {
            const allListings = await db.getAll('listings');
            console.log('Все объявления:', allListings);

        } catch (error) {
            console.error('❌ Ошибка при выводе объявлений в консоль:', error);
        }
    }

    /**
     * Вывод всех адресов области в консоль
     */
    async logAllAddresses() {
        try {
            const allAddresses = await db.getAll('addresses');
            console.log('Все адреса области:', allAddresses);

        } catch (error) {
            console.error('❌ Ошибка при выводе адресов в консоль:', error);
        }
    }

    /**
     * Вывод объявлений с низкой точностью определения адреса
     */
    async logLowAccuracyListings() {
        try {
            const allListings = await db.getAll('listings');
            
            // Фильтруем объявления с низкой точностью определения адреса
            const lowAccuracyListings = allListings.filter(listing => 
                listing.address_match_confidence === 'medium' || 
                listing.address_match_confidence === 'low' || 
                listing.address_match_confidence === 'very_low'
            );

            console.log('Объявления с низкой точностью адреса:', lowAccuracyListings);

            // Тестируем умный алгоритм на первом объявлении
            if (lowAccuracyListings.length > 0 && window.smartAddressMatcher) {
                console.log('🧠 Тестируем умный алгоритм...');
                const testListing = lowAccuracyListings[0];
                const allAddresses = await db.getAll('addresses');
                
                if (allAddresses.length > 0) {
                    const smartMatcher = window.smartAddressMatcher;
                    smartMatcher.spatialIndex = this.spatialManager;
                    
                    // Тестируем агрессивную нормализацию
                    console.log(`🔬 Тестируем агрессивную нормализацию:`);
                    console.log(`   Исходный адрес: "${testListing.address}"`);
                    const normalized = smartMatcher.aggressiveNormalize(testListing.address);
                    console.log(`   Нормализованный: "${normalized}"`);
                    
                    // Проверяем, есть ли подходящие адреса в базе
                    const matchingAddresses = allAddresses.filter(addr => {
                        const addrNormalized = smartMatcher.aggressiveNormalize(addr.address);
                        const score = smartMatcher.calculateObviousScore(normalized, addrNormalized);
                        if (score > 0.8) {
                            console.log(`   🎯 Потенциальное совпадение: "${addr.address}" -> "${addrNormalized}" (скор: ${score.toFixed(3)})`);
                            return true;
                        }
                        return false;
                    });
                    
                    console.log(`🧪 Тест умного алгоритма для: "${testListing.address}"`);
                    const result = await smartMatcher.matchAddressSmart(testListing, allAddresses);
                    console.log('🧠 Результат умного алгоритма:', result);
                    
                    if (result.address) {
                        console.log(`✅ Найден адрес: "${result.address.address}" (${result.confidence}, скор: ${result.score?.toFixed(3)}, метод: ${result.method})`);
                    } else {
                        console.log('❌ Адрес не найден умным алгоритмом');
                    }
                }
            }

        } catch (error) {
            console.error('❌ Ошибка при выводе объявлений с низкой точностью адреса:', error);
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

        // Центрируем карту на полигоне только если панель карты видима
        const mapContent = document.getElementById('mapPanelContent');
        if (mapContent && mapContent.style.display !== 'none') {
            this.map.fitBounds(this.areaPolygonLayer.getBounds());
        }
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

        // Переопределяем цвет для объявлений с низким статусом определения адреса
        if (listing.address_match_confidence === 'low' || listing.address_match_confidence === 'very_low') {
            color = '#ef4444'; // красный для низкой точности адреса
        }

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
                
                // Показываем кнопки обучения для всех объявлений с определённым адресом
                console.log('🔍 Modal button check:', {
                    listingId: listing.id,
                    address_match_confidence: listing.address_match_confidence,
                    hasAddress: !!listing.address_id
                });
                
                const addressButtons = listing.address_id ? `
                    <div class="ml-2 space-x-2">
                        <button id="correctAddressModal_${listing.id}" class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                            ✅ Верный адрес
                        </button>
                        <button id="incorrectAddressModal_${listing.id}" class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500">
                            ❌ Неверный адрес
                        </button>
                    </div>
                ` : '';
                
                console.log('🔍 Modal button HTML:', addressButtons);
                
                accuracyInfo = `
                    <div class="mb-2">
                        <span class="text-sm font-medium text-gray-500">Точность:</span>
                        <span class="text-sm ${this.getConfidenceColor(listing.address_match_confidence)} ml-2">${confidence}${distance}</span>
                        ${addressButtons}
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
                listing.processing_status = 'processed';
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
        
        // Загружаем классы домов в select
        await this.loadHouseClasses();
        document.getElementById('editHouseClass').value = address.house_class_id || '';
        
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
        
        // Обновляем кнопки после заполнения всех значений
        this.updateHouseSeriesButton();
        this.updateHouseClassButton();
        this.updateWallMaterialButton();
        this.updateCeilingMaterialButton();
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
                house_class_id: formData.get('house_class_id') || null,
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
                dom: 'lftip',
                columns: [
                    { 
                        data: 'source', 
                        title: 'Источник',
                        render: function (data) {
                            if (!data) return '-';
                            switch(data) {
                                case 'osm':
                                    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">OSM</span>';
                                case 'manual':
                                    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Ручной</span>';
                                case 'ml':
                                    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">ML</span>';
                                case 'imported':
                                    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">Импорт</span>';
                                default:
                                    return data;
                            }
                        }
                    },
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
                order: [[4, 'desc']], // Сортировка по дате обновления (колонка 5)
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
                            // Для объектов и объявлений одинаковый функционал фильтра
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
                                'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
                                'needs_processing': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Требует обработки</span>'
                            };
                            
                            let html = statusBadges[row.status] || `<span class="text-xs text-gray-500">${row.status}</span>`;
                            
                            if (isListing && row.processing_status) {
                                const processingBadges = {
                                    'address_needed': '<br><span class="inline-flex items-center px-1 py-0.5 text-nowrap rounded-full text-xs font-medium bg-orange-100 text-orange-800" style="font-size: 10px;">Определить адрес</span>',
                                    'duplicate_check_needed': '<br><span class="inline-flex items-center text-nowrap px-1 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" style="font-size: 10px;">Обр. на дубли</span>',
                                    'processed': ''
                                };
                                html += processingBadges[row.processing_status] || '';
                            } else if (!isListing) {
                                // Для объектов показываем количество объявлений с кнопкой разворачивания
                                const listingsCount = row.listings_count || 0;
                                const activeCount = row.active_listings_count || 0;
                                if (listingsCount > 0) {
                                    html += `<br><span class="text-xs text-gray-600 cursor-pointer hover:text-blue-600 expand-object-listings" data-object-id="${row.id}" title="Нажмите для просмотра объявлений">
                                        <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                        Объявления: ${listingsCount} (${activeCount} акт.)
                                    </span>`;
                                } else {
                                    html += `<br><span class="text-xs text-gray-600">Объявления: ${listingsCount} (${activeCount} акт.)</span>`;
                                }
                            }
                            
                            return html;
                        }
                    },
                    // 3. Дата создания
                    { 
                        data: 'created', 
                        title: 'Создано',
                        render: function (data, type, row) {
                            // Используем created (дата создания на источнике), а если его нет - то created_at (дата добавления в базу)
                            const dateValue = data || row.created_at;
                            if (!dateValue) return '—';
                            const createdDate = new Date(dateValue);
                            
                            // Для сортировки возвращаем timestamp
                            if (type === 'sort' || type === 'type') {
                                return createdDate.getTime();
                            }
                            
                            const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            
                            // Вычисляем экспозицию объявления (от создания до последнего обновления или до сегодня)
                            const updatedValue = row.updated || row.updated_at;
                            const endDate = updatedValue ? new Date(updatedValue) : new Date();
                            const diffTime = Math.abs(endDate - createdDate);
                            const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            return `<div class="text-xs">
                                ${dateStr}<br>
                                <span class="text-gray-500" style="font-size: 10px;">эксп. ${exposureDays} дн.</span>
                            </div>`;
                        }
                    },
                    // 4. Дата обновления
                    { 
                        data: 'updated', 
                        title: 'Обновлено',
                        render: function (data, type, row) {
                            // Используем updated (дата обновления на источнике), а если его нет - то updated_at (дата обновления в базе)
                            const dateValue = data || row.updated_at;
                            if (!dateValue) return '—';
                            const date = new Date(dateValue);
                            
                            // Для сортировки возвращаем timestamp
                            if (type === 'sort' || type === 'type') {
                                return date.getTime();
                            }
                            
                            const now = new Date();
                            const diffTime = Math.abs(now - date);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            const daysAgo = diffDays === 1 ? '1 день назад' : `${diffDays} дн. назад`;
                            const color = diffDays > 7 ? 'text-red-600' : 'text-green-600';
                            
                            return `<div class="text-xs">
                                ${dateStr}<br>
                                <span class="${color}" style="font-size: 10px;">${daysAgo}</span>
                            </div>`;
                        }
                    },
                    // 5. Характеристики
                    { 
                        data: null, 
                        title: 'Характеристики',
                        render: function (data, type, row) {
                            const isListing = row.type === 'listing';
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
                            
                            const characteristicsText = parts.length > 0 ? parts.join(', ') : 'Не указано';
                            
                            return `<div class="text-xs text-gray-900 max-w-xs" title="${characteristicsText}">${characteristicsText}</div>`;
                        }
                    },
                    // 6. Адрес
                    { 
                        data: 'address', 
                        title: 'Адрес',
                        render: (data, type, row) => {
                            const isListing = row.type === 'listing';
                            const addressFromDb = this.getAddressNameById(row.address_id);
                            
                            if (isListing) {
                                const addressText = data || 'Адрес не указан';
                                let addressFromDbText = addressFromDb || 'Адрес не определен';
                                
                                // Проверяем точность определения адреса и добавляем её в скобках
                                const hasLowConfidence = row.address_match_confidence === 'low' || row.address_match_confidence === 'very_low';
                                const isManualConfidence = row.address_match_confidence === 'manual';
                                const isAddressNotFound = addressFromDbText === 'Адрес не определен';
                                
                                // Добавляем точность в скобках для адресов с низкой точностью
                                if (hasLowConfidence && !isAddressNotFound) {
                                    const confidenceText = row.address_match_confidence === 'low' ? 'Низкая' : 'Очень низкая';
                                    addressFromDbText += ` (${confidenceText})`;
                                } else if (isManualConfidence && !isAddressNotFound) {
                                    addressFromDbText += ` (Подтвержден)`;
                                }
                                
                                const addressClass = addressText === 'Адрес не указан' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800';
                                
                                // Подсвечиваем красным только неопределенные адреса и адреса с низкой точностью (НЕ manual)
                                const addressFromDbClass = (isAddressNotFound || (hasLowConfidence && !isManualConfidence)) ? 'text-red-500' : 'text-gray-500';
                                
                                return `<div class="text-xs max-w-xs">
                                    <div class="${addressClass} cursor-pointer clickable-address truncate" data-listing-id="${row.id}">${addressText}</div>
                                    <div class="${addressFromDbClass} truncate">${addressFromDbText}</div>
                                </div>`;
                            } else {
                                // Для объектов показываем только адрес из базы (кликабельный)
                                const addressText = addressFromDb || 'Адрес не определен';
                                const addressClass = addressText === 'Адрес не определен' ? 'text-red-500' : 'text-blue-600 hover:text-blue-800 cursor-pointer';
                                
                                return `<div class="text-xs max-w-xs">
                                    <div class="${addressClass} truncate clickable-object-address" data-object-id="${row.id}">${addressText}</div>
                                </div>`;
                            }
                        }
                    },
                    // 7. Цена
                    { 
                        data: null, 
                        title: 'Цена',
                        render: function (data, type, row) {
                            const isListing = row.type === 'listing';
                            const priceValue = isListing ? row.price : row.current_price;
                            
                            if (!priceValue) return '<div class="text-xs">—</div>';
                            
                            const price = priceValue.toLocaleString();
                            let pricePerMeter = '';
                            
                            if (row.price_per_meter) {
                                pricePerMeter = row.price_per_meter.toLocaleString();
                            } else if (priceValue && row.area_total) {
                                const calculated = Math.round(priceValue / row.area_total);
                                pricePerMeter = calculated.toLocaleString();
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
                            
                            if (isListing) {
                                const sellerType = row.seller_type === 'private' ? 'Собственник' : 
                                                 row.seller_type === 'agency' ? 'Агент' : 
                                                 row.seller_type === 'agent' ? 'Агент' :
                                                 row.seller_type === 'owner' ? 'Собственник' :
                                                 row.seller_type || 'Не указано';
                                
                                const sellerName = row.seller_name || 'Не указано';
                                
                                return `<div class="text-xs max-w-xs">
                                    <div class="text-gray-900 truncate" title="${sellerType}">${sellerType}</div>
                                    <div class="text-gray-500 truncate" title="${sellerName}">${sellerName}</div>
                                </div>`;
                            } else {
                                // Для объектов показываем статус собственника
                                const ownerStatus = row.owner_status || 'только от агентов';
                                const statusColor = ownerStatus === 'есть от собственника' ? 'text-green-600' :
                                                   ownerStatus === 'было от собственника' ? 'text-yellow-600' :
                                                   'text-gray-600';
                                
                                return `<div class="text-xs max-w-xs">
                                    <div class="${statusColor} font-medium">${ownerStatus}</div>
                                </div>`;
                            }
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
        
        // Экспорт адресов в файл
        document.getElementById('exportAddressesBtn')?.addEventListener('click', () => {
            this.exportAddressesToFile();
        });
        
        // Импорт адресов из файла
        document.getElementById('importAddressesFile')?.addEventListener('change', (event) => {
            this.importAddressesFromFile(event);
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


        document.getElementById('processAddressesSmartBtn')?.addEventListener('click', () => {
            this.processAddressesSmart();
        });

        document.getElementById('analyzeUnresolvedAddressesBtn')?.addEventListener('click', () => {
            this.analyzeUnresolvedAddresses();
        });

        document.getElementById('processDuplicatesBtn')?.addEventListener('click', () => {
            this.processDuplicates();
        });

        document.getElementById('processDuplicatesAdvancedBtn')?.addEventListener('click', () => {
            this.processDuplicatesAdvanced();
        });

        document.getElementById('deleteListingsBtn')?.addEventListener('click', () => {
            this.deleteListings();
        });
        
        document.getElementById('deleteDataBtn')?.addEventListener('click', () => {
            this.deleteDataFromTab();
        });
        
        // Удаление всех адресов области
        document.getElementById('deleteAllAddressesBtn')?.addEventListener('click', () => {
            this.deleteAllAreaAddresses();
        });

        // События для интеграции сервисов обрабатываются в AreaServicesIntegration

        // Сворачивание таблицы адресов
        // Управление таблицей адресов делегировано UIManager

        // Управление панелями теперь делегировано UIManager

        // Управление отображением панелей через dropdown меню
        document.getElementById('panelBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanelDropdown();
        });

        // Закрытие dropdown при клике вне его
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('panelDropdown');
            const button = document.getElementById('panelBtn');
            if (dropdown && !dropdown.contains(e.target) && !button.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        // Обработчики чек-боксов панелей
        document.getElementById('statisticsPanel')?.addEventListener('change', (e) => {
            this.togglePanelVisibility('statistics', e.target.checked);
        });
        
        document.getElementById('dataWorkPanel')?.addEventListener('change', (e) => {
            this.togglePanelVisibility('dataWork', e.target.checked);
        });
        
        document.getElementById('mapPanel')?.addEventListener('change', (e) => {
            this.togglePanelVisibility('map', e.target.checked);
        });
        
        document.getElementById('addressesPanel')?.addEventListener('change', (e) => {
            this.togglePanelVisibility('addresses', e.target.checked);
        });
        
        document.getElementById('segmentsPanel')?.addEventListener('change', (e) => {
            this.togglePanelVisibility('segments', e.target.checked);
        });
        
        document.getElementById('duplicatesPanel')?.addEventListener('change', (e) => {
            this.togglePanelVisibility('duplicates', e.target.checked);
        });

        // Управление панелью сегментов делегировано UIManager

        // Навигация по табам в панели работы с данными
        document.querySelectorAll('.data-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = item.getAttribute('data-tab');
                if (tabId) {
                    this.switchDataWorkTab(tabId);
                }
            });
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

        // Модальное окно деталей объекта недвижимости
        document.getElementById('closeObjectModalBtn')?.addEventListener('click', () => {
            this.closeObjectModal();
        });

        document.getElementById('closeObjectModalBtn2')?.addEventListener('click', () => {
            this.closeObjectModal();
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

        // ===== ОБРАБОТЧИКИ ДЛЯ КЛАССОВ ДОМОВ =====

        // Обработчик изменения select класса дома
        document.getElementById('editHouseClass')?.addEventListener('change', () => {
            this.updateHouseClassButton();
        });

        // Кнопка добавления/редактирования класса дома
        document.getElementById('houseClassActionBtn')?.addEventListener('click', () => {
            const select = document.getElementById('editHouseClass');
            if (select.value) {
                // Редактирование существующего класса
                this.showEditHouseClassModal(select.value);
            } else {
                // Добавление нового класса
                this.showHouseClassModal();
            }
        });

        // Кнопки модального окна классов домов
        document.getElementById('cancelHouseClass')?.addEventListener('click', () => {
            this.hideHouseClassModal();
        });

        document.getElementById('saveHouseClass')?.addEventListener('click', () => {
            this.saveHouseClass();
        });

        // Закрытие модального окна по клику вне его
        document.getElementById('houseClassModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'houseClassModal') {
                this.hideHouseClassModal();
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

        document.getElementById('correctAddressBtn')?.addEventListener('click', () => {
            this.markAddressAsCorrect();
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

        // Обработчики чекбоксов в таблице дублей
        $(document).on('change', '.duplicate-checkbox', (e) => {
            console.log('🔄 jQuery event handler for duplicate checkbox');
            this.handleDuplicateSelection(e.target);
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

        // Обработчик для раскрытия объявлений объекта
        $(document).on('click', '.expand-object-listings', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const objectId = e.currentTarget.dataset.objectId;
            const tr = $(e.currentTarget).closest('tr');
            const row = this.duplicatesTable.row(tr);
            
            console.log('🔍 Expanding object listings for:', objectId);
            
            if (row.child.isShown()) {
                // Скрываем child row
                row.child.hide();
                tr.removeClass('shown');
                $(e.currentTarget).find('svg').css('transform', 'rotate(0deg)');
                console.log('📖 Child row hidden');
            } else {
                // Показываем child row
                this.showObjectListings(row, objectId);
                tr.addClass('shown');
                $(e.currentTarget).find('svg').css('transform', 'rotate(180deg)');
                console.log('📗 Child row shown');
            }
        });

        // Обработчик кликов по адресам объектов в таблице дублей
        $(document).on('click', '.clickable-object-address', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const objectId = e.currentTarget.dataset.objectId;
            if (objectId) {
                this.showObjectDetails(objectId);
            }
        });
    }

    /**
     * Показать объявления объекта в child row
     */
    async showObjectListings(row, objectId) {
        try {
            console.log('📋 Загрузка объявлений для объекта:', objectId);
            
            // Получаем объявления для данного объекта
            const objectListings = await this.getListingsForObject(objectId);
            
            if (objectListings.length === 0) {
                console.log('📋 Нет объявлений для объекта:', objectId);
                row.child('<div class="p-4 text-center text-gray-500">Нет объявлений для этого объекта</div>').show();
                return;
            }
            
            // Создаем HTML для child row с таблицей объявлений
            const childHtml = this.createChildListingsTable(objectListings);
            
            // Показываем child row
            row.child(childHtml).show();
            
            console.log('📋 Child row создан для объекта:', objectId, 'с', objectListings.length, 'объявлениями');
            
        } catch (error) {
            console.error('❌ Ошибка при загрузке объявлений объекта:', error);
            row.child('<div class="p-4 text-center text-red-500">Ошибка загрузки объявлений</div>').show();
        }
    }

    /**
     * Получить объявления для конкретного объекта
     */
    async getListingsForObject(objectId) {
        try {
            // Получаем объявления из базы данных с фильтром по object_id
            const allListings = await db.getListings();
            const objectListings = allListings.filter(listing => listing.object_id === objectId);
            
            console.log('📋 Найдено объявлений для объекта', objectId, ':', objectListings.length);
            
            return objectListings;
            
        } catch (error) {
            console.error('❌ Ошибка при получении объявлений для объекта:', error);
            return [];
        }
    }

    /**
     * Создать HTML таблицу для child row с объявлениями
     */
    createChildListingsTable(listings) {
        // Сортируем по дате обновления (убывание) используя timestamp
        const sortedListings = listings.sort((a, b) => {
            const timestampA = new Date(a.updated || a.updated_at || a.created || a.created_at || 0).getTime();
            const timestampB = new Date(b.updated || b.updated_at || b.created || b.created_at || 0).getTime();
            return timestampB - timestampA;
        });

        const tableHtml = `
            <div class="bg-gray-50 p-4">
                <h4 class="text-sm font-medium text-gray-900 mb-3">Объявления объекта (${listings.length})</h4>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Создано</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Обновлено</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Характеристики</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Адрес</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Контакт</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Источник</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${sortedListings.map(listing => this.createChildListingRow(listing)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        return tableHtml;
    }

    /**
     * Создать HTML строку для объявления в child таблице
     */
    createChildListingRow(listing) {
        // 1. Статус (копируем логику из родительской таблицы)
        const statusBadges = {
            'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
            'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
            'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
            'needs_processing': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Требует обработки</span>'
        };
        
        let statusHtml = statusBadges[listing.status] || `<span class="text-xs text-gray-500">${listing.status}</span>`;
        
        if (listing.processing_status) {
            const processingBadges = {
                'address_needed': '<br><span class="inline-flex items-center px-1 py-0.5 text-nowrap rounded-full text-xs font-medium bg-orange-100 text-orange-800" style="font-size: 10px;">Определить адрес</span>',
                'duplicate_check_needed': '<br><span class="inline-flex items-center text-nowrap px-1 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" style="font-size: 10px;">Обр. на дубли</span>',
                'processed': ''
            };
            statusHtml += processingBadges[listing.processing_status] || '';
        }
        
        // 2. Дата создания
        const dateValue = listing.created || listing.created_at;
        let createdHtml = '—';
        if (dateValue) {
            const createdDate = new Date(dateValue);
            const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
            
            // Вычисляем экспозицию
            const updatedValue = listing.updated || listing.updated_at;
            const endDate = updatedValue ? new Date(updatedValue) : new Date();
            const diffTime = Math.abs(endDate - createdDate);
            const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            createdHtml = `<div class="text-xs">
                ${dateStr}<br>
                <span class="text-gray-500" style="font-size: 10px;">эксп. ${exposureDays} дн.</span>
            </div>`;
        }
        
        // 3. Дата обновления
        const updatedDateValue = listing.updated || listing.updated_at;
        let updatedHtml = '—';
        if (updatedDateValue) {
            const date = new Date(updatedDateValue);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const daysAgo = diffDays === 1 ? '1 день назад' : `${diffDays} дн. назад`;
            const color = diffDays > 7 ? 'text-red-600' : 'text-green-600';
            
            updatedHtml = `<div class="text-xs">
                ${dateStr}<br>
                <span class="${color}" style="font-size: 10px;">${daysAgo}</span>
            </div>`;
        }
        
        // 4. Характеристики
        const parts = [];
        
        if (listing.property_type) {
            const types = {
                'studio': 'Студия',
                '1k': '1-к',
                '2k': '2-к',
                '3k': '3-к',
                '4k+': '4-к+'
            };
            parts.push(types[listing.property_type] || listing.property_type);
            parts.push('квартира');
        }
        
        // Площади
        const areas = [];
        if (listing.area_total) areas.push(listing.area_total);
        if (listing.area_living) areas.push(listing.area_living);
        if (listing.area_kitchen) areas.push(listing.area_kitchen);
        if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
        
        // Этаж/этажность
        if (listing.floor && listing.total_floors) {
            parts.push(`${listing.floor}/${listing.total_floors} эт.`);
        } else if (listing.floor && listing.floors_total) {
            parts.push(`${listing.floor}/${listing.floors_total} эт.`);
        }
        
        const characteristicsText = parts.length > 0 ? parts.join(', ') : 'Не указано';
        
        // 5. Адрес
        const addressFromDb = this.getAddressNameById(listing.address_id);
        const addressText = listing.address || 'Адрес не указан';
        let addressFromDbText = addressFromDb || 'Адрес не определен';
        
        // Проверяем точность определения адреса
        const hasLowConfidence = listing.address_match_confidence === 'low' || listing.address_match_confidence === 'very_low';
        const isManualConfidence = listing.address_match_confidence === 'manual';
        const isAddressNotFound = addressFromDbText === 'Адрес не определен';
        
        if (hasLowConfidence && !isAddressNotFound) {
            const confidenceText = listing.address_match_confidence === 'low' ? 'Низкая' : 'Очень низкая';
            addressFromDbText += ` (${confidenceText})`;
        } else if (isManualConfidence && !isAddressNotFound) {
            addressFromDbText += ` (Подтвержден)`;
        }
        
        const addressClass = addressText === 'Адрес не указан' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800';
        const addressFromDbClass = (isAddressNotFound || (hasLowConfidence && !isManualConfidence)) ? 'text-red-500' : 'text-gray-500';
        
        const addressHtml = `<div class="text-xs max-w-xs">
            <div class="${addressClass} cursor-pointer clickable-address truncate" data-listing-id="${listing.id}">${addressText}</div>
            <div class="${addressFromDbClass} truncate">${addressFromDbText}</div>
        </div>`;
        
        // 6. Цена
        const priceValue = listing.price;
        let priceHtml = '<div class="text-xs">—</div>';
        if (priceValue) {
            const price = priceValue.toLocaleString();
            let pricePerMeter = '';
            
            if (listing.price_per_meter) {
                pricePerMeter = listing.price_per_meter.toLocaleString();
            } else if (priceValue && listing.area_total) {
                const calculated = Math.round(priceValue / listing.area_total);
                pricePerMeter = calculated.toLocaleString();
            }
            
            priceHtml = `<div class="text-xs">
                <div class="text-green-600 font-medium">${price}</div>
                ${pricePerMeter ? `<div class="text-gray-500">${pricePerMeter}</div>` : ''}
            </div>`;
        }
        
        // 7. Контакт
        const sellerType = listing.seller_type === 'private' ? 'Собственник' : 
                          listing.seller_type === 'agency' ? 'Агент' : 
                          listing.seller_type === 'agent' ? 'Агент' :
                          listing.seller_type === 'owner' ? 'Собственник' :
                          listing.seller_type || 'Не указано';
        
        const sellerName = listing.seller_name || 'Не указано';
        
        const contactHtml = `<div class="text-xs max-w-xs">
            <div class="text-gray-900 truncate" title="${sellerType}">${sellerType}</div>
            <div class="text-gray-500 truncate" title="${sellerName}">${sellerName}</div>
        </div>`;
        
        // 8. Источник (новая колонка)
        const sourceUrl = listing.url || '#';
        let sourceName = 'Неизвестно';
        
        // Получаем имя источника из source_metadata.original_source
        if (listing.source_metadata && listing.source_metadata.original_source) {
            sourceName = listing.source_metadata.original_source;
        } else if (listing.source) {
            // Fallback к обычному source с переводом
            sourceName = listing.source === 'avito' ? 'Авито' : listing.source === 'cian' ? 'Циан' : listing.source;
        }
        
        const sourceHtml = `<div class="text-xs">
            <a href="${sourceUrl}" target="_blank" class="text-blue-600 hover:text-blue-800">${sourceName}</a>
        </div>`;
        
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-3 py-2 whitespace-nowrap text-xs">${statusHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${createdHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${updatedHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs"><div class="text-xs text-gray-900 max-w-xs" title="${characteristicsText}">${characteristicsText}</div></td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${addressHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${priceHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${contactHtml}</td>
                <td class="px-3 py-2 whitespace-nowrap text-xs">${sourceHtml}</td>
            </tr>
        `;
    }

    /**
     * Показать детали объекта недвижимости в модальном окне
     */
    async showObjectDetails(objectId) {
        try {
            console.log('🏠 Загрузка деталей объекта:', objectId);
            
            // Получаем объект недвижимости с объявлениями
            let objectWithData;
            try {
                objectWithData = await window.realEstateObjectManager.getObjectWithListings(objectId);
            } catch (error) {
                console.error('Объект недвижимости не найден:', objectId, error);
                this.showError('Объект недвижимости не найден');
                return;
            }

            if (!objectWithData || !objectWithData.object) {
                console.error('Объект недвижимости не найден:', objectId);
                this.showError('Объект недвижимости не найден');
                return;
            }

            const realEstateObject = objectWithData.object;
            const objectListings = objectWithData.listings || [];
            
            // Показываем модальное окно для объекта
            const objectModalContent = document.getElementById('objectModalContent');
            objectModalContent.innerHTML = this.renderObjectDetails(realEstateObject, objectListings);

            // Сохраняем текущий объект для других операций
            this.currentObject = realEstateObject;
            this.currentObjectListings = objectListings;

            // Показываем модальное окно объекта
            document.getElementById('objectModal').classList.remove('hidden');

            // Инициализируем компоненты после отображения модального окна
            setTimeout(() => {
                // Инициализируем карту объекта
                this.renderObjectMap(realEstateObject);
                
                // Инициализируем график изменения цены объекта
                this.renderObjectPriceChart(realEstateObject);
                
                // Загружаем фотографии из первого объявления
                if (objectListings.length > 0) {
                    this.loadObjectPhotos(objectListings[0]);
                }
                
                // Инициализируем панель истории изменения цен
                this.initializeObjectPriceHistoryPanel(realEstateObject);
                
                // Инициализируем таблицу объявлений объекта
                this.initializeObjectListingsTable(objectListings, objectId);
                
                console.log('🏠 Детали объекта загружены:', objectId);
            }, 100);

        } catch (error) {
            console.error('Ошибка загрузки деталей объекта:', error);
            this.showError('Ошибка загрузки деталей объекта: ' + error.message);
        }
    }

    /**
     * Формирование кратких характеристик объекта
     */
    formatObjectCharacteristics(realEstateObject) {
        const parts = [];
        
        // Тип недвижимости
        if (realEstateObject.property_type) {
            const types = {
                'studio': 'Студия',
                '1k': '1-к',
                '2k': '2-к',
                '3k': '3-к',
                '4k+': '4-к+'
            };
            parts.push(types[realEstateObject.property_type] || realEstateObject.property_type);
            parts.push('квартира');
        }
        
        // Площади
        const areas = [];
        if (realEstateObject.area_total) areas.push(realEstateObject.area_total);
        if (realEstateObject.area_living) areas.push(realEstateObject.area_living);
        if (realEstateObject.area_kitchen) areas.push(realEstateObject.area_kitchen);
        if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
        
        // Этаж/этажность
        if (realEstateObject.floor && realEstateObject.total_floors) {
            parts.push(`${realEstateObject.floor}/${realEstateObject.total_floors} эт.`);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Характеристики не указаны';
    }

    /**
     * Рендер деталей объекта недвижимости
     */
    renderObjectDetails(realEstateObject, objectListings) {
        // Получаем адрес объекта
        const address = this.getAddressNameById(realEstateObject.address_id) || 'Адрес не определен';
        
        // Формируем заголовок карты: краткие характеристики + адрес
        const characteristics = this.formatObjectCharacteristics(realEstateObject);
        const mapTitle = `${characteristics} — ${address}`;
        
        return `
            <!-- Карта местоположения объекта -->
            <div class="mb-6">
                <div class="px-4 py-3">
                    <div class="flex items-center space-x-3">
                        <span class="text-lg font-medium text-gray-900">📍 ${mapTitle}</span>
                    </div>
                </div>
                <div class="px-4 pb-4">
                    <div id="object-map-${realEstateObject.id}" class="h-64 bg-gray-200 rounded-md">
                        <!-- Карта будет отрендерена здесь -->
                    </div>
                </div>
            </div>
            
            <!-- График изменения цены объекта -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">График изменения цены объекта</h4>
                <div id="object-price-chart-${realEstateObject.id}" class="w-full">
                    <!-- График будет отрендерен здесь -->
                </div>
            </div>
            
            <!-- История изменения цен объекта -->
            <div class="mb-6">
                <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
                    <!-- Заголовок панели (сворачиваемый) -->
                    <div id="objectPriceHistoryPanelHeader-${realEstateObject.id}" class="px-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors duration-150">
                        <div class="flex items-center justify-between">
                            <h4 class="text-lg font-medium text-gray-900">Изменение цены</h4>
                            <svg id="objectPriceHistoryPanelChevron-${realEstateObject.id}" class="h-5 w-5 text-gray-400 transform transition-transform duration-200 rotate-[-90deg]" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                    </div>
                    
                    <!-- Содержимое панели (изначально скрыто) -->
                    <div id="objectPriceHistoryPanelContent-${realEstateObject.id}" class="px-4 pb-4" style="display: none;">
                        <div class="mt-4">
                            <div class="overflow-x-auto">
                                <table id="objectPriceHistoryTable-${realEstateObject.id}" class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                                        <!-- Данные будут загружены через initializeObjectPriceHistoryTable -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Параметры объекта -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Параметры объекта</h4>
                <div class="bg-white overflow-hidden">
                    <div class="px-4 py-5 sm:p-6">
                        <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                            ${this.renderObjectParameters(realEstateObject)}
                        </dl>
                    </div>
                </div>
            </div>
            
            <!-- Фотогалерея -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Фотографии</h4>
                <div id="object-photos-${realEstateObject.id}" class="w-full">
                    <!-- Фотографии будут загружены из выбранного объявления -->
                </div>
            </div>
            
            <!-- Таблица объявлений объекта -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Объявления объекта (${objectListings.length})</h4>
                <div class="overflow-x-auto">
                    <table id="object-listings-table-${realEstateObject.id}" class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Создано</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Обновлено</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Характеристики</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Адрес</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Контакт</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Источник</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <!-- Строки будут добавлены через initializeObjectListingsTable -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Рендер параметров объекта недвижимости
     */
    renderObjectParameters(realEstateObject) {
        const parameters = [];
        
        // Дата создания
        if (realEstateObject.created_at) {
            const createdDate = new Date(realEstateObject.created_at).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Дата создания</dt>
                    <dd class="mt-1 text-sm text-gray-900">${createdDate}</dd>
                </div>
            `);
        }
        
        // Дата обновления
        if (realEstateObject.updated_at) {
            const updatedDate = new Date(realEstateObject.updated_at).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric', 
                hour: '2-digit',
                minute: '2-digit'
            });
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Дата обновления</dt>
                    <dd class="mt-1 text-sm text-gray-900">${updatedDate}</dd>
                </div>
            `);
        }
        
        // Текущая цена
        if (realEstateObject.current_price) {
            const price = realEstateObject.current_price.toLocaleString('ru-RU') + ' ₽';
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Текущая цена</dt>
                    <dd class="mt-1 text-sm text-green-600 font-medium">${price}</dd>
                </div>
            `);
        }
        
        // Цена за м²
        if (realEstateObject.price_per_meter) {
            const pricePerMeter = realEstateObject.price_per_meter.toLocaleString('ru-RU') + ' ₽/м²';
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Цена за м²</dt>
                    <dd class="mt-1 text-sm text-gray-900">${pricePerMeter}</dd>
                </div>
            `);
        }
        
        // Тип недвижимости
        if (realEstateObject.property_type) {
            const types = {
                'studio': 'Студия',
                '1k': '1-комнатная квартира',
                '2k': '2-комнатная квартира', 
                '3k': '3-комнатная квартира',
                '4k+': '4+ комнатная квартира'
            };
            const propertyTypeText = types[realEstateObject.property_type] || realEstateObject.property_type;
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Тип недвижимости</dt>
                    <dd class="mt-1 text-sm text-gray-900">${propertyTypeText}</dd>
                </div>
            `);
        }
        
        // Общая площадь
        if (realEstateObject.area_total) {
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Общая площадь</dt>
                    <dd class="mt-1 text-sm text-gray-900">${realEstateObject.area_total} м²</dd>
                </div>
            `);
        }
        
        // Жилая площадь
        if (realEstateObject.area_living) {
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Жилая площадь</dt>
                    <dd class="mt-1 text-sm text-gray-900">${realEstateObject.area_living} м²</dd>
                </div>
            `);
        }
        
        // Площадь кухни
        if (realEstateObject.area_kitchen) {
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Площадь кухни</dt>
                    <dd class="mt-1 text-sm text-gray-900">${realEstateObject.area_kitchen} м²</dd>
                </div>
            `);
        }
        
        // Этаж
        if (realEstateObject.floor && realEstateObject.total_floors) {
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Этаж</dt>
                    <dd class="mt-1 text-sm text-gray-900">${realEstateObject.floor} из ${realEstateObject.total_floors}</dd>
                </div>
            `);
        }
        
        // Статус объекта
        if (realEstateObject.status) {
            const statusText = realEstateObject.status === 'active' ? 'Активный' : 'Архивный';
            const statusColor = realEstateObject.status === 'active' ? 'text-green-600' : 'text-gray-600';
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Статус объекта</dt>
                    <dd class="mt-1 text-sm ${statusColor} font-medium">${statusText}</dd>
                </div>
            `);
        }
        
        // Статус собственника
        if (realEstateObject.owner_status) {
            const ownerStatusColor = realEstateObject.owner_status === 'есть от собственника' ? 'text-green-600' :
                                   realEstateObject.owner_status === 'было от собственника' ? 'text-yellow-600' :
                                   'text-gray-600';
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Статус собственника</dt>
                    <dd class="mt-1 text-sm ${ownerStatusColor}">${realEstateObject.owner_status}</dd>
                </div>
            `);
        }
        
        // Количество объявлений
        if (realEstateObject.listings_count) {
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Всего объявлений</dt>
                    <dd class="mt-1 text-sm text-gray-900">${realEstateObject.listings_count}</dd>
                </div>
            `);
        }
        
        // Количество активных объявлений
        if (realEstateObject.active_listings_count !== undefined) {
            parameters.push(`
                <div>
                    <dt class="text-sm font-medium text-gray-500">Активных объявлений</dt>
                    <dd class="mt-1 text-sm text-gray-900">${realEstateObject.active_listings_count}</dd>
                </div>
            `);
        }
        
        return parameters.join('');
    }

    /**
     * Рендеринг карты объекта недвижимости
     */
    renderObjectMap(realEstateObject) {
        try {
            const mapContainer = document.getElementById(`object-map-${realEstateObject.id}`);
            if (!mapContainer) {
                console.warn('Контейнер карты объекта не найден');
                return;
            }

            // Получаем координаты объекта (через связанный адрес)
            const coords = this.getObjectCoordinates(realEstateObject);
            if (!coords) {
                mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">⚠️ Координаты объекта не найдены</div>';
                return;
            }

            console.log(`🗺️ Инициализируем карту для объекта ${realEstateObject.id} с координатами:`, coords);

            // Создаем карту
            const objectMap = L.map(`object-map-${realEstateObject.id}`, {
                center: [coords.lat, coords.lng],
                zoom: 16,
                zoomControl: true,
                scrollWheelZoom: false
            });

            // Добавляем слой карты
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(objectMap);

            // Добавляем маркер объекта
            const objectMarker = L.marker([coords.lat, coords.lng], {
                icon: L.divIcon({
                    className: 'object-marker',
                    html: `<div style="background: #10b981; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">🏠</div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            }).addTo(objectMap);

            // Добавляем popup к маркеру
            const addressText = this.getAddressNameById(realEstateObject.address_id) || 'Адрес не определен';
            const priceText = realEstateObject.current_price ? 
                realEstateObject.current_price.toLocaleString('ru-RU') + ' ₽' : 'Цена не указана';
            
            const markerPopupContent = `
                <div style="min-width: 200px;">
                    <strong>Объект недвижимости</strong><br>
                    <span style="color: #6b7280; font-size: 12px;">${this.escapeHtml(addressText)}</span><br>
                    <span style="color: #059669; font-weight: bold;">${priceText}</span>
                    ${realEstateObject.price_per_meter ? `<br><span style="color: #6b7280; font-size: 12px;">${realEstateObject.price_per_meter.toLocaleString('ru-RU')} ₽/м²</span>` : ''}
                </div>
            `;
            objectMarker.bindPopup(markerPopupContent);

            // Сохраняем ссылку на карту для возможной очистки
            mapContainer._leafletMap = objectMap;

        } catch (error) {
            console.error('Ошибка инициализации карты объекта:', error);
            const mapContainer = document.getElementById(`object-map-${realEstateObject.id}`);
            if (mapContainer) {
                mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки карты</div>';
            }
        }
    }

    /**
     * Получить координаты объекта недвижимости
     */
    getObjectCoordinates(realEstateObject) {
        // Получаем координаты из связанного адреса
        if (realEstateObject.address_id) {
            const address = this.addresses.find(addr => addr.id === realEstateObject.address_id);
            if (address && address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                return {
                    lat: parseFloat(address.coordinates.lat),
                    lng: parseFloat(address.coordinates.lng)
                };
            }
        }
        return null;
    }

    /**
     * Рендеринг графика изменения цены объекта
     */
    renderObjectPriceChart(realEstateObject) {
        try {
            const chartContainer = document.getElementById(`object-price-chart-${realEstateObject.id}`);
            if (!chartContainer) {
                console.warn('Контейнер графика цены объекта не найден');
                return;
            }

            console.log(`📊 Создаем график цены для объекта ${realEstateObject.id}`);

            // Подготавливаем данные для графика из истории цен
            const priceHistory = this.prepareObjectPriceHistoryData(realEstateObject);
            
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
            console.error('Ошибка создания графика цены объекта:', error);
            const chartContainer = document.getElementById(`object-price-chart-${realEstateObject.id}`);
            if (chartContainer) {
                chartContainer.innerHTML = '<div class="flex items-center justify-center h-64 text-red-500">Ошибка создания графика</div>';
            }
        }
    }

    /**
     * Подготовка данных истории цен для графика объекта
     */
    prepareObjectPriceHistoryData(realEstateObject) {
        const history = [];
        
        // Добавляем историю цен если есть
        if (realEstateObject.price_history && Array.isArray(realEstateObject.price_history)) {
            realEstateObject.price_history.forEach(item => {
                if (item.price && item.date) {
                    history.push({
                        date: new Date(item.date).getTime(),
                        price: parseInt(item.price)
                    });
                }
            });
        }

        // Добавляем конечную точку с текущей ценой объекта (аналогично логике объявления)
        if (realEstateObject.current_price) {
            let endPriceDate;
            
            if (realEstateObject.status === 'active') {
                // Для активных объектов - текущая дата
                endPriceDate = new Date();
            } else {
                // Для архивных объектов - дата последнего обновления
                endPriceDate = new Date(realEstateObject.updated_at || realEstateObject.created_at || Date.now());
            }
            
            // Добавляем конечную точку только если она отличается от уже существующих
            const lastHistoryDate = history.length > 0 ? history[history.length - 1].date : 0;
            if (Math.abs(endPriceDate.getTime() - lastHistoryDate) > 24 * 60 * 60 * 1000) {
                history.push({
                    date: endPriceDate.getTime(),
                    price: parseInt(realEstateObject.current_price)
                });
            }
        }

        // Сортируем по дате
        history.sort((a, b) => a.date - b.date);
        
        // Убираем дубликаты цен подряд, но оставляем ключевые точки
        const filtered = [];
        for (let i = 0; i < history.length; i++) {
            if (i === 0 || i === history.length - 1 || history[i].price !== history[i-1].price) {
                filtered.push(history[i]);
            }
        }

        return filtered;
    }

    /**
     * Загрузка фотографий объекта из объявления
     */
    loadObjectPhotos(listing) {
        try {
            if (!this.currentObject) {
                console.warn('Текущий объект не найден');
                return;
            }

            const photosContainer = document.getElementById(`object-photos-${this.currentObject.id}`);
            if (!photosContainer) {
                console.warn('Контейнер фотографий объекта не найден');
                return;
            }

            console.log(`📸 Загружаем фотографии для объекта ${this.currentObject.id} из объявления ${listing.id}`);

            // Получаем фотографии из объявления
            const photos = this.getListingPhotos(listing);
            
            if (photos.length === 0) {
                photosContainer.innerHTML = `
                    <div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                        📷 Нет фотографий в выбранном объявлении
                    </div>
                `;
                return;
            }

            // Создаем галерею фотографий
            photosContainer.innerHTML = `
                <div class="fotorama" 
                     data-nav="thumbs" 
                     data-width="100%" 
                     data-height="400"
                     data-thumbheight="50"
                     data-thumbwidth="50"
                     data-allowfullscreen="true"
                     data-transition="slide"
                     data-loop="true"
                     id="object-gallery-${this.currentObject.id}">
                    ${photos.map(photo => `<img src="${photo}" alt="Фото объявления">`).join('')}
                </div>
            `;

            // Инициализируем Fotorama
            setTimeout(() => {
                const galleryElement = document.getElementById(`object-gallery-${this.currentObject.id}`);
                if (galleryElement && window.$ && $.fn.fotorama) {
                    $(galleryElement).fotorama();
                }
            }, 100);

        } catch (error) {
            console.error('Ошибка загрузки фотографий объекта:', error);
            const photosContainer = document.getElementById(`object-photos-${this.currentObject.id}`);
            if (photosContainer) {
                photosContainer.innerHTML = `
                    <div class="bg-red-100 rounded-lg p-8 text-center text-red-500">
                        ❌ Ошибка загрузки фотографий
                    </div>
                `;
            }
        }
    }

    /**
     * Инициализация таблицы объявлений объекта
     */
    initializeObjectListingsTable(objectListings, objectId) {
        try {
            const tableContainer = document.getElementById(`object-listings-table-${objectId}`);
            if (!tableContainer) {
                console.warn('Контейнер таблицы объявлений объекта не найден');
                return;
            }

            console.log(`📋 Инициализируем таблицу объявлений для объекта ${objectId}`);

            // Сортируем объявления по дате обновления (убывание)
            const sortedListings = objectListings.sort((a, b) => {
                const timestampA = new Date(a.updated || a.updated_at || a.created || a.created_at || 0).getTime();
                const timestampB = new Date(b.updated || b.updated_at || b.created || b.created_at || 0).getTime();
                return timestampB - timestampA;
            });

            // Создаем строки таблицы
            const tableBody = tableContainer.querySelector('tbody');
            tableBody.innerHTML = sortedListings.map(listing => 
                this.createObjectListingRow(listing, objectId)
            ).join('');

            // Добавляем обработчики событий для адресов
            this.bindObjectListingEvents(objectId);

        } catch (error) {
            console.error('Ошибка инициализации таблицы объявлений объекта:', error);
        }
    }

    /**
     * Создание строки таблицы для объявления объекта (без функционала открытия)
     */
    createObjectListingRow(listing, objectId) {
        // Используем существующий метод createChildListingRow, но модифицируем адрес
        let rowHtml = this.createChildListingRow(listing);
        
        // Заменяем обработчик адреса для загрузки фотографий вместо открытия объявления
        rowHtml = rowHtml.replace(
            `data-listing-id="${listing.id}"`,
            `data-listing-id="${listing.id}" data-object-id="${objectId}"`
        );
        
        // Заменяем класс для обработчика
        rowHtml = rowHtml.replace(
            'clickable-address',
            'clickable-object-listing-address'
        );
        
        return rowHtml;
    }

    /**
     * Привязка событий для таблицы объявлений объекта
     */
    bindObjectListingEvents(objectId) {
        // Удаляем старые обработчики
        $(document).off('click', '.clickable-object-listing-address');
        
        // Добавляем новый обработчик для загрузки фотографий
        $(document).on('click', '.clickable-object-listing-address', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const listingId = e.currentTarget.dataset.listingId;
            const currentObjectId = e.currentTarget.dataset.objectId;
            
            if (listingId && this.currentObjectListings) {
                const listing = this.currentObjectListings.find(l => l.id === listingId);
                if (listing) {
                    console.log(`📸 Загружаем фотографии из объявления ${listingId} для объекта ${currentObjectId}`);
                    this.loadObjectPhotos(listing);
                    
                    // Обновляем активную строку в таблице
                    this.updateActiveObjectListingRow(listingId, currentObjectId);
                }
            }
        });
    }

    /**
     * Обновление активной строки в таблице объявлений объекта
     */
    updateActiveObjectListingRow(activeListingId, objectId) {
        try {
            const tableContainer = document.getElementById(`object-listings-table-${objectId}`);
            if (!tableContainer) return;

            // Удаляем активный класс со всех строк
            const allRows = tableContainer.querySelectorAll('tbody tr');
            allRows.forEach(row => {
                row.classList.remove('bg-blue-50', 'border-blue-200');
            });

            // Добавляем активный класс к выбранной строке
            const activeRow = tableContainer.querySelector(`[data-listing-id="${activeListingId}"]`);
            if (activeRow) {
                const row = activeRow.closest('tr');
                if (row) {
                    row.classList.add('bg-blue-50', 'border-blue-200');
                }
            }

        } catch (error) {
            console.error('Ошибка обновления активной строки:', error);
        }
    }

    /**
     * Инициализация панели истории изменения цен объекта
     */
    initializeObjectPriceHistoryPanel(realEstateObject) {
        try {
            // Инициализируем обработчик сворачивания/разворачивания панели
            const panelHeader = document.getElementById(`objectPriceHistoryPanelHeader-${realEstateObject.id}`);
            if (panelHeader) {
                panelHeader.addEventListener('click', () => {
                    this.toggleObjectPriceHistoryPanel(realEstateObject.id);
                });
            }

            // Инициализируем таблицу истории цен
            this.initializeObjectPriceHistoryTable(realEstateObject);

        } catch (error) {
            console.error('Ошибка инициализации панели истории цен объекта:', error);
        }
    }

    /**
     * Переключение сворачивания/разворачивания панели истории цен объекта
     */
    toggleObjectPriceHistoryPanel(objectId) {
        const content = document.getElementById(`objectPriceHistoryPanelContent-${objectId}`);
        const chevron = document.getElementById(`objectPriceHistoryPanelChevron-${objectId}`);
        
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
     * Инициализация таблицы истории цен объекта
     */
    async initializeObjectPriceHistoryTable(realEstateObject) {
        try {
            const tableElement = document.getElementById(`objectPriceHistoryTable-${realEstateObject.id}`);
            if (!tableElement) return;

            // Подготавливаем данные для таблицы
            const tableData = this.prepareObjectPriceHistoryTableData(realEstateObject);

            // Инициализируем DataTable
            const dataTable = $(tableElement).DataTable({
                data: tableData,
                language: {
                    url: '../libs/datatables/ru.json'
                },
                pageLength: 10,
                searching: false,
                ordering: true,
                order: [[0, 'asc']], // Сортируем по дате (новые в конце)
                columns: [
                    {
                        title: 'Дата',
                        data: 'date',
                        render: function (data, type, row) {
                            if (type === 'display') {
                                const date = new Date(data);
                                return date.toLocaleDateString('ru-RU') + ' ' + 
                                       date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
                            } else if (type === 'sort' || type === 'type') {
                                return new Date(data).getTime();
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
                    }
                ]
            });

            // Сохраняем ссылку на таблицу
            this[`objectPriceHistoryTable_${realEstateObject.id}`] = dataTable;

        } catch (error) {
            console.error('Ошибка инициализации таблицы истории цен объекта:', error);
        }
    }

    /**
     * Подготовка данных для таблицы истории цен объекта
     */
    prepareObjectPriceHistoryTableData(realEstateObject) {
        const data = [];

        // Добавляем данные из истории цен объекта
        if (realEstateObject.price_history && Array.isArray(realEstateObject.price_history)) {
            realEstateObject.price_history.forEach(historyItem => {
                if (historyItem.date && historyItem.price) {
                    data.push({
                        date: historyItem.date,
                        price: historyItem.price
                    });
                }
            });
        }

        return data;
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

            // Обновляем график источников
            await this.updateSourcesChart();
            
            // Обновляем графики определения адресов
            await this.updateAddressAnalyticsCharts();
            
            // Обновляем статистику обработки дублей
            await this.updateDuplicatesStats();

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

            // Инициализируем ML-алгоритм определения адресов
            if (typeof SmartAddressMatcher !== 'undefined' && !window.smartAddressMatcher) {
                try {
                    // Инициализируем пространственный индекс если еще не создан
                    if (!window.spatialIndexManager) {
                        window.spatialIndexManager = new SpatialIndexManager();
                    }
                    
                    window.smartAddressMatcher = new SmartAddressMatcher(this.spatialManager || window.spatialIndexManager);
                    console.log('🧠 SmartAddressMatcher initialized');
                } catch (error) {
                    console.warn('Failed to initialize SmartAddressMatcher:', error);
                }
            }

            // Добавляем счетчики объявлений для каждого адреса
            for (const address of addresses) {
                const listings = await db.getListingsByAddress(address.id);

                address.objects_count = 0; // УДАЛЕН: подсчет объектов
                address.listings_count = listings.length;
                
                // Нормализуем обязательные поля для DataTables
                if (!address.source) {
                    address.source = 'manual'; // Добавляем source по умолчанию
                }
            }

            // Сохраняем адреса в переменную класса для использования в других функциях
            this.addresses = addresses;
            
            // Сохраняем адреса в dataState для доступа из менеджеров
            this.dataState.setState('addresses', addresses);
            
            // Обновляем данные сегментов после загрузки адресов
            if (this.segmentsManager) {
                await this.segmentsManager.updateSegmentsData();
            }
            
            // Уведомляем менеджеры о загрузке адресов
            this.eventBus.emit(CONSTANTS.EVENTS.ADDRESSES_LOADED, {
                addresses: addresses,
                count: addresses.length,
                timestamp: new Date()
            });

            // Очищаем и заполняем таблицу
            if (this.addressesTable) {
                console.log(`🔄 Обновляем таблицу адресов`);
                this.addressesTable.clear();
                this.addressesTable.rows.add(addresses); // Раскомментировал эту строку!
                this.addressesTable.draw();
                console.log(`✅ Таблица обновлена`);
                
                // Инициализируем фильтр по источнику после загрузки данных
                this.initSourceFilter();
            } else {
                console.warn(`⚠️ Таблица адресов не инициализирована`);
            }

        } catch (error) {
            console.error('Error loading addresses:', error);
            this.showError('Ошибка загрузки адресов: ' + error.message);
        }
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
            $('#sourceFilter').empty();

            if (!this.addressesTable) return;

            // Получаем колонку с источниками (первая колонка, индекс 0)
            const column = this.addressesTable.column(0);
            
            // Создаем select элемент
            const select = $('<select id="sourceFilterSelect"><option value="">Все источники</option></select>')
                .appendTo($('#sourceFilter'));

            // Собираем уникальные значения источников
            const uniqueSources = [];
            column.data().unique().sort().each(function (d, j) {
                if (d && uniqueSources.indexOf(d) === -1) {
                    uniqueSources.push(d);
                    let displayText = '';
                    switch(d) {
                        case 'osm':
                            displayText = 'OSM';
                            break;
                        case 'manual':
                            displayText = 'Ручной';
                            break;
                        case 'ml':
                            displayText = 'ML';
                            break;
                        default:
                            displayText = d;
                    }
                    select.append('<option value="' + d + '">' + displayText + '</option>');
                }
            });

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

        } catch (error) {
            console.error('Ошибка инициализации фильтра по источнику:', error);
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
            
            // Показываем встроенный прогресс-бар
            this.showProgressBar('import-addresses');
            
            // Колбэк для отслеживания прогресса
            const progressCallback = (message, percent) => {
                console.log(`📈 Прогресс: ${percent}% - ${message}`);
                this.updateProgressBar('import-addresses', percent, message);
            };

            // Загружаем адреса
            console.log(`🌍 Начинаем загрузку адресов из OSM...`);
            const osmAddresses = await osmAPI.loadAddressesForArea(this.currentArea, progressCallback);
            console.log(`📦 Получено адресов: ${osmAddresses ? osmAddresses.length : 'null'}`);

            // Обновляем прогресс завершения
            this.updateProgressBar('import-addresses', 100, 'Загрузка завершена');

            if (osmAddresses.length === 0) {
                this.hideProgressBar('import-addresses');
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
            
            // Скрываем прогресс-бар через 2 секунды после успешного завершения
            setTimeout(() => {
                this.hideProgressBar('import-addresses');
            }, 2000);

        } catch (error) {
            console.error('Error loading addresses from OSM:', error);
            this.hideProgressBar('import-addresses');
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
                        updated_at: new Date(),
                        // ВАЖНО: Сохраняем source_metadata для корректного отображения источников
                        source_metadata: listing.source_metadata
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
        document.getElementById('wall-material-modal-title').textContent = 'Добавить материал стен';
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
            document.getElementById('wall-material-modal-title').textContent = 'Редактировать материал стен';
            
            // Показываем модальное окно
            document.getElementById('wallMaterialModal').classList.remove('hidden');
            document.getElementById('wallMaterialName').focus();
            
        } catch (error) {
            console.error('Ошибка загрузки материала для редактирования:', error);
            this.showError('Ошибка загрузки материала: ' + error.message);
        }
    }

    /**
     * Загрузка классов домов в select
     */
    async loadHouseClasses() {
        try {
            const houseClasses = await db.getAll('house_classes');
            
            const select = document.getElementById('editHouseClass');
            
            // Сохраняем текущее значение
            const currentValue = select.value;
            
            // Очищаем существующие опции (кроме первой)
            select.innerHTML = '<option value="">Выберите класс...</option>';
            
            // Добавляем классы домов
            houseClasses.forEach(houseClass => {
                const option = document.createElement('option');
                option.value = houseClass.id;
                option.textContent = houseClass.name;
                select.appendChild(option);
            });
            
            // Восстанавливаем значение
            if (currentValue) {
                select.value = currentValue;
            }
            
            // Обновляем кнопку
            this.updateHouseClassButton();
            
        } catch (error) {
            console.error('Ошибка загрузки классов домов:', error);
        }
    }

    /**
     * Обновление кнопки действия с классом дома
     */
    updateHouseClassButton() {
        const select = document.getElementById('editHouseClass');
        const button = document.getElementById('houseClassActionBtn');
        
        if (select.value) {
            button.textContent = '✏️ Редактировать';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500';
        } else {
            button.textContent = '+ Добавить';
            button.className = 'mt-1 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';
        }
    }

    /**
     * Показать модальное окно добавления класса дома
     */
    showHouseClassModal() {
        document.getElementById('houseClassModal').classList.remove('hidden');
        document.getElementById('house-class-modal-title').textContent = 'Добавить класс дома';
        document.getElementById('houseClassName').focus();
    }

    /**
     * Показать модальное окно редактирования класса дома
     */
    async showEditHouseClassModal(houseClassId) {
        try {
            const houseClass = await db.get('house_classes', houseClassId);
            if (!houseClass) {
                this.showError('Класс дома не найден');
                return;
            }

            // Заполняем форму данными класса дома
            document.getElementById('houseClassId').value = houseClass.id;
            document.getElementById('houseClassName').value = houseClass.name;
            document.getElementById('houseClassColor').value = houseClass.color;

            // Меняем заголовок модального окна
            document.getElementById('house-class-modal-title').textContent = 'Редактировать класс дома';
            
            // Показываем модальное окно
            document.getElementById('houseClassModal').classList.remove('hidden');
            document.getElementById('houseClassName').focus();
            
        } catch (error) {
            console.error('Ошибка загрузки класса дома для редактирования:', error);
            this.showError('Ошибка загрузки класса дома: ' + error.message);
        }
    }

    /**
     * Скрыть модальное окно класса дома
     */
    hideHouseClassModal() {
        document.getElementById('houseClassModal').classList.add('hidden');
        // Очищаем форму
        document.getElementById('houseClassForm').reset();
        document.getElementById('houseClassId').value = '';
    }

    /**
     * Сохранение класса дома
     */
    async saveHouseClass() {
        try {
            const form = document.getElementById('houseClassForm');
            const formData = new FormData(form);
            
            const houseClassId = formData.get('id');
            const houseClass = {
                name: formData.get('name').trim(),
                color: formData.get('color')
            };


            if (!houseClass.name) {
                this.showError('Название класса дома обязательно');
                return;
            }

            // Проверяем уникальность названия (исключая редактируемый класс)
            const existingClasses = await db.getAll('house_classes');
            
            const duplicate = existingClasses.find(c => 
                c.name.toLowerCase() === houseClass.name.toLowerCase() && c.id !== houseClassId
            );

            if (duplicate) {
                this.showError('Класс дома с таким названием уже существует');
                return;
            }

            let savedClass;
            
            if (houseClassId) {
                // Редактирование существующего класса дома
                houseClass.id = houseClassId;
                houseClass.updated_at = new Date();
                savedClass = await db.update('house_classes', houseClass);
                this.showSuccess('Класс дома обновлен успешно');
            } else {
                // Создание нового класса дома
                savedClass = await db.add('house_classes', houseClass);
                this.showSuccess('Класс дома добавлен успешно');
            }
            
            // Обновляем select
            await this.loadHouseClasses();
            
            // Выбираем класс дома
            document.getElementById('editHouseClass').value = savedClass.id;
            this.updateHouseClassButton();
            
            // Закрываем модальное окно
            this.hideHouseClassModal();
            
        } catch (error) {
            console.error('Ошибка сохранения класса дома:', error);
            this.showError('Ошибка сохранения класса дома: ' + error.message);
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
        document.getElementById('house-series-modal-title').textContent = 'Добавить серию дома';
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
            document.getElementById('house-series-modal-title').textContent = 'Редактировать серию дома';
            
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
        document.getElementById('ceiling-material-modal-title').textContent = 'Добавить материал перекрытий';
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
            document.getElementById('ceiling-material-modal-title').textContent = 'Редактировать материал перекрытий';
            
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

    /**
     * Обработка адресов с использованием продвинутого алгоритма
     */
    async processAddressesAdvanced() {
        if (this.processing.addresses) {
            this.showInfo('Обработка адресов уже выполняется');
            return;
        }

        try {
            this.processing.addresses = true;
            console.log('🚀 Начинаем продвинутое определение адресов для объявлений');
            this.updateProgressBar('addresses', 0, 'Подготовка данных для продвинутого алгоритма...');

            // Загружаем объявления без привязанных адресов или с низкой точностью
            const allListings = await db.getListings();
            const unprocessedListings = allListings.filter(listing => {
                const needsReprocessing = 
                    !listing.address_id || 
                    listing.address_match_confidence === 'low' || 
                    listing.address_match_confidence === 'very_low' ||
                    listing.address_match_confidence === 'medium';
                
                const hasCoordinates = listing.coordinates && 
                    listing.coordinates.lat && 
                    (listing.coordinates.lng || listing.coordinates.lon);
                
                return needsReprocessing && hasCoordinates;
            });

            if (unprocessedListings.length === 0) {
                this.showInfo('Нет объявлений для обработки продвинутым алгоритмом');
                return;
            }

            this.updateProgressBar('addresses', 10, 
                `Найдено ${unprocessedListings.length} объявлений для улучшенной обработки`);

            // Загружаем все адреса
            const allAddresses = await db.getAddresses();
            if (allAddresses.length === 0) {
                this.showError('В базе данных нет адресов для сопоставления');
                return;
            }

            this.updateProgressBar('addresses', 20, 
                `Загружено ${allAddresses.length} адресов из базы`);

            // Инициализируем продвинутый алгоритм сопоставления
            if (!window.advancedAddressMatcher) {
                this.showError('Продвинутый алгоритм определения адресов не инициализирован');
                return;
            }

            const matcher = window.advancedAddressMatcher;
            matcher.spatialIndex = this.spatialManager;

            this.updateProgressBar('addresses', 30, 
                '🎯 Запуск продвинутого алгоритма сопоставления...');

            // Обрабатываем объявления батчами для отображения прогресса
            const batchSize = 30; // Меньший размер батча для более точного алгоритма
            let processedCount = 0;
            let improvedCount = 0;
            let results = {
                processed: 0,
                matched: 0,
                improved: 0,
                highConfidence: 0,
                mediumConfidence: 0,
                lowConfidence: 0,
                veryLowConfidence: 0,
                noMatch: 0,
                errors: 0,
                methodStats: {}
            };

            for (let i = 0; i < unprocessedListings.length; i += batchSize) {
                const batch = unprocessedListings.slice(i, i + batchSize);
                const progress = 30 + ((i / unprocessedListings.length) * 60);
                
                this.updateProgressBar('addresses', progress, 
                    `🔍 Продвинутая обработка ${i + 1}-${Math.min(i + batchSize, unprocessedListings.length)} из ${unprocessedListings.length}`);

                // Обрабатываем батч
                for (const listing of batch) {
                    try {
                        const oldConfidence = listing.address_match_confidence;
                        const matchResult = await matcher.matchAddressAdvanced(listing, allAddresses);
                        processedCount++;
                        results.processed++;

                        console.log(`📊 Результат для ${listing.id}: ${matchResult.confidence} (${matchResult.method}), скор: ${matchResult.score?.toFixed(3)}`);

                        if (matchResult.address) {
                            results.matched++;

                            // Проверяем, улучшился ли результат
                            const confidenceLevels = ['none', 'very_low', 'low', 'medium', 'high'];
                            const oldLevel = confidenceLevels.indexOf(oldConfidence || 'none');
                            const newLevel = confidenceLevels.indexOf(matchResult.confidence);
                            
                            if (newLevel > oldLevel) {
                                improvedCount++;
                                results.improved++;
                                console.log(`✅ Улучшение для ${listing.id}: ${oldConfidence} → ${matchResult.confidence}`);
                            }

                            // Обновляем объявление в базе данных
                            listing.address_id = matchResult.address.id;
                            listing.address_match_confidence = matchResult.confidence;
                            listing.address_match_method = matchResult.method;
                            listing.address_match_score = matchResult.score || 0;
                            listing.address_distance = matchResult.distance;
                            listing.updated_at = new Date();

                            // Добавляем дополнительные данные от продвинутого алгоритма
                            if (matchResult.textSimilarity !== undefined) {
                                listing.address_text_similarity = matchResult.textSimilarity;
                            }
                            if (matchResult.semanticSimilarity !== undefined) {
                                listing.address_semantic_similarity = matchResult.semanticSimilarity;
                            }
                            if (matchResult.structuralSimilarity !== undefined) {
                                listing.address_structural_similarity = matchResult.structuralSimilarity;
                            }

                            // Изменяем processing_status при успешном определении адреса
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
                                    results.lowConfidence++;
                                    break;
                                case 'very_low':
                                    results.veryLowConfidence++;
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
                        console.error('Ошибка продвинутой обработки объявления:', error);
                    }
                }

                // Небольшая задержка для обновления UI
                await new Promise(resolve => setTimeout(resolve, 150));
            }

            this.updateProgressBar('addresses', 100, '✅ Продвинутая обработка завершена');

            // Обновляем карту и статистику
            await this.loadAreaStats();
            await this.loadAddresses();

            // Показываем детальный результат
            const methodStatsText = Object.entries(results.methodStats)
                .map(([method, count]) => `  • ${method}: ${count}`)
                .join('\n');

            const message = `🎯 Продвинутая обработка адресов завершена:

📊 Общая статистика:
• Обработано: ${results.processed}
• Найдены адреса: ${results.matched}
• Улучшено: ${results.improved}

🎯 По уровням точности:
• Высокая точность: ${results.highConfidence}
• Средняя точность: ${results.mediumConfidence}
• Низкая точность: ${results.lowConfidence}
• Очень низкая: ${results.veryLowConfidence}
• Не найдено: ${results.noMatch}
• Ошибок: ${results.errors}

🔧 Методы определения:
${methodStatsText}

✨ Использован продвинутый алгоритм с семантическим анализом!`;

            this.showSuccess(message);

        } catch (error) {
            console.error('Error in advanced address processing:', error);
            this.showError('Ошибка продвинутого определения адресов: ' + error.message);
        } finally {
            this.processing.addresses = false;
            this.hideProgressBar('addresses');
        }
    }

    /**
     * Обработка адресов с использованием умного алгоритма с ML
     */
    async processAddressesSmart() {
        if (this.processing.addresses) {
            this.showInfo('Обработка адресов уже выполняется');
            return;
        }

        try {
            this.processing.addresses = true;
            console.log('🧠 Начинаем умное определение адресов с ML');
            this.updateProgressBar('addresses', 0, 'Инициализация умного алгоритма...');

            // Загружаем объявления для обработки умным алгоритмом
            const allListings = await db.getListings();
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
                this.showInfo('Нет объявлений для обработки умным алгоритмом');
                return;
            }

            this.updateProgressBar('addresses', 10, 
                `🧠 Найдено ${targetListings.length} объявлений для умной обработки`);

            // Загружаем все адреса
            const allAddresses = await db.getAddresses();
            if (allAddresses.length === 0) {
                this.showError('В базе данных нет адресов для сопоставления');
                return;
            }

            this.updateProgressBar('addresses', 20, 
                `📍 Загружено ${allAddresses.length} адресов из базы`);

            // Инициализируем умный алгоритм
            if (!window.smartAddressMatcher) {
                this.showError('Умный алгоритм определения адресов не инициализирован');
                return;
            }

            const smartMatcher = window.smartAddressMatcher;
            smartMatcher.spatialIndex = this.spatialManager;

            this.updateProgressBar('addresses', 30, 
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
                
                this.updateProgressBar('addresses', progress, 
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

                            await db.update('listings', listing);

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

            this.updateProgressBar('addresses', 100, '🧠 Умная ML-обработка завершена');

            // Получаем статистику алгоритма
            const algorithmStats = smartMatcher.getStats();

            // Обновляем карту и статистику
            await this.loadAreaStats();
            await this.loadAddresses();

            // Автоматически запускаем ML-анализатор для неопределенных адресов (ОТКЛЮЧЕНО)
            let mlAnalysisResults = {};
            /*
            if (results.noMatch > 0 || results.low > 0 || results.veryLow > 0) {
                this.updateProgressBar('addresses', 95, '🔬 Запуск ML-анализатора неопределенных адресов...');
                
                try {
                    // Загружаем ML-анализатор если он не загружен
                    await this.loadMLAddressAnalyzer();
                    
                    if (window.MLAddressAnalyzer && window.smartAddressMatcher) {
                        console.log('🔬 Автоматический запуск ML-анализатора для неопределенных адресов...');
                        
                        const mlAnalyzer = new MLAddressAnalyzer(db, window.smartAddressMatcher);
                        const mlResult = await mlAnalyzer.analyzeInaccuratelyMatchedAddresses();
                        
                        if (mlResult.success) {
                            mlAnalysisResults = {
                                createdAddresses: mlResult.createdAddresses?.length || 0,
                                processedListings: mlResult.stats?.processedListings || 0,
                                foundGroups: mlResult.stats?.foundGroups || 0
                            };
                            
                            if (mlAnalysisResults.createdAddresses > 0) {
                                console.log(`🎉 ML-анализатор создал ${mlAnalysisResults.createdAddresses} новых адресов`);
                                
                                // Обновляем статистику после ML-обработки
                                await this.loadAreaStats();
                                await this.loadAddresses();
                            } else {
                                console.log('ℹ️ ML-анализатор не создал новых адресов');
                            }
                        }
                    } else {
                        console.warn('⚠️ ML-анализатор недоступен');
                    }
                } catch (mlError) {
                    console.error('❌ Ошибка ML-анализатора:', mlError);
                }
            }
            */

            // Показываем детальный результат
            const methodStatsText = Object.entries(results.methodStats)
                .map(([method, count]) => `  • ${method}: ${count}`)
                .join('\n');

            const mlResultsText = mlAnalysisResults.createdAddresses > 0 ? `

🔬 ML-анализатор неопределенных адресов:
• Обработано объявлений: ${mlAnalysisResults.processedListings}
• Найдено групп: ${mlAnalysisResults.foundGroups}
• Создано новых адресов: ${mlAnalysisResults.createdAddresses}` : '';

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
${methodStatsText}${mlResultsText}

⚡ Производительность:
• Общее время: ${(totalTime / 1000).toFixed(1)}с
• Среднее время на объявление: ${results.avgProcessingTime.toFixed(1)}мс
• Кэш размер: ${algorithmStats.cacheSize}
• Общий успех ML: ${algorithmStats.overallSuccessRate.toFixed(1)}%

🧠 Использован умный алгоритм с машинным обучением!`;

            this.showSuccess(message);

        } catch (error) {
            console.error('Error in smart ML address processing:', error);
            this.showError('Ошибка умного определения адресов: ' + error.message);
        } finally {
            this.processing.addresses = false;
            this.hideProgressBar('addresses');
        }
    }

    /**
     * Анализ неточно определенных адресов с помощью ML
     */
    async analyzeUnresolvedAddresses() {
        if (this.processing.addresses) {
            this.showInfo('Обработка адресов уже выполняется');
            return;
        }

        try {
            this.processing.addresses = true;
            console.log('🔬 Начинаем ML-анализ неопределенных адресов');
            this.updateProgressBar('addresses', 0, 'Инициализация ML анализатора...');

            // Проверяем доступность необходимых компонентов
            if (!window.MLAddressAnalyzer) {
                this.showError('ML анализатор адресов не инициализирован');
                return;
            }

            if (!window.smartAddressMatcher) {
                this.showError('Умный алгоритм определения адресов не инициализирован');
                return;
            }

            // Создаем экземпляр ML анализатора
            const mlAnalyzer = new MLAddressAnalyzer(db, window.smartAddressMatcher);
            
            this.updateProgressBar('addresses', 10, '🔍 Поиск неопределенных адресов...');

            // Запускаем анализ
            const analysisResult = await mlAnalyzer.analyzeInaccuratelyMatchedAddresses();

            if (!analysisResult.success) {
                this.showError('Ошибка анализа: ' + analysisResult.error);
                return;
            }

            this.updateProgressBar('addresses', 90, '📊 Обновление статистики...');

            // Обновляем карту и статистику
            await this.loadAreaStats();
            await this.loadAddresses();

            this.updateProgressBar('addresses', 100, '🔬 ML-анализ завершен');

            // Логируем детальные результаты в консоль
            console.log('🔬 Результаты ML-анализа неопределенных адресов:', analysisResult);
            
            if (analysisResult.createdAddresses && analysisResult.createdAddresses.length > 0) {
                console.log('🏗️ Созданные адреса:');
                analysisResult.createdAddresses.forEach((address, index) => {
                    console.log(`${index + 1}. "${address.address}"`, address);
                });
            }
            
            if (analysisResult.groups && analysisResult.groups.length > 0) {
                console.log('🧩 Найденные группы:');
                analysisResult.groups.forEach((group, index) => {
                    console.log(`Группа ${index + 1}:`, group);
                });
            }

            // Получаем детальную статистику
            const stats = mlAnalyzer.getAnalysisStats();
            
            // Формируем детальный отчет
            let message = `🔬 ML-анализ неопределенных адресов завершен:

📊 Результаты анализа:
• Обработано объявлений: ${stats.processedListings}
• Найдено групп: ${stats.foundGroups}
• Создано адресов: ${stats.createdAddresses}`;

            if (stats.averageGroupSize > 0) {
                message += `\n• Средний размер группы: ${stats.averageGroupSize.toFixed(1)} объявлений`;
            }

            if (stats.efficiency > 0) {
                message += `\n• Эффективность: ${stats.efficiency.toFixed(1)}%`;
            }

            message += `\n\n${analysisResult.message}`;

            // Добавляем информацию о созданных адресах
            if (analysisResult.createdAddresses && analysisResult.createdAddresses.length > 0) {
                message += `\n\n🏗️ СОЗДАННЫЕ АДРЕСА (${analysisResult.createdAddresses.length}):`;
                analysisResult.createdAddresses.forEach((address, index) => {
                    const coords = `${address.coordinates.lat.toFixed(6)}, ${address.coordinates.lng.toFixed(6)}`;
                    const floors = address.floors_count ? `, ${address.floors_count} эт.` : '';
                    const confidence = address.confidence ? ` (уверенность: ${(address.confidence * 100).toFixed(1)}%)` : '';
                    
                    message += `\n${index + 1}. "${address.address}"${floors}`;
                    message += `\n   📍 ${coords}`;
                    message += `\n   📊 ${address.listings_count} объявлений${confidence}`;
                    if (index < analysisResult.createdAddresses.length - 1) {
                        message += `\n`;
                    }
                });
                
                // Добавляем инструкцию для просмотра адресов
                message += `\n\n💡 Совет: Новые адреса появились в таблице адресов области и на карте.`;
                message += `\n   Используйте фильтры карты для поиска созданных адресов.`;
            }

            // Добавляем информацию о группах
            if (analysisResult.groups && analysisResult.groups.length > 0) {
                message += `\n\n🧩 Найденные группы:`;
                analysisResult.groups.slice(0, 3).forEach((group, index) => {
                    const avgSim = (group.avgSimilarity * 100).toFixed(1);
                    message += `\n${index + 1}. ${group.listings.length} объявлений (схожесть: ${avgSim}%)`;
                });
                
                if (analysisResult.groups.length > 3) {
                    message += `\n... и еще ${analysisResult.groups.length - 3} групп`;
                }
            }

            message += `\n\n🎯 Алгоритм автоматически:
• Находит объявления без адресов
• Группирует их по схожести названий и координат
• Создает новые адреса с минимальным наполнением
• Привязывает объявления к созданным адресам`;

            this.showSuccess(message);

        } catch (error) {
            console.error('Error in ML address analysis:', error);
            this.showError('Ошибка ML-анализа адресов: ' + error.message);
        } finally {
            this.processing.addresses = false;
            this.hideProgressBar('addresses');
        }
    }

    async processDuplicates() {
        try {
            // Проверяем что область загружена
            if (!this.currentArea || !this.currentAreaId) {
                this.showError('Область не загружена');
                return;
            }

            // Проверяем инициализацию детектора дублей
            if (!window.duplicateDetector) {
                this.showError('Система поиска дублей не инициализирована');
                return;
            }

            const progressText = document.getElementById('duplicatesProgress');
            const progressBar = document.getElementById('duplicatesProgressBar');
            const statusText = document.getElementById('duplicatesStatus');
            const processBtn = document.getElementById('processDuplicatesBtn');

            // Показываем прогресс
            if (statusText) {
                statusText.classList.remove('hidden');
                statusText.textContent = 'Инициализация...';
            }

            // Блокируем кнопку
            if (processBtn) {
                processBtn.disabled = true;
                processBtn.textContent = 'Обработка...';
            }

            this.showInfo('Начинаем поиск и обработку дублей...');

            // Инициализируем детектор
            await window.duplicateDetector.init();

            // Запускаем обработку с callback прогресса
            const results = await window.duplicateDetector.processDuplicates(
                this.currentArea,
                (progress) => {
                    // Обновляем прогресс
                    if (progressText) {
                        progressText.textContent = `${progress.percent}%`;
                    }
                    if (progressBar) {
                        progressBar.style.width = `${progress.percent}%`;
                    }
                    if (statusText) {
                        statusText.textContent = `Обработано ${progress.current} из ${progress.total} объявлений`;
                    }
                }
            );

            // Показываем результаты
            const message = `Обработка дублей завершена!\n\n` +
                           `📊 Обработано объявлений: ${results.processed}\n` +
                           `🏠 Объединено в объекты: ${results.merged}\n` +
                           `📍 Групп адресов: ${results.groups}\n` +
                           `❌ Ошибок: ${results.errors}`;

            this.showSuccess(message);

            // Обновляем таблицы для отображения изменений
            await this.loadDuplicatesTable();
            await this.loadAddresses();
            
            // Обновляем статистику дублей
            await this.updateDuplicatesStats();

            // Сбрасываем прогресс
            if (progressText) progressText.textContent = '100%';
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Обработка завершена';

        } catch (error) {
            console.error('❌ Ошибка обработки дублей:', error);
            this.showError(`Ошибка обработки дублей: ${error.message}`);
        } finally {
            // Разблокируем кнопку
            const processBtn = document.getElementById('processDuplicatesBtn');
            if (processBtn) {
                processBtn.disabled = false;
                processBtn.textContent = 'Обработать дубли';
            }
        }
    }

    /**
     * Обработка дублей с использованием продвинутого алгоритма
     */
    async processDuplicatesAdvanced() {
        try {
            // Проверяем что область загружена
            if (!this.currentArea || !this.currentAreaId) {
                this.showError('Область не загружена');
                return;
            }

            // Проверяем инициализацию продвинутого детектора дублей
            if (!window.advancedDuplicateDetector) {
                this.showError('Продвинутая система поиска дублей не инициализирована');
                return;
            }

            const progressText = document.getElementById('duplicatesProgress');
            const progressBar = document.getElementById('duplicatesProgressBar');
            const statusText = document.getElementById('duplicatesStatus');
            const processBtn = document.getElementById('processDuplicatesAdvancedBtn');

            // Показываем прогресс
            if (statusText) {
                statusText.classList.remove('hidden');
                statusText.textContent = 'Инициализация продвинутого алгоритма...';
            }

            // Блокируем кнопку
            if (processBtn) {
                processBtn.disabled = true;
                processBtn.textContent = 'Продвинутая обработка...';
            }

            this.showInfo('🚀 Начинаем продвинутый поиск и обработку дублей...');

            // Инициализируем продвинутый детектор
            await window.advancedDuplicateDetector.init();

            // Запускаем продвинутую обработку с callback прогресса
            const results = await window.advancedDuplicateDetector.processDuplicatesAdvanced(
                this.currentArea,
                (progress) => {
                    // Обновляем прогресс
                    if (progressText) {
                        progressText.textContent = `${progress.percent}%`;
                    }
                    if (progressBar) {
                        progressBar.style.width = `${progress.percent}%`;
                    }
                    if (statusText) {
                        statusText.textContent = `Обработано ${progress.current} из ${progress.total} объявлений`;
                    }
                }
            );

            // Показываем результаты
            const message = `🎯 Продвинутая обработка дублей завершена!\n\n` +
                           `📊 Обработано объявлений: ${results.processed}\n` +
                           `🏠 Объединено в объекты: ${results.merged}\n` +
                           `📍 Групп адресов: ${results.groups}\n` +
                           `❌ Ошибок: ${results.errors}\n\n` +
                           `✨ Использован продвинутый алгоритм с анализом уникальных характеристик!`;

            this.showSuccess(message);

            // Обновляем таблицы для отображения изменений
            await this.loadDuplicatesTable();
            await this.loadAddresses();
            
            // Обновляем статистику дублей
            await this.updateDuplicatesStats();

            // Сбрасываем прогресс
            if (progressText) progressText.textContent = '100%';
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Продвинутая обработка завершена';

        } catch (error) {
            console.error('❌ Ошибка продвинутой обработки дублей:', error);
            this.showError(`Ошибка продвинутой обработки дублей: ${error.message}`);
        } finally {
            // Разблокируем кнопку
            const processBtn = document.getElementById('processDuplicatesAdvancedBtn');
            if (processBtn) {
                processBtn.disabled = false;
                processBtn.textContent = 'Продвинутая обработка дублей';
            }
        }
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
            // Сохраняем состояние открытых child rows перед обновлением
            const expandedRows = this.saveExpandedRowsState();
            
            // Загружаем объявления, которые попадают в область (полигон)
            const allListings = await this.getListingsInArea();
            console.log('📋 Загружено объявлений:', allListings.length);
            
            // Исключаем объявления со статусом "processed"
            const listings = allListings.filter(listing => listing.processing_status !== 'processed');
            console.log('📋 Объявлений после фильтрации (исключены "processed"):', listings.length);
            
            // Загружаем объекты недвижимости
            const objects = await window.realEstateObjectManager.getObjectsWithFilters();
            console.log('📋 Загружено объектов:', objects.length);
            
            // Объединяем данные для таблицы
            const tableData = [
                ...listings.map(item => ({...item, type: 'listing'})),
                ...objects.map(item => ({...item, type: 'object'}))
            ];

            console.log(`📋 Загружено ${tableData.length} элементов для таблицы дублей (${listings.length} объявлений + ${objects.length} объектов)`);

            // Сохраняем данные в переменные класса для использования в других функциях
            this.listings = listings;
            this.objects = objects;

            // Очищаем выбранные элементы при перезагрузке
            this.selectedDuplicates.clear();

            // Обновляем данные в DataTable
            if (this.duplicatesTable) {
                this.duplicatesTable.clear();
                this.duplicatesTable.rows.add(tableData);
                
                // Применяем текущие фильтры (включая статус и фильтры обработки)
                this.applyProcessingFilters();
                
                // Восстанавливаем состояние открытых child rows после небольшой задержки
                setTimeout(() => {
                    this.restoreExpandedRowsState(expandedRows);
                }, 300);
            }

            // Обновляем UI выбора
            this.updateDuplicatesSelection();

        } catch (error) {
            console.error('Ошибка загрузки таблицы дублей:', error);
            this.showError('Ошибка загрузки данных: ' + error.message);
        }
    }

    /**
     * Сохранить состояние открытых child rows
     */
    saveExpandedRowsState() {
        if (!this.duplicatesTable) return [];
        
        const expandedRows = [];
        
        // Проходим по всем строкам таблицы
        this.duplicatesTable.rows().every(function(rowIdx, tableLoop, rowLoop) {
            const row = this;
            const data = row.data();
            
            // Проверяем, открыт ли child row для этой строки
            if (row.child.isShown()) {
                expandedRows.push({
                    id: data.id,
                    type: data.type
                });
                console.log('💾 Сохранено состояние expanded row:', data.id, data.type);
            }
        });
        
        console.log('💾 Сохранено состояний expanded rows:', expandedRows.length);
        return expandedRows;
    }

    /**
     * Восстановить состояние открытых child rows
     */
    async restoreExpandedRowsState(expandedRows) {
        if (!this.duplicatesTable || !expandedRows || expandedRows.length === 0) {
            console.log('🔄 Нет состояний expanded rows для восстановления');
            return;
        }
        
        console.log('🔄 Восстанавливаем', expandedRows.length, 'expanded rows');
        
        // Проходим по всем строкам таблицы
        this.duplicatesTable.rows().every(function(rowIdx, tableLoop, rowLoop) {
            const row = this;
            const data = row.data();
            
            // Проверяем, была ли эта строка развернута
            const wasExpanded = expandedRows.find(item => 
                item.id === data.id && item.type === data.type
            );
            
            if (wasExpanded && data.type === 'object') {
                // Восстанавливаем expanded состояние для объектов
                console.log('🔄 Восстанавливаем expanded row для объекта:', data.id);
                
                // Находим элемент expand в строке и программно кликаем по нему
                const tr = $(row.node());
                const expandElement = tr.find('.expand-object-listings');
                
                if (expandElement.length > 0) {
                    // Симулируем клик для раскрытия child row
                    setTimeout(async () => {
                        try {
                            await window.areaPage.showObjectListings(row, data.id);
                            tr.addClass('shown');
                            expandElement.find('svg').css('transform', 'rotate(180deg)');
                            console.log('✅ Восстановлен expanded row для объекта:', data.id);
                        } catch (error) {
                            console.error('❌ Ошибка восстановления expanded row:', error);
                        }
                    }, 100 * rowIdx); // Небольшая задержка между восстановлениями
                }
            }
        });
    }

    /**
     * Загрузка модуля ML-анализатора адресов
     */
    async loadMLAddressAnalyzer() {
        if (window.MLAddressAnalyzer) {
            return window.MLAddressAnalyzer;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '../utils/ml-address-analyzer.js';
            script.onload = () => {
                if (window.MLAddressAnalyzer) {
                    console.log('✅ ML-анализатор адресов загружен');
                    resolve(window.MLAddressAnalyzer);
                } else {
                    reject(new Error('ML-анализатор адресов не найден'));
                }
            };
            script.onerror = () => reject(new Error('Ошибка загрузки ML-анализатора адресов'));
            document.head.appendChild(script);
        });
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
        console.log('🔗 bindDuplicateRowEvents: найдено чекбоксов:', checkboxes.length);
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
        console.log('🔄 handleDuplicateSelection called for checkbox:', checkbox);
        const itemId = checkbox.dataset.id;
        const itemType = checkbox.dataset.type;
        const key = `${itemType}_${itemId}`;

        console.log('🔄 Checkbox data:', { itemId, itemType, key, checked: checkbox.checked });

        if (checkbox.checked) {
            this.selectedDuplicates.add(key);
        } else {
            this.selectedDuplicates.delete(key);
        }

        console.log('🔄 Selected duplicates:', this.selectedDuplicates.size);

        // Обновляем состояние главного чекбокса
        this.updateSelectAllCheckbox();
        
        this.updateDuplicatesSelection();
    }

    /**
     * Обновление состояния главного чекбокса "Выбрать все"
     */
    updateSelectAllCheckbox() {
        const allCheckboxes = document.querySelectorAll('.duplicate-checkbox');
        const selectAllCheckbox = document.getElementById('selectAllDuplicates');
        
        if (selectAllCheckbox && allCheckboxes.length > 0) {
            const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
            selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
        }
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
        const selectAllCheckbox = document.getElementById('selectAllDuplicates');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        this.updateDuplicatesSelection();
    }

    /**
     * Обновление UI выбора дублей
     */
    updateDuplicatesSelection() {
        console.log('🔄 updateDuplicatesSelection called, selectedCount:', this.selectedDuplicates.size);
        const selectedCount = this.selectedDuplicates.size;
        const selectedInfo = document.getElementById('selectedItemsInfo');
        const selectedCountEl = document.getElementById('selectedItemsCount');
        const mergeBtnEl = document.getElementById('mergeDuplicatesBtn');
        const splitBtnEl = document.getElementById('splitDuplicatesBtn');
        const correctAddressBtnEl = document.getElementById('correctAddressBtn');

        if (selectedCount > 0) {
            selectedInfo.classList.remove('hidden');
            const elementText = selectedCount === 1 ? 'элемент выбран' : 'элементов выбрано';
            selectedCountEl.textContent = `${selectedCount} ${elementText}`;
            mergeBtnEl.disabled = selectedCount < 1;
            splitBtnEl.disabled = false;
            
            // Показываем кнопку "Верный адрес" только при фильтре "Определить адрес"
            let processingStatusFilter = '';
            if (this.processingStatusSlimSelect) {
                const selected = this.processingStatusSlimSelect.getSelected();
                processingStatusFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            // Также проверим значение элемента напрямую
            const directValue = document.getElementById('processingStatusFilter')?.value || '';
            
            const actualFilter = processingStatusFilter || directValue;
            
            console.log('🔍 Processing filter for button:', {
                selectedCount,
                processingStatusFilter,
                directValue,
                actualFilter,
                slimSelectExists: !!this.processingStatusSlimSelect,
                getSelected: this.processingStatusSlimSelect?.getSelected(),
                checkCondition: actualFilter === 'address_needed'
            });
            
            if (actualFilter === 'address_needed') {
                console.log('✅ Showing correct address button');
                correctAddressBtnEl.classList.remove('hidden');
                correctAddressBtnEl.disabled = false;
            } else {
                console.log('❌ Hiding correct address button');
                correctAddressBtnEl.classList.add('hidden');
            }
        } else {
            selectedInfo.classList.add('hidden');
            mergeBtnEl.disabled = true;
            splitBtnEl.disabled = true;
            correctAddressBtnEl.classList.add('hidden');
        }
    }

    /**
     * Пометить адрес как верный (перевод в статус manual)
     */
    async markAddressAsCorrect() {
        try {
            if (this.selectedDuplicates.size === 0) {
                this.showError('Выберите объявления для подтверждения адреса');
                return;
            }

            const selectedItems = Array.from(this.selectedDuplicates);
            console.log('🏠 Marking addresses as correct for:', selectedItems);

            // Получаем выбранные объявления
            const listingsToUpdate = [];
            for (const key of selectedItems) {
                const [type, ...idParts] = key.split('_');
                const id = idParts.join('_'); // Восстанавливаем полный ID
                console.log('🔍 Processing key:', key, 'type:', type, 'id:', id);
                if (type === 'listing') {
                    const listing = this.listings.find(l => l.id === id);
                    console.log('🔍 Found listing:', !!listing, listing?.id);
                    if (listing) {
                        listingsToUpdate.push(listing);
                    }
                } else {
                    console.log('🔍 Skipping non-listing type:', type);
                }
            }
            
            console.log('🔍 listingsToUpdate:', listingsToUpdate.length, 'items');

            if (listingsToUpdate.length === 0) {
                this.showError('Не найдены объявления для обновления');
                return;
            }

            // Обновляем статус определения адреса на "manual"
            for (const listing of listingsToUpdate) {
                // Добавляем пример для обучения ML-модели (ПОЗИТИВНЫЙ пример)
                if (window.smartAddressMatcher && listing.address && listing.address_id) {
                    try {
                        const matchedAddress = await db.get('addresses', listing.address_id);
                        if (matchedAddress) {
                            console.log(`📚 Adding ML training example for listing ${listing.id}:`);
                            console.log(`   - Listing address: "${listing.address}"`);
                            console.log(`   - Matched address: "${matchedAddress.address}"`);
                            
                            window.smartAddressMatcher.addTrainingExample(
                                listing.address,
                                matchedAddress.address,
                                true // Пользователь подтвердил, что это правильный адрес
                            );
                            
                            const currentCount = localStorage.getItem('ml_training_count');
                            console.log(`📚 ML training example added: POSITIVE for listing ${listing.id}, total examples: ${currentCount}`);
                        } else {
                            console.warn(`❌ No matched address found for listing ${listing.id}`);
                        }
                    } catch (error) {
                        console.warn(`❌ ML training failed for listing ${listing.id}:`, error);
                    }
                } else {
                    console.warn(`❌ Cannot add ML example: smartAddressMatcher=${!!window.smartAddressMatcher}, address="${listing.address}", address_id=${listing.address_id}`);
                }

                listing.address_match_confidence = 'manual';
                
                // Обновляем в базе данных
                await db.update('listings', listing);
                console.log(`✅ Address marked as correct for listing ${listing.id}`);
            }

            this.showSuccess(`Адрес подтвержден для ${listingsToUpdate.length} объявлений`);
            
            // Очищаем выбор и обновляем таблицу
            this.clearDuplicatesSelection();
            await this.loadDuplicatesTable();

        } catch (error) {
            console.error('Ошибка при подтверждении адреса:', error);
            this.showError('Ошибка при подтверждении адреса: ' + error.message);
        }
    }

    /**
     * Пометить адрес как верный для одного объявления (из модального окна)
     */
    async markSingleAddressAsCorrect(listingId) {
        try {
            const listing = this.listings.find(l => l.id === listingId);
            if (!listing) {
                this.showError('Объявление не найдено');
                return;
            }

            console.log('🏠 Marking single address as correct for listing:', listingId);

            // Добавляем пример для обучения ML-модели (ПОЗИТИВНЫЙ пример)
            if (window.smartAddressMatcher && listing.address && listing.address_id) {
                try {
                    const matchedAddress = await db.get('addresses', listing.address_id);
                    if (matchedAddress) {
                        window.smartAddressMatcher.addTrainingExample(
                            listing.address,
                            matchedAddress.address,
                            true // Пользователь подтвердил, что это правильный адрес
                        );
                        console.log('📚 ML training example added: POSITIVE');
                    }
                } catch (error) {
                    console.warn('ML training failed:', error);
                }
            }

            // Обновляем статус определения адреса на "manual"
            listing.address_match_confidence = 'manual';
            
            // Обновляем в базе данных
            await db.update('listings', listing);
            console.log(`✅ Single address marked as correct for listing ${listingId}`);

            this.showSuccess('Адрес подтвержден');
            
            // Обновляем модальное окно
            this.updateModalAddressInfo(listingId, listing);
            
            // Обновляем таблицу если она открыта
            await this.loadDuplicatesTable();

        } catch (error) {
            console.error('Ошибка при подтверждении адреса:', error);
            this.showError('Ошибка при подтверждении адреса: ' + error.message);
        }
    }

    /**
     * Пометить адрес как неверный для одного объявления (из модального окна)
     */
    async markSingleAddressAsIncorrect(listingId) {
        try {
            const listing = this.listings.find(l => l.id === listingId);
            if (!listing) {
                this.showError('Объявление не найдено');
                return;
            }

            console.log('🏠 Marking single address as incorrect for listing:', listingId);

            // Добавляем пример для обучения ML-модели (НЕГАТИВНЫЙ пример)
            if (window.smartAddressMatcher && listing.address && listing.address_id) {
                try {
                    const matchedAddress = await db.get('addresses', listing.address_id);
                    if (matchedAddress) {
                        window.smartAddressMatcher.addTrainingExample(
                            listing.address,
                            matchedAddress.address,
                            false // Пользователь указал, что это неправильный адрес
                        );
                        console.log('📚 ML training example added: NEGATIVE');
                    }
                } catch (error) {
                    console.warn('ML training failed:', error);
                }
            }

            // Обновляем статус определения адреса на "very_low" чтобы показать неточность
            listing.address_match_confidence = 'very_low';
            
            // Очищаем привязку к адресу
            listing.address_id = null;
            
            // Обновляем в базе данных
            await db.update('listings', listing);
            console.log(`❌ Single address marked as incorrect for listing ${listingId}`);

            this.showSuccess('Адрес отмечен как неверный');
            
            // Обновляем модальное окно
            this.updateModalAddressInfo(listingId, listing);
            
            // Обновляем таблицу если она открыта
            await this.loadDuplicatesTable();

        } catch (error) {
            console.error('Ошибка при отметке адреса как неверного:', error);
            this.showError('Ошибка при отметке адреса как неверного: ' + error.message);
        }
    }

    /**
     * Обновить информацию об адресе в модальном окне
     */
    updateModalAddressInfo(listingId, listing) {
        const locationContent = document.getElementById(`locationPanelContent-${listingId}`);
        if (locationContent) {
            // Обновляем информацию об адресе
            const addressInfoHtml = this.renderAddressAccuracyInfo(listing);
            const mapContainer = document.getElementById(`listing-map-${listingId}`);
            const mapHtml = mapContainer ? mapContainer.outerHTML : '';
            
            locationContent.innerHTML = addressInfoHtml + mapHtml;
            
            // Обновляем заголовок панели местоположения
            const locationHeader = document.getElementById(`locationPanelHeader-${listingId}`);
            if (locationHeader) {
                const statusElement = locationHeader.querySelector('.text-sm');
                if (statusElement) {
                    statusElement.textContent = this.getAddressStatusText(listing);
                    statusElement.className = `text-sm ${this.getAddressStatusClass(listing)}`;
                }
            }
            
            // Повторно инициализируем адресный селектор
            setTimeout(() => {
                this.initializeAddressSelector(listingId, listing.address_id);
                
                // Добавляем обработчик для кнопки сохранения
                const saveButton = document.getElementById(`saveAddress_${listingId}`);
                if (saveButton) {
                    saveButton.addEventListener('click', () => {
                        this.saveListingAddress(listingId);
                    });
                }
                
                // Добавляем обработчик для кнопки "Верный адрес" если она есть
                const correctAddressModalButton = document.getElementById(`correctAddressModal_${listingId}`);
                if (correctAddressModalButton) {
                    correctAddressModalButton.addEventListener('click', () => {
                        this.markSingleAddressAsCorrect(listingId);
                    });
                }
                
                // Добавляем обработчик для кнопки "Неверный адрес" если она есть
                const incorrectAddressModalButton = document.getElementById(`incorrectAddressModal_${listingId}`);
                if (incorrectAddressModalButton) {
                    incorrectAddressModalButton.addEventListener('click', () => {
                        this.markSingleAddressAsIncorrect(listingId);
                    });
                }
                
                // Если карта была инициализирована, переинициализируем её
                if (mapContainer && mapContainer._leafletMap) {
                    this.renderListingMap(listing);
                }
            }, 100);
        }
    }

    /**
     * Объединение дублей / создание объекта недвижимости
     */
    async mergeDuplicates() {
        if (this.selectedDuplicates.size < 1) {
            this.showError('Выберите минимум 1 элемент для обработки');
            return;
        }

        try {
            const selectedItems = Array.from(this.selectedDuplicates);
            console.log('🔗 Создание объекта недвижимости:', selectedItems);
            
            // Проверяем доступность RealEstateObjectManager
            if (!window.realEstateObjectManager) {
                this.showError('RealEstateObjectManager не инициализирован');
                console.error('❌ RealEstateObjectManager не найден в window');
                return;
            }
            
            // Преобразуем ключи выбора в формат для RealEstateObjectManager
            const itemsToMerge = selectedItems.map(key => {
                const [type, ...idParts] = key.split('_');
                const id = idParts.join('_'); // Восстанавливаем полный ID
                return { type, id };
            });
            
            console.log('🔗 Элементы для объединения:', itemsToMerge);
            
            // Проверяем, что у всех элементов одинаковый адрес
            const validation = await window.realEstateObjectManager.validateMergeByAddress(itemsToMerge);
            if (!validation.canMerge) {
                this.showError('Объединять можно только элементы с одинаковым адресом');
                return;
            }
            
            // Определяем адрес для нового объекта
            let addressId = null;
            if (validation.addresses.length > 0) {
                addressId = validation.addresses[0];
            } else {
                // Если адрес не определен, берем из первого объявления
                const firstItem = itemsToMerge.find(item => item.type === 'listing');
                if (firstItem) {
                    const listing = this.listings.find(l => l.id === firstItem.id);
                    addressId = listing?.address_id;
                }
            }
            
            if (!addressId) {
                this.showError('Не удалось определить адрес для объединения');
                return;
            }
            
            // Выполняем объединение
            const newObject = await window.realEstateObjectManager.mergeIntoObject(itemsToMerge, addressId);
            
            if (newObject) {
                const elementText = selectedItems.length === 1 ? 'элемента' : 'элементов';
                this.showSuccess(`Создан объект недвижимости из ${selectedItems.length} ${elementText}`);
                
                // Очищаем выбор и обновляем таблицу
                this.clearDuplicatesSelection();
                await this.loadDuplicatesTable();
            }
            
        } catch (error) {
            console.error('❌ Ошибка объединения дублей:', error);
            this.showError('Ошибка объединения: ' + error.message);
        }
    }

    /**
     * Разбивка дублей
     */
    async splitDuplicates() {
        if (this.selectedDuplicates.size === 0) {
            this.showError('Выберите элементы для разбивки дублей');
            return;
        }

        try {
            const selectedItems = Array.from(this.selectedDuplicates);
            console.log('✂️ Разбивка дублей:', selectedItems);
            
            // Проверяем доступность RealEstateObjectManager
            if (!window.realEstateObjectManager) {
                this.showError('RealEstateObjectManager не инициализирован');
                console.error('❌ RealEstateObjectManager не найден в window');
                return;
            }
            
            // Получаем только объекты для разбивки (объявления игнорируем)
            const objectsToSplit = selectedItems
                .filter(key => key.startsWith('object_'))
                .map(key => {
                    const [type, ...idParts] = key.split('_');
                    return idParts.join('_'); // Восстанавливаем полный ID
                });
            
            if (objectsToSplit.length === 0) {
                this.showError('Выберите объекты недвижимости для разбивки');
                return;
            }
            
            // Подтверждение операции
            const confirmed = confirm(
                `Вы уверены, что хотите разбить ${objectsToSplit.length} объектов на отдельные объявления?\n\n` +
                'Это действие нельзя отменить.'
            );
            
            if (!confirmed) {
                return;
            }
            
            console.log('✂️ Объекты для разбивки:', objectsToSplit);
            
            // Выполняем разбивку
            const result = await window.realEstateObjectManager.splitObjectsToListings(objectsToSplit);
            
            if (result) {
                this.showSuccess(
                    `Разбито ${result.deletedObjectsCount} объектов на ${result.updatedListingsCount} объявлений. ` +
                    'Всем объявлениям установлен статус "Обработать на дубли"'
                );
                
                // Очищаем выбор и обновляем таблицу
                this.clearDuplicatesSelection();
                await this.loadDuplicatesTable();
            }
            
        } catch (error) {
            console.error('❌ Ошибка разбивки дублей:', error);
            this.showError('Ошибка разбивки: ' + error.message);
        }
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

    showWarning(message) {
        this.showNotification(message, 'warning');
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
            
            let dataForFilter = null;
            
            if (type === 'listing') {
                // Получаем данные объявления
                dataForFilter = await db.get('listings', id);
                if (!dataForFilter) {
                    this.showError('Не удалось загрузить данные объявления');
                    return;
                }
            } else if (type === 'object') {
                // Получаем данные объекта недвижимости
                dataForFilter = await db.get('objects', id);
                if (!dataForFilter) {
                    this.showError('Не удалось загрузить данные объекта недвижимости');
                    return;
                }
            } else {
                this.showError('Неизвестный тип элемента');
                return;
            }
            
            // Заполняем фильтры данными
            await this.fillProcessingFilters(dataForFilter);
            
            const elementType = type === 'listing' ? 'объявления' : 'объекта недвижимости';
            this.showSuccess(`Фильтр обработки заполнен данными из ${elementType}`);
            
        } catch (error) {
            console.error('Ошибка при заполнении фильтра обработки:', error);
            this.showError('Ошибка при заполнении фильтра обработки: ' + error.message);
        }
    }

    /**
     * Заполнение фильтров обработки данными из объявления или объекта недвижимости
     */
    async fillProcessingFilters(data) {
        try {
            // Заполняем адрес из справочника адресов
            if (data.address_id && this.processingAddressSlimSelect) {
                this.processingAddressSlimSelect.setSelected([data.address_id]);
                this.showClearButton('clearAddressFilterBtn');
            }
            
            // Заполняем тип недвижимости
            if (data.property_type && this.processingPropertyTypeSlimSelect) {
                this.processingPropertyTypeSlimSelect.setSelected([data.property_type]);
                this.showClearButton('clearPropertyTypeFilterBtn');
            }
            
            // Заполняем этаж
            if (data.floor) {
                const floorInput = document.getElementById('processingFloorFilter');
                if (floorInput) {
                    floorInput.value = data.floor;
                    this.showClearButton('clearFloorFilterBtn');
                }
            }
            
            // Статус обработки НЕ заполняем при нажатии на кнопку - он работает как глобальный фильтр
            
            // Применяем фильтры
            await this.applyProcessingFilters();
            
        } catch (error) {
            console.error('Ошибка при заполнении фильтров:', error);
            throw error;
        }
    }

    /**
     * Получение интервала обновления объявлений из настроек базы данных
     */
    async getUpdateIntervalDays() {
        try {
            const updateDays = await db.getSetting('update_days');
            return updateDays || 7; // По умолчанию 7 дней
        } catch (error) {
            console.warn('Ошибка получения настройки update_days:', error);
            return 7; // Fallback на 7 дней
        }
    }

    /**
     * Применение фильтров обработки к таблице
     */
    async applyProcessingFilters() {
        try {
            // Получаем значения фильтров из SlimSelect и обычных элементов
            let addressFilter = '';
            if (this.processingAddressSlimSelect) {
                const selected = this.processingAddressSlimSelect.getSelected();
                addressFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            let propertyTypeFilter = '';
            if (this.processingPropertyTypeSlimSelect) {
                const selected = this.processingPropertyTypeSlimSelect.getSelected();
                propertyTypeFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            let processingStatusFilter = '';
            if (this.processingStatusSlimSelect) {
                const selected = this.processingStatusSlimSelect.getSelected();
                processingStatusFilter = selected?.[0]?.value || selected?.[0] || '';
            }
            
            const floorFilter = document.getElementById('processingFloorFilter')?.value || '';
            
            // Получаем значение основного фильтра статусов
            const statusFilter = document.getElementById('duplicatesStatusFilter')?.value || 'all';
            
            console.log('🔧 Применение фильтров:', {
                addressFilter,
                propertyTypeFilter,
                floorFilter,
                processingStatusFilter,
                statusFilter
            });
            
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
                
                // Фильтр по статусу обработки (только для объявлений)
                if (processingStatusFilter) {
                    //console.log('🔍 Processing status filter:', processingStatusFilter, 'row type:', rowData.type, 'row processing_status:', rowData.processing_status, 'address_match_confidence:', rowData.address_match_confidence);
                    
                    // Объекты недвижимости не имеют статуса обработки, поэтому скрываем их при фильтрации
                    if (rowData.type === 'object') {
                        return false;
                    }
                    
                    // Для объявлений применяем фильтр по статусу обработки
                    if (processingStatusFilter === 'address_needed') {
                        // Показываем объявления:
                        // 1. С processing_status === 'address_needed' 
                        // 2. ИЛИ с низкой точностью определения адреса (address_match_confidence: 'low' или 'very_low')
                        // НО НЕ показываем адреса со статусом 'manual' (уже подтвержденные)
                        const hasAddressNeededStatus = rowData.processing_status === 'address_needed';
                        const hasLowAddressConfidence = rowData.address_match_confidence === 'low' || rowData.address_match_confidence === 'very_low';
                        const isManualConfidence = rowData.address_match_confidence === 'manual';
                        
                        // console.log('📍 Address needed check:', {
                        //     hasAddressNeededStatus: hasAddressNeededStatus,
                        //     hasLowAddressConfidence: hasLowAddressConfidence,
                        //     isManualConfidence: isManualConfidence,
                        //     shouldShow: (hasAddressNeededStatus || hasLowAddressConfidence) && !isManualConfidence
                        // });
                        
                        // Скрываем если нет нужного статуса ИЛИ если адрес уже подтвержден вручную
                        if ((!hasAddressNeededStatus && !hasLowAddressConfidence) || isManualConfidence) {
                            return false;
                        }
                    } else {
                        // Для остальных фильтров - простое сравнение
                        if (rowData.processing_status !== processingStatusFilter) {
                            return false;
                        }
                    }
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
            if (this.processingStatusSlimSelect) {
                this.processingStatusSlimSelect.setSelected([]);
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
                case 'processingStatusFilter':
                    if (this.processingStatusSlimSelect) {
                        this.processingStatusSlimSelect.setSelected([]);
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
            
            // Кэшируем настройку интервала обновления
            this.cachedUpdateIntervalDays = await this.getUpdateIntervalDays();
            
            // Инициализируем SlimSelect для адресов
            await this.initAddressFilter();
            
            // Инициализируем SlimSelect для типа недвижимости
            await this.initPropertyTypeFilter();
            
            // Инициализируем SlimSelect для статуса обработки
            await this.initProcessingStatusFilter();
            
            // Добавляем обработчики событий
            this.bindProcessingFilterEvents();
            
            console.log('✅ Фильтры обработки инициализированы');
            
        } catch (error) {
            console.error('Ошибка при инициализации фильтров обработки:', error);
            this.showError('Ошибка инициализации фильтров: ' + error.message);
        }
    }

    /**
     * Инициализация интеграции с сервисами
     */
    async initServicesIntegration() {
        try {
            // Инициализируем интеграцию с новой сервисной архитектурой
            this.servicesIntegration = await initializeAreaServicesIntegration(this);
            console.log('✅ Services integration initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize services integration:', error);
            this.showNotification('Ошибка инициализации сервисов: ' + error.message, 'error');
        }
    }

    /**
     * Восстановление состояния таблицы адресов из localStorage
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

    // toggleAddressTable удален - управление перенесено в UIManager

    /**
     * Переключение состояния панели работы с данными (сворачивание/разворачивание)
     */
    /**
     * Сворачивание/разворачивание панели статистики
     */
    // toggleStatisticsPanel удален - управление перенесено в UIManager

    // toggleDataWorkPanel удален - управление перенесено в UIManager

    /**
     * Переключение панели карты области
     */
    toggleMapPanel() {
        const content = document.getElementById('mapPanelContent');
        const chevron = document.getElementById('mapPanelChevron');
        
        if (content && chevron) {
            const isHidden = content.style.display === 'none';
            
            if (isHidden) {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
                localStorage.setItem('mapPanelCollapsed', 'false');
                // При разворачивании карты обновляем размер и зум
                setTimeout(() => {
                    if (this.map) {
                        this.map.invalidateSize();
                        // Восстанавливаем правильный зум на полигон области
                        if (this.areaPolygonLayer) {
                            this.map.fitBounds(this.areaPolygonLayer.getBounds());
                        }
                    }
                }, 100);
            } else {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
                localStorage.setItem('mapPanelCollapsed', 'true');
            }
        }
    }

    /**
     * Переключение панели управления дублями
     */
    toggleDuplicatesPanel() {
        const content = document.getElementById('duplicatesPanelContent');
        const chevron = document.getElementById('duplicatesPanelChevron');
        
        if (content && chevron) {
            const isHidden = content.style.display === 'none';
            
            if (isHidden) {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
                localStorage.setItem('duplicatesPanelCollapsed', 'false');
            } else {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
                localStorage.setItem('duplicatesPanelCollapsed', 'true');
            }
        }
    }

    /**
     * Переключение панели сегментов
     */
    toggleSegmentsPanel() {
        const content = document.getElementById('segmentsPanelContent');
        const chevron = document.getElementById('segmentsPanelChevron');
        
        if (content && chevron) {
            const isHidden = content.style.display === 'none';
            
            if (isHidden) {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
                localStorage.setItem('segmentsPanelCollapsed', 'false');
            } else {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
                localStorage.setItem('segmentsPanelCollapsed', 'true');
            }
        }
    }

    /**
     * Переключение табов в панели работы с данными
     */
    switchDataWorkTab(tabId) {
        const navItems = document.querySelectorAll('.data-nav-item');
        const contentTabs = document.querySelectorAll('.data-content-tab');
        
        // Убираем активный класс со всех элементов навигации
        navItems.forEach(nav => {
            nav.classList.remove('bg-indigo-50', 'text-indigo-600');
            nav.classList.add('text-gray-700', 'hover:bg-gray-50', 'hover:text-indigo-600');
        });
        
        // Скрываем все табы контента
        contentTabs.forEach(tab => {
            tab.classList.add('hidden');
        });
        
        // Активируем нужную вкладку
        const activeNavItem = document.querySelector(`[data-tab="${tabId}"]`);
        const activeContentTab = document.getElementById(`content-${tabId}`);
        
        if (activeNavItem && activeContentTab) {
            // Активируем элемент навигации
            activeNavItem.classList.remove('text-gray-700', 'hover:bg-gray-50', 'hover:text-indigo-600');
            activeNavItem.classList.add('bg-indigo-50', 'text-indigo-600');
            
            // Показываем активный таб
            activeContentTab.classList.remove('hidden');
            
            // Сохраняем выбранный таб
            localStorage.setItem('dataWorkActiveTab', tabId);
        }
    }

    /**
     * Восстановление состояния панели работы с данными из localStorage
     */
    /**
     * Восстановление состояния панели статистики
     */
    restoreStatisticsPanelState() {
        const content = document.getElementById('statisticsPanelContent');
        const chevron = document.getElementById('statisticsPanelChevron');
        
        // Восстанавливаем состояние сворачивания панели (по умолчанию свернута)
        const isCollapsed = localStorage.getItem('statisticsPanelCollapsed');
        const shouldCollapse = isCollapsed === null || isCollapsed === 'true';
        
        if (content && chevron) {
            if (shouldCollapse) {
                content.classList.add('hidden');
                chevron.style.transform = 'rotate(-90deg)';
            } else {
                content.classList.remove('hidden');
                chevron.style.transform = 'rotate(0deg)';
                // Обновляем график если панель открыта
                setTimeout(() => {
                    this.updateSourcesChart();
                }, 100);
            }
        }
    }

    restoreDataWorkPanelState() {
        const content = document.getElementById('dataWorkPanelContent');
        const chevron = document.getElementById('dataWorkPanelChevron');
        
        // Восстанавливаем состояние сворачивания панели
        const isCollapsed = localStorage.getItem('dataWorkPanelCollapsed');
        const shouldCollapse = isCollapsed === null || isCollapsed === 'true';
        
        if (content && chevron) {
            if (shouldCollapse) {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
            } else {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
            }
        }
        
        // Восстанавливаем активный таб
        const activeTab = localStorage.getItem('dataWorkActiveTab') || 'import-addresses';
        this.switchDataWorkTab(activeTab);
    }

    /**
     * Восстановление состояния панели карты области
     */
    restoreMapPanelState() {
        const content = document.getElementById('mapPanelContent');
        const chevron = document.getElementById('mapPanelChevron');
        
        // По умолчанию панель карты свернута
        const isCollapsed = localStorage.getItem('mapPanelCollapsed');
        const shouldCollapse = isCollapsed === null || isCollapsed === 'true';
        
        if (content && chevron) {
            if (shouldCollapse) {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
            } else {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
                // При разворачивании карты обновляем размер и зум
                setTimeout(() => {
                    if (this.map) {
                        this.map.invalidateSize();
                        // Восстанавливаем правильный зум на полигон области
                        if (this.areaPolygonLayer) {
                            this.map.fitBounds(this.areaPolygonLayer.getBounds());
                        }
                    }
                }, 100);
            }
        }
    }

    /**
     * Восстановление состояния панели управления дублями
     */
    restoreDuplicatesPanelState() {
        const content = document.getElementById('duplicatesPanelContent');
        const chevron = document.getElementById('duplicatesPanelChevron');
        
        // По умолчанию панель управления дублями свернута
        const isCollapsed = localStorage.getItem('duplicatesPanelCollapsed');
        const shouldCollapse = isCollapsed === null || isCollapsed === 'true';
        
        if (content && chevron) {
            if (shouldCollapse) {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
            } else {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    }

    /**
     * Очистка старых ключей localStorage панелей
     */
    cleanupOldPanelKeys() {
        console.log('🧹 Очистка старых ключей localStorage панелей...');
        
        const oldKeys = [
            'statisticsPanelCollapsed',
            'dataWorkPanelCollapsed', 
            'mapPanelCollapsed',
            'duplicatesPanelCollapsed',
            'segmentsPanelCollapsed',
            `segmentsPanelCollapsed_${this.currentAreaId}`
        ];
        
        oldKeys.forEach(key => {
            if (localStorage.getItem(key) !== null) {
                console.log(`🗑️ Удаляем старый ключ: ${key}`);
                localStorage.removeItem(key);
            }
        });
        
        console.log('✅ Очистка завершена');
    }

    /**
     * Логирование состояния всех панелей в localStorage
     */
    logAllPanelsState() {
        console.log('📋 Обзор состояния всех панелей в localStorage:');
        console.log('- ID области:', this.currentAreaId);
        
        const panels = [
            'statisticsPanel',
            'dataWorkPanel', 
            'mapPanel',
            'duplicatesPanel',
            'segmentsPanel'
        ];
        
        panels.forEach(panelName => {
            const collapsedKey = `${panelName}Collapsed`;
            const collapsedKeyWithId = `${panelName}Collapsed_${this.currentAreaId}`;
            const visibleKey = `${panelName}Visible`;
            
            const collapsedValue = localStorage.getItem(collapsedKey);
            const collapsedValueWithId = localStorage.getItem(collapsedKeyWithId);
            const visibleValue = localStorage.getItem(visibleKey);
            
            console.log(`- ${panelName}:`);
            console.log(`  - ${collapsedKey}: ${collapsedValue}`);
            console.log(`  - ${collapsedKeyWithId}: ${collapsedValueWithId}`);
            console.log(`  - ${visibleKey}: ${visibleValue}`);
        });
        
        console.log('🔍 Состояние DOM элементов панелей:');
        panels.forEach(panelName => {
            const contentId = `${panelName}Content`;
            const chevronId = `${panelName}Chevron`;
            
            const contentElement = document.getElementById(contentId);
            const chevronElement = document.getElementById(chevronId);
            
            console.log(`- ${panelName}:`);
            console.log(`  - content (${contentId}): ${contentElement ? contentElement.style.display : 'не найден'}`);
            console.log(`  - chevron (${chevronId}): ${chevronElement ? chevronElement.style.transform : 'не найден'}`);
        });
        
        console.log('🎛️ UIManager состояния панелей:');
        if (this.uiManager) {
            panels.forEach(panelName => {
                const uiManagerKey = `panel_${panelName}_${this.currentAreaId}`;
                const uiManagerValue = localStorage.getItem(uiManagerKey);
                const uiState = this.uiManager.uiState?.panels?.[panelName];
                
                console.log(`- ${panelName}:`);
                console.log(`  - UIManager ключ: ${uiManagerKey}`);
                console.log(`  - UIManager localStorage: ${uiManagerValue}`);
                console.log(`  - UIManager состояние:`, uiState);
            });
        } else {
            console.log('- UIManager не инициализирован');
        }
    }

    // Метод restoreSegmentsPanelState() удален - управление через UIManager

    /**
     * Переключение видимости dropdown меню панелей
     */
    togglePanelDropdown() {
        const dropdown = document.getElementById('panelDropdown');
        if (dropdown) {
            dropdown.classList.toggle('hidden');
        }
    }

    /**
     * Управление видимостью панелей через чек-боксы
     */
    togglePanelVisibility(panelType, isVisible) {
        const panelMapping = {
            'statistics': {
                container: 'statisticsPanelContainer',
                checkbox: 'statisticsPanel'
            },
            'dataWork': {
                container: 'dataWorkPanelContainer', 
                checkbox: 'dataWorkPanel'
            },
            'map': {
                container: 'mapPanelContainer',
                checkbox: 'mapPanel'
            },
            'addresses': {
                container: 'addressTableContainer',
                checkbox: 'addressesPanel'
            },
            'segments': {
                container: 'segmentsPanelContainer',
                checkbox: 'segmentsPanel'
            },
            'duplicates': {
                container: 'duplicatesPanelContainer',
                checkbox: 'duplicatesPanel'
            }
        };

        const panelConfig = panelMapping[panelType];
        if (!panelConfig) return;

        const container = document.getElementById(panelConfig.container);
        if (container) {
            if (isVisible) {
                container.classList.remove('hidden');
                container.style.display = 'block';
            } else {
                container.classList.add('hidden');
                container.style.display = 'none';
            }

            // Сохраняем состояние в localStorage
            localStorage.setItem(`panel_${panelType}_visible`, isVisible.toString());

            // Специальная обработка для карты - обновляем размер при показе
            if (panelType === 'map' && isVisible && this.map) {
                setTimeout(() => {
                    this.map.invalidateSize();
                    if (this.areaPolygonLayer) {
                        this.map.fitBounds(this.areaPolygonLayer.getBounds());
                    }
                }, 100);
            }

            // Обновляем графики при показе панели статистики
            if (panelType === 'statistics' && isVisible) {
                setTimeout(() => {
                    this.updateSourcesChart();
                    this.updateAddressAnalyticsCharts();
                }, 100);
            }
        }
    }

    /**
     * Восстановление состояния видимости панелей из localStorage
     */
    restorePanelVisibilityStates() {
        const panels = ['statistics', 'dataWork', 'map', 'addresses', 'segments', 'duplicates'];
        
        panels.forEach(panelType => {
            const isVisible = localStorage.getItem(`panel_${panelType}_visible`);
            // По умолчанию все панели видимы
            const shouldShow = isVisible === null || isVisible === 'true';
            
            const checkboxId = {
                'statistics': 'statisticsPanel',
                'dataWork': 'dataWorkPanel',
                'map': 'mapPanel',
                'addresses': 'addressesPanel',
                'segments': 'segmentsPanel',
                'duplicates': 'duplicatesPanel'
            }[panelType];

            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                checkbox.checked = shouldShow;
                this.togglePanelVisibility(panelType, shouldShow);
            }
        });
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
     * Инициализация SlimSelect для статуса обработки
     */
    async initProcessingStatusFilter() {
        try {
            const selectElement = document.getElementById('processingStatusFilter');
            if (!selectElement) {
                console.warn('Элемент processingStatusFilter не найден');
                return;
            }

            // Инициализируем SlimSelect
            this.processingStatusSlimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    placeholderText: 'Выберите статус',
                    allowDeselect: true,
                    closeOnSelect: true
                },
                events: {
                    afterChange: (newVal) => {
                        this.onProcessingStatusFilterChange(newVal);
                    }
                }
            });

            console.log('📋 Фильтр статуса обработки инициализирован');
            
        } catch (error) {
            console.error('Ошибка при инициализации фильтра статуса обработки:', error);
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
            console.log('🔄 Processing status filter changed:', newVal);
            
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
            info: 'bg-blue-100 border-blue-500 text-blue-700',
            warning: 'bg-yellow-100 border-yellow-500 text-yellow-700'
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


    /**
     * Показать детали объявления в модальном окне
     */
    async showListingDetails(listingId) {
        try {
            // Сначала ищем в this.listings
            let listing = this.listings.find(l => l.id === listingId);
            
            // Если не найдено, ищем в базе данных
            if (!listing) {
                console.log('Объявление не найдено в this.listings, ищем в базе данных:', listingId);
                const allListings = await db.getListings();
                listing = allListings.find(l => l.id === listingId);
            }
            
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                this.showError('Объявление не найдено');
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
                    locationHeader.addEventListener('click', async () => {
                        await this.toggleLocationPanel(listingId);
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
                
                // Добавляем обработчик для кнопки "Верный адрес" в модальном окне
                const correctAddressModalButton = document.getElementById(`correctAddressModal_${listingId}`);
                console.log('🔍 Modal button search:', {
                    listingId: listingId,
                    buttonId: `correctAddressModal_${listingId}`,
                    buttonFound: !!correctAddressModalButton
                });
                
                if (correctAddressModalButton) {
                    console.log('✅ Adding click handler to modal button');
                    correctAddressModalButton.addEventListener('click', () => {
                        console.log('🔘 Modal button clicked for listing:', listingId);
                        this.markSingleAddressAsCorrect(listingId);
                    });
                } else {
                    console.log('❌ Modal button not found');
                }
                
                // Добавляем обработчик для кнопки "Неверный адрес" в модальном окне
                const incorrectAddressModalButton = document.getElementById(`incorrectAddressModal_${listingId}`);
                console.log('🔍 Incorrect modal button search:', {
                    listingId: listingId,
                    buttonId: `incorrectAddressModal_${listingId}`,
                    buttonFound: !!incorrectAddressModalButton
                });
                
                if (incorrectAddressModalButton) {
                    console.log('✅ Adding click handler to incorrect modal button');
                    incorrectAddressModalButton.addEventListener('click', () => {
                        console.log('🔘 Incorrect modal button clicked for listing:', listingId);
                        this.markSingleAddressAsIncorrect(listingId);
                    });
                } else {
                    console.log('❌ Incorrect modal button not found');
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
                
                // Добавляем обработчик для сохранения истории цен
                const savePriceHistoryButton = document.getElementById(`savePriceHistory-${listingId}`);
                if (savePriceHistoryButton) {
                    savePriceHistoryButton.addEventListener('click', () => {
                        this.savePriceHistory(listingId);
                    });
                }
                
                // Инициализируем модальное окно редактирования цены
                this.initializePriceEditModal(listingId);
                
                // Инициализируем панель управления
                this.initializeManagementPanel(listingId);
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
                        <div class="mt-4 mb-4 flex items-center justify-between">
                            <button id="addPriceEntry-${listing.id}" class="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                Добавить изменение цены
                            </button>
                            <button id="savePriceHistory-${listing.id}" class="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                💾 Сохранить историю цен
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
            
            <!-- Панель управления объявлением -->
            <div class="mb-6">
                <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div class="px-4 py-3 border-b border-gray-200">
                        <h4 class="text-lg font-medium text-gray-900">Управление</h4>
                    </div>
                    <div class="px-4 py-4">
                        <div class="flex items-center justify-between">
                            <!-- Левая сторона: Статус и актуализация -->
                            <div class="flex items-center space-x-6">
                                <!-- Переключатель статуса -->
                                <div class="flex items-center">
                                    <label class="text-sm font-medium text-gray-700 mr-3">Статус:</label>
                                    <select id="statusSelect-${listing.id}" class="form-select">
                                        <option value="active" ${listing.status === 'active' ? 'selected' : ''}>Активное</option>
                                        <option value="archived" ${listing.status === 'archived' ? 'selected' : ''}>Архив</option>
                                    </select>
                                </div>
                                
                                <!-- Кнопка актуализации -->
                                <button id="actualizeBtn-${listing.id}" 
                                        class="px-4 py-2 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
                                    🔄 Актуализировать
                                </button>
                            </div>
                            
                            <!-- Правая сторона: Удаление -->
                            <div class="flex items-center space-x-4">
                                <!-- Дата последнего обновления -->
                                <div class="flex items-center">
                                    <span class="text-sm text-gray-500">Последнее обновление:</span>
                                    <span id="lastUpdated-${listing.id}" class="ml-2 text-sm text-gray-900">
                                        ${listing.updated ? new Date(listing.updated).toLocaleDateString('ru-RU', {
                                            year: 'numeric', 
                                            month: 'short', 
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        }) : 'Не указано'}
                                    </span>
                                </div>
                                
                                <!-- Кнопка удаления -->
                                <button id="deleteBtn-${listing.id}" 
                                        class="px-4 py-2 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors">
                                    🗑️ Удалить
                                </button>
                            </div>
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
                            <dt class="text-sm font-medium text-gray-500">Дата создания</dt>
                            <dd class="text-sm text-gray-900">${this.formatDate(listing.created)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">External ID</dt>
                            <dd class="text-sm text-gray-900">${listing.external_id || '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Дата обновления</dt>
                            <dd class="text-sm text-gray-900">${this.formatDate(listing.updated)}</dd>
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
     * Закрыть модальное окно объявления
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
     * Закрыть модальное окно объекта недвижимости
     */
    closeObjectModal() {
        // Уничтожаем Fotorama перед закрытием модального окна
        const galleries = document.querySelectorAll('.fotorama');
        galleries.forEach(gallery => {
            if (window.$ && $.fn.fotorama) {
                $(gallery).fotorama().data('fotorama')?.destroy();
            }
        });
        
        document.getElementById('objectModal').classList.add('hidden');
        this.currentObject = null;
        this.currentObjectListings = null;
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

        // Добавляем конечную точку с правильной датой в зависимости от статуса
        if (listing.price) {
            let endPriceDate;
            
            if (listing.status === 'active') {
                // Для активных объявлений - текущая дата
                endPriceDate = new Date();
            } else {
                // Для архивных объявлений - дата последнего обновления
                endPriceDate = new Date(listing.updated || listing.created || Date.now());
            }
            
            // Добавляем конечную точку только если она отличается от уже существующих
            const lastHistoryDate = history.length > 0 ? history[history.length - 1].date : 0;
            if (Math.abs(endPriceDate.getTime() - lastHistoryDate) > 24 * 60 * 60 * 1000) {
                history.push({
                    date: endPriceDate.getTime(),
                    price: parseInt(listing.price)
                });
            }
        }

        // Сортируем по дате
        history.sort((a, b) => a.date - b.date);
        
        // Убираем дубликаты цен подряд, но оставляем ключевые точки
        const filtered = [];
        for (let i = 0; i < history.length; i++) {
            if (i === 0 || i === history.length - 1 || history[i].price !== history[i-1].price) {
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

            // Добавляем слой адресов из области
            this.addAddressLayerToListingMap(listingMap, coords, listing.id);

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
     * Добавляет слой адресов из области на карту объявления
     */
    async addAddressLayerToListingMap(listingMap, centerCoords, listingId) {
        try {
            // Получаем адреса из области
            const addresses = await this.getAddressesInArea();
            
            if (!Array.isArray(addresses) || addresses.length === 0) {
                return;
            }

            // Определяем радиус для отображения близлежащих адресов (в метрах)
            const radiusMeters = 500;
            
            // Фильтруем адреса по расстоянию
            const nearbyAddresses = addresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                const addressCoords = {
                    lat: parseFloat(address.coordinates.lat),
                    lng: parseFloat(address.coordinates.lng)
                };
                
                const distance = this.calculateDistance(centerCoords, addressCoords);
                return distance <= radiusMeters;
            });

            console.log(`🗺️ Найдено ${nearbyAddresses.length} адресов в радиусе ${radiusMeters}м от объявления`);

            // Создаем маркеры для близлежащих адресов
            for (const address of nearbyAddresses) {
                try {
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
                        markerHeight = 8;
                    } else if (floorCount > 5 && floorCount <= 10) {
                        markerHeight = 12;
                    } else if (floorCount > 10 && floorCount <= 20) {
                        markerHeight = 16;
                    } else if (floorCount > 20) {
                        markerHeight = 20;
                    } else {
                        markerHeight = 8; // По умолчанию для адресов без указанной этажности
                    }

                    // Создаем маркер адреса
                    const addressMarker = L.marker([address.coordinates.lat, address.coordinates.lng], {
                        icon: L.divIcon({
                            className: 'address-marker',
                            html: `
                                <div class="leaflet-marker-icon-wrapper" style="position: relative;">
                                    <div style="
                                        width: 0; 
                                        height: 0; 
                                        border-left: 6px solid transparent; 
                                        border-right: 6px solid transparent; 
                                        border-top: ${markerHeight}px solid ${markerColor};
                                        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
                                        opacity: 0.7;
                                    "></div>
                                    ${address.build_year ? `<span class="leaflet-marker-iconlabel" style="
                                        position: absolute; 
                                        left: 12px; 
                                        top: 0px; 
                                        font-size: 9px; 
                                        font-weight: 500; 
                                        color: #374151; 
                                        background: rgba(255,255,255,0.8); 
                                        padding: 1px 3px; 
                                        border-radius: 2px; 
                                        white-space: nowrap;
                                        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                                    ">${address.build_year}</span>` : ''}
                                </div>
                            `,
                            iconSize: [12, markerHeight],
                            iconAnchor: [6, markerHeight]
                        })
                    }).addTo(listingMap);

                    // Добавляем popup с информацией об адресе
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

                    // Вычисляем расстояние до объявления
                    const distance = this.calculateDistance(centerCoords, {
                        lat: parseFloat(address.coordinates.lat),
                        lng: parseFloat(address.coordinates.lng)
                    });
                    
                    addressMarker.bindPopup(`
                        <div class="address-popup" style="min-width: 200px;">
                            <div class="header">
                                <strong>📍 Адрес</strong><br>
                                <div class="address-title" style="font-size: 13px;">${address.address || 'Не указан'}</div>
                            </div>
                            
                            <div class="meta" style="margin-top: 6px;">
                                <small>Тип: <strong>${typeText}</strong></small><br>
                                <small>Расстояние: <strong>${Math.round(distance)}м</strong></small>
                                ${address.floors_count ? `<br><small>Этажей: ${address.floors_count}</small>` : ''}
                                <br><small>Материал: <strong>${wallMaterialText}</strong></small>
                                ${address.build_year ? `<br><small>Год постройки: ${address.build_year}</small>` : ''}
                            </div>
                            
                            <div class="actions" style="margin-top: 12px;">
                                <button class="select-address-btn" 
                                        data-address-id="${address.id}" 
                                        data-address-name="${this.escapeHtml(address.address || 'Не указан')}"
                                        style="width: 100%; padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;">
                                    ✓ Выбрать этот адрес
                                </button>
                            </div>
                        </div>
                    `, {
                        maxWidth: 250,
                        className: 'address-popup-container'
                    });

                } catch (markerError) {
                    console.error(`Ошибка создания маркера для адреса ${address.id}:`, markerError);
                }
            }

            // Добавляем обработчики событий для кнопок выбора адреса
            setTimeout(() => {
                this.attachAddressSelectionHandlers(listingId);
            }, 100);

        } catch (error) {
            console.error('Ошибка добавления слоя адресов на карту объявления:', error);
        }
    }

    /**
     * Добавляет обработчики событий для кнопок выбора адреса в popup-ах карты
     */
    attachAddressSelectionHandlers(listingId) {
        // Используем делегирование событий для избежания CSP ошибок
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('select-address-btn')) {
                const addressId = event.target.getAttribute('data-address-id');
                const addressName = event.target.getAttribute('data-address-name');
                
                console.log(`🎯 Выбран адрес ${addressId}: ${addressName}`);
                
                // Устанавливаем значение в выпадающий список
                this.setAddressInSelector(listingId, addressId, addressName);
                
                // Закрываем popup
                const popup = event.target.closest('.leaflet-popup');
                if (popup) {
                    popup.style.display = 'none';
                }
            }
        });

        // Добавляем CSS стили для hover эффекта
        const style = document.createElement('style');
        style.textContent = `
            .select-address-btn:hover {
                background-color: #2563eb !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Устанавливает выбранный адрес в выпадающий список
     */
    setAddressInSelector(listingId, addressId, addressName) {
        try {
            // Получаем элемент select
            const selectElement = document.getElementById(`addressSelect_${listingId}`);
            if (!selectElement) {
                console.error('Элемент select не найден:', `addressSelect_${listingId}`);
                return;
            }

            // Устанавливаем значение в обычном select
            selectElement.value = addressId;

            // Если есть экземпляр SlimSelect, обновляем его
            const slimSelectInstance = this[`addressSlimSelect_${listingId}`];
            if (slimSelectInstance) {
                try {
                    // Используем правильный метод для установки значения в SlimSelect
                    slimSelectInstance.setSelected(addressId);
                    console.log(`📍 Адрес установлен в SlimSelect: ${addressName}`);
                } catch (slimError) {
                    console.warn('Ошибка установки в SlimSelect, используем обычный select:', slimError);
                    // Fallback на обычный select
                    selectElement.value = addressId;
                    selectElement.dispatchEvent(new Event('change'));
                    console.log(`📍 Адрес установлен в обычном select: ${addressName}`);
                }
            } else {
                console.log(`📍 Адрес установлен в обычном select: ${addressName}`);
            }

            // Показываем уведомление пользователю
            this.showNotification(`Адрес "${addressName}" выбран. Нажмите "Сохранить" для применения.`, 'success');

        } catch (error) {
            console.error('Ошибка установки адреса в селектор:', error);
            this.showNotification('Ошибка при выборе адреса', 'error');
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
                order: [[0, 'asc']], // Сортировка по дате (по возрастанию)
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
                            } else if (type === 'sort' || type === 'type') {
                                // Возвращаем timestamp для правильной сортировки
                                return new Date(data).getTime();
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

        // Добавляем только историю изменений цен (без текущей цены)
        if (listing.price_history && Array.isArray(listing.price_history)) {
            listing.price_history.forEach(historyItem => {
                // Поддерживаем разные форматы: new_price (Avito) и price (Inpars)
                const price = historyItem.new_price || historyItem.price;
                if (historyItem.date && price) {
                    data.push({
                        date: historyItem.date,
                        price: price,
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


            // Удаляем из истории цен по индексу
            if (listing.price_history && Array.isArray(listing.price_history)) {
                // Индекс соответствует позиции в массиве price_history
                if (index >= 0 && index < listing.price_history.length) {
                    listing.price_history.splice(index, 1);
                }
                
                // Обновляем текущую цену на последнюю из истории
                if (listing.price_history.length > 0) {
                    // Сортируем по дате
                    listing.price_history.sort((a, b) => new Date(a.date) - new Date(b.date));
                    const latestPrice = listing.price_history[listing.price_history.length - 1];
                    listing.price = latestPrice.price || latestPrice.new_price;
                    
                    // Пересчитываем цену за м2
                    if (listing.area_total && listing.area_total > 0) {
                        listing.price_per_meter = Math.round(listing.price / listing.area_total);
                    }
                }
            }

            // Сохраняем в БД
            await db.updateListing(listing);

            // Обновляем связанный объект недвижимости, если объявление входит в объект
            if (listing.object_id) {
                const oldListing = { ...listing, price_history: [] }; // Создаем версию без истории для сравнения
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, oldListing, listing);
                console.log(`🏠 Обновлен объект ${listing.object_id} после удаления записи истории цен объявления ${listingId}`);
            }

            // Обновляем таблицу
            this.refreshPriceHistoryTable(listingId, listing);
            
            // Обновляем график цены
            this.renderPriceChart(listing);
            
            // Пересобираем таблицу дублей
            await this.loadDuplicatesTable();

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

            // Обновляем связанный объект недвижимости, если объявление входит в объект
            if (listing.object_id) {
                const oldListing = { ...listing, price_history: [] }; // Создаем версию без истории для сравнения
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, oldListing, listing);
                console.log(`🏠 Обновлен объект ${listing.object_id} после сохранения записи истории цен объявления ${listingId}`);
            }

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
    async toggleLocationPanel(listingId) {
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
                setTimeout(async () => {
                    // Сначала ищем в this.listings
                    let listing = this.listings.find(l => l.id === listingId);
                    
                    // Если не найдено, ищем в базе данных
                    if (!listing) {
                        console.log('Объявление не найдено в this.listings для карты, ищем в базе данных:', listingId);
                        const allListings = await db.getListings();
                        listing = allListings.find(l => l.id === listingId);
                    }
                    
                    if (listing) {
                        this.renderListingMap(listing);
                    } else {
                        console.warn('Объявление не найдено для отображения карты:', listingId);
                        mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Объявление не найдено для отображения карты</div>';
                    }
                }, 100);
            }
        } else {
            // Сворачиваем
            content.style.display = 'none';
            chevron.style.transform = 'rotate(-90deg)';
        }
    }

    /**
     * Удаление объявлений из области через таб "Удаление данных"
     */
    async deleteDataFromTab() {
        try {
            // Проверяем что область существует
            if (!this.currentArea || !this.currentAreaId) {
                this.showError('Область не загружена');
                return;
            }

            // Показываем прогресс-бар
            this.showProgressBar('delete-data');
            this.updateProgressBar('delete-data', 10, 'Загрузка данных...');

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

            this.updateProgressBar('delete-data', 30, 'Подготовка к удалению...');

            if (listingsInArea.length === 0) {
                this.hideProgressBar('delete-data');
                this.showInfo('В области нет объявлений для удаления');
                return;
            }

            // Показываем диалог подтверждения
            const confirmed = confirm(
                `Вы действительно хотите удалить ${listingsInArea.length} объявлений из области "${this.currentArea.name}"?\n\n` +
                `Это действие нельзя отменить.`
            );

            if (!confirmed) {
                this.hideProgressBar('delete-data');
                return;
            }

            this.updateProgressBar('delete-data', 50, 'Удаление объявлений...');

            // Удаляем объявления
            let deletedCount = 0;
            let errorCount = 0;
            const totalCount = listingsInArea.length;

            for (let i = 0; i < listingsInArea.length; i++) {
                const listing = listingsInArea[i];
                try {
                    await db.delete('listings', listing.id);
                    deletedCount++;
                    
                    // Обновляем прогресс
                    const progress = 50 + (i + 1) / totalCount * 40; // от 50% до 90%
                    this.updateProgressBar('delete-data', progress, `Удалено ${deletedCount} из ${totalCount}`);
                    
                } catch (error) {
                    console.error(`Ошибка удаления объявления ${listing.id}:`, error);
                    errorCount++;
                }
            }

            this.updateProgressBar('delete-data', 95, 'Обновление интерфейса...');

            // Обновляем карту и таблицы
            await this.loadMapData();
            if (this.duplicatesTable) {
                await this.loadDuplicatesTable();
            }

            this.updateProgressBar('delete-data', 100, 'Удаление завершено');

            // Показываем результат
            if (errorCount === 0) {
                this.showSuccess(`Успешно удалено ${deletedCount} объявлений из области`);
            } else {
                this.showWarning(`Удалено ${deletedCount} объявлений, ошибок: ${errorCount}`);
            }

            console.log(`🗑️ Удалено объявлений: ${deletedCount}, ошибок: ${errorCount}`);

            // Скрываем прогресс-бар через 2 секунды
            setTimeout(() => {
                this.hideProgressBar('delete-data');
            }, 2000);

        } catch (error) {
            console.error('Ошибка удаления объявлений:', error);
            this.hideProgressBar('delete-data');
            this.showError(`Ошибка удаления объявлений: ${error.message}`);
        }
    }

    /**
     * Обновление графика источников объявлений
     */
    async updateSourcesChart() {
        try {
            // Получаем все объявления
            const allListings = await db.getListings();
            
            // Фильтруем только объявления в текущей области
            const listings = await this.getListingsInArea();
            
            console.log(`📊 Обновление графика источников: ${listings.length} объявлений в области`);
            
            if (listings.length === 0) {
                // Если нет объявлений в области, очищаем график
                this.renderSourcesChart([], []);
                this.updateSourcesTable([]);
                return;
            }
            
            // Подсчитываем объявления по источникам
            const sourceCounts = {};
            const sourceNames = {
                'avito.ru': 'Avito',
                'avito': 'Avito',
                'cian.ru': 'Cian',
                'cian': 'Cian',
                'yandex.ru': 'Яндекс.Недвижимость',
                'yandex': 'Яндекс.Недвижимость',
                'domclick.ru': 'Domclick',
                'domclick': 'Domclick',
                'inpars': 'Inpars (агрегатор)',
                'manual': 'Вручную',
                'unknown': 'Неизвестно'
            };

            listings.forEach((listing, index) => {
                // Определяем источник с приоритетом оригинального источника
                let displaySource = 'unknown';
                
                
                if (listing.source_metadata && listing.source_metadata.original_source) {
                    displaySource = listing.source_metadata.original_source;
                } else if (listing.source) {
                    displaySource = listing.source;
                }
                
                
                // Группируем однотипные источники
                if (displaySource.includes('avito')) {
                    displaySource = 'avito';
                } else if (displaySource.includes('cian')) {
                    displaySource = 'cian';
                } else if (displaySource.includes('yandex')) {
                    displaySource = 'yandex';
                } else if (displaySource.includes('domclick')) {
                    displaySource = 'domclick';
                }
                
                sourceCounts[displaySource] = (sourceCounts[displaySource] || 0) + 1;
            });

            // Подготавливаем данные для графика
            const chartData = [];
            const tableData = [];
            const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
            
            let colorIndex = 0;
            const totalListings = listings.length;
            
            console.log('📈 Подсчет источников:', sourceCounts);
            
            // Сортируем источники по количеству объявлений (убывание)
            const sortedSources = Object.entries(sourceCounts)
                .sort(([,a], [,b]) => b - a);
            
            sortedSources.forEach(([source, count]) => {
                const displayName = sourceNames[source] || source;
                const percentage = totalListings > 0 ? ((count / totalListings) * 100).toFixed(1) : 0;
                
                chartData.push({
                    name: displayName,
                    data: count
                });
                
                tableData.push({
                    source: displayName,
                    count: count,
                    percentage: percentage,
                    color: colors[colorIndex % colors.length]
                });
                
                colorIndex++;
            });

            // Создаем/обновляем график
            this.renderSourcesChart(chartData, colors);
            
            // Обновляем таблицу
            this.updateSourcesTable(tableData);
            
        } catch (error) {
            console.error('Ошибка обновления графика источников:', error);
        }
    }

    /**
     * Отрисовка графика источников
     */
    renderSourcesChart(data, colors) {
        const chartElement = document.getElementById('sourcesChart');
        if (!chartElement) return;

        // Если график уже существует, уничтожаем его
        if (this.sourcesChartInstance) {
            this.sourcesChartInstance.destroy();
        }

        if (data.length === 0) {
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
            return;
        }

        const options = {
            series: data.map(item => item.data),
            chart: {
                type: 'pie',
                height: 320,
                toolbar: {
                    show: false
                }
            },
            labels: data.map(item => item.name),
            colors: colors,
            legend: {
                position: 'bottom',
                horizontalAlign: 'center'
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '45%'
                    }
                }
            },
            dataLabels: {
                enabled: true,
                formatter: function(val, opts) {
                    return Math.round(val) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + ' объявлений';
                    }
                }
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

        try {
            this.sourcesChartInstance = new ApexCharts(chartElement, options);
            this.sourcesChartInstance.render().catch(error => {
                console.error('Ошибка рендеринга графика источников:', error);
                chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки графика источников</div>';
            });
        } catch (error) {
            console.error('Ошибка создания графика источников:', error);
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка создания графика источников</div>';
        }
    }

    /**
     * Обновление таблицы источников
     */
    updateSourcesTable(data) {
        const tableElement = document.getElementById('sourcesTable');
        if (!tableElement) return;

        if (data.length === 0) {
            tableElement.innerHTML = '<div class="text-sm text-gray-500">Нет данных</div>';
            return;
        }

        const tableHTML = data.map(item => `
            <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                <div class="flex items-center">
                    <div class="w-3 h-3 rounded-full mr-3" style="background-color: ${item.color}"></div>
                    <span class="text-sm font-medium text-gray-900">${item.source}</span>
                </div>
                <div class="text-right">
                    <div class="text-sm font-semibold text-gray-900">${item.count}</div>
                    <div class="text-xs text-gray-500">${item.percentage}%</div>
                </div>
            </div>
        `).join('');

        tableElement.innerHTML = tableHTML;
    }

    /**
     * Обновление графиков аналитики определения адресов
     */
    async updateAddressAnalyticsCharts() {
        try {
            // Получаем объявления в области
            const listings = await this.getListingsInArea();
            
            console.log(`📍 Анализ определения адресов: ${listings.length} объявлений в области`);
            
            if (listings.length === 0) {
                // Если нет объявлений, очищаем все графики
                this.renderAddressConfidenceChart([]);
                this.renderAddressMethodsChart([]);
                this.updateAddressStatsTable({});
                return;
            }
            
            // Анализируем данные по определению адресов
            const analytics = this.analyzeAddressDetectionData(listings);
            
            // Обновляем все графики с задержками для избежания конфликтов
            this.renderAddressConfidenceChart(analytics.confidenceData);
            
            setTimeout(() => {
                this.renderAddressMethodsChart(analytics.methodsData);
            }, 200);
            
            this.updateAddressStatsTable(analytics.stats);
            
        } catch (error) {
            console.error('Ошибка обновления графиков определения адресов:', error);
        }
    }

    /**
     * Анализ данных по определению адресов
     */
    analyzeAddressDetectionData(listings) {
        const stats = {
            total: listings.length,
            withAddresses: 0,
            withoutAddresses: 0,
            high: 0,
            medium: 0,
            low: 0,
            veryLow: 0,
            manual: 0,
            noMatch: 0
        };
        
        const confidenceCounts = {};
        const methodCounts = {};
        
        listings.forEach(listing => {
            if (listing.address_id) {
                stats.withAddresses++;
                
                const confidence = listing.address_match_confidence || 'unknown';
                const method = listing.address_match_method || 'unknown';
                
                // Подсчет по уровням точности
                switch (confidence) {
                    case 'high':
                        stats.high++;
                        break;
                    case 'medium':
                        stats.medium++;
                        break;
                    case 'low':
                        stats.low++;
                        break;
                    case 'very_low':
                        stats.veryLow++;
                        break;
                    case 'manual':
                        stats.manual++;
                        break;
                    default:
                        stats.noMatch++;
                }
                
                // Подсчет по методам
                methodCounts[method] = (methodCounts[method] || 0) + 1;
                confidenceCounts[confidence] = (confidenceCounts[confidence] || 0) + 1;
            } else {
                stats.withoutAddresses++;
                stats.noMatch++;
                confidenceCounts['no_address'] = (confidenceCounts['no_address'] || 0) + 1;
            }
        });
        
        // Подготовка данных для графиков
        const confidenceData = this.prepareConfidenceChartData(confidenceCounts, stats.total);
        const methodsData = this.prepareMethodsChartData(methodCounts);
        
        return {
            stats,
            confidenceData,
            methodsData
        };
    }

    /**
     * Подготовка данных для графика точности
     */
    prepareConfidenceChartData(counts, total) {
        const labels = {
            'high': 'Высокая',
            'medium': 'Средняя', 
            'low': 'Низкая',
            'very_low': 'Очень низкая',
            'manual': 'Вручную',
            'no_address': 'Не определен'
        };
        
        const colors = {
            'high': '#10b981',
            'medium': '#f59e0b',
            'low': '#ef4444',
            'very_low': '#dc2626',
            'manual': '#8b5cf6',
            'no_address': '#6b7280'
        };
        
        return Object.entries(counts).map(([confidence, count]) => ({
            name: labels[confidence] || confidence,
            value: count,
            percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0,
            color: colors[confidence] || '#6b7280'
        })).sort((a, b) => b.value - a.value);
    }

    /**
     * Подготовка данных для графика методов
     */
    prepareMethodsChartData(counts) {
        const labels = {
            'exact_geo': 'Точное совпадение',
            'near_geo_text': 'Близкое + текст',
            'extended_geo_text': 'Расширенный поиск',
            'global_text': 'Текстовый поиск',
            'manual_selection': 'Ручной выбор',
            'unknown': 'Неизвестно'
        };
        
        return Object.entries(counts).map(([method, count]) => ({
            name: labels[method] || method,
            value: count
        })).sort((a, b) => b.value - a.value);
    }


    /**
     * Отрисовка графика точности определения
     */
    renderAddressConfidenceChart(data) {
        const chartElement = document.getElementById('addressConfidenceChart');
        if (!chartElement) return;

        if (this.addressConfidenceChartInstance) {
            this.addressConfidenceChartInstance.destroy();
        }

        if (data.length === 0) {
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных</div>';
            return;
        }

        const options = {
            series: data.map(item => item.value),
            chart: {
                type: 'pie',
                height: 250
            },
            labels: data.map(item => item.name),
            colors: data.map(item => item.color),
            legend: {
                position: 'bottom',
                fontSize: '12px'
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) {
                    return Math.round(val) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + ' объявлений';
                    }
                }
            }
        };

        this.addressConfidenceChartInstance = new ApexCharts(chartElement, options);
        this.addressConfidenceChartInstance.render();
    }

    /**
     * Отрисовка графика методов определения
     */
    renderAddressMethodsChart(data) {
        const chartElement = document.getElementById('addressMethodsChart');
        if (!chartElement) return;

        if (this.addressMethodsChartInstance) {
            this.addressMethodsChartInstance.destroy();
        }

        if (data.length === 0) {
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных</div>';
            return;
        }

        const options = {
            series: [{
                data: data.map(item => item.value)
            }],
            chart: {
                type: 'bar',
                height: 250,
                horizontal: true
            },
            xaxis: {
                categories: data.map(item => item.name)
            },
            colors: ['#0ea5e9'],
            dataLabels: {
                enabled: false
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + ' объявлений';
                    }
                }
            }
        };

        this.addressMethodsChartInstance = new ApexCharts(chartElement, options);
        this.addressMethodsChartInstance.render();
    }


    /**
     * Обновление таблицы статистики адресов
     */
    updateAddressStatsTable(stats) {
        const tableElement = document.getElementById('addressStatsTable');
        if (!tableElement) return;

        if (!stats || stats.total === 0) {
            tableElement.innerHTML = '<div class="text-sm text-gray-500">Нет данных</div>';
            return;
        }

        const tableHTML = `
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Всего объявлений:</span>
                    <span class="font-semibold text-gray-900">${stats.total}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">С адресами:</span>
                    <span class="font-semibold text-green-600">${stats.withAddresses}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Без адресов:</span>
                    <span class="font-semibold text-red-600">${stats.withoutAddresses}</span>
                </div>
                <hr class="border-gray-200">
                <div class="flex justify-between text-sm">
                    <span class="text-green-600">Высокая точность:</span>
                    <span class="font-semibold">${stats.high}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-yellow-600">Средняя точность:</span>
                    <span class="font-semibold">${stats.medium}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-red-600">Низкая точность:</span>
                    <span class="font-semibold">${stats.low + stats.veryLow}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-purple-600">Вручную:</span>
                    <span class="font-semibold">${stats.manual}</span>
                </div>
            </div>
        `;

        tableElement.innerHTML = tableHTML;
    }

    /**
     * Обновление статистики обработки дублей
     */
    async updateDuplicatesStats() {
        try {
            console.log('📊 Обновление статистики дублей...');

            // Получаем все объявления в области
            const allListings = await db.getAll('listings');
            const listingsInArea = allListings.filter(listing => {
                if (!listing.coordinates || !listing.coordinates.lat || !(listing.coordinates.lng || listing.coordinates.lon)) {
                    return false;
                }
                
                const lat = listing.coordinates.lat;
                const lng = listing.coordinates.lng || listing.coordinates.lon;
                
                return this.currentArea && this.currentArea.containsPoint(lat, lng);
            });

            // Считаем статистику по статусам обработки
            const stats = {
                needProcessing: 0,
                processed: 0,
                merged: 0,
                total: listingsInArea.length
            };

            const statusCounts = {};

            listingsInArea.forEach(listing => {
                const status = listing.processing_status || 'unknown';
                statusCounts[status] = (statusCounts[status] || 0) + 1;

                if (status === 'duplicate_check_needed') {
                    stats.needProcessing++;
                } else if (status === 'processed') {
                    stats.processed++;
                }
            });

            // Подсчитываем объединенные объявления (сколько объявлений стало объектами)
            try {
                const realEstateObjects = await db.getAll('objects');
                const objectsInArea = realEstateObjects.filter(obj => {
                    if (!obj.coordinates || !obj.coordinates.lat || !(obj.coordinates.lng || obj.coordinates.lon)) {
                        return false;
                    }
                    
                    const lat = obj.coordinates.lat;
                    const lng = obj.coordinates.lng || obj.coordinates.lon;
                    
                    return this.currentArea && this.currentArea.containsPoint(lat, lng);
                });

                // Считаем сколько объявлений было объединено в объекты
                stats.merged = objectsInArea.reduce((total, obj) => {
                    return total + (obj.listing_ids ? obj.listing_ids.length : 0);
                }, 0);
            } catch (error) {
                console.warn('Таблица objects не найдена, пропускаем подсчет объединенных объявлений:', error);
                stats.merged = 0;
            }

            // Рассчитываем эффективность
            const efficiency = stats.total > 0 ? Math.round(((stats.processed + stats.merged) / stats.total) * 100) : 0;

            // Обновляем счетчики
            this.updateDuplicatesCounters(stats, efficiency);

            // Обновляем график статусов
            this.updateDuplicatesStatusChart(statusCounts);

            // Обновляем статистику точности объединения
            this.updateDuplicatesAccuracyStats();

        } catch (error) {
            console.error('Ошибка обновления статистики дублей:', error);
        }
    }

    /**
     * Обновление счетчиков статистики дублей
     */
    updateDuplicatesCounters(stats, efficiency) {
        const elements = {
            duplicatesNeedProcessing: document.getElementById('duplicatesNeedProcessing'),
            duplicatesProcessed: document.getElementById('duplicatesProcessed'),
            duplicatesMerged: document.getElementById('duplicatesMerged'),
            duplicatesEfficiency: document.getElementById('duplicatesEfficiency')
        };

        if (elements.duplicatesNeedProcessing) {
            elements.duplicatesNeedProcessing.textContent = stats.needProcessing.toLocaleString();
        }
        
        if (elements.duplicatesProcessed) {
            elements.duplicatesProcessed.textContent = stats.processed.toLocaleString();
        }
        
        if (elements.duplicatesMerged) {
            elements.duplicatesMerged.textContent = stats.merged.toLocaleString();
        }
        
        if (elements.duplicatesEfficiency) {
            elements.duplicatesEfficiency.textContent = `${efficiency}%`;
        }
    }

    /**
     * Обновление графика статусов обработки дублей
     */
    updateDuplicatesStatusChart(statusCounts) {
        const chartElement = document.getElementById('duplicatesStatusChart');
        if (!chartElement) return;

        // Если график уже существует, уничтожаем его
        if (this.duplicatesStatusChartInstance) {
            this.duplicatesStatusChartInstance.destroy();
        }

        const statusLabels = {
            'duplicate_check_needed': 'Требуют обработки',
            'processed': 'Обработано',
            'address_needed': 'Требуют адрес',
            'unknown': 'Неизвестно'
        };

        const statusColors = {
            'duplicate_check_needed': '#f59e0b',
            'processed': '#10b981',
            'address_needed': '#ef4444',
            'unknown': '#6b7280'
        };

        // Подготавливаем данные
        const chartData = Object.entries(statusCounts)
            .filter(([status, count]) => count > 0)
            .map(([status, count]) => ({
                name: statusLabels[status] || status,
                value: count,
                color: statusColors[status] || '#6b7280'
            }))
            .sort((a, b) => b.value - a.value);

        if (chartData.length === 0) {
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных</div>';
            return;
        }

        const options = {
            series: chartData.map(item => item.value),
            chart: {
                type: 'pie',
                height: 250
            },
            labels: chartData.map(item => item.name),
            colors: chartData.map(item => item.color),
            legend: {
                position: 'bottom',
                fontSize: '12px'
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) {
                    return Math.round(val) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + ' объявлений';
                    }
                }
            }
        };

        this.duplicatesStatusChartInstance = new ApexCharts(chartElement, options);
        this.duplicatesStatusChartInstance.render();
    }

    /**
     * Обновление статистики точности объединения
     */
    updateDuplicatesAccuracyStats() {
        const statsElement = document.getElementById('duplicatesAccuracyStats');
        if (!statsElement) return;

        // Поскольку информация о точности объединения не сохраняется в базе данных,
        // показываем информацию о пороговых значениях системы и рекомендации
        
        const statsHTML = `
            <div class="space-y-3">
                <div class="text-sm text-gray-700 mb-4">
                    Система использует комбинированный анализ текста и контактов для определения дублей:
                </div>
                
                <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div class="flex items-center mb-2">
                        <div class="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                        <span class="text-sm font-medium text-green-800">Высокая точность (≥75%)</span>
                    </div>
                    <div class="text-xs text-green-700">
                        Автоматическое объединение. Высокое сходство текста описания и совпадение контактных данных.
                    </div>
                </div>
                
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div class="flex items-center mb-2">
                        <div class="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                        <span class="text-sm font-medium text-yellow-800">Средняя точность (55-74%)</span>
                    </div>
                    <div class="text-xs text-yellow-700">
                        Требует ручной проверки. Частичное сходство текста или контактов.
                    </div>
                </div>
                
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div class="flex items-center mb-2">
                        <div class="w-3 h-3 bg-gray-500 rounded-full mr-2"></div>
                        <span class="text-sm font-medium text-gray-800">Низкая точность (35-54%)</span>
                    </div>
                    <div class="text-xs text-gray-700">
                        Возможные дубли. Минимальное сходство, требует внимательной проверки.
                    </div>
                </div>
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                    <div class="text-xs text-blue-700">
                        <strong>Алгоритм:</strong> Текстовое сходство (60%) + Контактные данные (40%)
                        <br>
                        <strong>Анализ изображений:</strong> Временно отключен из-за ограничений CORS
                    </div>
                </div>
            </div>
        `;

        statsElement.innerHTML = statsHTML;
    }

    /**
     * Инициализация панели управления объявлением
     */
    initializeManagementPanel(listingId) {
        // Инициализируем SlimSelect для статуса
        const statusSelect = document.getElementById(`statusSelect-${listingId}`);
        if (statusSelect) {
            const statusSlimSelect = new SlimSelect({
                select: statusSelect,
                settings: {
                    showSearch: false,
                    closeOnSelect: true
                }
            });

            // Обработчик изменения статуса
            statusSelect.addEventListener('change', (e) => {
                this.updateListingStatus(listingId, e.target.value);
            });

            // Сохраняем экземпляр SlimSelect
            this[`statusSlimSelect_${listingId}`] = statusSlimSelect;
        }

        // Обработчик кнопки актуализации
        const actualizeBtn = document.getElementById(`actualizeBtn-${listingId}`);
        if (actualizeBtn) {
            actualizeBtn.addEventListener('click', () => {
                this.actualizeListing(listingId);
            });
        }

        // Обработчик кнопки удаления
        const deleteBtn = document.getElementById(`deleteBtn-${listingId}`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteListing(listingId);
            });
        }
    }

    /**
     * Обновление статуса объявления
     */
    async updateListingStatus(listingId, newStatus) {
        try {
            // Сначала ищем в this.listings
            let listing = this.listings.find(l => l.id === listingId);
            
            // Если не найдено, ищем в базе данных
            if (!listing) {
                console.log('Объявление не найдено в this.listings, ищем в базе данных:', listingId);
                listing = await db.getListing(listingId);
            }
            
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                this.showError('Объявление не найдено');
                return;
            }

            // Обновляем только статус (без изменения даты updated)
            listing.status = newStatus;

            // Сохраняем в базу данных
            await db.update('listings', listing);

            // Обновляем связанный объект недвижимости, если объявление входит в объект
            if (listing.object_id) {
                const oldListing = { ...listing, status: listing.status === 'active' ? 'archived' : 'active' }; // Предыдущее состояние
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, oldListing, listing);
                console.log(`🏠 Обновлен объект ${listing.object_id} после изменения статуса объявления ${listingId}`);
            }

            // Перерендериваем график цены для корректного отображения конечной точки
            this.renderPriceChart(listing);
            
            // Пересобираем таблицу дублей
            await this.loadDuplicatesTable();

            console.log(`✅ Статус объявления ${listingId} обновлен на ${newStatus}`);
            
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            // Возвращаем предыдущее значение в select
            const statusSelect = document.getElementById(`statusSelect-${listingId}`);
            if (statusSelect) {
                const listing = this.listings.find(l => l.id === listingId);
                if (listing) {
                    statusSelect.value = listing.status;
                    // Обновляем SlimSelect если есть
                    const slimSelect = this[`statusSlimSelect_${listingId}`];
                    if (slimSelect) {
                        slimSelect.setSelected(listing.status);
                    }
                }
            }
        }
    }

    /**
     * Актуализация объявления (обновление даты updated)
     */
    async actualizeListing(listingId) {
        try {
            // Сначала ищем в this.listings
            let listing = this.listings.find(l => l.id === listingId);
            
            // Если не найдено, ищем в базе данных
            if (!listing) {
                console.log('Объявление не найдено в this.listings, ищем в базе данных:', listingId);
                listing = await db.getListing(listingId);
            }
            
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                this.showError('Объявление не найдено');
                return;
            }

            // Обновляем дату последнего обновления
            listing.updated = new Date().toISOString();

            // Сохраняем в базу данных
            await db.update('listings', listing);

            // Обновляем дату в интерфейсе
            this.updateLastUpdatedDisplay(listingId, listing.updated);

            // Перерендериваем график цены
            this.renderPriceChart(listing);
            
            // Пересобираем таблицу дублей
            await this.loadDuplicatesTable();

            console.log(`✅ Объявление ${listingId} актуализировано`);
            
        } catch (error) {
            console.error('Ошибка актуализации объявления:', error);
        }
    }

    /**
     * Обновление отображения даты последнего обновления
     */
    updateLastUpdatedDisplay(listingId, updatedDate) {
        const lastUpdatedElement = document.getElementById(`lastUpdated-${listingId}`);
        if (lastUpdatedElement && updatedDate) {
            lastUpdatedElement.textContent = new Date(updatedDate).toLocaleDateString('ru-RU', {
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    /**
     * Удаление объявления с подтверждением
     */
    async deleteListing(listingId) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) {
            console.error('Объявление не найдено:', listingId);
            return;
        }

        // Показываем подтверждение удаления
        const confirmed = confirm(`Вы уверены, что хотите удалить это объявление?\n\n"${listing.title || listing.address || 'Без названия'}"\n\nЭто действие нельзя отменить.`);
        
        if (!confirmed) {
            return;
        }

        try {
            // Удаляем из базы данных
            await db.delete('listings', listingId);

            // Удаляем из локального массива
            this.listings = this.listings.filter(l => l.id !== listingId);

            // Закрываем модальное окно просмотра
            document.getElementById('listingModal').classList.add('hidden');

            // Обновляем таблицы и карту
            await this.loadDuplicatesTable();
            this.loadMapData();

            console.log(`✅ Объявление ${listingId} удалено`);
            
        } catch (error) {
            console.error('Ошибка удаления объявления:', error);
            alert('Произошла ошибка при удалении объявления. Попробуйте еще раз.');
        }
    }

    /**
     * Сохранение истории цен объявления
     */
    async savePriceHistory(listingId) {
        try {
            // Сначала ищем в this.listings
            let listing = this.listings.find(l => l.id === listingId);
            
            // Если не найдено, ищем в базе данных
            if (!listing) {
                console.log('Объявление не найдено в this.listings, ищем в базе данных:', listingId);
                listing = await db.getListing(listingId);
            }
            
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                this.showError('Объявление не найдено');
                return;
            }

            // Получаем DataTable instance
            const tableId = `priceHistoryTable-${listingId}`;
            const table = $(`#${tableId}`).DataTable();
            
            if (!table) {
                console.error('Таблица истории цен не найдена');
                return;
            }

            // Получаем исходные данные из таблицы
            const rawTableData = table.data().toArray();
            
            // Используем исходные данные (не отформатированные)
            const priceHistory = [];
            
            rawTableData.forEach(row => {
                if (row && row.date && row.price) {
                    priceHistory.push({
                        date: new Date(row.date).toISOString(),
                        price: parseInt(row.price),
                        change_amount: null,
                        change_type: null,
                        is_publication: false,
                        source_data: {
                            manual_entry: true,
                            created_at: new Date().toISOString()
                        }
                    });
                }
            });

            // Сортируем по дате
            priceHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Обновляем объявление
            listing.price_history = priceHistory;
            
            // Если есть данные в истории, обновляем текущую цену на последнюю из истории
            if (priceHistory.length > 0) {
                const latestPrice = priceHistory[priceHistory.length - 1];
                listing.price = latestPrice.price;
                
                // Пересчитываем цену за м2
                if (listing.area_total && listing.area_total > 0) {
                    listing.price_per_meter = Math.round(listing.price / listing.area_total);
                }
            }

            // Сохраняем в базу данных
            await db.update('listings', listing);

            // Обновляем связанный объект недвижимости, если объявление входит в объект
            if (listing.object_id) {
                // Получаем старое состояние объявления из БД для корректного сравнения
                const oldListing = { ...listing, price_history: [] }; // Создаем версию без истории для сравнения
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, oldListing, listing);
                console.log(`🏠 Обновлен объект ${listing.object_id} после изменения истории цен объявления ${listingId}`);
            }

            // Обновляем график цены
            this.renderPriceChart(listing);

            // Обновляем локальный массив объявлений
            const listingIndex = this.listings.findIndex(l => l.id === listingId);
            if (listingIndex !== -1) {
                this.listings[listingIndex] = listing;
            }

            // Пересобираем таблицу дублей
            await this.loadDuplicatesTable();

            console.log(`✅ История цен объявления ${listingId} сохранена`);
            
            // Можно добавить визуальную обратную связь
            const button = document.getElementById(`savePriceHistory-${listingId}`);
            if (button) {
                const originalText = button.innerHTML;
                button.innerHTML = '✅ Сохранено';
                button.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                button.classList.add('bg-green-500', 'hover:bg-green-600');
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('bg-green-500', 'hover:bg-green-600');
                    button.classList.add('bg-blue-500', 'hover:bg-blue-600');
                }, 2000);
            }
            
        } catch (error) {
            console.error('Ошибка сохранения истории цен:', error);
            
            // Визуальная обратная связь об ошибке
            const button = document.getElementById(`savePriceHistory-${listingId}`);
            if (button) {
                const originalText = button.innerHTML;
                button.innerHTML = '❌ Ошибка';
                button.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                button.classList.add('bg-red-500', 'hover:bg-red-600');
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('bg-red-500', 'hover:bg-red-600');
                    button.classList.add('bg-blue-500', 'hover:bg-blue-600');
                }, 2000);
            }
        }
    }
    
    /**
     * Удаление всех адресов области
     */
    async deleteAllAreaAddresses() {
        if (!this.currentArea) {
            alert('Область не выбрана');
            return;
        }
        
        const confirmDelete = confirm(`Вы уверены, что хотите удалить все адреса области "${this.currentArea.name}"?\n\nЭто действие нельзя отменить.`);
        if (!confirmDelete) {
            return;
        }
        
        try {
            const button = document.getElementById('deleteAllAddressesBtn');
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '🔄 Удаление...';
            
            // Получаем все адреса из базы данных
            const allAddresses = await window.db.getAddresses();
            await this.debugLog('🔍 Получено адресов из БД для удаления:', allAddresses.length);
            
            // Фильтруем адреса, которые входят в полигон области
            const areaAddresses = allAddresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                const addressModel = new AddressModel(address);
                return addressModel.belongsToMapArea(this.currentArea);
            });
            
            if (areaAddresses.length === 0) {
                button.innerHTML = '✅ Нет адресов для удаления';
                button.classList.remove('bg-red-600', 'hover:bg-red-700');
                button.classList.add('bg-gray-500', 'hover:bg-gray-600');
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('bg-gray-500', 'hover:bg-gray-600');
                    button.classList.add('bg-red-600', 'hover:bg-red-700');
                    button.disabled = false;
                }, 2000);
                return;
            }
            
            // Удаляем адреса из базы данных
            let deletedCount = 0;
            for (const address of areaAddresses) {
                await window.db.deleteAddress(address.id);
                deletedCount++;
            }
            await this.debugLog('✅ Удалено адресов области:', deletedCount);
            
            // Обновляем статус (показываем уведомление)
            const deleteStatusElement = document.getElementById('delete-dataStatus');
            if (deleteStatusElement) {
                deleteStatusElement.textContent = `Удалено ${deletedCount} адресов области`;
                deleteStatusElement.classList.remove('hidden');
                deleteStatusElement.classList.add('text-green-600');
                
                setTimeout(() => {
                    deleteStatusElement.classList.add('hidden');
                    deleteStatusElement.classList.remove('text-green-600');
                }, 3000);
            }
            
            // Обновляем карту и таблицы
            await this.refreshMapData();
            await this.refreshAddressData();
            
            button.innerHTML = `✅ Удалено ${deletedCount} адресов`;
            button.classList.remove('bg-red-600', 'hover:bg-red-700');
            button.classList.add('bg-green-600', 'hover:bg-green-700');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('bg-green-600', 'hover:bg-green-700');
                button.classList.add('bg-red-600', 'hover:bg-red-700');
                button.disabled = false;
            }, 3000);
            
        } catch (error) {
            console.error('Ошибка при удалении адресов области:', error);
            
            // Обновляем статус с ошибкой
            const deleteStatusElement = document.getElementById('delete-dataStatus');
            if (deleteStatusElement) {
                deleteStatusElement.textContent = 'Ошибка при удалении адресов';
                deleteStatusElement.classList.remove('hidden');
                deleteStatusElement.classList.add('text-red-600');
                
                setTimeout(() => {
                    deleteStatusElement.classList.add('hidden');
                    deleteStatusElement.classList.remove('text-red-600');
                }, 3000);
            }
            
            const button = document.getElementById('deleteAllAddressesBtn');
            const originalText = button.innerHTML;
            button.innerHTML = '❌ Ошибка';
            button.classList.remove('bg-red-600', 'hover:bg-red-700');
            button.classList.add('bg-gray-500', 'hover:bg-gray-600');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('bg-gray-500', 'hover:bg-gray-600');
                button.classList.add('bg-red-600', 'hover:bg-red-700');
                button.disabled = false;
            }, 2000);
        }
    }
    
    /**
     * Экспорт адресов области в JSON файл
     */
    async exportAddressesToFile() {
        if (!this.currentArea) {
            alert('Область не выбрана');
            return;
        }
        
        try {
            const button = document.getElementById('exportAddressesBtn');
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '📤 Экспорт...';
            
            // Получаем все адреса из базы данных
            const allAddresses = await window.db.getAddresses();
            await this.debugLog('🔍 Получено адресов из БД для экспорта:', allAddresses.length);
            
            // Фильтруем адреса, которые входят в полигон области
            const areaAddresses = allAddresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                const addressModel = new AddressModel(address);
                return addressModel.belongsToMapArea(this.currentArea);
            });
            
            if (areaAddresses.length === 0) {
                this.updateFileOperationStatus('Нет адресов для экспорта в данной области', 'warning');
                button.innerHTML = '⚠️ Нет данных';
                button.classList.remove('bg-green-600', 'hover:bg-green-700');
                button.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
                    button.classList.add('bg-green-600', 'hover:bg-green-700');
                    button.disabled = false;
                }, 2000);
                return;
            }
            
            // Получаем справочники для экспорта
            const [houseSeries, houseClasses, wallMaterials, ceilingMaterials] = await Promise.all([
                window.db.getAll('house_series'),
                window.db.getAll('house_classes'),
                window.db.getAll('wall_materials'),
                window.db.getAll('ceiling_materials')
            ]);
            
            // Создаем экспортируемый объект
            const exportData = {
                metadata: {
                    export_date: new Date().toISOString(),
                    area_name: this.currentArea.name,
                    area_id: this.currentArea.id,
                    total_addresses: areaAddresses.length,
                    export_version: '1.2', // Обновляем версию для поддержки справочников
                    includes_polygon: this.currentArea.polygon && this.currentArea.polygon.length > 0,
                    includes_references: true
                },
                area_polygon: this.currentArea.polygon || [], // Экспортируем полигон области
                addresses: areaAddresses.map(address => ({
                    ...address,
                    source: address.source || 'manual' // Добавляем source по умолчанию
                })),
                // Справочники
                reference_data: {
                    house_series: houseSeries,
                    house_classes: houseClasses,
                    wall_materials: wallMaterials,
                    ceiling_materials: ceilingMaterials
                }
            };
            
            await this.debugLog('📤 Экспорт данных:', {
                area_name: this.currentArea.name,
                total_addresses: areaAddresses.length,
                includes_polygon: exportData.metadata.includes_polygon,
                polygon_points: exportData.area_polygon.length,
                includes_references: exportData.metadata.includes_references,
                reference_counts: {
                    house_series: exportData.reference_data.house_series.length,
                    house_classes: exportData.reference_data.house_classes.length,
                    wall_materials: exportData.reference_data.wall_materials.length,
                    ceiling_materials: exportData.reference_data.ceiling_materials.length
                }
            });
            
            // Создаем файл и скачиваем
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `addresses_${this.currentArea.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.updateFileOperationStatus(`Экспортировано ${areaAddresses.length} адресов`, 'success');
            
            button.innerHTML = `✅ Экспортировано ${areaAddresses.length}`;
            button.classList.remove('bg-green-600', 'hover:bg-green-700');
            button.classList.add('bg-blue-600', 'hover:bg-blue-700');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                button.classList.add('bg-green-600', 'hover:bg-green-700');
                button.disabled = false;
            }, 3000);
            
        } catch (error) {
            console.error('Ошибка при экспорте адресов:', error);
            this.updateFileOperationStatus('Ошибка при экспорте адресов', 'error');
            
            const button = document.getElementById('exportAddressesBtn');
            const originalText = button.innerHTML;
            button.innerHTML = '❌ Ошибка';
            button.classList.remove('bg-green-600', 'hover:bg-green-700');
            button.classList.add('bg-red-500', 'hover:bg-red-600');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('bg-red-500', 'hover:bg-red-600');
                button.classList.add('bg-green-600', 'hover:bg-green-700');
                button.disabled = false;
            }, 2000);
        }
    }
    
    /**
     * Импорт адресов из JSON файла
     */
    async importAddressesFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!this.currentArea) {
            alert('Область не выбрана');
            return;
        }
        
        try {
            const button = document.getElementById('importAddressesBtn');
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '📥 Импорт...';
            
            // Читаем файл
            const fileContent = await this.readFileAsText(file);
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
            
            await this.debugLog('📥 Импорт данных из файла:', {
                area_name: importData.metadata?.area_name || 'неизвестно',
                total_addresses: addresses.length,
                export_version: importData.metadata?.export_version || 'неизвестно',
                includes_polygon: importData.metadata?.includes_polygon || false,
                polygon_points: importData.area_polygon?.length || 0
            });
            
            // Обработка полигона области
            let polygonImported = false;
            let polygonMessage = '';
            
            if (importData.area_polygon && Array.isArray(importData.area_polygon) && importData.area_polygon.length >= 3) {
                if (this.hasAreaPolygon()) {
                    // Если в области уже есть полигон, игнорируем полигон из файла
                    polygonMessage = 'Полигон из файла проигнорирован (область уже содержит полигон)';
                    await this.debugLog('⚠️ Полигон из файла игнорируется - в области уже есть полигон');
                } else {
                    // Если в области нет полигона, импортируем его
                    try {
                        const updatedArea = new MapAreaModel({
                            ...this.currentArea,
                            polygon: importData.area_polygon,
                            updated_at: new Date()
                        });
                        
                        await window.db.updateMapArea(updatedArea);
                        this.currentArea = updatedArea;
                        
                        // Обновляем полигон на карте
                        if (this.map) {
                            this.displayAreaPolygon(updatedArea.polygon);
                        }
                        
                        polygonImported = true;
                        polygonMessage = 'Полигон области импортирован из файла';
                        await this.debugLog('✅ Полигон области импортирован из файла:', {
                            points: importData.area_polygon.length
                        });
                    } catch (error) {
                        console.error('Ошибка при импорте полигона:', error);
                        polygonMessage = 'Ошибка при импорте полигона области';
                        await this.debugLog('❌ Ошибка при импорте полигона:', error);
                    }
                }
            } else {
                polygonMessage = 'Файл не содержит валидного полигона области';
                await this.debugLog('ℹ️ Файл не содержит валидного полигона области');
            }
            
            // Импорт справочников (если присутствуют)
            let referenceImportResults = null;
            if (importData.reference_data) {
                await this.debugLog('📚 Импорт справочников...');
                referenceImportResults = await this.importReferenceData(importData.reference_data);
                await this.debugLog('✅ Справочники импортированы:', referenceImportResults);
            }
            
            // Фильтруем адреса, которые входят в полигон текущей области
            const areaAddresses = addresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                const addressModel = new AddressModel(address);
                return addressModel.belongsToMapArea(this.currentArea);
            });
            
            if (areaAddresses.length === 0) {
                this.updateFileOperationStatus('Ни один адрес из файла не входит в текущую область', 'warning');
                button.innerHTML = '⚠️ Нет подходящих адресов';
                button.classList.remove('bg-white', 'hover:bg-gray-50');
                button.classList.add('bg-yellow-100', 'hover:bg-yellow-200');
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('bg-yellow-100', 'hover:bg-yellow-200');
                    button.classList.add('bg-white', 'hover:bg-gray-50');
                    button.disabled = false;
                }, 3000);
                return;
            }
            
            // Проверяем на дубликаты и импортируем
            let importedCount = 0;
            let duplicatesCount = 0;
            
            for (const addressData of areaAddresses) {
                // Проверяем существует ли адрес с такими же координатами
                const existingAddresses = await window.db.getAddresses();
                const duplicate = existingAddresses.find(existing => 
                    existing.coordinates && 
                    Math.abs(existing.coordinates.lat - addressData.coordinates.lat) < 0.0001 &&
                    Math.abs(existing.coordinates.lng - addressData.coordinates.lng) < 0.0001
                );
                
                if (duplicate) {
                    duplicatesCount++;
                    continue;
                }
                
                // Создаем новый адрес
                const newAddress = new AddressModel({
                    ...addressData,
                    id: null, // Создаем новый ID
                    source: addressData.source || 'imported', // Добавляем source по умолчанию
                    created_at: new Date(),
                    updated_at: new Date()
                });
                
                // Валидируем и сохраняем
                const validationErrors = newAddress.validate();
                if (validationErrors.length === 0) {
                    await window.db.addAddress(newAddress);
                    importedCount++;
                }
            }
            
            await this.debugLog('✅ Результат импорта:', {
                imported: importedCount,
                duplicates: duplicatesCount,
                total_processed: areaAddresses.length,
                polygon_imported: polygonImported,
                polygon_message: polygonMessage,
                reference_results: referenceImportResults
            });
            
            // Формируем сообщение об импорте
            let importMessage = `Импортировано ${importedCount} адресов`;
            if (duplicatesCount > 0) {
                importMessage += `, пропущено дубликатов: ${duplicatesCount}`;
            }
            if (referenceImportResults) {
                const totalRefImported = Object.values(referenceImportResults).reduce((sum, ref) => sum + ref.imported, 0);
                const totalRefDuplicates = Object.values(referenceImportResults).reduce((sum, ref) => sum + ref.duplicates, 0);
                if (totalRefImported > 0) {
                    importMessage += `. Импортировано справочников: ${totalRefImported}`;
                }
                if (totalRefDuplicates > 0) {
                    importMessage += `, пропущено дубликатов справочников: ${totalRefDuplicates}`;
                }
            }
            if (polygonImported) {
                importMessage += `. ${polygonMessage}`;
            } else if (polygonMessage) {
                importMessage += `. ${polygonMessage}`;
            }
            
            this.updateFileOperationStatus(importMessage, 'success');
            
            // Обновляем карту и таблицы
            await this.refreshMapData();
            await this.refreshAddressData();
            
            button.innerHTML = `✅ Импортировано ${importedCount}`;
            button.classList.remove('bg-white', 'hover:bg-gray-50');
            button.classList.add('bg-green-100', 'hover:bg-green-200');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('bg-green-100', 'hover:bg-green-200');
                button.classList.add('bg-white', 'hover:bg-gray-50');
                button.disabled = false;
            }, 3000);
            
        } catch (error) {
            console.error('Ошибка при импорте адресов:', error);
            this.updateFileOperationStatus(`Ошибка при импорте: ${error.message}`, 'error');
            
            const button = document.getElementById('importAddressesBtn');
            const originalText = button.innerHTML;
            button.innerHTML = '❌ Ошибка';
            button.classList.remove('bg-white', 'hover:bg-gray-50');
            button.classList.add('bg-red-100', 'hover:bg-red-200');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('bg-red-100', 'hover:bg-red-200');
                button.classList.add('bg-white', 'hover:bg-gray-50');
                button.disabled = false;
            }, 2000);
        } finally {
            // Сбрасываем input файла
            event.target.value = '';
        }
    }
    
    /**
     * Чтение файла как текста
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Ошибка чтения файла'));
            reader.readAsText(file);
        });
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
        if (version && version !== '1.0' && version !== '1.1' && version !== '1.2') {
            console.warn('Версия формата файла отличается от поддерживаемых (1.0, 1.1, 1.2)');
        }
        
        // Валидируем полигон если он присутствует
        if (data.area_polygon !== undefined) {
            if (!Array.isArray(data.area_polygon)) {
                throw new Error('Полигон области должен быть массивом координат');
            }
            
            // Проверяем структуру точек полигона
            if (data.area_polygon.length > 0) {
                for (let i = 0; i < data.area_polygon.length; i++) {
                    const point = data.area_polygon[i];
                    if (!point || typeof point !== 'object' || 
                        typeof point.lat !== 'number' || typeof point.lng !== 'number') {
                        throw new Error(`Неверная структура точки полигона в позиции ${i}`);
                    }
                }
                
                // Минимум 3 точки для валидного полигона
                if (data.area_polygon.length < 3) {
                    console.warn('Полигон содержит менее 3 точек и будет проигнорирован');
                }
            }
        }
        
        // Валидируем справочники если они присутствуют
        if (data.reference_data) {
            if (typeof data.reference_data !== 'object') {
                throw new Error('Справочники должны быть объектом');
            }
            
            const expectedReferences = ['house_series', 'house_classes', 'wall_materials', 'ceiling_materials'];
            for (const ref of expectedReferences) {
                if (data.reference_data[ref] !== undefined && !Array.isArray(data.reference_data[ref])) {
                    throw new Error(`Справочник ${ref} должен быть массивом`);
                }
            }
        }
        
        return true;
    }
    
    /**
     * Импорт справочников с синхронизацией
     */
    async importReferenceData(referenceData) {
        const importResults = {
            house_series: { imported: 0, duplicates: 0 },
            house_classes: { imported: 0, duplicates: 0 },
            wall_materials: { imported: 0, duplicates: 0 },
            ceiling_materials: { imported: 0, duplicates: 0 }
        };
        
        // Импорт серий домов
        if (referenceData.house_series) {
            const existing = await window.db.getAll('house_series');
            for (const series of referenceData.house_series) {
                const duplicate = existing.find(e => e.id === series.id || e.name === series.name);
                if (!duplicate) {
                    const newSeries = new HouseSeriesModel(series);
                    await window.db.add('house_series', newSeries);
                    importResults.house_series.imported++;
                } else {
                    importResults.house_series.duplicates++;
                }
            }
        }
        
        // Импорт классов домов
        if (referenceData.house_classes) {
            const existing = await window.db.getAll('house_classes');
            for (const houseClass of referenceData.house_classes) {
                const duplicate = existing.find(e => e.id === houseClass.id || e.name === houseClass.name);
                if (!duplicate) {
                    const newHouseClass = new HouseClassModel(houseClass);
                    await window.db.add('house_classes', newHouseClass);
                    importResults.house_classes.imported++;
                } else {
                    importResults.house_classes.duplicates++;
                }
            }
        }
        
        // Импорт материалов стен
        if (referenceData.wall_materials) {
            const existing = await window.db.getAll('wall_materials');
            for (const material of referenceData.wall_materials) {
                const duplicate = existing.find(e => e.id === material.id || e.name === material.name);
                if (!duplicate) {
                    const newMaterial = new WallMaterialModel(material);
                    await window.db.add('wall_materials', newMaterial);
                    importResults.wall_materials.imported++;
                } else {
                    importResults.wall_materials.duplicates++;
                }
            }
        }
        
        // Импорт материалов перекрытий
        if (referenceData.ceiling_materials) {
            const existing = await window.db.getAll('ceiling_materials');
            for (const material of referenceData.ceiling_materials) {
                const duplicate = existing.find(e => e.id === material.id || e.name === material.name);
                if (!duplicate) {
                    const newMaterial = new CeilingMaterialModel(material);
                    await window.db.add('ceiling_materials', newMaterial);
                    importResults.ceiling_materials.imported++;
                } else {
                    importResults.ceiling_materials.duplicates++;
                }
            }
        }
        
        return importResults;
    }
    
    /**
     * Обновление статуса операций с файлами
     */
    updateFileOperationStatus(message, type = 'info') {
        const statusElement = document.getElementById('fileOperationStatus');
        if (!statusElement) return;
        
        statusElement.classList.remove('hidden', 'text-gray-600', 'text-green-600', 'text-red-600', 'text-yellow-600');
        
        switch (type) {
            case 'success':
                statusElement.classList.add('text-green-600');
                break;
            case 'error':
                statusElement.classList.add('text-red-600');
                break;
            case 'warning':
                statusElement.classList.add('text-yellow-600');
                break;
            default:
                statusElement.classList.add('text-gray-600');
        }
        
        statusElement.textContent = message;
        
        // Автоматически скрываем сообщение через 5 секунд
        setTimeout(() => {
            statusElement.classList.add('hidden');
        }, 5000);
    }

}

// Глобальная переменная для доступа к экземпляру класса
let areaPage;

// Делаем класс доступным глобально
window.AreaPage = AreaPage;

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Ждем готовности базы данных
        if (!window.db || !window.db.db || typeof window.db.get !== 'function') {
            console.log('⏳ Ожидание готовности базы данных...');
            await new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 100; // 10 секунд максимум
                
                const checkDB = setInterval(() => {
                    attempts++;
                    
                    // Более подробная проверка готовности БД
                    const dbReady = window.db && 
                                  window.db.db && 
                                  typeof window.db.get === 'function';
                    
                    if (dbReady) {
                        clearInterval(checkDB);
                        console.log('✅ База данных полностью готова к работе');
                        resolve();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkDB);
                        console.error('❌ Состояние БД при таймауте:', {
                            hasDB: !!window.db,
                            hasDBConnection: !!(window.db && window.db.db),
                            hasGetMethod: window.db && typeof window.db.get === 'function',
                            dbConstructor: window.db && window.db.constructor.name
                        });
                        reject(new Error('Таймаут ожидания готовности базы данных'));
                    }
                }, 100);
            });
        }
        
        // Дополнительная проверка готовности БД
        if (!window.db || !window.db.db || typeof window.db.get !== 'function') {
            const dbState = {
                hasDB: !!window.db,
                hasDBConnection: !!(window.db && window.db.db),
                hasGetMethod: window.db && typeof window.db.get === 'function',
                dbConstructor: window.db && window.db.constructor.name
            };
            console.error('❌ База данных не готова к работе:', dbState);
            throw new Error(`База данных не готова к работе. Состояние: ${JSON.stringify(dbState)}`);
        }
        
        console.log('✅ База данных готова, инициализируем страницу');
        areaPage = new AreaPage();
        await areaPage.init();
    } catch (error) {
        console.error('❌ Ошибка инициализации страницы области:', error);
    }
});