/**
 * HTMLExportManager - Генератор автономных HTML отчётов
 * Создаёт полнофункциональные HTML файлы с точной копией панели отчётов
 * Версия 2.0 - с поддержкой всех графиков и флиппинг отчёта
 */
class HTMLExportManager {
    constructor() {
        this.debugEnabled = false;
        this.init();
    }

    async init() {
        try {
            this.debugEnabled = await this.isDebugEnabled();
            if (this.debugEnabled) {
                console.log('🔧 HTMLExportManager v2.0: Инициализация');
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации HTMLExportManager:', error);
        }
    }

    /**
     * Проверка настроек отладки
     */
    async isDebugEnabled() {
        try {
            if (!window.db || !window.db.db) return false;
            const settings = await window.db.getSettings();
            return settings.find(s => s.key === 'debug_enabled')?.value === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Основной метод генерации HTML-отчёта
     * Принимает новую структуру данных с charts_data и flipping_data
     */
    async generateHTMLReport(exportData) {
        try {
            if (this.debugEnabled) {
                console.log('🚀 HTMLExportManager: Начинаем генерацию HTML отчёта v2.0');
                console.log('📊 Структура данных:', {
                    hasReport: !!exportData.report,
                    hasChartsData: !!exportData.report?.charts_data,
                    hasFlippingData: !!exportData.report?.flipping_data,
                    hasComparativeAnalysis: !!exportData.report?.comparative_analysis,
                    hasArea: !!exportData.area,
                    addressesCount: exportData.addresses?.length || 0
                });
            }

            const { report, area, addresses } = exportData;

            const reportTitle = report.name || 'Отчёт Neocenka';
            const reportDate = new Date().toLocaleDateString('ru-RU');

            // Генерируем полную HTML-структуру
            const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportTitle}</title>
    ${this.generateExternalLibraries()}
    ${this.generateEmbeddedStyles()}
</head>
<body class="bg-gray-50">
    ${this.generateReportHeader(report, area, reportDate)}
    ${this.generateAllReportSections(report, area, addresses)}
    ${this.generateModalWindows()}
    ${this.generateEmbeddedScripts(exportData)}
</body>
</html>`;

            if (this.debugEnabled) {
                console.log('✅ HTMLExportManager: HTML отчёт успешно сгенерирован');
            }

            return htmlContent;

        } catch (error) {
            console.error('❌ HTMLExportManager: Ошибка генерации HTML отчёта:', error);
            throw error;
        }
    }

    /**
     * Внешние библиотеки
     */
    generateExternalLibraries() {
        return `
            <!-- ApexCharts -->
            <script src="https://cdn.jsdelivr.net/npm/apexcharts@latest"></script>

            <!-- Leaflet -->
            <link rel="stylesheet" href="https://neos-nsk.ru/css/leaflet.css" />
            <script src="https://neos-nsk.ru/js/leaflet.js"></script>

            <!-- Tailwind CSS -->
            <script src="https://cdn.tailwindcss.com"></script>

            <!-- jQuery -->
            <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>

            <!-- DataTables -->
            <link rel="stylesheet" href="https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css">
            <script src="https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js"></script>

            <!-- Fotorama -->
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/fotorama/4.6.4/fotorama.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/fotorama/4.6.4/fotorama.js"></script>
        `;
    }

    /**
     * Встроенные CSS стили
     */
    generateEmbeddedStyles() {
        return `
<style>
/* Кастомные стили для HTML отчёта */

.btn-secondary {
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    background-color: #fff;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-secondary:hover {
    background-color: #f9fafb;
    border-color: #9ca3af;
}

.report-section {
    background: white;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.section-header {
    cursor: pointer;
    transition: background-color 0.2s;
}

.section-header:hover {
    background-color: #f9fafb;
}

.section-content {
    transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
    overflow: hidden;
}

.section-content.hidden {
    max-height: 0 !important;
    opacity: 0;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
}

.chevron {
    transition: transform 0.3s ease;
}

.chevron.rotated {
    transform: rotate(-90deg);
}

/* Стили для карты */
#areaMap {
    height: 400px;
    border-radius: 0.5rem;
    overflow: hidden;
}

/* Стили для меток адресов - копия из карты области */
.address-marker {
    background: transparent !important;
    border: none !important;
}

.leaflet-marker-icon-wrapper {
    position: relative;
}

.leaflet-marker-iconlabel {
    position: absolute;
    font-size: 11px;
    font-weight: 600;
    color: #374151;
    background: rgba(255,255,255,0.9);
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* Стили для popup адресов */
.address-popup-container .leaflet-popup-content-wrapper {
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.address-popup {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.4;
}

.address-popup .header .address-title {
    word-break: break-word;
    line-height: 1.3;
}

/* Стили для графиков */
.chart-container {
    height: 400px;
    width: 100%;
}

/* Стили для таблиц флиппинг */
.flipping-table {
    width: 100%;
    border-collapse: collapse;
}

.flipping-table th,
.flipping-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
}

.flipping-table th {
    background-color: #f9fafb;
    font-weight: 600;
    color: #374151;
}

/* Цветовые классы для ROI и прибыли */
.profit-positive { color: #10b981; }
.profit-neutral { color: #f59e0b; }
.profit-negative { color: #ef4444; }

.roi-high { color: #10b981; }
.roi-medium { color: #f59e0b; }
.roi-low { color: #ef4444; }

/* Модальные окна - предотвращение горизонтальной прокрутки */
#objectModalContent,
#listingModalContent {
    max-width: 100%;
    overflow-x: hidden;
}

#objectModalContent > *,
#listingModalContent > * {
    max-width: 100%;
}

/* Fotorama - адаптивность */
.fotorama {
    max-width: 100% !important;
}

/* Таблицы в модальных окнах */
#objectModalContent table,
#listingModalContent table {
    table-layout: auto;
}

/* Адаптивность */
@media (max-width: 768px) {
    .grid-responsive {
        grid-template-columns: 1fr;
    }

    .chart-container {
        height: 300px;
    }
}

/* Стили для сравнительного анализа */
.analysis-evaluation {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}

.evaluation-better {
    background-color: #d1fae5;
    color: #065f46;
}

.evaluation-similar {
    background-color: #dbeafe;
    color: #1e40af;
}

.evaluation-worse {
    background-color: #fee2e2;
    color: #991b1b;
}
</style>
        `;
    }

    /**
     * Заголовок отчёта
     */
    generateReportHeader(report, area, reportDate) {
        return `
        <div class="bg-white shadow-sm border-b border-gray-200">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div class="md:flex md:items-center md:justify-between">
                    <div class="flex-1 min-w-0">
                        <h1 class="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                            ${report.name}
                        </h1>
                        <div class="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:mt-0 sm:space-x-6">
                            <div class="mt-2 flex items-center text-sm text-gray-500">
                                <svg class="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
                                </svg>
                                Область: ${area.name}
                            </div>
                            <div class="mt-2 flex items-center text-sm text-gray-500">
                                <svg class="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"></path>
                                </svg>
                                Сгенерирован: ${reportDate}
                            </div>
                        </div>
                        ${this.generateFiltersSummary(report.filters)}
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Сводка по фильтрам
     */
    generateFiltersSummary(filters) {
        if (!filters) return '';

        return `
        <div class="mt-4 bg-blue-50 rounded-lg p-4">
            <h4 class="text-sm font-medium text-blue-900 mb-2">Параметры отчёта:</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                ${filters.segment_name ? `
                <div>
                    <span class="text-blue-700 font-medium">Сегмент:</span>
                    <span class="text-blue-600 ml-1">${filters.segment_name}</span>
                </div>
                ` : ''}
                ${filters.subsegment_name ? `
                <div>
                    <span class="text-blue-700 font-medium">Подсегмент:</span>
                    <span class="text-blue-600 ml-1">${filters.subsegment_name}</span>
                </div>
                ` : ''}
                ${filters.date_from ? `
                <div>
                    <span class="text-blue-700 font-medium">Период:</span>
                    <span class="text-blue-600 ml-1">${filters.date_from} - ${filters.date_to || 'настоящее время'}</span>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }


    /**
     * Все секции отчёта включая карту - в едином контейнере
     */
    generateAllReportSections(report, area, addresses) {
        return `
        <div id="reportsPanelContainer" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

            <!-- Секция карты области -->
            <div class="report-section">
                <div class="section-header px-6 py-4" id="areaMapHeader">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Карта области</h3>
                            <p class="mt-1 text-sm text-gray-500">
                                Границы области и адреса подсегмента (${addresses ? addresses.length : 0} адресов)
                            </p>
                        </div>
                        <svg class="chevron h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
                <div class="section-content px-6 pb-6" id="areaMapContent">
                    <div id="areaMap"></div>
                </div>
            </div>

            <!-- Отчёт Ликвидность -->
            <div class="report-section">
                <div class="section-header px-6 py-4" id="liquidityReportHeader">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Ликвидность сегмента/подсегмента</h3>
                            <p class="mt-1 text-sm text-gray-500">
                                Столбчатая диаграмма показывает количество новых объектов и ушедших с рынка по месяцам.
                                Линия показывает количество активных объектов на начало месяца.
                            </p>
                        </div>
                        <svg class="chevron h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
                <div class="section-content px-6 pb-6" id="liquidityReportContent">
                    <div id="liquidityChart" class="chart-container"></div>
                </div>
            </div>

            <!-- Отчёт Изменение средней цены -->
            <div class="report-section">
                <div class="section-header px-6 py-4" id="priceReportHeader">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Изменение средней цены</h3>
                            <p class="mt-1 text-sm text-gray-500">
                                График показывает изменение средней цены объектов и средней цены за квадратный метр по месяцам.
                            </p>
                        </div>
                        <svg class="chevron h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
                <div class="section-content px-6 pb-6" id="priceReportContent">
                    <div id="priceChangesChart" class="chart-container"></div>
                </div>
            </div>

            <!-- Отчёт Коридор рынка недвижимости -->
            <div class="report-section">
                <div class="section-header px-6 py-4" id="marketCorridorReportHeader">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Коридор рынка недвижимости</h3>
                            <p class="mt-1 text-sm text-gray-500">
                                График отображает точки последних цен в объектах недвижимости по вертикали, по горизонтали дата последнего обновления объекта недвижимости.
                            </p>
                        </div>
                        <svg class="chevron h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
                <div class="section-content px-6 pb-6" id="marketCorridorReportContent">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex-1">
                            <!-- Дополнительная информация о графике скрыта, так как она уже в заголовке -->
                        </div>

                        <!-- Переключатель режимов (интерактивный) -->
                        <div class="ml-4">
                            <label for="marketCorridorModeSelect" class="block text-sm font-medium text-gray-700 mb-1">Режим графика</label>
                            <select id="marketCorridorModeSelect" class="min-w-[180px] p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="sales">Коридор продаж</option>
                                <option value="history">История активных</option>
                            </select>
                        </div>
                    </div>

                    <div id="marketCorridorChart" class="chart-container"></div>
                </div>
            </div>

            <!-- Отчёт Сравнительный анализ -->
            <div class="report-section">
                <div class="section-header px-6 py-4" id="comparativeAnalysisReportHeader">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Сравнительный анализ</h3>
                            <p class="mt-1 text-sm text-gray-500">
                                Результаты сравнительного анализа объектов недвижимости
                            </p>
                        </div>
                        <svg class="chevron h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
                <div class="section-content px-6 pb-6" id="comparativeAnalysisReportContent">
                    <div id="comparativeAnalysisContainer" class="comparative-analysis-wrapper">
                        <div id="comparativeAnalysisContent">
                            <!-- Данные сравнительного анализа отобразятся здесь -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- Отчёт Дубли -->
            <div class="report-section">
                <div class="section-header px-6 py-4" id="duplicatesReportHeader">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Дубли объектов недвижимости</h3>
                            <p class="mt-1 text-sm text-gray-500">
                                Таблица дублей с объектами недвижимости и связанными объявлениями
                            </p>
                        </div>
                        <svg class="chevron h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
                <div class="section-content px-6 pb-6" id="duplicatesReportContent">
                    <div id="duplicatesContainer" class="duplicates-wrapper">
                        <table id="duplicatesTable" class="w-full text-sm text-left text-gray-500">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                                <!-- Заголовки будут добавлены автоматически -->
                            </thead>
                            <tbody>
                                <!-- Данные будут загружены JavaScript -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Отчёт Доходность флиппинга -->
            <div class="report-section">
                <div class="section-header px-6 py-4" id="flippingReportHeader">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">Доходность флиппинга</h3>
                            <p class="mt-1 text-sm text-gray-500">
                                Анализ инвестиционной привлекательности и доходности объектов
                            </p>
                        </div>
                        <svg class="chevron h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
                <div class="section-content px-6 pb-6" id="flippingReportContent">
                    <div id="flippingProfitabilityContainer" class="flipping-profitability-wrapper">
                        <div id="flippingProfitabilityContent">
                            <!-- Данные флиппинг отчёта отобразятся здесь -->
                        </div>
                    </div>
                </div>
            </div>

        </div>
        `;
    }

    /**
     * Генерация модальных окон для просмотра объявлений и объектов
     */
    generateModalWindows() {
        return `
        <!-- Модальное окно просмотра объявления -->
        <div id="listingModal" class="fixed inset-0 z-50 overflow-y-auto hidden" aria-labelledby="listing-modal-title" role="dialog" aria-modal="true">
            <div class="mx-auto flex items-center justify-center min-h-screen pt-4 px-4 pb-4 text-center sm:block sm:p-0">
                <!-- Затемнённый фон -->
                <div class="fixed inset-0 z-0 transition-opacity" style="background-color: rgba(0, 0, 0, 0.1);" aria-hidden="true"></div>

                <!-- Центрирование модального окна -->
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <!-- Содержимое модального окна -->
                <div class="inline-block align-bottom bg-white border rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full relative z-10 max-h-[90vh]">
                    <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div class="sm:flex sm:items-start">
                            <div class="w-full">
                                <!-- Заголовок -->
                                <div class="flex items-center justify-between mb-4">
                                    <h3 class="text-lg leading-6 font-medium text-gray-900" id="listing-modal-title">
                                        Детали объявления
                                    </h3>
                                    <button type="button" class="close-modal-btn text-gray-400 hover:text-gray-600" data-modal-id="listingModal">
                                        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>

                                <!-- Содержимое -->
                                <div id="listingModalContent" class="max-h-[70vh] overflow-y-auto">
                                    <!-- Контент будет загружен динамически -->
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 px-4 py-3 sm:px-6 border-t border-gray-200">
                        <div class="flex items-center justify-end space-x-3">
                            <!-- Кнопка открытия объявления -->
                            <button type="button" id="openListingBtnFooter" class="inline-flex items-center justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                                🔗 Открыть объявление
                            </button>
                            <!-- Кнопка закрытия модального окна -->
                            <button type="button" class="close-modal-btn w-auto inline-flex justify-center border border-gray-300 shadow-sm px-4 py-2 bg-white text-gray-700 text-base font-medium text-sm rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" data-modal-id="listingModal">
                                ✕ Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Модальное окно просмотра объекта недвижимости -->
        <div id="objectModal" class="fixed inset-0 z-50 overflow-y-auto hidden" aria-labelledby="object-modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <!-- Затемнённый фон -->
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>

                <!-- Центрирование модального окна -->
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <!-- Содержимое модального окна -->
                <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
                    <div class="bg-white">
                        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div class="flex justify-between items-start mb-4">
                                <h3 class="text-lg leading-6 font-medium text-gray-900" id="object-modal-title">
                                    Объект недвижимости
                                </h3>
                                <button type="button" class="close-modal-btn text-gray-400 hover:text-gray-600" data-modal-id="objectModal">
                                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                            <div id="objectModalContent" class="max-h-[70vh] overflow-y-auto overflow-x-hidden">
                                <!-- Контент будет загружен динамически -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Встроенные JavaScript скрипты с полной функциональностью
     */
    generateEmbeddedScripts(exportData) {
        return `<script>
            // Встраиваем данные отчёта
            const REPORT_DATA = ${JSON.stringify(exportData, this.jsonSafeReplacer, 2)};

            // Глобальные переменные для графиков
            let areaMap = null;
            let liquidityChart = null;
            let priceChangesChart = null;
            let marketCorridorChart = null;
            let flippingProfitabilityChart = null;
            let flippingMarketCorridorChart = null;

            // Инициализация при загрузке DOM
            document.addEventListener('DOMContentLoaded', function() {
                console.log('🚀 HTML Отчёт: Инициализация');
                initPanelControls();
                initAreaMap();
                initAllReports();
                console.log('✅ HTML Отчёт: Инициализация завершена');
            });

            // Управление панелями
            function initPanelControls() {
                // Управление всеми секциями отчётов включая карту
                const allSections = [
                    { headerId: 'areaMapHeader', contentId: 'areaMapContent' },
                    { headerId: 'liquidityReportHeader', contentId: 'liquidityReportContent' },
                    { headerId: 'priceReportHeader', contentId: 'priceReportContent' },
                    { headerId: 'marketCorridorReportHeader', contentId: 'marketCorridorReportContent' },
                    { headerId: 'comparativeAnalysisReportHeader', contentId: 'comparativeAnalysisReportContent' },
                    { headerId: 'duplicatesReportHeader', contentId: 'duplicatesReportContent' },
                    { headerId: 'flippingReportHeader', contentId: 'flippingReportContent' }
                ];

                allSections.forEach(section => {
                    const header = document.getElementById(section.headerId);
                    const content = document.getElementById(section.contentId);

                    if (header && content) {
                        header.addEventListener('click', function() {
                            toggleSection(content, header.querySelector('.chevron'));
                        });
                    }
                });
            }

            // Переключение секции
            function toggleSection(content, chevron) {
                if (!content) return;

                const isHidden = content.classList.contains('hidden');

                if (isHidden) {
                    content.classList.remove('hidden');
                    if (chevron) chevron.classList.remove('rotated');
                } else {
                    content.classList.add('hidden');
                    if (chevron) chevron.classList.add('rotated');
                }
            }

            // Инициализация карты области
            function initAreaMap() {
                try {
                    if (!REPORT_DATA.area) {
                        console.warn('⚠️ Нет данных области для карты');
                        return;
                    }

                    const centerLat = REPORT_DATA.area.center_lat || 55.7558;
                    const centerLng = REPORT_DATA.area.center_lng || 37.6176;

                    areaMap = L.map('areaMap').setView([centerLat, centerLng], 12);

                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap contributors'
                    }).addTo(areaMap);

                    // Полигон области
                    if (REPORT_DATA.area.polygon && REPORT_DATA.area.polygon.length > 0) {
                        const polygon = L.polygon(REPORT_DATA.area.polygon, {
                            color: '#3b82f6',
                            fillColor: '#3b82f6',
                            fillOpacity: 0.2,
                            weight: 2
                        }).addTo(areaMap);

                        areaMap.fitBounds(polygon.getBounds());
                    }

                    // Маркеры адресов подсегмента

                    if (REPORT_DATA.addresses && REPORT_DATA.addresses.length > 0) {
                        let markersAdded = 0;
                        REPORT_DATA.addresses.forEach((address, index) => {
                            // Поддержка разных форматов координат
                            let coordinates = null;

                            if (address.coordinates) {
                                // Формат массива [lat, lng]
                                if (Array.isArray(address.coordinates) && address.coordinates.length === 2) {
                                    coordinates = address.coordinates;
                                }
                                // Формат объекта {lat, lng}
                                else if (typeof address.coordinates === 'object' &&
                                        address.coordinates.lat !== undefined &&
                                        address.coordinates.lng !== undefined) {
                                    coordinates = [address.coordinates.lat, address.coordinates.lng];
                                }
                            }

                            // Отладочная информация только для адресов без координат
                            if (!coordinates) {
                                console.warn(\`⚠️ Адрес без корректных координат: \${address.address}\`, address.coordinates);
                                return;
                            }

                            // Создаем маркер точно как в карте области
                            const marker = createAddressMarker(address, coordinates);
                            if (marker) {
                                marker.addTo(areaMap);
                                markersAdded++;
                            }
                        });
                    } else {
                        console.warn('⚠️ Нет адресов для отображения на карте');
                    }

            // Функция создания маркера адреса - копия из MapManager
            function createAddressMarker(address, coordinates) {
                try {
                    // Определяем высоту маркера по этажности
                    const floorCount = address.floors_count || address.floors || 0;
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

                    // Определяем цвет маркера по материалу стен
                    let markerColor = '#3b82f6'; // Цвет по умолчанию
                    if (address.wall_material_color) {
                        markerColor = address.wall_material_color;
                    }

                    // Определяем текст на маркере (показываем год постройки как в карте области)
                    const labelText = address.build_year || address.house_year || '';

                    const marker = L.marker(coordinates, {
                        icon: L.divIcon({
                            className: 'address-marker',
                            html: \`
                                <div class="leaflet-marker-icon-wrapper" style="position: relative;">
                                    <div style="
                                        width: 0;
                                        height: 0;
                                        border-left: 7.5px solid transparent;
                                        border-right: 7.5px solid transparent;
                                        border-top: \${markerHeight}px solid \${markerColor};
                                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
                                    "></div>
                                    \${labelText ? \`<span class="leaflet-marker-iconlabel" style="
                                        position: absolute;
                                        left: 15px;
                                        top: 0px;
                                        font-size: 11px;
                                        font-weight: 600;
                                        color: #374151;
                                        background: rgba(255,255,255,0.9);
                                        padding: 1px 4px;
                                        border-radius: 3px;
                                        white-space: nowrap;
                                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                                    ">\${labelText}</span>\` : ''}
                                </div>
                            \`,
                            iconSize: [15, markerHeight],
                            iconAnchor: [7.5, markerHeight]
                        })
                    });

                    // Создаем popup как в карте области
                    const popupContent = createAddressPopup(address);
                    marker.bindPopup(popupContent, {
                        maxWidth: 280,
                        className: 'address-popup-container'
                    });

                    return marker;
                } catch (error) {
                    console.warn('Ошибка создания маркера для адреса:', address.address, error);
                    return null;
                }
            }

            // Функция создания popup для адреса - копия из MapManager
            function createAddressPopup(address) {
                // Подготавливаем текстовые значения
                const houseSeriesText = address.house_series || 'Не указана';
                const houseClassText = address.house_class || 'Не указан';
                const wallMaterialText = address.wall_material || 'Не указан';
                const ceilingMaterialText = address.ceiling_material || 'Не указан';
                const gasSupplyText = address.gas_supply ? 'Да' : (address.gas_supply === false ? 'Нет' : 'Не указано');
                const individualHeatingText = address.individual_heating ? 'Да' : (address.individual_heating === false ? 'Нет' : 'Не указано');
                const playgroundText = address.playground ? 'Да' : (address.playground === false ? 'Нет' : 'Не указано');
                const sportsGroundText = address.sports_ground ? 'Да' : (address.sports_ground === false ? 'Нет' : 'Не указано');

                return \`
                    <div class="address-popup" style="width: 260px; max-width: 260px;">
                        <div class="header mb-2">
                            <div class="font-bold text-gray-900 text-sm">📍 Адрес</div>
                            <div class="address-title font-medium text-gray-800 text-xs mb-1">\${address.address || 'Не указан'}</div>
                        </div>

                        <div class="space-y-0.5 text-xs text-gray-600 mb-2">
                            <div><strong>Серия дома:</strong> \${houseSeriesText}</div>
                            <div><strong>Класс дома:</strong> \${houseClassText}</div>
                            <div><strong>Материал стен:</strong> \${wallMaterialText}</div>
                            <div><strong>Материал перекрытий:</strong> \${ceilingMaterialText}</div>
                            <div><strong>Газоснабжение:</strong> \${gasSupplyText}</div>
                            <div><strong>Индивидуальное отопление:</strong> \${individualHeatingText}</div>
                            <div><strong>Этажей:</strong> \${address.floors_count || address.floors || 'Не указано'}</div>
                            <div><strong>Год постройки:</strong> \${address.build_year || address.house_year || 'Не указан'}</div>
                        </div>

                    </div>
                \`;
            }

                } catch (error) {
                    console.error('❌ Ошибка инициализации карты:', error);
                }
            }

            // Инициализация всех отчётов
            function initAllReports() {
                try {
                    // Инициализируем графики только если есть данные
                    if (REPORT_DATA.report && REPORT_DATA.report.charts_data) {
                        const chartsData = REPORT_DATA.report.charts_data;

                        if (chartsData.liquidity) {
                            initLiquidityChart();
                        } else {
                            showNoDataMessage('liquidityChart', 'Нет данных по ликвидности');
                        }

                        if (chartsData.price_changes) {
                            initPriceChart();
                        } else {
                            showNoDataMessage('priceChangesChart', 'Нет данных по изменению цен');
                        }

                        if (chartsData.market_corridor) {
                            initMarketCorridorChart();
                        } else {
                            showNoDataMessage('marketCorridorChart', 'Нет данных по коридору рынка');
                        }

                    } else {
                        console.warn('⚠️ Нет данных графиков для отображения');
                        ['liquidityChart', 'priceChangesChart', 'marketCorridorChart'].forEach(chartId => {
                            showNoDataMessage(chartId, 'Данные графика не сохранены');
                        });
                    }

                    // Сравнительный анализ
                    if (REPORT_DATA.report && REPORT_DATA.report.comparative_analysis) {
                        initComparativeAnalysis();
                    } else {
                        showNoDataMessage('comparativeAnalysisContent', 'Нет данных сравнительного анализа');
                    }

                    // Таблица дублей
                    if (REPORT_DATA.duplicates_data) {
                        initDuplicatesTable();
                    } else {
                        showNoDataMessage('duplicatesContainer', 'Нет данных дублей');
                    }

                    // Флиппинг отчёт
                    if (REPORT_DATA.report && REPORT_DATA.report.flipping_data) {
                        initFlippingReport();
                    } else {
                        showNoDataMessage('flippingProfitabilityContent', 'Нет данных по флиппингу');
                    }

                } catch (error) {
                    console.error('❌ Ошибка инициализации отчётов:', error);
                }
            }

            // Показать сообщение об отсутствии данных
            function showNoDataMessage(containerId, message) {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = \`
                        <div class="flex items-center justify-center h-full text-gray-500 py-12">
                            <div class="text-center">
                                <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                </svg>
                                <p>\${message}</p>
                            </div>
                        </div>
                    \`;
                }
            }

            // Инициализация графика ликвидности - точная копия из ReportsManager
            function initLiquidityChart() {
                try {
                    const data = REPORT_DATA.report.charts_data.liquidity;
                    if (!data || !data.datetime || data.datetime.length === 0) {
                        showNoDataMessage('liquidityChart', 'Нет данных для отображения');
                        return;
                    }

                    const options = {
                        series: [
                            {
                                name: 'Новые',
                                type: 'column',
                                data: data['new']
                            },
                            {
                                name: 'Ушедшие с рынка',
                                type: 'column',
                                data: data['close']
                            },
                            {
                                name: 'Активных на начало месяца',
                                type: 'line',
                                data: data['active']
                            }
                        ],
                        colors: ['#60ba5d', '#bd5f5f', '#629bc2'],
                        chart: {
                            height: 350,
                            locales: [{
                                "name": "ru",
                                "options": {
                                    "months": ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
                                    "shortMonths": ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
                                    "days": ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
                                    "shortDays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
                                    "toolbar": {
                                        "exportToSVG": "Сохранить SVG",
                                        "exportToPNG": "Сохранить PNG",
                                        "exportToCSV": "Сохранить CSV",
                                        "menu": "Меню",
                                        "selection": "Выбор",
                                        "selectionZoom": "Выбор с увеличением",
                                        "zoomIn": "Увеличить",
                                        "zoomOut": "Уменьшить",
                                        "pan": "Перемещение",
                                        "reset": "Сбросить увеличение"
                                    }
                                }
                            }],
                            defaultLocale: "ru",
                            zoom: {
                                enabled: true
                            }
                        },
                        responsive: [{
                            breakpoint: 480,
                            options: {
                                legend: {
                                    position: 'bottom',
                                    offsetX: -10,
                                    offsetY: 0
                                }
                            }
                        }],
                        dataLabels: {
                            enabled: true,
                        },
                        plotOptions: {
                            bar: {
                                borderRadius: 8,
                                horizontal: false,
                            },
                        },
                        xaxis: {
                            type: 'datetime',
                            categories: data['datetime'],
                        },
                        legend: {
                            position: 'bottom'
                        },
                        fill: {
                            opacity: 1
                        }
                    };

                    document.getElementById('liquidityChart').innerHTML = '';
                    liquidityChart = new ApexCharts(document.querySelector("#liquidityChart"), options);
                    liquidityChart.render();

                } catch (error) {
                    console.error('❌ Ошибка инициализации графика ликвидности:', error);
                    showNoDataMessage('liquidityChart', 'Ошибка загрузки графика ликвидности');
                }
            }

            // Инициализация графика цен - точная копия из ReportsManager
            function initPriceChart() {
                try {
                    const data = REPORT_DATA.report.charts_data.price_changes;
                    if (!data || !data.datetime || data.datetime.length === 0) {
                        showNoDataMessage('priceChangesChart', 'Нет данных для отображения');
                        return;
                    }

                    const options = {
                        series: [
                            {
                                name: 'Средняя цена квадратного метра (Активные)',
                                type: 'column',
                                data: data['averageСostMeter']
                            },
                            {
                                name: 'Средняя цена объекта (Активные)',
                                type: 'line',
                                data: data['averageСost']
                            },
                            {
                                name: 'Средняя цена квадратного метра (Архив)',
                                type: 'column',
                                data: data['averageСostMeterArchive']
                            },
                            {
                                name: 'Средняя цена объекта (Архив)',
                                type: 'line',
                                data: data['averageСostArchive']
                            }
                        ],
                        colors: ['#60ba5d', '#629bc2', '#ff9800', '#e91e63'],
                        chart: {
                            height: 350,
                            locales: [{
                                "name": "ru",
                                "options": {
                                    "months": ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
                                    "shortMonths": ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
                                    "days": ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
                                    "shortDays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
                                    "toolbar": {
                                        "exportToSVG": "Сохранить SVG",
                                        "exportToPNG": "Сохранить PNG",
                                        "exportToCSV": "Сохранить CSV",
                                        "menu": "Меню",
                                        "selection": "Выбор",
                                        "selectionZoom": "Выбор с увеличением",
                                        "zoomIn": "Увеличить",
                                        "zoomOut": "Уменьшить",
                                        "pan": "Перемещение",
                                        "reset": "Сбросить увеличение"
                                    }
                                }
                            }],
                            defaultLocale: "ru",
                            zoom: {
                                enabled: true
                            }
                        },
                        stroke: {
                            width: [0, 4]
                        },
                        title: {
                            text: 'Средние значения цен'
                        },
                        dataLabels: {
                            enabled: false,
                        },
                        xaxis: {
                            type: 'datetime',
                            categories: data['datetime'],
                        },
                        yaxis: [
                            {
                                seriesName: ['Средняя цена квадратного метра (Активные)', 'Средняя цена квадратного метра (Архив)'],
                                title: {
                                    text: 'Средняя цена квадратного метра',
                                },
                                labels: {
                                    formatter: function (val) {
                                        return new Intl.NumberFormat('ru-RU').format(val);
                                    }
                                }
                            },
                            {
                                seriesName: ['Средняя цена объекта (Активные)', 'Средняя цена объекта (Архив)'],
                                opposite: true,
                                title: {
                                    text: 'Средняя цена объекта'
                                },
                                labels: {
                                    formatter: function (val) {
                                        return new Intl.NumberFormat('ru-RU').format(val);
                                    }
                                }
                            }
                        ]
                    };

                    document.getElementById('priceChangesChart').innerHTML = '';
                    priceChangesChart = new ApexCharts(document.querySelector("#priceChangesChart"), options);
                    priceChangesChart.render();

                } catch (error) {
                    console.error('❌ Ошибка инициализации графика цен:', error);
                    showNoDataMessage('priceChangesChart', 'Ошибка загрузки графика цен');
                }
            }

            // Инициализация коридора рынка
            function initMarketCorridorChart() {
                try {
                    const chartData = REPORT_DATA.report.charts_data.market_corridor;
                    if (!chartData) {
                        showNoDataMessage('marketCorridorChart', 'Нет данных коридора рынка');
                        return;
                    }

                    // Определяем доступные режимы и начальный режим
                    let availableModes = [];
                    let initialMode = 'sales';

                    if (chartData.sales) {
                        availableModes.push('sales');
                    }
                    if (chartData.history) {
                        availableModes.push('history');
                    }

                    // Если данные в старом формате (для совместимости)
                    if (chartData.series && !chartData.sales && !chartData.history) {
                        availableModes = ['sales'];
                        initialMode = chartData.mode || 'sales';
                    }

                    if (availableModes.length === 0) {
                        showNoDataMessage('marketCorridorChart', 'Нет валидных данных коридора рынка');
                        return;
                    }

                    // Сохраняем доступные режимы в глобальной переменной
                    window.availableMarketCorridorModes = availableModes;

                    // Отображаем график для начального режима
                    renderMarketCorridorChart(initialMode);

                    // Настраиваем селектор режима
                    const modeSelect = document.getElementById('marketCorridorModeSelect');
                    if (modeSelect) {
                        modeSelect.value = initialMode;

                        // Добавляем обработчик переключения режима
                        modeSelect.addEventListener('change', function() {
                            switchMarketCorridorMode(this.value);
                        });
                    }

                } catch (error) {
                    console.error('❌ Ошибка инициализации коридора рынка:', error);
                    showNoDataMessage('marketCorridorChart', 'Ошибка загрузки коридора рынка');
                }
            }

            // Отрисовка графика коридора рынка - точная копия из ReportsManager
            function renderMarketCorridorChart(mode) {
                try {
                    const chartData = REPORT_DATA.report.charts_data.market_corridor;
                    let pointsData;

                    // Получаем данные для режима
                    if (chartData.sales && mode === 'sales') {
                        pointsData = chartData.sales;
                    } else if (chartData.history && mode === 'history') {
                        pointsData = chartData.history;
                    } else {
                        throw new Error('Данные для режима ' + mode + ' не найдены');
                    }

                    // Проверяем наличие данных
                    if (!pointsData || !pointsData.series || pointsData.series.length === 0 || pointsData.series[0].data.length === 0) {
                        showNoDataMessage('marketCorridorChart', 'Нет данных для отображения');
                        return;
                    }

                    // Если график уже существует, уничтожаем его
                    if (window.marketCorridorChart && typeof window.marketCorridorChart.destroy === 'function') {
                        window.marketCorridorChart.destroy();
                    }

                    const options = {
                        chart: {
                            height: 600,
                            type: mode === 'history' ? 'line' : 'scatter',
                            locales: [{
                                "name": "ru",
                                "options": {
                                    "months": ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
                                    "shortMonths": ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
                                    "days": ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
                                    "shortDays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
                                    "toolbar": {
                                        "exportToSVG": "Сохранить SVG",
                                        "exportToPNG": "Сохранить PNG",
                                        "exportToCSV": "Сохранить CSV",
                                        "menu": "Меню",
                                        "selection": "Выбор",
                                        "selectionZoom": "Выбор с увеличением",
                                        "zoomIn": "Увеличить",
                                        "zoomOut": "Уменьшить",
                                        "pan": "Перемещение",
                                        "reset": "Сбросить увеличение"
                                    }
                                }
                            }],
                            defaultLocale: "ru"
                        },
                        stroke: {
                            width: mode === 'history' ? 2 : 0,
                            curve: mode === 'history' ? 'stepline' : 'straight'
                        },
                        series: pointsData.series,
                        colors: pointsData.series.map(series => {
                            // Определяем цвет на основе названия серии
                            if (series.name && series.name.includes('Активные')) {
                                return '#22c55e'; // зелёный для активных
                            } else if (series.name && series.name.includes('Архивные')) {
                                return '#ef4444'; // красный для архивных
                            } else if (series.name && series.name.includes('Объект')) {
                                return '#22c55e'; // зелёный для линий объектов в режиме истории
                            }
                            return '#22c55e'; // по умолчанию зелёный
                        }),
                        xaxis: {
                            type: 'datetime'
                        },
                        legend: {
                            show: false,
                            showForSingleSeries: false,
                            showForNullSeries: false,
                            showForZeroSeries: false
                        },
                        title: {
                            text: mode === 'history' ? 'История активных объектов' : 'Коридор рынка недвижимости',
                            align: 'left',
                            style: {
                                fontSize: "14px",
                                color: 'rgba(102,102,102,0.56)'
                            }
                        },
                        markers: {
                            size: 4,
                            opacity: 0.9,
                            strokeColor: "#fff",
                            strokeWidth: 2,
                            style: 'inverted',
                            hover: {
                                size: 15
                            }
                        },
                        tooltip: {
                            shared: false,
                            intersect: true,
                            custom: (tooltipModel) => {
                                const { series, seriesIndex, dataPointIndex, w } = tooltipModel;

                                let point = null;

                                if (pointsData.pointsData) {
                                    if (mode === 'history') {
                                        // В режиме истории нужно найти соответствующую точку по координатам
                                        const seriesData = w.config.series[seriesIndex];
                                        if (seriesData && seriesData.data && seriesData.data[dataPointIndex]) {
                                            const [timestamp, price] = seriesData.data[dataPointIndex];

                                            point = pointsData.pointsData.find(p =>
                                                Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                                            );
                                        }
                                    } else {
                                        // В режиме коридора продаж используем серии-маппинг
                                        if (pointsData.seriesDataMapping &&
                                            pointsData.seriesDataMapping[seriesIndex] &&
                                            pointsData.seriesDataMapping[seriesIndex][dataPointIndex]) {

                                            point = pointsData.seriesDataMapping[seriesIndex][dataPointIndex];

                                        } else {
                                            // Fallback - ищем по координатам
                                            const seriesData = w.config.series[seriesIndex];
                                            if (seriesData && seriesData.data && seriesData.data[dataPointIndex]) {
                                                const [timestamp, price] = seriesData.data[dataPointIndex];

                                                point = pointsData.pointsData.find(p =>
                                                    Math.abs(p.x - timestamp) < 1000 && Math.abs(p.y - price) < 0.01
                                                );
                                            }
                                        }
                                    }
                                }

                                if (!point) {
                                    return '<div style="padding: 8px;">Нет данных</div>';
                                }

                                const price = new Intl.NumberFormat('ru-RU').format(point.y);
                                const date = new Date(point.x).toLocaleDateString('ru-RU');
                                const status = point.status === 'active' ? 'Активный' : 'Архив';
                                const rooms = point.rooms || 'н/д';
                                const area = point.area ? \`\${point.area} м²\` : 'н/д';
                                const floor = point.floor && point.floors_total ? \`\${point.floor}/\${point.floors_total}\` : 'н/д';

                                return \`
                                    <div style="background: white; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); padding: 12px; max-width: 300px;">
                                        <div style="font-weight: 600; color: #1f2937; margin-bottom: 8px;">\${rooms} комн., \${area}</div>
                                        <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Этаж: \${floor}</div>
                                        <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Статус: <span style="font-weight: 500; color: \${point.status === 'active' ? '#059669' : '#6b7280'};">\${status}</span></div>
                                        <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Дата: \${date}</div>
                                        <div style="font-weight: bold; font-size: 18px; color: #2563eb;">\${price} ₽</div>
                                    </div>
                                \`;
                            }
                        },
                        yaxis: {
                            min: pointsData.minPrice,
                            max: pointsData.maxPrice,
                            title: {
                                text: 'Цена'
                            }
                        },
                        grid: {
                            show: true,
                            position: 'back',
                            xaxis: {
                                lines: {
                                    show: true
                                }
                            },
                            yaxis: {
                                lines: {
                                    show: true
                                }
                            },
                            borderColor: '#eeeeee'
                        },
                        responsive: [{
                            breakpoint: 600,
                            options: {
                                chart: {
                                    toolbar: {
                                        show: true
                                    }
                                },
                                legend: {
                                    show: true
                                }
                            }
                        }]
                    };

                    document.getElementById('marketCorridorChart').innerHTML = '';
                    window.marketCorridorChart = new ApexCharts(document.querySelector("#marketCorridorChart"), options);
                    window.marketCorridorChart.render();

                } catch (error) {
                    console.error('❌ Ошибка отрисовки графика коридора рынка:', error);
                    showNoDataMessage('marketCorridorChart', 'Ошибка отрисовки графика для режима ' + mode);
                }
            }

            // Переключение режима коридора рынка
            function switchMarketCorridorMode(mode) {
                try {

                    // Проверяем доступные режимы
                    const availableModes = window.availableMarketCorridorModes || [];

                    if (!availableModes.includes(mode)) {
                        console.warn(\`⚠️ В отчёте нет данных для режима \${mode}\`);

                        // Возвращаем селект к предыдущему режиму
                        const modeSelect = document.getElementById('marketCorridorModeSelect');
                        if (modeSelect) {
                            // Находим первый доступный режим
                            const currentMode = availableModes.length > 0 ? availableModes[0] : 'sales';
                            modeSelect.value = currentMode;
                        }

                        // Показываем уведомление пользователю
                        const modeNames = {
                            'sales': 'Коридор продаж',
                            'history': 'История активных'
                        };

                        const availableModeNames = availableModes.map(m => modeNames[m] || m).join(', ');

                        alert(\`В отчёте нет данных для режима "\${modeNames[mode] || mode}".\\n\\nДоступные режимы: \${availableModeNames}.\\n\\nДля получения данных всех режимов создайте новый отчёт в основном приложении.\`);

                        return;
                    }

                    // Перерисовываем график для нового режима
                    renderMarketCorridorChart(mode);


                } catch (error) {
                    console.error('❌ Ошибка переключения режима коридора рынка:', error);
                }
            }

            // Инициализация сравнительного анализа
            function initComparativeAnalysis() {
                try {
                    const analysisData = REPORT_DATA.report.comparative_analysis;
                    if (!analysisData) {
                        showNoDataMessage('comparativeAnalysisContent', 'Нет данных сравнительного анализа');
                        return;
                    }

                    const container = document.getElementById('comparativeAnalysisContent');
                    let html = '<div class="space-y-6">';

                    // Показываем сохранённые оценки
                    if (analysisData.evaluations && Object.keys(analysisData.evaluations).length > 0) {
                        html += '<div class="bg-blue-50 p-4 rounded-md">';
                        html += '<h5 class="font-medium text-gray-900 mb-3">Сохранённые оценки объектов:</h5>';
                        html += '<div class="grid grid-cols-1 gap-2">';

                        Object.entries(analysisData.evaluations).forEach(([objectId, evaluation]) => {
                            const evaluationText = {
                                'better': 'Лучше',
                                'similar': 'Похож',
                                'worse': 'Хуже'
                            }[evaluation] || evaluation;

                            const evaluationClass = {
                                'better': 'evaluation-better',
                                'similar': 'evaluation-similar',
                                'worse': 'evaluation-worse'
                            }[evaluation] || '';

                            html += \`
                                <div class="flex justify-between items-center">
                                    <span>Объект \${objectId}:</span>
                                    <span class="analysis-evaluation \${evaluationClass}">\${evaluationText}</span>
                                </div>
                            \`;
                        });

                        html += '</div></div>';
                    }

                    // Показываем ценовые коридоры
                    if (analysisData.corridors) {
                        html += '<div class="bg-gray-50 p-4 rounded-md">';
                        html += '<h5 class="font-medium text-gray-900 mb-3">Ценовые коридоры:</h5>';
                        html += '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">';

                        if (analysisData.corridors.active) {
                            html += \`
                                <div class="text-center">
                                    <div class="text-sm text-gray-600">Активные</div>
                                    <div class="font-medium">\${formatPrice(analysisData.corridors.active.min)} - \${formatPrice(analysisData.corridors.active.max)}</div>
                                    \${analysisData.corridors.active.avg ? \`<div class="text-xs text-gray-500">Среднее: \${formatPrice(analysisData.corridors.active.avg)}</div>\` : ''}
                                </div>
                            \`;
                        }

                        if (analysisData.corridors.archive) {
                            html += \`
                                <div class="text-center">
                                    <div class="text-sm text-gray-600">Архивные</div>
                                    <div class="font-medium">\${formatPrice(analysisData.corridors.archive.min)} - \${formatPrice(analysisData.corridors.archive.max)}</div>
                                    \${analysisData.corridors.archive.avg ? \`<div class="text-xs text-gray-500">Среднее: \${formatPrice(analysisData.corridors.archive.avg)}</div>\` : ''}
                                </div>
                            \`;
                        }

                        if (analysisData.corridors.optimal) {
                            html += \`
                                <div class="text-center">
                                    <div class="text-sm text-gray-600">Оптимальный</div>
                                    <div class="font-medium text-green-600">\${formatPrice(analysisData.corridors.optimal.min)} - \${formatPrice(analysisData.corridors.optimal.max)}</div>
                                    \${analysisData.corridors.optimal.avg ? \`<div class="text-xs text-gray-500">Среднее: \${formatPrice(analysisData.corridors.optimal.avg)}</div>\` : ''}
                                </div>
                            \`;
                        }

                        html += '</div></div>';
                    }

                    html += '</div>';
                    container.innerHTML = html;

                } catch (error) {
                    console.error('❌ Ошибка инициализации сравнительного анализа:', error);
                    showNoDataMessage('comparativeAnalysisContent', 'Ошибка загрузки сравнительного анализа');
                }
            }

            // Инициализация флиппинг отчёта
            function initFlippingReport() {
                try {
                    const flippingData = REPORT_DATA.report.flipping_data;
                    if (!flippingData) {
                        showNoDataMessage('flippingProfitabilityContent', 'Нет данных по флиппингу');
                        return;
                    }

                    const container = document.getElementById('flippingProfitabilityContent');
                    let html = '<div class="space-y-6">';

                    // Сводная статистика
                    if (flippingData.summary) {
                        html += \`
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 bg-blue-50 p-4 rounded-md">
                                <div class="text-center">
                                    <div class="text-2xl font-bold text-blue-600">\${flippingData.summary.total_objects}</div>
                                    <div class="text-sm text-gray-600">Объектов</div>
                                </div>
                                <div class="text-center">
                                    <div class="text-2xl font-bold text-green-600">\${formatPrice(flippingData.summary.avg_profit)}</div>
                                    <div class="text-sm text-gray-600">Средняя прибыль</div>
                                </div>
                                <div class="text-center">
                                    <div class="text-2xl font-bold text-purple-600">\${flippingData.summary.avg_roi.toFixed(1)}%</div>
                                    <div class="text-sm text-gray-600">Средний ROI</div>
                                </div>
                                <div class="text-center">
                                    <div class="text-2xl font-bold text-orange-600">\${formatPrice(flippingData.summary.total_investment)}</div>
                                    <div class="text-sm text-gray-600">Общие инвестиции</div>
                                </div>
                            </div>
                        \`;
                    }

                    // Графики флиппинга
                    if (flippingData.charts) {
                        html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

                        if (flippingData.charts.profitability) {
                            html += '<div><h6 class="text-lg font-medium mb-4">График доходности</h6><div id="flippingProfitabilityChart" class="chart-container"></div></div>';
                        }

                        if (flippingData.charts.market_corridor) {
                            html += '<div><h6 class="text-lg font-medium mb-4">Коридор рынка флиппинг</h6><div id="flippingMarketCorridorChart" class="chart-container"></div></div>';
                        }

                        html += '</div>';

                        // Инициализируем графики флиппинга после добавления в DOM
                        setTimeout(() => {
                            if (flippingData.charts.profitability) {
                                try {
                                    flippingProfitabilityChart = new ApexCharts(
                                        document.querySelector("#flippingProfitabilityChart"),
                                        {
                                            ...flippingData.charts.profitability.options,
                                            series: flippingData.charts.profitability.series,
                                            chart: {
                                                ...flippingData.charts.profitability.options?.chart,
                                                height: 300
                                            }
                                        }
                                    );
                                    flippingProfitabilityChart.render();
                                } catch (error) {
                                    console.error('❌ Ошибка инициализации графика доходности флиппинг:', error);
                                }
                            }

                            if (flippingData.charts.market_corridor) {
                                try {
                                    flippingMarketCorridorChart = new ApexCharts(
                                        document.querySelector("#flippingMarketCorridorChart"),
                                        {
                                            ...flippingData.charts.market_corridor.options,
                                            series: flippingData.charts.market_corridor.series,
                                            chart: {
                                                ...flippingData.charts.market_corridor.options?.chart,
                                                height: 300
                                            }
                                        }
                                    );
                                    flippingMarketCorridorChart.render();
                                } catch (error) {
                                    console.error('❌ Ошибка инициализации коридора рынка флиппинг:', error);
                                }
                            }
                        }, 100);
                    }

                    // Таблица объектов флиппинга
                    if (flippingData.objects && flippingData.objects.length > 0) {
                        html += \`
                            <div class="bg-white border rounded-lg overflow-hidden">
                                <div class="px-6 py-4 bg-gray-50 border-b">
                                    <h5 class="text-lg font-medium text-gray-900">Объекты флиппинга (\${flippingData.objects.length} шт.)</h5>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="flipping-table">
                                        <thead>
                                            <tr>
                                                <th>Адрес</th>
                                                <th>Покупка</th>
                                                <th>Текущая цена</th>
                                                <th>Ремонт</th>
                                                <th>Прибыль</th>
                                                <th>ROI</th>
                                                <th>Период</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                        \`;

                        flippingData.objects.forEach(obj => {
                            const roiClass = obj.roi_percent >= 20 ? 'roi-high' : obj.roi_percent >= 10 ? 'roi-medium' : 'roi-low';
                            const profitClass = obj.profit >= 500000 ? 'profit-positive' : obj.profit >= 0 ? 'profit-neutral' : 'profit-negative';

                            html += \`
                                <tr>
                                    <td>\${obj.address}</td>
                                    <td>\${formatPrice(obj.purchase_price)}</td>
                                    <td>\${formatPrice(obj.current_price)}</td>
                                    <td>\${formatPrice(obj.renovation_cost)}</td>
                                    <td class="\${profitClass}">\${formatPrice(obj.profit)}</td>
                                    <td class="\${roiClass}">\${obj.roi_percent.toFixed(1)}%</td>
                                    <td>\${obj.holding_period_months} мес.</td>
                                </tr>
                            \`;
                        });

                        html += \`
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        \`;
                    }

                    html += '</div>';
                    container.innerHTML = html;

                } catch (error) {
                    console.error('❌ Ошибка инициализации флиппинг отчёта:', error);
                    showNoDataMessage('flippingProfitabilityContent', 'Ошибка загрузки флиппинг отчёта');
                }
            }

            // Вспомогательная функция форматирования цены
            function formatPrice(price) {
                if (price === null || price === undefined) return '0 ₽';
                return new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(price);
            }

            // Инициализация таблицы дублей
            function initDuplicatesTable() {
                try {
                    console.log('📊 Инициализация таблицы дублей');

                    if (!REPORT_DATA.duplicates_data || !REPORT_DATA.duplicates_data.tableData) {
                        showNoDataMessage('duplicatesContainer', 'Нет данных дублей для отображения');
                        return;
                    }

                    const tableData = REPORT_DATA.duplicates_data.tableData;
                    const addressesMap = REPORT_DATA.duplicates_data.addressesMap || new Map();

                    // Фильтруем только объекты для основной таблицы (листинги показываются в дочерних таблицах)
                    const objectsData = tableData.filter(item => item.type === 'object');

                    // Инициализируем DataTable
                    const duplicatesTable = $('#duplicatesTable').DataTable({
                        data: objectsData,
                        pageLength: 10,
                        ordering: true,
                        searching: true,
                        order: [[4, 'desc']], // Сортировка по дате обновления
                        language: {
                            "decimal":        "",
                            "emptyTable":     "Нет данных",
                            "info":           "Показано _START_ до _END_ из _TOTAL_ записей",
                            "infoEmpty":      "Показано 0 до 0 из 0 записей",
                            "infoFiltered":   "(отфильтровано из _MAX_ записей)",
                            "infoPostFix":    "",
                            "thousands":      ",",
                            "lengthMenu":     "Показать _MENU_ записей",
                            "loadingRecords": "Загрузка...",
                            "processing":     "Обработка...",
                            "search":         "Поиск:",
                            "zeroRecords":    "Совпадающих записей не найдено",
                            "paginate": {
                                "first":      "Первая",
                                "last":       "Последняя",
                                "next":       "Следующая",
                                "previous":   "Предыдущая"
                            }
                        },
                        columnDefs: [
                            {
                                targets: 0, // Статус
                                orderable: false,
                                searchable: false,
                                className: 'dt-body-center text-xs',
                                width: '120px'
                            },
                            {
                                targets: [1, 2], // Даты
                                className: 'text-xs'
                            },
                            {
                                targets: [3, 4, 5], // Характеристики, адрес, цена
                                className: 'text-xs'
                            }
                        ],
                        columns: [
                            // 0. Статус
                            {
                                data: null,
                                title: 'Статус',
                                render: function(data, type, row) {
                                    const isListing = row.type === 'listing';
                                    const statusBadges = {
                                        'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
                                        'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
                                        'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>'
                                    };

                                    let html = statusBadges[row.status] || '<span class="text-xs text-gray-500">' + row.status + '</span>';

                                    if (!isListing) {
                                        // Для объектов показываем количество объявлений с кнопкой разворачивания
                                        const listingsCount = row.listings_count || 0;
                                        const activeCount = row.active_listings_count || 0;
                                        if (listingsCount > 0) {
                                            html += '<br><span class="text-xs text-nowrap text-gray-600 cursor-pointer hover:text-blue-600 expand-object-listings" data-object-id="' + row.id + '" title="Нажмите для просмотра объявлений">' +
                                                '<svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>' +
                                                '</svg>' +
                                                'Объявления: ' + listingsCount + ' (' + activeCount + ' акт.)' +
                                            '</span>';
                                        } else {
                                            html += '<br><span class="text-xs text-nowrap text-gray-600">' +
                                                'Объявления: ' + listingsCount + ' (' + activeCount + ' акт.)' +
                                            '</span>';
                                        }
                                    }

                                    return html;
                                }
                            },
                            // 1. Дата создания
                            {
                                data: 'created',
                                title: 'Создано',
                                render: function(data, type, row) {
                                    const dateValue = data || row.created_at;
                                    if (!dateValue) return '—';
                                    const createdDate = new Date(dateValue);

                                    if (type === 'sort' || type === 'type') {
                                        return createdDate.getTime();
                                    }

                                    const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });

                                    // Вычисляем экспозицию
                                    const updatedValue = row.updated || row.updated_at;
                                    const endDate = updatedValue ? new Date(updatedValue) : new Date();
                                    const diffTime = Math.abs(endDate - createdDate);
                                    const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                    return '<div class="text-xs">' +
                                        dateStr + '<br>' +
                                        '<span class="text-gray-500" style="font-size: 10px;">эксп. ' + exposureDays + ' дн.</span>' +
                                    '</div>';
                                }
                            },
                            // 2. Дата обновления
                            {
                                data: 'updated',
                                title: 'Обновлено',
                                render: function(data, type, row) {
                                    const dateValue = data || row.updated_at;
                                    if (!dateValue) return '—';
                                    const date = new Date(dateValue);

                                    if (type === 'sort' || type === 'type') {
                                        return date.getTime();
                                    }

                                    const now = new Date();
                                    const diffTime = Math.abs(now - date);
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                    const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                                    const daysAgo = diffDays === 1 ? '1 день назад' : diffDays + ' дн. назад';
                                    const color = diffDays > 7 ? 'text-red-600' : 'text-green-600';

                                    return '<div class="text-xs">' +
                                        dateStr + '<br>' +
                                        '<span class="' + color + '" style="font-size: 10px;">' + daysAgo + '</span>' +
                                    '</div>';
                                }
                            },
                            // 3. Характеристики
                            {
                                data: null,
                                title: 'Характеристики',
                                render: function(data, type, row) {
                                    const parts = [];

                                    // Тип квартиры
                                    if (row.property_type) {
                                        const types = {
                                            'studio': 'Студия',
                                            '1k': '1-к',
                                            '2k': '2-к',
                                            '3k': '3-к',
                                            '4k+': '4-к+'
                                        };
                                        parts.push(types[row.property_type] || row.property_type);
                                        parts.push('квартира');
                                    }

                                    // Площади
                                    const areas = [];
                                    if (row.area_total) areas.push(row.area_total);
                                    if (row.area_living) areas.push(row.area_living);
                                    if (row.area_kitchen) areas.push(row.area_kitchen);
                                    if (areas.length > 0) parts.push(areas.join('/') + 'м²');

                                    // Этаж/этажность
                                    if (row.floor && row.total_floors) {
                                        parts.push(row.floor + '/' + row.total_floors + ' эт.');
                                    } else if (row.floor && row.floors_total) {
                                        parts.push(row.floor + '/' + row.floors_total + ' эт.');
                                    }

                                    const characteristicsText = parts.length > 0 ? parts.join(', ') : 'Не указано';

                                    return '<div class="text-xs text-gray-900 max-w-xs" title="' + characteristicsText + '">' + characteristicsText + '</div>';
                                }
                            },
                            // 4. Адрес
                            {
                                data: 'address',
                                title: 'Адрес',
                                render: function(data, type, row) {
                                    const isListing = row.type === 'listing';

                                    if (isListing) {
                                        const addressText = data || 'Адрес не указан';
                                        const addressFromDb = getAddressNameById(row.address_id, addressesMap);
                                        let addressFromDbText = addressFromDb || 'Адрес не определен';

                                        // Проверяем точность определения адреса
                                        const hasLowConfidence = row.address_match_confidence === 'low' || row.address_match_confidence === 'very_low';
                                        const isManualConfidence = row.address_match_confidence === 'manual';
                                        const isAddressNotFound = addressFromDbText === 'Адрес не определен';

                                        if (hasLowConfidence && !isAddressNotFound) {
                                            const confidenceText = row.address_match_confidence === 'low' ? 'Низкая' : 'Очень низкая';
                                            addressFromDbText += ' (' + confidenceText + ')';
                                        } else if (isManualConfidence && !isAddressNotFound) {
                                            addressFromDbText += ' (Подтвержден)';
                                        }

                                        const addressClass = addressText === 'Адрес не указан' ? 'text-red-600' : 'text-blue-600 hover:text-blue-800 cursor-pointer clickable-address';
                                        const addressFromDbClass = (isAddressNotFound || (hasLowConfidence && !isManualConfidence)) ? 'text-red-500' : 'text-gray-500';

                                        return '<div class="text-xs max-w-xs">' +
                                            '<div class="' + addressClass + ' truncate-left" data-listing-id="' + row.id + '" title="Нажмите для просмотра объявления: ' + addressText + '">' + addressText + '</div>' +
                                            '<div class="' + addressFromDbClass + ' truncate-left" title="' + addressFromDbText + '">' + addressFromDbText + '</div>' +
                                        '</div>';
                                    } else {
                                        // Для объектов
                                        const addressText = getAddressNameById(row.address_id, addressesMap) || 'Адрес не определен';
                                        const addressClass = addressText === 'Адрес не определен' ? 'text-red-500' : 'text-blue-600 hover:text-blue-800 cursor-pointer clickable-object-address';

                                        return '<div class="text-xs max-w-xs">' +
                                            '<div class="' + addressClass + ' truncate-left" data-object-id="' + row.id + '" title="Нажмите для просмотра объекта: ' + addressText + '">' + addressText + '</div>' +
                                        '</div>';
                                    }
                                }
                            },
                            // 5. Цена
                            {
                                data: null,
                                title: 'Цена',
                                render: function(data, type, row) {
                                    const isListing = row.type === 'listing';
                                    const priceValue = isListing ? row.price : row.current_price;

                                    if (!priceValue) return '<div class="text-xs">—</div>';

                                    const price = priceValue.toLocaleString();
                                    let pricePerMeter = '';

                                    if (row.price_per_meter) {
                                        pricePerMeter = row.price_per_meter.toLocaleString();
                                    } else if (priceValue && row.area_total) {
                                        const calculated = Math.round(priceValue / row.area_total);
                                        pricePerMeter = calculated.toLocaleString();
                                    }

                                    return '<div class="text-xs">' +
                                        '<div class="text-green-600 font-medium">' + price + '</div>' +
                                        (pricePerMeter ? '<div class="text-gray-500">' + pricePerMeter + '</div>' : '') +
                                    '</div>';
                                }
                            }
                        ]
                    });

                    console.log('✅ Таблица дублей инициализирована');

                } catch (error) {
                    console.error('❌ Ошибка инициализации таблицы дублей:', error);
                    showNoDataMessage('duplicatesContainer', 'Ошибка загрузки таблицы дублей: ' + error.message);
                }
            }

            // Вспомогательная функция для получения адреса по ID
            function getAddressNameById(addressId, addressesMap) {
                if (!addressId || !addressesMap) return null;

                const address = addressesMap.get ? addressesMap.get(addressId) : addressesMap[addressId];
                if (!address) return null;

                return address.formatted_address || address.address || address.name;
            }

            // ========== МОДАЛЬНЫЕ ОКНА ==========

            // Функция открытия модального окна листинга
            function showListingModal(listingId) {
                const listing = REPORT_DATA.duplicates_data?.tableData?.find(item =>
                    item.type === 'listing' && item.id === listingId
                );

                if (!listing) {
                    console.error('Объявление не найдено:', listingId);
                    return;
                }

                const modalContent = renderListingModal(listing);
                $('#listingModalContent').html(modalContent);
                $('#listing-modal-title').text('Детали объявления');
                $('#listingModal').removeClass('hidden');
            }

            // Функция открытия модального окна объекта
            function showObjectModal(objectId) {
                const object = REPORT_DATA.duplicates_data?.tableData?.find(item =>
                    item.type === 'object' && item.id === objectId
                );

                if (!object) {
                    console.error('Объект не найден:', objectId);
                    return;
                }

                const modalContent = renderObjectModal(object);
                $('#objectModalContent').html(modalContent);
                $('#object-modal-title').text('Детали объекта недвижимости');
                $('#objectModal').removeClass('hidden');

                // Инициализируем компоненты после открытия модального окна
                setTimeout(function() {
                    initializeObjectComponents(objectId);
                }, 100);
            }

            // Функция закрытия модального окна
            function closeModal(modalId) {
                $('#' + modalId).addClass('hidden');
            }

            // Рендеринг контента модального окна объявления
            function renderListingModal(listing) {
                const addressesMap = REPORT_DATA.duplicates_data?.addressesMap || {};
                const addressFromDb = getAddressNameById(listing.address_id, addressesMap);

                const typeLabels = {
                    'studio': 'Студия',
                    '1k': '1-комнатная',
                    '2k': '2-комнатная',
                    '3k': '3-комнатная',
                    '4k+': '4+ комнатная'
                };

                // Обрабатываем фотографии
                const photos = getListingPhotos(listing);

                let html = '';

                // Карта местоположения
                html += '<div class="mb-6">';
                html += '  <h4 class="text-lg font-medium text-gray-900 mb-4">📍 Местоположение</h4>';
                html += '  <div id="listing-map-' + listing.id + '" class="h-64 bg-gray-200 rounded-md">';
                html += '    <!-- Карта будет отрендерена здесь -->';
                html += '  </div>';
                html += '</div>';

                // График изменения цены
                html += '<div class="mb-6">';
                html += '  <h4 class="text-lg font-medium text-gray-900 mb-4">График изменения цены</h4>';
                html += '  <div id="listing-price-chart-' + listing.id + '" class="w-full">';
                html += '    <!-- График будет отрендерен здесь -->';
                html += '  </div>';
                html += '</div>';

                // История изменения цены
                html += '<div class="mb-6">';
                html += '  <h4 class="text-lg font-medium text-gray-900 mb-4">История изменения цены</h4>';
                html += '  <div class="overflow-x-auto">';
                html += '    <table class="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">';
                html += '      <thead class="bg-gray-50">';
                html += '        <tr>';
                html += '          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>';
                html += '          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>';
                html += '        </tr>';
                html += '      </thead>';
                html += '      <tbody class="bg-white divide-y divide-gray-200">';

                // Заполняем историю цен
                const priceHistory = listing.price_history || [];
                if (priceHistory.length > 0) {
                    priceHistory.forEach(function(entry) {
                        const date = new Date(entry.date);
                        const formattedDate = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                        const price = entry.price ? entry.price.toLocaleString() + ' ₽' : '—';
                        html += '<tr>';
                        html += '  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">' + formattedDate + '</td>';
                        html += '  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">' + price + '</td>';
                        html += '</tr>';
                    });
                } else {
                    html += '<tr><td colspan="2" class="px-6 py-4 text-center text-sm text-gray-500">История цен отсутствует</td></tr>';
                }

                html += '      </tbody>';
                html += '    </table>';
                html += '  </div>';
                html += '</div>';

                // Фотогалерея
                html += '<div class="mb-6">';
                html += '  <h4 class="text-lg font-medium text-gray-900 mb-4">Фотографии ' + (photos.length > 0 ? '(' + photos.length + ')' : '(не найдены)') + '</h4>';
                if (photos.length > 0) {
                    html += '  <div class="fotorama" data-nav="thumbs" data-width="100%" data-height="400" data-thumbheight="50" data-thumbwidth="50" data-allowfullscreen="true" data-transition="slide" data-loop="true" id="listing-gallery-' + listing.id + '">';
                    photos.forEach(function(photo) {
                        html += '    <img src="' + photo + '" alt="Фото объявления" class="listing-photo">';
                    });
                    html += '  </div>';
                } else {
                    html += '  <div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500">';
                    html += '    📷 Фотографии не найдены';
                    html += '  </div>';
                }
                html += '</div>';

                // Основная информация и характеристики (двухколоночная сетка)
                html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

                // Левая колонка: Основная информация
                html += '  <div>';
                html += '    <h4 class="text-lg font-medium text-gray-900 mb-4">Основная информация</h4>';
                html += '    <dl class="space-y-3">';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Заголовок</dt><dd class="text-sm text-gray-900">' + (listing.title || '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Адрес</dt><dd class="text-sm text-gray-900">' + (listing.address || '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Цена</dt><dd class="text-sm text-gray-900">' + (listing.price ? listing.price.toLocaleString() + ' ₽' : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Цена за м²</dt><dd class="text-sm text-gray-900">' + (listing.price_per_meter ? listing.price_per_meter.toLocaleString() + ' ₽/м²' : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Статус</dt><dd class="text-sm text-gray-900">' + (listing.status === 'active' ? 'Активное' : 'Архив') + '</dd></div>';
                html += '    </dl>';
                html += '  </div>';

                // Правая колонка: Характеристики недвижимости
                html += '  <div>';
                html += '    <h4 class="text-lg font-medium text-gray-900 mb-4">Характеристики</h4>';
                html += '    <dl class="space-y-3">';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Тип недвижимости</dt><dd class="text-sm text-gray-900">' + (typeLabels[listing.property_type] || listing.property_type || '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Общая площадь</dt><dd class="text-sm text-gray-900">' + (listing.area_total ? listing.area_total + ' м²' : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Жилая площадь</dt><dd class="text-sm text-gray-900">' + (listing.area_living ? listing.area_living + ' м²' : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Площадь кухни</dt><dd class="text-sm text-gray-900">' + (listing.area_kitchen ? listing.area_kitchen + ' м²' : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Этаж</dt><dd class="text-sm text-gray-900">' + (listing.floor ? listing.floor + (listing.total_floors || listing.floors_total ? ' из ' + (listing.total_floors || listing.floors_total) : '') : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Количество комнат</dt><dd class="text-sm text-gray-900">' + (listing.rooms || '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Состояние</dt><dd class="text-sm text-gray-900">' + (listing.condition || '—') + '</dd></div>';
                html += '    </dl>';
                html += '  </div>';

                // Дополнительная информация (на всю ширину)
                html += '  <div class="lg:col-span-2">';
                html += '    <h4 class="text-lg font-medium text-gray-900 mb-4">Дополнительная информация</h4>';
                html += '    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Дата создания</dt><dd class="text-sm text-gray-900">' + (listing.created ? new Date(listing.created).toLocaleDateString('ru-RU') : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Дата обновления</dt><dd class="text-sm text-gray-900">' + (listing.updated ? new Date(listing.updated).toLocaleDateString('ru-RU') : '—') + '</dd></div>';
                html += '      <div><dt class="text-sm font-medium text-gray-500">Продавец</dt><dd class="text-sm text-gray-900">' + (listing.seller_name || '—') + '</dd></div>';
                html += '    </dl>';

                if (listing.description) {
                    html += '    <div class="mt-6">';
                    html += '      <dt class="text-sm font-medium text-gray-500 mb-2">Описание</dt>';
                    html += '      <dd class="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">' + listing.description + '</dd>';
                    html += '    </div>';
                }

                html += '  </div>';

                html += '</div>';

                return html;
            }

            // Функция получения фотографий объявления
            function getListingPhotos(listing) {
                const photos = [];

                // Проверяем различные возможные поля с фотографиями
                if (listing.photos && Array.isArray(listing.photos)) {
                    photos.push(...listing.photos);
                } else if (listing.images && Array.isArray(listing.images)) {
                    photos.push(...listing.images);
                } else if (listing.photo_urls && Array.isArray(listing.photo_urls)) {
                    photos.push(...listing.photo_urls);
                } else if (listing.main_photo) {
                    photos.push(listing.main_photo);
                }

                // Проверяем поля с одиночными фотографиями
                if (listing.photo && !photos.includes(listing.photo)) {
                    photos.push(listing.photo);
                }

                if (listing.image_url && !photos.includes(listing.image_url)) {
                    photos.push(listing.image_url);
                }

                // Фильтруем валидные URL
                return photos.filter(function(photo) {
                    return photo && typeof photo === 'string' && (photo.startsWith('http://') || photo.startsWith('https://'));
                });
            }

            // Рендеринг контента модального окна объекта
            // Рендеринг модального окна объекта недвижимости (как в DuplicatesManager)
            function renderObjectModal(realEstateObject) {
                const addressesMap = REPORT_DATA.duplicates_data?.addressesMap || {};
                const address = getAddressNameById(realEstateObject.address_id, addressesMap) || 'Адрес не определен';

                // Формируем заголовок карты: краткие характеристики + адрес
                const characteristics = formatObjectCharacteristics(realEstateObject);
                const mapTitle = characteristics + ' — ' + address;

                const objectListings = REPORT_DATA.duplicates_data?.tableData?.filter(item =>
                    item.type === 'listing' && item.object_id === realEstateObject.id
                ) || [];

                return \`
                    <!-- Карта местоположения объекта -->
                    <div class="mb-6">
                        <div class="px-4 py-3">
                            <div class="flex items-center space-x-3">
                                <span class="text-lg font-medium text-gray-900">📍 \${mapTitle}</span>
                            </div>
                        </div>
                        <div class="px-4 pb-4">
                            <div id="object-map-\${realEstateObject.id}" class="h-64 bg-gray-200 rounded-md">
                                <!-- Карта будет отрендерена здесь -->
                            </div>
                        </div>
                    </div>

                    <!-- График изменения цены объекта -->
                    <div class="mb-6">
                        <h4 class="text-lg font-medium text-gray-900 mb-4">График изменения цены объекта</h4>
                        <div id="object-price-chart-\${realEstateObject.id}" class="w-full">
                            <!-- График будет отрендерен здесь -->
                        </div>
                    </div>

                    <!-- История изменения цен объекта -->
                    <div class="mb-6">
                        <h4 class="text-lg font-medium text-gray-900 mb-4">История изменения цены</h4>
                        <div class="overflow-x-auto">
                            <table id="object-price-history-table-\${realEstateObject.id}" class="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    <!-- Данные будут загружены через initializeObjectPriceHistoryTable -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Параметры объекта -->
                    <div class="mb-6">
                        <h4 class="text-lg font-medium text-gray-900 mb-4">Параметры объекта</h4>
                        <div class="bg-white overflow-hidden">
                            <div class="px-4 py-5 sm:p-6">
                                <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                    \${renderObjectParameters(realEstateObject)}
                                </dl>
                            </div>
                        </div>
                    </div>

                    <!-- Фотогалерея и описание -->
                    <div class="mb-6">
                        <h4 class="text-lg font-medium text-gray-900 mb-4">Фотографии и описание</h4>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <!-- Левая часть: Фотографии -->
                            <div class="w-full">
                                <div id="object-photos-\${realEstateObject.id}" class="w-full">
                                    <!-- Фотографии будут загружены из первого объявления -->
                                </div>
                            </div>

                            <!-- Правая часть: Описание -->
                            <div class="w-full">
                                <div class="bg-gray-50 rounded-lg p-4 h-[400px] overflow-y-auto">
                                    <h5 class="text-sm font-medium text-gray-700 mb-3">Описание объявления:</h5>
                                    <div id="object-description-\${realEstateObject.id}" class="text-sm text-gray-600 leading-relaxed">
                                        <!-- Описание будет загружено из первого объявления -->
                                        <div class="text-center text-gray-400 py-8">
                                            Описание недоступно в отчёте
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Таблица объявлений объекта -->
                    <div class="mb-6">
                        <h4 class="text-lg font-medium text-gray-900 mb-4">Объявления объекта (\${objectListings.length})</h4>
                        <div class="overflow-x-auto">
                            <table id="object-listings-table-\${realEstateObject.id}" class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Создано</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Обновлено</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Характеристики</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Адрес</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Контакт</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    <!-- Строки будут добавлены через initializeObjectListingsTable -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                \`;
            }

            // Форматирование характеристик объекта для заголовка
            function formatObjectCharacteristics(obj) {
                const typeLabels = {
                    'studio': 'Студия',
                    '1k': '1к',
                    '2k': '2к',
                    '3k': '3к',
                    '4k+': '4к+'
                };
                const type = typeLabels[obj.property_type] || obj.property_type || '?';
                const area = obj.area_total ? obj.area_total + 'м²' : '';
                const floor = (obj.floor && obj.total_floors) ? obj.floor + '/' + obj.total_floors + 'эт' : '';

                return [type, area, floor].filter(Boolean).join(', ');
            }

            // Рендеринг параметров объекта недвижимости
            function renderObjectParameters(realEstateObject) {
                const parameters = [];
                const typeLabels = {
                    'studio': 'Студия',
                    '1k': '1-комнатная квартира',
                    '2k': '2-комнатная квартира',
                    '3k': '3-комнатная квартира',
                    '4k+': '4+ комнатная квартира'
                };

                // Дата создания
                if (realEstateObject.created_at) {
                    const createdDate = new Date(realEstateObject.created_at).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Дата создания</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${createdDate}</dd>
                        </div>
                    \`);
                }

                // Дата обновления
                if (realEstateObject.updated_at) {
                    const updatedDate = new Date(realEstateObject.updated_at).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Дата обновления</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${updatedDate}</dd>
                        </div>
                    \`);
                }

                // Текущая цена
                if (realEstateObject.current_price) {
                    const price = realEstateObject.current_price.toLocaleString('ru-RU') + ' ₽';
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Текущая цена</dt>
                            <dd class="mt-1 text-sm text-green-600 font-medium">\${price}</dd>
                        </div>
                    \`);
                }

                // Цена за м²
                if (realEstateObject.price_per_meter) {
                    const pricePerMeter = realEstateObject.price_per_meter.toLocaleString('ru-RU') + ' ₽/м²';
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Цена за м²</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${pricePerMeter}</dd>
                        </div>
                    \`);
                }

                // Тип недвижимости
                if (realEstateObject.property_type) {
                    const propertyTypeText = typeLabels[realEstateObject.property_type] || realEstateObject.property_type;
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Тип недвижимости</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${propertyTypeText}</dd>
                        </div>
                    \`);
                }

                // Общая площадь
                if (realEstateObject.area_total) {
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Общая площадь</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${realEstateObject.area_total} м²</dd>
                        </div>
                    \`);
                }

                // Жилая площадь
                if (realEstateObject.area_living) {
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Жилая площадь</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${realEstateObject.area_living} м²</dd>
                        </div>
                    \`);
                }

                // Площадь кухни
                if (realEstateObject.area_kitchen) {
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Площадь кухни</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${realEstateObject.area_kitchen} м²</dd>
                        </div>
                    \`);
                }

                // Этаж
                if (realEstateObject.floor && realEstateObject.total_floors) {
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Этаж</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${realEstateObject.floor} из \${realEstateObject.total_floors}</dd>
                        </div>
                    \`);
                }

                // Статус объекта
                if (realEstateObject.status) {
                    const statusText = realEstateObject.status === 'active' ? 'Активный' : 'Архивный';
                    const statusColor = realEstateObject.status === 'active' ? 'text-green-600' : 'text-gray-600';
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Статус объекта</dt>
                            <dd class="mt-1 text-sm \${statusColor} font-medium">\${statusText}</dd>
                        </div>
                    \`);
                }

                // Статус собственника
                if (realEstateObject.owner_status) {
                    const ownerStatusColor = realEstateObject.owner_status === 'есть от собственника' ? 'text-green-600' :
                                           realEstateObject.owner_status === 'было от собственника' ? 'text-yellow-600' :
                                           'text-gray-600';
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Статус собственника</dt>
                            <dd class="mt-1 text-sm \${ownerStatusColor}">\${realEstateObject.owner_status}</dd>
                        </div>
                    \`);
                }

                // Количество объявлений
                if (realEstateObject.listings_count) {
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Всего объявлений</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${realEstateObject.listings_count}</dd>
                        </div>
                    \`);
                }

                // Количество активных объявлений
                if (realEstateObject.active_listings_count !== undefined) {
                    parameters.push(\`
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Активных объявлений</dt>
                            <dd class="mt-1 text-sm text-gray-900">\${realEstateObject.active_listings_count}</dd>
                        </div>
                    \`);
                }

                return parameters.join('');
            }


            // Рендеринг child row с объявлениями объекта (идентично DuplicatesManager)
            function renderObjectListings(objectId) {
                const objectListings = REPORT_DATA.duplicates_data?.tableData?.filter(item =>
                    item.type === 'listing' && item.object_id === objectId
                ) || [];

                if (objectListings.length === 0) {
                    return '<div class="p-4 text-center text-gray-500">Нет объявлений для этого объекта</div>';
                }

                const addressesMap = REPORT_DATA.duplicates_data?.addressesMap || {};

                // Сортируем по дате обновления (убывание)
                const sortedListings = objectListings.sort(function(a, b) {
                    const timestampA = new Date(a.updated || a.updated_at || a.created || a.created_at || 0).getTime();
                    const timestampB = new Date(b.updated || b.updated_at || b.created || b.created_at || 0).getTime();
                    return timestampB - timestampA;
                });

                let html = '<div class="bg-gray-50 p-4">';
                html += '<h4 class="text-sm font-medium text-gray-900 mb-3">Объявления объекта (' + sortedListings.length + ')</h4>';
                html += '<div class="overflow-x-auto">';
                html += '<table class="min-w-full divide-y divide-gray-200">';
                html += '<thead class="bg-gray-100">';
                html += '<tr>';
                html += '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>';
                html += '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Создано</th>';
                html += '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Обновлено</th>';
                html += '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Характеристики</th>';
                html += '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Адрес</th>';
                html += '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>';
                html += '<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Контакт</th>';
                html += '</tr>';
                html += '</thead>';
                html += '<tbody class="bg-white divide-y divide-gray-200">';

                sortedListings.forEach(function(listing) {
                    html += '<tr class="hover:bg-gray-50">';

                    // 1. Статус
                    html += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const statusBadges = {
                        'active': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>',
                        'archived': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>',
                        'archive': '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>'
                    };
                    html += statusBadges[listing.status] || '<span class="text-xs text-gray-500">' + (listing.status || '—') + '</span>';
                    html += '</td>';

                    // 2. Дата создания с экспозицией
                    html += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const dateValue = listing.created || listing.created_at;
                    if (dateValue) {
                        const createdDate = new Date(dateValue);
                        const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                        const updatedValue = listing.updated || listing.updated_at;
                        const endDate = updatedValue ? new Date(updatedValue) : new Date();
                        const diffTime = Math.abs(endDate - createdDate);
                        const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        html += '<div class="text-xs">' + dateStr + '<br><span class="text-gray-500" style="font-size: 10px;">эксп. ' + exposureDays + ' дн.</span></div>';
                    } else {
                        html += '—';
                    }
                    html += '</td>';

                    // 3. Дата обновления с давностью
                    html += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const updatedDateValue = listing.updated || listing.updated_at;
                    if (updatedDateValue) {
                        const date = new Date(updatedDateValue);
                        const now = new Date();
                        const diffTime = Math.abs(now - date);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                        const daysAgo = diffDays === 1 ? '1 день назад' : diffDays + ' дн. назад';
                        const color = diffDays > 7 ? 'text-red-600' : 'text-green-600';
                        html += '<div class="text-xs">' + dateStr + '<br><span class="' + color + '" style="font-size: 10px;">' + daysAgo + '</span></div>';
                    } else {
                        html += '—';
                    }
                    html += '</td>';

                    // 4. Характеристики
                    html += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const parts = [];
                    if (listing.property_type) {
                        const types = { 'studio': 'Студия', '1k': '1-к', '2k': '2-к', '3k': '3-к', '4k+': '4-к+' };
                        parts.push(types[listing.property_type] || listing.property_type);
                        parts.push('квартира');
                    }
                    const areas = [];
                    if (listing.area_total) areas.push(listing.area_total);
                    if (listing.area_living) areas.push(listing.area_living);
                    if (listing.area_kitchen) areas.push(listing.area_kitchen);
                    if (areas.length > 0) parts.push(areas.join('/') + 'м²');
                    if (listing.floor && listing.total_floors) {
                        parts.push(listing.floor + '/' + listing.total_floors + ' эт.');
                    } else if (listing.floor && listing.floors_total) {
                        parts.push(listing.floor + '/' + listing.floors_total + ' эт.');
                    }
                    const characteristicsText = parts.length > 0 ? parts.join(', ') : 'Не указано';
                    html += '<div class="text-xs text-gray-900 max-w-xs" title="' + characteristicsText + '">' + characteristicsText + '</div>';
                    html += '</td>';

                    // 5. Адрес (кликабельный)
                    html += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const addressFromDb = getAddressNameById(listing.address_id, addressesMap);
                    const addressText = listing.address || 'Адрес не указан';
                    let addressFromDbText = addressFromDb || 'Адрес не определен';
                    const hasLowConfidence = listing.address_match_confidence === 'low' || listing.address_match_confidence === 'very_low';
                    const isManualConfidence = listing.address_match_confidence === 'manual';
                    const isAddressNotFound = addressFromDbText === 'Адрес не определен';
                    if (hasLowConfidence && !isAddressNotFound) {
                        const confidenceText = listing.address_match_confidence === 'low' ? 'Низкая' : 'Очень низкая';
                        addressFromDbText += ' (' + confidenceText + ')';
                    } else if (isManualConfidence && !isAddressNotFound) {
                        addressFromDbText += ' (Подтвержден)';
                    }
                    const addressClass = addressText === 'Адрес не указан' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800';
                    const addressFromDbClass = (isAddressNotFound || (hasLowConfidence && !isManualConfidence)) ? 'text-red-500' : 'text-gray-500';
                    html += '<div class="text-xs max-w-xs">';
                    html += '<div class="' + addressClass + ' cursor-pointer clickable-address truncate" data-listing-id="' + listing.id + '">' + addressText + '</div>';
                    html += '<div class="' + addressFromDbClass + ' truncate">' + addressFromDbText + '</div>';
                    html += '</div>';
                    html += '</td>';

                    // 6. Цена
                    html += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const priceValue = listing.price;
                    if (priceValue) {
                        const price = priceValue.toLocaleString();
                        let pricePerMeter = '';
                        if (listing.price_per_meter) {
                            pricePerMeter = listing.price_per_meter.toLocaleString();
                        } else if (priceValue && listing.area_total) {
                            const calculated = Math.round(priceValue / listing.area_total);
                            pricePerMeter = calculated.toLocaleString();
                        }
                        html += '<div class="text-xs">';
                        html += '<div class="text-green-600 font-medium">' + price + '</div>';
                        if (pricePerMeter) html += '<div class="text-gray-500">' + pricePerMeter + '</div>';
                        html += '</div>';
                    } else {
                        html += '<div class="text-xs">—</div>';
                    }
                    html += '</td>';

                    // 7. Контакт с источником
                    html += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const sellerType = listing.seller_type === 'private' ? 'Собственник' :
                                      listing.seller_type === 'agency' ? 'Агент' :
                                      listing.seller_type === 'agent' ? 'Агент' :
                                      listing.seller_type === 'owner' ? 'Собственник' :
                                      listing.seller_type || 'Не указано';
                    const sellerName = listing.seller_name || 'Не указано';
                    const sourceUrl = listing.url || '#';
                    let sourceName = 'Неизвестно';
                    if (listing.source_metadata && listing.source_metadata.original_source) {
                        sourceName = listing.source_metadata.original_source;
                    } else if (listing.source) {
                        sourceName = listing.source === 'avito' ? 'avito.ru' : listing.source === 'cian' ? 'cian.ru' : listing.source;
                    }
                    html += '<div class="text-xs max-w-xs">';
                    html += '<div class="text-blue-600 hover:text-blue-800 truncate" title="' + sourceName + '"><a href="' + sourceUrl + '" target="_blank">' + sourceName + '</a></div>';
                    html += '<div class="text-gray-900 truncate" title="' + sellerType + '">' + sellerType + '</div>';
                    html += '<div class="text-gray-500 truncate" title="' + sellerName + '">' + sellerName + '</div>';
                    html += '</div>';
                    html += '</td>';

                    html += '</tr>';
                });

                html += '</tbody></table></div></div>';
                return html;
            }

            // Функции инициализации компонентов модального окна объявления
            function initializeListingComponents(listingId) {
                const listing = REPORT_DATA.duplicates_data?.tableData?.find(item =>
                    item.type === 'listing' && item.id === listingId
                );

                if (!listing) return;

                // 1. Инициализация карты Leaflet
                initializeListingMap(listing);

                // Обновляем размеры карты после небольшой задержки (для корректного отображения)
                setTimeout(function() {
                    const mapContainerId = 'listing-map-' + listing.id;
                    const mapElement = document.getElementById(mapContainerId);
                    if (mapElement && mapElement._leaflet_map) {
                        mapElement._leaflet_map.invalidateSize();
                    }
                }, 300);

                // 2. Инициализация графика ApexCharts
                initializeListingPriceChart(listing);

                // 3. Инициализация Fotorama галереи
                initializeListingGallery(listing);

                // 4. Обработчик кнопки "Открыть объявление"
                $('#openListingBtnFooter').off('click').on('click', function() {
                    if (listing.url) {
                        window.open(listing.url, '_blank');
                    } else {
                        console.warn('URL объявления не найден');
                    }
                });
            }

            // Инициализация карты Leaflet для объявления
            function initializeListingMap(listing) {
                const mapContainerId = 'listing-map-' + listing.id;
                const mapContainer = document.getElementById(mapContainerId);

                if (!mapContainer) return;

                // Проверяем, что Leaflet доступен
                if (typeof L === 'undefined') {
                    console.warn('Leaflet не загружен');
                    return;
                }

                // Получаем координаты из различных возможных полей
                let lat, lng;

                if (listing.coordinates) {
                    // Если coordinates - объект с lat/lon
                    if (listing.coordinates.lat && listing.coordinates.lon) {
                        lat = listing.coordinates.lat;
                        lng = listing.coordinates.lon;
                    }
                    // Если coordinates - объект с lat/lng
                    else if (listing.coordinates.lat && listing.coordinates.lng) {
                        lat = listing.coordinates.lat;
                        lng = listing.coordinates.lng;
                    }
                    // Если coordinates - объект с latitude/longitude
                    else if (listing.coordinates.latitude && listing.coordinates.longitude) {
                        lat = listing.coordinates.latitude;
                        lng = listing.coordinates.longitude;
                    }
                }
                // Проверяем прямые поля lat/lon
                else if (listing.lat && listing.lon) {
                    lat = listing.lat;
                    lng = listing.lon;
                }
                // Проверяем поля lat/lng
                else if (listing.lat && listing.lng) {
                    lat = listing.lat;
                    lng = listing.lng;
                }
                // Проверяем поля latitude/longitude
                else if (listing.latitude && listing.longitude) {
                    lat = listing.latitude;
                    lng = listing.longitude;
                }

                // Валидация координат
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                    mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500 text-sm">Координаты не найдены</div>';
                    return;
                }

                try {
                    // Уничтожаем предыдущую карту если она существует
                    if (mapContainer._leafletMap) {
                        mapContainer._leafletMap.remove();
                        mapContainer._leafletMap = null;
                    }

                    // Создаём карту
                    const map = L.map(mapContainerId, {
                        center: [lat, lng],
                        zoom: 16,
                        zoomControl: true,
                        scrollWheelZoom: false
                    });

                    // Сохраняем ссылку на карту
                    mapContainer._leafletMap = map;

                    // Добавляем слой OpenStreetMap
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap contributors',
                        maxZoom: 19
                    }).addTo(map);

                    // Добавляем маркер с иконкой
                    const listingMarker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            className: 'listing-marker',
                            html: '<div style="background: #3b82f6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>',
                            iconSize: [24, 24],
                            iconAnchor: [12, 12]
                        })
                    }).addTo(map);

                    // Добавляем popup к маркеру
                    const popupContent = '<div style="min-width: 200px;"><strong>' + (listing.title || 'Объявление') + '</strong><br>' +
                                        '<span style="color: #6b7280; font-size: 12px;">' + (listing.address || 'Адрес не указан') + '</span><br>' +
                                        '<span style="color: #059669; font-weight: bold;">' + (listing.price ? listing.price.toLocaleString() + ' ₽' : '—') + '</span>' +
                                        (listing.price_per_meter ? '<br><span style="color: #6b7280; font-size: 12px;">' + listing.price_per_meter.toLocaleString() + ' ₽/м²</span>' : '') +
                                        '</div>';
                    listingMarker.bindPopup(popupContent);

                } catch (error) {
                    console.error('Ошибка инициализации карты:', error);
                    mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500 text-sm">Ошибка загрузки карты</div>';
                }
            }

            // Подготовка данных истории цен (как в UIManager)
            function preparePriceHistoryData(listing) {
                const history = [];

                // Добавляем историю цен если есть
                if (listing.price_history && Array.isArray(listing.price_history)) {
                    listing.price_history.forEach(function(item) {
                        if ((item.new_price || item.price) && item.date) {
                            history.push({
                                date: new Date(item.date).getTime(),
                                price: parseInt(item.new_price || item.price)
                            });
                        }
                    });
                }

                // Добавляем конечную точку с правильной датой в зависимости от статуса
                if (listing.price) {
                    let endPriceDate;

                    if (listing.status === 'active') {
                        // Для активных объявлений - текущая дата
                        endPriceDate = new Date();
                    } else {
                        // Для архивных объявлений - дата последнего обновления
                        endPriceDate = new Date(listing.updated || listing.created || Date.now());
                    }

                    // Добавляем конечную точку только если она отличается от уже существующих
                    const lastHistoryDate = history.length > 0 ? history[history.length - 1].date : 0;
                    if (Math.abs(endPriceDate.getTime() - lastHistoryDate) > 24 * 60 * 60 * 1000) {
                        history.push({
                            date: endPriceDate.getTime(),
                            price: parseInt(listing.price)
                        });
                    }
                }

                // Сортируем по дате
                history.sort(function(a, b) { return a.date - b.date; });

                // Убираем дубликаты цен подряд, но оставляем ключевые точки
                const filtered = [];
                for (let i = 0; i < history.length; i++) {
                    if (i === 0 || i === history.length - 1 || history[i].price !== history[i-1].price) {
                        filtered.push(history[i]);
                    }
                }

                return filtered;
            }

            // Инициализация графика изменения цены (как в UIManager)
            function initializeListingPriceChart(listing) {
                const chartContainerId = 'listing-price-chart-' + listing.id;
                const chartContainer = document.getElementById(chartContainerId);

                if (!chartContainer) return;

                // Проверяем, что ApexCharts доступен
                if (typeof ApexCharts === 'undefined') {
                    console.warn('ApexCharts не загружен');
                    return;
                }

                // Подготавливаем данные для графика из истории цен
                const priceHistory = preparePriceHistoryData(listing);

                if (priceHistory.length === 0) {
                    chartContainer.innerHTML = '<div class="text-center text-gray-500 py-8">История цен отсутствует</div>';
                    return;
                }

                const seriesData = priceHistory.map(function(item) { return [item.date, item.price]; });
                const prices = priceHistory.map(function(item) { return item.price; });
                const minPrice = Math.min.apply(null, prices);
                const maxPrice = Math.max.apply(null, prices);

                const series = [{
                    name: '<span class="text-sky-500">цена</span>',
                    data: seriesData
                }];
                const colors = ['#56c2d6'];
                const widths = [3];

                const options = {
                    chart: {
                        height: 300,
                        locales: [{
                            "name": "ru",
                            "options": {
                                "months": [
                                    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                                    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
                                ],
                                "shortMonths": [
                                    "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
                                    "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
                                ],
                                "days": [
                                    "Воскресенье", "Понедельник", "Вторник", "Среда",
                                    "Четверг", "Пятница", "Суббота"
                                ],
                                "shortDays": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
                                "toolbar": {
                                    "exportToSVG": "Сохранить SVG",
                                    "exportToPNG": "Сохранить PNG",
                                    "exportToCSV": "Сохранить CSV",
                                    "menu": "Меню",
                                    "selection": "Выбор",
                                    "selectionZoom": "Выбор с увеличением",
                                    "zoomIn": "Увеличить",
                                    "zoomOut": "Уменьшить",
                                    "pan": "Перемещение",
                                    "reset": "Сбросить увеличение"
                                }
                            }
                        }],
                        defaultLocale: "ru",
                        type: 'line',
                        shadow: {
                            enabled: false,
                            color: 'rgba(187,187,187,0.47)',
                            top: 3,
                            left: 2,
                            blur: 3,
                            opacity: 1
                        },
                        toolbar: {
                            show: false
                        }
                    },
                    stroke: {
                        curve: 'stepline',
                        width: widths
                    },
                    series: series,
                    colors: colors,
                    xaxis: {
                        type: 'datetime',
                        labels: {
                            datetimeUTC: false
                        }
                    },
                    yaxis: {
                        min: minPrice - (maxPrice - minPrice) * 0.1,
                        max: maxPrice + (maxPrice - minPrice) * 0.1,
                        labels: {
                            formatter: function(value) {
                                return value ? Math.round(value).toLocaleString() + ' ₽' : '';
                            }
                        }
                    },
                    tooltip: {
                        x: {
                            format: 'dd MMM yyyy HH:mm'
                        },
                        y: {
                            formatter: function(value) {
                                return value ? value.toLocaleString() + ' ₽' : '';
                            }
                        }
                    },
                    grid: {
                        borderColor: '#e5e7eb'
                    }
                };

                try {
                    const chart = new ApexCharts(chartContainer, options);
                    chart.render();
                } catch (error) {
                    console.error('Ошибка рендеринга графика:', error);
                }
            }

            // Инициализация Fotorama галереи
            function initializeListingGallery(listing) {
                const galleryId = 'listing-gallery-' + listing.id;
                const galleryElement = $('#' + galleryId);

                if (galleryElement.length === 0) return;

                // Проверяем, что Fotorama доступна
                if (typeof $.fn.fotorama === 'undefined') {
                    console.warn('Fotorama не загружена');
                    return;
                }

                try {
                    galleryElement.fotorama();
                } catch (error) {
                    console.error('Ошибка инициализации Fotorama:', error);
                }
            }

            // ========== ФУНКЦИИ ИНИЦИАЛИЗАЦИИ КОМПОНЕНТОВ ОБЪЕКТА ==========

            // Инициализация всех компонентов модального окна объекта
            function initializeObjectComponents(objectId) {
                const realEstateObject = REPORT_DATA.duplicates_data?.tableData?.find(item =>
                    item.type === 'object' && item.id === objectId
                );

                if (!realEstateObject) return;

                const objectListings = REPORT_DATA.duplicates_data?.tableData?.filter(item =>
                    item.type === 'listing' && item.object_id === objectId
                ) || [];

                // 1. Инициализация карты
                initializeObjectMap(realEstateObject);

                // Обновляем размеры карты после небольшой задержки
                setTimeout(function() {
                    const mapContainerId = 'object-map-' + realEstateObject.id;
                    const mapElement = document.getElementById(mapContainerId);
                    if (mapElement && mapElement._leaflet_map) {
                        mapElement._leaflet_map.invalidateSize();
                    }
                }, 300);

                // 2. Инициализация графика цены
                initializeObjectPriceChart(realEstateObject);

                // 3. Инициализация таблицы истории цен
                initializeObjectPriceHistoryTable(realEstateObject);

                // 4. Инициализация таблицы объявлений
                initializeObjectListingsTable(objectListings, realEstateObject.id);

                // 5. Инициализация фотогалереи (из первого объявления)
                if (objectListings.length > 0) {
                    initializeObjectPhotosGallery(objectListings[0], realEstateObject.id);
                }
            }

            // Инициализация карты объекта
            function initializeObjectMap(realEstateObject) {
                const mapContainerId = 'object-map-' + realEstateObject.id;
                const mapContainer = document.getElementById(mapContainerId);

                if (!mapContainer) {
                    console.warn('❌ Контейнер карты не найден:', mapContainerId);
                    return;
                }

                // Проверяем что Leaflet загружен
                if (typeof L === 'undefined') {
                    console.warn('❌ Leaflet не загружен');
                    mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Leaflet не загружен</div>';
                    return;
                }

                const addressesMap = REPORT_DATA.duplicates_data?.addressesMap || {};

                // addressesMap может быть Map или объектом
                const address = addressesMap.get ? addressesMap.get(realEstateObject.address_id) : addressesMap[realEstateObject.address_id];

                if (!address) {
                    console.warn('❌ Адрес не найден:', realEstateObject.address_id);
                    mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Адрес не найден</div>';
                    return;
                }

                // Поддерживаем разные форматы координат
                let lat, lng;

                // Формат 1: coordinates.lat/lng (из БД)
                if (address.coordinates && address.coordinates.lat !== undefined && address.coordinates.lng !== undefined) {
                    lat = address.coordinates.lat;
                    lng = address.coordinates.lng;
                }
                // Формат 2: lat/lng напрямую (для совместимости)
                else if (address.lat !== undefined && address.lng !== undefined) {
                    lat = address.lat;
                    lng = address.lng;
                }
                // Формат 3: lon вместо lng (для совместимости)
                else if (address.coordinates && address.coordinates.lat !== undefined && address.coordinates.lon !== undefined) {
                    lat = address.coordinates.lat;
                    lng = address.coordinates.lon;
                }

                if (!lat || !lng) {
                    console.warn('❌ Координаты не найдены для адреса:', realEstateObject.address_id, address);
                    mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Координаты не найдены</div>';
                    return;
                }

                try {
                    // Уничтожаем предыдущую карту если она существует
                    if (mapContainer._leaflet_map) {
                        mapContainer._leaflet_map.remove();
                    }

                    // Создаём карту
                    const map = L.map(mapContainerId).setView([lat, lng], 16);
                    mapContainer._leaflet_map = map;

                    // Добавляем тайлы OpenStreetMap
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap contributors',
                        maxZoom: 19
                    }).addTo(map);

                    // Добавляем маркер
                    const marker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            className: 'object-marker',
                            html: '<div style="background: #10b981; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🏠</div>',
                            iconSize: [28, 28]
                        })
                    }).addTo(map);

                    // Добавляем popup
                    const popupContent = '<div style="min-width: 200px;"><strong>Объект недвижимости</strong><br>' +
                        (address.address || 'Адрес не указан') + '</div>';
                    marker.bindPopup(popupContent);

                } catch (error) {
                    console.error('Ошибка инициализации карты объекта:', error);
                    mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Ошибка загрузки карты</div>';
                }
            }

            // Инициализация графика изменения цены объекта
            function initializeObjectPriceChart(realEstateObject) {
                const chartContainerId = 'object-price-chart-' + realEstateObject.id;
                const chartContainer = document.getElementById(chartContainerId);

                if (!chartContainer) return;

                // Проверяем, что ApexCharts доступен
                if (typeof ApexCharts === 'undefined') {
                    console.warn('ApexCharts не загружен');
                    return;
                }

                // Подготавливаем данные из истории цен
                const priceHistory = realEstateObject.price_history || [];

                if (priceHistory.length === 0) {
                    chartContainer.innerHTML = '<div class="text-center text-gray-500 py-8">История цен отсутствует</div>';
                    return;
                }

                // Преобразуем данные для графика
                const seriesData = priceHistory.map(function(item) {
                    return [new Date(item.date).getTime(), item.price];
                });

                const prices = priceHistory.map(function(item) { return item.price; });
                const minPrice = Math.min.apply(null, prices);
                const maxPrice = Math.max.apply(null, prices);

                const series = [{
                    name: '<span class="text-green-500">цена объекта</span>',
                    data: seriesData
                }];

                const options = {
                    chart: {
                        height: 300,
                        locales: [{
                            name: 'ru',
                            options: {
                                months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
                                shortMonths: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                                days: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
                                shortDays: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
                            }
                        }],
                        defaultLocale: 'ru',
                        type: 'line',
                        toolbar: { show: false }
                    },
                    stroke: {
                        curve: 'stepline',
                        width: [3]
                    },
                    series: series,
                    colors: ['#10b981'],
                    xaxis: {
                        type: 'datetime',
                        labels: { datetimeUTC: false }
                    },
                    yaxis: {
                        min: minPrice - (maxPrice - minPrice) * 0.1,
                        max: maxPrice + (maxPrice - minPrice) * 0.1,
                        labels: {
                            formatter: function(value) {
                                return value ? Math.round(value).toLocaleString() + ' ₽' : '';
                            }
                        }
                    },
                    tooltip: {
                        x: { format: 'dd MMM yyyy HH:mm' },
                        y: {
                            formatter: function(value) {
                                return value ? value.toLocaleString() + ' ₽' : '';
                            }
                        }
                    },
                    grid: { borderColor: '#e5e7eb' }
                };

                try {
                    const chart = new ApexCharts(chartContainer, options);
                    chart.render();
                } catch (error) {
                    console.error('Ошибка рендеринга графика объекта:', error);
                }
            }

            // Инициализация таблицы истории цен объекта
            function initializeObjectPriceHistoryTable(realEstateObject) {
                const tableId = 'object-price-history-table-' + realEstateObject.id;
                const tableBody = $('#' + tableId + ' tbody');

                if (tableBody.length === 0) return;

                const priceHistory = realEstateObject.price_history || [];

                tableBody.empty();

                if (priceHistory.length === 0) {
                    tableBody.append('<tr><td colspan="2" class="px-6 py-4 text-center text-sm text-gray-500">История цен отсутствует</td></tr>');
                    return;
                }

                // Сортируем по дате (сначала новые)
                const sortedHistory = priceHistory.slice().sort(function(a, b) {
                    return new Date(b.date).getTime() - new Date(a.date).getTime();
                });

                sortedHistory.forEach(function(entry) {
                    const date = new Date(entry.date);
                    const formattedDate = date.toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    const price = entry.price ? entry.price.toLocaleString() + ' ₽' : '—';

                    const row = '<tr>' +
                        '<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">' + formattedDate + '</td>' +
                        '<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">' + price + '</td>' +
                        '</tr>';
                    tableBody.append(row);
                });
            }

            // Инициализация таблицы объявлений объекта
            function initializeObjectListingsTable(objectListings, objectId) {
                const tableId = 'object-listings-table-' + objectId;
                const tableBody = $('#' + tableId + ' tbody');

                if (tableBody.length === 0) return;

                tableBody.empty();

                if (objectListings.length === 0) {
                    tableBody.append('<tr><td colspan="7" class="px-3 py-4 text-center text-sm text-gray-500">Нет объявлений</td></tr>');
                    return;
                }

                const addressesMap = REPORT_DATA.duplicates_data?.addressesMap || {};

                // Сортируем по дате обновления (убывание)
                const sortedListings = objectListings.slice().sort(function(a, b) {
                    const timestampA = new Date(a.updated || a.updated_at || a.created || a.created_at || 0).getTime();
                    const timestampB = new Date(b.updated || b.updated_at || b.created || b.created_at || 0).getTime();
                    return timestampB - timestampA;
                });

                sortedListings.forEach(function(listing) {
                    let row = '<tr class="hover:bg-gray-50" data-listing-id="' + listing.id + '">';

                    // 1. Статус
                    row += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    if (listing.status === 'active') {
                        row += '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Активный</span>';
                    } else {
                        row += '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Архивный</span>';
                    }
                    row += '</td>';

                    // 2. Создано (с экспозицией)
                    row += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const dateValue = listing.created || listing.created_at;
                    if (dateValue) {
                        const createdDate = new Date(dateValue);
                        const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                        const updatedValue = listing.updated || listing.updated_at;
                        const endDate = updatedValue ? new Date(updatedValue) : new Date();
                        const diffTime = Math.abs(endDate - createdDate);
                        const exposureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        row += '<div class="text-xs">' + dateStr + '<br><span class="text-gray-500" style="font-size: 10px;">эксп. ' + exposureDays + ' дн.</span></div>';
                    } else {
                        row += '—';
                    }
                    row += '</td>';

                    // 3. Обновлено
                    row += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    const updatedDate = listing.updated || listing.updated_at;
                    if (updatedDate) {
                        const updated = new Date(updatedDate);
                        const updatedStr = updated.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                        const now = new Date();
                        const diffDays = Math.floor((now - updated) / (1000 * 60 * 60 * 24));
                        const colorClass = diffDays <= 7 ? 'text-green-600' : 'text-red-600';
                        row += '<div class="text-xs">' + updatedStr + '<br><span class="' + colorClass + '" style="font-size: 10px;">' + diffDays + ' дн. назад</span></div>';
                    } else {
                        row += '—';
                    }
                    row += '</td>';

                    // 4. Характеристики
                    row += '<td class="px-3 py-2 text-xs">';
                    const chars = [];
                    if (listing.property_type) {
                        const types = { 'studio': 'Ст', '1k': '1к', '2k': '2к', '3k': '3к', '4k+': '4к+' };
                        chars.push(types[listing.property_type] || listing.property_type);
                    }
                    if (listing.area_total) chars.push(listing.area_total + 'м²');
                    if (listing.floor && (listing.total_floors || listing.floors_total)) {
                        chars.push(listing.floor + '/' + (listing.total_floors || listing.floors_total) + 'эт');
                    }
                    row += chars.join(', ') || '—';
                    row += '</td>';

                    // 5. Адрес
                    row += '<td class="px-3 py-2 text-xs">';
                    const addressText = listing.address || getAddressNameById(listing.address_id, addressesMap) || 'Адрес не указан';
                    const addressClass = addressText === 'Адрес не указан' ? 'text-red-600' : 'text-blue-600 hover:text-blue-800 cursor-pointer clickable-object-listing-address';
                    row += '<div class="' + addressClass + ' max-w-xs truncate" data-listing-id="' + listing.id + '" data-object-id="' + objectId + '">' + addressText + '</div>';
                    row += '</td>';

                    // 6. Цена
                    row += '<td class="px-3 py-2 whitespace-nowrap text-xs">';
                    if (listing.price) {
                        row += '<div class="text-green-600 font-medium">' + listing.price.toLocaleString() + ' ₽</div>';
                        if (listing.price_per_meter) {
                            row += '<div class="text-gray-500" style="font-size: 10px;">' + listing.price_per_meter.toLocaleString() + ' ₽/м²</div>';
                        }
                    } else {
                        row += '—';
                    }
                    row += '</td>';

                    // 7. Контакт
                    row += '<td class="px-3 py-2 text-xs">';
                    if (listing.url) {
                        const source = listing.source_metadata?.original_source || 'Источник';
                        row += '<a href="' + listing.url + '" target="_blank" class="text-blue-600 hover:text-blue-800 block truncate max-w-[100px]">' + source + '</a>';
                    }
                    if (listing.seller_type) {
                        const sellerBadge = listing.seller_type === 'owner' ?
                            '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Собств.</span>' :
                            '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Агент</span>';
                        row += sellerBadge;
                    }
                    if (listing.seller_name) {
                        row += '<div class="text-gray-600 truncate max-w-[100px]" style="font-size: 10px;">' + listing.seller_name + '</div>';
                    }
                    row += '</td>';

                    row += '</tr>';
                    tableBody.append(row);
                });
            }

            // Инициализация фотогалереи объекта
            function initializeObjectPhotosGallery(listing, objectId) {
                const galleryContainer = document.getElementById('object-photos-' + objectId);

                if (!galleryContainer) return;

                const photos = getListingPhotos(listing);

                if (photos.length === 0) {
                    galleryContainer.innerHTML = '<div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500">📷 Фотографии не найдены</div>';
                    return;
                }

                // Создаём Fotorama галерею
                let html = '<div class="fotorama" data-nav="thumbs" data-width="100%" data-height="400" data-thumbheight="50" data-thumbwidth="50" data-allowfullscreen="true" data-transition="slide" data-loop="true" id="object-gallery-' + objectId + '">';
                photos.forEach(function(photo) {
                    html += '<img src="' + photo + '" alt="Фото объявления" class="object-photo">';
                });
                html += '</div>';

                galleryContainer.innerHTML = html;

                // Инициализируем Fotorama
                if (typeof $.fn.fotorama !== 'undefined') {
                    try {
                        $('#object-gallery-' + objectId).fotorama();
                    } catch (error) {
                        console.error('Ошибка инициализации Fotorama объекта:', error);
                    }
                }
            }

            // Загрузка фотографий объекта при клике на объявление
            function loadObjectPhotosGallery(listing, objectId) {
                const photosContainer = document.getElementById('object-photos-' + objectId);
                if (!photosContainer) return;

                const photos = getListingPhotos(listing);

                if (photos.length === 0) {
                    photosContainer.innerHTML = '<div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500">📷 Нет фотографий в выбранном объявлении</div>';
                    return;
                }

                // Создаём галерею фотографий
                let html = '<div class="fotorama" data-nav="thumbs" data-width="100%" data-height="400" data-thumbheight="50" data-thumbwidth="50" data-allowfullscreen="true" data-transition="slide" data-loop="true" id="object-gallery-' + objectId + '">';
                photos.forEach(function(photo) {
                    html += '<img src="' + photo + '" alt="Фото объявления">';
                });
                html += '</div>';

                photosContainer.innerHTML = html;

                // Инициализируем Fotorama
                setTimeout(function() {
                    const galleryElement = document.getElementById('object-gallery-' + objectId);
                    if (galleryElement && typeof $.fn.fotorama !== 'undefined') {
                        $(galleryElement).fotorama();
                    }
                }, 100);
            }

            // Загрузка описания объекта при клике на объявление
            function loadObjectDescription(listing, objectId) {
                const descriptionContainer = document.getElementById('object-description-' + objectId);
                if (!descriptionContainer) return;

                // Получаем описание из объявления
                const description = listing.description || '';

                if (!description || description.trim() === '') {
                    descriptionContainer.innerHTML = '<div class="text-center text-gray-400 py-8">📝 Нет описания в выбранном объявлении</div>';
                    return;
                }

                // Форматируем описание с переносами строк
                const newlineRegex = new RegExp('\\n', 'g');
                const carriageReturnRegex = new RegExp('\\r', 'g');
                const formattedDescription = description
                    .replace(newlineRegex, '<br>')
                    .replace(carriageReturnRegex, '')
                    .trim();

                descriptionContainer.innerHTML = '<div class="text-sm text-gray-600 leading-relaxed">' + formattedDescription + '</div>';
            }

            // Обновление активной строки в таблице объявлений объекта
            function updateActiveObjectListingRow(listingId, objectId) {
                const tableContainer = document.getElementById('object-listings-table-' + objectId);
                if (!tableContainer) return;

                // Убираем выделение со всех строк
                const allRows = tableContainer.querySelectorAll('tbody tr');
                allRows.forEach(function(row) {
                    row.classList.remove('bg-yellow-50', 'border-yellow-200');
                });

                // Выделяем текущую строку
                const activeRow = tableContainer.querySelector('tr[data-listing-id="' + listingId + '"]');
                if (activeRow) {
                    activeRow.classList.add('bg-yellow-50', 'border-yellow-200');
                }
            }


            // Обработчики событий для модальных окон
            $(document).ready(function() {
                // Клик по адресу объявления
                $(document).on('click', '.clickable-address', function(e) {
                    e.preventDefault();
                    const listingId = $(this).data('listing-id');
                    showListingModal(listingId);

                    // После показа модального окна инициализируем компоненты
                    setTimeout(function() {
                        initializeListingComponents(listingId);
                    }, 100);
                });

                // Клик по адресу объекта
                $(document).on('click', '.clickable-object-address', function(e) {
                    e.preventDefault();
                    const objectId = $(this).data('object-id');
                    showObjectModal(objectId);
                });

                // Клик по адресу объявления в таблице объекта (переключение фото/описания)
                $(document).on('click', '.clickable-object-listing-address', function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const listingId = $(this).data('listing-id');
                    const objectId = $(this).data('object-id');

                    // Находим объявление в данных
                    const listing = REPORT_DATA.duplicates_data?.tableData?.find(function(item) {
                        return item.type === 'listing' && item.id === listingId;
                    });

                    if (listing) {
                        // Загружаем фотографии и описание
                        loadObjectPhotosGallery(listing, objectId);
                        loadObjectDescription(listing, objectId);

                        // Обновляем активную строку
                        updateActiveObjectListingRow(listingId, objectId);
                    }
                });

                // Закрытие модалок по клику на фон
                $('#listingModal, #objectModal').on('click', function(e) {
                    if (e.target === this || $(e.target).hasClass('bg-opacity-75')) {
                        closeModal(this.id);
                    }
                });

                // Закрытие модалок по кнопке
                $('.close-modal-btn').on('click', function() {
                    const modalId = $(this).data('modal-id');
                    closeModal(modalId);
                });

                // Разворачивание списка объявлений объекта
                $(document).on('click', '.expand-object-listings', function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const objectId = $(this).data('object-id');
                    const tr = $(this).closest('tr');
                    const row = $('#duplicatesTable').DataTable().row(tr);

                    if (row.child.isShown()) {
                        // Закрываем
                        row.child.hide();
                        tr.removeClass('shown');
                        $(this).find('svg').css('transform', 'rotate(0deg)');
                    } else {
                        // Открываем
                        const childContent = renderObjectListings(objectId);
                        row.child(childContent).show();
                        tr.addClass('shown');
                        $(this).find('svg').css('transform', 'rotate(180deg)');
                    }
                });
            });

        </script>`;
    }

    /**
     * Безопасная сериализация JSON
     */
    jsonSafeReplacer(key, value) {
        if (typeof value === 'function' || typeof value === 'undefined') {
            return null;
        }
        if (value && typeof value === 'object' && value.nodeType) {
            return null;
        }
        return value;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HTMLExportManager;
}