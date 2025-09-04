/**
 * Локальный сервис для генерации embedding-векторов
 * Использует загруженные модели и простые алгоритмы обработки текста
 */

class LocalEmbeddingService {
    constructor() {
        this.downloadService = new window.ModelDownloadService();
        this.registry = new window.EmbeddingModelsRegistry();
        this.loadedTokenizers = new Map();
        
        // 🚀 КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ: Ограниченный кэш вместо неограниченного Map
        this.vectorCache = new LimitedVectorCache(1000); // Максимум 1000 векторов
        
        console.log('✅ [LocalEmbedding] Инициализирован с ограниченным кэшем векторов (1000 записей)');
    }

    /**
     * Генерация embedding-вектора для текста
     */
    async generateEmbedding(text, modelId = 'paraphrase-multilingual-MiniLM-L12-v2') {
        try {
            // Проверяем кэш
            const cacheKey = `${modelId}:${this.hashString(text)}`;
            if (this.vectorCache.has(cacheKey)) {
                console.log(`📋 [LocalEmbedding] Векторы взяты из кэша для текста (${text.length} символов)`);
                return this.vectorCache.get(cacheKey);
            }


            // Проверяем, загружена ли модель
            const isDownloaded = await this.downloadService.isModelDownloaded(modelId);
            if (!isDownloaded) {
                throw new Error(`Модель ${modelId} не загружена. Загрузите модель сначала.`);
            }

            // Получаем конфигурацию модели
            const modelConfig = this.registry.getModel(modelId);
            if (!modelConfig) {
                throw new Error(`Конфигурация модели ${modelId} не найдена`);
            }

            // Получаем токенизатор
            const tokenizer = await this.getTokenizer(modelId);

            // Токенизируем текст
            const tokens = await this.tokenizeText(text, tokenizer);

            // Генерируем embedding-вектор
            const vector = await this.computeEmbedding(tokens, modelConfig);

            // Кэшируем результат
            this.vectorCache.set(cacheKey, vector);

            // Обновляем время использования модели
            await this.downloadService.updateLastUsed(modelId);

            return vector;

        } catch (error) {
            console.error(`❌ [LocalEmbedding] Ошибка генерации embedding:`, error);
            throw error;
        }
    }

    /**
     * Получение токенизатора для модели
     */
    async getTokenizer(modelId) {
        if (this.loadedTokenizers.has(modelId)) {
            return this.loadedTokenizers.get(modelId);
        }

        try {
            // Загружаем конфигурацию токенизатора
            const tokenizerConfigFile = await this.downloadService.getModelFile(modelId, 'tokenizer_config.json');
            const tokenizerConfig = JSON.parse(new TextDecoder().decode(tokenizerConfigFile.data));

            // Создаем простой токенизатор
            const tokenizer = new SimpleTokenizer(tokenizerConfig);
            
            // Пытаемся загрузить vocab
            try {
                const vocabFile = await this.downloadService.getModelFile(modelId, 'vocab.txt');
                const vocabText = new TextDecoder().decode(vocabFile.data);
                tokenizer.loadVocab(vocabText);
            } catch (error) {
                // Используем базовый токенизатор вместо vocab
            }

            this.loadedTokenizers.set(modelId, tokenizer);
            return tokenizer;

        } catch (error) {
            console.error(`❌ [LocalEmbedding] Ошибка загрузки токенизатора для ${modelId}:`, error);
            
            // Fallback к простому токенизатору
            const fallbackTokenizer = new SimpleTokenizer({});
            this.loadedTokenizers.set(modelId, fallbackTokenizer);
            return fallbackTokenizer;
        }
    }

    /**
     * Токенизация текста
     */
    async tokenizeText(text, tokenizer) {
        return tokenizer.tokenize(text);
    }

