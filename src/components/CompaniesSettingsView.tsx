import React, { useMemo, useState } from 'react';
import { Building, Coins, Info, Plus, Save, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { CurrencyCode, PropertyOwnershipMode } from '../types/aqar';
import { CURRENCY_META, DEFAULT_CURRENCY_RATES_TO_SAR, formatCurrency } from '../utils/formatters';
import { PrintViewButton } from './PrintViewButton';

export function CompaniesSettingsView() {
  const { state, lang, hasPermission, mutate, pushToast, baseCurrency, setBaseCurrency, convertToBase, openOnboarding, setActiveNav } = useAqar();
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

  const [settingsForm, setSettingsForm] = useState(() => ({
    nameAr: state?.settings.nameAr || '',
    nameEn: state?.settings.nameEn || '',
    crNumber: state?.settings.crNumber || '',
    vatNumber: state?.settings.vatNumber || '',
    city: state?.settings.city || '',
    phone: state?.settings.phone || '',
    email: state?.settings.email || '',
    ejarApiMode: state?.settings.ejarApiMode || 'تكامل إيجار المعتمد',
    zatcaPhase: state?.settings.zatcaPhase || 'المرحلة الأولى (QR + أرشفة)',
    dateCalendar: state?.settings.dateCalendar || 'هجري وميلادي',
    supervisorApprovalThreshold: state?.settings.supervisorApprovalThreshold ?? 1500,
    defaultManagementFeePercent: state?.settings.defaultManagementFeePercent ?? 5,
    baseCurrency: state?.settings.baseCurrency || baseCurrency,
    rates: {
      ...DEFAULT_CURRENCY_RATES_TO_SAR,
      ...(state?.settings.currencyRatesToSar || {}),
    },
  }));

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

      const unitsCount = state.units.filter((u) => propIds.has(u.propertyId)).length;

      return {
        mode,
        propertiesCount: props.length,
        unitsCount,
        collected: Math.round(collected * 100) / 100,
        companyRevenue: Math.round(companyCommission * 100) / 100,
        ownerShareNet: Math.round(ownerShareNet * 100) / 100,
        propertyExpenses: Math.round(propertyExpenses * 100) / 100,
      };
    });
  }, [state, convertToBase]);

  if (!state) return null;

  const companies = state.companies || [];

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutate(
      'POST',
      '/api/companies',
      companyForm,
      { offlineDescAr: `إضافة شركة ${companyForm.nameAr}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تمت إضافة الشركة وفصل حساباتها بنجاح' : 'Company added');
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutate(
      'PATCH',
      '/api/settings',
      {
        nameAr: settingsForm.nameAr,
        nameEn: settingsForm.nameEn,
        crNumber: settingsForm.crNumber,
        vatNumber: settingsForm.vatNumber,
        city: settingsForm.city,
        phone: settingsForm.phone,
        email: settingsForm.email,
        ejarApiMode: settingsForm.ejarApiMode,
        zatcaPhase: settingsForm.zatcaPhase,
        dateCalendar: settingsForm.dateCalendar,
        supervisorApprovalThreshold: settingsForm.supervisorApprovalThreshold,
        defaultManagementFeePercent: settingsForm.defaultManagementFeePercent,
        baseCurrency: settingsForm.baseCurrency,
        currencyRatesToSar: settingsForm.rates,
      },
      { offlineDescAr: 'تحديث إعدادات المنشأة والعملات' }
    );
    if (res) {
      setBaseCurrency(settingsForm.baseCurrency as CurrencyCode);
      pushToast('success', lang === 'ar' ? 'تم حفظ إعدادات المنشأة وأسعار الصرف بنجاح' : 'Settings & exchange rates saved');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-base font-bold">
            {lang === 'ar' ? 'إدارة الشركات وفصل الحسابات وتعدد العملات' : 'Multi-Company, Ownership Separation & Currency Settings'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === 'ar'
              ? 'فصل إيرادات الشركة عن إيرادات الملاك، ضبط أسعار الصرف للعملات، وإعدادات الإيصالات الرسمية والتقويم.'
              : 'Separate company and owner revenues, configure multi-currency exchange rates, receipts, and calendar settings.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveNav('about')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
            <span>{lang === 'ar' ? 'حول التطبيق وأيقونة النظام' : 'About & App Icon'}</span>
          </button>
          <button
            type="button"
            onClick={() => openOnboarding('company', false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
            <span>{lang === 'ar' ? 'معالج الإعداد الأولي' : 'Setup Wizard'}</span>
          </button>
          <PrintViewButton />
          {hasPermission('manage_properties') && (
            <button
              onClick={() => setShowAddCompany(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إضافة شركة جديدة' : 'Add Company'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Multi-Company Cards */}
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
            <div key={comp.id} className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#26478D]/10 dark:bg-[#26478D]/30 text-[#26478D] dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold">{lang === 'ar' ? comp.nameAr : comp.nameEn}</h3>
                      {comp.isDefault && (
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {lang === 'ar' ? 'الرئيسية' : 'Default'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono-num">
                      سجل تجاري: {comp.crNumber} · ضريبي: {comp.vatNumber}
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-[11px] text-slate-500">{lang === 'ar' ? 'تحصيل العقارات التابعة' : 'Company Portfolio'}</div>
                  <div className="text-sm font-bold font-mono-num text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(compIncome, baseCurrency, lang)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200/70 dark:border-white/10">
                <div>{comp.city} · {comp.address}</div>
                <div className="font-mono-num text-end">{comp.phone}</div>
                <div className="col-span-2 text-[11px] font-mono-num text-slate-500">
                  {comp.bankName} · {comp.iban}
                </div>
                <div className="col-span-2 text-[11px] text-slate-500">
                  العقارات المرتبطة ({compProps.length}): {compProps.map((p) => p.nameAr).join(' · ') || 'لا يوجد بعد'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Section 2: Ownership Separation Matrix */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto print-avoid-break">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
            <h3 className="text-sm font-bold">
              {lang === 'ar'
                ? `فصل الحسابات والإيرادات حسب نوع الملكية (${baseCurrency})`
                : `Financial Separation by Ownership Mode (${baseCurrency})`}
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            {lang === 'ar' ? 'تمييز إيراد الشركة عن صافي الملاك والمصروفات' : 'Company vs Owner Revenue Split'}
          </span>
        </div>
        <table className="w-full text-start text-xs">
          <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
            <tr>
              <th className="py-3 px-4 text-start font-medium">تصنيف الملكية</th>
              <th className="py-3 px-4 text-start font-medium">العقارات / الوحدات</th>
              <th className="py-3 px-4 text-start font-medium">إجمالي التحصيل</th>
              <th className="py-3 px-4 text-start font-medium">إيراد / عمولة الشركة</th>
              <th className="py-3 px-4 text-start font-medium">المصروفات المعتمدة</th>
              <th className="py-3 px-4 text-start font-medium">صافي مستحق للملاك</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {ownershipBreakdown.map((row) => (
              <tr key={row.mode}>
                <td className="py-3 px-4 font-bold">{row.mode}</td>
                <td className="py-3 px-4 font-mono-num">
                  {row.propertiesCount} عقار · {row.unitsCount} وحدة
                </td>
                <td className="py-3 px-4 font-mono-num font-semibold">
                  {formatCurrency(row.collected, baseCurrency, lang)}
                </td>
                <td className="py-3 px-4 font-mono-num font-bold text-[#26478D] dark:text-blue-400">
                  {formatCurrency(row.companyRevenue, baseCurrency, lang)}
                </td>
                <td className="py-3 px-4 font-mono-num text-amber-600 dark:text-amber-400">
                  {formatCurrency(row.propertyExpenses, baseCurrency, lang)}
                </td>
                <td className="py-3 px-4 font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(row.ownerShareNet, baseCurrency, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 3: Base Currency Rates & Organization Settings */}
      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
            <h3 className="text-sm font-bold">
              {lang === 'ar' ? 'تعدد العملات وأسعار الصرف المرجعية' : 'Multi-Currency & Exchange Rates'}
            </h3>
          </div>

          <div className="text-xs space-y-3">
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">
                {lang === 'ar' ? 'العملة الأساسية للتقارير المجمعة' : 'Default Reporting Base Currency'}
              </label>
              <select
                value={settingsForm.baseCurrency}
                onChange={(e) => {
                  const next = e.target.value as CurrencyCode;
                  setSettingsForm({ ...settingsForm, baseCurrency: next });
                  setBaseCurrency(next);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                  <option key={code} value={code}>
                    {lang === 'ar' ? CURRENCY_META[code].labelAr : CURRENCY_META[code].labelEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-1">
              <div className="text-[11px] text-slate-500">
                {lang === 'ar' ? 'معامل التحويل إلى الريال السعودي (1 وحدة = X SAR)' : 'Exchange Rate to SAR (1 Unit = X SAR)'}
              </div>
              {(['SAR', 'AED', 'USD', 'EGP', 'KWD'] as CurrencyCode[]).map((code) => (
                <div key={code} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{lang === 'ar' ? CURRENCY_META[code].labelAr : code}</span>
                  <input
                    type="number"
                    step="0.001"
                    min={0.001}
                    disabled={code === 'SAR'}
                    value={settingsForm.rates[code]}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        rates: { ...settingsForm.rates, [code]: Number(e.target.value) || 1 },
                      })
                    }
                    className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num text-end disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
          <h3 className="text-sm font-bold">
            {lang === 'ar' ? 'إعدادات المنشأة والتقويم والاعتماد' : 'Organization, Calendar & Compliance Settings'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">اسم الشركة (عربي)</label>
              <input
                value={settingsForm.nameAr}
                onChange={(e) => setSettingsForm({ ...settingsForm, nameAr: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Company Name (EN)</label>
              <input
                value={settingsForm.nameEn}
                onChange={(e) => setSettingsForm({ ...settingsForm, nameEn: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">السجل التجاري</label>
              <input
                value={settingsForm.crNumber}
                onChange={(e) => setSettingsForm({ ...settingsForm, crNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">الرقم الضريبي (ZATCA)</label>
              <input
                value={settingsForm.vatNumber}
                onChange={(e) => setSettingsForm({ ...settingsForm, vatNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">نظام التاريخ والتقويم</label>
              <select
                value={settingsForm.dateCalendar}
                onChange={(e) => setSettingsForm({ ...settingsForm, dateCalendar: e.target.value as typeof settingsForm.dateCalendar })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="هجري وميلادي">هجري وميلادي معاً</option>
                <option value="ميلادي فقط">ميلادي فقط</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">حد اعتماد المشرف (SAR)</label>
              <input
                type="number"
                min={0}
                value={settingsForm.supervisorApprovalThreshold}
                onChange={(e) => setSettingsForm({ ...settingsForm, supervisorApprovalThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">وضع منصة إيجار</label>
              <select
                value={settingsForm.ejarApiMode}
                onChange={(e) => setSettingsForm({ ...settingsForm, ejarApiMode: e.target.value as typeof settingsForm.ejarApiMode })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="تكامل إيجار المعتمد">تكامل إيجار المعتمد</option>
                <option value="PDF + مطابقة يدوية">PDF + مطابقة يدوية</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">الفوترة الإلكترونية (ZATCA)</label>
              <select
                value={settingsForm.zatcaPhase}
                onChange={(e) => setSettingsForm({ ...settingsForm, zatcaPhase: e.target.value as typeof settingsForm.zatcaPhase })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="المرحلة الأولى (QR + أرشفة)">المرحلة الأولى (QR + أرشفة)</option>
                <option value="المرحلة الثانية (الربط والتكامل)">المرحلة الثانية (الربط والتكامل)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2 no-print">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'حفظ الإعدادات وأسعار الصرف' : 'Save Settings & Rates'}</span>
            </button>
          </div>
        </div>
      </form>

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
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                حفظ الشركة
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
