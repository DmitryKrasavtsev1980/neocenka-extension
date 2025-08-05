/**
 * UI компонент для панели импорта данных Inpars
 * Извлечен из area.js для лучшей архитектуры
 */
class InparsPanel {
    constructor(container, serviceManager) {
        this.container = container;
        this.serviceManager = serviceManager;
        this.inparsService = null;
        this.slimSelect = null;
        this.isLoading = false;
        
        this.elements = {
            panel: null,
            categorySelect: null,
            loadButton: null,
            progressContainer: null,
            progressBar: null,
            progressText: null,
            statusText: null
        };
        
        this.initialize();
    }

    /**
     * Инициализация компонента
     */
    async initialize() {
        try {
            // // console.log('🔧 Initializing InparsPanel...');
            
            // Получаем сервис Inpars
            this.inparsService = this.serviceManager.getService('inpars');
            // console.log('📋 InparsService status:', this.inparsService?.status);
            
            // Создаем UI
            this.createUI();
            // console.log('🎨 UI created');
            
            // Настраиваем обработчики событий
            this.setupEventHandlers();
            // console.log('🔗 Event handlers set up');
            
            // Всегда инициализируем базовый SlimSelect
            this.initializeSlimSelect();
            
            // Проверяем доступность токена и данных
            if (!this.inparsService.token) {
                this.updateStatus('API токен не настроен. Импортируйте справочники на странице настроек.', 'warning');
                this.disableControls();
                return;
            }
            
            // Пытаемся загрузить категории
            try {
                await this.loadCategories();
                this.updateStatus('Готов к работе');
            } catch (error) {
                console.error('❌ Error loading categories:', error);
                this.updateStatus('Ошибка загрузки категорий. Импортируйте справочники на странице настроек.', 'warning');
                this.disableControls();
            }
            
        } catch (error) {
            console.error('Failed to initialize InparsPanel:', error);
            this.updateStatus('Ошибка инициализации: ' + error.message, 'error');
        }
    }

    /**
     * Ожидание завершения инициализации сервиса
     */
    async waitForServiceInitialization() {
        return new Promise((resolve) => {
            const checkStatus = () => {
                if (this.inparsService.status !== 'initializing') {
                    // console.log('✅ Service initialization completed. Final status:', this.inparsService.status);
                    resolve();
                } else {
                    setTimeout(checkStatus, 100); // Проверяем каждые 100ms
                }
            };
            checkStatus();
        });
    }

