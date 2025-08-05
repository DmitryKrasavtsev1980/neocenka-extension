/**
 * Менеджер сравнительного анализа недвижимости
 * Позволяет сравнивать абстрактный объект с конкурентами для определения оптимальной цены
 */
class ComparativeAnalysisManager {
    constructor(areaPage) {
        this.areaPage = areaPage;
        this.reportsManager = areaPage.reportsManager;
        
        // Данные анализа
        this.currentObjects = [];
        this.selectedObjectId = null;
        this.selectedListingId = null;
        this.evaluations = new Map(); // objectId -> evaluation
        this.statusFilter = 'all';
        
        // Коридоры цен
        this.corridors = {
            active: { min: null, max: null },
            archive: { min: null, max: null },
            optimal: { min: null, max: null }
        };
        
        // График
        this.comparativeChart = null;
        this.debugEnabled = false;
        
        // Флаг инициализации
        this.isInitialized = false;
    }
    
    /**
     * Инициализация менеджера
     */
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            await this.initializeEventListeners();
            this.debugEnabled = await this.getDebugSetting();
            this.isInitialized = true;
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Менеджер инициализирован');
            }
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка инициализации:', error);
        }
    }
    
    /**
     * Получение настройки отладки
     */
    async getDebugSetting() {
        try {
            const settings = await chrome.storage.local.get(['debugEnabled']);
            return settings.debugEnabled || false;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Инициализация обработчиков событий
     */
    async initializeEventListeners() {
        // Фильтры статусов
        document.querySelectorAll('.status-filter .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setStatusFilter(e.target.dataset.status);
            });
        });
        
        // Кнопки управления анализом
        document.getElementById('newAnalysisBtn')?.addEventListener('click', () => {
            this.startNewAnalysis();
        });
        
        document.getElementById('saveAnalysisBtn')?.addEventListener('click', () => {
            this.saveCurrentAnalysis();
        });
        
        document.getElementById('loadAnalysisBtn')?.addEventListener('click', () => {
            this.showLoadAnalysisModal();
        });
        
        // Кнопки оценки
        document.querySelectorAll('.eval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.selectedObjectId) {
                    this.evaluateObject(this.selectedObjectId, e.target.dataset.evaluation);
                }
            });
        });
        
        // Глобальная переменная для доступа из HTML
        window.comparativeAnalysisManager = this;
    }
    
    /**
     * Показ интерфейса сравнительного анализа
     */
    async showComparativeAnalysis() {
        try {
            // Скрываем placeholder и показываем интерфейс
            const placeholder = document.getElementById('comparativeAnalysisPlaceholder');
            const content = document.getElementById('comparativeAnalysisContent');
            
            if (placeholder) placeholder.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            
            // Запускаем новый анализ
            await this.startNewAnalysis();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка показа интерфейса:', error);
        }
    }
    
    /**
     * Скрытие интерфейса сравнительного анализа
     */
    hideComparativeAnalysis() {
        const placeholder = document.getElementById('comparativeAnalysisPlaceholder');
        const content = document.getElementById('comparativeAnalysisContent');
        
        if (placeholder) placeholder.classList.remove('hidden');
        if (content) content.classList.add('hidden');
    }
    
    /**
     * Запуск нового анализа
     */
    async startNewAnalysis() {
        try {
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Запуск нового анализа');
            }
            
            // Очищаем предыдущие результаты
            this.evaluations.clear();
            this.selectedObjectId = null;
            this.selectedListingId = null;
            this.resetCorridors();
            
            // Загружаем объекты для анализа с учетом глобальных фильтров
            await this.loadObjectsForAnalysis();
            
            // Отображаем интерфейс
            this.updateObjectsDisplay();
            this.updateChart();
            this.updateCorridorInfo();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка запуска анализа:', error);
        }
    }
    
    /**
     * Загрузка объектов для анализа с учетом глобальных фильтров
     */
    async loadObjectsForAnalysis() {
        try {
            // Получаем глобальные фильтры из ReportsManager
            const currentArea = this.areaPage.dataState?.getState('currentArea');
            if (!currentArea) {
                this.currentObjects = [];
                return;
            }
            
            // Используем глобальные фильтры отчетов
            const segmentId = this.reportsManager.currentSegment?.id;
            const subsegmentId = this.reportsManager.currentSubsegment?.id;
            const dateFrom = new Date(this.reportsManager.dateFromFilter?.value || '2023-01-01');
            const dateTo = new Date(this.reportsManager.dateToFilter?.value || new Date().toISOString().split('T')[0]);
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Загрузка объектов с фильтрами:', {
                    areaId: currentArea.id,
                    segmentId,
                    subsegmentId,
                    dateFrom: dateFrom.toISOString(),
                    dateTo: dateTo.toISOString()
                });
            }
            
            // Получаем объекты с помощью ReportsManager (используем ту же логику фильтрации)
            this.currentObjects = await this.reportsManager.getFilteredRealEstateObjects(
                currentArea.id, segmentId, subsegmentId, dateFrom, dateTo
            );
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Загружено объектов:', this.currentObjects.length);
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка загрузки объектов:', error);
            this.currentObjects = [];
        }
    }
    
    /**
     * Установка фильтра по статусу
     */
    setStatusFilter(status) {
        this.statusFilter = status;
        
        // Обновляем активную кнопку
        document.querySelectorAll('.status-filter .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === status);
        });
        
        this.updateObjectsDisplay();
        
        if (this.debugEnabled) {
            console.log('🔍 ComparativeAnalysisManager: Установлен фильтр статуса:', status);
        }
    }
    
    /**
     * Обновление отображения объектов
     */
    updateObjectsDisplay() {
        const grid = document.getElementById('objectsGrid');
        if (!grid) return;
        
        // Фильтруем объекты по статусу
        let filteredObjects = this.currentObjects;
        if (this.statusFilter !== 'all') {
            filteredObjects = this.currentObjects.filter(obj => 
                obj.status === this.statusFilter
            );
        }
        
        if (filteredObjects.length === 0) {
            grid.innerHTML = '<div class="text-center text-gray-500 col-span-4 py-4">Нет объектов для отображения</div>';
            return;
        }
        
        // Создаем блоки объектов
        grid.innerHTML = filteredObjects.map(obj => {
            const evaluation = this.evaluations.get(obj.id);
            const evaluationClass = evaluation ? `evaluated-${this.getEvaluationClass(evaluation)}` : '';
            const selectedClass = obj.id === this.selectedObjectId ? 'selected' : '';
            
            return `
                <div class="object-block ${evaluationClass} ${selectedClass}" 
                     data-object-id="${obj.id}">
                    <div class="object-id">Id ${obj.id}</div>
                    <div class="object-price">${this.formatPrice(obj.current_price)}</div>
                    <div class="object-info">${obj.rooms || obj.property_type || 'н/д'}, ${obj.area_total || 0}м²</div>
                </div>
            `;
        }).join('');
        
        // Добавляем обработчики событий для блоков объектов
        grid.querySelectorAll('.object-block').forEach(block => {
            block.addEventListener('click', () => {
                const objectId = block.dataset.objectId;
                this.selectObject(objectId);
            });
        });
    }
    
    /**
     * Получение CSS класса для оценки
     */
    getEvaluationClass(evaluation) {
        switch (evaluation) {
            case 'better': return 'better';
            case 'worse': return 'worse';  
            case 'equal': return 'equal';
            case 'fake':
            case 'not-competitor':
            case 'not-sold':
                return 'excluded';
            default: return '';
        }
    }
    
    /**
     * Выбор объекта для просмотра
     */
    async selectObject(objectId) {
        try {
            this.selectedObjectId = objectId;
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Выбран объект:', objectId);
            }
            
            // Обновляем отображение блоков
            this.updateObjectsDisplay();
            
            // Загружаем объявления объекта
            await this.loadObjectListings(objectId);
            
            // Обновляем кнопки оценки
            this.updateEvaluationButtons();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка выбора объекта:', error);
        }
    }
    
    /**
     * Загрузка объявлений объекта
     */
    async loadObjectListings(objectId) {
        try {
            const objectWithData = await window.realEstateObjectManager.getObjectWithListings(objectId);
            const listings = objectWithData.listings || [];
            
            const listingsList = document.getElementById('listingsList');
            if (!listingsList) return;
            
            if (listings.length === 0) {
                listingsList.innerHTML = '<div class="text-sm text-gray-500">Нет объявлений для этого объекта</div>';
                return;
            }
            
            // Сортируем по дате обновления (свежие сверху)
            listings.sort((a, b) => new Date(b.updated) - new Date(a.updated));
            
            listingsList.innerHTML = listings.map(listing => {
                const selectedClass = listing.id === this.selectedListingId ? 'selected' : '';
                const updateDate = new Date(listing.updated).toLocaleDateString('ru-RU');
                
                return `
                    <div class="listing-block ${selectedClass}"
                         data-listing-id="${listing.id}">
                        <div>Id ${listing.id}</div>
                        <div class="text-xs text-gray-500">Обновлено: ${updateDate}</div>
                    </div>
                `;
            }).join('');
            
            // Добавляем обработчики событий для блоков объявлений
            listingsList.querySelectorAll('.listing-block').forEach(block => {
                block.addEventListener('click', () => {
                    const listingId = block.dataset.listingId;
                    this.selectListing(listingId);
                });
            });
            
            // Автоматически выбираем первое объявление
            if (listings.length > 0) {
                this.selectListing(listings[0].id);
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка загрузки объявлений:', error);
            const listingsList = document.getElementById('listingsList');
            if (listingsList) {
                listingsList.innerHTML = '<div class="text-sm text-red-500">Ошибка загрузки объявлений</div>';
            }
        }
    }
    
    /**
     * Выбор объявления для просмотра
     */
    async selectListing(listingId) {
        try {
            this.selectedListingId = listingId;
            
            // Обновляем выделение в списке
            document.querySelectorAll('.listing-block').forEach(block => {
                block.classList.toggle('selected', block.dataset.listingId === listingId);
            });
            
            // Загружаем детали объявления
            await this.loadListingDetails(listingId);
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка выбора объявления:', error);
        }
    }
    
    /**
     * Загрузка деталей объявления
     */
    async loadListingDetails(listingId) {
        try {
            const listing = await window.db.getListing(listingId);
            if (!listing) return;
            
            // Отображаем фотографии
            const photosGallery = document.getElementById('photosGallery');
            if (photosGallery) {
                if (listing.photos && listing.photos.length > 0) {
                    photosGallery.innerHTML = listing.photos.slice(0, 8).map(photo => `
                        <div class="photo-thumb">
                            <img src="${photo}" alt="Фото объявления" data-photo-url="${photo}">
                        </div>
                    `).join('');
                    
                    // Добавляем обработчики событий для фотографий
                    photosGallery.querySelectorAll('.photo-thumb img').forEach(img => {
                        img.addEventListener('click', () => {
                            const photoUrl = img.dataset.photoUrl;
                            window.open(photoUrl, '_blank');
                        });
                    });
                } else {
                    photosGallery.innerHTML = '<div class="text-xs text-gray-500">Нет фотографий</div>';
                }
            }
            
            // Отображаем описание
            const descriptionDiv = document.getElementById('listingDescription');
            if (descriptionDiv) {
                const description = listing.description || 'Описание отсутствует';
                descriptionDiv.innerHTML = description.length > 300 ? 
                    description.substring(0, 300) + '...' : description;
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка загрузки деталей объявления:', error);
        }
    }
    
    /**
     * Обновление кнопок оценки
     */
    updateEvaluationButtons() {
        const currentEvaluation = this.selectedObjectId ? 
            this.evaluations.get(this.selectedObjectId) : null;
            
        document.querySelectorAll('.eval-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.evaluation === currentEvaluation);
        });
    }
    
    /**
     * Оценка объекта
     */
    evaluateObject(objectId, evaluation) {
        try {
            this.evaluations.set(objectId, evaluation);
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Оценка объекта:', objectId, evaluation);
            }
            
            // Обновляем коридоры
            this.updateCorridors();
            
            // Обновляем отображение
            this.updateObjectsDisplay();
            this.updateChart();
            this.updateCorridorInfo();
            this.updateEvaluationButtons();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка оценки объекта:', error);
        }
    }
    
    /**
     * Сброс коридоров цен
     */
    resetCorridors() {
        this.corridors = {
            active: { min: null, max: null },
            archive: { min: null, max: null },
            optimal: { min: null, max: null }
        };
    }
    
    /**
     * Обновление коридоров цен
     */
    updateCorridors() {
        // Рассчитываем коридоры для активных объектов
        this.corridors.active = this.calculateCorridorBounds('active');
        
        // Рассчитываем коридоры для архивных объектов  
        this.corridors.archive = this.calculateCorridorBounds('archive');
        
        // Рассчитываем оптимальный диапазон (пересечение коридоров)
        this.corridors.optimal = this.calculateOptimalRange();
        
        if (this.debugEnabled) {
            console.log('🔍 ComparativeAnalysisManager: Обновлены коридоры:', this.corridors);
        }
    }
    
    /**
     * Расчет границ коридора для определенного статуса
     */
    calculateCorridorBounds(objectStatus) {
        let minPrice = null;
        let maxPrice = null;
        
        for (let [objectId, evaluation] of this.evaluations) {
            const object = this.currentObjects.find(obj => obj.id === objectId);
            if (!object || object.status !== objectStatus) continue;
            
            // Исключаем объекты с исключающими оценками
            if (['fake', 'not-competitor', 'not-sold'].includes(evaluation)) {
                continue;
            }
            
            const price = object.current_price;
            if (!price || price <= 0) continue;
            
            switch (evaluation) {
                case 'better':
                    // Конкурент лучше - опускаем верхнюю границу
                    if (maxPrice === null || price < maxPrice) {
                        maxPrice = price;
                    }
                    break;
                    
                case 'worse':
                    // Конкурент хуже - поднимаем нижнюю границу
                    if (minPrice === null || price > minPrice) {
                        minPrice = price;
                    }
                    break;
                    
                case 'equal':
                    // Равные - не влияют на границы, но показываем их
                    break;
            }
        }
        
        return { min: minPrice, max: maxPrice };
    }
    
    /**
     * Расчет оптимального диапазона (пересечение коридоров)
     */
    calculateOptimalRange() {
        const activeMin = this.corridors.active.min;
        const activeMax = this.corridors.active.max;
        const archiveMin = this.corridors.archive.min;
        const archiveMax = this.corridors.archive.max;
        
        // Находим пересечение диапазонов
        let optimalMin = null;
        let optimalMax = null;
        
        if (activeMin !== null && archiveMin !== null) {
            optimalMin = Math.max(activeMin, archiveMin);
        } else if (activeMin !== null) {
            optimalMin = activeMin;
        } else if (archiveMin !== null) {
            optimalMin = archiveMin;
        }
        
        if (activeMax !== null && archiveMax !== null) {
            optimalMax = Math.min(activeMax, archiveMax);
        } else if (activeMax !== null) {
            optimalMax = activeMax;
        } else if (archiveMax !== null) {
            optimalMax = archiveMax;
        }
        
        // Проверяем что диапазон существует
        if (optimalMin !== null && optimalMax !== null && optimalMin > optimalMax) {
            return { min: null, max: null }; // Диапазоны не пересекаются
        }
        
        return { min: optimalMin, max: optimalMax };
    }
    
    /**
     * Обновление информации о коридорах
     */
    updateCorridorInfo() {
        const activeDiv = document.getElementById('activeCorridor');
        const archiveDiv = document.getElementById('archiveCorridor');
        const optimalDiv = document.getElementById('optimalRange');
        
        if (activeDiv) {
            activeDiv.textContent = this.formatCorridorRange(this.corridors.active);
        }
        
        if (archiveDiv) {
            archiveDiv.textContent = this.formatCorridorRange(this.corridors.archive);
        }
        
        if (optimalDiv) {
            const optimalText = this.formatCorridorRange(this.corridors.optimal);
            optimalDiv.textContent = optimalText;
            optimalDiv.style.fontWeight = optimalText !== '-' ? 'bold' : 'normal';
        }
    }
    
    /**
     * Форматирование диапазона коридора
     */
    formatCorridorRange(corridor) {
        if (corridor.min === null && corridor.max === null) {
            return '-';
        } else if (corridor.min === null) {
            return `до ${this.formatPrice(corridor.max)}`;
        } else if (corridor.max === null) {
            return `от ${this.formatPrice(corridor.min)}`;
        } else {
            return `${this.formatPrice(corridor.min)} - ${this.formatPrice(corridor.max)}`;
        }
    }
    
    /**
     * Обновление графика
     */
    async updateChart() {
        const chartContainer = document.getElementById('comparativeChart');
        if (!chartContainer) return;
        
        try {
            // Подготовка данных для графика
            const chartData = this.generateChartData();
            
            // Создание/обновление графика
            if (this.comparativeChart) {
                this.comparativeChart.destroy();
            }
            
            const options = {
                chart: {
                    type: 'scatter',
                    height: 400,
                    toolbar: { show: false },
                    locales: [{
                        "name": "ru",
                        "options": {
                            "months": ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
                            "shortMonths": ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
                            "days": ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
                            "shortDays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
                        }
                    }],
                    defaultLocale: "ru"
                },
                series: chartData.series,
                colors: chartData.colors,
                xaxis: {
                    type: 'datetime',
                    title: { text: 'Дата' }
                },
                yaxis: {
                    title: { text: 'Цена, ₽' },
                    labels: {
                        formatter: (value) => this.formatPrice(value)
                    }
                },
                tooltip: {
                    shared: false,
                    intersect: true,
                    custom: (tooltipModel) => {
                        return this.generateTooltip(tooltipModel);
                    }
                },
                markers: {
                    size: 6,
                    strokeWidth: 2,
                    strokeColor: '#fff'
                },
                legend: {
                    show: false
                },
                annotations: {
                    yaxis: this.generateCorridorAnnotations()
                }
            };
            
            this.comparativeChart = new ApexCharts(chartContainer, options);
            await this.comparativeChart.render();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка обновления графика:', error);
        }
    }
    
    /**
     * Генерация данных для графика
     */
    generateChartData() {
        const series = [];
        const colors = [];
        
        // Группировка объектов по статусу и оценке
        const groups = {
            'active-better': { objects: [], color: '#93c5fd', name: 'Активные (лучше)' },
            'active-equal': { objects: [], color: '#3b82f6', name: 'Активные (равно)' },  
            'active-worse': { objects: [], color: '#1e40af', name: 'Активные (хуже)' },
            'active-unevaluated': { objects: [], color: '#60a5fa', name: 'Активные (не оценены)' },
            'archive-better': { objects: [], color: '#86efac', name: 'Архивные (лучше)' },
            'archive-equal': { objects: [], color: '#22c55e', name: 'Архивные (равно)' },
            'archive-worse': { objects: [], color: '#15803d', name: 'Архивные (хуже)' },
            'archive-unevaluated': { objects: [], color: '#4ade80', name: 'Архивные (не оценены)' },
            'excluded': { objects: [], color: '#dc2626', name: 'Исключенные' }
        };
        
        // Распределение объектов по группам
        this.currentObjects.forEach(obj => {
            const evaluation = this.evaluations.get(obj.id);
            
            let groupKey;
            if (['fake', 'not-competitor', 'not-sold'].includes(evaluation)) {
                groupKey = 'excluded';
            } else if (evaluation) {
                groupKey = `${obj.status}-${evaluation}`;
            } else {
                groupKey = `${obj.status}-unevaluated`;
            }
            
            if (groups[groupKey]) {
                groups[groupKey].objects.push(obj);
            }
        });
        
        // Создание серий для ApexCharts
        Object.entries(groups).forEach(([groupKey, group]) => {
            if (group.objects.length > 0) {
                series.push({
                    name: group.name,
                    data: group.objects.map(obj => [
                        new Date(obj.updated || obj.created).getTime(), 
                        obj.current_price
                    ])
                });
                colors.push(group.color);
            }
        });
        
        return { series, colors };
    }
    
    /**
     * Генерация аннотаций коридоров
     */
    generateCorridorAnnotations() {
        const annotations = [];
        
        // Коридор активных объектов
        if (this.corridors.active.min !== null) {
            annotations.push({
                y: this.corridors.active.min,
                borderColor: '#3b82f6',
                borderWidth: 2,
                strokeDashArray: 5,
                label: {
                    text: 'Активные: мин',
                    style: { background: '#3b82f6', color: '#fff' }
                }
            });
        }
        
        if (this.corridors.active.max !== null) {
            annotations.push({
                y: this.corridors.active.max,
                borderColor: '#3b82f6',
                borderWidth: 2,
                strokeDashArray: 5,
                label: {
                    text: 'Активные: макс',
                    style: { background: '#3b82f6', color: '#fff' }
                }
            });
        }
        
        // Коридор архивных объектов
        if (this.corridors.archive.min !== null) {
            annotations.push({
                y: this.corridors.archive.min,
                borderColor: '#22c55e',
                borderWidth: 2,
                strokeDashArray: 5,
                label: {
                    text: 'Архивные: мин',
                    style: { background: '#22c55e', color: '#fff' }
                }
            });
        }
        
        if (this.corridors.archive.max !== null) {
            annotations.push({
                y: this.corridors.archive.max,
                borderColor: '#22c55e',
                borderWidth: 2,
                strokeDashArray: 5,
                label: {
                    text: 'Архивные: макс',
                    style: { background: '#22c55e', color: '#fff' }
                }
            });
        }
        
        // Оптимальный диапазон (заливка между линиями)
        if (this.corridors.optimal.min !== null && this.corridors.optimal.max !== null) {
            annotations.push({
                y: this.corridors.optimal.min,
                y2: this.corridors.optimal.max,
                fillColor: '#10b981',
                opacity: 0.1,
                label: {
                    text: 'Оптимальный диапазон',
                    style: { background: '#10b981', color: '#fff' }
                }
            });
        }
        
        return annotations;
    }
    
    /**
     * Генерация tooltip для графика
     */
    generateTooltip(tooltipModel) {
        const { seriesIndex, dataPointIndex, w } = tooltipModel;
        
        if (!w.config.series[seriesIndex] || !w.config.series[seriesIndex].data[dataPointIndex]) {
            return '<div style="padding: 8px;">Нет данных</div>';
        }
        
        const [timestamp, price] = w.config.series[seriesIndex].data[dataPointIndex];
        const date = new Date(timestamp).toLocaleDateString('ru-RU');
        const formattedPrice = this.formatPrice(price);
        
        // Найдем объект по координатам
        const object = this.currentObjects.find(obj => 
            Math.abs(new Date(obj.updated || obj.created).getTime() - timestamp) < 86400000 && 
            Math.abs(obj.current_price - price) < 1000
        );
        
        if (!object) {
            return '<div style="padding: 8px;">Объект не найден</div>';
        }
        
        const evaluation = this.evaluations.get(object.id);
        const evaluationText = this.getEvaluationDisplayName(evaluation);
        const rooms = object.rooms || object.property_type || 'н/д';
        const area = object.area_total ? `${object.area_total} м²` : 'н/д';
        
        return `
            <div style="background: white; border: 1px solid #d1d5db; border-radius: 8px; 
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); padding: 12px; max-width: 250px;">
                <div style="font-weight: 600; color: #1f2937; margin-bottom: 8px;">
                    Id ${object.id}: ${rooms}, ${area}
                </div>
                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                    Статус: ${object.status === 'active' ? 'Активный' : 'Архив'}
                </div>
                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                    Дата: ${date}
                </div>
                ${evaluation ? `
                    <div style="font-size: 14px; color: #059669; margin-bottom: 4px; font-weight: 500;">
                        Оценка: ${evaluationText}
                    </div>
                ` : ''}
                <div style="font-weight: bold; font-size: 16px; color: #2563eb;">
                    ${formattedPrice}
                </div>
            </div>
        `;
    }
    
    /**
     * Получение отображаемого названия оценки
     */
    getEvaluationDisplayName(evaluation) {
        const names = {
            'better': 'Лучше',
            'worse': 'Хуже',
            'equal': 'Равно',
            'fake': 'Фейк',
            'not-competitor': 'Не конкурент',
            'not-sold': 'Не продан'
        };
        return names[evaluation] || 'Не оценен';
    }
    
    /**
     * Сохранение текущего анализа
     */
    async saveCurrentAnalysis() {
        if (this.evaluations.size === 0) {
            alert('Нет оценок для сохранения');
            return;
        }
        
        const analysisName = prompt('Введите название анализа:');
        if (!analysisName) return;
        
        const analysisData = {
            name: analysisName,
            evaluations: Object.fromEntries(this.evaluations),
            corridors: this.corridors,
            filters: {
                segmentId: this.reportsManager.currentSegment?.id,
                subsegmentId: this.reportsManager.currentSubsegment?.id,
                dateFrom: this.reportsManager.dateFromFilter?.value,
                dateTo: this.reportsManager.dateToFilter?.value
            },
            timestamp: new Date().toISOString()
        };
        
        try {
            // TODO: Реализовать сохранение в IndexedDB через database.js
            console.log('Сохранение анализа:', analysisData);
            alert('Анализ сохранен успешно (временная заглушка)');
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка сохранения анализа:', error);
            alert('Ошибка сохранения анализа');
        }
    }
    
    /**
     * Показ модального окна загрузки анализа
     */
    async showLoadAnalysisModal() {
        alert('Функция загрузки анализов будет реализована позже');
        // TODO: Реализовать модальное окно со списком сохраненных анализов
    }
    
    /**
     * Форматирование цены
     */
    formatPrice(price) {
        if (!price) return '0 ₽';
        return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
    }
}