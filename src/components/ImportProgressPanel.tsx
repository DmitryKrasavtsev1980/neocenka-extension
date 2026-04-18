import React from 'react';
import { useImportTasks, type ImportTask } from '@/contexts/ImportTaskContext';

const TaskRow: React.FC<{ task: ImportTask }> = ({ task }) => {
  const isRunning = task.status === 'running';
  const isDone = task.status === 'done';
  const isError = task.status === 'error';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
          {task.label}
        </span>
        <span className={`text-[10px] font-semibold tabular-nums whitespace-nowrap ${
          isDone ? 'text-green-600 dark:text-green-400' :
          isError ? 'text-red-500 dark:text-red-400' :
          'text-blue-600 dark:text-blue-400'
        }`}>
          {isDone ? 'Готово' : isError ? 'Ошибка' : `${task.progress}%`}
        </span>
      </div>
      {isRunning && (
        <div className="h-1 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}
      {task.detail && isRunning && (
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate block">
          {task.detail}
        </span>
      )}
    </div>
  );
};

export const ImportProgressPanel: React.FC = () => {
  const { tasks } = useImportTasks();

  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'done' || t.status === 'error');

  if (runningTasks.length === 0) return null;

  return (
    <div className="mx-2 mb-1 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-900 dark:bg-blue-950/50">
      <div className="mb-2 flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
          Импорт данных
        </span>
      </div>
      <div className="space-y-2">
        {runningTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
};
