import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

vi.mock("@tdesign-react/aigc", () => ({
  ChatAttachments: (props: { children?: React.ReactNode }) => React.createElement("div", props),
}));

if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = vi.fn();
}
