import React, { useMemo, useState } from 'react';
import {
  ArrowUpLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Building2,
  Wallet,
  Wrench,
  FileSignature,
  BellRing,
  CalendarCheck,
  ListTodo,
  Plus,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { formatCurrency, formatDateTime, formatGregorian, formatHijri } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { ReceiptModal } from './ReceiptModal';
import { Payment, TaskItem } from '../types/aqar';
import {
  AlertCategory,
  DashboardAlertsOverlay,
  useDashboardAlerts,
} from './DashboardAlertsOverlay';
import { PropertyAnalyticsPanel } from './PropertyAnalyticsPanel';
import { PrintViewButton } from './PrintViewButton';

const DISMISSED_ALERTS_KEY = 'aqarplus_dismissed_alerts_v1';

export function DashboardView() {
  const {
    state,
    currentUser,
    lang,
    setActiveNav,
    mutate,
    hasPermission,
    pushToast,
    baseCurrency,
    convertToBase,
    formatInCurrency,
  } = useAqar();
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  const [alertsOverlayOpen, setAlertsOverlayOpen] = useState(false);
  const [alertsCategory, setAlertsCategory] = useState<AlertCategory>('all');
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const derivedAlerts = useDashboardAlerts();

  const metrics = useMemo(() => {
    if (!state) return null;
    const totalUnits = state.units.length;
    const leasedUnits = state.units.filter((u) => u.status === 'مؤجرة' || u.status === 'متأخرة في السداد').length;
    const vacantUnits = state.units.filter((u) => u.status === 'شاغرة' || u.status === 'تحتاج إلى تنظيف').length;
    const occupancyRate = totalUnits > 0 ? Math.round((leasedUnits / totalUnits) * 100) : 0;

    const activeInstallments = state.installments.filter((i) => i.status !== 'ملغاة');
    const totalDue = activeInstallments.reduce((s, i) => s + convertToBase(i.amount, i.currency || 'SAR'), 0);
    const totalCollected = activeInstallments.reduce((s, i) => s + convertToBase(i.paidAmount, i.currency || 'SAR'), 0);
    const totalRemaining = activeInstallments.reduce((s, i) => s + convertToBase(i.remainingAmount, i.currency || 'SAR'), 0);
    const overdueInstallments = activeInstallments.filter(
      (i) => (i.status === 'متأخرة' || i.status === 'مدفوعة جزئياً' || i.status === 'مستحقة اليوم') && i.remainingAmount > 0
    );
    const overdueAmount = overdueInstallments.reduce((s, i) => s + convertToBase(i.remainingAmount, i.currency || 'SAR'), 0);

    const approvedExpenses = state.expenses
      .filter((e) => e.approvalStatus === 'معتمد')
      .reduce((s, e) => s + convertToBase(e.amount, e.currency || 'SAR'), 0);

    const pendingApprovals = state.expenses.filter(
      (e) => e.approvalStatus === 'بانتظار المشرف' || e.approvalStatus === 'بانتظار المدير'
    );

    const openTickets = state.tickets.filter((t) => t.status !== 'مغلق' && t.status !== 'مكتمل');
    const openTasks = state.tasks.filter((t) => t.status !== 'مكتملة');

    const today = new Date('2026-11-14T00:00:00Z').getTime();
    const endingContracts = state.contracts
      .filter((c) => c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التجديد')
      .map((c) => {
        const daysLeft = Math.ceil((new Date(c.endDate).getTime() - today) / 86400000);
        return { contract: c, daysLeft };
      })
      .filter((x) => x.daysLeft <= 90)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      totalUnits,
      leasedUnits,
      vacantUnits,
      occupancyRate,
      totalDue,
      totalCollected,
      totalRemaining,
      overdueInstallments,
      overdueAmount,
      approvedExpenses,
      pendingApprovals,
      openTickets,
      openTasks,
      endingContracts,
    };
  }, [state, convertToBase]);

  if (!state || !currentUser || !metrics) return null;

  const role = currentUser.role;
  const todayHijri = formatHijri(new Date().toISOString());

  const handleExpenseDecision = async (expenseId: string, decision: 'approve' | 'reject') => {
    triggerHaptic(decision === 'approve' ? 'success' : 'warning');
    const res = await mutate(
      'POST',
      `/api/expenses/${expenseId}/decision`,
      {
        decision,
        reason: decision === 'reject' ? 'مرفوض من لوحة التحكم لعدم استيفاء الشروط' : undefined,
      },
      {
        offlineDescAr: decision === 'approve' ? 'اعتماد مصروف' : 'رفض مصروف',
        offlineDescEn: decision === 'approve' ? 'Approve expense' : 'Reject expense',
      }
    );
    if (res) {
      pushToast(
        'success',
        decision === 'approve'
          ? lang === 'ar'
            ? 'تم اعتماد المصروف وترحيل القيد المحاسبي بنجاح'
            : 'Expense approved & posted'
          : lang === 'ar'
          ? 'تم رفض المصروف'
          : 'Expense rejected'
      );
    }
  };

  const handleToggleTodayTask = async (task: TaskItem) => {
    const nextStatus: TaskItem['status'] = task.status === 'مكتملة' ? 'قيد التنفيذ' : 'مكتملة';
    triggerHaptic(nextStatus === 'مكتملة' ? 'success' : 'light');
    const res = await mutate(
      'PATCH',
      `/api/tasks/${task.id}`,
      { status: nextStatus },
      { offlineDescAr: `تحديث مهمة ${task.title}` }
    );
    if (res) {
      pushToast(
        'success',
        nextStatus === 'مكتملة'
          ? lang === 'ar'
            ? `تم إنجاز المهمة: ${task.title}`
            : `Task completed: ${task.title}`
          : lang === 'ar'
          ? 'تمت إعادة فتح المهمة'
          : 'Task reopened'
      );
    }
  };

  const activeAlerts = derivedAlerts.filter((a) => !dismissedIds.includes(a.id));
  const rentAlertCount = activeAlerts.filter((a) => a.category === 'rent').length;
  const contractAlertCount = activeAlerts.filter((a) => a.category === 'contracts').length;
  const maintAlertCount = activeAlerts.filter((a) => a.category === 'maintenance').length;
  const criticalCount = activeAlerts.filter((a) => a.severity === 'critical').length;

  const openAlerts = (cat: AlertCategory = 'all') => {
    setAlertsCategory(cat);
    setAlertsOverlayOpen(true);
  };

  const handleDismissAlert = (id: string) => {
    setDismissedIds((prev) => {
      const next = [...prev, id];
      localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleResetDismissed = () => {
    setDismissedIds([]);
    localStorage.removeItem(DISMISSED_ALERTS_KEY);
  };

  return (
    <div className="space-y-6">
      {/* Context Welcome Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/10">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ar' ? currentUser.roleLabelAr : currentUser.roleLabelEn} · {currentUser.deviceName} ·{' '}
            <span className="font-mono-num">{todayHijri}</span>
          </div>
          <h2 className="text-xl lg:text-2xl font-bold mt-1">
            {lang === 'ar' ? `مرحباً، ${currentUser.nameAr}` : `Welcome, ${currentUser.nameEn}`}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <PrintViewButton />
          <button
            onClick={() => openAlerts('all')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              criticalCount > 0
                ? 'border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'تنبيهات عاجلة' : 'Urgent Alerts'}</span>
            <span className="font-mono-num font-bold">({activeAlerts.length})</span>
          </button>

          {hasPermission('collect_payments') && (
            <button
              onClick={() => setActiveNav('finance')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تسجيل تحصيل وسند قبض' : 'Record Payment'}</span>
            </button>
          )}
          {hasPermission('manage_maintenance') && (
            <button
              onClick={() => setActiveNav('maintenance')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'بلاغات الصيانة' : 'Maintenance'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Urgent Alerts Summary Strip (Click any category to launch Overlay) */}
      {activeAlerts.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-300/70 dark:border-amber-500/25 bg-amber-50/70 dark:bg-amber-500/[0.07] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'ar'
                  ? `${criticalCount} تنبيهات حرجة تتطلب انتباهاً فورياً`
                  : `${criticalCount} critical alerts require immediate attention`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => openAlerts('rent')}
                className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 hover:border-[#26478D] text-slate-800 dark:text-slate-200 font-medium cursor-pointer whitespace-nowrap"
              >
                {lang === 'ar' ? `استحقاقات الإيجار: ` : `Rent Due: `}
                <span className="font-mono-num font-bold text-red-600 dark:text-red-400">{rentAlertCount}</span>
              </button>
              <button
                onClick={() => openAlerts('contracts')}
                className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 hover:border-[#26478D] text-slate-800 dark:text-slate-200 font-medium cursor-pointer whitespace-nowrap"
              >
                {lang === 'ar' ? `عقود منتهية/قريبة: ` : `Contracts: `}
                <span className="font-mono-num font-bold text-amber-600 dark:text-amber-400">{contractAlertCount}</span>
              </button>
              {role !== 'owner' && (
                <button
                  onClick={() => openAlerts('maintenance')}
                  className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 hover:border-[#26478D] text-slate-800 dark:text-slate-200 font-medium cursor-pointer whitespace-nowrap"
                >
                  {lang === 'ar' ? `صيانة ومهام معلقة: ` : `Maintenance: `}
                  <span className="font-mono-num font-bold text-red-600 dark:text-red-400">{maintAlertCount}</span>
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => openAlerts('all')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>{lang === 'ar' ? 'فتح لوحة التنبيهات' : 'Open Alerts Overlay'}</span>
            <ArrowUpLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Role-Specific Interactive Primary KPI Row (Clickable Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1 — Clickable Occupancy / Tickets */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveNav(role === 'technician' ? 'maintenance' : 'properties');
          }}
          className="text-start p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface glass-card-interactive hover:border-[#26478D]/50 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {role === 'technician'
                ? lang === 'ar'
                  ? 'البلاغات المفتوحة'
                  : 'Open Tickets'
                : lang === 'ar'
                ? 'نسبة الإشغال الفعلي'
                : 'Occupancy Rate'}
            </span>
            <span className="inline-flex items-center gap-1 text-[#26478D] dark:text-blue-400">
              <Building2 className="w-4 h-4" />
              <ArrowUpLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </div>
          {role === 'technician' ? (
            <>
              <div className="text-2xl font-bold font-mono-num mt-2">{metrics.openTickets.length}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'ar'
                  ? `مسند إليك: ${state.tickets.filter((t) => t.assignedTo === currentUser.id && t.status !== 'مغلق').length} بلاغات`
                  : `Assigned to you: ${state.tickets.filter((t) => t.assignedTo === currentUser.id).length}`}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 mt-2">
              <div>
                <div className="text-2xl font-bold font-mono-num">{metrics.occupancyRate}%</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {lang === 'ar'
                    ? `${metrics.leasedUnits} مؤجرة · ${metrics.vacantUnits} شاغرة`
                    : `${metrics.leasedUnits} leased · ${metrics.vacantUnits} vacant`}
                </div>
              </div>
              {/* Animated SVG Occupancy Ring */}
              <svg className="w-12 h-12 -rotate-90 shrink-0" viewBox="0 0 44 44" aria-hidden="true">
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  className="stroke-slate-200 dark:stroke-white/10"
                  strokeWidth="4.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  className="stroke-[#26478D] dark:stroke-blue-400 transition-all duration-500"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 17}
                  strokeDashoffset={2 * Math.PI * 17 * (1 - metrics.occupancyRate / 100)}
                />
              </svg>
            </div>
          )}
        </button>

        {/* KPI 2 — Clickable Collections / Active Tasks */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveNav(role === 'technician' ? 'maintenance' : 'finance');
          }}
          className="text-start p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface glass-card-interactive hover:border-emerald-500/50 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {role === 'technician'
                ? lang === 'ar'
                  ? 'المهام النشطة'
                  : 'Active Tasks'
                : lang === 'ar'
                ? 'إجمالي التحصيل الفعلي'
                : 'Total Collected'}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Wallet className="w-4 h-4" />
              <ArrowUpLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </div>
          {role === 'technician' ? (
            <>
              <div className="text-2xl font-bold font-mono-num mt-2">
                {state.tasks.filter((t) => t.assignedTo === currentUser.id && t.status !== 'مكتملة').length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'ar' ? 'مهام صيانة وفحص ميداني' : 'Field maintenance tasks'}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono-num text-emerald-600 dark:text-emerald-400 mt-2">
                {formatCurrency(metrics.totalCollected, baseCurrency, lang)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
                {lang === 'ar'
                  ? `من أصل ${formatCurrency(metrics.totalDue, baseCurrency, lang)} مستحقة`
                  : `of ${formatCurrency(metrics.totalDue, baseCurrency, lang)} due`}
              </div>
            </>
          )}
        </button>

        {/* KPI 3 — Clickable Overdue / Leads */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveNav(role === 'leasing' ? 'tenants' : role === 'technician' ? 'maintenance' : 'finance');
          }}
          className="text-start p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface glass-card-interactive hover:border-amber-500/50 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {role === 'leasing'
                ? lang === 'ar'
                  ? 'العملاء المحتملون'
                  : 'Active Leads'
                : role === 'technician'
                ? lang === 'ar'
                  ? 'مهام منجزة'
                  : 'Completed Tasks'
                : lang === 'ar'
                ? 'المتأخرات والدفعات المفتوحة'
                : 'Overdue & Open Balance'}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <ArrowUpLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </div>
          {role === 'leasing' ? (
            <>
              <div className="text-2xl font-bold font-mono-num mt-2">{state.leads.length}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'ar' ? 'طلبات معاينة وعروض أسعار' : 'Viewings & active offers'}
              </div>
            </>
          ) : role === 'technician' ? (
            <>
              <div className="text-2xl font-bold font-mono-num mt-2">
                {state.tasks.filter((t) => t.assignedTo === currentUser.id && t.status === 'مكتملة').length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'ar' ? 'أعمال منجزة وموثقة' : 'Completed work orders'}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono-num text-amber-600 dark:text-amber-400 mt-2">
                {formatCurrency(metrics.overdueAmount, baseCurrency, lang)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'ar'
                  ? `${metrics.overdueInstallments.length} دفعات تستدعي المتابعة`
                  : `${metrics.overdueInstallments.length} installments requiring follow-up`}
              </div>
            </>
          )}
        </button>

        {/* KPI 4 — Clickable Pending Approvals & Maintenance */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveNav(role === 'owner' ? 'accounting' : metrics.pendingApprovals.length > 0 ? 'accounting' : 'maintenance');
          }}
          className="text-start p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface glass-card-interactive hover:border-[#26478D]/50 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {role === 'owner'
                ? lang === 'ar'
                  ? 'المصروفات المعتمدة'
                  : 'Approved Expenses'
                : lang === 'ar'
                ? 'طلبات اعتماد وصيانة معلقة'
                : 'Pending Approvals & Tickets'}
            </span>
            <span className="inline-flex items-center gap-1 text-[#26478D] dark:text-blue-400">
              <Clock className="w-4 h-4" />
              <ArrowUpLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </div>
          {role === 'owner' ? (
            <>
              <div className="text-2xl font-bold font-mono-num mt-2">{formatCurrency(metrics.approvedExpenses, baseCurrency, lang)}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'ar' ? 'مخصومة حسب الفواتير المعتمدة' : 'Deducted per approved invoices'}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono-num mt-2">
                {metrics.pendingApprovals.length + metrics.openTickets.length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'ar'
                  ? `${metrics.pendingApprovals.length} اعتماد مالي · ${metrics.openTickets.length} صيانة`
                  : `${metrics.pendingApprovals.length} approvals · ${metrics.openTickets.length} tickets`}
              </div>
            </>
          )}
        </button>
      </div>

      {/* Additional Property Performance Analytics Panel (Recharts) */}
      <PropertyAnalyticsPanel />

      {/* Main Operational Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Collection Radar / Field Tickets depending on role */}
        <div className="lg:col-span-7 space-y-6">
          {/* Technician Focused Panel */}
          {role === 'technician' ? (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {lang === 'ar' ? 'بلاغات الصيانة المسندة لك' : 'Your Assigned Maintenance Tickets'}
                </h3>
                <button
                  onClick={() => setActiveNav('maintenance')}
                  className="text-xs text-[#26478D] dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'فتح لوحة الصيانة' : 'Open Maintenance'}</span>
                  <ArrowUpLeft className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {state.tickets.map((tkt) => {
                  const unit = state.units.find((u) => u.id === tkt.unitId);
                  const prop = state.properties.find((p) => p.id === tkt.propertyId);
                  return (
                    <div key={tkt.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{tkt.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-mono-num">{tkt.ticketNumber}</span> · {prop?.nameAr} · {unit?.unitNumber} ·{' '}
                          {tkt.priority}
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveNav('maintenance')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer shrink-0"
                      >
                        {tkt.status}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Collection Radar Table */
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">
                    {lang === 'ar' ? 'رادار التحصيل والاستحقاقات ذات الأولوية' : 'Collection Priority Radar'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'ar'
                      ? 'الدفعات المتأخرة والمستحقة اليوم والدفعات الجزئية'
                      : 'Overdue, due today, and partially paid installments'}
                  </p>
                </div>
                <button
                  onClick={() => setActiveNav('finance')}
                  className="text-xs text-[#26478D] dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>{lang === 'ar' ? 'شاشة التحصيل' : 'Collection'}</span>
                  <ArrowUpLeft className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                    <tr>
                      <th className="py-2.5 px-4 text-start font-medium">{lang === 'ar' ? 'المستأجر / الوحدة' : 'Tenant / Unit'}</th>
                      <th className="py-2.5 px-4 text-start font-medium">{lang === 'ar' ? 'الاستحقاق' : 'Due Date'}</th>
                      <th className="py-2.5 px-4 text-start font-medium">{lang === 'ar' ? 'المتبقي' : 'Remaining'}</th>
                      <th className="py-2.5 px-4 text-start font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {metrics.overdueInstallments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          {lang === 'ar' ? 'لا توجد متأخرات مستحقة حالياً' : 'No overdue installments'}
                        </td>
                      </tr>
                    ) : (
                      metrics.overdueInstallments.map((inst) => {
                        const tenant = state.tenants.find((t) => t.id === inst.tenantId);
                        const unit = state.units.find((u) => u.id === inst.unitId);
                        return (
                          <tr key={inst.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900 dark:text-slate-100">{tenant?.nameAr || '—'}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {lang === 'ar' ? `وحدة ${unit?.unitNumber || ''}` : `Unit ${unit?.unitNumber || ''}`} · قسط #{inst.installmentNumber}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono-num">{formatGregorian(inst.dueDate, lang)}</td>
                            <td className="py-3 px-4 font-mono-num font-semibold text-amber-600 dark:text-amber-400">
                              {formatInCurrency(inst.remainingAmount, inst.currency || 'SAR')}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`font-medium ${
                                  inst.status === 'متأخرة'
                                    ? 'text-red-600 dark:text-red-400'
                                    : inst.status === 'مستحقة اليوم'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                {inst.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ending Contracts Radar */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <h3 className="text-sm font-semibold">
                  {lang === 'ar' ? 'رادار العقود القريبة من الانتهاء (خلال 90 يوماً)' : 'Contracts Expiring Within 90 Days'}
                </h3>
              </div>
              <button
                onClick={() => setActiveNav('leasing')}
                className="text-xs text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'إدارة العقود' : 'Contracts'}
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {metrics.endingContracts.length === 0 ? (
                <div className="p-5 text-xs text-slate-500 text-center">
                  {lang === 'ar' ? 'لا توجد عقود قريبة من الانتهاء خلال 90 يوماً' : 'No expiring contracts within 90 days'}
                </div>
              ) : (
                metrics.endingContracts.map(({ contract, daysLeft }) => {
                  const unit = state.units.find((u) => u.id === contract.unitId);
                  const tenant = state.tenants.find((t) => t.id === contract.tenantId);
                  return (
                    <div key={contract.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {contract.internalNumber} · {tenant?.nameAr}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {lang === 'ar' ? `وحدة ${unit?.unitNumber}` : `Unit ${unit?.unitNumber}`} · إيجار:{' '}
                          <span className="font-mono-num">{contract.ejarNumber || '—'}</span>
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <div className={`font-mono-num font-semibold ${daysLeft <= 30 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {lang === 'ar' ? `متبقي ${daysLeft} يوم` : `${daysLeft}d left`}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">{contract.endDate}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Approvals Queue + Recent Receipts + Live Audit Feed */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pending Approvals Widget (GM / Supervisor) */}
          {(role === 'gm' || role === 'supervisor' || role === 'accountant') && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {lang === 'ar' ? 'مركز الموافقات المعلقة' : 'Pending Approvals'}
                </h3>
                <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                  {metrics.pendingApprovals.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {metrics.pendingApprovals.length === 0 ? (
                  <div className="p-5 text-xs text-slate-500 text-center">
                    {lang === 'ar' ? 'جميع المصروفات والطلبات معتمدة' : 'All approvals up to date'}
                  </div>
                ) : (
                  metrics.pendingApprovals.map((exp) => {
                    const prop = state.properties.find((p) => p.id === exp.propertyId);
                    const canAct =
                      (exp.approvalStatus === 'بانتظار المشرف' && hasPermission('approve_expense_supervisor')) ||
                      (exp.approvalStatus === 'بانتظار المدير' && hasPermission('approve_expense_manager'));
                    const isCreator = exp.createdBy === currentUser.id && currentUser.role !== 'gm';
                    return (
                      <div key={exp.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold">
                              {exp.expenseNumber} · {exp.category}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {prop?.nameAr} · {exp.approvalStatus}
                            </div>
                          </div>
                          <div className="text-sm font-bold font-mono-num text-[#26478D] dark:text-blue-400">
                            {formatInCurrency(exp.amount, exp.currency || 'SAR')}
                          </div>
                        </div>
                        {exp.notes && <p className="text-[11px] text-slate-500 dark:text-slate-400">{exp.notes}</p>}
                        {canAct && !isCreator && (
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              onClick={() => handleExpenseDecision(exp.id, 'reject')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{lang === 'ar' ? 'رفض' : 'Reject'}</span>
                            </button>
                            <button
                              onClick={() => handleExpenseDecision(exp.id, 'approve')}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{lang === 'ar' ? 'اعتماد' : 'Approve'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Latest Receipts Quick Access */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {lang === 'ar' ? 'أحدث سندات القبض الصادرة' : 'Recent Payment Receipts'}
              </h3>
              <button
                onClick={() => setActiveNav('finance')}
                className="text-xs text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'الكل' : 'View All'}
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {state.payments.slice(0, 4).map((pay) => {
                const tenant = state.tenants.find((t) => t.id === pay.tenantId);
                return (
                  <button
                    key={pay.id}
                    onClick={() => setSelectedReceipt(pay)}
                    className="w-full px-5 py-3 text-start hover:bg-slate-50 dark:hover:bg-white/[0.03] flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold font-mono-num">
                        {pay.receiptNumber} · <span className="font-sans">{tenant?.nameAr || '—'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {pay.paymentMethod} · {formatDateTime(pay.createdAt, lang)}
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className={`text-xs font-bold font-mono-num ${pay.status === 'معكوس' ? 'line-through text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatInCurrency(pay.amount, pay.currency || 'SAR')}
                      </div>
                      <div className="text-[10px] text-slate-400">{pay.status}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Today's Tasks (مهام اليوم مع مربعات تفاعلية) */}
          {role !== 'owner' && (
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <h3 className="text-sm font-semibold">
                    {lang === 'ar' ? 'مهام اليوم والمتابعات' : "Today's Tasks"}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveNav('maintenance')}
                  className="text-xs text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {lang === 'ar' ? 'إدارة المهام' : 'All Tasks'}
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {state.tasks.length === 0 ? (
                  <div className="p-5 text-xs text-slate-500 text-center">
                    {lang === 'ar' ? 'لا توجد مهام مجدولة لليوم' : 'No tasks scheduled today'}
                  </div>
                ) : (
                  state.tasks.slice(0, 5).map((task) => {
                    const isDone = task.status === 'مكتملة';
                    const prop = state.properties.find((p) => p.id === task.propertyId);
                    return (
                      <label
                        key={task.id}
                        className="px-5 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors min-h-[48px]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => void handleToggleTodayTask(task)}
                            className="w-5 h-5 rounded-md accent-emerald-600 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <div
                              className={`text-xs font-semibold truncate ${
                                isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {task.title}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {prop?.nameAr || task.type} · <span className="font-mono-num">{task.dueDate}</span>
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            isDone
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : task.priority === 'عاجل'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {task.status}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Daily Operations & Executive Decisions Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <h3 className="text-sm font-semibold">
                  {lang === 'ar' ? 'مركز العمليات اليومية والقرارات' : 'Daily Operations & Decisions'}
                </h3>
              </div>
              <button
                onClick={() => setActiveNav('team')}
                className="text-xs text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'القرارات وفريق العمل' : 'Team & Decisions'}
              </button>
            </div>
            <div className="p-4 space-y-2.5 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10">
                  <div className="text-lg font-bold font-mono-num text-[#26478D] dark:text-blue-400">
                    {state.leads.length}
                  </div>
                  <div className="text-[10px] text-slate-500">معاينات مجدولة</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10">
                  <div className="text-lg font-bold font-mono-num text-amber-600 dark:text-amber-400">
                    {(state.purchaseOrders || []).filter((p) => p.status !== 'مفوتر').length}
                  </div>
                  <div className="text-[10px] text-slate-500">طلبات شراء مفتوحة</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10">
                  <div className="text-lg font-bold font-mono-num text-emerald-600 dark:text-emerald-400">
                    {(state.decisions || []).length}
                  </div>
                  <div className="text-[10px] text-slate-500">قرارات إدارية نافذة</div>
                </div>
              </div>
              {(state.decisions || []).slice(0, 2).map((dec) => (
                <div key={dec.id} className="p-2.5 rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
                  <div className="font-semibold text-[11px]">
                    <span className="font-mono-num text-[#26478D] dark:text-blue-400">{dec.decisionNumber}</span> · {dec.title}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Team Activity / Audit Feed (hidden for Owner role) */}
          {role !== 'owner' && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {lang === 'ar' ? 'النشاط المباشر للفريق وسجل التدقيق' : 'Live Team Audit Activity'}
                </h3>
                <button
                  onClick={() => setActiveNav('team')}
                  className="text-xs text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {lang === 'ar' ? 'السجل الكامل' : 'Audit Log'}
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {state.auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="px-5 py-3 space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">{log.userName}</span>
                      <span className="text-[10px] font-mono-num text-slate-400">
                        {formatDateTime(log.createdAt, lang)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">{log.summary}</div>
                    <div className="text-[10px] text-slate-400">
                      {log.userRole} · {log.deviceName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Thumb-Zone Floating Action Button */}
      {hasPermission('collect_payments') && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            setActiveNav('finance');
          }}
          className="lg:hidden fixed bottom-[4.4rem] end-4 z-30 min-h-[48px] px-4 rounded-2xl bg-[#26478D] text-white shadow-xl shadow-[#26478D]/35 inline-flex items-center gap-2 text-xs font-bold cursor-pointer active:scale-95 transition-transform no-print"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تحصيل سريع' : 'Collect'}</span>
        </button>
      )}

      {selectedReceipt && <ReceiptModal payment={selectedReceipt} onClose={() => setSelectedReceipt(null)} />}
      <DashboardAlertsOverlay
        open={alertsOverlayOpen}
        initialCategory={alertsCategory}
        onClose={() => setAlertsOverlayOpen(false)}
        dismissedIds={dismissedIds}
        onDismiss={handleDismissAlert}
        onResetDismissed={handleResetDismissed}
      />
    </div>
  );
}
