/**
 * Shared customer-matching helpers for accounting contact imports.
 *
 * Contact imports must never blindly insert: they first match on the provider's
 * contact id, then on a normalised name key within the same organisation.
 */

export type MatchCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

/**
 * Normalise a customer name for duplicate detection:
 * lowercase, strip a trailing company suffix (Ltd / Limited / PLC / LLP,
 * with optional full stop), then remove every non-alphanumeric character.
 */
export function normaliseCustomerNameKey(name: string | null | undefined): string {
  if (!name) return "";
  let s = String(name).toLowerCase().trim();
  // strip repeated/trailing suffixes e.g. "Acme Fire Ltd."
  for (let i = 0; i < 2; i++) {
    const stripped = s.replace(/[\s,]*\b(ltd|limited|plc|llp)\.?\s*$/i, "").trim();
    if (stripped === s) break;
    s = stripped;
  }
  return s.replace(/[^a-z0-9]/g, "");
}

/**
 * Load every customer in the org once and index them by normalised name key.
 * Keys mapping to more than one customer are ambiguous and are not returned,
 * so an ambiguous name results in a normal insert rather than a wrong link.
 */
export async function loadCustomerNameIndex(
  svc: any,
  orgId: string,
): Promise<Map<string, MatchCandidate | null>> {
  const index = new Map<string, MatchCandidate | null>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await svc
      .from("customers")
      .select("id, name, email, phone, address")
      .eq("org_id", orgId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to load customers: ${error.message}`);
    const rows: MatchCandidate[] = data || [];
    for (const row of rows) {
      const key = normaliseCustomerNameKey(row.name);
      if (!key) continue;
      // null marks an ambiguous key (two or more customers share it)
      index.set(key, index.has(key) ? null : row);
    }
    if (rows.length < pageSize) break;
  }
  return index;
}

/**
 * Link an existing customer to a provider contact instead of inserting a new row.
 * Only fills email/phone/address where the existing value is null.
 */
export async function linkExistingCustomer(
  svc: any,
  existing: MatchCandidate,
  idColumn: string,
  contactId: string,
  incoming: { email?: string | null; phone?: string | null; address?: string | null },
): Promise<{ error: { message: string } | null }> {
  const patch: Record<string, unknown> = { [idColumn]: contactId };
  if (!existing.email && incoming.email) patch.email = incoming.email;
  if (!existing.phone && incoming.phone) patch.phone = incoming.phone;
  if (!existing.address && incoming.address) patch.address = incoming.address;
  const { error } = await svc.from("customers").update(patch).eq("id", existing.id);
  return { error: error ? { message: error.message } : null };
}
