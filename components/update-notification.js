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
        }
        
        this.isInitialized = true;
    }

    /**
     * Добавляет информацию об обновлениях в навигацию как последний пункт меню
     */
    addUpdateCheckButton() {
        // Проверяем, что кнопка еще не создана
        if (document.getElementById('check-updates-btn')) {
            return;
        }

        // Ищем навигационное меню (div с ссылками)
        const navLinksContainer = document.querySelector('nav .sm\\:flex.sm\\:-my-px, .sm\\:space-x-8');
        if (!navLinksContainer) return;

        // Получаем текущую версию
        const version = chrome.runtime.getManifest().version;

        // Создаем ссылку для обновлений в стиле существующих ссылок
        const updateLink = document.createElement('a');
        updateLink.href = '#';
        updateLink.id = 'check-updates-btn';
        updateLink.className = 'inline-flex items-center border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 px-1 pt-1 text-sm font-medium';
        updateLink.innerHTML = `
            <div class="flex items-center space-x-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                <div class="flex flex-col">
                    <span>Обновления</span>
                    <span class="text-xs text-gray-400">v${version}</span>
                </div>
            </div>
        `;
        
        // Добавляем как последний элемент в навигацию
        navLinksContainer.appendChild(updateLink);

        // Обработчик клика
        updateLink.addEventListener('click', async (e) => {
            e.preventDefault();
            
            if (e.shiftKey) {
                // При Shift+клик - показ информации о версии
                this.showVersionInfo();
            } else if (e.ctrlKey || e.metaKey) {
                // При Ctrl+клик - автоматическое обновление одной кнопкой
                if (window.autoUpdater) {
                    await window.autoUpdater.performFullAutoUpdate();
                }
            } else {
                // При обычном клике - проверка обновлений
                await this.checkForUpdatesManually();
            }
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