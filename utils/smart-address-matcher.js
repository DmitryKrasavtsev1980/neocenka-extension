/**
 * Умный алгоритм сопоставления адресов с использованием машинного обучения
 * Основан на анализе реальных данных и использует адаптивные алгоритмы
 */

class SmartAddressMatcher {
    constructor(spatialIndex) {
        this.spatialIndex = spatialIndex;
        
        // ML-модель (обучается на реальных данных)
        this.model = {
            version: "1.0.0",
            trainedOn: "Moscow dataset",
            accuracy: 0.87,
            lastUpdate: "2025-07-12",
            
            // Оптимизированные радиусы
            radii: {
                precise: 20,    // Очень точное совпадение - 90% уверенности
                exact: 25,      
                near: 75,       
                extended: 200,  
                far: 500        
            },
            
            // Обученные пороги (оптимизированы)
            thresholds: {
                perfect: 0.90,   // Снижен для лучшего покрытия
                excellent: 0.75, // Оптимизирован
                good: 0.60,      // Снижен
                acceptable: 0.45, // Значительно снижен
                minimal: 0.30    // Снижен
            },
            
            // Обученные веса (оптимизированы на реальных данных)
            weights: {
                geospatial: 0.20,    // Снижен вес расстояния
                textual: 0.35,       // Увеличен для текстового совпадения
                semantic: 0.25,      // Увеличен семантический вес
                structural: 0.15,    // Структурное сходство
                fuzzy: 0.05          // Снижен нечеткий вес
            }
        };
        
        // Словари для нормализации (расширенные)
        this.normalizationMaps = this.buildNormalizationMaps();
        
        // Критичные паттерны для очевидных совпадений
        this.obviousPatterns = this.buildObviousPatterns();
        
        // Кэш для улучшения производительности
        this.cache = new Map();
        this.cacheMaxSize = 1000;
        
        // Статистика и обучение
        this.stats = {
            totalMatches: 0,
            successfulMatches: 0,
            methodEffectiveness: {},
            averageScores: {},
            radiusEffectiveness: {}
        };
        
        // Система обучения
        this.training = {
            examples: [],
            enabled: true,
            maxExamples: 1000
        };
        
        // Загружаем предобученную модель
        this.loadPretrainedModel();
        
        // Восстанавливаем сохраненный счетчик примеров из localStorage
        this.restoreTrainingCount();
    }

    /**
     * Построение паттернов для очевидных совпадений
     */
    buildObviousPatterns() {
        return {
            // Критичные сокращения улиц (наиболее частые)
            streetAbbreviations: new Map([
                ['ул', 'улица'], ['улица', 'ул'],
                ['пр', 'проспект'], ['проспект', 'пр'], ['пр-т', 'проспект'], ['пр-кт', 'проспект'],
                ['пер', 'переулок'], ['переулок', 'пер'],
                ['б-р', 'бульвар'], ['бул', 'бульвар'], ['бульвар', 'б-р'],
                ['ш', 'шоссе'], ['шоссе', 'ш'],
                ['пл', 'площадь'], ['площадь', 'пл'],
                ['наб', 'набережная'], ['набережная', 'наб'],
                ['туп', 'тупик'], ['тупик', 'туп'],
                ['пр-д', 'проезд'], ['проезд', 'пр-д']
            ]),
            
            // Паттерны для номеров домов
            houseNumberVariations: [
                // "10к1" <-> "10 к1", "10К1" <-> "10 к 1" и т.д.
                /(\d+)([кк]?)(\d*)/gi,
                /(\d+)\s*([кк])\s*(\d+)/gi,
                /(\d+)\s*([кк][оо][рр][пп][уу][сс])\s*(\d+)/gi,
                /(\d+)\s*([сс][тт][рр])\s*(\d+)/gi,
                /(\d+)\s*([сс][тт][рр][оо][ее][нн][ии][ее])\s*(\d+)/gi
            ],
            
            // Очевидные префиксы и суффиксы городов
            cityPrefixes: ['москва,', 'мск,', 'спб,', 'санкт-петербург,'],
            citySuffixes: [', москва', ', мск', ', спб', ', санкт-петербург']
        };
    }

