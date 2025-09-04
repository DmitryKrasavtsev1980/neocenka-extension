/**
 * Менеджер embedding-моделей через Web Worker
 * Заменяет оригинальный EmbeddingModelManager для работы в Chrome Extension
 */

class EmbeddingModelManagerWorker {
    constructor() {
        this.modelsRegistry = new window.EmbeddingModelsRegistry();
        this.downloadService = new window.ModelDownloadService();
        this.embeddingService = new window.LocalEmbeddingService();
        this.loadedModels = new Map(); // Кэш статусов загруженных моделей
        this.downloadProgress = new Map(); // Прогресс загрузки моделей
        this.initialized = false;
        
        console.log('✅ [ModelManagerWorker] Инициализирован с локальным сервисом');
        this.initializeFromStorage();
    }

    /**
     * Инициализация статуса из IndexedDB
     */
    async initializeFromStorage() {
        try {
            const storedModels = await this.downloadService.getStoredModels();
            
            for (const modelData of storedModels) {
                this.loadedModels.set(modelData.modelId, {
                    modelId: modelData.modelId,
                    config: modelData.config,
                    loadedAt: modelData.downloaded,
                    totalSize: modelData.totalSize
                });
            }
            
            this.initialized = true;
            console.log(`✅ [ModelManagerWorker] Загружен статус ${storedModels.length} моделей из IndexedDB`);
        } catch (error) {
            console.error('❌ [ModelManagerWorker] Ошибка инициализации из IndexedDB:', error);
            this.initialized = true; // Продолжаем работу даже при ошибке
        }
    }

