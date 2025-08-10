/**
 * SegmentChart - компонент управления графиками и диаграммами сегментов
 * Извлечён из SegmentsManager для соблюдения принципа единственной ответственности
 */

class SegmentChart {
    constructor(configService) {
        this.configService = configService;
        
        this.charts = new Map();
        this.containersMap = new Map();
        
        // Конфигурация
        this.config = this.getChartConfig();
        
        // Обработчики событий
        this.eventHandlers = new Map();
        
        // Кэш данных для производительности
        this.dataCache = new Map();
        
        this.initialize();
    }

    /**
     * Получение конфигурации графиков
     */
    getChartConfig() {
        const chartConfig = this.configService?.getUIConfig('charts') || {};
        
        return {
            // Общие настройки
            animationDuration: chartConfig.animationDuration || 500,
            colorScheme: chartConfig.colorScheme || [
                '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
                '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'
            ],
            defaultHeight: chartConfig.defaultHeight || 400,
            
            // Настройки по типам графиков
            areaDistribution: {
                type: 'donut',
                height: 350,
                colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
                title: 'Распределение по площади'
            },
            
            priceHistory: {
                type: 'line',
                height: 400,
                colors: ['#3B82F6'],
                title: 'История цен'
            },
            
            priceDistribution: {
                type: 'histogram',
                height: 350,
                colors: ['#10B981'],
                title: 'Распределение цен'
            },
            
            buildYearDistribution: {
                type: 'bar',
                height: 300,
                colors: ['#F59E0B'],
                title: 'Распределение по годам постройки'
            },
            
            floorsDistribution: {
                type: 'bar',
                height: 300,
                colors: ['#8B5CF6'],
                title: 'Распределение по этажности'
            }
        };
    }

    /**
     * Инициализация компонента
     */
    initialize() {
        // Настройка глобальных настроек ApexCharts
        this.setupGlobalChartSettings();
        
        // Инициализация контейнеров графиков
        this.initializeContainers();
    }

    /**
     * Настройка глобальных параметров ApexCharts
     */
    setupGlobalChartSettings() {
        if (typeof ApexCharts !== 'undefined') {
            ApexCharts.exec('*', 'updateOptions', {
                chart: {
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    animations: {
                        enabled: true,
                        easing: 'easeinout',
                        speed: this.config.animationDuration
                    },
                    toolbar: {
                        show: true,
                        tools: {
                            download: true,
                            selection: true,
                            zoom: true,
                            zoomin: true,
                            zoomout: true,
                            pan: true,
                            reset: true
                        }
                    }
                },
                theme: {
                    palette: 'palette1'
                }
            });
        }
    }

    /**
     * Инициализация контейнеров графиков
     */
    initializeContainers() {
        const containers = [
            'areaDistributionChart',
            'priceHistoryChart', 
            'priceDistributionChart',
            'buildYearDistributionChart',
            'floorsDistributionChart'
        ];

        containers.forEach(containerId => {
            const element = document.getElementById(containerId);
            if (element) {
                this.containersMap.set(containerId, element);
            }
        });
    }

