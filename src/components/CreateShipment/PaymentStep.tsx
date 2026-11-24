/**
 * Step 5 «الدفع / Payment» — the MyDHL+ «How will you pay?» model on SHIPPEC's
 * design system (AR / EN):
 *
 *   Transportation charges   SHIPPEC (sender) account | Receiver DHL account | Third-party DHL account
 *   Duties and taxes         Receiver will pay | SHIPPEC (sender) account | Third-party DHL account
 *                            (customs-declarable shipments only — separate fields, never mixed)
 *   Terms of trade           DHL's Incoterm list (reference data); DAP / DDP suggested from the
 *                            duties payer, set visibly with its reason, an incompatible manual
 *                            choice is explained (the server's validation stays authoritative).
 *
 * SHIPPEC's own account is never typed nor shown in full (masked, from the server). Payer
 * accounts are 6–12 digits (the Backend contract), required for Next where they apply.
 * "Remember these payment options" is not offered: SHIPPEC has no separate, secured store
 * for payment preferences, and account numbers are never saved into contacts.
 */
import { useEffect, useState } from 'react';
import { Landmark, Scale, Wallet } from 'lucide-react';
import { dhlShipmentService, type DutiesPayer, type ShipmentOptions, type TransportPayer } from '../../services/dhlShipment.service';
import { Button, ChoiceCards, Field, Note, Section, SelectInput, TextInput } from './ui';
import { useCsLang } from './csLang';
import { incotermAdvice, isInternational, paymentGate, suggestedIncoterm, translateIssue, type WizardForm } from './wizardModel';
import type { Wizard } from './useShipmentWizard';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 12);

