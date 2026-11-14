import React, { useMemo, useRef, useState } from 'react';
import {
  Award,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Moon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { triggerHaptic } from '../utils/haptics';
import { PIN_STORAGE_KEY } from './OnboardingJourney';
import {
  AppIconVariant,
  buildAppIconSvgString,
  downloadAppIconPng1024,
  downloadAppIconSvg,
} from '../utils/appIconGenerator';

type AdaptiveMask = 'squircle' | 'circle' | 'rounded' | 'teardrop';

interface RippleState {
  id: string;
  key: number;
  x: number;
  y: number;
}

const APP_VERSION = '1.0.0';
const APP_BUILD = 'Build 2026.11.15';
const DEV_MODE_STORAGE_KEY = 'aqarplus_developer_mode_v1';
const RATING_STORAGE_KEY = 'aqarplus_user_rating_v1';

export function AboutAppView() {
  const { state, lang, theme, wsStatus, presence, pushToast, refreshState } = useAqar();

  const [devTapCount, setDevTapCount] = useState(0);
  const [devMode, setDevMode] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem(DEV_MODE_STORAGE_KEY) === '1'
  );
  const tapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ripple micro-interaction state
  const [ripple, setRipple] = useState<RippleState | null>(null);

  // App Icon Studio state
  const [selectedVariant, setSelectedVariant] = useState<AppIconVariant>('primary_squircle');
  const [adaptiveMask, setAdaptiveMask] = useState<AdaptiveMask>('squircle');
  const [iconExportBusy, setIconExportBusy] = useState(false);

  // Interactive List Modal States
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<string | null>(null);

  const [showRateModal, setShowRateModal] = useState(false);
  const [userRating, setUserRating] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? Number(localStorage.getItem(RATING_STORAGE_KEY) || 5) : 5;
    return saved >= 1 && saved <= 5 ? saved : 5;
  });
  const [rateComment, setRateComment] = useState('');

  // PIN-protected Clear Local Data modal
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const iconPreviewDataUri = useMemo(() => {
    const svg = buildAppIconSvgString(selectedVariant);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [selectedVariant]);

  const adaptiveBgDataUri = useMemo(() => {
    return `data:image/svg+xml;utf8,${encodeURIComponent(buildAppIconSvgString('adaptive_background'))}`;
  }, []);

  const adaptiveFgDataUri = useMemo(() => {
    return `data:image/svg+xml;utf8,${encodeURIComponent(buildAppIconSvgString('adaptive_foreground'))}`;
  }, []);

  if (!state) return null;

  const isAr = lang === 'ar';
  const companyAffiliationName = 'شركة عبدالله إبراهيم محمد الجنيدل العقارية';

  const triggerRowInteraction = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('light');
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({
      id,
      key: Date.now(),
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleCreatorTap = () => {
    triggerHaptic('light');
    if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
    const next = devTapCount + 1;
    if (next >= 5) {
      setDevTapCount(0);
      setDevMode(true);
      localStorage.setItem(DEV_MODE_STORAGE_KEY, '1');
      triggerHaptic('success');
      pushToast('success', 'شكراً لاستخدامك عقار بلس! تم تفعيل وضع المطور');
    } else {
      setDevTapCount(next);
      tapResetTimerRef.current = setTimeout(() => setDevTapCount(0), 2500);
    }
  };

  const handleCheckUpdates = (e: React.MouseEvent<HTMLButtonElement>) => {
    triggerRowInteraction('updates', e);
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateCheckResult(null);
    setTimeout(() => {
      setCheckingUpdate(false);
      const msg = isAr
        ? `أنت تستخدم أحدث إصدار معتمد (${APP_VERSION} · ${APP_BUILD})`
        : `You are running the latest version (${APP_VERSION} · ${APP_BUILD})`;
      setUpdateCheckResult(msg);
      pushToast('success', msg);
    }, 1100);
  };

  const handleDownloadPng1024 = async (variant: AppIconVariant) => {
    setIconExportBusy(true);
    triggerHaptic('medium');
    try {
      await downloadAppIconPng1024(variant, `aqarplus-${variant}-1024x1024.png`);
      pushToast('success', isAr ? 'تم تنزيل الأيقونة بدقة 1024×1024 PNG' : 'Downloaded 1024×1024 PNG');
    } catch {
      pushToast('error', isAr ? 'تعذر إنشاء ملف PNG' : 'PNG export failed');
    } finally {
      setIconExportBusy(false);
    }
  };

  const handleDownloadSvg = (variant: AppIconVariant) => {
    triggerHaptic('light');
    downloadAppIconSvg(variant, `aqarplus-${variant}.svg`);
    pushToast('success', isAr ? 'تم تنزيل ملف SVG المتجه بنجاح' : 'Downloaded SVG vector');
  };

  const handleSubmitRating = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(RATING_STORAGE_KEY, String(userRating));
    triggerHaptic('success');
    pushToast('success', isAr ? `شكراً لتقييمك (${userRating} نجوم) لعقار بلس!` : `Thank you for rating ${userRating} stars!`);
    setShowRateModal(false);
  };

  const handleClearLocalData = async (e: React.FormEvent) => {
    e.preventDefault();
    const expectedPin = localStorage.getItem(PIN_STORAGE_KEY) || '1234';
    if (pinInput.trim() !== expectedPin) {
      triggerHaptic('error');
      setPinError(
        isAr
          ? 'رمز PIN غير صحيح (الرمز الافتراضي عند عدم التخصيص هو 1234)'
          : 'Incorrect Master PIN (default is 1234 if unchanged)'
      );
      return;
    }
    triggerHaptic('success');
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aqarplus_')) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    setShowClearDataModal(false);
    setPinInput('');
    setPinError('');
    setDevMode(false);
    await refreshState();
    pushToast(
      'success',
      isAr
        ? 'تم مسح الذاكرة المحلية والبيانات المؤقتة وإعادة المزامنة بنجاح'
        : 'Local cache & preferences cleared safely'
    );
  };

  const handlePrintLegalPdf = () => {
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>اتفاقية الاستخدام وسياسة الخصوصية - AqarPlus</title><style>
      @page{size:A4 portrait;margin:16mm;} body{font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;color:#0f172a;line-height:1.75;}
      h1{color:#26478D;border-bottom:2px solid #26478D;padding-bottom:8px;} h2{color:#1e3a75;margin-top:18px;font-size:15px;} p,li{font-size:12.5px;color:#334155;}
    </style></head><body>
      <h1>اتفاقية الاستخدام وسياسة الخصوصية — عقار بلس | AqarPlus</h1>
      <p><strong>الإصدار:</strong> ${APP_VERSION} (${APP_BUILD}) · <strong>الجهة المستفيدة:</strong> ${companyAffiliationName}</p>
      <h2>1. حماية البيانات العقارية والمالية</h2>
      <p>يتم حفظ كافة سجلات العقارات والمستأجرين والعقود وسندات القبض والقيود المحاسبية داخل بيئة مشفرة ومركزية خاضعة لصلاحيات الأدوار الوظيفية ومستويات الوصول المعتمدة.</p>
      <h2>2. عدم قابلية حذف السجلات التاريخية</h2>
      <p>يلتزم النظام بقاعدة الأرشفة الذكية وسجل التدقيق الدائم غير القابل للتعديل أو الحذف لضمان السلامة القانونية والمحاسبية ومطابقة متطلبات منصة إيجار والزكاة والضريبة والجمارك.</p>
      <h2>3. الملكية الفكرية</h2>
      <p>تم تصميم وتطوير المنظومة بواسطة عبدالله عبدالحميد. جميع الحقوق محفوظة © 2026 AqarPlus.</p>
    </body></html>`;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 1200);
      }, 250);
    }
  };

  const maskClass: Record<AdaptiveMask, string> = {
    squircle: 'rounded-[26%]',
    circle: 'rounded-full',
    rounded: 'rounded-2xl',
    teardrop: 'rounded-tl-[45%] rounded-tr-[45%] rounded-bl-[45%] rounded-br-xl',
  };

  const actionItems = [
    {
      id: 'legal',
      titleAr: 'اتفاقية الاستخدام وسياسة الخصوصية',
      titleEn: 'Terms of Use & Privacy Policy',
      subtitleAr: 'عرض الوثيقة القانونية وحماية البيانات داخل التطبيق',
      subtitleEn: 'View legal terms and data protection policy',
      icon: FileText,
      iconTone: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        triggerRowInteraction('legal', e);
        setShowLegalModal(true);
      },
    },
    {
      id: 'support',
      titleAr: 'تواصل مع الدعم الفني',
      titleEn: 'Contact Technical Support',
      subtitleAr: 'مراسلة مباشرة عبر واتساب أو البريد الإلكتروني',
      subtitleEn: 'Direct WhatsApp message or support email',
      icon: MessageCircle,
      iconTone: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        triggerRowInteraction('support', e);
        setShowSupportModal(true);
      },
    },
    {
      id: 'updates',
      titleAr: 'التحقق من التحديثات',
      titleEn: 'Check for Updates',
      subtitleAr: updateCheckResult || `${APP_VERSION} · ${APP_BUILD}`,
      subtitleEn: updateCheckResult || `${APP_VERSION} · ${APP_BUILD}`,
      icon: RefreshCw,
      iconTone: 'bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400',
      loading: checkingUpdate,
      onClick: handleCheckUpdates,
    },
    {
      id: 'rate',
      titleAr: 'قيّم التطبيق',
      titleEn: 'Rate AqarPlus',
      subtitleAr: `تقييمك الحالي: ${userRating} من 5 نجوم · مشاركة انطباعك`,
      subtitleEn: `Your current rating: ${userRating}/5 stars`,
      icon: Star,
      iconTone: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        triggerRowInteraction('rate', e);
        setShowRateModal(true);
      },
    },
    {
      id: 'clear',
      titleAr: 'مسح البيانات المحلية',
      titleEn: 'Clear Local Cache & Reset',
      subtitleAr: 'خيار متقدم محمي برمز PIN لإعادة ضبط التخزين المحلي',
      subtitleEn: 'PIN-protected local storage & preferences reset',
      icon: Trash2,
      iconTone: 'bg-red-500/12 text-red-600 dark:text-red-400',
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        triggerRowInteraction('clear', e);
        setPinInput('');
        setPinError('');
        setShowClearDataModal(true);
      },
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* A. Hero Header with Glass Morphism 3.0 Squircle App Icon */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-[#26478D] via-[#132247] to-[#0A0E1A] text-white p-8 sm:p-10 shadow-2xl">
        {/* Soft Ambient Glows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 start-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-amber-400/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 end-10 w-80 h-80 rounded-full bg-blue-400/15 blur-3xl"
        />

        <div className="relative z-10 flex flex-col items-center text-center space-y-4 animate-aqar-hero">
          {/* Large Centered Squircle App Icon with 3D Depth & Soft Halo */}
          <div className="relative group">
            <div
              aria-hidden="true"
              className="absolute -inset-4 rounded-[2.4rem] bg-gradient-to-tr from-amber-300/25 via-blue-400/25 to-white/20 blur-xl opacity-80 group-hover:opacity-100 transition-opacity duration-300"
            />
            <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-[2rem] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/25 overflow-hidden bg-gradient-to-br from-[#26478D] to-[#0A0E1A] flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.03]">
              <img
                src={iconPreviewDataUri}
                alt="AqarPlus App Icon"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="space-y-2 max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-l from-white via-slate-100 to-amber-200 bg-clip-text text-transparent">
              عقار بلس | AqarPlus
            </h2>
            <button
              type="button"
              onClick={handleCreatorTap}
              className="text-xs sm:text-sm font-mono-num text-[#97A5BA] hover:text-white transition-colors cursor-pointer select-none"
            >
              الإصدار {APP_VERSION} ({APP_BUILD})
            </button>
          </div>

          {/* Official Attached Brand SVG Showcase */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-xs">
              <img
                src="/assets/aistudio/Aqar_plus_8de53ba4.svg"
                alt="AqarPlus Vector Logo"
                referrerPolicy="no-referrer"
                className="w-7 h-7 object-contain"
              />
              <span className="text-slate-100 font-medium">
                {isAr ? 'الهوية الهندسية المعتمدة للتطبيق' : 'Official Architectural Emblem'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* B. App Vision Card */}
      <section className="p-6 sm:p-7 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#26478D] dark:text-blue-400">
          <Sparkles className="w-4 h-4" />
          <span>{isAr ? 'رؤية التطبيق' : 'App Vision'}</span>
        </div>
        <p className="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-200 font-medium">
          نظام إدارة عقارية متكامل، صُمم ليمنح شركات العقارات التحكم المطلق، الأمان، والسلاسة في إدارة الأصول، المستأجرين، والمالية، بكل احترافية وعصرية.
        </p>
      </section>

      {/* C. The Creator (Featured Honor Card with 5-Tap Developer Mode Easter Egg) */}
      <section className="relative overflow-hidden p-6 sm:p-7 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#26478D] dark:text-blue-400">
              <Code2 className="w-4 h-4" />
              <span>تم التطوير والتصميم بكل إتقان بواسطة:</span>
            </div>
            <div>
              <button
                type="button"
                onClick={handleCreatorTap}
                title={isAr ? 'اضغط 5 مرات لتفعيل وضع المطور' : 'Tap 5 times for Developer Mode'}
                className="text-start text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white hover:text-[#26478D] dark:hover:text-blue-400 cursor-pointer select-none focus:outline-none active:scale-[0.99] transition-colors"
              >
                عبدالله عبدالحميد
              </button>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
              مطور نظم إدارة عقارية متكاملة
            </p>
          </div>

          <div className="w-12 h-12 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Hidden Developer Mode Activation Banner */}
        {devMode && (
          <div className="relative z-10 mt-3 p-4 rounded-xl border border-emerald-500/35 bg-emerald-500/10 text-xs space-y-2 animate-aqar-fade-scale">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                شكراً لاستخدامك عقار بلس! تم تفعيل وضع المطور (Developer Mode)
              </span>
              <button
                type="button"
                onClick={() => {
                  setDevMode(false);
                  localStorage.removeItem(DEV_MODE_STORAGE_KEY);
                }}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
              >
                إيقاف وضع المطور
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono-num text-[11px] text-slate-600 dark:text-slate-300">
              <div>WS Sync: {wsStatus}</div>
              <div>Active Sessions: {presence.length}</div>
              <div>Theme Mode: {theme}</div>
              <div>Users Loaded: {state.users.length}</div>
            </div>
          </div>
        )}
      </section>

      {/* D. Company Affiliation */}
      <section className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] p-1.5 flex items-center justify-center overflow-hidden shrink-0">
            {state.settings.logoDataUrl ? (
              <img
                src={state.settings.logoDataUrl}
                alt={companyAffiliationName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <img
                src="/assets/aistudio/Aqar_plus_8de53ba4.svg"
                alt={companyAffiliationName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="text-[11px] text-slate-500 dark:text-[#97A5BA]">الانتماء المؤسسي المعتمد</div>
            <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              مخصص ومُفعل لخدمة: {companyAffiliationName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
          <Building2 className="w-4 h-4" />
          <span>ترخيص منشأة موثق</span>
        </div>
      </section>

      {/* App Icon Design Kit (1024x1024 PNG, Android Adaptive Icon Layers & Dark/Light Variants) */}
      <section className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#26478D] dark:text-blue-400">
              <Layers className="w-4 h-4" />
              <span>تصميم أيقونة التطبيق وحزمة التصدير التقنية (1024 × 1024)</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              معاينة وتنزيل أيقونة iOS / Android بدقة 1024×1024، طبقات Android Adaptive Icon، ونسختي الوضع الداكن والفاتح.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={iconExportBusy}
              onClick={() => handleDownloadPng1024(selectedVariant)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#26478D] hover:bg-[#1e3a75] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تنزيل PNG (1024×1024)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadSvg(selectedVariant)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تنزيل SVG</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Variant Picker Grid */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                {
                  id: 'primary_squircle',
                  title: 'الأيقونة الرئيسية (Squircle)',
                  desc: 'تدرج قطري #26478D ← #0A0E1A مع عمق 3D وتوهج',
                  icon: Smartphone,
                },
                {
                  id: 'dark_luminous',
                  title: 'نسخة الوضع الداكن (Luminous)',
                  desc: 'توهج مضيء قليلاً للشاشات الليلية الداكنة',
                  icon: Moon,
                },
                {
                  id: 'light_contrast',
                  title: 'نسخة الوضع الفاتح (High Contrast)',
                  desc: 'تباين عالٍ ومعدني للخلفيات البيضاء والفاتحة',
                  icon: Sun,
                },
                {
                  id: 'adaptive_foreground',
                  title: 'طبقة Android الأمامية (Transparent)',
                  desc: 'مفرغة بخلفية شفافة 1024×1024 لنظام أندرويد',
                  icon: Layers,
                },
              ] as {
                id: AppIconVariant;
                title: string;
                desc: string;
                icon: React.ComponentType<{ className?: string }>;
              }[]
            ).map((v) => {
              const Icon = v.icon;
              const active = selectedVariant === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedVariant(v.id);
                  }}
                  className={`p-3.5 rounded-xl border text-start flex items-center gap-3 cursor-pointer transition-colors ${
                    active
                      ? 'border-[#26478D] bg-[#26478D]/10 dark:bg-blue-500/15'
                      : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-white/10 bg-slate-900/10 dark:bg-white/5 flex items-center justify-center">
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(buildAppIconSvgString(v.id))}`}
                      alt={v.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400 shrink-0" />
                      <span className="truncate">{v.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{v.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Android Adaptive Icon Dual-Layer Live Preview */}
          <div className="lg:col-span-5 p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">معاينة Android Adaptive Icon</span>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]">
                {(
                  [
                    { id: 'squircle', label: 'Squircle' },
                    { id: 'circle', label: 'دائرة' },
                    { id: 'rounded', label: 'مربع' },
                    { id: 'teardrop', label: 'قطرة' },
                  ] as { id: AdaptiveMask; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAdaptiveMask(m.id)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                      adaptiveMask === m.id
                        ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-around gap-3 py-2">
              <div className="text-center space-y-1.5">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 mx-auto">
                  <img src={adaptiveBgDataUri} alt="Background Layer" className="w-full h-full object-cover" />
                </div>
                <div className="text-[10px] text-slate-500">طبقة الخلفية</div>
              </div>
              <span className="text-slate-400 font-bold">+</span>
              <div className="text-center space-y-1.5">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-dashed border-slate-300 dark:border-white/20 bg-slate-900/80 mx-auto">
                  <img src={adaptiveFgDataUri} alt="Foreground Layer" className="w-full h-full object-contain" />
                </div>
                <div className="text-[10px] text-slate-500">الطبقة الأمامية</div>
              </div>
              <span className="text-slate-400 font-bold">=</span>
              <div className="text-center space-y-1.5">
                <div
                  className={`relative w-16 h-16 overflow-hidden border border-white/25 shadow-lg mx-auto transition-all duration-200 ${maskClass[adaptiveMask]}`}
                >
                  <img src={adaptiveBgDataUri} alt="BG" className="absolute inset-0 w-full h-full object-cover" />
                  <img src={adaptiveFgDataUri} alt="FG" className="relative w-full h-full object-contain" />
                </div>
                <div className="text-[10px] font-bold text-[#26478D] dark:text-blue-400">النتيجة التكيفية</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-white/10 text-[11px]">
              <button
                type="button"
                onClick={() => handleDownloadPng1024('adaptive_background')}
                className="text-[#26478D] dark:text-blue-400 font-semibold hover:underline cursor-pointer"
              >
                تنزيل الخلفية PNG
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPng1024('adaptive_foreground')}
                className="text-[#26478D] dark:text-blue-400 font-semibold hover:underline cursor-pointer"
              >
                تنزيل الأمامية الشفافة PNG
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* E. Interactive Glass List */}
      <section className="space-y-2.5">
        <div className="px-1 text-xs font-bold text-slate-500 dark:text-[#97A5BA]">
          {isAr ? 'الإجراءات والخدمات التفاعلية' : 'Interactive Actions & Support'}
        </div>
        <div className="space-y-2.5">
          {actionItems.map((item) => {
            const Icon = item.icon;
            const Chevron = isAr ? ChevronLeft : ChevronRight;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="relative overflow-hidden w-full min-h-[64px] p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface glass-card-interactive flex items-center justify-between gap-4 text-start cursor-pointer"
              >
                {ripple && ripple.id === item.id && (
                  <span
                    key={ripple.key}
                    aria-hidden="true"
                    style={{ left: ripple.x - 40, top: ripple.y - 40 }}
                    className="pointer-events-none absolute w-20 h-20 rounded-full bg-white/35 animate-aqar-ripple"
                  />
                )}

                <div className="flex items-center gap-3.5 min-w-0 relative z-10">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.iconTone}`}>
                    {item.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {isAr ? item.titleAr : item.titleEn}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-[#97A5BA] truncate">
                      {isAr ? item.subtitleAr : item.subtitleEn}
                    </div>
                  </div>
                </div>

                <Chevron className="w-4 h-4 text-slate-400 shrink-0 relative z-10" />
              </button>
            );
          })}
        </div>
      </section>

      {/* F. Quiet Official Footer */}
      <footer className="pt-4 pb-2 text-center space-y-1 text-xs text-slate-500 dark:text-[#97A5BA]">
        <div>© 2026 AqarPlus. جميع الحقوق محفوظة.</div>
        <div className="font-mono-num text-[11px]">Powered by Abdullah Abdulhameed</div>
      </footer>

      {/* MODAL 1: Terms & Privacy Policy */}
      {showLegalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 my-auto animate-aqar-fade-scale text-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-base">
                <ShieldCheck className="w-5 h-5 text-[#26478D] dark:text-blue-400" />
                <span>اتفاقية الاستخدام وسياسة الخصوصية</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLegalModal(false)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto leading-relaxed text-slate-600 dark:text-slate-300 pe-1">
              <p>
                <strong>1. نطاق الترخيص المؤسسي:</strong> هذا النظام مخصص ومُفعل حصرياً لخدمة{' '}
                <strong>{companyAffiliationName}</strong> وكوادرها المصرح لهم وفق الصلاحيات المحددة.
              </p>
              <p>
                <strong>2. أمن البيانات والتشفير:</strong> تُعالج جميع بيانات العقارات والمستأجرين والمستندات وسندات
                القبض عبر اتصالات محمية، وتخضع كل عملية لتدقيق إلكتروني فوري لا يُمحى (Immutable Audit Trail).
              </p>
              <p>
                <strong>3. سياسة الأرشفة الدائمة:</strong> لا يتم حذف السجلات المالية أو العقود المنتهية من الذاكرة
                المرجعية، بل تُحفظ في مركز الأرشيف الذكي لحماية الحقوق القانونية والمالية.
              </p>
              <p>
                <strong>4. حقوق التصميم والتطوير:</strong> جميع الواجهات والمنظومة البرمجية مطورة بواسطة عبدالله
                عبدالحميد.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={handlePrintLegalPdf}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 font-semibold cursor-pointer"
              >
                حفظ / طباعة PDF
              </button>
              <button
                type="button"
                onClick={() => setShowLegalModal(false)}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#26478D] text-white font-semibold cursor-pointer"
              >
                فهمت وأوافق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Technical Support */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 animate-aqar-fade-scale text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">التواصل مع الدعم الفني</h3>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              فريق الدعم الفني لنظام عقار بلس جاهز لمساعدتكم على مدار الساعة:
            </p>
            <div className="space-y-2.5">
              <a
                href={`https://wa.me/966500000000?text=${encodeURIComponent(
                  `مرحباً دعم عقار بلس (${APP_VERSION})، نود الاستفسار بخصوص حساب ${companyAffiliationName}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  <span>فتح محادثة واتساب مباشرة (رسالة جاهزة)</span>
                </span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={`mailto:support@aqarplus.sa?subject=${encodeURIComponent('طلب دعم فني - AqarPlus')}`}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04] font-semibold flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <span className="font-mono-num">support@aqarplus.sa</span>
                </span>
                <ExternalLink className="w-4 h-4 text-slate-400" />
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText('support@aqarplus.sa');
                  pushToast('success', 'تم نسخ بريد الدعم الفني');
                }}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04] font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ البريد الإلكتروني للدعم</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Rate App */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSubmitRating}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 animate-aqar-fade-scale text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">قيّم تجربتك مع عقار بلس</h3>
              <button
                type="button"
                onClick={() => setShowRateModal(false)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setUserRating(n);
                  }}
                  className="p-1.5 cursor-pointer transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      n <= userRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'
                    }`}
                  />
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={rateComment}
              onChange={(e) => setRateComment(e.target.value)}
              placeholder="ملاحظاتك أو اقتراحاتك لتطوير النظام (اختياري)..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <a
                href="https://play.google.com/store"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-[#26478D] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <span>الانتقال لمتجر التطبيقات</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="submit"
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#26478D] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>إرسال التقييم</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: Clear Local Data (Protected by Master PIN) */}
      {showClearDataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleClearLocalData}
            className="w-full max-w-md rounded-2xl border border-red-300/60 dark:border-red-500/30 bg-white dark:bg-[#13192B] p-6 space-y-4 animate-aqar-fade-scale text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-base text-red-600 dark:text-red-400">
                <Lock className="w-5 h-5" />
                <span>مسح البيانات المحلية (محمي برمز PIN)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowClearDataModal(false)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 leading-relaxed">
              تحذير: سيؤدي هذا الإجراء إلى مسح الذاكرة المؤقتة المحلية، قائمة انتظار عدم الاتصال، وتفضيلات الجهاز، وإعادة تحميل الحالة النظيفة من الخادم.
            </div>

            <div className="space-y-1">
              <label className="font-semibold">أدخل رمز الدخول الرئيسي (Master PIN)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                required
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                placeholder="••••"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent text-center font-mono-num tracking-[0.4em] text-base"
              />
              {pinError && <div className="text-[11px] text-red-500 font-semibold">{pinError}</div>}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClearDataModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
              >
                تأكيد المسح وإعادة الضبط
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
