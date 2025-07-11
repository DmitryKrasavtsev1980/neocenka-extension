/**
 * Инициализация страницы управления областью
 */

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Навигация
        const navigation = new NavigationComponent();
        document.getElementById('navigation-container').innerHTML = navigation.render();
        navigation.init();
        navigation.setPageTitle('Область');
        
        // Перемещаем контент в основной контейнер
        const pageContent = document.getElementById('page-content');
        const areaContent = document.getElementById('area-content');
        
        if (pageContent && areaContent) {
            // Добавляем breadcrumbs
            const breadcrumbs = BreadcrumbsComponent.forPage('area');
            const breadcrumbsContainer = document.createElement('div');
            breadcrumbsContainer.innerHTML = breadcrumbs.render();
            pageContent.appendChild(breadcrumbsContainer);
            
            // Перемещаем все дочерние элементы
            areaContent.classList.remove('hidden');
            while (areaContent.firstChild) {
                pageContent.appendChild(areaContent.firstChild);
            }
        }
        
        // Футер
        const footer = new FooterComponent();
        document.getElementById('footer-container').innerHTML = footer.render();
        
        // Ждем инициализации базы данных
        if (!window.db) {
            throw new Error('База данных не инициализирована');
        }
        
        if (!window.db.db) {
            console.log('🔄 Ожидание инициализации базы данных...');
            await window.db.init();
        }
        
        // Инициализируем RealEstateObjectManager
        if (window.realEstateObjectManager) {
            try {
                await window.realEstateObjectManager.init();
                console.log('🏠 RealEstateObjectManager успешно инициализирован');
            } catch (error) {
                console.error('❌ Ошибка инициализации RealEstateObjectManager:', error);
                throw new Error('Не удалось инициализировать RealEstateObjectManager: ' + error.message);
            }
        } else {
            console.warn('⚠️ RealEstateObjectManager не найден в window объекте');
        }
        
        // Проверяем, что класс AreaPage доступен
        if (typeof AreaPage === 'undefined') {
            throw new Error('Класс AreaPage не найден. Проверьте загрузку area.js');
        }
        
        // Создаем экземпляр страницы области
        window.areaPage = new AreaPage();
        
        // Инициализируем страницу
        await window.areaPage.init();
        
        console.log('Area page initialization completed');
        
    } catch (error) {
        console.error('Error during area page initialization:', error);
        
        // Показываем ошибку пользователю
        const errorContainer = document.createElement('div');
        errorContainer.className = 'fixed inset-0 flex items-center justify-center bg-gray-50';
        errorContainer.innerHTML = `
            <div class="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <svg class="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                        </svg>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-gray-800">
                            Ошибка инициализации страницы
                        </h3>
                        <div class="mt-2 text-sm text-gray-500">
                            <p>${error.message}</p>
                        </div>
                        <div class="mt-4">
                            <button onclick="window.location.href='main.html'" 
                                    class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                                Вернуться на главную
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(errorContainer);
    }
});