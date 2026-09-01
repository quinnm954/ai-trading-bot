import { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { MONTHLY_PRICE_USD } from '@/lib/pricing';

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

const fmtMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PaymentRow {
  id: string;
  amount_usdc: number;
  confirmed_at: string | null;
  chain: string;
}

/**
 * Account & billing snapshot: which plan this account is on, when it renews,
 * and the recent monthly fees actually paid on-chain.
 */
export function SubscriptionStatusCard() {
  const { user } = useAuth();
  const {
    subscribed,
    isFreeAccess,
    subscriptionEnd,
    isInTrial,
    trialDaysRemaining,
    isTrialExpired,
  } = useSubscription();
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('crypto_invoices')
        .select('id, amount_usdc, confirmed_at, chain')
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(3);

      if (!cancelled) setPayments((data as PaymentRow[]) || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const daysUntilRenewal = subscriptionEnd
    ? Math.max(
        0,
        Math.ceil((new Date(subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : null;

  const status = isFreeAccess
    ? { label: 'Free access', tone: 'bg-primary/15 text-primary' }
    : subscribed
      ? { label: 'Active', tone: 'bg-profit/15 text-profit' }
      : isInTrial && !isTrialExpired
        ? { label: 'Free trial', tone: 'bg-primary/15 text-primary' }
        : { label: 'Inactive', tone: 'bg-loss/15 text-loss' };

  const monthlyFee = isFreeAccess ? 0 : MONTHLY_PRICE_USD;
  const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount_usdc || 0), 0);

  return (
    <div className="glass-panel p-5 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Account &amp; Billing</h3>
        </div>
        <Badge className={status.tone} variant="secondary">
          {status.label}
        </Badge>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Signed in as</span>
          <span className="font-medium text-foreground truncate max-w-[60%] text-right">
            {user?.email ?? '—'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium text-foreground">
            Full Access · {monthlyFee === 0 ? 'Free' : `${fmtMoney(monthlyFee)}/mo`}
          </span>
        </div>

        {isFreeAccess ? (
          <div className="flex items-center gap-2 pt-2 border-t border-border text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>No fees on this account</span>
          </div>
        ) : subscribed ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Renews</span>
              <span className="tabular-nums font-medium text-foreground">
                {fmtDate(subscriptionEnd)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Days remaining</span>
              <span className="tabular-nums font-medium text-foreground">
                {daysUntilRenewal ?? '—'}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              {isTrialExpired ? (
                <AlertTriangle className="w-3.5 h-3.5 text-loss" />
              ) : (
                <Clock className="w-3.5 h-3.5" />
              )}
              {isTrialExpired ? 'Trial ended' : 'Trial days left'}
            </span>
            <span className="tabular-nums font-medium text-foreground">
              {isTrialExpired ? '0' : trialDaysRemaining}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fees paid (last 3)</span>
            <span className="tabular-nums font-medium text-foreground">{fmtMoney(totalPaid)}</span>
          </div>
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {fmtDate(p.confirmed_at)} · {p.chain}
                </span>
                <span className="tabular-nums text-foreground">
                  {fmtMoney(Number(p.amount_usdc))} USDC
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {!subscribed && (
        <Button asChild variant="glow" size="sm" className="w-full mt-4">
          <Link to="/pricing">
            {isTrialExpired ? 'Activate Full Access' : 'Subscribe early'}
          </Link>
        </Button>
      )}
    </div>
  );
}
