/**
 * Гибридный сервис обнаружения дубликатов
 * Комбинирует embedding-фильтрацию с AI-верификацией для оптимальной производительности
 */

class HybridDuplicateDetectionService {
    constructor() {
        this.embeddingService = new window.EmbeddingService();
        this.modelsRegistry = new window.EmbeddingModelsRegistry();
        this.universalAIService = null;
        this.databaseManager = null;
        this.initialized = false;
        this.debugEnabled = false;
        
        // Настройки по умолчанию (обновлены на оптимальные значения)
        this.settings = {
            embeddingModelId: 'paraphrase-multilingual-MiniLM-L12-v2', // Лучший для русского
            embeddingThreshold: 0.82, // Оптимальный порог для embedding-фильтрации
            aiVerificationThreshold: 0.78, // Оптимальный порог для AI-верификации
            maxCandidatesForAI: 15, // Оптимальное количество кандидатов для AI-анализа
            enableProgressiveThresholds: true, // Прогрессивные пороги для разных типов текстов
            cacheEmbeddings: true // Кэширование embedding-векторов
        };
    }

    /**
     * Инициализация сервиса
     */
    async init(customSettings = {}) {
        if (this.initialized) return;

        // Загружаем сохраненные оптимальные параметры
        await this.loadOptimalParameters();

        // Применяем пользовательские настройки
        this.settings = { ...this.settings, ...customSettings };

        // Инициализируем EmbeddingService
        try {
            await this.embeddingService.initializeDatabase();
            console.log(`✅ [HybridDuplicates] EmbeddingService инициализирован`);
        } catch (error) {
            console.error(`❌ [HybridDuplicates] Ошибка инициализации EmbeddingService:`, error);
            throw error;
        }

        // Получаем Universal AI Service (для второго этапа)
        try {
            this.universalAIService = window.diContainer?.get?.('UniversalAIService') || 
                                    new UniversalAIService();
            if (typeof this.universalAIService.init === 'function') {
                await this.universalAIService.init();
            }
        } catch (error) {
            console.error('❌ [HybridDuplicates] Ошибка инициализации UniversalAIService:', error);
            throw error;
        }

        // Получаем DatabaseManager
        this.databaseManager = window.db;
        if (!this.databaseManager) {
            throw new Error('DatabaseManager не инициализирован');
        }

        // Загружаем настройки модели из реестра
        const optimalSettings = this.modelsRegistry.getDuplicateDetectionSettings(this.settings.embeddingModelId);
        if (optimalSettings) {
            this.settings = { ...this.settings, ...optimalSettings };
        }

        // Проверяем доступность embedding-модели
        if (!this.modelsRegistry.isValidModelId(this.settings.embeddingModelId)) {
            console.warn(`⚠️ [HybridDuplicates] Модель ${this.settings.embeddingModelId} не найдена в реестре`);
        }
        
        // Проверяем состояние сервисов
        console.log(`🔍 [HybridDuplicates] Состояние сервисов:`, {
            embeddingService: !!this.embeddingService,
            universalAIService: !!this.universalAIService,
            databaseManager: !!this.databaseManager,
            modelsRegistry: !!this.modelsRegistry
        });

        console.log(`✅ [HybridDuplicates] Инициализирован с моделью: ${this.settings.embeddingModelId}`);
        console.log(`🔧 [HybridDuplicates] Настройки:`, this.settings);

        this.initialized = true;
    }

