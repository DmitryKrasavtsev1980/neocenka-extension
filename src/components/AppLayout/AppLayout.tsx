import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentUser, logout, getModules, getNewsUnreadCount, markNewsRead, sendCompanyHeartbeat, type ModuleInfo } from '@/services/api-service';
import { useTheme } from '@/components/ThemeProvider';
import { SearchPage } from '@/pages/search/SearchPage';
import ImportPage from '@/pages/import/ImportPage';
import ModulesPage from '@/components/Modules/ModulesPage';
import ProfilePage from '@/components/Profile/ProfilePage';
import NewsPage from '@/pages/news/NewsPage';
import FeedbackPage from '@/pages/feedback/FeedbackPage';
import { crmRepository } from '@/db/repositories/crm.repository';
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
  MegaphoneIcon,
  CogIcon,
  ClipboardDocumentListIcon,
  ViewColumnsIcon,
  UsersIcon,
  CurrencyDollarIcon,
  LightBulbIcon,
  CheckCircleIcon,
  CalendarDaysIcon,
  ArrowTrendingUpIcon,
  HomeIcon,
} from '@heroicons/react/20/solid';
import { ImportTaskProvider } from '@/contexts/ImportTaskContext';
import { ImportProgressPanel } from '@/components/ImportProgressPanel';
import AdsPage from '@/pages/ads/AdsPage';
import AdsSettingsPage from '@/pages/ads/AdsSettingsPage';
import CrmDealsPage from '@/pages/crm/CrmDealsPage';
import CrmClientsPage from '@/pages/crm/CrmClientsPage';
import CrmLeadsPage from '@/pages/crm/CrmLeadsPage';
import CrmTasksPage from '@/pages/crm/CrmTasksPage';
import CrmCalendarPage from '@/pages/crm/CrmCalendarPage';
import CrmKanbanPage from '@/pages/crm/CrmKanbanPage';
import CrmSettingsPage from '@/pages/crm/CrmSettingsPage';
import CrmBpmnPage from '@/pages/crm/CrmBpmnPage';
import CrmDashboardPage from '@/pages/crm/CrmDashboardPage';

type ActivePage = 'modules' | 'search' | 'import' | 'profile' | 'news' | 'feedback' | 'ads' | 'ads-settings' | 'crm-dashboard' | 'crm-deals' | 'crm-clients' | 'crm-leads' | 'crm-tasks' | 'crm-calendar' | 'crm-kanban' | 'crm-bpmn' | 'crm-settings';

interface ModulePageConfig {
  page: ActivePage;
  label: string;
  icon: React.ReactNode;
  countKey?: 'deals' | 'clients' | 'leads' | 'tasks';
}

interface ModuleConfig {
  label: string;
  pages: ModulePageConfig[];
}

const heroIconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'building-office': BuildingOffice2Icon,
  'megaphone': MegaphoneIcon,
  'clipboard-document-list': ClipboardDocumentListIcon,
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
  ads: {
    label: 'Рекламные объявления',
    pages: [
      {
        page: 'ads',
        label: 'Поиск объявлений',
        icon: <MagnifyingGlassIcon data-slot="icon" />,
      },
      {
        page: 'ads-settings',
        label: 'Настройки',
        icon: <CogIcon data-slot="icon" />,
      },
    ],
  },
  crm: {
    label: 'CRM',
    pages: [
      {
        page: 'crm-dashboard',
        label: 'Дашборд',
        icon: <HomeIcon data-slot="icon" />,
      },
      {
        page: 'crm-deals',
        label: 'Сделки',
        icon: <CurrencyDollarIcon data-slot="icon" />,
        countKey: 'deals' as const,
      },
      {
        page: 'crm-clients',
        label: 'Клиенты',
        icon: <UsersIcon data-slot="icon" />,
        countKey: 'clients' as const,
      },
      {
        page: 'crm-kanban',
        label: 'Канбан',
        icon: <ViewColumnsIcon data-slot="icon" />,
      },
      {
        page: 'crm-leads',
        label: 'Лиды',
        icon: <LightBulbIcon data-slot="icon" />,
        countKey: 'leads' as const,
      },
      {
        page: 'crm-tasks',
        label: 'Задачи',
        icon: <CheckCircleIcon data-slot="icon" />,
        countKey: 'tasks' as const,
      },
      {
        page: 'crm-calendar',
        label: 'Календарь',
        icon: <CalendarDaysIcon data-slot="icon" />,
      },
      {
        page: 'crm-bpmn',
        label: 'BPMN',
        icon: <ArrowTrendingUpIcon data-slot="icon" />,
      },
      {
        page: 'crm-settings',
        label: 'Настройки',
        icon: <CogIcon data-slot="icon" />,
      },
    ],
  },
};

