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
        
        // ✅ ИСПРАВЛЕНО: Флаг уничтожения для защиты от асинхронных операций
        this.isDestroyed = false;
        
        // Флаг инициализации для предотвращения двойной инициализации
        this.initialized = false;
        
        // ✅ ИСПРАВЛЕНО: Глобальный перехватчик ошибок ApexCharts
        this.setupApexChartsErrorSuppression();
        
        // Интеграция с архитектурой v0.1
        this.flippingController = null;
        this.profitabilityService = null;
        
        // Элементы интерфейса
        this.container = null;
        this.placeholder = null;
        this.content = null;
        this.filterContainer = null;
        this.objectsGrid = null;
        this.mapContainer = null;
        this.chartContainer = null;
        
        // Настройки расчёта доходности флиппинга
        this.flippingSettings = {
            purchaseExpenses: 300000,    // Расходы на покупку
            repairCostPerMeter: 15000,   // Стоимость ремонта за м²
            sellingExpenses: 300000,     // Расходы на продажу  
            maintenanceMonths: 6,        // Месяцы содержания
            maintenancePerMonth: 15000,  // Месячное содержание
            additionalExpenses: 100000
        };
        
        // Данные
        this.segments = [];
        this.subsegments = [];
        this.realEstateObjects = [];
        this.filteredObjects = [];
        this.objectsForEvaluation = []; // Объекты доступные для оценки (архивные)
        this.addresses = []; // Загруженные адреса области
        
        // График коридора рынка
        this.marketCorridorChart = null;
        this.marketCorridorMode = 'sales'; // 'sales' или 'history'
        this.currentPointsData = []; // Данные точек для tooltip
        this.chartCreationInProgress = false; // Флаг защиты от множественного создания
        this.chartUpdateInProgress = false; // Флаг защиты от одновременного обновления
        this.chartBeingDestroyed = false; // Флаг для игнорирования событий во время уничтожения графика
        
        // Селектор оценки объекта
        this.selectedObjectId = null;
        this.highlightedObjectId = null; // Выделенный объект на графике
        this.evaluationSlimSelect = null;
        this.evaluations = new Map(); // objectId -> evaluation (локальное хранение как в ComparativeAnalysisManager)
        
        this.debugEnabled = true; // Включаем отладку для диагностики
        
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
            averageExposureDays: 90,
            renovationType: 'auto',
            workCost: 10000,
            materialsCost: 10000,
            additionalExpenses: 100000
        };
        
        console.log('📊 Инициализация фильтра отчёта "Доходность флиппинг":', this.currentFilters);
        
        // Данные
        this.segments = [];
        this.subsegments = [];
        this.realEstateObjects = [];
        this.filteredObjects = [];
        this.objectsForEvaluation = []; // Объекты доступные для оценки (архивные)
        this.addresses = []; // Загруженные адреса области
        
        // График коридора рынка
        this.marketCorridorChart = null;
        this.marketCorridorMode = 'sales'; // 'sales' или 'history'
        this.currentPointsData = []; // Данные точек для tooltip
        this.chartCreationInProgress = false; // Флаг защиты от множественного создания
        this.chartUpdateInProgress = false; // Флаг защиты от одновременного обновления
        this.chartBeingDestroyed = false; // Флаг для игнорирования событий во время уничтожения графика
        
        // Селектор оценки объекта
        this.selectedObjectId = null;
        this.highlightedObjectId = null; // Выделенный объект на графике
        this.evaluationSlimSelect = null;
        this.evaluations = new Map(); // objectId -> evaluation (локальное хранение как в ComparativeAnalysisManager)
        
        this.debugEnabled = true; // Включаем отладку для диагностики
    }
    
    /**
     * ✅ ИСПРАВЛЕНО: Настройка подавления ошибок ApexCharts querySelector
     */
    setupApexChartsErrorSuppression() {
        // Перехватываем глобальные ошибки JavaScript
        if (!window.flippingApexChartsErrorHandler) {
            window.flippingApexChartsErrorHandler = window.onerror;
            window.onerror = (message, source, lineno, colno, error) => {
                // Подавляем конкретные ошибки ApexCharts
                if (typeof message === 'string' && 
                    source && source.includes('apexcharts.js') &&
                    (message.includes('querySelector') || 
                     message.includes('Cannot read properties of null'))) {
                    return true; // Предотвращаем дальнейшую обработку ошибки
                }
                
                // Для остальных ошибок вызываем оригинальный обработчик
                if (window.flippingApexChartsErrorHandler) {
                    return window.flippingApexChartsErrorHandler(message, source, lineno, colno, error);
                }
                return false;
            };
        }
        
        // Эталонная цена (продолжение конструктора)
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
        // Проверяем, не был ли уже инициализирован
        if (this.initialized) {
            return;
        }

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
            
            // Устанавливаем флаг успешной инициализации
            this.initialized = true;
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
            console.log('🔍 Начало calculateProfitabilityForObjects:', {
                hasProfitabilityService: !!this.profitabilityService,
                filteredObjectsLength: this.filteredObjects?.length || 0
            });
            
            if (!this.profitabilityService || !this.filteredObjects || this.filteredObjects.length === 0) {
                console.log('❌ Досрочный выход из calculateProfitabilityForObjects: нет данных');
                return;
            }

            // Получаем эталонные цены подсегментов
            const subsegmentPrices = await this.calculateReferencePriceForAllSubsegments();
            
            console.log('🔍 subsegmentPrices:', subsegmentPrices?.length || 0);
            
            if (!subsegmentPrices || subsegmentPrices.length === 0) {
                console.log('❌ Досрочный выход из calculateProfitabilityForObjects: нет subsegmentPrices');
                return;
            }

            // Проверяем какие подсегменты имеют объекты и эталонные цены
            console.log(`🔍 Анализ подсегментов:`);
            subsegmentPrices.forEach(subsegment => {
                const matchingObjects = this.filteredObjects.filter(object => 
                    this.reportsManager.objectMatchesSubsegment(object, subsegment)
                );
                console.log(`  Подсегмент ${subsegment.id}:`, {
                    hasReferencePrice: !!(subsegment.referencePrice?.perMeter),
                    perMeter: subsegment.referencePrice?.perMeter,
                    matchingObjectsCount: matchingObjects.length,
                    objectIds: matchingObjects.map(o => o.id)
                });
            });
            
            // Новая логика: для каждого подсегмента с эталонной ценой находим его объекты
            const validSubsegments = subsegmentPrices.filter(subsegment => 
                subsegment.referencePrice && subsegment.referencePrice.perMeter
            );
            
            console.log(`🔍 Найдено ${validSubsegments.length} подсегментов с эталонными ценами`);
            
            // Обрабатываем каждый подсегмент с эталонной ценой
            for (const subsegment of validSubsegments) {
                console.log(`🔍 Обрабатываем подсегмент ${subsegment.id} с ценой ${subsegment.referencePrice.perMeter} ₽/м²`);
                
                // Находим все объекты, подходящие под этот подсегмент
                const matchingObjects = this.filteredObjects.filter(object => 
                    this.reportsManager.objectMatchesSubsegment(object, subsegment)
                );
                
                console.log(`✅ Найдено ${matchingObjects.length} объектов для подсегмента ${subsegment.id}`);
                
                // Создаём параметры расчёта для данного подсегмента
                const profitabilityParams = this.getCurrentFormData();
                const params = {
                    ...profitabilityParams,
                    referencePricePerMeter: subsegment.referencePrice.perMeter,
                    averageExposureDays: subsegment.averageExposure?.days || 90
                };
                
                // Отладочный вывод параметров
                console.log('🔧 Параметры для FlippingProfitabilityService:', {
                    renovationSpeed: params.renovationSpeed,
                    financing: params.financing,
                    downPayment: params.downPayment,
                    mortgageRate: params.mortgageRate,
                    mortgageTerm: params.mortgageTerm,
                    referencePricePerMeter: params.referencePricePerMeter
                });
                
                // Рассчитываем доходность для каждого объекта этого подсегмента
                for (const object of matchingObjects) {
                    try {
                        console.log(`🔍 Рассчитываем доходность для объекта ${object.id} через новый сервис`);

                    
                    // Валидация критически важных параметров ипотеки
                    if (params.financing === 'mortgage') {
                        if (!params.downPayment || params.downPayment <= 0 || params.downPayment >= 100) {
                            console.error(`❌ Некорректный первоначальный взнос: ${params.downPayment}%`);
                            continue;
                        }
                        if (!params.mortgageRate || params.mortgageRate <= 0) {
                            console.error(`❌ Некорректная ставка ипотеки: ${params.mortgageRate}%`);
                            continue;
                        }
                        if (!params.mortgageTerm || params.mortgageTerm <= 0) {
                            console.error(`❌ Некорректный срок ипотеки: ${params.mortgageTerm} лет`);
                            continue;
                        }
                        
                        if (this.debugEnabled) {
                            console.log(`🏦 Параметры ипотеки для объекта ${object.id}:`, {
                                downPayment: params.downPayment,
                                mortgageRate: params.mortgageRate,
                                mortgageTerm: params.mortgageTerm
                            });
                        }
                    }

                        // Добавляем цену покупки конкретного объекта
                        console.log(`🔍 Отладка purchasePrice для объекта ${object.id}:`, {
                            current_price: object.current_price,
                            price: object.price,
                            area: object.area,
                            area_total: object.area_total,
                            hasArea: !!(object.area || object.area_total)
                        });
                        
                        // Создаем объект с правильной структурой для сервиса
                        const objectForService = {
                            ...object,
                            currentPrice: object.current_price || object.price, // Сервис ожидает currentPrice
                            area: object.area || object.area_total // Сервис ожидает area
                        };
                        
                        console.log(`🔧 Объект для сервиса ${object.id}:`, {
                            currentPrice: objectForService.currentPrice,
                            area: objectForService.area,
                            id: objectForService.id
                        });
                        
                        // Рассчитываем доходность двух сценариев через новый сервис
                        const profitabilityData = this.profitabilityService.calculateBothScenarios(objectForService, params);
                        
                        // Сохраняем результат в объект в формате, ожидаемом таблицей
                        object.flippingProfitability = {
                            annualROI: profitabilityData.currentPrice?.annualROI || 0,
                            netProfit: profitabilityData.currentPrice?.netProfit || 0,
                            roi: profitabilityData.currentPrice?.roi || 0,
                            totalCosts: profitabilityData.currentPrice?.totalCosts || 0,
                            salePrice: profitabilityData.currentPrice?.salePrice || 0,
                            // Сохраняем полные данные для дочерней таблицы (включая financing)
                            fullData: profitabilityData,
                            // Добавляем структуру current/target для совместимости с таблицей
                            current: profitabilityData.currentPrice,
                            target: profitabilityData.targetPrice
                        };
                        
                        console.log(`💾 Сохранены данные для объекта ${object.id} через новый сервис:`, {
                            financing: profitabilityData.currentPrice?.financing,
                            purchasePrice: profitabilityData.currentPrice?.purchasePrice,
                            actualPrice: profitabilityData.currentPrice?.actualPurchasePrice,
                            downPayment: profitabilityData.currentPrice?.financing?.downPayment,
                            interestCosts: profitabilityData.currentPrice?.financing?.interestCosts,
                            isFormatted: params.financing === 'mortgage'
                        });
                        
                        // Для совместимости с картой также сохраняем в profitability
                        object.profitability = {
                            annualReturn: profitabilityData.currentPrice?.annualROI || 0,
                            totalProfit: profitabilityData.currentPrice?.netProfit || 0,
                            roi: profitabilityData.currentPrice?.roi || 0
                        };
                        
                    } catch (error) {
                        console.error(`❌ Ошибка расчёта доходности для объекта ${object.id}:`, error);
                        object.flippingProfitability = null;
                    }
                }
            }

            if (this.debugEnabled) {
                const calculatedCount = this.filteredObjects.filter(obj => obj.flippingProfitability).length;
                console.log(`✅ calculateProfitabilityForObjects: рассчитано ${calculatedCount} из ${this.filteredObjects.length} объектов`);
            }
            
            // Диагностика: проверяем, что объекты имеют flippingProfitability ПОСЛЕ расчёта
            console.log('🔍 После calculateProfitabilityForObjects:', {
                totalObjects: this.filteredObjects.length,
                objectsWithProfitability: this.filteredObjects.filter(obj => obj.flippingProfitability).length,
                firstObjectId: this.filteredObjects[0]?.id,
                firstObjectHasProfitability: !!this.filteredObjects[0]?.flippingProfitability,
                firstObjectProfitabilityData: this.filteredObjects[0]?.flippingProfitability
            });

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
            if (!currentArea) {
                console.log('❌ calculateReferencePriceForAllSubsegments: нет currentArea');
                return [];
            }
            
            // Веса для разных типов ремонта (все качественные)
            const weights = {
                'flipping': 1.0,            // Максимальный вес - прямой эталон стратегии
                'designer_renovation': 0.9, // Высокий вес - премиум сегмент
                'euro_renovation': 0.8      // Хороший вес - стандартный качественный ремонт
            };

            console.log('🔍 calculateReferencePriceForAllSubsegments:', {
                hasReportsManager: !!this.reportsManager,
                hasSegments: !!this.reportsManager?.segments,
                segmentsLength: this.reportsManager?.segments?.length || 0
            });

            // Диагностика структуры сегментов
            if (this.reportsManager?.segments) {
                this.reportsManager.segments.forEach((segment, index) => {
                    console.log(`🔍 Сегмент ${index}:`, {
                        id: segment.id,
                        name: segment.name,
                        hasSubsegments: !!segment.subsegments,
                        subsegmentsLength: segment.subsegments?.length || 0
                    });
                });
            }

            // Загружаем подсегменты для всех сегментов из БД
            let subsegments = [];
            if (this.reportsManager?.segments) {
                for (const segment of this.reportsManager.segments) {
                    try {
                        const segmentSubsegments = await this.database.getSubsegmentsBySegment(segment.id);
                        const subsegmentsWithSegmentId = segmentSubsegments.map(subsegment => ({
                            ...subsegment,
                            segment_id: segment.id
                        }));
                        subsegments.push(...subsegmentsWithSegmentId);
                        
                        if (this.debugEnabled) {
                            console.log(`🔍 Загружено ${segmentSubsegments.length} подсегментов для сегмента ${segment.name}`);
                        }
                    } catch (error) {
                        console.error(`❌ Ошибка загрузки подсегментов для сегмента ${segment.id}:`, error);
                    }
                }
            }
            
            console.log('🔍 Found subsegments:', subsegments.length);

            const results = [];
            for (const subsegment of subsegments) {
                const referencePriceData = await this.calculateSubsegmentReferencePrice(subsegment, weights, 'Автоматическое определение');
                const referencePrice = referencePriceData?.referencePrice;
                const averageExposure = await this.calculateSubsegmentExposure(subsegment.id);
                
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
                
                // Только пересчёт доходности без полной перерисовки
                this.applyCalculationFilters();
            });
        }

        // Фиксированная оплата
        const fixedPaymentInput = document.getElementById('flippingFixedPaymentAmount');
        if (fixedPaymentInput) {
            fixedPaymentInput.addEventListener('input', (e) => {
                this.currentFilters.fixedPaymentAmount = parseInt(e.target.value) || 250000;
                this.applyCalculationFilters();
            });
        }

        // Процент флиппера с остатка
        const fixedPlusPercentageInput = document.getElementById('flippingFixedPlusPercentage');
        if (fixedPlusPercentageInput) {
            fixedPlusPercentageInput.addEventListener('input', (e) => {
                this.currentFilters.fixedPlusPercentage = parseInt(e.target.value) || 30;
                this.applyCalculationFilters();
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


        // Переключатель режима графика коридора рынка (SlimSelect)
        const modeSelect = document.getElementById('flippingMarketCorridorMode');
        if (modeSelect) {
            this.marketCorridorModeSlimSelect = new SlimSelect({
                select: modeSelect,
                settings: {
                    showSearch: false,
                    placeholderText: 'Выберите режим'
                }
            });
            
            modeSelect.addEventListener('change', async (e) => {
                this.marketCorridorMode = e.target.value;
                // При смене режима ОБЯЗАТЕЛЬНО пересоздаем график полностью
                await this.createMarketCorridorChart();
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
                this.applyFilters(); // Для диапазона цен нужна полная перефильтрация объектов
            });
        }
        
        if (priceToInput) {
            priceToInput.addEventListener('input', (e) => {
                this.currentFilters.priceTo = parseInt(e.target.value) || 10000000000;
                this.applyFilters(); // Для диапазона цен нужна полная перефильтрация объектов
            });
        }

        // Целевая доходность
        const profitabilityPercentInput = document.getElementById('flippingProfitabilityPercent');
        if (profitabilityPercentInput) {
            profitabilityPercentInput.addEventListener('input', (e) => {
                this.currentFilters.profitabilityPercent = parseInt(e.target.value) || 60;
                this.applyCalculationFilters();
            });
        }

        // Остальные поля ввода - используем change вместо input для окончания ввода
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
                // Используем change для срабатывания после окончания ввода
                input.addEventListener('change', (e) => {
                    const newValue = parseFloat(e.target.value) || 0;
                    this.currentFilters[filterKey] = newValue;
                    
                    if (this.debugEnabled) {
                        console.log(`🔧 Параметр ${filterKey} изменён на ${newValue}`);
                    }
                    
                    // Только пересчёт доходности без полной перерисовки
                    this.applyCalculationFilters();
                });
                // Также обновляем значение при потере фокуса
                input.addEventListener('blur', (e) => {
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
            
            // Также обновляем объект в памяти (в this.filteredObjects)
            const filteredObject = this.filteredObjects?.find(obj => obj.id === objectId);
            if (filteredObject) {
                filteredObject.user_evaluation = evaluation;
                filteredObject.evaluation_date = object.evaluation_date;
            }
            
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
     * Загрузка всех пользовательских оценок из базы данных
     */
    async loadAllEvaluations() {
        try {
            if (!this.filteredObjects || this.filteredObjects.length === 0) {
                return;
            }

            // Загружаем оценки для всех отфильтрованных объектов
            for (const obj of this.filteredObjects) {
                if (obj.user_evaluation) {
                    this.evaluations.set(obj.id, obj.user_evaluation);
                }
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки оценок:', error);
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
                this.referencePrice = this.referencePrices[0]?.referencePrice || { perMeter: null, total: null, area: null, count: 0 };
            } else if (currentSegment) {
                
                // Случай 2: Выбран сегмент - расчёт по всем подсегментам сегмента отдельно
                const subsegments = await this.database.getSubsegmentsBySegment(currentSegment.id);
                
                this.referencePrices = [];
                for (const subsegment of subsegments) {
                    const price = await this.calculateSubsegmentReferencePrice(subsegment, weights, currentSegment.name);
                    if (price && price.referencePrice && price.referencePrice.count > 0) {
                        this.referencePrices.push(price);
                    }
                }
                // Используем первую доступную цену как основную (или null если нет данных)
                this.referencePrice = this.referencePrices[0]?.referencePrice || { perMeter: null, total: null, area: null, count: 0 };
            } else {
                if (this.debugEnabled) {
                    
                    
                }
                // Случай 3: Фильтр пуст - перебор всех сегментов и их подсегментов
                this.referencePrices = [];
                const allSegments = await this.database.getSegments();
                for (const segment of allSegments) {
                    const subsegments = await this.database.getSubsegmentsBySegment(segment.id);
                    for (const subsegment of subsegments) {
                        const price = await this.calculateSubsegmentReferencePrice(subsegment, weights, segment.name);
                        if (price && price.referencePrice && price.referencePrice.count > 0) {
                            this.referencePrices.push(price);
                        }
                    }
                }
                // Используем первую доступную цену как основную (или null если нет данных)
                this.referencePrice = this.referencePrices[0]?.referencePrice || { perMeter: null, total: null, area: null, count: 0 };
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
            // Сначала фильтруем объекты по сегменту через адреса
            let segmentObjects = this.filteredObjects;
            
            if (subsegment.segment_id) {
                // Получаем сегмент
                const segment = await this.database.getSegment(subsegment.segment_id);
                if (!segment) {
                    return {
                        id: subsegment.id,
                        name: subsegment.name,
                        segment: segmentName,
                        referencePrice: {
                            perMeter: null,
                            total: null,
                            area: null,
                            count: 0,
                            evaluatedCount: 0
                        },
                        exposure: { days: null, count: 0 },
                        objects: [],
                        evaluatedObjects: []
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
                return matches;
            });
            
            if (this.debugEnabled) {
                
            }

            // Отладка: проверяем что происходит с фильтрацией
            console.log(`📊 Подсегмент ${subsegment.id}: фильтрация объектов для эталонной цены:`, {
                totalSubsegmentObjects: subsegmentObjects.length,
                archiveObjects: subsegmentObjects.filter(obj => obj.status === 'archive').length,
                evaluatedObjects: subsegmentObjects.filter(obj => this.evaluations.has(obj.id)).length,
                archiveAndEvaluated: subsegmentObjects.filter(obj => 
                    obj.status === 'archive' && this.evaluations.has(obj.id)
                ).length,
                evaluationsMapSize: this.evaluations.size,
                weightsAvailable: !!weights
            });
            
            // Проверяем детально каждый архивный объект
            const archiveWithEvaluations = subsegmentObjects.filter(obj => 
                obj.status === 'archive' && this.evaluations.has(obj.id)
            );
            
            archiveWithEvaluations.forEach(obj => {
                const evaluation = this.evaluations.get(obj.id);
                console.log(`  Объект ${obj.id}:`, {
                    evaluation,
                    weight: weights[evaluation],
                    weightPositive: weights[evaluation] > 0,
                    hasPrice: obj.current_price > 0,
                    hasArea: obj.area_total > 0
                });
            });
            
            // Фильтруем только оценённые ПРОДАННЫЕ объекты с качественным ремонтом
            const evaluatedObjects = subsegmentObjects.filter(obj => 
                obj.status === 'archive' && // Только проданные
                this.evaluations.has(obj.id) && 
                weights[this.evaluations.get(obj.id)] > 0 &&
                obj.current_price > 0 &&
                obj.area_total > 0
            );
            
            console.log(`📊 После фильтрации осталось ${evaluatedObjects.length} объектов для расчёта эталонной цены`);


            if (evaluatedObjects.length === 0) {
                return {
                    id: subsegment.id,
                    name: subsegment.name,
                    segment: segmentName,
                    referencePrice: {
                        perMeter: null,
                        total: null,
                        area: null,
                        count: 0,
                        evaluatedCount: 0
                    },
                    exposure: { days: null, count: 0 },
                    objects: subsegmentObjects,
                    evaluatedObjects: []
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

            // Рассчитываем срок экспозиции для подсегмента
            const exposure = await this.calculateSubsegmentExposure(subsegment.id);

            return {
                id: subsegment.id,
                name: subsegment.name,
                segment: segmentName,
                referencePrice: {
                    perMeter: Math.round(referencePricePerMeter),
                    total: Math.round(referencePricePerMeter * averageArea),
                    area: Math.round(averageArea),
                    count: subsegmentObjects.length, // Общее количество объектов подсегмента
                    evaluatedCount: evaluatedObjects.length // Количество оцененных объектов
                },
                exposure: exposure || { days: null, count: 0 },
                objects: subsegmentObjects,
                evaluatedObjects: evaluatedObjects
            };

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка расчёта эталонной цены для подсегмента:', subsegment.name, error);
            return {
                id: subsegment.id,
                name: subsegment.name,
                segment: segmentName,
                referencePrice: {
                    perMeter: null,
                    total: null,
                    area: null,
                    count: 0,
                    evaluatedCount: 0
                },
                exposure: { days: null, count: 0 },
                objects: [],
                evaluatedObjects: []
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
            const currentSegment = this.reportsManager?.currentSegment;
            
            let subsegments = [];
            
            if (currentSegment) {
                // Если выбран сегмент, получаем его подсегменты
                subsegments = await this.database.getSubsegmentsBySegment(currentSegment.id);
            } else {
                // Если сегмент не выбран, получаем ВСЕ подсегменты
                const allSegments = await this.database.getSegments();
                for (const segment of allSegments) {
                    const segmentSubsegments = await this.database.getSubsegmentsBySegment(segment.id);
                    // Добавляем информацию о сегменте к каждому подсегменту
                    segmentSubsegments.forEach(subsegment => {
                        subsegment.segmentName = segment.name;
                    });
                    subsegments = subsegments.concat(segmentSubsegments);
                }
            }
            
            if (!subsegments || subsegments.length === 0) {
                this.referencePrices = [];
                return;
            }
            
            // Создаём базовые карточки для каждого подсегмента
            this.referencePrices = subsegments.map(subsegment => ({
                id: subsegment.id,
                name: subsegment.name,
                segment: subsegment.segmentName || currentSegment?.name || 'Все сегменты',
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
        
        const cardsContainer = document.getElementById('referencePriceCardsContainer');
        
        if (!cardsContainer) {
            return;
        }
        
        if (this.referencePrices.length > 0) {
            // Показываем контейнер с карточками
            cardsContainer.classList.remove('hidden');
            
            // Очищаем существующие карточки
            cardsContainer.innerHTML = '';
            
            // Пересчитываем счетчики для отфильтрованных объектов
            const updatedPrices = this.recalculateSubsegmentCounts(this.referencePrices);
            
            // Создаём карточку для каждого подсегмента (асинхронно)
            for (let index = 0; index < updatedPrices.length; index++) {
                const price = updatedPrices[index];
                const card = await this.createSubsegmentCard(price, index);
                cardsContainer.appendChild(card);
            }
            
        } else {
            // Скрываем контейнер если нет данных
            cardsContainer.classList.add('hidden');
        }
    }

    /**
     * Пересчёт счетчиков объектов для подсегментов на основе отфильтрованных данных
     */
    recalculateSubsegmentCounts(referencePrices) {
        if (!this.filteredObjects || this.filteredObjects.length === 0) {
            // Если нет отфильтрованных объектов, показываем нули
            return referencePrices.map(price => ({
                ...price,
                referencePrice: {
                    ...price.referencePrice,
                    count: 0,
                    evaluatedCount: 0
                }
            }));
        }

        return referencePrices.map(priceData => {
            // Фильтруем объекты для этого подсегмента из отфильтрованного набора
            // Теперь используется единая система фильтрации через property_type
            const subsegmentFilteredObjects = this.filteredObjects.filter(obj => {
                // Проверяем соответствие фильтрам подсегмента
                if (priceData.filters) {
                    const subsegment = { id: priceData.id, name: priceData.name, filters: priceData.filters };
                    return this.reportsManager.objectMatchesSubsegment(obj, subsegment);
                }
                return false;
            });

            // Считаем сколько из них имеют оценки доходности
            const evaluatedFilteredObjects = subsegmentFilteredObjects.filter(obj => 
                obj.profitability && typeof obj.profitability.annualReturn === 'number'
            );

            return {
                ...priceData,
                referencePrice: {
                    ...priceData.referencePrice,
                    count: subsegmentFilteredObjects.length,
                    evaluatedCount: evaluatedFilteredObjects.length
                }
            };
        });
    }

    /**
     * Создание карточки подсегмента с эталонной ценой
     */
    async createSubsegmentCard(priceData, colorIndex = 0) {
        const colors = this.getSubsegmentColorScheme(colorIndex);
        const card = document.createElement('div');
        card.className = `p-2 ${colors.bgColor} rounded-lg text-xs leading-[1.3] ${colors.textColor} border-2 border-gray-200 cursor-pointer transition-all duration-150 hover:!border-blue-500 hover:shadow-[0_2px_8px_rgba(59,130,246,0.1)]`;
        
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
                        <div class="font-medium mb-1">Медиана экспозиции:</div>
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
        card.dataset.subsegmentId = priceData.id;
        
        // Обработчик клика для фильтрации по подсегменту
        card.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handleSubsegmentCardClick(priceData.id);
        });
        
        // Hover эффекты теперь полностью через Tailwind классы
        
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
                
                // ✅ ИСПРАВЛЕНО: возвращаем true только если объект принадлежит И сегменту И подсегменту
                const finalMatch = belongsToSegment && matchesSubsegment;
                
                return finalMatch;
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
            
            // ИСПРАВЛЕНИЕ: Сбрасываем выделение объекта при снятии фильтра подсегмента
            // чтобы график корректно обновился
            if (this.selectedObjectId) {
                // Убираем выделение с карточки объекта
                const selectedBlock = this.objectsGrid?.querySelector(`[data-object-id="${this.selectedObjectId}"]`);
                if (selectedBlock) {
                    selectedBlock.classList.remove('!bg-blue-50', '!border-blue-500');
                    selectedBlock.classList.add('bg-white', 'border-gray-200');
                }
                this.selectedObjectId = null;
            }
            
            // Сбрасываем выделение на графике
            this.highlightedObjectId = null;
            
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
            
            await this.updateObjectsForEvaluation();
            
            // ИСПРАВЛЕНИЕ: Обновляем карту при смене подсегмента
            await this.updateMapDisplay('смена подсегмента');
            
            // Обновляем FlippingController (таблица объектов)
            if (this.flippingController) {
                
                
                // Загружаем адреса для объектов и рассчитываем доходность
                const objectsWithAddresses = await this.loadAddressesForObjects(this.filteredObjects);
                
                // Устанавливаем отфильтрованные объекты в контроллер
                this.flippingController.filteredObjects = objectsWithAddresses;
                await this.flippingController.updateUIComponents();
                
                // Пересчитываем доходность для отфильтрованных объектов
                await this.updateInvestmentTable();
            } else {
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
                    } catch (error) {
                        objWithAddress.address = null;
                    }
                }
                
                // Рассчитываем доходность для объекта (оба сценария)
                if (this.profitabilityService && objWithAddress.price && objWithAddress.area) {
                    try {
                        const profitabilityParams = this.getCurrentFormData();
                        
                        // Сценарий 1: при текущей цене
                        const currentPriceResult = this.profitabilityService.calculateFlippingProfitability(objWithAddress, profitabilityParams);
                        
                        // Сценарий 2: целевая цена для заданной доходности
                        const targetPrice = this.profitabilityService.calculateTargetPrice(objWithAddress, profitabilityParams.profitabilityPercent, profitabilityParams);
                        const targetObject = { ...objWithAddress, current_price: targetPrice };
                        const targetPriceResult = this.profitabilityService.calculateFlippingProfitability(targetObject, profitabilityParams);
                        
                        // Сохраняем оба сценария
                        objWithAddress.flippingProfitability = {
                            current: currentPriceResult,
                            target: {
                                ...targetPriceResult,
                                targetPrice: targetPrice,
                                discount: Math.round(((objWithAddress.current_price - targetPrice) / objWithAddress.current_price) * 100)
                            }
                        };
                        
                        // Для обратной совместимости сохраняем текущий сценарий
                        objWithAddress.profitability = currentPriceResult;
                        
                        console.log(`💰 Объект ${obj.id}: текущая ${currentPriceResult.annualROI?.toFixed(1)}%, целевая ${targetPriceResult.annualROI?.toFixed(1)}% при цене ${targetPrice?.toLocaleString()} ₽`);
                    } catch (error) {
                        console.error('❌ Ошибка расчёта доходности для объекта:', error);
                    }
                }
                
                objectsWithAddresses.push(objWithAddress);
            }
            
            return objectsWithAddresses;
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки адресов:', error);
            return objects; // Возвращаем исходные объекты в случае ошибки
        }
    }

    /**
     * Обновление блока объектов для оценки
     */
    async updateObjectsForEvaluation() {
        try {
            if (this.debugEnabled) {
            }
            
            if (!this.objectsGrid || !this.filteredObjects) return;
            
            // Показываем все объекты для оценки (активные и архивные)
            const objects = this.filteredObjects.filter(obj => 
                obj.status === 'archive' // Только проданные объекты для эталонной цены
            );
            
            // Сохраняем объекты для оценки (ИСПРАВЛЕНИЕ: добавлено отсутствующее присвоение)
            this.objectsForEvaluation = objects;
            
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
                    <div class="flipping-object-block p-2 bg-white rounded-lg text-xs leading-[1.3] border-2 border-gray-200 cursor-pointer transition-all duration-150 hover:!border-blue-500 hover:shadow-[0_2px_8px_rgba(59,130,246,0.1)]" data-object-id="${obj.id}">
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
                    selectedBlock.classList.remove('bg-white', 'border-gray-200');
                    selectedBlock.classList.add('!bg-blue-50', '!border-blue-500');
                    if (this.debugEnabled) {
                        
                    }
                } else if (this.debugEnabled) {
                    this.selectedObjectId = null; // Сбрасываем, если объект исчез из списка
                }
            }
            
            // Карта обновляется в applyFiltersMode, здесь дублирующий вызов убран
            // (обновление карты происходит в основном потоке инициализации)
            
            if (this.debugEnabled) {
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка в updateObjectsForEvaluation:', error);
        }
    }

    /**
     * Выбор объекта для оценки
     */
    async selectObject(objectId, disableScroll = false) {
        try {
            // Если кликнули по уже выбранному объекту, снимаем выделение
            if (this.selectedObjectId === objectId) {
                // Убираем выделение с карточки
                const prevSelected = this.objectsGrid.querySelector(`[data-object-id="${objectId}"]`);
                if (prevSelected) {
                    prevSelected.classList.remove('!bg-blue-50', '!border-blue-500');
                    prevSelected.classList.add('bg-white', 'border-gray-200');
                }
                
                // Сбрасываем выбранный объект и убираем выделение с графика
                this.selectedObjectId = null;
                await this.updateObjectHighlightOnChart(null);
                
                return;
            }

            // Убираем выделение с предыдущего объекта
            if (this.selectedObjectId) {
                const prevSelected = this.objectsGrid.querySelector(`[data-object-id="${this.selectedObjectId}"]`);
                if (prevSelected) {
                    prevSelected.classList.remove('!bg-blue-50', '!border-blue-500');
                    prevSelected.classList.add('bg-white', 'border-gray-200');
                }
            }
            
            // Устанавливаем новый выбранный объект
            this.selectedObjectId = objectId;
            
            // Добавляем выделение новому объекту
            const selectedBlock = this.objectsGrid.querySelector(`[data-object-id="${objectId}"]`);
            if (selectedBlock) {
                selectedBlock.classList.remove('bg-white', 'border-gray-200');
                selectedBlock.classList.add('!bg-blue-50', '!border-blue-500');
                
                // Автоматически прокручиваем к выделенной карточке (если не отключено)  
                if (!disableScroll) {
                    // Прокручиваем только внутри ближайшего скроллируемого контейнера
                    selectedBlock.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest', // nearest вместо center чтобы не прокручивать всю страницу
                        inline: 'nearest'
                    });
                } else {
                }
            } else {
            }
            
            // Выделяем объект на графике
            await this.updateObjectHighlightOnChart(objectId);
            
            // Загружаем текущую оценку объекта в селектор
            await this.loadObjectEvaluation(objectId);
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка выбора объекта:', error);
        }
    }

    /**
     * Обновление выделения объекта на графике
     * @param {string|null} objectId - ID объекта для выделения или null для снятия выделения
     */
    async updateObjectHighlightOnChart(objectId) {
        try {
            if (!this.marketCorridorChart) {
                return;
            }

            // Проверяем, изменилось ли выделение
            if (this.highlightedObjectId === objectId) {
                return; // Ничего не изменилось
            }

            // Запоминаем, было ли выделение до изменения
            const wasHighlighted = !!this.highlightedObjectId;
            
            // Сохраняем выделенный объект
            this.highlightedObjectId = objectId;
            
            // Используем тот же метод, который вызывается при клике на подсегмент
            await this.updateMarketCorridorChart();

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка выделения объекта на графике:', error);
        }
    }

    /**
     * Получение опций маркеров с учетом выделенного объекта
     */
    getMarkerOptions() {
        const baseOptions = {
            size: 4,
            opacity: 0.9,
            strokeColor: "#fff",
            strokeWidth: 2,
            style: 'inverted',
            hover: {
                size: 15
            },
            discrete: []
        };

        // ✅ ИСПРАВЛЕНО: Если есть выделенный объект, добавляем его в discrete
        if (this.highlightedObjectId) {
            if (this.marketCorridorMode === 'history') {
                // ИСПРАВЛЕНИЕ: В режиме истории используем currentSeriesDataMapping, который теперь заполнен
                if (this.currentSeriesDataMapping && this.marketCorridorChart?.w?.config?.series) {
                    // Проходим по всем сериям и их маппингам
                    for (let seriesIndex = 0; seriesIndex < this.currentSeriesDataMapping.length; seriesIndex++) {
                        const seriesMapping = this.currentSeriesDataMapping[seriesIndex];
                        if (seriesMapping && Array.isArray(seriesMapping)) {
                            // Ищем объект в маппинге этой серии
                            seriesMapping.forEach((point, dataPointIndex) => {
                                if (point && point.objectId === this.highlightedObjectId) {
                                    baseOptions.discrete.push({
                                        seriesIndex: seriesIndex,
                                        dataPointIndex: dataPointIndex,
                                        fillColor: '#ef4444',
                                        strokeColor: '#fff',
                                        size: 12,
                                        strokeWidth: 3
                                    });
                                    
                                    const seriesName = this.marketCorridorChart.w.config.series[seriesIndex]?.name || 'Unknown';
                                }
                            });
                        }
                    }
                }
            } else if (this.currentSeriesDataMapping) {
                // Режим коридора - используем seriesDataMapping как раньше
                for (let sIdx = 0; sIdx < this.currentSeriesDataMapping.length; sIdx++) {
                    const seriesMap = this.currentSeriesDataMapping[sIdx];
                    if (seriesMap) {
                        for (let dIdx = 0; dIdx < seriesMap.length; dIdx++) {
                            if (seriesMap[dIdx] && seriesMap[dIdx].objectId === this.highlightedObjectId) {
                                baseOptions.discrete.push({
                                    seriesIndex: sIdx,
                                    dataPointIndex: dIdx,
                                    fillColor: '#ef4444',
                                    strokeColor: '#fff',
                                    size: 12,
                                    strokeWidth: 3
                                });
                                
                                break;
                            }
                        }
                    }
                }
            }
            
            if (baseOptions.discrete.length === 0) {
                console.warn('📊 Выделенный объект не найден:', this.highlightedObjectId);
            }
        }

        return baseOptions;
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
                // Активное состояние - унифицированный стиль с карточками объектов
                card.classList.remove(colors.bgColor, 'border-gray-200');
                card.classList.add('!bg-blue-50', '!border-blue-500');
            } else {
                // Обычное состояние - серый бордер как у карточек объектов
                card.classList.remove('!bg-blue-50', '!border-blue-500');
                card.classList.add(colors.bgColor, 'border-gray-200');
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
                return null;
            }

            // ВАЖНО: Сначала фильтруем объекты по сегменту через адреса
            let segmentObjects = this.filteredObjects;
            
            if (subsegment.segment_id) {
                // Получаем сегмент
                const segment = await this.database.getSegment(subsegment.segment_id);
                if (!segment) {
                    return null;
                }
                
                // Получаем все адреса в области сегмента
                const addresses = await this.database.getAddressesInMapArea(segment.map_area_id);
                
                // Фильтруем адреса по критериям сегмента (если есть)
                let filteredAddresses = addresses;
                if (segment.filters) {
                    filteredAddresses = this.reportsManager.filterAddressesBySegmentCriteria(addresses, segment.filters);
                }
                
                // Создаём Set из ID отфильтрованных адресов для быстрой проверки
                const filteredAddressIds = new Set(filteredAddresses.map(a => a.id));
                
                // Фильтруем объекты: оставляем только те, которые относятся к адресам сегмента
                segmentObjects = this.filteredObjects.filter(obj => 
                    obj.address_id && filteredAddressIds.has(obj.address_id)
                );
                
            }

            // Теперь фильтруем объекты сегмента по критериям подсегмента
            const subsegmentObjects = segmentObjects.filter(obj => {
                return this.reportsManager.objectMatchesSubsegment(obj, subsegment);
            });

            // Фильтруем только оценённые проданные объекты
            const evaluatedObjects = subsegmentObjects.filter(obj => 
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
            });

            exposureDays.sort((a, b) => a - b);
            
            const median = exposureDays.length % 2 === 0 
                ? Math.round((exposureDays[exposureDays.length / 2 - 1] + exposureDays[exposureDays.length / 2]) / 2)
                : exposureDays[Math.floor(exposureDays.length / 2)];
                
            const average = Math.round(exposureDays.reduce((sum, days) => sum + days, 0) / exposureDays.length);
            const min = Math.min(...exposureDays);
            const max = Math.max(...exposureDays);

            return {
                days: median, // Используем медиану как основное значение для финансовой модели
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
        
        // Применяем только фильтрацию объектов (без пересчёта эталонных цен и графика)
        this.applyFilteringOnly();
        
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
    async updateInvestmentTable() {
        try {
            console.log('📊 updateInvestmentTable вызван:', {
                filteredObjectsCount: this.filteredObjects?.length || 0,
                hasFlippingController: !!this.flippingController,
                hasFlippingTable: !!this.flippingController?.flippingTable,
                firstObjectHasProfitability: !!this.filteredObjects?.[0]?.flippingProfitability,
                firstObjectId: this.filteredObjects?.[0]?.id,
                objectsWithProfitability: this.filteredObjects?.filter(obj => obj.flippingProfitability).length || 0
            });
            
            // Этот метод обновляет таблицу объектов для оценки
            // Функциональность интегрирована с новой архитектурой v0.1
            // Обновление происходит через FlippingController
            if (this.flippingController && this.filteredObjects) {
                this.flippingController.filteredObjects = this.filteredObjects;
                
                // Обновляем таблицу через FlippingController
                if (this.flippingController.flippingTable) {
                    console.log('🔍 Перед updateData в updateInvestmentTable:', {
                        firstObjectId: this.filteredObjects[0]?.id,
                        firstObjectHasProfitability: !!this.filteredObjects[0]?.flippingProfitability,
                        objectsWithProfitability: this.filteredObjects.filter(obj => obj.flippingProfitability).length
                    });
                    
                    await this.flippingController.flippingTable.updateData(this.filteredObjects, this.currentFilters);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка обновления таблицы инвестирования:', error);
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
        
        // Только пересчёт доходности без полной перерисовки
        this.applyCalculationFilters();
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
        
        // Только пересчёт доходности без полной перерисовки
        this.applyCalculationFilters();
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
        
        // Только пересчёт доходности без полной перерисовки
        this.applyCalculationFilters();
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
        
        // Только пересчёт доходности без полной перерисовки
        this.applyCalculationFilters();
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
        
        // Только пересчёт доходности без полной перерисовки
        this.applyCalculationFilters();
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
            // Показываем все объекты (активные и архивные) для анализа доходности флиппинга
            
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

            // Фильтр по количеству комнат (через property_type для совместимости с подсегментами)
            if (this.currentFilters.rooms.length > 0) {
                // Преобразуем значения фильтра в формат property_type
                const roomsAsPropertyType = this.currentFilters.rooms.map(room => {
                    if (room === 'studio') return 'studio';
                    if (room === '4+') return '4k+';
                    return room + 'k'; // '1' -> '1k', '2' -> '2k', etc.
                });
                
                // Получаем property_type объекта, с fallback на rooms если нет property_type
                let objPropertyType = obj.property_type;
                if (!objPropertyType && obj.rooms !== undefined) {
                    // Преобразуем rooms в property_type формат
                    const roomsValue = obj.rooms.toString();
                    if (roomsValue === '0' || roomsValue === 'studio') {
                        objPropertyType = 'studio';
                    } else if (parseInt(roomsValue) >= 4) {
                        objPropertyType = '4k+';
                    } else {
                        // Для 1, 2, 3 комнат добавляем 'k'
                        objPropertyType = roomsValue + 'k';
                    }
                }
                
                const roomsMatch = roomsAsPropertyType.includes(objPropertyType);
                if (!roomsMatch) return false;
            }

            return true;
        });

        if (this.debugEnabled) {
        }

        return filtered;
    }

    /**
     * Применение только фильтрации объектов (без пересчёта эталонных цен и графика)
     */
    async applyFilteringOnly() {
        try {
            console.log('📊 Фильтрация объектов (лёгкий режим):', this.currentFilters);
            
            // Получаем объекты из базы через ReportsManager
            const objects = await this.loadData();
            
            if (objects.length === 0) {
                await this.showEmptyContent();
                return;
            }
            
            // Применяем собственные фильтры (комнаты, цена)
            this.filteredObjects = this.filterObjects(objects);
            
            if (this.filteredObjects.length === 0) {
                await this.showEmptyContent();
                return;
            }
            
            // Показываем контент
            this.showContent();
            
            // Рассчитываем доходность для отфильтрованных объектов
            await this.calculateProfitabilityForObjects();
            
            // Загружаем адреса
            await this.loadAddresses();
            
            // Обновляем карту с новым набором объектов
            await this.updateMapDisplay('фильтрация объектов');
            
            // Обновляем панель объектов (без обновления таблицы)
            await this.updateObjectsDisplay();
            
            // Обновляем таблицу объектов ПОСЛЕ расчёта доходности
            await this.updateInvestmentTable();
            
            // Обновляем график с отфильтрованными данными
            await this.createMarketCorridorChart();
            
            // Обновляем панель подсегментов с отфильтрованными данными
            if (this.referencePrices && this.referencePrices.length > 0) {
                await this.updateReferencePricePanel();
            }
            
        } catch (error) {
            console.error('❌ Ошибка лёгкой фильтрации:', error);
        }
    }

    /**
     * Применение только фильтров расчёта (без перезагрузки объектов)
     */
    async applyCalculationFilters() {
        try {
            // Если объекты ещё не загружены, делаем полное обновление
            if (!this.filteredObjects || this.filteredObjects.length === 0) {
                this.applyFilters();
                return;
            }
            
            console.log('📊 Обновление расчётов без перезагрузки:', this.currentFilters);
            
            // Пересчитываем доходность с новыми параметрами
            await this.calculateProfitabilityForObjects();
            
            // Обновляем карту с новыми расчётами
            await this.updateMapDisplay('обновление расчётов');
            
            // Обновляем таблицу объектов
            await this.updateInvestmentTable();
            
        } catch (error) {
            console.error('❌ Ошибка обновления расчётов:', error);
        }
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
        
        console.log('📊 Обновление фильтра отчёта "Доходность флиппинг":', this.currentFilters);
        
        this.applyFiltersInProgress = true;
        
        // Отменяем любые отложенные вызовы applyFilters, так как мы уже выполняемся
        if (this.applyFiltersTimeout) {
            clearTimeout(this.applyFiltersTimeout);
            this.applyFiltersTimeout = null;
        }
        
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
                // Показываем все объекты (активные и архивные) для анализа доходности флиппинга
                this.filteredObjects = filteredObjects;
                this.showContent();
                
                // Загружаем адреса для корректного отображения
                await this.loadAddresses();
                
                // Загружаем пользовательские оценки объектов СНАЧАЛА
                await this.loadAllEvaluations();
                
                // Рассчитываем референсные цены для подсегментов (теперь с оценками)
                await this.calculateReferencePrice(true);
                
                // Рассчитываем доходность для всех объектов (теперь с эталонными ценами)
                await this.calculateProfitabilityForObjects();
                
                // Карта управляется FlippingController через FlippingMap
                // Убираем дублирующую инициализацию
                
                // Загружаем данные на карту (только один раз)
                if (!this.mapDisplayUpdated) {
                    this.mapDisplayUpdated = true;
                    await this.updateMapDisplay('инициализация');
                }
                
                // Создаём график коридора рынка
                await this.createMarketCorridorChart();
                
                // НЕ синхронизируем объекты с FlippingController здесь, так как это перезапишет
                // наши объекты с рассчитанной доходностью объектами БЕЗ доходности
                // Старый код синхронизации удалён для исправления проблемы
                
                // Обновляем панель объектов (без обновления таблицы)
                await this.updateObjectsDisplay();
                
                // Принудительно обновляем панель подсегментов (на случай если отчёт был скрыт/показан)
                if (this.referencePrices && this.referencePrices.length > 0) {
                    await this.updateReferencePricePanel();
                }
                
                // Обновляем таблицу инвестирования ПОСЛЕ расчёта доходности
                await this.updateInvestmentTable();
                
            } else {
                // Показываем пустой контент вместо заглушки
                await this.showEmptyContent();
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
                await this.showEmptyContent();
                return;
            }

            // Показываем результат
            this.showContent();
            
            // Загружаем адреса для корректного отображения
            await this.loadAddresses();
            
            // Загружаем пользовательские оценки объектов СНАЧАЛА
            await this.loadAllEvaluations();
            
            // Рассчитываем референсные цены для подсегментов (теперь с оценками)
            await this.calculateReferencePrice(true);
            
            // Рассчитываем доходность для всех объектов (теперь с эталонными ценами)
            await this.calculateProfitabilityForObjects();
            
            // Карта управляется FlippingController через FlippingMap
            // Убираем дублирующую инициализацию
            
            // Legacy метод loadMapData удален - карта обновляется выше в новом режиме
            
            // Создаём график коридора рынка
            await this.createMarketCorridorChart();
            
            // НЕ синхронизируем объекты с FlippingController здесь, так как это перезапишет
            // наши объекты с рассчитанной доходностью объектами БЕЗ доходности
            // Старый код синхронизации удалён для исправления проблемы

            // Обновляем панель объектов (без обновления таблицы)
            await this.updateObjectsDisplay();
            
            // Принудительно обновляем панель подсегментов (на случай если отчёт был скрыт/показан)
            if (this.referencePrices && this.referencePrices.length > 0) {
                await this.updateReferencePricePanel();
            }
            
            // Обновляем таблицу объектов для инвестирования
            await this.updateInvestmentTable();
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Показ пустого контента (интерфейс активен, но нет данных)
     */
    async showEmptyContent() {
        // Показываем основной контент
        this.showContent();
        
        // Очищаем таблицу объектов
        if (this.objectsGrid) {
            this.objectsGrid.innerHTML = '<div class="text-center text-gray-500 py-8 text-sm">Нет объектов, соответствующих заданным фильтрам</div>';
        }
        
        // Очищаем карту от маркеров, но оставляем полигон области
        if (this.flippingController && this.flippingController.flippingMap) {
            this.flippingController.flippingMap.clearMarkers();
            // Показываем полигон области
            this.displayAreaPolygon();
        }
        
        // Очищаем таблицу инвестирования
        await this.updateInvestmentTable();
        
        // Очищаем график (создаем пустой график)
        this.createMarketCorridorChart();
        
        // Показываем панель подсегментов (если есть эталонные цены)
        if (this.referencePrices && this.referencePrices.length > 0) {
            this.updateReferencePricePanel();
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
        // ✅ ИСПРАВЛЕНО: Сбрасываем флаг уничтожения при показе отчёта
        this.isDestroyed = false;
        
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
            
            // Обновляем график после задержки для готовности DOM
            setTimeout(async () => {
                await this.forceUpdateChart();
            }, 500);
            
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
     * Загрузка адресов в текущей области (скопировано из ComparativeAnalysisManager)
     */
    async loadAddresses() {
        try {
            const areaId = this.reportsManager.areaPage?.currentAreaId;
            if (!areaId) {
                this.addresses = [];
                return;
            }

            this.addresses = await this.database.getAddressesInMapArea(areaId);
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка загрузки адресов:', error);
            this.addresses = [];
        }
    }

    // Методы карты удалены - карта управляется FlippingController через FlippingMap

    /**
     * Обновление отображения карты согласно новой логике
     */
    async updateMapDisplay(source = 'неизвестно') {
        try {
            // Предотвращение одновременного выполнения
            if (this._updateMapDisplayInProgress) {
                return;
            }
            this._updateMapDisplayInProgress = true;
            
            if (!this.flippingController || !this.flippingController.flippingMap) {
                this._updateMapDisplayInProgress = false;
                return;
            }

            const map = this.flippingController.flippingMap;
            
            // 1. Показываем полигон области (всегда)
            await this.displayAreaPolygon();
            
            // 2. Определяем адреса для показа в зависимости от выбранного фильтра
            const addressesToShow = await this.getAddressesToDisplay();
            
            if (addressesToShow.length === 0) {
                // Если нет адресов для показа, очищаем маркеры
                if (map.clearMarkers) {
                    map.clearMarkers();
                }
                this._updateMapDisplayInProgress = false;
                return;
            }
            
            // 3. Для каждого адреса находим активные объекты и рассчитываем максимальную доходность
            const addressesWithProfitability = await this.calculateAddressProfitability(addressesToShow);
            
            // 4. Обновляем маркеры на карте с цветовым кодированием
            if (map.updateAddresses) {
                // Передаем подготовленные адреса с activeObjects в карту
                
                await map.updateAddresses(addressesWithProfitability, this.currentFilters, this.filteredObjects);
            }
            
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления карты:', error);
        } finally {
            // Сбрасываем флаг выполнения
            this._updateMapDisplayInProgress = false;
        }
    }

    /**
     * Показ полигона области на карте
     */
    async displayAreaPolygon() {
        try {
            // Получаем текущую область
            const currentArea = this.reportsManager?.areaPage?.dataState?.getState('currentArea');
            if (!currentArea || !currentArea.polygon) {
                return;
            }

            const map = this.flippingController.flippingMap;
            
            // Если у FlippingMap есть метод для отображения полигона области
            if (map.displayAreaPolygon) {
                map.displayAreaPolygon(currentArea.polygon);
            }
            
        } catch (error) {
            console.error('❌ Ошибка отображения полигона области:', error);
        }
    }

    /**
     * Определение адресов для отображения на карте
     */
    async getAddressesToDisplay() {
        try {
            const currentArea = this.reportsManager?.areaPage?.dataState?.getState('currentArea');
            if (!currentArea) {
                return [];
            }

            let addressesToShow = [];

            // Получаем текущие глобальные фильтры
            const currentSegment = this.reportsManager.currentSegment;
            const currentSubsegment = this.reportsManager.currentSubsegment;
            
            if (this.activeSubsegmentId || currentSubsegment) {
                // 4. Выбран подсегмент - показываем адреса подсегмента с активными объектами
                const subsegmentId = this.activeSubsegmentId || currentSubsegment.id;
                addressesToShow = await this.getSubsegmentActiveAddresses(subsegmentId);
                
            } else if (currentSegment) {
                // 3. Выбран сегмент - показываем адреса сегмента с активными объектами
                addressesToShow = await this.getSegmentActiveAddresses(currentSegment.id);
                
            } else {
                // 2. Сегмент не выбран - показываем все адреса области с активными объектами
                addressesToShow = await this.getAreaActiveAddresses(currentArea.id);
            }

            return addressesToShow;

        } catch (error) {
            console.error('❌ Ошибка определения адресов для карты:', error);
            return [];
        }
    }

    /**
     * Получение адресов области с активными объектами
     */
    async getAreaActiveAddresses(areaId) {
        try {
            // Получаем все адреса области
            const allAddresses = await this.database.getAddressesInMapArea(areaId);
            
            // Фильтруем только те адреса, где есть активные объекты
            const activeAddresses = [];
            let totalObjects = 0;
            let totalActiveObjects = 0;
            
            for (const address of allAddresses) {
                const objects = await this.database.getObjectsByAddress(address.id);
                const activeObjects = objects; // Показываем все объекты для расчёта доходности
                
                // Диагностика статусов (только для первых 3 адресов)
                if (objects.length > 0 && totalObjects < 3) {
                    const statusCounts = {};
                    objects.forEach(obj => {
                        statusCounts[obj.status || 'undefined'] = (statusCounts[obj.status || 'undefined'] || 0) + 1;
                    });
                }
                
                totalObjects += objects.length;
                totalActiveObjects += activeObjects.length;
                
                if (activeObjects.length > 0) {
                    const addressWithActiveObjects = {
                        ...address,
                        activeObjects
                    };
                    activeAddresses.push(addressWithActiveObjects);
                    
                }
            }
            
            return activeAddresses;
            
        } catch (error) {
            console.error('❌ Ошибка получения адресов области:', error);
            return [];
        }
    }

    /**
     * Получение адресов сегмента с активными объектами
     */
    async getSegmentActiveAddresses(segmentId) {
        try {
            const segment = await this.database.getSegment(segmentId);
            if (!segment) {
                return [];
            }

            // Получаем адреса области сегмента
            const addresses = await this.database.getAddressesInMapArea(segment.map_area_id);
            
            // Применяем критерии сегмента для фильтрации адресов
            let filteredAddresses = addresses;
            if (segment.filters) {
                filteredAddresses = this.reportsManager.filterAddressesBySegmentCriteria(addresses, segment.filters);
            }
            
            // Оставляем только адреса с активными объектами
            const activeAddresses = [];
            let totalObjects = 0;
            let totalActiveObjects = 0;
            
            for (const address of filteredAddresses) {
                const objects = await this.database.getObjectsByAddress(address.id);
                const activeObjects = objects; // Показываем все объекты для расчёта доходности
                
                totalObjects += objects.length;
                totalActiveObjects += activeObjects.length;
                
                if (activeObjects.length > 0) {
                    activeAddresses.push({
                        ...address,
                        activeObjects
                    });
                }
            }
            
            return activeAddresses;
            
        } catch (error) {
            console.error('❌ Ошибка получения адресов сегмента:', error);
            return [];
        }
    }

    /**
     * Получение адресов подсегмента с активными объектами
     */
    async getSubsegmentActiveAddresses(subsegmentId) {
        try {
            const subsegment = await this.getSubsegmentById(subsegmentId);
            if (!subsegment) {
                return [];
            }

            // Сначала получаем адреса родительского сегмента
            const segmentAddresses = await this.getSegmentActiveAddresses(subsegment.segment_id);
            
            // Теперь фильтруем только те адреса, где есть объекты, соответствующие критериям подсегмента
            const subsegmentAddresses = [];
            
            let totalActiveObjects = 0;
            let subsegmentActiveObjects = 0;
            
            for (const address of segmentAddresses) {
                totalActiveObjects += address.activeObjects.length;
                
                // Проверяем, есть ли среди активных объектов те, что соответствуют подсегменту
                const subsegmentObjects = address.activeObjects.filter(obj => 
                    this.reportsManager.objectMatchesSubsegment(obj, subsegment)
                );
                
                subsegmentActiveObjects += subsegmentObjects.length;
                
                if (subsegmentObjects.length > 0) {
                    subsegmentAddresses.push({
                        ...address,
                        activeObjects: subsegmentObjects // Оставляем только объекты подсегмента
                    });
                }
            }
            
            return subsegmentAddresses;
            
        } catch (error) {
            console.error('❌ Ошибка получения адресов подсегмента:', error);
            return [];
        }
    }

    /**
     * Расчёт доходности для каждого адреса
     */
    async calculateAddressProfitability(addresses) {
        try {
            const addressesWithProfitability = [];
            
            for (const address of addresses) {
                let maxProfitability = null; // Изменяем начальное значение на null
                let maxProfitabilityText = '';
                
                // Проверяем наличие активных объектов
                if (!address.activeObjects || !Array.isArray(address.activeObjects)) {
                    addressesWithProfitability.push({
                        ...address,
                        maxProfitability: 0,
                        maxProfitabilityText: 'Нет данных',
                        markerColor: '#6b7280',
                        activeObjects: []
                    });
                    continue;
                }
                
                // Рассчитываем доходность для каждого объекта адреса (активные и архивные)
                for (const obj of address.activeObjects) {
                    const profitability = this.calculateObjectProfitability(obj);
                    
                    // ИСПРАВЛЕНИЕ: Копируем доходность в объект для таблицы с полной структурой
                    const tableObject = this.filteredObjects.find(filteredObj => filteredObj.id === obj.id);
                    if (tableObject && profitability) {
                        // Получаем базовые параметры расчёта из текущих фильтров
                        const area = obj.area_total;
                        if (!area) {
                            console.log(`⚠️ Площадь не указана для объекта ${obj.id}`);
                            continue;
                        }
                        const renovationCostPerMeter = (this.currentFilters.workCost || 10000) + (this.currentFilters.materialsCost || 10000);
                        const renovationCost = area * renovationCostPerMeter;
                        const additionalExpenses = this.currentFilters.additionalExpenses || 100000;
                        const purchasePrice = obj.current_price || 0;
                        
                        // ИСПРАВЛЕНИЕ: Правильный расчёт продажной цены по эталонной стоимости
                        const referencePricePerMeter = this.getReferencePriceForObject(obj);
                        console.log(`🔍 Эталонная цена для объекта ${obj.id}:`, referencePricePerMeter);
                        
                        let salePrice;
                        if (referencePricePerMeter) {
                            // ИСПРАВЛЕНИЕ: Продажная цена = эталонная цена за м² × площадь
                            salePrice = referencePricePerMeter * area;
                            console.log(`📊 Продажная цена: ${referencePricePerMeter} × ${area} = ${salePrice}`);
                        } else {
                            // Fallback: используем старую логику
                            console.log(`⚠️ Эталонная цена не найдена для объекта ${obj.id}, используем fallback`);
                            const netProfit = profitability.totalProfit || 0;
                            salePrice = purchasePrice + renovationCost + additionalExpenses + netProfit;
                        }
                        
                        // Проверяем наличие обязательных параметров и используем fallback
                        const renovationSpeed = this.currentFilters.renovationSpeed || 1.5;
                        const averageExposureDays = this.currentFilters.averageExposureDays || 90;
                        
                        if (!this.currentFilters.renovationSpeed) {
                            console.warn(`⚠️ Используем скорость ремонта по умолчанию ${renovationSpeed} м²/день для объекта ${obj.id}`);
                        }
                        if (!this.currentFilters.averageExposureDays) {
                            console.warn(`⚠️ Используем срок экспозиции по умолчанию ${averageExposureDays} дней для объекта ${obj.id}`);
                        }
                        
                        // Рассчитываем затраты на финансирование в зависимости от типа
                        const projectMonths = (area / this.currentFilters.renovationSpeed) / 30 + this.currentFilters.averageExposureDays / 30;
                        let financingCost = purchasePrice; // По умолчанию "деньги"
                        
                        if (this.currentFilters.financing === 'mortgage') {
                            // При ипотеке: первоначальный взнос + проценты за срок проекта
                            if (!this.currentFilters.downPayment) {
                                console.error(`❌ Не задан первоначальный взнос для объекта ${obj.id}`);
                                continue;
                            }
                            if (!this.currentFilters.mortgageRate) {
                                console.error(`❌ Не задана ставка ипотеки для объекта ${obj.id}`);
                                continue;
                            }
                            
                            const downPaymentPercent = this.currentFilters.downPayment;
                            const mortgageRate = this.currentFilters.mortgageRate / 100;
                            const downPayment = purchasePrice * (downPaymentPercent / 100);
                            const loanAmount = purchasePrice - downPayment;
                            
                            // Простой расчёт процентов за срок проекта
                            const projectYears = projectMonths / 12;
                            const interestCosts = loanAmount * mortgageRate * projectYears;
                            
                            financingCost = downPayment + interestCosts;
                        }
                        
                        // Рассчитываем базовые значения с правильными затратами на финансирование
                        const totalCosts = financingCost + renovationCost + additionalExpenses;
                        const netProfit = salePrice - totalCosts; // Прибыль = продажа - затраты
                        const taxes = Math.max(0, salePrice - purchasePrice) * 0.13; // Упрощённый расчёт
                        
                        // Используем новую структуру для отображения в дочерней таблице  
                        const currentData = {
                            purchasePrice: financingCost, // Реальные затраты на покупку (с учётом финансирования)
                            renovationCost: renovationCost,
                            additionalExpenses: additionalExpenses,
                            taxes: taxes,
                            totalCosts: totalCosts,
                            salePrice: salePrice,
                            netProfit: netProfit,
                            annualROI: profitability.annualReturn || 0,
                            totalProjectMonths: Math.round(projectMonths * 10) / 10,
                            totalProjectDays: Math.round(projectMonths * 30)
                        };
                        
                        // Рассчитаем целевую цену для заданной доходности
                        let targetData = null;
                        try {
                            const targetROI = this.currentFilters.profitabilityPercent || 60;
                            const targetPrice = this.calculateTargetPriceForObject(obj, targetROI);
                            
                            if (targetPrice && targetPrice < purchasePrice) {
                                const targetRenovationCost = area * renovationCostPerMeter; // Та же стоимость ремонта
                                
                                // Рассчитываем затраты на финансирование для целевой цены
                                let targetFinancingCost = targetPrice; // По умолчанию "деньги"
                                if (this.currentFilters.financing === 'mortgage') {
                                    const downPaymentPercent = this.currentFilters.downPayment;
                                    const mortgageRate = this.currentFilters.mortgageRate / 100;
                                    const targetDownPayment = targetPrice * (downPaymentPercent / 100);
                                    const targetLoanAmount = targetPrice - targetDownPayment;
                                    const projectYears = projectMonths / 12;
                                    const targetInterestCosts = targetLoanAmount * mortgageRate * projectYears;
                                    targetFinancingCost = targetDownPayment + targetInterestCosts;
                                }
                                
                                const targetTotalCosts = targetFinancingCost + targetRenovationCost + additionalExpenses;
                                const targetNetProfit = salePrice - targetTotalCosts;
                                const targetTaxes = Math.max(0, salePrice - targetPrice) * 0.13;
                                const targetAnnualROI = targetTotalCosts > 0 ? (targetNetProfit / targetTotalCosts) * 100 : 0;
                                const discount = Math.round(((purchasePrice - targetPrice) / purchasePrice) * 100);
                                
                                targetData = {
                                    purchasePrice: targetFinancingCost, // Реальные затраты на покупку целевого объекта
                                    renovationCost: targetRenovationCost,
                                    additionalExpenses: additionalExpenses,
                                    taxes: targetTaxes,
                                    totalCosts: targetTotalCosts,
                                    salePrice: salePrice,
                                    netProfit: targetNetProfit,
                                    annualROI: targetAnnualROI,
                                    totalProjectMonths: Math.round(projectMonths * 10) / 10,
                                    totalProjectDays: Math.round(projectMonths * 30),
                                    targetPrice: targetPrice,
                                    discount: discount
                                };
                            }
                        } catch (error) {
                            console.log(`⚠️ Не удалось рассчитать целевую цену для объекта ${obj.id}:`, error);
                        }
                        
                        tableObject.flippingProfitability = {
                            current: currentData,
                            target: targetData
                        };
                        
                        // Для обратной совместимости сохраняем также profitability
                        tableObject.profitability = currentData;
                        
                        console.log(`✅ Скопирована доходность для объекта ${obj.id}: текущая ${profitability.annualReturn}% годовых${targetData ? `, целевая ${targetData.annualROI.toFixed(1)}% при цене ${targetData.targetPrice.toLocaleString()} ₽` : ''}`);
                    } else if (!tableObject) {
                        console.log(`⚠️ Объект ${obj.id} не найден в filteredObjects`);
                    }
                    
                    // Диагностика расчета доходности (только при отладке)
                    console.log(`💰 Расчет доходности для объекта ${obj.id}:`, {
                                                        объект: obj.property_type,
                                                        цена: obj.current_price,
                                                        площадь: obj.area_total,
                                                        доходность: profitability?.annualReturn || 'нет данных'
                                                    });
                    
                    // Исправляем логику для отрицательных значений доходности
                    if (profitability && typeof profitability.annualReturn === 'number') {
                        if (maxProfitability === null || profitability.annualReturn > maxProfitability) {
                            maxProfitability = profitability.annualReturn;
                            maxProfitabilityText = `${profitability.annualReturn.toFixed(1)}% годовых`;
                        }
                    }
                }
                
                // Обрабатываем случай когда нет рассчитанной доходности
                if (maxProfitability === null) {
                    maxProfitability = 0;
                    maxProfitabilityText = 'Нет оценок';
                }
                
                // Определяем цвет маркера на основе доходности
                const markerColor = this.getProfitabilityColor(maxProfitability);
                
                addressesWithProfitability.push({
                    ...address,
                    maxProfitability,
                    maxProfitabilityText,
                    markerColor,
                    activeObjects: address.activeObjects // Сохраняем activeObjects для popup
                });
                
                console.log(`🏠 Адрес ${address.address}:`, {
                    активныхОбъектов: address.activeObjects.length,
                    максДоходность: maxProfitability,
                    текстДоходности: maxProfitabilityText,
                    цветМаркера: markerColor
                });
            }
            
           
                console.log(`✅ calculateAddressProfitability: обработано ${addressesWithProfitability.length} адресов с доходностью`);
                
                // Диагностика первых 3 адресов
                for (let i = 0; i < Math.min(3, addressesWithProfitability.length); i++) {
                    const addr = addressesWithProfitability[i];
                    console.log(`📊 Адрес ${i+1}: ${addr.address}, активных объектов: ${addr.activeObjects?.length || 0}`);
                }
            
            
            return addressesWithProfitability;
            
        } catch (error) {
            console.error('❌ Ошибка расчёта доходности адресов:', error);
            return addresses; // Возвращаем без доходности в случае ошибки
        }
    }

    /**
     * Расчёт целевой цены покупки для достижения заданной доходности
     * @param {Object} object - объект недвижимости
     * @param {number} targetROI - целевая доходность (% годовых)
     * @returns {number|null} целевая цена покупки
     */
    calculateTargetPriceForObject(object, targetROI) {
        try {
            const area = object.area_total || 0;
            if (!area) return null;
            
            // Используем правильную эталонную цену и параметры расчёта
            const referencePricePerMeter = this.getReferencePriceForObject(object) || 215076; // Fallback
            const salePrice = referencePricePerMeter * area;
            
            // Проверяем наличие всех параметров
            if (!this.currentFilters.workCost || !this.currentFilters.materialsCost) {
                console.error('❌ Отсутствуют параметры ремонта для расчёта целевой цены');
                return null;
            }
            if (!this.currentFilters.additionalExpenses) {
                console.error('❌ Не заданы дополнительные расходы для расчёта целевой цены');
                return null;
            }
            
            const renovationCostPerMeter = this.currentFilters.workCost + this.currentFilters.materialsCost;
            const renovationCost = area * renovationCostPerMeter;
            const additionalExpenses = this.currentFilters.additionalExpenses;
            
            // Приблизительный расчёт через итерации
            let targetPrice = object.current_price * 0.8; // Начинаем с 80%
            let iterations = 0;
            const maxIterations = 50;
            const precision = 0.5; // Точность 0.5%
            
            while (iterations < maxIterations) {
                // Рассчитываем затраты на финансирование для целевой цены
                let financingCost = targetPrice; // По умолчанию "деньги"
                if (this.currentFilters.financing === 'mortgage') {
                    if (!this.currentFilters.downPayment || !this.currentFilters.mortgageRate) {
                        console.error('❌ Отсутствуют параметры ипотеки для расчёта целевой цены');
                        return null;
                    }
                    const downPaymentPercent = this.currentFilters.downPayment;
                    const mortgageRate = this.currentFilters.mortgageRate / 100;
                    const downPayment = targetPrice * (downPaymentPercent / 100);
                    const loanAmount = targetPrice - downPayment;
                    // Упрощённый расчёт - используем примерный срок проекта
                    const projectYears = 0.3; // ~3.6 месяца = 0.3 года
                    const interestCosts = loanAmount * mortgageRate * projectYears;
                    financingCost = downPayment + interestCosts;
                }
                
                const totalCosts = financingCost + renovationCost + additionalExpenses;
                const netProfit = salePrice - totalCosts;
                const annualROI = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;
                
                if (Math.abs(annualROI - targetROI) < precision) {
                    return Math.round(targetPrice);
                }
                
                // Корректируем цену
                if (annualROI > targetROI) {
                    targetPrice *= 1.02; // Увеличиваем цену на 2%
                } else {
                    targetPrice *= 0.98; // Уменьшаем цену на 2%
                }
                
                iterations++;
                
                // Защита от нереальных значений
                if (targetPrice < 1000 || targetPrice > object.current_price * 2) {
                    break;
                }
            }
            
            return targetPrice < object.current_price ? Math.round(targetPrice) : null;
        } catch (error) {
            console.error('❌ Ошибка расчёта целевой цены:', error);
            return null;
        }
    }

    /**
     * Расчёт доходности конкретного объекта
     */
    calculateObjectProfitability(obj) {
        try {
            // Получаем эталонную цену подсегмента для объекта
            const referencePricePerMeter = this.getReferencePriceForObject(obj);
            
            if (!referencePricePerMeter) {
                // ВРЕМЕННЫЙ FALLBACK: используем среднюю эталонную цену 215076 из правой панели
                console.log(`⚠️ Используем fallback эталонную цену для объекта ${obj.id}`);
                const fallbackReferencePrice = 215076; // Видно из скриншота
                
                // Упрощённый расчёт доходности без сервиса
                const area = obj.area_total || 30;
                const salePrice = fallbackReferencePrice * area;
                const totalCosts = obj.current_price + (area * 20000); // Приблизительная стоимость ремонта
                const netProfit = salePrice - totalCosts;
                const annualReturn = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;
                
                return {
                    annualReturn: annualReturn,
                    totalProfit: netProfit,
                    roi: annualReturn
                };
            }
            
            // Формируем полные параметры для сервиса
            const params = {
                ...this.currentFilters,
                referencePricePerMeter: referencePricePerMeter,
                averageExposureDays: this.averageExposureDays || 60,
                renovationSpeed: this.currentFilters?.renovationSpeed || 1.5,
                additionalExpenses: this.currentFilters?.additionalExpenses || 100000,
                taxType: this.currentFilters?.taxType || 'ip',
                financing: this.currentFilters?.financing || 'cash',
                participants: this.currentFilters?.participants || 'flipper',
                profitSharing: this.currentFilters?.profitSharing || 'percentage',
                renovationType: this.currentFilters?.renovationType || 'auto',
                workCost: this.currentFilters?.workCost || 10000,
                materialsCost: this.currentFilters?.materialsCost || 10000
            };
            
            // Адаптируем структуру объекта для сервиса
            const adaptedObject = {
                ...obj,
                currentPrice: obj.current_price || obj.price,
                area: obj.area_total
            };
            
            // Используем сервис расчёта доходности
            if (this.flippingController && this.flippingController.realEstateObjectService) {
                const serviceResult = this.flippingController.realEstateObjectService.calculateProfitability(adaptedObject, params);
                
                return serviceResult;
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ Ошибка расчёта доходности объекта:', error);
            return null;
        }
    }

    /**
     * Получение эталонной цены подсегмента для объекта
     */
    getReferencePriceForObject(obj) {
        try {
            // Если эталонные цены не рассчитаны, возвращаем null
            if (!this.referencePrices || this.referencePrices.length === 0) {
                return null;
            }
            
            // Находим подсегмент объекта
            for (const refPrice of this.referencePrices) {
                if (refPrice.id && refPrice.filters) {
                    // Проверяем соответствие объекта подсегменту
                    const subsegment = {
                        id: refPrice.id,
                        name: refPrice.name,
                        filters: refPrice.filters
                    };
                    
                    if (this.reportsManager.objectMatchesSubsegment(obj, subsegment)) {
                        const price = refPrice.referencePrice?.perMeter;
                        if (price) {
                            return price;
                        }
                    }
                }
            }
            
            // Если не нашли подсегмент, используем общую эталонную цену (если есть)
            if (this.referencePrice?.perMeter) {
                return this.referencePrice.perMeter;
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ Ошибка получения эталонной цены для объекта:', error);
            return null;
        }
    }

    /**
     * Определение цвета маркера на основе доходности
     */
    getProfitabilityColor(profitability) {
        if (profitability >= 80) return '#22c55e';  // Зелёный - высокая доходность
        if (profitability >= 50) return '#eab308';  // Жёлтый - средняя доходность  
        if (profitability >= 20) return '#f97316';  // Оранжевый - низкая доходность
        if (profitability > 0)   return '#ef4444';  // Красный - очень низкая доходность
        return '#6b7280';                           // Серый - нет данных
    }

    /**
     * Устаревший метод - заменён на updateMapDisplay()
     */
    async loadMapData() {
        await this.updateMapDisplay('loadMapData (устаревший)');
    }

    /**
     * Создание графика рыночного коридора
     */
    async createMarketCorridorChart() {
        try {
            if (!this.chartContainer) {
                return;
            }
            
            // Защита от множественного создания
            if (this.chartCreationInProgress) {
                return;
            }
            this.chartCreationInProgress = true;

            
            
            // ✅ ИСПРАВЛЕНО: Получаем подготовленные серии и цвета из prepareChartData() как в ReportsManager
            const { series: chartData, colors } = this.prepareChartData();
            
            // Опции для графика ApexCharts (аналогично ReportsManager)
            const options = {
                series: chartData || [],
                colors: colors,
                chart: {
                    type: this.marketCorridorMode === 'history' ? 'line' : 'scatter',
                    height: 400,
                    zoom: {
                        enabled: true
                    },
                    selection: {
                        enabled: false // Отключаем selection чтобы избежать автопрокрутки
                    },
                    animations: {
                        enabled: false
                    },
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
                        dataPointSelection: (event, chartContext, config) => {
                            // ИСПРАВЛЕНИЕ: Игнорируем события во время уничтожения графика
                            if (this.chartBeingDestroyed) {
                                if (event) {
                                    event.preventDefault && event.preventDefault();
                                    event.stopPropagation && event.stopPropagation();
                                }
                                return;
                            }
                            
                            // ИСПРАВЛЕНИЕ: Игнорируем клики по пустым областям
                            // ApexCharts вызывает dataPointSelection даже для кликов вне точек с индексами -1
                            if (!config || config.dataPointIndex < 0 || config.seriesIndex < 0) {
                                // Полностью игнорируем клики по пустым областям
                                if (event) {
                                    event.preventDefault && event.preventDefault();
                                    event.stopPropagation && event.stopPropagation();
                                }
                                return;
                            }
                            
                            // ✅ ИСПРАВЛЕНО: Защита от вызовов после уничтожения графика
                            if (this.isDestroyed || !this.marketCorridorChart || !this.chartContainer || !document.contains(this.chartContainer)) {
                                return;
                            }
                            
                            // Предотвращаем стандартное поведение прокрутки
                            if (event) {
                                event.preventDefault && event.preventDefault();
                                event.stopPropagation && event.stopPropagation();
                            }
                            
                            try {
                                this.handleChartClick(config);
                            } catch (error) {
                                console.error('❌ Ошибка обработки клика по графику:', error);
                            }
                        }
                    }
                },
                stroke: {
                    width: this.marketCorridorMode === 'history' ? 2 : 0, // Линии только в режиме истории
                    curve: this.marketCorridorMode === 'history' ? 'stepline' : 'straight'
                },
                markers: this.getMarkerOptions(),
                xaxis: {
                    type: 'datetime',
                    title: {
                        text: 'Дата'
                    }
                },
                yaxis: {
                    title: {
                        text: 'Цена'
                    },
                    labels: {
                        formatter: function (val) {
                            return new Intl.NumberFormat('ru-RU').format(val);
                        }
                    }
                },
                tooltip: {
                    shared: false,
                    intersect: true,
                    custom: (tooltipModel) => {
                        const { series, seriesIndex, dataPointIndex, w } = tooltipModel;
                        
                        // Получаем данные точки из сохраненного массива
                        const flippingManager = window.flippingProfitabilityManagerInstance;
                        
                        let point = null;
                        
                        if (flippingManager && flippingManager.currentPointsData) {
                            // Ищем точку по координатам
                            const seriesData = w.config.series[seriesIndex];
                            if (seriesData && seriesData.data && seriesData.data[dataPointIndex]) {
                                const [timestamp, price] = seriesData.data[dataPointIndex];
                                
                                point = flippingManager.currentPointsData.find(p => 
                                    Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                                );
                            }
                        }
                        
                        if (!point) {
                            return '<div style="padding: 8px;">Нет данных</div>';
                        }

                        const price = new Intl.NumberFormat('ru-RU').format(point.y);
                        const date = new Date(point.x).toLocaleDateString('ru-RU');
                        const status = point.status === 'active' ? 'Активный' : 'Архив';
                        const rooms = point.rooms || 'н/д';
                        const area = point.area ? `${point.area} м²` : 'н/д';
                        const floor = point.floor && point.floors_total ? `${point.floor}/${point.floors_total}` : 'н/д';

                        return `
                            <div style="background: white; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); padding: 12px; max-width: 300px;">
                                <div style="font-weight: 600; color: #1f2937; margin-bottom: 8px;">${rooms} комн., ${area}</div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Этаж: ${floor}</div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Статус: <span style="font-weight: 500; color: ${point.status === 'active' ? '#059669' : '#6b7280'};">${status}</span></div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Дата: ${date}</div>
                                <div style="font-weight: bold; font-size: 18px; color: #2563eb;">${price} ₽</div>
                                <div style="font-size: 12px; color: #9ca3af; margin-top: 8px;">Кликните для подробностей</div>
                            </div>
                        `;
                    }
                },
                legend: {
                    show: false,
                    showForSingleSeries: false,
                    showForNullSeries: false,
                    showForZeroSeries: false
                },
                title: {
                    text: '',
                    align: 'left'
                },
                annotations: {
                    yaxis: []  // Будем динамически добавлять линию эталонной цены
                }
            };

            // Создаем график
            if (this.marketCorridorChart) {
                try {
                    // ИСПРАВЛЕНИЕ: Флаг для игнорирования событий во время уничтожения
                    this.chartBeingDestroyed = true;
                    
                    // Проверяем что график существует и может быть уничтожен
                    if (this.marketCorridorChart.destroy && typeof this.marketCorridorChart.destroy === 'function') {
                        this.marketCorridorChart.destroy();
                    }
                } catch (error) {
                    console.warn('📊 Ошибка при уничтожении графика:', error);
                }
                this.marketCorridorChart = null;
                
                // ✅ ИСПРАВЛЕНО: Принудительная очистка DOM элемента для устранения querySelector ошибок
                if (this.chartContainer) {
                    // Удаляем все обработчики событий с контейнера
                    const newContainer = this.chartContainer.cloneNode(false);
                    this.chartContainer.parentNode.replaceChild(newContainer, this.chartContainer);
                    this.chartContainer = newContainer;
                }
                
                // Небольшая задержка для завершения всех асинхронных операций ApexCharts
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Сбрасываем флаг после задержки
                this.chartBeingDestroyed = false;
            }

            // Проверяем, что контейнер графика существует
            if (!this.chartContainer || !document.contains(this.chartContainer)) {
                console.error('📊 Контейнер графика недоступен');
                return;
            }

            // Создание графика (ошибки перехватываются глобальным обработчиком)
            this.marketCorridorChart = new ApexCharts(this.chartContainer, options);
            await this.marketCorridorChart.render();

            // Создаем глобальную ссылку для tooltip
            window.flippingProfitabilityManagerInstance = this;
            
            // Добавляем линию эталонной цены, если есть активный подсегмент
            if (this.activeSubsegmentId) {
                this.updateReferencePriceAnnotation();
            }

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка создания графика:', error);
        } finally {
            // Сбрасываем флаг создания
            this.chartCreationInProgress = false;
        }
    }

    /**
     * Обновление графика рыночного коридора
     */
    async updateMarketCorridorChart() {
        try {
            // Защита от одновременного обновления
            if (this.chartUpdateInProgress || this.chartCreationInProgress) {
                return;
            }
            
            await this.createMarketCorridorChart();
            return;
            
            // Код ниже больше не выполняется - оставлен для истории
            this.chartUpdateInProgress = true;

            // Подготавливаем данные для графика на основе отфильтрованных объектов
            const { series: chartData, colors } = this.prepareChartData();
            
            // Обновляем серии данных
            if (chartData && chartData.length > 0) {
                this.marketCorridorChart.updateSeries(chartData);
            }
            
            // Обновляем линию эталонной цены для активного подсегмента
            this.updateReferencePriceAnnotation();

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления графика:', error);
        } finally {
            // Сбрасываем флаг обновления
            this.chartUpdateInProgress = false;
        }
    }

    /**
     * Обновление аннотации с эталонной ценой на графике
     */
    updateReferencePriceAnnotation() {
        try {
            if (!this.marketCorridorChart) {
                return;
            }

            // Если нет активного подсегмента, убираем линию
            if (!this.activeSubsegmentId) {
                // Пробуем сначала основной метод
                try {
                    this.marketCorridorChart.clearAnnotations();
                } catch (error) {
                    console.warn('📊 Ошибка очистки основным методом:', error);
                    // Альтернативный метод
                    this.marketCorridorChart.updateOptions({
                        annotations: {
                            yaxis: []
                        }
                    });
                }
                return;
            }

            // Находим эталонную цену для активного подсегмента
            const subsegmentPrice = this.referencePrices.find(p => p.id === this.activeSubsegmentId);
            const subsegmentIndex = this.referencePrices.findIndex(p => p.id === this.activeSubsegmentId);
            const colors = this.getSubsegmentColorScheme(subsegmentIndex);
            
            if (!subsegmentPrice || !subsegmentPrice.referencePrice || !subsegmentPrice.referencePrice.total) {
                // Если нет цены, убираем линию
                this.marketCorridorChart.updateOptions({
                    annotations: {
                        yaxis: []
                    }
                });
                return;
            }

            const totalPrice = subsegmentPrice.referencePrice.total;
            const formattedPrice = new Intl.NumberFormat('ru-RU').format(totalPrice);
            
            // Проверяем диапазон данных на графике
            const chartOptions = this.marketCorridorChart.opts;

            // Добавляем горизонтальную линию эталонной цены
            // Сначала очищаем предыдущие аннотации
            try {
                this.marketCorridorChart.clearAnnotations();
                
                // Добавляем новую аннотацию
                this.marketCorridorChart.addYaxisAnnotation({
                    y: totalPrice,
                    borderColor: colors.graphColor,
                    borderWidth: 2,
                    strokeDashArray: 5,  // Прерывистая линия
                    label: {
                        borderColor: colors.graphColor,
                        style: {
                            color: '#fff',
                            background: colors.graphColor,
                            fontSize: '12px',
                            fontWeight: 'bold'
                        },
                        text: `${formattedPrice} ₽`,
                        position: 'left'  // Размещаем подпись слева
                    }
                });
            } catch (annotationError) {
                console.error('📊 Ошибка добавления аннотации:', annotationError);
                // Альтернативный метод
                // Альтернативный метод через updateOptions с полной структурой
                this.marketCorridorChart.updateOptions({
                    annotations: {
                        yaxis: [{
                            y: totalPrice,
                            borderColor: colors.graphColor,
                            borderWidth: 2,
                            strokeDashArray: 5,  // Пунктирная линия
                            label: {
                                borderColor: colors.graphColor,
                                style: {
                                    color: '#fff',
                                    background: colors.graphColor,
                                    fontSize: '12px',
                                    fontWeight: 600
                                },
                                text: `${formattedPrice} ₽`,
                                position: 'left',
                                offsetX: 10
                            }
                        }]
                    }
                }, false, true);  // false - не сбрасывать серии, true - обновить график
            }

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления линии эталонной цены:', error);
        }
    }

    /**
     * Подготовка данных для графика (идентично ReportsManager)
     */
    prepareChartData() {
        try {
            
            if (!this.filteredObjects || this.filteredObjects.length === 0) {
                return [];
            }

            // Подготавливаем данные точек для графика (как в ReportsManager)
            const activePointsData = [];
            const archivePointsData = [];
            
            this.filteredObjects.forEach(obj => {
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
                    if (this.marketCorridorMode === 'history') {
                        // Режим "История активных" - используем алгоритм из модального окна (как в ReportsManager)
                        const objectPriceHistory = this.prepareObjectPriceHistoryForChart(obj);
                        
                        // Каждая точка истории добавляется с информацией об объекте
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
                                updated: obj.updated
                            });
                        });
                    } else {
                        // Активные объекты: текущая цена на текущую дату (режим "Коридор продаж")
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
            
            // Сортируем данные по дате
            activePointsData.sort((a, b) => a.x - b.x);
            archivePointsData.sort((a, b) => a.x - b.x);

            // ✅ ИСПРАВЛЕНО: Формируем серии данных и цвета точно как в ReportsManager
            const series = [];
            const colors = []; // Цвета добавляются внутри циклов создания серий
            const seriesDataMapping = []; // Маппинг серий к данным (только для режима коридора)
            
            if (this.marketCorridorMode === 'history') {
                // В режиме истории группируем активные объекты по ID для создания отдельных линий (точная копия ReportsManager)
                const activeObjectsGrouped = {};
                const objectPointsMapping = {}; // Маппинг объектов к их точкам для seriesDataMapping
                
                activePointsData.forEach(point => {
                    if (!activeObjectsGrouped[point.objectId]) {
                        activeObjectsGrouped[point.objectId] = {
                            name: `Объект #${point.objectId}`,
                            data: [],
                            color: '#56c2d6'
                        };
                        objectPointsMapping[point.objectId] = [];
                    }
                    activeObjectsGrouped[point.objectId].data.push([point.x, point.y]);
                    objectPointsMapping[point.objectId].push(point);
                });
                
                // Добавляем каждый объект как отдельную серию (точная копия ReportsManager)
                Object.entries(activeObjectsGrouped).forEach(([objectId, objectSeries]) => {
                    const seriesIndex = series.length;
                    // Сортируем данные по дате для правильного соединения линий
                    objectSeries.data.sort((a, b) => a[0] - b[0]);
                    // Явно указываем тип линии для активных объектов в режиме истории
                    objectSeries.type = 'line';
                    series.push(objectSeries);
                    colors.push('#56c2d6'); // ✅ Добавляем цвет внутри цикла как в ReportsManager
                    
                    // ИСПРАВЛЕНИЕ: Заполняем seriesDataMapping для режима истории
                    // Сортируем точки объекта по дате в том же порядке, что и данные серии
                    const sortedPoints = objectPointsMapping[objectId].sort((a, b) => a.x - b.x);
                    seriesDataMapping[seriesIndex] = sortedPoints;
                });
                
                // Архивные объекты показываем как отдельные точки (точная копия ReportsManager) 
                if (archivePointsData.length > 0) {
                    const seriesIndex = series.length;
                    series.push({
                        name: 'Архивные объекты',
                        data: archivePointsData.map(point => [point.x, point.y]),
                        type: 'scatter' // Точки без линий
                    });
                    colors.push('#dc2626'); // ✅ Добавляем цвет внутри условия как в ReportsManager
                    
                    // ИСПРАВЛЕНИЕ: Заполняем seriesDataMapping для архивных объектов
                    seriesDataMapping[seriesIndex] = archivePointsData;
                }
            } else {
                // Режим "Коридор продаж" - группируем по статусу (точная копия ReportsManager)
                if (activePointsData.length > 0) {
                    const seriesIndex = series.length;
                    series.push({
                        name: 'Активные объекты',
                        data: activePointsData.map(point => [point.x, point.y])
                    });
                    colors.push('#56c2d6'); // ✅ Добавляем цвет внутри условия как в ReportsManager
                    seriesDataMapping[seriesIndex] = activePointsData; // Прямой маппинг
                }
                
                if (archivePointsData.length > 0) {
                    const seriesIndex = series.length;
                    series.push({
                        name: 'Архивные объекты',
                        data: archivePointsData.map(point => [point.x, point.y])
                    });
                    colors.push('#dc2626'); // ✅ Добавляем цвет внутри условия как в ReportsManager
                    seriesDataMapping[seriesIndex] = archivePointsData; // Прямой маппинг
                }
            }

            // Сохраняем данные точек для tooltip и маппинг серий
            this.currentPointsData = [...activePointsData, ...archivePointsData];
            this.currentSeriesDataMapping = seriesDataMapping; // Как в ReportsManager

            // ✅ ИСПРАВЛЕНО: Возвращаем объект с series и colors как в ReportsManager  
            return { series, colors };

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка подготовки данных графика:', error);
            return { series: [], colors: [] };
        }
    }

    /**
     * Подготовка данных истории цен объекта для графика (копия из ReportsManager)
     */
    prepareObjectPriceHistoryForChart(realEstateObject) {
        const history = [];
        
        // Добавляем историю цен если есть
        if (realEstateObject.price_history && Array.isArray(realEstateObject.price_history)) {
            realEstateObject.price_history.forEach(item => {
                if (item.price && item.date) {
                    history.push({
                        date: new Date(item.date).getTime(),
                        price: parseInt(item.price)
                    });
                }
            });
        }

        // Добавляем конечную точку с текущей ценой объекта (аналогично логике объявления)
        if (realEstateObject.current_price) {
            let endPriceDate;
            
            if (realEstateObject.status === 'active') {
                // Для активных объектов - текущая дата
                endPriceDate = new Date();
            } else {
                // Для архивных объектов - дата последнего логического обновления
                endPriceDate = new Date(realEstateObject.updated);
            }
            
            // Добавляем конечную точку только если она отличается от уже существующих
            const lastHistoryDate = history.length > 0 ? history[history.length - 1].date : 0;
            if (Math.abs(endPriceDate.getTime() - lastHistoryDate) > 24 * 60 * 60 * 1000) {
                history.push({
                    date: endPriceDate.getTime(),
                    price: parseInt(realEstateObject.current_price)
                });
            }
        }

        // Сортируем по дате
        history.sort((a, b) => a.date - b.date);
        
        // Убираем дубликаты цен подряд, но оставляем ключевые точки
        const filtered = [];
        for (let i = 0; i < history.length; i++) {
            if (i === 0 || i === history.length - 1 || history[i].price !== history[i-1].price) {
                filtered.push(history[i]);
            }
        }

        return filtered;
    }

    /**
     * Обработка клика по точке графика
     */
    async handleChartClick(config) {
        try {
            // ✅ ИСПРАВЛЕНО: Защита от обработки кликов после уничтожения графика
            if (this.isDestroyed || !this.marketCorridorChart || !this.chartContainer || !document.contains(this.chartContainer)) {
                console.warn('📊 Попытка обработать клик после уничтожения графика');
                return;
            }
            
            // Дополнительная проверка на всякий случай (основная проверка в dataPointSelection)
            if (!config || config.dataPointIndex < 0 || config.seriesIndex < 0) {
                return;
            }

            // Получаем данные точки из графика
            if (this.marketCorridorChart && this.marketCorridorChart.w && this.marketCorridorChart.w.config && this.marketCorridorChart.w.config.series) {
                const seriesData = this.marketCorridorChart.w.config.series[config.seriesIndex];
                if (seriesData && seriesData.data && seriesData.data[config.dataPointIndex]) {
                    const [timestamp, price] = seriesData.data[config.dataPointIndex];
                    
                    // Ищем объект как в ReportsManager - сначала через seriesDataMapping, потом по координатам
                    let clickedObject = null;
                    
                    if (this.marketCorridorMode === 'history') {
                        // В режиме истории нужно найти соответствующую точку по координатам
                        clickedObject = this.currentPointsData.find(p => 
                            Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                        );
                    } else {
                        // В режиме коридора продаж используем серии-маппинг
                        if (this.currentSeriesDataMapping && 
                            this.currentSeriesDataMapping[config.seriesIndex] && 
                            this.currentSeriesDataMapping[config.seriesIndex][config.dataPointIndex]) {
                            
                            const pointData = this.currentSeriesDataMapping[config.seriesIndex][config.dataPointIndex];
                            // pointData уже содержит всю информацию о точке, включая objectId
                            clickedObject = pointData;
                            
                        } else {
                            // Fallback - ищем по координатам
                            clickedObject = this.currentPointsData.find(p => 
                                Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                            );
                        }
                    }

                    if (clickedObject) {
                        const objectId = clickedObject.objectId;
                        
                        // Проверяем, уже ли выделен этот объект
                        if (this.selectedObjectId === objectId) {
                            // Повторный клик по уже выделенному объекту - открываем модальное окно
                            this.showObjectDetails(objectId);
                        } else {
                            // Первый клик - выделяем объект (как при клике по карточке)
                            await this.selectObject(objectId, true); // disableScroll = true для кликов из графика
                        }
                    } else {
                        console.warn('📊 Объект не найден для точки графика');
                    }
                }
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обработки клика по графику:', error);
        }
    }

    /**
     * Показать детали объекта недвижимости (использует существующее модальное окно)
     * @param {string} objectId - ID объекта
     */
    async showObjectDetails(objectId) {
        try {
            // ИСПРАВЛЕНИЕ: Проверяем готовность базы данных перед вызовом
            await DatabaseUtils.ensureDatabaseReady();
            
            // Получаем объект из нашего локального массива (уже загружен)
            const object = this.filteredObjects.find(obj => obj.id === objectId);
            if (!object) {
                console.warn('⚠️ Объект не найден в отфильтрованных данных:', objectId);
                return;
            }
            
            // Используем метод из DuplicatesManager через reportsManager.areaPage
            if (this.reportsManager && this.reportsManager.areaPage && this.reportsManager.areaPage.duplicatesManager && this.reportsManager.areaPage.duplicatesManager.showObjectDetails) {
                await this.reportsManager.areaPage.duplicatesManager.showObjectDetails(objectId);
            } else {
                console.error('❌ FlippingProfitabilityManager: DuplicatesManager недоступен для показа деталей объекта');
                
                // Fallback - показываем информацию об объекте из наших данных
                const rooms = object.rooms || object.property_type || 'н/д';
                const area = object.area_total ? `${object.area_total} м²` : 'н/д';
                const price = new Intl.NumberFormat('ru-RU').format(object.current_price);
                const status = object.status === 'active' ? 'Активный' : 'Архивный';
                
                alert(`📋 Объект ${objectId}\n\n` +
                      `Комнат: ${rooms}\n` +
                      `Площадь: ${area}\n` +
                      `Цена: ${price} ₽\n` +
                      `Статус: ${status}\n\n` +
                      `Для полного просмотра откройте панель "Управление дублями"`);
            }
        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка показа деталей объекта:', error);
        }
    }

    /**
     * Обновление отображения объектов
     */
    async updateObjectsDisplay() {
        try {
            
            
            // Обновляем блок объектов для оценки (ИСПРАВЛЕНИЕ: добавлен недостающий вызов)
            await this.updateObjectsForEvaluation();
            
            // НЕ обновляем таблицу здесь, так как она будет обновлена в updateInvestmentTable()
            // после расчёта доходности
            // Старый код удалён для исправления проблемы с отображением доходности

            // Карта обновляется в updateMapDisplay(), здесь дублирующий вызов убран
            // (данный вызов перезаписывал правильные адреса с activeObjects неправильными данными)

            // Обновляем график
            await this.updateMarketCorridorChart();
            

        } catch (error) {
            console.error('❌ FlippingProfitabilityManager: Ошибка обновления отображения объектов:', error);
        }
    }

    /**
     * Форматирование цены (скопировано из ComparativeAnalysisManager)
     */
    formatPrice(price) {
        if (!price) return '0 ₽';
        return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
    }

    /**
     * Форматирование характеристик объекта (скопировано из ComparativeAnalysisManager)
     */
    formatObjectCharacteristics(realEstateObject) {
        const parts = [];
        
        // Тип недвижимости
        if (realEstateObject.property_type) {
            const types = {
                'studio': 'Студия',
                '1k': '1-к',
                '2k': '2-к',
                '3k': '3-к',
                '4k+': '4-к+'
            };
            parts.push(types[realEstateObject.property_type] || realEstateObject.property_type);
            parts.push('квартира');
        }
        
        // Площади
        const areas = [];
        if (realEstateObject.area_total) areas.push(realEstateObject.area_total);
        if (realEstateObject.area_living) areas.push(realEstateObject.area_living);
        if (realEstateObject.area_kitchen) areas.push(realEstateObject.area_kitchen);
        if (areas.length > 0) parts.push(`${areas.join('/')}м²`);
        
        // Этаж/этажность
        if (realEstateObject.floor && realEstateObject.total_floors) {
            parts.push(`${realEstateObject.floor}/${realEstateObject.total_floors} эт.`);
        } else if (realEstateObject.floor && realEstateObject.floors_total) {
            // Поддержка старого поля floors_total для совместимости
            parts.push(`${realEstateObject.floor}/${realEstateObject.floors_total} эт.`);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Характеристики не указаны';
    }

    /**
     * Получение названия адреса по ID (скопировано из ComparativeAnalysisManager)
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses) return '';
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address : '';
    }

    /**
     * Скрытие отчёта
     */
    hide() {
        // ✅ ИСПРАВЛЕНО: Устанавливаем флаг уничтожения для защиты от асинхронных операций
        this.isDestroyed = true;
        
        // Очищаем график при скрытии
        if (this.marketCorridorChart) {
            try {
                // Проверяем что график может быть уничтожен
                if (this.marketCorridorChart.destroy && typeof this.marketCorridorChart.destroy === 'function') {
                    this.marketCorridorChart.destroy();
                }
            } catch (error) {
                console.warn('📊 Ошибка при уничтожении графика при скрытии:', error);
            }
            this.marketCorridorChart = null;
            
            // ✅ ИСПРАВЛЕНО: Принудительная очистка DOM элемента для устранения querySelector ошибок
            if (this.chartContainer) {
                this.chartContainer.innerHTML = '';
            }
        }
    }
    
    /**
     * Получение данных формы для расчёта доходности
     */
    getCurrentFormData() {
        // Для отладки выводим что содержится в currentFilters
        console.log('🔧 getCurrentFormData - currentFilters:', this.currentFilters);
        
        return {
            // Данные из фильтров
            profitabilityPercent: this.currentFilters.profitabilityPercent,
            participants: this.currentFilters.participants,
            profitSharing: this.currentFilters.profitSharing,
            flipperPercentage: this.currentFilters.flipperPercentage,
            investorPercentage: this.currentFilters.investorPercentage,
            fixedPaymentAmount: this.currentFilters.fixedPaymentAmount,
            fixedPlusPercentage: this.currentFilters.fixedPlusPercentage,
            
            // Параметры ремонта - берем из currentFilters
            renovationSpeed: this.currentFilters.renovationSpeed,
            renovationType: this.currentFilters.renovationType,
            workCost: this.currentFilters.workCost,
            materialsCost: this.currentFilters.materialsCost,
            additionalExpenses: this.currentFilters.additionalExpenses,
            taxType: this.currentFilters.taxType,
            
            // Параметры ипотеки - берем из currentFilters
            financing: this.currentFilters.financing,
            downPayment: this.currentFilters.downPayment,
            mortgageRate: this.currentFilters.mortgageRate,
            mortgageTerm: this.currentFilters.mortgageTerm
        };
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingProfitabilityManager;
}
