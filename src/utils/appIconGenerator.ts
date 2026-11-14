export type AppIconVariant =
  | 'primary_squircle'
  | 'adaptive_background'
  | 'adaptive_foreground'
  | 'dark_luminous'
  | 'light_contrast';

export function buildAppIconSvgString(variant: AppIconVariant): string {
  const isLight = variant === 'light_contrast';
  const isDarkLuminous = variant === 'dark_luminous';
  const isBgOnly = variant === 'adaptive_background';
  const isFgOnly = variant === 'adaptive_foreground';

  const bgStart = isLight ? '#EFF4FF' : isDarkLuminous ? '#2D54A8' : '#26478D';
  const bgMid = isLight ? '#E2E8F0' : isDarkLuminous ? '#162854' : '#172A57';
  const bgEnd = isLight ? '#CBD5E1' : '#0A0E1A';

  const metalStart = isLight ? '#1E3A75' : '#FFFFFF';
  const metalMid = isLight ? '#26478D' : '#E2E8F0';
  const metalEnd = isLight ? '#475569' : '#97A5BA';

  const haloColor = isLight ? '#26478D' : '#FBBF24';
  const haloOpacity = isLight ? '0.14' : isDarkLuminous ? '0.36' : '0.28';

  const rxAttr = isBgOnly ? '0' : '224';
  const pad = isBgOnly ? '0' : '24';
  const size = isBgOnly ? '1024' : '976';

  const backgroundMarkup = isFgOnly
    ? ''
    : `
  <rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="${rxAttr}" fill="url(#bgGrad)" />
  <rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="${rxAttr}" fill="url(#haloGrad)" />
  ${
    !isBgOnly
      ? `<rect x="26" y="26" width="972" height="972" rx="222" fill="none" stroke="${
          isLight ? 'rgba(38,71,141,0.18)' : 'rgba(255,255,255,0.22)'
        }" stroke-width="3" />`
      : ''
  }`;

  const foregroundMarkup = isBgOnly
    ? ''
    : `
  <g filter="${isFgOnly ? 'none' : 'url(#emblemShadow)'}">
    <path d="M276 680 V386 L382 318 V680 H276 Z" fill="url(#metalGrad)" opacity="0.34" />
    <path d="M396 680 V248 L512 174 V680 H396 Z" fill="url(#metalGrad)" opacity="0.6" />
    <path d="M512 174 L636 254 V680 H512 V174 Z" fill="url(#metalGrad)" opacity="0.94" />
    <rect x="546" y="276" width="26" height="36" rx="5" fill="${isLight ? '#FFFFFF' : '#172A57'}" opacity="0.82" />
    <rect x="586" y="300" width="24" height="34" rx="5" fill="${isLight ? '#FFFFFF' : '#172A57'}" opacity="0.82" />
    <rect x="546" y="336" width="26" height="36" rx="5" fill="${isLight ? '#FFFFFF' : '#172A57'}" opacity="0.82" />
    <rect x="586" y="360" width="24" height="34" rx="5" fill="${isLight ? '#FFFFFF' : '#172A57'}" opacity="0.82" />
    <path d="M472 364 H548 L692 732 H598 L566 644 H454 L422 732 H328 L472 364 Z M476 574 H544 L510 470 L476 574 Z" fill="url(#metalGrad)" />
    <path d="M718 424 H766 V478 H820 V526 H766 V580 H718 V526 H664 V478 H718 V424 Z" fill="url(#goldAccent)" />
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="52%" stop-color="${bgMid}" />
      <stop offset="100%" stop-color="${bgEnd}" />
    </linearGradient>
    <radialGradient id="haloGrad" cx="50%" cy="48%" r="44%">
      <stop offset="0%" stop-color="${haloColor}" stop-opacity="${haloOpacity}" />
      <stop offset="50%" stop-color="#60A5FA" stop-opacity="${isLight ? '0.08' : '0.2'}" />
      <stop offset="100%" stop-color="${bgEnd}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${metalStart}" />
      <stop offset="58%" stop-color="${metalMid}" />
      <stop offset="100%" stop-color="${metalEnd}" />
    </linearGradient>
    <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${isLight ? '#26478D' : '#FDE68A'}" />
      <stop offset="100%" stop-color="${isLight ? '#1D4ED8' : '#D97706'}" />
    </linearGradient>
    <filter id="emblemShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#040711" flood-opacity="${isLight ? '0.2' : '0.6'}" />
    </filter>
  </defs>
  ${backgroundMarkup}
  ${foregroundMarkup}
</svg>`;
}

export function downloadAppIconSvg(variant: AppIconVariant, filename: string): void {
  const svg = buildAppIconSvgString(variant);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadAppIconPng1024(variant: AppIconVariant, filename: string): Promise<void> {
  const svg = buildAppIconSvgString(variant);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to render 1024x1024 icon'));
      el.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unsupported');
    ctx.clearRect(0, 0, 1024, 1024);
    ctx.drawImage(img, 0, 0, 1024, 1024);
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
