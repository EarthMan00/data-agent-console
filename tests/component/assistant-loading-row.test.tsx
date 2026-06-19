import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantLoadingRow } from "@/components/assistant-loading-row";

describe("AssistantLoadingRow", () => {
  it("can render the thinking placeholder as an Alice message row", () => {
    render(<AssistantLoadingRow variant="thinking" withIdentity />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("我正在思考，请等我一下～")).toBeInTheDocument();
  });
});
