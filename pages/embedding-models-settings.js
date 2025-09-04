/**
 * Менеджер настроек Embedding-моделей
 * Управляет загрузкой, отображением и конфигурацией embedding-моделей в настройках
 */

class EmbeddingModelsSettingsManager {
    constructor() {
        this.registry = new window.EmbeddingModelsRegistry();
        this.modelManager = new window.EmbeddingModelManagerWorker();
        this.embeddingService = new window.EmbeddingService();
        
        // Элементы интерфейса
        this.modelsList = null;
        this.loadedStatus = null;
        this.defaultModelSelect = null;
        this.thresholdSlider = null;
        this.thresholdValue = null;
        
        this.initialize();
    }

    async initialize() {
        this.modelsList = document.getElementById('embedding-models-list');
        this.loadedStatus = document.getElementById('loaded-models-status');
        this.defaultModelSelect = document.getElementById('defaultEmbeddingModel');
        this.thresholdSlider = document.getElementById('embeddingThreshold');
        this.thresholdValue = document.getElementById('thresholdValue');

        if (!this.modelsList) {
            console.warn('⚠️ [EmbeddingSettings] Элементы интерфейса не найдены');
            return;
        }

        // Ждем инициализации ModelManager из IndexedDB
        await this.waitForInitialization();

        // Загружаем настройки
        await this.loadSettings();
        
        // Инициализируем интерфейс
        await this.renderModels();
        this.setupEventListeners();
        await this.updateStatus();

        console.log('✅ [EmbeddingSettings] Инициализирован');
    }

