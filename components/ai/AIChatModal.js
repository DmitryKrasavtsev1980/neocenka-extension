/**
 * AIChatModal - модальное окно для AI-чата
 * Полнофункциональный интерфейс чата с AI-ассистентом
 * Интегрируется с архитектурой v0.1 и UniversalAIService
 */

class AIChatModal {
    constructor(container, diContainer) {
        this.container = container;
        this.diContainer = diContainer;
        
        // Зависимости из DI контейнера
        this.eventBus = this.diContainer.get('EventBus');
        this.configService = this.diContainer.get('ConfigService');
        this.universalAI = this.diContainer.get('UniversalAIService');
        
        // Состояние модального окна
        this.isOpen = false;
        this.isProcessing = false;
        this.currentProvider = 'auto';
        this.chatHistory = [];
        this.contextData = null;
        
        // DOM элементы
        this.modal = null;
        this.chatContainer = null;
        this.messageInput = null;
        this.sendButton = null;
        this.providerSelect = null;
        this.statusIndicator = null;
        
        this.init();
    }

    /**
     * Инициализация компонента
     */
    init() {
        this.render();
        this.bindEvents();
        
        // Подписываемся на события
        this.eventBus.on('ai-chat-open', () => {
            this.open();
        });
        
        this.eventBus.on('ai-chat-close', () => {
            this.close();
        });

        this.eventBus.on('ai-chat-set-context', (context) => {
            this.setContext(context);
        });
    }

