export type HapticStyle = 'light' | 'medium' | 'success' | 'warning' | 'error';

export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    if (typeof navigator.vibrate !== 'function') return;
    switch (style) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(18);
        break;
      case 'success':
        navigator.vibrate([12, 28, 18]);
        break;
      case 'warning':
        navigator.vibrate([22, 20, 22]);
        break;
      case 'error':
        navigator.vibrate([32, 24, 32]);
        break;
    }
  } catch {
    // Haptic vibration unsupported or blocked
  }
}
