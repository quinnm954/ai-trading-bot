import { useState } from 'react';
import { 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle,
  Loader2,
  Trash2,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useApiConnections, ApiCredentials } from '@/hooks/useApiConnections';

interface BrokerConfig {
  provider: 'alpaca' | 'coinbase';
  name: string;
  logo: string;
  description: string;
  docsUrl: string;
  requiresPassphrase: boolean;
}

const brokers: BrokerConfig[] = [
  {
    provider: 'alpaca',
    name: 'Alpaca Trading',
    logo: '🦙',
    description: 'Commission-free stock trading API',
    docsUrl: 'https://alpaca.markets/docs/api-references/trading-api/',
    requiresPassphrase: false,
  },
  {
    provider: 'coinbase',
    name: 'Coinbase Advanced',
    logo: '💰',
    description: 'Cryptocurrency trading platform',
    docsUrl: 'https://docs.cdp.coinbase.com/advanced-trade/docs/welcome',
    requiresPassphrase: true,
  },
];

export default function ApiKeys() {
  const { connections, loading, getConnection, connectBroker, disconnectBroker } = useApiConnections();
  const [credentials, setCredentials] = useState<Record<string, Partial<ApiCredentials>>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const toggleSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCredential = (provider: string, field: keyof ApiCredentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }));
  };

  const getCredential = (provider: string, field: keyof ApiCredentials): string => {
    return (credentials[provider]?.[field] as string) || '';
  };

  const handleConnect = async (broker: BrokerConfig) => {
    const creds = credentials[broker.provider];
    if (!creds?.apiKey || !creds?.secretKey) {
      return;
    }

    setTesting(broker.provider);
    
    const success = await connectBroker({
      provider: broker.provider,
      apiKey: creds.apiKey,
      secretKey: creds.secretKey,
      passphrase: creds.passphrase,
    });

    if (success) {
      // Clear credentials from local state after successful connection
      setCredentials(prev => ({ ...prev, [broker.provider]: {} }));
    }

    setTesting(null);
  };

  const handleDisconnect = async (provider: 'alpaca' | 'coinbase') => {
    setDisconnecting(provider);
    await disconnectBroker(provider);
    setDisconnecting(null);
  };

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
            API Keys
          </h1>
          <p className="text-muted-foreground">Connect your broker and exchange accounts</p>
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
              We never have access to your funds - keys are only used for trading operations 
              you authorize. Enable IP whitelisting on your exchange for additional security.
            </p>
          </div>
        </div>
      </div>

      {/* API Key Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {brokers.map((broker) => {
          const connection = getConnection(broker.provider);
          const isConnected = connection?.is_connected || false;

          return (
            <div 
              key={broker.provider}
              className={cn(
                'glass-panel p-6 transition-all duration-300',
                isConnected && 'border-success/30'
              )}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl">
                    {broker.logo}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{broker.name}</h3>
                    <p className="text-xs text-muted-foreground">{broker.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {isConnected ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-success" />
                          <span className="text-sm text-success">Connected</span>
                          {connection?.api_key_hint && (
                            <span className="text-xs text-muted-foreground">
                              ({connection.api_key_hint})
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Not connected</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href={broker.docsUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {isConnected && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDisconnect(broker.provider)}
                      disabled={disconnecting === broker.provider}
                    >
                      {disconnecting === broker.provider ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-destructive" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">API Key</label>
                  <div className="relative">
                    <Input
                      type={showSecrets[`${broker.provider}-api`] ? 'text' : 'password'}
                      value={getCredential(broker.provider, 'apiKey')}
                      onChange={(e) => updateCredential(broker.provider, 'apiKey', e.target.value)}
                      placeholder={isConnected ? '••••••••' : 'Enter your API key'}
                      className="pr-10 bg-secondary border-border"
                      disabled={isConnected}
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret(`${broker.provider}-api`)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecrets[`${broker.provider}-api`] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    Secret Key / Private Key
                    {broker.provider === 'coinbase' && (
                      <span className="text-xs ml-1">(paste full PEM key for CDP)</span>
                    )}
                  </label>
                  <div className="relative">
                    <Textarea
                      value={getCredential(broker.provider, 'secretKey')}
                      onChange={(e) => updateCredential(broker.provider, 'secretKey', e.target.value)}
                      placeholder={isConnected ? '••••••••' : broker.provider === 'coinbase' 
                        ? 'Paste your secret key or full EC private key (including -----BEGIN EC PRIVATE KEY-----)'
                        : 'Enter your secret key'}
                      className={cn(
                        "pr-10 bg-secondary border-border min-h-[80px] resize-y font-mono text-xs",
                        !showSecrets[`${broker.provider}-secret`] && getCredential(broker.provider, 'secretKey') && "text-security-disc"
                      )}
                      disabled={isConnected}
                      style={!showSecrets[`${broker.provider}-secret`] && getCredential(broker.provider, 'secretKey') ? {
                        WebkitTextSecurity: 'disc'
                      } as React.CSSProperties : {}}
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret(`${broker.provider}-secret`)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    >
                      {showSecrets[`${broker.provider}-secret`] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {broker.requiresPassphrase && (
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Passphrase <span className="text-xs">(required for legacy API, not needed for CDP)</span>
                    </label>
                    <div className="relative">
                      <Input
                        type={showSecrets[`${broker.provider}-pass`] ? 'text' : 'password'}
                        value={getCredential(broker.provider, 'passphrase')}
                        onChange={(e) => updateCredential(broker.provider, 'passphrase', e.target.value)}
                        placeholder={isConnected ? '••••••••' : 'Enter your passphrase'}
                        className="pr-10 bg-secondary border-border"
                        disabled={isConnected}
                      />
                      <button
                        type="button"
                        onClick={() => toggleSecret(`${broker.provider}-pass`)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecrets[`${broker.provider}-pass`] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {!isConnected && (
                  <Button 
                    onClick={() => handleConnect(broker)}
                    disabled={testing === broker.provider || !getCredential(broker.provider, 'apiKey') || !getCredential(broker.provider, 'secretKey')}
                    variant="glow"
                    className="w-full gap-2"
                  >
                    {testing === broker.provider ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Testing Connection...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Connect {broker.name}
                      </>
                    )}
                  </Button>
                )}

                {isConnected && (
                  <Button 
                    onClick={() => handleConnect(broker)}
                    disabled={testing === broker.provider}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {testing === broker.provider ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Sync Account Balance
                      </>
                    )}
                  </Button>
                )}

                {connection?.updated_at && (
                  <p className="text-xs text-muted-foreground text-center">
                    Last updated: {new Date(connection.updated_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
