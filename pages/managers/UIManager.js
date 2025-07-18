/**
 * Менеджер интерфейса
 * Управляет UI элементами, панелями, модальными окнами и общим состоянием интерфейса
 */

class UIManager {
    constructor(dataState, eventBus, progressManager) {
        this.dataState = dataState;
        this.eventBus = eventBus;
        this.progressManager = progressManager;
        
        // Состояние UI
        this.uiState = {
            panels: {
                statistics: { visible: true, expanded: false },
                dataWork: { visible: true, expanded: false },
                map: { visible: true, expanded: true },
                addresses: { visible: true, expanded: false },
                segments: { visible: true, expanded: false },
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
                container: 'addressesPanelContainer',
                content: 'addressesPanelContent',
                header: 'addressesPanelHeader',
                chevron: 'addressesPanelChevron',
                checkbox: 'addressesPanel'
            },
            segments: {
                container: 'segmentsPanelContainer',
                content: 'segmentsPanelContent',
                header: 'segmentsPanelHeader',
                chevron: 'segmentsPanelChevron',
                checkbox: 'segmentsPanel'
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
    bindPanelEvents() {
        console.log('🔗 UIManager: Привязка событий панелей (новая простая система)...');
        
        // Все панели на странице (включая addressTable)
        const panelMappings = [
            { name: 'statistics', header: 'statisticsPanelHeader', content: 'statisticsPanelContent', chevron: 'statisticsPanelChevron' },
            { name: 'dataWork', header: 'dataWorkPanelHeader', content: 'dataWorkPanelContent', chevron: 'dataWorkPanelChevron' },
            { name: 'map', header: 'mapPanelHeader', content: 'mapPanelContent', chevron: 'mapPanelChevron' },
            { name: 'segments', header: 'segmentsPanelHeader', content: 'segmentsPanelContent', chevron: 'segmentsPanelChevron' },
            { name: 'duplicates', header: 'duplicatesPanelHeader', content: 'duplicatesPanelContent', chevron: 'duplicatesPanelChevron' },
            { name: 'addressTable', header: 'addressTableHeader', content: 'addressTableContent', chevron: 'addressTableChevron' }
        ];
        
        panelMappings.forEach(panel => {
            const header = document.getElementById(panel.header);
            if (header) {
                header.addEventListener('click', () => {
                    console.log(`🔵 UIManager: Клик по панели "${panel.name}"`);
                    this.simpleTogglePanel(panel.name, panel.content, panel.chevron);
                });
                console.log(`✅ UIManager: Панель "${panel.name}" привязана к элементу #${panel.header}`);
            } else {
                console.debug(`💡 UIManager: Панель "${panel.name}" пропущена (элемент #${panel.header} не найден)`);
            }
        });
        
        console.log('✅ UIManager: Привязка событий панелей завершена');
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
        const titleElement = document.getElementById('pageTitle');
        if (titleElement) {
            titleElement.textContent = `Область: ${area.name}`;
        }
        
        // Обновляем title документа
        document.title = `Neocenka - ${area.name}`;
    }
    
    /**
     * Переключение панели
     */
    togglePanel(panelName) {
        console.log(`🔄 UIManager: Переключение панели "${panelName}"`);
        
        const config = this.panelConfig[panelName];
        if (!config) {
            console.warn(`⚠️ UIManager: Конфигурация для панели "${panelName}" не найдена`);
            return;
        }
        
        const content = document.getElementById(config.content);
        const chevron = document.getElementById(config.chevron);
        
        console.log(`🔍 UIManager: Элементы панели "${panelName}":`); 
        console.log(`   - content (#${config.content}):`, content ? 'найден' : 'НЕ НАЙДЕН');
        console.log(`   - chevron (#${config.chevron}):`, chevron ? 'найден' : 'НЕ НАЙДЕН');
        
        if (!content || !chevron) {
            console.error(`❌ UIManager: Не найдены необходимые элементы для панели "${panelName}"`);
            return;
        }
        
        const currentState = this.uiState.panels[panelName];
        const isExpanded = currentState.expanded;
        
        console.log(`📊 UIManager: Текущее состояние панели "${panelName}":`, currentState);
        console.log(`🔄 UIManager: isExpanded = ${isExpanded} -> ${!isExpanded}`);
        
        // Очищаем все inline стили display
        content.style.display = '';
        content.style.removeProperty('display');
        
        if (isExpanded) {
            // Сворачиваем панель
            content.classList.add('hidden');
            chevron.style.transform = 'rotate(-90deg)';
            console.log(`➡️ UIManager: Сворачиваем панель "${panelName}" - добавили 'hidden'`);
        } else {
            // Разворачиваем панель
            content.classList.remove('hidden');
            chevron.style.transform = 'rotate(0deg)';
            console.log(`⬇️ UIManager: Разворачиваем панель "${panelName}" - убрали 'hidden'`);
        }
        
        // Обновляем состояние
        this.uiState.panels[panelName].expanded = !isExpanded;
        
        console.log(`💾 UIManager: Новое состояние панели "${panelName}":`, this.uiState.panels[panelName]);
        
        // Сохраняем состояние
        this.savePanelState(panelName);
        
        // Уведомляем о изменении
        if (this.eventBus) {
            this.eventBus.emit(CONSTANTS.EVENTS.PANEL_TOGGLED, {
                panelName,
                expanded: !isExpanded,
                timestamp: new Date()
            });
            console.log(`📡 UIManager: Событие PANEL_TOGGLED отправлено для "${panelName}"`);
        }
        
        console.log(`✅ UIManager: Переключение панели "${panelName}" завершено`);
    }
    
    // Новая простая система управления панелями
    
    /**
     * Простое переключение панели
     */
    simpleTogglePanel(panelName, contentId, chevronId) {
        console.log(`🔵 UIManager: Простое переключение панели "${panelName}"`);
        
        const content = document.getElementById(contentId);
        const chevron = document.getElementById(chevronId);
        
        if (!content || !chevron) {
            console.warn(`⚠️ UIManager: Элементы панели "${panelName}" не найдены`);
            return;
        }
        
        // Диагностика CSS перед изменениями
        console.log(`🔍 UIManager: ПЕРЕД изменением панели "${panelName}":`);
        console.log(`   - content.classList: ${content.className}`);
        console.log(`   - content.style.display: "${content.style.display}"`);
        console.log(`   - computed display: "${window.getComputedStyle(content).display}"`);
        console.log(`   - chevron.style.transform: "${chevron.style.transform}"`);
        
        // Очищаем любые inline стили display, которые могут конфликтовать с CSS классами
        if (content.style.display) {
            console.log(`⚠️ UIManager: Обнаружен inline стиль display: "${content.style.display}", очищаем`);
            content.style.removeProperty('display');
        }
        
        // Единый подход через CSS классы для всех панелей
        const isCurrentlyHidden = content.classList.contains('hidden');
        
        if (isCurrentlyHidden) {
            // Разворачиваем панель
            content.classList.remove('hidden');
            chevron.style.transform = 'rotate(0deg)';
            this.saveSimplePanelState(panelName, true);
            console.log(`⬇️ UIManager: Панель "${panelName}" развернута`);
        } else {
            // Сворачиваем панель
            content.classList.add('hidden');
            chevron.style.transform = 'rotate(-90deg)';
            this.saveSimplePanelState(panelName, false);
            console.log(`➡️ UIManager: Панель "${panelName}" свернута`);
        }
        
        // Диагностика CSS после изменений
        console.log(`🔍 UIManager: ПОСЛЕ изменения панели "${panelName}":`);
        console.log(`   - content.classList: ${content.className}`);
        console.log(`   - content.style.display: "${content.style.display}"`);
        console.log(`   - computed display: "${window.getComputedStyle(content).display}"`);
        console.log(`   - chevron.style.transform: "${chevron.style.transform}"`);
    }
    
    /**
     * Сохранение простого состояния панели
     */
    saveSimplePanelState(panelName, isExpanded) {
        const currentArea = this.dataState.getState('currentArea');
        if (!currentArea) return;
        
        const stateKey = `simple_panel_${panelName}_${currentArea.id}`;
        localStorage.setItem(stateKey, isExpanded ? 'expanded' : 'collapsed');
        console.log(`💾 UIManager: Простое состояние панели "${panelName}" сохранено: ${isExpanded ? 'expanded' : 'collapsed'}`);
    }
    
    /**
     * Простое восстановление состояния панелей
     */
    restorePanelStates(area) {
        console.log('🔄 Восстановление состояния панелей для области:', area?.id);
        
        if (!area || !area.id) {
            console.warn('⚠️ Нет области для восстановления состояния панелей');
            return;
        }
        
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
            const stateKey = `simple_panel_${panel.name}_${area.id}`;
            const savedState = localStorage.getItem(stateKey);
            
            console.log(`🔍 Панель ${panel.name}: ${savedState || 'нет сохраненного состояния'}`);
            
            const content = document.getElementById(panel.content);
            const chevron = document.getElementById(panel.chevron);
            
            if (!content || !chevron) {
                console.log(`⚠️ Элементы панели ${panel.name} не найдены, пропускаем`);
                return;
            }
            
            // Применяем состояние (по умолчанию - скрыто) - единый подход через CSS классы
            const isExpanded = savedState === 'expanded';
            
            if (isExpanded) {
                content.classList.remove('hidden');
                chevron.style.transform = 'rotate(0deg)';
                console.log(`✅ Панель ${panel.name} восстановлена как развернутая`);
            } else {
                content.classList.add('hidden');
                chevron.style.transform = 'rotate(-90deg)';
                console.log(`✅ Панель ${panel.name} восстановлена как свернутая`);
            }
        });
        
        console.log('✅ Восстановление панелей завершено');
    }
    
    // Старые методы видимости удалены
    
    /**
     * Инициализация панелей по умолчанию
     */
    initializePanelsDefaults() {
        console.log('🏁 Инициализация панелей по умолчанию...');
        
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
                console.log(`⚠️ Элементы панели ${panel.name} не найдены, пропускаем`);
                return;
            }
            
            // По умолчанию все панели скрыты - единый подход через CSS классы
            content.classList.add('hidden');
            chevron.style.transform = 'rotate(-90deg)';
            
            console.log(`✅ Панель ${panel.name} инициализирована как скрытая`);
        });
        
        console.log('✅ Инициализация панелей завершена');
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
        console.log(`💾 UIManager: Состояние панели "${panelName}" сохранено: ${stateKey} = ${JSON.stringify(state)}`);
    }
    
    /**
     * Открытие модального окна
     */
    openModal(modalName, options = {}) {
        const modal = document.getElementById(modalName);
        if (!modal) return;
        
        // Показываем модальное окно
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        
        // Блокируем скролл body
        document.body.style.overflow = 'hidden';
        
        // Обновляем состояние
        this.uiState.modals[modalName] = true;
        
        // Применяем опции
        if (options.title) {
            const titleElement = modal.querySelector('.modal-title');
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
        
        // Фокусируемся на первом элементе
        const firstFocusable = modal.querySelector('input, textarea, select, button');
        if (firstFocusable) {
            setTimeout(() => firstFocusable.focus(), 100);
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
        if (!modal) return;
        
        // Скрываем модальное окно
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
                    ${actions.map(action => `
                        <button class="text-sm font-medium underline hover:no-underline" 
                                onclick="${action.handler}">${action.text}</button>
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
                    <button class="text-lg font-bold hover:opacity-75" onclick="this.parentElement.parentElement.parentElement.remove()">
                        ×
                    </button>
                </div>
            </div>
        `;
        
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
        console.log('🔄 UIManager: Восстановление общего состояния UI для области:', currentArea?.id);
        
        if (!currentArea) {
            console.warn('⚠️ UIManager: Область не найдена в dataState для восстановления UI');
            return null;
        }
        
        const stateKey = `ui-state_${currentArea.id}`;
        const savedState = localStorage.getItem(stateKey);
        console.log(`🔍 UIManager: Общее состояние UI - ключ: "${stateKey}", значение:`, savedState);
        
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                console.log('✅ UIManager: Общее состояние UI восстановлено:', state);
                
                // Общее состояние UI восстановлено (панели управляются отдельно)
                console.log('✅ UIManager: Общее состояние UI применено');
                
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
            console.log('💡 UIManager: Общее состояние UI не найдено, используем значения по умолчанию');
            return null;
        }
    }
    
    /**
     * Уничтожение менеджера UI
     */
    destroy() {
        // Очищаем все уведомления
        this.clearAllNotifications();
        
        // Закрываем все модальные окна
        this.closeAllModals();
        
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
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}