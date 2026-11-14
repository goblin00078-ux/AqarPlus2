import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crop,
  FlipHorizontal2,
  ImagePlus,
  Loader2,
  RefreshCw,
  RotateCw,
  Sliders,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  CameraDeviceInfo,
  DocumentCameraApi,
  DocumentCorners,
  ProcessedScanResult,
  ScanFilterMode,
  detectDocumentBounds,
  getDefaultDocumentCorners,
  loadImageElement,
  processScannedDocument,
} from '../utils/documentScanProcessor';

interface CameraDocumentScannerModalProps {
  open: boolean;
  lang: 'ar' | 'en';
  initialImageDataUrl?: string;
  onClose: () => void;
  onComplete: (result: ProcessedScanResult) => void;
}

type CornerKey = keyof DocumentCorners;

const CORNER_KEYS: CornerKey[] = ['tl', 'tr', 'br', 'bl'];

const FILTER_OPTIONS: { id: ScanFilterMode; labelAr: string; labelEn: string }[] = [
  { id: 'enhanced_color', labelAr: 'ملون معزّز', labelEn: 'Enhanced Color' },
  { id: 'bw_document', labelAr: 'مسح نصي (أبيض وأسود)', labelEn: 'B&W Document' },
  { id: 'grayscale', labelAr: 'تدرج رمادي', labelEn: 'Grayscale' },
  { id: 'original', labelAr: 'الأصل بدون فلتر', labelEn: 'Original' },
];

