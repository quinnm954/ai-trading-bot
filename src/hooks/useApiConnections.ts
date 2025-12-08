import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ApiConnection {
  id: string;
  provider: 'alpaca' | 'coinbase';
  is_connected: boolean;
  api_key_hint: string | null;
  updated_at: string | null;
}

export interface ApiCredentials {
  provider: 'alpaca' | 'coinbase';
  apiKey: string;
  secretKey: string;
  passphrase?: string; // Only for Coinbase
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
      
      // Cast the provider to the correct type
      const typedConnections = (data || []).map(conn => ({
        ...conn,
        provider: conn.provider as 'alpaca' | 'coinbase'
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

  const getConnection = (provider: 'alpaca' | 'coinbase'): ApiConnection | undefined => {
    return connections.find(c => c.provider === provider);
  };

  const connectBroker = async (credentials: ApiCredentials): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to connect a broker');
      return false;
    }

    try {
      // Call edge function to test and store credentials
      const { data, error } = await supabase.functions.invoke('test-broker-connection', {
        body: {
          provider: credentials.provider,
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey,
          passphrase: credentials.passphrase,
        },
      });

      if (error) throw error;

      if (!data.success) {
        toast.error(data.message || 'Failed to connect broker');
        return false;
      }

      // Create hint from API key (first 4 and last 4 chars)
      const apiKeyHint = credentials.apiKey.length > 8 
        ? `${credentials.apiKey.slice(0, 4)}...${credentials.apiKey.slice(-4)}`
        : '****';

      // Check if connection already exists
      const existingConnection = getConnection(credentials.provider);

      if (existingConnection) {
        // Update existing connection
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
        // Insert new connection
        const { error: insertError } = await supabase
          .from('api_connections')
          .insert({
            user_id: user.id,
            provider: credentials.provider,
            is_connected: true,
            api_key_hint: apiKeyHint,
          });

        if (insertError) throw insertError;
      }

      // If connected, also create/update live_account with synced balance
      if (data.accountInfo) {
        const { balance, buying_power, equity } = data.accountInfo;
        
        const { data: existingAccount } = await supabase
          .from('live_account')
          .select('id')
          .eq('user_id', user.id)
          .eq('provider', credentials.provider)
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
              provider: credentials.provider,
              balance: balance || 0,
              buying_power: buying_power || 0,
              equity: equity || 0,
            });
        }
      }

      await fetchConnections();
      toast.success(`${credentials.provider === 'alpaca' ? 'Alpaca' : 'Coinbase'} connected successfully!`);
      return true;
    } catch (error: any) {
      console.error('Error connecting broker:', error);
      toast.error(error.message || 'Failed to connect broker');
      return false;
    }
  };

  const disconnectBroker = async (provider: 'alpaca' | 'coinbase'): Promise<boolean> => {
    if (!user) return false;

    try {
      const connection = getConnection(provider);
      if (!connection) return false;

      // Update connection to disconnected
      const { error } = await supabase
        .from('api_connections')
        .update({
          is_connected: false,
          api_key_hint: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      if (error) throw error;

      await fetchConnections();
      toast.success(`${provider === 'alpaca' ? 'Alpaca' : 'Coinbase'} disconnected`);
      return true;
    } catch (error: any) {
      console.error('Error disconnecting broker:', error);
      toast.error(error.message || 'Failed to disconnect broker');
      return false;
    }
  };

  return {
    connections,
    loading,
    getConnection,
    connectBroker,
    disconnectBroker,
    refetch: fetchConnections,
  };
}
