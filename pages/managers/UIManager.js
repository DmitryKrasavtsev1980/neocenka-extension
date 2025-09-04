/**
 * Менеджер интерфейса
 * Управляет UI элементами, панелями, модальными окнами и общим состоянием интерфейса
 */

class UIManager {
    constructor(dataState, eventBus, progressManager) {
        this.dataState = dataState;
        this.eventBus = eventBus;
        this.progressManager = progressManager;
        
        // Cache для адресов (необходимо для helper методов)
        this.addresses = [];
        
        // Состояние UI
        this.uiState = {
            panels: {
                statistics: { visible: true, expanded: false },
                dataWork: { visible: true, expanded: false },
                map: { visible: true, expanded: true },
                addresses: { visible: true, expanded: false },
                segments: { visible: true, expanded: false },
                reports: { visible: true, expanded: false },
                duplicates: { visible: true, expanded: false }
            },
            modals: {
                addressModal: false,
                segmentModal: false,
                settingsModal: false
            },
            loading: {
                global: false,
                addresses: false,
                segments: false,
                duplicates: false,
                parsing: false
            },
            notifications: []
        };
        
        // Экземпляры графиков для статистики
        this.sourcesChartInstance = null;
        this.addressConfidenceChartInstance = null;
        this.addressMethodsChartInstance = null;
        this.duplicatesStatusChartInstance = null;
        
        // Конфигурация панелей
        this.panelConfig = {
            statistics: {
                container: 'statisticsPanelContainer',
                content: 'statisticsPanelContent',
                header: 'statisticsPanelHeader',
                chevron: 'statisticsPanelChevron',
                checkbox: 'statisticsPanel'
            },
            dataWork: {
                container: 'dataWorkPanelContainer',
                content: 'dataWorkPanelContent',
                header: 'dataWorkPanelHeader',
                chevron: 'dataWorkPanelChevron',
                checkbox: 'dataWorkPanel'
            },
            map: {
                container: 'mapPanelContainer',
                content: 'mapPanelContent',
                header: 'mapPanelHeader',
                chevron: 'mapPanelChevron',
                checkbox: 'mapPanel'
            },
            addresses: {
                container: 'addressTableContainer',
                content: 'addressTableContent',
                header: 'addressTableHeader',
                chevron: 'addressTableChevron',
                checkbox: 'addressesPanel'
            },
            segments: {
                container: 'segmentsPanelContainer',
                content: 'segmentsPanelContent',
                header: 'segmentsPanelHeader',
                chevron: 'segmentsPanelChevron',
                checkbox: 'segmentsPanel'
            },
            reports: {
                container: 'reportsPanelContainer',
                content: 'reportsPanelContent',
                header: 'reportsPanelHeader',
                chevron: 'reportsPanelChevron',
                checkbox: 'reportsPanel'
            },
            duplicates: {
                container: 'duplicatesPanelContainer',
                content: 'duplicatesPanelContent',
                header: 'duplicatesPanelHeader',
                chevron: 'duplicatesPanelChevron',
                checkbox: 'duplicatesPanel'
            }
        };
        
        // Привязываем события
        this.bindEvents();
    }
    
    /**
     * Проверка настроек отладки
     */
    async isDebugEnabled() {
        try {
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
     * Привязка событий
     */
    bindEvents() {
        if (this.eventBus) {
            this.eventBus.on(CONSTANTS.EVENTS.AREA_LOADED, async (area) => {
                this.onAreaLoaded(area);
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.LOADING_STARTED, (data) => {
                this.setLoading(data.type, true);
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.LOADING_FINISHED, (data) => {
                this.setLoading(data.type, false);
            });
            
            this.eventBus.on(CONSTANTS.EVENTS.NOTIFICATION_SHOW, (notification) => {
                this.showNotification(notification);
            });
            
            
            this.eventBus.on(CONSTANTS.EVENTS.AREA_UPDATED, async (area) => {
                await this.updateAreaStatistics();
                
                // Принудительно обновляем графики после обновления статистики
                setTimeout(async () => {
                    try {
                        await this.updateSourcesChart();
                        await this.updateAddressAnalyticsCharts();
                    } catch (error) {
                        console.error('❌ UIManager: Ошибка принудительного обновления графиков:', error);
                    }
                }, 100);
            });
            
            // Обновляем кэш адресов для helper методов
            this.eventBus.on(CONSTANTS.EVENTS.ADDRESSES_LOADED, async (data) => {
                // data может быть либо массивом адресов (старый формат), либо объектом с полем addresses
                this.addresses = Array.isArray(data) ? data : (data?.addresses || []);
                await this.debugLog('🏠 UIManager: Кэш адресов обновлен:', this.addresses.length);
            });
            
            // Обновляем статистику после импорта объявлений
            this.eventBus.on(CONSTANTS.EVENTS.LISTINGS_IMPORTED, async (data) => {
                try {
                    await this.debugLog('📈 UIManager: Получено событие LISTINGS_IMPORTED, обновляем статистику');
                    await this.updateAreaStatistics();
                    
                    // Обновляем графики статистики
                    await this.updateSourcesChart();
                    await this.updateAddressAnalyticsCharts();
                } catch (error) {
                    console.error('❌ UIManager: Ошибка обновления статистики после импорта объявлений:', error);
                }
            });
            
            // Обрабатываем обновление объявлений
            this.eventBus.on(CONSTANTS.EVENTS.LISTING_UPDATED, async (eventData) => {
                try {
                    await this.debugLog('🔄 UIManager: Получено событие LISTING_UPDATED для объявления:', eventData.listing.id);
                    
                    // Если открыто модальное окно этого объявления, обновляем его
                    await this.handleListingUpdated(eventData);
                    
                    // Обновляем статистику
                    await this.updateAreaStatistics();
                    
                } catch (error) {
                    console.error('❌ UIManager: Ошибка обработки обновления объявления:', error);
                }
            });
        }
        
        // Привязка к панелям
        this.bindPanelEvents();
        
        // Привязка к модальным окнам
        this.bindModalEvents();
        
        // Привязка к глобальным UI событиям
        this.bindGlobalEvents();
    }
    
    /**
     * Привязка к панелям
     */
    async bindPanelEvents() {
        await this.debugLog('🔗 UIManager: Привязка событий панелей (новая простая система)...');
        
        // Все панели на странице (включая addressTable)
        const panelMappings = [
            { name: 'statistics', header: 'statisticsPanelHeader', content: 'statisticsPanelContent', chevron: 'statisticsPanelChevron' },
            { name: 'dataWork', header: 'dataWorkPanelHeader', content: 'dataWorkPanelContent', chevron: 'dataWorkPanelChevron' },
            { name: 'map', header: 'mapPanelHeader', content: 'mapPanelContent', chevron: 'mapPanelChevron' },
            { name: 'segments', header: 'segmentsPanelHeader', content: 'segmentsPanelContent', chevron: 'segmentsPanelChevron' },
            { name: 'reports', header: 'reportsPanelHeader', content: 'reportsPanelContent', chevron: 'reportsPanelChevron' },
            { name: 'duplicates', header: 'duplicatesPanelHeader', content: 'duplicatesPanelContent', chevron: 'duplicatesPanelChevron' },
            { name: 'addressTable', header: 'addressTableHeader', content: 'addressTableContent', chevron: 'addressTableChevron' }
        ];
        
        for (const panel of panelMappings) {
            const header = document.getElementById(panel.header);
            if (header) {
                header.addEventListener('click', async () => {
                    await this.debugLog(`🔵 UIManager: Клик по панели "${panel.name}"`);
                    this.simpleTogglePanel(panel.name, panel.content, panel.chevron);
                });
                await this.debugLog(`✅ UIManager: Панель "${panel.name}" привязана к элементу #${panel.header}`);
            } else {
                console.debug(`💡 UIManager: Панель "${panel.name}" пропущена (элемент #${panel.header} не найден)`);
            }
        }
        
        await this.debugLog('✅ UIManager: Привязка событий панелей завершена');
    }
    
    /**
     * Привязка к модальным окнам
     */
    bindModalEvents() {
        // Закрытие модальных окон по клику вне их
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                this.closeModal(e.target.dataset.modal);
            }
        });
        
        // Закрытие модальных окон по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
        
        // Привязка кнопок закрытия модальных окон
        this.bindModalCloseButtons();
    }
    
    /**
     * Привязка кнопок закрытия модальных окон
     */
    bindModalCloseButtons() {
        // Кнопки закрытия модального окна объявления
        const closeButtons = document.querySelectorAll('#closeModalBtn, #closeModalFooterBtn, .modal-close');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Найдем родительское модальное окно
                const modal = btn.closest('[id$="Modal"]');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Кнопки закрытия модального окна объекта недвижимости
        const objectCloseButtons = document.querySelectorAll('#closeObjectModalBtn, #closeObjectModalBtn2');
        objectCloseButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = document.getElementById('objectModal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });
        
    }

    /**
     * Инициализация обработки ошибок загрузки изображений
     * @param {HTMLElement} container - Контейнер для поиска изображений
     */
    initializeImageErrorHandling(container) {
        const images = container.querySelectorAll('img.listing-photo');
        images.forEach(img => {
            img.addEventListener('error', function() {
                this.style.display = 'none';
            });
            
            // Также скрываем изображения, которые уже не загрузились
            if (img.complete && !img.naturalWidth) {
                img.style.display = 'none';
            }
        });
    }
    
    /**
     * Привязка к глобальным событиям
     */
    bindGlobalEvents() {
        // Обработка изменения размера окна
        window.addEventListener('resize', Helpers.debounce(() => {
            this.onWindowResize();
        }, 250));
        
        // Обработка ошибок
        window.addEventListener('error', (e) => {
            this.handleGlobalError(e);
        });
        
        // Обработка unhandled promise rejections
        window.addEventListener('unhandledrejection', (e) => {
            this.handleGlobalError(e);
        });
    }
    
    /**
     * Обработка загрузки области
     */
    onAreaLoaded(area) {
        // Обновляем заголовок страницы
        this.updatePageTitle(area);
        
        // Восстанавливаем состояние панелей
        this.restorePanelStates(area);
        
        // Инициализируем UI элементы
        this.initializeUIElements();
        
        // Инициализируем табы панели работы с данными
        this.initDataWorkTabs();
        
        // Обновляем статистику области
        this.updateAreaStatistics();
        
        // Обновляем графики статистики при загрузке области
        setTimeout(async () => {
            try {
                await this.updateSourcesChart();
                await this.updateAddressAnalyticsCharts();
            } catch (error) {
                console.error('❌ UIManager: Ошибка обновления графиков при загрузке области:', error);
            }
        }, 500);
        
        // Показываем уведомление
        this.showNotification({
            type: 'success',
            message: `Область "${area.name}" загружена`,
            duration: 3000
        });
    }
    
    /**
     * Обновление заголовка страницы
     */
    updatePageTitle(area) {
        const titleElement = document.getElementById('areaTitle');
        if (titleElement) {
            titleElement.textContent = area.name;
        } else {
            console.error('❌ UIManager: Элемент areaTitle не найден');
        }
        
        // Обновляем title документа
        document.title = `Neocenka - ${area.name}`;
    }
    
    /**
     * Переключение панели
     */
    togglePanel(panelName) {
        this.debugLog(`🔄 UIManager: Переключение панели "${panelName}"`);
        
        const config = this.panelConfig[panelName];
        if (!config) {
            console.warn(`⚠️ UIManager: Конфигурация для панели "${panelName}" не найдена`);
            return;
        }
        
        const content = document.getElementById(config.content);
        const chevron = document.getElementById(config.chevron);
        
        
        if (!content || !chevron) {
            console.error(`❌ UIManager: Не найдены необходимые элементы для панели "${panelName}"`);
            return;
        }
        
        const currentState = this.uiState.panels[panelName];
        const isExpanded = currentState.expanded;
        
        
        // Очищаем все inline стили display
        content.style.display = '';
        content.style.removeProperty('display');
        
        if (isExpanded) {
            // Сворачиваем панель
            content.classList.add('hidden');
            chevron.style.transform = 'rotate(-90deg)';
        } else {
            // Разворачиваем панель
            content.classList.remove('hidden');
            chevron.style.transform = 'rotate(0deg)';
        }
        
        // Обновляем состояние
        this.uiState.panels[panelName].expanded = !isExpanded;
        
        
        // Сохраняем состояние
        this.savePanelState(panelName);
        
        // Уведомляем о изменении
        if (this.eventBus) {
            this.eventBus.emit(CONSTANTS.EVENTS.PANEL_TOGGLED, {
                panelName,
                expanded: !isExpanded,
                timestamp: new Date()
            });
        }
        
    }
    
    // Новая простая система управления панелями
    
    /**
     * Простое переключение панели
     */
    simpleTogglePanel(panelName, contentId, chevronId) {
        
        const content = document.getElementById(contentId);
        const chevron = document.getElementById(chevronId);
        
        if (!content || !chevron) {
            console.warn(`⚠️ UIManager: Элементы панели "${panelName}" не найдены`);
            return;
        }
        
        // Диагностика CSS перед изменениями
        
        // Очищаем любые inline стили display, которые могут конфликтовать с CSS классами
        if (content.style.display) {
            content.style.removeProperty('display');
        }
        
        // Единый подход через CSS классы для всех панелей
        const isCurrentlyHidden = content.classList.contains('hidden');
        
        if (isCurrentlyHidden) {
            // Разворачиваем панель
            content.classList.remove('hidden');
            chevron.style.transform = 'rotate(0deg)';
            this.saveSimplePanelState(panelName, true);
            
            // Уведомляем о развертывании панели (для карты и других компонентов)
            if (this.eventBus) {
                this.eventBus.emit(CONSTANTS.EVENTS.PANEL_TOGGLED, {
                    panelName,
                    expanded: true,
                    visible: true
                });
            }
        } else {
            // Сворачиваем панель
            content.classList.add('hidden');
            chevron.style.transform = 'rotate(-90deg)';
            this.saveSimplePanelState(panelName, false);
            
            // Уведомляем о сворачивании панели
            if (this.eventBus) {
                this.eventBus.emit(CONSTANTS.EVENTS.PANEL_TOGGLED, {
                    panelName,
                    expanded: false,
                    visible: false
                });
            }
        }
        
        // Диагностика CSS после изменений
    }
    
    /**
     * Сохранение простого состояния панели
     */
    saveSimplePanelState(panelName, isExpanded) {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) return;
        
        const stateKey = `simple_panel_${panelName}_${currentArea.id}`;
        localStorage.setItem(stateKey, isExpanded ? 'expanded' : 'collapsed');
    }
    
    /**
     * Простое восстановление состояния панелей
     */
    restorePanelStates(area) {
        this.debugLog('🔄 Восстановление состояния панелей для области:', area?.id);
        
        if (!area || !area.id) {
            this.debugLog('⚠️ Нет области для восстановления состояния панелей');
            return;
        }
        
        // Все панели на странице (включая addressTable)
        const panelMappings = [
            { name: 'statistics', content: 'statisticsPanelContent', chevron: 'statisticsPanelChevron' },
            { name: 'dataWork', content: 'dataWorkPanelContent', chevron: 'dataWorkPanelChevron' },
            { name: 'map', content: 'mapPanelContent', chevron: 'mapPanelChevron' },
            { name: 'segments', content: 'segmentsPanelContent', chevron: 'segmentsPanelChevron' },
            { name: 'reports', content: 'reportsPanelContent', chevron: 'reportsPanelChevron' },
            { name: 'duplicates', content: 'duplicatesPanelContent', chevron: 'duplicatesPanelChevron' },
            { name: 'addressTable', content: 'addressTableContent', chevron: 'addressTableChevron' }
        ];
        
        panelMappings.forEach(panel => {
            const stateKey = `simple_panel_${panel.name}_${area.id}`;
            const savedState = localStorage.getItem(stateKey);
            
            this.debugLog(`🔍 Панель ${panel.name}: ${savedState || 'нет сохраненного состояния'}`);
            
            const content = document.getElementById(panel.content);
            const chevron = document.getElementById(panel.chevron);
            
            if (!content || !chevron) {
                this.debugLog(`⚠️ Элементы панели ${panel.name} не найдены, пропускаем`);
                return;
            }
            
            // Применяем состояние (по умолчанию - скрыто) - единый подход через CSS классы
            const isExpanded = savedState === 'expanded';
            
            if (isExpanded) {
                content.classList.remove('hidden');
                chevron.style.transform = 'rotate(0deg)';
                this.debugLog(`✅ Панель ${panel.name} восстановлена как развернутая`);
            } else {
                content.classList.add('hidden');
                chevron.style.transform = 'rotate(-90deg)';
                this.debugLog(`✅ Панель ${panel.name} восстановлена как свернутая`);
            }
        });
        
        this.debugLog('✅ Восстановление панелей завершено');
    }
    
    // Старые методы видимости удалены
    
    /**
     * Инициализация панелей по умолчанию
     */
    initializePanelsDefaults() {
        
        // Все панели на странице (включая addressTable)
        const panelMappings = [
            { name: 'statistics', content: 'statisticsPanelContent', chevron: 'statisticsPanelChevron' },
            { name: 'dataWork', content: 'dataWorkPanelContent', chevron: 'dataWorkPanelChevron' },
            { name: 'map', content: 'mapPanelContent', chevron: 'mapPanelChevron' },
            { name: 'segments', content: 'segmentsPanelContent', chevron: 'segmentsPanelChevron' },
            { name: 'duplicates', content: 'duplicatesPanelContent', chevron: 'duplicatesPanelChevron' },
            { name: 'addressTable', content: 'addressTableContent', chevron: 'addressTableChevron' }
        ];
        
        panelMappings.forEach(panel => {
            const content = document.getElementById(panel.content);
            const chevron = document.getElementById(panel.chevron);
            
            if (!content || !chevron) {
                return;
            }
            
            // По умолчанию все панели скрыты - единый подход через CSS классы
            content.classList.add('hidden');
            chevron.style.transform = 'rotate(-90deg)';
            
        });
        
    }
    
    /**
     * Сохранение состояния панели
     */
    savePanelState(panelName) {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) {
            console.warn(`⚠️ UIManager: Область не найдена для сохранения состояния панели "${panelName}"`);
            return;
        }
        
        const state = this.uiState.panels[panelName];
        const stateKey = `panel_${panelName}_${currentArea.id}`;
        
        localStorage.setItem(stateKey, JSON.stringify(state));
    }
    
    /**
     * Инициализация переключателей панелей
     */
    initPanelToggles() {
        try {
            // Инициализация чекбоксов панелей
            Object.keys(this.panelConfig).forEach(panelName => {
                const config = this.panelConfig[panelName];
                if (config.checkbox) {
                    const checkbox = document.getElementById(config.checkbox);
                    if (checkbox) {
                        // Установка начального состояния
                        checkbox.checked = this.uiState.panels[panelName]?.visible !== false;
                        
                        // Обработчик изменения
                        checkbox.addEventListener('change', (e) => {
                            this.togglePanelVisibility(panelName, e.target.checked);
                        });
                    }
                }
            });
            
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка инициализации переключателей панелей:', error);
        }
    }
    
