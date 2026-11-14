import React, { useState } from 'react';
import { Printer, RotateCcw, X, CheckCircle2, AlertTriangle, MessageCircle, Download } from 'lucide-react';
import { Payment } from '../types/aqar';
import { useAqar } from '../context/AqarContext';
import { formatDateTime, formatHijri, formatSar, numberToArabicWords } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { QrCodeSvg } from './QrCodeSvg';

interface ReceiptModalProps {
  payment: Payment;
  onClose: () => void;
}

export function ReceiptModal({ payment, onClose }: ReceiptModalProps) {
  const { state, lang, hasPermission, mutate, pushToast } = useAqar();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!state) return null;

  const tenant = state.tenants.find((t) => t.id === payment.tenantId);
  const property = state.properties.find((p) => p.id === payment.propertyId);
  const unit = state.units.find((u) => u.id === payment.unitId);
  const contract = state.contracts.find((c) => c.id === payment.contractId);
  const receiver = state.users.find((u) => u.id === payment.receivedBy);

  const contractRemaining = state.installments
    .filter((i) => i.contractId === payment.contractId && i.status !== 'ملغاة')
    .reduce((acc, i) => acc + i.remainingAmount, 0);

  const handleReverse = async () => {
    if (reason.trim().length < 5) {
      triggerHaptic('error');
      pushToast('error', lang === 'ar' ? 'يرجى كتابة سبب واضح للإلغاء العكسي' : 'Please enter a valid reversal reason');
      return;
    }
    setSubmitting(true);
    triggerHaptic('warning');
    const res = await mutate('POST', `/api/payments/${payment.id}/reverse`, { reason }, {
      offlineDescAr: `عكس سند ${payment.receiptNumber}`,
      offlineDescEn: `Reverse ${payment.receiptNumber}`,
    });
    setSubmitting(false);
    if (res) {
      triggerHaptic('success');
      pushToast('success', lang === 'ar' ? `تم إصدار سند عكسي للسند ${payment.receiptNumber}` : 'Receipt reversed');
      setReverseOpen(false);
    }
  };

  const cleanWaPhone = (tenant?.phone || '').replace(/\D/g, '').replace(/^0/, '966');
  const waShareText =
    lang === 'ar'
      ? `سند قبض مالي معتمد (${payment.receiptNumber})\nالمستأجر: ${tenant?.nameAr || ''}\nالعقار والوحدة: ${property?.nameAr || ''} · ${unit?.unitNumber || ''}\nالمبلغ المستلم: ${formatSar(payment.amount, 'ar')}\nالمتبقي على العقد: ${formatSar(contractRemaining, 'ar')}\nالتاريخ: ${formatDateTime(payment.createdAt, 'ar')}`
      : `Official Receipt (${payment.receiptNumber}) - ${tenant?.nameEn || ''} | ${property?.nameEn || ''} (${unit?.unitNumber || ''}) | Amount: ${formatSar(payment.amount, 'en')} | Remaining: ${formatSar(contractRemaining, 'en')}`;
  const waHref = `https://wa.me/${cleanWaPhone}?text=${encodeURIComponent(waShareText)}`;

  const handleDownloadReceiptSummary = () => {
    triggerHaptic('light');
    const content = [
      state.settings.nameAr,
      `رقم السند: ${payment.receiptNumber}`,
      `الحالة: ${payment.status}`,
      `التاريخ: ${formatDateTime(payment.createdAt, 'ar')} (${formatHijri(payment.createdAt)})`,
      `المستأجر: ${tenant?.nameAr || '—'}`,
      `العقار والوحدة: ${property?.nameAr || ''} · ${unit?.unitNumber || ''}`,
      `العقد: ${contract?.internalNumber || ''} · إيجار: ${contract?.ejarNumber || '—'}`,
      `المبلغ المستلم: ${formatSar(payment.amount, 'ar')} (${numberToArabicWords(payment.amount)})`,
      `طريقة الدفع: ${payment.paymentMethod} ${payment.referenceNumber ? `· ${payment.referenceNumber}` : ''}`,
      `المتبقي على العقد: ${formatSar(contractRemaining, 'ar')}`,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payment.receiptNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto print:bg-white print:backdrop-blur-none print:items-start print:p-0">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] text-slate-900 dark:text-slate-100 shadow-2xl print-only-panel animate-aqar-fade-scale">
        {/* Modal Actions Header — Instant Visual Preview & Dedicated Sharing */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-white/10 no-print">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold">
              {lang === 'ar' ? 'معاينة سند القبض المعتمد' : 'Official Receipt Preview'}
            </h3>
            <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
              {payment.receiptNumber}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cleanWaPhone && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => triggerHaptic('light')}
                className="inline-flex items-center gap-1.5 px-3 min-h-[42px] text-xs font-medium rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'واتساب' : 'WhatsApp'}</span>
              </a>
            )}
            <button
              onClick={handleDownloadReceiptSummary}
              className="inline-flex items-center gap-1.5 px-3 min-h-[42px] text-xs font-medium rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تنزيل' : 'Download'}</span>
            </button>
            <button
              onClick={() => {
                triggerHaptic('light');
                window.print();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] text-xs font-semibold rounded-xl bg-[#26478D] text-white hover:bg-[#1e3a75] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF'}</span>
            </button>
            {payment.status === 'معتمد' && hasPermission('reverse_receipts') && (
              <button
                onClick={() => setReverseOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 min-h-[42px] text-xs font-medium rounded-xl border border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'سند عكسي' : 'Reverse'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-6 space-y-5">
          {/* Company Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/10">
            <div>
              <div className="text-lg font-bold text-[#26478D] dark:text-blue-400">{state.settings.nameAr}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {state.settings.nameEn} · سجل تجاري: <span className="font-mono-num">{state.settings.crNumber}</span> · الرقم الضريبي:{' '}
                <span className="font-mono-num">{state.settings.vatNumber}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                {payment.status === 'معتمد' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'سند معتمد وغير قابل للتعديل' : 'Approved & Immutable'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {lang === 'ar'
                      ? `سند معكوس (${payment.reversedByReceiptId})`
                      : `Reversed (${payment.reversedByReceiptId})`}
                  </span>
                )}
              </div>
            </div>
            <QrCodeSvg value={`AQARPLUS|${payment.receiptNumber}|${payment.amount}|${payment.createdAt}`} size={80} />
          </div>

          {/* Core Amount Box */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'رقم السند التسلسلي' : 'Receipt No.'}
              </div>
              <div className="text-base font-semibold font-mono-num mt-0.5">{payment.receiptNumber}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'المبلغ المستلم' : 'Amount Received'}
              </div>
              <div className="text-xl font-bold font-mono-num text-[#26478D] dark:text-blue-400 mt-0.5">
                {formatSar(payment.amount, lang)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'التاريخ والوقت' : 'Date & Time'}
              </div>
              <div className="text-xs font-medium mt-1 font-mono-num">{formatDateTime(payment.createdAt, lang)}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatHijri(payment.createdAt)}</div>
            </div>
          </div>

          <div className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-white/[0.02] px-4 py-2.5 rounded-lg border border-slate-200/70 dark:border-white/10">
            {numberToArabicWords(payment.amount)}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {lang === 'ar' ? 'استلمنا من المستأجر' : 'Received From'}
              </span>
              <span className="font-medium">{tenant?.nameAr || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {lang === 'ar' ? 'العقار والوحدة' : 'Property & Unit'}
              </span>
              <span className="font-medium">
                {property?.nameAr} · {unit?.unitNumber}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {lang === 'ar' ? 'رقم العقد / إيجار' : 'Contract / Ejar'}
              </span>
              <span className="font-mono-num">
                {contract?.internalNumber} · {contract?.ejarNumber || '—'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {lang === 'ar' ? 'طريقة الدفع والمرجع' : 'Method & Ref'}
              </span>
              <span>
                {payment.paymentMethod} {payment.referenceNumber ? `· ${payment.referenceNumber}` : ''}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {lang === 'ar' ? 'بسبب / نوع الدفعة' : 'Payment Purpose'}
              </span>
              <span>{payment.paymentType}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {lang === 'ar' ? 'المتبقي على العقد حالياً' : 'Contract Remaining Balance'}
              </span>
              <span className="font-mono-num font-semibold text-amber-600 dark:text-amber-400">
                {formatSar(contractRemaining, lang)}
              </span>
            </div>
          </div>

          {payment.reversalReason && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300">
              <strong>{lang === 'ar' ? 'سبب الإلغاء العكسي:' : 'Reversal Reason:'}</strong> {payment.reversalReason}
            </div>
          )}

          {/* Footer Signature & Official Digital Verification */}
          <div className="flex flex-wrap items-end justify-between gap-4 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400">
            <div className="space-y-1">
              <div>
                {lang === 'ar' ? 'الموظف المحصل:' : 'Recorded by:'}{' '}
                <span className="text-slate-900 dark:text-slate-200 font-medium">{receiver?.nameAr || payment.receivedBy}</span>
              </div>
              <div>
                {lang === 'ar' ? 'الجهاز:' : 'Device:'} <span className="font-mono-num">{payment.deviceName}</span>
              </div>
            </div>

            {payment.signatureDataUrl && (
              <div className="text-center space-y-1">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {lang === 'ar' ? 'التوقيع الرقمي للمستلم / المستأجر' : 'Digital Signature'}
                </div>
                <div className="p-1.5 rounded-lg bg-white border border-slate-200 inline-block">
                  <img
                    src={payment.signatureDataUrl}
                    alt="Digital Signature"
                    className="h-12 w-36 object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reversal Inline Panel */}
          {reverseOpen && (
            <div className="p-4 rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/10 space-y-3 no-print">
              <div className="text-xs font-semibold text-red-700 dark:text-red-300">
                {lang === 'ar'
                  ? 'إصدار حركة عكسية (لا يتم حذف السند من السجل وفق قواعد التدقيق)'
                  : 'Issue Reversal Entry (Original voucher remains in immutable audit log)'}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={lang === 'ar' ? 'اكتب سبب العكس (مثال: تحويل بنكي مرتجع أو خطأ في رقم العقد)...' : 'Enter reversal reason...'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-red-200 dark:border-red-500/30 bg-white dark:bg-[#0A0E1A] focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setReverseOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/10 cursor-pointer"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleReverse}
                  disabled={submitting}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? lang === 'ar' ? 'جاري التنفيذ...' : 'Processing...'
                    : lang === 'ar' ? 'اعتماد السند العكسي' : 'Confirm Reversal'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
