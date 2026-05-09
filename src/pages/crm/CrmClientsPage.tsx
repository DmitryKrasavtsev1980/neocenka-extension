/**
 * Страница Клиентов CRM — список, карточка, CRUD
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmClient, CrmDeal, CrmSource, CrmPipeline, CrmStage, CrmPhone } from '@/types';
import { getPrimaryPhone, formatPhone } from '@/types';
import { Button } from '@/components/catalyst/button';
import CrmChatPage from './CrmChatPage';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/16/solid';

interface CrmClientsPageProps {
  onNavigate?: (page: string) => void;
}

const CLIENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активный', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  paused: { label: 'Пауза', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  closed: { label: 'Закрыт', color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400' },
};

const PHONE_LABELS = [
  { value: '', label: 'Без метки' },
  { value: 'мобильный', label: 'Мобильный' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'рабочий', label: 'Рабочий' },
  { value: 'другой', label: 'Другой' },
];

const PAGE_SIZE = 30;

// Phone mask
const handlePhoneInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  const d = digits.startsWith('8') ? digits.slice(1) : digits.startsWith('7') ? digits.slice(1) : digits;
  let formatted = '+7';
  if (d.length > 0) formatted += ' (' + d.slice(0, 3);
  if (d.length >= 3) formatted += ') ' + d.slice(3, 6);
  if (d.length > 6) formatted += '-' + d.slice(6, 8);
  if (d.length > 8) formatted += '-' + d.slice(8, 10);
  return formatted;
};

const CrmClientsPage: React.FC<CrmClientsPageProps> = () => {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sourcesMap, setSourcesMap] = useState<Record<string, CrmSource>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // Модалка
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<CrmClient | null>(null);

  // Форма
  const [formName, setFormName] = useState('');
  const [formPhones, setFormPhones] = useState<CrmPhone[]>([{ number: '+7' }]);
  const [formEmail, setFormEmail] = useState('');
  const [formSource, setFormSource] = useState('manual');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<string>('active');
  const [duplicateWarning, setDuplicateWarning] = useState<string>('');

  // Чат
  const [chatClient, setChatClient] = useState<CrmClient | null>(null);

  // Сделки клиента (для карточки)
  const [selectedClientDeals, setSelectedClientDeals] = useState<CrmDeal[]>([]);
  const [showDealsFor, setShowDealsFor] = useState<number | null>(null);
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<number, CrmStage[]>>({});

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const result = await crmRepository.searchClients({
        search: search || undefined,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
      }, page, PAGE_SIZE);
      setClients(result.clients);
      setTotalClients(result.total);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter, page]);

  const loadSources = useCallback(async () => {
    await crmRepository.ensureDefaultSources();
    const srcs = await crmRepository.getSources();
    setSourcesMap(Object.fromEntries(srcs.map(s => [s.code, s])));
  }, []);

  const loadPipelines = useCallback(async () => {
    const pips = await crmRepository.getPipelines();
    setPipelines(pips);
    const map: Record<number, CrmStage[]> = {};
    for (const p of pips) {
      if (p.id) map[p.id] = await crmRepository.getStages(p.id);
    }
    setStagesMap(map);
  }, []);

  useEffect(() => {
    loadSources();
    loadPipelines();
  }, [loadSources, loadPipelines]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const totalPages = Math.ceil(totalClients / PAGE_SIZE);

  // Телефоны — управление массивом
  const addPhone = () => {
    setFormPhones([...formPhones, { number: '+7' }]);
  };

  const removePhone = (index: number) => {
    if (formPhones.length <= 1) return;
    setFormPhones(formPhones.filter((_, i) => i !== index));
  };

  const updatePhone = (index: number, field: 'number' | 'label', value: string) => {
    const updated = [...formPhones];
    updated[index] = { ...updated[index], [field]: field === 'number' ? handlePhoneInput(value) : value };
    setFormPhones(updated);
  };

  const handleSave = async () => {
    setDuplicateWarning('');
    const excludeId = editingClient?.id;

    // Проверка дублей по телефону
    const primaryPhone = formPhones[0]?.number || '';
    const phoneDups = await crmRepository.findClientByPhone(primaryPhone, excludeId);
    if (phoneDups.length > 0) {
      const names = phoneDups.map(c => `${c.full_name} (${formatPhone(getPrimaryPhone(c.phones || []))})`).join(', ');
      setDuplicateWarning(`Клиент с таким телефоном уже существует: ${names}. Всё равно сохранить?`);
      return;
    }

    // Проверка дублей по email
    if (formEmail.trim()) {
      const emailDups = await crmRepository.findClientByEmail(formEmail.trim(), excludeId);
      if (emailDups.length > 0) {
        const names = emailDups.map(c => `${c.full_name} (${c.email})`).join(', ');
        setDuplicateWarning(`Клиент с таким email уже существует: ${names}. Всё равно сохранить?`);
        return;
      }
    }

    await doSave();
  };

  const doSave = async () => {
    // Нормализуем телефоны перед сохранением
    const phones = formPhones
      .map(p => ({ ...p, number: p.number.replace(/[^\d+]/g, '') }))
      .filter(p => p.number.replace(/\D/g, '').length >= 10);

    const now = new Date().toISOString();
    if (editingClient?.id) {
      await crmRepository.updateClient(editingClient.id, {
        full_name: formName.trim(),
        phones,
        email: formEmail.trim() || undefined,
        source: formSource,
        notes: formNotes.trim() || undefined,
        status: formStatus as CrmClient['status'],
      });
    } else {
      await crmRepository.addClient({
        full_name: formName.trim(),
        phones,
        email: formEmail.trim() || undefined,
        source: formSource,
        notes: formNotes.trim() || undefined,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }
    setShowModal(false);
    setEditingClient(null);
    setDuplicateWarning('');
    loadClients();
  };

  const handleDelete = async (id: number) => {
    const dealCount = await crmRepository.getDealCountByClient(id);
    const msg = dealCount > 0
      ? `У клиента ${dealCount} сделок. Удалить клиента и все его сделки?`
      : 'Удалить клиента?';
    if (!confirm(msg)) return;
    await crmRepository.deleteClient(id);
    loadClients();
  };

  const openEdit = (client: CrmClient) => {
    setEditingClient(client);
    setFormName(client.full_name);
    setFormPhones(client.phones?.length ? client.phones : [{ number: '+7' }]);
    setFormEmail(client.email || '');
    setFormSource(client.source);
    setFormNotes(client.notes || '');
    setFormStatus(client.status);
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingClient(null);
    setFormName('');
    setFormPhones([{ number: '+7' }]);
    setFormEmail('');
    setFormSource('manual');
    setFormNotes('');
    setFormStatus('active');
    setShowModal(true);
  };

  const handleShowDeals = async (clientId: number) => {
    if (showDealsFor === clientId) {
      setShowDealsFor(null);
      setSelectedClientDeals([]);
      return;
    }
    const deals = await crmRepository.getDealsByClient(clientId);
    setSelectedClientDeals(deals);
    setShowDealsFor(clientId);
  };

  const fmtDate = (date: string | null): string => {
    if (!date) return '—';
    try { return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return date; }
  };

  const getStageName = (pipelineId: number, stageId: number): string => {
    const stages = stagesMap[pipelineId] || [];
    return stages.find(s => s.id === stageId)?.name || '—';
  };

  const getPipelineName = (pipelineId: number): string => {
    return pipelines.find(p => p.id === pipelineId)?.name || '—';
  };

  // Отображение телефонов в таблице
  const renderPhones = (phones: CrmPhone[]) => {
    if (!phones || phones.length === 0) return '—';
    const primary = formatPhone(phones[0].number);
    if (phones.length === 1) return primary;
    return (
      <span className="inline-flex items-center gap-1">
        {primary}
        <span className="inline-flex items-center justify-center size-4 rounded-full bg-blue-100 dark:bg-blue-900/30 text-[8px] font-bold text-blue-600 dark:text-blue-400">
          +{phones.length - 1}
        </span>
      </span>
    );
  };

  // Чат
  if (chatClient) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
          <CrmChatPage client={chatClient} onBack={() => setChatClient(null)} />
        </div>
      </div>
    );
  }

  const hasValidPhone = formPhones.some(p => p.number.replace(/\D/g, '').length >= 10);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Клиенты
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">{totalClients}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Поиск по имени/телефону..."
              className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-white w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" />
              Клиент
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
          >
            <option value="">Все статусы</option>
            {Object.entries(CLIENT_STATUS_LABELS).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
          >
            <option value="">Все источники</option>
            {Object.values(sourcesMap).map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr className="text-left text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-3 py-2">Клиент</th>
                  <th className="px-3 py-2">Телефон</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Источник</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Сделок</th>
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
                  const statusInfo = CLIENT_STATUS_LABELS[client.status] || CLIENT_STATUS_LABELS.active;
                  return (
                    <React.Fragment key={client.id}>
                      <tr
                        className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        onClick={() => openEdit(client)}
                      >
                        <td className="px-3 py-2 text-[11px] font-medium text-zinc-900 dark:text-white whitespace-nowrap max-w-[200px] truncate">{client.full_name}</td>
                        <td className="px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{renderPhones(client.phones || [])}</td>
                        <td className="px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap max-w-[150px] truncate">{client.email || '—'}</td>
                        <td className="px-3 py-2 text-[11px]">
                          {client.source && sourcesMap[client.source] ? (
                            <span
                              className="inline-flex px-1 py-0 rounded text-[9px] font-medium"
                              style={{ backgroundColor: `${sourcesMap[client.source].color}20`, color: sourcesMap[client.source].color }}
                            >
                              {sourcesMap[client.source].name}
                            </span>
                          ) : (
                            <span className="text-zinc-400">{client.source || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px]">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-zinc-500">
                          <button
                            onClick={e => { e.stopPropagation(); handleShowDeals(client.id!); }}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {showDealsFor === client.id ? 'скрыть' : 'показать'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap">{fmtDate(client.created_at)}</td>
                        <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setChatClient(client)} className="p-1 rounded text-zinc-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20" title="Чат">
                              <ChatBubbleLeftRightIcon className="size-3.5" />
                            </button>
                            <button onClick={() => openEdit(client)} className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Редактировать">
                              <PencilSquareIcon className="size-3.5" />
                            </button>
                            <button onClick={() => handleDelete(client.id!)} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Удалить">
                              <TrashIcon className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {showDealsFor === client.id && (
                        <tr>
                          <td colSpan={8} className="bg-zinc-50 dark:bg-zinc-800/30 px-6 py-2">
                            {selectedClientDeals.length === 0 ? (
                              <div className="text-[10px] text-zinc-400">Нет сделок</div>
                            ) : (
                              <div className="space-y-1">
                                {selectedClientDeals.map(deal => (
                                  <div key={deal.id} className="flex items-center gap-3 text-[11px]">
                                    <span className="font-medium text-zinc-900 dark:text-white">{deal.title}</span>
                                    <span className="text-zinc-400">{getPipelineName(deal.pipeline_id)} / {getStageName(deal.pipeline_id, deal.stage_id)}</span>
                                    {deal.amount ? <span className="text-green-600 dark:text-green-400">{deal.amount.toLocaleString('ru-RU')} ₽</span> : null}
                                    <span className="text-zinc-400">{fmtDate(deal.created_at)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setShowModal(false); setEditingClient(null); }}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{editingClient ? 'Редактировать клиента' : 'Новый клиент'}</h3>
              <button onClick={() => { setShowModal(false); setEditingClient(null); }} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">ФИО <span className="text-red-500">*</span></label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="ФИО клиента" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>

              {/* Телефоны */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Телефоны <span className="text-red-500">*</span></label>
                  <button onClick={addPhone} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">+ Добавить номер</button>
                </div>
                <div className="space-y-2">
                  {formPhones.map((phone, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <input
                        type="tel"
                        value={phone.number}
                        onChange={e => updatePhone(index, 'number', e.target.value)}
                        placeholder="+7 (999) 123-45-67"
                        className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <select
                        value={phone.label || ''}
                        onChange={e => updatePhone(index, 'label', e.target.value)}
                        className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-1 py-1.5 text-[10px] text-zinc-700 dark:text-zinc-300"
                      >
                        {PHONE_LABELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                      {formPhones.length > 1 && (
                        <button onClick={() => removePhone(index)} className="p-1 text-zinc-400 hover:text-red-500" title="Удалить номер">
                          <TrashIcon className="size-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@example.com" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Источник</label>
                  <select value={formSource} onChange={e => setFormSource(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                    {Object.values(sourcesMap).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Статус</label>
                <select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                  {Object.entries(CLIENT_STATUS_LABELS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Заметки</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3} placeholder="Заметки..." className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 sticky bottom-0 bg-white dark:bg-zinc-900">
              {duplicateWarning && (
                <div className="flex-1 mr-2">
                  <div className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 mb-1">{duplicateWarning}</div>
                  <button onClick={doSave} className="text-[10px] text-amber-700 dark:text-amber-400 hover:underline font-medium">Сохранить всё равно</button>
                </div>
              )}
              <button onClick={() => { setShowModal(false); setEditingClient(null); }} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">Отмена</button>
              <button onClick={handleSave} disabled={!formName.trim() || !hasValidPhone} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">{editingClient ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmClientsPage;
