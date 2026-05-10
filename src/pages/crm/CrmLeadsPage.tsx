/**
 * Страница Лидов CRM — возможности из разных источников
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import { db } from '@/db/database';
import type { CrmLead, CrmSource, CrmPipeline, CrmStage, CrmLeadFilters, CrmPhone } from '@/types';
import { formatPhone } from '@/types';
import { Button } from '@/components/catalyst/button';
import {
  PlusIcon,
  TrashIcon,
  ArrowRightIcon,
  FunnelIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid';

interface CrmLeadsPageProps {
  onNavigate?: (page: string) => void;
}

const LEAD_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  contacted: { label: 'Контакт', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  qualified: { label: 'Квалифицир.', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  converted: { label: 'Конвертирован', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Отклонён', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const PHONE_LABELS = [
  { value: '', label: 'Без метки' },
  { value: 'мобильный', label: 'Мобильный' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'рабочий', label: 'Рабочий' },
  { value: 'другой', label: 'Другой' },
];

const PAGE_SIZE = 30;

const CrmLeadsPage: React.FC<CrmLeadsPageProps> = ({ onNavigate }) => {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sourcesMap, setSourcesMap] = useState<Record<string, CrmSource>>({});
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<number, CrmStage[]>>({});

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [allSelected, setAllSelected] = useState(false);

  // Модалка
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState<CrmLead | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhones, setFormPhones] = useState<CrmPhone[]>([{ number: '+7' }]);
  const [formEmail, setFormEmail] = useState('');
  const [formSource, setFormSource] = useState('manual');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [formPipelineId, setFormPipelineId] = useState(0);
  const [formStageId, setFormStageId] = useState(0);
  const [formNotes, setFormNotes] = useState('');

  const filters: CrmLeadFilters = {
    search: search || undefined,
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    setAllSelected(false);
    try {
      const result = await crmRepository.getLeads(filters, page, PAGE_SIZE);
      setLeads(result.leads);
      setTotalLeads(result.total);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter, dateFrom, dateTo, page]);

  const loadDeps = useCallback(async () => {
    await crmRepository.ensureDefaultSources();
    const srcs = await crmRepository.getSources();
    setSourcesMap(Object.fromEntries(srcs.map(s => [s.code, s])));

    const pips = await crmRepository.getPipelines();
    setPipelines(pips);
    const map: Record<number, CrmStage[]> = {};
    for (const p of pips) {
      if (p.id) map[p.id] = await crmRepository.getStages(p.id);
    }
    setStagesMap(map);
  }, []);

  useEffect(() => { loadDeps(); }, [loadDeps]);
  useEffect(() => { loadLeads(); }, [loadLeads]);

  const defaultPipeline = pipelines.find(p => p.is_default) || pipelines[0];
  const totalPages = Math.ceil(totalLeads / PAGE_SIZE);

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

  // Телефоны — управление массивом
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

  const openCreate = () => {
    setEditingLead(null);
    setFormName('');
    setFormPhones([{ number: '+7' }]);
    setFormEmail('');
    setFormSource('manual');
    setFormSourceUrl('');
    setFormPipelineId(defaultPipeline?.id || 0);
    const stages = stagesMap[defaultPipeline?.id || 0] || [];
    setFormStageId(stages[0]?.id || 0);
    setFormNotes('');
    setShowModal(true);
  };

  const openEdit = (lead: CrmLead) => {
    setEditingLead(lead);
    setFormName(lead.contact_name);
    setFormPhones(lead.phones?.length ? lead.phones : [{ number: '+7' }]);
    setFormEmail(lead.contact_email || '');
    setFormSource(lead.source);
    setFormSourceUrl(lead.source_url || '');
    setFormPipelineId(lead.pipeline_id);
    setFormStageId(lead.stage_id);
    setFormNotes(lead.notes || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    const phones = formPhones
      .map(p => ({ ...p, number: p.number.replace(/[^\d+]/g, '') }))
      .filter(p => p.number.replace(/\D/g, '').length >= 10);

    const now = new Date().toISOString();
    if (editingLead?.id) {
      await crmRepository.updateLead(editingLead.id, {
        contact_name: formName.trim(),
        phones,
        contact_email: formEmail.trim() || undefined,
        source: formSource,
        source_url: formSourceUrl.trim() || undefined,
        pipeline_id: formPipelineId,
        stage_id: formStageId,
        notes: formNotes.trim() || undefined,
      });
    } else {
      await crmRepository.addLead({
        contact_name: formName.trim(),
        phones,
        contact_email: formEmail.trim() || undefined,
        source: formSource,
        source_url: formSourceUrl.trim() || undefined,
        pipeline_id: formPipelineId,
        stage_id: formStageId,
        status: 'new',
        notes: formNotes.trim() || undefined,
        created_at: now,
        updated_at: now,
      });
    }
    setShowModal(false);
    setEditingLead(null);
    loadLeads();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить лид?')) return;
    await crmRepository.deleteLead(id);
    loadLeads();
  };

  const handleConvert = async (id: number) => {
    if (!confirm('Конвертировать лид в сделку? Будет создан клиент и сделка.')) return;
    const result = await crmRepository.convertLeadToDeal(id);
    if (result) {
      loadLeads();
      if (onNavigate) onNavigate('crm-deals');
    }
  };

  const handlePipelineChange = (id: number) => {
    setFormPipelineId(id);
    const stages = stagesMap[id] || [];
    setFormStageId(stages[0]?.id || 0);
  };

  // Выделение строк
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setAllSelected(false);
    } else {
      setSelectedIds(new Set(leads.map(l => l.id!)));
      setAllSelected(true);
    }
  };

  // Массовое удаление выделенных
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Удалить ${selectedIds.size} лидов?`)) return;
    await db.crm_leads.bulkDelete([...selectedIds]);
    setSelectedIds(new Set());
    setAllSelected(false);
    loadLeads();
    window.dispatchEvent(new CustomEvent('crm-data-changed'));
  };

  // Удаление всех лидов по текущему фильтру
  const handleDeleteAllFiltered = async () => {
    if (totalLeads === 0) return;
    if (!confirm(`Удалить все ${totalLeads} лидов по текущему фильтру?`)) return;
    const deleted = await crmRepository.deleteLeadsByFilter(filters);
    alert(`Удалено лидов: ${deleted}`);
    loadLeads();
    window.dispatchEvent(new CustomEvent('crm-data-changed'));
  };

  const hasValidPhone = formPhones.some(p => p.number.replace(/\D/g, '').length >= 10);
  const isValid = formName.trim() && hasValidPhone && formPipelineId && formStageId;

  // Статистика
  const stats = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Лиды
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                {totalLeads} возможностей
                {stats.new ? ` · ${stats.new} новых` : ''}
                {stats.converted ? ` · ${stats.converted} конверт.` : ''}
              </span>
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
            <Button color="white" onClick={() => setShowFilters(!showFilters)}>
              <FunnelIcon className="size-4" />
              {showFilters ? 'Скрыть' : 'Фильтры'}
            </Button>
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" />
              Лид
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
            >
              <option value="">Все статусы</option>
              {Object.entries(LEAD_STATUS).map(([v, { label }]) => (
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-500">от</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
              />
              <span className="text-[10px] text-zinc-500">до</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
              />
            </div>
            {totalLeads > 0 && (
              <button onClick={handleDeleteAllFiltered} className="inline-flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700">
                <TrashIcon className="size-3" /> Удалить все ({totalLeads})
              </button>
            )}
            <button onClick={() => { setStatusFilter(''); setSourceFilter(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(1); }} className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700">
              <XMarkIcon className="size-3" /> Очистить
            </button>
          </div>
        )}

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">Выбрано: {selectedIds.size}</span>
            <button onClick={handleBulkDelete} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400">
              <TrashIcon className="size-3" /> Удалить выбранные
            </button>
            <button onClick={() => { setSelectedIds(new Set()); setAllSelected(false); }} className="text-xs text-zinc-500 hover:text-zinc-700 ml-auto">
              Снять выделение
            </button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr className="text-left text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected && leads.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-zinc-300 dark:border-zinc-600"
                    />
                  </th>
                  <th className="px-3 py-2">Контакт</th>
                  <th className="px-3 py-2">Телефон</th>
                  <th className="px-3 py-2">Источник</th>
                  <th className="px-3 py-2">Воронка / Этап</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Создан</th>
                  <th className="px-3 py-2 w-36 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {!loading && leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-zinc-400 text-sm">
                      Нет лидов. Нажмите «Лид» для добавления или настройте парсинг.
                    </td>
                  </tr>
                ) : leads.map(lead => {
                  const statusInfo = LEAD_STATUS[lead.status] || LEAD_STATUS.new;
                  const canConvert = lead.status !== 'converted' && lead.status !== 'rejected';
                  const isSelected = selectedIds.has(lead.id!);
                  return (
                    <tr
                      key={lead.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                      onClick={() => openEdit(lead)}
                    >
                      <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id!)}
                          className="rounded border-zinc-300 dark:border-zinc-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[11px] font-medium text-zinc-900 dark:text-white whitespace-nowrap max-w-[180px] truncate">{lead.contact_name}</div>
                        {lead.ad_data?.address && <div className="text-[10px] text-zinc-400 truncate max-w-[180px]">{lead.ad_data.address}</div>}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{renderPhones(lead.phones || [])}</td>
                      <td className="px-3 py-2 text-[11px]">
                        {sourcesMap[lead.source] ? (
                          <span
                            className="inline-flex px-1 py-0 rounded text-[9px] font-medium"
                            style={{ backgroundColor: `${sourcesMap[lead.source].color}20`, color: sourcesMap[lead.source].color }}
                          >
                            {sourcesMap[lead.source].name}
                          </span>
                        ) : (
                          <span className="text-zinc-400">{lead.source}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <div className="text-zinc-700 dark:text-zinc-300">{getPipelineName(lead.pipeline_id)}</div>
                        <div className="text-[10px] text-zinc-400">{getStageName(lead.pipeline_id, lead.stage_id)}</div>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                      <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {canConvert && (
                            <button onClick={() => handleConvert(lead.id!)} className="p-1 rounded text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Конвертировать в сделку">
                              <ArrowRightIcon className="size-3.5" />
                            </button>
                          )}
                          <button onClick={() => openEdit(lead)} className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Редактировать">
                            <PlusIcon className="size-3.5" />
                          </button>
                          <button onClick={() => handleDelete(lead.id!)} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Удалить">
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
              <span className="text-[11px] text-zinc-500">{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalLeads)} из {totalLeads}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Назад</button>
                <span className="px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-400">{page}/{totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded text-[11px] border border-zinc-300 dark:border-zinc-600 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">Далее</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setShowModal(false); setEditingLead(null); }}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{editingLead ? 'Редактировать лид' : 'Новый лид'}</h3>
              <button onClick={() => { setShowModal(false); setEditingLead(null); }} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Имя контакта <span className="text-red-500">*</span></label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="ФИО контакта" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
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

              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@example.com" className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Источник</label>
                  <select value={formSource} onChange={e => setFormSource(e.target.value)} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                    {Object.values(sourcesMap).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">URL источника</label>
                  <input type="url" value={formSourceUrl} onChange={e => setFormSourceUrl(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Воронка</label>
                  <select value={formPipelineId} onChange={e => handlePipelineChange(Number(e.target.value))} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Этап</label>
                  <select value={formStageId} onChange={e => setFormStageId(Number(e.target.value))} className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white">
                    {(stagesMap[formPipelineId] || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Заметки</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3} placeholder="Заметки..." className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 sticky bottom-0 bg-white dark:bg-zinc-900">
              <button onClick={() => { setShowModal(false); setEditingLead(null); }} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">Отмена</button>
              <button onClick={handleSave} disabled={!isValid} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">{editingLead ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmLeadsPage;
