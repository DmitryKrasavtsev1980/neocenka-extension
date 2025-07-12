/**
 * Система автоматического поиска и объединения дублей объявлений
 */

/**
 * Анализатор текстового сходства объявлений
 */
class TextSimilarityAnalyzer {
    constructor() {
        this.stopWords = new Set([
            'в', 'на', 'с', 'по', 'из', 'от', 'до', 'для', 'при', 'без', 'под', 'над', 'через',
            'о', 'об', 'про', 'за', 'к', 'у', 'и', 'или', 'но', 'да', 'не', 'ни', 'же', 'ли',
            'квартира', 'комната', 'дом', 'продам', 'продается', 'продаю', 'срочно', 'недорого',
            'цена', 'стоимость', 'рублей', 'руб', 'тысяч', 'млн', 'миллион', 'тыс'
        ]);
    }

    /**
     * Нормализация текста для анализа
     */
    normalizeText(text) {
        if (!text) return '';
        
        return text
            .toLowerCase()
            .replace(/[^\w\sа-яё]/gi, ' ')
            .replace(/\d+/g, 'NUM')
            .split(/\s+/)
            .filter(word => word.length > 2 && !this.stopWords.has(word))
            .join(' ')
            .trim();
    }

    /**
     * Вычисление TF-IDF векторов для коллекции текстов
     */
    calculateTfIdf(documents) {
        const vocabulary = new Set();
        const normalizedDocs = documents.map(doc => {
            const normalized = this.normalizeText(doc);
            const words = normalized.split(/\s+/);
            words.forEach(word => vocabulary.add(word));
            return { original: doc, normalized, words };
        });

        const vocabArray = Array.from(vocabulary);
        const docCount = normalizedDocs.length;

        // Подсчет IDF
        const idf = {};
        vocabArray.forEach(word => {
            const docsWithWord = normalizedDocs.filter(doc => doc.words.includes(word)).length;
            idf[word] = Math.log(docCount / (docsWithWord + 1));
        });

        // Вычисление TF-IDF векторов
        const vectors = normalizedDocs.map(doc => {
            const termFreq = {};
            doc.words.forEach(word => {
                termFreq[word] = (termFreq[word] || 0) + 1;
            });

            const vector = {};
            vocabArray.forEach(word => {
                const tf = (termFreq[word] || 0) / doc.words.length;
                vector[word] = tf * idf[word];
            });

            return { ...doc, vector };
        });

        return { vectors, vocabulary: vocabArray };
    }

