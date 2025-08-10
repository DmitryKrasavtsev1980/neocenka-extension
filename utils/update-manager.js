/**
 * Менеджер обновлений расширения
 * Проверяет наличие новых версий и управляет уведомлениями
 */
class UpdateManager {
    constructor() {
        this.currentVersion = chrome.runtime.getManifest().version;
        this.updateCheckUrl = 'https://api.github.com/repos/DmitryKrasavtsev1980/neocenka-extension/releases';
        this.storageKey = 'neocenka_update_info';
        this.lastCheckKey = 'neocenka_last_update_check';
        this.checkInterval = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
    }

    /**
     * Инициализация менеджера обновлений
     */
    async init() {
        // Проверяем при запуске, если прошло достаточно времени
        const shouldCheck = await this.shouldCheckForUpdates();
        if (shouldCheck) {
            await this.checkForUpdates();
        }

        // Показываем уведомление если есть
        await this.showUpdateNotificationIfNeeded();
    }

    /**
     * Проверяет, нужно ли проверять обновления
     */
    async shouldCheckForUpdates() {
        const result = await chrome.storage.local.get([this.lastCheckKey]);
        const lastCheck = result[this.lastCheckKey] || 0;
        return (Date.now() - lastCheck) > this.checkInterval;
    }

    /**
     * Проверяет наличие новых версий на GitHub
     */
    async checkForUpdates() {
        try {
            
            const response = await fetch(this.updateCheckUrl);
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const releases = await response.json();
            
            // Находим последний релиз (включая pre-release)
            if (!releases || releases.length === 0) {
                return null;
            }
            
            const releaseData = releases[0]; // Первый в списке - самый новый
            const latestVersion = releaseData.tag_name.replace('v', '');
            
            // Сохраняем время последней проверки
            await chrome.storage.local.set({
                [this.lastCheckKey]: Date.now()
            });

            // Сравниваем версии
            if (this.isNewerVersion(latestVersion, this.currentVersion)) {
                const updateInfo = {
                    available: true,
                    version: latestVersion,
                    downloadUrl: releaseData.assets.find(asset => 
                        asset.name.includes('.zip'))?.browser_download_url,
                    changelog: releaseData.body,
                    publishedAt: releaseData.published_at,
                    isPrerelease: releaseData.prerelease
                };

                await chrome.storage.local.set({
                    [this.storageKey]: updateInfo
                });

                return updateInfo;
            } else {
                // Очищаем информацию об обновлении если она устарела
                await chrome.storage.local.remove([this.storageKey]);
                return null;
            }

        } catch (error) {
            console.error('❌ Ошибка при проверке обновлений:', error);
            return null;
        }
    }

