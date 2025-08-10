/**
 * Алгоритм сопоставления адресов объявлений с базой адресов
 * Использует многоуровневый подход с геопозиционированием и текстовым анализом
 */

class AddressMatcher {
    constructor(spatialIndex) {
        this.spatialIndex = spatialIndex;
        
        // Конфигурация алгоритма
        this.config = {
            // Радиусы поиска (в метрах)
            exactRadius: 30,        // Точное совпадение
            nearRadius: 100,        // Ближний поиск
            extendedRadius: 300,    // Расширенный поиск
            
            // Пороги для текстового сходства
            highSimilarity: 0.85,   // Высокое сходство
            mediumSimilarity: 0.65, // Среднее сходство
            lowSimilarity: 0.4,     // Минимальное сходство
            
            // Веса для композитного скора
            weights: {
                distance: 0.4,      // Вес расстояния
                textSimilarity: 0.6 // Вес текстового сходства
            }
        };
    }

    /**
     * Основной метод сопоставления адреса объявления с базой адресов
     * @param {Object} listing - Объявление с координатами и адресом
     * @param {Array} addresses - База адресов
     * @returns {Object} Результат сопоставления
     */
    async matchAddress(listing, addresses) {
        const listingCoords = {
            lat: listing.coordinates.lat,
            lng: listing.coordinates.lng || listing.coordinates.lon
        };
        
        const listingAddress = this.normalizeAddress(listing.address || '');
        
        
        // Этап 1: Точное географическое совпадение (30м)
        const exactMatches = this.findAddressesInRadius(addresses, listingCoords, this.config.exactRadius);
        if (exactMatches.length === 1) {
            return {
                address: exactMatches[0],
                confidence: 'high',
                method: 'exact_geo',
                distance: this.calculateDistance(listingCoords, exactMatches[0].coordinates),
                score: 1.0
            };
        }
        
        // Этап 2: Ближний поиск с текстовым анализом (100м)
        const nearMatches = this.findAddressesInRadius(addresses, listingCoords, this.config.nearRadius);
        if (nearMatches.length > 0) {
            const bestNearMatch = this.findBestTextMatch(listingAddress, nearMatches, listingCoords);
            if (bestNearMatch.textSimilarity >= this.config.highSimilarity) {
                return {
                    address: bestNearMatch.address,
                    confidence: 'high',
                    method: 'near_geo_text',
                    distance: bestNearMatch.distance,
                    textSimilarity: bestNearMatch.textSimilarity,
                    score: bestNearMatch.score
                };
            }
        }
        
        // Этап 3: Расширенный поиск с продвинутым текстовым анализом (300м)
        const extendedMatches = this.findAddressesInRadius(addresses, listingCoords, this.config.extendedRadius);
        if (extendedMatches.length > 0) {
            const bestExtendedMatch = this.findBestTextMatch(listingAddress, extendedMatches, listingCoords);
            if (bestExtendedMatch.textSimilarity >= this.config.mediumSimilarity) {
                return {
                    address: bestExtendedMatch.address,
                    confidence: bestExtendedMatch.textSimilarity >= this.config.highSimilarity ? 'medium' : 'low',
                    method: 'extended_geo_text',
                    distance: bestExtendedMatch.distance,
                    textSimilarity: bestExtendedMatch.textSimilarity,
                    score: bestExtendedMatch.score
                };
            }
        }
        
        // Этап 4: Глобальный текстовый поиск (без ограничения по расстоянию)
        const globalBestMatch = this.findBestTextMatch(listingAddress, addresses, listingCoords);
        if (globalBestMatch.textSimilarity >= this.config.lowSimilarity) {
            return {
                address: globalBestMatch.address,
                confidence: 'very_low',
                method: 'global_text',
                distance: globalBestMatch.distance,
                textSimilarity: globalBestMatch.textSimilarity,
                score: globalBestMatch.score
            };
        }
        
        // Адрес не найден
        return {
            address: null,
            confidence: 'none',
            method: 'no_match',
            distance: null,
            textSimilarity: 0,
            score: 0
        };
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
     * Поиск лучшего совпадения по тексту
     */
    findBestTextMatch(targetAddress, candidates, targetCoords) {
        let bestMatch = {
            address: null,
            textSimilarity: 0,
            distance: Infinity,
            score: 0
        };
        
        candidates.forEach(candidate => {
            const candidateAddress = this.normalizeAddress(candidate.address || '');
            const textSimilarity = this.calculateTextSimilarity(targetAddress, candidateAddress);
            const distance = this.calculateDistance(targetCoords, candidate.coordinates);
            
            // Композитный скор: комбинация текстового сходства и расстояния
            const normalizedDistance = Math.min(distance / this.config.extendedRadius, 1);
            const distanceScore = 1 - normalizedDistance;
            
            const score = (textSimilarity * this.config.weights.textSimilarity) + 
                         (distanceScore * this.config.weights.distance);
            
            if (score > bestMatch.score) {
                bestMatch = {
                    address: candidate,
                    textSimilarity: textSimilarity,
                    distance: distance,
                    score: score
                };
            }
        });
        
        return bestMatch;
    }

    /**
     * Нормализация адреса для сравнения
     */
    normalizeAddress(address) {
        return address
            .toLowerCase()
            .replace(/[^\w\s\dа-яё]/gi, ' ')  // Убираем спецсимволы
            .replace(/\s+/g, ' ')            // Множественные пробелы в один
            .replace(/\b(ул|улица|проспект|пр|д|дом|к|корпус|стр|строение)\b/g, '') // Убираем стоп-слова
            .trim();
    }

    /**
     * Расчет текстового сходства (комбинация алгоритмов)
     */
    calculateTextSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        // Алгоритм 1: Расстояние Левенштейна
        const levenshteinSim = 1 - (this.levenshteinDistance(str1, str2) / Math.max(str1.length, str2.length));
        
        // Алгоритм 2: Жаккара для токенов
        const tokens1 = new Set(str1.split(/\s+/));
        const tokens2 = new Set(str2.split(/\s+/));
        const jaccardSim = this.jaccardSimilarity(tokens1, tokens2);
        
        // Алгоритм 3: Общие n-граммы
        const ngramSim = this.ngramSimilarity(str1, str2, 2);
        
        // Комбинируем результаты
        return (levenshteinSim * 0.4) + (jaccardSim * 0.4) + (ngramSim * 0.2);
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
     * Расчет расстояния между координатами (формула Haversine)
     */
    calculateDistance(coords1, coords2) {
        const R = 6371000; // Радиус Земли в метрах
        const dLat = this.toRadians(coords2.lat - coords1.lat);
        const dLng = this.toRadians((coords2.lng || coords2.lon) - (coords1.lng || coords1.lon));
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(coords1.lat)) * Math.cos(this.toRadians(coords2.lat)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Конвертация градусов в радианы
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Массовое сопоставление всех объявлений
     */
    async processAllListings(listings, addresses) {
        const results = {
            processed: 0,
            matched: 0,
            highConfidence: 0,
            mediumConfidence: 0,
            lowConfidence: 0,
            noMatch: 0,
            errors: 0
        };


        for (let i = 0; i < listings.length; i++) {
            try {
                const listing = listings[i];
                const matchResult = await this.matchAddress(listing, addresses);
                
                results.processed++;
                
                if (matchResult.address) {
                    results.matched++;
                    
                    // Обновляем объявление в базе данных
                    listing.address_id = matchResult.address.id;
                    listing.address_match_confidence = matchResult.confidence;
                    listing.address_match_method = matchResult.method;
                    listing.address_match_score = matchResult.score;
                    listing.address_distance = matchResult.distance;
                    
                    await db.update('listings', listing);
                    
                    // Статистика по уровням доверия
                    switch (matchResult.confidence) {
                        case 'high':
                            results.highConfidence++;
                            break;
                        case 'medium':
                            results.mediumConfidence++;
                            break;
                        case 'low':
                        case 'very_low':
                            results.lowConfidence++;
                            break;
                    }
                    
                } else {
                    results.noMatch++;
                }
                
                // Прогресс каждые 10 объявлений
                if ((i + 1) % 10 === 0) {
                }
                
            } catch (error) {
                results.errors++;
                console.error(`❌ Ошибка обработки объявления ${i}:`, error);
            }
        }

        return results;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AddressMatcher;
}

// Глобальная экспозиция для браузера
if (typeof window !== 'undefined') {
    window.AddressMatcher = AddressMatcher;
}