import React from 'react';
import { Printer } from 'lucide-react';
import { useAqar } from '../context/AqarContext';

interface PrintViewButtonProps {
  compact?: boolean;
  labelAr?: string;
  labelEn?: string;
  className?: string;
}

export function PrintViewButton({
  compact = false,
  labelAr = 'طباعة',
  labelEn = 'Print',
  className = '',
}: PrintViewButtonProps) {
  const { lang } = useAqar();

  const handlePrint = () => {
    window.print();
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      title={lang === 'ar' ? 'طباعة المحتوى الحالي بتنسيق مهيأ للورق' : 'Print current view'}
      aria-label={lang === 'ar' ? labelAr : labelEn}
      className={`no-print inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
        compact ? 'p-2' : 'px-3.5 py-2'
      } ${className}`}
    >
      <Printer className="w-3.5 h-3.5 shrink-0" />
      {!compact && <span>{lang === 'ar' ? labelAr : labelEn}</span>}
    </button>
  );
}
