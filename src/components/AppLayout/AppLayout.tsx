import React, { useState, useEffect } from 'react';
import { getCurrentUser, logout, getModules, getNewsUnreadCount, markNewsRead, type ModuleInfo } from '@/services/api-service';
import { useTheme } from '@/components/ThemeProvider';
import { SearchPage } from '@/pages/search/SearchPage';
import ImportPage from '@/pages/import/ImportPage';
import ModulesPage from '@/components/Modules/ModulesPage';
import ProfilePage from '@/components/Profile/ProfilePage';
import NewsPage from '@/pages/news/NewsPage';
import FeedbackPage from '@/pages/feedback/FeedbackPage';
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
  SidebarGroup,
} from '@/components/catalyst/sidebar';
import {
  CubeIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  UserIcon,
  ArrowLeftOnRectangleIcon,
  SunIcon,
  MoonIcon,
  BuildingOffice2Icon,
  NewspaperIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/20/solid';

type ActivePage = 'modules' | 'search' | 'import' | 'profile' | 'news' | 'feedback';

interface ModulePageConfig {
  page: ActivePage;
  label: string;
  icon: React.ReactNode;
}

interface ModuleConfig {
  label: string;
  pages: ModulePageConfig[];
}

const heroIconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'building-office': BuildingOffice2Icon,
};

const modulesConfig: Record<string, ModuleConfig> = {
  dealsrosreestr: {
    label: 'Сделки Росреестра',
    pages: [
      {
        page: 'search',
        label: 'Поиск сделок',
        icon: <MagnifyingGlassIcon data-slot="icon" />,
      },
      {
        page: 'import',
        label: 'Импорт',
        icon: <ArrowDownTrayIcon data-slot="icon" />,
      },
    ],
  },
};

const AppLayout: React.FC = () => {
  const [activePage, setActivePage] = useState<ActivePage>('modules');
  const [importModuleCode, setImportModuleCode] = useState<string | undefined>(undefined);
  const [activeModules, setActiveModules] = useState<ModuleInfo[]>([]);
  const [unreadNews, setUnreadNews] = useState(0);
  const user = getCurrentUser();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    // Only fetch if user is authenticated
    if (!user) return;
    getModules()
      .then((data) => {
        setActiveModules(data.modules.filter((m) => m.access?.status === 'active'));
      })
      .catch(() => {});
    getNewsUnreadCount()
      .then((data) => setUnreadNews(data.unread_count))
      .catch(() => {});
  }, [user]);

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  const handleModuleOpen = (code: string) => {
    setImportModuleCode(code);
    setActivePage('search');
  };

  const handleNavigate = (page: ActivePage) => {
    if (page !== 'import') {
      setImportModuleCode(undefined);
    }
    if (page === 'news') {
      setUnreadNews(0);
      markNewsRead().catch(() => {});
    }
    setActivePage(page);
  };

  const renderContent = () => {
    switch (activePage) {
      case 'modules':
        return <ModulesPage onModuleOpen={handleModuleOpen} />;
      case 'search':
        return <SearchPage onNavigate={handleNavigate} />;
      case 'import':
        return <ImportPage initialModuleCode={importModuleCode} onNavigate={handleNavigate} />;
      case 'profile':
        return <ProfilePage />;
      case 'news':
        return <NewsPage />;
      case 'feedback':
        return <FeedbackPage />;
      default:
        return <ModulesPage onModuleOpen={handleModuleOpen} />;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Sidebar */}
      <div className="hidden lg:flex w-64 flex-col border-r border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
        <Sidebar>
          <SidebarHeader className="flex-row items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              Н
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                Неоценка
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[160px]">
                {user?.name || 'Пользователь'}
              </span>
            </div>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              <SidebarItem current={activePage === 'modules'} onClick={() => handleNavigate('modules')}>
                <CubeIcon data-slot="icon" />
                <SidebarLabel>Мои модули</SidebarLabel>
              </SidebarItem>

              {/* Module groups */}
              {activeModules.map((mod) => {
                const config = modulesConfig[mod.code];
                if (!config) return null;

                const IconComponent = mod.icon ? heroIconMap[mod.icon] : null;

                return (
                  <SidebarGroup
                    key={mod.id}
                    icon={IconComponent ? <IconComponent data-slot="icon" /> : <CubeIcon data-slot="icon" />}
                    label={config.label}
                    defaultOpen={config.pages.some((p) => p.page === activePage)}
                  >
                    {config.pages.map((p) => (
                      <SidebarItem
                        key={p.page}
                        current={activePage === p.page}
                        onClick={() => handleNavigate(p.page)}
                      >
                        {p.icon}
                        <SidebarLabel>{p.label}</SidebarLabel>
                      </SidebarItem>
                    ))}
                  </SidebarGroup>
                );
              })}

              <SidebarItem current={activePage === 'news'} onClick={() => handleNavigate('news')}>
                <NewspaperIcon data-slot="icon" />
                <SidebarLabel>Новости</SidebarLabel>
                {unreadNews > 0 && (
                  <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                    {unreadNews > 99 ? '99+' : unreadNews}
                  </span>
                )}
              </SidebarItem>

              <SidebarItem current={activePage === 'feedback'} onClick={() => handleNavigate('feedback')}>
                <ChatBubbleLeftRightIcon data-slot="icon" />
                <SidebarLabel>Обратная связь</SidebarLabel>
              </SidebarItem>

              <SidebarItem current={activePage === 'profile'} onClick={() => handleNavigate('profile')}>
                <UserIcon data-slot="icon" />
                <SidebarLabel>Профиль</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            <SidebarSpacer />

            <SidebarSection>
              <SidebarItem onClick={toggleTheme}>
                {theme === 'light' ? (
                  <MoonIcon data-slot="icon" />
                ) : (
                  <SunIcon data-slot="icon" />
                )}
                <SidebarLabel>{theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</SidebarLabel>
              </SidebarItem>
              <SidebarItem onClick={handleLogout}>
                <ArrowLeftOnRectangleIcon data-slot="icon" className="fill-red-500 dark:fill-red-400" />
                <SidebarLabel className="text-red-500 dark:text-red-400">Выход</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
        </Sidebar>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {renderContent()}
      </main>
    </div>
  );
};

export default AppLayout;
