import {
  AqarDatabaseState,
  LeaseContract,
  MaintenanceTicket,
  Payment,
  Property,
  TaskItem,
  Tenant,
  Unit,
  Vendor,
} from '../types/aqar';
import { formatCurrency } from './formatters';

export interface TemplateVariableMeta {
  token: string;
  labelAr: string;
  labelEn: string;
  sampleAr: string;
}

export const TEMPLATE_VARIABLES: TemplateVariableMeta[] = [
  { token: '{{tenant_name}}', labelAr: 'اسم المستأجر', labelEn: 'Tenant Name', sampleAr: 'محمد أحمد' },
  { token: '{{unit_number}}', labelAr: 'رقم الوحدة', labelEn: 'Unit Number', sampleAr: 'شقة 18' },
  { token: '{{property_name}}', labelAr: 'اسم العقار', labelEn: 'Property Name', sampleAr: 'عمارة طيبة' },
  { token: '{{amount}}', labelAr: 'المبلغ', labelEn: 'Amount', sampleAr: '1,500' },
  { token: '{{paid_amount}}', labelAr: 'المبلغ المدفوع', labelEn: 'Paid Amount', sampleAr: '1,500' },
  { token: '{{total_due}}', labelAr: 'إجمالي المستحق', labelEn: 'Total Due', sampleAr: '2,000' },
  { token: '{{remaining}}', labelAr: 'المبلغ المتبقي', labelEn: 'Remaining', sampleAr: '500' },
  { token: '{{due_date}}', labelAr: 'تاريخ الاستحقاق', labelEn: 'Due Date', sampleAr: '20/11/2026' },
  { token: '{{new_due_date}}', labelAr: 'تاريخ الاستحقاق الجديد', labelEn: 'New Due Date', sampleAr: '30/11/2026' },
  { token: '{{receipt_number}}', labelAr: 'رقم الإيصال', labelEn: 'Receipt Number', sampleAr: 'AQ-2026-001234' },
  { token: '{{days_overdue}}', labelAr: 'أيام التأخير', labelEn: 'Days Overdue', sampleAr: '7' },
  { token: '{{contract_end}}', labelAr: 'نهاية العقد', labelEn: 'Contract End', sampleAr: '31/12/2026' },
  { token: '{{end_date}}', labelAr: 'تاريخ الانتهاء', labelEn: 'End Date', sampleAr: '31/12/2026' },
  { token: '{{duration}}', labelAr: 'مدة العقد', labelEn: 'Duration', sampleAr: 'سنة ميلادية' },
  { token: '{{new_rent}}', labelAr: 'الإيجار الجديد', labelEn: 'New Rent', sampleAr: '42,000' },
  { token: '{{handover_date}}', labelAr: 'موعد التسليم', labelEn: 'Handover Date', sampleAr: '25/11/2026' },
  { token: '{{manager_name}}', labelAr: 'اسم المدير / المشرف', labelEn: 'Manager Name', sampleAr: 'خالد' },
  { token: '{{manager_phone}}', labelAr: 'هاتف المدير', labelEn: 'Manager Phone', sampleAr: '0501234567' },
  { token: '{{company_name}}', labelAr: 'اسم الشركة', labelEn: 'Company Name', sampleAr: 'شركة الجنيدل العقارية' },
  { token: '{{bank_name}}', labelAr: 'اسم البنك', labelEn: 'Bank Name', sampleAr: 'البنك الأهلي السعودي' },
  { token: '{{iban}}', labelAr: 'رقم الآيبان', labelEn: 'IBAN', sampleAr: 'SA1910000041200008819201' },
  { token: '{{ticket_id}}', labelAr: 'رقم البلاغ', labelEn: 'Ticket ID', sampleAr: 'TKT-1042' },
  { token: '{{issue_type}}', labelAr: 'نوع العطل', labelEn: 'Issue Type', sampleAr: 'صيانة تكييف' },
  { token: '{{response_time}}', labelAr: 'وقت الاستجابة', labelEn: 'Response Time', sampleAr: 'ساعتين' },
  { token: '{{technician_name}}', labelAr: 'اسم الفني', labelEn: 'Technician Name', sampleAr: 'عمر القحطاني' },
  { token: '{{eta}}', labelAr: 'الوقت المتوقع للوصول', labelEn: 'ETA', sampleAr: '45 دقيقة' },
  { token: '{{tech_phone}}', labelAr: 'هاتف الفني', labelEn: 'Technician Phone', sampleAr: '0505123405' },
  { token: '{{task_title}}', labelAr: 'عنوان المهمة', labelEn: 'Task Title', sampleAr: 'فحص عدادات الكهرباء' },
  { token: '{{deadline}}', labelAr: 'الموعد النهائي', labelEn: 'Deadline', sampleAr: '22/11/2026' },
  { token: '{{priority}}', labelAr: 'الأولوية', labelEn: 'Priority', sampleAr: 'عاجل' },
  { token: '{{hours_left}}', labelAr: 'الساعات المتبقية', labelEn: 'Hours Left', sampleAr: '4' },
  { token: '{{expense_id}}', labelAr: 'رقم المصروف', labelEn: 'Expense ID', sampleAr: 'EXP-2026-0081' },
  { token: '{{invoice_number}}', labelAr: 'رقم الفاتورة', labelEn: 'Invoice Number', sampleAr: 'INV-9921' },
  { token: '{{payment_days}}', labelAr: 'أيام التحويل', labelEn: 'Payment Days', sampleAr: '3' },
  { token: '{{service_description}}', labelAr: 'وصف الخدمة', labelEn: 'Service Description', sampleAr: 'صيانة مصاعد العقار' },
  { token: '{{work_order_id}}', labelAr: 'رقم أمر العمل', labelEn: 'Work Order ID', sampleAr: 'WO-308' },
  { token: '{{scheduled_date}}', labelAr: 'التاريخ المجدول', labelEn: 'Scheduled Date', sampleAr: '21/11/2026' },
  { token: '{{scheduled_time}}', labelAr: 'الوقت المجدول', labelEn: 'Scheduled Time', sampleAr: '10:30 صباحاً' },
  { token: '{{location}}', labelAr: 'الموقع', labelEn: 'Location', sampleAr: 'حي العليا - الرياض' },
];

