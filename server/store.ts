import fs from 'fs';
import path from 'path';
import {
  AqarDatabaseState,
  ArchiveCategoryId,
  AuditLog,
  BackupSnapshot,
  CommunicationLog,
  CommunicationTemplate,
  CompanyProfile,
  CompanySettings,
  CurrencyCode,
  DocumentAccessEntry,
  DocumentRecord,
  ExecutiveDecision,
  Expense,
  HandoverInspection,
  Installment,
  JournalEntry,
  Lead,
  LeaseContract,
  LoginAuditEntry,
  MaintenanceTicket,
  NotificationItem,
  OcrEntityMatchResult,
  OcrExtractedData,
  OcrSyncSummary,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  PaymentType,
  PermissionKey,
  PermissionLevel,
  PermissionModuleKey,
  Property,
  PurchaseOrder,
  ReminderChannel,
  ReminderDispatchLog,
  ReminderRule,
  RoleKey,
  SavedArchiveFilter,
  SecurityPolicy,
  StaffNotificationPrefs,
  StaffSecurityConfig,
  StaffStatusState,
  StaffUser,
  SyncConflictRecord,
  TaskItem,
  Tenant,
  TenantOnboardingChecklist,
  Unit,
  UnitStatus,
  Vendor,
} from '../src/types/aqar';
import { createInitialSeed, DEFAULT_ROLE_PERMISSIONS } from './seed';

const RATES_TO_SAR: Record<CurrencyCode, number> = {
  SAR: 1,
  AED: 1.021,
  USD: 3.75,
  EGP: 0.077,
  KWD: 12.22,
};

