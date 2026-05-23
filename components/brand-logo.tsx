type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {compact ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[18px] font-semibold leading-none text-[#1f1f1d]">
            A
          </div>
        ) : (
          <div className="min-w-0">
            <div className="truncate text-[18px] font-medium leading-6 text-[#1f1f1d]">Alice</div>
          </div>
        )}
      </div>
    </div>
  );
}
