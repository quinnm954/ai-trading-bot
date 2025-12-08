import { useState } from 'react';
import { 
  Key, 
  Plus, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ApiKeyConfig {
  id: string;
  provider: 'alpaca' | 'coinbase';
  name: string;
  isConnected: boolean;
  lastTested?: Date;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
}

const initialKeys: ApiKeyConfig[] = [
  {
    id: '1',
    provider: 'alpaca',
    name: 'Alpaca Trading',
    isConnected: false,
    apiKey: '',
    secretKey: '',
  },
  {
    id: '2',
    provider: 'coinbase',
    name: 'Coinbase Advanced',
    isConnected: false,
    apiKey: '',
    secretKey: '',
    passphrase: '',
  },
];

const providerLogos: Record<string, string> = {
  alpaca: '🦙',
  coinbase: '💰',
};

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyConfig[]>(initialKeys);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const toggleSecret = (id: string) => {
    setShowSecrets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const updateKey = (id: string, field: keyof ApiKeyConfig, value: string) => {
    setKeys(prev => prev.map(key => 
      key.id === id ? { ...key, [field]: value } : key
    ));
  };

  const testConnection = async (id: string) => {
    setTesting(id);
    // Simulate API test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const key = keys.find(k => k.id === id);
    if (key?.apiKey && key?.secretKey) {
      setKeys(prev => prev.map(k => 
        k.id === id ? { ...k, isConnected: true, lastTested: new Date() } : k
      ));
      toast.success(`${key.name} connected successfully!`);
    } else {
      toast.error('Please fill in all required fields');
    }
    setTesting(null);
  };

  const disconnectKey = (id: string) => {
    setKeys(prev => prev.map(key => 
      key.id === id ? { ...key, isConnected: false, apiKey: '', secretKey: '', passphrase: '' } : key
    ));
    toast.success('API key disconnected');
  };

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
              Your API keys are encrypted and stored securely. We never have access to your funds - 
              keys are only used for trading operations you authorize. Enable IP whitelisting on 
              your exchange for additional security.
            </p>
          </div>
        </div>
      </div>

      {/* API Key Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {keys.map((keyConfig) => (
          <div 
            key={keyConfig.id}
            className={cn(
              'glass-panel p-6 transition-all duration-300',
              keyConfig.isConnected && 'border-success/30'
            )}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl">
                  {providerLogos[keyConfig.provider]}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{keyConfig.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {keyConfig.isConnected ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="text-sm text-success">Connected</span>
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
              {keyConfig.isConnected && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => disconnectKey(keyConfig.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">API Key</label>
                <div className="relative">
                  <Input
                    type={showSecrets[`${keyConfig.id}-api`] ? 'text' : 'password'}
                    value={keyConfig.apiKey}
                    onChange={(e) => updateKey(keyConfig.id, 'apiKey', e.target.value)}
                    placeholder="Enter your API key"
                    className="pr-10 bg-secondary border-border"
                  />
                  <button
                    onClick={() => toggleSecret(`${keyConfig.id}-api`)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecrets[`${keyConfig.id}-api`] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Secret Key</label>
                <div className="relative">
                  <Input
                    type={showSecrets[`${keyConfig.id}-secret`] ? 'text' : 'password'}
                    value={keyConfig.secretKey}
                    onChange={(e) => updateKey(keyConfig.id, 'secretKey', e.target.value)}
                    placeholder="Enter your secret key"
                    className="pr-10 bg-secondary border-border"
                  />
                  <button
                    onClick={() => toggleSecret(`${keyConfig.id}-secret`)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecrets[`${keyConfig.id}-secret`] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {keyConfig.provider === 'coinbase' && (
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Passphrase</label>
                  <div className="relative">
                    <Input
                      type={showSecrets[`${keyConfig.id}-pass`] ? 'text' : 'password'}
                      value={keyConfig.passphrase || ''}
                      onChange={(e) => updateKey(keyConfig.id, 'passphrase', e.target.value)}
                      placeholder="Enter your passphrase"
                      className="pr-10 bg-secondary border-border"
                    />
                    <button
                      onClick={() => toggleSecret(`${keyConfig.id}-pass`)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecrets[`${keyConfig.id}-pass`] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <Button 
                onClick={() => testConnection(keyConfig.id)}
                disabled={testing === keyConfig.id}
                variant={keyConfig.isConnected ? 'outline' : 'glow'}
                className="w-full gap-2"
              >
                {testing === keyConfig.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : keyConfig.isConnected ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Retest Connection
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Test Connection
                  </>
                )}
              </Button>

              {keyConfig.lastTested && (
                <p className="text-xs text-muted-foreground text-center">
                  Last tested: {keyConfig.lastTested.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
