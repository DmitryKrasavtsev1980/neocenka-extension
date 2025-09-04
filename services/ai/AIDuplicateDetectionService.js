/**
 * AI-сервис обнаружения и объединения дубликатов объявлений
 * Заменяет алгоритмический подход на AI-анализ для более точного определения дублей
 */

class AIDuplicateDetectionService {
    constructor() {
        this.universalAIService = null;
        this.databaseManager = null;
        this.initialized = false;
        this.debugEnabled = false;
    }

    /**
     * Инициализация сервиса
     */
    async init() {
        if (this.initialized) return;

        // Получаем Universal AI Service
        try {
            this.universalAIService = window.diContainer?.get?.('UniversalAIService') || 
                                    new UniversalAIService();
            if (typeof this.universalAIService.init === 'function') {
                await this.universalAIService.init();
            }
        } catch (error) {
            console.error('❌ [AIDuplicateDetection] Ошибка инициализации UniversalAIService:', error);
            throw error;
        }

        // Получаем DatabaseManager
        this.databaseManager = window.db;
        if (!this.databaseManager) {
            throw new Error('DatabaseManager не инициализирован');
        }

        this.initialized = true;
    }

    /**
     * Основной метод обработки дублей с AI-анализом
     */
    async processDuplicatesWithAI(progressCallback = null, filters = null) {
        if (!this.initialized) await this.init();

        const results = {
            processed: 0,
            merged: 0,
            errors: 0,
            analyzed: 0,
            totalFound: 0
        };

        try {
            // 1. Получаем объявления для обработки дублей
            const listingsForProcessing = await this.getListingsForDuplicateProcessing(filters);
            
            if (listingsForProcessing.length === 0) {
                return {
                    ...results,
                    message: 'Нет объявлений для обработки дублей'
                };
            }

            results.totalFound = listingsForProcessing.length;

            if (progressCallback) {
                progressCallback({
                    stage: 'grouping',
                    message: `Найдено ${listingsForProcessing.length} объявлений для анализа`,
                    progress: 10
                });
            }

            // 2. Группируем объявления по адресам (дубли могут быть только у одного адреса)
            const addressGroups = await this.groupListingsByAddress(listingsForProcessing);
            
            if (progressCallback) {
                progressCallback({
                    stage: 'analyzing',
                    message: `Сгруппировано по ${addressGroups.size} адресам`,
                    progress: 20
                });
            }

            let processedGroups = 0;
            const totalGroups = addressGroups.size;

            // 3. Обрабатываем каждую группу объявлений по адресу
            for (const [addressId, listings] of addressGroups.entries()) {
                if (listings.length < 2) {
                    // Если объявление одно - создаем объект из него
                    await this.createObjectFromSingleListing(listings[0], addressId);
                    results.processed++;
                    results.merged++;
                } else {
                    // Если объявлений несколько - анализируем на дубли
                    const groupResults = await this.processAddressGroup(listings, addressId);
                    results.processed += groupResults.processed;
                    results.merged += groupResults.merged;
                    results.analyzed += groupResults.analyzed;
                    results.errors += groupResults.errors;
                }

                processedGroups++;
                if (progressCallback) {
                    const progress = 20 + (processedGroups / totalGroups) * 70;
                    progressCallback({
                        stage: 'processing',
                        message: `Обработано групп: ${processedGroups}/${totalGroups}`,
                        progress: Math.round(progress)
                    });
                }
            }

            if (progressCallback) {
                progressCallback({
                    stage: 'completed',
                    message: 'Обработка дублей завершена',
                    progress: 100
                });
            }

            return results;

        } catch (error) {
            console.error('❌ [AIDuplicateDetection] Ошибка обработки дублей:', error);
            results.errors++;
            throw error;
        }
    }

