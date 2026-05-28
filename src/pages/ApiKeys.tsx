import { useState } from 'react';
import { 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  Loader2,
  Trash2,
  ExternalLink,
  Zap,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useApiConnections, ExchangeProvider } from '@/hooks/useApiConnections';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExchangeConfig {
  provider: ExchangeProvider;
  name: string;
  logo: string;
  description: string;
  docsUrl: string;
  requiresPassphrase: boolean;
  keyHint: string;
}

/**
 * PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
 * 
 * Supported brokers and exchanges for multi-asset trading:
 * - Interactive Brokers: Global stocks, options, futures, forex
 * - Tradier: US stocks & options (commission-free options)
 * - Crypto exchanges: Coinbase, Binance, Kraken, etc.
 */
const exchanges: ExchangeConfig[] = [
  // STOCK BROKERS
  {
    provider: 'ibkr',
    name: 'Interactive Brokers',
    logo: '🏦',
    description: 'Global Stocks, Options, Futures, Forex',
    docsUrl: 'https://interactivebrokers.github.io/cpwebapi/',
    requiresPassphrase: false,
    keyHint: 'Client Portal API or TWS credentials',
  },
  {
    provider: 'tradier',
    name: 'Tradier',
    logo: '📈',
    description: 'US Stocks & Options (Commission-free options)',
    docsUrl: 'https://documentation.tradier.com/',
    requiresPassphrase: false,
    keyHint: 'Access token from developer portal',
  },
  // CRYPTO EXCHANGES
  {
    provider: 'coinbase',
    name: 'Coinbase',
    logo: '🪙',
    description: 'Coinbase Advanced Trade (CDP or Legacy)',
    docsUrl: 'https://docs.cdp.coinbase.com/advanced-trade/docs/welcome',
    requiresPassphrase: true,
    keyHint: 'organizations/... for CDP, or alphanumeric for Legacy',
  },
  {
    provider: 'binance',
    name: 'Binance',
    logo: '🔶',
    description: 'World\'s largest crypto exchange',
    docsUrl: 'https://binance-docs.github.io/apidocs/',
    requiresPassphrase: false,
    keyHint: '64-character alphanumeric key',
  },
  {
    provider: 'kraken',
    name: 'Kraken',
    logo: '🐙',
    description: 'Established US-based exchange',
    docsUrl: 'https://docs.kraken.com/rest/',
    requiresPassphrase: false,
    keyHint: 'Base64 encoded API key',
  },
  {
    provider: 'kucoin',
    name: 'KuCoin',
    logo: '🟢',
    description: 'Popular altcoin exchange',
    docsUrl: 'https://docs.kucoin.com/',
    requiresPassphrase: true,
    keyHint: '24-character hex key',
  },
  {
    provider: 'bybit',
    name: 'Bybit',
    logo: '🟡',
    description: 'Derivatives and spot trading',
    docsUrl: 'https://bybit-exchange.github.io/docs/',
    requiresPassphrase: false,
    keyHint: '18-character alphanumeric key',
  },
  {
    provider: 'okx',
    name: 'OKX',
    logo: '⬛',
    description: 'Global crypto derivatives exchange',
    docsUrl: 'https://www.okx.com/docs-v5/',
    requiresPassphrase: true,
    keyHint: 'UUID format key (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
  },
  {
    provider: 'gateio',
    name: 'Gate.io',
    logo: '🚪',
    description: 'Wide variety of altcoins',
    docsUrl: 'https://www.gate.io/docs/developers/apiv4/',
    requiresPassphrase: false,
    keyHint: '32-character hex key',
  },
  {
    provider: 'bitget',
    name: 'Bitget',
    logo: '🔵',
    description: 'Copy trading platform',
    docsUrl: 'https://bitgetlimited.github.io/apidoc/',
    requiresPassphrase: true,
    keyHint: 'bg_ prefixed key',
  },
];

