import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// RISK MANAGER - Central Risk Management Module for TitanAI
// =============================================================================
// This module is the GATEKEEPER for all trading activity.
// It validates every trade against configurable risk rules and can VETO trades.
// 
// CRITICAL DESIGN PRINCIPLES:
// 1. Capital preservation FIRST, profits second
// 2. Fail SAFE - if uncertain, reject the trade
// 3. Never allow hidden leverage or all-in trades
// 4. Make risks visible and understandable
// =============================================================================

// Conservative default limits (user can customize but these are safe starting points)
const DEFAULT_RISK_LIMITS = {
  maxRiskPerTrade: 1,           // % of equity risked per trade (default 1%)
  maxPositionSize: 5,           // % of equity in single position (default 5%)
  maxDailyLoss: 3,              // % daily loss before trading stops (default 3%)
  maxWeeklyLoss: 10,            // % weekly loss before trading stops (default 10%)
  maxDrawdown: 20,              // % max drawdown before kill switch (default 20%)
  maxConcurrentTrades: 5,       // Max simultaneous positions (default 5)
  maxCapitalUsage: 50,          // % of total capital AI can use (default 50%)
  maxLeverage: 1,               // No leverage by default
};

// Risk check result interface
interface RiskCheckResult {
  approved: boolean;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
  adjustedSize?: number;  // Suggested reduced size if trade is too large
  violations: string[];
}

// Trade proposal interface
interface TradeProposal {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  positionValue: number;  // Total USD value of the position
  stopLoss?: number;      // Required for live trades
  takeProfit?: number;
}

interface RiskSettings {
  enabled: boolean;
  tradingMode: 'paper' | 'live';
  killSwitchActive: boolean;
  maxRiskPerTrade: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  weeklyLossLimit: number;
  maxDrawdown: number;
  maxConcurrentTrades: number;
  maxCapitalUsage: number;
  maxLeverage: number;
  dailyLossToday: number;
  weeklyLossCurrent: number;
  currentDrawdown: number;
  peakEquity: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive' | 'ultra_aggressive';
  targetEquity: number;
}

// =============================================================================
// CORE RISK VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates a proposed trade against ALL risk rules.
 * Returns approval status and detailed reasoning.
 */
