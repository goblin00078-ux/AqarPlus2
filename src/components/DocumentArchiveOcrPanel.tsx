import React, { useMemo, useState } from 'react';
import {
  FileText,
  ScanText,
  Upload,
  Search,
  Eye,
  Download,
  Sparkles,
  UserPlus,
  Building2,
  FilePlus2,
  AlertTriangle,
  CheckCircle2,
  X,
  Clock,
  Loader2,
  ShieldCheck,
  Camera,
  Crop,
  Link2,
  RefreshCw,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import {
  CurrencyCode,
  DocumentCategory,
  DocumentRecord,
  OcrEntityMatchResult,
  OcrExtractedData,
  OcrSyncSummary,
} from '../types/aqar';
import { formatDateTime } from '../utils/formatters';
import { CameraDocumentScannerModal } from './CameraDocumentScannerModal';
import { MoveToArchiveButton } from './MoveToArchiveButton';
import { ProcessedScanResult } from '../utils/documentScanProcessor';
import { runGeminiOcrExtraction } from '../utils/ocrClient';

const ALL_CATEGORIES: DocumentCategory[] = [
  'عقود إيجار',
  'صكوك',
  'هويات وإقامات',
  'فواتير',
  'سندات قبض',
  'سندات صرف',
  'عروض أسعار',
  'تقارير صيانة',
  'محاضر التسليم',
  'صور العقارات',
  'مستندات الموردين',
  'مراسلات الشركة',
];

export function DocumentArchiveOcrPanel() {
  const { state, currentUser, lang, hasPermission, mutate, pushToast, refreshState } = useAqar();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cropInitialImage, setCropInitialImage] = useState<string | undefined>(undefined);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  // Upload + OCR form states
  const [fileDataUrl, setFileDataUrl] = useState<string>('');
  const [fileMime, setFileMime] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [autoSyncOnOcr, setAutoSyncOnOcr] = useState(true);
  const [isSyncingEntities, setIsSyncingEntities] = useState(false);
  const [isPreviewOcrRunning, setIsPreviewOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [docForm, setDocForm] = useState({
    title: '',
    category: 'عقود إيجار' as DocumentCategory,
    fileName: '',
    fileType: 'IMAGE',
    fileSizeKb: 320,
    relatedType: 'عقار' as DocumentRecord['relatedType'],
    relatedId: '',
    expiryDate: '',
    version: 1,
  });

  const [extracted, setExtracted] = useState<OcrExtractedData | null>(null);
  const [ocrMatches, setOcrMatches] = useState<OcrEntityMatchResult | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<OcrSyncSummary | null>(null);

  const expiringDocs = useMemo(() => {
    if (!state) return [];
    const nowMs = new Date('2026-11-14T00:00:00Z').getTime();
    return state.documents.filter((d) => {
      if (!d.expiryDate) return false;
      const diffDays = Math.ceil((new Date(d.expiryDate).getTime() - nowMs) / 86400000);
      return diffDays <= 45;
    });
  }, [state]);

  const filteredDocs = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    return state.documents.filter((doc) => {
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        doc.title,
        doc.category,
        doc.fileName,
        doc.ocrRawText || '',
        doc.ocrExtracted?.tenantNameAr || '',
        doc.ocrExtracted?.nationalIdOrIqama || '',
        doc.ocrExtracted?.deedNumber || '',
        doc.ocrExtracted?.ejarNumber || '',
        doc.ocrExtracted?.propertyNameAr || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [state, search, categoryFilter]);

  if (!state) return null;

  const resetScanner = () => {
    setFileDataUrl('');
    setFileMime('');
    setExtracted(null);
    setOcrMatches(null);
    setLastSyncSummary(null);
    setOcrError(null);
    setDocForm({
      title: '',
      category: 'عقود إيجار',
      fileName: '',
      fileType: 'IMAGE',
      fileSizeKb: 320,
      relatedType: 'عقار',
      relatedId: state.properties[0]?.id || '',
      expiryDate: '',
      version: 1,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);
    setFileMime(file.type || 'image/jpeg');
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
    const baseTitle = file.name.replace(/\.[^.]+$/, '');

    let guessedCategory: DocumentCategory = docForm.category;
    const lower = file.name.toLowerCase();
    if (lower.includes('deed') || lower.includes('صك')) guessedCategory = 'صكوك';
    else if (lower.includes('id') || lower.includes('iqama') || lower.includes('هوية')) guessedCategory = 'هويات وإقامات';
    else if (lower.includes('inv') || lower.includes('فاتورة')) guessedCategory = 'فواتير';

    setDocForm((prev) => ({
      ...prev,
      title: prev.title || baseTitle,
      category: guessedCategory,
      fileName: file.name,
      fileType: ext,
      fileSizeKb: sizeKb,
    }));

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraScanComplete = (result: ProcessedScanResult) => {
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    setOcrError(null);
    setFileDataUrl(result.dataUrl);
    setFileMime(result.mimeType);
    setDocForm((prev) => ({
      ...prev,
      title: prev.title || (lang === 'ar' ? `مستند ممسوح ضوئياً ${stamp}` : `Scanned Document ${stamp}`),
      fileName: prev.fileName && cropInitialImage ? prev.fileName : `scan-${stamp}.jpg`,
      fileType: 'JPG',
      fileSizeKb: result.sizeKb,
    }));
    setShowCameraModal(false);
    setCropInitialImage(undefined);
    setShowScannerModal(true);
    pushToast(
      'success',
      lang === 'ar'
        ? `تم قص وتحسين جودة المستند (${result.width}×${result.height})`
        : `Scan cropped & enhanced (${result.width}x${result.height})`
    );
  };

  const handleRunOcr = async () => {
    if (!fileDataUrl) {
      setOcrError(lang === 'ar' ? 'يرجى رفع صورة أو ملف PDF للمستند أولاً.' : 'Please upload an image or PDF first.');
      return;
    }
    setIsScanning(true);
    setOcrError(null);
    setLastSyncSummary(null);
    try {
      const json = await runGeminiOcrExtraction({
        userId: currentUser?.id || 'usr-gm',
        dataUrl: fileDataUrl,
        mimeType: fileMime,
        fileName: docForm.fileName,
        categoryHint: docForm.category,
        autoSync: autoSyncOnOcr,
        createMissing: true,
      });

      const data = json.extracted;
      setExtracted(data);
      setOcrMatches(json.matches || null);
      if (json.syncSummary) {
        setLastSyncSummary(json.syncSummary);
        await refreshState();
      }

      // Auto-enrich archive metadata and entity link from OCR output
      let nextCat = docForm.category;
      let nextRelType = docForm.relatedType;
      let nextRelId = docForm.relatedId;

      if (data.docType === 'صك ملكية') {
        nextCat = 'صكوك';
        nextRelType = 'عقار';
      } else if (data.docType === 'عقد إيجار') {
        nextCat = 'عقود إيجار';
        nextRelType = 'عقد';
      } else if (data.docType === 'هوية / إقامة') {
        nextCat = 'هويات وإقامات';
        nextRelType = 'مستأجر';
      } else if (data.docType === 'فاتورة / مستند مالي') {
        nextCat = 'فواتير';
        nextRelType = 'مصروف';
      }

      if (json.syncSummary?.tenantId && (data.docType === 'هوية / إقامة' || !json.syncSummary.propertyId)) {
        nextRelType = 'مستأجر';
        nextRelId = json.syncSummary.tenantId;
      } else if (json.syncSummary?.propertyId) {
        nextRelType = 'عقار';
        nextRelId = json.syncSummary.propertyId;
      } else if (json.matches?.matchedTenant?.id && data.docType === 'هوية / إقامة') {
        nextRelType = 'مستأجر';
        nextRelId = json.matches.matchedTenant.id;
      } else if (json.matches?.matchedProperty?.id) {
        nextRelType = 'عقار';
        nextRelId = json.matches.matchedProperty.id;
      }

      setDocForm((prev) => ({
        ...prev,
        category: nextCat,
        relatedType: nextRelType,
        relatedId: nextRelId || prev.relatedId,
        expiryDate: data.expiryDate || data.endDate || prev.expiryDate,
        title:
          prev.title ||
          [data.docType, data.tenantNameAr || data.propertyNameAr || data.deedNumber || data.ejarNumber]
            .filter(Boolean)
            .join(' - '),
      }));

      const linkedNotes: string[] = [];
      if (json.syncSummary?.tenantAction === 'created') linkedNotes.push(`إنشاء مستأجر: ${json.syncSummary.tenantName}`);
      else if (json.syncSummary?.tenantAction === 'updated') linkedNotes.push(`تحديث مستأجر: ${json.syncSummary.tenantName}`);
      if (json.syncSummary?.propertyAction === 'created') linkedNotes.push(`إنشاء عقار: ${json.syncSummary.propertyName}`);
      else if (json.syncSummary?.propertyAction === 'updated') linkedNotes.push(`تحديث عقار: ${json.syncSummary.propertyName}`);

      pushToast(
        'success',
        linkedNotes.length > 0
          ? lang === 'ar'
            ? `تم استخراج البيانات وربطها تلقائياً (${linkedNotes.join(' · ')})`
            : `OCR extracted & synced (${linkedNotes.join(' · ')})`
          : lang === 'ar'
          ? 'تم استخراج البيانات من المستند عبر Gemini OCR بنجاح'
          : 'OCR extraction complete'
      );
    } catch (err) {
      const msg = (err as Error).message;
      setOcrError(msg);
      pushToast('error', msg);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSyncExtractedToEntities = async () => {
    if (!extracted) return;
    setIsSyncingEntities(true);
    try {
      const res = await mutate<{
        summary: OcrSyncSummary;
        tenant?: { id: string; nameAr: string };
        property?: { id: string; nameAr: string };
      }>(
        'POST',
        '/api/documents/sync-ocr',
        {
          extracted,
          createMissing: true,
        },
        { offlineDescAr: 'ربط نتائج OCR بحقول المستأجرين والعقارات' }
      );
      if (res?.summary) {
        setLastSyncSummary(res.summary);
        setDocForm((prev) => ({
          ...prev,
          relatedType: res.summary.tenantId && extracted.docType === 'هوية / إقامة' ? 'مستأجر' : res.summary.propertyId ? 'عقار' : prev.relatedType,
          relatedId:
            (extracted.docType === 'هوية / إقامة' ? res.summary.tenantId : res.summary.propertyId) ||
            res.summary.tenantId ||
            res.summary.propertyId ||
            prev.relatedId,
        }));
        pushToast('success', lang === 'ar' ? 'تمت مزامنة وربط الحقول ببيانات المستأجرين والعقارات' : 'Fields synced to tenant & property');
      }
    } finally {
      setIsSyncingEntities(false);
    }
  };

  const handleRunOcrOnArchivedDoc = async (doc: DocumentRecord) => {
    setIsPreviewOcrRunning(true);
    try {
      const res = await mutate<{
        doc: DocumentRecord;
        extracted: OcrExtractedData;
        syncSummary?: OcrSyncSummary;
      }>('POST', `/api/documents/${doc.id}/ocr`, { autoSync: true });
      if (res?.doc) {
        setPreviewDoc(res.doc);
        pushToast(
          'success',
          lang === 'ar'
            ? 'تم استخراج النصوص بـ Gemini OCR وربط النتائج بالحقول تلقائياً'
            : 'Gemini OCR & entity linking completed'
        );
      }
    } finally {
      setIsPreviewOcrRunning(false);
    }
  };

  const handleSyncArchivedDoc = async (doc: DocumentRecord) => {
    if (!doc.ocrExtracted) return;
    setIsPreviewOcrRunning(true);
    try {
      const res = await mutate<{ summary: OcrSyncSummary }>(
        'POST',
        '/api/documents/sync-ocr',
        {
          extracted: doc.ocrExtracted,
          docId: doc.id,
          createMissing: true,
        },
        { offlineDescAr: `ربط بيانات المستند ${doc.title}` }
      );
      if (res?.summary) {
        pushToast(
          'success',
          lang === 'ar'
            ? `تم ربط نتائج المستند (${[res.summary.tenantName, res.summary.propertyName].filter(Boolean).join(' · ') || 'تمت المزامنة'})`
            : 'Document OCR linked'
        );
      }
    } finally {
      setIsPreviewOcrRunning(false);
    }
  };

  const handleArchiveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutate(
      'POST',
      '/api/documents',
      {
        ...docForm,
        relatedId: docForm.relatedId || state.properties[0]?.id || 'prop-1',
        dataUrl: fileDataUrl || undefined,
        ocrStatus: extracted ? 'تم الاستخراج آلياً' : 'لم يُحلل',
        ocrRawText: extracted?.rawText,
        ocrExtracted: extracted || undefined,
        accessLog: [],
      },
      { offlineDescAr: `أرشفة مستند ${docForm.title}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تمت أرشفة المستند مع البيانات المستخرجة في الخزينة' : 'Document archived');
      setShowScannerModal(false);
      resetScanner();
    }
  };

  const handleCreateTenantFromOcr = async () => {
    if (!extracted?.tenantNameAr || !extracted?.nationalIdOrIqama) {
      pushToast(
        'error',
        lang === 'ar' ? 'يرجى التأكد من تعبئة اسم المستأجر ورقم الهوية/الإقامة أولاً' : 'Tenant name & ID required'
      );
      return;
    }
    const existing = state.tenants.find((t) => t.nationalIdOrIqama.trim() === extracted.nationalIdOrIqama?.trim());
    if (existing) {
      pushToast(
        'info',
        lang === 'ar'
          ? `المستأجر مسجل مسبقاً باسم: ${existing.nameAr} — تم ربط المستند بملفه`
          : `Tenant already exists: ${existing.nameAr}`
      );
      setDocForm((prev) => ({ ...prev, relatedType: 'مستأجر', relatedId: existing.id }));
      return;
    }

    const res = await mutate<{ tenant?: { id: string; nameAr: string } }>(
      'POST',
      '/api/tenants',
      {
        nameAr: extracted.tenantNameAr,
        nameEn: extracted.tenantNameEn || extracted.tenantNameAr,
        nationalIdOrIqama: extracted.nationalIdOrIqama,
        nationality: extracted.nationality || 'سعودي',
        phone: extracted.phone || '0500000000',
        email: extracted.email || '',
        employer: extracted.employer || '',
        classification: 'نشط',
        rating: 4,
        notes: `تم إنشاؤه آلياً عبر المسح الضوئي (OCR) من الملف ${docForm.fileName}`,
      },
      { offlineDescAr: `إنشاء مستأجر من المسح ${extracted.tenantNameAr}` }
    );
    if (res?.tenant) {
      setDocForm((prev) => ({ ...prev, relatedType: 'مستأجر', relatedId: res.tenant!.id }));
      pushToast('success', lang === 'ar' ? `تم إنشاء ملف المستأجر ${res.tenant.nameAr} آلياً` : 'Tenant created from OCR');
    }
  };

  const handleCreatePropertyFromOcr = async () => {
    if (!extracted?.propertyNameAr && !extracted?.deedNumber) {
      pushToast('error', lang === 'ar' ? 'يرجى إدخال اسم العقار أو رقم الصك المستخرج' : 'Property name or deed required');
      return;
    }
    const propName = extracted.propertyNameAr || `عقار صك ${extracted.deedNumber}`;
    const res = await mutate<{ property?: { id: string; nameAr: string } }>(
      'POST',
      '/api/properties',
      {
        companyId: state.companies?.[0]?.id,
        ownershipMode: 'إدارة للغير',
        code: `PRP-OCR-${Math.floor(100 + Math.random() * 899)}`,
        nameAr: propName,
        nameEn: propName,
        city: extracted.city || 'الرياض',
        district: extracted.district || 'غير محدد',
        street: '',
        nationalAddress: '',
        type: 'سكني',
        deedNumber: extracted.deedNumber || '',
        status: 'نشط',
        buildingsCount: 1,
        floorsCount: 3,
        managementFeePercent: state.settings.defaultManagementFeePercent || 5,
        ownerShares: state.owners[0] ? [{ ownerId: state.owners[0].id, sharePercent: 100 }] : [],
        electricityMeterMain: '',
        waterMeterMain: '',
        caretakerName: '',
        caretakerPhone: '',
      },
      { offlineDescAr: `إنشاء عقار من الصك ${propName}` }
    );
    if (res?.property) {
      setDocForm((prev) => ({ ...prev, relatedType: 'عقار', relatedId: res.property!.id }));
      pushToast('success', lang === 'ar' ? `تم تسجيل العقار ${res.property.nameAr} من الصك بنجاح` : 'Property created from deed');
    }
  };

  const handleCreateContractFromOcr = async () => {
    const matchedTenant = state.tenants.find(
      (t) =>
        (extracted?.nationalIdOrIqama && t.nationalIdOrIqama === extracted.nationalIdOrIqama) ||
        (extracted?.tenantNameAr && t.nameAr.includes(extracted.tenantNameAr))
    );
    const matchedUnit = state.units.find(
      (u) =>
        (extracted?.unitNumber && u.unitNumber.toLowerCase() === extracted.unitNumber.toLowerCase()) ||
        u.status !== 'مؤجرة'
    );
    if (!matchedTenant || !matchedUnit) {
      pushToast(
        'error',
        lang === 'ar'
          ? 'يرجى أولاً إنشاء/تحديد المستأجر أو التأكد من توفر وحدة غير مؤجرة'
          : 'Create tenant or ensure an available unit exists first'
      );
      return;
    }

    const res = await mutate<{ contract?: { id: string; internalNumber: string } }>(
      'POST',
      '/api/contracts',
      {
        propertyId: matchedUnit.propertyId,
        unitId: matchedUnit.id,
        tenantId: matchedTenant.id,
        ejarNumber: extracted?.ejarNumber || extracted?.contractNumber || '',
        ejarStatus: extracted?.ejarNumber ? 'موثق في إيجار' : 'قيد التوثيق',
        lifecycleStatus: extracted?.ejarNumber ? 'نشط' : 'بانتظار التوثيق',
        startDate: extracted?.startDate || '2026-11-15',
        endDate: extracted?.endDate || '2027-11-14',
        annualRent: extracted?.annualRent || matchedUnit.suggestedAnnualRent || 42000,
        currency: (extracted?.currency || 'SAR') as CurrencyCode,
        paymentFrequency: 'نصف سنوي',
        securityDeposit: 3000,
        officeFee: 1000,
        managementCommissionPercent: 5,
        includedServices: 'مستخرج آلياً عبر OCR',
        notes: `مسح ضوئي من ${docForm.fileName}`,
      },
      { offlineDescAr: `إنشاء عقد من المسح الضوئي` }
    );
    if (res?.contract) {
      setDocForm((prev) => ({ ...prev, relatedType: 'عقد', relatedId: res.contract!.id }));
      pushToast('success', lang === 'ar' ? `تم توليد العقد ${res.contract.internalNumber} وجدول دفعاته آلياً` : 'Contract created from OCR');
    }
  };

  const openDocumentPreview = async (doc: DocumentRecord) => {
    setPreviewDoc(doc);
    await mutate('POST', `/api/documents/${doc.id}/access`, { action: 'معاينة' });
  };

  const handleDownloadDocument = async (doc: DocumentRecord) => {
    await mutate('POST', `/api/documents/${doc.id}/access`, { action: 'تنزيل' });
    if (doc.dataUrl) {
      const a = document.createElement('a');
      a.href = doc.dataUrl;
      a.download = doc.fileName;
      a.click();
    } else {
      const textContent = [
        `AqarPlus Central Document Archive`,
        `Title: ${doc.title}`,
        `Category: ${doc.category}`,
        `File: ${doc.fileName}`,
        `Uploaded: ${doc.createdAt}`,
        doc.ocrRawText ? `\n--- OCR Text ---\n${doc.ocrRawText}` : '',
      ].join('\n');
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.fileName}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
    pushToast('success', lang === 'ar' ? 'تم تسجيل التنزيل في سجل الوصول' : 'Download logged');
  };

  const livePreviewDoc = previewDoc ? state.documents.find((d) => d.id === previewDoc.id) || previewDoc : null;

  return (
    <div className="space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'بحث في الأرشيف أو النصوص المستخرجة بالـ OCR (هوية، صك، عقد إيجار)...'
                  : 'Search archive & OCR extracted text...'
              }
              className="w-full ps-9 pe-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 glass-surface focus:outline-none focus:ring-2 focus:ring-[#26478D]"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
          >
            <option value="all">
              {lang === 'ar' ? `جميع التصنيفات (${state.documents.length})` : `All Categories (${state.documents.length})`}
            </option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {hasPermission('manage_documents') && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                resetScanner();
                setCropInitialImage(undefined);
                setShowCameraModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>{lang === 'ar' ? 'مسح بالكاميرا (Scan)' : 'Camera Scan'}</span>
            </button>
            <button
              onClick={() => {
                resetScanner();
                setShowScannerModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer shadow-sm"
            >
              <ScanText className="w-4 h-4" />
              <span>{lang === 'ar' ? 'رفع مستند واستخراج البيانات (OCR)' : 'Upload & Scan OCR'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Document Expiry Alerts Strip */}
      {expiringDocs.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-300/70 dark:border-amber-500/25 bg-amber-50/70 dark:bg-amber-500/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {lang === 'ar'
                ? `تنبيهات الصلاحية: ${expiringDocs.length} مستندات تنتهي صلاحيتها قريباً:`
                : `Expiry Alerts (${expiringDocs.length} documents expiring soon):`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {expiringDocs.map((d) => (
              <button
                key={d.id}
                onClick={() => openDocumentPreview(d)}
                className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-white/[0.06] border border-amber-300/60 dark:border-amber-500/20 text-[11px] font-medium hover:border-[#26478D] cursor-pointer"
              >
                {d.title} · <span className="font-mono-num text-amber-700 dark:text-amber-300">{d.expiryDate}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Documents Archive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDocs.map((doc) => (
          <div
            key={doc.id}
            className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface flex flex-col justify-between gap-3 hover:border-[#26478D]/50 transition-colors"
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-[#26478D]/10 text-[#26478D] dark:text-blue-400 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {doc.category} · v{doc.version}
                    </div>
                    <h4 className="text-xs font-bold mt-0.5 line-clamp-1">{doc.title}</h4>
                  </div>
                </div>
                {doc.ocrStatus === 'تم الاستخراج آلياً' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold shrink-0">
                    <Sparkles className="w-3 h-3" />
                    <span>OCR</span>
                  </span>
                )}
              </div>

              {doc.dataUrl && doc.dataUrl.startsWith('data:image/') && (
                <div className="h-28 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/20">
                  <img src={doc.dataUrl} alt={doc.title} className="w-full h-full object-cover" />
                </div>
              )}

              {doc.ocrExtracted && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 text-[11px] space-y-1">
                  {doc.ocrExtracted.tenantNameAr && (
                    <div>
                      <span className="text-slate-500">المستأجر:</span> <strong>{doc.ocrExtracted.tenantNameAr}</strong>
                    </div>
                  )}
                  {doc.ocrExtracted.nationalIdOrIqama && (
                    <div className="font-mono-num">
                      <span className="text-slate-500">الهوية:</span> {doc.ocrExtracted.nationalIdOrIqama}
                    </div>
                  )}
                  {doc.ocrExtracted.deedNumber && (
                    <div className="font-mono-num">
                      <span className="text-slate-500">رقم الصك:</span> {doc.ocrExtracted.deedNumber}
                    </div>
                  )}
                  {doc.ocrExtracted.ejarNumber && (
                    <div className="font-mono-num">
                      <span className="text-slate-500">رقم إيجار:</span> {doc.ocrExtracted.ejarNumber}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2.5 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between gap-2 text-[11px]">
              <div className="font-mono-num text-slate-500 truncate">
                {doc.fileName} · {doc.fileSizeKb} KB
              </div>
              <div className="flex items-center gap-1.5 shrink-0 no-print">
                <button
                  onClick={() => openDocumentPreview(doc)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-[11px] font-medium cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'معاينة' : 'View'}</span>
                </button>
                <button
                  onClick={() => handleDownloadDocument(doc)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                  title={lang === 'ar' ? 'تنزيل' : 'Download'}
                >
                  <Download className="w-3 h-3" />
                </button>
                {!doc.archivedAt && hasPermission('manage_documents') && (
                  <MoveToArchiveButton
                    category="documents"
                    entityId={doc.id}
                    entityLabel={doc.title}
                    compact
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload + Real OCR Scanner Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleArchiveDocument}
            className="w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-5 my-8"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#26478D]/10 text-[#26478D] dark:text-blue-400">
                  <ScanText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {lang === 'ar' ? 'الأرشيف المركزي ومسح المستندات بالذكاء الاصطناعي (OCR)' : 'Central Archive & AI OCR Scanner'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {lang === 'ar'
                      ? 'ارفع صورة عقد الإيجار أو صك الملكية أو الهوية لاستخراج البيانات وإنشاء السجلات آلياً'
                      : 'Upload lease contract, deed, or ID scan to automatically extract fields'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowScannerModal(false)} className="cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 5 cols: Upload Dropzone & Metadata */}
              <div className="lg:col-span-5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="sm:col-span-2 block border-2 border-dashed border-slate-300 dark:border-white/15 rounded-2xl p-3.5 text-center cursor-pointer hover:border-[#26478D] transition-colors bg-slate-50/70 dark:bg-white/[0.02]">
                    <Upload className="w-5 h-5 mx-auto text-[#26478D] dark:text-blue-400 mb-1.5" />
                    <div className="font-semibold line-clamp-1">
                      {docForm.fileName || (lang === 'ar' ? 'اختر صورة (PNG/JPG) أو PDF' : 'Select image or PDF')}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {lang === 'ar' ? 'عقود · صكوك · هويات · فواتير' : 'Contracts · Deeds · IDs · Invoices'}
                    </div>
                    <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setCropInitialImage(undefined);
                      setShowCameraModal(true);
                    }}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-300 p-3 text-center cursor-pointer transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="font-bold text-[11px]">{lang === 'ar' ? 'التقاط بالكاميرا' : 'Scan Camera'}</span>
                    <span className="text-[10px] opacity-80">{lang === 'ar' ? 'Crop + Deskew' : 'Crop + Deskew'}</span>
                  </button>
                </div>

                {fileDataUrl && (
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-100 dark:bg-black/30">
                    {fileDataUrl.startsWith('data:image/') ? (
                      <div className="space-y-1.5 pb-1.5">
                        <img src={fileDataUrl} alt="Preview" className="w-full max-h-44 object-contain" />
                        <div className="px-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setCropInitialImage(fileDataUrl);
                              setShowCameraModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 dark:bg-white/10 border border-slate-200 dark:border-white/15 hover:border-[#26478D] text-[11px] font-semibold cursor-pointer"
                          >
                            <Crop className="w-3 h-3 text-[#26478D] dark:text-blue-400" />
                            <span>{lang === 'ar' ? 'قص وتعديل الانحراف (Crop / Deskew)' : 'Crop & Deskew'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs font-mono-num text-slate-500">
                        PDF READY · {docForm.fileName} ({docForm.fileSizeKb} KB)
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSyncOnOcr}
                    onChange={(e) => setAutoSyncOnOcr(e.target.checked)}
                    className="accent-emerald-600 rounded"
                  />
                  <span className="text-[11px] font-medium">
                    {lang === 'ar'
                      ? 'ربط النتائج تلقائياً بحقول المستأجرين والعقارات فور التحليل'
                      : 'Auto-bind OCR results to Tenant & Property fields'}
                  </span>
                </label>

                <button
                  type="button"
                  disabled={!fileDataUrl || isScanning}
                  onClick={handleRunOcr}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>
                    {isScanning
                      ? lang === 'ar'
                        ? 'جاري قراءة النص واستخراج البيانات...'
                        : 'Extracting with OCR...'
                      : lang === 'ar'
                      ? 'تحليل Gemini OCR وربط البيانات آلياً'
                      : 'Run Gemini OCR & Auto-Link'}
                  </span>
                </button>

                {ocrError && (
                  <div className="p-3 rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 text-[11px]">
                    {ocrError}
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
                  <input
                    required
                    placeholder="عنوان المستند في الأرشيف"
                    value={docForm.title}
                    onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={docForm.category}
                      onChange={(e) => setDocForm({ ...docForm, category: e.target.value as DocumentCategory })}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                    >
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      title="تاريخ الانتهاء للتنبيه"
                      value={docForm.expiryDate}
                      onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                    />
                  </div>
                </div>
              </div>

              {/* Right 7 cols: Extracted OCR Fields & Auto Entity Creation */}
              <div className="lg:col-span-7 space-y-3 text-xs">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {lang === 'ar' ? 'البيانات المستخرجة القابلة للمراجعة والإنشاء الآلي' : 'Extracted Fields & Quick Actions'}
                    </span>
                    {extracted && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{extracted.docType}</span>
                      </span>
                    )}
                  </div>

                  {!extracted ? (
                    <div className="py-10 text-center text-slate-500 space-y-2">
                      <ScanText className="w-8 h-8 mx-auto text-slate-400" />
                      <p>
                        {lang === 'ar'
                          ? 'بعد رفع صورة العقد أو الصك أو الهوية، اضغط على زر "تحليل واستخراج البيانات" لعرض الحقول وتوليد السجلات تلقائياً.'
                          : 'Upload a scan and click Extract Data via OCR to populate fields automatically.'}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setExtracted({
                            docType: 'عقد إيجار',
                            tenantNameAr: '',
                            nationalIdOrIqama: '',
                            propertyNameAr: '',
                            deedNumber: '',
                            rawText: '',
                          })
                        }
                        className="text-[#26478D] dark:text-blue-400 underline cursor-pointer text-[11px]"
                      >
                        {lang === 'ar' ? 'أو إدخال البيانات المستخرجة يدوياً' : 'Or enter structured metadata manually'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <input
                          placeholder="اسم المستأجر"
                          value={extracted.tenantNameAr || ''}
                          onChange={(e) => setExtracted({ ...extracted, tenantNameAr: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                        />
                        <input
                          placeholder="رقم الهوية / الإقامة"
                          value={extracted.nationalIdOrIqama || ''}
                          onChange={(e) => setExtracted({ ...extracted, nationalIdOrIqama: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] font-mono-num"
                        />
                        <input
                          placeholder="رقم الجوال"
                          value={extracted.phone || ''}
                          onChange={(e) => setExtracted({ ...extracted, phone: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] font-mono-num"
                        />
                        <input
                          placeholder="اسم العقار"
                          value={extracted.propertyNameAr || ''}
                          onChange={(e) => setExtracted({ ...extracted, propertyNameAr: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                        />
                        <input
                          placeholder="رقم الصك"
                          value={extracted.deedNumber || ''}
                          onChange={(e) => setExtracted({ ...extracted, deedNumber: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] font-mono-num"
                        />
                        <input
                          placeholder="المدينة / الحي"
                          value={[extracted.city, extracted.district].filter(Boolean).join(' - ')}
                          onChange={(e) => {
                            const [c, d] = e.target.value.split(' - ');
                            setExtracted({ ...extracted, city: c || '', district: d || '' });
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                        />
                        <input
                          placeholder="رقم عقد إيجار"
                          value={extracted.ejarNumber || extracted.contractNumber || ''}
                          onChange={(e) => setExtracted({ ...extracted, ejarNumber: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] font-mono-num"
                        />
                        <input
                          placeholder="رقم الوحدة"
                          value={extracted.unitNumber || ''}
                          onChange={(e) => setExtracted({ ...extracted, unitNumber: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] font-mono-num"
                        />
                        <input
                          type="number"
                          placeholder="الإيجار السنوي"
                          value={extracted.annualRent || ''}
                          onChange={(e) => setExtracted({ ...extracted, annualRent: Number(e.target.value) })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] font-mono-num"
                        />
                      </div>

                      <textarea
                        rows={3}
                        placeholder="النص الكامل المستخرج..."
                        value={extracted.rawText || ''}
                        onChange={(e) => setExtracted({ ...extracted, rawText: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] text-[11px]"
                      />

                      {/* Auto-Matched Tenant & Property Sync Status */}
                      {(ocrMatches || lastSyncSummary) && (
                        <div className="p-3 rounded-xl border border-emerald-300/60 dark:border-emerald-500/25 bg-emerald-500/[0.06] space-y-2 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                              <Link2 className="w-3.5 h-3.5" />
                              <span>{lang === 'ar' ? 'نتيجة الربط التلقائي بحقول النظام' : 'Auto Field Mapping Result'}</span>
                            </span>
                            <button
                              type="button"
                              disabled={isSyncingEntities}
                              onClick={handleSyncExtractedToEntities}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                            >
                              {isSyncingEntities ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              <span>{lang === 'ar' ? 'مزامنة الحقول الآن' : 'Sync Now'}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="p-2 rounded-lg bg-white/80 dark:bg-black/25 border border-slate-200/70 dark:border-white/10">
                              <div className="text-slate-500">ربط المستأجر:</div>
                              {lastSyncSummary?.tenantAction && lastSyncSummary.tenantAction !== 'skipped' ? (
                                <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                                  {lastSyncSummary.tenantAction === 'created' ? '✓ تم إنشاء مستأجر:' : '✓ تم تحديث:'}{' '}
                                  {lastSyncSummary.tenantName}
                                </div>
                              ) : ocrMatches?.matchedTenant ? (
                                <div className="font-semibold">
                                  مطابق: {ocrMatches.matchedTenant.nameAr} ({ocrMatches.matchedTenant.matchReason})
                                </div>
                              ) : (
                                <div className="text-slate-500">
                                  {ocrMatches?.suggestedTenantAction === 'create' ? 'جاهز لإنشاء ملف مستأجر جديد' : 'لا توجد بيانات مستأجر'}
                                </div>
                              )}
                            </div>

                            <div className="p-2 rounded-lg bg-white/80 dark:bg-black/25 border border-slate-200/70 dark:border-white/10">
                              <div className="text-slate-500">ربط العقار:</div>
                              {lastSyncSummary?.propertyAction && lastSyncSummary.propertyAction !== 'skipped' ? (
                                <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                                  {lastSyncSummary.propertyAction === 'created' ? '✓ تم تسجيل عقار:' : '✓ تم تحديث:'}{' '}
                                  {lastSyncSummary.propertyName}
                                </div>
                              ) : ocrMatches?.matchedProperty ? (
                                <div className="font-semibold">
                                  مطابق: {ocrMatches.matchedProperty.nameAr} ({ocrMatches.matchedProperty.matchReason})
                                </div>
                              ) : (
                                <div className="text-slate-500">
                                  {ocrMatches?.suggestedPropertyAction === 'create' ? 'جاهز لتسجيل عقار جديد' : 'لا توجد بيانات عقار'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* One-click Entity Creation Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {hasPermission('manage_tenants') && (
                          <button
                            type="button"
                            onClick={handleCreateTenantFromOcr}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#26478D]/10 text-[#26478D] dark:text-blue-300 border border-[#26478D]/30 hover:bg-[#26478D]/20 text-[11px] font-semibold cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'إنشاء مستأجر من المسح' : 'Create Tenant'}</span>
                          </button>
                        )}
                        {hasPermission('manage_properties') && (
                          <button
                            type="button"
                            onClick={handleCreatePropertyFromOcr}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 text-[11px] font-semibold cursor-pointer"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'إنشاء عقار من الصك' : 'Create Property'}</span>
                          </button>
                        )}
                        {hasPermission('manage_contracts') && (
                          <button
                            type="button"
                            onClick={handleCreateContractFromOcr}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 text-[11px] font-semibold cursor-pointer"
                          >
                            <FilePlus2 className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'إنشاء عقد من المسح' : 'Create Contract'}</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowScannerModal(false)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={!docForm.title}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white hover:bg-[#1e3a75] disabled:opacity-50 cursor-pointer"
              >
                {lang === 'ar' ? 'أرشفة المستند بالخزينة' : 'Save & Archive'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Camera Capture & Crop/Deskew Studio Modal */}
      <CameraDocumentScannerModal
        open={showCameraModal}
        lang={lang}
        initialImageDataUrl={cropInitialImage}
        onClose={() => {
          setShowCameraModal(false);
          setCropInitialImage(undefined);
        }}
        onComplete={handleCameraScanComplete}
      />

      {/* Document Preview & Audit Trail Modal */}
      {livePreviewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto print:bg-white print:p-0">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-5 my-8 animate-aqar-fade-scale print-only-panel">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10 no-print">
              <div>
                <div className="text-xs text-slate-500">
                  {livePreviewDoc.category} · v{livePreviewDoc.version} · {livePreviewDoc.fileName}
                </div>
                <h3 className="text-base font-bold mt-0.5">{livePreviewDoc.title}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `${livePreviewDoc.title} (${livePreviewDoc.category}) - ${livePreviewDoc.fileName}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 min-h-[42px] rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'واتساب' : 'WhatsApp'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[42px] rounded-xl bg-[#26478D] text-white text-xs font-medium cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'طباعة / PDF' : 'Print'}</span>
                </button>
                <button
                  onClick={() => handleDownloadDocument(livePreviewDoc)}
                  className="inline-flex items-center gap-1 px-3 min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'تنزيل' : 'Download'}</span>
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {livePreviewDoc.dataUrl && livePreviewDoc.dataUrl.startsWith('data:image/') ? (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 p-2 max-h-80 overflow-hidden flex justify-center">
                <img
                  src={livePreviewDoc.dataUrl}
                  alt={livePreviewDoc.title}
                  referrerPolicy="no-referrer"
                  className="max-h-76 object-contain rounded-lg"
                />
              </div>
            ) : livePreviewDoc.dataUrl && livePreviewDoc.dataUrl.startsWith('data:application/pdf') ? (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden h-80 bg-slate-100 dark:bg-black/30">
                <iframe
                  src={livePreviewDoc.dataUrl}
                  title={livePreviewDoc.title}
                  className="w-full h-full border-0"
                />
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.02] text-center space-y-1">
                <FileText className="w-7 h-7 mx-auto text-[#26478D] dark:text-blue-400" />
                <div className="text-xs font-semibold">{livePreviewDoc.fileName}</div>
                <div className="text-[11px] text-slate-500 font-mono-num">
                  {livePreviewDoc.fileType} · {livePreviewDoc.fileSizeKb} KB
                </div>
              </div>
            )}

            {livePreviewDoc.dataUrl && !livePreviewDoc.ocrExtracted && hasPermission('manage_documents') && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isPreviewOcrRunning}
                  onClick={() => handleRunOcrOnArchivedDoc(livePreviewDoc)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {isPreviewOcrRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>
                    {lang === 'ar' ? 'استخراج النصوص بـ Gemini OCR وربطها بالحقول' : 'Run Gemini OCR & Auto-Link'}
                  </span>
                </button>
              </div>
            )}

            {livePreviewDoc.ocrExtracted && (
              <div className="p-4 rounded-xl border border-emerald-300/60 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/[0.05] space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                    <Sparkles className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'البيانات المستخرجة بالتعرف الضوئي (OCR)' : 'OCR Extracted Metadata'}</span>
                  </div>
                  {hasPermission('manage_documents') && (
                    <button
                      type="button"
                      disabled={isPreviewOcrRunning}
                      onClick={() => handleSyncArchivedDoc(livePreviewDoc)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      {isPreviewOcrRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      <span>{lang === 'ar' ? 'ربط النتائج بحقول المستأجرين والعقارات' : 'Sync to Tenant & Property'}</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  {livePreviewDoc.ocrExtracted.tenantNameAr && <div>المستأجر: <strong>{livePreviewDoc.ocrExtracted.tenantNameAr}</strong></div>}
                  {livePreviewDoc.ocrExtracted.nationalIdOrIqama && <div className="font-mono-num">الهوية: <strong>{livePreviewDoc.ocrExtracted.nationalIdOrIqama}</strong></div>}
                  {livePreviewDoc.ocrExtracted.propertyNameAr && <div>العقار: <strong>{livePreviewDoc.ocrExtracted.propertyNameAr}</strong></div>}
                  {livePreviewDoc.ocrExtracted.deedNumber && <div className="font-mono-num">الصك: <strong>{livePreviewDoc.ocrExtracted.deedNumber}</strong></div>}
                  {livePreviewDoc.ocrExtracted.ejarNumber && <div className="font-mono-num">عقد إيجار: <strong>{livePreviewDoc.ocrExtracted.ejarNumber}</strong></div>}
                  {livePreviewDoc.ocrExtracted.annualRent && <div className="font-mono-num">الإيجار: <strong>{livePreviewDoc.ocrExtracted.annualRent.toLocaleString()}</strong></div>}
                </div>
                {livePreviewDoc.ocrExtracted.rawText && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-black/20 p-2.5 rounded-lg">
                    {livePreviewDoc.ocrExtracted.rawText}
                  </p>
                )}
              </div>
            )}

            {/* Document Access Log */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <span>{lang === 'ar' ? 'سجل الوصول والمعاينة والتنزيل' : 'Document Access Audit Trail'}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/5 border border-slate-200 dark:border-white/10 rounded-xl max-h-40 overflow-y-auto">
                {(!livePreviewDoc.accessLog || livePreviewDoc.accessLog.length === 0) ? (
                  <div className="p-3 text-xs text-slate-500">تم تسجيل معاينتك الحالية للتو.</div>
                ) : (
                  livePreviewDoc.accessLog.map((acc) => (
                    <div key={acc.id} className="px-3 py-2 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-semibold">{acc.userName}</span> ·{' '}
                        <span className="text-[#26478D] dark:text-blue-400 font-medium">{acc.action}</span> ·{' '}
                        <span className="text-slate-500">{acc.deviceName}</span>
                      </div>
                      <span className="font-mono-num text-slate-400 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(acc.accessedAt, lang)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
