/** Customer archiving: archived customers are hidden from lists and pickers by default, never deleted. */
export type ArchivableCustomer = { archived_at?: string | null };

export const ARCHIVE_CONFIRM_TEXT = "Archive this customer? You can restore it any time.";

export function isCustomerArchived(c: ArchivableCustomer | null | undefined): boolean {
  return Boolean(c?.archived_at);
}

/** Hide archived customers unless the caller explicitly asks to see them. */
export function visibleCustomers<T extends ArchivableCustomer>(list: T[] | null | undefined, showArchived = false): T[] {
  const rows = list || [];
  return showArchived ? rows : rows.filter((c) => !isCustomerArchived(c));
}

export function canArchiveCustomer(role: string | null | undefined): boolean {
  return role === "admin";
}

export function bulkArchiveConfirmText(n: number): string {
  return n === 1 ? ARCHIVE_CONFIRM_TEXT : `Archive ${n} customers? You can restore them any time.`;
}

export function bulkArchivedMessage(n: number, archive = true): string {
  return `${n} customer${n === 1 ? "" : "s"} ${archive ? "archived" : "restored"}`;
}

/** Split ticked ids into ones that can be archived (active) and restored (archived). */
export function splitSelection<T extends ArchivableCustomer & { id: string }>(rows: T[], selected: Set<string>) {
  const picked = rows.filter((r) => selected.has(r.id));
  return {
    toArchive: picked.filter((r) => !isCustomerArchived(r)).map((r) => r.id),
    toRestore: picked.filter((r) => isCustomerArchived(r)).map((r) => r.id),
  };
}
