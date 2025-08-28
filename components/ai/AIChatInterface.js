/**
 * AIChatInterface - объединяющий интерфейс для AI-чата
 * Управляет взаимодействием между AIChatButton и AIChatModal
 * Интегрируется с архитектурой v0.1 и обеспечивает единую точку входа
 */

class AIChatInterface {
    constructor(container, diContainer) {
        this.container = container;
        this.diContainer = diContainer;
        
        // Зависимости из DI контейнера
        this.eventBus = this.diContainer.get('EventBus');
        this.configService = this.diContainer.get('ConfigService');
        this.universalAI = this.diContainer.get('UniversalAIService');
        
        // Компоненты интерфейса
        this.chatButton = null;
        this.chatModal = null;
        
        // Состояние интерфейса
        this.isInitialized = false;
        this.isEnabled = true;
        
        this.init();
    }

    /**
     * Инициализация интерфейса
     */
    async init() {
        try {
            // Ждем готовности зависимостей
            await this.waitForDependencies();
            
            // Загружаем настройки AI-чата
            await this.loadSettings();
            
            if (!this.isEnabled) {
                console.log('🔇 AI-чат отключен в настройках');
                return;
            }

            // Создаем компоненты
            await this.createComponents();
            
            // Настраиваем взаимодействие
            this.setupInteractions();
            
            this.isInitialized = true;
            
            // Уведомляем о готовности
            this.eventBus.emit('ai-chat-interface-ready');
            
            console.log('✅ AI-чат интерфейс инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации AI-чата:', error);
            this.eventBus.emit('ai-chat-interface-error', error);
        }
    }

    /**
     * Загрузка настроек из ConfigService
     */
    async loadSettings() {
        try {
            // Получаем настройки с правильным fallback
            const config = await this.configService.get('aiChat') || {};
            const defaultConfig = {
                enabled: true,
                autoOpen: false,
                preferredProvider: 'auto',
                maxHistoryMessages: 50
            };
            
            const mergedConfig = { ...defaultConfig, ...config };
            
            this.isEnabled = mergedConfig.enabled;
            this.autoOpen = mergedConfig.autoOpen;
            this.preferredProvider = mergedConfig.preferredProvider;
            this.maxHistoryMessages = mergedConfig.maxHistoryMessages;
            
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить настройки AI-чата, используем значения по умолчанию:', error);
            
            // Значения по умолчанию
            this.isEnabled = true;
            this.autoOpen = false;
            this.preferredProvider = 'auto';
            this.maxHistoryMessages = 50;
        }
    }

