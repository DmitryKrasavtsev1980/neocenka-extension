/**
 * Усовершенствованная система автоматического поиска и объединения дублей объявлений
 * Реализует идеальный алгоритм с приоритизацией уникальных характеристик недвижимости
 */

/**
 * Детектор уникальных характеристик недвижимости
 */
class UniqueFeatureDetector {
    constructor() {
        // Редкие удобства и особенности
        this.rareAmenities = {
            'сауна': 'sauna',
            'хамам': 'hamam', 
            'джакузи': 'jacuzzi',
            'камин': 'fireplace',
            'терраса': 'terrace',
            'винный погреб': 'wine_cellar',
            'домашний кинотеатр': 'home_theater',
            'спортзал': 'gym',
            'мастерская': 'workshop',
            'кабинет': 'office'
        };

        // Особенности планировки
        this.layoutFeatures = {
            'объединена из': 'merged_apartments',
            'двухуровневая': 'duplex',
            'пентхаус': 'penthouse',
            'студия': 'studio',
            'свободная планировка': 'free_layout',
            'европланировка': 'euro_layout',
            'изолированные комнаты': 'isolated_rooms',
            'проходные комнаты': 'connected_rooms'
        };

        // Документы и правовые особенности
        this.legalFeatures = {
            'материнский капитал': 'maternity_capital',
            'ипотека': 'mortgage',
            'рассрочка': 'installment',
            'обременение': 'encumbrance',
            'доля': 'share',
            'альтернатива': 'alternative_sale',
            'более 5 лет': 'longterm_ownership',
            'менее 3 лет': 'shortterm_ownership'
        };
    }

    /**
     * Извлечение уникальных характеристик из описания
     */
    extractUniqueFeatures(description) {
        if (!description) return { features: [], score: 0 };

        const text = description.toLowerCase();
        const features = [];
        let score = 0;

        // Поиск редких удобств
        Object.entries(this.rareAmenities).forEach(([keyword, feature]) => {
            if (text.includes(keyword)) {
                features.push({ type: 'amenity', feature, keyword, weight: 0.8 });
                score += 0.8;
            }
        });

        // Поиск особенностей планировки
        Object.entries(this.layoutFeatures).forEach(([keyword, feature]) => {
            if (text.includes(keyword)) {
                features.push({ type: 'layout', feature, keyword, weight: 0.6 });
                score += 0.6;
            }
        });

        // Поиск правовых особенностей
        Object.entries(this.legalFeatures).forEach(([keyword, feature]) => {
            if (text.includes(keyword)) {
                features.push({ type: 'legal', feature, keyword, weight: 0.4 });
                score += 0.4;
            }
        });

        // Поиск комбинаций удобств (бонус за редкие сочетания)
        if (text.includes('сауна') && text.includes('хамам')) {
            features.push({ type: 'combo', feature: 'sauna_hamam', keyword: 'сауна+хамам', weight: 1.2 });
            score += 1.2;
        }

        // Поиск количественных характеристик
        const roomCounts = this.extractRoomCounts(description);
        if (roomCounts.bathrooms >= 3) {
            features.push({ type: 'quantity', feature: 'multiple_bathrooms', keyword: `${roomCounts.bathrooms} санузла`, weight: 0.7 });
            score += 0.7;
        }

        if (roomCounts.balconies >= 3) {
            features.push({ type: 'quantity', feature: 'multiple_balconies', keyword: `${roomCounts.balconies} лоджии`, weight: 0.6 });
            score += 0.6;
        }

        return { features, score: Math.min(score, 5.0) }; // Ограничиваем максимальный скор
    }

