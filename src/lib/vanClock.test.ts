import { describe, it, expect } from "vitest";
import { workedMinutes, payrollDailyCsv, payrollWeeklyCsv, PAYROLL_DAILY_HEADER, PAYROLL_WEEKLY_HEADER, vanQrUrl } from "./vanClock";

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
  it("van stickers point at the primary domain", () => {
    expect(vanQrUrl("AB12CD34EF")).toBe("https://servexaapp.com/v/AB12CD34EF");
  });
});

describe("payroll export", () => {
  const rows = [
    { employee: "Sam Smith", employeeId: "X100", entry: day("2026-11-02T08:00:00Z", "2026-11-02T16:00:00Z", 30) },
    { employee: "Sam Smith", employeeId: "X100", entry: day("2026-11-03T08:00:00Z", "2026-11-03T12:00:00Z") },
  ];
  it("daily file has the fixed column layout", () => {
    expect(PAYROLL_DAILY_HEADER).toBe("Employee name,Employee ID,Date,Start,Finish,Break (minutes),Total hours");
  });
  it("one row per employee per day", () => {
    const lines = payrollDailyCsv(rows).trim().split("\r\n");
    expect(lines[1]).toBe("Sam Smith,X100,02/11/2026,08:00,16:00,30,7.50");
    expect(lines[2]).toBe("Sam Smith,X100,03/11/2026,08:00,12:00,0,4.00");
    expect(lines).toHaveLength(3);
  });
  it("weekly summary is one row per employee with week total", () => {
    const lines = payrollWeeklyCsv(rows, "2026-11-02").trim().split("\r\n");
    expect(lines[0]).toBe(PAYROLL_WEEKLY_HEADER);
    expect(lines[1]).toBe("Sam Smith,X100,02/11/2026,11.50");
  });
  it("header is identical even with no rows", () => {
    expect(payrollDailyCsv([])).toBe(PAYROLL_DAILY_HEADER + "\r\n");
  });
});
