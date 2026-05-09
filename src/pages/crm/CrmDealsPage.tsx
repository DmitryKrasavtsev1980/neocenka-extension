/**
 * Страница Сделок CRM — список сделок + управление
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import type {
  CrmClient,
  CrmDeal,
  CrmPipeline,
  CrmStage,
  CrmClientAdData,
  CrmDealFilters,
  CrmSource,
} from '@/types';
import { Button } from '@/components/catalyst/button';
import CrmChatPage from './CrmChatPage';
import {
  FunnelIcon,
  PlusIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/16/solid';

interface CrmPageProps {
  onNavigate?: (page: string) => void;
}

const CLIENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активный', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  paused: { label: 'Пауза', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  closed: { label: 'Закрыт', color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400' },
};

const DEAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активная', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  won: { label: 'Выиграна', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  lost: { label: 'Проиграна', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  paused: { label: 'Пауза', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

const PAGE_SIZE = 30;

const CrmDealsPage: React.FC<CrmPageProps> = ({ onNavigate }) => {
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<number, CrmClient>>({});
  const [totalDeals, setTotalDeals] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<number, CrmStage[]>>({});
  const [sourcesMap, setSourcesMap] = useState<Record<string, CrmSource>>({});

  // Фильтры
  const [filters, setFilters] = useState<CrmDealFilters>({});
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Модалка сделки
  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<CrmDeal | null>(null);

  // Чат с клиентом
  const [chatClient, setChatClient] = useState<CrmClient | null>(null);

  const loadPipelines = useCallback(async () => {
    const pips = await crmRepository.getPipelines();
    setPipelines(pips);
    const map: Record<number, CrmStage[]> = {};
    for (const p of pips) {
      if (p.id) map[p.id] = await crmRepository.getStages(p.id);
    }
    setStagesMap(map);

    await crmRepository.ensureDefaultSources();
    const srcs = await crmRepository.getSources();
    setSourcesMap(Object.fromEntries(srcs.map(s => [s.code, s])));
  }, []);

  const loadClientsMap = useCallback(async () => {
    const allClients = await crmRepository.searchClients({}, 1, 99999);
    const map: Record<number, CrmClient> = {};
    for (const c of allClients.clients) {
      if (c.id) map[c.id] = c;
    }
    setClientsMap(map);
  }, []);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const result = await crmRepository.searchDeals(filters, page, PAGE_SIZE);
      setDeals(result.deals);
      setTotalDeals(result.total);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    crmRepository.ensureDefaultPipeline().then(() => {
      loadPipelines();
      loadClientsMap();
    });
  }, [loadPipelines, loadClientsMap]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, search }));
    setPage(1);
  };

  const handleFilterChange = (key: keyof CrmDealFilters, value: string | number | undefined) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === '' || value === undefined) {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearch('');
    setPage(1);
  };

  const getStageName = (pipelineId: number, stageId: number): string => {
    const stages = stagesMap[pipelineId] || [];
    return stages.find(s => s.id === stageId)?.name || '—';
  };

  const getPipelineName = (pipelineId: number): string => {
    return pipelines.find(p => p.id === pipelineId)?.name || '—';
  };

  const fmtDate = (date: string | null): string => {
    if (!date) return '—';
    try { return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return date; }
  };

  const fmtAmount = (amount?: number): string => {
    if (!amount) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);
  };

  const totalPages = Math.ceil(totalDeals / PAGE_SIZE);

  // Статистика
  const [stats, setStats] = useState<Record<string, number>>({});
  useEffect(() => {
    const loadStats = async () => {
      const allDeals = await crmRepository.searchDeals({}, 1, 99999);
      const counts: Record<string, number> = {};
      for (const d of allDeals.deals) {
        counts[d.status] = (counts[d.status] || 0) + 1;
      }
      setStats(counts);
    };
    loadStats();
  }, [loadDeals]);

  const handleSaveDeal = async (data: Omit<CrmDeal, 'id'>) => {
    if (editingDeal?.id) {
      await crmRepository.updateDeal(editingDeal.id, data);
    } else {
      await crmRepository.addDeal(data);
    }
    setShowDealModal(false);
    setEditingDeal(null);
    loadDeals();
    loadClientsMap();
  };

  const handleDeleteDeal = async (id: number) => {
    await crmRepository.deleteDeal(id);
    loadDeals();
  };

  const defaultPipeline = pipelines.find(p => p.is_default) || pipelines[0];
  const defaultStages = defaultPipeline ? (stagesMap[defaultPipeline.id!] || []) : [];
  const firstStage = defaultStages[0];

  // Чат — отдельный fullscreen режим
  if (chatClient) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
          <CrmChatPage client={chatClient} onBack={() => setChatClient(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              CRM
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                {totalDeals} сделок
                {stats.active ? ` · ${stats.active} акт.` : ''}
                {stats.won ? ` · ${stats.won} выигр.` : ''}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Поиск по сделке/клиенту..."
              className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-white w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={() => setShowFilters(!showFilters)}>
              <FunnelIcon className="size-4" />
              {showFilters ? 'Скрыть' : 'Фильтры'}
            </Button>
            <Button color="white" onClick={() => { setEditingDeal(null); setShowDealModal(true); }}>
              <PlusIcon className="size-4" />
              Сделка
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="space-y-3 mb-4">
            {/* Основной фильтр — синяя панель */}
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase">Фильтр</h4>
                <button onClick={clearFilters} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-white">
                  <XMarkIcon className="size-3" />
                  Очистить все
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                {/* Воронка */}
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Воронка</label>
                  <select
                    value={filters.pipeline_id?.toString() || ''}
                    onChange={e => handleFilterChange('pipeline_id', e.target.value ? Number(e.target.value) : undefined)}
                    className="rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                  >
                    <option value="">Все</option>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* Статус сделки */}
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Статус</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleFilterChange('status', undefined)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${!filters.status ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-700'}`}
                    >Все</button>
                    {Object.entries(DEAL_STATUS_LABELS).map(([v, { label }]) => (
                      <button
                        key={v}
                        onClick={() => handleFilterChange('status', v)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${filters.status === v ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-700'}`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{loading ? 'Загрузка...' : `Всего: ${totalDeals}`}</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr className="text-left text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-3 py-2">Сделка</th>
                  <th className="px-3 py-2">Клиент</th>
                  <th className="px-3 py-2">Телефон</th>
                  <th className="px-3 py-2">Воронка / Этап</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Сумма</th>
                  <th className="px-3 py-2">Создана</th>
                  <th className="px-3 py-2 w-32 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {!loading && deals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-zinc-400 text-sm">
                      Нет сделок. Нажмите «Сделка» для добавления.
                    </td>
                  </tr>
                ) : deals.map(deal => {
                  const client = clientsMap[deal.client_id];
                  const statusInfo = DEAL_STATUS_LABELS[deal.status] || DEAL_STATUS_LABELS.active;
                  return (
                    <tr
                      key={deal.id}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      onClick={() => { setEditingDeal(deal); setShowDealModal(true); }}
                    >
                      <td className="px-3 py-2 text-[11px] font-medium text-zinc-900 dark:text-white whitespace-nowrap max-w-[200px] truncate">{deal.title || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-[150px] truncate">
                        {client?.full_name || '—'}
                        {client?.source && (
                          <span
                            className="ml-1 inline-flex px-1 py-0 rounded text-[9px] font-medium"
                            style={{ backgroundColor: sourcesMap[client.source]?.color ? `${sourcesMap[client.source].color}20` : undefined, color: sourcesMap[client.source]?.color || undefined }}
                          >
                            {sourcesMap[client.source]?.name || client.source}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{client?.phone || '—'}</td>
                      <td className="px-3 py-2 text-[11px]">
                        <div className="text-zinc-700 dark:text-zinc-300">{getPipelineName(deal.pipeline_id)}</div>
                        <div className="text-[10px] text-zinc-400">{getStageName(deal.pipeline_id, deal.stage_id)}</div>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{fmtAmount(deal.amount)}</td>
                      <td className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap">{fmtDate(deal.created_at)}</td>
                      <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {client && (
                            <button onClick={() => setChatClient(client)} className="p-1 rounded text-zinc-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20" title="Чат">
                              <ChatBubbleLeftRightIcon className="size-3.5" />
                            </button>
                          )}
                          <button onClick={() => { setEditingDeal(deal); setShowDealModal(true); }} className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Редактировать">
                            <PencilSquareIcon className="size-3.5" />
                          </button>
                          <button onClick={() => { if (confirm('Удалить сделку?')) handleDeleteDeal(deal.id!); }} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Удалить">
                            <TrashIcon className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-700">
              <span className="text-[11px] text-zinc-500">{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalDeals)} из {totalDeals}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Назад</button>
                <span className="px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-400">{page}/{totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Далее</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deal Modal */}
      {showDealModal && (
        <CrmDealModal
          deal={editingDeal}
          clientsMap={clientsMap}
          pipelines={pipelines}
          stagesMap={stagesMap}
          sourcesMap={sourcesMap}
          defaultPipeline={defaultPipeline}
          defaultStage={firstStage}
          onSave={handleSaveDeal}
          onClose={() => { setShowDealModal(false); setEditingDeal(null); }}
        />
      )}

    </div>
  );
};

// ─── Phone Mask Helper ─────────────────────────────────────
const handlePhoneChange = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  const d = digits.startsWith('8') ? digits.slice(1) : digits.startsWith('7') ? digits.slice(1) : digits;
  let formatted = '+7';
  if (d.length > 0) formatted += ' (' + d.slice(0, 3);
  if (d.length >= 3) formatted += ') ' + d.slice(3, 6);
  if (d.length > 6) formatted += '-' + d.slice(6, 8);
  if (d.length > 8) formatted += '-' + d.slice(8, 10);
  return formatted;
};

// ─── Form Field Component ──────────────────────────────────
const FormField: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div>
    <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// ─── Deal Modal Component ──────────────────────────────────
const CrmDealModal: React.FC<{
  deal: CrmDeal | null;
  clientsMap: Record<number, CrmClient>;
  pipelines: CrmPipeline[];
  stagesMap: Record<number, CrmStage[]>;
  sourcesMap: Record<string, CrmSource>;
  defaultPipeline?: CrmPipeline;
  defaultStage?: CrmStage;
  onSave: (data: Omit<CrmDeal, 'id'>) => void;
  onClose: () => void;
}> = ({ deal, clientsMap, pipelines, stagesMap, sourcesMap, defaultPipeline, defaultStage, onSave, onClose }) => {
  const isEdit = !!deal;

  // Режим: выбрать существующего клиента или создать нового
  const [clientMode, setClientMode] = useState<'select' | 'new'>('select');
  const [selectedClientId, setSelectedClientId] = useState<number>(deal?.client_id || 0);
  const [clientSearch, setClientSearch] = useState('');

  // Поля нового клиента
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('+7');
  const [newEmail, setNewEmail] = useState('');
  const [newSource, setNewSource] = useState<string>('manual');
  const [duplicateWarning, setDuplicateWarning] = useState<string>('');

  // Поля сделки
  const [title, setTitle] = useState(deal?.title || '');
  const [pipelineId, setPipelineId] = useState<number>(deal?.pipeline_id || defaultPipeline?.id || 0);
  const [stageId, setStageId] = useState<number>(deal?.stage_id || defaultStage?.id || 0);
  const [status, setStatus] = useState<string>(deal?.status || 'active');
  const [amount, setAmount] = useState<string>(deal?.amount?.toString() || '');
  const [notes, setNotes] = useState(deal?.notes || '');

  const stages = stagesMap[pipelineId] || [];

  // Список клиентов для выбора (с поиском)
  const clientList = Object.values(clientsMap);
  const filteredClients = clientSearch
    ? clientList.filter(c =>
        c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        c.phone.toLowerCase().includes(clientSearch.toLowerCase())
      )
    : clientList;

  // При редактировании — автоматически выбрать текущего клиента
  useEffect(() => {
    if (isEdit && deal?.client_id) {
      setSelectedClientId(deal.client_id);
      const client = clientsMap[deal.client_id];
      if (client) {
        setClientSearch(client.full_name);
      }
    }
  }, [isEdit, deal?.client_id, clientsMap]);

  // Авто-заполнение title из имени нового клиента
  useEffect(() => {
    if (!isEdit && clientMode === 'new' && newFullName && !title) {
      setTitle(`Сделка: ${newFullName}`);
    }
  }, [isEdit, clientMode, newFullName, title]);

  const handlePipelineChange = (id: number) => {
    setPipelineId(id);
    const newStages = stagesMap[id] || [];
    setStageId(newStages[0]?.id || 0);
  };

  const handlePhoneInput = (value: string) => {
    setNewPhone(handlePhoneChange(value));
  };

  const handleSubmit = async (force = false) => {
    const now = new Date().toISOString();

    // Определяем client_id
    let clientId = selectedClientId;

    if (!isEdit && clientMode === 'new' && !force) {
      // Проверка дублей
      setDuplicateWarning('');
      const phoneDups = await crmRepository.findClientByPhone(newPhone.trim());
      if (phoneDups.length > 0) {
        const names = phoneDups.map(c => `${c.full_name} (${c.phone})`).join(', ');
        setDuplicateWarning(`Клиент с таким телефоном уже существует: ${names}`);
        return;
      }
      if (newEmail.trim()) {
        const emailDups = await crmRepository.findClientByEmail(newEmail.trim());
        if (emailDups.length > 0) {
          const names = emailDups.map(c => `${c.full_name} (${c.email})`).join(', ');
          setDuplicateWarning(`Клиент с таким email уже существует: ${names}`);
          return;
        }
      }
    }

    if (!isEdit && clientMode === 'new') {
      // Создаём нового клиента
      clientId = await crmRepository.addClient({
        full_name: newFullName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || undefined,
        source: newSource,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }

    if (!clientId) return;

    onSave({
      client_id: clientId,
      title: title.trim() || 'Без названия',
      pipeline_id: pipelineId,
      stage_id: stageId,
      status: status as CrmDeal['status'],
      amount: amount ? Number(amount) : undefined,
      notes: notes.trim() || undefined,
      ad_data: deal?.ad_data,
      created_at: deal?.created_at || now,
      updated_at: now,
    });
  };

  const isValid = isEdit
    ? title.trim() && pipelineId && stageId
    : (clientMode === 'select' ? selectedClientId > 0 : (newFullName.trim() && newPhone.trim()))
      && pipelineId && stageId;

  // Клиент текущей сделки (для редактирования)
  const currentClient = isEdit && deal?.client_id ? clientsMap[deal.client_id] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{isEdit ? 'Редактировать сделку' : 'Новая сделка'}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Клиент */}
          {isEdit ? (
            // При редактировании — показать инфо о клиенте (read-only)
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Клиент</div>
              <div className="text-xs font-medium text-zinc-900 dark:text-white">{currentClient?.full_name || '—'}</div>
              <div className="text-[11px] text-zinc-500">{currentClient?.phone || '—'}{currentClient?.email ? ` · ${currentClient.email}` : ''}</div>
              <div className="flex items-center gap-2 mt-1">
                {currentClient?.source && (
                  <span
                    className="inline-flex px-1 py-0 rounded text-[9px] font-medium"
                    style={{ backgroundColor: sourcesMap[currentClient.source]?.color ? `${sourcesMap[currentClient.source].color}20` : undefined, color: sourcesMap[currentClient.source]?.color || undefined }}
                  >
                    {sourcesMap[currentClient.source]?.name || currentClient.source}
                  </span>
                )}
                {currentClient?.status && (
                  <span className={`inline-flex px-1 py-0 rounded text-[9px] font-medium ${(CLIENT_STATUS_LABELS[currentClient.status] || CLIENT_STATUS_LABELS.active).color}`}>
                    {(CLIENT_STATUS_LABELS[currentClient.status] || CLIENT_STATUS_LABELS.active).label}
                  </span>
                )}
              </div>
            </div>
          ) : (
            // При создании — выбор клиента
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setClientMode('select')}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${clientMode === 'select' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700'}`}
                >Выбрать клиента</button>
                <button
                  type="button"
                  onClick={() => setClientMode('new')}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${clientMode === 'new' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700'}`}
                >Новый клиент</button>
              </div>

              {clientMode === 'select' ? (
                <div>
                  <FormField label="Поиск клиента" required>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      placeholder="Имя или телефон..."
                      className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </FormField>
                  {clientSearch && (
                    <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                      {filteredClients.length === 0 ? (
                        <div className="px-2 py-2 text-[10px] text-zinc-400">Клиенты не найдены</div>
                      ) : filteredClients.slice(0, 20).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedClientId(c.id!); setClientSearch(c.full_name); }}
                          className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-between ${selectedClientId === c.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                        >
                          <span className="font-medium text-zinc-900 dark:text-white">{c.full_name}</span>
                          <span className="text-zinc-400">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedClientId > 0 && (
                    <div className="mt-1 text-[10px] text-green-600 dark:text-green-400">
                      Выбран: {clientsMap[selectedClientId]?.full_name}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <FormField label="Имя" required>
                    <input type="text" value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="ФИО клиента" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </FormField>
                  <FormField label="Телефон" required>
                    <input type="tel" value={newPhone} onChange={e => handlePhoneInput(e.target.value)} placeholder="+7 (999) 123-45-67" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Email">
                      <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </FormField>
                    <FormField label="Источник">
                      <select value={newSource} onChange={e => setNewSource(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                        {Object.values(sourcesMap).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                      </select>
                    </FormField>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Разделитель */}
          <div className="border-t border-zinc-200 dark:border-zinc-700" />

          {/* Поля сделки */}
          <FormField label="Название сделки" required>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Название сделки" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Воронка">
              <select value={pipelineId} onChange={e => handlePipelineChange(Number(e.target.value))} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>

            <FormField label="Этап">
              <select value={stageId} onChange={e => setStageId(Number(e.target.value))} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Статус">
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                {Object.entries(DEAL_STATUS_LABELS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </FormField>

            <FormField label="Сумма">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FormField>
          </div>

          <FormField label="Заметки">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Заметки по сделке..." className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 sticky bottom-0 bg-white dark:bg-zinc-900">
          {duplicateWarning && (
            <div className="flex-1 mr-2">
              <div className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 mb-1">{duplicateWarning}</div>
              <button onClick={() => handleSubmit(true)} className="text-[10px] text-amber-700 dark:text-amber-400 hover:underline font-medium">Создать всё равно</button>
            </div>
          )}
          <button onClick={onClose} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">Отмена</button>
          <button onClick={() => handleSubmit()} disabled={!isValid} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">{isEdit ? 'Сохранить' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
};

export default CrmDealsPage;
