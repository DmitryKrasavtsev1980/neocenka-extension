/**
 * BPMN-визуальный редактор процессов CRM
 * Упрощённая нотация: этапы воронки как узлы, переходы между ними, действия на каждом этапе
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmPipeline, CrmStage, CrmStageAction } from '@/types';
import { Button } from '@/components/catalyst/button';
import {
  ChevronLeftIcon,
  PlusIcon,
  TrashIcon,
  BoltIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/16/solid';

interface CrmBpmnPageProps {
  onNavigate?: (page: string) => void;
}

const ACTION_TYPE_COLORS: Record<string, string> = {
  create_task: '#3b82f6',
  send_message: '#8b5cf6',
  change_status: '#10b981',
  notify: '#f59e0b',
  webhook: '#6b7280',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  create_task: 'Задача',
  send_message: 'Сообщение',
  change_status: 'Статус',
  notify: 'Уведомление',
  webhook: 'Webhook',
};

interface NodePosition {
  x: number;
  y: number;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const ACTION_HEIGHT = 28;
const H_GAP = 80;
const V_GAP = 20;

const CrmBpmnPage: React.FC<CrmBpmnPageProps> = () => {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number>(0);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [actionsMap, setActionsMap] = useState<Record<number, CrmStageAction[]>>({});
  const [loading, setLoading] = useState(true);

  // SVG pan/zoom
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 800 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Выбранный узел
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);

  // Модалка действия
  const [showActionModal, setShowActionModal] = useState(false);
  const [modalActions, setModalActions] = useState<CrmStageAction[]>([]);
  const [modalStageName, setModalStageName] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pips = await crmRepository.getPipelines();
      setPipelines(pips);
      if (pips.length > 0 && !selectedPipelineId) {
        setSelectedPipelineId(pips[0].id!);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadPipelineData = useCallback(async () => {
    if (!selectedPipelineId) return;
    const sts = await crmRepository.getStages(selectedPipelineId);
    setStages(sts);

    const aMap: Record<number, CrmStageAction[]> = {};
    const actions = await crmRepository.getActionsForPipeline(selectedPipelineId);
    for (const a of actions) {
      if (!aMap[a.stage_id]) aMap[a.stage_id] = [];
      aMap[a.stage_id].push(a);
    }
    setActionsMap(aMap);
  }, [selectedPipelineId]);

  useEffect(() => {
    loadPipelineData();
  }, [loadPipelineData]);

  // Расчёт позиций узлов — этапы идут слева направо
  const nodePositions = useMemo((): Record<number, NodePosition> => {
    const positions: Record<number, NodePosition> = {};
    let x = 40;
    let maxActions = 0;

    for (const stage of stages) {
      const actions = actionsMap[stage.id!] || [];
      maxActions = Math.max(maxActions, actions.length);
      positions[stage.id!] = { x, y: 40 };
      x += NODE_WIDTH + H_GAP;
    }

    // Центрируем по вертикали если есть действия
    return positions;
  }, [stages, actionsMap]);

  const totalWidth = useMemo(() => {
    if (stages.length === 0) return 800;
    const lastPos = nodePositions[stages[stages.length - 1].id!];
    return lastPos ? lastPos.x + NODE_WIDTH + 80 : 800;
  }, [stages, nodePositions]);

  const totalHeight = useMemo(() => {
    let maxH = 120;
    for (const stage of stages) {
      const actions = actionsMap[stage.id!] || [];
      const h = NODE_HEIGHT + actions.length * ACTION_HEIGHT + 20;
      maxH = Math.max(maxH, h + 80);
    }
    return maxH;
  }, [stages, actionsMap]);

  // SVG pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = (e.clientX - dragStart.x) * (viewBox.w / (svgRef.current?.clientWidth || 800));
    const dy = (e.clientY - dragStart.y) * (viewBox.h / (svgRef.current?.clientHeight || 600));
    setViewBox(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const newW = Math.max(300, Math.min(3000, viewBox.w * scaleFactor));
    const newH = Math.max(200, Math.min(2000, viewBox.h * scaleFactor));
    setViewBox(prev => ({
      x: prev.x + (prev.w - newW) / 2,
      y: prev.y + (prev.h - newH) / 2,
      w: newW,
      h: newH,
    }));
  };

  const zoomToFit = () => {
    setViewBox({ x: -20, y: -20, w: totalWidth + 40, h: totalHeight + 40 });
  };

  const openActionsForStage = (stageId: number) => {
    const actions = actionsMap[stageId] || [];
    const stage = stages.find(s => s.id === stageId);
    setSelectedStageId(stageId);
    setModalActions(actions);
    setModalStageName(stage?.name || '');
    setShowActionModal(true);
  };

  const handleDeleteAction = async (id: number) => {
    if (!confirm('Удалить действие?')) return;
    await crmRepository.deleteStageAction(id);
    await loadPipelineData();
    // Обновляем модалку
    const updated = await crmRepository.getStageActions(selectedStageId!);
    setModalActions(updated);
  };

  const handleToggleAction = async (id: number) => {
    await crmRepository.toggleStageAction(id);
    await loadPipelineData();
    const updated = await crmRepository.getStageActions(selectedStageId!);
    setModalActions(updated);
  };

  const renderArrow = (from: NodePosition, to: NodePosition) => {
    const x1 = from.x + NODE_WIDTH;
    const y1 = from.y + NODE_HEIGHT / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_HEIGHT / 2;
    const midX = (x1 + x2) / 2;

    return (
      <g key={`arrow-${from.x}-${to.x}`}>
        <path
          d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
          fill="none"
          stroke="#d1d5db"
          strokeWidth={2}
          markerEnd="url(#arrowhead)"
        />
      </g>
    );
  };

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-shrink-0">
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-white">BPMN — Процессы</h1>

        <select
          value={selectedPipelineId}
          onChange={e => setSelectedPipelineId(Number(e.target.value))}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
        >
          {pipelines.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div className="flex-1" />

        <Button size="sm" color="light" onClick={zoomToFit}>
          <ArrowsPointingOutIcon className="h-4 w-4" />
          Вписать
        </Button>
      </div>

      {/* Легенда */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] text-zinc-500 dark:text-zinc-400 flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Задача</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Сообщение</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Статус</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Уведомление</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500" /> Webhook</span>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/20 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-zinc-400">Загрузка...</div>
        ) : stages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-zinc-400">
            Нет этапов в выбранной воронке
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="10"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
              </marker>
              {/* Тень */}
              <filter id="shadow" x="-5%" y="-5%" width="120%" height="130%">
                <feDropShadow dx="1" dy="2" stdDeviation="3" floodOpacity="0.1" />
              </filter>
            </defs>

            {/* Стартовый узел */}
            <circle cx={10} cy={40 + NODE_HEIGHT / 2} r={8} fill="#10b981" />
            <text x={10} y={40 + NODE_HEIGHT / 2 + 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="bold">S</text>
            {stages.length > 0 && nodePositions[stages[0].id!] && (
              <path
                d={`M 18 ${40 + NODE_HEIGHT / 2} L ${nodePositions[stages[0].id!].x} ${40 + NODE_HEIGHT / 2}`}
                fill="none"
                stroke="#10b981"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
              />
            )}

            {/* Стрелки между этапами */}
            {stages.map((stage, idx) => {
              if (idx === stages.length - 1) return null;
              const from = nodePositions[stage.id!];
              const to = nodePositions[stages[idx + 1].id!];
              if (!from || !to) return null;
              return renderArrow(from, to);
            })}

            {/* Узлы этапов */}
            {stages.map(stage => {
              const pos = nodePositions[stage.id!];
              if (!pos) return null;
              const actions = actionsMap[stage.id!] || [];
              const isSelected = selectedStageId === stage.id;
              const totalH = NODE_HEIGHT + actions.length * ACTION_HEIGHT;

              return (
                <g
                  key={stage.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedStageId(stage.id!)}
                >
                  {/* Фон узла */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_WIDTH}
                    height={totalH}
                    rx={8}
                    fill={isSelected ? '#eff6ff' : '#ffffff'}
                    stroke={isSelected ? '#3b82f6' : stage.color}
                    strokeWidth={isSelected ? 2 : 1.5}
                    filter="url(#shadow)"
                  />

                  {/* Заголовок этапа */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={8}
                    fill={stage.color}
                    opacity={0.1}
                  />
                  <rect
                    x={pos.x}
                    y={pos.y + NODE_HEIGHT - 1}
                    width={NODE_WIDTH}
                    height={1}
                    fill={stage.color}
                    opacity={0.2}
                  />
                  <text
                    x={pos.x + 10}
                    y={pos.y + 22}
                    fill={stage.color}
                    fontSize={11}
                    fontWeight={600}
                  >
                    {stage.name.length > 20 ? stage.name.slice(0, 18) + '...' : stage.name}
                  </text>
                  <text
                    x={pos.x + 10}
                    y={pos.y + 40}
                    fill="#9ca3af"
                    fontSize={9}
                  >
                    {actions.filter(a => a.is_active).length}/{actions.length} действий
                  </text>

                  {/* Кнопка действий */}
                  <g
                    className="cursor-pointer"
                    onClick={e => { e.stopPropagation(); openActionsForStage(stage.id!); }}
                  >
                    <rect
                      x={pos.x + NODE_WIDTH - 28}
                      y={pos.y + 8}
                      width={20}
                      height={20}
                      rx={4}
                      fill={actions.length > 0 ? '#3b82f6' : '#e5e7eb'}
                    />
                    <text
                      x={pos.x + NODE_WIDTH - 18}
                      y={pos.y + 22}
                      textAnchor="middle"
                      fill={actions.length > 0 ? 'white' : '#9ca3af'}
                      fontSize={12}
                      fontWeight="bold"
                    >
                      +
                    </text>
                  </g>

                  {/* Действия */}
                  {actions.map((action, aIdx) => (
                    <g key={action.id}>
                      <rect
                        x={pos.x + 6}
                        y={pos.y + NODE_HEIGHT + 4 + aIdx * ACTION_HEIGHT}
                        width={NODE_WIDTH - 12}
                        height={ACTION_HEIGHT - 4}
                        rx={4}
                        fill={ACTION_TYPE_COLORS[action.type] || '#6b7280'}
                        opacity={action.is_active ? 0.1 : 0.04}
                      />
                      <circle
                        cx={pos.x + 16}
                        cy={pos.y + NODE_HEIGHT + 4 + aIdx * ACTION_HEIGHT + (ACTION_HEIGHT - 4) / 2}
                        r={3}
                        fill={ACTION_TYPE_COLORS[action.type] || '#6b7280'}
                        opacity={action.is_active ? 1 : 0.4}
                      />
                      <text
                        x={pos.x + 24}
                        y={pos.y + NODE_HEIGHT + 4 + aIdx * ACTION_HEIGHT + (ACTION_HEIGHT - 4) / 2 + 3}
                        fill={action.is_active ? '#374151' : '#9ca3af'}
                        fontSize={9}
                        fontWeight={500}
                      >
                        {(action.name.length > 18 ? action.name.slice(0, 16) + '...' : action.name)}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}

            {/* Конечный узел */}
            {stages.length > 0 && nodePositions[stages[stages.length - 1].id!] && (() => {
              const lastPos = nodePositions[stages[stages.length - 1].id!];
              const endX = lastPos.x + NODE_WIDTH + 20;
              const endY = lastPos.y + NODE_HEIGHT / 2;
              const lastActions = actionsMap[stages[stages.length - 1].id!] || [];
              const lastTotalH = NODE_HEIGHT + lastActions.length * ACTION_HEIGHT;
              return (
                <g>
                  <path
                    d={`M ${lastPos.x + NODE_WIDTH} ${lastPos.y + NODE_HEIGHT / 2} L ${endX} ${endY}`}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={2}
                    markerEnd="url(#arrowhead)"
                  />
                  <circle cx={endX + 8} cy={endY} r={8} fill="#ef4444" />
                  <circle cx={endX + 8} cy={endY} r={5} fill="#ef4444" stroke="white" strokeWidth={2} />
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Модалка действий этапа */}
      {showActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowActionModal(false)}>
          <div
            className="mx-4 w-full max-w-md max-h-[70vh] rounded-xl bg-white shadow-xl dark:bg-zinc-900 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <BoltIcon className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {modalStageName}
                </h3>
              </div>
              <button
                onClick={() => setShowActionModal(false)}
                className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {modalActions.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-400">
                  Нет действий. Добавьте через Настройки → Автоматизация
                </div>
              ) : (
                modalActions.map(action => (
                  <div
                    key={action.id}
                    className={`flex items-center justify-between rounded-lg border p-2.5 ${
                      action.is_active
                        ? 'border-zinc-200 dark:border-zinc-700'
                        : 'border-zinc-100 dark:border-zinc-800 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => handleToggleAction(action.id!)}
                        className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 ${
                          action.is_active
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-zinc-300 dark:border-zinc-600'
                        }`}
                      />
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ACTION_TYPE_COLORS[action.type] || '#6b7280' }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-900 dark:text-white truncate">{action.name}</div>
                        <div className="text-[10px] text-zinc-400">{ACTION_TYPE_LABELS[action.type]}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteAction(action.id!)}
                      className="rounded p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
              <p className="text-[10px] text-zinc-400 text-center">
                Чтобы добавить/редактировать действия, перейдите в Настройки → Автоматизация процессов
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmBpmnPage;
