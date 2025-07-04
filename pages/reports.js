/**
 * JavaScript для новой страницы отчетов - таблица объявлений
 * Neocenka Extension
 */

class ReportsPage {
  constructor() {
    this.segments = [];
    this.listings = [];
    this.filteredListings = [];
    this.dataTable = null;
    this.currentPage = 1;
    this.itemsPerPage = 50;

    this.filters = {
      segmentId: '',
      source: '',
      status: '',
      propertyType: '',
      priceFrom: '',
      priceTo: '',
      areaFrom: '',
      areaTo: '',
      dateFrom: '',
      dateTo: ''
    };
  }

  async init() {
    try {
      // Инициализируем базу данных
      await db.init();

      // Загружаем данные
      await this.loadData();

      // Инициализируем UI
      this.initializeUI();

      // Проверяем URL параметры
      this.checkUrlParams();

      // Обновляем интерфейс
      this.updateUI();

    } catch (error) {
      console.error('Ошибка инициализации:', error);
      this.showNotification('Ошибка загрузки данных', 'error');
    }
  }

  async loadData() {
    try {
      this.showLoading(true);

      console.log('Loading reports data...');

      // Используем правильные методы базы данных (как в popup)
      if (typeof db !== 'undefined' && db && typeof db.getSegments === 'function') {
        console.log('Using real database for reports');
        try {
          // Загружаем сегменты
          this.segments = await db.getSegments();
          console.log('Loaded segments for reports:', this.segments);

          // Загружаем объявления - пробуем разные методы
          if (typeof db.getListings === 'function') {
            this.listings = await db.getListings();
            console.log('Loaded listings via db.getListings:', this.listings);
          } else if (typeof db.getAllListings === 'function') {
            this.listings = await db.getAllListings();
            console.log('Loaded listings via db.getAllListings:', this.listings);
          } else if (typeof db.getAll === 'function') {
            this.listings = await db.getAll('listings');
            console.log('Loaded listings via db.getAll(listings):', this.listings);
          } else {
            console.warn('No suitable method found for loading listings');
            console.log('Available db methods:', Object.keys(db).filter(key => typeof db[key] === 'function'));
            this.listings = [];
          }

        } catch (realDbError) {
          console.error('Error with real database in reports:', realDbError);
          this.segments = [];
          this.listings = [];
        }
      } else {
        console.warn('Database not available for reports, using empty data');
        this.segments = [];
        this.listings = [];
      }

      // Сортируем по дате добавления (новые сначала)
      this.listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Применяем фильтры
      this.applyFilters();

      this.showLoading(false);

    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      this.showLoading(false);
      throw error;
    }
  }

  initializeUI() {
    // Обновляем время
    this.updateDateTime();
    setInterval(() => this.updateDateTime(), 60000);

    // Заполняем селект сегментов
    this.populateSegmentFilter();

    // Настраиваем обработчики событий
    this.setupEventListeners();

    // Инициализируем DataTable
    this.initializeDataTable();
  }

  updateDateTime() {
    const now = new Date();
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    document.getElementById('currentDateTime').textContent =
      now.toLocaleDateString('ru-RU', options);
  }

  populateSegmentFilter() {
    const select = document.getElementById('segmentFilter');

    // Очищаем существующие опции (кроме первой)
    select.innerHTML = '<option value="">Все сегменты</option>';

    // Добавляем сегменты
    this.segments.forEach(segment => {
      const option = document.createElement('option');
      option.value = segment.id;
      option.textContent = segment.name;
      select.appendChild(option);
    });
  }

