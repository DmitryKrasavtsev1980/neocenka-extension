# Панель Отчёты

1. сворачиваемая панель "Отчёты" по примеру других панелей на странице просмотра области. панель должна распологаться медлу панелями Сегменты и Управление дублеми.
2. функция показа и скрытия панели в выпадающем списке панелей. иконка для панели:
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
  <path fill-rule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h16.5a.75.75 0 0 1 0 1.5H18v8.75A2.75 2.75 0 0 1 15.25 15h-1.072l.798 3.06a.75.75 0 0 1-1.452.38L13.41 18H6.59l-.114.44a.75.75 0 0 1-1.452-.38L5.823 15H4.75A2.75 2.75 0 0 1 2 12.25V3.5h-.25A.75.75 0 0 1 1 2.75ZM7.373 15l-.391 1.5h6.037l-.392-1.5H7.373Zm7.49-8.931a.75.75 0 0 1-.175 1.046 19.326 19.326 0 0 0-3.398 3.098.75.75 0 0 1-1.097.04L8.5 8.561l-2.22 2.22A.75.75 0 1 1 5.22 9.72l2.75-2.75a.75.75 0 0 1 1.06 0l1.664 1.663a20.786 20.786 0 0 1 3.122-2.74.75.75 0 0 1 1.046.176Z" clip-rule="evenodd" />
</svg>

3. описание наполнения панели "Отчёты":

в панели должен быть фильтр отчётов: выбор сегмета и подсегмента(как в фильтре сегментов в таблице дублей, но без статуса), выбор временного периода дата от-до. кнопка показа и скрытия отчётов: точно такая же как кнопка с выпадающим списком панелей.

ниже фильтра нужно распологать отчёты:
1. отчёт Ликвидность сегмента/подсегмента

это график apexcharts показывающий информацию по объектам недвижимости (сегмента или подсегмента).
описание графика: столбчатая диаграмма, которая показывает сколько объектов недвижимости появилось в месяц,
сколько объектов недвижимости ушло с рынка в месяц и линией показывается сколько активных объектов было на начало месяца.
Таким образом пользователь может понять сколько объектов недвижимости продаётся по месяцам и какая сезонность продаж.

пример как выглядит график на скрине (example/07.png)

