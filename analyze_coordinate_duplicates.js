/**
 * Скрипт для анализа объявлений с одинаковыми координатами и разной точностью определения адреса
 */

const fs = require('fs');

// Читаем данные объявлений
const listingsData = JSON.parse(fs.readFileSync('./example/example-listings.json', 'utf8'));
const addressesData = JSON.parse(fs.readFileSync('./example/example-addresses.json', 'utf8'));

console.log(`📊 Анализируем ${listingsData.length} объявлений и ${addressesData.length} адресов`);

/**
 * Функция расчета расстояния между двумя точками (формула Haversine)
 */
function calculateDistance(coord1, coord2) {
    const R = 6371000; // Радиус Земли в метрах
    const lat1Rad = (parseFloat(coord1.lat) * Math.PI) / 180;
    const lat2Rad = (parseFloat(coord2.lat) * Math.PI) / 180;
    const deltaLatRad = ((parseFloat(coord2.lat) - parseFloat(coord1.lat)) * Math.PI) / 180;
    const deltaLngRad = ((parseFloat(coord2.lng || coord2.lon) - parseFloat(coord1.lng || coord1.lon)) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Группировка объявлений по близким координатам
 */
function groupByCoordinates(listings, radius = 20) {
    const groups = [];
    const processed = new Set();

    listings.forEach((listing, index) => {
        if (processed.has(index) || !listing.coordinates?.lat || !listing.coordinates?.lng) {
            return;
        }

        const group = [listing];
        processed.add(index);

        // Ищем другие объявления в радиусе
        listings.forEach((otherListing, otherIndex) => {
            if (processed.has(otherIndex) || 
                !otherListing.coordinates?.lat || 
                !otherListing.coordinates?.lng || 
                otherIndex === index) {
                return;
            }

            const distance = calculateDistance(listing.coordinates, otherListing.coordinates);
            if (distance <= radius) {
                group.push(otherListing);
                processed.add(otherIndex);
            }
        });

        if (group.length > 1) {
            groups.push({
                coordinates: listing.coordinates,
                listings: group,
                count: group.length
            });
        }
    });

    return groups;
}

/**
 * Анализ групп на предмет различной точности определения адресов
 */
function analyzeGroups(groups) {
    console.log('\n🔍 АНАЛИЗ ГРУПП ОБЪЯВЛЕНИЙ С БЛИЗКИМИ КООРДИНАТАМИ\n');
    
    let problemCases = 0;
    
    groups.forEach((group, index) => {
        const confidences = group.listings.map(l => l.address_match_confidence).filter(c => c);
        const scores = group.listings.map(l => l.address_match_score).filter(s => s !== null && s !== undefined);
        const distances = group.listings.map(l => l.address_distance).filter(d => d !== null && d !== undefined);
        
        // Ищем группы с разной точностью
        const uniqueConfidences = [...new Set(confidences)];
        const hasLowConfidence = confidences.some(c => c === 'low' || c === 'very_low');
        const hasHighConfidence = confidences.some(c => c === 'high' || c === 'medium');
        
        if (uniqueConfidences.length > 1 && hasLowConfidence) {
            problemCases++;
            
            console.log(`\n🎯 ГРУППА ${index + 1}: ${group.count} объявлений в радиусе 20м`);
            console.log(`📍 Координаты: ${group.coordinates.lat}, ${group.coordinates.lng}`);
            console.log(`🎚️  Уровни точности: ${uniqueConfidences.join(', ')}`);
            console.log(`📏 Расстояния до адресов: ${distances.map(d => d.toFixed(1) + 'м').join(', ')}`);
            console.log(`📊 Скоры: ${scores.map(s => s.toFixed(3)).join(', ')}`);
            
            console.log('\n📋 Детали объявлений:');
            group.listings.forEach((listing, i) => {
                console.log(`  ${i + 1}. ${listing.address || 'Адрес не указан'}`);
                console.log(`     📊 Точность: ${listing.address_match_confidence || 'не определена'} (скор: ${listing.address_match_score || 'н/д'})`);
                console.log(`     📏 Расстояние: ${listing.address_distance ? listing.address_distance.toFixed(1) + 'м' : 'н/д'}`);
                console.log(`     🎯 Метод: ${listing.address_match_method || 'не указан'}`);
                console.log(`     🆔 Адрес ID: ${listing.address_id || 'не найден'}`);
                
                // Найдем соответствующий адрес
                const foundAddress = addressesData.find(addr => addr.id === listing.address_id);
                if (foundAddress) {
                    const distToAddress = calculateDistance(listing.coordinates, foundAddress.coordinates);
                    console.log(`     🏠 Найденный адрес: "${foundAddress.address}"`);
                    console.log(`     📐 Реальное расстояние до адреса: ${distToAddress.toFixed(1)}м`);
                    
                    // Проверяем, если расстояние ≤ 20м, должна быть высокая точность
                    if (distToAddress <= 20 && (listing.address_match_confidence === 'low' || listing.address_match_confidence === 'very_low')) {
                        console.log(`     ⚠️  ПРОБЛЕМА: Расстояние ≤20м, но точность низкая!`);
                    }
                }
                console.log('');
            });
        }
    });
    
    console.log(`\n📈 ИТОГО:`);
    console.log(`- Найдено групп с близкими координатами: ${groups.length}`);
    console.log(`- Групп с проблемами точности: ${problemCases}`);
    
    return problemCases;
}

/**
 * Поиск конкретных случаев нарушения правила "≤20м = 90% точности"
 */
function findProximityRuleViolations() {
    console.log('\n🔍 ПОИСК НАРУШЕНИЙ ПРАВИЛА БЛИЗОСТИ (≤20м = 90% точность)\n');
    
    let violations = 0;
    
    listingsData.forEach((listing, index) => {
        if (!listing.address_id || !listing.address_distance || !listing.address_match_confidence) {
            return;
        }
        
        const distance = listing.address_distance;
        const confidence = listing.address_match_confidence;
        const score = listing.address_match_score;
        
        // Проверяем правило: если расстояние ≤ 20м, точность должна быть высокой (≥90%)
        if (distance <= 20 && (confidence === 'low' || confidence === 'very_low' || (score && score < 0.9))) {
            violations++;
            
            console.log(`⚠️  НАРУШЕНИЕ ${violations}:`);
            console.log(`   📍 Объявление: "${listing.address || listing.title}"`);
            console.log(`   📊 Точность: ${confidence} (скор: ${score ? score.toFixed(3) : 'н/д'})`);
            console.log(`   📏 Расстояние: ${distance.toFixed(1)}м`);
            console.log(`   🎯 Метод: ${listing.address_match_method}`);
            console.log(`   📍 Координаты объявления: ${listing.coordinates.lat}, ${listing.coordinates.lng}`);
            
            // Найдем соответствующий адрес
            const foundAddress = addressesData.find(addr => addr.id === listing.address_id);
            if (foundAddress) {
                console.log(`   🏠 Найденный адрес: "${foundAddress.address}"`);
                console.log(`   📍 Координаты адреса: ${foundAddress.coordinates.lat}, ${foundAddress.coordinates.lng}`);
                
                // Пересчитаем расстояние для проверки
                const recalculatedDistance = calculateDistance(listing.coordinates, foundAddress.coordinates);
                console.log(`   📐 Пересчитанное расстояние: ${recalculatedDistance.toFixed(1)}м`);
                
                if (Math.abs(recalculatedDistance - distance) > 1) {
                    console.log(`   ⚠️  ОШИБКА В РАСЧЕТЕ РАССТОЯНИЯ! Разница: ${Math.abs(recalculatedDistance - distance).toFixed(1)}м`);
                }
            }
            console.log('');
        }
    });
    
    console.log(`📈 ИТОГО нарушений правила близости: ${violations}`);
    return violations;
}

// Запускаем анализ
console.log('🚀 НАЧИНАЕМ АНАЛИЗ...\n');

// 1. Группируем по координатам
const coordinateGroups = groupByCoordinates(listingsData, 20);
analyzeGroups(coordinateGroups);

// 2. Ищем нарушения правила близости
findProximityRuleViolations();

console.log('\n✅ Анализ завершен!');