import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  solveExitGeometry,
  solveWideGeometry,
  describeGeometry,
  TP_FLOOR_GROSS_PCT,
  MAX_RISK_PCT,
  WIDE_MAX_HOLD_MINUTES,
  WIDE_TRAILING_ENABLED,
} from "../_shared/exit-geometry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[COPY-TRADE] ${step}`, details ? JSON.stringify(details) : '');
};

// Copy trades follow the SAME exit contract as the main engine — no bespoke geometry.
const SCALP_HOLD_MINUTES = 720; // 12h for non-wide copy entries

// A signal older than this is history, not a tradable idea. Backlogged signals
// used to sit "pending" forever and then all fire at once on the first run.
const SIGNAL_MAX_AGE_MINUTES = 45;

// Reject signals where the signal's entry price drifts more than 1.5% from live market.
const MAX_PRICE_DRIFT_PERCENT = 1.5;

// Defaults used when a follower has no copy_trading_settings row.
const SETTINGS_DEFAULTS = {
  enabled: true,
  auto_copy: true,
  max_copy_amount_usd: 100,
  copy_percentage: 10,
  max_concurrent_copies: 5,
  min_trader_win_rate: 55,
  min_trader_trades: 20,
};

// CoinGecko ID map for live-price validation (prevents stale-price copy trades)
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
  DOGE: 'dogecoin', AVAX: 'avalanche-2', DOT: 'polkadot', LINK: 'chainlink',
  MATIC: 'matic-network', LTC: 'litecoin', UNI: 'uniswap', ATOM: 'cosmos',
  NEAR: 'near', INJ: 'injective-protocol', TAO: 'bittensor', RENDER: 'render-token',
  ENS: 'ethereum-name-service', AAVE: 'aave', MKR: 'maker', BCH: 'bitcoin-cash',
  XLM: 'stellar', ARB: 'arbitrum', OP: 'optimism', FIL: 'filecoin',
  OKB: 'okb', GMX: 'gmx', AXS: 'axie-infinity', SUI: 'sui',
};