function validateTrade(
  proposal: TradeProposal,
  settings: RiskSettings,
  currentEquity: number,
  openPositionsCount: number,
  openPositionsValue: number
): RiskCheckResult {
  const violations: string[] = [];
  let approved = true;
  let severity: 'info' | 'warning' | 'critical' = 'info';

  // ==========================================================================
  // CHECK 1: Kill Switch - Trading completely disabled if triggered
  // ==========================================================================
  if (settings.killSwitchActive) {
    return {
      approved: false,
      reason: 'KILL SWITCH ACTIVE: Trading is disabled due to excessive losses. Manual reset required.',
      severity: 'critical',
      violations: ['kill_switch_active'],
    };
  }

  // ==========================================================================
  // CHECK 2: Daily Loss Limit - Stop trading if daily loss exceeded
  // ==========================================================================
  const dailyLossPercent = Math.abs(settings.dailyLossToday) / currentEquity * 100;
  if (dailyLossPercent >= settings.maxDailyLoss) {
    return {
      approved: false,
      reason: `DAILY LOSS LIMIT HIT: Lost ${dailyLossPercent.toFixed(2)}% today (limit: ${settings.maxDailyLoss}%). Trading paused until tomorrow.`,
      severity: 'critical',
      violations: ['daily_loss_exceeded'],
    };
  }

  // ==========================================================================
  // CHECK 3: Weekly Loss Limit - Stop trading if weekly loss exceeded
  // ==========================================================================
  const weeklyLossPercent = Math.abs(settings.weeklyLossCurrent) / currentEquity * 100;
  if (weeklyLossPercent >= settings.weeklyLossLimit) {
    return {
      approved: false,
      reason: `WEEKLY LOSS LIMIT HIT: Lost ${weeklyLossPercent.toFixed(2)}% this week (limit: ${settings.weeklyLossLimit}%). Trading paused until next week.`,
      severity: 'critical',
      violations: ['weekly_loss_exceeded'],
    };
  }

  // ==========================================================================
  // CHECK 4: Max Drawdown - Trigger kill switch if exceeded
  // ==========================================================================
  if (settings.currentDrawdown >= settings.maxDrawdown) {
    return {
      approved: false,
      reason: `MAX DRAWDOWN HIT: Current drawdown ${settings.currentDrawdown.toFixed(2)}% exceeds limit of ${settings.maxDrawdown}%. Kill switch triggered.`,
      severity: 'critical',
      violations: ['max_drawdown_exceeded'],
    };
  }

  // ==========================================================================
  // CHECK 5: Maximum Concurrent Trades
  // ==========================================================================
  if (proposal.side === 'buy' && openPositionsCount >= settings.maxConcurrentTrades) {
    violations.push(`max_concurrent_trades: ${openPositionsCount}/${settings.maxConcurrentTrades}`);
    approved = false;
    severity = 'warning';
  }

  // ==========================================================================
  // CHECK 6: Position Size Limit - No single position too large
  // ==========================================================================
  const positionSizePercent = (proposal.positionValue / currentEquity) * 100;
  if (positionSizePercent > settings.maxPositionSize) {
    violations.push(`position_size: ${positionSizePercent.toFixed(2)}% exceeds limit of ${settings.maxPositionSize}%`);
    approved = false;
    severity = 'warning';
  }

  // ==========================================================================
  // CHECK 7: Total Capital Usage - Don't over-commit
  // ==========================================================================
  const totalExposure = openPositionsValue + proposal.positionValue;
  const exposurePercent = (totalExposure / currentEquity) * 100;
  if (exposurePercent > settings.maxCapitalUsage) {
    violations.push(`capital_usage: ${exposurePercent.toFixed(2)}% exceeds limit of ${settings.maxCapitalUsage}%`);
    approved = false;
    severity = 'warning';
  }

  // ==========================================================================
  // CHECK 8: Stop Loss Required for Live Trading
  // ==========================================================================
  if (settings.tradingMode === 'live' && !proposal.stopLoss && proposal.side === 'buy') {
    violations.push('stop_loss_required: Live trades must have a stop loss');
    approved = false;
    severity = 'warning';
  }

  // ==========================================================================
  // CHECK 9: Risk Per Trade - Limit potential loss
  // ==========================================================================
  if (proposal.stopLoss && proposal.side === 'buy') {
    const potentialLoss = (proposal.price - proposal.stopLoss) * proposal.quantity;
    const riskPercent = (potentialLoss / currentEquity) * 100;
    if (riskPercent > settings.maxRiskPerTrade) {
      violations.push(`risk_per_trade: ${riskPercent.toFixed(2)}% exceeds limit of ${settings.maxRiskPerTrade}%`);
      approved = false;
      severity = 'warning';
    }
  }

  // ==========================================================================
  // CHECK 10: Minimum Trade Value - Prevent dust trades
  // ==========================================================================
  if (proposal.positionValue < 5) {
    violations.push('minimum_trade_value: Trade value below $5 minimum');
    approved = false;
    severity = 'info';
  }

  // Build result
  const result: RiskCheckResult = {
    approved,
    reason: approved 
      ? 'Trade approved: All risk checks passed'
      : `Trade blocked: ${violations.join('; ')}`,
    severity,
    violations,
  };

  // Suggest adjusted size if position is too large
  if (violations.some(v => v.includes('position_size') || v.includes('capital_usage'))) {
    const maxAllowedValue = Math.min(
      currentEquity * settings.maxPositionSize / 100,
      (currentEquity * settings.maxCapitalUsage / 100) - openPositionsValue
    );
    if (maxAllowedValue > 5) {
      result.adjustedSize = maxAllowedValue;
    }
  }

  return result;
}

