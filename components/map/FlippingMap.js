/**
 * FlippingMap - компонент карты для отчёта доходности флиппинг
 * Отображает объекты недвижимости с цветовым кодированием по доходности
 * Следует архитектуре v0.1
 */
class FlippingMap {
    constructor(mapElementId, errorHandlingService, configService) {
        this.mapElementId = mapElementId;
        this.errorHandlingService = errorHandlingService;
        this.configService = configService;
        
        this.mapElement = document.getElementById(mapElementId);
        this.map = null;
        this.markers = [];
        this.objects = [];
        
        this.debugEnabled = false;
        this.loadDebugSettings();
    }

    /**
     * Загрузка настроек отладки
     */
    async loadDebugSettings() {
        try {
            const debugConfig = await this.configService.get('debug.enabled');
            this.debugEnabled = debugConfig === true;
        } catch (error) {
            this.debugEnabled = false;
        }
    }

    /**
     * Принудительно делает панель карты видимой
     */
    ensureMapPanelVisible() {
        try {
            // Проверяем контейнер панели карты
            const mapPanelContainer = document.getElementById('mapPanelContainer');
            const mapPanelContent = document.getElementById('mapPanelContent');
            const mapPanelCheckbox = document.getElementById('mapPanel');
            
            console.log('🗺️ FlippingMap: Проверка видимости панели карты:', {
                container: !!mapPanelContainer,
                content: !!mapPanelContent,
                checkbox: !!mapPanelCheckbox,
                containerHidden: mapPanelContainer?.classList.contains('hidden'),
                contentHidden: mapPanelContent?.classList.contains('hidden'),
                checkboxChecked: mapPanelCheckbox?.checked
            });

            // Убираем класс hidden с контейнера панели
            if (mapPanelContainer && mapPanelContainer.classList.contains('hidden')) {
                mapPanelContainer.classList.remove('hidden');
                console.log('🗺️ FlippingMap: Убрали hidden с контейнера панели карты');
            }

            // Убираем класс hidden с содержимого панели
            if (mapPanelContent && mapPanelContent.classList.contains('hidden')) {
                mapPanelContent.classList.remove('hidden');
                console.log('🗺️ FlippingMap: Убрали hidden с содержимого панели карты');
                
                // Обновляем чекбокс
                if (mapPanelCheckbox && !mapPanelCheckbox.checked) {
                    mapPanelCheckbox.checked = true;
                }

                // Исправляем стрелку (chevron)
                const mapPanelChevron = document.getElementById('mapPanelChevron');
                if (mapPanelChevron) {
                    mapPanelChevron.style.transform = 'rotate(0deg)';
                }
            }

            // Принудительно устанавливаем размеры элемента карты
            if (this.mapElement) {
                this.mapElement.style.height = '500px';
                this.mapElement.style.width = '100%';
                this.mapElement.style.minHeight = '500px';
                this.mapElement.style.display = 'block';
                
                // Исправляем размеры родительских контейнеров
                let parent = this.mapElement.parentElement;
                while (parent && parent.id !== 'body') {
                    // Если родитель имеет класс h-80 (320px), убираем его
                    if (parent.classList.contains('h-80')) {
                        parent.classList.remove('h-80');
                        parent.style.height = '500px';
                        console.log('🗺️ FlippingMap: Убрали ограничение высоты h-80 с родителя');
                    }
                    
                    // Убеждаемся, что контейнер не имеет ограничений высоты
                    if (parent.style.maxHeight && parent.style.maxHeight !== 'none') {
                        parent.style.maxHeight = 'none';
                    }
                    
                    parent = parent.parentElement;
                }
                
                // Также устанавливаем размеры контейнера панели карты
                if (mapPanelContent) {
                    mapPanelContent.style.height = 'auto';
                    mapPanelContent.style.minHeight = '500px';
                }
                
                console.log('🗺️ FlippingMap: Принудительно установили размеры карты');
            }

        } catch (error) {
            console.error('❌ FlippingMap: Ошибка обеспечения видимости панели:', error);
        }
    }

