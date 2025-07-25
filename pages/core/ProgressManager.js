/**
 * Менеджер прогресса и статусных сообщений
 * Progress and status message manager
 */

class ProgressManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.progressBars = new Map();
        this.statusTimeouts = new Map();
        
        // Привязываем к событиям
        this.bindEvents();
    }
    
    /**
     * Привязка к событиям
     */
    bindEvents() {
        if (this.eventBus) {
            this.eventBus.on('progress:update', (data) => {
                this.updateProgressBar(data.type, data.percentage, data.message);
            });
            
            this.eventBus.on('status:show', (data) => {
                this.showStatus(data.message, data.type);
            });
            
            this.eventBus.on('status:hide', () => {
                this.hideStatus();
            });
        }
    }
    
    /**
     * Обновление прогресс-бара
     */
    updateProgressBar(type, percentage, message = '') {
        const progressContainer = document.getElementById(`${type}Progress`);
        if (!progressContainer) {
            console.warn(`Progress container not found: ${type}Progress`);
            return;
        }
        
        const progressBar = progressContainer.querySelector('.progress-bar');
        const progressText = progressContainer.querySelector('.progress-text');
        const progressPercentage = progressContainer.querySelector('.progress-percentage');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);
        }
        
        if (progressText && message) {
            progressText.textContent = message;
        }
        
        if (progressPercentage) {
            progressPercentage.textContent = `${Math.round(percentage)}%`;
        }
        
        // Показываем/скрываем контейнер
        if (percentage > 0 && percentage < 100) {
            progressContainer.classList.remove('hidden');
        } else if (percentage >= 100) {
            setTimeout(() => {
                progressContainer.classList.add('hidden');
            }, 2000);
        }
        
        // Сохраняем текущее состояние
        this.progressBars.set(type, {
            percentage,
            message,
            timestamp: Date.now()
        });
        
        // Эмитируем событие для других модулей
        if (this.eventBus) {
            this.eventBus.emit('progress:updated', {
                type,
                percentage,
                message
            });
        }
    }
    
    /**
     * Показ статусного сообщения
     */
    showStatus(message, type = 'info', duration = 5000) {
        // Используем тот же контейнер, что и UIManager
        let container = document.getElementById('notificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationContainer';
            container.className = 'fixed top-4 right-4 z-50 max-w-md';
            document.body.appendChild(container);
        }
        
        // Создаем элемент уведомления в стиле UIManager
        const statusElement = document.createElement('div');
        const notificationId = Date.now() + Math.random();
        statusElement.setAttribute('data-notification-id', notificationId);
        
        // Применяем единые стили как в UIManager
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
        
        statusElement.className = `notification border-l-4 p-4 mb-3 rounded ${typeClasses[type] || typeClasses.info}`;
        
        statusElement.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-lg font-bold">${typeIcons[type] || typeIcons.info}</span>
                </div>
                <div class="ml-3 flex-1">
                    <p class="text-sm font-medium">${message}</p>
                </div>
                <div class="flex-shrink-0 ml-4">
                    <button class="close-notification text-lg font-bold hover:opacity-75">×</button>
                </div>
            </div>
        `;
        
        // Добавляем обработчик кнопки закрытия
        const closeBtn = statusElement.querySelector('.close-notification');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                statusElement.remove();
            });
        }
        
        // Добавляем в контейнер
        container.appendChild(statusElement);
        
        // Автоматически скрываем сообщение
        if (duration > 0) {
            setTimeout(() => {
                if (statusElement.parentNode) {
                    statusElement.remove();
                }
            }, duration);
        }
        
        // Эмитируем событие
        if (this.eventBus) {
            this.eventBus.emit('status:shown', {
                message,
                type,
                duration
            });
        }
    }
    
    /**
     * Скрытие статусного сообщения
     */
    hideStatus() {
        const statusElement = document.getElementById('statusMessage');
        if (statusElement) {
            statusElement.classList.add('hidden');
        }
        
        // Очищаем таймер
        if (this.statusTimeouts.has('main')) {
            clearTimeout(this.statusTimeouts.get('main'));
            this.statusTimeouts.delete('main');
        }
        
        // Эмитируем событие
        if (this.eventBus) {
            this.eventBus.emit('status:hidden');
        }
    }
    
    /**
     * Показ ошибки
     */
    showError(message, duration = 7000) {
        this.showStatus(message, 'error', duration);
    }
    
    /**
     * Показ успешного сообщения
     */
    showSuccess(message, duration = 3000) {
        this.showStatus(message, 'success', duration);
    }
    
    /**
     * Показ предупреждения
     */
    showWarning(message, duration = 5000) {
        this.showStatus(message, 'warning', duration);
    }
    
    /**
     * Показ информационного сообщения
     */
    showInfo(message, duration = 5000) {
        this.showStatus(message, 'info', duration);
    }
    
    /**
     * Создание нового прогресс-бара
     */
    createProgressBar(type, container, options = {}) {
        const defaultOptions = {
            showPercentage: true,
            showMessage: true,
            color: 'blue',
            height: '4px',
            animated: true
        };
        
        const config = { ...defaultOptions, ...options };
        
        const progressHtml = `
            <div id="${type}Progress" class="hidden">
                <div class="mb-2">
                    ${config.showMessage ? `<div class="progress-text text-sm text-gray-600"></div>` : ''}
                    ${config.showPercentage ? `<div class="progress-percentage text-sm font-medium text-gray-900"></div>` : ''}
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="progress-bar bg-${config.color}-600 h-2 rounded-full transition-all duration-300 ${config.animated ? 'animate-pulse' : ''}" 
                         style="width: 0%" 
                         role="progressbar" 
                         aria-valuenow="0" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                    </div>
                </div>
            </div>
        `;
        
        if (typeof container === 'string') {
            const containerElement = document.getElementById(container);
            if (containerElement) {
                containerElement.innerHTML = progressHtml;
            }
        } else {
            container.innerHTML = progressHtml;
        }
        
        return type;
    }
    
    /**
     * Удаление прогресс-бара
     */
    removeProgressBar(type) {
        const progressContainer = document.getElementById(`${type}Progress`);
        if (progressContainer) {
            progressContainer.remove();
        }
        
        this.progressBars.delete(type);
    }
    
    /**
     * Получение состояния прогресс-бара
     */
    getProgressState(type) {
        return this.progressBars.get(type) || null;
    }
    
    /**
     * Получение всех активных прогресс-баров
     */
    getActiveProgressBars() {
        const active = [];
        for (const [type, state] of this.progressBars) {
            if (state.percentage > 0 && state.percentage < 100) {
                active.push({ type, ...state });
            }
        }
        return active;
    }
    
    /**
     * Установка прогресса с анимацией
     */
    setProgressWithAnimation(type, percentage, message = '', duration = 1000) {
        const currentState = this.getProgressState(type);
        const startPercentage = currentState ? currentState.percentage : 0;
        
        const steps = 20;
        const stepSize = (percentage - startPercentage) / steps;
        const stepDuration = duration / steps;
        
        let currentStep = 0;
        
        const animate = () => {
            if (currentStep <= steps) {
                const currentPercentage = startPercentage + (stepSize * currentStep);
                this.updateProgressBar(type, currentPercentage, message);
                currentStep++;
                setTimeout(animate, stepDuration);
            }
        };
        
        animate();
    }
    
    /**
     * Создание составного прогресса (несколько этапов)
     */
    createMultiStageProgress(type, stages) {
        const totalStages = stages.length;
        let currentStage = 0;
        
        const progress = {
            nextStage: (message = '') => {
                if (currentStage < totalStages) {
                    const percentage = ((currentStage + 1) / totalStages) * 100;
                    const stageMessage = message || stages[currentStage];
                    this.updateProgressBar(type, percentage, stageMessage);
                    currentStage++;
                    return currentStage;
                }
                return totalStages;
            },
            
            setStage: (stageIndex, message = '') => {
                if (stageIndex >= 0 && stageIndex < totalStages) {
                    currentStage = stageIndex;
                    const percentage = ((stageIndex + 1) / totalStages) * 100;
                    const stageMessage = message || stages[stageIndex];
                    this.updateProgressBar(type, percentage, stageMessage);
                }
            },
            
            complete: (message = 'Завершено') => {
                this.updateProgressBar(type, 100, message);
                currentStage = totalStages;
            },
            
            getCurrentStage: () => currentStage,
            getTotalStages: () => totalStages
        };
        
        return progress;
    }
    
    /**
     * Сброс всех прогресс-баров
     */
    resetAll() {
        for (const type of this.progressBars.keys()) {
            this.updateProgressBar(type, 0, '');
        }
        this.hideStatus();
    }
    
    /**
     * Получение статистики
     */
    getStats() {
        return {
            activeProgressBars: this.getActiveProgressBars().length,
            totalProgressBars: this.progressBars.size,
            hasActiveStatus: !document.getElementById('statusMessage')?.classList.contains('hidden')
        };
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressManager;
} else {
    window.ProgressManager = ProgressManager;
}