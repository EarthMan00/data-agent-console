import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShareReplayPage } from "@/components/share-replay-page";

describe("share flow", () => {
  it("renders the replay timeline and result reader", () => {
    render(<ShareReplayPage shareId="yM2iGJyrFHeG8SfJojT9rP" />);

    expect(screen.getByTestId("share-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("share-result-reader")).toBeInTheDocument();
    expect(screen.getByText("完成思考")).toBeInTheDocument();
    expect(screen.getByText("任务执行结果")).toBeInTheDocument();
  });
});
