import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { formatSar } from '../utils/formatters';

const MONTH_LABELS_AR: Record<string, string> = {
  '01': 'يناير',
  '02': 'فبراير',
  '03': 'مارس',
  '04': 'أبريل',
  '05': 'مايو',
  '06': 'يونيو',
  '07': 'يوليو',
  '08': 'أغسطس',
  '09': 'سبتمبر',
  '10': 'أكتوبر',
  '11': 'نوفمبر',
  '12': 'ديسمبر',
};

const MONTH_LABELS_EN: Record<string, string> = {
  '01': 'Jan',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Apr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Aug',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dec',
};

const STATUS_COLORS: Record<string, string> = {
  مؤجرة: '#16A34A',
  شاغرة: '#26478D',
  'متأخرة في السداد': '#DC2626',
  'تحت الصيانة': '#D97706',
  محجوزة: '#6366F1',
  'تحتاج إلى تنظيف': '#0EA5E9',
  'قيد التأجير': '#8B5CF6',
  'بانتظار الاستلام': '#F59E0B',
  موقوفة: '#64748B',
  مؤرشفة: '#94A3B8',
};

export function PropertyAnalyticsPanel() {
  const { state, lang, theme } = useAqar();
  const [propertyFilter, setPropertyFilter] = useState<string>('all');

  const analytics = useMemo(() => {
    if (!state) return null;

    const scopedProperties =
      propertyFilter === 'all'
        ? state.properties
        : state.properties.filter((p) => p.id === propertyFilter);
    const scopedPropIds = new Set(scopedProperties.map((p) => p.id));

    const scopedUnits = state.units.filter((u) => scopedPropIds.has(u.propertyId));
    const scopedInstallments = state.installments.filter(
      (i) => scopedPropIds.has(i.propertyId) && i.status !== 'ملغاة'
    );

    // 1. Monthly Collection Performance (Derived directly from installments)
    const monthBuckets = new Map<string, { due: number; collected: number }>();
    for (const inst of scopedInstallments) {
      const ym = inst.dueDate.slice(0, 7); // YYYY-MM
      const cur = monthBuckets.get(ym) || { due: 0, collected: 0 };
      cur.due += inst.amount;
      cur.collected += inst.paidAmount;
      monthBuckets.set(ym, cur);
    }

    const monthlySeries = Array.from(monthBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, vals]) => {
        const [yr, mo] = ym.split('-');
        const label =
          lang === 'ar'
            ? `${MONTH_LABELS_AR[mo] || mo} ${yr.slice(2)}`
            : `${MONTH_LABELS_EN[mo] || mo} '${yr.slice(2)}`;
        const rate = vals.due > 0 ? Math.round((vals.collected / vals.due) * 100) : 0;
        return {
          ym,
          label,
          due: Math.round(vals.due),
          collected: Math.round(vals.collected),
          rate,
        };
      });

    // Overall collection rate for scoped period
    const totalDue = scopedInstallments.reduce((s, i) => s + i.amount, 0);
    const totalCollected = scopedInstallments.reduce((s, i) => s + i.paidAmount, 0);
    const overallCollectionRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0;

    // 2. Occupancy & Revenue per Property (Bar Chart)
    const propertyBars = state.properties.map((p) => {
      const pUnits = state.units.filter((u) => u.propertyId === p.id);
      const leased = pUnits.filter((u) => u.status === 'مؤجرة' || u.status === 'متأخرة في السداد').length;
      const vacant = pUnits.filter((u) => u.status === 'شاغرة' || u.status === 'تحتاج إلى تنظيف').length;
      const other = pUnits.length - leased - vacant;
      const occupancyPct = pUnits.length > 0 ? Math.round((leased / pUnits.length) * 100) : 0;
      const shortName =
        lang === 'ar'
          ? p.nameAr.replace('مجمع ', '').replace('برج ', '').slice(0, 18)
          : p.nameEn.slice(0, 18);

      return {
        id: p.id,
        name: shortName,
        fullName: lang === 'ar' ? p.nameAr : p.nameEn,
        leased,
        vacant,
        other,
        total: pUnits.length,
        occupancyPct,
      };
    });

    // 3. Unit Status Distribution (Donut Chart)
    const statusMap = new Map<string, number>();
    for (const u of scopedUnits) {
      statusMap.set(u.status, (statusMap.get(u.status) || 0) + 1);
    }
    const statusPie = Array.from(statusMap.entries()).map(([status, count]) => ({
      name: status,
      value: count,
      color: STATUS_COLORS[status] || '#64748B',
    }));

    const leasedCount = scopedUnits.filter((u) => u.status === 'مؤجرة' || u.status === 'متأخرة في السداد').length;
    const overallOccupancyRate = scopedUnits.length > 0 ? Math.round((leasedCount / scopedUnits.length) * 100) : 0;

    return {
      monthlySeries,
      overallCollectionRate,
      propertyBars,
      statusPie,
      overallOccupancyRate,
      scopedUnitsCount: scopedUnits.length,
    };
  }, [state, propertyFilter, lang]);

  if (!state || !analytics) return null;

  const axisColor = theme === 'dark' ? '#94A3B8' : '#64748B';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';

  return (
    <section className="space-y-4">
      {/* Section Header & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
          <h3 className="text-sm font-bold">
            {lang === 'ar' ? 'تحليلات أداء العقارات والإشغال والتحصيل' : 'Property Performance & Collection Analytics'}
          </h3>
        </div>

        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#26478D]"
        >
          <option value="all">{lang === 'ar' ? 'جميع العقارات' : 'All Properties'}</option>
          {state.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {lang === 'ar' ? p.nameAr : p.nameEn}
            </option>
          ))}
        </select>
      </div>

      {/* 3-Panel Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chart 1: Monthly Collection Trend & Rate (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'نسبة التحصيل الشهري (المستحق مقابل المحصل)' : 'Monthly Collection (Due vs. Collected)'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'ar' ? 'تحليل جدول الاستحقاقات والدفعات الفعلية' : 'Installment schedule vs. actual collections'}
              </p>
            </div>
            <div className="text-end shrink-0">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'معدل التحصيل' : 'Collection Rate'}
              </div>
              <div className="text-base font-bold font-mono-num text-emerald-600 dark:text-emerald-400">
                {analytics.overallCollectionRate}%
              </div>
            </div>
          </div>

          <div className="h-[240px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.monthlySeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aqarDueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#26478D" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#26478D" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="aqarPaidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as (typeof analytics.monthlySeries)[number];
                    return (
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] shadow-xl text-xs space-y-1">
                        <div className="font-bold">{row.label}</div>
                        <div className="font-mono-num text-slate-600 dark:text-slate-300">
                          {lang === 'ar' ? 'المستحق: ' : 'Due: '}
                          {formatSar(row.due, lang)}
                        </div>
                        <div className="font-mono-num text-emerald-600 dark:text-emerald-400 font-semibold">
                          {lang === 'ar' ? 'المحصل: ' : 'Collected: '}
                          {formatSar(row.collected, lang)}
                        </div>
                        <div className="font-mono-num text-[#26478D] dark:text-blue-400 font-bold">
                          {lang === 'ar' ? `النسبة: ${row.rate}%` : `Rate: ${row.rate}%`}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="due"
                  stroke="#26478D"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#aqarDueGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  stroke="#16A34A"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#aqarPaidGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#26478D]" />
              <span>{lang === 'ar' ? 'المبالغ المستحقة' : 'Due Amount'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A]" />
              <span>{lang === 'ar' ? 'المبالغ المحصلة' : 'Collected Amount'}</span>
            </span>
          </div>
        </div>

        {/* Chart 2: Occupancy by Property (3 cols) */}
        <div className="lg:col-span-3 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'معدل الإشغال حسب العقار' : 'Occupancy by Property'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'ar' ? 'المؤجرة مقابل الشاغرة' : 'Leased vs. vacant units'}
              </p>
            </div>
            <div className="font-mono-num text-sm font-bold text-[#26478D] dark:text-blue-400">
              {analytics.overallOccupancyRate}%
            </div>
          </div>

          <div className="h-[240px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.propertyBars} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as (typeof analytics.propertyBars)[number];
                    return (
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] shadow-xl text-xs space-y-1">
                        <div className="font-bold">{row.fullName}</div>
                        <div className="font-mono-num text-emerald-600 dark:text-emerald-400">
                          {lang === 'ar' ? `مؤجرة: ${row.leased}` : `Leased: ${row.leased}`}
                        </div>
                        <div className="font-mono-num text-[#26478D] dark:text-blue-400">
                          {lang === 'ar' ? `شاغرة: ${row.vacant}` : `Vacant: ${row.vacant}`}
                        </div>
                        <div className="font-mono-num text-amber-600 dark:text-amber-400">
                          {lang === 'ar' ? `صيانة/حجز: ${row.other}` : `Maint/Reserved: ${row.other}`}
                        </div>
                        <div className="font-mono-num font-bold pt-1 border-t border-slate-100 dark:border-white/10">
                          {lang === 'ar' ? `نسبة الإشغال: ${row.occupancyPct}%` : `Occupancy: ${row.occupancyPct}%`}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="leased" stackId="a" fill="#16A34A" radius={[0, 0, 0, 0]} />
                <Bar dataKey="vacant" stackId="a" fill="#26478D" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" stackId="a" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[#16A34A]" />
              <span>{lang === 'ar' ? 'مؤجرة' : 'Leased'}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[#26478D]" />
              <span>{lang === 'ar' ? 'شاغرة' : 'Vacant'}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[#D97706]" />
              <span>{lang === 'ar' ? 'صيانة/حجز' : 'Other'}</span>
            </span>
          </div>
        </div>

        {/* Chart 3: Unit Status Breakdown (3 cols) */}
        <div className="lg:col-span-3 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'توزيع حالات الوحدات' : 'Unit Status Breakdown'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'ar' ? `إجمالي ${analytics.scopedUnitsCount} وحدة` : `${analytics.scopedUnitsCount} total units`}
              </p>
            </div>
          </div>

          <div className="h-[190px] w-full flex items-center justify-center" dir="ltr">
            {analytics.statusPie.length === 0 ? (
              <div className="w-36 h-36 rounded-full border-8 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-center p-3">
                <span className="text-sm font-bold font-mono-num text-slate-400">0%</span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  {lang === 'ar' ? 'لا توجد وحدات بعد' : 'No units yet'}
                </span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.statusPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {analytics.statusPie.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as (typeof analytics.statusPie)[number];
                      return (
                        <div className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] shadow-xl text-xs font-medium">
                          {item.name}: <span className="font-mono-num font-bold">{item.value}</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="space-y-1.5 max-h-20 overflow-y-auto text-[11px]">
            {analytics.statusPie.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="font-mono-num font-semibold shrink-0">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
