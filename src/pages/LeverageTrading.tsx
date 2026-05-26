import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Shield, Calculator, Lock, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

// ============= Types =============
interface LeverageSettings {
  id?: string;
  enabled: boolean;
  paper_enabled: boolean;
  live_enabled: boolean;
  paper_max_leverage: number;
  live_max_leverage: number;
  max_leverage_cap: number;
  margin_mode: 'isolated' | 'cross';
  cross_margin_enabled: boolean;
  max_risk_per_trade_pct: number;
  max_daily_loss_pct: number;
  min_confidence: number;
  min_risk_reward: number;
  consecutive_losses_pause: number;
}

const DEFAULTS: LeverageSettings = {
  enabled: false,
  paper_enabled: true,
  live_enabled: false,
  paper_max_leverage: 5,
  live_max_leverage: 0,
  max_leverage_cap: 10,
  margin_mode: 'isolated',
  cross_margin_enabled: false,
  max_risk_per_trade_pct: 1,
  max_daily_loss_pct: 3,
  min_confidence: 80,
  min_risk_reward: 1.5,
  consecutive_losses_pause: 3,
};

const EXCHANGES = [
  { id: 'binance_futures', label: 'Binance Futures' },
  { id: 'bybit', label: 'Bybit' },
  { id: 'kraken_futures', label: 'Kraken Futures' },
  { id: 'coinbase_advanced', label: 'Coinbase Advanced' },
] as const;

// ============= Calculator =============
function calculatePosition(opts: {
  balance: number;
  riskPct: number;
  entry: number;
  stop: number;
  leverage: number;
  side: 'long' | 'short';
  feeRate?: number;
  slippagePct?: number;
}) {
  const { balance, riskPct, entry, stop, leverage, side } = opts;
  const feeRate = opts.feeRate ?? 0.0006; // 0.06% taker
  const slippagePct = opts.slippagePct ?? 0.05;

  const riskAmount = (balance * riskPct) / 100;
  const distanceToStop = Math.abs(entry - stop);
  const distancePct = (distanceToStop / entry) * 100;

  // Position size from risk-first (NOT leverage-first)
  const positionValue = distanceToStop > 0 ? (riskAmount / distanceToStop) * entry : 0;
  const quantity = distanceToStop > 0 ? riskAmount / distanceToStop : 0;
  const marginRequired = leverage > 0 ? positionValue / leverage : positionValue;

  // Simplified liquidation (isolated, ignoring maintenance margin nuance)
  // Long: liq ≈ entry * (1 - 1/leverage)
  // Short: liq ≈ entry * (1 + 1/leverage)
  const liqPrice = leverage > 0
    ? (side === 'long' ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage))
    : 0;
  const distToLiqPct = entry > 0 ? Math.abs(entry - liqPrice) / entry * 100 : 0;

  const fees = positionValue * feeRate * 2; // entry + exit
  const slippageCost = positionValue * (slippagePct / 100);

  // Safety: stop must trigger before liquidation, with buffer
  const safe = distancePct > 0 && distancePct * 1.5 < distToLiqPct;

  return {
    riskAmount,
    distanceToStop,
    distancePct,
    positionValue,
    quantity,
    marginRequired,
    liqPrice,
    distToLiqPct,
    fees,
    slippageCost,
    maxLoss: riskAmount + fees + slippageCost,
    safe,
  };
}

