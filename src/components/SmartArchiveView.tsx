import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  GitCompareArrows,
  History,
  Lock,
  MessageSquare,
  Printer,
  Receipt as ReceiptIcon,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  Wrench,
  X,
  AlertTriangle,
  FolderArchive,
  Table2,
  List,
} from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import {
  ArchiveCategoryId,
  DocumentRecord,
  LeaseContract,
  MaintenanceTicket,
  Payment,
  RoleKey,
  SavedArchiveFilter,
  TaskItem,
  Tenant,
  Unit,
} from '../types/aqar';
import { formatDateTime } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { QrCodeSvg } from './QrCodeSvg';
import { exportArchiveRecords, exportSeparateAuditArchiveBundle, ArchiveExportRow } from '../utils/archiveExport';

interface ArchiveItemUnified {
  uid: string;
  id: string;
  category: ArchiveCategoryId;
  targetKind?: 'ticket' | 'task';
  title: string;
  subtitle: string;
  reference: string;
  archivedAt: string;
  createdAt: string;
  amount: number;
  currency?: string;
  statusLabel: string;
  reason: string;
  mode: string;
  archivedByName: string;
  propertyId?: string;
  propertyName: string;
  unitId?: string;
  unitNumber: string;
  tenantId?: string;
  tenantName: string;
  searchBlob: string;
  rawContract?: LeaseContract;
  rawTenant?: Tenant;
  rawPayment?: Payment;
  rawTicket?: MaintenanceTicket;
  rawTask?: TaskItem;
  rawDocument?: DocumentRecord;
  rawUnit?: Unit;
}

const ROLE_ARCHIVE_ACCESS: Record<RoleKey, ArchiveCategoryId[]> = {
  sys_owner: ['contracts', 'tenants', 'receipts', 'tickets', 'documents', 'units'],
  gm: ['contracts', 'tenants', 'receipts', 'tickets', 'documents', 'units'],
  accountant: ['contracts', 'receipts'],
  supervisor: ['units', 'tenants'],
  leasing: ['tenants'],
  maint_manager: ['tickets', 'units'],
  technician: ['tickets'],
  receptionist: ['tenants', 'documents'],
  auditor: ['contracts', 'tenants', 'receipts', 'tickets', 'documents', 'units'],
  owner: ['contracts', 'receipts', 'units'],
};

function getMonthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '2026-01';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthDivider(monthKey: string, lang: 'ar' | 'en'): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function buildSparklinePoints(items: ArchiveItemUnified[]): { labels: string[]; counts: number[] } {
  const map = new Map<string, number>();
  const now = new Date('2026-11-14T00:00:00Z');
  const labels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    labels.push(key);
    map.set(key, 0);
  }
  for (const item of items) {
    const key = getMonthKey(item.archivedAt);
    if (map.has(key)) {
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return { labels, counts: labels.map((l) => map.get(l) || 0) };
}

function MiniSparkline({ counts, strokeColor }: { counts: number[]; strokeColor: string }) {
  const width = 140;
  const height = 38;
  const max = Math.max(...counts, 1);
  const stepX = counts.length > 1 ? width / (counts.length - 1) : width;
  const pts = counts.map((v, i) => {
    const x = Math.round(i * stepX * 10) / 10;
    const y = Math.round((height - 6 - (v / max) * (height - 12)) * 10) / 10;
    return `${x},${y}`;
  });
  const pathD = pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  const areaD = pts.length > 0 ? `M 0,${height} L ${pts.join(' L ')} L ${width},${height} Z` : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-36 h-10 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${strokeColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {areaD && <path d={areaD} fill={`url(#spark-${strokeColor.replace('#', '')})`} />}
      {pathD && <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
      {pts.map((pt, idx) => {
        const [cx, cy] = pt.split(',');
        return <circle key={idx} cx={cx} cy={cy} r="2.4" fill={strokeColor} />;
      })}
    </svg>
  );
}

export function SmartArchiveView() {
  const { state, currentUser, lang, mutate, pushToast, formatInCurrency, convertToBase, baseCurrency } = useAqar();
  const isAr = lang === 'ar';

  const [activeCategory, setActiveCategory] = useState<ArchiveCategoryId | null>(null);
  const [rippleCard, setRippleCard] = useState<ArchiveCategoryId | null>(null);
  const [globalQuery, setGlobalQuery] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [timeframe, setTimeframe] = useState<'all' | 'this_month' | 'this_year'>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [minAmountFilter, setMinAmountFilter] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [receiptViewMode, setReceiptViewMode] = useState<'timeline' | 'table'>('timeline');
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);

  const [selectedRecord, setSelectedRecord] = useState<ArchiveItemUnified | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ArchiveItemUnified | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoreConflict, setRestoreConflict] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  const [reissueReceipt, setReissueReceipt] = useState<Payment | null>(null);

  const allowedCategories = useMemo<ArchiveCategoryId[]>(() => {
    if (!currentUser) return [];
    return ROLE_ARCHIVE_ACCESS[currentUser.role] || [];
  }, [currentUser]);

  const hideFinancialSensitive = currentUser?.role === 'leasing' || currentUser?.role === 'technician';
  const canWriteCategory = (cat: ArchiveCategoryId) => {
    if (!currentUser) return false;
    if (currentUser.role === 'owner') return false;
    if (currentUser.role === 'leasing' && cat !== 'tenants') return false;
    return allowedCategories.includes(cat);
  };

  const todayStr = '2026-11-14';
  const thisMonthPrefix = '2026-11';
  const thisYearPrefix = '2026';

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();
    (state?.users || []).forEach((u) => map.set(u.id, isAr ? u.nameAr : u.nameEn));
    return map;
  }, [state?.users, isAr]);

  const allArchivedItems = useMemo<ArchiveItemUnified[]>(() => {
    if (!state) return [];
    const propMap = new Map(state.properties.map((p) => [p.id, p]));
    const unitMap = new Map(state.units.map((u) => [u.id, u]));
    const tenantMap = new Map(state.tenants.map((t) => [t.id, t]));
    const items: ArchiveItemUnified[] = [];

    // 1. Contracts Archive
    for (const c of state.contracts) {
      const isArchivedContract =
        c.lifecycleStatus === 'منتهي' ||
        c.lifecycleStatus === 'منتهٍ بالإخلاء' ||
        c.lifecycleStatus === 'ملغي' ||
        Boolean(c.archivedAt);
      if (!isArchivedContract) continue;
      const prop = propMap.get(c.propertyId);
      const unit = unitMap.get(c.unitId);
      const ten = tenantMap.get(c.tenantId);
      const archivedAt = c.archivedAt || `${c.endDate}T12:00:00.000Z`;
      const reason = c.archiveReason || c.lifecycleStatus;
      items.push({
        uid: `contracts:${c.id}`,
        id: c.id,
        category: 'contracts',
        title: `${c.internalNumber} — ${ten ? (isAr ? ten.nameAr : ten.nameEn) : '—'}`,
        subtitle: `${prop ? (isAr ? prop.nameAr : prop.nameEn) : '—'} · ${isAr ? 'وحدة' : 'Unit'} ${unit?.unitNumber || '—'} · ${c.startDate} → ${c.endDate}`,
        reference: c.internalNumber,
        archivedAt,
        createdAt: c.createdAt,
        amount: convertToBase(c.annualRent, c.currency || 'SAR'),
        currency: c.currency || 'SAR',
        statusLabel: c.lifecycleStatus,
        reason,
        mode: c.archiveMode || 'تلقائي',
        archivedByName: c.archivedBy ? userLookup.get(c.archivedBy) || 'النظام' : 'النظام',
        propertyId: c.propertyId,
        propertyName: prop ? (isAr ? prop.nameAr : prop.nameEn) : '—',
        unitId: c.unitId,
        unitNumber: unit?.unitNumber || '—',
        tenantId: c.tenantId,
        tenantName: ten ? (isAr ? ten.nameAr : ten.nameEn) : '—',
        searchBlob: `${c.internalNumber} ${c.ejarNumber} ${ten?.nameAr || ''} ${ten?.nameEn || ''} ${prop?.nameAr || ''} ${unit?.unitNumber || ''} ${c.annualRent} ${c.startDate} ${c.endDate} ${reason}`.toLowerCase(),
        rawContract: c,
      });
    }

    // 2. Ex-Tenants Archive
    for (const t of state.tenants) {
      const isEx = t.classification === 'سابق' || Boolean(t.archivedAt);
      if (!isEx) continue;
      const tenantContracts = state.contracts.filter((c) => c.tenantId === t.id);
      const lastContract = tenantContracts[0];
      const prop = lastContract ? propMap.get(lastContract.propertyId) : undefined;
      const unit = lastContract ? unitMap.get(lastContract.unitId) : undefined;
      const tenantPaid = state.payments
        .filter((p) => p.tenantId === t.id && p.status === 'معتمد')
        .reduce((s, p) => s + convertToBase(p.amount, p.currency || 'SAR'), 0);
      const archivedAt = t.archivedAt || t.createdAt;
      const reason = t.archiveReason || (isAr ? 'مستأجر سابق' : 'Ex-Tenant');
      items.push({
        uid: `tenants:${t.id}`,
        id: t.id,
        category: 'tenants',
        title: isAr ? t.nameAr : t.nameEn,
        subtitle: `${t.nationalIdOrIqama} · ${t.phone} · ${isAr ? `تقييم السلوك ${t.rating}/5` : `Rating ${t.rating}/5`}`,
        reference: t.nationalIdOrIqama,
        archivedAt,
        createdAt: t.createdAt,
        amount: tenantPaid,
        statusLabel: t.rating >= 4 ? (isAr ? 'سجل ممتاز' : 'Good Standing') : t.rating === 3 ? (isAr ? 'مقبول' : 'Fair') : (isAr ? 'تنبيه سلوكي' : 'Caution'),
        reason,
        mode: t.archiveMode || 'تلقائي',
        archivedByName: t.archivedBy ? userLookup.get(t.archivedBy) || 'النظام' : 'النظام',
        propertyId: prop?.id,
        propertyName: prop ? (isAr ? prop.nameAr : prop.nameEn) : '—',
        unitId: unit?.id,
        unitNumber: unit?.unitNumber || '—',
        tenantId: t.id,
        tenantName: isAr ? t.nameAr : t.nameEn,
        searchBlob: `${t.nameAr} ${t.nameEn} ${t.nationalIdOrIqama} ${t.phone} ${t.email} ${t.notes || ''} ${prop?.nameAr || ''} ${unit?.unitNumber || ''} ${reason}`.toLowerCase(),
        rawTenant: t,
      });
    }

    // 3. Receipts Archive (Reversed, explicitly archived, or prior fiscal year < 2026)
    for (const p of state.payments) {
      const priorFiscal = p.createdAt.slice(0, 4) < '2026';
      if (p.status !== 'معكوس' && !p.archivedAt && !priorFiscal) continue;
      const prop = propMap.get(p.propertyId);
      const unit = unitMap.get(p.unitId);
      const ten = tenantMap.get(p.tenantId);
      const archivedAt = p.archivedAt || p.createdAt;
      const reason = p.archiveReason || p.reversalReason || (priorFiscal ? 'سند سنة مالية سابقة' : 'سند معكوس');
      items.push({
        uid: `receipts:${p.id}`,
        id: p.id,
        category: 'receipts',
        title: `${p.receiptNumber} — ${ten ? (isAr ? ten.nameAr : ten.nameEn) : '—'}`,
        subtitle: `${p.paymentMethod} · ${p.paymentType} · ${prop ? (isAr ? prop.nameAr : prop.nameEn) : '—'} (${unit?.unitNumber || '—'})`,
        reference: p.receiptNumber,
        archivedAt,
        createdAt: p.createdAt,
        amount: convertToBase(p.amount, p.currency || 'SAR'),
        currency: p.currency || 'SAR',
        statusLabel: p.status,
        reason,
        mode: p.archiveMode || 'تلقائي',
        archivedByName: p.archivedBy ? userLookup.get(p.archivedBy) || 'النظام' : 'النظام',
        propertyId: p.propertyId,
        propertyName: prop ? (isAr ? prop.nameAr : prop.nameEn) : '—',
        unitId: p.unitId,
        unitNumber: unit?.unitNumber || '—',
        tenantId: p.tenantId,
        tenantName: ten ? (isAr ? ten.nameAr : ten.nameEn) : '—',
        searchBlob: `${p.receiptNumber} ${p.reversedByReceiptId || ''} ${p.referenceNumber || ''} ${p.amount} ${p.paymentMethod} ${ten?.nameAr || ''} ${prop?.nameAr || ''} ${unit?.unitNumber || ''} ${reason}`.toLowerCase(),
        rawPayment: p,
      });
    }

    // 4. Closed Tickets & Completed Tasks Archive
    for (const tkt of state.tickets) {
      if (tkt.status !== 'مكتمل' && tkt.status !== 'مغلق' && !tkt.archivedAt) continue;
      const prop = propMap.get(tkt.propertyId);
      const unit = unitMap.get(tkt.unitId);
      const ten = tkt.tenantId ? tenantMap.get(tkt.tenantId) : undefined;
      const techName = tkt.assignedTo ? userLookup.get(tkt.assignedTo) || '—' : '—';
      const archivedAt = tkt.archivedAt || tkt.updatedAt;
      const reason = tkt.archiveReason || `بلاغ صيانة ${tkt.status}`;
      items.push({
        uid: `tickets:${tkt.id}`,
        id: tkt.id,
        category: 'tickets',
        targetKind: 'ticket',
        title: `${tkt.ticketNumber} — ${tkt.title}`,
        subtitle: `${tkt.category} · ${isAr ? 'الفني:' : 'Tech:'} ${techName} · ${prop?.nameAr || ''} (${unit?.unitNumber || '—'})`,
        reference: tkt.ticketNumber,
        archivedAt,
        createdAt: tkt.createdAt,
        amount: tkt.actualCost || tkt.estimatedCost || 0,
        statusLabel: tkt.status,
        reason,
        mode: tkt.archiveMode || 'تلقائي',
        archivedByName: tkt.archivedBy ? userLookup.get(tkt.archivedBy) || 'النظام' : 'النظام',
        propertyId: tkt.propertyId,
        propertyName: prop ? (isAr ? prop.nameAr : prop.nameEn) : '—',
        unitId: tkt.unitId,
        unitNumber: unit?.unitNumber || '—',
        tenantId: tkt.tenantId,
        tenantName: ten ? (isAr ? ten.nameAr : ten.nameEn) : '—',
        searchBlob: `${tkt.ticketNumber} ${tkt.title} ${tkt.description} ${tkt.diagnosis || ''} ${techName} ${prop?.nameAr || ''} ${unit?.unitNumber || ''} ${tkt.category} ${reason}`.toLowerCase(),
        rawTicket: tkt,
      });
    }

    for (const tsk of state.tasks) {
      if (tsk.status !== 'مكتملة' && !tsk.archivedAt) continue;
      const prop = tsk.propertyId ? propMap.get(tsk.propertyId) : undefined;
      const unit = tsk.unitId ? unitMap.get(tsk.unitId) : undefined;
      const assigneeName = userLookup.get(tsk.assignedTo) || '—';
      const archivedAt = tsk.archivedAt || tsk.createdAt;
      const reason = tsk.archiveReason || 'مهمة منجزة';
      items.push({
        uid: `tasks:${tsk.id}`,
        id: tsk.id,
        category: 'tickets',
        targetKind: 'task',
        title: `${isAr ? 'مهمة:' : 'Task:'} ${tsk.title}`,
        subtitle: `${tsk.type} · ${assigneeName} · ${prop?.nameAr || 'تشغيل عام'}`,
        reference: tsk.id.toUpperCase(),
        archivedAt,
        createdAt: tsk.createdAt,
        amount: 0,
        statusLabel: tsk.status,
        reason,
        mode: tsk.archiveMode || 'تلقائي',
        archivedByName: tsk.archivedBy ? userLookup.get(tsk.archivedBy) || 'النظام' : 'النظام',
        propertyId: tsk.propertyId,
        propertyName: prop ? (isAr ? prop.nameAr : prop.nameEn) : isAr ? 'تشغيل عام' : 'General',
        unitId: tsk.unitId,
        unitNumber: unit?.unitNumber || '—',
        tenantName: '—',
        searchBlob: `${tsk.title} ${tsk.description} ${tsk.type} ${assigneeName} ${prop?.nameAr || ''} ${unit?.unitNumber || ''} ${reason}`.toLowerCase(),
        rawTask: tsk,
      });
    }

    // 5. Documents Archive (Expired or explicitly archived)
    for (const doc of state.documents) {
      const isExpired = Boolean(doc.expiryDate && doc.expiryDate < todayStr);
      if (!isExpired && !doc.archivedAt) continue;
      let prop: ReturnType<typeof propMap.get> | undefined;
      let unit: ReturnType<typeof unitMap.get> | undefined;
      let ten: ReturnType<typeof tenantMap.get> | undefined;
      if (doc.relatedType === 'عقار') prop = propMap.get(doc.relatedId);
      if (doc.relatedType === 'مستأجر') ten = tenantMap.get(doc.relatedId);
      if (doc.relatedType === 'وحدة') {
        unit = unitMap.get(doc.relatedId);
        if (unit) prop = propMap.get(unit.propertyId);
      }
      if (doc.relatedType === 'عقد') {
        const ctr = state.contracts.find((c) => c.id === doc.relatedId);
        if (ctr) {
          prop = propMap.get(ctr.propertyId);
          unit = unitMap.get(ctr.unitId);
          ten = tenantMap.get(ctr.tenantId);
        }
      }
      const archivedAt = doc.archivedAt || doc.createdAt;
      const reason = doc.archiveReason || (isExpired ? 'مستند منتهي الصلاحية' : 'مستند مؤرشف');
      items.push({
        uid: `documents:${doc.id}`,
        id: doc.id,
        category: 'documents',
        title: doc.title,
        subtitle: `${doc.category} · ${doc.fileName} · ${doc.expiryDate ? `${isAr ? 'انتهى' : 'Exp:'} ${doc.expiryDate}` : `${doc.fileSizeKb} KB`}`,
        reference: doc.fileName,
        archivedAt,
        createdAt: doc.createdAt,
        amount: 0,
        statusLabel: isExpired ? (isAr ? 'منتهي الصلاحية' : 'Expired') : (isAr ? 'مؤرشف' : 'Archived'),
        reason,
        mode: doc.archiveMode || 'مجدول',
        archivedByName: doc.archivedBy ? userLookup.get(doc.archivedBy) || 'النظام' : 'النظام',
        propertyId: prop?.id,
        propertyName: prop ? (isAr ? prop.nameAr : prop.nameEn) : '—',
        unitId: unit?.id,
        unitNumber: unit?.unitNumber || '—',
        tenantId: ten?.id,
        tenantName: ten ? (isAr ? ten.nameAr : ten.nameEn) : '—',
        searchBlob: `${doc.title} ${doc.category} ${doc.fileName} ${doc.ocrRawText || ''} ${ten?.nameAr || ''} ${prop?.nameAr || ''} ${reason}`.toLowerCase(),
        rawDocument: doc,
      });
    }

    // 6. Inactive / Decommissioned Units Archive
    for (const u of state.units) {
      if (u.status !== 'موقوفة' && u.status !== 'مؤرشفة' && !u.archivedAt) continue;
      const prop = propMap.get(u.propertyId);
      const ten = u.linkedTenantId ? tenantMap.get(u.linkedTenantId) : undefined;
      const unitDues = state.installments
        .filter((i) => i.unitId === u.id && i.remainingAmount > 0 && i.status !== 'ملغاة')
        .reduce((s, i) => s + convertToBase(i.remainingAmount, i.currency || 'SAR'), 0);
      const archivedAt = u.archivedAt || `${u.vacantSince || todayStr}T10:00:00.000Z`;
      const reason = u.archiveReason || u.notes || u.status;
      items.push({
        uid: `units:${u.id}`,
        id: u.id,
        category: 'units',
        title: `${u.unitType} ${u.unitNumber} — ${prop ? (isAr ? prop.nameAr : prop.nameEn) : '—'}`,
        subtitle: `${u.buildingName} · ${isAr ? `الدور ${u.floor}` : `Floor ${u.floor}`} · ${u.areaSqm} م²`,
        reference: u.unitNumber,
        archivedAt,
        createdAt: archivedAt,
        amount: unitDues,
        statusLabel: u.status,
        reason,
        mode: u.archiveMode || 'يدوي',
        archivedByName: u.archivedBy ? userLookup.get(u.archivedBy) || 'النظام' : 'النظام',
        propertyId: u.propertyId,
        propertyName: prop ? (isAr ? prop.nameAr : prop.nameEn) : '—',
        unitId: u.id,
        unitNumber: u.unitNumber,
        tenantId: ten?.id,
        tenantName: ten ? (isAr ? ten.nameAr : ten.nameEn) : '—',
        searchBlob: `${u.unitNumber} ${u.unitType} ${u.buildingName} ${prop?.nameAr || ''} ${ten?.nameAr || ''} ${u.notes || ''} ${reason}`.toLowerCase(),
        rawUnit: u,
      });
    }

    return items.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  }, [state, isAr, convertToBase, userLookup]);

  const accessibleItems = useMemo(
    () => allArchivedItems.filter((item) => allowedCategories.includes(item.category)),
    [allArchivedItems, allowedCategories]
  );

  const globalSuggestions = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    return accessibleItems.filter((item) => item.searchBlob.includes(q)).slice(0, 8);
  }, [accessibleItems, globalQuery]);

  const categoryMeta: Record<
    ArchiveCategoryId,
    {
      titleAr: string;
      titleEn: string;
      descAr: string;
      descEn: string;
      unitLabelAr: string;
      unitLabelEn: string;
      colorHex: string;
      iconWrapClass: string;
      accentTextClass: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  > = {
    contracts: {
      titleAr: 'أرشيف العقود',
      titleEn: 'Contracts Archive',
      descAr: 'العقود المنتهية والملغاة والمقارنة القانونية',
      descEn: 'Expired & cancelled leases with legal history',
      unitLabelAr: 'عقد مؤرشف',
      unitLabelEn: 'archived contracts',
      colorHex: '#3B82F6',
      iconWrapClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
      accentTextClass: 'text-blue-600 dark:text-blue-400',
      icon: FileText,
    },
    tenants: {
      titleAr: 'أرشيف المستأجرين السابقين',
      titleEn: 'Ex-Tenants Archive',
      descAr: 'تقييم السلوك والالتزام قبل إعادة التأجير',
      descEn: 'Behavioral history & prior tenancy vetting',
      unitLabelAr: 'مستأجر سابق',
      unitLabelEn: 'ex-tenants',
      colorHex: '#64748B',
      iconWrapClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25',
      accentTextClass: 'text-slate-600 dark:text-slate-300',
      icon: UserCheck,
    },
    receipts: {
      titleAr: 'أرشيف الإيصالات',
      titleEn: 'Receipts Archive',
      descAr: 'الإيصالات المعكوسة وسجلات السنوات المالية',
      descEn: 'Reversed receipts & closed fiscal records',
      unitLabelAr: 'إيصال مؤرشف',
      unitLabelEn: 'archived receipts',
      colorHex: '#10B981',
      iconWrapClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
      accentTextClass: 'text-emerald-600 dark:text-emerald-400',
      icon: ReceiptIcon,
    },
    tickets: {
      titleAr: 'أرشيف البلاغات والمهام المغلقة',
      titleEn: 'Closed Tickets & Tasks',
      descAr: 'قاعدة معرفة الأعطال وتقييم أداء الفنيين',
      descEn: 'Maintenance knowledge base & technician logs',
      unitLabelAr: 'بلاغ ومهمة مغلقة',
      unitLabelEn: 'closed tickets/tasks',
      colorHex: '#F59E0B',
      iconWrapClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
      accentTextClass: 'text-amber-600 dark:text-amber-400',
      icon: Wrench,
    },
    documents: {
      titleAr: 'أرشيف المستندات',
      titleEn: 'Documents Archive',
      descAr: 'الهويات والإقامات والصكوك المنتهية الصلاحية',
      descEn: 'Expired IDs, deeds & historical PDFs',
      unitLabelAr: 'وثيقة مؤرشفة',
      unitLabelEn: 'archived documents',
      colorHex: '#6366F1',
      iconWrapClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/25',
      accentTextClass: 'text-indigo-600 dark:text-indigo-400',
      icon: FolderArchive,
    },
    units: {
      titleAr: 'أرشيف الوحدات المتوقفة',
      titleEn: 'Inactive Units Archive',
      descAr: 'الوحدات المخرجة للترميم أو الدمج أو التوقف',
      descEn: 'Decommissioned, merged or under-renovation units',
      unitLabelAr: 'وحدة متوقفة',
      unitLabelEn: 'inactive units',
      colorHex: '#EF4444',
      iconWrapClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25',
      accentTextClass: 'text-rose-600 dark:text-rose-400',
      icon: Building2,
    },
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<ArchiveCategoryId, number> = {
      contracts: 0,
      tenants: 0,
      receipts: 0,
      tickets: 0,
      documents: 0,
      units: 0,
    };
    for (const item of allArchivedItems) {
      counts[item.category] += 1;
    }
    return counts;
  }, [allArchivedItems]);

  const activeCategoryItems = useMemo(() => {
    if (!activeCategory) return [];
    const q = categoryQuery.trim().toLowerCase();
    const minAmt = Number(minAmountFilter) || 0;
    return accessibleItems.filter((item) => {
      if (item.category !== activeCategory) return false;
      if (q && !item.searchBlob.includes(q)) return false;
      if (timeframe === 'this_month' && !item.archivedAt.startsWith(thisMonthPrefix)) return false;
      if (timeframe === 'this_year' && !item.archivedAt.startsWith(thisYearPrefix)) return false;
      if (propertyFilter !== 'all' && item.propertyId !== propertyFilter) return false;
      if (tenantFilter !== 'all' && item.tenantId !== tenantFilter) return false;
      if (yearFilter !== 'all' && !item.archivedAt.startsWith(yearFilter) && !item.createdAt.startsWith(yearFilter)) return false;
      if (minAmt > 0 && item.amount < minAmt) return false;
      return true;
    });
  }, [activeCategory, accessibleItems, categoryQuery, timeframe, propertyFilter, tenantFilter, yearFilter, minAmountFilter]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, ArchiveItemUnified[]>();
    for (const item of activeCategoryItems) {
      const mKey = getMonthKey(item.archivedAt);
      const list = groups.get(mKey) || [];
      list.push(item);
      groups.set(mKey, list);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activeCategoryItems]);

  const summarySource = activeCategory ? activeCategoryItems : accessibleItems;
  const summaryTotalValue = useMemo(
    () => summarySource.reduce((s, item) => s + (item.amount || 0), 0),
    [summarySource]
  );
  const topPropertyName = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of summarySource) {
      if (!item.propertyName || item.propertyName === '—') continue;
      counts.set(item.propertyName, (counts.get(item.propertyName) || 0) + 1);
    }
    let best = '—';
    let bestCount = 0;
    for (const [name, cnt] of counts.entries()) {
      if (cnt > bestCount) {
        best = name;
        bestCount = cnt;
      }
    }
    return bestCount > 0 ? `${best} (${bestCount})` : '—';
  }, [summarySource]);

  const sparkData = useMemo(() => buildSparklinePoints(summarySource), [summarySource]);

  if (!state || !currentUser) return null;

  const openCategoryWithHero = (cat: ArchiveCategoryId) => {
    if (!allowedCategories.includes(cat)) {
      triggerHaptic('warning');
      pushToast(
        'info',
        isAr
          ? `صلاحية "${currentUser.roleLabelAr}" لا تشمل الوصول إلى ${categoryMeta[cat].titleAr}`
          : `Role "${currentUser.roleLabelEn}" does not have access to this archive`
      );
      return;
    }
    triggerHaptic('medium');
    setRippleCard(cat);
    setTimeout(() => {
      setRippleCard(null);
      setActiveCategory(cat);
      setCategoryQuery('');
      setPropertyFilter('all');
      setTenantFilter('all');
      setYearFilter('all');
      setMinAmountFilter('');
      setTimeframe('all');
      setCompareIds([]);
    }, 160);
  };

  const handleRunNightlyArchival = async () => {
    setIsBusy(true);
    triggerHaptic('light');
    try {
      const res = await mutate<{ summary?: string }>('POST', '/api/archive/run-scheduled', {});
      if (res) {
        triggerHaptic('success');
        pushToast('success', res.summary || (isAr ? 'تم تنفيذ الأرشفة المجدولة' : 'Scheduled archival completed'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    setIsBusy(true);
    try {
      const res = await mutate(
        'POST',
        '/api/archive/filters',
        {
          name: newFilterName.trim(),
          category: activeCategory || 'all',
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
          tenantId: tenantFilter !== 'all' ? tenantFilter : undefined,
          year: yearFilter !== 'all' ? yearFilter : undefined,
          minAmount: Number(minAmountFilter) > 0 ? Number(minAmountFilter) : undefined,
          timeframe,
          query: categoryQuery.trim() || undefined,
        }
      );
      if (res) {
        triggerHaptic('success');
        pushToast('success', isAr ? 'تم حفظ الفلتر المفضل بنجاح' : 'Archive filter saved');
        setNewFilterName('');
        setShowSaveFilterModal(false);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const applySavedFilter = (f: SavedArchiveFilter) => {
    triggerHaptic('light');
    if (f.category !== 'all' && allowedCategories.includes(f.category)) {
      setActiveCategory(f.category);
    }
    setPropertyFilter(f.propertyId || 'all');
    setTenantFilter(f.tenantId || 'all');
    setYearFilter(f.year || 'all');
    setMinAmountFilter(f.minAmount ? String(f.minAmount) : '');
    setTimeframe(f.timeframe || 'all');
    setCategoryQuery(f.query || '');
    setShowAdvancedFilters(true);
  };

  const openRestoreModal = (item: ArchiveItemUnified) => {
    triggerHaptic('light');
    setRestoreReason('');
    setRestoreConflict(null);
    if (item.category === 'contracts' && item.rawContract) {
      const conflictCtr = state.contracts.find(
        (c) =>
          c.id !== item.rawContract!.id &&
          c.unitId === item.rawContract!.unitId &&
          (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التوثيق')
      );
      if (conflictCtr) {
        setRestoreConflict(
          isAr
            ? `تنبيه تعارض: الوحدة مرتبطة حالياً بعقد أحدث (${conflictCtr.internalNumber}). هل تريد استعادة هذا العقد القديم كسجل مرجعي فقط؟`
            : `Conflict: Unit currently has an active lease (${conflictCtr.internalNumber}). Restore as reference-only record?`
        );
      }
    }
    setRestoreTarget(item);
  };

  const confirmRestore = async (referenceOnly = false) => {
    if (!restoreTarget) return;
    setIsBusy(true);
    try {
      const res = await mutate<{ restoredSummary?: string }>(
        'POST',
        '/api/archive/restore',
        {
          category: restoreTarget.category,
          entityId: restoreTarget.id,
          targetKind: restoreTarget.targetKind,
          referenceOnly,
          reason: restoreReason.trim() || (referenceOnly ? 'استعادة كسجل مرجعي فقط' : 'استعادة من الأرشيف الذكي'),
        },
        { offlineDescAr: `استعادة ${restoreTarget.reference} من الأرشيف` }
      );
      if (res) {
        triggerHaptic('success');
        pushToast('success', res.restoredSummary || (isAr ? 'تمت استعادة السجل بنجاح' : 'Record restored'));
        setRestoreTarget(null);
        setSelectedRecord(null);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleExport = (format: 'excel' | 'csv' | 'pdf', customItems?: ArchiveItemUnified[]) => {
    const list = customItems || activeCategoryItems;
    const rows: ArchiveExportRow[] = list.map((i) => ({
      id: i.id,
      title: i.title,
      reference: i.reference,
      date: i.archivedAt.slice(0, 10),
      amountLabel: hideFinancialSensitive ? '—' : i.amount > 0 ? formatInCurrency(i.amount, baseCurrency) : '—',
      status: i.statusLabel,
      reason: i.reason,
      propertyName: i.propertyName,
      unitNumber: i.unitNumber,
      tenantName: i.tenantName,
      mode: i.mode,
    }));
    const catId = activeCategory || 'all';
    const title = activeCategory
      ? isAr
        ? categoryMeta[activeCategory].titleAr
        : categoryMeta[activeCategory].titleEn
      : isAr
      ? 'الأرشيف الذكي الشامل'
      : 'Smart Archive Center';
    const file = exportArchiveRecords({
      format,
      categoryTitle: title,
      categoryId: catId,
      rows,
      state,
      currentUser,
      lang,
      watermarkText: watermarkEnabled ? (isAr ? 'أرشيف · نسخة مرجعية' : 'ARCHIVE · REFERENCE COPY') : undefined,
    });
    triggerHaptic('success');
    pushToast('success', isAr ? `تم تصدير ${file}` : `Exported ${file}`);
  };

  const toggleCompareContract = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const jumpToLinkedEntity = (cat: ArchiveCategoryId, entityId: string) => {
    const found = allArchivedItems.find((i) => i.category === cat && i.id === entityId);
    if (found && allowedCategories.includes(cat)) {
      triggerHaptic('light');
      setSelectedRecord(found);
      return;
    }
    // Check live entity summary toast if active or restricted
    if (!allowedCategories.includes(cat)) {
      pushToast('info', isAr ? 'السجل المرتبط خارج نطاق صلاحية القسم الحالي' : 'Linked record restricted by role');
      return;
    }
    if (cat === 'tenants') {
      const t = state.tenants.find((x) => x.id === entityId);
      if (t) pushToast('info', `${isAr ? 'المستأجر النشط:' : 'Active Tenant:'} ${t.nameAr} (${t.phone})`);
    } else if (cat === 'units') {
      const u = state.units.find((x) => x.id === entityId);
      if (u) pushToast('info', `${isAr ? 'الوحدة النشطة:' : 'Active Unit:'} ${u.unitNumber} · ${u.status}`);
    }
  };

  const comparedContracts = compareIds
    .map((id) => state.contracts.find((c) => c.id === id))
    .filter((c): c is LeaseContract => Boolean(c));

  const archiveAuditLogs = state.auditLogs
    .filter((a) => a.action.includes('أرشيف') || a.action.includes('استعادة') || a.entityType === 'SmartArchive')
    .slice(0, 6);

  return (
    <div className="space-y-6 rounded-3xl p-4 sm:p-6 border border-slate-200/80 dark:border-white/10 bg-gradient-to-br from-slate-100/90 via-white to-slate-50 dark:from-[#0A0E1A] dark:via-[#111728] dark:to-[#1A1F2E]">
      {/* Top Hero Header & Global Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {activeCategory ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveCategory(null);
              }}
              className="min-h-[44px] min-w-[44px] rounded-2xl border border-slate-200 dark:border-white/15 glass-surface flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer shrink-0"
              aria-label={isAr ? 'العودة لشبكة الأرشيف' : 'Back to Archive Grid'}
            >
              {isAr ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
            </button>
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-[#26478D]/15 dark:bg-blue-500/20 border border-[#26478D]/25 dark:border-blue-400/30 flex items-center justify-center text-[#26478D] dark:text-blue-300 shrink-0">
              <Archive className="w-6 h-6" />
            </div>
          )}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {activeCategory
                ? isAr
                  ? categoryMeta[activeCategory].titleAr
                  : categoryMeta[activeCategory].titleEn
                : isAr
                ? 'مركز الأرشيف الذكي'
                : 'Smart Archive Center'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              {activeCategory
                ? isAr
                  ? categoryMeta[activeCategory].descAr
                  : categoryMeta[activeCategory].descEn
                : isAr
                ? 'الذاكرة الدائمة للشركة — لا شيء يُحذف فعلياً، كل سجل محفوظ وقابل للتدقيق والاسترجاع'
                : 'Permanent institutional memory — nothing is permanently deleted, every record is auditable & restorable'}
            </p>
          </div>
        </div>

        {/* Global Cross-Archive Search with Live Autocomplete */}
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
          <input
            type="text"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder={
              isAr
                ? 'بحث شامل في الأرشيف: اسم، رقم، مبلغ، عقار...'
                : 'Global archive search: name, ref, amount, property...'
            }
            className="w-full ps-10 pe-9 py-2.5 min-h-[44px] rounded-2xl border border-slate-200 dark:border-white/15 bg-white/90 dark:bg-[#0D1323]/90 text-sm focus:outline-none focus:ring-2 focus:ring-[#26478D]"
          />
          {globalQuery && (
            <button
              type="button"
              onClick={() => setGlobalQuery('')}
              className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {globalQuery.trim() && (
            <div className="absolute top-full mt-2 inset-x-0 rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#131A2C] shadow-2xl overflow-hidden z-40">
              {globalSuggestions.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 text-center">
                  {isAr ? 'لا توجد سجلات مؤرشفة مطابقة للبحث' : 'No matching archived records'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-80 overflow-y-auto">
                  {globalSuggestions.map((item) => {
                    const meta = categoryMeta[item.category];
                    return (
                      <button
                        key={item.uid}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedRecord(item);
                          setGlobalQuery('');
                        }}
                        className="w-full px-4 py-3 text-start hover:bg-slate-50 dark:hover:bg-white/[0.05] flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{item.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.subtitle}
                          </div>
                        </div>
                        <span className={`text-[11px] font-semibold shrink-0 ${meta.accentTextClass}`}>
                          {isAr ? meta.titleAr : meta.titleEn}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Smart Summary Banner + Mini Sparkline + Scheduled Job & Audit Bundle */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr ? 'إجمالي السجلات المؤرشفة' : 'Total Archived Items'}
            </div>
            <div className="text-2xl font-bold font-mono-num mt-1">{summarySource.length}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr ? 'القيمة المالية المجمعة' : 'Financial Volume'}
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono-num mt-1 text-emerald-600 dark:text-emerald-400">
              {hideFinancialSensitive
                ? isAr
                  ? 'محجوب (صلاحية)'
                  : 'Restricted'
                : formatInCurrency(summaryTotalValue, baseCurrency)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr ? 'أكثر عقار تكراراً بالأرشيف' : 'Most Frequent Property'}
            </div>
            <div className="text-sm font-semibold mt-1.5 truncate">{topPropertyName}</div>
          </div>
          <div className="flex flex-col justify-center">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {isAr ? 'نشاط الأرشفة (6 أشهر)' : '6-Month Activity'}
            </div>
            <MiniSparkline
              counts={sparkData.counts}
              strokeColor={activeCategory ? categoryMeta[activeCategory].colorHex : '#3B82F6'}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 border-t xl:border-t-0 xl:border-s border-slate-200/80 dark:border-white/10 pt-3 xl:pt-0 xl:ps-5">
          {currentUser.role === 'gm' && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleRunNightlyArchival}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-white/15 bg-white/80 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تشغيل الأرشفة المجدولة' : 'Run Nightly Archival'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const file = exportSeparateAuditArchiveBundle(state, currentUser);
              triggerHaptic('success');
              pushToast('success', isAr ? `تم تصدير حزمة التدقيق المستقلة (${file})` : `Exported ${file}`);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-[#26478D] text-white hover:bg-[#1e3a75] text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isAr ? 'تصدير أرشيف منفصل للتدقيق' : 'Export Audit Bundle'}</span>
          </button>
        </div>
      </div>

      {/* Saved Favorite Filters Quick Strip */}
      {(state.savedArchiveFilters || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Bookmark className="w-3.5 h-3.5" />
            <span>{isAr ? 'فلاتر مفضلة:' : 'Saved Filters:'}</span>
          </span>
          {(state.savedArchiveFilters || []).map((f) => (
            <div key={f.id} className="inline-flex items-center rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] overflow-hidden">
              <button
                type="button"
                onClick={() => applySavedFilter(f)}
                className="px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer whitespace-nowrap"
              >
                {f.name}
              </button>
              <button
                type="button"
                onClick={() => mutate('DELETE', `/api/archive/filters/${f.id}`)}
                className="px-2 py-1.5 text-slate-400 hover:text-red-500 border-s border-slate-200/70 dark:border-white/10 cursor-pointer"
                aria-label="Remove saved filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* VIEW A: 2x3 Glass Cards Grid */}
      {!activeCategory && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.keys(categoryMeta) as ArchiveCategoryId[]).map((catId) => {
              const meta = categoryMeta[catId];
              const Icon = meta.icon;
              const isAllowed = allowedCategories.includes(catId);
              const count = categoryCounts[catId];
              const isRippling = rippleCard === catId;
              return (
                <button
                  key={catId}
                  type="button"
                  onClick={() => openCategoryWithHero(catId)}
                  className={`group relative overflow-hidden text-start p-5 sm:p-6 rounded-2xl border glass-surface transition-all duration-200 cursor-pointer ${
                    isAllowed
                      ? 'border-slate-200/90 dark:border-white/12 glass-card-interactive'
                      : 'border-slate-200/50 dark:border-white/5 opacity-60'
                  }`}
                >
                  {/* Tactile Light Ripple */}
                  {isRippling && (
                    <span className="pointer-events-none absolute inset-0 bg-blue-400/20 animate-ping rounded-2xl" />
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${meta.iconWrapClass}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    {isAllowed ? (
                      <span className="w-8 h-8 rounded-xl border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                        {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                        <Lock className="w-3.5 h-3.5" />
                        <span>{isAr ? 'مقيد' : 'Locked'}</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold font-mono-num tracking-tight">{count}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {isAr ? meta.unitLabelAr : meta.unitLabelEn}
                      </span>
                    </div>
                    <h3 className="text-base font-bold mt-1.5">{isAr ? meta.titleAr : meta.titleEn}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                      {isAr ? meta.descAr : meta.descEn}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Security & Audit Trail Verification Strip */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>{isAr ? 'حوكمة الأمان والخصوصية والنسخ الاحتياطي' : 'Archive Security, RBAC & Backup Policy'}</span>
              </div>
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  {isAr
                    ? `• صلاحية دورك الحالي (${currentUser.roleLabelAr}): الوصول إلى ${allowedCategories.length} من 6 أقسام أرشيف.`
                    : `• Your role (${currentUser.roleLabelEn}) grants access to ${allowedCategories.length} of 6 archive vaults.`}
                </p>
                <p>
                  {isAr
                    ? '• يتم تضمين جميع بيانات الأرشيف والمستندات الحساسة تلقائياً في النسخ الاحتياطية المشفرة.'
                    : '• All archive records & sensitive IDs are included automatically in encrypted workspace backups.'}
                </p>
                {state.archiveLastNightlyRun && (
                  <p className="text-slate-500 dark:text-slate-400 font-mono-num">
                    {isAr ? 'آخر جدولة تلقائية:' : 'Last scheduled run:'}{' '}
                    {formatDateTime(state.archiveLastNightlyRun, lang)}
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <History className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <span>{isAr ? 'سجل تدقيق الأرشيف (غير قابل للتعديل)' : 'Immutable Archive Audit Trail'}</span>
                </div>
                <span className="text-[11px] font-mono-num text-slate-500">{archiveAuditLogs.length}</span>
              </div>
              {archiveAuditLogs.length === 0 ? (
                <div className="text-xs text-slate-500 py-3">
                  {isAr ? 'تُسجل هنا تلقائياً كل عمليات الأرشفة والاستعادة مع الجهاز والسبب.' : 'Archive & restore events appear here.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-200/60 dark:divide-white/5">
                  {archiveAuditLogs.map((log) => (
                    <div key={log.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{log.summary}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {log.userName} · {log.deviceName}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
                        {formatDateTime(log.createdAt, lang)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* VIEW B: Archive Section Detail (Hero Transition + Search + Filters + Timeline / Table) */}
      {activeCategory && (
        <div className="space-y-5 animate-aqar-hero">
          {/* Search + Action Bar inside section */}
          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={categoryQuery}
                  onChange={(e) => setCategoryQuery(e.target.value)}
                  placeholder={
                    isAr
                      ? `ابحث داخل ${categoryMeta[activeCategory].titleAr} أثناء الكتابة...`
                      : `Instant search inside ${categoryMeta[activeCategory].titleEn}...`
                  }
                  className="w-full ps-9 pe-8 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]/80 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#26478D]"
                />
                {categoryQuery && (
                  <button
                    type="button"
                    onClick={() => setCategoryQuery('')}
                    className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    showAdvancedFilters
                      ? 'bg-[#26478D] text-white border-[#26478D]'
                      : 'border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{isAr ? 'فلترة متقدمة' : 'Advanced Filters'}</span>
                </button>

                {activeCategory === 'contracts' && (
                  <button
                    type="button"
                    disabled={compareIds.length !== 2}
                    onClick={() => setShowCompareModal(true)}
                    className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      compareIds.length === 2
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-slate-200 dark:border-white/10 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <GitCompareArrows className="w-3.5 h-3.5" />
                    <span>
                      {isAr ? `مقارنة عقدين (${compareIds.length}/2)` : `Compare 2 (${compareIds.length}/2)`}
                    </span>
                  </button>
                )}

                {activeCategory === 'receipts' && (
                  <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => setReceiptViewMode('timeline')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        receiptViewMode === 'timeline'
                          ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>{isAr ? 'زمني' : 'Timeline'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptViewMode('table')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        receiptViewMode === 'table'
                          ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Table2 className="w-3.5 h-3.5" />
                      <span>{isAr ? 'جدول محاسبي' : 'Ledger'}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowSaveFilterModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{isAr ? 'حفظ الفلتر' : 'Save Filter'}</span>
                </button>
              </div>
            </div>

            {/* Quick Filter Chips & Export Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all' as const, ar: 'الكل', en: 'All' },
                  { id: 'this_month' as const, ar: 'هذا الشهر', en: 'This Month' },
                  { id: 'this_year' as const, ar: 'هذا العام', en: 'This Year' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setTimeframe(chip.id);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      timeframe === chip.id
                        ? 'bg-[#26478D] text-white'
                        : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {isAr ? chip.ar : chip.en}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={watermarkEnabled}
                    onChange={(e) => setWatermarkEnabled(e.target.checked)}
                    className="rounded accent-[#26478D]"
                  />
                  <span>{isAr ? 'ختم مائي "أرشيف"' : 'Archive Watermark'}</span>
                </label>

                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('excel')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 text-xs font-medium cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Advanced Compound Filters Drawer */}
            {showAdvancedFilters && (
              <div className="pt-3 border-t border-slate-200/80 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={propertyFilter}
                  onChange={(e) => setPropertyFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D1323] text-xs"
                >
                  <option value="all">{isAr ? 'جميع العقارات' : 'All Properties'}</option>
                  {state.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isAr ? p.nameAr : p.nameEn}
                    </option>
                  ))}
                </select>

                <select
                  value={tenantFilter}
                  onChange={(e) => setTenantFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D1323] text-xs"
                >
                  <option value="all">{isAr ? 'جميع المستأجرين' : 'All Tenants'}</option>
                  {state.tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {isAr ? t.nameAr : t.nameEn}
                    </option>
                  ))}
                </select>

                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D1323] text-xs"
                >
                  <option value="all">{isAr ? 'جميع السنوات' : 'All Years'}</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </select>

                <input
                  type="number"
                  inputMode="decimal"
                  value={minAmountFilter}
                  onChange={(e) => setMinAmountFilter(e.target.value)}
                  disabled={hideFinancialSensitive}
                  placeholder={isAr ? 'الحد الأدنى للمبلغ (مثال: 15000)' : 'Min amount (e.g. 15000)'}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D1323] text-xs font-mono-num"
                />
              </div>
            )}
          </div>

          {/* Empty State */}
          {activeCategoryItems.length === 0 ? (
            <div className="p-10 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface text-center space-y-2">
              <Archive className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-sm font-semibold">
                {isAr ? 'لا توجد سجلات مطابقة في هذا الأرشيف' : 'No matching records in this archive'}
              </div>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'جرّب تعديل معايير البحث أو الفلاتر، أو انقل سجلات منتهية من شاشات التشغيل.'
                  : 'Try clearing filters or move completed records from operational screens.'}
              </p>
            </div>
          ) : activeCategory === 'receipts' && receiptViewMode === 'table' ? (
            /* Accounting Ledger Table View for Receipts Archive */
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-surface overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-start py-3 px-4 font-semibold">{isAr ? 'رقم السند' : 'Receipt #'}</th>
                    <th className="text-start py-3 px-4 font-semibold">{isAr ? 'المستأجر' : 'Tenant'}</th>
                    <th className="text-start py-3 px-4 font-semibold">{isAr ? 'العقار / الوحدة' : 'Property / Unit'}</th>
                    <th className="text-start py-3 px-4 font-semibold">{isAr ? 'المبلغ' : 'Amount'}</th>
                    <th className="text-start py-3 px-4 font-semibold">{isAr ? 'الحالة والسبب' : 'Status & Reason'}</th>
                    <th className="text-start py-3 px-4 font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="text-end py-3 px-4 font-semibold">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {activeCategoryItems.map((item) => (
                    <tr key={item.uid} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03]">
                      <td className="py-3 px-4 font-mono-num font-bold">{item.reference}</td>
                      <td className="py-3 px-4 font-medium">{item.tenantName}</td>
                      <td className="py-3 px-4 text-slate-500">{item.propertyName} · {item.unitNumber}</td>
                      <td className="py-3 px-4 font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                        {formatInCurrency(item.amount, baseCurrency)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-semibold ${item.statusLabel === 'معكوس' ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {item.statusLabel}
                        </span>
                        <span className="text-slate-400"> · {item.reason}</span>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-slate-500">{item.archivedAt.slice(0, 10)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(item)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                          >
                            {isAr ? 'عرض' : 'View'}
                          </button>
                          {item.rawPayment && (
                            <button
                              type="button"
                              onClick={() => setReissueReceipt(item.rawPayment!)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              {isAr ? 'إعادة إصدار' : 'Reissue'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Chronological Timeline View with Monthly Dividers */
            <div className="space-y-6">
              {timelineGroups.map(([monthKey, groupItems]) => (
                <div key={monthKey} className="space-y-3">
                  {/* Monthly Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <Calendar className="w-3.5 h-3.5 text-[#26478D] dark:text-blue-400" />
                      <span>{formatMonthDivider(monthKey, lang)}</span>
                    </div>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                    <span className="text-[11px] font-mono-num text-slate-400">
                      {groupItems.length} {isAr ? 'سجل' : 'items'}
                    </span>
                  </div>

                  {/* Record Glass Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                    {groupItems.map((item) => {
                      const isCompared = compareIds.includes(item.id);
                      const ratingVal = item.rawTenant?.rating;
                      const ratingColor =
                        ratingVal !== undefined
                          ? ratingVal >= 4
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ratingVal === 3
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                          : '';
                      return (
                        <div
                          key={item.uid}
                          className={`p-4 sm:p-5 rounded-2xl border glass-surface flex flex-col justify-between gap-4 transition-all ${
                            isCompared
                              ? 'border-blue-500 ring-1 ring-blue-500/40'
                              : 'border-slate-200/80 dark:border-white/10'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold truncate">{item.title}</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                  {item.subtitle}
                                </p>
                              </div>
                              <div className="text-end shrink-0">
                                {!hideFinancialSensitive && item.amount > 0 && (
                                  <div className="text-sm font-bold font-mono-num text-[#26478D] dark:text-blue-300">
                                    {formatInCurrency(item.amount, baseCurrency)}
                                  </div>
                                )}
                                <div className="text-[11px] font-mono-num text-slate-400">
                                  {item.archivedAt.slice(0, 10)}
                                </div>
                              </div>
                            </div>

                            {/* Unboxed Metadata & Behavioral / Archive Reason */}
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                              <span className="font-semibold text-amber-600 dark:text-amber-400">
                                {item.reason}
                              </span>
                              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {item.statusLabel} ({item.mode})
                              </span>
                              {ratingVal !== undefined && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                                  <span className={`inline-flex items-center gap-1 font-semibold ${ratingColor}`}>
                                    <Star className="w-3.5 h-3.5 fill-current" />
                                    <span className="font-mono-num">{ratingVal}/5</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Card Action Buttons */}
                          <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  setSelectedRecord(item);
                                }}
                                className="px-3 min-h-[38px] rounded-xl bg-[#26478D]/10 dark:bg-blue-500/15 text-[#26478D] dark:text-blue-300 hover:bg-[#26478D]/20 text-xs font-semibold cursor-pointer"
                              >
                                {isAr ? 'عرض التفاصيل' : 'Inspect'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleExport('pdf', [item])}
                                className="px-3 min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                              >
                                {isAr ? 'تصدير' : 'Export'}
                              </button>

                              {item.category === 'contracts' && (
                                <button
                                  type="button"
                                  onClick={() => toggleCompareContract(item.id)}
                                  className={`px-3 min-h-[38px] rounded-xl border text-xs font-medium cursor-pointer ${
                                    isCompared
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                                  }`}
                                >
                                  {isCompared ? (isAr ? 'محدد للمقارنة' : 'Selected') : isAr ? 'مقارنة' : 'Compare'}
                                </button>
                              )}

                              {item.category === 'receipts' && item.rawPayment && (
                                <button
                                  type="button"
                                  onClick={() => setReissueReceipt(item.rawPayment!)}
                                  className="px-3 min-h-[38px] rounded-xl border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 text-xs font-semibold cursor-pointer"
                                >
                                  {isAr ? 'إعادة إصدار' : 'Reissue'}
                                </button>
                              )}

                              {item.category === 'tenants' && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedRecord(item)}
                                  className="inline-flex items-center gap-1 px-3 min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'تواصل سابق' : 'Prior Comms'}</span>
                                </button>
                              )}
                            </div>

                            {canWriteCategory(item.category) && (
                              <button
                                type="button"
                                onClick={() => openRestoreModal(item)}
                                className="inline-flex items-center gap-1 px-3 min-h-[38px] rounded-xl border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 text-xs font-semibold cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{isAr ? 'استعادة' : 'Restore'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DETAIL & AUTO-LINKING DRAWER */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#111728] p-5 sm:p-6 space-y-5 shadow-2xl animate-aqar-fade-scale">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#26478D] dark:text-blue-400">
                  {isAr ? categoryMeta[selectedRecord.category].titleAr : categoryMeta[selectedRecord.category].titleEn} ·{' '}
                  <span className="font-mono-num">{selectedRecord.reference}</span>
                </div>
                <h3 className="text-lg font-bold mt-1">{selectedRecord.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedRecord.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Key Info Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
                <div className="text-[11px] text-slate-500">{isAr ? 'تاريخ الأرشفة' : 'Archived Date'}</div>
                <div className="text-xs font-bold font-mono-num mt-1">{formatDateTime(selectedRecord.archivedAt, lang)}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
                <div className="text-[11px] text-slate-500">{isAr ? 'نمط الأرشفة' : 'Archive Mode'}</div>
                <div className="text-xs font-bold mt-1">{selectedRecord.mode} · {selectedRecord.archivedByName}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
                <div className="text-[11px] text-slate-500">{isAr ? 'الحالة' : 'Status'}</div>
                <div className="text-xs font-bold mt-1">{selectedRecord.statusLabel}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
                <div className="text-[11px] text-slate-500">{isAr ? 'القيمة' : 'Amount'}</div>
                <div className="text-xs font-bold font-mono-num mt-1">
                  {hideFinancialSensitive ? '—' : selectedRecord.amount > 0 ? formatInCurrency(selectedRecord.amount, baseCurrency) : '—'}
                </div>
              </div>
            </div>

            {/* Category-Specific Deep Info */}
            {selectedRecord.rawPayment && (
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1.5 text-xs">
                  <div className="font-bold">{isAr ? 'تفاصيل الإيصال المحاسبي والتحقق الضريبي' : 'Receipt & ZATCA QR Audit'}</div>
                  <div>{isAr ? 'طريقة الدفع:' : 'Method:'} {selectedRecord.rawPayment.paymentMethod}</div>
                  <div>{isAr ? 'المرجع:' : 'Reference:'} <span className="font-mono-num">{selectedRecord.rawPayment.referenceNumber || '—'}</span></div>
                  {selectedRecord.rawPayment.reversedByReceiptId && (
                    <div className="text-rose-500 font-semibold">
                      {isAr ? 'القيد/السند العكسي:' : 'Reversal ID:'} {selectedRecord.rawPayment.reversedByReceiptId} — {selectedRecord.rawPayment.reversalReason}
                    </div>
                  )}
                </div>
                <QrCodeSvg
                  value={`RCP:${selectedRecord.rawPayment.receiptNumber}|AMT:${selectedRecord.rawPayment.amount}|VAT:${state.settings.vatNumber}`}
                  size={84}
                />
              </div>
            )}

            {selectedRecord.rawTicket && (
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 space-y-2 text-xs">
                <div className="font-bold">{isAr ? 'التشخيص الفني وقاعدة المعرفة' : 'Diagnosis & Maintenance Knowledge Base'}</div>
                <p className="text-slate-600 dark:text-slate-300">{selectedRecord.rawTicket.description}</p>
                {selectedRecord.rawTicket.diagnosis && (
                  <div><strong>{isAr ? 'التشخيص:' : 'Diagnosis:'}</strong> {selectedRecord.rawTicket.diagnosis}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                    <div className="text-[11px] text-slate-500">{isAr ? 'توثيق قبل الصيانة' : 'Before Service'}</div>
                    <div className="mt-0.5">{selectedRecord.rawTicket.beforeNote || 'تم فحص العطل ميدانياً'}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10">
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300">{isAr ? 'توثيق بعد الصيانة' : 'After Service'}</div>
                    <div className="mt-0.5">{selectedRecord.rawTicket.afterNote || 'تم الإصلاح والاختبار بنجاح'}</div>
                  </div>
                </div>
              </div>
            )}

            {selectedRecord.rawTenant && (
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{isAr ? 'التقييم السلوكي وسجل التواصل' : 'Behavioral Rating & Prior Communications'}</span>
                  <span className="font-mono-num font-bold text-amber-500">{selectedRecord.rawTenant.rating}/5 ★</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">{selectedRecord.rawTenant.notes || 'لا توجد ملاحظات إضافية'}</p>
                <div className="text-[11px] text-slate-500">
                  {isAr ? 'الهوية:' : 'ID:'} <span className="font-mono-num">{selectedRecord.rawTenant.nationalIdOrIqama}</span> ·{' '}
                  {isAr ? 'الجوال:' : 'Phone:'} <span className="font-mono-num">{selectedRecord.rawTenant.phone}</span> ·{' '}
                  {isAr ? 'جهة العمل:' : 'Employer:'} {selectedRecord.rawTenant.employer || '—'}
                </div>
              </div>
            )}

            {selectedRecord.rawDocument?.dataUrl && selectedRecord.rawDocument.fileType !== 'PDF' && (
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 max-h-64 flex justify-center bg-slate-950/30">
                <img
                  src={selectedRecord.rawDocument.dataUrl}
                  alt={selectedRecord.rawDocument.title}
                  referrerPolicy="no-referrer"
                  className="max-h-64 object-contain"
                />
              </div>
            )}

            {/* Auto-Linking Section (الروابط الذكية) */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Sparkles className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <span>{isAr ? 'الروابط الذكية المرتبطة بالسجل (Auto-Linking)' : 'Smart Auto-Linked Records'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedRecord.tenantId && (
                  <button
                    type="button"
                    onClick={() => jumpToLinkedEntity('tenants', selectedRecord.tenantId!)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>{isAr ? 'المستأجر:' : 'Tenant:'} {selectedRecord.tenantName}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </button>
                )}
                {selectedRecord.unitId && (
                  <button
                    type="button"
                    onClick={() => jumpToLinkedEntity('units', selectedRecord.unitId!)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                  >
                    <Building2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>{isAr ? 'الوحدة:' : 'Unit:'} {selectedRecord.unitNumber}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </button>
                )}
                {selectedRecord.rawContract &&
                  !hideFinancialSensitive &&
                  state.payments
                    .filter((p) => p.contractId === selectedRecord.rawContract!.id)
                    .slice(0, 3)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const linked = allArchivedItems.find((x) => x.category === 'receipts' && x.id === p.id);
                          if (linked) setSelectedRecord(linked);
                          else setReissueReceipt(p);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 text-xs font-medium cursor-pointer"
                      >
                        <ReceiptIcon className="w-3.5 h-3.5" />
                        <span className="font-mono-num">{p.receiptNumber}</span>
                      </button>
                    ))}
                {selectedRecord.rawContract &&
                  state.tickets
                    .filter(
                      (t) =>
                        t.unitId === selectedRecord.rawContract!.unitId &&
                        t.createdAt.slice(0, 10) >= selectedRecord.rawContract!.startDate
                    )
                    .slice(0, 3)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => jumpToLinkedEntity('tickets', t.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 text-xs font-medium cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span className="font-mono-num">{t.ticketNumber}</span>
                      </button>
                    ))}
              </div>
            </div>

            {/* Item Lifecycle Timeline */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>{isAr ? 'الخط الزمني لدورة حياة السجل' : 'Record Lifecycle Timeline'}</span>
              </div>
              <div className="space-y-2 ps-3 border-s border-slate-200 dark:border-white/15 text-xs">
                <div>
                  <div className="font-semibold">{isAr ? '1. إنشاء السجل الأولي' : '1. Initial Creation'}</div>
                  <div className="text-[11px] text-slate-500 font-mono-num">{formatDateTime(selectedRecord.createdAt, lang)}</div>
                </div>
                <div>
                  <div className="font-semibold text-amber-600 dark:text-amber-400">
                    {isAr ? `2. نقل إلى الأرشيف الذكي (${selectedRecord.mode})` : `2. Archived (${selectedRecord.mode})`}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {selectedRecord.reason} · <span className="font-mono-num">{formatDateTime(selectedRecord.archivedAt, lang)}</span> · {selectedRecord.archivedByName}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleExport('pdf', [selectedRecord])}
                className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isAr ? 'طباعة / PDF بختم أرشيف' : 'Print / PDF'}</span>
              </button>
              {canWriteCategory(selectedRecord.category) && (
                <button
                  type="button"
                  onClick={() => openRestoreModal(selectedRecord)}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isAr ? 'استعادة السجل' : 'Restore Record'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RESTORE CONFIRMATION & CONFLICT WARNING MODAL */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#111728] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">{isAr ? 'تأكيد الاستعادة من الأرشيف' : 'Confirm Archive Restore'}</h3>
                  <p className="text-xs text-slate-500 font-mono-num">{restoreTarget.reference}</p>
                </div>
              </div>
              <button type="button" onClick={() => setRestoreTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 text-xs space-y-1">
              <div className="font-semibold">{restoreTarget.title}</div>
              <p className="text-slate-500">
                {restoreTarget.category === 'contracts' && (isAr ? 'سيتم إرجاع العقد إلى شاشة التأجير والعقود مع تسجيل العملية في سجل التدقيق.' : 'Contract will return to active Leasing screen & log to audit.')}
                {restoreTarget.category === 'tenants' && (isAr ? 'سيتم إرجاع المستأجر إلى قائمة المستأجرين النشطين (CRM).' : 'Tenant will return to active Tenants CRM.')}
                {restoreTarget.category === 'receipts' && (isAr ? 'سيُعاد الإيصال إلى سجل التحصيل للعرض المرجعي مع الحفاظ على قيود التدقيق.' : 'Receipt will return to active collection list.')}
                {restoreTarget.category === 'tickets' && (isAr ? 'سيتم إعادة فتح البلاغ/المهمة بحالة قيد التنفيذ في شاشة الصيانة.' : 'Ticket/task will reopen in Maintenance screen.')}
                {restoreTarget.category === 'documents' && (isAr ? 'سيتم استرجاع المستند إلى الخزينة النشطة للمستندات.' : 'Document will return to active Documents Vault.')}
                {restoreTarget.category === 'units' && (isAr ? 'سيتم إعادة تفعيل الوحدة في العقارات بحالة شاغرة وجاهزة للتأجير.' : 'Unit will reactivate as Vacant in Properties screen.')}
              </p>
            </div>

            {restoreConflict && (
              <div className="p-3.5 rounded-2xl border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>{restoreConflict}</div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5">
                {isAr ? 'سبب الاستعادة (يُسجل في سجل التدقيق):' : 'Restore reason (logged in audit):'}
              </label>
              <input
                type="text"
                value={restoreReason}
                onChange={(e) => setRestoreReason(e.target.value)}
                placeholder={isAr ? 'مثال: مراجعة قانونية / إعادة تفعيل الوحدة بعد الصيانة' : 'e.g. Legal review / Unit ready again'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                className="px-4 min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              {restoreConflict ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => confirmRestore(true)}
                  className="px-4 min-h-[42px] rounded-xl bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold cursor-pointer"
                >
                  {isAr ? 'استعادة كسجل مرجعي فقط' : 'Restore as Reference Only'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => confirmRestore(false)}
                  className="px-4 min-h-[42px] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold cursor-pointer"
                >
                  {isAr ? 'تأكيد الاستعادة الفورية' : 'Confirm Immediate Restore'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TWO-CONTRACT SIDE-BY-SIDE COMPARISON MODAL */}
      {showCompareModal && comparedContracts.length === 2 && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#111728] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2 text-base font-bold">
                <GitCompareArrows className="w-5 h-5 text-blue-500" />
                <span>{isAr ? 'مقارنة عقدين مؤرشفين' : 'Compare Two Archived Contracts'}</span>
              </div>
              <button type="button" onClick={() => setShowCompareModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500">
                    <th className="py-2.5 px-3 text-start">{isAr ? 'البند' : 'Field'}</th>
                    <th className="py-2.5 px-3 text-start font-mono-num">{comparedContracts[0].internalNumber}</th>
                    <th className="py-2.5 px-3 text-start font-mono-num">{comparedContracts[1].internalNumber}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {[
                    [isAr ? 'المستأجر' : 'Tenant', state.tenants.find((t) => t.id === comparedContracts[0].tenantId)?.nameAr || '—', state.tenants.find((t) => t.id === comparedContracts[1].tenantId)?.nameAr || '—'],
                    [isAr ? 'الوحدة' : 'Unit', state.units.find((u) => u.id === comparedContracts[0].unitId)?.unitNumber || '—', state.units.find((u) => u.id === comparedContracts[1].unitId)?.unitNumber || '—'],
                    [isAr ? 'الفترة' : 'Term', `${comparedContracts[0].startDate} → ${comparedContracts[0].endDate}`, `${comparedContracts[1].startDate} → ${comparedContracts[1].endDate}`],
                    [isAr ? 'الإيجار السنوي' : 'Annual Rent', hideFinancialSensitive ? '—' : formatInCurrency(comparedContracts[0].annualRent, comparedContracts[0].currency || 'SAR'), hideFinancialSensitive ? '—' : formatInCurrency(comparedContracts[1].annualRent, comparedContracts[1].currency || 'SAR')],
                    [isAr ? 'دورية السداد' : 'Frequency', comparedContracts[0].paymentFrequency, comparedContracts[1].paymentFrequency],
                    [isAr ? 'التأمين' : 'Deposit', hideFinancialSensitive ? '—' : formatInCurrency(comparedContracts[0].securityDeposit, comparedContracts[0].currency || 'SAR'), hideFinancialSensitive ? '—' : formatInCurrency(comparedContracts[1].securityDeposit, comparedContracts[1].currency || 'SAR')],
                    [isAr ? 'الحالة النهائية' : 'Final Status', comparedContracts[0].lifecycleStatus, comparedContracts[1].lifecycleStatus],
                    [isAr ? 'سبب الأرشفة' : 'Archive Reason', comparedContracts[0].archiveReason || '—', comparedContracts[1].archiveReason || '—'],
                  ].map(([label, v1, v2], idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-semibold text-slate-500">{label}</td>
                      <td className="py-2.5 px-3 font-medium">{v1}</td>
                      <td className="py-2.5 px-3 font-medium">{v2}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SAVE FAVORITE FILTER MODAL */}
      {showSaveFilterModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveFilter} className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#111728] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{isAr ? 'حفظ فلتر بحث مفضل' : 'Save Archive Filter'}</h3>
              <button type="button" onClick={() => setShowSaveFilterModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              required
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder={isAr ? 'اسم الفلتر (مثال: عقود الياسمين فوق 15 ألف)' : 'Filter name'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowSaveFilterModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold cursor-pointer">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" disabled={isBusy} className="px-4 py-2 rounded-xl bg-[#26478D] text-white text-xs font-semibold cursor-pointer">
                {isAr ? 'حفظ' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* REISSUE ARCHIVED RECEIPT MODAL */}
      {reissueReceipt && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#111728] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <h3 className="text-base font-bold">
                {isAr ? `نسخة سند قبض أرشيفية — ${reissueReceipt.receiptNumber}` : `Archive Receipt Copy — ${reissueReceipt.receiptNumber}`}
              </h3>
              <button type="button" onClick={() => setReissueReceipt(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'المبلغ:' : 'Amount:'}</span>
                <span className="font-mono-num font-bold">{formatInCurrency(reissueReceipt.amount, reissueReceipt.currency || 'SAR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'الحالة:' : 'Status:'}</span>
                <span className="font-semibold">{reissueReceipt.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'التاريخ:' : 'Date:'}</span>
                <span className="font-mono-num">{formatDateTime(reissueReceipt.createdAt, lang)}</span>
              </div>
            </div>
            <div className="flex justify-center py-2">
              <QrCodeSvg value={`REISSUE:${reissueReceipt.receiptNumber}|AMT:${reissueReceipt.amount}|STATUS:${reissueReceipt.status}`} size={100} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReissueReceipt(null)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold cursor-pointer">
                {isAr ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const found = allArchivedItems.find((i) => i.category === 'receipts' && i.id === reissueReceipt.id);
                  if (found) handleExport('pdf', [found]);
                  setReissueReceipt(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isAr ? 'طباعة نسخة بختم أرشيف' : 'Print Watermarked Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
