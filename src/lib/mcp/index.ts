import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getPortfolio from "./tools/get-portfolio";
import getRecentTrades from "./tools/get-recent-trades";
import getBotStatus from "./tools/get-bot-status";
import setBotEnabled from "./tools/set-bot-enabled";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "titanai-mcp",
  title: "TitanAI Trading MCP",
  version: "0.1.0",
  instructions:
    "Tools for the TitanAI trading app. Use get_portfolio, get_recent_trades, and get_bot_status to inspect the signed-in user's paper trading account and AI bot. Use set_bot_enabled to start or stop the bot (requires approval).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getPortfolio, getRecentTrades, getBotStatus, setBotEnabled],
});
