/**
 * Настройки CRM — воронки, бот, API
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import { parseSourceForLeads, detectSourceType, type ParsingProgress } from '@/services/crm-parsing-service';
import { Button } from '@/components/catalyst/button';
import type { CrmPipeline, CrmStage, CrmBotSettings, CrmSource, CrmStageAction, CrmStageActionConfig, CrmParsingSource, CrmMessageTemplate } from '@/types';
import {
  TrashIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  PlusIcon,
  SparklesIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  BoltIcon,
  PlayIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/16/solid';

const COLORS = ['#6b7280', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

const CrmSettingsPage: React.FC = () => {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<number, CrmStage[]>>({});
  const [selectedPipeline, setSelectedPipeline] = useState<CrmPipeline | null>(null);

  // Bot settings
  const [botSettings, setBotSettings] = useState<CrmBotSettings | null>(null);
  const [zaiToken, setZaiToken] = useState('');
  const [contextTemplate, setContextTemplate] = useState('');
  const [botMode, setBotMode] = useState<'suggest' | 'semi-auto' | 'auto'>('suggest');
  const [botActive, setBotActive] = useState(false);
  const [botSaved, setBotSaved] = useState(false);

  // New pipeline form
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newPipelineColor, setNewPipelineColor] = useState('#3b82f6');

  // New stage form
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#6b7280');

  // Inline rename pipeline
  const [editingPipelineId, setEditingPipelineId] = useState<number | null>(null);
  const [editingPipelineName, setEditingPipelineName] = useState('');

  // Delete pipeline modal
  const [deleteModal, setDeleteModal] = useState<{ pipeline: CrmPipeline; clientCount: number } | null>(null);
  const [deleteTargetPipelineId, setDeleteTargetPipelineId] = useState<number>(0);

  // Sources
  const [sources, setSources] = useState<CrmSource[]>([]);
  const [newSourceCode, setNewSourceCode] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceColor, setNewSourceColor] = useState('#3b82f6');

  // Stage Actions
  const [actionsMap, setActionsMap] = useState<Record<number, CrmStageAction[]>>({});
  const [selectedActionStage, setSelectedActionStage] = useState<number | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState<CrmStageAction | null>(null);
  const [actionFormType, setActionFormType] = useState<CrmStageAction['type']>('create_task');
  const [actionFormName, setActionFormName] = useState('');
  const [actionFormActive, setActionFormActive] = useState(true);
  const [actionFormConfig, setActionFormConfig] = useState<CrmStageActionConfig>({});

  // Parsing Sources
  const [parsingSources, setParsingSources] = useState<CrmParsingSource[]>([]);
  const [newParsingUrl, setNewParsingUrl] = useState('');
  const [newParsingPipelineId, setNewParsingPipelineId] = useState(0);
  const [newParsingStageId, setNewParsingStageId] = useState(0);
  const [parsingStages, setParsingStages] = useState<CrmStage[]>([]);
  const [parsingRunning, setParsingRunning] = useState(false);
  const [parsingProgress, setParsingProgress] = useState<ParsingProgress | null>(null);
  const [parsingResult, setParsingResult] = useState<string | null>(null);

  // Message Templates
  const [msgTemplates, setMsgTemplates] = useState<CrmMessageTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<CrmMessageTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [tmplBody, setTmplBody] = useState('');
  const [tmplPipelineId, setTmplPipelineId] = useState<string>('');
  const [tmplSource, setTmplSource] = useState<string>('');

  const loadData = useCallback(async () => {
    const pips = await crmRepository.getPipelines();
    setPipelines(pips);
    const map: Record<number, CrmStage[]> = {};
    for (const p of pips) {
      if (p.id) map[p.id] = await crmRepository.getStages(p.id);
    }
    setStagesMap(map);

    const bot = await crmRepository.getBotSettings();
    if (bot) {
      setBotSettings(bot);
      setZaiToken(bot.zai_token);
      setContextTemplate(bot.context_template);
      setBotMode(bot.mode);
      setBotActive(bot.is_active);
    }

    await crmRepository.ensureDefaultSources();
    const srcs = await crmRepository.getSources();
    setSources(srcs);

    // Загружаем actions для всех этапов
    const aMap: Record<number, CrmStageAction[]> = {};
    for (const p of pips) {
      const actions = await crmRepository.getActionsForPipeline(p.id!);
      for (const a of actions) {
        if (!aMap[a.stage_id]) aMap[a.stage_id] = [];
        aMap[a.stage_id].push(a);
      }
    }
    setActionsMap(aMap);

    // Загружаем источники парсинга
    const pSources = await crmRepository.getParsingSources();
    setParsingSources(pSources);
    if (pips.length > 0 && !newParsingPipelineId) {
      setNewParsingPipelineId(pips[0].id!);
      const defaultStages = await crmRepository.getStages(pips[0].id!);
      setParsingStages(defaultStages);
      if (defaultStages.length > 0) setNewParsingStageId(defaultStages[0].id!);
    }

    // Шаблоны сообщений
    await crmRepository.ensureDefaultTemplates();
    const tmpls = await crmRepository.getMessageTemplates();
    setMsgTemplates(tmpls);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Pipeline actions ─────────────────────

  const handleAddPipeline = async () => {
    if (!newPipelineName.trim()) return;
    const now = new Date().toISOString();
    await crmRepository.addPipeline({
      name: newPipelineName.trim(),
      color: newPipelineColor,
      is_default: pipelines.length === 0,
      created_at: now,
      updated_at: now,
    });
    setNewPipelineName('');
    loadData();
  };

  const handleDeletePipeline = async (id: number) => {
    const clientCount = await crmRepository.getClientCountByPipeline(id);
    if (clientCount === 0) {
      if (!confirm('Удалить воронку?')) return;
      await crmRepository.deletePipeline(id);
      if (selectedPipeline?.id === id) setSelectedPipeline(null);
      loadData();
    } else {
      const pip = pipelines.find(p => p.id === id)!;
      const otherPips = pipelines.filter(p => p.id !== id);
      setDeleteTargetPipelineId(otherPips[0]?.id || 0);
      setDeleteModal({ pipeline: pip, clientCount });
    }
  };

  const confirmDeletePipeline = async (mode: 'move' | 'delete') => {
    if (!deleteModal) return;
    const targetId = mode === 'move' ? deleteTargetPipelineId : undefined;
    await crmRepository.deletePipeline(deleteModal.pipeline.id!, targetId);
    if (selectedPipeline?.id === deleteModal.pipeline.id) setSelectedPipeline(null);
    setDeleteModal(null);
    loadData();
  };

  const handleSetDefault = async (id: number) => {
    await crmRepository.setDefaultPipeline(id);
    loadData();
  };

  const handleClonePipeline = async (id: number) => {
    await crmRepository.clonePipeline(id);
    loadData();
  };

  const handleRenamePipeline = async (id: number) => {
    if (!editingPipelineName.trim()) return;
    await crmRepository.updatePipeline(id, { name: editingPipelineName.trim(), updated_at: new Date().toISOString() });
    setEditingPipelineId(null);
    loadData();
  };

  const startRenamePipeline = (pip: CrmPipeline) => {
    setEditingPipelineId(pip.id!);
    setEditingPipelineName(pip.name);
  };

  // ─── Stage actions ────────────────────────

  const handleAddStage = async () => {
    if (!selectedPipeline?.id || !newStageName.trim()) return;
    const existingStages = stagesMap[selectedPipeline.id!] || [];
    await crmRepository.addStage({
      pipeline_id: selectedPipeline.id,
      name: newStageName.trim(),
      order: existingStages.length,
      color: newStageColor,
      created_at: new Date().toISOString(),
    });
    setNewStageName('');
    loadData();
  };

  const handleDeleteStage = async (id: number) => {
    if (!confirm('Удалить этап?')) return;
    await crmRepository.deleteStage(id);
    loadData();
  };

  const handleRenameStage = async (id: number, newName: string) => {
    if (!newName.trim()) return;
    await crmRepository.updateStage(id, { name: newName.trim() });
    loadData();
  };

  // ─── Bot settings ─────────────────────────

  const handleSaveBot = async () => {
    await crmRepository.saveBotSettings({
      zai_token: zaiToken,
      context_template: contextTemplate,
      mode: botMode,
      is_active: botActive,
    });
    setBotSaved(true);
    setTimeout(() => setBotSaved(false), 2000);
    loadData();
  };

  // ─── Sources ──────────────────────────────

  const handleAddSource = async () => {
    if (!newSourceCode.trim() || !newSourceName.trim()) return;
    const existing = sources.find(s => s.code === newSourceCode.trim().toLowerCase());
    if (existing) { alert('Источник с таким кодом уже существует'); return; }
    await crmRepository.addSource({
      code: newSourceCode.trim().toLowerCase(),
      name: newSourceName.trim(),
      color: newSourceColor,
      is_system: false,
      created_at: new Date().toISOString(),
    });
    setNewSourceCode('');
    setNewSourceName('');
    setNewSourceColor('#3b82f6');
    loadData();
  };

  const handleDeleteSource = async (id: number) => {
    try {
      if (!confirm('Удалить источник?')) return;
      await crmRepository.deleteSource(id);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  const handleRenameSource = async (id: number, newName: string) => {
    if (!newName.trim()) return;
    await crmRepository.updateSource(id, { name: newName.trim() });
    loadData();
  };

  const handleChangeSourceColor = async (id: number, color: string) => {
    await crmRepository.updateSource(id, { color });
    loadData();
  };

  // ─── Stage Actions ──────────────────────

  const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    create_task: { label: 'Создать задачу', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    send_message: { label: 'Отправить сообщение', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    change_status: { label: 'Изменить статус', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    notify: { label: 'Уведомление', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    webhook: { label: 'Webhook', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
  };

  const openAddAction = (stageId: number) => {
    setSelectedActionStage(stageId);
    setEditingAction(null);
    setActionFormType('create_task');
    setActionFormName('');
    setActionFormActive(true);
    setActionFormConfig({});
    setShowActionModal(true);
  };

  const openEditAction = (action: CrmStageAction) => {
    setSelectedActionStage(action.stage_id);
    setEditingAction(action);
    setActionFormType(action.type);
    setActionFormName(action.name);
    setActionFormActive(action.is_active);
    setActionFormConfig({ ...action.config });
    setShowActionModal(true);
  };

  const handleSaveAction = async () => {
    if (!actionFormName.trim() || !selectedActionStage) return;
    const now = new Date().toISOString();

    if (editingAction) {
      await crmRepository.updateStageAction(editingAction.id!, {
        type: actionFormType,
        name: actionFormName.trim(),
        is_active: actionFormActive,
        config: actionFormConfig,
      });
    } else {
      const existing = actionsMap[selectedActionStage] || [];
      await crmRepository.addStageAction({
        stage_id: selectedActionStage,
        type: actionFormType,
        name: actionFormName.trim(),
        is_active: actionFormActive,
        config: actionFormConfig,
        order: existing.length,
        created_at: now,
        updated_at: now,
      });
    }
    setShowActionModal(false);
    loadData();
  };

  const handleDeleteAction = async (id: number) => {
    if (!confirm('Удалить действие?')) return;
    await crmRepository.deleteStageAction(id);
    loadData();
  };

  const handleToggleAction = async (id: number) => {
    await crmRepository.toggleStageAction(id);
    loadData();
  };

  // ─── Parsing Sources ──────────────────────

  const handleParsingPipelineChange = async (pipelineId: number) => {
    setNewParsingPipelineId(pipelineId);
    const sts = await crmRepository.getStages(pipelineId);
    setParsingStages(sts);
    if (sts.length > 0) setNewParsingStageId(sts[0].id!);
  };

  const handleAddParsingSource = async () => {
    if (!newParsingUrl.trim() || !newParsingPipelineId || !newParsingStageId) return;
    try {
      const sourceType = detectSourceType(newParsingUrl.trim());
      await crmRepository.addParsingSource({
        url: newParsingUrl.trim(),
        source_type: sourceType,
        pipeline_id: newParsingPipelineId,
        stage_id: newParsingStageId,
        last_parsed_at: undefined,
        listings_count: 0,
        created_at: new Date().toISOString(),
      });
      setNewParsingUrl('');
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleDeleteParsingSource = async (id: number) => {
    if (!confirm('Удалить источник парсинга?')) return;
    await crmRepository.deleteParsingSource(id);
    loadData();
  };

  const handleRunParsing = async (source: CrmParsingSource) => {
    setParsingRunning(true);
    setParsingResult(null);
    setParsingProgress({ stage: 'opening', detail: 'Запуск...', found: 0, created: 0, duplicates: 0 });
    try {
      const result = await parseSourceForLeads(source, (p) => setParsingProgress(p));
      setParsingResult(`${result.newLeads} новых лидов, ${result.skipped} пропущено из ${result.found} найденных`);
      loadData();
    } catch (e) {
      setParsingResult(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setParsingRunning(false);
    }
  };

  const handleRunAllParsing = async () => {
    if (parsingSources.length === 0) return;
    setParsingRunning(true);
    setParsingResult(null);
    let totalNew = 0;
    let totalSkipped = 0;
    for (let i = 0; i < parsingSources.length; i++) {
      setParsingProgress({ stage: 'opening', detail: `Источник ${i + 1}/${parsingSources.length}...`, found: 0, created: 0, duplicates: 0 });
      try {
        const result = await parseSourceForLeads(parsingSources[i], (p) => setParsingProgress(p));
        totalNew += result.newLeads;
        totalSkipped += result.skipped;
      } catch {
        // continue
      }
    }
    setParsingResult(`Итого: ${totalNew} новых лидов, ${totalSkipped} пропущено`);
    setParsingRunning(false);
    loadData();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Настройки CRM</h1>
          </div>
        </div>

        <div className="space-y-4">
          {/* ─── Pipelines ────────────────── */}
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-white">Воронки</h3>
              <span className="text-[11px] text-zinc-500">{pipelines.length} воронок</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Existing pipelines */}
              <div className="space-y-2">
                {pipelines.length === 0 && (
                  <div className="text-center text-xs text-zinc-400 py-4">Воронок пока нет. Создайте первую.</div>
                )}
                {pipelines.map(pip => (
                  <div key={pip.id} className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pip.color }} />
                      {editingPipelineId === pip.id ? (
                        <input
                          type="text"
                          value={editingPipelineName}
                          onChange={e => setEditingPipelineName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRenamePipeline(pip.id!); if (e.key === 'Escape') setEditingPipelineId(null); }}
                          onBlur={() => handleRenamePipeline(pip.id!)}
                          autoFocus
                          className="flex-1 min-w-0 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-xs font-medium text-zinc-900 dark:text-white truncate">{pip.name}</span>
                      )}
                      {pip.is_default && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium flex-shrink-0">По умолчанию</span>
                      )}
                      <span className="text-[10px] text-zinc-400 flex-shrink-0">{(stagesMap[pip.id!] || []).length} этапов</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {editingPipelineId !== pip.id && (
                        <>
                          <button onClick={() => setSelectedPipeline(selectedPipeline?.id === pip.id ? null : pip)} className={`p-1 rounded ${selectedPipeline?.id === pip.id ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`} title="Этапы">
                            <ChevronDownIcon className="size-3.5" />
                          </button>
                          <button onClick={() => startRenamePipeline(pip)} className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Переименовать">
                            <PencilSquareIcon className="size-3.5" />
                          </button>
                        </>
                      )}
                      <button onClick={() => handleClonePipeline(pip.id!)} className="p-1 rounded text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" title="Клонировать">
                        <DocumentDuplicateIcon className="size-3.5" />
                      </button>
                      {!pip.is_default && (
                        <button onClick={() => handleSetDefault(pip.id!)} className="p-1 rounded text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Сделать по умолчанию">
                          <CheckCircleIcon className="size-3.5" />
                        </button>
                      )}
                      {pipelines.length > 1 && (
                        <button onClick={() => handleDeletePipeline(pip.id!)} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Удалить">
                          <TrashIcon className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add pipeline */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <input
                  type="text"
                  value={newPipelineName}
                  onChange={e => setNewPipelineName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddPipeline(); }}
                  placeholder="Название новой воронки"
                  className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input type="color" value={newPipelineColor} onChange={e => setNewPipelineColor(e.target.value)} className="w-8 h-7 rounded border border-zinc-300 dark:border-zinc-600 cursor-pointer" />
                <Button onClick={handleAddPipeline} disabled={!newPipelineName.trim()}>
                  <PlusIcon className="size-4" />
                  Добавить
                </Button>
              </div>

              {/* Stages for selected pipeline */}
              {selectedPipeline && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Этапы: {selectedPipeline.name}
                    </h4>
                    <button onClick={() => setSelectedPipeline(null)} className="text-[10px] text-blue-500 hover:underline">Закрыть</button>
                  </div>
                  <div className="space-y-1.5">
                    {(stagesMap[selectedPipeline.id!] || []).map((stage, idx) => (
                      <div key={stage.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-blue-400 w-4">{idx + 1}.</span>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                        <input
                          type="text"
                          value={stage.name}
                          onChange={e => handleRenameStage(stage.id!, e.target.value)}
                          className="flex-1 rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-1.5 py-0.5 text-[11px] text-zinc-900 dark:text-white"
                        />
                        <button onClick={() => handleDeleteStage(stage.id!)} className="p-0.5 rounded text-blue-400 hover:text-red-500">
                          <TrashIcon className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                    <input
                      type="text"
                      value={newStageName}
                      onChange={e => setNewStageName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddStage(); }}
                      placeholder="Новый этап"
                      className="flex-1 rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/50 px-1.5 py-0.5 text-[11px] text-zinc-900 dark:text-white"
                    />
                    <input type="color" value={newStageColor} onChange={e => setNewStageColor(e.target.value)} className="w-6 h-5 rounded border border-blue-200 dark:border-blue-700 cursor-pointer" />
                    <button onClick={handleAddStage} className="text-[10px] text-blue-600 hover:underline font-medium">Добавить</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── Stage Actions (Процессы) ──── */}
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <BoltIcon className="size-4 text-amber-500" />
                <h3 className="text-sm font-medium text-zinc-900 dark:text-white">Автоматизация процессов</h3>
              </div>
              <span className="text-[11px] text-zinc-500">Действия по этапам</span>
            </div>
            <div className="p-4 space-y-3">
              {pipelines.length === 0 ? (
                <div className="text-center text-xs text-zinc-400 py-4">Сначала создайте воронку с этапами</div>
              ) : (
                pipelines.map(pip => {
                  const stages = stagesMap[pip.id!] || [];
                  if (stages.length === 0) return null;
                  return (
                    <div key={pip.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: pip.color }} />
                        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{pip.name}</span>
                      </div>
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {stages.map(stage => {
                          const actions = actionsMap[stage.id!] || [];
                          return (
                            <div key={stage.id} className="px-3 py-2">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                                  <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{stage.name}</span>
                                  {actions.length > 0 && (
                                    <span className="text-[10px] text-zinc-400">{actions.filter(a => a.is_active).length}/{actions.length}</span>
                                  )}
                                </div>
                                <button
                                  onClick={() => openAddAction(stage.id!)}
                                  className="text-[10px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
                                >
                                  <PlusIcon className="h-3 w-3" />
                                  Действие
                                </button>
                              </div>
                              {actions.length > 0 && (
                                <div className="space-y-1 ml-3.5">
                                  {actions.map(action => {
                                    const tl = ACTION_TYPE_LABELS[action.type] || ACTION_TYPE_LABELS.notify;
                                    return (
                                      <div
                                        key={action.id}
                                        className={`flex items-center justify-between rounded px-2 py-1 text-[11px] ${
                                          action.is_active
                                            ? 'bg-zinc-50 dark:bg-zinc-800/50'
                                            : 'bg-zinc-50/50 dark:bg-zinc-800/20 opacity-50'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <button
                                            onClick={() => handleToggleAction(action.id!)}
                                            className={`w-3 h-3 rounded-sm border flex-shrink-0 ${
                                              action.is_active
                                                ? 'bg-blue-500 border-blue-500'
                                                : 'border-zinc-300 dark:border-zinc-600'
                                            }`}
                                            title={action.is_active ? 'Выключить' : 'Включить'}
                                          />
                                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-medium ${tl.color}`}>
                                            {tl.label}
                                          </span>
                                          <span className="text-zinc-700 dark:text-zinc-300 truncate">{action.name}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0">
                                          <button
                                            onClick={() => openEditAction(action)}
                                            className="p-0.5 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                            title="Редактировать"
                                          >
                                            <PencilSquareIcon className="h-3 w-3" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteAction(action.id!)}
                                            className="p-0.5 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            title="Удалить"
                                          >
                                            <TrashIcon className="h-3 w-3" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ─── Bot settings ──────────────── */}
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-purple-500" />
                <h3 className="text-sm font-medium text-zinc-900 dark:text-white">AI-ассистент (z.ai)</h3>
              </div>
              {botSaved && (
                <span className="text-[10px] text-green-600 font-medium">Сохранено</span>
              )}
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">API токен z.ai</label>
                <input
                  type="password"
                  value={zaiToken}
                  onChange={e => setZaiToken(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Контекст бота</label>
                <textarea
                  value={contextTemplate}
                  onChange={e => setContextTemplate(e.target.value)}
                  rows={4}
                  placeholder="Вы — ассистент риелтора. Помогайте общаться с собственниками недвижимости... Доступные переменные: {client_name}, {address}, {price}"
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Режим:</label>
                  <div className="flex gap-1">
                    {([
                      ['suggest', 'Подсказки'],
                      ['semi-auto', 'Полуавтомат'],
                      ['auto', 'Автомат'],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setBotMode(mode)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                          botMode === mode ? 'bg-purple-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={botActive} onChange={e => setBotActive(e.target.checked)} className="rounded border-zinc-300 text-purple-600 h-3 w-3" />
                    Активен
                  </label>
                </div>
              </div>

              <Button onClick={handleSaveBot}>
                Сохранить настройки бота
              </Button>
            </div>
          </div>

          {/* ─── Sources ──────────────── */}
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-white">Источники клиентов</h3>
              <span className="text-[11px] text-zinc-500">{sources.length} источников</span>
            </div>
            <div className="p-4 space-y-3">
              {sources.map(src => (
                <div key={src.id} className="flex items-center gap-2">
                  <input type="color" value={src.color} onChange={e => handleChangeSourceColor(src.id!, e.target.value)} className="w-6 h-5 rounded border border-zinc-300 dark:border-zinc-600 cursor-pointer flex-shrink-0" />
                  <input
                    type="text"
                    value={src.name}
                    onChange={e => handleRenameSource(src.id!, e.target.value)}
                    className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-900 dark:text-white"
                  />
                  <span className="text-[10px] text-zinc-400 font-mono flex-shrink-0">{src.code}</span>
                  {src.is_system && (
                    <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1 py-0.5 rounded flex-shrink-0">Системный</span>
                  )}
                  {!src.is_system && (
                    <button onClick={() => handleDeleteSource(src.id!)} className="p-0.5 rounded text-zinc-400 hover:text-red-500 flex-shrink-0" title="Удалить">
                      <TrashIcon className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <input
                  type="text"
                  value={newSourceCode}
                  onChange={e => setNewSourceCode(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                  placeholder="код"
                  className="w-24 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                />
                <input
                  type="text"
                  value={newSourceName}
                  onChange={e => setNewSourceName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSource(); }}
                  placeholder="Название источника"
                  className="flex-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                />
                <input type="color" value={newSourceColor} onChange={e => setNewSourceColor(e.target.value)} className="w-8 h-7 rounded border border-zinc-300 dark:border-zinc-600 cursor-pointer" />
                <Button onClick={handleAddSource} disabled={!newSourceCode.trim() || !newSourceName.trim()}>
                  <PlusIcon className="size-4" />
                  Добавить
                </Button>
              </div>
            </div>
          </div>

          {/* ─── Parsing Sources ──────────── */}
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="size-4 text-emerald-500" />
                <h3 className="text-sm font-medium text-zinc-900 dark:text-white">Источники парсинга</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">{parsingSources.length} источников</span>
                {parsingSources.length > 0 && (
                  <Button onClick={handleRunAllParsing} disabled={parsingRunning}>
                    <ArrowPathIcon className={`size-3.5 ${parsingRunning ? 'animate-spin' : ''}`} />
                    Запустить все
                  </Button>
                )}
              </div>
            </div>
            <div className="p-4 space-y-3">
              {/* Progress */}
              {parsingRunning && parsingProgress && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowPathIcon className="size-3.5 text-blue-600 animate-spin" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {parsingProgress.detail}
                    </span>
                  </div>
                  {parsingProgress.found > 0 && (
                    <div className="flex items-center gap-3 text-[10px] text-blue-600 dark:text-blue-400 ml-5">
                      <span>Найдено: {parsingProgress.found}</span>
                      <span>Новых: {parsingProgress.created}</span>
                      <span>Пропущено: {parsingProgress.duplicates}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Result */}
              {parsingResult && !parsingRunning && (
                <div className={`rounded-lg p-3 text-xs ${
                  parsingResult.startsWith('Ошибка')
                    ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                }`}>
                  {parsingResult}
                  <button onClick={() => setParsingResult(null)} className="ml-2 underline opacity-70 hover:opacity-100">Скрыть</button>
                </div>
              )}

              {/* Add form */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Добавить источник
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={newParsingUrl}
                    onChange={e => setNewParsingUrl(e.target.value)}
                    placeholder="https://www.cian.ru/cat.php?... или https://www.avito.ru/..."
                    className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Button onClick={handleAddParsingSource} disabled={!newParsingUrl.trim() || !newParsingPipelineId || !newParsingStageId}>
                    <PlusIcon className="size-3.5" />
                    Добавить
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={newParsingPipelineId}
                    onChange={e => handleParsingPipelineChange(Number(e.target.value))}
                    className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-900 dark:text-white flex-1"
                  >
                    <option value={0}>Воронка</option>
                    {pipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={newParsingStageId}
                    onChange={e => setNewParsingStageId(Number(e.target.value))}
                    className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-900 dark:text-white flex-1"
                  >
                    <option value={0}>Этап</option>
                    {parsingStages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sources list */}
              {parsingSources.length === 0 ? (
                <div className="text-center text-xs text-zinc-400 py-4">
                  Нет источников парсинга. Добавьте URL страницы ЦИАН или Авито с результатами поиска.
                </div>
              ) : (
                <div className="space-y-2">
                  {parsingSources.map(ps => {
                    const pip = pipelines.find(p => p.id === ps.pipeline_id);
                    const stages = stagesMap[ps.pipeline_id] || [];
                    const stage = stages.find(s => s.id === ps.stage_id);
                    return (
                      <div key={ps.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase flex-shrink-0 ${
                          ps.source_type === 'cian'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {ps.source_type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-zinc-900 dark:text-white truncate">{ps.url}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {pip && (
                              <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: pip.color }} />
                                {pip.name}
                              </span>
                            )}
                            {stage && (
                              <span className="text-[10px] text-zinc-400">→ {stage.name}</span>
                            )}
                            {ps.listings_count > 0 && (
                              <span className="text-[10px] text-zinc-400">{ps.listings_count} лидов</span>
                            )}
                            {ps.last_parsed_at && (
                              <span className="text-[10px] text-zinc-400">
                                {new Date(ps.last_parsed_at).toLocaleDateString('ru-RU')}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRunParsing(ps)}
                          disabled={parsingRunning}
                          className="p-1 rounded text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 flex-shrink-0"
                          title="Запустить парсинг"
                        >
                          <PlayIcon className="size-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteParsingSource(ps.id!)}
                          className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                          title="Удалить"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ─── Шаблоны сообщений ──────────── */}
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div>
                <h3 className="text-sm font-medium text-zinc-900 dark:text-white">Шаблоны сообщений</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Привязка к воронке и источнику для авто-подбора при отправке</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">{msgTemplates.length} шаблонов</span>
                <button
                  onClick={() => {
                    setIsNewTemplate(true);
                    setEditingTemplate({ name: '', body: '', pipeline_id: undefined, source: undefined, created_at: '', updated_at: '' });
                    setTmplName('');
                    setTmplBody('');
                    setTmplPipelineId('');
                    setTmplSource('');
                  }}
                  className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] text-white hover:bg-blue-700 flex items-center gap-1"
                >
                  <PlusIcon className="w-3 h-3" /> Добавить
                </button>
              </div>
            </div>

            {/* Список шаблонов */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {msgTemplates.map(t => {
                const pl = t.pipeline_id ? pipelines.find(p => p.id === t.pipeline_id) : null;
                const src = t.source ? sources.find(s => s.code === t.source) : null;
                const isEditing = editingTemplate && !isNewTemplate && editingTemplate.id === t.id;

                if (isEditing) {
                  return (
                    <div key={t.id} className="p-4 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
                      <div className="text-[10px] font-medium text-blue-700 dark:text-blue-300">Редактирование шаблона</div>
                      <input
                        type="text" value={tmplName} onChange={e => setTmplName(e.target.value)}
                        placeholder="Название шаблона"
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <select value={tmplPipelineId} onChange={e => setTmplPipelineId(e.target.value)}
                          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                        >
                          <option value="">— Любая воронка —</option>
                          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <select value={tmplSource} onChange={e => setTmplSource(e.target.value)}
                          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                        >
                          <option value="">— Любой источник —</option>
                          {sources.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                      </div>
                      <textarea value={tmplBody} onChange={e => setTmplBody(e.target.value)} rows={6}
                        placeholder="Текст шаблона..."
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                      <div className="text-[9px] text-zinc-400">
                        Переменные: {'{client_name}'} {'{phone}'} {'{address}'} {'{price}'} {'{property_type}'} {'{area}'} {'{source}'}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={async () => {
                          if (!tmplName.trim() || !tmplBody.trim()) return;
                          await crmRepository.updateMessageTemplate(t.id!, {
                            name: tmplName.trim(), body: tmplBody.trim(),
                            pipeline_id: tmplPipelineId ? Number(tmplPipelineId) : undefined,
                            source: tmplSource || undefined,
                          });
                          setEditingTemplate(null);
                          const tmpls = await crmRepository.getMessageTemplates();
                          setMsgTemplates(tmpls);
                        }} className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">Сохранить</button>
                        <button onClick={() => setEditingTemplate(null)} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300">Отмена</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-900 dark:text-white truncate">{t.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {pl ? (
                          <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{pl.name}</span>
                        ) : (
                          <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">Любая воронка</span>
                        )}
                        {src ? (
                          <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{src.name}</span>
                        ) : (
                          <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">Любой источник</span>
                        )}
                        <span className="text-[9px] text-zinc-400 truncate max-w-[200px]">{t.body.substring(0, 50)}...</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => {
                        setIsNewTemplate(false);
                        setEditingTemplate(t);
                        setTmplName(t.name);
                        setTmplBody(t.body);
                        setTmplPipelineId(t.pipeline_id ? String(t.pipeline_id) : '');
                        setTmplSource(t.source || '');
                      }} className="p-1 text-zinc-400 hover:text-blue-600" title="Редактировать">
                        <PencilSquareIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={async () => {
                        if (!confirm('Удалить шаблон «' + t.name + '»?')) return;
                        await crmRepository.deleteMessageTemplate(t.id!);
                        const tmpls = await crmRepository.getMessageTemplates();
                        setMsgTemplates(tmpls);
                      }} className="p-1 text-zinc-400 hover:text-red-600" title="Удалить">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Форма нового шаблона */}
              {isNewTemplate && (
                <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
                  <div className="text-[10px] font-medium text-blue-700 dark:text-blue-300">Новый шаблон</div>
                  <input
                    type="text" value={tmplName} onChange={e => setTmplName(e.target.value)}
                    placeholder="Название шаблона"
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <select value={tmplPipelineId} onChange={e => setTmplPipelineId(e.target.value)}
                      className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                    >
                      <option value="">— Любая воронка —</option>
                      {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select value={tmplSource} onChange={e => setTmplSource(e.target.value)}
                      className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                    >
                      <option value="">— Любой источник —</option>
                      {sources.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </div>
                  <textarea value={tmplBody} onChange={e => setTmplBody(e.target.value)} rows={6}
                    placeholder="Текст шаблона..."
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                  <div className="text-[9px] text-zinc-400">
                    Переменные: {'{client_name}'} {'{phone}'} {'{address}'} {'{price}'} {'{property_type}'} {'{area}'} {'{source}'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={async () => {
                      if (!tmplName.trim() || !tmplBody.trim()) return;
                      const now = new Date().toISOString();
                      await crmRepository.addMessageTemplate({
                        name: tmplName.trim(), body: tmplBody.trim(),
                        pipeline_id: tmplPipelineId ? Number(tmplPipelineId) : undefined,
                        source: tmplSource || undefined,
                        created_at: now, updated_at: now,
                      });
                      setIsNewTemplate(false);
                      setTmplName(''); setTmplBody(''); setTmplPipelineId(''); setTmplSource('');
                      const tmpls = await crmRepository.getMessageTemplates();
                      setMsgTemplates(tmpls);
                    }} className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">Сохранить</button>
                    <button onClick={() => { setIsNewTemplate(false); setTmplName(''); setTmplBody(''); }} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300">Отмена</button>
                  </div>
                </div>
              )}

              {msgTemplates.length === 0 && !isNewTemplate && (
                <div className="p-4 text-center">
                  <p className="text-xs text-zinc-500">Нет шаблонов. Нажмите «Добавить» для создания.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Pipeline Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDeleteModal(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Удаление воронки</h3>
              <button onClick={() => setDeleteModal(null)} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                В воронке <strong>«{deleteModal.pipeline.name}»</strong> находится <strong>{deleteModal.clientCount}</strong> клиентов. Выберите, что с ними сделать:
              </p>

              <div>
                <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Перенести клиентов в воронку:</label>
                <select
                  value={deleteTargetPipelineId}
                  onChange={e => setDeleteTargetPipelineId(Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white"
                >
                  {pipelines.filter(p => p.id !== deleteModal.pipeline.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => confirmDeletePipeline('move')}
                  className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Перенести и удалить
                </button>
                <button
                  onClick={() => { if (confirm(`Удалить ${deleteModal.clientCount} клиентов вместе с воронкой?`)) confirmDeletePipeline('delete'); }}
                  className="flex-1 rounded-md border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Удалить всё
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowActionModal(false)}>
          <div
            className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">
              {editingAction ? 'Редактировать действие' : 'Новое действие'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Название *</label>
                <input
                  type="text"
                  value={actionFormName}
                  onChange={e => setActionFormName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="Позвонить клиенту..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Тип действия</label>
                  <select
                    value={actionFormType}
                    onChange={e => setActionFormType(e.target.value as CrmStageAction['type'])}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    {Object.entries(ACTION_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={actionFormActive}
                      onChange={e => setActionFormActive(e.target.checked)}
                      className="rounded border-zinc-300 text-blue-600 h-3.5 w-3.5"
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">Активно</span>
                  </label>
                </div>
              </div>

              {/* Config fields depending on type */}
              {actionFormType === 'create_task' && (
                <div className="space-y-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Настройки задачи</div>
                  <input
                    type="text"
                    value={actionFormConfig.task_title || ''}
                    onChange={e => setActionFormConfig(prev => ({ ...prev, task_title: e.target.value }))}
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    placeholder="Заголовок задачи (если пусто — используется название)"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={actionFormConfig.task_type || 'call'}
                      onChange={e => setActionFormConfig(prev => ({ ...prev, task_type: e.target.value as any }))}
                      className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      <option value="call">Звонок</option>
                      <option value="meeting">Встреча</option>
                      <option value="email">Письмо</option>
                      <option value="reminder">Напоминание</option>
                      <option value="other">Другое</option>
                    </select>
                    <select
                      value={actionFormConfig.task_priority || 'medium'}
                      onChange={e => setActionFormConfig(prev => ({ ...prev, task_priority: e.target.value as any }))}
                      className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      <option value="low">Низкий</option>
                      <option value="medium">Средний</option>
                      <option value="high">Высокий</option>
                      <option value="urgent">Срочный</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Срок (через сколько часов)</label>
                    <input
                      type="number"
                      value={actionFormConfig.task_due_offset_hours || 24}
                      onChange={e => setActionFormConfig(prev => ({ ...prev, task_due_offset_hours: Number(e.target.value) }))}
                      className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      min={1}
                    />
                  </div>
                </div>
              )}

              {actionFormType === 'change_status' && (
                <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Новый статус сделки</div>
                  <select
                    value={actionFormConfig.target_status || 'active'}
                    onChange={e => setActionFormConfig(prev => ({ ...prev, target_status: e.target.value as any }))}
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="active">Активна</option>
                    <option value="won">Выиграна</option>
                    <option value="lost">Проиграна</option>
                    <option value="paused">Приостановлена</option>
                  </select>
                </div>
              )}

              {actionFormType === 'send_message' && (
                <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Шаблон сообщения</div>
                  <textarea
                    value={actionFormConfig.message_template || ''}
                    onChange={e => setActionFormConfig(prev => ({ ...prev, message_template: e.target.value }))}
                    rows={3}
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white resize-none"
                    placeholder="Здравствуйте, {client_name}! ..."
                  />
                </div>
              )}

              {actionFormType === 'notify' && (
                <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Текст уведомления</div>
                  <textarea
                    value={actionFormConfig.notify_text || ''}
                    onChange={e => setActionFormConfig(prev => ({ ...prev, notify_text: e.target.value }))}
                    rows={2}
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white resize-none"
                    placeholder="Сделка перешла на новый этап..."
                  />
                </div>
              )}

              {actionFormType === 'webhook' && (
                <div className="space-y-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Настройки Webhook</div>
                  <input
                    type="url"
                    value={actionFormConfig.webhook_url || ''}
                    onChange={e => setActionFormConfig(prev => ({ ...prev, webhook_url: e.target.value }))}
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    placeholder="https://..."
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={actionFormConfig.webhook_method || 'POST'}
                      onChange={e => setActionFormConfig(prev => ({ ...prev, webhook_method: e.target.value as any }))}
                      className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                    <input
                      type="text"
                      value={actionFormConfig.webhook_body || ''}
                      onChange={e => setActionFormConfig(prev => ({ ...prev, webhook_body: e.target.value }))}
                      className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      placeholder="JSON body (опционально)"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button color="light" onClick={() => setShowActionModal(false)}>Отмена</Button>
              <Button color="dark" onClick={handleSaveAction} disabled={!actionFormName.trim()}>
                {editingAction ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmSettingsPage;
