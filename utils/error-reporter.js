/**
 * Система отправки ошибок парсинга в Telegram для разработки
 */

/**
 * Отправляет детальную информацию об ошибке парсинга в Telegram
 * @param {Object} errorInfo - информация об ошибке
 * @param {string} errorInfo.parameter - название параметра, при парсинге которого произошла ошибка
 * @param {string} errorInfo.error - описание ошибки
 * @param {string} errorInfo.url - ссылка на объявление
 * @param {string} errorInfo.source - источник (avito/cian)
 * @param {string} errorInfo.method - метод, в котором произошла ошибка
 * @param {Object} errorInfo.context - дополнительный контекст (селекторы, найденные элементы и т.д.)
 */
function reportParsingError(errorInfo) {
    const {
        parameter = 'неизвестный параметр',
        error = 'неизвестная ошибка',
        url = 'URL не указан',
        source = 'неизвестный источник',
        method = 'неизвестный метод',
        context = {}
    } = errorInfo;

    // Формируем структурированное сообщение
    let message = `🚨 ОШИБКА ПАРСИНГА\n\n`;
    message += `📍 Источник: ${source}\n`;
    message += `🔧 Параметр: ${parameter}\n`;
    message += `⚙️ Метод: ${method}\n`;
    message += `❌ Ошибка: ${error}\n\n`;
    message += `🔗 URL: ${url}\n\n`;

    // Добавляем контекст если есть
    if (context.selectors && context.selectors.length > 0) {
        message += `🎯 Проверенные селекторы:\n`;
        context.selectors.forEach(selector => {
            message += `• ${selector}\n`;
        });
        message += '\n';
    }

    if (context.foundElements !== undefined) {
        message += `📊 Найдено элементов: ${context.foundElements}\n\n`;
    }

    if (context.expectedValue) {
        message += `💭 Ожидаемое значение: ${context.expectedValue}\n\n`;
    }

    if (context.actualValue) {
        message += `📋 Фактическое значение: ${context.actualValue}\n\n`;
    }

    // Добавляем время ошибки
    const timestamp = new Date().toLocaleString('ru-RU', {
        timeZone: 'Asia/Novosibirsk',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    message += `⏰ Время: ${timestamp}`;

    // Отправляем в Telegram
    SendMessageTelegram(message);
}

/**
 * Базовая функция отправки сообщений в Telegram
 * @param {string} text - текст сообщения для отправки
 */
function SendMessageTelegram(text) {
    let url = 'https://api.telegram.org/bot';
    let token = '';
    let chatId = '';
    
    // Кодируем текст для URL
    const encodedText = encodeURIComponent(text);
    
    fetch(url + token + '/sendMessage?chat_id=' + chatId + '&text=' + encodedText,
        {
            method: 'GET',
        },
    )
    .then(response => response.json())
    .then(data => {
        if (!data.ok) {
            console.error('Telegram API error:', data);
        }
    })
    .catch(error => {
        // Повторная отправка через минуту
        setTimeout(function() {
            SendMessageTelegram(text);
        }, 60000);
    });
}

/**
 * Вспомогательная функция для быстрого создания отчета об ошибке селектора
 * @param {string} parameter - название параметра
 * @param {Array<string>} selectors - список проверенных селекторов
 * @param {string} url - URL объявления
 * @param {string} method - метод парсинга
 */
function reportSelectorError(parameter, selectors, url, method = 'неизвестный метод') {
    reportParsingError({
        parameter: parameter,
        error: 'Не найден ни один подходящий селектор',
        url: url,
        source: url.includes('avito') ? 'avito' : (url.includes('cian') ? 'cian' : 'неизвестный'),
        method: method,
        context: {
            selectors: selectors,
            foundElements: 0
        }
    });
}

/**
 * Вспомогательная функция для отчета об ошибке извлечения значения
 * @param {string} parameter - название параметра
 * @param {string} selector - селектор, который нашел элемент
 * @param {string} actualValue - фактически найденное значение
 * @param {string} expectedValue - ожидаемый формат значения
 * @param {string} url - URL объявления
 * @param {string} method - метод парсинга
 */
function reportExtractionError(parameter, selector, actualValue, expectedValue, url, method = 'неизвестный метод') {
    reportParsingError({
        parameter: parameter,
        error: 'Не удалось извлечь корректное значение из найденного элемента',
        url: url,
        source: url.includes('avito') ? 'avito' : (url.includes('cian') ? 'cian' : 'неизвестный'),
        method: method,
        context: {
            selectors: [selector],
            foundElements: 1,
            actualValue: actualValue,
            expectedValue: expectedValue
        }
    });
}

// Экспортируем функции для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        reportParsingError, 
        reportSelectorError, 
        reportExtractionError, 
        SendMessageTelegram 
    };
}

// Делаем доступными в глобальной области
window.reportParsingError = reportParsingError;
window.reportSelectorError = reportSelectorError;
window.reportExtractionError = reportExtractionError;
window.SendMessageTelegram = SendMessageTelegram;