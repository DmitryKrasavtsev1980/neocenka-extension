/**
 * Модалка отправки сообщения лиду через Авито/ЦИАН
 * С встроенным редактором шаблонов
 */

import React, { useState, useEffect, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import type { CrmLead, CrmMessageTemplate } from '@/types';
import { formatPhone } from '@/types';
import {
  sendMessageToLead,
  fillTemplateForLead,
  type MessagingProgress,
} from '@/services/crm-messaging-service';

interface SendMessageModalProps {
  lead: CrmLead;
  onClose: () => void;
  onSent?: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  opening: 'Открытие страницы...',
  waiting_page: 'Загрузка страницы...',
  opening_chat: 'Открытие чата...',
  typing: 'Ввод текста...',
  sending: 'Отправка...',
  saving: 'Сохранение...',
  done: 'Отправлено!',
  error: 'Ошибка',
};

export const SendMessageModal: React.FC<SendMessageModalProps> = ({ lead, onClose, onSent }) => {
  // Шаблоны
  const [templates, setTemplates] = useState<CrmMessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Редактирование шаблона
  const [editing, setEditing] = useState(false);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');

  // Отправка
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<MessagingProgress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const source = lead.source === 'cian' ? 'ЦИАН' : lead.source === 'avito' ? 'Авито' : lead.source;
  const listingUrl = lead.source_url || lead.ad_data?.url;

  // Загрузка шаблонов
  const loadTemplates = useCallback(async () => {
    await crmRepository.ensureDefaultTemplates();
    const all = await crmRepository.getMessageTemplates();
    setTemplates(all);

    // Автовыбор по pipeline_id + source
    const match = await crmRepository.getTemplateForPipelineAndSource(lead.pipeline_id, lead.source);
    if (match) {
      setSelectedId(match.id!);
      setMessageText(fillTemplateForLead(match.body, lead));
    } else if (all.length > 0) {
      setSelectedId(all[0].id!);
      setMessageText(fillTemplateForLead(all[0].body, lead));
    }
  }, [lead]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Выбор шаблона из dropdown
  const handleSelectTemplate = (idStr: string) => {
    const id = Number(idStr);
    const tmpl = templates.find(t => t.id === id);
    if (tmpl) {
      setSelectedId(id);
      setMessageText(fillTemplateForLead(tmpl.body, lead));
    }
  };

  // Новый шаблон
  const handleNewTemplate = () => {
    setIsNewTemplate(true);
    setEditing(true);
    setEditName('');
    setEditBody('');
  };

  // Редактировать текущий
  const handleEditTemplate = () => {
    const tmpl = templates.find(t => t.id === selectedId);
    if (!tmpl) return;
    setIsNewTemplate(false);
    setEditing(true);
    setEditName(tmpl.name);
    setEditBody(tmpl.body);
  };

  // Сохранить шаблон
  const handleSaveTemplate = async () => {
    if (!editName.trim() || !editBody.trim()) return;

    const now = new Date().toISOString();

    if (isNewTemplate) {
      const id = await crmRepository.addMessageTemplate({
        name: editName.trim(),
        body: editBody.trim(),
        created_at: now,
        updated_at: now,
      });
      setSelectedId(id);
      setMessageText(fillTemplateForLead(editBody.trim(), lead));
    } else {
      await crmRepository.updateMessageTemplate(selectedId!, {
        name: editName.trim(),
        body: editBody.trim(),
      });
      setMessageText(fillTemplateForLead(editBody.trim(), lead));
    }

    setEditing(false);
    setEditName('');
    setEditBody('');

    // Перезагрузить список
    const all = await crmRepository.getMessageTemplates();
    setTemplates(all);
  };

  // Удалить шаблон
  const handleDeleteTemplate = async () => {
    if (!selectedId) return;
    await crmRepository.deleteMessageTemplate(selectedId);

    setEditing(false);
    setEditName('');
    setEditBody('');

    const all = await crmRepository.getMessageTemplates();
    setTemplates(all);

    if (all.length > 0) {
      setSelectedId(all[0].id!);
      setMessageText(fillTemplateForLead(all[0].body, lead));
    } else {
      setSelectedId(null);
      setMessageText('');
    }
  };

  // Отмена редактирования
  const handleCancelEdit = () => {
    setEditing(false);
    setEditName('');
    setEditBody('');
  };

  // Отправка
  const handleSend = async () => {
    if (!messageText.trim()) return;
    setSending(true);
    setProgress(null);
    setResult(null);

    const res = await sendMessageToLead({
      lead,
      messageText: messageText.trim(),
      onProgress: setProgress,
    });

    setResult({ ok: res.success, error: res.error });
    setSending(false);
    if (res.success) {
      onSent?.();
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Написать на {source}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Инфо о лиде */}
          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1">
            <div className="text-xs text-zinc-900 dark:text-white font-medium">
              {lead.contact_name || 'Без имени'}
            </div>
            {lead.ad_data?.address && (
              <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                {lead.ad_data.address}
              </div>
            )}
            {lead.ad_data?.price && (
              <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                {lead.ad_data.price.toLocaleString('ru-RU')} ₽
              </div>
            )}
            {lead.phones?.length > 0 && (
              <div className="text-[11px] text-zinc-500">
                {lead.phones.map(p => formatPhone(p.number)).join(', ')}
              </div>
            )}
          </div>

          {/* Шаблон — выбор */}
          {!editing && (
            <div>
              <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Шаблон
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedId ?? ''}
                  onChange={e => handleSelectTemplate(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleNewTemplate}
                  title="Новый шаблон"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  +
                </button>
                {selectedTemplate && (
                  <button
                    onClick={handleEditTemplate}
                    title="Редактировать шаблон"
                    className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    &#9998;
                  </button>
                )}
                {selectedTemplate && templates.length > 1 && (
                  <button
                    onClick={handleDeleteTemplate}
                    title="Удалить шаблон"
                    className="rounded-md border border-red-200 dark:border-red-800 px-2 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Шаблон — редактирование */}
          {editing && (
            <div className="space-y-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-3">
              <div className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                {isNewTemplate ? 'Новый шаблон' : 'Редактирование шаблона'}
              </div>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Название шаблона"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="Текст шаблона..."
              />
              <div className="text-[9px] text-zinc-400">
                Переменные: {'{client_name}'} {'{phone}'} {'{address}'} {'{price}'} {'{property_type}'} {'{area}'} {'{source}'}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSaveTemplate}
                  disabled={!editName.trim() || !editBody.trim()}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Сохранить
                </button>
                {!isNewTemplate && (
                  <button
                    onClick={handleDeleteTemplate}
                    className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                  >
                    Удалить
                  </button>
                )}
                <button
                  onClick={handleCancelEdit}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Текст сообщения */}
          {!editing && (
            <div>
              <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Текст сообщения
              </label>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                rows={6}
                disabled={sending}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="Введите текст сообщения..."
              />
              <div className="text-[9px] text-zinc-400 mt-1">
                Переменные: {'{client_name}'} {'{phone}'} {'{address}'} {'{price}'} {'{property_type}'} {'{area}'} {'{source}'}
              </div>
            </div>
          )}

          {/* Прогресс */}
          {sending && progress && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  {STAGE_LABELS[progress.stage] || progress.detail}
                </span>
              </div>
            </div>
          )}

          {/* Результат */}
          {result && (
            <div className={`rounded-lg p-3 ${result.ok ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className={`text-xs font-medium ${result.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {result.ok ? 'Сообщение отправлено!' : `Ошибка: ${result.error}`}
              </div>
              {!result.ok && listingUrl && (
                <a
                  href={listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Открыть страницу вручную &rarr;
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!editing && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-700">
            {!result?.ok && (
              <button
                onClick={onClose}
                disabled={sending}
                className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Отмена
              </button>
            )}
            {result ? (
              <button
                onClick={onClose}
                className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
              >
                Закрыть
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={sending || !messageText.trim()}
                className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Отправка...' : 'Отправить'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