    /**
     * Основной метод гибридной обработки дублей
     */
    async processDuplicatesWithHybridAI(progressCallback = null, filters = null) {
        if (!this.initialized) await this.init();

        const results = {
            processed: 0,
            merged: 0,
            errors: 0,
            analyzed: 0,
            totalFound: 0,
            embeddingFiltered: 0, // Количество пар, отфильтрованных embedding
            aiVerified: 0, // Количество пар, проверенных AI
            cacheHits: 0, // Количество попаданий в кэш embedding
            statistics: {
                embeddingTime: 0,
                aiTime: 0,
                totalTime: 0
            }
        };

        const startTime = Date.now();

        try {
            // 1. Получаем объявления для обработки
            const listingsForProcessing = await this.getListingsForDuplicateProcessing(filters);
            
            if (listingsForProcessing.length === 0) {
                return {
                    ...results,
                    message: 'Нет объявлений для обработки дублей'
                };
            }

            results.totalFound = listingsForProcessing.length;
            console.log(`🎯 [HybridDuplicates] Найдено ${listingsForProcessing.length} объявлений для анализа`);

            if (progressCallback) {
                progressCallback({
                    stage: 'embedding_preparation',
                    message: `Подготовка embedding-анализа для ${listingsForProcessing.length} объявлений`,
                    progress: 5
                });
            }

            // 2. Предварительная генерация embedding-векторов для всех объявлений
            await this.preGenerateEmbeddings(listingsForProcessing, progressCallback);

            // 3. Группировка по адресам
            const addressGroups = await this.groupListingsByAddress(listingsForProcessing);
            
            if (progressCallback) {
                progressCallback({
                    stage: 'grouped',
                    message: `Сгруппировано по ${addressGroups.size} адресам`,
                    progress: 25
                });
            }

            let processedGroups = 0;
            const totalGroups = addressGroups.size;

            // 4. Обработка каждой группы с гибридным подходом
            for (const [addressId, listings] of addressGroups.entries()) {
                if (listings.length < 2) {
                    // Одно объявление - создаем объект (НЕ объединение)
                    await this.createObjectFromSingleListing(listings[0], addressId);
                    results.processed++;
                    // results.merged++; // УБРАНО: это не объединение
                } else {
                    // Несколько объявлений - используем гибридный анализ
                    const groupResults = await this.processAddressGroupHybrid(listings, addressId, results);
                    results.processed += groupResults.processed;
                    results.merged += groupResults.merged;
                    results.analyzed += groupResults.analyzed;
                    results.errors += groupResults.errors;
                    results.embeddingFiltered += groupResults.embeddingFiltered || 0;
                    results.aiVerified += groupResults.aiVerified || 0;
                }

                processedGroups++;
                if (progressCallback) {
                    const progress = 25 + (processedGroups / totalGroups) * 70;
                    progressCallback({
                        stage: 'hybrid_processing',
                        message: `Обработано групп: ${processedGroups}/${totalGroups}`,
                        progress: Math.round(progress)
                    });
                }
            }

            results.statistics.totalTime = Date.now() - startTime;

            // Инвалидируем весь кеш после массовой обработки дублей
            if (window.dataCacheManager && (results.processed > 0 || results.merged > 0)) {
                await window.dataCacheManager.invalidate('listings');
                await window.dataCacheManager.invalidate('objects');
            }

            if (progressCallback) {
                progressCallback({
                    stage: 'completed',
                    message: 'Гибридная обработка дублей завершена',
                    progress: 100,
                    statistics: results.statistics
                });
            }

            console.log(`✅ [HybridDuplicates] Обработка завершена:`, results);
            return results;

        } catch (error) {
            console.error('❌ [HybridDuplicates] Ошибка обработки:', error);
            results.errors++;
            throw error;
        }
    }

    /**
     * Предварительная генерация embedding-векторов для всех объявлений
     */
    async preGenerateEmbeddings(listings, progressCallback = null) {
        console.log(`🔄 [HybridDuplicates] Подготовка embedding-векторов для ${listings.length} объявлений`);
        
        // Подготавливаем тексты для генерации embedding
        const textsToEmbed = listings.map(listing => this.prepareTextForEmbedding(listing));
        
        // Пакетная генерация embedding-векторов с прогрессом
        const embeddingStartTime = Date.now();
        
        await this.embeddingService.batchGenerateEmbeddings(
            textsToEmbed, 
            this.settings.embeddingModelId,
            {
                useCache: this.settings.cacheEmbeddings,
                batchSize: this.settings.batchSize || 10,
                progressCallback: (progress) => {
                    if (progressCallback) {
                        progressCallback({
                            stage: 'embedding_generation',
                            message: `Генерация embedding: ${progress.processed}/${progress.total}`,
                            progress: 5 + (progress.progress * 0.15) // 5-20% общего прогресса
                        });
                    }
                }
            }
        );

        const embeddingTime = Date.now() - embeddingStartTime;
        console.log(`✅ [HybridDuplicates] Embedding-векторы подготовлены за ${embeddingTime}мс`);
    }

