/**
 * Popup.js - исправленная версия с устранением дублирования
 * Основные исправления:
 * 1. Правильное извлечение external_id
 * 2. Корректная проверка дублей
 * 3. Защита от множественных вызовов
 * 4. Логика обновления vs создания
 */

/**
 * Checks if a listing with the same external ID and source already exists in the database.
 * If it exists and the listing's area ID is undefined, temporarily corrects it by setting
 * the provided area ID.
 *
 * @param {string} areaId - The ID of the selected area
 * @return {Object|null} - The existing listing object if found, or null
 */
class NeocenkaPopup {
    constructor() {
        this.areas = [];
        this.listings = [];
        this.currentTab = null;
        this.isValidPage = false;
        this.pageSource = null;
        this.existingListing = null;
        this.isProcessing = false; // Защита от множественных вызовов

        this.init();
    }

    async init() {
        try {
            console.log('Popup: Initializing Neocenka popup...');

            await this.initializeDatabase();
            await this.getCurrentTab();
            this.checkPageType();
            await this.loadData();
            this.setupUI();
            this.setupEventListeners();

            console.log('Popup: Popup initialized successfully');

        } catch (error) {
            console.error('Popup: Error initializing popup:', error);
            this.showStatus('Ошибка инициализации', 'error');
        }
    }

    async initializeDatabase() {
        try {
            console.log('Popup: Initializing database...');
            console.log('Popup: typeof db:', typeof db);
            console.log('Popup: db object:', db);

            if (typeof db !== 'undefined' && db && typeof db.init === 'function') {
                console.log('Popup: Found real database, initializing...');
                await db.init();
                console.log('Popup: Real database initialized');

                // Проверяем доступные методы
                const keys = Object.keys(db);
                console.log('Popup: Database keys:', keys);
                console.log('Popup: db.getMapAreas available:', typeof db.getMapAreas === 'function');
                console.log('Popup: db.getAll available:', typeof db.getAll === 'function');

            } else {
                console.warn('Popup: Real database not found');
            }

        } catch (error) {
            console.error('Popup: Database initialization error:', error);
        }
    }

