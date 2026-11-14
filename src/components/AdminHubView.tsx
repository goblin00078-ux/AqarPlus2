import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Shield,
  Database,
  RotateCcw,
  Plus,
  X,
  CheckCircle2,
  Printer,
  FileSpreadsheet,
  Gavel,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { ExecutiveDecision, PermissionKey, RoleKey } from '../types/aqar';
import { exportToCsv, formatCurrency, formatDateTime, formatSar } from '../utils/formatters';
import { PrintViewButton } from './PrintViewButton';
import { DocumentArchiveOcrPanel } from './DocumentArchiveOcrPanel';

const ACCEPTANCE_ITEMS = [
  'يستطيع عدة موظفين تسجيل الدخول في الوقت نفسه.',
  'تعمل الصلاحيات بشكل مستقل لكل موظف.',
  'تظهر تعديلات الأجهزة المتصلة دون إعادة تشغيل التطبيق.',
  'تستمر العمليات الأساسية دون إنترنت.',
  'تتم مزامنة العمليات بعد عودة الاتصال دون تكرار.',
  'لا تضيع الدفعات عند انقطاع الاتصال أثناء المزامنة.',
  'تُحسب الدفعات الجزئية والمتبقي بشكل صحيح.',
  'لا تتكرر أرقام الإيصالات.',
  'لا يمكن حذف حركة مالية معتمدة.',
  'تُسجل جميع التعديلات في سجل التدقيق.',
  'يمكن إدارة العقارات والمباني والوحدات والمستأجرين.',
  'لا ينشأ عقد تلقائياً عند ربط المستأجر بالوحدة.',
  'تعمل الصيانة والمهام والموافقات من الجوال.',
  'يمكن إصدار التقارير المالية والتشغيلية.',
  'يمكن استعادة قاعدة البيانات والمرفقات من النسخة الاحتياطية.',
  'تعمل الواجهة العربية RTL على جميع الأجهزة.',
  'تُحمى بيانات المستأجرين حسب الصلاحيات.',
  'تنجح اختبارات الأداء والأمان قبل الإطلاق.',
];

const PERMISSION_LABELS: { key: PermissionKey; labelAr: string }[] = [
  { key: 'manage_properties', labelAr: 'إدارة العقارات والوحدات' },
  { key: 'manage_tenants', labelAr: 'إدارة المستأجرين' },
  { key: 'manage_contracts', labelAr: 'العقود وتوثيق إيجار' },
  { key: 'collect_payments', labelAr: 'تحصيل الإيجارات والسندات' },
  { key: 'reverse_receipts', labelAr: 'إصدار سند عكسي' },
  { key: 'manage_accounting', labelAr: 'المحاسبة والقيود' },
  { key: 'create_expense', labelAr: 'رفع مصروف وفاتورة' },
  { key: 'approve_expense_supervisor', labelAr: 'اعتماد مشرف' },
  { key: 'approve_expense_manager', labelAr: 'اعتماد المدير العام' },
  { key: 'manage_maintenance', labelAr: 'إدارة بلاغات الصيانة' },
  { key: 'execute_maintenance', labelAr: 'تنفيذ الصيانة' },
  { key: 'manage_tasks', labelAr: 'إدارة المهام' },
  { key: 'backup_restore', labelAr: 'النسخ الاحتياطي والاستعادة' },
  { key: 'view_audit', labelAr: 'سجل التدقيق' },
];