    /**
     * Извлечение количественных характеристик
     */
    extractRoomCounts(description) {
        const counts = { bathrooms: 0, balconies: 0, bedrooms: 0 };

        // Поиск санузлов
        const bathroomMatches = description.match(/(\d+)\s*(санузл|туалет|ванн)/gi);
        if (bathroomMatches) {
            counts.bathrooms = Math.max(...bathroomMatches.map(m => parseInt(m.match(/\d+/)[0])));
        }

        // Поиск лоджий/балконов
        const balconyMatches = description.match(/(\d+)\s*(лоджи|балкон)/gi);
        if (balconyMatches) {
            counts.balconies = Math.max(...balconyMatches.map(m => parseInt(m.match(/\d+/)[0])));
        }

        // Поиск спален
        const bedroomMatches = description.match(/(\d+)\s*(спальн|комнат)/gi);
        if (bedroomMatches) {
            counts.bedrooms = Math.max(...bedroomMatches.map(m => parseInt(m.match(/\d+/)[0])));
        }

        return counts;
    }

    /**
     * Сравнение уникальных характеристик двух объявлений
     */
    compareFeatures(features1, features2) {
        if (!features1.features.length && !features2.features.length) {
            return { similarity: 0, confidence: 'no_features' };
        }

        // Находим общие характеристики
        const commonFeatures = [];
        let totalWeight = 0;

        features1.features.forEach(f1 => {
            const matching = features2.features.find(f2 => 
                f1.feature === f2.feature || f1.keyword === f2.keyword
            );
            if (matching) {
                commonFeatures.push({ feature: f1.feature, weight: Math.max(f1.weight, matching.weight) });
                totalWeight += Math.max(f1.weight, matching.weight);
            }
        });

        // Нормализуем скор
        const maxPossibleWeight = Math.max(features1.score, features2.score);
        const similarity = maxPossibleWeight > 0 ? totalWeight / maxPossibleWeight : 0;

        let confidence = 'low';
        if (similarity >= 0.8) confidence = 'high';
        else if (similarity >= 0.5) confidence = 'medium';

        return {
            similarity,
            confidence,
            commonFeatures,
            totalWeight,
            details: {
                features1: features1.features.length,
                features2: features2.features.length,
                common: commonFeatures.length
            }
        };
    }
}

/**
 * Анализатор связей между продавцами
 */
class SellerRelationAnalyzer {
    constructor() {
        this.agencyPatterns = [
            /estate/i,
            /недвижимость/i,
            /риэлт/i,
            /агент/i,
            /брокер/i,
            /консультант/i
        ];
    }

    /**
     * Анализ связи между продавцами
     */
    analyzeSellerRelation(seller1, seller2, contact1, contact2) {
        const relation = {
            related: false,
            confidence: 0,
            reason: 'no_relation',
            details: {}
        };

        // Прямое совпадение
        if (this.normalizeName(seller1.name) === this.normalizeName(seller2.name)) {
            relation.related = true;
            relation.confidence = 1.0;
            relation.reason = 'same_seller';
            return relation;
        }

        // Один агент, один собственник
        if ((seller1.type === 'agent' && seller2.type === 'owner') || 
            (seller1.type === 'owner' && seller2.type === 'agent')) {
            relation.related = true;
            relation.confidence = 0.7;
            relation.reason = 'agent_owner_pair';
        }

        // Оба агента из одного агентства
        if (seller1.type === 'agent' && seller2.type === 'agent') {
            const agency1 = this.extractAgencyName(seller1.name);
            const agency2 = this.extractAgencyName(seller2.name);
            
            if (agency1 && agency2 && agency1 === agency2) {
                relation.related = true;
                relation.confidence = 0.8;
                relation.reason = 'same_agency';
                relation.details.agency = agency1;
            } else if (seller1.name && seller2.name) {
                relation.related = true;
                relation.confidence = 0.5;
                relation.reason = 'different_agents';
            }
        }

        // Анализ контактной информации
        const contactRelation = this.analyzeContactRelation(contact1, contact2);
        if (contactRelation.related) {
            relation.related = true;
            relation.confidence = Math.max(relation.confidence, contactRelation.confidence);
            relation.reason = contactRelation.reason;
        }

        return relation;
    }

    /**
     * Нормализация имени
     */
    normalizeName(name) {
        if (!name) return '';
        return name.toLowerCase()
            .replace(/[^\wа-яё\s]/gi, '')
            .trim();
    }

    /**
     * Извлечение названия агентства
     */
    extractAgencyName(sellerName) {
        if (!sellerName) return null;

        const name = sellerName.toLowerCase();
        
        // Поиск в скобках
        const bracketMatch = name.match(/\(([^)]+)\)/);
        if (bracketMatch) {
            const inBrackets = bracketMatch[1];
            if (this.agencyPatterns.some(pattern => pattern.test(inBrackets))) {
                return inBrackets.trim();
            }
        }

        // Поиск ключевых слов агентства
        for (const pattern of this.agencyPatterns) {
            if (pattern.test(name)) {
                const words = name.split(/\s+/);
                const agencyWords = words.filter(word => 
                    pattern.test(word) || word.length > 4
                ).slice(0, 3);
                return agencyWords.join(' ');
            }
        }

        return null;
    }

    /**
     * Анализ связи по контактной информации
     */
    analyzeContactRelation(contact1, contact2) {
        const relation = { related: false, confidence: 0, reason: 'no_contact_match' };

        // Сравнение телефонов
        if (contact1.phones && contact2.phones) {
            const commonPhones = contact1.phones.filter(phone => 
                contact2.phones.includes(phone)
            );
            
            if (commonPhones.length > 0) {
                relation.related = true;
                relation.confidence = 0.9;
                relation.reason = 'same_phone';
                return relation;
            }
        }

        // Сравнение email
        if (contact1.emails && contact2.emails) {
            const commonEmails = contact1.emails.filter(email => 
                contact2.emails.includes(email)
            );
            
            if (commonEmails.length > 0) {
                relation.related = true;
                relation.confidence = 0.8;
                relation.reason = 'same_email';
                return relation;
            }
        }

        return relation;
    }
}

/**
 * Анализатор ценовой динамики
 */
class PriceHistoryAnalyzer {
    /**
     * Анализ связи по ценовой истории
     */
    analyzePriceRelation(listing1, listing2) {
        const history1 = listing1.price_history || [];
        const history2 = listing2.price_history || [];

        if (history1.length === 0 || history2.length === 0) {
            return { related: false, confidence: 0, reason: 'no_history' };
        }

        // Поиск общих цен
        const prices1 = history1.map(h => h.price);
        const prices2 = history2.map(h => h.price);
        const commonPrices = prices1.filter(price => prices2.includes(price));

        if (commonPrices.length === 0) {
            return { related: false, confidence: 0, reason: 'no_common_prices' };
        }

        // Анализ динамики
        const similarity = this.calculatePriceSimilarity(prices1, prices2);
        
        return {
            related: similarity > 0.6,
            confidence: similarity,
            reason: similarity > 0.8 ? 'same_price_dynamics' : 'similar_price_dynamics',
            details: {
                commonPrices: commonPrices.length,
                similarity
            }
        };
    }

    /**
     * Вычисление сходства ценовой динамики
     */
    calculatePriceSimilarity(prices1, prices2) {
        if (prices1.length === 0 || prices2.length === 0) return 0;

        // Нормализуем массивы цен
        const normalized1 = this.normalizePrices(prices1);
        const normalized2 = this.normalizePrices(prices2);

        // Вычисляем корреляцию
        return this.calculateCorrelation(normalized1, normalized2);
    }

    /**
     * Нормализация цен (относительно первой цены)
     */
    normalizePrices(prices) {
        if (prices.length === 0) return [];
        const firstPrice = prices[0];
        return prices.map(price => price / firstPrice);
    }

    /**
     * Вычисление корреляции Пирсона
     */
    calculateCorrelation(arr1, arr2) {
        const n = Math.min(arr1.length, arr2.length);
        if (n < 2) return 0;

        const x = arr1.slice(0, n);
        const y = arr2.slice(0, n);

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
        const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

        return denominator === 0 ? 0 : Math.abs(numerator / denominator);
    }
}

/**
 * Усовершенствованный калькулятор итогового скора
 */
