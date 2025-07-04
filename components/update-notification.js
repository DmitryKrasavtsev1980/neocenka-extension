/**
 * Компонент уведомлений об обновлениях
 * Интегрируется в UI расширения
 */
class UpdateNotificationComponent {
    constructor() {
        this.updateManager = window.updateManager;
        this.isInitialized = false;
    }

    /**
     * Инициализация компонента на странице
     */
    async init() {
        if (this.isInitialized) return;
        
        // Инициализируем менеджер обновлений
        if (this.updateManager) {
            await this.updateManager.init();
            this.addUpdateCheckButton();
            this.addVersionDisplay();
        }
        
        this.isInitialized = true;
    }

    /**
     * Добавляет кнопку проверки обновлений в навигацию
     */
    addUpdateCheckButton() {
        // Ищем навигационное меню
        const nav = document.querySelector('.navigation-container, nav, .header-nav');
        if (!nav) return;

        // Создаем кнопку проверки обновлений
        const updateButton = document.createElement('button');
        updateButton.id = 'check-updates-btn';
        updateButton.className = 'flex items-center space-x-2 px-3 py-1 text-sm text-gray-600 hover:text-blue-600 transition-colors';
        updateButton.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span>Обновления</span>
        `;

        // Добавляем в навигацию
        nav.appendChild(updateButton);

        // Обработчик клика
        updateButton.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.checkForUpdatesManually();
        });
    }

    /**
     * Добавляет отображение текущей версии
     */
    addVersionDisplay() {
        // Ищем футер или подходящее место
        const footer = document.querySelector('footer, .footer, .version-info');
        if (!footer) return;

        const version = chrome.runtime.getManifest().version;
        const versionDisplay = document.createElement('div');
        versionDisplay.className = 'text-xs text-gray-500 flex items-center space-x-2';
        versionDisplay.innerHTML = `
            <span>Версия ${version}</span>
            <button id="version-info-btn" class="hover:text-blue-600 transition-colors">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                </svg>
            </button>
        `;

        footer.appendChild(versionDisplay);

        // Обработчик для показа информации о версии
        document.getElementById('version-info-btn').addEventListener('click', () => {
            this.showVersionInfo();
        });
    }

    /**
     * Ручная проверка обновлений
     */
    async checkForUpdatesManually() {
        const button = document.getElementById('check-updates-btn');
        const originalText = button.innerHTML;
        
        // Показываем состояние загрузки
        button.innerHTML = `
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Проверяем...</span>
        `;
        button.disabled = true;

        try {
            const updateInfo = await this.updateManager.forceCheckForUpdates();
            
            if (updateInfo) {
                // Найдено обновление
                this.showUpdateFound(updateInfo);
            } else {
                // Обновлений нет
                this.showNoUpdatesMessage();
            }
        } catch (error) {
            this.showUpdateError(error.message);
        } finally {
            // Восстанавливаем кнопку
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 1000);
        }
    }

    /**
     * Показывает сообщение об отсутствии обновлений
     */
    showNoUpdatesMessage() {
        this.showTemporaryNotification(
            '✅ У вас установлена последняя версия',
            'success'
        );
    }

    /**
     * Показывает сообщение о найденном обновлении
     */
    showUpdateFound(updateInfo) {
        this.showTemporaryNotification(
            `🎉 Доступно обновление до версии ${updateInfo.version}`,
            'info'
        );
        
        // Показываем баннер через секунду
        setTimeout(() => {
            this.updateManager.showUpdateBanner(updateInfo);
        }, 1500);
    }

    /**
     * Показывает ошибку проверки обновлений
     */
    showUpdateError(error) {
        this.showTemporaryNotification(
            `❌ Ошибка проверки обновлений: ${error}`,
            'error'
        );
    }

    /**
     * Показывает информацию о текущей версии
     */
    showVersionInfo() {
        const version = chrome.runtime.getManifest().version;
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md mx-4">
                <div class="p-6">
                    <div class="text-center mb-4">
                        <img src="../icons/icon64.png" alt="Neocenka" class="w-16 h-16 mx-auto mb-4">
                        <h3 class="text-xl font-semibold text-gray-900">Neocenka</h3>
                        <p class="text-gray-600">Анализ рынка недвижимости</p>
                    </div>
                    
                    <div class="space-y-3">
                        <div class="flex justify-between items-center py-2 border-b border-gray-100">
                            <span class="text-gray-600">Версия:</span>
                            <span class="font-medium">${version}</span>
                        </div>
                        <div class="flex justify-between items-center py-2 border-b border-gray-100">
                            <span class="text-gray-600">Тип версии:</span>
                            <span class="font-medium">${version.startsWith('0.') ? 'Тестовая' : 'Стабильная'}</span>
                        </div>
                        <div class="flex justify-between items-center py-2 border-b border-gray-100">
                            <span class="text-gray-600">Обновления:</span>
                            <span class="text-green-600 font-medium">Автоматические</span>
                        </div>
                    </div>
                    
                    <div class="mt-6 flex space-x-3">
                        <button id="check-updates-from-info" class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                            Проверить обновления
                        </button>
                        <button id="close-version-info" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                            Закрыть
                        </button>
                    </div>
                    
                    <div class="mt-4 text-center">
                        <a href="https://github.com/DmitryKrasavtsev1980/neocenka-extension" 
                           target="_blank" 
                           class="text-blue-600 hover:text-blue-800 text-sm">
                            Открыть на GitHub
                        </a>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('check-updates-from-info').addEventListener('click', async () => {
            modal.remove();
            await this.checkForUpdatesManually();
        });

        document.getElementById('close-version-info').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /**
     * Показывает временное уведомление
     */
    showTemporaryNotification(message, type = 'info') {
        // Удаляем существующее уведомление
        const existing = document.getElementById('temp-notification');
        if (existing) existing.remove();

        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500',
            warning: 'bg-yellow-500'
        };

        const notification = document.createElement('div');
        notification.id = 'temp-notification';
        notification.className = `fixed top-4 right-4 z-50 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Анимация появления
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);

        // Автоматическое скрытие
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    /**
     * Добавляет индикатор доступного обновления в навигацию
     */
    addUpdateIndicator() {
        const button = document.getElementById('check-updates-btn');
        if (!button) return;

        // Добавляем красную точку
        const indicator = document.createElement('div');
        indicator.className = 'absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse';
        button.style.position = 'relative';
        button.appendChild(indicator);
    }

    /**
     * Удаляет индикатор обновления
     */
    removeUpdateIndicator() {
        const button = document.getElementById('check-updates-btn');
        if (!button) return;

        const indicator = button.querySelector('.bg-red-500');
        if (indicator) indicator.remove();
    }
}

// Глобальный экземпляр
window.updateNotificationComponent = new UpdateNotificationComponent();

// Автоматическая инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    window.updateNotificationComponent.init();
});

// Инициализация для страниц, загружаемых динамически
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.updateNotificationComponent.init();
    });
} else {
    window.updateNotificationComponent.init();
}