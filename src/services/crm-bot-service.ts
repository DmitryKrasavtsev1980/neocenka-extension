/**
 * Сервис AI-бота CRM — генерация сообщений через z.ai
 */

import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmClient, CrmMessage } from '@/types';

interface BotGenerateOptions {
  client: CrmClient;
  messages: CrmMessage[];
  userMessage?: string;
}

interface BotGenerateResult {
  text: string;
  error?: string;
}

/**
 * Получить настройки бота
 */
export async function getBotSettings() {
  return crmRepository.getBotSettings();
}

/**
 * Заменить переменные в шаблоне контекста
 */
function fillTemplate(template: string, client: CrmClient): string {
  return template
    .replace(/\{client_name\}/g, client.full_name || 'Клиент')
    .replace(/\{phone\}/g, client.phone || '—')
    .replace(/\{address\}/g, client.ad_data?.address || '—')
    .replace(/\{price\}/g, client.ad_data?.price ? `${client.ad_data.price.toLocaleString('ru-RU')} ₽` : '—')
    .replace(/\{property_type\}/g, client.ad_data?.property_type || '—')
    .replace(/\{area\}/g, client.ad_data?.area_total ? `${client.ad_data.area_total} м²` : '—')
    .replace(/\{source\}/g, client.source || '—');
}

/**
 * Сгенерировать сообщение через z.ai API
 */
export async function generateBotMessage(options: BotGenerateOptions): Promise<BotGenerateResult> {
  const settings = await crmRepository.getBotSettings();

  if (!settings?.zai_token) {
    return { text: '', error: 'API токен z.ai не задан. Укажите его в настройках CRM.' };
  }

  if (!settings.is_active) {
    return { text: '', error: 'AI-бот отключён. Включите его в настройках CRM.' };
  }

  const systemPrompt = settings.context_template
    ? fillTemplate(settings.context_template, options.client)
    : `Вы — ассистент риелтора. Помогайте общаться с собственником недвижимости ${options.client.full_name}. Будьте вежливы и профессиональны. Объект: ${options.client.ad_data?.address || 'не указан'}, цена: ${options.client.ad_data?.price?.toLocaleString('ru-RU') || 'не указана'} ₽.`;

  // Собираем историю переписки
  const historyMessages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Добавляем последние сообщения
  const recentMessages = options.messages.slice(-20);
  for (const msg of recentMessages) {
    historyMessages.push({
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // Если есть пользовательский запрос — добавляем
  if (options.userMessage) {
    historyMessages.push({ role: 'user', content: options.userMessage });
  } else {
    historyMessages.push({
      role: 'user',
      content: 'Предложи следующее сообщение для отправки клиенту. Учитывай контекст переписки и данные объекта. Только текст сообщения, без пояснений.',
    });
  }

  try {
    const response = await fetch('https://api.z.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.zai_token}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: historyMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { text: '', error: `Ошибка API: ${response.status} — ${errorData?.error?.message || response.statusText}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    return { text };
  } catch (e) {
    return { text: '', error: `Ошибка сети: ${e instanceof Error ? e.message : String(e)}` };
  }
}
