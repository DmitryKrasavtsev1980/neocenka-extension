/**
 * AIAreaAnalysisService - сервис для AI-анализа данных по области
 * Собирает всю статистику области и готовит данные для отправки в AI
 */

class AIAreaAnalysisService {
    constructor(diContainer) {
        this.diContainer = diContainer;
        this.db = null;
        this.universalAI = null;
        this.configService = null;
    }

    /**
     * Инициализация сервиса
     */
    async init() {
        this.db = window.db;
        this.universalAI = this.diContainer.get('UniversalAIService');
        this.configService = this.diContainer.get('ConfigService');
    }

    /**
     * Сбор всех данных области для анализа
     * @param {string|number} areaId - ID области (может быть строкой или числом)
     * @returns {object} - объект с полной статистикой области
     */
    async gatherAreaData(areaId) {
        try {
            // Проверяем валидность ID (может быть строкой или числом)
            if (!areaId || areaId.toString().trim() === '') {
                throw new Error(`Пустой ID области: ${areaId}`);
            }
            
            // Получаем основные данные области
            const area = await this.db.get('map_areas', areaId);
            
            if (!area) {
                throw new Error(`Область с ID ${areaId} не найдена в БД`);
            }

            const areaData = {
                area: {
                    id: area.id,
                    name: area.name,
                    hasPolygon: !!(area.polygon && area.polygon.length >= 3),
                    createdAt: area.created_at,
                    updatedAt: area.updated_at
                },
                addresses: await this.gatherAddressesData(areaId),
                listings: await this.gatherListingsData(areaId),
                objects: await this.gatherObjectsData(areaId),
                segments: await this.gatherSegmentsData(areaId),
                flipping: await this.gatherFlippingData(areaId),
                summary: {
                    readinessLevel: 0, // будем рассчитывать
                    criticalIssues: [],
                    recommendations: []
                }
            };

            // Рассчитываем уровень готовности области
            areaData.summary.readinessLevel = this.calculateReadinessLevel(areaData);
            
            return areaData;

        } catch (error) {
            console.error('❌ Ошибка сбора данных области:', error);
            throw error;
        }
    }

    /**
     * Сбор статистики по адресам в области
     */
    async gatherAddressesData(areaId) {
        try {
            const addresses = await this.db.getAddressesInMapArea(areaId);
            
            let wellFilledCount = 0;
            let totalFields = 0;
            let filledFields = 0;

            addresses.forEach(address => {
                // Подсчитываем заполненность ключевых полей адреса
                const keyFields = [
                    'address', 'coordinates', 'type', 'house_series', 
                    'ceiling_material', 'wall_material', 'floors_count', 
                    'build_year', 'entrances_count', 'living_spaces_count'
                ];
                
                let addressFilledFields = 0;
                keyFields.forEach(field => {
                    totalFields++;
                    if (address[field] !== null && address[field] !== undefined && address[field] !== '') {
                        filledFields++;
                        addressFilledFields++;
                    }
                });

                // Считаем адрес хорошо заполненным, если заполнено >= 70% полей
                if (addressFilledFields / keyFields.length >= 0.7) {
                    wellFilledCount++;
                }
            });

            return {
                total: addresses.length,
                wellFilled: wellFilledCount,
                averageCompleteness: totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0,
                needsAttention: addresses.length - wellFilledCount
            };

        } catch (error) {
            console.error('❌ Ошибка сбора данных адресов:', error);
            return { total: 0, wellFilled: 0, averageCompleteness: 0, needsAttention: 0 };
        }
    }

    /**
     * Сбор статистики по объявлениям в области
     */
    async gatherListingsData(areaId) {
        try {
            // Получаем все объявления в области через адреса
            const addresses = await this.db.getAddressesInMapArea(areaId);
            let allListings = [];
            
            for (const address of addresses) {
                const listings = await this.db.getListingsByAddress(address.id);
                allListings = allListings.concat(listings);
            }

            // Статистика по определению адресов
            const noAddress = allListings.filter(l => !l.address_id).length;
            const farAddress = allListings.filter(l => l.address_distance && l.address_distance > 50).length;
            
            // Статистика по актуализации (объявления старше 7 дней)
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const needsUpdate = allListings.filter(l => {
                const lastSeen = l.last_seen ? new Date(l.last_seen) : new Date(l.updated_at);
                return l.status === 'active' && lastSeen < weekAgo;
            }).length;

            // Статистика по обработке на дубли
            const needsDuplicateCheck = allListings.filter(l => 
                l.processing_status === 'duplicate_check_needed'
            ).length;

            return {
                total: allListings.length,
                active: allListings.filter(l => l.status === 'active').length,
                archived: allListings.filter(l => l.status === 'archived').length,
                addressIssues: {
                    noAddress,
                    farAddress,
                    total: noAddress + farAddress
                },
                needsUpdate,
                needsDuplicateCheck,
                processed: allListings.filter(l => l.processing_status === 'processed').length
            };

        } catch (error) {
            console.error('❌ Ошибка сбора данных объявлений:', error);
            return { 
                total: 0, active: 0, archived: 0, 
                addressIssues: { noAddress: 0, farAddress: 0, total: 0 },
                needsUpdate: 0, needsDuplicateCheck: 0, processed: 0 
            };
        }
    }

