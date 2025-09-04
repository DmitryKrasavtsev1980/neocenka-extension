/**
 * Сервис загрузки embedding-моделей
 * Скачивает модели из HuggingFace и сохраняет локально в IndexedDB
 */

class ModelDownloadService {
    constructor() {
        this.dbName = 'embedding-models-storage';
        this.storeName = 'models';
        this.db = null;
        
        this.initDatabase();
    }

    /**
     * Инициализация базы данных для хранения моделей
     */
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ [ModelDownload] База данных моделей инициализирована');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'modelId' });
                    store.createIndex('downloaded', 'downloaded', { unique: false });
                    store.createIndex('lastUsed', 'lastUsed', { unique: false });
                }
            };
        });
    }

    /**
     * Загрузка модели из HuggingFace
     */
    async downloadModel(modelId, modelConfig, progressCallback = null) {
        console.log(`🔄 [ModelDownload] Начинаем загрузку модели ${modelId}...`);

        try {
            // Проверяем, не загружена ли уже модель
            const existingModel = await this.getStoredModel(modelId);
            if (existingModel && existingModel.files) {
                console.log(`✅ [ModelDownload] Модель ${modelId} уже загружена`);
                return existingModel;
            }

            // Список файлов модели для загрузки
            const filesToDownload = [
                'config.json',
                'tokenizer.json', 
                'tokenizer_config.json',
                'vocab.txt',
                'pytorch_model.bin'
            ];

            const modelFiles = {};
            let totalFiles = filesToDownload.length;
            let downloadedFiles = 0;

            // Скачиваем каждый файл
            for (const fileName of filesToDownload) {
                try {
                    if (progressCallback) {
                        progressCallback({
                            stage: 'downloading',
                            progress: Math.round((downloadedFiles / totalFiles) * 100),
                            currentFile: fileName,
                            totalFiles,
                            downloadedFiles
                        });
                    }

                    console.log(`📥 [ModelDownload] Загружаем файл: ${fileName}`);
                    
                    const fileUrl = `https://huggingface.co/${modelConfig.fullName}/resolve/main/${fileName}`;
                    const response = await fetch(fileUrl);
                    
                    if (!response.ok) {
                        console.warn(`⚠️ [ModelDownload] Файл ${fileName} не найден, пропускаем`);
                        continue;
                    }

                    // Сохраняем файл как ArrayBuffer
                    const arrayBuffer = await response.arrayBuffer();
                    modelFiles[fileName] = {
                        data: arrayBuffer,
                        size: arrayBuffer.byteLength,
                        type: response.headers.get('content-type') || 'application/octet-stream'
                    };

                    downloadedFiles++;
                    console.log(`✅ [ModelDownload] Файл ${fileName} загружен (${this.formatBytes(arrayBuffer.byteLength)})`);

                } catch (error) {
                    console.warn(`⚠️ [ModelDownload] Ошибка загрузки ${fileName}:`, error);
                }
            }

            if (Object.keys(modelFiles).length === 0) {
                throw new Error('Не удалось загрузить ни одного файла модели');
            }

            // Сохраняем модель в IndexedDB
            const modelData = {
                modelId,
                config: modelConfig,
                files: modelFiles,
                downloaded: new Date(),
                lastUsed: new Date(),
                totalSize: Object.values(modelFiles).reduce((sum, file) => sum + file.size, 0)
            };

            await this.storeModel(modelData);

            if (progressCallback) {
                progressCallback({
                    stage: 'completed',
                    progress: 100,
                    totalFiles,
                    downloadedFiles,
                    totalSize: modelData.totalSize
                });
            }

            console.log(`✅ [ModelDownload] Модель ${modelId} успешно загружена и сохранена (${this.formatBytes(modelData.totalSize)})`);
            return modelData;

        } catch (error) {
            console.error(`❌ [ModelDownload] Ошибка загрузки модели ${modelId}:`, error);
            
            if (progressCallback) {
                progressCallback({
                    stage: 'error',
                    progress: 0,
                    error: error.message
                });
            }
            
            throw error;
        }
    }

    /**
     * Сохранение модели в IndexedDB
     */
    async storeModel(modelData) {
        if (!this.db) await this.initDatabase();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.put(modelData);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Получение сохраненной модели
     */
    async getStoredModel(modelId) {
        if (!this.db) await this.initDatabase();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.get(modelId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Получение списка всех загруженных моделей
     */
    async getStoredModels() {
        if (!this.db) await this.initDatabase();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Удаление модели
     */
    async deleteModel(modelId) {
        if (!this.db) await this.initDatabase();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.delete(modelId);
            
            request.onsuccess = () => {
                console.log(`🗑️ [ModelDownload] Модель ${modelId} удалена`);
                resolve(true);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Проверка доступности модели
     */
    async isModelDownloaded(modelId) {
        const model = await this.getStoredModel(modelId);
        return model && model.files && Object.keys(model.files).length > 0;
    }

    /**
     * Получение размера модели
     */
    async getModelSize(modelId) {
        const model = await this.getStoredModel(modelId);
        return model ? model.totalSize : 0;
    }

    /**
     * Получение статистики загруженных моделей
     */
    async getStorageStats() {
        const models = await this.getStoredModels();
        
        const totalModels = models.length;
        const totalSize = models.reduce((sum, model) => sum + (model.totalSize || 0), 0);
        
        return {
            totalModels,
            totalSize,
            totalSizeFormatted: this.formatBytes(totalSize),
            models: models.map(model => ({
                modelId: model.modelId,
                name: model.config?.name || model.modelId,
                size: this.formatBytes(model.totalSize || 0),
                downloaded: model.downloaded,
                lastUsed: model.lastUsed
            }))
        };
    }

    /**
     * Обновление времени последнего использования
     */
    async updateLastUsed(modelId) {
        const model = await this.getStoredModel(modelId);
        if (model) {
            model.lastUsed = new Date();
            await this.storeModel(model);
        }
    }

    /**
     * Очистка устаревших моделей
     */
    async cleanupOldModels(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 дней по умолчанию
        const models = await this.getStoredModels();
        const now = new Date();
        let deletedCount = 0;

        for (const model of models) {
            const lastUsed = new Date(model.lastUsed || model.downloaded);
            if (now - lastUsed > maxAge) {
                await this.deleteModel(model.modelId);
                deletedCount++;
            }
        }

        console.log(`🧹 [ModelDownload] Очищено ${deletedCount} устаревших моделей`);
        return deletedCount;
    }

    /**
     * Форматирование размера в байтах
     */
    formatBytes(bytes) {
        if (!bytes) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Получение файла модели
     */
    async getModelFile(modelId, fileName) {
        const model = await this.getStoredModel(modelId);
        if (!model || !model.files || !model.files[fileName]) {
            throw new Error(`Файл ${fileName} не найден для модели ${modelId}`);
        }

        return model.files[fileName];
    }

    /**
     * Проверка целостности модели
     */
    async verifyModel(modelId) {
        const model = await this.getStoredModel(modelId);
        if (!model) return false;

        // Проверяем наличие основных файлов
        const requiredFiles = ['config.json'];
        
        for (const fileName of requiredFiles) {
            if (!model.files[fileName]) {
                console.warn(`⚠️ [ModelDownload] Отсутствует обязательный файл ${fileName} для модели ${modelId}`);
                return false;
            }
        }

        console.log(`✅ [ModelDownload] Модель ${modelId} прошла проверку целостности`);
        return true;
    }
}

// Экспорт в глобальную область видимости
window.ModelDownloadService = ModelDownloadService;