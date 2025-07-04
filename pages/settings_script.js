/**
 * JavaScript для страницы настроек
 */

class SettingsPage {
  constructor() {
    this.settings = {};
    this.subscription = null;
    this.init();
  }

  async init() {
    try {
      // Инициализируем базу данных
      await db.init();
      
      // Инициализируем интерфейс
      this.initializeUI();
      
      // Загружаем настройки
      await this.loadSettings();
      
      // Загружаем статистику
      await this.loadDatabaseStats();
      
      // Загружаем данные подписки
      await this.loadSubscriptionInfo();
      
    } catch (error) {
      console.error('Ошибка инициализации:', error);
      this.showNotification('Ошибка инициализации страницы', 'error');
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

    // Экспорт данных
    document.getElementById('exportDataBtn').addEventListener('click', () => {
      this.exportData();
    });

    // Импорт данных
    document.getElementById('importDataBtn').addEventListener('click', () => {
      this.importData();
    });

    document.getElementById('importFileInput').addEventListener('change', (e) => {
      this.handleImportFile(e);
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

  async exportData() {
    try {
      const exportBtn = document.getElementById('exportDataBtn');
      const originalText = exportBtn.innerHTML;
      
      exportBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Экспорт...';
      exportBtn.disabled = true;

      const exportData = await db.exportData();
      
      // Создаем файл для скачивания
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const now = new Date();
      const filename = `neocenka-export-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showNotification('Данные экспортированы', 'success');

    } catch (error) {
      console.error('Ошибка экспорта:', error);
      this.showNotification('Ошибка экспорта данных', 'error');
    } finally {
      const exportBtn = document.getElementById('exportDataBtn');
      exportBtn.innerHTML = '<svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>Экспорт данных';
      exportBtn.disabled = false;
    }
  }

  importData() {
    document.getElementById('importFileInput').click();
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
      
      processBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Обработка...';
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
      
      confirmBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Удаление...';
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

      // Устанавливаем токен в API клиенте
      if (window.inparsAPI) {
        window.inparsAPI.setToken(token);
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
      if (!window.inparsAPI) {
        throw new Error('API клиент Inpars не загружен');
      }

      const statusIndicator = document.getElementById('inparsStatusIndicator');
      const statusText = document.getElementById('inparsStatusText');
      const subscriptionStatus = document.getElementById('inparsSubscriptionStatus');
      const subscriptionDetails = document.getElementById('inparsSubscriptionDetails');

      // Показываем индикатор проверки
      statusIndicator.querySelector('div').className = 'h-3 w-3 rounded-full bg-yellow-400 animate-pulse';
      statusText.textContent = 'Проверка подписки...';
      subscriptionStatus.classList.remove('hidden');

      const result = await window.inparsAPI.checkSubscription();

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
      if (!window.inparsAPI) {
        throw new Error('API клиент Inpars не загружен');
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

      const result = await window.inparsAPI.getCategories();

      if (result.success && result.categories) {
        statusDiv.textContent = `Получено ${result.categories.length} категорий. Сохранение в базу данных...`;

        // Сохраняем категории в базу данных
        const importResult = await db.importInparsCategories(result.categories);
        
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
        throw new Error(result.error || 'Не удалось получить категории');
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
    if (window.inparsAPI) {
      const stats = window.inparsAPI.getStats();
      
      document.getElementById('apiRequestCount').textContent = stats.requestCount;
      document.getElementById('apiQueueLength').textContent = stats.queueLength;
    }
  }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
      