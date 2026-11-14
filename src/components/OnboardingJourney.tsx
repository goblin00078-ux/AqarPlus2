import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Delete,
  Droplets,
  ExternalLink,
  Fingerprint,
  Home,
  Landmark,
  Layers,
  Loader2,
  Lock,
  MapPin,
  Paperclip,
  Store,
  Upload,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { Property, PropertyType, Unit, UnitStatus, UnitType } from '../types/aqar';
import { CameraDocumentScannerModal } from './CameraDocumentScannerModal';
import { ProcessedScanResult } from '../utils/documentScanProcessor';
import { formatSar } from '../utils/formatters';

export type OnboardingStage = 'splash' | 'company' | 'property' | 'units' | 'success';

interface GeneratedDraftUnit {
  tempId: string;
  floor: number;
  unitNumber: string;
  unitType: UnitType;
  rooms: number;
  areaSqm: number;
  suggestedAnnualRent: number;
  securityDeposit: number;
  acEnabled: boolean;
  acType: 'سبليت' | 'شباك' | 'مركزي';
  kitchenInstalled: boolean;
  electricityEnabled: boolean;
  electricityMeter: string;
  waterEnabled: boolean;
  waterMeter: string;
  status: UnitStatus;
  attachment?: ProcessedScanResult;
}

interface OnboardingJourneyProps {
  initialStage?: OnboardingStage;
  isLockMode?: boolean;
  onComplete: () => void;
}

export const PIN_STORAGE_KEY = 'aqarplus_master_pin_v1';
const BIOMETRIC_STORAGE_KEY = 'aqarplus_biometric_v1';
export const ONBOARDING_DONE_KEY = 'aqarplus_onboarding_v1';

function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(14);
    }
  } catch {
    // ignore unsupported browsers
  }
}

function generateDraftUnits(
  floors: number,
  perFloor: number,
  defaultUnitType: UnitType = 'شقة',
  existing: GeneratedDraftUnit[] = []
): GeneratedDraftUnit[] {
  const safeFloors = Math.min(20, Math.max(1, floors));
  const safePerFloor = Math.min(24, Math.max(1, perFloor));
  const existingMap = new Map(existing.map((u) => [u.tempId, u]));
  const list: GeneratedDraftUnit[] = [];
  for (let f = 1; f <= safeFloors; f++) {
    for (let u = 1; u <= safePerFloor; u++) {
      const tempId = `draft-${f}-${u}`;
      const prev = existingMap.get(tempId);
      if (prev) {
        list.push(prev);
        continue;
      }
      const unitNumber = defaultUnitType === 'فيلا' ? `فيلا-${f}${u > 1 ? `-${u}` : ''}` : `ط${f}-ش${u}`;
      list.push({
        tempId,
        floor: f,
        unitNumber,
        unitType: defaultUnitType,
        rooms: defaultUnitType === 'فيلا' ? 5 : 3,
        areaSqm: defaultUnitType === 'فيلا' ? 320 : 125,
        suggestedAnnualRent: defaultUnitType === 'فيلا' ? 95000 : 42000,
        securityDeposit: defaultUnitType === 'فيلا' ? 5000 : 3000,
        acEnabled: true,
        acType: 'سبليت',
        kitchenInstalled: true,
        electricityEnabled: true,
        electricityMeter: `ELEC-${f}0${u}`,
        waterEnabled: true,
        waterMeter: `WAT-${f}0${u}`,
        status: 'شاغرة',
      });
    }
  }
  return list;
}

