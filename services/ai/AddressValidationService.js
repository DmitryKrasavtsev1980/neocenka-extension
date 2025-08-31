/**
 * Сервис валидации и AI-определения адресов
 * Работает с объявлениями, где ML-алгоритм не смог определить адрес
 */

class AddressValidationService {
    constructor(config = {}) {
        this.config = {
            maxDistance: 500, // Радиус поиска в метрах
            aiPromptTemplate: this.getAIPromptTemplate(),
            batchSize: 5, // Обрабатываем по 5 объявлений за раз
            ...config
        };
        
        this.universalAI = null;
        this.db = null;
        this.addressManager = null;
        this.smartMatcher = null;
        
        this.stats = {
            processed: 0,
            foundByAI: 0,
            validated: 0,
            errors: 0,
            distanceIssues: 0
        };
    }
    
    /**
     * Инициализация сервиса
     */
    async initialize(dependencies = {}) {
        this.db = dependencies.db || window.db;
        this.addressManager = dependencies.addressManager || window.addressManager;
        this.smartMatcher = dependencies.smartMatcher || window.smartAddressMatcher;
        this.universalAI = dependencies.universalAI;
        
        if (!this.db || !this.addressManager || !this.smartMatcher || !this.universalAI) {
            throw new Error('AddressValidationService: Missing required dependencies');
        }
    }
    
    /**
     * Основной метод - определение адресов через AI
     */
    async findAddressesWithAI(progressCallback = null, filters = null) {
        try {
            // 1. Находим объявления без адресов
            const unprocessedListings = await this.getUnprocessedListings(filters);
            
            if (unprocessedListings.length === 0) {
                return {
                    success: true,
                    message: '📍 Все объявления уже имеют определенные адреса',
                    stats: this.stats
                };
            }
            
            console.log(`🤖 AI-определение адресов для ${unprocessedListings.length} объявлений`);
            console.log('🔍 Примеры необработанных объявлений:');
            unprocessedListings.slice(0, 3).forEach((listing, i) => {
                console.log(`${i+1}. ID: ${listing.id}`);
                console.log(`   Адрес: "${listing.address || 'НЕТ'}"`);
                console.log(`   title: "${listing.title?.substring(0, 50)}..."`);
                console.log(`   address_id: ${listing.address_id || 'НЕТ'}`);
                console.log(`   confidence: ${listing.address_match_confidence || 'НЕТ'}`);
                console.log(`   coordinates: ${listing.coordinates ? 'есть' : 'НЕТ'}`);
                console.log(`   status: ${listing.status}`);
                console.log('---');
            });
            
            // 2. Обрабатываем батчами
            const results = [];
            for (let i = 0; i < unprocessedListings.length; i += this.config.batchSize) {
                const batch = unprocessedListings.slice(i, i + this.config.batchSize);
                const batchResults = await this.processBatch(batch);
                results.push(...batchResults);
                
                // Отчёт о прогрессе каждые 10 объявлений или в конце
                const processedCount = Math.min(i + batch.length, unprocessedListings.length);
                const shouldReport = processedCount % 10 === 0 || processedCount === unprocessedListings.length;
                
                if (progressCallback && shouldReport) {
                    try {
                        await progressCallback({
                            processed: processedCount,
                            total: unprocessedListings.length,
                            found: this.stats.foundByAI,
                            errors: this.stats.errors
                        });
                    } catch (error) {
                        console.warn('Ошибка в прогресс-коллбеке:', error);
                        // Не прерываем обработку из-за ошибки в UI
                    }
                }
                
                // Пауза между батчами
                if (i + this.config.batchSize < unprocessedListings.length) {
                    await this.delay(2000);
                }
            }
            
            return {
                success: true,
                message: this.formatResults(),
                stats: this.stats,
                results: results
            };
            
        } catch (error) {
            console.error('❌ Ошибка AI-определения адресов:', error);
            return {
                success: false,
                message: `❌ Ошибка AI-определения: ${error.message}`,
                stats: this.stats
            };
        }
    }
    
