import React, { useState } from 'react';
import { Archive, X } from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { ArchiveCategoryId } from '../types/aqar';
import { triggerHaptic } from '../utils/haptics';

interface MoveToArchiveButtonProps {
  category: ArchiveCategoryId;
  entityId: string;
  targetKind?: 'ticket' | 'task';
  entityLabel?: string;
  labelAr?: string;
  labelEn?: string;
  compact?: boolean;
  variant?: 'default' | 'glassLight';
  onArchived?: () => void;
}

const REASON_PRESETS: Record<ArchiveCategoryId, string[]> = {
  contracts: [
    'انتهاء مدة العقد وعدم الرغبة بالتجديد',
    'إخلاء طوعي وتسليم الوحدة',
    'فسخ مبكر بالتراضي',
    'إلغاء قبل التفعيل',
  ],
  tenants: [
    'انتهاء الإشغال وإخلاء الوحدة',
    'إغلاق ملف عميل محتمل غير مكتمل',
    'انتقال المستأجر لعقار آخر',
  ],
  receipts: [
    'إقفال مالي للسنة المنصرمة',
    'حفظ مرجعي بعد التدقيق',
  ],
  tickets: [
    'اكتمال الصيانة واعتماد التشغيل',
    'إغلاق البلاغ لعدم الحاجة',
    'نقل لقاعدة معرفة الأعطال',
  ],
  documents: [
    'انتهاء صلاحية المستند',
    'استبدال بنسخة محدثة',
    'حفظ مرجعي أرشيفي',
  ],
  units: [
    'أعمال صيانة وتجديد شاملة',
    'سحب الوحدة بقرار المالك',
    'دمج أو إعادة تقسيم هندسي',
  ],
};

export function MoveToArchiveButton({
  category,
  entityId,
  targetKind,
  entityLabel,
  labelAr = 'نقل للأرشيف',
  labelEn = 'Archive',
  compact = false,
  variant = 'default',
  onArchived,
}: MoveToArchiveButtonProps) {
  const { mutate, pushToast, lang } = useAqar();
  const isAr = lang === 'ar';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      triggerHaptic('medium');
      const res = await mutate<{ summary?: string }>(
        'POST',
        '/api/archive/move',
        {
          category,
          entityId,
          targetKind,
          reason: reason.trim() || undefined,
        },
        { offlineDescAr: `نقل ${entityLabel || 'سجل'} إلى الأرشيف الذكي` }
      );
      if (res) {
        pushToast(
          'success',
          res.summary || (isAr ? 'تم النقل إلى الأرشيف الذكي بنجاح' : 'Moved to Smart Archive')
        );
        setOpen(false);
        setReason('');
        onArchived?.();
      }
    } catch (err) {
      pushToast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const triggerClasses =
    variant === 'glassLight'
      ? 'inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold cursor-pointer transition-colors'
      : compact
      ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer whitespace-nowrap'
      : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap';

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic('light');
          setOpen(true);
        }}
        title={isAr ? 'نقل إلى الأرشيف الذكي' : 'Move to Smart Archive'}
        className={triggerClasses}
      >
        <Archive className="w-3.5 h-3.5" />
        <span>{isAr ? labelAr : labelEn}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <form
            onSubmit={handleConfirm}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#13192B] p-5 space-y-4 shadow-2xl text-slate-900 dark:text-slate-100 animate-aqar-fade-scale"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {isAr ? 'نقل السجل إلى الأرشيف الذكي' : 'Move to Smart Archive'}
                  </h4>
                  {entityLabel && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{entityLabel}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {isAr
                ? 'القاعدة الذهبية في عقار بلس: لا شيء يُحذف فعلياً. سيتم حفظ السجل بجميع ارتباطاته في الأرشيف الذكي مع إمكانية المراجعة أو الاستعادة لاحقاً.'
                : 'Golden Rule: Nothing is ever deleted. The record and its links will be preserved in Smart Archive.'}
            </div>

            <div className="space-y-2 text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-200">
                {isAr ? 'سبب الأرشفة (اختياري):' : 'Archive Reason (optional):'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(REASON_PRESETS[category] || []).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer transition-colors ${
                      reason === preset
                        ? 'bg-[#26478D] text-white border-[#26478D]'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isAr ? 'اكتب سبباً توثيقياً للأرشفة أو اختر من الأعلى...' : 'Enter archive reason...'}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/15 bg-transparent focus:outline-none focus:ring-2 focus:ring-[#26478D]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] hover:bg-[#1e3a75] text-white disabled:opacity-50 cursor-pointer"
              >
                {busy
                  ? isAr
                    ? 'جاري الأرشفة...'
                    : 'Archiving...'
                  : isAr
                  ? 'تأكيد النقل للأرشيف'
                  : 'Confirm Archive'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
