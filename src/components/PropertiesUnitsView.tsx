import React, { useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  LayoutGrid,
  List,
  Search,
  X,
  KeyRound,
  Wind,
  Zap,
  Droplets,
  UserPlus,
  Sparkles,
  Loader2,
  Upload,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Workflow,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Clock,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { OcrExtractedData, Property, PropertyOwnershipMode, PropertyType, Unit, UnitStatus, UnitType } from '../types/aqar';
import { formatSar } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { QrCodeSvg } from './QrCodeSvg';
import { PrintViewButton } from './PrintViewButton';
import { SwipeableRow } from './SwipeableRow';
import { MoveToArchiveButton } from './MoveToArchiveButton';
import { CreateTaskQuickButton } from './CreateTaskQuickModal';
import { readFileAsDataUrl, runGeminiOcrExtraction } from '../utils/ocrClient';
import unitApartmentImg from '../assets/images/unit_modern_apartment_1794682469428.jpg';
import unitVillaImg from '../assets/images/unit_luxury_villa_1794682469756.jpg';
import unitOfficeImg from '../assets/images/unit_commercial_office_1794682470533.jpg';

const UNIT_STATUSES: UnitStatus[] = [
  'شاغرة',
  'محجوزة',
  'قيد التأجير',
  'مؤجرة',
  'متأخرة في السداد',
  'تحت الصيانة',
  'بانتظار الاستلام',
  'تحتاج إلى تنظيف',
  'موقوفة',
  'مؤرشفة',
];

function getDefaultUnitImage(unitType: UnitType): string {
  switch (unitType) {
    case 'فيلا':
      return unitVillaImg;
    case 'مكتب':
    case 'معرض تجاري':
      return unitOfficeImg;
    default:
      return unitApartmentImg;
  }
}

function unitStatusTone(status: UnitStatus): string {
  switch (status) {
    case 'مؤجرة':
      return 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 border-emerald-500/25';
    case 'شاغرة':
      return 'text-blue-700 dark:text-blue-300 bg-blue-500/12 border-blue-500/25';
    case 'متأخرة في السداد':
    case 'موقوفة':
      return 'text-red-700 dark:text-red-300 bg-red-500/12 border-red-500/25';
    case 'تحت الصيانة':
    case 'تحتاج إلى تنظيف':
    case 'محجوزة':
    case 'قيد التأجير':
    case 'بانتظار الاستلام':
      return 'text-amber-700 dark:text-amber-300 bg-amber-500/12 border-amber-500/25';
    default:
      return 'text-slate-600 dark:text-slate-300 bg-slate-500/10 border-slate-500/20';
  }
}

function UnitStatusIcon({ status }: { status: UnitStatus }) {
  switch (status) {
    case 'مؤجرة':
      return <CheckCircle2 className="w-3 h-3 shrink-0" />;
    case 'شاغرة':
      return <KeyRound className="w-3 h-3 shrink-0" />;
    case 'متأخرة في السداد':
    case 'موقوفة':
      return <AlertTriangle className="w-3 h-3 shrink-0" />;
    case 'تحت الصيانة':
    case 'تحتاج إلى تنظيف':
      return <Wrench className="w-3 h-3 shrink-0" />;
    default:
      return <Clock className="w-3 h-3 shrink-0" />;
  }
}

export function PropertiesUnitsView() {
  const { state, currentUser, lang, hasPermission, mutate, pushToast, startLeasingWizardForUnit, setActiveNav } = useAqar();
  const [submittingProp, setSubmittingProp] = useState(false);
  const [submittingUnit, setSubmittingUnit] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [showAddProp, setShowAddProp] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showAdvancedProp, setShowAdvancedProp] = useState(false);
  const [showUnitTechDetails, setShowUnitTechDetails] = useState(false);
  const [nextStepPrompt, setNextStepPrompt] = useState<
    | { type: 'add-unit'; propertyId: string; propertyName: string }
    | { type: 'lease-unit'; unit: Unit; unitNumber: string }
    | null
  >(null);
  const [linkTenantId, setLinkTenantId] = useState('');
  const [isPropOcrBusy, setIsPropOcrBusy] = useState(false);
  const [scannedPropDoc, setScannedPropDoc] = useState<{
    dataUrl: string;
    mimeType: string;
    fileName: string;
    sizeKb: number;
    extracted: OcrExtractedData;
  } | null>(null);

  // Property form state
  const [propForm, setPropForm] = useState({
    companyId: 'comp-1',
    ownershipMode: 'إدارة للغير' as PropertyOwnershipMode,
    code: '',
    nameAr: '',
    nameEn: '',
    city: 'الرياض',
    district: '',
    street: '',
    nationalAddress: '',
    type: 'سكني' as PropertyType,
    deedNumber: '',
    buildingsCount: 1,
    floorsCount: 4,
    managementFeePercent: 5,
    ownerId: 'own-1',
    electricityMeterMain: '',
    waterMeterMain: '',
    caretakerName: '',
    caretakerPhone: '',
  });

  // Unit form state
  const [unitForm, setUnitForm] = useState({
    propertyId: '',
    buildingName: 'المبنى الرئيسي',
    floor: 1,
    unitNumber: '',
    unitType: 'شقة' as UnitType,
    areaSqm: 120,
    rooms: 3,
    bathrooms: 2,
    furnished: false,
    acCount: 4,
    electricityMeter: '',
    waterMeter: '',
    keyCount: 3,
    acRemoteCount: 4,
    suggestedMonthlyRent: 3800,
    suggestedAnnualRent: 45600,
    officeFee: 1100,
  });

  const filteredUnits = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    return state.units.filter((u) => {
      if (selectedPropertyId !== 'all' && u.propertyId !== selectedPropertyId) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (q) {
        const prop = state.properties.find((p) => p.id === u.propertyId);
        const ctr = state.contracts.find((c) => c.unitId === u.id && c.lifecycleStatus === 'نشط');
        const ten = state.tenants.find((t) => t.id === (ctr?.tenantId || u.linkedTenantId));
        const match =
          u.unitNumber.toLowerCase().includes(q) ||
          u.buildingName.toLowerCase().includes(q) ||
          (prop?.nameAr.toLowerCase().includes(q) ?? false) ||
          (ten?.nameAr.toLowerCase().includes(q) ?? false);
        if (!match) return false;
      }
      return true;
    });
  }, [state, selectedPropertyId, statusFilter, search]);

  if (!state) return null;

  const activeSelectedUnit = selectedUnit ? state.units.find((u) => u.id === selectedUnit.id) || null : null;

  const handlePropertyOcrFill = async (file: File) => {
    setIsPropOcrBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await runGeminiOcrExtraction({
        userId: currentUser?.id || 'usr-gm',
        dataUrl,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
        categoryHint: 'صكوك',
        autoSync: false,
      });
      const ext = res.extracted;
      setScannedPropDoc({
        dataUrl,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        extracted: ext,
      });
      setPropForm((prev) => ({
        ...prev,
        code: prev.code || `PRP-${Math.floor(100 + Math.random() * 899)}`,
        nameAr: ext.propertyNameAr || ext.buildingName || prev.nameAr,
        nameEn: prev.nameEn || ext.propertyNameAr || ext.buildingName || '',
        city: ext.city || prev.city,
        district: ext.district || prev.district,
        street: ext.street || prev.street,
        nationalAddress: ext.nationalAddress || prev.nationalAddress,
        deedNumber: ext.deedNumber || prev.deedNumber,
      }));
      pushToast('success', lang === 'ar' ? 'تم استخراج بيانات العقار والصك وتعبئة الحقول آلياً' : 'Property fields auto-filled from OCR');
    } catch (err) {
      pushToast('error', (err as Error).message);
    } finally {
      setIsPropOcrBusy(false);
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingProp || !propForm.nameAr.trim() || !propForm.code.trim()) return;
    setSubmittingProp(true);
    triggerHaptic('medium');
    try {
      const res = await mutate<{ property?: Property }>(
        'POST',
        '/api/properties',
        {
          ...propForm,
          status: 'نشط',
          ownerShares: [{ ownerId: propForm.ownerId, sharePercent: 100 }],
        },
        { offlineDescAr: `إضافة عقار ${propForm.nameAr}` }
      );
      if (res) {
        if (scannedPropDoc && res.property) {
          await mutate('POST', '/api/documents', {
            title: [scannedPropDoc.extracted.docType, res.property.nameAr].filter(Boolean).join(' - '),
            category: scannedPropDoc.extracted.docType === 'عقد إيجار' ? 'عقود إيجار' : 'صكوك',
            fileName: scannedPropDoc.fileName,
            fileType: scannedPropDoc.mimeType.includes('pdf') ? 'PDF' : 'JPG',
            fileSizeKb: scannedPropDoc.sizeKb,
            relatedType: 'عقار',
            relatedId: res.property.id,
            version: 1,
            dataUrl: scannedPropDoc.dataUrl,
            ocrStatus: 'تم الاستخراج آلياً',
            ocrRawText: scannedPropDoc.extracted.rawText,
            ocrExtracted: scannedPropDoc.extracted,
            accessLog: [],
          });
        }
        triggerHaptic('success');
        pushToast('success', lang === 'ar' ? 'تمت إضافة العقار بنجاح' : 'Property created');
        if (res.property) {
          setSelectedPropertyId(res.property.id);
          setNextStepPrompt({
            type: 'add-unit',
            propertyId: res.property.id,
            propertyName: lang === 'ar' ? res.property.nameAr : res.property.nameEn,
          });
        }
        setScannedPropDoc(null);
        setShowAddProp(false);
        setShowAdvancedProp(false);
      }
    } finally {
      setSubmittingProp(false);
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    const propertyId = unitForm.propertyId || state.properties[0]?.id;
    if (submittingUnit || !propertyId || !unitForm.unitNumber.trim()) return;
    setSubmittingUnit(true);
    triggerHaptic('medium');
    try {
      const res = await mutate<{ unit?: Unit }>(
        'POST',
        '/api/units',
        {
          ...unitForm,
          propertyId,
          status: 'شاغرة',
          vacantSince: new Date().toISOString().slice(0, 10),
        },
        { offlineDescAr: `إضافة وحدة ${unitForm.unitNumber}` }
      );
      if (res) {
        triggerHaptic('success');
        pushToast('success', lang === 'ar' ? 'تمت إضافة الوحدة بنجاح' : 'Unit added');
        if (res.unit) {
          setNextStepPrompt({
            type: 'lease-unit',
            unit: res.unit,
            unitNumber: res.unit.unitNumber,
          });
        }
        setShowAddUnit(false);
      }
    } finally {
      setSubmittingUnit(false);
    }
  };

  const handleStatusChange = async (unitId: string, nextStatus: UnitStatus) => {
    triggerHaptic('light');
    const res = await mutate(
      'PATCH',
      `/api/units/${unitId}/status`,
      { status: nextStatus, reason: 'تحديث تشغيلي من ملف الوحدة' },
      { offlineDescAr: `تغيير حالة وحدة إلى ${nextStatus}` }
    );
    if (res) {
      triggerHaptic('success');
      pushToast('success', lang === 'ar' ? 'تم تحديث حالة الوحدة' : 'Unit status updated');
    }
  };

  const handleLinkTenant = async (unitId: string) => {
    if (!linkTenantId) return;
    const res = await mutate(
      'POST',
      `/api/units/${unitId}/link-tenant`,
      { tenantId: linkTenantId },
      { offlineDescAr: 'ربط إداري لمستأجر بوحدة' }
    );
    if (res) {
      pushToast(
        'success',
        lang === 'ar'
          ? 'تم الربط الإداري للمستأجر كحجز مبدئي (لم يتم إنشاء عقد رسمي تلقائياً)'
          : 'Tenant administratively linked (no auto-contract created)'
      );
      setLinkTenantId('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Property Portfolio Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{lang === 'ar' ? 'المحفظة العقارية والمباني' : 'Property Portfolio'}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ar'
              ? `${state.properties.length} عقارات مسجلة · ${state.units.length} وحدة إجمالاً`
              : `${state.properties.length} properties · ${state.units.length} total units`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <PrintViewButton />
          {hasPermission('manage_properties') && (
            <>
              <button
                onClick={() => setShowAddProp(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'عقار جديد' : 'Add Property'}</span>
              </button>
              <button
                onClick={() => {
                  setUnitForm((f) => ({ ...f, propertyId: state.properties[0]?.id || '' }));
                  setShowAddUnit(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'وحدة جديدة' : 'Add Unit'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sequential Logical Flow Next-Step Banner */}
      {nextStepPrompt && (
        <div className="p-4 rounded-2xl border border-[#26478D]/35 bg-[#26478D]/[0.07] dark:bg-[#26478D]/20 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#26478D] text-white flex items-center justify-center shrink-0">
              <Workflow className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#26478D] dark:text-blue-300">
                {nextStepPrompt.type === 'add-unit'
                  ? lang === 'ar'
                    ? `الخطوة التالية المتسلسلة: إضافة وحدة داخل «${nextStepPrompt.propertyName}»`
                    : `Next Step: Add a unit to "${nextStepPrompt.propertyName}"`
                  : lang === 'ar'
                  ? `الخطوة التالية المتسلسلة: الوحدة «${nextStepPrompt.unitNumber}» جاهزة للتأجير`
                  : `Next Step: Unit "${nextStepPrompt.unitNumber}" is ready for leasing`}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                {nextStepPrompt.type === 'add-unit'
                  ? lang === 'ar'
                    ? 'تم حفظ العقار واختياره تلقائياً لتكملة بناء الوحدات دون إعادة اختيار.'
                    : 'Property saved and pre-selected so you can continue smoothly.'
                  : lang === 'ar'
                  ? 'انتقل مباشرة إلى معالج التأجير (4 خطوات) أو اربط مستأجراً مبدئياً.'
                  : 'Launch the 4-Step Leasing Wizard or link a tenant administratively.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nextStepPrompt.type === 'add-unit' ? (
              <button
                type="button"
                onClick={() => {
                  setUnitForm((f) => ({ ...f, propertyId: nextStepPrompt.propertyId }));
                  setNextStepPrompt(null);
                  setShowAddUnit(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إضافة وحدة لهذا العقار الآن' : 'Add Unit Now'}</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUnit(nextStepPrompt.unit);
                    setNextStepPrompt(null);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-300 dark:border-white/15 hover:bg-white/40 dark:hover:bg-white/10 cursor-pointer"
                >
                  {lang === 'ar' ? 'ربط مستأجر فقط' : 'Link Tenant Only'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = nextStepPrompt.unit.id;
                    setNextStepPrompt(null);
                    startLeasingWizardForUnit(targetId);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'تأجير الآن (معالج 4 خطوات)' : 'Lease Now (4-Step Wizard)'}</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setNextStepPrompt(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Properties Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {state.properties.map((prop) => {
          const propUnits = state.units.filter((u) => u.propertyId === prop.id);
          const leased = propUnits.filter((u) => u.status === 'مؤجرة' || u.status === 'متأخرة في السداد').length;
          const occ = propUnits.length > 0 ? Math.round((leased / propUnits.length) * 100) : 0;
          const selected = selectedPropertyId === prop.id;
          return (
            <button
              key={prop.id}
              onClick={() => setSelectedPropertyId(selected ? 'all' : prop.id)}
              className={`text-start p-5 rounded-2xl border transition-colors cursor-pointer ${
                selected
                  ? 'border-[#26478D] bg-[#26478D]/10 dark:bg-[#26478D]/20'
                  : 'border-slate-200 dark:border-white/10 glass-surface hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                    {prop.code} · {prop.type} · صك {prop.deedNumber}
                  </div>
                  <div className="text-base font-bold mt-1">{lang === 'ar' ? prop.nameAr : prop.nameEn}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {prop.city} · {prop.district} · {prop.ownershipMode || 'إدارة للغير'}
                  </div>
                </div>
                <Building2 className="w-5 h-5 text-[#26478D] dark:text-blue-400 shrink-0" />
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  {lang === 'ar'
                    ? `${propUnits.length} وحدة · ${prop.buildingsCount} مباني`
                    : `${propUnits.length} units · ${prop.buildingsCount} bldgs`}
                </span>
                <span className="font-mono-num font-semibold text-[#26478D] dark:text-blue-400">
                  {lang === 'ar' ? `إشغال ${occ}%` : `${occ}% Occupied`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Units Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث فوري برقم الوحدة أو المستأجر...' : 'Instant search unit or tenant...'}
              className="w-full min-h-[42px] ps-9 pe-8 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] focus:outline-none focus:ring-2 focus:ring-[#26478D]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[42px] px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
          >
            <option value="all">{lang === 'ar' ? 'جميع الحالات (10)' : 'All Statuses (10)'}</option>
            {UNIT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {selectedPropertyId !== 'all' && (
            <button
              onClick={() => setSelectedPropertyId('all')}
              className="text-xs text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
            >
              {lang === 'ar' ? 'عرض جميع العقارات' : 'Show All Properties'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.06]">
          <button
            onClick={() => setViewMode('grid')}
            className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg cursor-pointer ${
              viewMode === 'grid' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
            }`}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg cursor-pointer ${
              viewMode === 'table' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
            }`}
            aria-label="Table view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Units Display: Sleek Visual Grid or Table */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUnits.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3 p-10 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface text-center text-xs text-slate-500">
              {lang === 'ar' ? 'لا توجد وحدات مطابقة لنتائج البحث' : 'No matching units found'}
            </div>
          ) : (
            filteredUnits.map((unit) => {
              const prop = state.properties.find((p) => p.id === unit.propertyId);
              const activeContract = state.contracts.find(
                (c) => c.unitId === unit.id && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التجديد')
              );
              const tenant = state.tenants.find((t) => t.id === (activeContract?.tenantId || unit.linkedTenantId));
              const docPhoto = state.documents.find(
                (d) => d.dataUrl?.startsWith('data:image/') && (d.relatedId === unit.id || d.relatedId === unit.propertyId) && d.category === 'صور العقارات'
              );
              const thumbSrc = docPhoto?.dataUrl || getDefaultUnitImage(unit.unitType);

              return (
                <SwipeableRow
                  key={unit.id}
                  rightSwipeAction={{
                    label:
                      unit.status === 'مؤجرة' || unit.status === 'متأخرة في السداد'
                        ? lang === 'ar'
                          ? 'تحصيل دفعة'
                          : 'Collect'
                        : lang === 'ar'
                        ? 'تأجير الآن'
                        : 'Lease',
                    tone: 'emerald',
                    onTrigger: () => {
                      if (unit.status !== 'مؤجرة' && unit.status !== 'متأخرة في السداد') {
                        startLeasingWizardForUnit(unit.id);
                      } else {
                        setActiveNav('finance');
                      }
                    },
                  }}
                  leftSwipeAction={{
                    label: lang === 'ar' ? 'التفاصيل' : 'Details',
                    tone: 'blue',
                    onTrigger: () => {
                      setSelectedUnit(unit);
                      setShowUnitTechDetails(false);
                    },
                  }}
                >
                  <div
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedUnit(unit);
                      setShowUnitTechDetails(false);
                    }}
                    className="rounded-2xl border border-slate-200/85 dark:border-white/10 glass-surface glass-card-interactive hover:border-[#26478D]/50 cursor-pointer overflow-hidden flex flex-col"
                  >
                    {/* Crisp 16:9 Architectural Thumbnail */}
                    <div className="relative h-36 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <img
                        src={thumbSrc}
                        alt={`${unit.unitType} ${unit.unitNumber}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
                      <div className="absolute top-3 end-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold backdrop-blur-md bg-white/90 dark:bg-[#0A0E1A]/85 ${unitStatusTone(
                            unit.status
                          )}`}
                        >
                          <UnitStatusIcon status={unit.status} />
                          <span>{unit.status}</span>
                        </span>
                      </div>
                      <div className="absolute bottom-2.5 inset-x-3 flex items-end justify-between gap-2 text-white">
                        <div className="min-w-0">
                          <div className="text-[11px] text-white/80 truncate">
                            {prop?.nameAr} · {unit.buildingName}
                          </div>
                          <div className="text-base font-bold leading-tight truncate">
                            {unit.unitType} <span className="font-mono-num">{unit.unitNumber}</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono-num text-white/85 shrink-0">
                          {lang === 'ar' ? `طابق ${unit.floor}` : `Fl ${unit.floor}`}
                        </span>
                      </div>
                    </div>

                    {/* Details Body */}
                    <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2 font-mono-num">
                        <span>{unit.areaSqm} م²</span>
                        <span>·</span>
                        <span>{unit.rooms} غرف</span>
                        <span>·</span>
                        <span>{unit.acCount} مكيفات</span>
                        <span>·</span>
                        <span>{unit.furnished ? 'مؤثثة' : 'غير مؤثثة'}</span>
                      </div>

                      <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between gap-2 text-xs">
                        <div className="truncate text-slate-600 dark:text-slate-300 min-w-0">
                          {tenant ? tenant.nameAr : unit.vacantSince ? `شاغرة منذ ${unit.vacantSince}` : 'متاحة للتأجير'}
                        </div>
                        <div className="font-mono-num font-bold text-[#26478D] dark:text-blue-400 shrink-0">
                          {formatSar(activeContract?.annualRent || unit.suggestedAnnualRent, lang)}/سنة
                        </div>
                      </div>
                    </div>
                  </div>
                </SwipeableRow>
              );
            })
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'العقار' : 'Property'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'المساحة / الغرف' : 'Specs'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'المستأجر / المربوط' : 'Tenant'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'الإيجار السنوي' : 'Annual Rent'}</th>
                <th className="py-3 px-4 text-start font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredUnits.map((unit) => {
                const prop = state.properties.find((p) => p.id === unit.propertyId);
                const ctr = state.contracts.find((c) => c.unitId === unit.id && c.lifecycleStatus === 'نشط');
                const ten = state.tenants.find((t) => t.id === (ctr?.tenantId || unit.linkedTenantId));
                return (
                  <tr
                    key={unit.id}
                    onClick={() => setSelectedUnit(unit)}
                    className="hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer"
                  >
                    <td className="py-3 px-4 font-semibold font-mono-num">
                      {unit.unitNumber} · {unit.unitType}
                    </td>
                    <td className="py-3 px-4">{prop?.nameAr}</td>
                    <td className="py-3 px-4 font-mono-num">
                      {unit.areaSqm} م² · {unit.rooms} غرف
                    </td>
                    <td className="py-3 px-4">{ten?.nameAr || '—'}</td>
                    <td className="py-3 px-4 font-mono-num font-semibold">
                      {formatSar(ctr?.annualRent || unit.suggestedAnnualRent, lang)}
                    </td>
                    <td className={`py-3 px-4 font-semibold ${unitStatusTone(unit.status)}`}>{unit.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Unit Full Dossier Drawer with Hero Scale Transition */}
      {activeSelectedUnit && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/65 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white dark:bg-[#13192B] h-full overflow-y-auto border-s border-slate-200 dark:border-white/10 shadow-2xl animate-aqar-hero">
            {/* Hero Image Header */}
            <div className="relative h-44 w-full bg-slate-900 overflow-hidden">
              <img
                src={
                  state.documents.find(
                    (d) =>
                      d.dataUrl?.startsWith('data:image/') &&
                      (d.relatedId === activeSelectedUnit.id || d.relatedId === activeSelectedUnit.propertyId) &&
                      d.category === 'صور العقارات'
                  )?.dataUrl || getDefaultUnitImage(activeSelectedUnit.unitType)
                }
                alt={`${activeSelectedUnit.unitType} ${activeSelectedUnit.unitNumber}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-slate-950/20" />
              <button
                onClick={() => setSelectedUnit(null)}
                className="absolute top-4 end-4 min-w-[44px] min-h-[44px] rounded-xl bg-black/45 text-white hover:bg-black/65 flex items-center justify-center backdrop-blur-md cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute bottom-4 inset-x-5 flex items-end justify-between gap-4 text-white">
                <div className="min-w-0">
                  <div className="text-xs text-white/80 truncate">
                    {state.properties.find((p) => p.id === activeSelectedUnit.propertyId)?.nameAr} ·{' '}
                    {activeSelectedUnit.buildingName}
                  </div>
                  <h3 className="text-2xl font-bold mt-0.5 truncate">
                    {activeSelectedUnit.unitType}{' '}
                    <span className="font-mono-num">{activeSelectedUnit.unitNumber}</span>
                  </h3>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 backdrop-blur-md text-xs font-semibold">
                    <UnitStatusIcon status={activeSelectedUnit.status} />
                    <span>{activeSelectedUnit.status}</span>
                  </div>
                </div>
                <div className="bg-white p-1.5 rounded-xl shrink-0">
                  <QrCodeSvg value={`UNIT|${activeSelectedUnit.id}|${activeSelectedUnit.unitNumber}`} size={58} />
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">

            {/* Sequential Action Card when Unit is Available / Non-Leased */}
            {hasPermission('manage_contracts') && activeSelectedUnit.status !== 'مؤجرة' && (
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {lang === 'ar' ? 'جاهزة للتأجير وإصدار العقد' : 'Ready for Sequential Leasing'}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 font-mono-num">
                    {lang === 'ar'
                      ? `الإيجار السنوي المقترح: ${formatSar(activeSelectedUnit.suggestedAnnualRent, lang)}`
                      : `Suggested Annual Rent: ${formatSar(activeSelectedUnit.suggestedAnnualRent, lang)}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = activeSelectedUnit.id;
                    setSelectedUnit(null);
                    startLeasingWizardForUnit(targetId);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'بدء معالج التأجير (4 خطوات)' : 'Start Leasing Wizard'}</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Status Update */}
            {hasPermission('manage_properties') && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-2.5">
                <div className="text-xs font-semibold">
                  {lang === 'ar' ? 'تحديث حالة الوحدة التشغيلية' : 'Update Unit Operational Status'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {UNIT_STATUSES.map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStatusChange(activeSelectedUnit.id, st)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition-colors ${
                        activeSelectedUnit.status === st
                          ? 'bg-[#26478D] text-white border-[#26478D]'
                          : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    قاعدة العمل: لا تتحول الوحدة المؤجرة إلى «شاغرة» قبل اعتماد محضر الاستلام والإخلاء.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CreateTaskQuickButton
                      defaultType="صيانة"
                      defaultTitle={`فحص وتجهيز الوحدة ${activeSelectedUnit.unitNumber}`}
                      propertyId={activeSelectedUnit.propertyId}
                      unitId={activeSelectedUnit.id}
                      relatedLabel={`وحدة ${activeSelectedUnit.unitNumber}`}
                      compact
                    />
                    {activeSelectedUnit.status !== 'مؤجرة' && activeSelectedUnit.status !== 'مؤرشفة' && !activeSelectedUnit.archivedAt && (
                      <MoveToArchiveButton
                        category="units"
                        entityId={activeSelectedUnit.id}
                        entityLabel={`وحدة ${activeSelectedUnit.unitNumber}`}
                        compact
                        onArchived={() => setSelectedUnit(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Administrative Tenant Link (Explicitly Separate from Contract Creation!) */}
            {hasPermission('manage_tenants') && activeSelectedUnit.status !== 'مؤجرة' && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
                    <span>{lang === 'ar' ? 'ربط مستأجر إدارياً (حجز مبدئي)' : 'Link Tenant Administratively'}</span>
                  </div>
                  <button
                    onClick={() => {
                      const targetId = activeSelectedUnit.id;
                      setSelectedUnit(null);
                      startLeasingWizardForUnit(targetId);
                    }}
                    className="text-[11px] text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {lang === 'ar' ? 'معالج العقد (4 خطوات) ←' : '4-Step Contract Wizard →'}
                  </button>
                </div>
                {activeSelectedUnit.linkedTenantId && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    مربوط حالياً بالعميل:{' '}
                    <strong>{state.tenants.find((t) => t.id === activeSelectedUnit.linkedTenantId)?.nameAr}</strong> (بدون عقد ساري بعد)
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <select
                    value={linkTenantId}
                    onChange={(e) => setLinkTenantId(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                  >
                    <option value="">{lang === 'ar' ? 'اختر مستأجراً للربط الإداري...' : 'Select tenant...'}</option>
                    {state.tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nameAr} ({t.nationalIdOrIqama})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleLinkTenant(activeSelectedUnit.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer whitespace-nowrap"
                  >
                    {lang === 'ar' ? 'ربط دون عقد' : 'Link Only'}
                  </button>
                </div>
              </div>
            )}

            {/* Progressive Disclosure: Advanced Technical Specs, Meters & Unit Assets */}
            <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowUnitTechDetails((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <span>
                  {lang === 'ar'
                    ? 'عرض التفاصيل المتقدمة (العدادات، المفاتيح، وسجل الأجهزة)'
                    : 'Progressive Details (Meters, Keys & Assets)'}
                </span>
                {showUnitTechDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showUnitTechDetails && (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Zap className="w-3.5 h-3.5" />
                        <span>عداد الكهرباء</span>
                      </div>
                      <div className="font-mono-num font-semibold mt-1">{activeSelectedUnit.electricityMeter || '—'}</div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Droplets className="w-3.5 h-3.5" />
                        <span>عداد المياه</span>
                      </div>
                      <div className="font-mono-num font-semibold mt-1">{activeSelectedUnit.waterMeter || '—'}</div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>المفاتيح</span>
                      </div>
                      <div className="font-mono-num font-semibold mt-1">{activeSelectedUnit.keyCount} مفاتيح</div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Wind className="w-3.5 h-3.5" />
                        <span>المكيفات / ريموت</span>
                      </div>
                      <div className="font-mono-num font-semibold mt-1">
                        {activeSelectedUnit.acCount} / {activeSelectedUnit.acRemoteCount}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold">
                      {lang === 'ar' ? 'سجل الأجهزة والضمانات في الوحدة' : 'Unit Assets & Warranties'}
                    </div>
                    {state.assets.filter((a) => a.unitId === activeSelectedUnit.id).length === 0 ? (
                      <div className="text-xs text-slate-500">لا توجد أجهزة مسجلة لهذه الوحدة بعد.</div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
                        {state.assets
                          .filter((a) => a.unitId === activeSelectedUnit.id)
                          .map((asset) => (
                            <div key={asset.id} className="p-3 flex items-center justify-between text-xs">
                              <div>
                                <div className="font-medium">{asset.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono-num">
                                  SN: {asset.serialNumber} · ضمان حتى {asset.warrantyExpiry}
                                </div>
                              </div>
                              <span className="font-medium text-amber-600 dark:text-amber-400">{asset.condition}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Property Modal with Gemini OCR Auto-Fill */}
      {showAddProp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateProperty}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{lang === 'ar' ? 'إضافة عقار جديد' : 'New Property'}</h3>
              <button type="button" onClick={() => setShowAddProp(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                <Sparkles className="w-4 h-4" />
                <span>{lang === 'ar' ? 'تعبئة تلقائية من صورة الصك / العقد (Gemini OCR)' : 'Auto-Fill from Deed / Lease (OCR)'}</span>
              </span>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer">
                {isPropOcrBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{lang === 'ar' ? 'رفع صك أو عقد إيجار' : 'Upload Deed / Lease'}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  disabled={isPropOcrBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handlePropertyOcrFill(f);
                  }}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                required
                placeholder="الرمز التعريفي (RYD-03)"
                value={propForm.code}
                onChange={(e) => setPropForm({ ...propForm, code: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <select
                value={propForm.type}
                onChange={(e) => setPropForm({ ...propForm, type: e.target.value as PropertyType })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="سكني">سكني</option>
                <option value="تجاري">تجاري</option>
                <option value="إداري">إداري</option>
                <option value="مختلط">مختلط</option>
              </select>
              <input
                required
                placeholder="اسم العقار بالعربية"
                value={propForm.nameAr}
                onChange={(e) => setPropForm({ ...propForm, nameAr: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                placeholder="المدينة"
                value={propForm.city}
                onChange={(e) => setPropForm({ ...propForm, city: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                required
                placeholder="الحي"
                value={propForm.district}
                onChange={(e) => setPropForm({ ...propForm, district: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <select
                value={propForm.ownershipMode}
                onChange={(e) => setPropForm({ ...propForm, ownershipMode: e.target.value as PropertyOwnershipMode })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="مملوك للشركة">مملوك للشركة</option>
                <option value="إدارة للغير">إدارة للغير</option>
                <option value="ملكية مشتركة">ملكية مشتركة</option>
              </select>

              <button
                type="button"
                onClick={() => setShowAdvancedProp((v) => !v)}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] flex items-center justify-between text-xs font-semibold cursor-pointer"
              >
                <span>{lang === 'ar' ? 'عرض التفاصيل المتقدمة (الصك، المالك، الشركة، نسبة الإدارة)' : 'Advanced Ownership & Deed Details'}</span>
                {showAdvancedProp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showAdvancedProp && (
                <>
                  <input
                    placeholder="رقم الصك"
                    value={propForm.deedNumber}
                    onChange={(e) => setPropForm({ ...propForm, deedNumber: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                  <input
                    type="number"
                    placeholder="نسبة عمولة الإدارة (%)"
                    value={propForm.managementFeePercent}
                    onChange={(e) => setPropForm({ ...propForm, managementFeePercent: Number(e.target.value) })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                  <select
                    value={propForm.ownerId}
                    onChange={(e) => setPropForm({ ...propForm, ownerId: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                  >
                    {state.owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nameAr}
                      </option>
                    ))}
                  </select>
                  <select
                    value={propForm.companyId}
                    onChange={(e) => setPropForm({ ...propForm, companyId: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                  >
                    {(state.companies || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddProp(false)}
                className="min-h-[44px] px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submittingProp}
                className="min-h-[44px] px-5 py-2 text-xs font-semibold rounded-xl bg-[#26478D] text-white disabled:opacity-50 cursor-pointer"
              >
                {submittingProp ? 'جاري الحفظ...' : 'حفظ العقار'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Unit Modal with Smart Numeric Keyboards */}
      {showAddUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateUnit}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 animate-aqar-fade-scale"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{lang === 'ar' ? 'إضافة وحدة جديدة' : 'New Unit'}</h3>
              <button type="button" onClick={() => setShowAddUnit(false)} className="min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <select
                value={unitForm.propertyId}
                onChange={(e) => setUnitForm({ ...unitForm, propertyId: e.target.value })}
                className="col-span-2 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {state.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="رقم الوحدة (مثال: A-301)"
                value={unitForm.unitNumber}
                onChange={(e) => setUnitForm({ ...unitForm, unitNumber: e.target.value })}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <select
                value={unitForm.unitType}
                onChange={(e) => setUnitForm({ ...unitForm, unitType: e.target.value as UnitType })}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="شقة">شقة</option>
                <option value="مكتب">مكتب</option>
                <option value="معرض تجاري">معرض تجاري</option>
                <option value="فيلا">فيلا</option>
                <option value="استوديو">استوديو</option>
              </select>
              <input
                type="number"
                inputMode="numeric"
                placeholder="المساحة م²"
                value={unitForm.areaSqm}
                onChange={(e) => setUnitForm({ ...unitForm, areaSqm: Number(e.target.value) })}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                type="number"
                inputMode="decimal"
                enterKeyHint="done"
                placeholder="الإيجار السنوي المقترح"
                value={unitForm.suggestedAnnualRent}
                onChange={(e) =>
                  setUnitForm({
                    ...unitForm,
                    suggestedAnnualRent: Number(e.target.value),
                    suggestedMonthlyRent: Math.round(Number(e.target.value) / 12),
                  })
                }
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                inputMode="numeric"
                placeholder="رقم عداد الكهرباء"
                value={unitForm.electricityMeter}
                onChange={(e) => setUnitForm({ ...unitForm, electricityMeter: e.target.value })}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                inputMode="numeric"
                enterKeyHint="done"
                placeholder="رقم عداد المياه"
                value={unitForm.waterMeter}
                onChange={(e) => setUnitForm({ ...unitForm, waterMeter: e.target.value })}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddUnit(false)} className="min-h-[44px] px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submittingUnit}
                className="min-h-[44px] px-5 py-2 text-xs font-semibold rounded-xl bg-[#26478D] text-white disabled:opacity-50 cursor-pointer"
              >
                {submittingUnit ? 'جاري الحفظ...' : 'حفظ الوحدة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mobile Thumb-Zone FAB */}
      {hasPermission('manage_properties') && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            setUnitForm((f) => ({ ...f, propertyId: state.properties[0]?.id || '' }));
            setShowAddUnit(true);
          }}
          className="lg:hidden fixed bottom-[4.4rem] end-4 z-30 min-h-[48px] px-4 rounded-2xl bg-[#26478D] text-white shadow-xl shadow-[#26478D]/35 inline-flex items-center gap-2 text-xs font-bold cursor-pointer active:scale-95 transition-transform no-print"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'وحدة جديدة' : 'Add Unit'}</span>
        </button>
      )}
    </div>
  );
}