    /**
     * Получение объявлений для обработки дублей
     */
    async getListingsForDuplicateProcessing(filters = null) {
        try {
            // Базовый запрос всех объявлений с нужными статусами
            const allListings = await this.databaseManager.getAll('listings');
            
            // Фильтруем объявления по статусу обработки
            let candidateListings = allListings.filter(listing => 
                listing.processing_status === 'duplicate_check_needed' && 
                listing.address_id // У объявления должен быть адрес
            );

            // Применяем сегментные фильтры если заданы
            if (filters && (filters.segments?.length > 0 || filters.subsegments?.length > 0)) {
                candidateListings = await this.applySegmentFilters(candidateListings, filters);
            }

            return candidateListings;

        } catch (error) {
            console.error('❌ [AIDuplicateDetection] Ошибка получения объявлений:', error);
            throw error;
        }
    }

    /**
     * Применение фильтров сегментов (скопировано из CianListingUpdateService)
     */
    async applySegmentFilters(listings, filters) {
        if (!filters || (!filters.segments?.length && !filters.subsegments?.length)) {
            return listings;
        }

        try {
            console.log(`🔍 [AIDuplicateDetection] Применение фильтров: сегменты=${filters.segments?.length || 0}, подсегменты=${filters.subsegments?.length || 0}`);
            
            // Загружаем все адреса и сегменты
            const allAddresses = await this.databaseManager.getAll('addresses');
            const allSegments = await this.databaseManager.getAll('segments');
            const allSubsegments = await this.databaseManager.getAll('subsegments');
            
            // Создаем мапу address_id для быстрого поиска
            const addressMap = new Map(allAddresses.map(addr => [addr.id, addr]));
            
            // Получаем адреса для выбранных сегментов
            let allowedAddressIds = new Set();
            
            if (filters.segments?.length > 0) {
                const selectedSegments = allSegments.filter(seg => filters.segments.includes(seg.id));
                
                for (const segment of selectedSegments) {
                    console.log(`🔍 [AIDuplicateDetection] Обрабатываем сегмент: ${segment.name} (${segment.id})`);
                    
                    // Используем фильтры сегмента для поиска адресов
                    if (segment.filters) {
                        console.log(`🔍 [AIDuplicateDetection] Фильтры сегмента:`, segment.filters);
                        
                        const segmentAddresses = allAddresses.filter(address => {
                            return this.addressMatchesSegmentFilters(address, segment.filters);
                        });
                        
                        console.log(`🔍 [AIDuplicateDetection] Найдено адресов для сегмента ${segment.name}: ${segmentAddresses.length}`);
                        segmentAddresses.forEach(addr => allowedAddressIds.add(addr.id));
                    } else {
                        console.log(`⚠️ [AIDuplicateDetection] У сегмента ${segment.name} нет фильтров, используем все адреса области`);
                        allAddresses.forEach(addr => allowedAddressIds.add(addr.id));
                    }
                }
            } else if (filters.subsegments?.length > 0) {
                // Если выбраны только подсегменты, получаем адреса их родительских сегментов
                const selectedSubsegments = allSubsegments.filter(sub => filters.subsegments.includes(sub.id));
                const parentSegmentIds = [...new Set(selectedSubsegments.map(sub => sub.segment_id))];
                const parentSegments = allSegments.filter(seg => parentSegmentIds.includes(seg.id));
                
                for (const segment of parentSegments) {
                    if (segment.filters) {
                        const segmentAddresses = allAddresses.filter(address => {
                            return this.addressMatchesSegmentFilters(address, segment.filters);
                        });
                        segmentAddresses.forEach(addr => allowedAddressIds.add(addr.id));
                    } else {
                        allAddresses.forEach(addr => allowedAddressIds.add(addr.id));
                        break;
                    }
                }
            }
            
            console.log(`🔍 [AIDuplicateDetection] Всего разрешенных адресов: ${allowedAddressIds.size}`);
            
            // Фильтруем объявления по разрешенным адресам
            const filteredListings = listings.filter(listing => 
                listing.address_id && allowedAddressIds.has(listing.address_id)
            );
            
            // Дополнительная фильтрация по подсегментам (если нужно)
            if (filters.subsegments?.length > 0) {
                return this.listingMatchesSubsegmentFilters(filteredListings, filters.subsegments, allAddresses);
            }
            
            return filteredListings;

        } catch (error) {
            console.error(`❌ [AIDuplicateDetection] Ошибка применения фильтров:`, error);
            return listings;
        }
    }