    /**
     * Проверка точности определенных адресов
     */
    async validateAddressAccuracy(progressCallback = null, filters = null) {
        try {
            // Находим объявления с distance > 50м
            const suspiciousListings = await this.getSuspiciousDistanceListings(filters);
            
            if (suspiciousListings.length === 0) {
                return {
                    success: true,
                    message: '✅ Все определенные адреса имеют приемлемую точность (<50м)',
                    stats: { checked: 0, suspicious: 0 }
                };
            }
            
            console.log(`🔍 Проверка точности ${suspiciousListings.length} адресов`);
            
            if (progressCallback) {
                await progressCallback({
                    processed: 0,
                    total: suspiciousListings.length,
                    stage: 'analysis'
                });
            }
            
            const analysis = await this.analyzeDistanceIssues(suspiciousListings, progressCallback);
            
            return {
                success: true,
                message: this.formatDistanceAnalysis(analysis),
                stats: analysis.stats,
                recommendations: analysis.recommendations
            };
            
        } catch (error) {
            console.error('❌ Ошибка проверки точности:', error);
            return {
                success: false,
                message: `❌ Ошибка проверки точности: ${error.message}`
            };
        }
    }
    
    /**
     * Получение объявлений без адресов (используем проверенный метод из DuplicatesManager)
     */
    async getUnprocessedListings(filters = null) {
        // Используем готовый метод для получения объявлений из области
        let listingsInArea = [];
        
        if (window.duplicatesManager && window.duplicatesManager.getListingsInArea) {
            listingsInArea = await window.duplicatesManager.getListingsInArea();
        } else {
            console.warn('⚠️ DuplicatesManager не найден, используем fallback метод');
            // Fallback к нашему старому методу
            const allListings = await this.db.getAll('listings');
            const currentArea = window.dataState?.getState('currentArea');
            
            if (currentArea && currentArea.polygon) {
                listingsInArea = allListings.filter(listing => {
                    if (!listing.coordinates?.lat || !(listing.coordinates.lng || listing.coordinates.lon)) {
                        return false;
                    }
                    const lat = parseFloat(listing.coordinates.lat);
                    const lng = parseFloat(listing.coordinates.lng || listing.coordinates.lon);
                    return window.db.isPointInPolygon({lat, lng}, currentArea.polygon);
                });
            } else {
                listingsInArea = allListings;
            }
        }
        
        console.log(`🎯 Найдено ${listingsInArea.length} объявлений в области`);
        
        // Применяем фильтры сегментов/подсегментов если они заданы
        if (filters && (filters.segments.length > 0 || filters.subsegments.length > 0)) {
            listingsInArea = await this.applySegmentFilters(listingsInArea, filters);
            console.log(`🔍 После применения фильтров: ${listingsInArea.length} объявлений`);
        }
        
        // Статистика по статусам обработки
        const aiProcessed = listingsInArea.filter(l => l.address_match_method === 'ai_analysis').length;
        const withoutAddress = listingsInArea.filter(l => !l.address_id).length;
        const veryLowConfidence = listingsInArea.filter(l => l.address_match_confidence === 'very_low').length;
        
        console.log(`📊 Статистика:`);
        console.log(`   • Уже обработано AI: ${aiProcessed}`);
        console.log(`   • Без адреса: ${withoutAddress}`);
        console.log(`   • Очень низкая точность: ${veryLowConfidence}`);
        
        // Фильтруем только объявления без адресов или с низким качеством, НО исключаем уже обработанные AI
        const needsProcessing = listingsInArea.filter(listing => {
            const needsProcessing = (!listing.address_id || 
                listing.address_match_confidence === 'very_low') &&
                listing.address_match_method !== 'ai_analysis'; // НЕ обрабатывать повторно AI
            return needsProcessing;
        });
        
        console.log(`🔍 Итого требуют обработки AI: ${needsProcessing.length}`);
        return needsProcessing;
    }

