export interface NormalizedPoint {
  x: number; // 0..1 relative to image width
  y: number; // 0..1 relative to image height
}

export interface DocumentCorners {
  tl: NormalizedPoint;
  tr: NormalizedPoint;
  br: NormalizedPoint;
  bl: NormalizedPoint;
}

export type ScanFilterMode = 'enhanced_color' | 'bw_document' | 'grayscale' | 'original';

export interface ScanProcessOptions {
  corners: DocumentCorners;
  tiltDeg: number; // Fine deskew angle (-15 to +15)
  rotateQuarterTurns: number; // 0, 1, 2, 3 (90 deg steps)
  filterMode: ScanFilterMode;
  sharpen?: boolean;
  contrastBoost?: number; // 0..40
}

export interface ProcessedScanResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeKb: number;
  mimeType: string;
}

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

/**
 * Browser Camera API wrapper for document scanning.
 */
export const DocumentCameraApi = {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  },

  async listCameras(): Promise<CameraDeviceInfo[]> {
    if (!this.isSupported() || !navigator.mediaDevices.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `كاميرا ${idx + 1}`,
      }));
  },

  async openStream(opts?: {
    facingMode?: 'environment' | 'user';
    deviceId?: string;
  }): Promise<MediaStream> {
    if (!this.isSupported()) {
      throw new Error('المتصفح الحالي لا يدعم واجهة الكاميرا (MediaDevices API). يمكنك استيراد صورة مباشرة.');
    }

    const videoConstraints: MediaTrackConstraints = opts?.deviceId
      ? {
          deviceId: { exact: opts.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1280 },
        }
      : {
          facingMode: { ideal: opts?.facingMode || 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1280 },
        };

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        throw new Error('تم رفض إذن الوصول إلى الكاميرا. يرجى تفعيل صلاحية الكاميرا من إعدادات المتصفح أو استيراد صورة.');
      }
      if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        throw new Error('لم يتم العثور على كاميرا متصلة بهذا الجهاز. يمكنك استيراد صورة لتطبيق القص والتحسين.');
      }
      if (e?.name === 'OverconstrainedError' && opts?.facingMode) {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      throw new Error(e?.message || 'تعذر تشغيل كاميرا الجهاز');
    }
  },

  stopStream(stream: MediaStream | null | undefined): void {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore track stop error
      }
    });
  },

  captureVideoFrame(video: HTMLVideoElement): string {
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر إنشاء مساحة الرسم لالتقاط الصورة');
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.94);
  },
};

export function getDefaultDocumentCorners(): DocumentCorners {
  return {
    tl: { x: 0.06, y: 0.06 },
    tr: { x: 0.94, y: 0.06 },
    br: { x: 0.94, y: 0.94 },
    bl: { x: 0.06, y: 0.94 },
  };
}

/**
 * Loads an image Data URL into an HTMLImageElement.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر تحميل الصورة للمعالجة'));
    img.src = src;
  });
}

/**
 * Heuristic edge-energy detector for suggesting automatic document borders (Auto-Crop).
 */
export function detectDocumentBounds(img: HTMLImageElement): DocumentCorners {
  const sampleW = 160;
  const sampleH = Math.max(80, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * sampleW));
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return getDefaultDocumentCorners();

  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  const luma = new Float32Array(sampleW * sampleH);
  for (let i = 0; i < luma.length; i++) {
    const idx = i * 4;
    luma[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  // Row and column gradient profile
  const colScore = new Float32Array(sampleW);
  const rowScore = new Float32Array(sampleH);
  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const gx = Math.abs(luma[y * sampleW + (x + 1)] - luma[y * sampleW + (x - 1)]);
      const gy = Math.abs(luma[(y + 1) * sampleW + x] - luma[(y - 1) * sampleW + x]);
      const g = gx + gy;
      if (g > 28) {
        colScore[x] += g;
        rowScore[y] += g;
      }
    }
  }

  const findEdge = (arr: Float32Array, fromStart: boolean, limitRatio: number) => {
    const maxSearch = Math.floor(arr.length * limitRatio);
    let bestIdx = fromStart ? Math.floor(arr.length * 0.05) : Math.floor(arr.length * 0.95);
    let bestVal = 0;
    if (fromStart) {
      for (let i = 2; i < maxSearch; i++) {
        if (arr[i] > bestVal) {
          bestVal = arr[i];
          bestIdx = i;
        }
      }
    } else {
      for (let i = arr.length - 3; i >= arr.length - maxSearch; i--) {
        if (arr[i] > bestVal) {
          bestVal = arr[i];
          bestIdx = i;
        }
      }
    }
    return bestVal > 220 ? bestIdx / arr.length : fromStart ? 0.06 : 0.94;
  };

  const left = Math.min(0.25, Math.max(0.02, findEdge(colScore, true, 0.28)));
  const right = Math.max(0.75, Math.min(0.98, findEdge(colScore, false, 0.28)));
  const top = Math.min(0.25, Math.max(0.02, findEdge(rowScore, true, 0.28)));
  const bottom = Math.max(0.75, Math.min(0.98, findEdge(rowScore, false, 0.28)));

  return {
    tl: { x: left, y: top },
    tr: { x: right, y: top },
    br: { x: right, y: bottom },
    bl: { x: left, y: bottom },
  };
}

