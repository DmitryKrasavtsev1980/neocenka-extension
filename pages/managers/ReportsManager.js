/**
 * Менеджер отчётов
 * Управляет панелью отчётов с графиками ликвидности и изменения цен
 */
class ReportsManager {
    constructor(areaPage) {
        this.areaPage = areaPage;
        this.database = window.db;
        this.eventBus = areaPage.eventBus;
        
        // Элементы интерфейса
        this.panelContainer = null;
        this.panelContent = null;
        this.panelHeader = null;
        this.panelChevron = null;
        
        // Фильтры
        this.segmentFilter = null;
        this.subsegmentFilter = null;
        this.dateFromFilter = null;
        this.dateToFilter = null;
        this.reportsDropdownBtn = null;
        this.reportsDropdown = null;
        this.reportsContent = null;
        
        // SlimSelect instances
        this.segmentSlimSelect = null;
        this.subsegmentSlimSelect = null;
        this.marketCorridorModeSlimSelect = null;
        this.reportFilterSlimSelect = null;

        // Элементы графика создания объявлений
        this.creationChartPeriod = null;
        this.creationChartSellerType = null;
        this.creationChartPeriodSlimSelect = null;
        this.creationChartSellerTypeSlimSelect = null;
        
        // Графики
        this.liquidityChart = null;
        this.priceChangesChart = null;
        this.marketCorridorChart = null;
        this.creationChart = null;
        
        // Данные
        this.segments = [];
        this.subsegments = [];
        this.currentSegment = null;
        this.currentSubsegment = null;
        
        // Режим коридора рынка
        this.marketCorridorMode = 'sales'; // 'sales' или 'history'
        
        // HTML Export Manager
        this.htmlExportManager = null;

        // DataTables
        this.savedReportsDataTable = null;
        this.filterTemplatesDataTable = null;
        
        // Флаги состояния
        this.isRestoringTemplate = false; // Предотвращает ненужные обработчики при восстановлении шаблона
        this.isInitializing = false; // Предотвращает повторные обновления во время инициализации

        this.debugEnabled = false;
    }

    /**
     * Инициализация менеджера отчётов
     */
    async initialize() {
        try {
            this.isInitializing = true; // Устанавливаем флаг инициализации

            if (this.debugEnabled) {
            }

            // Получение настроек отладки
            await this.loadDebugSettings();

            // Инициализация HTML Export Manager
            if (typeof HTMLExportManager !== 'undefined') {
                this.htmlExportManager = new HTMLExportManager();
                await this.htmlExportManager.init();
                if (this.debugEnabled) {
                }
            } else {
                console.warn('⚠️ ReportsManager: HTMLExportManager не найден');
            }

            // Инициализация FlippingProfitabilityManager
            if (typeof FlippingProfitabilityManager !== 'undefined') {
                // Проверяем, не был ли уже инициализирован
                if (!this.flippingProfitabilityManager) {
                    this.flippingProfitabilityManager = new FlippingProfitabilityManager(this);
                    await this.flippingProfitabilityManager.initialize();
                    if (this.debugEnabled) {
                        console.log('📊 ReportsManager: FlippingProfitabilityManager инициализирован');
                    }
                } else {
                    if (this.debugEnabled) {
                        console.log('📊 ReportsManager: FlippingProfitabilityManager уже инициализирован, пропускаем');
                    }
                }
            } else {
                console.warn('⚠️ ReportsManager: FlippingProfitabilityManager не найден');
            }

            // Инициализация элементов интерфейса
            this.initializeElements();
            
            // Установка обработчиков событий
            this.setupEventHandlers();
            
            // Инициализация SlimSelect
            this.initializeSlimSelects();
            
            // Загрузка данных сегментов
            await this.loadSegmentsData();
            
            // Установка значений по умолчанию для фильтров дат
            this.setDefaultDateFilters();
            
            // Установка значений по умолчанию для чекбоксов отчётов
            this.setDefaultReportsSettings();

            // Первоначальное обновление видимости отчётов происходит автоматически 
            // при инициализации фильтров, убираем дублирующий вызов
            // await this.updateReportsVisibility();
            
            // Инициализация DataTables для сохранённых отчётов
            await this.initializeSavedReportsDataTable();
            
            // Инициализация DataTables для шаблонов фильтров
            await this.initializeFilterTemplatesDataTable();
            
            // Инициализация интерфейса шаблонов фильтров
            await this.initFilterTemplates();

            if (this.debugEnabled) {
            }

            // Однократное обновление графиков после завершения инициализации
            await this.updateReportsVisibility();

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка инициализации:', error);
        } finally {
            this.isInitializing = false; // Снимаем флаг инициализации
        }
    }

    /**
     * Загрузка настроек отладки
     */
    async loadDebugSettings() {
        try {
            if (!this.database || !this.database.getSettings) {
                this.debugEnabled = false;
                return;
            }
            const settings = await this.database.getSettings();
            this.debugEnabled = settings?.find(s => s.key === 'debug_enabled')?.value || false;
        } catch (error) {
            console.error('❌ Ошибка загрузки настроек отладки:', error);
            this.debugEnabled = false;
        }
    }

    /**
     * Инициализация элементов интерфейса
     */
    initializeElements() {
        // Основные элементы панели
        this.panelContainer = document.getElementById('reportsPanelContainer');
        this.panelContent = document.getElementById('reportsPanelContent');
        this.panelHeader = document.getElementById('reportsPanelHeader');
        this.panelChevron = document.getElementById('reportsPanelChevron');
        
        // Элементы фильтров
        this.segmentFilter = document.getElementById('reportsSegmentFilter');
        this.subsegmentFilter = document.getElementById('reportsSubsegmentFilter');
        this.dateFromFilter = document.getElementById('reportsDateFrom');
        this.dateToFilter = document.getElementById('reportsDateTo');
        this.reportsDropdownBtn = document.getElementById('reportsDropdownBtn');
        this.reportsDropdown = document.getElementById('reportsDropdown');
        this.reportsContent = document.getElementById('reportsContent');

        // Элементы графика создания объявлений
        this.creationChartPeriod = document.getElementById('creationChartPeriod');
        this.creationChartSellerType = document.getElementById('creationChartSellerType');

        if (!this.panelContainer) {
            throw new Error('Элемент reportsPanelContainer не найден');
        }

        if (this.debugEnabled) {
        }
    }