    /**
     * Инициализация карты
     */
    async initialize() {
        try {
            if (!this.mapElement) {
                throw new Error(`Элемент карты с ID "${this.mapElementId}" не найден`);
            }

            // Принудительно открываем панель карты
            this.ensureMapPanelVisible();

            console.log('🗺️ FlippingMap: Инициализация карты, элемент:', {
                id: this.mapElementId,
                element: this.mapElement,
                width: this.mapElement.offsetWidth,
                height: this.mapElement.offsetHeight,
                parentWidth: this.mapElement.parentElement?.offsetWidth,
                parentHeight: this.mapElement.parentElement?.offsetHeight
            });

            // Дополнительная проверка размеров перед инициализацией Leaflet
            if (this.mapElement.offsetWidth === 0 || this.mapElement.offsetHeight === 0) {
                console.warn('🗺️ FlippingMap: Размеры карты всё ещё 0x0, применяем экстренные меры');
                this.mapElement.style.height = '500px !important';
                this.mapElement.style.width = '100% !important';
                
                // Принудительная перерисовка DOM
                this.mapElement.offsetHeight; // Trigger reflow
            }

            // Точная копия инициализации из MapManager
            this.map = L.map(this.mapElementId).setView([55.7558, 37.6176], 10);

            // Добавляем слой карты точно как в MapManager
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 18,
                opacity: 1.0
            }).addTo(this.map);

            this.markers = [];

            // Принудительная установка размера карты - несколько попыток
            setTimeout(() => {
                this.map.invalidateSize();
                console.log('🗺️ FlippingMap: Размер карты обновлён (попытка 1)', {
                    width: this.mapElement.offsetWidth,
                    height: this.mapElement.offsetHeight
                });
            }, 100);

            setTimeout(() => {
                this.map.invalidateSize();
                console.log('🗺️ FlippingMap: Размер карты обновлён (попытка 2)', {
                    width: this.mapElement.offsetWidth,
                    height: this.mapElement.offsetHeight
                });
            }, 300);

            setTimeout(() => {
                this.map.invalidateSize();
                console.log('🗺️ FlippingMap: Размер карты обновлён (попытка 3)', {
                    width: this.mapElement.offsetWidth,
                    height: this.mapElement.offsetHeight
                });
            }, 1000);