class AdvancedScoreCalculator {
    constructor() {
        this.weights = {
            uniqueFeatures: 0.35,    // Уникальные характеристики недвижимости
            specifications: 0.25,    // Точные характеристики (площадь, этаж и т.д.)
            semanticSimilarity: 0.20, // Семантический анализ описания
            sellerRelation: 0.10,    // Связь между продавцами
            priceHistory: 0.05,      // Ценовая динамика
            location: 0.05           // Геолокация
        };

        this.thresholds = {
            autoMerge: 0.80,         // Автоматическое объединение
            highConfidence: 0.70,    // Высокая уверенность
            mediumConfidence: 0.55,  // Средняя уверенность
            lowConfidence: 0.35      // Минимальный порог
        };
    }

    /**
     * Расчет итогового скора с учетом всех факторов
     */
    calculateAdvancedScore(comparison) {
        const {
            uniqueFeatures,
            specifications,
            semanticSimilarity,
            sellerRelation,
            priceHistory,
            location
        } = comparison;

        // Вычисляем взвешенный скор
        const finalScore = 
            (uniqueFeatures?.similarity || 0) * this.weights.uniqueFeatures +
            (specifications?.similarity || 0) * this.weights.specifications +
            (semanticSimilarity?.similarity || 0) * this.weights.semanticSimilarity +
            (sellerRelation?.confidence || 0) * this.weights.sellerRelation +
            (priceHistory?.confidence || 0) * this.weights.priceHistory +
            (location?.similarity || 0) * this.weights.location;

        // Бонусы за особые случаи
        let bonus = 0;
        
        // Бонус за редкие характеристики
        if (uniqueFeatures?.similarity >= 0.8) {
            bonus += 0.1;
        }

        // Бонус за точное совпадение спецификаций
        if (specifications?.exactMatch) {
            bonus += 0.05;
        }

        // Бонус за связанных продавцов
        if (sellerRelation?.reason === 'same_seller') {
            bonus += 0.05;
        }

        const adjustedScore = Math.min(finalScore + bonus, 1.0);

        return {
            final: adjustedScore,
            confidence: this.getConfidenceLevel(adjustedScore),
            isDuplicate: adjustedScore >= this.thresholds.lowConfidence,
            breakdown: {
                uniqueFeatures: (uniqueFeatures?.similarity || 0) * this.weights.uniqueFeatures,
                specifications: (specifications?.similarity || 0) * this.weights.specifications,
                semanticSimilarity: (semanticSimilarity?.similarity || 0) * this.weights.semanticSimilarity,
                sellerRelation: (sellerRelation?.confidence || 0) * this.weights.sellerRelation,
                priceHistory: (priceHistory?.confidence || 0) * this.weights.priceHistory,
                location: (location?.similarity || 0) * this.weights.location,
                bonus
            },
            shouldAutoMerge: adjustedScore >= this.thresholds.autoMerge
        };
    }

    /**
     * Определение уровня уверенности
     */
    getConfidenceLevel(score) {
        if (score >= this.thresholds.autoMerge) return 'auto_merge';
        if (score >= this.thresholds.highConfidence) return 'high';
        if (score >= this.thresholds.mediumConfidence) return 'medium';
        if (score >= this.thresholds.lowConfidence) return 'low';
        return 'very_low';
    }
}

/**
 * Усовершенствованный анализатор спецификаций
 */