    /**
     * Косинусное сходство между векторами
     */
    cosineSimilarity(vector1, vector2, vocabulary) {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        vocabulary.forEach(word => {
            const v1 = vector1[word] || 0;
            const v2 = vector2[word] || 0;
            
            dotProduct += v1 * v2;
            norm1 += v1 * v1;
            norm2 += v2 * v2;
        });

        if (norm1 === 0 || norm2 === 0) return 0;
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Сравнение двух текстов
     */
    compareTwoTexts(text1, text2) {
        if (!text1 || !text2) return 0;

        const { vectors, vocabulary } = this.calculateTfIdf([text1, text2]);
        
        if (vectors.length !== 2) return 0;

        return this.cosineSimilarity(vectors[0].vector, vectors[1].vector, vocabulary);
    }

    /**
     * Jaccard сходство для сравнения множеств слов
     */
    jaccardSimilarity(text1, text2) {
        const words1 = new Set(this.normalizeText(text1).split(/\s+/));
        const words2 = new Set(this.normalizeText(text2).split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Комбинированный анализ текстового сходства
     */
    analyze(text1, text2) {
        const cosineSim = this.compareTwoTexts(text1, text2);
        const jaccardSim = this.jaccardSimilarity(text1, text2);
        
        // Комбинируем результаты с весами
        const combinedScore = (cosineSim * 0.7) + (jaccardSim * 0.3);
        
        return {
            cosine: cosineSim,
            jaccard: jaccardSim,
            combined: combinedScore,
            confidence: combinedScore > 0.8 ? 'high' : 
                       combinedScore > 0.6 ? 'medium' : 'low'
        };
    }
}

/**
 * Анализатор сходства изображений
 */
class ImageSimilarityAnalyzer {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.hashSize = 8; // Размер для перцептивного хеша
    }

    /**
     * Загрузка изображения через Chrome API для обхода CORS
     */
    async loadImage(url) {
        try {
            // Пытаемся загрузить через fetch с помощью Chrome API
            const response = await chrome.runtime.sendMessage({
                action: 'fetchImage',
                url: url
            });

            if (!response.success) {
                throw new Error(response.error || 'Ошибка загрузки изображения');
            }

            // Создаем blob URL из полученных данных
            const contentType = response.contentType || 'image/jpeg';
            const blob = new Blob([new Uint8Array(response.data)], { type: contentType });
            const blobUrl = URL.createObjectURL(blob);

            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    URL.revokeObjectURL(blobUrl); // Очищаем blob URL
                    resolve(img);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(blobUrl);
                    reject(new Error('Ошибка создания изображения'));
                };
                img.src = blobUrl;
            });

        } catch (error) {
            console.warn(`Не удалось загрузить изображение ${url}:`, error);
            // Возвращаем фиктивное изображение для продолжения анализа
            return this.createDummyImage();
        }
    }

    /**
     * Создание фиктивного изображения для случаев ошибок загрузки
     */
    createDummyImage() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 1, 1);
        
        const img = new Image();
        img.src = canvas.toDataURL();
        return img;
    }

    /**
     * Изменение размера изображения
     */
    resizeImage(img, width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.drawImage(img, 0, 0, width, height);
        return this.ctx.getImageData(0, 0, width, height);
    }

    /**
     * Перцептивный хеш изображения (pHash)
     */
    calculatePerceptualHash(img) {
        const imageData = this.resizeImage(img, this.hashSize, this.hashSize);
        const data = imageData.data;
        
        // Конвертируем в градации серого и вычисляем среднее
        const grayPixels = [];
        let total = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            grayPixels.push(gray);
            total += gray;
        }
        
        const average = total / grayPixels.length;
        
        // Создаем бинарный хеш
        let hash = '';
        for (let i = 0; i < grayPixels.length; i++) {
            hash += grayPixels[i] > average ? '1' : '0';
        }
        
        return hash;
    }

    /**
     * Хэммингово расстояние между хешами
     */
    hammingDistance(hash1, hash2) {
        if (hash1.length !== hash2.length) return hash1.length;
        
        let distance = 0;
        for (let i = 0; i < hash1.length; i++) {
            if (hash1[i] !== hash2[i]) distance++;
        }
        return distance;
    }

    /**
     * Вычисление цветовой гистограммы
     */
    calculateColorHistogram(img, bins = 16) {
        const imageData = this.resizeImage(img, 64, 64);
        const data = imageData.data;
        
        const histogram = {
            red: new Array(bins).fill(0),
            green: new Array(bins).fill(0),
            blue: new Array(bins).fill(0)
        };
        
        const binSize = 256 / bins;
        
        for (let i = 0; i < data.length; i += 4) {
            const rBin = Math.min(Math.floor(data[i] / binSize), bins - 1);
            const gBin = Math.min(Math.floor(data[i + 1] / binSize), bins - 1);
            const bBin = Math.min(Math.floor(data[i + 2] / binSize), bins - 1);
            
            histogram.red[rBin]++;
            histogram.green[gBin]++;
            histogram.blue[bBin]++;
        }
        
        return histogram;
    }

    /**
     * Сравнение гистограмм
     */
    compareHistograms(hist1, hist2) {
        const channels = ['red', 'green', 'blue'];
        let totalSimilarity = 0;
        
        channels.forEach(channel => {
            let intersection = 0;
            let union = 0;
            
            for (let i = 0; i < hist1[channel].length; i++) {
                intersection += Math.min(hist1[channel][i], hist2[channel][i]);
                union += Math.max(hist1[channel][i], hist2[channel][i]);
            }
            
            totalSimilarity += union === 0 ? 0 : intersection / union;
        });
        
        return totalSimilarity / channels.length;
    }

    /**
     * Сравнение двух изображений
     */
    async compareImages(url1, url2) {
        try {
            const [img1, img2] = await Promise.all([
                this.loadImage(url1),
                this.loadImage(url2)
            ]);

            // Перцептивный хеш
            const hash1 = this.calculatePerceptualHash(img1);
            const hash2 = this.calculatePerceptualHash(img2);
            const hammingDist = this.hammingDistance(hash1, hash2);
            const hashSimilarity = 1 - (hammingDist / hash1.length);

            // Цветовая гистограмма
            const hist1 = this.calculateColorHistogram(img1);
            const hist2 = this.calculateColorHistogram(img2);
            const histSimilarity = this.compareHistograms(hist1, hist2);

            // Комбинированный результат
            const combinedScore = (hashSimilarity * 0.6) + (histSimilarity * 0.4);

            return {
                hash: hashSimilarity,
                histogram: histSimilarity,
                combined: combinedScore,
                confidence: combinedScore > 0.9 ? 'high' :
                           combinedScore > 0.7 ? 'medium' : 'low'
            };

        } catch (error) {
            console.warn('Ошибка сравнения изображений:', error);
            return {
                hash: 0,
                histogram: 0,
                combined: 0,
                confidence: 'error'
            };
        }
    }

    /**
     * Сравнение массивов изображений
     */
    async compareImageArrays(images1, images2) {
        if (!images1 || !images2 || images1.length === 0 || images2.length === 0) {
            return { combined: 0, confidence: 'no_images' };
        }

        const comparisons = [];
        
        // Сравниваем все изображения между собой
        for (const img1 of images1) {
            for (const img2 of images2) {
                const result = await this.compareImages(img1, img2);
                comparisons.push(result.combined);
            }
        }

        if (comparisons.length === 0) {
            return { combined: 0, confidence: 'no_comparisons' };
        }

        // Берем максимальное сходство
        const maxSimilarity = Math.max(...comparisons);
        
        return {
            combined: maxSimilarity,
            confidence: maxSimilarity > 0.9 ? 'high' :
                       maxSimilarity > 0.7 ? 'medium' : 'low',
            comparisons: comparisons.length
        };
    }
}

