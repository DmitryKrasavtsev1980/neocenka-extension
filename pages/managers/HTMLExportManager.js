/**
 * Менеджер экспорта отчётов в HTML формат
 * Создаёт автономные HTML-файлы с точным соответствием интерфейсу area.html
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
                console.log('🏗️ HTMLExportManager: Инициализирован');
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
     * Отладочное сообщение
     */
    async debugLog(message, ...args) {
        if (this.debugEnabled) {
            console.log(`🏗️ HTMLExportManager: ${message}`, ...args);
        }
    }

    /**
     * Основной метод генерации HTML-отчёта
     */
    async generateHTMLReport(exportData) {
        try {
            await this.debugLog('Начинаем генерацию HTML-отчёта');

            const { report, area, addresses, segments, real_estate_objects, listings } = exportData;
            
            const reportTitle = report.name || 'Отчёт Neocenka';
            const reportDate = new Date().toLocaleDateString('ru-RU');

            // Генерируем полную HTML-структуру в правильном порядке
            const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportTitle}</title>
    ${this.generateEmbeddedStyles()}
    ${this.generateExternalLibraries()}
</head>
<body class="bg-gray-50">
    ${this.generatePanelControls()}
    ${this.generateReportHeader(reportTitle, reportDate, area)}
    ${this.generateMapSection(area, real_estate_objects)}
    ${this.generateStatisticsSection()}
    ${this.generateFiltersSummary(report.filters)}
    ${this.generateAnalyticsCharts(report.charts_data)}
    ${this.generateComparativeAnalysis(report.comparative_analysis)}
    ${this.generateDuplicatesTable(real_estate_objects, listings)}
    ${this.generateModals()}
    ${this.generateReportFooter()}
    ${this.generateEmbeddedScripts(exportData)}
</body>
</html>`;

            await this.debugLog('HTML-отчёт успешно сгенерирован');
            return htmlContent;

        } catch (error) {
            console.error('❌ Ошибка генерации HTML-отчёта:', error);
            throw error;
        }
    }

    /**
     * Встроенные CSS стили (точная копия из area.html + Tailwind)
     */
    generateEmbeddedStyles() {
        return `
<style>
/* Кастомные стили для отчёта (Tailwind подключается через CDN) */

/* Специфичные стили для отчёта */
.report-section {
    background: white;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border: 1px solid #e5e7eb;
}

.section-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    background-color: #f8fafc;
    border-radius: 0.5rem 0.5rem 0 0;
}

.section-header:hover {
    background-color: #f1f5f9;
}

.section-title {
    font-size: 1.125rem;
    font-weight: 500;
    color: #111827;
    margin: 0;
}

.section-content {
    padding: 1.5rem;
    transition: all 0.3s ease;
}

.section-content.collapsed {
    display: none;
}

.chevron {
    width: 20px;
    height: 20px;
    transition: transform 0.3s ease;
    color: #6b7280;
}

.chevron.rotated {
    transform: rotate(180deg);
}

/* Панель управления видимостью */
.panel-controls {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    border: 1px solid #d1d5db;
}

.panel-controls-button {
    padding: 0.75rem;
    border: none;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    cursor: pointer;
    border-radius: 0.5rem;
    color: white;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.panel-controls-button:hover {
    background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.panel-controls-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 0.5rem;
    width: 220px;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    border: 1px solid #e5e7eb;
    display: none;
    padding: 0.5rem;
}

.panel-controls-dropdown.show {
    display: block;
}

.panel-control-item {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
    cursor: pointer;
    border-radius: 0.25rem;
    white-space: nowrap;
}

.panel-control-item:hover {
    background-color: #f3f4f6;
}

.panel-control-item input {
    margin-right: 0.75rem;
}

.panel-control-item svg {
    margin-right: 0.75rem;
    width: 1.25rem;
    height: 1.25rem;
    color: #9ca3af;
}

/* Стили для карты */
.map-container {
    height: 400px;
    width: 100%;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid #e5e7eb;
}

/* Стили для маркеров карты (из оригинального проекта) */
.address-marker, .object-marker {
    border: none !important;
    background: transparent !important;
}

/* Стили для кластеров */
.listing-cluster-icon {
    background: transparent !important;
    border: none !important;
}

.listing-cluster {
    background: #3b82f6;
    border: 2px solid white;
    border-radius: 50%;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.listing-cluster.small {
    width: 30px;
    height: 30px;
    font-size: 11px;
}

.listing-cluster.medium {
    width: 40px;
    height: 40px;
    font-size: 13px;
    background: #10b981;
}

.listing-cluster.large {
    width: 50px;
    height: 50px;
    font-size: 14px;
    background: #f59e0b;
}

/* Кнопки фильтров отображения маркеров (по образцу оригинала) */
.report-map-filter-btn {
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
    border-radius: 0.375rem;
    color: #374151;
    background-color: white;
    cursor: pointer;
    transition: all 0.2s ease;
}

.report-map-filter-btn:hover {
    background-color: #f9fafb;
}

.report-map-filter-btn:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 2px #6366f1, 0 0 0 4px rgba(99, 102, 241, 0.1);
}

.report-map-filter-btn.active {
    background-color: #4f46e5;
    border-color: #4f46e5;
    color: white;
}

.report-map-filter-btn.active:hover {
    background-color: #4338ca;
    border-color: #4338ca;
}

/* Стили для графиков */
.chart-container {
    background: white;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 1rem;
}

/* Стили для кнопок режимов графика коридора рынка */
.market-corridor-mode-btn {
    padding: 0.375rem 0.75rem;
    text-sm font-medium;
    border-radius: 0.375rem;
    background-color: transparent;
    color: #6b7280;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
}

.market-corridor-mode-btn:hover {
    background-color: #f3f4f6;
    color: #374151;
}

.market-corridor-mode-btn.active {
    background-color: #4f46e5;
    color: white;
}

.market-corridor-mode-btn.active:hover {
    background-color: #4338ca;
}

/* Скрываем легенду ApexCharts для графика коридора рынка */
#marketCorridorChart .apexcharts-legend,
#marketCorridorChart .apexcharts-legend-text {
    display: none !important;
}

/* Стили для сравнительного анализа */
.comparative-analysis-wrapper {
    min-height: 400px;
}

.comparative-analysis-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.comparative-analysis-container.hidden {
    display: none;
}

/* Стили таблицы объектов для анализа */
#comparativeObjectsTable tbody tr {
    cursor: pointer;
    transition: background-color 0.2s;
}

#comparativeObjectsTable tbody tr:hover {
    background-color: #f3f4f6;
}

#comparativeObjectsTable tbody tr.selected {
    background-color: #dbeafe;
    border-color: #3b82f6;
}

#comparativeObjectsTable tbody tr.evaluated {
    background-color: #dcfce7;
}

#comparativeObjectsTable tbody tr.evaluated.selected {
    background-color: #bbf7d0;
}

/* Статусы объектов */
.object-status {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
}

.object-status.active {
    background-color: #dcfce7;
    color: #166534;
}

.object-status.archive {
    background-color: #fee2e2;
    color: #991b1b;
}

/* Оценки объектов */
.evaluation-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
}

.evaluation-better {
    background-color: #dcfce7;
    color: #166534;
}

.evaluation-worse {
    background-color: #fee2e2;
    color: #991b1b;
}

.evaluation-similar {
    background-color: #fef3c7;
    color: #92400e;
}

/* Стили для таблиц DataTables */
.dataTables_wrapper {
    margin-top: 1rem;
}

.dataTables_length select,
.dataTables_filter input {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.5rem;
}

/* Кликабельные элементы */
.clickable-object-address {
    cursor: pointer;
    color: #3b82f6;
    text-decoration: none;
}
.clickable-object-address:hover {
    color: #1d4ed8;
    text-decoration: underline;
}

.expand-object-listings {
    cursor: pointer;
    color: #6b7280;
}
.expand-object-listings:hover {
    color: #3b82f6;
}

/* Модальные окна */
.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.5);
}

.modal.show {
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-content {
    background-color: white;
    margin: auto;
    padding: 20px;
    border: 1px solid #888;
    border-radius: 8px;
    max-width: 90%;
    max-height: 90%;
    overflow-y: auto;
}

.close {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
}

.close:hover,
.close:focus {
    color: black;
    text-decoration: none;
}

/* Статистические карточки */
.stat-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1rem;
    border-radius: 0.5rem;
    text-align: center;
}

.stat-number {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 0.25rem;
}

.stat-label {
    font-size: 0.875rem;
    opacity: 0.9;
}


/* Адаптивность */
@media (max-width: 768px) {
    .grid-cols-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-2 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
}

@media (max-width: 480px) {
    .grid-cols-4, .grid-cols-3, .grid-cols-2 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
}

