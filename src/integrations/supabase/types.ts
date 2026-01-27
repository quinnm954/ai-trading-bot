export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_decisions: {
        Row: {
          action: string | null
          created_at: string | null
          decision_type: string
          id: string
          market_regime: Database["public"]["Enums"]["market_regime"] | null
          reasoning: string
          strategy: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          decision_type: string
          id?: string
          market_regime?: Database["public"]["Enums"]["market_regime"] | null
          reasoning: string
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          decision_type?: string
          id?: string
          market_regime?: Database["public"]["Enums"]["market_regime"] | null
          reasoning?: string
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          ai_autonomous_mode: boolean | null
          allowed_markets: string[] | null
          bot_status: Database["public"]["Enums"]["bot_status"] | null
          created_at: string | null
          current_drawdown: number | null
          current_regime: Database["public"]["Enums"]["market_regime"] | null
          daily_loss_today: number | null
          enabled: boolean | null
          execution_mode: string
          id: string
          kill_switch_active: boolean | null
          kill_switch_triggered_at: string | null
          last_loss_reset_date: string | null
          live_mode_confirmed_at: string | null
          max_capital_usage: number | null
          max_concurrent_trades: number | null
          max_daily_loss: number | null
          max_drawdown: number | null
          max_leverage: number | null
          max_position_size: number | null
          peak_equity: number | null
          prioritize_moonshots: boolean | null
          risk_tolerance: string | null
          target_equity: number | null
          trading_mode: string
          updated_at: string | null
          user_id: string | null
          weekly_loss_current: number | null
          weekly_loss_limit: number | null
        }
        Insert: {
          ai_autonomous_mode?: boolean | null
          allowed_markets?: string[] | null
          bot_status?: Database["public"]["Enums"]["bot_status"] | null
          created_at?: string | null
          current_drawdown?: number | null
          current_regime?: Database["public"]["Enums"]["market_regime"] | null
          daily_loss_today?: number | null
          enabled?: boolean | null
          execution_mode?: string
          id?: string
          kill_switch_active?: boolean | null
          kill_switch_triggered_at?: string | null
          last_loss_reset_date?: string | null
          live_mode_confirmed_at?: string | null
          max_capital_usage?: number | null
          max_concurrent_trades?: number | null
          max_daily_loss?: number | null
          max_drawdown?: number | null
          max_leverage?: number | null
          max_position_size?: number | null
          peak_equity?: number | null
          prioritize_moonshots?: boolean | null
          risk_tolerance?: string | null
          target_equity?: number | null
          trading_mode?: string
          updated_at?: string | null
          user_id?: string | null
          weekly_loss_current?: number | null
          weekly_loss_limit?: number | null
        }
        Update: {
          ai_autonomous_mode?: boolean | null
          allowed_markets?: string[] | null
          bot_status?: Database["public"]["Enums"]["bot_status"] | null
          created_at?: string | null
          current_drawdown?: number | null
          current_regime?: Database["public"]["Enums"]["market_regime"] | null
          daily_loss_today?: number | null
          enabled?: boolean | null
          execution_mode?: string
          id?: string
          kill_switch_active?: boolean | null
          kill_switch_triggered_at?: string | null
          last_loss_reset_date?: string | null
          live_mode_confirmed_at?: string | null
          max_capital_usage?: number | null
          max_concurrent_trades?: number | null
          max_daily_loss?: number | null
          max_drawdown?: number | null
          max_leverage?: number | null
          max_position_size?: number | null
          peak_equity?: number | null
          prioritize_moonshots?: boolean | null
          risk_tolerance?: string | null
          target_equity?: number | null
          trading_mode?: string
          updated_at?: string | null
          user_id?: string | null
          weekly_loss_current?: number | null
          weekly_loss_limit?: number | null
        }
        Relationships: []
      }
      api_connections: {
        Row: {
          api_key_hint: string | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          provider: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          api_key_hint?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          provider: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          api_key_hint?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          provider?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      broker_credentials: {
        Row: {
          access_token_encrypted: string | null
          api_key_encrypted: string
          created_at: string
          id: string
          is_paper: boolean
          last_used_at: string | null
          passphrase_encrypted: string | null
          provider: string
          secret_key_encrypted: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          api_key_encrypted: string
          created_at?: string
          id?: string
          is_paper?: boolean
          last_used_at?: string | null
          passphrase_encrypted?: string | null
          provider: string
          secret_key_encrypted?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          api_key_encrypted?: string
          created_at?: string
          id?: string
          is_paper?: boolean
          last_used_at?: string | null
          passphrase_encrypted?: string | null
          provider?: string
          secret_key_encrypted?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      copy_trade_signals: {
        Row: {
          action: string
          copied_at: string | null
          created_at: string
          entry_price: number | null
          id: string
          quantity: number | null
          status: string | null
          symbol: string
          trade_value_usd: number | null
          trader_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          copied_at?: string | null
          created_at?: string
          entry_price?: number | null
          id?: string
          quantity?: number | null
          status?: string | null
          symbol: string
          trade_value_usd?: number | null
          trader_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          copied_at?: string | null
          created_at?: string
          entry_price?: number | null
          id?: string
          quantity?: number | null
          status?: string | null
          symbol?: string
          trade_value_usd?: number | null
          trader_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_trade_signals_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "top_traders"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_trading_settings: {
        Row: {
          auto_copy: boolean | null
          copy_percentage: number | null
          created_at: string
          enabled: boolean | null
          id: string
          max_concurrent_copies: number | null
          max_copy_amount_usd: number | null
          min_trader_trades: number | null
          min_trader_win_rate: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_copy?: boolean | null
          copy_percentage?: number | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          max_concurrent_copies?: number | null
          max_copy_amount_usd?: number | null
          min_trader_trades?: number | null
          min_trader_win_rate?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_copy?: boolean | null
          copy_percentage?: number | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          max_concurrent_copies?: number | null
          max_copy_amount_usd?: number | null
          min_trader_trades?: number | null
          min_trader_win_rate?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_pnl: {
        Row: {
          created_at: string | null
          date: string
          ending_equity: number | null
          id: string
          losses: number | null
          peak_equity: number | null
          realized_pnl: number | null
          trades_count: number | null
          unrealized_pnl: number | null
          updated_at: string | null
          user_id: string | null
          wins: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          ending_equity?: number | null
          id?: string
          losses?: number | null
          peak_equity?: number | null
          realized_pnl?: number | null
          trades_count?: number | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          ending_equity?: number | null
          id?: string
          losses?: number | null
          peak_equity?: number | null
          realized_pnl?: number | null
          trades_count?: number | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Relationships: []
      }
      defi_yields: {
        Row: {
          apy: number
          asset_symbol: string
          audited: boolean | null
          chain: string
          created_at: string
          id: string
          impermanent_loss_risk: boolean | null
          min_deposit_usd: number | null
          pool_name: string
          protocol: string
          rewards_apy: number | null
          rewards_token: string | null
          risk_level: string | null
          total_apy: number | null
          tvl_usd: number | null
          updated_at: string
          url: string | null
        }
        Insert: {
          apy: number
          asset_symbol: string
          audited?: boolean | null
          chain?: string
          created_at?: string
          id?: string
          impermanent_loss_risk?: boolean | null
          min_deposit_usd?: number | null
          pool_name: string
          protocol: string
          rewards_apy?: number | null
          rewards_token?: string | null
          risk_level?: string | null
          total_apy?: number | null
          tvl_usd?: number | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          apy?: number
          asset_symbol?: string
          audited?: boolean | null
          chain?: string
          created_at?: string
          id?: string
          impermanent_loss_risk?: boolean | null
          min_deposit_usd?: number | null
          pool_name?: string
          protocol?: string
          rewards_apy?: number | null
          rewards_token?: string | null
          risk_level?: string | null
          total_apy?: number | null
          tvl_usd?: number | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      equity_history: {
        Row: {
          equity: number
          id: string
          recorded_at: string | null
          user_id: string | null
        }
        Insert: {
          equity: number
          id?: string
          recorded_at?: string | null
          user_id?: string | null
        }
        Update: {
          equity?: number
          id?: string
          recorded_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      followed_traders: {
        Row: {
          copy_percentage: number | null
          followed_at: string
          id: string
          is_active: boolean
          max_copy_amount_usd: number | null
          trader_id: string
          user_id: string
        }
        Insert: {
          copy_percentage?: number | null
          followed_at?: string
          id?: string
          is_active?: boolean
          max_copy_amount_usd?: number | null
          trader_id: string
          user_id: string
        }
        Update: {
          copy_percentage?: number | null
          followed_at?: string
          id?: string
          is_active?: boolean
          max_copy_amount_usd?: number | null
          trader_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followed_traders_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "top_traders"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      live_account: {
        Row: {
          balance: number
          buying_power: number
          created_at: string | null
          equity: number
          id: string
          last_synced_at: string | null
          provider: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          balance?: number
          buying_power?: number
          created_at?: string | null
          equity?: number
          id?: string
          last_synced_at?: string | null
          provider: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          balance?: number
          buying_power?: number
          created_at?: string | null
          equity?: number
          id?: string
          last_synced_at?: string | null
          provider?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      mev_opportunities: {
        Row: {
          chain: string | null
          created_at: string
          detected_at: string
          dex_pair: string | null
          estimated_profit_usd: number | null
          expires_at: string | null
          gas_cost_usd: number | null
          id: string
          net_profit_usd: number | null
          opportunity_type: string
          risk_level: string | null
          symbol: string
        }
        Insert: {
          chain?: string | null
          created_at?: string
          detected_at?: string
          dex_pair?: string | null
          estimated_profit_usd?: number | null
          expires_at?: string | null
          gas_cost_usd?: number | null
          id?: string
          net_profit_usd?: number | null
          opportunity_type: string
          risk_level?: string | null
          symbol: string
        }
        Update: {
          chain?: string | null
          created_at?: string
          detected_at?: string
          dex_pair?: string | null
          estimated_profit_usd?: number | null
          expires_at?: string | null
          gas_cost_usd?: number | null
          id?: string
          net_profit_usd?: number | null
          opportunity_type?: string
          risk_level?: string | null
          symbol?: string
        }
        Relationships: []
      }
      moonshot_signals: {
        Row: {
          created_at: string
          id: string
          liquidity_score: number
          name: string | null
          price_change_24h: number | null
          price_usd: number | null
          pump_probability: number
          sentiment_score: number
          signal_tags: string[] | null
          symbol: string
          technical_score: number
          updated_at: string
          volume_24h: number | null
          volume_score: number
          whale_score: number
        }
        Insert: {
          created_at?: string
          id?: string
          liquidity_score?: number
          name?: string | null
          price_change_24h?: number | null
          price_usd?: number | null
          pump_probability?: number
          sentiment_score?: number
          signal_tags?: string[] | null
          symbol: string
          technical_score?: number
          updated_at?: string
          volume_24h?: number | null
          volume_score?: number
          whale_score?: number
        }
        Update: {
          created_at?: string
          id?: string
          liquidity_score?: number
          name?: string | null
          price_change_24h?: number | null
          price_usd?: number | null
          pump_probability?: number
          sentiment_score?: number
          signal_tags?: string[] | null
          symbol?: string
          technical_score?: number
          updated_at?: string
          volume_24h?: number | null
          volume_score?: number
          whale_score?: number
        }
        Relationships: []
      }
      paper_account: {
        Row: {
          balance: number
          created_at: string | null
          id: string
          initial_balance: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          balance?: number
          created_at?: string | null
          id?: string
          initial_balance?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          balance?: number
          created_at?: string | null
          id?: string
          initial_balance?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pending_trades: {
        Row: {
          ai_reasoning: string
          confidence: number
          created_at: string
          expires_at: string
          id: string
          market_regime: string | null
          position_value: number
          price: number
          quantity: number
          review_notes: string | null
          reviewed_at: string | null
          side: string
          status: string
          strategy: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          ai_reasoning: string
          confidence?: number
          created_at?: string
          expires_at?: string
          id?: string
          market_regime?: string | null
          position_value: number
          price: number
          quantity: number
          review_notes?: string | null
          reviewed_at?: string | null
          side: string
          status?: string
          strategy?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          ai_reasoning?: string
          confidence?: number
          created_at?: string
          expires_at?: string
          id?: string
          market_regime?: string | null
          position_value?: number
          price?: number
          quantity?: number
          review_notes?: string | null
          reviewed_at?: string | null
          side?: string
          status?: string
          strategy?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_entry_price: number
          created_at: string | null
          current_price: number | null
          id: string
          is_paper: boolean
          market_type: Database["public"]["Enums"]["market_type"]
          peak_pnl_percent: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          strategy: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string
          unrealized_pnl: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avg_entry_price: number
          created_at?: string | null
          current_price?: number | null
          id?: string
          is_paper?: boolean
          market_type: Database["public"]["Enums"]["market_type"]
          peak_pnl_percent?: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avg_entry_price?: number
          created_at?: string | null
          current_price?: number | null
          id?: string
          is_paper?: boolean
          market_type?: Database["public"]["Enums"]["market_type"]
          peak_pnl_percent?: number | null
          quantity?: number
          side?: Database["public"]["Enums"]["trade_side"]
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol?: string
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          marketer_name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          marketer_name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          marketer_name?: string
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          message: string
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          message: string
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          message?: string
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sentiment_signals: {
        Row: {
          analyzed_at: string
          bearish_count: number | null
          bullish_count: number | null
          created_at: string
          id: string
          influencer_mentions: number | null
          mention_count: number | null
          sample_posts: Json | null
          sentiment_score: number
          source: string
          symbol: string
          trending_rank: number | null
        }
        Insert: {
          analyzed_at?: string
          bearish_count?: number | null
          bullish_count?: number | null
          created_at?: string
          id?: string
          influencer_mentions?: number | null
          mention_count?: number | null
          sample_posts?: Json | null
          sentiment_score: number
          source: string
          symbol: string
          trending_rank?: number | null
        }
        Update: {
          analyzed_at?: string
          bearish_count?: number | null
          bullish_count?: number | null
          created_at?: string
          id?: string
          influencer_mentions?: number | null
          mention_count?: number | null
          sample_posts?: Json | null
          sentiment_score?: number
          source?: string
          symbol?: string
          trending_rank?: number | null
        }
        Relationships: []
      }
      strategy_performance: {
        Row: {
          avg_profit: number | null
          id: string
          market_regime: Database["public"]["Enums"]["market_regime"]
          score: number | null
          strategy: Database["public"]["Enums"]["strategy_type"]
          total_trades: number | null
          updated_at: string | null
          user_id: string | null
          win_rate: number | null
        }
        Insert: {
          avg_profit?: number | null
          id?: string
          market_regime: Database["public"]["Enums"]["market_regime"]
          score?: number | null
          strategy: Database["public"]["Enums"]["strategy_type"]
          total_trades?: number | null
          updated_at?: string | null
          user_id?: string | null
          win_rate?: number | null
        }
        Update: {
          avg_profit?: number | null
          id?: string
          market_regime?: Database["public"]["Enums"]["market_regime"]
          score?: number | null
          strategy?: Database["public"]["Enums"]["strategy_type"]
          total_trades?: number | null
          updated_at?: string | null
          user_id?: string | null
          win_rate?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      top_traders: {
        Row: {
          avg_trade_size_usd: number | null
          best_performing_assets: string[] | null
          created_at: string
          display_name: string | null
          followers_count: number | null
          id: string
          last_active_at: string | null
          risk_score: number | null
          total_pnl_usd: number | null
          total_trades: number | null
          trading_style: string | null
          updated_at: string
          wallet_address: string
          win_rate: number | null
        }
        Insert: {
          avg_trade_size_usd?: number | null
          best_performing_assets?: string[] | null
          created_at?: string
          display_name?: string | null
          followers_count?: number | null
          id?: string
          last_active_at?: string | null
          risk_score?: number | null
          total_pnl_usd?: number | null
          total_trades?: number | null
          trading_style?: string | null
          updated_at?: string
          wallet_address: string
          win_rate?: number | null
        }
        Update: {
          avg_trade_size_usd?: number | null
          best_performing_assets?: string[] | null
          created_at?: string
          display_name?: string | null
          followers_count?: number | null
          id?: string
          last_active_at?: string | null
          risk_score?: number | null
          total_pnl_usd?: number | null
          total_trades?: number | null
          trading_style?: string | null
          updated_at?: string
          wallet_address?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          ai_reasoning: string | null
          closed_at: string | null
          created_at: string | null
          entry_price: number
          exit_price: number | null
          id: string
          is_paper: boolean
          market_type: Database["public"]["Enums"]["market_type"]
          pnl: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          status: Database["public"]["Enums"]["trade_status"]
          strategy: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string
          user_id: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_price: number
          exit_price?: number | null
          id?: string
          is_paper?: boolean
          market_type: Database["public"]["Enums"]["market_type"]
          pnl?: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string
          user_id?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          exit_price?: number | null
          id?: string
          is_paper?: boolean
          market_type?: Database["public"]["Enums"]["market_type"]
          pnl?: number | null
          quantity?: number
          side?: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          has_free_access: boolean | null
          id: string
          invited_by: string | null
          referred_by_code: string | null
          role: Database["public"]["Enums"]["app_role"]
          trial_started_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          has_free_access?: boolean | null
          id?: string
          invited_by?: string | null
          referred_by_code?: string | null
          role: Database["public"]["Enums"]["app_role"]
          trial_started_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          has_free_access?: boolean | null
          id?: string
          invited_by?: string | null
          referred_by_code?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          trial_started_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      welcome_emails_sent: {
        Row: {
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whale_signals: {
        Row: {
          action: string
          amount: number
          amount_usd: number | null
          confidence: number | null
          created_at: string
          detected_at: string
          from_exchange: boolean | null
          id: string
          symbol: string
          to_exchange: boolean | null
          transaction_hash: string | null
          whale_address: string | null
        }
        Insert: {
          action: string
          amount: number
          amount_usd?: number | null
          confidence?: number | null
          created_at?: string
          detected_at?: string
          from_exchange?: boolean | null
          id?: string
          symbol: string
          to_exchange?: boolean | null
          transaction_hash?: string | null
          whale_address?: string | null
        }
        Update: {
          action?: string
          amount?: number
          amount_usd?: number | null
          confidence?: number | null
          created_at?: string
          detected_at?: string
          from_exchange?: boolean | null
          id?: string
          symbol?: string
          to_exchange?: boolean | null
          transaction_hash?: string | null
          whale_address?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_use_feature: {
        Args: { p_feature: string; p_user_id: string }
        Returns: boolean
      }
      get_referral_stats: {
        Args: never
        Returns: {
          code: string
          marketer_name: string
          signup_count: number
        }[]
      }
      get_user_subscription_tier: {
        Args: { p_user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      bot_status: "idle" | "learning" | "trading"
      market_regime:
        | "trending"
        | "ranging"
        | "high_volatility"
        | "low_volatility"
        | "news_driven"
      market_type: "stocks" | "crypto"
      strategy_type:
        | "rsi"
        | "ema_crossover"
        | "macd"
        | "trend_breakout"
        | "volatility_breakout"
        | "grid"
        | "dca"
        | "custom"
      trade_side: "buy" | "sell"
      trade_status: "open" | "closed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      bot_status: ["idle", "learning", "trading"],
      market_regime: [
        "trending",
        "ranging",
        "high_volatility",
        "low_volatility",
        "news_driven",
      ],
      market_type: ["stocks", "crypto"],
      strategy_type: [
        "rsi",
        "ema_crossover",
        "macd",
        "trend_breakout",
        "volatility_breakout",
        "grid",
        "dca",
        "custom",
      ],
      trade_side: ["buy", "sell"],
      trade_status: ["open", "closed", "cancelled"],
    },
  },
} as const
