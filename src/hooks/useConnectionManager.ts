import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ConnectionState {
  isConnected: boolean;
  lastPing: Date | null;
  reconnectAttempts: number;
  status: 'connected' | 'reconnecting' | 'disconnected';
}

export function useConnectionManager() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: true,
    lastPing: null,
    reconnectAttempts: 0,
    status: 'connected',
  });

  const pingInterval = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const healthCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Ping Supabase to check connection
  const pingConnection = useCallback(async () => {
    try {
      const start = Date.now();
      const { error } = await supabase
        .from('ai_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      const latency = Date.now() - start;
      
      if (!error) {
        setConnectionState(prev => ({
          ...prev,
          isConnected: true,
          lastPing: new Date(),
          reconnectAttempts: 0,
          status: 'connected',
        }));
        console.log(`[Connection] Ping OK (${latency}ms)`);
        return true;
      } else {
        console.warn('[Connection] Ping failed:', error.message);
        return false;
      }
    } catch (error) {
      console.error('[Connection] Ping error:', error);
      return false;
    }
  }, []);

  // Aggressive reconnection
  const attemptReconnect = useCallback(async () => {
    setConnectionState(prev => ({
      ...prev,
      status: 'reconnecting',
      reconnectAttempts: prev.reconnectAttempts + 1,
    }));

    console.log('[Connection] Attempting reconnection...');

    // Try to refresh the session
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[Connection] Session refresh failed:', error.message);
      }
    } catch (e) {
      console.warn('[Connection] Session refresh error:', e);
    }

    // Ping to verify
    const success = await pingConnection();

    if (!success) {
      // Schedule another reconnect attempt with exponential backoff (max 5 seconds)
      const delay = Math.min(1000 * Math.pow(1.5, connectionState.reconnectAttempts), 5000);
      console.log(`[Connection] Reconnect failed, retrying in ${delay}ms...`);
      
      reconnectTimeout.current = setTimeout(() => {
        attemptReconnect();
      }, delay);
    }
  }, [pingConnection, connectionState.reconnectAttempts]);

  // Health check that runs continuously
  const runHealthCheck = useCallback(async () => {
    const success = await pingConnection();
    
    if (!success && connectionState.status !== 'reconnecting') {
      attemptReconnect();
    }
  }, [pingConnection, attemptReconnect, connectionState.status]);

  useEffect(() => {
    // Initial ping
    pingConnection();

    // Ping every 3 seconds to ensure connection
    pingInterval.current = setInterval(() => {
      pingConnection();
    }, 3000);

    // Health check every 5 seconds
    healthCheckInterval.current = setInterval(() => {
      runHealthCheck();
    }, 5000);

    // Listen for online/offline events
    const handleOnline = () => {
      console.log('[Connection] Browser came online');
      attemptReconnect();
    };

    const handleOffline = () => {
      console.log('[Connection] Browser went offline');
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        status: 'disconnected',
      }));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Connection] Tab became visible, refreshing connection');
        pingConnection();
      }
    };

    const handleFocus = () => {
      console.log('[Connection] Window focused, refreshing connection');
      pingConnection();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (healthCheckInterval.current) clearInterval(healthCheckInterval.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [pingConnection, runHealthCheck, attemptReconnect]);

  return {
    ...connectionState,
    forceReconnect: attemptReconnect,
    ping: pingConnection,
  };
}
