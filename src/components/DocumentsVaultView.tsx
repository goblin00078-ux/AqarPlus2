import React from 'react';
import { Archive, FolderOpen } from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { DocumentArchiveOcrPanel } from './DocumentArchiveOcrPanel';
import { PrintViewButton } from './PrintViewButton';

export function DocumentsVaultView() {
  const { state, lang, setActiveNav } = useAqar();
  const isAr = lang === 'ar';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#26478D]/10 text-[#26478D] dark:text-blue-400">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">
              {isAr ? 'الأرشيف المركزي والمستندات' : 'Central Document Vault'}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? `إجمالي المستندات (${state?.documents.length || 0}) · مسح بالكاميرا + استخراج Gemini OCR وربط تلقائي`
                : `${state?.documents.length || 0} documents · Camera Scan & Gemini OCR`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveNav('archive')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/15 glass-surface hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-amber-500" />
            <span>{isAr ? 'فتح الأرشيف الذكي' : 'Open Smart Archive'}</span>
          </button>
          <PrintViewButton />
        </div>
      </div>

      <DocumentArchiveOcrPanel />
    </div>
  );
}
