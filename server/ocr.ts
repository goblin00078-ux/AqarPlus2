import { GoogleGenAI, Type } from '@google/genai';
import type { OcrExtractedData } from '../src/types/aqar';

export interface OcrExtractionInput {
  dataUrl: string;
  mimeType?: string;
  fileName?: string;
  categoryHint?: string;
}

function parseBase64DataUrl(dataUrl: string, fallbackMime?: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/is.exec(dataUrl.trim());
  if (match) {
    return {
      mimeType: match[1].trim(),
      data: match[2].replace(/\s+/g, ''),
    };
  }
  return {
    mimeType: fallbackMime || 'image/jpeg',
    data: dataUrl.trim(),
  };
}

function normalizeGeminiError(err: unknown): Error {
  const msg = (err as Error)?.message || String(err);
  if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403') || msg.includes('401')) {
    return new Error('تعذر التحقق من مفتاح Gemini API. يرجى التحقق من GEMINI_API_KEY في لوحة Secrets.');
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return new Error('تم تجاوز حد الطلبات المؤقت لخدمة Gemini. يرجى المحاولة مرة أخرى بعد قليل.');
  }
  if (msg.includes('NOT_FOUND') || msg.includes('404')) {
    return new Error('نموذج Gemini المحدد غير متاح حالياً (gemini-4-hydrogen).');
  }
  return new Error(msg || 'فشل تحليل المستند باستخدام خدمة Gemini OCR');
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = (err as Error)?.message || '';
      const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('500') || msg.includes('ECONNRESET');
      if (!isTransient || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt - 1)));
    }
  }
  throw normalizeGeminiError(lastError);
}

/**
 * Gemini 4 Hydrogen Document OCR Extraction Service.
 * Extracts structured fields from National IDs / Iqamas, Lease Contracts (Ejar), Deeds, and Invoices.
 */
export async function extractDocumentDataWithGemini(
  input: OcrExtractionInput
): Promise<{ extracted: OcrExtractedData; rawText: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'مفتاح GEMINI_API_KEY غير مضبوط في بيئة الخادم. يرجى إضافته في لوحة Secrets لتشغيل التعرف الضوئي (OCR).'
    );
  }

  if (!input.dataUrl || !input.dataUrl.trim()) {
    throw new Error('لم يتم استلام ملف أو صورة صالحة لتحليلها');
  }

  const { mimeType, data } = parseBase64DataUrl(input.dataUrl, input.mimeType);
  const supportedMimes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType.toLowerCase();
  if (!supportedMimes.includes(normalizedMime)) {
    throw new Error(`نوع الملف (${mimeType}) غير مدعوم في OCR. الصيغ المدعومة: PNG, JPG, WEBP, PDF.`);
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const prompt = [
    'أنت نظام استخراج نصوص وبيانات عقارية عربي/إنجليزي عالي الدقة لمنصة AqarPlus لإدارة الأملاك في السعودية والخليج.',
    input.categoryHint ? `تصنيف المستند المتوقع من المستخدم: ${input.categoryHint}.` : '',
    input.fileName ? `اسم الملف: ${input.fileName}.` : '',
    'حلّل المستند المرفق (صورة هوية وطنية، إقامة، عقد إيجار إلكتروني / ورقي، صك ملكية عقارية، أو فاتورة) بدقة، واستخرج جميع الحقول الظاهرة بصيغة JSON مطابقة للمخطط.',
    'التزم بالقواعد التالية:',
    '- في الهويات والإقامات: استخرج الاسم بالعربية والإنجليزية، رقم الهوية/الإقامة (10 أرقام)، الجنسية، جهة العمل/الكفيل إن وجدت، وتاريخ الانتهاء بصيغة YYYY-MM-DD.',
    '- في عقود الإيجار: استخرج اسم المستأجر، رقم هويته، جواله، اسم العقار/المبنى، المدينة، الحي، الشارع، العنوان الوطني، رقم الصك، رقم العقد، رقم توثيق إيجار، رقم الوحدة ونوعها، تاريخ البداية والنهاية، قيمة الإيجار السنوي، التأمين، دورية السداد، واسم المؤجر/المالك.',
    '- اكتب التواريخ بصيغة YYYY-MM-DD إن أمكن (وحوّل الأرقام العربية الهندية إلى أرقام إنجليزية 0-9 في الأرقام والتواريخ).',
    '- ضع النص الكامل المقروء من المستند في حقل rawText.',
    '- لا تخمّن قيماً غير موجودة في المستند.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await generateWithRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMime,
              data,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction:
          'أنت محرك OCR عقاري دقيق. أعد بيانات JSON نظيفة تطابق المخطط المطلوب فقط دون نصوص إضافية خارج JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            docType: {
              type: Type.STRING,
              enum: ['عقد إيجار', 'صك ملكية', 'هوية / إقامة', 'فاتورة / مستند مالي', 'أخرى'],
            },
            tenantNameAr: { type: Type.STRING },
            tenantNameEn: { type: Type.STRING },
            nationalIdOrIqama: { type: Type.STRING },
            nationality: { type: Type.STRING },
            phone: { type: Type.STRING },
            email: { type: Type.STRING },
            employer: { type: Type.STRING },
            propertyNameAr: { type: Type.STRING },
            deedNumber: { type: Type.STRING },
            city: { type: Type.STRING },
            district: { type: Type.STRING },
            street: { type: Type.STRING },
            nationalAddress: { type: Type.STRING },
            buildingName: { type: Type.STRING },
            contractNumber: { type: Type.STRING },
            ejarNumber: { type: Type.STRING },
            unitNumber: { type: Type.STRING },
            unitType: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING },
            annualRent: { type: Type.NUMBER },
            securityDeposit: { type: Type.NUMBER },
            paymentFrequency: { type: Type.STRING, enum: ['شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي'] },
            landlordNameAr: { type: Type.STRING },
            currency: { type: Type.STRING, enum: ['SAR', 'AED', 'USD', 'EGP', 'KWD'] },
            expiryDate: { type: Type.STRING },
            rawText: { type: Type.STRING },
            confidenceNote: { type: Type.STRING },
          },
          required: ['docType', 'rawText'],
        },
      },
    })
  );

  const text = (response.text || '').trim();
  if (!text) {
    throw new Error('لم يُرجع محرك التعرف الضوئي أي نصوص من المستند المرفق');
  }

  const parsed = JSON.parse(text) as OcrExtractedData;
  return {
    extracted: parsed,
    rawText: parsed.rawText || text,
  };
}