    /**
     * Рендеринг модального окна
     */
    render() {
        this.modal = document.createElement('div');
        this.modal.className = `
            fixed inset-0 z-50 flex items-center justify-center
            bg-black bg-opacity-50 backdrop-blur-sm
            opacity-0 pointer-events-none
            transition-all duration-300 ease-in-out
        `;
        this.modal.setAttribute('data-testid', 'ai-chat-modal');

        this.modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-5/6 max-h-screen mx-4 flex flex-col
                        transform scale-95 transition-transform duration-300">
                
                <!-- Заголовок модального окна -->
                <div class="flex items-center justify-between p-4 border-b border-gray-200">
                    <div class="flex items-center space-x-3">
                        <div class="w-3 h-3 rounded-full bg-green-400 animate-pulse" data-role="status-indicator"></div>
                        <h2 class="text-xl font-semibold text-gray-800">AI-Ассистент Neocenka</h2>
                        <select class="text-sm bg-gray-100 rounded px-2 py-1 border" data-role="provider-select">
                            <option value="auto">Автовыбор</option>
                            <option value="yandex">YandexGPT</option>
                            <option value="claude">Claude</option>
                        </select>
                    </div>
                    
                    <div class="flex items-center space-x-2">
                        <button class="text-gray-400 hover:text-gray-600 transition-colors" 
                                data-role="minimize-button" title="Свернуть">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/>
                            </svg>
                        </button>
                        
                        <button class="text-gray-400 hover:text-gray-600 transition-colors" 
                                data-role="close-button" title="Закрыть">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Контейнер чата -->
                <div class="flex-1 overflow-hidden flex flex-col">
                    <!-- История сообщений -->
                    <div class="flex-1 overflow-y-auto p-4 space-y-4" data-role="chat-container">
                        <!-- Приветственное сообщение -->
                        <div class="flex items-start space-x-3">
                            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <div class="bg-gray-100 rounded-lg px-4 py-3">
                                    <p class="text-gray-800">Добро пожаловать! Я AI-ассистент Neocenka. Могу помочь с:</p>
                                    <ul class="list-disc ml-4 mt-2 text-sm text-gray-600">
                                        <li>Анализом дубликатов объявлений</li>
                                        <li>Присвоением адресов объектам</li>
                                        <li>Сегментацией по характеристикам</li>
                                        <li>Созданием сравнительных отчетов</li>
                                    </ul>
                                </div>
                                <span class="text-xs text-gray-500 mt-1">AI-ассистент • только что</span>
                            </div>
                        </div>
                    </div>

                    <!-- Индикатор набора текста -->
                    <div class="hidden px-4 py-2" data-role="typing-indicator">
                        <div class="flex items-center space-x-2 text-gray-500">
                            <div class="flex space-x-1">
                                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                            </div>
                            <span class="text-sm">AI-ассистент печатает...</span>
                        </div>
                    </div>

                    <!-- Поле ввода -->
                    <div class="border-t border-gray-200 p-4">
                        <div class="flex items-end space-x-3">
                            <div class="flex-1 relative">
                                <textarea 
                                    class="w-full resize-none border border-gray-300 rounded-lg px-4 py-3 
                                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                           max-h-32 min-h-12" 
                                    placeholder="Введите ваш вопрос или задачу..."
                                    rows="1"
                                    data-role="message-input"></textarea>
                                
                                <!-- Подсказки по контексту -->
                                <div class="hidden absolute bottom-full left-0 right-0 mb-2 p-2 bg-blue-50 rounded-lg border border-blue-200"
                                     data-role="context-hint">
                                    <div class="text-xs text-blue-600 font-medium">Доступен контекст:</div>
                                    <div class="text-xs text-blue-500" data-role="context-description"></div>
                                </div>
                            </div>
                            
                            <button class="bg-blue-500 hover:bg-blue-600 text-white rounded-lg p-3 
                                          transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                                          flex items-center justify-center min-w-12"
                                    data-role="send-button" disabled>
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                </svg>
                            </button>
                        </div>
                        
                        <!-- Дополнительные опции -->
                        <div class="flex items-center justify-between mt-2 text-xs text-gray-500">
                            <div class="flex items-center space-x-4">
                                <span>Нажмите Enter для отправки, Shift+Enter для новой строки</span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span data-role="char-counter">0/1000</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Получаем ссылки на элементы
        this.chatContainer = this.modal.querySelector('[data-role="chat-container"]');
        this.messageInput = this.modal.querySelector('[data-role="message-input"]');
        this.sendButton = this.modal.querySelector('[data-role="send-button"]');
        this.providerSelect = this.modal.querySelector('[data-role="provider-select"]');
        this.statusIndicator = this.modal.querySelector('[data-role="status-indicator"]');
        this.typingIndicator = this.modal.querySelector('[data-role="typing-indicator"]');
        this.contextHint = this.modal.querySelector('[data-role="context-hint"]');
        this.contextDescription = this.modal.querySelector('[data-role="context-description"]');
        this.charCounter = this.modal.querySelector('[data-role="char-counter"]');

        this.container.appendChild(this.modal);
    }

