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
            groupingRadius: 50,
            
            // Минимальное количество объявлений для создания адреса
            minListingsForAddress: 2,
            
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
     * Найти все объявления с неопределенными адресами
     */
    async findUnresolvedListings() {
        console.log('🔍 Ищем объявления с неопределенными адресами...');
        
        try {
            const allListings = await this.db.getAllListings();
            
            // Фильтруем объявления без определенного адреса
            const unresolvedListings = allListings.filter(listing => {
                // Объявление считается неопределенным, если:
                // 1. address_id = null (нет связи с адресом)
                // 2. processing_status = 'address_needed'
                // 3. есть координаты
                return (
                    !listing.address_id && 
                    listing.processing_status === 'address_needed' &&
                    listing.coordinates &&
                    listing.coordinates.lat &&
                    listing.coordinates.lng &&
                    listing.status === 'active'
                );
            });
            
            console.log(`📊 Найдено ${unresolvedListings.length} неопределенных объявлений из ${allListings.length} общих`);
            
            this.stats.processedListings = unresolvedListings.length;
            
            return unresolvedListings;
            
        } catch (error) {
            console.error('❌ Ошибка при поиске неопределенных объявлений:', error);
            throw error;
        }
    }

    /**
     * Группировать объявления по схожести названий и координат
     */
    async groupSimilarListings(unresolvedListings) {
        console.log('🧩 Группируем объявления по схожести...');
        
        if (!unresolvedListings || unresolvedListings.length === 0) {
            console.log('⚠️ Нет объявлений для группировки');
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
                    
                    console.log(`✅ Добавлено в группу: "${candidateListing.title}" (схожесть: ${similarity.overall.toFixed(3)})`);
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
                
                console.log(`🏠 Создана группа из ${group.length} объявлений`);
            }
        }
        
        console.log(`📋 Создано ${groups.length} групп для анализа`);
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
     * Создать адреса из групп объявлений
     */
    async createAddressesFromGroups(groups) {
        console.log('🏗️ Создаем адреса из групп объявлений...');
        
        const createdAddresses = [];
        
        for (const group of groups) {
            try {
                const newAddress = await this.createAddressFromGroup(group);
                if (newAddress) {
                    createdAddresses.push(newAddress);
                    
                    // Привязываем объявления к новому адресу
                    await this.linkListingsToAddress(group.listings, newAddress.id);
                    
                    console.log(`✅ Создан адрес: "${newAddress.address}" для ${group.listings.length} объявлений`);
                }
            } catch (error) {
                console.error('❌ Ошибка при создании адреса из группы:', error);
            }
        }
        
        this.stats.createdAddresses = createdAddresses.length;
        this.stats.averageGroupSize = groups.length > 0 ? 
            groups.reduce((sum, g) => sum + g.listings.length, 0) / groups.length : 0;
        
        console.log(`🎉 Создано ${createdAddresses.length} новых адресов`);
        
        return createdAddresses;
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
        
        // Формируем название адреса
        let addressName = characteristics.commonTitle || 'Неопределенный адрес';
        
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
        console.log(`🏗️ Создан адрес: "${savedAddress.address}" (ID: ${savedAddress.id})`);
        console.log(`📍 Координаты: ${centroid.lat.toFixed(6)}, ${centroid.lng.toFixed(6)}`);
        console.log(`📊 Объявлений: ${characteristics.totalListings}`);
        if (characteristics.floorCounts) {
            console.log(`🏢 Этажность: ${characteristics.floorCounts}`);
        }
        
        return savedAddress;
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
                
                console.log(`🔗 Объявление "${listing.title}" привязано к адресу ID ${addressId}`);
                
            } catch (error) {
                console.error(`❌ Ошибка при привязке объявления ${listing.id} к адресу ${addressId}:`, error);
            }
        }
        
        console.log(`✅ Привязано ${listings.length} объявлений к адресу ID ${addressId}`);
    }

    /**
     * Основная функция анализа неопределенных адресов
     */
    async analyzeUnresolvedAddresses() {
        console.log('🤖 Запуск ML-анализа неопределенных адресов...');
        
        try {
            // 1. Находим неопределенные объявления
            const unresolvedListings = await this.findUnresolvedListings();
            
            if (unresolvedListings.length === 0) {
                console.log('✅ Все объявления имеют определенные адреса');
                return {
                    success: true,
                    message: 'Нет неопределенных адресов для анализа',
                    stats: this.stats
                };
            }
            
            // 2. Группируем по схожести
            const groups = await this.groupSimilarListings(unresolvedListings);
            
            if (groups.length === 0) {
                console.log('⚠️ Не найдено групп для создания адресов');
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