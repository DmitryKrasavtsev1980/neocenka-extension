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
        this.addresses = []; // кэш адресов
        
        // Коридоры цен
        this.corridors = {
            active: { min: null, max: null },
            archive: { min: null, max: null },
            optimal: { min: null, max: null }
        };
        
        // График
        this.comparativeChart = null;
        this.isUpdatingChart = false; // флаг для предотвращения одновременных обновлений
        this.updateChartTimeout = null; // таймаут для дебаунса
        this.debugEnabled = false;
        
        // Флаг инициализации
        this.isInitialized = false;
        
        // Обработчик изменения видимости страницы
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        
        // Глобальный обработчик ошибок ApexCharts
        this.handleApexChartsError = this.handleApexChartsError.bind(this);
        window.addEventListener('error', this.handleApexChartsError);
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
            
            // Восстановляем сохраненное состояние сравнений
            this.restoreComparativeState();
            
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
        document.getElementById('resetComparisonBtn')?.addEventListener('click', () => {
            this.resetComparison();
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
            
            // Загружаем адреса
            await this.loadAddresses();
            
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
            this.updateChartDebounced();
            this.updateCorridorInfo();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка запуска анализа:', error);
        }
    }
    
    /**
     * Сброс текущих сравнений
     */
    resetComparison() {
        try {
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Сброс сравнений');
            }
            
            // Подтверждение от пользователя
            if (this.evaluations.size > 0) {
                if (!confirm('Вы уверены, что хотите сбросить все сравнения? Это действие нельзя отменить.')) {
                    return;
                }
            }
            
            // Очищаем все оценки и состояние
            this.evaluations.clear();
            this.selectedObjectId = null;
            this.selectedListingId = null;
            this.resetCorridors();
            
            // Очищаем сохраненное состояние
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (areaId) {
                const stateKey = `comparative_state_${areaId}`;
                localStorage.removeItem(stateKey);
            }
            
            // Обновляем отображение
            this.updateObjectsDisplay();
            this.updateChartDebounced();
            this.updateCorridorInfo();
            this.updateEvaluationButtons();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка сброса сравнений:', error);
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
                <div class="object-block ${evaluationClass} ${selectedClass}" 
                     data-object-id="${obj.id}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1 mr-2">
                            <div class="object-characteristics font-semibold text-sm">${characteristics}</div>
                        </div>
                        <div class="flex-shrink-0 text-right">
                            <div class="object-price" style="font-size: 16px !important; color: #059669 !important; font-weight: 600 !important;">${formattedPrice}</div>
                            ${pricePerSqm ? `<div class="price-per-sqm" style="font-size: 10px !important; color: #10b981 !important; font-weight: 400 !important;">${pricePerSqm}</div>` : ''}
                        </div>
                    </div>
                    <div class="object-address text-xs text-gray-500">${address}</div>
                    ${dateInfo ? `<div class="object-dates text-xs text-gray-400 mt-1">${dateInfo}</div>` : ''}
                </div>
            `;
        }).join('');
        
        // Добавляем обработчики событий для блоков объектов
        grid.querySelectorAll('.object-block').forEach(block => {
            block.addEventListener('click', () => {
                const objectId = block.dataset.objectId;
                
                // Если объект уже выбран, показываем модальное окно
                if (this.selectedObjectId === objectId) {
                    this.showObjectModal(objectId);
                } else {
                    // Иначе просто выбираем объект
                    this.selectObject(objectId);
                }
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
            
            // Сохраняем состояние
            this.saveComparativeState();
            
            // Обновляем график (выбранный объект станет розовым)
            this.updateChartDebounced();
            
            // Загружаем объявления объекта
            await this.loadObjectListings(objectId);
            
            // Обновляем кнопки оценки
            this.updateEvaluationButtons();
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка выбора объекта:', error);
        }
    }
    
    /**
     * Выбор объекта с прокруткой (для использования из внешних источников)
     */
    async selectObjectWithScroll(objectId) {
        await this.selectObject(objectId);
        
        // Небольшая задержка, чтобы UI успел обновиться
        setTimeout(() => {
            this.scrollToSelectedObject(objectId);
        }, 100);
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
                
                // Форматируем информацию о датах в зависимости от статуса объявления
                let dateInfo = '';
                if (listing.status === 'archived') {
                    // Для архивных: дата создания и дата обновления
                    const createdDate = listing.created ? new Date(listing.created).toLocaleDateString('ru-RU') : '';
                    const updatedDate = listing.updated ? new Date(listing.updated).toLocaleDateString('ru-RU') : '';
                    if (createdDate && updatedDate) {
                        dateInfo = `Архив: ${createdDate} - ${updatedDate}`;
                    } else if (createdDate) {
                        dateInfo = `${createdDate}`;
                    } else if (updatedDate) {
                        dateInfo = `${updatedDate}`;
                    }
                } else {
                    // Для активных: текущая дата
                    const createdDate = listing.created ? new Date(listing.created).toLocaleDateString('ru-RU') : '';
                    const currentDate = new Date().toLocaleDateString('ru-RU');
                    dateInfo = `Активный:  ${createdDate} - ${currentDate}`;
                }
                
                // Создаем характеристики объявления (без адреса)
                const characteristics = this.formatObjectCharacteristics(listing);
                const price = this.formatPrice(listing.price);
                
                return `
                    <div class="listing-block ${selectedClass}"
                         data-listing-id="${listing.id}">
                        <div class="listing-characteristics text-sm font-medium">${characteristics}</div>
                        <div class="listing-price text-sm text-blue-600">${price}</div>
                        <div class="text-xs text-gray-500 mt-1">${dateInfo}</div>
                    </div>
                `;
            }).join('');
            
            // Добавляем обработчики событий для блоков объявлений
            listingsList.querySelectorAll('.listing-block').forEach(block => {
                block.addEventListener('click', () => {
                    const listingId = block.dataset.listingId;
                    
                    // Если объявление уже выбрано, показываем модальное окно
                    if (this.selectedListingId === listingId) {
                        this.showListingModal(listingId);
                    } else {
                        // Иначе просто выбираем объявление
                        this.selectListing(listingId);
                    }
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
            
            // Найдем контейнер деталей объявления
            let detailsContainer = document.getElementById('listingDetails');
            if (!detailsContainer) {
                // Fallback - ищем через старые элементы
                const photosGallery = document.getElementById('photosGallery');
                const descriptionDiv = document.getElementById('listingDescription');
                if (photosGallery && descriptionDiv) {
                    detailsContainer = photosGallery.parentElement;
                }
            }
            
            if (detailsContainer) {
                // Показываем контейнер деталей, если он скрыт
                if (detailsContainer.classList.contains('hidden')) {
                    detailsContainer.classList.remove('hidden');
                }
                
                // Убираем вертикальные отступы, оставляем небольшие горизонтальные
                detailsContainer.style.padding = '0 8px';
                detailsContainer.style.margin = '0';
                
                // Создаём HTML структуру с фотогалереей точно как в UIManager
                if (listing.photos && listing.photos.length > 0) {
                    detailsContainer.innerHTML = `
                        <div class="grid grid-cols-2 gap-x-6" style="height: 380px;">
                            <!-- Левая часть - фотогалерея -->
                            <div class="fotorama-container">
                                <div class="fotorama" 
                                     data-nav="thumbs" 
                                     data-width="100%" 
                                     data-height="300"
                                     data-thumbheight="50"
                                     data-thumbwidth="50"
                                     data-allowfullscreen="true"
                                     data-transition="slide"
                                     data-loop="true"
                                     id="comparative-gallery-${listingId}">
                                    ${listing.photos.map(photo => `<img src="${photo}" alt="Фото объявления" class="listing-photo">`).join('')}
                                </div>
                            </div>
                            
                            <!-- Правая часть - описание -->
                            <div class="description-container h-80 flex flex-col">
                                <div class="mb-3 font-medium text-gray-800 flex-shrink-0">Описание:</div>
                                <div class="bg-gray-50 border border-gray-200 rounded p-4 overflow-y-auto flex-1">
                                    <div id="fullDescription" class="text-sm text-gray-700 leading-relaxed"></div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    detailsContainer.innerHTML = `
                        <div class="grid grid-cols-2 gap-4" style="height: 380px;">
                            <!-- Левая часть - заглушка -->
                            <div class="fotorama-container">
                                <div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500" style="height: 380px;">
                                    📷 Фотографии не найдены
                                </div>
                            </div>
                            
                            <!-- Правая часть - описание -->
                            <div class="description-container h-80 flex flex-col">
                                <div class="mb-3 font-medium text-gray-800 flex-shrink-0">Описание:</div>
                                <div class="bg-gray-50 border border-gray-200 rounded p-4 overflow-y-auto flex-1">
                                    <div id="fullDescription" class="text-sm text-gray-700 leading-relaxed"></div>
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                // Сразу заполняем описание (убираем мигание)
                const fullDescriptionDiv = document.getElementById('fullDescription');
                if (fullDescriptionDiv) {
                    if (listing.description && listing.description.trim()) {
                        fullDescriptionDiv.innerHTML = `<div class="whitespace-pre-wrap">${listing.description}</div>`;
                    } else {
                        fullDescriptionDiv.innerHTML = '<div class="text-gray-500">Описание отсутствует</div>';
                    }
                }
                
                // Инициализируем Fotorama (если есть фото)
                if (listing.photos && listing.photos.length > 0) {
                    setTimeout(() => {
                        const galleryElement = document.getElementById(`comparative-gallery-${listingId}`);
                        if (galleryElement && window.$ && $.fn.fotorama) {
                            $(galleryElement).fotorama();
                            if (this.debugEnabled) {
                                console.log('📸 Fotorama инициализирован для объявления:', listingId);
                            }
                        }
                    }, 100);
                }
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
            this.updateChartDebounced();
            this.updateCorridorInfo();
            this.updateEvaluationButtons();
            
            // Сохраняем состояние
            this.saveComparativeState();
            
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
     * Дебаунс-обновление графика (предотвращает множественные обновления)
     */
    updateChartDebounced(delay = 300) {
        // Отменяем предыдущий таймаут если он есть
        if (this.updateChartTimeout) {
            clearTimeout(this.updateChartTimeout);
        }
        
        // Устанавливаем новый таймаут
        this.updateChartTimeout = setTimeout(async () => {
            await this.updateChart();
            this.updateChartTimeout = null;
        }, delay);
    }

    /**
     * Обновление графика
     */
    async updateChart() {
        // Предварительная проверка состояния
        if (this.isUpdatingChart) {
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: График уже обновляется, пропускаем');
            }
            return;
        }
        
        this.isUpdatingChart = true;
        
        try {
            const chartContainer = document.getElementById('comparativeChart');
            if (!chartContainer) {
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: Контейнер графика не найден');
                }
                return;
            }
            
            // Множественные проверки готовности контейнера
            if (!this.isContainerReady(chartContainer)) {
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: Контейнер графика не готов');
                }
                return;
            }
            
            // Подготовка данных для графика
            const chartData = this.generateChartData();
            
            // Уничтожение старого графика
            await this.destroyChart();
            
            // Дополнительная задержка и проверка перед созданием
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Повторная проверка после задержки
            if (!this.isContainerReady(chartContainer)) {
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: Контейнер стал недоступен после задержки');
                }
                return;
            }
            
            const options = {
                chart: {
                    type: 'scatter',
                    height: 400,
                    toolbar: { show: false },
                    events: {
                        dataPointSelection: (event, chartContext, config) => {
                            // Обернём в setTimeout, так как ApexCharts не поддерживает async коллбэки
                            setTimeout(async () => {
                                await this.onChartPointClick(config);
                            }, 0);
                        }
                    },
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
                    custom: ({ series, seriesIndex, dataPointIndex, w }) => {
                        return this.generateTooltip({ series, seriesIndex, dataPointIndex, w });
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
            
            try {
                this.comparativeChart = new ApexCharts(chartContainer, options);
                await this.comparativeChart.render();
                
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: График успешно создан');
                }
                
            } catch (renderError) {
                console.error('❌ ComparativeAnalysisManager: Ошибка рендеринга графика:', renderError);
                await this.destroyChart();
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка обновления графика:', error);
            await this.destroyChart();
        } finally {
            this.isUpdatingChart = false;
        }
    }
    
    /**
     * Проверка готовности контейнера для графика
     */
    isContainerReady(container) {
        if (!container) return false;
        
        // Проверяем подключение к DOM
        if (!container.isConnected) return false;
        
        // Проверяем видимость
        if (container.offsetParent === null) return false;
        
        // Проверяем размеры
        if (container.offsetWidth === 0 || container.offsetHeight === 0) return false;
        
        // Проверяем что контейнер не скрыт через CSS
        const computedStyle = window.getComputedStyle(container);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') return false;
        
        return true;
    }
    
    /**
     * Безопасное уничтожение графика
     */
    async destroyChart() {
        // Отменяем любые ожидающие обновления
        if (this.updateChartTimeout) {
            clearTimeout(this.updateChartTimeout);
            this.updateChartTimeout = null;
        }
        
        if (this.comparativeChart) {
            try {
                // Сначала пытаемся очистить все обработчики событий
                if (this.comparativeChart.w && this.comparativeChart.w.globals) {
                    this.comparativeChart.w.globals.resized = true;
                }
                
                // Пытаемся скрыть tooltip и другие элементы
                if (this.comparativeChart.w && this.comparativeChart.w.globals.dom) {
                    const tooltips = this.comparativeChart.w.globals.dom.baseEl.querySelectorAll('.apexcharts-tooltip');
                    tooltips.forEach(tooltip => {
                        if (tooltip && tooltip.style) {
                            tooltip.style.display = 'none';
                        }
                    });
                }
                
                // Уничтожаем график
                await this.comparativeChart.destroy();
                
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: График успешно уничтожен');
                }
            } catch (error) {
                console.error('❌ ComparativeAnalysisManager: Ошибка при уничтожении графика:', error);
                
                // Попытка принудительной очистки
                try {
                    if (this.comparativeChart.w && this.comparativeChart.w.globals.dom && this.comparativeChart.w.globals.dom.baseEl) {
                        this.comparativeChart.w.globals.dom.baseEl.innerHTML = '';
                    }
                } catch (cleanupError) {
                    console.error('❌ ComparativeAnalysisManager: Ошибка принудительной очистки:', cleanupError);
                }
            } finally {
                this.comparativeChart = null;
            }
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
        
        // Отдельная группа для выбранного объекта
        let selectedObject = null;
        
        // Распределение объектов по группам
        this.currentObjects.forEach(obj => {
            // Если объект выбран, выделяем его отдельно
            if (this.selectedObjectId && obj.id === this.selectedObjectId) {
                selectedObject = obj;
                return; // Не добавляем в обычные группы
            }
            
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
        
        // Создание серий для обычных объектов
        Object.entries(groups).forEach(([groupKey, group]) => {
            if (group.objects.length > 0) {
                series.push({
                    name: group.name,
                    data: group.objects.map(obj => {
                        let dateForChart;
                        
                        if (obj.status === 'active') {
                            // Для активных объектов используем текущую дату
                            dateForChart = new Date().getTime();
                        } else {
                            // Для архивных объектов используем дату последнего обновления
                            dateForChart = new Date(obj.updated || obj.created).getTime();
                        }
                        
                        return {
                            x: dateForChart,
                            y: obj.current_price,
                            objectData: obj // Добавляем данные объекта для tooltip и кликов
                        };
                    })
                });
                colors.push(group.color);
            }
        });
        
        // Добавляем выбранный объект как отдельную серию с розовым цветом
        if (selectedObject) {
            let dateForChart;
            
            if (selectedObject.status === 'active') {
                dateForChart = new Date().getTime();
            } else {
                dateForChart = new Date(selectedObject.updated || selectedObject.created).getTime();
            }
            
            series.push({
                name: 'Выбранный объект',
                data: [{
                    x: dateForChart,
                    y: selectedObject.current_price,
                    objectData: selectedObject // Добавляем данные объекта
                }],
                marker: {
                    size: 10, // Увеличенный размер для выбранного объекта
                    strokeWidth: 3,
                    strokeColor: '#fff'
                }
            });
            colors.push('#ec4899'); // Розовый цвет для выбранного объекта
        }
        
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

    /**
     * Форматирование характеристик объекта (аналогично DuplicatesManager)
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
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Характеристики не указаны';
    }

    /**
     * Форматирование полной строки с характеристиками и ценой
     */
    formatObjectFullInfo(obj) {
        const characteristics = this.formatObjectCharacteristics(obj);
        const price = obj.current_price || 0;
        const formattedPrice = this.formatPrice(price);
        
        // Цена за кв.м если есть общая площадь
        let pricePerSqm = '';
        if (price > 0 && obj.area_total > 0) {
            const perSqm = Math.round(price / obj.area_total);
            pricePerSqm = ` (${new Intl.NumberFormat('ru-RU').format(perSqm)})`;
        }
        
        return `${characteristics} ${formattedPrice}${pricePerSqm}`;
    }

    /**
     * Получение названия адреса по ID
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses) return '';
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address : '';
    }

    /**
     * Загрузка адресов в текущей области (оптимизированно)
     */
    async loadAddresses() {
        try {
            const areaId = this.areaPage.currentAreaId;
            if (!areaId) {
                this.addresses = [];
                return;
            }

            this.addresses = await window.db.getAddressesInMapArea(areaId);
            if (this.debugEnabled) {
                console.log(`📍 ComparativeAnalysisManager: Загружено ${this.addresses.length} адресов в области ${areaId}`);
            }
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка загрузки адресов:', error);
            this.addresses = [];
        }
    }
    
    /**
     * Показать модальное окно объекта недвижимости
     */
    async showObjectModal(objectId) {
        try {
            // Используем существующий метод из DuplicatesManager
            if (this.areaPage && this.areaPage.duplicatesManager) {
                await this.areaPage.duplicatesManager.showObjectDetails(objectId);
            } else {
                console.error('❌ ComparativeAnalysisManager: DuplicatesManager не найден');
            }
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Открыто модальное окно объекта:', objectId);
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка открытия модального окна объекта:', error);
        }
    }
    
    /**
     * Показать модальное окно объявления
     */
    async showListingModal(listingId) {
        try {
            // Используем существующий метод из DuplicatesManager
            if (this.areaPage && this.areaPage.duplicatesManager) {
                await this.areaPage.duplicatesManager.showListingDetails(listingId);
            } else {
                console.error('❌ ComparativeAnalysisManager: DuplicatesManager не найден');
            }
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Открыто модальное окно объявления:', listingId);
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка открытия модального окна объявления:', error);
        }
    }
    
    /**
     * Генерация пользовательского tooltip для точек графика
     */
    generateTooltip({ series, seriesIndex, dataPointIndex, w }) {
        try {
            // Получаем данные точки
            const chartData = w.globals.initialSeries[seriesIndex].data[dataPointIndex];
            const objectData = chartData?.objectData;
            
            if (!objectData) {
                return '<div class="custom-tooltip">Нет данных</div>';
            }
            
            // Форматируем характеристики объекта
            const characteristics = this.formatObjectCharacteristics(objectData);
            const price = this.formatPrice(objectData.current_price);
            
            // Форматируем дату в зависимости от статуса
            let dateInfo = '';
            if (objectData.status === 'archive') {
                const createdDate = objectData.created ? new Date(objectData.created).toLocaleDateString('ru-RU') : '';
                const updatedDate = objectData.updated ? new Date(objectData.updated).toLocaleDateString('ru-RU') : '';
                if (createdDate && updatedDate) {
                    dateInfo = `Архив: ${createdDate} - ${updatedDate}`;
                } else if (createdDate) {
                    dateInfo = `${createdDate}`;
                } else if (updatedDate) {
                    dateInfo = `${updatedDate}`;
                }
            } else {
                const createdDate = objectData.created ? new Date(objectData.created).toLocaleDateString('ru-RU') : '';
                const currentDate = new Date().toLocaleDateString('ru-RU');
                dateInfo = `Активный: ${createdDate} - ${currentDate}`;
            }
            
            return `
                <div class="custom-tooltip bg-white p-3 rounded-lg shadow-lg border max-w-xs">
                    <div class="font-semibold text-sm mb-2">${characteristics}</div>
                    <div class="font-bold text-blue-600 text-sm mb-1">${price}</div>
                    <div class="text-xs text-gray-500">${dateInfo}</div>
                    <div class="text-xs text-gray-400 mt-1">Нажмите для выбора</div>
                </div>
            `;
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка генерации tooltip:', error);
            return '<div class="custom-tooltip">Ошибка загрузки</div>';
        }
    }
    
    /**
     * Обработчик кликов по точкам графика
     */
    async onChartPointClick(config) {
        try {
            const { seriesIndex, dataPointIndex } = config;
            
            if (seriesIndex === undefined || dataPointIndex === undefined) return;
            
            // Получаем данные объекта из конфигурации графика
            const chartSeries = this.comparativeChart.w.globals.initialSeries[seriesIndex];
            const pointData = chartSeries?.data?.[dataPointIndex];
            const objectData = pointData?.objectData;
            
            if (objectData && objectData.id) {
                // Выбираем объект с автоматической прокруткой
                await this.selectObjectWithScroll(objectData.id);
                
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: Выбран объект через клик на графике:', objectData.id);
                }
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка обработки клика на графике:', error);
        }
    }
    
    /**
     * Прокрутка к выбранному блоку объекта
     */
    scrollToSelectedObject(objectId) {
        try {
            // Находим блок объекта по data-object-id
            const objectBlock = document.querySelector(`[data-object-id="${objectId}"]`);
            if (!objectBlock) {
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: Блок объекта не найден для прокрутки:', objectId);
                }
                return;
            }
            
            // Находим контейнер с прокруткой
            const objectsContainer = document.getElementById('objectsGrid');
            if (!objectsContainer) {
                if (this.debugEnabled) {
                    console.log('🔍 ComparativeAnalysisManager: Контейнер объектов не найден для прокрутки');
                }
                return;
            }
            
            // Получаем родительский контейнер с overflow
            let scrollContainer = objectsContainer;
            
            // Ищем родительский элемент с прокруткой, если сам контейнер не скроллируется
            while (scrollContainer && scrollContainer !== document.body) {
                const styles = window.getComputedStyle(scrollContainer);
                if (styles.overflowY === 'scroll' || styles.overflowY === 'auto' || 
                    (styles.overflow === 'scroll' || styles.overflow === 'auto')) {
                    break;
                }
                scrollContainer = scrollContainer.parentElement;
            }
            
            // Если не найден скроллируемый контейнер, используем window
            if (!scrollContainer || scrollContainer === document.body) {
                // Прокрутка всего окна
                objectBlock.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            } else {
                // Прокрутка внутри контейнера
                const containerRect = scrollContainer.getBoundingClientRect();
                const blockRect = objectBlock.getBoundingClientRect();
                
                // Вычисляем позицию для центрирования блока в видимой области
                const scrollTop = scrollContainer.scrollTop;
                const targetScrollTop = scrollTop + (blockRect.top - containerRect.top) - 
                                     (containerRect.height - blockRect.height) / 2;
                
                // Плавная прокрутка
                scrollContainer.scrollTo({
                    top: Math.max(0, targetScrollTop),
                    behavior: 'smooth'
                });
            }
            
            // Добавляем визуальный эффект мерцания для привлечения внимания
            objectBlock.style.transition = 'box-shadow 0.3s ease';
            objectBlock.style.boxShadow = '0 0 20px rgba(236, 72, 153, 0.5)';
            
            setTimeout(() => {
                objectBlock.style.boxShadow = '';
                setTimeout(() => {
                    objectBlock.style.transition = '';
                }, 300);
            }, 1000);
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Выполнена прокрутка к объекту:', objectId);
            }
            
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка прокрутки к объекту:', error);
        }
    }
    
    /**
     * Безопасное обновление графика при показе/скрытии панели
     */
    async safeUpdateChart() {
        // Используем requestAnimationFrame для обеспечения готовности DOM
        return new Promise((resolve) => {
            requestAnimationFrame(async () => {
                // Дополнительная проверка видимости страницы
                if (document.hidden) {
                    if (this.debugEnabled) {
                        console.log('🔍 ComparativeAnalysisManager: Страница скрыта, пропускаем safeUpdateChart');
                    }
                    resolve();
                    return;
                }
                
                try {
                    await this.updateChart();
                    resolve();
                } catch (error) {
                    console.error('❌ ComparativeAnalysisManager: Ошибка в safeUpdateChart:', error);
                    resolve();
                }
            });
        });
    }
    
    /**
     * Метод для вызова при активации панели сравнительного анализа
     */
    async onPanelActivated() {
        if (this.debugEnabled) {
            console.log('🔍 ComparativeAnalysisManager: Панель активирована');
        }
        
        // Небольшая задержка, чтобы убедиться что панель видима
        setTimeout(async () => {
            await this.safeUpdateChart();
        }, 200);
    }
    
    /**
     * Обработчик изменения видимости страницы
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Страница скрыта - останавливаем обновления графика
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Страница скрыта, приостанавливаем график');
            }
        } else {
            // Страница снова видна - можем обновить график если нужно
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Страница снова видна');
            }
            
            // Небольшая задержка перед обновлением
            setTimeout(async () => {
                const chartContainer = document.getElementById('comparativeChart');
                if (chartContainer && this.isContainerReady(chartContainer)) {
                    await this.safeUpdateChart();
                }
            }, 300);
        }
    }
    
    /**
     * Обработчик глобальных ошибок ApexCharts
     */
    handleApexChartsError(event) {
        // Проверяем, что ошибка связана с ApexCharts и getBoundingClientRect
        if (event.error && event.filename && 
            event.filename.includes('apexcharts') && 
            event.message && event.message.includes('getBoundingClientRect')) {
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Перехвачена ошибка ApexCharts, пытаемся восстановить график');
            }
            
            // Предотвращаем всплытие ошибки
            event.preventDefault();
            event.stopPropagation();
            
            // Пытаемся безопасно пересоздать график с задержкой
            setTimeout(async () => {
                try {
                    await this.destroyChart();
                    // Небольшая задержка перед пересозданием
                    setTimeout(() => {
                        this.updateChartDebounced(500);
                    }, 200);
                } catch (recoveryError) {
                    console.error('❌ ComparativeAnalysisManager: Ошибка восстановления графика:', recoveryError);
                }
            }, 100);
            
            return false;
        }
    }
    
    /**
     * Сохранение текущего состояния сравнений в localStorage
     */
    saveComparativeState() {
        try {
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (!areaId) return;
            
            const stateKey = `comparative_state_${areaId}`;
            const state = {
                evaluations: Object.fromEntries(this.evaluations),
                selectedObjectId: this.selectedObjectId,
                selectedListingId: this.selectedListingId,
                corridors: this.corridors,
                statusFilter: this.statusFilter,
                timestamp: Date.now()
            };
            
            localStorage.setItem(stateKey, JSON.stringify(state));
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Состояние сохранено', state);
            }
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка сохранения состояния:', error);
        }
    }
    
    /**
     * Восстановление состояния сравнений из localStorage
     */
    restoreComparativeState() {
        try {
            const areaId = this.areaPage.dataState?.getState('currentArea')?.id;
            if (!areaId) return;
            
            const stateKey = `comparative_state_${areaId}`;
            const savedState = localStorage.getItem(stateKey);
            
            if (!savedState) return;
            
            const state = JSON.parse(savedState);
            
            // Проверяем возраст состояния (не старше 24 часов)
            const maxAge = 24 * 60 * 60 * 1000; // 24 часа
            if (Date.now() - state.timestamp > maxAge) {
                localStorage.removeItem(stateKey);
                return;
            }
            
            // Восстанавливаем состояние
            this.evaluations = new Map(Object.entries(state.evaluations || {}));
            this.selectedObjectId = state.selectedObjectId;
            this.selectedListingId = state.selectedListingId;
            this.corridors = state.corridors || {
                active: { min: null, max: null },
                archive: { min: null, max: null },
                optimal: { min: null, max: null }
            };
            this.statusFilter = state.statusFilter || 'all';
            
            if (this.debugEnabled) {
                console.log('🔍 ComparativeAnalysisManager: Состояние восстановлено', state);
            }
        } catch (error) {
            console.error('❌ ComparativeAnalysisManager: Ошибка восстановления состояния:', error);
        }
    }

    /**
     * Очистка ресурсов при удалении менеджера
     */
    destroy() {
        // Удаляем обработчики событий
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('error', this.handleApexChartsError);
        
        // Отменяем таймаут
        if (this.updateChartTimeout) {
            clearTimeout(this.updateChartTimeout);
            this.updateChartTimeout = null;
        }
        
        // Уничтожаем график
        this.destroyChart();
        
        if (this.debugEnabled) {
            console.log('🔍 ComparativeAnalysisManager: Ресурсы очищены');
        }
    }
}