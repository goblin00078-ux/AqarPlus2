import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Bell,
  Building,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudCog,
  Code2,
  Coins,
  DatabaseBackup,
  Download,
  FileCheck2,
  Fingerprint,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  Landmark,
  Lock,
  LogOut,
  MapPin,
  Palette,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import {
  BankAccountConfig,
  CompanySettings,
  CurrencyCode,
  PropertyOwnershipMode,
} from '../types/aqar';
import { CURRENCY_META, DEFAULT_CURRENCY_RATES_TO_SAR, formatCurrency, formatDateTime } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AboutAppView } from './AboutAppView';
import { PIN_STORAGE_KEY } from './OnboardingJourney';
import { PrintViewButton } from './PrintViewButton';
import { BottomSheetSelect, GlassToggle, RippleButton } from './SettingsUiPrimitives';

type SettingsSectionId =
  | 'hub'
  | 'company'
  | 'general'
  | 'security'
  | 'notifications'
  | 'print'
  | 'backup'
  | 'sync'
  | 'advanced'
  | 'about';

interface SectionCardMeta {
  id: Exclude<SettingsSectionId, 'hub' | 'about'>;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
}

const SETTINGS_SECTIONS: SectionCardMeta[] = [
  {
    id: 'company',
    titleAr: 'إعدادات الشركة والهوية',
    titleEn: 'Company & Branding',
    descAr: 'البيانات الأساسية، الشعار، الحسابات البنكية، وتخصيص الإيصالات',
    descEn: 'Company profile, logo, bank accounts, multi-company & receipts',
    keywords: 'شركة هوية شعار سجل تجاري رقم ضريبي بنك آيبان إيصال خريطة',
    icon: Building2,
    iconColorClass: 'bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400',
  },
  {
    id: 'general',
    titleAr: 'إعدادات التطبيق العامة',
    titleEn: 'General Preferences',
    descAr: 'اللغة، العملة، التقويم، تنسيق الأرقام، والوضع الليلي',
    descEn: 'Language, RTL, currency rates, calendar, numerals & theme',
    keywords: 'لغة عربي إنجليزي عملة ريال تقويم هجري ميلادي وضع ليلي منطقة زمنية',
    icon: Sliders,
    iconColorClass: 'bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400',
  },
  {
    id: 'security',
    titleAr: 'إعدادات الأمان والخصوصية',
    titleEn: 'Security & Privacy',
    descAr: 'قفل التطبيق، البصمة، القفل التلقائي، وسجل الأجهزة والدخول',
    descEn: 'PIN/Biometrics/Pattern, auto-lock, sensitive gates & login audit',
    keywords: 'أمان خصوصية رمز PIN بصمة وجه نمط قفل تلقائي سجل دخول أجهزة',
    icon: ShieldCheck,
    iconColorClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'notifications',
    titleAr: 'إعدادات الإشعارات والتنبيهات',
    titleEn: 'Notifications',
    descAr: 'تنبيهات الاستحقاق، ساعات العمل، ورسائل واتساب التلقائية',
    descEn: 'In-app alerts, push DND hours & automated WhatsApp templates',
    keywords: 'إشعارات تنبيهات استحقاق واتساب ساعات عمل عدم إزعاج صيانة مهام',
    icon: Bell,
    iconColorClass: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  },
  {
    id: 'print',
    titleAr: 'إعدادات الطباعة والمشاركة',
    titleEn: 'Print & Share',
    descAr: 'اكتشاف الطابعات، الطابعة الافتراضية، حجم الورق وقناة المشاركة',
    descEn: 'Bluetooth/USB/Network printers, paper size & default share',
    keywords: 'طباعة طابعة بلوتوث شبكة A4 A5 حراري 80mm 58mm مشاركة PDF',
    icon: Printer,
    iconColorClass: 'bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400',
  },
  {
    id: 'backup',
    titleAr: 'إعدادات النسخ الاحتياطي',
    titleEn: 'Backup & Recovery',
    descAr: 'النسخ التلقائي، التشفير، مسار الحفظ، ومعاينة الاستعادة',
    descEn: 'Scheduled backup, encryption, storage path & restore preview',
    keywords: 'نسخ احتياطي استعادة تشفير سحابة NAS مجلد يومي أسبوعي',
    icon: DatabaseBackup,
    iconColorClass: 'bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400',
  },
  {
    id: 'sync',
    titleAr: 'إعدادات المزامنة والشبكة',
    titleEn: 'Sync Settings',
    descAr: 'وضع الخادم الخاص أو LAN، سلوك Wi-Fi، ومعالجة التعارضات',
    descEn: 'Local/Server/LAN sync mode, Wi-Fi policy & conflict resolution',
    keywords: 'مزامنة خادم محلي LAN تعارضات واي فاي IP منفذ بروتوكول',
    icon: CloudCog,
    iconColorClass: 'bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400',
  },
  {
    id: 'advanced',
    titleAr: 'الإعدادات المتقدمة والمطور',
    titleEn: 'Advanced & Developer',
    descAr: 'وضع المطور، إدارة التخزين، تنظيف الكاش، ومعلومات البنية',
    descEn: 'Developer mode, error logs, storage stats, temp cleanup & system info',
    keywords: 'متقدم مطور سجلات أخطاء تخزين كاش تنظيف إعادة تعيين إصدار',
    icon: Code2,
    iconColorClass: 'bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400',
  },
];

interface BackupPreviewData {
  id: string;
  label: string;
  exists: boolean;
  propertiesCount: number;
  unitsCount: number;
  tenantsCount: number;
  contractsCount: number;
  paymentsCount: number;
  templatesCount: number;
  lastUpdatedAt?: string;
}