  setupEventListeners() {
    // Фильтры
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
      this.updateFiltersFromForm();
      this.applyFilters();
      this.updateUI();
    });

    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
      this.resetFilters();
    });

    // Обновление данных
    document.getElementById('refreshDataBtn').addEventListener('click', () => {
      this.loadData();
    });

    // Экспорт
    document.getElementById('exportDataBtn').addEventListener('click', () => {
      this.exportData();
    });

    // Массовый парсинг Avito
    document.getElementById('massParsingBtn').addEventListener('click', () => {
      this.startMassParsing();
    });

    // Модальное окно
    document.getElementById('closeModalBtn').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('closeModalBtn2').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('openListingBtn').addEventListener('click', () => {
      this.openCurrentListing();
    });

    // Закрытие модального окна по клику вне его
    document.getElementById('listingModal').addEventListener('click', (e) => {
      if (e.target.id === 'listingModal') {
        this.closeModal();
      }
    });

    // Автоматическое применение фильтров при изменении
    const filterInputs = [
      'segmentFilter', 'sourceFilter', 'statusFilter', 'propertyTypeFilter',
      'priceFrom', 'priceTo', 'areaFrom', 'areaTo', 'dateFrom', 'dateTo'
    ];

    filterInputs.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.updateFiltersFromForm();
          this.applyFilters();
          this.updateUI();
        });
      }
    });

    // Event delegation for table actions
    document.addEventListener('click', (e) => {
      // Listing title clicks
      if (e.target.closest('.listing-title')) {
        const listingId = e.target.closest('.listing-title').getAttribute('data-listing-id');
        if (listingId) {
          this.showListingDetails(listingId);
        }
      }
      
      // Listing details button clicks
      if (e.target.classList.contains('listing-details-btn')) {
        const listingId = e.target.getAttribute('data-listing-id');
        if (listingId) {
          this.showListingDetails(listingId);
        }
      }
      
      // Listing open button clicks
      if (e.target.classList.contains('listing-open-btn')) {
        const listingUrl = e.target.getAttribute('data-listing-url');
        if (listingUrl) {
          this.openListing(listingUrl);
        }
      }
      
      // Notification close button clicks
      if (e.target.closest('.notification-close-btn')) {
        const notification = e.target.closest('.notification-close-btn').closest('div[class*="fixed"]');
        if (notification) {
          notification.remove();
        }
      }
    });
  }

  initializeDataTable() {
    // Если DataTable уже инициализирована, уничтожаем её
    if (this.dataTable) {
      this.dataTable.destroy();
    }

    // Инициализируем новую DataTable
    this.dataTable = new DataTable('#listingsTable', {
      data: this.filteredListings,
      columns: [
        {
          title: 'Объявление',
          data: null,
          render: (data, type, row) => this.renderListingTitle(row)
        },
        {
          title: 'Адрес',
          data: null,
          render: (data, type, row) => this.truncateText(row.address || '-', 40)
        },
        {
          title: 'Цена',
          data: null,
          render: (data, type, row) => this.formatPrice(row.price)
        },
        {
          title: 'Цена за м²',
          data: null,
          render: (data, type, row) => row.price_per_meter ? this.formatPrice(row.price_per_meter) + '/м²' : '-'
        },
        {
          title: 'Площадь',
          data: null,
          render: (data, type, row) => row.area_total ? row.area_total + ' м²' : '-'
        },
        {
          title: 'Тип',
          data: null,
          render: (data, type, row) => this.formatPropertyType(row.property_type)
        },
        {
          title: 'Источник',
          data: null,
          render: (data, type, row) => this.renderSource(row.source)
        },
        {
          title: 'Статус',
          data: null,
          render: (data, type, row) => this.renderStatus(row.status || 'active')
        },
        {
          title: 'Дата',
          data: null,
          render: (data, type, row) => this.formatDate(row.created_at)
        },
        {
          title: 'Действия',
          data: null,
          orderable: false,
          render: (data, type, row) => this.renderActions(row)
        }
      ],
      order: [[8, 'desc']], // Сортировка по дате (новые сначала)
      pageLength: this.itemsPerPage,
      responsive: true,
      language: {
        // Простая русская локализация без внешнего файла
        "processing": "Обработка...",
        "search": "Поиск:",
        "lengthMenu": "Показать _MENU_ записей",
        "info": "Записи с _START_ до _END_ из _TOTAL_ записей",
        "infoEmpty": "Записи с 0 до 0 из 0 записей",
        "infoFiltered": "(отфильтровано из _MAX_ записей)",
        "loadingRecords": "Загрузка записей...",
        "zeroRecords": "Записи отсутствуют.",
        "emptyTable": "В таблице отсутствуют данные",
        "paginate": {
          "first": "Первая",
          "previous": "Предыдущая",
          "next": "Следующая",
          "last": "Последняя"
        }
      },
      dom: 'lrtip', // Убираем встроенный поиск, используем свои фильтры
      drawCallback: () => {
        this.updateCounters();
      }
    });
  }

  updateFiltersFromForm() {
    this.filters = {
      segmentId: document.getElementById('segmentFilter').value,
      source: document.getElementById('sourceFilter').value,
      status: document.getElementById('statusFilter').value,
      propertyType: document.getElementById('propertyTypeFilter').value,
      priceFrom: document.getElementById('priceFrom').value,
      priceTo: document.getElementById('priceTo').value,
      areaFrom: document.getElementById('areaFrom').value,
      areaTo: document.getElementById('areaTo').value,
      dateFrom: document.getElementById('dateFrom').value,
      dateTo: document.getElementById('dateTo').value
    };
  }

  applyFilters() {
    this.filteredListings = this.listings.filter(listing => {
      // Фильтр по сегменту
      if (this.filters.segmentId && listing.segment_id !== this.filters.segmentId) {
        return false;
      }

      // Фильтр по источнику
      if (this.filters.source && listing.source !== this.filters.source) {
        return false;
      }

      // Фильтр по статусу
      if (this.filters.status && listing.status !== this.filters.status) {
        return false;
      }

      // Фильтр по типу недвижимости
      if (this.filters.propertyType && listing.property_type !== this.filters.propertyType) {
        return false;
      }

      // Фильтр по цене
      if (this.filters.priceFrom && listing.price < parseInt(this.filters.priceFrom)) {
        return false;
      }
      if (this.filters.priceTo && listing.price > parseInt(this.filters.priceTo)) {
        return false;
      }

      // Фильтр по площади
      if (this.filters.areaFrom && listing.area_total < parseInt(this.filters.areaFrom)) {
        return false;
      }
      if (this.filters.areaTo && listing.area_total > parseInt(this.filters.areaTo)) {
        return false;
      }

      // Фильтр по дате
      if (this.filters.dateFrom) {
        const filterDate = new Date(this.filters.dateFrom);
        const listingDate = new Date(listing.created_at);
        if (listingDate < filterDate) {
          return false;
        }
      }
      if (this.filters.dateTo) {
        const filterDate = new Date(this.filters.dateTo);
        const listingDate = new Date(listing.created_at);
        if (listingDate > filterDate) {
          return false;
        }
      }

      return true;
    });

    // Обновляем DataTable
    if (this.dataTable) {
      this.dataTable.clear();
      this.dataTable.rows.add(this.filteredListings);
      this.dataTable.draw();
    }
  }

  updateUI() {
    this.updateStatistics();
    this.updateCounters();
  }

  updateStatistics() {
    const totalListings = this.listings.length;
    const activeListings = this.listings.filter(l => l.status === 'active').length;

    // Вычисляем статистику по отфильтрованным данным
    const prices = this.filteredListings
      .filter(l => l.price && l.price > 0)
      .map(l => l.price);

    const pricesPerMeter = this.filteredListings
      .filter(l => l.price_per_meter && l.price_per_meter > 0)
      .map(l => l.price_per_meter);

    const avgPrice = prices.length > 0 ?
      Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length) : 0;

    const avgPricePerMeter = pricesPerMeter.length > 0 ?
      Math.round(pricesPerMeter.reduce((sum, p) => sum + p, 0) / pricesPerMeter.length) : 0;

    // Обновляем отображение
    document.getElementById('totalListings').textContent = totalListings;
    document.getElementById('activeListings').textContent = activeListings;
    document.getElementById('avgPrice').textContent = this.formatPrice(avgPrice);
    document.getElementById('avgPricePerMeter').textContent = this.formatPrice(avgPricePerMeter);
  }

  updateCounters() {
    document.getElementById('visibleCount').textContent = this.filteredListings.length;
    document.getElementById('totalCount').textContent = this.listings.length;
  }

  resetFilters() {
    // Сбрасываем форму
    document.getElementById('segmentFilter').value = '';
    document.getElementById('sourceFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('propertyTypeFilter').value = '';
    document.getElementById('priceFrom').value = '';
    document.getElementById('priceTo').value = '';
    document.getElementById('areaFrom').value = '';
    document.getElementById('areaTo').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';

    // Обновляем фильтры
    this.updateFiltersFromForm();
    this.applyFilters();
    this.updateUI();
  }

  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const segmentId = urlParams.get('segment');

    if (segmentId) {
      document.getElementById('segmentFilter').value = segmentId;
      this.updateFiltersFromForm();
      this.applyFilters();
    }
  }

  // Функции рендеринга для таблицы
  renderListingTitle(listing) {
    const title = this.truncateText(listing.title || listing.name || 'Без названия', 50);
    return `
      <div class="cursor-pointer hover:text-blue-600 listing-title" data-listing-id="${listing.id}">
        <div class="font-medium text-gray-900">${this.escapeHtml(title)}</div>
        <div class="text-sm text-gray-500">${this.getSegmentName(listing.segment_id)}</div>
      </div>
    `;
  }

  renderSource(source) {
    const badges = {
      'avito': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Avito</span>',
      'cian': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Cian</span>'
    };
    return badges[source] || source;
  }

  renderStatus(status) {
    const badges = {
      'active': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активное</span>',
      'archived': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивное</span>',
      'needs_processing': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Обработка</span>'
    };
    return badges[status] || status;
  }

  renderActions(listing) {
    return `
      <div class="flex space-x-2">
        <button class="text-blue-600 hover:text-blue-900 text-sm listing-details-btn" data-listing-id="${listing.id}">
          Подробнее
        </button>
        <button class="text-green-600 hover:text-green-900 text-sm listing-open-btn" data-listing-url="${listing.url}">
          Открыть
        </button>
      </div>
    `;
  }

  // Модальное окно с деталями объявления
  async showListingDetails(listingId) {
    try {
      const listing = this.listings.find(l => l.id === listingId);
      if (!listing) return;

      const modalContent = document.getElementById('modalContent');
      modalContent.innerHTML = this.renderListingDetails(listing);

      // Сохраняем ID для кнопки "Открыть объявление"
      this.currentListingUrl = listing.url;

      // Показываем модальное окно
      document.getElementById('listingModal').classList.remove('hidden');

      // Инициализируем Fotorama после отображения модального окна
      setTimeout(() => {
        const galleryElement = document.getElementById(`listing-gallery-${listingId}`);
        if (galleryElement && window.$ && $.fn.fotorama) {
          $(galleryElement).fotorama();
        }
      }, 100);

    } catch (error) {
      console.error('Ошибка загрузки деталей:', error);
      this.showNotification('Ошибка загрузки деталей объявления', 'error');
    }
  }

  renderListingDetails(listing) {
    // Обрабатываем фотографии
    const photos = this.getListingPhotos(listing);
    
    return `
      ${photos.length > 0 ? `
        <!-- Фотогалерея -->
        <div class="mb-6">
          <h4 class="text-lg font-medium text-gray-900 mb-4">Фотографии (${photos.length})</h4>
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
        </div>
      ` : ''}
      
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
              <dd class="text-sm text-gray-900">${listing.floor ? `${listing.floor}${listing.floors_total ? ` из ${listing.floors_total}` : ''}` : '-'}</dd>
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
              <dd class="text-sm text-gray-900">${this.formatDate(listing.created_at)}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Последнее обновление</dt>
              <dd class="text-sm text-gray-900">${this.formatDate(listing.updated_at)}</dd>
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
              <dd class="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">${this.escapeHtml(this.truncateText(listing.description, 500))}</dd>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

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

  openCurrentListing() {
    if (this.currentListingUrl) {
      chrome.tabs.create({ url: this.currentListingUrl });
    }
  }

  openListing(url) {
    if (url) {
      chrome.tabs.create({ url: url });
    }
  }

  // Экспорт данных
  async exportData() {
    try {
      const data = this.filteredListings.map(listing => ({
        'ID': listing.id,
        'Сегмент': this.getSegmentName(listing.segment_id),
        'Источник': listing.source,
        'Статус': this.getStatusText(listing.status),
        'Заголовок': listing.title,
        'Адрес': listing.address,
        'Цена': listing.price,
        'Цена за м²': listing.price_per_meter,
        'Тип недвижимости': this.formatPropertyType(listing.property_type),
        'Общая площадь': listing.area_total,
        'Жилая площадь': listing.area_living,
        'Площадь кухни': listing.area_kitchen,
        'Этаж': listing.floor,
        'Этажность': listing.floors_total,
        'Комнат': listing.rooms,
        'Состояние': listing.condition,
        'Тип дома': listing.house_type,
        'Год постройки': listing.year_built,
        'URL': listing.url,
        'External ID': listing.external_id,
        'Дата добавления': this.formatDate(listing.created_at),
        'Последнее обновление': this.formatDate(listing.updated_at),
        'Продавец': listing.seller_name,
        'Тип продавца': listing.seller_type,
        'Описание': listing.description
      }));

      // Преобразуем в CSV
      const csv = this.convertToCSV(data);

      // Скачиваем файл
      this.downloadCSV(csv, `neocenka_listings_${this.formatDateForFilename(new Date())}.csv`);

      this.showNotification('Данные экспортированы успешно', 'success');

    } catch (error) {
      console.error('Ошибка экспорта:', error);
      this.showNotification('Ошибка экспорта данных', 'error');
    }
  }

  convertToCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');

    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header] || '';
        // Экранируем кавычки и переносы строк
        const escapedValue = String(value).replace(/"/g, '""');
        return `"${escapedValue}"`;
      }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
  }

  downloadCSV(csv, filename) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  // Утилиты форматирования
  formatPrice(price) {
    if (!price || price === 0) return '₽0';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  }

  formatPropertyType(type) {
    const types = {
      'studio': 'Студия',
      '1k': '1-комнатная',
      '2k': '2-комнатная',
      '3k': '3-комнатная',
      '4k+': '4+ комнат'
    };
    return types[type] || type || '-';
  }

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

  formatDateForFilename(date) {
    return date.toISOString().slice(0, 19).replace(/:/g, '-');
  }

  getSegmentName(segmentId) {
    const segment = this.segments.find(s => s.id === segmentId);
    return segment ? segment.name : 'Неизвестный сегмент';
  }

  getStatusText(status) {
    const statuses = {
      'active': 'Активное',
      'archived': 'Архивное',
      'needs_processing': 'Требует обработки'
    };
    return statuses[status] || status;
  }

  truncateText(text, maxLength) {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showLoading(show) {
    const indicator = document.getElementById('loadingIndicator');
    if (show) {
      indicator.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
    }
  }

  showNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg transition-all duration-300 ${
      type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
      type === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
      'bg-blue-50 border border-blue-200 text-blue-800'
    }`;

    notification.innerHTML = `
      <div class="flex items-center">
        <div class="flex-shrink-0">
          ${type === 'success' ?
            '<svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>' :
            type === 'error' ?
            '<svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>' :
            '<svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>'
          }
        </div>
        <div class="ml-3">
          <p class="text-sm font-medium">${message}</p>
        </div>
        <div class="ml-auto pl-3">
          <button class="inline-flex text-gray-400 hover:text-gray-600 notification-close-btn">
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    // Автоматически удаляем через 5 секунд
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  async startMassParsing() {
    try {
      // Получаем выбранный сегмент
      const selectedSegmentId = this.filters.segmentId;
      
      if (!selectedSegmentId) {
        this.showNotification('Выберите сегмент для массового парсинга', 'error');
        return;
      }

      // Находим сегмент и его URL фильтра Avito
      const segment = this.segments.find(s => s.id == selectedSegmentId);
      
      if (!segment || !segment.avito_filter_url) {
        this.showNotification('У выбранного сегмента не указана ссылка фильтра Avito', 'error');
        return;
      }

      this.showNotification(`Запуск массового парсинга сегмента "${segment.name}"...`, 'info');

      // Открываем новую вкладку с URL фильтра Avito
      chrome.tabs.create({ url: segment.avito_filter_url }, async (newTab) => {
        this.showNotification('Открыта страница фильтра Avito. Ожидание загрузки...', 'info');
        
        // Ждем загрузки страницы и принудительно инжектируем content script
        await this.waitForPageLoad(newTab.id);
        await this.injectContentScript(newTab.id);
        
        // Ждем загрузки страницы и запускаем парсинг
        this.waitForContentScriptAndParse(newTab.id, {
          segmentId: selectedSegmentId,
          segmentName: segment.name,
          maxPages: 200, // Очень большой лимит прокруток для сбора всех объявлений
          delay: 2000,   // Уменьшаем задержку для быстроты
          avitoFilterUrl: segment.avito_filter_url,
          listingsContainer: '.styles-container-rnTvX',
          listingSelector: '.styles-snippet-ZgKUd',
          linkSelector: 'a[href*="/kvartiry/"]'
        }).then(response => {
            if (response && response.success) {
              this.showNotification('Массовый парсинг запущен успешно!', 'success');
              
              // Обновляем данные каждые 15 секунд во время парсинга
              const updateInterval = setInterval(async () => {
                await this.loadData();
                this.updateUI();
              }, 15000);

              // Останавливаем обновления через 10 минут
              setTimeout(() => {
                clearInterval(updateInterval);
                this.showNotification('Автообновление данных остановлено', 'info');
              }, 600000);

            } else {
              this.showNotification('Не удалось запустить массовый парсинг: ' + (response?.error || 'Неизвестная ошибка'), 'error');
            }
        }).catch(error => {
          console.error('Ошибка инициации массового парсинга:', error);
          this.showNotification('Ошибка связи со страницей Avito: ' + error.message, 'error');
        });
      });

    } catch (error) {
      console.error('Ошибка массового парсинга:', error);
      this.showNotification('Ошибка при запуске массового парсинга: ' + error.message, 'error');
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
      console.log('Принудительная инжекция content script...');
      
      // Инжектируем зависимости
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['data/database.js']
      });
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: []
      });
      
      // Инжектируем основной парсер
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content-scripts/avito-parser.js']
      });
      
      console.log('Content script успешно инжектирован');
      
      // Дополнительная задержка для инициализации
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error('Ошибка инжекции content script:', error);
      throw error;
    }
  }

  /**
   * Ожидание готовности content script и запуск парсинга
   */
  async waitForContentScriptAndParse(tabId, settings) {
    const maxAttempts = 10; // Уменьшаем количество попыток, так как принудительно инжектируем
    const attemptDelay = 2000; // Увеличиваем задержку
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Попытка ${attempt}/${maxAttempts} связаться с content script...`);
        
        // Пытаемся отправить сообщение
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'startMassParsing',
          settings: settings
        });
        
        // Если получили ответ, возвращаем его
        console.log('Content script ответил:', response);
        return response;
        
      } catch (error) {
        console.log(`Попытка ${attempt} неудачна:`, error.message);
        
        if (attempt === maxAttempts) {
          // Последняя попытка - возвращаем ошибку
          throw new Error(`Не удалось связаться с content script после ${maxAttempts} попыток: ${error.message}`);
        }
        
        // Ждем перед следующей попыткой
        await new Promise(resolve => setTimeout(resolve, attemptDelay));
      }
    }
  }
}

// Класс доступен глобально для инициализации из reports_init.js
window.ReportsPage = ReportsPage;