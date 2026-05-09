/**
 * Страница Задач CRM
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmTask, CrmClient, CrmDeal, CrmTaskFilters } from '@/types';
import { Button } from '@/components/catalyst/button';
import {
  PlusIcon,
  TrashIcon,
  FunnelIcon,
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/16/solid';

interface CrmTasksPageProps {
  onNavigate?: (page: string) => void;
}

const TASK_TYPE: Record<string, { label: string; color: string }> = {
  call: { label: 'Звонок', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  meeting: { label: 'Встреча', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  email: { label: 'Письмо', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  deadline: { label: 'Дедлайн', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  reminder: { label: 'Напоминание', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  other: { label: 'Другое', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
};

const TASK_PRIORITY: Record<string, { label: string; color: string }> = {
  low: { label: 'Низкий', color: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400' },
  medium: { label: 'Средний', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  high: { label: 'Высокий', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  urgent: { label: 'Срочный', color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидает', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  in_progress: { label: 'В работе', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'Завершена', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Отменена', color: 'bg-gray-100 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400' },
};

const PAGE_SIZE = 30;

const CrmTasksPage: React.FC<CrmTasksPageProps> = () => {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [clientsMap, setClientsMap] = useState<Record<number, CrmClient>>({});
  const [dealsMap, setDealsMap] = useState<Record<number, CrmDeal>>({});

  // Статистика
  const [pendingCount, setPendingCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  // Фильтры
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Модалка
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<CrmTask | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<CrmTask['type']>('call');
  const [formPriority, setFormPriority] = useState<CrmTask['priority']>('medium');
  const [formDueDate, setFormDueDate] = useState('');
  const [formClientId, setFormClientId] = useState<number | undefined>(undefined);
  const [formDealId, setFormDealId] = useState<number | undefined>(undefined);

  const filters: CrmTaskFilters = {
    search: search || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    priority: priorityFilter || undefined,
  };

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await crmRepository.getTasks(filters, page, PAGE_SIZE);
      setTasks(result.tasks);
      setTotalTasks(result.total);

      // Собираем client_id и deal_id
      const clientIds = new Set<number>();
      const dealIds = new Set<number>();
      for (const t of result.tasks) {
        if (t.client_id) clientIds.add(t.client_id);
        if (t.deal_id) dealIds.add(t.deal_id);
      }

      if (clientIds.size > 0) {
        const clients = await Promise.all([...clientIds].map(id => crmRepository.getClient(id)));
        setClientsMap(prev => ({
          ...prev,
          ...Object.fromEntries(clients.filter(Boolean).map(c => [c!.id, c!])),
        }));
      }

      if (dealIds.size > 0) {
        const deals = await Promise.all([...dealIds].map(id => crmRepository.getDeal(id)));
        setDealsMap(prev => ({
          ...prev,
          ...Object.fromEntries(deals.filter(Boolean).map(d => [d!.id, d!])),
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, priorityFilter, page]);

  const loadStats = useCallback(async () => {
    const [pending, overdue] = await Promise.all([
      crmRepository.getPendingTaskCount(),
      crmRepository.getOverdueTaskCount(),
    ]);
    setPendingCount(pending);
    setOverdueCount(overdue);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const totalPages = Math.ceil(totalTasks / PAGE_SIZE);

  const openCreateModal = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormType('call');
    setFormPriority('medium');
    setFormDueDate(new Date().toISOString().slice(0, 16));
    setFormClientId(undefined);
    setFormDealId(undefined);
    setShowModal(true);
  };

  const openEditModal = (task: CrmTask) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || '');
    setFormType(task.type);
    setFormPriority(task.priority);
    setFormDueDate(task.due_date.slice(0, 16));
    setFormClientId(task.client_id);
    setFormDealId(task.deal_id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formDueDate) return;

    const now = new Date().toISOString();
    const dueDate = new Date(formDueDate).toISOString();

    if (editingTask) {
      await crmRepository.updateTask(editingTask.id!, {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        type: formType,
        priority: formPriority,
        due_date: dueDate,
        client_id: formClientId,
        deal_id: formDealId,
      });
    } else {
      await crmRepository.addTask({
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        type: formType,
        priority: formPriority,
        status: 'pending',
        due_date: dueDate,
        client_id: formClientId,
        deal_id: formDealId,
        created_at: now,
        updated_at: now,
      });
    }

    setShowModal(false);
    await loadTasks();
    await loadStats();
  };

  const handleComplete = async (id: number) => {
    await crmRepository.completeTask(id);
    await loadTasks();
    await loadStats();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить задачу?')) return;
    await crmRepository.deleteTask(id);
    await loadTasks();
    await loadStats();
  };

  const isOverdue = (task: CrmTask) => {
    return (task.status === 'pending' || task.status === 'in_progress') && task.due_date < new Date().toISOString();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const hasActiveFilters = statusFilter || typeFilter || priorityFilter;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
        {/* Заголовок */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Задачи</h1>
          </div>

          {/* Статистика */}
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 font-medium text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
              <ClockIcon className="h-3.5 w-3.5" />
              {pendingCount} активных
            </span>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {overdueCount} просрочено
              </span>
            )}
          </div>

          <Button color="dark" size="sm" onClick={openCreateModal}>
            <PlusIcon className="h-4 w-4" />
            Задача
          </Button>
        </div>

        {/* Поиск и фильтры */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Поиск по задачам..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-64 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          <Button
            color={showFilters || hasActiveFilters ? 'dark' : 'light'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FunnelIcon className="h-4 w-4" />
            Фильтры
            {hasActiveFilters && (
              <span className="ml-1 rounded-full bg-blue-500 px-1.5 text-[10px] text-white">
                {(statusFilter ? 1 : 0) + (typeFilter ? 1 : 0) + (priorityFilter ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>

        {showFilters && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="">Все статусы</option>
              {Object.entries(TASK_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="">Все типы</option>
              {Object.entries(TASK_TYPE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="">Все приоритеты</option>
              {Object.entries(TASK_PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <Button
                size="sm"
                color="light"
                onClick={() => { setStatusFilter(''); setTypeFilter(''); setPriorityFilter(''); setPage(1); }}
              >
                <XMarkIcon className="h-4 w-4" />
                Сбросить
              </Button>
            )}
          </div>
        )}

        {/* Таблица */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Задача</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Тип</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Приоритет</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Срок</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Привязка</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Статус</th>
                  <th className="px-4 py-2.5 text-right font-medium text-zinc-500 dark:text-zinc-400">Действия</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                      Загрузка...
                    </td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                      {hasActiveFilters || search ? 'Ничего не найдено' : 'Нет задач. Создайте первую!'}
                    </td>
                  </tr>
                ) : (
                  tasks.map(task => {
                    const overdue = isOverdue(task);
                    return (
                      <tr
                        key={task.id}
                        className={`border-b border-zinc-50 transition-colors hover:bg-zinc-50/50 dark:border-zinc-800 dark:hover:bg-zinc-800/30 ${
                          overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-zinc-900 dark:text-white">{task.title}</div>
                          {task.description && (
                            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">{task.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TASK_TYPE[task.type]?.color || ''}`}>
                            {TASK_TYPE[task.type]?.label || task.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TASK_PRIORITY[task.priority]?.color || ''}`}>
                            {TASK_PRIORITY[task.priority]?.label || task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className={`text-sm ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}>
                            {formatDateTime(task.due_date)}
                          </div>
                          {overdue && <div className="text-[10px] text-red-500">Просрочено</div>}
                        </td>
                        <td className="px-4 py-2.5">
                          {task.client_id && clientsMap[task.client_id] && (
                            <div className="text-xs text-zinc-600 dark:text-zinc-400">
                              {clientsMap[task.client_id].full_name}
                            </div>
                          )}
                          {task.deal_id && dealsMap[task.deal_id] && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-500">
                              {dealsMap[task.deal_id].title}
                            </div>
                          )}
                          {!task.client_id && !task.deal_id && (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TASK_STATUS[task.status]?.color || ''}`}>
                            {TASK_STATUS[task.status]?.label || task.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {(task.status === 'pending' || task.status === 'in_progress') && (
                              <button
                                onClick={() => handleComplete(task.id!)}
                                className="rounded p-1 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                                title="Завершить"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(task)}
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                              title="Редактировать"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(task.id!)}
                              className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                              title="Удалить"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Всего: {totalTasks}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  color="light"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ←
                </Button>
                <span className="px-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  color="light"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  →
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модалка создания/редактирования */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div
            className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">
              {editingTask ? 'Редактировать задачу' : 'Новая задача'}
            </h2>

            <div className="space-y-3">
              {/* Название */}
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

              {/* Тип и Приоритет */}
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
                    {Object.entries(TASK_PRIORITY).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Срок */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Срок выполнения *</label>
                <input
                  type="datetime-local"
                  value={formDueDate}
                  onChange={e => setFormDueDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              {/* Описание */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Описание</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white resize-none"
                  placeholder="Детали задачи..."
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button color="light" onClick={() => setShowModal(false)}>Отмена</Button>
              <Button
                color="dark"
                onClick={handleSave}
                disabled={!formTitle.trim() || !formDueDate}
              >
                {editingTask ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmTasksPage;