    /**
     * Переключение видимости панели
     */
    togglePanelVisibility(panelName, visible) {
        try {
            const config = this.panelConfig[panelName];
            if (!config) {
                console.warn(`⚠️ UIManager: Конфигурация панели "${panelName}" не найдена`);
                return;
            }
            
            // Обновление состояния
            this.uiState.panels[panelName].visible = visible;
            
            // Получение контейнера панели
            const container = document.getElementById(config.container);
            if (container) {
                if (visible) {
                    container.classList.remove('hidden');
                } else {
                    container.classList.add('hidden');
                }
            }
            
            // Сохранение состояния
            this.savePanelState(panelName);
            
            // Уведомление о изменении
            this.eventBus.emit(CONSTANTS.EVENTS.PANEL_TOGGLED, {
                panelName,
                visible,
                state: this.uiState.panels[panelName]
            });
            
            
        } catch (error) {
            console.error(`❌ UIManager: Ошибка переключения панели "${panelName}":`, error);
        }
    }
    
    /**
     * Открытие модального окна
     */
    async openModal(modalName, options = {}) {
        const modal = document.getElementById(modalName);
        if (!modal) {
            console.error(`❌ UIManager: Модальное окно "${modalName}" не найдено`);
            return;
        }
        
        
        // Специальная обработка для модального окна объекта - заполняем контент ДО показа
        if (modalName === 'objectModal' && options.objectData) {
            try {
                // Применяем опции до заполнения контента
                if (options.title) {
                    const titleElement = modal.querySelector('.modal-title, #modal-title');
                    if (titleElement) {
                        titleElement.textContent = options.title;
                    }
                }
                
                if (options.size) {
                    const content = modal.querySelector('.modal-content');
                    if (content) {
                        content.className = `modal-content ${options.size}`;
                    }
                }
                
                // Заполняем контент ПЕРЕД показом модального окна
                await this.populateObjectModal(modal, options.objectData);
            } catch (error) {
                console.error('❌ Ошибка загрузки данных объекта:', error);
                // Продолжаем показ модального окна даже при ошибке
            }
        }
        
        // Показываем модальное окно (убираем hidden класс и устанавливаем flex)
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        
        // Блокируем скролл body
        document.body.style.overflow = 'hidden';
        
        // Обновляем состояние
        this.uiState.modals[modalName] = true;
        
        // Применяем опции для остальных модальных окон
        if (modalName !== 'objectModal') {
            if (options.title) {
                const titleElement = modal.querySelector('.modal-title, #modal-title');
                if (titleElement) {
                    titleElement.textContent = options.title;
                }
            }
            
            if (options.size) {
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.className = `modal-content ${options.size}`;
                }
            }
        }
        
        // Специальная обработка для модального окна объявления
        if (modalName === 'listingModal' && options.listing) {
            // Сохраняем ID объявления для отслеживания обновлений
            modal.dataset.listingId = options.listing.id;
            
            this.populateListingModal(modal, options.listing).catch(error => {
                console.error('❌ Ошибка загрузки данных объявления:', error);
            });
        }
        
        // Фокусируемся на первом элементе
        const firstFocusable = modal.querySelector('input, textarea, select, button');
        if (firstFocusable) {
            setTimeout(() => firstFocusable.focus(), 100);
        }
        
        // Инициализируем карту после показа модального окна (только для objectModal)
        if (modalName === 'objectModal' && this._pendingMapInitialization) {
            setTimeout(() => {
                const { duplicatesManager, realEstateObject } = this._pendingMapInitialization;
                
                // Инициализируем карту объекта (требует видимого контейнера)
                if (duplicatesManager && duplicatesManager.renderObjectMap) {
                    duplicatesManager.renderObjectMap(realEstateObject);
                }
                
                // Очищаем временные данные
                this._pendingMapInitialization = null;
            }, 100); // Небольшая задержка для полной отрисовки модального окна
        }

