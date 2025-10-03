/**
 * CustomParametersManagerPanel - компонент управления дополнительными параметрами для страницы настроек
 * Следует принципам архитектуры v0.1 и SOLID
 */

class CustomParametersManagerPanel {
    constructor(container, customParametersService, objectCustomValuesService, validationService, errorHandler) {
        this.container = container;
        this.customParametersService = customParametersService;
        this.objectCustomValuesService = objectCustomValuesService;
        this.validationService = validationService;
        this.errorHandler = errorHandler;

        // Состояние компонента
        this.parameters = [];
        this.filteredParameters = [];
        this.searchQuery = '';
        this.filterType = 'all';
        this.isLoading = false;
        this.selectedParameters = new Set();

        // Модальные окна
        this.editModal = null;
        this.deleteModal = null;

        // Обработчики событий
        this.eventHandlers = new Map();

        this.initialize();
    }

    /**
     * Инициализация компонента
     */
    async initialize() {
        try {
            // Инициализируем модальные окна
            await this.initializeModals();

            await this.loadParameters();
            this.render();
            this.setupEventListeners();

            // Подписываемся на события сервиса параметров
            this.customParametersService.on('parameterCreated', () => this.refreshParameters());
            this.customParametersService.on('parameterUpdated', () => this.refreshParameters());
            this.customParametersService.on('parameterDeleted', () => this.refreshParameters());
            this.customParametersService.on('parametersReordered', () => this.refreshParameters());

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'CustomParametersManagerPanel',
                method: 'initialize'
            });
        }
    }

    /**
     * Инициализация модальных окон
     */
    async initializeModals() {
        try {
            // Создаем модальные окна
            this.editModal = new ParameterEditModal(
                this.customParametersService,
                this.validationService,
                this.errorHandler
            );

            this.deleteModal = new ParameterDeleteModal(
                this.customParametersService,
                this.objectCustomValuesService,
                this.errorHandler
            );

            // Подписываемся на события модальных окон
            this.editModal.on('parameterSaved', () => {
                this.refreshParameters();
            });

            this.deleteModal.on('parameterDeleted', () => {
                this.refreshParameters();
            });

        } catch (error) {
            console.warn('Не удалось инициализировать модальные окна:', error);
        }
    }

    /**
     * Загрузка параметров
     */
    async loadParameters() {
        try {
            this.setLoading(true);
            this.parameters = await this.customParametersService.getParameters();
            this.applyFilters();
        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'CustomParametersManagerPanel',
                method: 'loadParameters'
            });
            this.parameters = [];
            this.filteredParameters = [];
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Обновление списка параметров
     */
    async refreshParameters() {
        await this.loadParameters();
        this.renderParametersList();
        // Переинициализируем SlimSelect после обновления содержимого
        setTimeout(() => this.initializeSlimSelects(), 100);
    }

    /**
     * Основной рендеринг компонента
     */
    render() {
        this.container.innerHTML = `
            <div class="custom-parameters-manager">
                <!-- Заголовок и статистика -->
                <div class="mb-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-2xl font-bold text-gray-900">Дополнительные параметры</h2>
                        <div class="flex items-center space-x-4">
                            ${this.renderStats()}
                            <button id="add-parameter-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                </svg>
                                <span>Добавить параметр</span>
                            </button>
                        </div>
                    </div>
                    <p class="text-gray-600">Настройте дополнительные параметры для описания объектов недвижимости</p>
                </div>

                <!-- Панель инструментов -->
                ${this.renderToolbar()}

                <!-- Список параметров -->
                <div id="parameters-list-container">
                    ${this.renderParametersList()}
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг статистики
     */
    renderStats() {
        const totalCount = this.parameters.length;
        const activeCount = this.parameters.filter(p => p.is_active !== false).length;
        const typeStats = this.getTypeStats();

        return `
            <div class="flex items-center space-x-4 text-sm text-gray-600">
                <span class="bg-gray-100 px-3 py-1 rounded-full">
                    Всего: ${totalCount}
                </span>
                <span class="bg-green-100 px-3 py-1 rounded-full text-green-800">
                    Активные: ${activeCount}
                </span>
                <div class="relative">
                    <button id="stats-toggle" class="bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200">
                        По типам ↓
                    </button>
                    <div id="stats-dropdown" class="hidden absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 p-3 min-w-48">
                        ${Object.entries(typeStats).map(([type, count]) => `
                            <div class="flex justify-between py-1">
                                <span>${PARAMETER_TYPES[type] || type}:</span>
                                <span class="font-medium">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг панели инструментов
     */
    renderToolbar() {
        return `
            <div class="bg-gray-50 p-4 rounded-lg mb-6">
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <div class="flex items-center space-x-4">
                        <!-- Поиск -->
                        <div class="relative">
                            <input
                                type="text"
                                id="search-input"
                                placeholder="Поиск параметров..."
                                value="${this.searchQuery}"
                                class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-64 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                            <svg class="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                            </svg>
                        </div>

                        <!-- Фильтр по типу -->
                        <select id="type-filter" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <option value="all">Все типы</option>
                            ${Object.entries(PARAMETER_TYPES).map(([value, label]) => `
                                <option value="${value}" ${this.filterType === value ? 'selected' : ''}>${label}</option>
                            `).join('')}
                        </select>

                        <!-- Фильтр по активности -->
                        <select id="active-filter" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <option value="all">Все параметры</option>
                            <option value="active">Только активные</option>
                            <option value="inactive">Только неактивные</option>
                        </select>
                    </div>

                    <div class="flex items-center space-x-2">
                        <!-- Массовые операции -->
                        <div class="hidden" id="bulk-actions">
                            <span class="text-sm text-gray-600 mr-2">Выбрано: <span id="selected-count">0</span></span>
                            <button id="bulk-activate" class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Активировать</button>
                            <button id="bulk-deactivate" class="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">Деактивировать</button>
                            <button id="bulk-delete" class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">Удалить</button>
                        </div>

                        <!-- Сортировка -->
                        <select id="sort-select" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            <option value="order">По порядку</option>
                            <option value="name">По названию</option>
                            <option value="type">По типу</option>
                            <option value="created">По дате создания</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг списка параметров
     */
    renderParametersList() {
        if (this.isLoading) {
            return `
                <div class="text-center py-12">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p class="mt-2 text-gray-600">Загрузка параметров...</p>
                </div>
            `;
        }

        if (this.filteredParameters.length === 0) {
            return `
                <div class="text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <h3 class="mt-2 text-sm font-medium text-gray-900">
                        ${this.searchQuery || this.filterType !== 'all' ? 'Параметры не найдены' : 'Нет параметров'}
                    </h3>
                    <p class="mt-1 text-sm text-gray-500">
                        ${this.searchQuery || this.filterType !== 'all'
                            ? 'Попробуйте изменить условия поиска или фильтры'
                            : 'Создайте первый параметр для начала работы'
                        }
                    </p>
                    ${(!this.searchQuery && this.filterType === 'all') ? `
                        <div class="mt-6">
                            <button id="add-first-parameter" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
                                Создать параметр
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        return `
            <div class="bg-white shadow rounded-lg overflow-hidden">
                <!-- Заголовок таблицы -->
                <div class="bg-gray-50 px-6 py-3 border-b border-gray-200">
                    <div class="flex items-center">
                        <input type="checkbox" id="select-all" class="mr-3">
                        <span class="text-sm font-medium text-gray-700">Найдено параметров: ${this.filteredParameters.length}</span>
                    </div>
                </div>

                <!-- Таблица параметров -->
                <div class="divide-y divide-gray-200" id="sortable-parameters">
                    ${this.filteredParameters.map(parameter => this.renderParameterRow(parameter)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг строки параметра
     */
    renderParameterRow(parameter) {
        const isActive = parameter.is_active !== false;
        const hasValidation = parameter.validation && Object.keys(parameter.validation).length > 0;

        return `
            <div class="parameter-row px-6 py-4 hover:bg-gray-50 ${!isActive ? 'opacity-60' : ''}" data-id="${parameter.id}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <input type="checkbox" class="parameter-checkbox mr-4" value="${parameter.id}">

                        <!-- Drag handle -->
                        <div class="drag-handle cursor-move mr-3 text-gray-400 hover:text-gray-600">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zM6 6h8v2H6V6zm0 4h8v2H6v-2z"/>
                            </svg>
                        </div>

                        <div class="flex-1">
                            <div class="flex items-center space-x-3">
                                <h3 class="text-lg font-medium text-gray-900">${parameter.name}</h3>

                                <!-- Тип параметра -->
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    ${PARAMETER_TYPES[parameter.type] || parameter.type}
                                </span>

                                <!-- Статус активности -->
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    isActive
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                }">
                                    ${isActive ? 'Активен' : 'Неактивен'}
                                </span>

                                <!-- Индикатор валидации -->
                                ${hasValidation ? `
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        Валидация
                                    </span>
                                ` : ''}

                                <!-- Индикатор обязательности -->
                                ${parameter.validation?.required ? `
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        Обязательный
                                    </span>
                                ` : ''}
                            </div>

                            <div class="mt-1 flex items-center space-x-4 text-sm text-gray-600">
                                <span>Порядок: ${parameter.display_order || 0}</span>
                                ${parameter.options && parameter.options.length > 0 ? `
                                    <span>Вариантов: ${parameter.options.length}</span>
                                ` : ''}
                                ${parameter.created_at ? `
                                    <span>Создан: ${new Date(parameter.created_at).toLocaleDateString()}</span>
                                ` : ''}
                            </div>

                            <!-- Предпросмотр опций -->
                            ${this.renderParameterPreview(parameter)}
                        </div>
                    </div>

                    <!-- Действия -->
                    <div class="flex items-center space-x-2">
                        <button class="parameter-stats-btn text-gray-400 hover:text-gray-600 p-2 rounded" data-id="${parameter.id}" title="Статистика использования">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                            </svg>
                        </button>
                        <button class="parameter-duplicate-btn text-gray-400 hover:text-gray-600 p-2 rounded" data-id="${parameter.id}" title="Дублировать параметр">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                            </svg>
                        </button>
                        <button class="parameter-toggle-btn text-gray-400 hover:text-gray-600 p-2 rounded" data-id="${parameter.id}" title="${isActive ? 'Деактивировать' : 'Активировать'}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isActive ? 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029M5.636 5.636l12.728 12.728M6.758 6.758a10.05 10.05 0 005.242-1.758c4.478 0 8.268 2.943 9.543 7a10.05 10.05 0 01-1.563 3.029' : 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'}"/>
                            </svg>
                        </button>
                        <button class="parameter-edit-btn text-blue-600 hover:text-blue-800 p-2 rounded" data-id="${parameter.id}" title="Редактировать">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button class="parameter-delete-btn text-red-600 hover:text-red-800 p-2 rounded" data-id="${parameter.id}" title="Удалить">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг предпросмотра параметра
     */
    renderParameterPreview(parameter) {
        switch (parameter.type) {
            case 'select':
            case 'multiselect':
                if (parameter.options && parameter.options.length > 0) {
                    const displayOptions = parameter.options.slice(0, 3);
                    const moreCount = parameter.options.length - 3;
                    return `
                        <div class="mt-2 text-sm text-gray-600">
                            <span class="font-medium">Варианты:</span>
                            ${displayOptions.map(opt => `<span class="inline-block bg-gray-100 px-2 py-1 rounded text-xs mr-1">${opt}</span>`).join('')}
                            ${moreCount > 0 ? `<span class="text-gray-400">+${moreCount}</span>` : ''}
                        </div>
                    `;
                }
                break;

            case 'range':
                if (parameter.validation) {
                    return `
                        <div class="mt-2 text-sm text-gray-600">
                            <span class="font-medium">Диапазон:</span>
                            ${parameter.validation.min || 0} — ${parameter.validation.max || 100}
                        </div>
                    `;
                }
                break;

            case 'rating':
                const max = parameter.validation?.max || 5;
                return `
                    <div class="mt-2 text-sm text-gray-600">
                        <span class="font-medium">Рейтинг:</span>
                        ${'★'.repeat(max)} (1-${max})
                    </div>
                `;

            case 'currency':
                return `
                    <div class="mt-2 text-sm text-gray-600">
                        <span class="font-medium">Валюта:</span>
                        ${parameter.validation?.currency || 'RUB'}
                    </div>
                `;
        }

        return '';
    }

    /**
     * Инициализация SlimSelect для всех выпадающих списков
     */
    initializeSlimSelects() {
        // Проверяем доступность SlimSelect
        if (typeof SlimSelect === 'undefined') {
            console.warn('SlimSelect не загружен для CustomParametersManagerPanel');
            return;
        }

        const selectElements = this.container.querySelectorAll('select');
        this.slimSelectInstances = this.slimSelectInstances || [];

        // Очищаем старые экземпляры
        this.slimSelectInstances.forEach(instance => {
            try {
                instance.destroy();
            } catch (error) {
                console.warn('Ошибка при очистке SlimSelect экземпляра:', error);
            }
        });
        this.slimSelectInstances = [];

        selectElements.forEach(selectElement => {
            try {
                const instance = new SlimSelect({
                    select: selectElement,
                    settings: {
                        allowDeselect: true,
                        placeholder: 'Выберите значение...',
                        closeOnSelect: true
                    }
                });
                this.slimSelectInstances.push(instance);
            } catch (error) {
                console.warn('Не удалось инициализировать SlimSelect для элемента:', selectElement.id, error);
            }
        });
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Инициализация SlimSelect
        this.initializeSlimSelects();

        // Основные кнопки
        this.container.querySelector('#add-parameter-btn')?.addEventListener('click', () => this.showCreateModal());
        this.container.querySelector('#add-first-parameter')?.addEventListener('click', () => this.showCreateModal());

        // Поиск и фильтрация
        const searchInput = this.container.querySelector('#search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim();
                this.applyFilters();
                this.renderParametersList();
            });
        }

        const typeFilter = this.container.querySelector('#type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.filterType = e.target.value;
                this.applyFilters();
                this.renderParametersList();
            });
        }

        // Статистика
        this.container.querySelector('#stats-toggle')?.addEventListener('click', (e) => {
            const dropdown = this.container.querySelector('#stats-dropdown');
            dropdown?.classList.toggle('hidden');
            e.stopPropagation();
        });

        // Закрытие dropdown при клике вне
        document.addEventListener('click', () => {
            this.container.querySelector('#stats-dropdown')?.classList.add('hidden');
        });

        // Делегирование событий для кнопок параметров
        this.container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-id]');
            if (!target) return;

            const parameterId = target.dataset.id;
            const button = e.target.closest('button');
            if (!button) return;

            if (button.classList.contains('parameter-edit-btn')) {
                this.showEditModal(parameterId);
            } else if (button.classList.contains('parameter-delete-btn')) {
                this.showDeleteModal(parameterId);
            } else if (button.classList.contains('parameter-duplicate-btn')) {
                this.duplicateParameter(parameterId);
            } else if (button.classList.contains('parameter-toggle-btn')) {
                this.toggleParameter(parameterId);
            } else if (button.classList.contains('parameter-stats-btn')) {
                this.showParameterStats(parameterId);
            }
        });

        // Выбор всех параметров
        this.container.querySelector('#select-all')?.addEventListener('change', (e) => {
            const checkboxes = this.container.querySelectorAll('.parameter-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            this.updateBulkActions();
        });

        // Обновление массовых операций при изменении чекбоксов
        this.container.addEventListener('change', (e) => {
            if (e.target.classList.contains('parameter-checkbox')) {
                this.updateBulkActions();
            }
        });
    }

    /**
     * Применение фильтров
     */
    applyFilters() {
        this.filteredParameters = this.parameters.filter(parameter => {
            // Поиск по названию
            if (this.searchQuery && !parameter.name.toLowerCase().includes(this.searchQuery.toLowerCase())) {
                return false;
            }

            // Фильтр по типу
            if (this.filterType !== 'all' && parameter.type !== this.filterType) {
                return false;
            }

            return true;
        });

        // Сортировка
        const sortBy = this.container.querySelector('#sort-select')?.value || 'order';
        this.sortParameters(sortBy);
    }

    /**
     * Сортировка параметров
     */
    sortParameters(sortBy) {
        this.filteredParameters.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'type':
                    return a.type.localeCompare(b.type);
                case 'created':
                    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                case 'order':
                default:
                    return (a.display_order || 0) - (b.display_order || 0);
            }
        });
    }

    /**
     * Получение статистики по типам
     */
    getTypeStats() {
        const stats = {};
        this.parameters.forEach(parameter => {
            stats[parameter.type] = (stats[parameter.type] || 0) + 1;
        });
        return stats;
    }

    /**
     * Установка состояния загрузки
     */
    setLoading(loading) {
        this.isLoading = loading;
        const container = this.container.querySelector('#parameters-list-container');
        if (container) {
            container.innerHTML = this.renderParametersList();
        }
    }

    /**
     * Обновление массовых операций
     */
    updateBulkActions() {
        const selectedCheckboxes = this.container.querySelectorAll('.parameter-checkbox:checked');
        const bulkActions = this.container.querySelector('#bulk-actions');
        const selectedCount = this.container.querySelector('#selected-count');

        if (selectedCheckboxes.length > 0) {
            bulkActions?.classList.remove('hidden');
            if (selectedCount) selectedCount.textContent = selectedCheckboxes.length;

            this.selectedParameters.clear();
            selectedCheckboxes.forEach(cb => this.selectedParameters.add(cb.value));
        } else {
            bulkActions?.classList.add('hidden');
            this.selectedParameters.clear();
        }
    }

    /**
     * Показать модальное окно создания параметра
     */
    async showCreateModal() {
        if (this.editModal) {
            this.editModal.showCreate();
        } else {
            console.warn('Модальное окно редактирования не инициализировано');
        }
    }

    /**
     * Показать модальное окно редактирования параметра
     */
    async showEditModal(parameterId) {
        if (this.editModal) {
            await this.editModal.showEdit(parameterId);
        } else {
            console.warn('Модальное окно редактирования не инициализировано');
        }
    }

    /**
     * Показать модальное окно удаления параметра
     */
    async showDeleteModal(parameterId) {
        if (this.deleteModal) {
            await this.deleteModal.show(parameterId);
        } else {
            console.warn('Модальное окно удаления не инициализировано');
        }
    }

    /**
     * Дублирование параметра
     */
    async duplicateParameter(parameterId) {
        try {
            const parameter = await this.customParametersService.getParameter(parameterId);
            if (!parameter) {
                throw new Error('Параметр не найден');
            }

            const duplicatedData = {
                ...parameter,
                id: undefined, // Новый ID будет создан автоматически
                name: `${parameter.name} (копия)`,
                display_order: this.parameters.length
            };

            delete duplicatedData.created_at;
            delete duplicatedData.updated_at;

            await this.customParametersService.createParameter(duplicatedData);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'CustomParametersManagerPanel',
                method: 'duplicateParameter',
                params: { parameterId }
            });
        }
    }

    /**
     * Переключение активности параметра
     */
    async toggleParameter(parameterId) {
        try {
            const parameter = await this.customParametersService.getParameter(parameterId);
            if (!parameter) {
                throw new Error('Параметр не найден');
            }

            const newActiveState = !(parameter.is_active !== false);
            await this.customParametersService.updateParameter(parameterId, {
                is_active: newActiveState
            });

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'CustomParametersManagerPanel',
                method: 'toggleParameter',
                params: { parameterId }
            });
        }
    }

    /**
     * Показать статистику параметра
     */
    async showParameterStats(parameterId) {
        try {
            // Пока просто логируем, позже добавим модальное окно статистики
            console.log('🎯 Показать статистику для параметра', parameterId);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'CustomParametersManagerPanel',
                method: 'showParameterStats',
                params: { parameterId }
            });
        }
    }

    /**
     * Эмит события
     */
    emitEvent(eventName, data) {
        const handlers = this.eventHandlers.get(eventName) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.warn(`Error in event handler for ${eventName}:`, error);
            }
        });
    }

    /**
     * Подписка на события
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Отписка от событий
     */
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        this.eventHandlers.clear();
        this.selectedParameters.clear();

        if (this.editModal) {
            this.editModal.destroy();
        }
        if (this.deleteModal) {
            this.deleteModal.destroy();
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomParametersManagerPanel;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.CustomParametersManagerPanel = CustomParametersManagerPanel;
}