/**
 * ObjectCustomParametersPanel - компонент для редактирования дополнительных параметров объекта
 * Следует архитектуре v0.1 и принципу единственной ответственности
 */

class ObjectCustomParametersPanel {
    constructor(objectId, customParametersService, objectCustomValuesService) {
        this.objectId = objectId;
        this.customParametersService = customParametersService;
        this.objectCustomValuesService = objectCustomValuesService;

        // Состояние компонента
        this.parameters = [];
        this.values = {};
        this.isLoading = false;
        this.isEditing = false;
        this.validationErrors = new Map();

        // Новые расширенные функции
        this.showOnlyFilled = false;
        this.searchQuery = '';
        this.groupByCategory = false;
        this.isAutoSaving = false;

        // DOM элементы
        this.containerElement = null;
        this.loadingElement = null;
        this.contentElement = null;
        this.formElement = null;

        // Обработчики событий
        this.eventHandlers = new Map();

        // Кэш SlimSelect экземпляров
        this.selectInstances = new Map();
    }

    /**
     * Инициализация компонента
     */
    async initialize(containerIdOrElement = 'objectCustomParametersPanel') {
        try {
            // Поддерживаем как передачу ID контейнера, так и самого элемента
            if (typeof containerIdOrElement === 'string') {
                this.containerElement = document.getElementById(containerIdOrElement);
                if (!this.containerElement) {
                    console.warn(`⚠️ Контейнер ${containerIdOrElement} для дополнительных параметров не найден`);
                    return false;
                }
            } else if (containerIdOrElement instanceof HTMLElement) {
                this.containerElement = containerIdOrElement;
            } else {
                console.warn('⚠️ Неверный тип контейнера для дополнительных параметров');
                return false;
            }

            // Показываем индикатор загрузки
            this.showLoading();

            // Загружаем данные
            await this.loadData();

            // Отображаем интерфейс (setupEventListeners вызывается внутри render)
            this.render();

            return true;

        } catch (error) {
            console.error('❌ Ошибка инициализации ObjectCustomParametersPanel:', error);
            this.showError('Ошибка загрузки дополнительных параметров');
            return false;
        }
    }

