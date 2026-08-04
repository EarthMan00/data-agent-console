import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FavoriteSnapshotView } from "@/components/favorite-snapshot-view";
import { TaskSingleDataArtifactPreview } from "@/components/task-single-data-preview";

const rawProviderResult = JSON.stringify({
  ok: false,
  action: "private_provider_action",
  error_type: "PRIVATE_PROVIDER_ERROR",
  error:
    "C:\\Users\\private\\worker.py database=postgresql://owner:password@db/private token=private-token",
});

vi.mock("@/lib/agent-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-api/client")>();
  return {
    ...actual,
    fetchAuthorizedText: vi.fn(async () => rawProviderResult),
  };
});

const publicMessage = "暂无可展示的结果，请查看其他结果文件。";

function expectNoProviderInternals(container: HTMLElement) {
  const rendered = container.textContent ?? "";
  for (const secret of (
    [
      "private_provider_action",
      "PRIVATE_PROVIDER_ERROR",
      "C:\\Users\\private",
      "postgresql://",
      "password",
      "private-token",
      "error_type",
      "ok: false",
    ]
  )) {
    expect(rendered).not.toContain(secret);
  }
}

describe("historical structured result secrecy", () => {
  it("does not render provider result fields from a historical favorite", () => {
    const { container } = render(
      <FavoriteSnapshotView
        snapshot={{ result_kind: "chatexcel", content_text: rawProviderResult }}
      />,
    );

    expect(screen.getByText(publicMessage)).toBeInTheDocument();
    expectNoProviderInternals(container);
  });

  it("does not render provider result fields from a legacy task artifact", async () => {
    const { container } = render(
      <TaskSingleDataArtifactPreview
        artifact={{
          artifact_id: "artifact-1",
          artifact_type: "txt",
          original_name: "chatexcel_result.txt",
          download_api: "/api/chat-rounds/round-1/artifacts/artifact-1",
        }}
        withFreshToken={async (run) => run("opaque-token")}
      />,
    );

    await waitFor(() => expect(screen.getByText(publicMessage)).toBeInTheDocument());
    expectNoProviderInternals(container);
  });
});
