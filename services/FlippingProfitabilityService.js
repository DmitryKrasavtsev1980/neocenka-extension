/**
 * FlippingProfitabilityService - сервис для расчёта доходности флиппинга
 * Реализует все формулы расчёта согласно документации
 * Следует архитектуре v0.1
 */
class FlippingProfitabilityService {
    constructor(errorHandlingService, configService) {
        this.errorHandlingService = errorHandlingService;
        this.configService = configService;
        
        this.debugEnabled = false;
        this.loadDebugSettings();
    }

    /**
     * Загрузка настроек отладки
     */
    async loadDebugSettings() {
        try {
            const debugConfig = await this.configService.get('debug.enabled');
            this.debugEnabled = debugConfig === true;
        } catch (error) {
            this.debugEnabled = false;
        }
    }

    /**
     * Основной метод расчёта доходности флиппинга
     * @param {Object} object - объект недвижимости
     * @param {Object} params - параметры расчёта
     * @returns {Object} результат расчёта
     */
    calculateFlippingProfitability(object, params) {
        try {
            if (this.debugEnabled) {
                console.log('🔢 FlippingProfitabilityService: Начинаем расчёт для объекта', object.id);
            }

            // Отладка для дочерней таблицы (отключено)
            // if (params && params.debugTaxCalculation) {
            //     console.log('🔍 НАЧАЛО РАСЧЁТА:', { ... });
            // }

            // 1. Расчёт продажной цены
            const salePrice = params.referencePricePerMeter * object.area_total;
            

            // 2. Расчёт стоимости ремонта
            const renovationCost = this.calculateRenovationCost(object.area_total, params);
            
            // Отладка расчёта ремонта (отключено)
            // if (params && params.debugTaxCalculation) {
            //     console.log('🔍 РАСЧЁТ РЕМОНТА:', { ... });
            // }

            // 3. Расчёт срока проекта
            const renovationDays = object.area_total / params.renovationSpeed;
            const totalProjectDays = renovationDays + params.averageExposureDays;
            const totalProjectMonths = totalProjectDays / 30;
            
            

            // 4. Расчёт общих затрат
            // Валидация параметров финансирования перед расчётом
            if (params.financing === 'mortgage') {
                if (!params.downPayment || params.downPayment <= 0 || params.downPayment >= 100) {
                    throw new Error(`Некорректный первоначальный взнос: ${params.downPayment}%`);
                }
                if (!params.mortgageRate || params.mortgageRate <= 0) {
                    throw new Error(`Некорректная ставка ипотеки: ${params.mortgageRate}%`);
                }
                if (!params.mortgageTerm || params.mortgageTerm <= 0) {
                    throw new Error(`Некорректный срок ипотеки: ${params.mortgageTerm} лет`);
                }
            }
            
            const financingResult = this.calculateFinancingCosts(object.currentPrice, params, totalProjectDays);
            const totalCosts = financingResult.downPayment + renovationCost + params.additionalExpenses + financingResult.interestCosts;

            // 5. Расчёт прибыли до налогов
            // ИСПРАВЛЕНО: При ипотеке вычитаем полную стоимость покупки + затраты, без двойного списания кредита
            const actualPurchasePrice = object.currentPrice; // Реальная цена покупки объекта
            
            // Рассчитываем стоимость денег для наличного финансирования
            const cashCosts = this.calculateCashCosts(object.currentPrice, params, totalProjectMonths);
            
            const operationalCosts = renovationCost + params.additionalExpenses + financingResult.interestCosts + cashCosts;
            const grossProfit = salePrice - actualPurchasePrice - operationalCosts;

            // 6. Расчёт налогов - передаем рассчитанную стоимость ремонта, исключаем стоимость денег из налогооблагаемой базы
            const taxes = this.calculateTaxes(object.currentPrice, salePrice, totalCosts, params.taxType, params, renovationCost, cashCosts);
            const netProfit = grossProfit - taxes;

            // 7. Расчёт доходности
            // ИСПРАВЛЕНО: ROI считаем от инвестированного капитала флиппера, а не от общих затрат
            const investedCapital = params.financing === 'mortgage' 
                ? financingResult.downPayment + operationalCosts
                : totalCosts; // При налике используем общие затраты
            const roi = (netProfit / investedCapital) * 100;
            const annualROI = (roi / totalProjectMonths) * 12;

            // 8. Раздел прибыли между участниками
            const profitSharing = this.calculateProfitSharing(netProfit, params);

            // ИСПРАВЛЕНО: Показываем полную цену объекта, а затраты флиппера передаем отдельно
            const displayPurchasePrice = object.currentPrice; // Всегда полная цена объекта
            const actualFlipperCosts = params.financing === 'mortgage' 
                ? financingResult.downPayment + financingResult.interestCosts  // Взнос + проценты
                : object.currentPrice;  // При налике = полная цена

            const result = {
                salePrice,
                purchasePrice: displayPurchasePrice, // Полная стоимость покупки для отображения
                actualPurchasePrice: object.currentPrice, // Реальная цена объекта для справки
                flipperPurchaseCosts: actualFlipperCosts, // Реальные затраты флиппера на покупку
                renovationCost,
                additionalExpenses: params.additionalExpenses,
                financingCosts: financingResult.interestCosts,
                cashCosts, // Стоимость денег для наличного финансирования
                totalCosts: investedCapital, // ИСПРАВЛЕНО: показываем инвестированный капитал флиппера
                grossProfit,
                taxes,
                netProfit,
                roi: Math.round(roi * 100) / 100, // Округляем до 2 знаков
                annualROI: Math.round(annualROI * 100) / 100,
                totalProjectDays: Math.round(totalProjectDays),
                totalProjectMonths: Math.round(totalProjectMonths * 10) / 10,
                profitSharing,
                financing: financingResult
            };

            if (this.debugEnabled) {
                console.log('🔢 Результат расчёта:', result);
            }

            return result;

        } catch (error) {
            console.error('❌ FlippingProfitabilityService: Ошибка расчёта:', error);
            throw error;
        }
    }

