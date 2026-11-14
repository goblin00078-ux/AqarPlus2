import React, { useMemo, useState } from 'react';
import { ClipboardList, Sparkles, X, Clock, Building2, CheckCircle2 } from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { TicketPriority } from '../types/aqar';
import { triggerHaptic } from '../utils/haptics';

export const TASK_TYPES = ['صيانة', 'تأجير', 'مالية', 'إدارية', 'تسليم/استلام'] as const;

interface CreateTaskQuickModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  propertyId?: string;
  unitId?: string;
  relatedLabel?: string;
}

export function CreateTaskQuickModal({
  open,
  onClose,
  defaultType = 'صيانة',
  defaultTitle = '',
  defaultDescription = '',
  propertyId,
  unitId,
  relatedLabel,
}: CreateTaskQuickModalProps) {
  const { state, lang, mutate, pushToast } = useAqar();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [type, setType] = useState(defaultType);
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId || '');
  const [selectedUnitId, setSelectedUnitId] = useState(unitId || '');
  const [priority, setPriority] = useState<TicketPriority>('متوسط');
  const [dueDate, setDueDate] = useState('2026-11-20');
  const [estimatedHours, setEstimatedHours] = useState(2);
  const [autoAssignSmart, setAutoAssignSmart] = useState(true);
  const [assignedTo, setAssignedTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const staffWorkload = useMemo(() => {
    if (!state) return [];
    return state.users
      .filter((u) => u.active && u.role !== 'owner')
      .map((u) => {
        const activeCount = state.tasks.filter(
          (t) => t.assignedTo === u.id && t.status !== 'مكتملة' && !t.archivedAt
        ).length;
        return { user: u, activeCount };
      });
  }, [state]);

  if (!open || !state) return null;

  const availableUnits = state.units.filter(
    (u) => !selectedPropertyId || u.propertyId === selectedPropertyId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    triggerHaptic('medium');
    try {
      const effectiveUnit = state.units.find((u) => u.id === selectedUnitId);
      const effectivePropId = selectedPropertyId || effectiveUnit?.propertyId || undefined;
      const res = await mutate<{ task?: { isQueued?: boolean; assignedTo?: string; smartAssignedReason?: string } }>(
        'POST',
        '/api/tasks',
        {
          title: title.trim(),
          description: description.trim() || relatedLabel || title.trim(),
          type,
          propertyId: effectivePropId,
          unitId: selectedUnitId || undefined,
          assignedTo: autoAssignSmart ? '' : assignedTo,
          autoAssignSmart,
          dueDate,
          priority,
          estimatedHours,
          status: 'مسندة',
          checklist: [
            { text: 'مراجعة المتطلبات والتأكد من الجاهزية', done: false },
            { text: 'تنفيذ المهمة وتوثيق النتيجة', done: false },
          ],
        },
        { offlineDescAr: `إنشاء مهمة: ${title.trim()}` }
      );
      if (res) {
        triggerHaptic('success');
        const assigneeName = state.users.find((u) => u.id === res.task?.assignedTo)?.nameAr;
        if (res.task?.isQueued) {
          pushToast(
            'info',
            lang === 'ar'
              ? 'جميع الموظفين المؤهلين مشغولون — تم وضع المهمة في قائمة الانتظار وتنبيه المدير'
              : 'All eligible staff busy — added to waiting queue'
          );
        } else {
          pushToast(
            'success',
            lang === 'ar'
              ? `تم إنشاء المهمة وإسنادها إلى ${assigneeName || 'الموظف المختص'}`
              : `Task assigned to ${assigneeName || 'staff'}`
          );
        }
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 my-auto animate-aqar-fade-scale"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#26478D]/10 dark:bg-blue-500/15 text-[#26478D] dark:text-blue-400 flex items-center justify-center">
              <ClipboardList className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold">{lang === 'ar' ? 'إنشاء مهمة سريعة' : 'Quick Create Task'}</h3>
              {relatedLabel && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{relatedLabel}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="sm:col-span-2 space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'عنوان المهمة' : 'Task Title'}
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: فحص عداد الكهرباء وتوثيق محضر الاستلام"
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'نوع المهمة' : 'Task Type'}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'الأولوية' : 'Priority'}
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
            >
              <option value="عاجل">عاجل</option>
              <option value="مرتفع">مرتفع</option>
              <option value="متوسط">متوسط</option>
              <option value="منخفض">منخفض</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'العقار المرتبط' : 'Property'}
            </label>
            <select
              value={selectedPropertyId}
              onChange={(e) => {
                setSelectedPropertyId(e.target.value);
                setSelectedUnitId('');
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
            >
              <option value="">{lang === 'ar' ? 'مهمة عامة (بدون عقار محدد)' : 'General Task'}</option>
              {state.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'الوحدة (اختياري)' : 'Unit (Optional)'}
            </label>
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
            >
              <option value="">{lang === 'ar' ? 'كامل العقار' : 'Whole Property'}</option>
              {availableUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  وحدة {u.unitNumber} ({u.unitType})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'الوقت التقديري (ساعات)' : 'Estimated Hours'}
            </label>
            <div className="relative">
              <Clock className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                className="w-full min-h-[42px] ps-9 pe-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-200">
              {lang === 'ar' ? 'التفاصيل والملاحظات' : 'Details'}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="تفاصيل التنفيذ المطلوبة والخطوات الميدانية..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
            />
          </div>
        </div>

        {/* Smart Assignment vs Manual Pick with Live Workload */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] space-y-3 text-xs">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="inline-flex items-center gap-2 font-bold text-[#26478D] dark:text-blue-400">
              <Sparkles className="w-4 h-4" />
              <span>
                {lang === 'ar'
                  ? 'التوزيع الذكي التلقائي (التخصص + العقار + أقل عبء عمل)'
                  : 'Smart Auto-Assign (Specialty + Property + Lowest Workload)'}
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoAssignSmart}
              onChange={(e) => setAutoAssignSmart(e.target.checked)}
              className="w-4 h-4 accent-[#26478D] cursor-pointer"
            />
          </label>

          {!autoAssignSmart && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {lang === 'ar' ? 'اختر الموظف (مع عبء المهام النشطة حالياً):' : 'Choose Staff (with current active workload):'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pe-1">
                {staffWorkload.map(({ user, activeCount }) => {
                  const selected = assignedTo === user.id;
                  const propOk =
                    !selectedPropertyId ||
                    !user.allowedPropertyIds?.length ||
                    user.allowedPropertyIds.includes(selectedPropertyId);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setAssignedTo(user.id)}
                      className={`p-2 rounded-lg border text-start flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        selected
                          ? 'border-[#26478D] bg-[#26478D]/10 dark:bg-blue-500/15'
                          : 'border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{user.nameAr}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {user.roleLabelAr}
                          {!propOk && ' · خارج نطاق العقار'}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-mono-num font-bold ${
                          activeCount >= 4
                            ? 'text-red-500'
                            : activeCount >= 2
                            ? 'text-amber-500'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {activeCount} مهام
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium cursor-pointer"
          >
            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[40px] px-5 py-2 rounded-xl bg-[#26478D] hover:bg-[#1e3a75] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{submitting ? 'جاري الإسناد...' : lang === 'ar' ? 'إنشاء وإسناد المهمة' : 'Create & Assign'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

interface CreateTaskQuickButtonProps {
  defaultType?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  propertyId?: string;
  unitId?: string;
  relatedLabel?: string;
  compact?: boolean;
  label?: string;
}

export function CreateTaskQuickButton({
  defaultType,
  defaultTitle,
  defaultDescription,
  propertyId,
  unitId,
  relatedLabel,
  compact = false,
  label,
}: CreateTaskQuickButtonProps) {
  const { lang, hasPermission } = useAqar();
  const [open, setOpen] = useState(false);

  if (!hasPermission('manage_tasks') && !hasPermission('execute_maintenance') && !hasPermission('manage_properties')) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-[#26478D]/30 bg-[#26478D]/10 dark:bg-blue-500/15 text-[#26478D] dark:text-blue-300 hover:bg-[#26478D]/20 font-semibold cursor-pointer whitespace-nowrap transition-colors ${
          compact ? 'px-3 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span>{label || (lang === 'ar' ? 'إنشاء مهمة' : 'Create Task')}</span>
      </button>
      {open && (
        <CreateTaskQuickModal
          open={open}
          onClose={() => setOpen(false)}
          defaultType={defaultType}
          defaultTitle={defaultTitle}
          defaultDescription={defaultDescription}
          propertyId={propertyId}
          unitId={unitId}
          relatedLabel={relatedLabel}
        />
      )}
    </>
  );
}