    /**
     * Создание графика распределения по площади (donut chart)
     */
    createAreaDistributionChart(data, containerId = 'areaDistributionChart') {
        const container = this.containersMap.get(containerId);
        if (!container) {
            console.error(`Контейнер ${containerId} не найден`);
            return null;
        }

        const config = this.config.areaDistribution;
        const processedData = this.processAreaDistributionData(data);

        if (!processedData.series.length) {
            this.showEmptyState(container, 'Нет данных для отображения');
            return null;
        }

        const options = {
            series: processedData.series,
            chart: {
                type: 'donut',
                height: config.height,
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: this.config.animationDuration
                }
            },
            labels: processedData.labels,
            colors: config.colors,
            title: {
                text: config.title,
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 'bold'
                }
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '70%',
                        labels: {
                            show: true,
                            total: {
                                show: true,
                                label: 'Общая площадь',
                                formatter: (w) => {
                                    return w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString('ru-RU') + ' м²';
                                }
                            }
                        }
                    }
                }
            },
            legend: {
                position: 'bottom',
                fontSize: '14px'
            },
            dataLabels: {
                enabled: true,
                formatter: (val, opts) => {
                    return val.toFixed(1) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: (val) => val.toLocaleString('ru-RU') + ' м²'
                }
            },
            responsive: [{
                breakpoint: 768,
                options: {
                    chart: {
                        height: 300
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }]
        };

        return this.createChart(containerId, options, 'areaDistribution');
    }

    /**
     * Создание графика истории цен (line chart)
     */
    createPriceHistoryChart(data, containerId = 'priceHistoryChart') {
        const container = this.containersMap.get(containerId);
        if (!container) {
            console.error(`Контейнер ${containerId} не найден`);
            return null;
        }

        const config = this.config.priceHistory;
        const processedData = this.processPriceHistoryData(data);

        if (!processedData.series.length) {
            this.showEmptyState(container, 'Нет данных по истории цен');
            return null;
        }

        const options = {
            series: processedData.series,
            chart: {
                type: 'line',
                height: config.height,
                zoom: {
                    enabled: true
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: this.config.animationDuration
                }
            },
            colors: config.colors,
            title: {
                text: config.title,
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 'bold'
                }
            },
            stroke: {
                curve: 'smooth',
                width: 2
            },
            markers: {
                size: 4
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    format: 'dd.MM.yyyy'
                }
            },
            yaxis: {
                labels: {
                    formatter: (val) => val.toLocaleString('ru-RU') + ' ₽'
                }
            },
            tooltip: {
                x: {
                    format: 'dd.MM.yyyy HH:mm'
                },
                y: {
                    formatter: (val) => val.toLocaleString('ru-RU') + ' ₽'
                }
            },
            grid: {
                borderColor: '#e0e6ed'
            },
            legend: {
                position: 'top'
            }
        };

        return this.createChart(containerId, options, 'priceHistory');
    }

    /**
     * Создание гистограммы распределения цен
     */
    createPriceDistributionChart(data, containerId = 'priceDistributionChart') {
        const container = this.containersMap.get(containerId);
        if (!container) {
            console.error(`Контейнер ${containerId} не найден`);
            return null;
        }

        const config = this.config.priceDistribution;
        const processedData = this.processPriceDistributionData(data);

        if (!processedData.series.length) {
            this.showEmptyState(container, 'Нет данных о ценах');
            return null;
        }

        const options = {
            series: [{
                name: 'Количество объектов',
                data: processedData.series
            }],
            chart: {
                type: 'bar',
                height: config.height,
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: this.config.animationDuration
                }
            },
            colors: config.colors,
            title: {
                text: config.title,
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 'bold'
                }
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: '80%',
                    borderRadius: 4
                }
            },
            dataLabels: {
                enabled: true,
                formatter: (val) => val.toString()
            },
            xaxis: {
                categories: processedData.categories,
                title: {
                    text: 'Диапазон цен (млн ₽)'
                }
            },
            yaxis: {
                title: {
                    text: 'Количество объектов'
                }
            },
            tooltip: {
                y: {
                    formatter: (val) => val + ' объектов'
                }
            }
        };

        return this.createChart(containerId, options, 'priceDistribution');
    }

    /**
     * Создание графика распределения по годам постройки
     */
    createBuildYearDistributionChart(data, containerId = 'buildYearDistributionChart') {
        const container = this.containersMap.get(containerId);
        if (!container) {
            console.error(`Контейнер ${containerId} не найден`);
            return null;
        }

        const config = this.config.buildYearDistribution;
        const processedData = this.processBuildYearData(data);

        if (!processedData.series.length) {
            this.showEmptyState(container, 'Нет данных о годах постройки');
            return null;
        }

        const options = {
            series: [{
                name: 'Количество объектов',
                data: processedData.series
            }],
            chart: {
                type: 'bar',
                height: config.height,
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: this.config.animationDuration
                }
            },
            colors: config.colors,
            title: {
                text: config.title,
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 'bold'
                }
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: '70%',
                    borderRadius: 4
                }
            },
            dataLabels: {
                enabled: true
            },
            xaxis: {
                categories: processedData.categories,
                title: {
                    text: 'Год постройки'
                }
            },
            yaxis: {
                title: {
                    text: 'Количество объектов'
                }
            }
        };

        return this.createChart(containerId, options, 'buildYearDistribution');
    }

    /**
     * Создание графика распределения по этажности
     */
    createFloorsDistributionChart(data, containerId = 'floorsDistributionChart') {
        const container = this.containersMap.get(containerId);
        if (!container) {
            console.error(`Контейнер ${containerId} не найден`);
            return null;
        }

        const config = this.config.floorsDistribution;
        const processedData = this.processFloorsData(data);

        if (!processedData.series.length) {
            this.showEmptyState(container, 'Нет данных об этажности');
            return null;
        }

        const options = {
            series: [{
                name: 'Количество объектов',
                data: processedData.series
            }],
            chart: {
                type: 'bar',
                height: config.height,
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: this.config.animationDuration
                }
            },
            colors: config.colors,
            title: {
                text: config.title,
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 'bold'
                }
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: '70%',
                    borderRadius: 4
                }
            },
            dataLabels: {
                enabled: true
            },
            xaxis: {
                categories: processedData.categories,
                title: {
                    text: 'Количество этажей'
                }
            },
            yaxis: {
                title: {
                    text: 'Количество объектов'
                }
            }
        };

        return this.createChart(containerId, options, 'floorsDistribution');
    }

    /**
     * Базовый метод создания графика
     */
    createChart(containerId, options, chartType) {
        try {
            // Уничтожаем существующий график
            this.destroyChart(containerId);

            // Создаём новый график
            const chart = new ApexCharts(this.containersMap.get(containerId), options);
            chart.render();

            // Сохраняем ссылку
            this.charts.set(containerId, { chart, type: chartType, options });

            // Уведомляем о создании
            this.emit('chart:created', { containerId, chartType });

            return chart;

        } catch (error) {
            console.error(`Ошибка создания графика ${containerId}:`, error);
            this.showErrorState(this.containersMap.get(containerId), 'Ошибка загрузки графика');
            return null;
        }
    }

    /**
     * Обновление данных графика
     */
    updateChart(containerId, newData, animate = true) {
        const chartInfo = this.charts.get(containerId);
        if (!chartInfo) {
            console.warn(`График ${containerId} не найден для обновления`);
            return;
        }

        try {
            const { chart, type } = chartInfo;
            
            // Обрабатываем новые данные в зависимости от типа графика
            let processedData;
            switch (type) {
                case 'areaDistribution':
                    processedData = this.processAreaDistributionData(newData);
                    chart.updateSeries(processedData.series);
                    chart.updateOptions({ labels: processedData.labels });
                    break;
                    
                case 'priceHistory':
                    processedData = this.processPriceHistoryData(newData);
                    chart.updateSeries(processedData.series, animate);
                    break;
                    
                case 'priceDistribution':
                    processedData = this.processPriceDistributionData(newData);
                    chart.updateSeries([{ data: processedData.series }], animate);
                    chart.updateOptions({ xaxis: { categories: processedData.categories } });
                    break;
                    
                case 'buildYearDistribution':
                    processedData = this.processBuildYearData(newData);
                    chart.updateSeries([{ data: processedData.series }], animate);
                    chart.updateOptions({ xaxis: { categories: processedData.categories } });
                    break;
                    
                case 'floorsDistribution':
                    processedData = this.processFloorsData(newData);
                    chart.updateSeries([{ data: processedData.series }], animate);
                    chart.updateOptions({ xaxis: { categories: processedData.categories } });
                    break;
            }

            // Кэшируем данные
            this.dataCache.set(containerId, newData);
            
            this.emit('chart:updated', { containerId, type });

        } catch (error) {
            console.error(`Ошибка обновления графика ${containerId}:`, error);
        }
    }

    /**
     * Уничтожение графика
     */
    destroyChart(containerId) {
        const chartInfo = this.charts.get(containerId);
        if (chartInfo) {
            try {
                chartInfo.chart.destroy();
                this.charts.delete(containerId);
                this.emit('chart:destroyed', { containerId });
            } catch (error) {
                console.error(`Ошибка уничтожения графика ${containerId}:`, error);
            }
        }
    }

    /**
     * Показ пустого состояния
     */
    showEmptyState(container, message) {
        container.innerHTML = `
            <div class="empty-chart-state text-center py-5">
                <div class="text-muted mb-3">
                    <i class="fas fa-chart-bar fa-3x opacity-50"></i>
                </div>
                <h5 class="text-muted">${message}</h5>
                <p class="text-muted small">Данные для отображения отсутствуют</p>
            </div>
        `;
    }

    /**
     * Показ состояния ошибки
     */
    showErrorState(container, message) {
        container.innerHTML = `
            <div class="error-chart-state text-center py-5">
                <div class="text-danger mb-3">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                </div>
                <h5 class="text-danger">${message}</h5>
                <p class="text-muted small">Попробуйте обновить страницу</p>
            </div>
        `;
    }

    /**
     * Обработка данных для распределения по площади
     */
    processAreaDistributionData(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return { series: [], labels: [] };
        }

        // Группируем по диапазонам площади
        const ranges = [
            { min: 0, max: 30, label: 'До 30 м²' },
            { min: 30, max: 50, label: '30-50 м²' },
            { min: 50, max: 80, label: '50-80 м²' },
            { min: 80, max: 120, label: '80-120 м²' },
            { min: 120, max: Infinity, label: 'Свыше 120 м²' }
        ];

        const distribution = ranges.map(range => {
            const count = data.filter(item => 
                item.area >= range.min && item.area < range.max
            ).length;
            return count;
        });

        const labels = ranges.map(range => range.label);
        
        // Убираем категории с нулевыми значениями
        const filteredData = [];
        const filteredLabels = [];
        
        distribution.forEach((value, index) => {
            if (value > 0) {
                filteredData.push(value);
                filteredLabels.push(labels[index]);
            }
        });

        return {
            series: filteredData,
            labels: filteredLabels
        };
    }

    /**
     * Обработка данных для истории цен
     */
    processPriceHistoryData(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return { series: [] };
        }

        // Группируем данные по датам и вычисляем среднюю цену
        const groupedData = new Map();
        
        data.forEach(item => {
            if (item.price && item.date) {
                const dateKey = new Date(item.date).toDateString();
                
                if (!groupedData.has(dateKey)) {
                    groupedData.set(dateKey, []);
                }
                groupedData.get(dateKey).push(item.price);
            }
        });

        // Создаём серию данных
        const seriesData = Array.from(groupedData.entries())
            .map(([dateKey, prices]) => {
                const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
                return {
                    x: new Date(dateKey).getTime(),
                    y: Math.round(avgPrice)
                };
            })
            .sort((a, b) => a.x - b.x);

        return {
            series: [{
                name: 'Средняя цена',
                data: seriesData
            }]
        };
    }

    /**
     * Обработка данных для распределения цен
     */
    processPriceDistributionData(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return { series: [], categories: [] };
        }

        const prices = data.map(item => item.price).filter(price => price > 0);
        if (prices.length === 0) {
            return { series: [], categories: [] };
        }

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const rangeSize = (maxPrice - minPrice) / 10; // 10 интервалов

        const ranges = [];
        for (let i = 0; i < 10; i++) {
            const min = minPrice + i * rangeSize;
            const max = min + rangeSize;
            ranges.push({ min, max, label: `${(min / 1000000).toFixed(1)} - ${(max / 1000000).toFixed(1)}` });
        }

        const distribution = ranges.map(range => {
            return prices.filter(price => price >= range.min && price < range.max).length;
        });

        return {
            series: distribution,
            categories: ranges.map(range => range.label)
        };
    }

    /**
     * Обработка данных для распределения по годам постройки
     */
    processBuildYearData(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return { series: [], categories: [] };
        }

        const yearCounts = new Map();
        
        data.forEach(item => {
            if (item.build_year && item.build_year > 1900) {
                const decade = Math.floor(item.build_year / 10) * 10;
                const key = `${decade}s`;
                yearCounts.set(key, (yearCounts.get(key) || 0) + 1);
            }
        });

        const sortedYears = Array.from(yearCounts.entries())
            .sort(([a], [b]) => parseInt(a) - parseInt(b));

        return {
            series: sortedYears.map(([, count]) => count),
            categories: sortedYears.map(([decade]) => decade)
        };
    }

    /**
     * Обработка данных для распределения по этажности
     */
    processFloorsData(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return { series: [], categories: [] };
        }

        const floorCounts = new Map();
        
        data.forEach(item => {
            if (item.floors_count && item.floors_count > 0) {
                let category;
                const floors = item.floors_count;
                
                if (floors <= 5) category = '1-5';
                else if (floors <= 9) category = '6-9';
                else if (floors <= 16) category = '10-16';
                else if (floors <= 25) category = '17-25';
                else category = '25+';
                
                floorCounts.set(category, (floorCounts.get(category) || 0) + 1);
            }
        });

        const categories = ['1-5', '6-9', '10-16', '17-25', '25+'];
        const series = categories.map(cat => floorCounts.get(cat) || 0);

        return { series, categories };
    }

    /**
     * Экспорт графика в изображение
     */
    async exportChart(containerId, format = 'png', filename = null) {
        const chartInfo = this.charts.get(containerId);
        if (!chartInfo) {
            throw new Error(`График ${containerId} не найден`);
        }

        try {
            const chart = chartInfo.chart;
            const dataUrl = await chart.dataURI({ type: format, quality: 1 });
            
            if (filename) {
                // Создаём ссылку для скачивания
                const link = document.createElement('a');
                link.href = dataUrl.imgURI;
                link.download = filename;
                link.click();
            }
            
            return dataUrl.imgURI;
        } catch (error) {
            console.error(`Ошибка экспорта графика ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Получение состояния всех графиков
     */
    getChartsState() {
        const state = {};
        
        this.charts.forEach((chartInfo, containerId) => {
            state[containerId] = {
                type: chartInfo.type,
                hasData: this.dataCache.has(containerId),
                isVisible: this.containersMap.get(containerId)?.offsetParent !== null
            };
        });
        
        return state;
    }

    /**
     * Добавление слушателя событий
     */
    addEventListener(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * Удаление слушателя событий
     */
    removeEventListener(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Генерация события
     */
    emit(eventType, data = {}) {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Уничтожение всех графиков
     */
    destroy() {
        // Уничтожаем все графики
        this.charts.forEach((chartInfo, containerId) => {
            this.destroyChart(containerId);
        });
        
        // Очищаем данные
        this.charts.clear();
        this.dataCache.clear();
        this.eventHandlers.clear();
        this.containersMap.clear();
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SegmentChart;
} else {
    window.SegmentChart = SegmentChart;
}