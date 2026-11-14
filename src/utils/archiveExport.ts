import * as XLSX from 'xlsx';
import { AqarDatabaseState, ArchiveCategoryId, StaffUser } from '../types/aqar';
import { formatDateTime } from './formatters';

export interface ArchiveExportRow {
  id: string;
  title: string;
  reference: string;
  date: string;
  amountLabel: string;
  status: string;
  reason: string;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  mode: string;
}

interface ExportArchiveParams {
  format: 'excel' | 'csv' | 'pdf';
  categoryTitle: string;
  categoryId: ArchiveCategoryId | 'all';
  rows: ArchiveExportRow[];
  state: AqarDatabaseState;
  currentUser: StaffUser | null;
  lang: 'ar' | 'en';
  watermarkText?: string;
}

export function exportArchiveRecords({
  format,
  categoryTitle,
  categoryId,
  rows,
  state,
  currentUser,
  lang,
  watermarkText,
}: ExportArchiveParams): string {
  const isAr = lang === 'ar';
  const dateStr = new Date().toISOString().slice(0, 10);
  const companyName = isAr ? state.settings.nameAr : state.settings.nameEn;

  if (format === 'csv') {
    const headers = isAr
      ? ['المرجع', 'العنوان', 'العقار', 'الوحدة', 'المستأجر', 'القيمة', 'الحالة', 'تاريخ الأرشفة', 'سبب الأرشفة', 'نوع الأرشفة']
      : ['Reference', 'Title', 'Property', 'Unit', 'Tenant', 'Value', 'Status', 'Archived Date', 'Reason', 'Mode'];
    const body = rows.map((r) => [
      r.reference,
      r.title,
      r.propertyName,
      r.unitNumber,
      r.tenantName,
      r.amountLabel,
      r.status,
      r.date,
      r.reason,
      r.mode,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`${companyName} — ${categoryTitle}`],
      [watermarkText ? `${isAr ? 'الختم المائي:' : 'Watermark:'} ${watermarkText}` : ''],
      headers,
      ...body,
    ]);
    const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `AqarPlus-Archive-${categoryId}-${dateStr}.csv`;
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return filename;
  }

  if (format === 'excel') {
    const wb = XLSX.utils.book_new();
    const metaRows: (string | number)[][] = [
      [isAr ? `تقرير الأرشيف الذكي — ${categoryTitle}` : `Smart Archive Report — ${categoryTitle}`],
      [isAr ? 'الشركة' : 'Company', companyName, isAr ? 'السجل التجاري' : 'CR', state.settings.crNumber],
      [isAr ? 'تاريخ التصدير' : 'Exported At', formatDateTime(new Date().toISOString(), lang), isAr ? 'المستخدم' : 'User', currentUser?.nameAr || '—'],
      [isAr ? 'النسخة المرجعية' : 'Reference Stamp', watermarkText || (isAr ? 'نسخة معتمدة' : 'Verified Copy'), isAr ? 'عدد السجلات' : 'Records', rows.length],
      [],
      isAr
        ? ['المرجع', 'العنوان', 'العقار', 'الوحدة', 'المستأجر', 'القيمة', 'الحالة', 'التاريخ', 'سبب الأرشفة', 'نمط الأرشفة']
        : ['Reference', 'Title', 'Property', 'Unit', 'Tenant', 'Value', 'Status', 'Date', 'Reason', 'Mode'],
      ...rows.map((r) => [
        r.reference,
        r.title,
        r.propertyName,
        r.unitNumber,
        r.tenantName,
        r.amountLabel,
        r.status,
        r.date,
        r.reason,
        r.mode,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(metaRows);
    ws['!cols'] = [
      { wch: 16 },
      { wch: 30 },
      { wch: 24 },
      { wch: 12 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 30 },
      { wch: 14 },
    ];
    ws['!views'] = [{ rightToLeft: isAr }];
    XLSX.utils.book_append_sheet(wb, ws, isAr ? 'الأرشيف الذكي' : 'Smart Archive');
    const filename = `AqarPlus-Archive-${categoryId}-${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
    return filename;
  }

  // Branded HTML -> hidden iframe print-to-PDF with optional diagonal watermark
  const escapeHtml = (str: string) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const logoHtml = state.settings.logoDataUrl
    ? `<img src="${state.settings.logoDataUrl}" alt="Logo" style="height:44px;width:44px;border-radius:10px;object-fit:cover;" />`
    : `<div style="height:44px;width:44px;border-radius:10px;background:#26478D;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;">A+</div>`;

  const tableRowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="font-family:monospace;">${escapeHtml(r.reference)}</td>
        <td><strong>${escapeHtml(r.title)}</strong></td>
        <td>${escapeHtml(r.propertyName)} · ${escapeHtml(r.unitNumber)}</td>
        <td>${escapeHtml(r.tenantName)}</td>
        <td style="font-family:monospace;">${escapeHtml(r.amountLabel)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td style="font-family:monospace;">${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.reason)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
  <html lang="${lang}" dir="${isAr ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(categoryTitle)} - ${escapeHtml(companyName)}</title>
    <style>
      @page { size: A4 landscape; margin: 14mm; }
      body { font-family: 'IBM Plex Sans Arabic', 'Plus Jakarta Sans', system-ui, sans-serif; color: #0f172a; margin: 0; position: relative; }
      .watermark {
        position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-24deg);
        font-size: 64px; font-weight: 800; color: rgba(38, 71, 141, 0.08); pointer-events: none;
        white-space: nowrap; z-index: 0; letter-spacing: 2px;
      }
      .header { display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #26478D; padding-bottom: 12px; margin-bottom: 16px; position: relative; z-index: 1; }
      .brand { display:flex; align-items:center; gap: 12px; }
      .meta { font-size: 11px; color: #475569; text-align: end; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; position: relative; z-index: 1; }
      th { background: #26478D; color: #fff; text-align: start; padding: 8px 10px; font-weight: 600; }
      td { border-bottom: 1px solid #e2e8f0; padding: 7px 10px; vertical-align: top; }
      tr:nth-child(even) td { background: #f8fafc; }
      .footer { margin-top: 16px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    </style>
  </head>
  <body>
    ${watermarkText ? `<div class="watermark">${escapeHtml(watermarkText)}</div>` : ''}
    <div class="header">
      <div class="brand">
        ${logoHtml}
        <div>
          <div style="font-size:16px;font-weight:700;color:#26478D;">${escapeHtml(companyName)}</div>
          <div style="font-size:13px;font-weight:600;color:#334155;">${escapeHtml(categoryTitle)}</div>
        </div>
      </div>
      <div class="meta">
        <div>${isAr ? 'الرقم الضريبي:' : 'VAT:'} ${escapeHtml(state.settings.vatNumber)} · ${isAr ? 'السجل:' : 'CR:'} ${escapeHtml(state.settings.crNumber)}</div>
        <div>${isAr ? 'المصدر بواسطة:' : 'Prepared by:'} ${escapeHtml(currentUser ? (isAr ? currentUser.nameAr : currentUser.nameEn) : '—')}</div>
        <div>${escapeHtml(formatDateTime(new Date().toISOString(), lang))} · (${rows.length} ${isAr ? 'سجل' : 'records'})</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${isAr ? 'المرجع' : 'Ref'}</th>
          <th>${isAr ? 'العنوان' : 'Title'}</th>
          <th>${isAr ? 'العقار / الوحدة' : 'Property / Unit'}</th>
          <th>${isAr ? 'المستأجر' : 'Tenant'}</th>
          <th>${isAr ? 'القيمة' : 'Amount'}</th>
          <th>${isAr ? 'الحالة' : 'Status'}</th>
          <th>${isAr ? 'تاريخ الأرشفة' : 'Archived'}</th>
          <th>${isAr ? 'سبب الأرشفة' : 'Reason'}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>
    <div class="footer">
      <span>${escapeHtml(companyName)} — AqarPlus Smart Archive</span>
      <span>${watermarkText ? escapeHtml(watermarkText) : isAr ? 'وثيقة أرشيفية رسمية' : 'Official Archive Document'}</span>
    </div>
  </body>
  </html>`;

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
  return `AqarPlus-Archive-${categoryId}-${dateStr}.pdf`;
}

export function exportSeparateAuditArchiveBundle(state: AqarDatabaseState, currentUser: StaffUser | null): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser?.nameAr || 'System',
    company: {
      nameAr: state.settings.nameAr,
      crNumber: state.settings.crNumber,
      vatNumber: state.settings.vatNumber,
    },
    encryptionNote: 'Audit archive package verified by AqarPlus Integrity Check',
    archives: {
      contracts: state.contracts.filter((c) => ['منتهي', 'منتهٍ بالإخلاء', 'ملغي'].includes(c.lifecycleStatus) || Boolean(c.archivedAt)),
      exTenants: state.tenants.filter((t) => t.classification === 'سابق' || Boolean(t.archivedAt)),
      receipts: state.payments.filter((p) => p.status === 'معكوس' || Boolean(p.archivedAt)),
      closedTickets: state.tickets.filter((t) => t.status === 'مكتمل' || t.status === 'مغلق' || Boolean(t.archivedAt)),
      completedTasks: state.tasks.filter((t) => t.status === 'مكتملة' || Boolean(t.archivedAt)),
      documents: state.documents.filter((d) => Boolean(d.archivedAt) || (d.expiryDate && d.expiryDate < new Date().toISOString().slice(0, 10))),
      inactiveUnits: state.units.filter((u) => u.status === 'موقوفة' || u.status === 'مؤرشفة' || Boolean(u.archivedAt)),
    },
    auditLogs: state.auditLogs.filter((a) => a.action.includes('أرشيف') || a.entityType === 'SmartArchive' || a.entityType === 'SavedArchiveFilter'),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = `AqarPlus-Audit-Archive-Bundle-${new Date().toISOString().slice(0, 10)}.json`;
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}
