/**
 * Сервис для работы с embedding-моделями
 * Поддерживает множественные модели, кэширование и пакетную обработку
 */

class EmbeddingService {
    constructor() {
        this.modelsRegistry = new window.EmbeddingModelsRegistry();
        this.modelManager = new window.EmbeddingModelManagerWorker();
        this.dbName = 'neocenka-extension';
        this.embeddingCacheStore = 'embedding_cache';
        this.db = null;
        
        this.initializeDatabase();
    }

    /**
     * Инициализация базы данных для кэширования embedding-векторов
     * @private
     */
    async initializeDatabase() {
        if (this.db) return;

        const request = indexedDB.open(this.dbName, 18);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Создаем store для кэширования embedding-векторов, если его нет
            if (!db.objectStoreNames.contains(this.embeddingCacheStore)) {
                const store = db.createObjectStore(this.embeddingCacheStore, { keyPath: 'id' });
                
                store.createIndex('textHash', 'textHash', { unique: false });
                store.createIndex('modelId', 'modelId', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                
                console.log('✅ Создан store для кэширования embedding-векторов');
            }
        };

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ База данных для EmbeddingService инициализирована');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Загрузка модели через менеджер моделей
     * @param {string} modelId - ID модели для загрузки
     * @param {Function} progressCallback - Callback для прогресса загрузки
     * @returns {Promise<Object>} Загруженная модель
     */
    async loadModel(modelId, progressCallback = null) {
        return await this.modelManager.loadEmbeddingModel(modelId, progressCallback);
    }

    /**
     * Генерация хэша для текста
     * @param {string} text - Исходный текст
     * @returns {Promise<string>} SHA-256 хэш текста
     * @private
     */
    async generateTextHash(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text.trim().toLowerCase());
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Сохранение embedding-вектора в кэш
     * @param {string} text - Исходный текст
     * @param {string} modelId - ID модели
     * @param {number[]} vector - Embedding-вектор
     * @private
     */
    async cacheEmbedding(text, modelId, vector) {
        if (!this.db) await this.initializeDatabase();

        const textHash = await this.generateTextHash(text);
        const cacheEntry = {
            id: `${textHash}_${modelId}_${Date.now()}`,
            textHash,
            modelId,
            vector,
            dimensions: vector.length,
            createdAt: Date.now(),
            textLength: text.length
        };

        const transaction = this.db.transaction([this.embeddingCacheStore], 'readwrite');
        const store = transaction.objectStore(this.embeddingCacheStore);
        
        try {
            await store.put(cacheEntry);
        } catch (error) {
            console.warn('⚠️ Ошибка кэширования embedding-вектора:', error);
        }
    }

    /**
     * Получение embedding-вектора из кэша
     * @param {string} text - Исходный текст
     * @param {string} modelId - ID модели
     * @returns {Promise<number[]|null>} Embedding-вектор или null
     * @private
     */
    async getCachedEmbedding(text, modelId) {
        if (!this.db) await this.initializeDatabase();

        const textHash = await this.generateTextHash(text);
        const transaction = this.db.transaction([this.embeddingCacheStore], 'readonly');
        const store = transaction.objectStore(this.embeddingCacheStore);
        const index = store.index('textHash');

        return new Promise((resolve) => {
            const request = index.getAll(textHash);
            
            request.onsuccess = () => {
                const entries = request.result;
                
                // Ищем запись для нужной модели
                const cachedEntry = entries.find(entry => entry.modelId === modelId);
                
                if (cachedEntry) {
                    resolve(cachedEntry.vector);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => resolve(null);
        });
    }

    /**
     * Генерация embedding-вектора для текста
     * @param {string} text - Исходный текст
     * @param {string} modelId - ID модели
     * @param {boolean} useCache - Использовать кэш (по умолчанию true)
     * @returns {Promise<number[]>} Embedding-вектор
     */
    async generateEmbedding(text, modelId, useCache = true) {
        if (!text || typeof text !== 'string') {
            throw new Error('Текст для генерации embedding должен быть непустой строкой');
        }

        if (!this.modelsRegistry.isValidModelId(modelId)) {
            throw new Error(`Неизвестная модель: ${modelId}`);
        }

        // Проверяем кэш
        if (useCache) {
            const cachedVector = await this.getCachedEmbedding(text, modelId);
            if (cachedVector) {
                return cachedVector;
            }
        }

        try {
            
            // Генерируем embedding через modelManager (EmbeddingModelManagerWorker)
            const vector = await this.modelManager.generateEmbedding(modelId, text);
            
            // Кэшируем результат
            if (useCache) {
                await this.cacheEmbedding(text, modelId, vector);
            }
            
            return vector;
            
        } catch (error) {
            console.error(`❌ Ошибка генерации embedding:`, error);
            throw error;
        }
    }

    /**
     * Пакетная генерация embedding-векторов
     * @param {string[]} texts - Массив текстов
     * @param {string} modelId - ID модели
     * @param {Object} options - Опции обработки
     * @returns {Promise<number[][]>} Массив embedding-векторов
     */
    async batchGenerateEmbeddings(texts, modelId, options = {}) {
        const { 
            useCache = true, 
            batchSize = 10, 
            progressCallback = null,
            skipEmpty = true 
        } = options;

        if (!Array.isArray(texts)) {
            throw new Error('texts должен быть массивом строк');
        }

        const filteredTexts = skipEmpty ? 
            texts.filter(text => text && typeof text === 'string' && text.trim()) : 
            texts;

        if (filteredTexts.length === 0) {
            return [];
        }

        const results = [];
        const totalBatches = Math.ceil(filteredTexts.length / batchSize);
        

        for (let i = 0; i < filteredTexts.length; i += batchSize) {
            const batch = filteredTexts.slice(i, i + batchSize);
            const batchIndex = Math.floor(i / batchSize) + 1;
            

            // Обрабатываем пакет параллельно
            const batchPromises = batch.map(text => 
                this.generateEmbedding(text, modelId, useCache)
            );

            try {
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Вызываем callback прогресса
                if (progressCallback && typeof progressCallback === 'function') {
                    progressCallback({
                        processed: results.length,
                        total: filteredTexts.length,
                        currentBatch: batchIndex,
                        totalBatches,
                        progress: (results.length / filteredTexts.length) * 100
                    });
                }
            } catch (error) {
                console.error(`❌ Ошибка в пакете ${batchIndex}:`, error);
                throw error;
            }

            // Небольшая пауза между пакетами для предотвращения перегрузки
            if (i + batchSize < filteredTexts.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return results;
    }

    /**
     * Вычисление косинусного сходства между двумя векторами
     * @param {number[]} vector1 - Первый вектор
     * @param {number[]} vector2 - Второй вектор
     * @returns {number} Косинусное сходство от -1 до 1
     */
    calculateCosineSimilarity(vector1, vector2) {
        if (!Array.isArray(vector1) || !Array.isArray(vector2)) {
            throw new Error('Векторы должны быть массивами чисел');
        }

        if (vector1.length !== vector2.length) {
            throw new Error('Векторы должны иметь одинаковую размерность');
        }

        if (vector1.length === 0) {
            return 0;
        }

        // Скалярное произведение
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i];
            norm1 += vector1[i] * vector1[i];
            norm2 += vector2[i] * vector2[i];
        }

        // Избегаем деления на ноль
        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Поиск наиболее похожих векторов
     * @param {number[]} targetVector - Целевой вектор
     * @param {Array<{vector: number[], data: any}>} vectorDatabase - База векторов
     * @param {number} threshold - Минимальный порог сходства
     * @param {number} maxResults - Максимальное количество результатов
     * @returns {Array<{similarity: number, data: any}>} Массив похожих векторов
     */
    findSimilarVectors(targetVector, vectorDatabase, threshold = 0.7, maxResults = 10) {
        if (!Array.isArray(vectorDatabase)) {
            throw new Error('vectorDatabase должен быть массивом');
        }

        const similarities = vectorDatabase
            .map(item => ({
                similarity: this.calculateCosineSimilarity(targetVector, item.vector),
                data: item.data
            }))
            .filter(item => item.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);

        return similarities;
    }

    /**
     * Получение статистики кэша
     * @param {string} modelId - ID модели (опционально)
     * @returns {Promise<Object>} Статистика кэша
     */
    async getCacheStats(modelId = null) {
        if (!this.db) await this.initializeDatabase();

        const transaction = this.db.transaction([this.embeddingCacheStore], 'readonly');
        const store = transaction.objectStore(this.embeddingCacheStore);

        return new Promise((resolve) => {
            const request = store.getAll();
            
            request.onsuccess = () => {
                const allEntries = request.result;
                let filteredEntries = allEntries;
                
                if (modelId) {
                    filteredEntries = allEntries.filter(entry => entry.modelId === modelId);
                }

                const stats = {
                    totalEntries: filteredEntries.length,
                    totalSize: filteredEntries.reduce((sum, entry) => sum + entry.vector.length * 8, 0), // примерный размер
                    modelBreakdown: {},
                    oldestEntry: null,
                    newestEntry: null
                };

                // Разбивка по моделям
                allEntries.forEach(entry => {
                    if (!stats.modelBreakdown[entry.modelId]) {
                        stats.modelBreakdown[entry.modelId] = 0;
                    }
                    stats.modelBreakdown[entry.modelId]++;
                });

                // Найдем самую старую и новую записи
                if (filteredEntries.length > 0) {
                    filteredEntries.sort((a, b) => a.createdAt - b.createdAt);
                    stats.oldestEntry = new Date(filteredEntries[0].createdAt);
                    stats.newestEntry = new Date(filteredEntries[filteredEntries.length - 1].createdAt);
                }

                resolve(stats);
            };
            
            request.onerror = () => resolve({
                totalEntries: 0,
                totalSize: 0,
                modelBreakdown: {},
                oldestEntry: null,
                newestEntry: null
            });
        });
    }

    /**
     * Очистка кэша
     * @param {string} modelId - ID модели (если не указан, очищает весь кэш)
     * @param {number} olderThanDays - Удалить записи старше указанного количества дней
     * @returns {Promise<number>} Количество удаленных записей
     */
    async clearCache(modelId = null, olderThanDays = null) {
        if (!this.db) await this.initializeDatabase();

        const transaction = this.db.transaction([this.embeddingCacheStore], 'readwrite');
        const store = transaction.objectStore(this.embeddingCacheStore);

        return new Promise((resolve) => {
            let deletedCount = 0;
            const request = store.getAll();
            
            request.onsuccess = () => {
                const allEntries = request.result;
                const cutoffDate = olderThanDays ? Date.now() - (olderThanDays * 24 * 60 * 60 * 1000) : null;
                
                const entriesToDelete = allEntries.filter(entry => {
                    const matchesModel = !modelId || entry.modelId === modelId;
                    const matchesAge = !cutoffDate || entry.createdAt < cutoffDate;
                    return matchesModel && matchesAge;
                });

                // Удаляем записи
                const deletePromises = entriesToDelete.map(entry => {
                    return new Promise((resolveDelete) => {
                        const deleteRequest = store.delete(entry.id);
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            resolveDelete();
                        };
                        deleteRequest.onerror = () => resolveDelete();
                    });
                });

                Promise.all(deletePromises).then(() => {
                    console.log(`🗑️ Удалено ${deletedCount} записей из кэша embedding-векторов`);
                    resolve(deletedCount);
                });
            };
            
            request.onerror = () => resolve(0);
        });
    }

    /**
     * Освобождение ресурсов
     */
    dispose() {
        // Очищаем кэш загруженных моделей
        this.loadedModels.clear();
        
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        
        console.log('🔄 EmbeddingService освобожден');
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmbeddingService;
} else {
    window.EmbeddingService = EmbeddingService;
}