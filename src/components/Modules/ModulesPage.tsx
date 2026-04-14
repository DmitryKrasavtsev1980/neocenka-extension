import React, { useState, useEffect } from 'react';
import { getModules, createPayment, checkPromo, activateTrial, type ModuleInfo, type PromoCheckResult } from '@/services/api-service';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Heading } from '@/components/catalyst/heading';
import { BuildingOffice2Icon } from '@heroicons/react/20/solid';

const heroIconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'building-office': BuildingOffice2Icon,
};

const getModuleIcon = (mod: ModuleInfo) => {
  if (mod.icon && heroIconMap[mod.icon]) {
    const Icon = heroIconMap[mod.icon];
    return <Icon className="size-7" />;
  }
  return <span>{mod.icon || ''}</span>;
};

const getModuleIconSmall = (mod: ModuleInfo | null) => {
  if (!mod) return null;
  if (mod.icon && heroIconMap[mod.icon]) {
    const Icon = heroIconMap[mod.icon];
    return <Icon className="size-5 inline mr-1.5 -mt-0.5" />;
  }
  return mod.icon ? <span className="mr-1.5">{mod.icon}</span> : null;
};
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Input } from '@/components/catalyst/input';
import { Field } from '@/components/catalyst/fieldset';

interface ModulesPageProps {
  onModuleOpen?: (code: string) => void;
}

type PeriodKey = '90d' | '180d' | '365d';

const periodLabels: Record<string, string> = {
  '90d': '90 дней',
  '180d': '180 дней',
  '365d': 'Год',
  trial: 'Пробный',
};