/**
 * Анализатор контактных данных
 */
class ContactAnalyzer {
    constructor() {
        this.phoneRegex = /[\+7|8]?[\s\-\(\)]?[\d\s\-\(\)]{10,}/g;
        this.emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    }

    /**
     * Извлечение номеров телефонов
     */
    extractPhones(text) {
        if (!text) return [];
        
        const phones = (text.match(this.phoneRegex) || [])
            .map(phone => this.normalizePhone(phone))
            .filter(phone => phone.length >= 10);
            
        return [...new Set(phones)]; // Убираем дубли
    }

    /**
     * Извлечение email адресов
     */
    extractEmails(text) {
        if (!text) return [];
        
        const emails = (text.match(this.emailRegex) || [])
            .map(email => email.toLowerCase());
            
        return [...new Set(emails)]; // Убираем дубли
    }

    /**
     * Нормализация номера телефона
     */
    normalizePhone(phone) {
        return phone
            .replace(/[\s\-\(\)]/g, '')
            .replace(/^\+?7/, '8');
    }

    /**
     * Анализ контактных данных объявления
     */
    analyzeContacts(listing) {
        const text = `${listing.description || ''} ${listing.seller_name || ''} ${listing.phone || ''}`;
        
        return {
            phones: this.extractPhones(text),
            emails: this.extractEmails(text),
            seller_name: listing.seller_name || null
        };
    }

    /**
     * Сравнение контактных данных
     */
    compareContacts(contacts1, contacts2) {
        let phoneMatch = 0;
        let emailMatch = 0;
        let nameMatch = 0;

        // Сравнение телефонов
        if (contacts1.phones.length > 0 && contacts2.phones.length > 0) {
            const phoneIntersection = contacts1.phones.filter(phone => 
                contacts2.phones.includes(phone)
            );
            phoneMatch = phoneIntersection.length > 0 ? 1 : 0;
        }

        // Сравнение email
        if (contacts1.emails.length > 0 && contacts2.emails.length > 0) {
            const emailIntersection = contacts1.emails.filter(email => 
                contacts2.emails.includes(email)
            );
            emailMatch = emailIntersection.length > 0 ? 1 : 0;
        }

        // Сравнение имен продавцов
        if (contacts1.seller_name && contacts2.seller_name) {
            const name1 = contacts1.seller_name.toLowerCase().trim();
            const name2 = contacts2.seller_name.toLowerCase().trim();
            nameMatch = name1 === name2 ? 1 : 0;
        }

        // Комбинированный скор
        const scores = [];
        if (phoneMatch > 0) scores.push(phoneMatch);
        if (emailMatch > 0) scores.push(emailMatch);
        if (nameMatch > 0) scores.push(nameMatch);

        const combinedScore = scores.length > 0 ? Math.max(...scores) : 0;

        return {
            phone: phoneMatch,
            email: emailMatch,
            name: nameMatch,
            combined: combinedScore,
            confidence: combinedScore === 1 ? 'high' : 'low'
        };
    }
}

