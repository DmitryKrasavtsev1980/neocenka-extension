/**
 * Страница «Клиенты CRM» — список + управление
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import { parseUrl, type ParsingProgress } from '@/services/crm-parsing-service';
import type { CrmClient, CrmPipeline, CrmStage, CrmClientFilters } from '@/types';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import CrmChatPage from './CrmChatPage';
import {
  FunnelIcon,
  PlusIcon,
  ChatBubbleLeftRightIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/16/solid';

interface CrmPageProps {
  onNavigate?: (page: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Вручную',
  cian: 'ЦИАН',
  avito: 'Авито',
  other: 'Другое',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активный', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  paused: { label: 'Пауза', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  closed: { label: 'Закрыт', color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400' },
};

const PAGE_SIZE = 30;

const CrmPage: React.FC<CrmPageProps> = ({ onNavigate }) => {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<number, CrmStage[]>>({});

  // Фильтры
  const [filters, setFilters] = useState<CrmClientFilters>({});
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Модалка клиента
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<CrmClient | null>(null);

  // Модалка парсинга
  const [showParsingModal, setShowParsingModal] = useState(false);
  const [parsingUrl, setParsingUrl] = useState('');
  const [parsingPipelineId, setParsingPipelineId] = useState<number>(0);
  const [parsingStageId, setParsingStageId] = useState<number>(0);
  const [parsingProgress, setParsingProgress] = useState<ParsingProgress | null>(null);
  const [isParsing, setIsParsing] = useState(false);

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
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const result = await crmRepository.searchClients(filters, page, PAGE_SIZE);
      setClients(result.clients);
      setTotalClients(result.total);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    crmRepository.ensureDefaultPipeline().then(() => {
      loadPipelines();
    });
  }, [loadPipelines]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, search }));
    setPage(1);
  };

  const handleFilterChange = (key: keyof CrmClientFilters, value: string | number | undefined) => {
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

  const totalPages = Math.ceil(totalClients / PAGE_SIZE);

  // Статистика
  const [stats, setStats] = useState<Record<string, number>>({});
  useEffect(() => {
    crmRepository.getClientsByStatus().then(setStats);
  }, [loadClients]);

  const handleSaveClient = async (data: Omit<CrmClient, 'id'>) => {
    if (editingClient?.id) {
      await crmRepository.updateClient(editingClient.id, data);
    } else {
      await crmRepository.addClient(data);
    }
    setShowClientModal(false);
    setEditingClient(null);
    loadClients();
  };

  const handleDeleteClient = async (id: number) => {
    await crmRepository.deleteClient(id);
    loadClients();
  };

  const defaultPipeline = pipelines.find(p => p.is_default) || pipelines[0];
  const defaultStages = defaultPipeline ? (stagesMap[defaultPipeline.id!] || []) : [];
  const firstStage = defaultStages[0];

  const handleStartParsing = async () => {
    if (!parsingUrl.trim()) return;
    const pipId = parsingPipelineId || defaultPipeline?.id || 0;
    const stgId = parsingStageId || firstStage?.id || 0;
    if (!pipId || !stgId) return;

    setIsParsing(true);
    setParsingProgress(null);
    try {
      await parseUrl(parsingUrl.trim(), pipId, stgId, setParsingProgress);
      loadClients();
    } catch {
      // Ошибка уже в parsingProgress
    } finally {
      setIsParsing(false);
    }
  };

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
                {totalClients} клиентов
                {stats.active ? ` · ${stats.active} акт.` : ''}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Поиск по имени/телефону..."
              className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-white w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button color="white" onClick={() => setShowParsingModal(true)}>
              <ArrowDownTrayIcon className="size-4" />
              Парсинг
            </Button>
            <Button onClick={() => setShowFilters(!showFilters)}>
              <FunnelIcon className="size-4" />
              {showFilters ? 'Скрыть' : 'Фильтры'}
            </Button>
            <Button color="white" onClick={() => { setEditingClient(null); setShowClientModal(true); }}>
              <PlusIcon className="size-4" />
              Клиент
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
                {/* Источник */}
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Источник</label>
                  <select
                    value={filters.source || ''}
                    onChange={e => handleFilterChange('source', e.target.value || undefined)}
                    className="rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                  >
                    <option value="">Все</option>
                    {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>

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

                {/* Статус */}
                <div>
                  <label className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">Статус</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleFilterChange('status', undefined)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${!filters.status ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-700'}`}
                    >Все</button>
                    {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
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
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{loading ? 'Загрузка...' : `Всего: ${totalClients}`}</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr className="text-left text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-3 py-2">Имя</th>
                  <th className="px-3 py-2">Телефон</th>
                  <th className="px-3 py-2">Источник</th>
                  <th className="px-3 py-2">Воронка / Этап</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Последний контакт</th>
                  <th className="px-3 py-2">Создан</th>
                  <th className="px-3 py-2 w-32 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {!loading && clients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-zinc-400 text-sm">
                      Нет клиентов. Нажмите «Клиент» для добавления.
                    </td>
                  </tr>
                ) : clients.map(client => {
                  const statusInfo = STATUS_LABELS[client.status] || STATUS_LABELS.active;
                  return (
                    <tr key={client.id} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-3 py-2 text-[11px] font-medium text-zinc-900 dark:text-white whitespace-nowrap">{client.full_name || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{client.phone || '—'}</td>
                      <td className="px-3 py-2 text-[11px]">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          client.source === 'cian' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          client.source === 'avito' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
                        }`}>
                          {SOURCE_LABELS[client.source] || client.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <div className="text-zinc-700 dark:text-zinc-300">{getPipelineName(client.pipeline_id)}</div>
                        <div className="text-[10px] text-zinc-400">{getStageName(client.pipeline_id, client.stage_id)}</div>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap">{fmtDate(client.last_contact_at || null)}</td>
                      <td className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap">{fmtDate(client.created_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setChatClient(client)} className="p-1 rounded text-zinc-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20" title="Чат">
                            <ChatBubbleLeftRightIcon className="size-3.5" />
                          </button>
                          <button onClick={() => { setEditingClient(client); setShowClientModal(true); }} className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Редактировать">
                            <PencilSquareIcon className="size-3.5" />
                          </button>
                          <button onClick={() => { if (confirm('Удалить клиента?')) handleDeleteClient(client.id!); }} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Удалить">
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
              <span className="text-[11px] text-zinc-500">{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalClients)} из {totalClients}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Назад</button>
                <span className="px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-400">{page}/{totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Далее</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Client Modal */}
      {showClientModal && (
        <CrmClientModal
          client={editingClient}
          pipelines={pipelines}
          stagesMap={stagesMap}
          defaultPipeline={defaultPipeline}
          defaultStage={firstStage}
          onSave={handleSaveClient}
          onClose={() => { setShowClientModal(false); setEditingClient(null); }}
        />
      )}

      {/* Parsing Modal */}
      {showParsingModal && (
        <CrmParsingModal
          pipelines={pipelines}
          stagesMap={stagesMap}
          defaultPipeline={defaultPipeline}
          defaultStage={firstStage}
          parsingUrl={parsingUrl}
          setParsingUrl={setParsingUrl}
          parsingPipelineId={parsingPipelineId}
          setParsingPipelineId={setParsingPipelineId}
          parsingStageId={parsingStageId}
          setParsingStageId={setParsingStageId}
          parsingProgress={parsingProgress}
          isParsing={isParsing}
          onStart={handleStartParsing}
          onClose={() => { setShowParsingModal(false); setParsingProgress(null); }}
        />
      )}
    </div>
  );
};

// ─── Client Modal Component ─────────────────────────────────────
const CrmClientModal: React.FC<{
  client: CrmClient | null;
  pipelines: CrmPipeline[];
  stagesMap: Record<number, CrmStage[]>;
  defaultPipeline?: CrmPipeline;
  defaultStage?: CrmStage;
  onSave: (data: Omit<CrmClient, 'id'>) => void;
  onClose: () => void;
}> = ({ client, pipelines, stagesMap, defaultPipeline, defaultStage, onSave, onClose }) => {
  const isEdit = !!client;

  const [fullName, setFullName] = useState(client?.full_name || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [email, setEmail] = useState(client?.email || '');
  const [source, setSource] = useState<string>(client?.source || 'manual');
  const [pipelineId, setPipelineId] = useState<number>(client?.pipeline_id || defaultPipeline?.id || 0);
  const [stageId, setStageId] = useState<number>(client?.stage_id || defaultStage?.id || 0);
  const [notes, setNotes] = useState(client?.notes || '');
  const [status, setStatus] = useState<string>(client?.status || 'active');

  const stages = stagesMap[pipelineId] || [];

  const handlePipelineChange = (id: number) => {
    setPipelineId(id);
    const newStages = stagesMap[id] || [];
    setStageId(newStages[0]?.id || 0);
  };

  const handleSubmit = () => {
    if (!fullName.trim() || !phone.trim()) return;
    const now = new Date().toISOString();
    onSave({
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      source: source as CrmClient['source'],
      pipeline_id: pipelineId,
      stage_id: stageId,
      notes: notes.trim() || undefined,
      status: status as CrmClient['status'],
      ad_data: client?.ad_data,
      last_contact_at: client?.last_contact_at,
      created_at: client?.created_at || now,
      updated_at: now,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{isEdit ? 'Редактировать клиента' : 'Новый клиент'}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-3">
          <FormField label="Имя" required>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="ФИО клиента" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </FormField>

          <FormField label="Телефон" required>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (999) 123-45-67" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </FormField>

          <FormField label="Email">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Источник">
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormField>

            <FormField label="Статус">
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                {Object.entries(STATUS_LABELS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </FormField>
          </div>

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

          <FormField label="Заметки">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Заметки о клиенте..." className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-700">
          <button onClick={onClose} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">Отмена</button>
          <button onClick={handleSubmit} disabled={!fullName.trim() || !phone.trim()} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">{isEdit ? 'Сохранить' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
};

const FormField: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div>
    <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// ─── Parsing Modal Component ─────────────────────────────────────
const CrmParsingModal: React.FC<{
  pipelines: CrmPipeline[];
  stagesMap: Record<number, CrmStage[]>;
  defaultPipeline?: CrmPipeline;
  defaultStage?: CrmStage;
  parsingUrl: string;
  setParsingUrl: (v: string) => void;
  parsingPipelineId: number;
  setParsingPipelineId: (v: number) => void;
  parsingStageId: number;
  setParsingStageId: (v: number) => void;
  parsingProgress: ParsingProgress | null;
  isParsing: boolean;
  onStart: () => void;
  onClose: () => void;
}> = ({ pipelines, stagesMap, defaultPipeline, defaultStage, parsingUrl, setParsingUrl, parsingPipelineId, setParsingPipelineId, parsingStageId, setParsingStageId, parsingProgress, isParsing, onStart, onClose }) => {
  const activePipId = parsingPipelineId || defaultPipeline?.id || 0;
  const stages = stagesMap[activePipId] || [];

  const isCian = parsingUrl.includes('cian.ru');
  const isAvito = parsingUrl.includes('avito.ru');
  const isValidUrl = isCian || isAvito;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Парсинг объявлений</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-3">
          <FormField label="URL страницы объявлений" required>
            <input
              type="url"
              value={parsingUrl}
              onChange={e => setParsingUrl(e.target.value)}
              placeholder="https://www.cian.ru/cat.php?... или https://www.avito.ru/..."
              disabled={isParsing}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {parsingUrl && !isValidUrl && (
              <span className="text-[10px] text-red-500 mt-1 block">Поддерживаются только ссылки на cian.ru или avito.ru</span>
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Воронка">
              <select
                value={activePipId}
                onChange={e => {
                  setParsingPipelineId(Number(e.target.value));
                  const newStages = stagesMap[Number(e.target.value)] || [];
                  setParsingStageId(newStages[0]?.id || 0);
                }}
                disabled={isParsing}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
              >
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>

            <FormField label="Этап">
              <select
                value={parsingStageId || defaultStage?.id || ''}
                onChange={e => setParsingStageId(Number(e.target.value))}
                disabled={isParsing}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
              >
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>
          </div>

          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Расширение откроет страницу в фоновой вкладке, спарсит объявления и создаст клиентов в выбранной воронке.
          </div>

          {/* Progress */}
          {parsingProgress && (
            <div className={`rounded-lg p-3 ${
              parsingProgress.stage === 'done' ? 'bg-green-50 dark:bg-green-900/10' :
              parsingProgress.stage === 'error' ? 'bg-red-50 dark:bg-red-900/10' :
              'bg-blue-50 dark:bg-blue-900/10'
            }`}>
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{parsingProgress.detail}</div>
              {isParsing && (
                <div className="mt-1.5 h-1 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-600 animate-pulse" style={{ width: '60%' }} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-700">
          <button onClick={onClose} disabled={isParsing} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-30">Закрыть</button>
          <button
            onClick={onStart}
            disabled={isParsing || !parsingUrl.trim() || !isValidUrl}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30"
          >
            {isParsing ? 'Парсинг...' : 'Запустить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CrmPage;
