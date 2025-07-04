/**
 * JavaScript для главной страницы управления областями и сегментами
 */

class MainPage {
  constructor() {
    this.mapAreasTable = null;
    this.segmentsTable = null;
    this.mapAreas = [];
    this.segments = [];
    this.currentMapAreaId = null;
    this.currentSegmentId = null;
    this.isEditingMapArea = false;
    this.isEditingSegment = false;
  }

  async init() {
    try {
      debugLogger.log('MainPage init начался');
      
      // Инициализируем базу данных
      debugLogger.log('Инициализируем базу данных...');
      await db.init();
      debugLogger.log('База данных инициализирована');

      // Инициализируем интерфейс
      debugLogger.log('Инициализируем интерфейс...');
      this.initializeUI();
      debugLogger.log('Интерфейс инициализирован');

      // Загружаем данные
      debugLogger.log('Загружаем данные...');
      await this.loadData();
      debugLogger.log('Данные загружены');

      // Показываем приветствие при первом запуске
      this.checkFirstRun();

      debugLogger.log('MainPage init завершён успешно');
    } catch (error) {
      console.error('Ошибка инициализации:', error);
      this.showNotification('Ошибка инициализации приложения', 'error');
    }
  }

  initializeUI() {
    // Инициализируем таблицы
    this.initializeMapAreasTable();
    this.initializeSegmentsTable();

    // Настраиваем обработчики событий
    this.setupEventListeners();
  }

  initializeMapAreasTable() {
    // Проверяем, что jQuery и DataTables доступны
    if (typeof $ === 'undefined' || !$.fn.DataTable) {
      console.error('jQuery или DataTables не загружены');
      return;
    }

    this.mapAreasTable = $('#mapAreasTable').DataTable({
      data: [],
      columns: [
        {
          title: 'Название',
          data: null,
          render: (data, type, row) => this.renderMapAreaName(row)
        },
        {
          title: 'Сегментов',
          data: null,
          render: (data, type, row) => `<span class="loading-count" data-area-id="${row.id}" data-type="segments">-</span>`,
          className: 'text-center'
        },
        {
          title: 'Адресов',
          data: null,
          render: (data, type, row) => `<span class="loading-count" data-area-id="${row.id}" data-type="addresses">-</span>`,
          className: 'text-center'
        },
        {
          title: 'Создана',
          data: 'created_at',
          render: (data, type, row) => this.formatDate(data)
        },
        {
          title: 'Действия',
          data: null,
          render: (data, type, row) => this.renderMapAreaActions(row),
          orderable: false,
          className: 'text-right'
        }
      ],
      language: {
        url: '../libs/datatables/ru.json'
      },
      order: [[3, 'desc']], // Сортировка по дате создания
      pageLength: 10,
      responsive: true,
      autoWidth: false,
      searching: true,
      paging: true,
      info: true
    });
  }

  initializeSegmentsTable() {
    this.segmentsTable = $('#segmentsTable').DataTable({
      data: [],
      columns: [
        {
          title: 'Название',
          data: null,
          render: (data, type, row) => this.renderSegmentName(row)
        },
        {
          title: 'Область',
          data: null,
          render: (data, type, row) => this.renderSegmentMapArea(row)
        },
        {
          title: 'Подсегментов',
          data: null,
          render: (data, type, row) => `<span class="loading-count" data-segment-id="${row.id}" data-type="subsegments">-</span>`,
          className: 'text-center'
        },
        {
          title: 'Создан',
          data: 'created_at',
          render: (data, type, row) => this.formatDate(data)
        },
        {
          title: 'Действия',
          data: null,
          render: (data, type, row) => this.renderSegmentActions(row),
          orderable: false,
          className: 'text-right'
        }
      ],
      language: {
        url: '../libs/datatables/ru.json'
      },
      order: [[3, 'desc']], // Сортировка по дате создания
      pageLength: 10,
      responsive: true,
      autoWidth: false,
      searching: true,
      paging: true,
      info: true
    });
  }

