import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import RamsTemplateSettings from "./RamsTemplateSettings";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ userRole: "admin", user: { id: "test" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    supabase: {
      from: () => builder,
    },
  };
});

// Stub heavy export children to keep this a pure mount-smoke test.
vi.mock("./BlankTemplatePdfExport", () => ({ default: () => null }));
vi.mock("./BlankTemplateWordExport", () => ({ default: () => null }));
vi.mock("./EditTemplateDialog", () => ({ default: () => null }));

describe("RamsTemplateSettings", () => {
  it("mounts without throwing", () => {
    expect(() => render(<RamsTemplateSettings />)).not.toThrow();
  });
});
