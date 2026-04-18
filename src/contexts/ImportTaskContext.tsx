import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { importFromUrl } from '@/services/csv-parser';
import { logImport, type ManifestFile } from '@/services/api-service';
import { downloadCadastralData, type CadastralDownloadProgress } from '@/services/cadastral.service';

export interface ImportTask {
  id: string;
  type: 'deals' | 'cadastral';
  label: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  detail?: string;
}

interface ImportTaskContextValue {
  tasks: ImportTask[];
  startDealsImport: (files: ManifestFile[], moduleCode: string) => void;
  startCadastralImport: (moduleCode: string, regionCodes: string[], regionNames: string[]) => void;
  removeTask: (taskId: string) => void;
}

const ImportTaskContext = createContext<ImportTaskContextValue | null>(null);

export function useImportTasks(): ImportTaskContextValue {
  const ctx = useContext(ImportTaskContext);
  if (!ctx) throw new Error('useImportTasks must be used within ImportTaskProvider');
  return ctx;
}

export function ImportTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const updateTask = useCallback((taskId: string, updates: Partial<ImportTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const startDealsImport = useCallback(
    (files: ManifestFile[], moduleCode: string) => {
      const taskId = crypto.randomUUID();

      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          type: 'deals',
          label: `Сделки: ${files.length} файл(ов)`,
          status: 'running',
          progress: 0,
          detail: `0 из ${files.length}`,
        },
      ]);

      // Запускаем в фоне — не await
      (async () => {
        let completed = 0;
        for (const file of files) {
          updateTask(taskId, { detail: `Загрузка: ${file.region_name}` });
          try {
            await importFromUrl({
              fileId: file.id,
              regionCode: file.region_code,
              regionName: file.region_name,
              year: file.year,
              quarter: file.quarter,
              expectedRecords: file.records,
            });
            try {
              await logImport(file.id);
            } catch {
              // Не критично
            }
          } catch {
            // Пропускаем ошибку — продолжаем со следующим файлом
          }
          completed++;
          updateTask(taskId, {
            progress: Math.round((completed / files.length) * 100),
            detail: `${completed} из ${files.length}`,
          });
        }
        updateTask(taskId, { status: 'done', progress: 100, detail: 'Завершено' });
        setTimeout(() => removeTask(taskId), 5000);
      })();
    },
    [updateTask, removeTask]
  );

  const startCadastralImport = useCallback(
    (moduleCode: string, regionCodes: string[], regionNames: string[]) => {
      const taskId = crypto.randomUUID();
      const regionLabel =
        regionNames.length <= 3
          ? regionNames.join(', ')
          : `${regionNames.slice(0, 2).join(', ')} +${regionNames.length - 2}`;

      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          type: 'cadastral',
          label: `Кадастр: ${regionLabel}`,
          status: 'running',
          progress: 0,
          detail: 'Загрузка...',
        },
      ]);

      // Запускаем в фоне
      (async () => {
        try {
          await downloadCadastralData(moduleCode, (progress: CadastralDownloadProgress) => {
            updateTask(taskId, {
              progress: progress.percent,
              detail:
                progress.stage === 'manifest'
                  ? 'Загрузка манифеста...'
                  : progress.stage === 'done'
                    ? 'Завершено'
                    : `${progress.downloaded} из ${progress.total}`,
            });
          }, regionCodes);

          updateTask(taskId, { status: 'done', progress: 100, detail: 'Завершено' });
          setTimeout(() => removeTask(taskId), 5000);
        } catch {
          updateTask(taskId, { status: 'error', progress: 0, detail: 'Ошибка загрузки' });
          setTimeout(() => removeTask(taskId), 8000);
        }
      })();
    },
    [updateTask, removeTask]
  );

  return (
    <ImportTaskContext.Provider value={{ tasks, startDealsImport, startCadastralImport, removeTask }}>
      {children}
    </ImportTaskContext.Provider>
  );
}
