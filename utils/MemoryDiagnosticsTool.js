/**
 * 🔍 Комплексная диагностика всех видов утечек памяти
 * 
 * Инструмент для поиска скрытых утечек памяти, которые не отображаются в performance.memory
 * но видны в Chrome Task Manager как разница между JS heap и общим потреблением.
 * 
 * @author Claude Code
 * @version 1.0
 * @date 2024-09-04
 */
class MemoryDiagnosticsTool {
    
    /**
     * 🎯 Полная диагностика всех источников памяти
     * Запускает все проверки и генерирует отчёт с рекомендациями
     */
    static async runFullDiagnostics() {
        console.log('🔍 ===== ПОЛНАЯ ДИАГНОСТИКА ПАМЯТИ НАЧАТА =====');
        console.log('📅 Время:', new Date().toLocaleString());
        
        const results = {};
        
        try {
            // 1. JavaScript heap память
            results.jsMemory = this.getJavaScriptMemory();
            console.log('📊 JS Memory:', results.jsMemory);
            
            // 2. DOM статистика
            results.domStats = this.getDOMStats();
            console.log('🌐 DOM Stats:', results.domStats);
            
            // 3. Leaflet карты и маркеры
            results.mapStats = this.getLeafletStats();
            console.log('🗺️ Leaflet Stats:', results.mapStats);
            
            // 4. ApexCharts графики
            results.chartStats = this.getApexChartsStats();
            console.log('📈 Charts Stats:', results.chartStats);
            
            // 5. DataTables таблицы
            results.tableStats = this.getDataTablesStats();
            console.log('📋 Tables Stats:', results.tableStats);
            
            // 6. Event Listeners
            results.eventStats = this.getEventListenersStats();
            console.log('🎯 Events Stats:', results.eventStats);
            
            // 7. Storage и кэши
            results.storageStats = await this.getStorageStats();
            console.log('💾 Storage Stats:', results.storageStats);
            
            // 8. Анализ и рекомендации
            results.analysis = this.analyzeResults(results);
            console.log('🎯 АНАЛИЗ И РЕКОМЕНДАЦИИ:', results.analysis);
            
            // 9. Оценка размера утечек
            results.memoryEstimate = this.estimateMemoryUsage(results);
            console.log('📏 ОЦЕНКА ПАМЯТИ:', results.memoryEstimate);
            
            console.log('✅ ===== ДИАГНОСТИКА ЗАВЕРШЕНА =====');
            
            return results;
            
        } catch (error) {
            console.error('❌ Ошибка при диагностике:', error);
            return { error: error.message, partialResults: results };
        }
    }
    