export function CameraDocumentScannerModal({
  open,
  lang,
  initialImageDataUrl,
  onClose,
  onComplete,
}: CameraDocumentScannerModalProps) {
  const isAr = lang === 'ar';

  const [phase, setPhase] = useState<'camera' | 'crop'>('camera');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);

  // Captured / loaded image before crop+deskew
  const [rawImageSrc, setRawImageSrc] = useState<string>('');
  const [rotatedPreviewUrl, setRotatedPreviewUrl] = useState<string>('');
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number }>({ w: 4, h: 3 });

  // Crop + Deskew controls
  const [corners, setCorners] = useState<DocumentCorners>(getDefaultDocumentCorners);
  const [tiltDeg, setTiltDeg] = useState<number>(0);
  const [rotateQuarterTurns, setRotateQuarterTurns] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<ScanFilterMode>('enhanced_color');
  const [sharpen, setSharpen] = useState<boolean>(true);
  const [processedPreview, setProcessedPreview] = useState<ProcessedScanResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);

  const stopActiveCamera = useCallback(() => {
    if (streamRef.current) {
      DocumentCameraApi.stopStream(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user', deviceId?: string) => {
      stopActiveCamera();
      setCameraError(null);
      setIsStartingCamera(true);
      try {
        const stream = await DocumentCameraApi.openStream({
          facingMode: mode,
          deviceId: deviceId || undefined,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const available = await DocumentCameraApi.listCameras();
        setCameras(available);
      } catch (err) {
        setCameraError((err as Error).message);
      } finally {
        setIsStartingCamera(false);
      }
    },
    [stopActiveCamera]
  );

  // Initialize modal state on open/close
  useEffect(() => {
    if (!open) {
      stopActiveCamera();
      return;
    }

    setTiltDeg(0);
    setRotateQuarterTurns(0);
    setFilterMode('enhanced_color');
    setSharpen(true);
    setProcessedPreview(null);
    setCorners(getDefaultDocumentCorners());

    if (initialImageDataUrl) {
      setRawImageSrc(initialImageDataUrl);
      setPhase('crop');
      stopActiveCamera();
    } else {
      setRawImageSrc('');
      setPhase('camera');
      void startCamera(facingMode, selectedDeviceId || undefined);
    }

    return () => {
      stopActiveCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialImageDataUrl]);

  // Render rotated + tilted preview matching `processScannedDocument` coordinate frame
  useEffect(() => {
    if (!open || phase !== 'crop' || !rawImageSrc) return;
    let cancelled = false;

    loadImageElement(rawImageSrc)
      .then((img) => {
        if (cancelled) return;
        const rawW = img.naturalWidth || img.width;
        const rawH = img.naturalHeight || img.height;
        const quarter = ((rotateQuarterTurns % 4) + 4) % 4;
        const swapped = quarter % 2 === 1;
        const baseW = swapped ? rawH : rawW;
        const baseH = swapped ? rawW : rawH;

        const maxSide = 960;
        const scale = Math.min(1, maxSide / Math.max(baseW, baseH));
        const cw = Math.max(120, Math.round(baseW * scale));
        const ch = Math.max(120, Math.round(baseH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(((quarter * 90 + tiltDeg) * Math.PI) / 180);
        ctx.drawImage(img, -(rawW * scale) / 2, -(rawH * scale) / 2, rawW * scale, rawH * scale);
        ctx.restore();

        setPreviewDims({ w: cw, h: ch });
        setRotatedPreviewUrl(canvas.toDataURL('image/jpeg', 0.88));
        setProcessedPreview(null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [open, phase, rawImageSrc, rotateQuarterTurns, tiltDeg]);

  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    try {
      const frameUrl = DocumentCameraApi.captureVideoFrame(videoRef.current);
      stopActiveCamera();
      setRawImageSrc(frameUrl);
      setTiltDeg(0);
      setRotateQuarterTurns(0);
      setProcessedPreview(null);
      setPhase('crop');

      // Run initial auto-crop edge detection
      loadImageElement(frameUrl)
        .then((img) => setCorners(detectDocumentBounds(img)))
        .catch(() => setCorners(getDefaultDocumentCorners()));
    } catch (err) {
      setCameraError((err as Error).message);
    }
  };

  const handleImportImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        stopActiveCamera();
        setRawImageSrc(dataUrl);
        setTiltDeg(0);
        setRotateQuarterTurns(0);
        setProcessedPreview(null);
        setPhase('crop');
        loadImageElement(dataUrl)
          .then((img) => setCorners(detectDocumentBounds(img)))
          .catch(() => setCorners(getDefaultDocumentCorners()));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAutoCrop = async () => {
    const targetSrc = rotatedPreviewUrl || rawImageSrc;
    if (!targetSrc) return;
    try {
      const img = await loadImageElement(targetSrc);
      setCorners(detectDocumentBounds(img));
      setProcessedPreview(null);
    } catch {
      setCorners(getDefaultDocumentCorners());
    }
  };

  const handleGeneratePreview = async () => {
    if (!rawImageSrc) return;
    setIsProcessing(true);
    try {
      const result = await processScannedDocument(rawImageSrc, {
        corners,
        tiltDeg,
        rotateQuarterTurns,
        filterMode,
        sharpen,
      });
      setProcessedPreview(result);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!rawImageSrc) return;
    setIsProcessing(true);
    try {
      const result = await processScannedDocument(rawImageSrc, {
        corners,
        tiltDeg,
        rotateQuarterTurns,
        filterMode,
        sharpen,
      });
      stopActiveCamera();
      onComplete(result);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateCornerFromPointer = (cornerKey: CornerKey, clientX: number, clientY: number) => {
    const box = cropBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(0.01, Math.min(0.99, (clientX - rect.left) / rect.width));
    const ny = Math.max(0.01, Math.min(0.99, (clientY - rect.top) / rect.height));
    setCorners((prev) => ({
      ...prev,
      [cornerKey]: { x: nx, y: ny },
    }));
    setProcessedPreview(null);
  };

  if (!open) return null;

  const polygonPoints = `${corners.tl.x * 100},${corners.tl.y * 100} ${corners.tr.x * 100},${corners.tr.y * 100} ${
    corners.br.x * 100
  },${corners.br.y * 100} ${corners.bl.x * 100},${corners.bl.y * 100}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto no-print">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0F1526] overflow-hidden shadow-2xl my-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#26478D]/15 text-[#26478D] dark:text-blue-400">
              {phase === 'camera' ? <Camera className="w-5 h-5" /> : <Crop className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                {phase === 'camera'
                  ? isAr
                    ? 'ماسح المستندات بالكاميرا (Camera Scan)'
                    : 'Camera Document Scanner'
                  : isAr
                  ? 'قص المستند وتعديل الانحراف وتحسين الجودة (Crop & Deskew)'
                  : 'Crop, Deskew & Enhance Document'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {phase === 'camera'
                  ? isAr
                    ? 'وجّه الكاميرا نحو العقد أو الصك أو الهوية داخل الإطار ثم التقط الصورة'
                    : 'Align document inside the guide frame and capture'
                  : isAr
                  ? 'اسحب الزوايا الأربع لضبط المنظور وعدّل زاوية الميلان واختر فلتر الوضوح قبل الحفظ'
                  : 'Drag 4 corners, fine-tune tilt deskew, and apply clarity filters'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopActiveCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Phase 1: Live Camera Viewfinder */}
        {phase === 'camera' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video max-h-[60vh] flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />

              {/* Document Alignment Guide Overlay */}
              {!cameraError && (
                <div className="pointer-events-none absolute inset-6 sm:inset-10 border-2 border-dashed border-emerald-400/70 rounded-xl flex items-end justify-center pb-3">
                  <span className="px-3 py-1 rounded-lg bg-slate-950/75 text-emerald-300 text-[11px] font-medium">
                    {isAr ? 'ضع حواف المستند داخل الإطار الأخضر' : 'Align document edges inside frame'}
                  </span>
                </div>
              )}

              {isStartingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white gap-2 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  <span>{isAr ? 'جاري الاتصال بكاميرا الجهاز...' : 'Connecting to device camera...'}</span>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6 gap-3">
                  <Camera className="w-10 h-10 text-amber-400" />
                  <p className="text-xs sm:text-sm text-amber-200 max-w-md leading-relaxed">{cameraError}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void startCamera(facingMode, selectedDeviceId || undefined)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{isAr ? 'إعادة المحاولة' : 'Retry Camera'}</span>
                    </button>
                    <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#26478D] hover:bg-[#1e3a75] text-white text-xs font-semibold cursor-pointer">
                      <ImagePlus className="w-4 h-4" />
                      <span>{isAr ? 'استيراد صورة للقص والتحسين' : 'Import Image to Crop & Deskew'}</span>
                      <input type="file" accept="image/*" onChange={handleImportImageFile} className="hidden" />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Camera Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = facingMode === 'environment' ? 'user' : 'environment';
                    setFacingMode(next);
                    setSelectedDeviceId('');
                    void startCamera(next);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  <FlipHorizontal2 className="w-4 h-4" />
                  <span>{facingMode === 'environment' ? (isAr ? 'الكاميرا الخلفية' : 'Rear') : isAr ? 'الكاميرا الأمامية' : 'Front'}</span>
                </button>

                {cameras.length > 1 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      void startCamera(facingMode, e.target.value);
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A] text-xs"
                  >
                    <option value="">{isAr ? 'اختيار الكاميرا التلقائي' : 'Auto Camera'}</option>
                    {cameras.map((cam) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label}
                      </option>
                    ))}
                  </select>
                )}

                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                  <ImagePlus className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                  <span>{isAr ? 'اختيار صورة من الجهاز' : 'Import Photo'}</span>
                  <input type="file" accept="image/*" onChange={handleImportImageFile} className="hidden" />
                </label>
              </div>

              <button
                type="button"
                disabled={Boolean(cameraError) || isStartingCamera}
                onClick={handleCapturePhoto}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>{isAr ? 'التقاط المستند (Capture)' : 'Capture Document'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Phase 2: Interactive Crop, Deskew & Filter Enhancement Studio */}
        {phase === 'crop' && (
          <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 cols: Interactive 4-Corner Perspective Canvas / Comparison */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {processedPreview
                    ? isAr
                      ? `معاينة المستند المحسّن (${processedPreview.width}×${processedPreview.height} · ${processedPreview.sizeKb} KB)`
                      : `Enhanced Preview (${processedPreview.width}x${processedPreview.height})`
                    : isAr
                    ? 'اسحب الدوائر الأربعة لتحديد حدود الورقة بدقة'
                    : 'Drag the 4 corner handles to fit document edges'}
                </span>
                {processedPreview && (
                  <button
                    type="button"
                    onClick={() => setProcessedPreview(null)}
                    className="text-[#26478D] dark:text-blue-400 underline cursor-pointer text-[11px]"
                  >
                    {isAr ? 'العودة لتعديل الزوايا' : 'Back to corner adjustment'}
                  </button>
                )}
              </div>

              <div className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-900/95 p-3 flex items-center justify-center min-h-[320px] max-h-[60vh]">
                {processedPreview ? (
                  <img
                    src={processedPreview.dataUrl}
                    alt="Enhanced Scan Preview"
                    className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-lg"
                  />
                ) : (
                  <div
                    ref={cropBoxRef}
                    style={{ aspectRatio: `${previewDims.w} / ${previewDims.h}` }}
                    className="relative max-h-[55vh] max-w-full select-none touch-none shadow-lg"
                  >
                    {rotatedPreviewUrl && (
                      <img
                        src={rotatedPreviewUrl}
                        alt="Document Crop Workspace"
                        draggable={false}
                        className="w-full h-full object-fill rounded-lg pointer-events-none"
                      />
                    )}

                    {/* Perspective Quad SVG */}
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      <polygon
                        points={polygonPoints}
                        fill="rgba(16, 185, 129, 0.14)"
                        stroke="#10b981"
                        strokeWidth="0.6"
                        strokeDasharray="1.8 1.2"
                      />
                    </svg>

                    {/* 4 Draggable Handles */}
                    {CORNER_KEYS.map((key) => {
                      const pt = corners[key];
                      const isDragging = activeCorner === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-label={`corner-${key}`}
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            setActiveCorner(key);
                          }}
                          onPointerMove={(e) => {
                            if (activeCorner === key) {
                              updateCornerFromPointer(key, e.clientX, e.clientY);
                            }
                          }}
                          onPointerUp={(e) => {
                            if (activeCorner === key) {
                              e.currentTarget.releasePointerCapture(e.pointerId);
                              setActiveCorner(null);
                            }
                          }}
                          style={{
                            left: `${pt.x * 100}%`,
                            top: `${pt.y * 100}%`,
                          }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white shadow-md cursor-grab active:cursor-grabbing transition-transform ${
                            isDragging ? 'scale-125 bg-amber-400' : 'bg-emerald-500 hover:scale-110'
                          }`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Geometry Tools */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoCrop}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-semibold cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تحديد الحواف تلقائياً (Auto-Crop)' : 'Auto-Crop Edges'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRotateQuarterTurns((r) => (r + 1) % 4);
                    setCorners(getDefaultDocumentCorners());
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تدوير 90°' : 'Rotate 90°'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCorners(getDefaultDocumentCorners());
                    setTiltDeg(0);
                    setProcessedPreview(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة ضبط الزوايا' : 'Reset'}</span>
                </button>
                {!initialImageDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('camera');
                      void startCamera(facingMode, selectedDeviceId || undefined);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إعادة الالتقاط' : 'Retake'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right 5 cols: Deskew Slider + Clarity Filters + Confirm */}
            <div className="lg:col-span-5 space-y-4 text-xs flex flex-col justify-between">
              <div className="space-y-4">
                {/* Deskew Fine Tilt Control */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Sliders className="w-4 h-4 text-[#26478D] dark:text-blue-400" />
                      <span>{isAr ? 'تعديل الميلان والانحراف (Deskew)' : 'Fine Deskew Angle'}</span>
                    </span>
                    <span className="font-mono-num font-bold text-[#26478D] dark:text-blue-300">
                      {tiltDeg > 0 ? `+${tiltDeg}` : tiltDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-15}
                    max={15}
                    step={0.5}
                    value={tiltDeg}
                    onChange={(e) => setTiltDeg(Number(e.target.value))}
                    className="w-full accent-[#26478D] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono-num text-slate-400">
                    <span>-15°</span>
                    <button
                      type="button"
                      onClick={() => setTiltDeg(0)}
                      className="text-slate-500 hover:text-[#26478D] cursor-pointer"
                    >
                      0°
                    </button>
                    <span>+15°</span>
                  </div>
                </div>

                {/* Enhancement Filters */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{isAr ? 'خوارزميات تحسين وضوح المستند' : 'Document Enhancement Filter'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFilterMode(opt.id);
                          setProcessedPreview(null);
                        }}
                        className={`px-3 py-2 rounded-xl border text-[11px] font-semibold text-start transition-colors cursor-pointer ${
                          filterMode === opt.id
                            ? 'border-[#26478D] bg-[#26478D]/10 text-[#26478D] dark:text-blue-300'
                            : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                      >
                        {isAr ? opt.labelAr : opt.labelEn}
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sharpen}
                      onChange={(e) => {
                        setSharpen(e.target.checked);
                        setProcessedPreview(null);
                      }}
                      className="rounded accent-[#26478D]"
                    />
                    <span className="text-[11px] font-medium">
                      {isAr ? 'تفعيل فلتر حدة النصوص والأرقام (Unsharp Mask)' : 'Enable Text Sharpening'}
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleGeneratePreview}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#26478D]/40 bg-[#26478D]/10 text-[#26478D] dark:text-blue-300 hover:bg-[#26478D]/20 font-semibold cursor-pointer"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{isAr ? 'معاينة النتيجة النهائية قبل الحفظ' : 'Preview Processed Scan'}</span>
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    stopActiveCamera();
                    onClose();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleConfirmSave}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold shadow cursor-pointer"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{isAr ? 'اعتماد الصورة المحسّنة' : 'Apply & Use Scan'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
