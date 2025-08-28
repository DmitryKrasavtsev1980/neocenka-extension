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
        
        // Размеры окна
        this.windowSize = {
            width: 384, // w-96 = 24rem = 384px
            height: 768, // h-96 * 2 = 768px (увеличиваем в 2 раза)
            minWidth: 320,
            minHeight: 400,
            maxWidth: 800,
            maxHeight: 1000
        };
        
        // Состояние изменения размеров
        this.isResizing = false;
        this.resizeDirection = null;
        this.startPos = { x: 0, y: 0 };
        this.startSize = { width: 0, height: 0 };
        
        // Система быстрых команд
        this.quickCommands = {
            '/analysis': {
                description: 'Анализ области - полная статистика по текущей области',
                handler: this.handleAreaAnalysis.bind(this)
            },
            '/help': {
                description: 'Помощь - список всех доступных команд',
                handler: this.handleHelp.bind(this)
            }
        };
        this.showingQuickCommands = false;
        
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
        // Загружаем сохраненные размеры окна
        this.loadWindowSize();
        
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
            fixed bottom-4 right-4 z-50
            opacity-0 pointer-events-none
            transition-all duration-300 ease-in-out
        `;
        this.modal.setAttribute('data-testid', 'ai-chat-modal');

        this.modal.innerHTML = `
            <style>
                .resizing {
                    transition: none !important;
                }
                .resizing * {
                    pointer-events: none !important;
                }
            </style>
            <div class="bg-white rounded-lg shadow-2xl flex flex-col relative
                        transform scale-95 transition-all duration-300"
                 style="width: ${this.windowSize.width}px; height: ${this.windowSize.height}px;"
                 data-role="chat-window">
                
                <!-- Ручки для изменения размеров -->
                <!-- Ручка для растягивания влево -->
                <div class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-100 opacity-0 hover:opacity-100 transition-opacity"
                     data-resize="left" title="Растянуть влево"></div>
                
                <!-- Ручка для растягивания вверх -->
                <div class="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-100 opacity-0 hover:opacity-100 transition-opacity"
                     data-resize="top" title="Растянуть вверх"></div>
                
                <!-- Ручка для растягивания по диагонали (влево-вверх) -->
                <div class="absolute top-0 left-0 w-4 h-4 cursor-nw-resize hover:bg-blue-200 opacity-0 hover:opacity-100 transition-opacity rounded-br"
                     data-resize="top-left" title="Растянуть по диагонали"></div>
                
                <!-- Заголовок модального окна -->
                <div class="flex items-center justify-between p-2 border-b border-gray-200">
                    <div class="flex items-center space-x-1">
                        <div class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" data-role="status-indicator"></div>
                        <h2 class="text-xs font-semibold text-gray-800">AI</h2>
                        <select class="text-xs bg-gray-100 rounded px-1 py-0.5 border" data-role="provider-select">
                            <option value="auto">Авто</option>
                            <option value="yandex">Yandex</option>
                            <option value="claude">Claude</option>
                        </select>
                    </div>
                    
                    <button class="text-gray-400 hover:text-gray-600 transition-colors p-0.5" 
                            data-role="close-button" title="Закрыть">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <!-- Контейнер чата -->
                <div class="flex-1 overflow-hidden flex flex-col">
                    <!-- История сообщений -->
                    <div class="flex-1 overflow-y-auto p-2 space-y-2" data-role="chat-container">
                        <!-- Приветственное сообщение -->
                        <div class="flex items-start space-x-1">
                            <div class="flex-shrink-0 w-4 h-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                                <svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <div class="bg-gray-100 rounded px-2 py-1">
                                    <p class="text-xs text-gray-800">Готов помочь!</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Индикатор набора текста -->
                    <div class="hidden px-2 py-1" data-role="typing-indicator">
                        <div class="flex items-center space-x-1 text-gray-500">
                            <div class="flex space-x-1">
                                <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                                <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                                <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                            </div>
                            <span class="text-xs">печатает...</span>
                        </div>
                    </div>

                    <!-- Поле ввода -->
                    <div class="border-t border-gray-200 p-2">
                        <div class="flex items-end space-x-2">
                            <div class="flex-1 relative">
                                <div class="relative">
                                    <textarea 
                                        class="w-full resize-none border border-gray-300 rounded px-2 py-1 text-xs 
                                               focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent
                                               max-h-20 min-h-6" 
                                        placeholder="Ваш вопрос... (/ для команд)"
                                        rows="1"
                                        data-role="message-input"></textarea>
                                    
                                    <!-- Выпадающий список быстрых команд -->
                                    <div class="hidden absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded shadow-lg z-10"
                                         data-role="quick-commands-menu">
                                        <!-- Команды будут добавлены динамически -->
                                    </div>
                                </div>
                                
                                <!-- Подсказки по контексту -->
                                <div class="hidden absolute bottom-full left-0 right-0 mb-1 p-1 bg-blue-50 rounded border border-blue-200"
                                     data-role="context-hint">
                                    <div class="text-xs text-blue-600" data-role="context-description"></div>
                                </div>
                            </div>
                            
                            <button class="bg-blue-500 hover:bg-blue-600 text-white rounded p-1.5 
                                          transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                                          flex items-center justify-center min-w-8"
                                    data-role="send-button" disabled>
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                </svg>
                            </button>
                        </div>
                        
                        <!-- Дополнительные опции -->
                        <div class="flex items-center justify-between mt-1 text-xs text-gray-500">
                            <span>Enter - отправить</span>
                            <span data-role="char-counter">0/1000</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Получаем ссылки на элементы
        this.chatWindow = this.modal.querySelector('[data-role="chat-window"]');
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

        // Удалили кнопку минимизации для компактности

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
                
                // Если показываем быстрые команды, скрываем их
                if (this.showingQuickCommands) {
                    this.hideQuickCommands();
                }
                
                this.sendMessage();
            } else if (e.key === 'Escape' && this.showingQuickCommands) {
                e.preventDefault();
                this.hideQuickCommands();
            }
        });

        // Автоматическое изменение размера textarea
        this.messageInput.addEventListener('input', (e) => {
            this.adjustTextareaHeight();
            this.updateCharCounter();
            this.updateSendButton();
            this.handleQuickCommandInput(e);
        });

        // Выбор провайдера
        this.providerSelect.addEventListener('change', async (e) => {
            this.currentProvider = e.target.value;
            if (this.currentProvider !== 'auto') {
                try {
                    await this.universalAI.switchProvider(this.currentProvider);
                    this.showStatus(`Переключено на провайдер: ${this.currentProvider}`, 'success');
                } catch (error) {
                    console.error('Ошибка переключения провайдера:', error);
                    this.showStatus(`Ошибка переключения провайдера: ${error.message}`, 'error');
                }
            }
        });

        // ESC для закрытия
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
        
        // Обработчики изменения размеров
        this.setupResizeHandlers();
    }
    
    /**
     * Настройка обработчиков изменения размеров
     */
    setupResizeHandlers() {
        // Обработчики для всех ручек изменения размеров
        const resizeHandles = this.modal.querySelectorAll('[data-resize]');
        
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.startResize(e, handle.getAttribute('data-resize'));
            });
        });
        
        // Глобальные обработчики для mouse move и mouse up
        document.addEventListener('mousemove', (e) => {
            if (this.isResizing) {
                this.handleResize(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.stopResize();
            }
        });
    }
    
    /**
     * Начало изменения размера
     */
    startResize(e, direction) {
        this.isResizing = true;
        this.resizeDirection = direction;
        this.startPos = { x: e.clientX, y: e.clientY };
        this.startSize = { 
            width: this.windowSize.width, 
            height: this.windowSize.height 
        };
        
        // Добавляем класс для визуальной индикации
        this.chatWindow.classList.add('resizing');
        document.body.style.cursor = this.getCursorForDirection(direction);
        
        // Отключаем выделение текста во время изменения размера
        document.body.style.userSelect = 'none';
    }
    
    /**
     * Обработка изменения размера
     */
    handleResize(e) {
        if (!this.isResizing) return;
        
        const deltaX = e.clientX - this.startPos.x;
        const deltaY = e.clientY - this.startPos.y;
        
        let newWidth = this.startSize.width;
        let newHeight = this.startSize.height;
        
        // Вычисляем новые размеры в зависимости от направления
        switch (this.resizeDirection) {
            case 'left':
                newWidth = Math.max(this.windowSize.minWidth, 
                    Math.min(this.windowSize.maxWidth, this.startSize.width - deltaX));
                break;
            case 'top':
                newHeight = Math.max(this.windowSize.minHeight, 
                    Math.min(this.windowSize.maxHeight, this.startSize.height - deltaY));
                break;
            case 'top-left':
                newWidth = Math.max(this.windowSize.minWidth, 
                    Math.min(this.windowSize.maxWidth, this.startSize.width - deltaX));
                newHeight = Math.max(this.windowSize.minHeight, 
                    Math.min(this.windowSize.maxHeight, this.startSize.height - deltaY));
                break;
        }
        
        // Применяем новые размеры
        this.windowSize.width = newWidth;
        this.windowSize.height = newHeight;
        
        this.chatWindow.style.width = newWidth + 'px';
        this.chatWindow.style.height = newHeight + 'px';
    }
    
    /**
     * Завершение изменения размера
     */
    stopResize() {
        this.isResizing = false;
        this.resizeDirection = null;
        
        // Убираем визуальную индикацию
        this.chatWindow.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Сохраняем размеры в localStorage
        this.saveWindowSize();
    }
    
    /**
     * Получение курсора для направления изменения размера
     */
    getCursorForDirection(direction) {
        switch (direction) {
            case 'left': return 'ew-resize';
            case 'top': return 'ns-resize';
            case 'top-left': return 'nw-resize';
            default: return 'default';
        }
    }
    
    /**
     * Сохранение размеров окна в localStorage
     */
    saveWindowSize() {
        try {
            localStorage.setItem('ai-chat-window-size', JSON.stringify({
                width: this.windowSize.width,
                height: this.windowSize.height
            }));
        } catch (error) {
            console.error('Ошибка сохранения размеров окна:', error);
        }
    }
    
    /**
     * Загрузка размеров окна из localStorage
     */
    loadWindowSize() {
        try {
            const saved = localStorage.getItem('ai-chat-window-size');
            if (saved) {
                const size = JSON.parse(saved);
                if (size.width && size.height) {
                    this.windowSize.width = Math.max(this.windowSize.minWidth, 
                        Math.min(this.windowSize.maxWidth, size.width));
                    this.windowSize.height = Math.max(this.windowSize.minHeight, 
                        Math.min(this.windowSize.maxHeight, size.height));
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки размеров окна:', error);
        }
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
        
        // Убираем блокировку overflow - окно не должно мешать работе с интерфейсом
        // document.body.style.overflow = 'hidden';
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

        // document.body.style.overflow = '';
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
        messageElement.className = 'flex items-start space-x-2';

        const timestamp = new Date().toLocaleString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (type === 'user') {
            messageElement.innerHTML = `
                <div class="flex-1 flex justify-end">
                    <div class="bg-blue-500 text-white rounded px-2 py-1 max-w-xs">
                        <p class="text-xs whitespace-pre-wrap">${this.escapeHtml(content)}</p>
                    </div>
                </div>
                <div class="flex-shrink-0 w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center">
                    <svg class="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
                    </svg>
                </div>
            `;
        } else if (type === 'ai') {
            const providerInfo = metadata.provider ? ` • ${metadata.provider}` : '';
            
            messageElement.innerHTML = `
                <div class="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div class="flex-1">
                    <div class="bg-gray-100 rounded px-2 py-1">
                        <div class="text-xs">
                            ${this.formatAIResponse(content)}
                        </div>
                    </div>
                    <div class="text-xs text-gray-400 mt-0.5">
                        AI • ${timestamp}${providerInfo}
                    </div>
                </div>
            `;
        } else if (type === 'error') {
            messageElement.innerHTML = `
                <div class="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/>
                    </svg>
                </div>
                <div class="flex-1">
                    <div class="bg-red-50 border border-red-200 rounded px-2 py-1">
                        <p class="text-xs text-red-800">${this.escapeHtml(content)}</p>
                    </div>
                    <div class="text-xs text-gray-400 mt-0.5">Ошибка • ${timestamp}</div>
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
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 80) + 'px';
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
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            `;
        } else {
            this.sendButton.innerHTML = `
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
     * Показ статусного сообщения
     * @param {string} message - сообщение
     * @param {string} type - тип ('success', 'error', 'info')
     */
    showStatus(message, type = 'info') {
        try {
            // Ищем контейнер для статусов в модале
            let statusContainer = this.modal.querySelector('.status-container');
            
            if (!statusContainer) {
                // Создаем контейнер для статусов если его нет
                statusContainer = document.createElement('div');
                statusContainer.className = 'status-container p-3 border-b border-gray-200';
                const chatBody = this.modal.querySelector('.modal-body');
                chatBody.insertBefore(statusContainer, chatBody.firstChild);
            }

            // Очищаем предыдущие сообщения
            statusContainer.innerHTML = '';

            // Создаем элемент статуса
            const statusEl = document.createElement('div');
            statusEl.className = `status-message text-sm px-3 py-2 rounded ${
                type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
                type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
                'bg-blue-100 text-blue-800 border border-blue-200'
            }`;
            statusEl.textContent = message;

            statusContainer.appendChild(statusEl);

            // Автоматически скрываем через 5 секунд
            setTimeout(() => {
                if (statusEl && statusEl.parentNode) {
                    statusEl.parentNode.removeChild(statusEl);
                }
            }, 5000);

        } catch (error) {
            console.error('Ошибка показа статуса в AI чате:', error);
            // Fallback - выводим в консоль
            console.log(`AI Chat Status (${type}): ${message}`);
        }
    }

    /**
     * Обработка ввода для быстрых команд
     */
    handleQuickCommandInput(e) {
        const input = this.messageInput.value;
        
        // Показываем меню команд, если ввод начинается с "/"
        if (input.startsWith('/')) {
            this.showQuickCommands(input);
        } else if (this.showingQuickCommands) {
            this.hideQuickCommands();
        }
    }

    /**
     * Показать меню быстрых команд
     */
    showQuickCommands(input) {
        const menu = this.modal.querySelector('[data-role="quick-commands-menu"]');
        if (!menu) return;

        const filter = input.toLowerCase();
        const matchingCommands = Object.entries(this.quickCommands)
            .filter(([cmd, data]) => cmd.toLowerCase().includes(filter));

        if (matchingCommands.length === 0) {
            this.hideQuickCommands();
            return;
        }

        // Создаем список команд
        menu.innerHTML = matchingCommands.map(([cmd, data]) => `
            <div class="px-2 py-1 hover:bg-gray-100 cursor-pointer text-xs border-b border-gray-100 last:border-b-0"
                 data-command="${cmd}">
                <div class="font-medium text-blue-600">${cmd}</div>
                <div class="text-gray-500 text-xs">${data.description}</div>
            </div>
        `).join('');

        // Добавляем обработчики кликов
        menu.querySelectorAll('[data-command]').forEach(item => {
            item.addEventListener('click', (e) => {
                const command = e.currentTarget.getAttribute('data-command');
                this.executeQuickCommand(command);
            });
        });

        menu.classList.remove('hidden');
        this.showingQuickCommands = true;
    }

    /**
     * Скрыть меню быстрых команд
     */
    hideQuickCommands() {
        const menu = this.modal.querySelector('[data-role="quick-commands-menu"]');
        if (menu) {
            menu.classList.add('hidden');
        }
        this.showingQuickCommands = false;
    }

    /**
     * Выполнение быстрой команды
     */
    async executeQuickCommand(command) {
        this.hideQuickCommands();
        this.messageInput.value = '';
        this.updateSendButton();

        if (this.quickCommands[command]) {
            try {
                await this.quickCommands[command].handler();
            } catch (error) {
                console.error('❌ Ошибка выполнения команды:', command, error);
                this.addMessage(
                    `Ошибка выполнения команды ${command}: ${error.message}`,
                    'error'
                );
            }
        }
    }

    /**
     * Обработчик команды /analysis - анализ области
     */
    async handleAreaAnalysis() {
        // Получаем ID текущей области из URL
        const urlParams = new URLSearchParams(window.location.search);
        let areaId = urlParams.get('id');


        // Fallback для тестирования - используем первую доступную область
        if (!areaId) {
            try {
                const areas = await window.db.getAll('map_areas');
                if (areas && areas.length > 0) {
                    areaId = areas[0].id;
                    this.addMessage(
                        `⚠️ ID области не найден в URL, используем для тестирования область "${areas[0].name}" (ID: ${areaId})`,
                        'ai'
                    );
                } else {
                    this.addMessage(
                        'В базе данных нет областей для анализа. Сначала создайте область на главной странице.',
                        'error'
                    );
                    return;
                }
            } catch (error) {
                console.error('❌ Ошибка получения областей:', error);
                this.addMessage(
                    'Команда /analysis доступна только на странице области или при наличии созданных областей',
                    'error'
                );
                return;
            }
        }

        this.addMessage('/analysis', 'user');
        
        // Показываем индикатор обработки
        this.showTypingIndicator();
        this.isProcessing = true;
        this.updateSendButton();

        try {
            // Получаем сервис анализа области
            const analysisService = this.diContainer.get('AIAreaAnalysisService');
            if (!analysisService) {
                throw new Error('AIAreaAnalysisService не найден в DI контейнере');
            }

            // ID области может быть строкой (id_1754910078796_pcix8sia1) или числом
            if (!areaId || areaId.toString().trim() === '') {
                throw new Error(`Пустой ID области: ${areaId}`);
            }


            // Запускаем анализ (передаем ID как есть - строку или число)
            const result = await analysisService.analyzeAreaWithAI(areaId);
            
            // Отображаем результат
            this.addMessage(result, 'ai', {
                provider: 'area-analysis',
                command: '/area'
            });

        } catch (error) {
            console.error('❌ Ошибка анализа области:', error);
            this.addMessage(
                'Произошла ошибка при анализе области. Попробуйте позже.',
                'error'
            );
        } finally {
            this.hideTypingIndicator();
            this.isProcessing = false;
            this.updateSendButton();
        }
    }

    /**
     * Обработчик команды /help - помощь
     */
    async handleHelp() {
        this.addMessage('/help', 'user');

        const helpText = `**Доступные быстрые команды:**

${Object.entries(this.quickCommands).map(([cmd, data]) => 
    `**${cmd}** - ${data.description}`
).join('\n\n')}

**Как использовать:**
- Введите / в начале сообщения для вызова меню команд
- Выберите команду из списка или введите полностью
- Нажмите Enter для выполнения

**Обычный чат:**
Также можете задавать обычные вопросы без команд.`;

        this.addMessage(helpText, 'ai', {
            provider: 'help',
            command: '/help'
        });
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
        
        // Восстанавливаем overflow (не нужно - окно не блокирует интерфейс)
        // document.body.style.overflow = '';
        
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