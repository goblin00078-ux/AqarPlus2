import React, { useMemo, useState } from 'react';
import { Plus, CheckCircle2, XCircle, X, Send, Scale, FileSpreadsheet, ShoppingCart } from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { CurrencyCode, ExpenseCategory, Owner, PaymentMethod, PurchaseOrderStatus } from '../types/aqar';
import { CURRENCY_META, formatCurrency } from '../utils/formatters';
import { PrintViewButton } from './PrintViewButton';

export function AccountingOwnersView() {
  const {
    state,
    currentUser,
    lang,
    hasPermission,
    mutate,
    pushToast,
    baseCurrency,
    convertToBase,
    formatInCurrency,
    formatConvertedBase,
  } = useAqar();
  const [tab, setTab] = useState<'owners' | 'expenses' | 'accounting' | 'vendors'>(
    currentUser?.role === 'owner' ? 'owners' : 'expenses'
  );
  const [accSubTab, setAccSubTab] = useState<'ledger' | 'trial' | 'statements'>('ledger');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [transferOwner, setTransferOwner] = useState<Owner | null>(null);
  const [showAddPo, setShowAddPo] = useState(false);

  const [expForm, setExpForm] = useState({
    category: 'صيانة' as ExpenseCategory,
    propertyId: '',
    unitId: '',
    vendorId: '',
    invoiceNumber: '',
    amount: 450,
    currency: 'SAR' as CurrencyCode,
    paymentMethod: 'تحويل بنكي' as PaymentMethod,
    bearer: 'المالك' as 'المالك' | 'الشركة' | 'المستأجر',
    notes: '',
  });

  const [vendorForm, setVendorForm] = useState({
    nameAr: '',
    nameEn: '',
    crNumber: '',
    category: 'صيانة عامة',
    phone: '',
    email: '',
  });

  const [transferForm, setTransferForm] = useState({
    amount: 10000,
    currency: 'SAR' as CurrencyCode,
    paymentMethod: 'تحويل بنكي' as PaymentMethod,
    referenceNumber: '',
    notes: '',
  });

  const [poForm, setPoForm] = useState({
    title: '',
    propertyId: '',
    category: 'صيانة وتكييف',
    vendor1Id: '',
    vendor1Amount: 1500,
    vendor2Id: '',
    vendor2Amount: 1850,
    currency: 'SAR' as CurrencyCode,
  });

  const ownerStatements = useMemo(() => {
    if (!state) return [];
    return state.owners.map((owner) => {
      const ownedProps = state.properties.filter((p) =>
        p.ownerShares.some((s) => s.ownerId === owner.id)
      );
      let grossRent = 0;
      let managementFee = 0;
      let approvedExpenses = 0;

      for (const prop of ownedProps) {
        const share = prop.ownerShares.find((s) => s.ownerId === owner.id)?.sharePercent || 0;
        const factor = share / 100;

        const propCollected = state.payments
          .filter((p) => p.propertyId === prop.id && p.status === 'معتمد' && p.paymentType === 'إيجار')
          .reduce((s, p) => s + convertToBase(p.amount, p.currency || 'SAR'), 0);

        const propMgmt = propCollected * (prop.managementFeePercent / 100);
        const propExpenses = state.expenses
          .filter((e) => e.propertyId === prop.id && e.approvalStatus === 'معتمد' && e.bearer === 'المالك')
          .reduce((s, e) => s + convertToBase(e.amount, e.currency || 'SAR'), 0);

        grossRent += propCollected * factor;
        managementFee += propMgmt * factor;
        approvedExpenses += propExpenses * factor;
      }

      const transferredInBase = convertToBase(owner.totalTransferred, 'SAR');
      const netPayable = grossRent - managementFee - approvedExpenses - transferredInBase;

      return {
        owner,
        ownedProps,
        grossRent: Math.round(grossRent * 100) / 100,
        managementFee: Math.round(managementFee * 100) / 100,
        approvedExpenses: Math.round(approvedExpenses * 100) / 100,
        transferredInBase: Math.round(transferredInBase * 100) / 100,
        netPayable: Math.round(netPayable * 100) / 100,
      };
    });
  }, [state, convertToBase]);

  if (!state || !currentUser) return null;

  const isOwner = currentUser.role === 'owner';

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const propertyId = expForm.propertyId || state.properties[0]?.id;
    const res = await mutate(
      'POST',
      '/api/expenses',
      {
        ...expForm,
        propertyId,
        date: new Date().toISOString().slice(0, 10),
      },
      { offlineDescAr: `تسجيل مصروف ${expForm.amount} ${CURRENCY_META[expForm.currency].symbolAr}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تم رفع المصروف وإرساله لسير الاعتماد' : 'Expense submitted for approval');
      setShowAddExpense(false);
    }
  };

  const handleExpenseDecision = async (expenseId: string, decision: 'approve' | 'reject') => {
    const res = await mutate(
      'POST',
      `/api/expenses/${expenseId}/decision`,
      {
        decision,
        reason: decision === 'reject' ? 'مرفوض لعدم مطابقة الفاتورة' : undefined,
      },
      { offlineDescAr: decision === 'approve' ? 'اعتماد مصروف' : 'رفض مصروف' }
    );
    if (res) {
      pushToast('success', decision === 'approve' ? 'تم تحديث حالة الاعتماد وترحيل القيد عند الاكتمال' : 'تم رفض المصروف');
    }
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutate(
      'POST',
      '/api/vendors',
      { ...vendorForm, rating: 5, active: true },
      { offlineDescAr: `إضافة المورد ${vendorForm.nameAr}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تمت إضافة المقاول بنجاح' : 'Vendor added');
      setShowAddVendor(false);
    }
  };

  const handleOwnerTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferOwner) return;
    const res = await mutate(
      'POST',
      `/api/owners/${transferOwner.id}/transfer`,
      transferForm,
      { offlineDescAr: `تحويل مستحقات للمالك ${transferOwner.nameAr}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تم تسجيل التحويل المالي للمالك وترحيل القيد المتوازن' : 'Owner payout recorded');
      setTransferOwner(null);
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    const v1 = state.vendors.find((v) => v.id === (poForm.vendor1Id || state.vendors[0]?.id));
    const v2 = state.vendors.find((v) => v.id === poForm.vendor2Id);
    const quotes = [
      v1 && {
        vendorId: v1.id,
        vendorName: v1.nameAr,
        amount: poForm.vendor1Amount,
        deliveryDays: 2,
        warrantyMonths: 12,
        notes: 'العرض الأساسي',
      },
      v2 &&
        v2.id !== v1?.id && {
          vendorId: v2.id,
          vendorName: v2.nameAr,
          amount: poForm.vendor2Amount,
          deliveryDays: 3,
          warrantyMonths: 12,
          notes: 'عرض مقارنة ثانٍ',
        },
    ].filter(Boolean);

    const bestAmount = Math.min(poForm.vendor1Amount, v2 ? poForm.vendor2Amount : poForm.vendor1Amount);
    const res = await mutate(
      'POST',
      '/api/purchase-orders',
      {
        title: poForm.title,
        propertyId: poForm.propertyId || state.properties[0]?.id,
        category: poForm.category,
        status: 'مقارنة عروض',
        quotes,
        selectedVendorId: v1?.id,
        approvedAmount: bestAmount,
        currency: poForm.currency,
      },
      { offlineDescAr: `طلب شراء ${poForm.title}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تم إنشاء طلب الشراء ومقارنة عروض الموردين' : 'Purchase order created');
      setShowAddPo(false);
    }
  };

  const handleAdvancePoStatus = async (poId: string, status: PurchaseOrderStatus) => {
    const res = await mutate('PATCH', `/api/purchase-orders/${poId}`, { status });
    if (res) pushToast('success', lang === 'ar' ? `تمت ترقية الطلب إلى: ${status}` : `PO updated: ${status}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.06]">
          {!isOwner && (
            <button
              onClick={() => setTab('expenses')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'expenses' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ar' ? `المصروفات والموافقات (${state.expenses.length})` : `Expenses (${state.expenses.length})`}
            </button>
          )}
          <button
            onClick={() => setTab('owners')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              tab === 'owners' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {lang === 'ar' ? `كشوف وحسابات الملاك (${ownerStatements.length})` : `Owners & Statements`}
          </button>
          {!isOwner && (
            <>
              <button
                onClick={() => setTab('accounting')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tab === 'accounting' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ar' ? `دليل الحسابات والقيود (${state.journals.length})` : `Accounting & Journals`}
              </button>
              <button
                onClick={() => setTab('vendors')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tab === 'vendors' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ar' ? `الموردون والمقاولون (${state.vendors.length})` : `Vendors (${state.vendors.length})`}
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PrintViewButton
            labelAr={tab === 'owners' ? 'طباعة كشوف الملاك' : 'طباعة'}
            labelEn={tab === 'owners' ? 'Print Statements' : 'Print'}
          />
          {tab === 'expenses' && hasPermission('create_expense') && (
            <button
              onClick={() => setShowAddExpense(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تسجيل مصروف وفاتورة' : 'New Expense'}</span>
            </button>
          )}
          {tab === 'vendors' && hasPermission('manage_maintenance') && (
            <>
              <button
                onClick={() => setShowAddPo(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#26478D]/30 bg-[#26478D]/10 text-[#26478D] dark:text-blue-300 cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'طلب شراء / عروض أسعار' : 'New PO / Quotes'}</span>
              </button>
              <button
                onClick={() => setShowAddVendor(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'مقاول جديد' : 'Add Vendor'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab 1: Expenses & Multi-stage Approval */}
      {tab === 'expenses' && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="py-3 px-4 text-start font-medium">رقم المصروف / الفاتورة</th>
                <th className="py-3 px-4 text-start font-medium">التصنيف والعقار</th>
                <th className="py-3 px-4 text-start font-medium">المتحمل</th>
                <th className="py-3 px-4 text-start font-medium">المبلغ</th>
                <th className="py-3 px-4 text-start font-medium">حالة الاعتماد</th>
                <th className="py-3 px-4 text-start font-medium">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {state.expenses.map((exp) => {
                const prop = state.properties.find((p) => p.id === exp.propertyId);
                const canAct =
                  (exp.approvalStatus === 'بانتظار المشرف' && hasPermission('approve_expense_supervisor')) ||
                  (exp.approvalStatus === 'بانتظار المدير' && hasPermission('approve_expense_manager'));
                const isSelf = exp.createdBy === currentUser.id && currentUser.role !== 'gm';

                return (
                  <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4">
                      <div className="font-mono-num font-semibold">{exp.expenseNumber}</div>
                      <div className="text-[11px] text-slate-500 font-mono-num">
                        {exp.invoiceNumber} · {exp.date}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{exp.category} · {prop?.nameAr}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">{exp.notes}</div>
                    </td>
                    <td className="py-3 px-4">{exp.bearer}</td>
                    <td className="py-3 px-4 font-mono-num">
                      <div className="font-bold">{formatInCurrency(exp.amount, exp.currency || 'SAR')}</div>
                      {(exp.currency || 'SAR') !== baseCurrency && (
                        <div className="text-[11px] text-slate-500">
                          ≈ {formatConvertedBase(exp.amount, exp.currency || 'SAR')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          exp.approvalStatus === 'معتمد'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : exp.approvalStatus === 'مرفوض'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {exp.approvalStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {canAct && !isSelf ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleExpenseDecision(exp.id, 'approve')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>اعتماد</span>
                          </button>
                          <button
                            onClick={() => handleExpenseDecision(exp.id, 'reject')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 text-[11px] cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>رفض</span>
                          </button>
                        </div>
                      ) : isSelf && (exp.approvalStatus === 'بانتظار المشرف' || exp.approvalStatus === 'بانتظار المدير') ? (
                        <span className="text-[11px] text-slate-400">فصل مهام (لا يعتمد المنشئ)</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Owners & Statements */}
      {tab === 'owners' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {ownerStatements.map(({ owner, ownedProps, grossRent, managementFee, approvedExpenses, transferredInBase, netPayable }) => (
            <div key={owner.id} className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4 print-only-panel">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200 dark:border-white/10">
                <div>
                  <div className="text-xs text-slate-500 font-mono-num">
                    {owner.bankName} · {owner.iban}
                  </div>
                  <h3 className="text-lg font-bold mt-0.5">{owner.nameAr}</h3>
                </div>
                <div className="text-end">
                  <div className="text-[11px] text-slate-500">
                    {lang === 'ar' ? `صافي الرصيد (${baseCurrency})` : `Net Balance (${baseCurrency})`}
                  </div>
                  <div className="text-xl font-bold font-mono-num text-[#26478D] dark:text-blue-400">
                    {formatCurrency(netPayable, baseCurrency, lang)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">إجمالي الإيجارات المحصلة</div>
                  <div className="font-mono-num font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(grossRent, baseCurrency, lang)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">عمولة إدارة الأملاك</div>
                  <div className="font-mono-num font-semibold mt-0.5">-{formatCurrency(managementFee, baseCurrency, lang)}</div>
                </div>
                <div>
                  <div className="text-slate-500">مصروفات معتمدة</div>
                  <div className="font-mono-num font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                    -{formatCurrency(approvedExpenses, baseCurrency, lang)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">تحويلات سابقة</div>
                  <div className="font-mono-num font-semibold mt-0.5">-{formatCurrency(transferredInBase, baseCurrency, lang)}</div>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1">
                  العقارات المملوكة:{' '}
                  {ownedProps
                    .map((p) => {
                      const pct = p.ownerShares.find((s) => s.ownerId === owner.id)?.sharePercent || 0;
                      const comp = state.companies?.find((c) => c.id === p.companyId);
                      const mode = p.ownershipMode || 'إدارة للغير';
                      return `${p.nameAr} (${pct}% · ${mode}${comp ? ` · ${comp.nameAr}` : ''})`;
                    })
                    .join(' · ')}
                </div>
                {hasPermission('manage_accounting') && !isOwner && (
                  <button
                    onClick={() => {
                      setTransferForm({
                        amount: Math.max(0, Math.round(netPayable)),
                        currency: baseCurrency,
                        paymentMethod: 'تحويل بنكي',
                        referenceNumber: `TR-${Math.floor(10000 + Math.random() * 89999)}`,
                        notes: `سداد صافي مستحقات ${owner.nameAr}`,
                      });
                      setTransferOwner(owner);
                    }}
                    className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#26478D] text-white text-[11px] font-semibold hover:bg-[#1e3a75] cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'تحويل مستحقات' : 'Transfer Payout'}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Double-Entry Accounting, Trial Balance & Financial Statements */}
      {tab === 'accounting' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              onClick={() => setAccSubTab('ledger')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                accSubTab === 'ledger' ? 'bg-[#26478D] text-white' : 'border border-slate-200 dark:border-white/10 glass-surface'
              }`}
            >
              {lang === 'ar' ? 'دليل الحسابات والقيود اليومية' : 'Accounts & Journals'}
            </button>
            <button
              onClick={() => setAccSubTab('trial')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                accSubTab === 'trial' ? 'bg-[#26478D] text-white' : 'border border-slate-200 dark:border-white/10 glass-surface'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'ميزان المراجعة (Trial Balance)' : 'Trial Balance'}</span>
            </button>
            <button
              onClick={() => setAccSubTab('statements')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                accSubTab === 'statements' ? 'bg-[#26478D] text-white' : 'border border-slate-200 dark:border-white/10 glass-surface'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'قائمة الدخل والمركز المالي' : 'Income Statement & Balance Sheet'}</span>
            </button>
          </div>

          {accSubTab === 'ledger' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10">
                  <h3 className="text-sm font-semibold">دليل الحسابات العقاري</h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/5 text-xs">
                  {state.accounts.map((acc) => (
                    <div key={acc.id} className="px-5 py-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          <span className="font-mono-num text-slate-400 me-2">{acc.code}</span>
                          {acc.nameAr}
                        </div>
                        <div className="text-[11px] text-slate-500">{acc.type}</div>
                      </div>
                      <div className="font-mono-num font-bold">{formatConvertedBase(acc.balance, 'SAR')}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10">
                  <h3 className="text-sm font-semibold">القيود اليومية التلقائية المتوازنة</h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[540px] overflow-y-auto">
                  {state.journals.map((j) => (
                    <div key={j.id} className="p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-num font-bold text-[#26478D] dark:text-blue-400">
                          {j.entryNumber} · {j.referenceType}
                        </span>
                        <span className="font-mono-num text-slate-500">{j.date}</span>
                      </div>
                      <div className="text-slate-700 dark:text-slate-200">{j.description}</div>
                      <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
                        {j.lines.map((l, idx) => (
                          <div key={idx} className="px-3 py-1.5 flex items-center justify-between font-mono-num text-[11px]">
                            <span className="font-sans">{l.accountName}</span>
                            <div className="flex gap-4">
                              <span className={l.debit > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
                                مدين: {l.debit.toLocaleString()}
                              </span>
                              <span className={l.credit > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-400'}>
                                دائن: {l.credit.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {accSubTab === 'trial' && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-bold">
                  {lang === 'ar' ? `ميزان المراجعة بالأرصدة (${baseCurrency})` : `Trial Balance (${baseCurrency})`}
                </h3>
              </div>
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-3 px-4 text-start font-medium">الرمز</th>
                    <th className="py-3 px-4 text-start font-medium">اسم الحساب</th>
                    <th className="py-3 px-4 text-start font-medium">التصنيف</th>
                    <th className="py-3 px-4 text-start font-medium">رصيد مدين</th>
                    <th className="py-3 px-4 text-start font-medium">رصيد دائن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {state.accounts.map((acc) => {
                    const isDebitNature = acc.type === 'أصول' || acc.type === 'مصروفات';
                    const val = convertToBase(acc.balance, 'SAR');
                    return (
                      <tr key={acc.id}>
                        <td className="py-3 px-4 font-mono-num text-slate-500">{acc.code}</td>
                        <td className="py-3 px-4 font-semibold">{acc.nameAr}</td>
                        <td className="py-3 px-4">{acc.type}</td>
                        <td className="py-3 px-4 font-mono-num text-emerald-600 dark:text-emerald-400">
                          {isDebitNature ? formatCurrency(val, baseCurrency, lang) : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono-num text-amber-600 dark:text-amber-400">
                          {!isDebitNature ? formatCurrency(val, baseCurrency, lang) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {accSubTab === 'statements' && (() => {
            const totalAssets = state.accounts
              .filter((a) => a.type === 'أصول')
              .reduce((s, a) => s + convertToBase(a.balance, 'SAR'), 0);
            const totalLiab = state.accounts
              .filter((a) => a.type === 'التزامات')
              .reduce((s, a) => s + convertToBase(a.balance, 'SAR'), 0);
            const totalRev = state.accounts
              .filter((a) => a.type === 'إيرادات')
              .reduce((s, a) => s + convertToBase(a.balance, 'SAR'), 0);
            const totalExp = state.accounts
              .filter((a) => a.type === 'مصروفات')
              .reduce((s, a) => s + convertToBase(a.balance, 'SAR'), 0);
            const netIncome = totalRev - totalExp;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
                  <h3 className="text-sm font-bold border-b border-slate-200 dark:border-white/10 pb-3">
                    {lang === 'ar' ? `قائمة الدخل التشغيلية (${baseCurrency})` : `Operating Income Statement (${baseCurrency})`}
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    {state.accounts
                      .filter((a) => a.type === 'إيرادات' || a.type === 'مصروفات')
                      .map((a) => (
                        <div key={a.id} className="flex justify-between">
                          <span>
                            {a.nameAr} <span className="text-slate-400">({a.type})</span>
                          </span>
                          <span className={`font-mono-num font-semibold ${a.type === 'إيرادات' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {a.type === 'مصروفات' ? '-' : ''}
                            {formatConvertedBase(a.balance, 'SAR')}
                          </span>
                        </div>
                      ))}
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex justify-between text-sm font-bold">
                    <span>صافي الربح / الفائض التشغيلي</span>
                    <span className="font-mono-num text-[#26478D] dark:text-blue-400">
                      {formatCurrency(netIncome, baseCurrency, lang)}
                    </span>
                  </div>
                </div>

                <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
                  <h3 className="text-sm font-bold border-b border-slate-200 dark:border-white/10 pb-3">
                    {lang === 'ar' ? `ملخص المركز المالي (${baseCurrency})` : `Balance Sheet Summary (${baseCurrency})`}
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span>إجمالي الأصول والنقدية والذمم</span>
                      <span className="font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalAssets, baseCurrency, lang)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>إجمالي الالتزامات ومستحقات الملاك والتأمينات</span>
                      <span className="font-mono-num font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(totalLiab, baseCurrency, lang)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200/70 dark:border-white/10 font-bold text-sm">
                      <span>صافي المركز وحقوق الإدارة</span>
                      <span className="font-mono-num text-[#26478D] dark:text-blue-400">
                        {formatCurrency(totalAssets - totalLiab, baseCurrency, lang)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Tab 4: Vendors & Purchase Orders / Quote Comparison */}
      {tab === 'vendors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state.vendors.map((v) => (
              <div key={v.id} className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-bold">{v.nameAr}</div>
                    <div className="text-[11px] text-slate-500">{v.category} · سجل {v.crNumber}</div>
                  </div>
                  <span className="font-mono-num text-xs font-semibold text-amber-500">{v.rating}/5</span>
                </div>
                <div className="text-xs text-slate-500 font-mono-num">
                  {v.phone} · {v.email}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <h3 className="text-sm font-bold">
                  {lang === 'ar'
                    ? `طلبات الشراء ومقارنة عروض الأسعار (${(state.purchaseOrders || []).length})`
                    : `Purchase Orders & Quote Comparison (${(state.purchaseOrders || []).length})`}
                </h3>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {(state.purchaseOrders || []).map((po) => {
                const prop = state.properties.find((p) => p.id === po.propertyId);
                return (
                  <div key={po.id} className="p-5 space-y-3 text-xs">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono-num font-bold text-[#26478D] dark:text-blue-400">
                          {po.poNumber} · {prop?.nameAr}
                        </div>
                        <div className="text-sm font-bold mt-0.5">{po.title}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num font-bold text-sm">
                          {formatInCurrency(po.approvedAmount, po.currency)}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold">
                          {po.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {po.quotes.map((q, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border ${
                            q.vendorId === po.selectedVendorId
                              ? 'border-emerald-400/70 bg-emerald-50/60 dark:bg-emerald-500/[0.06]'
                              : 'border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]'
                          } flex items-center justify-between gap-2`}
                        >
                          <div>
                            <div className="font-semibold">{q.vendorName}</div>
                            <div className="text-[11px] text-slate-500">
                              تنفيذ: {q.deliveryDays} أيام · ضمان: {q.warrantyMonths} شهر
                            </div>
                          </div>
                          <div className="font-mono-num font-bold">{formatInCurrency(q.amount, po.currency)}</div>
                        </div>
                      ))}
                    </div>

                    {hasPermission('approve_expense_manager') && po.status !== 'مفوتر' && (
                      <div className="flex flex-wrap items-center justify-end gap-2 no-print">
                        {po.status === 'مقارنة عروض' && (
                          <button
                            onClick={() => handleAdvancePoStatus(po.id, 'أمر شراء')}
                            className="px-3 py-1.5 rounded-lg bg-[#26478D] text-white font-semibold cursor-pointer"
                          >
                            اعتماد وإصدار أمر شراء
                          </button>
                        )}
                        {po.status === 'أمر شراء' && (
                          <button
                            onClick={() => handleAdvancePoStatus(po.id, 'مستلم')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                          >
                            تأكيد الاستلام والتركيب
                          </button>
                        )}
                        {po.status === 'مستلم' && (
                          <button
                            onClick={() => handleAdvancePoStatus(po.id, 'مفوتر')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer"
                          >
                            مطابقة الفاتورة وإغلاق الطلب
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateExpense}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">تسجيل مصروف وفاتورة مورد</h3>
              <button type="button" onClick={() => setShowAddExpense(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <select
                value={expForm.category}
                onChange={(e) => setExpForm({ ...expForm, category: e.target.value as ExpenseCategory })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="صيانة">صيانة</option>
                <option value="نظافة">نظافة</option>
                <option value="كهرباء">كهرباء</option>
                <option value="مياه">مياه</option>
                <option value="تشغيل عام">تشغيل عام</option>
              </select>
              <select
                value={expForm.propertyId || state.properties[0]?.id}
                onChange={(e) => setExpForm({ ...expForm, propertyId: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {state.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="رقم الفاتورة (لمنع التكرار)"
                value={expForm.invoiceNumber}
                onChange={(e) => setExpForm({ ...expForm, invoiceNumber: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                type="number"
                required
                min={1}
                placeholder="المبلغ"
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <select
                value={expForm.currency}
                onChange={(e) => setExpForm({ ...expForm, currency: e.target.value as CurrencyCode })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                  <option key={code} value={code}>
                    {lang === 'ar' ? CURRENCY_META[code].labelAr : CURRENCY_META[code].labelEn}
                  </option>
                ))}
              </select>
              <select
                value={expForm.bearer}
                onChange={(e) => setExpForm({ ...expForm, bearer: e.target.value as typeof expForm.bearer })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="المالك">يتحمله المالك</option>
                <option value="الشركة">على حساب الشركة</option>
                <option value="المستأجر">يتحمله المستأجر</option>
              </select>
              <select
                value={expForm.vendorId}
                onChange={(e) => setExpForm({ ...expForm, vendorId: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="">بدون مورد محدد</option>
                {state.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nameAr}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                placeholder="بيان المصروف والملاحظات"
                value={expForm.notes}
                onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              حد اعتماد المشرف: {formatConvertedBase(state.settings.supervisorApprovalThreshold, 'SAR')} — أي مبلغ أعلى يحال تلقائياً لاعتماد المدير العام.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddExpense(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                رفع للاعتماد
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Vendor Modal */}
      {showAddVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateVendor}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">إضافة مورد / مقاول صيانة</h3>
              <button type="button" onClick={() => setShowAddVendor(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <input
                required
                placeholder="اسم المؤسسة أو المقاول"
                value={vendorForm.nameAr}
                onChange={(e) => setVendorForm({ ...vendorForm, nameAr: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                required
                placeholder="رقم السجل التجاري"
                value={vendorForm.crNumber}
                onChange={(e) => setVendorForm({ ...vendorForm, crNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <input
                required
                placeholder="التخصص (تكييف، سباكة، كهرباء...)"
                value={vendorForm.category}
                onChange={(e) => setVendorForm({ ...vendorForm, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <input
                required
                placeholder="رقم الجوال"
                value={vendorForm.phone}
                onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddVendor(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                حفظ المورد
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Owner Payout Transfer Modal */}
      {transferOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleOwnerTransfer}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">تحويل مستحقات للمالك: {transferOwner.nameAr}</h3>
              <button type="button" onClick={() => setTransferOwner(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs font-mono-num">
              {transferOwner.bankName} · {transferOwner.iban}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                type="number"
                required
                min={1}
                value={transferForm.amount}
                onChange={(e) => setTransferForm({ ...transferForm, amount: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                placeholder="المبلغ"
              />
              <select
                value={transferForm.currency}
                onChange={(e) => setTransferForm({ ...transferForm, currency: e.target.value as CurrencyCode })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_META[code].labelAr}
                  </option>
                ))}
              </select>
              <select
                value={transferForm.paymentMethod}
                onChange={(e) => setTransferForm({ ...transferForm, paymentMethod: e.target.value as PaymentMethod })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="تحويل بنكي">تحويل بنكي</option>
                <option value="شيك">شيك</option>
                <option value="نقدي">نقدي</option>
              </select>
              <input
                placeholder="المرجع البنكي"
                value={transferForm.referenceNumber}
                onChange={(e) => setTransferForm({ ...transferForm, referenceNumber: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <textarea
                rows={2}
                placeholder="ملاحظات التحويل"
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTransferOwner(null)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                تنفيذ التحويل وترحيل القيد
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Purchase Order & Quotes Comparison Modal */}
      {showAddPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreatePo}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">طلب شراء ومقارنة عروض الموردين</h3>
              <button type="button" onClick={() => setShowAddPo(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                required
                placeholder="عنوان الطلب / بند الصيانة"
                value={poForm.title}
                onChange={(e) => setPoForm({ ...poForm, title: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <select
                value={poForm.propertyId || state.properties[0]?.id}
                onChange={(e) => setPoForm({ ...poForm, propertyId: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {state.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr}
                  </option>
                ))}
              </select>
              <select
                value={poForm.currency}
                onChange={(e) => setPoForm({ ...poForm, currency: e.target.value as CurrencyCode })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_META[code].labelAr}
                  </option>
                ))}
              </select>
              <select
                value={poForm.vendor1Id || state.vendors[0]?.id}
                onChange={(e) => setPoForm({ ...poForm, vendor1Id: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {state.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    العرض 1: {v.nameAr}
                  </option>
                ))}
              </select>
              <input
                type="number"
                required
                placeholder="سعر العرض الأول"
                value={poForm.vendor1Amount}
                onChange={(e) => setPoForm({ ...poForm, vendor1Amount: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
              <select
                value={poForm.vendor2Id}
                onChange={(e) => setPoForm({ ...poForm, vendor2Id: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="">العرض 2: (اختياري)</option>
                {state.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nameAr}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="سعر العرض الثاني"
                value={poForm.vendor2Amount}
                onChange={(e) => setPoForm({ ...poForm, vendor2Amount: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddPo(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                حفظ ومقارنة العروض
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
