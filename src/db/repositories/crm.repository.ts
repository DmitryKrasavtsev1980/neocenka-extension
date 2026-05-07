/**
 * Репозиторий CRM — CRUD и поиск
 */

import { db } from '../database';
import type {
  CrmPipeline,
  CrmStage,
  CrmClient,
  CrmMessage,
  CrmParsingSource,
  CrmBotSettings,
  CrmClientFilters,
  CrmClientSearchResult,
} from '@/types';

export const crmRepository = {
  // ─── Pipelines ───────────────────────────────────

  async getPipelines(): Promise<CrmPipeline[]> {
    return db.crm_pipelines.toArray();
  },

  async getPipeline(id: number): Promise<CrmPipeline | undefined> {
    return db.crm_pipelines.get(id);
  },

  async getDefaultPipeline(): Promise<CrmPipeline | undefined> {
    return db.crm_pipelines.where('is_default').equals(1).first();
  },

  async addPipeline(data: Omit<CrmPipeline, 'id'>): Promise<number> {
    return db.crm_pipelines.add(data as CrmPipeline);
  },

  async updatePipeline(id: number, data: Partial<CrmPipeline>): Promise<void> {
    await db.crm_pipelines.update(id, data);
  },

  async deletePipeline(id: number): Promise<void> {
    await db.transaction('rw', db.crm_pipelines, db.crm_stages, db.crm_clients, async () => {
      // Удаляем этапы
      await db.crm_stages.where('pipeline_id').equals(id).delete();
      // Переносим клиентов в воронку по умолчанию (или удаляем)
      const defaultPipeline = await db.crm_pipelines
        .where('is_default').equals(1)
        .filter(p => p.id !== id)
        .first();
      if (defaultPipeline && defaultPipeline.id) {
        const defaultStages = await db.crm_stages
          .where('pipeline_id').equals(defaultPipeline.id)
          .sortBy('order');
        if (defaultStages.length > 0) {
          await db.crm_clients
            .where('pipeline_id').equals(id)
            .modify({ pipeline_id: defaultPipeline.id, stage_id: defaultStages[0].id });
        }
      }
      await db.crm_pipelines.delete(id);
    });
  },

  async setDefaultPipeline(id: number): Promise<void> {
    await db.transaction('rw', db.crm_pipelines, async () => {
      // Снимаем флаг со всех
      await db.crm_pipelines.toCollection().modify({ is_default: false });
      // Ставим на нужную
      await db.crm_pipelines.update(id, { is_default: true });
    });
  },

  // ─── Stages ──────────────────────────────────────

  async getStages(pipelineId: number): Promise<CrmStage[]> {
    return db.crm_stages.where('pipeline_id').equals(pipelineId).sortBy('order');
  },

  async addStage(data: Omit<CrmStage, 'id'>): Promise<number> {
    return db.crm_stages.add(data as CrmStage);
  },

  async updateStage(id: number, data: Partial<CrmStage>): Promise<void> {
    await db.crm_stages.update(id, data);
  },

  async deleteStage(id: number): Promise<void> {
    await db.crm_stages.delete(id);
  },

  async reorderStages(stageIds: number[]): Promise<void> {
    await db.transaction('rw', db.crm_stages, async () => {
      for (let i = 0; i < stageIds.length; i++) {
        await db.crm_stages.update(stageIds[i], { order: i });
      }
    });
  },

  // ─── Clients ─────────────────────────────────────

  async getClient(id: number): Promise<CrmClient | undefined> {
    return db.crm_clients.get(id);
  },

  async addClient(data: Omit<CrmClient, 'id'>): Promise<number> {
    return db.crm_clients.add(data as CrmClient);
  },

  async updateClient(id: number, data: Partial<CrmClient>): Promise<void> {
    await db.crm_clients.update(id, { ...data, updated_at: new Date().toISOString() });
  },

  async deleteClient(id: number): Promise<void> {
    await db.transaction('rw', db.crm_clients, db.crm_messages, async () => {
      await db.crm_messages.where('client_id').equals(id).delete();
      await db.crm_clients.delete(id);
    });
  },

  async getClientsByStage(pipelineId: number, stageId: number): Promise<CrmClient[]> {
    return db.crm_clients
      .where('pipeline_id').equals(pipelineId)
      .filter(c => c.stage_id === stageId)
      .toArray();
  },

  async moveClientToStage(clientId: number, stageId: number): Promise<void> {
    await db.crm_clients.update(clientId, {
      stage_id: stageId,
      updated_at: new Date().toISOString(),
    });
  },

  async searchClients(
    filters: CrmClientFilters,
    page = 1,
    pageSize = 50,
  ): Promise<CrmClientSearchResult> {
    let collection = db.crm_clients.orderBy('created_at').reverse();

    const all = await collection.toArray();

    let filtered = all;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.full_name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q),
      );
    }
    if (filters.source) {
      filtered = filtered.filter(c => c.source === filters.source);
    }
    if (filters.pipeline_id) {
      filtered = filtered.filter(c => c.pipeline_id === filters.pipeline_id);
    }
    if (filters.stage_id) {
      filtered = filtered.filter(c => c.stage_id === filters.stage_id);
    }
    if (filters.status) {
      filtered = filtered.filter(c => c.status === filters.status);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const clients = filtered.slice(start, start + pageSize);

    return { clients, total, page, pageSize };
  },

  async bulkInsertClients(clients: Omit<CrmClient, 'id'>[]): Promise<{ inserted: number; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;

    await db.transaction('rw', db.crm_clients, async () => {
      for (const client of clients) {
        // Проверка дублирования по телефону
        const existing = await db.crm_clients
          .where('phone').equals(client.phone)
          .first();

        if (existing) {
          duplicates++;
        } else {
          await db.crm_clients.add(client as CrmClient);
          inserted++;
        }
      }
    });

    return { inserted, duplicates };
  },

  async getClientCount(): Promise<number> {
    return db.crm_clients.count();
  },

  async getClientsByStatus(): Promise<Record<string, number>> {
    const clients = await db.crm_clients.toArray();
    const counts: Record<string, number> = {};
    for (const c of clients) {
      counts[c.status] = (counts[c.status] || 0) + 1;
    }
    return counts;
  },

  // ─── Messages ────────────────────────────────────

  async getClientMessages(clientId: number): Promise<CrmMessage[]> {
    return db.crm_messages
      .where('client_id').equals(clientId)
      .sortBy('created_at');
  },

  async addMessage(data: Omit<CrmMessage, 'id'>): Promise<number> {
    return db.crm_messages.add(data as CrmMessage);
  },

  async deleteMessage(id: number): Promise<void> {
    await db.crm_messages.delete(id);
  },

  // ─── Parsing Sources ─────────────────────────────

  async getParsingSources(): Promise<CrmParsingSource[]> {
    return db.crm_parsing_sources.orderBy('created_at').reverse().toArray();
  },

  async addParsingSource(data: Omit<CrmParsingSource, 'id'>): Promise<number> {
    return db.crm_parsing_sources.add(data as CrmParsingSource);
  },

  async updateParsingSource(id: number, data: Partial<CrmParsingSource>): Promise<void> {
    await db.crm_parsing_sources.update(id, data);
  },

  async deleteParsingSource(id: number): Promise<void> {
    await db.crm_parsing_sources.delete(id);
  },

  // ─── Bot Settings ────────────────────────────────

  async getBotSettings(): Promise<CrmBotSettings | undefined> {
    return db.crm_bot_settings.toCollection().first();
  },

  async saveBotSettings(data: Omit<CrmBotSettings, 'id'>): Promise<number> {
    // Всегда одна запись
    await db.crm_bot_settings.clear();
    return db.crm_bot_settings.add(data as CrmBotSettings);
  },

  // ─── Defaults ────────────────────────────────────

  /** Создать воронку по умолчанию с базовыми этапами, если ещё нет */
  async ensureDefaultPipeline(): Promise<number> {
    const existing = await db.crm_pipelines.count();
    if (existing > 0) {
      const def = await db.crm_pipelines.where('is_default').equals(1).first();
      return def?.id ?? (await db.crm_pipelines.toCollection().first())!.id!;
    }

    const now = new Date().toISOString();
    let pipelineId: number = 0;

    await db.transaction('rw', db.crm_pipelines, db.crm_stages, async () => {
      pipelineId = await db.crm_pipelines.add({
        name: 'Основная воронка',
        color: '#3b82f6',
        is_default: true,
        created_at: now,
        updated_at: now,
      });

      const defaultStages = [
        { name: 'Новый контакт', order: 0, color: '#6b7280' },
        { name: 'В работе', order: 1, color: '#f59e0b' },
        { name: 'Переговоры', order: 2, color: '#8b5cf6' },
        { name: 'Согласование', order: 3, color: '#3b82f6' },
        { name: 'Успешно', order: 4, color: '#10b981' },
        { name: 'Закрыто', order: 5, color: '#ef4444' },
      ];

      for (const stage of defaultStages) {
        await db.crm_stages.add({
          pipeline_id: pipelineId,
          name: stage.name,
          order: stage.order,
          color: stage.color,
          created_at: now,
        });
      }
    });

    return pipelineId;
  },
};
