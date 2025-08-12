/**
 * FlippingProfitabilityManager - интеграционный слой для отчёта доходности флиппинг
 * Совместимость между legacy ReportsManager и новой архитектурой v0.1
 * Управляет интерфейсом фильтров и координирует работу с FlippingController
 */
class FlippingProfitabilityManager {
    constructor(reportsManager) {
        this.reportsManager = reportsManager;
        this.database = window.db;
        this.eventBus = reportsManager.eventBus;
        
        // Интеграция с архитектурой v0.1
        this.flippingController = null;
        
        // Элементы интерфейса
        this.container = null;
        this.placeholder = null;
        this.content = null;
        this.filterContainer = null;
        this.mapContainer = null;
        this.tableContainer = null;
        
        // Фильтры
        this.currentFilters = {
            rooms: [],
            priceFrom: 0,
            priceTo: 10000000000,
            profitabilityPercent: 60,
            participants: 'flipper',
            profitSharing: '50/50',
            fixedPayment: 250000,
            financing: 'cash',
            downPayment: 20,
            mortgageRate: 17,
            mortgageTerm: 20,
            taxType: 'ip',
            renovationSpeed: 1.5,
            renovationType: 'auto',
            workCost: 10000,
            materialsCost: 10000,
            additionalExpenses: 100000
        };
        
        // Данные
        this.segments = [];
        this.subsegments = [];
        this.realEstateObjects = [];
        this.filteredObjects = [];
        
        // DataTable
        this.dataTable = null;
        
        this.debugEnabled = false;
    }

