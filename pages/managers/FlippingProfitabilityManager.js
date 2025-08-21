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
        this.profitabilityService = null;
        
        // Элементы интерфейса
        this.container = null;
        this.placeholder = null;
        this.content = null;
        this.filterContainer = null;
        this.chartContainer = null;
        
        // Фильтры
        this.currentFilters = {
            rooms: [],
            priceFrom: 0,
            priceTo: 10000000000,
            profitabilityPercent: 60,
            participants: 'flipper',
            profitSharing: 'percentage',
            flipperPercentage: 50,
            investorPercentage: 50,
            fixedPaymentAmount: 250000,
            fixedPlusPercentage: 30,
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
        this.evaluations = new Map(); // objectId -> evaluation (локальное хранение как в ComparativeAnalysisManager)
        
        this.debugEnabled = false; // Отладка выключена
        
        // Эталонная цена
        this.referencePrice = {
            perMeter: null,     // Цена за м²
            total: null,        // Общая цена (для конкретной площади)
            area: null,         // Площадь для расчёта общей цены
            count: 0           // Количество объектов в расчёте
        };
        
        // Множественные эталонные цены (для разных подсегментов)
        this.referencePrices = [];
        
        // Состояние фильтрации по подсегментам
        this.activeSubsegmentId = null;
        this.originalFilteredObjects = []; // Сохранение исходных объектов до фильтрации по подсегменту
        
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
            
            // Инициализация FlippingProfitabilityService
            await this.initializeProfitabilityService();
            
            
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
     * Инициализация FlippingProfitabilityService
     */
    async initializeProfitabilityService() {
        try {
            
            // Создаём экземпляр сервиса с заглушками для зависимостей
            const errorHandlingService = {
                handleError: (error, context) => {
                    console.error(`❌ ${context}:`, error);
                }
            };
            
            const configService = {
                get: async (key) => {
                    if (key === 'debug.enabled') {
                        return this.debugEnabled;
                    }
                    return null;
                }
            };
            
            // Инициализируем FlippingProfitabilityService
            if (typeof FlippingProfitabilityService !== 'undefined') {
                this.profitabilityService = new FlippingProfitabilityService(errorHandlingService, configService);
                // Экспортируем в глобальную область для доступа из других сервисов
                window.flippingProfitabilityService = this.profitabilityService;
            } else {
                console.warn('⚠️ FlippingProfitabilityService не найден');
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка инициализации FlippingProfitabilityService:', error);
        }
    }

    /**
     * Расчёт доходности для всех объектов
     */
    async calculateProfitabilityForObjects() {
        try {
            if (!this.profitabilityService || !this.filteredObjects || this.filteredObjects.length === 0) {
                if (this.debugEnabled) {
                    console.log('🔢 calculateProfitabilityForObjects: Сервис не готов или нет объектов');
                }
                return;
            }

            if (this.debugEnabled) {
                console.log(`🔢 Расчёт доходности для ${this.filteredObjects.length} объектов...`);
            }

            // Получаем эталонные цены подсегментов
            const subsegmentPrices = await this.calculateReferencePriceForAllSubsegments();
            
            if (!subsegmentPrices || subsegmentPrices.length === 0) {
                if (this.debugEnabled) {
                    console.log('🔢 Нет эталонных цен для расчёта доходности');
                }
                return;
            }

            // Создаём карту эталонных цен по подсегментам
            const priceMap = new Map();
            subsegmentPrices.forEach(subsegment => {
                if (subsegment.referencePrice && subsegment.referencePrice.perMeter) {
                    priceMap.set(subsegment.id, {
                        referencePricePerMeter: subsegment.referencePrice.perMeter,
                        averageExposureDays: subsegment.averageExposure || 90
                    });
                }
            });

            // Расчёт доходности для каждого объекта
            for (const object of this.filteredObjects) {
                try {
                    // Определяем подсегмент объекта
                    let subsegmentData = null;
                    for (const [subsegmentId, data] of priceMap.entries()) {
                        const subsegment = subsegmentPrices.find(s => s.id === subsegmentId);
                        if (subsegment && this.reportsManager.objectMatchesSubsegment(object, subsegment)) {
                            subsegmentData = data;
                            break;
                        }
                    }

                    if (!subsegmentData) {
                        if (this.debugEnabled) {
                            console.log(`🔢 Объект ${object.id}: не найден подходящий подсегмент`);
                        }
                        continue;
                    }

                    // Создаём параметры для расчёта
                    const params = {
                        ...this.currentFilters,
                        referencePricePerMeter: subsegmentData.referencePricePerMeter,
                        averageExposureDays: subsegmentData.averageExposureDays
                    };

                    // Рассчитываем доходность двух сценариев
                    const profitabilityData = this.profitabilityService.calculateBothScenarios(object, params);
                    
                    // Сохраняем результат в объект
                    object.flippingProfitability = profitabilityData;

                    if (this.debugEnabled && object.id.toString().endsWith('1')) { // Логируем каждый 10-й объект для примера
                        console.log(`🔢 Объект ${object.id}: годовая доходность ${profitabilityData.currentPrice.annualROI}%`);
                    }

                } catch (error) {
                    console.error(`❌ Ошибка расчёта доходности для объекта ${object.id}:`, error);
                    object.flippingProfitability = null;
                }
            }

            if (this.debugEnabled) {
                const calculatedCount = this.filteredObjects.filter(obj => obj.flippingProfitability).length;
                
            }

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка расчёта доходности:', error);
        }
    }

    /**
     * Получение эталонных цен для всех подсегментов
     */
    async calculateReferencePriceForAllSubsegments() {
        try {
            const currentArea = this.reportsManager.areaPage.dataState?.getState('currentArea');
            if (!currentArea) return [];

            const subsegments = this.reportsManager.segments?.flatMap(segment => 
                segment.subsegments?.map(subsegment => ({
                    ...subsegment,
                    segment_id: segment.id
                })) || []
            ) || [];

            const results = [];
            for (const subsegment of subsegments) {
                const referencePrice = await this.calculateReferencePriceForSubsegment(subsegment);
                const averageExposure = await this.calculateAverageExposureForSubsegment(subsegment.id);
                
                results.push({
                    ...subsegment,
                    referencePrice,
                    averageExposure
                });
            }

            return results;
        } catch (error) {
            console.error('❌ Ошибка расчёта эталонных цен подсегментов:', error);
            return [];
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
        this.chartContainer = document.getElementById('flippingMarketCorridorChart');
        this.objectsGrid = document.getElementById('flippingObjectsGrid');
        this.evaluationSelect = document.getElementById('objectEvaluationSelect');
        this.investmentTable = document.getElementById('flippingTable');
        // mapContainer и карта управляются FlippingController

        // Инициализация пространственного индекса для оптимизации
        this.spatialIndex = window.geoUtils || new GeoUtils();
        this.indexedAddresses = new Map(); // Кэш для быстрого доступа к индексированным адресам

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

        // Поля процентов флиппера
        const flipperPercentageInput = document.getElementById('flippingFlipperPercentage');
        if (flipperPercentageInput) {
            flipperPercentageInput.addEventListener('input', (e) => {
                const flipperPercent = parseInt(e.target.value) || 0;
                const investorPercent = 100 - flipperPercent;
                
                this.currentFilters.flipperPercentage = flipperPercent;
                this.currentFilters.investorPercentage = investorPercent;
                
                // Обновляем поле инвестора
                const investorInput = document.getElementById('flippingInvestorPercentage');
                if (investorInput) {
                    investorInput.value = investorPercent;
                }
                
                // Автоматически применяем фильтры
                this.applyFilters();
            });
        }

        // Фиксированная оплата
        const fixedPaymentInput = document.getElementById('flippingFixedPaymentAmount');
        if (fixedPaymentInput) {
            fixedPaymentInput.addEventListener('input', (e) => {
                this.currentFilters.fixedPaymentAmount = parseInt(e.target.value) || 250000;
                this.applyFilters();
            });
        }

        // Процент флиппера с остатка
        const fixedPlusPercentageInput = document.getElementById('flippingFixedPlusPercentage');
        if (fixedPlusPercentageInput) {
            fixedPlusPercentageInput.addEventListener('input', (e) => {
                this.currentFilters.fixedPlusPercentage = parseInt(e.target.value) || 30;
                this.applyFilters();
            });
        }

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
                this.applyFilters();
            });
        }
        
        if (priceToInput) {
            priceToInput.addEventListener('input', (e) => {
                this.currentFilters.priceTo = parseInt(e.target.value) || 10000000000;
                this.applyFilters();
            });
        }

        // Процент для пересчёта доходности
        const profitabilityPercentInput = document.getElementById('flippingProfitabilityPercent');
        if (profitabilityPercentInput) {
            profitabilityPercentInput.addEventListener('input', (e) => {
                this.currentFilters.profitabilityPercent = parseInt(e.target.value) || 60;
                this.applyFilters();
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
                    this.applyFilters();
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
        this.evaluationSelect.addEventListener('change', async (e) => {
            await this.onEvaluationChange(e.target.value);
        });
        
        // Изначально блокируем селектор (разблокируется при выборе объекта)
        this.updateEvaluationSelectorState(false);
    }

    /**
     * Обработчик изменения оценки объекта
     */
    async onEvaluationChange(evaluation) {
        // Игнорируем события, вызванные программной загрузкой оценки
        if (this.isLoadingEvaluation) {
            return;
        }
        
        if (this.selectedObjectId && evaluation) {
            // Сохраняем в локальную Map (сразу обновляем интерфейс)
            this.evaluations.set(this.selectedObjectId, evaluation);
            
            // Сохраняем в базу данных (асинхронно)
            this.saveObjectEvaluation(this.selectedObjectId, evaluation);
            
            // Пересчитываем эталонную цену (но не обновляем панель подсегментов при простом выборе объекта)
            await this.calculateReferencePrice(true);
            
            // Обновляем отображение карточек
            await this.updateObjectsDisplay();
        }
    }

    /**
     * Сохранение оценки объекта в базу данных
     */
    async saveObjectEvaluation(objectId, evaluation) {
        try {
            if (!window.db) {
                console.error('❌ FlippingProfitabilityManager: База данных недоступна');
                return;
            }
            
            // Используем objectId как есть (следуя паттерну ComparativeAnalysisManager)
            const object = await window.db.get('objects', objectId);
            
            if (!object) {
                console.error('❌ FlippingProfitabilityManager: Объект не найден:', objectId);
                return;
            }
            
            // Добавляем/обновляем поле оценки
            object.user_evaluation = evaluation;
            object.evaluation_date = new Date().toISOString();
            
            // Сохраняем обновлённый объект
            await window.db.put('objects', object);
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка сохранения оценки объекта:', error);
        }
    }

    /**
     * Загрузка текущей оценки объекта и установка в селектор
     */
    async loadObjectEvaluation(objectId) {
        try {
            if (!objectId) {
                return;
            }
            
            let evaluation = null;
            
            // Сначала проверяем локальную Map
            if (this.evaluations.has(objectId)) {
                evaluation = this.evaluations.get(objectId);
            } else if (window.db) {
                // Если в Map нет, загружаем из базы данных
                try {
                    const object = await window.db.get('objects', objectId);
                    if (object && object.user_evaluation) {
                        evaluation = object.user_evaluation;
                        // Сохраняем в локальную Map
                        this.evaluations.set(objectId, evaluation);
                    }
                } catch (error) {
                    console.error('❌ FlippingProfitabilityManager: Ошибка загрузки из БД:', error);
                }
            }
            
            // Устанавливаем значение в селекторе (временно отключаем обработчик событий)
            this.isLoadingEvaluation = true;
            
            if (evaluation) {
                if (this.evaluationSlimSelect) {
                    this.evaluationSlimSelect.setSelected(evaluation);
                } else {
                    this.evaluationSelect.value = evaluation;
                }
            } else {
                // Сбрасываем селектор если оценки нет
                if (this.evaluationSlimSelect) {
                    this.evaluationSlimSelect.setSelected('');
                } else {
                    this.evaluationSelect.value = '';
                }
            }
            
            // Включаем обработчик событий обратно
            this.isLoadingEvaluation = false;
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки оценки объекта:', error);
        }
    }

    /**
     * Расчёт эталонной цены на основе оценённых объектов
     */
    /**
     * Иерархический расчёт эталонной цены на уровне подсегментов
     * - Если выбран подсегмент: расчёт только по нему
     * - Если выбран сегмент: расчёт по всем подсегментам сегмента отдельно
     * - Если фильтр пуст: перебор всех сегментов и их подсегментов отдельно
     */
    async calculateReferencePrice(updatePanel = true) {
        if (this.debugEnabled) {
            console.log('🔍 calculateReferencePrice: Начало расчёта эталонной цены', {
                filteredObjects: this.filteredObjects?.length,
                evaluations: this.evaluations?.size,
                updatePanel: updatePanel
            });
        }
        
        try {
            
            if (!this.filteredObjects || this.filteredObjects.length === 0) {
                if (this.debugEnabled) {
                    
                }
                this.referencePrice = { perMeter: null, total: null, area: null, count: 0 };
                this.referencePrices = []; // Множественные эталонные цены
                return;
            }
            
            // Если нет оценок, создаём базовые карточки подсегментов с нулевой эталонной ценой
            if (this.evaluations.size === 0) {
                if (this.debugEnabled) {
                    
                }
                await this.createBaseSubsegmentCards();
                if (updatePanel) {
                    await this.updateReferencePricePanel();
                }
                return;
            }

            const currentSegment = this.reportsManager.currentSegment;
            const currentSubsegment = this.reportsManager.currentSubsegment;
            
            if (this.debugEnabled) {
                console.log('🔍 calculateReferencePrice: Текущие фильтры', {
                    currentSegment: currentSegment?.name,
                    currentSubsegmentId: currentSubsegment?.id,
                    currentSubsegmentName: currentSubsegment?.name,
                    segments: this.reportsManager.segments?.length,
                    objectTypes: [...new Set(this.filteredObjects.map(o => o.property_type))]
                });
            }

            // Веса для разных типов ремонта (все качественные)
            const weights = {
                'flipping': 1.0,            // Максимальный вес - прямой эталон стратегии
                'designer_renovation': 0.9, // Высокий вес - премиум сегмент
                'euro_renovation': 0.8      // Хороший вес - стандартный качественный ремонт
            };

            // Определяем уровень фильтрации
            if (currentSubsegment) {
                
                // Случай 1: Выбран конкретный подсегмент - расчёт только по нему
                // Найдем сегмент для этого подсегмента
                let segmentName = null;
                for (const segment of this.reportsManager.segments) {
                    const subsegments = await this.database.getSubsegmentsBySegment(segment.id);
                    if (subsegments.find(s => s.id === currentSubsegment.id)) {
                        segmentName = segment.name;
                        break;
                    }
                }
                this.referencePrices = [await this.calculateSubsegmentReferencePrice(currentSubsegment, weights, segmentName)];
                this.referencePrice = this.referencePrices[0] || { perMeter: null, total: null, area: null, count: 0 };
            } else if (currentSegment) {
                
                // Случай 2: Выбран сегмент - расчёт по всем подсегментам сегмента отдельно
                const subsegments = await this.database.getSubsegmentsBySegment(currentSegment.id);
                
                this.referencePrices = [];
                for (const subsegment of subsegments) {
                    const price = await this.calculateSubsegmentReferencePrice(subsegment, weights, currentSegment.name);
                    if (price && price.count > 0) {
                        this.referencePrices.push(price);
                    }
                }
                // Используем первую доступную цену как основную (или null если нет данных)
                this.referencePrice = this.referencePrices[0] || { perMeter: null, total: null, area: null, count: 0 };
            } else {
                if (this.debugEnabled) {
                    
                    
                }
                // Случай 3: Фильтр пуст - перебор всех сегментов и их подсегментов
                this.referencePrices = [];
                for (const segment of this.reportsManager.segments) {
                    const subsegments = await this.database.getSubsegmentsBySegment(segment.id);
                    for (const subsegment of subsegments) {
                        const price = await this.calculateSubsegmentReferencePrice(subsegment, weights, segment.name);
                        if (price && price.count > 0) {
                            this.referencePrices.push(price);
                        }
                    }
                }
                // Используем первую доступную цену как основную (или null если нет данных)
                this.referencePrice = this.referencePrices[0] || { perMeter: null, total: null, area: null, count: 0 };
            }

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка расчёта эталонной цены:', error);
            this.referencePrice = { perMeter: null, total: null, area: null, count: 0 };
            this.referencePrices = [];
        }
        
        // Обновляем отображение панели эталонной цены (только если updatePanel = true)
        if (updatePanel) {
            await this.updateReferencePricePanel();
        }
    }

    /**
     * Расчёт эталонной цены для конкретного подсегмента
     */
    async calculateSubsegmentReferencePrice(subsegment, weights, segmentName = null) {
        try {
            if (this.debugEnabled) {
                console.log(`🔍 Расчёт эталонной цены для подсегмента "${subsegment.name}" (сегмент: ${segmentName}):`, {
                    subsegmentId: subsegment.id,
                    segmentId: subsegment.segment_id,
                    filters: subsegment.filters,
                    totalFilteredObjects: this.filteredObjects.length
                });
            }
            
            // Сначала фильтруем объекты по сегменту через адреса
            let segmentObjects = this.filteredObjects;
            
            if (subsegment.segment_id) {
                // Получаем сегмент
                const segment = await this.database.getSegment(subsegment.segment_id);
                if (!segment) {
                    console.log(`⚠️ Сегмент ${subsegment.segment_id} не найден`);
                    return {
                        perMeter: null,
                        total: null,
                        area: null,
                        count: 0,
                        subsegmentName: subsegment.name,
                        subsegmentId: subsegment.id,
                        segmentName: segmentName
                    };
                }
                
                // Получаем все адреса в области сегмента
                const addresses = await this.database.getAddressesInMapArea(segment.map_area_id);
                const addressIds = new Set(addresses.map(a => a.id));
                
                // Фильтруем адреса по критериям сегмента (если есть)
                let filteredAddresses = addresses;
                if (segment.filters) {
                    if (this.debugEnabled) {
                        
                    }
                    // Используем метод из ReportsManager для фильтрации адресов
                    filteredAddresses = this.reportsManager.filterAddressesBySegmentCriteria(addresses, segment.filters);
                    if (this.debugEnabled) {
                        
                    }
                }
                
                // Создаём Set из ID отфильтрованных адресов для быстрой проверки
                const filteredAddressIds = new Set(filteredAddresses.map(a => a.id));
                
                // Фильтруем объекты - оставляем только те, которые принадлежат отфильтрованным адресам сегмента
                segmentObjects = this.filteredObjects.filter(obj => {
                    return obj.address_id && filteredAddressIds.has(obj.address_id);
                });
                
                if (this.debugEnabled) {
                    
                }
            }
            
            // Теперь фильтруем объекты сегмента по критериям подсегмента
            const subsegmentObjects = segmentObjects.filter(obj => {
                // Проверяем соответствие фильтрам подсегмента
                const matches = this.reportsManager.objectMatchesSubsegment(obj, subsegment);
                
                if (this.debugEnabled && matches) {
                    console.log(`🔍 Объект подходит для "${subsegment.name}":`, {
                        id: obj.id,
                        property_type: obj.property_type,
                        area_total: obj.area_total,
                        current_price: obj.current_price
                    });
                }
                
                return matches;
            });
            
            if (this.debugEnabled) {
                
            }

            // Фильтруем только оценённые ПРОДАННЫЕ объекты с качественным ремонтом
            const evaluatedObjects = subsegmentObjects.filter(obj => 
                obj.status === 'archive' && // Только проданные
                this.evaluations.has(obj.id) && 
                weights[this.evaluations.get(obj.id)] > 0 &&
                obj.current_price > 0 &&
                obj.area_total > 0
            );


            if (evaluatedObjects.length === 0) {
                return {
                    perMeter: null,
                    total: null,
                    area: null,
                    count: 0,
                    subsegmentName: subsegment.name,
                    subsegmentId: subsegment.id,
                    segmentName: segmentName
                };
            }

            let weightedSum = 0;
            let totalWeight = 0;
            let totalArea = 0;

            evaluatedObjects.forEach(obj => {
                const evaluation = this.evaluations.get(obj.id);
                const pricePerMeter = obj.current_price / obj.area_total;
                const weight = weights[evaluation];
                
                // Учёт актуальности продажи (чем свежее продажа, тем актуальнее цена)
                const daysSinceUpdate = (Date.now() - new Date(obj.updated).getTime()) / (1000 * 60 * 60 * 24);
                const recencyFactor = Math.max(0.7, 1 - daysSinceUpdate / 365); // От 0.7 до 1.0 за год
                
                const adjustedWeight = weight * recencyFactor;
                weightedSum += pricePerMeter * adjustedWeight;
                totalWeight += adjustedWeight;
                totalArea += obj.area_total;
            });

            const averageArea = totalArea / evaluatedObjects.length;
            const referencePricePerMeter = weightedSum / totalWeight;

            return {
                perMeter: Math.round(referencePricePerMeter),
                total: Math.round(referencePricePerMeter * averageArea),
                area: Math.round(averageArea),
                count: evaluatedObjects.length,
                subsegmentName: subsegment.name,
                subsegmentId: subsegment.id,
                segmentName: segmentName
            };

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка расчёта эталонной цены для подсегмента:', subsegment.name, error);
            return {
                perMeter: null,
                total: null,
                area: null,
                count: 0,
                subsegmentName: subsegment.name,
                subsegmentId: subsegment.id,
                segmentName: segmentName
            };
        }
    }

    /**
     * Расчёт среднего срока экспозиции оценённых объектов
     */
    calculateAverageExposure() {
        try {
            if (!this.filteredObjects || this.filteredObjects.length === 0 || this.evaluations.size === 0) {
                return null;
            }

            // Фильтруем только оценённые проданные объекты
            const evaluatedObjects = this.filteredObjects.filter(obj => 
                obj.status === 'archive' && // Только проданные
                this.evaluations.has(obj.id)
            );

            if (evaluatedObjects.length === 0) {
                return null;
            }

            const exposureDays = evaluatedObjects.map(obj => {
                const created = new Date(obj.created);
                const updated = new Date(obj.updated);
                const days = Math.floor((updated - created) / (1000 * 60 * 60 * 24));
                return days > 0 ? days : 1; // Минимум 1 день
            }).filter(days => days > 0); // Убираем некорректные значения

            if (exposureDays.length === 0) {
                return null;
            }

            // Сортируем для расчёта медианы
            const sorted = exposureDays.sort((a, b) => a - b);
            
            // Расчёт медианы
            const median = sorted.length % 2 === 0
                ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                : sorted[Math.floor(sorted.length / 2)];
            
            // Расчёт среднего
            const average = exposureDays.reduce((a, b) => a + b, 0) / exposureDays.length;

            return {
                median: Math.round(median),
                average: Math.round(average),
                min: sorted[0],
                max: sorted[sorted.length - 1],
                count: evaluatedObjects.length
            };

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка расчёта срока экспозиции:', error);
            return null;
        }
    }

    /**
     * Создание базовых карточек подсегментов без оценок
     */
    async createBaseSubsegmentCards() {
        try {
            const currentSegment = this.reportsManager.currentSegment;
            if (!currentSegment) {
                this.referencePrices = [];
                return;
            }
            
            // Получаем все подсегменты текущего сегмента
            const subsegments = await this.database.getSubsegmentsBySegment(currentSegment.id);
            
            if (!subsegments || subsegments.length === 0) {
                this.referencePrices = [];
                return;
            }
            
            // Создаём базовые карточки для каждого подсегмента
            this.referencePrices = subsegments.map(subsegment => ({
                id: subsegment.id,
                name: subsegment.name,
                segment: currentSegment.name,
                referencePrice: { 
                    perMeter: null, 
                    total: null, 
                    area: null, 
                    count: 0,
                    evaluatedCount: 0,
                    status: 'no_evaluations'
                },
                exposure: { days: null, count: 0 },
                objects: [],
                evaluatedObjects: []
            }));
            
            if (this.debugEnabled) {
                
            }
            
        } catch (error) {
            console.error('❌ createBaseSubsegmentCards: Ошибка создания базовых карточек:', error);
            this.referencePrices = [];
        }
    }

    /**
     * Обновление панели эталонной цены и срока экспозиции
     */
    async updateReferencePricePanel() {
        if (this.debugEnabled) {
            console.log('🔍 updateReferencePricePanel: Обновление панели эталонных цен', {
                referencePrices: this.referencePrices?.length,
                referencePrice: this.referencePrice
            });
        }
        
        const cardsContainer = document.getElementById('referencePriceCardsContainer');
        
        if (!cardsContainer) {
            if (this.debugEnabled) {
                console.log('⚠️ updateReferencePricePanel: Контейнер карточек не найден');
            }
            return;
        }
        
        if (this.referencePrices.length > 0) {
            // Показываем контейнер с карточками
            cardsContainer.classList.remove('hidden');
            
            // Очищаем существующие карточки
            cardsContainer.innerHTML = '';
            
            // Создаём карточку для каждого подсегмента (асинхронно)
            for (let index = 0; index < this.referencePrices.length; index++) {
                const price = this.referencePrices[index];
                const card = await this.createSubsegmentCard(price, index);
                cardsContainer.appendChild(card);
            }
            
        } else {
            // Скрываем контейнер если нет данных
            cardsContainer.classList.add('hidden');
        }
    }

    /**
     * Создание карточки подсегмента с эталонной ценой
     */
    async createSubsegmentCard(priceData, colorIndex = 0) {
        const colors = this.getSubsegmentColorScheme(colorIndex);
        const card = document.createElement('div');
        card.className = `p-3 ${colors.bgColor} rounded-lg text-xs ${colors.textColor} border ${colors.borderColor}`;
        
        // Форматируем дни в понятный вид
        const formatDays = (days) => {
            if (!days) return 'Нет данных';
            if (days === 1) return '1 день';
            if (days < 5) return `${days} дня`;
            return `${days} дней`;
        };
        
        const referencePrice = priceData.referencePrice;
        const exposure = priceData.exposure;
        
        card.innerHTML = `
            <div class="space-y-2">
                <!-- Заголовок подсегмента -->
                <div class="font-medium ${colors.titleColor} text-sm border-b ${colors.borderColor} pb-2">
                    ${priceData.segment ? `${priceData.segment} - ${priceData.name}` : priceData.name}
                </div>
                
                <!-- Информация в две колонки -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <!-- Левая колонка: Эталонная цена -->
                    <div>
                        <div class="font-medium mb-1">Эталонная цена:</div>
                        ${referencePrice.perMeter ? `
                        <div class="font-semibold">${new Intl.NumberFormat('ru-RU').format(referencePrice.perMeter)} ₽/м²</div>
                        <div>${new Intl.NumberFormat('ru-RU').format(referencePrice.total)} ₽ (${referencePrice.area}м²)</div>
                        <div class="${colors.accentColor} mt-1">${referencePrice.evaluatedCount} оценок из ${referencePrice.count} объектов</div>
                        ` : `
                        <div class="text-gray-400 text-xs">Нет оценок</div>
                        <div class="${colors.accentColor} mt-1">${referencePrice.count} объектов</div>
                        `}
                    </div>
                    
                    <!-- Правая колонка: Средний срок экспозиции -->
                    <div>
                        <div class="font-medium mb-1">Средний срок экспозиции:</div>
                        ${exposure.days ? `
                        <div class="font-semibold">${formatDays(exposure.days)}</div>
                        <div class="${colors.accentColor}">На основе ${exposure.count} продаж</div>
                        ` : `
                        <div class="text-gray-400 text-xs">Нет данных о продажах</div>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        // Добавляем обработчики событий для интерактивности
        card.style.cursor = 'pointer';
        card.dataset.subsegmentId = priceData.id;
        
        // Обработчик клика для фильтрации по подсегменту
        card.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handleSubsegmentCardClick(priceData.id);
        });
        
        // Hover-эффекты как у карточек объектов
        card.addEventListener('mouseenter', () => {
            if (this.activeSubsegmentId !== priceData.id) {
                card.style.borderColor = colors.graphColor;
                card.style.borderWidth = '1px';
                card.style.transform = 'translateY(-1px)';
                card.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
            }
        });
        
        card.addEventListener('mouseleave', () => {
            if (this.activeSubsegmentId !== priceData.id) {
                card.style.borderColor = '';
                card.style.borderWidth = '';
                card.style.transform = '';
                card.style.boxShadow = '';
            }
        });
        
        // Устанавливаем активное состояние если этот подсегмент выбран
        if (this.activeSubsegmentId === priceData.id) {
            this.setCardActiveState(card, colors, true);
        }
        
        return card;
    }

    /**
     * Получение цветовой схемы для подсегментов
     * Возвращает объект с цветами для фона, границы, текста и графика
     */
    getSubsegmentColorScheme(index) {
        const colorSchemes = [
            {
                // Фиолетовый (индиго)
                graphColor: '#8b5cf6',
                bgColor: 'bg-indigo-50',
                borderColor: 'border-indigo-200',
                textColor: 'text-indigo-800',
                titleColor: 'text-indigo-900',
                accentColor: 'text-indigo-600'
            },
            {
                // Голубой (циан)
                graphColor: '#06b6d4',
                bgColor: 'bg-cyan-50',
                borderColor: 'border-cyan-200',
                textColor: 'text-cyan-800',
                titleColor: 'text-cyan-900',
                accentColor: 'text-cyan-600'
            },
            {
                // Янтарный 
                graphColor: '#f59e0b',
                bgColor: 'bg-amber-50',
                borderColor: 'border-amber-200',
                textColor: 'text-amber-800',
                titleColor: 'text-amber-900',
                accentColor: 'text-amber-600'
            },
            {
                // Изумрудный
                graphColor: '#10b981',
                bgColor: 'bg-emerald-50',
                borderColor: 'border-emerald-200',
                textColor: 'text-emerald-800',
                titleColor: 'text-emerald-900',
                accentColor: 'text-emerald-600'
            },
            {
                // Красный
                graphColor: '#ef4444',
                bgColor: 'bg-red-50',
                borderColor: 'border-red-200',
                textColor: 'text-red-800',
                titleColor: 'text-red-900',
                accentColor: 'text-red-600'
            },
            {
                // Розовый
                graphColor: '#ec4899',
                bgColor: 'bg-pink-50',
                borderColor: 'border-pink-200',
                textColor: 'text-pink-800',
                titleColor: 'text-pink-900',
                accentColor: 'text-pink-600'
            }
        ];
        
        return colorSchemes[index % colorSchemes.length];
    }

    /**
     * Обработчик клика по карточке подсегмента
     */
    async handleSubsegmentCardClick(subsegmentId) {
        try {
            // Всегда показываем клики для диагностики
            console.log(`🔍 Клик по карточке подсегмента: ${subsegmentId}`, {
                activeSubsegmentId: this.activeSubsegmentId,
                filteredObjectsCount: this.filteredObjects?.length
            });
            
            // Если кликнули по уже активному подсегменту, сбрасываем фильтрацию
            if (this.activeSubsegmentId === subsegmentId) {
                this.clearSubsegmentFilter();
            } else {
                // Активируем фильтрацию по новому подсегменту
                await this.setActiveSubsegment(subsegmentId);
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обработки клика по подсегменту:', error);
        }
    }

    /**
     * Установка активного подсегмента и фильтрация
     */
    async setActiveSubsegment(subsegmentId) {
        try {
            // Сохраняем исходные объекты если еще не сохранили
            if (this.activeSubsegmentId === null) {
                this.originalFilteredObjects = [...this.filteredObjects];
                
            }
            
            this.activeSubsegmentId = subsegmentId;
            
            
            // Получаем подсегмент для фильтрации
            const subsegment = await this.getSubsegmentById(subsegmentId);
            if (!subsegment) {
                console.error('❌ FlippingProfitabilityManager: Подсегмент не найден:', subsegmentId);
                return;
            }
            
            // Сначала фильтруем объекты по сегменту (через адреса), затем по подсегменту
            
            
            // Получаем сегмент
            const segment = await this.database.getSegment(subsegment.segment_id);
            if (!segment) {
                console.error('❌ Сегмент не найден:', subsegment.segment_id);
                this.filteredObjects = [];
                return;
            }
            
            // Получаем адреса сегмента и фильтруем их по критериям сегмента
            const addresses = await this.database.getAddressesInMapArea(segment.map_area_id);
            let filteredAddresses = addresses;
            if (segment.filters) {
                filteredAddresses = this.reportsManager.filterAddressesBySegmentCriteria(addresses, segment.filters);
            }
            const filteredAddressIds = new Set(filteredAddresses.map(a => a.id));
            
            
            
            // Фильтруем объекты: сначала по сегменту (адресам), затем по подсегменту
            this.filteredObjects = this.originalFilteredObjects.filter(obj => {
                // Проверка принадлежности к сегменту через адрес
                const belongsToSegment = obj.address_id && filteredAddressIds.has(obj.address_id);
                if (!belongsToSegment) {
                    return false;
                }
                
                // Проверка соответствия критериям подсегмента
                const matchesSubsegment = this.reportsManager.objectMatchesSubsegment(obj, subsegment);
                
                if (belongsToSegment && matchesSubsegment) {
                    console.log(`✅ Объект ${obj.id} подходит под сегмент+подсегмент`, {
                        property_type: obj.property_type,
                        area_total: obj.area_total,
                        address_id: obj.address_id
                    });
                }
                
                return matchesSubsegment;
            });
            
            
            
            // Обновляем интерфейс
            await this.updateInterfaceAfterSubsegmentFilter();
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка установки активного подсегмента:', error);
        }
    }

    /**
     * Сброс фильтрации по подсегменту
     */
    async clearSubsegmentFilter() {
        try {
            
            
            this.activeSubsegmentId = null;
            
            // Восстанавливаем исходные объекты
            if (this.originalFilteredObjects.length > 0) {
                this.filteredObjects = [...this.originalFilteredObjects];
                this.originalFilteredObjects = [];
                
            }
            
            // Обновляем интерфейс
            await this.updateInterfaceAfterSubsegmentFilter();
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка сброса фильтрации подсегмента:', error);
        }
    }

    /**
     * Обновление интерфейса после изменения фильтрации по подсегменту
     */
    async updateInterfaceAfterSubsegmentFilter() {
        try {
            
            
            // Обновляем карточки подсегментов (для визуализации активного состояния)
            
            this.updateSubsegmentCardsActiveState();
            
            // Обновляем график
            
            await this.updateMarketCorridorChart();
            
            // Обновляем блок объектов для оценки (БЕЗ пересчета карточек подсегментов)
            
            await this.updateObjectsDisplayOnly();
            
            // Обновляем FlippingController (таблица объектов)
            if (this.flippingController) {
                
                
                // Загружаем адреса для объектов если они не загружены
                const objectsWithAddresses = await this.loadAddressesForObjects(this.filteredObjects);
                
                // Устанавливаем отфильтрованные объекты в контроллер
                this.flippingController.filteredObjects = objectsWithAddresses;
                await this.flippingController.updateUIComponents();
            } else {
                console.warn('⚠️ FlippingController недоступен');
            }
            
            
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления интерфейса:', error);
        }
    }

    /**
     * Загрузка адресов для объектов
     */
    async loadAddressesForObjects(objects) {
        try {
            
            
            const objectsWithAddresses = [];
            for (const obj of objects) {
                const objWithAddress = { ...obj };
                
                if (obj.address_id && !obj.address) {
                    try {
                        objWithAddress.address = await window.db.getAddress(obj.address_id);
                        console.log(`🔧 Загружен адрес для объекта ${obj.id}:`, {
                            hasAddress: !!objWithAddress.address,
                            addressString: objWithAddress.address?.address_string,
                            hasCoords: !!(objWithAddress.address?.latitude && objWithAddress.address?.longitude),
                            addressData: objWithAddress.address
                        });
                    } catch (error) {
                        console.warn(`⚠️ Не удалось загрузить адрес ${obj.address_id} для объекта ${obj.id}:`, error);
                        objWithAddress.address = null;
                    }
                }
                
                // Рассчитываем доходность для объекта
                if (this.profitabilityService && objWithAddress.price && objWithAddress.area) {
                    try {
                        const profitabilityParams = this.getCurrentFormData();
                        objWithAddress.profitability = this.profitabilityService.calculateFlippingProfitability(objWithAddress, profitabilityParams);
                        console.log(`💰 Рассчитана доходность для объекта ${obj.id}: ${objWithAddress.profitability.annualROI?.toFixed(1) || 0}% годовых`);
                    } catch (error) {
                        console.warn(`⚠️ Не удалось рассчитать доходность для объекта ${obj.id}:`, error);
                    }
                }
                
                objectsWithAddresses.push(objWithAddress);
            }
            
            console.log('🔧 FlippingProfitabilityManager: Объектов с загруженными адресами:', 
                objectsWithAddresses.filter(obj => obj.address).length, 'из', objects.length);
            
            return objectsWithAddresses;
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки адресов:', error);
            return objects; // Возвращаем исходные объекты в случае ошибки
        }
    }

    /**
     * Обновление блока объектов для оценки БЕЗ пересчёта карточек подсегментов
     * Используется для избежания лишних пересчётов при фильтрации подсегментов
     */
    async updateObjectsDisplayOnly() {
        try {
            if (this.debugEnabled) {
            }
            
            if (!this.objectsGrid || !this.filteredObjects) return;
            
            // Показываем все архивные объекты, пользователь будет выбирать подходящие для оценки
            const objects = this.filteredObjects.filter(obj => 
                obj.status === 'archive' // Только проданные объекты
            );
            
            if (this.debugEnabled) {
                
            }
            
            // НЕ вызываем calculateReferencePrice() чтобы не пересчитывать карточки подсегментов
            
            if (objects.length === 0) {
                this.objectsGrid.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">Нет проданных объектов для оценки</div>';
                return;
            }
            
            // Создаем блоки объектов (копия логики из updateObjectsDisplay)
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
                        ${this.evaluations.has(obj.id) ? (() => {
                            const evaluation = this.evaluations.get(obj.id);
                            const evaluationLabels = {
                                'flipping': 'Флиппинг',
                                'designer_renovation': 'Дизайнерский',
                                'euro_renovation': 'Евроремонт'
                            };
                            const evalLabel = evaluationLabels[evaluation] || evaluation;
                            return `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">${evalLabel}</span></div>`;
                        })() : ''}
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
            
            // Восстанавливаем выделение выбранного объекта если он есть
            if (this.selectedObjectId) {
                const selectedBlock = this.objectsGrid.querySelector(`[data-object-id="${this.selectedObjectId}"]`);
                if (selectedBlock) {
                    selectedBlock.classList.add('selected');
                    if (this.debugEnabled) {
                        
                    }
                } else if (this.debugEnabled) {
                    console.log('⚠️ Выбранный объект не найден в новом списке:', this.selectedObjectId);
                    this.selectedObjectId = null; // Сбрасываем, если объект исчез из списка
                }
            }
            
            // Обновляем карту FlippingController для отображения отфильтрованных объектов
            console.log('🗺️ Проверяем наличие FlippingController и карты:', {
                hasFlippingController: !!this.flippingController,
                hasFlippingMap: !!(this.flippingController && this.flippingController.flippingMap),
                activeSubsegmentId: this.activeSubsegmentId
            });
            
            if (this.flippingController && this.flippingController.flippingMap) {
                
                
                // При фильтрации по подсегменту показываем на карте ВСЕ объекты сегмента (не только архивные)
                // чтобы видеть полную картину по домам сегмента
                let objectsForMap = [];
                
                if (this.activeSubsegmentId) {
                    // Если выбран подсегмент, показываем все объекты из исходного набора,
                    // которые принадлежат к адресам сегмента этого подсегмента
                    const subsegment = await this.getSubsegmentById(this.activeSubsegmentId);
                    if (subsegment) {
                        const segment = await this.database.getSegment(subsegment.segment_id);
                        if (segment) {
                            // Получаем адреса сегмента
                            const addresses = await this.database.getAddressesInMapArea(segment.map_area_id);
                            let filteredAddresses = addresses;
                            if (segment.filters) {
                                filteredAddresses = this.reportsManager.filterAddressesBySegmentCriteria(addresses, segment.filters);
                            }
                            const filteredAddressIds = new Set(filteredAddresses.map(a => a.id));
                            
                            // Фильтруем ВСЕ объекты (не только архивные) по адресам сегмента
                            objectsForMap = this.originalFilteredObjects.filter(obj => 
                                obj.address_id && filteredAddressIds.has(obj.address_id)
                            );
                            
                            
                            
                        } else {
                            console.warn('⚠️ Сегмент не найден для подсегмента:', subsegment.segment_id);
                        }
                    }
                } else {
                    // Если подсегмент не выбран, показываем все объекты
                    objectsForMap = this.filteredObjects;
                }
                
                // Устанавливаем отфильтрованные объекты в контроллер для таблицы
                this.flippingController.filteredObjects = this.filteredObjects;
                
                // Карта обновляется автоматически через FlippingController
            } else {
                if (this.debugEnabled) {
                    console.warn('⚠️ FlippingController или flippingMap недоступны для обновления карты');
                }
            }
            
            if (this.debugEnabled) {
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка в updateObjectsDisplayOnly:', error);
        }
    }


    /**
     * Обновление активного состояния карточек подсегментов
     */
    updateSubsegmentCardsActiveState() {
        try {
            const cardsContainer = document.getElementById('referencePriceCardsContainer');
            if (!cardsContainer) return;
            
            const cards = cardsContainer.querySelectorAll('[data-subsegment-id]');
            cards.forEach((card, index) => {
                const subsegmentId = card.dataset.subsegmentId; // Оставляем как строку
                const colors = this.getSubsegmentColorScheme(index);
                const isActive = this.activeSubsegmentId === subsegmentId;
                
                console.log(`🔧 Карточка ${index}:`, {
                    subsegmentId,
                    activeSubsegmentId: this.activeSubsegmentId,
                    isActive
                });
                
                this.setCardActiveState(card, colors, isActive);
            });
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления активного состояния карточек:', error);
        }
    }

    /**
     * Установка активного состояния карточки (в стиле карточек объектов)
     */
    setCardActiveState(card, colors, isActive) {
        try {
            if (isActive) {
                // Активное состояние - в стиле карточек объектов (.flipping-object-block.selected)
                card.style.borderColor = '#3b82f6';
                card.style.backgroundColor = '#eff6ff';
                card.style.transition = 'all 0.15s ease';
            } else {
                // Обычное состояние - сбрасываем на оригинальные стили 
                card.style.borderColor = '';
                card.style.backgroundColor = '';
                card.style.transition = 'all 0.15s ease';
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка установки состояния карточки:', error);
        }
    }

    /**
     * Получение подсегмента по ID
     */
    async getSubsegmentById(subsegmentId) {
        try {
            for (const segment of this.reportsManager.segments) {
                const segmentSubsegments = await this.database.getSubsegmentsBySegment(segment.id);
                const found = segmentSubsegments.find(s => s.id === subsegmentId);
                if (found) {
                    return found;
                }
            }
            return null;
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка получения подсегмента:', error);
            return null;
        }
    }

    /**
     * Расчёт среднего срока экспозиции для конкретного подсегмента
     */
    async calculateSubsegmentExposure(subsegmentId) {
        try {
            if (!this.filteredObjects || this.filteredObjects.length === 0 || this.evaluations.size === 0) {
                if (this.debugEnabled) {
                    
                }
                return null;
            }

            // Получаем подсегмент (ищем во всех подсегментах всех сегментов)
            let subsegment = null;
            for (const segment of this.reportsManager.segments) {
                const segmentSubsegments = await this.database.getSubsegmentsBySegment(segment.id);
                const found = segmentSubsegments.find(s => s.id === subsegmentId);
                if (found) {
                    subsegment = found;
                    break;
                }
            }
            
            if (!subsegment) {
                if (this.debugEnabled) {
                    
                }
                return null;
            }

            // Фильтруем объекты по подсегменту
            const subsegmentObjects = this.filteredObjects.filter(obj => {
                return this.reportsManager.objectMatchesSubsegment(obj, subsegment);
            });

            // Фильтруем только оценённые проданные объекты
            const evaluatedObjects = subsegmentObjects.filter(obj => 
                obj.status === 'archive' && // Только проданные
                this.evaluations.has(obj.id)
            );

            if (this.debugEnabled) {
                
            }

            if (evaluatedObjects.length === 0) {
                return null;
            }

            const exposureDays = evaluatedObjects.map(obj => {
                const created = new Date(obj.created);
                const updated = new Date(obj.updated);
                const days = Math.floor((updated - created) / (1000 * 60 * 60 * 24));
                return days > 0 ? days : 1; // Минимум 1 день
            });

            exposureDays.sort((a, b) => a - b);
            
            const median = exposureDays.length % 2 === 0 
                ? Math.round((exposureDays[exposureDays.length / 2 - 1] + exposureDays[exposureDays.length / 2]) / 2)
                : exposureDays[Math.floor(exposureDays.length / 2)];
                
            const average = Math.round(exposureDays.reduce((sum, days) => sum + days, 0) / exposureDays.length);
            const min = Math.min(...exposureDays);
            const max = Math.max(...exposureDays);

            return {
                median,
                average,
                min,
                max,
                count: evaluatedObjects.length
            };

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка расчёта срока экспозиции подсегмента:', error);
            return null;
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
     * Обновление таблицы объектов для инвестирования
     */
    updateInvestmentTable() {
        // Этот метод обновляет таблицу объектов для оценки
        // Функциональность интегрирована с новой архитектурой v0.1
        // Обновление происходит через FlippingController
        if (this.flippingController && this.filteredObjects) {
            this.flippingController.filteredObjects = this.filteredObjects;
        }
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
        
        // Автоматически применяем фильтры
        this.applyFilters();
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
        
        // Показ/скрытие полей настройки
        this.toggleConditionalFields('profitSharing', value);
        
        // Автоматически применяем фильтры
        this.applyFilters();
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
        
        // Автоматически применяем фильтры
        this.applyFilters();
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
        
        // Автоматически применяем фильтры
        this.applyFilters();
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
        
        // Автоматически применяем фильтры
        this.applyFilters();
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
                const percentageSettings = document.getElementById('flippingProfitPercentageSettings');
                const fixedPlusSettings = document.getElementById('flippingFixedPlusPercentageSettings');
                
                if (percentageSettings && fixedPlusSettings) {
                    if (value === 'percentage') {
                        percentageSettings.classList.remove('hidden');
                        fixedPlusSettings.classList.add('hidden');
                    } else if (value === 'fix-plus-percentage') {
                        percentageSettings.classList.add('hidden');
                        fixedPlusSettings.classList.remove('hidden');
                    } else {
                        percentageSettings.classList.add('hidden');
                        fixedPlusSettings.classList.add('hidden');
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
                
                // Рассчитываем доходность для всех объектов
                await this.calculateProfitabilityForObjects();
                
                // Загружаем адреса для корректного отображения
                await this.loadAddresses();
                
                // Карта управляется FlippingController через FlippingMap
                // Убираем дублирующую инициализацию
                
                // Загружаем данные на карту
                await this.loadMapData();
                
                // Создаём график коридора рынка
                await this.createMarketCorridorChart();
                
                // Синхронизируем объекты с FlippingController перед обновлением UI
                if (this.flippingController && this.flippingController.filteredObjects) {
                    this.filteredObjects = this.flippingController.filteredObjects;
                    // Синхронизированы объекты с FlippingController (legacy)
                }
                
                // Обновляем панель объектов
                await this.updateObjectsDisplay();
                
                // Принудительно обновляем панель подсегментов (на случай если отчёт был скрыт/показан)
                if (this.referencePrices && this.referencePrices.length > 0) {
                    await this.updateReferencePricePanel();
                }
                
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
            
            // Рассчитываем доходность для всех объектов
            await this.calculateProfitabilityForObjects();
            
            // Загружаем адреса для корректного отображения
            await this.loadAddresses();
            
            // Карта управляется FlippingController через FlippingMap
            // Убираем дублирующую инициализацию
            
            // Обновляем карту в legacy режиме
            await this.loadMapData();
            
            // Создаём график коридора рынка
            await this.createMarketCorridorChart();
            
            // Синхронизируем объекты с FlippingController перед обновлением UI
            if (this.flippingController && this.flippingController.filteredObjects) {
                this.filteredObjects = this.flippingController.filteredObjects;
                // Синхронизированы объекты с FlippingController
            }

            // Обновляем панель объектов
            await this.updateObjectsDisplay();
            
            // Принудительно обновляем панель подсегментов (на случай если отчёт был скрыт/показан)
            if (this.referencePrices && this.referencePrices.length > 0) {
                await this.updateReferencePricePanel();
            }
            
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
        if (this.debugEnabled) {
        }
        
        try {            
            // Ожидаем готовности базы данных перед любыми операциями
            try {
                await DatabaseUtils.ensureDatabaseReady();
                if (this.debugEnabled) {
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
            
            // Применяем фильтры для загрузки данных
            await this.applyFiltersImmediate();
            
            // Принудительно обновляем график после задержки для готовности DOM
            setTimeout(async () => {
                await this.forceUpdateChart();
            }, 1000);
            
            // Дополнительная попытка через большую задержку
            setTimeout(async () => {
                await this.forceUpdateChart();
            }, 2000);
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка показа отчёта:', error);
            this.showPlaceholder('Ошибка загрузки отчёта: ' + error.message);
        }
    }

    /**
     * Принудительное обновление графика
     */
    async forceUpdateChart() {
        try {
            if (this.marketCorridorChart) {
                this.marketCorridorChart.updateOptions({
                    chart: {
                        redrawOnParentResize: true
                    }
                });
                this.marketCorridorChart.render();
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка принудительного обновления графика:', error);
        }
    }

    /**
     * Обновление состояния селектора оценки
     */
    updateEvaluationSelectorState() {
        try {
            if (this.evaluationSelect) {
                // Простая заглушка для обновления состояния
                
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления состояния селектора:', error);
        }
    }

    /**
     * Загрузка адресов (заглушка для совместимости)
     */
    async loadAddresses() {
        try {
            
            // Адреса теперь загружаются через FlippingController
            return [];
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки адресов:', error);
            return [];
        }
    }

    // Методы карты удалены - карта управляется FlippingController через FlippingMap

    /**
     * Загрузка данных на карту (через FlippingController)
     */
    async loadMapData() {
        try {
            
            
            // Карта обновляется через FlippingController в updateObjectsDisplay
            if (this.flippingController) {
                await this.flippingController.updateUIComponents();
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки данных на карту:', error);
        }
    }

    /**
     * Создание графика рыночного коридора
     */
    async createMarketCorridorChart() {
        try {
            if (!this.chartContainer) {
                console.warn('⚠️ FlippingProfitabilityManager: Контейнер графика не найден');
                return;
            }

            
            
            // Подготавливаем данные для графика
            const chartData = this.prepareChartData();

            // Опции для графика ApexCharts
            const options = {
                series: chartData || [],
                chart: {
                    type: 'scatter',
                    height: 400,
                    zoom: {
                        enabled: true
                    },
                    animations: {
                        enabled: false
                    },
                    events: {
                        dataPointSelection: (event, chartContext, config) => {
                            this.handleChartClick(config);
                        }
                    }
                },
                xaxis: {
                    type: 'datetime',
                    title: {
                        text: 'Дата'
                    }
                },
                yaxis: {
                    title: {
                        text: 'Цена за м², руб'
                    },
                    labels: {
                        formatter: function (val) {
                            return new Intl.NumberFormat('ru-RU').format(val);
                        }
                    }
                },
                tooltip: {
                    custom: function({series, seriesIndex, dataPointIndex, w}) {
                        // Кастомный tooltip будет реализован позже
                        return '<div>Tooltip</div>';
                    }
                },
                legend: {
                    position: 'top'
                }
            };

            // Создаем график
            if (this.marketCorridorChart) {
                this.marketCorridorChart.destroy();
            }

            this.marketCorridorChart = new ApexCharts(this.chartContainer, options);
            await this.marketCorridorChart.render();

            

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка создания графика:', error);
        }
    }

    /**
     * Обновление графика рыночного коридора
     */
    async updateMarketCorridorChart() {
        try {
            
            
            if (!this.marketCorridorChart) {
                await this.createMarketCorridorChart();
                return;
            }

            // Подготавливаем данные для графика на основе отфильтрованных объектов
            const chartData = this.prepareChartData();
            
            // Обновляем серии данных
            if (chartData && chartData.length > 0) {
                this.marketCorridorChart.updateSeries(chartData);
                
            }

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления графика:', error);
        }
    }

    /**
     * Подготовка данных для графика
     */
    prepareChartData() {
        try {
            if (!this.filteredObjects || this.filteredObjects.length === 0) {
                return [];
            }

            // Подготавливаем данные точек для графика
            const data = this.filteredObjects
                .filter(obj => obj.price && obj.area_total)
                .map(obj => {
                    const pricePerMeter = Math.round(obj.price / obj.area_total);
                    const date = obj.created_at ? new Date(obj.created_at).getTime() : Date.now();
                    
                    return {
                        x: date,
                        y: pricePerMeter,
                        objectId: obj.id,
                        address: obj.address?.address_string || 'Адрес не указан',
                        price: obj.price,
                        area: obj.area_total
                    };
                });

            return [{
                name: 'Объекты недвижимости',
                data: data
            }];

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка подготовки данных графика:', error);
            return [];
        }
    }

    /**
     * Обработка клика по точке графика
     */
    handleChartClick(config) {
        try {
            
            // Обработка клика по точке графика
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обработки клика по графику:', error);
        }
    }

    /**
     * Обновление отображения объектов
     */
    async updateObjectsDisplay() {
        try {
            
            
            // Обновляем таблицу через FlippingController
            if (this.flippingController && this.flippingController.flippingTable) {
                await this.flippingController.flippingTable.updateData(this.filteredObjects, this.currentFilters);
                
            }

            // Обновляем карту через FlippingController  
            if (this.flippingController && this.flippingController.flippingMap) {
                // Извлекаем уникальные адреса из отфильтрованных объектов
                const addressMap = new Map();
                for (const obj of this.filteredObjects) {
                    if (obj.address && obj.address_id) {
                        addressMap.set(obj.address_id, obj.address);
                    }
                }
                const uniqueAddresses = Array.from(addressMap.values());
                
                await this.flippingController.flippingMap.updateAddresses(uniqueAddresses, this.currentFilters, this.filteredObjects);
                
            }

            // Обновляем график
            await this.updateMarketCorridorChart();
            

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления отображения объектов:', error);
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
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingProfitabilityManager;
}
