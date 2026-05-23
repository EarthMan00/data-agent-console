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
          alt="Mdata"
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 object-contain"
          draggable={false}
          priority
        />
        {!compact ? (
          <div className="min-w-0">
            <div className="truncate text-[18px] font-medium leading-6 text-[#1f1f1d]">Mdata</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