  setupEventListeners() {
    // Кнопки управления областями
    const createMapAreaBtn = document.getElementById('createMapAreaBtn');
    if (createMapAreaBtn) {
      createMapAreaBtn.addEventListener('click', () => {
        debugLogger.log('Кнопка createMapAreaBtn нажата');
        this.openMapAreaModal();
      });
      debugLogger.log('Обработчик события для createMapAreaBtn установлен');
    } else {
      debugLogger.error('Кнопка createMapAreaBtn не найдена при настройке обработчиков');
    }

    // Кнопки управления сегментами
    document.getElementById('createSegmentBtn')?.addEventListener('click', () => {
      this.openSegmentModal();
    });

    document.getElementById('refreshData')?.addEventListener('click', () => {
      this.refreshData();
    });

    // Модальные окна областей
    document.getElementById('cancelMapAreaModal')?.addEventListener('click', () => {
      this.closeMapAreaModal();
    });

    document.getElementById('mapAreaForm')?.addEventListener('submit', (e) => {
      this.handleMapAreaSubmit(e);
    });

    // Модальное окно сегмента
    document.getElementById('cancelModal')?.addEventListener('click', () => {
      this.closeSegmentModal();
    });

    document.getElementById('segmentForm')?.addEventListener('submit', (e) => {
      this.handleSegmentSubmit(e);
    });

    // Модальное окно удаления
    document.getElementById('cancelDelete')?.addEventListener('click', () => {
      this.closeDeleteModal();
    });

    document.getElementById('confirmDelete')?.addEventListener('click', () => {
      this.handleDeleteConfirm();
    });

    // Закрытие приветствия
    document.getElementById('dismissWelcome')?.addEventListener('click', () => {
      this.dismissWelcome();
    });

    // Обработчики для кнопок действий в таблице (делегирование событий)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('action-btn')) {
        const areaId = e.target.getAttribute('data-area-id');
        const segmentId = e.target.getAttribute('data-segment-id');
        const action = e.target.getAttribute('data-action');

        if (areaId) {
          this.handleMapAreaAction(areaId, action);
        } else if (segmentId) {
          this.handleSegmentAction(segmentId, action);
        }
      }
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

  async loadData() {
    try {
      // Загружаем области и сегменты
      this.mapAreas = await db.getMapAreas();
      this.segments = await db.getSegments();

      // Обновляем таблицы
      this.updateMapAreasTable();
      this.updateSegmentsTable();

      // Обновляем статистику
      await this.updateStatistics();

      // Заполняем выпадающий список областей в форме сегмента
      this.populateMapAreasSelect();

    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      this.showNotification('Ошибка загрузки данных', 'error');
    }
  }

  async refreshData() {
    const refreshBtn = document.getElementById('refreshData');
    if (!refreshBtn) return;

    const originalText = refreshBtn.innerHTML;

    refreshBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Обновление...';
    refreshBtn.disabled = true;

    try {
      await this.loadData();
      this.showNotification('Данные обновлены', 'success');
    } catch (error) {
      this.showNotification('Ошибка обновления данных', 'error');
    } finally {
      refreshBtn.innerHTML = originalText;
      refreshBtn.disabled = false;
    }
  }

  updateMapAreasTable() {
    if (!this.mapAreasTable) return;

    this.mapAreasTable.clear();
    this.mapAreasTable.rows.add(this.mapAreas);
    this.mapAreasTable.draw();
  }

  updateSegmentsTable() {
    if (!this.segmentsTable) return;

    this.segmentsTable.clear();
    this.segmentsTable.rows.add(this.segments);
    this.segmentsTable.draw();
  }

  populateMapAreasSelect() {
    const select = document.getElementById('segmentMapArea');
    if (!select) return;

    // Очищаем опции, кроме первой
    select.innerHTML = '<option value="">Выберите область</option>';

    // Добавляем области
    this.mapAreas.forEach(area => {
      const option = document.createElement('option');
      option.value = area.id;
      option.textContent = area.name;
      select.appendChild(option);
    });
  }