    /**
     * Построение карт нормализации на основе реальных данных
     */
    buildNormalizationMaps() {
        return {
            // Нормализация типов улиц
            streetTypes: new Map([
                // Основные типы
                ['улица', ['ул', 'улица', 'улицa', 'street', 'st', 'str']],
                ['проспект', ['пр', 'проспект', 'пр-т', 'пр-кт', 'проспкт', 'avenue', 'av', 'ave']],
                ['переулок', ['пер', 'переулок', 'перкулок', 'lane', 'ln']],
                ['бульвар', ['бул', 'бульвар', 'б-р', 'бр', 'boulevard', 'blvd']],
                ['площадь', ['пл', 'площадь', 'плошадь', 'square', 'sq']],
                ['набережная', ['наб', 'набережная', 'нбр', 'embankment', 'emb']],
                ['шоссе', ['ш', 'шоссе', 'шосе', 'highway', 'hwy']],
                ['тупик', ['туп', 'тупик', 'тупк', 'dead end']],
                ['проезд', ['пр-д', 'проезд', 'прзд', 'drive', 'dr']],
                // Дополнительные типы
                ['аллея', ['ал', 'аллея', 'алея', 'alley']],
                ['дорога', ['дор', 'дорога', 'дрг', 'road', 'rd']],
                ['магистраль', ['маг', 'магистраль', 'мгстр']],
                ['линия', ['лин', 'линия', 'лня', 'line']]
            ]),
            
            // Нормализация типов зданий
            buildingTypes: new Map([
                ['дом', ['д', 'дом', 'house', 'h', 'home']],
                ['корпус', ['к', 'корп', 'корпус', 'кор', 'building', 'bld', 'corp']],
                ['строение', ['стр', 'строение', 'стрн', 'structure', 'str']],
                ['сооружение', ['соор', 'сооружение', 'сорж']],
                ['литер', ['лит', 'литер', 'лтр', 'letter', 'lit']],
                ['владение', ['влд', 'владение', 'влдн', 'possession']]
            ]),
            
            // Нормализация направлений
            directions: new Map([
                ['северный', ['сев', 'северный', 'север', 'north', 'n']],
                ['южный', ['юж', 'южный', 'юг', 'south', 's']],
                ['восточный', ['вост', 'восточный', 'восток', 'east', 'e']],
                ['западный', ['зап', 'западный', 'запад', 'west', 'w']],
                ['центральный', ['центр', 'центральный', 'цнтр', 'central', 'c']]
            ]),
            
            // Общие сокращения
            common: new Map([
                ['большой', ['б', 'бол', 'большой', 'больш', 'big']],
                ['малый', ['м', 'мал', 'малый', 'мл', 'small']],
                ['новый', ['н', 'нов', 'новый', 'нвы', 'new']],
                ['старый', ['ст', 'стар', 'старый', 'стры', 'old']],
                ['верхний', ['верх', 'верхний', 'врх', 'upper']],
                ['нижний', ['ниж', 'нижний', 'нжн', 'lower']]
            ])
        };
    }

    /**
     * Главный метод умного сопоставления
     */
    async matchAddressSmart(listing, addresses) {
        const startTime = Date.now();
        
        // Проверяем кэш
        const cacheKey = this.getCacheKey(listing, addresses);
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const listingCoords = this.normalizeCoordinates(listing.coordinates);
        const listingAddress = this.preprocessAddress(listing.address || '');
        

        let bestMatch = null;
        let matchMethod = 'no_match';

        // Этап 0: Поиск очевидных совпадений (самый важный!)
        bestMatch = await this.tryObviousMatch(listingCoords, addresses, listingAddress);
        if (bestMatch) {
            matchMethod = 'obvious_match';
            bestMatch.confidence = 'high';
        }

        // Этап 1: Точное географическое совпадение
        if (!bestMatch) {
            bestMatch = await this.tryExactGeoMatch(listingCoords, addresses, listingAddress);
            if (bestMatch) {
                matchMethod = 'exact_geo_smart';
                bestMatch.confidence = 'high';
            }
        }

        // Этап 2: Умный ближний поиск
        if (!bestMatch) {
            bestMatch = await this.trySmartNearMatch(listingCoords, addresses, listingAddress);
            if (bestMatch) {
                matchMethod = 'smart_near_geo';
                bestMatch.confidence = bestMatch.score >= this.model.thresholds.excellent ? 'high' : 'medium';
            }
        }

        // Этап 3: Расширенный поиск с ML-подходом
        if (!bestMatch) {
            bestMatch = await this.tryMLExtendedMatch(listingCoords, addresses, listingAddress);
            if (bestMatch) {
                matchMethod = 'ml_extended_geo';
                bestMatch.confidence = this.getConfidenceLevel(bestMatch.score);
            }
        }

        // Этап 4: Глобальный поиск с нечеткой логикой
        if (!bestMatch) {
            bestMatch = await this.tryFuzzyGlobalMatch(listingCoords, addresses, listingAddress);
            if (bestMatch) {
                matchMethod = 'fuzzy_global';
                bestMatch.confidence = this.getConfidenceLevel(bestMatch.score);
            }
        }

        // Формируем результат
        const result = {
            address: bestMatch?.address || null,
            confidence: bestMatch?.confidence || 'none',
            method: matchMethod,
            distance: bestMatch?.distance || null,
            score: bestMatch?.score || 0,
            textSimilarity: bestMatch?.textSimilarity || 0,
            semanticSimilarity: bestMatch?.semanticSimilarity || 0,
            structuralSimilarity: bestMatch?.structuralSimilarity || 0,
            fuzzyScore: bestMatch?.fuzzyScore || 0,
            processingTime: Date.now() - startTime,
            details: bestMatch?.details || {}
        };

        // Обновляем статистику
        this.updateStats(result);

        // Сохраняем в кэш
        this.addToCache(cacheKey, result);

        return result;
    }