    /**
     * Применение фильтров сегментов/подсегментов к объявлениям
     */
    async applySegmentFilters(listings, filters) {
        if (!filters || (!filters.segments.length && !filters.subsegments.length)) {
            return listings;
        }

        try {
            // Загружаем объекты недвижимости для получения связи listing -> segment
            const allRealEstateObjects = await this.db.getAll('real_estate_objects');
            
            // Создаем мапу listing_id -> segment_id через объекты недвижимости
            const listingToSegmentMap = new Map();
            
            allRealEstateObjects.forEach(obj => {
                if (obj.listings && Array.isArray(obj.listings)) {
                    obj.listings.forEach(listingId => {
                        listingToSegmentMap.set(listingId, obj.segment_id);
                    });
                }
            });

            // Фильтруем объявления по сегментам/подсегментам
            const filteredListings = listings.filter(listing => {
                const segmentId = listingToSegmentMap.get(listing.id);
                
                if (!segmentId) {
                    return false; // Объявление не привязано к сегменту
                }

                // Проверяем фильтры по сегментам
                if (filters.segments.length > 0 && filters.segments.includes(segmentId)) {
                    return true;
                }

                // Проверяем фильтры по подсегментам
                if (filters.subsegments.length > 0) {
                    // Нужно найти подсегмент для данного объявления
                    const realEstateObj = allRealEstateObjects.find(obj => 
                        obj.listings && obj.listings.includes(listing.id)
                    );
                    
                    if (realEstateObj && realEstateObj.subsegment_id && 
                        filters.subsegments.includes(realEstateObj.subsegment_id)) {
                        return true;
                    }
                }

                return false;
            });

            console.log(`🔍 Фильтр по сегментам/подсегментам: ${listings.length} → ${filteredListings.length} объявлений`);
            
            return filteredListings;

        } catch (error) {
            console.error('❌ Ошибка применения фильтров сегментов:', error);
            return listings; // В случае ошибки возвращаем оригинальный список
        }
    }
    
    /**
     * Получение объявлений с подозрительными расстояниями
     */
    async getSuspiciousDistanceListings(filters = null) {
        // Используем готовый метод для получения объявлений из области
        let listingsInArea = [];
        
        if (window.duplicatesManager && window.duplicatesManager.getListingsInArea) {
            listingsInArea = await window.duplicatesManager.getListingsInArea();
        } else {
            console.warn('⚠️ DuplicatesManager не найден для getSuspiciousDistanceListings');
            const allListings = await this.db.getAll('listings');
            const currentArea = window.dataState?.getState('currentArea');
            
            if (currentArea && currentArea.polygon) {
                listingsInArea = allListings.filter(listing => {
                    if (!listing.coordinates?.lat || !(listing.coordinates.lng || listing.coordinates.lon)) {
                        return false;
                    }
                    const lat = parseFloat(listing.coordinates.lat);
                    const lng = parseFloat(listing.coordinates.lng || listing.coordinates.lon);
                    return window.db.isPointInPolygon({lat, lng}, currentArea.polygon);
                });
            } else {
                listingsInArea = allListings;
            }
        }
        
        // Фильтруем только объявления с подозрительным расстоянием
        return listingsInArea.filter(listing => {
            return listing.address_id && 
                   listing.address_distance && 
                   listing.address_distance > 50;
        });
    }
    