  // Рендеринг строк таблиц
  renderMapAreaName(area) {
    const sources = [];
    if (area.avito_filter_url) sources.push('Avito');
    if (area.cian_filter_url) sources.push('Cian');

    const polygonStatus = area.polygon && area.polygon.length > 0 ? 
      '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Полигон задан</span>' :
      '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Полигон не задан</span>';

    return `
      <div>
        <div class="font-medium text-gray-900">${this.escapeHtml(area.name)}</div>
        <div class="text-sm text-gray-500 mt-1">
          ${polygonStatus}
          ${sources.length > 0 ? `<br>Источники: ${sources.join(', ')}` : ''}
        </div>
      </div>
    `;
  }

  renderSegmentName(segment) {
    const filters = [];
    if (segment.house_series) filters.push(`Серия: ${segment.house_series}`);
    if (segment.wall_material) filters.push(`Стены: ${segment.wall_material}`);
    if (segment.ceiling_material) filters.push(`Перекрытия: ${segment.ceiling_material}`);

    return `
      <div>
        <div class="font-medium text-gray-900">${this.escapeHtml(segment.name)}</div>
        ${filters.length > 0 ? `<div class="text-sm text-gray-500">${filters.join(', ')}</div>` : ''}
      </div>
    `;
  }

  renderSegmentMapArea(segment) {
    const area = this.mapAreas.find(a => a.id === segment.map_area_id);
    return area ? area.name : 'Область не найдена';
  }

  renderMapAreaActions(area) {
    return `
      <div class="flex justify-end space-x-2">
        <button class="action-btn text-blue-600 hover:text-blue-900 text-sm font-medium" data-area-id="${area.id}" data-action="view">
          Просмотреть
        </button>
        <button class="action-btn text-indigo-600 hover:text-indigo-900 text-sm font-medium" data-area-id="${area.id}" data-action="edit">
          Изменить
        </button>
        <button class="action-btn text-red-600 hover:text-red-900 text-sm font-medium" data-area-id="${area.id}" data-action="delete">
          Удалить
        </button>
      </div>
    `;
  }

  renderSegmentActions(segment) {
    return `
      <div class="flex justify-end space-x-2">
        <button class="action-btn text-blue-600 hover:text-blue-900 text-sm font-medium" data-segment-id="${segment.id}" data-action="view">
          Просмотреть
        </button>
        <button class="action-btn text-indigo-600 hover:text-indigo-900 text-sm font-medium" data-segment-id="${segment.id}" data-action="edit">
          Изменить
        </button>
        <button class="action-btn text-red-600 hover:text-red-900 text-sm font-medium" data-segment-id="${segment.id}" data-action="delete">
          Удалить
        </button>
      </div>
    `;
  }

  async updateStatistics() {
    try {
      // Загружаем все нужные данные
      const addresses = await db.getAddresses();

      // Считаем статистику по областям и сегментам
      for (const area of this.mapAreas) {
        const segments = await db.getSegmentsByMapArea(area.id);
        const areaAddresses = GeometryUtils ? GeometryUtils.getAddressesInMapArea(addresses, area) : [];
        
        // Обновляем счетчики в таблице областей
        setTimeout(() => {
          const segmentCountEl = document.querySelector(`[data-area-id="${area.id}"][data-type="segments"]`);
          if (segmentCountEl) {
            segmentCountEl.textContent = segments.length;
            segmentCountEl.className = segmentCountEl.className.replace('loading-count', '');
          }

          const addressCountEl = document.querySelector(`[data-area-id="${area.id}"][data-type="addresses"]`);
          if (addressCountEl) {
            addressCountEl.textContent = areaAddresses.length;
            addressCountEl.className = addressCountEl.className.replace('loading-count', '');
          }
        }, 100);
      }

      for (const segment of this.segments) {
        const subsegments = await db.getSubsegmentsBySegment(segment.id);
        
        // Обновляем счетчики в таблице сегментов
        setTimeout(() => {
          const subsegmentCountEl = document.querySelector(`[data-segment-id="${segment.id}"][data-type="subsegments"]`);
          if (subsegmentCountEl) {
            subsegmentCountEl.textContent = subsegments.length;
            subsegmentCountEl.className = subsegmentCountEl.className.replace('loading-count', '');
          }
        }, 100);
      }

      // Общая статистика
      document.getElementById('totalMapAreas').textContent = this.mapAreas.length;
      document.getElementById('totalSegments').textContent = this.segments.length;
      document.getElementById('totalObjects').textContent = '-'; // Будет реализовано позже
      document.getElementById('needsProcessing').textContent = '-'; // Будет реализовано позже

    } catch (error) {
      console.error('Ошибка обновления статистики:', error);
    }
  }

