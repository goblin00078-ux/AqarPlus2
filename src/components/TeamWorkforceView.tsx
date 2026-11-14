import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  GitMerge,
  Kanban,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  MapPin,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
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
import { useAqar } from '../context/AqarContext';
import {
  PermissionKey,
  PermissionLevel,
  PermissionModuleKey,
  RoleKey,
  SecurityPolicy,
  StaffNotificationPrefs,
  StaffSecurityConfig,
  StaffStatusState,
  StaffUser,
  TaskItem,
  TaskStatus,
} from '../types/aqar';
import { formatDateTime, formatSar } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { CreateTaskQuickModal } from './CreateTaskQuickModal';

type WorkforceTab = 'members' | 'tasks' | 'performance' | 'rbac' | 'audit' | 'security';
type MemberDetailTab = 'performance' | 'tasks' | 'activity' | 'permissions' | 'settings';

const ROLE_CATALOG: {
  key: RoleKey;
  labelAr: string;
  labelEn: string;
  tierAr: string;
  descAr: string;
  defaultLimitSar: number;
}[] = [
  {
    key: 'sys_owner',
    labelAr: 'مالك النظام',
    labelEn: 'System Owner',
    tierAr: 'تحكم كامل',
    descAr: 'التحكم الكامل بالمنشأة، إدارة الحسابات والأمان، والنسخ الاحتياطي',
    defaultLimitSar: 9999999,
  },
  {
    key: 'gm',
    labelAr: 'مدير الشركة',
    labelEn: 'Company Manager',
    tierAr: 'مرتفع',
    descAr: 'الإشراف العام، التقارير المالية، واعتماد المصروفات الكبرى والقرارات',
    defaultLimitSar: 500000,
  },
  {
    key: 'supervisor',
    labelAr: 'المشرف العقاري',
    labelEn: 'Property Supervisor',
    tierAr: 'متوسط-مرتفع',
    descAr: 'إدارة العقارات والوحدات، متابعة الإشغال ومحاضر الاستلام والإخلاء',
    defaultLimitSar: 25000,
  },
  {
    key: 'accountant',
    labelAr: 'المحاسب',
    labelEn: 'Accountant',
    tierAr: 'مالي فقط',
    descAr: 'التحصيل، سندات القبض، المصروفات، القيود المحاسبية وتقارير الملاك',
    defaultLimitSar: 50000,
  },
  {
    key: 'leasing',
    labelAr: 'موظف التأجير',
    labelEn: 'Leasing Agent',
    tierAr: 'متوسط',
    descAr: 'تسجيل المستأجرين، إبرام العقود، التوثيق في إيجار ومتابعة المتأخرات',
    defaultLimitSar: 0,
  },
  {
    key: 'maint_manager',
    labelAr: 'مسؤول الصيانة',
    labelEn: 'Maintenance Manager',
    tierAr: 'تشغيلي',
    descAr: 'استقبال بلاغات الصيانة، إسناد المهام للفنيين، وإدارة الموردين',
    defaultLimitSar: 15000,
  },
  {
    key: 'technician',
    labelAr: 'فني الصيانة',
    labelEn: 'Technician',
    tierAr: 'محدود',
    descAr: 'تنفيذ المهام الميدانية المسندة ورفع التقارير والتشخيص والصور',
    defaultLimitSar: 0,
  },
  {
    key: 'receptionist',
    labelAr: 'موظف الاستقبال',
    labelEn: 'Receptionist',
    tierAr: 'أساسي',
    descAr: 'تسجيل البيانات الأولية للعملاء، رفع المستندات، وتوجيه البلاغات',
    defaultLimitSar: 0,
  },
  {
    key: 'auditor',
    labelAr: 'المراجع',
    labelEn: 'Auditor',
    tierAr: 'للقراءة فقط',
    descAr: 'الاطلاع الكامل على السجلات المالية والتشغيلية وسجل التدقيق دون تعديل',
    defaultLimitSar: 0,
  },
  {
    key: 'owner',
    labelAr: 'بوابة المالك',
    labelEn: 'Owner Portal',
    tierAr: 'محفظة المالك',
    descAr: 'متابعة عوائد وإشغال العقارات المملوكة ومستندات التسوية فقط',
    defaultLimitSar: 0,
  },
];

const MODULE_META: { key: PermissionModuleKey; labelAr: string }[] = [
  { key: 'properties', labelAr: 'العقارات والوحدات' },
  { key: 'tenants', labelAr: 'المستأجرين' },
  { key: 'contracts', labelAr: 'العقود وإيجار' },
  { key: 'finance', labelAr: 'التحصيل والإيصالات' },
  { key: 'expenses', labelAr: 'المصروفات والموافقات' },
  { key: 'maintenance', labelAr: 'بلاغات الصيانة' },
  { key: 'tasks', labelAr: 'المهام والتوزيع' },
  { key: 'documents', labelAr: 'خزنة المستندات' },
  { key: 'archive', labelAr: 'الأرشيف الذكي' },
  { key: 'team', labelAr: 'إدارة الفريق' },
  { key: 'audit', labelAr: 'سجل التدقيق' },
  { key: 'backups', labelAr: 'النسخ الاحتياطي' },
];

const LEVEL_META: { key: PermissionLevel; labelAr: string }[] = [
  { key: 'view', labelAr: 'مشاهدة' },
  { key: 'create', labelAr: 'إضافة' },
  { key: 'edit', labelAr: 'تعديل' },
  { key: 'delete_void', labelAr: 'حذف / إلغاء' },
  { key: 'approve', labelAr: 'اعتماد' },
];

const PERMISSION_KEYS_LIST: { key: PermissionKey; labelAr: string }[] = [
  { key: 'view_all', labelAr: 'عرض شامل للمحفظة' },
  { key: 'manage_properties', labelAr: 'إدارة العقارات والوحدات' },
  { key: 'manage_tenants', labelAr: 'إدارة المستأجرين' },
  { key: 'manage_contracts', labelAr: 'العقود وتوثيق إيجار' },
  { key: 'collect_payments', labelAr: 'التحصيل وسندات القبض' },
  { key: 'reverse_receipts', labelAr: 'عكس وإلغاء الإيصالات' },
  { key: 'manage_accounting', labelAr: 'المحاسبة والقيود' },
  { key: 'create_expense', labelAr: 'رفع مصروف وفاتورة' },
  { key: 'approve_expense_supervisor', labelAr: 'اعتماد مشرف' },
  { key: 'approve_expense_manager', labelAr: 'اعتماد المدير العام' },
  { key: 'manage_maintenance', labelAr: 'إدارة الصيانة والموردين' },
  { key: 'execute_maintenance', labelAr: 'تنفيذ الصيانة ميدانياً' },
  { key: 'manage_tasks', labelAr: 'إدارة وتوزيع المهام' },
  { key: 'manage_documents', labelAr: 'إدارة المستندات وOCR' },
  { key: 'manage_users', labelAr: 'إدارة الموظفين والصلاحيات' },
  { key: 'backup_restore', labelAr: 'النسخ الاحتياطي والاستعادة' },
  { key: 'view_audit', labelAr: 'الاطلاع على سجل التدقيق' },
];

function buildDefaultModulePerms(role: RoleKey): Partial<Record<PermissionModuleKey, PermissionLevel[]>> {
  if (role === 'sys_owner' || role === 'gm') {
    const full: PermissionLevel[] = ['view', 'create', 'edit', 'delete_void', 'approve'];
    return Object.fromEntries(MODULE_META.map((m) => [m.key, [...full]]));
  }
  if (role === 'auditor') {
    return Object.fromEntries(MODULE_META.map((m) => [m.key, ['view']]));
  }
  if (role === 'accountant') {
    return {
      properties: ['view'],
      tenants: ['view'],
      contracts: ['view'],
      finance: ['view', 'create', 'edit', 'delete_void', 'approve'],
      expenses: ['view', 'create', 'edit'],
      documents: ['view', 'create'],
      archive: ['view'],
    };
  }
  if (role === 'supervisor') {
    return {
      properties: ['view', 'create', 'edit'],
      tenants: ['view', 'create', 'edit'],
      contracts: ['view', 'create', 'edit', 'approve'],
      maintenance: ['view', 'create', 'edit', 'approve'],
      tasks: ['view', 'create', 'edit', 'approve'],
      expenses: ['view', 'create', 'approve'],
      documents: ['view', 'create'],
      archive: ['view', 'create'],
    };
  }
  if (role === 'leasing') {
    return {
      properties: ['view'],
      tenants: ['view', 'create', 'edit'],
      contracts: ['view', 'create', 'edit'],
      tasks: ['view', 'create'],
      documents: ['view', 'create'],
      archive: ['view'],
    };
  }
  if (role === 'maint_manager') {
    return {
      properties: ['view'],
      maintenance: ['view', 'create', 'edit', 'approve'],
      tasks: ['view', 'create', 'edit', 'approve'],
      expenses: ['view', 'create'],
      documents: ['view', 'create'],
    };
  }
  if (role === 'technician') {
    return {
      properties: ['view'],
      maintenance: ['view', 'edit'],
      tasks: ['view', 'edit'],
      documents: ['view', 'create'],
    };
  }
  if (role === 'receptionist') {
    return {
      properties: ['view'],
      tenants: ['view', 'create'],
      maintenance: ['view', 'create'],
      tasks: ['view', 'create'],
      documents: ['view', 'create'],
    };
  }
  return { properties: ['view'], finance: ['view'], contracts: ['view'] };
}

