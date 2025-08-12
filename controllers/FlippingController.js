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

            if (this.debugEnabled) {
                console.log('🏠 FlippingController: Контроллер инициализирован');
            }

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

            if (this.debugEnabled) {
                console.log('🏠 FlippingController: UI компоненты инициализированы');
            }

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
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingController: Установлен сегмент:', segment?.name);
        }

        // Эмитируем событие изменения сегмента
        this.emit('segment:changed', { segment });
    }

    /**
     * Обработка изменения фильтров
     */
    handleFilterChange(filters) {
        this.currentFilters = { ...this.currentFilters, ...filters };
        
        if (this.debugEnabled) {
            console.log('🏠 FlippingController: Фильтры изменены:', this.currentFilters);
        }

        // Эмитируем событие изменения фильтров
        this.emit('filters:changed', { filters: this.currentFilters });
    }

    /**
     * Применение фильтров и обновление данных
     */
    async applyFilters() {
        console.log('🔍 FlippingController.applyFilters(): НАЧАЛО метода');
        console.log('🔍 FlippingController.applyFilters(): errorHandlingService существует:', !!this.errorHandlingService);
        
        try {
            console.log('🔍 FlippingController: Применение фильтров началось');
            console.log('🔍 FlippingController: currentSegment:', this.currentSegment?.name, 'ID:', this.currentSegment?.id);
            console.log('🔍 FlippingController: currentFilters:', this.currentFilters);

            if (!this.currentSegment) {
                throw new Error('Не выбран сегмент для анализа');
            }

            console.log('🔍 FlippingController: Загружаем объекты для сегмента:', this.currentSegment.id);

            // Загружаем объекты из базы данных
            this.objects = await this.realEstateObjectService.getObjectsBySegment(
                this.currentSegment.id,
                { includeAddress: true }
            );

            console.log('🔍 FlippingController: Получено объектов от RealEstateObjectService:', this.objects?.length || 0);
            console.log('🔍 FlippingController: Тип данных objects:', typeof this.objects, 'isArray:', Array.isArray(this.objects));

            if (!Array.isArray(this.objects)) {
                console.log('🔍 FlippingController: objects не массив, устанавливаем пустой массив');
                this.objects = [];
            }

            if (this.objects.length === 0) {
                console.log('🔍 FlippingController: Нет объектов в сегменте, проверим window.db.getObjectsBySegment напрямую');
                
                // Проверим что возвращает window.db напрямую
                try {
                    const directObjects = await window.db.getObjectsBySegment(this.currentSegment.id);
                    console.log('🔍 FlippingController: window.db.getObjectsBySegment вернул:', directObjects?.length || 0, 'объектов');
                    console.log('🔍 FlippingController: Первые 3 объекта:', directObjects?.slice(0, 3));
                } catch (error) {
                    console.error('🔍 FlippingController: Ошибка вызова window.db.getObjectsBySegment:', error);
                }
                
                throw new Error('В выбранном сегменте нет объектов недвижимости');
            }

            console.log('🔍 FlippingController: Применяем фильтры к', this.objects.length, 'объектам');

            // Применяем фильтры
            this.filteredObjects = this.realEstateObjectService.filterObjects(
                this.objects, 
                this.currentFilters
            );

            console.log('🔍 FlippingController: Отфильтровано объектов:', this.filteredObjects.length);

            if (this.filteredObjects.length === 0) {
                throw new Error('Нет объектов, соответствующих заданным фильтрам');
            }

            // Рассчитываем доходность для каждого объекта
            this.filteredObjects = this.filteredObjects.map(obj => ({
                ...obj,
                profitability: this.realEstateObjectService.calculateProfitability(obj, this.currentFilters)
            }));

            console.log('🔍 FlippingController: Обновляем UI компоненты');

            // Обновляем UI компоненты
            await this.updateUIComponents();

            // Даём время интерфейсу загрузиться, затем обновляем карту
            setTimeout(() => {
                if (this.flippingMap && this.flippingMap.map) {
                    this.flippingMap.map.invalidateSize();
                    if (this.debugEnabled) {
                        console.log('🔍 FlippingController: Карта обновлена после загрузки интерфейса');
                    }
                }
            }, 500);

            // Эмитируем событие успешного применения фильтров
            this.emit('filters:applied', { 
                objects: this.filteredObjects,
                filters: this.currentFilters 
            });

            console.log('🔍 FlippingController: applyFilters завершён успешно, объектов:', this.filteredObjects.length);
            return this.filteredObjects;

        } catch (error) {
            console.error('🔍 FlippingController: ОШИБКА в applyFilters:', error);
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
            console.log('🔍 FlippingController: updateUIComponents() начат');
            console.log('🔍 FlippingController: flippingTable существует:', !!this.flippingTable);
            console.log('🔍 FlippingController: flippingMap существует:', !!this.flippingMap);
            console.log('🔍 FlippingController: filteredObjects для UI:', this.filteredObjects?.length || 0);

            // Обновляем таблицу
            if (this.flippingTable) {
                console.log('🔍 FlippingController: Обновляем таблицу...');
                await this.flippingTable.updateData(this.filteredObjects, this.currentFilters);
                console.log('🔍 FlippingController: Таблица обновлена');
            } else {
                console.log('🔍 FlippingController: Таблица не инициализирована');
            }

            // Обновляем карту
            if (this.flippingMap) {
                console.log('🔍 FlippingController: Обновляем карту...');
                await this.flippingMap.updateObjects(this.filteredObjects, this.currentFilters);
                console.log('🔍 FlippingController: Карта обновлена');
            } else {
                console.log('🔍 FlippingController: Карта не инициализирована');
            }

            console.log('🔍 FlippingController: UI компоненты обновлены успешно');

        } catch (error) {
            console.error('❌ FlippingController: Ошибка обновления UI:', error);
            throw error;
        }
    }

    /**
     * Обработка выбора объекта
     */
    handleObjectSelection(object) {
        if (this.debugEnabled) {
            console.log('🏠 FlippingController: Выбран объект:', object.id);
        }

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

        if (this.debugEnabled) {
            console.log(`🏠 FlippingController: Событие "${eventName}"`, data);
        }
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

        if (this.debugEnabled) {
            console.log('🏠 FlippingController: Контроллер уничтожен');
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingController;
}