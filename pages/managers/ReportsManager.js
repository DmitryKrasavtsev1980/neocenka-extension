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
        
        // Графики
        this.liquidityChart = null;
        this.priceChangesChart = null;
        this.marketCorridorChart = null;
        
        // Данные
        this.segments = [];
        this.subsegments = [];
        this.currentSegment = null;
        this.currentSubsegment = null;
        
        this.debugEnabled = false;
    }

    /**
     * Инициализация менеджера отчётов
     */
    async initialize() {
        try {
            if (this.debugEnabled) {
                console.log('🔍 ReportsManager: Инициализация...');
            }

            // Получение настроек отладки
            await this.loadDebugSettings();

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

            // Первоначальное обновление видимости отчётов
            await this.updateReportsVisibility();

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: Инициализация завершена');
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка инициализации:', error);
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

        if (!this.panelContainer) {
            throw new Error('Элемент reportsPanelContainer не найден');
        }

        if (this.debugEnabled) {
            console.log('🔍 ReportsManager: Элементы интерфейса инициализированы');
        }
    }

    /**
     * Установка обработчиков событий
     */
    setupEventHandlers() {
        // Сворачивание/разворачивание панели
        if (this.panelHeader) {
            this.panelHeader.addEventListener('click', () => {
                this.togglePanel();
            });
        }

        // Показать/скрыть выпадающий список отчётов
        if (this.reportsDropdownBtn) {
            this.reportsDropdownBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleReportsDropdown();
            });
        }

        // Закрытие выпадающего списка при клике вне его
        document.addEventListener('click', (e) => {
            if (this.reportsDropdown && this.reportsDropdownBtn &&
                !this.reportsDropdownBtn.contains(e.target) && 
                !this.reportsDropdown.contains(e.target)) {
                this.reportsDropdown.classList.add('hidden');
            }
        });

        // Обработчики чекбоксов отчётов
        const liquidityCheck = document.getElementById('liquidityReportCheck');
        const priceChangesCheck = document.getElementById('priceChangesReportCheck');
        const marketCorridorCheck = document.getElementById('marketCorridorReportCheck');
        
        if (liquidityCheck) {
            liquidityCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
            });
        }
        
        if (priceChangesCheck) {
            priceChangesCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
            });
        }

        if (marketCorridorCheck) {
            marketCorridorCheck.addEventListener('change', () => {
                this.updateReportsVisibility();
            });
        }

        // События SlimSelect будут обработаны после инициализации

        // События EventBus
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
            console.log('🔍 ReportsManager: Обработчики событий установлены');
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
                            const subsegmentId = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value : 
                                               (newVal && newVal.value !== undefined ? newVal.value : newVal);
                            console.log('🔍 ReportsManager: SlimSelect подсегмент изменен:', newVal, 'извлечено ID:', subsegmentId);
                            this.handleSubsegmentChange(subsegmentId);
                        }
                    }
                });
                
                if (this.debugEnabled) {
                    console.log('🔍 ReportsManager: SlimSelect для подсегментов инициализирован (отключен)');
                }
            }
            
            if (this.debugEnabled) {
                console.log('🔍 ReportsManager: SlimSelect инициализация завершена');
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка инициализации SlimSelect:', error);
        }
    }

    /**
     * Сворачивание/разворачивание панели
     */
    togglePanel() {
        if (!this.panelContent || !this.panelChevron) return;

        const isHidden = this.panelContent.classList.contains('hidden');
        
        if (isHidden) {
            this.panelContent.classList.remove('hidden');
            this.panelChevron.style.transform = 'rotate(0deg)';
        } else {
            this.panelContent.classList.add('hidden');
            this.panelChevron.style.transform = 'rotate(-90deg)';
        }

        if (this.debugEnabled) {
            console.log('🔍 ReportsManager: Панель', isHidden ? 'развернута' : 'свернута');
        }
    }

    /**
     * Показать/скрыть выпадающий список отчётов
     */
    toggleReportsDropdown() {
        if (!this.reportsDropdown) return;

        this.reportsDropdown.classList.toggle('hidden');

        if (this.debugEnabled) {
            console.log('🔍 ReportsManager: Выпадающий список отчётов переключен');
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
        
        const showLiquidity = liquidityCheck?.checked || false;
        const showPriceChanges = priceChangesCheck?.checked || false;
        const showMarketCorridor = marketCorridorCheck?.checked || false;

        // Показать контейнер отчётов если выбран хотя бы один отчёт
        if (showLiquidity || showPriceChanges || showMarketCorridor) {
            this.reportsContent.classList.remove('hidden');
            
            // Генерация отчётов
            await this.generateReports();
            
            // Показать/скрыть конкретные отчёты
            const liquidityReport = document.querySelector('#liquidityChart').closest('.bg-white');
            const priceChangesReport = document.querySelector('#priceChangesChart').closest('.bg-white');
            const marketCorridorReport = document.querySelector('#marketCorridorChart').closest('.bg-white');
            
            if (liquidityReport) {
                liquidityReport.style.display = showLiquidity ? 'block' : 'none';
            }
            
            if (priceChangesReport) {
                priceChangesReport.style.display = showPriceChanges ? 'block' : 'none';
            }

            if (marketCorridorReport) {
                marketCorridorReport.style.display = showMarketCorridor ? 'block' : 'none';
            }
        } else {
            this.reportsContent.classList.add('hidden');
        }

        if (this.debugEnabled) {
            console.log('🔍 ReportsManager: Видимость отчётов обновлена', {
                showLiquidity,
                showPriceChanges,
                showMarketCorridor
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
                    console.log('🔍 ReportsManager: Нет текущей области для загрузки сегментов');
                }
                return;
            }

            if (!this.database) {
                if (this.debugEnabled) {
                    console.log('🔍 ReportsManager: База данных недоступна');
                }
                return;
            }

            // Используем тот же метод что и в DuplicatesManager
            this.segments = await this.database.getSegmentsByMapArea(currentArea.id);
            
            // Обновление списка сегментов
            this.updateSegmentFilter();

            if (this.debugEnabled) {
                console.log('🔍 ReportsManager: Загружено сегментов:', this.segments.length, 'для области:', currentArea.name);
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
                        // newVal может быть массивом или объектом, извлекаем значение
                        const segmentId = Array.isArray(newVal) && newVal.length > 0 ? newVal[0].value : 
                                         (newVal && newVal.value !== undefined ? newVal.value : newVal);
                        console.log('🔍 ReportsManager: SlimSelect afterChange для сегмента:', newVal, 'извлечено ID:', segmentId);
                        this.handleSegmentChange(segmentId);
                    }
                }
            });
            
            // Устанавливаем пустое значение по умолчанию
            this.segmentSlimSelect.setSelected([]);
        }

        if (this.debugEnabled) {
            console.log('🔍 ReportsManager: Фильтр сегментов обновлен, сегментов:', this.segments.length);
        }
    }

    /**
     * Обработка изменения сегмента (точно как в DuplicatesManager)
     */
    async handleSegmentChange(segmentId) {
        try {
            console.log('🔍 ReportsManager: handleSegmentChange вызван с segmentId:', segmentId, 'тип:', typeof segmentId);
            
            this.currentSegment = segmentId ? this.segments.find(s => s.id === parseInt(segmentId)) : null;
            this.currentSubsegment = null;
            
            if (!segmentId) {
                console.log('🔍 ReportsManager: Сегмент не выбран, отключаем подсегменты');
                // Если сегмент не выбран, отключаем подсегменты и очищаем данные
                if (this.subsegmentSlimSelect) {
                    this.subsegmentSlimSelect.setData([{ text: 'Все подсегменты', value: '' }]);
                    this.subsegmentSlimSelect.enable(false);
                    this.subsegmentSlimSelect.setSelected([]);
                }
                this.subsegments = [];
            } else {
                console.log('🔍 ReportsManager: Загружаем подсегменты для сегмента:', segmentId);
                // Загружаем подсегменты для выбранного сегмента
                const subsegments = await this.database.getSubsegmentsBySegment(segmentId);
                console.log('🔍 ReportsManager: Получено подсегментов:', subsegments.length, subsegments);
                
                // Очищаем и заполняем опции подсегментов
                this.subsegmentFilter.innerHTML = '<option value="">Все подсегменты</option>';
                subsegments.forEach(subsegment => {
                    const option = document.createElement('option');
                    option.value = subsegment.id;
                    option.textContent = subsegment.name;
                    this.subsegmentFilter.appendChild(option);
                    console.log('🔍 ReportsManager: Добавлен подсегмент:', subsegment.name, 'id:', subsegment.id);
                });
                
                console.log('🔍 ReportsManager: HTML подсегментов:', this.subsegmentFilter.innerHTML);
                
                // Обновляем существующий SlimSelect
                if (this.subsegmentSlimSelect) {
                    console.log('🔍 ReportsManager: Обновляем SlimSelect для подсегментов');
                    this.subsegmentSlimSelect.setData([
                        { text: 'Все подсегменты', value: '' },
                        ...subsegments.map(subsegment => ({ 
                            text: subsegment.name, 
                            value: subsegment.id.toString() 
                        }))
                    ]);
                    this.subsegmentSlimSelect.enable(true);
                }
                
                console.log('🔍 ReportsManager: Подсегменты включены');
                
                // Сохраняем подсегменты
                this.subsegments = subsegments;
            }

            console.log('🔍 ReportsManager: Выбран сегмент:', this.currentSegment?.name || 'Не выбран', 'подсегментов:', this.subsegments?.length || 0);
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка при изменении сегмента:', error);
        }
    }


    /**
     * Обработка изменения подсегмента
     */
    handleSubsegmentChange(subsegmentId) {
        this.currentSubsegment = subsegmentId ? this.subsegments.find(s => s.id === parseInt(subsegmentId)) : null;

        if (this.debugEnabled) {
            console.log('🔍 ReportsManager: Выбран подсегмент:', this.currentSubsegment?.name || 'Весь сегмент');
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
     * Генерация отчётов
     */
    async generateReports() {
        try {
            if (this.debugEnabled) {
                console.log('🔍 ReportsManager: Генерация отчётов...');
            }

            // Получение данных для отчётов
            const reportData = await this.getReportData();
            
            // Создание графика ликвидности
            this.createLiquidityChart(reportData);
            
            // Создание графика изменения цен
            this.createPriceChangesChart(reportData);

            // Создание графика коридора рынка недвижимости
            this.createMarketCorridorChart(reportData);

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: Отчёты сгенерированы');
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка генерации отчётов:', error);
        }
    }

    /**
     * Получение данных для отчётов
     */
    async getReportData() {
        // Пока возвращаем тестовые данные из примера
        // В будущем здесь будет реальная логика получения данных из базы
        
        const testData = {
            "new": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 2, 1, 1, 5, 4, 4, 4, 10, 10, 5, 4, 2, 1, 6, 2, 6, 3, 0],
            "close": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 11, 14, 6, 6, 1, 1, 3, 7, 7, 0],
            "active": [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 4, 4, 4, 5, 5, 5, 6, 7, 8, 10, 11, 12, 17, 21, 25, 29, 27, 26, 17, 15, 11, 11, 16, 15, 14, 10],
            "averageСost": [0, 15423275, 15423275, 15423275, 15423275, 15423275, 15423275, 15423275, 15423275, 15423275, 15423275, 15423275, 16111638, 16111638, 16061638, 16061638, 15274425, 14780819, 14780819, 14780819, 14364655, 14364655, 14364655, 13537213, 14789039, 14752909, 14922328, 15520298, 15235273, 15640193, 16353442, 16196491, 16573527, 17011566, 17858549, 18674647, 19897933, 21143545, 19899000, 20245938, 20439667, 20349286, 21428000],
            "averageСostMeter": [0, 289367, 289367, 289367, 289367, 289367, 289367, 289367, 289367, 289367, 289367, 289367, 274708, 274708, 273856, 273856, 294116, 303663, 303663, 303663, 307068, 307068, 307068, 311320, 317946, 322821, 317564, 316800, 303240, 305824, 293523, 291724, 289799, 287663, 292689, 290032, 290001, 287525, 286541, 296943, 291828, 316439, 334186],
            "datetime": ["12/02/2021", "01/02/2022", "02/02/2022", "03/02/2022", "04/02/2022", "05/02/2022", "06/02/2022", "07/02/2022", "08/02/2022", "09/02/2022", "10/02/2022", "11/02/2022", "12/02/2022", "01/02/2023", "02/02/2023", "03/02/2023", "04/02/2023", "05/02/2023", "06/02/2023", "07/02/2023", "08/02/2023", "09/02/2023", "10/02/2023", "11/02/2023", "12/02/2023", "01/02/2024", "02/02/2024", "03/02/2024", "04/02/2024", "05/02/2024", "06/02/2024", "07/02/2024", "08/02/2024", "09/02/2024", "10/02/2024", "11/02/2024", "12/02/2024", "01/02/2025", "02/02/2025", "03/02/2025", "04/02/2025", "05/02/2025", "06/02/2025"]
        };

        return testData;
    }

    /**
     * Создание графика ликвидности
     */
    createLiquidityChart(data) {
        try {
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
                console.log('✅ ReportsManager: График ликвидности создан');
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
            const options = {
                series: [
                    {
                        name: 'Средняя цена квадратного метра',
                        type: 'column',
                        data: data['averageСostMeter']
                    },
                    {
                        name: 'Средняя цена объекта',
                        type: 'line',
                        data: data['averageСost']
                    }
                ],
                colors: ['#60ba5d', '#629bc2'],
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
                        title: {
                            text: 'Средняя цена квадратного метра',
                        },
                    },
                    {
                        opposite: true,
                        title: {
                            text: 'Средняя цена объекта'
                        }
                    }
                ]
            };

            document.getElementById('priceChangesChart').innerHTML = '';
            this.priceChangesChart = new ApexCharts(document.querySelector("#priceChangesChart"), options);
            this.priceChangesChart.render();

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: График изменения цен создан');
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка создания графика изменения цен:', error);
        }
    }

    /**
     * Создание графика коридора рынка недвижимости
     */
    createMarketCorridorChart(data) {
        try {
            // Получаем тестовые данные для графика коридора (из примера в PANEL_REPORTS.md)
            const pointsData = this.getMarketCorridorData();
            
            const options = {
                chart: {
                    height: 600,
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
                    type: 'line',
                    shadow: {
                        enabled: false,
                        color: 'rgba(187,187,187,0.47)',
                        top: 3,
                        left: 2,
                        blur: 3,
                        opacity: 1
                    }
                },
                stroke: {
                    curve: 'stepline',
                    width: [2, 2, 2] // ширины линий для каждой серии
                },
                series: pointsData.series,
                colors: pointsData.colors,
                xaxis: {
                    type: 'datetime'
                },
                title: {
                    text: 'Коридор рынка недвижимости',
                    align: 'left',
                    style: {
                        fontSize: "14px",
                        color: 'rgba(102,102,102,0.56)'
                    }
                },
                markers: {
                    size: 4,
                    opacity: 0.9,
                    colors: ["#56c2d6"],
                    strokeColor: "#fff",
                    strokeWidth: 2,
                    style: 'inverted',
                    hover: {
                        size: 15
                    }
                },
                tooltip: {
                    shared: false,
                    intersect: true
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
            this.marketCorridorChart.render();

            if (this.debugEnabled) {
                console.log('✅ ReportsManager: График коридора рынка создан');
            }

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка создания графика коридора рынка:', error);
        }
    }

    /**
     * Получение данных для графика коридора рынка
     */
    getMarketCorridorData() {
        // Тестовые данные для демонстрации
        // В реальной реализации здесь будет получение данных из базы данных
        return {
            series: [
                {
                    name: 'Объекты недвижимости',
                    data: [
                        [new Date('2024-01-15').getTime(), 12000000],
                        [new Date('2024-02-10').getTime(), 13500000],
                        [new Date('2024-03-05').getTime(), 11800000],
                        [new Date('2024-04-20').getTime(), 15200000],
                        [new Date('2024-05-12').getTime(), 14100000],
                        [new Date('2024-06-08').getTime(), 16800000],
                        [new Date('2024-07-25').getTime(), 13900000],
                        [new Date('2024-08-14').getTime(), 17500000]
                    ]
                }
            ],
            colors: ['#56c2d6'],
            minPrice: 10000000,
            maxPrice: 20000000
        };
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

        // Удаление обработчиков событий EventBus
        this.eventBus.off(CONSTANTS.EVENTS.SEGMENTS_UPDATED);
        this.eventBus.off(CONSTANTS.EVENTS.SUBSEGMENT_CREATED);
        this.eventBus.off(CONSTANTS.EVENTS.SUBSEGMENT_UPDATED);
        this.eventBus.off(CONSTANTS.EVENTS.SUBSEGMENT_DELETED);

        if (this.debugEnabled) {
            console.log('🔍 ReportsManager: Ресурсы очищены');
        }
    }
}