            console.log('🏠 FlippingMap: Карта инициализирована');
        } catch (error) {
            console.error('❌ FlippingMap: Ошибка инициализации:', error);
            throw error;
        }
    }

    /**
     * Простое обновление карты с адресами без расчётов
     */
    async updateAddresses(addresses, profitabilityParameters = {}, objects = []) {
        try {
            this.addresses = addresses || [];

            if (!this.map) {
                await this.initialize();
            }

            // Очищаем предыдущие маркеры
            this.clearMarkers();

            if (this.addresses.length === 0) {
                console.log('🏠 FlippingMap: Нет адресов для отображения');
                return;
            }

            console.log(`🗺️ FlippingMap: Простое отображение ${this.addresses.length} адресов на карте`);
            
            // Создаём простые маркеры для каждого адреса
            for (let index = 0; index < this.addresses.length; index++) {
                const address = this.addresses[index];
                const marker = this.createSimpleAddressMarker(address);
                if (marker) {
                    this.markers.push(marker);
                    marker.addTo(this.map);
                    
                    console.log(`✅ Маркер ${index + 1} добавлен на карту. Адрес:`, address.address_string || address.address);
                } else {
                    console.warn(`⚠️ Не удалось создать маркер для адреса ${index + 1}:`, address.id);
                }
            }

            // Проверяем финальное состояние карты
            console.log(`🗺️ Итого маркеров на карте: ${this.markers.length}`);
            
            // Принудительная перерисовка карты через небольшую задержку
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize(true);
                    console.log('🗺️ Принудительная перерисовка карты выполнена');
                }
            }, 500);
            
            // Подгоняем карту под маркеры
            if (this.markers.length > 0) {
                this.fitMapToMarkers();
            } else {
                console.warn('⚠️ FlippingMap: Нет маркеров для подгонки карты');
            }
            
        } catch (error) {
            console.error('❌ FlippingMap: Ошибка в updateAddresses:', error);
            throw error;
        }
    }

    /**
     * Обновление карты с объектами (legacy совместимость)
     */
    async updateObjects(objects, profitabilityParameters = {}) {
        // Извлекаем уникальные адреса из объектов
        const addressMap = new Map();
        
        for (const obj of objects || []) {
            if (obj.address && obj.address_id) {
                addressMap.set(obj.address_id, obj.address);
            }
        }
        
        const addresses = Array.from(addressMap.values());
        console.log(`🔄 FlippingMap: Конвертируем ${objects?.length || 0} объектов в ${addresses.length} уникальных адресов`);
        
        // Передаём объекты для расчёта доходности
        return this.updateAddresses(addresses, profitabilityParameters, objects);
    }

    /**
     * Создание маркера адреса (скопировано из FlippingProfitabilityManager)
     */
    async createAddressMarker(address) {
        // Проверяем готовность базы данных
        if (!window.db || !window.db.db) {
            console.warn('🔍 FlippingMap: База данных не готова для создания маркера');
            return this.createSimpleAddressMarker(address);
        }

        // Определяем высоту маркера по этажности
        const floorCount = address.floors_count || 0;
        let markerHeight;
        if (floorCount >= 1 && floorCount <= 5) {
            markerHeight = 10;
        } else if (floorCount > 5 && floorCount <= 10) {
            markerHeight = 15;
        } else if (floorCount > 10 && floorCount <= 20) {
            markerHeight = 20;
        } else if (floorCount > 20) {
            markerHeight = 25;
        } else {
            markerHeight = 10; // По умолчанию
        }
        
        // Определяем текст на маркере - в режиме доходности показываем доходность
        let labelText = '';
        const activeMapFilter = 'profitability'; // Фиксируем режим доходности для FlippingMap
        
        if (activeMapFilter === 'profitability') {
            try {
                // Логируем доступные сервисы доходности
                const profitabilityService = window.flippingProfitabilityService || 
                                            (window.flippingController?.profitabilityService) ||
                                            (window.areaPage?.reportsManager?.flippingProfitabilityManager?.profitabilityService);
                console.log(`🔍 Доступные сервисы доходности:`, {
                    window_flippingProfitabilityService: !!window.flippingProfitabilityService,
                    flippingController_service: !!(window.flippingController?.profitabilityService),
                    manager_service: !!(window.areaPage?.reportsManager?.flippingProfitabilityManager?.profitabilityService),
                    final_service: !!profitabilityService
                });
                
                // Получаем объекты по данному адресу через переданные данные
                // Так как объекты уже переданы в updateAddresses через FlippingController
                // мы можем использовать их напрямую
                if (this.cachedObjects && this.cachedObjects.length > 0) {
                    const objectsAtAddress = this.cachedObjects.filter(obj => obj.address_id === address.id);
                    console.log(`🔍 Объекты для адреса ${address.id}:`, objectsAtAddress.length, objectsAtAddress.map(o => o.id));
                    
                    if (objectsAtAddress.length > 0) {
                        let maxProfitability = -Infinity;
                        
                        // Находим максимальную доходность среди всех объектов по адресу
                        for (const obj of objectsAtAddress) {
                            // Пробуем разные источники сервиса доходности
                            const profitabilityService = window.flippingProfitabilityService || 
                                                        (window.flippingController?.profitabilityService) ||
                                                        (window.areaPage?.reportsManager?.flippingProfitabilityManager?.profitabilityService);
                            
                            console.log(`🔍 Расчёт доходности для объекта ${obj.id}:`, {
                                hasService: !!profitabilityService,
                                objData: {
                                    id: obj.id,
                                    price: obj.current_price || obj.price,
                                    area: obj.area_total || obj.area,
                                    property_type: obj.property_type
                                },
                                filters: this.currentFilters
                            });
                            
                            if (profitabilityService) {
                                try {
                                    const profitabilityResult = profitabilityService.calculateFlippingProfitability(obj, this.currentFilters);
                                    console.log(`📊 Результат расчёта для объекта ${obj.id}:`, profitabilityResult);
                                    
                                    if (profitabilityResult && profitabilityResult.annualROI) {
                                        maxProfitability = Math.max(maxProfitability, profitabilityResult.annualROI);
                                        console.log(`✅ Доходность для объекта ${obj.id}: ${profitabilityResult.annualROI.toFixed(1)}%`);
                                    } else {
                                        console.warn(`⚠️ Результат расчёта пустой для объекта ${obj.id}`);
                                    }
                                } catch (error) {
                                    console.warn(`⚠️ Ошибка расчёта доходности для объекта ${obj.id}:`, error);
                                }
                            } else {
                                console.warn('⚠️ FlippingProfitabilityService не найден');
                            }
                        }
                        
                        if (maxProfitability !== -Infinity) {
                            labelText = `${maxProfitability.toFixed(1)}%`;
                            console.log(`✅ Максимальная доходность для адреса ${address.id}: ${labelText}`);
                        } else {
                            labelText = '';
                            console.log(`⚠️ Не удалось рассчитать доходность для адреса ${address.id}`);
                        }
                    } else {
                        console.log(`ℹ️ Нет объектов для адреса ${address.id}`);
                    }
                } else {
                    // Попытка получить через БД как fallback
                    if (window.db && window.db.getObjectsByAddress) {
                        const objects = await window.db.getObjectsByAddress(address.id);
                        if (objects && objects.length > 0) {
                            let maxProfitability = -Infinity;
                            
                            for (const obj of objects) {
                                const profitabilityService = window.flippingProfitabilityService || 
                                                            (window.flippingController?.profitabilityService) ||
                                                            (window.areaPage?.reportsManager?.flippingProfitabilityManager?.profitabilityService);
                                
                                if (profitabilityService) {
                                    try {
                                        const profitabilityResult = profitabilityService.calculateFlippingProfitability(obj, this.currentFilters);
                                        if (profitabilityResult && profitabilityResult.annualROI) {
                                            maxProfitability = Math.max(maxProfitability, profitabilityResult.annualROI);
                                        }
                                    } catch (error) {
                                        console.warn(`⚠️ Ошибка расчёта доходности (fallback) для объекта ${obj.id}:`, error);
                                    }
                                }
                            }
                            
                            if (maxProfitability !== -Infinity) {
                                labelText = `${maxProfitability.toFixed(1)}%`;
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('FlippingMap: Не удалось рассчитать доходность для адреса:', address.id, error);
            }
        }
        
        // Определяем цвет маркера
        let markerColor = '#3b82f6'; // Цвет по умолчанию
        
        // Определяем стили подписи для режима доходности
        let labelTextColor = '#374151';  // Серый текст по умолчанию
        let labelBackground = 'rgba(255,255,255,0.9)'; // Белый фон по умолчанию
        
        if (activeMapFilter === 'profitability') {
            // Для режима доходности проверяем, превышает ли максимальная доходность процент для пересчёта
            if (labelText && labelText.includes('%')) {
                const profitabilityValue = parseFloat(labelText.replace('%', ''));
                const profitabilityPercent = this.currentFilters?.profitabilityPercent || 60; // По умолчанию 60%
                
                if (profitabilityValue >= profitabilityPercent) {
                    // Зелёный фон с белым шрифтом, если доходность >= процента для пересчёта
                    labelTextColor = 'white';
                    labelBackground = '#10B981'; // Зелёный фон
                }
            }
            // Для режима доходности используем стандартный цвет маркера
            markerColor = '#3b82f6';
        }
        
        // Отладка структуры адреса
        console.log('🔍 FlippingMap: Структура адреса:', {
            id: address.id,
            address_string: address.address_string,
            address: address.address,
            coordinates: address.coordinates,
            allFields: Object.keys(address),
            fullAddress: address
        });
        
        // Получаем координаты (используем точно тот же формат, что и FlippingProfitabilityManager)
        let lat = address.coordinates?.lat;
        let lng = address.coordinates?.lng;
        
        console.log('🔍 FlippingMap: Координаты адреса:', { lat, lng, coordinates: address.coordinates });
        
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            console.error('❌ FlippingMap: Не удалось найти координаты для адреса:', {
                addressId: address.id,
                addressString: address.address_string || address.address,
                lat: lat,
                lng: lng,
                coordinates: address.coordinates,
                allFields: Object.keys(address)
            });
            return null;
        }
        
        console.log('🔍 FlippingMap: Создаем маркер с параметрами:', {
            lat, lng, markerHeight, markerColor, labelText, labelTextColor, labelBackground
        });
        
        // Используем circleMarker - он всегда видимый и не требует иконок
        const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: markerColor,
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
        });
        
        console.log('✅ FlippingMap: Треугольный маркер создан (копия из FlippingProfitabilityManager) с координатами:', [lat, lng]);
        

        // Сохраняем данные адреса в маркере для оптимизации
        marker.addressData = address;

        // Простой popup с базовой информацией
        const popupContent = `
            <div class="p-3">
                <div class="font-semibold text-sm mb-2">
                    ${address.address || address.address_string || 'Адрес не определён'}
                </div>
                ${labelText ? `
                <div class="text-sm font-bold text-green-600">
                    Макс. доходность: ${labelText}
                </div>
                ` : ''}
                <div class="text-xs text-gray-600">
                    Этажей: ${address.floors_count || '?'}
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent, {
            maxWidth: 250,
            className: 'simple-address-popup'
        });

        return marker;
    }

    /**
     * Создание простого маркера адреса (fallback)
     */
    createSimpleAddressMarker(address) {
        // Получаем координаты (используем точно тот же формат, что и FlippingProfitabilityManager)
        let lat = address.coordinates?.lat;
        let lng = address.coordinates?.lng;
        
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            console.error('❌ FlippingMap: Не удалось найти координаты для простого маркера:', address.id);
            return null;
        }
        
        // Используем circleMarker вместо обычного маркера (избегаем проблемы с иконками)
        const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: '#3b82f6',
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
        });
        
        // Простой popup
        const popupContent = `
            <div class="p-3">
                <div class="font-semibold text-sm mb-2">
                    ${address.address_string || address.address || 'Адрес не определён'}
                </div>
                <div class="text-xs text-gray-600">
                    ID: ${address.id}
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent, {
            maxWidth: 250,
            className: 'simple-address-popup'
        });
        
        marker.addressData = address;
        return marker;
    }

    /**
     * Создание содержимого popup для адреса
     */
    async createAddressPopupContent(address) {
        const addressText = address.address_string || address.address || 'Адрес не определён';
        
        // Получаем объекты по данному адресу
        let objectsGroup = [];
        try {
            if (window.db && window.db.getObjectsByAddress) {
                objectsGroup = await window.db.getObjectsByAddress(address.id) || [];
            }
        } catch (error) {
            console.warn('FlippingMap: Не удалось загрузить объекты для popup адреса:', address.id, error);
        }
        
        const objectCount = objectsGroup.length;
        
        // Если нет объектов, показываем простой popup
        if (objectCount === 0) {
            return `
                <div class="p-3">
                    <div class="font-semibold text-sm mb-2 text-gray-900">
                        ${addressText}
                    </div>
                    <div class="text-xs text-gray-600">
                        Нет данных об объектах по данному адресу
                    </div>
                </div>
            `;
        }
        
        // Собираем статистику по объектам
        const roomsDistribution = {};
        let totalPrice = 0;
        let priceCount = 0;
        let totalArea = 0;
        let areaCount = 0;
        let maxProfitability = -Infinity;
        let minProfitability = Infinity;
        let avgProfitability = 0;
        let profitabilityCount = 0;

        objectsGroup.forEach(obj => {
            // Распределение по комнатам
            const rooms = obj.rooms === 0 || obj.rooms === 'studio' ? 'Студия' : `${obj.rooms}-к`;
            roomsDistribution[rooms] = (roomsDistribution[rooms] || 0) + 1;
            
            // Средняя цена
            if (obj.price) {
                totalPrice += obj.price;
                priceCount++;
            }
            
            // Средняя площадь
            if (obj.area) {
                totalArea += obj.area;
                areaCount++;
            }
            
            // Статистика доходности
            if (obj.profitability && (obj.profitability.annualROI || obj.profitability.annualReturn)) {
                const profitability = obj.profitability.annualROI || obj.profitability.annualReturn;
                maxProfitability = Math.max(maxProfitability, profitability);
                minProfitability = Math.min(minProfitability, profitability);
                avgProfitability += profitability;
                profitabilityCount++;
            }
        });

        const avgPrice = priceCount > 0 ? Math.round(totalPrice / priceCount) : 0;
        const avgArea = areaCount > 0 ? Math.round(totalArea / areaCount) : 0;
        avgProfitability = profitabilityCount > 0 ? avgProfitability / profitabilityCount : 0;
        
        const roomsText = Object.entries(roomsDistribution)
            .map(([rooms, count]) => `${rooms}: ${count}`)
            .join(', ');

        // Определяем цвет по максимальной доходности
        let colorClass = 'text-gray-600';
        if (maxProfitability !== -Infinity) {
            if (maxProfitability >= 25) colorClass = 'text-green-600';
            else if (maxProfitability >= 15) colorClass = 'text-green-500';
            else if (maxProfitability >= 5) colorClass = 'text-yellow-600';
            else if (maxProfitability >= 0) colorClass = 'text-orange-500';
            else colorClass = 'text-red-600';
        }

        return `
            <div class="p-3">
                <div class="font-semibold text-sm mb-2 text-gray-900">
                    ${addressText}
                </div>
                
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-700">Объектов:</span>
                        <span class="text-sm font-bold ${colorClass}">
                            ${objectCount} шт.
                        </span>
                    </div>
                    
                    ${profitabilityCount > 0 ? `
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-medium text-gray-700">Макс. доходность:</span>
                            <span class="text-sm font-bold ${colorClass}">
                                ${maxProfitability.toFixed(1)}% годовых
                            </span>
                        </div>
                        ${profitabilityCount > 1 ? `
                            <div class="text-xs text-gray-600">
                                <div><span class="font-medium">Диапазон доходности:</span> ${minProfitability.toFixed(1)}% — ${maxProfitability.toFixed(1)}%</div>
                                <div><span class="font-medium">Средняя доходность:</span> ${avgProfitability.toFixed(1)}%</div>
                            </div>
                        ` : ''}
                    ` : ''}
                    
                    <div class="text-xs text-gray-600">
                        <div><span class="font-medium">Типы:</span> ${roomsText}</div>
                        ${avgPrice > 0 ? `<div><span class="font-medium">Средняя цена:</span> ${new Intl.NumberFormat('ru-RU').format(avgPrice)} ₽</div>` : ''}
                        ${avgArea > 0 ? `<div><span class="font-medium">Средняя площадь:</span> ${avgArea} м²</div>` : ''}
                    </div>
                </div>
                
                <div class="mt-3 pt-2 border-t border-gray-200">
                    <button class="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors" 
                            onclick="window.flippingController.showAddressDetails('${addressText}', ${objectCount})">
                        Показать все объекты (${objectCount})
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Создание содержимого popup для объекта
     */
    createPopupContent(obj, profitability) {
        const annualReturn = profitability.annualROI || profitability.annualReturn || 0;
        const totalProfit = profitability.totalProfit || 0;
        const renovationCosts = profitability.renovationCosts || 0;
        
        // Цветовое кодирование доходности
        let profitabilityColor = '#6B7280';
        if (annualReturn > 20) profitabilityColor = '#059669';
        else if (annualReturn > 0) profitabilityColor = '#D97706';
        else profitabilityColor = '#DC2626';

        const roomsText = obj.rooms === 0 || obj.rooms === 'studio' ? 'Студия' : `${obj.rooms}-к`;
        const areaText = obj.area ? `${obj.area} м²` : '—';
        const floorText = obj.floor && obj.total_floors ? `${obj.floor}/${obj.total_floors} эт.` : '—';
        const priceText = obj.price ? new Intl.NumberFormat('ru-RU').format(obj.price) + ' ₽' : '—';
        const profitText = totalProfit ? new Intl.NumberFormat('ru-RU').format(Math.round(totalProfit)) + ' ₽' : '—';
        const renovationText = renovationCosts ? new Intl.NumberFormat('ru-RU').format(Math.round(renovationCosts)) + ' ₽' : '—';

        return `
            <div class="p-3">
                <div class="font-semibold text-sm mb-2 text-gray-900">
                    ${obj.address.address_string || obj.address.address || 'Адрес не определён'}
                </div>
                
                <div class="space-y-1 text-xs text-gray-600">
                    <div><span class="font-medium">Тип:</span> ${roomsText} • ${areaText} • ${floorText}</div>
                    <div><span class="font-medium">Цена:</span> ${priceText}</div>
                    <div><span class="font-medium">Ремонт:</span> ${renovationText}</div>
                </div>
                
                <div class="mt-2 pt-2 border-t border-gray-200">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-700">Доходность:</span>
                        <span class="text-sm font-bold" style="color: ${profitabilityColor}">
                            ${annualReturn.toFixed(1)}% годовых
                        </span>
                    </div>
                    <div class="flex items-center justify-between mt-1">
                        <span class="text-xs text-gray-500">Прибыль:</span>
                        <span class="text-xs font-medium" style="color: ${profitabilityColor}">
                            ${profitText}
                        </span>
                    </div>
                </div>
                
                <div class="mt-2">
                    <button class="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors" 
                            onclick="window.flippingController.showObjectDetails(${obj.id})">
                        Подробнее
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Обработчик клика по маркеру адреса
     */
    onAddressMarkerClick(addressKey, objectsGroup) {
        // Эмитируем событие для контроллера
        if (window.applicationController) {
            const flippingController = window.applicationController.getController('FlippingController');
            if (flippingController) {
                flippingController.emit('address:selected', { 
                    addressKey, 
                    objects: objectsGroup,
                    address: objectsGroup[0].address
                });
            }
        }

        if (this.debugEnabled) {
            console.log('🏠 FlippingMap: Выбран адрес:', addressKey, 'объектов:', objectsGroup.length);
        }
    }

    /**
     * Обработчик клика по маркеру (legacy)
     */
    onMarkerClick(obj) {
        // Эмитируем событие для контроллера
        if (window.applicationController) {
            const flippingController = window.applicationController.getController('FlippingController');
            if (flippingController) {
                flippingController.emit('object:selected', { object: obj });
            }
        }

        if (this.debugEnabled) {
            console.log('🏠 FlippingMap: Выбран объект:', obj.id);
        }
    }

    /**
     * Подгонка карты под маркеры
     */
    fitMapToMarkers() {
        if (this.markers.length === 0) return;

        try {
            if (this.markers.length === 1) {
                // Если только один маркер, центрируем на нём
                const marker = this.markers[0];
                this.map.setView(marker.getLatLng(), 15);
            } else {
                // Если несколько маркеров, подгоняем границы
                const group = new L.featureGroup(this.markers);
                this.map.fitBounds(group.getBounds(), { 
                    padding: [20, 20],
                    maxZoom: 16
                });
            }
        } catch (error) {
            if (this.debugEnabled) {
                console.error('🏠 FlippingMap: Ошибка подгонки карты:', error);
            }
        }
    }

    /**
     * Очистка маркеров
     */
    clearMarkers() {
        if (this.markers && this.markers.length > 0) {
            this.markers.forEach(marker => {
                if (this.map && marker) {
                    this.map.removeLayer(marker);
                }
            });
            this.markers = [];
        } else {
        }
    }

    /**
     * Получение статистики по маркерам
     */
    getMarkersStatistics() {
        const visible = this.markers.length;
        const total = this.objects.length;
        const hidden = total - visible;

        const profitabilityStats = {
            high: 0,    // > 20%
            medium: 0,  // 0-20%
            low: 0,     // < 0%
            total: total
        };

        this.objects.forEach(obj => {
            const annualReturn = obj.profitability?.annualROI || obj.profitability?.annualReturn || 0;
            if (annualReturn > 20) profitabilityStats.high++;
            else if (annualReturn > 0) profitabilityStats.medium++;
            else profitabilityStats.low++;
        });

        return {
            markers: { visible, hidden, total },
            profitability: profitabilityStats
        };
    }

    /**
     * Уничтожение карты
     */
    destroy() {
        this.clearMarkers();
        
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        if (this.debugEnabled) {
            console.log('🏠 FlippingMap: Карта уничтожена');
        }
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlippingMap;
}