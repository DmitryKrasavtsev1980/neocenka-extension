/**
 * Менеджер загрузки и кэширования embedding-моделей
 * Управляет загрузкой моделей из HuggingFace Hub с прогрессом и кэшированием
 */

class EmbeddingModelManager {
    constructor() {
        this.modelsRegistry = new window.EmbeddingModelsRegistry();
        this.loadedModels = new Map(); // Кэш статусов загруженных моделей
        this.downloadProgress = new Map(); // Прогресс загрузки моделей
        
        // Используем Worker Manager вместо прямой работы с Transformers.js
        this.workerManager = new window.EmbeddingWorkerManager();
        
        console.log('✅ [ModelManager] Инициализирован с Worker Manager');
    }

    /**
     * Настройка среды Transformers.js для Chrome Extension
     */
    async setupTransformersEnvironment() {
        // Проверяем доступность Transformers.js (должен быть загружен через script-тег)
        if (typeof transformers === 'undefined' && typeof window.transformers === 'undefined') {
            console.error('❌ [ModelManager] Transformers.js не загружен через script-тег');
            throw new Error('Transformers.js должен быть подключен через <script src="../libs/transformers.min.js">');
        }
        
        // Получаем ссылку на transformers
        const Transformers = window.transformers || transformers;
        
        // Настройки окружения для Chrome Extension
        if (Transformers && Transformers.env) {
            const env = Transformers.env;
            env.allowRemoteModels = true;
            env.allowLocalModels = false;
            
            // Настраиваем удаленный URL для загрузки моделей
            env.remoteURL = 'https://huggingface.co/';
            env.localURL = null;
        }
        
        console.log('🔧 [ModelManager] Среда Transformers.js настроена для Chrome Extension');
        return Transformers;
    }

    /**
     * Загрузка embedding-модели с прогрессом
     * @param {string} modelId - ID модели из реестра
     * @param {Function} progressCallback - Callback для отображения прогресса
     * @returns {Promise<Object>} Загруженная модель
     */
    async loadEmbeddingModel(modelId, progressCallback = null) {
        // Проверяем, загружена ли модель уже
        if (this.loadedModels.has(modelId)) {
            console.log(`✅ [ModelManager] Модель ${modelId} уже загружена из кэша`);
            return this.loadedModels.get(modelId);
        }

        // Проверяем валидность ID модели
        const modelConfig = this.modelsRegistry.getModel(modelId);
        if (!modelConfig) {
            throw new Error(`Модель ${modelId} не найдена в реестре`);
        }

        console.log(`🔄 [ModelManager] Начинаем загрузку модели: ${modelConfig.name} (${modelConfig.modelSize})`);

        try {
            // Устанавливаем прогресс загрузки
            this.downloadProgress.set(modelId, { stage: 'downloading', progress: 0 });

            // Настраиваем окружение Transformers.js
            const Transformers = await this.setupTransformersEnvironment();
            
            // Загружаем реальную модель из HuggingFace
            console.log(`🔄 [ModelManager] Загружаем модель ${modelConfig.fullName} из HuggingFace...`);
            
            const model = await Transformers.pipeline('feature-extraction', modelConfig.fullName, {
                progress_callback: (progress) => {
                    if (progressCallback) {
                        const percentage = Math.round((progress.loaded / progress.total) * 100);
                        progressCallback({
                            modelId: modelId,
                            modelName: modelConfig.name,
                            stage: 'downloading',
                            progress: percentage,
                            loaded: progress.loaded,
                            total: progress.total
                        });
                    }
                    
                    this.downloadProgress.set(modelId, { 
                        stage: 'downloading', 
                        progress: Math.round((progress.loaded / progress.total) * 100),
                        loaded: progress.loaded,
                        total: progress.total
                    });
                }
            });

            // Сохраняем модель в кэш памяти
            this.loadedModels.set(modelId, model);
            
            // Обновляем статус
            this.downloadProgress.set(modelId, { 
                stage: 'ready', 
                progress: 100,
                loadedAt: new Date()
            });

            console.log(`✅ [ModelManager] Модель ${modelConfig.name} успешно загружена и готова к использованию`);
            
            if (progressCallback) {
                progressCallback({
                    modelId: modelId,
                    modelName: modelConfig.name,
                    stage: 'ready',
                    progress: 100,
                    loadedAt: new Date()
                });
            }

            return model;

        } catch (error) {
            console.error(`❌ [ModelManager] Ошибка загрузки модели ${modelId}:`, error);
            
            // Удаляем из прогресса при ошибке
            this.downloadProgress.delete(modelId);
            
            if (progressCallback) {
                progressCallback({
                    modelId: modelId,
                    modelName: modelConfig.name,
                    stage: 'error',
                    progress: 0,
                    error: error.message
                });
            }
            
            throw error;
        }
    }

