/**
 * Утилита для проверки готовности базы данных
 */
class DatabaseUtils {
    /**
     * Проверяет готовность базы данных
     */
    static async ensureDatabaseReady(timeout = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (window.db && window.db.db) {
                // Дополнительная проверка - БД действительно доступна
                try {
                    // Проверяем доступность одной из основных таблиц
                    const transaction = window.db.db.transaction(['settings'], 'readonly');
                    return true;
                } catch (error) {
                    // БД не готова, продолжаем ждать
                }
            }
            
            // Ждём 100мс перед следующей проверкой
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error(`База данных не готова в течение ${timeout}ms`);
    }
}

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
        this.chartContainer = null;
        
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
        
        // График коридора рынка
        this.marketCorridorChart = null;
        this.marketCorridorMode = 'sales'; // 'sales' или 'history'
        this.currentPointsData = []; // Данные точек для tooltip
        
        // Селектор оценки объекта
        this.selectedObjectId = null;
        this.evaluationSlimSelect = null;
        
        this.debugEnabled = false;
        
        // Флаг для предотвращения повторной установки обработчиков
        this.globalFilterHandlersSetup = false;
        
        // Debouncing для предотвращения множественных вызовов onGlobalFiltersChanged
        this.filterChangeTimeout = null;
        this.filterChangeDelay = 300; // 300ms задержка
        
        // Debouncing для предотвращения множественных вызовов applyFilters
        this.applyFiltersTimeout = null;
        this.applyFiltersDelay = 250; // 250ms задержка
        
        // Флаг для предотвращения одновременного выполнения applyFilters
        this.applyFiltersInProgress = false;
    }

    /**
     * Инициализация менеджера
     */
    async initialize() {
        try {
            await this.loadDebugSettings();
            

            // Инициализация элементов интерфейса
            this.initializeElements();
            
            // Установка обработчиков событий
            this.setupEventHandlers();
            
            // Инициализация FlippingController из архитектуры v0.1
            await this.initializeFlippingController();
            
            
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
            } else if (window.areaArchitectureIntegration && window.areaArchitectureIntegration.flippingController) {
                this.flippingController = window.areaArchitectureIntegration.flippingController;
            } else if (window.applicationController) {
                // Fallback - пытаемся получить через DI контейнер
                try {
                    this.flippingController = await window.applicationController.container.get('FlippingController');
                } catch (error) {
                }
            } else {
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
        this.chartContainer = document.getElementById('flippingMarketCorridorChart');
        this.objectsGrid = document.getElementById('flippingObjectsGrid');
        this.evaluationSelect = document.getElementById('objectEvaluationSelect');
        this.investmentTable = document.getElementById('flippingTable');

        // Объекты карты (скопировано из MapManager)
        this.map = null;
        this.drawnItems = null;
        this.drawControl = null;
        this.drawnPolygon = null;
        this.areaPolygonLayer = null;
        
        // Слои карты
        this.mapLayers = {
            addresses: null,
            objects: null,
            listings: null
        };
        
        // Кластеризация маркеров
        this.addressesCluster = null;
        this.listingsCluster = null;
        
        // Состояние карты
        this.mapState = {
            initialized: false,
            activeFilter: 'year', // по умолчанию показываем год постройки
            defaultCenter: CONSTANTS.MAP_CONFIG.DEFAULT_CENTER,
            defaultZoom: CONSTANTS.MAP_CONFIG.DEFAULT_ZOOM
        };
        
        // Инициализация пространственного индекса для оптимизации
        this.spatialIndex = window.geoUtils || new GeoUtils();
        this.indexedAddresses = new Map(); // Кэш для быстрого доступа к индексированным адресам
        this.markerCache = new Map(); // Кэш созданных маркеров для повторного использования
        
        // Активный фильтр для отображения информации на маркерах (синхронизируем с mapState)
        this.activeMapFilter = this.mapState.activeFilter;

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

        // Переключатель режима графика коридора рынка
        const modeSelect = document.getElementById('flippingMarketCorridorMode');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                this.marketCorridorMode = e.target.value;
                this.updateMarketCorridorChart();
            });
        }

        // Поля ввода
        this.setupInputHandlers();
        
        // Инициализация SlimSelect для селектора оценки объекта
        this.initializeEvaluationSelect();

        // Обработчики глобальных фильтров будут настроены позже в show()

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
     * Настройка обработчиков для глобальных фильтров из ReportsManager
     */
    setupGlobalFilterHandlers() {
        // Предотвращаем повторную установку обработчиков
        if (this.globalFilterHandlersSetup) {
            if (this.debugEnabled) {
                console.log('🔍 FlippingProfitabilityManager: Обработчики глобальных фильтров уже настроены');
            }
            return;
        }
        // Подписываемся на события изменения сегментов и дат через EventBus
        if (this.eventBus) {
            // Обновление при изменении сегментов
            this.eventBus.on(CONSTANTS.EVENTS.SEGMENTS_UPDATED, () => {
                this.onGlobalFiltersChanged();
            });

            // Обновление при изменении текущего сегмента
            this.eventBus.on(CONSTANTS.EVENTS.SEGMENT_UPDATED, () => {
                this.onGlobalFiltersChanged();
            });
        }

        // Подписываемся на изменения фильтров дат из ReportsManager
        if (this.reportsManager.dateFromFilter) {
            this.reportsManager.dateFromFilter.addEventListener('change', () => {
                this.onGlobalFiltersChanged();
            });
        }

        if (this.reportsManager.dateToFilter) {
            this.reportsManager.dateToFilter.addEventListener('change', () => {
                this.onGlobalFiltersChanged();
            });
        }

        // Вместо попытки подключиться к SlimSelect, расширяем методы ReportsManager
        this.extendReportsManagerMethods();
        
        // Устанавливаем флаг успешной настройки
        this.globalFilterHandlersSetup = true;
        
        if (this.debugEnabled) {
            console.log('✅ FlippingProfitabilityManager: Обработчики глобальных фильтров настроены');
        }
    }

    /**
     * Расширение методов ReportsManager для получения уведомлений об изменениях
     */
    extendReportsManagerMethods() {
        try {
            
            // Сохраняем оригинальные методы
            const originalHandleSegmentChange = this.reportsManager.handleSegmentChange.bind(this.reportsManager);
            const originalHandleSubsegmentChange = this.reportsManager.handleSubsegmentChange.bind(this.reportsManager);
            
            // Расширяем handleSegmentChange
            this.reportsManager.handleSegmentChange = async (segmentId) => {
                // Вызываем оригинальный метод
                const result = await originalHandleSegmentChange(segmentId);
                
                // Убираем дополнительный setTimeout - обновление происходит через EventBus события
                
                return result;
            };
            
            // Расширяем handleSubsegmentChange
            this.reportsManager.handleSubsegmentChange = async (subsegmentId) => {
                // Вызываем оригинальный метод
                const result = await originalHandleSubsegmentChange(subsegmentId);
                
                // Убираем дополнительный setTimeout - обновление происходит через EventBus события
                
                return result;
            };
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка расширения методов ReportsManager:', error);
        }
    }

    /**
     * Обработчик изменения глобальных фильтров (debounced версия)
     */
    onGlobalFiltersChanged() {
        // Отменяем предыдущий timeout если он существует
        if (this.filterChangeTimeout) {
            clearTimeout(this.filterChangeTimeout);
        }
        
        // Устанавливаем новый timeout
        this.filterChangeTimeout = setTimeout(() => {
            this.onGlobalFiltersChangedImmediate();
        }, this.filterChangeDelay);
    }
    
    /**
     * Немедленное выполнение обновления после изменения глобальных фильтров
     */
    async onGlobalFiltersChangedImmediate() {
        try {
            // Проверяем, показан ли отчёт флиппинга
            const flippingCheck = document.getElementById('flippingProfitabilityReportCheck');
            const isFlippingReportVisible = flippingCheck?.checked || false;
            
            if (!isFlippingReportVisible) {
                return;
            }

            // Проверяем, инициализирован ли отчёт
            if (!this.container || this.container.classList.contains('hidden')) {
                return;
            }

            // Перезагружаем данные с новыми фильтрами
            await this.applyFiltersImmediate();

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления после изменения глобальных фильтров:', error);
        }
    }

    /**
     * Инициализация SlimSelect для селектора оценки объекта
     */
    initializeEvaluationSelect() {
        if (!this.evaluationSelect) return;
        
        // Инициализируем SlimSelect
        this.evaluationSlimSelect = new SlimSelect({
            select: this.evaluationSelect,
            settings: {
                showSearch: false,
                placeholderText: 'Выберите оценку',
                allowDeselect: true
            }
        });
        
        // Добавляем обработчик изменения значения
        this.evaluationSelect.addEventListener('change', (e) => {
            this.onEvaluationChange(e.target.value);
        });
    }

    /**
     * Обработчик изменения оценки объекта
     */
    onEvaluationChange(evaluation) {
        if (this.selectedObjectId && evaluation) {
            this.saveObjectEvaluation(this.selectedObjectId, evaluation);
        }
    }

    /**
     * Сохранение оценки объекта в базу данных
     */
    async saveObjectEvaluation(objectId, evaluation) {
        try {
            if (!window.db || !window.db.db) {
                console.error('❌ FlippingProfitabilityManager: База данных недоступна');
                return;
            }
            
            // Обновляем объект недвижимости с новой оценкой
            const transaction = window.db.db.transaction(['real_estate_objects'], 'readwrite');
            const store = transaction.objectStore('real_estate_objects');
            
            // Получаем объект
            const objectRequest = store.get(parseInt(objectId));
            objectRequest.onsuccess = (event) => {
                const object = event.target.result;
                if (object) {
                    // Добавляем поле оценки
                    object.user_evaluation = evaluation;
                    
                    // Сохраняем обновлённый объект
                    const updateRequest = store.put(object);
                    updateRequest.onsuccess = () => {
                        if (this.debugEnabled) {
                            console.log('🔍 FlippingProfitabilityManager: Сохранена оценка объекта:', objectId, evaluation);
                        }
                    };
                    updateRequest.onerror = (error) => {
                        console.error('❌ FlippingProfitabilityManager: Ошибка сохранения оценки:', error);
                    };
                }
            };
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка сохранения оценки объекта:', error);
        }
    }

    /**
     * Загрузка текущей оценки объекта и установка в селектор
     */
    async loadObjectEvaluation(objectId) {
        try {
            if (!window.db || !window.db.db) {
                console.error('❌ FlippingProfitabilityManager: База данных недоступна');
                return;
            }
            
            // Получаем объект из базы данных
            const transaction = window.db.db.transaction(['real_estate_objects'], 'readonly');
            const store = transaction.objectStore('real_estate_objects');
            
            const objectRequest = store.get(parseInt(objectId));
            objectRequest.onsuccess = (event) => {
                const object = event.target.result;
                if (object && object.user_evaluation) {
                    // Устанавливаем значение в селекторе
                    if (this.evaluationSlimSelect) {
                        this.evaluationSlimSelect.setSelected(object.user_evaluation);
                    } else {
                        // Fallback для обычного select
                        this.evaluationSelect.value = object.user_evaluation;
                    }
                    
                    if (this.debugEnabled) {
                        console.log('🔍 FlippingProfitabilityManager: Загружена оценка объекта:', objectId, object.user_evaluation);
                    }
                } else {
                    // Сбрасываем селектор если оценки нет
                    if (this.evaluationSlimSelect) {
                        this.evaluationSlimSelect.setSelected('');
                    } else {
                        this.evaluationSelect.value = '';
                    }
                }
            };
            
            objectRequest.onerror = (error) => {
                console.error('❌ FlippingProfitabilityManager: Ошибка загрузки оценки объекта:', error);
            };
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки оценки объекта:', error);
        }
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
        
        // Если текущий сегмент не выбран, используем первый доступный
        let segment = this.reportsManager.currentSegment;
        if (!segment && this.reportsManager.segments && this.reportsManager.segments.length > 0) {
            segment = this.reportsManager.segments[0];
        }
        
        return {
            segment: segment,
            subsegment: this.reportsManager.currentSubsegment
        };
    }

    /**
     * Получение активных фильтров из ReportsManager
     */
    getActiveReportFilters() {
        const filters = {
            segment: this.reportsManager.currentSegment,
            subsegment: this.reportsManager.currentSubsegment,
            dateFrom: null,
            dateTo: null
        };

        // Получаем фильтры периода
        if (this.reportsManager.dateFromFilter && this.reportsManager.dateFromFilter.value) {
            filters.dateFrom = new Date(this.reportsManager.dateFromFilter.value);
        }
        
        if (this.reportsManager.dateToFilter && this.reportsManager.dateToFilter.value) {
            filters.dateTo = new Date(this.reportsManager.dateToFilter.value);
        }

        // Принудительная отладка фильтров для диагностики
        if (this.debugEnabled) {
            console.log('🔧 FlippingProfitabilityManager: Активные фильтры отчётов:', {
                segment: filters.segment ? `${filters.segment.name} (id: ${filters.segment.id})` : 'нет',
                subsegment: filters.subsegment ? `${filters.subsegment.name} (id: ${filters.subsegment.id})` : 'нет',
                dateFrom: filters.dateFrom ? filters.dateFrom.toISOString().split('T')[0] : 'нет',
                dateTo: filters.dateTo ? filters.dateTo.toISOString().split('T')[0] : 'нет'
            });
        }

        return filters;
    }

    /**
     * Загрузка данных из базы 
     */
    async loadData() {
        try {
            
            // Получаем глобальные фильтры из ReportsManager (как ComparativeAnalysisManager)
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                return [];
            }
            
            // Используем глобальные фильтры отчетов (как ComparativeAnalysisManager)
            const segmentId = this.reportsManager.currentSegment?.id;
            const subsegmentId = this.reportsManager.currentSubsegment?.id;
            const dateFrom = new Date(this.reportsManager.dateFromFilter?.value || '2023-01-01');
            const dateTo = new Date(this.reportsManager.dateToFilter?.value || new Date().toISOString().split('T')[0]);
            
            
            // Получаем объекты с помощью ReportsManager (используем ту же логику фильтрации как ComparativeAnalysisManager)
            const objects = await this.reportsManager.getFilteredRealEstateObjects(
                currentArea.id, segmentId, subsegmentId, dateFrom, dateTo
            );
            
            
            this.realEstateObjects = objects;
            return objects;

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки данных:', error);
            throw error;
        }
    }

    /**
     * Фильтрация объектов по заданным параметрам и фильтрам отчётов
     */
    filterObjects(objects) {
        if (!objects || objects.length === 0) return [];

        // Получаем активные фильтры отчётов
        const reportFilters = this.getActiveReportFilters();

        const filtered = objects.filter(obj => {
            // Фильтр по сегменту и подсегменту (из ReportsManager)
            if (reportFilters.segment && obj.segment_id !== reportFilters.segment.id) {
                return false;
            }

            if (reportFilters.subsegment && obj.subsegment_id !== reportFilters.subsegment.id) {
                return false;
            }

            // Фильтр по периоду (дата создания/обновления объекта)
            if (reportFilters.dateFrom || reportFilters.dateTo) {
                const objDate = new Date(obj.updated || obj.created);
                
                if (reportFilters.dateFrom && objDate < reportFilters.dateFrom) {
                    return false;
                }
                
                if (reportFilters.dateTo && objDate > reportFilters.dateTo) {
                    return false;
                }
            }

            // Фильтр по количеству комнат (из собственных фильтров флиппинга)
            if (this.currentFilters.rooms.length > 0) {
                const objRooms = obj.rooms ? obj.rooms.toString() : 'studio';
                const roomsMatch = this.currentFilters.rooms.some(room => {
                    if (room === 'studio') return objRooms === 'studio' || objRooms === '0';
                    if (room === '4+') return parseInt(objRooms) >= 4;
                    return objRooms === room;
                });
                if (!roomsMatch) return false;
            }

            return true;
        });

        if (this.debugEnabled) {
            console.log('🔍 FlippingProfitabilityManager: Применены фильтры отчётов:', reportFilters);
            console.log('🔍 FlippingProfitabilityManager: Отфильтровано объектов:', filtered.length, 'из', objects.length);
        }

        return filtered;
    }

    /**
     * Применение фильтров и обновление отчёта (debounced версия)
     */
    applyFilters() {
        // Отменяем предыдущий timeout если он существует
        if (this.applyFiltersTimeout) {
            clearTimeout(this.applyFiltersTimeout);
        }
        
        // Устанавливаем новый timeout
        this.applyFiltersTimeout = setTimeout(() => {
            this.applyFiltersImmediate();
        }, this.applyFiltersDelay);
    }

    /**
     * Немедленное применение фильтров без debouncing
     */
    async applyFiltersImmediate() {
        // Предотвращаем одновременное выполнение
        if (this.applyFiltersInProgress) {
            return;
        }
        
        this.applyFiltersInProgress = true;
        
        try {
            this.showPlaceholder("Загрузка данных...");
            
            // Используем модульную архитектуру v0.1 если доступна
            if (this.flippingController) {
                await this.applyFiltersModular();
            } else {
                await this.applyFiltersLegacy();
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка применения фильтров:', error);
            this.showPlaceholder("Ошибка при загрузке данных: " + error.message);
        } finally {
            // Сбрасываем флаг выполнения
            this.applyFiltersInProgress = false;
        }
    }

    /**
     * Применение фильтров через модульную архитектуру
     */
    async applyFiltersModular() {
        try {
            
            // Получаем глобальные фильтры из ReportsManager (включая подсегменты)
            const globalFilters = this.getActiveReportFilters();
            
            // Получаем текущий сегмент из ReportsManager
            const segmentData = this.getCurrentSegmentData();
            
            
            if (!segmentData.segment) {
                throw new Error('Не выбран сегмент для анализа');
            }

            // Передаём сегмент в контроллер
            this.flippingController.setCurrentSegment(segmentData.segment);
            
            // ВАЖНО: Объединяем глобальные фильтры с локальными фильтрами флиппинга
            const combinedFilters = {
                ...this.currentFilters,
                // Добавляем глобальные фильтры
                globalSegment: globalFilters.segment,
                globalSubsegment: globalFilters.subsegment,
                globalDateFrom: globalFilters.dateFrom,
                globalDateTo: globalFilters.dateTo
            };
            
            
            // Передаём объединённые фильтры в контроллер
            this.flippingController.handleFilterChange(combinedFilters);
            
            
            // Получаем текущую область и передаём её в контроллер
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                throw new Error('Не выбрана область для анализа');
            }
            
            // Применяем фильтры через контроллер v0.1, передавая область и ReportsManager
            const filteredObjects = await this.flippingController.applyFiltersWithAreaAndReportsManager(
                currentArea, globalFilters, this.reportsManager
            );
            
            
            if (filteredObjects && filteredObjects.length > 0) {
                this.filteredObjects = filteredObjects;
                this.showContent();
                
                // Загружаем адреса для корректного отображения
                await this.loadAddresses();
                
                // Загружаем данные на карту
                await this.loadMapData();
                
                // Создаём график коридора рынка
                await this.createMarketCorridorChart();
                
                // Обновляем панель объектов
                this.updateObjectsDisplay();
                
            } else {
                // Показываем плейсхолдер вместо ошибки когда нет объектов
                this.showPlaceholder('Нет объектов для инвестирования в выбранном сегменте/подсегменте');
                return; // Успешно завершаем, не выбрасывая ошибку
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

            // ReportsManager уже отфильтровал объекты по сегментам, используем их напрямую
            this.filteredObjects = objects;
            
            
            if (this.filteredObjects.length === 0) {
                this.showPlaceholder("Нет объектов, соответствующих заданным фильтрам");
                return;
            }

            // Показываем результат
            this.showContent();
            
            // Загружаем адреса для корректного отображения
            await this.loadAddresses();
            
            // Обновляем карту в legacy режиме
            await this.loadMapData();
            
            // Создаём график коридора рынка
            await this.createMarketCorridorChart();
            
            // Обновляем панель объектов
            this.updateObjectsDisplay();
            
            // Обновляем таблицу объектов для инвестирования
            this.updateInvestmentTable();
            
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
            // Ожидаем готовности базы данных перед любыми операциями
            try {
                await DatabaseUtils.ensureDatabaseReady();
                if (this.debugEnabled) {
                    console.log('✅ FlippingProfitabilityManager: База данных готова');
                }
            } catch (error) {
                console.error('❌ FlippingProfitabilityManager: База данных не готова:', error);
                this.showPlaceholder('База данных не готова. Попробуйте позже.');
                return;
            }
            
            // Инициализация, если ещё не была выполнена
            if (!this.container) {
                await this.initialize();
            }
            
            // Показ основного интерфейса вместо плейсхолдера
            this.showContent();
            
            // Настройка обработчиков глобальных фильтров (после инициализации ReportsManager)
            this.setupGlobalFilterHandlers();
            
            // Инициализация карты
            await this.initMap();
            
            // Применяем фильтры для загрузки данных
            await this.applyFiltersImmediate();
            
            // Дополнительное исправление размера карты после показа отчёта
            this.invalidateMapSize();
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка показа отчёта:', error);
            this.showPlaceholder('Ошибка загрузки отчёта: ' + error.message);
        }
    }

    /**
     * Исправление размера карты после показа отчёта
     */
    invalidateMapSize() {
        // Исправляем размер карты с задержкой, чтобы контейнер успел отобразиться
        setTimeout(() => {
            try {
                // Через FlippingController (модульная архитектура)
                if (this.flippingController && this.flippingController.flippingMap && this.flippingController.flippingMap.map) {
                    this.flippingController.flippingMap.map.invalidateSize();
                }
                
                // Через legacy карту (если используется)
                if (this.map) {
                    this.map.invalidateSize();
                }
            } catch (error) {
                console.error('❌ FlippingProfitabilityManager: Ошибка исправления размера карты:', error);
            }
        }, 100);
        
        // Дополнительная попытка через большую задержку
        setTimeout(() => {
            try {
                if (this.flippingController && this.flippingController.flippingMap && this.flippingController.flippingMap.map) {
                    this.flippingController.flippingMap.map.invalidateSize();
                }
                if (this.map) {
                    this.map.invalidateSize();
                }
            } catch (error) {
                // Игнорируем ошибки второй попытки
            }
        }, 1000);
    }

    // ===== МЕТОДЫ КАРТЫ (скопировано из MapManager) =====
    
    /**
     * Полная очистка существующей карты
     */
    destroyExistingMap() {
        try {
            // Удаляем существующую карту Leaflet
            if (this.map) {
                this.map.remove();
                this.map = null;
            }
            
            // Очищаем кластеры
            if (this.addressesCluster) {
                this.addressesCluster = null;
            }
            if (this.listingsCluster) {
                this.listingsCluster = null;
            }
            
            // Очищаем слои карты
            this.mapLayers = {
                addresses: null,
                objects: null,
                listings: null
            };
            
            // Очищаем полигон области
            this.areaPolygonLayer = null;
            
            // Полностью пересоздаем контейнер карты
            if (this.mapContainer) {
                
                const parentElement = this.mapContainer.parentNode;
                const containerId = this.mapContainer.id;
                const containerClasses = 'w-full h-full';
                
                // Удаляем старый контейнер полностью
                parentElement.removeChild(this.mapContainer);
                
                // Создаем новый контейнер с теми же параметрами
                this.mapContainer = document.createElement('div');
                this.mapContainer.id = containerId;
                this.mapContainer.className = containerClasses;
                
                // Добавляем новый контейнер в DOM
                parentElement.appendChild(this.mapContainer);
                
            }
            
            // Сбрасываем состояние
            this.mapState.initialized = false;
            this.isInitializingMap = false;
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка очистки карты:', error);
        }
    }
    
    /**
     * Инициализация карты
     */
    async initMap() {
        try {
            this.initMapCallCount = (this.initMapCallCount || 0) + 1;
            
            // Защита от множественной инициализации
            if (this.isInitializingMap) {
                return;
            }
            
            this.isInitializingMap = true;
            
            try {
                // Проверяем, что контейнер существует
                if (!this.mapContainer) {
                    throw new Error('Контейнер карты не найден');
                }
                
                // Полная очистка контейнера карты (как было изначально)
                this.destroyExistingMap();
                
                // Создаем карту
                this.map = L.map(this.mapContainer).setView(this.mapState.defaultCenter, this.mapState.defaultZoom);
            
            // Добавляем слой карты
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 18,
                opacity: 1.0
            }).addTo(this.map);
            
            // Инициализируем слои карты
            this.initMapLayers();
            
            // Добавляем обработчики для динамического обновления маркеров
            await this.initMapViewEventListeners();
            
            // Если у области есть полигон, создаем его слой
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (currentArea && this.hasAreaPolygon(currentArea)) {
                this.displayAreaPolygon();
            }
            
            // Активируем фильтр по умолчанию
            this.setDefaultMapFilter();
            
            this.mapState.initialized = true;
            
            } finally {
                this.isInitializingMap = false;
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка инициализации карты:', error);
            this.isInitializingMap = false;
        }
    }
    
    /**
     * Инициализация слоев карты
     */
    initMapLayers() {
        // Создаем группы слоев (только адреса включены по умолчанию)
        this.mapLayers.addresses = L.layerGroup().addTo(this.map);
        this.mapLayers.objects = L.layerGroup();
        this.mapLayers.listings = L.layerGroup();
        
        // Создаем контрол для управления слоями (отключен для отчёта флиппинга)
        // const overlays = {
        //     'Адреса': this.mapLayers.addresses,
        //     'Объекты': this.mapLayers.objects,
        //     'Объявления': this.mapLayers.listings
        // };
        // 
        // L.control.layers(null, overlays, {
        //     position: 'topright',
        //     collapsed: false
        // }).addTo(this.map);
    }
    
    /**
     * Проверка наличия полигона области
     */
    hasAreaPolygon(area) {
        return area && area.polygon && Array.isArray(area.polygon) && area.polygon.length > 0;
    }
    
    /**
     * Отображение полигона области на карте
     */
    displayAreaPolygon() {
        try {
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (!currentArea || !this.hasAreaPolygon(currentArea)) {
                return;
            }
            
            // Удаляем существующий слой полигона
            if (this.areaPolygonLayer) {
                this.map.removeLayer(this.areaPolygonLayer);
            }
            
            // Создаем новый полигон
            const polygon = L.polygon(currentArea.polygon, {
                color: '#3B82F6',
                weight: 3,
                fillColor: '#3B82F6',
                fillOpacity: 0.1,
                interactive: false
            });
            
            this.areaPolygonLayer = polygon.addTo(this.map);
            
            // Подгоняем вид карты под полигон
            this.map.fitBounds(polygon.getBounds(), {
                padding: [20, 20]
            });
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка отображения полигона области:', error);
        }
    }
    
    /**
     * Установка фильтра карты по умолчанию
     */
    setDefaultMapFilter() {
        // Устанавливаем фильтр "год" как активный
        this.activeMapFilter = 'year';
    }
    
    /**
     * Инициализация обработчиков событий карты
     */
    async initMapViewEventListeners() {
        if (!this.map) return;
        
        // Обработчики изменения области просмотра
        this.map.on('moveend', () => this.onMapViewChanged());
        this.map.on('zoomend', () => this.onMapViewChanged());
    }
    
    /**
     * Обработчик изменения вида карты
     */
    onMapViewChanged() {
        // Можно добавить логику для оптимизации отображения маркеров
    }
    
    /**
     * Загрузка адресов на карту (только для отфильтрованных объектов)
     */
    async loadAddressesToMap() {
        try {
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                return;
            }

            // Получаем адреса только тех объектов, которые прошли фильтрацию
            let filteredAddresses = [];
            if (this.filteredObjects && this.filteredObjects.length > 0) {
                // Собираем уникальные address_id из отфильтрованных объектов
                const uniqueAddressIds = [...new Set(
                    this.filteredObjects.map(obj => obj.address_id).filter(id => id)
                )];

                // Получаем соответствующие адреса
                const allAddresses = this.reportsManager.areaPage.dataState?.getState('addresses') || [];
                filteredAddresses = allAddresses.filter(address => 
                    uniqueAddressIds.includes(address.id) && 
                    address.coordinates && 
                    address.coordinates.lat && 
                    address.coordinates.lng
                );

                if (this.debugEnabled) {
                    console.log('🔍 FlippingProfitabilityManager: Отфильтровано адресов для карты:', filteredAddresses.length, 'из', uniqueAddressIds.length, 'уникальных адресов объектов');
                }
            } else {
                if (this.debugEnabled) {
                    console.log('🔍 FlippingProfitabilityManager: Нет отфильтрованных объектов, карта пуста');
                }
            }

            // Очищаем существующие маркеры
            this.clearAddressMarkers();

            if (filteredAddresses.length === 0) {
                return; // Нет адресов для отображения
            }

            // Создаем маркеры для отфильтрованных адресов
            const markers = [];
            for (const address of filteredAddresses) {
                const marker = await this.getOrCreateAddressMarker(address);
                markers.push(marker);
            }

            // Если адресов много, используем кластеризацию
            if (filteredAddresses.length > 50) {
                if (!this.addressesCluster) {
                    this.addressesCluster = L.markerClusterGroup({
                        chunkedLoading: true,
                        maxClusterRadius: 40
                    });
                    this.mapLayers.addresses.addLayer(this.addressesCluster);
                }
                
                this.addressesCluster.clearLayers();
                this.addressesCluster.addMarkers(markers);
            } else {
                // Для небольшого количества адресов добавляем прямо на карту
                markers.forEach(marker => this.mapLayers.addresses.addLayer(marker));
            }

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки адресов на карту:', error);
        }
    }
    
    /**
     * Загрузка объявлений на карту (скопировано из MapManager)
     */
    async loadListingsToMap() {
        try {
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                return;
            }

            // Получаем объявления из состояния (как в MapManager)
            const allListings = this.reportsManager.areaPage.dataState?.getState('listings') || [];
            
            if (!allListings || allListings.length === 0) {
                return;
            }

            // Фильтрация по области (как в MapManager)
            let filteredListings = allListings;
            if (currentArea && this.hasAreaPolygon(currentArea)) {
                const addresses = this.reportsManager.areaPage.dataState?.getState('addresses') || [];
                filteredListings = GeometryUtils.getListingsInMapArea(allListings, addresses, currentArea);
            }

            // Очищаем существующие маркеры объявлений
            this.clearListingMarkers();

            // Создаем маркеры для отфильтрованных объявлений
            const markers = [];
            filteredListings.forEach(listing => {
                if (listing.coordinates && listing.coordinates.lat && listing.coordinates.lng) {
                    const marker = this.createListingMarker(listing);
                    markers.push(marker);
                }
            });

            // Если объявлений много, используем кластеризацию
            if (filteredListings.length > 20) {
                if (!this.listingsCluster) {
                    this.listingsCluster = L.markerClusterGroup({
                        chunkedLoading: true,
                        maxClusterRadius: 30
                    });
                    this.mapLayers.listings.addLayer(this.listingsCluster);
                }
                
                this.listingsCluster.clearLayers();
                this.listingsCluster.addMarkers(markers);
            } else {
                // Для небольшого количества объявлений добавляем прямо на карту
                markers.forEach(marker => this.mapLayers.listings.addLayer(marker));
            }

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки объявлений на карту:', error);
        }
    }
    
    /**
     * Получение или создание маркера адреса с кэшированием (скопировано из MapManager)
     */
    async getOrCreateAddressMarker(address) {
        const cacheKey = `address_${address.id}`;
        
        // Проверяем кэш
        if (this.markerCache.has(cacheKey)) {
            return this.markerCache.get(cacheKey);
        }
        
        // Создаем новый маркер
        const marker = await this.createAddressMarker(address);
        
        // Сохраняем в кэш (ограничиваем размер кэша)
        if (this.markerCache.size > 2000) {
            // Очищаем первые 500 записей для освобождения памяти
            const keysToDelete = Array.from(this.markerCache.keys()).slice(0, 500);
            keysToDelete.forEach(key => this.markerCache.delete(key));
        }
        
        this.markerCache.set(cacheKey, marker);
        return marker;
    }
    
    /**
     * Создание маркера адреса (точная копия из MapManager)
     */
    async createAddressMarker(address) {
        // Проверяем готовность базы данных
        if (!window.db || !window.db.db) {
            if (this.debugEnabled) {
                console.warn('🔍 FlippingProfitabilityManager: База данных не готова для создания маркера');
            }
            // Возвращаем простой маркер без дополнительных данных
            return this.createSimpleAddressMarker(address);
        }

        // Определяем высоту маркера по этажности
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
            markerHeight = 10; // По умолчанию
        }
        
        // Определяем цвет маркера
        let markerColor = '#3b82f6'; // Цвет по умолчанию
        if (address.wall_material_id) {
            try {
                const wallMaterial = await window.db.get('wall_materials', address.wall_material_id);
                if (wallMaterial && wallMaterial.color) {
                    markerColor = wallMaterial.color;
                }
            } catch (error) {
                console.warn('FlippingProfitabilityManager: Не удалось получить материал стен для адреса:', address.id);
            }
        }
        
        // Определяем текст на маркере в зависимости от активного фильтра
        let labelText = '';
        switch (this.activeMapFilter) {
            case 'year':
                labelText = address.build_year || '';
                break;
            case 'series':
                if (address.house_series_id) {
                    try {
                        const houseSeries = await window.db.get('house_series', address.house_series_id);
                        labelText = houseSeries ? houseSeries.name : '';
                    } catch (error) {
                        console.warn('FlippingProfitabilityManager: Не удалось получить серию дома:', address.house_series_id);
                    }
                }
                break;
            case 'floors':
                labelText = address.floors_count || '';
                break;
            case 'objects':
                try {
                    const objects = await window.db.getObjectsByAddress(address.id);
                    labelText = objects.length > 0 ? objects.length.toString() : '';
                } catch (error) {
                    console.warn('FlippingProfitabilityManager: Не удалось получить объекты для адреса:', address.id);
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

        // Сохраняем данные адреса в маркере для оптимизации
        marker.addressData = address;

        // Создаем popup асинхронно
        this.createAddressPopupContent(address).then(popupContent => {
            marker.bindPopup(popupContent, {
                maxWidth: 280,
                className: 'address-popup-container'
            });
        });

        return marker;
    }
    
    /**
     * Создание маркера объявления (скопировано из MapManager)
     */
    createListingMarker(listing) {
        const color = this.getListingColor(listing);
        
        // Используем circleMarker
        const marker = L.circleMarker([listing.coordinates.lat, listing.coordinates.lng], {
            radius: 8,
            fillColor: color,
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
        });

        // Создаем содержимое попапа
        const popupContent = this.createListingPopupContent(listing);
        marker.bindPopup(popupContent, {
            maxWidth: 300
        });

        return marker;
    }
    
    
    /**
     * Получение цвета маркера объявления (скопировано из MapManager)
     */
    getListingColor(listing) {
        if (listing.status === 'active') {
            return '#10B981'; // Зеленый для активных
        } else if (listing.status === 'archived') {
            return '#EF4444'; // Красный для архивных
        } else {
            return '#9CA3AF'; // Серый для неопределенных
        }
    }
    
    /**
     * Создание содержимого попапа для адреса (соответствует MapManager)
     */
    async createAddressPopupContent(address) {
        // Получаем справочные данные как в MapManager
        let houseSeriesText = 'Не указана';
        let houseClassText = 'Не указан';
        let wallMaterialText = 'Не указан';
        let ceilingMaterialText = 'Не указан';
        
        try {
            // Серия дома
            if (address.house_series_id) {
                const houseSeries = await window.db.get('house_series', address.house_series_id);
                if (houseSeries) houseSeriesText = houseSeries.name;
            }
            
            // Класс дома
            if (address.house_class_id) {
                const houseClass = await window.db.get('house_classes', address.house_class_id);
                if (houseClass) houseClassText = houseClass.name;
            }
            
            // Материал стен
            if (address.wall_material_id) {
                const wallMaterial = await window.db.get('wall_materials', address.wall_material_id);
                if (wallMaterial) wallMaterialText = wallMaterial.name;
            }
            
            // Материал перекрытий
            if (address.ceiling_material_id) {
                const ceilingMaterial = await window.db.get('ceiling_materials', address.ceiling_material_id);
                if (ceilingMaterial) ceilingMaterialText = ceilingMaterial.name;
            }
        } catch (error) {
            console.warn('FlippingProfitabilityManager: Ошибка получения справочных данных:', error);
        }
        
        // Подготавливаем текстовые значения
        const gasSupplyText = address.gas_supply ? 'Да' : (address.gas_supply === false ? 'Нет' : 'Не указано');
        const individualHeatingText = address.individual_heating ? 'Да' : (address.individual_heating === false ? 'Нет' : 'Не указано');
        
        return `
            <div class="address-popup" style="width: 260px; max-width: 260px;">
                <div class="header mb-2">
                    <div class="font-bold text-gray-900 text-sm">📍 Адрес</div>
                    <div class="address-title font-medium text-gray-800 text-xs mb-1">${address.address || 'Не указан'}</div>
                </div>
                
                <div class="space-y-0.5 text-xs text-gray-600 mb-2">
                    <div><strong>Серия дома:</strong> ${houseSeriesText}</div>
                    <div><strong>Класс дома:</strong> ${houseClassText}</div>
                    <div><strong>Материал стен:</strong> ${wallMaterialText}</div>
                    <div><strong>Материал перекрытий:</strong> ${ceilingMaterialText}</div>
                    <div><strong>Газоснабжение:</strong> ${gasSupplyText}</div>
                    <div><strong>Индивидуальное отопление:</strong> ${individualHeatingText}</div>
                    <div><strong>Этажей:</strong> ${address.floors_count || 'Не указано'}</div>
                    <div><strong>Год постройки:</strong> ${address.build_year || 'Не указан'}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Создание содержимого попапа для объявления (скопировано из MapManager)
     */
    createListingPopupContent(listing) {
        const formatPrice = (price) => {
            if (!price) return 'Не указана';
            return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
        };
        
        const formatDate = (dateStr) => {
            if (!dateStr) return 'Не указано';
            return new Date(dateStr).toLocaleDateString('ru-RU');
        };
        
        return `
            <div class="listing-popup">
                <div class="popup-header">
                    <strong>${listing.title || 'Объявление'}</strong>
                </div>
                <div class="popup-content">
                    <div><strong>Цена:</strong> ${formatPrice(listing.price)}</div>
                    <div><strong>Комнат:</strong> ${listing.rooms || 'Не указано'}</div>
                    <div><strong>Площадь:</strong> ${listing.total_area ? listing.total_area + ' м²' : 'Не указано'}</div>
                    <div><strong>Статус:</strong> ${listing.status === 'active' ? 'Активное' : 'Архивное'}</div>
                    <div><strong>Обновлено:</strong> ${formatDate(listing.updated)}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Очистка маркеров адресов
     */
    clearAddressMarkers() {
        if (this.addressesCluster) {
            this.addressesCluster.clearLayers();
        }
        if (this.mapLayers.addresses) {
            this.mapLayers.addresses.clearLayers();
        }
    }
    
    /**
     * Очистка маркеров объявлений
     */
    clearListingMarkers() {
        if (this.listingsCluster) {
            this.listingsCluster.clearLayers();
        }
        if (this.mapLayers.listings) {
            this.mapLayers.listings.clearLayers();
        }
    }
    
    /**
     * Загрузка данных на карту (скопировано из MapManager)
     */
    async loadMapData() {
        try {
            if (!this.map || !this.mapState.initialized) {
                return;
            }


            // Загружаем только адреса (объявления не нужны на карте)
            await this.loadAddressesToMap();


        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки данных на карту:', error);
        }
    }
    
    
    /**
     * Загрузка адресов для корректного отображения
     */
    async loadAddresses() {
        try {
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (!currentArea) return;
            
            this.addresses = await window.db.getAddressesInMapArea(currentArea.id);
            
            if (this.debugEnabled) {
                console.log('📍 FlippingProfitabilityManager: Загружено адресов:', this.addresses.length);
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки адресов:', error);
            this.addresses = [];
        }
    }

    /**
     * Обновление отображения объектов в правой панели (адаптация из ComparativeAnalysisManager)
     */
    updateObjectsDisplay() {
        if (!this.objectsGrid || !this.filteredObjects) return;
        
        const objects = this.filteredObjects;
        
        if (objects.length === 0) {
            this.objectsGrid.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">Нет объектов для отображения</div>';
            return;
        }
        
        // Создаем блоки объектов (адаптация из ComparativeAnalysisManager)
        this.objectsGrid.innerHTML = objects.map(obj => {
            // Форматируем характеристики без цены
            const characteristics = this.formatObjectCharacteristics(obj);
            
            // Форматируем цену
            const price = obj.current_price || 0;
            const formattedPrice = this.formatPrice(price);
            
            // Цена за кв.м без скобок
            let pricePerSqm = '';
            if (price > 0 && obj.area_total > 0) {
                const perSqm = Math.round(price / obj.area_total);
                pricePerSqm = `${new Intl.NumberFormat('ru-RU').format(perSqm)} ₽/м²`;
            }
            
            // Получаем адрес по address_id
            const address = this.getAddressNameById(obj.address_id) || 'Адрес не указан';
            
            // Форматируем информацию о датах в зависимости от статуса
            let dateInfo = '';
            if (obj.status === 'archive') {
                // Для архивных: дата создания и дата обновления
                const createdDate = obj.created ? new Date(obj.created).toLocaleDateString('ru-RU') : '';
                const updatedDate = obj.updated ? new Date(obj.updated).toLocaleDateString('ru-RU') : '';
                if (createdDate && updatedDate) {
                    dateInfo = `Архив: ${createdDate} - ${updatedDate}`;
                } else if (createdDate) {
                    dateInfo = `${createdDate}`;
                } else if (updatedDate) {
                    dateInfo = `${updatedDate}`;
                }
            } else {
                // Для активных: текущая дата
                const createdDate = obj.created ? new Date(obj.created).toLocaleDateString('ru-RU') : '';
                const currentDate = new Date().toLocaleDateString('ru-RU');
                dateInfo = `Активный: ${createdDate} - ${currentDate}`;
            }
            
            return `
                <div class="flipping-object-block" data-object-id="${obj.id}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1 mr-2">
                            <div class="object-characteristics font-semibold text-sm">${characteristics}</div>
                        </div>
                        <div class="flex-shrink-0 text-right">
                            <div class="object-price">${formattedPrice}</div>
                            ${pricePerSqm ? `<div class="price-per-sqm">${pricePerSqm}</div>` : ''}
                        </div>
                    </div>
                    <div class="object-address text-xs text-gray-500">${address}</div>
                    ${dateInfo ? `<div class="object-dates text-xs text-gray-400 mt-1">${dateInfo}</div>` : ''}
                </div>
            `;
        }).join('');
        
        // Добавляем обработчики событий для блоков объектов
        this.objectsGrid.querySelectorAll('.flipping-object-block').forEach(block => {
            block.addEventListener('click', () => {
                const objectId = block.dataset.objectId;
                this.selectObject(objectId);
            });
        });
    }

    /**
     * Выбор объекта (подсветка в панели)
     */
    selectObject(objectId) {
        if (this.debugEnabled) {
            console.log('🔍 FlippingProfitabilityManager: Выбран объект:', objectId);
        }
        
        // Сохраняем ID выбранного объекта
        this.selectedObjectId = objectId;
        
        // Убираем выделение с предыдущего объекта
        this.objectsGrid.querySelectorAll('.flipping-object-block').forEach(block => {
            block.classList.remove('selected');
        });
        
        // Выделяем новый объект
        const selectedBlock = this.objectsGrid.querySelector(`[data-object-id="${objectId}"]`);
        if (selectedBlock) {
            selectedBlock.classList.add('selected');
        }
        
        // Загружаем текущую оценку объекта
        this.loadObjectEvaluation(objectId);
    }

    /**
     * Форматирование характеристик объекта (адаптация из ComparativeAnalysisManager)
     */
    formatObjectCharacteristics(obj) {
        const parts = [];
        
        // Количество комнат
        if (obj.rooms) {
            parts.push(`${obj.rooms}-к`);
        } else if (obj.property_type) {
            parts.push(obj.property_type);
        }
        
        // Тип недвижимости
        parts.push('квартира');
        
        // Площадь
        if (obj.area_total) {
            parts.push(`${obj.area_total}м²`);
        }
        
        return parts.join(', ');
    }

    /**
     * Форматирование цены (адаптация из ComparativeAnalysisManager)
     */
    formatPrice(price) {
        if (!price || price <= 0) return 'Цена не указана';
        
        if (price >= 1000000) {
            const millions = Math.round(price / 1000000 * 10) / 10;
            return `${millions.toLocaleString('ru-RU')} M ₽`;
        } else {
            return `${Math.round(price / 1000)} 000 ₽`;
        }
    }

    /**
     * Получение названия адреса по ID (адаптация из ComparativeAnalysisManager)
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses) return 'Адрес не указан';
        
        const address = this.addresses.find(addr => addr.id === addressId);
        if (!address) return 'Адрес не указан';
        
        // Формируем короткое название адреса
        const parts = [];
        if (address.region) parts.push(address.region);
        if (address.city) parts.push(address.city);
        if (address.street) parts.push(address.street);
        if (address.house_number) parts.push(`д. ${address.house_number}`);
        
        return parts.join(', ');
    }

    /**
     * Обновление графика коридора рынка при смене режима
     */
    async updateMarketCorridorChart() {
        if (this.filteredObjects && this.filteredObjects.length > 0) {
            await this.createMarketCorridorChart();
        }
    }

    /**
     * Создание графика коридора рынка (точная копия из ReportsManager)
     */
    async createMarketCorridorChart() {
        try {
            // Получаем данные для графика коридора из отфильтрованных объектов
            const pointsData = await this.getMarketCorridorData();
            
            // Проверяем наличие данных
            if (!pointsData || !pointsData.series || pointsData.series.length === 0 || pointsData.series[0].data.length === 0) {
                this.chartContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
                return;
            }
            
            const options = {
                chart: {
                    height: 400,
                    // Используем mixed тип для смешанного графика (линии + точки)
                    type: this.marketCorridorMode === 'history' ? 'line' : 'scatter',
                    locales: [{
                        "name": "ru",
                        "options": {
                            "months": ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
                            "shortMonths": ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
                            "days": ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
                            "shortDays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
                            "toolbar": {
                                "exportToSVG": "Сохранить SVG",
                                "exportToPNG": "Сохранить PNG",
                                "exportToCSV": "Сохранить CSV",
                                "menu": "Меню",
                                "selection": "Выбор",
                                "selectionZoom": "Выбор с увеличением",
                                "zoomIn": "Увеличить",
                                "zoomOut": "Уменьшить",
                                "pan": "Перемещение",
                                "reset": "Сбросить увеличение"
                            }
                        }
                    }],
                    defaultLocale: "ru",
                    events: {
                        click: (event, chartContext, config) => {
                            // Обработка клика по точке
                            this.handleMarketCorridorPointClick(event, chartContext, config);
                        }
                    }
                },
                stroke: {
                    width: this.marketCorridorMode === 'history' ? 2 : 0, // Линии только в режиме истории
                    curve: this.marketCorridorMode === 'history' ? 'stepline' : 'straight'
                },
                series: pointsData.series,
                colors: pointsData.colors,
                xaxis: {
                    type: 'datetime'
                },
                legend: {
                    show: false,
                    showForSingleSeries: false,
                    showForNullSeries: false,
                    showForZeroSeries: false
                },
                title: {
                    text: this.marketCorridorMode === 'history' ? 'История активных объектов' : 'Коридор рынка недвижимости',
                    align: 'left',
                    style: {
                        fontSize: "14px",
                        color: 'rgba(102,102,102,0.56)'
                    }
                },
                markers: {
                    size: 4,
                    opacity: 0.9,
                    strokeColor: "#fff",
                    strokeWidth: 2,
                    style: 'inverted',
                    hover: {
                        size: 15
                    }
                },
                tooltip: {
                    shared: false,
                    intersect: true,
                    custom: (tooltipModel) => {
                        const { series, seriesIndex, dataPointIndex, w } = tooltipModel;
                        
                        // Получаем данные точки из сохраненного массива
                        let point = null;
                        
                        if (this.currentPointsData) {
                            if (this.marketCorridorMode === 'history') {
                                // В режиме истории нужно найти соответствующую точку по координатам
                                const seriesData = w.config.series[seriesIndex];
                                if (seriesData && seriesData.data && seriesData.data[dataPointIndex]) {
                                    const [timestamp, price] = seriesData.data[dataPointIndex];
                                    
                                    // Ищем точку с такими же координатами в сохраненных данных
                                    point = this.currentPointsData.find(p => 
                                        Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                                    );
                                }
                            } else {
                                // В режиме продаж используем прямое соответствие индексов
                                const pointIndex = dataPointIndex + seriesIndex * w.config.series[seriesIndex].data.length;
                                point = this.currentPointsData[pointIndex] || this.currentPointsData[dataPointIndex];
                            }
                        }
                        
                        if (!point) {
                            return '<div class="p-2">Нет данных</div>';
                        }
                        
                        const date = new Date(point.x).toLocaleDateString('ru-RU');
                        const price = new Intl.NumberFormat('ru-RU').format(point.y);
                        const rooms = point.rooms || 'Не указано';
                        const area = point.area ? `${point.area} м²` : 'Не указано';
                        const floor = point.floor ? `${point.floor}/${point.floors_total || '?'}` : 'Не указано';
                        const status = point.status === 'active' ? 'Активное' : 'Архивное';
                        
                        return `
                            <div class="p-3 bg-white border border-gray-200 rounded shadow-lg">
                                <div class="font-semibold text-gray-900 mb-2">${price} ₽</div>
                                <div class="text-sm text-gray-600 space-y-1">
                                    <div><strong>Дата:</strong> ${date}</div>
                                    <div><strong>Комнат:</strong> ${rooms}</div>
                                    <div><strong>Площадь:</strong> ${area}</div>
                                    <div><strong>Этаж:</strong> ${floor}</div>
                                    <div><strong>Статус:</strong> ${status}</div>
                                </div>
                            </div>
                        `;
                    }
                },
                yaxis: {
                    labels: {
                        formatter: function (value) {
                            return new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
                        }
                    }
                }
            };
            
            // Удаляем предыдущий график
            if (this.marketCorridorChart) {
                this.marketCorridorChart.destroy();
            }
            
            // Очищаем контейнер
            this.chartContainer.innerHTML = '';
            this.marketCorridorChart = new ApexCharts(this.chartContainer, options);
            this.marketCorridorChart.render();
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка создания графика коридора рынка:', error);
            this.chartContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки графика</div>';
        }
    }

    /**
     * Получение данных для графика коридора рынка (адаптация из ReportsManager)
     */
    async getMarketCorridorData() {
        try {
            // Используем отфильтрованные объекты
            const objects = this.filteredObjects;
            
            if (objects.length === 0) {
                return this.getEmptyMarketCorridorData();
            }

            // Подготавливаем данные для коридора рынка в зависимости от режима
            const activePointsData = [];
            const archivePointsData = [];
            
            objects.forEach(obj => {
                if (obj.current_price <= 0) return;
                
                if (obj.status === 'archive') {
                    // Архивные объекты: последняя цена на дату ухода с рынка
                    if (obj.updated) {
                        archivePointsData.push({
                            x: new Date(obj.updated).getTime(),
                            y: obj.current_price,
                            objectId: obj.id,
                            address: obj.address_id,
                            rooms: obj.rooms || obj.property_type,
                            area: obj.area_total,
                            floor: obj.floor,
                            floors_total: obj.floors_total,
                            status: obj.status,
                            created: obj.created,
                            updated: obj.updated
                        });
                    }
                } else if (obj.status === 'active') {
                    // Активные объекты: зависит от режима
                    if (this.marketCorridorMode === 'history') {
                        // Режим "История активных" - получаем историю изменения цен
                        const objectPriceHistory = this.prepareObjectPriceHistoryForChart(obj);
                        
                        objectPriceHistory.forEach(historyPoint => {
                            activePointsData.push({
                                x: historyPoint.date,
                                y: historyPoint.price,
                                objectId: obj.id,
                                address: obj.address_id,
                                rooms: obj.rooms || obj.property_type,
                                area: obj.area_total,
                                floor: obj.floor,
                                floors_total: obj.floors_total,
                                status: obj.status,
                                created: obj.created,
                                updated: obj.updated,
                                historyEntry: true
                            });
                        });
                    } else {
                        // Режим "Коридор продаж" - только текущая цена на текущую дату
                        activePointsData.push({
                            x: new Date().getTime(),
                            y: obj.current_price,
                            objectId: obj.id,
                            address: obj.address_id,
                            rooms: obj.rooms || obj.property_type,
                            area: obj.area_total,
                            floor: obj.floor,
                            floors_total: obj.floors_total,
                            status: obj.status,
                            created: obj.created,
                            updated: obj.updated
                        });
                    }
                }
            });

            // Сохраняем данные точек для tooltip
            this.currentPointsData = [...activePointsData, ...archivePointsData];

            // Формируем серии данных
            const series = [];
            const colors = [];

            if (activePointsData.length > 0) {
                series.push({
                    name: this.marketCorridorMode === 'history' ? 'История активных' : 'Активные объекты',
                    type: this.marketCorridorMode === 'history' ? 'line' : 'scatter',
                    data: activePointsData.map(point => [point.x, point.y])
                });
                colors.push('#22c55e'); // Зеленый для активных
            }

            if (archivePointsData.length > 0) {
                series.push({
                    name: 'Проданные объекты',
                    type: 'scatter',
                    data: archivePointsData.map(point => [point.x, point.y])
                });
                colors.push('#ef4444'); // Красный для архивных
            }

            return {
                series: series,
                colors: colors
            };

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка получения данных коридора рынка:', error);
            return this.getEmptyMarketCorridorData();
        }
    }

    /**
     * Пустые данные для графика коридора рынка
     */
    getEmptyMarketCorridorData() {
        return {
            series: [],
            colors: []
        };
    }

    /**
     * Подготовка истории изменения цен объекта для графика
     */
    prepareObjectPriceHistoryForChart(obj) {
        const history = [];
        
        // Начальная цена при создании
        if (obj.created && obj.initial_price > 0) {
            history.push({
                date: new Date(obj.created).getTime(),
                price: obj.initial_price
            });
        }
        
        // История изменений цен из базы данных
        if (obj.price_history && Array.isArray(obj.price_history)) {
            obj.price_history.forEach(change => {
                if (change.date && change.price > 0) {
                    history.push({
                        date: new Date(change.date).getTime(),
                        price: change.price
                    });
                }
            });
        }
        
        // Текущая цена (если отличается от последней в истории)
        if (obj.current_price > 0) {
            const lastPrice = history[history.length - 1]?.price;
            if (!lastPrice || lastPrice !== obj.current_price) {
                history.push({
                    date: obj.updated ? new Date(obj.updated).getTime() : new Date().getTime(),
                    price: obj.current_price
                });
            }
        }
        
        // Сортируем по дате
        return history.sort((a, b) => a.date - b.date);
    }

    /**
     * Обработчик клика по точке графика
     */
    handleMarketCorridorPointClick(event, chartContext, config) {
        try {
            if (config.dataPointIndex !== -1 && config.seriesIndex !== -1) {
                // Получаем данные точки
                let point = null;
                
                if (this.marketCorridorMode === 'history') {
                    // В режиме истории нужно найти соответствующую точку по координатам
                    if (this.marketCorridorChart) {
                        const seriesData = this.marketCorridorChart.w.config.series[config.seriesIndex];
                        if (seriesData && seriesData.data && seriesData.data[config.dataPointIndex]) {
                            const [timestamp, price] = seriesData.data[config.dataPointIndex];
                            
                            // Ищем точку с такими же координатами в сохраненных данных
                            point = this.currentPointsData.find(p => 
                                Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                            );
                        }
                    }
                } else {
                    // В режиме продаж используем прямое соответствие
                    if (this.marketCorridorChart) {
                        const seriesData = this.marketCorridorChart.w.config.series[config.seriesIndex];
                        const pointIndex = config.dataPointIndex + config.seriesIndex * seriesData.data.length;
                        point = this.currentPointsData[pointIndex] || this.currentPointsData[config.dataPointIndex];
                    }
                }
                
                if (point && point.objectId) {
                    // Открываем модальное окно с деталями объекта
                    if (this.debugEnabled) {
                        console.log('🔍 FlippingProfitabilityManager: Клик по точке графика, объект:', point.objectId);
                    }
                    // Здесь можно добавить логику открытия модального окна или другие действия
                }
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обработки клика по графику:', error);
        }
    }
    
    /**
     * Скрытие отчёта
     */
    hide() {
        // Очищаем график при скрытии
        if (this.marketCorridorChart) {
            this.marketCorridorChart.destroy();
            this.marketCorridorChart = null;
        }
        
        // НЕ очищаем карту при скрытии отчёта - оставляем инициализированной как в MapManager
        // this.destroyExistingMap();
        
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingProfitabilityManager;
}