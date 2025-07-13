/**
 * Поиск реальных нарушений правила близости (≤20м = 90% точность)
 */

const fs = require('fs');

// Читаем данные
const listingsData = JSON.parse(fs.readFileSync('./example/example-listings.json', 'utf8'));
const addressesData = JSON.parse(fs.readFileSync('./example/example-addresses.json', 'utf8'));

/**
 * Расчет расстояния Haversine
 */
function calculateDistance(coord1, coord2) {
    const R = 6371000;
    const lat1Rad = (coord1.lat * Math.PI) / 180;
    const lat2Rad = (coord2.lat * Math.PI) / 180;
    const deltaLatRad = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const deltaLngRad = ((coord2.lng - coord1.lng) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

console.log('🔍 ПОИСК РЕАЛЬНЫХ НАРУШЕНИЙ ПРАВИЛА БЛИЗОСТИ\n');

let totalViolations = 0;
let realProximityViolations = 0;

// Проверим каждое объявление с определенным адресом
listingsData.forEach((listing, index) => {
    if (!listing.address_id || !listing.address_match_confidence || !listing.coordinates) {
        return;
    }

    // Найдем соответствующий адрес
    const matchedAddress = addressesData.find(addr => addr.id === listing.address_id);
    if (!matchedAddress || !matchedAddress.coordinates) {
        return;
    }

    // Пересчитаем расстояние
    const distance = calculateDistance(
        {
            lat: parseFloat(listing.coordinates.lat),
            lng: parseFloat(listing.coordinates.lng)
        },
        {
            lat: parseFloat(matchedAddress.coordinates.lat),
            lng: parseFloat(matchedAddress.coordinates.lng)
        }
    );

    const confidence = listing.address_match_confidence;
    const score = listing.address_match_score || 0;

    // Проверяем правило: если расстояние ≤ 20м, точность должна быть высокой
    if (distance <= 20) {
        totalViolations++;
        
        // Нарушение правила близости
        if (confidence !== 'high' && confidence !== 'excellent' && score < 0.9) {
            realProximityViolations++;
            
            console.log(`⚠️  НАРУШЕНИЕ ${realProximityViolations}:`);
            console.log(`   📍 Объявление: "${listing.address || listing.title}"`);
            console.log(`   📊 Текущая точность: ${confidence} (скор: ${score.toFixed(3)})`);
            console.log(`   📏 Расстояние: ${distance.toFixed(1)}м`);
            console.log(`   🎯 Метод: ${listing.address_match_method}`);
            console.log(`   🏠 Найденный адрес: "${matchedAddress.address}"`);
            
            // Проверим разность координат
            const latDiff = Math.abs(parseFloat(listing.coordinates.lat) - parseFloat(matchedAddress.coordinates.lat));
            const lngDiff = Math.abs(parseFloat(listing.coordinates.lng) - parseFloat(matchedAddress.coordinates.lng));
            
            console.log(`   📐 Разница координат: lat=${latDiff.toFixed(8)}, lng=${lngDiff.toFixed(8)}`);
            console.log(`   🎯 ОЖИДАЕТСЯ: точность "high" с скором ≥0.90`);
            console.log('');
        }
    }
});

console.log(`\n📈 ИТОГОВАЯ СТАТИСТИКА:`);
console.log(`   📊 Объявлений в радиусе ≤20м: ${totalViolations}`);
console.log(`   ⚠️  Нарушений правила близости: ${realProximityViolations}`);
console.log(`   📊 Процент нарушений: ${totalViolations > 0 ? (realProximityViolations / totalViolations * 100).toFixed(1) : 0}%`);

if (realProximityViolations === 0) {
    console.log('\n✅ Реальных нарушений правила близости не найдено!');
    console.log('   Алгоритм корректно применяет правило ≤20м = 90% точность');
} else {
    console.log('\n⚠️  ОБНАРУЖЕНЫ РЕАЛЬНЫЕ ПРОБЛЕМЫ!');
    console.log('   Правило близости не применяется в некоторых случаях');
    
    // Рекомендации по исправлению
    console.log('\n🛠️  РЕКОМЕНДАЦИИ ПО ИСПРАВЛЕНИЮ:');
    console.log('1. Проверить в коде smart-address-matcher.js метод applyProximityRule()');
    console.log('2. Убедиться, что метод вызывается для всех найденных совпадений');
    console.log('3. Проверить порядок применения правила в композитном скоре');
}

// Дополнительный анализ - поиск объявлений с одинаковыми координатами
console.log('\n🔍 ДОПОЛНИТЕЛЬНЫЙ АНАЛИЗ: ОБЪЯВЛЕНИЯ С ИДЕНТИЧНЫМИ КООРДИНАТАМИ');

const coordinateGroups = new Map();

listingsData.forEach(listing => {
    if (!listing.coordinates?.lat || !listing.coordinates?.lng) return;
    
    const coordKey = `${listing.coordinates.lat},${listing.coordinates.lng}`;
    if (!coordinateGroups.has(coordKey)) {
        coordinateGroups.set(coordKey, []);
    }
    coordinateGroups.get(coordKey).push(listing);
});

let identicalCoordViolations = 0;

coordinateGroups.forEach((group, coords) => {
    if (group.length > 1) {
        // Проверим, все ли объявления в группе имеют одинаковую высокую точность
        const confidences = group.map(l => l.address_match_confidence).filter(c => c);
        const scores = group.map(l => l.address_match_score).filter(s => s);
        
        const hasLowConfidence = confidences.some(c => c === 'low' || c === 'very_low');
        const hasHighConfidence = confidences.some(c => c === 'high' || c === 'excellent');
        
        if (hasLowConfidence && hasHighConfidence) {
            identicalCoordViolations++;
            console.log(`\n⚠️  НЕСОГЛАСОВАННОСТЬ ${identicalCoordViolations}:`);
            console.log(`   📍 Координаты: ${coords}`);
            console.log(`   📊 Количество объявлений: ${group.length}`);
            console.log(`   🎚️  Разные уровни точности: ${[...new Set(confidences)].join(', ')}`);
            
            // Показать примеры
            group.slice(0, 3).forEach((listing, i) => {
                console.log(`   ${i + 1}. "${listing.address}" - ${listing.address_match_confidence} (${listing.address_match_score?.toFixed(3)})`);
            });
        }
    }
});

if (identicalCoordViolations > 0) {
    console.log(`\n⚠️  НАЙДЕНО ${identicalCoordViolations} групп с несогласованной точностью для одинаковых координат`);
    console.log('   Это указывает на непоследовательность в применении алгоритма');
}