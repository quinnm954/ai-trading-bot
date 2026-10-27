// KRONOS PERMANENT KNOWLEDGE — built into the project, never lost with the database.
// Curated from Kronos's own lessons and self-made rules (snapshot Oct 27 2026).
// Core rules are enforced on every Commander buy and cannot be retired by Kronos.
// To promote a new learned rule/lesson to permanent, add it here.

export const PLAYBOOK = `PERMANENT TRADING SKILLS (built-in, always true):
- Exit geometry: fees are ~0.8% round trip. Every target must clear fees with a net reward:risk of at least 1.6:1.
  A gross +0.5% move is NOT profit. Never call unrealized gross P&L "profit".
- Holding period: history shows holds under 12h lost ~$50k over 947 trades; only 12h+ holds were net positive.
  Plan swing holds of 12-24h on assets with a meaningful (≥5%) 24h range.
- Stops: 790 stop-outs cost ~$108k because tight stops get hit by noise. Use stops of at least 2.5%.
- Entry confirmation: require positive 1h AND positive 24h momentum. Repeated positive hourly stats are not fresh
  confirmation: compare the current price to the previous briefing; if it fell between cycles, do not buy.
- Tape: when rising breadth is low (<~40%) stay in cash or very small; isolated daily strength in a falling tape is
  not a setup. A sudden broad breadth recovery (e.g. 12% -> 90%) is the real signal to deploy.
- Do not chase: avoid coins already up sharply in 24h (parabolic) — late entries reverse.
- Exit on momentum failure: when hourly momentum flips negative and breadth collapses on an open probe, exit
  rather than hoping; do not wait for the stop if the thesis is gone.
- Verification: engine responses of ok=true/executed=0 are not proof of anything. Confirm fills, sizes and the
  actually recorded stop/target before scaling up. If recorded exits differ from requested, cap size until verified.
- Sizing: start new setups as small probes; scale only after a setup type proves itself net of fees.
- Chronic losers: some symbols have 0 wins in 12-14 trades (JASMY, CRO, MON, MORPHO, ZEC, SPX) — never trade them.`;

export const CORE_LESSONS: { content: string; symbol: string | null }[] = [
  { symbol: null, content: "Holds under 12h were net negative across 947 trades; 12h+ holds were the only profitable bucket." },
  { symbol: null, content: "Stops tighter than 2.5% were hit by noise 790 times, costing ~$108k." },
  { symbol: "RPL", content: "A +0.55% gross gain after 2h is below the 0.8% fee round trip — not a winner; exit when momentum reverses and breadth collapses." },
  { symbol: null, content: "Breadth jumping from ~13% to ~90% rising was genuine broad recovery; isolated daily strength at 13% breadth was not." },
  { symbol: null, content: "Recorded stop/target sometimes differed from requested (2%/5% vs 1.14%/3.9%); always verify active exit fields after a buy." },
];

export const CORE_RULES = [
  ...["JASMY", "CRO", "MON", "MORPHO", "ZEC", "SPX"].map((s) => ({
    id: `core-block-${s}`, rule_type: "block_symbol", rule_params: { symbol: s }, content: `Built-in: ${s} has 0 wins in 12-14 trades.`,
  })),
  { id: "core-min-hold", rule_type: "min_hold_minutes", rule_params: { value: 720 }, content: "Built-in: plan holds of at least 12h." },
  { id: "core-min-stop", rule_type: "min_stop_loss_pct", rule_params: { value: 2.5 }, content: "Built-in: stop of at least 2.5%." },
  { id: "core-min-1h", rule_type: "min_change1h_pct", rule_params: { value: 0 }, content: "Built-in: no buys with negative 1h change." },
  { id: "core-min-24h", rule_type: "min_change24h_pct", rule_params: { value: 0 }, content: "Built-in: no buys with negative 24h change." },
].map((r) => ({ ...r, core: true }));
