/**
 * Страница переписки с клиентом CRM
 * — Bubble UI для сообщений
 * — AI-подсказки через z.ai
 * — Заглушка отправки
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { crmRepository } from '@/db/repositories/crm.repository';
import { generateBotMessage } from '@/services/crm-bot-service';
import { Button } from '@/components/catalyst/button';
import type { CrmClient, CrmMessage } from '@/types';
import {
  ArrowLeftIcon,
  SparklesIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/16/solid';

interface CrmChatPageProps {
  client: CrmClient;
  onBack: () => void;
}

const CrmChatPage: React.FC<CrmChatPageProps> = ({ client, onBack }) => {
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!client.id) return;
    setLoading(true);
    const msgs = await crmRepository.getClientMessages(client.id);
    setMessages(msgs);
    setLoading(false);
  }, [client.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiSuggestion]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !client.id) return;
    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const now = new Date().toISOString();
      await crmRepository.addMessage({
        client_id: client.id!,
        direction: 'outgoing',
        type: 'text',
        content: text,
        bot_generated: false,
        sent_at: now, // заглушка — реальная отправка позже
        created_at: now,
      });

      await crmRepository.updateClient(client.id!, {
        last_contact_at: now,
      });

      await loadMessages();
    } finally {
      setSending(false);
    }
  };

  const handleAiSuggest = async () => {
    if (!client.id) return;
    setAiLoading(true);
    setAiError('');
    setAiSuggestion('');

    try {
      const result = await generateBotMessage({
        client,
        messages,
      });

      if (result.error) {
        setAiError(result.error);
      } else {
        setAiSuggestion(result.text);
      }
    } catch (e) {
      setAiError(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (aiSuggestion) {
      setNewMessage(aiSuggestion);
      setAiSuggestion('');
    }
  };

  const fmtTime = (date: string | null): string => {
    if (!date) return '';
    try {
      return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <button onClick={onBack} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800">
          <ArrowLeftIcon className="size-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{client.full_name}</div>
          <div className="text-[10px] text-zinc-500">{client.phone}{client.ad_data?.address ? ` · ${client.ad_data.address}` : ''}</div>
        </div>
        <Button
          onClick={handleAiSuggest}
          disabled={aiLoading}
          color="white"
        >
          <SparklesIcon className="size-4 text-purple-500" />
          {aiLoading ? 'Генерация...' : 'AI-подсказка'}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50 dark:bg-zinc-800/30">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-zinc-500">Загрузка...</div>
        ) : messages.length === 0 && !aiSuggestion ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-zinc-500">
            <span>Нет сообщений</span>
            <button onClick={handleAiSuggest} className="mt-2 text-purple-600 hover:underline text-[10px] flex items-center gap-1">
              <SparklesIcon className="size-3" />
              Начать с AI-подсказки
            </button>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[70%] rounded-lg px-3 py-2 ${
                  msg.direction === 'outgoing'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700'
                }`}>
                  {msg.bot_generated && (
                    <div className="text-[9px] opacity-70 mb-0.5 flex items-center gap-0.5">
                      <SparklesIcon className="size-2.5" /> AI
                    </div>
                  )}
                  <div className="text-xs whitespace-pre-wrap">{msg.content}</div>
                  <div className={`text-[9px] mt-1 ${
                    msg.direction === 'outgoing' ? 'text-blue-200' : 'text-zinc-400'
                  }`}>
                    {fmtTime(msg.created_at)}
                    {!msg.sent_at && msg.direction === 'outgoing' && ' (не отправлено)'}
                  </div>
                </div>
              </div>
            ))}

            {/* AI Suggestion */}
            {aiSuggestion && (
              <div className="flex justify-center">
                <div className="max-w-[80%] rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 px-3 py-2">
                  <div className="text-[9px] text-purple-600 dark:text-purple-400 font-medium mb-1 flex items-center gap-0.5">
                    <SparklesIcon className="size-2.5" />
                    AI-предложение
                  </div>
                  <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{aiSuggestion}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={handleAcceptSuggestion} className="rounded bg-purple-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-purple-700 flex items-center gap-1">
                      <CheckIcon className="size-2.5" />
                      Принять
                    </button>
                    <button onClick={() => setAiSuggestion('')} className="text-[10px] text-zinc-500 hover:underline flex items-center gap-0.5">
                      <XMarkIcon className="size-2.5" />
                      Отклонить
                    </button>
                  </div>
                </div>
              </div>
            )}

            {aiError && (
              <div className="flex justify-center">
                <div className="text-[10px] text-red-500 bg-red-50 dark:bg-red-950/30 rounded px-3 py-1.5">{aiError}</div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Введите сообщение..."
            rows={2}
            className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending}
          >
            <PaperAirplaneIcon className="size-4" />
            {sending ? '...' : 'Отправить'}
          </Button>
        </div>
        <div className="text-[9px] text-zinc-400 mt-1">Отправка сообщений — заглушка (реальная отправка будет добавлена позже)</div>
      </div>
    </div>
  );
};

export default CrmChatPage;
