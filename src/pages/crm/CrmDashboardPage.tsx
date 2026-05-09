/**
 * CRM Dashboard — обзор ключевых метрик, воронка, задачи, быстрые действия
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmDashboardStats, CrmTask } from '@/types';
import { Button } from '@/components/catalyst/button';
import {
  CurrencyDollarIcon,
  LightBulbIcon,
  CheckCircleIcon,
  TrophyIcon,
  PlusIcon,
  ArrowPathIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ArrowRightIcon,
} from '@heroicons/react/20/solid';

interface CrmDashboardPageProps {
  onNavigate?: (page: string) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-zinc-200 dark:bg-zinc-700',
  medium: 'bg-blue-200 dark:bg-blue-900/40',
  high: 'bg-amber-200 dark:bg-amber-900/40',
  urgent: 'bg-red-200 dark:bg-red-900/40',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочный',
};

const TASK_TYPE_ICONS: Record<string, React.ReactNode> = {
  call: '📞',
  meeting: '🤝',
  email: '✉️',
  deadline: '⏰',
  reminder: '🔔',
  other: '📋',
};

const fmtMoney = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}К`;
  return n.toLocaleString('ru-RU');
};

const fmtDate = (date: string): string => {
  try {
    const d = new Date(date);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const dateStr = d.toISOString().slice(0, 10);
    if (dateStr === todayStr) return 'Сегодня';
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Завтра';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return date;
  }
};

const CrmDashboardPage: React.FC<CrmDashboardPageProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<CrmDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await crmRepository.getDashboardStats();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    // Подписка на обновления CRM данных
    const handler = () => loadStats();
    window.addEventListener('crm-data-changed', handler);
    return () => window.removeEventListener('crm-data-changed', handler);
  }, [loadStats]);

  if (loading || !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <ArrowPathIcon className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const maxFunnelCount = Math.max(...stats.funnel.map(f => f.count), 1);
  const maxSourceCount = Math.max(...stats.leadsBySource.map(s => s.total), 1);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">CRM Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button color="white" onClick={loadStats}>
              <ArrowPathIcon className="size-4" />
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={<CurrencyDollarIcon className="size-5 text-blue-600 dark:text-blue-400" />}
            label="В работе"
            value={stats.dealsActive}
            subValue={stats.dealsActiveSum ? `${fmtMoney(stats.dealsActiveSum)} ₽` : undefined}
            color="blue"
            onClick={() => onNavigate?.('crm-deals')}
          />
          <KpiCard
            icon={<LightBulbIcon className="size-5 text-amber-600 dark:text-amber-400" />}
            label="Новых лидов"
            value={stats.leadsNew}
            subValue={stats.leadsNew > 0 ? 'требуют обработки' : undefined}
            color="amber"
            onClick={() => onNavigate?.('crm-leads')}
          />
          <KpiCard
            icon={<CheckCircleIcon className="size-5 text-purple-600 dark:text-purple-400" />}
            label="Задачи"
            value={stats.tasksToday + stats.tasksOverdue}
            subValue={
              stats.tasksOverdue > 0
                ? `${stats.tasksOverdue} просрочено`
                : stats.tasksToday > 0
                  ? `${stats.tasksToday} на сегодня`
                  : 'нет срочных'
            }
            color={stats.tasksOverdue > 0 ? 'red' : 'purple'}
            onClick={() => onNavigate?.('crm-tasks')}
          />
          <KpiCard
            icon={<TrophyIcon className="size-5 text-green-600 dark:text-green-400" />}
            label="Выиграно"
            value={stats.dealsWon}
            subValue={stats.dealsWonSum ? `${fmtMoney(stats.dealsWonSum)} ₽` : undefined}
            color="green"
            onClick={() => onNavigate?.('crm-deals')}
          />
        </div>

        {/* Funnel + Leads by source */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Funnel */}
          <div className="lg:col-span-2 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Воронка продаж</h2>
              <button onClick={() => onNavigate?.('crm-kanban')} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                Канбан <ArrowRightIcon className="size-2.5" />
              </button>
            </div>
            {stats.funnel.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-4 text-center">Нет воронок. Создайте в настройках.</div>
            ) : (
              <div className="space-y-2">
                {stats.funnel.map(stage => (
                  <div key={stage.stageId} className="flex items-center gap-3">
                    <div className="w-24 text-[10px] text-zinc-600 dark:text-zinc-400 truncate shrink-0 text-right">{stage.stageName}</div>
                    <div className="flex-1 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all duration-300 flex items-center px-2"
                        style={{
                          width: `${Math.max((stage.count / maxFunnelCount) * 100, stage.count > 0 ? 8 : 0)}%`,
                          backgroundColor: stage.color,
                          opacity: 0.85,
                        }}
                      >
                        <span className="text-[10px] font-bold text-white">{stage.count || ''}</span>
                      </div>
                    </div>
                    <div className="w-20 text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0 text-right">
                      {stage.sum > 0 ? `${fmtMoney(stage.sum)} ₽` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leads by source */}
          <div className="rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Лиды: источники</h2>
              <button onClick={() => onNavigate?.('crm-leads')} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                Все <ArrowRightIcon className="size-2.5" />
              </button>
            </div>
            {stats.leadsBySource.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-4 text-center">Нет лидов</div>
            ) : (
              <div className="space-y-3">
                {stats.leadsBySource.map(src => (
                  <div key={src.source}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                        <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">{src.sourceName}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {src.total} · {src.total > 0 ? Math.round((src.converted / src.total) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(src.total / maxSourceCount) * 100}%`, backgroundColor: src.color, opacity: 0.7 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tasks + Recent Deals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upcoming Tasks */}
          <div className="rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Ближайшие задачи</h2>
              <button onClick={() => onNavigate?.('crm-tasks')} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                Все <ArrowRightIcon className="size-2.5" />
              </button>
            </div>
            {stats.upcomingTasks.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-4 text-center">Нет предстоящих задач</div>
            ) : (
              <div className="space-y-2">
                {stats.upcomingTasks.map(task => {
                  const isOverdue = task.due_date.slice(0, 10) < today;
                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-2 p-2 rounded-lg ${isOverdue ? 'bg-red-50 dark:bg-red-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'} transition-colors`}
                    >
                      <span className="text-sm shrink-0 mt-0.5">{TASK_TYPE_ICONS[task.type] || '📋'}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-medium truncate ${isOverdue ? 'text-red-700 dark:text-red-400' : 'text-zinc-900 dark:text-white'}`}>
                          {isOverdue && <ExclamationTriangleIcon className="size-3 inline mr-1" />}
                          {task.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center gap-0.5 text-[9px] ${isOverdue ? 'text-red-500' : 'text-zinc-400'}`}>
                            <ClockIcon className="size-2.5" />
                            {fmtDate(task.due_date)}
                          </span>
                          <span className={`inline-flex px-1 py-0 rounded text-[8px] font-medium ${PRIORITY_COLORS[task.priority]}`}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Deals */}
          <div className="rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Последние сделки</h2>
              <button onClick={() => onNavigate?.('crm-deals')} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                Все <ArrowRightIcon className="size-2.5" />
              </button>
            </div>
            {stats.recentDeals.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-4 text-center">Нет сделок</div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {stats.recentDeals.map(deal => {
                  const statusLabel: Record<string, { label: string; color: string }> = {
                    active: { label: 'В работе', color: 'text-blue-600 dark:text-blue-400' },
                    won: { label: 'Выиграна', color: 'text-green-600 dark:text-green-400' },
                    lost: { label: 'Проиграна', color: 'text-red-600 dark:text-red-400' },
                    paused: { label: 'Пауза', color: 'text-amber-600 dark:text-amber-400' },
                  };
                  const st = statusLabel[deal.status] || statusLabel.active;
                  return (
                    <div key={deal.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-zinc-900 dark:text-white truncate">{deal.title}</div>
                        <div className="text-[10px] text-zinc-400 truncate">{deal.clientName || '—'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        {deal.amount ? (
                          <div className="text-[11px] font-medium text-green-600 dark:text-green-400">{deal.amount.toLocaleString('ru-RU')} ₽</div>
                        ) : null}
                        <div className={`text-[9px] ${st.color}`}>{st.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Быстрые действия</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onNavigate?.('crm-deals')}>
              <PlusIcon className="size-3.5" /> Сделка
            </Button>
            <Button size="sm" onClick={() => onNavigate?.('crm-leads')}>
              <PlusIcon className="size-3.5" /> Лид
            </Button>
            <Button size="sm" onClick={() => onNavigate?.('crm-clients')}>
              <PlusIcon className="size-3.5" /> Клиент
            </Button>
            <Button size="sm" color="white" onClick={() => onNavigate?.('crm-kanban')}>
              Канбан
            </Button>
            <Button size="sm" color="white" onClick={() => onNavigate?.('crm-calendar')}>
              <CalendarDaysIcon className="size-3.5" /> Календарь
            </Button>
            <Button size="sm" color="white" onClick={() => onNavigate?.('crm-settings')}>
              Запустить парсинг
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── KPI Card Component ────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  subValue?: string;
  color: 'blue' | 'amber' | 'purple' | 'green' | 'red';
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, label, value, subValue, color, onClick }) => {
  const bgMap: Record<string, string> = {
    blue: 'border-blue-200 dark:border-blue-800/40',
    amber: 'border-amber-200 dark:border-amber-800/40',
    purple: 'border-purple-200 dark:border-purple-800/40',
    green: 'border-green-200 dark:border-green-800/40',
    red: 'border-red-200 dark:border-red-800/40',
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-xl bg-white dark:bg-zinc-900 shadow-sm border ${bgMap[color]} p-3 text-left hover:shadow-md transition-shadow w-full`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</div>
      {subValue && <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subValue}</div>}
    </button>
  );
};

export default CrmDashboardPage;