function toSar(amount: number, currency: CurrencyCode = 'SAR', rates?: Partial<Record<CurrencyCode, number>>): number {
  const rate = rates?.[currency] ?? RATES_TO_SAR[currency] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

function currencyLabelAr(currency: CurrencyCode = 'SAR'): string {
  switch (currency) {
    case 'AED':
      return 'د.إ';
    case 'USD':
      return '$';
    case 'EGP':
      return 'ج.م';
    case 'KWD':
      return 'د.ك';
    default:
      return 'ر.س';
  }
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'aqarplus-db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export class AqarStore {
  private state: AqarDatabaseState;
  private propIndex = new Map<string, Property>();
  private unitIndex = new Map<string, Unit>();
  private tenantIndex = new Map<string, Tenant>();
  private contractIndex = new Map<string, LeaseContract>();
  private idempotencyIndex = new Set<string>();

  constructor() {
    ensureDirs();
    this.state = this.loadFromDisk();
    this.rebuildIndexes();
  }

  private rebuildIndexes() {
    this.propIndex = new Map(this.state.properties.map((p) => [p.id, p]));
    this.unitIndex = new Map(this.state.units.map((u) => [u.id, u]));
    this.tenantIndex = new Map(this.state.tenants.map((t) => [t.id, t]));
    this.contractIndex = new Map(this.state.contracts.map((c) => [c.id, c]));
    this.idempotencyIndex = new Set(this.state.processedIdempotencyKeys || []);
  }

  private runTransaction<T>(fn: () => T): T {
    const snapshot = structuredClone(this.state);
    try {
      const result = fn();
      this.rebuildIndexes();
      return result;
    } catch (err) {
      this.state = snapshot;
      this.rebuildIndexes();
      throw err;
    }
  }

  private loadFromDisk(): AqarDatabaseState {
    const seed = createInitialSeed();
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as AqarDatabaseState;
        if (parsed && Array.isArray(parsed.properties) && Array.isArray(parsed.users)) {
          const mergeMissingById = <T extends { id: string }>(existing: T[] = [], seedItems: T[] = []): T[] => {
            const seen = new Set(existing.map((x) => x.id));
            return [...existing, ...seedItems.filter((item) => !seen.has(item.id))];
          };
          const shouldSeedArchive = !parsed.archiveSeeded && parsed.properties.length > 0;
          const shouldSeedTeam = !parsed.teamSeeded && parsed.users.length > 0;
          const mergedUsers: StaffUser[] = shouldSeedTeam
            ? [
                ...parsed.users.map((u) => {
                  const seedMatch = seed.users.find((su) => su.id === u.id);
                  return {
                    ...seedMatch,
                    ...u,
                    statusState: u.statusState || seedMatch?.statusState || 'متصل',
                    specialty: u.specialty || seedMatch?.specialty,
                    managerRating: u.managerRating ?? seedMatch?.managerRating ?? 4.8,
                    lastActivitySummary: u.lastActivitySummary || seedMatch?.lastActivitySummary,
                    security: u.security || seedMatch?.security,
                    notificationPrefs: u.notificationPrefs || seedMatch?.notificationPrefs,
                  };
                }),
                ...seed.users.filter((su) => !parsed.users.some((pu) => pu.id === su.id)),
              ]
            : parsed.users;
          const mergedRolePermissions: Record<RoleKey, PermissionKey[]> = {
            ...DEFAULT_ROLE_PERMISSIONS,
            ...(parsed.rolePermissions || {}),
          };
          return {
            ...seed,
            ...parsed,
            users: mergedUsers,
            rolePermissions: mergedRolePermissions,
            units: shouldSeedArchive ? mergeMissingById(parsed.units, seed.units) : parsed.units,
            tenants: shouldSeedArchive ? mergeMissingById(parsed.tenants, seed.tenants) : parsed.tenants,
            contracts: shouldSeedArchive ? mergeMissingById(parsed.contracts, seed.contracts) : parsed.contracts,
            payments: shouldSeedArchive ? mergeMissingById(parsed.payments, seed.payments) : parsed.payments,
            tickets: shouldSeedArchive ? mergeMissingById(parsed.tickets, seed.tickets) : parsed.tickets,
            tasks: shouldSeedArchive ? mergeMissingById(parsed.tasks, seed.tasks) : parsed.tasks,
            documents: shouldSeedArchive ? mergeMissingById(parsed.documents, seed.documents) : parsed.documents,
            savedArchiveFilters:
              Array.isArray(parsed.savedArchiveFilters) && parsed.savedArchiveFilters.length > 0
                ? parsed.savedArchiveFilters
                : shouldSeedArchive
                ? seed.savedArchiveFilters
                : [],
            archiveLastNightlyRun: parsed.archiveLastNightlyRun || seed.archiveLastNightlyRun,
            archiveSeeded: parsed.archiveSeeded ?? true,
            securityPolicy: parsed.securityPolicy || seed.securityPolicy,
            loginHistory: Array.isArray(parsed.loginHistory) && parsed.loginHistory.length > 0 ? parsed.loginHistory : seed.loginHistory,
            syncConflicts: Array.isArray(parsed.syncConflicts) && parsed.syncConflicts.length > 0 ? parsed.syncConflicts : seed.syncConflicts,
            teamSeeded: parsed.teamSeeded ?? true,
            settings: {
              ...seed.settings,
              ...(parsed.settings || {}),
              currencyRatesToSar: {
                ...seed.settings.currencyRatesToSar,
                ...(parsed.settings?.currencyRatesToSar || {}),
              } as Record<CurrencyCode, number>,
              bankAccounts:
                Array.isArray(parsed.settings?.bankAccounts) && parsed.settings.bankAccounts.length > 0
                  ? parsed.settings.bankAccounts
                  : seed.settings.bankAccounts,
              receiptBranding: {
                ...seed.settings.receiptBranding!,
                ...(parsed.settings?.receiptBranding || {}),
              },
              generalPrefs: {
                ...seed.settings.generalPrefs!,
                ...(parsed.settings?.generalPrefs || {}),
              },
              securityCenter: {
                ...seed.settings.securityCenter!,
                ...(parsed.settings?.securityCenter || {}),
              },
              notificationsCenter: {
                ...seed.settings.notificationsCenter!,
                ...(parsed.settings?.notificationsCenter || {}),
              },
              printShare: {
                ...seed.settings.printShare!,
                ...(parsed.settings?.printShare || {}),
              },
              backupPolicy: {
                ...seed.settings.backupPolicy!,
                ...(parsed.settings?.backupPolicy || {}),
              },
              syncCenter: {
                ...seed.settings.syncCenter!,
                ...(parsed.settings?.syncCenter || {}),
              },
              developerCenter: {
                ...seed.settings.developerCenter!,
                ...(parsed.settings?.developerCenter || {}),
              },
            },
            companies: Array.isArray(parsed.companies) && parsed.companies.length > 0 ? parsed.companies : seed.companies,
            purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : seed.purchaseOrders,
            decisions: Array.isArray(parsed.decisions) ? parsed.decisions : seed.decisions,
            reminderRules: Array.isArray(parsed.reminderRules) ? parsed.reminderRules : seed.reminderRules,
            reminderLogs: Array.isArray(parsed.reminderLogs) ? parsed.reminderLogs : seed.reminderLogs,
            communicationTemplates:
              Array.isArray(parsed.communicationTemplates) && parsed.communicationTemplates.length > 0
                ? parsed.communicationTemplates
                : seed.communicationTemplates,
          };
        }
      }
    } catch (err) {
      console.error('Failed to load DB file, resetting to seed:', err);
    }
    this.persist(seed);
    return seed;
  }

  private persist(nextState: AqarDatabaseState = this.state) {
    ensureDirs();
    nextState.lastUpdatedAt = new Date().toISOString();
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(nextState, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
    if (nextState === this.state) {
      this.rebuildIndexes();
    }
  }

  public getState(): AqarDatabaseState {
    return this.state;
  }

  public getStateForUser(userId?: string): AqarDatabaseState {
    if (!userId) return this.state;
    const user = this.state.users.find((u) => u.id === userId);
    if (!user) return this.state;

    // Property-level isolation for staff members when allowedPropertyIds is restricted
    if (user.role !== 'owner' && user.role !== 'gm' && user.role !== 'sys_owner') {
      const allowedProps = user.allowedPropertyIds;
      if (Array.isArray(allowedProps) && allowedProps.length > 0) {
        const propSet = new Set(allowedProps);
        const unitSet = new Set(this.state.units.filter((u) => propSet.has(u.propertyId)).map((u) => u.id));
        const ctrSet = new Set(this.state.contracts.filter((c) => propSet.has(c.propertyId)).map((c) => c.id));
        return {
          ...this.state,
          properties: this.state.properties.filter((p) => propSet.has(p.id)),
          units: this.state.units.filter((u) => unitSet.has(u.id)),
          contracts: this.state.contracts.filter((c) => ctrSet.has(c.id)),
          installments: this.state.installments.filter((i) => propSet.has(i.propertyId)),
          payments: this.state.payments.filter((p) => propSet.has(p.propertyId)),
          expenses: this.state.expenses.filter((e) => propSet.has(e.propertyId)),
          tickets: this.state.tickets.filter((t) => propSet.has(t.propertyId)),
          tasks: this.state.tasks.filter((t) => !t.propertyId || propSet.has(t.propertyId) || t.assignedTo === user.id),
        };
      }
      return this.state;
    }

    if (user.role !== 'owner' || !user.ownerId) {
      return this.state;
    }
    // Owner isolation: owner can ONLY see properties they own and related records
    const ownedPropIds = new Set(
      this.state.properties
        .filter((p) => p.ownerShares.some((s) => s.ownerId === user.ownerId))
        .map((p) => p.id)
    );
    const ownedUnitIds = new Set(
      this.state.units.filter((u) => ownedPropIds.has(u.propertyId)).map((u) => u.id)
    );
    const ownedContractIds = new Set(
      this.state.contracts.filter((c) => ownedPropIds.has(c.propertyId)).map((c) => c.id)
    );

    return {
      ...this.state,
      properties: this.state.properties.filter((p) => ownedPropIds.has(p.id)),
      units: this.state.units.filter((u) => ownedUnitIds.has(u.id)),
      contracts: this.state.contracts.filter((c) => ownedContractIds.has(c.id)),
      installments: this.state.installments.filter((i) => ownedPropIds.has(i.propertyId)),
      payments: this.state.payments.filter((p) => ownedPropIds.has(p.propertyId)),
      expenses: this.state.expenses.filter((e) => ownedPropIds.has(e.propertyId) && e.approvalStatus === 'معتمد'),
      tickets: this.state.tickets.filter((t) => ownedPropIds.has(t.propertyId)),
      owners: this.state.owners.filter((o) => o.id === user.ownerId),
      tenants: this.state.tenants.filter((t) =>
        this.state.contracts.some((c) => ownedPropIds.has(c.propertyId) && c.tenantId === t.id)
      ),
      auditLogs: [],
    };
  }

  private getActingUser(userId: string): StaffUser {
    const user = this.state.users.find((u) => u.id === userId && u.active);
    if (!user) throw new Error('المستخدم غير موجود أو موقوف');
    return user;
  }

  private userHasPermission(user: StaffUser, permission: PermissionKey): boolean {
    const perms = this.state.rolePermissions[user.role] || [];
    return perms.includes('view_all') || perms.includes(permission);
  }

  private assertPermission(userId: string, permission: PermissionKey): StaffUser {
    const user = this.getActingUser(userId);
    const perms = this.state.rolePermissions[user.role] || [];
    if (!perms.includes(permission)) {
      throw new Error(`لا تملك صلاحية تنفيذ هذا الإجراء (${permission})`);
    }
    return user;
  }

  private addAudit(
    user: StaffUser,
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
    opts?: {
      oldValue?: string;
      newValue?: string;
      reason?: string;
      deviceName?: string;
      ipAddress?: string;
      geoLocation?: string;
      propertyId?: string;
    }
  ) {
    const now = new Date().toISOString();
    user.lastActiveAt = now;
    user.lastActivitySummary = summary;
    const entry: AuditLog = {
      id: uid('aud'),
      userId: user.id,
      userName: user.nameAr,
      userRole: user.roleLabelAr,
      deviceName: opts?.deviceName || user.deviceName,
      ipAddress: opts?.ipAddress || '192.168.10.1',
      geoLocation: opts?.geoLocation || 'الرياض · المملكة العربية السعودية',
      propertyId: opts?.propertyId,
      action,
      entityType,
      entityId,
      summary,
      oldValue: opts?.oldValue,
      newValue: opts?.newValue,
      reason: opts?.reason,
      createdAt: now,
    };
    this.state.auditLogs.unshift(entry);
    if (this.state.auditLogs.length > 500) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 500);
    }
  }

  private addNotification(
    titleAr: string,
    titleEn: string,
    messageAr: string,
    messageEn: string,
    category: 'مالية' | 'تشغيلية' | 'إدارية',
    targetRoles: RoleKey[],
    relatedView?: string
  ) {
    const item: NotificationItem = {
      id: uid('not'),
      titleAr,
      titleEn,
      messageAr,
      messageEn,
      category,
      targetRoles,
      relatedView,
      isReadBy: [],
      createdAt: new Date().toISOString(),
    };
    this.state.notifications.unshift(item);
    if (this.state.notifications.length > 100) {
      this.state.notifications = this.state.notifications.slice(0, 100);
    }
  }

  // 1. Properties & Units
  public createProperty(userId: string, input: Omit<Property, 'id' | 'createdAt'>, deviceName?: string): Property {
    const user = this.assertPermission(userId, 'manage_properties');
    const prop: Property = {
      ...input,
      id: uid('prop'),
      createdAt: new Date().toISOString(),
    };
    this.state.properties.push(prop);
    this.addAudit(user, 'إضافة عقار جديد', 'Property', prop.id, `إضافة العقار ${prop.nameAr} (${prop.code})`, {
      deviceName,
      newValue: prop.status,
    });
    this.persist();
    return prop;
  }

  public createUnit(userId: string, input: Omit<Unit, 'id'>, deviceName?: string): Unit {
    const user = this.assertPermission(userId, 'manage_properties');
    const prop = this.state.properties.find((p) => p.id === input.propertyId);
    if (!prop) throw new Error('العقار المحدد غير موجود');
    const duplicate = this.state.units.find(
      (u) => u.propertyId === input.propertyId && u.unitNumber.trim() === input.unitNumber.trim()
    );
    if (duplicate) throw new Error('رقم الوحدة مسجل مسبقاً في هذا العقار');

    const unit: Unit = {
      ...input,
      id: uid('unit'),
    };
    this.state.units.push(unit);
    this.addAudit(user, 'إضافة وحدة جديدة', 'Unit', unit.id, `إضافة الوحدة ${unit.unitNumber} في ${prop.nameAr}`, {
      deviceName,
      newValue: unit.status,
    });
    this.persist();
    return unit;
  }

  public updateUnitStatus(
    userId: string,
    unitId: string,
    status: UnitStatus,
    reason?: string,
    deviceName?: string
  ): Unit {
    const user = this.assertPermission(userId, 'manage_properties');
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit) throw new Error('الوحدة غير موجودة');

    // Business Rule: Cannot make a leased unit vacant just by flipping status if active contract exists without handover!
    const hasActiveContract = this.state.contracts.some(
      (c) => c.unitId === unitId && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التجديد')
    );
    if (status === 'شاغرة' && hasActiveContract) {
      throw new Error('لا يمكن تحويل الوحدة إلى شاغرة مع وجود عقد نشط؛ يجب إتمام إجراء الإخلاء ومحضر الاستلام أولاً');
    }

    const oldStatus = unit.status;
    unit.status = status;
    if (status === 'موقوفة' || status === 'مؤرشفة') {
      unit.preArchiveStatus = oldStatus;
      unit.archivedAt = new Date().toISOString();
      unit.archivedBy = user.id;
      unit.archiveMode = 'تلقائي';
      unit.archiveReason = reason || (status === 'مؤرشفة' ? 'أرشفة وحدة عقارية' : 'إيقاف الوحدة مؤقتاً');
    } else if (unit.archivedAt) {
      unit.archivedAt = undefined;
      unit.archiveReason = undefined;
      unit.archivedBy = undefined;
      unit.archiveMode = undefined;
    }
    if (status === 'شاغرة') {
      unit.linkedTenantId = undefined;
      unit.vacantSince = new Date().toISOString().slice(0, 10);
    }
    this.addAudit(user, 'تغيير حالة وحدة', 'Unit', unit.id, `تحديث حالة الوحدة ${unit.unitNumber} من ${oldStatus} إلى ${status}`, {
      oldValue: oldStatus,
      newValue: status,
      reason,
      deviceName,
    });
    this.persist();
    return unit;
  }

  public linkTenantToUnit(userId: string, unitId: string, tenantId: string, deviceName?: string): Unit {
    const user = this.assertPermission(userId, 'manage_tenants');
    const unit = this.state.units.find((u) => u.id === unitId);
    const tenant = this.state.tenants.find((t) => t.id === tenantId);
    if (!unit || !tenant) throw new Error('الوحدة أو المستأجر غير موجود');
    if (unit.status === 'مؤجرة') throw new Error('الوحدة مؤجرة حالياً بعقد ساري');

    const oldVal = unit.status;
    unit.linkedTenantId = tenant.id;
    if (unit.status === 'شاغرة' || unit.status === 'تحتاج إلى تنظيف') {
      unit.status = 'محجوزة';
    }
    // Business Rule: Linking tenant to unit NEVER auto-creates a contract!
    this.addAudit(
      user,
      'ربط إداري لمستأجر بوحدة',
      'Unit',
      unit.id,
      `ربط المستأجر ${tenant.nameAr} بالوحدة ${unit.unitNumber} كحجز إداري (دون إنشاء عقد تلقائي)`,
      { oldValue: oldVal, newValue: unit.status, deviceName }
    );
    this.persist();
    return unit;
  }

  // 2. Tenants & Leads
  public createTenant(userId: string, input: Omit<Tenant, 'id' | 'createdAt'>, deviceName?: string): Tenant {
    const user = this.assertPermission(userId, 'manage_tenants');
    const dup = this.state.tenants.find((t) => t.nationalIdOrIqama.trim() === input.nationalIdOrIqama.trim());
    if (dup) {
      throw new Error(`تنبيه تكرار: رقم الهوية/الإقامة مسجل مسبقاً باسم ${dup.nameAr}`);
    }
    const tenant: Tenant = {
      ...input,
      id: uid('ten'),
      createdAt: new Date().toISOString(),
    };
    this.state.tenants.push(tenant);
    this.addAudit(user, 'تسجيل مستأجر جديد', 'Tenant', tenant.id, `إضافة ملف المستأجر ${tenant.nameAr}`, {
      deviceName,
      newValue: tenant.nationalIdOrIqama,
    });
    this.persist();
    return tenant;
  }

  public deleteTenant(userId: string, tenantId: string, deviceName?: string): void {
    const user = this.assertPermission(userId, 'manage_tenants');
    const tenant = this.state.tenants.find((t) => t.id === tenantId);
    if (!tenant) throw new Error('المستأجر غير موجود');

    const hasActiveContract = this.state.contracts.some(
      (c) => c.tenantId === tenantId && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التوثيق')
    );
    if (hasActiveContract) {
      throw new Error('قاعدة حماية: يوجد عقد نشط لهذا المستأجر؛ يجب إنهاء العقد أولاً قبل الأرشفة');
    }
    // Golden rule: Nothing is ever permanently deleted; everything is archived
    const prev = tenant.classification;
    tenant.preArchiveStatus = prev;
    tenant.classification = 'سابق';
    tenant.archivedAt = new Date().toISOString();
    tenant.archivedBy = user.id;
    tenant.archiveMode = 'يدوي';
    tenant.archiveReason = tenant.archiveReason || 'نقل لأرشيف المستأجرين السابقين';
    this.addAudit(user, 'نقل مستأجر للأرشيف الذكي', 'Tenant', tenantId, `أرشفة ملف المستأجر ${tenant.nameAr}`, {
      oldValue: prev,
      newValue: 'سابق (مؤرشف)',
      deviceName,
    });
    this.persist();
  }

  public createLead(userId: string, input: Omit<Lead, 'id'>, deviceName?: string): Lead {
    const user = this.assertPermission(userId, 'manage_contracts');
    const lead: Lead = { ...input, id: uid('lead') };
    this.state.leads.unshift(lead);
    this.addAudit(user, 'تسجيل عميل محتمل', 'Lead', lead.id, `تسجيل استفسار/معاينة للعميل ${lead.nameAr}`, { deviceName });
    this.persist();
    return lead;
  }

  // 3. Contracts & Installment Schedule
  public createContract(
    userId: string,
    input: Omit<LeaseContract, 'id' | 'internalNumber' | 'version' | 'createdBy' | 'createdAt' | 'installmentsCount'>,
    deviceName?: string
  ): { contract: LeaseContract; installments: Installment[] } {
    return this.runTransaction(() => {
    const user = this.assertPermission(userId, 'manage_contracts');
    const unit = this.unitIndex.get(input.unitId) || this.state.units.find((u) => u.id === input.unitId);
    const tenant = this.tenantIndex.get(input.tenantId) || this.state.tenants.find((t) => t.id === input.tenantId);
    if (!unit || !tenant) throw new Error('الوحدة أو المستأجر غير موجود');

    const activeOnUnit = this.state.contracts.find(
      (c) => c.unitId === unit.id && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التوثيق')
    );
    if (activeOnUnit) {
      throw new Error(`يوجد عقد ساري أو قيد التوثيق بالفعل على الوحدة ${unit.unitNumber} (${activeOnUnit.internalNumber})`);
    }

    this.state.counters.contract += 1;
    const freqMap: Record<string, number> = {
      شهري: 12,
      'ربع سنوي': 4,
      'نصف سنوي': 2,
      سنوي: 1,
    };
    const count = freqMap[input.paymentFrequency] || 2;

    const contractCurrency: CurrencyCode = input.currency || this.state.settings.baseCurrency || 'SAR';
    const contract: LeaseContract = {
      ...input,
      currency: contractCurrency,
      id: uid('ctr'),
      internalNumber: `CNT-2026-${pad3(this.state.counters.contract)}`,
      installmentsCount: count,
      version: 1,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };
    this.state.contracts.unshift(contract);

    // Update unit & tenant classification if active
    if (contract.lifecycleStatus === 'نشط') {
      unit.status = 'مؤجرة';
      unit.linkedTenantId = undefined;
      tenant.classification = 'نشط';
    } else if (contract.lifecycleStatus === 'بانتظار التوثيق') {
      unit.status = 'قيد التأجير';
      unit.linkedTenantId = tenant.id;
    }

    // Generate installment schedule
    const start = new Date(contract.startDate);
    const perInst = Math.round((contract.annualRent / count) * 100) / 100;
    const createdInstallments: Installment[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < count; i++) {
      const due = new Date(start);
      due.setMonth(due.getMonth() + i * (12 / count));
      const dueStr = due.toISOString().slice(0, 10);
      const amt = i === count - 1 ? Math.round((contract.annualRent - perInst * (count - 1)) * 100) / 100 : perInst;
      const status = dueStr < todayStr ? 'متأخرة' : dueStr === todayStr ? 'مستحقة اليوم' : 'لم تستحق';
      const inst: Installment = {
        id: uid('inst'),
        contractId: contract.id,
        unitId: contract.unitId,
        propertyId: contract.propertyId,
        tenantId: contract.tenantId,
        installmentNumber: i + 1,
        dueDate: dueStr,
        amount: amt,
        paidAmount: 0,
        remainingAmount: amt,
        currency: contractCurrency,
        status,
      };
      this.state.installments.push(inst);
      createdInstallments.push(inst);
    }

    this.addAudit(
      user,
      'إنشاء عقد إيجار',
      'LeaseContract',
      contract.id,
      `إنشاء العقد ${contract.internalNumber} للوحدة ${unit.unitNumber} (${contract.lifecycleStatus} · إيجار: ${contract.ejarStatus})`,
      { deviceName, newValue: contract.lifecycleStatus }
    );
    this.addNotification(
      `تم تسجيل عقد ${contract.internalNumber}`,
      `Contract ${contract.internalNumber} created`,
      `الوحدة ${unit.unitNumber} للمستأجر ${tenant.nameAr} بقيمة ${contract.annualRent.toLocaleString()} ر.س`,
      `Unit ${unit.unitNumber} for ${tenant.nameEn} (${contract.annualRent.toLocaleString()} SAR)`,
      'تشغيلية',
      ['gm', 'accountant', 'supervisor'],
      'leasing'
    );
    this.persist();
    return { contract, installments: createdInstallments };
    });
  }

  public updateContractEjarStatus(
    userId: string,
    contractId: string,
    ejarNumber: string,
    ejarStatus: LeaseContract['ejarStatus'],
    lifecycleStatus: LeaseContract['lifecycleStatus'],
    deviceName?: string
  ): LeaseContract {
    const user = this.assertPermission(userId, 'manage_contracts');
    const contract = this.state.contracts.find((c) => c.id === contractId);
    if (!contract) throw new Error('العقد غير موجود');

    const oldVal = `${contract.lifecycleStatus} / ${contract.ejarStatus}`;
    const prevLifecycle = contract.lifecycleStatus;
    contract.ejarNumber = ejarNumber;
    contract.ejarStatus = ejarStatus;
    contract.lifecycleStatus = lifecycleStatus;
    contract.version += 1;

    if (lifecycleStatus === 'منتهي' || lifecycleStatus === 'منتهٍ بالإخلاء' || lifecycleStatus === 'ملغي') {
      contract.preArchiveStatus = prevLifecycle;
      contract.archivedAt = contract.archivedAt || new Date().toISOString();
      contract.archivedBy = user.id;
      contract.archiveMode = 'تلقائي';
      contract.archiveReason = contract.archiveReason || `تحويل العقد إلى ${lifecycleStatus}`;
    }

    const unit = this.state.units.find((u) => u.id === contract.unitId);
    if (unit && lifecycleStatus === 'نشط') {
      unit.status = 'مؤجرة';
      unit.linkedTenantId = undefined;
    }

    this.addAudit(
      user,
      'تحديث توثيق وحالة العقد',
      'LeaseContract',
      contract.id,
      `تحديث العقد ${contract.internalNumber} (الإصدار ${contract.version}) إلى ${lifecycleStatus} · إيجار: ${ejarStatus}`,
      { oldValue: oldVal, newValue: `${lifecycleStatus} / ${ejarStatus}`, deviceName }
    );
    this.persist();
    return contract;
  }

  // 4. Handover / Eviction Inspection
  public createHandoverInspection(
    userId: string,
    input: Omit<HandoverInspection, 'id' | 'createdAt' | 'status' | 'netRefundOrDue' | 'inspectorId'>,
    deviceName?: string
  ): HandoverInspection {
    const user = this.assertPermission(userId, 'manage_properties');
    const contract = this.state.contracts.find((c) => c.id === input.contractId);
    const unit = this.state.units.find((u) => u.id === input.unitId);
    if (!contract || !unit) throw new Error('العقد أو الوحدة غير موجودة');

    const netRefundOrDue = input.depositHeld - input.damageCost - input.unpaidRentDue;
    const handover: HandoverInspection = {
      ...input,
      id: uid('hnd'),
      inspectorId: user.id,
      netRefundOrDue,
      status: 'بانتظار الاعتماد',
      createdAt: new Date().toISOString(),
    };
    this.state.handovers.unshift(handover);
    this.addAudit(
      user,
      'إعداد محضر استلام/إخلاء',
      'HandoverInspection',
      handover.id,
      `محضر ${handover.type} للوحدة ${unit.unitNumber} - صافي التسوية: ${netRefundOrDue} ر.س`,
      { deviceName, newValue: handover.status }
    );
    this.addNotification(
      `محضر ${handover.type} بانتظار الاعتماد`,
      `Handover inspection awaiting approval`,
      `الوحدة ${unit.unitNumber} جاهزة لمراجعة التسوية المالية وحالة الوحدة`,
      `Unit ${unit.unitNumber} inspection ready for approval`,
      'تشغيلية',
      ['gm', 'supervisor'],
      'leasing'
    );
    this.persist();
    return handover;
  }

  public approveHandover(
    userId: string,
    handoverId: string,
    nextUnitStatus: UnitStatus,
    deviceName?: string
  ): HandoverInspection {
    return this.runTransaction(() => {
    const user = this.assertPermission(userId, 'approve_expense_supervisor');
    const handover = this.state.handovers.find((h) => h.id === handoverId);
    if (!handover) throw new Error('المحضر غير موجود');
    handover.status = 'معتمد';
    handover.approvedBy = user.id;

    const unit = this.unitIndex.get(handover.unitId) || this.state.units.find((u) => u.id === handover.unitId);
    const contract = this.contractIndex.get(handover.contractId) || this.state.contracts.find((c) => c.id === handover.contractId);
    if (handover.type === 'إخلاء واستلام') {
      if (contract) {
        contract.preArchiveStatus = contract.lifecycleStatus;
        contract.lifecycleStatus = 'منتهٍ بالإخلاء';
        contract.archivedAt = new Date().toISOString();
        contract.archivedBy = user.id;
        contract.archiveMode = 'تلقائي';
        contract.archiveReason = 'انتهاء العقد بمحضر إخلاء واستلام معتمد';

        const tenant = this.tenantIndex.get(contract.tenantId) || this.state.tenants.find((t) => t.id === contract.tenantId);
        const stillHasOtherActiveContract = this.state.contracts.some(
          (c) => c.id !== contract.id && c.tenantId === contract.tenantId && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التوثيق')
        );
        if (tenant && !stillHasOtherActiveContract) {
          tenant.preArchiveStatus = tenant.classification;
          tenant.classification = 'سابق';
          tenant.archivedAt = new Date().toISOString();
          tenant.archivedBy = user.id;
          tenant.archiveMode = 'تلقائي';
          tenant.archiveReason = `إخلاء الوحدة ${unit?.unitNumber || handover.unitId}`;
        }
      }
      if (unit) {
        unit.status = nextUnitStatus;
        unit.linkedTenantId = undefined;
        if (nextUnitStatus === 'شاغرة') {
          unit.vacantSince = new Date().toISOString().slice(0, 10);
        }
      }
    }

    this.addAudit(
      user,
      'اعتماد محضر استلام وإخلاء',
      'HandoverInspection',
      handover.id,
      `اعتماد محضر الوحدة ${unit?.unitNumber || handover.unitId} وتحديث حالة الوحدة إلى ${nextUnitStatus}`,
      { deviceName, oldValue: 'بانتظار الاعتماد', newValue: 'معتمد' }
    );
    this.persist();
    return handover;
    });
  }

  // 5. Payments, Partial Allocation, Receipts & Reversal
  public recordPayment(
    userId: string,
    input: {
      idempotencyKey: string;
      contractId: string;
      installmentId?: string;
      amount: number;
      paymentMethod: PaymentMethod;
      paymentType: PaymentType;
      referenceNumber?: string;
      autoAllocateOldest?: boolean;
      signatureDataUrl?: string;
      notes?: string;
    },
    deviceName?: string
  ): Payment {
    return this.runTransaction(() => {
    const user = this.assertPermission(userId, 'collect_payments');

    // O(1) idempotency protection against duplicate sync / double click
    if (this.idempotencyIndex.has(input.idempotencyKey) || this.state.processedIdempotencyKeys.includes(input.idempotencyKey)) {
      const existing = this.state.payments.find((p) => p.idempotencyKey === input.idempotencyKey);
      if (existing) return existing;
    }

    if (!input.amount || input.amount <= 0) throw new Error('يجب أن يكون المبلغ أكبر من صفر');

    const contract = this.contractIndex.get(input.contractId) || this.state.contracts.find((c) => c.id === input.contractId);
    if (!contract) throw new Error('العقد المحدد غير موجود');
    const property = this.propIndex.get(contract.propertyId) || this.state.properties.find((p) => p.id === contract.propertyId);
    const unit = this.unitIndex.get(contract.unitId) || this.state.units.find((u) => u.id === contract.unitId);

    const allocations: PaymentAllocation[] = [];
    let remainingToAllocate = input.amount;

    if (input.paymentType === 'إيجار') {
      const contractInstallments = this.state.installments
        .filter((i) => i.contractId === contract.id && i.remainingAmount > 0 && i.status !== 'ملغاة')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      if (input.installmentId && !input.autoAllocateOldest) {
        const target = contractInstallments.find((i) => i.id === input.installmentId);
        if (!target) throw new Error('الاستحقاق المحدد غير موجود أو مسدد بالكامل');
        if (input.amount > target.remainingAmount) {
          throw new Error(
            `المبلغ المدخل (${input.amount}) يتجاوز المتبقي على الاستحقاق (${target.remainingAmount})؛ فعّل التوزيع على أقدم استحقاق إذا أردت سداد عدة دفعات.`
          );
        }
        const applied = Math.min(remainingToAllocate, target.remainingAmount);
        target.paidAmount = Math.round((target.paidAmount + applied) * 100) / 100;
        target.remainingAmount = Math.round((target.amount - target.paidAmount) * 100) / 100;
        target.lastPaymentDate = new Date().toISOString().slice(0, 10);
        target.status = target.remainingAmount === 0 ? 'مدفوعة بالكامل' : 'مدفوعة جزئياً';
        allocations.push({ installmentId: target.id, amount: applied });
        remainingToAllocate -= applied;
      } else {
        // Auto-allocate oldest due installments first!
        const totalOpen = contractInstallments.reduce((acc, i) => acc + i.remainingAmount, 0);
        if (contractInstallments.length > 0 && input.amount > totalOpen) {
          throw new Error(`المبلغ المدخل يتجاوز إجمالي الاستحقاقات المتبقية على العقد (${totalOpen} ر.س)`);
        }
        for (const inst of contractInstallments) {
          if (remainingToAllocate <= 0) break;
          const applied = Math.min(remainingToAllocate, inst.remainingAmount);
          inst.paidAmount = Math.round((inst.paidAmount + applied) * 100) / 100;
          inst.remainingAmount = Math.round((inst.amount - inst.paidAmount) * 100) / 100;
          inst.lastPaymentDate = new Date().toISOString().slice(0, 10);
          inst.status = inst.remainingAmount === 0 ? 'مدفوعة بالكامل' : 'مدفوعة جزئياً';
          allocations.push({ installmentId: inst.id, amount: applied });
          remainingToAllocate = Math.round((remainingToAllocate - applied) * 100) / 100;
        }
      }
    }

    this.state.counters.receipt += 1;
    const receiptNumber = `RCP-2026-${pad4(this.state.counters.receipt)}`;
    const payCurrency: CurrencyCode = contract.currency || this.state.settings.baseCurrency || 'SAR';
    const amountSar = toSar(input.amount, payCurrency, this.state.settings.currencyRatesToSar);

    const payment: Payment = {
      id: uid('pay'),
      receiptNumber,
      idempotencyKey: input.idempotencyKey,
      contractId: contract.id,
      unitId: contract.unitId,
      propertyId: contract.propertyId,
      tenantId: contract.tenantId,
      allocations,
      amount: input.amount,
      currency: payCurrency,
      paymentMethod: input.paymentMethod,
      paymentType: input.paymentType,
      referenceNumber: input.referenceNumber,
      receivedBy: user.id,
      deviceName: deviceName || user.deviceName,
      status: 'معتمد',
      signatureDataUrl: input.signatureDataUrl,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };

    this.state.payments.unshift(payment);
    this.state.processedIdempotencyKeys.push(input.idempotencyKey);

    // Update unit overdue flag if all overdue installments cleared
    if (unit && unit.status === 'متأخرة في السداد') {
      const stillOverdue = this.state.installments.some(
        (i) => i.unitId === unit.id && i.status === 'متأخرة' && i.remainingAmount > 0
      );
      if (!stillOverdue) {
        unit.status = 'مؤجرة';
      }
    }

    // Automated Double-Entry Accounting Journal (Converted to SAR GL base)
    this.state.counters.journal += 1;
    const debitAccountId = input.paymentMethod === 'نقدي' ? 'acc-1020' : 'acc-1010';
    const debitAccount = this.state.accounts.find((a) => a.id === debitAccountId)!;
    const mgmtPct = property?.managementFeePercent ?? contract.managementCommissionPercent ?? 5;
    const mgmtFee = input.paymentType === 'إيجار' ? Math.round(amountSar * (mgmtPct / 100) * 100) / 100 : 0;
    const ownerNet = Math.round((amountSar - mgmtFee) * 100) / 100;

    const lines = [{ accountId: debitAccount.id, accountName: debitAccount.nameAr, debit: amountSar, credit: 0 }];
    if (input.paymentType === 'تأمين') {
      const depAcc = this.state.accounts.find((a) => a.id === 'acc-2100')!;
      lines.push({ accountId: depAcc.id, accountName: depAcc.nameAr, debit: 0, credit: amountSar });
      depAcc.balance += amountSar;
    } else if (input.paymentType === 'رسوم مكتب وسعي' || input.paymentType === 'عمولة فسخ') {
      const feeAcc = this.state.accounts.find((a) => a.id === 'acc-4200')!;
      lines.push({ accountId: feeAcc.id, accountName: feeAcc.nameAr, debit: 0, credit: amountSar });
      feeAcc.balance += amountSar;
    } else {
      const ownerAcc = this.state.accounts.find((a) => a.id === 'acc-2200')!;
      const commAcc = this.state.accounts.find((a) => a.id === 'acc-4100')!;
      lines.push({ accountId: ownerAcc.id, accountName: ownerAcc.nameAr, debit: 0, credit: ownerNet });
      if (mgmtFee > 0) {
        lines.push({ accountId: commAcc.id, accountName: commAcc.nameAr, debit: 0, credit: mgmtFee });
        commAcc.balance += mgmtFee;
      }
      ownerAcc.balance += ownerNet;
    }
    debitAccount.balance += amountSar;

    const journal: JournalEntry = {
      id: uid('jrn'),
      entryNumber: `JRN-2026-${pad4(this.state.counters.journal)}`,
      date: new Date().toISOString().slice(0, 10),
      description: `سند قبض ${receiptNumber} (${input.paymentType}) للوحدة ${unit?.unitNumber || ''} - ${input.paymentMethod}${payCurrency !== 'SAR' ? ` [${input.amount} ${payCurrency}]` : ''}`,
      referenceType: 'تحصيل',
      referenceId: payment.id,
      propertyId: contract.propertyId,
      ownerId: property?.ownerShares[0]?.ownerId,
      createdBy: user.id,
      lines,
    };
    this.state.journals.unshift(journal);

    this.addAudit(
      user,
      'تسجيل دفعة وإصدار سند قبض',
      'Payment',
      payment.id,
      `إصدار سند ${receiptNumber} بمبلغ ${input.amount.toLocaleString()} ر.س للوحدة ${unit?.unitNumber || ''}`,
      { deviceName: payment.deviceName, newValue: `${input.amount} ر.س` }
    );
    this.addNotification(
      `سند قبض جديد ${receiptNumber}`,
      `New Receipt ${receiptNumber}`,
      `تم تحصيل ${input.amount.toLocaleString()} ر.س للوحدة ${unit?.unitNumber || ''} بواسطة ${user.nameAr}`,
      `Collected ${input.amount.toLocaleString()} SAR for unit ${unit?.unitNumber || ''}`,
      'مالية',
      ['gm', 'accountant', 'supervisor', 'owner'],
      'finance'
    );

    this.persist();
    return payment;
    });
  }

  public reverseReceipt(userId: string, paymentId: string, reason: string, deviceName?: string): Payment {
    return this.runTransaction(() => {
    const user = this.assertPermission(userId, 'reverse_receipts');
    if (!reason || reason.trim().length < 5) {
      throw new Error('يجب إدخال سبب واضح لإلغاء السند وإصدار حركة عكسية');
    }
    const original = this.state.payments.find((p) => p.id === paymentId);
    if (!original) throw new Error('السند المطلوب غير موجود');
    if (original.status === 'معكوس') throw new Error('هذا السند تم عكسه مسبقاً');

    original.preArchiveStatus = 'معتمد';
    original.status = 'معكوس';
    original.reversalReason = reason;
    original.archivedAt = new Date().toISOString();
    original.archivedBy = user.id;
    original.archiveMode = 'تلقائي';
    original.archiveReason = `سند ملغى بقيد عكسي: ${reason}`;

    // Roll back installment allocations accurately
    for (const alloc of original.allocations) {
      const inst = this.state.installments.find((i) => i.id === alloc.installmentId);
      if (inst) {
        inst.paidAmount = Math.max(0, Math.round((inst.paidAmount - alloc.amount) * 100) / 100);
        inst.remainingAmount = Math.round((inst.amount - inst.paidAmount) * 100) / 100;
        const todayStr = new Date().toISOString().slice(0, 10);
        if (inst.paidAmount > 0) {
          inst.status = 'مدفوعة جزئياً';
        } else {
          inst.status = inst.dueDate < todayStr ? 'متأخرة' : inst.dueDate === todayStr ? 'مستحقة اليوم' : 'لم تستحق';
        }
      }
    }

    this.state.counters.receipt += 1;
    const revReceiptNo = `REV-2026-${pad4(this.state.counters.receipt)}`;
    original.reversedByReceiptId = revReceiptNo;

    // Reversal journal entry
    const origJournal = this.state.journals.find((j) => j.referenceId === original.id);
    if (origJournal) {
      this.state.counters.journal += 1;
      const revLines = origJournal.lines.map((l) => {
        const acc = this.state.accounts.find((a) => a.id === l.accountId);
        if (acc) {
          if (acc.type === 'أصول' || acc.type === 'مصروفات') {
            acc.balance += l.credit - l.debit;
          } else {
            acc.balance += l.debit - l.credit;
          }
        }
        return {
          accountId: l.accountId,
          accountName: l.accountName,
          debit: l.credit,
          credit: l.debit,
        };
      });
      this.state.journals.unshift({
        id: uid('jrn'),
        entryNumber: `JRN-2026-${pad4(this.state.counters.journal)}`,
        date: new Date().toISOString().slice(0, 10),
        description: `قيد عكسي لإلغاء السند ${original.receiptNumber} (${revReceiptNo}) - السبب: ${reason}`,
        referenceType: 'سند عكسي',
        referenceId: original.id,
        propertyId: original.propertyId,
        createdBy: user.id,
        lines: revLines,
      });
    }

    this.addAudit(
      user,
      'إصدار سند عكسي وإلغاء تحصيل',
      'Payment',
      original.id,
      `عكس السند ${original.receiptNumber} بسند عكسي ${revReceiptNo} بمبلغ ${original.amount.toLocaleString()} ر.س`,
      { oldValue: 'معتمد', newValue: 'معكوس', reason, deviceName }
    );
    this.addNotification(
      `حركة عكسية للسند ${original.receiptNumber}`,
      `Receipt ${original.receiptNumber} reversed`,
      `أصدر ${user.nameAr} سنداً عكسياً (${revReceiptNo}) بسبب: ${reason}`,
      `${user.nameEn} issued reversal ${revReceiptNo}: ${reason}`,
      'إدارية',
      ['gm', 'accountant'],
      'finance'
    );

    this.persist();
    return original;
    });
  }

  // 6. Expenses & Multi-Stage Approval
  public createExpense(
    userId: string,
    input: Omit<
      Expense,
      'id' | 'expenseNumber' | 'approvalStatus' | 'createdBy' | 'createdAt' | 'approvedBySupervisor' | 'approvedByManager'
    >,
    deviceName?: string
  ): Expense {
    const user = this.assertPermission(userId, 'create_expense');

    // Prevent duplicate invoice registration
    const dupInvoice = this.state.expenses.find(
      (e) =>
        e.invoiceNumber.trim().toLowerCase() === input.invoiceNumber.trim().toLowerCase() &&
        (e.vendorId || '') === (input.vendorId || '') &&
        e.approvalStatus !== 'مرفوض'
    );
    if (dupInvoice) {
      throw new Error(`تنبيه: رقم الفاتورة ${input.invoiceNumber} مسجل مسبقاً (${dupInvoice.expenseNumber})`);
    }

    this.state.counters.expense += 1;
    const expense: Expense = {
      ...input,
      currency: input.currency || this.state.settings.baseCurrency || 'SAR',
      id: uid('exp'),
      expenseNumber: `EXP-2026-${pad4(this.state.counters.expense)}`,
      approvalStatus: 'بانتظار المشرف',
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };
    this.state.expenses.unshift(expense);

    if (input.ticketId) {
      const tkt = this.state.tickets.find((t) => t.id === input.ticketId);
      if (tkt) {
        tkt.linkedExpenseId = expense.id;
        tkt.actualCost = expense.amount;
        tkt.status = 'بانتظار اعتماد التكلفة';
        tkt.updatedAt = new Date().toISOString();
      }
    }

    this.addAudit(
      user,
      'تسجيل مصروف بانتظار الاعتماد',
      'Expense',
      expense.id,
      `رفع المصروف ${expense.expenseNumber} بمبلغ ${expense.amount.toLocaleString()} ر.س (${expense.category})`,
      { deviceName, newValue: expense.approvalStatus }
    );
    this.addNotification(
      `مصروف جديد ${expense.expenseNumber} ينتظر المراجعة`,
      `New expense ${expense.expenseNumber} pending`,
      `مبلغ ${expense.amount.toLocaleString()} ر.س - ${expense.category}`,
      `${expense.amount.toLocaleString()} SAR - ${expense.category}`,
      'مالية',
      ['supervisor', 'gm'],
      'accounting'
    );
    this.persist();
    return expense;
  }

  public decideExpense(
    userId: string,
    expenseId: string,
    decision: 'approve' | 'reject',
    reason?: string,
    deviceName?: string
  ): Expense {
    return this.runTransaction(() => {
    const user = this.getActingUser(userId);
    const expense = this.state.expenses.find((e) => e.id === expenseId);
    if (!expense) throw new Error('المصروف غير موجود');
    if (expense.approvalStatus === 'معتمد' || expense.approvalStatus === 'مرفوض') {
      throw new Error('تم حسم هذا المصروف مسبقاً');
    }

    // Segregation of duties: creator cannot self-approve sensitive expense unless GM override
    if (decision === 'approve' && expense.createdBy === user.id && user.role !== 'gm') {
      throw new Error('الفصل بين المهام: لا يمكن للموظف اعتماد مصروف قام برفعه بنفسه');
    }

    const oldStatus = expense.approvalStatus;

    if (decision === 'reject') {
      if (!reason) throw new Error('يجب ذكر سبب الرفض');
      this.assertPermission(userId, 'approve_expense_supervisor');
      expense.approvalStatus = 'مرفوض';
      expense.rejectionReason = reason;
      this.addAudit(user, 'رفض مصروف', 'Expense', expense.id, `رفض المصروف ${expense.expenseNumber}`, {
        oldValue: oldStatus,
        newValue: 'مرفوض',
        reason,
        deviceName,
      });
      this.persist();
      return expense;
    }

    // Approval routing based on threshold
    const threshold = this.state.settings.supervisorApprovalThreshold;
    if (expense.approvalStatus === 'بانتظار المشرف') {
      if (user.role === 'gm') {
        this.assertPermission(userId, 'approve_expense_manager');
        expense.approvedBySupervisor = user.id;
        expense.approvedByManager = user.id;
        expense.approvalStatus = 'معتمد';
      } else {
        this.assertPermission(userId, 'approve_expense_supervisor');
        expense.approvedBySupervisor = user.id;
        expense.approvalStatus = expense.amount > threshold ? 'بانتظار المدير' : 'معتمد';
      }
    } else if (expense.approvalStatus === 'بانتظار المدير') {
      this.assertPermission(userId, 'approve_expense_manager');
      expense.approvedByManager = user.id;
      expense.approvalStatus = 'معتمد';
    }

    // When fully approved, post to accounting journal (converted to SAR base)!
    if (expense.approvalStatus === 'معتمد') {
      const expCurrency: CurrencyCode = expense.currency || 'SAR';
      const expAmountSar = toSar(expense.amount, expCurrency, this.state.settings.currencyRatesToSar);
      this.state.counters.journal += 1;
      const expAccId = expense.category === 'صيانة' ? 'acc-5100' : 'acc-5200';
      const expAcc = this.state.accounts.find((a) => a.id === expAccId)!;
      const creditAccId =
        expense.bearer === 'المالك' ? 'acc-2200' : expense.paymentMethod === 'نقدي' ? 'acc-1020' : 'acc-1010';
      const creditAcc = this.state.accounts.find((a) => a.id === creditAccId)!;

      // If bearer is Owner, deduct from Owner Payable (2200) or Bank (1010)
      if (expense.bearer === 'المالك') {
        const bankAcc = this.state.accounts.find((a) => a.id === 'acc-1010')!;
        const ownerAcc = this.state.accounts.find((a) => a.id === 'acc-2200')!;
        ownerAcc.balance -= expAmountSar;
        bankAcc.balance -= expAmountSar;
        this.state.journals.unshift({
          id: uid('jrn'),
          entryNumber: `JRN-2026-${pad4(this.state.counters.journal)}`,
          date: expense.date,
          description: `اعتماد مصروف ${expense.expenseNumber} (${expense.category}) محمل على المالك${expCurrency !== 'SAR' ? ` [${expense.amount} ${expCurrency}]` : ''}`,
          referenceType: 'مصروف',
          referenceId: expense.id,
          propertyId: expense.propertyId,
          createdBy: user.id,
          lines: [
            { accountId: ownerAcc.id, accountName: ownerAcc.nameAr, debit: expAmountSar, credit: 0 },
            { accountId: bankAcc.id, accountName: bankAcc.nameAr, debit: 0, credit: expAmountSar },
          ],
        });
      } else {
        expAcc.balance += expAmountSar;
        creditAcc.balance -= expAmountSar;
        this.state.journals.unshift({
          id: uid('jrn'),
          entryNumber: `JRN-2026-${pad4(this.state.counters.journal)}`,
          date: expense.date,
          description: `اعتماد مصروف ${expense.expenseNumber} (${expense.category}) على حساب ${expense.bearer}${expCurrency !== 'SAR' ? ` [${expense.amount} ${expCurrency}]` : ''}`,
          referenceType: 'مصروف',
          referenceId: expense.id,
          propertyId: expense.propertyId,
          createdBy: user.id,
          lines: [
            { accountId: expAcc.id, accountName: expAcc.nameAr, debit: expAmountSar, credit: 0 },
            { accountId: creditAcc.id, accountName: creditAcc.nameAr, debit: 0, credit: expAmountSar },
          ],
        });
      }

      if (expense.ticketId) {
        const tkt = this.state.tickets.find((t) => t.id === expense.ticketId);
        if (tkt && tkt.status === 'بانتظار اعتماد التكلفة') {
          tkt.status = 'قيد التنفيذ';
          tkt.updatedAt = new Date().toISOString();
        }
      }
    }

    this.addAudit(
      user,
      'اعتماد مصروف',
      'Expense',
      expense.id,
      `تحديث اعتماد المصروف ${expense.expenseNumber} من ${oldStatus} إلى ${expense.approvalStatus}`,
      { oldValue: oldStatus, newValue: expense.approvalStatus, deviceName }
    );
    this.persist();
    return expense;
    });
  }

  // 7. Maintenance Tickets & Tasks
  public createTicket(
    userId: string,
    input: Omit<MaintenanceTicket, 'id' | 'ticketNumber' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
      createLinkedTask?: boolean;
    },
    deviceName?: string
  ): MaintenanceTicket {
    const user = this.assertPermission(userId, 'manage_maintenance');
    this.state.counters.ticket += 1;
    const now = new Date().toISOString();
    const { createLinkedTask, ...ticketData } = input;

    const ticket: MaintenanceTicket = {
      ...ticketData,
      id: uid('tkt'),
      ticketNumber: `MNT-2026-${pad3(this.state.counters.ticket)}`,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };

    if (createLinkedTask !== false) {
      const task: TaskItem = {
        id: uid('tsk'),
        title: `تنفيذ صيانة ${ticket.ticketNumber}: ${ticket.title}`,
        description: ticket.description,
        type: 'صيانة',
        propertyId: ticket.propertyId,
        unitId: ticket.unitId,
        assignedTo: ticket.assignedTo || 'usr-tech',
        createdBy: user.id,
        dueDate: ticket.scheduledDate || new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
        priority: ticket.priority,
        status: ticket.assignedTo ? 'مسندة' : 'جديدة',
        checklist: [
          { text: 'معاينة العطل وتسجيل التشخيص', done: false },
          { text: 'تنفيذ الإصلاح وتوثيق صور قبل وبعد', done: false },
        ],
        comments: [],
        linkedTicketId: ticket.id,
        createdAt: now,
      };
      this.state.tasks.unshift(task);
      ticket.linkedTaskId = task.id;
    }

    this.state.tickets.unshift(ticket);
    this.addAudit(
      user,
      'فتح بلاغ صيانة',
      'MaintenanceTicket',
      ticket.id,
      `فتح البلاغ ${ticket.ticketNumber}: ${ticket.title} (الأولوية: ${ticket.priority})`,
      { deviceName, newValue: ticket.status }
    );
    this.addNotification(
      `بلاغ صيانة ${ticket.priority}: ${ticket.ticketNumber}`,
      `Maintenance ticket ${ticket.ticketNumber}`,
      ticket.title,
      ticket.title,
      'تشغيلية',
      ['supervisor', 'technician', 'gm'],
      'maintenance'
    );
    this.persist();
    return ticket;
  }

  public updateTicket(
    userId: string,
    ticketId: string,
    patch: Partial<Pick<MaintenanceTicket, 'status' | 'diagnosis' | 'actualCost' | 'assignedTo' | 'rating'>>,
    deviceName?: string
  ): MaintenanceTicket {
    const user = this.assertPermission(userId, 'execute_maintenance');
    const ticket = this.state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error('بلاغ الصيانة غير موجود');
    const oldStatus = ticket.status;
    Object.assign(ticket, patch, { updatedAt: new Date().toISOString() });

    if (patch.status === 'مكتمل' || patch.status === 'مغلق') {
      ticket.preArchiveStatus = oldStatus;
      ticket.archivedAt = ticket.archivedAt || new Date().toISOString();
      ticket.archivedBy = user.id;
      ticket.archiveMode = 'تلقائي';
      ticket.archiveReason = ticket.archiveReason || `إغلاق بلاغ الصيانة (${patch.status})`;
    }
    if (ticket.linkedTaskId && (patch.status === 'مكتمل' || patch.status === 'مغلق')) {
      const tsk = this.state.tasks.find((t) => t.id === ticket.linkedTaskId);
      if (tsk) {
        tsk.preArchiveStatus = tsk.status;
        tsk.status = 'مكتملة';
        tsk.archivedAt = tsk.archivedAt || new Date().toISOString();
        tsk.archivedBy = user.id;
        tsk.archiveMode = 'تلقائي';
        tsk.archiveReason = `اكتمل البلاغ المرتبط ${ticket.ticketNumber}`;
      }
    }

    this.addAudit(
      user,
      'تحديث بلاغ صيانة',
      'MaintenanceTicket',
      ticket.id,
      `تحديث البلاغ ${ticket.ticketNumber} إلى ${ticket.status}`,
      { oldValue: oldStatus, newValue: ticket.status, deviceName }
    );
    this.persist();
    return ticket;
  }

  private pickSmartAssignee(taskType: string, propertyId?: string): { user?: StaffUser; reason: string } {
    const typeLower = taskType.toLowerCase();
    const preferredRoles: RoleKey[] =
      typeLower.includes('صيانة') || typeLower.includes('تكييف') || typeLower.includes('سباكة')
        ? ['technician', 'maint_manager', 'supervisor']
        : typeLower.includes('تأجير') || typeLower.includes('عقد') || typeLower.includes('معاينة')
        ? ['leasing', 'supervisor', 'receptionist']
        : typeLower.includes('مالي') || typeLower.includes('تحصيل') || typeLower.includes('فاتورة')
        ? ['accountant', 'gm']
        : typeLower.includes('تسليم') || typeLower.includes('إخلاء') || typeLower.includes('استلام')
        ? ['supervisor', 'leasing']
        : ['supervisor', 'leasing', 'receptionist', 'gm'];

    const candidates = this.state.users.filter((u) => {
      if (!u.active || u.role === 'owner' || u.role === 'auditor') return false;
      if (u.statusState === 'غير متصل') return false;
      if (propertyId && Array.isArray(u.allowedPropertyIds) && u.allowedPropertyIds.length > 0) {
        if (!u.allowedPropertyIds.includes(propertyId)) return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      return { reason: 'لا يوجد موظف متصل متاح حالياً — تم الحفظ في قائمة الانتظار' };
    }

    const activeLoad = (uidStr: string) =>
      this.state.tasks.filter((t) => t.assignedTo === uidStr && t.status !== 'مكتملة' && !t.archivedAt).length;

    const scored = candidates
      .map((u) => {
        const roleIdx = preferredRoles.indexOf(u.role);
        const roleScore = roleIdx === -1 ? 10 : roleIdx * 20;
        const loadScore = activeLoad(u.id) * 15;
        const statusScore = u.statusState === 'مشغول' ? 25 : 0;
        return { user: u, score: roleScore + loadScore + statusScore, load: activeLoad(u.id) };
      })
      .sort((a, b) => a.score - b.score);

    const best = scored[0];
    return {
      user: best.user,
      reason: `إسناد ذكي لـ ${best.user.nameAr} (${best.user.roleLabelAr}) · عبء العمل الحالي: ${best.load} مهام`,
    };
  }

  public createTask(
    userId: string,
    input: Omit<TaskItem, 'id' | 'createdBy' | 'createdAt' | 'comments'> & { autoAssignSmart?: boolean },
    deviceName?: string
  ): TaskItem {
    const user = this.assertPermission(userId, 'manage_tasks');
    const { autoAssignSmart, ...rawInput } = input;
    let finalAssignee = rawInput.assignedTo;
    let isQueued = false;
    let smartReason: string | undefined;

    if (autoAssignSmart || !finalAssignee) {
      const picked = this.pickSmartAssignee(rawInput.type, rawInput.propertyId);
      if (picked.user) {
        finalAssignee = picked.user.id;
        smartReason = picked.reason;
      } else {
        finalAssignee = '';
        isQueued = true;
        smartReason = picked.reason;
      }
    }

    const task: TaskItem = {
      ...rawInput,
      assignedTo: finalAssignee,
      status: isQueued ? 'جديدة' : rawInput.status || (finalAssignee ? 'مسندة' : 'جديدة'),
      isQueued,
      smartAssignedReason: smartReason,
      id: uid('tsk'),
      createdBy: user.id,
      comments: [],
      createdAt: new Date().toISOString(),
    };
    this.state.tasks.unshift(task);
    this.addAudit(
      user,
      isQueued ? 'إضافة مهمة لقائمة الانتظار' : 'إنشاء وإسناد مهمة فريق',
      'TaskItem',
      task.id,
      `إسناد مهمة "${task.title}"${smartReason ? ` (${smartReason})` : ''}`,
      {
        deviceName,
        propertyId: task.propertyId,
        newValue: task.status,
      }
    );
    if (isQueued) {
      this.addNotification(
        `مهمة في قائمة الانتظار: ${task.title}`,
        `Queued Task: ${task.title}`,
        `لم يتم العثور على موظف متاح حالياً، بانتظار توجيه المدير.`,
        `No eligible staff available right now; task placed in queue.`,
        'تشغيلية',
        ['gm', 'sys_owner', 'supervisor', 'maint_manager'],
        'team'
      );
    } else if (finalAssignee) {
      const targetUser = this.state.users.find((u) => u.id === finalAssignee);
      if (targetUser) {
        this.addNotification(
          task.priority === 'عاجل' ? `مهمة عاجلة: ${task.title}` : `مهمة جديدة مسندة: ${task.title}`,
          `New task assigned: ${task.title}`,
          `تم إسناد مهمة (${task.type}) إلى ${targetUser.nameAr} — الموعد النهائي: ${task.dueDate}`,
          `Assigned to ${targetUser.nameEn} · Due: ${task.dueDate}`,
          'تشغيلية',
          [targetUser.role, 'supervisor', 'gm'],
          'team'
        );
      }
    }
    this.persist();
    return task;
  }

  public updateTask(
    userId: string,
    taskId: string,
    patch: Partial<Pick<TaskItem, 'status' | 'checklist' | 'assignedTo' | 'actualHours' | 'photoNotes'>> & {
      commentText?: string;
    },
    deviceName?: string
  ): TaskItem {
    const user = this.assertPermission(userId, 'manage_tasks');
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('المهمة غير موجودة');
    const oldStatus = task.status;

    if (patch.status) {
      task.status = patch.status;
      if (patch.status === 'مكتملة') {
        task.completedAt = task.completedAt || new Date().toISOString();
        task.preArchiveStatus = oldStatus;
        task.archivedAt = task.archivedAt || new Date().toISOString();
        task.archivedBy = user.id;
        task.archiveMode = 'تلقائي';
        task.archiveReason = task.archiveReason || 'إنجاز المهمة بنجاح';
      }
    }
    if (patch.checklist) task.checklist = patch.checklist;
    if (patch.actualHours !== undefined) task.actualHours = patch.actualHours;
    if (patch.photoNotes) task.photoNotes = patch.photoNotes;
    if (patch.assignedTo !== undefined) {
      task.assignedTo = patch.assignedTo;
      if (patch.assignedTo) task.isQueued = false;
    }
    if (patch.commentText) {
      task.comments.push({
        id: uid('cmt'),
        authorName: user.nameAr,
        text: patch.commentText,
        createdAt: new Date().toISOString(),
      });
      const assignee = this.state.users.find((u) => u.id === task.assignedTo);
      if (assignee && assignee.id !== user.id) {
        this.addNotification(
          `تعليق جديد على مهمة: ${task.title}`,
          `Comment on task: ${task.title}`,
          `${user.nameAr} أضاف تعليقاً: "${patch.commentText}"`,
          `${user.nameEn} commented: "${patch.commentText}"`,
          'تشغيلية',
          [assignee.role],
          'team'
        );
      }
    }

    this.addAudit(user, 'تحديث مهمة', 'TaskItem', task.id, `تحديث المهمة "${task.title}" (${task.status})`, {
      oldValue: oldStatus,
      newValue: task.status,
      propertyId: task.propertyId,
      deviceName,
    });
    this.persist();
    return task;
  }

  public reassignTask(
    userId: string,
    taskId: string,
    newAssigneeId: string,
    reason?: string,
    deviceName?: string
  ): TaskItem {
    const user = this.assertPermission(userId, 'manage_tasks');
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('المهمة غير موجودة');
    const targetUser = this.state.users.find((u) => u.id === newAssigneeId && u.active);
    if (!targetUser) throw new Error('الموظف المستهدف غير متاح');

    const prevAssignee = this.state.users.find((u) => u.id === task.assignedTo);
    task.assignedTo = targetUser.id;
    task.isQueued = false;
    if (task.status === 'جديدة') task.status = 'مسندة';
    task.smartAssignedReason = `إعادة إسناد يدوية إلى ${targetUser.nameAr}${reason ? ` · ${reason}` : ''}`;

    this.addAudit(
      user,
      'إعادة إسناد مهمة',
      'TaskItem',
      task.id,
      `إعادة إسناد المهمة "${task.title}" إلى ${targetUser.nameAr}`,
      {
        oldValue: prevAssignee?.nameAr || 'قائمة الانتظار',
        newValue: targetUser.nameAr,
        reason,
        propertyId: task.propertyId,
        deviceName,
      }
    );
    this.addNotification(
      `إعادة إسناد مهمة إليك: ${task.title}`,
      `Task reassigned to you: ${task.title}`,
      `أُسندت المهمة إلى ${targetUser.nameAr} من قِبل ${user.nameAr}`,
      `Reassigned to ${targetUser.nameEn} by ${user.nameEn}`,
      'تشغيلية',
      [targetUser.role],
      'team'
    );
    this.persist();
    return task;
  }

  public reviewTask(
    userId: string,
    taskId: string,
    decision: 'approve' | 'reject',
    reason?: string,
    deviceName?: string
  ): TaskItem {
    const user = this.assertPermission(userId, 'approve_expense_supervisor');
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('المهمة غير موجودة');
    const oldStatus = task.status;
    const now = new Date().toISOString();
    const assignee = this.state.users.find((u) => u.id === task.assignedTo);

    if (decision === 'approve') {
      task.status = 'مكتملة';
      task.approvedBy = user.id;
      task.approvedAt = now;
      task.completedAt = task.completedAt || now;
      task.rejectedReason = undefined;
      task.preArchiveStatus = oldStatus;
      task.archivedAt = task.archivedAt || now;
      task.archivedBy = user.id;
      task.archiveMode = 'تلقائي';
      task.archiveReason = reason || 'اعتماد وإغلاق المهمة بعد مراجعة المشرف';
      if (assignee) {
        this.addNotification(
          `تم اعتماد المهمة: ${task.title}`,
          `Task approved: ${task.title}`,
          `اعتمد ${user.nameAr} إنجاز المهمة وأُغلقت في الأرشيف.`,
          `${user.nameEn} approved task completion.`,
          'تشغيلية',
          [assignee.role],
          'team'
        );
      }
    } else {
      task.status = 'قيد التنفيذ';
      task.rejectedReason = reason || 'يرجى استكمال الملاحظات وإعادة الرفع للمراجعة';
      task.comments.push({
        id: uid('cmt'),
        authorName: user.nameAr,
        text: `ملاحظة مراجعة: ${task.rejectedReason}`,
        createdAt: now,
      });
      if (assignee) {
        this.addNotification(
          `إعادة مهمة للاستكمال: ${task.title}`,
          `Task returned for follow-up: ${task.title}`,
          `ملاحظة ${user.nameAr}: ${task.rejectedReason}`,
          `Review note: ${task.rejectedReason}`,
          'تشغيلية',
          [assignee.role],
          'team'
        );
      }
    }

    this.addAudit(
      user,
      decision === 'approve' ? 'اعتماد وإغلاق مهمة' : 'إرجاع مهمة للمراجعة',
      'TaskItem',
      task.id,
      `${decision === 'approve' ? 'اعتماد' : 'إرجاع'} المهمة "${task.title}"`,
      { oldValue: oldStatus, newValue: task.status, reason, propertyId: task.propertyId, deviceName }
    );
    this.persist();
    return task;
  }

  // 8. Documents, Communications, Vendors, Permissions, Backups
  public addCommunication(userId: string, input: Omit<CommunicationLog, 'id' | 'sentBy' | 'createdAt'>, deviceName?: string): CommunicationLog {
    const user = this.getActingUser(userId);
    const log: CommunicationLog = {
      ...input,
      id: uid('com'),
      sentBy: user.id,
      createdAt: new Date().toISOString(),
    };
    this.state.communications.unshift(log);
    this.addAudit(user, 'تسجيل مراسلة', 'Communication', log.id, `تسجيل ${log.channel} مع ${log.targetName}`, {
      deviceName,
    });
    this.persist();
    return log;
  }

  public addDocument(userId: string, input: Omit<DocumentRecord, 'id' | 'uploadedBy' | 'createdAt'>, deviceName?: string): DocumentRecord {
    const user = this.assertPermission(userId, 'manage_documents');
    const doc: DocumentRecord = {
      ...input,
      id: uid('doc'),
      uploadedBy: user.id,
      createdAt: new Date().toISOString(),
    };
    this.state.documents.unshift(doc);
    this.addAudit(user, 'أرشفة مستند', 'Document', doc.id, `رفع المستند "${doc.title}" (${doc.category})`, { deviceName });
    this.persist();
    return doc;
  }

  public createVendor(userId: string, input: Omit<Vendor, 'id'>, deviceName?: string): Vendor {
    const user = this.assertPermission(userId, 'manage_maintenance');
    const vendor: Vendor = { ...input, id: uid('vnd') };
    this.state.vendors.push(vendor);
    this.addAudit(user, 'إضافة مقاول/مورد', 'Vendor', vendor.id, `إضافة المورد ${vendor.nameAr}`, { deviceName });
    this.persist();
    return vendor;
  }

  public toggleRolePermission(userId: string, role: RoleKey, permission: PermissionKey, deviceName?: string): Record<RoleKey, PermissionKey[]> {
    const user = this.assertPermission(userId, 'manage_users');
    if (role === 'gm' && permission === 'manage_users') {
      throw new Error('لا يمكن سحب صلاحية إدارة المستخدمين من المدير العام');
    }
    const list = this.state.rolePermissions[role] || [];
    if (list.includes(permission)) {
      this.state.rolePermissions[role] = list.filter((p) => p !== permission);
    } else {
      this.state.rolePermissions[role] = [...list, permission];
    }
    this.addAudit(
      user,
      'تعديل مصفوفة الصلاحيات',
      'RolePermissions',
      role,
      `تعديل صلاحية ${permission} للدور ${role}`,
      { deviceName }
    );
    this.persist();
    return this.state.rolePermissions;
  }

  public markNotificationsRead(userId: string): void {
    for (const n of this.state.notifications) {
      if (!n.isReadBy.includes(userId)) n.isReadBy.push(userId);
    }
    this.persist();
  }

  public createBackup(userId: string, label?: string, deviceName?: string): BackupSnapshot {
    const user = this.assertPermission(userId, 'backup_restore');
    ensureDirs();
    const id = uid('bkp');
    const json = JSON.stringify(this.state, null, 2);
    const filePath = path.join(BACKUP_DIR, `${id}.json`);
    fs.writeFileSync(filePath, json, 'utf-8');

    const recordCount =
      this.state.properties.length +
      this.state.units.length +
      this.state.tenants.length +
      this.state.contracts.length +
      this.state.payments.length +
      this.state.expenses.length +
      this.state.tickets.length;

    const snap: BackupSnapshot = {
      id,
      label: label || `نسخة احتياطية يدوية · ${new Date().toLocaleDateString('ar-SA')}`,
      createdAt: new Date().toISOString(),
      createdBy: user.nameAr,
      recordCount,
      sizeKb: Math.max(1, Math.round(Buffer.byteLength(json, 'utf-8') / 1024)),
    };
    this.state.backups.unshift(snap);
    this.addAudit(user, 'إنشاء نسخة احتياطية مشفرة', 'Backup', snap.id, `حفظ نسخة احتياطية (${snap.sizeKb} KB)`, {
      deviceName,
    });
    this.persist();
    return snap;
  }

  public restoreBackup(userId: string, backupId: string, deviceName?: string): AqarDatabaseState {
    const user = this.assertPermission(userId, 'backup_restore');
    const filePath = path.join(BACKUP_DIR, `${backupId}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error('ملف النسخة الاحتياطية غير موجود على الخادم (جرب إنشاء نسخة جديدة أولاً)');
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const restored = JSON.parse(raw) as AqarDatabaseState;
    const currentBackups = this.state.backups;
    this.state = restored;
    this.state.backups = currentBackups;
    this.addAudit(user, 'استعادة نسخة احتياطية', 'Backup', backupId, `تمت استعادة النظام والتحقق من سلامة البيانات`, {
      deviceName,
    });
    this.persist();
    return this.state;
  }

  // 9. Automated Rent Due Reminder Scheduler (Linked to Contracts)
  public createReminderRule(
    userId: string,
    input: Omit<ReminderRule, 'id' | 'createdBy' | 'createdAt'>,
    deviceName?: string
  ): ReminderRule {
    const user = this.assertPermission(userId, 'manage_contracts');
    if (!this.state.reminderRules) this.state.reminderRules = [];
    const rule: ReminderRule = {
      ...input,
      id: uid('rem'),
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };
    this.state.reminderRules.unshift(rule);
    this.addAudit(user, 'إنشاء قاعدة جدولة تنبيهات', 'ReminderRule', rule.id, `جدولة تنبيه إيجار: ${rule.nameAr}`, {
      deviceName,
      newValue: `${rule.daysBeforeDue} يوم · ${rule.channels.join(', ')}`,
    });
    this.persist();
    return rule;
  }

  public toggleReminderRule(userId: string, ruleId: string, enabled: boolean, deviceName?: string): ReminderRule {
    const user = this.assertPermission(userId, 'manage_contracts');
    const rule = (this.state.reminderRules || []).find((r) => r.id === ruleId);
    if (!rule) throw new Error('قاعدة الجدولة غير موجودة');
    rule.enabled = enabled;
    this.addAudit(
      user,
      'تعديل حالة جدولة التنبيه',
      'ReminderRule',
      rule.id,
      `${enabled ? 'تفعيل' : 'إيقاف'} قاعدة التنبيه: ${rule.nameAr}`,
      { deviceName }
    );
    this.persist();
    return rule;
  }

  public deleteReminderRule(userId: string, ruleId: string, deviceName?: string): void {
    const user = this.assertPermission(userId, 'manage_contracts');
    this.state.reminderRules = (this.state.reminderRules || []).filter((r) => r.id !== ruleId);
    this.addAudit(user, 'حذف قاعدة جدولة تنبيهات', 'ReminderRule', ruleId, `حذف قاعدة تنبيه مجدولة`, { deviceName });
    this.persist();
  }

  public runReminderScheduler(
    userId: string,
    opts?: {
      contractId?: string;
      ruleId?: string;
      channels?: ReminderChannel[];
      customMessage?: string;
    },
    deviceName?: string
  ): ReminderDispatchLog[] {
    const user = this.getActingUser(userId);
    if (!this.state.reminderRules) this.state.reminderRules = [];
    if (!this.state.reminderLogs) this.state.reminderLogs = [];

    const nowIso = new Date().toISOString();
    const todayMs = new Date('2026-11-14T00:00:00Z').getTime();
    const createdLogs: ReminderDispatchLog[] = [];

    const openInstallments = this.state.installments.filter((i) => {
      if (i.remainingAmount <= 0 || i.status === 'ملغاة') return false;
      if (opts?.contractId && i.contractId !== opts.contractId) return false;
      const ctr = this.state.contracts.find((c) => c.id === i.contractId);
      return ctr && (ctr.lifecycleStatus === 'نشط' || ctr.lifecycleStatus === 'بانتظار التجديد');
    });

    const activeRules = opts?.ruleId
      ? this.state.reminderRules.filter((r) => r.id === opts.ruleId)
      : this.state.reminderRules.filter((r) => r.enabled);

    // Direct manual / contract-scoped dispatch if custom channels provided or single contract triggered
    if (opts?.contractId && opts?.channels && opts.channels.length > 0) {
      const targetInst = openInstallments[0];
      const ctr = this.state.contracts.find((c) => c.id === opts.contractId);
      if (!ctr) throw new Error('العقد غير موجود');
      const tenant = this.state.tenants.find((t) => t.id === ctr.tenantId);
      const unit = this.state.units.find((u) => u.id === ctr.unitId);
      const curr: CurrencyCode = targetInst?.currency || ctr.currency || 'SAR';
      const amt = targetInst ? targetInst.remainingAmount : 0;
      const dueStr = targetInst ? targetInst.dueDate : ctr.endDate;

      for (const ch of opts.channels) {
        const msg = (
          opts.customMessage ||
          `تذكير تلقائي من AqarPlus: عزيزي ${tenant?.nameAr || ''}, يستحق القسط رقم ${targetInst?.installmentNumber || 1} لعقد ${ctr.internalNumber} (وحدة ${unit?.unitNumber || ''}) بمبلغ ${amt.toLocaleString()} ${currencyLabelAr(curr)} بتاريخ ${dueStr}.`
        )
          .replace(/\{tenant\}/g, tenant?.nameAr || '')
          .replace(/\{contract\}/g, ctr.internalNumber)
          .replace(/\{unit\}/g, unit?.unitNumber || '')
          .replace(/\{installment\}/g, String(targetInst?.installmentNumber || 1))
          .replace(/\{amount\}/g, `${amt.toLocaleString()} ${currencyLabelAr(curr)}`)
          .replace(/\{dueDate\}/g, dueStr);

        const recipient = ch === 'بريد إلكتروني' ? tenant?.email || '—' : tenant?.phone || '—';
        const log: ReminderDispatchLog = {
          id: uid('rlog'),
          ruleId: opts.ruleId || 'manual-contract',
          ruleName: opts.ruleId
            ? activeRules[0]?.nameAr || 'تنبيه عقد فوري'
            : `إشعار مجدول للعقد ${ctr.internalNumber}`,
          contractId: ctr.id,
          installmentId: targetInst?.id || ctr.id,
          tenantId: ctr.tenantId,
          tenantName: tenant?.nameAr || '—',
          channel: ch,
          recipient,
          messagePreview: msg,
          dueDate: dueStr,
          amount: amt,
          currency: curr,
          status: 'تم الإرسال (محاكاة)',
          sentAt: nowIso,
        };
        this.state.reminderLogs.unshift(log);
        createdLogs.push(log);

        this.state.communications.unshift({
          id: uid('com'),
          targetType: 'مستأجر',
          targetId: ctr.tenantId,
          targetName: tenant?.nameAr || '—',
          channel: ch === 'بريد إلكتروني' ? 'بريد إلكتروني' : 'رسالة نصية / واتساب',
          templateUsed: 'تذكير استحقاق الإيجار المجدول',
          language: 'ar',
          summary: `[${ch}] ${msg}`,
          sentBy: user.id,
          createdAt: nowIso,
        });
      }
    } else {
      for (const rule of activeRules) {
        for (const inst of openInstallments) {
          if (rule.contractId && rule.contractId !== inst.contractId) continue;
          if (rule.propertyId && rule.propertyId !== 'all' && rule.propertyId !== inst.propertyId) continue;

          const dueMs = new Date(`${inst.dueDate}T00:00:00Z`).getTime();
          const daysDiff = Math.ceil((dueMs - todayMs) / 86400000);
          if (daysDiff > rule.daysBeforeDue) continue;

          const ctr = this.state.contracts.find((c) => c.id === inst.contractId);
          const tenant = this.state.tenants.find((t) => t.id === inst.tenantId);
          const unit = this.state.units.find((u) => u.id === inst.unitId);
          const curr: CurrencyCode = inst.currency || ctr?.currency || 'SAR';

          for (const ch of rule.channels) {
            const msg = rule.templateAr
              .replace(/\{tenant\}/g, tenant?.nameAr || '')
              .replace(/\{contract\}/g, ctr?.internalNumber || '')
              .replace(/\{unit\}/g, unit?.unitNumber || '')
              .replace(/\{installment\}/g, String(inst.installmentNumber))
              .replace(/\{amount\}/g, `${inst.remainingAmount.toLocaleString()} ${currencyLabelAr(curr)}`)
              .replace(/\{dueDate\}/g, inst.dueDate);

            const recipient = ch === 'بريد إلكتروني' ? tenant?.email || '—' : tenant?.phone || '—';
            const log: ReminderDispatchLog = {
              id: uid('rlog'),
              ruleId: rule.id,
              ruleName: rule.nameAr,
              contractId: inst.contractId,
              installmentId: inst.id,
              tenantId: inst.tenantId,
              tenantName: tenant?.nameAr || '—',
              channel: ch,
              recipient,
              messagePreview: msg,
              dueDate: inst.dueDate,
              amount: inst.remainingAmount,
              currency: curr,
              status: 'تم الإرسال (محاكاة)',
              sentAt: nowIso,
            };
            this.state.reminderLogs.unshift(log);
            createdLogs.push(log);

            this.state.communications.unshift({
              id: uid('com'),
              targetType: 'مستأجر',
              targetId: inst.tenantId,
              targetName: tenant?.nameAr || '—',
              channel: ch === 'بريد إلكتروني' ? 'بريد إلكتروني' : 'رسالة نصية / واتساب',
              templateUsed: rule.nameAr,
              language: 'ar',
              summary: `[${ch}] ${msg}`,
              sentBy: user.id,
              createdAt: nowIso,
            });
          }
        }
        rule.lastRunAt = nowIso;
      }
    }

    if (this.state.reminderLogs.length > 200) {
      this.state.reminderLogs = this.state.reminderLogs.slice(0, 200);
    }

    if (createdLogs.length > 0) {
      this.addAudit(
        user,
        'تشغيل جدولة تنبيهات الإيجار',
        'ReminderScheduler',
        opts?.contractId || 'all',
        `تم إرسال ${createdLogs.length} تنبيه استحقاق إيجار تلقائي للمستأجرين`,
        { deviceName }
      );
      this.addNotification(
        `إرسال ${createdLogs.length} تنبيه استحقاق إيجار`,
        `Dispatched ${createdLogs.length} rent reminders`,
        `تم توثيق تنبيهات الإيجار المجدولة عبر البريد / SMS / واتساب في سجل التواصل.`,
        `Automated rent reminders recorded in communication logs.`,
        'مالية',
        ['gm', 'accountant', 'leasing'],
        'leasing'
      );
    }
    this.persist();
    return createdLogs;
  }

  // 10. Multi-Company & Settings Management
  public createCompany(userId: string, input: Omit<CompanyProfile, 'id'>, deviceName?: string): CompanyProfile {
    const user = this.assertPermission(userId, 'manage_users');
    if (!this.state.companies) this.state.companies = [];
    const comp: CompanyProfile = {
      ...input,
      id: uid('comp'),
    };
    this.state.companies.push(comp);
    this.addAudit(user, 'إضافة شركة عقارية', 'CompanyProfile', comp.id, `إضافة الشركة ${comp.nameAr} (سجل: ${comp.crNumber})`, {
      deviceName,
    });
    this.persist();
    return comp;
  }

  public updateSettings(userId: string, patch: Partial<CompanySettings>, deviceName?: string): CompanySettings {
    const user = this.assertPermission(userId, 'manage_users');
    const prev = this.state.settings;
    this.state.settings = {
      ...prev,
      ...patch,
      currencyRatesToSar: {
        ...RATES_TO_SAR,
        ...(prev.currencyRatesToSar || {}),
        ...(patch.currencyRatesToSar || {}),
      },
      receiptBranding: patch.receiptBranding
        ? { ...(prev.receiptBranding || {}), ...patch.receiptBranding } as CompanySettings['receiptBranding']
        : prev.receiptBranding,
      generalPrefs: patch.generalPrefs
        ? { ...(prev.generalPrefs || {}), ...patch.generalPrefs } as CompanySettings['generalPrefs']
        : prev.generalPrefs,
      securityCenter: patch.securityCenter
        ? { ...(prev.securityCenter || {}), ...patch.securityCenter } as CompanySettings['securityCenter']
        : prev.securityCenter,
      notificationsCenter: patch.notificationsCenter
        ? { ...(prev.notificationsCenter || {}), ...patch.notificationsCenter } as CompanySettings['notificationsCenter']
        : prev.notificationsCenter,
      printShare: patch.printShare
        ? { ...(prev.printShare || {}), ...patch.printShare } as CompanySettings['printShare']
        : prev.printShare,
      backupPolicy: patch.backupPolicy
        ? { ...(prev.backupPolicy || {}), ...patch.backupPolicy } as CompanySettings['backupPolicy']
        : prev.backupPolicy,
      syncCenter: patch.syncCenter
        ? { ...(prev.syncCenter || {}), ...patch.syncCenter } as CompanySettings['syncCenter']
        : prev.syncCenter,
      developerCenter: patch.developerCenter
        ? { ...(prev.developerCenter || {}), ...patch.developerCenter } as CompanySettings['developerCenter']
        : prev.developerCenter,
    };

    const defaultComp = (this.state.companies || []).find((c) => c.isDefault) || this.state.companies?.[0];
    if (defaultComp) {
      if (patch.nameAr) defaultComp.nameAr = patch.nameAr;
      if (patch.nameEn) defaultComp.nameEn = patch.nameEn;
      if (patch.crNumber) defaultComp.crNumber = patch.crNumber;
      if (patch.vatNumber) defaultComp.vatNumber = patch.vatNumber;
      if (patch.city) defaultComp.city = patch.city;
      if (patch.address) defaultComp.address = patch.address;
      if (patch.phone) defaultComp.phone = patch.phone;
      if (patch.email) defaultComp.email = patch.email;
      if (patch.logoDataUrl !== undefined) defaultComp.logoDataUrl = patch.logoDataUrl;
    }

    if (patch.securityCenter?.autoLockTiming && this.state.securityPolicy) {
      const minsMap: Record<string, number> = { immediate: 0, '1m': 1, '5m': 5, '15m': 15, '30m': 30 };
      if (patch.securityCenter.autoLockTiming in minsMap) {
        this.state.securityPolicy.autoLockMinutes = minsMap[patch.securityCenter.autoLockTiming];
      }
    }

    this.addAudit(
      user,
      'تحديث إعدادات النظام والمركز',
      'CompanySettings',
      'settings',
      `تحديث إعدادات المنشأة والعملة الأساسية (${this.state.settings.baseCurrency || 'SAR'})`,
      { deviceName }
    );
    this.persist();
    return this.state.settings;
  }

  // 11. Document Archive Access Log & OCR Attachment
  public recordDocumentAccess(
    userId: string,
    docId: string,
    action: DocumentAccessEntry['action'],
    deviceName?: string
  ): DocumentRecord {
    const user = this.getActingUser(userId);
    const doc = this.state.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('المستند غير موجود');
    if (!doc.accessLog) doc.accessLog = [];
    const entry: DocumentAccessEntry = {
      id: uid('dacc'),
      userId: user.id,
      userName: user.nameAr,
      deviceName: deviceName || user.deviceName,
      action,
      accessedAt: new Date().toISOString(),
    };
    doc.accessLog.unshift(entry);
    if (doc.accessLog.length > 50) doc.accessLog = doc.accessLog.slice(0, 50);
    this.addAudit(user, `${action} مستند`, 'Document', doc.id, `${action} المستند "${doc.title}"`, { deviceName });
    this.persist();
    return doc;
  }

  public attachDocumentOcr(
    userId: string,
    docId: string,
    ocrExtracted: OcrExtractedData,
    ocrRawText: string,
    deviceName?: string
  ): DocumentRecord {
    const user = this.assertPermission(userId, 'manage_documents');
    const doc = this.state.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('المستند غير موجود');
    doc.ocrStatus = 'تم الاستخراج آلياً';
    doc.ocrExtracted = ocrExtracted;
    doc.ocrRawText = ocrRawText;
    if (!doc.expiryDate && ocrExtracted.expiryDate) {
      doc.expiryDate = ocrExtracted.expiryDate;
    }
    this.recordDocumentAccess(user.id, doc.id, 'تحليل OCR', deviceName);
    this.persist();
    return doc;
  }

  // 12. Owner Payout Transfers (تحويل مستحقات الملاك + قيد محاسبي متوازن)
  public recordOwnerTransfer(
    userId: string,
    ownerId: string,
    input: {
      amount: number;
      currency?: CurrencyCode;
      paymentMethod?: PaymentMethod;
      referenceNumber?: string;
      notes?: string;
    },
    deviceName?: string
  ) {
    return this.runTransaction(() => {
    const user = this.assertPermission(userId, 'manage_accounting');
    const owner = this.state.owners.find((o) => o.id === ownerId);
    if (!owner) throw new Error('المالك غير موجود');
    if (!input.amount || input.amount <= 0) throw new Error('يجب إدخال مبلغ تحويل أكبر من صفر');

    const curr: CurrencyCode = input.currency || 'SAR';
    const amountSar = toSar(input.amount, curr, this.state.settings.currencyRatesToSar);

    owner.totalTransferred = Math.round((owner.totalTransferred + amountSar) * 100) / 100;

    const cashAccountId = input.paymentMethod === 'نقدي' ? 'acc-1010' : 'acc-1020';
    const cashAcc = this.state.accounts.find((a) => a.id === cashAccountId) || this.state.accounts[0];
    const payableAcc = this.state.accounts.find((a) => a.id === 'acc-2200');

    if (cashAcc) cashAcc.balance = Math.round((cashAcc.balance - amountSar) * 100) / 100;
    if (payableAcc) payableAcc.balance = Math.round((payableAcc.balance - amountSar) * 100) / 100;

    this.state.counters.journal += 1;
    const journal: JournalEntry = {
      id: uid('jrn'),
      entryNumber: `JRN-2026-${pad4(this.state.counters.journal)}`,
      date: new Date().toISOString().slice(0, 10),
      description: `تحويل مستحقات للمالك ${owner.nameAr} (${input.paymentMethod || 'تحويل بنكي'}${input.referenceNumber ? ` · مرجع ${input.referenceNumber}` : ''})${input.notes ? ` - ${input.notes}` : ''}`,
      referenceType: 'تحويل مالك',
      referenceId: owner.id,
      ownerId: owner.id,
      createdBy: user.id,
      lines: [
        { accountId: 'acc-2200', accountName: payableAcc?.nameAr || 'مستحقات الملاك', debit: amountSar, credit: 0 },
        { accountId: cashAcc.id, accountName: cashAcc.nameAr, debit: 0, credit: amountSar },
      ],
    };
    this.state.journals.unshift(journal);

    this.addAudit(
      user,
      'تحويل مستحقات مالك',
      'Owner',
      owner.id,
      `تحويل مبلغ ${input.amount.toLocaleString()} ${currencyLabelAr(curr)} (${amountSar.toLocaleString()} ر.س) للمالك ${owner.nameAr}`,
      { deviceName, newValue: `${amountSar} ر.س` }
    );
    this.addNotification(
      `تحويل مستحقات للمالك ${owner.nameAr}`,
      `Payout transferred to ${owner.nameEn}`,
      `تم تسجيل تحويل مالي بقيمة ${input.amount.toLocaleString()} ${currencyLabelAr(curr)} وتحديث كشف حساب المالك.`,
      `Transferred ${input.amount.toLocaleString()} ${curr} to owner account.`,
      'مالية',
      ['gm', 'accountant', 'owner'],
      'accounting'
    );
    this.persist();
    return { owner, journal };
    });
  }

  // 13. Fast Contract Renewal (التجديد دون تكرار الإدخال)
  public renewContract(
    userId: string,
    contractId: string,
    input: {
      startDate: string;
      endDate: string;
      annualRent: number;
      currency?: CurrencyCode;
      paymentFrequency: LeaseContract['paymentFrequency'];
      ejarNumber?: string;
      notes?: string;
    },
    deviceName?: string
  ): { contract: LeaseContract; installments: Installment[] } {
    return this.runTransaction(() => {
    const user = this.assertPermission(userId, 'manage_contracts');
    const prev = this.contractIndex.get(contractId) || this.state.contracts.find((c) => c.id === contractId);
    if (!prev) throw new Error('العقد الأساسي غير موجود');

    if (prev.lifecycleStatus === 'نشط' || prev.lifecycleStatus === 'بانتظار التجديد') {
      prev.lifecycleStatus = 'منتهي';
    }

    const freqMap: Record<LeaseContract['paymentFrequency'], number> = {
      شهري: 12,
      'ربع سنوي': 4,
      'نصف سنوي': 2,
      سنوي: 1,
    };
    const count = freqMap[input.paymentFrequency] || 2;
    this.state.counters.contract += 1;
    const contractCurrency: CurrencyCode = input.currency || prev.currency || 'SAR';

    const renewed: LeaseContract = {
      id: uid('ctr'),
      internalNumber: `CNT-2026-${pad3(this.state.counters.contract)}`,
      ejarNumber: input.ejarNumber || '',
      ejarStatus: input.ejarNumber ? 'موثق في إيجار' : 'قيد التوثيق',
      lifecycleStatus: 'نشط',
      propertyId: prev.propertyId,
      unitId: prev.unitId,
      tenantId: prev.tenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      annualRent: input.annualRent,
      currency: contractCurrency,
      paymentFrequency: input.paymentFrequency,
      installmentsCount: count,
      securityDeposit: prev.securityDeposit,
      officeFee: 0,
      managementCommissionPercent: prev.managementCommissionPercent,
      includedServices: prev.includedServices,
      version: prev.version + 1,
      renewedFromContractId: prev.id,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      notes: input.notes || `تجديد مباشر للعقد ${prev.internalNumber}`,
    };
    this.state.contracts.unshift(renewed);

    const start = new Date(renewed.startDate);
    const perInst = Math.round((renewed.annualRent / count) * 100) / 100;
    const createdInstallments: Installment[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < count; i++) {
      const due = new Date(start);
      due.setMonth(due.getMonth() + i * (12 / count));
      const dueStr = due.toISOString().slice(0, 10);
      const amt = i === count - 1 ? Math.round((renewed.annualRent - perInst * (count - 1)) * 100) / 100 : perInst;
      const inst: Installment = {
        id: uid('inst'),
        contractId: renewed.id,
        unitId: renewed.unitId,
        propertyId: renewed.propertyId,
        tenantId: renewed.tenantId,
        installmentNumber: i + 1,
        dueDate: dueStr,
        amount: amt,
        paidAmount: 0,
        remainingAmount: amt,
        currency: contractCurrency,
        status: dueStr < todayStr ? 'متأخرة' : dueStr === todayStr ? 'مستحقة اليوم' : 'لم تستحق',
      };
      this.state.installments.push(inst);
      createdInstallments.push(inst);
    }

    const unit = this.state.units.find((u) => u.id === renewed.unitId);
    if (unit) unit.status = 'مؤجرة';

    this.addAudit(
      user,
      'تجديد عقد إيجار',
      'LeaseContract',
      renewed.id,
      `تجديد العقد ${prev.internalNumber} إلى ${renewed.internalNumber} (إصدار v${renewed.version}) بقيمة ${renewed.annualRent.toLocaleString()} ${currencyLabelAr(contractCurrency)}`,
      { deviceName, oldValue: prev.internalNumber, newValue: renewed.internalNumber }
    );
    this.persist();
    return { contract: renewed, installments: createdInstallments };
    });
  }

  // 14. Purchase Orders & Contractor Quotes
  public createPurchaseOrder(
    userId: string,
    input: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdBy' | 'createdAt'>,
    deviceName?: string
  ): PurchaseOrder {
    const user = this.assertPermission(userId, 'manage_maintenance');
    if (!this.state.purchaseOrders) this.state.purchaseOrders = [];
    const po: PurchaseOrder = {
      ...input,
      id: uid('po'),
      poNumber: `PO-2026-${pad3(this.state.purchaseOrders.length + 1)}`,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };
    this.state.purchaseOrders.unshift(po);
    this.addAudit(user, 'إنشاء طلب شراء ومقارنة عروض', 'PurchaseOrder', po.id, `إنشاء ${po.poNumber}: ${po.title}`, {
      deviceName,
    });
    this.persist();
    return po;
  }

  public updatePurchaseOrder(
    userId: string,
    poId: string,
    patch: Partial<Pick<PurchaseOrder, 'status' | 'selectedVendorId' | 'approvedAmount' | 'quotes'>>,
    deviceName?: string
  ): PurchaseOrder {
    const user = this.getActingUser(userId);
    if (!this.state.purchaseOrders) this.state.purchaseOrders = [];
    const po = this.state.purchaseOrders.find((p) => p.id === poId);
    if (!po) throw new Error('طلب الشراء غير موجود');

    if (patch.status) po.status = patch.status;
    if (patch.selectedVendorId) po.selectedVendorId = patch.selectedVendorId;
    if (typeof patch.approvedAmount === 'number') po.approvedAmount = patch.approvedAmount;
    if (patch.quotes) po.quotes = patch.quotes;
    if (patch.status === 'معتمد' || patch.status === 'أمر شراء') {
      po.approvedBy = user.id;
    }

    this.addAudit(user, 'تحديث طلب شراء', 'PurchaseOrder', po.id, `تحديث ${po.poNumber} إلى الحالة: ${po.status}`, {
      deviceName,
      newValue: po.status,
    });
    this.persist();
    return po;
  }

  // 15. Executive Decisions Log
  public createDecision(
    userId: string,
    input: Omit<ExecutiveDecision, 'id' | 'decisionNumber' | 'issuedBy' | 'issuedByName' | 'createdAt'>,
    deviceName?: string
  ): ExecutiveDecision {
    const user = this.assertPermission(userId, 'manage_users');
    if (!this.state.decisions) this.state.decisions = [];
    const dec: ExecutiveDecision = {
      ...input,
      id: uid('dec'),
      decisionNumber: `DEC-2026-${pad3(this.state.decisions.length + 14)}`,
      issuedBy: user.id,
      issuedByName: user.nameAr,
      createdAt: new Date().toISOString(),
    };
    this.state.decisions.unshift(dec);
    this.addAudit(user, 'إصدار قرار إداري', 'ExecutiveDecision', dec.id, `${dec.decisionNumber}: ${dec.title}`, {
      deviceName,
    });
    this.addNotification(
      `قرار إداري جديد: ${dec.title}`,
      `New Executive Decision: ${dec.title}`,
      dec.summary,
      dec.summary,
      'إدارية',
      ['gm', 'accountant', 'leasing', 'supervisor', 'technician'],
      'admin'
    );
    this.persist();
    return dec;
  }

  // 16. Tenant Onboarding Policy Checklist
  public updateTenantChecklist(
    userId: string,
    tenantId: string,
    checklist: TenantOnboardingChecklist,
    deviceName?: string
  ): Tenant {
    const user = this.assertPermission(userId, 'manage_tenants');
    const tenant = this.state.tenants.find((t) => t.id === tenantId);
    if (!tenant) throw new Error('المستأجر غير موجود');
    tenant.onboardingChecklist = checklist;
    const completedCount = Object.values(checklist).filter(Boolean).length;
    this.addAudit(
      user,
      'تحديث قائمة سياسة التسكين',
      'Tenant',
      tenant.id,
      `اكتمال ${completedCount}/6 بنود تسكين للمستأجر ${tenant.nameAr}`,
      { deviceName }
    );
    this.persist();
    return tenant;
  }

  // 17. Bulk Excel/CSV Import (Units & Tenants)
  public bulkImportRecords(
    userId: string,
    type: 'units' | 'tenants',
    rows: Record<string, unknown>[],
    deviceName?: string
  ): { inserted: number; skipped: number } {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('الملف لا يحتوي على صفوف صالحة للاستيراد');
    }
    let inserted = 0;
    let skipped = 0;

    if (type === 'tenants') {
      const user = this.assertPermission(userId, 'manage_tenants');
      for (const r of rows) {
        const nameAr = String(r.nameAr || r['الاسم'] || r['اسم المستأجر'] || '').trim();
        const nationalIdOrIqama = String(r.nationalIdOrIqama || r['رقم الهوية'] || r['الهوية'] || '').trim();
        const phone = String(r.phone || r['الجوال'] || r['رقم الجوال'] || '').trim();
        if (!nameAr || !nationalIdOrIqama) {
          skipped += 1;
          continue;
        }
        const exists = this.state.tenants.some((t) => t.nationalIdOrIqama === nationalIdOrIqama);
        if (exists) {
          skipped += 1;
          continue;
        }
        this.state.tenants.push({
          id: uid('ten'),
          nameAr,
          nameEn: String(r.nameEn || r['الاسم بالإنجليزية'] || nameAr),
          nationalIdOrIqama,
          nationality: String(r.nationality || r['الجنسية'] || 'سعودي'),
          phone: phone || '0500000000',
          email: String(r.email || r['البريد'] || ''),
          employer: String(r.employer || r['جهة العمل'] || ''),
          classification: 'محتمل',
          rating: 4,
          onboardingChecklist: {
            idVerified: false,
            docsArchived: false,
            depositPaid: false,
            contractSigned: false,
            ejarRegistered: false,
            handoverSigned: false,
          },
          createdAt: new Date().toISOString(),
        });
        inserted += 1;
      }
      this.addAudit(
        user,
        'استيراد جماعي للمستأجرين من Excel',
        'Tenant',
        'bulk',
        `تم استيراد ${inserted} مستأجر وتخطي ${skipped} صف مكرر أو ناقص`,
        { deviceName }
      );
    } else {
      const user = this.assertPermission(userId, 'manage_properties');
      const fallbackPropId = this.state.properties[0]?.id;
      for (const r of rows) {
        const unitNumber = String(r.unitNumber || r['رقم الوحدة'] || r['الوحدة'] || '').trim();
        const propNameOrId = String(r.propertyId || r['العقار'] || '').trim();
        const prop =
          this.state.properties.find((p) => p.id === propNameOrId || p.nameAr === propNameOrId) ||
          this.state.properties.find((p) => p.id === fallbackPropId);
        if (!unitNumber || !prop) {
          skipped += 1;
          continue;
        }
        const exists = this.state.units.some((u) => u.propertyId === prop.id && u.unitNumber === unitNumber);
        if (exists) {
          skipped += 1;
          continue;
        }
        const annual = Number(r.suggestedAnnualRent || r['الإيجار السنوي'] || 36000) || 36000;
        this.state.units.push({
          id: uid('unit'),
          propertyId: prop.id,
          buildingName: String(r.buildingName || r['المبنى'] || 'المبنى الرئيسي'),
          floor: Number(r.floor || r['الدور'] || 1) || 1,
          unitNumber,
          unitType: (String(r.unitType || r['النوع'] || 'شقة') as Unit['unitType']),
          areaSqm: Number(r.areaSqm || r['المساحة'] || 120) || 120,
          rooms: Number(r.rooms || r['الغرف'] || 3) || 3,
          bathrooms: Number(r.bathrooms || r['دورات المياه'] || 2) || 2,
          furnished: Boolean(r.furnished),
          acCount: Number(r.acCount || 3) || 3,
          electricityMeter: String(r.electricityMeter || r['عداد الكهرباء'] || ''),
          waterMeter: String(r.waterMeter || r['عداد المياه'] || ''),
          keyCount: 3,
          acRemoteCount: 3,
          suggestedMonthlyRent: Math.round(annual / 12),
          suggestedAnnualRent: annual,
          officeFee: 1000,
          status: 'شاغرة',
        });
        inserted += 1;
      }
      this.addAudit(
        user,
        'استيراد جماعي للوحدات من Excel',
        'Unit',
        'bulk',
        `تم استيراد ${inserted} وحدة وتخطي ${skipped} صف مكرر أو ناقص`,
        { deviceName }
      );
    }

    this.persist();
    return { inserted, skipped };
  }

  // 18. Gemini OCR Entity Matching & Automatic Field Sync (Tenants & Properties)
  public findOcrEntityMatches(extracted: OcrExtractedData): OcrEntityMatchResult {
    const cleanDigits = (s?: string) => (s || '').replace(/\D+/g, '');
    const norm = (s?: string) => (s || '').trim().toLowerCase();

    const idDigits = cleanDigits(extracted.nationalIdOrIqama);
    const phoneDigits = cleanDigits(extracted.phone);
    const tenantNameNorm = norm(extracted.tenantNameAr);

    let matchedTenant: Tenant | undefined;
    let tenantReason = '';
    if (idDigits.length >= 6) {
      matchedTenant = this.state.tenants.find((t) => cleanDigits(t.nationalIdOrIqama) === idDigits);
      if (matchedTenant) tenantReason = 'مطابقة رقم الهوية / الإقامة';
    }
    if (!matchedTenant && phoneDigits.length >= 8) {
      matchedTenant = this.state.tenants.find((t) => cleanDigits(t.phone).endsWith(phoneDigits.slice(-9)));
      if (matchedTenant) tenantReason = 'مطابقة رقم الجوال';
    }
    if (!matchedTenant && tenantNameNorm.length >= 4) {
      matchedTenant = this.state.tenants.find(
        (t) => norm(t.nameAr) === tenantNameNorm || norm(t.nameAr).includes(tenantNameNorm) || tenantNameNorm.includes(norm(t.nameAr))
      );
      if (matchedTenant) tenantReason = 'مطابقة الاسم بالعربية';
    }

    const tenantFieldsToUpdate: string[] = [];
    if (matchedTenant) {
      if (extracted.tenantNameAr && extracted.tenantNameAr.trim() && matchedTenant.nameAr !== extracted.tenantNameAr.trim()) {
        tenantFieldsToUpdate.push('الاسم بالعربية');
      }
      if (extracted.tenantNameEn && extracted.tenantNameEn.trim() && (!matchedTenant.nameEn || matchedTenant.nameEn === matchedTenant.nameAr)) {
        tenantFieldsToUpdate.push('الاسم بالإنجليزية');
      }
      if (extracted.nationalIdOrIqama && !matchedTenant.nationalIdOrIqama) {
        tenantFieldsToUpdate.push('رقم الهوية/الإقامة');
      }
      if (extracted.nationality && extracted.nationality.trim() && !matchedTenant.nationality) {
        tenantFieldsToUpdate.push('الجنسية');
      }
      if (extracted.phone && (!matchedTenant.phone || matchedTenant.phone === '0500000000')) {
        tenantFieldsToUpdate.push('رقم الجوال');
      }
      if (extracted.email && !matchedTenant.email) {
        tenantFieldsToUpdate.push('البريد الإلكتروني');
      }
      if (extracted.employer && !matchedTenant.employer) {
        tenantFieldsToUpdate.push('جهة العمل');
      }
    }

    const deedDigits = cleanDigits(extracted.deedNumber);
    const propNameNorm = norm(extracted.propertyNameAr || extracted.buildingName);
    let matchedProperty: Property | undefined;
    let propertyReason = '';

    if (deedDigits.length >= 4) {
      matchedProperty = this.state.properties.find((p) => cleanDigits(p.deedNumber) === deedDigits);
      if (matchedProperty) propertyReason = 'مطابقة رقم الصك';
    }
    if (!matchedProperty && propNameNorm.length >= 3) {
      matchedProperty = this.state.properties.find(
        (p) => norm(p.nameAr) === propNameNorm || norm(p.nameAr).includes(propNameNorm) || propNameNorm.includes(norm(p.nameAr))
      );
      if (matchedProperty) propertyReason = 'مطابقة اسم العقار';
    }

    const propertyFieldsToUpdate: string[] = [];
    if (matchedProperty) {
      if (extracted.deedNumber && !matchedProperty.deedNumber) propertyFieldsToUpdate.push('رقم الصك');
      if (extracted.city && !matchedProperty.city) propertyFieldsToUpdate.push('المدينة');
      if (extracted.district && !matchedProperty.district) propertyFieldsToUpdate.push('الحي');
      if (extracted.street && !matchedProperty.street) propertyFieldsToUpdate.push('الشارع');
      if (extracted.nationalAddress && !matchedProperty.nationalAddress) propertyFieldsToUpdate.push('العنوان الوطني');
    }

    let matchedUnit: Unit | undefined;
    if (extracted.unitNumber) {
      const unitNumNorm = norm(extracted.unitNumber);
      matchedUnit = this.state.units.find(
        (u) => (!matchedProperty || u.propertyId === matchedProperty.id) && norm(u.unitNumber) === unitNumNorm
      );
    }

    const hasTenantData = Boolean(extracted.tenantNameAr || extracted.nationalIdOrIqama);
    const hasPropertyData = Boolean(extracted.propertyNameAr || extracted.deedNumber);

    return {
      matchedTenant: matchedTenant
        ? {
            id: matchedTenant.id,
            nameAr: matchedTenant.nameAr,
            nationalIdOrIqama: matchedTenant.nationalIdOrIqama,
            matchReason: tenantReason,
            fieldsToUpdate: tenantFieldsToUpdate,
          }
        : undefined,
      matchedProperty: matchedProperty
        ? {
            id: matchedProperty.id,
            nameAr: matchedProperty.nameAr,
            deedNumber: matchedProperty.deedNumber,
            matchReason: propertyReason,
            fieldsToUpdate: propertyFieldsToUpdate,
          }
        : undefined,
      matchedUnit: matchedUnit
        ? {
            id: matchedUnit.id,
            unitNumber: matchedUnit.unitNumber,
            propertyId: matchedUnit.propertyId,
          }
        : undefined,
      suggestedTenantAction: matchedTenant ? 'update' : hasTenantData ? 'create' : 'none',
      suggestedPropertyAction: matchedProperty ? 'update' : hasPropertyData ? 'create' : 'none',
    };
  }

  public syncOcrToEntities(
    userId: string,
    input: {
      extracted: OcrExtractedData;
      docId?: string;
      targetTenantId?: string;
      targetPropertyId?: string;
      applyTenant?: boolean;
      applyProperty?: boolean;
      createMissing?: boolean;
    },
    deviceName?: string
  ): {
    summary: OcrSyncSummary;
    tenant?: Tenant;
    property?: Property;
    doc?: DocumentRecord;
  } {
    const user = this.assertPermission(userId, 'manage_documents');
    const extracted = input.extracted;
    const matches = this.findOcrEntityMatches(extracted);
    const summary: OcrSyncSummary = {
      tenantAction: 'skipped',
      tenantUpdatedFields: [],
      propertyAction: 'skipped',
      propertyUpdatedFields: [],
    };

    let linkedTenant: Tenant | undefined;
    let linkedProperty: Property | undefined;

    // 1. Sync Tenant Fields (from National ID / Iqama / Lease Contract)
    if (input.applyTenant !== false) {
      const targetId = input.targetTenantId || matches.matchedTenant?.id;
      if (targetId) {
        const tenant = this.state.tenants.find((t) => t.id === targetId);
        if (tenant) {
          const updatedFields: string[] = [];
          if (extracted.tenantNameAr?.trim() && (!tenant.nameAr || tenant.nameAr.length < 3)) {
            tenant.nameAr = extracted.tenantNameAr.trim();
            updatedFields.push('nameAr');
          }
          if (extracted.tenantNameEn?.trim() && (!tenant.nameEn || tenant.nameEn === tenant.nameAr)) {
            tenant.nameEn = extracted.tenantNameEn.trim();
            updatedFields.push('nameEn');
          }
          if (extracted.nationalIdOrIqama?.trim() && !tenant.nationalIdOrIqama) {
            tenant.nationalIdOrIqama = extracted.nationalIdOrIqama.trim();
            updatedFields.push('nationalIdOrIqama');
          }
          if (extracted.nationality?.trim() && (!tenant.nationality || tenant.nationality === 'غير محدد')) {
            tenant.nationality = extracted.nationality.trim();
            updatedFields.push('nationality');
          }
          if (extracted.phone?.trim() && (!tenant.phone || tenant.phone === '0500000000')) {
            tenant.phone = extracted.phone.trim();
            updatedFields.push('phone');
          }
          if (extracted.email?.trim() && !tenant.email) {
            tenant.email = extracted.email.trim();
            updatedFields.push('email');
          }
          if (extracted.employer?.trim() && !tenant.employer) {
            tenant.employer = extracted.employer.trim();
            updatedFields.push('employer');
          }
          if (!tenant.onboardingChecklist) {
            tenant.onboardingChecklist = {
              idVerified: false,
              docsArchived: false,
              depositPaid: false,
              contractSigned: false,
              ejarRegistered: false,
              handoverSigned: false,
            };
          }
          if (extracted.docType === 'هوية / إقامة' || extracted.nationalIdOrIqama) {
            tenant.onboardingChecklist.idVerified = true;
            updatedFields.push('idVerified');
          }
          tenant.onboardingChecklist.docsArchived = true;
          linkedTenant = tenant;
          summary.tenantAction = 'updated';
          summary.tenantId = tenant.id;
          summary.tenantName = tenant.nameAr;
          summary.tenantUpdatedFields = updatedFields;
          this.addAudit(
            user,
            'تحديث بيانات مستأجر آلياً من OCR',
            'Tenant',
            tenant.id,
            `ربط نتائج Gemini OCR بملف المستأجر ${tenant.nameAr} (${updatedFields.join(', ') || 'تأكيد الهوية والأرشفة'})`,
            { deviceName }
          );
        }
      } else if (
        input.createMissing !== false &&
        (extracted.tenantNameAr || extracted.nationalIdOrIqama) &&
        this.userHasPermission(user, 'manage_tenants')
      ) {
        const tenant = this.createTenant(
          userId,
          {
            nameAr: extracted.tenantNameAr?.trim() || `مستأجر ${extracted.nationalIdOrIqama}`,
            nameEn: extracted.tenantNameEn?.trim() || extracted.tenantNameAr?.trim() || '',
            nationalIdOrIqama: extracted.nationalIdOrIqama?.trim() || `TMP-${Date.now().toString().slice(-6)}`,
            nationality: extracted.nationality?.trim() || 'سعودي',
            phone: extracted.phone?.trim() || '0500000000',
            email: extracted.email?.trim() || '',
            employer: extracted.employer?.trim() || '',
            classification: extracted.docType === 'عقد إيجار' ? 'نشط' : 'محتمل',
            rating: 4,
            onboardingChecklist: {
              idVerified: Boolean(extracted.nationalIdOrIqama),
              docsArchived: true,
              depositPaid: false,
              contractSigned: extracted.docType === 'عقد إيجار',
              ejarRegistered: Boolean(extracted.ejarNumber),
              handoverSigned: false,
            },
            notes: `تم إنشاؤه وربط حقوله آلياً عبر Gemini OCR (${extracted.docType})`,
          },
          deviceName
        );
        linkedTenant = tenant;
        summary.tenantAction = 'created';
        summary.tenantId = tenant.id;
        summary.tenantName = tenant.nameAr;
        summary.tenantUpdatedFields = ['nameAr', 'nationalIdOrIqama', 'nationality', 'phone', 'employer'];
      }
    }

    // 2. Sync Property Fields (from Deed / Lease Contract)
    if (input.applyProperty !== false) {
      const targetPropId = input.targetPropertyId || matches.matchedProperty?.id;
      if (targetPropId) {
        const prop = this.state.properties.find((p) => p.id === targetPropId);
        if (prop) {
          const updatedFields: string[] = [];
          if (extracted.deedNumber?.trim() && !prop.deedNumber) {
            prop.deedNumber = extracted.deedNumber.trim();
            updatedFields.push('deedNumber');
          }
          if (extracted.city?.trim() && (!prop.city || prop.city === 'غير محدد')) {
            prop.city = extracted.city.trim();
            updatedFields.push('city');
          }
          if (extracted.district?.trim() && (!prop.district || prop.district === 'غير محدد')) {
            prop.district = extracted.district.trim();
            updatedFields.push('district');
          }
          if (extracted.street?.trim() && !prop.street) {
            prop.street = extracted.street.trim();
            updatedFields.push('street');
          }
          if (extracted.nationalAddress?.trim() && !prop.nationalAddress) {
            prop.nationalAddress = extracted.nationalAddress.trim();
            updatedFields.push('nationalAddress');
          }
          linkedProperty = prop;
          summary.propertyAction = 'updated';
          summary.propertyId = prop.id;
          summary.propertyName = prop.nameAr;
          summary.propertyUpdatedFields = updatedFields;
          this.addAudit(
            user,
            'تحديث بيانات عقار آلياً من OCR',
            'Property',
            prop.id,
            `ربط نتائج Gemini OCR بالعقار ${prop.nameAr} (${updatedFields.join(', ') || 'تحقق الصك والموقع'})`,
            { deviceName }
          );
        }
      } else if (
        input.createMissing !== false &&
        (extracted.propertyNameAr || extracted.deedNumber) &&
        this.userHasPermission(user, 'manage_properties')
      ) {
        const propName = extracted.propertyNameAr?.trim() || extracted.buildingName?.trim() || `عقار صك ${extracted.deedNumber}`;
        const prop = this.createProperty(
          userId,
          {
            companyId: this.state.companies?.[0]?.id,
            ownershipMode: 'إدارة للغير',
            code: `PRP-OCR-${Math.floor(100 + Math.random() * 899)}`,
            nameAr: propName,
            nameEn: propName,
            city: extracted.city?.trim() || 'الرياض',
            district: extracted.district?.trim() || 'غير محدد',
            street: extracted.street?.trim() || '',
            nationalAddress: extracted.nationalAddress?.trim() || '',
            type: 'سكني',
            deedNumber: extracted.deedNumber?.trim() || '',
            status: 'نشط',
            buildingsCount: 1,
            floorsCount: 3,
            managementFeePercent: this.state.settings.defaultManagementFeePercent || 5,
            ownerShares: this.state.owners[0] ? [{ ownerId: this.state.owners[0].id, sharePercent: 100 }] : [],
            electricityMeterMain: '',
            waterMeterMain: '',
            caretakerName: '',
            caretakerPhone: '',
          },
          deviceName
        );
        linkedProperty = prop;
        summary.propertyAction = 'created';
        summary.propertyId = prop.id;
        summary.propertyName = prop.nameAr;
        summary.propertyUpdatedFields = ['nameAr', 'deedNumber', 'city', 'district', 'street', 'nationalAddress'];
      }
    }

    // 3. Link archived document record if docId provided
    let linkedDoc: DocumentRecord | undefined;
    if (input.docId) {
      const doc = this.state.documents.find((d) => d.id === input.docId);
      if (doc) {
        if (linkedTenant && (extracted.docType === 'هوية / إقامة' || !linkedProperty)) {
          doc.relatedType = 'مستأجر';
          doc.relatedId = linkedTenant.id;
        } else if (linkedProperty) {
          doc.relatedType = 'عقار';
          doc.relatedId = linkedProperty.id;
        }
        linkedDoc = doc;
      }
    }

    this.persist();
    return {
      summary,
      tenant: linkedTenant,
      property: linkedProperty,
      doc: linkedDoc,
    };
  }

  public resetToFreshWorkspace(userId: string, deviceName?: string): AqarDatabaseState {
    const user = this.assertPermission(userId, 'manage_properties');
    if (this.state.properties.length > 0 || this.state.payments.length > 0) {
      this.createBackup(userId, 'نسخة تلقائية قبل الإعداد الأولي', deviceName);
    }

    this.state.properties = [];
    this.state.units = [];
    this.state.tenants = [];
    this.state.leads = [];
    this.state.contracts = [];
    this.state.handovers = [];
    this.state.installments = [];
    this.state.payments = [];
    this.state.journals = [];
    this.state.expenses = [];
    this.state.assets = [];
    this.state.tickets = [];
    this.state.tasks = [];
    this.state.communications = [];
    this.state.documents = [];
    this.state.purchaseOrders = [];
    this.state.decisions = [];
    this.state.notifications = [];
    this.state.reminderLogs = [];
    this.state.accounts = this.state.accounts.map((acc) => ({ ...acc, balance: 0 }));
    this.state.counters = {
      receipt: 1,
      contract: 1,
      ticket: 1,
      expense: 1,
      journal: 1,
    };

    this.addAudit(
      user,
      'تهيئة مساحة عمل جديدة',
      'Workspace',
      'fresh-onboarding',
      'بدء مساحة عمل نظيفة عبر رحلة الإعداد الأولي',
      { deviceName }
    );
    this.state.archiveSeeded = true;
    this.persist();
    return this.getStateForUser(userId);
  }

  // 14. Smart Archive Center (Manual Archive, Restore with Conflict Check, Scheduled Job, Saved Filters)
  private assertArchiveAccess(user: StaffUser, category: ArchiveCategoryId, action: 'view' | 'write'): void {
    const allowedByRole: Record<RoleKey, ArchiveCategoryId[]> = {
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
    const allowed = allowedByRole[user.role] || [];
    if (!allowed.includes(category)) {
      throw new Error(`لا تملك صلاحية الوصول إلى قسم الأرشيف (${category})`);
    }
    if (action === 'write' && (user.role === 'owner' || user.role === 'auditor' || (user.role === 'leasing' && category !== 'tenants'))) {
      throw new Error('صلاحيتك في هذا القسم للعرض المرجعي فقط');
    }
  }

  public archiveEntity(
    userId: string,
    input: { category: ArchiveCategoryId; entityId: string; reason?: string; targetKind?: 'ticket' | 'task' },
    deviceName?: string
  ): { archivedAt: string; summary: string } {
    return this.runTransaction(() => {
      const user = this.getActingUser(userId);
      this.assertArchiveAccess(user, input.category, 'write');
      const now = new Date().toISOString();
      const reason = (input.reason || '').trim() || 'نقل يدوي للأرشيف الذكي';
      let summary = '';

      if (input.category === 'contracts') {
        const ctr = this.state.contracts.find((c) => c.id === input.entityId);
        if (!ctr) throw new Error('العقد غير موجود');
        ctr.preArchiveStatus = ctr.lifecycleStatus;
        if (ctr.lifecycleStatus === 'نشط' || ctr.lifecycleStatus === 'بانتظار التجديد' || ctr.lifecycleStatus === 'بانتظار التوثيق') {
          ctr.lifecycleStatus = 'منتهي';
          const unit = this.state.units.find((u) => u.id === ctr.unitId);
          if (unit && unit.status === 'مؤجرة') {
            unit.status = 'شاغرة';
            unit.vacantSince = now.slice(0, 10);
          }
        }
        ctr.archivedAt = now;
        ctr.archivedBy = user.id;
        ctr.archiveMode = 'يدوي';
        ctr.archiveReason = reason;
        summary = `أرشفة العقد ${ctr.internalNumber}`;
      } else if (input.category === 'tenants') {
        const ten = this.state.tenants.find((t) => t.id === input.entityId);
        if (!ten) throw new Error('المستأجر غير موجود');
        const hasActiveCtr = this.state.contracts.some(
          (c) => c.tenantId === ten.id && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التوثيق')
        );
        if (hasActiveCtr) throw new Error('لا يمكن أرشفة مستأجر لديه عقد نشط حالياً؛ قم بإنهاء أو أرشفة العقد أولاً');
        ten.preArchiveStatus = ten.classification;
        ten.classification = 'سابق';
        ten.archivedAt = now;
        ten.archivedBy = user.id;
        ten.archiveMode = 'يدوي';
        ten.archiveReason = reason;
        summary = `أرشفة المستأجر ${ten.nameAr}`;
      } else if (input.category === 'receipts') {
        const pay = this.state.payments.find((p) => p.id === input.entityId);
        if (!pay) throw new Error('الإيصال غير موجود');
        pay.preArchiveStatus = pay.status;
        pay.archivedAt = now;
        pay.archivedBy = user.id;
        pay.archiveMode = 'يدوي';
        pay.archiveReason = reason;
        summary = `أرشفة الإيصال ${pay.receiptNumber}`;
      } else if (input.category === 'tickets') {
        if (input.targetKind === 'task') {
          const tsk = this.state.tasks.find((t) => t.id === input.entityId);
          if (!tsk) throw new Error('المهمة غير موجودة');
          tsk.preArchiveStatus = tsk.status;
          tsk.status = 'مكتملة';
          tsk.archivedAt = now;
          tsk.archivedBy = user.id;
          tsk.archiveMode = 'يدوي';
          tsk.archiveReason = reason;
          summary = `أرشفة المهمة "${tsk.title}"`;
        } else {
          const tkt = this.state.tickets.find((t) => t.id === input.entityId);
          if (!tkt) throw new Error('البلاغ غير موجود');
          tkt.preArchiveStatus = tkt.status;
          if (tkt.status !== 'مكتمل' && tkt.status !== 'مغلق') tkt.status = 'مغلق';
          tkt.archivedAt = now;
          tkt.archivedBy = user.id;
          tkt.archiveMode = 'يدوي';
          tkt.archiveReason = reason;
          summary = `أرشفة بلاغ الصيانة ${tkt.ticketNumber}`;
        }
      } else if (input.category === 'documents') {
        const doc = this.state.documents.find((d) => d.id === input.entityId);
        if (!doc) throw new Error('المستند غير موجود');
        doc.preArchiveStatus = 'نشط';
        doc.archivedAt = now;
        doc.archivedBy = user.id;
        doc.archiveMode = 'يدوي';
        doc.archiveReason = reason;
        summary = `أرشفة المستند "${doc.title}"`;
      } else if (input.category === 'units') {
        const unit = this.state.units.find((u) => u.id === input.entityId);
        if (!unit) throw new Error('الوحدة غير موجودة');
        const hasActiveCtr = this.state.contracts.some(
          (c) => c.unitId === unit.id && (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التوثيق')
        );
        if (hasActiveCtr) throw new Error('لا يمكن إخراج وحدة مؤجرة بعقد نشط للأرشيف قبل إغلاق العقد');
        unit.preArchiveStatus = unit.status;
        unit.status = 'مؤرشفة';
        unit.archivedAt = now;
        unit.archivedBy = user.id;
        unit.archiveMode = 'يدوي';
        unit.archiveReason = reason;
        summary = `نقل الوحدة ${unit.unitNumber} إلى أرشيف الوحدات المتوقفة`;
      }

      this.addAudit(user, 'نقل إلى الأرشيف الذكي', input.category, input.entityId, `${summary} — السبب: ${reason}`, {
        reason,
        newValue: 'مؤرشف',
        deviceName,
      });
      this.persist();
      return { archivedAt: now, summary };
    });
  }

  public restoreArchivedEntity(
    userId: string,
    input: {
      category: ArchiveCategoryId;
      entityId: string;
      referenceOnly?: boolean;
      reason?: string;
      targetKind?: 'ticket' | 'task';
    },
    deviceName?: string
  ): { restoredSummary: string; referenceOnly: boolean } {
    return this.runTransaction(() => {
      const user = this.getActingUser(userId);
      this.assertArchiveAccess(user, input.category, 'write');
      const reason = (input.reason || '').trim() || 'استعادة من الأرشيف الذكي';
      let restoredSummary = '';
      let referenceOnly = Boolean(input.referenceOnly);

      if (input.category === 'contracts') {
        const ctr = this.state.contracts.find((c) => c.id === input.entityId);
        if (!ctr) throw new Error('العقد غير موجود');
        const conflictingActive = this.state.contracts.find(
          (c) =>
            c.id !== ctr.id &&
            c.unitId === ctr.unitId &&
            (c.lifecycleStatus === 'نشط' || c.lifecycleStatus === 'بانتظار التوثيق')
        );
        if (conflictingActive && !input.referenceOnly) {
          throw new Error(
            `CONFLICT_ACTIVE_CONTRACT: الوحدة مرتبطة حالياً بعقد أحدث (${conflictingActive.internalNumber}). يمكنك استعادته كسجل مرجعي فقط.`
          );
        }
        if (referenceOnly) {
          ctr.restoredAsReference = true;
          ctr.archivedAt = undefined;
          ctr.archiveReason = undefined;
          ctr.lifecycleStatus = 'منتهي';
          restoredSummary = `استعادة العقد ${ctr.internalNumber} كسجل مرجعي فقط`;
        } else {
          ctr.lifecycleStatus =
            ctr.preArchiveStatus === 'بانتظار التوثيق' || ctr.preArchiveStatus === 'نشط'
              ? (ctr.preArchiveStatus as LeaseContract['lifecycleStatus'])
              : 'بانتظار التجديد';
          ctr.archivedAt = undefined;
          ctr.archiveReason = undefined;
          ctr.restoredAsReference = false;
          const unit = this.state.units.find((u) => u.id === ctr.unitId);
          if (unit && ctr.lifecycleStatus === 'نشط') {
            unit.status = 'مؤجرة';
          }
          restoredSummary = `استعادة العقد ${ctr.internalNumber} إلى قائمة العقود (${ctr.lifecycleStatus})`;
        }
      } else if (input.category === 'tenants') {
        const ten = this.state.tenants.find((t) => t.id === input.entityId);
        if (!ten) throw new Error('المستأجر غير موجود');
        ten.classification = ten.preArchiveStatus === 'محتمل' ? 'محتمل' : 'نشط';
        ten.archivedAt = undefined;
        ten.archiveReason = undefined;
        restoredSummary = `استعادة ملف المستأجر ${ten.nameAr} إلى السجل النشط`;
      } else if (input.category === 'receipts') {
        const pay = this.state.payments.find((p) => p.id === input.entityId);
        if (!pay) throw new Error('الإيصال غير موجود');
        if (pay.status === 'معكوس') {
          referenceOnly = true;
          pay.archivedAt = undefined;
          restoredSummary = `استعادة الإيصال المعكوس ${pay.receiptNumber} للعرض المرجعي دون تغيير الأرصدة المحاسبية`;
        } else {
          pay.archivedAt = undefined;
          pay.archiveReason = undefined;
          restoredSummary = `استعادة الإيصال ${pay.receiptNumber} من الأرشيف المالي`;
        }
      } else if (input.category === 'tickets') {
        if (input.targetKind === 'task') {
          const tsk = this.state.tasks.find((t) => t.id === input.entityId);
          if (!tsk) throw new Error('المهمة غير موجودة');
          tsk.status = 'قيد التنفيذ';
          tsk.archivedAt = undefined;
          tsk.archiveReason = undefined;
          restoredSummary = `إعادة فتح المهمة "${tsk.title}"`;
        } else {
          const tkt = this.state.tickets.find((t) => t.id === input.entityId);
          if (!tkt) throw new Error('البلاغ غير موجود');
          tkt.status = 'قيد التنفيذ';
          tkt.archivedAt = undefined;
          tkt.archiveReason = undefined;
          tkt.updatedAt = new Date().toISOString();
          restoredSummary = `إعادة فتح بلاغ الصيانة ${tkt.ticketNumber}`;
        }
      } else if (input.category === 'documents') {
        const doc = this.state.documents.find((d) => d.id === input.entityId);
        if (!doc) throw new Error('المستند غير موجود');
        doc.archivedAt = undefined;
        doc.archiveReason = undefined;
        restoredSummary = `استعادة المستند "${doc.title}" للمستندات النشطة`;
      } else if (input.category === 'units') {
        const unit = this.state.units.find((u) => u.id === input.entityId);
        if (!unit) throw new Error('الوحدة غير موجودة');
        unit.status = 'شاغرة';
        unit.vacantSince = new Date().toISOString().slice(0, 10);
        unit.archivedAt = undefined;
        unit.archiveReason = undefined;
        restoredSummary = `إعادة تفعيل الوحدة ${unit.unitNumber} كوحدة شاغرة`;
      }

      this.addAudit(user, 'استعادة من الأرشيف الذكي', input.category, input.entityId, `${restoredSummary} — ${reason}`, {
        reason,
        newValue: referenceOnly ? 'سجل مرجعي' : 'نشط',
        deviceName,
      });
      this.persist();
      return { restoredSummary, referenceOnly };
    });
  }

  public runScheduledArchival(userId: string, deviceName?: string): { archivedCount: number; summary: string } {
    return this.runTransaction(() => {
      const user = this.assertPermission(userId, 'manage_contracts');
      const now = new Date();
      const nowIso = now.toISOString();
      const todayStr = nowIso.slice(0, 10);
      const oneYearAgoMs = now.getTime() - 365 * 86400000;
      const thirtyDaysAgoMs = now.getTime() - 30 * 86400000;
      let count = 0;

      for (const ctr of this.state.contracts) {
        if (!ctr.archivedAt && (ctr.lifecycleStatus === 'منتهي' || ctr.lifecycleStatus === 'منتهٍ بالإخلاء' || ctr.lifecycleStatus === 'ملغي')) {
          ctr.archivedAt = nowIso;
          ctr.archiveMode = 'مجدول';
          ctr.archiveReason = ctr.archiveReason || 'أرشفة تلقائية لعقد منتهي';
          count += 1;
        } else if (!ctr.archivedAt && ctr.endDate < todayStr && !ctr.restoredAsReference && ctr.lifecycleStatus === 'نشط') {
          ctr.preArchiveStatus = ctr.lifecycleStatus;
          ctr.lifecycleStatus = 'منتهي';
          ctr.archivedAt = nowIso;
          ctr.archiveMode = 'مجدول';
          ctr.archiveReason = 'انتهاء مدة العقد (أرشفة ليلية مجدولة)';
          count += 1;
        }
      }

      for (const pay of this.state.payments) {
        const payTime = new Date(pay.createdAt).getTime();
        if (!pay.archivedAt && (pay.status === 'معكوس' || payTime < oneYearAgoMs)) {
          pay.archivedAt = nowIso;
          pay.archiveMode = 'مجدول';
          pay.archiveReason = pay.status === 'معكوس' ? 'سند معكوس محاسبياً' : 'إقفال سنة مالية سابقة (> سنة)';
          count += 1;
        }
      }

      for (const doc of this.state.documents) {
        if (!doc.archivedAt && doc.expiryDate && doc.expiryDate < todayStr) {
          doc.archivedAt = nowIso;
          doc.archiveMode = 'مجدول';
          doc.archiveReason = 'انتهاء تاريخ صلاحية الوثيقة';
          count += 1;
        }
      }

      for (const tkt of this.state.tickets) {
        const updTime = new Date(tkt.updatedAt).getTime();
        if (!tkt.archivedAt && (tkt.status === 'مكتمل' || tkt.status === 'مغلق') && updTime < thirtyDaysAgoMs) {
          tkt.archivedAt = nowIso;
          tkt.archiveMode = 'مجدول';
          tkt.archiveReason = 'أرشفة دورية لبلاغ منجز';
          count += 1;
        }
      }

      this.state.archiveLastNightlyRun = nowIso;
      const summary =
        count > 0
          ? `تم تنفيذ الجدولة الليلية ونقل ${count} سجل منتهي إلى الأرشيف الذكي`
          : 'تم فحص كافة السجلات ولا توجد عناصر منتهية جديدة للأرشفة';

      this.addAudit(user, 'تشغيل الأرشفة الليلية المجدولة', 'SmartArchive', 'nightly-job', summary, { deviceName });
      this.persist();
      return { archivedCount: count, summary };
    });
  }

  public saveArchiveFilter(
    userId: string,
    input: Omit<SavedArchiveFilter, 'id' | 'createdBy' | 'createdAt'>,
    deviceName?: string
  ): SavedArchiveFilter {
    const user = this.getActingUser(userId);
    if (!this.state.savedArchiveFilters) this.state.savedArchiveFilters = [];
    const filter: SavedArchiveFilter = {
      ...input,
      id: uid('af'),
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };
    this.state.savedArchiveFilters.unshift(filter);
    this.addAudit(user, 'حفظ فلتر بحث في الأرشيف', 'SavedArchiveFilter', filter.id, `حفظ الفلتر "${filter.name}"`, {
      deviceName,
    });
    this.persist();
    return filter;
  }

  public deleteArchiveFilter(userId: string, filterId: string): void {
    this.getActingUser(userId);
    this.state.savedArchiveFilters = (this.state.savedArchiveFilters || []).filter((f) => f.id !== filterId);
    this.persist();
  }

  // 15. Team & Workforce Management (Users, 5-Level Permissions, Property Scope, Security Policy, Conflicts)
  public createStaffUser(
    userId: string,
    input: {
      nameAr: string;
      nameEn?: string;
      email: string;
      phone: string;
      role: RoleKey;
      roleLabelAr: string;
      roleLabelEn: string;
      specialty?: string;
      approvalLimitSar?: number;
      allowedPropertyIds?: string[];
      customModulePermissions?: Partial<Record<PermissionModuleKey, PermissionLevel[]>>;
      twoFactorEnabled?: boolean;
      biometricEnabled?: boolean;
      avatarDataUrl?: string;
    },
    deviceName?: string
  ): StaffUser {
    const actor = this.assertPermission(userId, 'manage_users');
    if (!input.nameAr?.trim() || !input.phone?.trim()) {
      throw new Error('الاسم الكامل ورقم الجوال مطلوبان لإضافة الموظف');
    }
    const now = new Date().toISOString();
    const newUser: StaffUser = {
      id: uid('usr'),
      nameAr: input.nameAr.trim(),
      nameEn: (input.nameEn || input.nameAr).trim(),
      role: input.role,
      roleLabelAr: input.roleLabelAr,
      roleLabelEn: input.roleLabelEn,
      email: input.email?.trim() || `staff-${Date.now().toString().slice(-4)}@aqarplus.sa`,
      phone: input.phone.trim(),
      approvalLimitSar: Number(input.approvalLimitSar || 0),
      active: true,
      deviceName: 'جهاز مسجل جديد · ويب/جوال',
      lastActiveAt: now,
      statusState: 'متصل',
      specialty: input.specialty?.trim() || input.roleLabelAr,
      avatarDataUrl: input.avatarDataUrl,
      allowedPropertyIds: input.allowedPropertyIds && input.allowedPropertyIds.length > 0 ? input.allowedPropertyIds : undefined,
      customModulePermissions: input.customModulePermissions,
      managerRating: 5,
      lastActivitySummary: 'تم إنشاء الحساب وتفعيل الصلاحيات',
      security: {
        twoFactorEnabled: Boolean(input.twoFactorEnabled),
        biometricEnabled: Boolean(input.biometricEnabled),
        failedAttempts: 0,
        lastPasswordChangedAt: now,
        requirePasswordChange90d: true,
        tempPasswordSet: true,
      },
      notificationPrefs: {
        dndEnabled: false,
        taskAssigned: true,
        taskReminder: true,
        taskApproved: true,
        taskComment: true,
        urgentTicket: true,
      },
    };
    this.state.users.push(newUser);
    this.addAudit(
      actor,
      'إضافة موظف جديد',
      'StaffUser',
      newUser.id,
      `إضافة الموظف ${newUser.nameAr} بدور (${newUser.roleLabelAr})${newUser.allowedPropertyIds ? ` · مقيد بـ ${newUser.allowedPropertyIds.length} عقارات` : ''}`,
      { newValue: newUser.roleLabelAr, deviceName }
    );
    this.addNotification(
      `انضمام موظف جديد: ${newUser.nameAr}`,
      `New staff added: ${newUser.nameEn}`,
      `تمت إضافة ${newUser.nameAr} (${newUser.roleLabelAr}) وإرسال بيانات الدخول المؤقتة.`,
      `${newUser.nameEn} joined as ${newUser.roleLabelEn}.`,
      'إدارية',
      ['gm', 'sys_owner'],
      'team'
    );
    this.persist();
    return newUser;
  }

  public updateStaffUser(
    userId: string,
    targetUserId: string,
    patch: {
      nameAr?: string;
      nameEn?: string;
      email?: string;
      phone?: string;
      role?: RoleKey;
      roleLabelAr?: string;
      roleLabelEn?: string;
      specialty?: string;
      approvalLimitSar?: number;
      active?: boolean;
      statusState?: StaffStatusState;
      managerRating?: number;
      allowedPropertyIds?: string[];
      customModulePermissions?: Partial<Record<PermissionModuleKey, PermissionLevel[]>>;
      security?: Partial<StaffSecurityConfig>;
      notificationPrefs?: Partial<StaffNotificationPrefs>;
    },
    deviceName?: string
  ): StaffUser {
    const actor = this.getActingUser(userId);
    const isSelfOnlyUpdate =
      actor.id === targetUserId &&
      !patch.role &&
      patch.active === undefined &&
      !patch.allowedPropertyIds &&
      !patch.customModulePermissions &&
      patch.managerRating === undefined;
    if (!isSelfOnlyUpdate) {
      this.assertPermission(userId, 'manage_users');
    }
    const target = this.state.users.find((u) => u.id === targetUserId);
    if (!target) throw new Error('الموظف غير موجود');

    const oldRole = target.roleLabelAr;
    if (patch.nameAr !== undefined) target.nameAr = patch.nameAr.trim();
    if (patch.nameEn !== undefined) target.nameEn = patch.nameEn.trim();
    if (patch.email !== undefined) target.email = patch.email.trim();
    if (patch.phone !== undefined) target.phone = patch.phone.trim();
    if (patch.role !== undefined) target.role = patch.role;
    if (patch.roleLabelAr !== undefined) target.roleLabelAr = patch.roleLabelAr;
    if (patch.roleLabelEn !== undefined) target.roleLabelEn = patch.roleLabelEn;
    if (patch.specialty !== undefined) target.specialty = patch.specialty;
    if (patch.approvalLimitSar !== undefined) target.approvalLimitSar = Number(patch.approvalLimitSar);
    if (patch.active !== undefined) target.active = patch.active;
    if (patch.statusState !== undefined) target.statusState = patch.statusState;
    if (patch.managerRating !== undefined) target.managerRating = Math.min(5, Math.max(1, Number(patch.managerRating)));
    if (patch.allowedPropertyIds !== undefined) {
      target.allowedPropertyIds = patch.allowedPropertyIds.length > 0 ? patch.allowedPropertyIds : undefined;
    }
    if (patch.customModulePermissions !== undefined) {
      target.customModulePermissions = patch.customModulePermissions;
    }
    if (patch.security) {
      target.security = { ...(target.security || {}), ...patch.security };
    }
    if (patch.notificationPrefs) {
      target.notificationPrefs = { ...(target.notificationPrefs || {}), ...patch.notificationPrefs };
    }

    this.addAudit(
      actor,
      'تحديث ملف وصلاحيات موظف',
      'StaffUser',
      target.id,
      `تحديث بيانات/صلاحيات ${target.nameAr}${patch.roleLabelAr ? ` (${oldRole} ← ${patch.roleLabelAr})` : ''}`,
      { oldValue: oldRole, newValue: target.roleLabelAr, deviceName }
    );
    this.persist();
    return target;
  }

  public updateSecurityPolicy(userId: string, patch: Partial<SecurityPolicy>, deviceName?: string): SecurityPolicy {
    const actor = this.assertPermission(userId, 'manage_users');
    const current: SecurityPolicy = this.state.securityPolicy || {
      minPasswordLength: 8,
      requireSpecialChars: true,
      passwordExpiryDays: 90,
      autoLockMinutes: 5,
      maxFailedAttempts: 5,
      require2faForManagersAndAccountants: true,
    };
    this.state.securityPolicy = { ...current, ...patch };
    this.addAudit(
      actor,
      'تحديث سياسة الأمان وكلمات المرور',
      'SecurityPolicy',
      'company-security',
      `تحديث سياسات الأمان: الطول الأدنى ${this.state.securityPolicy.minPasswordLength}، القفل ${this.state.securityPolicy.autoLockMinutes} د`,
      { deviceName }
    );
    this.persist();
    return this.state.securityPolicy;
  }

  public recordLoginEvent(input: {
    userId: string;
    deviceName: string;
    ipAddress?: string;
    method?: LoginAuditEntry['method'];
    success?: boolean;
  }): void {
    const user = this.state.users.find((u) => u.id === input.userId);
    if (!user) return;
    if (!this.state.loginHistory) this.state.loginHistory = [];
    const entry: LoginAuditEntry = {
      id: uid('lgn'),
      userId: user.id,
      userName: user.nameAr,
      userRole: user.roleLabelAr,
      deviceName: input.deviceName || user.deviceName,
      ipAddress: input.ipAddress || '192.168.10.1',
      geoLocation: 'الرياض · المملكة العربية السعودية',
      method: input.method || 'كلمة المرور',
      success: input.success !== false,
      createdAt: new Date().toISOString(),
    };
    this.state.loginHistory.unshift(entry);
    if (this.state.loginHistory.length > 100) {
      this.state.loginHistory = this.state.loginHistory.slice(0, 100);
    }
    user.lastActiveAt = entry.createdAt;
    this.persist();
  }

  public resolveSyncConflict(
    userId: string,
    conflictId: string,
    resolution: 'تم اعتماد التعديل الأحدث' | 'تم الإبقاء على النسخة السابقة',
    deviceName?: string
  ): SyncConflictRecord {
    const actor = this.assertPermission(userId, 'manage_users');
    const cnf = (this.state.syncConflicts || []).find((c) => c.id === conflictId);
    if (!cnf) throw new Error('سجل التعارض غير موجود');
    cnf.status = resolution;
    cnf.resolvedBy = actor.nameAr;
    cnf.resolvedAt = new Date().toISOString();
    this.addAudit(actor, 'معالجة تعارض مزامنة', 'SyncConflict', cnf.id, `${resolution} لـ ${cnf.entityLabel}`, {
      newValue: resolution,
      deviceName,
    });
    this.persist();
    return cnf;
  }

  // 14. Communication Templates Library & System Maintenance
  public createTemplate(
    userId: string,
    input: Omit<CommunicationTemplate, 'id' | 'usageCount' | 'createdBy' | 'updatedAt'>,
    deviceName?: string
  ): CommunicationTemplate {
    const actor = this.getActingUser(userId);
    if (!this.state.communicationTemplates) this.state.communicationTemplates = [];
    const now = new Date().toISOString();
    const tpl: CommunicationTemplate = {
      ...input,
      id: uid('tpl'),
      usageCount: 0,
      createdBy: actor.id,
      updatedBy: actor.nameAr,
      updatedAt: now,
      editHistory: [{ editedBy: actor.nameAr, editedAt: now, summary: 'إنشاء القالب' }],
    };
    this.state.communicationTemplates.unshift(tpl);
    this.addAudit(actor, 'إنشاء قالب تواصل', 'CommunicationTemplate', tpl.id, `إنشاء القالب "${tpl.name}" (${tpl.category})`, {
      deviceName,
    });
    this.persist();
    return tpl;
  }

  public updateTemplate(
    userId: string,
    templateId: string,
    patch: Partial<CommunicationTemplate>,
    deviceName?: string
  ): CommunicationTemplate {
    const actor = this.getActingUser(userId);
    const list = this.state.communicationTemplates || [];
    const tpl = list.find((t) => t.id === templateId);
    if (!tpl) throw new Error('القالب غير موجود');
    const now = new Date().toISOString();
    Object.assign(tpl, patch, {
      updatedBy: actor.nameAr,
      updatedAt: now,
    });
    if (!tpl.editHistory) tpl.editHistory = [];
    tpl.editHistory.unshift({
      editedBy: actor.nameAr,
      editedAt: now,
      summary: patch.isFavorite !== undefined && Object.keys(patch).length === 1 ? 'تحديث المفضلة' : 'تحديث محتوى/إعدادات القالب',
    });
    if (tpl.editHistory.length > 20) tpl.editHistory = tpl.editHistory.slice(0, 20);
    this.addAudit(actor, 'تحديث قالب تواصل', 'CommunicationTemplate', tpl.id, `تحديث القالب "${tpl.name}"`, {
      deviceName,
    });
    this.persist();
    return tpl;
  }

  public deleteTemplate(userId: string, templateId: string, deviceName?: string): void {
    const actor = this.getActingUser(userId);
    const existing = (this.state.communicationTemplates || []).find((t) => t.id === templateId);
    this.state.communicationTemplates = (this.state.communicationTemplates || []).filter((t) => t.id !== templateId);
    this.addAudit(actor, 'حذف قالب تواصل', 'CommunicationTemplate', templateId, `حذف القالب "${existing?.name || templateId}"`, {
      deviceName,
    });
    this.persist();
  }

  public useTemplate(
    userId: string,
    templateId: string,
    input: {
      targetType: CommunicationLog['targetType'];
      targetId: string;
      targetName: string;
      channel: CommunicationLog['channel'];
      language: 'ar' | 'en' | 'bn';
      summary: string;
      localOnly?: boolean;
    },
    deviceName?: string
  ): { template?: CommunicationTemplate; log?: CommunicationLog } {
    const actor = this.getActingUser(userId);
    const tpl = (this.state.communicationTemplates || []).find((t) => t.id === templateId);
    if (tpl) {
      tpl.usageCount = (tpl.usageCount || 0) + 1;
    }
    let log: CommunicationLog | undefined;
    if (!input.localOnly) {
      log = {
        id: uid('com'),
        targetType: input.targetType,
        targetId: input.targetId,
        targetName: input.targetName,
        channel: input.channel,
        templateId,
        templateUsed: tpl?.name || 'قالب تواصل',
        language: input.language,
        summary: input.summary,
        status: 'مرسل',
        sentBy: actor.id,
        createdAt: new Date().toISOString(),
      };
      this.state.communications.unshift(log);
    }
    this.addAudit(actor, 'استخدام قالب تواصل', 'CommunicationTemplate', templateId, `إرسال رسالة عبر "${tpl?.name || templateId}" إلى ${input.targetName}`, {
      deviceName,
    });
    this.persist();
    return { template: tpl, log };
  }

  public importTemplates(userId: string, templates: Partial<CommunicationTemplate>[], deviceName?: string): number {
    const actor = this.getActingUser(userId);
    if (!this.state.communicationTemplates) this.state.communicationTemplates = [];
    const now = new Date().toISOString();
    let count = 0;
    for (const raw of templates) {
      if (!raw.name || !raw.contentAr) continue;
      this.state.communicationTemplates.unshift({
        id: uid('tpl'),
        name: String(raw.name),
        category: raw.category || 'custom',
        channel: raw.channel || 'whatsapp',
        language: raw.language || 'ar',
        contentAr: String(raw.contentAr),
        contentEn: raw.contentEn ? String(raw.contentEn) : undefined,
        isFavorite: Boolean(raw.isFavorite),
        isSeasonal: Boolean(raw.isSeasonal),
        usageCount: 0,
        createdBy: actor.id,
        updatedBy: actor.nameAr,
        updatedAt: now,
        editHistory: [{ editedBy: actor.nameAr, editedAt: now, summary: 'استيراد قالب' }],
      });
      count += 1;
    }
    this.addAudit(actor, 'استيراد قوالب تواصل', 'CommunicationTemplate', 'bulk-import', `استيراد ${count} قالب تواصل`, {
      deviceName,
    });
    this.persist();
    return count;
  }

  public previewBackup(backupId: string): {
    id: string;
    exists: boolean;
    propertiesCount: number;
    unitsCount: number;
    tenantsCount: number;
    contractsCount: number;
    paymentsCount: number;
    templatesCount: number;
    lastUpdatedAt?: string;
  } {
    const filePath = path.join(BACKUP_DIR, `${backupId}.json`);
    if (!fs.existsSync(filePath)) {
      return {
        id: backupId,
        exists: false,
        propertiesCount: 0,
        unitsCount: 0,
        tenantsCount: 0,
        contractsCount: 0,
        paymentsCount: 0,
        templatesCount: 0,
      };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AqarDatabaseState;
    return {
      id: backupId,
      exists: true,
      propertiesCount: parsed.properties?.length || 0,
      unitsCount: parsed.units?.length || 0,
      tenantsCount: parsed.tenants?.length || 0,
      contractsCount: parsed.contracts?.length || 0,
      paymentsCount: parsed.payments?.length || 0,
      templatesCount: parsed.communicationTemplates?.length || 0,
      lastUpdatedAt: parsed.lastUpdatedAt,
    };
  }

  public clearTempCache(userId: string, deviceName?: string): CompanySettings {
    const actor = this.assertPermission(userId, 'manage_users');
    if (!this.state.settings.developerCenter) {
      this.state.settings.developerCenter = { tempCacheSizeKb: 0, errorLogs: [] };
    }
    this.state.settings.developerCenter.tempCacheSizeKb = 0;
    this.state.settings.developerCenter.errorLogs.unshift({
      id: uid('err'),
      timestamp: new Date().toISOString(),
      source: 'StorageManager',
      message: 'تم تنظيف الملفات المؤقتة وذاكرة التخزين المرحلي بنجاح',
      severity: 'info',
    });
    this.addAudit(actor, 'تنظيف الملفات المؤقتة', 'SystemMaintenance', 'cache', 'تنظيف ذاكرة التخزين المؤقتة', { deviceName });
    this.persist();
    return this.state.settings;
  }
}
