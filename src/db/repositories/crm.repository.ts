/**
 * Репозиторий CRM — CRUD для клиентов, сделок, воронок
 */

import { db } from '../database';
import type {
  CrmPipeline,
  CrmStage,
  CrmClient,
  CrmDeal,
  CrmDealDocument,
  CrmMessage,
  CrmParsingSource,
  CrmBotSettings,
  CrmSource,
  CrmLead,
  CrmTask,
  CrmStageAction,
  CrmClientFilters,
  CrmDealFilters,
  CrmLeadFilters,
  CrmTaskFilters,
  CrmClientSearchResult,
  CrmDealSearchResult,
  CrmLeadSearchResult,
  CrmTaskSearchResult,
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

  async deletePipeline(id: number, moveClientsTo?: number): Promise<void> {
    await db.transaction('rw', db.crm_pipelines, db.crm_stages, db.crm_deals, db.crm_deal_documents, async () => {
      // Находим сделки в этой воронке
      const dealsInPipeline = await db.crm_deals.where('pipeline_id').equals(id).toArray();

      if (moveClientsTo) {
        const targetStages = await db.crm_stages.where('pipeline_id').equals(moveClientsTo).sortBy('order');
        const firstStageId = targetStages[0]?.id;
        if (firstStageId) {
          for (const deal of dealsInPipeline) {
            await db.crm_deals.update(deal.id!, { pipeline_id: moveClientsTo, stage_id: firstStageId, updated_at: new Date().toISOString() });
          }
        }
      } else {
        // Удаляем документы и сделки
        for (const deal of dealsInPipeline) {
          await db.crm_deal_documents.where('deal_id').equals(deal.id!).delete();
        }
        await db.crm_deals.where('pipeline_id').equals(id).delete();
      }

      await db.crm_stages.where('pipeline_id').equals(id).delete();
      await db.crm_pipelines.delete(id);
    });
  },

  async getClientCountByPipeline(pipelineId: number): Promise<number> {
    return db.crm_deals.where('pipeline_id').equals(pipelineId).count();
  },

  async setDefaultPipeline(id: number): Promise<void> {
    await db.transaction('rw', db.crm_pipelines, async () => {
      await db.crm_pipelines.toCollection().modify({ is_default: false });
      await db.crm_pipelines.update(id, { is_default: true });
    });
  },

  async clonePipeline(id: number): Promise<number> {
    const source = await db.crm_pipelines.get(id);
    if (!source) throw new Error('Pipeline not found');
    const stages = await db.crm_stages.where('pipeline_id').equals(id).sortBy('order');
    const now = new Date().toISOString();

    let newId: number = 0;
    await db.transaction('rw', db.crm_pipelines, db.crm_stages, async () => {
      newId = await db.crm_pipelines.add({
        name: source.name + ' (копия)',
        color: source.color,
        is_default: false,
        created_at: now,
        updated_at: now,
      });
      for (const stage of stages) {
        await db.crm_stages.add({
          pipeline_id: newId,
          name: stage.name,
          order: stage.order,
          color: stage.color,
          created_at: now,
        });
      }
    });
    return newId;
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

  async findClientByPhone(phone: string, excludeId?: number): Promise<CrmClient[]> {
    const normalized = phone.replace(/\D/g, '');
    const all = await db.crm_clients.toArray();
    return all.filter(c => {
      if (excludeId && c.id === excludeId) return false;
      return c.phone.replace(/\D/g, '') === normalized;
    });
  },

  async findClientByEmail(email: string, excludeId?: number): Promise<CrmClient[]> {
    if (!email) return [];
    const q = email.toLowerCase().trim();
    const all = await db.crm_clients.toArray();
    return all.filter(c => {
      if (excludeId && c.id === excludeId) return false;
      return c.email?.toLowerCase().trim() === q;
    });
  },

  async updateClient(id: number, data: Partial<CrmClient>): Promise<void> {
    await db.crm_clients.update(id, { ...data, updated_at: new Date().toISOString() });
  },

  async deleteClient(id: number): Promise<void> {
    await db.transaction('rw', db.crm_clients, db.crm_deals, db.crm_deal_documents, db.crm_messages, async () => {
      const clientDeals = await db.crm_deals.where('client_id').equals(id).toArray();
      for (const deal of clientDeals) {
        await db.crm_deal_documents.where('deal_id').equals(deal.id!).delete();
      }
      await db.crm_deals.where('client_id').equals(id).delete();
      await db.crm_messages.where('client_id').equals(id).delete();
      await db.crm_clients.delete(id);
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
        c => c.full_name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
      );
    }
    if (filters.source) {
      filtered = filtered.filter(c => c.source === filters.source);
    }
    if (filters.status) {
      filtered = filtered.filter(c => c.status === filters.status);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const clients = filtered.slice(start, start + pageSize);

    return { clients, total, page, pageSize };
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

  async getDealCountByClient(clientId: number): Promise<number> {
    return db.crm_deals.where('client_id').equals(clientId).count();
  },

  // ─── Deals ───────────────────────────────────────

  async getDeal(id: number): Promise<CrmDeal | undefined> {
    return db.crm_deals.get(id);
  },

  async addDeal(data: Omit<CrmDeal, 'id'>): Promise<number> {
    return db.crm_deals.add(data as CrmDeal);
  },

  async updateDeal(id: number, data: Partial<CrmDeal>): Promise<void> {
    await db.crm_deals.update(id, { ...data, updated_at: new Date().toISOString() });
  },

  async deleteDeal(id: number): Promise<void> {
    await db.transaction('rw', db.crm_deals, db.crm_deal_documents, async () => {
      await db.crm_deal_documents.where('deal_id').equals(id).delete();
      await db.crm_deals.delete(id);
    });
  },

  async getDealsByClient(clientId: number): Promise<CrmDeal[]> {
    return db.crm_deals.where('client_id').equals(clientId).sortBy('created_at');
  },

  async getDealsByStage(pipelineId: number, stageId: number): Promise<CrmDeal[]> {
    return db.crm_deals
      .where('pipeline_id').equals(pipelineId)
      .filter(d => d.stage_id === stageId)
      .toArray();
  },

  async moveDealToStage(dealId: number, stageId: number): Promise<void> {
    await db.crm_deals.update(dealId, {
      stage_id: stageId,
      updated_at: new Date().toISOString(),
    });
    // Выполняем действия, привязанные к новому этапу
    await this.executeStageActions(dealId, stageId);
  },

  async searchDeals(
    filters: CrmDealFilters,
    page = 1,
    pageSize = 50,
  ): Promise<CrmDealSearchResult> {
    let collection = db.crm_deals.orderBy('created_at').reverse();
    const all = await collection.toArray();
    let filtered = all;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      // Поиск по названию сделки и данным клиента
      const clients = await db.crm_clients.toArray();
      const clientMap = new Map(clients.map(c => [c.id, c]));
      filtered = filtered.filter(d => {
        if (d.title.toLowerCase().includes(q)) return true;
        const client = clientMap.get(d.client_id);
        if (client && (client.full_name.toLowerCase().includes(q) || client.phone.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    if (filters.client_id) {
      filtered = filtered.filter(d => d.client_id === filters.client_id);
    }
    if (filters.pipeline_id) {
      filtered = filtered.filter(d => d.pipeline_id === filters.pipeline_id);
    }
    if (filters.stage_id) {
      filtered = filtered.filter(d => d.stage_id === filters.stage_id);
    }
    if (filters.status) {
      filtered = filtered.filter(d => d.status === filters.status);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const deals = filtered.slice(start, start + pageSize);

    return { deals, total, page, pageSize };
  },

  async getDealCount(): Promise<number> {
    return db.crm_deals.count();
  },

  // ─── Deal Documents ──────────────────────────────

  async getDealDocuments(dealId: number): Promise<CrmDealDocument[]> {
    return db.crm_deal_documents.where('deal_id').equals(dealId).toArray();
  },

  async addDealDocument(data: Omit<CrmDealDocument, 'id'>): Promise<number> {
    return db.crm_deal_documents.add(data as CrmDealDocument);
  },

  async deleteDealDocument(id: number): Promise<void> {
    await db.crm_deal_documents.delete(id);
  },

  // ─── Messages ────────────────────────────────────

  async getClientMessages(clientId: number): Promise<CrmMessage[]> {
    return db.crm_messages.where('client_id').equals(clientId).sortBy('created_at');
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

  async getParsingSource(id: number): Promise<CrmParsingSource | undefined> {
    return db.crm_parsing_sources.get(id);
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

  /** Проверить, существует ли лид с данным URL объявления */
  async leadExistsByUrl(sourceUrl: string): Promise<boolean> {
    const found = await db.crm_leads.where('source_url').equals(sourceUrl).first();
    return !!found;
  },

  /** Получить все известные URL лидов для набора */
  async getKnownLeadUrls(): Promise<Set<string>> {
    const all = await db.crm_leads.toArray();
    return new Set(all.map(l => l.source_url).filter(Boolean) as string[]);
  },

  // ─── Bot Settings ────────────────────────────────

  async getBotSettings(): Promise<CrmBotSettings | undefined> {
    return db.crm_bot_settings.toCollection().first();
  },

  async saveBotSettings(data: Omit<CrmBotSettings, 'id'>): Promise<number> {
    await db.crm_bot_settings.clear();
    return db.crm_bot_settings.add(data as CrmBotSettings);
  },

  // ─── Sources ────────────────────────────────────

  async getSources(): Promise<CrmSource[]> {
    return db.crm_sources.orderBy('created_at').toArray();
  },

  async getSource(code: string): Promise<CrmSource | undefined> {
    return db.crm_sources.where('code').equals(code).first();
  },

  async addSource(data: Omit<CrmSource, 'id'>): Promise<number> {
    return db.crm_sources.add(data as CrmSource);
  },

  async updateSource(id: number, data: Partial<CrmSource>): Promise<void> {
    await db.crm_sources.update(id, data);
  },

  async deleteSource(id: number): Promise<void> {
    const source = await db.crm_sources.get(id);
    if (source?.is_system) throw new Error('Нельзя удалить системный источник');
    await db.crm_sources.delete(id);
  },

  async ensureDefaultSources(): Promise<void> {
    const count = await db.crm_sources.count();
    if (count > 0) return;

    const now = new Date().toISOString();
    const defaults: Omit<CrmSource, 'id'>[] = [
      { code: 'manual', name: 'Вручную', color: '#6b7280', is_system: true, created_at: now },
      { code: 'cian', name: 'ЦИАН', color: '#f59e0b', is_system: true, created_at: now },
      { code: 'avito', name: 'Авито', color: '#10b981', is_system: true, created_at: now },
      { code: 'other', name: 'Другое', color: '#8b5cf6', is_system: true, created_at: now },
    ];
    await db.crm_sources.bulkAdd(defaults);
  },

  // ─── Leads ─────────────────────────────────────

  async getLeads(filters: CrmLeadFilters, page = 1, pageSize = 50): Promise<CrmLeadSearchResult> {
    let collection = db.crm_leads.orderBy('created_at').reverse();
    const all = await collection.toArray();
    let filtered = all;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(l =>
        l.contact_name.toLowerCase().includes(q) ||
        l.contact_phone.toLowerCase().includes(q) ||
        (l.contact_email?.toLowerCase().includes(q) ?? false)
      );
    }
    if (filters.source) {
      filtered = filtered.filter(l => l.source === filters.source);
    }
    if (filters.status) {
      filtered = filtered.filter(l => l.status === filters.status);
    }
    if (filters.pipeline_id) {
      filtered = filtered.filter(l => l.pipeline_id === filters.pipeline_id);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const leads = filtered.slice(start, start + pageSize);
    return { leads, total, page, pageSize };
  },

  async getLead(id: number): Promise<CrmLead | undefined> {
    return db.crm_leads.get(id);
  },

  async addLead(data: Omit<CrmLead, 'id'>): Promise<number> {
    return db.crm_leads.add(data as CrmLead);
  },

  async updateLead(id: number, data: Partial<CrmLead>): Promise<void> {
    await db.crm_leads.update(id, { ...data, updated_at: new Date().toISOString() });
  },

  async deleteLead(id: number): Promise<void> {
    await db.crm_leads.delete(id);
  },

  async convertLeadToDeal(leadId: number): Promise<{ clientId: number; dealId: number } | null> {
    const lead = await db.crm_leads.get(leadId);
    if (!lead) return null;

    const now = new Date().toISOString();

    // Проверяем, есть ли клиент с таким телефоном
    const existing = await db.crm_clients.toArray();
    const normalizedPhone = lead.contact_phone.replace(/\D/g, '');
    let clientId = existing.find(c => c.phone.replace(/\D/g, '') === normalizedPhone)?.id;

    if (!clientId) {
      clientId = await db.crm_clients.add({
        full_name: lead.contact_name,
        phone: lead.contact_phone,
        email: lead.contact_email,
        source: lead.source,
        source_url: lead.source_url,
        notes: lead.notes,
        status: 'active',
        last_contact_at: now,
        created_at: now,
        updated_at: now,
      } as CrmClient);
    }

    const dealId = await db.crm_deals.add({
      client_id: clientId,
      pipeline_id: lead.pipeline_id,
      stage_id: lead.stage_id,
      title: lead.ad_data?.address || lead.contact_name || 'Сделка из лида',
      status: 'active',
      amount: lead.ad_data?.price,
      ad_data: lead.ad_data,
      notes: lead.notes,
      created_at: now,
      updated_at: now,
    } as CrmDeal);

    await db.crm_leads.update(leadId, {
      status: 'converted',
      client_id: clientId,
      deal_id: dealId,
      updated_at: now,
    });

    return { clientId, dealId };
  },

  async getLeadCount(): Promise<number> {
    return db.crm_leads.count();
  },

  // ─── Tasks ────────────────────────────────────────

  async getTasks(filters: CrmTaskFilters, page = 1, pageSize = 50): Promise<CrmTaskSearchResult> {
    let collection = db.crm_tasks.orderBy('due_date');
    const all = await collection.toArray();
    let filtered = all;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.description?.toLowerCase().includes(q) ?? false));
    }
    if (filters.status) {
      filtered = filtered.filter(t => t.status === filters.status);
    }
    if (filters.type) {
      filtered = filtered.filter(t => t.type === filters.type);
    }
    if (filters.priority) {
      filtered = filtered.filter(t => t.priority === filters.priority);
    }
    if (filters.client_id) {
      filtered = filtered.filter(t => t.client_id === filters.client_id);
    }
    if (filters.deal_id) {
      filtered = filtered.filter(t => t.deal_id === filters.deal_id);
    }
    if (filters.date_from) {
      filtered = filtered.filter(t => t.due_date >= filters.date_from!);
    }
    if (filters.date_to) {
      filtered = filtered.filter(t => t.due_date <= filters.date_to!);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const tasks = filtered.slice(start, start + pageSize);
    return { tasks, total, page, pageSize };
  },

  async getTask(id: number): Promise<CrmTask | undefined> {
    return db.crm_tasks.get(id);
  },

  async addTask(data: Omit<CrmTask, 'id'>): Promise<number> {
    return db.crm_tasks.add(data as CrmTask);
  },

  async updateTask(id: number, data: Partial<CrmTask>): Promise<void> {
    await db.crm_tasks.update(id, { ...data, updated_at: new Date().toISOString() });
  },

  async deleteTask(id: number): Promise<void> {
    await db.crm_tasks.delete(id);
  },

  async completeTask(id: number): Promise<void> {
    await db.crm_tasks.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },

  async getTasksByDateRange(dateFrom: string, dateTo: string): Promise<CrmTask[]> {
    return db.crm_tasks
      .where('due_date')
      .between(dateFrom, dateTo, true, true)
      .toArray();
  },

  async getTaskCount(): Promise<number> {
    return db.crm_tasks.count();
  },

  async getPendingTaskCount(): Promise<number> {
    const all = await db.crm_tasks.toArray();
    return all.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
  },

  async getOverdueTaskCount(): Promise<number> {
    const now = new Date().toISOString();
    const all = await db.crm_tasks.toArray();
    return all.filter(t => (t.status === 'pending' || t.status === 'in_progress') && t.due_date < now).length;
  },

  // ─── Stage Actions ────────────────────────────────

  async getStageActions(stageId: number): Promise<CrmStageAction[]> {
    return db.crm_stage_actions.where('stage_id').equals(stageId).sortBy('order');
  },

  async getActionsForPipeline(pipelineId: number): Promise<CrmStageAction[]> {
    const stages = await db.crm_stages.where('pipeline_id').equals(pipelineId).toArray();
    const stageIds = stages.map(s => s.id!);
    const all = await db.crm_stage_actions.toArray();
    return all.filter(a => stageIds.includes(a.stage_id)).sort((a, b) => a.order - b.order);
  },

  async addStageAction(data: Omit<CrmStageAction, 'id'>): Promise<number> {
    return db.crm_stage_actions.add(data as CrmStageAction);
  },

  async updateStageAction(id: number, data: Partial<CrmStageAction>): Promise<void> {
    await db.crm_stage_actions.update(id, { ...data, updated_at: new Date().toISOString() });
  },

  async deleteStageAction(id: number): Promise<void> {
    await db.crm_stage_actions.delete(id);
  },

  async toggleStageAction(id: number): Promise<void> {
    const action = await db.crm_stage_actions.get(id);
    if (action) {
      await db.crm_stage_actions.update(id, { is_active: !action.is_active, updated_at: new Date().toISOString() });
    }
  },

  /** Выполнить действия этапа при переходе сделки */
  async executeStageActions(dealId: number, stageId: number): Promise<void> {
    const actions = await db.crm_stage_actions
      .where('stage_id').equals(stageId)
      .filter(a => a.is_active)
      .sortBy('order');

    const deal = await db.crm_deals.get(dealId);
    if (!deal) return;

    const now = new Date();

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create_task': {
            const dueDate = new Date(now.getTime() + (action.config.task_due_offset_hours || 24) * 3600_000);
            await db.crm_tasks.add({
              title: action.config.task_title || action.name,
              description: `Автоматическая задача для сделки "${deal.title}"`,
              type: action.config.task_type || 'reminder',
              priority: action.config.task_priority || 'medium',
              status: 'pending',
              due_date: dueDate.toISOString(),
              client_id: deal.client_id,
              deal_id: deal.id,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            });
            break;
          }
          case 'change_status': {
            if (action.config.target_status) {
              await db.crm_deals.update(dealId, {
                status: action.config.target_status,
                updated_at: now.toISOString(),
              });
            }
            break;
          }
          case 'notify': {
            // В расширении можно показать notification API
            if (typeof chrome !== 'undefined' && chrome.notifications) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: '/icons/icon128.png',
                title: action.name,
                message: action.config.notify_text || `Сделка "${deal.title}" перешла на новый этап`,
              });
            }
            break;
          }
          case 'send_message':
          case 'webhook':
            // Для будущей реализации
            break;
        }
      } catch (e) {
        console.error(`Stage action "${action.name}" failed:`, e);
      }
    }
  },

  // ─── Defaults ────────────────────────────────────

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
