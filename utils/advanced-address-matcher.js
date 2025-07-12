/**
 * Усовершенствованный алгоритм сопоставления адресов объявлений с базой адресов
 * Основан на анализе обработанных объявлений и улучшенных методах анализа
 */

class AdvancedAddressMatcher {
    constructor(spatialIndex) {
        this.spatialIndex = spatialIndex;
        
        // Улучшенная конфигурация на основе анализа
        this.config = {
            // Радиусы поиска (в метрах) - уменьшены для более точного поиска
            exactRadius: 20,        // Очень точное совпадение
            nearRadius: 60,         // Ближний поиск
            extendedRadius: 150,    // Расширенный поиск
            farRadius: 400,         // Дальний поиск для редких случаев
            
            // Улучшенные пороги для текстового сходства
            highSimilarity: 0.90,   // Высокое сходство (повышен)
            mediumSimilarity: 0.75, // Среднее сходство (повышен)  
            lowSimilarity: 0.55,    // Минимальное сходство (повышен)
            veryLowSimilarity: 0.35, // Очень низкое сходство
            
            // Улучшенные веса для композитного скора
            weights: {
                distance: 0.25,         // Уменьшен вес расстояния
                textSimilarity: 0.45,   // Увеличен вес текстового сходства
                semanticSimilarity: 0.20, // Новый: семантическое сходство
                structuralSimilarity: 0.10 // Новый: структурное сходство
            }
        };

        // Словари для семантического анализа
        this.semanticDictionaries = {
            streetTypes: {
                'улица': ['ул', 'улица', 'street', 'st'],
                'проспект': ['пр', 'проспект', 'пр-т', 'avenue', 'av'],
                'переулок': ['пер', 'переулок', 'lane'],
                'бульвар': ['бул', 'бульвар', 'boulevard', 'blvd'],
                'площадь': ['пл', 'площадь', 'square', 'sq'],
                'набережная': ['наб', 'набережная', 'embankment'],
                'шоссе': ['ш', 'шоссе', 'highway', 'hwy']
            },
            buildingTypes: {
                'дом': ['д', 'дом', 'house', 'h'],
                'корпус': ['к', 'корп', 'корпус', 'building', 'bld'],
                'строение': ['стр', 'строение', 'structure'],
                'литер': ['лит', 'литер', 'letter']
            },
            regions: {
                'москва': ['москва', 'moscow', 'мск'],
                'санкт-петербург': ['спб', 'питер', 'санкт-петербург', 'st-petersburg']
            }
        };

        // Паттерны для извлечения номеров домов
        this.houseNumberPatterns = [
            /\b(\d+)\s*([а-яёa-z]*)\s*к?(?:орпус)?\s*(\d+)\b/gi, // 2к1, 2 корпус 1
            /\b(\d+)\s*([а-яёa-z]+)\b/gi,                        // 2А, 15Б
            /\b(\d+)\b/gi                                        // просто число
        ];
    }

