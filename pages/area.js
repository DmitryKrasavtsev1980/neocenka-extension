/**
 * Минимальная логика страницы управления областью
 * Координирующий слой для новой архитектуры с менеджерами
 */

class AreaPage {
    constructor() {
        this.currentAreaId = null;
        this.currentArea = null;
        
        // Состояние обработки данных
        this.processing = {
            parsing: false,
            updating: false,
            addresses: false,
            duplicates: false
        };
        
        // Менеджеры (будут инициализированы в init())
        this.dataState = null;
        this.eventBus = null;
        this.progressManager = null;
        this.uiManager = null;
        this.mapManager = null;
        this.parsingManager = null;
        this.addressManager = null;
        this.duplicatesManager = null;
        this.segmentsManager = null;
        this.reportsManager = null;
        this.geoJsonImportManager = null;
        
        // Утилиты
        this.geoUtils = new GeoUtils();
        this.spatialManager = spatialIndexManager;
        this.osmAPI = new OSMOverpassAPI();
        
        // Состояние выбранных элементов в таблице дублей
        this.selectedDuplicates = new Set();
        
        // Интеграция с сервисами
        this.servicesIntegration = null;
    }
    
    /**
     * Проверка настроек отладки
     */
    async isDebugEnabled() {
        try {
            // Проверка инициализации базы данных
            if (!window.db || !window.db.db) {
                return false;
            }
            
            const settings = await window.db.getSettings();
            return settings.find(s => s.key === 'debug_enabled')?.value === true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Отладочное сообщение с проверкой настроек
     */
    async debugLog(message, ...args) {
        if (await this.isDebugEnabled()) {
        }
    }
    
    /**
     * Проверка существования полигона в области
     */
    hasAreaPolygon() {
        return this.currentArea && 
               this.currentArea.polygon && 
               Array.isArray(this.currentArea.polygon) && 
               this.currentArea.polygon.length >= 3;
    }
    
    /**
     * Получение ID области из URL
     */
    getAreaIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }
    
    /**
     * Инициализация UI компонентов
     */
    async initUIComponents() {
        try {
            // UI компоненты инициализируются в HTML
            // Здесь может быть дополнительная логика при необходимости
        } catch (error) {
            console.error('Ошибка инициализации UI компонентов:', error);
        }
    }
    
    /**
     * Инициализация страницы
     */
    async init() {
        try {
            
            // Инициализация UI компонентов
            await this.initUIComponents();
            
            // Получение ID области из URL
            this.currentAreaId = this.getAreaIdFromUrl();
            if (!this.currentAreaId) {
                console.error('❌ ID области не найден в URL');
                return;
            }
            
            // Инициализация архитектуры
            await this.initArchitecture();
            
            // Загрузка данных области
            await this.loadAreaData();
            
            // Привязка событий (после инициализации менеджеров и загрузки данных)
            this.bindEvents();
            
            
        } catch (error) {
            console.error('❌ Ошибка инициализации страницы:', error);
        }
    }
    
    /**
     * Инициализация новой архитектуры
     */
    async initArchitecture() {
        try {
            // Инициализация ядра
            this.dataState = new DataState();
            this.eventBus = new EventBus();
            this.progressManager = new ProgressManager(this.eventBus);
            
            // Инициализация менеджеров
            this.uiManager = new UIManager(this.dataState, this.eventBus, this.progressManager);
            this.mapManager = new MapManager(this.dataState, this.eventBus, this.progressManager);
            this.parsingManager = new ParsingManager(this.dataState, this.eventBus, this.progressManager);
            this.addressManager = new AddressManager(this.dataState, this.eventBus, this.progressManager);
            this.duplicatesManager = new DuplicatesManager(this.dataState, this.eventBus, this.progressManager, this.uiManager);
            this.segmentsManager = new SegmentsManager(this.dataState, this.eventBus, this.progressManager);
            this.reportsManager = new ReportsManager(this);
            this.comparativeAnalysisManager = new ComparativeAnalysisManager(this);
            this.geoJsonImportManager = new GeoJsonImportManager(window.db, this.progressManager);
            
            // Инициализация RealEstateObjectManager для совместимости со старой архитектурой
            if (typeof RealEstateObjectManager !== 'undefined') {
                window.realEstateObjectManager = new RealEstateObjectManager();
            }
            
            // Инициализация сервисов через ServiceConfig
            this.serviceManager = await ServiceConfig.initializeServices();
            
            // Инициализация интеграции сервисов
            if (typeof initializeAreaServicesIntegration === 'function') {
                this.servicesIntegration = await initializeAreaServicesIntegration(this);
            } else {
                console.error('❌ initializeAreaServicesIntegration функция не найдена');
            }
            
            // Инициализация панели Inpars для импорта объявлений
            this.initInparsPanel();
            
            // Инициализация умного алгоритма определения адресов
            await this.initSmartAddressMatcher();
            
            
        } catch (error) {
            console.error('❌ Ошибка инициализации архитектуры:', error);
        }
    }
    
    /**
     * Загрузка данных области
     */
    async loadAreaData() {
        try {
            
            // Проверка инициализации базы данных
            if (!window.db) {
                console.error('❌ База данных не инициализирована');
                this.showMainContent(); // Показываем контент даже при ошибке
                return;
            }
            
            // Ждем инициализации базы данных если необходимо
            if (!window.db.db) {
                await window.db.init();
            }
            
            // Загрузка области из базы данных
            this.currentArea = await window.db.getMapArea(this.currentAreaId);
            if (!this.currentArea) {
                console.error('❌ Область не найдена:', this.currentAreaId);
                this.showMainContent(); // Показываем контент даже при ошибке
                return;
            }
            
            // Установка данных в DataState напрямую
            this.dataState.currentAreaId = this.currentAreaId;
            this.dataState.currentArea = this.currentArea;
            
            // Уведомление о загрузке области
            this.eventBus.emit(CONSTANTS.EVENTS.AREA_LOADED, this.currentArea);
            
            // Показываем основной контент
            this.showMainContent();
            
            // Инициализация ReportsManager
            if (this.reportsManager) {
                await this.reportsManager.initialize();
            }
            
            // Инициализация ComparativeAnalysisManager
            if (this.comparativeAnalysisManager) {
                await this.comparativeAnalysisManager.initialize();
            }
            
            // UI элементы будут инициализированы через подписку на событие AREA_LOADED
            
            
        } catch (error) {
            console.error('❌ Ошибка загрузки данных области:', error);
            this.showMainContent(); // Показываем контент даже при ошибке
        }
    }
    
    /**
     * Показать сообщение об ошибке
     */
    showError(message) {
        if (this.uiManager) {
            this.uiManager.showNotification({
                type: 'error',
                message: message,
                duration: 5000
            });
        } else {
            console.error('❌', message);
        }
    }
    
    /**
     * Показать сообщение об успехе
     */
    showSuccess(message) {
        if (this.uiManager) {
            this.uiManager.showNotification({
                type: 'success',
                message: message,
                duration: 5000
            });
        } else {
        }
    }
    
    /**
     * Показать информационное сообщение
     */
    showInfo(message) {
        if (this.uiManager) {
            this.uiManager.showNotification({
                type: 'info',
                message: message,
                duration: 5000
            });
        } else {
            console.info('ℹ️', message);
        }
    }
    
    /**
     * Обработчик событий модальных окон
     */
    handleModalEvent(data) {
        try {
            
            switch (data.modalType) {
                case CONSTANTS.MODAL_TYPES.LISTING_DETAIL:
                    this.showListingDetailModal(data.listing);
                    break;
                default:
            }
        } catch (error) {
            console.error('❌ Ошибка обработки модального события:', error);
        }
    }
    
    /**
     * Показать модальное окно деталей объявления
     */
    showListingDetailModal(listing) {
        try {
            
            // Используем UIManager для показа модального окна
            if (this.uiManager) {
                this.uiManager.openModal('listingModal', {
                    listing: listing,
                    title: `Детали объявления: ${listing.title || 'Без названия'}`
                });
            } else {
                console.error('❌ UIManager не инициализирован');
            }
        } catch (error) {
            console.error('❌ Ошибка показа модального окна деталей:', error);
        }
    }
    
    /**
     * Показать основной контент страницы
     */
    showMainContent() {
        try {
            const contentElement = document.getElementById('area-content');
            if (contentElement) {
                contentElement.classList.remove('hidden');
            } else {
                console.error('❌ Элемент area-content не найден');
            }
        } catch (error) {
            console.error('❌ Ошибка отображения контента:', error);
        }
    }
    
    /**
     * Привязка событий к элементам интерфейса
     */
    bindEvents() {
        try {
            // Подписка на событие инициализации карты
            if (this.eventBus) {
                this.eventBus.on(CONSTANTS.EVENTS.MAP_INITIALIZED, () => {
                });
                
                // Обработчик модальных окон
                this.eventBus.on(CONSTANTS.EVENTS.MODAL_OPENED, (data) => {
                    this.handleModalEvent(data);
                });
            }
            
            // Обработчик кнопки "Редактировать область"
            const editAreaBtn = document.getElementById('editAreaBtn');
            if (editAreaBtn) {
                editAreaBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openEditAreaModal();
                });
            } else {
                console.error('❌ Кнопка editAreaBtn не найдена в DOM');
            }
            
            // Обработчик кнопки панелей
            const panelBtn = document.getElementById('panelBtn');
            const panelDropdown = document.getElementById('panelDropdown');
            if (panelBtn && panelDropdown) {
                panelBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    panelDropdown.classList.toggle('hidden');
                });
                