    /**
     * Расчёт целевой цены для заданной доходности
     * @param {Object} object - объект недвижимости 
     * @param {number} targetROI - целевая доходность (% годовых)
     * @param {Object} params - параметры расчёта
     * @returns {number} целевая цена покупки
     */
    calculateTargetPrice(object, targetROI, params) {
        try {
            // Бинарный поиск для быстрого нахождения целевой цены
            let minPrice = object.currentPrice * 0.3; // Минимум 30% от текущей цены
            let maxPrice = object.currentPrice * 0.95; // Максимум 95% от текущей цены
            let iterations = 0;
            const maxIterations = 15; // Бинарный поиск требует гораздо меньше итераций
            const precision = 0.1; // Точность 0.1%

            while (iterations < maxIterations && (maxPrice - minPrice) > 1000) {
                const testPrice = (minPrice + maxPrice) / 2;
                const testObject = { ...object, currentPrice: testPrice };
                const result = this.calculateFlippingProfitability(testObject, params);

                if (Math.abs(result.annualROI - targetROI) < precision) {
                    return Math.round(testPrice);
                }

                // Бинарный поиск: сужаем диапазон вдвое
                if (result.annualROI > targetROI) {
                    minPrice = testPrice; // Можем повысить цену
                } else {
                    maxPrice = testPrice; // Нужно понизить цену
                }

                iterations++;
            }

            const finalPrice = (minPrice + maxPrice) / 2;
            return Math.round(finalPrice);

        } catch (error) {
            console.error('❌ FlippingProfitabilityService: Ошибка расчёта целевой цены:', error);
            return object.currentPrice;
        }
    }

    /**
     * Расчёт стоимости ремонта
     * @param {number} area - площадь объекта
     * @param {Object} params - параметры расчёта
     * @returns {number} стоимость ремонта
     */
    calculateRenovationCost(area, params) {
        if (params.renovationType === 'auto') {
            // Заглушка: 20000 ₽/м² работы + 20000 ₽/м² материалы
            return area * (20000 + 20000);
        } else {
            return area * (params.workCost + params.materialsCost);
        }
    }

