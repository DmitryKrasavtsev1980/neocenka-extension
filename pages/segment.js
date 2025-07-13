/**
 * JavaScript для страницы анализа сегмента
 */

class SegmentPage {
  constructor() {
    this.segmentId = null;
    this.segment = null;
    this.mapArea = null;
    this.listings = [];
    this.addresses = [];
    this.duplicates = [];
    
    // Карта
    this.map = null;
    this.mapLayers = {
      addresses: null,
      objects: null,
      listings: null
    };
    this.markerCluster = null;
    this.activeMapFilter = 'year';
    this.drawnItems = null;
    this.drawnPolygon = null;
    this.areaPolygonLayer = null;
    
    // Кластеры
    this.addressesCluster = null;
    this.listingsCluster = null;
    
    // Таблица дублей
    this.duplicatesTable = null;
    this.selectedDuplicates = new Set();
    
    // SlimSelect instances для фильтров обработки
    this.processingAddressSlimSelect = null;
    this.processingPropertyTypeSlimSelect = null;
    this.processingStatusSlimSelect = null;
    
    // Состояние панелей
    this.panelStates = {
      map: false,
      duplicates: false
    };
  }

  async init() {
    try {
      // Получаем ID сегмента из URL
      const urlParams = new URLSearchParams(window.location.search);
      this.segmentId = urlParams.get('id');

      if (!this.segmentId) {
        this.showNotification('ID сегмента не указан', 'error');
        window.location.href = 'main.html';
        return;
      }

      // Инициализируем базу данных
      await db.init();

      // Загружаем данные
      await this.loadData();

      // Инициализируем интерфейс
      this.initializeUI();

      // Инициализируем карту
      this.initializeMap();

      // Инициализируем таблицу дублей
      this.initializeDuplicatesTable();

      // Устанавливаем фильтр по умолчанию
      this.setDefaultMapFilter();

      // Загружаем дубли (отключено)
      // await this.loadDuplicates();

    } catch (error) {
      console.error('Ошибка инициализации страницы сегмента:', error);
      this.showNotification('Ошибка загрузки страницы', 'error');
    }
  }

  async loadData() {
    try {
      // Загружаем сегмент
      this.segment = await db.getSegment(this.segmentId);
      if (!this.segment) {
        throw new Error('Сегмент не найден');
      }

      // Загружаем область
      this.mapArea = await db.getMapArea(this.segment.map_area_id);
      if (!this.mapArea) {
        throw new Error('Область сегмента не найдена');
      }

      // Загружаем все адреса области
      const allAddresses = await db.getAddresses();
      this.addresses = GeometryUtils ? 
        GeometryUtils.getAddressesInMapArea(allAddresses, this.mapArea) : [];

      // Фильтруем адреса по сегменту
      this.addresses = GeometryUtils ? 
        GeometryUtils.applySegmentFilter(this.addresses, this.segment) : [];
      
      // Загружаем объявления напрямую по адресам
      this.listings = [];
      for (const address of this.addresses) {
        const addressListings = await db.getListingsByAddress(address.id);
        this.listings.push(...addressListings);
      }

    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      throw error;
    }
  }

  initializeUI() {
    // Устанавливаем заголовок
    document.getElementById('segmentTitle').textContent = this.segment.name;
    
    const description = [];
    if (this.segment.house_series) description.push(`Серия: ${this.segment.house_series}`);
    if (this.segment.wall_material) description.push(`Стены: ${this.segment.wall_material}`);
    if (this.segment.ceiling_material) description.push(`Перекрытия: ${this.segment.ceiling_material}`);
    
    document.getElementById('segmentDescription').textContent = 
      description.length > 0 ? description.join(', ') : 'Анализ сегмента недвижимости';

    // Настраиваем обработчики событий
    this.setupEventListeners();
    
    // Инициализируем фильтры обработки
    this.initProcessingFilters();
    
    // Восстанавливаем состояние панелей
    this.restorePanelStates();
  }

