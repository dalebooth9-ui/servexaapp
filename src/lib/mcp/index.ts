import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listJobsTool from "./tools/list-jobs";
import getJobTool from "./tools/get-job";
import listCustomersTool from "./tools/list-customers";

// The OAuth issuer must be the direct Supabase host, built from the project ref
// so it survives publish and stays import-safe. See app-mcp-server-authoring.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "servexa-mcp",
  title: "Servexa",
  version: "0.1.0",
  instructions:
    "Servexa field service management. Use these tools to look up jobs (by VFP reference or search), inspect a single job's full record, and list customers in the signed-in user's organisation. All calls act as the signed-in Servexa user and respect the same permissions as the app.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listJobsTool, getJobTool, listCustomersTool],
});
