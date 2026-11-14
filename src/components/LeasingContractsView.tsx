import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  FileCheck2,
  ClipboardCheck,
  X,
  CheckCircle2,
  BellRing,
  CalendarClock,
  Mail,
  MessageSquare,
  Send,
  Trash2,
  Play,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Upload,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import {
  ContractLifecycleStatus,
  CurrencyCode,
  EjarStatus,
  LeaseContract,
  OcrExtractedData,
  PaymentFrequency,
  ReminderChannel,
  UnitStatus,
} from '../types/aqar';
import { CURRENCY_META, formatDateTime, formatSar } from '../utils/formatters';
import { MoveToArchiveButton } from './MoveToArchiveButton';
import { CreateTaskQuickButton } from './CreateTaskQuickModal';
import { PrintViewButton } from './PrintViewButton';
import { readFileAsDataUrl, runGeminiOcrExtraction } from '../utils/ocrClient';

export function LeasingContractsView() {
  const {
    state,
    currentUser,
    lang,
    hasPermission,
    mutate,
    pushToast,
    baseCurrency,
    formatInCurrency,
    formatConvertedBase,
    leasingWizardUnitId,
    setLeasingWizardUnitId,
  } = useAqar();
  const [tab, setTab] = useState<'contracts' | 'handovers' | 'reminders'>('contracts');
  const [showNewContract, setShowNewContract] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [showExtraFees, setShowExtraFees] = useState(false);
  const [wizardChecks, setWizardChecks] = useState({
    metersVerified: true,
    keysReady: true,
    cleanReady: true,
  });
  const [isLeaseOcrBusy, setIsLeaseOcrBusy] = useState(false);
  const [scannedLeaseDoc, setScannedLeaseDoc] = useState<{
    dataUrl: string;
    mimeType: string;
    fileName: string;
    sizeKb: number;
    extracted: OcrExtractedData;
  } | null>(null);
  const [editingEjar, setEditingEjar] = useState<LeaseContract | null>(null);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [reminderContract, setReminderContract] = useState<LeaseContract | null>(null);
  const [renewTarget, setRenewTarget] = useState<LeaseContract | null>(null);
  const [renewForm, setRenewForm] = useState({
    startDate: '',
    endDate: '',
    annualRent: 48000,
    currency: 'SAR' as CurrencyCode,
    paymentFrequency: 'نصف سنوي' as PaymentFrequency,
    ejarNumber: '',
    notes: '',
  });

  const [contractForm, setContractForm] = useState({
    unitId: '',
    tenantId: '',
    ejarNumber: '',
    ejarStatus: 'قيد التوثيق' as EjarStatus,
    lifecycleStatus: 'بانتظار التوثيق' as ContractLifecycleStatus,
    startDate: '2026-11-15',
    endDate: '2027-11-14',
    annualRent: 48000,
    currency: 'SAR' as CurrencyCode,
    paymentFrequency: 'نصف سنوي' as PaymentFrequency,
    securityDeposit: 3000,
    officeFee: 1200,
    managementCommissionPercent: 5,
    includedServices: 'المياه والصيانة المشتركة',
    notes: '',
  });

  const [ruleForm, setRuleForm] = useState({
    nameAr: 'تذكير تلقائي قبل استحقاق الإيجار',
    nameEn: 'Automated Pre-Due Rent Reminder',
    daysBeforeDue: 5,
    contractId: 'all',
    channels: ['بريد إلكتروني', 'رسائل نصية SMS (محاكاة)', 'واتساب'] as ReminderChannel[],
    templateAr:
      'مرحباً {tenant}، تذكير بقرب استحقاق القسط #{installment} لعقد {contract} (الوحدة {unit}) بقيمة {amount} بتاريخ {dueDate}.',
    templateEn:
      'Hello {tenant}, installment #{installment} for contract {contract} (Unit {unit}) of {amount} is due on {dueDate}.',
  });

  const [contractReminderChannels, setContractReminderChannels] = useState<ReminderChannel[]>([
    'واتساب',
    'بريد إلكتروني',
  ]);
  const [contractReminderMsg, setContractReminderMsg] = useState('');

  const [ejarEditForm, setEjarEditForm] = useState({
    ejarNumber: '',
    ejarStatus: 'موثق في إيجار' as EjarStatus,
    lifecycleStatus: 'نشط' as ContractLifecycleStatus,
  });

  const [handoverForm, setHandoverForm] = useState({
    contractId: '',
    type: 'إخلاء واستلام' as 'استلام عند التأجير' | 'إخلاء واستلام',
    date: '2026-11-14',
    keysReturned: 4,
    acRemotesReturned: 4,
    electricityReading: '21450',
    waterReading: '482',
    damageCost: 0,
    unpaidRentDue: 0,
    doorsOk: true,
    acOk: true,
    plumbingOk: true,
    cleaningOk: false,
  });

  // Auto-open 4-Step Wizard when deep-linked from Properties & Units
  useEffect(() => {
    if (!leasingWizardUnitId || !state) return;
    const unit = state.units.find((u) => u.id === leasingWizardUnitId);
    if (unit) {
      setTab('contracts');
      setContractForm((prev) => ({
        ...prev,
        unitId: unit.id,
        tenantId: unit.linkedTenantId || prev.tenantId || state.tenants[0]?.id || '',
        annualRent: unit.suggestedAnnualRent || prev.annualRent,
        officeFee: unit.officeFee || prev.officeFee,
      }));
      setWizardStep(1);
      setScannedLeaseDoc(null);
      setShowNewContract(true);
    }
    setLeasingWizardUnitId(null);
  }, [leasingWizardUnitId, state, setLeasingWizardUnitId]);

  const schedulePreview = useMemo(() => {
    const freqMap: Record<PaymentFrequency, number> = {
      شهري: 12,
      'ربع سنوي': 4,
      'نصف سنوي': 2,
      سنوي: 1,
    };
    const count = freqMap[contractForm.paymentFrequency] || 2;
    const annual = Number(contractForm.annualRent) || 0;
    const perInst = Math.round((annual / count) * 100) / 100;
    const start = new Date(contractForm.startDate || '2026-11-15');
    return Array.from({ length: count }, (_, idx) => {
      const due = new Date(start);
      if (!Number.isNaN(due.getTime())) {
        due.setMonth(due.getMonth() + idx * (12 / count));
      }
      const amt = idx === count - 1 ? Math.round((annual - perInst * (count - 1)) * 100) / 100 : perInst;
      return {
        number: idx + 1,
        dueDate: Number.isNaN(due.getTime()) ? contractForm.startDate : due.toISOString().slice(0, 10),
        amount: amt,
      };
    });
  }, [contractForm.annualRent, contractForm.paymentFrequency, contractForm.startDate]);

  if (!state) return null;

  const availableUnits = state.units.filter((u) => u.status !== 'مؤجرة' && u.status !== 'مؤرشفة');

  const handleLeaseOcrFill = async (file: File) => {
    setIsLeaseOcrBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await runGeminiOcrExtraction({
        userId: currentUser?.id || 'usr-gm',
        dataUrl,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
        categoryHint: 'عقود إيجار',
        autoSync: false,
      });
      const ext = res.extracted;
      setScannedLeaseDoc({
        dataUrl,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        extracted: ext,
      });
      setContractForm((prev) => ({
        ...prev,
        ejarNumber: ext.ejarNumber || prev.ejarNumber,
        startDate: ext.startDate || prev.startDate,
        endDate: ext.endDate || prev.endDate,
        annualRent: ext.annualRent && ext.annualRent > 0 ? ext.annualRent : prev.annualRent,
        securityDeposit: ext.securityDeposit && ext.securityDeposit >= 0 ? ext.securityDeposit : prev.securityDeposit,
        paymentFrequency: ext.paymentFrequency || prev.paymentFrequency,
        currency: ext.currency || prev.currency,
      }));
      pushToast(
        'success',
        lang === 'ar' ? 'تم مسح العقد بـ Gemini OCR وتعبئة التواريخ والقيمة تلقائياً' : 'Lease details extracted via OCR'
      );
    } catch (err) {
      pushToast('error', (err as Error).message);
    } finally {
      setIsLeaseOcrBusy(false);
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = contractForm.unitId || availableUnits[0]?.id;
    const tenantId = contractForm.tenantId || state.tenants[0]?.id;
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit || !tenantId) return;

    const res = await mutate<{ contract?: LeaseContract }>(
      'POST',
      '/api/contracts',
      {
        ...contractForm,
        propertyId: unit.propertyId,
        unitId,
        tenantId,
      },
      { offlineDescAr: `إنشاء عقد للوحدة ${unit.unitNumber}` }
    );
    if (res) {
      if (scannedLeaseDoc && res.contract) {
        await mutate('POST', '/api/documents', {
          title: `عقد إيجار - ${res.contract.internalNumber}`,
          category: 'عقود إيجار',
          fileName: scannedLeaseDoc.fileName,
          fileType: scannedLeaseDoc.mimeType.includes('pdf') ? 'PDF' : 'JPG',
          fileSizeKb: scannedLeaseDoc.sizeKb,
          relatedType: 'عقد',
          relatedId: res.contract.id,
          version: 1,
          dataUrl: scannedLeaseDoc.dataUrl,
          ocrStatus: 'تم الاستخراج آلياً',
          ocrRawText: scannedLeaseDoc.extracted.rawText,
          ocrExtracted: scannedLeaseDoc.extracted,
          accessLog: [],
        });
      }
      pushToast('success', lang === 'ar' ? 'تم إنشاء العقد وتوليد جدول الاستحقاقات تلقائياً' : 'Contract & installments created');
      setScannedLeaseDoc(null);
      setWizardStep(1);
      setShowNewContract(false);
    }
  };

  const handleUpdateEjar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEjar) return;
    const res = await mutate(
      'PATCH',
      `/api/contracts/${editingEjar.id}/ejar`,
      ejarEditForm,
      { offlineDescAr: `توثيق العقد ${editingEjar.internalNumber}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تم تحديث حالة التوثيق في إيجار وإصدار نسخة جديدة' : 'Ejar status updated');
      setEditingEjar(null);
    }
  };

  const handleCreateHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    const ctr = state.contracts.find((c) => c.id === (handoverForm.contractId || state.contracts[0]?.id));
    if (!ctr) return;
    const res = await mutate(
      'POST',
      '/api/handovers',
      {
        contractId: ctr.id,
        unitId: ctr.unitId,
        propertyId: ctr.propertyId,
        type: handoverForm.type,
        date: handoverForm.date,
        keysReturned: handoverForm.keysReturned,
        acRemotesReturned: handoverForm.acRemotesReturned,
        electricityReading: handoverForm.electricityReading,
        waterReading: handoverForm.waterReading,
        damageCost: handoverForm.damageCost,
        unpaidRentDue: handoverForm.unpaidRentDue,
        depositHeld: ctr.securityDeposit,
        checklist: [
          { item: 'الأبواب والأقفال', status: handoverForm.doorsOk ? 'سليم' : 'تالف' },
          { item: 'المكيفات والريموتات', status: handoverForm.acOk ? 'سليم' : 'يحتاج صيانة' },
          { item: 'السباكة والإنارة', status: handoverForm.plumbingOk ? 'سليم' : 'يحتاج صيانة' },
          { item: 'النظافة العامة', status: handoverForm.cleaningOk ? 'سليم' : 'يحتاج صيانة' },
        ],
      },
      { offlineDescAr: `محضر ${handoverForm.type}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تم إنشاء محضر الفحص وبانتظار الاعتماد' : 'Handover inspection created');
      setShowHandoverModal(false);
      setTab('handovers');
    }
  };

  const handleApproveHandover = async (handoverId: string, nextUnitStatus: UnitStatus) => {
    const res = await mutate(
      'POST',
      `/api/handovers/${handoverId}/approve`,
      { nextUnitStatus },
      { offlineDescAr: 'اعتماد محضر استلام وإخلاء' }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? `تم اعتماد المحضر وتحويل الوحدة إلى ${nextUnitStatus}` : 'Handover approved');
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ruleForm.channels.length === 0) {
      pushToast('error', lang === 'ar' ? 'يرجى اختيار قناة إرسال واحدة على الأقل' : 'Select at least one channel');
      return;
    }
    const res = await mutate(
      'POST',
      '/api/reminders/rules',
      {
        ...ruleForm,
        contractId: ruleForm.contractId === 'all' ? undefined : ruleForm.contractId,
        enabled: true,
      },
      { offlineDescAr: `جدولة تنبيه ${ruleForm.nameAr}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تمت إضافة قاعدة جدولة التنبيهات التلقائية' : 'Reminder schedule created');
      setShowNewRuleModal(false);
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    await mutate('PATCH', `/api/reminders/rules/${ruleId}`, { enabled });
  };

  const handleDeleteRule = async (ruleId: string) => {
    await mutate('DELETE', `/api/reminders/rules/${ruleId}`);
  };

  const handleRunScheduler = async (opts?: {
    contractId?: string;
    ruleId?: string;
    channels?: ReminderChannel[];
    customMessage?: string;
  }) => {
    const res = await mutate<{ count?: number }>(
      'POST',
      '/api/reminders/run',
      opts || {},
      { offlineDescAr: 'تشغيل تنبيهات الإيجار التلقائية' }
    );
    if (res) {
      const cnt = res.count ?? 0;
      pushToast(
        cnt > 0 ? 'success' : 'info',
        lang === 'ar'
          ? cnt > 0
            ? `تم إرسال ${cnt} تنبيه استحقاق عبر القنوات المحددة وتوثيقه في السجل`
            : 'لا توجد أقساط مطابقة لنطاق الجدولة المحدد حالياً'
          : `Dispatched ${cnt} reminder notifications`
      );
      if (opts?.contractId) setReminderContract(null);
    }
  };

  const openContractReminder = (contract: LeaseContract) => {
    const tenant = state.tenants.find((t) => t.id === contract.tenantId);
    const unit = state.units.find((u) => u.id === contract.unitId);
    const nextInst = state.installments
      .filter((i) => i.contractId === contract.id && i.remainingAmount > 0 && i.status !== 'ملغاة')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const curr = nextInst?.currency || contract.currency || 'SAR';
    const amountTxt = nextInst ? formatInCurrency(nextInst.remainingAmount, curr) : formatInCurrency(0, curr);
    setContractReminderMsg(
      lang === 'ar'
        ? `مرحباً ${tenant?.nameAr || ''}، نذكركم بموعد استحقاق القسط #${nextInst?.installmentNumber || 1} للعقد ${contract.internalNumber} (الوحدة ${unit?.unitNumber || ''}) بمبلغ ${amountTxt} بتاريخ ${nextInst?.dueDate || contract.endDate}.`
        : `Hello ${tenant?.nameEn || ''}, reminder for installment #${nextInst?.installmentNumber || 1} on contract ${contract.internalNumber} (Unit ${unit?.unitNumber || ''}) of ${amountTxt} due ${nextInst?.dueDate || contract.endDate}.`
    );
    setReminderContract(contract);
  };

  const openRenewModal = (contract: LeaseContract) => {
    const oldEnd = new Date(`${contract.endDate}T00:00:00Z`);
    const nextStart = new Date(oldEnd.getTime() + 86400000);
    const nextEnd = new Date(nextStart);
    nextEnd.setFullYear(nextEnd.getFullYear() + 1);
    nextEnd.setDate(nextEnd.getDate() - 1);
    setRenewForm({
      startDate: nextStart.toISOString().slice(0, 10),
      endDate: nextEnd.toISOString().slice(0, 10),
      annualRent: contract.annualRent,
      currency: contract.currency || 'SAR',
      paymentFrequency: contract.paymentFrequency,
      ejarNumber: '',
      notes: `تجديد مباشر للعقد ${contract.internalNumber}`,
    });
    setRenewTarget(contract);
  };

  const handleRenewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewTarget) return;
    const res = await mutate<{ contract?: LeaseContract }>(
      'POST',
      `/api/contracts/${renewTarget.id}/renew`,
      renewForm,
      { offlineDescAr: `تجديد العقد ${renewTarget.internalNumber}` }
    );
    if (res) {
      pushToast(
        'success',
        lang === 'ar'
          ? `تم تجديد العقد إلى ${res.contract?.internalNumber || ''} وتوليد الأقساط الجديدة دون تكرار الإدخال`
          : 'Contract renewed cleanly'
      );
      setRenewTarget(null);
    }
  };

  const toggleRuleChannel = (ch: ReminderChannel) => {
    setRuleForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((x) => x !== ch) : [...f.channels, ch],
    }));
  };

  const toggleContractChannel = (ch: ReminderChannel) => {
    setContractReminderChannels((prev) => (prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch]));
  };

  const reminderRules = state.reminderRules || [];
  const reminderLogs = state.reminderLogs || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.06]">
          <button
            onClick={() => setTab('contracts')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              tab === 'contracts' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {lang === 'ar' ? `العقود ومنصة إيجار (${state.contracts.length})` : `Contracts & Ejar (${state.contracts.length})`}
          </button>
          <button
            onClick={() => setTab('handovers')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              tab === 'handovers' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {lang === 'ar' ? `الإخلاء ومحاضر الاستلام (${state.handovers.length})` : `Handovers & Eviction (${state.handovers.length})`}
          </button>
          <button
            onClick={() => setTab('reminders')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 ${
              tab === 'reminders' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? `جدولة التنبيهات (${reminderRules.length})` : `Rent Reminders (${reminderRules.length})`}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PrintViewButton />
          <CreateTaskQuickButton
            defaultType="تأجير"
            defaultTitle="متابعة توثيق عقد إيجار ومحضر التسليم"
            relatedLabel="قسم العقود والتأجير"
            compact
          />
          {hasPermission('manage_contracts') && tab === 'contracts' && (
            <button
              onClick={() => {
                const defaultUnit = availableUnits[0];
                if (defaultUnit) {
                  setContractForm((prev) => ({
                    ...prev,
                    unitId: prev.unitId || defaultUnit.id,
                    annualRent: prev.annualRent || defaultUnit.suggestedAnnualRent,
                  }));
                }
                setWizardStep(1);
                setShowNewContract(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'معالج تأجير وحدة (4 خطوات)' : 'New Lease Wizard (4 Steps)'}</span>
            </button>
          )}
          {hasPermission('manage_properties') && tab === 'handovers' && (
            <button
              onClick={() => setShowHandoverModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer whitespace-nowrap"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'محضر إخلاء / استلام جديد' : 'New Handover Inspection'}</span>
            </button>
          )}
          {hasPermission('manage_contracts') && tab === 'reminders' && (
            <>
              <button
                onClick={() => handleRunScheduler()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'تشغيل الجدولة الآن' : 'Run Scheduler Now'}</span>
              </button>
              <button
                onClick={() => setShowNewRuleModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'قاعدة تنبيه جديدة' : 'New Reminder Rule'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {tab === 'contracts' ? (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'العقد / الإصدار' : 'Contract'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'الوحدة والمستأجر' : 'Unit & Tenant'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'المدة والدورية' : 'Term & Freq'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'القيمة السنوية' : 'Annual Rent'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'الحالة الإدارية' : 'Lifecycle'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'توثيق إيجار' : 'Ejar Official'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {state.contracts.map((c) => {
                const unit = state.units.find((u) => u.id === c.unitId);
                const prop = state.properties.find((p) => p.id === c.propertyId);
                const tenant = state.tenants.find((t) => t.id === c.tenantId);
                return (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4">
                      <div className="font-mono-num font-semibold">{c.internalNumber}</div>
                      <div className="text-[11px] text-slate-500">إصدار {c.version}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold">{tenant?.nameAr || '—'}</div>
                      <div className="text-[11px] text-slate-500">
                        {prop?.nameAr} · {unit?.unitNumber}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono-num">
                        {c.startDate} ← {c.endDate}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {c.paymentFrequency} ({c.installmentsCount} دفعات)
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-num">
                      <div className="font-bold text-[#26478D] dark:text-blue-400">
                        {formatInCurrency(c.annualRent, c.currency || 'SAR')}
                      </div>
                      {(c.currency || 'SAR') !== baseCurrency && (
                        <div className="text-[11px] text-slate-500">
                          ≈ {formatConvertedBase(c.annualRent, c.currency || 'SAR')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold">{c.lifecycleStatus}</td>
                    <td className="py-3 px-4">
                      <div className={c.ejarStatus === 'موثق في إيجار' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
                        {c.ejarStatus}
                      </div>
                      <div className="text-[11px] font-mono-num text-slate-500">{c.ejarNumber || '—'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasPermission('manage_contracts') && (
                          <button
                            onClick={() => {
                              setEditingEjar(c);
                              setEjarEditForm({
                                ejarNumber: c.ejarNumber,
                                ejarStatus: c.ejarStatus,
                                lifecycleStatus: c.lifecycleStatus,
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-[11px] font-medium cursor-pointer whitespace-nowrap"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'تحديث إيجار' : 'Ejar'}</span>
                          </button>
                        )}
                        <button
                          onClick={() => openContractReminder(c)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300/70 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-[11px] font-medium cursor-pointer whitespace-nowrap"
                        >
                          <BellRing className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'تنبيه / جدولة' : 'Remind'}</span>
                        </button>
                        {hasPermission('manage_contracts') && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التجديد') && (
                          <button
                            onClick={() => openRenewModal(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300/70 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] font-medium cursor-pointer whitespace-nowrap"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'تجديد سريع' : 'Renew'}</span>
                          </button>
                        )}
                        {hasPermission('manage_contracts') && !c.archivedAt && (
                          <MoveToArchiveButton
                            category="contracts"
                            entityId={c.id}
                            entityLabel={c.internalNumber}
                            compact
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : tab === 'handovers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {state.handovers.map((h) => {
            const unit = state.units.find((u) => u.id === h.unitId);
            const prop = state.properties.find((p) => p.id === h.propertyId);
            return (
              <div key={h.id} className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 font-mono-num">
                      {h.type} · {h.date}
                    </div>
                    <div className="text-base font-bold mt-0.5">
                      {prop?.nameAr} · {unit?.unitNumber}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold ${h.status === 'معتمد' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {h.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-num p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10">
                  <div>مفاتيح: {h.keysReturned}</div>
                  <div>ريموتات: {h.acRemotesReturned}</div>
                  <div>كهرباء: {h.electricityReading}</div>
                  <div>مياه: {h.waterReading}</div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs">
                  {h.checklist.map((item, idx) => (
                    <span key={idx} className="text-slate-600 dark:text-slate-300">
                      {item.item}: <strong className={item.status === 'سليم' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{item.status}</strong>
                    </span>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-mono-num">
                    التأمين: {formatSar(h.depositHeld, lang)} · التلفيات: {formatSar(h.damageCost, lang)} · الصافي:{' '}
                    <strong className="text-[#26478D] dark:text-blue-400">{formatSar(h.netRefundOrDue, lang)}</strong>
                  </div>
                  {h.status !== 'معتمد' && hasPermission('approve_expense_supervisor') && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleApproveHandover(h.id, 'تحتاج إلى تنظيف')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>اعتماد ← تنظيف</span>
                      </button>
                      <button
                        onClick={() => handleApproveHandover(h.id, 'شاغرة')}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-medium cursor-pointer"
                      >
                        اعتماد ← شاغرة
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tab 3: Automated Rent Due Reminder Scheduler */
        <div className="space-y-6">
          {/* Active Scheduling Rules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {reminderRules.map((rule) => {
              const linkedCtr = rule.contractId ? state.contracts.find((c) => c.id === rule.contractId) : null;
              return (
                <div key={rule.id} className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold">{lang === 'ar' ? rule.nameAr : rule.nameEn}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {rule.daysBeforeDue === 0
                          ? lang === 'ar'
                            ? 'عند الاستحقاق أو التأخير'
                            : 'On due date & overdue'
                          : lang === 'ar'
                          ? `قبل موعد الاستحقاق بـ ${rule.daysBeforeDue} أيام`
                          : `${rule.daysBeforeDue} days before due`}
                        {' · '}
                        {linkedCtr ? `${lang === 'ar' ? 'عقد' : 'Contract'} ${linkedCtr.internalNumber}` : lang === 'ar' ? 'جميع العقود النشطة' : 'All Active Contracts'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 no-print">
                      <button
                        onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                          rule.enabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {rule.enabled ? (lang === 'ar' ? 'مفعّلة' : 'Active') : lang === 'ar' ? 'متوقفة' : 'Paused'}
                      </button>
                      {hasPermission('manage_contracts') && (
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                          title={lang === 'ar' ? 'حذف القاعدة' : 'Delete rule'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {rule.channels.map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200"
                      >
                        {ch === 'بريد إلكتروني' ? <Mail className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                        <span>{ch}</span>
                      </span>
                    ))}
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300">
                    {lang === 'ar' ? rule.templateAr : rule.templateEn}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span className="font-mono-num">
                      {rule.lastRunAt ? `${lang === 'ar' ? 'آخر تشغيل:' : 'Last run:'} ${formatDateTime(rule.lastRunAt, lang)}` : lang === 'ar' ? 'لم تُشغل بعد' : 'Not run yet'}
                    </span>
                    <button
                      onClick={() => handleRunScheduler({ ruleId: rule.id })}
                      className="no-print inline-flex items-center gap-1 text-[#26478D] dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>{lang === 'ar' ? 'تنفيذ هذه القاعدة' : 'Run Rule'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reminder Dispatch Log Table */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {lang === 'ar' ? `سجل التنبيهات المرسلة والمجدولة (${reminderLogs.length})` : `Dispatched & Scheduled Reminders (${reminderLogs.length})`}
              </h3>
            </div>
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'المستأجر / القناة' : 'Tenant / Channel'}</th>
                  <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'العقد والاستحقاق' : 'Contract & Due'}</th>
                  <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'نص الرسالة' : 'Message Preview'}</th>
                  <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'الحالة والوقت' : 'Status & Time'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {reminderLogs.map((log) => {
                  const ctr = state.contracts.find((c) => c.id === log.contractId);
                  const cleanPhone = log.recipient.replace(/\D/g, '').replace(/^0/, '966');
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <div className="font-semibold">{log.tenantName}</div>
                        <div className="text-[11px] text-slate-500">
                          {log.channel} · <span className="font-mono-num">{log.recipient}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono-num font-semibold">{ctr?.internalNumber || log.contractId}</div>
                        <div className="text-[11px] font-mono-num text-slate-500">
                          {log.dueDate} · {formatInCurrency(log.amount, log.currency)}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">{log.messagePreview}</div>
                        {log.channel === 'واتساب' && cleanPhone && (
                          <a
                            href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(log.messagePreview)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="no-print inline-block mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            {lang === 'ar' ? 'فتح في واتساب ↗' : 'Open WhatsApp ↗'}
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-emerald-600 dark:text-emerald-400 font-semibold">{log.status}</div>
                        <div className="text-[10px] font-mono-num text-slate-400">{formatDateTime(log.sentAt, lang)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4-Step Sequential Leasing Wizard Modal */}
      {showNewContract && (() => {
        const chosenUnitId = contractForm.unitId || availableUnits[0]?.id || '';
        const chosenUnit = state.units.find((u) => u.id === chosenUnitId);
        const chosenProp = state.properties.find((p) => p.id === chosenUnit?.propertyId);
        const chosenTenantId = contractForm.tenantId || state.tenants[0]?.id || '';
        const chosenTenant = state.tenants.find((t) => t.id === chosenTenantId);
        const wizardSteps = [
          { id: 1 as const, label: lang === 'ar' ? '1. الوحدة والمستأجر' : '1. Unit & Tenant' },
          { id: 2 as const, label: lang === 'ar' ? '2. المستندات والفحص' : '2. Docs & Checks' },
          { id: 3 as const, label: lang === 'ar' ? '3. المالية والأقساط' : '3. Financials' },
          { id: 4 as const, label: lang === 'ar' ? '4. المراجعة والتأكيد' : '4. Review & Confirm' },
        ];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
            <form
              onSubmit={handleCreateContract}
              className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-5 my-auto shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold">
                    {lang === 'ar' ? 'معالج تأجير وحدة وإصدار العقد (4 خطوات)' : 'Sequential Leasing Wizard (4 Steps)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {chosenProp ? `${chosenProp.nameAr} · وحدة ${chosenUnit?.unitNumber || ''}` : lang === 'ar' ? 'خطوات متسلسلة من الاختيار إلى جدول الدفعات' : 'Step-by-step leasing & installment schedule'}
                  </p>
                </div>
                <button type="button" onClick={() => setShowNewContract(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress Stepper Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {wizardSteps.map((s) => {
                  const active = wizardStep === s.id;
                  const done = wizardStep > s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setWizardStep(s.id)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-semibold text-start border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#26478D] text-white border-[#26478D]'
                          : done
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {s.label} {done ? '✓' : ''}
                    </button>
                  );
                })}
              </div>

              {/* Step 1: Unit, Tenant & Dates */}
              {wizardStep === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'الوحدة المتاحة' : 'Available Unit'}</label>
                    <select
                      value={chosenUnitId}
                      onChange={(e) => {
                        const u = state.units.find((x) => x.id === e.target.value);
                        setContractForm({
                          ...contractForm,
                          unitId: e.target.value,
                          annualRent: u?.suggestedAnnualRent || contractForm.annualRent,
                          tenantId: u?.linkedTenantId || contractForm.tenantId,
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                    >
                      {availableUnits.map((u) => {
                        const pr = state.properties.find((p) => p.id === u.propertyId);
                        return (
                          <option key={u.id} value={u.id}>
                            {pr?.nameAr} · {u.unitNumber} ({u.status})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'المستأجر' : 'Tenant'}</label>
                    <select
                      value={chosenTenantId}
                      onChange={(e) => setContractForm({ ...contractForm, tenantId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                    >
                      {state.tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nameAr} ({t.nationalIdOrIqama})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'تاريخ بداية العقد' : 'Start Date'}</label>
                    <input
                      type="date"
                      value={contractForm.startDate}
                      onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'تاريخ نهاية العقد' : 'End Date'}</label>
                    <input
                      type="date"
                      value={contractForm.endDate}
                      onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'رقم عقد إيجار الرسمي (اختياري)' : 'Ejar Official No.'}</label>
                    <input
                      placeholder="EJ-2026-..."
                      value={contractForm.ejarNumber}
                      onChange={(e) => setContractForm({ ...contractForm, ejarNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'حالة التوثيق والتنفيذ' : 'Lifecycle Status'}</label>
                    <select
                      value={contractForm.lifecycleStatus}
                      onChange={(e) =>
                        setContractForm({
                          ...contractForm,
                          lifecycleStatus: e.target.value as ContractLifecycleStatus,
                          ejarStatus: e.target.value === 'نشط' ? 'موثق في إيجار' : 'قيد التوثيق',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                    >
                      <option value="بانتظار التوثيق">بانتظار التوثيق</option>
                      <option value="نشط">نشط وموثق</option>
                      <option value="مسودة">مسودة</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 2: Documents (Gemini OCR) & Readiness Checklist */}
              {wizardStep === 2 && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'رفع ومسح عقد إيجار آلياً (Gemini OCR)' : 'Scan / Upload Lease for OCR Auto-Fill'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {scannedLeaseDoc
                          ? `${lang === 'ar' ? 'تم إرفاق:' : 'Attached:'} ${scannedLeaseDoc.fileName} ✓`
                          : lang === 'ar'
                          ? 'يُستخرج رقم العقد والتواريخ والقيمة ويُحفظ تلقائياً في الأرشيف'
                          : 'Extracts dates/rent and archives automatically upon confirmation'}
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer">
                      {isLeaseOcrBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{lang === 'ar' ? 'إرفاق صورة العقد' : 'Upload Lease'}</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        disabled={isLeaseOcrBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleLeaseOcrFill(f);
                        }}
                      />
                    </label>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-2.5">
                    <div className="font-semibold">
                      {lang === 'ar' ? 'قائمة جاهزية التسليم المبدئي للوحدة' : 'Pre-Lease Handover Readiness'}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardChecks.metersVerified}
                        onChange={(e) => setWizardChecks({ ...wizardChecks, metersVerified: e.target.checked })}
                      />
                      <span>
                        {lang === 'ar'
                          ? `توثيق عداد الكهرباء (${chosenUnit?.electricityMeter || '—'}) والمياه (${chosenUnit?.waterMeter || '—'})`
                          : 'Verified electricity & water meter readings'}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardChecks.keysReady}
                        onChange={(e) => setWizardChecks({ ...wizardChecks, keysReady: e.target.checked })}
                      />
                      <span>
                        {lang === 'ar'
                          ? `تجهيز ${chosenUnit?.keyCount || 0} مفاتيح و ${chosenUnit?.acRemoteCount || 0} ريموتات للتسليم`
                          : 'Keys and AC remotes prepared for handover'}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardChecks.cleanReady}
                        onChange={(e) => setWizardChecks({ ...wizardChecks, cleanReady: e.target.checked })}
                      />
                      <span>{lang === 'ar' ? 'فحص النظافة والجاهزية التشغيلية قبل التوقيع' : 'Unit cleaned and inspected ready for move-in'}</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Step 3: Financials & Live Installment Schedule Preview */}
              {wizardStep === 3 && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'الإيجار السنوي' : 'Annual Rent'}</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={contractForm.annualRent}
                        onChange={(e) => setContractForm({ ...contractForm, annualRent: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'العملة' : 'Currency'}</label>
                      <select
                        value={contractForm.currency}
                        onChange={(e) => setContractForm({ ...contractForm, currency: e.target.value as CurrencyCode })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                      >
                        {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                          <option key={code} value={code}>
                            {lang === 'ar' ? CURRENCY_META[code].labelAr : CURRENCY_META[code].labelEn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">{lang === 'ar' ? 'دورية السداد' : 'Frequency'}</label>
                      <select
                        value={contractForm.paymentFrequency}
                        onChange={(e) => setContractForm({ ...contractForm, paymentFrequency: e.target.value as PaymentFrequency })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                      >
                        <option value="شهري">شهري (12 دفعة)</option>
                        <option value="ربع سنوي">ربع سنوي (4 دفعات)</option>
                        <option value="نصف سنوي">نصف سنوي (دفعتان)</option>
                        <option value="سنوي">سنوي (دفعة واحدة)</option>
                      </select>
                    </div>
                  </div>

                  {/* Progressive Disclosure for Additional Fees */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowExtraFees((v) => !v)}
                      className="w-full px-3.5 py-2 flex items-center justify-between font-semibold bg-slate-50 dark:bg-white/[0.03] cursor-pointer"
                    >
                      <span>{lang === 'ar' ? 'الرسوم الإضافية: التأمين، السعي، وعمولة الإدارة' : 'Deposit, Office Fee & Commission %'}</span>
                      {showExtraFees ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showExtraFees && (
                      <div className="p-3 grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">مبلغ التأمين</label>
                          <input
                            type="number"
                            value={contractForm.securityDeposit}
                            onChange={(e) => setContractForm({ ...contractForm, securityDeposit: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">رسوم المكتب / السعي</label>
                          <input
                            type="number"
                            value={contractForm.officeFee}
                            onChange={(e) => setContractForm({ ...contractForm, officeFee: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">عمولة الإدارة %</label>
                          <input
                            type="number"
                            value={contractForm.managementCommissionPercent}
                            onChange={(e) => setContractForm({ ...contractForm, managementCommissionPercent: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Live Generated Installment Schedule Preview */}
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] space-y-2">
                    <div className="flex items-center justify-between font-semibold">
                      <span>
                        {lang === 'ar'
                          ? `معاينة جدول الاستحقاقات التلقائي (${schedulePreview.length} دفعات)`
                          : `Live Schedule Preview (${schedulePreview.length} installments)`}
                      </span>
                      <span className="font-mono-num text-[#26478D] dark:text-blue-400">
                        {formatInCurrency(contractForm.annualRent, contractForm.currency)}
                      </span>
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-200/70 dark:divide-white/5">
                      {schedulePreview.map((item) => (
                        <div key={item.number} className="py-1.5 flex items-center justify-between text-[11px] font-mono-num">
                          <span>
                            {lang === 'ar' ? `القسط #${item.number}` : `Installment #${item.number}`} · {item.dueDate}
                          </span>
                          <span className="font-bold">{formatInCurrency(item.amount, contractForm.currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Final Review & Confirmation */}
              {wizardStep === 4 && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] space-y-3 text-xs">
                  <div className="font-bold text-sm text-[#26478D] dark:text-blue-400">
                    {lang === 'ar' ? 'ملخص المراجعة النهائية قبل إصدار العقد والأقساط' : 'Final Contract Review Summary'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-slate-500 block">العقار والوحدة</span>
                      <strong>
                        {chosenProp?.nameAr} · {chosenUnit?.unitNumber}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">المستأجر</span>
                      <strong>{chosenTenant?.nameAr || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">المدة التعاقدية</span>
                      <strong className="font-mono-num">
                        {contractForm.startDate} ← {contractForm.endDate}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">الحالة والتوثيق</span>
                      <strong>
                        {contractForm.lifecycleStatus} {contractForm.ejarNumber ? `(${contractForm.ejarNumber})` : ''}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">الإيجار السنوي وعدد الدفعات</span>
                      <strong className="font-mono-num text-emerald-600 dark:text-emerald-400">
                        {formatInCurrency(contractForm.annualRent, contractForm.currency)} · {schedulePreview.length} دفعات ({contractForm.paymentFrequency})
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">المستندات والجاهزية</span>
                      <strong>
                        {scannedLeaseDoc ? 'نسخة عقد مرفقة (OCR) ✓' : 'بدون مرفق'} ·{' '}
                        {wizardChecks.metersVerified && wizardChecks.keysReady ? 'الفحص مكتمل ✓' : 'فحص جزئي'}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Wizard Footer Navigation */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => (wizardStep > 1 ? setWizardStep((s) => (s - 1) as 1 | 2 | 3 | 4) : setShowNewContract(false))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer"
                >
                  {wizardStep > 1 && <ArrowRight className="w-3.5 h-3.5" />}
                  <span>{wizardStep === 1 ? (lang === 'ar' ? 'إلغاء' : 'Cancel') : lang === 'ar' ? 'السابق' : 'Back'}</span>
                </button>

                {wizardStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
                  >
                    <span>{lang === 'ar' ? 'التالي' : 'Next'}</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'اعتماد وإصدار العقد وجدول الدفعات' : 'Issue Contract & Schedule'}</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        );
      })()}

      {/* Update Ejar Modal */}
      {editingEjar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleUpdateEjar}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">توثيق وتحديث حالة إيجار ({editingEjar.internalNumber})</h3>
              <button type="button" onClick={() => setEditingEjar(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <input
                placeholder="رقم عقد إيجار الرسمي (EJ-...)"
                value={ejarEditForm.ejarNumber}
                onChange={(e) => setEjarEditForm({ ...ejarEditForm, ejarNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <select
                value={ejarEditForm.ejarStatus}
                onChange={(e) => setEjarEditForm({ ...ejarEditForm, ejarStatus: e.target.value as EjarStatus })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="غير موثق">غير موثق</option>
                <option value="قيد التوثيق">قيد التوثيق</option>
                <option value="موثق في إيجار">موثق في إيجار</option>
                <option value="طلب إنهاء">طلب إنهاء</option>
              </select>
              <select
                value={ejarEditForm.lifecycleStatus}
                onChange={(e) => setEjarEditForm({ ...ejarEditForm, lifecycleStatus: e.target.value as ContractLifecycleStatus })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="مسودة">مسودة</option>
                <option value="بانتظار التوثيق">بانتظار التوثيق</option>
                <option value="نشط">نشط</option>
                <option value="بانتظار التجديد">بانتظار التجديد</option>
                <option value="منتهي">منتهي</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingEjar(null)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                اعتماد الإصدار الجديد
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Handover / Eviction Modal */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateHandover}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">إعداد محضر فحص واستلام / إخلاء وحدة</h3>
              <button type="button" onClick={() => setShowHandoverModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <select
                value={handoverForm.contractId || state.contracts[0]?.id}
                onChange={(e) => setHandoverForm({ ...handoverForm, contractId: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {state.contracts.map((c) => {
                  const u = state.units.find((x) => x.id === c.unitId);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.internalNumber} · وحدة {u?.unitNumber}
                    </option>
                  );
                })}
              </select>
              <input
                type="number"
                placeholder="عدد المفاتيح المستلمة"
                value={handoverForm.keysReturned}
                onChange={(e) => setHandoverForm({ ...handoverForm, keysReturned: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                type="number"
                placeholder="عدد ريموتات المكيف"
                value={handoverForm.acRemotesReturned}
                onChange={(e) => setHandoverForm({ ...handoverForm, acRemotesReturned: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                type="number"
                placeholder="تكلفة الأضرار (ر.س)"
                value={handoverForm.damageCost}
                onChange={(e) => setHandoverForm({ ...handoverForm, damageCost: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                type="number"
                placeholder="إيجار متبقٍ عند الإخلاء"
                value={handoverForm.unpaidRentDue}
                onChange={(e) => setHandoverForm({ ...handoverForm, unpaidRentDue: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={handoverForm.doorsOk} onChange={(e) => setHandoverForm({ ...handoverForm, doorsOk: e.target.checked })} />
                <span>الأبواب والأقفال سليمة</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={handoverForm.acOk} onChange={(e) => setHandoverForm({ ...handoverForm, acOk: e.target.checked })} />
                <span>المكيفات سليمة</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={handoverForm.plumbingOk} onChange={(e) => setHandoverForm({ ...handoverForm, plumbingOk: e.target.checked })} />
                <span>السباكة والإنارة سليمة</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={handoverForm.cleaningOk} onChange={(e) => setHandoverForm({ ...handoverForm, cleaningOk: e.target.checked })} />
                <span>النظافة مكتملة</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowHandoverModal(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                إرسال للاعتماد والتسوية
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Reminder Schedule Rule Modal */}
      {showNewRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateRule}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">
                {lang === 'ar' ? 'إضافة قاعدة جدولة تنبيهات الإيجار' : 'New Rent Reminder Rule'}
              </h3>
              <button type="button" onClick={() => setShowNewRuleModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <input
                required
                placeholder="اسم القاعدة (مثال: تذكير قبل الاستحقاق بـ 5 أيام)"
                value={ruleForm.nameAr}
                onChange={(e) => setRuleForm({ ...ruleForm, nameAr: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">
                    {lang === 'ar' ? 'إرسال قبل الاستحقاق (بالأيام)' : 'Days before due'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={ruleForm.daysBeforeDue}
                    onChange={(e) => setRuleForm({ ...ruleForm, daysBeforeDue: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">
                    {lang === 'ar' ? 'نطاق العقود' : 'Target Contract'}
                  </label>
                  <select
                    value={ruleForm.contractId}
                    onChange={(e) => setRuleForm({ ...ruleForm, contractId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                  >
                    <option value="all">{lang === 'ar' ? 'جميع العقود النشطة' : 'All Active Contracts'}</option>
                    {state.contracts.map((c) => {
                      const ten = state.tenants.find((t) => t.id === c.tenantId);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.internalNumber} · {ten?.nameAr}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-1.5">{lang === 'ar' ? 'قنوات الإرسال:' : 'Channels:'}</div>
                <div className="flex flex-wrap gap-2">
                  {(['بريد إلكتروني', 'رسائل نصية SMS (محاكاة)', 'واتساب'] as ReminderChannel[]).map((ch) => (
                    <label
                      key={ch}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer ${
                        ruleForm.channels.includes(ch)
                          ? 'border-[#26478D] bg-[#26478D]/10 text-[#26478D] dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={ruleForm.channels.includes(ch)}
                        onChange={() => toggleRuleChannel(ch)}
                      />
                      <span>{ch}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">
                  {lang === 'ar' ? 'قالب التنبيه ({tenant}, {contract}, {unit}, {amount}, {dueDate})' : 'Message Template'}
                </label>
                <textarea
                  rows={3}
                  value={ruleForm.templateAr}
                  onChange={(e) => setRuleForm({ ...ruleForm, templateAr: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewRuleModal(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                {lang === 'ar' ? 'حفظ قاعدة الجدولة' : 'Save Schedule Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contract-Linked Reminder Quick Dispatch & Schedule Modal */}
      {reminderContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">
                  {lang === 'ar' ? `تنبيه استحقاق الإيجار — ${reminderContract.internalNumber}` : `Rent Reminder — ${reminderContract.internalNumber}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {state.tenants.find((t) => t.id === reminderContract.tenantId)?.nameAr} ·{' '}
                  {state.tenants.find((t) => t.id === reminderContract.tenantId)?.phone}
                </p>
              </div>
              <button type="button" onClick={() => setReminderContract(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-600 dark:text-slate-300">
                {lang === 'ar' ? 'اختر قنوات الإرسال الفوري / المجدول:' : 'Select Dispatch Channels:'}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['واتساب', 'بريد إلكتروني', 'رسائل نصية SMS (محاكاة)'] as ReminderChannel[]).map((ch) => (
                  <label
                    key={ch}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer ${
                      contractReminderChannels.includes(ch)
                        ? 'border-[#26478D] bg-[#26478D]/10 text-[#26478D] dark:text-blue-300 font-semibold'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={contractReminderChannels.includes(ch)}
                      onChange={() => toggleContractChannel(ch)}
                    />
                    <span>{ch}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <label className="text-[11px] text-slate-500 block">
                {lang === 'ar' ? 'نص رسالة التذكير' : 'Reminder Message'}
              </label>
              <textarea
                rows={3}
                value={contractReminderMsg}
                onChange={(e) => setContractReminderMsg(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRuleForm((f) => ({
                    ...f,
                    nameAr: `تذكير مجدول للعقد ${reminderContract.internalNumber}`,
                    contractId: reminderContract.id,
                  }));
                  setReminderContract(null);
                  setTab('reminders');
                  setShowNewRuleModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إنشاء قاعدة دورية لهذا العقد' : 'Create Recurring Rule'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReminderContract(null)}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer"
                >
                  {lang === 'ar' ? 'إغلاق' : 'Close'}
                </button>
                <button
                  type="button"
                  disabled={contractReminderChannels.length === 0}
                  onClick={() =>
                    handleRunScheduler({
                      contractId: reminderContract.id,
                      channels: contractReminderChannels,
                      customMessage: contractReminderMsg,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white hover:bg-[#1e3a75] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'إرسال التنبيه الآن' : 'Send Reminder Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fast Contract Renewal Modal */}
      {renewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleRenewContract}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">
                  {lang === 'ar' ? `تجديد سريع للعقد (${renewTarget.internalNumber})` : `Fast Contract Renewal`}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {state.tenants.find((t) => t.id === renewTarget.tenantId)?.nameAr} · وحدة{' '}
                  {state.units.find((u) => u.id === renewTarget.unitId)?.unitNumber}
                </p>
              </div>
              <button type="button" onClick={() => setRenewTarget(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">بداية الفترة الجديدة</label>
                <input
                  type="date"
                  required
                  value={renewForm.startDate}
                  onChange={(e) => setRenewForm({ ...renewForm, startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">نهاية الفترة الجديدة</label>
                <input
                  type="date"
                  required
                  value={renewForm.endDate}
                  onChange={(e) => setRenewForm({ ...renewForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                />
              </div>
              <input
                type="number"
                required
                value={renewForm.annualRent}
                onChange={(e) => setRenewForm({ ...renewForm, annualRent: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                placeholder="الإيجار السنوي الجديد"
              />
              <select
                value={renewForm.currency}
                onChange={(e) => setRenewForm({ ...renewForm, currency: e.target.value as CurrencyCode })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_META[code].labelAr}
                  </option>
                ))}
              </select>
              <select
                value={renewForm.paymentFrequency}
                onChange={(e) => setRenewForm({ ...renewForm, paymentFrequency: e.target.value as PaymentFrequency })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="شهري">شهري (12 دفعة)</option>
                <option value="ربع سنوي">ربع سنوي (4 دفعات)</option>
                <option value="نصف سنوي">نصف سنوي (دفعتان)</option>
                <option value="سنوي">سنوي (دفعة واحدة)</option>
              </select>
              <input
                placeholder="رقم عقد إيجار المجدد (اختياري)"
                value={renewForm.ejarNumber}
                onChange={(e) => setRenewForm({ ...renewForm, ejarNumber: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRenewTarget(null)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                اعتماد التجديد وتوليد الأقساط
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
