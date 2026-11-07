import { describe, it, expect } from "vitest";
import { workedMinutes, timesheetCsv, vanQrUrl } from "./vanClock";

const day = (start: string, finish: string | null, brk = 0) => ({ clock_in_at: start, clock_out_at: finish, break_minutes: brk, total_minutes: null });

describe("van clocking hours", () => {
  it("subtracts a recorded break", () => {
    expect(workedMinutes(day("2026-11-02T07:42:00Z", "2026-11-02T16:12:00Z", 45), 30)).toBe(465);
  });
  it("uses the office's standard break when no break was taken", () => {
    expect(workedMinutes(day("2026-11-02T08:00:00Z", "2026-11-02T16:00:00Z"), 30)).toBe(450);
  });
  it("never guesses a finish: missing finish has no total", () => {
    expect(workedMinutes(day("2026-11-02T08:00:00Z", null), 30)).toBeNull();
  });
  it("CSV has hours only, week total, UK dates", () => {
    const csv = timesheetCsv([
      { employee: "Sam", entry: day("2026-11-02T08:00:00Z", "2026-11-02T16:00:00Z") },
      { employee: "Sam", entry: day("2026-11-03T08:00:00Z", "2026-11-03T12:00:00Z") },
    ], 0);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Employee,Date,Start,Finish,Break (mins),Total hours,Week total hours");
    expect(lines[1]).toBe("Sam,02/11/2026,08:00,16:00,0,8.00,12.00");
    expect(csv).not.toMatch(/£|rate|pay/i);
  });
  it("van stickers point at the primary domain", () => {
    expect(vanQrUrl("AB12CD34EF")).toBe("https://servexaapp.com/v/AB12CD34EF");
  });
});