export function AdminHubView({ mode = 'all' }: { mode?: 'reports' | 'team' | 'all' }) {
  const { state, lang, hasPermission, mutate, pushToast, baseCurrency, convertToBase } = useAqar();
  const [tab, setTab] = useState<'reports' | 'documents' | 'rbac' | 'backups'>(
    mode === 'team' ? 'rbac' : 'reports'
  );
  const [checkedCriteria, setCheckedCriteria] = useState<boolean[]>(() => Array(18).fill(true));

  // Executive Decisions modal state
  const [showAddDecision, setShowAddDecision] = useState(false);
  const [decisionForm, setDecisionForm] = useState({
    title: '',
    category: 'سياسات' as ExecutiveDecision['category'],
    summary: '',
    effectiveDate: '2026-11-15',
    status: 'نافذ' as ExecutiveDecision['status'],
  });

  // Bulk Excel Import state
  const [importType, setImportType] = useState<'units' | 'tenants'>('tenants');
  const [importPreviewCount, setImportPreviewCount] = useState<number>(0);
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [importFileName, setImportFileName] = useState('');

  if (!state) return null;

  const handleDownloadCollectionCsv = () => {
    const headers = ['رقم السند', 'المستأجر', 'الوحدة', 'المبلغ (ر.س)', 'الطريقة', 'الحالة', 'التاريخ'];
    const rows = state.payments.map((p) => {
      const t = state.tenants.find((x) => x.id === p.tenantId);
      const u = state.units.find((x) => x.id === p.unitId);
      return [p.receiptNumber, t?.nameAr || '', u?.unitNumber || '', p.amount, p.paymentMethod, p.status, p.createdAt];
    });
    exportToCsv('aqarplus-collections-2026.csv', headers, rows);
    pushToast('success', 'تم تصدير تقرير التحصيل بصيغة CSV/Excel');
  };

  const handleDownloadOccupancyCsv = () => {
    const headers = ['العقار', 'رقم الوحدة', 'النوع', 'المساحة', 'الإيجار السنوي', 'الحالة'];
    const rows = state.units.map((u) => {
      const p = state.properties.find((x) => x.id === u.propertyId);
      return [p?.nameAr || '', u.unitNumber, u.unitType, u.areaSqm, u.suggestedAnnualRent, u.status];
    });
    exportToCsv('aqarplus-units-occupancy.csv', headers, rows);
    pushToast('success', 'تم تصدير تقرير الوحدات والإشغال بصيغة CSV/Excel');
  };

  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutate(
      'POST',
      '/api/decisions',
      decisionForm,
      { offlineDescAr: `قرار إداري: ${decisionForm.title}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تم إصدار وحفظ القرار الإداري وتعميمه' : 'Decision recorded');
      setShowAddDecision(false);
      setDecisionForm({
        title: '',
        category: 'سياسات',
        summary: '',
        effectiveDate: '2026-11-15',
        status: 'نافذ',
      });
    }
  };

  const handleBulkFileParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);
      setImportRows(rows);
      setImportPreviewCount(rows.length);
      setImportFileName(file.name);
      pushToast('info', lang === 'ar' ? `تمت قراءة ${rows.length} صف من الملف بنجاح` : `Parsed ${rows.length} rows`);
    } catch {
      pushToast('error', lang === 'ar' ? 'تعذر قراءة ملف Excel / CSV' : 'Failed to parse Excel/CSV');
    }
  };

  const handleDownloadImportTemplate = () => {
    const sample =
      importType === 'tenants'
        ? [
            {
              'الاسم': 'سالم بن فهد الدوسري',
              'رقم الهوية': '1055443322',
              'الجوال': '0551234567',
              'الجنسية': 'سعودي',
              'البريد': 'salem@domain.sa',
              'جهة العمل': 'شركة المدار',
            },
          ]
        : [
            {
              'العقار': state.properties[0]?.nameAr || '',
              'رقم الوحدة': 'C-105',
              'النوع': 'شقة',
              'المساحة': 140,
              'الغرف': 4,
              'دورات المياه': 3,
              'الإيجار السنوي': 45000,
            },
          ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, importType === 'tenants' ? 'Tenants' : 'Units');
    XLSX.writeFile(wb, `aqarplus-${importType}-template.xlsx`);
  };

  const handleExecuteBulkImport = async () => {
    if (importRows.length === 0) return;
    const res = await mutate<{ inserted?: number; skipped?: number }>(
      'POST',
      '/api/import/bulk',
      { type: importType, rows: importRows },
      { offlineDescAr: `استيراد جماعي من Excel (${importRows.length} صف)` }
    );
    if (res) {
      pushToast(
        'success',
        lang === 'ar'
          ? `تم استيراد ${res.inserted || 0} سجل بنجاح (تخطي ${res.skipped || 0} مكرر/ناقص)`
          : `Imported ${res.inserted || 0} rows`
      );
      setImportRows([]);
      setImportPreviewCount(0);
      setImportFileName('');
    }
  };

  const handleTogglePerm = async (role: RoleKey, permission: PermissionKey) => {
    await mutate('POST', '/api/permissions/toggle', { role, permission });
  };

  const handleCreateBackup = async () => {
    const res = await mutate('POST', '/api/backups', {
      label: `نسخة احتياطية كاملة · ${new Date().toLocaleTimeString('en-GB')}`,
    });
    if (res) pushToast('success', 'تم إنشاء نسخة احتياطية مشفرة على الخادم');
  };

  const handleRestoreBackup = async (backupId: string) => {
    const res = await mutate('POST', `/api/backups/${backupId}/restore`, {});
    if (res) pushToast('success', 'تمت استعادة البيانات والتحقق من سلامة الجداول');
  };

  const handleDownloadJsonSnapshot = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aqarplus-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.06]">
          {(mode === 'all' || mode === 'reports') && (
            <button
              onClick={() => setTab('reports')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'reports' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ar' ? 'التقارير والتصدير' : 'Reports & Export'}
            </button>
          )}
          {mode === 'all' && (
            <button
              onClick={() => setTab('documents')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'documents' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ar' ? `الأرشيف والمستندات (${state.documents.length})` : `Documents (${state.documents.length})`}
            </button>
          )}
          {(mode === 'all' || mode === 'team') && (
            <button
              onClick={() => setTab('rbac')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'rbac' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ar' ? 'فريق العمل والصلاحيات وسجل التدقيق' : 'Team, RBAC & Audit Log'}
            </button>
          )}
          {(mode === 'all' || mode === 'reports') && (
            <button
              onClick={() => setTab('backups')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'backups' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ar' ? 'النسخ الاحتياطي وقائمة القبول' : 'Backups & Acceptance'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PrintViewButton />
          {tab === 'rbac' && hasPermission('manage_users') && (
            <button
              onClick={() => setShowAddDecision(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white cursor-pointer"
            >
              <Gavel className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إصدار قرار إداري' : 'New Decision'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Reports & KPIs */}
      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">تقرير التحصيل المالي وسندات القبض</h3>
                <button
                  onClick={handleDownloadCollectionCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#26478D] text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير CSV / Excel</span>
                </button>
              </div>
              <p className="text-xs text-slate-500">
                يشمل جميع سندات القبض المعتمدة والمعكوسة، وطرق الدفع، وتفاصيل المستأجرين.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">تقرير الإشغال وأداء العقارات</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadOccupancyCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#26478D] text-white text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير CSV</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة</span>
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                ملخص نسب الإشغال، الوحدات الشاغرة، وتكاليف الصيانة التشغيلية لكل عقار.
              </p>
            </div>
          </div>

          {/* Property Performance Breakdown */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-3 px-4 text-start font-medium">العقار</th>
                  <th className="py-3 px-4 text-start font-medium">الوحدات / الإشغال</th>
                  <th className="py-3 px-4 text-start font-medium">التحصيل الفعلي</th>
                  <th className="py-3 px-4 text-start font-medium">المتأخرات المفتوحة</th>
                  <th className="py-3 px-4 text-start font-medium">تكلفة الصيانة والمصروفات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {state.properties.map((p) => {
                  const pUnits = state.units.filter((u) => u.propertyId === p.id);
                  const leased = pUnits.filter((u) => u.status === 'مؤجرة' || u.status === 'متأخرة في السداد').length;
                  const collected = state.payments
                    .filter((pay) => pay.propertyId === p.id && pay.status === 'معتمد')
                    .reduce((s, pay) => s + convertToBase(pay.amount, pay.currency || 'SAR'), 0);
                  const openBal = state.installments
                    .filter((i) => i.propertyId === p.id && i.status !== 'ملغاة')
                    .reduce((s, i) => s + convertToBase(i.remainingAmount, i.currency || 'SAR'), 0);
                  const expenses = state.expenses
                    .filter((e) => e.propertyId === p.id && e.approvalStatus === 'معتمد')
                    .reduce((s, e) => s + convertToBase(e.amount, e.currency || 'SAR'), 0);
                  return (
                    <tr key={p.id}>
                      <td className="py-3 px-4 font-semibold">{p.nameAr}</td>
                      <td className="py-3 px-4 font-mono-num">
                        {leased}/{pUnits.length} ({pUnits.length > 0 ? Math.round((leased / pUnits.length) * 100) : 0}%)
                      </td>
                      <td className="py-3 px-4 font-mono-num text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(collected, baseCurrency, lang)}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-amber-600 dark:text-amber-400">
                        {formatCurrency(openBal, baseCurrency, lang)}
                      </td>
                      <td className="py-3 px-4 font-mono-num">{formatCurrency(expenses, baseCurrency, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Central Document Archive + AI OCR */}
      {tab === 'documents' && <DocumentArchiveOcrPanel />}

      {/* Tab 3: RBAC Matrix & Immutable Audit Log */}
      {tab === 'rbac' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
              <h3 className="text-sm font-semibold">مصفوفة الأدوار والصلاحيات (قابلة للتعديل الفوري من المدير العام)</h3>
            </div>
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-4 text-start font-medium">الصلاحية</th>
                  {(['gm', 'accountant', 'leasing', 'supervisor', 'technician'] as RoleKey[]).map((r) => (
                    <th key={r} className="py-2.5 px-3 text-center font-medium">
                      {r === 'gm' ? 'المدير' : r === 'accountant' ? 'المحاسب' : r === 'leasing' ? 'التأجير' : r === 'supervisor' ? 'المشرف' : 'الفني'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {PERMISSION_LABELS.map((perm) => (
                  <tr key={perm.key}>
                    <td className="py-2.5 px-4 font-medium">{perm.labelAr}</td>
                    {(['gm', 'accountant', 'leasing', 'supervisor', 'technician'] as RoleKey[]).map((role) => {
                      const checked = (state.rolePermissions[role] || []).includes(perm.key);
                      return (
                        <td key={role} className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!hasPermission('manage_users')}
                            onChange={() => handleTogglePerm(role, perm.key)}
                            className="cursor-pointer accent-[#26478D]"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Executive Decisions Log */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gavel className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <h3 className="text-sm font-semibold">
                  {lang === 'ar'
                    ? `سجل القرارات الإدارية والسياسات (${(state.decisions || []).length})`
                    : `Executive Decisions Log (${(state.decisions || []).length})`}
                </h3>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {(state.decisions || []).map((dec) => (
                <div key={dec.id} className="p-4 flex flex-wrap items-start justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-bold text-[#26478D] dark:text-blue-400">{dec.decisionNumber}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold">{dec.title}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{dec.summary}</p>
                    <div className="text-[11px] text-slate-500">
                      التصنيف: {dec.category} · أصدره: {dec.issuedByName} · نافذ من{' '}
                      <span className="font-mono-num">{dec.effectiveDate}</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                    {dec.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10">
              <h3 className="text-sm font-semibold">سجل التدقيق غير القابل للتعديل ({state.auditLogs.length})</h3>
            </div>
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-4 text-start font-medium">الوقت</th>
                  <th className="py-2.5 px-4 text-start font-medium">الموظف والجهاز</th>
                  <th className="py-2.5 px-4 text-start font-medium">العملية</th>
                  <th className="py-2.5 px-4 text-start font-medium">التفاصيل والتغييرات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {state.auditLogs.slice(0, 25).map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4 font-mono-num text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt, lang)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold">{log.userName}</div>
                      <div className="text-[11px] text-slate-500">
                        {log.userRole} · {log.deviceName}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-medium">{log.action}</td>
                    <td className="py-2.5 px-4">
                      <div>{log.summary}</div>
                      {(log.oldValue || log.newValue || log.reason) && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {log.oldValue ? `قبل: ${log.oldValue} ` : ''}
                          {log.newValue ? `← بعد: ${log.newValue} ` : ''}
                          {log.reason ? `· السبب: ${log.reason}` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Backups, Restore & 18-Point Acceptance Checklist */}
      {tab === 'backups' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <h3 className="text-sm font-bold">النسخ الاحتياطي والاستعادة</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadJsonSnapshot}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs cursor-pointer"
                  >
                    تنزيل JSON
                  </button>
                  {hasPermission('backup_restore') && (
                    <button
                      onClick={handleCreateBackup}
                      className="px-3 py-1.5 rounded-lg bg-[#26478D] text-white text-xs font-semibold cursor-pointer"
                    >
                      إنشاء نسخة الآن
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {state.backups.map((b) => (
                  <div key={b.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{b.label}</div>
                      <div className="text-[11px] text-slate-500 font-mono-num">
                        {formatDateTime(b.createdAt, lang)} · {b.sizeKb} KB · {b.recordCount} سجل
                      </div>
                    </div>
                    {hasPermission('backup_restore') && b.id !== 'bkp-1' && (
                      <button
                        onClick={() => handleRestoreBackup(b.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-[11px] cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>استعادة</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Settings Summary */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-2 text-xs">
              <div className="font-bold text-sm mb-2">إعدادات المنشأة والتكاملات السعودية</div>
              <div className="flex justify-between">
                <span className="text-slate-500">المنشأة</span>
                <span className="font-medium">{state.settings.nameAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرقم الضريبي (ZATCA)</span>
                <span className="font-mono-num">{state.settings.vatNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">مسار منصة إيجار</span>
                <span>{state.settings.ejarApiMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">حد اعتماد المشرف</span>
                <span className="font-mono-num">{formatSar(state.settings.supervisorApprovalThreshold, lang)}</span>
              </div>
            </div>

            {/* Bulk Excel/CSV Import Tool */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3 text-xs no-print">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-bold">الاستيراد الجماعي من Excel / CSV</h3>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadImportTemplate}
                  className="text-[11px] font-semibold text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                >
                  تنزيل قالب Excel
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={importType}
                  onChange={(e) => {
                    setImportType(e.target.value as 'units' | 'tenants');
                    setImportRows([]);
                    setImportPreviewCount(0);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                >
                  <option value="tenants">استيراد مستأجرين</option>
                  <option value="units">استيراد وحدات وعقارات</option>
                </select>
                <label className="px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/20 text-center cursor-pointer hover:border-[#26478D] truncate">
                  {importFileName || 'اختر ملف .xlsx / .csv'}
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkFileParse} className="hidden" />
                </label>
              </div>
              {importPreviewCount > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                  <span className="font-mono-num font-semibold text-emerald-700 dark:text-emerald-300">
                    جاهز للاستيراد: {importPreviewCount} صف
                  </span>
                  <button
                    type="button"
                    onClick={handleExecuteBulkImport}
                    className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                  >
                    تنفيذ الاستيراد
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold">قائمة قبول المشروع (المتطلبات الـ 18)</h3>
              </div>
              <span className="font-mono-num text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {checkedCriteria.filter(Boolean).length} / 18
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {ACCEPTANCE_ITEMS.map((item, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200/70 dark:border-white/10 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                >
                  <input
                    type="checkbox"
                    checked={checkedCriteria[idx]}
                    onChange={() =>
                      setCheckedCriteria((prev) => prev.map((v, i) => (i === idx ? !v : v)))
                    }
                    className="mt-0.5 accent-emerald-600"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Executive Decision Modal */}
      {showAddDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateDecision}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">إصدار قرار إداري / سياسة عمل</h3>
              <button type="button" onClick={() => setShowAddDecision(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <input
                required
                placeholder="عنوان القرار الإداري"
                value={decisionForm.title}
                onChange={(e) => setDecisionForm({ ...decisionForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={decisionForm.category}
                  onChange={(e) => setDecisionForm({ ...decisionForm, category: e.target.value as ExecutiveDecision['category'] })}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                >
                  <option value="سياسات">سياسات</option>
                  <option value="مالي">مالي</option>
                  <option value="عقود">عقود</option>
                  <option value="تشغيلي">تشغيلي</option>
                  <option value="صيانة">صيانة</option>
                </select>
                <input
                  type="date"
                  value={decisionForm.effectiveDate}
                  onChange={(e) => setDecisionForm({ ...decisionForm, effectiveDate: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                />
              </div>
              <textarea
                required
                rows={3}
                placeholder="نص وتفاصيل القرار الإداري..."
                value={decisionForm.summary}
                onChange={(e) => setDecisionForm({ ...decisionForm, summary: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddDecision(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                اعتماد وتعميم القرار
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