    /**
     * Загрузка данных параметров и значений
     */
    async loadData() {
        try {
            this.isLoading = true;

            // Загружаем активные параметры
            const [parameters, objectValues] = await Promise.all([
                this.customParametersService.getParameters(true),
                this.objectCustomValuesService.getObjectValues(this.objectId)
            ]);

            console.log(`🔍 ObjectCustomParametersPanel: Загружено параметров: ${parameters?.length || 0}`, parameters);
            console.log(`🔍 ObjectCustomParametersPanel: Загружено значений для объекта ${this.objectId}:`, objectValues);

            this.parameters = parameters;
            this.values = objectValues.values;

            this.isLoading = false;

        } catch (error) {
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Отображение компонента
     */
    render() {
        if (!this.containerElement) return;

        // Если нет параметров, показываем заглушку
        if (this.parameters.length === 0) {
            this.containerElement.innerHTML = this.renderEmptyState();
            return;
        }

        // Основная структура
        this.containerElement.innerHTML = `
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <!-- Заголовок -->
                <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-medium text-gray-900 flex items-center">
                            <svg class="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Дополнительные параметры
                            ${this.renderFilledIndicator()}
                        </h3>
                        <div class="flex items-center space-x-2">
                            <button type="button" id="toggleEditCustomParams"
                                    class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                ${this.isEditing ? 'Просмотр' : 'Редактировать'}
                            </button>
                            ${this.isEditing ? `
                                <button type="button" id="saveCustomParams"
                                        class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                    <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Сохранить
                                </button>
                                <button type="button" id="cancelEditCustomParams"
                                        class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                                    Отмена
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    ${this.renderToolbar()}
                </div>

                <!-- Содержимое -->
                <div class="p-4">
                    <div id="customParametersContent">
                        ${this.renderParametersForm()}
                    </div>
                </div>
            </div>
        `;

        // Инъецируем стили для SlimSelect
        this.injectSlimSelectStyles();

        // Инициализируем SlimSelect для select полей
        this.initializeSelects();

        // Применяем специальные обработчики для сложных типов
        this.initializeSpecialInputs();

        // ВАЖНО: Переустанавливаем обработчики событий после рендеринга
        this.setupEventListeners();
    }

    /**
     * Отображение формы параметров
     */
    renderParametersForm() {
        const filteredParameters = this.filterParameters();
        const parametersHTML = filteredParameters.map(parameter => {
            const value = this.values[parameter.id];
            const hasError = this.validationErrors.has(parameter.id);
            const errorMessage = hasError ? this.validationErrors.get(parameter.id) : null;

            return `
                <div class="mb-4" data-parameter-id="${parameter.id}">
                    <div class="flex items-start justify-between mb-2">
                        <label class="block text-sm font-medium text-gray-700">
                            ${parameter.name}
                            ${parameter.validation && parameter.validation.required ?
                                '<span class="text-red-500 ml-1">*</span>' : ''}
                        </label>
                        <span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            ${PARAMETER_TYPES[parameter.type] || parameter.type}
                        </span>
                    </div>

                    <div class="parameter-input-container">
                        ${this.renderParameterInput(parameter, value)}
                    </div>

                    ${hasError ? `
                        <p class="mt-1 text-sm text-red-600">${errorMessage}</p>
                    ` : ''}

                    ${!this.isEditing && value !== undefined && value !== null && value !== '' && ['rating', 'range', 'coordinates', 'boolean', 'file'].includes(parameter.type) ? `
                        <div class="mt-1 text-sm text-gray-600">
                            ${this.formatDisplayValue(parameter, value)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        return parametersHTML || '<p class="text-gray-500 italic">Дополнительные параметры не настроены</p>';
    }

    /**
     * Отображение поля ввода по типу параметра
     */
    renderParameterInput(parameter, value) {
        // Стили совместимые с фильтрами обработки
        const baseClasses = 'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
        const disabledClasses = this.isEditing ? '' : 'bg-gray-50 cursor-not-allowed';
        const inputClasses = `${baseClasses} ${disabledClasses}`;

        // Специальные классы для select - БЕЗ стилей для SlimSelect
        const selectClasses = this.isEditing ? '' : 'bg-gray-50 cursor-not-allowed';

        switch (parameter.type) {
            case 'string':
                return `
                    <input type="text"
                           id="param_${parameter.id}"
                           name="param_${parameter.id}"
                           value="${this.escapeHtml(value || '')}"
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${inputClasses}"
                           placeholder="${parameter.validation && parameter.validation.required ? 'Обязательное поле' : ''}" />
                `;

            case 'textarea':
                return `
                    <textarea id="param_${parameter.id}"
                              name="param_${parameter.id}"
                              rows="3"
                              ${!this.isEditing ? 'disabled' : ''}
                              class="${inputClasses}"
                              placeholder="${parameter.validation && parameter.validation.required ? 'Обязательное поле' : ''}">${this.escapeHtml(value || '')}</textarea>
                `;

            case 'number':
            case 'currency':
            case 'percentage':
                return `
                    <input type="number"
                           id="param_${parameter.id}"
                           name="param_${parameter.id}"
                           value="${value || ''}"
                           ${parameter.validation && parameter.validation.min !== null ? `min="${parameter.validation.min}"` : ''}
                           ${parameter.validation && parameter.validation.max !== null ? `max="${parameter.validation.max}"` : ''}
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${inputClasses}"
                           step="${parameter.type === 'currency' ? '0.01' : parameter.type === 'percentage' ? '0.1' : 'any'}" />
                `;

            case 'boolean':
                return `
                    <div class="flex items-center">
                        <input type="checkbox"
                               id="param_${parameter.id}"
                               name="param_${parameter.id}"
                               ${value ? 'checked' : ''}
                               ${!this.isEditing ? 'disabled' : ''}
                               class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                        <label for="param_${parameter.id}" class="ml-2 text-sm text-gray-700">
                            ${parameter.name}
                        </label>
                    </div>
                `;

            case 'select':
                const selectOptions = parameter.options.map(option =>
                    `<option value="${this.escapeHtml(option)}" ${value === option ? 'selected' : ''}>${this.escapeHtml(option)}</option>`
                ).join('');

                return `
                    <select id="param_${parameter.id}"
                            name="param_${parameter.id}"
                            class="${selectClasses}">
                        <option value="">Выберите значение...</option>
                        ${selectOptions}
                    </select>
                `;

            case 'multiselect':
                const multiselectOptions = parameter.options.map(option =>
                    `<option value="${this.escapeHtml(option)}" ${Array.isArray(value) && value.includes(option) ? 'selected' : ''}>${this.escapeHtml(option)}</option>`
                ).join('');

                return `
                    <select id="param_${parameter.id}"
                            name="param_${parameter.id}"
                            multiple
                            class="${selectClasses}">
                        ${multiselectOptions}
                    </select>
                `;

            case 'date':
                const dateValue = value ? new Date(value).toISOString().split('T')[0] : '';
                return `
                    <input type="date"
                           id="param_${parameter.id}"
                           name="param_${parameter.id}"
                           value="${dateValue}"
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${inputClasses}" />
                `;

            case 'rating':
                return this.renderRatingInput(parameter, value);

            case 'range':
                return this.renderRangeInput(parameter, value);

            case 'url':
                return `
                    <input type="url"
                           id="param_${parameter.id}"
                           name="param_${parameter.id}"
                           value="${this.escapeHtml(value || '')}"
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${inputClasses}"
                           placeholder="https://..." />
                `;

            case 'coordinates':
                return this.renderCoordinatesInput(parameter, value);

            case 'file':
                return this.renderFileInput(parameter, value);

            default:
                return `<p class="text-red-500">Неподдерживаемый тип параметра: ${parameter.type}</p>`;
        }
    }

    /**
     * Отображение поля рейтинга (1-5 звезд)
     */
    renderRatingInput(parameter, value) {
        const currentValue = value || 0;
        let starsHTML = '';

        for (let i = 1; i <= 5; i++) {
            starsHTML += `
                <button type="button"
                        class="rating-star ${!this.isEditing ? 'cursor-not-allowed opacity-50' : 'hover:text-yellow-400'} ${i <= currentValue ? 'text-yellow-400' : 'text-gray-300'}"
                        data-rating="${i}"
                        data-parameter-id="${parameter.id}"
                        ${!this.isEditing ? 'disabled' : ''}>
                    <svg class="h-6 w-6 fill-current" viewBox="0 0 20 20">
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                    </svg>
                </button>
            `;
        }

        return `
            <div class="flex items-center space-x-1">
                ${starsHTML}
                <input type="hidden" id="param_${parameter.id}" name="param_${parameter.id}" value="${currentValue}" />
                <span class="ml-2 text-sm text-gray-600">(${currentValue}/5)</span>
            </div>
        `;
    }

    /**
     * Отображение поля диапазона
     */
    renderRangeInput(parameter, value) {
        const rangeValue = value || { min: '', max: '' };
        const baseClasses = 'block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';
        const disabledClasses = this.isEditing ? '' : 'bg-gray-50 cursor-not-allowed';

        return `
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">От</label>
                    <input type="number"
                           id="param_${parameter.id}_min"
                           name="param_${parameter.id}_min"
                           value="${rangeValue.min || ''}"
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${baseClasses} ${disabledClasses}"
                           placeholder="Мин." />
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">До</label>
                    <input type="number"
                           id="param_${parameter.id}_max"
                           name="param_${parameter.id}_max"
                           value="${rangeValue.max || ''}"
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${baseClasses} ${disabledClasses}"
                           placeholder="Макс." />
                </div>
            </div>
        `;
    }

    /**
     * Отображение поля координат
     */
    renderCoordinatesInput(parameter, value) {
        const coordValue = value || { lat: '', lng: '' };
        const baseClasses = 'block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';
        const disabledClasses = this.isEditing ? '' : 'bg-gray-50 cursor-not-allowed';

        return `
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Широта</label>
                    <input type="number"
                           id="param_${parameter.id}_lat"
                           name="param_${parameter.id}_lat"
                           value="${coordValue.lat || ''}"
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${baseClasses} ${disabledClasses}"
                           step="any"
                           placeholder="55.751244" />
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Долгота</label>
                    <input type="number"
                           id="param_${parameter.id}_lng"
                           name="param_${parameter.id}_lng"
                           value="${coordValue.lng || ''}"
                           ${!this.isEditing ? 'disabled' : ''}
                           class="${baseClasses} ${disabledClasses}"
                           step="any"
                           placeholder="37.618423" />
                </div>
            </div>
        `;
    }

    /**
     * Отображение поля файла
     */
    renderFileInput(parameter, value) {
        return `
            <div class="space-y-2">
                ${this.isEditing ? `
                    <input type="file"
                           id="param_${parameter.id}"
                           name="param_${parameter.id}"
                           class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                           ${parameter.validation && parameter.validation.fileTypes ? `accept=".${parameter.validation.fileTypes.join(',.')}"` : ''} />
                ` : ''}
                ${value && value.name ? `
                    <div class="flex items-center text-sm text-gray-600">
                        <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        ${value.name}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Отображение пустого состояния
     */
    renderEmptyState() {
        return `
            <div class="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <svg class="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 class="text-lg font-medium text-gray-900 mb-2">Дополнительные параметры не настроены</h3>
                <p class="text-gray-600 mb-4">Настройте дополнительные параметры в разделе настроек для их отображения здесь.</p>
                <button type="button" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200">
                    Перейти к настройкам
                </button>
            </div>
        `;
    }

    /**
     * Показ индикатора загрузки
     */
    showLoading() {
        if (this.containerElement) {
            this.containerElement.innerHTML = `
                <div class="flex items-center justify-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <span class="ml-2 text-gray-600">Загрузка параметров...</span>
                </div>
            `;
        }
    }

    /**
     * Показ ошибки
     */
    showError(message) {
        if (this.containerElement) {
            this.containerElement.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div class="flex">
                        <svg class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div class="ml-2">
                            <p class="text-sm text-red-800">${message}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Установка обработчиков событий
     */
    setupEventListeners() {
        // Переключение режима редактирования
        const toggleEditBtn = document.getElementById('toggleEditCustomParams');
        if (toggleEditBtn) {
            toggleEditBtn.addEventListener('click', () => this.toggleEditMode());
        }

        // Сохранение изменений
        const saveBtn = document.getElementById('saveCustomParams');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveChanges());
        }

        // Отмена редактирования
        const cancelBtn = document.getElementById('cancelEditCustomParams');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelEdit());
        }

        // Обработчики для рейтингов (локальные для контейнера)
        if (this.containerElement) {
            this.containerElement.addEventListener('click', (event) => {
                if (event.target.closest('.rating-star') && this.isEditing) {
                    const button = event.target.closest('.rating-star');
                    const rating = parseInt(button.dataset.rating);
                    const parameterId = button.dataset.parameterId;
                    this.setRating(parameterId, rating);
                }
            });
        }

        // Поиск параметров
        const searchInput = document.getElementById('searchParameters');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.updateParametersDisplay();
            });
        }

        // Фильтр "только заполненные"
        const showOnlyFilledCheckbox = document.getElementById('showOnlyFilled');
        if (showOnlyFilledCheckbox) {
            showOnlyFilledCheckbox.addEventListener('change', (e) => {
                this.showOnlyFilled = e.target.checked;
                this.updateParametersDisplay();
            });
        }

        // Быстрые действия
        const clearAllValuesBtn = document.getElementById('clearAllValues');
        if (clearAllValuesBtn) {
            clearAllValuesBtn.addEventListener('click', () => this.clearAllValues());
        }

        // Автосохранение при изменении значений
        if (this.isEditing) {
            this.containerElement.addEventListener('input', (e) => {
                if (e.target.matches('input, select, textarea')) {
                    this.autoSave();
                }
            });

            this.containerElement.addEventListener('change', (e) => {
                if (e.target.matches('input[type="checkbox"], input[type="radio"]')) {
                    this.autoSave();
                }
            });
        }
    }

    /**
     * Обновление отображения параметров без полной перерисовки
     */
    updateParametersDisplay() {
        const content = document.getElementById('customParametersContent');
        if (content) {
            content.innerHTML = this.renderParametersForm();
            this.initializeSelects();
            this.initializeSpecialInputs();
            // Переустанавливаем обработчики событий после обновления содержимого
            this.setupEventListeners();
        }
    }

    /**
     * Инициализация SlimSelect для select полей
     */
    initializeSelects() {
        if (typeof SlimSelect === 'undefined') {
            console.warn('SlimSelect не загружен');
            return;
        }

        // Очищаем старые экземпляры
        this.selectInstances.forEach(instance => {
            try {
                instance.destroy();
            } catch (e) {
                // Игнорируем ошибки при уничтожении
            }
        });
        this.selectInstances.clear();

        // Инициализируем новые селекты (всегда, даже в режиме просмотра)
        this.parameters.forEach(parameter => {
            if (['select', 'multiselect'].includes(parameter.type)) {
                const selectElement = document.getElementById(`param_${parameter.id}`);
                if (selectElement) {
                    try {
                        const instance = new SlimSelect({
                            select: selectElement,
                            settings: {
                                allowDeselect: this.isEditing && (!parameter.validation || !parameter.validation.required),
                                placeholder: 'Выберите значение...',
                                disabled: !this.isEditing // Отключаем в режиме просмотра
                            }
                        });
                        this.selectInstances.set(parameter.id, instance);
                    } catch (error) {
                        console.warn(`Не удалось инициализировать SlimSelect для параметра ${parameter.id}:`, error);
                    }
                }
            }
        });
    }

    /**
     * Инициализация специальных полей ввода
     */
    initializeSpecialInputs() {
        // Здесь можно добавить инициализацию других специальных компонентов
        // Например, календари, карты для координат и т.д.
    }

    /**
     * Переключение режима редактирования
     */
    async toggleEditMode() {
        this.isEditing = !this.isEditing;

        if (this.isEditing) {
            // Сохраняем текущие значения для возможности отмены
            this.backupValues = { ...this.values };
        }

        // Перерисовываем интерфейс
        this.render();
    }

    /**
     * Установка рейтинга
     */
    setRating(parameterId, rating) {
        const hiddenInput = document.getElementById(`param_${parameterId}`);
        if (hiddenInput) {
            hiddenInput.value = rating;
        }

        // Обновляем визуальное отображение звезд
        const stars = document.querySelectorAll(`[data-parameter-id="${parameterId}"].rating-star`);
        stars.forEach((star, index) => {
            if (index + 1 <= rating) {
                star.classList.add('text-yellow-400');
                star.classList.remove('text-gray-300');
            } else {
                star.classList.add('text-gray-300');
                star.classList.remove('text-yellow-400');
            }
        });

        // Обновляем счетчик
        const counter = document.querySelector(`[data-parameter-id="${parameterId}"]`).closest('.mb-4').querySelector('span');
        if (counter) {
            counter.textContent = `(${rating}/5)`;
        }
    }

    /**
     * Сохранение изменений
     */
    async saveChanges() {
        try {
            // Собираем значения из формы
            const newValues = this.collectFormValues();

            // Валидируем значения
            this.validationErrors.clear();
            const allValid = await this.validateValues(newValues);

            if (!allValid) {
                // Перерисовываем с ошибками валидации
                this.render();
                return;
            }

            // Показываем индикатор загрузки
            const saveBtn = document.getElementById('saveCustomParams');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = `
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1"></div>
                    Сохранение...
                `;
            }

            // Сохраняем значения
            const result = await this.objectCustomValuesService.setObjectValues(this.objectId, newValues);

            if (result.errors && result.errors.length > 0) {
                console.warn('Ошибки при сохранении:', result.errors);
                // Можно показать уведомления об ошибках
            }

            // Обновляем локальные данные
            this.values = newValues;

            // Выходим из режима редактирования
            this.isEditing = false;
            this.render();

            // Эмитим событие об изменении
            this.emitEvent('valuesChanged', {
                objectId: this.objectId,
                values: newValues,
                result: result
            });

        } catch (error) {
            console.error('❌ Ошибка сохранения параметров:', error);
            alert('Ошибка сохранения. Попробуйте еще раз.');
        } finally {
            // Сбрасываем состояние кнопки сохранения
            const saveBtn = document.getElementById('saveCustomParams');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Сохранить
                `;
            }
        }
    }

    /**
     * Отмена редактирования
     */
    cancelEdit() {
        if (this.backupValues) {
            this.values = { ...this.backupValues };
            this.backupValues = null;
        }

        this.isEditing = false;
        this.validationErrors.clear();
        this.render();
    }

    /**
     * Сбор значений из формы
     */
    collectFormValues() {
        const values = {};

        this.parameters.forEach(parameter => {
            const value = this.getParameterValue(parameter);
            if (value !== null && value !== undefined) {
                values[parameter.id] = value;
            }
        });

        return values;
    }

    /**
     * Получение значения параметра из формы
     */
    getParameterValue(parameter) {
        const inputElement = document.getElementById(`param_${parameter.id}`);
        if (!inputElement) return null;

        switch (parameter.type) {
            case 'string':
            case 'textarea':
            case 'url':
                return inputElement.value.trim() || null;

            case 'number':
            case 'currency':
            case 'percentage':
            case 'rating':
                const numValue = parseFloat(inputElement.value);
                return isNaN(numValue) ? null : numValue;

            case 'boolean':
                return inputElement.checked;

            case 'select':
                return inputElement.value || null;

            case 'multiselect':
                const selected = Array.from(inputElement.selectedOptions).map(option => option.value);
                return selected.length > 0 ? selected : null;

            case 'date':
                return inputElement.value || null;

            case 'range':
                const minInput = document.getElementById(`param_${parameter.id}_min`);
                const maxInput = document.getElementById(`param_${parameter.id}_max`);
                const min = parseFloat(minInput.value);
                const max = parseFloat(maxInput.value);

                if (isNaN(min) && isNaN(max)) return null;
                return { min: isNaN(min) ? null : min, max: isNaN(max) ? null : max };

            case 'coordinates':
                const latInput = document.getElementById(`param_${parameter.id}_lat`);
                const lngInput = document.getElementById(`param_${parameter.id}_lng`);
                const lat = parseFloat(latInput.value);
                const lng = parseFloat(lngInput.value);

                if (isNaN(lat) && isNaN(lng)) return null;
                return { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng };

            case 'file':
                const files = inputElement.files;
                if (files && files.length > 0) {
                    return { name: files[0].name, size: files[0].size, type: files[0].type };
                }
                return null;

            default:
                return inputElement.value || null;
        }
    }

    /**
     * Валидация значений
     */
    async validateValues(values) {
        let allValid = true;

        for (const parameter of this.parameters) {
            const value = values[parameter.id];
            const errors = await this.customParametersService.validateParameterValue(parameter.id, value);

            if (errors.length > 0) {
                this.validationErrors.set(parameter.id, errors.join(', '));
                allValid = false;
            }
        }

        return allValid;
    }

    /**
     * Форматирование значения для отображения
     */
    formatDisplayValue(parameter, value) {
        const valueModel = new ObjectCustomValueModel({
            parameter_id: parameter.id,
            value: value
        });

        return valueModel.formatDisplayValue(parameter);
    }

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Система событий
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    async emitEvent(event, data) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            for (const handler of handlers) {
                try {
                    await handler(data);
                } catch (error) {
                    console.warn(`Error in event handler for ${event}:`, error);
                }
            }
        }
    }

