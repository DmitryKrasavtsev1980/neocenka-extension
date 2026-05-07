/**
 * Настройки CRM — воронки, бот, API
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import { Button } from '@/components/catalyst/button';
import type { CrmPipeline, CrmStage, CrmBotSettings } from '@/types';
import {
  TrashIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  PlusIcon,
  SparklesIcon,
  CheckCircleIcon,
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
    if (!confirm('Удалить воронку? Клиенты будут перенесены в воронку по умолчанию.')) return;
    await crmRepository.deletePipeline(id);
    if (selectedPipeline?.id === id) setSelectedPipeline(null);
    loadData();
  };

  const handleSetDefault = async (id: number) => {
    await crmRepository.setDefaultPipeline(id);
    loadData();
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
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pip.color }} />
                      <span className="text-xs font-medium text-zinc-900 dark:text-white">{pip.name}</span>
                      {pip.is_default && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">По умолчанию</span>
                      )}
                      <span className="text-[10px] text-zinc-400">{(stagesMap[pip.id!] || []).length} этапов</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setSelectedPipeline(selectedPipeline?.id === pip.id ? null : pip)} className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Этапы">
                        <PencilSquareIcon className="size-3.5" />
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

          {/* ─── Messaging (stub) ──────────── */}
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-white">Отправка сообщений</h3>
              <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">В разработке</span>
            </div>
            <div className="p-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Отправка сообщений через MAX, ЦИАН, Авито будет доступна в следующих обновлениях.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CrmSettingsPage;
