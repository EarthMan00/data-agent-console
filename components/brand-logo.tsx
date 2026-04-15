type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-[12px] bg-[linear-gradient(180deg,#171717,#09090b)] text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
          <svg viewBox="0 0 36 36" aria-hidden="true" className="h-5 w-5">
            <path
              d="M7 26.5V10.8h4.2l5 8.2 5.1-8.2h4.1v15.7h-3.8v-9.6l-4.7 7.5h-1.4l-4.8-7.5v9.6H7Z"
              fill="currentColor"
            />
            <path d="M27.2 11.1h2.1l2.7 15.1h-3.6l-1.2-7.4 1.9-7.7Z" fill="#94a3b8" opacity="0.92" />
          </svg>
        </div>
        {!compact ? (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-[-0.03em] text-[#18181b]">LinkData</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