    /**
     * Установка обработчиков событий
     */
    setupEventHandlers() {
        // Сворачивание/разворачивание панели теперь управляется UIManager
        // Старый обработчик удален для избежания конфликтов

        // Показать/скрыть выпадающий список отчётов
        if (this.reportsDropdownBtn) {
            this.reportsDropdownBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleReportsDropdown();
            });
        }

        // Показать/скрыть выпадающий список отчётов для шаблона
        const templateReportsToggleBtn = document.getElementById('templateReportsToggleBtn');
        const templateReportsDropdown = document.getElementById('templateReportsDropdown');

        if (templateReportsToggleBtn) {
            templateReportsToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                templateReportsDropdown?.classList.toggle('hidden');
            });
        }

        // Закрытие выпадающих списков при клике вне их
        document.addEventListener('click', (e) => {
            // Закрытие основного списка отчётов
            if (this.reportsDropdown && this.reportsDropdownBtn &&
                !this.reportsDropdownBtn.contains(e.target) &&
                !this.reportsDropdown.contains(e.target)) {
                this.reportsDropdown.classList.add('hidden');
            }

            // Закрытие списка отчётов для шаблона
            if (templateReportsDropdown && templateReportsToggleBtn &&
                !templateReportsToggleBtn.contains(e.target) &&
                !templateReportsDropdown.contains(e.target)) {
                templateReportsDropdown.classList.add('hidden');
            }
        });

        // Обработчики чекбоксов отчётов
        const liquidityCheck = document.getElementById('liquidityReportCheck');
        const priceChangesCheck = document.getElementById('priceChangesReportCheck');
        const marketCorridorCheck = document.getElementById('marketCorridorReportCheck');
        const comparativeAnalysisCheck = document.getElementById('comparativeAnalysisReportCheck');
        const flippingProfitabilityCheck = document.getElementById('flippingProfitabilityReportCheck');
        
        if (liquidityCheck) {
            liquidityCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
                this.checkForUnsavedChanges();
                this.saveReportsCheckboxState();
            });
        }
        
        if (priceChangesCheck) {
            priceChangesCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
                this.checkForUnsavedChanges();
                this.saveReportsCheckboxState();
            });
        }

        if (marketCorridorCheck) {
            marketCorridorCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
                this.checkForUnsavedChanges();
                this.saveReportsCheckboxState();
            });
        }

        if (comparativeAnalysisCheck) {
            comparativeAnalysisCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
                this.checkForUnsavedChanges();
                this.saveReportsCheckboxState();
            });
        }
        
        if (flippingProfitabilityCheck) {
            flippingProfitabilityCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
                this.checkForUnsavedChanges();
                this.saveReportsCheckboxState();
            });
        }

        // События SlimSelect будут обработаны после инициализации

        // Обработчики изменения фильтров дат
        if (this.dateFromFilter) {
            this.dateFromFilter.addEventListener('change', () => {
                this.updateReportsVisibility();
                this.checkForUnsavedChanges();
            });
        }

        if (this.dateToFilter) {
            this.dateToFilter.addEventListener('change', () => {
                this.updateReportsVisibility();
                this.checkForUnsavedChanges();
            });
        }

        // Кнопка сохранения текущего отчёта
        const saveCurrentReportBtn = document.getElementById('saveCurrentReportBtn');
        if (saveCurrentReportBtn) {
            saveCurrentReportBtn.addEventListener('click', () => {
                this.saveCurrentReport();
            });
        }

        // События EventBus
        this.eventBus.on(CONSTANTS.EVENTS.AREA_LOADED, (area) => {
            // Восстанавливаем состояние чекбоксов при загрузке области
            setTimeout(() => {
                this.restoreReportsCheckboxState();
            }, 100); // Небольшая задержка для инициализации элементов
        });

        this.eventBus.on(CONSTANTS.EVENTS.SEGMENTS_UPDATED, () => {
            this.loadSegmentsData();
        });

        this.eventBus.on(CONSTANTS.EVENTS.SUBSEGMENT_CREATED, () => {
            this.loadSegmentsData();
        });

        this.eventBus.on(CONSTANTS.EVENTS.SUBSEGMENT_UPDATED, () => {
            this.loadSegmentsData();
        });

        this.eventBus.on(CONSTANTS.EVENTS.SUBSEGMENT_DELETED, () => {
            this.loadSegmentsData();
        });

        if (this.debugEnabled) {
        }
    }

    /**
     * Инициализация SlimSelect
     */
    initializeSlimSelects() {
        try {
            // SlimSelect для сегментов создается в updateSegmentFilter после загрузки данных
            
            // Создаем SlimSelect для подсегментов сразу (в отключенном состоянии)
            if (this.subsegmentFilter && typeof SlimSelect !== 'undefined') {
                this.subsegmentSlimSelect = new SlimSelect({
                    select: this.subsegmentFilter,
                    settings: {
                        allowDeselect: true,
                        disabled: true,
                        placeholderText: 'Все подсегменты'
                    },
                    events: {
                        afterChange: (newVal) => {
                            // Пропускаем обработку если восстанавливается шаблон
                            if (this.isRestoringTemplate) return;
                            
                            const subsegmentId = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value : 
                                               (newVal && newVal.value !== undefined ? newVal.value : newVal);
                                            this.handleSubsegmentChange(subsegmentId);
                        }
                    }
                });
                
                if (this.debugEnabled) {
                }
            }

            // Создаем SlimSelect для переключателя режимов коридора рынка
            const marketCorridorModeSelect = document.getElementById('marketCorridorModeSelect');
            if (marketCorridorModeSelect && typeof SlimSelect !== 'undefined') {
                this.marketCorridorModeSlimSelect = new SlimSelect({
                    select: marketCorridorModeSelect,
                    settings: {
                        showSearch: false
                    },
                    events: {
                        afterChange: (newVal) => {
                            const mode = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value : 
                                        (newVal && newVal.value !== undefined ? newVal.value : newVal);
                            this.handleMarketCorridorModeChange(mode);
                        }
                    }
                });
                
                if (this.debugEnabled) {
                }
            }

            // Создаем SlimSelect для выбора шаблонов фильтров отчётов
            const reportFilterSelect = document.getElementById('reportFilterSelect');
            if (reportFilterSelect && typeof SlimSelect !== 'undefined') {
                this.reportFilterSlimSelect = new SlimSelect({
                    select: reportFilterSelect,
                    settings: {
                        allowDeselect: true,
                        showSearch: true,
                        searchText: 'Поиск шаблонов...',
                        searchPlaceholder: 'Введите название шаблона',
                        placeholderText: 'Создать новый фильтр'
                    },
                    events: {
                        afterChange: (newVal) => {
                            // Пропускаем обработку если восстанавливается шаблон
                            if (this.isRestoringTemplate) return;
                            
                            const templateId = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value : 
                                             (newVal && newVal.value !== undefined ? newVal.value : newVal);
                            this.onFilterTemplateSelect(templateId);
                        }
                    }
                });
                
                if (this.debugEnabled) {
                    console.log('🎯 ReportsManager: SlimSelect для reportFilterSelect инициализирован');
                }
            }

            // Создаем SlimSelect для фильтров графика создания объявлений
            if (this.creationChartPeriod && typeof SlimSelect !== 'undefined') {
                this.creationChartPeriodSlimSelect = new SlimSelect({
                    select: this.creationChartPeriod,
                    settings: {
                        showSearch: false
                    },
                    events: {
                        afterChange: (newVal) => {
                            const period = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value :
                                         (newVal && newVal.value !== undefined ? newVal.value : newVal);
                            this.updateCreationChart();
                        }
                    }
                });
            }

            if (this.creationChartSellerType && typeof SlimSelect !== 'undefined') {
                this.creationChartSellerTypeSlimSelect = new SlimSelect({
                    select: this.creationChartSellerType,
                    settings: {
                        showSearch: false
                    },
                    events: {
                        afterChange: (newVal) => {
                            const sellerType = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value :
                                             (newVal && newVal.value !== undefined ? newVal.value : newVal);
                            this.updateCreationChart();
                        }
                    }
                });
            }

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: Все SlimSelect инициализированы');
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка инициализации SlimSelect:', error);
        }
    }

    /**
     * Показать/скрыть выпадающий список отчётов
     */
    toggleReportsDropdown() {
        if (!this.reportsDropdown) return;

        this.reportsDropdown.classList.toggle('hidden');

        if (this.debugEnabled) {
        }
    }

    /**
     * Обновление видимости отчётов на основе выбранных чекбоксов
     */
    async updateReportsVisibility() {
        if (!this.reportsContent) return;

        const liquidityCheck = document.getElementById('liquidityReportCheck');
        const priceChangesCheck = document.getElementById('priceChangesReportCheck');
        const marketCorridorCheck = document.getElementById('marketCorridorReportCheck');
        const comparativeAnalysisCheck = document.getElementById('comparativeAnalysisReportCheck');
        const flippingProfitabilityCheck = document.getElementById('flippingProfitabilityReportCheck');
        
        const showLiquidity = liquidityCheck?.checked || false;
        const showPriceChanges = priceChangesCheck?.checked || false;
        const showMarketCorridor = marketCorridorCheck?.checked || false;
        const showComparativeAnalysis = comparativeAnalysisCheck?.checked || false;
        const showFlippingProfitability = flippingProfitabilityCheck?.checked || false;

        // Показать контейнер отчётов если выбран хотя бы один отчёт
        if (showLiquidity || showPriceChanges || showMarketCorridor || showComparativeAnalysis || showFlippingProfitability) {
            this.reportsContent.classList.remove('hidden');
            
            // Генерация только нужных отчётов
            await this.generateReports({
                showLiquidity,
                showPriceChanges,
                showMarketCorridor,
                showComparativeAnalysis,
                showFlippingProfitability
            });
            
            // Показать/скрыть конкретные отчёты
            const liquidityReport = document.querySelector('#liquidityChart').closest('.bg-white');
            const priceChangesReport = document.querySelector('#priceChangesChart').closest('.bg-white');
            const marketCorridorReport = document.querySelector('#marketCorridorChart').closest('.bg-white');
            const comparativeAnalysisReport = document.querySelector('#comparativeAnalysisContainer').closest('.bg-white');
            
            if (liquidityReport) {
                liquidityReport.style.display = showLiquidity ? 'block' : 'none';
            }
            
            if (priceChangesReport) {
                priceChangesReport.style.display = showPriceChanges ? 'block' : 'none';
            }

            if (marketCorridorReport) {
                marketCorridorReport.style.display = showMarketCorridor ? 'block' : 'none';
            }

            if (comparativeAnalysisReport) {
                comparativeAnalysisReport.style.display = showComparativeAnalysis ? 'block' : 'none';
            }

            // Найти отчёт "Доходность флиппинг"
            const flippingProfitabilityReport = document.querySelector('#flippingProfitabilityReport');
            if (flippingProfitabilityReport) {
                flippingProfitabilityReport.style.display = showFlippingProfitability ? 'block' : 'none';
            }

            // Управление интерфейсом сравнительного анализа
            if (showComparativeAnalysis && this.areaPage.comparativeAnalysisManager) {
                await this.areaPage.comparativeAnalysisManager.showComparativeAnalysis();
                // Безопасное обновление графика при активации панели
                await this.areaPage.comparativeAnalysisManager.onPanelActivated();
            } else if (!showComparativeAnalysis && this.areaPage.comparativeAnalysisManager) {
                this.areaPage.comparativeAnalysisManager.hideComparativeAnalysis();
            }

            // Управление интерфейсом доходности флиппинг
            if (!showFlippingProfitability && this.flippingProfitabilityManager) {
                this.flippingProfitabilityManager.hide();
            }
        } else {
            this.reportsContent.classList.add('hidden');
            
            // Скрываем сравнительный анализ если контейнер отчетов скрыт
            if (this.areaPage.comparativeAnalysisManager) {
                this.areaPage.comparativeAnalysisManager.hideComparativeAnalysis();
            }
            
            // Скрываем доходность флиппинг если контейнер отчетов скрыт
            if (this.flippingProfitabilityManager) {
                this.flippingProfitabilityManager.hide();
            }
        }

        // Обновляем график создания объявлений
        await this.updateCreationChart();

        if (this.debugEnabled) {
            console.log('📊 Настройки отчёта:', {
                showLiquidity,
                showPriceChanges,
                showMarketCorridor,
                showComparativeAnalysis
            });
        }
    }

    /**
     * Показать/скрыть отчёты (устаревший метод, заменен на updateReportsVisibility)
     */
    toggleReports() {
        // Показать все отчёты по умолчанию
        const liquidityCheck = document.getElementById('liquidityReportCheck');
        const priceChangesCheck = document.getElementById('priceChangesReportCheck');
        const marketCorridorCheck = document.getElementById('marketCorridorReportCheck');
        
        if (liquidityCheck) liquidityCheck.checked = true;
        if (priceChangesCheck) priceChangesCheck.checked = true;
        if (marketCorridorCheck) marketCorridorCheck.checked = true;
        
        this.updateReportsVisibility();
    }

    /**
     * Загрузка данных сегментов
     */
    async loadSegmentsData() {
        try {
            // Получаем текущую область через dataState (как в DuplicatesManager)
            const currentArea = this.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                if (this.debugEnabled) {
                }
                return;
            }

            if (!this.database) {
                if (this.debugEnabled) {
                }
                return;
            }

            // Используем тот же метод что и в DuplicatesManager
            this.segments = await this.database.getSegmentsByMapArea(currentArea.id);
            
            // Обновление списка сегментов
            this.updateSegmentFilter();

            if (this.debugEnabled) {
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка загрузки сегментов:', error);
            this.segments = [];
        }
    }

    /**
     * Обновление фильтра сегментов
     */
    updateSegmentFilter() {
        if (!this.segmentFilter) return;

        // Очищаем и заполняем опции (как в DuplicatesManager)
        this.segmentFilter.innerHTML = '';
        
        this.segments.forEach(segment => {
            const option = document.createElement('option');
            option.value = segment.id;
            option.textContent = segment.name;
            this.segmentFilter.appendChild(option);
        });

        // Пересоздаем SlimSelect с новыми данными
        if (this.segmentSlimSelect) {
            this.segmentSlimSelect.destroy();
        }

        if (this.segments.length > 0) {
            this.segmentSlimSelect = new SlimSelect({
                select: this.segmentFilter,
                settings: {
                    allowDeselect: true,
                    showSearch: false,
                    placeholderText: 'Выберите сегмент'
                },
                events: {
                    afterChange: (newVal) => {
                        // Пропускаем обработку если восстанавливается шаблон
                        if (this.isRestoringTemplate) return;
                        
                        // newVal может быть массивом или объектом, извлекаем значение
                        const segmentId = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value : 
                                         (newVal && newVal.value !== undefined ? newVal.value : newVal);
                                this.handleSegmentChange(segmentId);
                    }
                }
            });
            
            // Устанавливаем пустое значение по умолчанию
            this.segmentSlimSelect.setSelected([]);
        }

        if (this.debugEnabled) {
        }
    }

    /**
     * Обработка изменения сегмента (точно как в DuplicatesManager)
     */
    async handleSegmentChange(segmentId) {
        try {
            this.currentSegment = segmentId ? this.segments.find(s => s.id === segmentId || s.id === parseInt(segmentId)) : null;
            this.currentSubsegment = null;
            
            if (this.debugEnabled) {
            }
            
            if (!segmentId) {
                // Если сегмент не выбран, отключаем подсегменты и очищаем данные
                if (this.subsegmentSlimSelect) {
                    this.subsegmentSlimSelect.setData([{ text: 'Все подсегменты', value: '' }]);
                    this.subsegmentSlimSelect.enable(false);
                    this.subsegmentSlimSelect.setSelected([]);
                }
                this.subsegments = [];
            } else {
                // Загружаем подсегменты для выбранного сегмента
                const subsegments = await this.database.getSubsegmentsBySegment(segmentId);
                
                // Очищаем и заполняем опции подсегментов
                this.subsegmentFilter.innerHTML = '<option value="">Все подсегменты</option>';
                subsegments.forEach(subsegment => {
                    const option = document.createElement('option');
                    option.value = subsegment.id;
                    option.textContent = subsegment.name;
                    this.subsegmentFilter.appendChild(option);
                });
                
                
                // Обновляем существующий SlimSelect
                if (this.subsegmentSlimSelect) {
                    this.subsegmentSlimSelect.setData([
                        { text: 'Все подсегменты', value: '' },
                        ...subsegments.map(subsegment => ({ 
                            text: subsegment.name, 
                            value: subsegment.id.toString() 
                        }))
                    ]);
                    this.subsegmentSlimSelect.enable(true);
                }
                
                
                // Сохраняем подсегменты
                this.subsegments = subsegments;
            }

            
            // Обновляем отчёты при изменении сегмента (но не во время инициализации)
            if (!this.isInitializing) {
                await this.updateReportsVisibility();
            }
            
            // Проверяем несохранённые изменения
            this.checkForUnsavedChanges();
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка при изменении сегмента:', error);
        }
    }


    /**
     * Обработка изменения подсегмента
     */
    async handleSubsegmentChange(subsegmentId) {
        this.currentSubsegment = subsegmentId ? this.subsegments.find(s => s.id === subsegmentId || s.id === parseInt(subsegmentId)) : null;

        // Обновляем отчёты при изменении подсегмента (но не во время инициализации)
        if (!this.isInitializing) {
            await this.updateReportsVisibility();
        }
        
        // Проверяем несохранённые изменения
        this.checkForUnsavedChanges();

    }

    /**
     * Обработка изменения режима коридора рынка
     */
    async handleMarketCorridorModeChange(mode) {
        this.marketCorridorMode = mode;

        // Обновляем описание графика
        this.updateMarketCorridorDescription(mode);

        // Перестраиваем график коридора рынка если он уже создан
        if (this.marketCorridorChart) {
            await this.createMarketCorridorChart();
        }

        if (this.debugEnabled) {
        }
    }

    /**
     * Обновление описания графика в зависимости от режима
     */
    updateMarketCorridorDescription(mode) {
        const descriptionElement = document.getElementById('marketCorridorDescription');
        if (!descriptionElement) return;

        switch (mode) {
            case 'sales':
                descriptionElement.textContent = 'График отображает точки последних цен в объектах недвижимости. Архивные объекты показаны красным цветом на дату ухода с рынка, активные - синим на текущую дату.';
                break;
            case 'history':
                descriptionElement.textContent = 'График показывает полную историю изменения цен для активных объектов и последние цены архивных объектов (красным цветом). Каждая линия - один объект.';
                break;
            default:
                descriptionElement.textContent = 'График отображает точки последних цен в объектах недвижимости по вертикали, по горизонтали дата последнего обновления объекта недвижимости.';
        }
    }

    /**
     * Установка значений фильтров дат по умолчанию
     */
    setDefaultDateFilters() {
        if (!this.dateFromFilter || !this.dateToFilter) return;

        const now = new Date();
        const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        // Установка дат в формате YYYY-MM-DD
        this.dateFromFilter.value = yearAgo.toISOString().split('T')[0];
        this.dateToFilter.value = tomorrow.toISOString().split('T')[0];
    }

    /**
     * Установка значений по умолчанию для чекбоксов отчётов
     */
    setDefaultReportsSettings() {
        // Восстанавливаем сохранённые состояния чекбоксов отчётов
        this.restoreReportsCheckboxState();
    }
    
    /**
     * Сохранение состояния чекбоксов отчётов
     */
    saveReportsCheckboxState() {
        const currentArea = this.areaPage.dataState?.getState('currentArea');
        if (!currentArea) return;
        
        const checkboxStates = {
            liquidity: document.getElementById('liquidityReportCheck')?.checked || false,
            priceChanges: document.getElementById('priceChangesReportCheck')?.checked || false,
            marketCorridor: document.getElementById('marketCorridorReportCheck')?.checked || false,
            comparativeAnalysis: document.getElementById('comparativeAnalysisReportCheck')?.checked || false,
            flippingProfitability: document.getElementById('flippingProfitabilityReportCheck')?.checked || false
        };
        
        const stateKey = `reports_checkboxes_${currentArea.id}`;
        localStorage.setItem(stateKey, JSON.stringify(checkboxStates));
        
        if (this.debugEnabled) {
            console.log('💾 ReportsManager: Состояние чекбоксов сохранено:', checkboxStates);
        }
    }
    
    /**
     * Восстановление состояния чекбоксов отчётов
     */
    restoreReportsCheckboxState() {
        const currentArea = this.areaPage.dataState?.getState('currentArea');
        if (!currentArea) return;
        
        const stateKey = `reports_checkboxes_${currentArea.id}`;
        const savedState = localStorage.getItem(stateKey);
        
        if (savedState) {
            try {
                const checkboxStates = JSON.parse(savedState);
                
                // Восстанавливаем состояния чекбоксов
                const liquidityCheck = document.getElementById('liquidityReportCheck');
                const priceChangesCheck = document.getElementById('priceChangesReportCheck');
                const marketCorridorCheck = document.getElementById('marketCorridorReportCheck');
                const comparativeAnalysisCheck = document.getElementById('comparativeAnalysisReportCheck');
                const flippingProfitabilityCheck = document.getElementById('flippingProfitabilityReportCheck');
                
                if (liquidityCheck) liquidityCheck.checked = checkboxStates.liquidity;
                if (priceChangesCheck) priceChangesCheck.checked = checkboxStates.priceChanges;
                if (marketCorridorCheck) marketCorridorCheck.checked = checkboxStates.marketCorridor;
                if (comparativeAnalysisCheck) comparativeAnalysisCheck.checked = checkboxStates.comparativeAnalysis;
                if (flippingProfitabilityCheck) flippingProfitabilityCheck.checked = checkboxStates.flippingProfitability;
                
                if (this.debugEnabled) {
                    console.log('🔄 ReportsManager: Состояние чекбоксов восстановлено:', checkboxStates);
                }
            } catch (error) {
                console.error('❌ ReportsManager: Ошибка восстановления состояния чекбоксов:', error);
            }
        } else {
            if (this.debugEnabled) {
                console.log('💡 ReportsManager: Нет сохранённого состояния чекбоксов, используем настройки по умолчанию');
            }
            // По умолчанию все чекбоксы выключены (уже установлено в HTML)
        }
    }

    /**
     * Генерация отчётов с выборочным показом
     */
    async generateReports(options = {}) {
        try {
            // Настройки по умолчанию - показывать все отчёты (для обратной совместимости)
            const {
                showLiquidity = true,
                showPriceChanges = true,
                showMarketCorridor = true,
                showComparativeAnalysis = true,
                showFlippingProfitability = true
            } = options;

            // Получение данных для отчётов (только если нужен хотя бы один отчёт)
            let reportData = null;
            if (showLiquidity || showPriceChanges || showMarketCorridor) {
                reportData = await this.getReportData();
            }
            
            // Создание графика ликвидности (только если нужен)
            if (showLiquidity && reportData) {
                this.createLiquidityChart(reportData);
            }
            
            // Создание графика изменения цен (только если нужен)
            if (showPriceChanges && reportData) {
                this.createPriceChangesChart(reportData);
            }

            // Создание графика коридора рынка недвижимости (только если нужен)
            if (showMarketCorridor && reportData) {
                await this.createMarketCorridorChart(reportData);
            }

            // Показ отчёта флиппинг доходности (только если нужен)
            if (showFlippingProfitability && this.flippingProfitabilityManager) {
                await this.flippingProfitabilityManager.show();
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка генерации отчётов:', error);
        }
    }

    /**
     * Получение данных для отчётов
     */
    async getReportData() {
        try {
            // Получаем параметры фильтров
            const currentArea = this.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                if (this.debugEnabled) {
                }
                return this.getEmptyReportData();
            }

            const segmentId = this.currentSegment?.id;
            const subsegmentId = this.currentSubsegment?.id;
            const dateFrom = new Date(this.dateFromFilter?.value || '2023-01-01');
            const dateTo = new Date(this.dateToFilter?.value || new Date().toISOString().split('T')[0]);

            if (this.debugEnabled) {
                console.log('📊 Параметры получения объектов:', {
                    areaId: currentArea.id,
                    segmentId,
                    subsegmentId,
                    segmentName: this.currentSegment?.name || 'Вся область',
                    dateFrom: dateFrom.toISOString(),
                    dateTo: dateTo.toISOString()
                });
            }

            // Получаем объекты недвижимости с учётом фильтров
            const objects = await this.getFilteredRealEstateObjects(currentArea.id, segmentId, subsegmentId, dateFrom, dateTo);
            
            if (this.debugEnabled) {
            }

            // Группируем данные по месяцам и подготавливаем для отчётов
            const reportData = this.processObjectsForReports(objects, dateFrom, dateTo);

            return reportData;

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных отчётов:', error);
            return this.getEmptyReportData();
        }
    }

    /**
     * Получение отфильтрованных объектов недвижимости
     */
    async getFilteredRealEstateObjects(areaId, segmentId, subsegmentId, dateFrom, dateTo) {
        try {
            let objects = [];

            if (segmentId) {
                // ✅ ИСПРАВЛЕНО: Правильная логика фильтрации сегментов
                const segment = await this.database.getSegment(segmentId);
                if (!segment) {
                    if (this.debugEnabled) {
                    }
                    return [];
                }
                
                // Получаем все адреса в области сегмента
                const addresses = await this.database.getAddressesInMapArea(segment.map_area_id);
                
                // Фильтруем адреса по критериям сегмента (если есть)
                let filteredAddresses = addresses;
                if (segment.filters) {
                    filteredAddresses = this.filterAddressesBySegmentCriteria(addresses, segment.filters);
                }
                
                // Получаем все объекты для отфильтрованных адресов
                for (const address of filteredAddresses) {
                    const addressObjects = await this.database.getObjectsByAddress(address.id);
                    objects.push(...addressObjects);
                }
                
                if (subsegmentId) {
                    // Дополнительная фильтрация объектов по критериям подсегмента
                    const subsegment = await this.database.getSubsegment(subsegmentId);
                    
                    if (subsegment && subsegment.filters) {
                        const objectsBeforeFilter = objects.length;
                        objects = this.filterObjectsBySubsegment(objects, subsegment);
                    } else {
                    }
                }
                
                if (this.debugEnabled) {
                }
            } else {
                // Получаем все объекты в области
                const addresses = await this.database.getAddressesInMapArea(areaId);
                for (const address of addresses) {
                    const addressObjects = await this.database.getObjectsByAddress(address.id);
                    objects.push(...addressObjects);
                }
                
                if (this.debugEnabled) {
                }
            }

            // ✅ ИСПРАВЛЕНО: Включаем объекты с активностью в период
            objects = objects.filter(obj => {
                // Объект должен иметь хотя бы одну дату
                if (!obj.created && !obj.updated) return false;
                
                const createdDate = obj.created ? new Date(obj.created) : null;
                const updatedDate = obj.updated ? new Date(obj.updated) : null;
                
                // Включаем объект если:
                // 1. Создан В период, ИЛИ
                // 2. Обновлен В период (имел активность в период), ИЛИ
                // 3. Создан ДО периода но еще активен (для подсчета активных объектов)
                
                const createdInPeriod = createdDate && createdDate >= dateFrom && createdDate <= dateTo;
                const updatedInPeriod = updatedDate && updatedDate >= dateFrom && updatedDate <= dateTo;
                const createdBeforePeriod = createdDate && createdDate < dateFrom;
                
                const shouldInclude = createdInPeriod || updatedInPeriod || createdBeforePeriod;
                
                if (this.debugEnabled && !shouldInclude) {
                    console.log('📅 Объект исключён по датам:', {
                        created: createdDate?.toISOString(),
                        updated: updatedDate?.toISOString(),
                        dateFrom: dateFrom.toISOString(),
                        dateTo: dateTo.toISOString(),
                        obj: obj.id
                    });
                }
                
                return shouldInclude;
            });

            return objects;

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения объектов:', error);
            return [];
        }
    }

    /**
     * Фильтрация объектов по критериям подсегмента
     */
    /**
     * Фильтрация адресов по критериям сегмента (адаптировано из DuplicatesManager)
     */
    filterAddressesBySegmentCriteria(addresses, segmentFilters) {
        if (!segmentFilters) return addresses;
        
        return addresses.filter(address => {
            // Проверка типа дома
            if (segmentFilters.type && segmentFilters.type.length > 0) {
                if (!segmentFilters.type.includes(address.building_type)) {
                    return false;
                }
            }
            
            // Проверка списка конкретных адресов
            if (segmentFilters.addresses && Array.isArray(segmentFilters.addresses) && segmentFilters.addresses.length > 0) {
                if (!segmentFilters.addresses.includes(address.id)) {
                    return false;
                }
            }
            
            // Другие критерии сегментов можно добавить здесь
            // (площадь дома, количество этажей и т.д.)
            
            return true;
        });
    }

    /**
     * Фильтрация объектов по критериям подсегмента
     */
    filterObjectsBySubsegment(objects, subsegment) {
        if (!subsegment.filters) return objects;

        return objects.filter(obj => {
            const criteria = subsegment.filters;
            
            // Фильтр по типу недвижимости (количество комнат)
            if (criteria.property_type && criteria.property_type.length > 0) {
                if (!criteria.property_type.includes(obj.property_type)) return false;
            }

            // Фильтр по этажам
            if (criteria.floor_from && obj.floor < criteria.floor_from) return false;
            if (criteria.floor_to && obj.floor > criteria.floor_to) return false;

            // Фильтр по площади
            if (criteria.area_from && obj.area_total < criteria.area_from) return false;
            if (criteria.area_to && obj.area_total > criteria.area_to) return false;

            // Фильтр по цене
            if (criteria.price_from && obj.current_price < criteria.price_from) return false;
            if (criteria.price_to && obj.current_price > criteria.price_to) return false;

            return true;
        });
    }

    /**
     * Обработка объектов для формирования данных отчётов
     */
    processObjectsForReports(objects, dateFrom, dateTo) {
        // Создаём массив месяцев в периоде
        const months = this.generateMonthsArray(dateFrom, dateTo);
        
        // Если нет периода, создаем минимальный период (текущий месяц)
        if (months.length === 0) {
            const currentDate = new Date();
            months.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
        }
        
        // Инициализируем структуру данных
        const reportData = {
            new: new Array(months.length).fill(0),
            close: new Array(months.length).fill(0),
            active: new Array(months.length).fill(0),
            averageСost: new Array(months.length).fill(0),
            averageСostMeter: new Array(months.length).fill(0),
            averageСostArchive: new Array(months.length).fill(0),
            averageСostMeterArchive: new Array(months.length).fill(0),
            datetime: months.map(date => {
                // ApexCharts требует формат YYYY-MM-DD или timestamp
                return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-01';
            })
        };

        // ✅ ИСПРАВЛЕНО: Правильный подсчет новых объектов
        // Подсчитываем ВСЕ объекты, созданные в каждом месяце (независимо от статуса)
        objects.forEach(obj => {
            const createdDate = new Date(obj.created);
            const monthIndex = this.getMonthIndex(createdDate, months);
            
            if (monthIndex >= 0 && obj.created) {
                // Новые объекты - ВСЕ созданные в этом месяце
                reportData.new[monthIndex]++;
            }
        });

        // ✅ ИСПРАВЛЕНО: Правильный подсчет ушедших с рынка
        // Подсчитываем объекты со статусом "Архив" по дате обновления
        objects.forEach(obj => {
            if (obj.status === 'archive' && obj.updated) {
                const closeDate = new Date(obj.updated);
                const monthIndex = this.getMonthIndex(closeDate, months);
                if (monthIndex >= 0) {
                    reportData.close[monthIndex]++;
                }
            }
        });

        // ✅ ИСПРАВЛЕНО: Правильный подсчет активных объектов на начало месяца
        months.forEach((month, index) => {
            // Подсчитываем объекты, которые были активны на начало месяца
            const activeAtMonthStart = objects.filter(obj => {
                if (!obj.created) return false;
                
                const createdDate = new Date(obj.created);
                const updatedDate = obj.updated ? new Date(obj.updated) : null;
                
                // Объект должен быть создан ДО начала месяца
                if (createdDate >= month) return false;
                
                // Если объект архивный, проверяем когда он стал архивным
                if (obj.status === 'archive') {
                    // Если есть дата обновления и она ДО начала месяца - объект уже был архивным
                    if (updatedDate && updatedDate < month) {
                        return false;
                    }
                    // Если дата обновления ПОСЛЕ начала месяца - объект еще был активен на начало месяца
                    return true;
                }
                
                // Активные объекты
                return obj.status === 'active';
            }).length;
            
            reportData.active[index] = activeAtMonthStart;
        });

        // ✅ ИСПРАВЛЕНО: Подсчитываем средние цены на начало каждого месяца
        months.forEach((month, index) => {
            // Находим АКТИВНЫЕ объекты на начало месяца
            const activeObjects = objects.filter(obj => {
                if (!obj.created || obj.status === 'archive') return false;
                
                const createdDate = new Date(obj.created);
                const updatedDate = obj.updated ? new Date(obj.updated) : new Date(); // Если нет updated - объект еще активен
                
                // Объект активен на начало месяца если: created <= начало_месяца < updated
                return createdDate <= month && month < updatedDate;
            });

            // Находим АРХИВНЫЕ объекты на начало месяца
            const archiveObjects = objects.filter(obj => {
                if (!obj.created || obj.status !== 'archive') return false;
                
                const createdDate = new Date(obj.created);
                const updatedDate = obj.updated ? new Date(obj.updated) : new Date();
                
                // Архивный объект был активен на начало месяца если: created <= начало_месяца < updated
                return createdDate <= month && month < updatedDate;
            });

            // Обрабатываем АКТИВНЫЕ объекты
            if (activeObjects.length > 0) {
                const pricesAtMonth = [];
                const pricesPerMeterAtMonth = [];

                activeObjects.forEach(obj => {
                    // Находим цену объекта на начало месяца из истории цен
                    const priceAtMonth = this.getPriceAtDate(obj, month);
                    const pricePerMeterAtMonth = this.getPricePerMeterAtDate(obj, month);
                    
                    if (priceAtMonth > 0) {
                        pricesAtMonth.push(priceAtMonth);
                    }
                    
                    if (pricePerMeterAtMonth > 0) {
                        pricesPerMeterAtMonth.push(pricePerMeterAtMonth);
                    }
                });

                // Вычисляем средние цены для активных объектов
                if (pricesAtMonth.length > 0) {
                    const totalPrice = pricesAtMonth.reduce((sum, price) => sum + price, 0);
                    reportData.averageСost[index] = Math.round(totalPrice / pricesAtMonth.length);
                }

                if (pricesPerMeterAtMonth.length > 0) {
                    const totalPricePerMeter = pricesPerMeterAtMonth.reduce((sum, price) => sum + price, 0);
                    reportData.averageСostMeter[index] = Math.round(totalPricePerMeter / pricesPerMeterAtMonth.length);
                }
            }

            // Обрабатываем АРХИВНЫЕ объекты
            if (archiveObjects.length > 0) {
                const pricesAtMonthArchive = [];
                const pricesPerMeterAtMonthArchive = [];

                archiveObjects.forEach(obj => {
                    // Находим цену архивного объекта на начало месяца из истории цен
                    const priceAtMonth = this.getPriceAtDate(obj, month);
                    const pricePerMeterAtMonth = this.getPricePerMeterAtDate(obj, month);
                    
                    if (priceAtMonth > 0) {
                        pricesAtMonthArchive.push(priceAtMonth);
                    }
                    
                    if (pricePerMeterAtMonth > 0) {
                        pricesPerMeterAtMonthArchive.push(pricePerMeterAtMonth);
                    }
                });

                // Вычисляем средние цены для архивных объектов
                if (pricesAtMonthArchive.length > 0) {
                    const totalPriceArchive = pricesAtMonthArchive.reduce((sum, price) => sum + price, 0);
                    reportData.averageСostArchive[index] = Math.round(totalPriceArchive / pricesAtMonthArchive.length);
                }

                if (pricesPerMeterAtMonthArchive.length > 0) {
                    const totalPricePerMeterArchive = pricesPerMeterAtMonthArchive.reduce((sum, price) => sum + price, 0);
                    reportData.averageСostMeterArchive[index] = Math.round(totalPricePerMeterArchive / pricesPerMeterAtMonthArchive.length);
                }
            }
        });

        if (this.debugEnabled) {
            console.log('📈 Данные отчёта по месяцам:', {
                months: reportData.datetime,
                new: reportData.new,
                close: reportData.close,
                active: reportData.active,
                averageСost: reportData.averageСost,
                averageСostMeter: reportData.averageСostMeter,
                averageСostArchive: reportData.averageСostArchive,
                averageСostMeterArchive: reportData.averageСostMeterArchive,
                totalObjects: objects.length
            });
        }

        return reportData;
    }

    /**
     * Генерация массива месяцев в заданном периоде
     */
    generateMonthsArray(dateFrom, dateTo) {
        const months = [];
        const current = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
        const end = new Date(dateTo.getFullYear(), dateTo.getMonth(), 1);

        while (current <= end) {
            months.push(new Date(current));
            current.setMonth(current.getMonth() + 1);
        }

        return months;
    }

    /**
     * Получение индекса месяца в массиве
     */
    getMonthIndex(date, months) {
        return months.findIndex(month => this.isSameMonth(date, month));
    }

    /**
     * Проверка совпадения месяца и года
     */
    isSameMonth(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() && 
               date1.getMonth() === date2.getMonth();
    }

    /**
     * Возвращает пустую структуру данных отчётов
     */
    getEmptyReportData() {
        // Создаем данные для одного месяца, чтобы избежать ошибок ApexCharts
        const currentDate = new Date();
        const dateStr = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-01';
        
        return {
            new: [0],
            close: [0],
            active: [0],
            averageСost: [0],
            averageСostMeter: [0],
            averageСostArchive: [0],
            averageСostMeterArchive: [0],
            datetime: [dateStr]
        };
    }

    /**
     * Создание графика ликвидности
     */
    createLiquidityChart(data) {
        try {
            // Проверяем наличие данных
            if (!data || !data.datetime || data.datetime.length === 0) {
                document.getElementById('liquidityChart').innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
                return;
            }

            const options = {
                series: [
                    {
                        name: 'Новые',
                        type: 'column',
                        data: data['new']
                    },
                    {
                        name: 'Ушедшие с рынка',
                        type: 'column',
                        data: data['close']
                    },
                    {
                        name: 'Активных на начало месяца',
                        type: 'line',
                        data: data['active']
                    }
                ],
                colors: ['#60ba5d', '#bd5f5f', '#629bc2'],
                chart: {
                    height: 350,
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
                    zoom: {
                        enabled: true
                    }
                },
                responsive: [{
                    breakpoint: 480,
                    options: {
                        legend: {
                            position: 'bottom',
                            offsetX: -10,
                            offsetY: 0
                        }
                    }
                }],
                dataLabels: {
                    enabled: true,
                },
                plotOptions: {
                    bar: {
                        borderRadius: 8,
                        horizontal: false,
                    },
                },
                xaxis: {
                    type: 'datetime',
                    categories: data['datetime'],
                },
                legend: {
                    position: 'bottom'
                },
                fill: {
                    opacity: 1
                }
            };

            document.getElementById('liquidityChart').innerHTML = '';
            this.liquidityChart = new ApexCharts(document.querySelector("#liquidityChart"), options);
            this.liquidityChart.render();

            if (this.debugEnabled) {
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка создания графика ликвидности:', error);
        }
    }

    /**
     * Создание графика изменения цен
     */
    createPriceChangesChart(data) {
        try {
            // Проверяем наличие данных
            if (!data || !data.datetime || data.datetime.length === 0) {
                document.getElementById('priceChangesChart').innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
                return;
            }


            const options = {
                series: [
                    {
                        name: 'Средняя цена квадратного метра (Активные)',
                        type: 'column',
                        data: data['averageСostMeter']
                    },
                    {
                        name: 'Средняя цена объекта (Активные)',
                        type: 'line',
                        data: data['averageСost']
                    },
                    {
                        name: 'Средняя цена квадратного метра (Архив)',
                        type: 'column',
                        data: data['averageСostMeterArchive']
                    },
                    {
                        name: 'Средняя цена объекта (Архив)',
                        type: 'line',
                        data: data['averageСostArchive']
                    }
                ],
                colors: ['#60ba5d', '#629bc2', '#ff9800', '#e91e63'],
                chart: {
                    height: 350,
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
                    zoom: {
                        enabled: true
                    }
                },
                stroke: {
                    width: [0, 4]
                },
                title: {
                    text: 'Средние значения цен'
                },
                dataLabels: {
                    enabled: false,
                },
                xaxis: {
                    type: 'datetime',
                    categories: data['datetime'],
                },
                yaxis: [
                    {
                        seriesName: ['Средняя цена квадратного метра (Активные)', 'Средняя цена квадратного метра (Архив)'],
                        title: {
                            text: 'Средняя цена квадратного метра',
                        },
                        labels: {
                            formatter: function (val) {
                                return new Intl.NumberFormat('ru-RU').format(val);
                            }
                        }
                    },
                    {
                        seriesName: ['Средняя цена объекта (Активные)', 'Средняя цена объекта (Архив)'],
                        opposite: true,
                        title: {
                            text: 'Средняя цена объекта'
                        },
                        labels: {
                            formatter: function (val) {
                                return new Intl.NumberFormat('ru-RU').format(val);
                            }
                        }
                    }
                ]
            };

            document.getElementById('priceChangesChart').innerHTML = '';
            this.priceChangesChart = new ApexCharts(document.querySelector("#priceChangesChart"), options);
            this.priceChangesChart.render();

            if (this.debugEnabled) {
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка создания графика изменения цен:', error);
        }
    }

    /**
     * Создание графика коридора рынка недвижимости
     */
    async createMarketCorridorChart(data) {
        try {
            // Получаем данные для графика коридора из базы данных
            const pointsData = await this.getMarketCorridorData();
            
            // Проверяем наличие данных
            if (!pointsData || !pointsData.series || pointsData.series.length === 0 || pointsData.series[0].data.length === 0) {
                document.getElementById('marketCorridorChart').innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
                return;
            }
            
            const options = {
                chart: {
                    height: 600,
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
                        
                        // Получаем данные точки из сохраненного массива через this
                        const reportsManager = window.reportsManagerInstance; // Временное решение
                        
                        let point = null;
                        
                        if (reportsManager && reportsManager.currentPointsData) {
                            if (reportsManager.marketCorridorMode === 'history') {
                                // В режиме истории нужно найти соответствующую точку по координатам
                                const seriesData = w.config.series[seriesIndex];
                                if (seriesData && seriesData.data && seriesData.data[dataPointIndex]) {
                                    const [timestamp, price] = seriesData.data[dataPointIndex];
                                    
                                    // Ищем точку с такими же координатами в сохраненных данных
                                    point = reportsManager.currentPointsData.find(p => 
                                        Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                                    );
                                }
                            } else {
                                // В режиме коридора продаж используем серии-маппинг
                                if (reportsManager.currentSeriesDataMapping && 
                                    reportsManager.currentSeriesDataMapping[seriesIndex] && 
                                    reportsManager.currentSeriesDataMapping[seriesIndex][dataPointIndex]) {
                                    
                                    point = reportsManager.currentSeriesDataMapping[seriesIndex][dataPointIndex];
                                    
                                } else {
                                    // Fallback - ищем по координатам
                                    const seriesData = w.config.series[seriesIndex];
                                    if (seriesData && seriesData.data && seriesData.data[dataPointIndex]) {
                                        const [timestamp, price] = seriesData.data[dataPointIndex];
                                        
                                        point = reportsManager.currentPointsData.find(p => 
                                            Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                                        );
                                    }
                                }
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
                yaxis: {
                    min: pointsData.minPrice,
                    max: pointsData.maxPrice,
                    title: {
                        text: 'Цена'
                    }
                },
                grid: {
                    show: true,
                    position: 'back',
                    xaxis: {
                        lines: {
                            show: true
                        }
                    },
                    yaxis: {
                        lines: {
                            show: true
                        }
                    },
                    borderColor: '#eeeeee'
                },
                legend: {
                    show: true
                },
                responsive: [{
                    breakpoint: 600,
                    options: {
                        chart: {
                            toolbar: {
                                show: true
                            }
                        },
                        legend: {
                            show: true
                        }
                    }
                }]
            };

            document.getElementById('marketCorridorChart').innerHTML = '';
            this.marketCorridorChart = new ApexCharts(document.querySelector("#marketCorridorChart"), options);
            
            // Сохраняем данные точек для использования в обработчиках
            this.currentPointsData = pointsData.pointsData;
            
            // Сохраняем маппинг серий к данным для корректной обработки кликов
            this.currentSeriesDataMapping = pointsData.seriesDataMapping;
            
            // Создаем глобальную ссылку для tooltip
            window.reportsManagerInstance = this;
            
            this.marketCorridorChart.render();

            if (this.debugEnabled) {
                console.log('📊 Рендеринг рыночного коридора:', {
                    pointsCount: pointsData.pointsData.length,
                    samplePoint: pointsData.pointsData[0],
                    globalInstance: !!window.reportsManagerInstance
                });
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка создания графика коридора рынка:', error);
        }
    }

    /**
     * Получение данных для графика коридора рынка из базы данных
     */
    async getMarketCorridorData() {
        try {
            // Получаем параметры фильтров
            const currentArea = this.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                return this.getEmptyMarketCorridorData();
            }

            const segmentId = this.currentSegment?.id;
            const subsegmentId = this.currentSubsegment?.id;
            const dateFrom = new Date(this.dateFromFilter?.value || '2023-01-01');
            const dateTo = new Date(this.dateToFilter?.value || new Date().toISOString().split('T')[0]);

            // Получаем объекты недвижимости с учётом фильтров
            const objects = await this.getFilteredRealEstateObjects(currentArea.id, segmentId, subsegmentId, dateFrom, dateTo);
            
            if (objects.length === 0) {
                return this.getEmptyMarketCorridorData();
            }

            // ✅ ИСПРАВЛЕНО: Подготавливаем данные для коридора рынка в зависимости от режима
            const activePointsData = [];
            const archivePointsData = [];
            
            objects.forEach(obj => {
                if (obj.current_price <= 0) return;
                
                if (obj.status === 'archive') {
                    // Архивные объекты: последняя цена на дату ухода с рынка (всегда одна точка)
                    if (obj.updated) {
                        archivePointsData.push({
                            x: new Date(obj.updated).getTime(),
                            y: obj.current_price,
                            // Дополнительные данные для tooltip и модального окна
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
                        // Режим "История активных" - используем алгоритм из модального окна
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
            
            // Сортируем данные по дате
            activePointsData.sort((a, b) => a.x - b.x);
            archivePointsData.sort((a, b) => a.x - b.x);

            // Вычисляем минимальную и максимальную цены для оси Y
            const allPrices = [...activePointsData, ...archivePointsData].map(point => point.y);
            const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
            const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;

            // Добавляем небольшой отступ для лучшего отображения
            const priceRange = maxPrice - minPrice;
            const padding = priceRange * 0.1; // 10% отступ

            // Формируем серии данных с разными цветами
            const series = [];
            const colors = [];
            const seriesDataMapping = []; // Маппинг серий к данным
            
            if (this.marketCorridorMode === 'history') {
                // В режиме истории группируем активные объекты по ID для создания отдельных линий
                const activeObjectsGrouped = {};
                activePointsData.forEach(point => {
                    if (!activeObjectsGrouped[point.objectId]) {
                        activeObjectsGrouped[point.objectId] = {
                            name: `Объект #${point.objectId}`,
                            data: [],
                            color: '#56c2d6'
                        };
                    }
                    activeObjectsGrouped[point.objectId].data.push([point.x, point.y]);
                });
                
                // Добавляем каждый объект как отдельную серию
                Object.values(activeObjectsGrouped).forEach(objectSeries => {
                    // Сортируем данные по дате для правильного соединения линий
                    objectSeries.data.sort((a, b) => a[0] - b[0]);
                    // Явно указываем тип линии для активных объектов в режиме истории
                    objectSeries.type = 'line';
                    series.push(objectSeries);
                    colors.push('#56c2d6');
                });
                
                // Архивные объекты показываем как отдельные точки
                if (archivePointsData.length > 0) {
                    series.push({
                        name: 'Архивные объекты',
                        data: archivePointsData.map(point => [point.x, point.y]),
                        type: 'scatter' // Точки без линий
                    });
                    colors.push('#dc2626');
                }
            } else {
                // В режиме коридора продаж - обычные scatter точки
                if (activePointsData.length > 0) {
                    const seriesIndex = series.length;
                    series.push({
                        name: 'Активные объекты',
                        data: activePointsData.map(point => [point.x, point.y])
                    });
                    colors.push('#56c2d6'); // Синий цвет для активных
                    seriesDataMapping[seriesIndex] = activePointsData; // Прямой маппинг
                }
                
                if (archivePointsData.length > 0) {
                    const seriesIndex = series.length;
                    series.push({
                        name: 'Архивные объекты',
                        data: archivePointsData.map(point => [point.x, point.y])
                    });
                    colors.push('#dc2626'); // Красный цвет для архивных
                    seriesDataMapping[seriesIndex] = archivePointsData; // Прямой маппинг
                }
            }

            return {
                series: series,
                colors: colors,
                minPrice: Math.max(0, minPrice - padding),
                maxPrice: maxPrice + padding,
                pointsData: [...activePointsData, ...archivePointsData].sort((a, b) => a.x - b.x), // Сортируем ВСЕ данные по времени
                seriesDataMapping: seriesDataMapping // Прямой маппинг серий к данным
            };

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных коридора рынка:', error);
            return this.getEmptyMarketCorridorData();
        }
    }

    /**
     * Подготовка данных истории цен объекта для графика (копия из DuplicatesManager)
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
     * Возвращает пустые данные для графика коридора рынка
     */
    getEmptyMarketCorridorData() {
        return {
            series: [{
                name: 'Объекты недвижимости',
                data: []
            }],
            colors: ['#56c2d6'],
            minPrice: 0,
            maxPrice: 1000000
        };
    }

    /**
     * Получение цены объекта на конкретную дату из истории цен
     * @param {Object} obj - объект недвижимости
     * @param {Date} targetDate - целевая дата
     * @returns {number} - цена на указанную дату
     */
    getPriceAtDate(obj, targetDate) {
        try {
            // Если нет истории цен, используем текущую цену
            if (!obj.price_history || !Array.isArray(obj.price_history) || obj.price_history.length === 0) {
                return obj.current_price || 0;
            }

            // Сортируем историю по дате (по возрастанию)
            const sortedHistory = [...obj.price_history].sort((a, b) => {
                const dateA = new Date(a.date || a.timestamp || a.created);
                const dateB = new Date(b.date || b.timestamp || b.created);
                return dateA - dateB;
            });

            // Ищем последнюю цену ДО или НА целевую дату
            let priceAtDate = null;
            for (const priceEntry of sortedHistory) {
                const entryDate = new Date(priceEntry.date || priceEntry.timestamp || priceEntry.created);
                if (entryDate <= targetDate) {
                    priceAtDate = priceEntry.price || priceEntry.current_price || 0;
                } else {
                    break; // Прекращаем поиск, так как дошли до даты после целевой
                }
            }

            // Если не найдена цена до целевой даты, берем первую доступную
            if (priceAtDate === null && sortedHistory.length > 0) {
                priceAtDate = sortedHistory[0].price || sortedHistory[0].current_price || 0;
            }

            // Если все еще нет цены, используем текущую
            return priceAtDate || obj.current_price || 0;

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения цены на дату:', error);
            return obj.current_price || 0;
        }
    }

    /**
     * Обработка клика по точке на графике коридора рынка
     * @param {Event} event - событие клика
     * @param {Object} chartContext - контекст графика
     * @param {Object} config - конфигурация точки
     */
    handleMarketCorridorPointClick(event, chartContext, config) {
        try {
            let point = null;
            
            if (config && config.dataPointIndex >= 0 && config.seriesIndex >= 0) {
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
                    // В режиме коридора продаж используем серии-маппинг
                    if (this.currentSeriesDataMapping && 
                        this.currentSeriesDataMapping[config.seriesIndex] && 
                        this.currentSeriesDataMapping[config.seriesIndex][config.dataPointIndex]) {
                        
                        point = this.currentSeriesDataMapping[config.seriesIndex][config.dataPointIndex];
                        
                    } else {
                        // Fallback - ищем по координатам
                        if (this.marketCorridorChart) {
                            const seriesData = this.marketCorridorChart.w.config.series[config.seriesIndex];
                            if (seriesData && seriesData.data && seriesData.data[config.dataPointIndex]) {
                                const [timestamp, price] = seriesData.data[config.dataPointIndex];
                                
                                point = this.currentPointsData.find(p => 
                                    Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                                );
                            }
                        }
                    }
                }
            }
            
            if (point) {
                // Открываем существующее модальное окно просмотра объекта
                this.showObjectDetails(point.objectId);
            }
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка обработки клика по точке:', error);
        }
    }

    /**
     * Показать детали объекта недвижимости (использует существующее модальное окно)
     * @param {string} objectId - ID объекта
     */
    async showObjectDetails(objectId) {
        try {
            // Используем метод из DuplicatesManager через areaPage
            if (this.areaPage && this.areaPage.duplicatesManager && this.areaPage.duplicatesManager.showObjectDetails) {
                await this.areaPage.duplicatesManager.showObjectDetails(objectId);
            } else {
                console.error('❌ ReportsManager: DuplicatesManager недоступен для показа деталей объекта');
                
                // Fallback - показываем простое уведомление
                alert(`Просмотр объекта: ${objectId}\n\nДля полного просмотра откройте панель "Управление дублями"`);
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка показа деталей объекта:', error);
        }
    }

    /**
     * Получение цены за м² объекта на конкретную дату из истории цен
     * @param {Object} obj - объект недвижимости
     * @param {Date} targetDate - целевая дата
     * @returns {number} - цена за м² на указанную дату
     */
    getPricePerMeterAtDate(obj, targetDate) {
        try {
            // Получаем цену на дату
            const priceAtDate = this.getPriceAtDate(obj, targetDate);
            
            // Если есть площадь, вычисляем цену за м²
            if (priceAtDate > 0 && obj.area_total > 0) {
                return Math.round(priceAtDate / obj.area_total);
            }

            // Если в истории есть готовое значение price_per_meter, используем его
            if (obj.price_history && Array.isArray(obj.price_history)) {
                const sortedHistory = [...obj.price_history].sort((a, b) => {
                    const dateA = new Date(a.date || a.timestamp || a.created);
                    const dateB = new Date(b.date || b.timestamp || b.created);
                    return dateA - dateB;
                });

                let pricePerMeterAtDate = null;
                for (const priceEntry of sortedHistory) {
                    const entryDate = new Date(priceEntry.date || priceEntry.timestamp || priceEntry.created);
                    if (entryDate <= targetDate && (priceEntry.price_per_meter || priceEntry.pricePerMeter)) {
                        pricePerMeterAtDate = priceEntry.price_per_meter || priceEntry.pricePerMeter;
                    } else if (entryDate > targetDate) {
                        break;
                    }
                }

                if (pricePerMeterAtDate) {
                    return pricePerMeterAtDate;
                }
            }

            // Fallback к текущему значению
            return obj.price_per_meter || 0;

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения цены за м² на дату:', error);
            return obj.price_per_meter || 0;
        }
    }

    /**
     * Показать панель
     */
    showPanel() {
        if (this.panelContainer) {
            this.panelContainer.style.display = 'block';
        }
    }

    /**
     * Скрыть панель
     */
    hidePanel() {
        if (this.panelContainer) {
            this.panelContainer.style.display = 'none';
        }
    }

    /**
     * Инициализация DataTables для сохранённых отчётов
     */
    async initializeSavedReportsDataTable() {
        try {
            // Глобальная переменная для доступа из HTML
            window.reportsManager = this;

            // Проверяем существование элемента таблицы
            if (!document.getElementById('savedReportsTable')) {
                console.warn('⚠️ ReportsManager: Элемент savedReportsTable не найден');
                return;
            }

            // Уничтожаем существующий экземпляр если есть
            if ($.fn.DataTable.isDataTable('#savedReportsTable')) {
                $('#savedReportsTable').DataTable().destroy();
            }

            // Инициализация DataTable с пустыми данными
            this.savedReportsDataTable = $('#savedReportsTable').DataTable({
                language: {
                    url: '../libs/datatables/ru.json'
                },
                pageLength: 10,
                responsive: true,
                order: [[1, 'desc']], // Сортировка по дате создания (новые сверху)
                columnDefs: [
                    { orderable: false, targets: [2] }, // Отключаем сортировку для столбца "Действия"
                    { width: "50%", targets: 0 }, // Название
                    { width: "30%", targets: 1 }, // Дата создания
                    { width: "20%", targets: 2 }  // Действия
                ],
                data: [], // Пустые данные при инициализации
                columns: [
                    { title: 'Название' },
                    { title: 'Создан' },
                    { title: 'Действия' }
                ]
            });
            
            // Изначально таблица пустая - отчёты загружаются только при выборе шаблона
            // await this.loadSavedReportsData(); // Убираем начальную загрузку всех отчётов

            // Скрываем лоадер и показываем таблицу
            $('#savedReportsLoader').hide();
            $('#savedReportsTable').show();
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка инициализации DataTables для отчётов:', error);
            // В случае ошибки тоже скрываем лоадер
            $('#savedReportsLoader').hide();
        }
    }

    /**
     * Инициализация DataTable для шаблонов фильтров
     */
    async initializeFilterTemplatesDataTable() {
        try {
            // Проверяем существование элемента таблицы
            if (!document.getElementById('filterTemplatesTable')) {
                if (this.debugEnabled) {
                    console.warn('⚠️ ReportsManager: Элемент filterTemplatesTable не найден');
                }
                return;
            }
            
            // Инициализация DataTable с пустыми данными
            this.filterTemplatesDataTable = $('#filterTemplatesTable').DataTable({
                language: {
                    url: '../libs/datatables/ru.json'
                },
                pageLength: 5,
                responsive: true,
                order: [[5, 'desc']], // Сортировка по дате создания (новые сверху)
                columnDefs: [
                    { orderable: false, targets: [6] }, // Отключаем сортировку для столбца "Действия"
                    { orderable: false, targets: [4] }, // Отключаем сортировку для столбца "Отчёты"
                    { width: "20%", targets: 0 }, // Название
                    { width: "15%", targets: 1 }, // Сегмент
                    { width: "15%", targets: 2 }, // Подсегмент  
                    { width: "12%", targets: 3 }, // Период
                    { width: "15%", targets: 4 }, // Отчёты
                    { width: "13%", targets: 5 }, // Дата создания
                    { width: "10%", targets: 6 }  // Действия
                ],
                searching: true, // Включаем поиск
                data: [], // Пустые данные при инициализации
                columns: [
                    { title: 'Название' },
                    { title: 'Сегмент' },
                    { title: 'Подсегмент' },
                    { title: 'Период' },
                    { title: 'Отчёты' },
                    { title: 'Создан' },
                    { title: 'Действия' }
                ]
            });
            
            // Загружаем данные
            await this.loadFilterTemplatesData();

            // Скрываем лоадер и показываем таблицу
            $('#filterTemplatesLoader').hide();
            $('#filterTemplatesTable').show();

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: DataTable для шаблонов фильтров инициализирована');
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка инициализации DataTable для шаблонов фильтров:', error);
            // В случае ошибки тоже скрываем лоадер
            $('#filterTemplatesLoader').hide();
        }
    }

    /**
     * Загрузка данных в DataTable сохранённых отчётов
     * @param {number|null} filterByTemplateId - ID шаблона для фильтрации (null для всех отчётов)
     */
    async loadSavedReportsData(filterByTemplateId = null) {
        try {
            if (!this.savedReportsDataTable) return;
            
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (!areaId) {
                // Очищаем таблицу
                this.savedReportsDataTable.clear().draw();
                return;
            }
            
            // Загружаем только полные отчёты (не шаблоны фильтров)
            let reports = await window.db.getFullReportsByArea(areaId);
            
            // Фильтруем отчёты по шаблону, если указан filterByTemplateId
            if (filterByTemplateId !== null) {
                reports = reports.filter(report => {
                    return report.filter_template_id && report.filter_template_id === filterByTemplateId;
                });
            }
            
            // Преобразуем данные для DataTables
            const tableData = reports.map(report => {
                const date = new Date(report.created_at).toLocaleDateString('ru-RU');
                const time = new Date(report.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                
                // Формируем описание фильтров
                const filterParts = [];
                
                // Добавляем информацию о шаблоне фильтра если есть
                if (report.filter_template_id) {
                    const templateName = report.name.includes(' - ') ? 
                        report.name.split(' - ')[0] : 'Шаблон';
                    filterParts.push(`📋 ${templateName}`);
                }
                
                if (report.filters.segment_name && report.filters.segment_name !== 'Вся область') {
                    filterParts.push(report.filters.segment_name);
                }
                if (report.filters.subsegment_name) {
                    filterParts.push(report.filters.subsegment_name);
                }
                if (report.filters.date_from && report.filters.date_to) {
                    const dateFrom = new Date(report.filters.date_from).toLocaleDateString('ru-RU');
                    const dateTo = new Date(report.filters.date_to).toLocaleDateString('ru-RU');
                    filterParts.push(`${dateFrom} - ${dateTo}`);
                }
                
                const filtersDescription = filterParts.length > 0 ? filterParts.join(', ') : 'Все данные';
                
                const actions = `
                    <div class="flex space-x-1">
                        <button data-action="download" data-report-id="${report.id}" 
                                class="report-action-btn text-blue-600 hover:text-blue-900 text-xs px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
                                title="Скачать отчёт в формате JSON">
                            📥 JSON
                        </button>
                        <button data-action="download-html" data-report-id="${report.id}" 
                                class="report-action-btn text-green-600 hover:text-green-900 text-xs px-2 py-1 border border-green-300 rounded hover:bg-green-50"
                                title="Скачать отчёт в формате HTML">
                            📄 HTML
                        </button>
                        <button data-action="delete" data-report-id="${report.id}" 
                                class="report-action-btn text-red-600 hover:text-red-900 text-xs px-2 py-1 border border-red-300 rounded hover:bg-red-50"
                                title="Удалить отчёт">
                            🗑️
                        </button>
                    </div>
                `;
                
                return [
                    report.name,
                    `${date} ${time}`,
                    actions
                ];
            });
            
            // Обновляем данные в таблице
            this.savedReportsDataTable.clear().rows.add(tableData).draw();
            
            // Обновляем индикацию фильтрации в интерфейсе
            await this.updateReportsFilterIndicator(filterByTemplateId, reports.length);
            
            // Добавляем обработчики событий для кнопок действий (CSP-совместимо)
            this.attachReportActionHandlers();
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка загрузки данных отчётов:', error);
        }
    }

    /**
     * Добавление обработчиков для кнопок действий в таблице отчётов (CSP-совместимо)
     */
    attachReportActionHandlers() {
        // Удаляем старые обработчики если есть
        $(document).off('click', '.report-action-btn');
        
        // Добавляем новые обработчики через делегирование событий
        $(document).on('click', '.report-action-btn', async (event) => {
            event.preventDefault();
            const button = event.currentTarget;
            const action = button.getAttribute('data-action');
            const reportId = button.getAttribute('data-report-id');
            
            if (action === 'download') {
                await this.downloadReportAsJSON(reportId);
            } else if (action === 'download-html') {
                await this.downloadReportAsHTML(reportId);
            } else if (action === 'delete') {
                await this.deleteReportWithConfirmation(reportId);
            }
        });
    }

    /**
     * Форматирование информации об отчётах для таблицы
     */
    formatReportsInfo(reportsConfig) {
        if (!reportsConfig) {
            return '<span class="text-gray-400 text-xs">Не указаны</span>';
        }

        const reportLabels = {
            liquidity: { icon: '📊', label: 'Ликвидность' },
            price_changes: { icon: '📈', label: 'Изменение цен' },
            market_corridor: { icon: '🏠', label: 'Коридор рынка' },
            comparative_analysis: { icon: '⚖️', label: 'Сравнительный анализ' },
            flipping_profitability: { icon: '💰', label: 'Флиппинг' }
        };

        const enabledReports = Object.entries(reportsConfig)
            .filter(([key, enabled]) => enabled && reportLabels[key])
            .map(([key, enabled]) => reportLabels[key]);

        if (enabledReports.length === 0) {
            return '<span class="text-gray-400 text-xs">Нет активных</span>';
        }

        // Показываем иконки с тултипом
        return enabledReports.map(report => 
            `<span class="inline-block mx-1 text-sm" title="${report.label}">${report.icon}</span>`
        ).join('');
    }

    /**
     * Загрузка данных в DataTable шаблонов фильтров
     */
    async loadFilterTemplatesData() {
        try {
            if (!this.filterTemplatesDataTable) return;
            
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (!areaId) {
                // Очищаем таблицу
                this.filterTemplatesDataTable.clear().draw();
                return;
            }
            
            // Убеждаемся, что сегменты и подсегменты загружены
            await this.loadSegmentsData();
            
            // Загружаем шаблоны фильтров
            const filterTemplates = await window.db.getFilterTemplatesByArea(areaId);
            
            // Преобразуем данные для DataTables
            const tableData = [];
            for (const template of filterTemplates) {
                const date = new Date(template.created_at).toLocaleDateString('ru-RU');
                const time = new Date(template.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                
                // Извлекаем информацию о сегменте и подсегменте
                let segmentName = 'Вся область';
                let subsegmentName = 'Весь сегмент';
                
                // Получаем имя сегмента по ID
                if (template.filters.segment_id) {
                    const segment = this.segments.find(s => s.id === template.filters.segment_id);
                    if (segment) {
                        segmentName = segment.name;
                    }
                }
                
                // Получаем имя подсегмента по ID
                if (template.filters.subsegment_id && template.filters.segment_id) {
                    // Загружаем подсегменты для сегмента этого шаблона
                    const templateSubsegments = await this.database.getSubsegmentsBySegment(template.filters.segment_id);
                    const subsegment = templateSubsegments.find(s => s.id === template.filters.subsegment_id);
                    if (subsegment) {
                        subsegmentName = subsegment.name;
                    }
                }
                
                // Формируем описание периода
                let period = 'Весь период';
                if (template.filters.date_from && template.filters.date_to) {
                    const dateFrom = new Date(template.filters.date_from).toLocaleDateString('ru-RU');
                    const dateTo = new Date(template.filters.date_to).toLocaleDateString('ru-RU');
                    period = `${dateFrom} - ${dateTo}`;
                }

                // Формируем список включённых отчётов
                let reportsInfo = this.formatReportsInfo(template.filters.reports_config);
                
                const actions = `
                    <div class="flex space-x-1">
                        <button data-action="select" data-template-id="${template.id}" 
                                class="template-action-btn text-blue-600 hover:text-blue-900 text-xs px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
                                title="Выбрать шаблон для анализа">
                            📋 Выбрать
                        </button>
                        <button data-action="delete" data-template-id="${template.id}" 
                                class="template-action-btn text-red-600 hover:text-red-900 text-xs px-2 py-1 border border-red-300 rounded hover:bg-red-50"
                                title="Удалить шаблон">
                            🗑️
                        </button>
                    </div>
                `;
                
                tableData.push([
                    template.name,
                    segmentName,
                    subsegmentName,
                    period,
                    reportsInfo,
                    `${date} ${time}`,
                    actions
                ]);
            }
            
            // Обновляем данные в таблице
            this.filterTemplatesDataTable.clear().rows.add(tableData).draw();
            
            // Добавляем обработчики событий для кнопок действий
            this.attachTemplateActionHandlers();

            if (this.debugEnabled) {
                console.log('🔄 ReportsManager: Данные шаблонов фильтров загружены:', filterTemplates.length);
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка загрузки данных шаблонов фильтров:', error);
        }
    }

    /**
     * Добавление обработчиков для кнопок действий в таблице шаблонов
     */
    attachTemplateActionHandlers() {
        // Удаляем старые обработчики если есть
        $(document).off('click', '.template-action-btn');
        
        // Добавляем новые обработчики через делегирование событий
        $(document).on('click', '.template-action-btn', async (event) => {
            event.preventDefault();
            const button = event.currentTarget;
            const action = button.getAttribute('data-action');
            const templateId = button.getAttribute('data-template-id'); // Оставляем как строку
            
            if (action === 'select') {
                await this.selectFilterTemplate(templateId);
            } else if (action === 'delete') {
                await this.deleteFilterTemplate(templateId);
            }
        });
    }

    /**
     * Выбор шаблона фильтра из таблицы
     */
    async selectFilterTemplate(templateId) {
        try {
            // Устанавливаем значение в SlimSelect
            // afterChange событие автоматически вызовет onFilterTemplateSelect
            if (this.reportFilterSlimSelect) {
                this.reportFilterSlimSelect.setSelected(templateId.toString());
            } else {
                $('#reportFilterSelect').val(templateId);
                // Для обычного select нужно вызвать обработчик вручную
                await this.onFilterTemplateSelect(templateId.toString());
            }

            if (this.debugEnabled) {
                console.log('📋 ReportsManager: Шаблон выбран из таблицы:', templateId);
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка выбора шаблона из таблицы:', error);
        }
    }

    /**
     * Удаление шаблона фильтра из таблицы
     */
    async deleteFilterTemplate(templateId) {
        try {
            if (this.debugEnabled) {
                console.log('🗑️ ReportsManager: Попытка удаления шаблона с ID:', templateId, typeof templateId);
            }
            
            // Попробуем получить все шаблоны для отладки
            if (this.debugEnabled) {
                const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
                if (areaId) {
                    const allTemplates = await window.db.getFilterTemplatesByArea(areaId);
                    console.log('🗑️ ReportsManager: Все шаблоны в области:', allTemplates.map(t => ({id: t.id, name: t.name})));
                }
            }
            
            const template = await window.db.getSavedReport(templateId);
            if (!template) {
                console.error('❌ ReportsManager: Шаблон не найден в базе данных, ID:', templateId);
                alert('Шаблон не найден');
                return;
            }
            
            if (this.debugEnabled) {
                console.log('🗑️ ReportsManager: Найден шаблон для удаления:', template);
            }
            
            if (!confirm(`Вы уверены, что хотите удалить шаблон "${template.name}"?`)) {
                return;
            }
            
            await window.db.deleteSavedReport(templateId);
            
            // Удаляем все связанные отчёты с этим шаблоном
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (areaId) {
                const allReports = await window.db.getFullReportsByArea(areaId);
                const relatedReports = allReports.filter(report => 
                    report.filter_template_id && report.filter_template_id === templateId
                );
                
                if (relatedReports.length > 0) {
                    if (this.debugEnabled) {
                        console.log(`🗑️ ReportsManager: Найдено ${relatedReports.length} связанных отчётов для удаления`);
                    }
                    
                    // Удаляем каждый связанный отчёт
                    for (const report of relatedReports) {
                        await window.db.deleteSavedReport(report.id);
                        if (this.debugEnabled) {
                            console.log(`🗑️ ReportsManager: Удалён связанный отчёт: ${report.name} (ID: ${report.id})`);
                        }
                    }
                }
            }
            
            // Обновляем данные в таблице
            await this.loadFilterTemplatesData();
            
            // Обновляем таблицу сохранённых отчётов
            await this.loadSavedReportsData();
            
            // Обновляем SlimSelect
            await this.loadFilterTemplates();
            
            // Если удаляемый шаблон был выбран, очищаем форму
            const currentTemplateId = $('#reportFilterId').val();
            if (currentTemplateId == templateId) {
                this.clearFilterForm();
            }
            
            // Уведомление через UIManager вместо alert
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `🗑️ Шаблон "${template.name}" удалён`,
                    duration: 3000
                });
            }

            if (this.debugEnabled) {
                console.log('🗑️ ReportsManager: Шаблон удалён из таблицы:', templateId);
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка удаления шаблона из таблицы:', error);
            alert('Ошибка удаления шаблона');
        }
    }

    /**
     * Очистка формы фильтров
     */
    clearFilterForm() {
        // Очищаем SlimSelect
        if (this.reportFilterSlimSelect) {
            this.reportFilterSlimSelect.setSelected('');
        } else {
            $('#reportFilterSelect').val('');
        }
        
        $('#reportFilterName').val('');
        $('#reportFilterId').val('');
        $('#deleteReportFilterBtn').prop('disabled', true);

        // Убираем подсветку из таблицы
        this.clearTableHighlight();

        // Удаляем индикаторы фильтрации
        $('.filter-indicator').remove();

        // Очищаем таблицу отчётов (без выбранного шаблона таблица должна быть пустой)
        if (this.savedReportsDataTable) {
            this.savedReportsDataTable.clear().draw();
        }
    }

    /**
     * Подсветка строки в таблице шаблонов
     */
    highlightTemplateInTable(templateId) {
        if (!this.filterTemplatesDataTable || !templateId) return;
        
        try {
            // Убираем предыдущую подсветку
            this.clearTableHighlight();
            
            // Находим строку с нужным templateId
            const tableData = this.filterTemplatesDataTable.data();
            let rowIndex = -1;
            
            tableData.each((rowData, index) => {
                // Ищем кнопку с data-template-id
                const actionsHtml = rowData[5]; // Колонка "Действия" - индекс 5
                if (actionsHtml.includes(`data-template-id="${templateId}"`)) {
                    rowIndex = index;
                    return false; // break из each
                }
            });
            
            if (rowIndex >= 0) {
                // Подсвечиваем найденную строку
                const row = this.filterTemplatesDataTable.row(rowIndex);
                const $rowElement = $(row.node());
                $rowElement.addClass('bg-blue-100 border-l-4 border-l-blue-500');
                
                if (this.debugEnabled) {
                    console.log('🎯 ReportsManager: Строка в таблице шаблонов подсвечена:', templateId);
                }
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка подсветки строки в таблице:', error);
        }
    }

    /**
     * Убрать подсветку из таблицы шаблонов
     */
    clearTableHighlight() {
        if (!this.filterTemplatesDataTable) return;
        
        try {
            // Убираем подсветку со всех строк
            const $table = $('#filterTemplatesTable');
            $table.find('tr').removeClass('bg-blue-100 border-l-4 border-l-blue-500');
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка очистки подсветки таблицы:', error);
        }
    }

    /**
     * Обновление индикатора фильтрации отчётов
     */
    async updateReportsFilterIndicator(filterByTemplateId, reportsCount) {
        try {
            // Находим контейнер таблицы сохранённых отчётов
            const $tableContainer = $('#savedReportsTable').closest('.datatables-container');
            
            // Удаляем ВСЕ существующие индикаторы фильтрации
            $('.filter-indicator').remove();
            
            if (filterByTemplateId) {
                // Получаем название шаблона
                const template = await window.db.getSavedReport(filterByTemplateId);
                if (!template) {
                    // Если шаблон не найден, не показываем индикатор
                    if (this.debugEnabled) {
                        console.warn('⚠️ ReportsManager: Шаблон не найден для индикатора:', filterByTemplateId);
                    }
                    return;
                }
                const templateName = template.name;
                
                // Создаём новый индикатор
                const $indicator = $(`
                    <div class="filter-indicator bg-blue-50 border border-blue-200 rounded-md p-2 mb-3 flex items-center justify-between">
                        <div class="flex items-center">
                            <svg class="h-4 w-4 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z"></path>
                            </svg>
                            <span class="text-sm text-blue-700">
                                <strong>Фильтр по шаблону:</strong> "${templateName}" 
                                <span class="text-blue-600">(найдено отчётов: ${reportsCount})</span>
                            </span>
                        </div>
                        <button id="clearReportsFilter" class="text-blue-600 hover:text-blue-800 text-sm underline">
                            Показать все отчёты
                        </button>
                    </div>
                `);
                
                // Вставляем перед таблицей
                $tableContainer.before($indicator);
                
                // Добавляем обработчик для кнопки "Показать все отчёты"
                $('#clearReportsFilter').off('click').on('click', () => {
                    this.clearFilterForm();
                });

                if (this.debugEnabled) {
                    console.log(`🔍 ReportsManager: Индикатор фильтрации установлен: "${templateName}" (${reportsCount} отчётов)`);
                }
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка обновления индикатора фильтрации:', error);
        }
    }

    /**
     * Показать индикатор загрузки для операций с шаблонами
     */
    showTemplateLoadingIndicator(message = 'Применение шаблона фильтра...') {
        // Создаём или обновляем индикатор
        let $indicator = $('#templateLoadingIndicator');
        if ($indicator.length === 0) {
            $indicator = $(`
                <div id="templateLoadingIndicator" class="fixed top-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-3">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span class="text-sm font-medium"></span>
                </div>
            `);
            $('body').append($indicator);
        }
        
        $indicator.find('span').text(message);
        $indicator.show();
    }

    /**
     * Скрыть индикатор загрузки для операций с шаблонами
     */
    hideTemplateLoadingIndicator() {
        $('#templateLoadingIndicator').fadeOut(300);
    }

    /**
     * Сохранение текущего отчёта на основе выбранного шаблона фильтра
     */
    async saveCurrentReport() {
        try {
            // Проверяем что выбран шаблон фильтра
            const templateId = $('#reportFilterId').val();
            const templateName = $('#reportFilterName').val()?.trim();
            
            if (!templateId || !templateName) {
                if (this.areaPage && this.areaPage.uiManager) {
                    this.areaPage.uiManager.showNotification({
                        type: 'warning',
                        message: 'Выберите или создайте шаблон фильтра перед сохранением отчёта',
                        duration: 4000
                    });
                }
                return;
            }
            
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (!areaId) {
                if (this.areaPage && this.areaPage.uiManager) {
                    this.areaPage.uiManager.showNotification({
                        type: 'error',
                        message: 'Нет выбранной области',
                        duration: 4000
                    });
                }
                return;
            }
            
            // Генерируем автоматическое название отчёта
            const currentDate = new Date().toLocaleDateString('ru-RU');
            const reportName = `${templateName} - ${currentDate}`;

            // Загружаем шаблон для получения reports_config
            const template = await window.db.getSavedReport(templateId);
            const reportsConfig = template?.filters?.reports_config || {
                liquidity: true,
                price_changes: true,
                market_corridor: true,
                comparative_analysis: true,
                flipping_profitability: true
            };

            // Собираем данные текущих фильтров
            const reportData = {
                name: reportName,
                area_id: areaId,
                type: 'full_report',
                filter_template_id: templateId,
                filters: {
                    segment_id: this.currentSegment?.id || null,
                    segment_name: this.currentSegment?.name || 'Вся область',
                    subsegment_id: this.currentSubsegment?.id || null,
                    subsegment_name: this.currentSubsegment?.name || null,
                    date_from: this.dateFromFilter?.value || null,
                    date_to: this.dateToFilter?.value || null,
                    reports_config: reportsConfig // Копируем конфигурацию отчётов из шаблона
                },
                // ✅ НОВОЕ: Сохраняем данные графиков для включённых отчётов
                charts_data: await this.getAllChartsData(reportsConfig),
                // Сохраняем состояние сравнительного анализа если есть
                comparative_analysis: null,
                // ✅ НОВОЕ: Сохраняем данные флиппинг отчёта только если отчёт включён
                flipping_data: null,
                // ✅ НОВОЕ: Сохраняем данные дублей
                duplicates_data: null
            };

            // Загрузка данных флиппинга
            if (reportsConfig.flipping_profitability) {
                console.log('📥 Загружаем данные флиппинга для сохранения...');
                const rawFlippingData = await this.getCurrentFlippingData();
                console.log('📊 Сырые данные флиппинга:', {
                    hasData: !!rawFlippingData,
                    objectsCount: rawFlippingData?.objects?.length || 0,
                    firstObject: rawFlippingData?.objects?.[0]
                });

                const sanitizedFlippingData = this.sanitizeDataForStorage(rawFlippingData);
                console.log('🧹 После sanitize:', {
                    hasData: !!sanitizedFlippingData,
                    objectsCount: sanitizedFlippingData?.objects?.length || 0
                });

                reportData.flipping_data = sanitizedFlippingData;
            }

            // Отладка: проверяем что сохранилось в flipping_data
            console.log('💾 ReportsManager.saveCurrentReport - итоговый flipping_data:', {
                configEnabled: reportsConfig.flipping_profitability,
                hasFlippingData: !!reportData.flipping_data,
                objectsCount: reportData.flipping_data?.objects?.length || 0
            });

            // Собираем данные дублей для таблицы
            // Используем метод collectReportDataForDuplicates для сбора объектов и листингов
            try {
                const duplicatesInputData = await this.collectReportDataForDuplicates(reportData.filters);
                if (duplicatesInputData) {
                    reportData.duplicates_data = this.sanitizeDataForStorage(
                        this.buildDuplicatesData(
                            duplicatesInputData.objects,
                            duplicatesInputData.listings,
                            duplicatesInputData.addresses
                        )
                    );
                    if (this.debugEnabled) {
                        console.log('✅ ReportsManager: Данные дублей для сохранения отчёта собраны', {
                            objects: duplicatesInputData.objects.length,
                            listings: duplicatesInputData.listings.length,
                            addresses: duplicatesInputData.addresses.length
                        });
                    }
                }
            } catch (error) {
                console.warn('⚠️ ReportsManager: Ошибка сбора данных дублей для сохранения отчёта:', error);
            }
            
            // Получаем данные сравнительного анализа если панель активна И отчёт включён в конфигурации
            if (reportsConfig.comparative_analysis &&
                this.areaPage.comparativeAnalysisManager &&
                this.areaPage.comparativeAnalysisManager.evaluations) {
                reportData.comparative_analysis = {
                    evaluations: Object.fromEntries(this.areaPage.comparativeAnalysisManager.evaluations),
                    corridors: this.areaPage.comparativeAnalysisManager.corridors,
                    selected_object_id: this.areaPage.comparativeAnalysisManager.selectedObjectId,
                    selected_listing_id: this.areaPage.comparativeAnalysisManager.selectedListingId
                };
            }
            
            // Логируем что сохраняем
            if (this.debugEnabled) {
                console.log('📊 ReportsManager: Сохраняем отчёт с данными:', {
                    name: reportData.name,
                    hasChartsData: !!reportData.charts_data,
                    chartsDataKeys: reportData.charts_data ? Object.keys(reportData.charts_data) : [],
                    hasComparativeAnalysis: !!reportData.comparative_analysis,
                    hasFlippingData: !!reportData.flipping_data
                });
            }

            // Получаем статистику по текущему сегменту/подсегменту для логирования
            let statsAddresses = 0, statsObjects = 0, statsListings = 0;

            if (this.currentSegment) {
                try {
                    // Получаем адреса из структуры сегмента
                    if (this.currentSegment.filters && this.currentSegment.filters.addresses) {
                        statsAddresses = this.currentSegment.filters.addresses.length;

                        // Получаем ВСЕ объекты по адресам сегмента
                        let allSegmentObjects = [];

                        for (const addressId of this.currentSegment.filters.addresses) {
                            try {
                                const addressObjects = await window.db.getObjectsByAddress(addressId);
                                if (addressObjects && addressObjects.length > 0) {
                                    allSegmentObjects.push(...addressObjects);
                                }
                            } catch (error) {
                                console.warn('Не удалось получить объекты по адресу:', addressId, error);
                            }
                        }

                        // Фильтруем по подсегменту если указан
                        let filteredObjects = allSegmentObjects;
                        if (this.currentSubsegment) {
                            filteredObjects = allSegmentObjects.filter(obj => {
                                return this.objectMatchesSubsegment(obj, this.currentSubsegment);
                            });
                        }

                        statsObjects = filteredObjects.length;

                        // Подсчитываем объявления
                        for (const object of filteredObjects) {
                            try {
                                // Получаем объявления принадлежащие конкретному объекту
                                const objectListings = await window.db.getByIndex('listings', 'object_id', object.id);
                                if (objectListings) {
                                    statsListings += objectListings.length;
                                }
                            } catch (e) {
                                // Игнорируем ошибки подсчёта
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Не удалось получить статистику для логирования:', error);
                }
            }

            // Логируем параметры сохраняемого отчёта
            console.log('💾 ReportsManager: Параметры сохранения отчёта:', {
                addresses: statsAddresses,
                objects: statsObjects,
                listings: statsListings,
                segment: this.currentSegment?.name || 'Вся область',
                subsegment: this.currentSubsegment?.name || 'Все подсегменты',
                report_name: reportData.name,
                date_from: reportData.filters.date_from,
                date_to: reportData.filters.date_to
            });

            console.log('💾 Перед сохранением в БД - reportData.flipping_data:', {
                hasFlippingData: !!reportData.flipping_data,
                objectsCount: reportData.flipping_data?.objects?.length || 0,
                firstObject: reportData.flipping_data?.objects?.[0]
            });

            // Сохраняем в IndexedDB
            await window.db.saveSavedReport(reportData);

            console.log('✅ Отчёт сохранён в БД, ID:', reportData.id);
            
            // Обновляем таблицу
            await this.loadSavedReportsData();
            
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `📊 Отчёт "${reportName}" сохранён`,
                    duration: 3000
                });
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка сохранения отчёта:', error);
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'error',
                    message: 'Ошибка сохранения отчёта',
                    duration: 5000
                });
            }
        }
    }
    
    /**
     * Загрузка сохранённого отчёта
     */
    async loadSavedReport(reportId) {
        try {
            const report = await window.db.getSavedReport(reportId);
            if (!report) {
                alert('Отчёт не найден');
                return;
            }
            
            // Восстанавливаем фильтры
            if (report.filters.segment_id && this.segments.length > 0) {
                const segment = this.segments.find(s => s.id === report.filters.segment_id);
                if (segment && this.segmentSlimSelect) {
                    this.segmentSlimSelect.setSelected([report.filters.segment_id.toString()]);
                    await this.handleSegmentChange(report.filters.segment_id);
                }
            } else if (this.segmentSlimSelect) {
                this.segmentSlimSelect.setSelected([]);
                await this.handleSegmentChange(null);
            }
            
            if (report.filters.subsegment_id && this.subsegments.length > 0) {
                const subsegment = this.subsegments.find(s => s.id === report.filters.subsegment_id);
                if (subsegment && this.subsegmentSlimSelect) {
                    this.subsegmentSlimSelect.setSelected([report.filters.subsegment_id.toString()]);
                    await this.handleSubsegmentChange(report.filters.subsegment_id);
                }
            }
            
            if (report.filters.date_from && this.dateFromFilter) {
                this.dateFromFilter.value = report.filters.date_from;
            }
            
            if (report.filters.date_to && this.dateToFilter) {
                this.dateToFilter.value = report.filters.date_to;
            }
            
            // Восстанавливаем состояние сравнительного анализа
            if (report.comparative_analysis && this.areaPage.comparativeAnalysisManager) {
                const cam = this.areaPage.comparativeAnalysisManager;
                cam.evaluations = new Map(Object.entries(report.comparative_analysis.evaluations));
                cam.corridors = report.comparative_analysis.corridors;
                cam.selectedObjectId = report.comparative_analysis.selected_object_id;
                cam.selectedListingId = report.comparative_analysis.selected_listing_id;
                
                // Сохраняем восстановленное состояние
                cam.saveComparativeState();
            }
            
            // Обновляем отчёты
            await this.updateReportsVisibility();
            
            alert(`Отчёт "${report.name}" загружен успешно!`);
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка загрузки отчёта:', error);
            alert('Ошибка загрузки отчёта');
        }
    }
    
    /**
     * Удаление сохранённого отчёта
     */
    async deleteSavedReport(reportId) {
        try {
            const report = await window.db.getSavedReport(reportId);
            if (!report) {
                alert('Отчёт не найден');
                return;
            }
            
            if (!confirm(`Вы уверены, что хотите удалить отчёт "${report.name}"?`)) return;
            
            await window.db.deleteSavedReport(reportId);
            
            // Обновляем таблицу
            await this.loadSavedReportsData();
            
            alert(`Отчёт "${report.name}" удалён успешно!`);
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка удаления отчёта:', error);
            alert('Ошибка удаления отчёта');
        }
    }

    /**
     * Удаление отчёта с подтверждением из таблицы
     */
    async deleteReportWithConfirmation(reportId) {
        let button, originalText;
        try {
            // Показываем индикатор загрузки на кнопке
            button = $(`[data-report-id="${reportId}"][data-action="delete"]`);
            originalText = button.html();
            button.html('⏳').prop('disabled', true);
            
            const report = await window.db.getSavedReport(reportId);
            if (!report) {
                if (this.areaPage && this.areaPage.uiManager) {
                    this.areaPage.uiManager.showNotification({
                        type: 'error',
                        message: 'Отчёт не найден',
                        duration: 3000
                    });
                }
                return;
            }
            
            // Восстанавливаем кнопку для показа диалога
            button.html(originalText).prop('disabled', false);
            
            if (!confirm(`Вы уверены, что хотите удалить отчёт "${report.name}"?\n\nЭто действие нельзя отменить.`)) {
                return;
            }
            
            // Снова показываем индикатор загрузки
            button.html('⏳').prop('disabled', true);
            
            await window.db.deleteSavedReport(reportId);
            
            // Обновляем таблицу
            await this.loadSavedReportsData();
            
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `🗑️ Отчёт "${report.name}" удалён`,
                    duration: 3000
                });
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка удаления отчёта:', error);
            
            // Восстанавливаем кнопку в случае ошибки
            if (button && originalText) {
                button.html(originalText).prop('disabled', false);
            }
            
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'error',
                    message: 'Ошибка удаления отчёта',
                    duration: 5000
                });
            }
        }
    }

    // ===== МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ ШАБЛОНАМИ ФИЛЬТРОВ =====

    /**
     * Инициализация интерфейса управления шаблонами фильтров
     */
    async initFilterTemplates() {
        try {
            // Загружаем существующие шаблоны
            await this.loadFilterTemplates();
            
            // Добавляем обработчики событий
            $('#saveReportFilterBtn').off('click').on('click', () => this.saveCurrentAsFilterTemplate());
            $('#deleteReportFilterBtn').off('click').on('click', () => this.deleteSelectedFilterTemplate());
            // Обработчик события для reportFilterSelect теперь в SlimSelect (initializeSlimSelects)
            
            if (this.debugEnabled) {
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка инициализации шаблонов фильтров:', error);
        }
    }

    /**
     * Загрузка шаблонов фильтров в выпадающий список
     */
    async loadFilterTemplates() {
        try {
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (!areaId) return;

            const filterTemplates = await window.db.getFilterTemplatesByArea(areaId);
            
            // Обновляем данные через SlimSelect API
            if (this.reportFilterSlimSelect) {
                const options = [
                    { text: 'Создать новый фильтр', value: '' }
                ];
                
                filterTemplates.forEach(template => {
                    options.push({ 
                        text: template.name, 
                        value: template.id.toString() 
                    });
                });

                this.reportFilterSlimSelect.setData(options);
                
                if (this.debugEnabled) {
                    console.log('🔄 ReportsManager: Шаблоны фильтров загружены в SlimSelect:', filterTemplates.length);
                }
            } else {
                // Fallback для случая, когда SlimSelect не инициализирован
                const $select = $('#reportFilterSelect');
                $select.empty();
                $select.append('<option value="">Создать новый фильтр</option>');
                
                filterTemplates.forEach(template => {
                    $select.append(`<option value="${template.id}">${template.name}</option>`);
                });

                if (this.debugEnabled) {
                    console.log('⚠️ ReportsManager: Использован fallback для загрузки шаблонов (SlimSelect не найден)');
                }
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка загрузки шаблонов фильтров:', error);
        }
    }

    /**
     * Получение текущей конфигурации отчётов
     */
    getReportsConfig() {
        return {
            liquidity: document.getElementById('liquidityReportCheck')?.checked || false,
            price_changes: document.getElementById('priceChangesReportCheck')?.checked || false,
            market_corridor: document.getElementById('marketCorridorReportCheck')?.checked || false,
            comparative_analysis: document.getElementById('comparativeAnalysisReportCheck')?.checked || false,
            flipping_profitability: document.getElementById('flippingProfitabilityReportCheck')?.checked || false
        };
    }

    /**
     * Получение конфигурации отчётов для сохранения в шаблон
     * (из выпадающего списка "Отчёты для шаблона")
     */
    getTemplateReportsConfig() {
        return {
            liquidity: document.getElementById('templateLiquidityCheck')?.checked || false,
            price_changes: document.getElementById('templatePriceChangesCheck')?.checked || false,
            market_corridor: document.getElementById('templateMarketCorridorCheck')?.checked || false,
            comparative_analysis: document.getElementById('templateComparativeAnalysisCheck')?.checked || false,
            flipping_profitability: document.getElementById('templateFlippingCheck')?.checked || false
        };
    }

    /**
     * Получение настроек сравнительного анализа
     */
    getComparativeAnalysisConfig() {
        try {
            // Получаем менеджер сравнительного анализа через areaPage
            const comparativeManager = this.areaPage?.comparativeAnalysisManager;
            if (comparativeManager && typeof comparativeManager.getCurrentSettings === 'function') {
                return comparativeManager.getCurrentSettings();
            }
            
            return null;
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения настроек сравнительного анализа:', error);
            return null;
        }
    }

    /**
     * Применение конфигурации отчётов из шаблона
     */
    async applyReportsConfig(reportsConfig) {
        try {
            if (!reportsConfig) return;

            // Применяем настройки чекбоксов отчётов
            const checkboxes = {
                'liquidityReportCheck': reportsConfig.liquidity,
                'priceChangesReportCheck': reportsConfig.price_changes,
                'marketCorridorReportCheck': reportsConfig.market_corridor,
                'comparativeAnalysisReportCheck': reportsConfig.comparative_analysis,
                'flippingProfitabilityReportCheck': reportsConfig.flipping_profitability
            };

            Object.entries(checkboxes).forEach(([checkboxId, checked]) => {
                const checkbox = document.getElementById(checkboxId);
                if (checkbox) {
                    checkbox.checked = checked;
                }
            });

            // Обновляем видимость отчётов после применения настроек
            await this.updateReportsVisibility();
            
            // Сохраняем новое состояние чекбоксов
            this.saveReportsCheckboxState();

            if (this.debugEnabled) {
                console.log('📋 ReportsManager: Конфигурация отчётов применена:', reportsConfig);
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка применения конфигурации отчётов:', error);
        }
    }

    /**
     * Применение настроек сравнительного анализа из шаблона
     */
    async applyComparativeAnalysisConfig(comparativeConfig) {
        try {
            if (!comparativeConfig) return;

            // Получаем менеджер сравнительного анализа
            const comparativeManager = this.areaPage?.comparativeAnalysisManager;
            if (comparativeManager && typeof comparativeManager.applySettings === 'function') {
                // Показываем интерфейс сравнительного анализа если он скрыт
                // Пропускаем восстановление состояния из localStorage, т.к. применяем состояние из шаблона
                await comparativeManager.showComparativeAnalysis(true);
                
                // Применяем настройки из шаблона
                await comparativeManager.applySettings(comparativeConfig);
                
                if (this.debugEnabled) {
                    console.log('📊 ReportsManager: Настройки сравнительного анализа применены:', comparativeConfig);
                }
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка применения настроек сравнительного анализа:', error);
        }
    }

    /**
     * Сохранение текущих параметров как шаблон фильтра
     */
    async saveCurrentAsFilterTemplate() {
        try {
            const filterName = $('#reportFilterName').val()?.trim();
            if (!filterName) {
                alert('Введите название фильтра');
                return;
            }
            
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (!areaId) {
                alert('Нет выбранной области');
                return;
            }
            
            // Проверяем, не существует ли уже фильтр с таким названием
            const existingTemplates = await window.db.getFilterTemplatesByArea(areaId);
            const existingTemplate = existingTemplates.find(t => t.name === filterName);
            const filterId = $('#reportFilterId').val();
            
            if (existingTemplate && existingTemplate.id !== filterId) {
                alert('Фильтр с таким названием уже существует');
                return;
            }
            
            // Собираем данные текущих фильтров
            const filterData = {
                id: filterId || undefined,
                name: filterName,
                area_id: areaId,
                type: 'filter_template',
                filters: {
                    // Базовые фильтры
                    segment_id: this.currentSegment?.id || null,
                    subsegment_id: this.currentSubsegment?.id || null,
                    date_from: $('#reportsDateFrom').val() || null,
                    date_to: $('#reportsDateTo').val() || null,

                    // Настройки отчётов - берём из выпадающего списка "Отчёты для шаблона"
                    reports_config: this.getTemplateReportsConfig(),

                    // Настройки сравнительного анализа
                    comparative_analysis_config: this.getComparativeAnalysisConfig()
                }
            };
            
            const savedFilter = await window.db.saveSavedReport(filterData);
            
            // Обновляем список шаблонов
            await this.loadFilterTemplates();
            await this.loadFilterTemplatesData();
            
            // Выбираем сохранённый шаблон
            if (this.reportFilterSlimSelect) {
                this.reportFilterSlimSelect.setSelected(savedFilter.id.toString());
            } else {
                $('#reportFilterSelect').val(savedFilter.id);
            }
            $('#reportFilterId').val(savedFilter.id);
            
            // Включаем кнопку удаления
            $('#deleteReportFilterBtn').prop('disabled', false);
            
            // Уведомление через UIManager вместо alert
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `💾 Шаблон "${filterName}" сохранён`,
                    duration: 3000
                });
            }
            
            // Скрываем индикаторы несохранённых изменений
            this.hideUnsavedChangesIndicator();
            this.hideComparativeUnsavedIndicator();
            
            if (this.debugEnabled) {
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка сохранения шаблона фильтра:', error);
            alert('Ошибка сохранения шаблона фильтра');
        }
    }

    /**
     * Обработчик выбора шаблона фильтра
     */
    async onFilterTemplateSelect(templateId) {
        try {
            // Устанавливаем флаг восстановления шаблона
            this.isRestoringTemplate = true;
            
            const $deleteBtn = $('#deleteReportFilterBtn');
            const $nameField = $('#reportFilterName');
            const $idField = $('#reportFilterId');
            
            if (!templateId) {
                // Создание нового фильтра
                $deleteBtn.prop('disabled', true);
                $nameField.val('');
                $idField.val('');
                // Показываем все отчёты без фильтрации
                await this.loadSavedReportsData(null);
                this.isRestoringTemplate = false; // Снимаем флаг перед выходом
                return;
            }

            // Показываем индикатор загрузки
            this.showTemplateLoadingIndicator('Применение шаблона фильтра...');
            
            // Загрузка выбранного шаблона
            const template = await window.db.getSavedReport(templateId);
            if (!template) {
                this.hideTemplateLoadingIndicator();
                this.isRestoringTemplate = false; // Снимаем флаг перед выходом
                alert('Шаблон фильтра не найден');
                return;
            }
            
            // Заполняем поля
            $nameField.val(template.name);
            $idField.val(template.id);
            $deleteBtn.prop('disabled', false);
            
            // Применяем фильтры
            if (template.filters) {
                // Базовые фильтры
                if (template.filters.segment_id) {
                    this.showTemplateLoadingIndicator('Загрузка сегмента...');
                    await this.loadSegmentById(template.filters.segment_id);
                }
                if (template.filters.subsegment_id) {
                    this.showTemplateLoadingIndicator('Загрузка подсегмента...');
                    await this.loadSubsegmentById(template.filters.subsegment_id);
                }
                if (template.filters.date_from) {
                    $('#reportsDateFrom').val(template.filters.date_from);
                }
                if (template.filters.date_to) {
                    $('#reportsDateTo').val(template.filters.date_to);
                }

                // Применяем настройки отчётов
                if (template.filters.reports_config) {
                    this.showTemplateLoadingIndicator('Применение настроек отчётов...');
                    await this.applyReportsConfig(template.filters.reports_config);
                }

                // Применяем настройки сравнительного анализа
                if (template.filters.comparative_analysis_config) {
                    this.showTemplateLoadingIndicator('Применение настроек сравнительного анализа...');
                    await this.applyComparativeAnalysisConfig(template.filters.comparative_analysis_config);
                }
            }

            // Подсвечиваем соответствующую строку в таблице шаблонов
            this.highlightTemplateInTable(templateId);

            // Обновляем таблицу сохранённых отчётов с фильтрацией по шаблону
            this.showTemplateLoadingIndicator('Обновление списка отчётов...');
            await this.loadSavedReportsData(templateId || null);

            // Скрываем индикатор загрузки
            this.hideTemplateLoadingIndicator();
            
            // Скрываем индикаторы несохранённых изменений после применения шаблона
            this.hideUnsavedChangesIndicator();
            this.hideComparativeUnsavedIndicator();
            
            if (this.debugEnabled) {
                console.log('📋 ReportsManager: Шаблон фильтра применён:', template ? template.name : 'Новый фильтр');
            }
            
        } catch (error) {
            // Скрываем индикатор загрузки в случае ошибки
            this.hideTemplateLoadingIndicator();
            console.error('❌ ReportsManager: Ошибка применения шаблона фильтра:', error);
            alert('Ошибка применения шаблона фильтра');
        } finally {
            // Снимаем флаг восстановления шаблона в любом случае
            this.isRestoringTemplate = false;
        }
    }

    /**
     * Загрузка сегмента по ID (для применения шаблона)
     */
    async loadSegmentById(segmentId) {
        try {
            const segment = await window.db.getSegment(segmentId);
            if (segment && this.segmentSlimSelect) {
                // Устанавливаем выбранный сегмент (обработчики заблокированы флагом isRestoringTemplate)
                this.segmentSlimSelect.setSelected([segmentId.toString()]);
                this.currentSegment = segment;
                
                // Загружаем подсегменты для выбранного сегмента
                await this.handleSegmentChangeForTemplate(segmentId);
            }
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка загрузки сегмента:', error);
        }
    }

    /**
     * Обработка изменения сегмента для шаблонов (без обновления отчётов)
     */
    async handleSegmentChangeForTemplate(segmentId) {
        try {
            this.currentSegment = segmentId ? this.segments.find(s => s.id === segmentId || s.id === parseInt(segmentId)) : null;
            this.currentSubsegment = null;
            
            if (!segmentId) {
                // Если сегмент не выбран, отключаем подсегменты и очищаем данные
                if (this.subsegmentSlimSelect) {
                    this.subsegmentSlimSelect.setData([{ text: 'Все подсегменты', value: '' }]);
                    this.subsegmentSlimSelect.enable(false);
                    this.subsegmentSlimSelect.setSelected([]);
                }
                this.subsegments = [];
            } else {
                // Загружаем подсегменты для выбранного сегмента
                const subsegments = await this.database.getSubsegmentsBySegment(segmentId);
                
                // Очищаем и заполняем опции подсегментов
                this.subsegmentFilter.innerHTML = '<option value="">Все подсегменты</option>';
                subsegments.forEach(subsegment => {
                    const option = document.createElement('option');
                    option.value = subsegment.id;
                    option.textContent = subsegment.name;
                    this.subsegmentFilter.appendChild(option);
                });
                
                // Обновляем существующий SlimSelect
                if (this.subsegmentSlimSelect) {
                    this.subsegmentSlimSelect.setData([
                        { text: 'Все подсегменты', value: '' },
                        ...subsegments.map(subsegment => ({ 
                            text: subsegment.name, 
                            value: subsegment.id.toString() 
                        }))
                    ]);
                    this.subsegmentSlimSelect.enable(true);
                }
                
                // Сохраняем подсегменты
                this.subsegments = subsegments;
            }

            // НЕ вызываем updateReportsVisibility() для ускорения работы с шаблонами
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка обработки изменения сегмента для шаблона:', error);
        }
    }

    /**
     * Загрузка подсегмента по ID (для применения шаблона)
     */
    async loadSubsegmentById(subsegmentId) {
        try {
            const subsegment = await window.db.getSubsegment(subsegmentId);
            if (subsegment && this.subsegmentSlimSelect) {
                // Устанавливаем выбранный подсегмент (обработчики заблокированы флагом isRestoringTemplate)
                this.subsegmentSlimSelect.setSelected([subsegmentId.toString()]);
                this.currentSubsegment = subsegment;
            }
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка загрузки подсегмента:', error);
        }
    }

    /**
     * Удаление выбранного шаблона фильтра
     */
    async deleteSelectedFilterTemplate() {
        try {
            const templateId = $('#reportFilterId').val();
            if (!templateId) {
                alert('Не выбран шаблон фильтра для удаления');
                return;
            }
            
            const template = await window.db.getSavedReport(templateId);
            if (!template) {
                alert('Шаблон фильтра не найден');
                return;
            }
            
            if (!confirm(`Вы уверены, что хотите удалить шаблон фильтра "${template.name}"?`)) return;
            
            await window.db.deleteSavedReport(templateId);
            
            // Очищаем форму
            if (this.reportFilterSlimSelect) {
                this.reportFilterSlimSelect.setSelected('');
            } else {
                $('#reportFilterSelect').val('');
            }
            $('#reportFilterName').val('');
            $('#reportFilterId').val('');
            $('#deleteReportFilterBtn').prop('disabled', true);
            
            // Обновляем список шаблонов
            await this.loadFilterTemplates();
            await this.loadFilterTemplatesData();
            
            // Уведомление через UIManager вместо alert
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `🗑️ Шаблон "${template.name}" удалён`,
                    duration: 3000
                });
            }
            
            if (this.debugEnabled) {
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка удаления шаблона фильтра:', error);
            alert('Ошибка удаления шаблона фильтра');
        }
    }

    // ===== ИНДИКАТОРЫ НЕСОХРАНЁННЫХ ИЗМЕНЕНИЙ =====

    /**
     * Показать индикатор несохранённых изменений в фильтрах
     */
    showUnsavedChangesIndicator() {
        const indicator = document.getElementById('unsavedChangesIndicator');
        if (indicator) {
            indicator.classList.remove('hidden');
        }
    }

    /**
     * Скрыть индикатор несохранённых изменений в фильтрах
     */
    hideUnsavedChangesIndicator() {
        const indicator = document.getElementById('unsavedChangesIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
    }

    /**
     * Показать индикатор несохранённых изменений в сравнительном анализе
     */
    showComparativeUnsavedIndicator() {
        const indicator = document.getElementById('comparativeUnsavedIndicator');
        if (indicator) {
            indicator.classList.remove('hidden');
        }
    }

    /**
     * Скрыть индикатор несохранённых изменений в сравнительном анализе
     */
    hideComparativeUnsavedIndicator() {
        const indicator = document.getElementById('comparativeUnsavedIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
    }

    /**
     * Проверка наличия несохранённых изменений
     */
    checkForUnsavedChanges() {
        // Проверяем, есть ли выбранный шаблон
        const selectedTemplateId = $('#reportFilterId').val();
        
        if (!selectedTemplateId) {
            // Если шаблон не выбран, показываем индикатор только если есть активные фильтры
            const hasActiveFilters = this.hasActiveFilters();
            if (hasActiveFilters) {
                this.showUnsavedChangesIndicator();
            } else {
                this.hideUnsavedChangesIndicator();
            }
            return;
        }

        // Если шаблон выбран, сравниваем текущие настройки с сохранёнными
        this.compareWithSavedTemplate(selectedTemplateId);
    }

    /**
     * Проверка наличия активных фильтров
     */
    hasActiveFilters() {
        // Проверяем базовые фильтры
        const hasSegment = this.currentSegment && this.currentSegment.id;
        const hasSubsegment = this.currentSubsegment && this.currentSubsegment.id;
        const hasDateFilter = this.dateFromFilter?.value || this.dateToFilter?.value;
        
        // Проверяем настройки отчётов
        const hasReportsConfig = this.hasNonDefaultReportsConfig();
        
        // Проверяем настройки сравнительного анализа
        const hasComparativeChanges = this.hasComparativeAnalysisChanges();

        return hasSegment || hasSubsegment || hasDateFilter || hasReportsConfig || hasComparativeChanges;
    }

    /**
     * Проверка настроек отчётов на отличие от значений по умолчанию
     */
    hasNonDefaultReportsConfig() {
        // Проверяем чекбоксы отчётов
        const checkboxes = document.querySelectorAll('#reportsConfigContainer input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            // Если чекбокс не отмечен (значение по умолчанию - все включены), то есть изменения
            if (!checkbox.checked) {
                return true;
            }
        }
        return false;
    }

    /**
     * Проверка наличия изменений в сравнительном анализе
     */
    hasComparativeAnalysisChanges() {
        const comparativeManager = this.areaPage?.comparativeAnalysisManager;
        if (!comparativeManager) return false;

        // Проверяем наличие оценок
        const hasEvaluations = comparativeManager.evaluations && comparativeManager.evaluations.size > 0;
        
        // Проверяем наличие выбранного объекта
        const hasSelectedObject = comparativeManager.selectedObjectId;

        return hasEvaluations || hasSelectedObject;
    }

    /**
     * Сравнение текущих настроек с сохранённым шаблоном
     */
    async compareWithSavedTemplate(templateId) {
        try {
            const template = await window.db.getSavedReport(templateId);
            if (!template) {
                this.hideUnsavedChangesIndicator();
                return;
            }

            // Сравниваем текущие настройки с шаблоном
            const currentConfig = this.getCurrentFiltersConfig();
            const hasChanges = !this.deepEqual(currentConfig, template.filters);

            if (hasChanges) {
                this.showUnsavedChangesIndicator();
            } else {
                this.hideUnsavedChangesIndicator();
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка сравнения с шаблоном:', error);
        }
    }

    /**
     * Получение текущей конфигурации фильтров
     */
    getCurrentFiltersConfig() {
        return {
            segment_id: this.currentSegment?.id || null,
            subsegment_id: this.currentSubsegment?.id || null,
            date_from: this.dateFromFilter?.value || null,
            date_to: this.dateToFilter?.value || null,
            reports_config: this.getReportsConfig(),
            comparative_analysis_config: this.getComparativeAnalysisConfig()
        };
    }

    /**
     * Глубокое сравнение объектов
     */
    deepEqual(obj1, obj2) {
        if (obj1 === obj2) return true;
        if (!obj1 || !obj2) return false;
        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        if (keys1.length !== keys2.length) return false;

        for (const key of keys1) {
            if (!keys2.includes(key)) return false;
            if (!this.deepEqual(obj1[key], obj2[key])) return false;
        }

        return true;
    }

    // ===== ЭКСПОРТ ОТЧЁТОВ В JSON =====

    /**
     * Скачивание отчёта в формате JSON
     */
    async downloadReportAsJSON(reportId) {
        let button, originalText;
        try {
            // Показываем индикатор загрузки
            button = $(`[data-report-id="${reportId}"]`);
            originalText = button.html();
            button.html('⏳ Экспорт...').prop('disabled', true);
            
            if (this.debugEnabled) {
            }
            
            // Получаем отчёт
            const report = await window.db.getSavedReport(reportId);
            if (!report) {
                alert('Отчёт не найден');
                return;
            }
            
            // Собираем полные данные отчёта
            const exportData = await this.collectReportExportData(report);
            
            // Создаём имя файла
            const fileName = this.generateExportFileName(report.name);
            
            // Скачиваем файл
            this.downloadJSONFile(exportData, fileName);
            
            
            // Показываем уведомление об успешном экспорте
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `📥 Отчёт "${report.name}" экспортирован`,
                    duration: 3000
                });
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка экспорта отчёта:', error);
            
            // Показываем уведомление об ошибке
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'error',
                    message: 'Ошибка экспорта отчёта',
                    duration: 5000
                });
            } else {
                alert('Ошибка экспорта отчёта');
            }
        } finally {
            // Восстанавливаем кнопку
            if (button && originalText) {
                button.html(originalText).prop('disabled', false);
            }
        }
    }

    /**
     * Сбор всех данных отчёта для экспорта
     */
    async collectReportExportData(report) {
        const areaId = report.area_id;

        console.log('📦 collectReportExportData - входящий report:', {
            hasFlippingData: !!report.flipping_data,
            flippingObjectsCount: report.flipping_data?.objects?.length || 0,
            hasChartsData: !!report.charts_data,
            hasFilters: !!report.filters
        });

        // Получаем данные области
        const area = await window.db.getMapArea(areaId);
        
        // Определяем что именно экспортировать в зависимости от выбора
        let addresses = [];
        let segments = [];
        let subsegments = [];
        let realEstateObjects = [];
        let listings = [];

        if (!report.filters.segment_id) {
            // УРОВЕНЬ 1: Только область - экспортируем всё
            addresses = await window.db.getAddressesInMapArea(areaId);
            segments = await window.db.getSegmentsByMapArea(areaId);

            // Получаем все подсегменты для всех сегментов
            for (const segment of segments) {
                const segmentSubsegments = await window.db.getSubsegmentsBySegment(segment.id);
                subsegments.push(...segmentSubsegments);
            }

        } else if (!report.filters.subsegment_id) {
            // УРОВЕНЬ 2: Выбран сегмент - экспортируем данные сегмента
            try {
                const segment = await window.db.getSegment(report.filters.segment_id);

                if (segment && segment.filters && segment.filters.addresses) {
                    // Получаем адреса из структуры сегмента
                    for (const addressId of segment.filters.addresses) {
                        try {
                            const address = await window.db.getAddress(addressId);
                            if (address) addresses.push(address);
                        } catch (error) {
                            console.warn('Не удалось получить адрес сегмента:', addressId, error);
                        }
                    }

                    // Получаем объекты по адресам сегмента
                    for (const addressId of segment.filters.addresses) {
                        try {
                            const addressObjects = await window.db.getObjectsByAddress(addressId);
                            if (addressObjects && addressObjects.length > 0) {
                                realEstateObjects.push(...addressObjects);
                            }
                        } catch (error) {
                            console.warn('Не удалось получить объекты по адресу:', addressId, error);
                        }
                    }
                }

                // Получаем подсегменты только для выбранного сегмента
                subsegments = await window.db.getSubsegmentsBySegment(report.filters.segment_id);

            } catch (error) {
                console.warn('Не удалось получить данные сегмента:', report.filters.segment_id, error);
            }

        } else {
            // УРОВЕНЬ 3: Выбран подсегмент - экспортируем только данные подсегмента
            try {
                const targetSubsegment = await window.db.getSubsegment(report.filters.subsegment_id);
                const segment = await window.db.getSegment(report.filters.segment_id);

                if (segment && segment.filters && segment.filters.addresses && targetSubsegment) {
                    // Получаем адреса из структуры сегмента
                    for (const addressId of segment.filters.addresses) {
                        try {
                            const address = await window.db.getAddress(addressId);
                            if (address) addresses.push(address);
                        } catch (error) {
                            console.warn('Не удалось получить адрес сегмента:', addressId, error);
                        }
                    }

                    // Получаем ВСЕ объекты по адресам сегмента
                    let allSegmentObjects = [];
                    for (const addressId of segment.filters.addresses) {
                        try {
                            const addressObjects = await window.db.getObjectsByAddress(addressId);
                            if (addressObjects && addressObjects.length > 0) {
                                allSegmentObjects.push(...addressObjects);
                            }
                        } catch (error) {
                            console.warn('Не удалось получить объекты по адресу:', addressId, error);
                        }
                    }

                    // Фильтруем объекты по условиям подсегмента
                    realEstateObjects = allSegmentObjects.filter(obj => {
                        return this.objectMatchesSubsegment(obj, targetSubsegment);
                    });
                }

            } catch (error) {
                console.warn('Не удалось получить данные подсегмента:', report.filters.subsegment_id, error);
            }
        }

        // Получаем объявления для всех найденных объектов
        for (const object of realEstateObjects) {
            try {
                // Получаем объявления принадлежащие конкретному объекту
                const objectListings = await window.db.getByIndex('listings', 'object_id', object.id);

                if (objectListings && objectListings.length > 0) {
                    listings.push(...objectListings);
                }
            } catch (listingError) {
                console.warn('Не удалось получить объявления для объекта:', object.id, listingError);
            }
        }

        // 🔧 ОБОГАЩЕНИЕ АДРЕСОВ СПРАВОЧНЫМИ ДАННЫМИ
        if (addresses.length > 0) {
            if (this.debugEnabled) {
                console.log('📋 ReportsManager: Обогащаем адреса справочными данными...');
            }

            addresses = await this.enrichAddressesWithReferenceData(addresses);

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: Адреса обогащены справочными данными');
            }
        }

        // Собираем данные дублей для таблицы используя уже отфильтрованные объекты и листинги
        let duplicatesData = null;
        try {
            duplicatesData = this.buildDuplicatesData(realEstateObjects, listings, addresses);
            if (this.debugEnabled) {
                console.log('✅ ReportsManager: Данные дублей собраны', {
                    tableDataCount: duplicatesData?.tableData?.length || 0,
                    addressesMapKeys: duplicatesData?.addressesMap ? Object.keys(duplicatesData.addressesMap).length : 0
                });
            }
        } catch (error) {
            console.warn('⚠️ ReportsManager: Ошибка сбора данных дублей:', error);
        }

        // Формируем полную структуру экспорта
        const exportData = {
            // Метаданные экспорта
            export_info: {
                export_date: new Date().toISOString(),
                version: "1.0",
                area_id: areaId,
                report_id: report.id,
                generated_by: "Neocenka Extension"
            },
            
            // Данные отчёта
            report: {
                id: report.id,
                name: report.name,
                type: report.type,
                filter_template_id: report.filter_template_id,
                filters: report.filters,
                comparative_analysis: report.comparative_analysis,
                charts_data: report.charts_data,
                flipping_data: report.flipping_data,
                created_at: report.created_at
            },
            
            // Данные области
            area: area,
            
            // Адреса (уровень зависит от выбора)
            addresses: addresses,

            // Сегменты и подсегменты (только если нужны)
            segments: segments.length > 0 ? segments.map(segment => ({
                ...segment,
                subsegments: subsegments.filter(sub => sub.segment_id === segment.id)
            })) : [],
            
            // Объекты недвижимости с объявлениями
            real_estate_objects: realEstateObjects.map(object => ({
                ...object,
                listings: listings.filter(listing => listing.object_id === object.id)
            })),

            // Данные дублей для таблицы
            duplicates_data: duplicatesData
        };
        
        // Логируем параметры экспорта HTML отчёта
        const exportLevel = !report.filters.segment_id ? 'ОБЛАСТЬ' :
                           !report.filters.subsegment_id ? 'СЕГМЕНТ' : 'ПОДСЕГМЕНТ';

        console.log('📊 ReportsManager: Параметры HTML экспорта:', {
            level: exportLevel,
            addresses: addresses.length,
            segments: segments.length,
            subsegments: subsegments.length,
            objects: realEstateObjects.length,
            listings: listings.length,
            segment: report.filters.segment_name || 'Вся область',
            subsegment: report.filters.subsegment_name || 'Все подсегменты',
            report_name: report.name,
            hasFlippingData: !!exportData.report.flipping_data,
            flippingObjectsCount: exportData.report.flipping_data?.objects?.length || 0
        });

        return exportData;
    }

    /**
     * Сбор данных объектов и листингов для таблицы дублей
     * Использует ту же логику что и collectReportExportData
     */
    async collectReportDataForDuplicates(filters) {
        try {
            const areaId = this.areaPage?.currentArea?.id;
            if (!areaId) return null;

            let addresses = [];
            let realEstateObjects = [];
            let listings = [];

            const segmentId = filters.segment_id;
            const subsegmentId = filters.subsegment_id;

            if (!segmentId) {
                // УРОВЕНЬ 1: Только область - экспортируем всё
                addresses = await window.db.getAddressesInMapArea(areaId);
            } else if (!subsegmentId) {
                // УРОВЕНЬ 2: Выбран сегмент
                const segment = await window.db.getSegment(segmentId);
                if (segment && segment.filters && segment.filters.addresses) {
                    for (const addressId of segment.filters.addresses) {
                        try {
                            const address = await window.db.getAddress(addressId);
                            if (address) addresses.push(address);

                            const addressObjects = await window.db.getObjectsByAddress(addressId);
                            if (addressObjects && addressObjects.length > 0) {
                                realEstateObjects.push(...addressObjects);
                            }
                        } catch (error) {
                            console.warn('Не удалось получить данные по адресу:', addressId, error);
                        }
                    }
                }
            } else {
                // УРОВЕНЬ 3: Выбран подсегмент
                const segment = await window.db.getSegment(segmentId);
                const subsegment = await window.db.getSubsegment(subsegmentId);

                if (segment && segment.filters && segment.filters.addresses && subsegment) {
                    for (const addressId of segment.filters.addresses) {
                        try {
                            const address = await window.db.getAddress(addressId);
                            if (address) addresses.push(address);

                            const addressObjects = await window.db.getObjectsByAddress(addressId);
                            if (addressObjects && addressObjects.length > 0) {
                                realEstateObjects.push(...addressObjects);
                            }
                        } catch (error) {
                            console.warn('Не удалось получить данные по адресу:', addressId, error);
                        }
                    }

                    // Фильтруем по условиям подсегмента
                    realEstateObjects = realEstateObjects.filter(obj => {
                        return this.objectMatchesSubsegment(obj, subsegment);
                    });
                }
            }

            // Получаем объявления для всех найденных объектов
            for (const object of realEstateObjects) {
                try {
                    const objectListings = await window.db.getByIndex('listings', 'object_id', object.id);
                    if (objectListings && objectListings.length > 0) {
                        listings.push(...objectListings);
                    }
                } catch (error) {
                    console.warn('Не удалось получить объявления для объекта:', object.id, error);
                }
            }

            return {
                objects: realEstateObjects,
                listings: listings,
                addresses: addresses
            };

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка сбора данных для дублей:', error);
            return null;
        }
    }

    /**
     * Формирование данных дублей из уже отфильтрованных объектов и листингов
     * @param {Array} realEstateObjects - Уже отфильтрованные объекты
     * @param {Array} listings - Уже отфильтрованные листинги
     * @param {Array} addresses - Адреса
     */
    buildDuplicatesData(realEstateObjects, listings, addresses) {
        try {
            // Создаём addressesMap
            const addressesObject = {};
            addresses.forEach(addr => {
                addressesObject[addr.id] = addr;
            });

            // Обогащаем объекты информацией об адресе и типе
            const objectsData = realEstateObjects.map(obj => ({
                ...obj,
                address: addressesObject[obj.address_id],
                type: 'object'
            }));

            // Добавляем тип к листингам (нужны для получения в дочерних таблицах)
            const listingsData = listings.map(listing => ({
                ...listing,
                type: 'listing'
            }));

            // В таблицу дублей добавляем только объекты
            // Листинги добавляем отдельно для доступа из дочерних таблиц
            const tableData = [
                ...objectsData,
                ...listingsData  // Листинги нужны для поиска по object_id в дочерних таблицах
            ];

            return {
                tableData: tableData,
                addressesMap: addressesObject
            };

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка формирования данных дублей:', error);
            return null;
        }
    }

    /**
     * Проверка точки в полигоне
     */
    isPointInPolygon(point, polygon) {
        const lat = point[0];
        const lng = point[1];
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0];
            const yi = polygon[i][1];
            const xj = polygon[j][0];
            const yj = polygon[j][1];

            if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Проверка соответствия объекта подсегменту
     */
    objectMatchesSubsegment(object, subsegment) {
        // Получаем фильтры подсегмента
        const filters = subsegment.filters;
        if (!filters) {
            return true; // Если нет фильтров, объект подходит
        }
        
        // Проверяем тип недвижимости (комнатность)
        if (filters.property_type && filters.property_type.length > 0) {
            if (!filters.property_type.includes(object.property_type)) {
                return false;
            }
        }
        
        // Проверяем площадь (используем area_total для объектов)
        const objectArea = object.area_total || object.area;
        if (filters.area_from && objectArea < filters.area_from) {
            return false;
        }
        if (filters.area_to && objectArea > filters.area_to) {
            return false;
        }
        
        // Проверяем этаж
        if (filters.floor_from && object.floor < filters.floor_from) {
            return false;
        }
        if (filters.floor_to && object.floor > filters.floor_to) {
            return false;
        }
        
        // Проверяем цену (используем current_price для объектов)
        const objectPrice = object.current_price || object.price;
        if (filters.price_from && objectPrice < filters.price_from) {
            return false;
        }
        if (filters.price_to && objectPrice > filters.price_to) {
            return false;
        }
        
        return true;
    }

    /**
     * Генерация имени файла для экспорта
     */
    generateExportFileName(reportName) {
        // Очищаем название от недопустимых символов
        const cleanName = reportName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_');
            
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        return `neocenka_report_${cleanName}_${timestamp}.json`;
    }

    /**
     * Скачивание JSON файла
     */
    downloadJSONFile(data, fileName) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        // Очищаем ссылку
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Скачивание HTML файла
     */
    downloadHTMLFile(htmlContent, fileName) {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        // Очищаем ссылку
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===== ЭКСПОРТ ОТЧЁТОВ В HTML =====

    /**
     * Скачивание отчёта в формате HTML
     */
    async downloadReportAsHTML(reportId) {
        let button, originalText;
        try {
            // Показываем индикатор загрузки
            button = $(`[data-report-id="${reportId}"][data-action="download-html"]`);
            originalText = button.html();
            button.html('⏳ Генерация...').prop('disabled', true);
            
            if (this.debugEnabled) {
            }
            
            // Получаем отчёт
            const report = await window.db.getSavedReport(reportId);
            if (!report) {
                if (this.areaPage && this.areaPage.uiManager) {
                    this.areaPage.uiManager.showNotification({
                        type: 'error',
                        message: 'Отчёт не найден',
                        duration: 4000
                    });
                }
                return;
            }

            console.log('📄 Отчёт загружен из БД:', {
                reportId: reportId,
                hasFlippingData: !!report.flipping_data,
                flippingObjectsCount: report.flipping_data?.objects?.length || 0,
                hasChartsData: !!report.charts_data
            });
            
            // Собираем данные отчёта
            const exportData = await this.collectReportExportData(report);
            
            // Генерируем HTML через HTMLExportManager
            let htmlContent;
            if (this.htmlExportManager) {
                htmlContent = await this.htmlExportManager.generateHTMLReport(exportData);
            } else {
                // Fallback на старый метод
                htmlContent = await this.generateHTMLReportFallback(exportData);
            }
            
            // Создаём имя файла
            const fileName = this.generateHTMLFileName(report.name);
            
            // Скачиваем файл
            this.downloadHTMLFile(htmlContent, fileName);
            
            
            // Показываем уведомление об успешном экспорте
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `📄 HTML отчёт "${report.name}" сгенерирован`,
                    duration: 3000
                });
            }
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка генерации HTML отчёта:', error);
            
            // Показываем уведомление об ошибке
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'error',
                    message: 'Ошибка генерации HTML отчёта',
                    duration: 5000
                });
            }
        } finally {
            // Восстанавливаем кнопку
            if (button && originalText) {
                button.html(originalText).prop('disabled', false);
            }
        }
    }

    /**
     * Генерация имени HTML файла для экспорта
     */
    generateHTMLFileName(reportName) {
        // Очищаем название от недопустимых символов
        const cleanName = reportName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_');
            
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        return `neocenka_report_${cleanName}_${timestamp}.html`;
    }

    /**
     * Генерация HTML отчёта (fallback метод)
     */
    async generateHTMLReportFallback(exportData) {
        const { report, area, addresses, segments, real_estate_objects, export_info } = exportData;
        
        // Формируем заголовок отчёта
        const reportTitle = report.name;
        const reportDate = new Date(report.created_at).toLocaleDateString('ru-RU');
        const exportDate = new Date(export_info.export_date).toLocaleDateString('ru-RU');
        
        // Подготавливаем данные для графиков (если есть)
        const chartsData = report.charts_data || {};
        
        // Подготавливаем данные объектов для таблицы
        const objectsTableData = real_estate_objects;
        
        // Подготавливаем данные сравнительного анализа
        const comparativeAnalysis = report.comparative_analysis || {};
        
        // Генерируем HTML контент
        const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчёт Neocenka: ${reportTitle}</title>
    <style>
        ${this.getEmbeddedCSS()}
    </style>
    <!-- Встроенные библиотеки -->
    <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.44.0/dist/apexcharts.min.js"></script>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css">
</head>
<body>
    <!-- Заголовок отчёта -->
    <header class="report-header">
        <div class="container">
            <div class="header-content">
                <div class="logo-section">
                    <h1>🏠 Neocenka</h1>
                    <p class="tagline">Анализ рынка недвижимости</p>
                </div>
                <div class="report-info">
                    <h2>${reportTitle}</h2>
                    <div class="report-meta">
                        <span>Создан: ${reportDate}</span>
                        <span>Экспортирован: ${exportDate}</span>
                        <span>Область: ${area.name}</span>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Основное содержимое -->
    <main class="container">
        <!-- Параметры фильтра -->
        ${this.generateFilterSummaryHTML(report.filters)}
        
        <!-- Графики -->
        ${this.generateChartsHTML(chartsData)}
        
        <!-- Карта области -->
        ${this.generateMapHTML(area, real_estate_objects)}
        
        <!-- Таблица объектов -->
        ${this.generateObjectsTableHTML(objectsTableData)}
        
        <!-- Сравнительный анализ -->
        ${this.generateComparativeAnalysisHTML(comparativeAnalysis)}
        
        <!-- Статистика -->
        ${this.generateStatisticsHTML(export_info, real_estate_objects)}
    </main>

    <!-- Футер -->
    <footer class="report-footer">
        <div class="container">
            <div class="footer-content">
                <div class="generated-info">
                    <p>Отчёт сгенерирован расширением Neocenka Extension</p>
                    <p class="timestamp">${export_info.export_date}</p>
                </div>
                <div class="contact-info">
                    <p>Для получения актуальных данных используйте расширение Neocenka</p>
                </div>
            </div>
        </div>
    </footer>

    <!-- Встроенные данные и скрипты -->
    <script>
        // Данные отчёта
        const reportData = ${JSON.stringify(exportData, null, 2)};
        
        // Инициализация интерактивных элементов
        document.addEventListener('DOMContentLoaded', function() {
            ${this.generateInitializationScript(chartsData, area, real_estate_objects)}
        });
    </script>
</body>
</html>`;

        return htmlContent;
    }

    // ===== МЕТОДЫ ПОЛУЧЕНИЯ ДАННЫХ ГРАФИКОВ ДЛЯ ЭКСПОРТА =====

    /**
     * Получение текущих данных графика ликвидности
     */
    getCurrentLiquidityChartData() {
        try {
            if (!this.liquidityChart || !this.liquidityChart.w || !this.liquidityChart.w.config) {
                if (this.debugEnabled) {
                    console.log('🔍 ReportsManager: График ликвидности не инициализирован');
                }
                return null;
            }

            const config = this.liquidityChart.w.config;

            return {
                series: config.series || [],
                options: {
                    chart: config.chart || {},
                    xaxis: config.xaxis || {},
                    yaxis: config.yaxis || [],
                    colors: config.colors || [],
                    plotOptions: config.plotOptions || {},
                    legend: config.legend || {},
                    tooltip: config.tooltip || {},
                    dataLabels: config.dataLabels || {},
                    grid: config.grid || {}
                }
            };
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных графика ликвидности:', error);
            return null;
        }
    }

    /**
     * Получение текущих данных графика изменения цен
     */
    getCurrentPriceChartData() {
        try {
            if (!this.priceChangesChart || !this.priceChangesChart.w || !this.priceChangesChart.w.config) {
                if (this.debugEnabled) {
                    console.log('🔍 ReportsManager: График изменения цен не инициализирован');
                }
                return null;
            }

            const config = this.priceChangesChart.w.config;

            return {
                series: config.series || [],
                options: {
                    chart: config.chart || {},
                    xaxis: config.xaxis || {},
                    yaxis: config.yaxis || [],
                    colors: config.colors || [],
                    stroke: config.stroke || {},
                    markers: config.markers || {},
                    legend: config.legend || {},
                    tooltip: config.tooltip || {},
                    dataLabels: config.dataLabels || {},
                    grid: config.grid || {}
                }
            };
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных графика цен:', error);
            return null;
        }
    }

    /**
     * Получение данных коридора рынка
     */
    getCurrentMarketCorridorData() {
        try {
            if (!this.marketCorridorChart || !this.marketCorridorChart.w || !this.marketCorridorChart.w.config) {
                if (this.debugEnabled) {
                    console.log('🔍 ReportsManager: График коридора рынка не инициализирован');
                }
                return null;
            }

            const config = this.marketCorridorChart.w.config;

            return {
                series: config.series || [],
                mode: this.marketCorridorMode || 'sales', // 'sales' или 'history'
                options: {
                    chart: config.chart || {},
                    xaxis: config.xaxis || {},
                    yaxis: config.yaxis || [],
                    colors: config.colors || [],
                    plotOptions: config.plotOptions || {},
                    legend: config.legend || {},
                    tooltip: config.tooltip || {},
                    dataLabels: config.dataLabels || {},
                    grid: config.grid || {}
                }
            };
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных коридора рынка:', error);
            return null;
        }
    }

    /**
     * Получение данных графика создания объявлений
     */
    getCurrentCreationChartData() {
        try {
            if (!this.creationChart || !this.creationChart.w || !this.creationChart.w.config) {
                if (this.debugEnabled) {
                    console.log('🔍 ReportsManager: График создания объявлений не инициализирован');
                }
                return null;
            }

            const config = this.creationChart.w.config;

            return {
                series: config.series || [],
                period: this.creationChartPeriod?.value || 'month',
                seller_type: this.creationChartSellerType?.value || 'all',
                options: {
                    chart: config.chart || {},
                    xaxis: config.xaxis || {},
                    yaxis: config.yaxis || [],
                    colors: config.colors || [],
                    plotOptions: config.plotOptions || {},
                    legend: config.legend || {},
                    tooltip: config.tooltip || {},
                    dataLabels: config.dataLabels || {},
                    grid: config.grid || {}
                }
            };
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных графика создания:', error);
            return null;
        }
    }

    /**
     * Получение данных флиппинг отчёта
     */
    async getCurrentFlippingData() {
        try {
            if (!this.flippingProfitabilityManager) {
                console.warn('⚠️ ReportsManager: FlippingProfitabilityManager не инициализирован');
                return null;
            }

            // Проверяем есть ли метод экспорта данных
            if (typeof this.flippingProfitabilityManager.exportCurrentReportData === 'function') {
                const data = await this.flippingProfitabilityManager.exportCurrentReportData();
                console.log('📊 ReportsManager.getCurrentFlippingData результат:', {
                    hasData: !!data,
                    hasObjects: !!data?.objects,
                    objectsCount: data?.objects?.length || 0
                });
                return data;
            } else {
                console.warn('⚠️ ReportsManager: Метод exportCurrentReportData не найден в FlippingProfitabilityManager');
                return null;
            }
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных флиппинг отчёта:', error);
            return null;
        }
    }

    /**
     * Очистка данных от функций для IndexedDB
     */
    sanitizeDataForStorage(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }

        if (typeof obj === 'function') {
            return undefined; // Используем undefined вместо null
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeDataForStorage(item)).filter(item => item !== undefined);
        }

        if (typeof obj === 'object') {
            const cleaned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const value = obj[key];
                    if (typeof value !== 'function') {
                        const sanitized = this.sanitizeDataForStorage(value);
                        if (sanitized !== undefined) {
                            cleaned[key] = sanitized;
                        }
                    }
                    // Функции и undefined значения пропускаем
                }
            }
            return cleaned;
        }

        return obj; // Примитивные типы возвращаем как есть
    }

    /**
     * Получение всех данных графиков для экспорта
     */
    async getAllChartsData(reportsConfig = null) {
        try {
            // Получаем исходные данные отчётов (не конфигурацию ApexCharts)
            const reportData = await this.getReportData();

            if (!reportData) {
                if (this.debugEnabled) {
                    console.log('📊 ReportsManager: Нет данных для генерации графиков');
                }
                return {};
            }

            // Сохраняем текущий режим коридора рынка
            const originalMode = this.marketCorridorMode;

            const chartsData = {};

            // Сохраняем данные ликвидности только если отчёт включён
            if (!reportsConfig || reportsConfig.liquidity) {
                chartsData.liquidity = {
                    new: reportData.new,
                    close: reportData.close,
                    active: reportData.active,
                    datetime: reportData.datetime
                };
            }

            // Сохраняем данные изменения цен только если отчёт включён
            if (!reportsConfig || reportsConfig.price_changes) {
                chartsData.price_changes = {
                    averageСost: reportData.averageСost,
                    averageСostMeter: reportData.averageСostMeter,
                    averageСostArchive: reportData.averageСostArchive,
                    averageСostMeterArchive: reportData.averageСostMeterArchive,
                    datetime: reportData.datetime
                };
            }

            // Инициализируем market_corridor только если отчёт включён
            if (!reportsConfig || reportsConfig.market_corridor) {
                chartsData.market_corridor = {};
            }

            // Генерируем данные для обоих режимов коридора рынка только если отчёт включён
            if (!reportsConfig || reportsConfig.market_corridor) {
                try {
                    // Режим продаж
                    this.marketCorridorMode = 'sales';
                    const salesData = await this.getMarketCorridorData();
                    if (salesData && salesData.series) {
                        chartsData.market_corridor.sales = {
                            series: salesData.series,
                            mode: 'sales',
                            pointsData: salesData.pointsData,
                            seriesDataMapping: salesData.seriesDataMapping
                        };
                    }

                    // Режим истории
                    this.marketCorridorMode = 'history';
                    const historyData = await this.getMarketCorridorData();
                    if (historyData && historyData.series) {
                        chartsData.market_corridor.history = {
                            series: historyData.series,
                            mode: 'history',
                            pointsData: historyData.pointsData,
                            seriesDataMapping: historyData.seriesDataMapping
                        };
                    }
                } finally {
                    // Восстанавливаем исходный режим
                    this.marketCorridorMode = originalMode;
                }
            }

            // Очищаем данные от функций перед сохранением в IndexedDB
            const cleanedChartsData = this.sanitizeDataForStorage(chartsData);

            if (this.debugEnabled) {
                console.log('📊 ReportsManager: Собрано данных графиков:', {
                    liquidity: !!cleanedChartsData.liquidity,
                    price_changes: !!cleanedChartsData.price_changes,
                    market_corridor_sales: !!(cleanedChartsData.market_corridor && cleanedChartsData.market_corridor.sales),
                    market_corridor_history: !!(cleanedChartsData.market_corridor && cleanedChartsData.market_corridor.history)
                });
            }

            return cleanedChartsData;
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения всех данных графиков:', error);
            return {};
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        // Удаление графиков
        if (this.liquidityChart) {
            this.liquidityChart.destroy();
            this.liquidityChart = null;
        }

        if (this.priceChangesChart) {
            this.priceChangesChart.destroy();
            this.priceChangesChart = null;
        }

        // Удаление SlimSelect
        if (this.segmentSlimSelect) {
            this.segmentSlimSelect.destroy();
            this.segmentSlimSelect = null;
        }

        if (this.subsegmentSlimSelect) {
            this.subsegmentSlimSelect.destroy();
            this.subsegmentSlimSelect = null;
        }

        if (this.reportFilterSlimSelect) {
            this.reportFilterSlimSelect.destroy();
            this.reportFilterSlimSelect = null;
        }
        
        // Удаление DataTable сохранённых отчётов и обработчиков событий
        if (this.savedReportsDataTable) {
            this.savedReportsDataTable.destroy();
            this.savedReportsDataTable = null;
        }

        if (this.filterTemplatesDataTable) {
            this.filterTemplatesDataTable.destroy();
            this.filterTemplatesDataTable = null;
        }
        
        // Удаляем обработчики кнопок действий
        $(document).off('click', '.report-action-btn');
        $(document).off('click', '.template-action-btn');

        // Удаляем индикаторы загрузки и фильтрации
        $('#templateLoadingIndicator').remove();
        $('.filter-indicator').remove();

        // Удаление обработчиков событий EventBus
        this.eventBus.off(CONSTANTS.EVENTS.AREA_LOADED);
        this.eventBus.off(CONSTANTS.EVENTS.SEGMENTS_UPDATED);
        this.eventBus.off(CONSTANTS.EVENTS.SUBSEGMENT_CREATED);
        this.eventBus.off(CONSTANTS.EVENTS.SUBSEGMENT_UPDATED);
        this.eventBus.off(CONSTANTS.EVENTS.SUBSEGMENT_DELETED);

        if (this.debugEnabled) {
        }
    }

    // ===== ГРАФИК СОЗДАНИЯ ОБЪЯВЛЕНИЙ =====

    /**
     * Обновление графика создания объявлений
     */
    async updateCreationChart() {
        try {
            if (!this.creationChartPeriod || !this.creationChartSellerType) {
                return;
            }

            const period = this.creationChartPeriod.value || 'days';
            const sellerType = this.creationChartSellerType.value || 'owner';

            // Получаем данные для графика
            const chartData = await this.getCreationChartData(period, sellerType);

            // Рендерим график
            this.renderCreationChart(chartData, period, sellerType);

            // Обновляем сводку
            this.updateCreationSummary(chartData, sellerType, period);

            if (this.debugEnabled) {
                console.log('📊 График создания объявлений обновлён:', { period, sellerType, dataPoints: chartData.length });
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка обновления графика создания объявлений:', error);
        }
    }

    /**
     * Получение данных для графика создания объявлений
     */
    async getCreationChartData(period, sellerType) {
        try {
            const currentArea = this.areaPage.dataState?.getState('currentArea');
            if (!currentArea) return [];

            // Получаем объявления из кеша или напрямую из БД
            let listings;
            if (window.dataCacheManager) {
                listings = await window.dataCacheManager.getAll('listings');
            } else {
                // Резервный механизм - прямое обращение к БД
                console.warn('⚠️ DataCacheManager недоступен, используем прямое обращение к БД');
                listings = await window.db.getAll('listings');
            }

            // Фильтруем объявления по области
            const areaListings = listings.filter(listing => listing.map_area_id === currentArea.id);

            // Фильтруем по типу продавца
            let filteredListings = areaListings;
            if (sellerType === 'owner') {
                filteredListings = areaListings.filter(listing => listing.seller_type === 'owner');
            } else if (sellerType === 'agent') {
                filteredListings = areaListings.filter(listing => listing.seller_type === 'agent');
            }

            // Фильтруем объявления с валидной датой создания
            const validListings = filteredListings.filter(listing =>
                listing.created && listing.created !== null && new Date(listing.created).getTime() > 0
            );

            // Агрегируем данные по периоду
            if (period === 'days') {
                return this.aggregateCreationByDays(validListings, 30);
            } else {
                return this.aggregateCreationByMonths(validListings, 12);
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных графика создания:', error);
            return [];
        }
    }

    /**
     * Агрегация данных по дням
     */
    aggregateCreationByDays(listings, days) {
        const now = new Date();
        const result = [];

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const count = listings.filter(listing => {
                const createdDate = new Date(listing.created);
                return createdDate >= date && createdDate < nextDate;
            }).length;

            result.push({
                date: date.toISOString().split('T')[0],
                count: count,
                label: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
            });
        }

        return result;
    }

    /**
     * Агрегация данных по месяцам
     */
    aggregateCreationByMonths(listings, months) {
        const now = new Date();
        const result = [];

        for (let i = months - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);

            const count = listings.filter(listing => {
                const createdDate = new Date(listing.created);
                return createdDate >= date && createdDate < nextDate;
            }).length;

            result.push({
                date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                count: count,
                label: date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })
            });
        }

        return result;
    }

    /**
     * Рендеринг графика создания объявлений
     */
    renderCreationChart(data, period, sellerType) {
        const container = document.getElementById('creationChart');
        if (!container) return;

        // Уничтожаем предыдущий график
        if (this.creationChart) {
            this.creationChart.destroy();
        }

        const options = {
            chart: {
                type: 'line',
                height: 320,
                toolbar: {
                    show: false
                },
                zoom: {
                    enabled: false
                }
            },
            series: [{
                name: 'Количество объявлений',
                data: data.map(item => item.count)
            }],
            xaxis: {
                categories: data.map(item => item.label),
                title: {
                    text: period === 'days' ? 'Дни' : 'Месяцы'
                }
            },
            yaxis: {
                title: {
                    text: 'Количество'
                },
                min: 0
            },
            title: {
                text: this.getChartTitle(period, sellerType),
                align: 'left',
                style: {
                    fontSize: '16px',
                    fontWeight: 500
                }
            },
            stroke: {
                curve: 'smooth',
                width: 3
            },
            colors: ['#3b82f6'],
            grid: {
                show: true,
                borderColor: '#e5e7eb'
            },
            markers: {
                size: 4,
                colors: ['#3b82f6'],
                strokeWidth: 0,
                hover: {
                    size: 6
                }
            },
            tooltip: {
                y: {
                    formatter: function(value) {
                        return value + ' объявлений';
                    }
                }
            }
        };

        this.creationChart = new ApexCharts(container, options);
        this.creationChart.render();
    }

    /**
     * Получение заголовка графика
     */
    getChartTitle(period, sellerType) {
        const periodText = period === 'days' ? 'по дням' : 'по месяцам';
        const sellerText = sellerType === 'owner' ? 'от собственников' :
                          sellerType === 'agent' ? 'от агентов' : 'всего';
        return `Создание объявлений ${periodText} (${sellerText})`;
    }

    /**
     * Обновление сводки
     */
    async updateCreationSummary(chartData, sellerType, period) {
        try {
            const currentArea = this.areaPage.dataState?.getState('currentArea');
            if (!currentArea) return;

            // Получаем все объявления для подсчета типов продавцов
            let allListings;
            if (window.dataCacheManager) {
                allListings = await window.dataCacheManager.getAll('listings');
            } else {
                console.warn('⚠️ DataCacheManager недоступен, используем прямое обращение к БД');
                allListings = await window.db.getAll('listings');
            }
            const areaListings = allListings.filter(listing =>
                listing.map_area_id === currentArea.id &&
                listing.created && listing.created !== null && new Date(listing.created).getTime() > 0
            );

            const totalCreated = chartData.reduce((sum, item) => sum + item.count, 0);
            const avgPerPeriod = totalCreated > 0 ? (totalCreated / chartData.length).toFixed(1) : 0;
            const maxPerPeriod = chartData.length > 0 ? Math.max(...chartData.map(item => item.count)) : 0;

            const ownerCount = areaListings.filter(listing => listing.seller_type === 'owner').length;
            const agentCount = areaListings.filter(listing => listing.seller_type === 'agent').length;

            // Обновляем элементы сводки
            this.updateSummaryElement('totalCreated', totalCreated);
            this.updateSummaryElement('avgPerDay', avgPerPeriod);
            this.updateSummaryElement('maxPerDay', maxPerPeriod);
            this.updateSummaryElement('ownerCount', ownerCount);
            this.updateSummaryElement('agentCount', agentCount);

            // Обновляем подписи в зависимости от периода
            this.updateSummaryLabels(period);

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка обновления сводки:', error);
        }
    }

    /**
     * Обновление элемента сводки
     */
    updateSummaryElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    /**
     * Обновление подписей сводки в зависимости от периода
     */
    updateSummaryLabels(period) {
        const avgLabel = period === 'days' ? 'Среднее в день:' : 'Среднее в месяц:';
        const maxLabel = period === 'days' ? 'Максимум в день:' : 'Максимум в месяц:';

        // Найдем элементы label и обновим их текст
        const avgLabelElement = document.querySelector('#creationSummary .flex:nth-child(2) .text-gray-600');
        const maxLabelElement = document.querySelector('#creationSummary .flex:nth-child(3) .text-gray-600');

        if (avgLabelElement) {
            avgLabelElement.textContent = avgLabel;
        }

        if (maxLabelElement) {
            maxLabelElement.textContent = maxLabel;
        }
    }

    /**
     * Экспорт текущих отчётов в HTML
     */
    async exportCurrentReportsAsHTML() {
        try {
            if (this.debugEnabled) {
                console.log('📄 ReportsManager: Начинаем экспорт текущих отчётов в HTML');
            }

            // Проверяем доступность HTMLExportManager
            if (!this.htmlExportManager) {
                throw new Error('HTMLExportManager не инициализирован');
            }

            // Получаем данные текущей области
            const area = this.areaPage.currentArea;
            if (!area) {
                throw new Error('Не выбрана область для экспорта');
            }

            // Собираем данные дублей для таблицы
            let duplicatesData = null;
            try {
                const filters = {
                    segment_id: this.currentSegment?.id || null,
                    subsegment_id: this.currentSubsegment?.id || null
                };
                const duplicatesInputData = await this.collectReportDataForDuplicates(filters);
                if (duplicatesInputData) {
                    duplicatesData = this.buildDuplicatesData(
                        duplicatesInputData.objects,
                        duplicatesInputData.listings,
                        duplicatesInputData.addresses
                    );
                    if (this.debugEnabled) {
                        console.log('✅ ReportsManager: Данные дублей для текущего экспорта собраны', {
                            objects: duplicatesInputData.objects.length,
                            listings: duplicatesInputData.listings.length,
                            tableDataCount: duplicatesData?.tableData?.length || 0
                        });
                    }
                }
            } catch (error) {
                console.warn('⚠️ ReportsManager: Ошибка сбора данных дублей для текущего экспорта:', error);
            }

            // Получаем данные текущих отчётов
            const exportData = {
                // Данные области
                area: {
                    id: area.id,
                    name: area.name,
                    polygon: area.polygon,
                    created_at: area.created_at
                },

                // Выбранный сегмент/подсегмент
                segment: this.currentSegment ? {
                    id: this.currentSegment.id,
                    name: this.currentSegment.name,
                    filters: this.currentSegment.filters
                } : null,

                subsegment: this.currentSubsegment ? {
                    id: this.currentSubsegment.id,
                    name: this.currentSubsegment.name,
                    filters: this.currentSubsegment.filters
                } : null,

                // Данные для отчётов
                reports_data: {
                    liquidity: this.getCurrentLiquidityChartData(),
                    price_changes: this.getCurrentPriceChangesChartData(),
                    market_corridor: this.getCurrentMarketCorridorChartData(),
                    comparative_analysis: this.getCurrentComparativeAnalysisData(),
                    flipping_profitability: await this.getCurrentFlippingData()
                },

                // Адреса для карты
                addresses: await this.getSubsegmentAddresses(),

                // Данные дублей для таблицы
                duplicates_data: duplicatesData,

                // Мета-информация
                export_info: {
                    generated_at: new Date().toISOString(),
                    period_from: this.dateFromFilter ? this.dateFromFilter.value : '',
                    period_to: this.dateToFilter ? this.dateToFilter.value : '',
                    filter_name: this.getActiveFilterName()
                }
            };

            // Генерируем HTML через новый HTMLExportManager
            const htmlContent = await this.htmlExportManager.generateHTMLReport(exportData);

            // Создаём имя файла
            const fileName = `отчёт_${area.name}_${new Date().toISOString().slice(0,10)}.html`;

            // Скачиваем файл
            this.downloadHTMLFile(htmlContent, fileName);

            // Показываем уведомление об успешном экспорте
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'success',
                    message: `📄 HTML отчёт по области "${area.name}" сгенерирован`,
                    duration: 3000
                });
            }

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: HTML экспорт текущих отчётов завершён успешно');
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка экспорта текущих отчётов в HTML:', error);

            // Показываем уведомление об ошибке
            if (this.areaPage && this.areaPage.uiManager) {
                this.areaPage.uiManager.showNotification({
                    type: 'error',
                    message: 'Ошибка экспорта текущих отчётов в HTML',
                    duration: 5000
                });
            }
        }
    }

    /**
     * Получение адресов подсегмента для карты
     */
    async getSubsegmentAddresses() {
        try {
            if (!this.areaPage.currentArea) {
                return [];
            }

            // Получаем объекты текущего сегмента/подсегмента
            const objects = await window.db.getRealEstateObjectsByAreaAndSegment(
                this.areaPage.currentArea.id,
                this.currentSegment?.id,
                this.currentSubsegment?.id
            );

            // Получаем уникальные адреса
            const addressIds = [...new Set(objects.map(obj => obj.address_id))];
            const addresses = await Promise.all(
                addressIds.map(id => window.db.getAddress(id))
            );

            return addresses.filter(addr => addr && addr.coordinates);

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения адресов подсегмента:', error);
            return [];
        }
    }

    /**
     * Получение названия активного фильтра
     */
    getActiveFilterName() {
        const parts = [];

        if (this.currentSegment) {
            parts.push(this.currentSegment.name);
        }

        if (this.currentSubsegment) {
            parts.push(this.currentSubsegment.name);
        }

        return parts.length > 0 ? parts.join(' → ') : 'Все объекты';
    }

    /**
     * Обогащение адресов справочными данными для отчёта
     */
    async enrichAddressesWithReferenceData(addresses) {
        try {
            // Получаем все справочники параллельно
            const [houseSeries, houseClasses, wallMaterials, ceilingMaterials] = await Promise.all([
                window.db.getAll('house_series'),
                window.db.getAll('house_classes'),
                window.db.getAll('wall_materials'),
                window.db.getAll('ceiling_materials')
            ]);

            // Создаем мапы для быстрого поиска
            const houseSeriesMap = new Map(houseSeries.map(item => [item.id, item.name]));
            const houseClassesMap = new Map(houseClasses.map(item => [item.id, item.name]));
            const wallMaterialsMap = new Map(wallMaterials.map(item => [item.id, item.name]));
            const wallMaterialsColorMap = new Map(wallMaterials.map(item => [item.id, item.color]));
            const ceilingMaterialsMap = new Map(ceilingMaterials.map(item => [item.id, item.name]));

            // Обогащаем каждый адрес
            return addresses.map(address => ({
                ...address,
                // Добавляем текстовые названия справочников
                house_series: address.house_series_id ? houseSeriesMap.get(address.house_series_id) : null,
                house_class: address.house_class_id ? houseClassesMap.get(address.house_class_id) : null,
                wall_material: address.wall_material_id ? wallMaterialsMap.get(address.wall_material_id) : null,
                wall_material_color: address.wall_material_id ? wallMaterialsColorMap.get(address.wall_material_id) : null,
                ceiling_material: address.ceiling_material_id ? ceilingMaterialsMap.get(address.ceiling_material_id) : null,

                // Для совместимости с разными названиями полей
                floors: address.floors_count,
                house_year: address.build_year
            }));

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка обогащения адресов справочными данными:', error);
            // Возвращаем исходные адреса в случае ошибки
            return addresses;
        }
    }
}