    /**
     * Предварительная загрузка рекомендуемой модели для русского языка
     * @param {Function} progressCallback - Callback для прогресса
     */
    async preloadRecommendedModel(progressCallback = null) {
        const recommendedModel = this.modelsRegistry.getDefaultModel('ru');
        console.log(`🚀 [ModelManager] Предварительная загрузка рекомендуемой модели: ${recommendedModel.name}`);
        
        return await this.loadEmbeddingModel(recommendedModel.id, progressCallback);
    }

    /**
     * Проверка доступности модели (быстрая проверка без загрузки)
     * @param {string} modelId - ID модели
     * @returns {Promise<boolean>} True если модель доступна
     */
    async checkModelAvailability(modelId) {
        const modelConfig = this.modelsRegistry.getModel(modelId);
        if (!modelConfig) return false;

        try {
            // Проверяем доступность через HEAD-запрос к HuggingFace
            const checkUrl = `https://huggingface.co/${modelConfig.fullName}/resolve/main/config.json`;
            const response = await fetch(checkUrl, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            console.warn(`⚠️ [ModelManager] Не удалось проверить доступность модели ${modelId}:`, error);
            return false;
        }
    }

    /**
     * Получение прогресса загрузки модели
     * @param {string} modelId - ID модели
     * @returns {Object|null} Информация о прогрессе
     */
    getLoadingProgress(modelId) {
        return this.downloadProgress.get(modelId) || null;
    }

    /**
     * Получение статуса всех загруженных моделей
     * @returns {Object} Статус всех моделей
     */
    getModelsStatus() {
        const status = {
            loaded: Array.from(this.loadedModels.keys()),
            loading: [],
            available: []
        };

        // Добавляем модели в процессе загрузки
        for (const [modelId, progress] of this.downloadProgress.entries()) {
            if (progress.stage === 'downloading') {
                status.loading.push({
                    modelId,
                    progress: progress.progress || 0,
                    stage: progress.stage
                });
            }
        }

        // Добавляем все доступные модели из реестра
        status.available = this.modelsRegistry.getModelIds();

        return status;
    }

    /**
     * Очистка кэша модели из памяти
     * @param {string} modelId - ID модели для удаления из кэша
     */
    unloadModel(modelId) {
        if (this.loadedModels.has(modelId)) {
            this.loadedModels.delete(modelId);
            this.downloadProgress.delete(modelId);
            console.log(`🗑️ [ModelManager] Модель ${modelId} выгружена из памяти`);
            return true;
        }
        return false;
    }

    /**
     * Очистка всех моделей из памяти
     */
    unloadAllModels() {
        const unloadedCount = this.loadedModels.size;
        this.loadedModels.clear();
        this.downloadProgress.clear();
        console.log(`🗑️ [ModelManager] Выгружено ${unloadedCount} моделей из памяти`);
    }

    /**
     * Получение размера кэша моделей в памяти (приблизительный)
     * @returns {Object} Информация о размере кэша
     */
    getCacheInfo() {
        const loadedModels = Array.from(this.loadedModels.keys()).map(modelId => {
            const config = this.modelsRegistry.getModel(modelId);
            return {
                modelId,
                name: config?.name || 'Unknown',
                modelSize: config?.modelSize || 'Unknown',
                loadedAt: this.downloadProgress.get(modelId)?.loadedAt
            };
        });

        return {
            loadedCount: this.loadedModels.size,
            models: loadedModels,
            totalApproximateSize: loadedModels.reduce((total, model) => {
                const sizeStr = model.modelSize;
                if (sizeStr && sizeStr.includes('MB')) {
                    return total + parseInt(sizeStr.replace('MB', ''));
                }
                return total;
            }, 0) + 'MB'
        };
    }

    /**
     * Тест модели - генерация пробного embedding для проверки работы
     * @param {string} modelId - ID модели для тестирования
     * @returns {Promise<Object>} Результат тестирования
     */
    async testModel(modelId) {
        console.log(`🧪 [ModelManager] Тестирование модели ${modelId}...`);
        
        try {
            const model = await this.loadEmbeddingModel(modelId);
            const testText = "Тестовый русский текст для проверки embedding-модели";
            
            const startTime = Date.now();
            const embedding = await model(testText, { 
                pooling: 'mean',
                normalize: true 
            });
            const processingTime = Date.now() - startTime;

            const vector = Array.from(embedding.data);
            const dimensions = vector.length;
            
            const testResult = {
                success: true,
                modelId,
                dimensions,
                processingTime,
                vectorSample: vector.slice(0, 5), // Первые 5 значений для примера
                testText
            };

            console.log(`✅ [ModelManager] Тест модели ${modelId} успешен:`, testResult);
            return testResult;

        } catch (error) {
            console.error(`❌ [ModelManager] Ошибка тестирования модели ${modelId}:`, error);
            return {
                success: false,
                modelId,
                error: error.message
            };
        }
    }

    /**
     * Получение рекомендаций по выбору модели
     * @param {Object} requirements - Требования к модели
     * @returns {Object} Рекомендация
     */
    getModelRecommendation(requirements = {}) {
        const {
            language = 'ru',
            priority = 'balanced', // 'speed', 'accuracy', 'balanced'
            textType = 'real_estate' // Тип текстов
        } = requirements;

        let recommendedModel;

        if (language === 'ru' || language === 'russian') {
            // Для русского языка
            switch (priority) {
                case 'speed':
                    recommendedModel = this.modelsRegistry.getModel('all-MiniLM-L6-v2');
                    break;
                case 'accuracy':
                    recommendedModel = this.modelsRegistry.getModel('all-mpnet-base-v2');
                    break;
                default: // 'balanced'
                    recommendedModel = this.modelsRegistry.getModel('paraphrase-multilingual-MiniLM-L12-v2');
            }
        } else {
            // Для других языков
            recommendedModel = this.modelsRegistry.getModel('all-mpnet-base-v2');
        }

        return {
            recommended: recommendedModel,
            alternatives: this.modelsRegistry.getModelsByRussianSupport().slice(1, 3),
            reasoning: this.getRecommendationReasoning(recommendedModel, priority, language)
        };
    }

    /**
     * Получение объяснения рекомендации
     * @private
     */
    getRecommendationReasoning(model, priority, language) {
        const reasons = [];
        
        if (language === 'ru') {
            reasons.push(`Оптимизирована для русского языка (поддержка: ${model.russianSupport})`);
        }
        
        switch (priority) {
            case 'speed':
                reasons.push(`Быстрая обработка (${model.avgProcessingTime})`);
                break;
            case 'accuracy':
                reasons.push(`Высокая точность (${model.accuracy})`);
                break;
            default:
                reasons.push(`Оптимальный баланс скорости и точности`);
        }

        reasons.push(`Размер модели: ${model.modelSize}`);
        reasons.push(`Векторное пространство: ${model.dimensions} измерений`);

        return reasons;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmbeddingModelManager;
} else {
    window.EmbeddingModelManager = EmbeddingModelManager;
}