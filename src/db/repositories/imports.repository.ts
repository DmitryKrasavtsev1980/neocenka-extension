import { db } from '../database';
import { ImportRecord } from '@/types';

/**
 * Репозиторий для работы с историей импортов
 */
export const importsRepository = {
  /**
   * Создание записи об импорте
   */
  async create(importData: Omit<ImportRecord, 'id'>): Promise<number> {
    return db.imports.add(importData as ImportRecord);
  },

  /**
   * Получение всех импортов
   */
  async getAll(): Promise<ImportRecord[]> {
    return db.imports.orderBy('imported_at').reverse().toArray();
  },

  /**
   * Получение импорта по ID
   */
  async getById(id: number): Promise<ImportRecord | undefined> {
    return db.imports.get(id);
  },

  /**
   * Проверка существования импорта по хешу файла
   * Возвращает запись только если есть связанные сделки
   */
  async findByHash(fileHash: string): Promise<ImportRecord | undefined> {
    const importRecord = await db.imports.where('file_hash').equals(fileHash).first();
    if (!importRecord || !importRecord.id) {
      return undefined;
    }
    // Проверяем, есть ли связанные сделки
    const dealsCount = await db.deals.where('import_id').equals(importRecord.id).count();
    if (dealsCount === 0) {
      // Сделок нет - удаляем "пустую" запись об импорте
      await db.imports.delete(importRecord.id);
      // Пустая запись импорта удалена
      return undefined;
    }
    return importRecord;
  },

  /**
   * Удаление импорта и связанных сделок
   */
  async delete(id: number): Promise<void> {
    // Удаляем связанные сделки
    await db.deals.where('import_id').equals(id).delete();
    // Удаляем запись об импорте
    await db.imports.delete(id);
  },

  /**
   * Подсчёт общего количества импортов
   */
  async count(): Promise<number> {
    return db.imports.count();
  },
};
