import React, { useState, useEffect, useCallback } from 'react';
import {
  getNews,
  getNewsDetail,
  reactToNews,
  getNewsComments,
  createNewsComment,
  reactToComment,
  type NewsItem,
  type NewsComment,
} from '@/services/api-service';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
  ChatBubbleLeftIcon,
  ArrowLeftIcon,
  PaperAirplaneIcon,
  NewspaperIcon,
} from '@heroicons/react/20/solid';

const NewsPage: React.FC = () => {
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadNews = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await getNews(p);
      setNewsList(data.news);
      setTotalPages(data.meta.last_page);
    } catch {
      setError('Не удалось загрузить новости');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedNews) {
      loadNews(page);
    }
  }, [page, selectedNews, loadNews]);

  const handleReact = async (newsId: number, reaction: 'like' | 'dislike') => {
    try {
      const result = await reactToNews(newsId, reaction);
      setNewsList((prev) =>
        prev.map((n) =>
          n.id === newsId ? { ...n, ...result, comments_count: n.comments_count } : n
        )
      );
      if (selectedNews?.id === newsId) {
        setSelectedNews((prev) => (prev ? { ...prev, ...result } : prev));
      }
    } catch { /* ignore */ }
  };

  const openDetail = async (item: NewsItem) => {
    setSelectedNews(item);
    setComments([]);
    setCommentsPage(1);
    try {
      const detail = await getNewsDetail(item.id);
      setSelectedNews(detail.news);
      const commentsData = await getNewsComments(item.id);
      setComments(commentsData.comments);
      setCommentsTotal(commentsData.meta.total);
    } catch { /* ignore */ }
  };

  const loadMoreComments = async () => {
    if (!selectedNews) return;
    const nextPage = commentsPage + 1;
    try {
      const data = await getNewsComments(selectedNews.id, nextPage);
      setComments((prev) => [...data.comments, ...prev]);
      setCommentsPage(nextPage);
    } catch { /* ignore */ }
  };

  const handleSubmitComment = async () => {
    if (!selectedNews || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const result = await createNewsComment(selectedNews.id, commentText.trim());
      setComments((prev) => [result.comment, ...prev]);
      setCommentText('');
      setCommentsTotal((prev) => prev + 1);
    } catch { /* ignore */ } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentReact = async (commentId: number, reaction: 'like' | 'dislike') => {
    try {
      const result = await reactToComment(commentId, reaction);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, ...result } : c))
      );
    } catch { /* ignore */ }
  };

  // --- Список новостей ---
  if (!selectedNews) {
    if (loading) {
      return (
        <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Загрузка...
        </div>
      );
    }
    if (error) {
      return (
        <div className="p-8 text-center text-sm text-red-500">{error}</div>
      );
    }

    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <NewspaperIcon className="size-6 fill-zinc-500 dark:fill-zinc-400" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Новости</h2>
        </div>

        {newsList.length === 0 ? (
          <div className="text-center text-sm text-zinc-400 py-12">
            Пока нет новостей
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {newsList.map((item) => (
              <div
                key={item.id}
                className="flex rounded-xl border bg-white dark:bg-zinc-900 dark:border-zinc-700 cursor-pointer hover:shadow-sm transition-shadow overflow-hidden"
                onClick={() => openDetail(item)}
              >
                {item.image_url && (
                  <div className="w-28 h-28 shrink-0">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white truncate">
                        {item.title}
                      </h3>
                      {item.module && (
                        <Badge color="blue">{item.module.name}</Badge>
                      )}
                    </div>
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {item.excerpt.slice(0, 200)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
                    <span>{item.published_at ? new Date(item.published_at).toLocaleDateString('ru-RU') : ''}</span>
                    <div className="flex items-center gap-3 ml-auto">
                      <span className="flex items-center gap-1">
                        <HandThumbUpIcon className="size-3.5" /> {item.likes_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <HandThumbDownIcon className="size-3.5" /> {item.dislikes_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <ChatBubbleLeftIcon className="size-3.5" /> {item.comments_count}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button color="zinc" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Назад
                </Button>
                <span className="flex items-center text-sm text-zinc-500">
                  {page} / {totalPages}
                </span>
                <Button color="zinc" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Вперёд
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Детальный просмотр ---
  return (
    <div className="max-w-5xl mx-auto p-6">
      <button
        onClick={() => setSelectedNews(null)}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-white mb-4"
      >
        <ArrowLeftIcon className="size-4" /> К списку
      </button>

      {/* Заголовок с квадратной картинкой */}
      <div className="flex gap-4 mb-6">
        {selectedNews.image_url && (
          <div className="w-28 h-28 shrink-0 rounded-xl overflow-hidden">
            <img
              src={selectedNews.image_url}
              alt={selectedNews.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            {selectedNews.title}
          </h1>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>{selectedNews.published_at ? new Date(selectedNews.published_at).toLocaleDateString('ru-RU') : ''}</span>
            {selectedNews.module && <Badge color="blue">{selectedNews.module.name}</Badge>}
          </div>
        </div>
      </div>

      <div
        className="prose prose-sm dark:prose-invert max-w-none mb-6"
        dangerouslySetInnerHTML={{ __html: selectedNews.content }}
      />

      {/* Реакции */}
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => handleReact(selectedNews.id, 'like')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            selectedNews.my_reaction === 'like'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <HandThumbUpIcon className="size-4" /> {selectedNews.likes_count}
        </button>
        <button
          onClick={() => handleReact(selectedNews.id, 'dislike')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            selectedNews.my_reaction === 'dislike'
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <HandThumbDownIcon className="size-4" /> {selectedNews.dislikes_count}
        </button>
        <span className="text-xs text-zinc-400 ml-auto">
          <ChatBubbleLeftIcon className="size-3.5 inline mr-1" />
          {commentsTotal} комментариев
        </span>
      </div>

      {/* Форма комментария */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
          placeholder="Написать комментарий..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-blue-500 bg-transparent dark:text-white"
          disabled={submittingComment}
        />
        <Button
          color="blue"
          onClick={handleSubmitComment}
          disabled={!commentText.trim() || submittingComment}
          className="!px-3"
        >
          <PaperAirplaneIcon className="size-4" />
        </Button>
      </div>

      {/* Загрузить ранее */}
      {commentsTotal > comments.length && (
        <button
          onClick={loadMoreComments}
          className="text-xs text-blue-500 hover:text-blue-600 mb-3"
        >
          Показать ранее ({commentsTotal - comments.length} ещё)
        </button>
      )}

      {/* Комментарии */}
      <div className="flex flex-col gap-3">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-white">
                {comment.user_name}
              </span>
              <span className="text-[11px] text-zinc-400">
                {new Date(comment.created_at).toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2">{comment.content}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCommentReact(comment.id, 'like')}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  comment.my_reaction === 'like' ? 'text-blue-600' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                <HandThumbUpIcon className="size-3" /> {comment.likes_count}
              </button>
              <button
                onClick={() => handleCommentReact(comment.id, 'dislike')}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  comment.my_reaction === 'dislike' ? 'text-red-600' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                <HandThumbDownIcon className="size-3" /> {comment.dislikes_count}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsPage;
