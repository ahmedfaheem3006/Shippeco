/**
 * State + Backend calls of the «إنشاء شحنة» wizard. Every DHL step goes
 * through the SHIPPEC Backend; nothing here can create a shipment except
 * `create()`, which runs only from the explicit confirmation on the review step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ApiError } from '../../utils/apiClient';
import { describeApiError } from '../../utils/apiErrors';
import {
  dhlShipmentService, type CreateResult, type DhlShipment, type Issue, type ProductOption, type RateQuote, type ValidationResult,
} from '../../services/dhlShipment.service';
import {
  emptyForm, fromShipment, issuesToErrors, needsCustoms, routeIssuesText, routeSnapshot, toContent, toggleOptionalService, visibleSteps,
  type FieldErrors, type StepId, type WizardForm,
} from './wizardModel';
import { useCsLang } from './csLang';

export type CostMode = 'dhl_quote' | 'manual' | 'unknown';
/**
 * Why DHL's services / prices could not be shown — kept apart so the page never calls a DHL answer
 * a deleted draft: SHIPPEC's own rules (field issues, no DHL call made), stale shipment data, DHL's
 * own answer, a draft that really no longer exists, anything else.
 */
export type ServicesError = { kind: 'local' | 'stale' | 'provider' | 'missing' | 'other'; message: string };
export interface Pricing { selling_price: string; cost_mode: CostMode; manual_cost: string }
export type CreatePhase = 'idle' | 'saving' | 'validating' | 'pricing' | 'confirming' | 'sending' | 'done';

/** Problems the Backend sends with a blocked step (409 CONFIRMATION_BLOCKED → details.problems, 422 → details.issues). */
function issuesOf(err: unknown): Issue[] {
  if (!(err instanceof ApiError)) return [];
  if (err.details.length) return err.details;
  const raw = err.rawDetails as { issues?: Issue[]; problems?: Array<{ code: string; message: string }> } | undefined;
  if (raw?.issues?.length) return raw.issues;
  if (raw?.problems?.length) return raw.problems.map((p) => ({ field: problemField(p.code), message: p.message }));
  return [];
}
const problemField = (code: string) => ({
  PRODUCT_REQUIRED: 'product_code', PRODUCT_NOT_VERIFIED: 'product_code', QUOTE_STALE: 'product_code', PRICE_NOT_APPROVED: 'price',
  CLIENT_REQUIRED: 'client', DHL_VALIDATION_REQUIRED: 'dhl', VALIDATION_ISSUES: 'dhl', VALIDATION_STALE: 'dhl', CONTENT_CHANGED: 'dhl',
} as Record<string, string>)[code] ?? 'review';

