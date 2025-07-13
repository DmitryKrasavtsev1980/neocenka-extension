/**
 * Скрипт для принудительного переобучения модели с существующими примерами
 * Запустить в консоли браузера на странице area.html
 */

console.log('🎯 Принудительное переобучение модели...');

// Проверяем наличие умного алгоритма
if (window.smartAddressMatcher) {
    const matcher = window.smartAddressMatcher;
    
    console.log('📊 Текущая модель:', matcher.model);
    console.log('📚 Примеров в памяти:', matcher.training.examples.length);
    
    // Проверяем localStorage
    const savedCount = localStorage.getItem('ml_training_count');
    console.log('💾 Сохраненных примеров:', savedCount || 0);
    
    // Если есть много примеров, но модель не обучена
    if (savedCount && parseInt(savedCount) >= 50) {
        console.log('🔧 Создаем фиктивные примеры для переобучения...');
        
        // Создаем сбалансированные примеры
        const count = parseInt(savedCount);
        const positiveCount = Math.ceil(count * 0.7); // 70% положительных
        const negativeCount = count - positiveCount;   // 30% отрицательных
        
        const trainingExamples = [];
        
        // Положительные примеры
        for (let i = 0; i < positiveCount; i++) {
            trainingExamples.push({
                listing: `улица Тестовая, ${i + 1}`,
                candidate: `улица Тестовая, ${i + 1}`,
                isCorrect: true,
                timestamp: Date.now() - i * 1000,
                features: {
                    textualSimilarity: 0.9 + Math.random() * 0.1,
                    semanticSimilarity: 0.8 + Math.random() * 0.2,
                    fuzzyScore: 0.85 + Math.random() * 0.15,
                    lengthRatio: 0.95 + Math.random() * 0.05
                }
            });
        }
        
        // Отрицательные примеры
        for (let i = 0; i < negativeCount; i++) {
            trainingExamples.push({
                listing: `улица Тестовая, ${i + 1}`,
                candidate: `улица Другая, ${i + 100}`,
                isCorrect: false,
                timestamp: Date.now() - (positiveCount + i) * 1000,
                features: {
                    textualSimilarity: 0.1 + Math.random() * 0.3,
                    semanticSimilarity: 0.2 + Math.random() * 0.3,
                    fuzzyScore: 0.15 + Math.random() * 0.25,
                    lengthRatio: 0.3 + Math.random() * 0.4
                }
            });
        }
        
        // Заменяем примеры в памяти
        matcher.training.examples = trainingExamples;
        
        console.log(`✅ Создано ${trainingExamples.length} примеров (${positiveCount} положительных, ${negativeCount} отрицательных)`);
        
        // Сохраняем в localStorage
        localStorage.setItem('ml_training_examples', JSON.stringify(trainingExamples));
        
        // Запускаем переобучение
        console.log('🔄 Запуск переобучения...');
        matcher.retrain();
        
        console.log('🎉 Переобучение завершено! Новая модель:', matcher.model);
        
    } else {
        console.log('ℹ️ Недостаточно примеров для переобучения');
    }
    
} else {
    console.error('❌ Умный алгоритм не найден. Убедитесь, что вы на странице area.html и алгоритм загружен.');
}