import React, { useState, useEffect } from 'react';
import { getModules, createPayment, checkPromo, type ModuleInfo, type PromoCheckResult } from '@/services/api-service';
import './Modules.css';

interface ModulesPageProps {
  onModuleOpen?: (code: string) => void;
}

const periodLabels: Record<string, string> = {
  monthly: 'Помесячно',
  yearly: 'Годовой',
  lifetime: 'Навсегда',
};

const ModulesPage: React.FC<ModulesPageProps> = ({ onModuleOpen }) => {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchaseModule, setPurchaseModule] = useState<ModuleInfo | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly' | 'lifetime'>('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

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
      case 'monthly': return mod.price_monthly;
      case 'yearly': return mod.price_yearly;
      case 'lifetime': return mod.price_lifetime;
      default: return null;
    }
  };

  const getAvailablePeriods = (mod: ModuleInfo) => {
    const periods: { key: 'monthly' | 'yearly' | 'lifetime'; label: string }[] = [];
    if (mod.price_monthly) periods.push({ key: 'monthly', label: `Помесячно — ${mod.price_monthly.toLocaleString('ru-RU')} ₽` });
    if (mod.price_yearly) periods.push({ key: 'yearly', label: `Годовой — ${mod.price_yearly.toLocaleString('ru-RU')} ₽` });
    if (mod.price_lifetime) periods.push({ key: 'lifetime', label: `Навсегда — ${mod.price_lifetime.toLocaleString('ru-RU')} ₽` });
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

  const handlePeriodChange = (period: 'monthly' | 'yearly' | 'lifetime') => {
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

  const openPurchaseModal = (mod: ModuleInfo) => {
    setSelectedPeriod(
      mod.price_lifetime ? 'lifetime' :
      mod.price_yearly ? 'yearly' :
      mod.price_monthly ? 'monthly' : 'lifetime'
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
    return <div className="modules-loading">Загрузка...</div>;
  }

  if (error) {
    return <div className="modules-error">{error}</div>;
  }

  return (
    <div className="modules-page">
      <h2 className="modules-title">Мои модули</h2>

      {/* Модалка покупки */}
      {purchaseModule && (
        <div className="modal-overlay" onClick={() => setPurchaseModule(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPurchaseModule(null)}>✕</button>
            <h3 className="modal-title">{purchaseModule.icon} {purchaseModule.name}</h3>
            {purchaseModule.description && (
              <p className="modal-description">{purchaseModule.description}</p>
            )}

            <div className="modal-periods">
              <h4>Выберите тариф</h4>
              {getAvailablePeriods(purchaseModule).map((p) => (
                <label
                  key={p.key}
                  className={`period-option ${selectedPeriod === p.key ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="period"
                    value={p.key}
                    checked={selectedPeriod === p.key}
                    onChange={() => handlePeriodChange(p.key)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>

            {/* Промокод */}
            <div className="promo-section">
              <label>Промокод</label>
              <div className="promo-input-group">
                <input
                  type="text"
                  placeholder="Введите промокод"
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value); setPromoError(''); }}
                  disabled={promoResult?.valid === true}
                />
                {promoResult?.valid ? (
                  <button className="promo-remove-btn" onClick={handleRemovePromo} title="Удалить промокод">
                    ✕
                  </button>
                ) : (
                  <button
                    className="promo-apply-btn"
                    onClick={handleApplyPromo}
                    disabled={!promoInput.trim() || promoChecking}
                  >
                    {promoChecking ? '...' : 'Применить'}
                  </button>
                )}
              </div>
              {promoError && <div className="promo-message error">{promoError}</div>}
              {promoResult?.valid && (
                <div className="promo-discount-info">
                  {promoResult.discount_type === 'percent'
                    ? `Скидка ${promoResult.discount_value}%`
                    : `Скидка ${promoResult.discount_value?.toLocaleString('ru-RU')} ₽`
                  }
                  {' — '}
                  <span className="original-price">{promoResult.original_amount?.toLocaleString('ru-RU')} ₽</span>
                  {' → '}
                  <strong>{promoResult.final_amount?.toLocaleString('ru-RU')} ₽</strong>
                </div>
              )}
            </div>

            {/* Итоговая цена */}
            <div className="price-summary">
              <div className={`final-price ${promoResult?.valid ? 'discounted' : ''}`}>
                {finalPrice != null ? `${finalPrice.toLocaleString('ru-RU')} ₽` : '—'}
              </div>
            </div>

            <button
              className="modal-submit-btn"
              onClick={handleSubmitPurchase}
              disabled={submitting}
            >
              {submitting ? 'Отправка...' : 'Отправить заявку'}
            </button>

            {submitResult && (
              <div className={`modal-result ${submitResult.success ? 'success' : 'error'}`}>
                {submitResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="modules-grid">
        {modules.map((mod) => {
          const hasPending = !!mod.pending_payment;
          const isActive = !!mod.access;

          return (
            <div
              key={mod.id}
              className={`module-card ${isActive ? 'active' : hasPending ? 'pending' : 'locked'}`}
            >
              <div className="module-card-header">
                <span className="module-icon">{mod.icon || '📦'}</span>
                <span className={`module-status ${isActive ? 'active' : hasPending ? 'pending' : 'inactive'}`}>
                  {isActive ? 'Активен' : hasPending ? 'Ожидает' : 'Недоступен'}
                </span>
              </div>

              <h3 className="module-name">{mod.name}</h3>
              <p className="module-description">{mod.description || 'Описание модуля'}</p>

              {isActive ? (
                <div className="module-access-info">
                  {mod.access!.expires_at ? (
                    <div className="module-expires">
                      До {new Date(mod.access!.expires_at).toLocaleDateString('ru-RU')}
                    </div>
                  ) : (
                    <div className="module-expires">Бессрочный доступ</div>
                  )}
                  <div className="module-regions">
                    Регионы: {mod.access!.regions.includes('*') ? 'Все' : mod.access!.regions.join(', ')}
                  </div>
                </div>
              ) : hasPending ? (
                <div className="module-pending-info">
                  <div className="pending-label">
                    Заявка отправлена {new Date(mod.pending_payment!.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  <div className="pending-detail">
                    {periodLabels[mod.pending_payment!.period] || mod.pending_payment!.period} — {mod.pending_payment!.amount.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="pending-hint">Ожидает подтверждения администратором</div>
                </div>
              ) : (
                <div className="module-pricing">
                  {mod.price_monthly && (
                    <div className="price-tag">
                      {mod.price_monthly.toLocaleString('ru-RU')} ₽/мес
                    </div>
                  )}
                  {mod.price_yearly && (
                    <div className="price-tag price-secondary">
                      {mod.price_yearly.toLocaleString('ru-RU')} ₽/год
                    </div>
                  )}
                  {mod.price_lifetime && (
                    <div className="price-tag price-highlight">
                      {mod.price_lifetime.toLocaleString('ru-RU')} ₽ навсегда
                    </div>
                  )}
                </div>
              )}

              <button
                className={`module-btn ${isActive ? 'open' : hasPending ? 'pending' : 'buy'}`}
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
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModulesPage;