    /**
     * Обработка батча объявлений
     */
    async processBatch(listings) {
        const results = [];
        
        for (const listing of listings) {
            try {
                this.stats.processed++;
                
                // Находим ближайшие адреса в радиусе 500м
                const nearbyAddresses = await this.findNearbyAddresses(listing);
                
                if (nearbyAddresses.length === 0) {
                    console.log(`⚠️  Объявление ${listing.id}: НЕТ адресов в радиусе 500м от координат ${listing.coordinates.lat}, ${listing.coordinates.lng || listing.coordinates.lon}`);
                    results.push({
                        listingId: listing.id,
                        success: false,
                        reason: 'Нет адресов в радиусе 500м'
                    });
                    continue;
                }
                
                // AI-анализ для определения лучшего соответствия
                const aiResult = await this.analyzeWithAI(listing, nearbyAddresses);
                
                if (aiResult.success && aiResult.selectedAddress) {
                    // Сохраняем найденный адрес
                    await this.assignAddress(listing, aiResult.selectedAddress);
                    
                    this.stats.foundByAI++;
                    results.push({
                        listingId: listing.id,
                        success: true,
                        addressId: aiResult.selectedAddress.id,
                        distance: aiResult.distance,
                        reason: aiResult.reason
                    });
                } else {
                    // AI не смог определить адрес - НЕ помечаем объявление
                    // Оно останется доступным для повторной обработки после добавления новых адресов
                    console.log(`🚫 Объявление ${listing.id}: AI не смог определить адрес - оставляем для повторной обработки`);
                    results.push({
                        listingId: listing.id,
                        success: false,
                        reason: aiResult.reason || 'AI не смог определить адрес'
                    });
                }
                
            } catch (error) {
                this.stats.errors++;
                console.error(`❌ Ошибка обработки объявления ${listing.id}:`, error);
                results.push({
                    listingId: listing.id,
                    success: false,
                    reason: `Ошибка: ${error.message}`
                });
            }
        }
        
        return results;
    }
    
    /**
     * Поиск ближайших адресов в радиусе
     */
    async findNearbyAddresses(listing) {
        const allAddresses = await this.db.getAll('addresses');
        const listingCoords = {
            lat: listing.coordinates.lat,
            lng: listing.coordinates.lng || listing.coordinates.lon
        };
        
        const nearby = [];
        
        for (const address of allAddresses) {
            if (!address.coordinates) continue;
            
            const distance = this.calculateDistance(listingCoords, address.coordinates);
            
            if (distance <= this.config.maxDistance) {
                nearby.push({
                    ...address,
                    distance: distance
                });
            }
        }
        
        // Сортируем по расстоянию
        return nearby.sort((a, b) => a.distance - b.distance).slice(0, 10); // Берем топ-10 ближайших
    }
    
    /**
     * AI-анализ для выбора подходящего адреса
     */
    async analyzeWithAI(listing, nearbyAddresses) {
        try {
            const prompt = this.buildAIPrompt(listing, nearbyAddresses);
            
            console.log(`\n🔍 AI АНАЛИЗ для объявления ${listing.id}:`);
            console.log(`📍 Координаты: ${listing.coordinates.lat}, ${listing.coordinates.lng || listing.coordinates.lon}`);
            console.log(`🏠 Адрес в объявлении: "${listing.address}"`);
            console.log(`📝 Найдено ${nearbyAddresses.length} ближайших адресов в радиусе 500м`);
            console.log('📋 Адреса для сравнения:');
            nearbyAddresses.forEach((addr, i) => {
                console.log(`  ${i+1}. "${addr.address}" (${Math.round(addr.distance)}м)`);
                console.log(`      ID: ${addr.id}`);
                console.log(`      Координаты: ${addr.coordinates?.lat}, ${addr.coordinates?.lng}`);
            });
            
            console.log('\n📨 ЗАПРОС К AI:');
            console.log(prompt);
            
            const response = await this.universalAI.sendRequest(prompt, {
                taskType: 'analysis',
                language: 'ru',
                maxTokens: 500
            });
            
            console.log('\n📥 ОТВЕТ ОТ AI:');
            console.log(response.content);
            
            const result = this.parseAIResponse(response.content, nearbyAddresses);
            
            console.log('\n🎯 РЕЗУЛЬТАТ ПАРСИНГА:');
            console.log(JSON.stringify(result, null, 2));
            console.log('---\n');
            
            return result;
            
        } catch (error) {
            console.error('❌ Ошибка AI-анализа:', error);
            return {
                success: false,
                reason: `Ошибка AI-анализа: ${error.message}`
            };
        }
    }
    
