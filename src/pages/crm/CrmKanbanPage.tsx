/**
 * Канбан-доска CRM — этапы воронки с карточками сделок
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import { db } from '@/db/database';
import type { CrmPipeline, CrmStage, CrmDeal, CrmClient } from '@/types';
import { Button } from '@/components/catalyst/button';
import { ChevronDownIcon } from '@heroicons/react/16/solid';

const CrmKanbanPage: React.FC = () => {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<CrmPipeline | null>(null);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [dealsByStage, setDealsByStage] = useState<Record<number, CrmDeal[]>>({});
  const [clientMap, setClientMap] = useState<Map<number, CrmClient>>(new Map());
  const [dragDealId, setDragDealId] = useState<number | null>(null);
  const [dragFromStage, setDragFromStage] = useState<number | null>(null);
  const [showPipelineSelect, setShowPipelineSelect] = useState(false);

  // Drag-to-scroll для канбан-доски
  const boardRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleBoardMouseDown = (e: React.MouseEvent) => {
    // Не начинать скролл если клик на карточке (draggable элемент)
    const target = e.target as HTMLElement;
    if (target.closest('[data-card]')) return;
    if (!boardRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - boardRef.current.offsetLeft;
    scrollLeft.current = boardRef.current.scrollLeft;
    boardRef.current.style.cursor = 'grabbing';
    boardRef.current.style.userSelect = 'none';
  };

  const handleBoardMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !boardRef.current) return;
    e.preventDefault();
    const x = e.pageX - boardRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    boardRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleBoardMouseUp = () => {
    isDragging.current = false;
    if (boardRef.current) {
      boardRef.current.style.cursor = 'grab';
      boardRef.current.style.userSelect = '';
    }
  };

  const loadPipelines = useCallback(async () => {
    const pips = await crmRepository.getPipelines();
    setPipelines(pips);
    if (pips.length > 0 && !activePipeline) {
      setActivePipeline(pips.find(p => p.is_default) || pips[0]);
    }
  }, [activePipeline]);

  const loadClients = useCallback(async () => {
    const allClients = await db.crm_clients.toArray();
    setClientMap(new Map(allClients.map(c => [c.id!, c])));
  }, []);

  const loadKanbanData = useCallback(async () => {
    if (!activePipeline?.id) return;
    const stgs = await crmRepository.getStages(activePipeline.id);
    setStages(stgs);

    const map: Record<number, CrmDeal[]> = {};
    for (const stage of stgs) {
      if (stage.id) {
        map[stage.id] = await crmRepository.getDealsByStage(activePipeline.id!, stage.id);
      }
    }
    setDealsByStage(map);
  }, [activePipeline]);

  useEffect(() => {
    crmRepository.ensureDefaultPipeline().then(() => loadPipelines());
  }, [loadPipelines]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadKanbanData();
  }, [loadKanbanData]);

  const handleDragStart = (dealId: number, stageId: number) => {
    setDragDealId(dealId);
    setDragFromStage(stageId);
  };

  const handleDrop = async (targetStageId: number) => {
    if (dragDealId == null) return;
    await crmRepository.moveDealToStage(dragDealId, targetStageId);
    setDragDealId(null);
    setDragFromStage(null);
    loadKanbanData();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const totalDeals = Object.values(dealsByStage).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Канбан
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                {totalDeals} сделок
              </span>
            </h1>
          </div>
          <div className="relative">
            <Button color="white" onClick={() => setShowPipelineSelect(!showPipelineSelect)}>
              {activePipeline?.name || 'Воронка'}
              <ChevronDownIcon className="size-4" />
            </Button>
            {showPipelineSelect && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 z-50">
                {pipelines.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActivePipeline(p);
                      setShowPipelineSelect(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${
                      activePipeline?.id === p.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || '#6b7280' }} />
                    <span className="flex-1">{p.name}</span>
                    {p.is_default && (
                      <span className="text-[9px] text-zinc-400 bg-zinc-100 dark:bg-zinc-700 px-1 py-0.5 rounded">По умолч.</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Kanban Board */}
        {stages.length === 0 ? (
          <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden">
            <div className="px-4 py-12 text-center text-zinc-400 text-sm">
              Нет этапов в воронке. Создайте воронку в настройках.
            </div>
          </div>
        ) : (
          <div
            ref={boardRef}
            className="flex gap-3 overflow-x-auto pb-4"
            style={{ minHeight: 'calc(100vh - 200px)', cursor: 'grab' }}
            onMouseDown={handleBoardMouseDown}
            onMouseMove={handleBoardMouseMove}
            onMouseUp={handleBoardMouseUp}
            onMouseLeave={handleBoardMouseUp}
          >
            {stages.map(stage => {
              const deals = dealsByStage[stage.id!] || [];
              return (
                <div
                  key={stage.id}
                  className="w-72 flex-shrink-0 flex flex-col rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(stage.id!)}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color || '#6b7280' }} />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{stage.name}</span>
                    </div>
                    <span className="text-[10px] font-medium text-zinc-500 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{deals.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {deals.map(deal => {
                      const client = clientMap.get(deal.client_id);
                      return (
                        <div
                          key={deal.id}
                          data-card
                          draggable
                          onDragStart={() => handleDragStart(deal.id!, stage.id!)}
                          className={`bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2.5 cursor-grab hover:shadow-sm transition-shadow ${
                            dragDealId === deal.id ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="text-[11px] font-medium text-zinc-900 dark:text-white mb-1">{deal.title}</div>
                          {client && (
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{client.full_name}</div>
                          )}
                          {deal.amount != null && (
                            <div className="text-[10px] text-green-600 dark:text-green-400 font-medium mt-0.5">
                              {deal.amount.toLocaleString('ru-RU')} ₽
                            </div>
                          )}
                          {deal.ad_data?.address && (
                            <div className="text-[10px] text-zinc-400 mt-1 truncate">{deal.ad_data.address}</div>
                          )}
                        </div>
                      );
                    })}
                    {deals.length === 0 && (
                      <div className="text-center text-[10px] text-zinc-400 py-4">Пусто</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CrmKanbanPage;
