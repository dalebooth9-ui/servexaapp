import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock supabase client
const mockThen = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ then: (cb: any) => mockThen(cb) }),
      }),
    }),
  },
}));

// Mock useAuth
const authState: any = { user: { id: "engineer-1" }, userRole: "engineer" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

import { useEngineerPageAccess } from "./useEngineerPageAccess";

beforeEach(() => {
  mockThen.mockReset();
  authState.user = { id: "engineer-1" };
  authState.userRole = "engineer";
});

describe("useEngineerPageAccess", () => {
  it("defaults to allow when engineer has NO access rows (setup-incomplete)", async () => {
    mockThen.mockImplementation((cb: any) => cb({ data: [] }));
    const { result } = renderHook(() => useEngineerPageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAccess("jobs")).toBe(true);
    expect(result.current.hasAccess("audits")).toBe(true);
  });

  it("normalises slug case/whitespace when matching access rows", async () => {
    mockThen.mockImplementation((cb: any) =>
      cb({ data: [{ page_slug: "Jobs" }, { page_slug: " audits " }] })
    );
    const { result } = renderHook(() => useEngineerPageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAccess("jobs")).toBe(true);
    expect(result.current.hasAccess("JOBS")).toBe(true);
    expect(result.current.hasAccess(" audits")).toBe(true);
    expect(result.current.hasAccess("planner")).toBe(false);
  });

  it("admin always has access", async () => {
    authState.userRole = "admin";
    mockThen.mockImplementation((cb: any) => cb({ data: [] }));
    const { result } = renderHook(() => useEngineerPageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAccess("anything")).toBe(true);
  });
});