    /**
     * Обработка группы объявлений одного адреса с гибридным подходом
     */
    async processAddressGroupHybrid(listings, addressId, globalResults) {
        const results = {
            processed: 0,
            merged: 0,
            analyzed: 0,
            errors: 0,
            embeddingFiltered: 0,
            aiVerified: 0
        };

        try {
            console.log(`🎯 [HybridDuplicates] Гибридная обработка адреса ${addressId} с ${listings.length} объявлениями`);
            
            // Сортировка по хронологии
            listings.sort((a, b) => new Date(a.created) - new Date(b.created));

            const existingObjects = new Map();
            
            // Обрабатываем каждое объявление в хронологическом порядке
            for (let i = 0; i < listings.length; i++) {
                const newListing = listings[i];
                const olderListings = listings.slice(0, i);
                
                console.log(`\n📍 [HybridDuplicates] Обработка объявления ${i + 1}/${listings.length}: ${newListing.id}`);
                
                if (olderListings.length === 0) {
                    // Первое объявление - создаем объект (НЕ объединение)
                    const objectInfo = await this.createObjectFromSingleListing(newListing, addressId);
                    existingObjects.set(newListing.id, objectInfo);
                    results.processed++;
                    // results.merged++; // УБРАНО: это не объединение
                    continue;
                }

                // Фильтруем релевантные старые объявления
                const relevantOlderListings = this.filterRelevantListings(newListing, olderListings);
                
                if (relevantOlderListings.length === 0) {
                    // Нет релевантных - создаем новый объект (НЕ объединение)
                    const objectInfo = await this.createObjectFromSingleListing(newListing, addressId);
                    existingObjects.set(newListing.id, objectInfo);
                    results.processed++;
                    // results.merged++; // УБРАНО: это не объединение
                    continue;
                }

                // Гибридный поиск дублей: Embedding + AI
                const duplicateFound = await this.findDuplicateHybrid(newListing, relevantOlderListings, results);
                
                if (duplicateFound) {
                    // Найден дубль - объединяем
                    await this.mergeWithExistingObject(newListing, duplicateFound, addressId, existingObjects);
                    results.processed++;
                    results.merged++; // ИСПРАВЛЕНО: теперь считаем реальные объединения
                } else {
                    // Дубль не найден - создаем новый объект (НЕ объединение)
                    const objectInfo = await this.createObjectFromSingleListing(newListing, addressId);
                    existingObjects.set(newListing.id, objectInfo);
                    results.processed++;
                    // results.merged++; // УБРАНО: это не объединение
                }
            }

            return results;

        } catch (error) {
            console.error(`❌ [HybridDuplicates] Ошибка обработки группы ${addressId}:`, error);
            results.errors++;
            return results;
        }
    }

    /**
     * Гибридный поиск дублей: Embedding-фильтрация + AI-верификация
     */
    async findDuplicateHybrid(newListing, relevantOlderListings, results) {
        console.log(`🤖 [HybridDuplicates] Гибридный поиск дублей для ${newListing.id} среди ${relevantOlderListings.length} кандидатов`);

        try {
            // Этап 1: Embedding-фильтрация
            const embeddingStartTime = Date.now();
            const embeddingCandidates = await this.filterByEmbeddingSimilarity(newListing, relevantOlderListings);
            const embeddingTime = Date.now() - embeddingStartTime;
            
            results.embeddingFiltered = results.embeddingFiltered || 0;
            results.embeddingFiltered += (relevantOlderListings.length - embeddingCandidates.length);
            

            if (embeddingCandidates.length === 0) {
                return null;
            }

            // Этап 2: AI-верификация лучших кандидатов
            const aiStartTime = Date.now();
            const aiCandidates = embeddingCandidates.slice(0, this.settings.maxCandidatesForAI);
            
            console.log(`🤖 [AI] Отправляем на AI-верификацию ${aiCandidates.length} лучших кандидатов`);

            for (const candidateData of aiCandidates) {
                const { listing: candidateListing, similarity } = candidateData;
                
                console.log(`   🔍 AI-анализ: ${newListing.id} vs ${candidateListing.id} (embedding: ${similarity.toFixed(3)})`);
                
                try {
                    const isDuplicate = await this.compareListingsWithAI(newListing, candidateListing);
                    results.aiVerified = (results.aiVerified || 0) + 1;
                    results.analyzed = (results.analyzed || 0) + 1; // ИСПРАВЛЕНО: считаем AI-анализы
                    
                    if (isDuplicate) {
                        const aiTime = Date.now() - aiStartTime;
                        console.log(`✅ [HybridDuplicates] Дубль найден через AI за ${aiTime}мс!`);
                        return candidateListing;
                    }
                } catch (error) {
                    console.error(`❌ [AI] Ошибка анализа ${newListing.id} vs ${candidateListing.id}:`, error);
                    continue;
                }
            }

            const aiTime = Date.now() - aiStartTime;
            console.log(`❌ [HybridDuplicates] AI не подтвердил дубли за ${aiTime}мс`);
            return null;

        } catch (error) {
            console.error(`❌ [HybridDuplicates] Ошибка гибридного поиска:`, error);
            return null;
        }
    }