/* Печать */
@media print {
    body { background: white; }
    .report-section { box-shadow: none; break-inside: avoid; }
    .modal { display: none !important; }
}
</style>`;
    }

    /**
     * Подключение внешних библиотек
     */
    generateExternalLibraries() {
        return `
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'neocenka-blue': '#667eea',
                        'neocenka-purple': '#764ba2',
                    }
                }
            }
        }
    </script>
    
    <!-- jQuery -->
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    
    <!-- DataTables -->
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css" />
    <script src="https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js"></script>
    
    <!-- ApexCharts для графиков -->
    <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.44.0/dist/apexcharts.min.js"></script>
    
    <!-- Leaflet для карт -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        `;
    }

    /**
     * Генерация панели управления видимостью секций
     */
    generatePanelControls() {
        return `
    <!-- Панель управления видимостью -->
    <div class="panel-controls">
        <button type="button" class="panel-controls-button" id="panelControlsBtn">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
        </button>
        <div class="panel-controls-dropdown" id="panelControlsDropdown">
            <label class="panel-control-item">
                <input type="checkbox" id="mapSectionToggle" checked>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.157 2.175a1.5 1.5 0 0 0-1.147 0l-4.084 1.69A1.5 1.5 0 0 0 2 5.251v10.877a1.5 1.5 0 0 0 2.074 1.386l3.51-1.453 4.26 1.763a1.5 1.5 0 0 0 1.146 0l4.083-1.69A1.5 1.5 0 0 0 18 14.748V3.873a1.5 1.5 0 0 0-2.073-1.386l-3.51 1.452-4.26-1.763ZM7.58 5a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5A.75.75 0 0 1 7.58 5Zm5.59 2.75a.75.75 0 0 0-1.5 0v6.5a.75.75 0 0 0 1.5 0v-6.5Z" clip-rule="evenodd" />
                </svg>
                Карта области
            </label>
            <label class="panel-control-item">
                <input type="checkbox" id="statsSectionToggle" checked>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" />
                </svg>
                Статистика области
            </label>
            <label class="panel-control-item">
                <input type="checkbox" id="filtersSectionToggle" checked>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clip-rule="evenodd" />
                </svg>
                Параметры фильтра
            </label>
            <label class="panel-control-item">
                <input type="checkbox" id="chartsSectionToggle" checked>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" />
                </svg>
                Аналитические графики
            </label>
            <label class="panel-control-item">
                <input type="checkbox" id="analysisSectionToggle" checked>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
                </svg>
                Сравнительный анализ
            </label>
            <label class="panel-control-item">
                <input type="checkbox" id="tableSectionToggle" checked>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.267 2.267 0 0 1 1 14.74l-.01-9.5Zm8.26 9.52v-.625a.75.75 0 0 0-.75-.75H2.75a.75.75 0 0 0-.75.75v.615c0 .414.336.75.75.75h5.75a.75.75 0 0 0 .75-.74Zm1.5.75a.75.75 0 0 1-.75-.75v-.625a.75.75 0 0 1 .75-.75H17a.75.75 0 0 1 .75.75v.635a.75.75 0 0 1-.75.75h-5.5Z" clip-rule="evenodd" />
                </svg>
                Объекты и объявления
            </label>
        </div>
    </div>`;
    }

    /**
     * Генерация заголовка отчёта
     */
    generateReportHeader(reportTitle, reportDate, area) {
        return `
    <div class="bg-white shadow mb-6">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <div class="text-center">
                <h1 class="text-3xl font-bold text-gray-900 mb-2">${reportTitle}</h1>
                <p class="text-lg text-gray-700">
                    Область: <span class="font-semibold">${area?.name || 'Не указана'}</span> | 
                    Дата создания: <span class="font-semibold">${reportDate}</span>
                </p>
                <p class="text-gray-500 mt-2">Создано в Neocenka Extension</p>
            </div>
        </div>
    </div>`;
    }

    /**
     * Генерация сводки по фильтрам с поддержкой сворачивания
     */
    generateFiltersSummary(filters) {
        return `
        <div class="max-w-7xl mx-auto px-4 mb-6" id="filtersSection">
            <div class="report-section">
                <div class="section-header" onclick="toggleSection('filtersContent')">
                    <h2 class="section-title">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="inline w-4 h-4 mr-2 text-gray-500">
                            <path fill-rule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clip-rule="evenodd" />
                        </svg>
                        Фильтры отчёта
                    </h2>
                    <svg class="chevron" id="filtersChevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
                <div class="section-content" id="filtersContent">
                    <!-- Фильтр отчётов -->
                    <div class="bg-gray-50 p-4 rounded-lg space-y-4">
                        <div class="flex items-center justify-between">
                            <h4 class="text-md font-medium text-gray-900">Фильтр отчётов</h4>
                            <div class="flex items-center space-x-2">
                                <button type="button" id="saveReportFilterBtn" class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50" disabled title="Функция недоступна в экспорте">
                                    💾 Сохранить шаблон
                                </button>
                                <button type="button" id="deleteReportFilterBtn" class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50" disabled title="Функция недоступна в экспорте">
                                    🗑️ Удалить шаблон
                                </button>
                            </div>
                        </div>
                        
                        <!-- Управление шаблонами фильтров -->
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <!-- Выбор сохранённого фильтра -->
                            <div>
                                <label for="reportFilterSelect" class="block text-xs font-medium text-gray-700 mb-1">Шаблоны фильтров</label>
                                <select id="reportFilterSelect" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" disabled>
                                    <option value="">${filters?.templateName || 'Текущие настройки отчёта'}</option>
                                </select>
                            </div>
                            
                            <!-- Название фильтра -->
                            <div>
                                <label for="reportFilterName" class="block text-xs font-medium text-gray-700 mb-1">Название фильтра *</label>
                                <input type="text" id="reportFilterName" value="${filters?.templateName || ''}" readonly
                                       class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 placeholder:text-gray-400 focus:outline-none sm:text-sm"
                                       placeholder="Название не задано">
                                <input type="hidden" id="reportFilterId" value="${filters?.templateId || ''}">
                            </div>
                            
                            <!-- Дополнительная информация -->
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-1">Статус фильтра</label>
                                <div class="mt-1 flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100">
                                    <div class="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                    <span class="text-sm text-gray-700">Применён к отчёту</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Основные настройки фильтра -->
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                            <!-- Фильтр по сегменту -->
                            <div>
                                <label for="reportsSegmentFilter" class="block text-xs font-medium text-gray-700 mb-1">Сегмент</label>
                                <select id="reportsSegmentFilter" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 focus:outline-none sm:text-sm" disabled>
                                    <option value="">${filters?.segment || 'Все сегменты'}</option>
                                </select>
                            </div>
                            
                            <!-- Фильтр по подсегменту -->
                            <div>
                                <label for="reportsSubsegmentFilter" class="block text-xs font-medium text-gray-700 mb-1">Подсегмент</label>
                                <select id="reportsSubsegmentFilter" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 focus:outline-none sm:text-sm" disabled>
                                    <option value="">${filters?.subsegment || 'Весь сегмент'}</option>
                                </select>
                            </div>
                            
                            <!-- Период от -->
                            <div>
                                <label for="reportsDateFrom" class="block text-xs font-medium text-gray-700 mb-1">Период от</label>
                                <input type="date" id="reportsDateFrom" value="${filters?.dateFrom || ''}" readonly class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 focus:outline-none sm:text-sm">
                            </div>
                            
                            <!-- Период до -->
                            <div>
                                <label for="reportsDateTo" class="block text-xs font-medium text-gray-700 mb-1">Период до</label>
                                <input type="date" id="reportsDateTo" value="${filters?.dateTo || ''}" readonly class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 focus:outline-none sm:text-sm">
                            </div>
                        </div>
                        
                        <!-- Примечание о статичности -->
                        <div class="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                            <div class="flex">
                                <div class="flex-shrink-0">
                                    <svg class="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                    </svg>
                                </div>
                                <div class="ml-3">
                                    <p class="text-sm text-yellow-700">
                                        <strong>Информация:</strong> Это статичный HTML-отчёт. Фильтры показаны только для информации и не могут быть изменены.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Генерация статистики области с поддержкой сворачивания
     */
    generateStatisticsSection() {
        return `
        <div class="max-w-7xl mx-auto px-4 mb-6" id="statsSection">
            <div class="report-section">
                <div class="section-header" onclick="toggleSection('statsContent')">
                    <h2 class="section-title">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline w-4 h-4 mr-2 text-gray-500">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A.375.375 0 013 20.625v-7.5zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                        Статистика области
                    </h2>
                    <svg class="chevron" id="statsChevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
                <div class="section-content" id="statsContent">
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Основные показатели</h3>
                    
                    <!-- Счетчики статистики -->
                    <div class="grid grid-cols-2 gap-6 md:grid-cols-4">
                        <!-- Площадь области -->
                        <div class="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-blue-600" id="export-segmentsCount">-</div>
                            <div class="text-sm text-blue-700 font-medium">Площадь</div>
                        </div>
                        
                        <!-- Адреса -->
                        <div class="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-green-600" id="export-addressesCount">-</div>
                            <div class="text-sm text-green-700 font-medium">Адресов</div>
                        </div>
                        
                        <!-- Объекты недвижимости -->
                        <div class="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-purple-600" id="export-objectsCount">-</div>
                            <div class="text-sm text-purple-700 font-medium">Объектов</div>
                        </div>
                        
                        <!-- Объявления -->
                        <div class="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-yellow-600" id="export-listingsCount">-</div>
                            <div class="text-sm text-yellow-700 font-medium">Объявлений</div>
                        </div>
                    </div>
                    
                    <!-- Источники данных -->
                    <div class="mt-8">
                        <h4 class="text-base font-medium text-gray-900 mb-4">Источники данных</h4>
                        <div class="flex flex-wrap gap-3">
                            <div class="flex items-center bg-red-50 text-red-700 px-3 py-2 rounded-full text-sm">
                                <div class="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                                <span>Avito</span>
                                <span class="ml-1 font-semibold" id="export-avitoCount">0</span>
                            </div>
                            <div class="flex items-center bg-blue-50 text-blue-700 px-3 py-2 rounded-full text-sm">
                                <div class="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                                <span>Cian</span>
                                <span class="ml-1 font-semibold" id="export-cianCount">0</span>
                            </div>
                            <div class="flex items-center bg-green-50 text-green-700 px-3 py-2 rounded-full text-sm">
                                <div class="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                                <span>Inpars API</span>
                                <span class="ml-1 font-semibold" id="export-inparsCount">0</span>
                            </div>
                        </div>
                    </div>

                    <!-- Информация об области -->
                    <div class="mt-8 pt-8 border-t border-gray-200">
                        <h4 class="text-base font-medium text-gray-900 mb-4">Информация об области</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <div class="text-sm text-gray-500">Название области</div>
                                <div class="font-medium" id="export-areaName">-</div>
                            </div>
                            <div>
                                <div class="text-sm text-gray-500">Дата создания отчёта</div>
                                <div class="font-medium" id="export-reportDate">-</div>
                            </div>
                            <div>
                                <div class="text-sm text-gray-500">Версия расширения</div>
                                <div class="font-medium">Neocenka Extension</div>
                            </div>
                            <div>
                                <div class="text-sm text-gray-500">Статус данных</div>
                                <div class="flex items-center">
                                    <div class="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                    <span class="text-green-700 text-sm font-medium">Актуальные</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Генерация аналитических графиков с поддержкой сворачивания
     */
    generateAnalyticsCharts(chartsData) {
        return `
        <div class="max-w-7xl mx-auto px-4 mb-6" id="chartsSection">
            <div class="report-section">
                <div class="section-header" onclick="toggleSection('chartsContent')">
                    <h2 class="section-title">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="inline w-4 h-4 mr-2 text-gray-500">
                            <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" />
                        </svg>
                        Аналитические графики
                    </h2>
                    <svg class="chevron" id="chartsChevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
                <div class="section-content" id="chartsContent">
                    <!-- Описание графиков -->
                    <div class="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-blue-700">
                                    <strong>Аналитические графики</strong> показывают динамику рынка недвижимости в выбранном сегменте.
                                    Данные обновляются автоматически на основе собранных объявлений.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Первая строка графиков -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <!-- График ликвидности -->
                        <div class="chart-container">
                            <div class="flex items-center justify-between mb-4">
                                <h4 class="text-lg font-medium text-gray-900">Ликвидность сегмента</h4>
                                <div class="flex items-center text-sm text-gray-500">
                                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    Новые / Ушедшие с рынка
                                </div>
                            </div>
                            <div id="liquidityChart" class="h-64 relative">
                                <div class="absolute inset-0 flex items-center justify-center text-gray-500" id="liquidityLoading">
                                    <div class="text-center">
                                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                                        <p class="text-sm">Загрузка графика...</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- График изменения цен -->
                        <div class="chart-container">
                            <div class="flex items-center justify-between mb-4">
                                <h4 class="text-lg font-medium text-gray-900">Изменение средней цены</h4>
                                <div class="flex items-center text-sm text-gray-500">
                                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                                    </svg>
                                    Динамика цены за м²
                                </div>
                            </div>
                            <div id="priceChart" class="h-64 relative">
                                <div class="absolute inset-0 flex items-center justify-center text-gray-500" id="priceLoading">
                                    <div class="text-center">
                                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                                        <p class="text-sm">Загрузка графика...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- График коридора рынка недвижимости -->
                    <div class="chart-container">
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="text-lg font-medium text-gray-900">Коридор рынка недвижимости</h4>
                            <div class="flex items-center space-x-4">
                                <!-- Режимы отображения -->
                                <div class="flex items-center bg-gray-100 rounded-md p-1">
                                    <button type="button" id="marketCorridorSalesMode" class="market-corridor-mode-btn active" data-mode="sales">
                                        Продажи
                                    </button>
                                    <button type="button" id="marketCorridorHistoryMode" class="market-corridor-mode-btn" data-mode="history">
                                        История цен
                                    </button>
                                </div>
                                <div class="flex items-center text-sm text-gray-500">
                                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h2a2 2 0 01-2-2z"></path>
                                    </svg>
                                    Цена за м² / Время
                                </div>
                            </div>
                        </div>
                        <div class="mb-3">
                            <p id="marketCorridorDescription" class="text-sm text-gray-600">
                                График отображает точки последних цен в объектах недвижимости. 
                                Архивные объекты показаны красным цветом на дату ухода с рынка, активные - синим на текущую дату.
                            </p>
                        </div>
                        <div id="marketCorridorChart" class="relative" style="height: 400px;">
                            <div class="absolute inset-0 flex items-center justify-center text-gray-500" id="marketCorridorLoading">
                                <div class="text-center">
                                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                                    <p class="text-sm">Загрузка графика...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Генерация сравнительного анализа с поддержкой сворачивания
     */
    generateComparativeAnalysis(analysisData) {
        return `
        <div class="max-w-7xl mx-auto px-4 mb-6" id="analysisSection">
            <div class="report-section">
                <div class="section-header" onclick="toggleSection('analysisContent')">
                    <h2 class="section-title">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="inline w-4 h-4 mr-2 text-gray-500">
                            <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
                        </svg>
                        Сравнительный анализ
                    </h2>
                    <svg class="chevron" id="analysisChevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
                <div class="section-content" id="analysisContent">
                    <!-- Описание анализа -->
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex-1">
                            <h4 class="text-lg font-medium text-gray-900 mb-2">Сравнительный анализ</h4>
                            <p class="text-sm text-gray-600">
                                Инструмент для определения оптимальной стартовой цены путем сравнения абстрактного объекта с конкурентами на рынке.
                            </p>
                        </div>
                    </div>
                    
                    <div id="comparativeAnalysisContainer" class="comparative-analysis-wrapper min-h-96">
                        <!-- Плейсхолдер (показывается изначально или когда нет анализа) -->
                        <div class="flex items-center justify-center h-64 text-gray-500" id="comparativeAnalysisPlaceholder">
                            <div class="text-center">
                                <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                </svg>
                                <p class="text-lg font-medium text-gray-700 mb-2">Сравнительный анализ</p>
                                <p class="text-sm text-gray-500 mb-4">
                                    ${analysisData?.hasResults ? 'Отображены сохранённые результаты анализа.' : 'Анализ не проводился.'}
                                </p>
                                <button id="startComparativeAnalysisBtn" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                                    <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                    </svg>
                                    ${analysisData?.hasResults ? 'Провести новый анализ' : 'Начать анализ'}
                                </button>
                            </div>
                        </div>
                        
                        <!-- Основной интерфейс сравнительного анализа -->
                        <div id="comparativeAnalysisContent" class="comparative-analysis-container flex-col gap-6 ${analysisData?.hasResults ? '' : 'hidden'}">
                            <!-- Панель управления анализом (на всю ширину) -->
                            <div class="management-panel">
                                <!-- Заголовок и управление анализом -->
                                <div class="analysis-header mb-4">
                                    <div class="flex justify-between items-center">
                                        <h5 class="text-base font-medium text-gray-900">Управление анализом</h5>
                                        <div class="flex items-center space-x-2">
                                            <button id="resetComparativeAnalysisBtn" class="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                                                <svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                                </svg>
                                                Сбросить
                                            </button>
                                            <button id="saveComparativeAnalysisBtn" class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                                                <svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
                                                </svg>
                                                Сохранить анализ
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Фильтры и управление -->
                                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                    <!-- Фильтр по статусу -->
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1">Статус объектов</label>
                                        <select id="comparativeStatusFilter" class="w-full text-sm border-gray-300 rounded-md">
                                            <option value="all">Все статусы</option>
                                            <option value="active">Только активные</option>
                                            <option value="archive">Только архивные</option>
                                        </select>
                                    </div>

                                    <!-- Сортировка -->
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1">Сортировка</label>
                                        <select id="comparativeSortOrder" class="w-full text-sm border-gray-300 rounded-md">
                                            <option value="price_asc">Цена по возрастанию</option>
                                            <option value="price_desc">Цена по убыванию</option>
                                            <option value="date_desc">Дата по убыванию</option>
                                            <option value="area_asc">Площадь по возрастанию</option>
                                        </select>
                                    </div>

                                    <!-- Режим отображения -->
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1">Режим отображения</label>
                                        <select id="comparativeDisplayMode" class="w-full text-sm border-gray-300 rounded-md">
                                            <option value="scatter">Точечная диаграмма</option>
                                            <option value="line">Линейный график</option>
                                        </select>
                                    </div>

                                    <!-- Счетчик объектов -->
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1">Статистика</label>
                                        <div class="flex items-center justify-between text-sm bg-gray-50 border border-gray-300 rounded-md px-3 py-2">
                                            <span class="text-gray-600">Объектов:</span>
                                            <span class="font-medium text-gray-900" id="comparativeObjectsCount">0</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Основной контент анализа -->
                            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <!-- График сравнения (левая часть, 2/3 ширины) -->
                                <div class="lg:col-span-2">
                                    <div class="chart-container">
                                        <div class="flex justify-between items-center mb-4">
                                            <h4 class="text-lg font-medium text-gray-900">График сравнительного анализа</h4>
                                            <div class="text-xs text-gray-500" id="comparativeChartInfo">
                                                Выберите объект для анализа
                                            </div>
                                        </div>
                                        <div id="comparativeChart" class="relative" style="height: 500px;">
                                            <div class="absolute inset-0 flex items-center justify-center text-gray-500" id="comparativeChartLoading">
                                                <div class="text-center">
                                                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                                                    <p class="text-sm">Загрузка графика...</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Панель результатов (правая часть, 1/3 ширины) -->
                                <div class="space-y-6">
                                    <!-- Анализируемый объект -->
                                    <div class="bg-white border border-gray-200 rounded-lg p-4">
                                        <h5 class="font-medium text-gray-900 mb-3">Анализируемый объект</h5>
                                        <div id="selectedObjectInfo" class="text-sm text-gray-500">
                                            Выберите объект в таблице ниже
                                        </div>
                                    </div>

                                    <!-- Коридоры цен -->
                                    <div class="bg-white border border-gray-200 rounded-lg p-4">
                                        <h5 class="font-medium text-gray-900 mb-3">Коридоры цен (₽/м²)</h5>
                                        <div id="priceCorridors" class="space-y-3">
                                            <div class="flex justify-between items-center">
                                                <div class="flex items-center">
                                                    <div class="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                                                    <span class="text-sm text-gray-700">Активные</span>
                                                </div>
                                                <span class="text-sm text-gray-500" id="activeCorridor">-</span>
                                            </div>
                                            <div class="flex justify-between items-center">
                                                <div class="flex items-center">
                                                    <div class="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                                                    <span class="text-sm text-gray-700">Архивные</span>
                                                </div>
                                                <span class="text-sm text-gray-500" id="archiveCorridor">-</span>
                                            </div>
                                            <div class="flex justify-between items-center pt-2 border-t border-gray-200">
                                                <div class="flex items-center">
                                                    <div class="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                                                    <span class="text-sm font-semibold text-gray-900">Оптимальный</span>
                                                </div>
                                                <span class="text-sm font-semibold text-blue-600" id="optimalCorridor">-</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Оценки объектов -->
                                    <div class="bg-white border border-gray-200 rounded-lg p-4">
                                        <h5 class="font-medium text-gray-900 mb-3">Оценки объектов</h5>
                                        <div id="objectEvaluations" class="space-y-2 text-sm">
                                            <div class="text-gray-500">Нет оценок</div>
                                        </div>
                                    </div>

                                    <!-- Рекомендуемая цена -->
                                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <h5 class="font-medium text-blue-900 mb-2">Рекомендуемая цена</h5>
                                        <div id="recommendedPrice" class="text-lg font-bold text-blue-600">-</div>
                                        <div class="text-sm text-blue-700 mt-1" id="recommendedPriceNote">
                                            Выберите объект для расчёта
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Таблица объектов для анализа -->
                            <div class="mt-6">
                                <div class="flex justify-between items-center mb-4">
                                    <h5 class="text-base font-medium text-gray-900">Объекты для анализа</h5>
                                    <div class="text-sm text-gray-500">
                                        Кликните по объекту для выбора, двойной клик для оценки
                                    </div>
                                </div>
                                <div class="overflow-hidden border border-gray-200 rounded-lg">
                                    <table id="comparativeObjectsTable" class="min-w-full divide-y divide-gray-200">
                                        <thead class="bg-gray-50">
                                            <tr>
                                                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Адрес</th>
                                                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                                                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Площадь</th>
                                                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена/м²</th>
                                                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                                                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Оценка</th>
                                            </tr>
                                        </thead>
                                        <tbody class="bg-white divide-y divide-gray-200" id="comparativeObjectsTableBody">
                                            <!-- Таблица будет заполнена JavaScript -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Генерация секции карты с поддержкой сворачивания
     */
    generateMapSection(area, objects) {
        return `
        <div class="max-w-7xl mx-auto px-4 mb-6" id="mapSection">
            <div class="report-section">
                <div class="section-header" onclick="toggleSection('mapContent')">
                    <h2 class="section-title">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="inline w-4 h-4 mr-2 text-gray-500">
                            <path fill-rule="evenodd" d="M8.157 2.175a1.5 1.5 0 0 0-1.147 0l-4.084 1.69A1.5 1.5 0 0 0 2 5.251v10.877a1.5 1.5 0 0 0 2.074 1.386l3.51-1.453 4.26 1.763a1.5 1.5 0 0 0 1.146 0l4.083-1.69A1.5 1.5 0 0 0 18 14.748V3.873a1.5 1.5 0 0 0-2.073-1.386l-3.51 1.452-4.26-1.763ZM7.58 5a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5A.75.75 0 0 1 7.58 5Zm5.59 2.75a.75.75 0 0 0-1.5 0v6.5a.75.75 0 0 0 1.5 0v-6.5Z" clip-rule="evenodd" />
                        </svg>
                        Карта области
                    </h2>
                    <svg class="chevron" id="mapChevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
                <div class="section-content" id="mapContent">
                    <!-- Фильтры отображения маркеров (по образцу карты сегмента) -->
                    <div class="bg-white rounded-lg shadow p-4 mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Отображение маркеров</label>
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" id="reportFilterByYear" data-filter="year" class="report-map-filter-btn active">
                                Год
                            </button>
                            <button type="button" id="reportFilterBySeries" data-filter="series" class="report-map-filter-btn">
                                Серия
                            </button>
                            <button type="button" id="reportFilterByFloors" data-filter="floors" class="report-map-filter-btn">
                                Этажность
                            </button>
                            <button type="button" id="reportFilterByObjects" data-filter="objects" class="report-map-filter-btn">
                                Объектов
                            </button>
                            <button type="button" id="reportFilterByListings" data-filter="listings" class="report-map-filter-btn">
                                Объявлений
                            </button>
                            <button type="button" id="reportFilterByHouseClass" data-filter="house_class" class="report-map-filter-btn">
                                Класс дома
                            </button>
                            <button type="button" id="reportFilterByHouseProblems" data-filter="house_problems" class="report-map-filter-btn">
                                Проблемы дома
                            </button>
                            <button type="button" id="reportFilterByCommercialSpaces" data-filter="commercial_spaces" class="report-map-filter-btn">
                                Коммерческие помещения
                            </button>
                            <button type="button" id="reportFilterByComment" data-filter="comment" class="report-map-filter-btn">
                                Комментарий
                            </button>
                        </div>
                    </div>

                    <!-- Заголовок карты -->
                    <div class="bg-white rounded-lg shadow p-4 mb-4">
                        <h4 class="text-sm font-medium text-gray-700">Карта с адресами</h4>
                    </div>

                    <!-- Контейнер карты -->
                    <div class="map-container bg-gray-100 rounded-lg overflow-hidden" id="reportMap" style="height: 500px; position: relative;">
                        <!-- Карта Leaflet будет инициализирована здесь -->
                        <div class="absolute inset-0 flex items-center justify-center text-gray-500">
                            <div class="text-center">
                                <svg class="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                <p class="text-sm">Инициализация карты...</p>
                            </div>
                        </div>
                    </div>

                    <!-- Статистика адресов -->
                    <div class="mt-4 bg-white rounded-lg shadow p-4">
                        <h4 class="font-medium text-gray-900 mb-2">Статистика адресов</h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div class="text-center">
                                <div class="font-semibold text-gray-900" id="mapTotalAddresses">0</div>
                                <div class="text-gray-600">Всего адресов</div>
                            </div>
                            <div class="text-center">
                                <div class="font-semibold text-gray-900" id="mapWithCoords">0</div>
                                <div class="text-gray-600">С координатами</div>
                            </div>
                            <div class="text-center">
                                <div class="font-semibold text-gray-900" id="mapWithYear">0</div>
                                <div class="text-gray-600">С годом постройки</div>
                            </div>
                            <div class="text-center">
                                <div class="font-semibold text-gray-900" id="mapWithFloors">0</div>
                                <div class="text-gray-600">С этажностью</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Генерация таблицы дублей с поддержкой сворачивания
     */
    generateDuplicatesTable(objects, listings) {
        return `
        <div class="max-w-7xl mx-auto px-4 mb-6" id="tableSection">
            <div class="report-section">
                <div class="section-header" onclick="toggleSection('tableContent')">
                    <h2 class="section-title">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="inline w-4 h-4 mr-2 text-gray-500">
                            <path fill-rule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.267 2.267 0 0 1 1 14.74l-.01-9.5Zm8.26 9.52v-.625a.75.75 0 0 0-.75-.75H2.75a.75.75 0 0 0-.75.75v.615c0 .414.336.75.75.75h5.75a.75.75 0 0 0 .75-.74Zm1.5.75a.75.75 0 0 1-.75-.75v-.625a.75.75 0 0 1 .75-.75H17a.75.75 0 0 1 .75.75v.635a.75.75 0 0 1-.75.75h-5.5Z" clip-rule="evenodd" />
                        </svg>
                        Объекты и объявления недвижимости
                    </h2>
                    <svg class="chevron" id="tableChevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
                <div class="section-content" id="tableContent">
                    <div class="overflow-x-auto">
                        <table id="duplicatesTable" class="min-w-full divide-y divide-gray-200">
                            <!-- DataTables будет автоматически создавать заголовки -->
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Генерация модальных окон (точная копия из area.html)
     */
    generateModals() {
        return `
    <!-- Модальное окно просмотра объявления -->
    <div id="listingModal" class="modal" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="modal-content">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-gray-900" id="modal-title">
                    Детали объявления
                </h3>
                <span class="close" id="closeModalBtn">&times;</span>
            </div>
            <div id="modalContent" class="max-h-[70vh] overflow-y-auto">
                <!-- Контент будет загружен динамически -->
            </div>
        </div>
    </div>

    <!-- Модальное окно просмотра объекта недвижимости -->
    <div id="objectModal" class="modal" aria-labelledby="object-modal-title" role="dialog" aria-modal="true">
        <div class="modal-content">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-gray-900" id="object-modal-title">
                    Детали объекта недвижимости
                </h3>
                <span class="close" id="closeObjectModalBtn">&times;</span>
            </div>
            <div id="objectModalContent" class="max-h-[70vh] overflow-y-auto">
                <!-- Контент будет загружен динамически -->
            </div>
        </div>
    </div>`;
    }

    /**
     * Генерация подвала отчёта
     */
    generateReportFooter() {
        const currentDate = new Date().toLocaleString('ru-RU');
        return `
    <div class="bg-gray-100 mt-12">
        <div class="max-w-7xl mx-auto px-4 py-8">
            <div class="text-center text-gray-600">
                <p class="mb-2">Отчёт создан ${currentDate} с помощью Neocenka Extension</p>
                <p>© ${new Date().getFullYear()} Neocenka. Все права защищены.</p>
            </div>
        </div>
    </div>`;
    }

    /**
     * Встроенные скрипты для инициализации с поддержкой сворачиваемых панелей
     */
    generateEmbeddedScripts(exportData) {
        return `<script>
// Данные отчёта встроены в JavaScript
const reportData = ${JSON.stringify(exportData, (key, value) => {
    // Убираем функции и undefined значения
    if (typeof value === 'function' || typeof value === 'undefined') {
        return null;
    }
    // Убираем DOM элементы
    if (value && typeof value === 'object' && value.nodeType) {
        return null;
    }
    return value;
}, 2)};

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Инициализация HTML-отчёта');
    
    // Инициализация компонентов
    initPanelControls();
    initStatistics();
    initDataTables();
    initCharts();
    initComparativeAnalysis();
    initMap();
    initModals();
    
    console.log('✅ HTML-отчёт готов');
});

// Управление панелями
function initPanelControls() {
    console.log('🎛️ Инициализация управления панелями...');
    
    // Панель управления видимостью
    const panelControlsBtn = document.getElementById('panelControlsBtn');
    const panelControlsDropdown = document.getElementById('panelControlsDropdown');
    
    if (panelControlsBtn && panelControlsDropdown) {
        panelControlsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            panelControlsDropdown.classList.toggle('show');
        });
        
        // Закрытие при клике вне панели
        document.addEventListener('click', function(e) {
            if (!panelControlsBtn.contains(e.target) && !panelControlsDropdown.contains(e.target)) {
                panelControlsDropdown.classList.remove('show');
            }
        });
    }
    
    // Обработчики чекбоксов видимости
    const toggles = {
        'mapSectionToggle': 'mapSection',
        'statsSectionToggle': 'statsSection', 
        'filtersSectionToggle': 'filtersSection',
        'chartsSectionToggle': 'chartsSection',
        'analysisSectionToggle': 'analysisSection',
        'tableSectionToggle': 'tableSection'
    };
    
    Object.entries(toggles).forEach(([toggleId, sectionId]) => {
        const toggle = document.getElementById(toggleId);
        if (toggle) {
            toggle.addEventListener('change', function() {
                toggleSectionVisibility(sectionId, this.checked);
            });
        }
    });
}