    /**
     * Привязка обработчиков событий
     */
    bindEvents() {
        // Закрытие модального окна
        this.modal.querySelector('[data-role="close-button"]').addEventListener('click', () => {
            this.close();
        });

        // Минимизация (не реализуем пока, оставляем для будущего)
        this.modal.querySelector('[data-role="minimize-button"]').addEventListener('click', () => {
            // TODO: Implement minimization
            console.log('Minimization not implemented yet');
        });

        // Клик по фону для закрытия
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Отправка сообщения
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter для отправки, Shift+Enter для новой строки
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Автоматическое изменение размера textarea
        this.messageInput.addEventListener('input', () => {
            this.adjustTextareaHeight();
            this.updateCharCounter();
            this.updateSendButton();
        });

        // Выбор провайдера
        this.providerSelect.addEventListener('change', (e) => {
            this.currentProvider = e.target.value;
            this.universalAI.setPreferredProvider(this.currentProvider === 'auto' ? null : this.currentProvider);
        });

        // ESC для закрытия
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    /**
     * Открытие модального окна
     */
    open() {
        if (this.isOpen) return;

        this.isOpen = true;
        this.modal.style.pointerEvents = 'auto';
        this.modal.style.opacity = '1';
        this.modal.querySelector('.bg-white').style.transform = 'scale(1)';
        
        // Фокус на поле ввода
        setTimeout(() => {
            this.messageInput.focus();
        }, 300);

        // Уведомляем о открытии
        this.eventBus.emit('ai-chat-opened');
        
        document.body.style.overflow = 'hidden';
    }

    /**
     * Закрытие модального окна
     */
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.modal.style.opacity = '0';
        this.modal.querySelector('.bg-white').style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            this.modal.style.pointerEvents = 'none';
        }, 300);

        document.body.style.overflow = '';
        this.eventBus.emit('ai-chat-closed');
    }

    /**
     * Отправка сообщения
     */
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isProcessing) return;

        this.isProcessing = true;
        this.updateSendButton();
        
        // Добавляем сообщение пользователя
        this.addMessage(message, 'user');
        
        // Очищаем поле ввода
        this.messageInput.value = '';
        this.adjustTextareaHeight();
        this.updateCharCounter();
        
        // Показываем индикатор набора
        this.showTypingIndicator();

        try {
            // Формируем запрос с контекстом
            const requestOptions = {
                taskType: this.determineTaskType(message),
                language: 'ru',
                maxTokens: 1000
            };

            // Если есть контекст, добавляем его
            if (this.contextData) {
                requestOptions.context = this.contextData;
            }

            // Отправляем запрос к AI
            const response = await this.universalAI.sendRequest(message, requestOptions);
            
            // Добавляем ответ AI
            this.addMessage(response.content, 'ai', {
                provider: response.metadata.provider,
                model: response.metadata.model,
                tokensUsed: response.usage.totalTokens,
                cost: response.cost
            });

        } catch (error) {
            console.error('❌ Ошибка отправки сообщения к AI:', error);
            this.addMessage(
                'Извините, произошла ошибка при обработке запроса. Попробуйте еще раз.',
                'error'
            );
        } finally {
            this.isProcessing = false;
            this.hideTypingIndicator();
            this.updateSendButton();
        }
    }

    /**
     * Определение типа задачи по сообщению
     */
    determineTaskType(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('дубликат') || lowerMessage.includes('похож')) {
            return 'duplicates';
        }
        if (lowerMessage.includes('адрес') || lowerMessage.includes('координат')) {
            return 'addresses';
        }
        if (lowerMessage.includes('сегмент') || lowerMessage.includes('класс') || lowerMessage.includes('тип дома')) {
            return 'segmentation';
        }
        if (lowerMessage.includes('график') || lowerMessage.includes('диаграмм') || lowerMessage.includes('сравни')) {
            return 'analysis';
        }
        
        return 'general';
    }

    /**
     * Добавление сообщения в чат
     */
    addMessage(content, type, metadata = {}) {
        const messageElement = document.createElement('div');
        messageElement.className = 'flex items-start space-x-3';

        const timestamp = new Date().toLocaleString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (type === 'user') {
            messageElement.innerHTML = `
                <div class="flex-1 flex justify-end">
                    <div class="bg-blue-500 text-white rounded-lg px-4 py-3 max-w-xs lg:max-w-md">
                        <p class="whitespace-pre-wrap">${this.escapeHtml(content)}</p>
                    </div>
                </div>
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                    <svg class="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
                    </svg>
                </div>
            `;
        } else if (type === 'ai') {
            const providerInfo = metadata.provider ? ` • ${metadata.provider}` : '';
            const tokenInfo = metadata.tokensUsed ? ` • ${metadata.tokensUsed} токенов` : '';
            
            messageElement.innerHTML = `
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div class="flex-1">
                    <div class="bg-gray-100 rounded-lg px-4 py-3">
                        <div class="prose prose-sm max-w-none">
                            ${this.formatAIResponse(content)}
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        AI-ассистент • ${timestamp}${providerInfo}${tokenInfo}
                    </div>
                </div>
            `;
        } else if (type === 'error') {
            messageElement.innerHTML = `
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                    <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/>
                    </svg>
                </div>
                <div class="flex-1">
                    <div class="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                        <p class="text-red-800">${this.escapeHtml(content)}</p>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">Ошибка • ${timestamp}</div>
                </div>
            `;
        }

        this.chatContainer.appendChild(messageElement);
        this.scrollToBottom();
        
        // Сохраняем в историю
        this.chatHistory.push({
            content,
            type,
            timestamp: new Date(),
            metadata
        });
    }

    /**
     * Форматирование ответа AI с поддержкой базовых тегов
     */
    formatAIResponse(content) {
        return content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-200 px-1 rounded">$1</code>');
    }

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Прокрутка чата вниз
     */
    scrollToBottom() {
        setTimeout(() => {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }, 100);
    }

    /**
     * Показать индикатор набора текста
     */
    showTypingIndicator() {
        this.typingIndicator.classList.remove('hidden');
        this.scrollToBottom();
    }

    /**
     * Скрыть индикатор набора текста
     */
    hideTypingIndicator() {
        this.typingIndicator.classList.add('hidden');
    }

    /**
     * Автоматическое изменение высоты textarea
     */
    adjustTextareaHeight() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 128) + 'px';
    }

    /**
     * Обновление счетчика символов
     */
    updateCharCounter() {
        const current = this.messageInput.value.length;
        const max = 1000;
        this.charCounter.textContent = `${current}/${max}`;
        
        if (current > max * 0.9) {
            this.charCounter.classList.add('text-red-500');
        } else {
            this.charCounter.classList.remove('text-red-500');
        }
    }

    /**
     * Обновление состояния кнопки отправки
     */
    updateSendButton() {
        const hasText = this.messageInput.value.trim().length > 0;
        const canSend = hasText && !this.isProcessing && this.messageInput.value.length <= 1000;
        
        this.sendButton.disabled = !canSend;
        
        if (this.isProcessing) {
            this.sendButton.innerHTML = `
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            `;
        } else {
            this.sendButton.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                </svg>
            `;
        }
    }

    /**
     * Установка контекста для AI
     */
    setContext(contextData) {
        this.contextData = contextData;
        
        if (contextData) {
            this.contextDescription.textContent = this.getContextDescription(contextData);
            this.contextHint.classList.remove('hidden');
        } else {
            this.contextHint.classList.add('hidden');
        }
    }

    /**
     * Получение описания контекста
     */
    getContextDescription(context) {
        if (context.type === 'listings') {
            return `${context.data.length} объявлений для анализа`;
        }
        if (context.type === 'segment') {
            return `Сегмент: ${context.data.name}`;
        }
        if (context.type === 'area') {
            return `Область: ${context.data.name}`;
        }
        return 'Данные для анализа';
    }

    /**
     * Получение истории чата
     */
    getChatHistory() {
        return this.chatHistory;
    }

    /**
     * Очистка чата
     */
    clearChat() {
        this.chatHistory = [];
        // Оставляем только приветственное сообщение
        const welcomeMessage = this.chatContainer.firstElementChild;
        this.chatContainer.innerHTML = '';
        this.chatContainer.appendChild(welcomeMessage);
    }

    /**
     * Получение состояния модального окна
     */
    getState() {
        return {
            isOpen: this.isOpen,
            isProcessing: this.isProcessing,
            currentProvider: this.currentProvider,
            chatHistoryLength: this.chatHistory.length,
            hasContext: !!this.contextData
        };
    }

    /**
     * Уничтожение компонента
     */
    destroy() {
        // Отписываемся от событий
        this.eventBus.off('ai-chat-open');
        this.eventBus.off('ai-chat-close');
        this.eventBus.off('ai-chat-set-context');
        
        // Удаляем DOM элементы
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
        
        // Восстанавливаем overflow
        document.body.style.overflow = '';
        
        // Очищаем ссылки
        this.modal = null;
        this.chatContainer = null;
        this.messageInput = null;
        this.sendButton = null;
        this.container = null;
        this.diContainer = null;
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIChatModal;
} else {
    window.AIChatModal = AIChatModal;
}