  // Управление областями
  openMapAreaModal(area = null) {
    debugLogger.log('openMapAreaModal вызван', area);
    this.isEditingMapArea = !!area;
    this.currentMapAreaId = area ? area.id : null;

    const modal = document.getElementById('mapAreaModal');
    const form = document.getElementById('mapAreaForm');
    const title = document.getElementById('mapAreaModalTitle');
    const submitBtn = document.getElementById('mapAreaSubmitButtonText');

    debugLogger.log('Элементы модального окна:', { modal, form, title, submitBtn });

    if (!modal || !form || !title || !submitBtn) {
      debugLogger.error('Не все элементы модального окна найдены');
      return;
    }

    form.reset();

    if (this.isEditingMapArea) {
      title.textContent = 'Редактировать область';
      submitBtn.textContent = 'Сохранить';

      document.getElementById('mapAreaName').value = area.name;
      document.getElementById('avitoUrlArea').value = area.avito_filter_url || '';
      document.getElementById('cianUrlArea').value = area.cian_filter_url || '';
    } else {
      title.textContent = 'Создать область на карте';
      submitBtn.textContent = 'Создать';
    }

    modal.classList.remove('hidden');
  }

  closeMapAreaModal() {
    document.getElementById('mapAreaModal')?.classList.add('hidden');
    this.currentMapAreaId = null;
    this.isEditingMapArea = false;
  }

  async handleMapAreaSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const areaData = {
      name: formData.get('name').trim(),
      avito_filter_url: formData.get('avito_filter_url').trim(),
      cian_filter_url: formData.get('cian_filter_url').trim(),
      polygon: [] // Полигон будет задан позже на странице области
    };

    // Валидация
    if (!areaData.name) {
      this.showNotification('Название области обязательно', 'error');
      return;
    }