const CHART_COLORS = ['#26478D', '#10B981', '#F59E0B', '#6366F1', '#EC4899'];

export function TeamWorkforceView() {
  const { state, currentUser, lang, hasPermission, mutate, pushToast, presence } = useAqar();

  const [activeTab, setActiveTab] = useState<WorkforceTab>('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleKey | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StaffStatusState | 'all'>('all');
  const [showSkeletonPreview, setShowSkeletonPreview] = useState(false);

  // Employee Hero Detail Drawer
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<MemberDetailTab>('performance');

  // Add Employee 5-Step Wizard Modal
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardForm, setWizardForm] = useState<{
    nameAr: string;
    nameEn: string;
    email: string;
    phone: string;
    specialty: string;
    role: RoleKey;
    approvalLimitSar: number;
    allowedPropertyIds: string[];
    customModulePermissions: Partial<Record<PermissionModuleKey, PermissionLevel[]>>;
    twoFactorEnabled: boolean;
    biometricEnabled: boolean;
  }>({
    nameAr: '',
    nameEn: '',
    email: '',
    phone: '',
    specialty: '',
    role: 'leasing',
    approvalLimitSar: 0,
    allowedPropertyIds: [],
    customModulePermissions: buildDefaultModulePerms('leasing'),
    twoFactorEnabled: true,
    biometricEnabled: true,
  });

  // Tasks sub-tab states
  const [taskViewMode, setTaskViewMode] = useState<'kanban' | 'calendar'>('kanban');
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all');
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reviewRejectReason, setReviewRejectReason] = useState('');

  // Audit filters
  const [auditViewMode, setAuditViewMode] = useState<'table' | 'timeline'>('table');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState<string>('all');
  const [auditPropertyFilter, setAuditPropertyFilter] = useState<string>('all');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');

  // Security Policy draft
  const [policyDraft, setPolicyDraft] = useState<SecurityPolicy | null>(null);

  // Hooks must always run unconditionally before conditional return
  const users = state?.users || [];
  const tasks = state?.tasks || [];
  const auditLogs = state?.auditLogs || [];
  const properties = state?.properties || [];

  const liveOnlineUserIds = useMemo(() => new Set(presence.map((p) => p.userId)), [presence]);

  const userTaskMetrics = useMemo(() => {
    const map = new Map<
      string,
      { activeCount: number; completedCount: number; overdueCount: number; avgHours: number }
    >();
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const u of users) {
      const userTasks = tasks.filter((t) => t.assignedTo === u.id && !t.archivedAt);
      const activeTasks = userTasks.filter((t) => t.status !== 'مكتملة');
      const completedTasks = userTasks.filter((t) => t.status === 'مكتملة');
      const overdue = activeTasks.filter((t) => t.dueDate && t.dueDate < todayStr);
      const hoursList = completedTasks
        .map((t) => t.actualHours || t.estimatedHours || 2)
        .filter((h) => h > 0);
      const avgHours =
        hoursList.length > 0
          ? Math.round((hoursList.reduce((a, b) => a + b, 0) / hoursList.length) * 10) / 10
          : 0;
      map.set(u.id, {
        activeCount: activeTasks.length,
        completedCount: completedTasks.length,
        overdueCount: overdue.length,
        avgHours,
      });
    }
    return map;
  }, [users, tasks]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      const effectiveStatus: StaffStatusState = liveOnlineUserIds.has(u.id)
        ? 'متصل'
        : u.statusState || (u.active ? 'غير متصل' : 'غير متصل');
      if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;
      if (q) {
        const hay = `${u.nameAr} ${u.nameEn} ${u.roleLabelAr} ${u.specialty || ''} ${u.email} ${u.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, searchQuery, liveOnlineUserIds]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.archivedAt) return false;
      if (taskTypeFilter !== 'all' && t.type !== taskTypeFilter) return false;
      return true;
    });
  }, [tasks, taskTypeFilter]);

  const queuedTasks = useMemo(() => filteredTasks.filter((t) => t.isQueued), [filteredTasks]);

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, TaskItem[]>();
    const sorted = [...filteredTasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const t of sorted) {
      const dateKey = t.dueDate || 'غير محدد';
      const arr = groups.get(dateKey) || [];
      arr.push(t);
      groups.set(dateKey, arr);
    }
    return Array.from(groups.entries());
  }, [filteredTasks]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (auditUserFilter !== 'all' && log.userId !== auditUserFilter) return false;
      if (auditPropertyFilter !== 'all' && log.propertyId !== auditPropertyFilter) return false;
      if (auditActionFilter !== 'all' && !log.action.includes(auditActionFilter)) return false;
      const day = log.createdAt.slice(0, 10);
      if (auditDateFrom && day < auditDateFrom) return false;
      if (auditDateTo && day > auditDateTo) return false;
      if (q) {
        const hay = `${log.userName} ${log.action} ${log.summary} ${log.deviceName} ${log.ipAddress || ''} ${log.oldValue || ''} ${log.newValue || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, auditSearch, auditUserFilter, auditPropertyFilter, auditActionFilter, auditDateFrom, auditDateTo]);

  const performanceStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeTasksList = tasks.filter((t) => !t.archivedAt);
    const completed = activeTasksList.filter((t) => t.status === 'مكتملة');
    const overdue = activeTasksList.filter((t) => t.status !== 'مكتملة' && t.dueDate < todayStr);
    const avgHrs =
      completed.length > 0
        ? Math.round(
            (completed.reduce((s, t) => s + (t.actualHours || t.estimatedHours || 2), 0) / completed.length) * 10
          ) / 10
        : 0;

    const byStaffChart = users
      .filter((u) => u.role !== 'owner')
      .map((u) => {
        const m = userTaskMetrics.get(u.id);
        return {
          name: u.nameAr.split(' ').slice(0, 2).join(' '),
          مكتملة: m?.completedCount || 0,
          نشطة: m?.activeCount || 0,
        };
      });

    const typeCounts = new Map<string, number>();
    for (const t of activeTasksList) {
      typeCounts.set(t.type || 'إدارية', (typeCounts.get(t.type || 'إدارية') || 0) + 1);
    }
    const byTypePie = Array.from(typeCounts.entries()).map(([name, value]) => ({ name, value }));

    const propCounts = new Map<string, number>();
    for (const t of activeTasksList) {
      if (t.propertyId) propCounts.set(t.propertyId, (propCounts.get(t.propertyId) || 0) + 1);
    }
    const topProperties = Array.from(propCounts.entries())
      .map(([pid, count]) => ({
        property: properties.find((p) => p.id === pid),
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      completedCount: completed.length,
      overdueList: overdue,
      avgHrs,
      byStaffChart,
      byTypePie,
      topProperties,
    };
  }, [tasks, users, userTaskMetrics, properties]);

  if (!state || !currentUser) return null;

  const canManageTeam = hasPermission('manage_users');
  const canManageTasks = hasPermission('manage_tasks');
  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) || null : null;
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null;

  const effectivePolicy: SecurityPolicy = policyDraft ||
    state.securityPolicy || {
      minPasswordLength: 8,
      requireSpecialChars: true,
      passwordExpiryDays: 90,
      autoLockMinutes: 5,
      maxFailedAttempts: 5,
      require2faForManagersAndAccountants: true,
    };

  const getUserStatus = (u: StaffUser): StaffStatusState => {
    if (liveOnlineUserIds.has(u.id)) return 'متصل';
    return u.statusState || (u.active ? 'غير متصل' : 'غير متصل');
  };

  const statusTextColor = (s: StaffStatusState) => {
    if (s === 'متصل') return 'text-emerald-600 dark:text-emerald-400';
    if (s === 'مشغول') return 'text-amber-600 dark:text-amber-400';
    return 'text-slate-500 dark:text-slate-400';
  };

  // Handlers
  const handleWizardRoleChange = (role: RoleKey) => {
    const meta = ROLE_CATALOG.find((r) => r.key === role);
    setWizardForm((prev) => ({
      ...prev,
      role,
      approvalLimitSar: meta?.defaultLimitSar ?? 0,
      customModulePermissions: buildDefaultModulePerms(role),
    }));
  };

  const toggleWizardModuleLevel = (mod: PermissionModuleKey, lvl: PermissionLevel) => {
    setWizardForm((prev) => {
      const existing = prev.customModulePermissions[mod] || [];
      const next = existing.includes(lvl) ? existing.filter((x) => x !== lvl) : [...existing, lvl];
      return {
        ...prev,
        customModulePermissions: { ...prev.customModulePermissions, [mod]: next },
      };
    });
  };

  const handleSubmitNewEmployee = async () => {
    if (!wizardForm.nameAr.trim() || !wizardForm.phone.trim()) {
      pushToast('error', 'الاسم الكامل ورقم الجوال مطلوبان');
      return;
    }
    setWizardSubmitting(true);
    triggerHaptic('medium');
    try {
      const roleMeta = ROLE_CATALOG.find((r) => r.key === wizardForm.role)!;
      const res = await mutate<{ user?: StaffUser }>(
        'POST',
        '/api/team/users',
        {
          nameAr: wizardForm.nameAr,
          nameEn: wizardForm.nameEn || wizardForm.nameAr,
          email: wizardForm.email,
          phone: wizardForm.phone,
          role: wizardForm.role,
          roleLabelAr: roleMeta.labelAr,
          roleLabelEn: roleMeta.labelEn,
          specialty: wizardForm.specialty || roleMeta.labelAr,
          approvalLimitSar: wizardForm.approvalLimitSar,
          allowedPropertyIds: wizardForm.allowedPropertyIds,
          customModulePermissions: wizardForm.customModulePermissions,
          twoFactorEnabled: wizardForm.twoFactorEnabled,
          biometricEnabled: wizardForm.biometricEnabled,
        },
        { offlineDescAr: `إضافة الموظف ${wizardForm.nameAr}` }
      );
      if (res) {
        triggerHaptic('success');
        pushToast('success', `تمت إضافة ${wizardForm.nameAr} (${roleMeta.labelAr}) وتفعيل الصلاحيات بنجاح`);
        setShowAddWizard(false);
        setWizardStep(1);
        setWizardForm({
          nameAr: '',
          nameEn: '',
          email: '',
          phone: '',
          specialty: '',
          role: 'leasing',
          approvalLimitSar: 0,
          allowedPropertyIds: [],
          customModulePermissions: buildDefaultModulePerms('leasing'),
          twoFactorEnabled: true,
          biometricEnabled: true,
        });
      }
    } finally {
      setWizardSubmitting(false);
    }
  };

  const handleUpdateUserPatch = async (
    targetUserId: string,
    patch: Partial<{
      active: boolean;
      statusState: StaffStatusState;
      managerRating: number;
      approvalLimitSar: number;
      allowedPropertyIds: string[];
      customModulePermissions: Partial<Record<PermissionModuleKey, PermissionLevel[]>>;
      security: Partial<StaffSecurityConfig>;
      notificationPrefs: Partial<StaffNotificationPrefs>;
    }>,
    toastMsg?: string
  ) => {
    triggerHaptic('light');
    const res = await mutate('PATCH', `/api/team/users/${targetUserId}`, patch, {
      offlineDescAr: toastMsg || 'تحديث ملف موظف',
    });
    if (res && toastMsg) {
      pushToast('success', toastMsg);
    }
  };

  const handleToggleUserModuleLevel = async (
    user: StaffUser,
    mod: PermissionModuleKey,
    lvl: PermissionLevel
  ) => {
    const base = user.customModulePermissions || buildDefaultModulePerms(user.role);
    const curr = base[mod] || [];
    const next = curr.includes(lvl) ? curr.filter((x) => x !== lvl) : [...curr, lvl];
    await handleUpdateUserPatch(
      user.id,
      { customModulePermissions: { ...base, [mod]: next } },
      'تم تحديث صلاحية الوحدة للموظف'
    );
  };

  const handleToggleUserPropertyScope = async (user: StaffUser, propId: string) => {
    const current = user.allowedPropertyIds || [];
    const next = current.includes(propId) ? current.filter((id) => id !== propId) : [...current, propId];
    await handleUpdateUserPatch(
      user.id,
      { allowedPropertyIds: next },
      next.length > 0 ? `تم تقييد صلاحية العقارات (${next.length} عقار)` : 'تم فتح الصلاحية لجميع العقارات'
    );
  };

  const handleToggleRolePermission = async (role: RoleKey, permission: PermissionKey) => {
    triggerHaptic('light');
    await mutate('POST', '/api/permissions/toggle', { role, permission });
  };

  const handleTaskStatus = async (taskId: string, status: TaskStatus) => {
    triggerHaptic('light');
    const res = await mutate('PATCH', `/api/tasks/${taskId}`, { status }, { offlineDescAr: `تحديث حالة مهمة إلى ${status}` });
    if (res) pushToast('success', `تم نقل المهمة إلى «${status}»`);
  };

  const handleTaskChecklistToggle = async (task: TaskItem, idx: number) => {
    const checklist = task.checklist.map((step, i) => (i === idx ? { ...step, done: !step.done } : step));
    await mutate('PATCH', `/api/tasks/${task.id}`, { checklist });
  };

  const handleTaskComment = async (task: TaskItem) => {
    if (!commentText.trim()) return;
    const res = await mutate('PATCH', `/api/tasks/${task.id}`, { commentText: commentText.trim() });
    if (res) {
      setCommentText('');
      pushToast('success', 'تم إضافة التعليق وإرسال إشعار للفريق');
    }
  };

  const handleReassignTask = async (taskId: string) => {
    if (!reassignTargetId) return;
    const res = await mutate('POST', `/api/tasks/${taskId}/reassign`, {
      assignedTo: reassignTargetId,
      reason: reassignReason || 'إعادة توزيع عبء العمل',
    });
    if (res) {
      setReassignTargetId('');
      setReassignReason('');
      pushToast('success', 'تم تحويل المهمة للموظف البديل وتحديث قائمة الانتظار');
    }
  };

  const handleReviewTask = async (taskId: string, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !reviewRejectReason.trim()) {
      pushToast('error', 'يرجى إدخال سبب الإرجاع لتوضيح المطلوب للموظف');
      return;
    }
    const res = await mutate('POST', `/api/tasks/${taskId}/review`, {
      decision,
      reason: reviewRejectReason.trim() || undefined,
    });
    if (res) {
      setReviewRejectReason('');
      pushToast('success', decision === 'approve' ? 'تم اعتماد وإغلاق المهمة' : 'تم إرجاع المهمة للموظف للتعديل');
    }
  };

  const handleSaveSecurityPolicy = async () => {
    triggerHaptic('medium');
    const res = await mutate('PATCH', '/api/team/security-policy', effectivePolicy, {
      offlineDescAr: 'تحديث سياسة الأمان',
    });
    if (res) {
      setPolicyDraft(null);
      pushToast('success', 'تم حفظ وتطبيق سياسة الأمان للشركة');
    }
  };

  const handleTerminateRemoteSession = async (targetUserId: string, sessionId?: string) => {
    triggerHaptic('medium');
    const res = await mutate<{ terminatedCount?: number }>('POST', '/api/team/sessions/terminate', {
      userId: targetUserId,
      sessionId,
      reason: 'إنهاء جلسة إداري عن بُعد من مركز إدارة الفريق',
    });
    if (res) {
      pushToast('success', `تم إنهاء ${res.terminatedCount ?? 1} جلسة نشطة عن بُعد وتوثيق الحدث`);
    }
  };

  const handleResolveConflict = async (
    conflictId: string,
    resolution: 'تم اعتماد التعديل الأحدث' | 'تم الإبقاء على النسخة السابقة'
  ) => {
    const res = await mutate('POST', `/api/team/conflicts/${conflictId}/resolve`, { resolution });
    if (res) pushToast('success', `تمت معالجة التعارض: ${resolution}`);
  };

  const handleExportAuditExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = filteredAuditLogs.map((l) => [
      formatDateTime(l.createdAt, lang),
      l.userName,
      l.userRole,
      l.deviceName,
      l.ipAddress || '—',
      l.geoLocation || '—',
      l.action,
      l.summary,
      l.oldValue || '—',
      l.newValue || '—',
      l.reason || '—',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`${state.settings.nameAr} — سجل التدقيق الشامل (غير قابل للتعديل)`],
      ['تاريخ التصدير', formatDateTime(new Date().toISOString(), lang), 'عدد السجلات', rows.length],
      [],
      ['التاريخ والوقت', 'الموظف', 'الدور', 'الجهاز', 'IP', 'الموقع', 'العملية', 'التفاصيل', 'القيمة السابقة', 'القيمة الجديدة', 'السبب'],
      ...rows,
    ]);
    ws['!views'] = [{ rightToLeft: lang === 'ar' }];
    XLSX.utils.book_append_sheet(wb, ws, 'AuditTrail');
    XLSX.writeFile(wb, `AqarPlus-Audit-Trail-${new Date().toISOString().slice(0, 10)}.xlsx`);
    pushToast('success', 'تم تصدير سجل التدقيق بصيغة Excel');
  };

  const handleExportAuditPdf = () => {
    const esc = (s: string) =>
      String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const bodyRows = filteredAuditLogs
      .slice(0, 120)
      .map(
        (l) => `
      <tr>
        <td style="font-family:monospace;">${esc(formatDateTime(l.createdAt, lang))}</td>
        <td><strong>${esc(l.userName)}</strong><br/><span style="color:#64748b;font-size:10px;">${esc(l.userRole)}</span></td>
        <td style="font-family:monospace;font-size:10px;">${esc(l.deviceName)}<br/>${esc(l.ipAddress || '—')}</td>
        <td>${esc(l.action)}</td>
        <td>${esc(l.summary)}${l.reason ? `<br/><span style="color:#64748b;font-size:10px;">السبب: ${esc(l.reason)}</span>` : ''}</td>
      </tr>`
      )
      .join('');

    const html = `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" /><title>سجل التدقيق - ${esc(state.settings.nameAr)}</title><style>
      @page{size:A4 landscape;margin:12mm;} body{font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;color:#0f172a;margin:0;}
      .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #26478D;padding-bottom:10px;margin-bottom:14px;}
      table{width:100%;border-collapse:collapse;font-size:11px;} th{background:#26478D;color:#fff;padding:8px;text-align:start;}
      td{border-bottom:1px solid #e2e8f0;padding:7px 8px;vertical-align:top;} tr:nth-child(even) td{background:#f8fafc;}
    </style></head><body>
      <div class="hdr">
        <div><div style="font-size:16px;font-weight:700;color:#26478D;">${esc(state.settings.nameAr)}</div><div style="font-size:12px;">تقرير سجل التدقيق الشامل — غير قابل للتعديل</div></div>
        <div style="font-size:11px;color:#475569;text-align:end;">المصدر: ${esc(currentUser.nameAr)} · السجلات: ${filteredAuditLogs.length}</div>
      </div>
      <table><thead><tr><th>التاريخ</th><th>الموظف</th><th>الجهاز و IP</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>${bodyRows}</tbody></table>
    </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 1500);
      }, 250);
    }
    pushToast('success', 'تم تجهيز تقرير سجل التدقيق للطباعة والحفظ بصيغة PDF');
  };

  const kanbanColumns: { id: string; titleAr: string; statuses: TaskStatus[] }[] = [
    { id: 'new', titleAr: 'جديدة ومسندة', statuses: ['جديدة', 'مسندة'] },
    { id: 'progress', titleAr: 'قيد التنفيذ', statuses: ['قيد التنفيذ', 'معلقة'] },
    { id: 'review', titleAr: 'بانتظار المراجعة', statuses: ['بانتظار المراجعة'] },
    { id: 'done', titleAr: 'مكتملة', statuses: ['مكتملة'] },
  ];

  const pendingConflicts = (state.syncConflicts || []).filter((c) => c.status === 'بانتظار مراجعة المدير');

  return (
    <div className="space-y-6">
      {/* Workforce Header & Sub-Tabs */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#26478D] dark:text-blue-400">
              <Users className="w-4 h-4" />
              <span>{lang === 'ar' ? 'النظام العصبي للتشغيل والحوكمة' : 'Operations & Governance Nerve Center'}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">
              {lang === 'ar' ? 'إدارة فريق العمل والصلاحيات والمهام' : 'Team & Workforce Management'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar'
                ? 'هيكلة من 9 أدوار وظيفية، صلاحيات بـ 5 مستويات وعلى مستوى العقار، توزيع ذكي للمهام، وسجل تدقيق لا يُمحى.'
                : '9-role hierarchy, 5-level & property-scoped RBAC, smart task assignment, and immutable audit trail.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            {canManageTasks && (
              <button
                type="button"
                onClick={() => setShowCreateTaskModal(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#26478D]/30 bg-[#26478D]/10 dark:bg-blue-500/15 text-[#26478D] dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#26478D]/20 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إنشاء مهمة ذكية' : 'Create Smart Task'}</span>
              </button>
            )}
            {canManageTeam && (
              <button
                type="button"
                onClick={() => {
                  setWizardStep(1);
                  setShowAddWizard(true);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#26478D] hover:bg-[#1e3a75] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إضافة موظف جديد' : 'Add Employee'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 6 Segmented Sub-Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.05] overflow-x-auto no-print">
          {(
            [
              { id: 'members', labelAr: `الفريق (${users.length})`, icon: Users },
              { id: 'tasks', labelAr: `المهام الذكية (${filteredTasks.length})`, icon: Kanban },
              { id: 'performance', labelAr: 'الأداء والتقارير', icon: BarChart3 },
              { id: 'rbac', labelAr: 'الأدوار والصلاحيات', icon: Shield },
              { id: 'audit', labelAr: `سجل التدقيق (${auditLogs.length})`, icon: Activity },
              {
                id: 'security',
                labelAr: `الأمان والمزامنة${pendingConflicts.length > 0 ? ` (${pendingConflicts.length})` : ''}`,
                icon: Lock,
              },
            ] as { id: WorkforceTab; labelAr: string; icon: React.ComponentType<{ className?: string }> }[]
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(t.id);
                }}
                className={`shrink-0 min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  active
                    ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.labelAr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: TEAM MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-5">
          {/* Quick KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">إجمالي الكادر النشط</div>
              <div className="text-2xl font-bold font-mono-num mt-1">
                {users.filter((u) => u.active).length} / {users.length}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono-num">
                {liveOnlineUserIds.size} متصلون الآن عبر البث المباشر
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">المهام النشطة على الفريق</div>
              <div className="text-2xl font-bold font-mono-num mt-1">
                {tasks.filter((t) => !t.archivedAt && t.status !== 'مكتملة').length}
              </div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono-num">
                {queuedTasks.length} في قائمة الانتظار
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">المصادقة الثنائية 2FA مفعّلة</div>
              <div className="text-2xl font-bold font-mono-num mt-1">
                {users.filter((u) => u.security?.twoFactorEnabled).length} موظف
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">حماية الحسابات الحساسة</div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">متوسط تقييم الأداء</div>
              <div className="text-2xl font-bold font-mono-num mt-1">
                {(users.reduce((s, u) => s + (u.managerRating || 5), 0) / Math.max(1, users.length)).toFixed(1)} / 5
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">تقييم الإدارة الشهري</div>
            </div>
          </div>

          {/* Search & Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم، الدور، التخصص، أو البريد..."
                  className="w-full min-h-[40px] ps-9 pe-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-xs"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleKey | 'all')}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-xs"
              >
                <option value="all">كل الأدوار ({ROLE_CATALOG.length})</option>
                {ROLE_CATALOG.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.labelAr}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StaffStatusState | 'all')}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-xs"
              >
                <option value="all">كل الحالات</option>
                <option value="متصل">متصل</option>
                <option value="مشغول">مشغول</option>
                <option value="غير متصل">غير متصل</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSkeletonPreview(true);
                setTimeout(() => setShowSkeletonPreview(false), 320);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث الحالة المباشرة</span>
            </button>
          </div>

          {/* Employee Cards Grid (or Skeleton Shimmer) */}
          {showSkeletonPreview ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl aqar-skeleton" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 rounded aqar-skeleton" />
                      <div className="h-3 w-24 rounded aqar-skeleton" />
                    </div>
                  </div>
                  <div className="h-10 rounded-xl aqar-skeleton" />
                  <div className="h-4 w-40 rounded aqar-skeleton" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredUsers.map((user) => {
                const status = getUserStatus(user);
                const metrics = userTaskMetrics.get(user.id) || {
                  activeCount: 0,
                  completedCount: 0,
                  overdueCount: 0,
                  avgHours: 0,
                };
                const scopeLabel =
                  user.allowedPropertyIds && user.allowedPropertyIds.length > 0
                    ? `نطاق مقيد: ${user.allowedPropertyIds.length} عقارات`
                    : 'كل عقارات الشركة';
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedUserId(user.id);
                      setDetailTab('performance');
                    }}
                    className={`text-start p-5 rounded-2xl border glass-surface glass-card-interactive space-y-4 cursor-pointer ${
                      user.active
                        ? 'border-slate-200 dark:border-white/10 hover:border-[#26478D]/50'
                        : 'border-red-300/60 dark:border-red-500/30 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#26478D] to-[#1A346B] text-white flex items-center justify-center font-bold text-base shrink-0">
                          {user.nameAr.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">{user.nameAr}</div>
                          <div className="text-xs text-[#26478D] dark:text-blue-400 font-semibold truncate">
                            {user.roleLabelAr}
                            {user.specialty ? ` · ${user.specialty}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold shrink-0 ${statusTextColor(status)}`}>
                        {!user.active ? 'موقوف' : status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/5 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-500">مهام نشطة</div>
                        <div className="font-mono-num font-bold mt-0.5">{metrics.activeCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">منجزة</div>
                        <div className="font-mono-num font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {metrics.completedCount}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">التقييم</div>
                        <div className="font-mono-num font-bold text-amber-500 mt-0.5">
                          {(user.managerRating || 5).toFixed(1)} ★
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{scopeLabel}</span>
                        <span className="font-mono-num shrink-0">{user.phone}</span>
                      </div>
                      <div className="truncate text-slate-600 dark:text-slate-300">
                        آخر نشاط: {user.lastActivitySummary || 'متاح بالنظام'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SMART TASKS (KANBAN + CALENDAR + WAITING QUEUE) */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {queuedTasks.length > 0 && (
            <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="font-bold text-amber-700 dark:text-amber-300">
                    تنبيه قائمة الانتظار: توجد {queuedTasks.length} مهمة بانتظار توفر موظف
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    يمكنك النقر على المهمة لتحويلها يدوياً لأي موظف متاح فوراً.
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {queuedTasks.map((qt) => (
                  <button
                    key={qt.id}
                    type="button"
                    onClick={() => setSelectedTaskId(qt.id)}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer"
                  >
                    {qt.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={taskTypeFilter}
                onChange={(e) => setTaskTypeFilter(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-xs"
              >
                <option value="all">كل أنواع المهام</option>
                <option value="صيانة">صيانة</option>
                <option value="تأجير">تأجير</option>
                <option value="مالية">مالية</option>
                <option value="إدارية">إدارية</option>
                <option value="تسليم/استلام">تسليم/استلام</option>
              </select>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setTaskViewMode('kanban')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    taskViewMode === 'kanban'
                      ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span>لوحة Kanban</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskViewMode('calendar')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    taskViewMode === 'calendar'
                      ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>التقويم الزمني</span>
                </button>
              </div>
            </div>

            {canManageTasks && (
              <button
                type="button"
                onClick={() => setShowCreateTaskModal(true)}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#26478D] hover:bg-[#1e3a75] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إنشاء مهمة ذكية جديدة</span>
              </button>
            )}
          </div>

          {taskViewMode === 'kanban' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {kanbanColumns.map((col) => {
                const colTasks = filteredTasks.filter((t) => col.statuses.includes(t.status));
                return (
                  <div
                    key={col.id}
                    className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface p-3.5 space-y-3 min-h-[260px]"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/70 dark:border-white/10">
                      <span className="text-xs font-bold">{col.titleAr}</span>
                      <span className="text-xs font-mono-num font-bold text-[#26478D] dark:text-blue-400">
                        {colTasks.length}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {colTasks.length === 0 ? (
                        <div className="text-[11px] text-slate-400 text-center py-8">لا توجد مهام</div>
                      ) : (
                        colTasks.map((t) => {
                          const assignee = users.find((u) => u.id === t.assignedTo);
                          const prop = properties.find((p) => p.id === t.propertyId);
                          const doneSteps = t.checklist.filter((c) => c.done).length;
                          return (
                            <div
                              key={t.id}
                              onClick={() => setSelectedTaskId(t.id)}
                              className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] hover:border-[#26478D]/50 space-y-2 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-semibold text-[#26478D] dark:text-blue-400">{t.type}</span>
                                <span
                                  className={`font-bold ${
                                    t.priority === 'عاجل'
                                      ? 'text-red-500'
                                      : t.priority === 'مرتفع'
                                      ? 'text-amber-500'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {t.priority}
                                </span>
                              </div>

                              <div className="text-xs font-bold leading-snug">{t.title}</div>

                              {t.isQueued && (
                                <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                  في قائمة الانتظار · بحاجة لإسناد
                                </div>
                              )}

                              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                                <div>المسؤول: {assignee?.nameAr || 'غير مسند'}</div>
                                {prop && <div>العقار: {prop.nameAr}</div>}
                                <div className="flex items-center justify-between font-mono-num pt-1">
                                  <span>{t.dueDate}</span>
                                  <span>
                                    {doneSteps}/{t.checklist.length} خطوات
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {calendarGroups.map(([dateKey, dayTasks]) => (
                <div
                  key={dateKey}
                  className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-hidden"
                >
                  <div className="px-5 py-3 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10 flex items-center justify-between text-xs">
                    <span className="font-bold font-mono-num flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                      <span>تاريخ الاستحقاق: {dateKey}</span>
                    </span>
                    <span className="font-mono-num text-slate-500">{dayTasks.length} مهمة</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {dayTasks.map((t) => {
                      const assignee = users.find((u) => u.id === t.assignedTo);
                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTaskId(t.id)}
                          className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer"
                        >
                          <div>
                            <div className="font-bold">{t.title}</div>
                            <div className="text-[11px] text-slate-500">
                              {t.type} · المسؤول: {assignee?.nameAr || 'غير مسند'} · الأولوية: {t.priority}
                            </div>
                          </div>
                          <span className="font-semibold text-[#26478D] dark:text-blue-400">{t.status}</span>
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

      {/* TAB 3: PERFORMANCE DASHBOARD */}
      {activeTab === 'performance' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">الحضور والنشاط المباشر</div>
              <div className="text-2xl font-bold font-mono-num mt-1 text-emerald-600 dark:text-emerald-400">
                {liveOnlineUserIds.size} / {users.filter((u) => u.active).length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">جلسات متصلة حالياً</div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">المهام المنجزة</div>
              <div className="text-2xl font-bold font-mono-num mt-1">{performanceStats.completedCount}</div>
              <div className="text-[11px] text-slate-500 mt-1">مهمة مكتملة ومعتمدة</div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">متوسط وقت الإنجاز</div>
              <div className="text-2xl font-bold font-mono-num mt-1">{performanceStats.avgHrs} ساعة</div>
              <div className="text-[11px] text-slate-500 mt-1">من الإسناد حتى الإغلاق</div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface">
              <div className="text-xs text-slate-500">المهام المتأخرة عن الموعد</div>
              <div className="text-2xl font-bold font-mono-num mt-1 text-red-500">
                {performanceStats.overdueList.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">تتطلب متابعة فورية</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold">إنتاجية الموظفين (المهام المكتملة مقابل النشطة)</h3>
              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceStats.byStaffChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="مكتملة" fill="#10B981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="نشطة" fill="#26478D" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <h3 className="text-sm font-bold">توزيع المهام حسب النوع</h3>
              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={performanceStats.byTypePie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={3}
                    >
                      {performanceStats.byTypePie.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Ratings + Top Properties + Overdue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-bold">تقييم أداء الموظفين الشهري (1 إلى 5 نجوم)</h3>
              </div>
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-2.5 px-4 text-start">الموظف</th>
                    <th className="py-2.5 px-4 text-center">مكتملة</th>
                    <th className="py-2.5 px-4 text-center">متأخرة</th>
                    <th className="py-2.5 px-4 text-start">تقييم المدير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {users
                    .filter((u) => u.role !== 'owner')
                    .map((u) => {
                      const m = userTaskMetrics.get(u.id);
                      const rating = u.managerRating || 5;
                      return (
                        <tr key={u.id}>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold">{u.nameAr}</div>
                            <div className="text-[11px] text-slate-500">{u.roleLabelAr}</div>
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                            {m?.completedCount || 0}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono-num font-bold text-red-500">
                            {m?.overdueCount || 0}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  disabled={!canManageTeam}
                                  onClick={() =>
                                    handleUpdateUserPatch(
                                      u.id,
                                      { managerRating: star },
                                      `تم تحديث تقييم ${u.nameAr} إلى ${star} نجوم`
                                    )
                                  }
                                  className="cursor-pointer disabled:cursor-default"
                                >
                                  <Star
                                    className={`w-4 h-4 ${
                                      star <= rating
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <h3 className="text-sm font-bold">أكثر العقارات استهلاكاً للمهام</h3>
                {performanceStats.topProperties.length === 0 ? (
                  <div className="text-xs text-slate-500">لا توجد مهام مرتبطة بعقارات بعد.</div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {performanceStats.topProperties.map(({ property, count }) => (
                      <div key={property?.id || count} className="flex items-center justify-between">
                        <span className="font-medium">{property?.nameAr || 'عقار'}</span>
                        <span className="font-mono-num font-bold text-[#26478D] dark:text-blue-400">
                          {count} مهام
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <h3 className="text-sm font-bold text-red-500">قائمة المهام المتأخرة</h3>
                {performanceStats.overdueList.length === 0 ? (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400">
                    لا توجد مهام متأخرة عن مواعيدها حالياً.
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {performanceStats.overdueList.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setActiveTab('tasks');
                          setSelectedTaskId(t.id);
                        }}
                        className="p-2.5 rounded-xl border border-red-300/50 dark:border-red-500/20 flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-semibold truncate">{t.title}</span>
                        <span className="font-mono-num text-red-500 shrink-0">{t.dueDate}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: 9 ROLES + GRANULAR RBAC MATRIX */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3.5">
            {ROLE_CATALOG.map((r) => {
              const count = users.filter((u) => u.role === r.key).length;
              return (
                <div
                  key={r.key}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm">{r.labelAr}</span>
                    <span className="font-mono-num font-bold text-[#26478D] dark:text-blue-400">{count}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{r.tierAr}</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{r.descAr}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                <h3 className="text-sm font-bold">مصفوفة صلاحيات الأدوار المعتمدة (تحديث فوري على الخادم)</h3>
              </div>
              <span className="text-[11px] text-slate-500">
                يمكن تخصيص صلاحيات كل موظف بـ 5 مستويات أو عقارات محددة من بطاقة الموظف.
              </span>
            </div>
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-4 text-start font-medium whitespace-nowrap">الصلاحية</th>
                  {ROLE_CATALOG.map((r) => (
                    <th key={r.key} className="py-2.5 px-2.5 text-center font-medium whitespace-nowrap">
                      {r.labelAr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {PERMISSION_KEYS_LIST.map((p) => (
                  <tr key={p.key} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="py-2.5 px-4 font-medium whitespace-nowrap">{p.labelAr}</td>
                    {ROLE_CATALOG.map((r) => {
                      const checked = (state.rolePermissions[r.key] || []).includes(p.key);
                      return (
                        <td key={r.key} className="py-2.5 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canManageTeam}
                            onChange={() => handleToggleRolePermission(r.key, p.key)}
                            className="w-4 h-4 accent-[#26478D] cursor-pointer disabled:opacity-50"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: COMPREHENSIVE IMMUTABLE AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-emerald-700 dark:text-emerald-300">
                  سجل تاريخي دائم غير قابل للتعديل أو الحذف (Immutable Audit Log)
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  يوثق كل عملية بالثانية، هوية الموظف، الجهاز، عنوان IP، الموقع الجغرافي، والقيمة قبل وبعد التغيير.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 no-print">
              <button
                type="button"
                onClick={handleExportAuditExcel}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportAuditPdf}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#26478D] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>تصدير PDF رسمي</span>
              </button>
            </div>
          </div>

          {/* Audit Filters */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="relative lg:col-span-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="بحث في السجل أو القيم أو IP..."
                className="w-full min-h-[38px] ps-9 pe-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
              />
            </div>
            <select
              value={auditUserFilter}
              onChange={(e) => setAuditUserFilter(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
            >
              <option value="all">كل الموظفين</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameAr}
                </option>
              ))}
            </select>
            <select
              value={auditPropertyFilter}
              onChange={(e) => setAuditPropertyFilter(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
            >
              <option value="all">كل العقارات</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={auditDateFrom}
              onChange={(e) => setAuditDateFrom(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAuditViewMode(auditViewMode === 'table' ? 'timeline' : 'table')}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 font-semibold cursor-pointer"
              >
                {auditViewMode === 'table' ? 'عرض خط زمني' : 'عرض جدول'}
              </button>
            </div>
          </div>

          {auditViewMode === 'table' ? (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-3 px-4 text-start">الوقت بالثانية</th>
                    <th className="py-3 px-4 text-start">الموظف والدور</th>
                    <th className="py-3 px-4 text-start">الجهاز / IP / الموقع</th>
                    <th className="py-3 px-4 text-start">العملية</th>
                    <th className="py-3 px-4 text-start">التفاصيل والقيم قبل وبعد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredAuditLogs.slice(0, 80).map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 px-4 font-mono-num text-slate-500 whitespace-nowrap">
                        {formatDateTime(log.createdAt, lang)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold">{log.userName}</div>
                        <div className="text-[11px] text-slate-500">{log.userRole}</div>
                      </td>
                      <td className="py-3 px-4 text-[11px]">
                        <div>{log.deviceName}</div>
                        <div className="font-mono-num text-slate-500">
                          {log.ipAddress || '192.168.10.24'} · {log.geoLocation || 'الرياض، السعودية'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#26478D] dark:text-blue-400">{log.action}</td>
                      <td className="py-3 px-4">
                        <div>{log.summary}</div>
                        {(log.oldValue || log.newValue || log.reason) && (
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono-num">
                            {log.oldValue ? `قبل: ${log.oldValue} ` : ''}
                            {log.newValue ? `← بعد: ${log.newValue} ` : ''}
                            {log.reason ? `· السبب: ${log.reason}` : ''}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface p-5 space-y-4">
              {filteredAuditLogs.slice(0, 60).map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/5 last:border-0 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#26478D] dark:text-blue-400">{log.action}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold">{log.userName}</span>
                      <span className="text-slate-500">({log.userRole})</span>
                    </div>
                    <p>{log.summary}</p>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                      <span>{log.deviceName}</span>
                      <span>·</span>
                      <span className="font-mono-num">{log.ipAddress || '192.168.10.24'}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {log.geoLocation || 'الرياض، السعودية'}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono-num text-[11px] text-slate-500">{formatDateTime(log.createdAt, lang)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: SECURITY POLICY, MULTI-DEVICE SESSIONS, CONFLICTS & LOGIN HISTORY */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Security Policy */}
            <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <h3 className="text-sm font-bold">سياسة الأمان وكلمات المرور للشركة</h3>
                </div>
                {canManageTeam && (
                  <button
                    type="button"
                    onClick={handleSaveSecurityPolicy}
                    className="px-3.5 py-1.5 rounded-xl bg-[#26478D] text-white text-xs font-semibold cursor-pointer"
                  >
                    حفظ السياسة
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-500">الحد الأدنى لطول كلمة المرور</label>
                  <input
                    type="number"
                    min={6}
                    max={20}
                    value={effectivePolicy.minPasswordLength}
                    onChange={(e) =>
                      setPolicyDraft({ ...effectivePolicy, minPasswordLength: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">تجديد كلمة المرور كل (أيام)</label>
                  <input
                    type="number"
                    min={30}
                    max={365}
                    value={effectivePolicy.passwordExpiryDays}
                    onChange={(e) =>
                      setPolicyDraft({ ...effectivePolicy, passwordExpiryDays: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">قفل الشاشة التلقائي (دقائق)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={effectivePolicy.autoLockMinutes}
                    onChange={(e) =>
                      setPolicyDraft({ ...effectivePolicy, autoLockMinutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">حظر بعد محاولات فاشلة</label>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    value={effectivePolicy.maxFailedAttempts}
                    onChange={(e) =>
                      setPolicyDraft({ ...effectivePolicy, maxFailedAttempts: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs pt-1">
                <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer">
                  <span>إلزام وجود حروف وأرقام ورموز خاصة بكلمة المرور</span>
                  <input
                    type="checkbox"
                    checked={effectivePolicy.requireSpecialChars}
                    onChange={(e) =>
                      setPolicyDraft({ ...effectivePolicy, requireSpecialChars: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#26478D]"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer">
                  <span>إلزام المصادقة الثنائية (2FA) للمدراء والمحاسبين</span>
                  <input
                    type="checkbox"
                    checked={effectivePolicy.require2faForManagersAndAccountants}
                    onChange={(e) =>
                      setPolicyDraft({
                        ...effectivePolicy,
                        require2faForManagersAndAccountants: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#26478D]"
                  />
                </label>
              </div>
            </div>

            {/* Active Multi-Device WebSocket Sessions + Remote Logout */}
            <div className="lg:col-span-6 p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-bold">الأجهزة والجلسات المتصلة حالياً ({presence.length})</h3>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {presence.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">لا توجد جلسات WebSocket مفتوحة حالياً.</div>
                ) : (
                  presence.map((ses, i) => (
                    <div key={ses.sessionId || `${ses.userId}-${i}`} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold">
                          {ses.nameAr} <span className="text-slate-500 font-normal">({ses.roleLabelAr})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {ses.deviceName} · {ses.ipAddress || '127.0.0.1'} · {formatDateTime(ses.connectedAt, lang)}
                        </div>
                      </div>
                      {canManageTeam && (
                        <button
                          type="button"
                          onClick={() => handleTerminateRemoteSession(ses.userId, ses.sessionId)}
                          className="shrink-0 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>إنهاء عن بُعد</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sync Conflict Resolution */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-4">
            <div className="flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold">معالجة تعارضات المزامنة المتزامنة ({(state.syncConflicts || []).length})</h3>
            </div>
            {(state.syncConflicts || []).length === 0 ? (
              <div className="text-xs text-slate-500">لا توجد تعارضات مزامنة مسجلة.</div>
            ) : (
              <div className="space-y-3">
                {(state.syncConflicts || []).map((cnf) => (
                  <div
                    key={cnf.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-bold">{cnf.entityLabel}</div>
                      <div className="text-slate-600 dark:text-slate-300">
                        {cnf.firstActorName}: <span className="font-mono-num">{cnf.firstChangeSummary}</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300">
                        {cnf.secondActorName}: <span className="font-mono-num">{cnf.secondChangeSummary}</span>
                      </div>
                      <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        الحالة: {cnf.status} {cnf.resolvedBy ? `· بواسطة ${cnf.resolvedBy}` : ''}
                      </div>
                    </div>
                    {cnf.status === 'بانتظار مراجعة المدير' && canManageTeam && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleResolveConflict(cnf.id, 'تم اعتماد التعديل الأحدث')}
                          className="px-3 py-1.5 rounded-lg bg-[#26478D] text-white font-semibold cursor-pointer"
                        >
                          اعتماد التعديل الأحدث
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveConflict(cnf.id, 'تم الإبقاء على النسخة السابقة')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 font-semibold cursor-pointer"
                        >
                          الإبقاء على النسخة السابقة
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Login History Table */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 glass-surface overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
              <h3 className="text-sm font-bold">سجل عمليات الدخول والجلسات ({(state.loginHistory || []).length})</h3>
            </div>
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-4 text-start">الوقت</th>
                  <th className="py-2.5 px-4 text-start">الموظف</th>
                  <th className="py-2.5 px-4 text-start">الجهاز و IP</th>
                  <th className="py-2.5 px-4 text-start">الطريقة</th>
                  <th className="py-2.5 px-4 text-start">النتيجة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {(state.loginHistory || []).slice(0, 30).map((lg) => (
                  <tr key={lg.id}>
                    <td className="py-2.5 px-4 font-mono-num text-slate-500">{formatDateTime(lg.createdAt, lang)}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold">{lg.userName}</div>
                      <div className="text-[11px] text-slate-500">{lg.userRole}</div>
                    </td>
                    <td className="py-2.5 px-4 text-[11px] font-mono-num">
                      {lg.deviceName} · {lg.ipAddress}
                    </td>
                    <td className="py-2.5 px-4">{lg.method}</td>
                    <td className="py-2.5 px-4">
                      <span className={lg.success ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-red-500 font-bold'}>
                        {lg.success ? 'ناجح' : 'محاولة مرفوضة'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HERO TRANSITION: 5-TAB EMPLOYEE DETAIL DRAWER */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-white dark:bg-[#13192B] h-full overflow-y-auto border-s border-slate-200 dark:border-white/10 shadow-2xl animate-aqar-hero flex flex-col">
            {/* Employee Header */}
            <div className="p-6 bg-gradient-to-br from-[#26478D] via-[#1B356D] to-[#0A0E1A] text-white space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-xl font-bold shrink-0">
                    {selectedUser.nameAr.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-blue-100 font-semibold">
                      {selectedUser.roleLabelAr} · {getUserStatus(selectedUser)}
                    </div>
                    <h3 className="text-xl font-bold truncate mt-0.5">{selectedUser.nameAr}</h3>
                    <div className="text-xs text-blue-100/80 font-mono-num">
                      {selectedUser.email} · {selectedUser.phone}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(null)}
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 5 Detail Tabs */}
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'performance', label: 'الأداء', icon: BarChart3 },
                  { id: 'tasks', label: 'المهام الحالية', icon: CheckSquare },
                  { id: 'activity', label: 'سجل النشاط', icon: Activity },
                  { id: 'permissions', label: 'الصلاحيات والعقارات', icon: Shield },
                  { id: 'settings', label: 'الإعدادات والأجهزة', icon: Settings },
                ] as { id: MemberDetailTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTab(t.id)}
                    className={`shrink-0 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      detailTab === t.id
                        ? 'bg-[#26478D] text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-6 space-y-5 flex-1 text-xs">
              {detailTab === 'performance' && (() => {
                const m = userTaskMetrics.get(selectedUser.id) || {
                  activeCount: 0,
                  completedCount: 0,
                  overdueCount: 0,
                  avgHours: 0,
                };
                const rating = selectedUser.managerRating || 5;
                return (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10">
                        <div className="text-slate-500">المهام النشطة</div>
                        <div className="text-xl font-bold font-mono-num mt-1">{m.activeCount}</div>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10">
                        <div className="text-slate-500">المهام المنجزة</div>
                        <div className="text-xl font-bold font-mono-num text-emerald-600 dark:text-emerald-400 mt-1">
                          {m.completedCount}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10">
                        <div className="text-slate-500">متوسط الإنجاز</div>
                        <div className="text-xl font-bold font-mono-num mt-1">{m.avgHours} س</div>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10">
                        <div className="text-slate-500">تأخير</div>
                        <div className="text-xl font-bold font-mono-num text-red-500 mt-1">{m.overdueCount}</div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-bold">تقييم المدير المباشر للأداء</div>
                        <div className="text-[11px] text-slate-500">تحديث فوري في تقارير الأداء الشهرية</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            disabled={!canManageTeam}
                            onClick={() =>
                              handleUpdateUserPatch(
                                selectedUser.id,
                                { managerRating: star },
                                `تم تقييم ${selectedUser.nameAr} بـ ${star} نجوم`
                              )
                            }
                            className="cursor-pointer disabled:cursor-default"
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {detailTab === 'tasks' && (
                <div className="space-y-3">
                  {tasks.filter((t) => t.assignedTo === selectedUser.id && !t.archivedAt).length === 0 ? (
                    <div className="text-center text-slate-500 py-8">لا توجد مهام مسندة لهذا الموظف حالياً.</div>
                  ) : (
                    tasks
                      .filter((t) => t.assignedTo === selectedUser.id && !t.archivedAt)
                      .map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedUserId(null);
                            setActiveTab('tasks');
                            setSelectedTaskId(t.id);
                          }}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 hover:border-[#26478D]/40 cursor-pointer"
                        >
                          <div>
                            <div className="font-bold">{t.title}</div>
                            <div className="text-[11px] text-slate-500 font-mono-num">
                              {t.type} · استحقاق {t.dueDate}
                            </div>
                          </div>
                          <span className="font-semibold text-[#26478D] dark:text-blue-400">{t.status}</span>
                        </div>
                      ))
                  )}
                </div>
              )}

              {detailTab === 'activity' && (
                <div className="divide-y divide-slate-100 dark:divide-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
                  {auditLogs
                    .filter((l) => l.userId === selectedUser.id)
                    .slice(0, 25)
                    .map((l) => (
                      <div key={l.id} className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#26478D] dark:text-blue-400">{l.action}</span>
                          <span className="font-mono-num text-[11px] text-slate-500">
                            {formatDateTime(l.createdAt, lang)}
                          </span>
                        </div>
                        <div>{l.summary}</div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {l.deviceName} · {l.ipAddress || '192.168.10.24'}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {detailTab === 'permissions' && (() => {
                const modPerms = selectedUser.customModulePermissions || buildDefaultModulePerms(selectedUser.role);
                return (
                  <div className="space-y-5">
                    {/* Property-Level Scope */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-bold flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                          <span>صلاحيات على مستوى العقار (Property-Level Scope)</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {selectedUser.allowedPropertyIds?.length
                            ? `مقيد بـ ${selectedUser.allowedPropertyIds.length} عقار`
                            : 'كافة عقارات الشركة'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {properties.map((p) => {
                          const checked = (selectedUser.allowedPropertyIds || []).includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canManageTeam}
                                onChange={() => handleToggleUserPropertyScope(selectedUser, p.id)}
                                className="w-4 h-4 accent-[#26478D]"
                              />
                              <span className="truncate">{p.nameAr}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        إذا لم يتم تحديد أي عقار، يرى الموظف جميع عقارات الشركة حسب دوره.
                      </p>
                    </div>

                    {/* 5-Level Granular Matrix */}
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-x-auto">
                      <table className="w-full text-start text-xs">
                        <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10">
                          <tr>
                            <th className="py-2.5 px-3 text-start">القسم / الوحدة</th>
                            {LEVEL_META.map((lv) => (
                              <th key={lv.key} className="py-2.5 px-2 text-center">
                                {lv.labelAr}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                          {MODULE_META.map((mod) => {
                            const activeLevels = modPerms[mod.key] || [];
                            return (
                              <tr key={mod.key}>
                                <td className="py-2 px-3 font-medium">{mod.labelAr}</td>
                                {LEVEL_META.map((lv) => (
                                  <td key={lv.key} className="py-2 px-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={activeLevels.includes(lv.key)}
                                      disabled={!canManageTeam}
                                      onChange={() => handleToggleUserModuleLevel(selectedUser, mod.key, lv.key)}
                                      className="w-4 h-4 accent-[#26478D] cursor-pointer"
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {detailTab === 'settings' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                    <div className="font-bold">الأمان والتحقق للحساب</div>
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span>تفعيل المصادقة الثنائية (2FA)</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedUser.security?.twoFactorEnabled)}
                        disabled={!canManageTeam && currentUser.id !== selectedUser.id}
                        onChange={(e) =>
                          handleUpdateUserPatch(
                            selectedUser.id,
                            { security: { twoFactorEnabled: e.target.checked } },
                            'تم تحديث إعداد المصادقة الثنائية'
                          )
                        }
                        className="w-4 h-4 accent-[#26478D]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span>تفعيل الدخول بالبصمة / Face ID</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedUser.security?.biometricEnabled)}
                        disabled={!canManageTeam && currentUser.id !== selectedUser.id}
                        onChange={(e) =>
                          handleUpdateUserPatch(
                            selectedUser.id,
                            { security: { biometricEnabled: e.target.checked } },
                            'تم تحديث إعداد البصمة'
                          )
                        }
                        className="w-4 h-4 accent-[#26478D]"
                      />
                    </label>
                    {canManageTeam && selectedUser.id !== currentUser.id && (
                      <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-white/10">
                        <span>حالة تفعيل الحساب في الشركة</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateUserPatch(
                              selectedUser.id,
                              { active: !selectedUser.active },
                              selectedUser.active ? 'تم إيقاف حساب الموظف' : 'تم إعادة تفعيل حساب الموظف'
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                            selectedUser.active
                              ? 'border border-red-300 text-red-600 dark:text-red-400'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {selectedUser.active ? 'تعطيل الحساب مؤقتاً' : 'تفعيل الحساب'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Notification Preferences & DND */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                    <div className="font-bold">تفضيلات الإشعارات وساعات عدم الإزعاج (DND)</div>
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span>تفعيل ساعات عدم الإزعاج (تأجيل الإشعارات غير العاجلة)</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedUser.notificationPrefs?.dndEnabled)}
                        onChange={(e) =>
                          handleUpdateUserPatch(
                            selectedUser.id,
                            { notificationPrefs: { dndEnabled: e.target.checked } },
                            'تم تحديث وضع عدم الإزعاج'
                          )
                        }
                        className="w-4 h-4 accent-[#26478D]"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-slate-500">من الساعة</label>
                        <input
                          type="time"
                          value={selectedUser.notificationPrefs?.dndFrom || '22:00'}
                          onChange={(e) =>
                            handleUpdateUserPatch(selectedUser.id, {
                              notificationPrefs: { dndFrom: e.target.value },
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500">إلى الساعة</label>
                        <input
                          type="time"
                          value={selectedUser.notificationPrefs?.dndTo || '07:00'}
                          onChange={(e) =>
                            handleUpdateUserPatch(selectedUser.id, {
                              notificationPrefs: { dndTo: e.target.value },
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Active Devices & Remote Logout */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                        <span>الأجهزة المسجلة والجلسات النشطة</span>
                      </div>
                      {canManageTeam && (
                        <button
                          type="button"
                          onClick={() => handleTerminateRemoteSession(selectedUser.id)}
                          className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 font-semibold cursor-pointer"
                        >
                          تسجيل خروج جميع الأجهزة عن بُعد
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono-num">
                      الجهاز الافتراضي: {selectedUser.deviceName} · آخر نشاط:{' '}
                      {formatDateTime(selectedUser.lastActiveAt, lang)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TASK DETAIL MODAL (CHECKLIST, COMMENTS, QUICK REASSIGN, APPROVE/REJECT) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4 my-auto animate-aqar-fade-scale text-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-[#26478D] dark:text-blue-400">
                  {selectedTask.type} · {selectedTask.priority} · استحقاق {selectedTask.dueDate}
                </div>
                <h3 className="text-base font-bold mt-0.5">{selectedTask.title}</h3>
                {selectedTask.smartAssignedReason && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{selectedTask.smartAssignedReason}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskId(null)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{selectedTask.description}</p>

            {/* Status progression */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['مسندة', 'قيد التنفيذ', 'بانتظار المراجعة', 'مكتملة'] as TaskStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleTaskStatus(selectedTask.id, st)}
                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                    selectedTask.status === st
                      ? 'bg-[#26478D] text-white border-[#26478D]'
                      : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Supervisor Review (Approve / Reject) */}
            {(canManageTasks || canManageTeam) && selectedTask.status !== 'مكتملة' && (
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] space-y-2.5">
                <div className="font-bold">اعتماد المشرف / المدير عند التسليم</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={reviewRejectReason}
                    onChange={(e) => setReviewRejectReason(e.target.value)}
                    placeholder="ملاحظة أو سبب الإرجاع (مطلوب عند الرفض)..."
                    className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => handleReviewTask(selectedTask.id, 'approve')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>اعتماد وإغلاق</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewTask(selectedTask.id, 'reject')}
                    className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 dark:text-red-400 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>إرجاع للتعديل</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Reassign */}
            {canManageTasks && (
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 space-y-2">
                <div className="font-bold">تحويل المهمة السريع لموظف آخر</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={reassignTargetId}
                    onChange={(e) => setReassignTargetId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
                  >
                    <option value="">اختر الموظف البديل...</option>
                    {users
                      .filter((u) => u.active && u.role !== 'owner')
                      .map((u) => {
                        const load = userTaskMetrics.get(u.id)?.activeCount || 0;
                        return (
                          <option key={u.id} value={u.id}>
                            {u.nameAr} ({load} مهام)
                          </option>
                        );
                      })}
                  </select>
                  <input
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    placeholder="سبب التحويل..."
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                  <button
                    type="button"
                    disabled={!reassignTargetId}
                    onClick={() => handleReassignTask(selectedTask.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#26478D] text-white font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    تحويل المهمة
                  </button>
                </div>
              </div>
            )}

            {/* Checklist */}
            <div className="space-y-2">
              <div className="font-bold">قائمة الخطوات ({selectedTask.checklist.length})</div>
              {selectedTask.checklist.map((step, i) => (
                <label
                  key={i}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={() => handleTaskChecklistToggle(selectedTask, i)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className={step.done ? 'line-through text-slate-400' : ''}>{step.text}</span>
                </label>
              ))}
            </div>

            {/* Comments */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="font-bold">التعليقات والمتابعة ({selectedTask.comments.length})</div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {selectedTask.comments.map((c) => (
                  <div key={c.id} className="p-2 rounded-lg bg-slate-50 dark:bg-white/[0.03]">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{c.authorName}</span>
                      <span className="font-mono-num">{formatDateTime(c.createdAt, lang)}</span>
                    </div>
                    <div className="mt-0.5">{c.text}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="أضف تعليقاً أو توثيقاً..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => handleTaskComment(selectedTask)}
                  className="px-3 py-1.5 rounded-lg bg-[#26478D] text-white font-semibold cursor-pointer"
                >
                  إرسال
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5-STEP ADD EMPLOYEE WIZARD MODAL */}
      {showAddWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-5 my-auto animate-aqar-fade-scale text-xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold">معالج إضافة موظف جديد (خطوة {wizardStep} من 5)</h3>
                <p className="text-[11px] text-slate-500">
                  تحديد البيانات الأساسية، الدور الوظيفي، مصفوفة الصلاحيات والعقارات، وإعدادات الأمان
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddWizard(false)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper Progress */}
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((st) => (
                <div
                  key={st}
                  className={`h-1.5 rounded-full transition-colors ${
                    st <= wizardStep ? 'bg-[#26478D]' : 'bg-slate-200 dark:bg-white/10'
                  }`}
                />
              ))}
            </div>

            {wizardStep === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold">الاسم الكامل (عربي) *</label>
                  <input
                    required
                    value={wizardForm.nameAr}
                    onChange={(e) => setWizardForm({ ...wizardForm, nameAr: e.target.value })}
                    placeholder="مثال: عبدالعزيز محمد السبيعي"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold">الاسم بالإنجليزية</label>
                  <input
                    value={wizardForm.nameEn}
                    onChange={(e) => setWizardForm({ ...wizardForm, nameEn: e.target.value })}
                    placeholder="Abdulaziz Al-Subaie"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold">رقم الجوال *</label>
                  <input
                    required
                    value={wizardForm.phone}
                    onChange={(e) => setWizardForm({ ...wizardForm, phone: e.target.value })}
                    placeholder="0551234567"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={wizardForm.email}
                    onChange={(e) => setWizardForm({ ...wizardForm, email: e.target.value })}
                    placeholder="staff@aqarplus.sa"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-semibold">التخصص الدقيق (للتوزيع الذكي للمهام)</label>
                  <input
                    value={wizardForm.specialty}
                    onChange={(e) => setWizardForm({ ...wizardForm, specialty: e.target.value })}
                    placeholder="مثال: تأجير وتوثيق إيجار / صيانة كهرباء وتكييف / تحصيل مالي"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"
                  />
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pe-1">
                  {ROLE_CATALOG.filter((r) => r.key !== 'owner').map((r) => {
                    const selected = wizardForm.role === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => handleWizardRoleChange(r.key)}
                        className={`p-3 rounded-xl border text-start space-y-1 cursor-pointer transition-colors ${
                          selected
                            ? 'border-[#26478D] bg-[#26478D]/10 dark:bg-blue-500/15'
                            : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{r.labelAr}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {r.tierAr}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{r.descAr}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1">
                  <label className="font-semibold">حد الاعتماد المالي المسموح للموظف (ر.س)</label>
                  <input
                    type="number"
                    value={wizardForm.approvalLimitSar}
                    onChange={(e) => setWizardForm({ ...wizardForm, approvalLimitSar: Number(e.target.value) })}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="font-bold">تقييد الوصول بعقارات محددة (اختياري — اتركه فارغاً لكل العقارات)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {properties.map((p) => {
                      const checked = wizardForm.allowedPropertyIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setWizardForm((prev) => ({
                                ...prev,
                                allowedPropertyIds: checked
                                  ? prev.allowedPropertyIds.filter((id) => id !== p.id)
                                  : [...prev.allowedPropertyIds, p.id],
                              }))
                            }
                            className="w-4 h-4 accent-[#26478D]"
                          />
                          <span className="truncate">{p.nameAr}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-x-auto max-h-56">
                  <table className="w-full text-start text-[11px]">
                    <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 border-b border-slate-200 dark:border-white/10 sticky top-0">
                      <tr>
                        <th className="py-2 px-3 text-start">القسم</th>
                        {LEVEL_META.map((lv) => (
                          <th key={lv.key} className="py-2 px-2 text-center">
                            {lv.labelAr}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {MODULE_META.map((m) => {
                        const levels = wizardForm.customModulePermissions[m.key] || [];
                        return (
                          <tr key={m.key}>
                            <td className="py-1.5 px-3 font-medium">{m.labelAr}</td>
                            {LEVEL_META.map((lv) => (
                              <td key={lv.key} className="py-1.5 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={levels.includes(lv.key)}
                                  onChange={() => toggleWizardModuleLevel(m.key, lv.key)}
                                  className="w-3.5 h-3.5 accent-[#26478D]"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer">
                  <div>
                    <div className="font-bold">تفعيل المصادقة الثنائية (2FA)</div>
                    <div className="text-[11px] text-slate-500">إرسال رمز تحقق إضافي عند الدخول من جهاز جديد</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={wizardForm.twoFactorEnabled}
                    onChange={(e) => setWizardForm({ ...wizardForm, twoFactorEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[#26478D]"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer">
                  <div>
                    <div className="font-bold">السماح بتسجيل الدخول بالبصمة / Face ID</div>
                    <div className="text-[11px] text-slate-500">دخول سريع وآمن عبر الأجهزة المحمولة</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={wizardForm.biometricEnabled}
                    onChange={(e) => setWizardForm({ ...wizardForm, biometricEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[#26478D]"
                  />
                </label>
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] text-[11px] text-emerald-700 dark:text-emerald-300">
                  سيتم إنشاء كلمة مرور مؤقتة وإلزام الموظف بتحديثها عند أول دخول وفق سياسة الـ {effectivePolicy.passwordExpiryDays} يوماً.
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] space-y-2">
                <div className="font-bold text-sm text-[#26478D] dark:text-blue-400">مراجعة بيانات الحساب الجديد</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">الاسم:</span> <strong>{wizardForm.nameAr}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">الجوال:</span>{' '}
                    <strong className="font-mono-num">{wizardForm.phone}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">الدور:</span>{' '}
                    <strong>{ROLE_CATALOG.find((r) => r.key === wizardForm.role)?.labelAr}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">حد الاعتماد:</span>{' '}
                    <strong className="font-mono-num">{formatSar(wizardForm.approvalLimitSar, lang)}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">نطاق العقارات:</span>{' '}
                    <strong>
                      {wizardForm.allowedPropertyIds.length > 0
                        ? `${wizardForm.allowedPropertyIds.length} عقارات محددة`
                        : 'جميع عقارات الشركة'}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={wizardStep === 1}
                onClick={() => setWizardStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4 | 5)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              {wizardStep < 5 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === 1 && (!wizardForm.nameAr.trim() || !wizardForm.phone.trim())) {
                      pushToast('error', 'الرجاء إدخال الاسم ورقم الجوال أولاً');
                      return;
                    }
                    setWizardStep((s) => Math.min(5, s + 1) as 1 | 2 | 3 | 4 | 5);
                  }}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#26478D] text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={wizardSubmitting}
                  onClick={handleSubmitNewEmployee}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{wizardSubmitting ? 'جاري الإنشاء...' : 'تأكيد وإضافة الموظف'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Task Modal */}
      {showCreateTaskModal && (
        <CreateTaskQuickModal open={showCreateTaskModal} onClose={() => setShowCreateTaskModal(false)} />
      )}
    </div>
  );
}
