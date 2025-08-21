/**
 * FlippingController - контроллер для отчёта доходности флиппинг
 * Координирует работу сервисов и компонентов UI
 * Следует архитектуре v0.1
 */
class FlippingController extends EventTarget {
    constructor(diContainer) {
        super();
        
        this.diContainer = diContainer;
        
        // Сервисы (будут инжектированы через DI)
        this.realEstateObjectService = null;
        this.validationService = null;
        this.errorHandlingService = null;
        this.configService = null;
        
        // UI компоненты
        this.flippingTable = null;
        this.flippingMap = null;
        
        // Состояние
        this.currentFilters = this.getDefaultFilters();
        this.currentSegment = null;
        this.objects = [];
        this.filteredObjects = [];
        
        this.debugEnabled = false;
        this.initialized = false;
        
        // Привязываем контекст методов
        this.handleFilterChange = this.handleFilterChange.bind(this);
        this.applyFilters = this.applyFilters.bind(this);
        this.showObjectDetails = this.showObjectDetails.bind(this);
    }

    /**
     * Инициализация контроллера через DI
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Получаем сервисы через DI контейнер
            this.realEstateObjectService = await this.diContainer.get('RealEstateObjectService');
            this.validationService = await this.diContainer.get('ValidationService');
            this.errorHandlingService = await this.diContainer.get('ErrorHandlingService');
            this.configService = await this.diContainer.get('ConfigService');

            await this.loadDebugSettings();

            // Инициализируем UI компоненты
            await this.initializeUIComponents();

            // Настраиваем обработчики событий
            this.setupEventHandlers();

            // Экспортируем в глобальную область для доступа из HTML
            window.flippingController = this;

            this.initialized = true;


        } catch (error) {
            console.error('❌ FlippingController: Ошибка инициализации:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек отладки
     */
    async loadDebugSettings() {
        try {
            const debugConfig = await this.configService.get('debug.enabled');
            this.debugEnabled = debugConfig === true;
        } catch (error) {
            this.debugEnabled = false;
        }
    }

