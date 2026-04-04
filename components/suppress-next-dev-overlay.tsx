"use client";

import { useEffect } from "react";

export function SuppressNextDevOverlay() {
  useEffect(() => {
    const cleanupOverlay = () => {
      document.querySelectorAll("nextjs-portal, script[data-nextjs-dev-overlay]").forEach((node) => {
        if (node instanceof HTMLElement) {
          node.style.display = "none";
          node.style.visibility = "hidden";
          node.style.pointerEvents = "none";
        }
        node.remove();
      });
    };

    cleanupOverlay();

    const observer = new MutationObserver(() => {
      cleanupOverlay();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
