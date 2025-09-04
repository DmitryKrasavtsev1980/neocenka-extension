/**
 * Реестр embedding-моделей с поддержкой русскоязычных текстов
 * Управляет доступными моделями и их характеристиками
 */
class EmbeddingModelsRegistry {
    constructor() {
        this.models = {
            'all-MiniLM-L6-v2': {
                id: 'all-MiniLM-L6-v2',
                name: 'Universal Mini LM (L6)',
                fullName: 'sentence-transformers/all-MiniLM-L6-v2',
                dimensions: 384,
                languages: ['en', 'ru', 'de', 'fr', 'es'],
                performance: 'fast',
                accuracy: 'good',
                russianSupport: 'good',
                description: 'Быстрая универсальная модель, подходит для больших объемов данных',
                recommendedFor: ['bulk_processing', 'real_time'],
                avgProcessingTime: '50ms', // примерное время обработки одного текста
                memoryUsage: 'low',
                modelSize: '22MB'
            },
            'all-mpnet-base-v2': {
                id: 'all-mpnet-base-v2', 
                name: 'Universal MPNet Base',
                fullName: 'sentence-transformers/all-mpnet-base-v2',
                dimensions: 768,
                languages: ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt'],
                performance: 'medium',
                accuracy: 'excellent',
                russianSupport: 'excellent',
                description: 'Высококачественная модель с отличным пониманием семантики',
                recommendedFor: ['high_accuracy', 'detailed_analysis'],
                avgProcessingTime: '120ms',
                memoryUsage: 'medium',
                modelSize: '110MB'
            },
            'paraphrase-multilingual-MiniLM-L12-v2': {
                id: 'paraphrase-multilingual-MiniLM-L12-v2',
                name: 'Paraphrase Multilingual Mini LM',
                fullName: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
                dimensions: 384,
                languages: ['ru', 'en', 'de', 'fr', 'es', 'pl', 'uk', 'bg'],
                performance: 'fast',
                accuracy: 'very_good',
                russianSupport: 'native',
                description: 'Специально обученная для многоязычных текстов, идеальна для русского языка',
                recommendedFor: ['multilingual', 'russian_texts', 'paraphrase_detection'],
                avgProcessingTime: '70ms',
                memoryUsage: 'low',
                modelSize: '50MB'
            }
        };

        // Модель по умолчанию для русскоязычных текстов
        this.defaultModelForRussian = 'paraphrase-multilingual-MiniLM-L12-v2';
        this.defaultModel = 'all-MiniLM-L6-v2';
    }

    /**
     * Получить информацию о модели по ID
     * @param {string} modelId - ID модели
     * @returns {Object|null} Информация о модели или null
     */
    getModel(modelId) {
        return this.models[modelId] || null;
    }

    /**
     * Получить все доступные модели
     * @returns {Object} Объект с информацией о всех моделях
     */
    getAllModels() {
        return { ...this.models };
    }

    /**
     * Получить список ID всех моделей
     * @returns {string[]} Массив ID моделей
     */
    getModelIds() {
        return Object.keys(this.models);
    }

    /**
     * Получить модели, отсортированные по качеству поддержки русского языка
     * @returns {Object[]} Массив моделей, отсортированных по russianSupport
     */
    getModelsByRussianSupport() {
        const supportOrder = { 'native': 3, 'excellent': 2, 'good': 1, 'basic': 0 };
        
        return Object.values(this.models)
            .sort((a, b) => {
                const aSupport = supportOrder[a.russianSupport] || 0;
                const bSupport = supportOrder[b.russianSupport] || 0;
                return bSupport - aSupport;
            });
    }

    /**
     * Получить модели, отсортированные по производительности
     * @returns {Object[]} Массив моделей, отсортированных по производительности
     */
    getModelsByPerformance() {
        const perfOrder = { 'fast': 3, 'medium': 2, 'slow': 1 };
        
        return Object.values(this.models)
            .sort((a, b) => {
                const aPerf = perfOrder[a.performance] || 0;
                const bPerf = perfOrder[b.performance] || 0;
                return bPerf - aPerf;
            });
    }

    /**
     * Получить модели, отсортированные по точности
     * @returns {Object[]} Массив моделей, отсортированных по точности
     */
    getModelsByAccuracy() {
        const accOrder = { 'excellent': 4, 'very_good': 3, 'good': 2, 'basic': 1 };
        
        return Object.values(this.models)
            .sort((a, b) => {
                const aAcc = accOrder[a.accuracy] || 0;
                const bAcc = accOrder[b.accuracy] || 0;
                return bAcc - aAcc;
            });
    }

