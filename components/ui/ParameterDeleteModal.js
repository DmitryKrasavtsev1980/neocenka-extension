/**
 * ParameterDeleteModal - модальное окно подтверждения удаления параметра
 * Следует принципам архитектуры v0.1 и SOLID
 */

class ParameterDeleteModal {
    constructor(customParametersService, objectCustomValuesService, errorHandler) {
        this.customParametersService = customParametersService;
        this.objectCustomValuesService = objectCustomValuesService;
        this.errorHandler = errorHandler;

        // Состояние модального окна
        this.isVisible = false;
        this.currentParameter = null;
        this.usageStats = null;
        this.isDeleting = false;

        // DOM элементы
        this.modal = null;

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
                <div class="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                    <!-- Иконка предупреждения -->
                    <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                        <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                        </svg>
                    </div>

                    <!-- Содержимое -->
                    <div class="text-center">
                        <h3 class="text-lg leading-6 font-medium text-gray-900 mb-2" id="modal-title">
                            Удалить параметр?
                        </h3>
                        <div id="modal-content">
                            <!-- Контент будет заполнен динамически -->
                        </div>
                    </div>

                    <!-- Кнопки действий -->
                    <div class="mt-6 flex justify-center space-x-4">
                        <button
                            type="button"
                            id="cancel-btn"
                            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            id="delete-btn"
                            class="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 flex items-center space-x-2"
                        >
                            <span>Удалить</span>
                            <div id="delete-spinner" class="hidden animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.setupEventListeners();
    }

    /**
     * Показать модальное окно удаления
     */
    async show(parameterId) {
        try {
            // Загружаем информацию о параметре
            this.currentParameter = await this.customParametersService.getParameter(parameterId);
            if (!this.currentParameter) {
                throw new Error('Параметр не найден');
            }

            // Загружаем статистику использования
            await this.loadUsageStats(parameterId);

            // Обновляем контент модального окна
            this.updateContent();

            // Показываем модальное окно
            this.isVisible = true;
            this.modal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');

            // Фокус на кнопке отмены для безопасности
            setTimeout(() => {
                this.modal.querySelector('#cancel-btn')?.focus();
            }, 100);

        } catch (error) {
            await this.errorHandler?.handleError(error, {
                component: 'ParameterDeleteModal',
                method: 'show',
                params: { parameterId }
            });
        }
    }

    /**
     * Скрыть модальное окно
     */
    hide() {
        this.isVisible = false;
        this.modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        this.reset();
    }

    /**
     * Сброс состояния
     */
    reset() {
        this.currentParameter = null;
        this.usageStats = null;
        this.isDeleting = false;

        const deleteBtn = this.modal.querySelector('#delete-btn');
        const spinner = this.modal.querySelector('#delete-spinner');
        deleteBtn.disabled = false;
        spinner?.classList.add('hidden');
    }

    /**
     * Загрузка статистики использования параметра
     */
    async loadUsageStats(parameterId) {
        try {
            // Получаем статистику использования от сервиса значений
            this.usageStats = await this.objectCustomValuesService.getParameterUsageStats(parameterId);
        } catch (error) {
            // Если не удалось загрузить статистику, устанавливаем значения по умолчанию
            this.usageStats = {
                totalObjects: 0,
                objectsWithValue: 0,
                objectsWithoutValue: 0,
                percentageUsed: 0
            };
        }
    }

