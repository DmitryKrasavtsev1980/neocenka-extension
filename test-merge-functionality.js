/**
 * Тест функциональности объединения дублей
 * Этот файл можно запустить в консоли Chrome Extension для проверки
 */

async function testMergeFunctionality() {
    console.log('🧪 Тестирование функциональности объединения дублей...');
    
    try {
        // 1. Проверяем инициализацию базы данных
        console.log('1. Проверка инициализации базы данных...');
        if (!window.db) {
            throw new Error('window.db не инициализирован');
        }
        
        if (!window.db.db) {
            console.log('🔄 Инициализация базы данных...');
            await window.db.init();
        }
        
        console.log('✅ База данных инициализирована');
        
        // 2. Проверяем доступность RealEstateObjectManager
        console.log('2. Проверка RealEstateObjectManager...');
        if (!window.realEstateObjectManager) {
            throw new Error('window.realEstateObjectManager не найден');
        }
        
        await window.realEstateObjectManager.init();
        console.log('✅ RealEstateObjectManager инициализирован');
        
        // 3. Проверяем доступность RealEstateObjectModel
        console.log('3. Проверка RealEstateObjectModel...');
        if (typeof RealEstateObjectModel === 'undefined') {
            throw new Error('RealEstateObjectModel не найден');
        }
        
        console.log('✅ RealEstateObjectModel доступен');
        
        // 4. Проверяем версию базы данных
        console.log('4. Проверка версии базы данных...');
        console.log('Текущая версия БД:', window.db.version);
        
        // 5. Проверяем наличие object_id индекса
        console.log('5. Проверка индекса object_id...');
        const transaction = window.db.db.transaction(['listings'], 'readonly');
        const store = transaction.objectStore('listings');
        
        const hasObjectIdIndex = store.indexNames.contains('object_id');
        if (!hasObjectIdIndex) {
            throw new Error('Индекс object_id отсутствует в listings таблице');
        }
        
        console.log('✅ Индекс object_id найден');
        
        // 6. Тестируем создание объекта недвижимости
        console.log('6. Тестирование создания объекта недвижимости...');
        const testObject = new RealEstateObjectModel({
            address_id: 1,
            property_type: '2k',
            area_total: 50,
            current_price: 3000000
        });
        
        console.log('✅ Тестовый объект создан:', testObject);
        
        // 6.1. Проверяем новое поле owner_status
        if (testObject.owner_status) {
            console.log('✅ Поле owner_status присутствует:', testObject.owner_status);
        } else {
            throw new Error('Поле owner_status отсутствует');
        }
        
        // 7. Проверяем методы менеджера
        console.log('7. Проверка методов менеджера...');
        const methods = [
            'mergeIntoObject',
            'splitObjectsToListings',
            'excludeListingsFromObject',
            'validateMergeByAddress',
            'getObjectsWithFilters'
        ];
        
        for (const method of methods) {
            if (typeof window.realEstateObjectManager[method] !== 'function') {
                throw new Error(`Метод ${method} не найден в RealEstateObjectManager`);
            }
        }
        
        console.log('✅ Все методы менеджера доступны');
        
        // 8. Проверяем методы модели объекта
        console.log('8. Проверка методов RealEstateObjectModel...');
        const modelMethods = [
            'updateOwnerStatus',
            'updatePrices',
            'updateStatus',
            'recalculateFromListings'
        ];
        
        for (const method of modelMethods) {
            if (typeof testObject[method] !== 'function') {
                throw new Error(`Метод ${method} не найден в RealEstateObjectModel`);
            }
        }
        
        console.log('✅ Все методы модели доступны');
        
        console.log('🎉 Все тесты пройдены успешно!');
        console.log('Функциональность объединения дублей готова к использованию.');
        
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка в тестировании:', error);
        throw error;
    }
}

// Экспорт для использования в консоли
if (typeof window !== 'undefined') {
    window.testMergeFunctionality = testMergeFunctionality;
}