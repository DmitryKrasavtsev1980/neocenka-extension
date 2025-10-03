/**
 * Компонент выбора и управления embedding-моделями
 * Интерфейс для загрузки, тестирования и настройки моделей
 */
class EmbeddingModelSelector {
    constructor() {
        this.modelManager = null;
        this.modelsRegistry = null;
        this.currentModelId = null;
        this.loadingModels = new Set();
        
        this.init();
    }

    async init() {
        try {
            // Используем глобальные классы (уже загружены через script теги)
            this.modelManager = new window.EmbeddingModelManagerWorker();
            this.modelsRegistry = new window.EmbeddingModelsRegistry();
            
            console.log('✅ [ModelSelector] Инициализирован');
        } catch (error) {
            console.error('❌ [ModelSelector] Ошибка инициализации:', error);
        }
    }

    /**
     * Создание HTML-интерфейса селектора моделей
     * @param {HTMLElement} container - Контейнер для размещения
     */
    render(container) {
        if (!this.modelManager) {
            container.innerHTML = '<div class="text-red-500">Ошибка инициализации селектора моделей</div>';
            return;
        }

        const html = `
            <div class="embedding-model-selector p-6 bg-white rounded-lg shadow-lg">
                <div class="mb-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">
                        🤖 Embedding-модели для анализа дубликатов
                    </h3>
                    <p class="text-sm text-gray-600">
                        Выберите модель для семантического анализа русскоязычных объявлений о недвижимости
                    </p>
                </div>

                <!-- Статус текущей модели -->
                <div class="current-model-status mb-6 p-4 bg-blue-50 rounded-md" id="current-model-status">
                    <div class="flex items-center">
                        <div class="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
                        <span class="text-sm text-blue-700">Проверка статуса моделей...</span>
                    </div>
                </div>

                <!-- Селектор модели -->
                <div class="model-selection mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Выберите embedding-модель:
                    </label>
                    <select id="model-selector" class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Загрузка списка моделей...</option>
                    </select>
                </div>

                <!-- Информация о выбранной модели -->
                <div class="model-info mb-6 hidden" id="model-info">
                    <div class="p-4 bg-gray-50 rounded-md">
                        <h4 class="font-medium text-gray-900 mb-2">Характеристики модели:</h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="font-medium">Поддержка русского:</span>
                                <span id="russian-support-badge" class="ml-1 px-2 py-1 rounded text-xs"></span>
                            </div>
                            <div>
                                <span class="font-medium">Производительность:</span>
                                <span id="performance-badge" class="ml-1 px-2 py-1 rounded text-xs"></span>
                            </div>
                            <div>
                                <span class="font-medium">Точность:</span>
                                <span id="accuracy-badge" class="ml-1 px-2 py-1 rounded text-xs"></span>
                            </div>
                            <div>
                                <span class="font-medium">Размер:</span>
                                <span id="model-size" class="text-gray-600"></span>
                            </div>
                        </div>
                        <p id="model-description" class="text-gray-600 mt-2"></p>
                    </div>
                </div>

                <!-- Прогресс загрузки -->
                <div class="loading-progress mb-6 hidden" id="loading-progress">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-gray-700">Загрузка модели...</span>
                        <span class="text-sm text-gray-500" id="progress-percentage">0%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: 0%" id="progress-bar"></div>
                    </div>
                    <div class="text-xs text-gray-500 mt-1" id="progress-details"></div>
                </div>

                <!-- Кнопки действий -->
                <div class="actions flex space-x-3">
                    <button id="load-model-btn" 
                            class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        📥 Загрузить модель
                    </button>
                    <button id="test-model-btn" 
                            class="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled>
                        🧪 Тестировать
                    </button>
                    <button id="clear-cache-btn"
                            class="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:ring-2 focus:ring-gray-500">
                        🗑️ Очистить кэш
                    </button>
                </div>

                <!-- Результаты тестирования -->
                <div class="test-results mt-6 hidden" id="test-results">
                    <h4 class="font-medium text-gray-900 mb-2">Результаты тестирования:</h4>
                    <div class="p-3 bg-gray-50 rounded-md">
                        <pre id="test-output" class="text-xs text-gray-600 whitespace-pre-wrap"></pre>
                    </div>
                </div>

                <!-- Статистика кэша -->
                <div class="cache-stats mt-6 p-4 bg-gray-50 rounded-md" id="cache-stats">
                    <h4 class="font-medium text-gray-900 mb-2">Статистика кэша:</h4>
                    <div class="text-sm text-gray-600" id="cache-info">
                        Загрузка информации о кэше...
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.setupEventListeners();
        this.loadModelsInfo();
        this.updateCacheStats();
    }

    /**
     * Инициализация SlimSelect
     */
    initializeSlimSelect() {
        const modelSelector = document.getElementById('model-selector');
        if (modelSelector) {
            try {
                this.slimSelectInstance = new SlimSelect({
                    select: modelSelector,
                    settings: {
                        allowDeselect: true,
                        placeholder: 'Выберите модель...',
                        closeOnSelect: true
                    }
                });
            } catch (error) {
                console.warn('Не удалось инициализировать SlimSelect для селектора моделей:', error);
            }
        }
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Инициализация SlimSelect
        this.initializeSlimSelect();

        const modelSelector = document.getElementById('model-selector');
        const loadBtn = document.getElementById('load-model-btn');
        const testBtn = document.getElementById('test-model-btn');
        const clearCacheBtn = document.getElementById('clear-cache-btn');

        modelSelector?.addEventListener('change', (e) => {
            this.onModelSelect(e.target.value);
        });

        loadBtn?.addEventListener('click', () => {
            this.loadSelectedModel();
        });

        testBtn?.addEventListener('click', () => {
            this.testSelectedModel();
        });

        clearCacheBtn?.addEventListener('click', () => {
            this.clearModelCache();
        });
    }

    /**
     * Загрузка информации о доступных моделях
     */
    async loadModelsInfo() {
        try {
            const models = this.modelsRegistry.getModelsByRussianSupport();
            const modelSelector = document.getElementById('model-selector');
            
            if (!modelSelector) return;

            // Очищаем и заполняем селектор
            modelSelector.innerHTML = '<option value="">-- Выберите модель --</option>';
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = `${model.name} (${model.russianSupport}, ${model.performance})`;
                
                // Помечаем рекомендуемую модель
                if (model.id === 'paraphrase-multilingual-MiniLM-L12-v2') {
                    option.textContent += ' — Рекомендуется для русского';
                    option.selected = true;
                    this.onModelSelect(model.id);
                }
                
                modelSelector.appendChild(option);
            });

            // Обновляем статус текущих моделей
            await this.updateModelStatus();

        } catch (error) {
            console.error('❌ [ModelSelector] Ошибка загрузки информации о моделях:', error);
        }
    }

    /**
     * Обработка выбора модели
     */
    onModelSelect(modelId) {
        if (!modelId) {
            document.getElementById('model-info')?.classList.add('hidden');
            return;
        }

        const model = this.modelsRegistry.getModel(modelId);
        if (!model) return;

        this.currentModelId = modelId;

        // Показываем информацию о модели
        const modelInfo = document.getElementById('model-info');
        if (modelInfo) {
            modelInfo.classList.remove('hidden');
            
            // Обновляем характеристики
            this.updateBadge('russian-support-badge', model.russianSupport, this.getRussianSupportColor(model.russianSupport));
            this.updateBadge('performance-badge', model.performance, this.getPerformanceColor(model.performance));
            this.updateBadge('accuracy-badge', model.accuracy, this.getAccuracyColor(model.accuracy));
            
            document.getElementById('model-size').textContent = model.modelSize;
            document.getElementById('model-description').textContent = model.description;
        }

        // Обновляем состояние кнопок
        this.updateButtonStates();
    }

    /**
     * Загрузка выбранной модели
     */
    async loadSelectedModel() {
        if (!this.currentModelId) return;

        const loadBtn = document.getElementById('load-model-btn');
        const progressDiv = document.getElementById('loading-progress');
        const progressBar = document.getElementById('progress-bar');
        const progressPercentage = document.getElementById('progress-percentage');
        const progressDetails = document.getElementById('progress-details');

        try {
            // Показываем прогресс
            progressDiv?.classList.remove('hidden');
            loadBtn.disabled = true;
            loadBtn.textContent = '⏳ Загружается...';
            this.loadingModels.add(this.currentModelId);

            await this.modelManager.loadEmbeddingModel(this.currentModelId, (progress) => {
                if (progressBar && progressPercentage) {
                    progressBar.style.width = `${progress.progress}%`;
                    progressPercentage.textContent = `${progress.progress}%`;
                }
                
                if (progressDetails) {
                    if (progress.stage === 'downloading') {
                        progressDetails.textContent = `Загрузка: ${progress.loaded || 0} / ${progress.total || '?'} байт`;
                    } else if (progress.stage === 'ready') {
                        progressDetails.textContent = 'Модель готова к использованию';
                    }
                }
            });

            // Успешная загрузка
            loadBtn.textContent = '✅ Загружена';
            loadBtn.disabled = true;
            
            document.getElementById('test-model-btn').disabled = false;

            setTimeout(() => {
                progressDiv?.classList.add('hidden');
                this.updateModelStatus();
            }, 2000);

        } catch (error) {
            console.error('❌ [ModelSelector] Ошибка загрузки модели:', error);
            loadBtn.textContent = '❌ Ошибка загрузки';
            progressDetails.textContent = `Ошибка: ${error.message}`;
            
            setTimeout(() => {
                progressDiv?.classList.add('hidden');
                loadBtn.textContent = '📥 Загрузить модель';
                loadBtn.disabled = false;
            }, 3000);
        } finally {
            this.loadingModels.delete(this.currentModelId);
        }
    }

    /**
     * Тестирование выбранной модели
     */
    async testSelectedModel() {
        if (!this.currentModelId) return;

        const testBtn = document.getElementById('test-model-btn');
        const testResults = document.getElementById('test-results');
        const testOutput = document.getElementById('test-output');

        try {
            testBtn.disabled = true;
            testBtn.textContent = '🧪 Тестируем...';
            testResults?.classList.remove('hidden');
            
            if (testOutput) {
                testOutput.textContent = 'Выполняется тестирование модели...';
            }

            const result = await this.modelManager.testModel(this.currentModelId);
            
            if (testOutput) {
                testOutput.textContent = JSON.stringify(result, null, 2);
            }

            testBtn.textContent = result.success ? '✅ Тест пройден' : '❌ Тест не пройден';
            
        } catch (error) {
            console.error('❌ [ModelSelector] Ошибка тестирования:', error);
            if (testOutput) {
                testOutput.textContent = `Ошибка тестирования: ${error.message}`;
            }
            testBtn.textContent = '❌ Ошибка теста';
        } finally {
            setTimeout(() => {
                testBtn.textContent = '🧪 Тестировать';
                testBtn.disabled = false;
            }, 3000);
        }
    }

    /**
     * Очистка кэша моделей
     */
    async clearModelCache() {
        const clearBtn = document.getElementById('clear-cache-btn');
        
        try {
            clearBtn.disabled = true;
            clearBtn.textContent = '🗑️ Очищается...';

            // Очищаем кэш в памяти
            this.modelManager.unloadAllModels();
            
            // Обновляем статистику
            await this.updateCacheStats();
            await this.updateModelStatus();

            clearBtn.textContent = '✅ Очищен';
            
        } catch (error) {
            console.error('❌ [ModelSelector] Ошибка очистки кэша:', error);
            clearBtn.textContent = '❌ Ошибка';
        } finally {
            setTimeout(() => {
                clearBtn.textContent = '🗑️ Очистить кэш';
                clearBtn.disabled = false;
            }, 2000);
        }
    }

    /**
     * Обновление статуса моделей
     */
    async updateModelStatus() {
        try {
            const status = this.modelManager.getModelsStatus();
            const statusDiv = document.getElementById('current-model-status');
            
            if (!statusDiv) return;

            if (status.loaded.length === 0 && status.loading.length === 0) {
                statusDiv.innerHTML = `
                    <div class="flex items-center">
                        <div class="h-3 w-3 bg-gray-400 rounded-full mr-2"></div>
                        <span class="text-sm text-gray-600">Модели не загружены</span>
                    </div>
                `;
            } else if (status.loading.length > 0) {
                statusDiv.innerHTML = `
                    <div class="flex items-center">
                        <div class="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
                        <span class="text-sm text-blue-700">Загружается: ${status.loading.length} модель(ей)</span>
                    </div>
                `;
            } else {
                statusDiv.innerHTML = `
                    <div class="flex items-center">
                        <div class="h-3 w-3 bg-green-500 rounded-full mr-2"></div>
                        <span class="text-sm text-green-700">Загружено: ${status.loaded.length} модель(ей)</span>
                    </div>
                `;
            }
        } catch (error) {
            console.error('❌ [ModelSelector] Ошибка обновления статуса:', error);
        }
    }

    /**
     * Обновление статистики кэша
     */
    async updateCacheStats() {
        try {
            const cacheInfo = this.modelManager.getCacheInfo();
            const cacheInfoDiv = document.getElementById('cache-info');
            
            if (cacheInfoDiv) {
                if (cacheInfo.loadedCount === 0) {
                    cacheInfoDiv.textContent = 'Кэш пуст. Модели не загружены в память.';
                } else {
                    cacheInfoDiv.innerHTML = `
                        <div>Загружено в память: <strong>${cacheInfo.loadedCount} модель(ей)</strong></div>
                        <div>Приблизительный размер: <strong>${cacheInfo.totalApproximateSize}</strong></div>
                        <div class="mt-2">
                            ${cacheInfo.models.map(model => 
                                `• ${model.name} (${model.modelSize})`
                            ).join('<br>')}
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('❌ [ModelSelector] Ошибка обновления статистики кэша:', error);
        }
    }

    /**
     * Обновление состояния кнопок
     */
    updateButtonStates() {
        if (!this.currentModelId) return;

        const status = this.modelManager.getModelsStatus();
        const isLoaded = status.loaded.includes(this.currentModelId);
        const isLoading = this.loadingModels.has(this.currentModelId);

        const loadBtn = document.getElementById('load-model-btn');
        const testBtn = document.getElementById('test-model-btn');

        if (loadBtn) {
            if (isLoaded) {
                loadBtn.textContent = '✅ Загружена';
                loadBtn.disabled = true;
            } else if (isLoading) {
                loadBtn.textContent = '⏳ Загружается...';
                loadBtn.disabled = true;
            } else {
                loadBtn.textContent = '📥 Загрузить модель';
                loadBtn.disabled = false;
            }
        }

        if (testBtn) {
            testBtn.disabled = !isLoaded;
        }
    }

    // Вспомогательные методы для цветовых схем

    updateBadge(id, text, colorClass) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
            element.className = `ml-1 px-2 py-1 rounded text-xs ${colorClass}`;
        }
    }

    getRussianSupportColor(level) {
        switch (level) {
            case 'native': return 'bg-green-100 text-green-800';
            case 'excellent': return 'bg-blue-100 text-blue-800';
            case 'good': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    getPerformanceColor(level) {
        switch (level) {
            case 'fast': return 'bg-green-100 text-green-800';
            case 'medium': return 'bg-yellow-100 text-yellow-800';
            case 'slow': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    getAccuracyColor(level) {
        switch (level) {
            case 'excellent': return 'bg-purple-100 text-purple-800';
            case 'very_good': return 'bg-blue-100 text-blue-800';
            case 'good': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }
}

export default EmbeddingModelSelector;