// ============= Page =============
export default function LeverageTrading() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [settings, setSettings] = useState<LeverageSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Calculator state
  const [calc, setCalc] = useState({
    balance: 1000,
    riskPct: 1,
    entry: 50000,
    stop: 49000,
    takeProfit: 52000,
    leverage: 5,
    side: 'long' as 'long' | 'short',
    symbol: 'BTC-USD',
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('leverage_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setSettings({ ...DEFAULTS, ...(data as any) });
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    // Guard: live_enabled can only be set by admin
    const payload: any = { ...settings, user_id: user.id };
    if (!isAdmin) {
      delete payload.live_enabled;
    }
    const { error } = await supabase
      .from('leverage_settings')
      .upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Leverage settings saved' });
    }
  };

  const result = useMemo(
    () =>
      calculatePosition({
        balance: calc.balance,
        riskPct: Math.min(calc.riskPct, settings.max_risk_per_trade_pct),
        entry: calc.entry,
        stop: calc.stop,
        leverage: Math.min(calc.leverage, settings.max_leverage_cap),
        side: calc.side,
      }),
    [calc, settings.max_risk_per_trade_pct, settings.max_leverage_cap],
  );

  const rr = useMemo(() => {
    const risk = Math.abs(calc.entry - calc.stop);
    const reward = Math.abs(calc.takeProfit - calc.entry);
    return risk > 0 ? reward / risk : 0;
  }, [calc]);

  const meetsSignal = rr >= settings.min_risk_reward;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-7 h-7 text-primary" />
            Leverage Trading
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crypto futures and margin trading with capital-preservation controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={settings.enabled ? 'default' : 'secondary'}>
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge variant={settings.live_enabled ? 'destructive' : 'outline'}>
            {settings.live_enabled ? 'LIVE' : 'Paper Only'}
          </Badge>
        </div>
      </header>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Risk Warning</AlertTitle>
        <AlertDescription>
          Leverage increases both gains and losses. A small price move can liquidate the full
          margin used. TitanAI does not guarantee profits.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="calculator">Calculator</TabsTrigger>
          <TabsTrigger value="ticket">Trade Ticket</TabsTrigger>
          <TabsTrigger value="exchanges">Exchanges</TabsTrigger>
        </TabsList>

        {/* ============= SETTINGS ============= */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" /> Leverage Configuration
              </CardTitle>
              <CardDescription>
                Live leverage requires admin confirmation. Paper mode is available for testing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Leverage Trading</Label>
                  <p className="text-xs text-muted-foreground">Master switch. Off by default.</p>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Paper Mode Leverage</Label>
                  <p className="text-xs text-muted-foreground">Test strategies with simulated funds.</p>
                </div>
                <Switch
                  checked={settings.paper_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, paper_enabled: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="flex items-center gap-2">
                    Live Mode Leverage
                    {!isAdmin && <Lock className="w-3 h-3 text-muted-foreground" />}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin ? 'Admin: toggle live leverage trading.' : 'Locked. Requires admin confirmation.'}
                  </p>
                </div>
                <Switch
                  disabled={!isAdmin}
                  checked={settings.live_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, live_enabled: v })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <Label>Paper Max Leverage (x)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={settings.max_leverage_cap}
                    value={settings.paper_max_leverage}
                    onChange={(e) =>
                      setSettings({ ...settings, paper_max_leverage: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Live Max Leverage (x)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={settings.max_leverage_cap}
                    value={settings.live_max_leverage}
                    onChange={(e) =>
                      setSettings({ ...settings, live_max_leverage: Number(e.target.value) })
                    }
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <Label>Max Leverage Cap (x)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={settings.max_leverage_cap}
                    onChange={(e) =>
                      setSettings({ ...settings, max_leverage_cap: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Margin Mode</Label>
                  <Select
                    value={settings.margin_mode}
                    onValueChange={(v) =>
                      setSettings({ ...settings, margin_mode: v as 'isolated' | 'cross' })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="isolated">Isolated (recommended)</SelectItem>
                      <SelectItem value="cross" disabled={!settings.cross_margin_enabled}>
                        Cross {!settings.cross_margin_enabled && '(disabled)'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Risk per Trade (%)</Label>
                  <Input
                    type="number"
                    step={0.1}
                    min={0.1}
                    max={5}
                    value={settings.max_risk_per_trade_pct}
                    onChange={(e) =>
                      setSettings({ ...settings, max_risk_per_trade_pct: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Max Daily Loss (%)</Label>
                  <Input
                    type="number"
                    step={0.1}
                    min={0.5}
                    max={20}
                    value={settings.max_daily_loss_pct}
                    onChange={(e) =>
                      setSettings({ ...settings, max_daily_loss_pct: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Min Confidence Score</Label>
                  <Input
                    type="number"
                    min={50}
                    max={100}
                    value={settings.min_confidence}
                    onChange={(e) =>
                      setSettings({ ...settings, min_confidence: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Min Risk/Reward Ratio</Label>
                  <Input
                    type="number"
                    step={0.1}
                    min={1}
                    value={settings.min_risk_reward}
                    onChange={(e) =>
                      setSettings({ ...settings, min_risk_reward: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Pause After N Losses in a Row</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.consecutive_losses_pause}
                    onChange={(e) =>
                      setSettings({ ...settings, consecutive_losses_pause: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div>
                  <Label>Enable Cross Margin</Label>
                  <p className="text-xs text-muted-foreground">
                    Disabled by default — higher liquidation risk.
                  </p>
                </div>
                <Switch
                  checked={settings.cross_margin_enabled}
                  onCheckedChange={(v) =>
                    setSettings({
                      ...settings,
                      cross_margin_enabled: v,
                      margin_mode: v ? settings.margin_mode : 'isolated',
                    })
                  }
                />
              </div>

              <Button onClick={save} disabled={saving || loading} className="w-full">
                {saving ? 'Saving…' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= CALCULATOR ============= */}
        <TabsContent value="calculator" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" /> Position Size Calculator
                </CardTitle>
                <CardDescription>Size by risk and stop loss first — never by leverage alone.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Symbol</Label>
                    <Input value={calc.symbol} onChange={(e) => setCalc({ ...calc, symbol: e.target.value })} />
                  </div>
                  <div>
                    <Label>Side</Label>
                    <Select value={calc.side} onValueChange={(v) => setCalc({ ...calc, side: v as 'long' | 'short' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Account Balance (USD)</Label>
                    <Input type="number" value={calc.balance} onChange={(e) => setCalc({ ...calc, balance: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Risk per Trade (%)</Label>
                    <Input type="number" step={0.1} value={calc.riskPct} onChange={(e) => setCalc({ ...calc, riskPct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Entry Price</Label>
                    <Input type="number" value={calc.entry} onChange={(e) => setCalc({ ...calc, entry: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Stop Loss</Label>
                    <Input type="number" value={calc.stop} onChange={(e) => setCalc({ ...calc, stop: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Take Profit</Label>
                    <Input type="number" value={calc.takeProfit} onChange={(e) => setCalc({ ...calc, takeProfit: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Leverage (x)</Label>
                    <Input type="number" min={1} max={settings.max_leverage_cap} value={calc.leverage} onChange={(e) => setCalc({ ...calc, leverage: Number(e.target.value) })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Calculation Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Risk amount" value={`$${result.riskAmount.toFixed(2)}`} />
                <Row label="Distance to stop" value={`${result.distancePct.toFixed(2)}%`} />
                <Row label="Position size" value={`$${result.positionValue.toFixed(2)}`} />
                <Row label="Quantity" value={result.quantity.toFixed(6)} />
                <Row label="Margin required" value={`$${result.marginRequired.toFixed(2)}`} />
                <Row label="Est. liquidation price" value={`$${result.liqPrice.toFixed(2)}`} />
                <Row label="Distance to liquidation" value={`${result.distToLiqPct.toFixed(2)}%`} />
                <Row label="Est. fees (round trip)" value={`$${result.fees.toFixed(2)}`} />
                <Row label="Est. slippage" value={`$${result.slippageCost.toFixed(2)}`} />
                <Row label="Risk/Reward" value={`${rr.toFixed(2)}:1`} />
                <Row label="Max loss" value={`$${result.maxLoss.toFixed(2)}`} highlight="loss" />
                <div className="pt-2 border-t border-border">
                  {result.safe && meetsSignal ? (
                    <Badge className="bg-success text-success-foreground">Safe to trade</Badge>
                  ) : (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {!result.safe ? 'Stop too close to liquidation' : 'R/R below minimum'}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============= TRADE TICKET ============= */}
        <TabsContent value="ticket" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Trade Ticket Preview</CardTitle>
              <CardDescription>Final preview before opening the position.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Pair" value={calc.symbol} />
              <Row
                label="Direction"
                value={
                  <span className="flex items-center gap-1">
                    {calc.side === 'long' ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-loss" />}
                    {calc.side.toUpperCase()}
                  </span>
                }
              />
              <Row label="Entry" value={`$${calc.entry.toFixed(2)}`} />
              <Row label="Stop Loss" value={`$${calc.stop.toFixed(2)}`} />
              <Row label="Take Profit" value={`$${calc.takeProfit.toFixed(2)}`} />
              <Row label="Leverage" value={`${calc.leverage}x`} />
              <Row label="Margin used" value={`$${result.marginRequired.toFixed(2)}`} />
              <Row label="Total position size" value={`$${result.positionValue.toFixed(2)}`} />
              <Row label="Est. liquidation price" value={`$${result.liqPrice.toFixed(2)}`} />
              <Row label="Maximum loss" value={`$${result.maxLoss.toFixed(2)}`} highlight="loss" />
              <Row
                label="Potential profit"
                value={`$${(Math.abs(calc.takeProfit - calc.entry) * result.quantity).toFixed(2)}`}
                highlight="profit"
              />
              <Row label="Fees" value={`$${result.fees.toFixed(2)}`} />

              <div className="flex gap-2 pt-4">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={async () => {
                    if (!user) return;
                    const { error } = await supabase
                      .from('futures_positions')
                      .update({ status: 'closed', closed_at: new Date().toISOString() } as never)
                      .eq('user_id', user.id)
                      .eq('status', 'open')
                      .eq('is_paper', true);
                    if (error) {
                      toast({ title: 'Close failed', description: error.message, variant: 'destructive' });
                    } else {
                      toast({ title: 'All paper leverage positions closed' });
                    }
                  }}
                >
                  Emergency Close All
                </Button>
                <Button
                  className="flex-1"
                  disabled={!settings.enabled || !result.safe || !meetsSignal || executing}
                  onClick={async () => {
                    if (!user) return;
                    if (settings.live_enabled) {
                      toast({
                        title: 'Live execution not wired yet',
                        description: 'Connect a futures exchange with trade permissions to enable live orders.',
                        variant: 'destructive',
                      });
                      return;
                    }
                    setExecuting(true);
                    const { error } = await supabase.from('futures_positions').insert({
                      user_id: user.id,
                      symbol: calc.symbol,
                      side: calc.side,
                      quantity: result.quantity,
                      entry_price: calc.entry,
                      stop_loss: calc.stop,
                      take_profit: calc.takeProfit,
                      leverage: calc.leverage,
                      margin_used: result.marginRequired,
                      position_value: result.positionValue,
                      estimated_liquidation_price: result.liqPrice,
                      estimated_fees: result.fees,
                      margin_mode: settings.margin_mode,
                      is_paper: true,
                      status: 'open',
                    } as never);
                    setExecuting(false);
                    if (error) {
                      toast({ title: 'Open failed', description: error.message, variant: 'destructive' });
                    } else {
                      toast({
                        title: 'Paper position opened',
                        description: `${calc.side.toUpperCase()} ${calc.symbol} ${calc.leverage}x — margin $${result.marginRequired.toFixed(2)}`,
                      });
                    }
                  }}
                >
                  {executing ? 'Opening…' : settings.live_enabled ? 'Open Live Position' : 'Open Paper Position'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                {settings.live_enabled
                  ? 'Live execution requires a connected futures exchange with trade permissions.'
                  : 'Paper positions are recorded with simulated margin and liquidation in your leverage trade history.'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= EXCHANGES ============= */}
        <TabsContent value="exchanges" className="mt-4 space-y-4">
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Live trading locked</AlertTitle>
            <AlertDescription>
              All futures API connections start in read-only and paper mode. Live execution is locked until admin enables it.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EXCHANGES.map((ex) => (
              <ExchangeCard key={ex.id} exchange={ex.id} label={ex.label} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: 'profit' | 'loss' }) {
  const color = highlight === 'profit' ? 'text-success' : highlight === 'loss' ? 'text-loss' : 'text-foreground';
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

function ExchangeCard({ exchange, label }: { exchange: string; label: string }) {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [connected, setConnected] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('futures_api_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('exchange', exchange)
        .maybeSingle();
      if (data) {
        setConnected(data.is_connected);
        setReadOnly(data.read_only);
        setHint(data.api_key_hint);
      }
    })();
  }, [user, exchange]);

  const connect = async () => {
    if (!user || !apiKey) return;
    const keyHint = `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
    const { error } = await supabase.from('futures_api_connections').upsert(
      {
        user_id: user.id,
        exchange,
        api_key_hint: keyHint,
        read_only: readOnly,
        paper_mode: true,
        live_locked: true,
        is_connected: true,
      } as any,
      { onConflict: 'user_id,exchange' },
    );
    if (error) {
      toast({ title: 'Connection failed', description: error.message, variant: 'destructive' });
      return;
    }
    setConnected(true);
    setHint(keyHint);
    setApiKey('');
    setSecret('');
    toast({ title: `${label} connected`, description: 'Read-only / paper mode.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {label}
          <Badge variant={connected ? 'default' : 'outline'}>
            {connected ? (readOnly ? 'Read-only' : 'Trade enabled') : 'Not connected'}
          </Badge>
        </CardTitle>
        {hint && <CardDescription>Key: {hint}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>API Key</Label>
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste API key" />
        </div>
        <div>
          <Label>Secret Key</Label>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Paste secret" />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Read-only mode</Label>
          <Switch checked={readOnly} onCheckedChange={setReadOnly} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Paper trading mode</Label>
          <Badge variant="secondary">Enforced</Badge>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Live trading</Label>
          <Badge variant="outline" className="flex items-center gap-1">
            <Lock className="w-3 h-3" /> Locked
          </Badge>
        </div>
        <Button onClick={connect} disabled={!apiKey} className="w-full">
          {connected ? 'Update Connection' : 'Connect'}
        </Button>
      </CardContent>
    </Card>
  );
}