    /**
     * Фильтрация по embedding-сходству
     */
    async filterByEmbeddingSimilarity(newListing, olderListings) {
        try {
            // Подготавливаем тексты
            const newText = this.prepareTextForEmbedding(newListing);
            const olderTexts = olderListings.map(listing => this.prepareTextForEmbedding(listing));

            // Генерируем embedding для нового объявления
            const newVector = await this.embeddingService.generateEmbedding(
                newText, 
                this.settings.embeddingModelId, 
                this.settings.cacheEmbeddings
            );

            // Генерируем embedding для старых объявлений (пакетно)
            const olderVectors = await this.embeddingService.batchGenerateEmbeddings(
                olderTexts, 
                this.settings.embeddingModelId,
                { useCache: this.settings.cacheEmbeddings, batchSize: 10 }
            );


            // Вычисляем сходство и фильтруем
            const candidates = [];
            for (let i = 0; i < olderListings.length; i++) {
                const similarity = this.embeddingService.calculateCosineSimilarity(newVector, olderVectors[i]);
                
                
                if (similarity >= this.settings.embeddingThreshold) {
                    candidates.push({
                        listing: olderListings[i],
                        similarity: similarity
                    });
                }
            }

            // Сортируем по убыванию сходства
            candidates.sort((a, b) => b.similarity - a.similarity);
            
            return candidates;

        } catch (error) {
            console.error(`❌ [HybridDuplicates] Ошибка embedding-фильтрации:`, error);
            console.error(`🔍 [Debug] EmbeddingService состояние:`, {
                service: !!this.embeddingService,
                modelId: this.settings.embeddingModelId,
                threshold: this.settings.embeddingThreshold,
                newTextLength: this.prepareTextForEmbedding(newListing)?.length,
                newText: this.prepareTextForEmbedding(newListing)?.substring(0, 100),
                olderTextLength: this.prepareTextForEmbedding(olderListings[0])?.length,
                olderText: this.prepareTextForEmbedding(olderListings[0])?.substring(0, 100)
            });
            // В случае ошибки возвращаем всех кандидатов для AI-анализа
            return olderListings.map(listing => ({ listing, similarity: 1.0 }));
        }
    }

    /**
     * Подготовка текста объявления для embedding-анализа
     */
    prepareTextForEmbedding(listing) {
        // Формируем единый текст из ключевых полей для embedding-анализа
        // ИСКЛЮЧАЕМ: seller_type, phone, seller_info, balcony, bathroom_type, renovation, 
        //           phone_protected, is_new_building, is_apartments, house_details, source, url, floors_count
        const parts = [];
        
        // Добавляем описание (основная семантическая информация)
        if (listing.description && listing.description.trim()) {
            parts.push(listing.description.trim());
        }
        
        // Добавляем структурированные данные только свойства объекта
        const structuredData = [];
        
        if (listing.property_type) structuredData.push(`Тип: ${listing.property_type}`);
        if (listing.rooms) structuredData.push(`Комнаты: ${listing.rooms}`);
        if (listing.area_total) structuredData.push(`Площадь: ${listing.area_total} м²`);
        if (listing.area_living) structuredData.push(`Жилая: ${listing.area_living} м²`);
        if (listing.area_kitchen) structuredData.push(`Кухня: ${listing.area_kitchen} м²`);
        if (listing.floor) structuredData.push(`Этаж: ${listing.floor}`);
        if (listing.price) structuredData.push(`Цена: ${listing.price} руб`);
        
        // Не добавляем характеристики дома - они одинаковые для одного адреса
        
        if (structuredData.length > 0) {
            parts.push(structuredData.join(', '));
        }
        
        const finalText = parts.join('\n\n').trim();
        
        // Ограничиваем длину текста для оптимальной работы embedding-моделей
        return finalText.length > 1500 ? finalText.substring(0, 1500) + '...' : finalText;
    }