    /**
     * Сбор статистики по объектам недвижимости
     * (Пока объектов нет в БД, возвращаем статистику на основе объявлений)
     */
    async gatherObjectsData(areaId) {
        try {
            // Пока таблицы объектов нет, используем объявления как объекты
            const addresses = await this.db.getAddressesInMapArea(areaId);
            let processedListings = [];
            
            for (const address of addresses) {
                const listings = await this.db.getListingsByAddress(address.id);
                const processed = listings.filter(l => l.processing_status === 'processed');
                processedListings = processedListings.concat(processed);
            }

            // Статистика по актуализации
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const needsUpdate = processedListings.filter(obj => {
                const lastUpdate = new Date(obj.updated_at);
                return obj.status === 'active' && lastUpdate < weekAgo;
            }).length;

            return {
                total: processedListings.length,
                active: processedListings.filter(o => o.status === 'active').length,
                archived: processedListings.filter(o => o.status === 'archived').length,
                needsUpdate
            };

        } catch (error) {
            console.error('❌ Ошибка сбора данных объектов:', error);
            return { total: 0, active: 0, archived: 0, needsUpdate: 0 };
        }
    }

    /**
     * Сбор статистики по сегментам и подсегментам
     */
    async gatherSegmentsData(areaId) {
        try {
            const segments = await this.db.getSegmentsByMapArea(areaId);
            let totalSubsegments = 0;
            let housesInSegments = 0;

            for (const segment of segments) {
                const subsegments = await this.db.getSubsegmentsBySegment(segment.id);
                totalSubsegments += subsegments.length;

                // Подсчитываем дома в сегменте через поле segment_id у адресов
                const allAddresses = await this.db.getAddressesInMapArea(areaId);
                const segmentAddresses = allAddresses.filter(addr => addr.segment_id === segment.id);
                housesInSegments += segmentAddresses.length;
            }

            // Общее количество домов в области
            const totalHouses = await this.db.getAddressesInMapArea(areaId);
            const housesNotInSegments = totalHouses.length - housesInSegments;

            return {
                segments: segments.length,
                subsegments: totalSubsegments,
                housesInSegments,
                housesNotInSegments,
                readyForReports: segments.length > 0 && totalSubsegments > 0
            };

        } catch (error) {
            console.error('❌ Ошибка сбора данных сегментов:', error);
            return { 
                segments: 0, subsegments: 0, housesInSegments: 0, 
                housesNotInSegments: 0, readyForReports: false 
            };
        }
    }

    /**
     * Сбор статистики по флиппингу
     * (Упрощенная версия, пока нет полной функциональности флиппинга)
     */
    async gatherFlippingData(areaId) {
        try {
            // Получаем подсегменты в области
            const segments = await this.db.getSegmentsByMapArea(areaId);
            let evaluatedSubsegments = 0;
            let totalSubsegments = 0;

            for (const segment of segments) {
                const subsegments = await this.db.getSubsegmentsBySegment(segment.id);
                totalSubsegments += subsegments.length;
                
                // Проверяем наличие минимальных данных для флиппинга
                for (const subsegment of subsegments) {
                    // Если есть базовые расчеты цен, считаем подсегмент оцененным
                    if (subsegment.average_price && subsegment.average_price > 0) {
                        evaluatedSubsegments++;
                    }
                }
            }

            // Упрощенная оценка объектов, требующих внимания
            // (используем архивные объявления вместо объектов)
            const addresses = await this.db.getAddressesInMapArea(areaId);
            let objectsNeedingEvaluation = 0;
            
            for (const address of addresses) {
                const listings = await this.db.getListingsByAddress(address.id);
                const archived = listings.filter(l => l.status === 'archived' && l.price > 0);
                objectsNeedingEvaluation += archived.length;
            }

            return {
                evaluatedSubsegments,
                totalSubsegments,
                objectsNeedingEvaluation,
                readyForFlipping: evaluatedSubsegments > 0
            };

        } catch (error) {
            console.error('❌ Ошибка сбора данных флиппинга:', error);
            return { 
                evaluatedSubsegments: 0, totalSubsegments: 0, 
                objectsNeedingEvaluation: 0, readyForFlipping: false 
            };
        }
    }


