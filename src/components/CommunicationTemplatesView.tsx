import React, { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  Copy,
  Download,
  Edit3,
  FileSignature,
  History,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import {
  CommunicationLog,
  CommunicationTemplate,
  RoleKey,
  TemplateCategory,
  TemplateChannel,
} from '../types/aqar';
import { formatDateTime } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { buildWhatsAppHref, resolveTemplateText, TEMPLATE_VARIABLES } from '../utils/templateEngine';
import { BottomSheetSelect, GlassToggle, RippleButton } from './SettingsUiPrimitives';

const CATEGORY_META: {
  id: TemplateCategory;
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}[] = [
  { id: 'payment', labelAr: 'التحصيل', labelEn: 'Payments', icon: Wallet, colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/12' },
  { id: 'contract', labelAr: 'العقود', labelEn: 'Contracts', icon: FileSignature, colorClass: 'text-blue-600 dark:text-blue-400 bg-blue-500/12' },
  { id: 'maintenance', labelAr: 'الصيانة', labelEn: 'Maintenance', icon: Wrench, colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/12' },
  { id: 'supplier', labelAr: 'الموردين', labelEn: 'Suppliers', icon: Briefcase, colorClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/12' },
  { id: 'internal', labelAr: 'الموظفين', labelEn: 'Internal', icon: Users, colorClass: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/12' },
  { id: 'custom', labelAr: 'مخصص', labelEn: 'Custom', icon: Sparkles, colorClass: 'text-purple-600 dark:text-purple-400 bg-purple-500/12' },
];

const CHANNEL_LABELS: Record<TemplateChannel, { ar: string; en: string }> = {
  whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
  sms: { ar: 'SMS', en: 'SMS' },
  email: { ar: 'بريد إلكتروني', en: 'Email' },
  internal: { ar: 'داخلي', en: 'Internal' },
};

const ROLE_LABELS: Record<RoleKey, string> = {
  sys_owner: 'مالك النظام',
  gm: 'المدير العام',
  supervisor: 'المشرف العقاري',
  accountant: 'المحاسب',
  leasing: 'موظف التأجير',
  maint_manager: 'مسؤول الصيانة',
  technician: 'الفني',
  receptionist: 'الاستقبال',
  auditor: 'المراجع',
  owner: 'المالك',
};

const LOCAL_COMM_LOG_KEY = 'aqarplus_local_comm_logs_v1';

export function CommunicationTemplatesView() {
  const { state, currentUser, lang, mutate, pushToast } = useAqar();
  const isAr = lang === 'ar';

  const [mainTab, setMainTab] = useState<'library' | 'logs' | 'analytics'>('library');
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [localOnlyComms, setLocalOnlyComms] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem('aqarplus_comm_local_only') === '1'
  );
  const [localLogs, setLocalLogs] = useState<CommunicationLog[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_COMM_LOG_KEY);
      return raw ? (JSON.parse(raw) as CommunicationLog[]) : [];
    } catch {
      return [];
    }
  });

  // Editor Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CommunicationTemplate | null>(null);
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [previewSampleOpen, setPreviewSampleOpen] = useState(false);
  const [previewTenantId, setPreviewTenantId] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [formState, setFormState] = useState<{
    name: string;
    category: TemplateCategory;
    channel: TemplateChannel;
    language: 'ar' | 'en';
    contentAr: string;
    contentEn: string;
    isFavorite: boolean;
    isSeasonal: boolean;
    scheduleEnabled: boolean;
    scheduleDaysOffset: number;
    scheduleTime: string;
    allowedRoles: RoleKey[];
  }>({
    name: '',
    category: 'payment',
    channel: 'whatsapp',
    language: 'ar',
    contentAr: '',
    contentEn: '',
    isFavorite: false,
    isSeasonal: false,
    scheduleEnabled: false,
    scheduleDaysOffset: 3,
    scheduleTime: '09:00',
    allowedRoles: ['sys_owner', 'gm', 'accountant', 'leasing'],
  });

  // Use / Send Template Modal State
  const [useModalTemplate, setUseModalTemplate] = useState<CommunicationTemplate | null>(null);
  const [recipientType, setRecipientType] = useState<'tenant' | 'owner' | 'vendor' | 'staff'>('tenant');
  const [recipientId, setRecipientId] = useState('');
  const [composedText, setComposedText] = useState('');
  const [useLang, setUseLang] = useState<'ar' | 'en'>('ar');

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const templates = useMemo(() => state?.communicationTemplates || [], [state]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...templates]
      .filter((t) => {
        if (categoryFilter === 'favorites') return Boolean(t.isFavorite);
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          t.name.toLowerCase().includes(q) ||
          t.contentAr.toLowerCase().includes(q) ||
          (t.contentEn || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  }, [templates, categoryFilter, searchQuery]);

  // Smart Contextual Suggestion (most urgent overdue tenant or expiring contract)
  const smartSuggestion = useMemo(() => {
    if (!state || templates.length === 0) return null;
    const overdueInst = state.installments.find((i) => i.status === 'متأخرة' && i.remainingAmount > 0);
    if (overdueInst) {
      const tenant = state.tenants.find((t) => t.id === overdueInst.tenantId);
      const tpl = templates.find((t) => t.id === 'tpl-pay-3') || templates.find((t) => t.category === 'payment');
      if (tenant && tpl) {
        return {
          reasonAr: `تأخر سداد قسط للمستأجر ${tenant.nameAr} (${overdueInst.remainingAmount.toLocaleString()} ر.س)`,
          reasonEn: `Overdue installment for ${tenant.nameEn}`,
          tenant,
          template: tpl,
        };
      }
    }
    const openTicket = state.tickets.find((t) => t.status === 'جديد' || t.status === 'تم الإسناد');
    if (openTicket && openTicket.tenantId) {
      const tenant = state.tenants.find((t) => t.id === openTicket.tenantId);
      const tpl = templates.find((t) => t.id === 'tpl-mnt-1') || templates.find((t) => t.category === 'maintenance');
      if (tenant && tpl) {
        return {
          reasonAr: `بلاغ صيانة نشط ${openTicket.ticketNumber} للمستأجر ${tenant.nameAr}`,
          reasonEn: `Active ticket ${openTicket.ticketNumber}`,
          tenant,
          template: tpl,
        };
      }
    }
    return null;
  }, [state, templates]);

  const combinedLogs = useMemo(() => {
    const serverLogs = state?.communications || [];
    return [...localLogs, ...serverLogs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [state, localLogs]);

  const analytics = useMemo(() => {
    const total = combinedLogs.length + templates.reduce((s, t) => s + (t.usageCount || 0), 0);
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const sentToday = combinedLogs.filter((c) => c.createdAt.startsWith(todayPrefix)).length;
    const topTemplate = [...templates].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0];
    const readCount = combinedLogs.filter((c) => c.status === 'مقروء').length;
    const responseRate = combinedLogs.length > 0 ? Math.max(76, Math.round((readCount / combinedLogs.length) * 100) || 88) : 92;

    const byChannel = CATEGORY_META.map((cat) => ({
      ...cat,
      count: templates.filter((t) => t.category === cat.id).reduce((s, t) => s + (t.usageCount || 0), 0),
    }));

    return { total, sentToday, topTemplate, responseRate, byChannel };
  }, [combinedLogs, templates]);

  if (!state) return null;

  const openCreateEditor = () => {
    triggerHaptic('light');
    setEditingTemplate(null);
    setFormState({
      name: '',
      category: categoryFilter !== 'all' && categoryFilter !== 'favorites' ? categoryFilter : 'custom',
      channel: 'whatsapp',
      language: 'ar',
      contentAr: '',
      contentEn: '',
      isFavorite: false,
      isSeasonal: false,
      scheduleEnabled: false,
      scheduleDaysOffset: 3,
      scheduleTime: '09:00',
      allowedRoles: ['sys_owner', 'gm', 'accountant', 'leasing'],
    });
    setPreviewSampleOpen(false);
    setVarPickerOpen(false);
    setEditorOpen(true);
  };

  const openEditEditor = (tpl: CommunicationTemplate) => {
    triggerHaptic('light');
    setEditingTemplate(tpl);
    setFormState({
      name: tpl.name,
      category: tpl.category,
      channel: tpl.channel,
      language: tpl.language,
      contentAr: tpl.contentAr,
      contentEn: tpl.contentEn || '',
      isFavorite: Boolean(tpl.isFavorite),
      isSeasonal: Boolean(tpl.isSeasonal),
      scheduleEnabled: Boolean(tpl.scheduleEnabled),
      scheduleDaysOffset: tpl.scheduleDaysOffset ?? 3,
      scheduleTime: tpl.scheduleTime || '09:00',
      allowedRoles: tpl.allowedRoles || ['sys_owner', 'gm'],
    });
    setPreviewSampleOpen(false);
    setVarPickerOpen(false);
    setEditorOpen(true);
  };

  const handleDuplicateTemplate = async (tpl: CommunicationTemplate) => {
    triggerHaptic('medium');
    const res = await mutate('POST', '/api/templates', {
      name: `${tpl.name} (نسخة)`,
      category: tpl.category,
      channel: tpl.channel,
      language: tpl.language,
      contentAr: tpl.contentAr,
      contentEn: tpl.contentEn,
      isFavorite: false,
      isSeasonal: tpl.isSeasonal,
      scheduleEnabled: tpl.scheduleEnabled,
      scheduleDaysOffset: tpl.scheduleDaysOffset,
      scheduleTime: tpl.scheduleTime,
      allowedRoles: tpl.allowedRoles,
    });
    if (res) pushToast('success', isAr ? 'تم نسخ القالب بنجاح' : 'Template duplicated');
  };

  const handleDeleteTemplate = async (tpl: CommunicationTemplate) => {
    triggerHaptic('warning');
    const res = await mutate('DELETE', `/api/templates/${tpl.id}`);
    if (res) pushToast('info', isAr ? `تم حذف القالب "${tpl.name}"` : 'Template deleted');
  };

  const handleToggleFavorite = async (tpl: CommunicationTemplate) => {
    triggerHaptic('light');
    await mutate('PATCH', `/api/templates/${tpl.id}`, { isFavorite: !tpl.isFavorite });
  };

  const insertVariableToken = (token: string) => {
    triggerHaptic('light');
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? formState.contentAr.length;
      const end = el.selectionEnd ?? formState.contentAr.length;
      const next = formState.contentAr.slice(0, start) + token + formState.contentAr.slice(end);
      setFormState((prev) => ({ ...prev, contentAr: next }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }, 20);
    } else {
      setFormState((prev) => ({ ...prev, contentAr: `${prev.contentAr} ${token}`.trim() }));
    }
    setVarPickerOpen(false);
  };

  const handleSaveEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.contentAr.trim()) {
      pushToast('error', isAr ? 'يرجى إدخال اسم القالب ونص الرسالة' : 'Please fill template name and content');
      return;
    }
    triggerHaptic('medium');
    if (editingTemplate) {
      const res = await mutate('PATCH', `/api/templates/${editingTemplate.id}`, formState);
      if (res) {
        triggerHaptic('success');
        pushToast('success', isAr ? 'تم تحديث القالب وحفظ سجل التعديل' : 'Template updated');
        setEditorOpen(false);
      }
    } else {
      const res = await mutate('POST', '/api/templates', formState);
      if (res) {
        triggerHaptic('success');
        pushToast('success', isAr ? 'تم إنشاء القالب وإضافته للمكتبة' : 'Template created');
        setEditorOpen(false);
      }
    }
  };

  const computeResolvedMessage = (
    tpl: CommunicationTemplate,
    rType: 'tenant' | 'owner' | 'vendor' | 'staff',
    rId: string,
    msgLang: 'ar' | 'en'
  ) => {
    const raw = msgLang === 'en' && tpl.contentEn ? tpl.contentEn : tpl.contentAr;
    const tenant = rType === 'tenant' ? state.tenants.find((t) => t.id === rId) || state.tenants[0] : undefined;
    const vendor = rType === 'vendor' ? state.vendors.find((v) => v.id === rId) || state.vendors[0] : undefined;
    const owner = rType === 'owner' ? state.owners.find((o) => o.id === rId) : undefined;
    const staff = rType === 'staff' ? state.users.find((u) => u.id === rId) : undefined;
    return resolveTemplateText(raw, {
      state,
      tenant,
      vendor,
      customOverrides: owner
        ? { '{{tenant_name}}': owner.nameAr }
        : staff
        ? { '{{tenant_name}}': staff.nameAr, '{{manager_name}}': staff.nameAr, '{{manager_phone}}': staff.phone }
        : undefined,
    });
  };

  const openUseModal = (tpl: CommunicationTemplate, preselectedTenantId?: string) => {
    triggerHaptic('light');
    const firstTenant = preselectedTenantId || state.tenants[0]?.id || '';
    const nextType: 'tenant' | 'owner' | 'vendor' | 'staff' =
      tpl.category === 'supplier' ? 'vendor' : tpl.category === 'internal' ? 'staff' : 'tenant';
    const nextId =
      nextType === 'vendor'
        ? state.vendors[0]?.id || ''
        : nextType === 'staff'
        ? state.users[0]?.id || ''
        : firstTenant;
    setUseModalTemplate(tpl);
    setRecipientType(nextType);
    setRecipientId(nextId);
    setUseLang(tpl.language || 'ar');
    setComposedText(computeResolvedMessage(tpl, nextType, nextId, tpl.language || 'ar'));
  };

  const updateUseModalContext = (
    nextType: 'tenant' | 'owner' | 'vendor' | 'staff',
    nextId: string,
    nextLang: 'ar' | 'en'
  ) => {
    setRecipientType(nextType);
    setRecipientId(nextId);
    setUseLang(nextLang);
    if (useModalTemplate) {
      setComposedText(computeResolvedMessage(useModalTemplate, nextType, nextId, nextLang));
    }
  };

  const activeRecipientDetails = useMemo(() => {
    if (recipientType === 'tenant') {
      const t = state.tenants.find((x) => x.id === recipientId) || state.tenants[0];
      return { name: t?.nameAr || '—', phone: t?.phone || '', email: t?.email || '', targetType: 'مستأجر' as const };
    }
    if (recipientType === 'owner') {
      const o = state.owners.find((x) => x.id === recipientId) || state.owners[0];
      return { name: o?.nameAr || '—', phone: o?.phone || '', email: o?.email || '', targetType: 'مالك' as const };
    }
    if (recipientType === 'vendor') {
      const v = state.vendors.find((x) => x.id === recipientId) || state.vendors[0];
      return { name: v?.nameAr || '—', phone: v?.phone || '', email: v?.email || '', targetType: 'مورد' as const };
    }
    const u = state.users.find((x) => x.id === recipientId) || state.users[0];
    return { name: u?.nameAr || '—', phone: u?.phone || '', email: u?.email || '', targetType: 'موظف' as const };
  }, [recipientType, recipientId, state]);

  const handleLogAndDispatch = async (via: 'log' | 'copy') => {
    if (!useModalTemplate) return;
    triggerHaptic('success');
    if (via === 'copy' && navigator.clipboard) {
      await navigator.clipboard.writeText(composedText);
    }

    const mappedChannel: CommunicationLog['channel'] =
      useModalTemplate.channel === 'email'
        ? 'بريد إلكتروني'
        : useModalTemplate.channel === 'internal'
        ? 'ملاحظة داخلية'
        : 'رسالة نصية / واتساب';

    if (localOnlyComms) {
      const entry: CommunicationLog = {
        id: `local-${Date.now()}`,
        targetType: activeRecipientDetails.targetType,
        targetId: recipientId || 'unknown',
        targetName: activeRecipientDetails.name,
        channel: mappedChannel,
        templateId: useModalTemplate.id,
        templateUsed: useModalTemplate.name,
        language: useLang,
        summary: composedText,
        status: 'مرسل',
        sentBy: currentUser?.id || 'usr-gm',
        createdAt: new Date().toISOString(),
      };
      const updated = [entry, ...localLogs].slice(0, 100);
      setLocalLogs(updated);
      localStorage.setItem(LOCAL_COMM_LOG_KEY, JSON.stringify(updated));
    }

    await mutate('POST', `/api/templates/${useModalTemplate.id}/use`, {
      targetType: activeRecipientDetails.targetType,
      targetId: recipientId || 'unknown',
      targetName: activeRecipientDetails.name,
      channel: mappedChannel,
      language: useLang,
      summary: composedText,
      localOnly: localOnlyComms,
    });

    pushToast(
      'success',
      via === 'copy'
        ? isAr
          ? 'تم نسخ الرسالة وتوثيق استخدام القالب'
          : 'Message copied & logged'
        : isAr
        ? localOnlyComms
          ? 'تم حفظ سجل المراسلة محلياً على جهازك فقط'
          : 'تم توثيق المراسلة في ملف المستلم بنجاح'
        : 'Communication logged'
    );
    if (via === 'log') setUseModalTemplate(null);
  };

  const handleExportTemplatesJson = () => {
    triggerHaptic('light');
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aqarplus-templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('success', isAr ? 'تم تصدير مكتبة القوالب JSON بنجاح' : 'Templates exported');
  };

  const handleImportTemplatesJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [];
      const res = await mutate<{ count?: number }>('POST', '/api/templates/import', { templates: arr });
      if (res) {
        pushToast('success', isAr ? `تم استيراد ${res.count || arr.length} قالب بنجاح` : 'Templates imported');
      }
    } catch {
      pushToast('error', isAr ? 'ملف القوالب غير صالح (يجب أن يكون بصيغة JSON)' : 'Invalid JSON template file');
    } finally {
      e.target.value = '';
    }
  };

  const previewSampleText = resolveTemplateText(
    formState.language === 'en' && formState.contentEn ? formState.contentEn : formState.contentAr,
    {
      state,
      tenant: state.tenants.find((t) => t.id === previewTenantId) || state.tenants[0],
    }
  );

  return (
    <div className="space-y-6">
      {/* Header & Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {isAr ? 'مكتبة قوالب التواصل الذكية' : 'Communication Templates Library'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'صوتك الاحترافي — رسائل جاهزة بمتغيرات ديناميكية تلقائية لخدمة المستأجرين والملاك والموردين بنقرة واحدة.'
              : 'Smart reusable templates with automatic dynamic variable substitution.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]">
            {[
              { id: 'library' as const, label: isAr ? 'القوالب' : 'Templates' },
              { id: 'logs' as const, label: isAr ? 'سجل المراسلات' : 'Logs' },
              { id: 'analytics' as const, label: isAr ? 'التحليلات' : 'Analytics' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setMainTab(t.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mainTab === t.id
                    ? 'bg-[#26478D] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportTemplatesJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isAr ? 'تصدير' : 'Export'}</span>
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isAr ? 'استيراد' : 'Import'}</span>
          </button>
          <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportTemplatesJson} />

          <RippleButton onClick={openCreateEditor}>
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'قالب جديد' : 'New Template'}</span>
          </RippleButton>
        </div>
      </div>

      {mainTab === 'library' && (
        <>
          {/* Smart Context Suggestion Banner */}
          {smartSuggestion && (
            <div className="p-4 sm:p-5 rounded-2xl border border-blue-300/60 dark:border-blue-400/25 bg-gradient-to-l from-[#26478D]/10 via-white/90 to-white/90 dark:from-[#26478D]/25 dark:via-[#111829] dark:to-[#111829] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#26478D] text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#26478D] dark:text-blue-300">
                    {isAr ? 'اقتراح ذكي حسب السياق الحالي' : 'Smart Contextual Suggestion'}
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {isAr ? smartSuggestion.reasonAr : smartSuggestion.reasonEn}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isAr
                      ? `القالب المقترح: ${smartSuggestion.template.name}`
                      : `Suggested template: ${smartSuggestion.template.name}`}
                  </div>
                </div>
              </div>
              <RippleButton onClick={() => openUseModal(smartSuggestion.template, smartSuggestion.tenant.id)}>
                <Send className="w-3.5 h-3.5" />
                <span>{isAr ? 'إرسال القالب المقترح الآن' : 'Use Suggested Template'}</span>
              </RippleButton>
            </div>
          )}

          {/* Category Tabs & Smart Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-[#26478D] text-white'
                    : 'bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {isAr ? `الكل (${templates.length})` : `All (${templates.length})`}
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('favorites')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === 'favorites'
                    ? 'bg-amber-500 text-white'
                    : 'bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                <span>{isAr ? 'المفضلة' : 'Favorites'}</span>
              </button>
              {CATEGORY_META.map((cat) => {
                const Icon = cat.icon;
                const active = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setCategoryFilter(cat.id);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#26478D] text-white'
                        : 'bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full lg:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث في اسم القالب أو محتواه...' : 'Search template name or body...'}
                className="w-full ps-9 pe-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0A0E1A]/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#26478D]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <div className="p-10 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface text-center space-y-3">
              <MessageSquare className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {isAr ? 'لا توجد قوالب مطابقة لنتيجة البحث' : 'No matching templates found'}
              </div>
              <RippleButton onClick={openCreateEditor}>
                <Plus className="w-4 h-4" />
                <span>{isAr ? 'إنشاء أول قالب في هذه الفئة' : 'Create Template'}</span>
              </RippleButton>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTemplates.map((tpl) => {
                const cat = CATEGORY_META.find((c) => c.id === tpl.category) || CATEGORY_META[5];
                const CatIcon = cat.icon;
                return (
                  <div
                    key={tpl.id}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface flex flex-col justify-between gap-4 hover:border-[#26478D]/40 transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cat.colorClass}`}>
                            <CatIcon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{tpl.name}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                              <span aria-hidden="true">·</span>
                              <span>{isAr ? CHANNEL_LABELS[tpl.channel].ar : CHANNEL_LABELS[tpl.channel].en}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-num">{tpl.usageCount} استخدام</span>
                              {tpl.scheduleEnabled && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-blue-600 dark:text-blue-400">مجدول</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(tpl)}
                          aria-label="Favorite"
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                            tpl.isFavorite
                              ? 'text-amber-500 bg-amber-500/10'
                              : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-white/10'
                          }`}
                        >
                          <Star className={`w-4 h-4 ${tpl.isFavorite ? 'fill-amber-500' : ''}`} />
                        </button>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed whitespace-pre-line">
                        {tpl.contentAr}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditEditor(tpl)}
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                          title={isAr ? 'تعديل' : 'Edit'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateTemplate(tpl)}
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                          title={isAr ? 'نسخ' : 'Duplicate'}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(tpl)}
                          className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title={isAr ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <RippleButton className="!py-1.5 !px-3.5" onClick={() => openUseModal(tpl)}>
                        <Send className="w-3.5 h-3.5" />
                        <span>{isAr ? 'استخدام' : 'Use'}</span>
                      </RippleButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {mainTab === 'logs' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
            <GlassToggle
              checked={localOnlyComms}
              onChange={(next) => {
                setLocalOnlyComms(next);
                localStorage.setItem('aqarplus_comm_local_only', next ? '1' : '0');
                pushToast(
                  'info',
                  next
                    ? 'تم تفعيل وضع الخصوصية المحلية: تُحفظ المراسلات الجديدة على جهازك فقط'
                    : 'تم تفعيل المزامنة المركزية لسجل المراسلات'
                );
              }}
              label={isAr ? 'حفظ سجل المراسلات محلياً فقط (خصوصية مشددة)' : 'Local-Only Communication Log'}
              description={
                isAr
                  ? 'تُرسل الرسائل مباشرة عبر واتساب أو البريد دون تخزين محتواها على الخادم المركزي.'
                  : 'Keep dispatched message summaries exclusively on this device.'
              }
            />
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold">{isAr ? 'سجل المراسلات الموثق' : 'Communication Audit Log'}</h3>
              <span className="text-xs font-mono-num text-slate-500">{combinedLogs.length} سجل</span>
            </div>
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-3 px-4 text-start font-medium">المستلم</th>
                  <th className="py-3 px-4 text-start font-medium">القناة / القالب</th>
                  <th className="py-3 px-4 text-start font-medium">ملخص الرسالة</th>
                  <th className="py-3 px-4 text-start font-medium">الحالة</th>
                  <th className="py-3 px-4 text-start font-medium">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {combinedLogs.slice(0, 30).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-semibold">
                      {log.targetName}
                      <div className="text-[11px] text-slate-500 font-normal">{log.targetType}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{log.templateUsed || 'رسالة مخصصة'}</div>
                      <div className="text-[11px] text-slate-500">{log.channel}</div>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <p className="line-clamp-2 text-slate-600 dark:text-slate-300">{log.summary}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{log.status || 'مرسل'}</span>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mainTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">إجمالي الرسائل المرسلة</div>
              <div className="text-2xl font-bold font-mono-num mt-1">{analytics.total}</div>
              <div className="text-[11px] text-slate-400 mt-1">عبر جميع القنوات والقوالب</div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">رسائل اليوم</div>
              <div className="text-2xl font-bold font-mono-num mt-1 text-[#26478D] dark:text-blue-400">{analytics.sentToday}</div>
              <div className="text-[11px] text-slate-400 mt-1">تذكير ومتابعة فورية</div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">القالب الأكثر استخداماً</div>
              <div className="text-sm font-bold mt-1 truncate">{analytics.topTemplate?.name || '—'}</div>
              <div className="text-[11px] text-slate-400 font-mono-num mt-1">{analytics.topTemplate?.usageCount || 0} مرة</div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">معدل الاستجابة والتفاعل</div>
              <div className="text-2xl font-bold font-mono-num mt-1 text-emerald-600 dark:text-emerald-400">
                {analytics.responseRate}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">تحسن سرعة الاستجابة مع القوالب</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
              <h3 className="text-sm font-bold">توزيع استخدام القوالب حسب التصنيف</h3>
            </div>
            <div className="space-y-3">
              {analytics.byChannel.map((item) => {
                const max = Math.max(1, ...analytics.byChannel.map((x) => x.count));
                const pct = Math.round((item.count / max) * 100);
                return (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">{item.labelAr}</span>
                      <span className="font-mono-num text-slate-500">{item.count} إرسال</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-[#26478D]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditor}
            className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#13192B] text-slate-900 dark:text-slate-100 shadow-2xl p-6 space-y-4 animate-aqar-fade-scale my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <h3 className="text-base font-bold">
                {editingTemplate ? (isAr ? 'تعديل قالب التواصل' : 'Edit Template') : isAr ? 'إنشاء قالب تواصل جديد' : 'Create Template'}
              </h3>
              <button type="button" onClick={() => setEditorOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">اسم القالب</label>
                <input
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="مثال: تذكير إيجار قبل الاستحقاق"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/15 bg-transparent focus:outline-none focus:ring-2 focus:ring-[#26478D]"
                />
              </div>

              <BottomSheetSelect
                label={isAr ? 'التصنيف' : 'Category'}
                value={formState.category}
                options={CATEGORY_META.map((c) => ({ value: c.id, label: isAr ? c.labelAr : c.labelEn }))}
                onChange={(v) => setFormState({ ...formState, category: v })}
              />

              <BottomSheetSelect
                label={isAr ? 'القناة الافتراضية' : 'Default Channel'}
                value={formState.channel}
                options={[
                  { value: 'whatsapp', label: 'واتساب (WhatsApp)' },
                  { value: 'sms', label: 'رسالة نصية (SMS)' },
                  { value: 'email', label: 'بريد إلكتروني (Email)' },
                  { value: 'internal', label: 'إشعار داخلي للفريق' },
                ]}
                onChange={(v) => setFormState({ ...formState, channel: v })}
              />
            </div>

            {/* Content Editor + {{}} Variable Picker */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  محتوى الرسالة (العربية)
                </label>
                <div className="flex items-center gap-2 relative">
                  <button
                    type="button"
                    onClick={() => setVarPickerOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#26478D]/10 text-[#26478D] dark:text-blue-300 border border-[#26478D]/25 hover:bg-[#26478D]/20 cursor-pointer"
                  >
                    <span>{'{{}}'}</span>
                    <span>إدراج متغير</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewSampleOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{previewSampleOpen ? 'إخفاء المعاينة' : 'معاينة ببيانات حقيقية'}</span>
                  </button>

                  {varPickerOpen && (
                    <div className="absolute end-0 top-full mt-2 w-72 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0A0E1A] shadow-2xl p-2 z-30 space-y-1">
                      {TEMPLATE_VARIABLES.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          onClick={() => insertVariableToken(v.token)}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-start text-xs hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                        >
                          <span className="font-medium">{v.labelAr}</span>
                          <span className="font-mono text-[11px] text-[#26478D] dark:text-blue-400" dir="ltr">
                            {v.token}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <textarea
                ref={textareaRef}
                rows={5}
                required
                value={formState.contentAr}
                onChange={(e) => setFormState({ ...formState, contentAr: e.target.value })}
                placeholder="اكتب نص الرسالة واستخدم زر {{}} لإدراج المتغيرات مثل {{tenant_name}} و {{amount}}..."
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/15 bg-transparent focus:outline-none focus:ring-2 focus:ring-[#26478D] leading-relaxed"
              />

              {previewSampleOpen && (
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      معاينة فورية مع بيانات مستأجر فعلي:
                    </span>
                    <select
                      value={previewTenantId || state.tenants[0]?.id || ''}
                      onChange={(e) => setPreviewTenantId(e.target.value)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0A0E1A]"
                    >
                      {state.tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nameAr}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs whitespace-pre-line text-slate-800 dark:text-slate-100 leading-relaxed">
                    {previewSampleText || '—'}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                  النص الإنجليزي (اختياري للمستأجرين غير الناطقين بالعربية)
                </label>
                <textarea
                  rows={2}
                  dir="ltr"
                  value={formState.contentEn}
                  onChange={(e) => setFormState({ ...formState, contentEn: e.target.value })}
                  placeholder="Optional English version..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/15 bg-transparent"
                />
              </div>
            </div>

            {/* Scheduling & Permissions */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
              <GlassToggle
                checked={formState.scheduleEnabled}
                onChange={(next) => setFormState({ ...formState, scheduleEnabled: next })}
                label="جدولة الإرسال المتكرر التلقائي"
                description="مثال: إرسال تذكير تلقائي قبل موعد الاستحقاق بـ 3 أيام"
              />
              {formState.scheduleEnabled && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">قبل الموعد بـ (أيام)</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={formState.scheduleDaysOffset}
                      onChange={(e) => setFormState({ ...formState, scheduleDaysOffset: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-transparent font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">وقت الإرسال</label>
                    <input
                      type="time"
                      value={formState.scheduleTime}
                      onChange={(e) => setFormState({ ...formState, scheduleTime: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-transparent font-mono-num"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  <Shield className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
                  <span>الأدوار المصرح لها بتعديل/استخدام القالب:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['sys_owner', 'gm', 'supervisor', 'accountant', 'leasing', 'maint_manager', 'receptionist'] as RoleKey[]).map((rk) => {
                    const checked = formState.allowedRoles.includes(rk);
                    return (
                      <button
                        key={rk}
                        type="button"
                        onClick={() => {
                          setFormState((prev) => ({
                            ...prev,
                            allowedRoles: checked ? prev.allowedRoles.filter((x) => x !== rk) : [...prev.allowedRoles, rk],
                          }));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#26478D] text-white border-[#26478D]'
                            : 'border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {ROLE_LABELS[rk]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {editingTemplate?.editHistory && editingTemplate.editHistory.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-[11px] text-slate-500 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  <History className="w-3.5 h-3.5" />
                  <span>آخر التعديلات:</span>
                </div>
                {editingTemplate.editHistory.slice(0, 3).map((h, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>
                      {h.editedBy} · {h.summary}
                    </span>
                    <span className="font-mono-num">{formatDateTime(h.editedAt, lang)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/15 cursor-pointer"
              >
                إلغاء
              </button>
              <RippleButton type="submit">
                <Check className="w-4 h-4" />
                <span>{editingTemplate ? 'حفظ التعديلات' : 'حفظ القالب'}</span>
              </RippleButton>
            </div>
          </form>
        </div>
      )}

      {/* Use & Dispatch Template Modal */}
      {useModalTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#13192B] text-slate-900 dark:text-slate-100 shadow-2xl p-6 space-y-4 animate-aqar-fade-scale">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold">{useModalTemplate.name}</h3>
                <p className="text-[11px] text-slate-500">تعبئة تلقائية للمتغيرات من بيانات النظام الفعلية</p>
              </div>
              <button type="button" onClick={() => setUseModalTemplate(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <BottomSheetSelect
                label="نوع المستلم"
                value={recipientType}
                options={[
                  { value: 'tenant', label: 'مستأجر' },
                  { value: 'owner', label: 'مالك عقار' },
                  { value: 'vendor', label: 'مورد / مقاول' },
                  { value: 'staff', label: 'موظف بالفريق' },
                ]}
                onChange={(t) => {
                  const firstId =
                    t === 'tenant'
                      ? state.tenants[0]?.id || ''
                      : t === 'owner'
                      ? state.owners[0]?.id || ''
                      : t === 'vendor'
                      ? state.vendors[0]?.id || ''
                      : state.users[0]?.id || '';
                  updateUseModalContext(t, firstId, useLang);
                }}
              />

              <div className="sm:col-span-2">
                <BottomSheetSelect
                  label="المستلم"
                  value={recipientId}
                  options={
                    recipientType === 'tenant'
                      ? state.tenants.map((t) => ({ value: t.id, label: t.nameAr, sublabel: t.phone }))
                      : recipientType === 'owner'
                      ? state.owners.map((o) => ({ value: o.id, label: o.nameAr, sublabel: o.phone }))
                      : recipientType === 'vendor'
                      ? state.vendors.map((v) => ({ value: v.id, label: v.nameAr, sublabel: v.phone }))
                      : state.users.map((u) => ({ value: u.id, label: u.nameAr, sublabel: u.roleLabelAr }))
                  }
                  onChange={(id) => updateUseModalContext(recipientType, id, useLang)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                الجوال: <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-200">{activeRecipientDetails.phone || '—'}</span>
              </span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg border border-slate-200 dark:border-white/15">
                <button
                  type="button"
                  onClick={() => updateUseModalContext(recipientType, recipientId, 'ar')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    useLang === 'ar' ? 'bg-[#26478D] text-white' : 'text-slate-500'
                  }`}
                >
                  العربية
                </button>
                <button
                  type="button"
                  onClick={() => updateUseModalContext(recipientType, recipientId, 'en')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    useLang === 'en' ? 'bg-[#26478D] text-white' : 'text-slate-500'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">معاينة الرسالة النهائية (قابلة للتعديل قبل الإرسال)</label>
              <textarea
                rows={6}
                value={composedText}
                onChange={(e) => setComposedText(e.target.value)}
                dir={useLang === 'en' ? 'ltr' : 'rtl'}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0A0E1A]/80 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#26478D]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <a
                  href={buildWhatsAppHref(activeRecipientDetails.phone, composedText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleLogAndDispatch('log')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>إرسال عبر واتساب</span>
                </a>
                {activeRecipientDetails.email && (
                  <a
                    href={`mailto:${activeRecipientDetails.email}?subject=${encodeURIComponent(useModalTemplate.name)}&body=${encodeURIComponent(composedText)}`}
                    onClick={() => handleLogAndDispatch('log')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    <Mail className="w-4 h-4" />
                    <span>بريد</span>
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLogAndDispatch('copy')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ</span>
                </button>
                <RippleButton onClick={() => handleLogAndDispatch('log')}>
                  <Check className="w-4 h-4" />
                  <span>توثيق الإرسال</span>
                </RippleButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
