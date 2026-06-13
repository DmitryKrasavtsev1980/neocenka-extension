import React, { useState, useEffect } from 'react';
import {
  getInstructions,
  type InstructionCategory,
} from '@/services/api-service';
import {
  BookOpenIcon,
  ChevronDownIcon,
  PlayCircleIcon,
} from '@heroicons/react/20/solid';

const InstructionsPage: React.FC = () => {
  const [categories, setCategories] = useState<InstructionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    getInstructions()
      .then((data) => {
        setCategories(data.categories);
        if (data.categories.length > 0) {
          setActiveCategoryId(data.categories[0].id);
        }
      })
      .catch(() => setError('Не удалось загрузить инструкции'))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Загрузка...
      </div>
    );
  }
  if (error) {
    return <div className="p-8 text-center text-sm text-red-500">{error}</div>;
  }

  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <BookOpenIcon className="size-6 fill-zinc-500 dark:fill-zinc-400" />
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Инструкции</h2>
      </div>

      {categories.length === 0 ? (
        <div className="text-center text-sm text-zinc-400 py-12">
          Инструкций пока нет
        </div>
      ) : (
        <>
          {/* Вкладки категорий */}
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  activeCategoryId === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Список инструкций */}
          {activeCategory && activeCategory.instructions.length > 0 ? (
            <div className="flex flex-col gap-3">
              {activeCategory.instructions.map((instruction) => {
                const isExpanded = expandedIds.has(instruction.id);
                return (
                  <div
                    key={instruction.id}
                    className="rounded-xl border bg-white dark:bg-zinc-900 dark:border-zinc-700 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleExpand(instruction.id)}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white">
                          {instruction.title}
                        </h3>
                      </div>
                      {instruction.video_embed_url && (
                        <PlayCircleIcon className="size-5 text-blue-500 shrink-0" />
                      )}
                      <ChevronDownIcon
                        className={`size-5 text-zinc-400 shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">
                        {instruction.image_url && (
                          <img
                            src={instruction.image_url}
                            alt={instruction.title}
                            className="w-full max-h-72 object-cover rounded-lg mt-4 mb-4"
                          />
                        )}
                        {instruction.video_embed_url && (
                          <div className="mt-4 mb-4 aspect-video">
                            <iframe
                              src={instruction.video_embed_url}
                              className="w-full h-full rounded-lg"
                              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; screen-wake-lock;"
                              allowFullScreen
                              frameBorder="0"
                            />
                          </div>
                        )}
                        {instruction.content && (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none mt-4"
                            dangerouslySetInnerHTML={{ __html: instruction.content }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-sm text-zinc-400 py-12">
              В этой категории пока нет инструкций
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InstructionsPage;
