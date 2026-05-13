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
  it("DENIES engineer access by default when no access rows exist (strict mode)", async () => {
    mockThen.mockImplementation((cb: any) => cb({ data: [] }));
    const { result } = renderHook(() => useEngineerPageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Strict role-based mode: engineers must have explicit rows.
    expect(result.current.hasAccess("jobs")).toBe(false);
    expect(result.current.hasAccess("customers")).toBe(false);
  });

  it("DENIES engineer access to admin-only pages even when other slugs are granted", async () => {
    mockThen.mockImplementation((cb: any) =>
      cb({ data: [{ page_slug: "jobs" }, { page_slug: "planner" }, { page_slug: "leave" }] })
    );
    const { result } = renderHook(() => useEngineerPageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAccess("jobs")).toBe(true);
    expect(result.current.hasAccess("planner")).toBe(true);
    // Admin-only pages must be denied even though the engineer has *some* rows.
    expect(result.current.hasAccess("customers")).toBe(false);
    expect(result.current.hasAccess("sites")).toBe(false);
    expect(result.current.hasAccess("assets")).toBe(false);
    expect(result.current.hasAccess("audits")).toBe(false);
  });

  it("normalises slug case/whitespace when matching access rows", async () => {
    mockThen.mockImplementation((cb: any) =>
      cb({ data: [{ page_slug: "Jobs" }, { page_slug: " defects " }] })
    );
    const { result } = renderHook(() => useEngineerPageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAccess("jobs")).toBe(true);
    expect(result.current.hasAccess("JOBS")).toBe(true);
    expect(result.current.hasAccess(" defects")).toBe(true);
    expect(result.current.hasAccess("planner")).toBe(false);
  });

  it("admin always has access (default-allow preserved)", async () => {
    authState.userRole = "admin";
    mockThen.mockImplementation((cb: any) => cb({ data: [] }));
    const { result } = renderHook(() => useEngineerPageAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAccess("anything")).toBe(true);
    expect(result.current.hasAccess("customers")).toBe(true);
  });
});
