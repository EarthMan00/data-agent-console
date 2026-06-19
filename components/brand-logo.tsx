import Image from "next/image";

import { ALICE_LOGO_SRC } from "@/lib/brand-assets";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <span className="relative block h-6 w-6 shrink-0">
          <Image src={ALICE_LOGO_SRC} alt="Alice" fill sizes="24px" className="object-contain" draggable={false} />
        </span>
        {compact ? (
          null
        ) : (
          <div className="min-w-0">
            <div className="truncate text-lg font-medium leading-6 text-foreground">Alice</div>
          </div>
        )}
      </div>
    </div>
  );
}
