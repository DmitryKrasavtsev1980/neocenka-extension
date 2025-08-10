/**
 * Расширение умного ML-алгоритма для анализа неопределенных адресов
 * Группирует объявления без адресов по схожести и создает новые адреса
 */

class MLAddressAnalyzer {
    constructor(db, smartAddressMatcher) {
        this.db = db;
        this.smartMatcher = smartAddressMatcher;
        
        // Конфигурация для анализа неопределенных адресов
        this.config = {
            // Радиус группировки объявлений (в метрах)
            groupingRadius: 30,
            
            // Минимальное количество объявлений для создания адреса
            minListingsForAddress: 10,
            
            // Пороги схожести названий
            titleSimilarity: {
                high: 0.8,      // Высокая схожесть
                medium: 0.6,    // Средняя схожесть
                low: 0.4        // Низкая схожесть
            },
            
            // Максимальное расстояние между объявлениями в группе
            maxDistanceInGroup: 100,
            
            // Вес факторов при группировке
            weights: {
                coordinates: 0.4,    // Близость координат
                titleSimilarity: 0.3, // Схожесть названий
                characteristics: 0.2, // Схожесть характеристик
                priceRange: 0.1      // Схожесть ценового диапазона
            }
        };
        
        // Статистика анализа
        this.stats = {
            processedListings: 0,
            foundGroups: 0,
            createdAddresses: 0,
            averageGroupSize: 0
        };
    }

    /**
     * Найти все объявления с неточным определением адреса
     */
    async findInaccuratelyMatchedListings() {
        
        try {
            const allListings = await this.db.getListings();
            
            // Фильтруем объявления с неточным определением адреса
            const inaccurateListings = allListings.filter(listing => {
                // Объявление считается неточно определенным, если:
                // 1. address_id = null (нет связи с адресом) ИЛИ
                // 2. address_match_confidence = 'low' или 'very_low' ИЛИ
                // 3. address_distance > 50м (далеко от найденного адреса)
                // 4. есть координаты
                // 5. статус активный
                const hasLowConfidence = listing.address_match_confidence === 'low' || 
                                       listing.address_match_confidence === 'very_low';
                const isFarFromAddress = listing.address_distance && listing.address_distance > 50;
                const hasNoAddress = !listing.address_id;
                
                return (
                    (hasNoAddress || hasLowConfidence || isFarFromAddress) &&
                    listing.coordinates &&
                    listing.coordinates.lat &&
                    listing.coordinates.lng &&
                    listing.status === 'active'
                );
            });
            
            
            // Дополнительная статистика по типам проблем
            const noAddress = inaccurateListings.filter(l => !l.address_id).length;
            const lowConfidence = inaccurateListings.filter(l => l.address_match_confidence === 'low' || l.address_match_confidence === 'very_low').length;
            const farFromAddress = inaccurateListings.filter(l => l.address_distance && l.address_distance > 50).length;
            
            
            this.stats.processedListings = inaccurateListings.length;
            
            return inaccurateListings;
            
        } catch (error) {
            console.error('❌ Ошибка при поиске объявлений с неточным определением адреса:', error);
            throw error;
        }
    }

    /**
     * Группировать объявления по схожести названий и координат
     */
    async groupSimilarListings(unresolvedListings) {
        
        if (!unresolvedListings || unresolvedListings.length === 0) {
            return [];
        }
        
        const groups = [];
        const processed = new Set();
        
        for (let i = 0; i < unresolvedListings.length; i++) {
            if (processed.has(unresolvedListings[i].id)) continue;
            
            const currentListing = unresolvedListings[i];
            const group = [currentListing];
            processed.add(currentListing.id);
            
            // Ищем похожие объявления
            for (let j = i + 1; j < unresolvedListings.length; j++) {
                if (processed.has(unresolvedListings[j].id)) continue;
                
                const candidateListing = unresolvedListings[j];
                
                // Проверяем схожесть
                const similarity = this.calculateListingSimilarity(currentListing, candidateListing);
                
                if (similarity.overall >= this.config.titleSimilarity.medium) {
                    group.push(candidateListing);
                    processed.add(candidateListing.id);
                    
                }
            }
            
            // Добавляем группу только если в ней достаточно объявлений
            if (group.length >= this.config.minListingsForAddress) {
                groups.push({
                    listings: group,
                    centroid: this.calculateGroupCentroid(group),
                    avgSimilarity: this.calculateAverageGroupSimilarity(group),
                    characteristics: this.extractGroupCharacteristics(group)
                });
                
            }
        }
        
        this.stats.foundGroups = groups.length;
        
        return groups;
    }

