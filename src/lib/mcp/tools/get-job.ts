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
  name: "get_job",
  title: "Get job",
  description:
    "Fetch a single Servexa job by its VFP reference number (e.g. VFP-00169) or by its UUID id. Returns the full job record.",
  inputSchema: {
    reference: z
      .string()
      .trim()
      .min(1)
      .describe("Job reference number (VFP-xxxxx) or the job's UUID id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ reference }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      reference,
    );
    const q = sb.from("jobs").select("*").limit(1);
    const { data, error } = isUuid
      ? await q.eq("id", reference)
      : await q.eq("reference_number", reference);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: `No job found for ${reference}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data[0], null, 2) }],
      structuredContent: { job: data[0] },
    };
  },
});
