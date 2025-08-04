/**
 * Менеджер импорта адресов из GeoJSON "Реформа ЖКХ"
 */
class GeoJsonImportManager {
  constructor(databaseManager, progressManager) {
    this.db = databaseManager;
    this.progressManager = progressManager;
    this.importer = null;
    this.selectedFile = null;
    
    this.initializeEventListeners();
  }
  
  /**
   * Инициализация обработчиков событий
   */
  initializeEventListeners() {
    // Выбор файла
    const fileInput = document.getElementById('geojsonFile');
    const selectBtn = document.getElementById('selectGeoJsonBtn');
    const importBtn = document.getElementById('startGeoJsonImport');
    
    if (fileInput && selectBtn && importBtn) {
      // Клик по кнопке выбора файла
      selectBtn.addEventListener('click', () => {
        fileInput.click();
      });
      
      // Изменение файла
      fileInput.addEventListener('change', (event) => {
        this.handleFileSelection(event);
      });
      
      // Кнопка импорта
      importBtn.addEventListener('click', () => {
        this.startImport();
      });
      
      // Кнопка остановки импорта
      const stopBtn = document.getElementById('stopGeoJsonImport');
      stopBtn.addEventListener('click', () => {
        this.stopImport();
      });
    }
  }
  
  /**
   * Обработка выбора файла
   */
  handleFileSelection(event) {
    const file = event.target.files[0];
    const fileNameDiv = document.getElementById('selectedFileName');
    const importBtn = document.getElementById('startGeoJsonImport');
    
    if (file) {
      this.selectedFile = file;
      
      // Валидация файла
      const validation = this.validateFile(file);
      
      if (validation.valid) {
        fileNameDiv.textContent = `Выбран файл: ${file.name} (${this.formatFileSize(file.size)})`;
        fileNameDiv.className = 'text-xs text-green-600';
        fileNameDiv.classList.remove('hidden');
        
        importBtn.disabled = false;
        importBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        fileNameDiv.textContent = `Ошибка: ${validation.error}`;
        fileNameDiv.className = 'text-xs text-red-600';
        fileNameDiv.classList.remove('hidden');
        
        importBtn.disabled = true;
        importBtn.classList.add('opacity-50', 'cursor-not-allowed');
        this.selectedFile = null;
      }
    } else {
      this.selectedFile = null;
      fileNameDiv.classList.add('hidden');
      importBtn.disabled = true;
      importBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  }
  
  /**
   * Валидация файла
   */
  validateFile(file) {
    // Проверка расширения
    const allowedExtensions = ['.geojson', '.json'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
      return {
        valid: false,
        error: 'Неподдерживаемый формат файла. Разрешены только .geojson и .json'
      };
    }
    
    // Проверка размера (максимум 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'Файл слишком большой. Максимальный размер: 100MB'
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Форматирование размера файла
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Начало импорта
   */
  async startImport() {
    if (!this.selectedFile) {
      this.showError('Файл не выбран');
      return;
    }
    
    const debugEnabled = await this.getDebugSetting();
    
    try {
      // Получаем настройки
      const options = this.getImportOptions();
      
      if (debugEnabled) {
        console.log('🚀 Начинаем импорт GeoJSON с настройками:', options);
      }
      
      // Блокируем UI и показываем кнопку остановки
      this.setUIState(false);
      this.showStopButton();
      
      // Очищаем предыдущие результаты
      this.clearResults();
      
      // Создаем импортер
      this.importer = new ReformaGKHImporter(this.db);
      this.importer.setOptions(options);
      
      // Запускаем импорт с callback прогресса
      const result = await this.importer.importFromFile(
        this.selectedFile,
        (progressData) => this.updateProgress(progressData)
      );
      
      if (result.success) {
        this.showResults(result.stats);
        
        if (debugEnabled) {
          console.log('✅ Импорт завершен успешно:', result.stats);
        }
        
        // Отправляем событие для обновления UI
        document.dispatchEvent(new CustomEvent('addressesUpdated'));
        
      } else {
        this.showError(result.error);
        
        if (result.errors && result.errors.length > 0) {
          console.warn('⚠️ Ошибки импорта:', result.errors);
        }
      }
      
    } catch (error) {
      console.error('❌ Критическая ошибка импорта:', error);
      this.showError(`Критическая ошибка: ${error.message}`);
    } finally {
      // Разблокируем UI и скрываем кнопку остановки
      this.setUIState(true);
      this.hideStopButton();
      this.importer = null;
    }
  }
  
  /**
   * Получение настроек импорта из UI
   */
  getImportOptions() {
    return {
      createReferences: document.getElementById('createReferences')?.checked || false,
      batchSize: 150
    };
  }
  
  /**
   * Обновление прогресса
   */
  updateProgress(progressData) {
    const { stage, progress, stats, message } = progressData;
    
    // Обновляем прогресс-бар напрямую
    const progressElement = document.getElementById('import-addressesProgress');
    const progressBar = document.getElementById('import-addressesProgressBar');
    const statusElement = document.getElementById('import-addressesStatus');
    
    if (progressElement) {
      progressElement.textContent = `${Math.round(progress)}%`;
    }
    
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
    
    // Дополнительная информация в статусе
    if (stats) {
      const statusText = `Обработано: ${stats.processed}/${stats.total}, ` +
                        `добавлено: ${stats.added}, пропущено: ${stats.skipped}, ошибок: ${stats.errors}`;
      
      if (statusElement) {
        statusElement.textContent = statusText;
        statusElement.classList.remove('hidden');
      }
    } else if (message && statusElement) {
      statusElement.textContent = message;
      statusElement.classList.remove('hidden');
    }
    
    // При завершении скрываем прогресс через некоторое время
    if (stage === 'completed' || stage === 'error') {
      setTimeout(() => {
        if (progressElement) progressElement.textContent = '0%';
        if (progressBar) progressBar.style.width = '0%';
        if (statusElement) statusElement.classList.add('hidden');
      }, 3000);
    }
  }
  
  /**
   * Показ результатов импорта
   */
  showResults(stats) {
    const resultsDiv = document.getElementById('geojsonImportResults');
    if (!resultsDiv) return;
    
    const referencesCreatedText = stats.referencesCreated > 0 
      ? `<li class="text-blue-600">Создано записей в справочниках: ${stats.referencesCreated}</li>` 
      : '';
      
    const referencesFoundText = stats.referencesFound > 0 
      ? `<li class="text-green-600">Найдено соответствий в справочниках: ${stats.referencesFound}</li>` 
      : '';
    
    resultsDiv.innerHTML = `
      <div class="bg-green-50 border border-green-200 rounded-md p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-green-800">Импорт завершен успешно</h3>
            <div class="mt-2 text-sm text-green-700">
              <ul class="list-disc list-inside space-y-1">
                <li>Обработано записей: ${stats.total}</li>
                <li>Добавлено новых адресов: ${stats.added}</li>
                <li>Обновлено существующих: ${stats.updated}</li>
                <li>Пропущено дублей: ${stats.skipped}</li>
                <li class="text-orange-600">Ошибок валидации: ${stats.errors}</li>
                ${referencesFoundText}
                ${referencesCreatedText}
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
    
    resultsDiv.classList.remove('hidden');
  }
  
  /**
   * Показ ошибки
   */
  showError(errorMessage) {
    const resultsDiv = document.getElementById('geojsonImportResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-md p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Ошибка импорта</h3>
            <div class="mt-2 text-sm text-red-700">
              ${errorMessage}
            </div>
          </div>
        </div>
      </div>
    `;
    
    resultsDiv.classList.remove('hidden');
  }
  
  /**
   * Очистка результатов
   */
  clearResults() {
    const resultsDiv = document.getElementById('geojsonImportResults');
    if (resultsDiv) {
      resultsDiv.classList.add('hidden');
      resultsDiv.innerHTML = '';
    }
  }
  
  /**
   * Установка состояния UI (блокировка/разблокировка)
   */
  setUIState(enabled) {
    const importBtn = document.getElementById('startGeoJsonImport');
    const fileInput = document.getElementById('geojsonFile');
    const selectBtn = document.getElementById('selectGeoJsonBtn');
    
    [importBtn, fileInput, selectBtn].forEach(element => {
      if (element) {
        element.disabled = !enabled;
        if (enabled) {
          element.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
          element.classList.add('opacity-50', 'cursor-not-allowed');
        }
      }
    });
    
    // Обновляем текст кнопки
    if (importBtn) {
      if (enabled) {
        importBtn.innerHTML = `
          <svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
          </svg>
          Начать импорт из GeoJSON
        `;
      } else {
        importBtn.innerHTML = `
          <svg class="-ml-1 mr-2 h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          Импорт выполняется...
        `;
      }
    }
  }
  
  /**
   * Получение настройки отладки
   */
  async getDebugSetting() {
    try {
      return await this.db.getSetting('debug_enabled') || false;
    } catch {
      return false;
    }
  }
  
  /**
   * Остановка импорта
   */
  stopImport() {
    if (this.importer) {
      this.importer.cancel();
      this.showError('Импорт остановлен пользователем');
    }
  }
  
  /**
   * Показать кнопку остановки
   */
  showStopButton() {
    const stopBtn = document.getElementById('stopGeoJsonImport');
    const importBtn = document.getElementById('startGeoJsonImport');
    const buttonText = document.getElementById('importButtonText');
    
    if (stopBtn) stopBtn.classList.remove('hidden');
    if (buttonText) buttonText.textContent = 'Импорт выполняется...';
    if (importBtn) importBtn.disabled = true;
  }
  
  /**
   * Скрыть кнопку остановки
   */
  hideStopButton() {
    const stopBtn = document.getElementById('stopGeoJsonImport');
    const importBtn = document.getElementById('startGeoJsonImport');
    const buttonText = document.getElementById('importButtonText');
    
    if (stopBtn) stopBtn.classList.add('hidden');
    if (buttonText) buttonText.textContent = 'Начать импорт из GeoJSON';
    if (importBtn) importBtn.disabled = false;
  }
  
  /**
   * Отмена импорта
   */
  cancelImport() {
    if (this.importer) {
      this.importer.cancel();
    }
  }
}

// Экспорт класса
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeoJsonImportManager;
} else if (typeof window !== 'undefined') {
  window.GeoJsonImportManager = GeoJsonImportManager;
}