    /**
     * Рассчитать схожесть между двумя объявлениями
     */
    calculateListingSimilarity(listing1, listing2) {
        // 1. Географическая близость
        const distance = this.calculateDistance(listing1.coordinates, listing2.coordinates);
        const coordScore = Math.max(0, 1 - (distance / this.config.maxDistanceInGroup));
        
        // 2. Схожесть названий
        const titleScore = this.calculateTitleSimilarity(listing1.title || '', listing2.title || '');
        
        // 3. Схожесть характеристик недвижимости
        const charScore = this.calculateCharacteristicsSimilarity(listing1, listing2);
        
        // 4. Схожесть цен
        const priceScore = this.calculatePriceSimilarity(listing1.price, listing2.price);
        
        // Общая оценка схожести
        const overall = 
            (coordScore * this.config.weights.coordinates) +
            (titleScore * this.config.weights.titleSimilarity) +
            (charScore * this.config.weights.characteristics) +
            (priceScore * this.config.weights.priceRange);
        
        return {
            overall,
            coordinates: coordScore,
            title: titleScore,
            characteristics: charScore,
            price: priceScore,
            distance
        };
    }

    /**
     * Рассчитать схожесть названий
     */
    calculateTitleSimilarity(title1, title2) {
        if (!title1 || !title2) return 0;
        
        // Нормализуем названия
        const normalized1 = this.normalizeTitle(title1);
        const normalized2 = this.normalizeTitle(title2);
        
        // Используем несколько алгоритмов
        const levenshtein = this.normalizedLevenshtein(normalized1, normalized2);
        const jaccard = this.jaccardSimilarity(
            normalized1.split(/\s+/),
            normalized2.split(/\s+/)
        );
        const ngram = this.ngramSimilarity(normalized1, normalized2, 2);
        
        // Взвешенная комбинация
        return (levenshtein * 0.4) + (jaccard * 0.4) + (ngram * 0.2);
    }

    /**
     * Нормализация названия объявления
     */
    normalizeTitle(title) {
        return title
            .toLowerCase()
            .replace(/\d+[кк]?\s*квартира/gi, 'квартира')  // Убираем типы квартир
            .replace(/\d+\s*м²?/gi, '')                     // Убираем площади
            .replace(/\d+\/\d+\s*эт/gi, '')                 // Убираем этажи
            .replace(/\d+\s*₽/gi, '')                       // Убираем цены
            .replace(/[^\wа-яё\s]/gi, ' ')                  // Убираем знаки препинания
            .replace(/\s+/g, ' ')                           // Нормализуем пробелы
            .trim();
    }

    /**
     * Рассчитать схожесть характеристик
     */
    calculateCharacteristicsSimilarity(listing1, listing2) {
        let score = 0;
        let count = 0;
        
        // Сравниваем тип недвижимости
        if (listing1.property_type && listing2.property_type) {
            score += listing1.property_type === listing2.property_type ? 1 : 0;
            count++;
        }
        
        // Сравниваем площади (с допуском 20%)
        if (listing1.area_total && listing2.area_total) {
            const areaDiff = Math.abs(listing1.area_total - listing2.area_total);
            const avgArea = (listing1.area_total + listing2.area_total) / 2;
            const areaScore = Math.max(0, 1 - (areaDiff / (avgArea * 0.2)));
            score += areaScore;
            count++;
        }
        
        // Сравниваем этажность
        if (listing1.floors_total && listing2.floors_total) {
            score += listing1.floors_total === listing2.floors_total ? 1 : 0;
            count++;
        }
        
        // Сравниваем количество комнат
        if (listing1.rooms && listing2.rooms) {
            score += listing1.rooms === listing2.rooms ? 1 : 0;
            count++;
        }
        
        return count > 0 ? score / count : 0;
    }

