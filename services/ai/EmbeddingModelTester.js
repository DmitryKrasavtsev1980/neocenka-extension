/**
 * Тестер качества embedding-моделей для определения дубликатов недвижимости
 * Позволяет сравнивать разные модели и собирать статистику качества
 */
class EmbeddingModelTester {
    constructor() {
        this.registry = new window.EmbeddingModelsRegistry();
        this.embeddingService = new window.EmbeddingService();
        this.hybridService = new window.HybridDuplicateDetectionService();
        this.results = new Map(); // modelId -> результаты тестирования
        
        this.testSampleSize = 50; // Размер выборки для тестирования
        this.dbName = 'neocenka-extension';
        this.testResultsStore = 'model_test_results';
        this.db = null;
        
        console.log('✅ [ModelTester] Инициализирован для тестирования embedding-моделей');
    }

    /**
     * Инициализация базы данных для хранения результатов тестирования
     */
    async initializeDatabase() {
        if (this.db) return;

        const request = indexedDB.open(this.dbName, 18);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains(this.testResultsStore)) {
                const store = db.createObjectStore(this.testResultsStore, { keyPath: 'id' });
                
                store.createIndex('modelId', 'modelId', { unique: false });
                store.createIndex('testDate', 'testDate', { unique: false });
                store.createIndex('accuracy', 'accuracy', { unique: false });
                
                console.log('✅ Создан store для результатов тестирования моделей');
            }
        };

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Запуск тестирования всех доступных моделей
     * @param {Function} progressCallback - Callback для отображения прогресса
     * @param {Object} filters - Фильтры для выборки тестовых данных
     * @returns {Promise<Object>} Результаты сравнения моделей
     */
    async testAllModels(progressCallback = null, filters = null) {
        await this.initializeDatabase();
        
        const models = this.registry.getModelIds();
        const testResults = {};
        
        console.log(`🧪 [ModelTester] Начинаем тестирование ${models.length} моделей embedding`);
        
        // Подготавливаем тестовую выборку
        const testSample = await this.prepareTestSample(filters);
        console.log(`📊 [ModelTester] Подготовлена тестовая выборка: ${testSample.length} пар объявлений`);
        
        for (let i = 0; i < models.length; i++) {
            const modelId = models[i];
            
            if (progressCallback) {
                progressCallback({
                    stage: 'testing_model',
                    currentModel: modelId,
                    modelIndex: i + 1,
                    totalModels: models.length,
                    progress: Math.round((i / models.length) * 100)
                });
            }
            
            console.log(`🔄 [ModelTester] Тестирование модели: ${modelId}`);
            
            try {
                const modelResult = await this.testSingleModel(modelId, testSample, progressCallback);
                testResults[modelId] = modelResult;
                
                // Сохраняем результат в базу данных
                await this.saveTestResult(modelId, modelResult);
                
            } catch (error) {
                console.error(`❌ [ModelTester] Ошибка тестирования модели ${modelId}:`, error);
                testResults[modelId] = {
                    error: error.message,
                    accuracy: 0,
                    precision: 0,
                    recall: 0,
                    f1Score: 0
                };
            }
        }
        
        // Анализируем результаты и выбираем лучшую модель
        const comparison = this.compareModels(testResults);
        
        if (progressCallback) {
            progressCallback({
                stage: 'completed',
                progress: 100,
                bestModel: comparison.bestModel,
                results: testResults
            });
        }
        
        console.log(`✅ [ModelTester] Тестирование завершено. Лучшая модель: ${comparison.bestModel.id}`);
        
        return comparison;
    }

    /**
     * Подготовка тестовой выборки из существующих данных
     */
    async prepareTestSample(filters = null) {
        // Получаем объявления из базы данных
        const listings = await this.getListingsForTesting(filters);
        
        // Создаем пары для тестирования (известные дубликаты + не дубликаты)
        const testPairs = [];
        
        // Группируем объявления по объектам недвижимости (известные дубликаты)
        const objectGroups = this.groupListingsByObject(listings);
        
        // Создаем позитивные примеры (дубликаты)
        let positivePairs = 0;
        for (const [objectId, objectListings] of objectGroups.entries()) {
            if (objectListings.length > 1 && positivePairs < this.testSampleSize / 2) {
                // Создаем пары из объявлений одного объекта
                for (let i = 0; i < objectListings.length - 1; i++) {
                    for (let j = i + 1; j < objectListings.length; j++) {
                        if (positivePairs < this.testSampleSize / 2) {
                            testPairs.push({
                                listing1: objectListings[i],
                                listing2: objectListings[j],
                                isDuplicate: true,
                                source: 'existing_object'
                            });
                            positivePairs++;
                        }
                    }
                }
            }
        }
        
        // Создаем негативные примеры (не дубликаты)
        let negativePairs = 0;
        const allListings = Array.from(listings);
        while (negativePairs < this.testSampleSize / 2 && negativePairs < allListings.length * 0.1) {
            const listing1 = allListings[Math.floor(Math.random() * allListings.length)];
            const listing2 = allListings[Math.floor(Math.random() * allListings.length)];
            
            // Проверяем что это разные объекты
            if (listing1.id !== listing2.id && listing1.object_id !== listing2.object_id) {
                testPairs.push({
                    listing1,
                    listing2,
                    isDuplicate: false,
                    source: 'random_pair'
                });
                negativePairs++;
            }
        }
        
        console.log(`📊 [ModelTester] Создано ${positivePairs} позитивных и ${negativePairs} негативных примеров`);
        
        return testPairs;
    }

    /**
     * Тестирование одной модели
     */
    async testSingleModel(modelId, testSample, progressCallback = null) {
        const startTime = Date.now();
        const results = {
            modelId,
            testDate: new Date(),
            totalTests: testSample.length,
            truePositives: 0,  // Правильно найденные дубликаты
            falsePositives: 0, // Ложно найденные дубликаты  
            trueNegatives: 0,  // Правильно отклоненные не-дубликаты
            falseNegatives: 0, // Пропущенные дубликаты
            processingTimes: [],
            similarities: []
        };
        
        // Временно переключаемся на тестируемую модель
        const originalModel = this.hybridService.settings.embeddingModelId;
        this.hybridService.settings.embeddingModelId = modelId;
        
        for (let i = 0; i < testSample.length; i++) {
            const testPair = testSample[i];
            
            if (progressCallback && i % 10 === 0) {
                progressCallback({
                    stage: 'processing_pair',
                    currentModel: modelId,
                    pairIndex: i + 1,
                    totalPairs: testSample.length,
                    progress: Math.round((i / testSample.length) * 100)
                });
            }
            
            try {
                const pairStartTime = Date.now();
                
                // Генерируем embedding для обоих объявлений
                const embedding1 = await this.embeddingService.generateEmbedding(
                    this.prepareTextForEmbedding(testPair.listing1), 
                    modelId
                );
                const embedding2 = await this.embeddingService.generateEmbedding(
                    this.prepareTextForEmbedding(testPair.listing2), 
                    modelId
                );
                
                // Вычисляем сходство
                const similarity = this.embeddingService.calculateCosineSimilarity(embedding1, embedding2);
                
                const processingTime = Date.now() - pairStartTime;
                results.processingTimes.push(processingTime);
                results.similarities.push({ similarity, actual: testPair.isDuplicate });
                
                // Определяем результат по порогу (используем текущий порог системы)
                const predicted = similarity >= this.hybridService.settings.embeddingThreshold;
                const actual = testPair.isDuplicate;
                
                // Обновляем метрики
                if (predicted && actual) {
                    results.truePositives++;
                } else if (predicted && !actual) {
                    results.falsePositives++;
                } else if (!predicted && !actual) {
                    results.trueNegatives++;
                } else if (!predicted && actual) {
                    results.falseNegatives++;
                }
                
            } catch (error) {
                console.error(`❌ [ModelTester] Ошибка обработки пары ${i} для модели ${modelId}:`, error);
            }
        }
        
        // Восстанавливаем оригинальную модель
        this.hybridService.settings.embeddingModelId = originalModel;
        
        // Вычисляем финальные метрики
        const precision = results.truePositives / (results.truePositives + results.falsePositives) || 0;
        const recall = results.truePositives / (results.truePositives + results.falseNegatives) || 0;
        const accuracy = (results.truePositives + results.trueNegatives) / results.totalTests || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
        
        const avgProcessingTime = results.processingTimes.reduce((a, b) => a + b, 0) / results.processingTimes.length;
        const totalTime = Date.now() - startTime;
        
        return {
            ...results,
            precision: Math.round(precision * 1000) / 1000,
            recall: Math.round(recall * 1000) / 1000,
            accuracy: Math.round(accuracy * 1000) / 1000,
            f1Score: Math.round(f1Score * 1000) / 1000,
            avgProcessingTime: Math.round(avgProcessingTime),
            totalTime,
            threshold: this.hybridService.settings.embeddingThreshold
        };
    }

    /**
     * Подготовка текста объявления для embedding
     */
    prepareTextForEmbedding(listing) {
        const parts = [];
        
        if (listing.description) {
            parts.push(listing.description);
        }
        
        // Добавляем структурированную информацию
        if (listing.rooms) parts.push(`${listing.rooms} комнаты`);
        if (listing.area_total) parts.push(`${listing.area_total}м²`);
        if (listing.floor) parts.push(`${listing.floor} этаж`);
        if (listing.property_type) parts.push(listing.property_type);
        
        return parts.join(' ');
    }

    /**
     * Сравнение результатов моделей и выбор лучшей
     */
    compareModels(results) {
        const models = Object.keys(results);
        let bestModel = null;
        let bestScore = -1;
        
        const comparison = {
            models: {},
            ranking: [],
            bestModel: null,
            recommendation: ''
        };
        
        for (const modelId of models) {
            const result = results[modelId];
            
            if (result.error) {
                comparison.models[modelId] = {
                    ...result,
                    overallScore: 0,
                    recommendation: 'Ошибка при тестировании'
                };
                continue;
            }
            
            // Вычисляем общий балл (вес на F1-score и время обработки)
            const f1Weight = 0.7;
            const speedWeight = 0.3;
            const maxTime = 200; // Максимальное время для нормализации
            
            const normalizedSpeed = Math.max(0, (maxTime - result.avgProcessingTime) / maxTime);
            const overallScore = (result.f1Score * f1Weight) + (normalizedSpeed * speedWeight);
            
            comparison.models[modelId] = {
                ...result,
                overallScore: Math.round(overallScore * 1000) / 1000,
                recommendation: this.getModelRecommendation(result)
            };
            
            if (overallScore > bestScore) {
                bestScore = overallScore;
                bestModel = {
                    id: modelId,
                    score: overallScore,
                    ...result
                };
            }
        }
        
        // Сортируем по общему баллу
        comparison.ranking = models
            .filter(id => !results[id].error)
            .sort((a, b) => comparison.models[b].overallScore - comparison.models[a].overallScore);
        
        comparison.bestModel = bestModel;
        comparison.recommendation = this.generateOverallRecommendation(comparison);
        
        return comparison;
    }

    /**
     * Генерация рекомендации для модели
     */
    getModelRecommendation(result) {
        if (result.f1Score > 0.8 && result.avgProcessingTime < 100) {
            return 'Отличное качество и скорость - рекомендуется для продакшена';
        } else if (result.f1Score > 0.75) {
            return 'Хорошее качество - подходит для точных задач';
        } else if (result.avgProcessingTime < 70) {
            return 'Быстрая модель - подходит для массовой обработки';
        } else {
            return 'Требует дополнительной настройки параметров';
        }
    }

    /**
     * Генерация общей рекомендации
     */
    generateOverallRecommendation(comparison) {
        const best = comparison.bestModel;
        if (!best) return 'Не удалось определить лучшую модель';
        
        const modelInfo = this.registry.getModel(best.id);
        return `Рекомендуется модель ${modelInfo.name} с F1-score ${best.f1Score} и временем обработки ${best.avgProcessingTime}мс. ${comparison.models[best.id].recommendation}`;
    }

    /**
     * Получение объявлений для тестирования
     */
    async getListingsForTesting(filters = null) {
        if (!window.db) {
            throw new Error('База данных не инициализирована');
        }
        
        // Получаем обработанные объявления (у которых есть object_id)
        const processedListings = await window.db.getByIndex('listings', 'processing_status', 'processed');
        
        // Фильтруем по переданным критериям
        if (filters) {
            return processedListings.filter(listing => {
                if (filters.addressId && listing.address_id !== filters.addressId) return false;
                if (filters.propertyType && listing.property_type !== filters.propertyType) return false;
                if (filters.minPrice && listing.price < filters.minPrice) return false;
                if (filters.maxPrice && listing.price > filters.maxPrice) return false;
                return true;
            });
        }
        
        return processedListings.slice(0, this.testSampleSize * 10); // Берем больше для создания пар
    }

    /**
     * Группировка объявлений по объектам недвижимости
     */
    groupListingsByObject(listings) {
        const groups = new Map();
        
        for (const listing of listings) {
            if (listing.object_id) {
                if (!groups.has(listing.object_id)) {
                    groups.set(listing.object_id, []);
                }
                groups.get(listing.object_id).push(listing);
            }
        }
        
        return groups;
    }

    /**
     * Сохранение результата тестирования в базу данных
     */
    async saveTestResult(modelId, result) {
        if (!this.db) await this.initializeDatabase();
        
        const testRecord = {
            id: `${modelId}_${Date.now()}`,
            modelId,
            testDate: result.testDate,
            accuracy: result.accuracy,
            precision: result.precision,
            recall: result.recall,
            f1Score: result.f1Score,
            avgProcessingTime: result.avgProcessingTime,
            totalTime: result.totalTime,
            totalTests: result.totalTests,
            threshold: result.threshold
        };
        
        const transaction = this.db.transaction([this.testResultsStore], 'readwrite');
        const store = transaction.objectStore(this.testResultsStore);
        await store.put(testRecord);
        
        console.log(`💾 [ModelTester] Сохранен результат тестирования для модели ${modelId}`);
    }

    /**
     * Получение истории тестирований модели
     */
    async getTestHistory(modelId = null) {
        if (!this.db) await this.initializeDatabase();
        
        const transaction = this.db.transaction([this.testResultsStore], 'readonly');
        const store = transaction.objectStore(this.testResultsStore);
        
        if (modelId) {
            const index = store.index('modelId');
            return new Promise((resolve) => {
                const request = index.getAll(modelId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve([]);
            });
        } else {
            return new Promise((resolve) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve([]);
            });
        }
    }
}

// Экспорт в глобальную область видимости
window.EmbeddingModelTester = EmbeddingModelTester;