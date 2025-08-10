/**
 * SegmentController - главный контроллер управления сегментами
 * Координирует работу UI компонентов, сервисов данных и бизнес-логики
 * Заменяет монолитный SegmentsManager соблюдением принципа единственной ответственности
 */

class SegmentController {
    constructor(dependencies) {
        // Внедрённые зависимости
        this.segmentService = dependencies.segmentService;
        this.referenceDataService = dependencies.referenceDataService;
        this.validationService = dependencies.validationService;
        this.configService = dependencies.configService;
        this.errorHandler = dependencies.errorHandler;
        this.dataState = dependencies.dataState;
        
        // UI компоненты
        this.segmentModal = dependencies.segmentModal;
        this.segmentTable = dependencies.segmentTable || null; // Может быть null если используется legacy версия
        this.segmentChart = dependencies.segmentChart;
        
        // Map компоненты
        this.mapRenderer = dependencies.mapRenderer;
        this.markerManager = dependencies.markerManager;
        
        // Состояние контроллера
        this.state = {
            initialized: false,
            currentAreaId: null,
            selectedSegmentId: null,
            filteringEnabled: false
        };
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        this.initialize();
    }

    /**
     * Инициализация контроллера
     */
    async initialize() {
        try {
            // Настраиваем связи между компонентами
            this.setupComponentBindings();
            
            // Подписываемся на события данных
            this.setupDataSubscriptions();
            
            // Подписываемся на события UI
            this.setupUIEventHandlers();
            
            // Инициализируем справочные данные для селектов
            await this.loadReferenceDataForUI();
            
            this.state.initialized = true;
            this.emit('controller:initialized');
            
        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'initialize'
            });
        }
    }

    /**
     * Настройка связей между компонентами
     */
    setupComponentBindings() {
        // Связываем модальное окно с сервисом сегментов
        this.segmentModal.addEventListener('segment:save', async (data) => {
            await this.handleSegmentSave(data);
        });
        
        this.segmentModal.addEventListener('segment:delete', async (data) => {
            await this.handleSegmentDelete(data.segmentId);
        });

        // Связываем таблицу с действиями (только если таблица доступна)
        if (this.segmentTable) {
            this.segmentTable.addEventListener('segment:edit', (data) => {
                this.editSegment(data.segmentId);
            });
            
            this.segmentTable.addEventListener('segment:delete', async (data) => {
                await this.handleSegmentDelete(data.segmentId);
            });
            
            this.segmentTable.addEventListener('segment:view', (data) => {
                this.viewSegment(data.segmentId);
            });
            
            this.segmentTable.addEventListener('segment:select', (data) => {
                this.selectSegment(data.segmentId);
            });
        }

        // Связываем события сервисов
        this.segmentService.addEventListener('segment:created', (data) => {
            this.onSegmentCreated(data.segment);
        });
        
        this.segmentService.addEventListener('segment:updated', (data) => {
            this.onSegmentUpdated(data.segment);
        });
        
        this.segmentService.addEventListener('segment:deleted', (data) => {
            this.onSegmentDeleted(data.segmentId);
        });
    }

    /**
     * Настройка подписок на изменения данных
     */
    setupDataSubscriptions() {
        // Подписываемся на изменения текущей области
        this.dataState.subscribe('currentAreaId', async (newAreaId, oldAreaId) => {
            if (newAreaId !== oldAreaId) {
                this.state.currentAreaId = newAreaId;
                await this.loadSegmentsForArea(newAreaId);
            }
        });

        // Подписываемся на изменения адресов для обновления счётчиков
        this.dataState.subscribe('addresses', () => {
            this.updateSegmentStatistics();
        });

        // Подписываемся на изменения объявлений
        this.dataState.subscribe('listings', () => {
            this.updateSegmentStatistics();
        });
    }

    /**
     * Настройка обработчиков UI событий
     */
    setupUIEventHandlers() {
        // Глобальные обработчики событий для кнопок создания сегментов
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="create-segment"]')) {
                e.preventDefault();
                this.showCreateModal();
            }
        });

        // Обработчики фильтрации
        document.addEventListener('change', (e) => {
            if (e.target.matches('[data-filter="segment"]')) {
                this.applySegmentFilter();
            }
        });
    }

    /**
     * Загрузка справочных данных для UI
     */
    async loadReferenceDataForUI() {
        try {
            // Загружаем справочники параллельно
            const [houseSeries, houseClasses, wallMaterials] = await Promise.all([
                this.referenceDataService.getAll('house_series'),
                this.referenceDataService.getAll('house_classes'),
                this.referenceDataService.getAll('wall_materials')
            ]);

            // Обновляем опции в модальном окне
            this.segmentModal.updateSelectOptions('houseSeries', houseSeries);
            this.segmentModal.updateSelectOptions('houseClass', houseClasses);
            this.segmentModal.updateSelectOptions('wallMaterial', wallMaterials);

        } catch (error) {
            console.warn('Ошибка загрузки справочных данных:', error);
        }
    }

    /**
     * Загрузка сегментов для области
     * @param {string} areaId - ID области
     */
    async loadSegmentsForArea(areaId) {
        if (!areaId) {
            if (this.segmentTable) {
                this.segmentTable.updateData([]);
            }
            return;
        }

        try {
            const segments = await this.segmentService.getByAreaId(areaId);
            
            // Обновляем таблицу (если доступна)
            if (this.segmentTable) {
                this.segmentTable.updateData(segments);
            }
            
            // Обновляем состояние данных
            this.dataState.setState('segments', segments);
            
            this.emit('segments:loaded', { areaId, count: segments.length });

        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'loadSegmentsForArea',
                areaId
            });
        }
    }

    /**
     * Показать модальное окно создания сегмента
     */
    showCreateModal() {
        if (!this.state.currentAreaId) {
            alert('Выберите область на карте для создания сегмента');
            return;
        }

        this.segmentModal.showCreateModal(this.state.currentAreaId);
        this.emit('modal:create-shown');
    }

    /**
     * Редактирование сегмента
     * @param {string} segmentId - ID сегмента
     */
    async editSegment(segmentId) {
        try {
            const segment = await this.segmentService.getById(segmentId);
            
            if (!segment) {
                throw new Error('Сегмент не найден');
            }

            this.segmentModal.showEditModal(segment);
            this.emit('modal:edit-shown', { segmentId });

        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'editSegment',
                segmentId
            });
        }
    }

    /**
     * Просмотр сегмента (показ аналитики)
     * @param {string} segmentId - ID сегмента
     */
    async viewSegment(segmentId) {
        try {
            const segment = await this.segmentService.getById(segmentId);
            
            if (!segment) {
                throw new Error('Сегмент не найден');
            }

            // Получаем статистику по сегменту
            const statistics = await this.segmentService.getStatistics(segmentId);
            
            // Показываем аналитические графики
            await this.showSegmentAnalytics(segment, statistics);
            
            this.emit('segment:viewed', { segmentId, segment });

        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'viewSegment',
                segmentId
            });
        }
    }

    /**
     * Выбор сегмента (выделение на карте)
     * @param {string} segmentId - ID сегмента
     */
    async selectSegment(segmentId) {
        try {
            this.state.selectedSegmentId = segmentId;
            
            if (segmentId) {
                // Показываем сегмент на карте
                await this.highlightSegmentOnMap(segmentId);
                
                // Обновляем аналитику
                const segment = await this.segmentService.getById(segmentId);
                if (segment) {
                    await this.updateSegmentCharts(segment);
                }
            } else {
                // Сброс выделения
                await this.clearMapHighlights();
            }
            
            this.emit('segment:selected', { segmentId });

        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'selectSegment',
                segmentId
            });
        }
    }

    /**
     * Обработка сохранения сегмента
     * @param {object} eventData - данные события сохранения
     */
    async handleSegmentSave(eventData) {
        try {
            const { mode, data } = eventData;
            let savedSegment;

            if (mode === 'create') {
                savedSegment = await this.segmentService.create(data);
            } else if (mode === 'edit') {
                savedSegment = await this.segmentService.update(data.id, data);
            }

            // Закрываем модальное окно
            this.segmentModal.hide();

            this.emit('segment:saved', { segment: savedSegment, mode });

        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'handleSegmentSave',
                eventData
            });
            
            // Показываем ошибку в UI
            alert(`Ошибка сохранения сегмента: ${error.message}`);
        }
    }

    /**
     * Обработка удаления сегмента
     * @param {string} segmentId - ID сегмента
     */
    async handleSegmentDelete(segmentId) {
        try {
            await this.segmentService.delete(segmentId);
            
            // Если удалённый сегмент был выбран, сбрасываем выбор
            if (this.state.selectedSegmentId === segmentId) {
                this.state.selectedSegmentId = null;
                await this.clearMapHighlights();
            }

            this.emit('segment:deleted-handled', { segmentId });

        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'handleSegmentDelete',
                segmentId
            });
            
            alert(`Ошибка удаления сегмента: ${error.message}`);
        }
    }

    /**
     * Обработка создания нового сегмента
     * @param {object} segment - созданный сегмент
     */
    onSegmentCreated(segment) {
        // Добавляем в таблицу (если доступна)
        if (this.segmentTable) {
            this.segmentTable.addSegment(segment);
        }
        
        // Обновляем состояние данных
        const currentSegments = this.dataState.getState('segments') || [];
        this.dataState.setState('segments', [segment, ...currentSegments]);
    }

    /**
     * Обработка обновления сегмента
     * @param {object} segment - обновлённый сегмент
     */
    onSegmentUpdated(segment) {
        // Обновляем в таблице (если доступна)
        if (this.segmentTable) {
            this.segmentTable.updateSegment(segment.id, segment);
        }
        
        // Обновляем в состоянии данных
        const currentSegments = this.dataState.getState('segments') || [];
        const updatedSegments = currentSegments.map(s => s.id === segment.id ? segment : s);
        this.dataState.setState('segments', updatedSegments);
    }

    /**
     * Обработка удаления сегмента
     * @param {string} segmentId - ID удалённого сегмента
     */
    onSegmentDeleted(segmentId) {
        // Удаляем из таблицы (если доступна)
        if (this.segmentTable) {
            this.segmentTable.removeSegment(segmentId);
        }
        
        // Обновляем состояние данных
        const currentSegments = this.dataState.getState('segments') || [];
        const filteredSegments = currentSegments.filter(s => s.id !== segmentId);
        this.dataState.setState('segments', filteredSegments);
    }

    /**
     * Показ аналитики сегмента
     * @param {object} segment - сегмент
     * @param {object} statistics - статистика
     */
    async showSegmentAnalytics(segment, statistics) {
        try {
            // Получаем данные для графиков из связанных сервисов
            const addresses = this.dataState.getState('addresses') || [];
            const listings = this.dataState.getState('listings') || [];
            
            // Фильтруем данные по сегменту
            const segmentData = this.filterDataBySegment(addresses, listings, segment);
            
            // Создаём или обновляем графики
            this.segmentChart.createAreaDistributionChart(segmentData.addresses);
            this.segmentChart.createPriceDistributionChart(segmentData.listings);
            this.segmentChart.createBuildYearDistributionChart(segmentData.addresses);

        } catch (error) {
            console.warn('Ошибка отображения аналитики сегмента:', error);
        }
    }

    /**
     * Обновление графиков сегмента
     * @param {object} segment - сегмент
     */
    async updateSegmentCharts(segment) {
        const addresses = this.dataState.getState('addresses') || [];
        const listings = this.dataState.getState('listings') || [];
        
        const segmentData = this.filterDataBySegment(addresses, listings, segment);
        
        // Обновляем существующие графики
        this.segmentChart.updateChart('areaDistributionChart', segmentData.addresses);
        this.segmentChart.updateChart('priceDistributionChart', segmentData.listings);
    }

    /**
     * Фильтрация данных по сегменту
     * @param {Array} addresses - адреса
     * @param {Array} listings - объявления
     * @param {object} segment - сегмент
     * @returns {object} отфильтрованные данные
     */
    filterDataBySegment(addresses, listings, segment) {
        const filters = segment.filters || {};
        
        // Фильтруем адреса по критериям сегмента
        const filteredAddresses = addresses.filter(address => {
            // Проверяем принадлежность к области
            if (address.map_area_id !== segment.map_area_id) {
                return false;
            }
            
            // Проверяем серию дома
            if (filters.house_series_id && filters.house_series_id.length > 0) {
                if (!filters.house_series_id.includes(address.house_series_id)) {
                    return false;
                }
            }
            
            // Проверяем класс дома
            if (filters.house_class_id && filters.house_class_id.length > 0) {
                if (!filters.house_class_id.includes(address.house_class_id)) {
                    return false;
                }
            }
            
            // Проверяем материал стен
            if (filters.wall_material_id && filters.wall_material_id.length > 0) {
                if (!filters.wall_material_id.includes(address.wall_material_id)) {
                    return false;
                }
            }
            
            // Проверяем диапазон этажей
            if (filters.floors_from !== undefined && address.floors_count < filters.floors_from) {
                return false;
            }
            if (filters.floors_to !== undefined && address.floors_count > filters.floors_to) {
                return false;
            }
            
            // Проверяем диапазон года постройки
            if (filters.build_year_from !== undefined && address.build_year < filters.build_year_from) {
                return false;
            }
            if (filters.build_year_to !== undefined && address.build_year > filters.build_year_to) {
                return false;
            }
            
            return true;
        });
        
        // Получаем ID отфильтрованных адресов
        const addressIds = new Set(filteredAddresses.map(addr => addr.id));
        
        // Фильтруем объявления по адресам
        const filteredListings = listings.filter(listing => 
            addressIds.has(listing.address_id)
        );
        
        return {
            addresses: filteredAddresses,
            listings: filteredListings
        };
    }

    /**
     * Подсветка сегмента на карте
     * @param {string} segmentId - ID сегмента
     */
    async highlightSegmentOnMap(segmentId) {
        try {
            const segment = await this.segmentService.getById(segmentId);
            if (!segment) return;

            // Получаем адреса сегмента
            const addresses = this.dataState.getState('addresses') || [];
            const segmentData = this.filterDataBySegment(addresses, [], segment);
            
            // Очищаем предыдущие маркеры
            this.markerManager.hideGroup('segment-highlight');
            
            // Создаём маркеры для адресов сегмента
            this.markerManager.createMarkersFromData(
                segmentData.addresses,
                (address) => ({
                    id: `highlight_${address.id}`,
                    position: address.coordinates,
                    iconType: 'selected',
                    group: 'segment-highlight',
                    popup: {
                        content: `<strong>${address.address}</strong><br>Сегмент: ${segment.name}`
                    }
                })
            );
            
            // Показываем маркеры
            this.markerManager.showGroup('segment-highlight', 'segment-highlights');
            
            // Подгоняем карту под маркеры
            this.markerManager.fitBounds({ padding: [20, 20] });

        } catch (error) {
            console.warn('Ошибка подсветки сегмента на карте:', error);
        }
    }

    /**
     * Очистка подсветки на карте
     */
    async clearMapHighlights() {
        this.markerManager.hideGroup('segment-highlight');
        this.mapRenderer.removeLayer('segment-highlights');
    }

    /**
     * Обновление статистики сегментов
     */
    async updateSegmentStatistics() {
        // Заглушка для обновления статистики
        // В реальной реализации здесь будет пересчёт количества объектов в каждом сегменте
        const segments = this.dataState.getState('segments') || [];
        
        // Можно добавить пересчёт статистики и обновление таблицы
        this.emit('statistics:updated');
    }

    /**
     * Применение фильтрации сегментов
     */
    applySegmentFilter() {
        // Получаем критерии фильтрации из UI
        const filterForm = document.getElementById('segmentFilterForm');
        if (!filterForm) return;

        const formData = new FormData(filterForm);
        const criteria = {};
        
        // Собираем критерии фильтрации
        for (const [key, value] of formData.entries()) {
            if (value && value !== '') {
                criteria[key] = value;
            }
        }
        
        // Применяем фильтр к таблице (если доступна)
        if (this.segmentTable) {
            if (Object.keys(criteria).length > 0) {
                this.segmentTable.applyFilter((segment) => {
                    return this.matchesFilterCriteria(segment, criteria);
                });
            } else {
                this.segmentTable.clearFilter();
            }
        }
    }

    /**
     * Проверка соответствия сегмента критериям фильтрации
     * @param {object} segment - сегмент
     * @param {object} criteria - критерии фильтрации
     * @returns {boolean}
     */
    matchesFilterCriteria(segment, criteria) {
        // Поиск по имени
        if (criteria.name) {
            const nameMatch = segment.name.toLowerCase().includes(criteria.name.toLowerCase());
            if (!nameMatch) return false;
        }
        
        // Фильтр по наличию определённых типов фильтров
        if (criteria.hasFilters) {
            const requiredFilters = criteria.hasFilters.split(',');
            const hasRequired = requiredFilters.some(filterType => {
                const filterValue = segment.filters[filterType];
                return filterValue !== undefined && filterValue !== null &&
                       (Array.isArray(filterValue) ? filterValue.length > 0 : true);
            });
            if (!hasRequired) return false;
        }
        
        return true;
    }

    /**
     * Экспорт сегментов в различных форматах
     * @param {string} format - формат экспорта
     */
    async exportSegments(format = 'json') {
        try {
            const segments = this.dataState.getState('segments') || [];
            const segmentIds = segments.map(s => s.id);
            
            const exportData = await this.segmentService.export(segmentIds, format);
            
            // Создаём ссылку для скачивания
            const blob = new Blob([exportData], { 
                type: format === 'json' ? 'application/json' : 'text/csv' 
            });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `segments_${new Date().toISOString().split('T')[0]}.${format}`;
            link.click();
            
            URL.revokeObjectURL(url);
            
            this.emit('segments:exported', { format, count: segments.length });

        } catch (error) {
            await this.errorHandler.handleError(error, {
                controller: 'SegmentController',
                method: 'exportSegments',
                format
            });
        }
    }

    /**
     * Получение состояния контроллера
     * @returns {object}
     */
    getState() {
        return {
            ...this.state,
            componentsInitialized: {
                modal: !!this.segmentModal,
                table: !!this.segmentTable, // Может быть false если используется legacy версия
                chart: !!this.segmentChart,
                map: this.mapRenderer?.isInitialized(),
                markers: !!this.markerManager
            }
        };
    }

    // === СИСТЕМА СОБЫТИЙ ===

    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(eventType, data = {}) {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Уничтожение контроллера
     */
    destroy() {
        // Очищаем обработчики событий
        this.eventHandlers.clear();
        
        // Отписываемся от изменений состояния
        if (this.dataState) {
            // Здесь нужно отписаться от всех подписок
            // В реальной реализации DataState должен поддерживать отписку
        }
        
        // Уничтожаем компоненты если они принадлежат контроллеру
        if (this.segmentModal && typeof this.segmentModal.destroy === 'function') {
            this.segmentModal.destroy();
        }
        
        if (this.segmentTable && typeof this.segmentTable.destroy === 'function') {
            this.segmentTable.destroy();
        }
        
        if (this.segmentChart && typeof this.segmentChart.destroy === 'function') {
            this.segmentChart.destroy();
        }
        
        // Очищаем ссылки
        this.segmentService = null;
        this.referenceDataService = null;
        this.validationService = null;
        this.configService = null;
        this.errorHandler = null;
        this.dataState = null;
        this.segmentModal = null;
        this.segmentTable = null;
        this.segmentChart = null;
        this.mapRenderer = null;
        this.markerManager = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentController;
} else {
    window.SegmentController = SegmentController;
}