    /**
     * Основной улучшенный метод сопоставления адреса
     */
    async matchAddressAdvanced(listing, addresses) {
        const listingCoords = {
            lat: parseFloat(listing.coordinates.lat),
            lng: parseFloat(listing.coordinates.lng || listing.coordinates.lon)
        };
        
        const listingAddress = listing.address || '';
        console.log(`🎯 Продвинутый поиск адреса для: "${listingAddress}" в координатах ${listingCoords.lat}, ${listingCoords.lng}`);
        
        // Предварительный анализ адреса
        const addressAnalysis = this.analyzeAddressStructure(listingAddress);
        console.log(`📋 Анализ структуры адреса:`, addressAnalysis);

        // Этап 1: Очень точное географическое совпадение (20м)
        const exactMatches = this.findAddressesInRadius(addresses, listingCoords, this.config.exactRadius);
        if (exactMatches.length === 1) {
            return {
                address: exactMatches[0],
                confidence: 'high',
                method: 'exact_geo_precise',
                distance: this.calculateDistance(listingCoords, exactMatches[0].coordinates),
                score: 1.0,
                analysis: addressAnalysis
            };
        }

        // Этап 2: Умный ближний поиск с семантическим анализом (60м)
        const nearMatches = this.findAddressesInRadius(addresses, listingCoords, this.config.nearRadius);
        if (nearMatches.length > 0) {
            const bestNearMatch = this.findBestSemanticMatch(listingAddress, nearMatches, listingCoords, addressAnalysis);
            if (bestNearMatch.totalScore >= this.config.highSimilarity) {
                return {
                    address: bestNearMatch.address,
                    confidence: 'high',
                    method: 'semantic_near_geo',
                    distance: bestNearMatch.distance,
                    textSimilarity: bestNearMatch.textSimilarity,
                    semanticSimilarity: bestNearMatch.semanticSimilarity,
                    structuralSimilarity: bestNearMatch.structuralSimilarity,
                    score: bestNearMatch.totalScore,
                    analysis: addressAnalysis
                };
            }
        }

        // Этап 3: Расширенный поиск с улучшенным текстовым анализом (150м)
        const extendedMatches = this.findAddressesInRadius(addresses, listingCoords, this.config.extendedRadius);
        if (extendedMatches.length > 0) {
            const bestExtendedMatch = this.findBestSemanticMatch(listingAddress, extendedMatches, listingCoords, addressAnalysis);
            if (bestExtendedMatch.totalScore >= this.config.mediumSimilarity) {
                return {
                    address: bestExtendedMatch.address,
                    confidence: bestExtendedMatch.totalScore >= this.config.highSimilarity ? 'high' : 'medium',
                    method: 'semantic_extended_geo',
                    distance: bestExtendedMatch.distance,
                    textSimilarity: bestExtendedMatch.textSimilarity,
                    semanticSimilarity: bestExtendedMatch.semanticSimilarity,
                    structuralSimilarity: bestExtendedMatch.structuralSimilarity,
                    score: bestExtendedMatch.totalScore,
                    analysis: addressAnalysis
                };
            }
        }

        // Этап 4: Дальний поиск для сложных случаев (400м)
        const farMatches = this.findAddressesInRadius(addresses, listingCoords, this.config.farRadius);
        if (farMatches.length > 0) {
            const bestFarMatch = this.findBestSemanticMatch(listingAddress, farMatches, listingCoords, addressAnalysis);
            if (bestFarMatch.totalScore >= this.config.lowSimilarity) {
                let confidence = 'low';
                if (bestFarMatch.totalScore >= this.config.highSimilarity) confidence = 'medium';
                else if (bestFarMatch.totalScore >= this.config.mediumSimilarity) confidence = 'medium';
                
                return {
                    address: bestFarMatch.address,
                    confidence: confidence,
                    method: 'semantic_far_geo',
                    distance: bestFarMatch.distance,
                    textSimilarity: bestFarMatch.textSimilarity,
                    semanticSimilarity: bestFarMatch.semanticSimilarity,
                    structuralSimilarity: bestFarMatch.structuralSimilarity,
                    score: bestFarMatch.totalScore,
                    analysis: addressAnalysis
                };
            }
        }

        // Этап 5: Глобальный поиск с продвинутым семантическим анализом
        const globalBestMatch = this.findBestSemanticMatch(listingAddress, addresses, listingCoords, addressAnalysis);
        if (globalBestMatch.totalScore >= this.config.veryLowSimilarity) {
            return {
                address: globalBestMatch.address,
                confidence: 'very_low',
                method: 'semantic_global',
                distance: globalBestMatch.distance,
                textSimilarity: globalBestMatch.textSimilarity,
                semanticSimilarity: globalBestMatch.semanticSimilarity,
                structuralSimilarity: globalBestMatch.structuralSimilarity,
                score: globalBestMatch.totalScore,
                analysis: addressAnalysis
            };
        }

        // Адрес не найден
        return {
            address: null,
            confidence: 'none',
            method: 'no_match',
            distance: null,
            score: 0,
            analysis: addressAnalysis
        };
    }

    /**
     * Анализ структуры адреса
     */
    analyzeAddressStructure(address) {
        const normalized = this.normalizeAddressAdvanced(address);
        
        return {
            original: address,
            normalized: normalized,
            hasCity: this.extractCity(address),
            street: this.extractStreet(address),
            houseNumber: this.extractHouseNumber(address),
            building: this.extractBuilding(address),
            tokens: normalized.split(/\s+/).filter(t => t.length > 0),
            length: normalized.length,
            wordCount: normalized.split(/\s+/).length
        };
    }

