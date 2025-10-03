/**
 * ParameterEditModal - модальное окно создания/редактирования параметров
 * Следует принципам архитектуры v0.1 и SOLID
 */

class ParameterEditModal {
    constructor(customParametersService, validationService, errorHandler) {
        this.customParametersService = customParametersService;
        this.validationService = validationService;
        this.errorHandler = errorHandler;

        // Состояние модального окна
        this.isVisible = false;
        this.isEditMode = false;
        this.currentParameter = null;
        this.formData = {};
        this.validationErrors = {};

        // DOM элементы
        this.modal = null;
        this.form = null;

        // Обработчики событий
        this.eventHandlers = new Map();

        this.createModal();
    }

    /**
     * Создание модального окна
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'fixed inset-0 z-50 hidden overflow-y-auto';
        this.modal.innerHTML = `
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <!-- Modal -->
                <div class="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6">
                    <!-- Заголовок -->
                    <div class="mb-6">
                        <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                            Создать параметр
                        </h3>
                        <p class="mt-1 text-sm text-gray-600" id="modal-description">
                            Настройте дополнительный параметр для объектов недвижимости
                        </p>
                    </div>

                    <!-- Форма -->
                    <form id="parameter-form" class="space-y-6">
                        <!-- Основная информация -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Название -->
                            <div class="md:col-span-2">
                                <label for="param-name" class="block text-sm font-medium text-gray-700 mb-2">
                                    Название параметра *
                                </label>
                                <input
                                    type="text"
                                    id="param-name"
                                    name="name"
                                    required
                                    maxlength="100"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Введите название параметра"
                                >
                                <div class="mt-1 text-xs text-gray-500">
                                    Будет отображаться в форме редактирования объектов
                                </div>
                                <div id="name-error" class="hidden mt-1 text-sm text-red-600"></div>
                            </div>

                            <!-- Тип параметра -->
                            <div>
                                <label for="param-type" class="block text-sm font-medium text-gray-700 mb-2">
                                    Тип параметра *
                                </label>
                                <select
                                    id="param-type"
                                    name="type"
                                    required
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Выберите тип</option>
                                    ${Object.entries(PARAMETER_TYPES).map(([value, label]) => `
                                        <option value="${value}">${label}</option>
                                    `).join('')}
                                </select>
                                <div id="type-error" class="hidden mt-1 text-sm text-red-600"></div>
                            </div>

                            <!-- Порядок отображения -->
                            <div>
                                <label for="param-order" class="block text-sm font-medium text-gray-700 mb-2">
                                    Порядок отображения
                                </label>
                                <input
                                    type="number"
                                    id="param-order"
                                    name="display_order"
                                    min="0"
                                    step="1"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="0"
                                >
                                <div class="mt-1 text-xs text-gray-500">
                                    Меньшие числа отображаются первыми
                                </div>
                            </div>
                        </div>

                        <!-- Настройки активности -->
                        <div>
                            <div class="flex items-center">
                                <input
                                    type="checkbox"
                                    id="param-active"
                                    name="is_active"
                                    checked
                                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                >
                                <label for="param-active" class="ml-2 block text-sm text-gray-700">
                                    Активный параметр
                                </label>
                            </div>
                            <div class="mt-1 text-xs text-gray-500">
                                Неактивные параметры не отображаются в форме редактирования
                            </div>
                        </div>

                        <!-- Динамические поля в зависимости от типа -->
                        <div id="type-specific-fields" class="space-y-6">
                            <!-- Поля будут добавлены динамически -->
                        </div>

                        <!-- Настройки валидации -->
                        <div id="validation-section" class="border-t pt-6">
                            <h4 class="text-md font-medium text-gray-900 mb-4">Правила валидации</h4>
                            <div id="validation-fields" class="space-y-4">
                                <!-- Поля валидации будут добавлены динамически -->
                            </div>
                        </div>

                        <!-- Предпросмотр -->
                        <div id="preview-section" class="border-t pt-6">
                            <h4 class="text-md font-medium text-gray-900 mb-4">Предпросмотр</h4>
                            <div id="parameter-preview" class="p-4 bg-gray-50 rounded-lg">
                                <!-- Предпросмотр параметра -->
                            </div>
                        </div>
                    </form>

                    <!-- Кнопки действий -->
                    <div class="mt-6 flex justify-between">
                        <button
                            type="button"
                            id="cancel-btn"
                            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
                        >
                            Отмена
                        </button>
                        <div class="flex space-x-3">
                            <button
                                type="button"
                                id="preview-btn"
                                class="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-lg hover:bg-blue-200 focus:ring-2 focus:ring-blue-500"
                            >
                                Обновить предпросмотр
                            </button>
                            <button
                                type="submit"
                                id="save-btn"
                                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
                            >
                                Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.form = this.modal.querySelector('#parameter-form');
        this.setupEventListeners();
    }

    /**
     * Показать модальное окно для создания параметра
     */
    showCreate() {
        this.isEditMode = false;
        this.currentParameter = null;
        this.formData = {
            name: '',
            type: '',
            display_order: 0,
            is_active: true,
            validation: {},
            options: []
        };

        this.modal.querySelector('#modal-title').textContent = 'Создать параметр';
        this.modal.querySelector('#modal-description').textContent = 'Настройте новый дополнительный параметр для объектов недвижимости';

        this.resetForm();
        this.show();
    }