пример кода графика:
var options = {
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
                                    "months": [
                                        "Январь",
                                        "Февраль",
                                        "Март",
                                        "Апрель",
                                        "Май",
                                        "Июнь",
                                        "Июль",
                                        "Август",
                                        "Сентябрь",
                                        "Октябрь",
                                        "Ноябрь",
                                        "Декабрь"
                                    ],
                                    "shortMonths": [
                                        "Янв",
                                        "Фев",
                                        "Мар",
                                        "Апр",
                                        "Май",
                                        "Июн",
                                        "Июл",
                                        "Авг",
                                        "Сен",
                                        "Окт",
                                        "Ноя",
                                        "Дек"
                                    ],
                                    "days": [
                                        "Воскресенье",
                                        "Понедельник",
                                        "Вторник",
                                        "Среда",
                                        "Четверг",
                                        "Пятница",
                                        "Суббота"
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
                    document.getElementById('new-close-apex-charts').innerHTML = '';
                    var chart = new ApexCharts(document.querySelector("#new-close-apex-charts"), options);
                    chart.render();


пример данных в файле (example/report_new_close_average.json)

Если нужно пример скрипта на php который готовит данные, то я могу предоставить.

2. Отчёт "Изменение средней цены".
На графике показывается изменение средней цены по месяцам и средней цены за квадратный метр.
пример как выглядит на скрине (example/08.png)

пример кода:

document.getElementById('middle-price-apex-charts').innerHTML = '';
                    var optionsMiddlePrice = {
                        series: [
                            {
                                name: 'Средняя цена квадратного метра',
                                type: 'column',
                                data: data['averageСostMeter']
                            },
                            {
                                name: 'Средняя цена объекта',
                                type: 'line',
                                data: data['averageСost']
                            }],
                        colors: ['#60ba5d', '#629bc2'],
                        chart: {
                            height: 350,
                            locales: [{
                                "name": "ru",
                                "options": {
                                    "months": [
                                        "Январь",
                                        "Февраль",
                                        "Март",
                                        "Апрель",
                                        "Май",
                                        "Июнь",
                                        "Июль",
                                        "Август",
                                        "Сентябрь",
                                        "Октябрь",
                                        "Ноябрь",
                                        "Декабрь"
                                    ],
                                    "shortMonths": [
                                        "Янв",
                                        "Фев",
                                        "Мар",
                                        "Апр",
                                        "Май",
                                        "Июн",
                                        "Июл",
                                        "Авг",
                                        "Сен",
                                        "Окт",
                                        "Ноя",
                                        "Дек"
                                    ],
                                    "days": [
                                        "Воскресенье",
                                        "Понедельник",
                                        "Вторник",
                                        "Среда",
                                        "Четверг",
                                        "Пятница",
                                        "Суббота"
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
                                title: {
                                    text: 'Средняя цена квадратного метра',
                                },
                            },
                            {
                                opposite: true,
                                title: {
                                    text: 'Средняя цена объекта'
                                }
                            }
                        ]
                    };

                    var chartMiddlePrice = new ApexCharts(document.querySelector("#middle-price-apex-charts"), optionsMiddlePrice);
                    chartMiddlePrice.render();

                    пример данных в фале example/report_new_close_average.json
3. График Коридор рынка недвижимости.

на графике отображаются точки последних цен в объектах недвижимости по вертикали, по горизонтали дата последнего обновления объекта недвижимости. пример (example/16.png)

пример кода графика:
var optionsPoint = {
                        chart: {
                            height: 600,
                            locales: [{
                                "name": "ru",
                                "options": {
                                    "months": [
                                        "Январь",
                                        "Февраль",
                                        "Март",
                                        "Апрель",
                                        "Май",
                                        "Июнь",
                                        "Июль",
                                        "Август",
                                        "Сентябрь",
                                        "Октябрь",
                                        "Ноябрь",
                                        "Декабрь"
                                    ],
                                    "shortMonths": [
                                        "Янв",
                                        "Фев",
                                        "Мар",
                                        "Апр",
                                        "Май",
                                        "Июн",
                                        "Июл",
                                        "Авг",
                                        "Сен",
                                        "Окт",
                                        "Ноя",
                                        "Дек"
                                    ],
                                    "days": [
                                        "Воскресенье",
                                        "Понедельник",
                                        "Вторник",
                                        "Среда",
                                        "Четверг",
                                        "Пятница",
                                        "Суббота"
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
                            }
                        },
                        stroke: {
                            curve: 'stepline',
                            width: widths
                        },

                        series: seriesPoint,
                        colors: colors,
                        xaxis: {
                            type: 'datetime',
                        },
                        title: {
                            text: 'Выбранный сегмент',
                            align: 'left',
                            style: {
                                fontSize: "14px",
                                color: 'rgba(102,102,102,0.56)'
                            }
                        },
                        markers: {
                            size: 4,
                            opacity: 0.9,
                            colors: ["#56c2d6"],
                            strokeColor: "#fff",
                            strokeWidth: 2,
                            style: 'inverted',
                            // full, hollow, inverted
                            hover: {
                                size: 15
                            },
                            customHTML: function () {
                                return '<span class="custom-marker"><i class="fas fa-chart-pie"></i></span>'
                            },
                            onClick: function (e) {
                                console.log(e);

                            }
                        },
                        tooltip: {
                            shared: false,
                            intersect: true
                        },
                        yaxis: {
                            min: Number.parseInt(minPrice),
                            max: Number.parseInt(maxPrice),
                            title: {
                                text: 'Цена'
                            }
                        },
                        grid: {
                            show: true,
                            position: 'back',
                            xaxis: {
                                lines: {
                                    show: true,
                                }
                            },
                            yaxis: {
                                lines: {
                                    show: true,
                                }
                            },
                            borderColor: '#eeeeee',
                        },
                        legend: {
                            show: showLegend
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
                    document.getElementById('point-apex-charts').innerHTML = '';
                    var chartPoint = new ApexCharts(document.querySelector("#point-apex-charts"), optionsPoint);
                    chartPoint.render();

пример данных (example/report_points.json)