    /**
     * Инициализация менеджера
     */
    async initialize() {
        try {
            await this.loadDebugSettings();
            
            if (this.debugEnabled) {
                console.log('🏠 FlippingProfitabilityManager: Инициализация интеграционного слоя');
            }

            // Инициализация элементов интерфейса
            this.initializeElements();
            
            // Установка обработчиков событий
            this.setupEventHandlers();
            
            // Инициализация FlippingController из архитектуры v0.1
            await this.initializeFlippingController();
            
            if (this.debugEnabled) {
                console.log('🏠 FlippingProfitabilityManager: Интеграционный слой инициализирован');
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка инициализации:', error);
        }
    }

    /**
     * Инициализация FlippingController из модульной архитектуры
     */
    async initializeFlippingController() {
        try {
            // Получаем FlippingController через глобальную переменную
            if (window.flippingController) {
                this.flippingController = window.flippingController;
                console.log('✅ FlippingProfitabilityManager: FlippingController получен из глобальной области');
            } else if (window.areaArchitectureIntegration && window.areaArchitectureIntegration.flippingController) {
                this.flippingController = window.areaArchitectureIntegration.flippingController;
                console.log('✅ FlippingProfitabilityManager: FlippingController получен из интеграционного слоя');
            } else if (window.applicationController) {
                // Fallback - пытаемся получить через DI контейнер
                try {
                    this.flippingController = await window.applicationController.container.get('FlippingController');
                    // console.log('✅ FlippingProfitabilityManager: FlippingController получен из DI контейнера');
                } catch (error) {
                    console.warn('⚠️ FlippingProfitabilityManager: FlippingController не найден в DI контейнере');
                }
            } else {
                console.warn('⚠️ FlippingProfitabilityManager: Модульная архитектура не найдена, работа в legacy режиме');
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка инициализации FlippingController:', error);
        }
    }

    /**
     * Получение настроек отладки
     */
    async loadDebugSettings() {
        try {
            if (!this.database || !this.database.db) return;
            const settings = await this.database.getSettings();
            this.debugEnabled = settings.find(s => s.key === 'debug_enabled')?.value === true;
        } catch (error) {
            this.debugEnabled = false;
        }
    }

    /**
     * Инициализация элементов интерфейса
     */
    initializeElements() {
        this.container = document.getElementById('flippingProfitabilityContainer');
        this.placeholder = document.getElementById('flippingProfitabilityPlaceholder');
        this.content = document.getElementById('flippingProfitabilityContent');
        this.filterContainer = document.getElementById('flippingProfitabilityFilter');
        this.mapContainer = document.getElementById('flippingProfitabilityMap');
        this.tableContainer = document.getElementById('flippingTableContainer');

        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Элементы интерфейса инициализированы');
        }
    }

    /**
     * Установка обработчиков событий
     */
    setupEventHandlers() {
        // Кнопки фильтра количества комнат
        const roomButtons = this.filterContainer.querySelectorAll('[data-rooms]');
        roomButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleRoomFilterClick(e));
        });

        // Участники проекта
        const participantsButtons = this.filterContainer.querySelectorAll('[data-participants]');
        participantsButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleParticipantsClick(e));
        });

        // Форма раздела прибыли
        const profitSharingButtons = this.filterContainer.querySelectorAll('[data-profit-sharing]');
        profitSharingButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleProfitSharingClick(e));
        });

        // Источник финансирования
        const financingButtons = this.filterContainer.querySelectorAll('[data-financing]');
        financingButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleFinancingClick(e));
        });

        // Тип налогообложения
        const taxButtons = this.filterContainer.querySelectorAll('[data-tax]');
        taxButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleTaxClick(e));
        });

        // Расчёт стоимости ремонта
        const renovationButtons = this.filterContainer.querySelectorAll('[data-renovation]');
        renovationButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleRenovationClick(e));
        });

        // Кнопка применения фильтра
        const applyButton = document.getElementById('flippingApplyFilterBtn');
        if (applyButton) {
            applyButton.addEventListener('click', () => this.applyFilters());
        }

        // Поля ввода
        this.setupInputHandlers();

        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Обработчики событий установлены');
        }
    }

    /**
     * Установка обработчиков для полей ввода
     */
    setupInputHandlers() {
        // Цена
        const priceFromInput = document.getElementById('flippingPriceFrom');
        const priceToInput = document.getElementById('flippingPriceTo');
        
        if (priceFromInput) {
            priceFromInput.addEventListener('input', (e) => {
                this.currentFilters.priceFrom = parseInt(e.target.value) || 0;
            });
        }
        
        if (priceToInput) {
            priceToInput.addEventListener('input', (e) => {
                this.currentFilters.priceTo = parseInt(e.target.value) || 10000000000;
            });
        }

        // Процент для пересчёта доходности
        const profitabilityPercentInput = document.getElementById('flippingProfitabilityPercent');
        if (profitabilityPercentInput) {
            profitabilityPercentInput.addEventListener('input', (e) => {
                this.currentFilters.profitabilityPercent = parseInt(e.target.value) || 60;
            });
        }

        // Остальные поля ввода
        const inputMappings = {
            'flippingFixedPayment': 'fixedPayment',
            'flippingDownPayment': 'downPayment',
            'flippingMortgageRate': 'mortgageRate',
            'flippingMortgageTerm': 'mortgageTerm',
            'flippingRenovationSpeed': 'renovationSpeed',
            'flippingWorkCost': 'workCost',
            'flippingMaterialsCost': 'materialsCost',
            'flippingAdditionalExpenses': 'additionalExpenses'
        };

        Object.entries(inputMappings).forEach(([inputId, filterKey]) => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.currentFilters[filterKey] = parseFloat(e.target.value) || 0;
                });
            }
        });
    }

    /**
     * Обработчик клика по кнопкам количества комнат
     */
    handleRoomFilterClick(event) {
        const button = event.target;
        const roomValue = button.dataset.rooms;
        
        // Проверяем текущее состояние кнопки
        const isActive = button.classList.contains('bg-blue-500');
        
        if (isActive) {
            // Деактивировать кнопку
            this.setButtonInactive(button);
            // Удалить из фильтра
            const index = this.currentFilters.rooms.indexOf(roomValue);
            if (index > -1) {
                this.currentFilters.rooms.splice(index, 1);
            }
        } else {
            // Активировать кнопку
            this.setButtonActive(button);
            // Добавить в фильтр
            this.currentFilters.rooms.push(roomValue);
        }
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Фильтр комнат обновлён:', this.currentFilters.rooms);
        }
    }

    /**
     * Установка активного состояния кнопки
     */
    setButtonActive(button) {
        button.classList.remove('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-100', 'hover:border-gray-400');
        button.classList.add('bg-blue-500', 'text-white', 'border-blue-500', 'hover:bg-blue-600');
    }

    /**
     * Установка неактивного состояния кнопки
     */
    setButtonInactive(button) {
        button.classList.remove('bg-blue-500', 'text-white', 'border-blue-500', 'hover:bg-blue-600');
        button.classList.add('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-100', 'hover:border-gray-400');
    }

    /**
     * Обработчик клика по участникам проекта
     */
    handleParticipantsClick(event) {
        const button = event.target;
        const value = button.dataset.participants;
        
        // Снятие активности с других кнопок
        const allButtons = this.filterContainer.querySelectorAll('[data-participants]');
        allButtons.forEach(btn => {
            this.setButtonInactive(btn);
        });
        
        // Активация текущей кнопки
        this.setButtonActive(button);
        
        this.currentFilters.participants = value;
        
        // Показ/скрытие условных полей
        this.toggleConditionalFields('participants', value);
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Участники проекта:', value);
        }
    }

    /**
     * Обработчик клика по форме раздела прибыли
     */
    handleProfitSharingClick(event) {
        const button = event.target;
        const value = button.dataset.profitSharing;
        
        // Снятие активности с других кнопок
        const allButtons = this.filterContainer.querySelectorAll('[data-profit-sharing]');
        allButtons.forEach(btn => {
            this.setButtonInactive(btn);
        });
        
        // Активация текущей кнопки
        this.setButtonActive(button);
        
        this.currentFilters.profitSharing = value;
        
        // Показ/скрытие поля фиксированной оплаты
        this.toggleConditionalFields('profitSharing', value);
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Форма раздела прибыли:', value);
        }
    }

    /**
     * Обработчик клика по источнику финансирования
     */
    handleFinancingClick(event) {
        const button = event.target;
        const value = button.dataset.financing;
        
        // Снятие активности с других кнопок
        const allButtons = this.filterContainer.querySelectorAll('[data-financing]');
        allButtons.forEach(btn => {
            this.setButtonInactive(btn);
        });
        
        // Активация текущей кнопки
        this.setButtonActive(button);
        
        this.currentFilters.financing = value;
        
        // Показ/скрытие параметров ипотеки
        this.toggleConditionalFields('financing', value);
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Источник финансирования:', value);
        }
    }

    /**
     * Обработчик клика по типу налогообложения
     */
    handleTaxClick(event) {
        const button = event.target;
        const value = button.dataset.tax;
        
        // Снятие активности с других кнопок
        const allButtons = this.filterContainer.querySelectorAll('[data-tax]');
        allButtons.forEach(btn => {
            this.setButtonInactive(btn);
        });
        
        // Активация текущей кнопки
        this.setButtonActive(button);
        
        this.currentFilters.taxType = value;
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Тип налогообложения:', value);
        }
    }

    /**
     * Обработчик клика по расчёту стоимости ремонта
     */
    handleRenovationClick(event) {
        const button = event.target;
        const value = button.dataset.renovation;
        
        // Снятие активности с других кнопок
        const allButtons = this.filterContainer.querySelectorAll('[data-renovation]');
        allButtons.forEach(btn => {
            this.setButtonInactive(btn);
        });
        
        // Активация текущей кнопки
        this.setButtonActive(button);
        
        this.currentFilters.renovationType = value;
        
        // Показ/скрытие параметров ручного расчёта
        this.toggleConditionalFields('renovation', value);
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Тип расчёта ремонта:', value);
        }
    }

    /**
     * Управление условной видимостью полей
     */
    toggleConditionalFields(type, value) {
        switch (type) {
            case 'participants':
                const profitSharingSection = document.getElementById('flippingProfitSharingSection');
                if (profitSharingSection) {
                    if (value === 'flipper-investor') {
                        profitSharingSection.classList.remove('hidden');
                        profitSharingSection.classList.add('show');
                    } else {
                        profitSharingSection.classList.add('hidden');
                        profitSharingSection.classList.remove('show');
                    }
                }
                break;
                
            case 'profitSharing':
                const fixedPaymentSection = document.getElementById('flippingFixedPaymentSection');
                if (fixedPaymentSection) {
                    if (value === 'fix+30/70' || value === 'fix/100') {
                        fixedPaymentSection.classList.remove('hidden');
                        fixedPaymentSection.classList.add('show');
                    } else {
                        fixedPaymentSection.classList.add('hidden');
                        fixedPaymentSection.classList.remove('show');
                    }
                }
                break;
                
            case 'financing':
                const mortgageSection = document.getElementById('flippingMortgageSection');
                if (mortgageSection) {
                    if (value === 'mortgage') {
                        mortgageSection.classList.remove('hidden');
                        mortgageSection.classList.add('show');
                    } else {
                        mortgageSection.classList.add('hidden');
                        mortgageSection.classList.remove('show');
                    }
                }
                break;
                
            case 'renovation':
                const manualSection = document.getElementById('flippingManualRenovationSection');
                if (manualSection) {
                    if (value === 'manual') {
                        manualSection.classList.remove('hidden');
                        manualSection.classList.add('show');
                    } else {
                        manualSection.classList.add('hidden');
                        manualSection.classList.remove('show');
                    }
                }
                break;
        }
    }

    /**
     * Получение текущего сегмента из ReportsManager
     */
    getCurrentSegmentData() {
        console.log('🔍 FlippingProfitabilityManager: reportsManager.currentSegment:', this.reportsManager.currentSegment);
        console.log('🔍 FlippingProfitabilityManager: reportsManager.currentSubsegment:', this.reportsManager.currentSubsegment);
        console.log('🔍 FlippingProfitabilityManager: reportsManager.segments:', this.reportsManager.segments);
        
        // Если текущий сегмент не выбран, используем первый доступный
        let segment = this.reportsManager.currentSegment;
        if (!segment && this.reportsManager.segments && this.reportsManager.segments.length > 0) {
            segment = this.reportsManager.segments[0];
            console.log('🔍 FlippingProfitabilityManager: Используем первый доступный сегмент:', segment.name);
        }
        
        return {
            segment: segment,
            subsegment: this.reportsManager.currentSubsegment
        };
    }

    /**
     * Загрузка данных из базы 
     */
    async loadData() {
        try {
            if (!this.database || !this.database.db) {
                throw new Error('База данных недоступна');
            }

            // Получаем текущий сегмент из ReportsManager
            const segmentData = this.getCurrentSegmentData();
            
            if (!segmentData.segment) {
                throw new Error('Не выбран сегмент');
            }

            if (this.debugEnabled) {
                console.log('🏠 FlippingProfitabilityManager: Загрузка данных для сегмента:', segmentData.segment.name);
            }

            // Загружаем объекты недвижимости
            const transaction = this.database.db.transaction(['real_estate_objects', 'addresses'], 'readonly');
            const objectStore = transaction.objectStore('real_estate_objects');
            const addressStore = transaction.objectStore('addresses');

            // Загружаем все объекты для данного сегмента  
            const objects = [];
            const cursor = await objectStore.index('segment_id').openCursor(segmentData.segment.id);
            
            while (cursor) {
                const realEstateObject = cursor.value;
                
                // Загружаем адрес для объекта
                if (realEstateObject.address_id) {
                    const address = await addressStore.get(realEstateObject.address_id);
                    if (address && address.latitude && address.longitude) {
                        realEstateObject.address = address;
                        objects.push(realEstateObject);
                    }
                }
                
                cursor.continue();
            }

            this.realEstateObjects = objects;

            if (this.debugEnabled) {
                console.log('🏠 FlippingProfitabilityManager: Загружено объектов:', objects.length);
            }

            return objects;

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки данных:', error);
            throw error;
        }
    }

    /**
     * Фильтрация объектов по заданным параметрам
     */
    filterObjects(objects) {
        if (!objects || objects.length === 0) return [];

        const filtered = objects.filter(obj => {
            // Фильтр по количеству комнат
            if (this.currentFilters.rooms.length > 0) {
                const objRooms = obj.rooms ? obj.rooms.toString() : 'studio';
                const roomsMatch = this.currentFilters.rooms.some(room => {
                    if (room === 'studio') return objRooms === 'studio' || objRooms === '0';
                    if (room === '4+') return parseInt(objRooms) >= 4;
                    return objRooms === room;
                });
                if (!roomsMatch) return false;
            }

            // Фильтр по цене
            if (obj.price) {
                if (obj.price < this.currentFilters.priceFrom || obj.price > this.currentFilters.priceTo) {
                    return false;
                }
            }

            return true;
        });

        if (this.debugEnabled) {
            console.log('🏠 FlippingProfitabilityManager: Отфильтровано объектов:', filtered.length);
        }

        return filtered;
    }

    /**
     * Применение фильтров и обновление отчёта
     */
    async applyFilters() {
        try {
            if (this.debugEnabled) {
                console.log('🏠 FlippingProfitabilityManager: Применение фильтров:', this.currentFilters);
            }
            
            this.showPlaceholder("Загрузка данных...");
            
            // Проверяем доступность модульной архитектуры
            if (this.flippingController) {
                await this.applyFiltersModular();
            } else {
                await this.applyFiltersLegacy();
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка применения фильтров:', error);
            this.showPlaceholder("Ошибка при загрузке данных: " + error.message);
        }
    }

    /**
     * Применение фильтров через модульную архитектуру
     */
    async applyFiltersModular() {
        try {
            console.log('🔍 FlippingProfitabilityManager: Начинаем применение фильтров через модульную архитектуру');
            
            // Получаем текущий сегмент из ReportsManager
            const segmentData = this.getCurrentSegmentData();
            console.log('🔍 FlippingProfitabilityManager: Получены данные сегмента:', segmentData);
            
            if (!segmentData.segment) {
                throw new Error('Не выбран сегмент для анализа');
            }

            console.log('🔍 FlippingProfitabilityManager: Передаем сегмент в контроллер:', segmentData.segment.name || segmentData.segment.id);
            // Передаём сегмент в контроллер
            this.flippingController.setCurrentSegment(segmentData.segment);
            
            console.log('🔍 FlippingProfitabilityManager: Передаем фильтры в контроллер:', this.currentFilters);
            // Передаём фильтры в контроллер
            this.flippingController.handleFilterChange(this.currentFilters);
            
            console.log('🔍 FlippingProfitabilityManager: Вызываем applyFilters() контроллера');
            console.log('🔍 FlippingProfitabilityManager: flippingController существует:', !!this.flippingController);
            console.log('🔍 FlippingProfitabilityManager: flippingController.applyFilters существует:', typeof this.flippingController.applyFilters);
            
            // Применяем фильтры через контроллер v0.1
            const filteredObjects = await this.flippingController.applyFilters();
            
            console.log('🔍 FlippingProfitabilityManager: Контроллер вернул объектов:', filteredObjects?.length || 0);
            console.log('🔍 FlippingProfitabilityManager: Тип результата:', typeof filteredObjects);
            console.log('🔍 FlippingProfitabilityManager: Результат isArray:', Array.isArray(filteredObjects));
            
            if (filteredObjects && filteredObjects.length > 0) {
                this.filteredObjects = filteredObjects;
                console.log('🔍 FlippingProfitabilityManager: Показываем контент с объектами:', filteredObjects.length);
                this.showContent();
                
                if (this.debugEnabled) {
                    console.log('🏠 FlippingProfitabilityManager: Данные обновлены через модульную архитектуру, объектов:', filteredObjects.length);
                }
            } else {
                throw new Error('Нет объектов для отображения');
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка v0.1:', error);
            this.showPlaceholder("Ошибка: " + error.message);
        }
    }

    /**
     * Применение фильтров в legacy режиме
     */
    async applyFiltersLegacy() {
        try {
            // Загружаем данные из базы
            const objects = await this.loadData();
            
            if (objects.length === 0) {
                this.showPlaceholder("В выбранном сегменте нет объектов с координатами");
                return;
            }

            // Применяем фильтры
            this.filteredObjects = this.filterObjects(objects);
            
            if (this.filteredObjects.length === 0) {
                this.showPlaceholder("Нет объектов, соответствующих заданным фильтрам");
                return;
            }

            // Показываем результат
            this.showContent();
            
            // Обновляем таблицу и карту в legacy режиме
            await this.updateTableLegacy();
            await this.updateMapLegacy();
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Показ/скрытие плейсхолдера
     */
    showPlaceholder(message) {
        if (this.placeholder) {
            this.placeholder.textContent = message;
            this.placeholder.classList.remove('hidden');
        }
        
        if (this.content) {
            this.content.classList.add('hidden');
        }
    }

    /**
     * Показ содержимого отчёта
     */
    showContent() {
        if (this.placeholder) {
            this.placeholder.classList.add('hidden');
        }
        
        if (this.content) {
            this.content.classList.remove('hidden');
        }
    }

    /**
     * Показ отчёта (вызывается из ReportsManager)
     */
    async show() {
        try {
            console.log('🔍 FlippingProfitabilityManager: show() метод вызван');
            
            // Инициализация, если ещё не была выполнена
            if (!this.container) {
                console.log('🔍 FlippingProfitabilityManager: Контейнер не найден, инициализируем');
                await this.initialize();
            }
            
            console.log('🔍 FlippingProfitabilityManager: Показываем контент');
            // Показ основного интерфейса вместо плейсхолдера
            this.showContent();
            
            console.log('🔍 FlippingProfitabilityManager: Вызываем applyFilters()');
            // Применяем фильтры для загрузки данных
            await this.applyFilters();
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка показа отчёта:', error);
        }
    }

    /**
     * Скрытие отчёта
     */
    hide() {
        // Пока ничего не делаем, так как отчёт управляется через ReportsManager
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingProfitabilityManager;
}