    /**
     * Получить рекомендуемую модель для конкретной задачи
     * @param {string} taskType - Тип задачи
     * @param {string} language - Язык текстов (опционально)
     * @returns {Object|null} Рекомендуемая модель
     */
    getRecommendedModel(taskType, language = null) {
        // Если указан русский язык, приоритет моделям с лучшей поддержкой русского
        if (language === 'ru' || language === 'russian') {
            const russianModels = this.getModelsByRussianSupport();
            
            // Ищем модель, которая подходит для задачи и хорошо работает с русским
            for (const model of russianModels) {
                if (model.recommendedFor.includes(taskType)) {
                    return model;
                }
            }
            
            // Если не нашли точного совпадения, возвращаем лучшую для русского
            return russianModels[0];
        }

        // Для других языков или общих задач
        const allModels = Object.values(this.models);
        
        for (const model of allModels) {
            if (model.recommendedFor.includes(taskType)) {
                return model;
            }
        }

        // Если не нашли подходящую, возвращаем модель по умолчанию
        return this.getModel(this.defaultModel);
    }

    /**
     * Получить модель по умолчанию
     * @param {string} language - Язык (опционально)
     * @returns {Object} Модель по умолчанию
     */
    getDefaultModel(language = null) {
        if (language === 'ru' || language === 'russian') {
            return this.getModel(this.defaultModelForRussian);
        }
        return this.getModel(this.defaultModel);
    }

    /**
     * Проверить, поддерживает ли модель конкретный язык
     * @param {string} modelId - ID модели
     * @param {string} language - Код языка (ru, en, etc.)
     * @returns {boolean} True, если язык поддерживается
     */
    supportsLanguage(modelId, language) {
        const model = this.getModel(modelId);
        return model ? model.languages.includes(language) : false;
    }

    /**
     * Получить модели для конкретного языка
     * @param {string} language - Код языка
     * @returns {Object[]} Массив моделей, поддерживающих язык
     */
    getModelsForLanguage(language) {
        return Object.values(this.models)
            .filter(model => model.languages.includes(language));
    }

    /**
     * Получить сравнительную таблицу характеристик моделей
     * @returns {Object[]} Массив с характеристиками для отображения в UI
     */
    getComparisonTable() {
        return Object.values(this.models).map(model => ({
            id: model.id,
            name: model.name,
            russianSupport: model.russianSupport,
            performance: model.performance,
            accuracy: model.accuracy,
            dimensions: model.dimensions,
            modelSize: model.modelSize,
            avgProcessingTime: model.avgProcessingTime,
            description: model.description
        }));
    }

    /**
     * Получить конфигурацию для загрузки модели в Transformers.js
     * @param {string} modelId - ID модели
     * @returns {Object|null} Конфигурация для загрузки
     */
    getTransformersConfig(modelId) {
        const model = this.getModel(modelId);
        if (!model) return null;

        return {
            model: model.fullName,
            revision: 'main',
            quantized: false, // Можно включить для уменьшения размера
            progress_callback: null, // Будет установлен при загрузке
            cache_dir: null, // Используется дефолтный кэш браузера
            local_files_only: false
        };
    }

    /**
     * Получить оптимальные настройки для обнаружения дубликатов
     * @param {string} modelId - ID модели
     * @returns {Object} Рекомендуемые настройки
     */
    getDuplicateDetectionSettings(modelId) {
        const model = this.getModel(modelId);
        if (!model) return null;

        // Базовые настройки в зависимости от характеристик модели
        const baseThresholds = {
            'excellent': { similarity: 0.85, prefilter: 0.70 },
            'very_good': { similarity: 0.80, prefilter: 0.65 },
            'good': { similarity: 0.75, prefilter: 0.60 },
            'basic': { similarity: 0.70, prefilter: 0.55 }
        };

        const thresholds = baseThresholds[model.accuracy] || baseThresholds['good'];

        return {
            similarityThreshold: thresholds.similarity,
            prefilterThreshold: thresholds.prefilter,
            batchSize: model.performance === 'fast' ? 50 : 25,
            maxCandidates: model.accuracy === 'excellent' ? 10 : 5,
            cacheEmbeddings: true,
            useProgressiveThresholds: model.russianSupport === 'native'
        };
    }

    /**
     * Валидация ID модели
     * @param {string} modelId - ID модели для проверки
     * @returns {boolean} True, если ID валидный
     */
    isValidModelId(modelId) {
        return this.models.hasOwnProperty(modelId);
    }

    /**
     * Получить статистику использования модели (заглушка для будущего функционала)
     * @param {string} modelId - ID модели
     * @returns {Object} Статистика использования
     */
    getModelStats(modelId) {
        // В будущем здесь может быть реальная статистика из IndexedDB
        return {
            modelId,
            totalUsages: 0,
            averageProcessingTime: 0,
            successRate: 100,
            lastUsed: null
        };
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmbeddingModelsRegistry;
} else {
    window.EmbeddingModelsRegistry = EmbeddingModelsRegistry;
}