    try {
      if (this.isEditingMapArea) {
        areaData.id = this.currentMapAreaId;
        await db.updateMapArea(areaData);
        this.showNotification('Область обновлена', 'success');
      } else {
        await db.addMapArea(areaData);
        this.showNotification('Область создана', 'success');
      }

      this.closeMapAreaModal();
      await this.loadData();

    } catch (error) {
      console.error('Ошибка сохранения области:', error);
      this.showNotification('Ошибка сохранения области', 'error');
    }
  }

  // Управление сегментами
  openSegmentModal(segment = null) {
    this.isEditingSegment = !!segment;
    this.currentSegmentId = segment ? segment.id : null;

    const modal = document.getElementById('segmentModal');
    const form = document.getElementById('segmentForm');
    const title = document.getElementById('modalTitle');
    const submitBtn = document.getElementById('submitButtonText');

    if (!modal || !form || !title || !submitBtn) return;

    form.reset();

    if (this.isEditingSegment) {
      title.textContent = 'Редактировать сегмент';
      submitBtn.textContent = 'Сохранить';

      document.getElementById('segmentName').value = segment.name;
      document.getElementById('segmentMapArea').value = segment.map_area_id || '';
      document.getElementById('houseSeries').value = segment.house_series || '';
      document.getElementById('ceilingMaterial').value = segment.ceiling_material || '';
      document.getElementById('wallMaterial').value = segment.wall_material || '';
    } else {
      title.textContent = 'Создать сегмент';
      submitBtn.textContent = 'Создать';
    }

    modal.classList.remove('hidden');
  }

  closeSegmentModal() {
    document.getElementById('segmentModal')?.classList.add('hidden');
    this.currentSegmentId = null;
    this.isEditingSegment = false;
  }

  async handleSegmentSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const segmentData = {
      name: formData.get('name').trim(),
      map_area_id: formData.get('map_area_id'),
      house_series: formData.get('house_series').trim(),
      ceiling_material: formData.get('ceiling_material').trim(),
      wall_material: formData.get('wall_material').trim()
    };

    // Валидация
    if (!segmentData.name) {
      this.showNotification('Название сегмента обязательно', 'error');
      return;
    }

    if (!segmentData.map_area_id) {
      this.showNotification('Необходимо выбрать область', 'error');
      return;
    }

    try {
      if (this.isEditingSegment) {
        segmentData.id = this.currentSegmentId;
        await db.updateSegment(segmentData);
        this.showNotification('Сегмент обновлен', 'success');
      } else {
        await db.addSegment(segmentData);
        this.showNotification('Сегмент создан', 'success');
      }

      this.closeSegmentModal();
      await this.loadData();

    } catch (error) {
      console.error('Ошибка сохранения сегмента:', error);
      this.showNotification('Ошибка сохранения сегмента', 'error');
    }
  }

  // Обработчики действий
  handleMapAreaAction(areaId, action) {
    const area = this.mapAreas.find(a => a.id === areaId);
    if (!area) return;

    switch (action) {
      case 'view':
        this.viewMapArea(areaId);
        break;
      case 'edit':
        this.openMapAreaModal(area);
        break;
      case 'delete':
        this.deleteItem(areaId, 'area', area.name);
        break;
    }
  }

  handleSegmentAction(segmentId, action) {
    const segment = this.segments.find(s => s.id === segmentId);
    if (!segment) return;

    switch (action) {
      case 'view':
        this.viewSegment(segmentId);
        break;
      case 'edit':
        this.openSegmentModal(segment);
        break;
      case 'delete':
        this.deleteItem(segmentId, 'segment', segment.name);
        break;
    }
  }

  viewMapArea(areaId) {
    window.location.href = `area.html?id=${areaId}`;
  }

  viewSegment(segmentId) {
    window.location.href = `segment.html?id=${segmentId}`;
  }

  deleteItem(itemId, type, name) {
    document.getElementById('deleteSegmentName').textContent = name;
    this.currentItemToDelete = { id: itemId, type: type };
    document.getElementById('deleteModal').classList.remove('hidden');
  }

  closeDeleteModal() {
    document.getElementById('deleteModal')?.classList.add('hidden');
    this.currentItemToDelete = null;
  }

  async handleDeleteConfirm() {
    if (!this.currentItemToDelete) return;

    try {
      const { id, type } = this.currentItemToDelete;
      
      if (type === 'area') {
        await db.deleteMapArea(id);
        this.showNotification('Область удалена', 'success');
      } else if (type === 'segment') {
        await db.deleteSegment(id);
        this.showNotification('Сегмент удален', 'success');
      }

      this.closeDeleteModal();
      await this.loadData();

    } catch (error) {
      console.error('Ошибка удаления:', error);
      this.showNotification('Ошибка удаления', 'error');
    }
  }

  closeAllModals() {
    this.closeMapAreaModal();
    this.closeSegmentModal();
    this.closeDeleteModal();
  }

  // Утилиты
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  checkFirstRun() {
    const urlParams = new URLSearchParams(window.location.search);
    const isWelcome = urlParams.get('welcome');

    if (isWelcome === 'true' || (this.mapAreas.length === 0 && this.segments.length === 0)) {
      document.getElementById('welcomeSection')?.classList.remove('hidden');
    }
  }

  dismissWelcome() {
    document.getElementById('welcomeSection')?.classList.add('hidden');

    const url = new URL(window.location);
    url.searchParams.delete('welcome');
    window.history.replaceState({}, '', url);
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

// Класс доступен глобально для инициализации из main_init.js
window.MainPage = MainPage;