    // Методы, заимствованные из AIDuplicateDetectionService
    
    /**
     * Получение объявлений для обработки дублей
     */
    async getListingsForDuplicateProcessing(filters = null) {
        try {
            const allListings = await this.databaseManager.getAll('listings');
            
            let candidateListings = allListings.filter(listing => 
                listing.processing_status === 'duplicate_check_needed' && 
                listing.address_id
            );

            // Если есть специальный фильтр по ID объявлений (из AIChatModal)
            if (filters?.useListingIds && filters?.listingIds?.length > 0) {
                const listingIdsSet = new Set(filters.listingIds);
                candidateListings = candidateListings.filter(listing => listingIdsSet.has(listing.id));
                console.log(`🎯 [HybridDuplicates] Применен фильтр по ID: ${candidateListings.length} объявлений`);
            } else if (filters && (filters.segments?.length > 0 || filters.subsegments?.length > 0)) {
                candidateListings = await this.applySegmentFilters(candidateListings, filters);
            }

            return candidateListings;

        } catch (error) {
            console.error('❌ [HybridDuplicates] Ошибка получения объявлений:', error);
            throw error;
        }
    }

    /**
     * Группировка объявлений по адресам
     */
    async groupListingsByAddress(listings) {
        const groups = new Map();

        for (const listing of listings) {
            const addressId = listing.address_id;
            if (!addressId) continue;

            if (!groups.has(addressId)) {
                groups.set(addressId, []);
            }
            groups.get(addressId).push(listing);
        }

        return groups;
    }

    /**
     * Создание объекта из одного объявления
     */
    async createObjectFromSingleListing(listing, addressId) {
        try {
            if (!window.realEstateObjectManager) {
                throw new Error('RealEstateObjectManager не инициализирован');
            }

            const savedObject = await window.realEstateObjectManager.mergeIntoObject(
                [{ type: 'listing', id: listing.id }],
                addressId
            );

            return {
                objectId: savedObject.id, // ИСПРАВЛЕНО: берем ID из объекта
                addressId: addressId,
                listings: [listing.id],
                createdAt: new Date()
            };

        } catch (error) {
            console.error(`❌ [HybridDuplicates] Ошибка создания объекта из объявления ${listing.id}:`, error);
            throw error;
        }
    }

