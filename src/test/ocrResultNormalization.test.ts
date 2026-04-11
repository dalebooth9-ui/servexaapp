import { describe, expect, it } from "vitest";

import { applyExposedOutletOverrides } from "@/lib/ocrResultNormalization";

describe("applyExposedOutletOverrides", () => {
  it("forces outlet cabinet rows to n/a when another row says exposed outlets", () => {
    const fields = [
      {
        id: "landing_valve_padlock",
        label: "BS9990:2015 4.1.5 Does the landing valve have a padlock & strap?",
        section: "Landing valves",
      },
      {
        id: "outlet_cabinets_condition",
        label: "BS9990:2015 7.4.3.1 Outlet cabinets in good condition?",
        section: "Outlet hardware",
      },
    ];

    const result = applyExposedOutletOverrides(
      {
        landing_valve_padlock: "YES - EXPOSED OUTLETS",
        outlet_cabinets_condition: "yes",
      },
      fields,
    );

    expect(result.outlet_cabinets_condition).toBe("n/a");
  });

  it("forces adjacent cabinet follow-up rows in the same section to n/a", () => {
    const fields = [
      {
        id: "landing_valve",
        label: "Does the landing valve have a padlock & strap?",
        section: "Outlet equipment",
      },
      {
        id: "cabinet_keys",
        label: "Cabinet keys available?",
        section: "Outlet equipment",
      },
    ];

    const result = applyExposedOutletOverrides(
      {
        landing_valve: "YES - EXPOSED OUTLETS",
        cabinet_keys: "yes",
      },
      fields,
    );

    expect(result.cabinet_keys).toBe("n/a");
  });
});