    /**
     * Ожидание готовности зависимостей
     */
    async waitForDependencies() {
        // Ждем готовности базы данных
        let attempts = 0;
        while (attempts < 50) {
            try {
                if (window.db && typeof window.db.isInitialized === 'function' && window.db.isInitialized()) {
                    break;
                }
                if (window.db && typeof window.db.getAll === 'function') {
                    // Пробуем выполнить простой запрос
                    await window.db.getAll('addresses');
                    break;
                }
            } catch (error) {
                // БД ещё не готова, продолжаем ждать
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (attempts >= 50) {
            console.warn('⚠️ База данных не готова, AI-интерфейс может работать с ограничениями');
        }
    }

    /**
     * Создание компонентов интерфейса
     */
    async createComponents() {
        // Создаем кнопку чата
        this.chatButton = new AIChatButton(this.container, this.diContainer);
        
        // Создаем модальное окно чата
        this.chatModal = new AIChatModal(this.container, this.diContainer);
        
        // Устанавливаем предпочитаемый провайдер
        if (this.preferredProvider !== 'auto') {
            this.universalAI.setPreferredProvider(this.preferredProvider);
        }
    }

    /**
     * Настройка взаимодействий между компонентами
     */
    setupInteractions() {
        // Связываем кнопку и модальное окно
        this.eventBus.on('ai-chat-button-clicked', () => {
            this.openChat();
        });

        // Автоматическое открытие при необходимости
        if (this.autoOpen) {
            setTimeout(() => {
                this.openChat();
            }, 2000);
        }

        // Обработка контекстных данных
        this.eventBus.on('ai-chat-provide-context', (contextData) => {
            this.setContext(contextData);
        });

        // Обработка ошибок AI
        this.eventBus.on('universal-ai-error', (error) => {
            this.handleAIError(error);
        });

        // Обработка изменения провайдера
        this.eventBus.on('ai-provider-changed', (provider) => {
            this.handleProviderChange(provider);
        });
    }

    /**
     * Открытие чата
     */
    openChat() {
        if (!this.isInitialized) {
            console.warn('⚠️ AI-чат еще не инициализирован');
            return;
        }
        
        this.chatModal.open();
    }

    /**
     * Закрытие чата
     */
    closeChat() {
        if (!this.isInitialized) return;
        
        this.chatModal.close();
    }

    /**
     * Установка контекста для AI
     */
    setContext(contextData) {
        if (!this.isInitialized) return;
        
        this.chatModal.setContext(contextData);
        
        // Показываем уведомление о доступном контексте
        this.chatButton.pulse();
        
        console.log('🎯 Установлен контекст для AI:', contextData.type);
    }

    /**
     * Обработка ошибок AI
     */
    handleAIError(error) {
        console.error('❌ Ошибка AI:', error);
        
        // Можем показать уведомление пользователю
        this.eventBus.emit('show-notification', {
            type: 'error',
            title: 'Ошибка AI-ассистента',
            message: 'Произошла ошибка при обращении к AI. Попробуйте позже.',
            duration: 5000
        });
    }

    /**
     * Обработка смены провайдера
     */
    handleProviderChange(provider) {
        console.log('🔄 Провайдер AI изменен на:', provider);
        
        // Сохраняем в настройки
        this.configService.set('aiChat.preferredProvider', provider);
    }

    /**
     * Получение статуса интерфейса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isEnabled: this.isEnabled,
            isChatOpen: this.chatModal?.getState().isOpen || false,
            buttonState: this.chatButton?.getState(),
            modalState: this.chatModal?.getState(),
            currentProvider: this.universalAI?.getCurrentProvider(),
            aiAvailable: this.universalAI?.isAvailable()
        };
    }

    /**
     * Методы для интеграции с приложением
     */

    /**
     * Анализ дубликатов объявлений
     */
    async analyzeDuplicates(listings) {
        if (!this.isInitialized) {
            throw new Error('AI-интерфейс не инициализирован');
        }

        const contextData = {
            type: 'listings',
            action: 'analyze_duplicates',
            data: listings
        };

        this.setContext(contextData);
        this.openChat();
        
        // Предзаполняем сообщение
        setTimeout(() => {
            const input = this.chatModal.messageInput;
            if (input) {
                input.value = `Проанализируй ${listings.length} объявлений на наличие дубликатов и предложи объединение похожих объявлений.`;
                input.dispatchEvent(new Event('input'));
            }
        }, 500);
    }

    /**
     * Автоматическое присвоение адресов
     */
    async assignAddresses(listings, nearbyAddresses) {
        if (!this.isInitialized) {
            throw new Error('AI-интерфейс не инициализирован');
        }

        const contextData = {
            type: 'address_assignment',
            action: 'assign_addresses',
            data: { listings, nearbyAddresses }
        };

        this.setContext(contextData);
        this.openChat();
        
        setTimeout(() => {
            const input = this.chatModal.messageInput;
            if (input) {
                input.value = `Помоги присвоить адреса ${listings.length} объявлениям на основе ${nearbyAddresses.length} ближайших адресов.`;
                input.dispatchEvent(new Event('input'));
            }
        }, 500);
    }

    /**
     * Создание сегментации
     */
    async createSegmentation(area, objects) {
        if (!this.isInitialized) {
            throw new Error('AI-интерфейс не инициализирован');
        }

        const contextData = {
            type: 'segmentation',
            action: 'create_segments',
            data: { area, objects }
        };

        this.setContext(contextData);
        this.openChat();
        
        setTimeout(() => {
            const input = this.chatModal.messageInput;
            if (input) {
                input.value = `Создай автоматическую сегментацию области "${area.name}" с ${objects.length} объектами по характеристикам домов.`;
                input.dispatchEvent(new Event('input'));
            }
        }, 500);
    }

    /**
     * Создание сравнительного анализа
     */
    async createComparison(segments) {
        if (!this.isInitialized) {
            throw new Error('AI-интерфейс не инициализирован');
        }

        const contextData = {
            type: 'comparison',
            action: 'compare_segments',
            data: segments
        };

        this.setContext(contextData);
        this.openChat();
        
        setTimeout(() => {
            const input = this.chatModal.messageInput;
            if (input) {
                input.value = `Создай сравнительный анализ ${segments.length} сегментов с графиками и выводами.`;
                input.dispatchEvent(new Event('input'));
            }
        }, 500);
    }

    /**
     * Включение/отключение интерфейса
     */
    async setEnabled(enabled) {
        this.isEnabled = enabled;
        
        // Сохраняем в настройки
        await this.configService.set('aiChat.enabled', enabled);
        
        if (enabled && !this.isInitialized) {
            await this.init();
        } else if (!enabled && this.isInitialized) {
            this.disable();
        }

        this.eventBus.emit('ai-chat-enabled-changed', enabled);
    }

    /**
     * Отключение интерфейса
     */
    disable() {
        if (this.chatButton) {
            this.chatButton.setVisibility(false);
        }
        
        if (this.chatModal) {
            this.chatModal.close();
        }
    }

    /**
     * Показать/скрыть интерфейс
     */
    setVisibility(visible) {
        if (this.chatButton) {
            this.chatButton.setVisibility(visible);
        }
    }

    /**
     * Получение истории чата
     */
    getChatHistory() {
        return this.chatModal?.getChatHistory() || [];
    }

    /**
     * Очистка чата
     */
    clearChat() {
        if (this.chatModal) {
            this.chatModal.clearChat();
        }
    }

    /**
     * Уничтожение интерфейса
     */
    destroy() {
        // Уничтожаем компоненты
        if (this.chatButton) {
            this.chatButton.destroy();
            this.chatButton = null;
        }
        
        if (this.chatModal) {
            this.chatModal.destroy();
            this.chatModal = null;
        }
        
        // Отписываемся от событий
        this.eventBus.off('ai-chat-button-clicked');
        this.eventBus.off('ai-chat-provide-context');
        this.eventBus.off('universal-ai-error');
        this.eventBus.off('ai-provider-changed');
        
        // Очищаем ссылки
        this.container = null;
        this.diContainer = null;
        
        this.isInitialized = false;
        
        console.log('🗑️ AI-чат интерфейс уничтожен');
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIChatInterface;
} else {
    window.AIChatInterface = AIChatInterface;
}