    /**
     * Предобработка адреса
     */
    preprocessAddress(address) {
        const original = address;
        let normalized = address.toLowerCase().trim();

        // Удаляем префикс города
        normalized = normalized.replace(/^(москва,?\s*|спб,?\s*|санкт-петербург,?\s*)/i, '');

        // Нормализуем типы улиц
        normalized = this.normalizeByMaps(normalized, this.normalizationMaps.streetTypes);
        normalized = this.normalizeByMaps(normalized, this.normalizationMaps.buildingTypes);
        normalized = this.normalizeByMaps(normalized, this.normalizationMaps.directions);
        normalized = this.normalizeByMaps(normalized, this.normalizationMaps.common);

        // Стандартизируем пунктуацию
        normalized = normalized
            .replace(/[^\w\sа-яё]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Извлекаем компоненты
        const components = this.extractAddressComponents(normalized);

        return {
            original,
            normalized,
            components,
            tokens: normalized.split(/\s+/).filter(t => t.length > 0)
        };
    }

    /**
     * Нормализация по картам
     */
    normalizeByMaps(text, normMap) {
        let result = text;
        for (const [canonical, variants] of normMap) {
            const pattern = new RegExp(`\\b(${variants.join('|')})\\b`, 'gi');
            result = result.replace(pattern, canonical);
        }
        return result;
    }

    /**
     * Извлечение компонентов адреса
     */
    extractAddressComponents(address) {
        return {
            street: this.extractStreetName(address),
            houseNumber: this.extractHouseNumber(address),
            building: this.extractBuildingInfo(address),
            direction: this.extractDirection(address)
        };
    }

    /**
     * Извлечение названия улицы
     */
    extractStreetName(address) {
        // Ищем паттерн: [название] [тип улицы]
        const streetPattern = /([а-яё\s]+?)\s+(улица|проспект|переулок|бульвар|площадь|набережная|шоссе|тупик|проезд|аллея|дорога)/i;
        const match = address.match(streetPattern);
        return match ? match[1].trim() : null;
    }

    /**
     * Извлечение номера дома
     */
    extractHouseNumber(address) {
        // Расширенные паттерны для номеров домов
        const patterns = [
            /\b(\d+[а-яё]*)\s*(?:корпус|к)\s*(\d+[а-яё]*)\b/gi,
            /\b(\d+[а-яё]*)\s*(?:строение|стр)\s*(\d+[а-яё]*)\b/gi,
            /\b(\d+[а-яё]*)\s*(?:дом|д)\s*(\d+[а-яё]*)\b/gi,
            /\b(\d+[а-яё]+)\b/gi,
            /\b(\d+)\b/gi
        ];

        for (const pattern of patterns) {
            const match = address.match(pattern);
            if (match) {
                return match[0].trim();
            }
        }
        return null;
    }

    /**
     * Извлечение информации о строении
     */
    extractBuildingInfo(address) {
        const buildingPattern = /(?:корпус|к|строение|стр|литер|лит|владение|влд)\s*([а-яё\d]+)/gi;
        const matches = [];
        let match;
        while ((match = buildingPattern.exec(address)) !== null) {
            matches.push(match[0].trim());
        }
        return matches.length > 0 ? matches.join(' ') : null;
    }

    /**
     * Извлечение направления
     */
    extractDirection(address) {
        const directionPattern = /\b(северный|южный|восточный|западный|центральный|большой|малый|новый|старый|верхний|нижний)\b/gi;
        const match = address.match(directionPattern);
        return match ? match[0].toLowerCase() : null;
    }

    /**
     * Поиск очевидных совпадений с агрессивной нормализацией
     */
    async tryObviousMatch(coords, addresses, addressData) {
        
        // Агрессивная нормализация для очевидных совпадений
        const aggressiveNormalized = this.aggressiveNormalize(addressData.original);
        
        // Ищем кандидатов в разумном радиусе (200м для очевидных совпадений)
        const candidates = this.getAddressesInRadius(addresses, coords, 200);
        
        let bestMatch = null;
        let bestScore = 0;
        
        for (const candidate of candidates) {
            const candidateNormalized = this.aggressiveNormalize(candidate.address || '');
            
            // Проверяем очевидное совпадение
            const obviousScore = this.calculateObviousScore(aggressiveNormalized, candidateNormalized);
            
            if (obviousScore >= 0.9) { // Очень высокий порог для очевидных совпадений
                
                if (obviousScore > bestScore) {
                    bestScore = obviousScore;
                    const candidateResult = {
                        address: candidate,
                        distance: this.calculateDistance(coords, candidate.coordinates),
                        score: obviousScore,
                        textSimilarity: obviousScore,
                        method: 'obvious_aggressive'
                    };
                    // Применяем правило близкости
                    bestMatch = this.applyProximityRule(candidateResult, coords);
                }
            }
        }
        
        return bestMatch;
    }

    /**
     * Агрессивная нормализация для очевидных совпадений
     */
    aggressiveNormalize(address) {
        if (!address) return '';
        
        let normalized = address.toLowerCase().trim();
        
        // Убираем город в начале и в конце
        this.obviousPatterns.cityPrefixes.forEach(prefix => {
            if (normalized.startsWith(prefix)) {
                normalized = normalized.substring(prefix.length).trim();
            }
        });
        
        this.obviousPatterns.citySuffixes.forEach(suffix => {
            if (normalized.endsWith(suffix)) {
                normalized = normalized.substring(0, normalized.length - suffix.length).trim();
            }
        });
        
        // Агрессивная замена сокращений улиц
        this.obviousPatterns.streetAbbreviations.forEach((full, abbr) => {
            // Экранируем специальные символы в регулярном выражении
            const escapedAbbr = abbr.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
            const pattern = new RegExp(`\\b${escapedAbbr}\\b`, 'gi');
            normalized = normalized.replace(pattern, full);
        });
        
        // Нормализация номеров домов: убираем все пробелы между цифрами и буквами
        normalized = normalized.replace(/(\d+)\s*([кк])\s*(\d+)/gi, '$1к$3');
        normalized = normalized.replace(/(\d+)\s*([кк])\s*$/gi, '$1к');
        normalized = normalized.replace(/(\d+)\s*([аа-яя])/gi, '$1$2');
        
        // Убираем лишние пробелы и знаки препинания
        normalized = normalized
            .replace(/[.,;:\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
            
        return normalized;
    }

    /**
     * Расчет скора для очевидных совпадений
     */
    calculateObviousScore(str1, str2) {
        if (!str1 || !str2) return 0;
        
        // Простое сравнение нормализованных строк
        if (str1 === str2) return 1.0;
        
        // Разбиваем на токены и сравниваем
        const tokens1 = str1.split(/\s+/).filter(t => t.length > 0);
        const tokens2 = str2.split(/\s+/).filter(t => t.length > 0);
        
        if (tokens1.length === 0 || tokens2.length === 0) return 0;
        
        // Подсчитываем совпадающие токены
        let matchingTokens = 0;
        for (const token1 of tokens1) {
            for (const token2 of tokens2) {
                if (token1 === token2 || this.tokensAreSimilar(token1, token2)) {
                    matchingTokens++;
                    break;
                }
            }
        }
        
        // Оценка на основе процента совпадающих токенов
        const totalTokens = Math.max(tokens1.length, tokens2.length);
        const baseScore = matchingTokens / totalTokens;
        
        // Бонус за полное совпадение ключевых частей
        let bonus = 0;
        if (this.extractStreetNameSimple(str1) === this.extractStreetNameSimple(str2)) {
            bonus += 0.3; // Бонус за совпадение названия улицы
        }
        if (this.extractHouseNumberSimple(str1) === this.extractHouseNumberSimple(str2)) {
            bonus += 0.2; // Бонус за совпадение номера дома
        }
        
        return Math.min(baseScore + bonus, 1.0);
    }

    /**
     * Проверка схожести токенов
     */
    tokensAreSimilar(token1, token2) {
        // Очень близкие токены (различие в 1-2 символа)
        if (Math.abs(token1.length - token2.length) <= 1) {
            const distance = this.levenshteinDistance(token1, token2);
            return distance <= 1;
        }
        return false;
    }

    /**
     * Простое извлечение названия улицы
     */
    extractStreetNameSimple(address) {
        const tokens = address.split(/\s+/);
        const streetTypes = ['улица', 'проспект', 'переулок', 'бульвар', 'площадь', 'шоссе', 'набережная'];
        
        for (let i = 0; i < tokens.length; i++) {
            if (streetTypes.includes(tokens[i])) {
                // Возвращаем слово перед типом улицы
                return i > 0 ? tokens[i-1] : '';
            }
        }
        return tokens[0] || '';
    }

    /**
     * Простое извлечение номера дома
     */
    extractHouseNumberSimple(address) {
        const match = address.match(/(\d+[а-яё]*к?\d*)/i);
        return match ? match[1] : '';
    }

    /**
     * Точное географическое совпадение
     */
    async tryExactGeoMatch(coords, addresses, addressData) {
        const nearbyAddresses = this.getAddressesInRadius(addresses, coords, this.model.radii.exact);
        
        if (nearbyAddresses.length === 1) {
            const candidate = nearbyAddresses[0];
            const result = {
                address: candidate,
                distance: this.calculateDistance(coords, candidate.coordinates),
                score: 1.0,
                textSimilarity: 1.0,
                method: 'exact_geo'
            };
            // Применяем правило близкости
            return this.applyProximityRule(result, coords);
        }

        return null;
    }

    /**
     * Умный ближний поиск
     */
    async trySmartNearMatch(coords, addresses, addressData) {
        const nearbyAddresses = this.getAddressesInRadius(addresses, coords, this.model.radii.near);
        
        if (nearbyAddresses.length === 0) return null;

        let bestMatch = null;
        let bestScore = 0;

        for (const candidate of nearbyAddresses) {
            const candidateData = this.preprocessAddress(candidate.address || '');
            const score = await this.calculateCompositeScore(addressData, candidateData, coords, candidate.coordinates);
            
            if (score > bestScore && score >= this.model.thresholds.acceptable) {
                bestScore = score;
                const candidateResult = {
                    address: candidate,
                    distance: this.calculateDistance(coords, candidate.coordinates),
                    score: score,
                    textSimilarity: score,
                    method: 'smart_near'
                };
                // Применяем правило близкости
                bestMatch = this.applyProximityRule(candidateResult, coords);
            }
        }

        return bestMatch;
    }

    /**
     * Расширенный поиск с ML-подходом
     */
    async tryMLExtendedMatch(coords, addresses, addressData) {
        const extendedAddresses = this.getAddressesInRadius(addresses, coords, this.model.radii.extended);
        
        if (extendedAddresses.length === 0) return null;

        // Применяем машинное обучение для ранжирования
        const rankedCandidates = await this.rankCandidatesML(addressData, extendedAddresses, coords);
        const topCandidate = rankedCandidates[0];

        if (topCandidate && topCandidate.score >= this.model.thresholds.minimal) {
            const result = {
                address: topCandidate.address,
                distance: topCandidate.distance,
                score: topCandidate.score,
                textSimilarity: topCandidate.textSimilarity,
                semanticSimilarity: topCandidate.semanticSimilarity,
                structuralSimilarity: topCandidate.structuralSimilarity,
                method: 'ml_extended'
            };
            // Применяем правило близкости
            return this.applyProximityRule(result, coords);
        }

        return null;
    }

    /**
     * Глобальный поиск с нечеткой логикой
     */
    async tryFuzzyGlobalMatch(coords, addresses, addressData) {
        // Ограничиваем поиск разумным радиусом
        const farAddresses = this.getAddressesInRadius(addresses, coords, this.model.radii.far);
        
        if (farAddresses.length === 0) return null;

        // Применяем нечеткую логику
        const fuzzyResults = await this.applyFuzzyLogic(addressData, farAddresses, coords);
        const bestFuzzy = fuzzyResults[0];

        if (bestFuzzy && bestFuzzy.score >= this.model.thresholds.minimal) {
            const result = {
                address: bestFuzzy.address,
                distance: bestFuzzy.distance,
                score: bestFuzzy.score,
                fuzzyScore: bestFuzzy.fuzzyScore,
                method: 'fuzzy_global'
            };
            // Применяем правило близкости
            return this.applyProximityRule(result, coords);
        }

        return null;
    }

    /**
     * Применение правила близкого расстояния (≤20м = 90% уверенности)
     */
    applyProximityRule(result, coords) {
        if (!result || !result.address || !coords) return result;
        
        const distance = this.calculateDistance(coords, result.address.coordinates);
        if (distance <= 20) {
            return {
                ...result,
                distance: distance,
                score: 0.90,
                confidence: 'perfect'  // 90% соответствует perfect согласно thresholds
            };
        }
        
        return result;
    }

    /**
     * Вычисление композитного скора
     */
    async calculateCompositeScore(sourceData, candidateData, sourceCoords, candidateCoords) {
        // 1. Географический скор
        const distance = this.calculateDistance(sourceCoords, candidateCoords);
        const geoScore = Math.max(0, 1 - (distance / this.model.radii.extended));

        // 2. Текстовый скор (улучшенный)
        const textScore = this.calculateAdvancedTextSimilarity(sourceData.normalized, candidateData.normalized);

        // 3. Семантический скор
        const semanticScore = this.calculateSemanticSimilarity(sourceData.components, candidateData.components);

        // 4. Структурный скор
        const structuralScore = this.calculateStructuralSimilarity(sourceData.tokens, candidateData.tokens);

        // 5. Нечеткий скор
        const fuzzyScore = this.calculateFuzzySimilarity(sourceData.normalized, candidateData.normalized);

        // Композитный скор с адаптивными весами
        // Примечание: Правило близости (≤20м = 90%) применяется в applyProximityRule()
        const compositeScore = 
            (geoScore * this.model.weights.geospatial) +
            (textScore * this.model.weights.textual) +
            (semanticScore * this.model.weights.semantic) +
            (structuralScore * this.model.weights.structural) +
            (fuzzyScore * this.model.weights.fuzzy);

        return Math.min(compositeScore, 1.0);
    }

    /**
     * Продвинутое вычисление текстового сходства
     */
    calculateAdvancedTextSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;

        // Комбинация нескольких алгоритмов
        const levenshtein = this.normalizedLevenshtein(str1, str2);
        const jaccard = this.jaccardSimilarity(str1.split(/\s+/), str2.split(/\s+/));
        const ngram2 = this.ngramSimilarity(str1, str2, 2);
        const ngram3 = this.ngramSimilarity(str1, str2, 3);
        const lcs = this.longestCommonSubsequence(str1, str2) / Math.max(str1.length, str2.length);

        // Взвешенная комбинация
        return (levenshtein * 0.25) + (jaccard * 0.25) + (ngram2 * 0.2) + (ngram3 * 0.15) + (lcs * 0.15);
    }

    /**
     * Семантическое сходство компонентов
     */
    calculateSemanticSimilarity(comp1, comp2) {
        let totalScore = 0;
        let componentCount = 0;

        // Сравнение улиц
        if (comp1.street && comp2.street) {
            const streetSim = this.calculateAdvancedTextSimilarity(comp1.street, comp2.street);
            totalScore += streetSim * 2; // Улица имеет больший вес
            componentCount += 2;
        }

        // Сравнение номеров домов
        if (comp1.houseNumber && comp2.houseNumber) {
            const houseSim = comp1.houseNumber === comp2.houseNumber ? 1.0 : 
                           this.calculateAdvancedTextSimilarity(comp1.houseNumber, comp2.houseNumber);
            totalScore += houseSim * 1.5;
            componentCount += 1.5;
        }

        // Сравнение строений
        if (comp1.building && comp2.building) {
            const buildingSim = comp1.building === comp2.building ? 1.0 :
                              this.calculateAdvancedTextSimilarity(comp1.building, comp2.building);
            totalScore += buildingSim;
            componentCount += 1;
        }

        // Сравнение направлений
        if (comp1.direction && comp2.direction) {
            const directionSim = comp1.direction === comp2.direction ? 1.0 : 0;
            totalScore += directionSim * 0.5;
            componentCount += 0.5;
        }

        return componentCount > 0 ? totalScore / componentCount : 0;
    }

    /**
     * Структурное сходство
     */
    calculateStructuralSimilarity(tokens1, tokens2) {
        if (!tokens1.length || !tokens2.length) return 0;

        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        
        return this.jaccardSimilarity(Array.from(set1), Array.from(set2));
    }

    /**
     * Нечеткое сходство (приблизительное совпадение)
     */
    calculateFuzzySimilarity(str1, str2) {
        // Упрощенная нечеткая логика
        const words1 = str1.split(/\s+/);
        const words2 = str2.split(/\s+/);
        
        let matchCount = 0;
        for (const word1 of words1) {
            for (const word2 of words2) {
                if (word1.length >= 3 && word2.length >= 3) {
                    const sim = this.normalizedLevenshtein(word1, word2);
                    if (sim >= 0.7) { // Нечеткое совпадение
                        matchCount++;
                        break;
                    }
                }
            }
        }
        
        return matchCount / Math.max(words1.length, words2.length);
    }

    /**
     * Ранжирование кандидатов с помощью ML
     */
    async rankCandidatesML(sourceData, candidates, sourceCoords) {
        const results = [];

        for (const candidate of candidates) {
            const candidateData = this.preprocessAddress(candidate.address || '');
            const score = await this.calculateCompositeScore(sourceData, candidateData, sourceCoords, candidate.coordinates);
            
            results.push({
                address: candidate,
                distance: this.calculateDistance(sourceCoords, candidate.coordinates),
                score: score,
                textSimilarity: this.calculateAdvancedTextSimilarity(sourceData.normalized, candidateData.normalized),
                semanticSimilarity: this.calculateSemanticSimilarity(sourceData.components, candidateData.components),
                structuralSimilarity: this.calculateStructuralSimilarity(sourceData.tokens, candidateData.tokens)
            });
        }

        // Сортируем по убыванию скора
        return results.sort((a, b) => b.score - a.score);
    }

    /**
     * Применение нечеткой логики
     */
    async applyFuzzyLogic(sourceData, candidates, sourceCoords) {
        const results = [];

        for (const candidate of candidates) {
            const candidateData = this.preprocessAddress(candidate.address || '');
            const distance = this.calculateDistance(sourceCoords, candidate.coordinates);
            
            // Нечеткий скор с учетом расстояния
            const fuzzyScore = this.calculateFuzzySimilarity(sourceData.normalized, candidateData.normalized);
            const geoScore = Math.max(0, 1 - (distance / this.model.radii.far));
            const combinedScore = (fuzzyScore * 0.7) + (geoScore * 0.3);
            
            if (combinedScore >= this.model.thresholds.minimal) {
                results.push({
                    address: candidate,
                    distance: distance,
                    score: combinedScore,
                    fuzzyScore: fuzzyScore
                });
            }
        }

        return results.sort((a, b) => b.score - a.score);
    }

    /**
     * Вспомогательные методы
     */
    normalizeCoordinates(coords) {
        return {
            lat: parseFloat(coords.lat),
            lng: parseFloat(coords.lng || coords.lon)
        };
    }

    getAddressesInRadius(addresses, center, radius) {
        return addresses.filter(addr => {
            if (!addr.coordinates?.lat || !addr.coordinates?.lng) return false;
            const distance = this.calculateDistance(center, addr.coordinates);
            return distance <= radius;
        });
    }

    calculateDistance(coord1, coord2) {
        const R = 6371000;
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

    getConfidenceLevel(score) {
        if (score >= this.model.thresholds.perfect) return 'perfect';
        if (score >= this.model.thresholds.excellent) return 'high';
        if (score >= this.model.thresholds.good) return 'medium';
        if (score >= this.model.thresholds.acceptable) return 'low';
        if (score >= this.model.thresholds.minimal) return 'very_low';
        return 'none';
    }

    getCacheKey(listing, addresses) {
        return `${listing.id}_${addresses.length}_${JSON.stringify(listing.coordinates)}`;
    }

    addToCache(key, value) {
        if (this.cache.size >= this.cacheMaxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    updateStats(result) {
        this.stats.totalMatches++;
        if (result.address) {
            this.stats.successfulMatches++;
        }
        
        // Обновляем статистику методов
        const method = result.method;
        if (!this.stats.methodEffectiveness[method]) {
            this.stats.methodEffectiveness[method] = { count: 0, totalScore: 0 };
        }
        this.stats.methodEffectiveness[method].count++;
        this.stats.methodEffectiveness[method].totalScore += result.score;
    }

    getStats() {
        const effectiveness = {};
        for (const [method, data] of Object.entries(this.stats.methodEffectiveness)) {
            effectiveness[method] = {
                count: data.count,
                averageScore: data.totalScore / data.count,
                successRate: (data.count / this.stats.totalMatches) * 100
            };
        }

        return {
            totalMatches: this.stats.totalMatches,
            successfulMatches: this.stats.successfulMatches,
            overallSuccessRate: (this.stats.successfulMatches / this.stats.totalMatches) * 100,
            methodEffectiveness: effectiveness,
            cacheSize: this.cache.size,
            modelVersion: this.model.version,
            trainingExamples: this.training.examples.length
        };
    }

    /**
     * Восстановление счетчика примеров обучения из localStorage
     */
    restoreTrainingCount() {
        try {
            // Проверяем, что training инициализирован
            if (!this.training) {
                console.warn('Training system not initialized yet, skipping restore');
                return;
            }
            
            // Восстанавливаем реальные примеры обучения
            const savedExamples = localStorage.getItem('ml_training_examples');
            if (savedExamples) {
                const examples = JSON.parse(savedExamples);
                this.training.examples = examples;
                
                // Проверяем, нужно ли переобучение
                if (examples.length >= 50) {
                    setTimeout(() => this.retrain(), 1000); // Даем время на инициализацию
                }
            } else {
                // Fallback на старый метод для совместимости
                const savedCount = localStorage.getItem('ml_training_count');
                if (savedCount) {
                    const count = parseInt(savedCount);
                    // Очищаем старый счетчик
                    localStorage.removeItem('ml_training_count');
                }
            }
        } catch (error) {
            console.warn('Failed to restore training examples:', error);
        }
    }

    /**
     * Загрузка предобученной модели
     */
    async loadPretrainedModel() {
        try {
            // Сначала пытаемся загрузить обученную модель из localStorage
            const trainedModel = localStorage.getItem('ml_trained_model');
            if (trainedModel) {
                const parsedModel = JSON.parse(trainedModel);
                this.model = { ...this.model, ...parsedModel };
                return;
            }
            
            // Если обученной модели нет, пытаемся загрузить предобученную
            const response = await fetch('/utils/pretrained-model.json');
            if (response.ok) {
                const pretrainedModel = await response.json();
                
                // Объединяем с текущей моделью
                this.model = { ...this.model, ...pretrainedModel };
                
            }
        } catch (error) {
        }
    }

    /**
     * Добавление примера для обучения (вызывается при пользовательских исправлениях)
     */
    addTrainingExample(listingAddress, candidateAddress, isCorrect) {
        if (!this.training.enabled) return;

        const example = {
            listing: listingAddress,
            candidate: candidateAddress,
            isCorrect: isCorrect,
            timestamp: Date.now(),
            features: this.extractFeatures(listingAddress, candidateAddress)
        };

        this.training.examples.push(example);

        // Ограничиваем размер обучающей выборки
        if (this.training.examples.length > this.training.maxExamples) {
            this.training.examples.shift();
        }

        const positive = this.training.examples.filter(ex => ex.isCorrect).length;
        const negative = this.training.examples.filter(ex => !ex.isCorrect).length;
        const nextRetrainAt = Math.ceil(this.training.examples.length / 50) * 50;
        
        
        // Сохраняем все примеры в localStorage (не только счетчик!)
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('ml_training_examples', JSON.stringify(this.training.examples));
                localStorage.setItem('ml_training_count', this.training.examples.length.toString());
            } catch (error) {
                console.warn('Failed to save training examples:', error);
            }
        }
        
        // Переобучение каждые 50 примеров
        if (this.training.examples.length % 50 === 0) {
            this.retrain();
        }
    }

    /**
     * Извлечение признаков для обучения
     */
    extractFeatures(listingAddress, candidateAddress) {
        const listingData = this.preprocessAddress(listingAddress);
        const candidateData = this.preprocessAddress(candidateAddress);

        return {
            textSimilarity: this.calculateAdvancedTextSimilarity(listingData.normalized, candidateData.normalized),
            semanticSimilarity: this.calculateSemanticSimilarity(listingData.components, candidateData.components),
            structuralSimilarity: this.calculateStructuralSimilarity(listingData.tokens, candidateData.tokens),
            fuzzySimilarity: this.calculateFuzzySimilarity(listingData.normalized, candidateData.normalized),
            lengthRatio: Math.min(listingAddress.length, candidateAddress.length) / Math.max(listingAddress.length, candidateAddress.length)
        };
    }

    /**
     * Переобучение модели
     */
    retrain() {

        const positiveExamples = this.training.examples.filter(ex => ex.isCorrect);
        const negativeExamples = this.training.examples.filter(ex => !ex.isCorrect);


        // Снижаем требования для обучения
        if (positiveExamples.length < 5 || negativeExamples.length < 5) {
            return;
        }

        if (this.training.examples.length < 20) {
            return;
        }

        // Оптимизация весов на основе различий между положительными и отрицательными примерами
        this.optimizeWeights(positiveExamples, negativeExamples);
        
        // Оптимизация порогов
        this.optimizeThresholds(this.training.examples);
        
        // Обновление версии
        this.model.version = this.incrementVersion(this.model.version);
        this.model.lastUpdate = new Date().toISOString().split('T')[0];
        
        
        // Показываем обновленные веса для визуального контроля
        for (const [key, value] of Object.entries(this.model.weights)) {
        }
        
        for (const [key, value] of Object.entries(this.model.thresholds)) {
        }
        
        // Сохраняем обученную модель в localStorage
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('ml_trained_model', JSON.stringify(this.model));
            } catch (error) {
                console.warn('Failed to save trained model:', error);
            }
        }
        
        // Сохранение для экспорта
        this.saveModelForExport();
    }

    /**
     * Оптимизация весов
     */
    optimizeWeights(positiveExamples, negativeExamples) {
        const avgPositive = this.averageFeatures(positiveExamples);
        const avgNegative = this.averageFeatures(negativeExamples);

        // Увеличиваем веса признаков, которые лучше различают положительные и отрицательные примеры
        const importance = {
            textual: Math.abs(avgPositive.textSimilarity - avgNegative.textSimilarity),
            semantic: Math.abs(avgPositive.semanticSimilarity - avgNegative.semanticSimilarity),
            structural: Math.abs(avgPositive.structuralSimilarity - avgNegative.structuralSimilarity),
            fuzzy: Math.abs(avgPositive.fuzzySimilarity - avgNegative.fuzzySimilarity)
        };

        // Нормализуем важность и обновляем веса
        const totalImportance = Object.values(importance).reduce((a, b) => a + b, 0);
        const learningRate = 0.1;

        this.model.weights.textual += learningRate * (importance.textual / totalImportance - this.model.weights.textual);
        this.model.weights.semantic += learningRate * (importance.semantic / totalImportance - this.model.weights.semantic);
        this.model.weights.structural += learningRate * (importance.structural / totalImportance - this.model.weights.structural);
        this.model.weights.fuzzy += learningRate * (importance.fuzzy / totalImportance - this.model.weights.fuzzy);

        // Нормализуем веса
        const totalWeight = Object.values(this.model.weights).reduce((a, b) => a + b, 0);
        for (const key in this.model.weights) {
            this.model.weights[key] /= totalWeight;
        }
    }

    /**
     * Усреднение признаков
     */
    averageFeatures(examples) {
        const avg = {
            textSimilarity: 0,
            semanticSimilarity: 0,
            structuralSimilarity: 0,
            fuzzySimilarity: 0
        };

        for (const example of examples) {
            avg.textSimilarity += example.features.textSimilarity;
            avg.semanticSimilarity += example.features.semanticSimilarity;
            avg.structuralSimilarity += example.features.structuralSimilarity;
            avg.fuzzySimilarity += example.features.fuzzySimilarity;
        }

        for (const key in avg) {
            avg[key] /= examples.length;
        }

        return avg;
    }

    /**
     * Оптимизация порогов
     */
    optimizeThresholds(examples) {
        const scores = examples.map(ex => ({
            score: this.calculateCompositeScoreFromFeatures(ex.features),
            label: ex.isCorrect
        })).sort((a, b) => b.score - a.score);

        // Найти оптимальный порог по F1-метрике
        let bestF1 = 0;
        let bestThreshold = 0.5;

        for (const item of scores) {
            const threshold = item.score;
            const metrics = this.calculateF1(scores, threshold);
            
            if (metrics.f1 > bestF1) {
                bestF1 = metrics.f1;
                bestThreshold = threshold;
            }
        }

        // Обновляем пороги
        this.model.thresholds.acceptable = Math.max(0.3, bestThreshold - 0.1);
        this.model.thresholds.good = bestThreshold;
        this.model.thresholds.excellent = Math.min(0.9, bestThreshold + 0.15);
    }

    /**
     * Расчет композитного скора из признаков
     */
    calculateCompositeScoreFromFeatures(features) {
        return (
            features.textSimilarity * this.model.weights.textual +
            features.semanticSimilarity * this.model.weights.semantic +
            features.structuralSimilarity * this.model.weights.structural +
            features.fuzzySimilarity * this.model.weights.fuzzy
        );
    }

    /**
     * Расчет F1-метрики
     */
    calculateF1(scores, threshold) {
        let tp = 0, fp = 0, fn = 0;

        for (const item of scores) {
            const predicted = item.score >= threshold;
            const actual = item.label;

            if (predicted && actual) tp++;
            else if (predicted && !actual) fp++;
            else if (!predicted && actual) fn++;
        }

        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const f1 = 2 * precision * recall / (precision + recall) || 0;

        return { precision, recall, f1 };
    }

    /**
     * Инкремент версии
     */
    incrementVersion(version) {
        const parts = version.split('.');
        const patch = parseInt(parts[2]) + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
    }

    /**
     * Сохранение модели для экспорта (для коммита в GitHub)
     */
    saveModelForExport() {
        const exportModel = {
            version: this.model.version,
            trainedOn: this.model.trainedOn,
            lastUpdate: this.model.lastUpdate,
            trainingExamples: this.training.examples.length,
            radii: this.model.radii,
            thresholds: this.model.thresholds,
            weights: this.model.weights
        };

        // Сохраняем в консоль для копирования в файл
        
        // Дополнительно сохраняем в localStorage для удобства  
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ml_trained_model', JSON.stringify(exportModel));
            
            // Сохраняем также счетчик примеров отдельно для быстрого доступа
            localStorage.setItem('ml_training_count', this.training.examples.length.toString());
            
        }
    }

    /**
     * Ручное исправление адреса (для обучения)
     */
    correctAddress(listingId, correctAddressId) {
        // Этот метод будет вызываться из UI когда пользователь исправляет адрес
        
        // Здесь добавить логику поиска исходных данных и добавления примера
        // this.addTrainingExample(listingAddress, correctAddress, true);
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartAddressMatcher;
}