/**
 * Сервис отправки сообщений через чаты Авито и ЦИАН
 *
 * Flow:
 * 1. Открывает страницу объявления в фоновом окне
 * 2. Находит и заполняет поле ввода чата
 * 3. Нажимает кнопку отправки
 * 4. Сохраняет сообщение в CRM
 */

import { crmRepository } from '@/db/repositories/crm.repository';
import { fillTemplate } from '@/services/crm-bot-service';
import type { CrmLead, CrmClient, CrmStageAction } from '@/types';
import { getPrimaryPhone, formatPhone } from '@/types';

// ─── Типы ──────────────────────────────────────────────────────────────

export interface MessagingProgress {
  stage: 'opening' | 'waiting_page' | 'opening_chat' | 'typing' | 'sending' | 'saving' | 'done' | 'error';
  detail: string;
}

export interface SendMessageOptions {
  lead: CrmLead;
  messageText: string;
  onProgress?: (progress: MessagingProgress) => void;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
}

// ─── Утилиты ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function pg(stage: MessagingProgress['stage'], detail: string): MessagingProgress {
  return { stage, detail };
}

/** Адаптер CrmLead → CrmClient для fillTemplate */
function leadToClientLike(lead: CrmLead): CrmClient {
  return {
    full_name: lead.contact_name || 'Клиент',
    phones: lead.phones || [],
    source: lead.source,
    ad_data: lead.ad_data ? {
      address: lead.ad_data.address,
      price: lead.ad_data.price,
      property_type: lead.ad_data.property_type,
      area_total: lead.ad_data.area_total,
    } : undefined,
  } as CrmClient;
}

/** Подстановка переменных из лида в шаблон */
export function fillTemplateForLead(template: string, lead: CrmLead): string {
  return fillTemplate(template, leadToClientLike(lead));
}

/** Загрузка шаблонов сообщений для пайплайна лида */
export async function getTemplatesForLead(lead: CrmLead): Promise<CrmStageAction[]> {
  const actions = await crmRepository.getActionsForPipeline(lead.pipeline_id);
  return actions.filter(a => a.type === 'send_message' && a.is_active && a.config.message_template);
}

/** Определение источника по lead.source или lead.source_url */
function detectSource(lead: CrmLead): 'avito' | 'cian' | null {
  if (lead.source === 'avito' || lead.source_url?.includes('avito.ru')) return 'avito';
  if (lead.source === 'cian' || lead.source_url?.includes('cian.ru')) return 'cian';
  return null;
}

/** Ожидание загрузки вкладки */
function waitForTabLoad(tabId: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Таймаут загрузки страницы'));
        return;
      }
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (tab.status === 'complete') {
          resolve();
        } else {
          setTimeout(poll, 500);
        }
      });
    };
    poll();
  });
}

// ─── Связь с service worker ────────────────────────────────────────────

async function sendToWorker<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

async function openChat(tabId: number, source: 'avito' | 'cian'): Promise<{ success: boolean; error?: string }> {
  const msgType = source === 'avito' ? 'OPEN_AVITO_CHAT' : 'OPEN_CIAN_CHAT';
  return sendToWorker({ type: msgType, tabId });
}

async function typeAndSend(tabId: number, text: string): Promise<{ success: boolean; error?: string }> {
  return sendToWorker({ type: 'TYPE_AND_SEND_MESSAGE', tabId, text });
}

// ─── Главная функция отправки ──────────────────────────────────────────

export async function sendMessageToLead(options: SendMessageOptions): Promise<SendMessageResult> {
  const { lead, messageText, onProgress } = options;

  const source = detectSource(lead);
  if (!source) {
    return { success: false, error: 'Отправка поддерживается только для Авито и ЦИАН' };
  }

  const listingUrl = lead.source_url || lead.ad_data?.url;
  if (!listingUrl) {
    return { success: false, error: 'У лида нет ссылки на объявление' };
  }

  let tabId: number | undefined;
  try {
    // 1. Открываем страницу объявления в новой вкладке текущего окна
    onProgress?.(pg('opening', 'Открытие страницы объявления...'));
    const tab = await chrome.tabs.create({ url: listingUrl, active: false });
    tabId = tab.id!;

    // 2. Ждём загрузки
    onProgress?.(pg('waiting_page', 'Загрузка страницы...'));
    await waitForTabLoad(tabId);
    await sleep(3000); // Даём время на рендер JS

    // 3. Для ЦИАН — открываем чат, вставляем текст, но НЕ отправляем (капча)
    if (source === 'cian') {
      onProgress?.(pg('opening_chat', 'Открытие чата на ЦИАН...'));
      const chatResult = await openChat(tabId, 'cian');
      if (!chatResult.success) {
        return { success: false, error: chatResult.error || 'Не удалось открыть чат на ЦИАН' };
      }
      await sleep(3000);

      // Вставляем текст в чат (без отправки — пользователь сам нажмёт кнопку)
      onProgress?.(pg('typing', 'Ввод текста сообщения...'));
      const fillResult = await typeAndSend(tabId, '__FILL_ONLY__' + messageText);
      // Не проверяем результат — даже если не удалось вставить, вкладка открыта

      // Активируем вкладку, чтобы пользователь увидел чат
      await chrome.tabs.update(tabId, { active: true });

      // Не закрываем вкладку и не помечаем как отправленное
      tabId = undefined; // Чтобы finally не закрыл вкладку

      onProgress?.(pg('done', 'Текст вставлен. Нажмите «Отправить» в чате ЦИАН.'));

      // Сохраняем в CRM
      if (lead.status === 'new' && lead.id) {
        await crmRepository.updateLead(lead.id, {
          status: 'contacted',
          updated_at: new Date().toISOString(),
        });
      }

      return { success: true };
    }

    // 4. Для Авито — заполняем текст, пользователь отправляет сам
    onProgress?.(pg('typing', 'Ввод текста сообщения...'));
    await typeAndSend(tabId, messageText);

    // Активируем вкладку, чтобы пользователь увидел чат
    await chrome.tabs.update(tabId, { active: true });

    // Не закрываем вкладку
    tabId = undefined;

    onProgress?.(pg('done', 'Текст вставлен. Нажмите кнопку отправки на Авито.'));

    // Обновляем статус лида на "contacted"
    if (lead.status === 'new' && lead.id) {
      await crmRepository.updateLead(lead.id, {
        status: 'contacted',
        updated_at: new Date().toISOString(),
      });
    }

    return { success: true };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[CRM Messaging]', error);
    onProgress?.(pg('error', error));
    return { success: false, error };
  } finally {
    // Закрываем вкладку
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}