export function SettingsCenterView({ initialSection = 'hub' }: { initialSection?: SettingsSectionId }) {
  const {
    state,
    lang,
    theme,
    toggleTheme,
    hasPermission,
    mutate,
    pushToast,
    baseCurrency,
    setBaseCurrency,
    convertToBase,
    openOnboarding,
    setLang,
  } = useAqar();

  const isAr = lang === 'ar';
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [searchQuery, setSearchQuery] = useState('');

  // Company & Multi-Company State
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    nameAr: '',
    nameEn: '',
    crNumber: '',
    vatNumber: '',
    city: 'الرياض',
    address: '',
    phone: '',
    email: '',
    bankName: 'مصرف الراجحي',
    iban: '',
    receiptFooterAr: 'سند قبض رسمي صادر عبر نظام AqarPlus',
  });
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Full Settings Draft synced with state.settings
  const [draft, setDraft] = useState<CompanySettings>(() => ({
    ...(state?.settings || ({} as CompanySettings)),
    currencyRatesToSar: {
      ...DEFAULT_CURRENCY_RATES_TO_SAR,
      ...(state?.settings.currencyRatesToSar || {}),
    },
    bankAccounts: state?.settings.bankAccounts || [],
    receiptBranding: state?.settings.receiptBranding || {
      layout: 'portrait',
      showLogo: true,
      showVat: true,
      showQr: true,
      showSignature: true,
      showWatermark: true,
      accentColor: '#26478D',
    },
    generalPrefs: state?.settings.generalPrefs || {
      language: lang,
      rtlAuto: true,
      currency: baseCurrency,
      calendar: 'both',
      dateFormat: 'DD/MM/YYYY',
      numeralFormat: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
      themeMode: theme,
    },
    securityCenter: state?.settings.securityCenter || {
      lockMethod: 'pin',
      patternCode: '1-4-7-8-9',
      autoLockTiming: '5m',
      requirePinBeforeDeleteReceipt: true,
      requirePinBeforeCancelPayment: true,
      requirePinBeforeEditContract: true,
      requirePinBeforeExportData: false,
    },
    notificationsCenter: state?.settings.notificationsCenter || {
      inApp: {
        rentDueBefore: true,
        rentDueDay: true,
        rentDueAfter: true,
        contractExpiry: true,
        maintenanceTickets: true,
        assignedTasks: true,
        syncUpdates: true,
      },
      push: {
        rentDue: true,
        contractExpiry: true,
        maintenance: true,
        tasks: true,
        sync: false,
      },
      workHoursEnabled: true,
      workHoursStart: '08:00',
      workHoursEnd: '20:00',
      whatsappAutoEnabled: true,
      whatsappDefaultTemplates: {},
    },
    printShare: state?.settings.printShare || {
      discoveredPrinters: [],
      defaultPrinters: {},
      paperSize: 'A4',
      printQuality: 'high',
      defaultShareChannel: 'whatsapp',
    },
    backupPolicy: state?.settings.backupPolicy || {
      frequency: 'daily',
      scheduledTime: '02:00',
      storageTarget: 'nas',
      customPath: '',
      encryptBackups: true,
    },
    syncCenter: state?.settings.syncCenter || {
      mode: 'private_server',
      serverHost: '192.168.10.10',
      serverPort: 3000,
      protocol: 'wss',
      behavior: 'auto',
      conflictResolution: 'latest_wins',
    },
  }));

  // Sub-modals & interactive states
  const [newBankModal, setNewBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: '', iban: '', accountHolder: '', showOnReceipts: true });

  const [pinDraft, setPinDraft] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem(PIN_STORAGE_KEY) || '1234' : '1234')
  );
  const [patternSequence, setPatternSequence] = useState<number[]>(() =>
    (draft.securityCenter?.patternCode || '1-4-7-8-9').split('-').map(Number).filter(Boolean)
  );

  const [scanningPrinters, setScanningPrinters] = useState(false);
  const [customPrinterName, setCustomPrinterName] = useState('');
  const [customPrinterAddress, setCustomPrinterAddress] = useState('');

  const [backupEncryptPassword, setBackupEncryptPassword] = useState('');
  const [backupPreview, setBackupPreview] = useState<BackupPreviewData | null>(null);

  const [devModeEnabled, setDevModeEnabled] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem('aqarplus_developer_mode_v1') === '1'
  );

  const ownershipBreakdown = useMemo(() => {
    if (!state) return [];
    const modes: PropertyOwnershipMode[] = ['مملوك للشركة', 'إدارة للغير', 'ملكية مشتركة'];
    return modes.map((mode) => {
      const props = state.properties.filter((p) => (p.ownershipMode || 'إدارة للغير') === mode);
      const propIds = new Set(props.map((p) => p.id));
      let collected = 0;
      let companyCommission = 0;
      let ownerShareNet = 0;
      let propertyExpenses = 0;

      for (const prop of props) {
        const propCollected = state.payments
          .filter((p) => p.propertyId === prop.id && p.status === 'معتمد')
          .reduce((s, p) => s + convertToBase(p.amount, p.currency || 'SAR'), 0);
        const propExp = state.expenses
          .filter((e) => e.propertyId === prop.id && e.approvalStatus === 'معتمد')
          .reduce((s, e) => s + convertToBase(e.amount, e.currency || 'SAR'), 0);
        const fee = mode === 'مملوك للشركة' ? 0 : propCollected * (prop.managementFeePercent / 100);
        const ownerRevenue = mode === 'مملوك للشركة' ? 0 : Math.max(0, propCollected - fee - propExp);
        collected += propCollected;
        companyCommission += mode === 'مملوك للشركة' ? propCollected : fee;
        ownerShareNet += ownerRevenue;
        propertyExpenses += propExp;
      }

      return {
        mode,
        propertiesCount: props.length,
        unitsCount: state.units.filter((u) => propIds.has(u.propertyId)).length,
        collected: Math.round(collected * 100) / 100,
        companyRevenue: Math.round(companyCommission * 100) / 100,
        ownerShareNet: Math.round(ownerShareNet * 100) / 100,
        propertyExpenses: Math.round(propertyExpenses * 100) / 100,
      };
    });
  }, [state, convertToBase]);

  const storageMetrics = useMemo(() => {
    if (!state) return { dbKb: 0, attachmentsKb: 0, tempKb: 0, totalMb: '0.00' };
    const dbKb = Math.max(24, Math.round(new Blob([JSON.stringify(state)]).size / 1024));
    const attachmentsKb = state.documents.reduce((s, d) => s + (d.fileSizeKb || 120), 0);
    const tempKb = state.settings.developerCenter?.tempCacheSizeKb ?? 0;
    const totalMb = ((dbKb + attachmentsKb + tempKb) / 1024).toFixed(2);
    return { dbKb, attachmentsKb, tempKb, totalMb };
  }, [state]);

  if (!state) return null;

  const companies = state.companies || [];
  const filteredSections = SETTINGS_SECTIONS.filter((sec) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      sec.titleAr.toLowerCase().includes(q) ||
      sec.titleEn.toLowerCase().includes(q) ||
      sec.descAr.toLowerCase().includes(q) ||
      sec.keywords.toLowerCase().includes(q)
    );
  });

  // Validation helpers
  const crValid = /^\d{10}$/.test((draft.crNumber || '').trim());
  const vatValid = /^3\d{13}3$/.test((draft.vatNumber || '').trim());
  const ibanClean = (val: string) => val.replace(/\s+/g, '').toUpperCase();
  const isIbanValid = (val: string) => /^SA\d{22}$/.test(ibanClean(val)) || /^[A-Z]{2}\d{14,30}$/.test(ibanClean(val));

  const savePartialSettings = async (patch: Partial<CompanySettings>, toastText: string) => {
    triggerHaptic('medium');
    const res = await mutate('PATCH', '/api/settings', patch, {
      offlineDescAr: toastText,
    });
    if (res) {
      triggerHaptic('success');
      pushToast('success', toastText);
    }
  };

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraft((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
        pushToast('info', isAr ? 'تم تحميل الشعار للمعاينة — اضغط حفظ لتثبيته' : 'Logo loaded for preview');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedIban = ibanClean(bankForm.iban);
    if (!bankForm.bankName.trim() || !isIbanValid(cleanedIban)) {
      pushToast('error', isAr ? 'يرجى إدخال اسم البنك ورقم IBAN صحيح (مثال: SA + 22 رقم)' : 'Invalid IBAN');
      return;
    }
    const nextAccount: BankAccountConfig = {
      id: `bnk-${Date.now()}`,
      bankName: bankForm.bankName.trim(),
      iban: cleanedIban,
      accountHolder: bankForm.accountHolder.trim() || draft.nameAr,
      isDefault: (draft.bankAccounts || []).length === 0,
      showOnReceipts: bankForm.showOnReceipts,
    };
    const nextList = [...(draft.bankAccounts || []), nextAccount];
    setDraft((prev) => ({ ...prev, bankAccounts: nextList }));
    setNewBankModal(false);
    setBankForm({ bankName: '', iban: '', accountHolder: '', showOnReceipts: true });
    await savePartialSettings({ bankAccounts: nextList }, isAr ? 'تمت إضافة الحساب البنكي بنجاح' : 'Bank account added');
  };

  const handleSetDefaultBank = async (bankId: string) => {
    const nextList = (draft.bankAccounts || []).map((b) => ({ ...b, isDefault: b.id === bankId }));
    setDraft((prev) => ({ ...prev, bankAccounts: nextList }));
    await savePartialSettings({ bankAccounts: nextList }, isAr ? 'تم تعيين الحساب البنكي الافتراضي للتحصيل' : 'Default bank updated');
  };

  const handleToggleBankVisibility = async (bankId: string) => {
    const nextList = (draft.bankAccounts || []).map((b) =>
      b.id === bankId ? { ...b, showOnReceipts: !b.showOnReceipts } : b
    );
    setDraft((prev) => ({ ...prev, bankAccounts: nextList }));
    await savePartialSettings({ bankAccounts: nextList }, isAr ? 'تم تحديث ظهور الحساب في الإيصالات' : 'Receipt visibility updated');
  };

  const handleRemoveBank = async (bankId: string) => {
    const nextList = (draft.bankAccounts || []).filter((b) => b.id !== bankId);
    setDraft((prev) => ({ ...prev, bankAccounts: nextList }));
    await savePartialSettings({ bankAccounts: nextList }, isAr ? 'تم حذف الحساب البنكي' : 'Bank account removed');
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutate('POST', '/api/companies', companyForm, {
      offlineDescAr: `إضافة شركة ${companyForm.nameAr}`,
    });
    if (res) {
      pushToast('success', isAr ? 'تمت إضافة الشركة وفصل حساباتها بنجاح' : 'Company added');
      setShowAddCompany(false);
      setCompanyForm({
        nameAr: '',
        nameEn: '',
        crNumber: '',
        vatNumber: '',
        city: 'الرياض',
        address: '',
        phone: '',
        email: '',
        bankName: 'مصرف الراجحي',
        iban: '',
        receiptFooterAr: 'سند قبض رسمي صادر عبر نظام AqarPlus',
      });
    }
  };

  const handleScanPrinters = () => {
    triggerHaptic('medium');
    setScanningPrinters(true);
    setTimeout(() => {
      setScanningPrinters(false);
      const discovered = draft.printShare?.discoveredPrinters || [];
      if (!discovered.some((p) => p.id === 'prt-bt-new')) {
        const nextPrinters = [
          ...discovered,
          { id: 'prt-bt-new', name: 'Star mC-Print3 · طابعة بلوتوث قريبة', connection: 'Bluetooth' as const, address: 'BT-88:4A:EA:11:02:9F' },
        ];
        setDraft((prev) => ({
          ...prev,
          printShare: { ...(prev.printShare || state.settings.printShare!), discoveredPrinters: nextPrinters },
        }));
      }
      pushToast('success', isAr ? 'تم فحص الطابعات القريبة عبر Bluetooth / USB / Network' : 'Printers scanned');
    }, 950);
  };

  const handleAddCustomPrinter = async () => {
    if (!customPrinterName.trim() || !customPrinterAddress.trim()) return;
    const nextPrinters = [
      ...(draft.printShare?.discoveredPrinters || []),
      {
        id: `prt-${Date.now()}`,
        name: customPrinterName.trim(),
        connection: 'Network' as const,
        address: customPrinterAddress.trim(),
      },
    ];
    const nextPrintShare = { ...(draft.printShare || state.settings.printShare!), discoveredPrinters: nextPrinters };
    setDraft((prev) => ({ ...prev, printShare: nextPrintShare }));
    setCustomPrinterName('');
    setCustomPrinterAddress('');
    await savePartialSettings({ printShare: nextPrintShare }, isAr ? 'تمت إضافة الطابعة الشبكية وحفظها' : 'Network printer added');
  };

  const handlePreviewBackup = async (backupId: string, label: string) => {
    triggerHaptic('light');
    try {
      const res = await fetch(`/api/backups/${backupId}/preview`);
      const data = await res.json();
      setBackupPreview({ ...data, label });
    } catch {
      pushToast('error', isAr ? 'تعذر معاينة النسخة الاحتياطية' : 'Backup preview failed');
    }
  };

  const handleConfirmRestoreBackup = async () => {
    if (!backupPreview) return;
    triggerHaptic('warning');
    const res = await mutate('POST', `/api/backups/${backupPreview.id}/restore`);
    if (res) {
      triggerHaptic('success');
      pushToast('success', isAr ? 'تمت استعادة النسخة الاحتياطية بنجاح' : 'Backup restored');
      setBackupPreview(null);
    }
  };

  const handleLogoutOtherDevices = async () => {
    triggerHaptic('warning');
    const res = await mutate<{ terminatedCount?: number }>('POST', '/api/security/logout-others', {});
    if (res) {
      pushToast('success', isAr ? `تم إنهاء الجلسات على الأجهزة الأخرى (${res.terminatedCount ?? 0})` : 'Logged out other devices');
    }
  };

  const handleClearTempFiles = async () => {
    triggerHaptic('medium');
    const res = await mutate('POST', '/api/system/clear-temp', {});
    if (res) {
      pushToast('success', isAr ? 'تم تنظيف الملفات المؤقتة وتحرير المساحة بنجاح' : 'Temp cache cleared');
    }
  };

  const handleExportTestJson = () => {
    triggerHaptic('light');
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aqarplus-system-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('success', isAr ? 'تم تصدير لقطة البيانات الكاملة JSON' : 'Snapshot exported');
  };

  // About App embedded inside Settings ONLY (never in sidebar/taskbar)
  if (activeSection === 'about') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setActiveSection('hub');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span>{isAr ? 'العودة إلى مركز الإعدادات' : 'Back to Settings Center'}</span>
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'الإعدادات · حول التطبيق' : 'Settings · About App'}
          </span>
        </div>
        <AboutAppView />
      </div>
    );
  }

  const activeSectionMeta = SETTINGS_SECTIONS.find((s) => s.id === activeSection);
  const ChevronNav = isAr ? ChevronLeft : ChevronRight;
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const SectionSubHeader = ({ onSave }: { onSave?: () => void }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-white/10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveSection('hub');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
        >
          <BackArrow className="w-4 h-4" />
          <span>{isAr ? 'مركز الإعدادات' : 'Settings Hub'}</span>
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {isAr ? activeSectionMeta?.titleAr : activeSectionMeta?.titleEn}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isAr ? activeSectionMeta?.descAr : activeSectionMeta?.descEn}
          </p>
        </div>
      </div>
      {onSave && (
        <RippleButton onClick={onSave}>
          <Save className="w-3.5 h-3.5" />
          <span>{isAr ? 'حفظ التغييرات' : 'Save Changes'}</span>
        </RippleButton>
      )}
    </div>
  );

  // HUB SCREEN: Unified with LayoutShell canvas + glass-surface cards + About App inside Settings ONLY
  if (activeSection === 'hub') {
    return (
      <div className="space-y-6">
        {/* Header & Search */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? 'مركز إعدادات التطبيق' : 'Application Settings Center'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'لوحة التحكم الشاملة لتخصيص هوية الشركة، الأمان، الإشعارات، الطباعة، النسخ الاحتياطي، والمزامنة.'
                : 'Configure company branding, preferences, security, notifications, print, backup, and sync.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openOnboarding('company', false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
              <span>{isAr ? 'معالج الإعداد الأولي' : 'Setup Wizard'}</span>
            </button>
            <PrintViewButton />
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'ابحث في الإعدادات: الشعار، الآيبان، PIN، البصمة، واتساب، الطابعات، النسخ الاحتياطي...' : 'Search settings...'}
            className="w-full min-h-[44px] ps-10 pe-9 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/10 glass-surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#26478D]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 8 Vertical Glass Cards */}
        <div className="space-y-3">
          {filteredSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveSection(sec.id);
                }}
                className="w-full p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface glass-card-interactive hover:border-[#26478D]/50 flex items-center justify-between gap-4 text-start cursor-pointer group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${sec.iconColorClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {isAr ? sec.titleAr : sec.titleEn}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {isAr ? sec.descAr : sec.descEn}
                    </div>
                  </div>
                </div>
                <ChevronNav className="w-4 h-4 text-slate-400 group-hover:text-[#26478D] dark:group-hover:text-blue-400 transition-colors shrink-0" />
              </button>
            );
          })}

          {/* About App Card — STRICTLY inside Settings Center only */}
          {(!searchQuery.trim() || 'حول التطبيق أيقونة الإصدار المطور عبدالله'.includes(searchQuery.trim().toLowerCase())) && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveSection('about');
              }}
              className="w-full p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface glass-card-interactive hover:border-[#26478D]/50 flex items-center justify-between gap-4 text-start cursor-pointer group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#26478D] to-[#0A0E1A] border border-white/15 flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                  <img
                    src="/assets/aistudio/Aqar_plus_8de53ba4.svg"
                    alt="AqarPlus"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {isAr ? 'حول التطبيق وأيقونة النظام' : 'About AqarPlus & App Icon'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isAr
                      ? 'الإصدار 1.0.0 · استوديو الأيقونة (1024×1024) · صانع التطبيق والوثائق القانونية'
                      : 'Version 1.0.0 · 1024×1024 Icon Kit · Creator & Legal'}
                  </div>
                </div>
              </div>
              <ChevronNav className="w-4 h-4 text-slate-400 group-hover:text-[#26478D] dark:group-hover:text-blue-400 transition-colors shrink-0" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECTION 1: COMPANY & BRANDING */}
      {activeSection === 'company' && (
        <>
          <SectionSubHeader
            onSave={() =>
              savePartialSettings(
                {
                  nameAr: draft.nameAr,
                  nameEn: draft.nameEn,
                  logoDataUrl: draft.logoDataUrl,
                  crNumber: draft.crNumber,
                  vatNumber: draft.vatNumber,
                  city: draft.city,
                  address: draft.address,
                  mapLat: draft.mapLat,
                  mapLng: draft.mapLng,
                  phone: draft.phone,
                  whatsapp: draft.whatsapp,
                  email: draft.email,
                  receiptBranding: draft.receiptBranding,
                  ejarApiMode: draft.ejarApiMode,
                  zatcaPhase: draft.zatcaPhase,
                },
                isAr ? 'تم حفظ بيانات الشركة والهوية وتخصيص الإيصالات' : 'Company & branding saved'
              )
            }
          />

          {/* Basic Info & Logo Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold">شعار الشركة ومعاينة الهوية</h3>
              <div className="flex flex-col items-center gap-3 p-5 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/80 dark:bg-white/[0.03]">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#26478D] to-[#0A0E1A] flex items-center justify-center overflow-hidden border border-white/15 shadow-lg">
                  <img
                    src={draft.logoDataUrl || '/assets/aistudio/Aqar_plus_8de53ba4.svg'}
                    alt="Company Logo"
                    referrerPolicy="no-referrer"
                    className={`w-full h-full ${draft.logoDataUrl ? 'object-cover' : 'object-contain p-3'}`}
                  />
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold">{draft.nameAr || 'شركة الجنيدل العقارية'}</div>
                  <div className="text-[11px] text-slate-500">{draft.nameEn}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#26478D] text-white cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع شعار جديد</span>
                  </button>
                  {draft.logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, logoDataUrl: undefined }))}
                      className="px-2.5 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-white/10 cursor-pointer"
                    >
                      استعادة الرسمي
                    </button>
                  )}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">صيغة السجل التجاري (10 أرقام)</span>
                  <span className={`font-semibold ${crValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}>
                    {crValid ? 'صحيح ✓' : 'تأكد من 10 أرقام'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">صيغة الرقم الضريبي (15 رقم)</span>
                  <span className={`font-semibold ${vatValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}>
                    {vatValid ? 'مطابق ZATCA ✓' : 'يبدأ وينتهي بـ 3'}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold">البيانات الأساسية والعنوان والتواصل</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">اسم الشركة بالعربية</label>
                  <input
                    value={draft.nameAr || ''}
                    onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Company Name (English)</label>
                  <input
                    dir="ltr"
                    value={draft.nameEn || ''}
                    onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">رقم السجل التجاري</label>
                  <input
                    value={draft.crNumber || ''}
                    onChange={(e) => setDraft({ ...draft, crNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">الرقم الضريبي (ZATCA)</label>
                  <input
                    value={draft.vatNumber || ''}
                    onChange={(e) => setDraft({ ...draft, vatNumber: e.target.value.replace(/\D/g, '').slice(0, 15) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">الهاتف الرسمي</label>
                  <input
                    value={draft.phone || ''}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">رقم الواتساب التجاري</label>
                  <input
                    value={draft.whatsapp || ''}
                    onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
                    placeholder="966505123400"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">البريد الإلكتروني</label>
                  <input
                    dir="ltr"
                    value={draft.email || ''}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">المدينة</label>
                  <input
                    value={draft.city || ''}
                    onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] text-slate-500 block mb-1">العنوان الكامل</label>
                  <input
                    value={draft.address || ''}
                    onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">خط العرض (Latitude)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={draft.mapLat ?? 24.7136}
                    onChange={(e) => setDraft({ ...draft, mapLat: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">خط الطول (Longitude)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      value={draft.mapLng ?? 46.6753}
                      onChange={(e) => setDraft({ ...draft, mapLng: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                    />
                    <a
                      href={`https://maps.google.com/?q=${draft.mapLat ?? 24.7136},${draft.mapLng ?? 46.6753}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 shrink-0"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
                      <span>الخريطة</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bank Accounts Section */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <h3 className="text-sm font-bold">الحسابات البنكية للتحصيل</h3>
              </div>
              <RippleButton className="!py-2 !px-3.5" onClick={() => setNewBankModal(true)}>
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة حساب بنكي</span>
              </RippleButton>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(draft.bankAccounts || []).map((bank) => (
                <div
                  key={bank.id}
                  className={`p-4 rounded-xl border space-y-2 ${
                    bank.isDefault
                      ? 'border-[#26478D] bg-[#26478D]/5 dark:bg-[#26478D]/15'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        <span>{bank.bankName}</span>
                        {bank.isDefault && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">· الافتراضي للتحصيل</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{bank.accountHolder}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBank(bank.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="font-mono-num text-xs bg-slate-100 dark:bg-white/[0.05] px-3 py-1.5 rounded-lg" dir="ltr">
                    {bank.iban}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    {!bank.isDefault ? (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultBank(bank.id)}
                        className="text-[11px] font-semibold text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        تعيين كحساب افتراضي
                      </button>
                    ) : (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">مستخدم في قوالب التحصيل</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleBankVisibility(bank.id)}
                      className="text-[11px] text-slate-600 dark:text-slate-300 underline cursor-pointer"
                    >
                      {bank.showOnReceipts ? 'ظاهر في الإيصالات' : 'مخفي من الإيصالات'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Receipt Customization + Live Mini Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <h3 className="text-sm font-bold">تخصيص قالب وألوان الإيصالات</h3>
              </div>

              <BottomSheetSelect
                label="تخطيط قالب الإيصال"
                value={draft.receiptBranding?.layout || 'portrait'}
                options={[
                  { value: 'portrait', label: 'قالب رأسي (Portrait A4 / حراري)', sublabel: 'مناسب لسندات القبض الكاملة والطباعة الحرارية' },
                  { value: 'landscape', label: 'قالب أفقي (Landscape)', sublabel: 'مناسب لسندات التسليم المزدوجة في المكتب' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    receiptBranding: { ...(prev.receiptBranding || state.settings.receiptBranding!), layout: val },
                  }))
                }
              />

              <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                {(
                  [
                    ['showLogo', 'إظهار شعار الشركة في ترويسة الإيصال'],
                    ['showVat', 'إظهار الرقم الضريبي (ZATCA)'],
                    ['showQr', 'تضمين رمز التحقق السريع QR Code'],
                    ['showSignature', 'إظهار خانة التوقيع والاعتماد الإلكتروني'],
                    ['showWatermark', 'إظهار الختم المائي لحالة السند'],
                  ] as const
                ).map(([key, lbl]) => (
                  <GlassToggle
                    key={key}
                    checked={Boolean(draft.receiptBranding?.[key])}
                    onChange={(next) =>
                      setDraft((prev) => ({
                        ...prev,
                        receiptBranding: { ...(prev.receiptBranding || state.settings.receiptBranding!), [key]: next },
                      }))
                    }
                    label={lbl}
                  />
                ))}
              </div>

              <div className="pt-2">
                <div className="text-[11px] text-slate-500 mb-2">لون هوية الإيصالات:</div>
                <div className="flex items-center gap-2.5">
                  {['#26478D', '#0F766E', '#1D4ED8', '#B45309', '#111827'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          receiptBranding: { ...(prev.receiptBranding || state.settings.receiptBranding!), accentColor: hex },
                        }))
                      }
                      style={{ backgroundColor: hex }}
                      className={`w-8 h-8 rounded-xl border-2 cursor-pointer transition-transform ${
                        draft.receiptBranding?.accentColor === hex ? 'border-white ring-2 ring-[#26478D] scale-110' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
              <div className="text-xs font-bold text-slate-500">معاينة فورية للإيصال</div>
              <div
                className={`p-4 rounded-xl bg-white text-slate-900 border border-slate-200 shadow-sm space-y-3 relative overflow-hidden ${
                  draft.receiptBranding?.layout === 'landscape' ? 'aspect-[16/10]' : ''
                }`}
              >
                {draft.receiptBranding?.showWatermark && (
                  <div className="text-[10px] font-bold tracking-widest text-emerald-600/20 absolute end-3 bottom-3 -rotate-12 pointer-events-none">
                    سند معتمد
                  </div>
                )}
                <div
                  style={{ borderBottomColor: draft.receiptBranding?.accentColor || '#26478D' }}
                  className="flex items-center justify-between pb-2.5 border-b-2"
                >
                  <div className="flex items-center gap-2">
                    {draft.receiptBranding?.showLogo && (
                      <div className="w-8 h-8 rounded-lg bg-[#0A0E1A] flex items-center justify-center overflow-hidden p-1">
                        <img
                          src={draft.logoDataUrl || '/assets/aistudio/Aqar_plus_8de53ba4.svg'}
                          alt="Logo"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold">{draft.nameAr}</div>
                      {draft.receiptBranding?.showVat && (
                        <div className="text-[10px] text-slate-500 font-mono-num">الضريبي: {draft.vatNumber}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ color: draft.receiptBranding?.accentColor || '#26478D' }} className="text-xs font-bold">
                    سند قبض
                  </div>
                </div>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">المبلغ:</span>
                    <span className="font-bold font-mono-num">9,000 ر.س</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">رقم السند:</span>
                    <span className="font-mono-num">AQ-2026-001234</span>
                  </div>
                </div>
                <div className="flex items-end justify-between pt-2 border-t border-slate-100">
                  {draft.receiptBranding?.showSignature ? (
                    <div className="text-[10px] text-slate-500">التوقيع المعتمد: ___________</div>
                  ) : (
                    <div />
                  )}
                  {draft.receiptBranding?.showQr && (
                    <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center">
                      <QrCode className="w-6 h-6 text-slate-800" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Company Cards & Ownership Matrix (Preserved) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">الشركات المسجلة وفصل الحسابات</h3>
              {hasPermission('manage_properties') && (
                <RippleButton className="!py-2 !px-3.5" onClick={() => setShowAddCompany(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة شركة جديدة</span>
                </RippleButton>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companies.map((comp) => {
                const compProps = state.properties.filter((p) => p.companyId === comp.id);
                const compIncome = compProps.reduce((sum, prop) => {
                  const pSum = state.payments
                    .filter((pay) => pay.propertyId === prop.id && pay.status === 'معتمد')
                    .reduce((s, pay) => s + convertToBase(pay.amount, pay.currency || 'SAR'), 0);
                  return sum + pSum;
                }, 0);
                return (
                  <div key={comp.id} className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[#26478D]/15 text-[#26478D] dark:text-blue-400 flex items-center justify-center">
                          <Building className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold">{comp.nameAr}</div>
                          <div className="text-[11px] text-slate-500 font-mono-num">
                            سجل: {comp.crNumber} · ضريبي: {comp.vatNumber}
                          </div>
                        </div>
                      </div>
                      <div className="text-end font-mono-num text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(compIncome, baseCurrency, lang)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold">فصل الإيرادات حسب نوع الملكية ({baseCurrency})</span>
              </div>
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4 text-start font-medium">تصنيف الملكية</th>
                    <th className="py-2.5 px-4 text-start font-medium">العقارات / الوحدات</th>
                    <th className="py-2.5 px-4 text-start font-medium">التحصيل</th>
                    <th className="py-2.5 px-4 text-start font-medium">إيراد الشركة</th>
                    <th className="py-2.5 px-4 text-start font-medium">صافي الملاك</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {ownershipBreakdown.map((row) => (
                    <tr key={row.mode}>
                      <td className="py-2.5 px-4 font-bold">{row.mode}</td>
                      <td className="py-2.5 px-4 font-mono-num">
                        {row.propertiesCount} عقار · {row.unitsCount} وحدة
                      </td>
                      <td className="py-2.5 px-4 font-mono-num">{formatCurrency(row.collected, baseCurrency, lang)}</td>
                      <td className="py-2.5 px-4 font-mono-num font-bold text-[#26478D] dark:text-blue-400">
                        {formatCurrency(row.companyRevenue, baseCurrency, lang)}
                      </td>
                      <td className="py-2.5 px-4 font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(row.ownerShareNet, baseCurrency, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SECTION 2: GENERAL PREFERENCES */}
      {activeSection === 'general' && (
        <>
          <SectionSubHeader
            onSave={async () => {
              const gp = draft.generalPrefs!;
              setLang(gp.language);
              setBaseCurrency(gp.currency);
              if (gp.themeMode === 'dark' && theme !== 'dark') toggleTheme();
              if (gp.themeMode === 'light' && theme !== 'light') toggleTheme();
              if (gp.themeMode === 'system' && typeof window !== 'undefined') {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if ((prefersDark && theme !== 'dark') || (!prefersDark && theme !== 'light')) toggleTheme();
              }
              await savePartialSettings(
                {
                  generalPrefs: gp,
                  baseCurrency: gp.currency,
                  currencyRatesToSar: draft.currencyRatesToSar,
                  dateCalendar: gp.calendar === 'gregorian' ? 'ميلادي فقط' : 'هجري وميلادي',
                },
                isAr ? 'تم حفظ التفضيلات العامة وأسعار الصرف بنجاح' : 'General preferences saved'
              );
            }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <span>اللغة والتقويم والأرقام والمظهر</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <BottomSheetSelect
                  label="لغة التطبيق"
                  value={draft.generalPrefs?.language || 'ar'}
                  options={[
                    { value: 'ar', label: 'العربية (الافتراضي)', sublabel: 'واجهة عربية متكاملة RTL' },
                    { value: 'en', label: 'English (قيد التطوير)', sublabel: 'English workspace beta preview' },
                  ]}
                  onChange={(val) =>
                    setDraft((prev) => ({
                      ...prev,
                      generalPrefs: { ...(prev.generalPrefs || state.settings.generalPrefs!), language: val },
                    }))
                  }
                />

                <BottomSheetSelect
                  label="العملة الافتراضية"
                  value={draft.generalPrefs?.currency || baseCurrency}
                  options={(Object.keys(CURRENCY_META) as CurrencyCode[]).map((c) => ({
                    value: c,
                    label: CURRENCY_META[c].labelAr,
                  }))}
                  onChange={(val) =>
                    setDraft((prev) => ({
                      ...prev,
                      baseCurrency: val,
                      generalPrefs: { ...(prev.generalPrefs || state.settings.generalPrefs!), currency: val },
                    }))
                  }
                />

                <BottomSheetSelect
                  label="نظام التقويم"
                  value={draft.generalPrefs?.calendar || 'both'}
                  options={[
                    { value: 'gregorian', label: 'الميلادي (افتراضي)' },
                    { value: 'hijri', label: 'الهجري (أم القرى)' },
                    { value: 'both', label: 'عرض التقويمين معاً (هجري وميلادي)' },
                  ]}
                  onChange={(val) =>
                    setDraft((prev) => ({
                      ...prev,
                      generalPrefs: { ...(prev.generalPrefs || state.settings.generalPrefs!), calendar: val },
                    }))
                  }
                />

                <BottomSheetSelect
                  label="تنسيق التاريخ"
                  value={draft.generalPrefs?.dateFormat || 'DD/MM/YYYY'}
                  options={[
                    { value: 'DD/MM/YYYY', label: 'يوم / شهر / سنة (20/11/2026)' },
                    { value: 'YYYY-MM-DD', label: 'سنة - شهر - يوم (2026-11-20)' },
                  ]}
                  onChange={(val) =>
                    setDraft((prev) => ({
                      ...prev,
                      generalPrefs: { ...(prev.generalPrefs || state.settings.generalPrefs!), dateFormat: val },
                    }))
                  }
                />

                <BottomSheetSelect
                  label="تنسيق الأرقام"
                  value={draft.generalPrefs?.numeralFormat || 'en'}
                  options={[
                    { value: 'en', label: 'أرقام إنجليزية (123)', sublabel: 'موصى به للإيصالات والآيبان' },
                    { value: 'ar', label: 'أرقام عربية هندية (١٢٣)' },
                  ]}
                  onChange={(val) =>
                    setDraft((prev) => ({
                      ...prev,
                      generalPrefs: { ...(prev.generalPrefs || state.settings.generalPrefs!), numeralFormat: val },
                    }))
                  }
                />

                <BottomSheetSelect
                  label="الوضع الليلي والمظهر"
                  value={draft.generalPrefs?.themeMode || theme}
                  options={[
                    { value: 'dark', label: 'الوضع الداكن (Dark Luxury)' },
                    { value: 'light', label: 'الوضع الفاتح (Light)' },
                    { value: 'system', label: 'تلقائي حسب نظام الجهاز' },
                  ]}
                  onChange={(val) =>
                    setDraft((prev) => ({
                      ...prev,
                      generalPrefs: { ...(prev.generalPrefs || state.settings.generalPrefs!), themeMode: val },
                    }))
                  }
                />
              </div>

              <div className="pt-2 border-t border-slate-200/70 dark:border-white/10 space-y-2">
                <GlassToggle
                  checked={Boolean(draft.generalPrefs?.rtlAuto ?? true)}
                  onChange={(next) =>
                    setDraft((prev) => ({
                      ...prev,
                      generalPrefs: { ...(prev.generalPrefs || state.settings.generalPrefs!), rtlAuto: next },
                    }))
                  }
                  label="اتجاه النص التلقائي (RTL)"
                  description="تكييف الواجهة والمحاذاة تلقائياً للغة العربية من اليمين إلى اليسار"
                />
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500">المنطقة الزمنية المكتشفة تلقائياً:</span>
                  <span className="font-mono-num font-semibold" dir="ltr">
                    {draft.generalPrefs?.timezone || 'Asia/Riyadh'}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <span>أسعار الصرف المرجعية (مقابل الريال)</span>
              </h3>
              {(['SAR', 'AED', 'EGP', 'KWD', 'USD'] as CurrencyCode[]).map((code) => (
                <div key={code} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium">{CURRENCY_META[code].labelAr}</span>
                  <input
                    type="number"
                    step="0.001"
                    min={0.001}
                    disabled={code === 'SAR'}
                    value={draft.currencyRatesToSar?.[code] ?? DEFAULT_CURRENCY_RATES_TO_SAR[code]}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        currencyRatesToSar: {
                          ...(prev.currencyRatesToSar || DEFAULT_CURRENCY_RATES_TO_SAR),
                          [code]: Number(e.target.value) || 1,
                        },
                      }))
                    }
                    className="w-28 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num text-end disabled:opacity-50"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* SECTION 3: SECURITY & PRIVACY */}
      {activeSection === 'security' && (
        <>
          <SectionSubHeader
            onSave={() => {
              if (/^\d{4,6}$/.test(pinDraft.trim())) {
                localStorage.setItem(PIN_STORAGE_KEY, pinDraft.trim());
              }
              const nextSec = {
                ...(draft.securityCenter || state.settings.securityCenter!),
                patternCode: patternSequence.join('-') || '1-4-7-8-9',
              };
              savePartialSettings({ securityCenter: nextSec }, isAr ? 'تم حفظ إعدادات الأمان والقفل بنجاح' : 'Security saved');
            }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-emerald-500" />
                <span>طريقة قفل التطبيق والقفل التلقائي</span>
              </h3>

              <BottomSheetSelect
                label="طريقة القفل المعتمدة"
                value={draft.securityCenter?.lockMethod || 'pin'}
                options={[
                  { value: 'pin', label: 'رمز الدخول الرئيسي (PIN 4-6 أرقام)' },
                  { value: 'fingerprint', label: 'البصمة الحيوية (Fingerprint)' },
                  { value: 'face', label: 'التعرف على الوجه (Face ID)' },
                  { value: 'pattern', label: 'النمط التفاعلي (Pattern)' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    securityCenter: { ...(prev.securityCenter || state.settings.securityCenter!), lockMethod: val },
                  }))
                }
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">رمز PIN الرئيسي (4-6 أرقام)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinDraft}
                    onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num tracking-widest"
                  />
                </div>
                <BottomSheetSelect
                  label="القفل التلقائي"
                  value={draft.securityCenter?.autoLockTiming || '5m'}
                  options={[
                    { value: 'immediate', label: 'فور الخروج من التطبيق' },
                    { value: '1m', label: 'بعد 1 دقيقة' },
                    { value: '5m', label: 'بعد 5 دقائق' },
                    { value: '15m', label: 'بعد 15 دقيقة' },
                    { value: '30m', label: 'بعد 30 دقيقة' },
                  ]}
                  onChange={(val) =>
                    setDraft((prev) => ({
                      ...prev,
                      securityCenter: { ...(prev.securityCenter || state.settings.securityCenter!), autoLockTiming: val },
                    }))
                  }
                />
              </div>

              {draft.securityCenter?.lockMethod === 'pattern' && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">تحديد نقاط النمط (Pattern):</span>
                    <button
                      type="button"
                      onClick={() => setPatternSequence([])}
                      className="text-[11px] text-blue-500 hover:underline cursor-pointer"
                    >
                      إعادة رسم
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 max-w-[180px] mx-auto">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => {
                      const idx = patternSequence.indexOf(dot);
                      const active = idx !== -1;
                      return (
                        <button
                          key={dot}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            if (!active) setPatternSequence((prev) => [...prev, dot]);
                          }}
                          className={`w-11 h-11 rounded-full border-2 font-mono-num text-xs font-bold transition-all cursor-pointer ${
                            active
                              ? 'bg-[#26478D] border-blue-400 text-white scale-105'
                              : 'border-slate-300 dark:border-white/20 text-slate-400'
                          }`}
                        >
                          {active ? idx + 1 : '•'}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-center text-[11px] font-mono-num text-slate-500">
                    التسلسل المحفوظ: {patternSequence.join(' → ') || 'اختر 4 نقاط على الأقل'}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200/70 dark:border-white/10 divide-y divide-slate-200/60 dark:divide-white/10">
                <div className="text-xs font-bold pb-2 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span>حماية العمليات الحساسة بطلب PIN إضافي:</span>
                </div>
                {(
                  [
                    ['requirePinBeforeDeleteReceipt', 'طلب PIN قبل حذف/أرشفة إيصال'],
                    ['requirePinBeforeCancelPayment', 'طلب PIN قبل إلغاء أو عكس دفعة'],
                    ['requirePinBeforeEditContract', 'طلب PIN قبل تعديل بنود عقد نشط'],
                    ['requirePinBeforeExportData', 'طلب PIN قبل تصدير البيانات'],
                  ] as const
                ).map(([key, label]) => (
                  <GlassToggle
                    key={key}
                    checked={Boolean(draft.securityCenter?.[key])}
                    onChange={(next) =>
                      setDraft((prev) => ({
                        ...prev,
                        securityCenter: { ...(prev.securityCenter || state.settings.securityCenter!), [key]: next },
                      }))
                    }
                    label={label}
                  />
                ))}
              </div>
            </div>

            {/* Login Audit (last 50) + Logout Other Devices */}
            <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">سجل الدخول (آخر 50 عملية)</h3>
                  <p className="text-[11px] text-slate-500">تتبع الأجهزة، الأوقات، والمواقع الجغرافية</p>
                </div>
                <RippleButton variant="danger" className="!py-2 !px-3" onClick={handleLogoutOtherDevices}>
                  <LogOut className="w-3.5 h-3.5" />
                  <span>تسجيل الخروج من جميع الأجهزة الأخرى</span>
                </RippleButton>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-white/10">
                {(state.loginHistory || []).slice(0, 50).map((entry) => (
                  <div key={entry.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{entry.userName}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {entry.deviceName} · {entry.geoLocation || 'الرياض'}
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="font-mono-num text-[11px]">{formatDateTime(entry.createdAt, lang)}</div>
                      <div className="text-[10px] font-mono-num text-slate-400">{entry.ipAddress}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* SECTION 4: NOTIFICATIONS */}
      {activeSection === 'notifications' && (
        <>
          <SectionSubHeader
            onSave={() =>
              savePartialSettings(
                { notificationsCenter: draft.notificationsCenter },
                isAr ? 'تم حفظ تفضيلات الإشعارات وساعات العمل' : 'Notification settings saved'
              )
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-2">
              <h3 className="text-sm font-bold pb-2 border-b border-slate-200 dark:border-white/10">الإشعارات داخل التطبيق</h3>
              <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                {(
                  [
                    ['rentDueBefore', 'تنبيه استحقاق الإيجار قبل الموعد'],
                    ['rentDueDay', 'تنبيه يوم استحقاق الإيجار'],
                    ['rentDueAfter', 'تنبيه تأخر الإيجار بعد الاستحقاق'],
                    ['contractExpiry', 'تنبيهات انتهاء وتجديد العقود'],
                    ['maintenanceTickets', 'بلاغات الصيانة وتحديثات الفنيين'],
                    ['assignedTasks', 'المهام المسندة والتذكيرات'],
                    ['syncUpdates', 'تحديثات المزامنة المباشرة بين الأجهزة'],
                  ] as const
                ).map(([key, label]) => (
                  <GlassToggle
                    key={key}
                    checked={Boolean(draft.notificationsCenter?.inApp?.[key])}
                    onChange={(next) =>
                      setDraft((prev) => ({
                        ...prev,
                        notificationsCenter: {
                          ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                          inApp: {
                            ...(prev.notificationsCenter?.inApp || state.settings.notificationsCenter!.inApp),
                            [key]: next,
                          },
                        },
                      }))
                    }
                    label={label}
                  />
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <h3 className="text-sm font-bold pb-2 border-b border-slate-200 dark:border-white/10">
                  إشعارات الجهاز (Push) وساعات العمل
                </h3>
                <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                  {(
                    [
                      ['rentDue', 'إشعارات الدفعات والاستحقاقات'],
                      ['contractExpiry', 'إشعارات انتهاء العقود'],
                      ['maintenance', 'بلاغات الصيانة العاجلة'],
                      ['tasks', 'إسناد المهام الفوري'],
                      ['sync', 'تحديثات المزامنة في الخلفية'],
                    ] as const
                  ).map(([key, label]) => (
                    <GlassToggle
                      key={key}
                      checked={Boolean(draft.notificationsCenter?.push?.[key])}
                      onChange={(next) =>
                        setDraft((prev) => ({
                          ...prev,
                          notificationsCenter: {
                            ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                            push: {
                              ...(prev.notificationsCenter?.push || state.settings.notificationsCenter!.push),
                              [key]: next,
                            },
                          },
                        }))
                      }
                      label={label}
                    />
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-200/70 dark:border-white/10 space-y-3">
                  <GlassToggle
                    checked={Boolean(draft.notificationsCenter?.workHoursEnabled)}
                    onChange={(next) =>
                      setDraft((prev) => ({
                        ...prev,
                        notificationsCenter: {
                          ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                          workHoursEnabled: next,
                        },
                      }))
                    }
                    label="تفعيل عدم الإزعاج خارج ساعات العمل"
                  />
                  {draft.notificationsCenter?.workHoursEnabled && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">بداية ساعات العمل</label>
                        <input
                          type="time"
                          value={draft.notificationsCenter.workHoursStart}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              notificationsCenter: {
                                ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                                workHoursStart: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">نهاية ساعات العمل</label>
                        <input
                          type="time"
                          value={draft.notificationsCenter.workHoursEnd}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              notificationsCenter: {
                                ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                                workHoursEnd: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <h3 className="text-sm font-bold">إشعارات الواتساب التلقائية واختيار القوالب</h3>
                <GlassToggle
                  checked={Boolean(draft.notificationsCenter?.whatsappAutoEnabled)}
                  onChange={(next) =>
                    setDraft((prev) => ({
                      ...prev,
                      notificationsCenter: {
                        ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                        whatsappAutoEnabled: next,
                      },
                    }))
                  }
                  label="تفعيل رسائل الواتساب التلقائية"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <BottomSheetSelect
                    label="قالب استحقاق الإيجار"
                    value={draft.notificationsCenter?.whatsappDefaultTemplates?.rentDueId || 'tpl-pay-1'}
                    options={(state.communicationTemplates || []).map((t) => ({ value: t.id, label: t.name }))}
                    onChange={(val) =>
                      setDraft((prev) => ({
                        ...prev,
                        notificationsCenter: {
                          ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                          whatsappDefaultTemplates: {
                            ...(prev.notificationsCenter?.whatsappDefaultTemplates || {}),
                            rentDueId: val,
                          },
                        },
                      }))
                    }
                  />
                  <BottomSheetSelect
                    label="قالب إشعار الاستلام"
                    value={draft.notificationsCenter?.whatsappDefaultTemplates?.receiptId || 'tpl-pay-2'}
                    options={(state.communicationTemplates || []).map((t) => ({ value: t.id, label: t.name }))}
                    onChange={(val) =>
                      setDraft((prev) => ({
                        ...prev,
                        notificationsCenter: {
                          ...(prev.notificationsCenter || state.settings.notificationsCenter!),
                          whatsappDefaultTemplates: {
                            ...(prev.notificationsCenter?.whatsappDefaultTemplates || {}),
                            receiptId: val,
                          },
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SECTION 5: PRINT & SHARE */}
      {activeSection === 'print' && (
        <>
          <SectionSubHeader
            onSave={() =>
              savePartialSettings(
                { printShare: draft.printShare },
                isAr ? 'تم حفظ إعدادات الطباعة والطابعات الافتراضية' : 'Print & share settings saved'
              )
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">الطابعات المكتشفة (Bluetooth / USB / Network)</h3>
                <RippleButton className="!py-2 !px-3.5" onClick={handleScanPrinters} disabled={scanningPrinters}>
                  <ScanSearch className={`w-3.5 h-3.5 ${scanningPrinters ? 'animate-spin' : ''}`} />
                  <span>{scanningPrinters ? 'جاري البحث عن الطابعات...' : 'اكتشاف الطابعات القريبة'}</span>
                </RippleButton>
              </div>

              <div className="space-y-2">
                {(draft.printShare?.discoveredPrinters || []).map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Printer className="w-4 h-4 text-[#26478D] dark:text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {p.connection} · {p.address}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        window.print();
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer shrink-0"
                    >
                      طباعة تجريبية
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 space-y-2">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">إضافة طابعة شبكة يدوياً (IP / Port)</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <input
                    placeholder="اسم الطابعة"
                    value={customPrinterName}
                    onChange={(e) => setCustomPrinterName(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                  <input
                    dir="ltr"
                    placeholder="192.168.10.60:9100"
                    value={customPrinterAddress}
                    onChange={(e) => setCustomPrinterAddress(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                  <RippleButton className="!py-2" onClick={handleAddCustomPrinter}>
                    <Plus className="w-3.5 h-3.5" />
                    <span>ربط الطابعة</span>
                  </RippleButton>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold">الطابعة الافتراضية وجودة الورق والمشاركة</h3>
              <BottomSheetSelect
                label="الطابعة الافتراضية للإيصالات"
                value={draft.printShare?.defaultPrinters?.receipts || ''}
                options={(draft.printShare?.discoveredPrinters || []).map((p) => ({ value: p.id, label: p.name }))}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    printShare: {
                      ...(prev.printShare || state.settings.printShare!),
                      defaultPrinters: { ...(prev.printShare?.defaultPrinters || {}), receipts: val },
                    },
                  }))
                }
              />
              <BottomSheetSelect
                label="الطابعة الافتراضية للتقارير والمستندات"
                value={draft.printShare?.defaultPrinters?.reports || ''}
                options={(draft.printShare?.discoveredPrinters || []).map((p) => ({ value: p.id, label: p.name }))}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    printShare: {
                      ...(prev.printShare || state.settings.printShare!),
                      defaultPrinters: { ...(prev.printShare?.defaultPrinters || {}), reports: val, documents: val },
                    },
                  }))
                }
              />
              <BottomSheetSelect
                label="حجم الورق المعتمد"
                value={draft.printShare?.paperSize || 'A4'}
                options={[
                  { value: 'A4', label: 'A4 قياسي (210 × 297 mm)' },
                  { value: 'A5', label: 'A5 متوسط (148 × 210 mm)' },
                  { value: 'thermal_80', label: 'حراري 80mm (طابعات الإيصالات)' },
                  { value: 'thermal_58', label: 'حراري 58mm (محمول)' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    printShare: { ...(prev.printShare || state.settings.printShare!), paperSize: val },
                  }))
                }
              />
              <BottomSheetSelect
                label="جودة الطباعة"
                value={draft.printShare?.printQuality || 'high'}
                options={[
                  { value: 'draft', label: 'مسودة (سريعة وموفرة للحبر)' },
                  { value: 'normal', label: 'عادية' },
                  { value: 'high', label: 'عالية (للعقود والإيصالات الرسمية)' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    printShare: { ...(prev.printShare || state.settings.printShare!), printQuality: val },
                  }))
                }
              />
              <BottomSheetSelect
                label="قناة المشاركة الافتراضية"
                value={draft.printShare?.defaultShareChannel || 'whatsapp'}
                options={[
                  { value: 'whatsapp', label: 'واتساب (WhatsApp)' },
                  { value: 'email', label: 'البريد الإلكتروني' },
                  { value: 'pdf', label: 'حفظ كملف PDF' },
                  { value: 'native', label: 'مشاركة النظام المباشرة' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    printShare: { ...(prev.printShare || state.settings.printShare!), defaultShareChannel: val },
                  }))
                }
              />
            </div>
          </div>
        </>
      )}

      {/* SECTION 6: BACKUP & RECOVERY */}
      {activeSection === 'backup' && (
        <>
          <SectionSubHeader
            onSave={() =>
              savePartialSettings(
                { backupPolicy: draft.backupPolicy },
                isAr ? 'تم حفظ سياسة النسخ الاحتياطي والتشفير' : 'Backup policy saved'
              )
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold">النسخ التلقائي والتشفير</h3>
              <BottomSheetSelect
                label="تكرار النسخ التلقائي"
                value={draft.backupPolicy?.frequency || 'daily'}
                options={[
                  { value: 'daily', label: 'يومياً (موصى به)' },
                  { value: 'weekly', label: 'أسبوعياً' },
                  { value: 'monthly', label: 'شهرياً' },
                  { value: 'manual', label: 'يدوياً فقط' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    backupPolicy: { ...(prev.backupPolicy || state.settings.backupPolicy!), frequency: val },
                  }))
                }
              />

              <div className="text-xs">
                <label className="text-[11px] text-slate-500 block mb-1">وقت النسخ التلقائي</label>
                <input
                  type="time"
                  value={draft.backupPolicy?.scheduledTime || '02:00'}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      backupPolicy: { ...(prev.backupPolicy || state.settings.backupPolicy!), scheduledTime: e.target.value },
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                />
              </div>

              <BottomSheetSelect
                label="مسار الحفظ المستهدف"
                value={draft.backupPolicy?.storageTarget || 'nas'}
                options={[
                  { value: 'device', label: 'ذاكرة الجهاز المحلية' },
                  { value: 'custom_folder', label: 'مجلد مخصص' },
                  { value: 'nas', label: 'خادم الشركة (NAS)' },
                  { value: 'cloud', label: 'تخزين سحابي خاص (اختياري)' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    backupPolicy: { ...(prev.backupPolicy || state.settings.backupPolicy!), storageTarget: val },
                  }))
                }
              />

              <div className="text-xs">
                <label className="text-[11px] text-slate-500 block mb-1">المسار / المجلد</label>
                <input
                  dir="ltr"
                  value={draft.backupPolicy?.customPath || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      backupPolicy: { ...(prev.backupPolicy || state.settings.backupPolicy!), customPath: e.target.value },
                    }))
                  }
                  placeholder="\\NAS-AQAR\Backups\AqarPlus"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                />
              </div>

              <div className="pt-2 border-t border-slate-200/70 dark:border-white/10 space-y-3">
                <GlassToggle
                  checked={Boolean(draft.backupPolicy?.encryptBackups)}
                  onChange={(next) =>
                    setDraft((prev) => ({
                      ...prev,
                      backupPolicy: { ...(prev.backupPolicy || state.settings.backupPolicy!), encryptBackups: next },
                    }))
                  }
                  label="تفعيل التشفير AES-256 للنسخة"
                />
                {draft.backupPolicy?.encryptBackups && (
                  <div className="text-xs">
                    <label className="text-[11px] text-slate-500 block mb-1">كلمة مرور فك تشفير النسخة</label>
                    <input
                      type="password"
                      value={backupEncryptPassword}
                      onChange={(e) => setBackupEncryptPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">النسخ الاحتياطية المحفوظة والاستعادة</h3>
                  <p className="text-[11px] text-slate-500">معاينة المحتوى قبل التأكيد لضمان عدم فقدان أي بيانات</p>
                </div>
                <RippleButton
                  onClick={async () => {
                    const res = await mutate('POST', '/api/backups', {
                      label: `نسخة احتياطية ${draft.backupPolicy?.encryptBackups ? '(مشفرة) ' : ''}· ${new Date().toLocaleDateString('ar-SA')}`,
                    });
                    if (res) pushToast('success', isAr ? 'تم إنشاء نسخة احتياطية جديدة بنجاح' : 'Backup created');
                  }}
                >
                  <DatabaseBackup className="w-3.5 h-3.5" />
                  <span>إنشاء نسخة فورية</span>
                </RippleButton>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {state.backups.map((b) => (
                  <div key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold">{b.label}</div>
                      <div className="text-[11px] text-slate-500 font-mono-num">
                        {formatDateTime(b.createdAt, lang)} · {b.recordCount} سجل · {b.sizeKb} KB · بواسطة {b.createdBy}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePreviewBackup(b.id, b.label)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                      <span>معاينة واستعادة</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* SECTION 7: SYNC SETTINGS */}
      {activeSection === 'sync' && (
        <>
          <SectionSubHeader
            onSave={() =>
              savePartialSettings(
                { syncCenter: draft.syncCenter },
                isAr ? 'تم حفظ إعدادات المزامنة والشبكة' : 'Sync settings saved'
              )
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Server className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <span>وضع المزامنة والاتصال بالخادم</span>
              </h3>

              <BottomSheetSelect
                label="وضع المزامنة"
                value={draft.syncCenter?.mode || 'private_server'}
                options={[
                  { value: 'local_only', label: 'محلي فقط (بدون خادم مركزي)' },
                  { value: 'private_server', label: 'خادم خاص للشركة (Private Server)' },
                  { value: 'lan', label: 'شبكة محلية داخل المكتب (LAN)' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    syncCenter: { ...(prev.syncCenter || state.settings.syncCenter!), mode: val },
                  }))
                }
              />

              {draft.syncCenter?.mode !== 'local_only' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-500 block mb-1">IP / Domain الخادم</label>
                    <input
                      dir="ltr"
                      value={draft.syncCenter?.serverHost || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          syncCenter: { ...(prev.syncCenter || state.settings.syncCenter!), serverHost: e.target.value },
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">المنفذ (Port)</label>
                    <input
                      type="number"
                      value={draft.syncCenter?.serverPort || 3000}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          syncCenter: { ...(prev.syncCenter || state.settings.syncCenter!), serverPort: Number(e.target.value) },
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <BottomSheetSelect
                      label="البروتوكول"
                      value={draft.syncCenter?.protocol || 'wss'}
                      options={[
                        { value: 'wss', label: 'WSS (WebSocket Secure - لحظي مشفر)' },
                        { value: 'https', label: 'HTTPS (مزامنة آمنة)' },
                        { value: 'http', label: 'HTTP (للشبكات المحلية المعزولة)' },
                      ]}
                      onChange={(val) =>
                        setDraft((prev) => ({
                          ...prev,
                          syncCenter: { ...(prev.syncCenter || state.settings.syncCenter!), protocol: val },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Wifi className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <span>سلوك المزامنة ومعالجة التعارضات</span>
              </h3>

              <BottomSheetSelect
                label="سلوك المزامنة"
                value={draft.syncCenter?.behavior || 'auto'}
                options={[
                  { value: 'auto', label: 'تلقائي فور توفر الاتصال' },
                  { value: 'wifi_only', label: 'على شبكة Wi-Fi فقط (لتوفير البيانات)' },
                  { value: 'manual', label: 'يدوي فقط' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    syncCenter: { ...(prev.syncCenter || state.settings.syncCenter!), behavior: val },
                  }))
                }
              />

              <BottomSheetSelect
                label="سياسة معالجة تعارضات التعديل المتزامن"
                value={draft.syncCenter?.conflictResolution || 'latest_wins'}
                options={[
                  { value: 'latest_wins', label: 'إعطاء الأولوية للتعديل الأحدث زمنياً' },
                  { value: 'current_device', label: 'إعطاء الأولوية للجهاز الحالي' },
                  { value: 'manual_review', label: 'طلب المراجعة اليدوية من المدير' },
                ]}
                onChange={(val) =>
                  setDraft((prev) => ({
                    ...prev,
                    syncCenter: { ...(prev.syncCenter || state.settings.syncCenter!), conflictResolution: val },
                  }))
                }
              />
            </div>
          </div>
        </>
      )}

      {/* SECTION 8: ADVANCED / DEVELOPER */}
      {activeSection === 'advanced' && (
        <>
          <SectionSubHeader />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Storage Management & System Info */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <h3 className="text-sm font-bold">إدارة التخزين والذاكرة</h3>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">حجم قاعدة البيانات الأساسية:</span>
                    <span className="font-mono-num font-bold">{storageMetrics.dbKb} KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">حجم المرفقات والصور والمستندات:</span>
                    <span className="font-mono-num font-bold">{storageMetrics.attachmentsKb.toLocaleString()} KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">الملفات المؤقتة (Cache):</span>
                    <span className="font-mono-num font-bold text-amber-600 dark:text-amber-400">{storageMetrics.tempKb} KB</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10">
                    <span className="font-semibold">إجمالي المساحة المستخدمة:</span>
                    <span className="font-mono-num font-bold text-[#26478D] dark:text-blue-400">{storageMetrics.totalMb} MB</span>
                  </div>
                </div>
                <RippleButton variant="secondary" className="w-full" onClick={handleClearTempFiles}>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تنظيف الملفات المؤقتة</span>
                </RippleButton>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">معلومات النظام والبنية</h3>
                  <button
                    type="button"
                    onClick={() => setActiveSection('about')}
                    className="text-xs font-semibold text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    فتح حول التطبيق ←
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">إصدار التطبيق:</span>
                  <span className="font-mono-num font-semibold">1.0.0 (Build 2026.11.15)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">بيئة التشغيل / الواجهة:</span>
                  <span className="font-mono-num">React 19 + Web Engine · Flutter/Dart 3.24 Spec</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">وضع المطور:</span>
                  <span className={`font-semibold ${devModeEnabled ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {devModeEnabled ? 'مُفعّل ✓' : 'غير مفعل (اضغط 5 مرات في حول التطبيق)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Developer Mode Console & Error Logs */}
            <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <h3 className="text-sm font-bold">خيارات وضع المطور وسجلات الأخطاء</h3>
                </div>
                {!devModeEnabled && (
                  <button
                    type="button"
                    onClick={() => setActiveSection('about')}
                    className="text-[11px] font-semibold text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    تفعيل من شاشة حول التطبيق (5 نقرات)
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <RippleButton variant="secondary" onClick={handleExportTestJson}>
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير بيانات الاختبار JSON</span>
                </RippleButton>
                {devModeEnabled && (
                  <RippleButton
                    variant="danger"
                    onClick={async () => {
                      const res = await mutate('POST', '/api/workspace/reset-fresh', {});
                      if (res) pushToast('info', 'تمت إعادة تهيئة مساحة عمل نظيفة للاختبار');
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>إعادة تعيين قاعدة البيانات للاختبار</span>
                  </RippleButton>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/10 max-h-64 overflow-y-auto">
                {(state.settings.developerCenter?.errorLogs || []).map((log) => (
                  <div key={log.id} className="p-3 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-[#26478D] dark:text-blue-400">{log.source}</span>
                      <span className="font-mono-num text-[11px] text-slate-400">{formatDateTime(log.timestamp, lang)}</span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">{log.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add Bank Account Modal */}
      {newBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAddBankAccount}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 animate-aqar-fade-scale"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">إضافة حساب بنكي للتحصيل</h3>
              <button type="button" onClick={() => setNewBankModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <input
                required
                placeholder="اسم البنك (مثال: البنك الأهلي السعودي)"
                value={bankForm.bankName}
                onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                required
                dir="ltr"
                placeholder="SA0000000000000000000000"
                value={bankForm.iban}
                onChange={(e) => setBankForm({ ...bankForm, iban: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                placeholder="اسم صاحب الحساب"
                value={bankForm.accountHolder}
                onChange={(e) => setBankForm({ ...bankForm, accountHolder: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <GlassToggle
                checked={bankForm.showOnReceipts}
                onChange={(next) => setBankForm({ ...bankForm, showOnReceipts: next })}
                label="إظهار الحساب في الإيصالات"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewBankModal(false)}
                className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                إلغاء
              </button>
              <RippleButton type="submit">حفظ الحساب</RippleButton>
            </div>
          </form>
        </div>
      )}

      {/* Backup Restore Preview Modal */}
      {backupPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 animate-aqar-fade-scale">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">معاينة محتوى النسخة قبل الاستعادة</h3>
              <button type="button" onClick={() => setBackupPreview(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>تحذير:</strong> سيتم استبدال البيانات الحالية بمحتويات النسخة المختارة: <strong>{backupPreview.label}</strong>
              </div>
            </div>
            {backupPreview.exists ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between">
                  <span>العقارات:</span>
                  <strong className="font-mono-num">{backupPreview.propertiesCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between">
                  <span>الوحدات:</span>
                  <strong className="font-mono-num">{backupPreview.unitsCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between">
                  <span>المستأجرون:</span>
                  <strong className="font-mono-num">{backupPreview.tenantsCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between">
                  <span>العقود:</span>
                  <strong className="font-mono-num">{backupPreview.contractsCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between">
                  <span>السندات:</span>
                  <strong className="font-mono-num">{backupPreview.paymentsCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between">
                  <span>القوالب:</span>
                  <strong className="font-mono-num">{backupPreview.templatesCount}</strong>
                </div>
              </div>
            ) : (
              <div className="text-xs text-red-500">ملف النسخة غير موجود على الخادم — أنشئ نسخة فورية جديدة أولاً.</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBackupPreview(null)}
                className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                إلغاء
              </button>
              {backupPreview.exists && (
                <RippleButton variant="danger" onClick={handleConfirmRestoreBackup}>
                  تأكيد الاستعادة الآن
                </RippleButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Company Modal */}
      {showAddCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAddCompany}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">إضافة شركة عقارية جديدة</h3>
              <button type="button" onClick={() => setShowAddCompany(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                required
                placeholder="اسم الشركة بالعربية"
                value={companyForm.nameAr}
                onChange={(e) => setCompanyForm({ ...companyForm, nameAr: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                placeholder="Company Name (EN)"
                value={companyForm.nameEn}
                onChange={(e) => setCompanyForm({ ...companyForm, nameEn: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                required
                placeholder="السجل التجاري"
                value={companyForm.crNumber}
                onChange={(e) => setCompanyForm({ ...companyForm, crNumber: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                placeholder="الرقم الضريبي (إن وجد)"
                value={companyForm.vatNumber}
                onChange={(e) => setCompanyForm({ ...companyForm, vatNumber: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                placeholder="المدينة"
                value={companyForm.city}
                onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                placeholder="رقم الهاتف"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                placeholder="اسم البنك"
                value={companyForm.bankName}
                onChange={(e) => setCompanyForm({ ...companyForm, bankName: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                placeholder="رقم الآيبان (IBAN)"
                value={companyForm.iban}
                onChange={(e) => setCompanyForm({ ...companyForm, iban: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                placeholder="العنوان الوطني / المقر"
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddCompany(false)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                إلغاء
              </button>
              <RippleButton type="submit">حفظ الشركة</RippleButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
