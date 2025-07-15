/**
 * Функциональность для работы с сегментами
 * Этот код нужно добавить в класс AreaPage перед закрывающей скобкой (строка 13074)
 */

    // =================== СЕГМЕНТЫ ===================
    
    /**
     * Инициализация сегментов
     */
    async initializeSegments() {
        await this.debugLog('🔧 Инициализация функционала сегментов');
        
        try {
            // Инициализируем таблицу сегментов
            this.initializeSegmentsTable();
            
            // Привязываем события
            this.bindSegmentEvents();
            
            // Загружаем данные сегментов
            await this.loadSegments();
            
            await this.debugLog('✅ Функционал сегментов инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации сегментов:', error);
        }
    }
    
    /**
     * Инициализация таблицы сегментов
     */
    initializeSegmentsTable() {
        if (this.segmentsTable) {
            this.segmentsTable.destroy();
        }
        
        this.segmentsTable = $('#segmentsTable').DataTable({
            responsive: true,
            pageLength: 25,
            lengthChange: false,
            searching: false,
            ordering: true,
            info: true,
            autoWidth: false,
            language: {
                url: '../libs/datatables/ru.json'
            },
            columns: [
                {
                    title: '',
                    data: null,
                    width: '30px',
                    orderable: false,
                    className: 'details-control text-center',
                    render: function(data, type, row) {
                        return '<i class="fas fa-plus-circle text-gray-400 hover:text-blue-600 cursor-pointer"></i>';
                    }
                },
                {
                    title: 'Название сегмента',
                    data: 'name',
                    render: function(data, type, row) {
                        return `<span class="font-medium text-gray-900">${data || 'Без названия'}</span>`;
                    }
                },
                {
                    title: 'Количество домов',
                    data: 'addresses_count',
                    className: 'text-center',
                    render: function(data, type, row) {
                        return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${data || 0}</span>`;
                    }
                },
                {
                    title: 'Подсегменты',
                    data: 'subsegments_count',
                    className: 'text-center',
                    render: function(data, type, row) {
                        return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">${data || 0}</span>`;
                    }
                },
                {
                    title: 'Действия',
                    data: null,
                    width: '120px',
                    orderable: false,
                    className: 'text-right',
                    render: function(data, type, row) {
                        return `
                            <div class="flex justify-end space-x-2">
                                <button type="button" class="edit-segment-btn inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200" data-segment-id="${row.id}">
                                    Изменить
                                </button>
                                <button type="button" class="delete-segment-btn inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200" data-segment-id="${row.id}">
                                    Удалить
                                </button>
                            </div>
                        `;
                    }
                }
            ],
            drawCallback: () => {
                // Проверяем наличие данных
                const info = this.segmentsTable.page.info();
                if (info.recordsTotal === 0) {
                    $('#segmentsTableEmpty').removeClass('hidden');
                    $('#segmentsTable_wrapper').addClass('hidden');
                } else {
                    $('#segmentsTableEmpty').addClass('hidden');
                    $('#segmentsTable_wrapper').removeClass('hidden');
                }
            }
        });
    }
    
    /**
     * Привязка событий сегментов
     */
    bindSegmentEvents() {
        // Кнопка создания сегмента
        $('#createSegmentBtn').off('click').on('click', () => {
            this.openSegmentModal();
        });
        
        // Закрытие модального окна
        $('#closeSegmentModalBtn, #cancelSegmentBtn').off('click').on('click', () => {
            this.closeSegmentModal();
        });
        
        // Отправка формы сегмента
        $('#segmentForm').off('submit').on('submit', (e) => {
            e.preventDefault();
            this.saveSegment();
        });
        
        // Раскрытие/сворачивание строк с подсегментами
        $('#segmentsTable tbody').off('click', 'td.details-control').on('click', 'td.details-control', (e) => {
            const tr = $(e.target).closest('tr');
            const row = this.segmentsTable.row(tr);
            
            if (row.child.isShown()) {
                // Закрываем подстроку
                row.child.hide();
                tr.removeClass('shown');
                $(e.target).removeClass('fa-minus-circle').addClass('fa-plus-circle');
            } else {
                // Открываем подстроку с подсегментами
                const segmentData = row.data();
                this.loadSubsegments(segmentData.id).then(subsegments => {
                    row.child(this.formatSubsegmentsDetails(subsegments)).show();
                    tr.addClass('shown');
                    $(e.target).removeClass('fa-plus-circle').addClass('fa-minus-circle');
                });
            }
        });
        
        // Редактирование сегмента
        $('#segmentsTable').off('click', '.edit-segment-btn').on('click', '.edit-segment-btn', (e) => {
            const segmentId = $(e.target).data('segment-id');
            this.editSegment(segmentId);
        });
        
        // Удаление сегмента
        $('#segmentsTable').off('click', '.delete-segment-btn').on('click', '.delete-segment-btn', (e) => {
            const segmentId = $(e.target).data('segment-id');
            this.deleteSegment(segmentId);
        });
    }
    
    /**
     * Загрузка сегментов
     */
    async loadSegments() {
        try {
            await this.debugLog('📊 Загружаем сегменты для области:', this.currentAreaId);
            
            if (!this.currentAreaId) {
                this.segments = [];
                this.segmentsTable.clear().draw();
                return;
            }
            
            // Загружаем сегменты из базы данных
            this.segments = await window.db.getAll('segments');
            const areaSegments = this.segments.filter(s => s.map_area_id === this.currentAreaId);
            
            // Подсчитываем количество домов и подсегментов для каждого сегмента
            for (const segment of areaSegments) {
                segment.addresses_count = await this.getSegmentAddressesCount(segment);
                segment.subsegments_count = await this.getSegmentSubsegmentsCount(segment.id);
            }
            
            // Обновляем таблицу
            this.segmentsTable.clear().rows.add(areaSegments).draw();
            
            await this.debugLog(`✅ Загружено ${areaSegments.length} сегментов`);
        } catch (error) {
            console.error('❌ Ошибка загрузки сегментов:', error);
            this.showStatus('Ошибка загрузки сегментов', 'error');
        }
    }
    
    /**
     * Подсчет количества адресов в сегменте
     */
    async getSegmentAddressesCount(segment) {
        try {
            if (!segment.filters) return 0;
            
            // Получаем все адреса области
            const allAddresses = this.addresses || [];
            
            // Фильтруем адреса по критериям сегмента
            const filteredAddresses = allAddresses.filter(address => {
                return this.addressMatchesSegmentFilters(address, segment.filters);
            });
            
            return filteredAddresses.length;
        } catch (error) {
            console.error('❌ Ошибка подсчета адресов сегмента:', error);
            return 0;
        }
    }
    
    /**
     * Подсчет количества подсегментов
     */
    async getSegmentSubsegmentsCount(segmentId) {
        try {
            const subsegments = await window.db.getAll('subsegments');
            return subsegments.filter(s => s.segment_id === segmentId).length;
        } catch (error) {
            console.error('❌ Ошибка подсчета подсегментов:', error);
            return 0;
        }
    }
    
    /**
     * Проверка соответствия адреса фильтрам сегмента
     */
    addressMatchesSegmentFilters(address, filters) {
        // Проверяем тип недвижимости
        if (filters.type && filters.type.length > 0) {
            if (!filters.type.includes(address.type)) return false;
        }
        
        // Проверяем класс дома
        if (filters.house_class_id && filters.house_class_id.length > 0) {
            if (!filters.house_class_id.includes(address.house_class_id)) return false;
        }
        
        // Проверяем серию дома
        if (filters.house_series_id && filters.house_series_id.length > 0) {
            if (!filters.house_series_id.includes(address.house_series_id)) return false;
        }
        
        // Проверяем материал стен
        if (filters.wall_material_id && filters.wall_material_id.length > 0) {
            if (!filters.wall_material_id.includes(address.wall_material_id)) return false;
        }
        
        // Проверяем материал перекрытий
        if (filters.ceiling_material_id && filters.ceiling_material_id.length > 0) {
            if (!filters.ceiling_material_id.includes(address.ceiling_material_id)) return false;
        }
        
        // Проверяем газоснабжение
        if (filters.gas_supply && filters.gas_supply.length > 0) {
            const gasSupplyStr = address.gas_supply !== null ? address.gas_supply.toString() : '';
            if (!filters.gas_supply.includes(gasSupplyStr)) return false;
        }
        
        // Проверяем этажность
        if (filters.floors_from && address.floors_count < filters.floors_from) return false;
        if (filters.floors_to && address.floors_count > filters.floors_to) return false;
        
        // Проверяем год постройки
        if (filters.build_year_from && address.build_year < filters.build_year_from) return false;
        if (filters.build_year_to && address.build_year > filters.build_year_to) return false;
        
        // Проверяем конкретные адреса (если указаны)
        if (filters.addresses && filters.addresses.length > 0) {
            if (!filters.addresses.includes(address.id)) return false;
        }
        
        return true;
    }
    
    /**
     * Открытие модального окна сегмента
     */
    async openSegmentModal(segmentId = null) {
        try {
            await this.debugLog('🔧 Открываем модальное окно сегмента:', segmentId);
            
            // Загружаем справочные данные
            await this.loadSegmentModalData();
            
            if (segmentId) {
                // Режим редактирования
                const segment = await window.db.get('segments', segmentId);
                if (segment) {
                    this.populateSegmentForm(segment);
                    $('#segment-modal-title').text('Редактировать сегмент');
                }
            } else {
                // Режим создания
                this.clearSegmentForm();
                $('#segment-modal-title').text('Создать сегмент');
                $('#segmentMapAreaId').val(this.currentAreaId);
            }
            
            // Инициализируем карту в модальном окне
            this.initializeSegmentMap();
            
            // Показываем модальное окно
            $('#segmentModal').removeClass('hidden');
            
        } catch (error) {
            console.error('❌ Ошибка открытия модального окна сегмента:', error);
            this.showStatus('Ошибка открытия модального окна', 'error');
        }
    }
    
    /**
     * Закрытие модального окна сегмента
     */
    closeSegmentModal() {
        $('#segmentModal').addClass('hidden');
        this.clearSegmentForm();
        
        // Уничтожаем карту
        if (this.segmentMap) {
            this.segmentMap.remove();
            this.segmentMap = null;
        }
    }
    
    /**
     * Загрузка данных для модального окна сегмента
     */
    async loadSegmentModalData() {
        try {
            // Загружаем классы домов
            const houseClasses = await window.db.getAll('house_classes');
            const houseClassSelect = $('#segmentHouseClass');
            houseClassSelect.empty();
            houseClasses.forEach(hc => {
                houseClassSelect.append(`<option value="${hc.id}">${hc.name}</option>`);
            });
            
            // Загружаем серии домов
            const houseSeries = await window.db.getAll('house_series');
            const houseSeriesSelect = $('#segmentHouseSeries');
            houseSeriesSelect.empty();
            houseSeries.forEach(hs => {
                houseSeriesSelect.append(`<option value="${hs.id}">${hs.name}</option>`);
            });
            
            // Загружаем материалы стен
            const wallMaterials = await window.db.getAll('wall_materials');
            const wallMaterialSelect = $('#segmentWallMaterial');
            wallMaterialSelect.empty();
            wallMaterials.forEach(wm => {
                wallMaterialSelect.append(`<option value="${wm.id}">${wm.name}</option>`);
            });
            
            // Загружаем материалы перекрытий
            const ceilingMaterials = await window.db.getAll('ceiling_materials');
            const ceilingMaterialSelect = $('#segmentCeilingMaterial');
            ceilingMaterialSelect.empty();
            ceilingMaterials.forEach(cm => {
                ceilingMaterialSelect.append(`<option value="${cm.id}">${cm.name}</option>`);
            });
            
            // Загружаем адреса области
            const addresses = this.addresses || [];
            const addressSelect = $('#segmentAddresses');
            addressSelect.empty();
            addresses.forEach(addr => {
                addressSelect.append(`<option value="${addr.id}">${addr.address}</option>`);
            });
            
        } catch (error) {
            console.error('❌ Ошибка загрузки данных модального окна:', error);
        }
    }
    
    /**
     * Инициализация карты в модальном окне сегмента
     */
    initializeSegmentMap() {
        // Уничтожаем существующую карту
        if (this.segmentMap) {
            this.segmentMap.remove();
        }
        
        // Создаем новую карту
        this.segmentMap = L.map('segmentMap', {
            center: [55.7558, 37.6176], // Москва по умолчанию
            zoom: 12
        });
        
        // Добавляем тайлы
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.segmentMap);
        
        // Центрируем карту на области, если есть полигон
        if (this.hasAreaPolygon()) {
            const bounds = L.latLngBounds(this.currentArea.polygon.map(p => [p.lat, p.lng]));
            this.segmentMap.fitBounds(bounds);
            
            // Добавляем полигон области
            L.polygon(this.currentArea.polygon.map(p => [p.lat, p.lng]), {
                color: 'blue',
                weight: 2,
                opacity: 0.7,
                fillOpacity: 0.1
            }).addTo(this.segmentMap);
        }
        
        // Добавляем адреса на карту
        this.addAddressesToSegmentMap();
    }
    
    /**
     * Добавление адресов на карту сегмента
     */
    addAddressesToSegmentMap() {
        if (!this.segmentMap || !this.addresses) return;
        
        this.addresses.forEach(address => {
            if (address.coordinates) {
                const marker = L.marker([address.coordinates.lat, address.coordinates.lng])
                    .bindPopup(`<strong>${address.address}</strong><br>Тип: ${address.type}`)
                    .addTo(this.segmentMap);
                
                // Добавляем ID адреса к маркеру
                marker.addressId = address.id;
            }
        });
    }
    
    /**
     * Заполнение формы сегмента данными
     */
    populateSegmentForm(segment) {
        $('#segmentId').val(segment.id);
        $('#segmentMapAreaId').val(segment.map_area_id);
        $('#segmentName').val(segment.name || '');
        
        if (segment.filters) {
            // Заполняем фильтры
            if (segment.filters.type) {
                $('#segmentType').val(segment.filters.type);
            }
            if (segment.filters.house_class_id) {
                $('#segmentHouseClass').val(segment.filters.house_class_id);
            }
            if (segment.filters.house_series_id) {
                $('#segmentHouseSeries').val(segment.filters.house_series_id);
            }
            if (segment.filters.wall_material_id) {
                $('#segmentWallMaterial').val(segment.filters.wall_material_id);
            }
            if (segment.filters.ceiling_material_id) {
                $('#segmentCeilingMaterial').val(segment.filters.ceiling_material_id);
            }
            if (segment.filters.gas_supply) {
                $('#segmentGasSupply').val(segment.filters.gas_supply);
            }
            if (segment.filters.floors_from) {
                $('#segmentFloorsFrom').val(segment.filters.floors_from);
            }
            if (segment.filters.floors_to) {
                $('#segmentFloorsTo').val(segment.filters.floors_to);
            }
            if (segment.filters.build_year_from) {
                $('#segmentBuildYearFrom').val(segment.filters.build_year_from);
            }
            if (segment.filters.build_year_to) {
                $('#segmentBuildYearTo').val(segment.filters.build_year_to);
            }
            if (segment.filters.addresses) {
                $('#segmentAddresses').val(segment.filters.addresses);
            }
        }
    }
    
    /**
     * Очистка формы сегмента
     */
    clearSegmentForm() {
        $('#segmentForm')[0].reset();
        $('#segmentId').val('');
        $('#segmentMapAreaId').val('');
        
        // Очищаем multiple select'ы
        $('#segmentType, #segmentHouseClass, #segmentHouseSeries, #segmentWallMaterial, #segmentCeilingMaterial, #segmentGasSupply, #segmentAddresses').val([]);
    }
    
    /**
     * Сохранение сегмента
     */
    async saveSegment() {
        try {
            await this.debugLog('💾 Сохраняем сегмент');
            
            const formData = new FormData($('#segmentForm')[0]);
            const segmentData = {
                id: formData.get('id') || this.generateId(),
                map_area_id: formData.get('map_area_id'),
                name: formData.get('name') || this.generateSegmentName(formData),
                filters: this.collectSegmentFilters(formData),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            // Сохраняем в базу данных
            if (formData.get('id')) {
                // Обновляем существующий
                await window.db.update('segments', segmentData);
                await this.debugLog('✅ Сегмент обновлен:', segmentData.id);
            } else {
                // Создаем новый
                await window.db.add('segments', segmentData);
                await this.debugLog('✅ Сегмент создан:', segmentData.id);
            }
            
            // Закрываем модальное окно
            this.closeSegmentModal();
            
            // Обновляем таблицу сегментов
            await this.loadSegments();
            
            this.showStatus('Сегмент сохранен', 'success');
            
        } catch (error) {
            console.error('❌ Ошибка сохранения сегмента:', error);
            this.showStatus('Ошибка сохранения сегмента', 'error');
        }
    }
    
    /**
     * Сбор фильтров сегмента из формы
     */
    collectSegmentFilters(formData) {
        const filters = {};
        
        // Собираем множественные значения
        const collectMultiple = (name) => {
            const values = formData.getAll(name).filter(v => v !== '');
            return values.length > 0 ? values : null;
        };
        
        filters.type = collectMultiple('type');
        filters.house_class_id = collectMultiple('house_class_id');
        filters.house_series_id = collectMultiple('house_series_id');
        filters.wall_material_id = collectMultiple('wall_material_id');
        filters.ceiling_material_id = collectMultiple('ceiling_material_id');
        filters.gas_supply = collectMultiple('gas_supply');
        filters.addresses = collectMultiple('addresses');
        
        // Собираем одиночные значения
        const floorsFrom = formData.get('floors_from');
        const floorsTo = formData.get('floors_to');
        const buildYearFrom = formData.get('build_year_from');
        const buildYearTo = formData.get('build_year_to');
        
        if (floorsFrom) filters.floors_from = parseInt(floorsFrom);
        if (floorsTo) filters.floors_to = parseInt(floorsTo);
        if (buildYearFrom) filters.build_year_from = parseInt(buildYearFrom);
        if (buildYearTo) filters.build_year_to = parseInt(buildYearTo);
        
        return filters;
    }
    
    /**
     * Генерация названия сегмента на основе фильтров
     */
    generateSegmentName(formData) {
        const parts = [];
        
        // Добавляем название области
        if (this.currentArea) {
            parts.push(this.currentArea.name);
        }
        
        // Добавляем типы недвижимости
        const types = formData.getAll('type').filter(v => v !== '');
        if (types.length > 0) {
            const typeNames = types.map(t => {
                switch(t) {
                    case 'house': return 'Дома';
                    case 'house_with_land': return 'Дома с участком';
                    case 'land': return 'Участки';
                    case 'commercial': return 'Коммерческая';
                    case 'building': return 'Здания';
                    default: return t;
                }
            });
            parts.push(typeNames.join(', '));
        }
        
        // Добавляем этажность
        const floorsFrom = formData.get('floors_from');
        const floorsTo = formData.get('floors_to');
        if (floorsFrom || floorsTo) {
            const from = floorsFrom || '1';
            const to = floorsTo || '100';
            parts.push(`${from}-${to} эт.`);
        }
        
        // Добавляем годы постройки
        const buildYearFrom = formData.get('build_year_from');
        const buildYearTo = formData.get('build_year_to');
        if (buildYearFrom || buildYearTo) {
            const from = buildYearFrom || '1800';
            const to = buildYearTo || new Date().getFullYear();
            parts.push(`${from}-${to} гг.`);
        }
        
        return parts.join(', ') || 'Новый сегмент';
    }
    
    /**
     * Редактирование сегмента
     */
    async editSegment(segmentId) {
        await this.openSegmentModal(segmentId);
    }
    
    /**
     * Удаление сегмента
     */
    async deleteSegment(segmentId) {
        if (!confirm('Вы уверены, что хотите удалить этот сегмент?')) {
            return;
        }
        
        try {
            await this.debugLog('🗑️ Удаляем сегмент:', segmentId);
            
            // Удаляем связанные подсегменты
            const subsegments = await window.db.getAll('subsegments');
            const segmentSubsegments = subsegments.filter(s => s.segment_id === segmentId);
            for (const subsegment of segmentSubsegments) {
                await window.db.delete('subsegments', subsegment.id);
            }
            
            // Удаляем сегмент
            await window.db.delete('segments', segmentId);
            
            // Обновляем таблицу
            await this.loadSegments();
            
            this.showStatus('Сегмент удален', 'success');
            await this.debugLog('✅ Сегмент удален:', segmentId);
            
        } catch (error) {
            console.error('❌ Ошибка удаления сегмента:', error);
            this.showStatus('Ошибка удаления сегмента', 'error');
        }
    }
    
    /**
     * Загрузка подсегментов
     */
    async loadSubsegments(segmentId) {
        try {
            const subsegments = await window.db.getAll('subsegments');
            return subsegments.filter(s => s.segment_id === segmentId);
        } catch (error) {
            console.error('❌ Ошибка загрузки подсегментов:', error);
            return [];
        }
    }
    
    /**
     * Форматирование подробностей подсегментов
     */
    formatSubsegmentsDetails(subsegments) {
        if (!subsegments || subsegments.length === 0) {
            return `
                <div class="p-4 bg-gray-50 text-center">
                    <p class="text-sm text-gray-500">Подсегменты не созданы</p>
                    <button type="button" class="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200">
                        Создать подсегмент
                    </button>
                </div>
            `;
        }
        
        let html = '<div class="p-4 bg-gray-50"><div class="space-y-2">';
        subsegments.forEach(subsegment => {
            html += `
                <div class="flex items-center justify-between p-2 bg-white rounded border">
                    <div>
                        <span class="font-medium text-sm">${subsegment.name || 'Подсегмент'}</span>
                        <span class="ml-2 text-xs text-gray-500">${subsegment.addresses_count || 0} адресов</span>
                    </div>
                    <div class="flex space-x-1">
                        <button type="button" class="edit-subsegment-btn text-xs px-2 py-1 text-indigo-700 bg-indigo-100 rounded hover:bg-indigo-200" data-subsegment-id="${subsegment.id}">
                            Изменить
                        </button>
                        <button type="button" class="delete-subsegment-btn text-xs px-2 py-1 text-red-700 bg-red-100 rounded hover:bg-red-200" data-subsegment-id="${subsegment.id}">
                            Удалить
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
        
        return html;
    }
    
    /**
     * Генерация уникального ID
     */
    generateId() {
        return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }