/**
 * Инициализация страницы анализа сегмента
 */

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Навигация
        const navigation = new NavigationComponent();
        document.getElementById('navigation-container').innerHTML = navigation.render();
        navigation.init();
        navigation.setPageTitle('Сегмент');
        
        // Перемещаем контент в основной контейнер
        const pageContent = document.getElementById('page-content');
        const segmentContent = document.getElementById('segment-content');
        
        if (pageContent && segmentContent) {
            // Добавляем breadcrumbs
            const breadcrumbs = BreadcrumbsComponent.forPage('segment');
            const breadcrumbsContainer = document.createElement('div');
            breadcrumbsContainer.innerHTML = breadcrumbs.render();
            pageContent.appendChild(breadcrumbsContainer);
            
            // Перемещаем все дочерние элементы
            segmentContent.classList.remove('hidden');
            while (segmentContent.firstChild) {
                pageContent.appendChild(segmentContent.firstChild);
            }
        }
        
        // Футер
        const footer = new FooterComponent();
        document.getElementById('footer-container').innerHTML = footer.render();

        // Создаем экземпляр класса и инициализируем
        window.segmentPage = new SegmentPage();
        await window.segmentPage.init();
        
        console.log('Страница анализа сегмента инициализирована');
    } catch (error) {
        console.error('Ошибка инициализации страницы анализа сегмента:', error);
        
        // Показываем ошибку пользователю
        const container = document.getElementById('notifications');
        if (container) {
            const notification = document.createElement('div');
            notification.className = 'border rounded-lg p-4 shadow-sm bg-red-50 border-red-200 text-red-800';
            notification.innerHTML = `
                <div class="flex items-center">
                    <span class="text-sm font-medium">Ошибка загрузки страницы. Попробуйте обновить страницу.</span>
                </div>
            `;
            container.appendChild(notification);
        }
    }
});