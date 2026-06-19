import { Suspense } from "react";
import { AliceHomePage } from "@/components/alice-home-page";

export default function Home() {
  return (
      <Suspense fallback={null}>
      <AliceHomePage />
    </Suspense>
  );
}