    /**
     * Рендеринг индикатора заполненности
     */
    renderFilledIndicator() {
        const filledCount = Object.keys(this.values).filter(key => {
            const value = this.values[key];
            return value !== undefined && value !== null && value !== '';
        }).length;

        const totalCount = this.parameters.length;

        if (totalCount === 0) return '';

        const percentage = Math.round((filledCount / totalCount) * 100);
        const color = percentage >= 75 ? 'green' : percentage >= 50 ? 'yellow' : percentage >= 25 ? 'orange' : 'red';

        return `
            <span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${color}-100 text-${color}-800">
                ${filledCount}/${totalCount} (${percentage}%)
            </span>
        `;
    }

    /**
     * Рендеринг панели инструментов
     */
    renderToolbar() {
        if (this.parameters.length === 0) return '';

        return `
            <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div class="flex items-center space-x-4">
                    <!-- Поиск -->
                    <div class="relative">
                        <input
                            type="text"
                            id="searchParameters"
                            placeholder="Поиск параметров..."
                            value="${this.searchQuery}"
                            class="pl-8 pr-4 py-1.5 text-xs border border-gray-300 rounded-md w-48 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                        <svg class="absolute left-2.5 top-2 w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                    </div>

                    <!-- Фильтры -->
                    <div class="flex items-center space-x-3">
                        <label class="flex items-center">
                            <input
                                type="checkbox"
                                id="showOnlyFilled"
                                ${this.showOnlyFilled ? 'checked' : ''}
                                class="h-3 w-3 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            >
                            <span class="ml-1.5 text-xs text-gray-700">Только заполненные</span>
                        </label>
                    </div>
                </div>

                <div class="flex items-center space-x-2">
                    ${this.isEditing ? `
                        <!-- Быстрые действия для режима редактирования -->
                        <div class="flex items-center space-x-2">
                            <button type="button" id="clearAllValues" class="text-xs text-red-600 hover:text-red-800 underline">
                                Очистить все
                            </button>
                        </div>
                    ` : ''}

                    <!-- Статус автосохранения -->
                    <div class="flex items-center space-x-2">
                        ${this.isAutoSaving ? `
                            <span class="flex items-center text-xs text-gray-500">
                                <svg class="animate-spin -ml-1 mr-1 h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Сохранение...
                            </span>
                        ` : `
                            <div id="saveStatus" class="text-xs text-gray-500"></div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Фильтрация параметров
     */
    filterParameters() {
        return this.parameters.filter(parameter => {
            // Фильтр по поиску
            if (this.searchQuery && !parameter.name.toLowerCase().includes(this.searchQuery.toLowerCase())) {
                return false;
            }

            // Фильтр "только заполненные"
            if (this.showOnlyFilled) {
                const value = this.values[parameter.id];
                if (value === undefined || value === null || value === '') {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Автосохранение с задержкой
     */
    async autoSave() {
        if (!this.isEditing) return;

        // Очищаем предыдущий таймер
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        // Устанавливаем новый таймер
        this.autoSaveTimeout = setTimeout(async () => {
            try {
                this.isAutoSaving = true;
                this.updateSaveStatus('Сохранение...');

                await this.performAutoSave();

                this.updateSaveStatus('✓ Сохранено', 'text-green-600');
            } catch (error) {
                this.updateSaveStatus('✗ Ошибка', 'text-red-600');
                console.error('Auto-save error:', error);
            } finally {
                this.isAutoSaving = false;

                // Скрываем статус через 2 секунды
                setTimeout(() => {
                    this.updateSaveStatus('');
                }, 2000);
            }
        }, 1000); // 1 секунда задержки
    }

    /**
     * Выполнение автосохранения (без смены режима редактирования)
     */
    async performAutoSave() {
        // Собираем значения из формы
        const newValues = this.collectFormValues();

        // Валидируем значения
        this.validationErrors.clear();
        const allValid = await this.validateValues(newValues);

        if (!allValid) {
            throw new Error('Ошибки валидации');
        }

        // Сохраняем значения
        const result = await this.objectCustomValuesService.setObjectValues(this.objectId, newValues);

        if (result.errors && result.errors.length > 0) {
            console.warn('Ошибки при автосохранении:', result.errors);
            throw new Error('Ошибки при сохранении: ' + result.errors.join(', '));
        }

        // Обновляем локальные данные (БЕЗ смены режима редактирования)
        this.values = newValues;

        // Эмитим событие об изменении
        this.emitEvent('valuesChanged', {
            objectId: this.objectId,
            values: newValues,
            result: result,
            isAutoSave: true
        });
    }

    /**
     * Обновление статуса сохранения
     */
    updateSaveStatus(text, className = 'text-gray-500') {
        const statusElement = document.getElementById('saveStatus');
        if (statusElement) {
            statusElement.textContent = text;
            statusElement.className = `text-xs ${className}`;
        }
    }


    /**
     * Очистка всех значений
     */
    async clearAllValues() {
        if (!confirm('Вы уверены, что хотите очистить все значения параметров для этого объекта?')) {
            return;
        }

        this.parameters.forEach(parameter => {
            const input = document.getElementById(`param_${parameter.id}`);
            if (input) {
                if (parameter.type === 'boolean') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            }
        });

        await this.autoSave();
    }


    /**
     * Обновление данных
     */
    async refresh() {
        await this.loadData();
        this.render();
    }

    /**
     * Инъекция стилей для SlimSelect (совместимых с фильтрами обработки)
     */
    injectSlimSelectStyles() {
        const styleId = 'object-custom-parameters-slimselect-styles';

        // Проверяем, не добавлены ли уже стили
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Стили SlimSelect для дополнительных параметров объекта */
            #object-custom-parameters-${this.objectId} .ss-main {
                min-height: 38px !important;
                border: 1px solid #d1d5db !important;
                border-radius: 6px !important;
                background-color: #ffffff !important;
                padding: 8px 12px !important;
                font-size: 14px !important;
                line-height: 1.25rem !important;
            }

            #object-custom-parameters-${this.objectId} .ss-main:focus-within {
                border-color: #6366f1 !important;
                outline: none !important;
                box-shadow: 0 0 0 1px #6366f1 !important;
            }

            #object-custom-parameters-${this.objectId} .ss-main.ss-disabled {
                background-color: #f9fafb !important;
                cursor: not-allowed !important;
            }

            #object-custom-parameters-${this.objectId} .ss-single-selected {
                color: #374151 !important;
            }

            #object-custom-parameters-${this.objectId} .ss-placeholder {
                color: #9ca3af !important;
            }

            /* Стили для выпадающего списка */
            #object-custom-parameters-${this.objectId} .ss-content {
                border: 1px solid #d1d5db !important;
                border-radius: 6px !important;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
            }

            #object-custom-parameters-${this.objectId} .ss-option {
                padding: 8px 12px !important;
                font-size: 14px !important;
                color: #374151 !important;
            }

            #object-custom-parameters-${this.objectId} .ss-option:hover {
                background-color: #f3f4f6 !important;
            }

            #object-custom-parameters-${this.objectId} .ss-option.ss-highlighted {
                background-color: #6366f1 !important;
                color: #ffffff !important;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        // Уничтожаем SlimSelect экземпляры
        this.selectInstances.forEach(instance => {
            try {
                instance.destroy();
            } catch (e) {
                // Игнорируем ошибки
            }
        });
        this.selectInstances.clear();

        // Удаляем инъецированные стили
        const styleElement = document.getElementById('object-custom-parameters-slimselect-styles');
        if (styleElement) {
            styleElement.remove();
        }

        // Очищаем обработчики событий
        this.eventHandlers.clear();

        // Очищаем ссылки
        this.containerElement = null;
        this.parameters = [];
        this.values = {};
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObjectCustomParametersPanel;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.ObjectCustomParametersPanel = ObjectCustomParametersPanel;
}