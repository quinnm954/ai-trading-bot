# TitanAI Risk Management System

## Overview

TitanAI now includes a comprehensive **Risk Management Layer** designed with capital preservation as the primary goal. This system operates independently from trading logic and can **veto trades** that violate risk constraints.

## Core Principles

1. **Capital Preservation First** - Profits are secondary to protecting your capital
2. **Fail Safe** - When uncertain, the system rejects trades
3. **No Hidden Leverage** - All risk is visible and configurable
4. **Make Risks Visible** - Clear UI showing all risk metrics

## Key Features

### RiskManager Module
Located at `supabase/functions/risk-manager/index.ts`, this edge function:
- Validates every trade proposal against configurable rules
- Tracks daily/weekly losses automatically
- Monitors drawdown from peak equity
- Can trigger a **Kill Switch** to halt all trading

### Risk Checks (in order)
1. **Kill Switch** - Is trading completely halted?
2. **Daily Loss Limit** - Has today's loss exceeded the limit?
3. **Weekly Loss Limit** - Has this week's loss exceeded the limit?
4. **Max Drawdown** - Has drawdown from peak triggered kill switch?
5. **Max Concurrent Trades** - Too many open positions?
6. **Position Size Limit** - Is this trade too large?
7. **Total Capital Usage** - Would this over-commit capital?
8. **Stop Loss Required** - Live trades must have stop losses
9. **Risk Per Trade** - Is potential loss within limits?
10. **Minimum Trade Value** - Prevents dust trades

## Configuration

### Default (Conservative) Settings
| Setting | Default | Description |
|---------|---------|-------------|
| Max Position Size | 5% | Max equity in single position |
| Max Daily Loss | 3% | Trading stops for day |
| Max Weekly Loss | 10% | Trading stops for week |
| Max Drawdown | 20% | Kill switch triggers |
| Max Concurrent Trades | 5 | Simultaneous positions |
| Max Capital Usage | 50% | Total deployed capital |
| Max Leverage | 1x | No leverage by default |

### Kill Switch
When drawdown exceeds `max_drawdown`, the kill switch:
- Immediately disables all trading
- Logs the event for audit
- Requires **manual reset** by user
- Forces you to review what went wrong

## Live Trading Mode

Switching to live trading requires:
1. Connected broker account
2. Typing exact phrase: **"I understand I can lose money"**
3. This confirmation is logged for audit

## UI Components

### RiskStatusCard
Shows real-time risk metrics:
- Daily/weekly loss progress bars
- Current drawdown from peak
- Recent risk events
- Kill switch status and reset button

### RiskSettingsPanel
Configure all risk limits with:
- Visual sliders
- Warnings for aggressive settings
- Tooltips explaining each setting

### LiveModeConfirmDialog
Prevents accidental live trading:
- Requires typing confirmation phrase
- Shows clear warnings about real money risk

## Database Tables

### `risk_events`
Audit trail of all risk-related events:
- Trade blocks
- Kill switch triggers
- Daily/weekly limit hits

### `daily_pnl`
Daily performance tracking:
- Realized P&L
- Win/loss counts
- Peak equity

## API Reference

### RiskManager Actions

```javascript
// Validate a trade before execution
await supabase.functions.invoke('risk-manager', {
  body: {
    action: 'validate_trade',
    userId: 'user-id',
    tradeProposal: { symbol, side, quantity, price, positionValue, stopLoss },
    currentEquity: 100000,
    openPositionsCount: 2,
    openPositionsValue: 15000
  }
});

// Get current risk status
await supabase.functions.invoke('risk-manager', {
  body: { action: 'get_risk_status', userId: 'user-id', currentEquity: 100000 }
});

// Reset kill switch (manual action)
await supabase.functions.invoke('risk-manager', {
  body: { action: 'reset_kill_switch', userId: 'user-id' }
});

// Confirm live mode with phrase
await supabase.functions.invoke('risk-manager', {
  body: { action: 'confirm_live_mode', userId: 'user-id', confirmationPhrase: 'I understand I can lose money' }
});
```

## Safety Recommendations

1. **Start with Paper Trading** - Test strategies without real money
2. **Use Conservative Defaults** - Don't increase limits until you understand them
3. **Monitor Risk Events** - Review blocked trades to understand your risk profile
4. **Never Disable Stop Losses** - Required for live trading for a reason
5. **Respect the Kill Switch** - If it triggers, something went wrong—investigate before resetting

## Disclaimer

**TitanAI does NOT guarantee profits.** Trading involves substantial risk of loss. The risk management system is designed to minimize and control risk, but cannot eliminate it. Only trade money you can afford to lose.
