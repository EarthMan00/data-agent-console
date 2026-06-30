import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminShell } from "@/components/admin-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("AdminShell", () => {
  it("does not render the retired RBAC roles entry", () => {
    const { container } = render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    expect(container.querySelector('a[href="/admin/users"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/plans"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/personas"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/roles"]')).toBeNull();
  });
});