    /**
     * Создание UI элементов
     */
    createUI() {
        this.elements.panel = document.createElement('div');
        this.elements.panel.className = 'bg-gray-50 border border-gray-200 rounded-lg p-6';
        
        this.elements.panel.innerHTML = `
            <h4 class="text-lg font-medium text-gray-900 mb-4">Импорт объявлений</h4>
            <p class="text-sm text-gray-600 mb-4">Загрузка объявлений из сервиса Inpars в пределах области</p>
            
            <!-- Выбор категорий -->
            <div class="mb-4">
                <label for="categoriesSelect" class="block text-sm font-medium text-gray-700 mb-2">
                    Категории недвижимости
                </label>
                <select class="category-select" multiple>
                    <!-- Опции будут загружены через JavaScript -->
                </select>
            </div>

            <!-- Кнопка загрузки -->
            <button type="button" class="load-button w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10">
                    </path>
                </svg>
                Загрузить объявления
            </button>

            <!-- Прогресс загрузки -->
            <div class="progress-container hidden mt-4 pt-4 border-t border-gray-200">
                <h5 class="text-sm font-medium text-gray-900 mb-3">Прогресс загрузки</h5>
                <div class="space-y-1" data-progress="import-listings">
                    <div class="flex justify-between text-xs text-gray-500">
                        <span class="progress-text">Загрузка объявлений</span>
                        <span class="progress-percentage">0%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="progress-bar bg-sky-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                    </div>
                    <div class="progress-status text-xs text-gray-500 hidden"></div>
                </div>
            </div>

            <!-- Информация о настройках -->
            <div class="mt-4 pt-4 border-t border-gray-200">
                <div class="text-xs text-gray-600">
                    <div class="flex items-center justify-between">
                        <span>Статус API:</span>
                        <span class="status-text font-medium">Проверка...</span>
                    </div>
                </div>
            </div>
        `;
        
        // Кешируем элементы
        this.elements.categorySelect = this.elements.panel.querySelector('.category-select');
        this.elements.loadButton = this.elements.panel.querySelector('.load-button');
        this.elements.progressContainer = this.elements.panel.querySelector('.progress-container');
        this.elements.progressBar = this.elements.panel.querySelector('.progress-bar');
        this.elements.progressText = this.elements.panel.querySelector('.progress-text');
        this.elements.statusText = this.elements.panel.querySelector('.status-text');
        
        // Добавляем в контейнер
        this.container.appendChild(this.elements.panel);
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventHandlers() {
        // Кнопка загрузки
        this.elements.loadButton.addEventListener('click', () => {
            this.startImport();
        });
    }


    /**
     * Загрузка категорий в селектор
     */
    async loadCategories() {
        try {
            // console.log('📂 Loading Inpars categories...');
            
            const categories = this.inparsService.getCategories();
            // console.log('📋 Got categories from service:', categories);
            
            if (categories.length === 0) {
                // console.log('📥 No categories cached, loading from API...');
                await this.inparsService.loadCategories();
                // После загрузки получаем обновленные категории
                const updatedCategories = this.inparsService.getCategories();
                // console.log('📋 Updated categories from service:', updatedCategories);
                this.populateCategories(updatedCategories);
            } else {
                // console.log('📋 Using cached categories');
                this.populateCategories(categories);
            }
            
        } catch (error) {
            console.error('❌ Error loading categories:', error);
            throw error; // Пробрасываем ошибку выше для обработки
        }
    }

    /**
     * Заполнение селектора категориями
     */
    populateCategories(categories) {
        const select = this.elements.categorySelect;
        
        // Очищаем селектор
        select.innerHTML = '';
        
        // console.log('📂 Populating categories:', categories);
        
        // Проверяем формат данных (массив или Map)
        const categoriesArray = Array.isArray(categories) ? categories : Array.from(categories.values());
        // console.log(`📊 Total categories received: ${categoriesArray.length}`);
        
        let filteredCount = 0;
        let excludedRoomsCount = 0;
        
        // Добавляем категории с фильтрацией по sectionId=1, typeId=2
        for (const category of categoriesArray) {
            // Фильтруем только категории с sectionId=1 и typeId=2
            if (category.sectionId === 1 && category.typeId === 2) {
                filteredCount++;
                // Исключаем категорию "Комнаты" как требовалось
                if (category.title && !category.title.toLowerCase().includes('комната')) {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.title;
                    select.appendChild(option);
                } else if (category.title && category.title.toLowerCase().includes('комната')) {
                    excludedRoomsCount++;
                    // console.log(`🚫 Excluded room category: ${category.title}`);
                }
            }
        }
        
        // console.log(`🔍 Filtered categories (sectionId=1, typeId=2): ${filteredCount}`);
        // console.log(`🚫 Excluded rooms: ${excludedRoomsCount}`);
        
        // console.log(`✅ Added ${select.options.length} categories to select`);
        
        // Обновляем SlimSelect
        if (this.slimSelect) {
            this.slimSelect.destroy();
        }
        this.initializeSlimSelect();
    }

    /**
     * Инициализация SlimSelect
     */
    initializeSlimSelect() {
        // console.log('🎛️ Initializing SlimSelect...');
        
        if (this.slimSelect) {
            this.slimSelect.destroy();
            // console.log('🗑️ Destroyed existing SlimSelect');
        }
        
        if (typeof SlimSelect !== 'undefined') {
            // console.log('📚 SlimSelect library available');
            // console.log('🎯 Category select element:', this.elements.categorySelect);
            
            try {
                this.slimSelect = new SlimSelect({
                    select: this.elements.categorySelect,
                    settings: {
                        searchPlaceholder: 'Поиск категорий...',
                        searchText: 'Ничего не найдено',
                        placeholderText: 'Выберите категории',
                        allowDeselect: true,
                        closeOnSelect: false
                    }
                });
                // console.log('✅ SlimSelect initialized successfully');
            } catch (error) {
                console.error('❌ Error initializing SlimSelect:', error);
                // Если не удается инициализировать SlimSelect, продолжаем работу с обычным select
            }
        } else {
            console.warn('⚠️ SlimSelect library not available');
        }
    }

    /**
     * Начало импорта объявлений
     */
    async startImport() {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            this.elements.loadButton.disabled = true;
            this.elements.loadButton.textContent = 'Загрузка...';
            
            // Получаем выбранные категории
            const selectedCategories = this.getSelectedCategories();
            
            if (selectedCategories.length === 0) {
                alert('Выберите хотя бы одну категорию для импорта');
                return;
            }
            
            // Получаем полигон области
            const polygon = this.getAreaPolygon ? this.getAreaPolygon() : [];
            
            if (polygon.length === 0) {
                alert('Область не определена');
                return;
            }
            
            // Показываем прогресс
            this.showProgress();
            this.updateProgress('Подготовка к импорту...', 0);
            
            // Загружаем объявления через сервис
            const result = await this.inparsService.loadListings({
                polygon: polygon,
                categories: selectedCategories,
                onProgress: (progress) => {
                    this.updateProgress(progress.message || 'Загрузка...', progress.percentage || 0);
                }
            });
            
            // Скрываем прогресс
            this.hideProgress();
            
            // Уведомляем о завершении
            this.emit('import:completed', result);
            
        } catch (error) {
            console.error('❌ Import error:', error);
            this.hideProgress();
            this.updateStatus('Ошибка импорта: ' + error.message, 'error');
            
        } finally {
            this.isLoading = false;
            this.elements.loadButton.disabled = false;
            this.elements.loadButton.textContent = 'Загрузить объявления';
        }
    }

