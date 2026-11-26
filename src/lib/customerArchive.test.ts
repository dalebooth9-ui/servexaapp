import { describe, it, expect } from "vitest";
import { visibleCustomers, isCustomerArchived, canArchiveCustomer, ARCHIVE_CONFIRM_TEXT } from "./customerArchive";

const list = [
  { id: "a", name: "C Watkins Plumbing Ltd", archived_at: null },
  { id: "b", name: "ZZ TEST Customer", archived_at: "2026-11-25T16:10:00Z" },
];

describe("customer archive", () => {
  it("hides archived customers by default", () => {
    expect(visibleCustomers(list).map((c) => c.id)).toEqual(["a"]);
  });
  it("shows archived customers when Show archived is on", () => {
    expect(visibleCustomers(list, true).map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("detects archived state", () => {
    expect(isCustomerArchived(list[1])).toBe(true);
    expect(isCustomerArchived(list[0])).toBe(false);
  });
  it("only admins can archive or restore", () => {
    expect(canArchiveCustomer("admin")).toBe(true);
    expect(canArchiveCustomer("engineer")).toBe(false);
    expect(canArchiveCustomer(null)).toBe(false);
  });
  it("uses the agreed confirmation wording", () => {
    expect(ARCHIVE_CONFIRM_TEXT).toBe("Archive this customer? You can restore it any time.");
  });
});

import { bulkArchiveConfirmText, bulkArchivedMessage, splitSelection } from "./customerArchive";
describe("bulk customer archive", () => {
  it("uses the agreed bulk wording", () => {
    expect(bulkArchiveConfirmText(3)).toBe("Archive 3 customers? You can restore them any time.");
    expect(bulkArchivedMessage(3)).toBe("3 customers archived");
    expect(bulkArchivedMessage(2, false)).toBe("2 customers restored");
  });
  it("archives only active ticked rows and restores only archived ticked rows", () => {
    const s = splitSelection(list, new Set(["a", "b"]));
    expect(s.toArchive).toEqual(["a"]);
    expect(s.toRestore).toEqual(["b"]);
    expect(splitSelection(list, new Set(["a"])).toRestore).toEqual([]);
  });
});