interface SidebarOrder {
  groups: string[];
  items: Record<string, string[]>;
}

const STORAGE_KEY = 'sidebarOrder';

const defaultSidebarOrder: SidebarOrder = {
  groups: ['dealsrosreestr', 'ads', 'crm'],
  items: {
    dealsrosreestr: ['search', 'import'],
    ads: ['ads', 'ads-settings'],
    crm: ['crm-dashboard', 'crm-deals', 'crm-clients', 'crm-kanban', 'crm-leads', 'crm-tasks', 'crm-calendar', 'crm-bpmn', 'crm-settings'],
  },
};

const AppLayout: React.FC = () => {
  const [activePage, setActivePage] = useState<ActivePage>('modules');
  const [importModuleCode, setImportModuleCode] = useState<string | undefined>(undefined);
  const [activeModules, setActiveModules] = useState<ModuleInfo[]>([]);
  const [expiredWarnings, setExpiredWarnings] = useState<{code: string; name: string; graceDate: string}[]>([]);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [unreadNews, setUnreadNews] = useState(0);
  const [crmCounts, setCrmCounts] = useState({ deals: 0, clients: 0, leads: 0, tasks: 0 });
  const [sidebarOrder, setSidebarOrder] = useState<SidebarOrder>(defaultSidebarOrder);
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);
  const user = getCurrentUser();
  const { theme, toggleTheme } = useTheme();

  // Загрузка порядка сайдбара (с мерджем — добавляем новые элементы, которых нет в сохранённом)
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        const saved: SidebarOrder = result[STORAGE_KEY];
        // Добавить новые группы, которых нет в сохранённом порядке
        const groups = [...saved.groups];
        for (const g of defaultSidebarOrder.groups) {
          if (!groups.includes(g)) groups.push(g);
        }
        // Добавить новые пункты внутри каждой группы
        const items: Record<string, string[]> = {};
        for (const groupCode of Object.keys(defaultSidebarOrder.items)) {
          const savedItems = saved.items[groupCode] || [];
          const defaultItems = defaultSidebarOrder.items[groupCode];
          if (!defaultItems) { items[groupCode] = savedItems; continue; }
          const merged = [...savedItems];
          for (const page of defaultItems) {
            if (!merged.includes(page)) merged.push(page);
          }
          items[groupCode] = merged;
        }
        // Сохранить группы, которых нет в default (пользовательские)
        for (const groupCode of Object.keys(saved.items)) {
          if (!items[groupCode]) items[groupCode] = saved.items[groupCode];
        }
        const merged = { groups, items };
        setSidebarOrder(merged);
        // Периодически обновляем хранилище при обнаружении новых элементов
        if (JSON.stringify(merged) !== JSON.stringify(saved)) {
          chrome.storage.local.set({ [STORAGE_KEY]: merged });
        }
      }
    });
  }, []);

  const saveSidebarOrder = useCallback((order: SidebarOrder) => {
    setSidebarOrder(order);
    chrome.storage.local.set({ [STORAGE_KEY]: order });
  }, []);

  const loadCrmCounts = useCallback(async () => {
    try {
      const [deals, clients, leads, tasks] = await Promise.all([
        crmRepository.getDealCount(),
        crmRepository.getClientCount(),
        crmRepository.getLeadCount(),
        crmRepository.getPendingTaskCount(),
      ]);
      setCrmCounts({ deals, clients, leads, tasks });
    } catch { /* ignore */ }
  }, []);

  // Grace period: только если модуль был активен и истёк прямо во время текущей сессии
  const prevActiveCodesRef = useRef<Set<string>>(new Set());
  const graceModulesRef = useRef<Map<string, { name: string; date: string }>>(new Map());

  useEffect(() => {
    if (!user) return;

    const CHECK_INTERVAL = 5 * 60 * 1000; // 5 мин

    const checkModules = async () => {
      try {
        const data = await getModules();
        setIsCompanyAdmin(data.is_company_admin);
        setCompanyName(data.company_name);
        const now = new Date().toISOString().slice(0, 10);
        const warnings: { code: string; name: string; graceDate: string }[] = [];
        const graceActive: ModuleInfo[] = [];
        const newActiveCodes = new Set<string>();

        for (const m of data.modules) {
          const isActive = m.access?.status === 'active';

          if (isActive) {
            newActiveCodes.add(m.code);
            graceModulesRef.current.delete(m.code);
          } else if (prevActiveCodesRef.current.has(m.code)) {
            // Был активен, стал неактивен — начало grace
            if (!graceModulesRef.current.has(m.code)) {
              graceModulesRef.current.set(m.code, { name: m.name, date: now });
            }
          }
        }

        // Модули в grace: доступны если дата = сегодня
        for (const [code, info] of graceModulesRef.current) {
          if (info.date === now) {
            const mod = data.modules.find(m => m.code === code);
            if (mod) {
              graceActive.push(mod);
              warnings.push({ code, name: info.name, graceDate: info.date });
            }
          } else {
            // Grace истёк (наступил следующий день) — убираем
            graceModulesRef.current.delete(code);
          }
        }

        prevActiveCodesRef.current = newActiveCodes;
        const activeFromServer = data.modules.filter((m) => m.access?.status === 'active');
        setActiveModules([...activeFromServer, ...graceActive]);
        setExpiredWarnings(warnings);
      } catch {
        // Ошибка сети — не меняем состояние
      }
    };

    checkModules();
    const interval = setInterval(checkModules, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [user]);

  // Heartbeat для concurrent корпоративных лицензий
  useEffect(() => {
    if (!user || activeModules.length === 0) return;

    const HEARTBEAT_INTERVAL = 60 * 1000; // 1 минута

    const sendHeartbeats = () => {
      for (const mod of activeModules) {
        if (mod.access?.source === 'company' && mod.access?.license_type === 'concurrent') {
          sendCompanyHeartbeat(mod.code).catch(() => {});
        }
      }
    };

    sendHeartbeats();
    const hbInterval = setInterval(sendHeartbeats, HEARTBEAT_INTERVAL);
    return () => clearInterval(hbInterval);
  }, [user, activeModules]);

  useEffect(() => {
    if (!user) return;
    getNewsUnreadCount()
      .then((data) => setUnreadNews(data.unread_count))
      .catch(() => {});
    loadCrmCounts();
  }, [user, loadCrmCounts]);

  // Подписка на событие изменения CRM данных (для обновления счётчиков)
  useEffect(() => {
    const handler = () => loadCrmCounts();
    window.addEventListener('crm-data-changed', handler);
    return () => window.removeEventListener('crm-data-changed', handler);
  }, [loadCrmCounts]);

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  const handleModuleOpen = (code: string) => {
    if (code === 'ads') {
      setActivePage('ads');
    } else if (code === 'crm') {
      setActivePage('crm-dashboard');
    } else {
      setImportModuleCode(code);
      setActivePage('search');
    }
  };

  const handleNavigate = (page: ActivePage) => {
    if (page !== 'import') {
      setImportModuleCode(undefined);
    }
    if (page === 'news') {
      setUnreadNews(0);
      markNewsRead().catch(() => {});
    }
    // Обновляем счётчики CRM при навигации на CRM-страницы
    if (page.startsWith('crm-')) {
      loadCrmCounts();
    }
    setActivePage(page);
  };

  const renderContent = () => {
    switch (activePage) {
      case 'modules':
        return <ModulesPage onModuleOpen={handleModuleOpen} isCompanyAdmin={isCompanyAdmin} />;
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
      case 'ads':
        return <AdsPage onNavigate={handleNavigate} />;
      case 'ads-settings':
        return <AdsSettingsPage />;
      case 'crm-deals':
        return <CrmDealsPage onNavigate={handleNavigate} />;
      case 'crm-clients':
        return <CrmClientsPage onNavigate={handleNavigate} />;
      case 'crm-dashboard':
        return <CrmDashboardPage onNavigate={handleNavigate} />;
      case 'crm-kanban':
        return <CrmKanbanPage />;
      case 'crm-leads':
        return <CrmLeadsPage onNavigate={handleNavigate} />;
      case 'crm-tasks':
        return <CrmTasksPage />;
      case 'crm-calendar':
        return <CrmCalendarPage />;
      case 'crm-bpmn':
        return <CrmBpmnPage />;
      case 'crm-settings':
        return <CrmSettingsPage />;
      default:
        return <ModulesPage onModuleOpen={handleModuleOpen} isCompanyAdmin={isCompanyAdmin} />;
    }
  };

  return (
    <ImportTaskProvider>
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
              {companyName && (
                <span className="mt-0.5 inline-flex items-center gap-1 self-start rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  <BuildingOffice2Icon className="size-3" />
                  {companyName}{isCompanyAdmin ? ' · Админ' : ''}
                </span>
              )}
            </div>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              <SidebarItem current={activePage === 'modules'} onClick={() => handleNavigate('modules')}>
                <CubeIcon data-slot="icon" />
                <SidebarLabel>Мои модули</SidebarLabel>
              </SidebarItem>

              {/* Module groups — sortable via drag-and-drop */}
              {(() => {
                // Сортируем модули по сохранённому порядку
                const sorted = [...activeModules].sort((a, b) => {
                  const ai = sidebarOrder.groups.indexOf(a.code);
                  const bi = sidebarOrder.groups.indexOf(b.code);
                  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                });

                const handleGroupDragStart = (code: string) => {
                  dragItem.current = `group:${code}`;
                };

                const handleGroupDrop = (targetCode: string) => {
                  if (!dragItem.current?.startsWith('group:')) return;
                  const srcCode = dragItem.current.replace('group:', '');
                  if (srcCode === targetCode) return;
                  const groups = [...sidebarOrder.groups];
                  const srcIdx = groups.indexOf(srcCode);
                  const tgtIdx = groups.indexOf(targetCode);
                  if (srcIdx === -1 || tgtIdx === -1) return;
                  groups.splice(srcIdx, 1);
                  groups.splice(tgtIdx, 0, srcCode);
                  saveSidebarOrder({ ...sidebarOrder, groups });
                  dragItem.current = null;
                };

                const handleItemDragStart = (page: string) => {
                  dragItem.current = `item:${page}`;
                };

                const handleItemDrop = (groupCode: string, targetPage: string) => {
                  if (!dragItem.current?.startsWith('item:')) return;
                  const srcPage = dragItem.current.replace('item:', '');
                  if (srcPage === targetPage) return;
                  const items = [...(sidebarOrder.items[groupCode] || [])];
                  const srcIdx = items.indexOf(srcPage);
                  const tgtIdx = items.indexOf(targetPage);
                  if (tgtIdx === -1) return;
                  if (srcIdx === -1) {
                    // Новый элемент — вставляем перед target
                    items.splice(tgtIdx, 0, srcPage);
                  } else {
                    items.splice(srcIdx, 1);
                    items.splice(tgtIdx > srcIdx ? tgtIdx - 1 : tgtIdx, 0, srcPage);
                  }
                  saveSidebarOrder({ ...sidebarOrder, items: { ...sidebarOrder.items, [groupCode]: items } });
                  dragItem.current = null;
                };

                return sorted.map((mod) => {
                  const config = modulesConfig[mod.code];
                  if (!config) return null;

                  const IconComponent = mod.icon ? heroIconMap[mod.icon] : null;

                  // Сортируем страницы внутри группы по сохранённому порядку
                  const itemOrder = sidebarOrder.items[mod.code] || [];
                  const sortedPages = [...config.pages].sort((a, b) => {
                    const ai = itemOrder.indexOf(a.page);
                    const bi = itemOrder.indexOf(b.page);
                    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                  });

                  return (
                    <div
                      key={mod.id}
                      draggable
                      onDragStart={() => handleGroupDragStart(mod.code)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleGroupDrop(mod.code)}
                      className="rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <SidebarGroup
                        icon={IconComponent ? <IconComponent data-slot="icon" /> : <CubeIcon data-slot="icon" />}
                        label={config.label}
                        defaultOpen={config.pages.some((p) => p.page === activePage)}
                      >
                        {sortedPages.map((p) => (
                          <div
                            key={p.page}
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); handleItemDragStart(p.page); }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => { e.stopPropagation(); handleItemDrop(mod.code, p.page); }}
                          >
                            <SidebarItem
                              current={activePage === p.page}
                              onClick={() => handleNavigate(p.page)}
                            >
                              {p.icon}
                              <SidebarLabel>{p.label}</SidebarLabel>
                              {p.countKey && crmCounts[p.countKey] > 0 && (
                                <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                                  {crmCounts[p.countKey] > 99 ? '99+' : crmCounts[p.countKey]}
                                </span>
                              )}
                            </SidebarItem>
                          </div>
                        ))}
                      </SidebarGroup>
                    </div>
                  );
                });
              })()}

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

            <ImportProgressPanel />

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
        {expiredWarnings.length > 0 && (() => {
          const hasCompanyModules = activeModules.some(m => m.access?.source === 'company');
          const isNonAdminCompanyUser = !isCompanyAdmin && hasCompanyModules;
          return !isNonAdminCompanyUser;
        })() && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <svg className="size-5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span>
                Подписка на <strong>{expiredWarnings.map(w => w.name).join(', ')}</strong> истекла. Доступ сохранён до конца дня.
              </span>
            </div>
          </div>
        )}
        {renderContent()}
      </main>
    </div>
    </ImportTaskProvider>
  );
};

export default AppLayout;
