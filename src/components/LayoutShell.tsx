import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  Wallet,
  Wrench,
  BarChart3,
  UserCog,
  FolderOpen,
  Search,
  Bell,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCheck,
  X,
  ChevronDown,
  Globe,
  Settings,
  Lock,
  Sparkles,
  Archive,
  MessageSquareText,
} from 'lucide-react';
import { NavSection, PrimaryNavSection, useAqar } from '../context/AqarContext';
import { formatDateTime } from '../utils/formatters';
import { PrintViewButton } from './PrintViewButton';

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const {
    state,
    currentUser,
    switchUser,
    lang,
    setLang,
    theme,
    toggleTheme,
    activeNav,
    setActiveNav,
    wsStatus,
    isBrowserOnline,
    isOfflineSimulated,
    toggleOfflineSimulation,
    offlineQueue,
    syncOfflineQueue,
    presence,
    toasts,
    dismissToast,
    mutate,
    openOnboarding,
  } = useAqar();

  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems: {
    id: PrimaryNavSection;
    labelAr: string;
    labelEn: string;
    icon: React.ComponentType<{ className?: string }>;
    ownerAllowed?: boolean;
  }[] = [
    { id: 'dashboard', labelAr: 'لوحة التحكم', labelEn: 'Dashboard', icon: LayoutDashboard, ownerAllowed: true },
    { id: 'properties', labelAr: 'العقارات', labelEn: 'Properties', icon: Building2, ownerAllowed: true },
    { id: 'leasing_finance', labelAr: 'الإيجارات والمالية', labelEn: 'Leasing & Finance', icon: Wallet, ownerAllowed: true },
    { id: 'tenants', labelAr: 'المستأجرون', labelEn: 'Tenants', icon: Users },
    { id: 'maintenance', labelAr: 'الصيانة والمهام', labelEn: 'Maintenance & Tasks', icon: Wrench },
    { id: 'reports', labelAr: 'التقارير', labelEn: 'Reports', icon: BarChart3, ownerAllowed: true },
    { id: 'team', labelAr: 'فريق العمل', labelEn: 'Team & Roles', icon: UserCog },
    { id: 'documents', labelAr: 'المستندات', labelEn: 'Documents', icon: FolderOpen, ownerAllowed: true },
    { id: 'archive', labelAr: 'الأرشيف الذكي', labelEn: 'Smart Archive', icon: Archive, ownerAllowed: true },
    { id: 'templates', labelAr: 'قوالب التواصل', labelEn: 'Templates', icon: MessageSquareText },
    { id: 'settings', labelAr: 'الإعدادات', labelEn: 'Settings', icon: Settings },
  ];

  const visibleNav = navItems.filter((item) => {
    if (currentUser?.role === 'owner') return Boolean(item.ownerAllowed);
    return true;
  });

  const activeNavMeta =
    activeNav === 'about'
      ? navItems.find((n) => n.id === 'settings') || navItems[0]
      : navItems.find((n) => n.id === activeNav) || navItems[0];

  const unreadNotifications = useMemo(() => {
    if (!state || !currentUser) return [];
    return state.notifications.filter(
      (n) => n.targetRoles.includes(currentUser.role) && !n.isReadBy.includes(currentUser.id)
    );
  }, [state, currentUser]);

  const roleNotifications = useMemo(() => {
    if (!state || !currentUser) return [];
    return state.notifications.filter((n) => n.targetRoles.includes(currentUser.role)).slice(0, 12);
  }, [state, currentUser]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !state) return [];
    const results: { typeAr: string; typeEn: string; title: string; subtitle: string; nav: NavSection }[] = [];

    for (const p of state.properties) {
      if (p.nameAr.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.district.toLowerCase().includes(q)) {
        results.push({ typeAr: 'عقار', typeEn: 'Property', title: p.nameAr, subtitle: `${p.code} · ${p.district}`, nav: 'properties' });
      }
    }
    for (const u of state.units) {
      if (u.unitNumber.toLowerCase().includes(q) || u.status.toLowerCase().includes(q)) {
        const prop = state.properties.find((p) => p.id === u.propertyId);
        results.push({ typeAr: 'وحدة', typeEn: 'Unit', title: `${u.unitType} ${u.unitNumber}`, subtitle: `${prop?.nameAr || ''} · ${u.status}`, nav: 'properties' });
      }
    }
    for (const t of state.tenants) {
      if (t.nameAr.toLowerCase().includes(q) || t.nationalIdOrIqama.includes(q) || t.phone.includes(q)) {
        results.push({ typeAr: 'مستأجر', typeEn: 'Tenant', title: t.nameAr, subtitle: `${t.nationalIdOrIqama} · ${t.phone}`, nav: 'tenants' });
      }
    }
    for (const c of state.contracts) {
      if (c.internalNumber.toLowerCase().includes(q) || c.ejarNumber.toLowerCase().includes(q)) {
        results.push({ typeAr: 'عقد', typeEn: 'Contract', title: c.internalNumber, subtitle: `إيجار: ${c.ejarNumber || 'غير موثق'} · ${c.lifecycleStatus}`, nav: 'leasing' });
      }
    }
    for (const pay of state.payments) {
      if (pay.receiptNumber.toLowerCase().includes(q)) {
        results.push({ typeAr: 'سند قبض', typeEn: 'Receipt', title: pay.receiptNumber, subtitle: `${pay.amount.toLocaleString()} ر.س · ${pay.paymentMethod}`, nav: 'finance' });
      }
    }
    for (const tkt of state.tickets) {
      if (tkt.ticketNumber.toLowerCase().includes(q) || tkt.title.toLowerCase().includes(q)) {
        results.push({ typeAr: 'صيانة', typeEn: 'Ticket', title: `${tkt.ticketNumber} · ${tkt.title}`, subtitle: `${tkt.category} · ${tkt.status}`, nav: 'maintenance' });
      }
    }
    for (const doc of state.documents) {
      if (doc.title.toLowerCase().includes(q) || doc.category.toLowerCase().includes(q)) {
        results.push({ typeAr: 'مستند', typeEn: 'Document', title: doc.title, subtitle: `${doc.category} · ${doc.fileName}`, nav: 'documents' });
      }
    }
    return results.slice(0, 8);
  }, [searchQuery, state]);

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-e border-slate-200 dark:border-white/10 glass-sidebar sticky top-0 h-screen no-print">
        {/* Brand Zone */}
        <div className="px-5 h-16 flex items-center justify-between border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#26478D] to-[#0A0E1A] text-white flex items-center justify-center font-bold text-sm overflow-hidden shrink-0 border border-white/15 shadow-sm">
              {state?.settings.logoDataUrl ? (
                <img
                  src={state.settings.logoDataUrl}
                  alt="Logo"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src="/assets/aistudio/Aqar_plus_8de53ba4.svg"
                  alt="AqarPlus"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-1"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight truncate">
                {state?.settings.nameAr && state.settings.logoDataUrl ? state.settings.nameAr : 'AqarPlus'}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {lang === 'ar' ? 'إدارة الأملاك' : 'REMS'}
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#26478D] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{lang === 'ar' ? item.labelAr : item.labelEn}</span>
              </button>
            );
          })}
        </nav>

        {/* Real Live Connected Team Presence Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{lang === 'ar' ? 'الأجهزة المتصلة الآن' : 'Live Devices'}</span>
            <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-200">{presence.length}</span>
          </div>
          <div className="space-y-1.5 max-h-28 overflow-y-auto">
            {presence.slice(0, 4).map((s, idx) => (
              <div key={`${s.userId}-${idx}`} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                <span className="truncate max-w-[130px]">{s.nameAr}</span>
                <span className="text-slate-400 dark:text-slate-500 truncate max-w-[85px]">{s.roleLabelAr}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Top Bar (Compact 56px mobile / 64px desktop to honor 15% sticky viewport budget) */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 px-3 lg:px-6 border-b border-slate-200 dark:border-white/10 glass-surface flex items-center justify-between gap-3 no-print">
          {/* Active Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="lg:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-[#26478D] to-[#0A0E1A] text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden border border-white/15">
              {state?.settings.logoDataUrl ? (
                <img
                  src={state.settings.logoDataUrl}
                  alt="Logo"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src="/assets/aistudio/Aqar_plus_8de53ba4.svg"
                  alt="AqarPlus"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-1"
                />
              )}
            </div>
            <h1 className="text-base lg:text-lg font-semibold truncate">
              {lang === 'ar' ? activeNavMeta.labelAr : activeNavMeta.labelEn}
            </h1>
          </div>

          {/* Global Search */}
          <div className="relative hidden md:block flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'بحث شامل: مستأجر، وحدة، عقد، سند، بلاغ...'
                  : 'Global search: tenant, unit, contract, receipt...'
              }
              className="w-full ps-9 pe-8 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#26478D]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {searchQuery.trim() && (
              <div className="absolute top-full mt-2 inset-x-0 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] shadow-xl overflow-hidden z-50">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">
                    {lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching records'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {searchResults.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setActiveNav(r.nav);
                          setSearchQuery('');
                        }}
                        className="w-full px-4 py-2.5 text-start hover:bg-slate-50 dark:hover:bg-white/[0.05] flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{r.title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.subtitle}</div>
                        </div>
                        <span className="text-[11px] font-medium text-[#26478D] dark:text-blue-400 shrink-0">
                          {lang === 'ar' ? r.typeAr : r.typeEn}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Offline & Sync Control */}
            <button
              onClick={toggleOfflineSimulation}
              title={lang === 'ar' ? 'تبديل وضع الاتصال / العمل دون إنترنت' : 'Toggle Online / Offline Mode'}
              className={`inline-flex items-center gap-1.5 px-2.5 min-h-[38px] lg:min-h-[36px] rounded-xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                !isBrowserOnline || isOfflineSimulated || wsStatus === 'offline'
                  ? 'border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              {!isBrowserOnline || isOfflineSimulated || wsStatus === 'offline' ? (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{lang === 'ar' ? 'دون إنترنت' : 'Offline'}</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">{lang === 'ar' ? 'مزامنة حية' : 'Live Sync'}</span>
                </>
              )}
              {offlineQueue.length > 0 && (
                <span className="font-mono-num text-[11px] px-1.5 py-0.5 rounded bg-amber-600 text-white">
                  {offlineQueue.length}
                </span>
              )}
            </button>

            {offlineQueue.length > 0 && !isOfflineSimulated && (
              <button
                onClick={syncOfflineQueue}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'مزامنة الآن' : 'Sync'}</span>
              </button>
            )}

            {/* Role / Active User Switcher */}
            <div className="relative">
              <button
                onClick={() => {
                  setUserMenuOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
              >
                <span className="max-w-[110px] truncate">{currentUser?.roleLabelAr || 'المستخدم'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userMenuOpen && state && (
                <div className="absolute end-0 top-full mt-2 w-72 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {lang === 'ar' ? 'تبديل حساب الموظف / الصلاحيات' : 'Switch Active Team Role'}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-80 overflow-y-auto">
                    {state.users.map((u) => {
                      const active = u.id === currentUser?.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            switchUser(u.id);
                            setUserMenuOpen(false);
                          }}
                          className={`w-full px-4 py-2.5 text-start flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-white/[0.05] cursor-pointer ${
                            active ? 'bg-[#26478D]/10 dark:bg-[#26478D]/25' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{lang === 'ar' ? u.nameAr : u.nameEn}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {lang === 'ar' ? u.roleLabelAr : u.roleLabelEn} · {u.deviceName}
                            </div>
                          </div>
                          {active && <CheckCheck className="w-4 h-4 text-[#26478D] dark:text-blue-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-2 border-t border-slate-100 dark:border-white/10 grid grid-cols-2 gap-1.5 bg-slate-50/70 dark:bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        openOnboarding('splash', true);
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
                      <span>{lang === 'ar' ? 'قفل PIN' : 'Lock PIN'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        openOnboarding('company', false);
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-medium bg-[#26478D]/10 text-[#26478D] dark:text-blue-300 hover:bg-[#26478D]/20 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'معالج البداية' : 'Setup Wizard'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer inline-flex items-center gap-1"
              title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="font-mono-num">{lang === 'ar' ? 'EN' : 'AR'}</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Quick Print Current View */}
            <PrintViewButton compact />

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setUserMenuOpen(false);
                }}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-mono-num flex items-center justify-center">
                    {unreadNotifications.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute end-0 top-full mt-2 w-80 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                    <span className="text-xs font-semibold">{lang === 'ar' ? 'التنبيهات المباشرة' : 'Notifications'}</span>
                    {unreadNotifications.length > 0 && (
                      <button
                        onClick={() => mutate('POST', '/api/notifications/read')}
                        className="text-[11px] text-[#26478D] dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all read'}
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-80 overflow-y-auto">
                    {roleNotifications.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500 text-center">
                        {lang === 'ar' ? 'لا توجد تنبيهات حالية' : 'No notifications'}
                      </div>
                    ) : (
                      roleNotifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            if (n.relatedView) setActiveNav(n.relatedView as NavSection);
                            setNotifOpen(false);
                          }}
                          className="w-full px-4 py-3 text-start hover:bg-slate-50 dark:hover:bg-white/[0.04] space-y-1 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">{lang === 'ar' ? n.titleAr : n.titleEn}</span>
                            <span className="text-[10px] text-slate-400 font-mono-num shrink-0">
                              {formatDateTime(n.createdAt, lang)}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                            {lang === 'ar' ? n.messageAr : n.messageEn}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {/* Print-only Paper Letterhead */}
          <div className="hidden print-only-header items-center justify-between gap-4 pb-3 mb-4 border-b border-slate-300 text-slate-900">
            <div>
              <div className="text-base font-bold text-[#26478D]">
                {lang === 'ar' ? state?.settings.nameAr || 'AqarPlus' : state?.settings.nameEn || 'AqarPlus'}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {lang === 'ar' ? activeNavMeta.labelAr : activeNavMeta.labelEn}
              </div>
            </div>
            <div className="text-end text-[11px] text-slate-600">
              <div>
                {lang === 'ar' ? 'المستخدم:' : 'User:'}{' '}
                <span className="font-semibold">{lang === 'ar' ? currentUser?.nameAr : currentUser?.nameEn}</span>
              </div>
              <div className="font-mono-num">{formatDateTime(new Date().toISOString(), lang)}</div>
            </div>
          </div>
          {/* Graceful Offline Resilience Banner */}
          {(!isBrowserOnline || isOfflineSimulated) && (
            <div className="mb-4 px-4 py-2.5 rounded-2xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-medium">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'ar'
                    ? 'أنت تعمل حالياً من النسخة المحفوظة دون إنترنت — سيتم حفظ التعديلات ومزامنتها تلقائياً عند عودة الشبكة.'
                    : 'Working offline from cached workspace — edits queue safely and sync once reconnected.'}
                </span>
              </div>
              {offlineQueue.length > 0 && (
                <span className="font-mono-num text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  {lang === 'ar' ? `${offlineQueue.length} عمليات بالانتظار` : `${offlineQueue.length} queued`}
                </span>
              )}
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Thumb-Zone >= 44px height items) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 border-t border-slate-200 dark:border-white/10 glass-sidebar flex items-center gap-1 overflow-x-auto px-2 no-print">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`shrink-0 min-h-[44px] min-w-[60px] flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-medium cursor-pointer transition-colors ${
                isActive ? 'text-[#26478D] dark:text-blue-400 bg-[#26478D]/10 dark:bg-blue-400/10' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{lang === 'ar' ? item.labelAr : item.labelEn}</span>
            </button>
          );
        })}
      </nav>

      {/* Toasts Container */}
      <div className="fixed bottom-16 lg:bottom-5 end-4 z-50 space-y-2 max-w-sm no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl border shadow-lg text-xs font-medium flex items-center justify-between gap-3 ${
              t.type === 'error'
                ? 'bg-red-600 text-white border-red-500'
                : t.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-900 dark:bg-[#1A1F2E] text-white border-slate-700 dark:border-white/15'
            }`}
          >
            <span>{t.text}</span>
            <button onClick={() => dismissToast(t.id)} className="opacity-75 hover:opacity-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