export interface TemplateContextInput {
  state: AqarDatabaseState;
  tenant?: Tenant;
  property?: Property;
  unit?: Unit;
  contract?: LeaseContract;
  payment?: Payment;
  ticket?: MaintenanceTicket;
  task?: TaskItem;
  vendor?: Vendor;
  customOverrides?: Record<string, string>;
}

export function resolveTemplateText(rawText: string, ctx: TemplateContextInput): string {
  const { state } = ctx;
  const tenant = ctx.tenant || state.tenants[0];
  const contract =
    ctx.contract ||
    (tenant
      ? state.contracts.find((c) => c.tenantId === tenant.id && c.lifecycleStatus === 'نشط') ||
        state.contracts.find((c) => c.tenantId === tenant.id)
      : state.contracts[0]);
  const unit =
    ctx.unit ||
    (contract ? state.units.find((u) => u.id === contract.unitId) : undefined) ||
    (tenant ? state.units.find((u) => u.linkedTenantId === tenant.id) : undefined) ||
    state.units[0];
  const property =
    ctx.property ||
    (unit ? state.properties.find((p) => p.id === unit.propertyId) : undefined) ||
    state.properties[0];

  const tenantInstallments = tenant
    ? state.installments.filter((i) => i.tenantId === tenant.id && i.status !== 'ملغاة')
    : [];
  const nextInst =
    tenantInstallments.find((i) => i.status === 'متأخرة') ||
    tenantInstallments.find((i) => i.remainingAmount > 0) ||
    state.installments.find((i) => i.remainingAmount > 0);
  const totalRemaining = tenantInstallments.reduce((s, i) => s + i.remainingAmount, 0);

  const payment =
    ctx.payment ||
    (tenant ? state.payments.find((p) => p.tenantId === tenant.id && p.status === 'معتمد') : undefined) ||
    state.payments[0];
  const ticket =
    ctx.ticket ||
    (tenant ? state.tickets.find((t) => t.tenantId === tenant.id) : undefined) ||
    state.tickets[0];
  const task = ctx.task || state.tasks[0];
  const vendor = ctx.vendor || state.vendors[0];

  const defaultBank =
    state.settings.bankAccounts?.find((b) => b.isDefault) ||
    state.settings.bankAccounts?.[0] ||
    (state.companies?.[0]
      ? { bankName: state.companies[0].bankName, iban: state.companies[0].iban }
      : { bankName: 'البنك الأهلي السعودي', iban: 'SA1910000041200008819201' });

  const gmUser = state.users.find((u) => u.role === 'gm') || state.users[0];
  const techUser =
    (ticket?.assignedTo ? state.users.find((u) => u.id === ticket.assignedTo) : undefined) ||
    state.users.find((u) => u.role === 'technician') ||
    state.users[0];

  const amountVal = nextInst ? nextInst.remainingAmount : contract?.annualRent ? Math.round(contract.annualRent / (contract.installmentsCount || 1)) : 1500;
  const dueDateStr = nextInst?.dueDate || contract?.endDate || '2026-11-20';
  const overdueDays = nextInst && nextInst.status === 'متأخرة' ? Math.max(1, Math.round((Date.now() - new Date(nextInst.dueDate).getTime()) / 86400000)) : 7;

  const map: Record<string, string> = {
    '{{tenant_name}}': tenant?.nameAr || 'محمد أحمد',
    '{{unit_number}}': unit ? `${unit.unitType} ${unit.unitNumber}` : 'شقة 18',
    '{{property_name}}': property?.nameAr || 'عمارة طيبة',
    '{{amount}}': Number(amountVal || 0).toLocaleString('en-US'),
    '{{paid_amount}}': Number(payment?.amount || 1500).toLocaleString('en-US'),
    '{{total_due}}': Number(nextInst?.amount || payment?.amount || 2000).toLocaleString('en-US'),
    '{{remaining}}': Number(totalRemaining || 0).toLocaleString('en-US'),
    '{{due_date}}': dueDateStr,
    '{{new_due_date}}': '2026-11-30',
    '{{receipt_number}}': payment?.receiptNumber || 'AQ-2026-001234',
    '{{days_overdue}}': String(Math.max(1, overdueDays)),
    '{{contract_end}}': contract?.endDate || '2026-12-31',
    '{{end_date}}': contract?.endDate || '2026-12-31',
    '{{duration}}': 'سنة واحدة',
    '{{new_rent}}': formatCurrency(contract?.annualRent || 42000, contract?.currency || 'SAR', 'ar').replace(/[^\d,.]/g, ''),
    '{{handover_date}}': '2026-11-25',
    '{{manager_name}}': property?.caretakerName || gmUser?.nameAr || 'خالد',
    '{{manager_phone}}': property?.caretakerPhone || gmUser?.phone || '0501234567',
    '{{company_name}}': state.settings.nameAr || 'شركة الجنيدل العقارية',
    '{{bank_name}}': defaultBank.bankName,
    '{{iban}}': defaultBank.iban,
    '{{ticket_id}}': ticket?.ticketNumber || 'TKT-1042',
    '{{issue_type}}': ticket?.category || 'صيانة تكييف',
    '{{response_time}}': 'ساعتين',
    '{{technician_name}}': techUser?.nameAr || 'عمر القحطاني',
    '{{eta}}': '45 دقيقة',
    '{{tech_phone}}': techUser?.phone || '0505123405',
    '{{task_title}}': task?.title || 'فحص عدادات المياه والكهرباء',
    '{{deadline}}': task?.dueDate || '2026-11-22',
    '{{priority}}': task?.priority || 'عاجل',
    '{{hours_left}}': '4',
    '{{expense_id}}': state.expenses[0]?.expenseNumber || 'EXP-2026-0081',
    '{{invoice_number}}': state.expenses[0]?.invoiceNumber || 'INV-9921',
    '{{payment_days}}': '3',
    '{{service_description}}': vendor?.category || 'أعمال صيانة وتشغيل',
    '{{work_order_id}}': state.purchaseOrders?.[0]?.poNumber || 'PO-2026-014',
    '{{scheduled_date}}': ticket?.scheduledDate || '2026-11-21',
    '{{scheduled_time}}': '10:30 صباحاً',
    '{{location}}': property ? `${property.city} · ${property.district}` : 'الرياض · حي العليا',
    ...(ctx.customOverrides || {}),
  };

  let output = rawText || '';
  for (const [token, val] of Object.entries(map)) {
    output = output.split(token).join(val);
  }
  return output;
}

export function buildWhatsAppHref(phone: string | undefined, message: string): string {
  const digits = (phone || '').replace(/\D/g, '').replace(/^0/, '966');
  if (!digits) return `https://wa.me/?text=${encodeURIComponent(message)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