    /**
     * Расчет уровня готовности области (0-100%)
     */
    calculateReadinessLevel(areaData) {
        let score = 0;
        let maxScore = 100;

        // Наличие полигона области (10 баллов)
        if (areaData.area.hasPolygon) score += 10;

        // Качество адресов (20 баллов)
        if (areaData.addresses.total > 0) {
            score += Math.round((areaData.addresses.averageCompleteness / 100) * 20);
        }

        // Обработанность объявлений (30 баллов)
        if (areaData.listings.total > 0) {
            const processedRatio = areaData.listings.processed / areaData.listings.total;
            score += Math.round(processedRatio * 30);
        }

        // Наличие сегментов (20 баллов)
        if (areaData.segments.readyForReports) score += 20;

        // Готовность к флиппингу (20 баллов)
        if (areaData.flipping.readyForFlipping) {
            const evaluationRatio = areaData.flipping.totalSubsegments > 0 ? 
                areaData.flipping.evaluatedSubsegments / areaData.flipping.totalSubsegments : 0;
            score += Math.round(evaluationRatio * 20);
        }

        return Math.min(score, maxScore);
    }

    /**
     * Анализ области через AI
     * @param {string|number} areaId - ID области (может быть строкой или числом)
     * @returns {string} - результат AI анализа
     */
    async analyzeAreaWithAI(areaId) {
        try {
            // Инициализация при первом использовании
            if (!this.db || !this.universalAI) {
                await this.init();
            }
            
            const areaData = await this.gatherAreaData(areaId);
            
            // Формируем промпт для AI
            const prompt = this.createAreaAnalysisPrompt(areaData);
            
            // Отправляем в AI
            const response = await this.universalAI.sendRequest(prompt, {
                taskType: 'analysis',
                language: 'ru',
                maxTokens: 2000
            });

            return response.content;

        } catch (error) {
            console.error('❌ Ошибка AI анализа области:', error);
            throw error;
        }
    }

    /**
     * Создание промпта для AI анализа области
     */
    createAreaAnalysisPrompt(areaData) {
        return `Проанализируй состояние области недвижимости и дай рекомендации:

**ОБЛАСТЬ: "${areaData.area.name}"**

**ДАННЫЕ ДЛЯ АНАЛИЗА:**

🏠 **АДРЕСА:**
- Всего адресов: ${areaData.addresses.total}
- Хорошо заполнены: ${areaData.addresses.wellFilled}
- Средняя заполненность: ${areaData.addresses.averageCompleteness}%
- Требуют доработки: ${areaData.addresses.needsAttention}

📋 **ОБЪЯВЛЕНИЯ:**
- Всего: ${areaData.listings.total} (активных: ${areaData.listings.active}, архивных: ${areaData.listings.archived})
- Без адресов: ${areaData.listings.addressIssues.noAddress}
- С неточными адресами (>50м): ${areaData.listings.addressIssues.farAddress}
- Требуют актуализации: ${areaData.listings.needsUpdate}
- Требуют обработки на дубли: ${areaData.listings.needsDuplicateCheck}
- Обработаны: ${areaData.listings.processed}

🏢 **ОБЪЕКТЫ НЕДВИЖИМОСТИ:**
- Всего объектов: ${areaData.objects.total} (активных: ${areaData.objects.active})
- Требуют актуализации: ${areaData.objects.needsUpdate}

📊 **СЕГМЕНТЫ:**
- Сегментов: ${areaData.segments.segments}
- Подсегментов: ${areaData.segments.subsegments}
- Домов в сегментах: ${areaData.segments.housesInSegments}
- Домов вне сегментов: ${areaData.segments.housesNotInSegments}
- Готовы отчёты: ${areaData.segments.readyForReports ? 'Да' : 'Нет'}

💰 **ФЛИППИНГ:**
- Оценённых подсегментов: ${areaData.flipping.evaluatedSubsegments} из ${areaData.flipping.totalSubsegments}
- Объектов требуют оценки: ${areaData.flipping.objectsNeedingEvaluation}
- Готов к флиппингу: ${areaData.flipping.readyForFlipping ? 'Да' : 'Нет'}

**ЗАДАЧА:**
Проанализируй данные и выдай структурированный ответ с:
1. 🔴 КРИТИЧНЫЕ проблемы (что блокирует работу)
2. 🟡 ВАЖНЫЕ задачи (что нужно сделать)
3. 🟢 ЧТО ГОТОВО (что работает хорошо)
4. 💡 РЕКОМЕНДАЦИИ (конкретные следующие шаги)
5. 📈 ОБЩИЙ СТАТУС готовности области (%)

Отвечай кратко, конкретно, с эмодзи для наглядности.`;
    }
}

// Экспорт класса
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIAreaAnalysisService;
} else {
    window.AIAreaAnalysisService = AIAreaAnalysisService;
}