const ModulesPage: React.FC<ModulesPageProps> = ({ onModuleOpen }) => {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchaseModule, setPurchaseModule] = useState<ModuleInfo | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('365d');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // Trial state
  const [trialActivating, setTrialActivating] = useState<number | null>(null);

  // Promo code state
  const [promoInput, setPromoInput] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoResult, setPromoResult] = useState<PromoCheckResult | null>(null);
  const [promoError, setPromoError] = useState('');

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

  const getPeriodPrice = (mod: ModuleInfo, period: string): number | null => {
    switch (period) {
      case '90d': return mod.price_90d;
      case '180d': return mod.price_180d;
      case '365d': return mod.price_365d;
      default: return null;
    }
  };

  const getAvailablePeriods = (mod: ModuleInfo) => {
    const periods: { key: PeriodKey; label: string }[] = [];
    if (mod.price_90d) periods.push({ key: '90d', label: `90 дней — ${mod.price_90d.toLocaleString('ru-RU')} ₽` });
    if (mod.price_180d) periods.push({ key: '180d', label: `180 дней — ${mod.price_180d.toLocaleString('ru-RU')} ₽` });
    if (mod.price_365d) periods.push({ key: '365d', label: `Год — ${mod.price_365d.toLocaleString('ru-RU')} ₽` });
    return periods;
  };

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || !purchaseModule) return;
    setPromoChecking(true);
    setPromoError('');
    setPromoResult(null);

    try {
      const result = await checkPromo(promoInput.trim(), purchaseModule.id, selectedPeriod);
      if (result.valid) {
        setPromoResult(result);
      } else {
        setPromoError(result.error || 'Промокод недействителен');
      }
    } catch (err: any) {
      setPromoError(err.error || 'Ошибка проверки промокода');
    } finally {
      setPromoChecking(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoInput('');
    setPromoResult(null);
    setPromoError('');
  };

  const handlePeriodChange = (period: PeriodKey) => {
    setSelectedPeriod(period);
    setPromoResult(null);
    setPromoError('');
  };

  const handleSubmitPurchase = async () => {
    if (!purchaseModule) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const promoCode = promoResult?.valid ? promoInput.trim() : undefined;
      await createPayment(purchaseModule.id, selectedPeriod, promoCode);
      setSubmitResult({
        success: true,
        message: `Заявка на «${purchaseModule.name}» отправлена. Администратор рассмотрит её в ближайшее время.`,
      });
      setPurchaseModule(null);
      loadModules();
    } catch (err: any) {
      setSubmitResult({
        success: false,
        message: err.message || 'Ошибка при отправке заявки',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivateTrial = async (mod: ModuleInfo) => {
    setTrialActivating(mod.id);
    try {
      await activateTrial(mod.id);
      loadModules();
    } catch (err: any) {
      // Обновляем модули даже при ошибке, чтобы отобразить актуальное состояние
      loadModules();
    } finally {
      setTrialActivating(null);
    }
  };

  const openPurchaseModal = (mod: ModuleInfo) => {
    setSelectedPeriod(
      mod.price_365d ? '365d' :
      mod.price_180d ? '180d' :
      mod.price_90d ? '90d' : '365d'
    );
    setSubmitResult(null);
    setPromoInput('');
    setPromoResult(null);
    setPromoError('');
    setPurchaseModule(mod);
  };

  const currentPrice = purchaseModule ? getPeriodPrice(purchaseModule, selectedPeriod) : null;
  const finalPrice = promoResult?.valid ? promoResult.final_amount : currentPrice;

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

      {/* Модалка покупки */}
      <Dialog
        open={!!purchaseModule}
        onClose={() => setPurchaseModule(null)}
        size="sm"
      >
        <DialogTitle>
          {getModuleIconSmall(purchaseModule)} {purchaseModule?.name}
        </DialogTitle>
        {purchaseModule?.description && (
          <DialogDescription>
            {purchaseModule.description}
          </DialogDescription>
        )}

        <DialogBody>
          {/* Выбор тарифа */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Выберите тариф
            </h4>
            {purchaseModule && getAvailablePeriods(purchaseModule).map((p) => (
              <label
                key={p.key}
                className={`flex items-center gap-2.5 px-3 py-2.5 border-2 rounded-[10px] mb-2 cursor-pointer transition-all text-sm
                  ${selectedPeriod === p.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 hover:border-blue-300 dark:border-zinc-700 dark:hover:border-blue-400'
                  }`}
              >
                <input
                  type="radio"
                  name="period"
                  value={p.key}
                  checked={selectedPeriod === p.key}
                  onChange={() => handlePeriodChange(p.key)}
                  className="accent-blue-500"
                />
                <span className="text-zinc-800 dark:text-zinc-200">{p.label}</span>
              </label>
            ))}
          </div>

          {/* Промокод */}
          <div className="mb-4 pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
            <Field>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                Промокод
              </label>
              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  placeholder="Введите промокод"
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value); setPromoError(''); }}
                  disabled={promoResult?.valid === true}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg text-sm outline-none transition-colors
                    focus:border-blue-500 dark:focus:border-blue-400
                    disabled:bg-gray-50 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-500
                    bg-transparent dark:text-white"
                />
                {promoResult?.valid ? (
                  <button
                    className="px-2 text-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                    onClick={handleRemovePromo}
                    title="Удалить промокод"
                  >
                    ✕
                  </button>
                ) : (
                  <Button
                    color="blue"
                    className="!px-3.5 !py-2 text-xs whitespace-nowrap"
                    onClick={handleApplyPromo}
                    disabled={!promoInput.trim() || promoChecking}
                  >
                    {promoChecking ? '...' : 'Применить'}
                  </Button>
                )}
              </div>
            </Field>

            {promoError && (
              <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                {promoError}
              </div>
            )}
            {promoResult?.valid && (
              <div className="mt-1.5 px-2.5 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                {promoResult.discount_type === 'percent'
                  ? `Скидка ${promoResult.discount_value}%`
                  : `Скидка ${promoResult.discount_value?.toLocaleString('ru-RU')} ₽`
                }
                {' — '}
                <span className="line-through text-gray-400 dark:text-zinc-500">
                  {promoResult.original_amount?.toLocaleString('ru-RU')} ₽
                </span>
                {' → '}
                <strong>{promoResult.final_amount?.toLocaleString('ru-RU')} ₽</strong>
              </div>
            )}
          </div>

          {/* Итоговая цена */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded-[10px] text-center">
            <div className={`text-2xl font-bold ${
              promoResult?.valid
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-gray-800 dark:text-white'
            }`}>
              {finalPrice != null ? `${finalPrice.toLocaleString('ru-RU')} ₽` : '—'}
            </div>
          </div>

          {submitResult && (
            <div className={`mt-3 px-3 py-2.5 rounded-lg text-sm leading-snug ${
              submitResult.success
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
            }`}>
              {submitResult.message}
            </div>
          )}
        </DialogBody>

        <DialogActions>
          <Button
            color="blue"
            className="w-full !py-3 text-sm font-semibold"
            onClick={handleSubmitPurchase}
            disabled={submitting}
          >
            {submitting ? 'Отправка...' : 'Отправить заявку'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Сетка модулей */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {modules.map((mod) => {
          const hasPending = !!mod.pending_payment;
          const isActive = !!mod.access;
          const isTrial = isActive && mod.access!.period === 'trial';

          return (
            <div
              key={mod.id}
              className={`rounded-xl p-4 border transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]
                ${isActive
                  ? isTrial
                    ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-700/40'
                    : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700'
                  : hasPending
                    ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/40'
                    : 'border-gray-100 bg-gray-50/50 dark:bg-zinc-900/50 dark:border-zinc-800'
                }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl text-zinc-500 dark:text-zinc-400">{getModuleIcon(mod)}</span>
                <Badge
                  color={
                    isTrial ? 'emerald' : isActive ? 'emerald' : hasPending ? 'amber' : 'zinc'
                  }
                >
                  {isTrial ? 'Пробный' : isActive ? 'Активен' : hasPending ? 'Ожидает' : 'Недоступен'}
                </Badge>
              </div>

              <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white mb-1">
                {mod.name}
              </h3>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-3 leading-snug">
                {mod.description || 'Описание модуля'}
              </p>

              {isActive ? (
                <div className="mb-3 text-[13px] text-zinc-700 dark:text-zinc-300">
                  <div className="font-medium mb-1">
                    {isTrial
                      ? `Пробный период до ${new Date(mod.access!.expires_at!).toLocaleDateString('ru-RU')}`
                      : mod.access!.expires_at
                        ? `До ${new Date(mod.access!.expires_at).toLocaleDateString('ru-RU')}`
                        : 'Бессрочный доступ'
                    }
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                    Тариф: {periodLabels[mod.access!.period] || mod.access!.period} | Регионы: {mod.access!.regions.includes('*') ? 'Все' : mod.access!.regions.join(', ')}
                  </div>
                </div>
              ) : hasPending ? (
                <div className="mb-3 px-3 py-2.5 bg-yellow-100 dark:bg-amber-900/20 rounded-lg text-[13px] text-yellow-800 dark:text-amber-300">
                  <div className="font-medium mb-0.5">
                    Заявка отправлена {new Date(mod.pending_payment!.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    {periodLabels[mod.pending_payment!.period] || mod.pending_payment!.period} — {mod.pending_payment!.amount.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-400/80 mt-1 opacity-80">
                    Ожидает подтверждения администратором
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {mod.price_90d && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                        {mod.price_90d.toLocaleString('ru-RU')} ₽/90 дн
                      </span>
                    )}
                    {mod.price_180d && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">
                        {mod.price_180d.toLocaleString('ru-RU')} ₽/180 дн
                      </span>
                    )}
                    {mod.price_365d && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 font-semibold">
                        {mod.price_365d.toLocaleString('ru-RU')} ₽/год
                      </span>
                    )}
                  </div>
                  {mod.trial_available && (
                    <button
                      className="w-full mb-2 px-3 py-2 rounded-lg text-[13px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={trialActivating === mod.id}
                      onClick={() => handleActivateTrial(mod)}
                    >
                      {trialActivating === mod.id ? 'Активация...' : 'Попробовать бесплатно (3 дня)'}
                    </button>
                  )}
                </>
              )}

              <Button
                color={
                  isActive ? 'blue' : hasPending ? 'zinc' : 'amber'
                }
                className="w-full !py-2.5 text-[13px] font-semibold"
                onClick={() => {
                  if (isActive) {
                    onModuleOpen?.(mod.code);
                  } else if (!hasPending) {
                    openPurchaseModal(mod);
                  }
                }}
                disabled={hasPending && !isActive}
              >
                {isActive ? 'Открыть' : hasPending ? 'Ожидает подтверждения' : 'Купить'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModulesPage;
