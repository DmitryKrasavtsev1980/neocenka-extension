/**
 * Диагностика системы обучения
 * Запустить в консоли браузера на странице area.html или settings.html
 */

console.log('🔍 ДИАГНОСТИКА СИСТЕМЫ ОБУЧЕНИЯ');

// Проверяем localStorage
console.log('\n💾 ПРОВЕРКА LOCALSTORAGE:');
const savedCount = localStorage.getItem('ml_training_count');
const savedExamples = localStorage.getItem('ml_training_examples');

console.log('Сохраненный счетчик:', savedCount);
console.log('Сохраненные примеры:', savedExamples ? 'есть' : 'НЕТ');

if (savedExamples) {
    try {
        const examples = JSON.parse(savedExamples);
        console.log('Количество реальных примеров:', examples.length);
        console.log('Первый пример:', examples[0]);
    } catch (e) {
        console.log('Ошибка парсинга примеров:', e);
    }
}

// Проверяем SmartAddressMatcher
console.log('\n🧠 ПРОВЕРКА SMARTADDRESSMATCHER:');
if (window.smartAddressMatcher) {
    const matcher = window.smartAddressMatcher;
    console.log('SmartAddressMatcher загружен:', 'ДА');
    console.log('Примеров в памяти:', matcher.training.examples.length);
    console.log('Обучение включено:', matcher.training.enabled);
    
    if (matcher.training.examples.length > 0) {
        const positive = matcher.training.examples.filter(ex => ex.isCorrect).length;
        const negative = matcher.training.examples.filter(ex => !ex.isCorrect).length;
        console.log('Положительных примеров:', positive);
        console.log('Отрицательных примеров:', negative);
        
        // Проверяем, можно ли переобучать
        if (positive >= 5 && negative >= 5 && matcher.training.examples.length >= 20) {
            console.log('✅ Достаточно примеров для переобучения');
            console.log('🔄 Пробуем принудительное переобучение...');
            
            const oldVersion = matcher.model.version;
            const oldWeights = {...matcher.model.weights};
            
            matcher.retrain();
            
            console.log('Версия изменилась?', oldVersion, '→', matcher.model.version);
            console.log('Веса изменились?');
            for (const [key, newValue] of Object.entries(matcher.model.weights)) {
                const oldValue = oldWeights[key];
                const changed = Math.abs(newValue - oldValue) > 0.001;
                console.log(`  ${key}: ${changed ? 'ДА' : 'НЕТ'} (${oldValue.toFixed(3)} → ${newValue.toFixed(3)})`);
            }
        } else {
            console.log('❌ Недостаточно примеров для переобучения');
            console.log('Нужно: ≥5 положительных, ≥5 отрицательных, ≥20 общих');
        }
    } else {
        console.log('❌ В памяти нет примеров для обучения');
    }
} else {
    console.log('SmartAddressMatcher загружен:', 'НЕТ');
    console.log('💡 Попробуйте сначала нажать "🧠 Определить адреса (умный ML)" на странице area.html');
}

// Рекомендации
console.log('\n💡 РЕКОМЕНДАЦИИ:');
if (!savedExamples && savedCount) {
    console.log('1. У вас есть счетчик примеров, но сами данные потеряны');
    console.log('2. Система будет заново собирать примеры с нуля');
    console.log('3. Для видимого обучения нужно добавить еще примеров подтверждений');
}

if (window.smartAddressMatcher && window.smartAddressMatcher.training.examples.length < 20) {
    console.log('4. Создать тестовые примеры для демонстрации обучения');
}