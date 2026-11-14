import React, { useRef, useState } from 'react';
import { triggerHaptic } from '../utils/haptics';

interface SwipeActionConfig {
  label: string;
  icon?: React.ReactNode;
  tone: 'emerald' | 'blue' | 'amber' | 'red';
  onTrigger: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  rightSwipeAction?: SwipeActionConfig;
  leftSwipeAction?: SwipeActionConfig;
  className?: string;
}

const TONE_BG: Record<SwipeActionConfig['tone'], string> = {
  emerald: 'bg-emerald-600 text-white',
  blue: 'bg-[#26478D] text-white',
  amber: 'bg-amber-600 text-white',
  red: 'bg-red-600 text-white',
};

export function SwipeableRow({
  children,
  rightSwipeAction,
  leftSwipeAction,
  className = '',
}: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; locked: 'x' | 'y' | null; buzzed: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const THRESHOLD = 68;
  const MAX_DRAG = 104;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!rightSwipeAction && !leftSwipeAction) return;
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY, locked: null, buzzed: false };
    suppressClickRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = startRef.current;
    const t = e.touches[0];
    if (!start || !t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (!start.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.locked = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
      if (start.locked === 'x') {
        setDragging(true);
      }
    }

    if (start.locked !== 'x') return;

    let clamped = dx;
    if (clamped > 0 && !rightSwipeAction) clamped = 0;
    if (clamped < 0 && !leftSwipeAction) clamped = 0;
    clamped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, clamped));

    if (Math.abs(clamped) >= THRESHOLD && !start.buzzed) {
      start.buzzed = true;
      triggerHaptic('light');
    }

    if (Math.abs(clamped) > 10) {
      suppressClickRef.current = true;
    }
    setOffsetX(clamped);
  };

  const handleTouchEnd = () => {
    const start = startRef.current;
    startRef.current = null;
    setDragging(false);

    if (start?.locked === 'x') {
      if (offsetX >= THRESHOLD && rightSwipeAction) {
        triggerHaptic('medium');
        setOffsetX(0);
        rightSwipeAction.onTrigger();
        return;
      }
      if (offsetX <= -THRESHOLD && leftSwipeAction) {
        triggerHaptic('medium');
        setOffsetX(0);
        leftSwipeAction.onTrigger();
        return;
      }
    }
    setOffsetX(0);
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClickRef.current = false;
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`} onClickCapture={handleClickCapture}>
      {/* Background revealed drawers */}
      {(rightSwipeAction || leftSwipeAction) && Math.abs(offsetX) > 2 && (
        <div className="absolute inset-0 flex items-stretch justify-between pointer-events-none">
          <div
            className={`flex items-center justify-start px-4 transition-opacity ${
              rightSwipeAction ? TONE_BG[rightSwipeAction.tone] : 'bg-transparent'
            } ${offsetX > 8 ? 'opacity-100 w-1/2' : 'opacity-0 w-0 overflow-hidden'}`}
          >
            {rightSwipeAction && (
              <div className="flex items-center gap-2 text-xs font-bold whitespace-nowrap">
                {rightSwipeAction.icon}
                <span>{rightSwipeAction.label}</span>
              </div>
            )}
          </div>
          <div
            className={`flex items-center justify-end px-4 ms-auto transition-opacity ${
              leftSwipeAction ? TONE_BG[leftSwipeAction.tone] : 'bg-transparent'
            } ${offsetX < -8 ? 'opacity-100 w-1/2' : 'opacity-0 w-0 overflow-hidden'}`}
          >
            {leftSwipeAction && (
              <div className="flex items-center gap-2 text-xs font-bold whitespace-nowrap">
                <span>{leftSwipeAction.label}</span>
                {leftSwipeAction.icon}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Foreground interactive surface */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: offsetX !== 0 ? `translate3d(${offsetX}px, 0, 0)` : undefined,
          transition: dragging ? 'none' : 'transform 190ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="relative z-10 will-change-transform"
      >
        {children}
      </div>
    </div>
  );
}