/**
 * Калькулятор итогового скора схожести
 */
class ScoreCalculator {
    constructor() {
        this.weights = {
            text: 0.6,      // Вес текстового сходства (увеличен из-за отключения изображений)
            contacts: 0.4,  // Вес контактных данных (увеличен)
            images: 0.0     // Вес сходства изображений (отключен из-за CORS)
        };

        this.thresholds = {
            high: 0.75,     // Высокая уверенность - автоматическое объединение (снижен)
            medium: 0.55,   // Средняя уверенность - пометить для проверки (снижен)
            low: 0.35       // Минимальный порог для считания дублем (снижен)
        };
    }

    /**
     * Расчет итогового скора
     */
    calculateScore(textResult, contactResult, imageResult) {
        const textScore = textResult?.combined || 0;
        const contactScore = contactResult?.combined || 0;
        const imageScore = imageResult?.combined || 0;

        const finalScore = (textScore * this.weights.text) +
                          (contactScore * this.weights.contacts) +
                          (imageScore * this.weights.images);

        return {
            text: textScore,
            contacts: contactScore,
            images: imageScore,
            final: finalScore,
            confidence: this.getConfidenceLevel(finalScore),
            isDuplicate: finalScore >= this.thresholds.low
        };
    }

    /**
     * Определение уровня уверенности
     */
    getConfidenceLevel(score) {
        if (score >= this.thresholds.high) return 'high';
        if (score >= this.thresholds.medium) return 'medium';
        if (score >= this.thresholds.low) return 'low';
        return 'very_low';
    }
}

/**
 * Основной класс для поиска дублей
 */
class DuplicateDetector {
    constructor() {
        this.textAnalyzer = new TextSimilarityAnalyzer();
        this.imageAnalyzer = new ImageSimilarityAnalyzer();
        this.contactAnalyzer = new ContactAnalyzer();
        this.scoreCalculator = new ScoreCalculator();
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

        this.initialized = true;
        console.log('🔍 DuplicateDetector инициализирован');
    }

    /**
     * Проверка совместимости объявлений по базовым характеристикам
     */
    areListingsCompatible(listing1, listing2) {
        // Проверяем тип недвижимости
        if (listing1.property_type !== listing2.property_type) {
            return false;
        }

        // Проверяем этаж
        if (listing1.floor && listing2.floor && listing1.floor !== listing2.floor) {
            return false;
        }

        // Проверяем общую площадь (±5 кв.м)
        if (listing1.area_total && listing2.area_total) {
            const areaDiff = Math.abs(listing1.area_total - listing2.area_total);
            if (areaDiff > 5) {
                return false;
            }
        }

        return true;
    }

    /**
     * Сравнение двух объявлений
     */
    async compareListings(listing1, listing2) {
        if (!this.areListingsCompatible(listing1, listing2)) {
            return {
                compatible: false,
                score: { final: 0, confidence: 'incompatible' }
            };
        }

        // Анализ текстового сходства
        const textResult = this.textAnalyzer.analyze(
            listing1.description || '',
            listing2.description || ''
        );

        // Анализ контактных данных
        const contacts1 = this.contactAnalyzer.analyzeContacts(listing1);
        const contacts2 = this.contactAnalyzer.analyzeContacts(listing2);
        const contactResult = this.contactAnalyzer.compareContacts(contacts1, contacts2);

        // Анализ изображений (временно отключен из-за CORS)
        const imageResult = {
            combined: 0,
            confidence: 'disabled',
            comparisons: 0
        };

        // Расчет итогового скора
        const finalScore = this.scoreCalculator.calculateScore(
            textResult,
            contactResult,
            imageResult
        );

        return {
            compatible: true,
            score: finalScore,
            details: {
                text: textResult,
                contacts: contactResult,
                images: imageResult
            }
        };
    }

