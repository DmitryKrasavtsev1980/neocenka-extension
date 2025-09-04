/**
 * Web Worker для работы с Transformers.js embedding моделями
 * Использует ES6 modules в изолированном контексте worker'а
 */

// Импортируем Transformers.js из CDN (в worker можно обойти CSP)
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1/dist/transformers.js';

// Настройки окружения для Chrome Extension
env.allowRemoteModels = true;
env.allowLocalModels = false;

// Кэш загруженных моделей
const modelCache = new Map();

// Настройка обработки сообщений от главного потока
self.onmessage = async function(e) {
    const { id, action, data } = e.data;
    
    try {
        let result;
        
        switch (action) {
            case 'loadModel':
                result = await loadModel(data.modelId, data.modelConfig);
                break;
                
            case 'generateEmbedding':
                result = await generateEmbedding(data.modelId, data.text, data.options);
                break;
                
            case 'testModel':
                result = await testModel(data.modelId, data.testText);
                break;
                
            case 'unloadModel':
                result = unloadModel(data.modelId);
                break;
                
            case 'getStatus':
                result = getModelsStatus();
                break;
                
            default:
                throw new Error(`Unknown action: ${action}`);
        }
        
        // Отправляем успешный результат
        self.postMessage({
            id,
            success: true,
            result
        });
        
    } catch (error) {
        // Отправляем ошибку
        self.postMessage({
            id,
            success: false,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
};

/**
 * Загрузка модели
 */
async function loadModel(modelId, modelConfig) {
    console.log(`🔄 [Worker] Загрузка модели ${modelId}...`);
    
    try {
        // Создаем пайплайн для feature extraction
        const model = await pipeline('feature-extraction', modelConfig.fullName, {
            // Колбек прогресса
            progress_callback: (progress) => {
                self.postMessage({
                    type: 'progress',
                    modelId,
                    progress: {
                        stage: 'downloading',
                        progress: Math.round((progress.loaded / progress.total) * 100),
                        loaded: progress.loaded,
                        total: progress.total
                    }
                });
            }
        });
        
        // Сохраняем в кэш
        modelCache.set(modelId, {
            model,
            config: modelConfig,
            loadedAt: new Date()
        });
        
        console.log(`✅ [Worker] Модель ${modelId} загружена`);
        
        return {
            success: true,
            modelId,
            loadedAt: new Date(),
            memoryUsage: getMemoryUsage()
        };
        
    } catch (error) {
        console.error(`❌ [Worker] Ошибка загрузки модели ${modelId}:`, error);
        throw error;
    }
}

/**
 * Генерация embedding-вектора
 */
async function generateEmbedding(modelId, text, options = {}) {
    const cached = modelCache.get(modelId);
    if (!cached) {
        throw new Error(`Модель ${modelId} не загружена`);
    }
    
    try {
        console.log(`🔄 [Worker] Генерация embedding для текста (${text.length} символов)`);
        
        const startTime = Date.now();
        
        // Генерируем embedding
        const output = await cached.model(text, {
            pooling: 'mean',
            normalize: true,
            ...options
        });
        
        const processingTime = Date.now() - startTime;
        
        // Преобразуем в обычный массив
        const vector = Array.from(output.data);
        
        console.log(`✅ [Worker] Embedding сгенерирован (${vector.length} измерений, ${processingTime}ms)`);
        
        return {
            vector,
            dimensions: vector.length,
            processingTime,
            modelId
        };
        
    } catch (error) {
        console.error(`❌ [Worker] Ошибка генерации embedding:`, error);
        throw error;
    }
}

/**
 * Тестирование модели
 */
async function testModel(modelId, testText = "Тест модели на русском языке") {
    const cached = modelCache.get(modelId);
    if (!cached) {
        throw new Error(`Модель ${modelId} не загружена`);
    }
    
    try {
        const startTime = Date.now();
        const result = await generateEmbedding(modelId, testText);
        const totalTime = Date.now() - startTime;
        
        return {
            success: true,
            modelId,
            dimensions: result.dimensions,
            processingTime: totalTime,
            vectorSample: result.vector.slice(0, 5), // Первые 5 значений
            testText
        };
        
    } catch (error) {
        return {
            success: false,
            modelId,
            error: error.message
        };
    }
}

/**
 * Выгрузка модели из памяти
 */
function unloadModel(modelId) {
    const wasLoaded = modelCache.has(modelId);
    modelCache.delete(modelId);
    
    // Принудительная очистка памяти (если поддерживается)
    if (typeof gc === 'function') {
        gc();
    }
    
    console.log(`🗑️ [Worker] Модель ${modelId} ${wasLoaded ? 'выгружена' : 'не была загружена'}`);
    
    return {
        success: true,
        wasLoaded,
        memoryUsage: getMemoryUsage()
    };
}

/**
 * Получение статуса всех моделей
 */
function getModelsStatus() {
    const loaded = Array.from(modelCache.keys());
    
    return {
        loaded,
        count: loaded.length,
        memoryUsage: getMemoryUsage(),
        models: Object.fromEntries(
            Array.from(modelCache.entries()).map(([id, data]) => [
                id, 
                {
                    modelId: id,
                    loadedAt: data.loadedAt,
                    config: data.config
                }
            ])
        )
    };
}

/**
 * Получение информации об использовании памяти (если доступно)
 */
function getMemoryUsage() {
    if ('performance' in self && 'memory' in performance) {
        return {
            used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024), // MB
            total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024), // MB
            limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) // MB
        };
    }
    return null;
}

console.log('🚀 [Worker] Embedding Worker инициализирован');