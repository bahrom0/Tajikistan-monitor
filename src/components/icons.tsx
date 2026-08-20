import type { JSX } from 'preact';

export interface IconProps extends JSX.SVGAttributes<SVGSVGElement> {
  size?: number;
  class?: string;
  strokeWidth?: number;
}

export function SunIcon({ size = 18, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon({ size = 18, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function SparklesIcon({ size = 16, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

export function SearchIcon({ size = 16, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function NewspaperIcon({ size = 24, strokeWidth = 1.75, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </svg>
  );
}

export function HourglassIcon({ size = 24, strokeWidth = 1.75, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 14, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function CloseIcon({ size = 16, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function CheckIcon({ size = 14, strokeWidth = 2.5, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 18, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function GlobeIcon({ size = 14, strokeWidth = 2, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function AppleSpinner({ size = 20, class: className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      class={`apple-spinner ${className}`.trim()}
      fill="none"
      aria-label="Загрузка"
      role="status"
      {...props}
    >
      <g transform="translate(20 20)">
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(30)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.1s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(60)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(90)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.3s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(120)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(150)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.5s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(180)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.6s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(210)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.7s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(240)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.8s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(270)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="0.9s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(300)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="1.0s" repeatCount="indefinite" />
        </rect>
        <rect x="-1.5" y="-16" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.18" transform="rotate(330)">
          <animate attributeName="opacity" values="1;0.18;0.18" dur="1.2s" begin="1.1s" repeatCount="indefinite" />
        </rect>
      </g>
    </svg>
  );
}


