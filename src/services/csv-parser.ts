import Papa from 'papaparse';
import { Deal, RawCsvRow, ImportStatus, S3ManifestFile } from '@/types';
import { dealsRepository, importsRepository, db } from '@/db';
import { getDownloadUrl, getAuthHeader } from '@/services/api-service';

/**
 * Вычисление хеша файла
 */
export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Определение разделителя CSV по первой строке
 */
function detectDelimiter(firstLine: string): string {
  if (firstLine.includes('~')) return '~';
  if (firstLine.includes(';')) return ';';
  if (firstLine.includes('\t')) return '\t';
  if (firstLine.includes(',')) return ',';
  return ';'; // По умолчанию
}

/**
 * Преобразование сырой строки CSV в Deal
 */
function parseCsvRow(row: RawCsvRow, year: number, quarter: number, importId: number): Deal {
  return {
    number: parseInt(row.number) || 1,
    okato: row.okato || '',
    region_code: row.region_code || '',
    district: row.district || '',
    city: row.city || '',
    quarter_cad_number: row.quarter_cad_number || '',
    street: row.street || '',
    realestate_type_code: row.realestate_type_code || '',
    wall_material_code: row.wall_material_code || '',
    year_build: row.year_build ? parseInt(row.year_build) : null,
    floor: row.floor ? parseInt(row.floor) : null,
    purpose_code: row.purpose_code || '',
    area: parseFloat(row.area) || 0,
    period_start_date: row.period_start_date || '',
    deal_price: parseFloat(row.deal_price) || 0,
    currency: row.currency || 'рубль',
    doc_type: row.doc_type || '',
    import_id: importId,
    year_quarter: `${year}-Q${quarter}`,
  };
}

/**
 * Извлечение года и квартала из имени файла
 * Формат: dataset_СДЕЛКИ_r-r_01-92_y_2025_q_1.csv
 */
export function parseFilename(filename: string): { year: number; quarter: number } | null {
  const match = filename.match(/y_(\d{4})_q_(\d)/);
  if (match) {
    return {
      year: parseInt(match[1]),
      quarter: parseInt(match[2]),
    };
  }
  return null;
}

/**
 * Получение списка регионов из CSV файла (предпросмотр)
 */
export function previewRegions(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    console.log('[CSV Parser] === Начало previewRegions ===');
    console.log('[CSV Parser] Файл:', file.name, 'Размер:', file.size);

    const regions = new Set<string>();
    let rowsProcessed = 0;
    let isResolved = false;

    // Читаем первую строку для определения разделителя
    const reader = new FileReader();
    reader.onload = (e) => {
      const firstLine = (e.target?.result as string)?.split('\n')[0];
      if (!firstLine) {
        reject(new Error('Не удалось прочитать файл'));
        return;
      }

      const delimiter = detectDelimiter(firstLine);
      console.log('[CSV Parser] Определён разделитель:', delimiter === '~' ? 'тильда (~)' : delimiter === ';' ? 'точка с запятой (;)' : delimiter);

      Papa.parse<RawCsvRow>(file, {
        delimiter,
        header: true,
        skipEmptyLines: true,
        chunkSize: 1024 * 1024, // 1MB chunks
        chunk: (results, parser) => {
          console.log('[CSV Parser] Chunk получен, строк в чанке:', results.data.length);

          if (results.data.length > 0 && rowsProcessed === 0) {
            console.log('[CSV Parser] Поля из заголовка:', results.meta.fields);
          }

          for (const row of results.data) {
            rowsProcessed++;

            if (row.region_code) {
              regions.add(row.region_code);
            }
          }

          console.log('[CSV Parser] После чанка: строк=', rowsProcessed, 'регионов=', regions.size);
        },
        complete: () => {
          if (!isResolved) {
            console.log('[CSV Parser] Парсинг завершён нормально');
            console.log('[CSV Parser] Обработано строк:', rowsProcessed);
            console.log('[CSV Parser] Найдено регионов:', regions.size);
            isResolved = true;
            resolve([...regions].sort());
          }
        },
        error: (error) => {
          console.error('[CSV Parser] Ошибка PapaParse:', error);
          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        },
      });
    };
    reader.onerror = () => {
      reject(new Error('Ошибка чтения файла'));
    };
    reader.readAsText(file.slice(0, 1000));
  });
}

/**
 * Подсчёт количества строк в файле
 */
