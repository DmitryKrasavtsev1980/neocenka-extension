// ТЕСТ ПАРСИНГА ИСТОРИИ ЦЕНЫ - для запуска в консоли браузера на странице Avito

console.log('🚀 === ТЕСТ ПАРСИНГА ИСТОРИИ ЦЕНЫ ===');

// Функция для тестирования поиска кнопки
function testFindPriceHistoryButton() {
    console.log('🔍 === ТЕСТ ПОИСКА КНОПКИ ===');
    
    // Селекторы из обновленной функции
    const selectors = [
        'p[aria-haspopup="true"][aria-expanded="false"][tabindex="0"].T7ujv.Tdsqf.dsi88.cujIu.aStJv',
        'div.K5h5l.price-history-entry-point-iKhax p[tabindex="0"]',
        'p.T7ujv.Tdsqf.dsi88.cujIu.aStJv',
        'div.K5h5l p[tabindex="0"]', 
        'p[aria-haspopup="true"][aria-expanded="false"]',
        '.price-history-entry-point-iKhax p',
        '.K5h5l.price-history-entry-point-iKhax',
        '[class*="price-history-entry-point"]'
    ];
    
    let button = null;
    
    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            console.log(`🎯 Селектор "${selector}": найдено ${elements.length} элементов`);
            
            elements.forEach((el, index) => {
                const text = el.textContent || '';
                console.log(`  Элемент ${index + 1}: "${text.trim()}"`);
                
                if (text.includes('история цены') || text.includes('История цены')) {
                    button = el;
                    console.log('✅ НАЙДЕНА КНОПКА ИСТОРИИ ЦЕН!');
                    console.log('  📝 Текст:', text);
                    console.log('  🏷️ Классы:', el.className);
                    console.log('  📋 aria-haspopup:', el.getAttribute('aria-haspopup'));
                    console.log('  📋 aria-expanded:', el.getAttribute('aria-expanded'));
                    console.log('  📋 tabindex:', el.getAttribute('tabindex'));
                    console.log('  🖼️ Элемент:', el);
                }
            });
        } catch (e) {
            console.log(`⚠️ Ошибка в селекторе "${selector}":`, e.message);
        }
        
        if (button) break;
    }
    
    if (!button) {
        console.log('❌ Кнопка не найдена. Проверим общую информацию:');
        console.log('  📊 Всего p элементов:', document.querySelectorAll('p').length);
        console.log('  📊 Элементов с tabindex:', document.querySelectorAll('[tabindex]').length);
        console.log('  📊 Элементов с aria-haspopup:', document.querySelectorAll('[aria-haspopup]').length);
        console.log('  📊 Элементов .price-history-entry-point-iKhax:', document.querySelectorAll('.price-history-entry-point-iKhax').length);
        
        // Ищем любые элементы со словом "история"
        const allElements = document.querySelectorAll('*');
        const historyElements = [];
        allElements.forEach(el => {
            const text = (el.textContent || '').toLowerCase();
            if (text.includes('истор') && el.textContent.length < 100) {
                historyElements.push({
                    tag: el.tagName,
                    text: el.textContent.trim(),
                    classes: el.className,
                    hasTabindex: el.hasAttribute('tabindex'),
                    element: el
                });
            }
        });
        
        if (historyElements.length > 0) {
            console.log('💡 Найденные элементы со словом "истор":', historyElements);
        }
    }
    
    return button;
}

// Функция для тестирования активации tooltip
function testActivateTooltip(button) {
    if (!button) {
        console.log('❌ Нет кнопки для тестирования');
        return;
    }
    
    console.log('🖱️ === ТЕСТ АКТИВАЦИИ TOOLTIP ===');
    console.log('🎯 Тестируем кнопку:', button);
    
    // Получаем координаты
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    console.log('📐 Координаты кнопки:', { x: centerX, y: centerY, rect });
    console.log('📋 Начальное aria-expanded:', button.getAttribute('aria-expanded'));
    
    // Наблюдатель за изменениями DOM
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    const text = node.textContent || '';
                    if (text.includes('₽') && (text.includes('янв') || text.includes('фев') || 
                        text.includes('мар') || text.includes('апр') || text.includes('май') || 
                        text.includes('июн') || text.includes('июл') || text.includes('авг') || 
                        text.includes('сен') || text.includes('окт') || text.includes('ноя') || 
                        text.includes('дек'))) {
                        
                        console.log('🎉 TOOLTIP ПОЯВИЛСЯ!');
                        console.log('📦 Элемент:', node);
                        console.log('📝 Содержимое:', text.substring(0, 200) + '...');
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
    
    // Активируем tooltip
    setTimeout(() => {
        console.log('1️⃣ Устанавливаем фокус...');
        button.focus();
    }, 100);
    
    setTimeout(() => {
        console.log('2️⃣ mouseenter...');
        button.dispatchEvent(new MouseEvent('mouseenter', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY
        }));
    }, 200);
    
    setTimeout(() => {
        console.log('3️⃣ mouseover...');
        button.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY
        }));
    }, 300);
    
    setTimeout(() => {
        console.log('4️⃣ Проверяем aria-expanded:', button.getAttribute('aria-expanded'));
        
        // Ищем tooltip в DOM
        const tooltips = document.querySelectorAll('[role="tooltip"], .tooltip, [class*="tooltip"]');
        console.log('🔍 Найдено tooltip элементов:', tooltips.length);
        
        tooltips.forEach((tooltip, index) => {
            console.log(`  Tooltip ${index + 1}:`, tooltip);
            console.log(`  Содержимое: ${tooltip.textContent.substring(0, 100)}...`);
        });
        
        observer.disconnect();
    }, 1000);
}

// Запускаем тесты
const button = testFindPriceHistoryButton();
if (button) {
    setTimeout(() => testActivateTooltip(button), 1000);
} else {
    console.log('❌ Тесты остановлены - кнопка не найдена');
}