    /**
     * Улучшенная нормализация адреса
     */
    normalizeAddressAdvanced(address) {
        let normalized = address.toLowerCase().trim();
        
        // Нормализуем типы улиц
        Object.entries(this.semanticDictionaries.streetTypes).forEach(([canonical, variants]) => {
            const pattern = new RegExp(`\\b(${variants.join('|')})\\b`, 'gi');
            normalized = normalized.replace(pattern, canonical);
        });

        // Нормализуем типы зданий
        Object.entries(this.semanticDictionaries.buildingTypes).forEach(([canonical, variants]) => {
            const pattern = new RegExp(`\\b(${variants.join('|')})\\b`, 'gi');
            normalized = normalized.replace(pattern, canonical);
        });

        // Стандартизируем пунктуацию и пробелы
        normalized = normalized
            .replace(/[^\w\sа-яё]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return normalized;
    }

    /**
     * Извлечение города из адреса
     */
    extractCity(address) {
        const normalized = address.toLowerCase();
        for (const [city, variants] of Object.entries(this.semanticDictionaries.regions)) {
            if (variants.some(variant => normalized.includes(variant))) {
                return city;
            }
        }
        return null;
    }

    /**
     * Извлечение названия улицы
     */
    extractStreet(address) {
        const normalized = this.normalizeAddressAdvanced(address);
        
        // Ищем паттерн: [название] [тип улицы]
        const streetPattern = /([а-яё\s]+)\s+(улица|проспект|переулок|бульвар|площадь|набережная|шоссе)/i;
        const match = normalized.match(streetPattern);
        
        if (match) {
            return match[1].trim() + ' ' + match[2];
        }

        // Если не найден четкий паттерн, возвращаем весь адрес без номера дома
        return normalized.replace(/\b\d+[а-яё]*\s*(корпус|дом|строение)?\s*\d*\b/gi, '').trim();
    }

    /**
     * Извлечение номера дома
     */
    extractHouseNumber(address) {
        for (const pattern of this.houseNumberPatterns) {
            const match = address.match(pattern);
            if (match) {
                return match[0].trim();
            }
        }
        return null;
    }

    /**
     * Извлечение информации о строении/корпусе
     */
    extractBuilding(address) {
        const buildingPattern = /(?:к|корпус|стр|строение|лит|литер)\s*([а-яё\d]+)/gi;
        const match = address.match(buildingPattern);
        return match ? match[0].trim() : null;
    }

    /**
     * Поиск лучшего совпадения с семантическим анализом
     */
    findBestSemanticMatch(targetAddress, candidates, targetCoords, targetAnalysis) {
        let bestMatch = {
            address: null,
            textSimilarity: 0,
            semanticSimilarity: 0,
            structuralSimilarity: 0,
            distance: Infinity,
            totalScore: 0
        };

        candidates.forEach(candidate => {
            const candidateAnalysis = this.analyzeAddressStructure(candidate.address || '');
            
            // 1. Базовое текстовое сходство
            const textSimilarity = this.calculateAdvancedTextSimilarity(
                targetAnalysis.normalized, 
                candidateAnalysis.normalized
            );

            // 2. Семантическое сходство
            const semanticSimilarity = this.calculateSemanticSimilarity(targetAnalysis, candidateAnalysis);

            // 3. Структурное сходство
            const structuralSimilarity = this.calculateStructuralSimilarity(targetAnalysis, candidateAnalysis);

            // 4. Расстояние
            const distance = this.calculateDistance(targetCoords, candidate.coordinates);
            const normalizedDistance = Math.min(distance / this.config.farRadius, 1);
            const distanceScore = 1 - normalizedDistance;

            // Композитный скор с улучшенными весами
            const totalScore = 
                (textSimilarity * this.config.weights.textSimilarity) +
                (semanticSimilarity * this.config.weights.semanticSimilarity) +
                (structuralSimilarity * this.config.weights.structuralSimilarity) +
                (distanceScore * this.config.weights.distance);

            if (totalScore > bestMatch.totalScore) {
                bestMatch = {
                    address: candidate,
                    textSimilarity,
                    semanticSimilarity,
                    structuralSimilarity,
                    distance,
                    totalScore
                };
            }
        });

        return bestMatch;
    }

    /**
     * Улучшенное вычисление текстового сходства
     */
    calculateAdvancedTextSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;

        // 1. Расстояние Левенштейна
        const levenshteinSim = 1 - (this.levenshteinDistance(str1, str2) / Math.max(str1.length, str2.length));

        // 2. Жаккара для токенов
        const tokens1 = new Set(str1.split(/\s+/));
        const tokens2 = new Set(str2.split(/\s+/));
        const jaccardSim = this.jaccardSimilarity(tokens1, tokens2);

        // 3. N-граммы разных размеров
        const bigram = this.ngramSimilarity(str1, str2, 2);
        const trigram = this.ngramSimilarity(str1, str2, 3);

        // 4. Сходство самых длинных общих подстрок
        const lcsSim = this.longestCommonSubsequence(str1, str2) / Math.max(str1.length, str2.length);

        // Взвешенная комбинация
        return (levenshteinSim * 0.3) + (jaccardSim * 0.3) + (bigram * 0.2) + (trigram * 0.1) + (lcsSim * 0.1);
    }