    /**
     * Построение промпта для AI
     */
    buildAIPrompt(listing, nearbyAddresses) {
        const addressesList = nearbyAddresses.map((addr, index) => 
            `${index + 1}. ${addr.address} (${Math.round(addr.distance)}м)`
        ).join('\n');
        
        return `Точно определи подходящий адрес из списка для данного объявления.

**Адрес в объявлении:**
"${listing.address || 'Не указан'}"

**Ближайшие адреса в радиусе 500м:**
${addressesList}

**КРИТИЧЕСКИ ВАЖНЫЕ правила сопоставления:**
1. ОБЯЗАТЕЛЬНО: Улица И номер дома должны ПОЛНОСТЬЮ совпадать
2. РАЗНЫЕ НОМЕРА ДОМОВ = РАЗНЫЕ АДРЕСА! (дом 8 ≠ дом 14 ≠ дом 17)  
3. ЗАПРЕЩЕНО выбирать "ближайший" дом - только ТОЧНОЕ совпадение номера
4. Если точного номера дома НЕТ в списке - это ВСЕГДА selectedIndex: null
5. НЕ УГАДЫВАЙ! Лучше вернуть null, чем выбрать неправильный дом
6. Проверяй номер дома ДВАЖДЫ перед ответом!

**Формат ответа (только JSON):**
{
  "selectedIndex": число (1-${nearbyAddresses.length}) или null,
  "reason": "краткое объяснение с указанием номеров домов"
}

**КРИТИЧНЫЕ примеры:**
- Объявление: "Академическая ул., 14", в списке есть дом 8,10,13,15,17 → selectedIndex: null (дома 14 НЕТ в списке!)
- "6-р Молодёжи, 40" и в списке "6-р. Молодёжи, д. 30" → selectedIndex: null (40 ≠ 30)
- "ул. Ленина, 25" и в списке "Ленина, 25" → selectedIndex: номер (ТОЧНОЕ совпадение)`;
    }
    
