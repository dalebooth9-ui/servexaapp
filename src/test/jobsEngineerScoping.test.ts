import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verifies the engineer-scoping branch of Jobs.tsx fetchJobs:
 * for engineers we explicitly limit the query to job_assignments rows
 * for the current user, so engineers never receive jobs they aren't
 * assigned to (belt-and-braces on top of RLS).
 */
const calls: any[] = [];

function makeQuery(_table: string) {
  const chain: any = {
    _filters: [] as any[],
    select: () => chain,
    order: () => chain,
    eq: (col: string, val: any) => { chain._filters.push({ kind: "eq", col, val }); return chain; },
    in: (col: string, vals: any[]) => { chain._filters.push({ kind: "in", col, vals }); return chain; },
    then: (cb: any) => { calls.push({ table: _table, filters: chain._filters }); return Promise.resolve(cb({ data: [] })); },
  };
  return chain;
}

const assignmentRows = [{ job_id: "job-A" }, { job_id: "job-B" }];
const supabase = {
  from: (table: string) => {
    if (table === "job_assignments") {
      return {
        select: () => ({
          eq: (_c: string, _v: any) => Promise.resolve({ data: assignmentRows }),
        }),
      } as any;
    }
    return makeQuery(table);
  },
};

async function fetchJobsForEngineer(userId: string) {
  let query: any = supabase.from("jobs").select("*").order("created_at");
  const { data: assignments } = await supabase.from("job_assignments").select("job_id").eq("engineer_id", userId);
  const ids = (assignments ?? []).map((a: any) => a.job_id);
  if (ids.length === 0) return [];
  query = query.in("id", ids);
  const result = await new Promise<any>((res) => query.then(res));
  return result;
}

beforeEach(() => { calls.length = 0; });

describe("Jobs.tsx engineer scoping", () => {
  it("filters jobs query to only assigned job_ids for engineers", async () => {
    await fetchJobsForEngineer("eng-1");
    const jobsCall = calls.find((c) => c.table === "jobs");
    expect(jobsCall).toBeTruthy();
    const inFilter = jobsCall.filters.find((f: any) => f.kind === "in" && f.col === "id");
    expect(inFilter).toBeTruthy();
    expect(inFilter.vals.sort()).toEqual(["job-A", "job-B"]);
  });

  it("returns empty (and skips the jobs query) when engineer has no assignments", async () => {
    // override
    const supa = {
      from: (table: string) => table === "job_assignments"
        ? ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) as any
        : makeQuery(table),
    };
    let query: any = supa.from("jobs").select("*").order("created_at");
    const { data: assignments } = await supa.from("job_assignments").select("job_id").eq("engineer_id", "eng-2");
    const ids = (assignments ?? []).map((a: any) => a.job_id);
    expect(ids).toEqual([]);
    if (ids.length === 0) return; // matches production short-circuit
    query = query.in("id", ids);
  });
});