class SpecificationAnalyzer {
    /**
     * Сравнение технических характеристик
     */
    compareSpecifications(listing1, listing2) {
        const comparison = {
            similarity: 0,
            exactMatch: true,
            details: {}
        };

        let totalWeight = 0;
        let matchedWeight = 0;

        // Площадь (высокий вес)
        const areaMatch = this.compareArea(listing1.area_total, listing2.area_total);
        comparison.details.area = areaMatch;
        totalWeight += 0.3;
        if (areaMatch.match) matchedWeight += 0.3 * areaMatch.similarity;
        if (!areaMatch.exactMatch) comparison.exactMatch = false;

        // Этаж (средний вес)
        const floorMatch = this.compareFloor(listing1.floor, listing2.floor);
        comparison.details.floor = floorMatch;
        totalWeight += 0.2;
        if (floorMatch.match) matchedWeight += 0.2;
        if (!floorMatch.exactMatch) comparison.exactMatch = false;

        // Количество комнат (средний вес)
        const roomsMatch = this.compareRooms(listing1.rooms, listing2.rooms);
        comparison.details.rooms = roomsMatch;
        totalWeight += 0.2;
        if (roomsMatch.match) matchedWeight += 0.2;
        if (!roomsMatch.exactMatch) comparison.exactMatch = false;

        // Тип недвижимости (высокий вес)
        const typeMatch = this.comparePropertyType(listing1.property_type, listing2.property_type);
        comparison.details.propertyType = typeMatch;
        totalWeight += 0.15;
        if (typeMatch.match) matchedWeight += 0.15;
        if (!typeMatch.exactMatch) comparison.exactMatch = false;

        // Материал дома (низкий вес)
        const materialMatch = this.compareHouseMaterial(listing1.house_type, listing2.house_type);
        comparison.details.material = materialMatch;
        totalWeight += 0.1;
        if (materialMatch.match) matchedWeight += 0.1;

        // Этажность дома (низкий вес)
        const floorsMatch = this.compareFloorsTotal(listing1.floors_total, listing2.floors_total);
        comparison.details.floorsTotal = floorsMatch;
        totalWeight += 0.05;
        if (floorsMatch.match) matchedWeight += 0.05;

        comparison.similarity = totalWeight > 0 ? matchedWeight / totalWeight : 0;

        return comparison;
    }

    /**
     * Сравнение площади с допуском ±5м²
     */
    compareArea(area1, area2) {
        if (!area1 || !area2) return { match: false, exactMatch: false, similarity: 0 };

        const diff = Math.abs(area1 - area2);
        const exactMatch = diff === 0;
        const match = diff <= 5;
        
        let similarity = 0;
        if (match) {
            similarity = Math.max(0, 1 - (diff / 5));
        }

        return { match, exactMatch, similarity, difference: diff };
    }

    /**
     * Сравнение этажа
     */
    compareFloor(floor1, floor2) {
        if (!floor1 || !floor2) return { match: false, exactMatch: false };
        
        const exactMatch = floor1 === floor2;
        return { match: exactMatch, exactMatch };
    }

    /**
     * Сравнение количества комнат
     */
    compareRooms(rooms1, rooms2) {
        if (!rooms1 || !rooms2) return { match: false, exactMatch: false };
        
        const exactMatch = rooms1 === rooms2;
        const match = Math.abs(rooms1 - rooms2) <= 1; // Допуск ±1 комната
        
        return { match, exactMatch };
    }

    /**
     * Сравнение типа недвижимости
     */
    comparePropertyType(type1, type2) {
        if (!type1 || !type2) return { match: false, exactMatch: false };
        
        const exactMatch = type1 === type2;
        return { match: exactMatch, exactMatch };
    }

    /**
     * Сравнение материала дома
     */
    compareHouseMaterial(material1, material2) {
        if (!material1 || !material2) return { match: false, exactMatch: false };
        
        const norm1 = material1.toLowerCase().trim();
        const norm2 = material2.toLowerCase().trim();
        const exactMatch = norm1 === norm2;
        
        return { match: exactMatch, exactMatch };
    }

    /**
     * Сравнение этажности дома
     */
    compareFloorsTotal(floors1, floors2) {
        if (!floors1 || !floors2) return { match: false, exactMatch: false };
        
        const exactMatch = floors1 === floors2;
        return { match: exactMatch, exactMatch };
    }
}

/**
 * Главный класс усовершенствованного детектора дублей
 */