    /**
     * Загрузка embedding-модели (скачивание файлов)
     */
    async loadEmbeddingModel(modelId, progressCallback = null) {
        // Проверяем, что модель не загружена уже
        const isDownloaded = await this.downloadService.isModelDownloaded(modelId);
        if (isDownloaded) {
            console.log(`✅ [ModelManagerWorker] Модель ${modelId} уже загружена`);
            
            const modelData = {
                modelId,
                config: this.modelsRegistry.getModel(modelId),
                loadedAt: new Date()
            };
            
            this.loadedModels.set(modelId, modelData);
            return modelData;
        }

        const modelConfig = this.modelsRegistry.getModel(modelId);
        if (!modelConfig) {
            throw new Error(`Модель ${modelId} не найдена в реестре`);
        }

        console.log(`🔄 [ModelManagerWorker] Скачивание модели: ${modelConfig.name} (${modelConfig.modelSize})`);

        try {
            // Устанавливаем прогресс загрузки
            this.downloadProgress.set(modelId, { stage: 'downloading', progress: 0 });

            // Скачиваем модель
            const result = await this.downloadService.downloadModel(modelId, modelConfig, (progress) => {
                // Обновляем внутренний прогресс
                this.downloadProgress.set(modelId, progress);
                
                // Вызываем внешний колбек
                if (progressCallback) {
                    progressCallback({
                        modelId: modelId,
                        modelName: modelConfig.name,
                        ...progress
                    });
                }
            });

            // Сохраняем информацию о загруженной модели
            this.loadedModels.set(modelId, {
                modelId,
                config: modelConfig,
                loadedAt: result.downloaded,
                totalSize: result.totalSize
            });
            
            // Обновляем статус
            this.downloadProgress.set(modelId, { 
                stage: 'ready', 
                progress: 100,
                loadedAt: result.downloaded
            });

            console.log(`✅ [ModelManagerWorker] Модель ${modelConfig.name} успешно скачана`);
            
            if (progressCallback) {
                progressCallback({
                    modelId: modelId,
                    modelName: modelConfig.name,
                    stage: 'ready',
                    progress: 100,
                    loadedAt: result.downloaded,
                    totalSize: result.totalSize
                });
            }

            return this.loadedModels.get(modelId);

        } catch (error) {
            console.error(`❌ [ModelManagerWorker] Ошибка скачивания модели ${modelId}:`, error);
            
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
     * Получение модели из кэша
     */
    getLoadedModel(modelId) {
        return this.loadedModels.get(modelId);
    }

    /**
     * Проверка, загружена ли модель
     */
    async isModelLoaded(modelId) {
        // Проверяем кэш в памяти
        if (this.loadedModels.has(modelId)) {
            return true;
        }
        
        // Проверяем IndexedDB
        try {
            const isDownloaded = await this.downloadService.isModelDownloaded(modelId);
            if (isDownloaded) {
                // Добавляем в кэш в памяти
                const modelData = await this.downloadService.getStoredModel(modelId);
                this.loadedModels.set(modelId, {
                    modelId: modelData.modelId,
                    config: modelData.config,
                    loadedAt: modelData.downloaded,
                    totalSize: modelData.totalSize
                });
                return true;
            }
        } catch (error) {
            console.error(`❌ [ModelManagerWorker] Ошибка проверки модели ${modelId}:`, error);
        }
        
        return false;
    }

    /**
     * Получение прогресса загрузки модели
     */
    getLoadingProgress(modelId) {
        return this.downloadProgress.get(modelId);
    }

    /**
     * Тестирование модели через локальный сервис
     */
    async testModel(modelId, testText = "Тестовая фраза для проверки модели") {
        if (!this.loadedModels.has(modelId)) {
            throw new Error(`Модель ${modelId} не загружена`);
        }

        console.log(`🧪 [ModelManagerWorker] Тестирование модели ${modelId}...`);

        try {
            // Тестируем через локальный embedding сервис
            const vector = await this.embeddingService.generateEmbedding(testText, modelId);
            
            const result = {
                success: true,
                modelId,
                testText,
                vectorDimensions: vector.length,
                vectorSample: vector.slice(0, 5), // Первые 5 элементов для демонстрации
                executionTime: Date.now() - performance.now()
            };
            
            console.log(`✅ [ModelManagerWorker] Тест модели ${modelId} завершен:`, result);
            return result;
        } catch (error) {
            console.error(`❌ [ModelManagerWorker] Ошибка тестирования модели ${modelId}:`, error);
            throw error;
        }
    }

    /**
     * Выгрузка модели из локальных кэшей
     */
    async unloadModel(modelId) {
        try {
            const wasLoaded = this.loadedModels.has(modelId);
            
            if (wasLoaded) {
                // Удаляем из локальных кэшей
                this.loadedModels.delete(modelId);
                this.downloadProgress.delete(modelId);
                
                // Очищаем кэш векторов для этой модели
                const keysToDelete = [];
                for (const [key] of this.embeddingService.vectorCache.entries()) {
                    if (key.startsWith(`${modelId}:`)) {
                        keysToDelete.push(key);
                    }
                }
                keysToDelete.forEach(key => this.embeddingService.vectorCache.delete(key));
                
                console.log(`🗑️ [ModelManagerWorker] Модель ${modelId} выгружена из кэшей`);
            }
            
            return wasLoaded;
        } catch (error) {
            console.error(`❌ [ModelManagerWorker] Ошибка выгрузки модели ${modelId}:`, error);
            throw error;
        }
    }

    /**
     * Получение статуса всех моделей
     */
    getModelsStatus() {
        const loaded = Array.from(this.loadedModels.keys());
        const loading = Array.from(this.downloadProgress.entries())
            .filter(([_, progress]) => progress.stage === 'downloading')
            .map(([modelId]) => modelId);

        return {
            loaded,
            loading,
            loadedCount: loaded.length,
            loadingCount: loading.length
        };
    }

    /**
     * Генерация embedding через локальный сервис
     */
    async generateEmbedding(modelId, text, options = {}) {
        const isDownloaded = await this.downloadService.isModelDownloaded(modelId);
        if (!isDownloaded) {
            throw new Error(`Модель ${modelId} не загружена. Загрузите модель сначала.`);
        }

        try {
            const vector = await this.embeddingService.generateEmbedding(text, modelId);
            return vector;
        } catch (error) {
            console.error(`❌ [ModelManagerWorker] Ошибка генерации embedding:`, error);
            throw error;
        }
    }

    /**
     * Пакетная генерация embedding через локальный сервис
     */
    async batchGenerateEmbeddings(texts, modelId, options = {}) {
        const isDownloaded = await this.downloadService.isModelDownloaded(modelId);
        if (!isDownloaded) {
            throw new Error(`Модель ${modelId} не загружена. Загрузите модель сначала.`);
        }

        try {
            const results = await this.embeddingService.batchGenerateEmbeddings(texts, modelId, options.progressCallback);
            return results;
        } catch (error) {
            console.error(`❌ [ModelManagerWorker] Ошибка пакетной генерации embedding:`, error);
            throw error;
        }
    }

    /**
     * Получение статистики использования памяти
     */
    async getMemoryUsage() {
        try {
            let totalSize = 0;
            const modelSizes = {};
            
            for (const [modelId, modelData] of this.loadedModels.entries()) {
                const size = modelData.totalSize || 0;
                totalSize += size;
                modelSizes[modelId] = size;
            }
            
            // Примерная оценка использования памяти кэшем векторов
            const vectorCacheSize = this.embeddingService.vectorCache.size * 4 * 384; // Примерно 384 измерения по 4 байта
            
            return {
                totalModelsSize: totalSize,
                vectorCacheSize: vectorCacheSize,
                totalMemoryUsage: totalSize + vectorCacheSize,
                modelsCount: this.loadedModels.size,
                vectorCacheCount: this.embeddingService.vectorCache.size,
                modelSizes
            };
        } catch (error) {
            console.error(`❌ [ModelManagerWorker] Ошибка получения статистики памяти:`, error);
            return null;
        }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        // Очищаем локальные кэши
        this.loadedModels.clear();
        this.downloadProgress.clear();
        
        // Очищаем кэш векторов
        if (this.embeddingService) {
            this.embeddingService.clearCache();
        }
        
        console.log('🗑️ [ModelManagerWorker] Ресурсы очищены');
    }
}

// Экспорт в глобальную область видимости
window.EmbeddingModelManagerWorker = EmbeddingModelManagerWorker;