/**
 * Утилита для работы с Overpass API OpenStreetMap
 * Загружает данные о зданиях и адресах в заданной области
 */

class OSMOverpassAPI {
    constructor() {
        this.apiUrl = 'https://overpass-api.de/api/interpreter';
        this.timeout = 30000; // 30 секунд
        this.geoUtils = new GeoUtils();
    }

    /**
     * Создание Overpass запроса для получения только жилых зданий в полигоне
     * @param {Array} polygon - Массив координат полигона [{lat, lng}]
     * @returns {string} Overpass QL запрос
     */
    createBuildingsQuery(polygon) {
        // Конвертируем полигон в формат для Overpass API
        const coords = polygon.map(point => `${point.lat} ${point.lng}`).join(' ');
        
        console.log(`🗺️ Создаем Overpass запрос для жилых домов в полигоне:`, polygon);
        console.log(`📍 Координаты для запроса: ${coords}`);
        
        const query = `
[out:json][timeout:25];
(
  way["building"~"^(residential|house|apartment|apartments|detached|semi_detached|terrace|yes)$"](poly:"${coords}");
  relation["building"~"^(residential|house|apartment|apartments|detached|semi_detached|terrace|yes)$"](poly:"${coords}");
  way["building"]["addr:housenumber"](poly:"${coords}");
  node["building"~"^(residential|house|apartment|apartments|detached|semi_detached|terrace|yes)$"](poly:"${coords}");
  way["addr:housenumber"]["building:use"~"^(residential|living)$"](poly:"${coords}");
  node["addr:housenumber"]["building:use"~"^(residential|living)$"](poly:"${coords}");
  way["residential"](poly:"${coords}");
  node["residential"](poly:"${coords}");
);
out geom;
        `.trim();
        
        console.log(`📝 Overpass запрос для жилых домов:`, query);
        return query;
    }