export function useShipmentWizard(opts: { draftId?: number | null } = {}) {
  const { t, lang } = useCsLang();
  // messages built inside callbacks read the current language through a ref (no stale closure, no re-created callbacks)
  const tRef = useRef(t);
  const langRef = useRef(lang);
  useEffect(() => { tRef.current = t; langRef.current = lang; }, [t, lang]);
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [shipment, setShipment] = useState<DhlShipment | null>(null);
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>('parties');
  const [loading, setLoading] = useState<boolean>(!!opts.draftId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [stepIssues, setStepIssues] = useState<Partial<Record<StepId, number>>>({});
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [quotes, setQuotes] = useState<RateQuote[] | null>(null);
  /** When SHIPPEC received the current DHL quotes (Backend rates_checked_at) — never the page time. */
  const [quotedAt, setQuotedAt] = useState<string | null>(null);
  const [servicesSnapshot, setServicesSnapshot] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<ServicesError | null>(null);
  /**
   * Request lifecycle: every products / rates / selection request belongs to the draft that was active
   * when it started. `generation` changes when the draft is replaced (New) or the page unmounts;
   * `servicesSeq` when a newer refresh starts. An answer from an older generation / refresh is ignored —
   * it can never fill another draft. Nothing is retried.
   */
  /**
   * May a DHL courier be booked here (GET /dhl/options → features.pickup_booking, DHL_PROD_PICKUP_ENABLED
   * on the server)? null = not known yet. The Backend stays authoritative either way.
   */
  const [pickupBookingEnabled, setPickupBookingEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve(dhlShipmentService.options()).then(
      (o) => { if (alive) setPickupBookingEnabled(typeof o?.features?.pickup_booking === 'boolean' ? o.features.pickup_booking : null); },
      () => { if (alive) setPickupBookingEnabled(null); },
    );
    return () => { alive = false; };
  }, []);
  const generation = useRef(0);
  const servicesSeq = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validatedJson, setValidatedJson] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [pricing, setPricing] = useState<Pricing>({ selling_price: '', cost_mode: 'dhl_quote', manual_cost: '' });
  const [createPhase, setCreatePhase] = useState<CreatePhase>('idle');
  const [createError, setCreateError] = useState<{ message: string; issues: Issue[] } | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const inFlight = useRef(false);

  const contentJson = useMemo(() => JSON.stringify(toContent(form)), [form]);
  const dirty = savedJson !== contentJson;
  const steps = useMemo(() => visibleSteps(form), [form]);
  const snapshot = useMemo(() => routeSnapshot(form), [form]);
  const servicesStale = !!servicesSnapshot && servicesSnapshot !== snapshot;

  const applyShipment = useCallback((sh: DhlShipment, opt: { resetForm?: boolean; clientName?: string } = {}) => {
    setShipment(sh);
    if (opt.resetForm) {
      const f = fromShipment(sh, opt.clientName ?? '');
      setForm(f);
      setSavedJson(JSON.stringify(toContent(f)));
    }
  }, []);

  // Resume a draft (?draft=ID)
  useEffect(() => {
    if (!opts.draftId) return;
    let alive = true;
    setLoading(true);
    dhlShipmentService.get(opts.draftId).then((sh) => {
      if (!alive) return;
      applyShipment(sh, { resetForm: true, clientName: String(sh['client_name'] ?? '') });
      if (sh.available_products) setProducts(sh.available_products);
      if (sh.rate_quotes) setQuotes(sh.rate_quotes);
      setQuotedAt(typeof sh['rates_checked_at'] === 'string' ? (sh['rates_checked_at'] as string) : null);
      if (sh.selling_price != null) {
        setPricing({ selling_price: String(Number(sh.selling_price)), cost_mode: (sh.dhl_cost_source ?? 'dhl_quote') as CostMode, manual_cost: sh.dhl_cost != null ? String(Number(sh.dhl_cost)) : '' });
      }
      setLoadError(null);
      setLoading(false);
    }, (err) => {
      if (!alive) return;
      setLoadError(describeApiError(err, tRef.current('تعذر تحميل المسودة', 'Could not load the draft')));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [opts.draftId, applyShipment]);

  // Products / quotes fetched before a reload belong to the stored route.
  useEffect(() => {
    if (shipment && products && servicesSnapshot === null && !dirty) setServicesSnapshot(snapshot);
  }, [shipment, products, servicesSnapshot, dirty, snapshot]);

  // Unsaved changes: the browser asks before leaving the page.
  useEffect(() => {
    if (!dirty || result) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, result]);

  const update = useCallback((fn: (f: WizardForm) => WizardForm) => setForm((f) => fn(f)), []);

  const showIssues = useCallback((issues: Issue[]) => {
    const { errors: e, byStep } = issuesToErrors(issues);
    setErrors(e);
    setStepIssues(byStep);
  }, []);

  /**
   * The SHIPPEC price travels with the draft: whoever prepares the shipment prices it, and whoever
   * creates it (often a manager) finds that price — not an empty field. Quietly skipped while the
   * DHL quote is stale or the role may not price; create() still sets the price explicitly.
   */
  const pricedJson = useRef<string | null>(null);
  const persistPrice = useCallback(async (sh: DhlShipment) => {
    const selling = Number(pricing.selling_price);
    if (!pricing.selling_price.trim() || !Number.isFinite(selling) || selling <= 0 || !form.product_code) return;
    if (pricing.cost_mode === 'manual' && !pricing.manual_cost.trim()) return;
    const q = quotes?.find((x) => x.productCode === form.product_code);
    if (pricing.cost_mode === 'dhl_quote' && (!q || q.amount == null || q.currency !== 'SAR' || servicesStale)) return;
    const key = JSON.stringify([sh.id, sh.content_fingerprint ?? null, pricing, form.product_code, q?.amount ?? null]);
    if (pricedJson.current === key) return;
    try {
      const r = await dhlShipmentService.setPricing(sh.id, {
        selling_price: selling, price_currency: 'SAR', dhl_cost_source: pricing.cost_mode,
        ...(pricing.cost_mode === 'manual' ? { dhl_cost: Number(pricing.manual_cost) } : {}),
      });
      pricedJson.current = key;
      setShipment(r.shipment);
    } catch { /* not stored now (stale quote / role / locked): the price is approved again at creation */ }
  }, [pricing, form.product_code, quotes, servicesStale]);

  /** Saves the draft when it changed (create on first save), then its SHIPPEC price. Returns the stored shipment. */
  const saveContent = useCallback(async (quiet = true, override?: WizardForm): Promise<DhlShipment | null> => {
    const content = toContent(override ?? form);
    const json = JSON.stringify(content);
    if (shipment && json === savedJson) return shipment;
    setSaving(true);
    try {
      let sh: DhlShipment;
      if (!shipment) {
        sh = await dhlShipmentService.createDraft(content);
      } else {
        if (shipment.creation_status === 'ready') await dhlShipmentService.unconfirm(shipment.id);
        sh = await dhlShipmentService.updateDraft(shipment.id, content);
      }
      setShipment(sh);
      setSavedJson(json);
      setValidation(null);
      setErrors({});
      setStepIssues({});
      if (!quiet) toast.success(tRef.current('تم حفظ المسودة', 'Draft saved'));
      if (!shipment) window.history.replaceState(window.history.state, '', `/create-shipment?draft=${sh.id}`);
      return sh;
    } catch (err) {
      const issues = issuesOf(err);
      if (issues.length) showIssues(issues);
      toast.error(issues.length ? tRef.current('تعذر الحفظ — راجع الحقول المحددة', 'Could not save — check the marked fields') : describeApiError(err, tRef.current('تعذر حفظ المسودة', 'Could not save the draft')));
      return null;
    } finally {
      setSaving(false);
    }
  }, [form, shipment, savedJson, showIssues]);

  const save = useCallback(async (quiet = true, override?: WizardForm): Promise<DhlShipment | null> => {
    const sh = await saveContent(quiet, override);
    if (sh && sh.creation_status !== 'ready') await persistPrice(sh);
    return sh;
  }, [saveContent, persistPrice]);

  /**
   * DHL products + quotes for the current route (through the Backend). `next` = the form after a
   * change that needs DHL again (a new shipment date, an optional service): it is applied, saved,
   * and DHL is asked for that data — the old list never stays selectable.
   */
  const classify = useCallback((err: unknown, fallback: [string, string]): ServicesError => {
    const T = (ar: string, en: string) => (langRef.current === 'en' ? en : ar);
    if (err instanceof ApiError) {
      if (err.code === 'ROUTE_INCOMPLETE') return { kind: 'local', message: routeIssuesText(issuesOf(err), langRef.current) };
      if (err.code === 'CONTENT_CHANGED' || err.code === 'PRODUCTS_STALE' || err.code === 'QUOTE_STALE') {
        return { kind: 'stale', message: T('تغيّرت بيانات الشحنة. حدّث الخدمات والأسعار.', 'Shipment data changed. Refresh services and prices.') };
      }
      if (err.status === 404 && err.code === 'NOT_FOUND') return { kind: 'missing', message: T('لم تعد مسودة الشحنة هذه موجودة.', 'This shipment draft no longer exists.') };
      // DHL's own answer (the Backend's DHL_* codes) — DHL's text as given
      if (String(err.code ?? '').startsWith('DHL_')) return { kind: 'provider', message: err.message };
    }
    return { kind: 'other', message: describeApiError(err, T(...fallback)) };
  }, []);

  const fetchServices = useCallback(async (next?: WizardForm) => {
    const f = next ?? form;
    if (next) setForm(next);
    const mySeq = ++servicesSeq.current;
    const myGen = generation.current;
    const current = () => mySeq === servicesSeq.current && myGen === generation.current;
    setServicesLoading(true);
    setServicesError(null);
    try {
      // save the current draft → the Backend checks its own rules → GET products → POST rates (in that order)
      const sh = await save(true, f);
      if (!sh || !current()) return;
      const p = await dhlShipmentService.checkProducts(sh.id);
      if (!current()) return;
      let r: Awaited<ReturnType<typeof dhlShipmentService.checkRates>> | null = null;
      let ratesErr: unknown = null;
      try { r = await dhlShipmentService.checkRates(sh.id); } catch (e) { ratesErr = e; }
      if (!current()) return;
      setProducts(p.products);
      setQuotes(r ? r.quotes : []);
      setQuotedAt(r ? r.quoted_at ?? null : null);
      if (ratesErr) {
        const c = classify(ratesErr, ['تعذر جلب الأسعار', 'Could not load the prices']);
        setServicesError({ ...c, message: `${tRef.current('تعذر جلب الأسعار:', 'Could not load the prices:')} ${c.message}` });
      }
      setServicesSnapshot(routeSnapshot(f));
      const still = p.products.some((x) => x.productCode === f.product_code);
      if (f.product_code && !still) setForm((x) => ({ ...x, product_code: '', local_product_code: '' }));
    } catch (err) {
      if (!current()) return;
      const issues = issuesOf(err);
      if (issues.length) showIssues(issues);
      setServicesError(classify(err, ['تعذر جلب خدمات DHL', 'Could not load the DHL services']));
    } finally {
      if (current()) setServicesLoading(false);
    }
  }, [save, form, showIssues, classify]);

  /** An optional DHL service ticked / unticked: saved, then DHL prices the shipment again with it. */
  const toggleService = useCallback((code: string) => {
    void fetchServices({ ...form, service_codes: toggleOptionalService(form.service_codes, code) });
  }, [fetchServices, form]);
  /** A new shipment date: saved, then DHL's products and prices for that date. */
  const changeShipmentDate = useCallback((ymd: string) => {
    if (!ymd || ymd === form.shipment_date) return;
    void fetchServices({ ...form, shipment_date: ymd });
  }, [fetchServices, form]);

  const chooseProduct = useCallback(async (code: string) => {
    const myGen = generation.current;
    setSelecting(code);
    try {
      const sh = await save();
      if (!sh || myGen !== generation.current) return;
      const updated = await dhlShipmentService.selectProduct(sh.id, code);
      if (myGen !== generation.current) return; // the draft was replaced meanwhile
      setShipment(updated);
      const next = { ...form, product_code: updated.product_code ?? code, local_product_code: updated.local_product_code ?? '' };
      setForm(next);
      setSavedJson(JSON.stringify(toContent(next)));
      setPricing((p) => ({ ...p, cost_mode: 'dhl_quote' }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRODUCTS_STALE') {
        toast.error(tRef.current('تغيّرت بيانات الشحنة — حدّث قائمة الخدمات', 'The shipment data changed — refresh the services'));
        setServicesSnapshot('stale');
      } else toast.error(describeApiError(err, tRef.current('تعذر اختيار الخدمة', 'Could not select the service')));
    } finally {
      setSelecting(null);
    }
  }, [save, form]);

  /** Local rules + DHL validateDataOnly (nothing is created). */
  const validate = useCallback(async (): Promise<ValidationResult | null> => {
    setValidating(true);
    try {
      const sh = await save();
      if (!sh) return null;
      const r = await dhlShipmentService.validate(sh.id);
      setShipment(r.shipment);
      setValidation(r);
      setValidatedJson(JSON.stringify(toContent(form)));
      showIssues(r.issues);
      return r;
    } catch (err) {
      toast.error(describeApiError(err, tRef.current('تعذر التحقق من البيانات', 'Could not validate the data')));
      return null;
    } finally {
      setValidating(false);
    }
  }, [save, form, showIssues]);

  const quote = useMemo(() => quotes?.find((q) => q.productCode === form.product_code) ?? null, [quotes, form.product_code]);
  const dhlCost = pricing.cost_mode === 'dhl_quote' ? quote?.amount ?? null : pricing.cost_mode === 'manual' ? (Number(pricing.manual_cost) || (pricing.manual_cost === '0' ? 0 : null)) : null;

  /**
   * The ONE creation: save → validate (when needed) → price → confirm → create.
   * A second click while it runs does nothing; the result decides what is shown.
   */
  const create = useCallback(async () => {
    if (inFlight.current || result) return;
    inFlight.current = true;
    setCreateError(null);
    try {
      setCreatePhase('saving');
      let sh = await save();
      if (!sh) throw new Error(tRef.current('تعذر حفظ المسودة', 'Could not save the draft'));
      const json = JSON.stringify(toContent(form));
      if (sh.creation_status !== 'ready') {
        if (!(sh.creation_status === 'validated' && validatedJson === json && sh.dhl_validation_status === 'passed')) {
          setCreatePhase('validating');
          const v = await dhlShipmentService.validate(sh.id);
          setValidation(v);
          setValidatedJson(json);
          sh = v.shipment;
          if (!v.ok || v.dhl_validation.status !== 'passed') {
            showIssues(v.issues);
            setCreateError({ message: v.ok ? tRef.current('لم يكتمل تحقق DHL — أعد المحاولة بعد قليل', 'DHL validation did not complete — try again shortly') : tRef.current('البيانات لا تجتاز التحقق — صحّح الحقول المحددة', 'The data does not pass validation — correct the marked fields'), issues: v.issues });
            return;
          }
        }
        setCreatePhase('pricing');
        const selling = Number(pricing.selling_price);
        await dhlShipmentService.setPricing(sh.id, {
          selling_price: selling, price_currency: 'SAR', dhl_cost_source: pricing.cost_mode,
          ...(pricing.cost_mode === 'manual' ? { dhl_cost: Number(pricing.manual_cost) } : {}),
        });
        setCreatePhase('confirming');
        sh = await dhlShipmentService.confirm(sh.id);
        setShipment(sh);
      }
      setCreatePhase('sending');
      const r = await dhlShipmentService.create(sh.id);
      setResult(r);
      setShipment(r.shipment);
      setCreatePhase('done');
    } catch (err) {
      const issues = issuesOf(err);
      if (issues.length) showIssues(issues);
      // issues stay as the Backend wrote them; the review shows them in the current language
      setCreateError({ message: describeApiError(err, tRef.current('تعذر إنشاء الشحنة', 'Could not create the shipment')), issues });
      setCreatePhase('idle');
    } finally {
      inFlight.current = false;
      setCreatePhase((p) => (p === 'done' ? p : 'idle'));
    }
  }, [result, save, form, validatedJson, pricing, showIssues]);

  const reset = useCallback(() => {
    generation.current += 1; // answers still on their way belong to the old draft
    setServicesLoading(false);
    setSelecting(null);
    setServicesError(null);
    setForm(emptyForm());
    setShipment(null);
    setSavedJson(null);
    setStep('parties');
    setErrors({});
    setStepIssues({});
    setProducts(null);
    setQuotes(null);
    setQuotedAt(null);
    setServicesSnapshot(null);
    setValidation(null);
    setValidatedJson(null);
    setPricing({ selling_price: '', cost_mode: 'dhl_quote', manual_cost: '' });
    setCreatePhase('idle');
    setCreateError(null);
    setResult(null);
    window.history.replaceState(window.history.state, '', '/create-shipment');
  }, []);

  return {
    form, update, shipment, setShipment, step, setStep, steps, loading, loadError, saving, dirty, errors, stepIssues,
    pickupBookingEnabled,
    save, products, quotes, quote, quotedAt, servicesLoading, servicesError, servicesStale, fetchServices, toggleService, changeShipmentDate, chooseProduct, selecting,
    validate, validation, validating, validationCurrent: validatedJson === contentJson && !!validation,
    pricing, setPricing, dhlCost, create, createPhase, createError, result, setResult, reset, customs: needsCustoms(form),
  };
}
export type Wizard = ReturnType<typeof useShipmentWizard>;