    /**
     * Обновление содержимого модального окна
     */
    updateContent() {
        const content = this.modal.querySelector('#modal-content');
        const hasUsage = this.usageStats && this.usageStats.objectsWithValue > 0;

        content.innerHTML = `
            <div class="text-left">
                <!-- Информация о параметре -->
                <div class="mb-4 p-3 bg-gray-50 rounded-lg">
                    <h4 class="font-medium text-gray-900 mb-2">${this.currentParameter.name}</h4>
                    <div class="text-sm text-gray-600 space-y-1">
                        <div class="flex justify-between">
                            <span>Тип:</span>
                            <span class="font-medium">${PARAMETER_TYPES[this.currentParameter.type] || this.currentParameter.type}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Статус:</span>
                            <span class="font-medium ${this.currentParameter.is_active !== false ? 'text-green-600' : 'text-gray-600'}">
                                ${this.currentParameter.is_active !== false ? 'Активен' : 'Неактивен'}
                            </span>
                        </div>
                        ${this.currentParameter.created_at ? `
                            <div class="flex justify-between">
                                <span>Создан:</span>
                                <span class="font-medium">${new Date(this.currentParameter.created_at).toLocaleDateString()}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Статистика использования -->
                ${this.renderUsageStats()}

                <!-- Предупреждения -->
                ${this.renderWarnings(hasUsage)}

                <!-- Подтверждение -->
                <div class="mt-4 text-center">
                    <p class="text-sm text-gray-600">
                        ${hasUsage
                            ? 'Это действие <strong>необратимо</strong>. Все значения этого параметра будут удалены.'
                            : 'Параметр будет удален без возможности восстановления.'
                        }
                    </p>
                </div>

                ${hasUsage ? `
                    <!-- Дополнительное подтверждение для параметров с данными -->
                    <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div class="flex items-center mb-2">
                            <input
                                type="checkbox"
                                id="confirm-deletion"
                                class="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                            >
                            <label for="confirm-deletion" class="ml-2 text-sm font-medium text-red-800">
                                Я понимаю, что все данные будут удалены
                            </label>
                        </div>
                        <p class="text-xs text-red-600">
                            Отметьте эту галочку, чтобы подтвердить удаление параметра с данными
                        </p>
                    </div>
                ` : ''}
            </div>
        `;

        // Обновляем доступность кнопки удаления для параметров с данными
        if (hasUsage) {
            const confirmCheckbox = content.querySelector('#confirm-deletion');
            const deleteBtn = this.modal.querySelector('#delete-btn');

            deleteBtn.disabled = true;
            deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');

            confirmCheckbox?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    deleteBtn.disabled = false;
                    deleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                } else {
                    deleteBtn.disabled = true;
                    deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }
            });
        }
    }

    /**
     * Рендеринг статистики использования
     */
    renderUsageStats() {
        if (!this.usageStats) {
            return `
                <div class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p class="text-sm text-yellow-800">
                        <svg class="inline w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                        Не удалось загрузить статистику использования
                    </p>
                </div>
            `;
        }

        const { totalObjects, objectsWithValue, objectsWithoutValue, percentageUsed } = this.usageStats;

        return `
            <div class="mb-4">
                <h5 class="font-medium text-gray-900 mb-2">Использование параметра:</h5>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div class="bg-blue-50 p-3 rounded-lg text-center">
                        <div class="text-2xl font-bold text-blue-600">${totalObjects}</div>
                        <div class="text-blue-800">Всего объектов</div>
                    </div>
                    <div class="bg-green-50 p-3 rounded-lg text-center">
                        <div class="text-2xl font-bold text-green-600">${objectsWithValue}</div>
                        <div class="text-green-800">С значением</div>
                    </div>
                    <div class="bg-gray-50 p-3 rounded-lg text-center">
                        <div class="text-2xl font-bold text-gray-600">${objectsWithoutValue}</div>
                        <div class="text-gray-800">Без значения</div>
                    </div>
                    <div class="bg-purple-50 p-3 rounded-lg text-center">
                        <div class="text-2xl font-bold text-purple-600">${Math.round(percentageUsed)}%</div>
                        <div class="text-purple-800">Заполненность</div>
                    </div>
                </div>

                ${objectsWithValue > 0 ? `
                    <!-- Прогресс-бар заполненности -->
                    <div class="mt-3">
                        <div class="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Заполненность параметра</span>
                            <span>${Math.round(percentageUsed)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-blue-600 h-2 rounded-full" style="width: ${percentageUsed}%"></div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Рендеринг предупреждений
     */
    renderWarnings(hasUsage) {
        if (!hasUsage) {
            return `
                <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div class="flex items-center">
                        <svg class="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        <span class="text-sm text-green-800 font-medium">Безопасное удаление</span>
                    </div>
                    <p class="text-sm text-green-700 mt-1">
                        Параметр не используется ни в одном объекте. Удаление не повлияет на существующие данные.
                    </p>
                </div>
            `;
        }

        return `
            <div class="mb-4 space-y-3">
                <!-- Основное предупреждение -->
                <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div class="flex items-center mb-2">
                        <svg class="w-5 h-5 text-red-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenovenmod"/>
                        </svg>
                        <span class="text-sm text-red-800 font-medium">Внимание! Параметр используется</span>
                    </div>
                    <ul class="text-sm text-red-700 space-y-1">
                        <li>• ${this.usageStats.objectsWithValue} объектов потеряют значение этого параметра</li>
                        <li>• Восстановление данных будет невозможно</li>
                        <li>• Рекомендуется сначала деактивировать параметр</li>
                    </ul>
                </div>

                <!-- Альтернативные действия -->
                <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div class="flex items-center mb-2">
                        <svg class="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span class="text-sm text-blue-800 font-medium">Альтернативные действия</span>
                    </div>
                    <div class="text-sm text-blue-700 space-y-2">
                        <p><strong>Вместо удаления можно:</strong></p>
                        <ul class="space-y-1 ml-4">
                            <li>• Деактивировать параметр (скроет из интерфейса, но сохранит данные)</li>
                            <li>• Экспортировать данные перед удалением</li>
                            <li>• Переместить значения в другой параметр</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Закрытие модального окна при клике на кнопку отмены
        this.modal.querySelector('#cancel-btn').addEventListener('click', () => {
            if (!this.isDeleting) {
                this.hide();
            }
        });

        // Обработка Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible && !this.isDeleting) {
                this.hide();
            }
        });

        // Удаление параметра
        this.modal.querySelector('#delete-btn').addEventListener('click', () => {
            this.handleDelete();
        });
    }

    /**
     * Обработка удаления параметра
     */
    async handleDelete() {
        if (this.isDeleting || !this.currentParameter) {
            return;
        }

        try {
            this.setDeleting(true);

            // Удаляем параметр через сервис
            await this.customParametersService.deleteParameter(this.currentParameter.id);

            // Эмитим событие об успешном удалении
            this.emitEvent('parameterDeleted', {
                parameter: this.currentParameter,
                usageStats: this.usageStats
            });

            this.hide();

        } catch (error) {
            this.setDeleting(false);

            await this.errorHandler?.handleError(error, {
                component: 'ParameterDeleteModal',
                method: 'handleDelete',
                params: { parameterId: this.currentParameter?.id }
            });
        }
    }

    /**
     * Установка состояния удаления
     */
    setDeleting(deleting) {
        this.isDeleting = deleting;

        const deleteBtn = this.modal.querySelector('#delete-btn');
        const spinner = this.modal.querySelector('#delete-spinner');
        const cancelBtn = this.modal.querySelector('#cancel-btn');

        if (deleting) {
            deleteBtn.disabled = true;
            deleteBtn.classList.add('opacity-75');
            spinner?.classList.remove('hidden');
            cancelBtn.disabled = true;
            cancelBtn.classList.add('opacity-50');

            // Меняем текст кнопки
            const btnText = deleteBtn.querySelector('span');
            if (btnText) btnText.textContent = 'Удаление...';
        } else {
            deleteBtn.disabled = false;
            deleteBtn.classList.remove('opacity-75');
            spinner?.classList.add('hidden');
            cancelBtn.disabled = false;
            cancelBtn.classList.remove('opacity-50');

            // Возвращаем текст кнопки
            const btnText = deleteBtn.querySelector('span');
            if (btnText) btnText.textContent = 'Удалить';
        }
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
    module.exports = ParameterDeleteModal;
}

// Экспорт в window для доступа из браузера
if (typeof window !== 'undefined') {
    window.ParameterDeleteModal = ParameterDeleteModal;
}