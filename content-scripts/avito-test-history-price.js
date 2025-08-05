// Точный поиск кнопки истории цен
function findPriceHistoryButtonPrecise() {
    // console.log('🎯 === ТОЧНЫЙ ПОИСК КНОПКИ ИСТОРИИ ЦЕН ===');

    // Ищем по классам из разметки
    const selectors = [
        '.price-history-entry-point-iKhax',
        '.K5h5l.price-history-entry-point-iKhax',
        'p[aria-haspopup="true"][aria-expanded="false"]:contains("История цены")',
        'p.T7ujv.Tdsqf.dsi88.cujIu.aStJv',
        '[class*="price-history-entry-point"]',
        'div.K5h5l p[tabindex="0"]'
    ];

    let button = null;

    for (const selector of selectors) {
        try {
            // Для простых селекторов
            if (!selector.includes(':contains')) {
                const elements = document.querySelectorAll(selector);
                // console.log(`Селектор "${selector}": найдено ${elements.length} элементов`);

                elements.forEach(el => {
                    const text = el.textContent || '';
                    if (text.includes('История цены')) {
                        button = el;
                        // console.log('✅ Найден элемент истории цен:', el);
                    }
                });
            }
        } catch (e) {
            // Игнорируем ошибки
        }
    }

    // Если не нашли, ищем по тексту
    if (!button) {
        const allP = document.querySelectorAll('p');
        allP.forEach(p => {
            if (p.textContent && p.textContent.trim() === 'История цены') {
                button = p;
                // console.log('✅ Найден элемент по тексту:', p);
                // console.log('  Классы:', p.className);
                // console.log('  Родительский элемент:', p.parentElement);
            }
        });
    }

    return button;
}

// Активация tooltip с историей цен
function activatePriceHistoryTooltip() {
    // console.log('🚀 === АКТИВАЦИЯ TOOLTIP ИСТОРИИ ЦЕН ===');

    const button = findPriceHistoryButtonPrecise();

    if (!button) {
        // console.log('❌ Кнопка не найдена');
        return;
    }

    // console.log('✅ Кнопка найдена, пробуем активировать tooltip...');

    // Сначала устанавливаем фокус
    if (button.focus) {
        button.focus();
        // console.log('📍 Фокус установлен');
    }

    // Пробуем разные события
    const events = [
        new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }),
        new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }),
        new PointerEvent('pointerenter', { bubbles: true, cancelable: true }),
        new PointerEvent('pointerover', { bubbles: true, cancelable: true }),
        new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: button.getBoundingClientRect().left + 10,
            clientY: button.getBoundingClientRect().top + 10
        })
    ];

    events.forEach((event, index) => {
        setTimeout(() => {
            // console.log(`Отправляем событие ${event.type}`);
            button.dispatchEvent(event);

            // Также пробуем на родительский элемент
            if (button.parentElement) {
                button.parentElement.dispatchEvent(event);
            }
        }, index * 100);
    });

    // Проверяем изменение aria-expanded
    setTimeout(() => {
        const expanded = button.getAttribute('aria-expanded');
        // console.log('aria-expanded после активации:', expanded);

        if (expanded === 'true') {
            // console.log('✅ Tooltip активирован!');
            findTooltipContent();
        } else {
            // console.log('⚠️ aria-expanded все еще false, tooltip может не открыться');
        }
    }, 1000);
}

// Поиск содержимого tooltip
function findTooltipContent() {
    // console.log('🔍 === ПОИСК СОДЕРЖИМОГО TOOLTIP ===');

    // Ищем tooltip в разных местах
    const tooltipSelectors = [
        '[role="tooltip"]',
        '[data-popper-placement]',
        '[class*="tooltip"][class*="show"]',
        '[class*="tooltip"][class*="visible"]',
        '[class*="popover"]',
        '[class*="overlay"]',
        '.portal-container > div',
        '#portal-root > div',
        'body > div[style*="position: absolute"]',
        'body > div[style*="z-index"]'
    ];

    let tooltipFound = false;

    tooltipSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            const text = el.textContent || '';
            // Проверяем, содержит ли элемент данные о ценах
            if ((text.includes('₽') || text.includes('руб')) &&
                (text.includes('янв') || text.includes('фев') || text.includes('мар') ||
                 text.includes('апр') || text.includes('май') || text.includes('июн') ||
                 text.includes('июл') || text.includes('авг') || text.includes('сен') ||
                 text.includes('окт') || text.includes('ноя') || text.includes('дек'))) {

                // console.log('✅ Найден потенциальный tooltip с историей цен!');
                // console.log('  Селектор:', selector);
                // console.log('  Элемент:', el);
                // console.log('  HTML:', el.innerHTML.substring(0, 500) + '...');

                tooltipFound = true;
                //parsePriceHistoryData(el);
                // console.log('  HTML:', extractPriceHistory(el));
            }
        });
    });

    if (!tooltipFound) {
        // console.log('❌ Tooltip с историей цен не найден');
    }

    return tooltipFound;
}

