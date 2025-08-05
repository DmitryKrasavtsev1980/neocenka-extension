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
                // console.log('🔍 ReportsManager: Инициализация...');
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
                // console.log('✅ ReportsManager: Инициализация завершена');
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
            // console.log('🔍 ReportsManager: Элементы интерфейса инициализированы');
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

        // Обработчики изменения фильтров дат
        if (this.dateFromFilter) {
            this.dateFromFilter.addEventListener('change', () => {
                this.updateReportsVisibility();
            });
        }

        if (this.dateToFilter) {
            this.dateToFilter.addEventListener('change', () => {
                this.updateReportsVisibility();
            });
        }

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
            // console.log('🔍 ReportsManager: Обработчики событий установлены');
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
                            // console.log('🔍 ReportsManager: SlimSelect подсегмент изменен:', newVal, 'извлечено ID:', subsegmentId);
                            this.handleSubsegmentChange(subsegmentId);
                        }
                    }
                });
                
                if (this.debugEnabled) {
                    // console.log('🔍 ReportsManager: SlimSelect для подсегментов инициализирован (отключен)');
                }
            }
            
            if (this.debugEnabled) {
                // console.log('🔍 ReportsManager: SlimSelect инициализация завершена');
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
            // console.log('🔍 ReportsManager: Панель', isHidden ? 'развернута' : 'свернута');
        }
    }

    /**
     * Показать/скрыть выпадающий список отчётов
     */
    toggleReportsDropdown() {
        if (!this.reportsDropdown) return;

        this.reportsDropdown.classList.toggle('hidden');

        if (this.debugEnabled) {
            // console.log('🔍 ReportsManager: Выпадающий список отчётов переключен');
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
                    // console.log('🔍 ReportsManager: Нет текущей области для загрузки сегментов');
                }
                return;
            }

            if (!this.database) {
                if (this.debugEnabled) {
                    // console.log('🔍 ReportsManager: База данных недоступна');
                }
                return;
            }

            // Используем тот же метод что и в DuplicatesManager
            this.segments = await this.database.getSegmentsByMapArea(currentArea.id);
            
            // Обновление списка сегментов
            this.updateSegmentFilter();

            if (this.debugEnabled) {
                // console.log('🔍 ReportsManager: Загружено сегментов:', this.segments.length, 'для области:', currentArea.name);
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
                        // console.log('🔍 ReportsManager: SlimSelect afterChange для сегмента:', newVal, 'извлечено ID:', segmentId);
                        this.handleSegmentChange(segmentId);
                    }
                }
            });
            
            // Устанавливаем пустое значение по умолчанию
            this.segmentSlimSelect.setSelected([]);
        }

        if (this.debugEnabled) {
            // console.log('🔍 ReportsManager: Фильтр сегментов обновлен, сегментов:', this.segments.length);
        }
    }

    /**
     * Обработка изменения сегмента (точно как в DuplicatesManager)
     */
    async handleSegmentChange(segmentId) {
        try {
            // console.log('🔍 ReportsManager: handleSegmentChange вызван с segmentId:', segmentId, 'тип:', typeof segmentId);
            
            this.currentSegment = segmentId ? this.segments.find(s => s.id === parseInt(segmentId)) : null;
            this.currentSubsegment = null;
            
            if (!segmentId) {
                // console.log('🔍 ReportsManager: Сегмент не выбран, отключаем подсегменты');
                // Если сегмент не выбран, отключаем подсегменты и очищаем данные
                if (this.subsegmentSlimSelect) {
                    this.subsegmentSlimSelect.setData([{ text: 'Все подсегменты', value: '' }]);
                    this.subsegmentSlimSelect.enable(false);
                    this.subsegmentSlimSelect.setSelected([]);
                }
                this.subsegments = [];
            } else {
                // console.log('🔍 ReportsManager: Загружаем подсегменты для сегмента:', segmentId);
                // Загружаем подсегменты для выбранного сегмента
                const subsegments = await this.database.getSubsegmentsBySegment(segmentId);
                // console.log('🔍 ReportsManager: Получено подсегментов:', subsegments.length, subsegments);
                
                // Очищаем и заполняем опции подсегментов
                this.subsegmentFilter.innerHTML = '<option value="">Все подсегменты</option>';
                subsegments.forEach(subsegment => {
                    const option = document.createElement('option');
                    option.value = subsegment.id;
                    option.textContent = subsegment.name;
                    this.subsegmentFilter.appendChild(option);
                    // console.log('🔍 ReportsManager: Добавлен подсегмент:', subsegment.name, 'id:', subsegment.id);
                });
                
                // console.log('🔍 ReportsManager: HTML подсегментов:', this.subsegmentFilter.innerHTML);
                
                // Обновляем существующий SlimSelect
                if (this.subsegmentSlimSelect) {
                    // console.log('🔍 ReportsManager: Обновляем SlimSelect для подсегментов');
                    this.subsegmentSlimSelect.setData([
                        { text: 'Все подсегменты', value: '' },
                        ...subsegments.map(subsegment => ({ 
                            text: subsegment.name, 
                            value: subsegment.id.toString() 
                        }))
                    ]);
                    this.subsegmentSlimSelect.enable(true);
                }
                
                // console.log('🔍 ReportsManager: Подсегменты включены');
                
                // Сохраняем подсегменты
                this.subsegments = subsegments;
            }

            // console.log('🔍 ReportsManager: Выбран сегмент:', this.currentSegment?.name || 'Не выбран', 'подсегментов:', this.subsegments?.length || 0);
            
            // Обновляем отчёты при изменении сегмента
            await this.updateReportsVisibility();
            
        } catch (error) {
            console.error('❌ ReportsManager: Ошибка при изменении сегмента:', error);
        }
    }


    /**
     * Обработка изменения подсегмента
     */
    async handleSubsegmentChange(subsegmentId) {
        this.currentSubsegment = subsegmentId ? this.subsegments.find(s => s.id === parseInt(subsegmentId)) : null;

        // Обновляем отчёты при изменении подсегмента
        await this.updateReportsVisibility();

        if (this.debugEnabled) {
            // console.log('🔍 ReportsManager: Выбран подсегмент:', this.currentSubsegment?.name || 'Весь сегмент');
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
                // console.log('🔍 ReportsManager: Генерация отчётов...');
            }

            // Получение данных для отчётов
            const reportData = await this.getReportData();
            
            // Создание графика ликвидности
            this.createLiquidityChart(reportData);
            
            // Создание графика изменения цен
            this.createPriceChangesChart(reportData);

            // Создание графика коридора рынка недвижимости
            await this.createMarketCorridorChart(reportData);

            if (this.debugEnabled) {
                // console.log('✅ ReportsManager: Отчёты сгенерированы');
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
                    // console.log('🔍 ReportsManager: Нет текущей области');
                }
                return this.getEmptyReportData();
            }

            const segmentId = this.currentSegment?.id;
            const subsegmentId = this.currentSubsegment?.id;
            const dateFrom = new Date(this.dateFromFilter?.value || '2023-01-01');
            const dateTo = new Date(this.dateToFilter?.value || new Date().toISOString().split('T')[0]);

            if (this.debugEnabled) {
                console.log('🔍 ReportsManager: Параметры фильтра:', {
                    areaId: currentArea.id,
                    segmentId,
                    subsegmentId,
                    dateFrom: dateFrom.toISOString(),
                    dateTo: dateTo.toISOString()
                });
            }

            // Получаем объекты недвижимости с учётом фильтров
            const objects = await this.getFilteredRealEstateObjects(currentArea.id, segmentId, subsegmentId, dateFrom, dateTo);
            
            if (this.debugEnabled) {
                // console.log('🔍 ReportsManager: Загружено объектов:', objects.length);
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
                // Получаем объекты по сегменту
                objects = await this.database.getObjectsBySegment(segmentId);
                
                if (subsegmentId) {
                    // Дополнительная фильтрация по подсегменту
                    // Нужно получить адреса подсегмента и отфильтровать объекты
                    const subsegment = await this.database.getSubsegment(subsegmentId);
                    if (subsegment && subsegment.filter_criteria) {
                        objects = this.filterObjectsBySubsegment(objects, subsegment);
                    }
                }
            } else {
                // Получаем все объекты в области
                const addresses = await this.database.getAddressesInMapArea(areaId);
                for (const address of addresses) {
                    const addressObjects = await this.database.getObjectsByAddress(address.id);
                    objects.push(...addressObjects);
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
                    console.log('🔍 ReportsManager: Объект исключен - нет активности в период:', {
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
    filterObjectsBySubsegment(objects, subsegment) {
        if (!subsegment.filter_criteria) return objects;

        return objects.filter(obj => {
            const criteria = subsegment.filter_criteria;
            
            // Фильтр по количеству комнат
            if (criteria.rooms && criteria.rooms.length > 0) {
                if (!criteria.rooms.includes(obj.rooms)) return false;
            }

            // Фильтр по этажам
            if (criteria.floors && (criteria.floors.min || criteria.floors.max)) {
                if (criteria.floors.min && obj.floors_total < criteria.floors.min) return false;
                if (criteria.floors.max && obj.floors_total > criteria.floors.max) return false;
            }

            // Фильтр по площади
            if (criteria.area && (criteria.area.min || criteria.area.max)) {
                if (criteria.area.min && obj.area_total < criteria.area.min) return false;
                if (criteria.area.max && obj.area_total > criteria.area.max) return false;
            }

            // Фильтр по цене
            if (criteria.price && (criteria.price.min || criteria.price.max)) {
                if (criteria.price.min && obj.current_price < criteria.price.min) return false;
                if (criteria.price.max && obj.current_price > criteria.price.max) return false;
            }

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
            console.log('🔍 ReportsManager: Данные отчета по месяцам:', {
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
                // console.log('✅ ReportsManager: График ликвидности создан');
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
                // console.log('✅ ReportsManager: График изменения цен создан');
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
                // console.log('✅ ReportsManager: График коридора рынка создан');
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

            // Подготавливаем данные для точечного графика
            // Каждая точка: [дата последнего обновления, цена]
            const pointsData = objects
                .filter(obj => obj.current_price > 0 && (obj.updated || obj.created))
                .map(obj => {
                    const lastUpdate = new Date(obj.updated || obj.created);
                    return [lastUpdate.getTime(), obj.current_price];
                })
                .sort((a, b) => a[0] - b[0]); // сортируем по дате

            // Вычисляем минимальную и максимальную цены для оси Y
            const prices = pointsData.map(point => point[1]);
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

            // Добавляем небольшой отступ для лучшего отображения
            const priceRange = maxPrice - minPrice;
            const padding = priceRange * 0.1; // 10% отступ

            return {
                series: [
                    {
                        name: 'Объекты недвижимости',
                        data: pointsData
                    }
                ],
                colors: ['#56c2d6'],
                minPrice: Math.max(0, minPrice - padding),
                maxPrice: maxPrice + padding
            };

        } catch (error) {
            console.error('❌ ReportsManager: Ошибка получения данных коридора рынка:', error);
            return this.getEmptyMarketCorridorData();
        }
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
            // console.log('🔍 ReportsManager: Ресурсы очищены');
        }
    }
}