    /**
     * Ожидание инициализации ModelManager из IndexedDB
     */
    async waitForInitialization() {
        let attempts = 0;
        while (!this.modelManager.initialized && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        console.log(`✅ [EmbeddingSettings] ModelManager инициализирован за ${attempts * 100}ms`);
    }

    /**
     * Загрузка сохраненных настроек
     */
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                'defaultEmbeddingModel',
                'embeddingThreshold'
            ]);

            // Устанавливаем значения по умолчанию
            this.defaultModel = result.defaultEmbeddingModel || 'paraphrase-multilingual-MiniLM-L12-v2';
            this.threshold = result.embeddingThreshold || 0.75;

            // Обновляем интерфейс
            if (this.defaultModelSelect) {
                this.defaultModelSelect.value = this.defaultModel;
            }
            if (this.thresholdSlider) {
                this.thresholdSlider.value = this.threshold;
                this.thresholdValue.textContent = this.threshold;
            }

        } catch (error) {
            console.error('❌ [EmbeddingSettings] Ошибка загрузки настроек:', error);
        }
    }

    /**
     * Сохранение настроек
     */
    async saveSettings() {
        try {
            await chrome.storage.sync.set({
                defaultEmbeddingModel: this.defaultModel,
                embeddingThreshold: this.threshold
            });
            console.log('✅ [EmbeddingSettings] Настройки сохранены');
        } catch (error) {
            console.error('❌ [EmbeddingSettings] Ошибка сохранения настроек:', error);
        }
    }

    /**
     * Отрисовка списка доступных моделей
     */
    async renderModels() {
        const models = this.registry.getAllModels();
        this.modelsList.innerHTML = '';

        // Очищаем и заполняем селект модели по умолчанию
        this.defaultModelSelect.innerHTML = '<option value="">Выберите модель</option>';

        for (const model of Object.values(models)) {
            // Карточка модели с актуальным статусом
            const modelCard = await this.createModelCard(model);
            this.modelsList.appendChild(modelCard);

            // Опция в селекте
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            if (model.id === this.defaultModel) {
                option.selected = true;
            }
            this.defaultModelSelect.appendChild(option);
        }
    }

    /**
     * Создание карточки модели
     */
    async createModelCard(model) {
        const card = document.createElement('div');
        card.className = 'border border-gray-200 rounded-lg p-4 bg-gray-50';
        card.id = `model-card-${model.id}`;

        // Определяем статус модели асинхронно
        const isLoaded = await this.modelManager.isModelLoaded(model.id);
        const progress = this.modelManager.getLoadingProgress(model.id);
        const isLoading = progress && progress.stage === 'downloading';

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center space-x-2">
                        <h5 class="text-sm font-medium text-gray-900">${model.name}</h5>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${this.getRussianSupportBadge(model.russianSupport)}">
                            ${model.russianSupport === 'native' ? 'Русский язык' : 'Мультиязычная'}
                        </span>
                    </div>
                    <p class="mt-1 text-xs text-gray-600">${model.description}</p>
                    
                    <!-- Характеристики -->
                    <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div class="text-gray-500">
                            <span class="font-medium">Размер:</span> ${model.modelSize}
                        </div>
                        <div class="text-gray-500">
                            <span class="font-medium">Размерность:</span> ${model.dimensions}
                        </div>
                        <div class="text-gray-500">
                            <span class="font-medium">Скорость:</span> ${model.avgProcessingTime}
                        </div>
                        <div class="text-gray-500">
                            <span class="font-medium">Точность:</span> ${this.getAccuracyText(model.accuracy)}
                        </div>
                    </div>
                </div>
                
                <div class="ml-4 flex flex-col items-end space-y-2">
                    <!-- Статус загрузки -->
                    <div class="model-status" data-model-id="${model.id}">
                        ${this.getModelStatusHTML(isLoaded, isLoading, progress)}
                    </div>
                    
                    <!-- Кнопки действий -->
                    <div class="flex space-x-2">
                        ${!isLoaded && !isLoading ? `
                            <button type="button" class="download-model-btn text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700" 
                                    data-model-id="${model.id}">
                                Загрузить
                            </button>
                        ` : ''}
                        
                        ${isLoaded ? `
                            <button type="button" class="test-model-btn text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700" 
                                    data-model-id="${model.id}">
                                Тест
                            </button>
                            <button type="button" class="unload-model-btn text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700" 
                                    data-model-id="${model.id}">
                                Выгрузить
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <!-- Прогресс загрузки -->
            ${isLoading ? `
                <div class="mt-3">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Загрузка...</span>
                        <span>${progress ? progress.progress : 0}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                             style="width: ${progress ? progress.progress : 0}%"></div>
                    </div>
                </div>
            ` : ''}
        `;

        return card;
    }

    /**
     * Получение статуса модели в HTML
     */
    getModelStatusHTML(isLoaded, isLoading, progress) {
        if (isLoading) {
            return '<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Загружается</span>';
        } else if (isLoaded) {
            return '<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Готова</span>';
        } else {
            return '<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">Не загружена</span>';
        }
    }

    /**
     * Получение CSS-классов для уровня поддержки русского языка
     */
    getRussianSupportBadge(level) {
        switch (level) {
            case 'native': return 'bg-green-100 text-green-800';
            case 'excellent': return 'bg-blue-100 text-blue-800';
            case 'good': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    /**
     * Получение текста для точности
     */
    getAccuracyText(accuracy) {
        const accuracyMap = {
            'excellent': 'Отличная',
            'very_good': 'Очень хорошая', 
            'good': 'Хорошая',
            'basic': 'Базовая'
        };
        return accuracyMap[accuracy] || accuracy;
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Загрузка модели
        this.modelsList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('download-model-btn')) {
                const modelId = e.target.dataset.modelId;
                await this.downloadModel(modelId);
            } else if (e.target.classList.contains('test-model-btn')) {
                const modelId = e.target.dataset.modelId;
                await this.testModel(modelId);
            } else if (e.target.classList.contains('unload-model-btn')) {
                const modelId = e.target.dataset.modelId;
                await this.unloadModel(modelId);
            }
        });

        // Изменение модели по умолчанию
        this.defaultModelSelect.addEventListener('change', () => {
            this.defaultModel = this.defaultModelSelect.value;
            this.saveSettings();
        });

        // Изменение порога сходства
        this.thresholdSlider.addEventListener('input', () => {
            this.threshold = parseFloat(this.thresholdSlider.value);
            this.thresholdValue.textContent = this.threshold;
            this.saveSettings();
        });

        // Очистка кэша
        document.getElementById('clearEmbeddingCache')?.addEventListener('click', () => {
            this.clearCache();
        });

        // Обновление статуса
        document.getElementById('refreshModelsStatus')?.addEventListener('click', () => {
            this.updateStatus();
            this.renderModels();
        });
    }

    /**
     * Загрузка модели с отображением прогресса
     */
    async downloadModel(modelId) {
        try {
            console.log(`🔄 [EmbeddingSettings] Загрузка модели ${modelId}...`);
            
            const button = document.querySelector(`button[data-model-id="${modelId}"].download-model-btn`);
            if (button) {
                button.disabled = true;
                button.textContent = 'Загружается...';
            }

            await this.modelManager.loadEmbeddingModel(modelId, (progress) => {
                this.updateModelProgress(modelId, progress);
            });

            console.log(`✅ [EmbeddingSettings] Модель ${modelId} загружена`);
            
            // Обновляем интерфейс
            this.renderModels();
            this.updateStatus();

        } catch (error) {
            console.error(`❌ [EmbeddingSettings] Ошибка загрузки модели ${modelId}:`, error);
            alert(`Ошибка загрузки модели: ${error.message}`);
            this.renderModels();
        }
    }

    /**
     * Обновление прогресса загрузки модели
     */
    updateModelProgress(modelId, progress) {
        const modelCard = document.getElementById(`model-card-${modelId}`);
        if (!modelCard) return;

        const statusElement = modelCard.querySelector('.model-status');
        if (statusElement && progress.stage === 'downloading') {
            statusElement.innerHTML = '<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Загружается</span>';
            
            // Добавляем или обновляем прогресс-бар
            let progressContainer = modelCard.querySelector('.progress-container');
            if (!progressContainer) {
                progressContainer = document.createElement('div');
                progressContainer.className = 'progress-container mt-3';
                modelCard.appendChild(progressContainer);
            }

            progressContainer.innerHTML = `
                <div class="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Загрузка...</span>
                    <span>${progress.progress || 0}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                         style="width: ${progress.progress || 0}%"></div>
                </div>
            `;
        }
    }

    /**
     * Тестирование модели
     */
    async testModel(modelId) {
        try {
            console.log(`🧪 [EmbeddingSettings] Тестирование модели ${modelId}...`);
            
            const result = await this.modelManager.testModel(modelId);
            
            if (result.success) {
                alert(`✅ Тест модели успешен!\n\nРазмерность: ${result.dimensions}\nВремя обработки: ${result.processingTime}ms\nПример вектора: [${result.vectorSample.map(x => x.toFixed(3)).join(', ')}]`);
            } else {
                alert(`❌ Тест модели не удался: ${result.error}`);
            }

        } catch (error) {
            console.error(`❌ [EmbeddingSettings] Ошибка тестирования модели ${modelId}:`, error);
            alert(`Ошибка тестирования: ${error.message}`);
        }
    }

    /**
     * Выгрузка модели из памяти
     */
    async unloadModel(modelId) {
        try {
            if (confirm('Выгрузить модель из памяти? Это освободит RAM, но потребует повторной загрузки при следующем использовании.')) {
                const success = this.modelManager.unloadModel(modelId);
                
                if (success) {
                    console.log(`🗑️ [EmbeddingSettings] Модель ${modelId} выгружена`);
                    this.renderModels();
                    this.updateStatus();
                } else {
                    alert('Модель не была загружена');
                }
            }
        } catch (error) {
            console.error(`❌ [EmbeddingSettings] Ошибка выгрузки модели ${modelId}:`, error);
            alert(`Ошибка выгрузки: ${error.message}`);
        }
    }

    /**
     * Очистка кэша embedding-векторов
     */
    async clearCache() {
        try {
            if (confirm('Очистить весь кэш embedding-векторов? Это удалит все сохраненные вычисления, но не затронет загруженные модели.')) {
                const deletedCount = await this.embeddingService.clearCache();
                alert(`✅ Очищено ${deletedCount} записей из кэша`);
                this.updateStatus();
            }
        } catch (error) {
            console.error('❌ [EmbeddingSettings] Ошибка очистки кэша:', error);
            alert(`Ошибка очистки кэша: ${error.message}`);
        }
    }

    /**
     * Обновление статуса загруженных моделей
     */
    async updateStatus() {
        try {
            // Статус моделей из памяти (после инициализации из IndexedDB)
            const modelsStatus = this.modelManager.getModelsStatus();
            
            // Статистика кэша
            const cacheStats = await this.embeddingService.getCacheStats();
            
            this.loadedStatus.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="text-center p-3 bg-white rounded border">
                        <div class="text-lg font-semibold text-blue-600">${modelsStatus.loaded.length}</div>
                        <div class="text-xs text-gray-500">Загружено моделей</div>
                    </div>
                    <div class="text-center p-3 bg-white rounded border">
                        <div class="text-lg font-semibold text-yellow-600">${modelsStatus.loading.length}</div>
                        <div class="text-xs text-gray-500">Загружается</div>
                    </div>
                    <div class="text-center p-3 bg-white rounded border">
                        <div class="text-lg font-semibold text-green-600">${cacheStats.totalEntries}</div>
                        <div class="text-xs text-gray-500">Кэшировано векторов</div>
                    </div>
                </div>
                
                ${modelsStatus.loaded.length > 0 ? `
                    <div class="mt-3">
                        <h6 class="text-xs font-medium text-gray-900 mb-2">Загруженные модели:</h6>
                        <div class="space-y-1">
                            ${modelsStatus.loaded.map(modelId => {
                                const model = this.registry.getModel(modelId);
                                return `<div class="text-xs text-gray-600">• ${model ? model.name : modelId}</div>`;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            `;

        } catch (error) {
            console.error('❌ [EmbeddingSettings] Ошибка обновления статуса:', error);
            this.loadedStatus.innerHTML = '<p class="text-sm text-red-600">Ошибка загрузки статуса</p>';
        }
    }
}

// Глобальная инициализация
window.embeddingModelsSettings = null;

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.embeddingModelsSettings = new EmbeddingModelsSettingsManager();
    });
} else {
    window.embeddingModelsSettings = new EmbeddingModelsSettingsManager();
}