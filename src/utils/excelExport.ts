import * as XLSX from 'xlsx';
import { AqarDatabaseState, CurrencyCode, Installment, Payment, StaffUser } from '../types/aqar';
import { convertCurrency, DEFAULT_CURRENCY_RATES_TO_SAR, formatDateTime } from './formatters';

interface ExportFinanceReportParams {
  state: AqarDatabaseState;
  lang: 'ar' | 'en';
  currentUser: StaffUser | null;
  filteredInstallments: Installment[];
  filteredPayments: Payment[];
  statusFilter: 'all' | 'open' | 'paid';
  searchQuery: string;
  baseCurrency?: CurrencyCode;
  currencyRates?: Partial<Record<CurrencyCode, number>>;
}

export function exportFinanceReportToExcel({
  state,
  lang,
  currentUser,
  filteredInstallments,
  filteredPayments,
  statusFilter,
  searchQuery,
  baseCurrency = 'SAR',
  currencyRates = DEFAULT_CURRENCY_RATES_TO_SAR,
}: ExportFinanceReportParams): string {
  const isAr = lang === 'ar';
  const wb = XLSX.utils.book_new();
  const toBase = (amt: number, cur?: CurrencyCode) =>
    convertCurrency(amt, cur || 'SAR', baseCurrency, currencyRates);

  // Compute portfolio & filtered financial statistics converted to baseCurrency
  const activeInstallments = state.installments.filter((i) => i.status !== 'ملغاة');
  const totalDue = activeInstallments.reduce((s, i) => s + toBase(i.amount, i.currency), 0);
  const totalCollected = activeInstallments.reduce((s, i) => s + toBase(i.paidAmount, i.currency), 0);
  const totalRemaining = activeInstallments.reduce((s, i) => s + toBase(i.remainingAmount, i.currency), 0);
  const collectionRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 10000) / 100 : 0;

  const overdueInstallments = activeInstallments.filter(
    (i) => (i.status === 'متأخرة' || i.status === 'مدفوعة جزئياً' || i.status === 'مستحقة اليوم') && i.remainingAmount > 0
  );
  const overdueAmount = overdueInstallments.reduce((s, i) => s + toBase(i.remainingAmount, i.currency), 0);

  const approvedPayments = state.payments.filter((p) => p.status === 'معتمد');
  const reversedPayments = state.payments.filter((p) => p.status === 'معكوس');
  const approvedTotal = approvedPayments.reduce((s, p) => s + toBase(p.amount, p.currency), 0);
  const reversedTotal = reversedPayments.reduce((s, p) => s + toBase(p.amount, p.currency), 0);

  const filterLabel =
    statusFilter === 'open'
      ? isAr
        ? 'المستحقة والمتبقية'
        : 'Open / Due'
      : statusFilter === 'paid'
      ? isAr
        ? 'المدفوعة بالكامل'
        : 'Paid'
      : isAr
      ? 'الكل'
      : 'All';

  // --- Sheet 1: Financial Summary & Statistics ---
  const summaryRows: (string | number)[][] = [
    [isAr ? 'التقرير المالي وإحصائيات التحصيل — AqarPlus' : 'AqarPlus — Financial & Collection Audit Report'],
    [isAr ? 'الشركة' : 'Company', isAr ? state.settings.nameAr : state.settings.nameEn, isAr ? 'العملة الأساسية للتقرير' : 'Base Currency', baseCurrency],
    [isAr ? 'السجل التجاري' : 'CR Number', state.settings.crNumber, isAr ? 'الرقم الضريبي' : 'VAT Number', state.settings.vatNumber],
    [
      isAr ? 'تاريخ التصدير' : 'Exported At',
      new Date().toISOString().replace('T', ' ').slice(0, 19),
      isAr ? 'أُعد بواسطة' : 'Prepared By',
      currentUser ? `${isAr ? currentUser.nameAr : currentUser.nameEn} (${isAr ? currentUser.roleLabelAr : currentUser.roleLabelEn})` : '—',
    ],
    [
      isAr ? 'فلتر الجدول المطبق' : 'Active Filter',
      filterLabel,
      isAr ? 'نص البحث' : 'Search Query',
      searchQuery.trim() || (isAr ? 'بدون' : 'None'),
    ],
    [],
    [isAr ? `أولاً: مؤشرات الأداء المالي الرئيسية (محولة إلى ${baseCurrency})` : `1. Core Portfolio Financial KPIs (${baseCurrency})`],
    [isAr ? 'المؤشر المالي' : 'Metric', isAr ? 'القيمة' : 'Value', isAr ? 'ملاحظات محاسبية' : 'Accounting Notes'],
    [isAr ? 'عدد الأقساط النشطة' : 'Active Installments Count', activeInstallments.length, isAr ? 'باستثناء الملغاة' : 'Excluding cancelled'],
    [isAr ? `إجمالي الاستحقاقات (${baseCurrency})` : `Total Due (${baseCurrency})`, Math.round(totalDue * 100) / 100, ''],
    [isAr ? `إجمالي المحصل الفعلي (${baseCurrency})` : `Total Collected (${baseCurrency})`, Math.round(totalCollected * 100) / 100, ''],
    [isAr ? `الرصيد المتبقي للتحصيل (${baseCurrency})` : `Remaining Receivable (${baseCurrency})`, Math.round(totalRemaining * 100) / 100, ''],
    [isAr ? 'نسبة التحصيل الإجمالية (%)' : 'Overall Collection Rate (%)', `${collectionRate}%`, ''],
    [
      isAr ? 'الأقساط المتأخرة والمستحقة حالياً' : 'Overdue / Actionable Installments',
      overdueInstallments.length,
      isAr ? `بقيمة متبقية ${Math.round(overdueAmount * 100) / 100} ${baseCurrency}` : `Remaining ${Math.round(overdueAmount * 100) / 100} ${baseCurrency}`,
    ],
    [isAr ? 'عدد سندات القبض المعتمدة' : 'Approved Receipts Count', approvedPayments.length, ''],
    [isAr ? `إجمالي السندات المعتمدة (${baseCurrency})` : `Approved Receipts Total (${baseCurrency})`, Math.round(approvedTotal * 100) / 100, ''],
    [
      isAr ? 'السندات المعكوسة (ملغاة محاسبياً)' : 'Reversed Receipts Count',
      reversedPayments.length,
      isAr ? `بقيمة ${Math.round(reversedTotal * 100) / 100} ${baseCurrency}` : `Total ${Math.round(reversedTotal * 100) / 100} ${baseCurrency}`,
    ],
    [],
    [isAr ? 'ثانياً: ملخص التحصيل حسب العقار' : '2. Collection Breakdown by Property'],
    [
      isAr ? 'رمز العقار' : 'Code',
      isAr ? 'اسم العقار' : 'Property',
      isAr ? `المستحق (${baseCurrency})` : `Total Due (${baseCurrency})`,
      isAr ? `المحصل (${baseCurrency})` : `Collected (${baseCurrency})`,
      isAr ? `المتبقي (${baseCurrency})` : `Remaining (${baseCurrency})`,
      isAr ? 'نسبة التحصيل (%)' : 'Collection Rate (%)',
    ],
    ...state.properties.map((prop) => {
      const propInst = activeInstallments.filter((i) => i.propertyId === prop.id);
      const due = propInst.reduce((s, i) => s + toBase(i.amount, i.currency), 0);
      const paid = propInst.reduce((s, i) => s + toBase(i.paidAmount, i.currency), 0);
      const rem = propInst.reduce((s, i) => s + toBase(i.remainingAmount, i.currency), 0);
      const pct = due > 0 ? Math.round((paid / due) * 10000) / 100 : 0;
      return [prop.code, isAr ? prop.nameAr : prop.nameEn, Math.round(due * 100) / 100, Math.round(paid * 100) / 100, Math.round(rem * 100) / 100, `${pct}%`];
    }),
    [],
    [isAr ? 'ثالثاً: توزيع السندات المعتمدة حسب طريقة الدفع' : '3. Approved Receipts by Payment Method'],
    [isAr ? 'طريقة الدفع' : 'Payment Method', isAr ? 'عدد السندات' : 'Count', isAr ? `الإجمالي (${baseCurrency})` : `Total (${baseCurrency})`],
  ];

  const byMethod = new Map<string, { count: number; total: number }>();
  for (const pay of approvedPayments) {
    const cur = byMethod.get(pay.paymentMethod) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += toBase(pay.amount, pay.currency);
    byMethod.set(pay.paymentMethod, cur);
  }
  for (const [method, info] of byMethod.entries()) {
    summaryRows.push([method, info.count, Math.round(info.total * 100) / 100]);
  }

  summaryRows.push([], [isAr ? 'رابعاً: توزيع السندات المعتمدة حسب نوع العملية' : '4. Approved Receipts by Payment Type']);
  summaryRows.push([isAr ? 'نوع العملية' : 'Payment Type', isAr ? 'عدد السندات' : 'Count', isAr ? `الإجمالي (${baseCurrency})` : `Total (${baseCurrency})`]);

  const byType = new Map<string, { count: number; total: number }>();
  for (const pay of approvedPayments) {
    const cur = byType.get(pay.paymentType) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += toBase(pay.amount, pay.currency);
    byType.set(pay.paymentType, cur);
  }
  for (const [pType, info] of byType.entries()) {
    summaryRows.push([pType, info.count, Math.round(info.total * 100) / 100]);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 36 }, { wch: 24 }, { wch: 22 }, { wch: 26 }, { wch: 18 }, { wch: 18 }];
  wsSummary['!views'] = [{ rightToLeft: isAr }];
  XLSX.utils.book_append_sheet(wb, wsSummary, isAr ? 'ملخص وإحصائيات' : 'Financial Summary');

  // --- Sheet 2: Filtered Installments Schedule ---
  const instHeaders = isAr
    ? ['رقم العقد', 'رقم القسط', 'العقار', 'الوحدة', 'المستأجر', 'تاريخ الاستحقاق', 'العملة', 'قيمة القسط', 'المدفوع', 'المتبقي', `المتبقي (${baseCurrency})`, 'نسبة السداد (%)', 'الحالة']
    : ['Contract No.', 'Installment #', 'Property', 'Unit', 'Tenant', 'Due Date', 'Currency', 'Amount', 'Paid', 'Remaining', `Remaining (${baseCurrency})`, 'Paid %', 'Status'];

  const instRows: (string | number)[][] = filteredInstallments.map((inst) => {
    const tenant = state.tenants.find((t) => t.id === inst.tenantId);
    const unit = state.units.find((u) => u.id === inst.unitId);
    const prop = state.properties.find((p) => p.id === inst.propertyId);
    const contract = state.contracts.find((c) => c.id === inst.contractId);
    const pct = inst.amount > 0 ? Math.round((inst.paidAmount / inst.amount) * 10000) / 100 : 0;
    const cur = inst.currency || contract?.currency || 'SAR';
    return [
      contract?.internalNumber || inst.contractId,
      inst.installmentNumber,
      (isAr ? prop?.nameAr : prop?.nameEn) || '—',
      unit?.unitNumber || '—',
      (isAr ? tenant?.nameAr : tenant?.nameEn) || '—',
      inst.dueDate,
      cur,
      inst.amount,
      inst.paidAmount,
      inst.remainingAmount,
      toBase(inst.remainingAmount, cur),
      `${pct}%`,
      inst.status,
    ];
  });

  const filtDueSum = filteredInstallments.reduce((s, i) => s + toBase(i.amount, i.currency), 0);
  const filtPaidSum = filteredInstallments.reduce((s, i) => s + toBase(i.paidAmount, i.currency), 0);
  const filtRemSum = filteredInstallments.reduce((s, i) => s + toBase(i.remainingAmount, i.currency), 0);
  instRows.push([
    isAr ? `الإجمالي (${baseCurrency})` : `Total (${baseCurrency})`,
    filteredInstallments.length,
    '',
    '',
    '',
    '',
    baseCurrency,
    Math.round(filtDueSum * 100) / 100,
    Math.round(filtPaidSum * 100) / 100,
    Math.round(filtRemSum * 100) / 100,
    Math.round(filtRemSum * 100) / 100,
    filtDueSum > 0 ? `${Math.round((filtPaidSum / filtDueSum) * 10000) / 100}%` : '0%',
    '',
  ]);

  const wsInst = XLSX.utils.aoa_to_sheet([instHeaders, ...instRows]);
  wsInst['!cols'] = [
    { wch: 16 },
    { wch: 11 },
    { wch: 24 },
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
  ];
  wsInst['!views'] = [{ rightToLeft: isAr }];
  XLSX.utils.book_append_sheet(wb, wsInst, isAr ? 'جدول الاستحقاقات' : 'Installments');

  // --- Sheet 3: Payment Receipts ---
  const payHeaders = isAr
    ? ['رقم السند', 'نوع العملية', 'طريقة الدفع', 'العملة', 'المبلغ', `المعادل (${baseCurrency})`, 'الحالة', 'المستأجر', 'العقار', 'الوحدة', 'رقم العقد', 'المرجع / الحوالة', 'التاريخ والوقت', 'الملاحظات']
    : ['Receipt No.', 'Type', 'Method', 'Currency', 'Amount', `Converted (${baseCurrency})`, 'Status', 'Tenant', 'Property', 'Unit', 'Contract No.', 'Reference', 'Date & Time', 'Notes'];

  const payRows: (string | number)[][] = filteredPayments.map((pay) => {
    const tenant = state.tenants.find((t) => t.id === pay.tenantId);
    const unit = state.units.find((u) => u.id === pay.unitId);
    const prop = state.properties.find((p) => p.id === pay.propertyId);
    const contract = state.contracts.find((c) => c.id === pay.contractId);
    const cur = pay.currency || contract?.currency || 'SAR';
    return [
      pay.receiptNumber,
      pay.paymentType,
      pay.paymentMethod,
      cur,
      pay.amount,
      toBase(pay.amount, cur),
      pay.status,
      (isAr ? tenant?.nameAr : tenant?.nameEn) || '—',
      (isAr ? prop?.nameAr : prop?.nameEn) || '—',
      unit?.unitNumber || '—',
      contract?.internalNumber || '—',
      pay.referenceNumber || '—',
      formatDateTime(pay.createdAt, lang),
      pay.notes || pay.reversalReason || '',
    ];
  });

  const filtApprovedSum = filteredPayments
    .filter((p) => p.status === 'معتمد')
    .reduce((s, p) => s + toBase(p.amount, p.currency), 0);
  payRows.push([
    isAr ? `إجمالي المعتمد (${baseCurrency})` : `Approved Total (${baseCurrency})`,
    '',
    '',
    baseCurrency,
    Math.round(filtApprovedSum * 100) / 100,
    Math.round(filtApprovedSum * 100) / 100,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  const wsPay = XLSX.utils.aoa_to_sheet([payHeaders, ...payRows]);
  wsPay['!cols'] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 15 },
    { wch: 16 },
    { wch: 12 },
    { wch: 24 },
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 28 },
  ];
  wsPay['!views'] = [{ rightToLeft: isAr }];
  XLSX.utils.book_append_sheet(wb, wsPay, isAr ? 'سندات القبض' : 'Payment Receipts');

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `AqarPlus-Financial-Report-${baseCurrency}-${dateStr}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