    /**
     * Сравнивает версии (semver)
     */
    isNewerVersion(latest, current) {
        const parseVersion = (version) => version.split('.').map(Number);
        const latestParts = parseVersion(latest);
        const currentParts = parseVersion(current);

        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
            const latestPart = latestParts[i] || 0;
            const currentPart = currentParts[i] || 0;

            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }
        return false;
    }

    /**
     * Получает информацию о доступном обновлении
     */
    async getUpdateInfo() {
        const result = await chrome.storage.local.get([this.storageKey]);
        return result[this.storageKey] || null;
    }

    /**
     * Показывает уведомление об обновлении если нужно
     */
    async showUpdateNotificationIfNeeded() {
        const updateInfo = await this.getUpdateInfo();
        if (updateInfo && updateInfo.available) {
            this.showUpdateBanner(updateInfo);
        }
    }

    /**
     * Создает и показывает баннер с уведомлением об обновлении
     */
    showUpdateBanner(updateInfo) {
        // Удаляем существующий баннер если есть
        const existingBanner = document.getElementById('neocenka-update-banner');
        if (existingBanner) {
            existingBanner.remove();
        }

        // Создаем новый баннер
        const banner = document.createElement('div');
        banner.id = 'neocenka-update-banner';
        banner.className = 'fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 shadow-lg';
        
        const isPrerelease = updateInfo.isPrerelease;
        const versionType = isPrerelease ? 'тестовая версия' : 'стабильная версия';
        
        banner.innerHTML = `
            <div class="container mx-auto flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                    <div>
                        <div class="font-semibold">
                            Доступно обновление до версии ${updateInfo.version}
                            ${isPrerelease ? '<span class="text-yellow-200 text-sm">(бета)</span>' : ''}
                        </div>
                        <div class="text-sm opacity-90">${versionType} • ${this.formatDate(updateInfo.publishedAt)}</div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button id="update-details-btn" class="px-4 py-1 bg-white bg-opacity-20 rounded-lg text-sm hover:bg-opacity-30 transition-colors">
                        Подробнее
                    </button>
                    <button id="update-install-btn" class="px-4 py-1 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors">
                        Обновить
                    </button>
                    <button id="update-dismiss-btn" class="p-1 hover:bg-white hover:bg-opacity-20 rounded transition-colors">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Добавляем в начало body
        document.body.insertBefore(banner, document.body.firstChild);

        // Обработчики событий
        document.getElementById('update-details-btn').addEventListener('click', () => {
            this.showUpdateModal(updateInfo);
        });

        document.getElementById('update-install-btn').addEventListener('click', () => {
            this.initiateUpdate(updateInfo);
        });

        document.getElementById('update-dismiss-btn').addEventListener('click', () => {
            this.dismissUpdate();
        });

        // Автоматически скрыть через 10 секунд если не взаимодействовали
        setTimeout(() => {
            if (document.getElementById('neocenka-update-banner')) {
                banner.style.transform = 'translateY(-100%)';
                setTimeout(() => banner.remove(), 300);
            }
        }, 10000);
    }

    /**
     * Показывает модальное окно с деталями обновления
     */
    showUpdateModal(updateInfo) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-2xl mx-4 max-h-screen overflow-y-auto">
                <div class="p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xl font-semibold text-gray-900">
                            Обновление Neocenka v${updateInfo.version}
                        </h3>
                        <button id="modal-close" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="mb-6">
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                            <div class="flex items-center">
                                <div class="text-blue-600 mr-3">
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                                    </svg>
                                </div>
                                <div>
                                    <div class="text-sm font-medium text-blue-800">
                                        Текущая версия: ${this.currentVersion} → Новая версия: ${updateInfo.version}
                                    </div>
                                    <div class="text-sm text-blue-600">
                                        Опубликовано: ${this.formatDate(updateInfo.publishedAt)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mb-4">
                            <h4 class="font-medium text-gray-900 mb-2">Что нового:</h4>
                            <div class="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                ${updateInfo.changelog || 'Информация об изменениях отсутствует'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex space-x-3">
                        <button id="modal-update" class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                            Обновить сейчас
                        </button>
                        <button id="modal-later" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                            Позже
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчики событий
        document.getElementById('modal-close').addEventListener('click', () => modal.remove());
        document.getElementById('modal-later').addEventListener('click', () => modal.remove());
        document.getElementById('modal-update').addEventListener('click', () => {
            modal.remove();
            this.initiateUpdate(updateInfo);
        });

        // Закрытие по клику вне модального окна
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /**
     * Запускает процесс обновления
     */
    async initiateUpdate(updateInfo) {
        // Показываем индикатор загрузки
        this.showUpdateProgress();

        try {
            // Открываем страницу установки
            const installUrl = 'https://dmitrykrasavtsev1980.github.io/neocenka-extension/install_neocenka.html';
            window.open(installUrl, '_blank');

            // Показываем инструкции
            this.showUpdateInstructions(updateInfo);

        } catch (error) {
            console.error('Ошибка при обновлении:', error);
            this.showUpdateError(error.message);
        }
    }

    /**
     * Показывает прогресс обновления
     */
    showUpdateProgress() {
        // Удаляем баннер
        const banner = document.getElementById('neocenka-update-banner');
        if (banner) banner.remove();

        // Показываем уведомление
        this.showNotification('🔄 Инициализация обновления...', 'info');
    }

    /**
     * Показывает инструкции по обновлению
     */
    showUpdateInstructions(updateInfo) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-lg mx-4">
                <div class="p-6">
                    <div class="text-center mb-4">
                        <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">Обновление запущено</h3>
                        <p class="text-gray-600">Открыта страница установки новой версии</p>
                    </div>

                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <h4 class="font-medium text-yellow-800 mb-2">Следующие шаги:</h4>
                        <ol class="text-sm text-yellow-700 space-y-1">
                            <li>1. Скачайте новую версию на открывшейся странице</li>
                            <li>2. Разархивируйте файл</li>
                            <li>3. Обновите расширение через chrome://extensions/</li>
                        </ol>
                    </div>

                    <div class="flex space-x-3">
                        <button id="open-extensions" class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                            Открыть chrome://extensions/
                        </button>
                        <button id="close-instructions" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('open-extensions').addEventListener('click', () => {
            window.open('chrome://extensions/', '_blank');
            modal.remove();
        });

        document.getElementById('close-instructions').addEventListener('click', () => {
            modal.remove();
        });
    }

    /**
     * Отклоняет обновление (скрывает уведомления на день)
     */
    async dismissUpdate() {
        const banner = document.getElementById('neocenka-update-banner');
        if (banner) {
            banner.style.transform = 'translateY(-100%)';
            setTimeout(() => banner.remove(), 300);
        }

        // Запоминаем время отклонения (не показывать сутки)
        await chrome.storage.local.set({
            [this.lastCheckKey]: Date.now()
        });
    }

    /**
     * Форматирует дату
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    /**
     * Показывает уведомление
     */
    showNotification(message, type = 'info') {
        // Можно интегрировать с существующей системой уведомлений
    }

    /**
     * Показывает ошибку обновления
     */
    showUpdateError(error) {
        this.showNotification(`Ошибка обновления: ${error}`, 'error');
    }

    /**
     * Принудительная проверка обновлений
     */
    async forceCheckForUpdates() {
        // Сбрасываем время последней проверки
        await chrome.storage.local.remove([this.lastCheckKey]);
        return await this.checkForUpdates();
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UpdateManager;
}

// Глобальный экземпляр для использования в расширении
window.updateManager = new UpdateManager();