// Сворачивание/разворачивание содержимого секции
function toggleSection(contentId) {
    const content = document.getElementById(contentId);
    const chevronId = contentId.replace('Content', 'Chevron');
    const chevron = document.getElementById(chevronId);
    
    if (content && chevron) {
        content.classList.toggle('collapsed');
        chevron.classList.toggle('rotated');
    }
}

// Показать/скрыть секцию целиком
function toggleSectionVisibility(sectionId, visible) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.style.display = visible ? 'block' : 'none';
    }
}

// Инициализация статистики
function initStatistics() {
    console.log('📈 Инициализация статистики...');
    
    try {
        const { area, addresses, segments, real_estate_objects, listings } = reportData;
        
        // Заполняем основные счетчики
        updateElementText('export-addressesCount', addresses?.length || 0);
        updateElementText('export-objectsCount', real_estate_objects?.length || 0);  
        updateElementText('export-listingsCount', listings?.length || 0);
        
        // Вычисляем площадь области
        let areaSize = segments?.length || 0;
        if (area && area.polygon && area.polygon.length >= 3) {
            try {
                // Приблизительный расчет площади (простая формула)
                const areaInSqKm = calculatePolygonAreaApprox(area.polygon);
                areaSize = \`≈ \${areaInSqKm.toFixed(3)} км²\`;
            } catch (error) {
                console.warn('Ошибка расчета площади:', error);
                areaSize = \`\${segments?.length || 0} сегментов\`;
            }
        }
        updateElementText('export-segmentsCount', areaSize);
        
        // Подсчитываем источники данных
        let avitoCount = 0, cianCount = 0, inparsCount = 0;
        
        if (listings && Array.isArray(listings)) {
            listings.forEach(listing => {
                if (listing.source) {
                    if (listing.source.toLowerCase().includes('avito')) {
                        avitoCount++;
                    } else if (listing.source.toLowerCase().includes('cian')) {
                        cianCount++;
                    } else if (listing.source.toLowerCase().includes('inpars')) {
                        inparsCount++;
                    }
                }
            });
        }
        
        updateElementText('export-avitoCount', avitoCount);
        updateElementText('export-cianCount', cianCount);
        updateElementText('export-inparsCount', inparsCount);
        
        // Заполняем информацию об области
        updateElementText('export-areaName', area?.name || 'Не указано');
        updateElementText('export-reportDate', new Date().toLocaleDateString('ru-RU'));
        
        console.log('✅ Статистика заполнена');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации статистики:', error);
    }
}

// Вспомогательная функция обновления текста элемента
function updateElementText(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        if (typeof value === 'string') {
            element.textContent = value;
        } else {
            element.textContent = (value || 0).toLocaleString();
        }
    }
}

// Приблизительный расчет площади полигона (для демонстрации)
function calculatePolygonAreaApprox(coordinates) {
    if (!coordinates || coordinates.length < 3) return 0;
    
    // Простая формула площади многоугольника (не учитывает сферичность Земли)
    let area = 0;
    const len = coordinates.length;
    
    for (let i = 0; i < len; i++) {
        const j = (i + 1) % len;
        area += coordinates[i][0] * coordinates[j][1];
        area -= coordinates[j][0] * coordinates[i][1];
    }
    
    area = Math.abs(area) / 2;
    
    // Приблизительный перевод в км² (очень грубый)
    // 1 градус ≈ 111 км
    const areaInSqKm = area * Math.pow(111, 2);
    
    return areaInSqKm;
}

// Заготовки методов инициализации
function initDataTables() {
    console.log('📊 Инициализация DataTables...');
    
    try {
        const tableElement = document.getElementById('duplicatesTable');
        if (!tableElement) {
            console.warn('Таблица дублей не найдена');
            return;
        }

        // Получаем данные об объектах недвижимости
        const { real_estate_objects, listings } = reportData;
        
        if (!real_estate_objects || real_estate_objects.length === 0) {
            tableElement.innerHTML = '<tbody><tr><td class="text-center text-gray-500 py-8" colspan="100%">Нет данных для отображения</td></tr></tbody>';
            return;
        }

        // Подготавливаем данные для таблицы
        const tableData = real_estate_objects.map(obj => {
            const objectListings = listings?.filter(l => l.real_estate_object_id === obj.id) || [];
            
            return {
                id: obj.id,
                address: obj.address || 'Не указано',
                area: obj.area || '-',
                rooms: obj.rooms || '-',
                house_type: obj.house_type || '-', 
                house_series: obj.house_series || '-',
                status: obj.status || 'unknown',
                listings_count: objectListings.length,
                price_range: objectListings.length > 0 ? 
                    Math.min(...objectListings.map(l => l.price).filter(p => p > 0)) + ' - ' + 
                    Math.max(...objectListings.map(l => l.price).filter(p => p > 0)) + ' ₽' : 
                    '-',
                last_update: obj.updated_at ? new Date(obj.updated_at).toLocaleDateString('ru-RU') : '-'
            };
        });

        // Инициализируем DataTable
        if ($.fn.DataTable.isDataTable(tableElement)) {
            $(tableElement).DataTable().destroy();
        }

        const dataTable = $(tableElement).DataTable({
            data: tableData,
            columns: [
                { 
                    title: 'Адрес', 
                    data: 'address',
                    width: '25%',
                    render: function(data, type, row) {
                        return '<div class="text-sm font-medium text-gray-900">' + data + '</div>';
                    }
                },
                { 
                    title: 'Площадь', 
                    data: 'area',
                    width: '10%',
                    className: 'text-center',
                    render: function(data) {
                        return data !== '-' ? data + ' м²' : '-';
                    }
                },
                { 
                    title: 'Комнаты', 
                    data: 'rooms',
                    width: '10%',
                    className: 'text-center'
                },
                { 
                    title: 'Тип дома', 
                    data: 'house_type',
                    width: '15%',
                    className: 'text-center'
                },
                { 
                    title: 'Серия', 
                    data: 'house_series',
                    width: '10%',
                    className: 'text-center'
                },
                { 
                    title: 'Объявления', 
                    data: 'listings_count',
                    width: '10%',
                    className: 'text-center',
                    render: function(data, type, row) {
                        if (data === 0) {
                            return '<span class="text-gray-400">0</span>';
                        }
                        return '<button class="text-blue-600 hover:text-blue-800 font-medium" onclick="openListingsModal(' + row.id + ')">' + data + '</button>';
                    }
                },
                { 
                    title: 'Цены', 
                    data: 'price_range',
                    width: '15%',
                    className: 'text-center text-sm'
                },
                { 
                    title: 'Обновлено', 
                    data: 'last_update',
                    width: '10%',
                    className: 'text-center text-xs text-gray-500'
                }
            ],
            language: {
                "decimal": "",
                "emptyTable": "Нет данных в таблице",
                "info": "Показано _START_ до _END_ из _TOTAL_ записей",
                "infoEmpty": "Показано 0 до 0 из 0 записей",
                "infoFiltered": "(отфильтровано из _MAX_ записей)",
                "infoPostFix": "",
                "thousands": " ",
                "lengthMenu": "Показать _MENU_ записей",
                "loadingRecords": "Загрузка...",
                "processing": "Обработка...",
                "search": "Поиск:",
                "zeroRecords": "Записи не найдены",
                "paginate": {
                    "first": "Первая",
                    "last": "Последняя",
                    "next": "Следующая",
                    "previous": "Предыдущая"
                }
            },
            pageLength: 25,
            responsive: true,
            order: [[7, 'desc']], // Сортировка по дате обновления
            dom: '<"flex justify-between items-center mb-4"<"flex items-center space-x-2"f><"flex items-center space-x-2"l>>rtip',
            drawCallback: function() {
                // Стилизуем элементы поиска и пагинации
                setTimeout(() => {
                    document.querySelectorAll('.dataTables_filter input').forEach(input => {
                        input.className = 'px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
                    });
                    document.querySelectorAll('.dataTables_length select').forEach(select => {
                        select.className = 'px-2 py-1 border border-gray-300 rounded text-sm';
                    });
                }, 10);
            }
        });

        console.log('✅ Таблица дублей инициализирована:', tableData.length, 'объектов');

    } catch (error) {
        console.error('❌ Ошибка инициализации DataTables:', error);
    }
}

function initCharts() {
    console.log('📈 Инициализация графиков...');
    
    try {
        // Инициализируем каждый график
        initLiquidityChart();
        initPriceChart();
        initMarketCorridorChart();
        
        console.log('✅ Графики инициализированы');
    } catch (error) {
        console.error('❌ Ошибка инициализации графиков:', error);
    }
}

// График ликвидности
function initLiquidityChart() {
    const chartElement = document.getElementById('liquidityChart');
    const loadingElement = document.getElementById('liquidityLoading');
    
    if (!chartElement) return;
    
    try {
        // Заглушка для данных - в реальной реализации берутся из reportData
        const hasData = reportData?.charts_data?.liquidity;
        
        if (!hasData) {
            if (loadingElement) loadingElement.style.display = 'none';
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><p class="text-sm">Нет данных для отображения</p></div>';
            return;
        }
        
        const options = {
            chart: {
                height: 256,
                type: 'line',
                locales: [{
                    name: 'ru',
                    options: {
                        months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
                        shortMonths: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                    }
                }],
                defaultLocale: 'ru',
                toolbar: { show: false }
            },
            series: [
                {
                    name: 'Новые',
                    type: 'column',
                    data: reportData?.charts_data?.liquidity?.new || [10, 15, 8, 12, 18, 14]
                },
                {
                    name: 'Ушедшие с рынка',
                    type: 'column',
                    data: reportData?.charts_data?.liquidity?.close || [5, 8, 12, 9, 6, 11]
                }
            ],
            colors: ['#10B981', '#EF4444'],
            xaxis: {
                categories: reportData?.charts_data?.liquidity?.dates || ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
                labels: { style: { fontSize: '12px' } }
            },
            yaxis: {
                title: { text: 'Количество объявлений' },
                labels: { style: { fontSize: '12px' } }
            },
            dataLabels: { enabled: false },
            legend: { position: 'top' }
        };
        
        if (loadingElement) loadingElement.style.display = 'none';
        const chart = new ApexCharts(chartElement, options);
        chart.render();
        
    } catch (error) {
        console.error('❌ Ошибка создания графика ликвидности:', error);
        if (loadingElement) loadingElement.style.display = 'none';
        chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500"><p class="text-sm">Ошибка загрузки графика</p></div>';
    }
}

// График изменения цен
function initPriceChart() {
    const chartElement = document.getElementById('priceChart');
    const loadingElement = document.getElementById('priceLoading');
    
    if (!chartElement) return;
    
    try {
        const hasData = reportData?.charts_data?.price;
        
        if (!hasData) {
            if (loadingElement) loadingElement.style.display = 'none';
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><p class="text-sm">Нет данных для отображения</p></div>';
            return;
        }
        
        const options = {
            chart: {
                height: 256,
                type: 'line',
                locales: [{
                    name: 'ru',
                    options: {
                        months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
                        shortMonths: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                    }
                }],
                defaultLocale: 'ru',
                toolbar: { show: false }
            },
            series: [{
                name: 'Средняя цена за м²',
                data: reportData?.charts_data?.price?.data || [120000, 125000, 128000, 132000, 135000, 138000]
            }],
            colors: ['#3B82F6'],
            xaxis: {
                categories: reportData?.charts_data?.price?.dates || ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
                labels: { style: { fontSize: '12px' } }
            },
            yaxis: {
                title: { text: 'Цена за м² (₽)' },
                labels: { 
                    style: { fontSize: '12px' },
                    formatter: function(value) {
                        return new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
                    }
                }
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 3 },
            markers: { size: 5 }
        };
        
        if (loadingElement) loadingElement.style.display = 'none';
        const chart = new ApexCharts(chartElement, options);
        chart.render();
        
    } catch (error) {
        console.error('❌ Ошибка создания графика цен:', error);
        if (loadingElement) loadingElement.style.display = 'none';
        chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500"><p class="text-sm">Ошибка загрузки графика</p></div>';
    }
}

// График коридора рынка недвижимости
function initMarketCorridorChart() {
    const chartElement = document.getElementById('marketCorridorChart');
    const loadingElement = document.getElementById('marketCorridorLoading');
    
    if (!chartElement) return;
    
    try {
        const hasData = reportData?.charts_data?.market_corridor;
        
        if (!hasData) {
            if (loadingElement) loadingElement.style.display = 'none';
            chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><p class="text-sm">Нет данных для отображения</p></div>';
            return;
        }
        
        // Инициализация с режимом "Продажи"
        renderMarketCorridorChart('sales');
        
        // Обработчики для переключения режимов
        const salesModeBtn = document.getElementById('marketCorridorSalesMode');
        const historyModeBtn = document.getElementById('marketCorridorHistoryMode');
        
        if (salesModeBtn && historyModeBtn) {
            salesModeBtn.addEventListener('click', () => {
                switchMarketCorridorMode('sales', salesModeBtn, historyModeBtn);
            });
            
            historyModeBtn.addEventListener('click', () => {
                switchMarketCorridorMode('history', salesModeBtn, historyModeBtn);
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка инициализации графика коридора рынка:', error);
        if (loadingElement) loadingElement.style.display = 'none';
        chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500"><p class="text-sm">Ошибка загрузки графика</p></div>';
    }
}

// Переключение режимов графика коридора рынка
function switchMarketCorridorMode(mode, salesBtn, historyBtn) {
    // Обновляем активные кнопки
    salesBtn.classList.toggle('active', mode === 'sales');
    historyBtn.classList.toggle('active', mode === 'history');
    
    // Обновляем описание
    const descriptionElement = document.getElementById('marketCorridorDescription');
    if (descriptionElement) {
        switch (mode) {
            case 'sales':
                descriptionElement.textContent = 'График отображает точки последних цен в объектах недвижимости. Архивные объекты показаны красным цветом на дату ухода с рынка, активные - синим на текущую дату.';
                break;
            case 'history':
                descriptionElement.textContent = 'График показывает полную историю изменения цен для активных объектов и последние цены архивных объектов (красным цветом). Каждая линия - один объект.';
                break;
        }
    }
    
    // Перерисовываем график
    renderMarketCorridorChart(mode);
}

// Рендеринг графика коридора рынка
function renderMarketCorridorChart(mode) {
    const chartElement = document.getElementById('marketCorridorChart');
    const loadingElement = document.getElementById('marketCorridorLoading');
    
    if (!chartElement) return;
    
    try {
        // Очищаем предыдущий график
        chartElement.innerHTML = '';
        
        const options = {
            chart: {
                height: 400,
                type: mode === 'history' ? 'line' : 'scatter',
                locales: [{
                    name: 'ru',
                    options: {
                        months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
                        shortMonths: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                    }
                }],
                defaultLocale: 'ru',
                toolbar: { show: false }
            },
            series: reportData?.charts_data?.market_corridor?.[mode] || [
                {
                    name: 'Активные объекты',
                    data: [[new Date('2024-01-01').getTime(), 120000], [new Date('2024-02-01').getTime(), 125000], [new Date('2024-03-01').getTime(), 130000]]
                },
                {
                    name: 'Архивные объекты',
                    data: [[new Date('2024-01-15').getTime(), 115000], [new Date('2024-02-15').getTime(), 118000]]
                }
            ],
            colors: ['#3B82F6', '#EF4444'],
            xaxis: {
                type: 'datetime',
                labels: { 
                    style: { fontSize: '12px' },
                    datetimeFormatter: {
                        year: 'yyyy',
                        month: 'MMM yyyy',
                        day: 'dd MMM',
                        hour: 'HH:mm'
                    }
                }
            },
            yaxis: {
                title: { text: 'Цена за м² (₽)' },
                labels: { 
                    style: { fontSize: '12px' },
                    formatter: function(value) {
                        return new Intl.NumberFormat('ru-RU').format(value);
                    }
                }
            },
            dataLabels: { enabled: false },
            legend: { show: false },
            tooltip: {
                x: {
                    format: 'dd MMM yyyy'
                },
                y: {
                    formatter: function(value) {
                        return new Intl.NumberFormat('ru-RU').format(value) + ' ₽/м²';
                    }
                }
            }
        };
        
        if (loadingElement) loadingElement.style.display = 'none';
        const chart = new ApexCharts(chartElement, options);
        chart.render();
        
    } catch (error) {
        console.error('❌ Ошибка рендеринга графика коридора рынка:', error);
        if (loadingElement) loadingElement.style.display = 'none';
        chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500"><p class="text-sm">Ошибка загрузки графика</p></div>';
    }
}

// Инициализация сравнительного анализа
function initComparativeAnalysis() {
    console.log('🔍 Инициализация сравнительного анализа...');
    
    try {
        // Получаем элементы интерфейса
        const startBtn = document.getElementById('startComparativeAnalysisBtn');
        const resetBtn = document.getElementById('resetComparativeAnalysisBtn');
        const saveBtn = document.getElementById('saveComparativeAnalysisBtn');
        const placeholder = document.getElementById('comparativeAnalysisPlaceholder');
        const content = document.getElementById('comparativeAnalysisContent');
        
        // Состояние анализа
        let analysisState = {
            currentObjects: [],
            selectedObjectId: null,
            evaluations: new Map(),
            statusFilter: 'all',
            sortOrder: 'price_asc',
            displayMode: 'scatter',
            corridors: {
                active: { min: null, max: null },
                archive: { min: null, max: null },
                optimal: { min: null, max: null }
            }
        };
        
        // График сравнения
        let comparativeChart = null;
        
        // Обработчик запуска анализа
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                startComparativeAnalysis();
            });
        }
        
        // Обработчик сброса
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                resetComparativeAnalysis();
            });
        }
        
        // Обработчик сохранения
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                saveComparativeAnalysis();
            });
        }
        
        // Обработчики фильтров
        const statusFilter = document.getElementById('comparativeStatusFilter');
        const sortOrder = document.getElementById('comparativeSortOrder');
        const displayMode = document.getElementById('comparativeDisplayMode');
        
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                analysisState.statusFilter = e.target.value;
                updateObjectsList();
                updateChart();
            });
        }
        
        if (sortOrder) {
            sortOrder.addEventListener('change', (e) => {
                analysisState.sortOrder = e.target.value;
                updateObjectsList();
            });
        }
        
        if (displayMode) {
            displayMode.addEventListener('change', (e) => {
                analysisState.displayMode = e.target.value;
                updateChart();
            });
        }
        
        // Функция запуска анализа
        function startComparativeAnalysis() {
            // Показываем интерфейс анализа
            if (placeholder) placeholder.classList.add('hidden');
            if (content) {
                content.classList.remove('hidden');
                content.classList.add('flex');
            }
            
            // Загружаем данные объектов
            loadAnalysisObjects();
        }
        
        // Функция сброса анализа
        function resetComparativeAnalysis() {
            // Очищаем состояние
            analysisState.selectedObjectId = null;
            analysisState.evaluations.clear();
            
            // Сбрасываем фильтры
            if (statusFilter) statusFilter.value = 'all';
            if (sortOrder) sortOrder.value = 'price_asc';
            if (displayMode) displayMode.value = 'scatter';
            
            // Обновляем интерфейс
            updateSelectedObjectInfo();
            updatePriceCorridors();
            updateObjectEvaluations();
            updateRecommendedPrice();
            updateObjectsList();
            updateChart();
        }
        
        // Функция сохранения анализа
        function saveComparativeAnalysis() {
            // В экспорте сохранение недоступно
            alert('Сохранение анализа доступно только в основном приложении');
        }
        
        // Функция загрузки объектов для анализа
        function loadAnalysisObjects() {
            try {
                // Берём объекты из reportData
                const { real_estate_objects = [], listings = [] } = reportData;
                
                // Обрабатываем объекты и объявления для анализа
                analysisState.currentObjects = real_estate_objects.map(obj => {
                    // Находим связанные объявления
                    const objectListings = listings.filter(l => l.real_estate_object_id === obj.id);
                    
                    // Берём последнее объявление для цены
                    const latestListing = objectListings.length > 0 ? 
                        objectListings.reduce((latest, current) => 
                            new Date(current.first_seen_date) > new Date(latest.first_seen_date) ? current : latest
                        ) : null;
                    
                    return {
                        id: obj.id,
                        address: obj.address_text || 'Адрес не указан',
                        status: obj.status || 'active',
                        area: latestListing?.area || 0,
                        pricePerSqm: latestListing && latestListing.area > 0 ? 
                            Math.round(latestListing.price / latestListing.area) : 0,
                        price: latestListing?.price || 0,
                        date: latestListing?.first_seen_date || new Date().toISOString(),
                        floor: latestListing?.floor || null,
                        rooms: latestListing?.rooms_count || null,
                        listing_id: latestListing?.id || null
                    };
                }).filter(obj => obj.pricePerSqm > 0); // Только объекты с ценой
                
                // Обновляем интерфейс
                updateObjectsList();
                calculatePriceCorridors();
                initComparativeChart();
                
                console.log('✅ Загружено объектов для анализа:', analysisState.currentObjects.length);
                
            } catch (error) {
                console.error('❌ Ошибка загрузки объектов для анализа:', error);
            }
        }
        
        // Функция обновления списка объектов
        function updateObjectsList() {
            const tableBody = document.getElementById('comparativeObjectsTableBody');
            const objectsCount = document.getElementById('comparativeObjectsCount');
            
            if (!tableBody) return;
            
            // Фильтруем объекты
            let filteredObjects = [...analysisState.currentObjects];
            
            // Фильтр по статусу
            if (analysisState.statusFilter !== 'all') {
                filteredObjects = filteredObjects.filter(obj => obj.status === analysisState.statusFilter);
            }
            
            // Сортировка
            filteredObjects.sort((a, b) => {
                switch (analysisState.sortOrder) {
                    case 'price_asc':
                        return a.pricePerSqm - b.pricePerSqm;
                    case 'price_desc':
                        return b.pricePerSqm - a.pricePerSqm;
                    case 'date_desc':
                        return new Date(b.date) - new Date(a.date);
                    case 'area_asc':
                        return a.area - b.area;
                    default:
                        return 0;
                }
            });
            
            // Обновляем счетчик
            if (objectsCount) {
                objectsCount.textContent = filteredObjects.length;
            }
            
            // Генерируем строки таблицы
            let tableHtml = '';
            filteredObjects.forEach(obj => {
                const isSelected = obj.id === analysisState.selectedObjectId;
                const evaluation = analysisState.evaluations.get(obj.id);
                const isEvaluated = evaluation !== undefined;
                
                const rowClasses = [
                    isSelected ? 'selected' : '',
                    isEvaluated ? 'evaluated' : ''
                ].filter(Boolean).join(' ');
                
                const statusText = obj.status === 'active' ? 'Активный' : 'Архивный';
                const priceFormatted = new Intl.NumberFormat('ru-RU').format(obj.pricePerSqm);
                const dateFormatted = new Date(obj.date).toLocaleDateString('ru-RU');
                const evaluationHtml = isEvaluated ? 
                    '<span class="evaluation-badge evaluation-' + evaluation + '">' + getEvaluationText(evaluation) + '</span>' :
                    '<span class="text-gray-400">-</span>';
                
                tableHtml += '<tr class="' + rowClasses + '" data-object-id="' + obj.id + '">' +
                    '<td class="px-3 py-4 text-sm text-gray-900">' + obj.address + '</td>' +
                    '<td class="px-3 py-4 text-sm"><span class="object-status ' + obj.status + '">' + statusText + '</span></td>' +
                    '<td class="px-3 py-4 text-sm text-gray-900">' + obj.area + ' м²</td>' +
                    '<td class="px-3 py-4 text-sm text-gray-900">' + priceFormatted + ' ₽</td>' +
                    '<td class="px-3 py-4 text-sm text-gray-500">' + dateFormatted + '</td>' +
                    '<td class="px-3 py-4 text-sm">' + evaluationHtml + '</td>' +
                    '</tr>';
            });
            
            tableBody.innerHTML = tableHtml;
            
            // Добавляем обработчики кликов
            tableBody.querySelectorAll('tr').forEach(row => {
                const objectId = parseInt(row.dataset.objectId);
                
                // Одинарный клик - выбор объекта
                row.addEventListener('click', () => {
                    selectObject(objectId);
                });
                
                // Двойной клик - оценка объекта
                row.addEventListener('dblclick', () => {
                    evaluateObject(objectId);
                });
            });
        }
        
        // Функция выбора объекта
        function selectObject(objectId) {
            analysisState.selectedObjectId = objectId;
            updateObjectsList(); // Обновляем выделение в таблице
            updateSelectedObjectInfo();
            updateChart();
            updateRecommendedPrice();
        }
        
        // Функция оценки объекта
        function evaluateObject(objectId) {
            // Простой диалог для оценки (в оригинале это модальное окно)
            const evaluations = ['better', 'similar', 'worse'];
            const evaluationTexts = {
                'better': 'Лучше',
                'similar': 'Похож',
                'worse': 'Хуже'
            };
            
            const evaluation = prompt('Оцените объект:\\n1 - Лучше\\n2 - Похож\\n3 - Хуже\\n\\nВведите номер (1-3):');
            
            if (evaluation && ['1', '2', '3'].includes(evaluation)) {
                const evaluationKey = evaluations[parseInt(evaluation) - 1];
                analysisState.evaluations.set(objectId, evaluationKey);
                updateObjectsList();
                updateObjectEvaluations();
                calculatePriceCorridors();
                updateChart();
            }
        }
        
        // Вспомогательная функция получения текста оценки
        function getEvaluationText(evaluation) {
            const texts = {
                'better': 'Лучше',
                'similar': 'Похож',
                'worse': 'Хуже'
            };
            return texts[evaluation] || evaluation;
        }
        
        // Функция обновления информации о выбранном объекте
        function updateSelectedObjectInfo() {
            const infoElement = document.getElementById('selectedObjectInfo');
            
            if (!infoElement || !analysisState.selectedObjectId) {
                if (infoElement) {
                    infoElement.innerHTML = '<div class="text-sm text-gray-500">Выберите объект в таблице ниже</div>';
                }
                return;
            }
            
            const selectedObject = analysisState.currentObjects.find(obj => obj.id === analysisState.selectedObjectId);
            if (!selectedObject) return;
            
            infoElement.innerHTML = 
                '<div class="space-y-2">' +
                    '<div class="text-sm"><strong>Адрес:</strong><br>' + selectedObject.address + '</div>' +
                    '<div class="grid grid-cols-2 gap-2 text-sm">' +
                        '<div><strong>Площадь:</strong><br>' + selectedObject.area + ' м²</div>' +
                        '<div><strong>Цена/м²:</strong><br>' + new Intl.NumberFormat('ru-RU').format(selectedObject.pricePerSqm) + ' ₽</div>' +
                    '</div>' +
                    '<div class="grid grid-cols-2 gap-2 text-sm">' +
                        '<div><strong>Статус:</strong><br>' + (selectedObject.status === 'active' ? 'Активный' : 'Архивный') + '</div>' +
                        '<div><strong>Дата:</strong><br>' + new Date(selectedObject.date).toLocaleDateString('ru-RU') + '</div>' +
                    '</div>' +
                '</div>';
        }
        
        // Функция расчета коридоров цен
        function calculatePriceCorridors() {
            // Сбрасываем коридоры
            analysisState.corridors = {
                active: { min: null, max: null },
                archive: { min: null, max: null },
                optimal: { min: null, max: null }
            };
            
            // Разделяем объекты по статусам
            const activeObjects = analysisState.currentObjects.filter(obj => obj.status === 'active');
            const archiveObjects = analysisState.currentObjects.filter(obj => obj.status === 'archive');
            
            // Рассчитываем коридоры для активных объектов
            if (activeObjects.length > 0) {
                const activePrices = activeObjects.map(obj => obj.pricePerSqm);
                analysisState.corridors.active.min = Math.min(...activePrices);
                analysisState.corridors.active.max = Math.max(...activePrices);
            }
            
            // Рассчитываем коридоры для архивных объектов
            if (archiveObjects.length > 0) {
                const archivePrices = archiveObjects.map(obj => obj.pricePerSqm);
                analysisState.corridors.archive.min = Math.min(...archivePrices);
                analysisState.corridors.archive.max = Math.max(...archivePrices);
            }
            
            // Оптимальный коридор на основе оценок
            const evaluatedObjects = analysisState.currentObjects.filter(obj => 
                analysisState.evaluations.has(obj.id)
            );
            
            if (evaluatedObjects.length > 0) {
                const betterObjects = evaluatedObjects.filter(obj => 
                    analysisState.evaluations.get(obj.id) === 'better'
                );
                const similarObjects = evaluatedObjects.filter(obj => 
                    analysisState.evaluations.get(obj.id) === 'similar'
                );
                
                if (betterObjects.length > 0 || similarObjects.length > 0) {
                    const relevantObjects = [...betterObjects, ...similarObjects];
                    const relevantPrices = relevantObjects.map(obj => obj.pricePerSqm);
                    
                    analysisState.corridors.optimal.min = Math.min(...relevantPrices);
                    analysisState.corridors.optimal.max = Math.max(...relevantPrices);
                }
            }
            
            updatePriceCorridors();
        }
        
        // Функция обновления отображения коридоров цен
        function updatePriceCorridors() {
            const activeCorridorElement = document.getElementById('activeCorridor');
            const archiveCorridorElement = document.getElementById('archiveCorridor');
            const optimalCorridorElement = document.getElementById('optimalCorridor');
            
            // Активные объекты
            if (activeCorridorElement) {
                if (analysisState.corridors.active.min !== null) {
                    const min = new Intl.NumberFormat('ru-RU').format(analysisState.corridors.active.min);
                    const max = new Intl.NumberFormat('ru-RU').format(analysisState.corridors.active.max);
                    activeCorridorElement.textContent = min + ' - ' + max;
                } else {
                    activeCorridorElement.textContent = '-';
                }
            }
            
            // Архивные объекты
            if (archiveCorridorElement) {
                if (analysisState.corridors.archive.min !== null) {
                    const min = new Intl.NumberFormat('ru-RU').format(analysisState.corridors.archive.min);
                    const max = new Intl.NumberFormat('ru-RU').format(analysisState.corridors.archive.max);
                    archiveCorridorElement.textContent = min + ' - ' + max;
                } else {
                    archiveCorridorElement.textContent = '-';
                }
            }
            
            // Оптимальный коридор
            if (optimalCorridorElement) {
                if (analysisState.corridors.optimal.min !== null) {
                    const min = new Intl.NumberFormat('ru-RU').format(analysisState.corridors.optimal.min);
                    const max = new Intl.NumberFormat('ru-RU').format(analysisState.corridors.optimal.max);
                    optimalCorridorElement.textContent = min + ' - ' + max;
                } else {
                    optimalCorridorElement.textContent = '-';
                }
            }
        }
        
        // Функция обновления списка оценок
        function updateObjectEvaluations() {
            const evaluationsElement = document.getElementById('objectEvaluations');
            
            if (!evaluationsElement) return;
            
            if (analysisState.evaluations.size === 0) {
                evaluationsElement.innerHTML = '<div class="text-gray-500">Нет оценок</div>';
                return;
            }
            
            const evaluationCounts = {
                better: 0,
                similar: 0,
                worse: 0
            };
            
            analysisState.evaluations.forEach(evaluation => {
                evaluationCounts[evaluation]++;
            });
            
            evaluationsElement.innerHTML = Object.entries(evaluationCounts)
                .filter(([_, count]) => count > 0)
                .map(([evaluation, count]) => 
                    '<div class="flex justify-between items-center">' +
                        '<span class="evaluation-badge evaluation-' + evaluation + '">' + getEvaluationText(evaluation) + '</span>' +
                        '<span class="text-sm font-medium">' + count + '</span>' +
                    '</div>'
                ).join('');
        }
        
        // Функция обновления рекомендуемой цены
        function updateRecommendedPrice() {
            const priceElement = document.getElementById('recommendedPrice');
            const noteElement = document.getElementById('recommendedPriceNote');
            
            if (!priceElement || !noteElement) return;
            
            if (!analysisState.selectedObjectId || analysisState.corridors.optimal.min === null) {
                priceElement.textContent = '-';
                noteElement.textContent = 'Выберите объект и проведите оценки';
                return;
            }
            
            // Простая логика расчета рекомендуемой цены
            const optimalMin = analysisState.corridors.optimal.min;
            const optimalMax = analysisState.corridors.optimal.max;
            const recommendedPrice = Math.round((optimalMin + optimalMax) / 2);
            
            priceElement.textContent = new Intl.NumberFormat("ru-RU").format(recommendedPrice) + ' ₽/м²';
            noteElement.textContent = 'На основе оценок похожих объектов';
        }
    
        // Функция инициализации графика
        function initComparativeChart() {
            const chartElement = document.getElementById('comparativeChart');
            const loadingElement = document.getElementById('comparativeChartLoading');
            
            if (!chartElement) return;
            
            if (loadingElement) loadingElement.style.display = 'none';
            
            try {
                const options = {
                    chart: {
                        height: 500,
                        type: analysisState.displayMode,
                        locales: [{
                            name: 'ru',
                            options: {
                                months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
                                shortMonths: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                            }
                        }],
                        defaultLocale: 'ru',
                        toolbar: { show: false },
                        events: {
                            dataPointSelection: function(event, chartContext, config) {
                                // Обработка клика по точке на графике
                                if (config.dataPointIndex >= 0) {
                                    const objectData = chartContext.w.config.series[config.seriesIndex].data[config.dataPointIndex];
                                    if (objectData && objectData.objectId) {
                                        selectObject(objectData.objectId);
                                    }
                                }
                            }
                        }
                    },
                    series: [],
                    colors: ['#10B981', '#EF4444', '#3B82F6'],
                    xaxis: {
                        type: 'datetime',
                        labels: { 
                            style: { fontSize: '12px' },
                            datetimeFormatter: {
                                year: 'yyyy',
                                month: 'MMM yyyy',
                                day: 'dd MMM',
                                hour: 'HH:mm'
                            }
                        }
                    },
                    yaxis: {
                        title: { text: 'Цена за м² (₽)' },
                        labels: { 
                            style: { fontSize: '12px' },
                            formatter: function(value) {
                                return new Intl.NumberFormat('ru-RU').format(value);
                            }
                        }
                    },
                    dataLabels: { enabled: false },
                    legend: { position: 'top' },
                    tooltip: {
                        custom: function({ series, seriesIndex, dataPointIndex, w }) {
                            const data = w.config.series[seriesIndex].data[dataPointIndex];
                            return '<div class="px-3 py-2">' +
                                    '<div class="font-semibold">' + (data.address || 'Адрес не указан') + '</div>' +
                                    '<div>Цена: ' + new Intl.NumberFormat('ru-RU').format(data.y) + ' ₽/м²</div>' +
                                    '<div>Площадь: ' + (data.area || '-') + ' м²</div>' +
                                    '<div>Дата: ' + new Date(data.x).toLocaleDateString('ru-RU') + '</div>' +
                                    (data.evaluation ? '<div>Оценка: ' + getEvaluationText(data.evaluation) + '</div>' : '') +
                                '</div>';
                        }
                    }
                };
                
                comparativeChart = new ApexCharts(chartElement, options);
                comparativeChart.render();
                
                updateChart();
                
            } catch (error) {
                console.error('❌ Ошибка инициализации графика сравнения:', error);
                if (loadingElement) loadingElement.style.display = 'none';
                chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-red-500"><p class="text-sm">Ошибка загрузки графика</p></div>';
            }
        }
        
        // Функция обновления графика
        function updateChart() {
            if (!comparativeChart) return;
            
            try {
                // Подготавливаем данные для графика
                const activeData = [];
                const archiveData = [];
                const selectedData = [];
                
                analysisState.currentObjects.forEach(obj => {
                    // Фильтруем по статусу
                    if (analysisState.statusFilter !== 'all' && obj.status !== analysisState.statusFilter) {
                        return;
                    }
                    
                    const dataPoint = {
                        x: new Date(obj.date).getTime(),
                        y: obj.pricePerSqm,
                        objectId: obj.id,
                        address: obj.address,
                        area: obj.area,
                        evaluation: analysisState.evaluations.get(obj.id)
                    };
                    
                    // Выделяем выбранный объект
                    if (obj.id === analysisState.selectedObjectId) {
                        selectedData.push(dataPoint);
                    } else if (obj.status === 'active') {
                        activeData.push(dataPoint);
                    } else {
                        archiveData.push(dataPoint);
                    }
                });
                
                // Обновляем серии данных
                const series = [];
                
                if (activeData.length > 0) {
                    series.push({
                        name: 'Активные объекты',
                        data: activeData
                    });
                }
                
                if (archiveData.length > 0) {
                    series.push({
                        name: 'Архивные объекты',
                        data: archiveData
                    });
                }
                
                if (selectedData.length > 0) {
                    series.push({
                        name: 'Выбранный объект',
                        data: selectedData
                    });
                }
                
                comparativeChart.updateSeries(series);
                
                // Обновляем тип графика если изменился
                if (comparativeChart.w.config.chart.type !== analysisState.displayMode) {
                    comparativeChart.updateOptions({
                        chart: {
                            type: analysisState.displayMode
                        }
                    });
                }
                
            } catch (error) {
                console.error('❌ Ошибка обновления графика сравнения:', error);
            }
        }
        
        // Если есть сохранённые результаты анализа, показываем интерфейс
        if (reportData?.comparative_analysis?.hasResults) {
            startComparativeAnalysis();
        }
        
        console.log('✅ Сравнительный анализ инициализирован');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации сравнительного анализа:', error);
    }
}

function initMap() {
    console.log('🗺️ Инициализация карты...');
    
    try {
        const mapContainer = document.getElementById('reportMap');
        if (!mapContainer) {
            console.warn('Контейнер карты не найден');
            return;
        }
        
        const { area, addresses, real_estate_objects, listings } = reportData;
        
        // Убираем placeholder
        mapContainer.innerHTML = '';
        
        // Определяем центр карты
        let mapCenter = [55.7558, 37.6176]; // Москва по умолчанию
        let mapZoom = 12;
        
        if (area && area.polygon && area.polygon.length > 0) {
            // Рассчитываем центр полигона
            const bounds = calculatePolygonBounds(area.polygon);
            mapCenter = [(bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2];
            
            // Автоматически подбираем zoom исходя из размера области
            const latDiff = bounds.north - bounds.south;
            const lngDiff = bounds.east - bounds.west;
            const maxDiff = Math.max(latDiff, lngDiff);
            
            if (maxDiff > 1) mapZoom = 8;
            else if (maxDiff > 0.5) mapZoom = 10;
            else if (maxDiff > 0.1) mapZoom = 12;
            else mapZoom = 14;
        }
        
        // Создаём карту
        const map = L.map('reportMap').setView(mapCenter, mapZoom);
        
        // Добавляем тайлы OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        // Добавляем полигон области
        if (area && area.polygon && area.polygon.length > 0) {
            const polygonCoords = area.polygon.map(point => [point.lat || point[0], point.lng || point[1]]);
            
            L.polygon(polygonCoords, {
                color: '#3b82f6',
                weight: 2,
                opacity: 0.8,
                fillColor: '#3b82f6',
                fillOpacity: 0.2
            }).addTo(map);
            
            // Центрируем карту на полигоне
            const bounds = L.latLngBounds(polygonCoords);
            map.fitBounds(bounds, { padding: [20, 20] });
        }
        
        // Слои для разных типов данных
        const layerGroups = {
            addresses: L.layerGroup(),
            objects: L.layerGroup(),
            listings: L.layerGroup()
        };
        
        // Вспомогательные функции для цветов и маркеров
        function getYearColor(year) {
            if (!year) return '#6b7280';
            if (year < 1960) return '#dc2626'; // красный
            if (year < 1980) return '#ea580c'; // оранжевый  
            if (year < 2000) return '#ca8a04'; // желтый
            if (year < 2010) return '#16a34a'; // зеленый
            return '#2563eb'; // синий
        }
        
        function getFloorsColor(floors) {
            if (!floors) return '#6b7280';
            if (floors <= 5) return '#dc2626';
            if (floors <= 9) return '#ea580c';
            if (floors <= 16) return '#ca8a04';
            return '#16a34a';
        }
        
        function getMarkerHeight(address) {
            const floorCount = address.floors_count || 0;
            if (floorCount >= 1 && floorCount <= 5) return 10;
            if (floorCount > 5 && floorCount <= 10) return 15;
            if (floorCount > 10 && floorCount <= 20) return 20;
            if (floorCount > 20) return 25;
            return 10;
        }
        
        function createMarkerHtml(address, displayValue, labelColor) {
            const markerHeight = getMarkerHeight(address);
            const markerColor = getYearColor(address.build_year);
            
            return \`
                <div class="leaflet-marker-icon-wrapper" style="position: relative;">
                    <div style="
                        width: 0; 
                        height: 0; 
                        border-left: 7.5px solid transparent; 
                        border-right: 7.5px solid transparent; 
                        border-top: \${markerHeight}px solid \${markerColor};
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
                    "></div>
                    <span class="leaflet-marker-iconlabel" style="
                        position: absolute; 
                        left: 15px; 
                        top: 0px; 
                        font-size: 11px; 
                        font-weight: 600; 
                        color: \${labelColor}; 
                        background: rgba(255,255,255,0.9); 
                        padding: 1px 4px; 
                        border-radius: 3px; 
                        white-space: nowrap;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    ">\${displayValue}</span>
                </div>
            \`;
        }
        
        function createAddressPopup(address, filterType, displayValue) {
            return \`
                <div style="padding: 8px; min-width: 200px;">
                    <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">📍 Адрес</div>
                    <div style="font-size: 14px; color: #374151; margin-bottom: 8px;">\${address.address || 'Не указан'}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
                        <div><strong>\${getFilterName(filterType)}:</strong> \${displayValue}</div>
                    </div>
                    <div style="font-size: 12px; color: #6b7280;">
                        <div>Координаты: \${address.latitude.toFixed(6)}, \${address.longitude.toFixed(6)}</div>
                        \${address.floors_count ? \`<div>Этажей: \${address.floors_count}</div>\` : ''}
                        \${address.build_year ? \`<div>Год постройки: \${address.build_year}</div>\` : ''}
                        \${address.geocoding_confidence ? \`<div>Точность: \${(address.geocoding_confidence * 100).toFixed(1)}%</div>\` : ''}
                    </div>
                </div>
            \`;
        }
        
        function getFilterName(filterType) {
            const names = {
                'year': 'Год постройки',
                'series': 'Серия дома',
                'floors': 'Этажность',
                'objects': 'Объектов',
                'listings': 'Объявлений',
                'house_class': 'Класс дома',
                'house_problems': 'Проблемы дома',
                'commercial_spaces': 'Коммерческие помещения',
                'comment': 'Комментарий'
            };
            return names[filterType] || filterType;
        }

        // Добавляем маркеры адресов с поддержкой фильтров (по образцу карты сегмента)
        if (addresses && addresses.length > 0) {
            addresses.forEach(address => {
                if (address.latitude && address.longitude) {
                    // Получаем значение для фильтра по умолчанию (год)
                    const defaultDisplayValue = address.build_year || 'н/д';
                    const defaultLabelColor = getYearColor(address.build_year);
                    
                    // Создаём HTML маркера с меткой
                    const markerHtml = createMarkerHtml(address, defaultDisplayValue, defaultLabelColor);
                    
                    const marker = L.marker([address.latitude, address.longitude], {
                        icon: L.divIcon({
                            className: 'address-marker',
                            html: markerHtml,
                            iconSize: [15, getMarkerHeight(address)],
                            iconAnchor: [7.5, getMarkerHeight(address)]
                        })
                    });
                    
                    // Сохраняем данные адреса в маркере для фильтров
                    marker.addressData = address;
                    
                    // Создаём popup с информацией по умолчанию
                    const popupContent = createAddressPopup(address, 'year', defaultDisplayValue);
                    marker.bindPopup(popupContent);
                    
                    layerGroups.addresses.addLayer(marker);
                }
            });
        }
        
        // Добавляем маркеры объектов (по образцу оригинального проекта)
        if (real_estate_objects && real_estate_objects.length > 0) {
            real_estate_objects.forEach(object => {
                if (object.address && object.address.latitude && object.address.longitude) {
                    const marker = L.marker([object.address.latitude, object.address.longitude], {
                        icon: L.divIcon({
                            className: 'object-marker',
                            html: \`
                                <div class="leaflet-marker-icon-wrapper" style="position: relative;">
                                    <div style="
                                        width: 12px; 
                                        height: 12px; 
                                        background-color: #10b981;
                                        border: 2px solid white;
                                        border-radius: 2px;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                                    "></div>
                                </div>
                            \`,
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })
                    });
                    
                    marker.bindPopup(\`
                        <div style="padding: 8px; min-width: 200px;">
                            <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">🏢 Объект недвижимости</div>
                            <div style="font-size: 14px; color: #374151; margin-bottom: 8px;">\${object.address.address || 'Адрес не указан'}</div>
                            <div style="font-size: 12px; color: #6b7280;">
                                <div>ID: \${object.id}</div>
                                <div>Объявлений: \${object.listings_count || 0}</div>
                                \${object.address.floors_count ? \`<div>Этажей: \${object.address.floors_count}</div>\` : ''}
                            </div>
                        </div>
                    \`);
                    
                    layerGroups.objects.addLayer(marker);
                }
            });
        }
        
        // Счётчики не нужны в новом дизайне
        
        // По умолчанию показываем адреса
        layerGroups.addresses.addTo(map);
        
        // Обработчики кнопок фильтров отображения (по образцу карты сегмента)
        let activeMapFilter = 'year';
        
        document.querySelectorAll('.report-map-filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const filterType = this.getAttribute('data-filter');
                activeMapFilter = filterType;
                
                // Убираем активный класс со всех кнопок
                document.querySelectorAll('.report-map-filter-btn').forEach(b => b.classList.remove('active'));
                
                // Добавляем активный класс к текущей кнопке
                this.classList.add('active');
                
                // Обновляем отображение маркеров с учетом нового фильтра
                updateMarkersWithFilter(filterType);
            });
        });
        
        // Функция обновления маркеров с учетом активного фильтра
        function updateMarkersWithFilter(filterType) {
            // Обновляем маркеры адресов
            layerGroups.addresses.eachLayer((marker) => {
                const address = marker.addressData;
                if (address) {
                    // Обновляем popup и стиль маркера в зависимости от фильтра
                    updateMarkerForFilter(marker, address, filterType);
                }
            });
            
            // Обновляем маркеры объектов
            layerGroups.objects.eachLayer((marker) => {
                const object = marker.objectData;
                if (object && object.address) {
                    updateMarkerForFilter(marker, object.address, filterType);
                }
            });
        }
        
        // Функция обновления конкретного маркера
        function updateMarkerForFilter(marker, address, filterType) {
            // Получаем значение для отображения
            let displayValue = '';
            let labelColor = '#374151';
            
            switch (filterType) {
                case 'year':
                    displayValue = address.build_year || 'н/д';
                    labelColor = getYearColor(address.build_year);
                    break;
                case 'series':
                    displayValue = address.house_series_name || 'н/д';
                    break;
                case 'floors':
                    displayValue = address.floors_count ? \`\${address.floors_count}эт\` : 'н/д';
                    labelColor = getFloorsColor(address.floors_count);
                    break;
                case 'objects':
                    displayValue = address.objects_count || '0';
                    break;
                case 'listings':
                    displayValue = address.listings_count || '0';
                    break;
                case 'house_class':
                    displayValue = address.house_class_name || 'н/д';
                    break;
                case 'house_problems':
                    displayValue = address.house_problems || 'н/д';
                    break;
                case 'commercial_spaces':
                    displayValue = address.commercial_spaces ? 'Есть' : 'Нет';
                    break;
                case 'comment':
                    displayValue = address.comment ? 'Есть' : 'Нет';
                    break;
                default:
                    displayValue = 'н/д';
            }
            
            // Обновляем иконку маркера с новой информацией
            const icon = marker.getIcon();
            const newHtml = createMarkerHtml(address, displayValue, labelColor);
            marker.setIcon(L.divIcon({
                className: 'address-marker',
                html: newHtml,
                iconSize: [15, getMarkerHeight(address)],
                iconAnchor: [7.5, getMarkerHeight(address)]
            }));
            
            // Обновляем popup с новой информацией
            const popupContent = createAddressPopup(address, filterType, displayValue);
            marker.setPopupContent(popupContent);
        }
        
        // Заполняем статистику адресов
        const totalAddresses = addresses?.length || 0;
        const withCoords = addresses?.filter(a => a.latitude && a.longitude).length || 0;
        const withYear = addresses?.filter(a => a.build_year).length || 0;
        const withFloors = addresses?.filter(a => a.floors_count).length || 0;
        
        updateElementText('mapTotalAddresses', totalAddresses);
        updateElementText('mapWithCoords', withCoords);
        updateElementText('mapWithYear', withYear);
        updateElementText('mapWithFloors', withFloors);
        
        // Сохраняем объект карты для возможного использования
        window.reportMap = map;
        window.reportMapLayers = layerGroups;
        
        console.log('✅ Карта инициализирована');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации карты:', error);
        
        // Показываем сообщение об ошибке в контейнере карты
        const mapContainer = document.getElementById('reportMap');
        if (mapContainer) {
            mapContainer.innerHTML = \`
                <div class="absolute inset-0 flex items-center justify-center text-gray-500">
                    <div class="text-center">
                        <svg class="w-12 h-12 mx-auto mb-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p class="text-sm text-red-600">Ошибка загрузки карты</p>
                    </div>
                </div>
            \`;
        }
    }
}

// Вспомогательная функция для обновления текста элемента
function updateElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text || '0';
    }
}

// Вспомогательная функция для расчёта границ полигона
function calculatePolygonBounds(polygon) {
    let north = -90, south = 90, east = -180, west = 180;
    
    polygon.forEach(point => {
        const lat = point.lat || point[0];
        const lng = point.lng || point[1];
        
        if (lat > north) north = lat;
        if (lat < south) south = lat;
        if (lng > east) east = lng;
        if (lng < west) west = lng;
    });
    
    return { north, south, east, west };
}

function initModals() {
    console.log('🖼️ Инициализация модальных окон...');
    
    // Закрытие модальных окон
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.onclick = function() {
            this.closest('.modal').classList.remove('show');
        }
    });
    
    // Закрытие при клике вне модального окна
    document.querySelectorAll('.modal').forEach(modal => {
        modal.onclick = function(event) {
            if (event.target === modal) {
                modal.classList.remove('show');
            }
        }
    });
}
</script>`;
    }

    /**
     * Создание и скачивание HTML-файла
     */
    async downloadHTMLReport(exportData, filename) {
        try {
            await this.debugLog('Начинаем загрузку HTML-отчёта');

            const htmlContent = await this.generateHTMLReport(exportData);
            
            // Создаём Blob с HTML-контентом
            const blob = new Blob([htmlContent], { 
                type: 'text/html;charset=utf-8' 
            });
            
            // Создаём ссылку для скачивания
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename || `neocenka-report-${Date.now()}.html`;
            
            // Имитируем клик для скачивания
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Освобождаем память
            URL.revokeObjectURL(link.href);
            
            await this.debugLog('HTML-отчёт успешно скачан');
            
        } catch (error) {
            console.error('❌ Ошибка скачивания HTML-отчёта:', error);
            throw error;
        }
    }
}

// Экспорт для использования в других модулях
if (typeof window !== 'undefined') {
    window.HTMLExportManager = HTMLExportManager;
}