export function StepPayment({ w, showGate }: { w: Wizard; showGate: boolean }) {
  const { form, update, errors, customs } = w;
  const { t, lang } = useCsLang();
  const gate = showGate ? paymentGate(form, lang) : {};
  const err = (k: string) => gate[k] ?? (errors[k] ? translateIssue(errors[k], lang) : null);
  const [incoterms, setIncoterms] = useState<Array<{ code: string; name: string | null }>>([]);
  const [opts, setOpts] = useState<ShipmentOptions | null>(null);
  /** Why the Incoterm just changed (shown, never silent). */
  const [autoSet, setAutoSet] = useState<string | null>(null);
  useEffect(() => {
    if (!customs) return;
    let alive = true;
    Promise.resolve(dhlShipmentService.incoterms()).then((r) => { if (alive) setIncoterms(r?.items ?? []); }, () => { if (alive) setIncoterms([]); });
    return () => { alive = false; };
  }, [customs]);
  useEffect(() => {
    let alive = true;
    Promise.resolve(dhlShipmentService.options()).then((o) => { if (alive) setOpts(o ?? null); }, () => { if (alive) setOpts(null); });
    return () => { alive = false; };
  }, []);
  const shippecAccount = opts?.payment?.shipper_account_masked ?? null;
  const accountLine = shippecAccount ? t(`حساب DHL: ${shippecAccount}`, `DHL account ${shippecAccount}`) : t('حساب SHIPPEC المعتمد لدى DHL.', "SHIPPEC's configured DHL account.");

  const setTransport = (v: TransportPayer) => update((f) => (f.transport_payer === v ? f : { ...f, transport_payer: v, transport_payer_account: '' }));
  const setDuties = (v: DutiesPayer) => {
    if (v === form.duties_payer) return;
    const next = suggestedIncoterm(v);
    update((f) => ({ ...f, duties_payer: v, duties_payer_account: v === 'third_party' ? f.duties_payer_account : '', incoterm: next }));
    setAutoSet(next !== form.incoterm
      ? (v === 'receiver'
        ? t(`تم ضبط شروط التجارة على ${next} لأن المستلم يدفع الرسوم.`, `Terms of trade set to ${next} because the receiver pays the duties.`)
        : t(`تم ضبط شروط التجارة على ${next} لأن ${v === 'shipper' ? 'SHIPPEC' : 'طرفًا ثالثًا'} يدفع الرسوم.`, `Terms of trade set to ${next} because ${v === 'shipper' ? 'SHIPPEC' : 'a third party'} pays the duties.`))
      : null);
  };
  const advice = incotermAdvice(form);
  const list = incoterms.length ? incoterms : [{ code: form.incoterm || 'DAP', name: null }];

  return (
    <div className="space-y-4" data-testid="payment-step">
      <Section title={t('كيف ستدفع؟', 'How will you pay?')} icon={<Wallet size={18} className="text-indigo-600" />}>
        <fieldset className="space-y-3" data-testid="transport-payer">
          <legend className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-2">{t('كيف سيتم دفع رسوم النقل؟', 'How will you pay for transportation charges?')}</legend>
          <ChoiceCards<TransportPayer>
            name={t('كيف سيتم دفع رسوم النقل؟', 'How will you pay for transportation charges?')} columns={3}
            value={form.transport_payer}
            onChange={setTransport}
            options={[
              { value: 'shipper', title: t('SHIPPEC / حساب المرسل', 'SHIPPEC / Sender account'), description: accountLine, icon: <Landmark size={18} /> },
              { value: 'receiver', title: t('حساب DHL للمستلم', 'Receiver DHL Account'), description: t('يُحاسَب المستلم برقم حسابه لدى DHL.', "Billed to the receiver's DHL account.") },
              { value: 'third_party', title: t('حساب DHL لطرف ثالث', 'Third Party DHL Account'), description: t('يُحاسَب طرف آخر برقم حسابه لدى DHL.', "Billed to another party's DHL account.") },
            ]}
          />
          {form.transport_payer !== 'shipper' && (
            <div className="max-w-sm">
              <Field
                label={form.transport_payer === 'receiver' ? t('رقم حساب DHL للمستلم', 'Receiver DHL Account Number') : t('رقم حساب DHL للطرف الثالث', 'Third Party DHL Account Number')}
                required error={err('transport_payer_account')} hint={t('من 6 إلى 12 رقمًا.', '6–12 digits.')}
              >
                {(id) => <TextInput id={id} value={form.transport_payer_account} onValue={(v) => update((f) => ({ ...f, transport_payer_account: digits(v) }))} error={err('transport_payer_account')} ltr inputMode="numeric" autoComplete="off" />}
              </Field>
            </div>
          )}
        </fieldset>

        {customs ? (
          <fieldset className="space-y-3 mt-5 pt-5 border-t border-slate-100 dark:border-slate-700" data-testid="duties-payer">
            <legend className="sr-only">{t('من سيتحمل الرسوم الجمركية والضرائب؟', 'How will duties and taxes be paid?')}</legend>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100" aria-hidden="true">{t('من سيتحمل الرسوم الجمركية والضرائب؟', 'How will duties and taxes be paid?')}</h3>
            <ChoiceCards<DutiesPayer>
              name={t('من سيتحمل الرسوم الجمركية والضرائب؟', 'How will duties and taxes be paid?')} columns={3}
              value={form.duties_payer}
              onChange={setDuties}
              options={[
                { value: 'receiver', title: t('المستلم سيدفع', 'Receiver will pay'), description: t('يدفعها المستلم عند التسليم (عادةً DAP).', 'The receiver pays on delivery (usually DAP).') },
                { value: 'shipper', title: t('SHIPPEC / حساب المرسل', 'SHIPPEC / Sender account'), description: <>{accountLine} {t('(عادةً DDP)', '(usually DDP)')}</> },
                { value: 'third_party', title: t('حساب DHL لطرف ثالث', 'Third Party DHL Account'), description: t('برقم حساب DHL لطرف آخر (عادةً DDP).', "With another party's DHL account (usually DDP).") },
              ]}
            />
            {err('duties_payer') && <p className="text-[11px] font-semibold text-red-600" role="alert">{err('duties_payer')}</p>}
            {form.duties_payer === 'third_party' && (
              <div className="max-w-sm">
                <Field label={t('رقم حساب DHL للطرف الثالث (الرسوم والضرائب)', 'Third Party DHL Account Number (duties & taxes)')} required error={err('duties_payer_account')} hint={t('من 6 إلى 12 رقمًا.', '6–12 digits.')}>
                  {(id) => <TextInput id={id} value={form.duties_payer_account} onValue={(v) => update((f) => ({ ...f, duties_payer_account: digits(v) }))} error={err('duties_payer_account')} ltr inputMode="numeric" autoComplete="off" />}
                </Field>
              </div>
            )}
            {form.duties_payer === 'receiver' && <p className="text-[11px] text-slate-500">{t('لا يُطلب رقم حساب للرسوم عندما يدفعها المستلم.', 'No duties account is asked when the receiver pays.')}</p>}
          </fieldset>
        ) : (
          <div className="mt-4"><Note>{t(`لا رسوم جمركية على هذه الشحنة (${isInternational(form) ? 'مستندات' : 'شحنة محلية'}).`, `No customs duties on this shipment (${isInternational(form) ? 'documents' : 'domestic'}).`)}</Note></div>
        )}
      </Section>

      {customs && (
        <Section title={t('شروط التجارة (Incoterm)', 'Terms of trade (Incoterm)')} icon={<Scale size={18} className="text-indigo-600" />}
          description={t('القائمة من DHL نفسها. الخادم يتحقق من توافقها مع دافع الرسوم قبل الإنشاء.', 'The list comes from DHL itself. The server checks it against the duties payer before creation.')}>
          <div className="max-w-md">
            <Field label="Incoterm" required error={err('incoterm')}>
              {(id) => (
                <SelectInput id={id} value={form.incoterm} onValue={(v) => { setAutoSet(null); update((f: WizardForm) => ({ ...f, incoterm: v })); }} error={err('incoterm')}>
                  {list.map((i) => <option key={i.code} value={i.code}>{i.code}{i.name ? ` — ${i.name}` : ''}</option>)}
                </SelectInput>
              )}
            </Field>
          </div>
          {autoSet && <div className="mt-3" data-testid="incoterm-auto"><Note>{autoSet}</Note></div>}
          {advice && (
            <div className="mt-3" data-testid="incoterm-warning">
              <Note tone="warn">
                {advice === 'needs_ddp'
                  ? t('طريقة الدفع هذه تتطلب عادةً DDP.', 'This payment selection normally requires DDP.')
                  : t('مع «المستلم سيدفع» لا يُستخدم DDP عادةً — DDP يعني أن جهة الإرسال تدفع الرسوم.', 'With «Receiver will pay», DDP is not normally used — DDP means the sending side pays the duties.')}
                {' '}
                <Button variant="ghost" className="!px-2 !py-0.5 text-xs" onClick={() => { const v = suggestedIncoterm(form.duties_payer); update((f) => ({ ...f, incoterm: v })); setAutoSet(null); }}>
                  {t(`استخدام ${suggestedIncoterm(form.duties_payer)}`, `Use ${suggestedIncoterm(form.duties_payer)}`)}
                </Button>
              </Note>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