export function countRows(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log('[CSV Parser] Подсчёт строк в файле...');
    let count = 0;

    // Определяем разделитель
    const reader = new FileReader();
    reader.onload = (e) => {
      const firstLine = (e.target?.result as string)?.split('\n')[0];
      const delimiter = firstLine ? detectDelimiter(firstLine) : ';';

      Papa.parse(file, {
        delimiter,
        header: false,
        skipEmptyLines: true,
        chunk: (results) => {
          count += results.data.length;
        },
        complete: () => {
          // Вычитаем 1 за заголовок
          const result = Math.max(0, count - 1);
          console.log('[CSV Parser] Всего строк (без заголовка):', result);
          resolve(result);
        },
        error: (error) => {
          console.error('[CSV Parser] Ошибка при подсчёте строк:', error);
          reject(error);
        },
      });
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsText(file.slice(0, 1000));
  });
}

/**
 * Параметры импорта
 */
export interface ImportParams {
  file: File;
  year: number;
  quarter: number;
  regionCodes?: string[];
  onProgress?: (status: ImportStatus) => void;
}

/**
 * Импорт CSV файла в базу данных
 */
export async function importCsvFile(params: ImportParams): Promise<{ importId: number; recordsCount: number }> {
  const { file, year, quarter, regionCodes, onProgress } = params;

  console.log('[CSV Parser] === Начало импорта ===');
  console.log('[CSV Parser] Файл:', file.name);
  console.log('[CSV Parser] Год:', year, 'Квартал:', quarter);
  console.log('[CSV Parser] Фильтр регионов:', regionCodes?.length || 'все');

  // Вычисляем хеш файла
  onProgress?.({ isImporting: true, progress: 0, processed: 0, total: 0, stage: 'reading' });
  const fileHash = await calculateFileHash(file);

  // Проверяем на дубли
  const existingImport = await importsRepository.findByHash(fileHash);
  if (existingImport) {
    console.error('[CSV Parser] Файл уже импортирован:', existingImport.imported_at);
    throw new Error(`Файл уже был импортирован ${existingImport.imported_at.toLocaleString()}`);
  }

  // Создаём запись об импорте
  const importId = await importsRepository.create({
    filename: file.name,
    file_hash: fileHash,
    year,
    quarter,
    regions: regionCodes || [],
    records_count: 0,
    imported_at: new Date(),
  });
  console.log('[CSV Parser] Создана запись импорта ID:', importId);

  // Определяем разделитель
  const reader = new FileReader();
  const delimiter = await new Promise<string>((resolve, reject) => {
    reader.onload = (e) => {
      const firstLine = (e.target?.result as string)?.split('\n')[0];
      resolve(firstLine ? detectDelimiter(firstLine) : ';');
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsText(file.slice(0, 1000));
  });
  console.log('[CSV Parser] Разделитель для импорта:', delimiter);

  // Парсим файл
  onProgress?.({ isImporting: true, progress: 5, processed: 0, total: 0, stage: 'parsing' });

  let processed = 0;
  let total = 0;

  // Сначала подсчитаем общее количество строк
  total = await countRows(file);
  console.log('[CSV Parser] Всего строк для импорта:', total);
  onProgress?.({ isImporting: true, progress: 10, processed: 0, total, stage: 'parsing' });

  // Перечитываем файл для парсинга
  await new Promise<void>((resolve, reject) => {
    const batchSize = 5000;
    let batch: Deal[] = [];

    Papa.parse<RawCsvRow>(file, {
      delimiter,
      header: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 1024, // 1MB chunks
      chunk: async (results, parser) => {
        parser.pause();

        console.log('[CSV Parser] Обработка чанка, строк:', results.data.length);

        for (const row of results.data) {
          processed++;

          // Фильтрация по регионам
          if (regionCodes?.length && !regionCodes.includes(row.region_code)) {
            continue;
          }

          const deal = parseCsvRow(row, year, quarter, importId);
          batch.push(deal);

          // Сохраняем батчами
          if (batch.length >= batchSize) {
            console.log('[CSV Parser] Сохранение батча размером:', batch.length);
            await dealsRepository.bulkInsert(batch);
            batch = [];
          }
        }

        const progress = Math.round(10 + (processed / total) * 80);
        onProgress?.({
          isImporting: true,
          progress,
          processed,
          total,
          stage: processed < total ? 'parsing' : 'saving',
        });

        parser.resume();
      },
      complete: async () => {
        console.log('[CSV Parser] Парсинг завершён, сохранение остатка...');
        // Сохраняем оставшиеся записи
        if (batch.length > 0) {
          await dealsRepository.bulkInsert(batch);
        }
        resolve();
      },
      error: (error) => {
        console.error('[CSV Parser] Ошибка при парсинге:', error);
        reject(error);
      },
    });
  });

  // Обновляем запись об импорте
  await db.imports.update(importId, { records_count: processed });
  console.log('[CSV Parser] Импорт завершён, записей:', processed);

  onProgress?.({
    isImporting: false,
    progress: 100,
    processed,
    total,
    stage: 'done',
  });

  return { importId, recordsCount: processed };
}

/**
 * Отмена импорта (заглушка для будущей реализации)
 */
export function cancelImport(): void {
  // В PapaParse можно использовать abort(), но требуется сохранить парсер
  // Для полноценной реализации нужно использовать Worker
}

/**
 * Параметры импорта из S3
 */
export interface S3ImportParams {
  fileId: number;
  regionCode: string;
  regionName: string;
  year: number;
  quarter: number;
  expectedRecords: number;
  onProgress?: (status: ImportStatus) => void;
}

/**
 * Вычисление хеша строки
 */
async function calculateTextHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Импорт CSV файла через прокси-эндпоинт бэкенда
 */
export async function importFromUrl(params: S3ImportParams): Promise<{ importId: number; recordsCount: number }> {
  const { fileId, regionCode, regionName, year, quarter, expectedRecords, onProgress } = params;

  console.log('[S3 Import] === Начало загрузки через прокси ===');
  console.log('[S3 Import] Регион:', regionCode, regionName);
  console.log('[S3 Import] Период:', year, 'Q' + quarter);

  onProgress?.({ isImporting: true, progress: 0, processed: 0, total: expectedRecords, stage: 'reading' });

  // Скачиваем CSV через прокси бэкенда (с JWT авторизацией)
  const downloadUrl = getDownloadUrl(fileId);
  const authHeader = getAuthHeader();

  const headers: Record<string, string> = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(downloadUrl, { headers });
  if (!response.ok) {
    throw new Error(`Ошибка скачивания файла: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  console.log('[S3 Import] Файл скачан, размер:', csvText.length, 'символов');

  // Вычисляем хеш для проверки дублей
  const fileHash = await calculateTextHash(csvText);

  // Проверяем на дубли
  const existingImport = await importsRepository.findByHash(fileHash);
  if (existingImport) {
    console.log('[S3 Import] Файл уже импортирован, пропуск');
    throw new Error('already_imported');
  }

  // Создаём запись об импорте
  const filename = `${regionName}_${year}_Q${quarter}.csv`;
  const importId = await importsRepository.create({
    filename,
    file_hash: fileHash,
    year,
    quarter,
    regions: [regionCode],
    records_count: 0,
    imported_at: new Date(),
  });
  console.log('[S3 Import] Создана запись импорта ID:', importId);

  // Определяем разделитель по первой строке
  const firstLine = csvText.split('\n')[0] || '';
  const delimiter = detectDelimiter(firstLine);
  console.log('[S3 Import] Разделитель:', delimiter);

  onProgress?.({ isImporting: true, progress: 5, processed: 0, total: expectedRecords, stage: 'parsing' });

  // Парсим CSV текст
  let processed = 0;

  await new Promise<void>((resolve, reject) => {
    const batchSize = 5000;
    let batch: Deal[] = [];

    Papa.parse<RawCsvRow>(csvText, {
      delimiter,
      header: true,
      skipEmptyLines: true,
      chunk: async (results, parser) => {
        parser.pause();

        for (const row of results.data) {
          processed++;
          const deal = parseCsvRow(row, year, quarter, importId);
          batch.push(deal);

          if (batch.length >= batchSize) {
            await dealsRepository.bulkInsert(batch);
            batch = [];
          }
        }

        const progress = Math.round(10 + (processed / expectedRecords) * 80);
        onProgress?.({
          isImporting: true,
          progress: Math.min(progress, 90),
          processed,
          total: expectedRecords,
          stage: 'parsing',
        });

        parser.resume();
      },
      complete: async () => {
        if (batch.length > 0) {
          await dealsRepository.bulkInsert(batch);
        }
        resolve();
      },
      error: (error) => {
        console.error('[S3 Import] Ошибка парсинга:', error);
        reject(error);
      },
    });
  });

  // Обновляем запись об импорте
  await db.imports.update(importId, { records_count: processed });
  console.log('[S3 Import] Импорт завершён, записей:', processed);

  onProgress?.({
    isImporting: false,
    progress: 100,
    processed,
    total: expectedRecords,
    stage: 'done',
  });

  return { importId, recordsCount: processed };
}
