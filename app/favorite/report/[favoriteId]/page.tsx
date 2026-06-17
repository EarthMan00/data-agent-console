"use client";

import { useParams } from "next/navigation";

import { FavoriteReportPage } from "@/components/favorite-report-page";

export default function FavoriteReportRoutePage() {
  const params = useParams();
  const favoriteId = typeof params?.favoriteId === "string" ? params.favoriteId : "";
  if (!favoriteId) {
    return (
      <div className="flex min-h-invalid-link items-center justify-center text-sm text-text-secondary">无效的收藏链接</div>
    );
  }
  return <FavoriteReportPage favoriteId={favoriteId} />;
}
