/**
 * Менеджер Web Worker для работы с embedding моделями
 * Обеспечивает изолированную работу с Transformers.js в отдельном потоке
 */

class EmbeddingWorkerManager {
    constructor() {
        this.worker = null;
        this.registry = new window.EmbeddingModelsRegistry();
        this.requestQueue = new Map(); // Очередь запросов с Promise
        this.requestId = 0;
        
        this.initialize();
    }

    /**
     * Инициализация worker'а
     */
    initialize() {
        try {
            // Создаем worker как модуль
            this.worker = new Worker(
                chrome.runtime.getURL('workers/embedding-worker.js'),
                { type: 'module' }
            );
            
            // Обработка сообщений от worker'а
            this.worker.onmessage = (e) => {
                this.handleWorkerMessage(e.data);
            };
            
            // Обработка ошибок
            this.worker.onerror = (error) => {
                console.error('❌ [WorkerManager] Ошибка worker:', error);
            };
            
            console.log('✅ [WorkerManager] Embedding Worker инициализирован');
            
        } catch (error) {
            console.error('❌ [WorkerManager] Не удалось инициализировать worker:', error);
            throw error;
        }
    }

    /**
     * Обработка сообщений от worker'а
     */
    handleWorkerMessage(data) {
        const { id, type, success, result, error, progress, modelId } = data;
        
        if (type === 'progress') {
            // Прогресс загрузки модели
            this.handleProgress(modelId, progress);
            return;
        }
        
        // Обычные ответы на запросы
        const request = this.requestQueue.get(id);
        if (!request) {
            console.warn(`⚠️ [WorkerManager] Получен ответ на неизвестный запрос ${id}`);
            return;
        }
        
        // Удаляем запрос из очереди
        this.requestQueue.delete(id);
        
        if (success) {
            request.resolve(result);
        } else {
            const err = new Error(error.message);
            err.stack = error.stack;
            request.reject(err);
        }
    }

    /**
     * Обработка прогресса загрузки
     */
    handleProgress(modelId, progress) {
        // Вызываем колбеки прогресса, если они есть
        const progressCallbacks = this.progressCallbacks?.get(modelId);
        if (progressCallbacks) {
            progressCallbacks.forEach(callback => {
                try {
                    callback(progress);
                } catch (error) {
                    console.error('❌ [WorkerManager] Ошибка в колбеке прогресса:', error);
                }
            });
        }
    }

    /**
     * Отправка сообщения worker'у с Promise
     */
    sendMessage(action, data = {}) {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker не инициализирован'));
                return;
            }
            
            const id = ++this.requestId;
            
            // Сохраняем Promise в очереди
            this.requestQueue.set(id, { resolve, reject });
            
            // Отправляем сообщение
            this.worker.postMessage({
                id,
                action,
                data
            });
            
            // Таймаут для длительных операций
            setTimeout(() => {
                if (this.requestQueue.has(id)) {
                    this.requestQueue.delete(id);
                    reject(new Error('Превышен таймаут операции'));
                }
            }, 300000); // 5 минут для загрузки модели
        });
    }

    /**
     * Загрузка модели
     */
    async loadEmbeddingModel(modelId, progressCallback = null) {
        const modelConfig = this.registry.getModel(modelId);
        if (!modelConfig) {
            throw new Error(`Модель ${modelId} не найдена в реестре`);
        }
        
        // Регистрируем колбек прогресса
        if (progressCallback) {
            if (!this.progressCallbacks) {
                this.progressCallbacks = new Map();
            }
            
            if (!this.progressCallbacks.has(modelId)) {
                this.progressCallbacks.set(modelId, new Set());
            }
            
            this.progressCallbacks.get(modelId).add(progressCallback);
        }
        
        try {
            console.log(`🔄 [WorkerManager] Загрузка модели ${modelId} через worker...`);
            
            const result = await this.sendMessage('loadModel', {
                modelId,
                modelConfig
            });
            
            console.log(`✅ [WorkerManager] Модель ${modelId} загружена`);
            return result;
            
        } finally {
            // Очищаем колбек прогресса
            if (progressCallback && this.progressCallbacks?.has(modelId)) {
                this.progressCallbacks.get(modelId).delete(progressCallback);
            }
        }
    }

    /**
     * Генерация embedding-вектора
     */
    async generateEmbedding(modelId, text, options = {}) {
        return await this.sendMessage('generateEmbedding', {
            modelId,
            text,
            options
        });
    }

    /**
     * Тестирование модели
     */
    async testModel(modelId, testText) {
        return await this.sendMessage('testModel', {
            modelId,
            testText
        });
    }

    /**
     * Выгрузка модели
     */
    async unloadModel(modelId) {
        return await this.sendMessage('unloadModel', {
            modelId
        });
    }

    /**
     * Получение статуса моделей
     */
    async getModelsStatus() {
        return await this.sendMessage('getStatus');
    }

    /**
     * Пакетная генерация embedding-векторов
     */
    async batchGenerateEmbeddings(texts, modelId, options = {}) {
        const { batchSize = 10, progressCallback } = options;
        const results = [];
        
        console.log(`🔄 [WorkerManager] Пакетная генерация для ${texts.length} текстов, размер пакета: ${batchSize}`);
        
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            
            // Параллельная обработка пакета
            const batchPromises = batch.map(text => 
                this.generateEmbedding(modelId, text)
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Колбек прогресса
            if (progressCallback) {
                const progress = Math.round(((i + batch.length) / texts.length) * 100);
                progressCallback({
                    stage: 'processing',
                    progress,
                    processed: i + batch.length,
                    total: texts.length
                });
            }
        }
        
        console.log(`✅ [WorkerManager] Пакетная генерация завершена (${results.length} векторов)`);
        return results;
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        
        // Отклоняем все ожидающие запросы
        for (const [id, request] of this.requestQueue) {
            request.reject(new Error('Worker был уничтожен'));
        }
        
        this.requestQueue.clear();
        this.progressCallbacks?.clear();
        
        console.log('🗑️ [WorkerManager] Embedding Worker уничтожен');
    }
}

// Экспорт в глобальную область видимости
window.EmbeddingWorkerManager = EmbeddingWorkerManager;