/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AqarProvider, useAqar } from './context/AqarContext';
import { LayoutShell } from './components/LayoutShell';
import { DashboardView } from './components/DashboardView';
import { PropertiesUnitsView } from './components/PropertiesUnitsView';
import { TenantsCrmView } from './components/TenantsCrmView';
import { LeasingFinanceHubView } from './components/LeasingFinanceHubView';
import { MaintenanceTasksView } from './components/MaintenanceTasksView';
import { AdminHubView } from './components/AdminHubView';
import { DocumentsVaultView } from './components/DocumentsVaultView';
import { SmartArchiveView } from './components/SmartArchiveView';
import { SettingsCenterView } from './components/SettingsCenterView';
import { CommunicationTemplatesView } from './components/CommunicationTemplatesView';
import { OnboardingJourney } from './components/OnboardingJourney';
import { TeamWorkforceView } from './components/TeamWorkforceView';

function AqarWorkspace() {
  const { loading, state, activeNav, lang, onboardingConfig, closeOnboarding } = useAqar();

  if (loading || !state) {
    return (
      <div className="min-h-screen flex bg-slate-50 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100">
        {/* Sidebar Skeleton */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-e border-slate-200 dark:border-white/10 glass-sidebar p-4 space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#26478D] to-[#0A0E1A] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden border border-white/15">
              <img
                src="/assets/aistudio/Aqar_plus_8de53ba4.svg"
                alt="AqarPlus"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain p-1"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-24 rounded-md aqar-skeleton" />
              <div className="h-2.5 w-16 rounded-md aqar-skeleton" />
            </div>
          </div>
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-10 rounded-xl aqar-skeleton" />
            ))}
          </div>
        </aside>

        {/* Main Viewport Skeleton */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-14 lg:h-16 px-4 lg:px-6 border-b border-slate-200 dark:border-white/10 glass-surface flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="lg:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-[#26478D] to-[#0A0E1A] text-white flex items-center justify-center font-bold text-xs overflow-hidden border border-white/15">
                <img
                  src="/assets/aistudio/Aqar_plus_8de53ba4.svg"
                  alt="AqarPlus"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-1"
                />
              </div>
              <div className="h-4 w-32 rounded-md aqar-skeleton" />
            </div>
            <div className="hidden md:block h-9 w-72 rounded-xl aqar-skeleton" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 rounded-lg aqar-skeleton" />
              <div className="h-8 w-8 rounded-lg aqar-skeleton" />
            </div>
          </div>

          <div className="p-4 lg:p-6 max-w-[1440px] w-full mx-auto space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="h-3 w-44 rounded-md aqar-skeleton" />
                <div className="h-6 w-60 rounded-lg aqar-skeleton" />
              </div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'جاري تهيئة مساحة العمل...' : 'Loading AqarPlus Workspace...'}
              </div>
            </div>

            {/* 4 KPI Skeleton Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-24 rounded aqar-skeleton" />
                    <div className="h-5 w-5 rounded-md aqar-skeleton" />
                  </div>
                  <div className="h-7 w-32 rounded-md aqar-skeleton" />
                  <div className="h-3 w-40 rounded aqar-skeleton" />
                </div>
              ))}
            </div>

            {/* Content Panels Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <div className="h-4 w-48 rounded aqar-skeleton" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl aqar-skeleton" />
                ))}
              </div>
              <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <div className="h-4 w-36 rounded aqar-skeleton" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl aqar-skeleton" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <LayoutShell>
        {activeNav === 'dashboard' && <DashboardView />}
        {activeNav === 'properties' && <PropertiesUnitsView />}
        {activeNav === 'leasing_finance' && <LeasingFinanceHubView />}
        {activeNav === 'tenants' && <TenantsCrmView />}
        {activeNav === 'maintenance' && <MaintenanceTasksView />}
        {activeNav === 'reports' && <AdminHubView key="reports" mode="reports" />}
        {activeNav === 'team' && <TeamWorkforceView />}
        {activeNav === 'documents' && <DocumentsVaultView />}
        {activeNav === 'archive' && <SmartArchiveView />}
        {activeNav === 'templates' && <CommunicationTemplatesView />}
        {activeNav === 'settings' && <SettingsCenterView />}
        {activeNav === 'about' && <SettingsCenterView initialSection="about" />}
      </LayoutShell>
      {onboardingConfig.open && (
        <OnboardingJourney
          key={`${onboardingConfig.initialStage}-${onboardingConfig.isLockMode}`}
          initialStage={onboardingConfig.initialStage}
          isLockMode={onboardingConfig.isLockMode}
          onComplete={closeOnboarding}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AqarProvider>
      <AqarWorkspace />
    </AqarProvider>
  );
}