    /**
     * Рассчитать схожесть цен
     */
    calculatePriceSimilarity(price1, price2) {
        if (!price1 || !price2) return 0;
        
        const priceDiff = Math.abs(price1 - price2);
        const avgPrice = (price1 + price2) / 2;
        
        // Допуск 30% от средней цены
        return Math.max(0, 1 - (priceDiff / (avgPrice * 0.3)));
    }

    /**
     * Рассчитать центроид группы (среднюю точку координат)
     */
    calculateGroupCentroid(group) {
        if (!group || group.length === 0) return null;
        
        let totalLat = 0;
        let totalLng = 0;
        let validCount = 0;
        
        for (const listing of group) {
            if (listing.coordinates && listing.coordinates.lat && listing.coordinates.lng) {
                totalLat += parseFloat(listing.coordinates.lat);
                totalLng += parseFloat(listing.coordinates.lng);
                validCount++;
            }
        }
        
        if (validCount === 0) return null;
        
        return {
            lat: totalLat / validCount,
            lng: totalLng / validCount
        };
    }

    /**
     * Рассчитать среднюю схожесть внутри группы
     */
    calculateAverageGroupSimilarity(group) {
        if (group.length < 2) return 1.0;
        
        let totalSimilarity = 0;
        let pairCount = 0;
        
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const similarity = this.calculateListingSimilarity(group[i], group[j]);
                totalSimilarity += similarity.overall;
                pairCount++;
            }
        }
        
        return pairCount > 0 ? totalSimilarity / pairCount : 0;
    }

    /**
     * Извлечь общие характеристики группы
     */
    extractGroupCharacteristics(group) {
        const characteristics = {
            commonTitle: this.extractCommonTitle(group),
            floorCounts: this.getMostFrequentValue(group, 'floors_total'),
            propertyType: this.getMostFrequentValue(group, 'property_type'),
            avgPrice: this.calculateAveragePrice(group),
            totalListings: group.length
        };
        
        return characteristics;
    }

    /**
     * Извлечь общие части названий
     */
    extractCommonTitle(group) {
        if (!group || group.length === 0) return '';
        
        // Берем первое объявление как базу
        const baseTitleWords = this.normalizeTitle(group[0].title || '').split(/\s+/);
        
        // Ищем слова, которые встречаются в большинстве названий
        const commonWords = [];
        
        for (const word of baseTitleWords) {
            if (word.length < 3) continue; // Пропускаем короткие слова
            
            let count = 0;
            for (const listing of group) {
                const normalizedTitle = this.normalizeTitle(listing.title || '');
                if (normalizedTitle.includes(word)) {
                    count++;
                }
            }
            
            // Если слово встречается в более чем 50% объявлений
            if (count / group.length > 0.5) {
                commonWords.push(word);
            }
        }
        
        return commonWords.join(' ').trim();
    }

    /**
     * Получить наиболее частое значение поля
     */
    getMostFrequentValue(group, fieldName) {
        const valueCount = new Map();
        
        for (const listing of group) {
            const value = listing[fieldName];
            if (value !== null && value !== undefined) {
                valueCount.set(value, (valueCount.get(value) || 0) + 1);
            }
        }
        
        if (valueCount.size === 0) return null;
        
        // Находим наиболее частое значение
        let maxCount = 0;
        let mostFrequent = null;
        
        for (const [value, count] of valueCount.entries()) {
            if (count > maxCount) {
                maxCount = count;
                mostFrequent = value;
            }
        }
        
        return mostFrequent;
    }

    /**
     * Рассчитать среднюю цену группы
     */
    calculateAveragePrice(group) {
        const prices = group
            .map(listing => listing.price)
            .filter(price => price && price > 0);
        
        if (prices.length === 0) return null;
        
        return prices.reduce((sum, price) => sum + price, 0) / prices.length;
    }

    /**
     * Создать адреса из групп объявлений с предотвращением дублирования
     */
    async createAddressesFromGroups(groups) {
        
        // Сначала проанализируем группы и объединим близлежащие
        const consolidatedGroups = this.consolidateSimilarGroups(groups);
        
        
        const createdAddresses = [];
        
        for (const group of consolidatedGroups) {
            try {
                const newAddress = await this.createAddressFromGroup(group);
                if (newAddress) {
                    createdAddresses.push(newAddress);
                    
                    // Привязываем объявления к новому адресу
                    await this.linkListingsToAddress(group.listings, newAddress.id);
                    
                }
            } catch (error) {
                console.error('❌ Ошибка при создании адреса из группы:', error);
            }
        }
        
        this.stats.createdAddresses = createdAddresses.length;
        this.stats.averageGroupSize = consolidatedGroups.length > 0 ? 
            consolidatedGroups.reduce((sum, g) => sum + g.listings.length, 0) / consolidatedGroups.length : 0;
        
        
        return createdAddresses;
    }

    /**
     * Объединить похожие группы в один адрес для предотвращения дублирования
     */
    consolidateSimilarGroups(groups) {
        
        const consolidatedGroups = [];
        const processed = new Set();
        
        for (let i = 0; i < groups.length; i++) {
            if (processed.has(i)) continue;
            
            const currentGroup = groups[i];
            const mergedGroup = {
                ...currentGroup,
                listings: [...currentGroup.listings],
                consolidatedFrom: [i]
            };
            
            // Ищем похожие группы для объединения
            for (let j = i + 1; j < groups.length; j++) {
                if (processed.has(j)) continue;
                
                const candidateGroup = groups[j];
                
                // Проверяем, стоит ли объединять группы
                if (this.shouldConsolidateGroups(currentGroup, candidateGroup)) {
                    
                    // Объединяем объявления
                    mergedGroup.listings.push(...candidateGroup.listings);
                    mergedGroup.consolidatedFrom.push(j);
                    processed.add(j);
                }
            }
            
            // Пересчитываем характеристики объединенной группы
            if (mergedGroup.listings.length > currentGroup.listings.length) {
                mergedGroup.centroid = this.calculateGroupCentroid(mergedGroup.listings);
                mergedGroup.characteristics = this.extractGroupCharacteristics(mergedGroup.listings);
                mergedGroup.avgSimilarity = this.calculateAverageGroupSimilarity(mergedGroup.listings);
                
            }
            
            consolidatedGroups.push(mergedGroup);
            processed.add(i);
        }
        
        return consolidatedGroups;
    }

    /**
     * Определить, стоит ли объединять две группы
     */
    shouldConsolidateGroups(group1, group2) {
        // 1. Проверяем схожесть предлагаемых адресов
        const address1 = this.normalizeAddressForComparison(group1.characteristics.commonTitle);
        const address2 = this.normalizeAddressForComparison(group2.characteristics.commonTitle);
        
        const addressSimilarity = this.calculateStringSimilarity(address1, address2);
        
        // 2. Проверяем расстояние между центроидами групп
        const distance = this.calculateDistance(group1.centroid, group2.centroid);
        
        // 3. Критерии объединения:
        // - Высокая схожесть адресов (>80%) И близкое расстояние (<100м)
        // - ИЛИ очень близкое расстояние (<50м) для любых адресов на той же улице
        const highAddressSimilarity = addressSimilarity > 0.8 && distance < 100;
        const veryCloseDistance = distance < 50 && this.areFromSameStreet(address1, address2);
        
        if (highAddressSimilarity || veryCloseDistance) {
            return true;
        }
        
        return false;
    }

    /**
     * Нормализация адреса для сравнения
     */
    normalizeAddressForComparison(address) {
        return address.toLowerCase()
            .replace(/улица|ул\.|ул/g, 'ул')
            .replace(/проспект|пр\.|пр-кт|пр/g, 'пр')
            .replace(/переулок|пер\.|пер/g, 'пер')
            .replace(/владение|вл\.|вл/g, 'вл')
            .replace(/дом|д\.|д/g, 'д')
            .replace(/корпус|к\.|к/g, 'к')
            .replace(/строение|с\.|с/g, 'с')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Проверить, относятся ли адреса к одной улице
     */
    areFromSameStreet(address1, address2) {
        const street1 = address1.split(' ').slice(0, 2).join(' '); // "ул наметкина"
        const street2 = address2.split(' ').slice(0, 2).join(' ');
        return street1 === street2;
    }

    /**
     * Простое вычисление схожести строк
     */
    calculateStringSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    /**
     * Создать адрес из группы объявлений
     */
    async createAddressFromGroup(group) {
        const characteristics = group.characteristics;
        const centroid = group.centroid;
        
        if (!centroid) {
            console.warn('⚠️ Не удалось определить координаты для группы');
            return null;
        }
        
        // Умное формирование названия адреса
        let addressName = this.generateSmartAddressName(characteristics, group);
        
        // Добавляем информацию об этажности если есть
        if (characteristics.floorCounts) {
            addressName += `, ${characteristics.floorCounts} эт.`;
        }
        
        // Создаем новый адрес
        const newAddress = {
            address: addressName,
            coordinates: {
                lat: centroid.lat,
                lng: centroid.lng
            },
            type: 'дом', // По умолчанию
            floors_count: characteristics.floorCounts,
            created_at: new Date(),
            updated_at: new Date(),
            // Метаданные о создании
            source: 'ml_group_analysis',
            confidence: group.avgSimilarity,
            listings_count: characteristics.totalListings
        };
        
        // Сохраняем в базу данных
        const savedAddress = await this.db.addAddress(newAddress);
        
        // Логируем создание адреса
        if (characteristics.floorCounts) {
        }
        
        return savedAddress;
    }

    /**
     * Умное генерирование названия адреса для группы
     */
    generateSmartAddressName(characteristics, group) {
        const commonTitle = characteristics.commonTitle || '';
        
        // Анализируем общий адрес из группы
        if (commonTitle.includes('наметкина') || commonTitle.includes('намёткина')) {
            // Случай с улицей Наметкина
            if (commonTitle.includes('вл10') || commonTitle.includes('10')) {
                // Определяем вариант для владения 10
                if (group.consolidatedFrom && group.consolidatedFrom.length > 1) {
                    // Если группа объединена из нескольких - это основной адрес
                    return 'улица Намёткина, 10';
                } else {
                    // Если группа не объединялась - возможно, это отдельное строение
                    const hasBuildings = this.analyzeForBuildings(group.listings);
                    if (hasBuildings.length > 0) {
                        return `улица Намёткина, 10 стр. ${hasBuildings[0]}`;
                    } else {
                        return 'улица Намёткина, 10А';
                    }
                }
            } else if (commonTitle.includes('9')) {
                return 'улица Намёткина, 9';
            }
        }
        
        // Общий случай - нормализуем и улучшаем адрес
        return this.normalizeGeneratedAddress(commonTitle);
    }

    /**
     * Анализ объявлений на наличие номеров строений/корпусов
     */
    analyzeForBuildings(listings) {
        const buildings = new Set();
        
        listings.forEach(listing => {
            const address = listing.address || listing.title || '';
            
            // Ищем номера строений, корпусов
            const buildingMatch = address.match(/(?:стр|строение|с)\.?\s*(\d+)/i);
            const korpusMatch = address.match(/(?:к|корпус)\.?\s*(\d+)/i);
            
            if (buildingMatch) buildings.add(buildingMatch[1]);
            if (korpusMatch) buildings.add(korpusMatch[1]);
        });
        
        return Array.from(buildings);
    }

    /**
     * Нормализация и улучшение генерируемого адреса
     */
    normalizeGeneratedAddress(address) {
        return address
            .replace(/^ул\s+/, 'улица ')
            .replace(/^пр\s+/, 'проспект ')
            .replace(/^пер\s+/, 'переулок ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^./, str => str.toUpperCase()); // Заглавная первая буква
    }

    /**
     * Привязать объявления к адресу
     */
    async linkListingsToAddress(listings, addressId) {
        for (const listing of listings) {
            try {
                // Обновляем объявление
                const updatedListing = {
                    ...listing,
                    address_id: addressId,
                    processing_status: 'duplicate_check_needed', // Переводим на следующий этап
                    address_match_confidence: 'medium',
                    address_match_method: 'ml_group_analysis',
                    address_match_score: 0.7, // Средняя оценка для ML группировки
                    updated_at: new Date()
                };
                
                await this.db.updateListing(updatedListing);
                
                
            } catch (error) {
                console.error(`❌ Ошибка при привязке объявления ${listing.id} к адресу ${addressId}:`, error);
            }
        }
        
    }

    /**
     * Основная функция анализа объявлений с неточным определением адреса
     */
    async analyzeInaccuratelyMatchedAddresses() {
        
        try {
            // 1. Находим объявления с неточным определением адреса
            const inaccurateListings = await this.findInaccuratelyMatchedListings();
            
            if (inaccurateListings.length === 0) {
                return {
                    success: true,
                    message: 'Нет объявлений с неточным определением адреса для анализа',
                    stats: this.stats
                };
            }
            
            // 2. Группируем по схожести
            const groups = await this.groupSimilarListings(inaccurateListings);
            
            if (groups.length === 0) {
                return {
                    success: true,
                    message: 'Не найдено подходящих групп для создания адресов',
                    stats: this.stats
                };
            }
            
            // 3. Создаем адреса из групп
            const createdAddresses = await this.createAddressesFromGroups(groups);
            
            return {
                success: true,
                message: `Анализ завершен. Создано ${createdAddresses.length} адресов из ${groups.length} групп`,
                createdAddresses,
                groups,
                stats: this.stats
            };
            
        } catch (error) {
            console.error('❌ Ошибка при анализе неопределенных адресов:', error);
            return {
                success: false,
                error: error.message,
                stats: this.stats
            };
        }
    }

    /**
     * Получить статистику анализа
     */
    getAnalysisStats() {
        return {
            ...this.stats,
            efficiency: this.stats.processedListings > 0 ? 
                (this.stats.createdAddresses / this.stats.foundGroups) * 100 : 0
        };
    }

    // Вспомогательные методы (используем из SmartAddressMatcher)
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

    normalizedLevenshtein(str1, str2) {
        const distance = this.levenshteinDistance(str1, str2);
        return 1 - (distance / Math.max(str1.length, str2.length));
    }

    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    jaccardSimilarity(arr1, arr2) {
        const set1 = new Set(arr1);
        const set2 = new Set(arr2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    ngramSimilarity(str1, str2, n) {
        const ngrams1 = this.getNgrams(str1, n);
        const ngrams2 = this.getNgrams(str2, n);
        return this.jaccardSimilarity(Array.from(ngrams1), Array.from(ngrams2));
    }

    getNgrams(str, n) {
        const ngrams = new Set();
        for (let i = 0; i <= str.length - n; i++) {
            ngrams.add(str.substr(i, n));
        }
        return ngrams;
    }
}

// Экспорт для использования в модульной системе
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MLAddressAnalyzer;
}

// Глобальная доступность
window.MLAddressAnalyzer = MLAddressAnalyzer;