                // Закрытие при клике вне панели
                document.addEventListener('click', (e) => {
                    if (!panelBtn.contains(e.target) && !panelDropdown.contains(e.target)) {
                        panelDropdown.classList.add('hidden');
                    }
                });
            }
            
            // Инициализация переключателей панелей через UIManager
            if (this.uiManager) {
                this.uiManager.initPanelToggles();
            }
            
            // Обработчики кнопок карты через MapManager
            this.bindMapButtons();
            
            // Закрытие модальных окон при клике на overlay
            this.bindModalEvents();
            
            
        } catch (error) {
            console.error('❌ Ошибка привязки событий:', error);
        }
    }
    
    /**
     * Привязка обработчиков кнопок карты
     */
    bindMapButtons() {
        // Кнопка обновления карты обрабатывается в MapManager.js
        // Убрана дублирующая привязка для предотвращения двойных уведомлений
        
    }
    
    /**
     * Привязка событий модальных окон
     */
    bindModalEvents() {
        // Модальное окно редактирования области
        const editAreaModal = document.getElementById('editAreaModal');
        if (editAreaModal) {
            // Закрытие при клике на overlay
            editAreaModal.addEventListener('click', (e) => {
                if (e.target === editAreaModal) {
                    this.closeEditAreaModal();
                }
            });
            
            // Обработчик формы редактирования
            const editAreaForm = document.getElementById('editAreaForm');
            if (editAreaForm) {
                editAreaForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleEditAreaSubmit();
                });
            }
            
            // Обработчик кнопки "Отмена"
            const cancelEditArea = document.getElementById('cancelEditArea');
            if (cancelEditArea) {
                cancelEditArea.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.closeEditAreaModal();
                });
            }
            
            // Обработчики полей URL для активации кнопок
            const editAvitoUrl = document.getElementById('editAvitoUrl');
            const editCianUrl = document.getElementById('editCianUrl');
            
            if (editAvitoUrl) {
                editAvitoUrl.addEventListener('input', () => {
                    this.updateFilterButtons();
                });
            }
            
            if (editCianUrl) {
                editCianUrl.addEventListener('input', () => {
                    this.updateFilterButtons();
                });
            }
            
            // Обработчики кнопок открытия фильтров
            const openAvitoBtn = document.getElementById('openAvitoBtn');
            const openCianBtn = document.getElementById('openCianBtn');
            
            if (openAvitoBtn) {
                openAvitoBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openAvitoFilter();
                });
            }
            
            if (openCianBtn) {
                openCianBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openCianFilter();
                });
            }
        }
    }
    
    /**
     * Открытие модального окна редактирования области
     */
    openEditAreaModal() {
        try {
            
            if (!this.currentArea) {
                console.error('❌ Нет данных области для редактирования');
                return;
            }
            
            // Заполнение формы текущими данными
            const editAreaName = document.getElementById('editAreaName');
            const editAvitoUrl = document.getElementById('editAvitoUrl');
            const editCianUrl = document.getElementById('editCianUrl');
            
            
            if (editAreaName) editAreaName.value = this.currentArea.name || '';
            if (editAvitoUrl) editAvitoUrl.value = this.currentArea.avito_filter_url || '';
            if (editCianUrl) editCianUrl.value = this.currentArea.cian_filter_url || '';
            
            // Обновление состояния кнопок после заполнения полей
            this.updateFilterButtons();
            
            // Открытие модального окна
            if (this.uiManager) {
                this.uiManager.openModal('editAreaModal');
            } else {
                // Fallback если UIManager не инициализирован
                const modal = document.getElementById('editAreaModal');
                if (modal) {
                    modal.classList.remove('hidden');
                } else {
                    console.error('❌ Модальное окно editAreaModal не найдено');
                }
            }
            
        } catch (error) {
            console.error('❌ Ошибка открытия модального окна редактирования:', error);
        }
    }
    
    /**
     * Закрытие модального окна редактирования области
     */
    closeEditAreaModal() {
        try {
            if (this.uiManager) {
                this.uiManager.closeModal('editAreaModal');
            } else {
                // Fallback если UIManager не инициализирован
                const modal = document.getElementById('editAreaModal');
                if (modal) {
                    modal.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('❌ Ошибка закрытия модального окна редактирования:', error);
        }
    }
    
    /**
     * Обработка отправки формы редактирования области
     */
    async handleEditAreaSubmit() {
        try {
            const editAreaName = document.getElementById('editAreaName');
            const editAvitoUrl = document.getElementById('editAvitoUrl');
            const editCianUrl = document.getElementById('editCianUrl');
            
            if (!editAreaName || !editAreaName.value.trim()) {
                console.error('❌ Название области обязательно');
                return;
            }
            
            const updatedData = {
                ...this.currentArea, // Сохраняем все существующие данные включая полигон
                id: this.currentAreaId,
                name: editAreaName.value.trim(),
                avito_filter_url: editAvitoUrl?.value?.trim() || null,
                cian_filter_url: editCianUrl?.value?.trim() || null,
                updated_at: new Date()
            };
            
            
            // Обновление области в базе данных
            await window.db.updateMapArea(updatedData);
            
            // Обновление текущих данных
            this.currentArea = { ...this.currentArea, ...updatedData };
            this.dataState.currentArea = this.currentArea;
            
            // Уведомление об обновлении
            this.eventBus.emit(CONSTANTS.EVENTS.AREA_UPDATED, this.currentArea);
            
            // Обновление UI
            this.updateAreaInfo();
            
            // Закрытие модального окна
            this.closeEditAreaModal();
            
            
            // Показать уведомление об успешном сохранении
            if (this.uiManager && this.uiManager.showNotification) {
                this.uiManager.showNotification({
                    message: 'Область успешно обновлена',
                    type: 'success'
                });
            }
            
        } catch (error) {
            console.error('❌ Ошибка обновления области:', error);
            
            // Показать уведомление об ошибке
            if (this.uiManager && this.uiManager.showNotification) {
                this.uiManager.showNotification({
                    message: 'Ошибка при сохранении области',
                    type: 'error'
                });
            }
        }
    }
    
    /**
     * Обновление информации об области в UI
     */
    updateAreaInfo() {
        try {
            // Обновление заголовка страницы
            const areaTitle = document.querySelector('.area-title, h1');
            if (areaTitle && this.currentArea) {
                areaTitle.textContent = this.currentArea.name;
            }
            
            // Обновление заголовка документа
            if (this.currentArea) {
                document.title = `${this.currentArea.name} - Неоценка`;
            }
            
        } catch (error) {
            console.error('❌ Ошибка обновления информации об области:', error);
        }
    }
    
    /**
     * Обновление состояния кнопок фильтров
     */
    updateFilterButtons() {
        const avitoUrl = document.getElementById('editAvitoUrl')?.value?.trim();
        const cianUrl = document.getElementById('editCianUrl')?.value?.trim();
        
        const avitoBtn = document.getElementById('openAvitoBtn');
        const cianBtn = document.getElementById('openCianBtn');
        
        if (avitoBtn) {
            avitoBtn.disabled = !avitoUrl || !this.isValidUrl(avitoUrl);
        }
        
        if (cianBtn) {
            cianBtn.disabled = !cianUrl || !this.isValidUrl(cianUrl);
        }
    }
    
    /**
     * Проверка корректности URL
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
    
    /**
     * Открытие фильтра Avito в новой вкладке
     */
    openAvitoFilter() {
        const avitoUrl = document.getElementById('editAvitoUrl')?.value?.trim();
        if (avitoUrl && this.isValidUrl(avitoUrl)) {
            chrome.tabs.create({ url: avitoUrl });
        }
    }
    
    /**
     * Открытие фильтра Cian в новой вкладке
     */
    openCianFilter() {
        const cianUrl = document.getElementById('editCianUrl')?.value?.trim();
        if (cianUrl && this.isValidUrl(cianUrl)) {
            chrome.tabs.create({ url: cianUrl });
        }
    }
    
    /**
     * Инициализация умного алгоритма определения адресов
     */
    async initSmartAddressMatcher() {
        try {
            // Инициализируем ML-алгоритм определения адресов
            if (typeof SmartAddressMatcher !== 'undefined' && !window.smartAddressMatcher) {
                
                // Инициализируем пространственный индекс если еще не создан
                if (!window.spatialIndexManager) {
                    window.spatialIndexManager = new SpatialIndexManager();
                }
                
                window.smartAddressMatcher = new SmartAddressMatcher(this.spatialManager || window.spatialIndexManager);
            } else if (!window.SmartAddressMatcher && typeof SmartAddressMatcher === 'undefined') {
                console.warn('⚠️ SmartAddressMatcher класс не найден');
            } else {
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации SmartAddressMatcher:', error);
        }
    }

    /**
     * Инициализация панели Inpars для импорта объявлений
     */
    initInparsPanel() {
        try {
            
            const container = document.getElementById('inparsPanelContainer');
            
            if (!container) {
                console.error('❌ initInparsPanel: Контейнер inparsPanelContainer не найден');
                return;
            }
            
            
            // Создаем панель Inpars
            this.inparsPanel = new InparsPanel(container, this.serviceManager);
            
            // Настраиваем провайдер полигона
            this.inparsPanel.setPolygonProvider(() => {
                const currentArea = this.dataState.getState('currentArea');
                return currentArea?.polygon || [];
            });
            
            // Обработка импорта осуществляется через area_services_integration.js
            // который правильно сохраняет данные в БД и показывает уведомления
            
            
        } catch (error) {
            console.error('❌ Ошибка инициализации панели Inpars:', error);
        }
    }
}

// Глобальная переменная для доступа к экземпляру
let areaPage;

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Ожидание инициализации базы данных
        if (window.db && !window.db.db) {
            await window.db.init();
        }
        
        areaPage = new AreaPage();
        await areaPage.init();
    } catch (error) {
        console.error('❌ Ошибка инициализации страницы:', error);
    }
});

// Экспорт для использования в других скриптах
if (typeof window !== 'undefined') {
    window.areaPage = areaPage;
}