    /**
     * Выполнение запроса к Overpass API
     * @param {string} query - Overpass QL запрос
     * @returns {Promise<Object>} Результат запроса
     */
    async executeQuery(query) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8'
                },
                body: query
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Overpass API request failed:', error);
            throw new Error(`Ошибка запроса к Overpass API: ${error.message}`);
        }
    }

    /**
     * Извлечение адресной информации из OSM элемента
     * @param {Object} element - OSM элемент
     * @returns {Object} Объект с адресной информацией
     */
    extractAddressInfo(element) {
        const tags = element.tags || {};
        
        return {
            housenumber: tags['addr:housenumber'] || '',
            street: tags['addr:street'] || '',
            city: tags['addr:city'] || '',
            postcode: tags['addr:postcode'] || '',
            country: tags['addr:country'] || 'RU',
            building: tags['building'] || '',
            building_use: tags['building:use'] || '',
            levels: tags['building:levels'] ? parseInt(tags['building:levels']) : null,
            material: tags['building:material'] || '',
            type: tags['building:type'] || '',
            name: tags['name'] || '',
            residential: tags['residential'] || ''
        };
    }

    /**
     * Проверка является ли здание жилым
     * @param {Object} addressInfo - Адресная информация
     * @param {Object} tags - Теги OSM элемента
     * @returns {boolean} true если здание жилое
     */
    isResidentialBuilding(addressInfo, tags) {
        // Список жилых типов зданий
        const residentialBuildingTypes = [
            'residential', 'house', 'apartment', 'apartments', 
            'detached', 'semi_detached', 'terrace', 'bungalow',
            'villa', 'townhouse', 'maisonette', 'dormitory',
            'nursing_home', 'retirement_home'
        ];

        // Список жилых использований зданий
        const residentialUseTypes = [
            'residential', 'living', 'housing'
        ];

        // Проверяем тег building
        if (addressInfo.building && residentialBuildingTypes.includes(addressInfo.building.toLowerCase())) {
            return true;
        }

        // Проверяем тег building:use
        if (addressInfo.building_use && residentialUseTypes.includes(addressInfo.building_use.toLowerCase())) {
            return true;
        }

        // Проверяем тег residential
        if (addressInfo.residential && addressInfo.residential === 'yes') {
            return true;
        }

        // Если building=yes и есть номер дома, считаем жилым (часто так размечают в России)
        if (addressInfo.building === 'yes' && addressInfo.housenumber) {
            return true;
        }

        // Дополнительные проверки для специфичных случаев
        if (tags['amenity'] === 'nursing_home' || tags['amenity'] === 'retirement_home') {
            return true;
        }

        // Если есть landuse=residential, то скорее всего жилое
        if (tags['landuse'] === 'residential') {
            return true;
        }

        return false;
    }

    /**
     * Получение координат центра элемента
     * @param {Object} element - OSM элемент
     * @returns {Object|null} Координаты {lat, lng} или null
     */
    getElementCenter(element) {
        if (element.type === 'node') {
            return {
                lat: element.lat,
                lng: element.lon
            };
        } else if (element.type === 'way' && element.geometry) {
            // Для way берем центр всех точек
            const lats = element.geometry.map(node => node.lat);
            const lngs = element.geometry.map(node => node.lon);
            
            return {
                lat: lats.reduce((a, b) => a + b, 0) / lats.length,
                lng: lngs.reduce((a, b) => a + b, 0) / lngs.length
            };
        } else if (element.type === 'relation' && element.members) {
            // Для relation берем центр первого way
            const firstWay = element.members.find(member => member.type === 'way' && member.geometry);
            if (firstWay && firstWay.geometry) {
                const lats = firstWay.geometry.map(node => node.lat);
                const lngs = firstWay.geometry.map(node => node.lon);
                
                return {
                    lat: lats.reduce((a, b) => a + b, 0) / lats.length,
                    lng: lngs.reduce((a, b) => a + b, 0) / lngs.length
                };
            }
        }
        
        return null;
    }

    /**
     * Обработка результатов Overpass API в адреса
     * @param {Object} osmData - Данные от Overpass API
     * @param {Array} areaPolygon - Полигон области для фильтрации
     * @returns {Array} Массив объектов адресов
     */
    processOSMData(osmData, areaPolygon) {
        const addresses = [];
        const processedElements = new Set();

        console.log(`🔍 OSM Data received:`, osmData);
        console.log(`📊 Elements count: ${osmData.elements ? osmData.elements.length : 0}`);

        if (!osmData.elements || !Array.isArray(osmData.elements)) {
            console.warn(`⚠️ No elements in OSM data`);
            return addresses;
        }

        console.log(`🏠 Processing ${osmData.elements.length} OSM elements...`);

        let skippedDuplicates = 0;
        let skippedNoCoords = 0;
        let skippedNoAddress = 0;
        let skippedNotResidential = 0;
        let skippedOutsidePolygon = 0;
        let processed = 0;

        osmData.elements.forEach((element, index) => {
            if (index < 5) {
                console.log(`🔍 Элемент ${index}:`, element);
            }

            // Избегаем дублирования
            const elementId = `${element.type}_${element.id}`;
            if (processedElements.has(elementId)) {
                skippedDuplicates++;
                return;
            }
            processedElements.add(elementId);

            const addressInfo = this.extractAddressInfo(element);
            const coordinates = this.getElementCenter(element);

            if (index < 5) {
                console.log(`📍 Координаты элемента ${index}:`, coordinates);
                console.log(`🏠 Адресная информация ${index}:`, addressInfo);
            }

            // Пропускаем элементы без координат или адресной информации
            if (!coordinates) {
                skippedNoCoords++;
                return;
            }

            if (!addressInfo.housenumber && !addressInfo.building) {
                skippedNoAddress++;
                return;
            }

            // Дополнительная фильтрация только жилых зданий
            if (!this.isResidentialBuilding(addressInfo, element.tags || {})) {
                skippedNotResidential++;
                if (index < 5) {
                    console.log(`🏢 Элемент ${index} не является жилым домом:`, addressInfo.building);
                }
                return;
            }

            // Проверяем, что точка находится в полигоне области
            const isInsidePolygon = LightweightGeo.booleanPointInPolygon(coordinates, areaPolygon);
            if (!isInsidePolygon) {
                skippedOutsidePolygon++;
                if (index < 5) {
                    console.log(`❌ Элемент ${index} вне полигона: ${coordinates.lat}, ${coordinates.lng}`);
                }
                return;
            }

            processed++;
            if (index < 5) {
                console.log(`✅ Элемент ${index} принят для обработки`);
            }

            // Формируем полный адрес
            let fullAddress = '';
            if (addressInfo.street && addressInfo.housenumber) {
                fullAddress = `${addressInfo.street}, ${addressInfo.housenumber}`;
            } else if (addressInfo.name) {
                fullAddress = addressInfo.name;
            } else if (addressInfo.building) {
                fullAddress = `Здание (${addressInfo.building})`;
            } else {
                fullAddress = `Объект OSM ${element.type} ${element.id}`;
            }

            if (addressInfo.city) {
                fullAddress += `, ${addressInfo.city}`;
            }

            // Определяем тип объекта
            let objectType = 'building';
            if (addressInfo.building === 'yes' || !addressInfo.building) {
                objectType = 'building';
            } else if (addressInfo.building === 'house') {
                objectType = 'house';
            } else if (addressInfo.building === 'commercial') {
                objectType = 'commercial';
            }

            const addressObject = {
                id: `osm_${elementId}`,
                address: fullAddress,
                coordinates: coordinates,
                type: objectType,
                source: 'osm',
                osm_id: element.id,
                osm_type: element.type,
                
                // Дополнительные поля для зданий
                floors_count: addressInfo.levels,
                wall_material: addressInfo.material,
                building_type: addressInfo.type,
                
                // Адресные поля
                street: addressInfo.street,
                house_number: addressInfo.housenumber,
                city: addressInfo.city,
                postcode: addressInfo.postcode,
                
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            addresses.push(addressObject);
        });

        console.log(`📊 === СТАТИСТИКА ОБРАБОТКИ OSM (ТОЛЬКО ЖИЛЫЕ ДОМА) ===`);
        console.log(`🔍 Всего элементов: ${osmData.elements.length}`);
        console.log(`🔄 Обработано уникальных: ${osmData.elements.length - skippedDuplicates}`);
        console.log(`❌ Пропущено дублей: ${skippedDuplicates}`);
        console.log(`❌ Без координат: ${skippedNoCoords}`);
        console.log(`❌ Без адресной информации: ${skippedNoAddress}`);
        console.log(`🏢 Не жилые здания: ${skippedNotResidential}`);
        console.log(`❌ Вне полигона: ${skippedOutsidePolygon}`);
        console.log(`✅ Принято для создания адресов: ${processed}`);
        console.log(`🏠 Итоговое количество жилых домов: ${addresses.length}`);

        return addresses;
    }

    /**
     * Загрузка адресов для области
     * @param {Object} area - Объект области с полигоном
     * @param {Function} progressCallback - Колбэк для отслеживания прогресса
     * @returns {Promise<Array>} Массив загруженных адресов
     */
    async loadAddressesForArea(area, progressCallback = null) {
        try {
            if (progressCallback) progressCallback('Подготовка запроса к OSM...', 10);

            if (!area.polygon || !Array.isArray(area.polygon)) {
                throw new Error('Некорректный полигон области');
            }

            // Создаем запрос
            const query = this.createBuildingsQuery(area.polygon);
            
            if (progressCallback) progressCallback('Отправка запроса к Overpass API...', 30);

            // Выполняем запрос
            const osmData = await this.executeQuery(query);
            
            if (progressCallback) progressCallback('Обработка полученных данных...', 70);

            // Обрабатываем результаты
            const addresses = this.processOSMData(osmData, area.polygon);
            
            if (progressCallback) progressCallback('Загрузка завершена', 100);

            return addresses;

        } catch (error) {
            console.error('Error loading OSM addresses:', error);
            throw error;
        }
    }

    /**
     * Получение информации об ограничениях Overpass API
     * @returns {Promise<Object>} Информация о статусе API
     */
    async getAPIStatus() {
        try {
            const statusUrl = 'https://overpass-api.de/api/status';
            const response = await fetch(statusUrl);
            const statusText = await response.text();
            
            return {
                available: response.ok,
                status: statusText,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                available: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Получение адреса по координатам (reverse geocoding)
     * @param {number} lat - Широта
     * @param {number} lng - Долгота
     * @returns {Promise<string>} Найденный адрес или пустая строка
     */
    async reverseGeocode(lat, lng) {
        try {
            const query = `
[out:json][timeout:10];
(
  way["addr:housenumber"]["addr:street"](around:100,${lat},${lng});
  node["addr:housenumber"]["addr:street"](around:100,${lat},${lng});
);
out geom;
            `.trim();

            console.log(`🔍 Reverse geocoding для координат ${lat}, ${lng}`);
            
            const data = await this.executeQuery(query);
            
            if (data.elements && data.elements.length > 0) {
                console.log(`📊 Найдено ${data.elements.length} адресов в радиусе 100м`);
                
                // Находим ближайший адрес
                let closestElement = null;
                let minDistance = Infinity;
                
                for (const element of data.elements) {
                    const elementCoords = this.getElementCenter(element);
                    if (!elementCoords) continue;
                    
                    // Вычисляем расстояние до элемента
                    const distance = this.calculateDistance(lat, lng, elementCoords.lat, elementCoords.lng);
                    
                    console.log(`📍 Элемент: ${element.tags?.['addr:street']} ${element.tags?.['addr:housenumber']}, расстояние: ${Math.round(distance)}м`);
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestElement = element;
                    }
                }
                
                if (closestElement) {
                    const tags = closestElement.tags || {};
                    
                    let address = '';
                    if (tags['addr:street']) {
                        address += tags['addr:street'];
                        if (tags['addr:housenumber']) {
                            address += ', ' + tags['addr:housenumber'];
                        }
                    }
                    
                    if (tags['addr:city']) {
                        address += ', ' + tags['addr:city'];
                    }
                    
                    console.log(`✅ Ближайший адрес (${Math.round(minDistance)}м): ${address}`);
                    return address;
                }
            }
            
            console.log(`❌ Адрес не найден для координат ${lat}, ${lng}`);
            return '';
            
        } catch (error) {
            console.error('Ошибка reverse geocoding:', error);
            return '';
        }
    }

    /**
     * Вычисление расстояния между двумя точками по формуле гаверсинусов
     * @param {number} lat1 - Широта первой точки
     * @param {number} lng1 - Долгота первой точки
     * @param {number} lat2 - Широта второй точки
     * @param {number} lng2 - Долгота второй точки
     * @returns {number} Расстояние в метрах
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Радиус Земли в метрах
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Валидация полигона для Overpass API
     * @param {Array} polygon - Полигон для проверки
     * @returns {Object} Результат валидации
     */
    validatePolygon(polygon) {
        if (!Array.isArray(polygon) || polygon.length < 3) {
            return {
                valid: false,
                error: 'Полигон должен содержать минимум 3 точки'
            };
        }

        // Проверяем площадь (Overpass API имеет ограничения)
        try {
            const area = this.geoUtils.getPolygonArea(polygon);
            const maxArea = 50000000; // 50 км²
            
            if (area > maxArea) {
                return {
                    valid: false,
                    error: `Область слишком большая (${Math.round(area / 1000000)} км²). Максимум: ${maxArea / 1000000} км²`
                };
            }

            return {
                valid: true,
                area: area
            };
        } catch (error) {
            return {
                valid: false,
                error: 'Ошибка при проверке полигона: ' + error.message
            };
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OSMOverpassAPI;
}