    /**
     * Проверка соответствия адреса фильтрам сегмента (скопировано из CianListingUpdateService)
     */
    addressMatchesSegmentFilters(address, filters) {
        // Проверяем тип недвижимости
        if (filters.type && filters.type.length > 0) {
            if (!filters.type.includes(address.type)) return false;
        }
        
        // Проверяем класс дома
        if (filters.house_class_id && filters.house_class_id.length > 0) {
            if (!filters.house_class_id.includes(address.house_class_id)) return false;
        }
        
        // Проверяем серию дома
        if (filters.house_series_id && filters.house_series_id.length > 0) {
            if (!filters.house_series_id.includes(address.house_series_id)) return false;
        }
        
        // Проверяем материал стен
        if (filters.wall_material_id && filters.wall_material_id.length > 0) {
            if (!filters.wall_material_id.includes(address.wall_material_id)) return false;
        }
        
        return true;
    }

    /**
     * Дополнительная фильтрация по подсегментам (скопировано из CianListingUpdateService)
     */
    listingMatchesSubsegmentFilters(listings, subsegmentIds, allAddresses) {
        // Простая реализация - в полной версии здесь более сложная логика
        // Пока возвращаем все объявления, так как основная фильтрация уже применена
        return listings;
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

            const objectId = await window.realEstateObjectManager.mergeIntoObject(
                [{ type: 'listing', id: listing.id }],
                addressId
            );

            // Возвращаем информацию о созданном объекте
            return {
                objectId: objectId,
                addressId: addressId,
                listings: [listing.id],
                createdAt: new Date()
            };

        } catch (error) {
            console.error(`❌ [AIDuplicateDetection] Ошибка создания объекта из объявления ${listing.id}:`, error);
            throw error;
        }
    }

    /**
     * Обработка группы объявлений одного адреса (ПРАВИЛЬНЫЙ АЛГОРИТМ)
     * Логика: "новое объявление vs старые релевантные"
     */
    async processAddressGroup(listings, addressId) {
        const results = {
            processed: 0,
            merged: 0,
            analyzed: 0,
            errors: 0
        };

        try {
            console.log(`🎯 [AI-ДУБЛИ] Начало обработки адреса ${addressId} с ${listings.length} объявлениями`);
            
            // Сортируем по дате создания (старые сначала) - хронологический порядок появления
            listings.sort((a, b) => new Date(a.created) - new Date(b.created));
            console.log(`🔄 [AI-ДУБЛИ] Объявления отсортированы хронологически:`);
            listings.forEach((listing, index) => {
                console.log(`   ${index + 1}. ID: ${listing.id}, Дата: ${listing.created}, Тип: ${listing.property_type}, Этаж: ${listing.floor}`);
            });

            const existingObjects = new Map(); // id объявления -> информация об объекте
            
            // Обрабатываем каждое объявление в хронологическом порядке
            for (let i = 0; i < listings.length; i++) {
                const newListing = listings[i];  // Текущее "новое" объявление
                
                console.log(`\n📍 [AI-ДУБЛИ] Обработка объявления ${i + 1}/${listings.length}: ${newListing.id}`);
                console.log(`   Тип: ${newListing.property_type}, Этаж: ${newListing.floor}, Цена: ${newListing.price}`);
                

                // Получаем все СТАРЫЕ объявления (которые появились ДО этого)
                const olderListings = listings.slice(0, i);
                
                if (olderListings.length === 0) {
                    // Самое первое объявление - создаем новый объект
                    console.log(`   ✅ Первое объявление - создаем новый объект`);
                    const objectInfo = await this.createObjectFromSingleListing(newListing, addressId);
                    // НЕ добавляем в processedListings - оно должно участвовать в сравнениях!
                    existingObjects.set(newListing.id, objectInfo);
                    
                    results.processed++;
                    results.merged++;
                    continue;
                }

                console.log(`   🔍 Есть ${olderListings.length} старых объявлений для сравнения`);
                console.log(`   📋 ТЕКУЩЕЕ объявление (модель):`, {
                    id: newListing.id,
                    property_type: newListing.property_type,
                    floor: newListing.floor,
                    price: newListing.price,
                    area_total: newListing.area_total,
                    rooms: newListing.rooms,
                    created: newListing.created
                });
                
                console.log(`   📝 СТАРЫЕ объявления (модели):`);
                olderListings.forEach((listing, idx) => {
                    console.log(`      ${idx + 1}. ID: ${listing.id}, Тип: ${listing.property_type}, Этаж: ${listing.floor}, Цена: ${listing.price}, Площадь: ${listing.area_total}, Комнаты: ${listing.rooms}`);
                });
                
                // Фильтруем старые объявления по релевантности (тип + этаж)
                const relevantOlderListings = this.filterRelevantListings(newListing, olderListings);
                console.log(`   🔧 После фильтрации релевантных: ${relevantOlderListings.length} объявлений`);
                
                if (relevantOlderListings.length === 0) {
                    // Нет релевантных старых объявлений - создаем новый объект
                    console.log(`   ❌ Нет релевантных старых объявлений - создаем новый объект`);
                    const objectInfo = await this.createObjectFromSingleListing(newListing, addressId);
                    // НЕ добавляем в processedListings - оно должно участвовать в сравнениях!
                    existingObjects.set(newListing.id, objectInfo);
                    
                    results.processed++;
                    results.merged++;
                    continue;
                }

                // Ищем дубль среди релевантных старых объявлений
                const duplicateFound = await this.findDuplicateAmongOlder(newListing, relevantOlderListings);
                results.analyzed += relevantOlderListings.length;

                if (duplicateFound) {
                    // Найден дубль - объединяем с существующим объектом
                    await this.mergeWithExistingObject(newListing, duplicateFound, addressId, existingObjects);
                    
                    results.processed++;
                    // merged не увеличиваем - объект уже существовал, мы просто добавили к нему объявление

                } else {
                    // Дубль не найден - создаем новый объект
                    const objectInfo = await this.createObjectFromSingleListing(newListing, addressId);
                    // НЕ добавляем в processedListings - оно должно участвовать в сравнениях!
                    existingObjects.set(newListing.id, objectInfo);
                    
                    results.processed++;
                    results.merged++;
                }
            }

            return results;

        } catch (error) {
            console.error(`❌ [AIDuplicateDetection] Ошибка обработки группы адреса ${addressId}:`, error);
            results.errors++;
            return results;
        }
    }

    /**
     * Фильтрация релевантных старых объявлений по типу и этажу
     */
    filterRelevantListings(newListing, olderListings) {
        console.log(`   🔍 [ФИЛЬТР-1] Начинаем фильтрацию для ${newListing.id} (${newListing.property_type}, этаж ${newListing.floor})`);
        
        const filtered = olderListings.filter((oldListing, index) => {
            console.log(`      📝 Проверяем ${index + 1}/${olderListings.length}: ${oldListing.id} (${oldListing.property_type}, этаж ${oldListing.floor})`);
            
            // Фильтр по типу квартиры (property_type должен совпадать)
            if (newListing.property_type !== oldListing.property_type) {
                console.log(`         ❌ Разные типы: "${newListing.property_type}" ≠ "${oldListing.property_type}"`);
                return false;
            }

            // Фильтр по этажу (разница не более 2 этажей)
            if (!this.isCompatibleFloor(newListing.floor, oldListing.floor)) {
                console.log(`         ❌ Несовместимые этажи: ${newListing.floor} и ${oldListing.floor}`);
                return false;
            }

            console.log(`         ✅ ПРОШЛО фильтр-1!`);
            return true;
        });

        console.log(`   🎯 [ФИЛЬТР-1] Результат: ${filtered.length}/${olderListings.length} прошли`);
        return filtered;
    }

    // Метод isCompatibleRoomType удален - фильтрация по комнатам отключена

    /**
     * Проверка совместимости этажей
     */
    isCompatibleFloor(floor1, floor2) {
        // Если у одного из объявлений не указан этаж - считаем совместимыми
        if (!floor1 || !floor2) {
            return true;
        }

        // Точное совпадение этажей
        return floor1 === floor2;
    }

    /**
     * Поиск дубля среди старых релевантных объявлений
     */
    async findDuplicateAmongOlder(newListing, relevantOlderListings) {
        console.log(`   🤖 [AI-АНАЛИЗ] Ищем дубли для объявления ${newListing.id} среди ${relevantOlderListings.length} старых`);
        
        for (let j = 0; j < relevantOlderListings.length; j++) {
            const oldListing = relevantOlderListings[j];
            console.log(`\n     📋 Сравнение ${j + 1}/${relevantOlderListings.length}: ${newListing.id} vs ${oldListing.id}`);
            console.log(`     Новое: ${newListing.property_type}, этаж ${newListing.floor}, ${newListing.price}₽`);
            console.log(`     Старое: ${oldListing.property_type}, этаж ${oldListing.floor}, ${oldListing.price}₽`);
            
            try {
                // Уровень 2 фильтрации временно отключен для тестирования
                // const compatible = this.areListingsBasicallyCompatible(newListing, oldListing);
                console.log(`     🔧 Базовая совместимость: ✅ ПРОПУЩЕНА (для тестирования)`);
                
                // if (!compatible) {
                //     console.log(`     ⏭️ Пропускаем - не совместимы`);
                //     continue;
                // }

                // AI-анализ: является ли новое объявление дублем старого?
                console.log(`     🤖 Отправляем на AI-анализ...`);
                const isDuplicate = await this.compareListingsWithAI(newListing, oldListing);
                console.log(`     🎯 Результат AI: ${isDuplicate ? '🔥 ДУБЛЬ!' : '❌ НЕ ДУБЛЬ'}`);

                if (isDuplicate) {
                    console.log(`   ✅ [AI-АНАЛИЗ] Найден дубль! Объявление ${newListing.id} = ${oldListing.id}`);
                    return oldListing; // Найден дубль!
                }

            } catch (error) {
                console.error(`     ❌ Ошибка AI-сравнения ${newListing.id} и ${oldListing.id}:`, error);
                continue; // Продолжаем поиск среди других кандидатов
            }
        }

        console.log(`   ❌ [AI-АНАЛИЗ] Дублей не найдено для объявления ${newListing.id}`);
        return null; // Дублей не найдено
    }

    /**
     * Объединение нового объявления с существующим объектом (найден дубль)
     */
    async mergeWithExistingObject(newListing, duplicateOldListing, addressId, existingObjects) {
        try {
            // Получаем информацию об уже существующем объекте
            const existingObjectInfo = existingObjects.get(duplicateOldListing.id);
            
            // Всегда создаем новый объект, включающий все связанные объявления
            // RealEstateObjectManager автоматически обработает дубликаты и обновления
            const itemsToMerge = [
                { type: 'listing', id: duplicateOldListing.id },
                { type: 'listing', id: newListing.id }
            ];

            const objectId = await window.realEstateObjectManager.mergeIntoObject(itemsToMerge, addressId);

            // Обновляем информацию об объекте для нового объявления
            const updatedObjectInfo = {
                objectId: objectId,
                addressId: addressId,
                listings: [duplicateOldListing.id, newListing.id],
                createdAt: existingObjectInfo?.createdAt || new Date(),
                updatedAt: new Date()
            };

            existingObjects.set(newListing.id, updatedObjectInfo);

            return updatedObjectInfo;

        } catch (error) {
            console.error(`❌ [AIDuplicateDetection] Ошибка объединения объявлений ${newListing.id} и ${duplicateOldListing.id}:`, error);
            throw error;
        }
    }

    /**
     * Сравнение двух объявлений с помощью AI
     */
    async compareListingsWithAI(listing1, listing2) {
        // Уровень 2 фильтрации отключен для тестирования
        // if (!this.areListingsBasicallyCompatible(listing1, listing2)) {
        //     return false;
        // }

        try {
            // Подготавливаем данные для AI-анализа
            const listingData1 = this.prepareLightListingData(listing1);
            const listingData2 = this.prepareLightListingData(listing2);

            // Формируем промпт для AI
            const prompt = this.buildDuplicateAnalysisPrompt(listingData1, listingData2);
            console.log(`       📝 [AI-ПРОМПТ] Отправляем промпт:\n${prompt}`);

            // Отправляем запрос к AI
            const response = await this.universalAIService.sendRequest(prompt);
            console.log(`       🤖 [AI-ОТВЕТ] Тип ответа:`, typeof response);
            console.log(`       🤖 [AI-ОТВЕТ] Полный объект:`, response);
            console.log(`       🤖 [AI-ОТВЕТ] JSON stringify:`, JSON.stringify(response, null, 2));

            // Парсим ответ AI
            const result = this.parseAIDuplicateResponse(response);
            console.log(`       🔍 [AI-ПАРСИНГ] Распарсили как: ${result}`);
            return result;

        } catch (error) {
            console.error(`       ❌ [AI-ОШИБКА] Ошибка AI-анализа объявлений ${listing1.id} и ${listing2.id}:`, error);
            // В случае ошибки считаем что это не дубли (консервативный подход)
            return false;
        }
    }

    /**
     * Базовая проверка совместимости объявлений
     */
    areListingsBasicallyCompatible(listing1, listing2) {
        // Проверяем основные параметры, которые должны совпадать у дублей
        
        // Тип недвижимости должен совпадать
        if (listing1.property_type !== listing2.property_type) {
            return false;
        }
        
        // Площадь не должна отличаться более чем на 20%
        if (listing1.area_total && listing2.area_total) {
            const areaDiff = Math.abs(listing1.area_total - listing2.area_total) / 
                           Math.max(listing1.area_total, listing2.area_total);
            if (areaDiff > 0.2) return false;
        }

        // Количество комнат убрано из фильтров - оставляем AI решать

        // Этаж не должен отличаться более чем на 2
        if (listing1.floor && listing2.floor) {
            if (Math.abs(listing1.floor - listing2.floor) > 2) return false;
        }

        // Цена не должна отличаться более чем в 2 раза
        if (listing1.price && listing2.price) {
            const priceRatio = Math.max(listing1.price, listing2.price) / 
                              Math.min(listing1.price, listing2.price);
            if (priceRatio > 2) return false;
        }

        return true;
    }

    /**
     * Подготовка облегченных данных объявления для AI-анализа
     */
    prepareLightListingData(listing) {
        return {
            description: listing.description ? listing.description.substring(0, 500) : null,
            price: listing.price,
            area_total: listing.area_total,
            area_living: listing.area_living,
            area_kitchen: listing.area_kitchen,
            rooms: listing.rooms,
            floor: listing.floor,
            seller_name: listing.seller_name ? listing.seller_name.substring(0, 100) : null,
            updated: listing.updated
        };
    }

    /**
     * Формирование промпта для AI-анализа дубликатов
     */
    buildDuplicateAnalysisPrompt(listing1, listing2) {
        return `Проанализируй два объявления о недвижимости и определи, являются ли они дубликатами (об одном и том же объекте).

ОБЪЯВЛЕНИЕ 1:
${JSON.stringify(listing1, null, 2)}

ОБЪЯВЛЕНИЕ 2:
${JSON.stringify(listing2, null, 2)}

Критерии для определения дубликатов:
1. Очень похожие или идентичные описания
2. Схожие характеристики (площадь, количество комнат, этаж)
3. Близкие цены (могут отличаться из-за переговоров)
4. Одинаковые или очень похожие названия/заголовки
5. Совпадающие контактные данные продавца
6. Схожие временные рамки публикации

Учти что:
- Дубликаты могут быть с разных сайтов (источников)
- Цены могут немного отличаться
- Описания могут быть слегка переформулированы
- Один объект может продаваться через разных риелторов

ВАЖНО: Ответь строго "ДА" если это дубликаты, или "НЕТ" если это разные объекты. Никаких дополнительных слов или объяснений.`;
    }

    /**
     * Парсинг ответа AI на вопрос о дубликатах
     */
    parseAIDuplicateResponse(response) {
        if (!response) return false;

        // Получаем текст ответа из объекта или строки
        const text = (response.content || response.toString()).toUpperCase().trim();
        console.log(`       🔍 [ПАРСЕР] Анализируем текст: "${text}"`);
        
        // Ищем четкие ответы
        if (text.includes('ДА') && !text.includes('НЕТ')) {
            return true;
        }
        
        if (text.includes('НЕТ') && !text.includes('ДА')) {
            return false;
        }

        // Ищем английские варианты
        if (text.includes('YES') && !text.includes('NO')) {
            return true;
        }
        
        if (text.includes('NO') && !text.includes('YES')) {
            return false;
        }

        // По умолчанию считаем что это не дубли (консервативный подход)
        return false;
    }

    /**
     * Получение статистики обработки дублей (с детальной диагностикой)
     */
    async getDuplicateProcessingStats(filters = null) {
        try {
            const allListings = await this.databaseManager.getAll('listings');
            console.log('🔍 [ДИАГНОСТИКА] Всего объявлений в БД:', allListings.length);

            // Анализ статусов объявлений
            const statusAnalysis = {};
            allListings.forEach(listing => {
                const status = listing.processing_status || 'undefined';
                statusAnalysis[status] = (statusAnalysis[status] || 0) + 1;
            });
            console.log('🔍 [ДИАГНОСТИКА] Распределение по статусам:', statusAnalysis);

            // Фильтр по наличию адреса
            let candidateListings = allListings.filter(listing => listing.address_id);
            console.log('🔍 [ДИАГНОСТИКА] Объявлений с адресами:', candidateListings.length);

            // Применение сегментных фильтров
            let beforeFilterCount = candidateListings.length;
            if (filters && (filters.segments?.length > 0 || filters.subsegments?.length > 0)) {
                console.log('🔍 [ДИАГНОСТИКА] Применяем фильтры:', filters);
                candidateListings = await this.applySegmentFilters(candidateListings, filters);
                console.log('🔍 [ДИАГНОСТИКА] После фильтрации сегментов:', candidateListings.length, 'из', beforeFilterCount);
                
                // Дополнительная диагностика фильтрации
                if (candidateListings.length === 0 && beforeFilterCount > 0) {
                    console.log('⚠️ [ДИАГНОСТИКА] Все объявления отфильтрованы! Проверяем причины...');
                    await this.debugFilteringProcess(allListings.slice(0, 5), filters);
                }
            }

            const stats = {
                total: candidateListings.length,
                needProcessing: candidateListings.filter(l => l.processing_status === 'duplicate_check_needed').length,
                processed: candidateListings.filter(l => l.processing_status === 'processed').length,
                hasObjects: candidateListings.filter(l => l.object_id).length
            };

            stats.efficiency = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

            console.log('🔍 [ДИАГНОСТИКА] Финальная статистика:', stats);

            return stats;

        } catch (error) {
            console.error('❌ [AIDuplicateDetection] Ошибка получения статистики:', error);
            throw error;
        }
    }

    /**
     * Диагностика процесса фильтрации
     */
    async debugFilteringProcess(sampleListings, filters) {
        console.log('🔍 [ДИАГНОСТИКА] Анализируем первые 5 объявлений:');
        
        for (const listing of sampleListings.slice(0, 5)) {
            if (!listing.address_id) {
                console.log(`• Объявление ${listing.id}: НЕТ АДРЕСА`);
                continue;
            }

            try {
                const address = await this.databaseManager.get('addresses', listing.address_id);
                if (!address) {
                    console.log(`• Объявление ${listing.id}: АДРЕС НЕ НАЙДЕН (${listing.address_id})`);
                    continue;
                }

                console.log(`• Объявление ${listing.id}:`, {
                    address_id: listing.address_id,
                    segment_id: address.segment_id,
                    status: listing.processing_status,
                    filters: filters
                });

                // Проверка фильтра сегментов
                if (filters.segments?.length > 0) {
                    const segmentMatch = filters.segments.includes(address.segment_id);
                    console.log(`  - Сегмент ${address.segment_id} в фильтре [${filters.segments.join(', ')}]: ${segmentMatch ? 'ДА' : 'НЕТ'}`);
                }

            } catch (error) {
                console.log(`• Объявление ${listing.id}: ОШИБКА`, error.message);
            }
        }
    }

    /**
     * Тестовый метод для обработки одного адреса с максимальным количеством объявлений
     * @param {string} addressId - ID адреса для тестирования
     * @param {Function} progressCallback - Callback для отображения прогресса
     */
    async processSingleAddressTest(addressId, progressCallback = null) {
        if (!this.initialized) await this.init();

        try {
            // Получаем информацию об адресе
            const address = await this.databaseManager.get('addresses', addressId);
            if (!address) {
                throw new Error(`Адрес с ID ${addressId} не найден`);
            }

            progressCallback?.({
                stage: 'analyzing',
                message: `Анализ адреса: ${address.full_address}`,
                progress: 10
            });

            // Получаем все объявления для данного адреса
            const allListingsForAddress = await this.databaseManager.getByIndex('listings', 'address_id', addressId);
            let listingsForProcessing = allListingsForAddress.filter(listing => 
                listing.processing_status === 'duplicate_check_needed'
            );

            console.log(`🎯 [ТЕСТ] Найдено ${listingsForProcessing.length} объявлений для обработки по адресу:`, address.full_address);

            if (listingsForProcessing.length < 2) {
                progressCallback?.({
                    stage: 'completed',
                    message: `Адрес содержит менее 2 объявлений для анализа дублей`,
                    progress: 100
                });
                return { processed: 0, merged: 0, errors: 0, analyzed: 0 };
            }

            // ТЕСТ: ограничиваем 5 объявлениями для быстрого тестирования
            if (listingsForProcessing.length > 5) {
                listingsForProcessing = listingsForProcessing.slice(0, 5);
                console.log(`🔬 [ТЕСТ] Ограничиваем тест первыми 5 объявлениями`);
            }

            // Обрабатываем группу объявлений
            progressCallback?.({
                stage: 'processing',
                message: `Обработка ${listingsForProcessing.length} объявлений...`,
                progress: 30
            });

            const result = await this.processAddressGroup(listingsForProcessing, addressId);

            progressCallback?.({
                stage: 'completed',
                message: `Тест завершен. Обработано: ${result.processed}, Объединено: ${result.merged}`,
                progress: 100
            });

            return result;

        } catch (error) {
            console.error('❌ Ошибка тестирования одного адреса:', error);
            progressCallback?.({
                stage: 'error',
                message: `Ошибка: ${error.message}`,
                progress: 100
            });
            throw error;
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIDuplicateDetectionService;
}

// Глобальный экспорт для браузера
if (typeof window !== 'undefined') {
    window.AIDuplicateDetectionService = AIDuplicateDetectionService;
}