/**
 * Updates drawdown tracking and triggers kill switch if needed
 */
async function updateDrawdownTracking(
  supabase: any,
  userId: string,
  currentEquity: number,
  settings: RiskSettings
): Promise<{ killSwitchTriggered: boolean; newDrawdown: number }> {
  // Update peak equity if current is higher
  const newPeak = Math.max(settings.peakEquity || currentEquity, currentEquity);
  
  // Calculate current drawdown from peak
  const drawdownAmount = newPeak - currentEquity;
  const newDrawdown = (drawdownAmount / newPeak) * 100;
  
  let killSwitchTriggered = false;
  
  // Check if kill switch should trigger
  if (newDrawdown >= settings.maxDrawdown && !settings.killSwitchActive) {
    killSwitchTriggered = true;
    
    // Trigger kill switch
    await supabase.from('ai_settings').update({
      kill_switch_active: true,
      kill_switch_triggered_at: new Date().toISOString(),
      enabled: false,  // Disable trading
      peak_equity: newPeak,
      current_drawdown: newDrawdown,
    }).eq('user_id', userId);
    
    // Log critical event
    await supabase.from('risk_events').insert({
      user_id: userId,
      event_type: 'kill_switch_triggered',
      severity: 'critical',
      message: `Kill switch triggered: Drawdown of ${newDrawdown.toFixed(2)}% exceeded ${settings.maxDrawdown}% limit`,
      details: {
        peak_equity: newPeak,
        current_equity: currentEquity,
        drawdown_percent: newDrawdown,
        max_drawdown: settings.maxDrawdown,
      },
    });
    
    console.log(`🛑 KILL SWITCH TRIGGERED: Drawdown ${newDrawdown.toFixed(2)}% exceeded ${settings.maxDrawdown}%`);
  } else {
    // Just update tracking
    await supabase.from('ai_settings').update({
      peak_equity: newPeak,
      current_drawdown: newDrawdown,
    }).eq('user_id', userId);
  }
  
  return { killSwitchTriggered, newDrawdown };
}

/**
 * Records a risk event for audit trail
 */
async function logRiskEvent(
  supabase: any,
  userId: string,
  eventType: string,
  severity: string,
  message: string,
  details: any
): Promise<void> {
  try {
    await supabase.from('risk_events').insert({
      user_id: userId,
      event_type: eventType,
      severity,
      message,
      details,
    });
  } catch (error) {
    console.error('Failed to log risk event:', error);
  }
}

/**
 * Resets daily loss tracking (called at start of each day)
 */
async function resetDailyLossIfNeeded(
  supabase: any,
  userId: string,
  lastResetDate: string | null
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  
  if (!lastResetDate || lastResetDate !== today) {
    await supabase.from('ai_settings').update({
      daily_loss_today: 0,
      last_loss_reset_date: today,
    }).eq('user_id', userId);
    
    console.log(`📅 Daily loss reset for ${today}`);
    return true;
  }
  
  return false;
}

/**
 * Resets weekly loss tracking (called at start of each week)
 */
