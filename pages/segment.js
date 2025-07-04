/**
 * JavaScript для страницы анализа сегмента
 */

class SegmentPage {
  constructor() {
    this.segmentId = null;
    this.segment = null;
    this.mapArea = null;
    this.subsegments = [];
    this.objects = [];
    this.listings = [];
    this.addresses = [];
    this.map = null;
    this.objectsTable = null;
    this.charts = {
      price: null,
      liquidity: null,
      corridor: null
    };
    this.filters = {
      subsegment: '',
      propertyType: '',
      priceMin: '',
      priceMax: '',
      areaMin: '',
      areaMax: ''
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

      // Инициализируем таблицу
      this.initializeObjectsTable();

      // Инициализируем графики
      this.initializeCharts();

      // Загружаем статистику
      await this.updateStatistics();

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

      // Загружаем подсегменты
      this.subsegments = await db.getSubsegmentsBySegment(this.segmentId);

      // Загружаем все адреса области
      const allAddresses = await db.getAddresses();
      this.addresses = GeometryUtils ? 
        GeometryUtils.getAddressesInMapArea(allAddresses, this.mapArea) : [];

      // Фильтруем адреса по сегменту
      this.addresses = GeometryUtils ? 
        GeometryUtils.getAddressesForSegment(this.addresses, this.segment) : [];

      // УДАЛЕН: загрузка объектов недвижимости
      this.objects = [];
      
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

    // Заполняем фильтр подсегментов
    this.populateSubsegmentFilter();

    // Настраиваем обработчики событий
    this.setupEventListeners();
  }

  populateSubsegmentFilter() {
    const select = document.getElementById('subsegmentFilter');
    if (!select) return;

    // Очищаем опции, кроме первой
    select.innerHTML = '<option value="">Все подсегменты</option>';

    // Добавляем подсегменты
    this.subsegments.forEach(subsegment => {
      const option = document.createElement('option');
      option.value = subsegment.id;
      option.textContent = subsegment.name;
      select.appendChild(option);
    });
  }

  setupEventListeners() {
    // Кнопки управления
    document.getElementById('editSegmentBtn')?.addEventListener('click', () => {
      this.openEditSegmentModal();
    });

    document.getElementById('exportDataBtn')?.addEventListener('click', () => {
      this.exportData();
    });

    // Фильтры
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
      this.applyFilters();
    });

    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
      this.resetFilters();
    });

    document.getElementById('createSubsegmentBtn')?.addEventListener('click', () => {
      this.openCreateSubsegmentModal();
    });

    // Модальные окна
    document.getElementById('cancelEditSegment')?.addEventListener('click', () => {
      this.closeEditSegmentModal();
    });

    document.getElementById('editSegmentForm')?.addEventListener('submit', (e) => {
      this.handleEditSegmentSubmit(e);
    });

    document.getElementById('cancelCreateSubsegment')?.addEventListener('click', () => {
      this.closeCreateSubsegmentModal();
    });

    document.getElementById('createSubsegmentForm')?.addEventListener('submit', (e) => {
      this.handleCreateSubsegmentSubmit(e);
    });

    // Переключение отчетов
    document.querySelectorAll('.report-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.toggleReport(e.target.dataset.chart);
      });
    });

    // Закрытие модальных окон
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
      // Инициализируем карту
      this.map = L.map('map').setView([55.7558, 37.6173], 10);

      // Добавляем тайлы
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);

      // Если у области есть полигон, показываем его
      if (this.mapArea.polygon && this.mapArea.polygon.length > 0) {
        const polygon = L.polygon(this.mapArea.polygon, {
          color: 'blue',
          fillColor: 'lightblue',
          fillOpacity: 0.3
        }).addTo(this.map);

        // Центрируем карту на полигоне
        this.map.fitBounds(polygon.getBounds());

        // Добавляем объекты недвижимости на карту
        this.addObjectsToMap();
      }

    } catch (error) {
      console.error('Ошибка инициализации карты:', error);
    }
  }

  addObjectsToMap() {
    if (!this.map) return;

    // Добавляем маркеры для объектов
    this.objects.forEach(obj => {
      const address = this.addresses.find(a => a.id === obj.address_id);
      if (address && address.coordinates) {
        const [lat, lng] = address.coordinates;
        
        const marker = L.marker([lat, lng]).addTo(this.map);
        
        // Всплывающая подсказка
        const popupContent = `
          <strong>${address.full_address}</strong><br>
          Тип: ${this.formatPropertyType(obj.property_type)}<br>
          Площадь: ${obj.area || 'Не указана'} м²<br>
          Цена: ${obj.price ? this.formatPrice(obj.price) : 'Не указана'}
        `;
        
        marker.bindPopup(popupContent);
      }
    });
  }

  initializeObjectsTable() {
    if (typeof $ === 'undefined' || !$.fn.DataTable) {
      console.error('jQuery или DataTables не загружены');
      return;
    }

    this.objectsTable = $('#objectsTable').DataTable({
      data: [],
      columns: [
        {
          title: 'Адрес',
          data: null,
          render: (data, type, row) => this.renderObjectAddress(row)
        },
        {
          title: 'Тип',
          data: 'property_type',
          render: (data) => this.formatPropertyType(data)
        },
        {
          title: 'Площадь',
          data: 'area',
          render: (data) => data ? `${data} м²` : '-'
        },
        {
          title: 'Цена',
          data: 'price',
          render: (data) => data ? this.formatPrice(data) : '-'
        },
        {
          title: 'Цена за м²',
          data: null,
          render: (data, type, row) => {
            if (row.price && row.area) {
              const pricePerSqm = Math.round(row.price / row.area);
              return this.formatPrice(pricePerSqm);
            }
            return '-';
          }
        },
        {
          title: 'Объявлений',
          data: null,
          render: (data, type, row) => {
            const objectListings = this.listings.filter(l => l.object_id === row.id);
            return objectListings.length;
          },
          className: 'text-center'
        },
        {
          title: 'Действия',
          data: null,
          render: (data, type, row) => this.renderObjectActions(row),
          orderable: false,
          className: 'text-right'
        }
      ],
      language: {
        url: 'https://cdn.datatables.net/plug-ins/1.11.5/i18n/ru.json'
      },
      order: [[3, 'desc']], // Сортировка по цене
      pageLength: 25,
      responsive: true,
      autoWidth: false,
      searching: true,
      paging: true,
      info: true
    });

    this.updateObjectsTable();
  }

  initializeCharts() {
    // График динамики цен
    this.initializePriceChart();
    
    // График ликвидности
    this.initializeLiquidityChart();
    
    // График коридора цен
    this.initializeCorridorChart();
  }

  initializePriceChart() {
    const options = {
      series: [{
        name: 'Средняя цена',
        data: this.generatePriceData()
      }],
      chart: {
        type: 'line',
        height: 350,
        toolbar: {
          show: true
        }
      },
      xaxis: {
        categories: this.generateDateCategories(),
        title: {
          text: 'Период'
        }
      },
      yaxis: {
        title: {
          text: 'Цена, руб.'
        },
        labels: {
          formatter: (value) => this.formatPrice(value)
        }
      },
      title: {
        text: 'Динамика средних цен',
        align: 'left'
      },
      colors: ['#3B82F6']
    };

    this.charts.price = new ApexCharts(document.querySelector("#priceChart"), options);
    this.charts.price.render();
  }

  initializeLiquidityChart() {
    const options = {
      series: [{
        name: 'Количество объявлений',
        data: this.generateLiquidityData()
      }],
      chart: {
        type: 'column',
        height: 350
      },
      xaxis: {
        categories: this.generateDateCategories(),
        title: {
          text: 'Период'
        }
      },
      yaxis: {
        title: {
          text: 'Количество объявлений'
        }
      },
      title: {
        text: 'Ликвидность рынка',
        align: 'left'
      },
      colors: ['#10B981']
    };

    this.charts.liquidity = new ApexCharts(document.querySelector("#liquidityChart"), options);
    this.charts.liquidity.render();
  }

  initializeCorridorChart() {
    const options = {
      series: [
        {
          name: 'Минимальная цена',
          data: this.generateCorridorData('min')
        },
        {
          name: 'Средняя цена',
          data: this.generateCorridorData('avg')
        },
        {
          name: 'Максимальная цена',
          data: this.generateCorridorData('max')
        }
      ],
      chart: {
        type: 'line',
        height: 350
      },
      xaxis: {
        categories: this.generateDateCategories(),
        title: {
          text: 'Период'
        }
      },
      yaxis: {
        title: {
          text: 'Цена, руб.'
        },
        labels: {
          formatter: (value) => this.formatPrice(value)
        }
      },
      title: {
        text: 'Коридор цен',
        align: 'left'
      },
      colors: ['#EF4444', '#3B82F6', '#10B981']
    };

    this.charts.corridor = new ApexCharts(document.querySelector("#corridorChart"), options);
    this.charts.corridor.render();
  }

  async updateStatistics() {
    try {
      // Фильтруем данные по текущим фильтрам
      const filteredObjects = this.getFilteredObjects();
      const filteredListings = this.getFilteredListings();

      // Обновляем статистику
      document.getElementById('subsegmentsCount').textContent = this.subsegments.length;
      document.getElementById('objectsCount').textContent = filteredObjects.length;
      document.getElementById('listingsCount').textContent = filteredListings.length;

      // Вычисляем среднюю цену
      const validPrices = filteredObjects.filter(obj => obj.price).map(obj => obj.price);
      const avgPrice = validPrices.length > 0 ? 
        Math.round(validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length) : 0;
      
      document.getElementById('avgPrice').textContent = avgPrice > 0 ? this.formatPrice(avgPrice) : '-';

      // Обновляем счетчики таблицы
      document.getElementById('filteredObjectsCount').textContent = filteredObjects.length;
      document.getElementById('totalObjectsCount').textContent = this.objects.length;

    } catch (error) {
      console.error('Ошибка обновления статистики:', error);
    }
  }

  getFilteredObjects() {
    return this.objects.filter(obj => {
      // Фильтр по подсегменту
      if (this.filters.subsegment) {
        const subsegment = this.subsegments.find(s => s.id === this.filters.subsegment);
        if (subsegment) {
          if (subsegment.property_type && obj.property_type !== subsegment.property_type) {
            return false;
          }
          if (subsegment.contact_type) {
            const objectListings = this.listings.filter(l => l.object_id === obj.id);
            if (!objectListings.some(l => l.contact_type === subsegment.contact_type)) {
              return false;
            }
          }
        }
      }

      // Фильтр по типу недвижимости
      if (this.filters.propertyType && obj.property_type !== this.filters.propertyType) {
        return false;
      }

      // Фильтр по цене
      if (this.filters.priceMin && obj.price < this.filters.priceMin) {
        return false;
      }
      if (this.filters.priceMax && obj.price > this.filters.priceMax) {
        return false;
      }

      // Фильтр по площади
      if (this.filters.areaMin && obj.area < this.filters.areaMin) {
        return false;
      }
      if (this.filters.areaMax && obj.area > this.filters.areaMax) {
        return false;
      }

      return true;
    });
  }

  getFilteredListings() {
    const filteredObjects = this.getFilteredObjects();
    const filteredObjectIds = filteredObjects.map(obj => obj.id);
    return this.listings.filter(listing => filteredObjectIds.includes(listing.object_id));
  }

  updateObjectsTable() {
    if (!this.objectsTable) return;

    const filteredObjects = this.getFilteredObjects();
    this.objectsTable.clear();
    this.objectsTable.rows.add(filteredObjects);
    this.objectsTable.draw();
  }

  applyFilters() {
    // Считываем значения фильтров
    this.filters.subsegment = document.getElementById('subsegmentFilter')?.value || '';
    this.filters.propertyType = document.getElementById('propertyTypeFilter')?.value || '';
    this.filters.priceMin = parseFloat(document.getElementById('priceMinFilter')?.value) || '';
    this.filters.priceMax = parseFloat(document.getElementById('priceMaxFilter')?.value) || '';
    this.filters.areaMin = parseFloat(document.getElementById('areaMinFilter')?.value) || '';
    this.filters.areaMax = parseFloat(document.getElementById('areaMaxFilter')?.value) || '';

    // Обновляем таблицу и статистику
    this.updateObjectsTable();
    this.updateStatistics();

    this.showNotification('Фильтры применены', 'success');
  }

  resetFilters() {
    // Сбрасываем фильтры
    this.filters = {
      subsegment: '',
      propertyType: '',
      priceMin: '',
      priceMax: '',
      areaMin: '',
      areaMax: ''
    };

    // Сбрасываем значения в форме
    document.getElementById('subsegmentFilter').value = '';
    document.getElementById('propertyTypeFilter').value = '';
    document.getElementById('priceMinFilter').value = '';
    document.getElementById('priceMaxFilter').value = '';
    document.getElementById('areaMinFilter').value = '';
    document.getElementById('areaMaxFilter').value = '';

    // Обновляем таблицу и статистику
    this.updateObjectsTable();
    this.updateStatistics();

    this.showNotification('Фильтры сброшены', 'success');
  }

  toggleReport(chartType) {
    // Скрываем все контейнеры
    document.querySelectorAll('.chart-container').forEach(container => {
      container.classList.add('hidden');
    });

    // Убираем активный класс со всех кнопок
    document.querySelectorAll('.report-toggle-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.classList.remove('bg-blue-100', 'text-blue-700');
      btn.classList.add('bg-white', 'text-gray-700', 'border-gray-300');
    });

    // Показываем выбранный контейнер
    const container = document.getElementById(`${chartType}Container`);
    if (container) {
      container.classList.remove('hidden');
    }

    // Активируем кнопку
    const button = document.querySelector(`[data-chart="${chartType}"]`);
    if (button) {
      button.classList.add('active');
      button.classList.add('bg-blue-100', 'text-blue-700');
      button.classList.remove('bg-white', 'text-gray-700', 'border-gray-300');
    }
  }

  // Генерация данных для графиков (заглушки)
  generatePriceData() {
    // В реальном приложении здесь будет анализ исторических данных
    return [2500000, 2520000, 2480000, 2550000, 2530000, 2560000];
  }

  generateLiquidityData() {
    return [15, 18, 12, 22, 19, 25];
  }

  generateCorridorData(type) {
    const base = this.generatePriceData();
    switch (type) {
      case 'min':
        return base.map(val => val * 0.8);
      case 'max':
        return base.map(val => val * 1.2);
      default:
        return base;
    }
  }

  generateDateCategories() {
    return ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'];
  }

  // Рендеринг элементов таблицы
  renderObjectAddress(obj) {
    const address = this.addresses.find(a => a.id === obj.address_id);
    return address ? address.full_address : 'Адрес неизвестен';
  }

  renderObjectActions(obj) {
    return `
      <div class="flex justify-end space-x-2">
        <button class="text-blue-600 hover:text-blue-900 text-sm font-medium" onclick="segmentPage.viewObjectDetails('${obj.id}')">
          Подробнее
        </button>
      </div>
    `;
  }

  viewObjectDetails(objectId) {
    // Заглушка для просмотра деталей объекта
    this.showNotification('Просмотр деталей объекта будет реализован позже', 'info');
  }

  // Модальные окна
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

  openCreateSubsegmentModal() {
    document.getElementById('createSubsegmentModal')?.classList.remove('hidden');
  }

  closeCreateSubsegmentModal() {
    document.getElementById('createSubsegmentModal')?.classList.add('hidden');
  }

  async handleCreateSubsegmentSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const subsegmentData = {
      segment_id: this.segmentId,
      name: formData.get('name').trim(),
      property_type: formData.get('property_type'),
      contact_type: formData.get('contact_type')
    };

    if (!subsegmentData.name) {
      this.showNotification('Название подсегмента обязательно', 'error');
      return;
    }

    if (!subsegmentData.property_type) {
      this.showNotification('Необходимо выбрать тип недвижимости', 'error');
      return;
    }

    try {
      await db.addSubsegment(subsegmentData);
      
      // Перезагружаем подсегменты
      this.subsegments = await db.getSubsegmentsBySegment(this.segmentId);
      this.populateSubsegmentFilter();
      
      this.closeCreateSubsegmentModal();
      this.showNotification('Подсегмент создан', 'success');
      
      // Обновляем статистику
      await this.updateStatistics();

    } catch (error) {
      console.error('Ошибка создания подсегмента:', error);
      this.showNotification('Ошибка создания подсегмента', 'error');
    }
  }

  closeAllModals() {
    this.closeEditSegmentModal();
    this.closeCreateSubsegmentModal();
  }

  exportData() {
    // Заглушка для экспорта данных
    this.showNotification('Экспорт данных будет реализован позже', 'info');
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