    /**
     * Фильтрация релевантных объявлений
     */
    filterRelevantListings(newListing, olderListings) {
        return olderListings.filter(oldListing => {
            // Тип недвижимости должен совпадать
            if (newListing.property_type !== oldListing.property_type) {
                return false;
            }

            // Этаж должен быть совместим
            if (!this.isCompatibleFloor(newListing.floor, oldListing.floor)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Проверка совместимости этажей
     */
    isCompatibleFloor(floor1, floor2) {
        if (!floor1 || !floor2) return true;
        return floor1 === floor2;
    }

    /**
     * Объединение с существующим объектом
     */
    async mergeWithExistingObject(newListing, duplicateOldListing, addressId, existingObjects) {
        try {
            const existingObjectInfo = existingObjects.get(duplicateOldListing.id);
            
            // НОВАЯ ЛОГИКА: Добавляем новое объявление к существующему объекту вместо создания нового
            const updatedObject = await window.realEstateObjectManager.addListingsToExistingObject(
                existingObjectInfo.objectId, 
                [newListing.id]
            );

            const updatedObjectInfo = {
                objectId: existingObjectInfo.objectId, // ID остается тот же
                addressId: addressId,
                listings: [...existingObjectInfo.listings, newListing.id], // Добавляем новое объявление к списку
                createdAt: existingObjectInfo?.createdAt || new Date(),
                updatedAt: new Date()
            };

            // Обновляем информацию для нового объявления (оно теперь тоже ссылается на этот объект)
            existingObjects.set(newListing.id, updatedObjectInfo);
            
            return updatedObjectInfo;

        } catch (error) {
            console.error(`❌ [HybridDuplicates] Ошибка объединения объявлений:`, error);
            throw error;
        }
    }

    /**
     * Сравнение объявлений с помощью AI (заимствовано из AIDuplicateDetectionService)
     */
    async compareListingsWithAI(listing1, listing2) {
        try {
            const listingData1 = this.prepareLightListingData(listing1);
            const listingData2 = this.prepareLightListingData(listing2);

            const prompt = this.buildDuplicateAnalysisPrompt(listingData1, listingData2);
            const response = await this.universalAIService.sendRequest(prompt);

            return this.parseAIDuplicateResponse(response);

        } catch (error) {
            console.error(`❌ [HybridDuplicates] Ошибка AI-анализа:`, error);
            return false;
        }
    }

    /**
     * Подготовка данных для AI-анализа
     */
    prepareLightListingData(listing) {
        // Подготавливаем данные для AI-анализа, исключая указанные поля
        // ИСКЛЮЧАЕМ: seller_type, phone, seller_info, balcony, bathroom_type, renovation,
        //           phone_protected, is_new_building, is_apartments, house_details, source, url, floors_count
        return {
            // Основные характеристики объекта
            description: listing.description ? listing.description.substring(0, 500) : null,
            property_type: listing.property_type,
            price: listing.price,
            area_total: listing.area_total,
            area_living: listing.area_living,
            area_kitchen: listing.area_kitchen,
            rooms: listing.rooms,
            floor: listing.floor,
            
            // Характеристики дома не включаем - одинаковые для одного адреса
            
            // Временная информация для анализа
            updated: listing.updated,
            created: listing.created
        };
    }

    /**
     * Формирование промпта для AI-анализа
     */
    buildDuplicateAnalysisPrompt(listing1, listing2) {
        return `Проанализируй два объявления о недвижимости и определи, являются ли они дубликатами (об одном и том же объекте).

ОБЪЯВЛЕНИЕ 1:
${JSON.stringify(listing1, null, 2)}

ОБЪЯВЛЕНИЕ 2:
${JSON.stringify(listing2, null, 2)}

Эти объявления уже прошли предварительную фильтрацию по embedding-сходству, что означает высокую семантическую близость их текстов.

ВАЖНО: В данных исключены контактные данные продавцов, технические характеристики дома, ссылки и метаданные для фокуса только на характеристиках самого объекта недвижимости.

Критерии для определения дубликатов:
1. Очень похожие или идентичные описания объекта
2. Схожие характеристики недвижимости (площадь, количество комнат, этаж, планировка)
3. Близкие цены (могут отличаться из-за переговоров или изменений во времени)
4. Схожие временные рамки публикации

Учти что:
- Дубликаты могут быть с разных сайтов (источников)
- Цены могут немного отличаться из-за времени или переговоров
- Описания могут быть слегка переформулированы
- Один объект может продаваться через разных риелторов
- НЕ учитывай информацию о продавцах, контакты, тип дома, ремонт и другие исключенные поля

ВАЖНО: Ответь строго "ДА" если это дубликаты, или "НЕТ" если это разные объекты. Никаких дополнительных слов или объяснений.`;
    }

    /**
     * Парсинг ответа AI
     */
    parseAIDuplicateResponse(response) {
        if (!response) return false;

        const text = (response.content || response.toString()).toUpperCase().trim();
        
        if (text.includes('ДА') && !text.includes('НЕТ')) {
            return true;
        }
        
        if (text.includes('НЕТ') && !text.includes('ДА')) {
            return false;
        }

        if (text.includes('YES') && !text.includes('NO')) {
            return true;
        }
        
        if (text.includes('NO') && !text.includes('YES')) {
            return false;
        }

        return false;
    }

    // Заглушки для методов фильтрации (копируются из AIDuplicateDetectionService по необходимости)
    async applySegmentFilters(listings, filters) {
        // Временная заглушка - возвращаем все объявления
        // В полной версии здесь должна быть логика из AIDuplicateDetectionService
        return listings;
    }

    /**
     * Получение статистики кэша embedding
     */
    async getCacheStatistics() {
        return await this.embeddingService.getCacheStats(this.settings.embeddingModelId);
    }

    /**
     * Очистка кэша embedding
     */
    async clearEmbeddingCache(olderThanDays = null) {
        return await this.embeddingService.clearCache(this.settings.embeddingModelId, olderThanDays);
    }

    /**
     * Обновление настроек
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        
        // Перезагружаем оптимальные настройки для новой модели
        if (newSettings.embeddingModelId) {
            const optimalSettings = this.modelsRegistry.getDuplicateDetectionSettings(newSettings.embeddingModelId);
            if (optimalSettings) {
                this.settings = { ...this.settings, ...optimalSettings };
            }
        }
        
        console.log(`🔧 [HybridDuplicates] Настройки обновлены:`, this.settings);
    }

    /**
     * Загрузка оптимальных параметров из localStorage
     */
    async loadOptimalParameters() {
        try {
            const savedParams = localStorage.getItem('optimalDuplicateParameters');
            if (savedParams) {
                const config = JSON.parse(savedParams);
                console.log('🔧 [HybridDuplicates] Загружены оптимальные параметры:', config);
                
                // Применяем сохраненные параметры
                if (config.embeddingThreshold) {
                    this.settings.embeddingThreshold = config.embeddingThreshold;
                }
                if (config.aiVerificationThreshold) {
                    this.settings.aiVerificationThreshold = config.aiVerificationThreshold;
                }
                if (config.maxCandidatesForAI) {
                    this.settings.maxCandidatesForAI = config.maxCandidatesForAI;
                }
                
                console.log('✅ [HybridDuplicates] Оптимальные параметры применены:', {
                    embeddingThreshold: this.settings.embeddingThreshold,
                    aiVerificationThreshold: this.settings.aiVerificationThreshold,
                    maxCandidatesForAI: this.settings.maxCandidatesForAI,
                    appliedAt: config.appliedAt,
                    quality: config.quality
                });
                
                return true;
            } else {
                console.log('ℹ️ [HybridDuplicates] Оптимальные параметры не найдены, используются значения по умолчанию');
                return false;
            }
        } catch (error) {
            console.error('❌ [HybridDuplicates] Ошибка загрузки оптимальных параметров:', error);
            return false;
        }
    }
    
    /**
     * Обновление параметров (для команды /applyparameters)
     */
    updateParameters(newParameters) {
        try {
            console.log('🔧 [HybridDuplicates] Обновление параметров:', newParameters);
            
            // Обновляем параметры в settings
            if (newParameters.embeddingThreshold !== undefined) {
                this.settings.embeddingThreshold = newParameters.embeddingThreshold;
            }
            if (newParameters.aiVerificationThreshold !== undefined) {
                this.settings.aiVerificationThreshold = newParameters.aiVerificationThreshold;
            }
            if (newParameters.maxCandidatesForAI !== undefined) {
                this.settings.maxCandidatesForAI = newParameters.maxCandidatesForAI;
            }
            
            console.log('✅ [HybridDuplicates] Параметры успешно обновлены:', {
                embeddingThreshold: this.settings.embeddingThreshold,
                aiVerificationThreshold: this.settings.aiVerificationThreshold,
                maxCandidatesForAI: this.settings.maxCandidatesForAI
            });
            
            return true;
            
        } catch (error) {
            console.error('❌ [HybridDuplicates] Ошибка обновления параметров:', error);
            return false;
        }
    }
    
    /**
     * Получение текущих параметров
     */
    getCurrentParameters() {
        return {
            embeddingThreshold: this.settings.embeddingThreshold,
            aiVerificationThreshold: this.settings.aiVerificationThreshold,
            maxCandidatesForAI: this.settings.maxCandidatesForAI
        };
    }

    /**
     * Освобождение ресурсов
     */
    dispose() {
        this.embeddingService.dispose();
        this.initialized = false;
        console.log('🔄 HybridDuplicateDetectionService освобожден');
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridDuplicateDetectionService;
} else {
    window.HybridDuplicateDetectionService = HybridDuplicateDetectionService;
}