    /**
     * 📊 Получение статистики JavaScript heap
     */
    static getJavaScriptMemory() {
        if (!window.performance || !window.performance.memory) {
            return { error: 'performance.memory не доступен' };
        }
        
        const memory = window.performance.memory;
        return {
            used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
            total: Math.round(memory.totalJSHeapSize / 1024 / 1024), 
            limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
            usedFormatted: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)} МБ`,
            totalFormatted: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)} МБ`
        };
    }
    
    /**
     * 🌐 Статистика DOM элементов
     */
    static getDOMStats() {
        const allElements = document.querySelectorAll('*');
        const hiddenElements = document.querySelectorAll('[style*="display: none"], .hidden, [hidden]');
        const markers = document.querySelectorAll('.leaflet-marker-icon');
        const popups = document.querySelectorAll('.leaflet-popup');
        const canvasElements = document.querySelectorAll('canvas');
        const svgElements = document.querySelectorAll('svg');
        const tables = document.querySelectorAll('table');
        const forms = document.querySelectorAll('form');
        const images = document.querySelectorAll('img');
        
        // Поиск больших контейнеров
        const largeContainers = [];
        const containers = document.querySelectorAll('div, ul, ol, table, form, section');
        containers.forEach((container, i) => {
            if (container.children.length > 100) {
                largeContainers.push({
                    element: container.tagName.toLowerCase(),
                    childrenCount: container.children.length,
                    className: container.className || 'нет класса',
                    id: container.id || 'нет ID'
                });
            }
        });
        
        return {
            totalElements: allElements.length,
            hiddenElements: hiddenElements.length,
            leafletMarkers: markers.length,
            leafletPopups: popups.length,
            canvasElements: canvasElements.length,
            svgElements: svgElements.length,
            tables: tables.length,
            forms: forms.length,
            images: images.length,
            largeContainers: largeContainers.slice(0, 10), // топ-10 больших контейнеров
            hiddenPercentage: Math.round((hiddenElements.length / allElements.length) * 100)
        };
    }
    
    /**
     * 🗺️ Статистика Leaflet карт
     */
    static getLeafletStats() {
        if (!window.map) {
            return { error: 'Leaflet карта не найдена (window.map)' };
        }
        
        try {
            const layers = window.map._layers ? Object.keys(window.map._layers).length : 0;
            const markers = document.querySelectorAll('.leaflet-marker-icon').length;
            const popups = document.querySelectorAll('.leaflet-popup').length;
            const tooltips = document.querySelectorAll('.leaflet-tooltip').length;
            
            // Попытка получить маркеры из MarkerClusterGroup если есть
            let clusterGroupMarkers = 0;
            if (window.map.eachLayer) {
                window.map.eachLayer(layer => {
                    if (layer.getAllChildMarkers && typeof layer.getAllChildMarkers === 'function') {
                        clusterGroupMarkers += layer.getAllChildMarkers().length;
                    }
                });
            }
            
            // Оценка памяти маркеров (каждый DOM маркер ~2-5КБ)
            const estimatedMarkerMemoryKB = markers * 3; // 3КБ на маркер в среднем
            const estimatedMarkerMemoryMB = Math.round(estimatedMarkerMemoryKB / 1024);
            
            return {
                mapExists: true,
                layers: layers,
                domMarkers: markers,
                clusterGroupMarkers: clusterGroupMarkers,
                popups: popups,
                tooltips: tooltips,
                estimatedMarkerMemoryKB: estimatedMarkerMemoryKB,
                estimatedMarkerMemoryMB: estimatedMarkerMemoryMB,
                isMemoryHeavy: markers > 5000, // флаг "тяжёлой" карты
                recommendation: markers > 1000 ? 'КРИТИЧНО: Используйте кластеризацию маркеров!' : 'OK'
            };
        } catch (error) {
            return { error: `Ошибка анализа Leaflet: ${error.message}` };
        }
    }
    
    /**
     * 📈 Статистика ApexCharts
     */
    static getApexChartsStats() {
        const instances = window.Apex?.instances?.length || 0;
        const canvasCount = document.querySelectorAll('canvas').length;
        const svgCount = document.querySelectorAll('svg').length;
        const chartsContainers = document.querySelectorAll('.apexcharts-canvas').length;
        const chartsGraphics = document.querySelectorAll('.apexcharts-svg').length;
        
        // Поиск графиков ApexCharts
        const apexElements = document.querySelectorAll('[id*="apex"], .apexcharts-canvas, .apexcharts-svg');
        
        // Оценка размера данных в графиках
        const chartDataEstimate = chartsContainers * 50; // ~50КБ на график
        
        return {
            apexInstances: instances,
            canvasElements: canvasCount,
            svgElements: svgCount,
            chartsContainers: chartsContainers,
            chartsGraphics: chartsGraphics,
            apexElements: apexElements.length,
            estimatedChartMemoryKB: chartDataEstimate,
            estimatedChartMemoryMB: Math.round(chartDataEstimate / 1024),
            recommendation: chartsContainers > 10 ? 'Очищайте неиспользуемые графики' : 'OK'
        };
    }
    
    /**
     * 📋 Статистика DataTables
     */
    static getDataTablesStats() {
        const tables = document.querySelectorAll('table');
        let totalRows = 0;
        let totalCells = 0;
        const tableDetails = [];
        
        tables.forEach((table, i) => {
            const rows = table.rows.length;
            const cells = table.querySelectorAll('td, th').length;
            totalRows += rows;
            totalCells += cells;
            
            if (rows > 50 || cells > 200) { // большие таблицы
                tableDetails.push({
                    index: i,
                    rows: rows,
                    cells: cells,
                    className: table.className || 'нет класса',
                    id: table.id || 'нет ID'
                });
            }
        });
        
        // DataTables instances если доступно
        let dataTablesInstances = 0;
        if (window.$ && window.$.fn && window.$.fn.DataTable) {
            try {
                dataTablesInstances = window.$.fn.DataTable.tables().length;
            } catch (e) {
                // игнорируем ошибки
            }
        }
        
        // Оценка памяти таблиц (0.1КБ на ячейку)
        const estimatedTableMemoryKB = totalCells * 0.1;
        
        return {
            tablesCount: tables.length,
            totalRows: totalRows,
            totalCells: totalCells,
            dataTablesInstances: dataTablesInstances,
            largeTablesDetails: tableDetails,
            estimatedTableMemoryKB: Math.round(estimatedTableMemoryKB),
            estimatedTableMemoryMB: Math.round(estimatedTableMemoryKB / 1024),
            recommendation: totalCells > 10000 ? 'Используйте серверную пагинацию' : 'OK'
        };
    }
    
    /**
     * 🎯 Статистика Event Listeners (упрощённая)
     */
    static getEventListenersStats() {
        // Поиск элементов с inline обработчиками
        const elementsWithInlineEvents = document.querySelectorAll(
            '[onclick], [onchange], [onsubmit], [onload], [onmouseover], [onmouseout], [onfocus], [onblur]'
        ).length;
        
        // Поиск элементов с потенциально большим количеством обработчиков
        const interactiveElements = document.querySelectorAll(
            'button, input, select, textarea, a, [role="button"], .btn, [data-toggle]'
        ).length;
        
        return {
            elementsWithInlineEvents: elementsWithInlineEvents,
            interactiveElements: interactiveElements,
            warning: 'Для полного анализа event listeners используйте Chrome DevTools',
            recommendation: elementsWithInlineEvents > 100 ? 'Проверьте утечки event listeners' : 'OK'
        };
    }
    
    /**
     * 💾 Статистика хранилища и кэшей
     */
    static async getStorageStats() {
        const stats = {};
        
        // Storage API
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                stats.storageUsage = Math.round(estimate.usage / 1024 / 1024); // МБ
                stats.storageQuota = Math.round(estimate.quota / 1024 / 1024); // МБ
            } catch (e) {
                stats.storageError = e.message;
            }
        }
        
        // Кэши приложения
        if (window.dataCacheManager) {
            stats.dataCacheSize = window.dataCacheManager.cache.size;
        }
        
        if (window.localEmbeddingService) {
            stats.embeddingCacheSize = window.localEmbeddingService.vectorCache ? 
                window.localEmbeddingService.vectorCache.cache?.size || 0 : 0;
        }
        
        return stats;
    }
    
    /**
     * 🎯 Анализ результатов и генерация рекомендаций
     */
    static analyzeResults(results) {
        const recommendations = [];
        const criticalIssues = [];
        const warnings = [];
        
        // Анализ DOM маркеров Leaflet
        if (results.mapStats && results.mapStats.domMarkers > 1000) {
            criticalIssues.push(`🚨 КРИТИЧНО: ${results.mapStats.domMarkers} DOM маркеров Leaflet`);
            recommendations.push('1. Немедленно внедрите кластеризацию маркеров Leaflet');
            recommendations.push('2. Показывайте только маркеры в текущем viewport');
        }
        
        // Анализ общего количества DOM элементов
        if (results.domStats && results.domStats.totalElements > 15000) {
            criticalIssues.push(`🚨 Слишком много DOM элементов: ${results.domStats.totalElements}`);
            recommendations.push('3. Используйте виртуализацию для больших списков');
        }
        
        // Анализ скрытых элементов
        if (results.domStats && results.domStats.hiddenPercentage > 30) {
            warnings.push(`⚠️ Много скрытых элементов: ${results.domStats.hiddenPercentage}%`);
            recommendations.push('4. Удаляйте неиспользуемые скрытые элементы из DOM');
        }
        
        // Анализ графиков
        if (results.chartStats && results.chartStats.chartsContainers > 10) {
            warnings.push(`⚠️ Много ApexCharts: ${results.chartStats.chartsContainers}`);
            recommendations.push('5. Уничтожайте неиспользуемые графики (.destroy())');
        }
        
        // Анализ таблиц
        if (results.tableStats && results.tableStats.totalCells > 5000) {
            warnings.push(`⚠️ Много ячеек в таблицах: ${results.tableStats.totalCells}`);
            recommendations.push('6. Внедрите серверную пагинацию для больших таблиц');
        }
        
        return {
            criticalIssues: criticalIssues,
            warnings: warnings,
            recommendations: recommendations,
            overallStatus: criticalIssues.length > 0 ? 'КРИТИЧНО' : 
                          warnings.length > 0 ? 'ТРЕБУЕТ ВНИМАНИЯ' : 'OK'
        };
    }
    
    /**
     * 📏 Оценка потребления памяти различными компонентами
     */
    static estimateMemoryUsage(results) {
        const estimates = {};
        let totalEstimatedMB = 0;
        
        // Leaflet маркеры
        if (results.mapStats && results.mapStats.estimatedMarkerMemoryMB) {
            estimates.leafletMarkers = results.mapStats.estimatedMarkerMemoryMB;
            totalEstimatedMB += results.mapStats.estimatedMarkerMemoryMB;
        }
        
        // ApexCharts
        if (results.chartStats && results.chartStats.estimatedChartMemoryMB) {
            estimates.apexCharts = results.chartStats.estimatedChartMemoryMB;
            totalEstimatedMB += results.chartStats.estimatedChartMemoryMB;
        }
        
        // DataTables
        if (results.tableStats && results.tableStats.estimatedTableMemoryMB) {
            estimates.dataTables = results.tableStats.estimatedTableMemoryMB;
            totalEstimatedMB += results.tableStats.estimatedTableMemoryMB;
        }
        
        // JavaScript heap
        if (results.jsMemory && results.jsMemory.used) {
            estimates.jsHeap = results.jsMemory.used;
            totalEstimatedMB += results.jsMemory.used;
        }
        
        return {
            estimates: estimates,
            totalEstimatedMB: totalEstimatedMB,
            breakdown: {
                jsHeap: estimates.jsHeap || 0,
                leafletMarkers: estimates.leafletMarkers || 0,
                apexCharts: estimates.apexCharts || 0, 
                dataTables: estimates.dataTables || 0
            }
        };
    }
    
    /**
     * 🚀 Быстрая диагностика маркеров (для немедленной проверки)
     */
    static quickMarkersCheck() {
        console.log('🔍 === БЫСТРАЯ ПРОВЕРКА МАРКЕРОВ ===');
        
        const markers = document.querySelectorAll('.leaflet-marker-icon').length;
        const popups = document.querySelectorAll('.leaflet-popup').length;
        const estimatedMemoryMB = Math.round(markers * 3 / 1024); // 3КБ на маркер
        
        console.log(`🗺️ DOM маркеров: ${markers}`);
        console.log(`💬 Всплывающих окон: ${popups}`);
        console.log(`📏 Оценка памяти маркеров: ~${estimatedMemoryMB} МБ`);
        
        if (markers > 10000) {
            console.log('🚨 КРИТИЧНО: Слишком много маркеров! Это главная причина утечки памяти.');
            console.log('💡 РЕШЕНИЕ: Внедрите кластеризацию маркеров немедленно');
        } else if (markers > 5000) {
            console.log('⚠️ ВНИМАНИЕ: Много маркеров, рекомендуется оптимизация');
        } else {
            console.log('✅ Количество маркеров в норме');
        }
        
        return { markers, popups, estimatedMemoryMB };
    }
    
    /**
     * 🧹 Экстренная очистка маркеров (для тестирования)
     */
    static emergencyMarkerCleanup() {
        console.log('🧹 === ЭКСТРЕННАЯ ОЧИСТКА МАРКЕРОВ ===');
        console.log('⚠️ ВНИМАНИЕ: Это скроет все маркеры для проверки памяти');
        
        const markers = document.querySelectorAll('.leaflet-marker-icon');
        console.log(`🗺️ Найдено маркеров для скрытия: ${markers.length}`);
        
        markers.forEach(marker => {
            marker.style.display = 'none';
        });
        
        console.log('✅ Все маркеры скрыты');
        console.log('📊 Проверьте память в Chrome Task Manager через 30 секунд');
        console.log('🔄 Для восстановления обновите страницу');
        
        return markers.length;
    }
}

// Глобальная регистрация для использования в консоли
window.MemoryDiagnosticsTool = MemoryDiagnosticsTool;

// Автоматический запуск быстрой проверки при загрузке (только если включена отладка)
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        // Проверяем настройки отладки
        const debugEnabled = localStorage.getItem('neocenka_debug') === 'true' ||
                           sessionStorage.getItem('debug') === 'true';
        
        if (debugEnabled) {
            console.log('🔍 MemoryDiagnosticsTool загружен');
            console.log('💡 Для запуска диагностики используйте:');
            console.log('   MemoryDiagnosticsTool.runFullDiagnostics()');
            console.log('   MemoryDiagnosticsTool.quickMarkersCheck()');
        }
    });
}