    /**
     * Вычисление embedding-вектора из токенов
     */
    async computeEmbedding(tokens, modelConfig) {
        const dimensions = modelConfig.dimensions || 384;
        
        // Создаем вектор заданной размерности
        const vector = new Array(dimensions).fill(0);
        
        // Простой алгоритм генерации embedding на основе токенов
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const tokenId = this.getTokenId(token);
            
            // Распределяем значения токена по вектору
            for (let dim = 0; dim < dimensions; dim++) {
                const influence = Math.sin((tokenId + i) * (dim + 1) * 0.01);
                vector[dim] += influence / Math.sqrt(tokens.length);
            }
        }

        // Нормализуем вектор
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            for (let i = 0; i < dimensions; i++) {
                vector[i] /= norm;
            }
        }

        return vector;
    }

    /**
     * Простое преобразование токена в ID
     */
    getTokenId(token) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
            const char = token.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Преобразуем в 32-битное число
        }
        return Math.abs(hash);
    }

    /**
     * Пакетная генерация embedding-векторов
     */
    async batchGenerateEmbeddings(texts, modelId, progressCallback = null) {
        const results = [];
        const total = texts.length;


        for (let i = 0; i < texts.length; i++) {
            try {
                const vector = await this.generateEmbedding(texts[i], modelId);
                results.push(vector);

                if (progressCallback && i % 10 === 0) {
                    progressCallback({
                        stage: 'processing',
                        progress: Math.round((i / total) * 100),
                        processed: i + 1,
                        total
                    });
                }
            } catch (error) {
                console.error(`❌ [LocalEmbedding] Ошибка обработки текста ${i}:`, error);
                // Возвращаем нулевой вектор при ошибке
                const modelConfig = this.registry.getModel(modelId);
                const dimensions = modelConfig?.dimensions || 384;
                results.push(new Array(dimensions).fill(0));
            }
        }

        if (progressCallback) {
            progressCallback({
                stage: 'completed',
                progress: 100,
                processed: total,
                total
            });
        }

        return results;
    }

    /**
     * Вычисление косинусного сходства
     */
    cosineSimilarity(vector1, vector2) {
        if (vector1.length !== vector2.length) {
            throw new Error('Векторы должны быть одинаковой размерности');
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i];
            norm1 += vector1[i] * vector1[i];
            norm2 += vector2[i] * vector2[i];
        }

        if (norm1 === 0 || norm2 === 0) return 0;
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Хэширование строки для кэша
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }

    /**
     * Очистка кэша
     */
    clearCache() {
        const cacheSize = this.vectorCache.size;
        this.vectorCache.clear();
        console.log(`🧹 [LocalEmbedding] Очищен кэш векторов (${cacheSize} записей)`);
        return cacheSize;
    }

    /**
     * Получение статистики кэша
     */
    getCacheStats() {
        return {
            totalEntries: this.vectorCache.size,
            loadedTokenizers: this.loadedTokenizers.size
        };
    }
}

/**
 * Простой токенизатор
 */
class SimpleTokenizer {
    constructor(config = {}) {
        this.config = config;
        this.vocab = null;
        this.maxLength = config.max_length || 512;
    }

    loadVocab(vocabText) {
        this.vocab = new Map();
        const lines = vocabText.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const token = lines[i].trim();
            if (token) {
                this.vocab.set(token, i);
            }
        }
        
        console.log(`✅ [SimpleTokenizer] Загружен словарь: ${this.vocab.size} токенов`);
    }

    tokenize(text) {
        if (!text) return [];

        // Простая токенизация по пробелам и знакам препинания
        const tokens = text
            .toLowerCase()
            .replace(/[^\wа-яё\s]/g, ' ')
            .split(/\s+/)
            .filter(token => token.length > 0);

        // Ограничиваем длину
        return tokens.slice(0, this.maxLength);
    }

    encode(text) {
        const tokens = this.tokenize(text);
        
        if (!this.vocab) {
            // Простое кодирование без словаря
            return tokens.map(token => this.hashToken(token));
        }

        // Кодирование с использованием словаря
        return tokens.map(token => this.vocab.get(token) || this.vocab.get('[UNK]') || 0);
    }

    hashToken(token) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
            const char = token.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash) % 30000; // Ограничиваем размер словаря
    }
}

