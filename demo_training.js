/**
 * Демонстрация обучения модели с тестовыми примерами
 * Запустить в консоли браузера на странице area.html или settings.html
 */

console.log('🎯 ДЕМОНСТРАЦИЯ ОБУЧЕНИЯ МОДЕЛИ');

if (!window.smartAddressMatcher) {
    console.error('❌ SmartAddressMatcher не найден. Сначала загрузите его на странице area.html');
    console.log('💡 Нажмите "🧠 Определить адреса (умный ML)" и вернитесь');
} else {
    const matcher = window.smartAddressMatcher;
    
    console.log('\n📊 ТЕКУЩЕЕ СОСТОЯНИЕ МОДЕЛИ:');
    console.log('Версия:', matcher.model.version);
    console.log('Примеров в памяти:', matcher.training.examples.length);
    
    // Показываем текущие веса
    console.log('\n🔢 ТЕКУЩИЕ ВЕСА:');
    for (const [key, value] of Object.entries(matcher.model.weights)) {
        console.log(`  ${key}: ${value.toFixed(3)}`);
    }
    
    // Создаем сбалансированные тестовые примеры
    console.log('\n🔧 СОЗДАНИЕ ТЕСТОВЫХ ПРИМЕРОВ...');
    
    const testExamples = [];
    
    // 15 положительных примеров (хорошие совпадения)
    for (let i = 0; i < 15; i++) {
        testExamples.push({
            listing: `Тестовая улица, дом ${i + 1}`,
            candidate: `Тестовая улица, дом ${i + 1}`,
            isCorrect: true,
            timestamp: Date.now() - i * 60000,
            features: {
                textualSimilarity: 0.85 + Math.random() * 0.15,
                semanticSimilarity: 0.80 + Math.random() * 0.20,
                structuralSimilarity: 0.90 + Math.random() * 0.10,
                fuzzyScore: 0.88 + Math.random() * 0.12,
                lengthRatio: 0.95 + Math.random() * 0.05
            }
        });
    }
    
    // 10 отрицательных примеров (плохие совпадения)  
    for (let i = 0; i < 10; i++) {
        testExamples.push({
            listing: `Тестовая улица, дом ${i + 1}`,
            candidate: `Совсем другая улица, дом ${i + 100}`,
            isCorrect: false,
            timestamp: Date.now() - (15 + i) * 60000,
            features: {
                textualSimilarity: 0.05 + Math.random() * 0.25,
                semanticSimilarity: 0.10 + Math.random() * 0.30,
                structuralSimilarity: 0.15 + Math.random() * 0.25,
                fuzzyScore: 0.08 + Math.random() * 0.22,
                lengthRatio: 0.20 + Math.random() * 0.50
            }
        });
    }
    
    console.log(`✅ Создано ${testExamples.length} тестовых примеров (15 положительных, 10 отрицательных)`);
    
    // Сохраняем старые значения для сравнения
    const oldWeights = { ...matcher.model.weights };
    const oldThresholds = { ...matcher.model.thresholds };
    const oldVersion = matcher.model.version;
    
    // Добавляем примеры в систему
    matcher.training.examples = testExamples;
    
    // Сохраняем в localStorage
    localStorage.setItem('ml_training_examples', JSON.stringify(testExamples));
    localStorage.setItem('ml_training_count', testExamples.length.toString());
    
    console.log('\n🔄 ЗАПУСК ПЕРЕОБУЧЕНИЯ...');
    matcher.retrain();
    
    console.log('\n🎉 РЕЗУЛЬТАТЫ ОБУЧЕНИЯ:');
    console.log(`📈 Версия: ${oldVersion} → ${matcher.model.version}`);
    
    console.log('\n📊 ИЗМЕНЕНИЯ ВЕСОВ:');
    let weightsChanged = false;
    for (const [key, newValue] of Object.entries(matcher.model.weights)) {
        const oldValue = oldWeights[key];
        const change = newValue - oldValue;
        const changePercent = (change * 100).toFixed(1);
        const changed = Math.abs(change) > 0.001;
        
        if (changed) weightsChanged = true;
        
        console.log(`  ${key}: ${oldValue.toFixed(3)} → ${newValue.toFixed(3)} ${changed ? `(${changePercent > 0 ? '+' : ''}${changePercent}%)` : '(без изменений)'}`);
    }
    
    console.log('\n📊 ИЗМЕНЕНИЯ ПОРОГОВ:');
    let thresholdsChanged = false;
    for (const [key, newValue] of Object.entries(matcher.model.thresholds)) {
        const oldValue = oldThresholds[key];
        const change = newValue - oldValue;
        const changed = Math.abs(change) > 0.001;
        
        if (changed) thresholdsChanged = true;
        
        console.log(`  ${key}: ${oldValue.toFixed(3)} → ${newValue.toFixed(3)} ${changed ? '(изменился)' : '(без изменений)'}`);
    }
    
    if (weightsChanged || thresholdsChanged) {
        console.log('\n✅ МОДЕЛЬ УСПЕШНО ОБУЧЕНА!');
        console.log('💡 Теперь перейдите в Настройки и нажмите "Экспортировать модель" чтобы увидеть изменения');
    } else {
        console.log('\n⚠️  Модель не изменилась. Возможные причины:');
        console.log('   1. Алгоритм оптимизации не нашел улучшений');
        console.log('   2. Learning rate слишком мал');
        console.log('   3. Примеры недостаточно разнообразны');
    }
    
    console.log('\n📈 КОЛИЧЕСТВО ПРИМЕРОВ ДЛЯ СЛЕДУЮЩЕГО ОБУЧЕНИЯ:', matcher.training.examples.length + 50);
}