import React from 'react';
import { Calculator, FileSignature, Wallet } from 'lucide-react';
import { LeasingFinanceTab, useAqar } from '../context/AqarContext';
import { LeasingContractsView } from './LeasingContractsView';
import { FinanceCollectionView } from './FinanceCollectionView';
import { AccountingOwnersView } from './AccountingOwnersView';

export function LeasingFinanceHubView() {
  const { leasingFinanceTab, setLeasingFinanceTab, lang, currentUser } = useAqar();
  const isAr = lang === 'ar';

  const tabs: {
    id: LeasingFinanceTab;
    labelAr: string;
    labelEn: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'leasing', labelAr: 'العقود والتأجير والإخلاء', labelEn: 'Contracts & Leasing', icon: FileSignature },
    { id: 'finance', labelAr: 'الدفعات والتحصيل والسندات', labelEn: 'Rent & Receipts', icon: Wallet },
    { id: 'accounting', labelAr: 'المحاسبة والملاك والمصروفات', labelEn: 'Accounting & Owners', icon: Calculator },
  ];

  // Technicians only have access if navigating directly, owners have access to all 3 scoped to owned props
  const activeTab = currentUser?.role === 'technician' ? 'leasing' : leasingFinanceTab;

  return (
    <div className="space-y-5">
      {/* Sub-Navigation Tabs inside Leasing & Finance */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface no-print">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setLeasingFinanceTab(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#26478D] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{isAr ? t.labelAr : t.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'leasing' && <LeasingContractsView />}
      {activeTab === 'finance' && <FinanceCollectionView />}
      {activeTab === 'accounting' && <AccountingOwnersView />}
    </div>
  );
}
