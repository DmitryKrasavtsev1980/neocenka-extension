/**
 * Отладочный скрипт для проверки методов расчета расстояний
 * Обнаружена проблема: объявления с одинаковыми координатами имеют расстояние ~92м до адреса
 */

const fs = require('fs');

// Читаем данные
const listingsData = JSON.parse(fs.readFileSync('./example/example-listings.json', 'utf8'));
const addressesData = JSON.parse(fs.readFileSync('./example/example-addresses.json', 'utf8'));

console.log('🔍 ОТЛАДКА МЕТОДОВ РАСЧЕТА РАССТОЯНИЙ\n');

/**
 * Метод 1: Haversine из smart-address-matcher.js
 */
function calculateDistanceHaversine(coord1, coord2) {
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

/**
 * Метод 2: Turf.js из geo-utils.js (симуляция)
 */
function calculateDistanceTurf(coord1, coord2) {
    // Упрощенная реализация того, что делает Turf.js
    const R = 6371000;
    
    // GeoJSON использует [lng, lat], а не [lat, lng]
    const from = [parseFloat(coord1.lng), parseFloat(coord1.lat)];
    const to = [parseFloat(coord2.lng), parseFloat(coord2.lat)];
    
    const lat1Rad = (from[1] * Math.PI) / 180;
    const lat2Rad = (to[1] * Math.PI) / 180;
    const deltaLatRad = ((to[1] - from[1]) * Math.PI) / 180;
    const deltaLngRad = ((to[0] - from[0]) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Метод 3: Простой евклидов на проекции Меркатора (неточный, но быстрый)
 */
function calculateDistanceEuclidean(coord1, coord2) {
    const R = 6371000;
    const latAvg = (coord1.lat + coord2.lat) / 2 * Math.PI / 180;
    
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180 * Math.cos(latAvg);
    
    return R * Math.sqrt(dLat * dLat + dLng * dLng);
}

// Найдем проблемную группу объявлений
const problemListings = listingsData.filter(listing => 
    listing.address === "ул. Наметкина, вл10" && 
    listing.address_distance && 
    Math.abs(listing.address_distance - 91.8) < 1
);

if (problemListings.length === 0) {
    console.log('❌ Проблемные объявления не найдены');
    process.exit(1);
}

const testListing = problemListings[0];
const testAddress = addressesData.find(addr => addr.id === testListing.address_id);

if (!testAddress) {
    console.log('❌ Адрес не найден');
    process.exit(1);
}

console.log('📊 ТЕСТОВЫЕ ДАННЫЕ:');
console.log(`   📍 Объявление: "${testListing.address}"`);
console.log(`   📍 Координаты объявления: ${testListing.coordinates.lat}, ${testListing.coordinates.lng}`);
console.log(`   🏠 Найденный адрес: "${testAddress.address}"`);
console.log(`   📍 Координаты адреса: ${testAddress.coordinates.lat}, ${testAddress.coordinates.lng}`);
console.log(`   📏 Сохраненное расстояние: ${testListing.address_distance.toFixed(1)}м`);
console.log('');

// Нормализуем координаты для тестирования
const listingCoords = {
    lat: parseFloat(testListing.coordinates.lat),
    lng: parseFloat(testListing.coordinates.lng)
};

const addressCoords = {
    lat: parseFloat(testAddress.coordinates.lat),
    lng: parseFloat(testAddress.coordinates.lng)
};

console.log('🧪 ТЕСТИРОВАНИЕ МЕТОДОВ РАСЧЕТА РАССТОЯНИЙ:');

// Тест 1: Haversine
const distanceHaversine = calculateDistanceHaversine(listingCoords, addressCoords);
console.log(`   1️⃣ Haversine: ${distanceHaversine.toFixed(1)}м`);

// Тест 2: Turf.js (симуляция)
const distanceTurf = calculateDistanceTurf(listingCoords, addressCoords);
console.log(`   2️⃣ Turf.js стиль: ${distanceTurf.toFixed(1)}м`);

// Тест 3: Евклидово расстояние
const distanceEuclidean = calculateDistanceEuclidean(listingCoords, addressCoords);
console.log(`   3️⃣ Евклидово: ${distanceEuclidean.toFixed(1)}м`);

console.log('');

// Проверим разность координат
const latDiff = Math.abs(listingCoords.lat - addressCoords.lat);
const lngDiff = Math.abs(listingCoords.lng - addressCoords.lng);

console.log('📐 АНАЛИЗ КООРДИНАТ:');
console.log(`   📊 Разница по широте: ${latDiff.toFixed(8)} (${latDiff * 111000}м)`);
console.log(`   📊 Разница по долготе: ${lngDiff.toFixed(8)} (${lngDiff * 111000 * Math.cos(listingCoords.lat * Math.PI / 180)}м)`);

// Ищем потенциальные проблемы
console.log('\n🔍 ДИАГНОСТИКА ПРОБЛЕМ:');

if (Math.abs(distanceHaversine - testListing.address_distance) > 1) {
    console.log('⚠️  ПРОБЛЕМА 1: Расчет Haversine не совпадает с сохраненным расстоянием');
    console.log(`   Разница: ${Math.abs(distanceHaversine - testListing.address_distance).toFixed(1)}м`);
}

if (distanceHaversine < 20 && testListing.address_match_confidence !== 'high') {
    console.log('⚠️  ПРОБЛЕМА 2: Правило близости не применяется!');
    console.log(`   Расстояние ${distanceHaversine.toFixed(1)}м ≤ 20м, но точность "${testListing.address_match_confidence}"`);
    console.log('   🎯 ОЖИДАЕТСЯ: точность должна быть "high" с 90% уверенностью');
}

if (distanceHaversine > 90 && distanceHaversine < 95) {
    console.log('⚠️  ПРОБЛЕМА 3: Возможная ошибка в формуле расчета расстояния');
    console.log('   Расстояние ~92м подозрительно для "одинаковых" координат');
}

// Проверим, действительно ли координаты "одинаковые"
const coord1String = `${testListing.coordinates.lat},${testListing.coordinates.lng}`;
const coord2String = `${testAddress.coordinates.lat},${testAddress.coordinates.lng}`;

if (coord1String === coord2String) {
    console.log('✅ Координаты действительно одинаковые в строковом представлении');
} else {
    console.log('⚠️  Координаты НЕ одинаковые:');
    console.log(`   Объявление: ${coord1String}`);
    console.log(`   Адрес: ${coord2String}`);
}

// Найдем правильный адрес поблизости
console.log('\n🎯 ПОИСК БЛИЖАЙШИХ АДРЕСОВ:');

const nearbyAddresses = addressesData
    .map(addr => ({
        ...addr,
        distance: calculateDistanceHaversine(listingCoords, {
            lat: parseFloat(addr.coordinates.lat),
            lng: parseFloat(addr.coordinates.lng)
        })
    }))
    .filter(addr => addr.distance <= 100)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

nearbyAddresses.forEach((addr, index) => {
    console.log(`   ${index + 1}. "${addr.address}" - ${addr.distance.toFixed(1)}м ${addr.id === testListing.address_id ? '(ВЫБРАННЫЙ)' : ''}`);
});

if (nearbyAddresses.length > 0 && nearbyAddresses[0].distance <= 20 && nearbyAddresses[0].id !== testListing.address_id) {
    console.log('\n⚠️  КРИТИЧЕСКАЯ ПРОБЛЕМА: Найден более близкий адрес!');
    console.log(`   🏠 Должен быть выбран: "${nearbyAddresses[0].address}" (${nearbyAddresses[0].distance.toFixed(1)}м)`);
    console.log(`   🏠 Фактически выбран: "${testAddress.address}" (${distanceHaversine.toFixed(1)}м)`);
}

console.log('\n📈 ВЫВОДЫ:');
if (distanceHaversine <= 20) {
    console.log('✅ Алгоритм должен применить правило близости (≤20м = 90% точность)');
} else {
    console.log('❌ Алгоритм правильно НЕ применяет правило близости (>20м)');
}

console.log('\n🎯 РЕКОМЕНДАЦИИ:');
if (nearbyAddresses.length > 0 && nearbyAddresses[0].distance <= 20) {
    console.log('1. Проверить логику выбора ближайшего адреса');
    console.log('2. Убедиться, что правило близости применяется ПОСЛЕ выбора правильного адреса');
}
if (Math.abs(distanceHaversine - testListing.address_distance) > 1) {
    console.log('3. Проверить, какой метод расчета расстояния используется в коде');
}