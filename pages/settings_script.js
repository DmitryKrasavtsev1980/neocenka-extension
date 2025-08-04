/**
 * JavaScript для страницы настроек
 */

class SettingsPage {
  constructor() {
    this.settings = {};
    this.subscription = null;
    this.serviceManager = null;
    this.inparsService = null;
    this.init();
  }

  async init() {
    try {
      // Инициализируем базу данных
      await db.init();
      
      // Инициализируем сервисную архитектуру
      await this.initializeServices();
      
      // Инициализируем интерфейс
      this.initializeUI();
      
      // Загружаем настройки
      await this.loadSettings();
      
      // Загружаем статистику
      await this.loadDatabaseStats();
      
      // Загружаем данные подписки
      await this.loadSubscriptionInfo();
      
      // Инициализируем ML алгоритм если не загружен
      await this.initializeMLMatcher();
      
      // Загружаем ML статистику при инициализации
      setTimeout(() => this.refreshMLStats(), 1000);
      
      // Выводим подробную информацию о сохраненных данных обучения
      setTimeout(() => this.displayTrainingDataInfo(), 1500);
      
    } catch (error) {
      console.error('Ошибка инициализации:', error);
      this.showNotification('Ошибка инициализации страницы', 'error');
    }
  }

  /**
   * Инициализация сервисной архитектуры
   */
  async initializeServices() {
    try {
      console.log('🚀 Initializing services in settings...');
      
      // Сначала инициализируем сервисы
      this.serviceManager = await ServiceConfig.initializeServices();
      console.log('✅ ServiceManager initialized in settings');
      
      // Получаем сервис Inpars
      this.inparsService = this.serviceManager.getService('inpars');
      console.log('📋 InparsService ready in settings:', this.inparsService?.status);
      
    } catch (error) {
      console.error('❌ Failed to initialize services in settings:', error);
      // Не блокируем загрузку настроек при ошибке сервисов
    }
  }

  initializeUI() {
    // Настраиваем обработчики событий
    this.setupEventListeners();
    
    // Обновляем текущее время (только если элемент существует)
    if (document.getElementById('currentDateTime')) {
      this.updateDateTime();
      setInterval(() => this.updateDateTime(), 60000);
    }
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
    const dateTimeElement = document.getElementById('currentDateTime');
    if (dateTimeElement) {
      dateTimeElement.textContent = now.toLocaleDateString('ru-RU', options);
    }
  }

