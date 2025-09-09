/**
 * Background script для Chrome Extension Neocenka
 * Обрабатывает сообщения от content scripts и popup
 */

// Импортируем модули данных
try {
  importScripts('/data/database.js');
} catch (error) {
  console.error('Ошибка загрузки модулей:', error);
}

class NeocenkaBackground {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.init();
  }

  async init() {
    try {
      // console.log('Начинаем инициализацию background script...');

      // Проверяем доступность классов
      if (typeof NeocenkaDB === 'undefined') {
        throw new Error('NeocenkaDB не найден. Проверьте импорт database.js');
      }

      // Инициализируем базу данных
      this.db = self.db || new NeocenkaDB();
      await this.db.init();

      this.isInitialized = true;
      // console.log('Background script успешно инициализирован');
    } catch (error) {
      console.error('Ошибка инициализации background script:', error);
      this.isInitialized = false;
    }

    // Настраиваем обработчики событий
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Обработка сообщений от content scripts и popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Указываем, что ответ будет асинхронным
    });

    // Обработка установки расширения
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstall(details);
    });

    // Обработка обновления вкладок
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });
  }

  /**
   * Обработчик сообщений
   */
  async handleMessage(request, sender, sendResponse) {
    try {
      // Проверяем инициализацию
      if (!this.isInitialized) {
        sendResponse({
          success: false,
          error: 'Background script не инициализирован'
        });
        return;
      }

      switch (request.action) {
        case 'parseListing':
          const result = await this.handleParseListing(request.listingData);
          sendResponse(result);
          break;

        case 'debugLog':
          // Обрабатываем debug сообщения от content-scripts
          await this.handleDebugLog(request);
          sendResponse({ success: true });
          break;

        case 'getDebugLogs':
          sendResponse({ success: true, logs: this.getDebugLogs() });
          break;

        case 'clearDebugLogs':
          this.clearDebugLogs();
          sendResponse({ success: true });
          break;

        case 'openTab':
          const tab = await chrome.tabs.create({ url: request.url });
          sendResponse({ success: true, tabId: tab.id });
          break;

        case 'getSegments':
          const segments = await this.db.getSegments();
          sendResponse({ success: true, segments: segments });
          break;

        case 'getSegmentStats':
          const stats = await this.getSegmentStats(request.segmentId);
          sendResponse({ success: true, stats: stats });
          break;

        case 'updateListingStatus':
          await this.updateListingStatus(request.listingId, request.status);
          sendResponse({ success: true });
          break;

        case 'processSegmentDuplicates':
          // УДАЛЕН: обработка дублей
          sendResponse({ success: false, error: 'Функция обработки дублей временно недоступна' });
          break;

        case 'checkHealth':
          sendResponse({
            success: true,
            isInitialized: this.isInitialized,
            dbAvailable: !!this.db
          });
          break;

        case 'openTabAndParse':
          const parseResult = await this.handleOpenTabAndParse(request.url);
          sendResponse(parseResult);
          break;

        case 'parseMassByFilter':
          const massParseResult = await this.handleParseMassByFilter(request);
          sendResponse(massParseResult);
          break;

        case 'checkListingExists':
          const existsResult = await this.handleCheckListingExists(request);
          sendResponse(existsResult);
          break;

        case 'getAllListings':
          const allListingsResult = await this.handleGetAllListings();
          sendResponse(allListingsResult);
          break;

        case 'fetchImage':
          const imageResult = await this.handleFetchImage(request.url);
          sendResponse(imageResult);
          break;

        case 'parseListingUrl':
          const parseUrlResult = await this.handleParseListingUrl(request.url);
          sendResponse(parseUrlResult);
          break;

        default:
          sendResponse({ success: false, error: 'Неизвестное действие' });
      }
    } catch (error) {
      console.error('Ошибка в handleMessage:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Обработка парсинга объявления
   */
  async handleParseListing(listingData) {
    try {
      if (!listingData) {
        throw new Error('Отсутствуют данные объявления');
      }

      // НЕ добавляем привязку к сегментам или областям
      // Объявления находятся по геопространственному принципу - по координатам и полигону

      // Проверяем, существует ли уже такое объявление
      const existingListing = await this.db.getListingByExternalId(
        listingData.source,
        listingData.external_id
      );

      if (existingListing) {
        // Обновляем существующее объявление
        listingData.id = existingListing.id;
        listingData.created_at = existingListing.created_at;

        // Проверяем изменение цены
        if (existingListing.price !== listingData.price) {
          if (!listingData.price_history) {
            listingData.price_history = existingListing.price_history || [];
          }

          listingData.price_history.push({
            date: new Date(),
            old_price: existingListing.price,
            new_price: listingData.price
          });
        }

        await this.db.update('listings', listingData);

        return {
          success: true,
          action: 'updated',
          message: 'Объявление обновлено',
          listingId: existingListing.id
        };
      } else {
        // Создаем новое объявление без привязки к объекту
        // Объекты недвижимости создаются только при обработке дублей
        const newListing = await this.db.add('listings', listingData);

        return {
          success: true,
          action: 'created',
          message: 'Объявление добавлено',
          listingId: newListing.id
        };
      }
    } catch (error) {
      console.error('Ошибка при обработке объявления:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // УДАЛЕН: метод updateRealEstateObject

  /**
   * Получение статистики сегмента
   */
  async getSegmentStats(segmentId) {
    try {
      const listings = await this.db.getListingsBySegment(segmentId);
      // УДАЛЕН: работа с objects таблицей

      return {
        totalListings: listings.length,
        activeListings: listings.filter(l => l.status === 'active').length,
        archivedListings: listings.filter(l => l.status === 'archived').length,
        needsProcessing: listings.filter(l => l.status === 'needs_processing').length
      };
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      return null;
    }
  }

  /**
   * Обработка debug сообщений от content-scripts
   */
  async handleDebugLog(request) {
    // Сохраняем debug сообщения в памяти для отображения в popup
    if (!this.debugLogs) {
      this.debugLogs = [];
    }

    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp: request.timestamp,
      level: request.level,
      source: request.source,
      url: request.url,
      data: request.data,
      created: new Date().toISOString()
    };

    this.debugLogs.push(logEntry);

    // Ограничиваем количество сохраненных логов (последние 100)
    if (this.debugLogs.length > 100) {
      this.debugLogs = this.debugLogs.slice(-100);
    }

    // Если есть открытые popup окна, отправляем им debug сообщение
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url.includes('chrome-extension://') && tab.url.includes('popup.html')) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'newDebugLog',
            logEntry: logEntry
          }).catch(() => {
            // Игнорируем ошибки отправки
          });
        }
      }
    } catch (error) {
      // Игнорируем ошибки
    }
  }

  /**
   * Получение всех debug логов
   */
  getDebugLogs() {
    return this.debugLogs || [];
  }

  /**
   * Очистка debug логов
   */
  clearDebugLogs() {
    this.debugLogs = [];
  }

  /**
   * Обновление статуса объявления
   */
  async updateListingStatus(listingId, status) {
    try {
      const listing = await this.db.get('listings', listingId);
      if (!listing) return;

      listing.status = status;
      listing.updated_at = new Date();

      if (status === 'archived') {
        listing.last_seen = new Date();
      }

      await this.db.update('listings', listing);

      // УДАЛЕН: обновление объекта недвижимости
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
    }
  }