    /**
     * Парсинг ответа AI
     */
    parseAIResponse(aiResponse, nearbyAddresses) {
        try {
            // Пытаемся найти JSON в ответе
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('JSON не найден в ответе AI');
            }
            
            const parsed = JSON.parse(jsonMatch[0]);
            
            if (parsed.selectedIndex === null || parsed.selectedIndex === undefined) {
                return {
                    success: false,
                    reason: parsed.reason || 'AI не нашел подходящий адрес'
                };
            }
            
            const selectedAddress = nearbyAddresses[parsed.selectedIndex - 1];
            if (!selectedAddress) {
                throw new Error('Некорректный индекс адреса');
            }
            
            return {
                success: true,
                selectedAddress: selectedAddress,
                distance: selectedAddress.distance,
                reason: parsed.reason
            };
            
        } catch (error) {
            console.error('❌ Ошибка парсинга ответа AI:', error);
            return {
                success: false,
                reason: `Ошибка парсинга ответа AI: ${error.message}`
            };
        }
    }
    
    /**
     * Присвоение адреса объявлению
     */
    async assignAddress(listing, address) {
        const updatedListing = {
            ...listing,
            address_id: address.id,
            address_match_confidence: 'high',
            address_match_method: 'ai_analysis',
            address_match_score: 0.85,
            address_distance: address.distance,
            processing_status: 'duplicate_check_needed',
            updated_at: new Date()
        };
        
        await this.db.update('listings', updatedListing);
    }
    
    /**
     * Анализ проблем с расстояниями
     */
    async analyzeDistanceIssues(suspiciousListings, progressCallback = null) {
        const analysis = {
            stats: {
                total: suspiciousListings.length,
                checked: 0,
                corrected: 0,
                confirmed: 0,
                failed: 0,
                byDistance: { '50-100м': 0, '100-200м': 0, '200м+': 0 },
                byConfidence: { high: 0, medium: 0, low: 0, very_low: 0 }
            },
            recommendations: []
        };
        
        console.log(`🔍 AI-анализ точности для ${suspiciousListings.length} подозрительных адресов`);
        
        // AI-анализ каждого подозрительного объявления
        for (let i = 0; i < suspiciousListings.length; i++) {
            const listing = suspiciousListings[i];
            const distance = listing.address_distance;
            const confidence = listing.address_match_confidence;
            
            // Статистика по расстояниям
            if (distance <= 100) analysis.stats.byDistance['50-100м']++;
            else if (distance <= 200) analysis.stats.byDistance['100-200м']++;
            else analysis.stats.byDistance['200м+']++;
            
            // Статистика по уровням доверия
            analysis.stats.byConfidence[confidence] = (analysis.stats.byConfidence[confidence] || 0) + 1;
            
            // Прогресс каждые 10 объявлений
            if (progressCallback && (i % 10 === 0 || i === suspiciousListings.length - 1)) {
                await progressCallback({
                    processed: i + 1,
                    total: suspiciousListings.length,
                    stage: 'validation'
                });
            }
            
            try {
                // AI-анализ адреса: правильный ли адрес назначен с учетом расстояния
                const aiValidation = await this.validateAddressWithAI(listing);
                
                if (aiValidation.needsCorrection) {
                    // AI считает, что адрес неверный - СБРАСЫВАЕМ для повторного определения
                    analysis.stats.corrected++;
                    console.log(`🔧 Объявление ${listing.id}: AI отклоняет адрес (${Math.round(distance)}м) - ${aiValidation.reason}`);
                    
                    // Сбрасываем неправильный адрес для повторного определения AI
                    listing.address_id = null;
                    listing.address_match_confidence = null;
                    listing.address_match_method = null;
                    listing.address_distance = null;
                    listing.processing_status = 'address_needed';
                    await this.db.update('listings', listing);
                } else {
                    // AI подтверждает правильность адреса
                    analysis.stats.confirmed++;
                    listing.processing_status = 'duplicate_check_needed';
                    await this.db.update('listings', listing);
                    console.log(`✅ Объявление ${listing.id}: AI подтверждает адрес (${Math.round(distance)}м) - ${aiValidation.reason}`);
                }
                
                analysis.stats.checked++;
                
            } catch (error) {
                console.error(`❌ Ошибка AI-анализа адреса для объявления ${listing.id}:`, error);
                analysis.stats.failed++;
            }
        }
        
        // Формируем рекомендации
        if (analysis.stats.byDistance['200м+'] > 0) {
            analysis.recommendations.push(`🔴 Критично: ${analysis.stats.byDistance['200м+']} адресов с расстоянием >200м`);
        }
        
        if (analysis.stats.corrected > 0) {
            analysis.recommendations.push(`🔧 Исправлено: ${analysis.stats.corrected} неточных адресов`);
        }
        
        if (analysis.stats.confirmed > analysis.stats.corrected) {
            analysis.recommendations.push(`✅ Большинство адресов подтверждены AI как корректные`);
        }
        
        return analysis;
    }
    
    /**
     * AI-валидация точности назначенного адреса
     */
    async validateAddressWithAI(listing) {
        try {
            // Получаем назначенный адрес
            const assignedAddress = await this.db.get('addresses', listing.address_id);
            if (!assignedAddress) {
                return { needsCorrection: true, reason: 'Назначенный адрес не найден в базе' };
            }
            
            const distance = Math.round(listing.address_distance);
            const listingAddress = listing.address || 'Адрес не указан';
            
            // Промпт для проверки соответствия адресов
            const prompt = `Проверь соответствие адресов с учетом расстояния между ними.

**Адрес в объявлении:**
"${listingAddress}"

**Назначенный адрес из справочника:**
"${assignedAddress.address}"

**Расстояние между ними:** ${distance} метров

**Задача:** Определи, правильно ли назначен адрес из справочника для данного объявления.

**СТРОГИЕ критерии (абсолютная точность):**
1. КОРРЕКТНО: Только точное совпадение улицы И номера дома
2. ОШИБКА: Любые другие случаи (разные улицы, разные номера домов, отсутствие номера)
3. ОСОБО КРИТИЧНО: Расстояние >100м практически всегда означает ошибку

**Формат ответа (только JSON):**
{
  "needsCorrection": true/false,
  "reason": "краткое объяснение решения",
  "confidence": "high|medium|low"
}`;

            const response = await this.universalAI.sendRequest(prompt, {
                taskType: 'analysis',
                language: 'ru',
                maxTokens: 300
            });
            
            // Парсинг ответа AI
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('AI не вернул валидный JSON');
            }
            
            const aiResponse = JSON.parse(jsonMatch[0]);
            
            console.log(`🔍 AI валидация: ${listing.id} - ${aiResponse.needsCorrection ? 'ИСПРАВИТЬ' : 'ПОДТВЕРДИТЬ'} (${aiResponse.reason})`);
            
            return {
                needsCorrection: aiResponse.needsCorrection || false,
                reason: aiResponse.reason || 'Причина не указана',
                confidence: aiResponse.confidence || 'medium'
            };
            
        } catch (error) {
            console.error('❌ Ошибка AI-валидации адреса:', error);
            return {
                needsCorrection: false,
                reason: `Ошибка анализа: ${error.message}`,
                confidence: 'low'
            };
        }
    }
    
    /**
     * Форматирование результатов AI-определения
     */
    formatResults() {
        const successRate = this.stats.processed > 0 ? 
            ((this.stats.foundByAI / this.stats.processed) * 100).toFixed(1) : 0;
            
        return `🤖 **AI-определение адресов завершено:**

📊 **Статистика:**
• Обработано объявлений: ${this.stats.processed}
• Найдено адресов через AI: ${this.stats.foundByAI}
• Успешность AI: ${successRate}%
• Ошибок: ${this.stats.errors}

${this.stats.foundByAI > 0 ? '✅ AI-алгоритм успешно определил дополнительные адреса!' : '❌ AI не смог определить адреса для данных объявлений'}`;
    }
    
    /**
     * Форматирование анализа расстояний
     */
    formatDistanceAnalysis(analysis) {
        const { stats, recommendations } = analysis;
        
        let message = `🔍 **AI-анализ точности адресов:**

📊 **Найдено ${stats.total} адресов с расстоянием >50м:**
• Проверено AI: ${stats.checked}
• Исправлено: ${stats.corrected}
• Подтверждено: ${stats.confirmed}
• Ошибок анализа: ${stats.failed}

**По расстояниям:**
• 50-100м: ${stats.byDistance['50-100м']} объявлений
• 100-200м: ${stats.byDistance['100-200м']} объявлений  
• Более 200м: ${stats.byDistance['200м+']} объявлений

**По уровням доверия:**
• Высокое: ${stats.byConfidence.high || 0}
• Среднее: ${stats.byConfidence.medium || 0}
• Низкое: ${stats.byConfidence.low || 0}
• Очень низкое: ${stats.byConfidence.very_low || 0}`;

        if (recommendations.length > 0) {
            message += `\n\n**🎯 Рекомендации:**\n${recommendations.map(r => `• ${r}`).join('\n')}`;
        }
        
        return message;
    }
    
    /**
     * Вычисление расстояния между координатами (формула гаверсинуса)
     */
    calculateDistance(coord1, coord2) {
        const R = 6371000; // Радиус Земли в метрах
        const lat1Rad = (coord1.lat * Math.PI) / 180;
        const lat2Rad = (coord2.lat * Math.PI) / 180;
        const deltaLatRad = ((coord2.lat - coord1.lat) * Math.PI) / 180;
        const deltaLngRad = ((coord2.lng - coord1.lng) * Math.PI) / 180;

        const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
                  Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                  Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
    
    /**
     * AI промпт шаблон
     */
    getAIPromptTemplate() {
        return {
            systemRole: 'Ты специалист по анализу адресов недвижимости. Твоя задача - точно сопоставлять описания объявлений с реальными адресами.',
            guidelines: [
                'Анализируй текст объявления на предмет упоминания улиц, домов, районов',
                'Учитывай расстояние до предложенных адресов',
                'Приоритет отдавай точным совпадениям в тексте',
                'Если нет четких совпадений, выбирай ближайший по расстоянию',
                'Если ни один адрес не подходит, честно сообщи об этом'
            ]
        };
    }
    
    /**
     * Задержка
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Получение статистики
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * Сброс статистики
     */
    resetStats() {
        this.stats = {
            processed: 0,
            foundByAI: 0,
            validated: 0,
            errors: 0,
            distanceIssues: 0
        };
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AddressValidationService;
} else {
    window.AddressValidationService = AddressValidationService;
}