  setupEventListeners() {
    // Сохранение настроек
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Полный экспорт данных
    document.getElementById('fullExportBtn').addEventListener('click', () => {
      this.fullExportData();
    });

    // Полный импорт данных
    document.getElementById('fullImportBtn').addEventListener('click', () => {
      this.fullImportData();
    });

    document.getElementById('fullImportFileInput').addEventListener('change', (e) => {
      this.handleFullImportFile(e);
    });

    // Быстрые кнопки выбора экспорта
    document.getElementById('selectAllExport').addEventListener('click', () => {
      this.setAllExportCheckboxes(true);
    });

    document.getElementById('selectNoneExport').addEventListener('click', () => {
      this.setAllExportCheckboxes(false);
    });

    document.getElementById('selectAddressesOnly').addEventListener('click', () => {
      this.setAddressesOnlyExport();
    });

    // Обработка дублей
    document.getElementById('processDuplicatesBtn').addEventListener('click', () => {
      this.processDuplicates();
    });

    // Очистка данных
    document.getElementById('clearDataBtn').addEventListener('click', () => {
      this.showClearDataModal();
    });

    // Переключение отладки
    document.getElementById('debugMode').addEventListener('change', (e) => {
      this.toggleDebugMode(e.target.checked);
    });

    document.getElementById('confirmClearData').addEventListener('click', () => {
      this.clearAllData();
    });

    document.getElementById('cancelClearData').addEventListener('click', () => {
      this.hideClearDataModal();
    });

    // Синхронизация
    document.getElementById('syncEnabled').addEventListener('change', (e) => {
      this.toggleSyncSettings(e.target.checked);
    });

    document.getElementById('generateSyncKey').addEventListener('click', () => {
      this.generateSyncKey();
    });

    // Проверка подписки
    document.getElementById('checkSubscriptionBtn').addEventListener('click', () => {
      this.checkSubscription();
    });

    // Inpars интеграция
    document.getElementById('saveInparsToken').addEventListener('click', () => {
      this.saveInparsToken();
    });

    document.getElementById('checkInparsSubscription').addEventListener('click', () => {
      this.checkInparsSubscription();
    });

    document.getElementById('importInparsCategories').addEventListener('click', () => {
      this.importInparsCategories();
    });

    document.getElementById('sourceAvito').addEventListener('change', (e) => {
      this.saveInparsSources();
    });

    document.getElementById('sourceCian').addEventListener('change', (e) => {
      this.saveInparsSources();
    });

    // ML-модель
    document.getElementById('refreshMLStats').addEventListener('click', () => {
      this.refreshMLStats();
    });

    document.getElementById('exportMLModel').addEventListener('click', () => {
      this.exportMLModel();
    });

    document.getElementById('copyMLModel').addEventListener('click', () => {
      this.copyMLModel();
    });

    document.getElementById('analyzeTrainingData').addEventListener('click', () => {
      this.displayTrainingDataInfo();
    });

    // Закрытие модальных окон по клику вне их
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('fixed') && e.target.classList.contains('inset-0')) {
        this.hideClearDataModal();
      }
    });

    // ESC для закрытия модальных окон
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideClearDataModal();
      }
    });
  }

  async loadSettings() {
    try {
      // Загружаем все настройки
      const settingsKeys = [
        'parsing_delay_avito',
        'parsing_delay_cian',
        'update_days',
        'auto_process_duplicates',
        'auto_archive_listings',
        'sync_enabled',
        'sync_key',
        'api_key',
        'debug_mode',
        'inpars_api_token',
        'inpars_source_avito',
        'inpars_source_cian'
      ];

      for (const key of settingsKeys) {
        const value = await db.getSetting(key);
        this.settings[key] = value;
      }

      // Заполняем форму
      this.populateSettingsForm();

    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
      this.showNotification('Ошибка загрузки настроек', 'error');
    }
  }

  populateSettingsForm() {
    // Задержки парсинга
    document.getElementById('avitoDelay').value = this.settings.parsing_delay_avito || 30;
    document.getElementById('cianDelay').value = this.settings.parsing_delay_cian || 30;
    document.getElementById('updateDays').value = this.settings.update_days || 7;

    // Чекбоксы
    document.getElementById('autoProcessDuplicates').checked = this.settings.auto_process_duplicates || false;
    document.getElementById('autoArchive').checked = this.settings.auto_archive_listings || false;
    document.getElementById('syncEnabled').checked = this.settings.sync_enabled || false;
    document.getElementById('debugMode').checked = this.settings.debug_mode || false;

    // Ключ синхронизации
    document.getElementById('syncKey').value = this.settings.sync_key || '';

    // API ключ
    document.getElementById('apiKey').value = this.settings.api_key || '';

    // Inpars настройки
    document.getElementById('inparsToken').value = this.settings.inpars_api_token || '';
    document.getElementById('sourceAvito').checked = this.settings.inpars_source_avito !== false; // по умолчанию true
    document.getElementById('sourceCian').checked = this.settings.inpars_source_cian !== false; // по умолчанию true

    // Показываем/скрываем настройки синхронизации
    this.toggleSyncSettings(this.settings.sync_enabled || false);

    // Загружаем статус подписки Inpars если есть токен
    if (this.settings.inpars_api_token) {
      this.loadInparsSubscription();
    }
  }

  async saveSettings() {
    try {
      const saveBtn = document.getElementById('saveSettingsBtn');
      const originalText = saveBtn.innerHTML;
      
      saveBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Сохранение...';
      saveBtn.disabled = true;

      // Собираем данные из формы
      const formData = new FormData(document.getElementById('settingsForm'));
      
      const newSettings = {
        parsing_delay_avito: parseInt(formData.get('parsing_delay_avito')) || 30,
        parsing_delay_cian: parseInt(formData.get('parsing_delay_cian')) || 30,
        update_days: parseInt(formData.get('update_days')) || 7,
        auto_process_duplicates: document.getElementById('autoProcessDuplicates').checked,
        auto_archive_listings: document.getElementById('autoArchive').checked,
        sync_enabled: document.getElementById('syncEnabled').checked,
        sync_key: document.getElementById('syncKey').value.trim(),
        api_key: document.getElementById('apiKey').value.trim(),
        debug_mode: document.getElementById('debugMode').checked
      };

      // Валидация
      if (newSettings.parsing_delay_avito < 10 || newSettings.parsing_delay_avito > 300) {
        throw new Error('Задержка для Avito должна быть от 10 до 300 секунд');
      }

      if (newSettings.parsing_delay_cian < 10 || newSettings.parsing_delay_cian > 300) {
        throw new Error('Задержка для Cian должна быть от 10 до 300 секунд');
      }

      if (newSettings.update_days < 1 || newSettings.update_days > 365) {
        throw new Error('Количество дней для обновления должно быть от 1 до 365');
      }

      if (newSettings.sync_enabled && !newSettings.sync_key) {
        throw new Error('Для синхронизации необходимо указать ключ');
      }

      // Сохраняем настройки
      for (const [key, value] of Object.entries(newSettings)) {
        await db.setSetting(key, value);
        this.settings[key] = value;
      }

      this.showNotification('Настройки сохранены', 'success');

    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      this.showNotification(error.message, 'error');
    } finally {
      const saveBtn = document.getElementById('saveSettingsBtn');
      saveBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Сохранить настройки';
      saveBtn.disabled = false;
    }
  }

  async loadDatabaseStats() {
    try {
      const segments = await db.getAll('segments');
      const listings = await db.getAll('listings');
      const objects = await db.getAll('objects');
      const reports = await db.getAll('reports');

      document.getElementById('statsSegments').textContent = segments.length;
      document.getElementById('statsListings').textContent = listings.length;
      document.getElementById('statsObjects').textContent = objects.length;
      document.getElementById('statsReports').textContent = reports.length;

    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  }

  /**
   * Экспорт выбранных блоков данных
   */
  async fullExportData() {
    try {
      const exportBtn = document.getElementById('fullExportBtn');
      const statusDiv = document.getElementById('fullExportStatus');
      const originalText = exportBtn.innerHTML;
      
      // Получаем выбранные опции экспорта
      const exportOptions = this.getExportOptions();
      
      // Проверяем, что что-то выбрано
      const hasSelection = Object.values(exportOptions).some(value => value === true);
      if (!hasSelection) {
        this.showNotification('Выберите хотя бы один блок данных для экспорта', 'warning');
        return;
      }
      
      exportBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 818-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Экспорт данных...';
      exportBtn.disabled = true;

      statusDiv.textContent = 'Экспортируем выбранные данные из базы...';
      statusDiv.classList.remove('hidden');

      // Используем новый метод выборочного экспорта
      const exportDataString = await db.selectiveExportData(exportOptions);
      
      statusDiv.textContent = 'Создаём файл для скачивания...';
      
      // Создаем файл для скачивания
      const blob = new Blob([exportDataString], { type: 'application/json; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const now = new Date();
      const selectedBlocks = Object.keys(exportOptions).filter(key => exportOptions[key]).join('-');
      const filename = `neocenka-export-${selectedBlocks}-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Показываем результат
      this.showSelectiveExportResult(JSON.parse(exportDataString));
      this.showNotification('Выбранные данные экспортированы', 'success');

    } catch (error) {
      console.error('Ошибка экспорта:', error);
      this.showNotification('Ошибка экспорта данных: ' + error.message, 'error');
      
      const statusDiv = document.getElementById('fullExportStatus');
      statusDiv.textContent = '❌ Ошибка экспорта: ' + error.message;
    } finally {
      const exportBtn = document.getElementById('fullExportBtn');
      exportBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>Экспорт выбранных данных';
      exportBtn.disabled = false;
    }
  }

  /**
   * Полный импорт данных
   */
  fullImportData() {
    document.getElementById('fullImportFileInput').click();
  }

  /**
   * Обработка файла полного импорта
   */
  async handleFullImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const importBtn = document.getElementById('fullImportBtn');
      const statusDiv = document.getElementById('fullImportStatus');
      const originalText = importBtn.innerHTML;
      
      importBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 818-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Импорт базы данных...';
      importBtn.disabled = true;

      statusDiv.textContent = 'Читаем файл...';
      statusDiv.classList.remove('hidden');

      // Читаем файл
      const fileContent = await this.readFileAsText(file);
      
      statusDiv.textContent = 'Валидируем данные...';

      // Предварительная валидация
      let previewData;
      try {
        previewData = JSON.parse(fileContent);
      } catch (error) {
        throw new Error('Некорректный формат JSON файла');
      }

      if (!previewData.application || previewData.application !== 'Neocenka Extension') {
        throw new Error('Файл не является экспортом Neocenka Extension');
      }

      // Показываем предварительную информацию и запрашиваем подтверждение
      const confirmImport = confirm(
        `⚠️ ВНИМАНИЕ! Это действие удалит все текущие данные!\n\n` +
        `Файл создан: ${previewData.timestamp ? new Date(previewData.timestamp).toLocaleString('ru-RU') : 'Неизвестно'}\n` +
        `Версия: ${previewData.version || 'Неизвестно'}\n\n` +
        `Будет импортировано:\n` +
        `📍 Областей: ${previewData.statistics?.total_map_areas || (previewData.map_areas?.length || 0)}\n` +
        `🏠 Адресов: ${previewData.statistics?.total_addresses || (previewData.addresses?.length || 0)}\n` +
        `📋 Сегментов: ${previewData.statistics?.total_segments || (previewData.segments?.length || 0)}\n` +
        `📊 Объявлений: ${previewData.statistics?.total_listings || (previewData.listings?.length || 0)}\n` +
        `🏢 Объектов: ${previewData.statistics?.total_objects || (previewData.objects?.length || 0)}\n` +
        `📈 Отчётов: ${previewData.statistics?.total_reports || (previewData.reports?.length || 0)}\n\n` +
        `Продолжить импорт?`
      );

      if (!confirmImport) {
        statusDiv.textContent = 'Импорт отменён пользователем';
        return;
      }

      statusDiv.textContent = 'Импортируем данные в базу...';

      // Выполняем полный импорт
      const result = await db.fullImportData(fileContent);
      
      if (result.success) {
        // Показываем результат
        this.showFullImportResult(result);
        
        // Обновляем статистику на странице
        await this.loadDatabaseStats();
        
        this.showNotification('База данных успешно импортирована', 'success');
        statusDiv.textContent = '✅ Импорт завершён успешно';
      } else {
        throw new Error('Импорт завершился с ошибками');
      }

    } catch (error) {
      console.error('Ошибка полного импорта:', error);
      this.showNotification('Ошибка импорта: ' + error.message, 'error');
      
      const statusDiv = document.getElementById('fullImportStatus');
      statusDiv.textContent = '❌ Ошибка импорта: ' + error.message;
    } finally {
      const importBtn = document.getElementById('fullImportBtn');
      importBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path></svg>Полный импорт базы данных';
      importBtn.disabled = false;
      
      // Очищаем input
      event.target.value = '';
    }
  }

  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const importBtn = document.getElementById('importDataBtn');
      const originalText = importBtn.innerHTML;
      
      importBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Импорт...';
      importBtn.disabled = true;

      const fileContent = await this.readFileAsText(file);
      
      // Валидируем JSON
      let importData;
      try {
        importData = JSON.parse(fileContent);
      } catch (error) {
        throw new Error('Некорректный формат файла');
      }

      // Проверяем структуру данных
      if (!importData.segments || !Array.isArray(importData.segments)) {
        throw new Error('Файл не содержит корректных данных Neocenka');
      }

      // Подтверждение импорта
      const confirmImport = confirm(
        `Вы собираетесь импортировать:\n` +
        `- Сегментов: ${importData.segments?.length || 0}\n` +
        `- Объявлений: ${importData.listings?.length || 0}\n` +
        `- Объектов: ${importData.objects?.length || 0}\n` +
        `- Отчетов: ${importData.reports?.length || 0}\n\n` +
        `Это может перезаписать существующие данные. Продолжить?`
      );

      if (!confirmImport) {
        return;
      }

      await db.importData(fileContent);
      
      // Обновляем статистику
      await this.loadDatabaseStats();
      
      this.showNotification('Данные успешно импортированы', 'success');

    } catch (error) {
      console.error('Ошибка импорта:', error);
      this.showNotification(error.message, 'error');
    } finally {
      const importBtn = document.getElementById('importDataBtn');
      importBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path></svg>Импорт данных';
      importBtn.disabled = false;
      
      // Очищаем input
      event.target.value = '';
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsText(file);
    });
  }

  async processDuplicates() {
    try {
      const processBtn = document.getElementById('processDuplicatesBtn');
      const originalText = processBtn.innerHTML;
      
      processBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Обработка...';
      processBtn.disabled = true;

      const segments = await db.getAll('segments');
      let totalProcessed = 0;
      let totalMerged = 0;
      let totalErrors = 0;

      for (const segment of segments) {
        try {
          // Отправляем сообщение background script для обработки дублей
          const response = await chrome.runtime.sendMessage({
            action: 'processSegmentDuplicates',
            segmentId: segment.id
          });

          if (response.success) {
            totalProcessed += response.result.processed || 0;
            totalMerged += response.result.merged || 0;
            totalErrors += response.result.errors || 0;
          } else {
            totalErrors++;
          }
        } catch (error) {
          console.error(`Ошибка обработки сегмента ${segment.name}:`, error);
          totalErrors++;
        }
      }

      // Обновляем статистику
      await this.loadDatabaseStats();

      const message = `Обработка завершена:\n` +
                     `- Обработано объявлений: ${totalProcessed}\n` +
                     `- Объединено дублей: ${totalMerged}\n` +
                     `- Ошибок: ${totalErrors}`;

      this.showNotification('Дубли обработаны', 'success');
      alert(message);

    } catch (error) {
      console.error('Ошибка обработки дублей:', error);
      this.showNotification('Ошибка обработки дублей', 'error');
    } finally {
      const processBtn = document.getElementById('processDuplicatesBtn');
      processBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2v0M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>Обработать дубли';
      processBtn.disabled = false;
    }
  }

  showClearDataModal() {
    document.getElementById('clearDataModal').classList.remove('hidden');
  }

  hideClearDataModal() {
    document.getElementById('clearDataModal').classList.add('hidden');
  }

  async clearAllData() {
    try {
      const confirmBtn = document.getElementById('confirmClearData');
      const originalText = confirmBtn.innerHTML;
      
      confirmBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Удаление...';
      confirmBtn.disabled = true;

      // Очищаем все таблицы
      const stores = ['segments', 'listings', 'objects', 'reports'];
      
      for (const storeName of stores) {
        const items = await db.getAll(storeName);
        for (const item of items) {
          await db.delete(storeName, item.id);
        }
      }

      this.hideClearDataModal();
      await this.loadDatabaseStats();
      
      this.showNotification('Все данные удалены', 'success');

    } catch (error) {
      console.error('Ошибка очистки данных:', error);
      this.showNotification('Ошибка очистки данных', 'error');
    } finally {
      const confirmBtn = document.getElementById('confirmClearData');
      confirmBtn.innerHTML = 'Удалить все данные';
      confirmBtn.disabled = false;
    }
  }

  toggleSyncSettings(enabled) {
    const syncKeyContainer = document.getElementById('syncKeyContainer');
    if (enabled) {
      syncKeyContainer.classList.remove('hidden');
    } else {
      syncKeyContainer.classList.add('hidden');
    }
  }

  generateSyncKey() {
    const key = this.generateRandomKey(32);
    document.getElementById('syncKey').value = key;
  }

  generateRandomKey(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async loadSubscriptionInfo() {
    try {
      // Загружаем сохраненные данные подписки
      const subscriptionData = await subscriptionService.loadSubscriptionData();
      
      if (subscriptionData && subscriptionData.subscription) {
        this.subscription = subscriptionData.subscription;
        this.updateSubscriptionUI(subscriptionData);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных подписки:', error);
    }
  }

  async checkSubscription() {
    try {
      const apiKey = document.getElementById('apiKey').value.trim();
      
      if (!apiKey) {
        this.showNotification('Введите API ключ', 'error');
        return;
      }

      const checkBtn = document.getElementById('checkSubscriptionBtn');
      const originalText = checkBtn.textContent;
      
      checkBtn.textContent = 'Проверка...';
      checkBtn.disabled = true;

      const result = await subscriptionService.checkSubscription(apiKey);

      if (result.success) {
        this.subscription = result.subscription;
        
        // Сохраняем API ключ в настройки
        await db.setSetting('api_key', apiKey);
        this.settings.api_key = apiKey;
        
        this.updateSubscriptionUI(result);
        this.showNotification('Подписка проверена успешно', 'success');
      } else {
        this.hideSubscriptionUI();
        this.showNotification(result.error || 'Ошибка проверки подписки', 'error');
      }

    } catch (error) {
      console.error('Ошибка проверки подписки:', error);
      this.showNotification('Ошибка проверки подписки', 'error');
    } finally {
      const checkBtn = document.getElementById('checkSubscriptionBtn');
      checkBtn.textContent = 'Проверить';
      checkBtn.disabled = false;
    }
  }

  updateSubscriptionUI(data) {
    const { subscription, user } = data;
    
    // Показываем блоки с информацией о подписке
    document.getElementById('subscriptionStatus').classList.remove('hidden');
    document.getElementById('subscriptionFeatures').classList.remove('hidden');

    // Обновляем статус
    const statusEl = document.getElementById('subscriptionStatusText');
    const planEl = document.getElementById('subscriptionPlan');
    const daysEl = document.getElementById('subscriptionDays');
    const requestsEl = document.getElementById('apiRequestsToday');

    if (subscription.active) {
      statusEl.textContent = 'Активна';
      statusEl.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800';
    } else {
      statusEl.textContent = 'Неактивна';
      statusEl.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800';
    }

    planEl.textContent = this.formatPlanName(subscription.plan);
    daysEl.textContent = subscription.days_remaining;
    
    if (subscription.usage) {
      requestsEl.textContent = `${subscription.usage.api_requests_today} / ${subscription.usage.api_requests_limit}`;
    }

    // Обновляем список функций
    this.updateFeaturesUI(subscription.features);
  }

  updateFeaturesUI(features) {
    const featureElements = document.querySelectorAll('#subscriptionFeatures .flex.items-center');
    
    featureElements.forEach((element, index) => {
      const icon = element.querySelector('svg');
      const span = element.querySelector('span');
      
      let isEnabled = false;
      
      switch (index) {
        case 0: // Парсинг данных
          isEnabled = features.parsing_enabled;
          break;
        case 1: // Расширенная аналитика
          isEnabled = features.analytics_enabled;
          break;
        case 2: // Экспорт данных
          isEnabled = features.export_enabled;
          break;
        case 3: // Уведомления
          isEnabled = features.notifications;
          break;
        case 4: // Отслеживание цен
          isEnabled = features.price_tracking;
          break;
        case 5: // Безлимитные сегменты
          isEnabled = features.segments_limit === -1;
          break;
      }

      if (isEnabled) {
        icon.className = 'h-4 w-4 text-green-500 mr-2';
        span.className = 'text-sm text-gray-700';
      } else {
        icon.className = 'h-4 w-4 text-gray-400 mr-2';
        span.className = 'text-sm text-gray-400';
      }
    });
  }

  hideSubscriptionUI() {
    document.getElementById('subscriptionStatus').classList.add('hidden');
    document.getElementById('subscriptionFeatures').classList.add('hidden');
  }

  formatPlanName(plan) {
    const plans = {
      'free': 'Бесплатный',
      'basic': 'Базовый',
      'premium': 'Премиум',
      'enterprise': 'Корпоративный'
    };
    return plans[plan] || plan;
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
        <button class="notification-close ml-3 text-sm opacity-70 hover:opacity-100">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
          </svg>
        </button>
      </div>
    `;
    
    // Добавляем обработчик для кнопки закрытия
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
      notification.remove();
    });
    
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

  /**
   * Переключает режим отладки
   * @param {boolean} enabled - включить/выключить отладку
   */
  async toggleDebugMode(enabled) {
    try {
      // Сохраняем настройку в базу данных
      await db.setSetting('debug_mode', enabled);
      
      // Сохраняем также в chrome.storage для доступа из content scripts
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ 'neocenka_debug_mode': enabled });
      }
      
      // Обновляем настройки в памяти
      this.settings.debug_mode = enabled;
      
      // Обновляем логгер, если он доступен
      if (window.debugLogger) {
        window.debugLogger.setDebugMode(enabled);
      }
      
      // Показываем уведомление
      const message = enabled ? 'Отладочные сообщения включены' : 'Отладочные сообщения выключены';
      this.showNotification(message, 'success');
      
      // Если отладка включена, выводим тестовое сообщение
      if (enabled && window.debugLogger) {
        window.debugLogger.log('Режим отладки активирован! Все отладочные сообщения будут выводиться в консоль.');
      }
      
    } catch (error) {
      console.error('Ошибка переключения режима отладки:', error);
      this.showNotification('Ошибка сохранения настройки отладки', 'error');
      
      // Возвращаем чекбокс в предыдущее состояние
      document.getElementById('debugMode').checked = !enabled;
    }
  }

  // ===== МЕТОДЫ ДЛЯ РАБОТЫ С INPARS =====

  /**
   * Сохранение токена API Inpars
   */
  async saveInparsToken() {
    try {
      const saveBtn = document.getElementById('saveInparsToken');
      const tokenInput = document.getElementById('inparsToken');
      const token = tokenInput.value.trim();

      if (!token) {
        this.showNotification('Введите токен API Inpars', 'error');
        return;
      }

      saveBtn.textContent = 'Сохранение...';
      saveBtn.disabled = true;

      // Сохраняем токен в базу данных
      await db.setSetting('inpars_api_token', token);
      this.settings.inpars_api_token = token;

      // Устанавливаем токен в сервисе
      if (this.inparsService) {
        this.inparsService.setToken(token);
      }

      // Проверяем подписку
      await this.checkInparsSubscription();

      this.showNotification('Токен API Inpars сохранен', 'success');

    } catch (error) {
      console.error('Ошибка сохранения токена Inpars:', error);
      this.showNotification('Ошибка сохранения токена: ' + error.message, 'error');
    } finally {
      const saveBtn = document.getElementById('saveInparsToken');
      saveBtn.textContent = 'Сохранить';
      saveBtn.disabled = false;
    }
  }

  /**
   * Проверка статуса подписки Inpars
   */
  async checkInparsSubscription() {
    try {
      if (!this.inparsService) {
        console.log('⚠️ InparsService не загружен');
        return;
      }
      
      console.log('🔑 InparsService token status:', this.inparsService.token ? '***set***' : 'not set');

      const statusIndicator = document.getElementById('inparsStatusIndicator');
      const statusText = document.getElementById('inparsStatusText');
      const subscriptionStatus = document.getElementById('inparsSubscriptionStatus');
      const subscriptionDetails = document.getElementById('inparsSubscriptionDetails');

      // Показываем индикатор проверки
      statusIndicator.querySelector('div').className = 'h-3 w-3 rounded-full bg-yellow-400 animate-pulse';
      statusText.textContent = 'Проверка подписки...';
      subscriptionStatus.classList.remove('hidden');

      console.log('🔍 Checking Inpars subscription...');
      const result = await this.inparsService.checkSubscription();
      console.log('📋 Subscription check result:', result);

      if (result.success) {
        if (result.active) {
          // Активная подписка
          statusIndicator.querySelector('div').className = 'h-3 w-3 rounded-full bg-green-500';
          statusText.textContent = 'Подписка активна';

          // Скрываем детали подписки (убираем лишнюю информацию)
          subscriptionDetails.classList.add('hidden');

          // Показываем кнопки управления
          document.getElementById('importInparsCategories').disabled = false;
          document.getElementById('inparsApiStats').classList.remove('hidden');

        } else {
          // Неактивная подписка
          statusIndicator.querySelector('div').className = 'h-3 w-3 rounded-full bg-red-500';
          statusText.textContent = 'Подписка неактивна';
          subscriptionDetails.classList.add('hidden');

          // Скрываем кнопки управления
          document.getElementById('importInparsCategories').disabled = true;
          document.getElementById('inparsApiStats').classList.add('hidden');
        }

        // Обновляем статистику API
        this.updateInparsAPIStats();

      } else {
        // Ошибка проверки
        statusIndicator.querySelector('div').className = 'h-3 w-3 rounded-full bg-red-500';
        statusText.textContent = 'Ошибка проверки: ' + (result.error || 'Неизвестная ошибка');
        subscriptionDetails.classList.add('hidden');
        document.getElementById('importInparsCategories').disabled = true;
      }

    } catch (error) {
      console.error('Ошибка проверки подписки Inpars:', error);
      
      const statusIndicator = document.getElementById('inparsStatusIndicator');
      const statusText = document.getElementById('inparsStatusText');
      
      statusIndicator.querySelector('div').className = 'h-3 w-3 rounded-full bg-red-500';
      statusText.textContent = 'Ошибка: ' + error.message;
      
      this.showNotification('Ошибка проверки подписки Inpars: ' + error.message, 'error');
    }
  }

  /**
   * Загрузка статуса подписки при инициализации
   */
  async loadInparsSubscription() {
    await this.checkInparsSubscription();
  }

  /**
   * Импорт справочников Inpars
   */
  async importInparsCategories() {
    try {
      if (!this.inparsService) {
        throw new Error('InparsService не загружен');
      }

      const importBtn = document.getElementById('importInparsCategories');
      const statusDiv = document.getElementById('categoriesImportStatus');

      importBtn.disabled = true;
      importBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Импорт справочников...
      `;

      statusDiv.textContent = 'Загрузка категорий из Inpars...';
      statusDiv.classList.remove('hidden');

      const categories = await this.inparsService.loadCategories();

      if (categories && categories.length > 0) {
        statusDiv.textContent = `Получено ${categories.length} категорий. Сохранение в базу данных...`;

        // Сохраняем категории в базу данных
        const importResult = await db.importInparsCategories(categories);
        
        if (importResult.success) {
          statusDiv.textContent = `✅ Успешно импортировано: ${importResult.imported} новых, ${importResult.updated} обновлено`;
          this.showNotification(`Импорт завершен: ${importResult.imported} новых категорий, ${importResult.updated} обновлено`, 'success');
          
          if (importResult.errors > 0) {
            console.warn('Ошибки при импорте категорий:', importResult.details.errors);
            this.showNotification(`Внимание: ${importResult.errors} категорий не удалось импортировать`, 'warning');
          }
        } else {
          throw new Error(importResult.error || 'Ошибка сохранения в базу данных');
        }

      } else {
        throw new Error('Не удалось получить категории');
      }

    } catch (error) {
      console.error('Ошибка импорта категорий Inpars:', error);
      
      const statusDiv = document.getElementById('categoriesImportStatus');
      statusDiv.textContent = '❌ Ошибка импорта: ' + error.message;
      statusDiv.classList.remove('hidden');
      
      this.showNotification('Ошибка импорта категорий: ' + error.message, 'error');
    } finally {
      const importBtn = document.getElementById('importInparsCategories');
      importBtn.disabled = false;
      importBtn.innerHTML = `
        <svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10">
          </path>
        </svg>
        Импорт справочников Inpars
      `;
    }
  }

  /**
   * Сохранение настроек источников данных
   */
  async saveInparsSources() {
    try {
      const sourceAvito = document.getElementById('sourceAvito').checked;
      const sourceCian = document.getElementById('sourceCian').checked;

      await db.setSetting('inpars_source_avito', sourceAvito);
      await db.setSetting('inpars_source_cian', sourceCian);

      this.settings.inpars_source_avito = sourceAvito;
      this.settings.inpars_source_cian = sourceCian;

      // Показываем уведомление только если изменились настройки
      this.showNotification('Настройки источников данных сохранены', 'success');

    } catch (error) {
      console.error('Ошибка сохранения источников данных:', error);
      this.showNotification('Ошибка сохранения настроек источников', 'error');
    }
  }

  /**
   * Обновление статистики API Inpars
   */
  updateInparsAPIStats() {
    if (this.inparsService) {
      const stats = this.inparsService.getStatus();
      
      document.getElementById('apiRequestCount').textContent = stats.requestCount || 0;
      document.getElementById('apiQueueLength').textContent = stats.queueLength || 0;
    }
  }

  /**
   * Инициализация ML алгоритма
   */
  async initializeMLMatcher() {
    try {
      if (!window.smartAddressMatcher && typeof SmartAddressMatcher !== 'undefined') {
        // Инициализируем пространственный индекс
        if (!window.spatialIndexManager) {
          window.spatialIndexManager = new SpatialIndexManager();
        }
        
        // Инициализируем ML алгоритм
        window.smartAddressMatcher = new SmartAddressMatcher(window.spatialIndexManager);
        console.log('🤖 SmartAddressMatcher initialized in settings');
        
        // Загружаем сохраненную модель из localStorage если есть
        const savedModel = localStorage.getItem('ml_trained_model');
        if (savedModel) {
          try {
            const modelData = JSON.parse(savedModel);
            // Восстанавливаем веса и пороги
            Object.assign(window.smartAddressMatcher.model.weights, modelData.weights || {});
            Object.assign(window.smartAddressMatcher.model.thresholds, modelData.thresholds || {});
            window.smartAddressMatcher.model.version = modelData.version || '1.0.0';
            window.smartAddressMatcher.model.lastUpdate = modelData.lastUpdate || new Date().toISOString().split('T')[0];
            console.log('💾 Restored trained model from localStorage');
          } catch (error) {
            console.warn('Failed to restore model:', error);
          }
        }
      }
    } catch (error) {
      console.warn('ML алгоритм недоступен:', error);
    }
  }

  /**
   * Обновление статистики ML модели
   */
  async refreshMLStats() {
    try {
      const refreshBtn = document.getElementById('refreshMLStats');
      const originalText = refreshBtn.innerHTML;
      
      refreshBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Обновление...';
      refreshBtn.disabled = true;

      // Получаем ML модель из глобального объекта если доступен
      let modelData = null;
      if (window.smartAddressMatcher) {
        // Получаем актуальную обученную модель
        modelData = {
          ...window.smartAddressMatcher.model,
          trainingExamples: window.smartAddressMatcher.training.examples.length,
          lastTrainingDate: window.smartAddressMatcher.training.examples.length > 0 ? 
            new Date(Math.max(...window.smartAddressMatcher.training.examples.map(ex => ex.timestamp))).toISOString().split('T')[0] : 
            'Нет данных'
        };
        console.log('📊 Current ML model stats:', modelData);
      } else {
        // Попытка загрузить сохраненную модель из localStorage
        try {
          const savedModel = localStorage.getItem('ml_trained_model');
          const trainingCount = localStorage.getItem('ml_training_count');
          if (savedModel) {
            modelData = JSON.parse(savedModel);
            // Добавляем актуальный счетчик примеров
            if (trainingCount) {
              modelData.trainingExamples = parseInt(trainingCount);
            }
            console.log('💾 Loaded trained model from localStorage with', modelData.trainingExamples, 'examples');
          } else {
            // Fallback к pretrained модели
            const response = await fetch(chrome.runtime.getURL('utils/pretrained-model.json'));
            modelData = await response.json();
            console.log('📁 Loaded pretrained model from file');
          }
        } catch (error) {
          console.warn('Не удалось загрузить модель:', error);
        }
      }

      if (modelData) {
        // Обновляем отображение статистики
        const versionEl = document.getElementById('mlModelVersion');
        const examplesEl = document.getElementById('mlTrainingExamples');
        const accuracyEl = document.getElementById('mlModelAccuracy');
        const updateEl = document.getElementById('mlLastUpdate');
        
        if (versionEl) versionEl.textContent = modelData.version || 'Неизвестно';
        if (examplesEl) examplesEl.textContent = modelData.trainingExamples || 0;
        if (accuracyEl) accuracyEl.textContent = modelData.accuracy ? `${(modelData.accuracy * 100).toFixed(1)}%` : 'Неизвестно';
        if (updateEl) updateEl.textContent = modelData.lastUpdate || modelData.lastTrainingDate || 'Неизвестно';
        
        this.showNotification('Статистика ML модели обновлена', 'success');
      } else {
        this.showNotification('ML модель не найдена', 'warning');
      }

    } catch (error) {
      console.error('Ошибка обновления статистики ML:', error);
      this.showNotification('Ошибка обновления статистики', 'error');
    } finally {
      const refreshBtn = document.getElementById('refreshMLStats');
      refreshBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Обновить статистику';
      refreshBtn.disabled = false;
    }
  }

  /**
   * Подробный анализ сохраненных данных обучения
   */
  displayTrainingDataInfo() {
    console.log('\n📚 ========== АНАЛИЗ ДАННЫХ ОБУЧЕНИЯ ==========');
    
    try {
      // Проверяем localStorage
      const savedExamples = localStorage.getItem('ml_training_examples');
      const savedCount = localStorage.getItem('ml_training_count');
      const savedModel = localStorage.getItem('ml_trained_model');
      
      console.log('💾 LOCALSTORAGE ДАННЫЕ:');
      console.log(`   📊 Счетчик примеров: ${savedCount || 'НЕТ'}`);
      console.log(`   📋 Примеры сохранены: ${savedExamples ? 'ДА' : 'НЕТ'}`);
      console.log(`   🧠 Обученная модель: ${savedModel ? 'ДА' : 'НЕТ'}`);
      
      if (savedExamples) {
        try {
          const examples = JSON.parse(savedExamples);
          const positive = examples.filter(ex => ex.isCorrect).length;
          const negative = examples.filter(ex => !ex.isCorrect).length;
          
          console.log('\n📊 ДЕТАЛИ СОХРАНЕННЫХ ПРИМЕРОВ:');
          console.log(`   📈 Всего примеров: ${examples.length}`);
          console.log(`   ✅ Положительных: ${positive}`);
          console.log(`   ❌ Отрицательных: ${negative}`);
          console.log(`   📊 Соотношение: ${positive}:${negative} (${(positive/examples.length*100).toFixed(1)}% положительных)`);
          
          // Показываем несколько примеров
          console.log('\n📝 ПРИМЕРЫ ДАННЫХ (первые 3):');
          examples.slice(0, 3).forEach((example, i) => {
            console.log(`   ${i + 1}. ${example.isCorrect ? '✅' : '❌'} "${example.listing}" → "${example.candidate}"`);
            if (example.features) {
              console.log(`      🔢 Признаки: text=${example.features.textualSimilarity?.toFixed(3)}, semantic=${example.features.semanticSimilarity?.toFixed(3)}`);
            }
          });
          
          // Проверяем готовность к переобучению
          const canRetrain = positive >= 5 && negative >= 5 && examples.length >= 20;
          const nextRetrainAt = Math.ceil(examples.length / 50) * 50;
          
          console.log('\n🎯 ГОТОВНОСТЬ К ОБУЧЕНИЮ:');
          console.log(`   📋 Минимальные требования: ${canRetrain ? '✅ ВЫПОЛНЕНЫ' : '❌ НЕ ВЫПОЛНЕНЫ'}`);
          console.log(`   📊 Нужно: ≥5 положительных, ≥5 отрицательных, ≥20 общих`);
          console.log(`   📈 Текущее: ${positive} положительных, ${negative} отрицательных, ${examples.length} общих`);
          console.log(`   🔄 Следующее переобучение при: ${nextRetrainAt} примеров`);
          console.log(`   📏 До следующего переобучения: ${nextRetrainAt - examples.length} примеров`);
          
        } catch (parseError) {
          console.error('❌ Ошибка парсинга сохраненных примеров:', parseError);
        }
      } else {
        console.log('\n⚠️ ПРИМЕРЫ НЕ СОХРАНЕНЫ');
        console.log('   Система будет собирать новые примеры с нуля');
        console.log('   Первое переобучение произойдет при 50 примерах');
      }
      
      // Проверяем состояние SmartAddressMatcher
      console.log('\n🧠 SMARTADDRESSMATCHER В ПАМЯТИ:');
      if (window.smartAddressMatcher) {
        const matcher = window.smartAddressMatcher;
        const memoryPositive = matcher.training.examples.filter(ex => ex.isCorrect).length;
        const memoryNegative = matcher.training.examples.filter(ex => !ex.isCorrect).length;
        
        console.log(`   📊 Примеров в памяти: ${matcher.training.examples.length}`);
        console.log(`   ✅ Положительных в памяти: ${memoryPositive}`);
        console.log(`   ❌ Отрицательных в памяти: ${memoryNegative}`);
        console.log(`   🔧 Обучение включено: ${matcher.training.enabled ? 'ДА' : 'НЕТ'}`);
        console.log(`   📈 Версия модели: ${matcher.model.version}`);
        console.log(`   📅 Последнее обновление: ${matcher.model.lastUpdate}`);
        
        // Проверяем синхронизацию с localStorage
        const syncMatch = matcher.training.examples.length === (savedExamples ? JSON.parse(savedExamples).length : 0);
        console.log(`   🔄 Синхронизация с localStorage: ${syncMatch ? '✅ СИНХРОНИЗИРОВАНО' : '⚠️ РАССИНХРОНИЗИРОВАНО'}`);
        
      } else {
        console.log('   ❌ SmartAddressMatcher не загружен в память');
        console.log('   💡 Нажмите "🧠 Определить адреса (умный ML)" на странице area.html');
      }
      
      // Рекомендации
      console.log('\n💡 РЕКОМЕНДАЦИИ:');
      if (!savedExamples) {
        console.log('   1. 📚 Начните использовать подтверждения адресов для сбора примеров');
        console.log('   2. 🎯 Первое переобучение произойдет автоматически при 50 примерах');
      } else {
        const examples = JSON.parse(savedExamples);
        const negative = examples.filter(ex => !ex.isCorrect).length;
        if (negative < 5) {
          console.log('   1. ❌ Нужно больше отрицательных примеров (неправильных совпадений)');
          console.log('   2. 🔧 Исправляйте неправильные привязки адресов для сбора отрицательных примеров');
        }
        if (examples.length >= 50) {
          console.log('   1. ✅ Достаточно примеров для переобучения');
          console.log('   2. 🔄 Переобучение должно произойти автоматически');
        }
      }
      
      console.log('\n📚 ============================================\n');
      
    } catch (error) {
      console.error('❌ Ошибка анализа данных обучения:', error);
    }
  }

  /**
   * Экспорт ML модели в textarea
   */
  async exportMLModel() {
    try {
      const exportBtn = document.getElementById('exportMLModel');
      const originalText = exportBtn.innerHTML;
      
      exportBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Экспорт...';
      exportBtn.disabled = true;

      let modelData = null;
      
      // Получаем актуальную модель
      if (window.smartAddressMatcher) {
        // Получаем полную обученную модель
        modelData = {
          ...window.smartAddressMatcher.model,
          trainingExamples: window.smartAddressMatcher.training.examples.length,
          lastTrainingDate: window.smartAddressMatcher.training.examples.length > 0 ? 
            new Date(Math.max(...window.smartAddressMatcher.training.examples.map(ex => ex.timestamp))).toISOString().split('T')[0] : 
            new Date().toISOString().split('T')[0],
          improvements: [
            "Снижены пороги для лучшего покрытия очевидных совпадений",
            "Увеличен вес текстового сходства для лучшего распознавания сокращений", 
            "Добавлена система обучения на пользовательских подтверждениях",
            `Обучена на ${window.smartAddressMatcher.training.examples.length} примерах пользователя`
          ]
        };
        console.log('🎯 Exporting trained model with', modelData.trainingExamples, 'examples');
      } else {
        // Попытка загрузить сохраненную модель
        try {
          const savedModel = localStorage.getItem('ml_trained_model');
          const trainingCount = localStorage.getItem('ml_training_count');
          if (savedModel) {
            modelData = JSON.parse(savedModel);
            // Добавляем актуальный счетчик примеров
            if (trainingCount) {
              modelData.trainingExamples = parseInt(trainingCount);
            }
            console.log('💾 Exporting trained model from localStorage with', modelData.trainingExamples, 'examples');
          } else {
            const response = await fetch(chrome.runtime.getURL('utils/pretrained-model.json'));
            modelData = await response.json();
            console.log('📁 Exporting pretrained model');
          }
        } catch (error) {
          throw new Error('Не удалось загрузить ML модель');
        }
      }

      // Форматируем JSON для отображения с точными весами
      const formattedJson = JSON.stringify(modelData, (key, value) => {
        // Если это веса модели, форматируем с 3 знаками после запятой
        if (key === 'weights' && typeof value === 'object') {
          const formattedWeights = {};
          for (const [weightKey, weightValue] of Object.entries(value)) {
            formattedWeights[weightKey] = typeof weightValue === 'number' ? 
              weightValue.toFixed(3) : weightValue;
          }
          return formattedWeights;
        }
        // Если это пороги, тоже форматируем с 3 знаками
        if (key === 'thresholds' && typeof value === 'object') {
          const formattedThresholds = {};
          for (const [thresholdKey, thresholdValue] of Object.entries(value)) {
            formattedThresholds[thresholdKey] = typeof thresholdValue === 'number' ? 
              thresholdValue.toFixed(3) : thresholdValue;
          }
          return formattedThresholds;
        }
        // Для других числовых значений (accuracy и т.д.) тоже 3 знака
        if (typeof value === 'number' && (key === 'accuracy' || key.includes('similarity') || key.includes('Score'))) {
          return parseFloat(value.toFixed(3));
        }
        return value;
      }, 2);
      
      // Выводим в textarea
      const textarea = document.getElementById('mlModelExport');
      if (!textarea) {
        throw new Error('Элемент mlModelExport не найден на странице');
      }
      textarea.value = formattedJson;
      
      this.showNotification('Модель экспортирована в поле ниже', 'success');

    } catch (error) {
      console.error('Ошибка экспорта ML модели:', error);
      this.showNotification('Ошибка экспорта модели: ' + error.message, 'error');
    } finally {
      const exportBtn = document.getElementById('exportMLModel');
      exportBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>Экспорт модели';
      exportBtn.disabled = false;
    }
  }

  /**
   * Копирование ML модели в буфер обмена
   */
  async copyMLModel() {
    try {
      const textarea = document.getElementById('mlModelExport');
      
      if (!textarea.value.trim()) {
        this.showNotification('Сначала экспортируйте модель', 'warning');
        return;
      }

      // Копируем в буфер обмена
      await navigator.clipboard.writeText(textarea.value);
      
      // Визуальная обратная связь
      const copyBtn = document.getElementById('copyMLModel');
      const originalText = copyBtn.innerHTML;
      
      copyBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Скопировано!';
      copyBtn.classList.add('text-green-600');
      
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.classList.remove('text-green-600');
      }, 2000);
      
      this.showNotification('Модель скопирована в буфер обмена', 'success');

    } catch (error) {
      console.error('Ошибка копирования:', error);
      this.showNotification('Ошибка копирования в буфер обмена', 'error');
    }
  }

  /**
   * Показ результатов полного экспорта
   */
  showFullExportResult(data) {
    const resultsDiv = document.getElementById('fullDataOperationResults');
    if (!resultsDiv) return;
    
    const stats = data.statistics;
    
    resultsDiv.innerHTML = `
      <div class="bg-green-50 border border-green-200 rounded-md p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-green-800">Экспорт завершен успешно</h3>
            <div class="mt-2 text-sm text-green-700">
              <p class="mb-2">Файл создан: ${new Date(data.timestamp).toLocaleString('ru-RU')}</p>
              <ul class="list-disc list-inside space-y-1">
                <li>📍 Областей экспортировано: ${stats.total_map_areas}</li>
                <li>🏠 Адресов экспортировано: ${stats.total_addresses}</li>
                <li>📋 Сегментов экспортировано: ${stats.total_segments}</li>
                <li>📊 Объявлений экспортировано: ${stats.total_listings}</li>
                <li>🏢 Объектов экспортировано: ${stats.total_objects}</li>
                <li>📈 Отчётов экспортировано: ${stats.total_reports}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
    
    resultsDiv.classList.remove('hidden');
    
    // Скрываем результат через 10 секунд
    setTimeout(() => {
      resultsDiv.classList.add('hidden');
    }, 10000);
  }

  /**
   * Показ результатов полного импорта
   */
  showFullImportResult(result) {
    const resultsDiv = document.getElementById('fullDataOperationResults');
    if (!resultsDiv) return;
    
    const stats = result.statistics;
    const oldStats = result.oldStats;
    
    resultsDiv.innerHTML = `
      <div class="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-blue-800">Импорт завершен успешно</h3>
            <div class="mt-2 text-sm text-blue-700">
              <p class="mb-2">Файл создан: ${new Date(result.timestamp).toLocaleString('ru-RU')}</p>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="font-medium mb-1">Было данных:</p>
                  <ul class="list-disc list-inside space-y-1 text-xs">
                    <li>📍 Областей: ${oldStats.map_areas}</li>
                    <li>🏠 Адресов: ${oldStats.addresses}</li>
                    <li>📋 Сегментов: ${oldStats.segments}</li>
                    <li>📊 Объявлений: ${oldStats.listings}</li>
                    <li>🏢 Объектов: ${oldStats.objects}</li>
                    <li>📈 Отчётов: ${oldStats.reports}</li>
                  </ul>
                </div>
                <div>
                  <p class="font-medium mb-1">Импортировано:</p>
                  <ul class="list-disc list-inside space-y-1 text-xs">
                    <li>📍 Областей: ${stats.map_areas}</li>
                    <li>🏠 Адресов: ${stats.addresses}</li>
                    <li>📋 Сегментов: ${stats.segments}</li>
                    <li>📊 Объявлений: ${stats.listings}</li>
                    <li>🏢 Объектов: ${stats.objects}</li>
                    <li>📈 Отчётов: ${stats.reports}</li>
                    <li>⚙️ Настроек: ${stats.settings}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    resultsDiv.classList.remove('hidden');
    
    // Скрываем результат через 15 секунд
    setTimeout(() => {
      resultsDiv.classList.add('hidden');
    }, 15000);
  }

  /**
   * Получение настроек экспорта из чекбоксов
   */
  getExportOptions() {
    return {
      map_areas: document.getElementById('exportMapAreas').checked,
      addresses: document.getElementById('exportAddresses').checked,
      segments: document.getElementById('exportSegments').checked,
      listings: document.getElementById('exportListings').checked,
      reports: document.getElementById('exportReports').checked,
      references: document.getElementById('exportReferences').checked,
      settings: document.getElementById('exportSettings').checked
    };
  }

  /**
   * Установка всех чекбоксов экспорта
   */
  setAllExportCheckboxes(checked) {
    const checkboxIds = [
      'exportMapAreas', 'exportAddresses', 'exportSegments', 
      'exportListings', 'exportReports', 'exportReferences', 'exportSettings'
    ];
    
    checkboxIds.forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.checked = checked;
      }
    });
  }

  /**
   * Выбор только адресов для экспорта
   */
  setAddressesOnlyExport() {
    // Сначала снимаем все
    this.setAllExportCheckboxes(false);
    
    // Выбираем только адреса и связанные данные
    document.getElementById('exportAddresses').checked = true;
    document.getElementById('exportReferences').checked = true; // Справочники нужны для адресов
  }

  /**
   * Показ результатов выборочного экспорта
   */
  showSelectiveExportResult(data) {
    const resultsDiv = document.getElementById('fullDataOperationResults');
    if (!resultsDiv) return;
    
    const stats = data.statistics;
    const options = data.exportOptions;
    
    // Создаём список экспортированных блоков
    let exportedBlocks = [];
    if (options.map_areas && stats.total_map_areas !== undefined) {
      exportedBlocks.push(`📍 Областей: ${stats.total_map_areas}`);
    }
    if (options.addresses && stats.total_addresses !== undefined) {
      exportedBlocks.push(`🏠 Адресов: ${stats.total_addresses}`);
    }
    if (options.segments && stats.total_segments !== undefined) {
      exportedBlocks.push(`📋 Сегментов: ${stats.total_segments}`);
    }
    if (options.listings && stats.total_listings !== undefined) {
      exportedBlocks.push(`📊 Объявлений: ${stats.total_listings}`, `🏢 Объектов: ${stats.total_objects || 0}`);
    }
    if (options.reports && stats.total_reports !== undefined) {
      exportedBlocks.push(`📈 Отчётов: ${stats.total_reports}`);
    }
    if (options.references) {
      const refCount = (stats.total_wall_materials || 0) + 
                      (stats.total_ceiling_materials || 0) + 
                      (stats.total_house_series || 0) + 
                      (stats.total_house_classes || 0) + 
                      (stats.total_house_problems || 0);
      exportedBlocks.push(`📚 Справочников: ${refCount}`);
    }
    if (options.settings && stats.total_settings !== undefined) {
      exportedBlocks.push(`⚙️ Настроек: ${stats.total_settings}`);
    }
    
    resultsDiv.innerHTML = `
      <div class="bg-green-50 border border-green-200 rounded-md p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-green-800">Выборочный экспорт завершен успешно</h3>
            <div class="mt-2 text-sm text-green-700">
              <p class="mb-2">Файл создан: ${new Date(data.timestamp).toLocaleString('ru-RU')}</p>
              <p class="mb-2 font-medium">Экспортированные блоки:</p>
              <ul class="list-disc list-inside space-y-1">
                ${exportedBlocks.map(block => `<li>${block}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
    
    resultsDiv.classList.remove('hidden');
    
    // Скрываем результат через 10 секунд
    setTimeout(() => {
      resultsDiv.classList.add('hidden');
    }, 10000);
  }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
      