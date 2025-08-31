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
            '/identifyaddresses': {
                description: 'Определение адресов - запуск умного алгоритма определения адресов для объявлений',
                handler: this.handleIdentifyAddresses.bind(this)
            },
            '/listingsupdate': {
                description: 'Обновление объявлений - запуск процесса обновления данных',
                handler: this.handleListingUpdate.bind(this)
            },
            '/processduplicates': {
                description: 'Обработка дублей - AI-анализ и объединение дубликатов объявлений',
                handler: this.handleProcessDuplicates.bind(this)
            },
            '/help': {
                description: 'Помощь - список всех доступных команд',
                handler: this.handleHelp.bind(this)
            }
        };
        this.showingQuickCommands = false;
        this.selectedCommandIndex = -1;
        this.filteredCommands = [];
        
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
            <div class="bg-white rounded-lg shadow-2xl flex flex-col relative border border-gray-300
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
                    
                    <div class="flex items-center space-x-1">
                        <!-- Кнопка фильтра -->
                        <button class="p-1 rounded hover:bg-gray-100 transition-colors" 
                                data-role="filter-toggle" 
                                title="Фильтры сегментов">
                            <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z"></path>
                            </svg>
                        </button>
                        
                        <button class="text-gray-400 hover:text-gray-600 transition-colors p-0.5" 
                                data-role="close-button" title="Закрыть">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Панель фильтров (скрытая по умолчанию) -->
                <div class="hidden border-b border-gray-200 bg-gray-50 p-2" data-role="filter-panel">
                    <div class="space-y-2">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <!-- Фильтр сегментов -->
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-1">Сегменты:</label>
                                <select multiple data-role="segments-filter" class="w-full text-xs">
                                    <option value="">Загрузка...</option>
                                </select>
                            </div>
                            
                            <!-- Фильтр подсегментов -->
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-1">Подсегменты:</label>
                                <select multiple data-role="subsegments-filter" class="w-full text-xs">
                                    <option value="">Выберите сначала сегменты</option>
                                </select>
                            </div>
                        </div>
                        
                        <!-- Кнопки управления фильтрами -->
                        <div class="flex justify-between items-center">
                            <div class="text-xs text-gray-600">
                                <span data-role="filter-summary">Все данные</span>
                            </div>
                            <div class="space-x-1">
                                <button class="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded" 
                                        data-role="clear-filters">Сбросить</button>
                                <button class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded" 
                                        data-role="apply-filters">Применить</button>
                            </div>
                        </div>
                    </div>
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
        
        // Элементы фильтров
        this.filterToggle = this.modal.querySelector('[data-role="filter-toggle"]');
        this.filterPanel = this.modal.querySelector('[data-role="filter-panel"]');
        this.segmentsFilter = this.modal.querySelector('[data-role="segments-filter"]');
        this.subsegmentsFilter = this.modal.querySelector('[data-role="subsegments-filter"]');
        this.filterSummary = this.modal.querySelector('[data-role="filter-summary"]');
        this.clearFiltersBtn = this.modal.querySelector('[data-role="clear-filters"]');
        this.applyFiltersBtn = this.modal.querySelector('[data-role="apply-filters"]');

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
            // Обработка навигации по быстрым командам
            if (this.showingQuickCommands) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateQuickCommands('down');
                    return;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateQuickCommands('up');
                    return;
                } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (this.selectedCommandIndex >= 0) {
                        this.selectQuickCommand(this.selectedCommandIndex);
                    } else {
                        this.hideQuickCommands();
                        this.sendMessage();
                    }
                    return;
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideQuickCommands();
                    return;
                }
            }
            
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
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

        // Обработчики фильтров
        this.bindFilterEvents();

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

        // Проверяем, является ли это быстрой командой
        if (message.startsWith('/')) {
            const command = message.split(' ')[0];
            if (this.quickCommands[command]) {
                this.isProcessing = true;
                this.updateSendButton();
                
                // Очищаем поле ввода
                this.messageInput.value = '';
                this.adjustTextareaHeight();
                this.updateCharCounter();
                
                try {
                    // Выполняем команду
                    await this.quickCommands[command].handler();
                } catch (error) {
                    console.error(`Ошибка выполнения команды ${command}:`, error);
                    this.addMessage(`❌ Ошибка выполнения команды ${command}: ${error.message}`, 'error');
                } finally {
                    this.isProcessing = false;
                    this.updateSendButton();
                    this.hideTypingIndicator();
                }
                return;
            } else {
                // Неизвестная команда
                this.addMessage(message, 'user');
                this.messageInput.value = '';
                this.adjustTextareaHeight();
                this.updateCharCounter();
                this.addMessage(`❌ Unknown slash command: ${command.substring(1)}`, 'error');
                return;
            }
        }

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
        
        return messageElement;
    }

    /**
     * Обновление существующего сообщения
     * @param {HTMLElement} messageElement - Элемент сообщения для обновления
     * @param {string} content - Новый контент
     * @param {Object} metadata - Дополнительные данные
     */
    updateMessage(messageElement, content, metadata = {}) {
        if (!messageElement) return;

        const timestamp = new Date().toLocaleString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Обновляем контент в AI сообщении
        const contentDiv = messageElement.querySelector('.bg-gray-100 .text-xs');
        if (contentDiv) {
            contentDiv.innerHTML = this.formatAIResponse(content);
        }

        // Обновляем timestamp
        const timestampDiv = messageElement.querySelector('.text-gray-400');
        if (timestampDiv && metadata.provider) {
            timestampDiv.textContent = `AI • ${timestamp} • ${metadata.provider}`;
        }

        this.scrollToBottom();
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

        // Сохраняем отфильтрованные команды и выделяем первую
        this.filteredCommands = matchingCommands;
        this.selectedCommandIndex = 0;

        // Создаем список команд
        menu.innerHTML = matchingCommands.map(([cmd, data], index) => `
            <div class="px-2 py-1 hover:bg-gray-100 cursor-pointer text-xs border-b border-gray-100 last:border-b-0"
                 data-command="${cmd}" data-index="${index}">
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
        
        // Подсвечиваем первый элемент
        this.updateQuickCommandsHighlight(-1, 0);
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
        this.selectedCommandIndex = -1;
        this.filteredCommands = [];
    }

    /**
     * Навигация по быстрым командам с клавиатуры
     */
    navigateQuickCommands(direction) {
        if (!this.showingQuickCommands || this.filteredCommands.length === 0) return;

        const oldIndex = this.selectedCommandIndex;

        if (direction === 'down') {
            // Не идём ниже последнего элемента
            this.selectedCommandIndex = Math.min(this.selectedCommandIndex + 1, this.filteredCommands.length - 1);
        } else if (direction === 'up') {
            // Не идём выше первого элемента
            this.selectedCommandIndex = Math.max(this.selectedCommandIndex - 1, 0);
        }

        // Обновляем подсветку только если индекс изменился
        if (oldIndex !== this.selectedCommandIndex) {
            this.updateQuickCommandsHighlight(oldIndex, this.selectedCommandIndex);
        }
    }

    /**
     * Обновление подсветки команд
     */
    updateQuickCommandsHighlight(oldIndex, newIndex) {
        const menu = this.modal.querySelector('[data-role="quick-commands-menu"]');
        if (!menu) return;

        const items = menu.querySelectorAll('[data-index]');
        
        // Убираем подсветку с предыдущего элемента
        if (oldIndex >= 0 && oldIndex < items.length && items[oldIndex]) {
            items[oldIndex].classList.remove('bg-blue-50', 'border-blue-200');
            items[oldIndex].classList.add('hover:bg-gray-100');
        }

        // Добавляем подсветку к новому элементу
        if (newIndex >= 0 && items[newIndex]) {
            items[newIndex].classList.remove('hover:bg-gray-100');
            items[newIndex].classList.add('bg-blue-50', 'border-blue-200');
            
            // Прокручиваем к выбранному элементу
            items[newIndex].scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }

    /**
     * Выбор команды по индексу
     */
    selectQuickCommand(index) {
        if (index < 0 || index >= this.filteredCommands.length) return;

        const [command] = this.filteredCommands[index];
        
        // Устанавливаем команду в поле ввода
        this.messageInput.value = command;
        
        // Скрываем меню
        this.hideQuickCommands();
        
        // Отправляем команду
        this.sendMessage();
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
                command: '/analysis'
            });

            // Проверяем необходимость автоматического обновления объявлений
            await this.checkAndTriggerAutoUpdate(areaId, analysisService);

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
     * Обработчик команды /listingsupdate - обновление объявлений
     */
    async handleListingUpdate() {
        this.addMessage('/listingsupdate', 'user');

        try {
            // Получаем ID текущей области из URL
            const urlParams = new URLSearchParams(window.location.search);
            let areaId = urlParams.get('id');
            
            if (!areaId) {
                // Пробуем получить из DataState если доступен
                if (window.dataState && window.dataState.getState) {
                    const currentArea = window.dataState.getState('currentArea');
                    if (currentArea && currentArea.id) {
                        areaId = currentArea.id;
                    }
                }
            }

            if (!areaId) {
                this.addMessage('❌ **Ошибка:** Не удалось определить текущую область. Убедитесь, что вы находитесь на странице области.', 'error');
                return;
            }

            // Показываем сообщение о начале процесса
            this.addMessage('🔄 **Запускаю процесс обновления объявлений...**\n\nИнициализирую систему обновления объявлений для области.', 'ai', {
                provider: 'system',
                command: '/listingsupdate'
            });

            // Получаем сервис обновления объявлений из DIContainer
            let listingUpdateService;
            try {
                if (this.diContainer && typeof this.diContainer.get === 'function') {
                    try {
                        const providerFactory = this.diContainer.get('ListingUpdateProviderFactory');
                        if (providerFactory) {
                            // Ждем инициализации фабрики, если она еще не готова
                            let attempts = 0;
                            while (!providerFactory.initialized && attempts < 50) { // до 5 секунд ожидания
                                await new Promise(resolve => setTimeout(resolve, 100));
                                attempts++;
                            }
                            
                            if (providerFactory.initialized) {
                                listingUpdateService = providerFactory.getProvider('cian');
                            }
                        }
                    } catch (diError) {
                        console.warn('⚠️ Не удалось получить сервис из DIContainer:', diError.message);
                    }
                }

                // Fallback: пытаемся создать сервис напрямую
                if (!listingUpdateService && typeof window.CianListingUpdateService !== 'undefined') {
                    listingUpdateService = new window.CianListingUpdateService();
                    await listingUpdateService.initialize({
                        db: window.db,
                        progressManager: window.progressManager,
                        parsingManager: window.parsingManager
                    });
                }

                if (!listingUpdateService) {
                    throw new Error('Сервис обновления объявлений недоступен');
                }

            } catch (serviceError) {
                this.addMessage(`❌ **Ошибка инициализации:** ${serviceError.message}`, 'error');
                return;
            }

            // Настраиваем callback для прогресса
            let lastProgressMessage = null;
            listingUpdateService.setProgressCallback((progressData) => {
                const { current, total, progress, message, stats } = progressData;
                
                const progressText = `🔄 **Прогресс обновления:** ${progress}%\n\n` +
                    `📊 **Статистика:**\n` +
                    `• Обработано: ${current}/${total}\n` +
                    `• Обновлено: ${stats.updated}\n` +
                    `• Ошибок: ${stats.failed}\n\n` +
                    `💬 **Статус:** ${message}`;

                // Обновляем последнее сообщение о прогрессе или создаем новое
                if (lastProgressMessage) {
                    this.updateMessage(lastProgressMessage, progressText);
                } else {
                    lastProgressMessage = this.addMessage(progressText, 'ai', {
                        provider: 'system',
                        command: '/listingsupdate',
                        progress: true
                    });
                }
            });

            // Получаем текущие фильтры
            const filters = this.getCurrentFilters();
            
            // Запускаем обновление объявлений
            const result = await listingUpdateService.updateListingsByArea(areaId, {
                source: 'cian',
                maxAgeDays: 7,
                batchSize: 5,
                filters: filters
            });

            // Отображаем результат
            if (result.success) {
                const stats = result.stats;
                const duration = stats.duration ? Math.round(stats.duration / 1000) : 0;
                
                const resultText = `✅ **Обновление завершено успешно!**\n\n` +
                    `📊 **Итоговая статистика:**\n` +
                    `• Всего обработано: ${stats.total} объявлений\n` +
                    `• Успешно обновлено: ${stats.updated}\n` +
                    `• Ошибок: ${stats.failed}\n` +
                    `• Пропущено: ${stats.skipped}\n` +
                    `• Время выполнения: ${duration} секунд\n\n` +
                    `💡 **Результат:** ${result.message}`;

                this.addMessage(resultText, 'ai', {
                    provider: 'cian-update',
                    command: '/listingsupdate',
                    stats: stats
                });

            } else {
                this.addMessage(`❌ **Ошибка обновления:** ${result.message}\n\n` +
                    (result.stats ? `📊 **Частичные результаты:**\n` +
                    `• Обновлено: ${result.stats.updated}\n` +
                    `• Ошибок: ${result.stats.failed}` : ''), 'error');
            }

        } catch (error) {
            console.error('❌ Ошибка команды /listingsupdate:', error);
            this.addMessage(`❌ **Критическая ошибка:** ${error.message}\n\n` +
                'Проверьте консоль для получения подробной информации.', 'error');
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
     * Обработчик команды определения адресов
     */
    async handleIdentifyAddresses() {
        this.addMessage('/identifyaddresses', 'user');
        let progressMessage = null;

        try {
            // Проверяем наличие зависимостей
            if (!window.addressManager || !window.smartAddressMatcher) {
                this.addMessage('❌ **Ошибка**: Сервисы определения адресов не инициализированы', 'ai', {
                    provider: 'system',
                    command: '/identifyaddresses'
                });
                return;
            }

            // ЭТАП 1: ML-алгоритм
            progressMessage = this.addMessage('🧠 **Запускаю ML-алгоритм для определения адресов...**', 'ai', {
                provider: 'system',
                command: '/identifyaddresses'
            });

            const mlResult = await this.runMLAddressIdentification(progressMessage);
            this.updateMessage(progressMessage, mlResult.message, {
                provider: 'system'
            });

            // ЭТАП 2: AI-валидация определённых адресов (строгая проверка)
            if (mlResult.matched > 0) {
                this.addMessage('🔍 **AI-валидация точности определённых адресов...**', 'ai', {
                    provider: 'system',
                    command: '/identifyaddresses'
                });

                const validationResult = await this.runAddressValidation();
                this.addMessage(validationResult.message, 'ai', {
                    provider: 'system',
                    command: '/identifyaddresses'
                });
            }

            // ЭТАП 3: AI-определение для необработанных объявлений (включая сброшенные на этапе 2)
            this.addMessage('🤖 **AI-определение адресов для необработанных объявлений...**', 'ai', {
                provider: 'system',
                command: '/identifyaddresses'
            });

            const aiResult = await this.runAIAddressIdentification();
            this.addMessage(aiResult.message, 'ai', {
                provider: 'system',
                command: '/identifyaddresses'
            });

            // Итоговое сообщение
            this.addMessage('🎉 **Определение адресов завершено!**', 'ai', {
                provider: 'system',
                command: '/identifyaddresses'
            });

        } catch (error) {
            console.error('Ошибка при выполнении определения адресов:', error);
            this.addMessage(`❌ **Критическая ошибка**: ${error.message}`, 'ai', {
                provider: 'system',
                command: '/identifyaddresses'
            });
        }
    }

    /**
     * Запуск ML-алгоритма определения адресов
     */
    async runMLAddressIdentification(progressMessage) {
        try {
            // Проверяем доступность менеджеров
            if (!window.addressManager) {
                throw new Error('AddressManager не инициализирован');
            }
            if (!window.progressManager) {
                throw new Error('ProgressManager не инициализирован');
            }

            // Перехватываем методы progressManager для отображения прогресса
            let result = null;
            const originalShowSuccess = window.progressManager.showSuccess;
            const originalUpdateProgressBar = window.progressManager.updateProgressBar;
            
            // Перехватываем прогресс и обновляем сообщение в чате
            window.progressManager.updateProgressBar = (id, progress, message) => {
                if (progressMessage && message && id === 'addresses') {
                    // Форматируем сообщение с прогрессом
                    const progressText = progress ? ` (${Math.round(progress)}%)` : '';
                    this.updateMessage(progressMessage, `🧠 **ML-алгоритм**: ${message}${progressText}`, {
                        provider: 'system'
                    });
                }
                originalUpdateProgressBar.call(window.progressManager, id, progress, message);
            };
            
            window.progressManager.showSuccess = (message) => {
                result = this.parseMLResults(message);
                originalShowSuccess.call(window.progressManager, message);
            };

            await window.addressManager.processAddressesSmart();
            
            // Восстанавливаем оригинальные методы
            window.progressManager.showSuccess = originalShowSuccess;
            window.progressManager.updateProgressBar = originalUpdateProgressBar;
            
            return result || {
                message: '⚠️ **ML-алгоритм завершён, но статистика недоступна**',
                matched: 0
            };

        } catch (error) {
            return {
                message: `❌ **Ошибка ML-алгоритма**: ${error.message}`,
                matched: 0
            };
        }
    }

    /**
     * Запуск AI-определения адресов
     */
    async runAIAddressIdentification() {
        try {
            // Проверяем доступность необходимых сервисов
            if (typeof AddressValidationService === 'undefined') {
                throw new Error('AddressValidationService не загружен');
            }
            if (!window.db) {
                throw new Error('Database не инициализирована');
            }
            if (!window.addressManager) {
                throw new Error('AddressManager не инициализирован');
            }

            // Создаём и инициализируем AddressValidationService
            const validationService = new AddressValidationService();
            await validationService.initialize({
                db: window.db,
                addressManager: window.addressManager,
                smartMatcher: window.smartAddressMatcher,
                universalAI: this.universalAI
            });

            // Создаём прогресс-коллбек с обновлением сообщения
            let progressMessage = null;
            const progressCallback = async (progress) => {
                const percent = Math.round((progress.processed / progress.total) * 100);
                const progressText = `⏳ **Обрабатываю:** ${progress.processed}/${progress.total} (${percent}%) | Найдено: ${progress.found} | Ошибок: ${progress.errors}`;
                
                if (progressMessage) {
                    this.updateMessage(progressMessage, progressText);
                } else {
                    progressMessage = this.addMessage(progressText, 'ai', {
                        provider: 'system',
                        command: '/identifyaddresses'
                    });
                }
            };

            const result = await validationService.findAddressesWithAI(progressCallback);
            return {
                message: result.message,
                foundByAI: result.stats.foundByAI
            };

        } catch (error) {
            return {
                message: `❌ **Ошибка AI-определения**: ${error.message}`,
                foundByAI: 0
            };
        }
    }

    /**
     * Запуск проверки точности адресов
     */
    async runAddressValidation() {
        try {
            // Проверяем доступность необходимых сервисов
            if (typeof AddressValidationService === 'undefined') {
                throw new Error('AddressValidationService не загружен');
            }
            if (!window.db) {
                throw new Error('Database не инициализирована');
            }
            if (!window.addressManager) {
                throw new Error('AddressManager не инициализирован');
            }

            const validationService = new AddressValidationService();
            await validationService.initialize({
                db: window.db,
                addressManager: window.addressManager,
                smartMatcher: window.smartAddressMatcher,
                universalAI: this.universalAI
            });

            // Создаём прогресс-коллбек для проверки точности с обновлением сообщения
            let validationProgressMessage = null;
            const validationProgressCallback = async (progress) => {
                if (progress.stage === 'analysis') {
                    const progressText = `🔍 **Анализирую расстояния:** ${progress.processed}/${progress.total} адресов`;
                    
                    if (validationProgressMessage) {
                        this.updateMessage(validationProgressMessage, progressText);
                    } else {
                        validationProgressMessage = this.addMessage(progressText, 'ai', {
                            provider: 'system',
                            command: '/identifyaddresses'
                        });
                    }
                } else if (progress.stage === 'validation') {
                    const progressText = `🤖 **AI-проверка адресов:** ${progress.processed}/${progress.total} (${Math.round((progress.processed / progress.total) * 100)}%)`;
                    
                    if (validationProgressMessage) {
                        this.updateMessage(validationProgressMessage, progressText);
                    } else {
                        validationProgressMessage = this.addMessage(progressText, 'ai', {
                            provider: 'system',
                            command: '/identifyaddresses'
                        });
                    }
                }
            };

            const result = await validationService.validateAddressAccuracy(validationProgressCallback);
            return {
                message: result.message
            };

        } catch (error) {
            return {
                message: `❌ **Ошибка проверки точности**: ${error.message}`
            };
        }
    }

    /**
     * Парсинг результатов ML-алгоритма из сообщения
     */
    parseMLResults(message) {
        try {
            // Извлекаем статистику из сообщения ML-алгоритма
            const processedMatch = message.match(/Обработано:\s*(\d+)/);
            const matchedMatch = message.match(/Найдены адреса:\s*(\d+)/);
            const improvedMatch = message.match(/Улучшено:\s*(\d+)/);
            const perfectMatch = message.match(/Идеальная точность:\s*(\d+)/);
            const highMatch = message.match(/Высокая точность:\s*(\d+)/);
            const mediumMatch = message.match(/Средняя точность:\s*(\d+)/);
            const lowMatch = message.match(/Низкая точность:\s*(\d+)/);
            const veryLowMatch = message.match(/Очень низкая:\s*(\d+)/);
            const noMatchMatch = message.match(/Не найдено:\s*(\d+)/);

            const stats = {
                processed: processedMatch ? parseInt(processedMatch[1]) : 0,
                matched: matchedMatch ? parseInt(matchedMatch[1]) : 0,
                improved: improvedMatch ? parseInt(improvedMatch[1]) : 0,
                perfect: perfectMatch ? parseInt(perfectMatch[1]) : 0,
                high: highMatch ? parseInt(highMatch[1]) : 0,
                medium: mediumMatch ? parseInt(mediumMatch[1]) : 0,
                low: lowMatch ? parseInt(lowMatch[1]) : 0,
                veryLow: veryLowMatch ? parseInt(veryLowMatch[1]) : 0,
                noMatch: noMatchMatch ? parseInt(noMatchMatch[1]) : 0
            };

            const formattedMessage = `🧠 **ML-алгоритм завершён:**

📊 **Обработано:** ${stats.processed} объявлений
✅ **Найдено адресов:** ${stats.matched}
📈 **Улучшено:** ${stats.improved}

**По уровням точности:**
• 🎯 Идеальная: ${stats.perfect}
• 🟢 Высокая: ${stats.high}  
• 🟡 Средняя: ${stats.medium}
• 🟠 Низкая: ${stats.low}
• 🔴 Очень низкая: ${stats.veryLow}
• ❌ Не найдено: ${stats.noMatch}`;

            return {
                message: formattedMessage,
                matched: stats.matched,
                noMatch: stats.noMatch
            };

        } catch (error) {
            return {
                message: '✅ **ML-алгоритм завершён** (статистика недоступна)',
                matched: 0
            };
        }
    }

    /**
     * Проверка необходимости автоматического обновления объявлений
     * @param {string|number} areaId - ID области
     * @param {AIAreaAnalysisService} analysisService - Сервис анализа
     */
    async checkAndTriggerAutoUpdate(areaId, analysisService) {
        try {
            // Получаем статистику по объявлениям в области
            const areaData = await analysisService.gatherAreaData(areaId);
            
            // Проверяем конфигурацию автообновления
            const autoUpdateConfig = await this.getAutoUpdateConfig();
            
            if (!autoUpdateConfig.enabled) {
                return; // Автообновление отключено
            }

            // Вычисляем процент объявлений, требующих обновления
            const totalListings = areaData.listings.total;
            const needsUpdate = areaData.listings.needsUpdate || 0;
            
            if (totalListings === 0) {
                return; // Нет объявлений для проверки
            }

            const updatePercentage = (needsUpdate / totalListings) * 100;
            const threshold = autoUpdateConfig.threshold || 30; // По умолчанию 30%

            if (updatePercentage >= threshold) {
                // Показываем предложение об автообновлении
                const shouldUpdate = await this.askUserForAutoUpdate(needsUpdate, totalListings, updatePercentage);
                
                if (shouldUpdate) {
                    // Добавляем сообщение о запуске автообновления
                    this.addMessage(`🔄 **Автоматический запуск обновления объявлений**\n\n` +
                        `Найдено ${needsUpdate} объявлений (${Math.round(updatePercentage)}%) требующих обновления. ` +
                        `Порог для автозапуска: ${threshold}%.\n\n` +
                        `Запускаю процесс обновления...`, 'ai', {
                        provider: 'auto-update',
                        command: '/analysis'
                    });

                    // Запускаем обновление объявлений
                    await this.triggerAutoListingUpdate(areaId);
                }
            }

        } catch (error) {
            console.error('❌ Ошибка проверки автообновления:', error);
            // Не показываем ошибку пользователю, чтобы не прерывать основной поток
        }
    }

    /**
     * Получение конфигурации автообновления
     * @returns {Promise<Object>} Конфигурация автообновления
     */
    async getAutoUpdateConfig() {
        try {
            // Попробуем получить из ConfigService
            if (this.diContainer && typeof this.diContainer.get === 'function') {
                try {
                    const configService = this.diContainer.get('ConfigService');
                    const config = configService.get('ai.listingUpdate');
                    if (config) {
                        return {
                            enabled: config.autoUpdateEnabled !== false,
                            threshold: config.autoUpdateThreshold || 30,
                            confirmBeforeUpdate: config.confirmBeforeAutoUpdate !== false
                        };
                    }
                } catch (diError) {
                    // Fallback к настройкам по умолчанию
                }
            }

            // Настройки по умолчанию
            return {
                enabled: true,
                threshold: 30,
                confirmBeforeUpdate: true
            };

        } catch (error) {
            return {
                enabled: true,
                threshold: 30,
                confirmBeforeUpdate: true
            };
        }
    }

    /**
     * Запрос подтверждения у пользователя для автообновления
     * @param {number} needsUpdate - Количество объявлений требующих обновления
     * @param {number} totalListings - Общее количество объявлений
     * @param {number} updatePercentage - Процент объявлений требующих обновления
     * @returns {Promise<boolean>} Подтверждение пользователя
     */
    async askUserForAutoUpdate(needsUpdate, totalListings, updatePercentage) {
        return new Promise((resolve) => {
            const message = `💡 **Обнаружены объявления, требующие обновления**\n\n` +
                `📊 **Статистика:**\n` +
                `• Требуют обновления: ${needsUpdate} из ${totalListings} объявлений\n` +
                `• Процент устаревших: ${Math.round(updatePercentage)}%\n\n` +
                `🤖 **Автоматическое обновление**\n` +
                `Запустить процесс обновления объявлений Cian сейчас?\n\n` +
                `**Примерное время выполнения:** ${Math.ceil(needsUpdate / 5)} минут`;

            // Создаем интерактивное сообщение с кнопками
            const messageElement = this.addMessage(message, 'ai', {
                provider: 'auto-update-prompt',
                command: '/analysis',
                interactive: true
            });

            // Добавляем кнопки для подтверждения
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'mt-2 flex space-x-2';
            
            const yesButton = document.createElement('button');
            yesButton.className = 'px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded transition-colors';
            yesButton.textContent = '✅ Да, обновить';
            yesButton.onclick = () => {
                buttonsContainer.remove();
                this.addMessage('✅ Пользователь подтвердил автоматическое обновление объявлений.', 'ai', {
                    provider: 'auto-update-confirm',
                    command: '/analysis'
                });
                resolve(true);
            };

            const noButton = document.createElement('button');
            noButton.className = 'px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded transition-colors';
            noButton.textContent = '❌ Нет, пропустить';
            noButton.onclick = () => {
                buttonsContainer.remove();
                this.addMessage('❌ Пользователь отклонил автоматическое обновление объявлений.', 'ai', {
                    provider: 'auto-update-decline',
                    command: '/analysis'
                });
                resolve(false);
            };

            buttonsContainer.appendChild(yesButton);
            buttonsContainer.appendChild(noButton);

            // Добавляем кнопки к сообщению
            const messageContent = messageElement.querySelector('.bg-gray-100');
            if (messageContent) {
                messageContent.appendChild(buttonsContainer);
            }

            this.scrollToBottom();
        });
    }

    /**
     * Запуск автоматического обновления объявлений
     * @param {string|number} areaId - ID области
     */
    async triggerAutoListingUpdate(areaId) {
        try {
            // Получаем сервис обновления объявлений
            let listingUpdateService;
            
            if (this.diContainer && typeof this.diContainer.get === 'function') {
                try {
                    const providerFactory = this.diContainer.get('ListingUpdateProviderFactory');
                    if (providerFactory) {
                        // Ждем инициализации фабрики, если она еще не готова
                        let attempts = 0;
                        while (!providerFactory.initialized && attempts < 50) { // до 5 секунд ожидания
                            await new Promise(resolve => setTimeout(resolve, 100));
                            attempts++;
                        }
                        
                        if (providerFactory.initialized) {
                            listingUpdateService = providerFactory.getProvider('cian');
                        }
                    }
                } catch (diError) {
                    console.warn('⚠️ Не удалось получить сервис из DIContainer:', diError.message);
                }
            }

            // Fallback: создаем сервис напрямую
            if (!listingUpdateService && typeof window.CianListingUpdateService !== 'undefined') {
                listingUpdateService = new window.CianListingUpdateService();
                await listingUpdateService.initialize({
                    db: window.db,
                    progressManager: window.progressManager,
                    parsingManager: window.parsingManager
                });
            }

            if (!listingUpdateService) {
                throw new Error('Сервис обновления объявлений недоступен');
            }

            // Добавим диагностику
            try {
                const testListings = await listingUpdateService.getUpdateableListings(areaId, 7);
                this.addMessage(`🔍 **Диагностика:** Найдено ${testListings.length} объявлений для обновления\n\n` +
                    `Если это число 0, проблема в логике фильтрации.`, 'ai', {
                    provider: 'diagnostic-auto',
                    command: '/analysis'
                });
            } catch (diagError) {
                this.addMessage(`❌ **Диагностика:** Ошибка при получении списка объявлений: ${diagError.message}`, 'error');
            }

            // Настраиваем callback для прогресса
            let lastProgressMessage = null;
            listingUpdateService.setProgressCallback((progressData) => {
                const { current, total, progress, message, stats } = progressData;
                
                const progressText = `🔄 **Автообновление прогресс:** ${progress}%\n\n` +
                    `📊 **Статистика:**\n` +
                    `• Обработано: ${current}/${total}\n` +
                    `• Обновлено: ${stats.updated}\n` +
                    `• Ошибок: ${stats.failed}\n\n` +
                    `💬 **Статус:** ${message}`;

                // Обновляем последнее сообщение о прогрессе или создаем новое
                if (lastProgressMessage) {
                    this.updateMessage(lastProgressMessage, progressText);
                } else {
                    lastProgressMessage = this.addMessage(progressText, 'ai', {
                        provider: 'auto-update-progress',
                        command: '/analysis',
                        progress: true
                    });
                }
            });

            // Получаем текущие фильтры  
            const filters = this.getCurrentFilters();
            
            // Запускаем обновление
            const result = await listingUpdateService.updateListingsByArea(areaId, {
                source: 'cian',
                maxAgeDays: 7,
                batchSize: 5,
                filters: filters
            });

            // Показываем результат автообновления
            if (result.success) {
                const stats = result.stats;
                const duration = stats.duration ? Math.round(stats.duration / 1000) : 0;
                
                const resultText = `✅ **Автообновление завершено успешно!**\n\n` +
                    `📊 **Итоговая статистика:**\n` +
                    `• Всего обработано: ${stats.total} объявлений\n` +
                    `• Успешно обновлено: ${stats.updated}\n` +
                    `• Ошибок: ${stats.failed}\n` +
                    `• Время выполнения: ${duration} секунд\n\n` +
                    `💡 **Результат:** ${result.message}\n\n` +
                    `🔄 Данные в области актуализированы. Рекомендую повторить анализ командой \`/analysis\` для получения обновленной статистики.`;

                this.addMessage(resultText, 'ai', {
                    provider: 'auto-update-result',
                    command: '/analysis',
                    stats: stats
                });
            } else {
                this.addMessage(`❌ **Ошибка автообновления:** ${result.message}`, 'error');
            }

        } catch (error) {
            console.error('❌ Ошибка автообновления объявлений:', error);
            this.addMessage(`❌ **Ошибка автообновления:** ${error.message}`, 'error');
        }
    }

    /**
     * Уничтожение компонента
     */
    /**
     * Обработчик команды /processduplicates - AI-обработка дублей
     */
    async handleProcessDuplicates() {
        this.addMessage('/processduplicates', 'user');

        try {
            // Получаем текущую область (несколько способов для надежности)
            let currentArea = null;
            
            // Способ 1: через this.dataState
            if (this.dataState) {
                currentArea = this.dataState.getState?.('currentArea') || this.dataState.currentArea;
            }
            
            // Способ 2: через глобальный window.dataState
            if (!currentArea && window.dataState) {
                currentArea = window.dataState.getState?.('currentArea') || window.dataState.currentArea;
            }
            
            // Способ 3: через DIContainer
            if (!currentArea && window.diContainer) {
                try {
                    const dataStateFromDI = window.diContainer.get('DataState');
                    if (dataStateFromDI) {
                        currentArea = dataStateFromDI.getState?.('currentArea') || dataStateFromDI.currentArea;
                    }
                } catch (error) {
                    // DIContainer недоступен
                }
            }
            
            // Способ 4: получить ID области из URL
            if (!currentArea) {
                const urlParams = new URLSearchParams(window.location.search);
                const areaIdFromUrl = urlParams.get('id');
                
                if (areaIdFromUrl && window.db) {
                    try {
                        currentArea = await window.db.getMapArea(areaIdFromUrl);
                    } catch (error) {
                        console.warn('⚠️ [AIDuplicateDetection] Не удалось загрузить область из URL:', error);
                    }
                }
            }
            
            if (!currentArea) {
                throw new Error('Не удалось определить текущую область. Убедитесь что область выбрана.');
            }

            console.log('✅ [AIDuplicateDetection] Текущая область найдена:', currentArea.name || currentArea.id);

            // Инициализируем AI-сервис обработки дублей
            if (!this.aiDuplicateService) {
                // Используем глобально подключенный класс (подключен через script в area.html)
                if (typeof AIDuplicateDetectionService !== 'undefined') {
                    this.aiDuplicateService = new AIDuplicateDetectionService();
                } else {
                    throw new Error('AIDuplicateDetectionService не найден. Проверьте подключение скрипта.');
                }
                
                await this.aiDuplicateService.init();
            }

            // Получаем статистику до обработки
            const filters = this.getCurrentFilters();
            const preStats = await this.aiDuplicateService.getDuplicateProcessingStats(filters);

            // ДИАГНОСТИЧЕСКИЙ РЕЖИМ: выводим подробную информацию о фильтрации
            let diagnosticMessage = '🔍 **ДИАГНОСТИКА: Анализ объявлений для обработки дублей**\n\n';
            
            // Информация о фильтрах
            if (filters.segments?.length > 0 || filters.subsegments?.length > 0) {
                diagnosticMessage += '🎯 **Применяемые фильтры:**\n';
                if (filters.segments?.length > 0) {
                    diagnosticMessage += `• Сегменты: ${filters.segments.length} выбрано\n`;
                }
                if (filters.subsegments?.length > 0) {
                    diagnosticMessage += `• Подсегменты: ${filters.subsegments.length} выбрано\n`;
                }
                diagnosticMessage += '\n';
            } else {
                diagnosticMessage += '🌐 **Фильтры:** Не установлены (обрабатываем всю область)\n\n';
            }

            // Детальная статистика
            diagnosticMessage += '📊 **Статистика объявлений:**\n';
            diagnosticMessage += `• Всего объявлений в области: ${preStats.total}\n`;
            diagnosticMessage += `• Уже обработано на дубли: ${preStats.processed}\n`;
            diagnosticMessage += `• **Требуют обработки**: ${preStats.needProcessing}\n`;
            diagnosticMessage += `• Эффективность обработки: ${preStats.efficiency}%\n\n`;

            if (preStats.needProcessing === 0) {
                diagnosticMessage += '✅ **Результат:** Все объявления уже обработаны!\n' +
                    'Нет объявлений требующих анализа дублей.';
                
                this.addMessage(diagnosticMessage, 'ai', {
                    provider: 'duplicate-processing-diagnostic',
                    command: '/processduplicates'
                });
                return;
            }

            // Получаем дополнительную диагностику по группировке
            const listingsForProcessing = await this.aiDuplicateService.getListingsForDuplicateProcessing(filters);
            const addressGroups = await this.aiDuplicateService.groupListingsByAddress(listingsForProcessing);
            
            diagnosticMessage += '🏠 **Группировка по адресам:**\n';
            diagnosticMessage += `• Уникальных адресов: ${addressGroups.size}\n`;
            diagnosticMessage += `• Объявлений для анализа: ${listingsForProcessing.length}\n\n`;

            // Анализ групп по размеру
            const groupSizes = Array.from(addressGroups.values()).map(group => group.length);
            const singleListingGroups = groupSizes.filter(size => size === 1).length;
            const multipleListingGroups = groupSizes.filter(size => size > 1).length;
            const maxGroupSize = Math.max(...groupSizes);

            diagnosticMessage += '📈 **Анализ групп:**\n';
            diagnosticMessage += `• Адресов с 1 объявлением: ${singleListingGroups} (создадим ${singleListingGroups} объектов)\n`;
            diagnosticMessage += `• Адресов с несколькими объявлениями: ${multipleListingGroups} (требуют AI-анализа)\n`;
            diagnosticMessage += `• Максимальный размер группы: ${maxGroupSize} объявлений\n\n`;

            diagnosticMessage += '⚠️ **ТЕСТОВЫЙ РЕЖИМ:** Процесс обработки НЕ запускается\n';
            diagnosticMessage += '📋 Для запуска обработки нужно убрать тестовый режим в коде.';

            this.addMessage(diagnosticMessage, 'ai', {
                provider: 'duplicate-processing-diagnostic',
                command: '/processduplicates'
            });

            // ВРЕМЕННО ОСТАНАВЛИВАЕМ ПРОЦЕСС ДЛЯ ДИАГНОСТИКИ
            console.log('🔍 [ДИАГНОСТИКА] Статистика фильтрации дублей:', {
                filters,
                preStats,
                addressGroups: addressGroups.size,
                listingsForProcessing: listingsForProcessing.length,
                groupSizes,
                singleListingGroups,
                multipleListingGroups,
                maxGroupSize
            });

            // Находим адрес с максимальным количеством объявлений для тестирования
            let bestAddressForTesting = null;
            let currentMaxSize = 0;
            
            for (const [addressId, listings] of addressGroups.entries()) {
                if (listings.length > currentMaxSize) {
                    currentMaxSize = listings.length;
                    bestAddressForTesting = addressId;
                }
            }
            
            console.log(`🎯 [ТЕСТИРОВАНИЕ] Выбран адрес для тестирования с ${currentMaxSize} объявлениями:`, bestAddressForTesting);
            
            // Получаем информацию об адресе
            const address = await db.get('addresses', bestAddressForTesting);
            const testListings = addressGroups.get(bestAddressForTesting);
            
            this.addMessage(`🎯 **Тестирование на одном адресе:**\n\n` +
                          `📍 **Адрес:** ${address?.full_address || 'Неизвестен'}\n` +
                          `📊 **Объявлений:** ${testListings.length}\n\n` +
                          `🚀 Запускаем AI-анализ для этого адреса...`, 'ai', {
                provider: 'test-single-address',
                command: '/processduplicates'
            });
            
            // Создаем тестовую группу только с одним адресом
            const testAddressGroups = new Map();
            testAddressGroups.set(bestAddressForTesting, testListings);

            let lastProgressMessage = null;

            // Запускаем AI-обработку дублей для тестового адреса
            const result = await this.aiDuplicateService.processSingleAddressTest(
                bestAddressForTesting,
                // Callback для отображения прогресса
                (progress) => {
                    let progressText = '';
                    
                    switch(progress.stage) {
                        case 'grouping':
                            progressText = `🔍 **Анализ объявлений:** ${progress.message}`;
                            break;
                        case 'analyzing':  
                            progressText = `📝 **Группировка:** ${progress.message}`;
                            break;
                        case 'processing':
                            progressText = `🤖 **AI-анализ дубликатов:** ${progress.message}`;
                            break;
                        case 'completed':
                            progressText = `✅ **${progress.message}**`;
                            break;
                        default:
                            progressText = progress.message;
                    }
                    
                    // Добавляем прогресс-бар
                    if (progress.progress !== undefined) {
                        const progressBar = '█'.repeat(Math.floor(progress.progress / 5)) + 
                                          '░'.repeat(20 - Math.floor(progress.progress / 5));
                        progressText += `\n\n[${progressBar}] ${progress.progress}%`;
                    }

                    if (lastProgressMessage) {
                        this.updateMessage(lastProgressMessage, progressText);
                    } else {
                        lastProgressMessage = this.addMessage(progressText, 'ai', {
                            provider: 'system',
                            command: '/processduplicates',
                            progress: true
                        });
                    }
                },
                filters
            );

            // Получаем финальную статистику
            const postStats = await this.aiDuplicateService.getDuplicateProcessingStats(filters);

            // Показываем результат
            const resultText = '✅ **AI-обработка дублей завершена!**\n\n' +
                `📊 **Результаты обработки:**\n` +
                `• Проанализировано объявлений: ${result.analyzed}\n` +
                `• Обработано объявлений: ${result.processed}\n` +
                `• Создано объектов недвижимости: ${result.merged}\n` +
                `• Ошибок: ${result.errors}\n\n` +
                `📈 **Финальная статистика:**\n` +
                `• Эффективность обработки: ${postStats.efficiency}%\n` +
                `• Объектов недвижимости: ${postStats.hasObjects}\n` +
                `• Осталось необработанных: ${postStats.needProcessing}\n\n` +
                `⏱️ **AI-анализ** обеспечил точное определение дублей\n` +
                `💡 **Результат:** ${result.merged} объектов недвижимости создано из ${result.processed} объявлений`;

            this.addMessage(resultText, 'ai', {
                provider: 'duplicate-processing-result', 
                command: '/processduplicates',
                stats: result
            });

        } catch (error) {
            console.error('❌ Ошибка команды /processduplicates:', error);
            this.addMessage(`❌ **Ошибка AI-обработки дублей:** ${error.message}\n\n` +
                'Проверьте консоль для получения подробной информации.', 'error');
        }
    }

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

    /**
     * Привязка обработчиков событий фильтров
     */
    bindFilterEvents() {
        // Переключение панели фильтров
        this.filterToggle.addEventListener('click', () => {
            this.toggleFilterPanel();
        });

        // Сброс фильтров
        this.clearFiltersBtn.addEventListener('click', () => {
            this.clearFilters();
        });

        // Применение фильтров
        this.applyFiltersBtn.addEventListener('click', () => {
            this.applyFilters();
        });

        // Инициализация фильтров при первом открытии
        this.initializeFilters();
    }

    /**
     * Переключение панели фильтров
     */
    toggleFilterPanel() {
        const isHidden = this.filterPanel.classList.contains('hidden');
        if (isHidden) {
            this.filterPanel.classList.remove('hidden');
        } else {
            this.filterPanel.classList.add('hidden');
        }
    }

    /**
     * Инициализация фильтров
     */
    async initializeFilters() {
        this.currentFilters = {
            segments: [],
            subsegments: []
        };
        
        // Небольшая задержка для инициализации основных компонентов
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Загружаем данные сегментов и подсегментов
        await this.loadSegmentsData();
    }

    /**
     * Ожидание инициализации DataState
     */
    async waitForDataState(maxAttempts = 50, delay = 200) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            
            // Проверяем глобальный window.dataState
            if (window.dataState && (window.dataState.getState('currentArea') || window.dataState.currentArea)) {
                return true;
            }
            
            // Проверяем DataState через DIContainer
            try {
                if (window.diContainer && typeof window.diContainer.get === 'function') {
                    const dataState = window.diContainer.get('DataState');
                    if (dataState && (dataState.getState('currentArea') || dataState.currentArea)) {
                        // Устанавливаем глобальную ссылку для удобства
                        window.dataState = dataState;
                        return true;
                    } else if (dataState) {
                    }
                }
            } catch (error) {
                // DIContainer ещё не готов
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        console.warn('⚠️ [AIChatModal] Превышено время ожидания DataState с данными');
        return false;
    }

    /**
     * Загрузка данных сегментов и подсегментов
     */
    async loadSegmentsData() {
        try {
            // Проверяем доступность DB
            if (!window.db) {
                console.error('❌ [AIChatModal] База данных недоступна');
                return;
            }

            // Получаем текущую область через DataState
            let currentArea = null;
            
            // Пробуем получить через глобальный DataState
            if (window.dataState) {
                currentArea = window.dataState.getState('currentArea') || window.dataState.currentArea;
            }
            
            // Если не нашли, пробуем через DIContainer
            if (!currentArea && window.DIContainer) {
                try {
                    // Пробуем разные способы доступа к DIContainer
                    let dataState = null;
                    
                    if (typeof window.DIContainer.get === 'function') {
                        dataState = window.DIContainer.get('DataState');
                    } else if (window.DIContainer.instance && typeof window.DIContainer.instance.get === 'function') {
                        dataState = window.DIContainer.instance.get('DataState');
                    } else if (window.diContainer && typeof window.diContainer.get === 'function') {
                        dataState = window.diContainer.get('DataState');
                    }
                    
                    if (dataState && dataState.getState) {
                        
                        currentArea = dataState.getState('currentArea') || dataState.currentArea;
                        
                        // Устанавливаем глобальную ссылку для последующих обращений
                        if (!window.dataState) {
                            window.dataState = dataState;
                        }
                    }
                } catch (error) {
                    // DIContainer ещё не готов
                }
            }
            
            // Если currentArea всё ещё null, попробуем получить ID области из URL и загрузить область
            if (!currentArea) {
                const urlParams = new URLSearchParams(window.location.search);
                const areaIdFromUrl = urlParams.get('id');
                
                if (areaIdFromUrl) {
                    try {
                        currentArea = await window.db.getMapArea(areaIdFromUrl);
                    } catch (error) {
                        console.error('❌ [AIChatModal] Ошибка загрузки области из БД:', error);
                    }
                }
            }
            
            if (!currentArea) {
                console.warn('⚠️ [AIChatModal] Текущая область не найдена. Фильтры будут недоступны.');
                return;
            }

            // Загружаем сегменты для текущей области
            const areaSegments = await window.db.getSegmentsByMapArea(currentArea.id);

            // Загружаем подсегменты для всех сегментов области
            const allSubsegments = [];
            for (const segment of areaSegments) {
                const subsegments = await window.db.getSubsegmentsBySegment(segment.id);
                allSubsegments.push(...subsegments);
            }

            // Инициализируем SlimSelect для сегментов
            this.initializeSegmentsSelect(areaSegments);

            // Сохраняем данные для дальнейшего использования
            this.segmentsData = areaSegments;
            this.subsegmentsData = allSubsegments;

        } catch (error) {
            console.error('❌ [AIChatModal] Ошибка загрузки данных сегментов:', error);
        }
    }

    /**
     * Инициализация SlimSelect для сегментов
     */
    initializeSegmentsSelect(segments) {
        // Проверяем наличие элемента
        if (!this.segmentsFilter) {
            console.error('❌ [AIChatModal] Элемент segmentsFilter не найден!');
            return;
        }
        
        // Очищаем текущие опции
        this.segmentsFilter.innerHTML = '';

        if (segments.length === 0) {
            this.segmentsFilter.innerHTML = '<option value="">Нет сегментов в области</option>';
            return;
        }
        
        // Добавляем опции сегментов
        segments.forEach((segment) => {
            const option = document.createElement('option');
            option.value = segment.id;
            option.textContent = segment.name;
            this.segmentsFilter.appendChild(option);
        });

        // Инициализируем SlimSelect для сегментов
        if (this.segmentsSlimSelect) {
            this.segmentsSlimSelect.destroy();
        }
        this.segmentsSlimSelect = new SlimSelect({
            select: this.segmentsFilter,
            settings: {
                placeholderText: 'Выберите сегменты',
                searchText: 'Поиск...',
                searchPlaceholder: 'Поиск сегментов',
                hideSelectedOption: true
            },
            events: {
                afterChange: (newVal) => {
                    this.onSegmentsChange(newVal);
                }
            }
        });
    }

    /**
     * Обработчик изменения выбранных сегментов
     */
    onSegmentsChange(newVal) {
        // SlimSelect может передавать разные форматы данных
        let selectedSegmentIds = [];
        
        if (Array.isArray(newVal)) {
            // Если это массив, извлекаем значения
            selectedSegmentIds = newVal.map(item => {
                if (typeof item === 'string') {
                    return item;
                } else if (item && item.value) {
                    return item.value;
                } else if (item && item.text) {
                    return item.value || item.text;
                }
                return String(item);
            }).filter(Boolean);
        } else if (newVal && typeof newVal === 'object' && newVal.value) {
            // Если это один объект
            selectedSegmentIds = [newVal.value];
        } else if (typeof newVal === 'string') {
            // Если это строка
            selectedSegmentIds = [newVal];
        }
        
        // Обновляем список подсегментов в зависимости от выбранных сегментов
        this.updateSubsegmentsFilter(selectedSegmentIds);
        this.updateFilterSummary();
    }

    /**
     * Обновление фильтра подсегментов
     */
    updateSubsegmentsFilter(selectedSegmentIds) {
        // Очищаем текущие опции подсегментов
        this.subsegmentsFilter.innerHTML = '';

        if (selectedSegmentIds.length === 0) {
            this.subsegmentsFilter.innerHTML = '<option value="">Выберите сначала сегменты</option>';
            if (this.subsegmentsSlimSelect) {
                this.subsegmentsSlimSelect.destroy();
                this.subsegmentsSlimSelect = null;
            }
            return;
        }

        // Получаем подсегменты для выбранных сегментов
        const filteredSubsegments = this.subsegmentsData.filter(subsegment => 
            selectedSegmentIds.includes(subsegment.segment_id)
        );

        if (filteredSubsegments.length === 0) {
            this.subsegmentsFilter.innerHTML = '<option value="">Нет подсегментов для выбранных сегментов</option>';
            if (this.subsegmentsSlimSelect) {
                this.subsegmentsSlimSelect.destroy();
                this.subsegmentsSlimSelect = null;
            }
            return;
        }

        // Группируем подсегменты по сегментам для optgroup
        const groupedSubsegments = this.groupSubsegmentsBySegments(filteredSubsegments, selectedSegmentIds);

        // Создаем HTML с optgroup
        this.subsegmentsFilter.innerHTML = this.buildSubsegmentsHTML(groupedSubsegments);

        // Инициализируем SlimSelect для подсегментов
        if (this.subsegmentsSlimSelect) {
            this.subsegmentsSlimSelect.destroy();
        }

        this.subsegmentsSlimSelect = new SlimSelect({
            select: this.subsegmentsFilter,
            settings: {
                placeholderText: 'Выберите подсегменты',
                searchText: 'Поиск...',
                searchPlaceholder: 'Поиск подсегментов',
                hideSelectedOption: true
            },
            events: {
                afterChange: () => {
                    this.updateFilterSummary();
                }
            }
        });
    }

    /**
     * Группировка подсегментов по сегментам
     */
    groupSubsegmentsBySegments(subsegments, selectedSegmentIds) {
        const groups = {};
        
        selectedSegmentIds.forEach(segmentId => {
            const segment = this.segmentsData.find(s => s.id === segmentId);
            const segmentSubsegments = subsegments.filter(sub => sub.segment_id === segmentId);
            
            if (segmentSubsegments.length > 0) {
                groups[segmentId] = {
                    name: segment ? segment.name : 'Неизвестный сегмент',
                    subsegments: segmentSubsegments
                };
            }
        });

        return groups;
    }

    /**
     * Построение HTML для подсегментов с группировкой
     */
    buildSubsegmentsHTML(groupedSubsegments) {
        let html = '';
        
        Object.entries(groupedSubsegments).forEach(([segmentId, group]) => {
            html += `<optgroup label="${group.name}">`;
            group.subsegments.forEach(subsegment => {
                html += `<option value="${subsegment.id}">${subsegment.name}</option>`;
            });
            html += '</optgroup>';
        });

        return html;
    }

    /**
     * Обновление сводки фильтров
     */
    updateFilterSummary() {
        const selectedSegments = this.segmentsSlimSelect ? this.segmentsSlimSelect.getSelected() : [];
        const selectedSubsegments = this.subsegmentsSlimSelect ? this.subsegmentsSlimSelect.getSelected() : [];

        let summary = 'Все данные';
        
        if (selectedSegments.length > 0 || selectedSubsegments.length > 0) {
            const parts = [];
            if (selectedSegments.length > 0) {
                parts.push(`Сегменты: ${selectedSegments.length}`);
            }
            if (selectedSubsegments.length > 0) {
                parts.push(`Подсегменты: ${selectedSubsegments.length}`);
            }
            summary = parts.join(', ');
        }

        this.filterSummary.textContent = summary;
    }

    /**
     * Сброс всех фильтров
     */
    clearFilters() {
        if (this.segmentsSlimSelect) {
            this.segmentsSlimSelect.setSelected([]);
        }
        if (this.subsegmentsSlimSelect) {
            this.subsegmentsSlimSelect.setSelected([]);
        }
        
        this.currentFilters = {
            segments: [],
            subsegments: []
        };
        
        this.updateFilterSummary();
    }

    /**
     * Применение фильтров
     */
    applyFilters() {
        const selectedSegments = this.segmentsSlimSelect ? this.segmentsSlimSelect.getSelected() : [];
        const selectedSubsegments = this.subsegmentsSlimSelect ? this.subsegmentsSlimSelect.getSelected() : [];

        this.currentFilters = {
            segments: selectedSegments,
            subsegments: selectedSubsegments
        };

        // Скрываем панель фильтров после применения
        this.filterPanel.classList.add('hidden');

        // Показываем уведомление о применении фильтров
        const filterCount = selectedSegments.length + selectedSubsegments.length;
        if (filterCount > 0) {
            this.addMessage(`🔍 Применены фильтры: ${selectedSegments.length} сегментов, ${selectedSubsegments.length} подсегментов`, 'system');
        } else {
            this.addMessage('🔍 Фильтры сброшены, показываются все данные', 'system');
        }
    }

    /**
     * Получение текущих фильтров для использования в AI-командах
     */
    getCurrentFilters() {
        return this.currentFilters || { segments: [], subsegments: [] };
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIChatModal;
} else {
    window.AIChatModal = AIChatModal;
}