// Парсинг данных истории цен
function parsePriceHistoryData(tooltipElement) {
    // console.log('📊 === ПАРСИНГ ДАННЫХ ИСТОРИИ ЦЕН ===');

    const priceHistory = [];

    // Паттерны для извлечения данных
    const pricePattern = /(\d{1,3}(?:\s?\d{3})*)\s*₽/g;
    const datePattern = /(\d{1,2})\s*(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s*(\d{4}))?/gi;

    // Получаем весь текст
    const fullText = tooltipElement.textContent;
    // console.log('Полный текст tooltip:', fullText);

    // Ищем все строки с ценами
    const lines = fullText.split('\n').map(line => line.trim()).filter(line => line);
    // console.log('Строки с ценами:', lines);

    lines.forEach(line => {
        const priceMatch = line.match(pricePattern);
        const dateMatch = line.match(datePattern);

        if (priceMatch && dateMatch) {
            const price = parseInt(priceMatch[0].replace(/\s/g, '').replace('₽', ''));
            const date = dateMatch[0];

            priceHistory.push({
                date: date,
                price: price,
                formatted_price: priceMatch[0],
                raw_text: line
            });

            // console.log(`📅 ${date}: ${priceMatch[0]}`);
        }
    });

    // Альтернативный подход - ищем структурированные элементы
    const listItems = tooltipElement.querySelectorAll('li, div[class*="item"], div[class*="row"]');
    listItems.forEach(item => {
        const text = item.textContent;
        const priceMatch = text.match(pricePattern);
        const dateMatch = text.match(datePattern);

        if (priceMatch && dateMatch && !priceHistory.some(h => h.date === dateMatch[0])) {
            priceHistory.push({
                date: dateMatch[0],
                price: parseInt(priceMatch[0].replace(/\s/g, '').replace('₽', '')),
                formatted_price: priceMatch[0],
                raw_text: text.trim()
            });
        }
    });

    // console.log('\n📈 Итоговая история цен:', priceHistory);

    // Сохраняем глобально
    window.parsedPriceHistory = priceHistory;

    return priceHistory;
}

// Комплексный тест извлечения истории цен
function testPriceHistoryComplete() {
    // console.log('🧪 === КОМПЛЕКСНЫЙ ТЕСТ ИСТОРИИ ЦЕН ===\n');

    // Шаг 1: Находим кнопку
    const button = findPriceHistoryButtonPrecise();
    if (!button) {
        // console.log('❌ Тест провален: кнопка не найдена');
        return;
    }

    // Шаг 2: Запускаем мониторинг DOM
    // console.log('\n📡 Запускаем мониторинг изменений DOM...');

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    const text = node.textContent || '';
                    if (text.includes('₽') && (text.includes('янв') || text.includes('фев') || text.includes('мар'))) {
                        // console.log('\n🎯 ОБНАРУЖЕН TOOLTIP!');
                        // console.log('Элемент:', node);
                        parsePriceHistoryData(node);
                        observer.disconnect();
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Шаг 3: Активируем tooltip
    setTimeout(() => {
        // console.log('\n🖱️ Активируем tooltip...');
        activatePriceHistoryTooltip();
    }, 500);

    // Шаг 4: Проверяем результат
    setTimeout(() => {
        if (!window.parsedPriceHistory || window.parsedPriceHistory.length === 0) {
            // console.log('\n💡 Если автоматическая активация не сработала:');
            // console.log('1. Наведите курсор мыши на текст "История цены" под ценой');
            // console.log('2. Подождите появления tooltip');
            // console.log('3. Затем выполните: findTooltipContent()');
        } else {
            // console.log('\n✅ История цен успешно извлечена!');
            // console.log('Данные доступны в window.parsedPriceHistory');
        }

        observer.disconnect();
    }, 5000);
}

function extractPriceHistory(element) {
    const priceHistory = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // месяцы в JS 0-11

    // Словарь для преобразования названий месяцев в числовые значения
    const monthMap = {
        'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
        'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
        'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
    };

    // Находим все блоки с записями об изменении цены
    const historyEntries = element.querySelectorAll('div[style*="--module-spacer-column-gap: var(--theme-gap-0)"]');

    let prevYear = currentYear;
    let prevMonth = currentMonth;

    historyEntries.forEach(entry => {
        // Извлекаем дату
        const dateElement = entry.querySelector('p:first-child');
        const dateText = dateElement ? dateElement.textContent.trim() : null;

        // Парсим дату
        let day, month, monthNum, year;
        if (dateText) {
            const dateParts = dateText.split(' ');
            day = parseInt(dateParts[0]);
            month = dateParts[1];
            monthNum = monthMap[month.toLowerCase()] || 0;

            // Определяем год
            if (monthNum > prevMonth) {
                // Если текущий месяц в записи больше предыдущего, значит это прошлый год
                prevYear--;
            }
            prevMonth = monthNum;

            year = prevYear;
        }

        // Извлекаем цену
        const priceElement = entry.querySelector('p.obLSF') ||
                            entry.querySelector('p:last-child');
        const price = priceElement ? priceElement.textContent.trim() : null;

        // Извлекаем изменение цены (если есть)
        const changeElement = entry.parentElement.querySelector('p[class*="_3rH6"]');
        let change = null;
        let changeType = null;

        if (changeElement) {
            change = changeElement.textContent.trim();
            // Определяем тип изменения (увеличение/уменьшение)
            changeType = changeElement.classList.contains('FcB0L') ? 'increase' :
                         changeElement.classList.contains('LTb57') ? 'decrease' :
                         null;
        }

        // Проверяем, является ли запись публикацией
        const isPublication = entry.parentElement.querySelector('p[style*="color: rgb(117, 117, 117)"]') !== null;

        if (dateText && price) {
            const formattedDate = `${day.toString().padStart(2, '0')}.${monthNum.toString().padStart(2, '0')}.${year}`;

            priceHistory.push({
                date: dateText,
                fullDate: formattedDate,
                year,
                price,
                change: isPublication ? null : change,
                changeType: isPublication ? null : changeType,
                isPublication,
                timestamp: new Date(year, monthNum - 1, day).getTime()
            });
        }
    });

    // Сортируем по дате (от новых к старым)
    priceHistory.sort((a, b) => b.timestamp - a.timestamp);

    return priceHistory;
}



// Запускаем тест
testPriceHistoryComplete();