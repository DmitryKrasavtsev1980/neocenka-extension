import React, { useState, useEffect } from 'react';
import { getModules, type ModuleInfo } from '@/services/api-service';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Heading } from '@/components/catalyst/heading';
import { BuildingOffice2Icon, MegaphoneIcon, ClipboardDocumentListIcon } from '@heroicons/react/20/solid';

const heroIconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'building-office': BuildingOffice2Icon,
  'megaphone': MegaphoneIcon,
  'clipboard-document-list': ClipboardDocumentListIcon,
};

const getModuleIcon = (mod: ModuleInfo) => {
  if (mod.icon && heroIconMap[mod.icon]) {
    const Icon = heroIconMap[mod.icon];
    return <Icon className="size-7" />;
  }
  return <span>{mod.icon || ''}</span>;
};

interface ModulesPageProps {
  onModuleOpen?: (code: string) => void;
  isCompanyAdmin?: boolean;
}

const periodLabels: Record<string, string> = {
  '7d': '7 дней',
  '30d': '1 месяц',
  '90d': '90 дней',
  '180d': '180 дней',
  '365d': 'Год',
  trial: 'Пробный',
};

const ModulesPage: React.FC<ModulesPageProps> = ({ onModuleOpen, isCompanyAdmin }) => {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getModules();
      setModules(data.modules);
    } catch {
      setError('Не удалось загрузить модули');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Загрузка...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Heading level={2} className="text-lg font-semibold mb-6 text-gray-800 dark:text-white">
        Мои модули
      </Heading>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {modules.map((mod) => {
          const hasPending = !!mod.pending_payment;
          const isExpired = mod.access?.status === 'expired';
          const isActive = !!mod.access && mod.access.status === 'active';
          const isTrial = isActive && mod.access.period === 'trial';

          const regionNames = (codes: string[]) => {
            if (!codes || codes.length === 0) return 'Все';
            if (codes.includes('*')) return 'Все';
            return codes.map(code => {
              const found = mod.available_regions?.find(r => r.code === code);
              return found ? found.name : code;
            }).join(', ');
          };

          return (
            <div
              key={mod.id}
              className={`rounded-xl p-4 border transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)] flex flex-col
                ${isActive
                  ? isTrial
                    ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-700/40'
                    : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700'
                  : isExpired
                    ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10 dark:border-red-700/40'
                    : hasPending
                      ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/40'
                      : 'border-gray-100 bg-gray-50/50 dark:bg-zinc-900/50 dark:border-zinc-800'
                }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl text-zinc-500 dark:text-zinc-400">{getModuleIcon(mod)}</span>
                <Badge
                  color={
                    isTrial ? 'emerald' : isActive ? 'emerald' : isExpired ? 'red' : hasPending ? 'amber' : 'zinc'
                  }
                >
                  {isTrial ? `Пробный (${mod.trial_days || 3} ${((mod.trial_days || 3) === 1 ? 'день' : (mod.trial_days || 3) < 5 ? 'дня' : 'дней')})` : isActive ? 'Активен' : isExpired ? 'Истёк' : hasPending ? 'Ожидает' : 'Недоступен'}
                </Badge>
              </div>

              <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white mb-1">
                {mod.name}
              </h3>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-3 leading-snug">
                {mod.description || 'Описание модуля'}
              </p>

              <div className="flex-1" />

              <div className="space-y-2">
              {isActive ? (
                <>
                  <div className="mb-3 text-[13px] text-zinc-700 dark:text-zinc-300">
                    <div className="font-medium mb-1">
                      {isTrial
                        ? `Пробный период (${mod.trial_days || 3} ${((mod.trial_days || 3) === 1 ? 'день' : (mod.trial_days || 3) < 5 ? 'дня' : 'дней')}) до ${new Date(mod.access.expires_at!).toLocaleDateString('ru-RU')}`
                        : mod.access.expires_at
                          ? `До ${new Date(mod.access.expires_at).toLocaleDateString('ru-RU')}`
                          : 'Бессрочный доступ'
                      }
                    </div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">
                      {mod.access.source === 'company' ? (
                        <span className="text-blue-500 dark:text-blue-400">Корпоративная лицензия</span>
                      ) : (
                        <span>Персональная подписка</span>
                      )}
                      {' · '}
                      Тариф: {periodLabels[mod.access.period] || mod.access.period} | Регионы: {regionNames(mod.access.regions)}
                    </div>
                  </div>
                  {hasPending && (
                    <div className="px-3 py-2 bg-yellow-50 dark:bg-amber-900/15 border border-yellow-200 dark:border-amber-700/40 rounded-lg text-[12px] text-yellow-800 dark:text-amber-300 mb-2">
                      <div className="font-medium">Заявка на продление</div>
                      <div className="text-[11px] text-yellow-700 dark:text-amber-400">
                        {periodLabels[mod.pending_payment!.period] || mod.pending_payment!.period} — {mod.pending_payment!.amount.toLocaleString('ru-RU')} ₽
                        {mod.pending_payment!.region_codes && mod.pending_payment!.region_codes.length > 0 && (
                          <> · {regionNames(mod.pending_payment!.region_codes)}</>
                        )}
                      </div>
                      <div className="text-[10px] text-yellow-600 dark:text-amber-400/70 mt-0.5">Ожидает подтверждения</div>
                    </div>
                  )}
                  <Button
                    color="blue"
                    className="w-full !py-2.5 text-[13px] font-semibold"
                    onClick={() => onModuleOpen?.(mod.code)}
                  >
                    Открыть
                  </Button>
                </>
              ) : isExpired ? (
                <div className="px-3 py-2.5 bg-red-100 dark:bg-red-900/20 rounded-lg text-[13px] text-red-800 dark:text-red-300">
                  <div className="font-medium mb-0.5">
                    Подписка истекла {mod.access!.expires_at ? new Date(mod.access.expires_at).toLocaleDateString('ru-RU') : ''}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {periodLabels[mod.access!.period] || mod.access!.period} · Регионы: {regionNames(mod.access!.regions)}
                  </div>
                  <div className="text-[11px] text-red-600 dark:text-red-400/80 mt-1 opacity-80">
                    Для продления перейдите в личный кабинет
                  </div>
                </div>
              ) : hasPending ? (
                <div className="px-3 py-2.5 bg-yellow-100 dark:bg-amber-900/20 rounded-lg text-[13px] text-yellow-800 dark:text-amber-300">
                  <div className="font-medium mb-0.5">
                    Заявка отправлена {new Date(mod.pending_payment!.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    {periodLabels[mod.pending_payment!.period] || mod.pending_payment!.period} — {mod.pending_payment!.amount.toLocaleString('ru-RU')} ₽
                    {mod.pending_payment!.region_codes && mod.pending_payment!.region_codes.length > 0 && (
                      <> · {regionNames(mod.pending_payment!.region_codes)}</>
                    )}
                  </div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-400/80 mt-1 opacity-80">
                    Ожидает подтверждения администратором
                  </div>
                </div>
              ) : !isCompanyAdmin ? (
                <div className="text-[13px] text-zinc-400 dark:text-zinc-500 text-center py-2">
                  Обратитесь к администратору компании для подключения модуля
                </div>
              ) : (
                <div className="text-[13px] text-zinc-400 dark:text-zinc-500 text-center py-2">
                  Для подключения модуля перейдите в личный кабинет
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModulesPage;
