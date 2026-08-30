import { useEffect, useState } from 'preact/hooks';
import { AlertTriangleIcon, AppleSpinner } from './icons';

interface AppPreloaderProps {
  isEntering?: boolean;
  onReady?: () => void;
  lang?: 'ru' | 'tg';
}

export function AppPreloader({ isEntering = false, onReady, lang = 'ru' }: AppPreloaderProps) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isSlow, setIsSlow] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsSlow(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const timer = window.setTimeout(() => {
      if (!isFadingOut) {
        setIsSlow(true);
      }
    }, 3500);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(timer);
    };
  }, [isFadingOut]);

  useEffect(() => {
    if (!isEntering) return;

    if (isOnline) {
      const timer = window.setTimeout(() => {
        setIsFadingOut(true);
        const hideTimer = window.setTimeout(() => {
          onReady?.();
        }, 380);
        return () => clearTimeout(hideTimer);
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [isEntering, isOnline, onReady]);

  const showBanner = !isOnline || isSlow;

  return (
    <div
      class={`app-preloader-overlay${isFadingOut ? ' preloader-hidden' : ''}`}
      aria-label="Загрузка Tajikistan Monitor"
      role="status"
    >
      <div class="preloader-content">
        <svg class="preloader-logo" viewBox="0 0 1024 1024" role="img" aria-label="Tajikistan Monitor">
          <defs>
            <path
              id="app-preloader-tj"
              d="M 108.30 715.48 L 175.41 594.64 L 149.62 505.75 L 62.00 477.26 L 92.95 424.69 L 192.65 430.30 L 249.39 364.31 L 287.34 287.69 L 446.99 259.95 L 422.10 315.31 L 439.20 348.50 L 488.49 345.42 L 444.77 382.27 L 314.81 362.27 L 303.50 431.11 L 432.96 421.85 L 580.48 460.63 L 806.23 442.50 L 836.49 553.00 L 875.74 540.98 L 948.25 568.16 L 944.09 614.59 L 962.00 682.64 L 838.86 682.46 L 756.64 673.66 L 682.24 727.11 L 629.24 738.97 L 587.64 764.05 L 540.37 724.95 L 551.50 624.64 L 515.38 618.97 L 528.36 582.48 L 463.73 555.33 L 412.33 596.87 L 399.70 645.01 L 381.31 662.56 L 309.94 660.08 L 271.43 714.74 L 231.21 691.68 L 144.78 730.03 L 108.30 715.48 Z"
            />
            <clipPath id="app-preloader-top">
              <rect x="0" y="0" width="1024" height="499" />
            </clipPath>
            <clipPath id="app-preloader-bottom">
              <rect x="0" y="525" width="1024" height="499" />
            </clipPath>
          </defs>
          <g fill="currentColor">
            <use href="#app-preloader-tj" clip-path="url(#app-preloader-top)" />
            <use href="#app-preloader-tj" clip-path="url(#app-preloader-bottom)" />
          </g>
        </svg>

        <AppleSpinner size={28} class="preloader-spinner" />

        <div class={`preloader-offline-banner${showBanner ? ' is-visible' : ''}`}>
          <AlertTriangleIcon size={15} class="preloader-offline-icon" />
          <span>{lang === 'tg' ? 'Интернети суст' : 'Медленный интернет'}</span>
        </div>
      </div>
    </div>
  );
}