  /**
   * Инициализация фильтров обработки с SlimSelect
   */
  initProcessingFilters() {
    // Инициализируем все SlimSelect фильтры
    this.initProcessingStatusFilter();
    this.initProcessingAddressFilter();
    this.initProcessingPropertyTypeFilter();
  }

  setupEventListeners() {
    // Кнопки управления
    document.getElementById('editSegmentBtn')?.addEventListener('click', () => {
      this.openEditSegmentModal();
    });

    document.getElementById('exportDataBtn')?.addEventListener('click', () => {
      this.exportData();
    });

    // Панели (сворачивание/разворачивание)
    document.getElementById('mapPanelHeader')?.addEventListener('click', () => {
      this.togglePanel('map');
    });

    document.getElementById('duplicatesPanelHeader')?.addEventListener('click', () => {
      this.togglePanel('duplicates');
    });

    // Фильтры карты
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

    document.getElementById('refreshMapBtn')?.addEventListener('click', () => {
      this.loadMapData();
    });

    // Фильтры обработки
    document.getElementById('clearProcessingFiltersBtn')?.addEventListener('click', () => {
      this.clearProcessingFilters();
    });

    // Кнопки операций с дублями
    document.getElementById('mergeDuplicatesBtn')?.addEventListener('click', () => {
      this.mergeDuplicates();
    });

    document.getElementById('splitDuplicatesBtn')?.addEventListener('click', () => {
      this.splitDuplicates();
    });

    document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
      this.clearSelection();
    });

    // Модальные окна
    document.getElementById('cancelEditSegment')?.addEventListener('click', () => {
      this.closeEditSegmentModal();
    });

    document.getElementById('editSegmentForm')?.addEventListener('submit', (e) => {
      this.handleEditSegmentSubmit(e);
    });

    // Закрытие модальных окон
    document.getElementById('closeModalBtn')?.addEventListener('click', () => {
      this.closeListingModal();
    });

    document.getElementById('closeModalBtn2')?.addEventListener('click', () => {
      this.closeListingModal();
    });

    document.getElementById('closeObjectModalBtn')?.addEventListener('click', () => {
      this.closeObjectModal();
    });

    document.getElementById('closeObjectModalBtn2')?.addEventListener('click', () => {
      this.closeObjectModal();
    });

    // Закрытие модальных окон по Escape и клику вне
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        this.closeAllModals();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
  }

  initializeMap() {
    try {
      // Отключаем тень маркеров чтобы избежать ошибки
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '../libs/leaflet/images/marker-icon.png',
        iconUrl: '../libs/leaflet/images/marker-icon.png',
        shadowUrl: null  // Отключаем тень
      });
      
      // Инициализируем карту
      this.map = L.map('map').setView([55.7558, 37.6173], 10);

      // Добавляем тайлы
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);

      // Инициализируем слои карты
      this.initMapLayers();

      // Отображаем полигон области
      this.displayAreaPolygon();

    } catch (error) {
      console.error('Ошибка инициализации карты:', error);
    }
  }

  /**
   * Инициализация слоев карты
   */
  initMapLayers() {
    // Создаем группы слоев
    this.mapLayers.addresses = L.layerGroup();
    this.mapLayers.objects = L.layerGroup();
    this.mapLayers.listings = L.layerGroup();

    // Добавляем слои на карту
    this.mapLayers.addresses.addTo(this.map);
    this.mapLayers.objects.addTo(this.map);
    this.mapLayers.listings.addTo(this.map);

    // Создаем контроллер слоев (только адреса включены по умолчанию)
    const overlayMaps = {
      '📍 Адреса': this.mapLayers.addresses,
      '🏢 Объекты': this.mapLayers.objects,
      '📋 Объявления': this.mapLayers.listings
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

    // Обработчики событий слоев для управления кластерами
    this.map.on('overlayadd', (e) => {
      if (e.name === '📍 Адреса' && this.addressesCluster) {
        if (!this.map.hasLayer(this.addressesCluster.markerLayer)) {
          this.map.addLayer(this.addressesCluster.markerLayer);
        }
        if (!this.map.hasLayer(this.addressesCluster.clusterLayer)) {
          this.map.addLayer(this.addressesCluster.clusterLayer);
        }
      } else if (e.name === '📋 Объявления' && this.listingsCluster) {
        if (!this.map.hasLayer(this.listingsCluster.markerLayer)) {
          this.map.addLayer(this.listingsCluster.markerLayer);
        }
        if (!this.map.hasLayer(this.listingsCluster.clusterLayer)) {
          this.map.addLayer(this.listingsCluster.clusterLayer);
        }
      }
    });

    this.map.on('overlayremove', (e) => {
      if (e.name === '📍 Адреса' && this.addressesCluster) {
        if (this.map.hasLayer(this.addressesCluster.markerLayer)) {
          this.map.removeLayer(this.addressesCluster.markerLayer);
        }
        if (this.map.hasLayer(this.addressesCluster.clusterLayer)) {
          this.map.removeLayer(this.addressesCluster.clusterLayer);
        }
      } else if (e.name === '📋 Объявления' && this.listingsCluster) {
        if (this.map.hasLayer(this.listingsCluster.markerLayer)) {
          this.map.removeLayer(this.listingsCluster.markerLayer);
        }
        if (this.map.hasLayer(this.listingsCluster.clusterLayer)) {
          this.map.removeLayer(this.listingsCluster.clusterLayer);
        }
      }
    });

    // Инициализируем кластеризацию для объявлений (отключено на время)
    // if (typeof MarkerClusterer !== 'undefined') {
    //   this.markerCluster = L.markerClusterGroup({
    //     chunkedLoading: true,
    //     chunkInterval: 100,
    //     iconCreateFunction: function(cluster) {
    //       const count = cluster.getChildCount();
    //       let size = 'large';
    //       if (count < 10) size = 'small';
    //       else if (count < 50) size = 'medium';
    //       
    //       return L.divIcon({
    //         html: count,
    //         className: `listing-cluster ${size}`,
    //         iconSize: null
    //       });
    //     }
    //   });
    //   this.map.addLayer(this.markerCluster);
    // }
  }

  /**
   * Отображение полигона области на карте
   */
  displayAreaPolygon() {
    if (!this.mapArea || !this.mapArea.polygon || this.mapArea.polygon.length === 0) {
      console.warn('Полигон области не найден');
      return;
    }

    // Если полигон уже существует, не создаем его повторно
    if (this.areaPolygonLayer) {
      console.log('🔷 Полигон области уже отображен, пропускаем повторное создание');
      return;
    }

    try {
      console.log('🔷 Создаем полигон области на карте');

      // Конвертируем координаты в формат Leaflet
      const latLngs = this.mapArea.polygon.map(point => [point.lat, point.lng]);

      // Создаем полигон как отдельный слой
      this.areaPolygonLayer = L.polygon(latLngs, {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        weight: 2
      });

      // Добавляем полигон на карту
      this.map.addLayer(this.areaPolygonLayer);

      // Центрируем карту на полигоне только если панель карты видима
      const mapContent = document.getElementById('mapPanelContent');
      if (mapContent && mapContent.style.display !== 'none') {
        this.map.fitBounds(this.areaPolygonLayer.getBounds());
      }

      // Загружаем данные на карту
      this.loadMapData();

    } catch (error) {
      console.error('Ошибка отображения полигона области:', error);
    }
  }

  /**
   * Инициализация таблицы дублей
   */
  initializeDuplicatesTable() {
    if (typeof $ === 'undefined' || !$.fn.DataTable) {
      console.error('jQuery или DataTables не загружены');
      return;
    }

    // Конфигурация таблицы дублей (адаптировано из area.js)
    this.duplicatesTable = $('#duplicatesTable').DataTable({
      data: [],
      columns: [
        {
          title: '',
          data: null,
          render: (data, type, row) => `<input type="checkbox" class="duplicate-checkbox" data-id="${row.id}" data-type="${row.type}">`,
          orderable: false,
          width: '30px'
        },
        {
          title: 'Тип',
          data: 'type',
          render: (data) => data === 'listing' ? 'Объявление' : 'Объект'
        },
        {
          title: 'Статус',
          data: 'status',
          render: (data) => this.renderStatus(data)
        },
        {
          title: 'Адрес',
          data: null,
          render: (data, type, row) => this.renderDuplicateAddress(row)
        },
        {
          title: 'Характеристики',
          data: null,
          render: (data, type, row) => this.renderDuplicateProperties(row)
        },
        {
          title: 'Цена',
          data: null,
          render: (data, type, row) => this.renderDuplicatePrice(row)
        },
        {
          title: 'Источник',
          data: 'source',
          render: (data) => data || '-'
        },
        {
          title: 'Действия',
          data: null,
          render: (data, type, row) => this.renderDuplicateActions(row),
          orderable: false
        }
      ],
      language: {
        url: '../libs/datatables/ru.json'
      },
      order: [[1, 'asc']],
      pageLength: 25,
      responsive: true,
      autoWidth: false,
      searching: true,
      paging: true,
      info: true
    });

    // Обработчик выбора строк
    $('#duplicatesTable tbody').on('change', '.duplicate-checkbox', (e) => {
      this.handleDuplicateSelection(e);
    });
  }

  /**
   * Загрузка данных дублей для таблицы
   */
  async loadDuplicates() {
    try {
      this.duplicates = [];

      // Добавляем объявления как дубли
      this.listings.forEach(listing => {
        this.duplicates.push({
          id: listing.id,
          type: 'listing',
          status: listing.status || 'active',
          source: listing.source,
          data: listing
        });
      });

      // Загружаем объекты недвижимости для адресов сегмента (временно отключено)
      // TODO: добавить методы для работы с объектами в database.js

      // Обновляем таблицу и статистику
      this.updateDuplicatesTable();
      this.updateStatistics();

    } catch (error) {
      console.error('Ошибка загрузки дублей:', error);
    }
  }

  /**
   * Загрузка данных на карту
   */
  async loadMapData() {
    if (!this.map || !this.mapLayers) return;

    // Очищаем слои
    this.mapLayers.addresses.clearLayers();
    this.mapLayers.objects.clearLayers();
    this.mapLayers.listings.clearLayers();
    // if (this.markerCluster) {
    //   this.markerCluster.clearLayers();
    // }

    // Загружаем адреса на карту
    await this.loadAddressesOnMap();
    
    // Загружаем объявления на карту
    await this.loadListingsOnMap();
    
    console.log(`✅ Обновление карты завершено`);
  }

  /**
   * Загрузка адресов на карту
   */
  async loadAddressesOnMap() {
    try {
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
      if (!Array.isArray(this.addresses) || this.addresses.length === 0) {
        return;
      }

      const markers = [];
      
      for (const address of this.addresses) {
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
                // Подсчитываем количество объектов для этого адреса (временно отключено)
                labelText = '0';
                break;
              case 'listings':
                // Подсчитываем количество объявлений для этого адреса
                try {
                  const listings = await db.getListingsByAddress(address.id);
                  labelText = listings.length.toString();
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
      if (this.addresses.length > 20) {
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
        console.log(`📍 Загружено ${this.addresses.length} адресов на карту с кластеризацией`);
      } else {
        // Для небольшого количества адресов добавляем прямо на карту
        markers.forEach(marker => {
          this.mapLayers.addresses.addLayer(marker);
        });
        console.log(`📍 Загружено ${this.addresses.length} адресов на карту`);
      }
      
    } catch (error) {
      console.error('Ошибка загрузки адресов на карту:', error);
    }
  }

  /**
   * Загрузка объявлений на карту
   */
  async loadListingsOnMap() {
    try {
      // Получаем объявления для сегмента
      const listings = await this.getListingsForSegment();
      
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
        console.log(`📋 Загружено ${listings.length} объявлений на карту с кластеризацией`);
      } else {
        // Для небольшого количества объявлений добавляем прямо на карту
        markers.forEach(marker => {
          this.mapLayers.listings.addLayer(marker);
        });
        console.log(`📋 Загружено ${listings.length} объявлений на карту`);
      }

    } catch (error) {
      console.error('Ошибка загрузки объявлений на карту:', error);
    }
  }

  /**
   * Получение объявлений для сегмента
   */
  async getListingsForSegment() {
    try {
      const allListings = await db.getListings();
      const allAddresses = await db.getAddresses();
      
      // Применяем фильтры сегмента и области
      const filteredListings = GeometryUtils.getListingsForSubsegment(
        allListings, 
        allAddresses, 
        { property_type: null, operation_type: null, contact_type: null }, // пустой подсегмент
        this.segment, 
        this.mapArea
      );

      // Добавляем координаты к объявлениям из связанных адресов
      const listingsWithCoordinates = filteredListings.map(listing => {
        if (!listing.coordinates && listing.address_id) {
          const address = allAddresses.find(addr => addr.id === listing.address_id);
          if (address && address.coordinates) {
            listing.coordinates = address.coordinates;
          }
        }
        return listing;
      });

      return listingsWithCoordinates;
    } catch (error) {
      console.error('Ошибка получения объявлений для сегмента:', error);
      return [];
    }
  }

  /**
   * Создание маркера для объявления
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

    const marker = L.circleMarker([listing.coordinates.lat, listing.coordinates.lng], {
      radius: 8,
      fillColor: color,
      color: 'white',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
      listingData: listing // Сохраняем данные для кластеризации
    });

    // Создаем popup
    const popupContent = this.createListingPopup(listing, color);
    marker.bindPopup(popupContent, {
      maxWidth: 320,
      className: 'listing-popup-container'
    });

    return marker;
  }

  /**
   * Создание popup для объявления
   */
  createListingPopup(listing, color) {
    const priceText = listing.price ? 
      new Intl.NumberFormat('ru-RU').format(listing.price) + ' ₽' : 
      'Цена не указана';
    
    const sourceText = listing.source === 'avito' ? 'Авито' : 'Другой источник';
    
    return `
      <div class="listing-popup">
        <div class="header">
          <div class="title">📋 Объявление</div>
          <div style="font-size: 12px; color: #6b7280;">
            Источник: ${sourceText}
          </div>
        </div>
        
        <div class="content" style="margin: 8px 0;">
          <div style="font-weight: 600; color: ${color};">${priceText}</div>
          ${listing.property_type ? `<div style="font-size: 14px;">${this.formatPropertyType(listing.property_type)}</div>` : ''}
          ${listing.area_total ? `<div style="font-size: 14px;">${listing.area_total} м²</div>` : ''}
          ${listing.floor && listing.total_floors ? `<div style="font-size: 14px;">${listing.floor}/${listing.total_floors} эт.</div>` : ''}
        </div>
        
        <div class="actions" style="margin-top: 8px;">
          <button onclick="segmentPage.viewListingDetails('${listing.id}')" 
                  class="btn btn-primary btn-sm">
            Подробнее
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Обновление таблицы дублей
   */
  updateDuplicatesTable() {
    if (!this.duplicatesTable) return;

    this.duplicatesTable.clear();
    this.duplicatesTable.rows.add(this.duplicates);
    this.duplicatesTable.draw();
  }

  /**
   * Управление состоянием панелей
   */
  togglePanel(panelType) {
    const panel = document.getElementById(`${panelType}PanelContent`);
    const chevron = document.getElementById(`${panelType}PanelChevron`);
    
    if (!panel || !chevron) return;
    
    const isVisible = panel.style.display !== 'none';
    
    if (isVisible) {
      panel.style.display = 'none';
      chevron.style.transform = 'rotate(-90deg)';
      this.panelStates[panelType] = false;
    } else {
      panel.style.display = 'block';
      chevron.style.transform = 'rotate(0deg)';
      this.panelStates[panelType] = true;
      
      // Перерисовываем карту при открытии панели
      if (panelType === 'map' && this.map) {
        setTimeout(() => {
          this.map.invalidateSize();
        }, 100);
      }
    }
    
    // Сохраняем состояние
    this.savePanelState(panelType);
  }

  /**
   * Восстановление состояния панелей
   */
  restorePanelStates() {
    try {
      const savedStates = localStorage.getItem(`segment_panel_states_${this.segmentId}`);
      if (savedStates) {
        this.panelStates = JSON.parse(savedStates);
      }
      
      // Применяем сохраненные состояния
      Object.keys(this.panelStates).forEach(panelType => {
        if (this.panelStates[panelType]) {
          this.togglePanel(panelType);
        }
      });
      
    } catch (error) {
      console.error('Ошибка восстановления состояния панелей:', error);
    }
  }

  /**
   * Сохранение состояния панели
   */
  savePanelState(panelType) {
    try {
      localStorage.setItem(`segment_panel_states_${this.segmentId}`, JSON.stringify(this.panelStates));
    } catch (error) {
      console.error('Ошибка сохранения состояния панели:', error);
    }
  }

  /**
   * Обработка выбора дублей
   */
  handleDuplicateSelection(event) {
    const checkbox = event.target;
    const id = checkbox.dataset.id;
    const type = checkbox.dataset.type;
    const key = `${type}_${id}`;
    
    if (checkbox.checked) {
      this.selectedDuplicates.add(key);
    } else {
      this.selectedDuplicates.delete(key);
    }
    
    this.updateSelectionInfo();
    this.updateActionButtons();
  }

  /**
   * Обновление информации о выборе
   */
  updateSelectionInfo() {
    const count = this.selectedDuplicates.size;
    const infoContainer = document.getElementById('selectedItemsInfo');
    const countElement = document.getElementById('selectedItemsCount');
    
    if (count > 0) {
      infoContainer.classList.remove('hidden');
      countElement.textContent = `${count} элементов выбрано`;
    } else {
      infoContainer.classList.add('hidden');
    }
  }

  /**
   * Обновление состояния кнопок действий
   */
  updateActionButtons() {
    const count = this.selectedDuplicates.size;
    
    document.getElementById('mergeDuplicatesBtn').disabled = count < 2;
    document.getElementById('splitDuplicatesBtn').disabled = count === 0;
  }

  /**
   * Очистка выбора
   */
  clearSelection() {
    this.selectedDuplicates.clear();
    
    // Снимаем выделение со всех чекбоксов
    document.querySelectorAll('.duplicate-checkbox').forEach(cb => {
      cb.checked = false;
    });
    
    this.updateSelectionInfo();
    this.updateActionButtons();
  }

  /**
   * Операции с дублями
   */
  mergeDuplicates() {
    if (this.selectedDuplicates.size < 2) {
      this.showNotification('Необходимо выбрать минимум 2 элемента', 'warning');
      return;
    }
    
    this.showNotification('Объединение дублей будет реализовано позже', 'info');
  }
  
  splitDuplicates() {
    if (this.selectedDuplicates.size === 0) {
      this.showNotification('Необходимо выбрать элементы', 'warning');
      return;
    }
    
    this.showNotification('Разбиение дублей будет реализовано позже', 'info');
  }

  /**
   * Методы рендеринга данных таблицы
   */
  renderStatus(status) {
    const statusMap = {
      'active': '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Активный</span>',
      'archived': '<span class="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Архив</span>',
      'needs_processing': '<span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Требует обработки</span>'
    };
    return statusMap[status] || status;
  }

  renderDuplicateAddress(row) {
    const data = row.data;
    if (row.type === 'listing') {
      const address = this.addresses.find(a => a.id === data.address_id);
      return address ? address.full_address : 'Адрес неизвестен';
    } else {
      const address = this.addresses.find(a => a.id === data.address_id);
      return address ? address.full_address : 'Адрес неизвестен';
    }
  }

  renderDuplicateProperties(row) {
    const data = row.data;
    const properties = [];
    
    if (data.property_type) {
      properties.push(this.formatPropertyType(data.property_type));
    }
    if (data.area_total) {
      properties.push(`${data.area_total} м²`);
    }
    if (data.floor && data.total_floors) {
      properties.push(`${data.floor}/${data.total_floors} эт.`);
    }
    
    return properties.join(', ') || '-';
  }

  renderDuplicatePrice(row) {
    const data = row.data;
    if (data.price) {
      return this.formatPrice(data.price);
    }
    return '-';
  }

  renderDuplicateActions(row) {
    const data = row.data;
    const type = row.type;
    
    return `
      <div class="flex justify-end space-x-2">
        <button class="text-blue-600 hover:text-blue-900 text-sm font-medium" onclick="segmentPage.viewDetails('${data.id}', '${type}')">
          Подробнее
        </button>
      </div>
    `;
  }

  /**
   * Просмотр деталей объявления или объекта
   */
  viewDetails(id, type) {
    if (type === 'listing') {
      this.viewListingDetails(id);
    } else {
      this.viewObjectDetails(id);
    }
  }

  viewListingDetails(listingId) {
    this.showNotification('Модальное окно объявления будет реализовано позже', 'info');
  }
  
  viewObjectDetails(objectId) {
    this.showNotification('Модальное окно объекта будет реализовано позже', 'info');
  }

  /**
   * Модальные окна
   */
  openEditSegmentModal() {
    const modal = document.getElementById('editSegmentModal');
    const form = document.getElementById('editSegmentForm');
    
    if (!modal || !form) return;

    // Заполняем форму данными сегмента
    document.getElementById('editSegmentName').value = this.segment.name;
    document.getElementById('editHouseSeries').value = this.segment.house_series || '';
    document.getElementById('editCeilingMaterial').value = this.segment.ceiling_material || '';
    document.getElementById('editWallMaterial').value = this.segment.wall_material || '';

    modal.classList.remove('hidden');
  }

  closeEditSegmentModal() {
    document.getElementById('editSegmentModal')?.classList.add('hidden');
  }
  
  closeListingModal() {
    document.getElementById('listingModal')?.classList.add('hidden');
  }
  
  closeObjectModal() {
    document.getElementById('objectModal')?.classList.add('hidden');
  }

  async handleEditSegmentSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const segmentData = {
      id: this.segmentId,
      name: formData.get('name').trim(),
      house_series: formData.get('house_series').trim(),
      ceiling_material: formData.get('ceiling_material').trim(),
      wall_material: formData.get('wall_material').trim(),
      map_area_id: this.segment.map_area_id
    };

    try {
      await db.updateSegment(segmentData);
      this.segment = segmentData;
      
      // Обновляем заголовок
      document.getElementById('segmentTitle').textContent = segmentData.name;
      
      this.closeEditSegmentModal();
      this.showNotification('Сегмент обновлен', 'success');

    } catch (error) {
      console.error('Ошибка обновления сегмента:', error);
      this.showNotification('Ошибка обновления сегмента', 'error');
    }
  }

  /**
   * Инициализация фильтров SlimSelect
   */
  initProcessingStatusFilter() {
    if (typeof SlimSelect !== 'undefined') {
      const element = document.getElementById('processingStatusFilter');
      if (element && !this.processingStatusSlimSelect) {
        this.processingStatusSlimSelect = new SlimSelect({
          select: element,
          settings: {
            searchText: 'Поиск...',
            searchPlaceholder: 'Поиск...',
            searchHighlight: true
          }
        });
      }
    }
  }
  
  initProcessingAddressFilter() {
    if (typeof SlimSelect !== 'undefined') {
      const element = document.getElementById('processingAddressFilter');
      if (element && !this.processingAddressSlimSelect) {
        // Заполняем опции адресов
        const uniqueAddresses = [...new Set(this.addresses.map(addr => addr.full_address))];
        uniqueAddresses.forEach(address => {
          const option = document.createElement('option');
          option.value = address;
          option.textContent = address;
          element.appendChild(option);
        });
        
        this.processingAddressSlimSelect = new SlimSelect({
          select: element,
          settings: {
            searchText: 'Поиск...',
            searchPlaceholder: 'Поиск...',
            searchHighlight: true
          }
        });
      }
    }
  }
  
  initProcessingPropertyTypeFilter() {
    if (typeof SlimSelect !== 'undefined') {
      const element = document.getElementById('processingPropertyTypeFilter');
      if (element && !this.processingPropertyTypeSlimSelect) {
        this.processingPropertyTypeSlimSelect = new SlimSelect({
          select: element,
          settings: {
            searchText: 'Поиск...',
            searchPlaceholder: 'Поиск...',
            searchHighlight: true
          }
        });
      }
    }
  }
  
  clearProcessingFilters() {
    if (this.processingStatusSlimSelect) this.processingStatusSlimSelect.setSelected('');
    if (this.processingAddressSlimSelect) this.processingAddressSlimSelect.setSelected('');
    if (this.processingPropertyTypeSlimSelect) this.processingPropertyTypeSlimSelect.setSelected('');
    
    document.getElementById('processingFloorFilter').value = '';
    
    this.showNotification('Фильтры очищены', 'success');
  }

  closeAllModals() {
    this.closeEditSegmentModal();
    this.closeListingModal();
    this.closeObjectModal();
  }
  
  /**
   * Очистка ресурсов
   */
  destroy() {
    try {
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
      
      if (this.map) {
        this.map.remove();
        this.map = null;
      }
      
      if (this.duplicatesTable) {
        this.duplicatesTable.destroy();
        this.duplicatesTable = null;
      }
      
    } catch (error) {
      console.error('Ошибка очистки ресурсов:', error);
    }
  }

  exportData() {
    this.showNotification('Экспорт данных будет реализован позже', 'info');
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
    
    // Перерисовываем маркеры адресов с новыми подписями
    await this.loadAddressesOnMap();
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
   * Форматирование типа недвижимости
   * @param {string} propertyType - Тип недвижимости
   * @returns {string} Отформатированный текст
   */
  formatPropertyType(propertyType) {
    const typeMap = {
      'studio': 'Студия',
      '1k': '1-комн. квартира',
      '2k': '2-комн. квартира', 
      '3k': '3-комн. квартира',
      '4k': '4-комн. квартира',
      '4k+': '4+ комн. квартира',
      'house': 'Дом',
      'land': 'Участок',
      'commercial': 'Коммерческая недвижимость'
    };
    return typeMap[propertyType] || propertyType;
  }

  /**
   * Форматирование цены
   * @param {number} price - Цена
   * @returns {string} Отформатированная цена
   */
  formatPrice(price) {
    if (!price) return '-';
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
  }


  /**
   * Обновление статистики
   */
  updateStatistics() {
    try {
      // Обновляем счетчики (пока пусто)
      
    } catch (error) {
      console.error('Ошибка обновления статистики:', error);
    }
  }

  // Утилиты
  formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0
    }).format(price);
  }

  formatPropertyType(type) {
    const types = {
      'studio': 'Студия',
      '1k': '1-комнатная',
      '2k': '2-комнатная',
      '3k': '3-комнатная',
      '4k+': '4+ комнатная'
    };
    return types[type] || type;
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return;

    const id = Date.now().toString();

    const typeClasses = {
      success: 'bg-green-50 border-green-200 text-green-800',
      error: 'bg-red-50 border-red-200 text-red-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      info: 'bg-blue-50 border-blue-200 text-blue-800'
    };

    const notification = document.createElement('div');
    notification.id = `notification-${id}`;
    notification.className = `border rounded-lg p-4 shadow-sm ${typeClasses[type]} transform transition-all duration-300 ease-in-out`;

    notification.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <span class="text-sm font-medium">${message}</span>
        </div>
        <button class="ml-3 text-sm opacity-70 hover:opacity-100 notification-close-btn">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
          </svg>
        </button>
      </div>
    `;

    container.appendChild(notification);

    // Обработчик закрытия
    notification.querySelector('.notification-close-btn').addEventListener('click', () => {
      notification.remove();
    });

    // Автоматически скрываем через 5 секунд
    setTimeout(() => {
      const element = document.getElementById(`notification-${id}`);
      if (element) {
        element.style.opacity = '0';
        element.style.transform = 'translateX(100%)';
        setTimeout(() => element.remove(), 300);
      }
    }, 5000);
  }
}

// Глобальная переменная для доступа к классу
window.SegmentPage = SegmentPage;