/**
 * AIChatButton - плавающая кнопка для вызова AI-чата
 * Отображается в правом нижнем углу страницы
 * Интегрируется с архитектурой v0.1 через DIContainer и EventBus
 */

class AIChatButton {
    constructor(container, diContainer) {
        this.container = container;
        this.diContainer = diContainer;
        
        // Зависимости из DI контейнера
        this.eventBus = this.diContainer.get('EventBus');
        this.configService = this.diContainer.get('ConfigService');
        this.universalAI = this.diContainer.get('UniversalAIService');
        
        // Состояние компонента
        this.isVisible = true;
        this.isOnline = false;
        this.unreadCount = 0;
        
        // Элементы DOM
        this.buttonElement = null;
        this.badge = null;
        
        // Проверяем доступность AI при инициализации
        this.init();
    }

    /**
     * Инициализация компонента
     */
    async init() {
        this.render();
        this.bindEvents();
        await this.checkAIAvailability();
        
        // Подписываемся на события
        this.eventBus.on('ai-chat-toggle-visibility', (visible) => {
            this.setVisibility(visible);
        });
        
        this.eventBus.on('ai-chat-new-message', () => {
            this.incrementUnreadCount();
        });
        
        this.eventBus.on('ai-chat-opened', () => {
            this.resetUnreadCount();
        });
    }

    /**
     * Рендеринг кнопки
     */
    render() {
        // Создаем основной элемент кнопки
        this.buttonElement = document.createElement('button');
        this.buttonElement.className = `
            fixed bottom-6 right-6 z-50 
            w-14 h-14 rounded-full shadow-lg
            bg-gradient-to-r from-blue-500 to-purple-600
            hover:from-blue-600 hover:to-purple-700
            text-white font-semibold
            flex items-center justify-center
            transition-all duration-300 ease-in-out
            transform hover:scale-110 hover:shadow-xl
            focus:outline-none focus:ring-4 focus:ring-blue-300
        `;
        
        this.buttonElement.setAttribute('title', 'Открыть AI-ассистента');
        this.buttonElement.setAttribute('data-testid', 'ai-chat-button');
        
        // SVG иконка чата
        this.buttonElement.innerHTML = `
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z">
                </path>
            </svg>
        `;
        
        // Создаем бейдж для количества непрочитанных сообщений
        this.badge = document.createElement('div');
        this.badge.className = `
            absolute -top-2 -right-2 
            bg-red-500 text-white text-xs font-bold
            rounded-full w-5 h-5 
            flex items-center justify-center
            transform scale-0 transition-transform duration-200
        `;
        this.badge.setAttribute('data-testid', 'unread-badge');
        
        this.buttonElement.appendChild(this.badge);
        this.container.appendChild(this.buttonElement);
    }

    /**
     * Привязка обработчиков событий
     */
    bindEvents() {
        this.buttonElement.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleClick();
        });

        // Анимация при наведении
        this.buttonElement.addEventListener('mouseenter', () => {
            this.buttonElement.style.transform = 'scale(1.1)';
        });

        this.buttonElement.addEventListener('mouseleave', () => {
            this.buttonElement.style.transform = 'scale(1)';
        });

        // Keyboard accessibility
        this.buttonElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.handleClick();
            }
        });
    }

    /**
     * Обработчик клика по кнопке
     */
    async handleClick() {
        // Проверяем доступность AI перед открытием
        if (!this.isOnline) {
            await this.checkAIAvailability();
            if (!this.isOnline) {
                this.showOfflineNotification();
                return;
            }
        }

        // Отправляем событие открытия чата
        this.eventBus.emit('ai-chat-button-clicked');
        this.eventBus.emit('ai-chat-open');
        
        // Сбрасываем счетчик непрочитанных
        this.resetUnreadCount();
        
        // Анимация нажатия
        this.buttonElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.buttonElement.style.transform = 'scale(1)';
        }, 150);
    }

    /**
     * Проверка доступности AI сервисов
     */
    async checkAIAvailability() {
        try {
            const isAvailable = await this.universalAI.isAvailable();
            this.setOnlineStatus(isAvailable);
        } catch (error) {
            console.warn('⚠️ Ошибка проверки доступности AI:', error);
            this.setOnlineStatus(false);
        }
    }

    /**
     * Установка статуса онлайн/оффлайн
     */
    setOnlineStatus(isOnline) {
        this.isOnline = isOnline;
        
        if (isOnline) {
            this.buttonElement.classList.remove('opacity-50', 'cursor-not-allowed');
            this.buttonElement.classList.add('cursor-pointer');
            this.buttonElement.title = 'Открыть AI-ассистента';
        } else {
            this.buttonElement.classList.add('opacity-50', 'cursor-not-allowed');
            this.buttonElement.classList.remove('cursor-pointer');
            this.buttonElement.title = 'AI-ассистент недоступен';
        }
    }

    /**
     * Показать уведомление о недоступности
     */
    showOfflineNotification() {
        // Простое уведомление - можно заменить на более красивый toast
        const notification = document.createElement('div');
        notification.className = `
            fixed bottom-24 right-6 z-50
            bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg
            text-sm font-medium
            transform translate-y-0 opacity-100
            transition-all duration-300 ease-in-out
        `;
        notification.textContent = 'AI-ассистент временно недоступен';
        
        this.container.appendChild(notification);
        
        // Удаляем через 3 секунды
        setTimeout(() => {
            notification.style.transform = 'translateY(10px)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * Увеличение счетчика непрочитанных сообщений
     */
    incrementUnreadCount() {
        this.unreadCount++;
        this.updateBadge();
    }

    /**
     * Сброс счетчика непрочитанных сообщений
     */
    resetUnreadCount() {
        this.unreadCount = 0;
        this.updateBadge();
    }

    /**
     * Обновление отображения бейджа
     */
    updateBadge() {
        if (this.unreadCount > 0) {
            this.badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
            this.badge.style.transform = 'scale(1)';
        } else {
            this.badge.style.transform = 'scale(0)';
        }
    }

    /**
     * Показать/скрыть кнопку
     */
    setVisibility(visible) {
        this.isVisible = visible;
        
        if (visible) {
            this.buttonElement.style.transform = 'translateY(0)';
            this.buttonElement.style.opacity = '1';
            this.buttonElement.style.pointerEvents = 'auto';
        } else {
            this.buttonElement.style.transform = 'translateY(100px)';
            this.buttonElement.style.opacity = '0';
            this.buttonElement.style.pointerEvents = 'none';
        }
    }

    /**
     * Анимация пульсации для привлечения внимания
     */
    pulse() {
        this.buttonElement.classList.add('animate-pulse');
        setTimeout(() => {
            this.buttonElement.classList.remove('animate-pulse');
        }, 2000);
    }

    /**
     * Получение состояния компонента
     */
    getState() {
        return {
            isVisible: this.isVisible,
            isOnline: this.isOnline,
            unreadCount: this.unreadCount
        };
    }

    /**
     * Уничтожение компонента
     */
    destroy() {
        // Отписываемся от событий
        this.eventBus.off('ai-chat-toggle-visibility');
        this.eventBus.off('ai-chat-new-message');
        this.eventBus.off('ai-chat-opened');
        
        // Удаляем DOM элементы
        if (this.buttonElement && this.buttonElement.parentNode) {
            this.buttonElement.parentNode.removeChild(this.buttonElement);
        }
        
        // Очищаем ссылки
        this.buttonElement = null;
        this.badge = null;
        this.container = null;
        this.diContainer = null;
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIChatButton;
} else {
    window.AIChatButton = AIChatButton;
}