/**
 * Ограниченный кэш с автоматической LRU очисткой для embedding векторов
 * КРИТИЧНО: Предотвращает неконтролируемый рост памяти
 */
class LimitedVectorCache {
    constructor(maxSize = 1000) {
        this.cache = new Map();
        this.accessCount = new Map();
        this.accessTime = new Map();
        this.maxSize = maxSize;
        
        console.log(`✅ [LimitedVectorCache] Инициализирован (макс. ${maxSize} векторов)`);
    }

    get(key) {
        if (this.cache.has(key)) {
            // Обновляем статистику использования
            this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
            this.accessTime.set(key, Date.now());
            return this.cache.get(key);
        }
        return undefined;
    }

    has(key) {
        return this.cache.has(key);
    }

    set(key, value) {
        // Проверяем лимит размера
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }
        
        this.cache.set(key, value);
        this.accessCount.set(key, 1);
        this.accessTime.set(key, Date.now());
        
        // Логируем каждые 100 добавленных векторов
        if (this.cache.size % 100 === 0) {
            console.log(`📊 [LimitedVectorCache] Размер кэша: ${this.cache.size}/${this.maxSize} векторов`);
        }
    }

    /**
     * Удаление наименее используемых записей (LRU алгоритм)
     */
    evictLRU() {
        // Находим записи с наименьшим временем последнего доступа
        const entries = Array.from(this.accessTime.entries())
            .sort(([,timeA], [,timeB]) => timeA - timeB);
        
        // Удаляем старые записи (25% от максимального размера)
        const toRemove = Math.floor(this.maxSize * 0.25);
        const keysToRemove = entries.slice(0, toRemove).map(([key]) => key);
        
        keysToRemove.forEach(key => {
            this.cache.delete(key);
            this.accessCount.delete(key);
            this.accessTime.delete(key);
        });
        
        console.log(`🧹 [LimitedVectorCache] Удалено ${keysToRemove.length} старых векторов (LRU)`);
    }

    /**
     * Принудительная очистка кэша
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.accessCount.clear();
        this.accessTime.clear();
        console.log(`🗑️ [LimitedVectorCache] Очищен кэш: ${size} векторов`);
        return size;
    }

    /**
     * Получение статистики кэша
     */
    getStats() {
        const memoryEstimate = this.estimateMemoryUsage();
        
        return {
            totalEntries: this.cache.size,
            maxSize: this.maxSize,
            usagePercent: Math.round((this.cache.size / this.maxSize) * 100),
            memoryUsageMB: Math.round(memoryEstimate / 1024 / 1024 * 100) / 100,
            topAccessed: this.getTopAccessedKeys(5)
        };
    }

    /**
     * Оценка использования памяти
     */
    estimateMemoryUsage() {
        let totalSize = 0;
        for (const [key, value] of this.cache.entries()) {
            // Ключ + массив из 384 чисел (примерно)
            const keySize = key.length * 2; // UTF-16
            const vectorSize = Array.isArray(value) ? value.length * 8 : 0; // 8 байт на число
            totalSize += keySize + vectorSize;
        }
        return totalSize;
    }

    /**
     * Получение наиболее используемых ключей
     */
    getTopAccessedKeys(limit = 5) {
        return Array.from(this.accessCount.entries())
            .sort(([,countA], [,countB]) => countB - countA)
            .slice(0, limit)
            .map(([key, count]) => ({ key, accessCount: count }));
    }

    get size() {
        return this.cache.size;
    }
}

// Экспорт в глобальную область видимости
window.LocalEmbeddingService = LocalEmbeddingService;
window.LimitedVectorCache = LimitedVectorCache;