/**
 * SegmentModal - компонент управления модальными окнами сегментов
 * Извлечён из SegmentsManager для соблюдения принципа единственной ответственности
 */

class SegmentModal {
    constructor(validationService, configService) {
        this.validationService = validationService;
        this.configService = configService;
        
        this.modalElement = null;
        this.currentMode = null; // 'create' | 'edit'
        this.currentSegmentId = null;
        this.isVisible = false;
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Кэш элементов формы
        this.formElements = {};
        
        this.initialize();
    }

    /**
     * Инициализация модального окна
     */
    initialize() {
        this.modalElement = document.getElementById('segmentModal');
        if (!this.modalElement) {
            console.warn('⚠️ Элемент модального окна сегментов не найден (нормально для страниц без модального окна)');
            return;
        }

        // Кэшируем элементы формы
        this.cacheFormElements();
        
        // Устанавливаем обработчики событий
        this.setupEventListeners();
        
        // Инициализируем SlimSelect для выпадающих списков
        this.initializeSelects();
    }

    /**
     * Кэширование элементов формы для производительности
     */
    cacheFormElements() {
        this.formElements = {
            // Основные поля
            segmentName: document.getElementById('segmentName'),
            segmentDescription: document.getElementById('segmentDescription'),
            
            // Фильтры серий домов
            houseSeriesSelect: document.getElementById('houseSeriesSelect'),
            
            // Фильтры классов домов
            houseClassSelect: document.getElementById('houseClassSelect'),
            
            // Фильтры материалов стен
            wallMaterialSelect: document.getElementById('wallMaterialSelect'),
            
            // Диапазоны этажей
            floorsFrom: document.getElementById('floorsFrom'),
            floorsTo: document.getElementById('floorsTo'),
            
            // Диапазоны года постройки
            buildYearFrom: document.getElementById('buildYearFrom'),
            buildYearTo: document.getElementById('buildYearTo'),
            
            // Типы недвижимости
            propertyTypeCheckboxes: document.querySelectorAll('input[name="propertyType"]'),
            
            // Кнопки управления
            saveButton: document.getElementById('saveSegmentButton'),
            cancelButton: document.getElementById('cancelSegmentButton'),
            deleteButton: document.getElementById('deleteSegmentButton'),
            
            // Заголовок модального окна
            modalTitle: document.querySelector('#segmentModal .modal-title'),
            
            // Форма
            form: document.getElementById('segmentForm')
        };

        // Проверяем наличие критически важных элементов
        const requiredElements = ['segmentName', 'saveButton', 'cancelButton'];
        const missingElements = requiredElements.filter(name => !this.formElements[name]);
        
        if (missingElements.length > 0) {
            const debugEnabled = this.configService?.get('debug.enabled') || false;
            if (debugEnabled) {
                console.warn('⚠️ Отсутствуют элементы формы сегмента:', missingElements, '(нормально для страниц без модального окна)');
            }
        }
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Кнопка сохранения
        if (this.formElements.saveButton) {
            this.formElements.saveButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleSave();
            });
        }

        // Кнопка отмены
        if (this.formElements.cancelButton) {
            this.formElements.cancelButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.hide();
            });
        }

        // Кнопка удаления (только в режиме редактирования)
        if (this.formElements.deleteButton) {
            this.formElements.deleteButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleDelete();
            });
        }

        // Валидация в реальном времени
        if (this.formElements.segmentName) {
            this.formElements.segmentName.addEventListener('input', () => {
                this.validateField('segmentName');
            });
        }

        // Валидация диапазонов
        if (this.formElements.floorsFrom) {
            this.formElements.floorsFrom.addEventListener('input', () => {
                this.validateRangeFields('floors');
            });
        }

        if (this.formElements.floorsTo) {
            this.formElements.floorsTo.addEventListener('input', () => {
                this.validateRangeFields('floors');
            });
        }

        if (this.formElements.buildYearFrom) {
            this.formElements.buildYearFrom.addEventListener('input', () => {
                this.validateRangeFields('buildYear');
            });
        }

        if (this.formElements.buildYearTo) {
            this.formElements.buildYearTo.addEventListener('input', () => {
                this.validateRangeFields('buildYear');
            });
        }

        // Закрытие по ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Закрытие по клику на backdrop
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                const allowBackdropClose = this.configService?.get('ui.modal.backdropClick') !== false;
                if (allowBackdropClose) {
                    this.hide();
                }
            }
        });
    }

    /**
     * Инициализация SlimSelect для выпадающих списков
     */
    initializeSelects() {
        // Инициализация будет выполнена после загрузки справочных данных
        // через метод updateSelectOptions
    }

    /**
     * Показать модальное окно для создания сегмента
     * @param {string} mapAreaId - ID области карты
     */
    showCreateModal(mapAreaId) {
        if (!this.modalElement) {
            console.warn('⚠️ SegmentModal не инициализирован, модальное окно не может быть показано');
            return;
        }
        
        this.currentMode = 'create';
        this.currentSegmentId = null;
        
        // Сбрасываем форму
        this.resetForm();
        
        // Устанавливаем заголовок
        this.setTitle('Создание сегмента');
        
        // Скрываем кнопку удаления
        this.toggleDeleteButton(false);
        
        // Сохраняем ID области
        this.mapAreaId = mapAreaId;
        
        // Показываем модальное окно
        this.show();
        
        // Фокус на поле имени
        this.focusNameField();
        
        // Уведомляем слушателей
        this.emit('modal:opened', { mode: 'create', mapAreaId });
    }

    /**
     * Показать модальное окно для редактирования сегмента
     * @param {object} segment - данные сегмента
     */
    showEditModal(segment) {
        if (!this.modalElement) {
            console.warn('⚠️ SegmentModal не инициализирован, модальное окно не может быть показано');
            return;
        }
        
        this.currentMode = 'edit';
        this.currentSegmentId = segment.id;
        
        // Заполняем форму данными сегмента
        this.fillForm(segment);
        
        // Устанавливаем заголовок
        this.setTitle('Редактирование сегмента');
        
        // Показываем кнопку удаления
        this.toggleDeleteButton(true);
        
        // Сохраняем ID области
        this.mapAreaId = segment.map_area_id;
        
        // Показываем модальное окно
        this.show();
        
        // Фокус на поле имени
        this.focusNameField();
        
        // Уведомляем слушателей
        this.emit('modal:opened', { mode: 'edit', segment });
    }

    /**
     * Показать модальное окно
     */
    show() {
        if (!this.modalElement) {
            console.error('Модальное окно не инициализировано');
            return;
        }

        this.modalElement.style.display = 'block';
        this.modalElement.classList.add('show');
        document.body.classList.add('modal-open');
        
        this.isVisible = true;

        // Анимация появления
        const animationDuration = this.configService?.get('ui.modal.animationDuration') || 300;
        setTimeout(() => {
            this.modalElement.classList.add('fade-in');
        }, 10);
    }

    /**
     * Скрыть модальное окно
     */
    hide() {
        if (!this.modalElement || !this.isVisible) {
            return;
        }

        // Анимация исчезновения
        this.modalElement.classList.remove('fade-in');
        this.modalElement.classList.add('fade-out');
        
        const animationDuration = this.configService?.get('ui.modal.animationDuration') || 300;
        setTimeout(() => {
            this.modalElement.style.display = 'none';
            this.modalElement.classList.remove('show', 'fade-out');
            document.body.classList.remove('modal-open');
            
            this.isVisible = false;
            
            // Очищаем данные
            this.currentMode = null;
            this.currentSegmentId = null;
            this.mapAreaId = null;
            
            // Уведомляем слушателей
            this.emit('modal:closed');
            
        }, animationDuration);
    }

    /**
     * Установка заголовка модального окна
     */
    setTitle(title) {
        if (this.formElements.modalTitle) {
            this.formElements.modalTitle.textContent = title;
        }
    }

    /**
     * Показать/скрыть кнопку удаления
     */
    toggleDeleteButton(show) {
        if (this.formElements.deleteButton) {
            this.formElements.deleteButton.style.display = show ? 'inline-block' : 'none';
        }
    }

    /**
     * Установка фокуса на поле имени
     */
    focusNameField() {
        if (this.formElements.segmentName) {
            setTimeout(() => {
                this.formElements.segmentName.focus();
                this.formElements.segmentName.select();
            }, 100);
        }
    }

    /**
     * Сброс формы к начальному состоянию
     */
    resetForm() {
        if (this.formElements.form) {
            this.formElements.form.reset();
        }

        // Очищаем ошибки валидации
        this.clearValidationErrors();

        // Сбрасываем множественный выбор
        this.resetMultipleSelects();

        // Сбрасываем чекбоксы
        this.resetCheckboxes();
    }

    /**
     * Заполнение формы данными сегмента
     */
    fillForm(segment) {
        // Основные поля
        if (this.formElements.segmentName) {
            this.formElements.segmentName.value = segment.name || '';
        }

        if (this.formElements.segmentDescription) {
            this.formElements.segmentDescription.value = segment.description || '';
        }

        // Диапазоны
        if (this.formElements.floorsFrom && segment.filters?.floors_from) {
            this.formElements.floorsFrom.value = segment.filters.floors_from;
        }

        if (this.formElements.floorsTo && segment.filters?.floors_to) {
            this.formElements.floorsTo.value = segment.filters.floors_to;
        }

        if (this.formElements.buildYearFrom && segment.filters?.build_year_from) {
            this.formElements.buildYearFrom.value = segment.filters.build_year_from;
        }

        if (this.formElements.buildYearTo && segment.filters?.build_year_to) {
            this.formElements.buildYearTo.value = segment.filters.build_year_to;
        }

        // Множественный выбор (будет установлен через updateSelectOptions)
        this.pendingSelectValues = {
            houseSeries: segment.filters?.house_series_id || [],
            houseClass: segment.filters?.house_class_id || [],
            wallMaterial: segment.filters?.wall_material_id || []
        };

        // Чекбоксы типов недвижимости
        this.setCheckboxValues('propertyType', segment.filters?.property_type || []);
    }

    /**
     * Установка значений чекбоксов
     */
    setCheckboxValues(name, values) {
        if (this.formElements.propertyTypeCheckboxes) {
            this.formElements.propertyTypeCheckboxes.forEach(checkbox => {
                checkbox.checked = values.includes(checkbox.value);
            });
        }
    }

    /**
     * Сброс множественного выбора
     */
    resetMultipleSelects() {
        // Будет реализовано при инициализации SlimSelect
        this.pendingSelectValues = null;
    }

    /**
     * Сброс чекбоксов
     */
    resetCheckboxes() {
        if (this.formElements.propertyTypeCheckboxes) {
            this.formElements.propertyTypeCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
        }
    }

    /**
     * Получение данных формы
     */
    getFormData() {
        const data = {
            name: this.formElements.segmentName?.value?.trim() || '',
            description: this.formElements.segmentDescription?.value?.trim() || '',
            map_area_id: this.mapAreaId,
            filters: {}
        };

        // Диапазоны этажей
        const floorsFrom = parseInt(this.formElements.floorsFrom?.value);
        const floorsTo = parseInt(this.formElements.floorsTo?.value);
        
        if (!isNaN(floorsFrom)) data.filters.floors_from = floorsFrom;
        if (!isNaN(floorsTo)) data.filters.floors_to = floorsTo;

        // Диапазоны года постройки
        const buildYearFrom = parseInt(this.formElements.buildYearFrom?.value);
        const buildYearTo = parseInt(this.formElements.buildYearTo?.value);
        
        if (!isNaN(buildYearFrom)) data.filters.build_year_from = buildYearFrom;
        if (!isNaN(buildYearTo)) data.filters.build_year_to = buildYearTo;

        // Множественный выбор (получаем из SlimSelect инстансов)
        data.filters.house_series_id = this.getSelectValues('houseSeries');
        data.filters.house_class_id = this.getSelectValues('houseClass');
        data.filters.wall_material_id = this.getSelectValues('wallMaterial');

        // Типы недвижимости из чекбоксов
        data.filters.property_type = this.getCheckboxValues('propertyType');

        // Добавляем ID если редактируем
        if (this.currentMode === 'edit' && this.currentSegmentId) {
            data.id = this.currentSegmentId;
        }

        return data;
    }

    /**
     * Получение значений из множественного селекта
     */
    getSelectValues(selectName) {
        // Заглушка - будет реализовано при внедрении SlimSelect
        return [];
    }

    /**
     * Получение значений чекбоксов
     */
    getCheckboxValues(name) {
        if (name === 'propertyType' && this.formElements.propertyTypeCheckboxes) {
            return Array.from(this.formElements.propertyTypeCheckboxes)
                .filter(checkbox => checkbox.checked)
                .map(checkbox => checkbox.value);
        }
        return [];
    }

    /**
     * Валидация всей формы
     */
    validateForm() {
        const formData = this.getFormData();
        const validationResult = this.validationService.validate('segment', formData);
        
        if (!validationResult.isValid) {
            this.showValidationErrors(validationResult.errors);
            return false;
        }

        this.clearValidationErrors();
        return true;
    }

    /**
     * Валидация отдельного поля
     */
    validateField(fieldName) {
        const formData = this.getFormData();
        let isValid = true;
        let errors = [];

        switch (fieldName) {
            case 'segmentName':
                if (!formData.name) {
                    errors.push('Имя сегмента обязательно');
                    isValid = false;
                } else if (formData.name.length < 2) {
                    errors.push('Имя сегмента слишком короткое');
                    isValid = false;
                }
                break;
        }

        this.showFieldErrors(fieldName, errors);
        return isValid;
    }

    /**
     * Валидация полей диапазонов
     */
    validateRangeFields(rangeType) {
        const formData = this.getFormData();
        let isValid = true;
        const errors = [];

        if (rangeType === 'floors') {
            const from = formData.filters.floors_from;
            const to = formData.filters.floors_to;

            if (from !== undefined && to !== undefined && from > to) {
                errors.push('Минимальное значение не может быть больше максимального');
                isValid = false;
            }

            this.showRangeErrors('floors', errors);
            
        } else if (rangeType === 'buildYear') {
            const from = formData.filters.build_year_from;
            const to = formData.filters.build_year_to;

            if (from !== undefined && to !== undefined && from > to) {
                errors.push('Минимальный год не может быть больше максимального');
                isValid = false;
            }

            this.showRangeErrors('buildYear', errors);
        }

        return isValid;
    }

    /**
     * Показ ошибок валидации формы
     */
    showValidationErrors(errors) {
        // Показываем общие ошибки в алерте или специальном блоке
        const errorContainer = document.getElementById('segmentFormErrors');
        if (errorContainer) {
            errorContainer.innerHTML = errors.map(error => 
                `<div class="alert alert-danger">${error}</div>`
            ).join('');
            errorContainer.style.display = 'block';
        } else {
            // Fallback - показываем в алерте
            alert('Ошибки валидации:\n' + errors.join('\n'));
        }
    }

    /**
     * Показ ошибок для конкретного поля
     */
    showFieldErrors(fieldName, errors) {
        const field = this.formElements[fieldName];
        if (!field) return;

        // Убираем предыдущие ошибки
        field.classList.remove('is-invalid');
        const existingFeedback = field.parentElement?.querySelector('.invalid-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Показываем новые ошибки
        if (errors.length > 0) {
            field.classList.add('is-invalid');
            const feedback = document.createElement('div');
            feedback.className = 'invalid-feedback';
            feedback.textContent = errors.join(', ');
            field.parentElement?.appendChild(feedback);
        }
    }

    /**
     * Показ ошибок для диапазонов
     */
    showRangeErrors(rangeType, errors) {
        const fromField = this.formElements[`${rangeType}From`];
        const toField = this.formElements[`${rangeType}To`];

        [fromField, toField].forEach(field => {
            if (field) {
                field.classList.toggle('is-invalid', errors.length > 0);
            }
        });

        // Показываем ошибку под полями диапазона
        const container = fromField?.parentElement?.parentElement;
        if (container) {
            let errorElement = container.querySelector('.range-error');
            
            if (errors.length > 0) {
                if (!errorElement) {
                    errorElement = document.createElement('div');
                    errorElement.className = 'range-error text-danger small mt-1';
                    container.appendChild(errorElement);
                }
                errorElement.textContent = errors.join(', ');
            } else if (errorElement) {
                errorElement.remove();
            }
        }
    }

    /**
     * Очистка всех ошибок валидации
     */
    clearValidationErrors() {
        // Очищаем общие ошибки
        const errorContainer = document.getElementById('segmentFormErrors');
        if (errorContainer) {
            errorContainer.style.display = 'none';
            errorContainer.innerHTML = '';
        }

        // Очищаем ошибки полей
        Object.values(this.formElements).forEach(element => {
            if (element && element.classList) {
                element.classList.remove('is-invalid');
            }
        });

        // Удаляем все блоки с ошибками
        this.modalElement?.querySelectorAll('.invalid-feedback, .range-error').forEach(el => {
            el.remove();
        });
    }

    /**
     * Обработка сохранения
     */
    async handleSave() {
        try {
            // Валидируем форму
            if (!this.validateForm()) {
                return;
            }

            // Получаем данные
            const formData = this.getFormData();

            // Добавляем timestamps
            if (this.currentMode === 'create') {
                formData.created_at = new Date();
                formData.updated_at = new Date();
            } else {
                formData.updated_at = new Date();
            }

            // Уведомляем о сохранении
            const eventData = {
                mode: this.currentMode,
                data: formData,
                segmentId: this.currentSegmentId
            };

            this.emit('segment:save', eventData);

        } catch (error) {
            console.error('Ошибка при сохранении сегмента:', error);
            this.emit('segment:error', { action: 'save', error });
        }
    }

    /**
     * Обработка удаления
     */
    async handleDelete() {
        if (this.currentMode !== 'edit' || !this.currentSegmentId) {
            return;
        }

        // Подтверждение удаления
        const confirmed = confirm('Вы уверены, что хотите удалить этот сегмент? Это действие нельзя отменить.');
        
        if (confirmed) {
            try {
                this.emit('segment:delete', { 
                    segmentId: this.currentSegmentId 
                });
            } catch (error) {
                console.error('Ошибка при удалении сегмента:', error);
                this.emit('segment:error', { action: 'delete', error });
            }
        }
    }

    /**
     * Обновление опций в выпадающих списках
     * @param {string} selectType - тип селекта ('houseSeries', 'houseClass', 'wallMaterial')
     * @param {Array} options - массив опций {id, name}
     */
    updateSelectOptions(selectType, options) {
        // Заглушка для интеграции со SlimSelect
        // Будет реализовано при внедрении библиотеки
        
        // Сохраняем опции для будущего использования
        if (!this.selectOptions) {
            this.selectOptions = {};
        }
        this.selectOptions[selectType] = options;

        // Если есть ожидающие значения, устанавливаем их
        if (this.pendingSelectValues && this.pendingSelectValues[selectType]) {
            // Устанавливаем значения после создания SlimSelect
        }
    }

    /**
     * Добавление слушателя событий
     */
    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * Удаление слушателя событий
     */
    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Генерация события
     */
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
     * Получение текущего состояния
     */
    getState() {
        return {
            isVisible: this.isVisible,
            currentMode: this.currentMode,
            currentSegmentId: this.currentSegmentId,
            mapAreaId: this.mapAreaId,
            hasUnsavedChanges: this.hasUnsavedChanges()
        };
    }

    /**
     * Проверка наличия несохранённых изменений
     */
    hasUnsavedChanges() {
        if (!this.isVisible) {
            return false;
        }

        // Проверяем изменились ли данные формы
        // Простая реализация - можно улучшить
        const formData = this.getFormData();
        
        if (this.currentMode === 'create') {
            return formData.name !== '' || 
                   formData.description !== '' ||
                   Object.keys(formData.filters).some(key => {
                       const value = formData.filters[key];
                       return Array.isArray(value) ? value.length > 0 : value !== undefined;
                   });
        }

        // Для режима редактирования нужно сравнить с исходными данными
        // Требует сохранения исходного состояния при открытии
        return false;
    }

    /**
     * Уничтожение компонента
     */
    destroy() {
        // Удаляем все обработчики событий
        this.eventHandlers.clear();
        
        // Очищаем ссылки на элементы
        this.formElements = {};
        this.modalElement = null;
        
        // Очищаем данные
        this.currentMode = null;
        this.currentSegmentId = null;
        this.mapAreaId = null;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentModal;
} else {
    window.SegmentModal = SegmentModal;
}