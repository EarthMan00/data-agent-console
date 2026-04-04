import { Suspense } from "react";
import { MoreDataHomePage } from "@/components/more-data-home-page";

export default function Home() {
  return (
      <Suspense fallback={null}>
      <MoreDataHomePage />
    </Suspense>
  );
}