async function fetchLivePrice(symbol: string): Promise<number | null> {
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  if (!id) return null;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.[id]?.usd;
    return typeof p === 'number' && p > 0 ? p : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    log("Starting copy trade execution scan");

    const cutoff = new Date(Date.now() - SIGNAL_MAX_AGE_MINUTES * 60_000).toISOString();

    // Retire anything that went stale while nothing was consuming the queue.
    const { data: expired } = await supabase
      .from('copy_trade_signals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .select('id');
    if (expired?.length) log(`Expired ${expired.length} stale signals older than ${SIGNAL_MAX_AGE_MINUTES}m`);

    // Fresh pending signals only.
    const { data: pendingSignals, error: signalsError } = await supabase
      .from('copy_trade_signals')
      .select(`
        *,
        top_traders!copy_trade_signals_trader_id_fkey (
          id, display_name, win_rate, total_trades, trading_style, best_performing_assets
        )
      `)
      .eq('status', 'pending')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(50);

    if (signalsError) {
      throw new Error(`Failed to fetch signals: ${signalsError.message}`);
    }

    log(`Found ${pendingSignals?.length || 0} fresh pending signals`);

    if (!pendingSignals || pendingSignals.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No fresh pending signals to process',
        processed: 0,
        expired: expired?.length ?? 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Everyone actively following the traders behind these signals.
    const traderIds = [...new Set(pendingSignals.map(s => s.trader_id))];

    const { data: followers, error: followersError } = await supabase
      .from('followed_traders')
      .select('*')
      .in('trader_id', traderIds)
      .eq('is_active', true);

    if (followersError) {
      throw new Error(`Failed to fetch followers: ${followersError.message}`);
    }

    log(`Found ${followers?.length || 0} active followers for these traders`);

    // Per-user copy settings, loaded once.
    const userIds = [...new Set((followers ?? []).map(f => f.user_id))];
    const settingsByUser = new Map<string, any>();
    if (userIds.length) {
      const { data: copySettings } = await supabase
        .from('copy_trading_settings')
        .select('*')
        .in('user_id', userIds);
      for (const row of copySettings ?? []) settingsByUser.set(row.user_id, row);
    }
    const copyCfgFor = (userId: string) => ({ ...SETTINGS_DEFAULTS, ...(settingsByUser.get(userId) ?? {}) });

    let processedCount = 0;
    let executedTrades = 0;

    for (const signal of pendingSignals) {
      const signalFollowers = followers?.filter(f => f.trader_id === signal.trader_id) || [];

      log(`Processing signal for ${signal.symbol}`, {
        action: signal.action,
        traderName: signal.top_traders?.display_name,
        followersCount: signalFollowers.length,
      });

      if (signalFollowers.length === 0) {
        await supabase.from('copy_trade_signals')
          .update({ status: 'no_followers' })
          .eq('id', signal.id);
        continue;
      }

      // 🛡️ STALE-PRICE GUARD: reject signals whose entry price drifts >1.5% from live market.
      const livePrice = await fetchLivePrice(signal.symbol);
      let executionPrice = Number(signal.entry_price);
      if (livePrice && executionPrice > 0) {
        const driftPct = Math.abs(executionPrice - livePrice) / livePrice * 100;
        if (driftPct > MAX_PRICE_DRIFT_PERCENT) {
          log(`🚫 STALE-PRICE SKIP ${signal.symbol}: signal $${executionPrice} vs live $${livePrice} (drift ${driftPct.toFixed(2)}%)`);
          await supabase.from('copy_trade_signals')
            .update({ status: 'rejected_stale_price' })
            .eq('id', signal.id);
          continue;
        }
        executionPrice = livePrice;
      } else if (!livePrice) {
        log(`🚫 NO LIVE PRICE for ${signal.symbol} — skipping copy trade to avoid stale-price risk`);
        await supabase.from('copy_trade_signals')
          .update({ status: 'rejected_no_price' })
          .eq('id', signal.id);
        continue;
      }

      let anyExecution = false;

      for (const follower of signalFollowers) {
        try {
          const cfg = copyCfgFor(follower.user_id);

          if (!cfg.enabled || !cfg.auto_copy) {
            log(`Skipping user ${follower.user_id} - copy trading disabled`);
            continue;
          }

          // Trader quality filters
          const traderWinRate = Number(signal.top_traders?.win_rate ?? 0);
          const traderTrades = Number(signal.top_traders?.total_trades ?? 0);
          if (traderWinRate < Number(cfg.min_trader_win_rate) || traderTrades < Number(cfg.min_trader_trades)) {
            log(`Skip - trader below quality bar`, { traderWinRate, traderTrades });
            continue;
          }

          const { data: settings } = await supabase
            .from('ai_settings')
            .select('*')
            .eq('user_id', follower.user_id)
            .maybeSingle();

          if (!settings?.enabled) {
            log(`Skipping user ${follower.user_id} - AI disabled`);
            continue;
          }
          if (settings.kill_switch_active) {
            log(`Skipping user ${follower.user_id} - kill switch active`);
            continue;
          }

          // Copy trades are simulated fills. In live mode a fill must come from the
          // broker, so never fabricate a live position here.
          const isPaperUser = settings.trading_mode === 'paper';
          if (!isPaperUser) {
            log(`Skipping user ${follower.user_id} - copy trading is paper-only (live fills must come from the broker)`);
            continue;
          }

          const { data: paperAccount } = await supabase
            .from('paper_account')
            .select('balance')
            .eq('user_id', follower.user_id)
            .maybeSingle();

          const balance = Number(paperAccount?.balance ?? 0);

          const copyPercentage = Number(follower.copy_percentage ?? cfg.copy_percentage);
          const maxCopyAmount = Number(follower.max_copy_amount_usd ?? cfg.max_copy_amount_usd);

          const tradeValue = Math.min(
            (balance * copyPercentage) / 100,
            maxCopyAmount,
            Number(signal.trade_value_usd) > 0 ? Number(signal.trade_value_usd) : maxCopyAmount,
          );

          if (tradeValue < 5) {
            log(`Skip - trade value too low: $${tradeValue.toFixed(2)}`);
            continue;
          }
          if (tradeValue > balance) {
            log(`Skip - insufficient paper balance ($${balance.toFixed(2)})`);
            continue;
          }

          const quantity = tradeValue / executionPrice;

          if (signal.action === 'buy') {
            const { data: existingPosition } = await supabase
              .from('positions')
              .select('id')
              .eq('user_id', follower.user_id)
              .eq('symbol', signal.symbol)
              .eq('is_paper', isPaperUser)
              .maybeSingle();

            if (existingPosition) {
              log(`User already has position in ${signal.symbol}, skipping`);
              continue;
            }

            // Per-position exit contract — identical helpers to the trading engine so
            // auto-take-profit measures copy trades on the same levels.
            const { data: scalpCfg } = await supabase
              .from('scalp_settings')
              .select('wide_stop_mode')
              .eq('user_id', follower.user_id)
              .maybeSingle();
            const wideMode = !!scalpCfg?.wide_stop_mode;
            const geo = wideMode ? solveWideGeometry(null) : solveExitGeometry(TP_FLOOR_GROSS_PCT, MAX_RISK_PCT);
            const holdMinutes = wideMode ? WIDE_MAX_HOLD_MINUTES : SCALP_HOLD_MINUTES;

            // 🔒 RISK-MANAGER GATE — copy trades must respect the user's risk settings.
            const { data: openPositions } = await supabase
              .from('positions')
              .select('quantity, current_price, avg_entry_price, unrealized_pnl')
              .eq('user_id', follower.user_id)
              .eq('is_paper', isPaperUser);

            const openCount = openPositions?.length ?? 0;
            if (openCount >= Number(cfg.max_concurrent_copies) + 0 && Number(cfg.max_concurrent_copies) > 0) {
              // Concurrency ceiling for copied exposure.
              const { count: copiedOpen } = await supabase
                .from('trades')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', follower.user_id)
                .eq('status', 'open')
                .eq('strategy', 'custom');
              if ((copiedOpen ?? 0) >= Number(cfg.max_concurrent_copies)) {
                log(`Skip - max concurrent copies reached (${copiedOpen})`);
                continue;
              }
            }

            const openValue = (openPositions ?? []).reduce(
              (s: number, p: any) => s + Number(p.current_price ?? p.avg_entry_price ?? 0) * Number(p.quantity ?? 0),
              0,
            );
            const openUnrealized = (openPositions ?? []).reduce(
              (s: number, p: any) => s + Number(p.unrealized_pnl ?? 0),
              0,
            );

            try {
              const riskResp = await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/risk-manager`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({
                    action: 'validate_trade',
                    userId: follower.user_id,
                    currentEquity: balance,
                    openPositionsCount: openCount,
                    openPositionsValue: openValue,
                    openPositionsUnrealizedPnl: openUnrealized,
                    tradeProposal: {
                      symbol: signal.symbol,
                      side: 'buy',
                      quantity,
                      price: executionPrice,
                      positionValue: tradeValue,
                      stopLoss: executionPrice * (1 - geo.stopLossPct / 100),
                      takeProfit: executionPrice * (1 + geo.takeProfitPct / 100),
                    },
                  }),
                },
              );
              const riskJson = await riskResp.json().catch(() => ({ approved: false, reason: 'risk-manager unreachable' }));
              if (!riskJson?.approved) {
                log(`🛑 Risk-manager blocked copy trade for ${signal.symbol}: ${riskJson?.reason ?? 'unknown'}`);
                continue;
              }
            } catch (e: any) {
              log(`Risk check error — blocking copy trade: ${e?.message ?? e}`);
              continue;
            }

            const { error: posError } = await supabase
              .from('positions')
              .insert({
                user_id: follower.user_id,
                symbol: signal.symbol,
                side: 'buy',
                quantity,
                avg_entry_price: executionPrice,
                current_price: executionPrice,
                unrealized_pnl: 0,
                is_paper: isPaperUser,
                market_type: 'crypto',
                strategy: 'custom',
                stop_loss_pct: Number(geo.stopLossPct.toFixed(4)),
                take_profit_pct: Number(geo.takeProfitPct.toFixed(4)),
                max_hold_minutes: holdMinutes,
                trailing_enabled: wideMode ? WIDE_TRAILING_ENABLED : true,
              });

            if (posError) {
              if ((posError as any).code === '23505') {
                log(`🧯 SKIP concurrent duplicate ${signal.symbol} (unique guard)`);
              } else {
                log(`Failed to create position: ${posError.message}`);
              }
              continue;
            }

            // Atomic balance debit — a plain read-modify-write loses concurrent fills.
            await supabase.rpc('adjust_paper_balance', {
              p_user_id: follower.user_id,
              p_delta: -tradeValue,
            });

            await supabase.from('trades').insert({
              user_id: follower.user_id,
              symbol: signal.symbol,
              side: 'buy',
              quantity,
              entry_price: executionPrice,
              status: 'open',
              is_paper: isPaperUser,
              market_type: 'crypto',
              strategy: 'custom',
              stop_loss_price: executionPrice * (1 - geo.stopLossPct / 100),
              take_profit_price: executionPrice * (1 + geo.takeProfitPct / 100),
              risk_reward: Number(geo.netRewardRisk.toFixed(2)),
              entry_reasoning: describeGeometry(geo),
              ai_reasoning: `📋 Copy trade from ${signal.top_traders?.display_name || 'followed trader'} (${traderWinRate.toFixed(1)}% win rate)`,
            });

            await supabase.from('ai_decisions').insert({
              user_id: follower.user_id,
              decision_type: 'copy_trade',
              symbol: signal.symbol,
              action: 'buy',
              reasoning: `Copied ${String(signal.action).toUpperCase()} from ${signal.top_traders?.display_name}. $${tradeValue.toFixed(2)} @ $${executionPrice}. ${describeGeometry(geo)}`,
              strategy: 'custom',
            });

            executedTrades++;
            anyExecution = true;
            log(`✅ Executed copy trade for user ${follower.user_id}`, {
              symbol: signal.symbol,
              value: tradeValue.toFixed(2),
              quantity: quantity.toFixed(6),
            });

          } else if (signal.action === 'sell') {
            const { data: position } = await supabase
              .from('positions')
              .select('*')
              .eq('user_id', follower.user_id)
              .eq('symbol', signal.symbol)
              .eq('is_paper', isPaperUser)
              .maybeSingle();

            if (!position) {
              log(`No position to sell for ${signal.symbol}`);
              continue;
            }

            const pnl = (executionPrice - Number(position.avg_entry_price)) * Number(position.quantity);
            const saleValue = Number(position.quantity) * executionPrice;

            await supabase.from('positions').delete().eq('id', position.id);

            await supabase.rpc('adjust_paper_balance', {
              p_user_id: follower.user_id,
              p_delta: saleValue,
            });

            // Close the open copy trade row if one exists, otherwise record the exit.
            const { data: openTrade } = await supabase
              .from('trades')
              .select('id, created_at')
              .eq('user_id', follower.user_id)
              .eq('symbol', signal.symbol)
              .eq('status', 'open')
              .eq('is_paper', isPaperUser)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const closedAt = new Date().toISOString();
            if (openTrade?.id) {
              await supabase.from('trades').update({
                exit_price: executionPrice,
                pnl,
                status: 'closed',
                closed_at: closedAt,
                exit_reason: 'copy_trade_exit',
                duration_seconds: Math.max(
                  0,
                  Math.round((Date.now() - new Date(openTrade.created_at).getTime()) / 1000),
                ),
                ai_reasoning: `📋 Copy trade exit from ${signal.top_traders?.display_name}. P&L: $${pnl.toFixed(2)}`,
              }).eq('id', openTrade.id);
            } else {
              await supabase.from('trades').insert({
                user_id: follower.user_id,
                symbol: signal.symbol,
                side: 'sell',
                quantity: position.quantity,
                entry_price: position.avg_entry_price,
                exit_price: executionPrice,
                pnl,
                status: 'closed',
                is_paper: isPaperUser,
                market_type: 'crypto',
                strategy: 'custom',
                exit_reason: 'copy_trade_exit',
                ai_reasoning: `📋 Copy trade exit from ${signal.top_traders?.display_name}. P&L: $${pnl.toFixed(2)}`,
                closed_at: closedAt,
              });
            }

            executedTrades++;
            anyExecution = true;
            log(`✅ Closed position via copy trade`, { symbol: signal.symbol, pnl: pnl.toFixed(2) });
          }

        } catch (userError) {
          log(`Error processing for user ${follower.user_id}:`, String(userError));
        }
      }

      await supabase
        .from('copy_trade_signals')
        .update({
          status: anyExecution ? 'copied' : 'skipped',
          copied_at: anyExecution ? new Date().toISOString() : null,
        })
        .eq('id', signal.id);

      processedCount++;
    }

    log(`Copy trade execution complete`, { processedCount, executedTrades });

    return new Response(JSON.stringify({
      success: true,
      processedSignals: processedCount,
      executedTrades,
      expired: expired?.length ?? 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
