import React from 'react';
import { generateQrCells } from '../utils/formatters';

export function QrCodeSvg({ value, size = 84 }: { value: string; size?: number }) {
  const grid = generateQrCells(value, 11);
  const cell = size / grid.length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="bg-white p-1.5 rounded-lg border border-slate-200 shrink-0"
      aria-label={`QR Code ${value}`}
    >
      {grid.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell - 0.3}
              height={cell - 0.3}
              rx={0.5}
              fill="#0A0E1A"
            />
          ) : null
        )
      )}
    </svg>
  );
}
