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
     * Инициализация карты
     */
    async initialize() {
        try {
            if (!this.mapElement) {
                throw new Error(`Элемент карты с ID "${this.mapElementId}" не найден`);
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

            if (this.debugEnabled) {
                console.log('🏠 FlippingMap: Карта инициализирована');
            }
        } catch (error) {
            console.error('❌ FlippingMap: Ошибка инициализации:', error);
            throw error;
        }
    }

    /**
     * Обновление карты с объектами
     */
    async updateObjects(objects, profitabilityParameters = {}) {
        try {
            this.objects = objects || [];

            if (!this.map) {
                await this.initialize();
            }

            // Очищаем предыдущие маркеры
            this.clearMarkers();

            if (this.objects.length === 0) {
                if (this.debugEnabled) {
                    console.log('🏠 FlippingMap: Нет объектов для отображения');
                }
                return;
            }

            // Группируем объекты по адресам
            const addressGroups = this.groupObjectsByAddress(this.objects);
            
            // Создаём маркеры для каждой группы адресов
            const markersToAdd = [];

            Object.entries(addressGroups).forEach(([addressKey, objectsGroup]) => {
                const marker = this.createMarkerForAddress(addressKey, objectsGroup);
                if (marker) {
                    markersToAdd.push(marker);
                    this.markers.push(marker);
                }
            });

            // Добавляем маркеры на карту
            markersToAdd.forEach(marker => marker.addTo(this.map));

            // Подгоняем карту под маркеры
            if (this.markers.length > 0) {
                this.fitMapToMarkers();
            }
            
        } catch (error) {
            console.error('❌ FlippingMap: Ошибка в updateObjects:', error);
            throw error;
        }
    }

    /**
     * Создание маркера для группы объектов по адресу
     */
    createMarkerForAddress(addressKey, objectsGroup) {
        try {
            const objectCount = objectsGroup.length;
            const address = objectsGroup[0].address; // Адрес одинаковый для всех объектов группы

            // Определяем цвет маркера по количеству объектов
            let markerColor = '#D97706'; // жёлтый по умолчанию (< 10 объектов)
            
            if (objectCount >= 10) {
                markerColor = '#059669'; // зелёный для >= 10 объектов
            }

            // Создаём кастомную иконку
            const customIcon = L.divIcon({
                className: 'custom-flipping-marker',
                html: `
                    <div style="
                        background-color: ${markerColor};
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 3px solid white;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        font-size: 14px;
                        color: white;
                        font-weight: bold;
                    ">
                        ${objectCount}
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
            });

            // Создаём маркер
            const marker = L.marker(
                [address.latitude, address.longitude],
                { icon: customIcon }
            );

            // Создаём popup с информацией о группе объектов
            const popupContent = this.createAddressPopupContent(address, objectsGroup);
            marker.bindPopup(popupContent, {
                maxWidth: 350,
                className: 'flipping-popup'
            });

            // Добавляем обработчики событий
            marker.on('click', () => {
                this.onAddressMarkerClick(addressKey, objectsGroup);
            });

            return marker;

        } catch (error) {
            if (this.debugEnabled) {
                console.error('🏠 FlippingMap: Ошибка создания маркера для адреса:', addressKey, error);
            }
            return null;
        }
    }

    /**
     * Группировка объектов по адресам
     */
    groupObjectsByAddress(objects) {
        const groups = {};
        
        objects.forEach(obj => {
            if (obj.address && obj.address.latitude && obj.address.longitude) {
                // Создаём ключ на основе адреса и координат
                const addressKey = `${obj.address.address_string}_${obj.address.latitude}_${obj.address.longitude}`;
                
                if (!groups[addressKey]) {
                    groups[addressKey] = [];
                }
                groups[addressKey].push(obj);
            }
        });
        
        return groups;
    }

    /**
     * Создание содержимого popup для группы объектов по адресу
     */
    createAddressPopupContent(address, objectsGroup) {
        const objectCount = objectsGroup.length;
        const addressText = address.address_string || 'Адрес не определён';
        
        // Собираем статистику по объектам
        const roomsDistribution = {};
        let totalPrice = 0;
        let priceCount = 0;
        let totalArea = 0;
        let areaCount = 0;

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
        });

        const avgPrice = priceCount > 0 ? Math.round(totalPrice / priceCount) : 0;
        const avgArea = areaCount > 0 ? Math.round(totalArea / areaCount) : 0;
        
        const roomsText = Object.entries(roomsDistribution)
            .map(([rooms, count]) => `${rooms}: ${count}`)
            .join(', ');

        const colorClass = objectCount >= 10 ? 'text-green-600' : 'text-yellow-600';

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
                    
                    <div class="text-xs text-gray-600">
                        <div><span class="font-medium">Типы:</span> ${roomsText}</div>
                        ${avgPrice > 0 ? `<div><span class="font-medium">Средняя цена:</span> ${new Intl.NumberFormat('ru-RU').format(avgPrice)} ₽</div>` : ''}
                        ${avgArea > 0 ? `<div><span class="font-medium">Средняя площадь:</span> ${avgArea} м²</div>` : ''}
                    </div>
                </div>
                
                <div class="mt-3 pt-2 border-t border-gray-200">
                    <button class="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors" 
                            onclick="window.flippingController.showAddressDetails('${addressText}', ${objectsGroup.length})">
                        Показать все объекты
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Создание содержимого popup для объекта
     */
    createPopupContent(obj, profitability) {
        const annualReturn = profitability.annualReturn || 0;
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
                    ${obj.address.address_string || 'Адрес не определён'}
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
            const annualReturn = obj.profitability?.annualReturn || 0;
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