async function resetWeeklyLossIfNeeded(
  supabase: any,
  userId: string,
  lastResetDate: string | null
): Promise<boolean> {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  
  // Reset on Monday (1) if last reset was before this week
  if (dayOfWeek === 1 && lastResetDate) {
    const lastReset = new Date(lastResetDate);
    const daysSinceReset = Math.floor((today.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceReset >= 7) {
      await supabase.from('ai_settings').update({
        weekly_loss_current: 0,
      }).eq('user_id', userId);
      
      console.log(`📅 Weekly loss reset`);
      return true;
    }
  }
  
  return false;
}

// =============================================================================
// MAIN SERVER HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, userId, tradeProposal, currentEquity, openPositionsCount, openPositionsValue } = body;

    console.log(`🛡️ RiskManager: ${action} for user ${userId?.slice(0, 8)}...`);

    // Get user's risk settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (settingsError || !settingsData) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch risk settings', approved: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Map database fields to settings object
    const settings: RiskSettings = {
      enabled: settingsData.enabled || false,
      tradingMode: settingsData.trading_mode || 'paper',
      killSwitchActive: settingsData.kill_switch_active || false,
      maxRiskPerTrade: DEFAULT_RISK_LIMITS.maxRiskPerTrade,
      maxPositionSize: settingsData.max_position_size || DEFAULT_RISK_LIMITS.maxPositionSize,
      maxDailyLoss: settingsData.max_daily_loss || DEFAULT_RISK_LIMITS.maxDailyLoss,
      weeklyLossLimit: settingsData.weekly_loss_limit || DEFAULT_RISK_LIMITS.maxWeeklyLoss,
      maxDrawdown: settingsData.max_drawdown || DEFAULT_RISK_LIMITS.maxDrawdown,
      maxConcurrentTrades: settingsData.max_concurrent_trades || DEFAULT_RISK_LIMITS.maxConcurrentTrades,
      maxCapitalUsage: settingsData.max_capital_usage || DEFAULT_RISK_LIMITS.maxCapitalUsage,
      maxLeverage: settingsData.max_leverage || DEFAULT_RISK_LIMITS.maxLeverage,
      dailyLossToday: settingsData.daily_loss_today || 0,
      weeklyLossCurrent: settingsData.weekly_loss_current || 0,
      currentDrawdown: settingsData.current_drawdown || 0,
      peakEquity: settingsData.peak_equity || 100000,
      riskTolerance: settingsData.risk_tolerance || 'moderate',
      targetEquity: settingsData.target_equity || 1000000,
    };

    // Reset daily/weekly losses if needed
    await resetDailyLossIfNeeded(supabase, userId, settingsData.last_loss_reset_date);
    await resetWeeklyLossIfNeeded(supabase, userId, settingsData.last_loss_reset_date);

    // Handle different actions
    switch (action) {
      case 'validate_trade': {
        // =======================================================================
        // VALIDATE TRADE - Check if proposed trade passes all risk rules
        // =======================================================================
        if (!tradeProposal || currentEquity === undefined) {
          return new Response(
            JSON.stringify({ error: 'Missing tradeProposal or currentEquity', approved: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const result = validateTrade(
          tradeProposal,
          settings,
          currentEquity,
          openPositionsCount || 0,
          openPositionsValue || 0
        );

        // Log blocked trades
        if (!result.approved) {
          await logRiskEvent(supabase, userId, 'trade_blocked', result.severity, result.reason, {
            trade: tradeProposal,
            violations: result.violations,
            settings: {
              maxPositionSize: settings.maxPositionSize,
              maxDailyLoss: settings.maxDailyLoss,
              maxConcurrentTrades: settings.maxConcurrentTrades,
            },
          });
        }

        console.log(`📊 Trade validation: ${result.approved ? '✅ APPROVED' : '❌ BLOCKED'} - ${result.reason}`);

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_drawdown': {
        // =======================================================================
        // UPDATE DRAWDOWN - Track equity changes and trigger kill switch if needed
        // =======================================================================
        if (currentEquity === undefined) {
          return new Response(
            JSON.stringify({ error: 'Missing currentEquity' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const result = await updateDrawdownTracking(supabase, userId, currentEquity, settings);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'record_loss': {
        // =======================================================================
        // RECORD LOSS - Update daily/weekly loss tracking
        // =======================================================================
        const { lossAmount } = body;
        if (lossAmount === undefined) {
          return new Response(
            JSON.stringify({ error: 'Missing lossAmount' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const newDailyLoss = settings.dailyLossToday + Math.abs(lossAmount);
        const newWeeklyLoss = settings.weeklyLossCurrent + Math.abs(lossAmount);

        await supabase.from('ai_settings').update({
          daily_loss_today: newDailyLoss,
          weekly_loss_current: newWeeklyLoss,
        }).eq('user_id', userId);

        // Check if limits exceeded
        const dailyLimitHit = (newDailyLoss / currentEquity) * 100 >= settings.maxDailyLoss;
        const weeklyLimitHit = (newWeeklyLoss / currentEquity) * 100 >= settings.weeklyLossLimit;

        if (dailyLimitHit) {
          await logRiskEvent(supabase, userId, 'daily_limit_hit', 'critical', 
            `Daily loss limit reached: $${newDailyLoss.toFixed(2)}`, { newDailyLoss, limit: settings.maxDailyLoss });
        }

        if (weeklyLimitHit) {
          await logRiskEvent(supabase, userId, 'weekly_limit_hit', 'critical',
            `Weekly loss limit reached: $${newWeeklyLoss.toFixed(2)}`, { newWeeklyLoss, limit: settings.weeklyLossLimit });
        }

        return new Response(
          JSON.stringify({ dailyLoss: newDailyLoss, weeklyLoss: newWeeklyLoss, dailyLimitHit, weeklyLimitHit }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reset_kill_switch': {
        // =======================================================================
        // RESET KILL SWITCH - Manual reset by user (requires confirmation)
        // =======================================================================
        await supabase.from('ai_settings').update({
          kill_switch_active: false,
          kill_switch_triggered_at: null,
          current_drawdown: 0,
          // Don't reset peak_equity - let it track from current level
        }).eq('user_id', userId);

        await logRiskEvent(supabase, userId, 'kill_switch_reset', 'warning',
          'Kill switch manually reset by user', { reset_at: new Date().toISOString() });

        console.log(`🔄 Kill switch reset for user ${userId.slice(0, 8)}...`);

        return new Response(
          JSON.stringify({ success: true, message: 'Kill switch reset successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_risk_status': {
        // =======================================================================
        // GET RISK STATUS - Return current risk metrics for UI display
        // =======================================================================
        const { data: recentEvents } = await supabase
          .from('risk_events')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);

        // Calculate percentages safely (avoid division by zero)
        const safeEquity = currentEquity > 0 ? currentEquity : settings.peakEquity || 100000;
        const dailyLossPercent = safeEquity > 0 ? (Math.abs(settings.dailyLossToday) / safeEquity) * 100 : 0;
        const weeklyLossPercent = safeEquity > 0 ? (Math.abs(settings.weeklyLossCurrent) / safeEquity) * 100 : 0;

        console.log(`📊 Risk Status: Daily Loss: ${dailyLossPercent.toFixed(2)}%, Weekly Loss: ${weeklyLossPercent.toFixed(2)}%, Drawdown: ${settings.currentDrawdown}%`);

        return new Response(
          JSON.stringify({
            settings,
            recentEvents: recentEvents || [],
            riskMetrics: {
              dailyLossPercent: isNaN(dailyLossPercent) ? 0 : dailyLossPercent,
              weeklyLossPercent: isNaN(weeklyLossPercent) ? 0 : weeklyLossPercent,
              drawdownPercent: settings.currentDrawdown || 0,
              isKillSwitchActive: settings.killSwitchActive,
              isTradingEnabled: settings.enabled && !settings.killSwitchActive,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'confirm_live_mode': {
        // =======================================================================
        // CONFIRM LIVE MODE - User explicitly confirms understanding of risks
        // =======================================================================
        const { confirmationPhrase } = body;
        const expectedPhrase = 'I understand I can lose money';

        if (confirmationPhrase !== expectedPhrase) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Please type exactly: \"${expectedPhrase}\"` 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        await supabase.from('ai_settings').update({
          live_mode_confirmed_at: new Date().toISOString(),
          trading_mode: 'live',
        }).eq('user_id', userId);

        await logRiskEvent(supabase, userId, 'live_mode_confirmed', 'warning',
          'User confirmed live trading mode', { confirmed_at: new Date().toISOString() });

        return new Response(
          JSON.stringify({ success: true, message: 'Live mode confirmed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ RiskManager error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', approved: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