class AdvancedDuplicateDetector {
    constructor() {
        this.uniqueFeatureDetector = new UniqueFeatureDetector();
        this.sellerAnalyzer = new SellerRelationAnalyzer();
        this.priceAnalyzer = new PriceHistoryAnalyzer();
        this.specAnalyzer = new SpecificationAnalyzer();
        this.scoreCalculator = new AdvancedScoreCalculator();
        
        // Сохраняем старые анализаторы для семантического анализа
        // Они должны быть доступны из предыдущего файла duplicate-detector.js
        this.textAnalyzer = window.duplicateDetector ? window.duplicateDetector.textAnalyzer : null;
        this.contactAnalyzer = window.duplicateDetector ? window.duplicateDetector.contactAnalyzer : null;
        
        this.databaseManager = null;
        this.initialized = false;
    }

    /**
     * Инициализация детектора
     */
    async init() {
        if (this.initialized) return;

        this.databaseManager = window.db;
        if (!this.databaseManager) {
            throw new Error('DatabaseManager не инициализирован');
        }

        // Создаем анализаторы текста и контактов если они не доступны
        if (!this.textAnalyzer) {
            this.textAnalyzer = new TextSimilarityAnalyzer();
        }
        if (!this.contactAnalyzer) {
            this.contactAnalyzer = new ContactAnalyzer();
        }

        this.initialized = true;
        console.log('🔍 AdvancedDuplicateDetector инициализирован');
    }

    /**
     * Усовершенствованное сравнение двух объявлений
     */
    async compareListingsAdvanced(listing1, listing2) {
        console.log(`🔍 Продвинутое сравнение объявлений ${listing1.id} и ${listing2.id}`);

        // 1. Анализ уникальных характеристик
        const features1 = this.uniqueFeatureDetector.extractUniqueFeatures(listing1.description);
        const features2 = this.uniqueFeatureDetector.extractUniqueFeatures(listing2.description);
        const uniqueFeatures = this.uniqueFeatureDetector.compareFeatures(features1, features2);

        console.log(`   🏠 Уникальные характеристики: ${uniqueFeatures.similarity.toFixed(3)} (${uniqueFeatures.confidence})`);

        // 2. Анализ технических характеристик
        const specifications = this.specAnalyzer.compareSpecifications(listing1, listing2);
        
        console.log(`   📐 Технические характеристики: ${specifications.similarity.toFixed(3)} (точное совпадение: ${specifications.exactMatch})`);

        // 3. Семантический анализ описания
        const semanticSimilarity = this.textAnalyzer.analyze(
            listing1.description || '',
            listing2.description || ''
        );

        console.log(`   📝 Семантическое сходство: ${semanticSimilarity.combined.toFixed(3)} (${semanticSimilarity.confidence})`);

        // 4. Анализ связи продавцов
        const contacts1 = this.contactAnalyzer.analyzeContacts(listing1);
        const contacts2 = this.contactAnalyzer.analyzeContacts(listing2);
        const sellerRelation = this.sellerAnalyzer.analyzeSellerRelation(
            listing1.seller_info || { name: listing1.seller_name, type: listing1.seller_type },
            listing2.seller_info || { name: listing2.seller_name, type: listing2.seller_type },
            contacts1,
            contacts2
        );

        console.log(`   👤 Связь продавцов: ${sellerRelation.confidence.toFixed(3)} (${sellerRelation.reason})`);

        // 5. Анализ ценовой динамики
        const priceHistory = this.priceAnalyzer.analyzePriceRelation(listing1, listing2);

        console.log(`   💰 Ценовая динамика: ${priceHistory.confidence.toFixed(3)} (${priceHistory.reason})`);

        // 6. Геолокация (простая проверка)
        const location = this.compareLocation(listing1.coordinates, listing2.coordinates);

        console.log(`   📍 Геолокация: ${location.similarity.toFixed(3)}`);

        // 7. Расчет итогового скора
        const finalScore = this.scoreCalculator.calculateAdvancedScore({
            uniqueFeatures: { similarity: uniqueFeatures.similarity },
            specifications: { similarity: specifications.similarity, exactMatch: specifications.exactMatch },
            semanticSimilarity: { similarity: semanticSimilarity.combined },
            sellerRelation: { confidence: sellerRelation.confidence },
            priceHistory: { confidence: priceHistory.confidence },
            location: { similarity: location.similarity }
        });

        console.log(`   🎯 Итоговый скор: ${finalScore.final.toFixed(3)} (${finalScore.confidence}), автообъединение: ${finalScore.shouldAutoMerge}`);

        return {
            compatible: true,
            score: finalScore,
            details: {
                uniqueFeatures,
                specifications,
                semanticSimilarity,
                sellerRelation,
                priceHistory,
                location
            }
        };
    }