    /**
     * Получение выбранных категорий
     */
    getSelectedCategories() {
        if (!this.slimSelect) return [];
        
        try {
            const selected = this.slimSelect.getSelected();
            return Array.isArray(selected) ? 
                selected.map(item => parseInt(item.value || item)).filter(id => !isNaN(id)) : 
                [parseInt(selected.value || selected)].filter(id => !isNaN(id));
        } catch (error) {
            console.error('Error getting selected categories:', error);
            return [];
        }
    }

    /**
     * Показать прогресс
     */
    showProgress() {
        this.elements.progressContainer.classList.remove('hidden');
    }

    /**
     * Скрыть прогресс
     */
    hideProgress() {
        this.elements.progressContainer.classList.add('hidden');
    }

    /**
     * Обновить прогресс
     */
    updateProgress(message, percentage) {
        if (this.elements.progressText) {
            this.elements.progressText.textContent = message;
        }
        
        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${percentage}%`;
        }
        
        const percentageElement = this.elements.panel.querySelector('.progress-percentage');
        if (percentageElement) {
            percentageElement.textContent = `${Math.round(percentage)}%`;
        }
    }

    /**
     * Обновление статуса
     */
    updateStatus(message, type = 'info') {
        if (this.elements.statusText) {
            this.elements.statusText.textContent = message;
            
            // Устанавливаем цвет в зависимости от типа
            this.elements.statusText.className = 'status-text font-medium';
            
            switch (type) {
                case 'error':
                    this.elements.statusText.classList.add('text-red-600');
                    break;
                case 'warning':
                    this.elements.statusText.classList.add('text-yellow-600');
                    break;
                case 'success':
                    this.elements.statusText.classList.add('text-green-600');
                    break;
                default:
                    this.elements.statusText.classList.add('text-gray-600');
            }
        }
    }

    /**
     * Event emitter (упрощенная версия)
     */
    emit(event, data) {
        const customEvent = new CustomEvent(event, { detail: data });
        this.container.dispatchEvent(customEvent);
    }

    /**
     * Установка функции получения полигона
     */
    setPolygonProvider(fn) {
        this.getAreaPolygon = fn;
    }

    /**
     * Отключение элементов управления при ошибке или отсутствии токена
     */
    disableControls() {
        if (this.elements.loadButton) {
            this.elements.loadButton.disabled = true;
            this.elements.loadButton.textContent = 'Недоступно';
        }
        
        if (this.slimSelect) {
            this.slimSelect.disable();
        } else if (this.elements.categorySelect) {
            // Если SlimSelect не инициализирован, отключаем обычный select
            this.elements.categorySelect.disabled = true;
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        if (this.slimSelect) {
            this.slimSelect.destroy();
        }
        
        if (this.elements.panel) {
            this.elements.panel.remove();
        }
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InparsPanel;
} else {
    // Для браузера добавляем в глобальную область
    window.InparsPanel = InparsPanel;
}