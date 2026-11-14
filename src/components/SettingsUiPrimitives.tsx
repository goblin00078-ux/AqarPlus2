import React, { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface GlassToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function GlassToggle({ checked, onChange, label, description, disabled }: GlassToggleProps) {
  const handleToggle = () => {
    if (disabled) return;
    triggerHaptic('light');
    onChange(!checked);
  };

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</div>}
          {description && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{description}</div>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26478D] disabled:opacity-50 ${
          checked
            ? 'bg-[#26478D] border-[#26478D] shadow-sm'
            : 'bg-slate-200 dark:bg-white/[0.08] border-slate-300 dark:border-white/10'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
            checked ? 'ltr:translate-x-6 rtl:-translate-x-6' : 'ltr:translate-x-1 rtl:-translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export interface BottomSheetOption<T extends string = string> {
  value: T;
  label: string;
  sublabel?: string;
}

interface BottomSheetSelectProps<T extends string = string> {
  label: string;
  value: T;
  options: BottomSheetOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
}

export function BottomSheetSelect<T extends string = string>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: BottomSheetSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <div>
        <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1.5">{label}</label>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setOpen(true);
          }}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:border-[#26478D]/50 text-xs sm:text-sm text-slate-900 dark:text-slate-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#26478D]"
        >
          <span className="truncate font-medium">{selected?.label || placeholder || value}</span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden animate-aqar-fade-scale"
          >
            <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h4 className="text-sm font-bold">{label}</h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 max-h-[60vh] overflow-y-auto space-y-1.5">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-start transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#26478D] text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold">{opt.label}</div>
                      {opt.sublabel && (
                        <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  children: React.ReactNode;
}

export function RippleButton({ variant = 'primary', children, className = '', onClick, ...rest }: RippleButtonProps) {
  const [ripplePos, setRipplePos] = useState<{ key: number; x: number; y: number } | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic(variant === 'danger' ? 'warning' : 'medium');
    const rect = e.currentTarget.getBoundingClientRect();
    setRipplePos({ key: Date.now(), x: e.clientX - rect.left, y: e.clientY - rect.top });
    onClick?.(e);
  };

  const baseStyles =
    variant === 'primary'
      ? 'bg-[#26478D] hover:bg-[#1e3a75] text-white shadow-sm'
      : variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
      : 'bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-white/10';

  return (
    <button
      {...rest}
      onClick={handleClick}
      className={`relative overflow-hidden inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 ${baseStyles} ${className}`}
    >
      {ripplePos && (
        <span
          key={ripplePos.key}
          style={{ left: ripplePos.x, top: ripplePos.y }}
          className="pointer-events-none absolute w-24 h-24 -ms-12 -mt-12 rounded-full bg-white/30 animate-aqar-ripple"
        />
      )}
      {children}
    </button>
  );
}
