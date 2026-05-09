/**
 * Страница Календаря CRM — месячный вид с задачами
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmTask, CrmClient, CrmDeal } from '@/types';
import { Button } from '@/components/catalyst/button';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  CheckCircleIcon,
} from '@heroicons/react/16/solid';

interface CrmCalendarPageProps {
  onNavigate?: (page: string) => void;
}

const TASK_TYPE: Record<string, { label: string; dot: string }> = {
  call: { label: 'Звонок', dot: 'bg-blue-500' },
  meeting: { label: 'Встреча', dot: 'bg-purple-500' },
  email: { label: 'Письмо', dot: 'bg-cyan-500' },
  deadline: { label: 'Дедлайн', dot: 'bg-red-500' },
  reminder: { label: 'Напоминание', dot: 'bg-yellow-500' },
  other: { label: 'Другое', dot: 'bg-gray-500' },
};

const PRIORITY_MARK: Record<string, string> = {
  low: '',
  medium: '',
  high: '!',
  urgent: '!!',
};

const DAYS_OF_WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function getMonthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  // Понедельник = 0
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matrix: (Date | null)[][] = [];
  let row: (Date | null)[] = [];

  for (let i = 0; i < startDow; i++) row.push(null);

  for (let d = 1; d <= daysInMonth; d++) {
    row.push(new Date(year, month, d));
    if (row.length === 7) {
      matrix.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push(null);
    matrix.push(row);
  }

  return matrix;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

const CrmCalendarPage: React.FC<CrmCalendarPageProps> = () => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsMap, setClientsMap] = useState<Record<number, CrmClient>>({});
  const [dealsMap, setDealsMap] = useState<Record<number, CrmDeal>>({});

  // Модалка дня
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Модалка создания задачи
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<CrmTask['type']>('call');
  const [formPriority, setFormPriority] = useState<CrmTask['priority']>('medium');
  const [formDueDate, setFormDueDate] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const matrix = useMemo(() => getMonthMatrix(year, month), [year, month]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      // Загружаем задачи за весь месяц + пара дней запаса
      const dateFrom = new Date(year, month, 1).toISOString();
      const dateTo = new Date(year, month + 1, 1).toISOString();
      const result = await crmRepository.getTasksByDateRange(dateFrom, dateTo);
      setTasks(result);

      // Загружаем клиентов и сделки
      const clientIds = new Set<number>();
      const dealIds = new Set<number>();
      for (const t of result) {
        if (t.client_id) clientIds.add(t.client_id);
        if (t.deal_id) dealIds.add(t.deal_id);
      }
      if (clientIds.size > 0) {
        const clients = await Promise.all([...clientIds].map(id => crmRepository.getClient(id)));
        setClientsMap(Object.fromEntries(clients.filter(Boolean).map(c => [c!.id, c!])));
      }
      if (dealIds.size > 0) {
        const deals = await Promise.all([...dealIds].map(id => crmRepository.getDeal(id)));
        setDealsMap(Object.fromEntries(deals.filter(Boolean).map(d => [d!.id, d!])));
      }
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Группируем задачи по дням
  const tasksByDay = useMemo(() => {
    const map: Record<string, CrmTask[]> = {};
    for (const t of tasks) {
      const d = new Date(t.due_date);
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    // Сортируем по времени внутри каждого дня
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.due_date.localeCompare(b.due_date));
    }
    return map;
  }, [tasks]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleComplete = async (id: number) => {
    await crmRepository.completeTask(id);
    await loadTasks();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить задачу?')) return;
    await crmRepository.deleteTask(id);
    await loadTasks();
  };

  const openCreateForDay = (dayKey: string) => {
    setFormTitle('');
    setFormDescription('');
    setFormType('call');
    setFormPriority('medium');
    setFormDueDate(dayKey + 'T10:00');
    setShowCreateModal(true);
  };

  const handleCreateTask = async () => {
    if (!formTitle.trim() || !formDueDate) return;
    const now = new Date().toISOString();
    await crmRepository.addTask({
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      type: formType,
      priority: formPriority,
      status: 'pending',
      due_date: new Date(formDueDate).toISOString(),
      created_at: now,
      updated_at: now,
    });
    setShowCreateModal(false);
    await loadTasks();
  };

  const selectedDayTasks = selectedDay ? (tasksByDay[selectedDay] || []) : [];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const isOverdue = (task: CrmTask) => {
    return (task.status === 'pending' || task.status === 'in_progress') && task.due_date < new Date().toISOString();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
        {/* Заголовок */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Календарь</h1>
          </div>
          <Button color="light" size="sm" onClick={goToToday}>Сегодня</Button>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[160px] text-center text-sm font-medium text-zinc-900 dark:text-white">
              {MONTHS[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Легенда */}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          {Object.entries(TASK_TYPE).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${v.dot}`} />
              {v.label}
            </span>
          ))}
        </div>

        {/* Календарная сетка */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          {/* Дни недели */}
          <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-800/50">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {d}
              </div>
            ))}
          </div>

          {/* Ячейки */}
          {loading ? (
            <div className="px-4 py-12 text-center text-zinc-400 text-sm">Загрузка...</div>
          ) : (
            matrix.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-zinc-50 last:border-b-0 dark:border-zinc-800">
                {week.map((day, di) => {
                  if (!day) {
                    return <div key={di} className="min-h-[100px] bg-zinc-50/30 dark:bg-zinc-800/20" />;
                  }
                  const dk = dateKey(day);
                  const dayTasks = tasksByDay[dk] || [];
                  const today = isToday(day);
                  const isCurrentMonth = day.getMonth() === month;

                  return (
                    <div
                      key={di}
                      className={`min-h-[100px] border-r border-zinc-50 p-1.5 transition-colors last:border-r-0 dark:border-zinc-800 cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10 ${
                        !isCurrentMonth ? 'opacity-40' : ''
                      }`}
                      onClick={() => setSelectedDay(dk)}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                            today
                              ? 'bg-blue-500 text-white'
                              : 'text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {dayTasks.length > 0 && (
                          <span className="text-[10px] text-zinc-400">{dayTasks.length}</span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, 3).map(task => {
                          const tt = TASK_TYPE[task.type] || TASK_TYPE.other;
                          return (
                            <div
                              key={task.id}
                              className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight ${
                                task.status === 'completed'
                                  ? 'bg-green-50 text-green-600 line-through dark:bg-green-900/20 dark:text-green-400'
                                  : isOverdue(task)
                                  ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                              }`}
                            >
                              <span className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${tt.dot}`} />
                              <span className="truncate">{task.title}</span>
                            </div>
                          );
                        })}
                        {dayTasks.length > 3 && (
                          <div className="text-[10px] text-zinc-400 pl-1">+{dayTasks.length - 3}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Модалка дня — список задач */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedDay(null)}>
          <div
            className="mx-4 w-full max-w-md max-h-[80vh] rounded-xl bg-white shadow-xl dark:bg-zinc-900 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                {new Date(selectedDay + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex items-center gap-1">
                <Button size="sm" color="light" onClick={() => openCreateForDay(selectedDay)}>
                  <PlusIcon className="h-3.5 w-3.5" />
                  Задача
                </Button>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedDayTasks.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-400">Нет задач на этот день</div>
              ) : (
                selectedDayTasks.map(task => {
                  const tt = TASK_TYPE[task.type] || TASK_TYPE.other;
                  const overdue = isOverdue(task);
                  return (
                    <div
                      key={task.id}
                      className={`rounded-lg border p-3 ${
                        task.status === 'completed'
                          ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10'
                          : overdue
                          ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
                          : 'border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${tt.dot}`} />
                            <span className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                              {task.title}
                            </span>
                            {PRIORITY_MARK[task.priority] && (
                              <span className="text-[10px] font-bold text-red-500">{PRIORITY_MARK[task.priority]}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span>{formatTime(task.due_date)}</span>
                            <span>{tt.label}</span>
                            {task.client_id && clientsMap[task.client_id] && (
                              <span>{clientsMap[task.client_id].full_name}</span>
                            )}
                          </div>
                          {task.description && (
                            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{task.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {(task.status === 'pending' || task.status === 'in_progress') && (
                            <button
                              onClick={() => handleComplete(task.id!)}
                              className="rounded p-1 text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/20"
                              title="Завершить"
                            >
                              <CheckCircleIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(task.id!)}
                            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            title="Удалить"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модалка создания задачи */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowCreateModal(false)}>
          <div
            className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Новая задача</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Название *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="Позвонить клиенту..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Тип</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as CrmTask['type'])}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    {Object.entries(TASK_TYPE).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Приоритет</label>
                  <select
                    value={formPriority}
                    onChange={e => setFormPriority(e.target.value as CrmTask['priority'])}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                    <option value="urgent">Срочный</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Срок выполнения *</label>
                <input
                  type="datetime-local"
                  value={formDueDate}
                  onChange={e => setFormDueDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Описание</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white resize-none"
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button color="light" onClick={() => setShowCreateModal(false)}>Отмена</Button>
              <Button color="dark" onClick={handleCreateTask} disabled={!formTitle.trim() || !formDueDate}>
                Создать
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmCalendarPage;