    /**
     * Поиск дублей для одного объявления
     */
    async findDuplicatesForListing(targetListing, candidateListings) {
        const duplicates = [];

        for (const candidate of candidateListings) {
            if (candidate.id === targetListing.id) continue;

            const comparison = await this.compareListings(targetListing, candidate);
            
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
     * Группировка объявлений по адресам
     */
    async groupListingsByAddress(listings) {
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

    /**
     * Основной процесс поиска и объединения дублей
     */
    async processDuplicates(currentArea, progressCallback = null) {
        if (!this.initialized) await this.init();

        try {
            console.log('🚀 Начинаем поиск дублей...');

            if (!currentArea || !currentArea.polygon || currentArea.polygon.length < 3) {
                throw new Error('Не передана область или область не содержит валидный полигон');
            }

            // Получаем все объявления
            const allListings = await this.databaseManager.getAll('listings');
            
            // Фильтруем объявления по вхождению в полигон области и статусу
            const listingsInArea = allListings.filter(listing => {
                // Проверяем наличие координат
                if (!listing.coordinates || !listing.coordinates.lat || !(listing.coordinates.lng || listing.coordinates.lon)) {
                    return false;
                }
                
                const lat = listing.coordinates.lat;
                const lng = listing.coordinates.lng || listing.coordinates.lon;
                
                // Проверяем вхождение в полигон области
                return currentArea.containsPoint(lat, lng);
            });

            // Из объявлений в области выбираем только те, что нужно обработать на дубли
            const targetListings = listingsInArea.filter(listing => 
                listing.processing_status === 'duplicate_check_needed'
            );

            console.log(`📋 Всего объявлений в базе: ${allListings.length}`);
            console.log(`🗺️ Объявлений в области: ${listingsInArea.length}`);
            console.log(`🎯 Объявлений для обработки на дубли: ${targetListings.length}`);

            // Дополнительная отладочная информация по статусам в области
            const statusCounts = {};
            listingsInArea.forEach(listing => {
                const status = listing.processing_status || 'undefined';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            
            console.log(`📈 Распределение по статусам в области:`, statusCounts);

            if (targetListings.length === 0) {
                console.log('📭 Нет объявлений для обработки на дубли в области');
                return { processed: 0, merged: 0, groups: 0, errors: 0 };
            }

            console.log(`📊 Найдено ${targetListings.length} объявлений для обработки`);

            // Группируем по адресам
            const addressGroups = await this.groupListingsByAddress(targetListings);
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
                if (listings.length < 2) {
                    // Если в группе только одно объявление, создаем объект из одного объявления
                    try {
                        console.log(`🏠 Создаем объект из единственного объявления в адресе ${addressId}`);
                        await window.realEstateObjectManager.mergeIntoObject(
                            [{ type: 'listing', id: listings[0].id }], 
                            addressId
                        );
                        totalProcessed++;
                        results.merged++;
                        console.log(`✅ Создан объект из единственного объявления ${listings[0].id} в адресе ${addressId}`);
                    } catch (error) {
                        console.error(`❌ Ошибка создания объекта из единственного объявления ${listings[0].id}:`, error);
                        results.errors++;
                    }
                    continue;
                }

                console.log(`🏠 Обрабатываем адрес ${addressId}: ${listings.length} объявлений`);

                // Сортируем по дате создания (самые ранние первыми)
                listings.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                const processed = new Set();

                for (let i = 0; i < listings.length; i++) {
                    if (processed.has(listings[i].id)) continue;

                    const targetListing = listings[i];
                    const candidates = listings.slice(i + 1).filter(l => !processed.has(l.id));

                    if (candidates.length === 0) {
                        // Объявление не имеет дублей, создаем объект из одного объявления
                        try {
                            console.log(`🏠 Создаем объект из объявления ${targetListing.id} - дублей не найдено`);
                            await window.realEstateObjectManager.mergeIntoObject(
                                [{ type: 'listing', id: targetListing.id }], 
                                addressId
                            );
                            processed.add(targetListing.id);
                            totalProcessed++;
                            results.merged++;
                            console.log(`✅ Создан объект из единственного объявления ${targetListing.id}`);
                        } catch (error) {
                            console.error(`❌ Ошибка создания объекта из объявления ${targetListing.id}:`, error);
                            results.errors++;
                        }
                        continue;
                    }

                    // Ищем дубли
                    const duplicates = await this.findDuplicatesForListing(targetListing, candidates);
                    
                    console.log(`🔍 Для объявления ${targetListing.id} найдено ${duplicates.length} потенциальных дублей`);
                    
                    if (duplicates.length > 0) {
                        // Выводим информацию о найденных дублях
                        duplicates.forEach(dup => {
                            console.log(`   - Объявление ${dup.listing.id}: скор ${dup.score.final.toFixed(3)}, уверенность ${dup.score.confidence}`);
                        });

                        // Объединяем найденные дубли с высокой уверенностью
                        const highConfidenceDuplicates = duplicates.filter(d => d.score.confidence === 'high');
                        
                        if (highConfidenceDuplicates.length > 0) {
                            const duplicateIds = highConfidenceDuplicates.map(d => d.listing.id);
                            const itemsToMerge = [
                                { type: 'listing', id: targetListing.id },
                                ...duplicateIds.map(id => ({ type: 'listing', id }))
                            ];

                            try {
                                console.log(`🔄 Объединяем ${itemsToMerge.length} объявлений в объект недвижимости...`);
                                await window.realEstateObjectManager.mergeIntoObject(
                                    itemsToMerge, 
                                    addressId
                                );

                                // RealEstateObjectManager автоматически обновляет статус объявлений на 'processed'
                                // Помечаем их как обработанные в нашем локальном множестве
                                [targetListing.id, ...duplicateIds].forEach(id => processed.add(id));
                                results.merged += itemsToMerge.length;
                                
                                console.log(`✅ Успешно объединено ${itemsToMerge.length} объявлений в объект`);
                            } catch (error) {
                                console.error('❌ Ошибка объединения:', error);
                                results.errors++;
                                
                                // Если объединение не удалось, НЕ помечаем как обработанное
                                // Оставляем статус 'duplicate_check_needed' для повторной попытки
                                console.log(`⚠️ Объявление ${targetListing.id} остается в статусе 'duplicate_check_needed' из-за ошибки объединения`);
                            }
                        } else {
                            // Есть дубли, но уверенность недостаточна для автоматического объединения
                            console.log(`⚠️ Найдены дубли для объявления ${targetListing.id}, но уверенность недостаточна для автоматического объединения`);
                            console.log(`📋 Объявление ${targetListing.id} остается в статусе 'duplicate_check_needed' для ручной проверки`);
                            // НЕ помечаем как обработанное - требует ручной проверки
                        }
                    } else {
                        // Дубли не найдены, создаем объект из одного объявления
                        try {
                            console.log(`🏠 Создаем объект из объявления ${targetListing.id} - дублей не найдено`);
                            await window.realEstateObjectManager.mergeIntoObject(
                                [{ type: 'listing', id: targetListing.id }], 
                                addressId
                            );
                            processed.add(targetListing.id);
                            results.merged++;
                            console.log(`✅ Создан объект из единственного объявления ${targetListing.id}`);
                        } catch (error) {
                            console.error(`❌ Ошибка создания объекта из объявления ${targetListing.id}:`, error);
                            results.errors++;
                        }
                    }

                    totalProcessed++;

                    // Вызываем callback прогресса
                    if (progressCallback) {
                        progressCallback({
                            current: totalProcessed,
                            total: totalListings,
                            percent: Math.round((totalProcessed / totalListings) * 100)
                        });
                    }
                }

                results.groups++;
            }

            results.processed = totalProcessed;

            console.log('🎯 Обработка дублей завершена:', results);
            return results;

        } catch (error) {
            console.error('❌ Ошибка обработки дублей:', error);
            throw error;
        }
    }
}

// Создаем глобальный экземпляр
window.duplicateDetector = new DuplicateDetector();