    /**
     * Простое сравнение геолокации
     */
    compareLocation(coords1, coords2) {
        if (!coords1 || !coords2 || !coords1.lat || !coords1.lng || !coords2.lat || !coords2.lng) {
            return { similarity: 0 };
        }

        const distance = this.calculateDistance(
            parseFloat(coords1.lat), parseFloat(coords1.lng || coords1.lon),
            parseFloat(coords2.lat), parseFloat(coords2.lng || coords2.lon)
        );

        // Считаем похожими, если расстояние меньше 50 метров
        const similarity = distance <= 50 ? 1.0 : Math.max(0, 1 - (distance / 500));

        return { similarity, distance };
    }

    /**
     * Вычисление расстояния между координатами (в метрах)
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Радиус Земли в метрах
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Поиск дублей с использованием усовершенствованного алгоритма
     */
    async findDuplicatesAdvanced(targetListing, candidateListings) {
        const duplicates = [];

        for (const candidate of candidateListings) {
            if (candidate.id === targetListing.id) continue;

            const comparison = await this.compareListingsAdvanced(targetListing, candidate);
            
            if (comparison.score.isDuplicate) {
                duplicates.push({
                    listing: candidate,
                    score: comparison.score,
                    details: comparison.details
                });
            }
        }

        // Сортируем по убыванию скора
        duplicates.sort((a, b) => b.score.final - a.score.final);

        return duplicates;
    }

    /**
     * Основной процесс с улучшенным алгоритмом
     */
    async processDuplicatesAdvanced(currentArea, progressCallback = null) {
        if (!this.initialized) await this.init();

        try {
            console.log('🚀 Начинаем продвинутый поиск дублей...');

            if (!currentArea || !currentArea.polygon || currentArea.polygon.length < 3) {
                throw new Error('Не передана область или область не содержит валидный полигон');
            }

            // Получаем все объявления
            const allListings = await this.databaseManager.getAll('listings');
            
            // Фильтруем объявления по вхождению в полигон области и статусу
            const listingsInArea = allListings.filter(listing => {
                if (!listing.coordinates || !listing.coordinates.lat || !(listing.coordinates.lng || listing.coordinates.lon)) {
                    return false;
                }
                
                const lat = listing.coordinates.lat;
                const lng = listing.coordinates.lng || listing.coordinates.lon;
                
                return currentArea.containsPoint(lat, lng);
            });

            const targetListings = listingsInArea.filter(listing => 
                listing.processing_status === 'duplicate_check_needed'
            );

            console.log(`📋 Всего объявлений в базе: ${allListings.length}`);
            console.log(`🗺️ Объявлений в области: ${listingsInArea.length}`);
            console.log(`🎯 Объявлений для обработки на дубли: ${targetListings.length}`);

            if (targetListings.length === 0) {
                console.log('📭 Нет объявлений для обработки на дубли в области');
                return { processed: 0, merged: 0, groups: 0, errors: 0 };
            }

            // Группируем по адресам
            const addressGroups = this.groupListingsByAddress(targetListings);
            console.log(`🏘️ Сгруппировано по ${addressGroups.size} адресам`);

            const results = {
                processed: 0,
                merged: 0,
                groups: 0,
                errors: 0
            };

            let totalProcessed = 0;
            const totalListings = targetListings.length;

            // Обрабатываем каждую группу адресов
            for (const [addressId, listings] of addressGroups) {
                console.log(`🏠 Обрабатываем адрес ${addressId}: ${listings.length} объявлений`);

                if (listings.length < 2) {
                    // Создаем объект из одного объявления
                    try {
                        console.log(`🏠 Создаем объект из единственного объявления в адресе ${addressId}`);
                        await window.realEstateObjectManager.mergeIntoObject(
                            [{ type: 'listing', id: listings[0].id }], 
                            addressId
                        );
                        totalProcessed++;
                        results.merged++;
                        console.log(`✅ Создан объект из единственного объявления ${listings[0].id}`);
                    } catch (error) {
                        console.error(`❌ Ошибка создания объекта из единственного объявления ${listings[0].id}:`, error);
                        results.errors++;
                    }
                    continue;
                }

                // Используем продвинутый алгоритм группировки
                const clusters = await this.clusterListingsAdvanced(listings);
                
                for (const cluster of clusters) {
                    try {
                        console.log(`🔄 Объединяем кластер из ${cluster.length} объявлений...`);
                        
                        const itemsToMerge = cluster.map(listing => ({ type: 'listing', id: listing.id }));
                        await window.realEstateObjectManager.mergeIntoObject(itemsToMerge, addressId);
                        
                        results.merged += cluster.length;
                        totalProcessed += cluster.length;
                        
                        console.log(`✅ Успешно объединен кластер из ${cluster.length} объявлений`);
                    } catch (error) {
                        console.error('❌ Ошибка объединения кластера:', error);
                        results.errors++;
                    }
                }

                results.groups++;

                // Вызываем callback прогресса
                if (progressCallback) {
                    progressCallback({
                        current: totalProcessed,
                        total: totalListings,
                        percent: Math.round((totalProcessed / totalListings) * 100)
                    });
                }
            }

            results.processed = totalProcessed;

            console.log('🎯 Продвинутая обработка дублей завершена:', results);
            return results;

        } catch (error) {
            console.error('❌ Ошибка продвинутой обработки дублей:', error);
            throw error;
        }
    }

