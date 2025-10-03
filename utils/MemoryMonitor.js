/**
 * Мониторинг использования памяти в реальном времени
 * Помогает отслеживать эффективность оптимизации кэширования
 */
class MemoryMonitor {
    constructor() {
        this.measurements = [];
        this.isMonitoring = false;
        this.alertThreshold = 500 * 1024 * 1024; // 500MB предупреждение
        this.criticalThreshold = 1024 * 1024 * 1024; // 1GB критический уровень
        this.intervalId = null;
        
        // Счетчики для статистики
        this.stats = {
            alerts: 0,
            criticalAlerts: 0,
            cleanupTriggers: 0,
            maxMemoryUsed: 0
        };
        
    }

    /**
     * Получение текущего использования памяти
     */
    static getCurrentMemoryUsage() {
        if ('memory' in performance) {
            const usage = {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024), // MB
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024), // MB
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024), // MB
                timestamp: Date.now(),
                usagePercent: Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100)
            };
            return usage;
        }
        return null;
    }

    /**
     * Запуск мониторинга
     */
    startMonitoring(intervalMs = 10000) {
        if (this.isMonitoring) {
            console.warn('⚠️ [MemoryMonitor] Мониторинг уже запущен');
            return;
        }
        
        this.isMonitoring = true;
        
        this.intervalId = setInterval(() => {
            const usage = MemoryMonitor.getCurrentMemoryUsage();
            if (usage) {
                this.measurements.push(usage);
                
                // Обновляем максимальное потребление
                if (usage.used > this.stats.maxMemoryUsed) {
                    this.stats.maxMemoryUsed = usage.used;
                }
                
                // Оставляем только последние 100 измерений
                if (this.measurements.length > 100) {
                    this.measurements.shift();
                }
                
                // Проверяем пороги
                this.checkThresholds(usage);
                
                // Логируем состояние
                this.logMemoryStatus(usage);
            }
        }, intervalMs);
        
    }

    /**
     * Проверка превышения порогов
     */
    checkThresholds(usage) {
        const usageBytes = usage.used * 1024 * 1024;
        
        if (usageBytes > this.criticalThreshold) {
            this.stats.criticalAlerts++;
            console.error(`🚨 [MemoryMonitor] КРИТИЧЕСКОЕ превышение памяти: ${usage.used}MB (${usage.usagePercent}%)`);
            this.triggerEmergencyCleanup();
        } else if (usageBytes > this.alertThreshold) {
            this.stats.alerts++;
            console.warn(`⚠️ [MemoryMonitor] Предупреждение о памяти: ${usage.used}MB (${usage.usagePercent}%)`);
            this.triggerMemoryCleanup();
        }
    }

    /**
     * Логирование состояния памяти
     */
    logMemoryStatus(usage) {
        // Логирование отключено для снижения количества сообщений в консоли
        
        // Дополнительная статистика каждые 10 измерений
        if (this.measurements.length % 10 === 0) {
            this.logDetailedStats();
        }
    }

    /**
     * Получение уровня использования памяти
     */
    getMemoryLevel(usagePercent) {
        if (usagePercent >= 80) return 'КРИТИЧЕСКИЙ';
        if (usagePercent >= 60) return 'ВЫСОКИЙ';
        if (usagePercent >= 40) return 'СРЕДНИЙ';
        if (usagePercent >= 20) return 'НИЗКИЙ';
        return 'ОПТИМАЛЬНЫЙ';
    }

    /**
     * Получение эмодзи для уровня памяти
     */
    getMemoryEmoji(level) {
        const emojis = {
            'КРИТИЧЕСКИЙ': '🚨',
            'ВЫСОКИЙ': '⚠️',
            'СРЕДНИЙ': '📊',
            'НИЗКИЙ': '✅',
            'ОПТИМАЛЬНЫЙ': '🟢'
        };
        return emojis[level] || '📊';
    }

    /**
     * Подробная статистика
     */
    logDetailedStats() {
        const stats = this.getStats();
        
        console.log(`📈 [Memory Stats] Avg: ${stats.average}MB, Max: ${stats.max}MB, Trend: ${stats.trend}`);
        
        // Статистика по кэшам
        this.logCacheStats();
    }

    /**
     * Статистика по кэшам
     */
    logCacheStats() {
        if (window.dataCacheManager) {
            const cacheStats = window.dataCacheManager.getStats();
            console.log(`💾 [Cache Stats] Entries: ${cacheStats.totalEntries}, Memory: ${cacheStats.memoryUsageMB}MB`);
        }
        
        if (window.localEmbeddingService) {
            const embeddingStats = window.localEmbeddingService.getCacheStats();
            console.log(`🧠 [Embedding Cache] Vectors: ${embeddingStats.totalEntries}, Tokenizers: ${embeddingStats.loadedTokenizers}`);
        }
    }

    /**
     * Остановка мониторинга  
     */
    stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isMonitoring = false;
            console.log('🛑 [MemoryMonitor] Мониторинг остановлен');
        }
    }

    /**
     * Запуск обычной очистки памяти
     */
    triggerMemoryCleanup() {
        console.log('🧹 [MemoryMonitor] Запуск автоматической очистки памяти...');
        this.stats.cleanupTriggers++;
        
        // Очищаем кэш данных (частично)
        if (window.dataCacheManager) {
            const oldSize = window.dataCacheManager.cache.size;
            window.dataCacheManager.evictLRU(Math.floor(oldSize * 0.2)); // Удаляем 20%
        }
        
        console.log('✅ [MemoryMonitor] Автоочистка завершена');
    }

    /**
     * Экстренная очистка памяти при критическом уровне
     */
    triggerEmergencyCleanup() {
        console.error('🚨 [MemoryMonitor] ЭКСТРЕННАЯ очистка памяти!');
        
        // Агрессивная очистка кэша данных
        if (window.dataCacheManager) {
            const oldSize = window.dataCacheManager.cache.size;
            window.dataCacheManager.evictLRU(Math.floor(oldSize * 0.5)); // Удаляем 50%
        }
        
        // Очищаем AI кэши
        if (window.localEmbeddingService) {
            window.localEmbeddingService.clearCache();
        }
        
        // Принудительная сборка мусора (если доступна)
        if (typeof gc === 'function') {
            gc();
            console.log('🗑️ [MemoryMonitor] Принудительная сборка мусора выполнена');
        }
        
        console.log('✅ [MemoryMonitor] Экстренная очистка завершена');
    }

    /**
     * Получение статистики использования памяти
     */
    getStats() {
        if (this.measurements.length === 0) return null;
        
        const latest = this.measurements[this.measurements.length - 1];
        const usages = this.measurements.map(m => m.used);
        
        // Тренд (сравнение последних 10 измерений с предыдущими 10)
        let trend = 'стабильный';
        if (this.measurements.length >= 20) {
            const recent = usages.slice(-10);
            const previous = usages.slice(-20, -10);
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
            
            if (recentAvg > previousAvg * 1.1) trend = 'растущий';
            else if (recentAvg < previousAvg * 0.9) trend = 'снижающийся';
        }
        
        return {
            current: latest,
            average: Math.round(usages.reduce((a, b) => a + b, 0) / usages.length),
            max: Math.max(...usages),
            min: Math.min(...usages),
            measurementCount: this.measurements.length,
            trend,
            alerts: this.stats.alerts,
            criticalAlerts: this.stats.criticalAlerts,
            cleanupTriggers: this.stats.cleanupTriggers,
            maxMemoryUsed: this.stats.maxMemoryUsed
        };
    }

    /**
     * Получение детального отчета
     */
    getDetailedReport() {
        const stats = this.getStats();
        if (!stats) return null;
        
        return {
            ...stats,
            thresholds: {
                alert: Math.round(this.alertThreshold / 1024 / 1024),
                critical: Math.round(this.criticalThreshold / 1024 / 1024)
            },
            cacheStats: window.dataCacheManager ? window.dataCacheManager.getStats() : null,
            embeddingStats: window.localEmbeddingService ? window.localEmbeddingService.getCacheStats() : null,
            recommendations: this.generateRecommendations(stats)
        };
    }

    /**
     * Генерация рекомендаций по оптимизации
     */
    generateRecommendations(stats) {
        const recommendations = [];
        
        if (stats.maxMemoryUsed > 1000) {
            recommendations.push('Рассмотрите увеличение интервала очистки кэша');
        }
        
        if (stats.criticalAlerts > 0) {
            recommendations.push('Критические превышения памяти - необходима архитектурная оптимизация');
        }
        
        if (stats.trend === 'растущий') {
            recommendations.push('Обнаружена утечка памяти - проверьте кэши и event listeners');
        }
        
        if (stats.cleanupTriggers > 10) {
            recommendations.push('Частые автоочистки - уменьшите размеры кэшей по умолчанию');
        }
        
        return recommendations;
    }

    /**
     * Экспорт данных мониторинга
     */
    exportData() {
        return {
            measurements: this.measurements,
            stats: this.getStats(),
            detailedReport: this.getDetailedReport(),
            config: {
                alertThreshold: Math.round(this.alertThreshold / 1024 / 1024),
                criticalThreshold: Math.round(this.criticalThreshold / 1024 / 1024),
                isMonitoring: this.isMonitoring
            }
        };
    }

    /**
     * Настройка порогов предупреждений
     */
    setThresholds(alertMB, criticalMB) {
        this.alertThreshold = alertMB * 1024 * 1024;
        this.criticalThreshold = criticalMB * 1024 * 1024;
        
        console.log(`⚙️ [MemoryMonitor] Обновлены пороги: Alert=${alertMB}MB, Critical=${criticalMB}MB`);
    }

    /**
     * Принудительная проверка памяти
     */
    checkMemoryNow() {
        const usage = MemoryMonitor.getCurrentMemoryUsage();
        if (usage) {
            console.log(`🔍 [MemoryMonitor] Текущее состояние:`);
            console.log(`   Использовано: ${usage.used}MB (${usage.usagePercent}%)`);
            console.log(`   Доступно: ${usage.limit}MB`);
            console.log(`   Уровень: ${this.getMemoryLevel(usage.usagePercent)}`);
            
            this.checkThresholds(usage);
            return usage;
        }
        
        console.warn('⚠️ [MemoryMonitor] Performance API недоступен');
        return null;
    }

    /**
     * Создание визуального отчета в консоли
     */
    printVisualReport() {
        const stats = this.getStats();
        if (!stats) {
            console.log('📊 [MemoryMonitor] Нет данных для отчета');
            return;
        }

        console.log('📊 ═══ ОТЧЕТ ПО ПАМЯТИ ═══');
        console.log(`📈 Текущее: ${stats.current.used}MB (${stats.current.usagePercent}%)`);
        console.log(`📊 Среднее: ${stats.average}MB`);
        console.log(`🔝 Максимум: ${stats.max}MB`);
        console.log(`📉 Минимум: ${stats.min}MB`);
        console.log(`📈 Тренд: ${stats.trend}`);
        console.log(`⚠️ Предупреждения: ${stats.alerts}`);
        console.log(`🚨 Критические: ${stats.criticalAlerts}`);
        console.log(`🧹 Автоочистки: ${stats.cleanupTriggers}`);
        console.log('═══════════════════════════');
        
        // Рекомендации
        const recommendations = this.generateRecommendations(stats);
        if (recommendations.length > 0) {
            console.log('💡 РЕКОМЕНДАЦИИ:');
            recommendations.forEach(rec => console.log(`   • ${rec}`));
        }
    }
}

// Создаем глобальный экземпляр MemoryMonitor
window.memoryMonitor = new MemoryMonitor();

// Автозапуск мониторинга при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Запускаем мониторинг с интервалом 15 секунд
    window.memoryMonitor.startMonitoring(15000);
    
});

// Экспорт для использования в других модулях
window.MemoryMonitor = MemoryMonitor;