export default function ApiKeys() {
  const { connections, loading, getConnection, connectExchange, disconnectExchange } = useApiConnections();
  const [credentials, setCredentials] = useState<{ apiKey: string; secretKey: string; passphrase: string }>({
    apiKey: '',
    secretKey: '',
    passphrase: '',
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [detectedExchange, setDetectedExchange] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSyncBalances = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-broker-balances');
      
      if (error) {
        console.error('Sync error:', error);
        toast.error('Failed to sync balances: ' + error.message);
      } else if (data?.success) {
        toast.success(`Balance synced successfully! Synced: ${data.synced?.join(', ') || 'none'}`);
        console.log('Sync results:', data);
      } else {
        toast.error(data?.message || 'Failed to sync balances');
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      toast.error('Failed to sync balances');
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Auto-detect exchange/broker from API key format
   * 
   * PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
   * Supports detection of stock brokers (IBKR, Tradier) and crypto exchanges
   */
  const detectExchangeFromKey = (apiKey: string, secretKey: string): string | null => {
    if (!apiKey && !secretKey) return null;
    
    // STOCK BROKER DETECTION
    // Tradier access tokens are typically long alphanumeric strings
    if (/^[A-Za-z0-9]{20,}$/.test(apiKey) && apiKey.length >= 20 && apiKey.length <= 40) {
      return 'Tradier (possible)';
    }
    
    
    // Tradier access tokens are typically long alphanumeric strings
    // They often start with specific patterns or have OAuth-style format
    if (/^[A-Za-z0-9]{20,}$/.test(apiKey) && apiKey.length >= 20 && apiKey.length <= 40) {
      // Could be Tradier - will be confirmed server-side
      return 'Tradier (possible)';
    }
    
    // CRYPTO EXCHANGE DETECTION
    if (apiKey.startsWith('organizations/') || secretKey.includes('-----BEGIN')) {
      return 'Coinbase CDP';
    }
    if (apiKey.startsWith('bg_')) return 'Bitget';
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(apiKey)) return 'OKX';
    if (/^[A-Za-z0-9]{64}$/.test(apiKey)) return 'Binance';
    if (/^[A-Za-z0-9+/=]{50,60}$/.test(apiKey)) return 'Kraken';
    if (/^[a-f0-9]{24}$/i.test(apiKey)) return 'KuCoin';
    if (/^[A-Za-z0-9]{18}$/.test(apiKey)) return 'Bybit';
    if (/^[a-f0-9]{32}$/i.test(apiKey)) return 'Gate.io';
    
    // IBKR detection requires server-side validation
    // Keys don't have a distinctive pattern - detected via API test
    
    return null;
  };

  const handleCredentialChange = (field: 'apiKey' | 'secretKey' | 'passphrase', value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    
    if (field === 'apiKey' || field === 'secretKey') {
      const newApiKey = field === 'apiKey' ? value : credentials.apiKey;
      const newSecretKey = field === 'secretKey' ? value : credentials.secretKey;
      setDetectedExchange(detectExchangeFromKey(newApiKey, newSecretKey));
    }
  };

  const toggleSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConnect = async () => {
    if (!credentials.apiKey || !credentials.secretKey) return;

    setTesting(true);
    
    const result = await connectExchange({
      provider: 'auto',
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      passphrase: credentials.passphrase || undefined,
    });

    if (result.success) {
      setCredentials({ apiKey: '', secretKey: '', passphrase: '' });
      setDetectedExchange(null);
    }

    setTesting(false);
  };

  const handleDisconnect = async (provider: ExchangeProvider) => {
    setDisconnecting(provider);
    await disconnectExchange(provider);
    setDisconnecting(null);
  };

  const connectedExchanges = connections.filter(c => c.is_connected);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Key className="w-7 h-7 text-primary" />
            Connect Broker / Exchange
          </h1>
          <p className="text-muted-foreground">Connect your stock broker or crypto exchange with auto-detection</p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="glass-panel p-4 border-warning/30">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-warning/20">
            <Key className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Security Notice</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Your API credentials are validated server-side and never stored in plain text. 
              We auto-detect your exchange from the API key format. Enable IP whitelisting 
              and disable withdrawal permissions for maximum security.
            </p>
          </div>
        </div>
      </div>

      {/* Auto-Connect Form */}
      <div className="glass-panel p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-primary/20">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Auto-Detect & Connect</h2>
            <p className="text-sm text-muted-foreground">
              Paste your API key and we'll automatically detect your broker or exchange
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">API Key</label>
            <div className="relative">
              <Input
                type={showSecrets['apiKey'] ? 'text' : 'password'}
                value={credentials.apiKey}
                onChange={(e) => handleCredentialChange('apiKey', e.target.value)}
                placeholder="Paste your API key from any supported exchange"
                className="pr-10 bg-secondary border-border"
              />
              <button
                type="button"
                onClick={() => toggleSecret('apiKey')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecrets['apiKey'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              Secret Key / Private Key
            </label>
            <div className="relative">
              <Textarea
                value={credentials.secretKey}
                onChange={(e) => handleCredentialChange('secretKey', e.target.value)}
                placeholder="Paste your secret key (or full PEM private key for Coinbase CDP)"
                className={cn(
                  "pr-10 bg-secondary border-border min-h-[80px] resize-y font-mono text-xs",
                  !showSecrets['secretKey'] && credentials.secretKey && "text-security-disc"
                )}
                style={!showSecrets['secretKey'] && credentials.secretKey ? {
                  WebkitTextSecurity: 'disc'
                } as React.CSSProperties : {}}
              />
              <button
                type="button"
                onClick={() => toggleSecret('secretKey')}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
              >
                {showSecrets['secretKey'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              Passphrase <span className="text-xs">(required for some exchanges)</span>
            </label>
            <div className="relative">
              <Input
                type={showSecrets['passphrase'] ? 'text' : 'password'}
                value={credentials.passphrase}
                onChange={(e) => handleCredentialChange('passphrase', e.target.value)}
                placeholder="Enter passphrase if required"
                className="pr-10 bg-secondary border-border"
              />
              <button
                type="button"
                onClick={() => toggleSecret('passphrase')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecrets['passphrase'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Detection indicator */}
          {detectedExchange && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Detected: {detectedExchange}</span>
              {(detectedExchange.includes('Alpaca') || detectedExchange.includes('Tradier') || detectedExchange.includes('IBKR')) && (
                <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full ml-2">Stock Broker</span>
              )}
              {!detectedExchange.includes('Alpaca') && !detectedExchange.includes('Tradier') && !detectedExchange.includes('IBKR') && (
                <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full ml-2">Crypto Exchange</span>
              )}
            </div>
          )}

          <Button 
            onClick={handleConnect}
            disabled={testing || !credentials.apiKey || !credentials.secretKey}
            variant="glow"
            className="w-full gap-2"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Connect Exchange
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Connected Brokers/Exchanges */}
      {connectedExchanges.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Connected Brokers & Exchanges</h3>
          <div className="space-y-3">
            {connectedExchanges.map((conn) => {
              const exchange = exchanges.find(e => e.provider === conn.provider);
              return (
                <div 
                  key={conn.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-success/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl">
                      {exchange?.logo || '🔗'}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{exchange?.name || conn.provider}</p>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-success" />
                        <span className="text-xs text-success">Connected</span>
                        {conn.api_key_hint && (
                          <span className="text-xs text-muted-foreground">({conn.api_key_hint})</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleDisconnect(conn.provider)}
                    disabled={disconnecting === conn.provider}
                    className="text-destructive hover:text-destructive"
                  >
                    {disconnecting === conn.provider ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
          
          {/* Sync Button */}
          <Button
            onClick={handleSyncBalances}
            disabled={syncing}
            variant="outline"
            className="w-full mt-4 gap-2"
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing Balances...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sync Balances Now
              </>
            )}
          </Button>
        </div>
      )}

      {/* Supported Brokers & Exchanges */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Supported Brokers & Exchanges</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {exchanges.map((exchange) => {
            const isConnected = connections.some(c => c.provider === exchange.provider && c.is_connected);
            return (
              <a
                key={exchange.provider}
                href={exchange.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-colors",
                  isConnected 
                    ? "bg-success/10 border border-success/30" 
                    : "bg-secondary/50 hover:bg-secondary"
                )}
              >
                <span className="text-2xl">{exchange.logo}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{exchange.name}</p>
                  {isConnected && (
                    <span className="text-xs text-success">Connected</span>
                  )}
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