/**
 * Solves 8x8 linear system to find perspective homography mapping destination rect (0,0)-(W,H) to source quad.
 */
function computeHomography(
  src: [number, number][],
  dst: [number, number][]
): number[] {
  // Build 8x9 augmented matrix for M * h = rhs
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [xs, ys] = src[i];
    const [xd, yd] = dst[i];
    A.push([xs, ys, 1, 0, 0, 0, -xd * xs, -xd * ys, xd]);
    A.push([0, 0, 0, xs, ys, 1, -yd * xs, -yd * ys, yd]);
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivotRow][col])) pivotRow = r;
    }
    [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
    const div = A[col][col] || 1e-12;
    for (let j = col; j < 9; j++) A[col][j] /= div;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      for (let j = col; j < 9; j++) A[r][j] -= factor * A[col][j];
    }
  }

  return [
    A[0][8],
    A[1][8],
    A[2][8],
    A[3][8],
    A[4][8],
    A[5][8],
    A[6][8],
    A[7][8],
    1,
  ];
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Applies full 4-point perspective Crop & Deskew + Tilt rotation + Document Enhancement Filters.
 */
export async function processScannedDocument(
  sourceDataUrl: string,
  options: ScanProcessOptions
): Promise<ProcessedScanResult> {
  const img = await loadImageElement(sourceDataUrl);
  const rawW = img.naturalWidth || img.width;
  const rawH = img.naturalHeight || img.height;

  // Step 1: Apply 90-degree quarter-turns + fine deskew tilt onto an intermediate source canvas
  const quarter = ((options.rotateQuarterTurns % 4) + 4) % 4;
  const rotCanvas = document.createElement('canvas');
  const swapped = quarter % 2 === 1;
  const baseW = swapped ? rawH : rawW;
  const baseH = swapped ? rawW : rawH;
  rotCanvas.width = baseW;
  rotCanvas.height = baseH;
  const rctx = rotCanvas.getContext('2d');
  if (!rctx) throw new Error('تعذر تهيئة معالج الصور');

  rctx.fillStyle = '#ffffff';
  rctx.fillRect(0, 0, baseW, baseH);
  rctx.save();
  rctx.translate(baseW / 2, baseH / 2);
  rctx.rotate(((quarter * 90 + options.tiltDeg) * Math.PI) / 180);
  rctx.drawImage(img, -rawW / 2, -rawH / 2, rawW, rawH);
  rctx.restore();

  const srcData = rctx.getImageData(0, 0, baseW, baseH);
  const sp = srcData.data;

  // Source quadrilateral pixel coords from normalized corners
  const c = options.corners;
  const pTL: [number, number] = [c.tl.x * baseW, c.tl.y * baseH];
  const pTR: [number, number] = [c.tr.x * baseW, c.tr.y * baseH];
  const pBR: [number, number] = [c.br.x * baseW, c.br.y * baseH];
  const pBL: [number, number] = [c.bl.x * baseW, c.bl.y * baseH];

  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const estW = Math.max(240, Math.round(Math.max(dist(pTL, pTR), dist(pBL, pBR))));
  const estH = Math.max(240, Math.round(Math.max(dist(pTL, pBL), dist(pTR, pBR))));

  // Limit max output dimension to 1600px for crisp OCR + fast upload (< 15MB)
  const scale = Math.min(1, 1600 / Math.max(estW, estH));
  const outW = Math.max(160, Math.round(estW * scale));
  const outH = Math.max(160, Math.round(estH * scale));

  // Inverse homography: map output rectangle -> source quad
  const H = computeHomography(
    [
      [0, 0],
      [outW - 1, 0],
      [outW - 1, outH - 1],
      [0, outH - 1],
    ],
    [pTL, pTR, pBR, pBL]
  );

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const octx = outCanvas.getContext('2d');
  if (!octx) throw new Error('تعذر إنشاء الصورة النهائية');

  const outImg = octx.createImageData(outW, outH);
  const dp = outImg.data;

  // Bilinear perspective resampling
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = H[6] * x + H[7] * y + H[8] || 1e-9;
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;

      const ix = Math.max(0, Math.min(baseW - 2, Math.floor(sx)));
      const iy = Math.max(0, Math.min(baseH - 2, Math.floor(sy)));
      const fx = Math.max(0, Math.min(1, sx - ix));
      const fy = Math.max(0, Math.min(1, sy - iy));

      const i00 = (iy * baseW + ix) * 4;
      const i10 = (iy * baseW + (ix + 1)) * 4;
      const i01 = ((iy + 1) * baseW + ix) * 4;
      const i11 = ((iy + 1) * baseW + (ix + 1)) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const dstIdx = (y * outW + x) * 4;
      dp[dstIdx] = sp[i00] * w00 + sp[i10] * w10 + sp[i01] * w01 + sp[i11] * w11;
      dp[dstIdx + 1] = sp[i00 + 1] * w00 + sp[i10 + 1] * w10 + sp[i01 + 1] * w01 + sp[i11 + 1] * w11;
      dp[dstIdx + 2] = sp[i00 + 2] * w00 + sp[i10 + 2] * w10 + sp[i01 + 2] * w01 + sp[i11 + 2] * w11;
      dp[dstIdx + 3] = 255;
    }
  }

  // Step 2: Apply Document Enhancement Filters
  if (options.filterMode !== 'original') {
    const totalPixels = outW * outH;
    const luma = new Float32Array(totalPixels);
    let minL = 255;
    let maxL = 0;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const lum = 0.299 * dp[idx] + 0.587 * dp[idx + 1] + 0.114 * dp[idx + 2];
      luma[i] = lum;
      if (lum < minL) minL = lum;
      if (lum > maxL) maxL = lum;
    }

    const span = Math.max(40, maxL - minL);
    const boost = 1 + (options.contrastBoost ?? 20) / 100;

    if (options.filterMode === 'bw_document') {
      // Integral image for fast adaptive local thresholding (Bradley-Roth style)
      const integral = new Float64Array(totalPixels);
      for (let y = 0; y < outH; y++) {
        let rowSum = 0;
        for (let x = 0; x < outW; x++) {
          const i = y * outW + x;
          rowSum += luma[i];
          integral[i] = rowSum + (y > 0 ? integral[(y - 1) * outW + x] : 0);
        }
      }
      const radius = Math.max(8, Math.floor(Math.min(outW, outH) / 28));
      const tRatio = 0.87;
      for (let y = 0; y < outH; y++) {
        const y1 = Math.max(0, y - radius);
        const y2 = Math.min(outH - 1, y + radius);
        for (let x = 0; x < outW; x++) {
          const x1 = Math.max(0, x - radius);
          const x2 = Math.min(outW - 1, x + radius);
          const count = (x2 - x1 + 1) * (y2 - y1 + 1);
          const sum =
            integral[y2 * outW + x2] -
            (y1 > 0 ? integral[(y1 - 1) * outW + x2] : 0) -
            (x1 > 0 ? integral[y2 * outW + (x1 - 1)] : 0) +
            (y1 > 0 && x1 > 0 ? integral[(y1 - 1) * outW + (x1 - 1)] : 0);
          const mean = sum / count;
          const idx = (y * outW + x) * 4;
          const pix = luma[y * outW + x];
          const val = pix < mean * tRatio ? Math.max(15, pix * 0.45) : 252;
          dp[idx] = val;
          dp[idx + 1] = val;
          dp[idx + 2] = val;
        }
      }
    } else if (options.filterMode === 'grayscale') {
      for (let i = 0; i < totalPixels; i++) {
        const norm = ((luma[i] - minL) / span) * 255;
        const v = clampByte((norm - 128) * boost + 128);
        const idx = i * 4;
        dp[idx] = v;
        dp[idx + 1] = v;
        dp[idx + 2] = v;
      }
    } else if (options.filterMode === 'enhanced_color') {
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        for (let ch = 0; ch < 3; ch++) {
          const stretched = ((dp[idx + ch] - minL * 0.65) / Math.max(50, maxL - minL * 0.5)) * 255;
          dp[idx + ch] = clampByte((stretched - 128) * boost + 132);
        }
      }
    }
  }

  // Step 3: Optional subtle unsharp mask for crisp Arabic diacritics/digits
  if (options.sharpen !== false && outW > 8 && outH > 8) {
    const copy = new Uint8ClampedArray(dp);
    for (let y = 1; y < outH - 1; y++) {
      for (let x = 1; x < outW - 1; x++) {
        const idx = (y * outW + x) * 4;
        const up = ((y - 1) * outW + x) * 4;
        const dn = ((y + 1) * outW + x) * 4;
        const lf = (y * outW + (x - 1)) * 4;
        const rt = (y * outW + (x + 1)) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const val = copy[idx + ch] * 1.4 - 0.1 * (copy[up + ch] + copy[dn + ch] + copy[lf + ch] + copy[rt + ch]);
          dp[idx + ch] = clampByte(val);
        }
      }
    }
  }

  octx.putImageData(outImg, 0, 0);
  const mimeType = 'image/jpeg';
  const dataUrl = outCanvas.toDataURL(mimeType, 0.9);
  const base64Len = dataUrl.split(',')[1]?.length || 0;
  const sizeKb = Math.max(1, Math.round((base64Len * 3) / 4 / 1024));

  return {
    dataUrl,
    width: outW,
    height: outH,
    sizeKb,
    mimeType,
  };
}