    /**
     * Расчёт затрат на финансирование
     * @param {number} purchasePrice - цена покупки
     * @param {Object} params - параметры финансирования
     * @param {number} projectDays - срок проекта в днях
     * @returns {Object} результат расчёта финансирования
     */
    calculateFinancingCosts(purchasePrice, params, projectDays) {
        if (params.financing === 'cash') {
            return {
                downPayment: purchasePrice,
                loanAmount: 0,
                monthlyPayment: 0,
                interestCosts: 0,
                totalPayments: 0
            };
        } else {
            // Ипотека - дополнительная валидация
            if (!purchasePrice || purchasePrice <= 0) {
                throw new Error(`Некорректная цена покупки: ${purchasePrice}`);
            }
            if (!projectDays || projectDays <= 0) {
                throw new Error(`Некорректный срок проекта: ${projectDays} дней`);
            }
            
            const downPaymentAmount = purchasePrice * (params.downPayment / 100);
            const loanAmount = purchasePrice - downPaymentAmount;
            const monthlyPayment = this.calculateMortgagePayment(loanAmount, params.mortgageRate, params.mortgageTerm);
            const projectMonths = projectDays / 30;
            const interestCosts = monthlyPayment * projectMonths;

            // Проверка на NaN значения
            if (isNaN(downPaymentAmount) || isNaN(loanAmount) || isNaN(monthlyPayment) || isNaN(interestCosts)) {
                throw new Error(`Получены NaN значения при расчёте ипотеки: downPayment=${downPaymentAmount}, loanAmount=${loanAmount}, monthlyPayment=${monthlyPayment}, interestCosts=${interestCosts}`);
            }

            return {
                downPayment: downPaymentAmount,
                loanAmount: loanAmount,
                monthlyPayment: Math.round(monthlyPayment),
                interestCosts: Math.round(interestCosts),
                totalPayments: Math.round(interestCosts),
                projectMonths: Math.round(projectMonths * 10) / 10
            };
        }
    }

