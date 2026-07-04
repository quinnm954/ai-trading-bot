import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "set_bot_enabled",
  title: "Start or stop trading bot",
  description: "Enable or disable the AI trading bot for the signed-in user. Set enabled=true to start, false to stop.",
  inputSchema: {
    enabled: z.boolean().describe("true to start the bot, false to stop it."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  needsApproval: true,
  handler: async ({ enabled }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = sbForUser(ctx);
    const patch: Record<string, unknown> = {
      enabled,
      updated_at: new Date().toISOString(),
    };
    if (enabled) {
      patch.kill_switch_active = false;
      patch.kill_switch_triggered_at = null;
      patch.bot_status = "idle";
    } else {
      patch.bot_status = "idle";
    }
    const { data, error } = await sb
      .from("ai_settings")
      .update(patch)
      .eq("user_id", ctx.getUserId())
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Bot ${enabled ? "started" : "stopped"}.` }],
      structuredContent: { settings: data },
    };
  },
});
