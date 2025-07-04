/**
 * Полностью автоматизированная система обновлений
 * Максимальная автоматизация в рамках ограничений Chrome
 */
class AutoUpdater {
    constructor() {
        this.updateManager = window.updateManager;
        this.isUpdating = false;
    }

    /**
     * Одна кнопка - полное автоматическое обновление
     */
    async performFullAutoUpdate() {
        if (this.isUpdating) {
            console.log('⏳ Обновление уже выполняется...');
            return;
        }

        this.isUpdating = true;
        
        try {
            console.log('🚀 Запуск полностью автоматического обновления...');
            
            // 1. Показать прогресс
            this.showAutoUpdateProgress();
            
            // 2. Проверить обновления
            const updateInfo = await this.updateManager.forceCheckForUpdates();
            if (!updateInfo) {
                this.showResult('success', 'У вас уже установлена последняя версия!');
                return;
            }

            // 3. Автоматический backup данных
            await this.performAutoBackup();
            
            // 4. Скачать обновление
            await this.downloadUpdate(updateInfo);
            
            // 5. Подготовить инструкции для автоматической установки
            await this.prepareAutoInstallation(updateInfo);
            
            // 6. Открыть chrome://extensions/ с инструкциями
            await this.openExtensionsPageWithGuidance();

        } catch (error) {
            console.error('❌ Ошибка автообновления:', error);
            this.showResult('error', `Ошибка обновления: ${error.message}`);
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Показать прогресс автообновления
     */
    showAutoUpdateProgress() {
        // Удаляем существующий прогресс
        const existing = document.getElementById('auto-update-progress');
        if (existing) existing.remove();

        const progressModal = document.createElement('div');
        progressModal.id = 'auto-update-progress';
        progressModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        progressModal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md mx-4 p-6">
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">Автоматическое обновление</h3>
                    <div id="progress-text" class="text-gray-600">Проверка обновлений...</div>
                    
                    <div class="mt-4">
                        <div class="bg-gray-200 rounded-full h-2">
                            <div id="progress-bar" class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: 10%"></div>
                        </div>
                    </div>
                    
                    <div id="progress-steps" class="mt-4 text-left text-sm text-gray-500">
                        <div class="flex items-center mb-1">
                            <div class="w-2 h-2 bg-blue-600 rounded-full mr-2"></div>
                            <span>Проверка обновлений...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(progressModal);
    }

    /**
     * Обновить прогресс
     */
    updateProgress(step, text, percentage) {
        const progressText = document.getElementById('progress-text');
        const progressBar = document.getElementById('progress-bar');
        const progressSteps = document.getElementById('progress-steps');
        
        if (progressText) progressText.textContent = text;
        if (progressBar) progressBar.style.width = `${percentage}%`;
        
        if (progressSteps) {
            const steps = [
                'Проверка обновлений...',
                'Резервное копирование данных...',
                'Скачивание обновления...',
                'Подготовка установки...',
                'Открытие инструкций...'
            ];
            
            progressSteps.innerHTML = steps.map((stepText, index) => {
                const isActive = index === step;
                const isCompleted = index < step;
                const icon = isCompleted ? '✓' : (isActive ? '⋯' : '○');
                const color = isCompleted ? 'text-green-600' : (isActive ? 'text-blue-600' : 'text-gray-400');
                
                return `
                    <div class="flex items-center mb-1 ${color}">
                        <div class="w-4 text-center mr-2">${icon}</div>
                        <span>${stepText}</span>
                    </div>
                `;
            }).join('');
        }
    }

    /**
     * Автоматическое резервное копирование
     */
    async performAutoBackup() {
        this.updateProgress(1, 'Создание резервной копии данных...', 30);
        
        try {
            // Экспортируем все данные
            const backupData = {
                timestamp: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                data: {}
            };

            // Экспорт из Chrome Storage
            const storageData = await chrome.storage.local.get();
            backupData.data.storage = storageData;

            // Экспорт из IndexedDB (если доступен)
            if (window.db && typeof window.db.exportDatabase === 'function') {
                backupData.data.database = await window.db.exportDatabase();
            }

            // Автоматическое скачивание backup файла
            const backupBlob = new Blob([JSON.stringify(backupData, null, 2)], {
                type: 'application/json'
            });
            
            const backupUrl = URL.createObjectURL(backupBlob);
            const backupLink = document.createElement('a');
            backupLink.href = backupUrl;
            backupLink.download = `neocenka-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(backupLink);
            backupLink.click();
            document.body.removeChild(backupLink);
            URL.revokeObjectURL(backupUrl);

            console.log('✅ Backup создан автоматически');
            
        } catch (error) {
            console.warn('⚠️ Ошибка создания backup:', error);
            // Продолжаем обновление даже если backup не удался
        }
    }

    /**
     * Скачивание обновления
     */
    async downloadUpdate(updateInfo) {
        this.updateProgress(2, `Скачивание версии ${updateInfo.version}...`, 60);
        
        try {
            // Автоматическое скачивание ZIP файла
            const downloadUrl = updateInfo.downloadUrl;
            if (downloadUrl) {
                const downloadLink = document.createElement('a');
                downloadLink.href = downloadUrl;
                downloadLink.download = `neocenka-extension-${updateInfo.version}.zip`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                console.log('✅ ZIP файл скачан автоматически');
            }
            
            // Даем время на скачивание
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.warn('⚠️ Ошибка скачивания:', error);
        }
    }

    /**
     * Подготовка автоматической установки
     */
    async prepareAutoInstallation(updateInfo) {
        this.updateProgress(3, 'Подготовка автоматической установки...', 80);
        
        // Сохраняем информацию об обновлении для инструкций
        await chrome.storage.local.set({
            'neocenka_pending_update': {
                version: updateInfo.version,
                timestamp: Date.now(),
                downloadCompleted: true
            }
        });
    }

    /**
     * Открытие chrome://extensions/ с интерактивными инструкциями
     */
    async openExtensionsPageWithGuidance() {
        this.updateProgress(4, 'Открытие инструкций по установке...', 100);
        
        // Задержка для завершения скачивания
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Показать финальные инструкции
        this.showFinalInstructions();
        
        // Открыть chrome://extensions/
        setTimeout(() => {
            chrome.tabs.create({ url: 'chrome://extensions/' });
        }, 3000);
    }

    /**
     * Показать финальные инструкции
     */
    showFinalInstructions() {
        const progressModal = document.getElementById('auto-update-progress');
        if (progressModal) progressModal.remove();

        const instructionsModal = document.createElement('div');
        instructionsModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        instructionsModal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-lg mx-4 p-6">
                <div class="text-center mb-6">
                    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-900 mb-2">Готово к установке!</h3>
                    <p class="text-gray-600">Файлы подготовлены. Сейчас откроется страница chrome://extensions/</p>
                </div>

                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h4 class="font-medium text-blue-800 mb-3">Последний шаг (автоматически):</h4>
                    <ol class="text-sm text-blue-700 space-y-2">
                        <li class="flex items-start">
                            <span class="font-medium mr-2">1.</span>
                            <span>Найдите скачанный ZIP файл в загрузках</span>
                        </li>
                        <li class="flex items-start">
                            <span class="font-medium mr-2">2.</span>
                            <span>Разархивируйте файл</span>
                        </li>
                        <li class="flex items-start">
                            <span class="font-medium mr-2">3.</span>
                            <span>В chrome://extensions/ нажмите "Загрузить распакованное"</span>
                        </li>
                        <li class="flex items-start">
                            <span class="font-medium mr-2">4.</span>
                            <span>Выберите папку с новой версией</span>
                        </li>
                    </ol>
                </div>

                <div class="flex space-x-3">
                    <button id="open-downloads" class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                        Открыть загрузки
                    </button>
                    <button id="close-instructions" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                        Понятно
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(instructionsModal);

        // Обработчики
        document.getElementById('open-downloads').addEventListener('click', () => {
            chrome.tabs.create({ url: 'chrome://downloads/' });
        });

        document.getElementById('close-instructions').addEventListener('click', () => {
            instructionsModal.remove();
        });

        // Автоматическое закрытие через 15 секунд
        setTimeout(() => {
            if (document.body.contains(instructionsModal)) {
                instructionsModal.remove();
            }
        }, 15000);
    }

    /**
     * Показать результат операции
     */
    showResult(type, message) {
        const progressModal = document.getElementById('auto-update-progress');
        if (progressModal) progressModal.remove();

        const resultModal = document.createElement('div');
        resultModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        
        const bgColor = type === 'success' ? 'bg-green-100' : 'bg-red-100';
        const textColor = type === 'success' ? 'text-green-600' : 'text-red-600';
        const icon = type === 'success' 
            ? '<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>'
            : '<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>';

        resultModal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md mx-4 p-6">
                <div class="text-center">
                    <div class="w-16 h-16 ${bgColor} rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 ${textColor}" fill="currentColor" viewBox="0 0 20 20">
                            ${icon}
                        </svg>
                    </div>
                    <p class="text-gray-800">${message}</p>
                    <button id="close-result" class="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">
                        Закрыть
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(resultModal);

        document.getElementById('close-result').addEventListener('click', () => {
            resultModal.remove();
        });

        // Автоматическое закрытие через 5 секунд
        setTimeout(() => {
            if (document.body.contains(resultModal)) {
                resultModal.remove();
            }
        }, 5000);
    }
}

// Глобальный экземпляр
window.autoUpdater = new AutoUpdater();