    /**
     * Инициализация UI компонентов
     */
    async initializeUIComponents() {
        try {
            // Инициализируем таблицу
            this.flippingTable = new FlippingTable(
                'flippingTable',
                this.errorHandlingService,
                this.configService
            );
            await this.flippingTable.initialize();

            // Инициализируем карту
            this.flippingMap = new FlippingMap(
                'flippingProfitabilityMap',
                this.errorHandlingService,
                this.configService
            );
            await this.flippingMap.initialize();


        } catch (error) {
            console.error('❌ FlippingController: Ошибка инициализации UI:', error);
            throw error;
        }
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventHandlers() {
        // Обработчики фильтров (они уже настроены в FlippingProfitabilityManager)
        // Здесь мы подписываемся на события от других компонентов
        
        // События карты
        this.addEventListener('object:selected', (event) => {
            this.handleObjectSelection(event.detail.object);
        });

        // События таблицы
        this.addEventListener('objects:filtered', (event) => {
            this.handleObjectsFiltered(event.detail.objects);
        });
    }

    /**
     * Получение фильтров по умолчанию
     */
    getDefaultFilters() {
        return {
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
    }

    /**
     * Установка текущего сегмента
     */
    setCurrentSegment(segment) {
        this.currentSegment = segment;
        

        // Эмитируем событие изменения сегмента
        this.emit('segment:changed', { segment });
    }

    /**
     * Обработка изменения фильтров
     */
    handleFilterChange(filters) {
        this.currentFilters = { ...this.currentFilters, ...filters };
        

        // Эмитируем событие изменения фильтров
        this.emit('filters:changed', { filters: this.currentFilters });
    }

    /**
     * Применение фильтров и обновление данных
     */
    async applyFilters() {
        
        try {

            if (!this.currentSegment) {
                throw new Error('Не выбран сегмент для анализа');
            }


            // Получаем глобальные фильтры и загружаем объекты через ReportsManager
            const globalSegmentId = this.currentFilters.globalSegment?.id || this.currentSegment.id;
            const globalSubsegmentId = this.currentFilters.globalSubsegment?.id;
            const dateFrom = this.currentFilters.globalDateFrom || new Date('2023-01-01');
            const dateTo = this.currentFilters.globalDateTo || new Date();
            
            // Получаем текущую область из dataState
            const currentArea = this.getCurrentArea();
            if (!currentArea) {
                throw new Error('Не выбрана область для анализа');
            }
            
            // Используем тот же метод что и FlippingProfitabilityManager для согласованности
            this.objects = await this.getFilteredObjectsFromReportsManager(
                currentArea.id, globalSegmentId, globalSubsegmentId, dateFrom, dateTo
            );


            if (!Array.isArray(this.objects)) {
                this.objects = [];
            }

            if (this.objects.length === 0) {
                throw new Error('В выбранном сегменте нет объектов недвижимости');
            }


            // Применяем фильтры
            this.filteredObjects = this.realEstateObjectService.filterObjects(
                this.objects, 
                this.currentFilters
            );


            if (this.filteredObjects.length === 0) {
                throw new Error('Нет объектов, соответствующих заданным фильтрам');
            }

            // Рассчитываем доходность для каждого объекта
            this.filteredObjects = this.filteredObjects.map(obj => ({
                ...obj,
                profitability: this.realEstateObjectService.calculateProfitability(obj, this.currentFilters)
            }));

            // Обновляем UI компоненты
            await this.updateUIComponents();

            // Даём время интерфейсу загрузиться, затем обновляем карту
            setTimeout(() => {
                if (this.flippingMap && this.flippingMap.map) {
                    this.flippingMap.map.invalidateSize();
                }
            }, 500);

            // Эмитируем событие успешного применения фильтров
            this.emit('filters:applied', { 
                objects: this.filteredObjects,
                filters: this.currentFilters 
            });

            return this.filteredObjects;

        } catch (error) {
            console.error('❌ FlippingController: Ошибка в applyFilters:', error);
            // Уведомляем ErrorHandlingService об ошибке
            await this.errorHandlingService.handleError(error, { context: 'applyFilters' });
            throw error; // Пробрасываем ошибку дальше
        }
    }

    /**
     * Обновление UI компонентов
     */
    async updateUIComponents() {
        try {

            // Обновляем таблицу
            if (this.flippingTable) {
                await this.flippingTable.updateData(this.filteredObjects, this.currentFilters);
            }

            // Обновляем карту с адресами (новый подход)
            if (this.flippingMap) {
                // Извлекаем уникальные адреса из отфильтрованных объектов
                const addressMap = new Map();
                
                for (const obj of this.filteredObjects) {
                    // Проверяем наличие адреса в объекте
                    if (obj.address && obj.address_id) {
                        addressMap.set(obj.address_id, obj.address);
                    } else if (obj.address_id) {
                        // Если адреса нет в объекте, пытаемся загрузить его
                        try {
                            const address = await window.db.getAddress(obj.address_id);
                            if (address) {
                                addressMap.set(obj.address_id, address);
                                // Сохраняем адрес в объекте для дальнейшего использования
                                obj.address = address;
                            }
                        } catch (error) {
                            console.warn(`⚠️ Не удалось загрузить адрес ${obj.address_id}:`, error);
                        }
                    }
                }
                
                const uniqueAddresses = Array.from(addressMap.values());
                
                
                
                // Передаём и адреса, и объекты для расчёта доходности
                await this.flippingMap.updateAddresses(uniqueAddresses, this.currentFilters, this.filteredObjects);
            }


        } catch (error) {
            console.error('❌ FlippingController: Ошибка обновления UI:', error);
            throw error;
        }
    }

    /**
     * Обработка выбора объекта
     */
    handleObjectSelection(object) {

        // Эмитируем событие выбора объекта
        this.emit('object:selected', { object });
    }

    /**
     * Показ деталей объекта
     */
    showObjectDetails(objectId) {
        const object = this.filteredObjects.find(obj => obj.id === objectId);
        
        if (!object) {
            console.error('❌ FlippingController: Объект не найден:', objectId);
            return;
        }

        const profitability = object.profitability || {};
        const roomsText = object.rooms === 0 || object.rooms === 'studio' ? 'Студия' : `${object.rooms}-комнатная`;
        const address = object.address?.address_string || 'Адрес не определён';
        const price = object.price ? new Intl.NumberFormat('ru-RU').format(object.price) + ' ₽' : 'Не указана';
        const area = object.area ? `${object.area} м²` : 'Не указана';
        const profitabilityText = `${profitability.annualReturn?.toFixed(1) || 0}% годовых`;
        const totalProfitText = profitability.totalProfit ? 
            new Intl.NumberFormat('ru-RU').format(Math.round(profitability.totalProfit)) + ' ₽' : '—';

        // Показываем модальное окно или алерт с деталями
        alert(`Детали объекта недвижимости:

${roomsText} квартира
${address}
Площадь: ${area}
Цена: ${price}

Доходность: ${profitabilityText}
Прогнозируемая прибыль: ${totalProfitText}`);

        // Эмитируем событие показа деталей
        this.emit('object:details:shown', { object });
    }

    /**
     * Получение статистики
     */
    getStatistics() {
        const objectsStats = this.realEstateObjectService.getObjectsStatistics(this.filteredObjects);
        const mapStats = this.flippingMap ? this.flippingMap.getMarkersStatistics() : null;

        return {
            objects: objectsStats,
            map: mapStats,
            filters: this.currentFilters,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Эмиссия событий (helper метод)
     */
    emit(eventName, data = {}) {
        const event = new CustomEvent(eventName, { detail: data });
        this.dispatchEvent(event);

    }

    /**
     * Уничтожение контроллера
     */
    destroy() {
        // Уничтожаем UI компоненты
        if (this.flippingTable) {
            this.flippingTable.destroy();
            this.flippingTable = null;
        }

        if (this.flippingMap) {
            this.flippingMap.destroy();
            this.flippingMap = null;
        }

        // Очищаем состояние
        this.objects = [];
        this.filteredObjects = [];
        this.currentSegment = null;
        
        // Удаляем из глобальной области
        if (window.flippingController === this) {
            delete window.flippingController;
        }

        this.initialized = false;

    }
    
    /**
     * Получение текущей области из DataState
     */
    getCurrentArea() {
        try {
            // Получаем DataState через глобальную переменную (как в FlippingProfitabilityManager)
            if (window.areaPage && window.areaPage.dataState) {
                return window.areaPage.dataState.getState('currentArea');
            }
            return null;
        } catch (error) {
            console.error('❌ FlippingController: Ошибка получения текущей области:', error);
            return null;
        }
    }
    
    /**
     * Получение отфильтрованных объектов через ReportsManager
     */
    async getFilteredObjectsFromReportsManager(areaId, segmentId, subsegmentId, dateFrom, dateTo) {
        try {
            // Получаем ReportsManager через глобальную переменную
            if (window.areaPage && window.areaPage.reportsManager && typeof window.areaPage.reportsManager.getFilteredRealEstateObjects === 'function') {
                return await window.areaPage.reportsManager.getFilteredRealEstateObjects(
                    areaId, segmentId, subsegmentId, dateFrom, dateTo
                );
            } else {
                if (this.debugEnabled) {
                    console.warn('⚠️ FlippingController: ReportsManager недоступен:', {
                        'window.areaPage': !!window.areaPage,
                        'reportsManager': !!window.areaPage?.reportsManager,
                        'getFilteredRealEstateObjects': typeof window.areaPage?.reportsManager?.getFilteredRealEstateObjects
                    });
                }
                // Fallback: если нет segmentId, получаем все объекты области
                if (!segmentId) {
                    // Получаем все адреса в области и все объекты этих адресов
                    if (window.db && areaId) {
                        const addresses = await window.db.getAddressesInMapArea(areaId);
                        let allObjects = [];
                        for (const address of addresses) {
                            const addressObjects = await window.db.getObjectsByAddress(address.id);
                            for (const obj of addressObjects) {
                                if (obj.address_id) {
                                    obj.address = await window.db.getAddress(obj.address_id);
                                } else {
                                    // Если у объекта нет address_id, но есть address, используем его
                                    if (!obj.address && address) {
                                        obj.address = address;
                                        obj.address_id = address.id;
                                    }
                                }
                            }
                            allObjects.push(...addressObjects);
                        }
                        
                        return allObjects;
                    }
                    return [];
                } else {
                    // Fallback на старый метод только если есть segmentId
                    return await this.realEstateObjectService.getObjectsBySegment(segmentId, { includeAddress: true });
                }
            }
        } catch (error) {
            console.error('❌ FlippingController: Ошибка получения объектов через ReportsManager:', error);
            // Fallback: если нет segmentId, возвращаем пустой массив вместо ошибки
            if (!segmentId) {
                console.warn('⚠️ FlippingController: segmentId не определён, возвращаем пустой массив');
                return [];
            }
            // Fallback на старый метод только если есть segmentId
            try {
                return await this.realEstateObjectService.getObjectsBySegment(segmentId, { includeAddress: true });
            } catch (fallbackError) {
                console.error('❌ FlippingController: Fallback также не сработал:', fallbackError);
                return [];
            }
        }
    }
    
    /**
     * Применение фильтров с переданной областью и ReportsManager (используется FlippingProfitabilityManager)
     */
    async applyFiltersWithAreaAndReportsManager(currentArea, globalFilters = {}, reportsManager = null) {
        try {
            // Debug отключен
            
            if (!currentArea) {
                throw new Error('Не передана область для анализа');
            }
            
            // Устанавливаем глобальные фильтры в текущие фильтры
            this.currentFilters = { ...this.currentFilters, ...globalFilters };
            
            // Получаем параметры фильтрации
            const globalSegmentId = this.currentFilters.globalSegment?.id;
            const globalSubsegmentId = this.currentFilters.globalSubsegment?.id;
            const dateFrom = this.currentFilters.globalDateFrom || new Date('2023-01-01');
            const dateTo = this.currentFilters.globalDateTo || new Date();
            
            // Debug отключен
            
            // Используем переданный ReportsManager если доступен
            if (reportsManager && typeof reportsManager.getFilteredRealEstateObjects === 'function') {
                this.objects = await reportsManager.getFilteredRealEstateObjects(
                    currentArea.id, globalSegmentId, globalSubsegmentId, dateFrom, dateTo
                );
            } else {
                // Fallback на метод с глобальной переменной
                this.objects = await this.getFilteredObjectsFromReportsManager(
                    currentArea.id, globalSegmentId, globalSubsegmentId, dateFrom, dateTo
                );
            }
            
            if (!Array.isArray(this.objects)) {
                this.objects = [];
            }
            
            if (this.debugEnabled) {
                
            }
            
            if (this.objects.length === 0) {
                // Не выбрасываем ошибку, а показываем пустую таблицу
                console.warn('⚠️ FlippingController: В выбранном сегменте нет объектов недвижимости');
                this.filteredObjects = [];
                await this.updateUIComponents();
                return this.filteredObjects;
            }
            
            // Применяем локальные фильтры флиппинг-отчёта
            this.filteredObjects = this.realEstateObjectService.filterObjects(
                this.objects, 
                this.currentFilters
            );
            
            if (this.filteredObjects.length === 0) {
                console.warn('⚠️ FlippingController: Нет объектов, соответствующих заданным фильтрам');
                // Показываем пустую таблицу вместо ошибки
                await this.updateUIComponents();
                return this.filteredObjects;
            }
            
            // Рассчитываем доходность для каждого объекта
            this.filteredObjects = this.filteredObjects.map(obj => ({
                ...obj,
                profitability: this.realEstateObjectService.calculateProfitability(obj, this.currentFilters)
            }));
            
            if (this.debugEnabled) {
                
            }
            
            // Обновляем UI компоненты
            await this.updateUIComponents();
            
            // Даём время интерфейсу загрузиться, затем обновляем карту
            setTimeout(() => {
                if (this.flippingMap && this.flippingMap.map) {
                    this.flippingMap.map.invalidateSize();
                }
            }, 500);
            
            // Эмитируем событие успешного применения фильтров
            this.emit('filters:applied', { 
                objects: this.filteredObjects,
                filters: this.currentFilters 
            });
            
            return this.filteredObjects;
            
        } catch (error) {
            console.error('❌ FlippingController: Ошибка в applyFiltersWithAreaAndReportsManager:', error);
            // Уведомляем ErrorHandlingService об ошибке
            if (this.errorHandlingService) {
                await this.errorHandlingService.handleError(error, { context: 'applyFiltersWithAreaAndReportsManager' });
            }
            throw error; // Пробрасываем ошибку дальше
        }
    }
    
    /**
     * Применение фильтров с переданной областью (используется FlippingProfitabilityManager)
     */
    async applyFiltersWithArea(currentArea, globalFilters = {}) {
        try {
            // Debug отключен
            
            if (!currentArea) {
                throw new Error('Не передана область для анализа');
            }
            
            // Устанавливаем глобальные фильтры в текущие фильтры
            this.currentFilters = { ...this.currentFilters, ...globalFilters };
            
            // Получаем параметры фильтрации
            const globalSegmentId = this.currentFilters.globalSegment?.id;
            const globalSubsegmentId = this.currentFilters.globalSubsegment?.id;
            const dateFrom = this.currentFilters.globalDateFrom || new Date('2023-01-01');
            const dateTo = this.currentFilters.globalDateTo || new Date();
            
            // Debug отключен
            
            // Загружаем объекты через ReportsManager
            this.objects = await this.getFilteredObjectsFromReportsManager(
                currentArea.id, globalSegmentId, globalSubsegmentId, dateFrom, dateTo
            );
            
            if (!Array.isArray(this.objects)) {
                this.objects = [];
            }
            
            if (this.debugEnabled) {
                
            }
            
            if (this.objects.length === 0) {
                // Не выбрасываем ошибку, а показываем пустую таблицу
                console.warn('⚠️ FlippingController: В выбранном сегменте нет объектов недвижимости');
                this.filteredObjects = [];
                await this.updateUIComponents();
                return this.filteredObjects;
            }
            
            // Применяем локальные фильтры флиппинг-отчёта
            this.filteredObjects = this.realEstateObjectService.filterObjects(
                this.objects, 
                this.currentFilters
            );
            
            if (this.filteredObjects.length === 0) {
                console.warn('⚠️ FlippingController: Нет объектов, соответствующих заданным фильтрам');
                // Показываем пустую таблицу вместо ошибки
                await this.updateUIComponents();
                return this.filteredObjects;
            }
            
            // Рассчитываем доходность для каждого объекта
            this.filteredObjects = this.filteredObjects.map(obj => ({
                ...obj,
                profitability: this.realEstateObjectService.calculateProfitability(obj, this.currentFilters)
            }));
            
            if (this.debugEnabled) {
                
            }
            
            // Обновляем UI компоненты
            await this.updateUIComponents();
            
            // Даём время интерфейсу загрузиться, затем обновляем карту
            setTimeout(() => {
                if (this.flippingMap && this.flippingMap.map) {
                    this.flippingMap.map.invalidateSize();
                }
            }, 500);
            
            // Эмитируем событие успешного применения фильтров
            this.emit('filters:applied', { 
                objects: this.filteredObjects,
                filters: this.currentFilters 
            });
            
            return this.filteredObjects;
            
        } catch (error) {
            console.error('❌ FlippingController: Ошибка в applyFiltersWithArea:', error);
            // Уведомляем ErrorHandlingService об ошибке
            if (this.errorHandlingService) {
                await this.errorHandlingService.handleError(error, { context: 'applyFiltersWithArea' });
            }
            throw error; // Пробрасываем ошибку дальше
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingController;
}