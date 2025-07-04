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
      // Инициализируем базу данных
      await db.init();

      // Инициализируем интерфейс
      this.initializeUI();

      // Загружаем данные
      await this.loadData();

      // Показываем приветствие при первом запуске
      this.checkFirstRun();

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
        url: 'https://cdn.datatables.net/plug-ins/1.11.5/i18n/ru.json'
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
        url: 'https://cdn.datatables.net/plug-ins/1.11.5/i18n/ru.json'
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
    document.getElementById('createMapAreaBtn')?.addEventListener('click', () => {
      this.openMapAreaModal();
    });

    document.getElementById('createMapAreaBtn2')?.addEventListener('click', () => {
      this.openMapAreaModal();
    });

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
    document.getElementById('cancelDelete').addEventListener('click', () => {
      this.closeDeleteModal();
    });

    document.getElementById('confirmDelete').addEventListener('click', () => {
      this.handleDeleteConfirm();
    });

    // Закрытие приветствия
    document.getElementById('dismissWelcome').addEventListener('click', () => {
      this.dismissWelcome();
    });

    // Обработчики для кнопок действий в таблице (используем делегирование событий)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('action-btn')) {
        const segmentId = e.target.getAttribute('data-segment-id');
        const action = e.target.getAttribute('data-action');

        switch (action) {
          case 'reports':
            this.openReports(segmentId);
            break;
          case 'edit':
            this.editSegment(segmentId);
            break;
          case 'delete':
            this.deleteSegment(segmentId);
            break;
        }
      }
    });

    // Закрытие модальных окон по клику на backdrop
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        this.closeAllModals();
      }
    });

    // ESC для закрытия модальных окон
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Предотвращаем закрытие модального окна при клике внутри содержимого
    document.addEventListener('click', (e) => {
      if (e.target.closest('.modal-content')) {
        e.stopPropagation();
      }
      
      // Notification close button clicks
      if (e.target.closest('.notification-close-btn')) {
        const notification = e.target.closest('.notification-close-btn').parentElement.parentElement;
        if (notification) {
          notification.remove();
        }
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
    const refreshBtn = document.getElementById('refreshSegments');
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

  updateSegmentsTable() {
    if (!this.segmentsTable) {
      console.error('Таблица не инициализирована');
      return;
    }

    // Очищаем и добавляем новые данные
    this.segmentsTable.clear();
    this.segmentsTable.rows.add(this.segments);
    this.segmentsTable.draw();
  }

  renderSegmentName(segment) {
    const sources = [];
    if (segment.avito_filter_url) sources.push('Avito');
    if (segment.cian_filter_url) sources.push('Cian');

    return `
      <div>
        <div class="font-medium text-gray-900">${this.escapeHtml(segment.name)}</div>
        <div class="text-sm text-gray-500">Источники: ${sources.join(', ')}</div>
      </div>
    `;
  }

  renderActions(segment) {
    return `
      <div class="flex justify-end space-x-2">
        <button class="action-btn reports-btn text-blue-600 hover:text-blue-900 text-sm font-medium" data-segment-id="${segment.id}" data-action="reports">
          Отчеты
        </button>
        <button class="action-btn edit-btn text-indigo-600 hover:text-indigo-900 text-sm font-medium" data-segment-id="${segment.id}" data-action="edit">
          Изменить
        </button>
        <button class="action-btn delete-btn text-red-600 hover:text-red-900 text-sm font-medium" data-segment-id="${segment.id}" data-action="delete">
          Удалить
        </button>
      </div>
    `;
  }

  async updateStatistics() {
    try {
      // Загружаем статистику для каждого сегмента
      let totalActiveListings = 0;
      let totalObjects = 0;
      let totalNeedsProcessing = 0;

      for (const segment of this.segments) {
        const listings = await db.getListingsBySegment(segment.id);
        const objects = await db.getAll('objects', 'segment_id', segment.id);

        const activeListings = listings.filter(l => l.status === 'active').length;
        const needsProcessing = listings.filter(l => l.status === 'needs_processing').length;

        totalActiveListings += activeListings;
        totalObjects += objects.length;
        totalNeedsProcessing += needsProcessing;

        // Обновляем счетчики в таблице
        setTimeout(() => {
          const listingCountEl = document.querySelector(`[data-segment-id="${segment.id}"][data-type="listings"]`);
          if (listingCountEl) {
            listingCountEl.textContent = listings.length;
            listingCountEl.className = listingCountEl.className.replace('loading-count', '');
          }

          const objectCountEl = document.querySelector(`[data-segment-id="${segment.id}"][data-type="objects"]`);
          if (objectCountEl) {
            objectCountEl.textContent = objects.length;
            objectCountEl.className = objectCountEl.className.replace('loading-count', '');
          }
        }, 100); // Небольшая задержка, чтобы DataTables успел отрендерить
      }

      // Обновляем общую статистику
      document.getElementById('totalSegments').textContent = this.segments.length;
      document.getElementById('activeListings').textContent = totalActiveListings;
      document.getElementById('totalObjects').textContent = totalObjects;
      document.getElementById('needsProcessing').textContent = totalNeedsProcessing;

    } catch (error) {
      console.error('Ошибка обновления статистики:', error);
    }
  }

  // Управление сегментами
  openSegmentModal(segment = null) {
    this.isEditing = !!segment;
    this.currentSegmentId = segment ? segment.id : null;

    const modal = document.getElementById('segmentModal');
    const form = document.getElementById('segmentForm');
    const title = document.getElementById('modalTitle');
    const submitBtn = document.getElementById('submitButtonText');

    // Сбрасываем форму
    form.reset();

    if (this.isEditing) {
      title.textContent = 'Редактировать сегмент';
      submitBtn.textContent = 'Сохранить';

      // Заполняем форму данными сегмента
      document.getElementById('segmentName').value = segment.name;
      document.getElementById('avitoUrl').value = segment.avito_filter_url || '';
      document.getElementById('cianUrl').value = segment.cian_filter_url || '';
    } else {
      title.textContent = 'Создать сегмент';
      submitBtn.textContent = 'Создать';
    }

    modal.classList.remove('hidden');
  }

  closeSegmentModal() {
    document.getElementById('segmentModal').classList.add('hidden');
    this.currentSegmentId = null;
    this.isEditing = false;
  }

  async handleSegmentSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const segmentData = {
      name: formData.get('name').trim(),
      avito_filter_url: formData.get('avito_filter_url').trim(),
      cian_filter_url: formData.get('cian_filter_url').trim()
    };

    // Валидация
    if (!segmentData.name) {
      this.showNotification('Название сегмента обязательно', 'error');
      return;
    }

    if (!segmentData.avito_filter_url && !segmentData.cian_filter_url) {
      this.showNotification('Необходимо указать хотя бы один URL фильтра', 'error');
      return;
    }

    try {
      if (this.isEditing) {
        // Обновляем существующий сегмент
        segmentData.id = this.currentSegmentId;
        await db.updateSegment(segmentData);
        this.showNotification('Сегмент обновлен', 'success');
      } else {
        // Создаем новый сегмент
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

  editSegment(segmentId) {
    const segment = this.segments.find(s => s.id === segmentId);
    if (segment) {
      this.openSegmentModal(segment);
    }
  }

  deleteSegment(segmentId) {
    const segment = this.segments.find(s => s.id === segmentId);
    if (segment) {
      document.getElementById('deleteSegmentName').textContent = segment.name;
      this.currentSegmentId = segmentId;
      document.getElementById('deleteModal').classList.remove('hidden');
    }
  }

  closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
    this.currentSegmentId = null;
  }

  async handleDeleteConfirm() {
    if (!this.currentSegmentId) return;

    try {
      await db.deleteSegment(this.currentSegmentId);
      this.showNotification('Сегмент удален', 'success');
      this.closeDeleteModal();
      await this.loadData();
    } catch (error) {
      console.error('Ошибка удаления сегмента:', error);
      this.showNotification('Ошибка удаления сегмента', 'error');
    }
  }

  openReports(segmentId) {
    // Переходим на страницу отчетов с выбранным сегментом
    window.location.href = `reports.html?segment=${segmentId}`;
  }

  closeAllModals() {
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

    if (isWelcome === 'true' || this.segments.length === 0) {
      document.getElementById('welcomeSection').classList.remove('hidden');
    }
  }

  dismissWelcome() {
    document.getElementById('welcomeSection').classList.add('hidden');

    // Удаляем параметр welcome из URL
    const url = new URL(window.location);
    url.searchParams.delete('welcome');
    window.history.replaceState({}, '', url);
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
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