export function OnboardingJourney({
  initialStage = 'splash',
  isLockMode = false,
  onComplete,
}: OnboardingJourneyProps) {
  const { state, lang, mutate, pushToast, setActiveNav } = useAqar();

  const savedPin = typeof window !== 'undefined' ? localStorage.getItem(PIN_STORAGE_KEY) : null;
  const [stage, setStage] = useState<OnboardingStage>(initialStage);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem(BIOMETRIC_STORAGE_KEY) === '1'
  );

  // Stage 2: Company Identity (Step 1 of 3)
  const [companyLogo, setCompanyLogo] = useState<string>(state?.settings.logoDataUrl || '');
  const [logoScannerOpen, setLogoScannerOpen] = useState(false);
  const [companyNameAr, setCompanyNameAr] = useState(
    state?.settings.nameAr || 'شركة الجنيدل العقارية'
  );
  const [companyNameEn, setCompanyNameEn] = useState(
    state?.settings.nameEn || 'Al-Junaidel Real Estate Co.'
  );
  const [vatNumber, setVatNumber] = useState(state?.settings.vatNumber || '310482910300003');
  const [crNumber, setCrNumber] = useState(state?.settings.crNumber || '1010482910');

  // Stage 3.1: Property General Info (Step 2 of 3)
  const [propNameAr, setPropNameAr] = useState('');
  const [propCity, setPropCity] = useState('الرياض');
  const [propDistrict, setPropDistrict] = useState('');
  const [propPreset, setPropPreset] = useState<'building' | 'compound' | 'villa' | 'commercial'>('building');
  const [propType, setPropType] = useState<PropertyType>('سكني');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  // Stage 3.2 & 3.3: Smart Unit Generator + Deep Dive Bottom Sheet (Step 3 of 3)
  const [floorsCount, setFloorsCount] = useState(3);
  const [unitsPerFloor, setUnitsPerFloor] = useState(4);
  const [draftUnits, setDraftUnits] = useState<GeneratedDraftUnit[]>(() => generateDraftUnits(3, 4));
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [openAccordion, setOpenAccordion] = useState<'basic' | 'amenities' | 'status' | 'docs'>('basic');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [startFreshWorkspace, setStartFreshWorkspace] = useState(true);
  const [savingAll, setSavingAll] = useState(false);

  // Stage 4: Created Summary
  const [createdSummary, setCreatedSummary] = useState<{
    propertyName: string;
    unitsCount: number;
  } | null>(null);

  const isVatValid = /^\d{15}$/.test(vatNumber.trim());
  const isCrValid = /^\d{10}$/.test(crNumber.trim());

  const activeDraftUnit = useMemo(
    () => draftUnits.find((u) => u.tempId === editingUnitId) || null,
    [draftUnits, editingUnitId]
  );

  const updateDraftUnit = (tempId: string, patch: Partial<GeneratedDraftUnit>) => {
    setDraftUnits((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, ...patch } : u)));
  };

  const handlePinDigit = (digit: string) => {
    triggerHaptic();
    setPinError('');
    if (pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);
  };

  const handlePinBackspace = () => {
    triggerHaptic();
    setPinError('');
    setPinInput((p) => p.slice(0, -1));
  };

  const handlePinSubmit = () => {
    triggerHaptic();
    if (pinInput.length < 4) {
      setPinError(lang === 'ar' ? 'يرجى إدخال رمز مكون من 4 أرقام' : 'Please enter a 4-digit PIN');
      return;
    }
    if (isLockMode && savedPin && pinInput !== savedPin) {
      setPinError(lang === 'ar' ? 'رمز الدخول غير صحيح' : 'Incorrect PIN');
      setPinInput('');
      return;
    }
    localStorage.setItem(PIN_STORAGE_KEY, pinInput);
    localStorage.setItem(BIOMETRIC_STORAGE_KEY, biometricEnabled ? '1' : '0');
    if (isLockMode) {
      localStorage.setItem(ONBOARDING_DONE_KEY, 'done');
      onComplete();
      return;
    }
    setStage('company');
  };

  useEffect(() => {
    if (stage !== 'splash') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBackspace();
      } else if (e.key === 'Enter' && pinInput.length === 4) {
        handlePinSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pinInput, isLockMode, savedPin, biometricEnabled]);

  const handleBiometricUnlock = () => {
    triggerHaptic();
    localStorage.setItem(BIOMETRIC_STORAGE_KEY, '1');
    setBiometricEnabled(true);
    pushToast(
      'success',
      lang === 'ar' ? 'تم التحقق بالبصمة / الهوية الحيوية بنجاح' : 'Biometric authentication verified'
    );
    if (isLockMode) {
      localStorage.setItem(ONBOARDING_DONE_KEY, 'done');
      onComplete();
    } else {
      setStage('company');
    }
  };

  const handleSkipOnboarding = () => {
    triggerHaptic();
    localStorage.setItem(ONBOARDING_DONE_KEY, 'done');
    onComplete();
  };

  const handleLogoFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCompanyLogo(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompanyStep = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic();
    if (!companyNameAr.trim()) return;
    await mutate(
      'PATCH',
      '/api/settings',
      {
        nameAr: companyNameAr.trim(),
        nameEn: companyNameEn.trim() || companyNameAr.trim(),
        vatNumber: vatNumber.trim(),
        crNumber: crNumber.trim(),
        logoDataUrl: companyLogo || undefined,
      },
      { offlineDescAr: 'حفظ هوية الشركة' }
    );
    setStage('property');
  };

  const handleCaptureLocation = () => {
    triggerHaptic();
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setCoords({ lat: 24.7136, lng: 46.6753 });
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGeoBusy(false);
        pushToast('success', lang === 'ar' ? 'تم تحديد إحداثيات الموقع بنجاح' : 'Location coordinates saved');
      },
      () => {
        setCoords({ lat: 24.774265, lng: 46.738586 });
        setGeoBusy(false);
        pushToast(
          'info',
          lang === 'ar' ? 'تم تعيين الإحداثيات الافتراضية للرياض — يمكنك تعديلها يدوياً' : 'Default Riyadh coordinates applied'
        );
      },
      { timeout: 6000 }
    );
  };

  const defaultDraftType: UnitType =
    propPreset === 'villa' ? 'فيلا' : propPreset === 'commercial' ? 'معرض تجاري' : 'شقة';

  const handleRegenerateGrid = (nextFloors: number, nextPerFloor: number, unitTypeOverride?: UnitType) => {
    setFloorsCount(nextFloors);
    setUnitsPerFloor(nextPerFloor);
    setDraftUnits((prev) => generateDraftUnits(nextFloors, nextPerFloor, unitTypeOverride || defaultDraftType, prev));
  };

  const handleSelectPropertyPreset = (preset: 'building' | 'compound' | 'villa' | 'commercial') => {
    triggerHaptic();
    setPropPreset(preset);
    if (preset === 'building') {
      setPropType('سكني');
      setFloorsCount(3);
      setUnitsPerFloor(4);
      setDraftUnits(generateDraftUnits(3, 4, 'شقة'));
    } else if (preset === 'compound') {
      setPropType('مختلط');
      setFloorsCount(2);
      setUnitsPerFloor(6);
      setDraftUnits(generateDraftUnits(2, 6, 'شقة'));
    } else if (preset === 'villa') {
      setPropType('سكني');
      setFloorsCount(1);
      setUnitsPerFloor(1);
      setDraftUnits(generateDraftUnits(1, 1, 'فيلا'));
    } else {
      setPropType('تجاري');
      setFloorsCount(2);
      setUnitsPerFloor(4);
      setDraftUnits(generateDraftUnits(2, 4, 'معرض تجاري'));
    }
  };

  const handleCompleteAssetSetup = async () => {
    triggerHaptic();
    const safePropName = propNameAr.trim() || (propPreset === 'villa' ? 'فيلا الياسمين' : 'عمارة طيبة السكنية');
    const safeDistrict = propDistrict.trim() || 'الياسمين';
    setSavingAll(true);
    try {
      if (startFreshWorkspace) {
        await mutate('POST', '/api/workspace/reset-fresh', {}, { offlineDescAr: 'تهيئة مساحة عمل نظيفة' });
      }

      const code = `PRP-${Math.floor(100 + Math.random() * 899)}`;
      const propRes = await mutate<{ property?: Property }>(
        'POST',
        '/api/properties',
        {
          companyId: state?.companies?.[0]?.id || 'comp-1',
          ownershipMode: 'مملوك للشركة',
          code,
          nameAr: safePropName,
          nameEn: safePropName,
          city: propCity.trim() || 'الرياض',
          district: safeDistrict,
          street: '',
          nationalAddress: '',
          type: propType,
          deedNumber: `DEED-${Math.floor(100000 + Math.random() * 899999)}`,
          status: 'نشط',
          buildingsCount: 1,
          floorsCount,
          managementFeePercent: state?.settings.defaultManagementFeePercent ?? 5,
          ownerShares: [{ ownerId: state?.owners?.[0]?.id || 'own-1', sharePercent: 100 }],
          electricityMeterMain: 'MAIN-ELEC-01',
          waterMeterMain: 'MAIN-WAT-01',
          caretakerName: '',
          caretakerPhone: '',
          latitude: coords?.lat,
          longitude: coords?.lng,
        },
        { offlineDescAr: `إضافة عقار ${safePropName}` }
      );

      const createdProp = propRes?.property;
      if (createdProp) {
        for (const draft of draftUnits) {
          const unitRes = await mutate<{ unit?: Unit }>(
            'POST',
            '/api/units',
            {
              propertyId: createdProp.id,
              buildingName: 'المبنى الرئيسي',
              floor: draft.floor,
              unitNumber: draft.unitNumber,
              unitType: draft.unitType,
              areaSqm: draft.areaSqm,
              rooms: draft.rooms,
              bathrooms: draft.unitType === 'استوديو' ? 1 : 2,
              furnished: false,
              acCount: !draft.acEnabled ? 0 : draft.acType === 'مركزي' ? 1 : 4,
              acType: draft.acEnabled ? draft.acType : undefined,
              kitchenInstalled: draft.kitchenInstalled,
              electricityMeter: draft.electricityEnabled ? draft.electricityMeter : 'بدون عداد مستقل',
              waterMeter: draft.waterEnabled ? draft.waterMeter : 'بدون عداد مستقل',
              keyCount: 3,
              acRemoteCount: draft.acEnabled ? 4 : 0,
              suggestedMonthlyRent: Math.round(draft.suggestedAnnualRent / 12),
              suggestedAnnualRent: draft.suggestedAnnualRent,
              officeFee: 1000,
              securityDeposit: draft.securityDeposit,
              status: draft.status,
              vacantSince: draft.status === 'شاغرة' ? new Date().toISOString().slice(0, 10) : undefined,
            },
            { offlineDescAr: `إضافة وحدة ${draft.unitNumber}` }
          );

          if (draft.attachment && unitRes?.unit) {
            await mutate('POST', '/api/documents', {
              title: `مرفق وحدة ${draft.unitNumber} - ${safePropName}`,
              category: 'صور العقارات',
              fileName: `${draft.unitNumber}-scan.jpg`,
              fileType: 'JPG',
              fileSizeKb: draft.attachment.sizeKb,
              relatedType: 'وحدة',
              relatedId: unitRes.unit.id,
              version: 1,
              dataUrl: draft.attachment.dataUrl,
              ocrStatus: 'لم يُحلل',
              accessLog: [],
            });
          }
        }
      }

      setCreatedSummary({
        propertyName: safePropName,
        unitsCount: draftUnits.length,
      });
      localStorage.setItem(ONBOARDING_DONE_KEY, 'done');
      setStage('success');
    } finally {
      setSavingAll(false);
    }
  };

  const progressStep = stage === 'company' ? 1 : stage === 'property' ? 2 : stage === 'units' ? 3 : 3;
  const progressPct = progressStep === 1 ? 33 : progressStep === 2 ? 67 : 100;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6"
      style={{
        background: 'radial-gradient(circle at top right, rgba(30, 64, 175, 0.45), transparent 55%), linear-gradient(155deg, #1E40AF 0%, #0F1E4A 42%, #0A0E1A 100%)',
      }}
    >
      {/* Stage 1: Splash & Master PIN */}
      {stage === 'splash' && (
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 backdrop-blur-2xl text-white p-7 sm:p-8 shadow-2xl space-y-6 animate-aqar-fade-scale">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shadow-lg">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt="AqarPlus"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <span className="text-2xl font-bold tracking-tight">A+</span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-balance">
              {lang === 'ar' ? 'AqarPlus — عقار بلس' : 'AqarPlus Property OS'}
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              {lang === 'ar'
                ? 'أهلاً بك في عقار بلس.. حيث تبدأ إدارة عقاراتك بلمسة احترافية'
                : 'Welcome to AqarPlus — professional property & financial management starts here.'}
            </p>
          </div>

          {/* Master PIN Card */}
          <div className="p-5 rounded-2xl bg-[#0A0E1A]/55 border border-white/10 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-blue-100">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  {isLockMode && savedPin
                    ? lang === 'ar'
                      ? 'أدخل رمز الدخول الرئيسي (Master PIN)'
                      : 'Enter Master PIN'
                    : lang === 'ar'
                    ? 'إنشاء رمز الدخول الرئيسي (4 أرقام)'
                    : 'Create 4-Digit Master PIN'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setBiometricEnabled((v) => !v);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition-colors whitespace-nowrap ${
                  biometricEnabled
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'border-white/15 text-blue-100/80 hover:bg-white/10'
                }`}
              >
                <Fingerprint className="w-3.5 h-3.5" />
                <span>{biometricEnabled ? (lang === 'ar' ? 'البصمة مفعّلة' : 'Biometric On') : lang === 'ar' ? 'تفعيل البصمة' : 'Enable Biometric'}</span>
              </button>
            </div>

            {/* PIN Dots */}
            <div className="flex items-center justify-center gap-3 py-1" dir="ltr">
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < pinInput.length;
                return (
                  <div
                    key={idx}
                    className={`w-11 h-12 rounded-xl border flex items-center justify-center text-lg font-mono-num font-bold transition-transform ${
                      filled
                        ? 'bg-white text-[#1E40AF] border-white scale-105'
                        : 'bg-white/5 border-white/20 text-white/30'
                    }`}
                  >
                    {filled ? '•' : ''}
                  </div>
                );
              })}
            </div>

            {pinError && <div className="text-center text-xs text-red-300 font-medium">{pinError}</div>}

            {/* Tactile Keypad */}
            <div className="grid grid-cols-3 gap-2.5" dir="ltr">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinDigit(digit)}
                  className="min-h-[50px] rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 text-lg font-mono-num font-semibold transition-all cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleBiometricUnlock}
                className="min-h-[50px] rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 flex items-center justify-center text-emerald-300 cursor-pointer"
                title={lang === 'ar' ? 'دخول بالبصمة / الوجه' : 'Biometric Unlock'}
              >
                <Fingerprint className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                className="min-h-[50px] rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 text-lg font-mono-num font-semibold transition-all cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handlePinBackspace}
                className="min-h-[50px] rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 flex items-center justify-center text-blue-100 cursor-pointer"
                aria-label="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handlePinSubmit}
              className="w-full py-3.5 px-5 rounded-xl bg-white text-[#1E40AF] hover:bg-blue-50 active:scale-[0.99] font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <span>
                {isLockMode && savedPin
                  ? lang === 'ar'
                    ? 'فتح النظام'
                    : 'Unlock Workspace'
                  : lang === 'ar'
                  ? 'إنشاء الرمز وبدء الإعداد (3 خطوات)'
                  : 'Create PIN & Start Setup (3 Steps)'}
              </span>
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleSkipOnboarding}
              className="w-full py-2.5 text-xs text-blue-100/80 hover:text-white transition-colors cursor-pointer"
            >
              {lang === 'ar' ? 'تخطي والدخول مباشرة إلى لوحة التحكم' : 'Skip & Enter Dashboard Directly'}
            </button>
          </div>
        </div>
      )}

      {/* Stages 2 & 3: Setup Wizard Card (Steps 1-3) */}
      {(stage === 'company' || stage === 'property' || stage === 'units') && (
        <div className="w-full max-w-3xl rounded-3xl border border-white/15 bg-[#0F172A]/90 backdrop-blur-2xl text-white p-6 sm:p-8 shadow-2xl space-y-6 animate-aqar-fade-scale">
          {/* Top Wizard Progress Bar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-blue-300">
                  {lang === 'ar' ? `معالج الإعداد الأولي · الخطوة ${progressStep} من 3` : `Initial Setup · Step ${progressStep} of 3`}
                </div>
                <h2 className="text-lg sm:text-xl font-bold mt-0.5">
                  {stage === 'company'
                    ? lang === 'ar'
                      ? 'بصمة الهوية — بيانات الشركة'
                      : 'Company Identity'
                    : stage === 'property'
                    ? lang === 'ar'
                      ? 'بناء الأصول — بيانات المبنى والعقار'
                      : 'Asset Setup — Building Details'
                    : lang === 'ar'
                    ? 'التوليد الذكي للوحدات وتخصيصها'
                    : 'Smart Unit Generator & Deep-Dive'}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleSkipOnboarding}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-blue-100/80 hover:text-white hover:bg-white/10 cursor-pointer whitespace-nowrap shrink-0"
              >
                {lang === 'ar' ? 'إغلاق / تخطي' : 'Skip'}
              </button>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Step 1 of 3: Company Identity */}
          {stage === 'company' && (
            <form onSubmit={handleSaveCompanyStep} className="space-y-6">
              {/* Circular Logo Uploader (Gallery or Camera) */}
              <div className="flex flex-col items-center gap-3">
                <label className="relative group cursor-pointer">
                  <div className="w-28 h-28 rounded-full border-2 border-dashed border-blue-400/60 bg-white/5 flex items-center justify-center overflow-hidden shadow-[0_0_32px_rgba(37,99,235,0.34)] group-hover:border-blue-300 transition-all group-hover:scale-[1.02]">
                    {companyLogo ? (
                      <img
                        src={companyLogo}
                        alt="Company Logo"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center space-y-1 p-2">
                        <Upload className="w-6 h-6 mx-auto text-blue-300" />
                        <span className="block text-[11px] text-blue-100">
                          {lang === 'ar' ? 'رفع شعار الشركة' : 'Upload Logo'}
                        </span>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoFile(f);
                    }}
                  />
                </label>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-medium cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-blue-300" />
                    <span>{lang === 'ar' ? 'من المعرض' : 'Gallery'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoFile(f);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic();
                      setLogoScannerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-medium cursor-pointer transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-300" />
                    <span>{lang === 'ar' ? 'التقاط بالكاميرا' : 'Camera'}</span>
                  </button>
                </div>
                <span className="text-[11px] text-slate-300">
                  {lang === 'ar' ? 'يظهر الشعار في أعلى السندات والتقارير الرسمية' : 'Appears on official receipts and PDF reports'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-300 block mb-1.5">
                    {lang === 'ar' ? 'اسم الشركة الرسمي (بالعربية)' : 'Company Name (Arabic)'}
                  </label>
                  <input
                    required
                    value={companyNameAr}
                    onChange={(e) => setCompanyNameAr(e.target.value)}
                    placeholder="شركة الجنيدل العقارية"
                    className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-300">
                      {lang === 'ar' ? 'الرقم الضريبي (15 رقم)' : 'VAT Number (15 digits)'}
                    </label>
                    {isVatValid && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'صحيح' : 'Valid'}</span>
                      </span>
                    )}
                  </div>
                  <input
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
                    placeholder="310482910300003"
                    className={`w-full px-4 py-3 rounded-xl border bg-white/5 text-white font-mono-num focus:outline-none focus:ring-2 ${
                      isVatValid ? 'border-emerald-400/60 focus:ring-emerald-400' : 'border-white/15 focus:ring-blue-400'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-300">
                      {lang === 'ar' ? 'السجل التجاري (10 أرقام)' : 'Commercial Reg (10 digits)'}
                    </label>
                    {isCrValid && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'مكتمل' : 'Valid'}</span>
                      </span>
                    )}
                  </div>
                  <input
                    value={crNumber}
                    onChange={(e) => setCrNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="1010482910"
                    className={`w-full px-4 py-3 rounded-xl border bg-white/5 text-white font-mono-num focus:outline-none focus:ring-2 ${
                      isCrValid ? 'border-emerald-400/60 focus:ring-emerald-400' : 'border-white/15 focus:ring-blue-400'
                    }`}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg"
              >
                <span>{lang === 'ar' ? 'حفظ والانتقال للعقارات' : 'Save & Continue to Properties'}</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Step 2 of 3: Building / Property General Info */}
          {stage === 'property' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="sm:col-span-3">
                  <label className="text-xs text-slate-300 block mb-1.5">
                    {lang === 'ar' ? 'اسم العقار / العمارة' : 'Property / Building Name'}
                  </label>
                  <input
                    value={propNameAr}
                    onChange={(e) => setPropNameAr(e.target.value)}
                    placeholder="مثال: عمارة طيبة السكنية"
                    className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1.5">{lang === 'ar' ? 'المدينة' : 'City'}</label>
                  <input
                    value={propCity}
                    onChange={(e) => setPropCity(e.target.value)}
                    placeholder="الرياض"
                    className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-300 block mb-1.5">{lang === 'ar' ? 'الحي' : 'District'}</label>
                  <input
                    value={propDistrict}
                    onChange={(e) => setPropDistrict(e.target.value)}
                    placeholder="مثال: الياسمين"
                    className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Property Type Selectable Cards */}
              <div className="space-y-2">
                <label className="text-xs text-slate-300 block">{lang === 'ar' ? 'نوع العقار' : 'Property Type'}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(
                    [
                      { preset: 'building', labelAr: 'عمارة', labelEn: 'Building', icon: Building2 },
                      { preset: 'compound', labelAr: 'مجمع', labelEn: 'Compound', icon: Layers },
                      { preset: 'villa', labelAr: 'فيلا', labelEn: 'Villa', icon: Home },
                      { preset: 'commercial', labelAr: 'تجاري / إداري', labelEn: 'Commercial', icon: Store },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = propPreset === opt.preset;
                    return (
                      <button
                        key={opt.preset}
                        type="button"
                        onClick={() => handleSelectPropertyPreset(opt.preset)}
                        className={`p-3.5 rounded-xl border text-center space-y-1.5 transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600/30 border-blue-400 text-white shadow-sm'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-5 h-5 mx-auto" />
                        <div className="text-xs font-semibold">{lang === 'ar' ? opt.labelAr : opt.labelEn}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Map Coordinates Picker */}
              <div className="p-4 rounded-2xl border border-white/10 bg-white/5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-blue-300" />
                    <span>{lang === 'ar' ? 'الموقع الجغرافي للعقار (الإحداثيات)' : 'Property Location Coordinates'}</span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono-num">
                    {coords
                      ? `${coords.lat}, ${coords.lng}`
                      : lang === 'ar'
                      ? 'اضغط لالتقاط موقع العقار تلقائياً وحفظ الإحداثيات'
                      : 'Capture GPS coordinates for property record'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    disabled={geoBusy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {geoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                    <span>{lang === 'ar' ? 'إضافة موقع على الخريطة' : 'Capture Map Location'}</span>
                  </button>
                  <a
                    href={
                      coords
                        ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
                        : `https://maps.google.com/?q=${encodeURIComponent(`${propCity} ${propDistrict} ${propNameAr}`.trim() || 'Riyadh')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-white/15 hover:bg-white/10 text-xs text-blue-200 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'فتح الخرائط' : 'Open Maps'}</span>
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStage('company')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/15 text-xs font-medium hover:bg-white/10 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'السابق' : 'Back'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic();
                    setStage('units');
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'التالي: التوليد الذكي للوحدات' : 'Next: Smart Unit Generator'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3 of 3: Smart Unit Generator & Deep-Dive Bottom Sheet */}
          {stage === 'units' && (
            <div className="space-y-5">
              {/* Smart Floor & Units Question */}
              <div className="p-4 rounded-2xl border border-white/10 bg-white/5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end text-xs">
                <div>
                  <label className="text-slate-300 block mb-1.5">
                    {lang === 'ar' ? 'كم عدد الطوابق؟' : 'How many floors?'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={floorsCount}
                    onChange={(e) => handleRegenerateGrid(Number(e.target.value) || 1, unitsPerFloor)}
                    className="w-full px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white font-mono-num font-bold"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1.5">
                    {lang === 'ar' ? 'كم وحدة في كل طابق؟' : 'Units per floor?'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={unitsPerFloor}
                    onChange={(e) => handleRegenerateGrid(floorsCount, Number(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white font-mono-num font-bold"
                  />
                </div>
                <div className="text-slate-200 flex items-center justify-between sm:justify-end gap-3">
                  <span>
                    {lang === 'ar' ? 'الإجمالي المولّد:' : 'Generated:'}{' '}
                    <strong className="font-mono-num text-blue-300 text-sm">{draftUnits.length}</strong>{' '}
                    {lang === 'ar' ? 'وحدة' : 'units'}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-300 flex items-center justify-between">
                <span>
                  {lang === 'ar'
                    ? 'اضغط على أي وحدة لتخصيص الإيجار والتكييف والعدادات والمرفقات:'
                    : 'Click any unit card to customize rent, AC, meters & documents:'}
                </span>
              </div>

              {/* Generated Unit Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto p-1">
                {draftUnits.map((u) => (
                  <button
                    key={u.tempId}
                    type="button"
                    onClick={() => {
                      triggerHaptic();
                      setOpenAccordion('basic');
                      setEditingUnitId(u.tempId);
                    }}
                    className="p-3.5 rounded-2xl border border-white/15 bg-white/[0.06] hover:bg-white/15 hover:border-blue-400 text-start transition-all cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm font-mono-num">{u.unitNumber}</span>
                      <span
                        className={`text-[10px] font-semibold ${
                          u.status === 'شاغرة'
                            ? 'text-emerald-300'
                            : u.status === 'تحت الصيانة'
                            ? 'text-amber-300'
                            : 'text-blue-300'
                        }`}
                      >
                        {u.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {u.unitType} · <span className="font-mono-num">{u.areaSqm} م²</span>
                    </div>
                    <div className="text-xs font-mono-num font-semibold text-blue-300">
                      {formatSar(u.suggestedAnnualRent, lang)}
                    </div>
                  </button>
                ))}
              </div>

              {/* Clean Workspace Toggle */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-white/10 bg-white/[0.04] text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={startFreshWorkspace}
                  onChange={(e) => setStartFreshWorkspace(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                <span className="text-slate-200">
                  {lang === 'ar'
                    ? 'بدء لوحة تحكم نظيفة بعقارك ووحداتك الجديدة فقط (0 وحدات مؤجرة · 0 ر.س تحصيل)'
                    : 'Start with a clean dashboard showing only your newly added property (0 leased, 0 collected)'}
                </span>
              </label>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStage('property')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/15 text-xs font-medium hover:bg-white/10 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'السابق' : 'Back'}</span>
                </button>
                <button
                  type="button"
                  disabled={savingAll}
                  onClick={handleCompleteAssetSetup}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs cursor-pointer shadow-lg"
                >
                  {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>
                    {savingAll
                      ? lang === 'ar'
                        ? 'جاري حفظ العقار والوحدات...'
                        : 'Saving Property & Units...'
                      : lang === 'ar'
                      ? `اعتماد وحفظ (${draftUnits.length}) وحدة والانطلاق`
                      : `Save ${draftUnits.length} Units & Launch`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stage 4: Animated Success Transition Screen */}
      {stage === 'success' && (
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0F172A]/95 backdrop-blur-2xl text-white p-8 shadow-2xl text-center space-y-6 animate-aqar-fade-scale">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_28px_rgba(16,185,129,0.4)]">
              <Check className="w-10 h-10 text-emerald-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">
              {lang === 'ar' ? 'تم إعداد بيئة العمل بنجاح!' : 'Workspace Ready!'}
            </h2>
            <p className="text-sm text-slate-300">
              {lang === 'ar'
                ? 'عقاراتك جاهزة للإدارة'
                : 'Your company, building, and units are live and ready for management.'}
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-white/10 bg-white/5 text-xs space-y-2 text-start">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{lang === 'ar' ? 'الشركة:' : 'Company:'}</span>
              <span className="font-semibold">{companyNameAr}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{lang === 'ar' ? 'العقار المضاف:' : 'Property:'}</span>
              <span className="font-semibold">{createdSummary?.propertyName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{lang === 'ar' ? 'الوحدات المولدة:' : 'Units Created:'}</span>
              <span className="font-mono-num font-bold text-emerald-300">{createdSummary?.unitsCount}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic();
              setActiveNav('dashboard');
              onComplete();
            }}
            className="w-full py-3.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <span>{lang === 'ar' ? 'الدخول إلى لوحة التحكم الرئيسية' : 'Enter Live Dashboard'}</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unit Deep-Dive Bottom Sheet with Accordion Sections */}
      {activeDraftUnit && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/15 bg-[#13192B] text-white p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-aqar-slide-up shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <div className="text-[11px] text-blue-300">
                  {lang === 'ar' ? `تخصيص تفاصيل الوحدة · طابق ${activeDraftUnit.floor}` : `Unit Deep-Dive · Floor ${activeDraftUnit.floor}`}
                </div>
                <h3 className="text-base font-bold font-mono-num">{activeDraftUnit.unitNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUnitId(null)}
                className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Accordion 1: Basic Info */}
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion('basic')}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold bg-white/5 cursor-pointer"
              >
                <span>{lang === 'ar' ? '1. البيانات الأساسية وقيمة الإيجار' : '1. Basic Specs & Rent'}</span>
                {openAccordion === 'basic' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {openAccordion === 'basic' && (
                <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">رقم الوحدة</label>
                    <input
                      value={activeDraftUnit.unitNumber}
                      onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { unitNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">نوع الوحدة</label>
                    <select
                      value={activeDraftUnit.unitType}
                      onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { unitType: e.target.value as UnitType })}
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-[#0A0E1A]"
                    >
                      <option value="شقة">شقة</option>
                      <option value="فيلا">فيلا</option>
                      <option value="مكتب">مكتب</option>
                      <option value="معرض تجاري">معرض تجاري</option>
                      <option value="استوديو">استوديو</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">عدد الغرف (غرفتين وصالة = 3)</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={activeDraftUnit.rooms}
                      onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { rooms: Number(e.target.value) || 1 })}
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">المساحة (م²)</label>
                    <input
                      type="number"
                      value={activeDraftUnit.areaSqm}
                      onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { areaSqm: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">الإيجار السنوي (SAR)</label>
                    <input
                      type="number"
                      value={activeDraftUnit.suggestedAnnualRent}
                      onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { suggestedAnnualRent: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">الإيجار الشهري (SAR)</label>
                    <input
                      type="number"
                      value={Math.round(activeDraftUnit.suggestedAnnualRent / 12)}
                      onChange={(e) =>
                        updateDraftUnit(activeDraftUnit.tempId, {
                          suggestedAnnualRent: (Number(e.target.value) || 0) * 12,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num font-bold"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-slate-400 block mb-1">قيمة التأمين المسترد (SAR)</label>
                    <input
                      type="number"
                      value={activeDraftUnit.securityDeposit}
                      onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { securityDeposit: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: Amenities & Meters */}
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion('amenities')}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold bg-white/5 cursor-pointer"
              >
                <span>{lang === 'ar' ? '2. المرافق والتجهيزات والعدادات' : '2. Amenities & Utility Meters'}</span>
                {openAccordion === 'amenities' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {openAccordion === 'amenities' && (
                <div className="p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <Wind className="w-3.5 h-3.5 text-blue-300" />
                      <span>التكييف:</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateDraftUnit(activeDraftUnit.tempId, { acEnabled: !activeDraftUnit.acEnabled })
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                          activeDraftUnit.acEnabled
                            ? 'bg-emerald-600/30 border-emerald-400/50 text-emerald-200'
                            : 'border-white/15 bg-white/5 text-slate-400'
                        }`}
                      >
                        {activeDraftUnit.acEnabled ? 'مفعّل' : 'بدون'}
                      </button>
                      {activeDraftUnit.acEnabled &&
                        (['سبليت', 'شباك', 'مركزي'] as const).map((ac) => (
                          <button
                            key={ac}
                            type="button"
                            onClick={() => updateDraftUnit(activeDraftUnit.tempId, { acType: ac })}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                              activeDraftUnit.acType === ac
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'border-white/15 bg-white/5 text-slate-300'
                            }`}
                          >
                            {ac}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <Home className="w-3.5 h-3.5 text-blue-300" />
                      <span>المطبخ:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateDraftUnit(activeDraftUnit.tempId, {
                          kitchenInstalled: !activeDraftUnit.kitchenInstalled,
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                        activeDraftUnit.kitchenInstalled
                          ? 'bg-emerald-600/30 border-emerald-400/50 text-emerald-200'
                          : 'border-white/15 bg-white/5 text-slate-300'
                      }`}
                    >
                      {activeDraftUnit.kitchenInstalled ? 'مطبخ مركب ✓' : 'غير مركب'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>عداد الكهرباء</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftUnit(activeDraftUnit.tempId, {
                              electricityEnabled: !activeDraftUnit.electricityEnabled,
                            })
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                            activeDraftUnit.electricityEnabled
                              ? 'bg-emerald-600/30 border-emerald-400/50 text-emerald-200'
                              : 'border-white/15 bg-white/5 text-slate-400'
                          }`}
                        >
                          {activeDraftUnit.electricityEnabled ? 'متوفر' : 'غير متوفر'}
                        </button>
                      </div>
                      {activeDraftUnit.electricityEnabled && (
                        <input
                          value={activeDraftUnit.electricityMeter}
                          onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { electricityMeter: e.target.value })}
                          placeholder="رقم عداد الكهرباء"
                          className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num"
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                          <Droplets className="w-3.5 h-3.5 text-sky-300" />
                          <span>عداد المياه</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftUnit(activeDraftUnit.tempId, {
                              waterEnabled: !activeDraftUnit.waterEnabled,
                            })
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                            activeDraftUnit.waterEnabled
                              ? 'bg-emerald-600/30 border-emerald-400/50 text-emerald-200'
                              : 'border-white/15 bg-white/5 text-slate-400'
                          }`}
                        >
                          {activeDraftUnit.waterEnabled ? 'متوفر' : 'غير متوفر'}
                        </button>
                      </div>
                      {activeDraftUnit.waterEnabled && (
                        <input
                          value={activeDraftUnit.waterMeter}
                          onChange={(e) => updateDraftUnit(activeDraftUnit.tempId, { waterMeter: e.target.value })}
                          placeholder="رقم عداد المياه"
                          className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 font-mono-num"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 3: Initial Status & Camera Attachment */}
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion('status')}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold bg-white/5 cursor-pointer"
              >
                <span>{lang === 'ar' ? '3. الحالة الأولية والمرفقات (كاميرا ذكية)' : '3. Initial Status & Camera Scan'}</span>
                {openAccordion === 'status' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {openAccordion === 'status' && (
                <div className="p-4 space-y-3 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1.5">الحالة التشغيلية الأولية</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { value: 'شاغرة', label: 'شاغرة وجاهزة', activeCls: 'bg-emerald-600 border-emerald-400 text-white' },
                          { value: 'تحت الصيانة', label: 'تحتاج صيانة', activeCls: 'bg-amber-600 border-amber-400 text-white' },
                          { value: 'محجوزة', label: 'محجوزة', activeCls: 'bg-blue-600 border-blue-400 text-white' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateDraftUnit(activeDraftUnit.tempId, { status: opt.value })}
                          className={`py-2 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                            activeDraftUnit.status === opt.value
                              ? opt.activeCls
                              : 'border-white/15 bg-white/5 text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="text-[11px] text-slate-300 inline-flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                      <span>
                        {activeDraftUnit.attachment
                          ? `تم التقاط وتحسين المرفق (${activeDraftUnit.attachment.sizeKb} KB) ✓`
                          : 'التقاط صورة للوحدة أو الصك مع القص والتحسين التلقائي'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold cursor-pointer shrink-0"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'فتح الكاميرا' : 'Scan'}</span>
                    </button>
                  </div>

                  {activeDraftUnit.attachment && (
                    <div className="pt-1 flex items-center gap-3">
                      <img
                        src={activeDraftUnit.attachment.dataUrl}
                        alt="Unit attachment preview"
                        className="w-16 h-16 rounded-xl object-cover border border-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => updateDraftUnit(activeDraftUnit.tempId, { attachment: undefined })}
                        className="text-[11px] text-red-300 hover:underline cursor-pointer"
                      >
                        {lang === 'ar' ? 'إزالة المرفق' : 'Remove attachment'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setEditingUnitId(null)}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
            >
              {lang === 'ar' ? 'حفظ تخصيص الوحدة' : 'Save Unit Details'}
            </button>
          </div>
        </div>
      )}

      {scannerOpen && activeDraftUnit && (
        <CameraDocumentScannerModal
          open={scannerOpen}
          lang={lang}
          onClose={() => setScannerOpen(false)}
          onComplete={(res) => {
            updateDraftUnit(activeDraftUnit.tempId, { attachment: res });
            setScannerOpen(false);
            pushToast('success', lang === 'ar' ? 'تم تحسين المرفق وإرفاقه بالوحدة' : 'Scan attached to unit');
          }}
        />
      )}

      {logoScannerOpen && (
        <CameraDocumentScannerModal
          open={logoScannerOpen}
          lang={lang}
          onClose={() => setLogoScannerOpen(false)}
          onComplete={(res) => {
            setCompanyLogo(res.dataUrl);
            setLogoScannerOpen(false);
            pushToast('success', lang === 'ar' ? 'تم التقاط شعار الشركة بنجاح' : 'Company logo captured');
          }}
        />
      )}
    </div>
  );
}
