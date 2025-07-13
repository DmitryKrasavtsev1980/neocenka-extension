/**
 * Скрипт для поиска всех адресов на улице Наметкина и анализа проблемы выбора адреса
 */

const fs = require('fs');

// Читаем данные
const listingsData = JSON.parse(fs.readFileSync('./example/example-listings.json', 'utf8'));
const addressesData = JSON.parse(fs.readFileSync('./example/example-addresses.json', 'utf8'));

/**
 * Расчет расстояния
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

console.log('🔍 ПОИСК ВСЕХ АДРЕСОВ НА УЛИЦЕ НАМЕТКИНА\n');

// Поиск всех адресов на улице Наметкина/Намёткина
const nametkinAddresses = addressesData.filter(addr => 
    addr.address && (
        addr.address.toLowerCase().includes('наметкина') ||
        addr.address.toLowerCase().includes('намёткина')
    )
);

console.log(`📍 Найдено ${nametkinAddresses.length} адресов на улице Наметкина:`);
nametkinAddresses.forEach((addr, index) => {
    console.log(`   ${index + 1}. "${addr.address}" [${addr.coordinates.lat}, ${addr.coordinates.lng}] (ID: ${addr.id})`);
});

// Берем тестовое объявление
const testListing = listingsData.find(listing => 
    listing.address === "ул. Наметкина, вл10" && 
    listing.address_distance && 
    Math.abs(listing.address_distance - 91.8) < 1
);

if (!testListing) {
    console.log('❌ Тестовое объявление не найдено');
    process.exit(1);
}

const listingCoords = {
    lat: parseFloat(testListing.coordinates.lat),
    lng: parseFloat(testListing.coordinates.lng)
};

console.log(`\n📍 ТЕСТОВОЕ ОБЪЯВЛЕНИЕ: "${testListing.address}"`);
console.log(`   Координаты: ${listingCoords.lat}, ${listingCoords.lng}`);

// Вычисляем расстояния до всех адресов на Наметкина
console.log('\n📏 РАССТОЯНИЯ ДО ВСЕХ АДРЕСОВ НА НАМЕТКИНА:');
const addressesWithDistances = nametkinAddresses.map(addr => ({
    ...addr,
    distance: calculateDistance(listingCoords, {
        lat: parseFloat(addr.coordinates.lat),
        lng: parseFloat(addr.coordinates.lng)
    })
})).sort((a, b) => a.distance - b.distance);

addressesWithDistances.forEach((addr, index) => {
    const isSelected = addr.id === testListing.address_id;
    const status = isSelected ? '✅ ВЫБРАННЫЙ' : (addr.distance <= 20 ? '🎯 БЛИЗКИЙ' : '📍');
    console.log(`   ${index + 1}. "${addr.address}" - ${addr.distance.toFixed(1)}м ${status}`);
});

// Поиск самого близкого адреса
const closestAddress = addressesWithDistances[0];
console.log(`\n🎯 САМЫЙ БЛИЗКИЙ АДРЕС: "${closestAddress.address}" (${closestAddress.distance.toFixed(1)}м)`);

if (closestAddress.distance <= 20) {
    console.log('✅ Правило близости должно применяться (≤20м = 90% точность)');
} else {
    console.log('❌ Правило близости НЕ должно применяться (>20м)');
}

// Проверим, был ли выбран правильный адрес
const selectedAddress = addressesWithDistances.find(addr => addr.id === testListing.address_id);
if (selectedAddress) {
    console.log(`\n📊 АНАЛИЗ ВЫБРАННОГО АДРЕСА:`);
    console.log(`   Выбран: "${selectedAddress.address}" (${selectedAddress.distance.toFixed(1)}м)`);
    console.log(`   Близкий: "${closestAddress.address}" (${closestAddress.distance.toFixed(1)}м)`);
    
    if (selectedAddress.id !== closestAddress.id) {
        console.log('⚠️  ПРОБЛЕМА: Выбран НЕ самый близкий адрес!');
        console.log(`   Разница: ${(selectedAddress.distance - closestAddress.distance).toFixed(1)}м`);
    } else {
        console.log('✅ Выбран самый близкий адрес');
    }
}

// Поиск адресов, которые точно соответствуют "вл10"
console.log('\n🔍 ПОИСК АДРЕСОВ С НОМЕРОМ "10":');
const addressesWithNumber10 = addressesData.filter(addr => 
    addr.address && (
        addr.address.toLowerCase().includes('наметкина') ||
        addr.address.toLowerCase().includes('намёткина')
    ) && (
        addr.address.includes('10') || 
        addr.address.includes('вл10') || 
        addr.address.includes('влд10')
    )
);

if (addressesWithNumber10.length > 0) {
    console.log(`📍 Найдено ${addressesWithNumber10.length} адресов с номером 10:`);
    addressesWithNumber10.forEach((addr, index) => {
        const distance = calculateDistance(listingCoords, {
            lat: parseFloat(addr.coordinates.lat),
            lng: parseFloat(addr.coordinates.lng)
        });
        console.log(`   ${index + 1}. "${addr.address}" - ${distance.toFixed(1)}м (ID: ${addr.id})`);
    });
} else {
    console.log('❌ Адресов с номером 10 не найдено');
}

// Анализ близлежащих адресов в радиусе 50м
console.log('\n🎯 ВСЕ АДРЕСА В РАДИУСЕ 50М:');
const nearbyAddresses = addressesData
    .map(addr => ({
        ...addr,
        distance: calculateDistance(listingCoords, {
            lat: parseFloat(addr.coordinates.lat),
            lng: parseFloat(addr.coordinates.lng)
        })
    }))
    .filter(addr => addr.distance <= 50)
    .sort((a, b) => a.distance - b.distance);

nearbyAddresses.forEach((addr, index) => {
    const isSelected = addr.id === testListing.address_id;
    const status = isSelected ? '✅ ВЫБРАННЫЙ' : (addr.distance <= 20 ? '🎯 ≤20м' : '📍');
    console.log(`   ${index + 1}. "${addr.address}" - ${addr.distance.toFixed(1)}м ${status}`);
});

console.log('\n📈 РЕЗЮМЕ ПРОБЛЕМЫ:');
console.log(`1. Объявление: "ул. Наметкина, вл10" (${listingCoords.lat}, ${listingCoords.lng})`);
console.log(`2. Выбранный адрес: "${selectedAddress.address}" на расстоянии ${selectedAddress.distance.toFixed(1)}м`);
console.log(`3. Точность определения: ${testListing.address_match_confidence} (скор: ${testListing.address_match_score.toFixed(3)})`);

if (nearbyAddresses.length > 0 && nearbyAddresses[0].distance <= 20) {
    console.log('\n⚠️  ОШИБКА В АЛГОРИТМЕ:');
    console.log(`   Есть адрес в радиусе ≤20м: "${nearbyAddresses[0].address}" (${nearbyAddresses[0].distance.toFixed(1)}м)`);
    console.log('   Правило близости должно было дать 90% точность!');
} else {
    console.log('\n✅ Алгоритм работает корректно для данного случая');
}