    async getCurrentTab() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    this.currentTab = tabs[0];
                    console.log('Popup: Current tab:', this.currentTab.url);
                }
                resolve();
            });
        });
    }

    checkPageType() {
        if (!this.currentTab || !this.currentTab.url) {
            this.updatePageStatus('Неизвестная страница', false);
            return;
        }

        const url = this.currentTab.url;
        console.log('Popup: Checking page type for URL:', url);

        // Проверяем Avito
        if (url.includes('avito.ru') && url.includes('/kvartiry/')) {
            if (url.match(/\/kvartiry\/.*\d+/) && !url.includes('/list/')) {
                this.pageSource = 'avito';
                this.isValidPage = true;
                this.updatePageStatus('Страница объявления Avito ✓', true);
                console.log('Popup: Valid Avito page detected');
                return;
            }
        }

        // Проверяем Cian
        if (url.includes('cian.ru') && url.includes('/sale/flat/')) {
            if (url.match(/\/sale\/flat\/\d+/)) {
                this.pageSource = 'cian';
                this.isValidPage = true;
                this.updatePageStatus('Страница объявления Cian ✓', true);
                console.log('Popup: Valid Cian page detected');
                return;
            }
        }

        // Страница не подходит
        this.pageSource = null;
        this.isValidPage = false;
        this.updatePageStatus('Откройте страницу объявления на Avito или Cian', false);
        console.log('Popup: Page not suitable for parsing');
    }

    updatePageStatus(message, isValid) {
        const statusElement = document.getElementById('pageStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = isValid ? 'text-green-600' : 'text-orange-600';
        }
    }

    async loadData() {
        try {
            console.log('Popup: Loading data...');

            if (typeof db !== 'undefined' && db && typeof db.getMapAreas === 'function') {
                console.log('Popup: Using real database with correct methods');
                try {
                    // Загружаем области
                    this.areas = await db.getMapAreas();
                    console.log('Popup: Loaded areas:', this.areas.length);

                    // Загружаем объявления для проверки дублей
                    if (typeof db.getAll === 'function') {
                        this.listings = await db.getAll('listings');
                        console.log('Popup: Loaded listings for duplicate check:', this.listings.length);
                    }

                    // Обновляем статистику
                    await this.updateStatistics();
                    return;
                } catch (realDbError) {
                    console.error('Popup: Error with real database:', realDbError);
                }
            }

            // Fallback
            console.warn('Popup: Real database not available, using fallback');
            this.areas = [];
            this.listings = [];

        } catch (error) {
            console.error('Popup: Error loading data:', error);
            this.showStatus('База данных недоступна', 'error');
            this.areas = [];
            this.listings = [];
        }
    }

    async updateStatistics() {
        try {
            if (typeof db !== 'undefined' && db && typeof db.getSegments === 'function') {
                const segments = await db.getSegments();
                let listings = [];

                if (typeof db.getAll === 'function') {
                    listings = await db.getAll('listings');
                }

                const activeListings = listings.filter(l => l.status === 'active');
                const needsProcessing = listings.filter(l => l.status === 'needs_processing');

                const stats = {
                    segments: segments.length,
                    listings: listings.length,
                    active: activeListings.length,
                    needsProcessing: needsProcessing.length
                };

                console.log('Popup: Statistics updated:', stats);

                // Обновляем элементы интерфейса
                this.updateStatsElements(stats);

                return stats;
            }
        } catch (error) {
            console.error('Popup: Error updating statistics:', error);
        }
    }

    updateStatsElements(stats) {
        const elements = {
            'segmentsCount': stats.segments,
            'listingsCount': stats.listings,
            'activeListings': stats.active,
            'needsProcessing': stats.needsProcessing
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    setupUI() {
        // Загружаем области в select
        const select = document.getElementById('areaSelect');
        if (select && this.areas.length > 0) {
            // Очищаем текущие опции
            select.innerHTML = '<option value="">Выберите область</option>';

            // Добавляем области
            this.areas.forEach(area => {
                const option = document.createElement('option');
                option.value = area.id;
                option.textContent = area.name;
                select.appendChild(option);
            });

            console.log(`Popup: Loaded ${this.areas.length} areas into select`);
        }

        // Обновляем кнопку парсинга
        this.updateParseButton();
    }

    setupEventListeners() {
        // Изменение области
        const areaSelect = document.getElementById('areaSelect');
        if (areaSelect) {
            areaSelect.addEventListener('change', async () => {
                console.log('Popup: Area changed, updating button...');
                await this.updateParseButton();
            });
        }

        // Кнопка парсинга
        const parseButton = document.getElementById('parseListingBtn');
        if (parseButton) {
            parseButton.addEventListener('click', () => {
                this.handleParseClick();
            });
        }

        // Навигационные кнопки
        document.getElementById('openMainBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openPage('pages/main.html');
        });

        document.getElementById('openSettingsBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openPage('pages/settings.html');
        });
    }

    // ИСПРАВЛЕННЫЙ МЕТОД extractExternalIdFromUrl
    extractExternalIdFromUrl(url) {
        if (url.includes('avito.ru')) {
            console.log('Popup: Extracting external ID from URL:', url);

            // Используем те же паттерны что и в avito-parser.js
            const patterns = [
                /_(\d+)\?/,          // ID перед параметрами: _1234567890?context=...
                /_(\d+)$/,           // ID в конце URL: _1234567890
                /_(\d+)#/,           // ID перед якорем: _1234567890#section
                /_(\d+)&/,           // ID перед другими параметрами: _1234567890&param=...
            ];

            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match && match[1]) {
                    console.log(`Popup: External ID extracted using pattern ${pattern.source}: ${match[1]}`);
                    return match[1];
                }
            }

            console.warn('Popup: No external ID found in URL:', url);
            return null;
        } else if (url.includes('cian.ru')) {
            const match = url.match(/\/(\d+)\//);
            return match ? match[1] : null;
        }
        return null;
    }

    /**
   * Checks if a listing with the same external ID and source already exists in the database.
   * If it does, ensures the area ID is not undefined and updates it if necessary.
   * If no listing is found, returns null.
   *
   * @async
   * @param {string} areaId - The area ID associated with the current listing.
   * @return {Object|null} - The existing listing object if found and matched by external_id and source; otherwise, null.
   */
    async checkExistingListing(areaId) {
        if (!this.currentTab || !areaId) {
            console.log('Popup: No tab or area for duplicate check');
            return null;
        }

        try {
            // Извлекаем ID объявления из URL
            const externalId = this.extractExternalIdFromUrl(this.currentTab.url);
            console.log('Popup: Extracted external ID:', externalId);

            if (!externalId) {
                console.log('Popup: No external ID found in URL');
                return null;
            }

            console.log('Popup: Checking for duplicates:', {
                areaId,
                externalId,
                pageSource: this.pageSource,
                totalListings: this.listings.length
            });

            // ВРЕМЕННОЕ РЕШЕНИЕ: ищем только по external_id и source, игнорируем area_id
            const existingListing = this.listings.find(listing => {
                const externalMatch = listing.external_id === externalId;
                const sourceMatch = listing.source === this.pageSource;
                const overallMatch = externalMatch && sourceMatch;

                console.log('Popup: Checking listing:', {
                    listingId: listing.id,
                    listingExternal: listing.external_id,
                    listingSource: listing.source,
                    currentExternal: externalId,
                    currentSource: this.pageSource,
                    externalMatch,
                    sourceMatch,
                    overallMatch
                });

                return overallMatch;
            });

            if (existingListing) {
                console.log('Popup: Found existing listing (by external_id + source):', existingListing);

                // ИСПРАВЛЯЕМ area_id если он undefined
                if (!existingListing.area_id) {
                    console.log('Popup: Fixing undefined area_id');
                    existingListing.area_id = areaId;
                    try {
                        await db.updateListing(existingListing);
                        console.log('Popup: area_id fixed and saved');
                    } catch (error) {
                        console.error('Popup: Error fixing area_id:', error);
                    }
                }

            } else {
                console.log('Popup: No existing listing found');
            }

            return existingListing;
        } catch (error) {
            console.error('Popup: Error checking existing listing:', error);
            return null;
        }
    }

    async updateParseButton() {
        const button = document.getElementById('parseListingBtn');
        const select = document.getElementById('areaSelect');

        if (!button || !select) {
            console.log('Popup: Parse button or select not found');
            return;
        }

        const areaSelected = select.value !== '';
        const canParse = this.isValidPage && areaSelected;

        console.log('Popup: updateParseButton called:', {
            isValidPage: this.isValidPage,
            areaSelected,
            canParse,
            currentUrl: this.currentTab?.url
        });

        button.disabled = !canParse;

        // Проверяем существует ли уже такое объявление  
        if (areaSelected && this.isValidPage) {
            this.existingListing = await this.checkExistingListing(select.value);
            console.log('Popup: updateParseButton - checking for existing listing:', {
                areaId: select.value,
                currentUrl: this.currentTab?.url,
                existingListing: this.existingListing
            });
        } else {
            this.existingListing = null;
        }

        // Обновляем текст кнопки
        const buttonText = document.getElementById('parseButtonText');
        if (buttonText) {
            if (!this.isValidPage) {
                buttonText.textContent = 'Неподходящая страница';
            } else if (!areaSelected) {
                buttonText.textContent = 'Выберите область';
            } else if (this.existingListing) {
                buttonText.textContent = 'Обновить объявление';
                console.log('Popup: Found existing listing, showing update button');
            } else {
                buttonText.textContent = 'Добавить объявление';
                console.log('Popup: No existing listing found, showing add button');
            }
        }

        console.log(`Popup: Parse button state - canParse=${canParse}, isValidPage=${this.isValidPage}, areaSelected=${areaSelected}, existing=${!!this.existingListing}`);
    }

    async handleParseClick() {
        if (this.isProcessing) {
            console.log('Popup: Parsing already in progress, ignoring click');
            return;
        }

        const areaSelect = document.getElementById('areaSelect');
        const areaId = areaSelect.value;

        if (!areaId) {
            this.showDetailedNotification('Выберите область для парсинга', 'warning');
            return;
        }

        try {
            this.isProcessing = true;
            const source = this.pageSource === 'avito' ? 'avito' : 'cian';
            console.log(`Popup: Parsing listing from ${source} for area ${areaId}`);

            this.setLoadingState(true);
            this.showDetailedNotification('🔄 Анализируем объявление...', 'info');

            // ВАЖНО: Проверяем существующее объявление ПЕРЕД парсингом
            const existingListing = await this.checkExistingListing(areaId);
            console.log('Popup: Pre-parse check - existing listing:', existingListing);

            // Отправляем запрос на парсинг
            const response = await this.sendMessageToContentScript({
                action: 'parseCurrentListing',
                areaId: areaId
            });

            if (response && response.success) {
                console.log('Popup: Parsed data received:', response.data);
                console.log('Popup: External ID in parsed data:', response.data.external_id);

                if (existingListing) {
                    // ОБНОВЛЯЕМ существующее объявление
                    console.log('Popup: Updating existing listing:', existingListing.id);
                    await this.updateExistingListingWithNotification(response.data, existingListing);

                } else {
                    // СОЗДАЕМ новое объявление
                    console.log('Popup: Saving new listing...');
                    await this.saveNewListingWithNotification(response.data);
                }

                // Обновляем интерфейс
                await this.loadData();
                await this.updateParseButton();

            } else {
                const errorMsg = response?.error || 'Неизвестная ошибка';
                console.error('Popup: Parsing error:', errorMsg);
                this.showDetailedNotification(`❌ Ошибка парсинга: ${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error('Popup: Error in handleParseClick:', error);
            this.showDetailedNotification(`❌ Ошибка: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.setLoadingState(false);
        }
    }

    async updateExistingListingWithNotification(parsedData, existingListing) {
        try {
            const oldPrice = existingListing.price;
            const newPrice = parsedData.price;
            const oldArea = existingListing.area_total;
            const newArea = parsedData.area_total;

            console.log('Popup: Updating existing listing, comparison:', {
                oldPrice, newPrice, priceChanged: oldPrice !== newPrice,
                oldArea, newArea, areaChanged: oldArea !== newArea
            });

            // Подготавливаем обновленные данные
            const updatedData = {
                ...existingListing,
                ...parsedData,
                id: existingListing.id, // Сохраняем ID
                created_at: existingListing.created_at, // Сохраняем дату создания
                updated_at: new Date(),
                last_seen: new Date()
            };

            // Проверяем изменения
            const changes = [];

            // Изменение цены
            if (newPrice && oldPrice !== newPrice) {
                console.log(`Popup: Price changed: ${oldPrice} → ${newPrice}`);

                if (!updatedData.price_history) {
                    updatedData.price_history = existingListing.price_history || [];
                }

                updatedData.price_history.push({
                    date: new Date(),
                    old_price: oldPrice,
                    new_price: newPrice
                });

                const priceDiff = newPrice - oldPrice;
                const priceIcon = priceDiff > 0 ? '📈' : '📉';
                const priceAction = priceDiff > 0 ? 'выросла' : 'снизилась';

                changes.push(`${priceIcon} Цена ${priceAction}: ${this.formatPrice(oldPrice)} → ${this.formatPrice(newPrice)}`);
            }

            // Изменение площади
            if (newArea && oldArea !== newArea) {
                const areaIcon = '📐';
                changes.push(`${areaIcon} Площадь: ${oldArea || 'н/д'} м² → ${newArea} м²`);
            }

            // Изменение других полей
            const fieldsToCheck = [
                { key: 'title', name: 'заголовок', icon: '📝' },
                { key: 'address', name: 'адрес', icon: '📍' },
                { key: 'floor', name: 'этаж', icon: '🏢' },
                { key: 'condition', name: 'состояние', icon: '🔧' }
            ];

            fieldsToCheck.forEach(field => {
                const oldValue = existingListing[field.key];
                const newValue = parsedData[field.key];
                if (oldValue !== newValue && newValue) {
                    changes.push(`${field.icon} ${field.name.charAt(0).toUpperCase() + field.name.slice(1)} обновлен`);
                }
            });

            // Сохраняем в базу данных
            console.log('Popup: Saving updated listing to database...');
            if (typeof db !== 'undefined' && db && typeof db.update === 'function') {
                await db.update('listings', updatedData);
                console.log('Popup: Listing updated via db.update');
            } else if (typeof db !== 'undefined' && db && typeof db.updateListing === 'function') {
                await db.updateListing(updatedData);
                console.log('Popup: Listing updated via db.updateListing');
            }

            // Показываем уведомление
            if (changes.length > 0) {
                const changeText = changes.join('\n');
                this.showDetailedNotification(`✅ Объявление обновлено!\n\n${changeText}`, 'success', 8000);
            } else {
                this.showDetailedNotification('✅ Объявление обновлено\n(изменений не обнаружено)', 'info', 4000);
            }

        } catch (error) {
            console.error('Popup: Error updating existing listing:', error);
            this.showDetailedNotification('❌ Ошибка обновления объявления', 'error');
        }
    }

    async saveNewListingWithNotification(parsedData) {
        try {
            console.log('Popup: Saving new listing:', parsedData);

            // Добавляем системные поля
            const listingData = {
                ...parsedData,
                id: this.generateId(),
                created_at: new Date(),
                updated_at: new Date(),
                last_seen: new Date()
            };

            // Сохраняем в базу
            const savedListing = await db.addListing(listingData);
            console.log('Popup: New listing saved:', savedListing);

            // Формируем детальное уведомление
            const details = [];

            if (parsedData.price) {
                details.push(`💰 Цена: ${this.formatPrice(parsedData.price)}`);
            }

            if (parsedData.area_total) {
                details.push(`📐 Площадь: ${parsedData.area_total} м²`);
            }

            if (parsedData.floor && parsedData.floors_total) {
                details.push(`🏢 Этаж: ${parsedData.floor}/${parsedData.floors_total}`);
            }

            if (parsedData.address) {
                details.push(`📍 ${parsedData.address}`);
            }

            const detailText = details.length > 0 ? '\n\n' + details.join('\n') : '';

            this.showDetailedNotification(
                `🎉 Новое объявление добавлено!${detailText}`,
                'success',
                6000
            );

        } catch (error) {
            console.error('Popup: Error saving new listing:', error);
            this.showDetailedNotification('❌ Ошибка сохранения объявления', 'error');
        }
    }

    showDetailedNotification(message, type = 'info', duration = 5000) {
        // Также вызываем старый метод для совместимости
        this.showStatus(message.split('\n')[0], type);

        // Создаем детальное уведомление
        const container = this.getOrCreateNotificationContainer();
        const id = Date.now().toString();

        const typeConfig = {
            success: {
                class: 'bg-green-50 border-green-200 text-green-800',
                icon: '✅',
                bgColor: 'bg-green-500'
            },
            error: {
                class: 'bg-red-50 border-red-200 text-red-800',
                icon: '❌',
                bgColor: 'bg-red-500'
            },
            warning: {
                class: 'bg-yellow-50 border-yellow-200 text-yellow-800',
                icon: '⚠️',
                bgColor: 'bg-yellow-500'
            },
            info: {
                class: 'bg-blue-50 border-blue-200 text-blue-800',
                icon: 'ℹ️',
                bgColor: 'bg-blue-500'
            }
        };

        const config = typeConfig[type] || typeConfig.info;

        const notification = document.createElement('div');
        notification.id = `notification-${id}`;
        notification.className = `notification-item border rounded-lg p-4 mb-3 shadow-lg ${config.class} transform translate-x-full transition-all duration-300 ease-in-out`;

        // Форматируем сообщение (поддержка переносов строк)
        const formattedMessage = message.replace(/\n/g, '<br>');

        notification.innerHTML = `
    <div class="flex items-start">
      <div class="flex-shrink-0">
        <div class="w-6 h-6 rounded-full ${config.bgColor} flex items-center justify-center text-white text-sm">
          ${config.icon}
        </div>
      </div>
      <div class="ml-3 flex-1">
        <div class="text-sm font-medium whitespace-pre-line" style="line-height: 1.4;">
          ${formattedMessage}
        </div>
      </div>
      <div class="ml-4">
        <button onclick="this.closest('.notification-item').remove()"
                class="text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
          </svg>
        </button>
      </div>
    </div>
  `;

        container.appendChild(notification);

        // Анимация появления
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Автоматическое удаление
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, duration);
    }

    getOrCreateNotificationContainer() {
        let container = document.getElementById('detailed-notifications');

        if (!container) {
            container = document.createElement('div');
            container.id = 'detailed-notifications';
            container.className = 'fixed top-4 right-4 z-50 w-80 max-w-sm';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        return container;
    }

    sendMessageToContentScript(message) {
        return new Promise((resolve) => {
            if (!this.currentTab) {
                console.error('Popup: No current tab available');
                resolve({ success: false, error: 'Нет активной вкладки' });
                return;
            }

            console.log('Popup: Sending message to content script:', message);
            console.log('Popup: Target tab ID:', this.currentTab.id);

            chrome.tabs.sendMessage(this.currentTab.id, message, (response) => {
                if (chrome.runtime.lastError) {
                    // console.error('Popup: Chrome runtime error:', chrome.runtime.lastError);
                    resolve({
                        success: false,
                        error: 'Не удалось подключиться к странице. Обновите страницу и попробуйте снова.'
                    });
                } else {
                    console.log('Popup: Response from content script:', response);
                    resolve(response || { success: false, error: 'Нет ответа от content script' });
                }
            });

            // Таймаут для безопасности
            setTimeout(() => {
                // console.warn('Popup: Content script response timeout');
                resolve({ success: false, error: 'Таймаут ответа от content script' });
            }, 10000);
        });
    }

    setLoadingState(loading) {
        const button = document.getElementById('parseListingBtn');
        const buttonText = document.getElementById('parseButtonText');
        const spinner = document.getElementById('parseSpinner');

        if (loading) {
            button.disabled = true;
            buttonText.textContent = 'Обработка...';
            if (spinner) spinner.classList.remove('hidden');
        } else {
            this.updateParseButton();
            if (spinner) spinner.classList.add('hidden');
        }
    }

    showStatus(message, type = 'info') {
        const statusMessage = document.getElementById('statusMessage');
        const statusText = document.getElementById('statusText');

        if (!statusMessage || !statusText) return;

        statusMessage.className = 'status-message ' + type;
        statusText.textContent = message;
        statusMessage.classList.remove('hidden');

        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    }

    openPage(pagePath) {
        const url = chrome.runtime.getURL(pagePath);
        chrome.tabs.create({ url: url });
        window.close();
    }

    formatPrice(price) {
        if (!price) return 'N/A';
        return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
    }

    generateId() {
        return 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// Глобальная переменная для доступа из HTML
let neocenkaPopup;

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup: DOM loaded, initializing popup...');
    neocenkaPopup = new NeocenkaPopup();
    initializeUpdateChecker();
});

// Инициализация проверки обновлений в popup
async function initializeUpdateChecker() {
    try {
        // Устанавливаем текущую версию
        const version = chrome.runtime.getManifest().version;
        document.getElementById('version-info').textContent = `Версия ${version}`;

        // Инициализируем менеджер обновлений
        if (window.updateManager) {
            await window.updateManager.init();
            
            // Проверяем наличие доступных обновлений
            const updateInfo = await window.updateManager.getUpdateInfo();
            if (updateInfo && updateInfo.available) {
                showPopupUpdateNotification(updateInfo);
            }
        }

        // Добавляем обработчик кнопки проверки обновлений
        document.getElementById('check-updates-popup').addEventListener('click', async () => {
            await checkUpdatesFromPopup();
        });

    } catch (error) {
        console.error('Ошибка инициализации проверки обновлений:', error);
    }
}

// Показать уведомление об обновлении в popup
function showPopupUpdateNotification(updateInfo) {
    const notification = document.getElementById('popup-update-notification');
    const text = document.getElementById('popup-update-text');
    const button = document.getElementById('popup-update-btn');

    text.textContent = `Доступно обновление до v${updateInfo.version}`;
    notification.classList.remove('hidden');

    button.addEventListener('click', () => {
        // Открываем страницу установки
        chrome.tabs.create({
            url: 'https://dmitrykrasavtsev1980.github.io/neocenka-extension/install_neocenka.html'
        });
        window.close(); // Закрываем popup
    });
}

// Проверка обновлений из popup
async function checkUpdatesFromPopup() {
    const button = document.getElementById('check-updates-popup');
    const originalContent = button.innerHTML;
    
    // Показываем спиннер
    button.innerHTML = `
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    `;
    button.disabled = true;

    try {
        if (window.updateManager) {
            const updateInfo = await window.updateManager.forceCheckForUpdates();
            
            if (updateInfo) {
                showPopupUpdateNotification(updateInfo);
                if (neocenkaPopup) {
                    neocenkaPopup.showStatus('Найдено обновление!', 'success');
                }
            } else {
                if (neocenkaPopup) {
                    neocenkaPopup.showStatus('У вас последняя версия', 'success');
                }
            }
        }
    } catch (error) {
        console.error('Ошибка проверки обновлений:', error);
        if (neocenkaPopup) {
            neocenkaPopup.showStatus('Ошибка проверки обновлений', 'error');
        }
    } finally {
        // Восстанавливаем кнопку
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.disabled = false;
        }, 1000);
    }
}