    /**
     * Семантическое сходство адресов
     */
    calculateSemanticSimilarity(analysis1, analysis2) {
        let semanticScore = 0;
        let totalChecks = 0;

        // Сравнение городов
        if (analysis1.hasCity && analysis2.hasCity) {
            semanticScore += analysis1.hasCity === analysis2.hasCity ? 1 : 0;
            totalChecks++;
        }

        // Сравнение номеров домов
        if (analysis1.houseNumber && analysis2.houseNumber) {
            semanticScore += analysis1.houseNumber === analysis2.houseNumber ? 1 : 0;
            totalChecks++;
        }

        // Сравнение строений/корпусов
        if (analysis1.building && analysis2.building) {
            semanticScore += analysis1.building === analysis2.building ? 1 : 0;
            totalChecks++;
        }

        // Сходство названий улиц (без типов)
        if (analysis1.street && analysis2.street) {
            const street1 = analysis1.street.replace(/\b(улица|проспект|переулок|бульвар|площадь|набережная|шоссе)\b/g, '').trim();
            const street2 = analysis2.street.replace(/\b(улица|проспект|переулок|бульвар|площадь|набережная|шоссе)\b/g, '').trim();
            
            if (street1 && street2) {
                const streetSimilarity = this.calculateAdvancedTextSimilarity(street1, street2);
                semanticScore += streetSimilarity;
                totalChecks++;
            }
        }

        return totalChecks > 0 ? semanticScore / totalChecks : 0;
    }

    /**
     * Структурное сходство адресов
     */
    calculateStructuralSimilarity(analysis1, analysis2) {
        let structuralScore = 0;
        let totalChecks = 0;

        // Сходство количества слов
        const wordCountDiff = Math.abs(analysis1.wordCount - analysis2.wordCount);
        const maxWords = Math.max(analysis1.wordCount, analysis2.wordCount);
        if (maxWords > 0) {
            structuralScore += 1 - (wordCountDiff / maxWords);
            totalChecks++;
        }

        // Сходство длины
        const lengthDiff = Math.abs(analysis1.length - analysis2.length);
        const maxLength = Math.max(analysis1.length, analysis2.length);
        if (maxLength > 0) {
            structuralScore += 1 - (lengthDiff / maxLength);
            totalChecks++;
        }

        // Общие токены
        const tokens1 = new Set(analysis1.tokens);
        const tokens2 = new Set(analysis2.tokens);
        if (tokens1.size > 0 || tokens2.size > 0) {
            structuralScore += this.jaccardSimilarity(tokens1, tokens2);
            totalChecks++;
        }

        return totalChecks > 0 ? structuralScore / totalChecks : 0;
    }

    /**
     * Поиск адресов в радиусе
     */
    findAddressesInRadius(addresses, center, radiusMeters) {
        return addresses.filter(address => {
            if (!address.coordinates || !address.coordinates.lat || !address.coordinates.lng) {
                return false;
            }
            
            const distance = this.calculateDistance(center, address.coordinates);
            return distance <= radiusMeters;
        });
    }

    /**
     * Расчет расстояния между координатами (формула Haversine)
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
     * Расстояние Левенштейна
     */
    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        
        for (let i = 0; i <= str1.length; i += 1) {
            matrix[0][i] = i;
        }
        
        for (let j = 0; j <= str2.length; j += 1) {
            matrix[j][0] = j;
        }
        
        for (let j = 1; j <= str2.length; j += 1) {
            for (let i = 1; i <= str1.length; i += 1) {
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

    /**
     * Сходство Жаккара
     */
    jaccardSimilarity(set1, set2) {
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Сходство n-грамм
     */
    ngramSimilarity(str1, str2, n = 2) {
        const ngrams1 = this.getNgrams(str1, n);
        const ngrams2 = this.getNgrams(str2, n);
        return this.jaccardSimilarity(ngrams1, ngrams2);
    }

    /**
     * Получение n-грамм
     */
    getNgrams(str, n) {
        const ngrams = new Set();
        for (let i = 0; i <= str.length - n; i++) {
            ngrams.add(str.substr(i, n));
        }
        return ngrams;
    }

    /**
     * Наибольшая общая подпоследовательность
     */
    longestCommonSubsequence(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        return dp[m][n];
    }
}

// Создаем глобальный экземпляр
window.advancedAddressMatcher = new AdvancedAddressMatcher();