    /**
     * Продвинутая кластеризация объявлений
     */
    async clusterListingsAdvanced(listings) {
        console.log(`🧩 Начинаем продвинутую кластеризацию ${listings.length} объявлений`);

        const clusters = [];
        const processed = new Set();

        // Создаем матрицу сходства
        const similarityMatrix = [];
        for (let i = 0; i < listings.length; i++) {
            similarityMatrix[i] = [];
            for (let j = 0; j < listings.length; j++) {
                if (i === j) {
                    similarityMatrix[i][j] = 1.0;
                } else if (i < j) {
                    const comparison = await this.compareListingsAdvanced(listings[i], listings[j]);
                    similarityMatrix[i][j] = comparison.score.final;
                    similarityMatrix[j] = similarityMatrix[j] || [];
                    similarityMatrix[j][i] = comparison.score.final;
                }
            }
        }

        // Кластеризация по принципу "связанных компонентов"
        for (let i = 0; i < listings.length; i++) {
            if (processed.has(i)) continue;

            const cluster = [];
            const toCheck = [i];
            
            while (toCheck.length > 0) {
                const currentIndex = toCheck.pop();
                if (processed.has(currentIndex)) continue;
                
                processed.add(currentIndex);
                cluster.push(listings[currentIndex]);

                // Ищем связанные объявления
                for (let j = 0; j < listings.length; j++) {
                    if (!processed.has(j) && similarityMatrix[currentIndex][j] >= 0.70) {
                        toCheck.push(j);
                    }
                }
            }

            if (cluster.length > 0) {
                clusters.push(cluster);
                console.log(`   🧩 Создан кластер из ${cluster.length} объявлений`);
            }
        }

        console.log(`✅ Кластеризация завершена: ${clusters.length} кластеров`);
        return clusters;
    }

    /**
     * Группировка объявлений по адресам
     */
    groupListingsByAddress(listings) {
        const groups = new Map();

        listings.forEach(listing => {
            const addressId = listing.address_id;
            if (!addressId) return;

            if (!groups.has(addressId)) {
                groups.set(addressId, []);
            }
            groups.get(addressId).push(listing);
        });

        return groups;
    }
}

// Создаем глобальный экземпляр
window.advancedDuplicateDetector = new AdvancedDuplicateDetector();