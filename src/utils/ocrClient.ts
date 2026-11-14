import type {
  AqarDatabaseState,
  OcrEntityMatchResult,
  OcrExtractedData,
  OcrSyncSummary,
} from '../types/aqar';

export interface OcrApiResponse {
  extracted: OcrExtractedData;
  rawText: string;
  matches: OcrEntityMatchResult;
  syncSummary?: OcrSyncSummary;
  state?: AqarDatabaseState;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('تعذر قراءة الملف المرفوع'));
    };
    reader.onerror = () => reject(new Error('حدث خطأ أثناء قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export async function runGeminiOcrExtraction(params: {
  userId: string;
  dataUrl: string;
  mimeType?: string;
  fileName?: string;
  categoryHint?: string;
  autoSync?: boolean;
  targetTenantId?: string;
  targetPropertyId?: string;
  applyTenant?: boolean;
  applyProperty?: boolean;
  createMissing?: boolean;
}): Promise<OcrApiResponse> {
  const res = await fetch('/api/documents/ocr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': params.userId || 'usr-gm',
    },
    body: JSON.stringify({
      dataUrl: params.dataUrl,
      mimeType: params.mimeType,
      fileName: params.fileName,
      categoryHint: params.categoryHint,
      autoSync: params.autoSync,
      targetTenantId: params.targetTenantId,
      targetPropertyId: params.targetPropertyId,
      applyTenant: params.applyTenant,
      applyProperty: params.applyProperty,
      createMissing: params.createMissing,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'فشل تحليل المستند باستخدام Gemini OCR');
  }
  return json as OcrApiResponse;
}

export async function syncOcrEntities(params: {
  userId: string;
  extracted: OcrExtractedData;
  docId?: string;
  targetTenantId?: string;
  targetPropertyId?: string;
  applyTenant?: boolean;
  applyProperty?: boolean;
  createMissing?: boolean;
}): Promise<{
  summary: OcrSyncSummary;
  tenant?: { id: string; nameAr: string };
  property?: { id: string; nameAr: string };
  state?: AqarDatabaseState;
}> {
  const res = await fetch('/api/documents/sync-ocr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': params.userId || 'usr-gm',
    },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'فشل ربط البيانات المستخرجة بالمستأجرين والعقارات');
  }
  return json;
}