    /**
     * Расчёт ипотечного платежа
     * @param {number} loanAmount - сумма кредита
     * @param {number} annualRate - годовая ставка (%)
     * @param {number} years - срок кредита (лет)
     * @returns {number} ежемесячный платёж
     */
    calculateMortgagePayment(loanAmount, annualRate, years) {
        const monthlyRate = annualRate / 100 / 12;
        const totalPayments = years * 12;
        
        if (monthlyRate === 0) return loanAmount / totalPayments;
        
        return (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / 
               (Math.pow(1 + monthlyRate, totalPayments) - 1);
    }

    /**
     * Расчёт стоимости денег для наличного финансирования
     * @param {number} purchasePrice - цена покупки
     * @param {Object} params - параметры расчёта
     * @param {number} projectMonths - длительность проекта в месяцах
     * @returns {number} стоимость денег
     */
    calculateCashCosts(purchasePrice, params, projectMonths) {
        // Отладочный вывод для диагностики стоимости денег (отключено)
        // if (params.debugTaxCalculation) {
        //     console.log('🔍 СТОИМОСТЬ ДЕНЕГ: Проверка параметров', { ... });
        // }
        
        // Стоимость денег применяется только для наличного финансирования
        if (params.financing !== 'cash' || !params.cashCostRate || params.cashCostRate <= 0) {
            // if (params.debugTaxCalculation) {
            //     console.log('🔍 СТОИМОСТЬ ДЕНЕГ: Не применяется', { ... });
            // }
            return 0;
        }
        
        // Рассчитываем стоимость денег только от суммы покупки (не включая ремонт и доп.расходы)
        // Формула: (сумма * процент годовых * месяцы) / 12
        const cashCosts = (purchasePrice * (params.cashCostRate / 100) * projectMonths) / 12;
        
        // if (params.debugTaxCalculation) {
        //     console.log('🔍 СТОИМОСТЬ ДЕНЕГ: Рассчитано', { ... });
        // }
        
        return cashCosts;
    }

    /**
     * Расчёт налогов
     * @param {number} purchasePrice - цена покупки
     * @param {number} salePrice - цена продажи
     * @param {number} totalCosts - общие затраты
     * @param {string} taxType - тип налогообложения
     * @param {Object} params - параметры расчёта
     * @param {number} calculatedRenovationCost - рассчитанная стоимость ремонта
     * @param {number} cashCosts - стоимость денег (не включается в налогооблагаемую базу)
     * @returns {number} сумма налогов
     */
    calculateTaxes(purchasePrice, salePrice, totalCosts, taxType, params, calculatedRenovationCost = 0, cashCosts = 0) {
        // Отладка только при специальном флаге (отключено)
        // if (params && params.debugTaxCalculation) {
        //     console.log('🔍 НАЛОГИ: Тип налогообложения:', taxType, 'Покупка:', purchasePrice, 'Продажа:', salePrice);
        //     console.log('🔍 СТОИМОСТЬ РЕМОНТА:', { ... });
        // }
        
        if (taxType === 'ip') {
            // ИП: 15% с (доходы - расходы)
            // При ипотеке в расходы включаем полную покупную стоимость + ремонт + доп.расходы + проценты
            let deductibleCosts;
            if (params && params.financing === 'mortgage') {
                // Полная стоимость объекта + ремонт + доп.расходы + проценты по ипотеке
                const financingResult = this.calculateFinancingCosts(purchasePrice, params, params.totalProjectDays || 62);
                const renovationFromParams = calculatedRenovationCost || params.renovationCost || 0;
                const additionalFromParams = params.additionalExpenses || 0;
                deductibleCosts = purchasePrice + renovationFromParams + additionalFromParams + financingResult.interestCosts;
                
                // Отладка расчёта расходов к вычету для ИП (отключено)
                // if (params.debugTaxCalculation) {
                //     console.log('🔍 ИП РАСХОДЫ К ВЫЧЕТУ:', { ... });
                // }
            } else {
                // При наличном финансировании исключаем стоимость денег из налогооблагаемой базы
                deductibleCosts = totalCosts - cashCosts;
                
                // Отладка для наличного финансирования (отключено)
                // if (params.debugTaxCalculation) {
                //     console.log('🔍 ИП НАЛИЧНОЕ РАСХОДЫ К ВЫЧЕТУ:', { ... });
                // }
            }
            const taxableIncome = salePrice - deductibleCosts;
            const taxAmount = Math.max(0, taxableIncome * 0.15);
            // if (params && params.debugTaxCalculation) {
            //     console.log('🔍 ИП: Расходы к вычету:', deductibleCosts, 'Налогооблагаемый доход:', taxableIncome, 'Налог 15%:', taxAmount);
            // }
            return taxAmount;
        } else {
            // Физлицо: прогрессивная ставка с разницы покупки/продажи
            const taxableIncome = salePrice - purchasePrice;
            if (taxableIncome <= 0) return 0;
            
            const taxAmount = taxableIncome <= 2400000 
                ? taxableIncome * 0.13
                : (2400000 * 0.13) + ((taxableIncome - 2400000) * 0.15);
            // if (params && params.debugTaxCalculation) {
            //     console.log('🔍 ФИЗЛИЦО: Налогооблагаемый доход:', taxableIncome, 'Налог:', taxAmount, 'Ставка:', taxableIncome <= 2400000 ? '13%' : '13%+15%');
            // }
            return taxAmount;
        }
    }

    /**
     * Раздел прибыли между участниками
     * @param {number} netProfit - чистая прибыль
     * @param {Object} params - параметры раздела
     * @returns {Object} раздел прибыли
     */
    calculateProfitSharing(netProfit, params) {
        if (params.participants === 'flipper') {
            return { 
                flipper: netProfit, 
                investor: 0,
                flipperPercent: 100,
                investorPercent: 0
            };
        }

        if (params.profitSharing === 'percentage') {
            const flipperShare = netProfit * (params.flipperPercentage / 100);
            const investorShare = netProfit - flipperShare;
            
            return { 
                flipper: Math.round(flipperShare), 
                investor: Math.round(investorShare),
                flipperPercent: params.flipperPercentage,
                investorPercent: params.investorPercentage
            };
        } else { // fix-plus-percentage
            const flipperFixed = params.fixedPaymentAmount;
            const remainingProfit = netProfit - flipperFixed;
            const flipperPercent = Math.max(0, remainingProfit * (params.fixedPlusPercentage / 100));
            const investorShare = Math.max(0, remainingProfit - flipperPercent);
            
            return {
                flipper: Math.round(flipperFixed + flipperPercent),
                investor: Math.round(investorShare),
                flipperFixed: flipperFixed,
                flipperPercent: params.fixedPlusPercentage,
                remainingProfit: Math.round(remainingProfit)
            };
        }
    }

    /**
     * Расчёт двух вариантов для дочерней таблицы (с отладкой налогов)
     * @param {Object} object - объект недвижимости
     * @param {Object} params - параметры расчёта
     * @returns {Object} результат с двумя вариантами
     */
    calculateBothScenariosForDetails(object, params) {
        try {
            // Добавляем флаг отладки для дочерней таблицы
            const paramsWithDebug = { ...params, debugTaxCalculation: true };
            
            // Сценарий 1: при текущей цене
            const currentPriceResult = this.calculateFlippingProfitability(object, paramsWithDebug);

            // Сценарий 2: целевая цена для заданной доходности
            const targetPrice = this.calculateTargetPrice(object, params.profitabilityPercent, paramsWithDebug);
            const targetObject = { ...object, currentPrice: targetPrice };
            const targetPriceResult = this.calculateFlippingProfitability(targetObject, paramsWithDebug);

            return {
                currentPrice: currentPriceResult,
                targetPrice: {
                    ...targetPriceResult,
                    targetPurchasePrice: targetPrice,
                    discount: Math.round(((object.currentPrice - targetPrice) / object.currentPrice) * 100)
                }
            };

        } catch (error) {
            console.error('❌ FlippingProfitabilityService: Ошибка расчёта сценариев для дочерней таблицы:', error);
            throw error;
        }
    }

    /**
     * Расчёт двух вариантов для объекта
     * @param {Object} object - объект недвижимости
     * @param {Object} params - параметры расчёта
     * @returns {Object} результат с двумя вариантами
     */
    calculateBothScenarios(object, params) {
        try {
            // Сценарий 1: при текущей цене
            const currentPriceResult = this.calculateFlippingProfitability(object, params);

            // Сценарий 2: целевая цена для заданной доходности
            const targetPrice = this.calculateTargetPrice(object, params.profitabilityPercent, params);
            const targetObject = { ...object, currentPrice: targetPrice };
            const targetPriceResult = this.calculateFlippingProfitability(targetObject, params);

            return {
                currentPrice: currentPriceResult,
                targetPrice: {
                    ...targetPriceResult,
                    targetPurchasePrice: targetPrice,
                    discount: Math.round(((object.currentPrice - targetPrice) / object.currentPrice) * 100)
                }
            };

        } catch (error) {
            console.error('❌ FlippingProfitabilityService: Ошибка расчёта сценариев:', error);
            throw error;
        }
    }

    /**
     * Форматирование денежной суммы
     * @param {number} amount - сумма
     * @returns {string} отформатированная сумма
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ₽';
    }

    /**
     * Форматирование процентов
     * @param {number} percent - проценты
     * @param {number} decimals - количество знаков после запятой
     * @returns {string} отформатированные проценты
     */
    formatPercent(percent, decimals = 1) {
        return (Math.round(percent * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals) + '%';
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingProfitabilityService;
}