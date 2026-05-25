import Image from "next/image";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Image
          src="/mdata-logo.png"
          alt="Alice"
          width={24}
          height={24}
          className="h-6 w-6 shrink-0 object-contain"
          draggable={false}
        />
        {compact ? (
          null
        ) : (
          <div className="min-w-0">
            <div className="truncate text-[18px] font-medium leading-6 text-[#1f1f1d]">Alice</div>
          </div>
        )}
      </div>
    </div>
  );
}
