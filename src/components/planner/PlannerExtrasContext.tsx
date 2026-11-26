import { createContext, useContext } from "react";
/** Planner-wide extras (clash warnings, two-engineer marking) without threading props through every row. */
export const PlannerExtrasContext = createContext<{ clashes: Map<string, string>; onMarkTwoEngineer?: (jobId: string) => void }>({ clashes: new Map() });
export const usePlannerExtras = () => useContext(PlannerExtrasContext);
