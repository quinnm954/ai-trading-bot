/**
 * =============================================================================
 * BROKER/EXCHANGE API CONNECTIONS HOOK
 * =============================================================================
 * 
 * PATENT REFERENCE: No Custody of User Funds (Patent Claim 5)
 * 
 * This hook manages API connections to crypto exchanges. This platform trades
 * crypto exclusively.
 * 
 * SUPPORTED PROVIDERS:
 * - coinbase: Cryptocurrency trading
 * - binance, kraken, kucoin, bybit, okx, gateio, bitget: Crypto exchanges
 * 
 * NO CUSTODY MODEL:
 * All trading occurs through user-owned broker accounts. TitanAI never holds
 * custody of user funds - we only execute trades via secure API connections.
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// Crypto exchanges only
export type ExchangeProvider = 'coinbase' | 'binance' | 'kraken' | 'kucoin' | 'bybit' | 'okx' | 'gateio' | 'bitget';

export interface ApiConnection {
  id: string;
  provider: ExchangeProvider;
  is_connected: boolean;
  api_key_hint: string | null;
  updated_at: string | null;
}

export interface ApiCredentials {
  provider?: ExchangeProvider | 'auto';
  apiKey: string;
  secretKey: string;
  passphrase?: string;
}

export function useApiConnections() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('api_connections')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      
      const typedConnections = (data || []).map(conn => ({
        ...conn,
        provider: conn.provider as ExchangeProvider
      }));
      
      setConnections(typedConnections);
    } catch (error) {
      console.error('Error fetching API connections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, [user]);

  const getConnection = (provider: ExchangeProvider): ApiConnection | undefined => {
    return connections.find(c => c.provider === provider);
  };

  const connectExchange = async (credentials: ApiCredentials): Promise<{ success: boolean; detectedExchange?: string }> => {
    if (!user) {
      toast.error('You must be logged in to connect an exchange');
      return { success: false };
    }

    try {
      // Call edge function to test and detect exchange
      const { data, error } = await supabase.functions.invoke('test-broker-connection', {
        body: {
          provider: credentials.provider || 'auto',
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey,
          passphrase: credentials.passphrase,
        },
      });

      if (error) throw error;

      if (!data.success) {
        toast.error(data.message || 'Failed to connect exchange');
        return { success: false };
      }

      const detectedProvider = data.detectedExchange as ExchangeProvider;
      const exchangeName = data.exchangeName || detectedProvider;

      // Create hint from API key
      const apiKeyHint = credentials.apiKey.length > 8 
        ? `${credentials.apiKey.slice(0, 4)}...${credentials.apiKey.slice(-4)}`
        : '****';

      // Check if connection already exists
      const existingConnection = getConnection(detectedProvider);

      if (existingConnection) {
        const { error: updateError } = await supabase
          .from('api_connections')
          .update({
            is_connected: true,
            api_key_hint: apiKeyHint,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConnection.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('api_connections')
          .insert({
            user_id: user.id,
            provider: detectedProvider,
            is_connected: true,
            api_key_hint: apiKeyHint,
          });

        if (insertError) throw insertError;
      }

      // Create/update live_account with synced balance
      if (data.accountInfo) {
        const { balance, buying_power, equity } = data.accountInfo;
        
        const { data: existingAccount } = await supabase
          .from('live_account')
          .select('id')
          .eq('user_id', user.id)
          .eq('provider', detectedProvider)
          .single();

        if (existingAccount) {
          await supabase
            .from('live_account')
            .update({
              balance: balance || 0,
              buying_power: buying_power || 0,
              equity: equity || 0,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', existingAccount.id);
        } else {
          await supabase
            .from('live_account')
            .insert({
              user_id: user.id,
              provider: detectedProvider,
              balance: balance || 0,
              buying_power: buying_power || 0,
              equity: equity || 0,
            });
        }
      }

      await fetchConnections();
      toast.success(`${exchangeName} connected successfully!`);
      return { success: true, detectedExchange: detectedProvider };
    } catch (error: any) {
      console.error('Error connecting exchange:', error);
      toast.error(error.message || 'Failed to connect exchange');
      return { success: false };
    }
  };

  const disconnectExchange = async (provider: ExchangeProvider): Promise<boolean> => {
    if (!user) return false;

    try {
      const connection = getConnection(provider);
      if (!connection) return false;

      const { error } = await supabase
        .from('api_connections')
        .update({
          is_connected: false,
          api_key_hint: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      if (error) throw error;

      // Remove stored broker credentials so backend sync stops
      await supabase
        .from('broker_credentials')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', provider);

      // Remove the live_account row entirely. Zeroing it out was not enough: live equity is
      // computed by summing every live_account row, so a leftover row keeps polluting
      // balances (and a stale one can carry an old, wildly wrong equity figure).
      await supabase
        .from('live_account')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', provider);

      await fetchConnections();
      toast.success(`${provider} disconnected`);
      return true;
    } catch (error: any) {
      console.error('Error disconnecting exchange:', error);
      toast.error(error.message || 'Failed to disconnect exchange');
      return false;
    }
  };

  return {
    connections,
    loading,
    getConnection,
    connectExchange,
    disconnectExchange,
    refetch: fetchConnections,
  };
}