    /**
     * Показать модальное окно для редактирования параметра
     */
    async showEdit(parameterId) {
        try {
            this.isEditMode = true;
            this.currentParameter = await this.customParametersService.getParameter(parameterId);

            if (!this.currentParameter) {
                throw new Error('Параметр не найден');
            }

            this.formData = { ...this.currentParameter };

            this.modal.querySelector('#modal-title').textContent = 'Редактировать параметр';
            this.modal.querySelector('#modal-description').textContent = `Изменение параметра "${this.currentParameter.name}"`;

            this.populateForm();
            this.show();

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'ParameterEditModal',
                method: 'showEdit',
                params: { parameterId }
            });
        }
    }

    /**
     * Показать модальное окно
     */
    show() {
        this.isVisible = true;
        this.modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');

        // Фокус на первом поле
        setTimeout(() => {
            this.modal.querySelector('#param-name')?.focus();
        }, 100);

        this.updateTypeSpecificFields();
        this.updateValidationFields();
        this.updatePreview();
    }

    /**
     * Скрыть модальное окно
     */
    hide() {
        // Очищаем SlimSelect экземпляры
        if (this.slimSelectInstances) {
            this.slimSelectInstances.forEach(instance => {
                try {
                    instance.destroy();
                } catch (error) {
                    console.warn('Ошибка при очистке SlimSelect экземпляра:', error);
                }
            });
            this.slimSelectInstances = [];
        }

        this.isVisible = false;
        this.modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        this.resetForm();
    }

    /**
     * Сброс формы
     */
    resetForm() {
        this.form.reset();
        this.validationErrors = {};
        this.clearValidationErrors();

        // Устанавливаем значения по умолчанию
        this.form.querySelector('#param-active').checked = true;
        this.form.querySelector('#param-order').value = 0;
    }

    /**
     * Заполнение формы данными параметра
     */
    populateForm() {
        if (!this.currentParameter) return;

        const form = this.form;
        form.querySelector('#param-name').value = this.currentParameter.name || '';
        form.querySelector('#param-type').value = this.currentParameter.type || '';
        form.querySelector('#param-order').value = this.currentParameter.display_order || 0;
        form.querySelector('#param-active').checked = this.currentParameter.is_active !== false;

        this.updateTypeSpecificFields();
        this.updateValidationFields();
    }

    /**
     * Обновление полей, специфичных для типа
     */
    updateTypeSpecificFields() {
        const typeSelect = this.form.querySelector('#param-type');
        const selectedType = typeSelect.value;
        const container = this.form.querySelector('#type-specific-fields');

        container.innerHTML = '';

        switch (selectedType) {
            case 'select':
            case 'multiselect':
                this.renderOptionsField(container);
                break;

            case 'currency':
                this.renderCurrencyFields(container);
                break;

            case 'file':
                this.renderFileFields(container);
                break;

            case 'coordinates':
                this.renderCoordinatesFields(container);
                break;
        }

        // Переинициализируем SlimSelect после добавления новых select элементов
        setTimeout(() => this.initializeSlimSelects(), 100);
    }

    /**
     * Рендеринг поля опций для select/multiselect
     */
    renderOptionsField(container) {
        const options = this.formData.options || [];

        container.innerHTML = `
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Варианты выбора *
                </label>
                <div id="options-list" class="space-y-2 mb-3">
                    ${options.map((option, index) => `
                        <div class="flex items-center space-x-2">
                            <input
                                type="text"
                                value="${option}"
                                class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Вариант ${index + 1}"
                                data-option-index="${index}"
                            >
                            <button
                                type="button"
                                class="text-red-600 hover:text-red-800 p-2 remove-option-btn"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>
                        </div>
                    `).join('')}
                </div>
                <button
                    type="button"
                    id="add-option-btn"
                    class="flex items-center space-x-2 text-blue-600 hover:text-blue-800 text-sm"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    <span>Добавить вариант</span>
                </button>
                <div class="mt-1 text-xs text-gray-500">
                    Добавьте варианты выбора для пользователей
                </div>
            </div>
        `;

        // Обработчик добавления нового варианта
        container.querySelector('#add-option-btn').addEventListener('click', () => {
            const optionsList = container.querySelector('#options-list');
            const newIndex = optionsList.children.length;

            const newOptionDiv = document.createElement('div');
            newOptionDiv.className = 'flex items-center space-x-2';
            newOptionDiv.innerHTML = `
                <input
                    type="text"
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Вариант ${newIndex + 1}"
                    data-option-index="${newIndex}"
                >
                <button
                    type="button"
                    class="text-red-600 hover:text-red-800 p-2 remove-option-btn"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            `;

            optionsList.appendChild(newOptionDiv);
            newOptionDiv.querySelector('input').focus();

            // Эмитим событие для обновления предпросмотра
            this.form.dispatchEvent(new Event('input'));
        });
    }

    /**
     * Рендеринг полей для валюты
     */
    renderCurrencyFields(container) {
        const validation = this.formData.validation || {};

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Валюта
                    </label>
                    <select name="currency" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                        <option value="RUB" ${validation.currency === 'RUB' ? 'selected' : ''}>₽ Рублі</option>
                        <option value="USD" ${validation.currency === 'USD' ? 'selected' : ''}>$ Долари</option>
                        <option value="EUR" ${validation.currency === 'EUR' ? 'selected' : ''}>€ Євро</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Формат отображения
                    </label>
                    <select name="currency_format" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                        <option value="short" ${validation.currency_format === 'short' ? 'selected' : ''}>Краткий (1.5М)</option>
                        <option value="full" ${validation.currency_format === 'full' ? 'selected' : ''}>Полный (1 500 000)</option>
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг полей для файлов
     */
    renderFileFields(container) {
        const validation = this.formData.validation || {};
        const acceptedTypes = validation.file_types || [];

        container.innerHTML = `
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Допустимые типы файлов
                </label>
                <div class="space-y-2">
                    ${['image/*', 'application/pdf', '.doc,.docx', '.xls,.xlsx', '.txt'].map(type => `
                        <label class="flex items-center">
                            <input
                                type="checkbox"
                                name="file_types"
                                value="${type}"
                                ${acceptedTypes.includes(type) ? 'checked' : ''}
                                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            >
                            <span class="ml-2 text-sm text-gray-700">${this.getFileTypeLabel(type)}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="mt-3">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Максимальный размер (МБ)
                    </label>
                    <input
                        type="number"
                        name="max_file_size"
                        value="${validation.max_file_size || 10}"
                        min="1"
                        max="100"
                        class="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг полей для координат
     */
    renderCoordinatesFields(container) {
        const validation = this.formData.validation || {};

        container.innerHTML = `
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Формат координат
                </label>
                <select name="coordinate_format" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="decimal" ${validation.coordinate_format === 'decimal' ? 'selected' : ''}>Десятичные (55.7558, 37.6173)</option>
                    <option value="dms" ${validation.coordinate_format === 'dms' ? 'selected' : ''}>Градусы/минуты/секунды</option>
                </select>
            </div>
        `;
    }

    /**
     * Обновление полей валидации
     */
    updateValidationFields() {
        const typeSelect = this.form.querySelector('#param-type');
        const selectedType = typeSelect.value;
        const container = this.form.querySelector('#validation-fields');
        const validation = this.formData.validation || {};

        container.innerHTML = `
            <!-- Обязательность -->
            <div class="flex items-center">
                <input
                    type="checkbox"
                    id="required-checkbox"
                    name="required"
                    ${validation.required ? 'checked' : ''}
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                >
                <label for="required-checkbox" class="ml-2 block text-sm text-gray-700">
                    Обязательный параметр
                </label>
            </div>
        `;

        // Добавляем специфичные для типа поля валидации
        switch (selectedType) {
            case 'string':
            case 'textarea':
                container.innerHTML += this.renderStringValidation(validation);
                break;
            case 'number':
            case 'currency':
                container.innerHTML += this.renderNumberValidation(validation);
                break;
            case 'rating':
                container.innerHTML += this.renderRatingValidation(validation);
                break;
            case 'range':
                container.innerHTML += this.renderRangeValidation(validation);
                break;
            case 'percentage':
                container.innerHTML += this.renderPercentageValidation(validation);
                break;
        }

        // Переинициализируем SlimSelect после обновления полей валидации
        setTimeout(() => this.initializeSlimSelects(), 100);
    }

    /**
     * Рендеринг валидации для строк
     */
    renderStringValidation(validation) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Минимальная длина
                    </label>
                    <input
                        type="number"
                        name="min_length"
                        value="${validation.min_length || ''}"
                        min="0"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Максимальная длина
                    </label>
                    <input
                        type="number"
                        name="max_length"
                        value="${validation.max_length || ''}"
                        min="1"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Без ограничений"
                    >
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                    Шаблон (регулярное выражение)
                </label>
                <input
                    type="text"
                    name="pattern"
                    value="${validation.pattern || ''}"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="^[А-Яа-я\\s]+$"
                >
                <div class="mt-1 text-xs text-gray-500">
                    Необязательно. Пример: ^[А-Яа-я\\s]+$ (только русские буквы и пробелы)
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг валидации для чисел
     */
    renderNumberValidation(validation) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Минимальное значение
                    </label>
                    <input
                        type="number"
                        name="min_value"
                        value="${validation.min || validation.min_value || ''}"
                        step="any"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Без ограничений"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Максимальное значение
                    </label>
                    <input
                        type="number"
                        name="max_value"
                        value="${validation.max || validation.max_value || ''}"
                        step="any"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Без ограничений"
                    >
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг валидации для рейтинга
     */
    renderRatingValidation(validation) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Минимальный рейтинг
                    </label>
                    <input
                        type="number"
                        name="min_rating"
                        value="${validation.min || 1}"
                        min="1"
                        max="5"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Максимальный рейтинг
                    </label>
                    <input
                        type="number"
                        name="max_rating"
                        value="${validation.max || 5}"
                        min="2"
                        max="10"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                </div>
            </div>
        `;
    }

    /**
     * Обновление предпросмотра
     */
    updatePreview() {
        const previewContainer = this.form.querySelector('#parameter-preview');
        const currentData = this.collectFormData();

        if (!currentData.name || !currentData.type) {
            previewContainer.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <p>Заполните название и тип параметра для предпросмотра</p>
                </div>
            `;
            return;
        }

        // Создаем временный компонент для предпросмотра
        previewContainer.innerHTML = `
            <div class="border border-gray-200 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    ${currentData.name}
                    ${currentData.validation?.required ? ' *' : ''}
                </label>
                ${this.renderParameterInput(currentData)}
                <div class="mt-2 text-xs text-gray-500">
                    Тип: ${PARAMETER_TYPES[currentData.type]} |
                    Порядок: ${currentData.display_order || 0} |
                    ${currentData.is_active ? 'Активен' : 'Неактивен'}
                </div>
            </div>
        `;

        // Переинициализируем SlimSelect после обновления предпросмотра
        setTimeout(() => this.initializeSlimSelects(), 100);
    }

    /**
     * Рендеринг поля ввода для предпросмотра
     */
    renderParameterInput(paramData) {
        switch (paramData.type) {
            case 'string':
                return `<input type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Введите значение" disabled>`;

            case 'textarea':
                return `<textarea rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Введите текст" disabled></textarea>`;

            case 'number':
            case 'currency':
                return `<input type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="0" disabled>`;

            case 'boolean':
                return `<input type="checkbox" class="h-4 w-4 text-blue-600 border-gray-300 rounded" disabled>`;

            case 'select':
                const selectOptions = paramData.options || [];
                return `
                    <select class="w-full px-3 py-2 border border-gray-300 rounded-lg" disabled>
                        <option>Выберите значение</option>
                        ${selectOptions.map(opt => `<option>${opt}</option>`).join('')}
                    </select>
                `;

            case 'rating':
                const maxRating = paramData.validation?.max || 5;
                return `
                    <div class="flex items-center space-x-1">
                        ${Array.from({length: maxRating}, (_, i) => `
                            <svg class="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                        `).join('')}
                    </div>
                `;

            case 'date':
                return `<input type="date" class="w-full px-3 py-2 border border-gray-300 rounded-lg" disabled>`;

            default:
                return `<input type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Значение параметра" disabled>`;
        }
    }

    /**
     * Сбор данных из формы
     */
    collectFormData() {
        const formData = new FormData(this.form);
        const data = {
            name: formData.get('name'),
            type: formData.get('type'),
            display_order: parseInt(formData.get('display_order')) || 0,
            is_active: formData.get('is_active') === 'on',
            validation: {},
            options: []
        };

        // Собираем опции для select/multiselect
        if (data.type === 'select' || data.type === 'multiselect') {
            const optionInputs = this.form.querySelectorAll('input[data-option-index]');
            data.options = Array.from(optionInputs)
                .map(input => input.value.trim())
                .filter(value => value);
        }

        // Собираем валидацию
        const validation = {};

        if (formData.get('required') === 'on') validation.required = true;

        // Числовые ограничения
        const minValue = formData.get('min_value') || formData.get('min_rating');
        const maxValue = formData.get('max_value') || formData.get('max_rating');
        if (minValue) validation.min = parseFloat(minValue);
        if (maxValue) validation.max = parseFloat(maxValue);

        // Строковые ограничения
        const minLength = formData.get('min_length');
        const maxLength = formData.get('max_length');
        const pattern = formData.get('pattern');
        if (minLength) validation.min_length = parseInt(minLength);
        if (maxLength) validation.max_length = parseInt(maxLength);
        if (pattern) validation.pattern = pattern;

        // Файловые ограничения
        const fileTypes = formData.getAll('file_types');
        const maxFileSize = formData.get('max_file_size');
        if (fileTypes.length > 0) validation.file_types = fileTypes;
        if (maxFileSize) validation.max_file_size = parseInt(maxFileSize);

        // Валютные настройки
        const currency = formData.get('currency');
        const currencyFormat = formData.get('currency_format');
        if (currency) validation.currency = currency;
        if (currencyFormat) validation.currency_format = currencyFormat;

        // Координаты
        const coordinateFormat = formData.get('coordinate_format');
        if (coordinateFormat) validation.coordinate_format = coordinateFormat;

        data.validation = validation;

        return data;
    }

    /**
     * Инициализация SlimSelect для всех выпадающих списков
     */
    initializeSlimSelects() {
        // Проверяем доступность SlimSelect
        if (typeof SlimSelect === 'undefined') {
            console.warn('SlimSelect не загружен для ParameterEditModal');
            return;
        }

        const selectElements = this.modal.querySelectorAll('select');
        this.slimSelectInstances = [];

        selectElements.forEach(selectElement => {
            try {
                const instance = new SlimSelect({
                    select: selectElement,
                    settings: {
                        allowDeselect: !selectElement.hasAttribute('required'),
                        placeholder: selectElement.hasAttribute('required') ? 'Выберите значение *' : 'Выберите значение...',
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
        // Инициализация SlimSelect для всех выпадающих списков
        this.initializeSlimSelects();

        // Закрытие модального окна
        this.modal.querySelector('#cancel-btn').addEventListener('click', () => this.hide());

        // Обработка Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Изменение типа параметра
        this.form.querySelector('#param-type').addEventListener('change', () => {
            this.updateTypeSpecificFields();
            this.updateValidationFields();
            this.updatePreview();
        });

        // Обновление предпросмотра при изменении формы
        this.form.addEventListener('input', () => {
            this.updatePreview();
        });

        // Кнопка обновления предпросмотра
        this.modal.querySelector('#preview-btn').addEventListener('click', () => {
            this.updatePreview();
        });

        // Отправка формы
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Обработка кнопок удаления опций через делегирование
        this.modal.addEventListener('click', (e) => {
            if (e.target.closest('.remove-option-btn')) {
                const button = e.target.closest('.remove-option-btn');
                button.parentElement.remove();
                this.form.dispatchEvent(new Event('input'));
            }
        });
    }

    /**
     * Обработка отправки формы
     */
    async handleSubmit() {
        try {
            const formData = this.collectFormData();

            // Валидация
            const errors = await this.validateForm(formData);
            if (errors.length > 0) {
                this.showValidationErrors(errors);
                return;
            }

            // Сохранение
            let savedParameter;
            if (this.isEditMode) {
                savedParameter = await this.customParametersService.updateParameter(this.currentParameter.id, formData);
            } else {
                savedParameter = await this.customParametersService.createParameter(formData);
            }

            // Успешно сохранено
            this.emitEvent('parameterSaved', {
                parameter: savedParameter,
                isEdit: this.isEditMode
            });

            this.hide();

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'ParameterEditModal',
                method: 'handleSubmit'
            });
        }
    }

    /**
     * Валидация формы
     */
    async validateForm(data) {
        const errors = [];

        // Базовая валидация
        if (!data.name?.trim()) {
            errors.push('Название параметра обязательно');
        }

        if (!data.type) {
            errors.push('Тип параметра обязателен');
        }

        // Валидация опций для select/multiselect
        if ((data.type === 'select' || data.type === 'multiselect') && data.options.length === 0) {
            errors.push('Добавьте хотя бы один вариант выбора');
        }

        // Используем сервис для дополнительной валидации
        try {
            const serviceErrors = await this.customParametersService.validateParameterData(data);
            errors.push(...serviceErrors);
        } catch (error) {
            // Игнорируем ошибки валидации сервиса, если они есть
        }

        return errors;
    }

    /**
     * Показать ошибки валидации
     */
    showValidationErrors(errors) {
        // Очищаем предыдущие ошибки
        this.clearValidationErrors();

        // Показываем новые ошибки
        errors.forEach((error, index) => {
            if (index === 0) {
                // Первую ошибку показываем для поля name
                const errorElement = this.form.querySelector('#name-error');
                if (errorElement) {
                    errorElement.textContent = error;
                    errorElement.classList.remove('hidden');
                }
            } else {
                // Остальные ошибки показываем в виде уведомления
                console.warn('Ошибка валидации:', error);
            }
        });
    }

    /**
     * Очистка ошибок валидации
     */
    clearValidationErrors() {
        const errorElements = this.form.querySelectorAll('[id$="-error"]');
        errorElements.forEach(element => {
            element.classList.add('hidden');
            element.textContent = '';
        });
    }

    /**
     * Получение описания типа файла
     */
    getFileTypeLabel(type) {
        const labels = {
            'image/*': 'Изображения (JPG, PNG, GIF)',
            'application/pdf': 'PDF документы',
            '.doc,.docx': 'Документы Word',
            '.xls,.xlsx': 'Таблицы Excel',
            '.txt': 'Текстовые файлы'
        };
        return labels[type] || type;
    }

    /**
     * События
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

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
     * Очистка ресурсов
     */
    destroy() {
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
        this.eventHandlers.clear();
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParameterEditModal;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.ParameterEditModal = ParameterEditModal;
}