import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_jobs",
  title: "List jobs",
  description:
    "List jobs in Servexa for the signed-in user's organisation. Optional filters for status, category, and a text search on the job name or reference number.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Filter by status (e.g. scheduled, in_progress, completed, cancelled)."),
    category: z.string().optional().describe("Filter by job category."),
    search: z
      .string()
      .optional()
      .describe("Case-insensitive substring match on job name or reference number (e.g. VFP-00169)."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, category, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("jobs")
      .select(
        "id, reference_number, name, status, category, priority, customer, customer_po, due_date, address, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    if (category) q = q.eq("category", category);
    if (search) q = q.or(`name.ilike.%${search}%,reference_number.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { jobs: data ?? [] },
    };
  },
});