        // Уведомляем об открытии
        this.eventBus.emit(CONSTANTS.EVENTS.MODAL_OPENED, {
            modalName,
            options,
            timestamp: new Date()
        });
    }
    
    /**
     * Закрытие модального окна
     */
    closeModal(modalName) {
        const modal = document.getElementById(modalName);
        if (!modal) {
            console.error(`❌ UIManager: Модальное окно "${modalName}" не найдено`);
            return;
        }
        
        // Скрываем модальное окно (добавляем hidden класс и убираем flex)
        modal.classList.add('hidden');
        modal.style.display = 'none';
        modal.classList.remove('modal-open');
        
        // Разблокируем скролл body
        document.body.style.overflow = '';
        
        // Обновляем состояние
        this.uiState.modals[modalName] = false;
        
        // Уведомляем о закрытии
        this.eventBus.emit(CONSTANTS.EVENTS.MODAL_CLOSED, {
            modalName,
            timestamp: new Date()
        });
    }
    
    /**
     * Обработка запроса на открытие модального окна
     */
    handleModalOpen(data) {
        try {
            
            switch (data.modalType) {
                case CONSTANTS.MODAL_TYPES.LISTING_DETAIL:
                    // Используем стандартный способ открытия модального окна
                    this.openModal('listingModal', {
                        listing: data.listing,
                        title: `Детали объявления: ${data.listing.title || 'Без названия'}`
                    });
                    break;
                case CONSTANTS.MODAL_TYPES.OBJECT_DETAIL:
                    this.openObjectDetailModal(data.object);
                    break;
                default:
                    console.warn('⚠️ UIManager: Неизвестный тип модального окна:', data.modalType);
            }
        } catch (error) {
            console.error('❌ UIManager: Ошибка обработки модального окна:', error);
        }
    }
    
    /**
     * Закрытие всех модальных окон
     */
    closeAllModals() {
        Object.keys(this.uiState.modals).forEach(modalName => {
            if (this.uiState.modals[modalName]) {
                this.closeModal(modalName);
            }
        });
    }
    
    /**
     * Заполнение модального окна данными объявления
     */
    async populateListingModal(modal, listing) {
        try {
            
            // Загружаем свежие данные из базы данных
            const freshListing = await window.db.getListing(listing.id);
            const dataToUse = freshListing || listing;
            
            // Проверяем и исправляем пустую историю цен
            if (!dataToUse.price_history || !Array.isArray(dataToUse.price_history) || dataToUse.price_history.length === 0) {
                // Создаем базовую запись истории цен
                dataToUse.price_history = [{
                    date: dataToUse.created ? (dataToUse.created instanceof Date ? dataToUse.created.toISOString() : new Date(dataToUse.created).toISOString()) : new Date().toISOString(),
                    price: dataToUse.price || 0
                }];
                
                // Сохраняем исправленную историю в базу данных
                if (freshListing) {
                    await window.db.update('listings', dataToUse);
                }
            }
            
            const modalContent = modal.querySelector('#modalContent');
            if (!modalContent) {
                console.error('❌ UIManager: Контейнер modalContent не найден');
                return;
            }
            
            // Формируем HTML с деталями объявления (используем свежие данные)
            const listingHtml = this.generateListingDetailHtml(dataToUse);
            modalContent.innerHTML = listingHtml;
            
            // Заполняем панель управления в футере модального окна
            const footerManagement = modal.querySelector('#modalFooterManagement');
            if (footerManagement) {
                const managementHtml = this.generateManagementPanelHtml(dataToUse);
                footerManagement.innerHTML = managementHtml;
            }
            
            // Настраиваем кнопку "Открыть объявление"
            const openBtn = modal.querySelector('#openListingBtn');
            if (openBtn) {
                openBtn.onclick = () => {
                    if (dataToUse.url) {
                        chrome.tabs.create({ url: dataToUse.url });
                    } else {
                        console.warn('⚠️ UIManager: URL объявления не найден');
                    }
                };
            }
            
            
            // Инициализируем Fotorama и график цены после отображения модального окна
            setTimeout(async () => {
                const debugEnabled = await this.isDebugEnabled();
                
                if (debugEnabled) {
                }
                
                // Инициализируем галерею Fotorama
                const galleryElement = document.getElementById(`listing-gallery-${dataToUse.id}`);
                if (galleryElement && window.$ && $.fn.fotorama) {
                    $(galleryElement).fotorama();
                    if (debugEnabled) {
                    }
                }
                
                // Инициализируем график изменения цены (используем свежие данные!)
                this.renderPriceChart(dataToUse);
                
                // Добавляем обработчик для сворачивания панели местоположения
                const locationHeader = document.getElementById(`locationPanelHeader-${dataToUse.id}`);
                if (locationHeader) {
                    locationHeader.addEventListener('click', async () => {
                        await this.toggleLocationPanel(dataToUse.id);
                    });
                }
                
                // Инициализируем выпадающий список адресами
                await this.initializeAddressSelector(dataToUse.id, dataToUse.address_id);
                
                // Добавляем обработчик для сохранения адреса
                const saveButton = document.getElementById(`saveAddress_${dataToUse.id}`);
                if (saveButton) {
                    saveButton.addEventListener('click', () => {
                        this.saveListingAddress(dataToUse.id);
                    });
                }
                
                // Добавляем обработчик для кнопки "Верный адрес" в модальном окне
                const correctAddressModalButton = document.getElementById(`correctAddressModal_${dataToUse.id}`);
                if (correctAddressModalButton) {
                    correctAddressModalButton.addEventListener('click', () => {
                        // Логика обучения для верного адреса
                        this.markSingleAddressAsCorrect(dataToUse.id);
                    });
                }
                
                // Добавляем обработчик для кнопки "Неверный адрес" в модальном окне
                const incorrectAddressModalButton = document.getElementById(`incorrectAddressModal_${dataToUse.id}`);
                if (incorrectAddressModalButton) {
                    incorrectAddressModalButton.addEventListener('click', () => {
                        // Логика обучения для неверного адреса
                        this.markSingleAddressAsIncorrect(dataToUse.id);
                    });
                }
                
                // Добавляем обработчик для сворачивания панели истории цен
                const priceHistoryHeader = document.getElementById(`priceHistoryPanelHeader-${dataToUse.id}`);
                if (priceHistoryHeader) {
                    priceHistoryHeader.addEventListener('click', () => {
                        this.togglePriceHistoryPanel(dataToUse.id);
                    });
                }
                
                // Инициализируем таблицу истории цен (используем свежие данные!)
                await this.initializePriceHistoryTable(dataToUse.id, dataToUse);
                
                // Добавляем обработчик для добавления новой цены
                const addPriceButton = document.getElementById(`addPriceEntry-${dataToUse.id}`);
                if (addPriceButton) {
                    addPriceButton.addEventListener('click', () => {
                        this.addPriceEntry(dataToUse.id);
                    });
                }
                
                // Добавляем обработчик для сохранения истории цен
                const savePriceHistoryButton = document.getElementById(`savePriceHistory-${dataToUse.id}`);
                if (savePriceHistoryButton) {
                    savePriceHistoryButton.addEventListener('click', () => {
                        this.savePriceHistory(dataToUse.id);
                    });
                }
                
                // Инициализируем модальное окно редактирования цены
                this.initializePriceEditModal(dataToUse.id);
                
                // Инициализируем панель управления (SlimSelect для статуса)
                await this.initializeManagementPanel(dataToUse.id);
                
                // Добавляем обработчик для сломанных изображений
                this.initializeImageErrorHandling(modal);
                
                if (debugEnabled) {
                }
                
            }, 100);
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка заполнения модального окна:', error);
        }
    }
    
    /**
     * Заполнение модального окна данными объекта недвижимости
     */
    async populateObjectModal(modal, objectData) {
        try {
            
            const { realEstateObject, objectListings, duplicatesManager } = objectData;
            
            const modalContent = modal.querySelector('#objectModalContent');
            if (!modalContent) {
                console.error('❌ UIManager: Контейнер objectModalContent не найден');
                return;
            }
            
            // Формируем HTML с деталями объекта (используем метод из DuplicatesManager)
            if (duplicatesManager && duplicatesManager.renderObjectDetails) {
                const objectHtml = duplicatesManager.renderObjectDetails(realEstateObject, objectListings);
                modalContent.innerHTML = objectHtml;
            } else {
                console.error('❌ UIManager: DuplicatesManager или метод renderObjectDetails не найден');
                return;
            }
            
            // Инициализируем компоненты, которые не требуют видимого контейнера
            // Инициализируем график изменения цены объекта (может работать до показа окна)
            if (duplicatesManager && duplicatesManager.renderObjectPriceChart) {
                duplicatesManager.renderObjectPriceChart(realEstateObject);
            }
            
            // Загружаем фотографии и описание из первого объявления
            if (duplicatesManager && objectListings.length > 0) {
                if (duplicatesManager.loadObjectPhotosGallery) {
                    duplicatesManager.loadObjectPhotosGallery(objectListings[0]);
                }
                if (duplicatesManager.loadObjectDescription) {
                    duplicatesManager.loadObjectDescription(objectListings[0]);
                }
            }
            
            // Инициализируем панель истории изменения цен
            if (duplicatesManager && duplicatesManager.initializeObjectPriceHistoryPanel) {
                duplicatesManager.initializeObjectPriceHistoryPanel(realEstateObject);
            }
            
            // Инициализируем таблицу объявлений объекта
            if (duplicatesManager && duplicatesManager.initializeObjectListingsTable) {
                duplicatesManager.initializeObjectListingsTable(objectListings, realEstateObject.id);
            }
            
            // Сохраняем данные для последующей инициализации карты
            this._pendingMapInitialization = {
                duplicatesManager,
                realEstateObject
            };
            
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка заполнения модального окна объекта:', error);
        }
    }
    
    /**
     * Генерирует HTML для панели управления объявлением (компактная версия для футера)
     * @param {Object} listing - Объект объявления
     * @returns {string} HTML код панели управления
     */
    generateManagementPanelHtml(listing) {
        return `
            <div class="flex items-center justify-between w-full">
                <!-- Левая сторона: Актуализация и статус -->
                <div class="flex items-center space-x-4">
                    <!-- Кнопка актуализации -->
                    <button id="actualizeBtn-${listing.id}" 
                            class="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors">
                        🔄 Актуализировать
                    </button>
                    
                    <!-- Переключатель статуса -->
                    <div class="flex items-center">
                        <label class="text-sm font-medium text-gray-700 mr-2">Статус:</label>
                        <select id="statusSelect-${listing.id}" class="form-select text-sm">
                            <option value="active" ${listing.status === 'active' ? 'selected' : ''}>Активное</option>
                            <option value="archived" ${listing.status === 'archived' ? 'selected' : ''}>Архив</option>
                        </select>
                    </div>
                </div>

                <!-- Центр: Кнопки управления объявлением -->
                <div class="flex items-center space-x-2">
                    <button type="button" id="openListingBtn" class="inline-flex items-center justify-center rounded-md border border-transparent shadow-sm px-4 py-1 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                        🔗 Открыть объявление
                    </button>
                    <button type="button" id="updateListingBtn-${listing.id}" class="inline-flex items-center justify-center rounded-md border border-transparent shadow-sm px-4 py-1 bg-green-600 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
                        🔄 Обновить
                    </button>
                </div>
                
                <!-- Правая сторона: Дата обновления и удаление -->
                <div class="flex items-center space-x-3">
                    <!-- Дата последнего обновления -->
                    <div class="flex items-center">
                        <span class="text-xs text-gray-500">Обновлено:</span>
                        <span id="lastUpdated-${listing.id}" class="ml-1 text-xs text-gray-700">
                            ${listing.updated ? new Date(listing.updated).toLocaleDateString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            }) : 'Не указано'}
                        </span>
                    </div>
                    
                    <!-- Кнопка удаления -->
                    <button id="deleteBtn-${listing.id}" 
                            class="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors">
                        🗑️ Удалить
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Генерация HTML с деталями объявления
     */
    generateListingDetailHtml(listing) {
        // Проверяем есть ли информация о последнем обновлении для подсветки
        const updateInfo = this.lastUpdatedListing;
        const shouldHighlight = updateInfo && 
                               updateInfo.listing.id === listing.id && 
                               (new Date() - updateInfo.updatedAt) < 30000; // подсвечиваем 30 секунд
        
        // Обрабатываем фотографии
        const photos = this.getListingPhotos(listing);
        
        //     photos: listing.photos,
        //     images: listing.images,
        //     photo_urls: listing.photo_urls,
        //     main_photo: listing.main_photo,
        //     photo: listing.photo,
        //     image_url: listing.image_url
        // });
        
        return `
            <!-- Карта местоположения -->
            <div class="mb-6">
                <div class="bg-white shadow overflow-hidden sm:rounded-md border border-gray-200">
                    <div class="px-4 py-3 cursor-pointer" id="locationPanelHeader-${listing.id}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <span class="text-lg font-medium text-gray-900">📍 Местоположение</span>
                                <span class="text-sm ${this.getAddressStatusClass(listing)}">${this.getAddressStatusText(listing)}</span>
                            </div>
                            <svg id="locationPanelChevron-${listing.id}" class="h-5 w-5 text-gray-400 transform transition-transform duration-200" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                    </div>
                    <div id="locationPanelContent-${listing.id}" class="px-4 pb-4" style="display: none;">
                        ${this.renderAddressAccuracyInfo(listing)}
                        <div id="listing-map-${listing.id}" class="h-64 bg-gray-200 rounded-md mt-3">
                            <!-- Карта будет отрендерена здесь -->
                        </div>
                    </div>
                </div>
            </div>

             <!-- График изменения цены -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">График изменения цены</h4>
                <div id="listing-price-chart-${listing.id}" class="w-full">
                    <!-- График будет отрендерен здесь -->
                </div>
            </div>
            
            <!-- История изменения цены -->
            <div class="mb-6">
                <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div id="priceHistoryPanelHeader-${listing.id}" class="px-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors duration-150">
                        <div class="flex items-center justify-between">
                            <h4 class="text-lg font-medium text-gray-900">История изменения цены</h4>
                            <svg id="priceHistoryPanelChevron-${listing.id}" class="h-5 w-5 text-gray-400 transform transition-transform duration-200 rotate-[-90deg]" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                    </div>
                    <div id="priceHistoryPanelContent-${listing.id}" class="px-4 pb-4" style="display: none;">
                        <div class="mt-4 mb-4 flex items-center justify-between">
                            <button id="addPriceEntry-${listing.id}" class="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                Добавить изменение цены
                            </button>
                            <button id="savePriceHistory-${listing.id}" class="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                💾 Сохранить историю цен
                            </button>
                        </div>
                        <div class="overflow-x-auto">
                            <table id="priceHistoryTable-${listing.id}" class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    <!-- Данные будут загружены через DataTable -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Фотогалерея -->
            <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Фотографии ${photos.length > 0 ? `(${photos.length})` : '(не найдены)'}</h4>
                ${photos.length > 0 ? `
                    <div class="fotorama" 
                         data-nav="thumbs" 
                         data-width="100%" 
                         data-height="400"
                         data-thumbheight="50"
                         data-thumbwidth="50"
                         data-allowfullscreen="true"
                         data-transition="slide"
                         data-loop="true"
                         id="listing-gallery-${listing.id}">
                        ${photos.map(photo => `<img src="${photo}" alt="Фото объявления" class="listing-photo">`).join('')}
                    </div>
                ` : `
                    <div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                        📷 Фотографии не найдены
                    </div>
                `}
            </div>
            
            <!-- Модальное окно редактирования цены -->
            <div id="editPriceModal-${listing.id}" class="hidden fixed inset-0 z-50 overflow-y-auto" aria-labelledby="edit-price-modal-title" role="dialog" aria-modal="true">
                <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-4 text-center sm:block sm:p-0">
                    <!-- Overlay -->
                    <div class="fixed inset-0 z-0 transition-opacity" style="background-color: rgba(0, 0, 0, 0.1);" aria-hidden="true"></div>
                    
                    <!-- Выравнивание центра -->
                    <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                    
                    <!-- Содержимое модального окна -->
                    <div class="inline-block align-bottom bg-white border rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md relative z-10">
                        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div class="sm:flex sm:items-start">
                                <div class="w-full">
                                    <!-- Заголовок -->
                                    <div class="mb-4">
                                        <h3 class="text-lg font-medium leading-6 text-gray-900" id="editPriceModalTitle-${listing.id}">
                                            Редактировать цену
                                        </h3>
                                    </div>
                                    
                                    <!-- Форма -->
                                    <form id="editPriceForm-${listing.id}">
                                        <div class="mb-4">
                                            <label for="priceInput-${listing.id}" class="block text-sm font-medium text-gray-700 mb-2">
                                                Цена (₽)
                                            </label>
                                            <input type="text" id="priceInput-${listing.id}" 
                                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                   placeholder="Введите цену">
                                        </div>
                                        <div class="mb-6">
                                            <label for="dateInput-${listing.id}" class="block text-sm font-medium text-gray-700 mb-2">
                                                Дата изменения
                                            </label>
                                            <input type="datetime-local" id="dateInput-${listing.id}" 
                                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button type="submit" form="editPriceForm-${listing.id}" id="saveEditPrice-${listing.id}" 
                                    class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">
                                Сохранить
                            </button>
                            <button type="button" id="cancelEditPrice-${listing.id}" 
                                    class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm">
                                Отмена
                            </button>
                        </div>
                    </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Основная информация -->
                <div>
                    <h4 class="text-lg font-medium text-gray-900 mb-4">
                        Основная информация
                        ${shouldHighlight ? `<span class="ml-2 text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full animate-pulse">Обновлено ${updateInfo.archived ? '(архивировано)' : ''}</span>` : ''}
                    </h4>
                    <dl class="space-y-3">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Заголовок</dt>
                            <dd class="text-sm text-gray-900">${this.escapeHtml(listing.title || '-')}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Адрес</dt>
                            <dd class="text-sm text-gray-900">${this.escapeHtml(listing.address || '-')}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Цена</dt>
                            <dd class="text-sm text-gray-900 ${shouldHighlight && updateInfo.priceChanged ? 'bg-yellow-200 px-2 py-1 rounded transition-colors duration-3000' : ''}">${this.formatPrice(listing.price)}${shouldHighlight && updateInfo.priceChanged ? ` <span class="text-xs text-green-600">(обновлено)</span>` : ''}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Цена за м²</dt>
                            <dd class="text-sm text-gray-900">${listing.price_per_meter ? this.formatPrice(listing.price_per_meter) + '/м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Источник</dt>
                            <dd class="text-sm text-gray-900">${listing.source}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Статус</dt>
                            <dd class="text-sm text-gray-900">${this.getStatusText(listing.status)}</dd>
                        </div>
                    </dl>
                </div>

                <!-- Характеристики недвижимости -->
                <div>
                    <h4 class="text-lg font-medium text-gray-900 mb-4">Характеристики</h4>
                    <dl class="space-y-3">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Тип недвижимости</dt>
                            <dd class="text-sm text-gray-900">${this.formatPropertyType(listing.property_type)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Общая площадь</dt>
                            <dd class="text-sm text-gray-900">${listing.area_total ? listing.area_total + ' м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Жилая площадь</dt>
                            <dd class="text-sm text-gray-900">${listing.area_living ? listing.area_living + ' м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Площадь кухни</dt>
                            <dd class="text-sm text-gray-900">${listing.area_kitchen ? listing.area_kitchen + ' м²' : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Этаж</dt>
                            <dd class="text-sm text-gray-900">${listing.floor ? `${listing.floor}${listing.total_floors || listing.floors_total ? ` из ${listing.total_floors || listing.floors_total}` : ''}` : '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Количество комнат</dt>
                            <dd class="text-sm text-gray-900">${listing.rooms || '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Состояние</dt>
                            <dd class="text-sm text-gray-900">${listing.condition || '-'}</dd>
                        </div>
                    </dl>
                </div>

                <!-- Дополнительная информация -->
                <div class="lg:col-span-2">
                    <h4 class="text-lg font-medium text-gray-900 mb-4">Дополнительная информация</h4>
                    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Дата создания</dt>
                            <dd class="text-sm text-gray-900">${this.formatDate(listing.created)}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">External ID</dt>
                            <dd class="text-sm text-gray-900">${listing.external_id || '-'}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Дата обновления</dt>
                            <dd class="text-sm text-gray-900 ${shouldHighlight ? 'bg-yellow-200 px-2 py-1 rounded transition-colors duration-3000' : ''}">${this.formatDate(listing.updated)}${shouldHighlight ? ` <span class="text-xs text-green-600">(обновлено)</span>` : ''}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Продавец</dt>
                            <dd class="text-sm text-gray-900">${listing.seller_name || '-'}</dd>
                        </div>
                    </dl>

                    ${listing.description ? `
                        <div class="mt-6">
                            <dt class="text-sm font-medium text-gray-500 mb-2">Описание</dt>
                            <dd class="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">${this.escapeHtml(listing.description)}</dd>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Получение фотографий объявления из различных полей
     */
    getListingPhotos(listing) {
        const photos = [];
        
        // Проверяем различные возможные поля с фотографиями
        if (listing.photos && Array.isArray(listing.photos)) {
            photos.push(...listing.photos);
        } else if (listing.images && Array.isArray(listing.images)) {
            photos.push(...listing.images);
        } else if (listing.photo_urls && Array.isArray(listing.photo_urls)) {
            photos.push(...listing.photo_urls);
        } else if (listing.main_photo) {
            photos.push(listing.main_photo);
        }
        
        // Проверяем поля с одиночными фотографиями
        if (listing.photo && !photos.includes(listing.photo)) {
            photos.push(listing.photo);
        }
        
        if (listing.image_url && !photos.includes(listing.image_url)) {
            photos.push(listing.image_url);
        }
        
        // Фильтруем валидные URL
        return photos.filter(photo => 
            photo && 
            typeof photo === 'string' && 
            (photo.startsWith('http://') || photo.startsWith('https://'))
        );
    }
    
    /**
     * Методы из старой версии для полного функционала модального окна
     */
    
    renderPriceChart(listing) {
        try {
            const chartContainer = document.getElementById(`listing-price-chart-${listing.id}`);
            if (!chartContainer) {
                console.warn('Контейнер графика не найден');
                return;
            }

            // Подготавливаем данные для графика из истории цен
            const priceHistory = this.preparePriceHistoryData(listing);
            
            if (priceHistory.length === 0) {
                chartContainer.innerHTML = '<div class="text-center text-gray-500 py-8">История цен отсутствует</div>';
                return;
            }

            const seriesData = priceHistory.map(item => [item.date, item.price]);
            const prices = priceHistory.map(item => item.price);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);

            let series = [{
                "name": "<span class=\"text-sky-500\">цена</span>",
                "data": seriesData
            }];
            let colors = ["#56c2d6"];
            let widths = ["3"];

            var options = {
                chart: {
                    height: 300,
                    locales: [{
                        "name": "ru",
                        "options": {
                            "months": [
                                "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                                "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
                            ],
                            "shortMonths": [
                                "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
                                "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
                            ],
                            "days": [
                                "Воскресенье", "Понедельник", "Вторник", "Среда", 
                                "Четверг", "Пятница", "Суббота"
                            ],
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
                    },
                    toolbar: {
                        show: false
                    }
                },
                stroke: {
                    curve: 'stepline',
                    width: widths
                },
                series: series,
                colors: colors,
                xaxis: {
                    type: 'datetime',
                    labels: {
                        format: 'dd MMM'
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
                        size: 8
                    }
                },
                tooltip: {
                    shared: false,
                    intersect: true,
                    x: {
                        format: 'dd MMM yyyy'
                    },
                    y: {
                        formatter: (value) => this.formatPrice(value)
                    }
                },
                yaxis: {
                    min: Math.floor(minPrice * 0.95),
                    max: Math.ceil(maxPrice * 1.05),
                    title: {
                        text: 'Цена, ₽'
                    },
                    labels: {
                        formatter: (value) => this.formatPrice(value)
                    }
                },
                grid: {
                    show: true,
                    position: 'back',
                    xaxis: {
                        lines: {
                            show: true,
                        }
                    },
                    yaxis: {
                        lines: {
                            show: true,
                        }
                    },
                    borderColor: '#eeeeee',
                },
                legend: {
                    show: false
                },
                responsive: [{
                    breakpoint: 600,
                    options: {
                        chart: {
                            toolbar: {
                                show: false
                            }
                        }
                    }
                }]
            };

            // Очищаем контейнер и создаем график
            chartContainer.innerHTML = '';
            const chart = new ApexCharts(chartContainer, options);
            chart.render();

        } catch (error) {
            console.error('Ошибка создания графика цены:', error);
            const chartContainer = document.getElementById(`listing-price-chart-${listing.id}`);
            if (chartContainer) {
                chartContainer.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки графика</div>';
            }
        }
    }
    
    preparePriceHistoryData(listing) {
        const history = [];
        
        // Добавляем историю цен если есть
        if (listing.price_history && Array.isArray(listing.price_history)) {
            listing.price_history.forEach(item => {
                if ((item.new_price || item.price) && item.date) {
                    history.push({
                        date: new Date(item.date).getTime(),
                        price: parseInt(item.new_price || item.price)
                    });
                }
            });
        }

        // Добавляем конечную точку с правильной датой в зависимости от статуса
        if (listing.price) {
            let endPriceDate;
            
            if (listing.status === 'active') {
                // Для активных объявлений - текущая дата
                endPriceDate = new Date();
            } else {
                // Для архивных объявлений - дата последнего обновления
                endPriceDate = new Date(listing.updated || listing.created || Date.now());
            }
            
            // Добавляем конечную точку только если она отличается от уже существующих
            const lastHistoryDate = history.length > 0 ? history[history.length - 1].date : 0;
            if (Math.abs(endPriceDate.getTime() - lastHistoryDate) > 24 * 60 * 60 * 1000) {
                history.push({
                    date: endPriceDate.getTime(),
                    price: parseInt(listing.price)
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
    
    async toggleLocationPanel(listingId) {
        const content = document.getElementById(`locationPanelContent-${listingId}`);
        const chevron = document.getElementById(`locationPanelChevron-${listingId}`);
        
        if (!content) return;
        
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        
        if (chevron) {
            chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
        }
        
        // Инициализируем карту при первом открытии
        if (isHidden) {
            setTimeout(() => {
                this.initializeListingMap(listingId);
            }, 100);
        }
    }
    
    togglePriceHistoryPanel(listingId) {
        const content = document.getElementById(`priceHistoryPanelContent-${listingId}`);
        const chevron = document.getElementById(`priceHistoryPanelChevron-${listingId}`);
        
        if (!content) return;
        
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        
        if (chevron) {
            if (isHidden) {
                chevron.classList.remove('rotate-[-90deg]');
                chevron.classList.add('rotate-0');
            } else {
                chevron.classList.remove('rotate-0');
                chevron.classList.add('rotate-[-90deg]');
            }
        }
    }
    
    async initializePriceHistoryTable(listingId, listing) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            const tableElement = document.getElementById(`priceHistoryTable-${listingId}`);
            if (!tableElement) return;

            // Подготавливаем данные для таблицы
            const tableData = this.preparePriceHistoryTableData(listing);
            
            if (debugEnabled) {
            }

            // Инициализируем DataTable только если jQuery и DataTable доступны
            if (window.$ && window.$.fn.DataTable) {
                const dataTable = $(tableElement).DataTable({
                    data: tableData,
                    language: {
                        url: '../libs/datatables/ru.json'
                    },
                    pageLength: 10,
                    searching: false,
                    ordering: true,
                    order: [[0, 'asc']], // Сортировка по дате
                    columnDefs: [
                        {
                            targets: 2, // Колонка "Действия"
                            orderable: false,
                            searchable: false,
                            className: 'text-center',
                            width: '120px'
                        }
                    ],
                    columns: [
                        {
                            title: 'Дата',
                            data: 'date',
                            render: function (data, type, row) {
                                if (type === 'display') {
                                    const date = new Date(data);
                                    return date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
                                } else if (type === 'sort' || type === 'type') {
                                    return new Date(data).getTime();
                                }
                                return data;
                            }
                        },
                        {
                            title: 'Цена',
                            data: 'price',
                            render: function (data, type, row) {
                                if (type === 'display') {
                                    return new Intl.NumberFormat('ru-RU').format(data) + ' ₽';
                                }
                                return data;
                            }
                        },
                        {
                            title: 'Действия',
                            data: null,
                            render: function (data, type, row) {
                                return `
                                    <div class="flex space-x-2 justify-center">
                                        <button class="edit-price-btn text-blue-600 hover:text-blue-800 text-sm" data-listing-id="${listingId}" data-index="${row.index}">
                                            Редактировать
                                        </button>
                                        <button class="delete-price-btn text-red-600 hover:text-red-800 text-sm" data-listing-id="${listingId}" data-index="${row.index}">
                                            Удалить
                                        </button>
                                    </div>
                                `;
                            }
                        }
                    ]
                });

                // Сохраняем ссылку на DataTable
                this[`priceHistoryTable_${listingId}`] = dataTable;

                // Добавляем обработчики для кнопок
                $(tableElement).on('click', '.edit-price-btn', (e) => {
                    const index = $(e.target).data('index');
                    this.editPriceEntry(listingId, index);
                });

                $(tableElement).on('click', '.delete-price-btn', (e) => {
                    const index = $(e.target).data('index');
                    this.deletePriceEntry(listingId, index);
                });
            } else {
                tableElement.innerHTML = '<div class="text-center text-gray-500 py-8">DataTable не загружен</div>';
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации таблицы истории цен:', error);
        }
    }
    
    addPriceEntry(listingId) {
        // Открываем модальное окно редактирования цены для добавления новой записи
        const modal = document.getElementById(`editPriceModal-${listingId}`);
        const form = document.getElementById(`editPriceForm-${listingId}`);
        const priceInput = document.getElementById(`priceInput-${listingId}`);
        const dateInput = document.getElementById(`dateInput-${listingId}`);
        
        if (modal && form && priceInput && dateInput) {
            // Очищаем форму
            form.reset();
            priceInput.value = '';
            dateInput.value = new Date().toISOString().split('T')[0]; // Текущая дата
            
            // Убираем индекс редактирования (для добавления новой записи)
            delete modal.dataset.editingIndex;
            
            // Показываем модальное окно
            modal.classList.remove('hidden');
            
            // Устанавливаем фокус на поле цены
            setTimeout(() => priceInput.focus(), 100);
        }
    }
    
    async savePriceHistory(listingId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            if (debugEnabled) {
            }
            
            // Получаем объявление из базы данных
            const listing = await window.db.getListing(listingId);
            if (!listing) {
                console.error('❌ Объявление не найдено:', listingId);
                return;
            }

            // Определяем последнюю цену из истории
            let latestPrice = listing.price; // Текущая цена по умолчанию
            
            if (listing.price_history && Array.isArray(listing.price_history) && listing.price_history.length > 0) {
                // Сортируем историю по дате (от новых к старым)
                const sortedHistory = [...listing.price_history].sort((a, b) => new Date(b.date) - new Date(a.date));
                const latestHistoryItem = sortedHistory[0];
                const historyPrice = latestHistoryItem.new_price || latestHistoryItem.price;
                
                if (historyPrice) {
                    latestPrice = parseInt(historyPrice);
                }
            }

            // Обновляем текущую цену объявления если она изменилась
            const oldPrice = listing.price;
            if (latestPrice !== oldPrice) {
                listing.price = latestPrice;
                
                // Получаем дату последней записи из истории цен
                if (listing.price_history && listing.price_history.length > 0) {
                    const sortedHistory = [...listing.price_history].sort((a, b) => new Date(b.date) - new Date(a.date));
                    const latestHistoryDate = new Date(sortedHistory[0].date);
                    const currentUpdated = listing.updated ? new Date(listing.updated) : null;
                    
                    // Сравниваем даты и берем более позднюю
                    if (!currentUpdated || latestHistoryDate > currentUpdated) {
                        listing.updated = latestHistoryDate.toISOString(); // Дата из истории
                    }
                    // Если currentUpdated позже - оставляем его без изменений
                } else {
                    // Если истории нет, но цена изменилась (редкий случай)
                    listing.updated = new Date().toISOString(); // Текущая дата как fallback
                }
                
                // Сохраняем обновленное объявление в базе данных
                await window.db.updateListing(listing);
                
                if (debugEnabled) {
                }
            }

            // Обновляем таблицу истории цен
            await this.refreshPriceHistoryTable(listingId, listing);
            
            // Обновляем график цен
            this.renderPriceChart(listing);
            
            // Обновляем объект недвижимости, если объявление связано с объектом
            if (listing.object_id && window.realEstateObjectManager) {
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, listing, listing);
                if (debugEnabled) {
                }
            }

            // Обновляем таблицу дублей (если есть в текущем контексте)
            if (this.eventBus) {
                this.eventBus.emit('refreshDuplicatesTable');
                if (debugEnabled) {
                }
            }
            
            // Показываем уведомление
            this.showNotification({
                type: 'success',
                message: 'История цен сохранена' + (latestPrice !== oldPrice ? `, цена обновлена до ${latestPrice.toLocaleString('ru-RU')} ₽` : ''),
                duration: 4000
            });
            
            if (debugEnabled) {
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения истории цен:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка сохранения истории цен',
                duration: 3000
            });
        }
    }
    
    async initializeListingMap(listingId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            const mapContainer = document.getElementById(`listing-map-${listingId}`);
            if (!mapContainer) return;
            
            // Получаем данные объявления
            let listing = await window.db.getListing(listingId);
            if (!listing) {
                if (debugEnabled) {
                }
                mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Объявление не найдено</div>';
                return;
            }
            
            this.renderListingMap(listing);
        } catch (error) {
            console.error('❌ Ошибка инициализации карты объявления:', error);
        }
    }
    
    /**
     * Установка состояния загрузки
     */
    setLoading(type, isLoading) {
        this.uiState.loading[type] = isLoading;
        
        // Обновляем UI индикаторы загрузки
        this.updateLoadingIndicators();
        
        // Уведомляем об изменении
        this.eventBus.emit(CONSTANTS.EVENTS.LOADING_STATE_CHANGED, {
            type,
            isLoading,
            timestamp: new Date()
        });
    }
    
    /**
     * Обновление индикаторов загрузки
     */
    updateLoadingIndicators() {
        // Глобальный индикатор загрузки
        const globalLoader = document.getElementById('globalLoader');
        if (globalLoader) {
            globalLoader.style.display = this.uiState.loading.global ? 'block' : 'none';
        }
        
        // Индикаторы для конкретных секций
        const loadingTypes = ['addresses', 'segments', 'duplicates', 'parsing'];
        
        loadingTypes.forEach(type => {
            const indicator = document.getElementById(`${type}LoadingIndicator`);
            if (indicator) {
                indicator.style.display = this.uiState.loading[type] ? 'inline-block' : 'none';
            }
        });
        
        // Обновляем состояние кнопок
        this.updateButtonStates();
    }
    
    /**
     * Обновление состояния кнопок
     */
    updateButtonStates() {
        // Деактивируем кнопки во время загрузки
        const buttons = document.querySelectorAll('[data-loading-disable]');
        buttons.forEach(button => {
            const loadingType = button.getAttribute('data-loading-disable');
            button.disabled = this.uiState.loading[loadingType] || this.uiState.loading.global;
        });
    }
    
    /**
     * Показ уведомления
     */
    showNotification(notification) {
        const { type = 'info', message, duration = 5000, actions = [] } = notification;
        
        // Создаем элемент уведомления
        const notificationElement = this.createNotificationElement(type, message, actions);
        
        // Добавляем в контейнер
        const container = this.getNotificationContainer();
        container.appendChild(notificationElement);
        
        // Добавляем в состояние
        const notificationData = {
            id: Date.now() + Math.random(),
            type,
            message,
            duration,
            actions,
            element: notificationElement,
            timestamp: new Date()
        };
        
        this.uiState.notifications.push(notificationData);
        
        // Автоматическое скрытие
        if (duration > 0) {
            setTimeout(() => {
                this.hideNotification(notificationData.id);
            }, duration);
        }
        
        // Уведомляем о показе
        this.eventBus.emit(CONSTANTS.EVENTS.NOTIFICATION_SHOWN, notificationData);
    }
    
    /**
     * Создание элемента уведомления
     */
    createNotificationElement(type, message, actions) {
        const typeClasses = {
            success: 'bg-green-100 border-green-500 text-green-700',
            error: 'bg-red-100 border-red-500 text-red-700',
            warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
            info: 'bg-blue-100 border-blue-500 text-blue-700'
        };
        
        const typeIcons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        
        const element = document.createElement('div');
        element.className = `notification border-l-4 p-4 mb-3 rounded ${typeClasses[type] || typeClasses.info}`;
        
        let actionsHTML = '';
        if (actions.length > 0) {
            actionsHTML = `
                <div class="flex mt-2 space-x-2">
                    ${actions.map((action, index) => `
                        <button class="text-sm font-medium underline hover:no-underline" 
                                data-action-index="${index}">${action.text}</button>
                    `).join('')}
                </div>
            `;
        }
        
        element.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-lg font-bold">${typeIcons[type] || typeIcons.info}</span>
                </div>
                <div class="ml-3 flex-1">
                    <p class="text-sm font-medium">${message}</p>
                    ${actionsHTML}
                </div>
                <div class="flex-shrink-0 ml-4">
                    <button class="close-notification text-lg font-bold hover:opacity-75">
                        ×
                    </button>
                </div>
            </div>
        `;
        
        // Добавляем обработчики событий через addEventListener для соответствия CSP
        const closeBtn = element.querySelector('.close-notification');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                element.remove();
            });
        }
        
        // Добавляем обработчики для кнопок действий
        if (actions.length > 0) {
            const actionButtons = element.querySelectorAll('[data-action-index]');
            actionButtons.forEach((button, index) => {
                if (actions[index] && actions[index].handler) {
                    const handler = actions[index].handler;
                    if (typeof handler === 'function') {
                        button.addEventListener('click', handler);
                    } else {
                        console.warn('UIManager: handler должен быть функцией, получен:', typeof handler, 'для действия:', actions[index]);
                    }
                }
            });
        }
        
        return element;
    }
    
    /**
     * Получение контейнера уведомлений
     */
    getNotificationContainer() {
        let container = document.getElementById('notificationContainer');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationContainer';
            container.className = 'fixed top-4 right-4 z-50 max-w-md';
            document.body.appendChild(container);
        }
        
        return container;
    }
    
    /**
     * Скрытие уведомления
     */
    hideNotification(notificationId) {
        const notification = this.uiState.notifications.find(n => n.id === notificationId);
        if (!notification) return;
        
        // Удаляем элемент из DOM
        if (notification.element && notification.element.parentNode) {
            notification.element.parentNode.removeChild(notification.element);
        }
        
        // Удаляем из состояния
        this.uiState.notifications = this.uiState.notifications.filter(n => n.id !== notificationId);
        
        // Уведомляем о скрытии
        this.eventBus.emit(CONSTANTS.EVENTS.NOTIFICATION_HIDDEN, {
            notificationId,
            timestamp: new Date()
        });
    }
    
    /**
     * Очистка всех уведомлений
     */
    clearAllNotifications() {
        this.uiState.notifications.forEach(notification => {
            if (notification.element && notification.element.parentNode) {
                notification.element.parentNode.removeChild(notification.element);
            }
        });
        
        this.uiState.notifications = [];
    }
    
    /**
     * Инициализация UI элементов
     */
    initializeUIElements() {
        // Инициализация SlimSelect для фильтров
        this.initializeSlimSelects();
        
        // Инициализация tooltips
        this.initializeTooltips();
        
        // Инициализация сортируемых элементов
        this.initializeSortables();
    }
    
    /**
     * Инициализация SlimSelect
     */
    initializeSlimSelects() {
        const slimSelects = document.querySelectorAll('.slim-select');
        slimSelects.forEach(select => {
            if (!select.slimSelect) {
                try {
                    select.slimSelect = new SlimSelect({
                        select: select,
                        settings: {
                            searchPlaceholder: 'Поиск...',
                            searchText: 'Нет результатов',
                            searchHighlight: true,
                            closeOnSelect: select.multiple ? false : true
                        }
                    });
                } catch (error) {
                    console.error('Error initializing SlimSelect:', error);
                }
            }
        });
    }
    
    /**
     * Инициализация tooltips
     */
    initializeTooltips() {
        const tooltips = document.querySelectorAll('[data-tooltip]');
        tooltips.forEach(element => {
            if (!element.tooltip) {
                element.tooltip = new Tooltip(element, {
                    title: element.getAttribute('data-tooltip'),
                    placement: element.getAttribute('data-tooltip-placement') || 'top'
                });
            }
        });
    }
    
    /**
     * Инициализация сортируемых элементов
     */
    initializeSortables() {
        const sortables = document.querySelectorAll('.sortable');
        sortables.forEach(element => {
            if (!element.sortable) {
                try {
                    element.sortable = new Sortable(element, {
                        animation: 150,
                        ghostClass: 'sortable-ghost',
                        chosenClass: 'sortable-chosen',
                        dragClass: 'sortable-drag',
                        onEnd: (evt) => {
                            // Уведомляем о перемещении
                            this.eventBus.emit(CONSTANTS.EVENTS.SORTABLE_CHANGED, {
                                element: element,
                                oldIndex: evt.oldIndex,
                                newIndex: evt.newIndex,
                                timestamp: new Date()
                            });
                        }
                    });
                } catch (error) {
                    console.error('Error initializing Sortable:', error);
                }
            }
        });
    }
    
    /**
     * Обработка изменения размера окна
     */
    onWindowResize() {
        // Пересчитываем размеры таблиц
        if (window.DataTable && window.$) {
            const tables = document.querySelectorAll('.dataTable');
            tables.forEach(table => {
                try {
                    const $table = window.$(table);
                    if ($table.length && $table.DataTable) {
                        const dt = $table.DataTable();
                        if (dt) {
                            dt.columns.adjust();
                        }
                    }
                } catch (error) {
                    // Игнорируем ошибки для таблиц, которые не инициализированы
                }
            });
        }
        
        // Пересчитываем размеры графиков
        if (window.ApexCharts) {
            const charts = document.querySelectorAll('.apexcharts-canvas');
            charts.forEach(chart => {
                const chartInstance = chart._chartInstance;
                if (chartInstance) {
                    chartInstance.resize();
                }
            });
        }
        
        // Уведомляем о изменении размера
        this.eventBus.emit(CONSTANTS.EVENTS.WINDOW_RESIZED, {
            width: window.innerWidth,
            height: window.innerHeight,
            timestamp: new Date()
        });
    }
    
    /**
     * Обработка глобальных ошибок
     */
    handleGlobalError(error) {
        console.error('Global error:', error);
        
        // Показываем уведомление об ошибке
        this.showNotification({
            type: 'error',
            message: 'Произошла ошибка: ' + (error.message || 'Неизвестная ошибка'),
            duration: 10000,
            actions: [
                {
                    text: 'Перезагрузить',
                    handler: 'location.reload()'
                }
            ]
        });
        
        // Уведомляем о глобальной ошибке
        this.eventBus.emit(CONSTANTS.EVENTS.GLOBAL_ERROR, {
            error,
            timestamp: new Date()
        });
    }
    
    /**
     * Установка темы интерфейса
     */
    setTheme(theme) {
        const validThemes = ['light', 'dark', 'auto'];
        if (!validThemes.includes(theme)) {
            theme = 'light';
        }
        
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ui-theme', theme);
        
        // Уведомляем о изменении темы
        this.eventBus.emit(CONSTANTS.EVENTS.THEME_CHANGED, {
            theme,
            timestamp: new Date()
        });
    }
    
    /**
     * Получение текущей темы
     */
    getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }
    
    /**
     * Обновление прогресса операции
     */
    updateProgress(operation, percentage, message = '') {
        const progressBar = document.getElementById(`${operation}ProgressBar`);
        const progressMessage = document.getElementById(`${operation}ProgressMessage`);
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);
        }
        
        if (progressMessage) {
            progressMessage.textContent = message;
        }
        
        // Уведомляем об обновлении прогресса
        this.eventBus.emit(CONSTANTS.EVENTS.PROGRESS_UPDATED, {
            operation,
            percentage,
            message,
            timestamp: new Date()
        });
    }
    
    /**
     * Показ/скрытие элементов по условию
     */
    toggleElementsByCondition(selector, condition) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.style.display = condition ? 'block' : 'none';
        });
    }
    
    /**
     * Активация/деактивация элементов
     */
    toggleElementsState(selector, enabled) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.disabled = !enabled;
            if (enabled) {
                element.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                element.classList.add('opacity-50', 'cursor-not-allowed');
            }
        });
    }
    
    /**
     * Получение текущего состояния UI
     */
    getUIState() {
        return {
            panels: { ...this.uiState.panels },
            modals: { ...this.uiState.modals },
            loading: { ...this.uiState.loading },
            notifications: this.uiState.notifications.length,
            theme: this.getTheme()
        };
    }
    
    /**
     * Сброс состояния UI
     */
    resetUIState() {
        // Закрываем все модальные окна
        this.closeAllModals();
        
        // Очищаем все уведомления
        this.clearAllNotifications();
        
        // Сбрасываем состояние загрузки
        Object.keys(this.uiState.loading).forEach(key => {
            this.uiState.loading[key] = false;
        });
        
        // Обновляем UI
        this.updateLoadingIndicators();
        
        // Уведомляем о сбросе
        this.eventBus.emit(CONSTANTS.EVENTS.UI_STATE_RESET, {
            timestamp: new Date()
        });
    }
    
    /**
     * Сохранение состояния UI
     */
    saveUIState() {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) return;
        
        const stateToSave = {
            panels: this.uiState.panels,
            theme: this.getTheme()
        };
        
        localStorage.setItem(`ui-state_${currentArea.id}`, JSON.stringify(stateToSave));
    }
    
    /**
     * Восстановление состояния UI
     */
    restoreUIState() {
        const currentArea = this.dataState.getState('currentArea');
        
        if (!currentArea) {
            console.warn('⚠️ UIManager: Область не найдена в dataState для восстановления UI');
            return null;
        }
        
        const stateKey = `ui-state_${currentArea.id}`;
        const savedState = localStorage.getItem(stateKey);
        
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                
                // Общее состояние UI восстановлено (панели управляются отдельно)
                
                // Восстанавливаем тему
                if (state.theme) {
                    this.setTheme(state.theme);
                }
                
                return state;
                
            } catch (error) {
                console.error('❌ UIManager: Ошибка восстановления общего состояния UI:', error);
                return null;
            }
        } else {
            return null;
        }
    }
    
    /**
     * Получение объявлений в области (используем уже отфильтрованные из DataState)
     */

    async getListingsInArea(area) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            // Используем уже отфильтрованные объявления из DataState (как делает карта)
            const filteredListings = this.dataState.getState('listings') || [];
            
            if (debugEnabled) {
            }
            
            return filteredListings;
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка получения объявлений из DataState:', error);
            return [];
        }
    }
    
    /**
     * Обновление графика источников объявлений
     */
    async updateSourcesChart() {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            if (!this.dataState.currentArea) {
                if (debugEnabled) {
                }
                return;
            }
            
            // Получаем объявления в области (используем тот же метод что и в старой версии)
            const currentArea = this.dataState.currentArea;
            
            if (debugEnabled) {
            }
            
            const listings = await this.getListingsInArea(currentArea);
            
            if (debugEnabled) {
                if (listings.length > 0) {
                }
            }
            
            if (listings.length === 0) {
                this.renderSourcesChart([], []);
                this.updateSourcesTable([]);
                return;
            }
            
            // Подсчитываем объявления по источникам (логика из старой версии)
            const sourceCounts = {};
            const sourceNames = {
                'avito.ru': 'Avito',
                'avito': 'Avito',
                'cian.ru': 'Cian',
                'cian': 'Cian',
                'yandex.ru': 'Яндекс.Недвижимость',
                'yandex': 'Яндекс.Недвижимость',
                'domclick.ru': 'Domclick',
                'domclick': 'Domclick',
                'inpars': 'Inpars (агрегатор)',
                'manual': 'Вручную',
                'unknown': 'Неизвестно'
            };

            listings.forEach((listing, index) => {
                // Определяем источник с приоритетом оригинального источника
                let displaySource = 'unknown';
                
                if (listing.source_metadata && listing.source_metadata.original_source) {
                    displaySource = listing.source_metadata.original_source;
                } else if (listing.source) {
                    displaySource = listing.source;
                }
                
                // Группируем однотипные источники
                if (displaySource.includes('avito')) {
                    displaySource = 'avito';
                } else if (displaySource.includes('cian')) {
                    displaySource = 'cian';
                } else if (displaySource.includes('yandex')) {
                    displaySource = 'yandex';
                } else if (displaySource.includes('domclick')) {
                    displaySource = 'domclick';
                }
                
                // Используем читаемое название или оставляем как есть
                const finalSourceName = sourceNames[displaySource] || displaySource;
                sourceCounts[finalSourceName] = (sourceCounts[finalSourceName] || 0) + 1;
            });
            
            if (debugEnabled) {
            }
            
            // Подготавливаем данные для графика
            const chartData = [];
            const tableData = [];
            const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
            let colorIndex = 0;
            
            Object.entries(sourceCounts).forEach(([source, count]) => {
                const percentage = ((count / listings.length) * 100).toFixed(1);
                
                chartData.push({
                    name: source,
                    data: count
                });
                
                tableData.push({
                    source: source,
                    count: count,
                    percentage: percentage,
                    color: colors[colorIndex % colors.length]
                });
                
                colorIndex++;
            });
            
            if (debugEnabled) {
            }
            
            // Создаем/обновляем график
            await this.renderSourcesChart(chartData, colors);
            
            // Обновляем таблицу
            this.updateSourcesTable(tableData);
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка обновления графика источников:', error);
        }
    }
    
    /**
     * Отрисовка графика источников
     */
    async renderSourcesChart(data, colors) {
        const chartElement = document.getElementById('sourcesChart');
        if (!chartElement) {
            console.error('❌ UIManager: Элемент sourcesChart не найден в DOM');
            return;
        }
        
        
        // Если график уже существует, уничтожаем его
        if (this.sourcesChartInstance) {
            try {
                this.sourcesChartInstance.destroy();
                this.sourcesChartInstance = null;
            } catch (error) {
                console.warn('⚠️ UIManager: Ошибка уничтожения предыдущего графика источников:', error);
                this.sourcesChartInstance = null;
            }
        }
        
        // Очищаем содержимое элемента (убираем заглушки)
        chartElement.innerHTML = '';
        
        if (data.length === 0) {
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
            return;
        }
        
        const options = {
            series: data.map(item => item.data),
            chart: {
                type: 'pie',
                height: 320,
                toolbar: {
                    show: false
                }
            },
            labels: data.map(item => item.name),
            colors: colors,
            legend: {
                position: 'bottom',
                horizontalAlign: 'center'
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '45%'
                    }
                }
            },
            dataLabels: {
                enabled: true,
                formatter: function(val, opts) {
                    return Math.round(val) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + ' объявлений';
                    }
                }
            },
            responsive: [{
                breakpoint: 480,
                options: {
                    chart: {
                        height: 300
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }]
        };
        
        // Проверяем доступность ApexCharts
        if (typeof ApexCharts === 'undefined') {
            console.error('❌ UIManager: ApexCharts не загружен');
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">ApexCharts не загружен</div>';
            return;
        }

        try {
            this.sourcesChartInstance = new ApexCharts(chartElement, options);
            await this.sourcesChartInstance.render();
        } catch (error) {
            console.error('❌ UIManager: Ошибка создания/рендеринга графика источников:', error);
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка создания графика источников</div>';
            this.sourcesChartInstance = null;
        }
    }
    
    /**
     * Обновление таблицы источников
     */
    updateSourcesTable(data) {
        const tableElement = document.getElementById('sourcesTable');
        if (!tableElement) return;
        
        if (data.length === 0) {
            tableElement.innerHTML = '<div class="flex justify-between text-sm"><span class="text-gray-600">Нет данных для отображения</span></div>';
            return;
        }
        
        const tableHTML = data.map(item => `
            <div class="flex justify-between items-center text-sm">
                <div class="flex items-center space-x-2">
                    <div class="w-3 h-3 rounded-full" style="background-color: ${item.color}"></div>
                    <span class="text-gray-900">${item.source}</span>
                </div>
                <div class="text-right">
                    <div class="text-gray-900 font-medium">${item.count.toLocaleString()}</div>
                    <div class="text-gray-500 text-xs">${item.percentage}%</div>
                </div>
            </div>
        `).join('');
        
        tableElement.innerHTML = tableHTML;
    }
    
    /**
     * Обновление графиков аналитики адресов
     */
    async updateAddressAnalyticsCharts() {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            if (!this.dataState.currentArea) {
                if (debugEnabled) {
                }
                return;
            }
            
            const areaId = this.dataState.currentArea.id;
            
            // Получаем все адреса в полигоне области (статистика области - без фильтров сегментов)
            const addresses = await window.db.getAddressesInMapArea(areaId);
            
            if (debugEnabled) {
            }
            
            // Обновляем график точности определения
            this.renderAddressConfidenceChart(addresses);
            
            // Обновляем график методов определения  
            this.renderAddressMethodsChart(addresses);
            
            // Обновляем статистику
            this.updateAddressStatsTable(addresses);
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка обновления графиков адресов:', error);
        }
    }
    
    /**
     * Отрисовка графика точности определения адресов
     */
    renderAddressConfidenceChart(addresses) {
        const chartElement = document.getElementById('addressConfidenceChart');
        if (!chartElement) return;
        
        if (this.addressConfidenceChartInstance) {
            this.addressConfidenceChartInstance.destroy();
        }
        
        if (addresses.length === 0) {
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
            return;
        }
        
        // Подсчитываем адреса по уровню точности
        const confidenceCounts = {
            'Высокая': 0,
            'Средняя': 0,
            'Низкая': 0,
            'Неопределена': 0
        };
        
        addresses.forEach(address => {
            const confidence = address.geocoding_confidence || 0;
            if (confidence >= 0.8) {
                confidenceCounts['Высокая']++;
            } else if (confidence >= 0.5) {
                confidenceCounts['Средняя']++;
            } else if (confidence > 0) {
                confidenceCounts['Низкая']++;
            } else {
                confidenceCounts['Неопределена']++;
            }
        });
        
        const data = Object.entries(confidenceCounts)
            .filter(([key, value]) => value > 0)
            .map(([key, value]) => ({ name: key, data: value }));
            
        const colors = ['#10B981', '#F59E0B', '#EF4444', '#6B7280'];
        
        const options = {
            series: data.map(item => item.data),
            chart: {
                type: 'donut',
                height: 250,
                toolbar: { show: false }
            },
            labels: data.map(item => item.name),
            colors: colors,
            legend: {
                position: 'bottom',
                fontSize: '12px'
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) {
                    return Math.round(val) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + ' адресов';
                    }
                }
            }
        };
        
        if (typeof ApexCharts === 'undefined') {
            console.error('❌ UIManager: ApexCharts не загружен');
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">ApexCharts не загружен</div>';
            return;
        }

        try {
            this.addressConfidenceChartInstance = new ApexCharts(chartElement, options);
            this.addressConfidenceChartInstance.render().catch(error => {
                console.error('❌ UIManager: Ошибка рендеринга графика точности адресов:', error);
                chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки графика</div>';
            });
        } catch (error) {
            console.error('❌ UIManager: Ошибка создания графика точности адресов:', error);
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка создания графика</div>';
        }
    }
    
    /**
     * Отрисовка графика методов определения адресов
     */
    renderAddressMethodsChart(addresses) {
        const chartElement = document.getElementById('addressMethodsChart');
        if (!chartElement) return;
        
        if (this.addressMethodsChartInstance) {
            this.addressMethodsChartInstance.destroy();
        }
        
        if (addresses.length === 0) {
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Нет данных для отображения</div>';
            return;
        }
        
        // Подсчитываем адреса по методам определения
        const methodCounts = {};
        addresses.forEach(address => {
            const method = address.geocoding_method || 'Неизвестно';
            methodCounts[method] = (methodCounts[method] || 0) + 1;
        });
        
        const data = Object.entries(methodCounts).map(([key, value]) => ({ name: key, data: value }));
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        
        const options = {
            series: data.map(item => item.data),
            chart: {
                type: 'pie',
                height: 250,
                toolbar: { show: false }
            },
            labels: data.map(item => item.name),
            colors: colors,
            legend: {
                position: 'bottom',
                fontSize: '12px'
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) {
                    return Math.round(val) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return val + ' адресов';
                    }
                }
            }
        };
        
        if (typeof ApexCharts === 'undefined') {
            console.error('❌ UIManager: ApexCharts не загружен');
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">ApexCharts не загружен</div>';
            return;
        }

        try {
            this.addressMethodsChartInstance = new ApexCharts(chartElement, options);
            this.addressMethodsChartInstance.render().catch(error => {
                console.error('❌ UIManager: Ошибка рендеринга графика методов адресов:', error);
                chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки графика</div>';
            });
        } catch (error) {
            console.error('❌ UIManager: Ошибка создания графика методов адресов:', error);
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка создания графика</div>';
        }
    }
    
    /**
     * Обновление таблицы статистики адресов
     */
    updateAddressStatsTable(addresses) {
        const tableElement = document.getElementById('addressStatsTable');
        if (!tableElement) return;
        
        if (addresses.length === 0) {
            tableElement.innerHTML = '<div class="flex justify-between text-sm"><span class="text-gray-600">Нет данных для отображения</span></div>';
            return;
        }
        
        // Подсчитываем статистику
        const total = addresses.length;
        const withCoordinates = addresses.filter(a => a.latitude && a.longitude).length;
        const highConfidence = addresses.filter(a => (a.geocoding_confidence || 0) >= 0.8).length;
        const avgConfidence = addresses.reduce((sum, a) => sum + (a.geocoding_confidence || 0), 0) / total;
        
        const statsHTML = `
            <div class="space-y-3">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Всего адресов:</span>
                    <span class="text-gray-900 font-medium">${total.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">С координатами:</span>
                    <span class="text-gray-900 font-medium">${withCoordinates.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Высокая точность:</span>
                    <span class="text-gray-900 font-medium">${highConfidence.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Средняя точность:</span>
                    <span class="text-gray-900 font-medium">${(avgConfidence * 100).toFixed(1)}%</span>
                </div>
            </div>
        `;
        
        tableElement.innerHTML = statsHTML;
    }

    /**
     * Уничтожение менеджера UI
     */
    destroy() {
        // Уничтожаем графики статистики
        if (this.sourcesChartInstance) {
            this.sourcesChartInstance.destroy();
            this.sourcesChartInstance = null;
        }
        if (this.addressConfidenceChartInstance) {
            this.addressConfidenceChartInstance.destroy();
            this.addressConfidenceChartInstance = null;
        }
        if (this.addressMethodsChartInstance) {
            this.addressMethodsChartInstance.destroy();
            this.addressMethodsChartInstance = null;
        }
        
        // Уничтожаем SlimSelect экземпляры
        this.destroySlimSelects();
        
        // Очищаем все уведомления
        this.clearAllNotifications();
    }
    
    /**
     * Уничтожение всех SlimSelect экземпляров UIManager
     */
    destroySlimSelects() {
        // Уничтожаем SlimSelect для статуса объявлений и адресов
        Object.keys(this).forEach(key => {
            if (key.startsWith('statusSlimSelect_') || key.startsWith('addressSlimSelect_')) {
                if (this[key] && typeof this[key].destroy === 'function') {
                    try {
                        this[key].destroy();
                    } catch (error) {
                        console.warn(`Ошибка при уничтожении ${key}:`, error.message);
                    }
                    delete this[key];
                }
            }
        });
        
        // Очищаем обработчики событий
        if (this.eventBus) {
            this.eventBus.offAll(CONSTANTS.EVENTS.AREA_LOADED);
            this.eventBus.offAll(CONSTANTS.EVENTS.LOADING_STARTED);
            this.eventBus.offAll(CONSTANTS.EVENTS.LOADING_FINISHED);
            this.eventBus.offAll(CONSTANTS.EVENTS.NOTIFICATION_SHOW);
        }
        
        // Очищаем слушатели панелей
        Object.keys(this.panelConfig).forEach(panelName => {
            const config = this.panelConfig[panelName];
            
            const header = document.getElementById(config.header);
            if (header) {
                header.removeEventListener('click', () => this.togglePanel(panelName));
            }
            
            const checkbox = document.getElementById(config.checkbox);
            if (checkbox) {
                checkbox.removeEventListener('change', (e) => this.togglePanelVisibility(panelName, e.target.checked));
            }
        });
        
        // Очищаем глобальные слушатели
        window.removeEventListener('resize', this.onWindowResize);
        window.removeEventListener('error', this.handleGlobalError);
        window.removeEventListener('unhandledrejection', this.handleGlobalError);
        
        // Сбрасываем состояние
        this.resetUIState();
    }
    
    /**
     * Обновление статистики области
     */
    async updateAreaStatistics() {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            if (!this.dataState.currentArea) {
                console.warn('UIManager: Нет данных области для обновления статистики');
                return;
            }
            
            const areaId = this.dataState.currentArea.id;
            const currentArea = this.dataState.currentArea;
            
            // Загружаем статистику из базы данных
            const allAddresses = await window.dataCacheManager.getAll('addresses');
            const addresses = allAddresses.filter(address => address.map_area_id === areaId);
            
            // Получаем объявления через адреса (связанные объявления)
            let addressLinkedListingsCount = 0;
            if (addresses.length > 0) {
                const addressIds = addresses.map(addr => addr.id);
                const listingsPromises = addressIds.map(id => window.db.getListingsByAddress(id));
                const listingsArrays = await Promise.all(listingsPromises);
                addressLinkedListingsCount = listingsArrays.flat().length;
            }
            
            // Получаем объявления из DataState (уже отфильтрованные AddressManager)
            const filteredListings = this.dataState.getState('listings') || [];
            let totalListingsCount = Math.max(addressLinkedListingsCount, filteredListings.length);
            
            // Всегда выводим отладочную информацию для диагностики
            
            if (debugEnabled) {
            }
            
            // Получаем сегменты
            const allSegments = await window.dataCacheManager.getAll('segments').catch(() => []);
            const segments = allSegments.filter(segment => segment.map_area_id === areaId);
            
            // Вычисляем площадь области
            let areaSize = segments?.length || 0;
            if (currentArea.polygon && currentArea.polygon.length >= 3) {
                try {
                    const geoUtils = window.geoUtils || new GeoUtils();
                    
                    // Используем правильный расчет площади для географических координат
                    if (typeof geoUtils.calculatePolygonArea === 'function') {
                        // Если есть специальный метод для расчета площади
                        const areaInSqMeters = geoUtils.calculatePolygonArea(currentArea.polygon);
                        const areaInSqKm = areaInSqMeters / 1000000; // переводим в км²
                        areaSize = `≈ ${areaInSqKm.toFixed(3)} км²`;
                    } else {
                        // Используем алгоритм сферической площади (более точный для географических координат)
                        const areaInSqMeters = calculateSphericalArea(currentArea.polygon);
                        const areaInSqKm = areaInSqMeters / 1000000; // переводим в км²
                        areaSize = `≈ ${areaInSqKm.toFixed(3)} км²`;
                    }
                } catch (error) {
                    console.error('❌ UIManager: Ошибка вычисления площади:', error);
                    areaSize = segments?.length || 0;
                }
            }
            
            /**
             * Вычисление площади полигона на сфере (алгоритм для географических координат)
             */
            function calculateSphericalArea(polygon) {
                const EARTH_RADIUS = 6378137; // радиус Земли в метрах
                
                if (polygon.length < 3) return 0;
                
                let area = 0;
                const coords = polygon.map(point => [
                    point.lng * Math.PI / 180, // долгота в радианах
                    point.lat * Math.PI / 180  // широта в радианах
                ]);
                
                for (let i = 0; i < coords.length; i++) {
                    const j = (i + 1) % coords.length;
                    area += (coords[j][0] - coords[i][0]) * (2 + Math.sin(coords[i][1]) + Math.sin(coords[j][1]));
                }
                
                area = Math.abs(area) * EARTH_RADIUS * EARTH_RADIUS / 2;
                return area; // площадь в квадратных метрах
            }
            
            // Получаем объекты недвижимости через адреса
            let objectsCount = 0;
            if (addresses.length > 0) {
                try {
                    const addressIds = addresses.map(addr => addr.id);
                    const objectsPromises = addressIds.map(id => window.db.getObjectsByAddress(id));
                    const objectsArrays = await Promise.all(objectsPromises);
                    objectsCount = objectsArrays.flat().length;
                } catch (error) {
                    if (debugEnabled) {
                    }
                    objectsCount = 0;
                }
            }
            
            // Обновляем счетчики в интерфейсе
            this.updateStatisticsCounters({
                segments: areaSize,
                addresses: addresses?.length || 0,
                objects: objectsCount,
                listings: totalListingsCount
            });
            
            if (debugEnabled) {
                console.log('📊 Статистика области:', {
                    areaSize,
                    addresses: addresses?.length || 0,
                    objects: objectsCount,
                    listings: totalListingsCount,
                    addressLinkedListings: addressLinkedListingsCount
                });
            }
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка обновления статистики области:', error);
        }
    }
    
    /**
     * Обновление счетчиков в панели статистики
     */
    updateStatisticsCounters({ segments, addresses, objects, listings }) {
        const counters = [
            { id: 'segmentsCount', value: segments },
            { id: 'addressesCount', value: addresses },
            { id: 'objectsCount', value: objects },
            { id: 'listingsCount', value: listings }
        ];
        
        counters.forEach(({ id, value }) => {
            const element = document.getElementById(id);
            if (element) {
                // Для площади может быть строка (например "≈ 1.234 км²")
                if (typeof value === 'string') {
                    element.textContent = value;
                } else {
                    element.textContent = (value || 0).toLocaleString();
                }
            } else {
                console.warn(`UIManager: Элемент ${id} не найден в DOM`);
            }
        });
    }
    
    /**
     * Переключение табов в панели работы с данными
     */
    switchDataWorkTab(tabId) {
        const navItems = document.querySelectorAll('.data-nav-item');
        const contentTabs = document.querySelectorAll('.data-content-tab');
        
        // Убираем активный класс со всех элементов навигации
        navItems.forEach(nav => {
            nav.classList.remove('bg-indigo-50', 'text-indigo-600');
            nav.classList.add('text-gray-700', 'hover:bg-gray-50', 'hover:text-indigo-600');
        });
        
        // Скрываем все табы контента
        contentTabs.forEach(tab => {
            tab.classList.add('hidden');
        });
        
        // Активируем нужную вкладку
        const activeNavItem = document.querySelector(`[data-tab="${tabId}"]`);
        const activeContentTab = document.getElementById(`content-${tabId}`);
        
        if (activeNavItem && activeContentTab) {
            // Активируем элемент навигации
            activeNavItem.classList.remove('text-gray-700', 'hover:bg-gray-50', 'hover:text-indigo-600');
            activeNavItem.classList.add('bg-indigo-50', 'text-indigo-600');
            
            // Показываем активный таб
            activeContentTab.classList.remove('hidden');
            
            // Сохраняем выбранный таб
            localStorage.setItem('dataWorkActiveTab', tabId);
            
        } else {
            console.warn(`UIManager: Не найдены элементы для таба "${tabId}"`);
        }
    }
    
    /**
     * Инициализация табов панели работы с данными
     */
    initDataWorkTabs() {
        // Навигация по табам в панели работы с данными
        document.querySelectorAll('.data-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = item.getAttribute('data-tab');
                if (tabId) {
                    this.switchDataWorkTab(tabId);
                }
            });
        });
        
        // Восстанавливаем активный таб
        const activeTab = localStorage.getItem('dataWorkActiveTab') || 'import-addresses';
        this.switchDataWorkTab(activeTab);
        
    }
    
    /**
     * Восстановление состояния панели работы с данными
     */
    restoreDataWorkPanelState() {
        const content = document.getElementById('dataWorkPanelContent');
        const chevron = document.getElementById('dataWorkPanelChevron');
        
        // Восстанавливаем состояние сворачивания панели
        const isCollapsed = localStorage.getItem('dataWorkPanelCollapsed');
        const shouldCollapse = isCollapsed === null || isCollapsed === 'true';
        
        if (content && chevron) {
            if (shouldCollapse) {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(-90deg)';
            } else {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(0deg)';
            }
        }
        
        // Восстанавливаем активный таб
        const activeTab = localStorage.getItem('dataWorkActiveTab') || 'import-addresses';
        this.switchDataWorkTab(activeTab);
    }
    
    // ========================================
    // HELPER METHODS FROM OLD VERSION
    // ========================================
    
    /**
     * HTML escaping
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Price formatting
     */
    formatPrice(price) {
        if (!price || price === 0) return '₽0';
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(price);
    }
    
    /**
     * Listing status text
     */
    getStatusText(status) {
        const statusMap = {
            'active': 'Активное',
            'archived': 'Архивное',
            'sold': 'Продано',
            'withdrawn': 'Снято с продажи'
        };
        return statusMap[status] || status;
    }
    
    /**
     * Property type formatting
     */
    formatPropertyType(type) {
        const types = {
            'studio': 'Студия',
            '1k': '1к',
            '2k': '2к', 
            '3k': '3к',
            '4k+': '4к+',
            'house': 'Дом',
            'land': 'Участок',
            'commercial': 'Коммерческая'
        };
        return types[type] || type || '-';
    }
    
    /**
     * Date formatting
     */
    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    /**
     * Address accuracy display
     */
    renderAddressAccuracyInfo(listing) {
        // Всегда показываем поля в одинаковом порядке для консистентности
        let html = '';
        
        // 1. Адрес из объявления (всегда первым)
        html += `
            <div class="mb-2">
                <span class="text-sm font-medium text-gray-500">Адрес из объявления:</span>
                <span class="text-sm text-gray-600 ml-2">${this.escapeHtml(listing.address || 'Не указан')}</span>
            </div>
        `;
        
        // 2. Определение адреса (всегда вторым)
        if (listing.address_id) {
            // Адрес определён
            html += `
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Определённый адрес:</span>
                    <div class="mt-1 flex items-center space-x-2">
                        <select id="addressSelect_${listing.id}" class="text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">-- Выберите адрес --</option>
                        </select>
                        <button id="saveAddress_${listing.id}" class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            Сохранить
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Адрес не определён
            html += `
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Определить адрес:</span>
                    <div class="mt-1 flex items-center space-x-2">
                        <select id="addressSelect_${listing.id}" class="text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">-- Выберите адрес --</option>
                        </select>
                        <button id="saveAddress_${listing.id}" class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                            Сохранить
                        </button>
                    </div>
                </div>
            `;
        }
        
        // 3. Информация о точности/статусе (всегда третьим)
        if (listing.address_id) {
            if (listing.address_match_confidence) {
                const confidence = this.getAddressConfidenceText(listing.address_match_confidence);
                const method = this.getAddressMethodText(listing.address_match_method);
                const distance = listing.address_distance ? ` (${Math.round(listing.address_distance)}м)` : '';
                const score = listing.address_match_score ? ` • Оценка: ${(listing.address_match_score * 100).toFixed(0)}%` : '';
                
                const addressButtons = `
                    <div class="ml-2 space-x-2">
                        <button id="correctAddressModal_${listing.id}" class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                            ✅ Верный адрес
                        </button>
                        <button id="incorrectAddressModal_${listing.id}" class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500">
                            ❌ Неверный адрес
                        </button>
                    </div>
                `;
                
                html += `
                    <div class="mb-2">
                        <span class="text-sm font-medium text-gray-500">Точность:</span>
                        <span class="text-sm ${this.getConfidenceColor(listing.address_match_confidence)} ml-2">${confidence}${distance}</span>
                        ${addressButtons}
                    </div>
                    <div class="mb-2">
                        <span class="text-xs text-gray-500">Метод: ${method}${score}</span>
                    </div>
                `;
            } else {
                html += `
                    <div class="mb-2">
                        <span class="text-sm font-medium text-gray-500">Точность:</span>
                        <span class="text-sm text-green-600 ml-2">Адрес определён</span>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Статус:</span>
                    <span class="text-sm text-orange-600 ml-2">Адрес не определён</span>
                </div>
                <div class="mb-2">
                    <span class="text-xs text-gray-500">Требуется обработка для определения адреса</span>
                </div>
            `;
        }
        
        // 4. Координаты (всегда последними)
        const coords = this.getListingCoordinates(listing);
        const coordinatesInfo = listing.address_id ? 
            'Используются координаты определённого адреса' : 
            'Используются координаты из объявления';
            
        if (coords) {
            html += `
                <div class="mb-2">
                    <span class="text-sm font-medium text-gray-500">Координаты:</span>
                    <span class="text-sm text-gray-700 ml-2">${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</span>
                    <span class="text-xs text-gray-500 block">${coordinatesInfo}</span>
                </div>
            `;
        } else {
            html += `
                <div class="mb-2">
                    <span class="text-sm text-red-600">⚠️ Координаты не найдены</span>
                </div>
            `;
        }

        return html;
    }
    
    /**
     * Address status CSS classes
     */
    getAddressStatusClass(listing) {
        if (listing.address_id) {
            if (listing.address_match_confidence) {
                return this.getConfidenceColor(listing.address_match_confidence);
            } else {
                return 'text-green-600';
            }
        } else {
            return 'text-orange-600';
        }
    }
    
    /**
     * Address status text
     */
    getAddressStatusText(listing) {
        if (listing.address_id) {
            if (listing.address_match_confidence) {
                const confidence = this.getAddressConfidenceText(listing.address_match_confidence);
                const distance = listing.address_distance ? ` (${Math.round(listing.address_distance)}м)` : '';
                return `${confidence}${distance}`;
            } else {
                return 'Определён';
            }
        } else {
            return 'Не определён';
        }
    }
    
    /**
     * Get address name by ID
     */
    getAddressNameById(addressId) {
        if (!addressId || !this.addresses || !Array.isArray(this.addresses)) return '';
        const address = this.addresses.find(addr => addr.id === addressId);
        return address ? address.address : '';
    }
    
    /**
     * Address confidence text
     */
    getAddressConfidenceText(confidence) {
        const confidenceMap = {
            'high': 'Высокая',
            'medium': 'Средняя', 
            'low': 'Низкая',
            'very_low': 'Очень низкая',
            'manual': 'Вручную',
            'none': 'Не определена'
        };
        return confidenceMap[confidence] || confidence;
    }
    
    /**
     * Confidence color mapping
     */
    getConfidenceColor(confidence) {
        const colorMap = {
            'high': 'text-green-600',
            'medium': 'text-yellow-600',
            'low': 'text-orange-600', 
            'very_low': 'text-red-600',
            'none': 'text-gray-500'
        };
        return colorMap[confidence] || 'text-gray-500';
    }
    
    /**
     * Address method text
     */
    getAddressMethodText(method) {
        const methodMap = {
            'exact_geo': 'Точное совпадение по координатам',
            'near_geo_text': 'Поиск рядом + анализ текста',
            'extended_geo_text': 'Расширенный поиск + анализ текста',
            'global_text': 'Глобальный поиск по тексту',
            'manual': 'Вручную',
            'manual_selection': 'Ручной выбор',
            'no_match': 'Совпадения не найдены'
        };
        return methodMap[method] || method || 'Неизвестно';
    }
    
    /**
     * Get listing coordinates
     */
    getListingCoordinates(listing) {
        // Сначала пытаемся получить координаты из связанного адреса
        if (listing.address_id) {
            const address = this.addresses.find(addr => addr.id === listing.address_id);
            if (address && address.coordinates && address.coordinates.lat && address.coordinates.lng) {
                return {
                    lat: parseFloat(address.coordinates.lat),
                    lng: parseFloat(address.coordinates.lng)
                };
            }
        }

        // Если не найдены, используем координаты из объявления
        if (listing.coordinates) {
            // Учитываем разные форматы координат
            const lat = listing.coordinates.lat || listing.coordinates.lon;
            const lng = listing.coordinates.lng || listing.coordinates.lon;
            
            if (lat && lng) {
                return { 
                    lat: parseFloat(lat), 
                    lng: parseFloat(lng) 
                };
            }
        }

        return null;
    }
    
    // ========================================
    // ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ИЗ СТАРОЙ ВЕРСИИ
    // ========================================
    
    /**
     * Подготовка данных для таблицы истории цен
     */
    preparePriceHistoryTableData(listing) {
        const data = [];
        let index = 0;

        // Добавляем только историю изменений цен (без текущей цены)
        if (listing.price_history && Array.isArray(listing.price_history)) {
            listing.price_history.forEach(historyItem => {
                // Поддерживаем разные форматы: new_price (Avito) и price (Inpars)
                const price = historyItem.new_price || historyItem.price;
                if (historyItem.date && price) {
                    data.push({
                        date: historyItem.date,
                        price: price,
                        index: index++,
                        isCurrent: false
                    });
                }
            });
        }

        return data;
    }
    
    /**
     * Обновление таблицы истории цен
     */
    async refreshPriceHistoryTable(listingId, listing) {
        try {
            const dataTable = this[`priceHistoryTable_${listingId}`];
            if (dataTable) {
                const newData = this.preparePriceHistoryTableData(listing);
                dataTable.clear().rows.add(newData).draw();
            }
        } catch (error) {
            console.error('❌ Ошибка обновления таблицы истории цен:', error);
        }
    }
    
    /**
     * Редактирование записи цены
     */
    async editPriceEntry(listingId, index) {
        try {
            // Получаем свежие данные объявления
            const listing = await window.db.getListing(listingId);
            if (!listing) {
                console.error('❌ Объявление не найдено:', listingId);
                return;
            }

            // Находим запись по индексу в истории цен
            if (!listing.price_history || !Array.isArray(listing.price_history) || index >= listing.price_history.length) {
                console.error('❌ Запись истории цен не найдена по индексу:', index);
                console.error('История цен:', listing.price_history);
                console.error('Индекс:', index);
                return;
            }

            const historyItem = listing.price_history[index];
            const price = historyItem.new_price || historyItem.price;
            
            console.log('Редактирование цены:', {
                price: price,
                date: historyItem.date,
                historyItem: historyItem
            });

            // Заполняем поля модального окна
            const modal = document.getElementById(`editPriceModal-${listingId}`);
            const priceInput = document.getElementById(`priceInput-${listingId}`);
            const dateInput = document.getElementById(`dateInput-${listingId}`);

            if (modal && priceInput && dateInput) {
                // Заполняем цену (форматируем для отображения)
                priceInput.value = parseInt(price).toLocaleString('ru-RU');
                
                // Заполняем дату (преобразуем в format datetime-local с учетом местного времени)
                const date = new Date(historyItem.date);
                // Корректируем смещение временной зоны для правильного отображения
                const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
                const formattedDate = localDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
                dateInput.value = formattedDate;

                // Сохраняем текущий индекс редактируемой записи
                modal.dataset.editingIndex = index;
                
                // Открываем модальное окно
                modal.classList.remove('hidden');
            }
        } catch (error) {
            console.error('❌ Ошибка редактирования записи цены:', error);
        }
    }
    
    /**
     * Удаление записи цены
     */
    async deletePriceEntry(listingId, index) {
        if (confirm('Удалить запись цены?')) {
            try {
                // Получаем свежие данные объявления
                const listing = await window.db.getListing(listingId);
                if (!listing) {
                    console.error('❌ Объявление не найдено:', listingId);
                    return;
                }

                // Проверяем что история цен существует и индекс корректный
                if (!listing.price_history || !Array.isArray(listing.price_history) || index >= listing.price_history.length) {
                    console.error('❌ Запись истории цен не найдена по индексу:', index);
                    return;
                }

                // Удаляем запись из истории цен
                listing.price_history.splice(index, 1);
                
                // Обновляем объявление в базе данных
                await window.db.updateListing(listing);
                
                // Обновляем таблицу истории цен
                await this.refreshPriceHistoryTable(listingId, listing);
                
                // Перерисовываем график
                this.renderPriceChart(listing);
                
                // Обновляем объект недвижимости, если объявление связано с объектом
                if (listing.object_id && window.realEstateObjectManager) {
                    await window.realEstateObjectManager.updateObjectOnListingChange(listingId, listing, listing);
                }
                
                
                // Показываем уведомление
                this.showNotification({
                    type: 'success',
                    message: 'Запись цены удалена',
                    duration: 3000
                });
                
            } catch (error) {
                console.error('❌ Ошибка удаления записи цены:', error);
                this.showNotification({
                    type: 'error',
                    message: 'Ошибка удаления записи цены',
                    duration: 3000
                });
            }
        }
    }
    
    /**
     * Инициализация выпадающего списка адресов
     */
    async initializeAddressSelector(listingId, currentAddressId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            const selectElement = document.getElementById(`addressSelect_${listingId}`);
            if (!selectElement) return;

            // Загружаем адреса через AddressManager
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                if (debugEnabled) {
                }
                return;
            }

            // Создаем временный AddressManager для получения адресов
            const addressManager = new AddressManager(this.dataState, this.eventBus, this.progressManager);
            const addresses = await addressManager.getAddressesInArea(currentArea.id);
            
            // Очищаем текущие опции
            selectElement.innerHTML = '<option value="">-- Выберите адрес --</option>';
            
            // Добавляем опции для каждого адреса
            addresses.forEach(address => {
                const option = document.createElement('option');
                option.value = address.id;
                option.textContent = address.address;
                
                // Выбираем текущий адрес
                if (address.id === currentAddressId) {
                    option.selected = true;
                }
                
                selectElement.appendChild(option);
            });
            
            // Инициализируем SlimSelect
            const slimSelect = new SlimSelect({
                select: selectElement,
                settings: {
                    placeholderText: '-- Выберите адрес --',
                    searchPlaceholder: 'Поиск адреса...',
                    searchText: 'Не найдено',
                    searchHighlight: true,
                    closeOnSelect: true
                }
            });
            
            // Сохраняем экземпляр SlimSelect для последующего использования
            this[`addressSlimSelect_${listingId}`] = slimSelect;
            
            if (debugEnabled) {
            }
            
        } catch (error) {
            console.error('❌ Ошибка инициализации выпадающего списка адресов:', error);
        }
    }
    
    /**
     * Инициализация панели управления (SlimSelect для статуса)
     */
    async initializeManagementPanel(listingId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            // Инициализируем SlimSelect для статуса
            const statusSelect = document.getElementById(`statusSelect-${listingId}`);
            if (statusSelect) {
                const statusSlimSelect = new SlimSelect({
                    select: statusSelect,
                    settings: {
                        showSearch: false,
                        closeOnSelect: true
                    }
                });

                // Обработчик изменения статуса
                statusSelect.addEventListener('change', (e) => {
                    this.updateListingStatus(listingId, e.target.value);
                });

                // Сохраняем экземпляр SlimSelect
                this[`statusSlimSelect_${listingId}`] = statusSlimSelect;
                
                if (debugEnabled) {
                }
            }

            // Обработчик кнопки актуализации
            const actualizeBtn = document.getElementById(`actualizeBtn-${listingId}`);
            if (actualizeBtn) {
                actualizeBtn.addEventListener('click', () => {
                    this.actualizeListing(listingId);
                });
            }

            // Обработчик кнопки удаления
            const deleteBtn = document.getElementById(`deleteBtn-${listingId}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this.deleteListing(listingId);
                });
            }

            // Обработчик кнопки обновления
            const updateBtn = document.getElementById(`updateListingBtn-${listingId}`);
            if (updateBtn) {
                updateBtn.addEventListener('click', () => {
                    this.updateSingleListingData(listingId);
                });
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации панели управления:', error);
        }
    }
    
    /**
     * Обновление статуса объявления
     */
    async updateListingStatus(listingId, newStatus) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            if (debugEnabled) {
            }
            
            // Получаем объявление из базы данных  
            const listing = await window.db.getListing(listingId);
            if (!listing) {
                console.error('❌ Объявление не найдено:', listingId);
                return;
            }
            
            // Сохраняем старое состояние для сравнения
            const oldListing = { ...listing };
            
            // Обновляем статус
            const updatedListing = {
                ...listing,
                status: newStatus,
                updated_at: new Date()
            };
            
            // Сохраняем в базу данных
            await window.db.updateListing(updatedListing);
            
            // Обновляем связанный объект недвижимости, если объявление входит в объект
            if (listing.object_id && window.realEstateObjectManager) {
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, oldListing, updatedListing);
                if (debugEnabled) {
                }
            }
            
            // Показываем уведомление
            this.showNotification({
                type: 'success',
                message: `Статус объявления изменен на "${this.getStatusText(newStatus)}"`,
                duration: 3000
            });
            
            // Обновляем таблицу дублей
            this.eventBus.emit('refreshDuplicatesTable');
            
            if (debugEnabled) {
            }
        } catch (error) {
            console.error('❌ Ошибка обновления статуса объявления:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка при обновлении статуса объявления',
                duration: 5000
            });
        }
    }
    
    /**
     * Актуализация объявления (обновление даты updated)
     */
    async actualizeListing(listingId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            if (debugEnabled) {
            }
            
            // Получаем объявление из базы данных
            const listing = await window.db.getListing(listingId);
            if (!listing) {
                console.error('❌ Объявление не найдено:', listingId);
                this.showNotification({
                    type: 'error',
                    message: 'Объявление не найдено',
                    duration: 5000
                });
                return;
            }
            
            // Сохраняем старое состояние для сравнения  
            const oldListing = { ...listing };
            
            // Обновляем дату последнего обновления и статус на "Активный"
            const updatedListing = {
                ...listing,
                status: 'active',
                updated: new Date().toISOString()
            };
            
            // Сохраняем в базу данных
            await window.db.update('listings', updatedListing);
            
            // Обновляем связанный объект недвижимости, если объявление входит в объект
            if (listing.object_id && window.realEstateObjectManager) {
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, oldListing, updatedListing);
                if (debugEnabled) {
                }
            }
            
            // Обновляем отображение даты в интерфейсе
            this.updateLastUpdatedDisplay(listingId, updatedListing.updated);
            
            // Обновляем статус в интерфейсе
            const statusSelect = document.getElementById(`statusSelect-${listingId}`);
            if (statusSelect) {
                statusSelect.value = 'active';
                // Обновляем SlimSelect если есть
                const slimSelect = this[`statusSlimSelect_${listingId}`];
                if (slimSelect) {
                    slimSelect.setSelected('active');
                }
            }
            
            // Обновляем таблицу дублей
            this.eventBus.emit('refreshDuplicatesTable');
            
            // Показываем уведомление
            this.showNotification({
                type: 'success',
                message: 'Объявление актуализировано',
                duration: 3000
            });
            
            if (debugEnabled) {
            }
            
        } catch (error) {
            console.error('❌ Ошибка актуализации объявления:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка при актуализации объявления',
                duration: 5000
            });
        }
    }
    
    /**
     * Обновление отображения даты последнего обновления
     */
    updateLastUpdatedDisplay(listingId, updatedDate) {
        const lastUpdatedElement = document.getElementById(`lastUpdated-${listingId}`);
        if (lastUpdatedElement && updatedDate) {
            lastUpdatedElement.textContent = new Date(updatedDate).toLocaleDateString('ru-RU', {
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }
    
    /**
     * Удаление объявления
     */
    async deleteListing(listingId) {
        try {
            if (!confirm('Вы уверены, что хотите удалить это объявление?')) {
                return;
            }
            
            const debugEnabled = await this.isDebugEnabled();
            
            if (debugEnabled) {
            }
            
            // Получаем данные объявления перед удалением для пересборки объекта
            const listing = await window.db.getListing(listingId);
            const objectId = listing?.object_id;
            
            // Удаляем объявление из базы данных
            await window.db.deleteListing(listingId);
            
            // Если объявление входило в объект недвижимости, пересобираем объект
            if (objectId && window.realEstateObjectManager) {
                try {
                    // Используем существующий метод, передавая пустой новый объект (объявление удалено)
                    await window.realEstateObjectManager.updateObjectOnListingChange(listingId, listing, null);
                    if (debugEnabled) {
                    }
                } catch (error) {
                    console.error('❌ Ошибка пересборки объекта после удаления объявления:', error);
                }
            }
            
            // Закрываем модальное окно
            this.closeModal('listingModal');
            
            // Показываем уведомление
            this.showNotification({
                type: 'success',
                message: 'Объявление удалено',
                duration: 3000
            });
            
            // Обновляем карту через EventBus
            this.eventBus.emit(CONSTANTS.EVENTS.LISTINGS_UPDATED);
            
            // Обновляем таблицу дублей
            this.eventBus.emit('refreshDuplicatesTable');
            
        } catch (error) {
            console.error('❌ Ошибка удаления объявления:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка при удалении объявления',
                duration: 5000
            });
        }
    }
    
    /**
     * Сохранение выбранного адреса для объявления
     */
    async saveListingAddress(listingId) {
        try {
            const select = document.getElementById(`addressSelect_${listingId}`);
            if (!select) {
                console.error('Селектор адреса не найден:', `addressSelect_${listingId}`);
                return;
            }

            const selectedAddressId = select.value;
            
            // Получаем текущее объявление
            const listing = await db.getListing(listingId);
            if (!listing) {
                console.error('Объявление не найдено:', listingId);
                return;
            }

            // Обновляем адрес
            listing.address_id = selectedAddressId || null;
            
            // Если адрес выбран, сбрасываем информацию о автоматическом определении
            if (selectedAddressId) {
                listing.address_match_confidence = 'manual';
                listing.address_match_method = 'manual_selection';
                listing.address_match_score = 1.0;
                listing.address_distance = null;
                // Не устанавливаем 'processed', чтобы объявление осталось в таблице дублей
                if (listing.processing_status === 'address_needed') {
                    listing.processing_status = 'duplicate_check_needed';
                }
            } else {
                // Если адрес убран, очищаем информацию о совпадении
                listing.address_match_confidence = null;
                listing.address_match_method = null;
                listing.address_match_score = null;
                listing.address_distance = null;
                // Если адрес убран, возвращаем статус для повторного определения
                listing.processing_status = 'address_needed';
            }
            
            // Сохраняем в базе данных
            await db.updateListing(listing);
            
            
            // Получаем обновленное объявление
            const updatedListing = await db.getListing(listingId);
            
            // Обновляем модальное окно
            this.updateModalAddressInfo(listingId, updatedListing);
            
            // Обновляем состояние данных
            this.eventBus.emit('listingAddressUpdated', { listingId, listing: updatedListing });
            
            // Обновляем таблицу дублей
            this.eventBus.emit('refreshDuplicatesTable');
            
        } catch (error) {
            console.error('Ошибка сохранения адреса:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка при сохранении адреса: ' + error.message,
                duration: 5000
            });
        }
    }
    
    /**
     * Обновление информации об адресе в модальном окне
     */
    async refreshAddressInfo(listingId, listing) {
        try {
            // Обновляем панель местоположения
            const locationContent = document.getElementById(`locationPanelContent-${listingId}`);
            if (locationContent) {
                const addressInfoContainer = locationContent.querySelector('.address-info');
                if (addressInfoContainer) {
                    addressInfoContainer.innerHTML = this.renderAddressAccuracyInfo(listing);
                }
            }
            
            // Обновляем карту если она открыта
            const mapContainer = document.getElementById(`listing-map-${listingId}`);
            if (mapContainer && mapContainer._leafletMap) {
                this.renderListingMap(listing);
            }
        } catch (error) {
            console.error('❌ Ошибка обновления информации об адресе:', error);
        }
    }
    
    /**
     * Отрисовка карты объявления
     */
    renderListingMap(listing) {
        try {
            const mapContainer = document.getElementById(`listing-map-${listing.id}`);
            if (!mapContainer) {
                console.warn('❌ Контейнер карты не найден');
                return;
            }

            // Получаем координаты для отображения
            const coords = this.getListingCoordinates(listing);
            if (!coords) {
                mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">⚠️ Координаты не найдены</div>';
                return;
            }

            // Уничтожаем предыдущую карту если она существует
            if (mapContainer._leafletMap) {
                mapContainer._leafletMap.remove();
                mapContainer._leafletMap = null;
            }

            // Создаем карту
            const listingMap = L.map(`listing-map-${listing.id}`, {
                center: [coords.lat, coords.lng],
                zoom: 16,
                zoomControl: true,
                scrollWheelZoom: false
            });

            // Сохраняем ссылку на карту
            mapContainer._leafletMap = listingMap;

            // Добавляем слой карты
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(listingMap);

            // Добавляем маркер объявления
            const listingMarker = L.marker([coords.lat, coords.lng], {
                icon: L.divIcon({
                    className: 'listing-marker',
                    html: `<div style="background: #3b82f6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(listingMap);

            // Добавляем popup к маркеру
            const markerPopupContent = `
                <div style="min-width: 200px;">
                    <strong>${this.escapeHtml(listing.title || 'Объявление')}</strong><br>
                    <span style="color: #6b7280; font-size: 12px;">${this.escapeHtml(listing.address || 'Адрес не указан')}</span><br>
                    <span style="color: #059669; font-weight: bold;">${this.formatPrice(listing.price)}</span>
                    ${listing.price_per_meter ? `<br><span style="color: #6b7280; font-size: 12px;">${this.formatPrice(listing.price_per_meter)}/м²</span>` : ''}
                </div>
            `;
            listingMarker.bindPopup(markerPopupContent);

            // Если есть связанный адрес, добавляем дополнительный маркер
            if (listing.address_id && this.addresses) {
                const linkedAddress = this.addresses.find(addr => addr.id === listing.address_id);
                if (linkedAddress && linkedAddress.coordinates && 
                    linkedAddress.coordinates.lat && linkedAddress.coordinates.lng) {
                    
                    const addressCoords = {
                        lat: parseFloat(linkedAddress.coordinates.lat),
                        lng: parseFloat(linkedAddress.coordinates.lng)
                    };

                    // Проверяем, что координаты адреса отличаются от координат объявления
                    const distance = this.calculateDistance(coords, addressCoords);
                    if (distance > 10) { // Если расстояние больше 10 метров
                        const addressMarker = L.marker([addressCoords.lat, addressCoords.lng], {
                            icon: L.divIcon({
                                className: 'address-marker',
                                html: `<div style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🏠</div>`,
                                iconSize: [20, 20],
                                iconAnchor: [10, 10]
                            })
                        }).addTo(listingMap);

                        addressMarker.bindPopup(`
                            <div style="min-width: 150px;">
                                <strong>Определённый адрес</strong><br>
                                <span style="color: #6b7280; font-size: 12px;">${this.escapeHtml(linkedAddress.address || 'Адрес')}</span><br>
                                <span style="color: #059669; font-size: 11px;">Расстояние: ${Math.round(distance)}м</span>
                            </div>
                        `);

                                    // Добавляем линию между маркерами
                        L.polyline([
                            [coords.lat, coords.lng],
                            [addressCoords.lat, addressCoords.lng]
                        ], {
                            color: '#6b7280',
                            weight: 2,
                            opacity: 0.7,
                            dashArray: '5, 5'
                        }).addTo(listingMap);

                        // Подгоняем вид карты под оба маркера
                        const group = new L.featureGroup([listingMarker, addressMarker]);
                        listingMap.fitBounds(group.getBounds().pad(0.1));
                    }
                }
            }

            // Добавляем слой адресов из области
            this.addAddressLayerToListingMap(listingMap, coords, listing.id);

            // Сохраняем ссылку на карту для возможной очистки
            mapContainer._leafletMap = listingMap;

        } catch (error) {
            console.error('Ошибка инициализации карты объявления:', error);
            const mapContainer = document.getElementById(`listing-map-${listing.id}`);
            if (mapContainer) {
                mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки карты</div>';
            }
        }
    }

    /**
     * Добавляет слой адресов из области на карту объявления
     */
    async addAddressLayerToListingMap(listingMap, centerCoords, listingId) {
        try {
            // Получаем адреса из области через состояние
            const currentArea = this.dataState.getState('currentArea');
            if (!currentArea) {
                return;
            }

            // Создаем временный AddressManager для получения адресов
            const addressManager = new AddressManager(this.dataState, this.eventBus, this.progressManager);
            const addresses = await addressManager.getAddressesInArea(currentArea.id);
            
            if (!Array.isArray(addresses) || addresses.length === 0) {
                return;
            }

            // Определяем радиус для отображения близлежащих адресов (в метрах)
            const radiusMeters = 500;
            
            // Фильтруем адреса по расстоянию
            const nearbyAddresses = addresses.filter(address => {
                if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                    return false;
                }
                
                const addressCoords = {
                    lat: parseFloat(address.coordinates.lat),
                    lng: parseFloat(address.coordinates.lng)
                };
                
                const distance = this.calculateDistance(centerCoords, addressCoords);
                return distance <= radiusMeters;
            });


            // Создаем маркеры для близлежащих адресов
            for (const address of nearbyAddresses) {
                try {
                    // Получаем цвет материала стен
                    let markerColor = '#3b82f6'; // Цвет по умолчанию
                    if (address.wall_material_id) {
                        try {
                            const wallMaterial = await db.get('wall_materials', address.wall_material_id);
                            if (wallMaterial && wallMaterial.color) {
                                markerColor = wallMaterial.color;
                            }
                        } catch (error) {
                            console.warn('Не удалось получить материал стен для адреса:', address.id);
                        }
                    }

                    // Определяем высоту маркера в зависимости от этажности
                    const floorCount = address.floors_count || 0;
                    let markerHeight;
                    if (floorCount >= 1 && floorCount <= 5) {
                        markerHeight = 8;
                    } else if (floorCount > 5 && floorCount <= 10) {
                        markerHeight = 12;
                    } else if (floorCount > 10 && floorCount <= 20) {
                        markerHeight = 16;
                    } else if (floorCount > 20) {
                        markerHeight = 20;
                    } else {
                        markerHeight = 8; // По умолчанию для адресов без указанной этажности
                    }

                    // Создаем маркер адреса
                    const addressMarker = L.marker([address.coordinates.lat, address.coordinates.lng], {
                        icon: L.divIcon({
                            className: 'address-marker',
                            html: `
                                <div class="leaflet-marker-icon-wrapper" style="position: relative;">
                                    <div style="
                                        width: 0; 
                                        height: 0; 
                                        border-left: 6px solid transparent; 
                                        border-right: 6px solid transparent; 
                                        border-top: ${markerHeight}px solid ${markerColor};
                                        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
                                        opacity: 0.7;
                                    "></div>
                                    ${address.build_year ? `<span class="leaflet-marker-iconlabel" style="
                                        position: absolute; 
                                        left: 12px; 
                                        top: 0px; 
                                        font-size: 9px; 
                                        font-weight: 500; 
                                        color: #374151; 
                                        background: rgba(255,255,255,0.8); 
                                        padding: 1px 3px; 
                                        border-radius: 2px; 
                                        white-space: nowrap;
                                        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                                    ">${address.build_year}</span>` : ''}
                                </div>
                            `,
                            iconSize: [12, markerHeight],
                            iconAnchor: [6, markerHeight]
                        })
                    }).addTo(listingMap);

                    // Добавляем popup с информацией об адресе
                    const typeText = this.getAddressTypeText(address.type);
                    
                    // Получаем название материала стен
                    let wallMaterialText = 'Не указан';
                    if (address.wall_material_id) {
                        try {
                            const wallMaterial = await db.get('wall_materials', address.wall_material_id);
                            if (wallMaterial) {
                                wallMaterialText = wallMaterial.name;
                            }
                        } catch (error) {
                            console.warn('Не удалось получить материал стен для popup:', address.id);
                        }
                    }

                    // Вычисляем расстояние до объявления
                    const distance = this.calculateDistance(centerCoords, {
                        lat: parseFloat(address.coordinates.lat),
                        lng: parseFloat(address.coordinates.lng)
                    });
                    
                    addressMarker.bindPopup(`
                        <div class="address-popup" style="min-width: 200px;">
                            <div class="header">
                                <strong>📍 Адрес</strong><br>
                                <div class="address-title" style="font-size: 13px;">${address.address || 'Не указан'}</div>
                            </div>
                            
                            <div class="meta" style="margin-top: 6px;">
                                <small>Тип: <strong>${typeText}</strong></small><br>
                                <small>Расстояние: <strong>${Math.round(distance)}м</strong></small>
                                ${address.floors_count ? `<br><small>Этажей: ${address.floors_count}</small>` : ''}
                                <br><small>Материал: <strong>${wallMaterialText}</strong></small>
                                ${address.build_year ? `<br><small>Год постройки: ${address.build_year}</small>` : ''}
                            </div>
                            
                            <div class="actions" style="margin-top: 12px;">
                                <button class="select-address-btn" 
                                        data-address-id="${address.id}" 
                                        data-address-name="${this.escapeHtml(address.address || 'Не указан')}"
                                        style="width: 100%; padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;">
                                    ✓ Выбрать этот адрес
                                </button>
                            </div>
                        </div>
                    `, {
                        maxWidth: 250,
                        className: 'address-popup-container'
                    });

                } catch (markerError) {
                    console.error(`Ошибка создания маркера для адреса ${address.id}:`, markerError);
                }
            }

            // Добавляем обработчики событий для кнопок выбора адреса
            setTimeout(() => {
                this.attachAddressSelectionHandlers(listingId);
            }, 100);

        } catch (error) {
            console.error('Ошибка добавления слоя адресов на карту объявления:', error);
        }
    }

    /**
     * Добавляет обработчики событий для кнопок выбора адреса в popup-ах карты
     */
    attachAddressSelectionHandlers(listingId) {
        // Используем делегирование событий для избежания CSP ошибок
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('select-address-btn')) {
                const addressId = event.target.getAttribute('data-address-id');
                const addressName = event.target.getAttribute('data-address-name');
                
                
                // Устанавливаем значение в выпадающий список
                this.setAddressInSelector(listingId, addressId, addressName);
                
                // Закрываем popup
                const popup = event.target.closest('.leaflet-popup');
                if (popup) {
                    popup.style.display = 'none';
                }
            }
        });

        // Добавляем CSS стили для hover эффекта
        const style = document.createElement('style');
        style.textContent = `
            .select-address-btn:hover {
                background-color: #2563eb !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Устанавливает выбранный адрес в выпадающий список
     */
    setAddressInSelector(listingId, addressId, addressName) {
        try {
            // Получаем элемент select
            const selectElement = document.getElementById(`addressSelect_${listingId}`);
            if (!selectElement) {
                console.error('Элемент select не найден:', `addressSelect_${listingId}`);
                return;
            }

            // Устанавливаем значение в обычном select
            selectElement.value = addressId;

            // Если есть экземпляр SlimSelect, обновляем его
            const slimSelectInstance = this[`addressSlimSelect_${listingId}`];
            if (slimSelectInstance) {
                try {
                    // Используем правильный метод для установки значения в SlimSelect
                    slimSelectInstance.setSelected(addressId);
                } catch (slimError) {
                    console.warn('Ошибка установки в SlimSelect, используем обычный select:', slimError);
                    // Fallback на обычный select
                    selectElement.value = addressId;
                    selectElement.dispatchEvent(new Event('change'));
                }
            } else {
            }

            // Показываем уведомление пользователю
            this.showNotification({
                type: 'success',
                message: `Адрес "${addressName}" выбран. Нажмите "Сохранить" для применения.`,
                duration: 3000
            });

        } catch (error) {
            console.error('Ошибка установки адреса в селектор:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка при выборе адреса',
                duration: 3000
            });
        }
    }
    
    /**
     * Получение текста типа адреса
     */
    getAddressTypeText(type) {
        switch(type) {
            case 'house':
            case 'building':
                return 'Дом';
            case 'house_with_land':
                return 'Дом с участком';
            case 'land':
                return 'Участок';
            case 'commercial':
                return 'Коммерция';
            default:
                return 'Здание';
        }
    }

    /**
     * Вычисление расстояния между двумя точками
     */
    calculateDistance(point1, point2) {
        const R = 6371e3; // радиус Земли в метрах
        const φ1 = point1.lat * Math.PI/180;
        const φ2 = point2.lat * Math.PI/180;
        const Δφ = (point2.lat-point1.lat) * Math.PI/180;
        const Δλ = (point2.lng-point1.lng) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }
    
    /**
     * Инициализация модального окна редактирования цены
     */
    initializePriceEditModal(listingId) {
        const modal = document.getElementById(`editPriceModal-${listingId}`);
        const form = document.getElementById(`editPriceForm-${listingId}`);
        const priceInput = document.getElementById(`priceInput-${listingId}`);
        const dateInput = document.getElementById(`dateInput-${listingId}`);
        const cancelButton = document.getElementById(`cancelEditPrice-${listingId}`);
        
        if (!modal || !form || !priceInput || !dateInput || !cancelButton) return;

        // Форматирование цены при вводе
        priceInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^\d]/g, ''); // Убираем все кроме цифр
            if (value) {
                // Форматируем с разделителями тысяч
                value = parseInt(value).toLocaleString('ru-RU');
            }
            e.target.value = value;
        });

        // Закрытие модального окна
        const closeModal = () => {
            modal.classList.add('hidden');
            form.reset();
            priceInput.value = '';
        };

        // Обработчик кнопки отмены
        cancelButton.addEventListener('click', closeModal);

        // Закрытие при клике на overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Обработчик отправки формы
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const price = priceInput.value.replace(/[^\d]/g, ''); // Получаем только цифры
            const date = dateInput.value;
            
            if (!price || !date) {
                this.showNotification({
                    type: 'warning',
                    message: 'Заполните все поля',
                    duration: 3000
                });
                return;
            }

            try {
                // Проверяем, редактируем ли мы существующую запись
                const editingIndex = modal.dataset.editingIndex;
                
                if (editingIndex !== undefined && editingIndex !== null && editingIndex !== '') {
                    // Редактируем существующую запись
                    await this.savePriceChange(listingId, parseInt(price), date, parseInt(editingIndex));
                } else {
                    // Добавляем новую запись
                    await this.savePriceChange(listingId, parseInt(price), date);
                }
                
                // Очищаем индекс редактирования
                delete modal.dataset.editingIndex;
                
                // Закрываем модальное окно
                closeModal();
                
                this.showNotification({
                    type: 'success',
                    message: editingIndex !== undefined ? 'Цена отредактирована' : 'Изменение цены сохранено',
                    duration: 3000
                });
            } catch (error) {
                console.error('❌ Ошибка сохранения изменения цены:', error);
                this.showNotification({
                    type: 'error',
                    message: 'Ошибка при сохранении',
                    duration: 5000
                });
            }
        });
    }
    
    /**
     * Сохранение изменения цены
     */
    async savePriceChange(listingId, price, date, editingIndex = null) {
        try {
            // Получаем объявление из базы данных
            const listing = await window.db.getListing(listingId);
            if (!listing) {
                throw new Error('Объявление не найдено');
            }
            
            // Инициализируем историю цен если её нет
            const priceHistory = listing.price_history || [];
            
            if (editingIndex !== null && editingIndex >= 0 && editingIndex < priceHistory.length) {
                // Редактируем существующую запись
                const oldItem = priceHistory[editingIndex];
                priceHistory[editingIndex] = {
                    date: date,
                    price: price,
                    new_price: price
                };
                console.log('Обновлена запись истории цен:', {
                    old: oldItem,
                    new: priceHistory[editingIndex]
                });
            } else {
                // Добавляем новую запись в историю цен
                priceHistory.push({
                    date: date,
                    price: price,
                    new_price: price
                });
            }
            
            // Обновляем объявление
            const updatedListing = {
                ...listing,
                price_history: priceHistory,
                updated_at: new Date()
            };
            
            // Сохраняем в базу данных
            await window.db.updateListing(updatedListing);
            
            // Обновляем таблицу и график
            await this.refreshPriceHistoryTable(listingId, updatedListing);
            this.renderPriceChart(updatedListing);
            
            // Обновляем объект недвижимости, если объявление связано с объектом
            if (updatedListing.object_id && window.realEstateObjectManager) {
                await window.realEstateObjectManager.updateObjectOnListingChange(listingId, listing, updatedListing);
            }
            
        } catch (error) {
            console.error('❌ Ошибка сохранения изменения цены:', error);
            throw error;
        }
    }
    
    /**
     * Обработчик для машинного обучения - верный адрес
     */
    async markSingleAddressAsCorrect(listingId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            // Получаем объявление через состояние
            const allListings = this.dataState.getState('listings') || [];
            const listing = allListings.find(l => l.id === listingId);
            if (!listing) {
                this.showNotification({
                    type: 'error',
                    message: 'Объявление не найдено',
                    duration: 3000
                });
                return;
            }

            if (debugEnabled) {
            }

            // Добавляем пример для обучения ML-модели (ПОЗИТИВНЫЙ пример)
            if (window.smartAddressMatcher && listing.address && listing.address_id) {
                try {
                    const matchedAddress = await db.get('addresses', listing.address_id);
                    if (matchedAddress) {
                        window.smartAddressMatcher.addTrainingExample(
                            listing.address,
                            matchedAddress.address,
                            true // Пользователь подтвердил, что это правильный адрес
                        );
                        if (debugEnabled) {
                        }
                    }
                } catch (error) {
                    console.warn('ML training failed:', error);
                }
            }

            // Обновляем статус определения адреса на "manual"
            listing.address_match_confidence = 'manual';
            
            // Обновляем в базе данных
            await db.update('listings', listing);
            if (debugEnabled) {
            }

            this.showNotification({
                type: 'success',
                message: 'Адрес подтвержден',
                duration: 3000
            });
            
            // Обновляем модальное окно
            this.updateModalAddressInfo(listingId, listing);
            
            // Обновляем состояние данных
            this.eventBus.emit('listingAddressUpdated', { listingId, listing });
            
            // Обновляем таблицу дублей
            this.eventBus.emit('refreshDuplicatesTable');

        } catch (error) {
            console.error('Ошибка при подтверждении адреса:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка при подтверждении адреса: ' + error.message,
                duration: 5000
            });
        }
    }
    
    /**
     * Обработчик для машинного обучения - неверный адрес
     */
    async markSingleAddressAsIncorrect(listingId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            // Получаем объявление через состояние
            const allListings = this.dataState.getState('listings') || [];
            const listing = allListings.find(l => l.id === listingId);
            if (!listing) {
                this.showNotification({
                    type: 'error',
                    message: 'Объявление не найдено',
                    duration: 3000
                });
                return;
            }

            if (debugEnabled) {
            }

            // Добавляем пример для обучения ML-модели (НЕГАТИВНЫЙ пример)
            if (window.smartAddressMatcher && listing.address && listing.address_id) {
                try {
                    const matchedAddress = await db.get('addresses', listing.address_id);
                    if (matchedAddress) {
                        window.smartAddressMatcher.addTrainingExample(
                            listing.address,
                            matchedAddress.address,
                            false // Пользователь указал, что это неправильный адрес
                        );
                        if (debugEnabled) {
                        }
                    }
                } catch (error) {
                    console.warn('ML training failed:', error);
                }
            }

            // Обновляем статус определения адреса на "very_low" чтобы показать неточность
            listing.address_match_confidence = 'very_low';
            
            // Очищаем привязку к адресу
            listing.address_id = null;
            
            // Обновляем в базе данных
            await db.update('listings', listing);
            if (debugEnabled) {
            }

            this.showNotification({
                type: 'success',
                message: 'Адрес отмечен как неверный',
                duration: 3000
            });
            
            // Обновляем модальное окно
            this.updateModalAddressInfo(listingId, listing);
            
            // Обновляем состояние данных
            this.eventBus.emit('listingAddressUpdated', { listingId, listing });
            
            // Обновляем таблицу дублей
            this.eventBus.emit('refreshDuplicatesTable');

        } catch (error) {
            console.error('Ошибка при отметке адреса как неверного:', error);
            this.showNotification({
                type: 'error',
                message: 'Ошибка при отметке адреса как неверного: ' + error.message,
                duration: 5000
            });
        }
    }

    /**
     * Обновить информацию об адресе в модальном окне
     */
    updateModalAddressInfo(listingId, listing) {
        const locationContent = document.getElementById(`locationPanelContent-${listingId}`);
        if (locationContent) {
            // Найдем контейнер карты и сохраним его
            const mapContainer = document.getElementById(`listing-map-${listingId}`);
            let savedMapNode = null;
            if (mapContainer) {
                savedMapNode = mapContainer.cloneNode(true);
                // Сохраняем ссылку на Leaflet карту
                if (mapContainer._leafletMap) {
                    savedMapNode._leafletMap = mapContainer._leafletMap;
                }
            }
            
            // Обновляем информацию об адресе
            const addressInfoHtml = this.renderAddressAccuracyInfo(listing);
            locationContent.innerHTML = addressInfoHtml;
            
            // Возвращаем карту обратно
            if (savedMapNode) {
                locationContent.appendChild(savedMapNode);
            }
            
            // Обновляем заголовок панели местоположения
            const locationHeader = document.getElementById(`locationPanelHeader-${listingId}`);
            if (locationHeader) {
                const statusElement = locationHeader.querySelector('.text-sm');
                if (statusElement) {
                    statusElement.textContent = this.getAddressStatusText(listing);
                    statusElement.className = `text-sm ${this.getAddressStatusClass(listing)}`;
                }
            }
            
            // Повторно инициализируем адресный селектор
            setTimeout(async () => {
                await this.initializeAddressSelector(listingId, listing.address_id); // Сохраняем текущий выбор
                
                // Добавляем обработчик для кнопки сохранения
                const saveButton = document.getElementById(`saveAddress_${listingId}`);
                if (saveButton) {
                    // Удаляем старые обработчики, клонируя элемент
                    const newSaveButton = saveButton.cloneNode(true);
                    saveButton.parentNode.replaceChild(newSaveButton, saveButton);
                    
                    newSaveButton.addEventListener('click', () => {
                        this.saveListingAddress(listingId);
                    });
                }
                
                // Добавляем обработчик для кнопки "Верный адрес" если она есть
                const correctAddressModalButton = document.getElementById(`correctAddressModal_${listingId}`);
                if (correctAddressModalButton) {
                    // Удаляем старые обработчики
                    const newCorrectButton = correctAddressModalButton.cloneNode(true);
                    correctAddressModalButton.parentNode.replaceChild(newCorrectButton, correctAddressModalButton);
                    
                    newCorrectButton.addEventListener('click', () => {
                        this.markSingleAddressAsCorrect(listingId);
                    });
                }
                
                // Добавляем обработчик для кнопки "Неверный адрес" если она есть
                const incorrectAddressModalButton = document.getElementById(`incorrectAddressModal_${listingId}`);
                if (incorrectAddressModalButton) {
                    // Удаляем старые обработчики
                    const newIncorrectButton = incorrectAddressModalButton.cloneNode(true);
                    incorrectAddressModalButton.parentNode.replaceChild(newIncorrectButton, incorrectAddressModalButton);
                    
                    newIncorrectButton.addEventListener('click', () => {
                        this.markSingleAddressAsIncorrect(listingId);
                    });
                }
                
                // Если карта была инициализирована, переинициализируем её
                const mapContainer = document.getElementById(`listing-map-${listingId}`);
                if (mapContainer && mapContainer._leafletMap) {
                    this.renderListingMap(listing);
                }
            }, 100);
        }
    }

    /**
     * Обновление данных одного объявления (только парсинг без сохранения)
     */
    async updateSingleListingData(listingId) {
        try {
            const debugEnabled = await this.isDebugEnabled();
            
            
            // Показываем уведомление о начале процесса
            this.showNotification({
                type: 'info',
                message: 'Начинаем парсинг объявления...',
                duration: 3000
            });
            
            // Получаем объявление из базы данных
            const listing = await window.db.getListing(listingId);
            if (!listing) {
                console.error('❌ Объявление не найдено:', listingId);
                this.showNotification({
                    type: 'error',
                    message: 'Объявление не найдено в базе данных',
                    duration: 5000
                });
                return;
            }
            
            if (!listing.url) {
                console.error('❌ У объявления отсутствует URL:', listingId);
                this.showNotification({
                    type: 'error',
                    message: 'У объявления отсутствует URL для парсинга',
                    duration: 5000
                });
                return;
            }
            
            console.log('🔄 Парсинг объявления:', {
                id: listing.id,
                url: listing.url,
                price: listing.price,
                status: listing.status,
                updated: listing.updated,
                created: listing.created
            });
            
            // Блокируем кнопку во время обработки
            const updateBtn = document.getElementById(`updateListingBtn-${listingId}`);
            if (updateBtn) {
                updateBtn.disabled = true;
                updateBtn.textContent = '⏳ Обновление...';
            }
            
            // Используем логику из ParsingManager для создания вкладки и парсинга
            let tab = null;
            try {
                // Создаем вкладку для парсинга
                tab = await this.createTabWithRetry(listing.url, 2);
                
                // Ждем загрузки страницы и инжектируем content script
                await this.waitForPageLoad(tab.id);
                
                await this.injectContentScript(tab.id, listing.url);
                
                // Запрашиваем обновленные данные объявления
                const response = await this.waitForContentScriptAndParse(tab.id, {
                    action: 'parseCurrentListing',
                    areaId: this.dataState.getState('currentAreaId'),
                    existingListingId: listing.id
                });
                
                
                if (response && response.success && response.data) {
                    // НЕ СОХРАНЯЕМ в базу данных, только выводим в консоль
                    
                    // Парсим дату обновления из строки типа "Обновлено: 31 июл, 09:01"
                    let updatedDate = new Date();
                    if (response.data.updated_date) {
                        try {
                            // Извлекаем дату из строки "Обновлено: 31 июл, 09:01"
                            const dateMatch = response.data.updated_date.match(/(\d{1,2})\s+(янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек),?\s+(\d{1,2}):(\d{2})/i);
                            if (dateMatch) {
                                const day = parseInt(dateMatch[1]);
                                const monthName = dateMatch[2];
                                const hours = parseInt(dateMatch[3]);
                                const minutes = parseInt(dateMatch[4]);
                                
                                const monthMap = {
                                    'янв': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'мая': 4, 'май': 4, 'июн': 5,
                                    'июл': 6, 'авг': 7, 'сен': 8, 'окт': 9, 'ноя': 10, 'дек': 11
                                };
                                
                                const currentDate = new Date();
                                const currentYear = currentDate.getFullYear();
                                const month = monthMap[monthName.toLowerCase()];
                                
                                if (month !== undefined) {
                                    // Создаем дату с текущим годом
                                    updatedDate = new Date(currentYear, month, day, hours, minutes);
                                    
                                    // Если получившаяся дата больше текущей - значит это прошлый год
                                    if (updatedDate > currentDate) {
                                        updatedDate = new Date(currentYear - 1, month, day, hours, minutes);
                                    }
                                    
                                } else {
                                    console.warn('⚠️ Месяц не найден:', monthName);
                                }
                            }
                        } catch (dateError) {
                            console.warn('⚠️ Ошибка парсинга даты обновления:', dateError);
                        }
                    }
                    
                    // Создаем обновленное объявление, изменяя только необходимые поля
                    const updatedListing = {
                        ...listing, // Сохраняем все существующие данные
                        updated_at: new Date() // Системная дата обновления
                    };
                    
                    // Обрабатываем историю цен - сохраняем существующую
                    let priceHistory = listing.price_history || [];
                    
                    // Если история пустая, создаем базовую запись с датой создания
                    if (priceHistory.length === 0 && listing.created) {
                        priceHistory = [{
                            date: listing.created,
                            price: listing.price,
                            source: 'initial'
                        }];
                    }
                    
                    // Обрабатываем архивный статус
                    const isArchived = response.data.status === 'archived';
                    if (isArchived) {
                        updatedListing.status = 'archived';
                        // Для архивных объявлений устанавливаем дату закрытия с сайта (только если есть)
                        if (response.data.updated_date) {
                            updatedListing.updated = updatedDate; // Дата закрытия с сайта
                            updatedListing.last_seen = updatedDate;
                        }
                        // Если дата с сайта недоступна - просто меняем статус на архив, дату не трогаем
                    } else {
                        // Для активных объявлений ВСЕГДА ставим текущую дату парсинга
                        updatedListing.updated = new Date();
                        updatedListing.status = 'active';
                    }
                    
                    // Проверяем изменение цены в любом случае
                    const priceChanged = listing.price !== response.data.price;
                    
                    // 1. Если из парсинга пришла история цен - объединяем с существующей
                    if (response.data.price_history && response.data.price_history.length > 0) {
                        const newHistory = response.data.price_history.map(entry => ({
                            date: entry.date,
                            price: entry.price
                        }));
                        
                        // Объединяем с существующей историей, избегая дублей
                        // Фильтруем существующую историю - оставляем только записи с валидным price
                        const filteredExistingHistory = priceHistory.filter(entry => entry.price && entry.price > 0);
                        const combinedHistory = [...filteredExistingHistory];
                        for (const newEntry of newHistory) {
                            // Добавляем только записи с валидным полем price
                            if (newEntry.price && newEntry.price > 0) {
                                const exists = combinedHistory.some(existing => 
                                    existing.date === newEntry.date && existing.price === newEntry.price
                                );
                                if (!exists) {
                                    combinedHistory.push(newEntry);
                                }
                            }
                        }
                        
                        // Сортируем по дате и обновляем историю
                        priceHistory = combinedHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
                        
                        // Берем последнюю цену из истории
                        const sortedByDateDesc = priceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
                        updatedListing.price = sortedByDateDesc[0].price;
                        
                    } else {
                        // 2. Если истории нет, но цена изменилась
                        if (priceChanged) {
                            updatedListing.price = response.data.price;
                            
                            // Определяем дату для записи
                            const dateForEntry = isArchived ? updatedDate : new Date();
                            
                            // Добавляем новую запись в историю
                            priceHistory = [...priceHistory];
                            priceHistory.push({
                                date: dateForEntry.toISOString(),
                                price: response.data.price
                            });
                            priceHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
                        }
                    }
                    
                    
                    updatedListing.price_history = priceHistory;
                    
                    // Логируем что сохраняем
                    
                    // Сохраняем в базу данных
                    await window.db.update('listings', updatedListing);
                    
                    // Отправляем событие об обновлении
                    this.eventBus.emit(CONSTANTS.EVENTS.LISTING_UPDATED, {
                        listing: updatedListing,
                        oldListing: listing,
                        priceChanged: priceChanged,
                        archived: isArchived
                    });
                    
                    let message = isArchived 
                        ? 'Объявление архивировано (снято с публикации)'
                        : `Объявление обновлено! ${priceChanged ? 'Цена изменилась!' : 'Цена не изменилась.'}`;
                    
                    this.showNotification({
                        type: isArchived ? 'warning' : 'success',
                        message: message,
                        duration: 5000
                    });
                    
                } else {
                    
                    this.showNotification({
                        type: 'warning',
                        message: 'Объявление недоступно или удалено с сайта',
                        duration: 5000
                    });
                }
                
            } catch (error) {
                console.error('❌ ОШИБКА ПАРСИНГА:', error);
                
                this.showNotification({
                    type: 'error',
                    message: `Ошибка парсинга: ${error.message}`,
                    duration: 5000
                });
            } finally {
                // Закрываем вкладку
                if (tab) {
                    try {
                        chrome.tabs.remove(tab.id);
                    } catch (closeError) {
                        console.warn('⚠️ Не удалось закрыть вкладку:', closeError);
                    }
                }
                
                // Восстанавливаем кнопку
                if (updateBtn) {
                    updateBtn.disabled = false;
                    updateBtn.textContent = '🔄 Обновить';
                }
            }
            
        } catch (error) {
            console.error('❌ Критическая ошибка в updateSingleListingData:', error);
            this.showNotification({
                type: 'error',
                message: `Критическая ошибка: ${error.message}`,
                duration: 5000
            });
        }
    }

    /**
     * Создание вкладки с повторными попытками (адаптация из ParsingManager)
     */
    async createTabWithRetry(url, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await new Promise((resolve, reject) => {
                    chrome.tabs.create({ url: url, active: false }, (newTab) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(newTab);
                        }
                    });
                });
            } catch (error) {
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Экспоненциальная задержка между попытками
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Ожидание загрузки страницы (адаптация из ParsingManager)
     */
    async waitForPageLoad(tabId) {
        return new Promise((resolve) => {
            const checkPageLoad = () => {
                chrome.tabs.get(tabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        resolve();
                        return;
                    }
                    
                    if (tab.status === 'complete') {
                        setTimeout(resolve, 2000); // Дополнительная задержка после загрузки
                    } else {
                        setTimeout(checkPageLoad, 500);
                    }
                });
            };
            
            checkPageLoad();
        });
    }

    /**
     * Инжекция content script (адаптация из ParsingManager)
     */
    async injectContentScript(tabId, listingUrl) {
        try {
            
            // Определяем какой парсер использовать
            const isAvito = listingUrl.includes('avito.ru');
            const isCian = listingUrl.includes('cian.ru');
            
            
            // Инжектируем зависимости
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['data/database.js', 'utils/error-reporter.js']
            });
            
            // Инжектируем правильный парсер
            if (isAvito) {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content-scripts/avito-parser.js']
                });
            } else if (isCian) {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content-scripts/cian-parser.js']
                });
            } else {
                throw new Error(`Неподдерживаемый сайт: ${listingUrl}`);
            }
            
            
            // Дополнительная задержка для инициализации (больше для Cian)
            const initDelay = isCian ? 5000 : 3000;
            await new Promise(resolve => setTimeout(resolve, initDelay));
            
        } catch (error) {
            console.error('❌ Ошибка инжекции content script:', error);
            throw error;
        }
    }

    /**
     * Ожидание content script и парсинг (адаптация из ParsingManager)
     */
    async waitForContentScriptAndParse(tabId, settings) {
        const maxAttempts = 15;
        const attemptDelay = 3000; // Увеличиваем задержку
        
        // Сначала проверим готовность content script
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                
                // Сначала проверяем готовность простым ping
                try {
                    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
                } catch (pingError) {
                    
                    // Если не отвечает на ping, ждем больше
                    if (attempt < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, attemptDelay));
                        continue;
                    }
                }
                
                // Теперь пытаемся отправить основное сообщение
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'parseCurrentListing',
                    areaId: settings.areaId,
                    areaName: settings.areaName,
                    maxPages: settings.maxPages || 10,
                    delay: settings.delay || 2000
                });
                
                // Если получили ответ, возвращаем его
                return response;
                
            } catch (error) {
                
                if (attempt === maxAttempts) {
                    // Последняя попытка - возвращаем ошибку
                    throw new Error(`Не удалось связаться с content script после ${maxAttempts} попыток: ${error.message}`);
                }
                
                // Ждем перед следующей попыткой
                await new Promise(resolve => setTimeout(resolve, attemptDelay));
            }
        }
    }
    
    /**
     * Обработка обновления объявления
     */
    async handleListingUpdated(eventData) {
        try {
            const { listing, oldListing, priceChanged, archived } = eventData;
            
            // Проверяем, открыто ли модальное окно объявления
            const listingModal = document.getElementById('listingModal');
            if (!listingModal || listingModal.classList.contains('hidden')) {
                return; // Модальное окно не открыто
            }
            
            // Проверяем, что обновляется именно текущее объявление
            const currentListingId = listingModal.dataset.listingId;
            if (currentListingId !== listing.id.toString()) {
                return; // Открыто модальное окно другого объявления
            }
            
            await this.debugLog('🔄 UIManager: Обновляем модальное окно объявления:', listing.id);
            await this.debugLog('🔄 UIManager: Старая дата обновления:', oldListing.updated);
            await this.debugLog('🔄 UIManager: Новая дата обновления:', listing.updated);
            
            // Сохраняем информацию об изменениях для подсветки
            this.lastUpdatedListing = {
                listing,
                oldListing,
                priceChanged,
                archived,
                updatedAt: new Date()
            };
            
            // Обновляем модальное окно с подсветкой изменений
            await this.populateListingModal(listingModal, listing);
            
            // Показываем уведомление о обновлении
            let notificationMessage = `Объявление #${listing.id} обновлено`;
            if (priceChanged) {
                const oldPrice = oldListing.price ? new Intl.NumberFormat('ru-RU').format(oldListing.price) : '0';
                const newPrice = listing.price ? new Intl.NumberFormat('ru-RU').format(listing.price) : '0';
                notificationMessage += `\nЦена изменена: ${oldPrice} ₽ → ${newPrice} ₽`;
            }
            if (archived) {
                notificationMessage = `Объявление #${listing.id} архивировано`;
            }
            
            this.progressManager.showSuccess(notificationMessage);
            
            // Обновляем связанный объект недвижимости
            if (window.realEstateObjectManager && listing.object_id) {
                try {
                    
                    await window.realEstateObjectManager.updateObjectOnListingChange(
                        listing.id, 
                        oldListing, 
                        listing
                    );
                    await this.debugLog('✅ UIManager: Связанный объект недвижимости обновлен');
                } catch (error) {
                    console.error('❌ UIManager: Ошибка обновления объекта недвижимости:', error);
                }
            }
            
        } catch (error) {
            console.error('❌ UIManager: Ошибка обработки обновления объявления:', error);
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}