// УДАЛЕН: метод обработки дублей

  /**
   * Обработка установки расширения
   */
  async handleInstall(details) {
    if (details.reason === 'install') {
      // Открываем страницу приветствия
      chrome.tabs.create({
        url: chrome.runtime.getURL('pages/main.html?welcome=true')
      });
    }
  }

  /**
   * Обработка обновления вкладок
   */
  handleTabUpdate(tabId, changeInfo, tab) {
    // Можно добавить логику для автоматической проверки статуса объявлений
    if (changeInfo.status === 'complete' && tab.url) {
      // Проверяем, это ли страница объявления, которое мы отслеживаем
      this.checkTrackedListing(tab.url);
    }
  }

  /**
   * Проверка отслеживаемого объявления
   */
  async checkTrackedListing(url) {
    try {
      // Извлекаем ID из URL
      let externalId = null;
      let source = null;

      if (url.includes('avito.ru')) {
        const match = url.match(/_(\d+)$/);
        if (match) {
          externalId = match[1];
          source = 'avito';
        }
      } else if (url.includes('cian.ru')) {
        const match = url.match(/\/(\d+)\/$/);
        if (match) {
          externalId = match[1];
          source = 'cian';
        }
      }

      if (externalId && source) {
        // Проверяем, есть ли это объявление в базе
        const listing = await this.db.getListingByExternalId(source, externalId);
        if (listing) {
          // Можно отправить сообщение content script для проверки статуса
          // console.log(`Найдено отслеживаемое объявление: ${listing.title}`);
        }
      }
    } catch (error) {
      console.error('Ошибка проверки объявления:', error);
    }
  }

  /**
   * Открытие вкладки и парсинг объявления
   */
  async handleOpenTabAndParse(url) {
    return new Promise((resolve) => {
      // Открываем новую вкладку
      chrome.tabs.create({ url: url, active: false }, (tab) => {
        let attempts = 0;
        const maxAttempts = 10; // Максимум попыток
        const attemptInterval = 2000; // Интервал между попытками

        const tryParse = () => {
          attempts++;
          
          // Отправляем сообщение для парсинга
          chrome.tabs.sendMessage(tab.id, {
            action: 'parseCurrentListing'
            // НЕ передаем segmentId - объявления находятся по координатам
          }, async (response) => {
            if (chrome.runtime.lastError) {
              // Страница еще не загружена или content script не готов
              if (attempts < maxAttempts) {
                setTimeout(tryParse, attemptInterval);
                return;
              } else {
                // Закрываем вкладку и возвращаем ошибку
                //chrome.tabs.remove(tab.id);
                resolve({
                  success: false,
                  error: 'Не удалось связаться с content script'
                });
                return;
              }
            }

            // Закрываем вкладку
            //chrome.tabs.remove(tab.id);

            if (response && response.success && response.data) {
              // Сохраняем данные в базу
              const saveResult = await this.handleParseListing(response.data);
              
              if (saveResult.success) {
                resolve({
                  success: true,
                  data: response.data,
                  saved: true
                });
              } else {
                resolve({
                  success: true,
                  data: response.data,
                  saved: false,
                  saveError: saveResult.error
                });
              }
            } else {
              resolve({
                success: false,
                error: response?.error || 'Не удалось спарсить объявление'
              });
            }
          });
        };

        // Ждем немного, чтобы страница начала загружаться
        setTimeout(tryParse, 3000);
      });
    });
  }

  /**
   * Массовый парсинг объявлений по фильтру
   */
  async handleParseMassByFilter(request) {
    try {
      const { source, filterUrl, areaId } = request;
      
      console.log(`Начинаем массовый парсинг ${source} по фильтру:`, filterUrl);
      
      // Открываем страницу с фильтром
      const tab = await chrome.tabs.create({ 
        url: filterUrl, 
        active: false 
      });

      // Ждем загрузки и отправляем команду на массовый парсинг
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            // Отправляем сообщение content script'у для массового парсинга
            chrome.tabs.sendMessage(tab.id, {
              action: 'parseMassByFilter',
              source: source,
              areaId: areaId
            }, async (response) => {
              // НЕ закрываем вкладку - оставляем открытой для просмотра результатов

              if (chrome.runtime.lastError) {
                resolve({
                  success: false,
                  error: 'Не удалось связаться с content script'
                });
                return;
              }

              if (response && response.success) {
                resolve({
                  success: true,
                  parsed: response.parsed || 0,
                  errors: response.errors || 0
                });
              } else {
                resolve({
                  success: false,
                  error: response?.error || 'Ошибка массового парсинга'
                });
              }
            });
          } catch (error) {
            // НЕ закрываем вкладку при ошибке - оставляем для отладки
            resolve({
              success: false,
              error: error.message
            });
          }
        }, 5000); // Ждем 5 секунд для загрузки страницы
      });

    } catch (error) {
      console.error('Ошибка в handleParseMassByFilter:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Проверяет существование объявления в базе данных
   */
  async handleCheckListingExists(request) {
    try {
      const { source, externalId } = request;
      
      if (!source || !externalId) {
        return {
          success: false,
          error: 'Не указан источник или ID объявления'
        };
      }

      // Проверяем существование объявления в базе данных
      const existingListing = await this.db.getListingByExternalId(source, externalId);
      
      const result = {
        success: true,
        exists: !!existingListing
      };
      
      // Логируем только если объявление найдено, для отладки
      if (existingListing) {
        console.log(`📋 Background: Найдено существующее объявление: ID=${existingListing.external_id}, title="${existingListing.title}"`);
      }
      
      return result;

    } catch (error) {
      console.error('❌ Background: Ошибка проверки существования объявления:', error);
      return {
        success: false,
        error: error.message,
        exists: false // В случае ошибки считаем объявление новым
      };
    }
  }

  /**
   * Получает все объявления из базы данных для отладки
   */
  async handleGetAllListings() {
    try {
      const listings = await this.db.getAll('listings');
      return {
        success: true,
        listings: listings
      };
    } catch (error) {
      console.error('❌ Background: Ошибка получения всех объявлений:', error);
      return {
        success: false,
        error: error.message,
        listings: []
      };
    }
  }

  /**
   * Загрузка изображения через background script для обхода CORS
   */
  async handleFetchImage(url) {
    try {
      // Используем fetch с полными правами background script
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Получаем данные как ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      
      // Конвертируем в массив для передачи через Chrome API
      const uint8Array = new Uint8Array(arrayBuffer);
      
      return {
        success: true,
        data: Array.from(uint8Array), // Конвертируем в обычный массив для сериализации
        contentType: response.headers.get('content-type') || 'image/jpeg'
      };

    } catch (error) {
      console.warn(`Ошибка загрузки изображения ${url}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Ожидаем загрузки всех модулей перед инициализацией
function initializeBackground() {
  if (typeof NeocenkaDB !== 'undefined') {
    // console.log('Все модули загружены, инициализируем background script');
    const neocenkaBackground = new NeocenkaBackground();
  } else {
    // console.log('Модули еще не загружены, повторная попытка через 100ms');
    setTimeout(initializeBackground, 100);
  }
}

// Инициализируем background script
initializeBackground();