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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_incidents: {
        Row: {
          context: Json
          created_at: string
          description: string
          detected_by: string
          id: string
          incident_type: string
          remediation: string | null
          resolved: boolean
          resolved_at: string | null
          severity: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          description: string
          detected_by?: string
          id?: string
          incident_type: string
          remediation?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          description?: string
          detected_by?: string
          id?: string
          incident_type?: string
          remediation?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_messages: {
        Row: {
          created_at: string
          from_agent: string
          id: string
          in_reply_to: string | null
          message_type: string
          payload: Json
          priority: string
          status: string
          subject: string | null
          to_agent: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_agent: string
          id?: string
          in_reply_to?: string | null
          message_type: string
          payload?: Json
          priority?: string
          status?: string
          subject?: string | null
          to_agent: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_agent?: string
          id?: string
          in_reply_to?: string | null
          message_type?: string
          payload?: Json
          priority?: string
          status?: string
          subject?: string | null
          to_agent?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_overrides: {
        Row: {
          active: boolean
          agent: string
          consumed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          override_type: string
          payload: Json
          user_id: string
        }
        Insert: {
          active?: boolean
          agent: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          override_type: string
          payload?: Json
          user_id: string
        }
        Update: {
          active?: boolean
          agent?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          override_type?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      agent_state: {
        Row: {
          agent: string
          created_at: string
          current_task: string | null
          cycle_count: number
          error_count: number
          id: string
          last_cycle_at: string | null
          last_heartbeat: string
          metadata: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent: string
          created_at?: string
          current_task?: string | null
          cycle_count?: number
          error_count?: number
          id?: string
          last_cycle_at?: string | null
          last_heartbeat?: string
          metadata?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent?: string
          created_at?: string
          current_task?: string | null
          cycle_count?: number
          error_count?: number
          id?: string
          last_cycle_at?: string | null
          last_heartbeat?: string
          metadata?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_balances: {
        Row: {
          credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_transactions: {
        Row: {
          created_at: string
          delta: number
          description: string | null
          id: string
          stripe_session_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          description?: string | null
          id?: string
          stripe_session_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          description?: string | null
          id?: string
          stripe_session_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_decisions: {
        Row: {
          action: string | null
          created_at: string | null
          decision_type: string
          factor_scores: Json | null
          id: string
          market_regime: Database["public"]["Enums"]["market_regime"] | null
          reasoning: string
          risk_reward: number | null
          score: number | null
          strategy: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string | null
          user_id: string | null
          valid: boolean | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          decision_type: string
          factor_scores?: Json | null
          id?: string
          market_regime?: Database["public"]["Enums"]["market_regime"] | null
          reasoning: string
          risk_reward?: number | null
          score?: number | null
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol?: string | null
          user_id?: string | null
          valid?: boolean | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          decision_type?: string
          factor_scores?: Json | null
          id?: string
          market_regime?: Database["public"]["Enums"]["market_regime"] | null
          reasoning?: string
          risk_reward?: number | null
          score?: number | null
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol?: string | null
          user_id?: string | null
          valid?: boolean | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          ai_autonomous_mode: boolean | null
          ai_monthly_budget_usd: number
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
          live_initial_investment: number
          live_mode_confirmed_at: string | null
          max_capital_usage: number | null
          max_concurrent_trades: number | null
          max_daily_loss: number | null
          max_drawdown: number | null
          max_leverage: number | null
          max_position_size: number | null
          meme_coins_only: boolean
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
          ai_monthly_budget_usd?: number
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
          live_initial_investment?: number
          live_mode_confirmed_at?: string | null
          max_capital_usage?: number | null
          max_concurrent_trades?: number | null
          max_daily_loss?: number | null
          max_drawdown?: number | null
          max_leverage?: number | null
          max_position_size?: number | null
          meme_coins_only?: boolean
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
          ai_monthly_budget_usd?: number
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
          live_initial_investment?: number
          live_mode_confirmed_at?: string | null
          max_capital_usage?: number | null
          max_concurrent_trades?: number | null
          max_daily_loss?: number | null
          max_drawdown?: number | null
          max_leverage?: number | null
          max_position_size?: number | null
          meme_coins_only?: boolean
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
      ai_usage_log: {
        Row: {
          cost_usd: number
          created_at: string
          function_name: string
          id: string
          model: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          function_name: string
          id?: string
          model?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          function_name?: string
          id?: string
          model?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
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
      backtest_runs: {
        Row: {
          avg_loss: number
          avg_win: number
          best_trade: number
          created_at: string
          details: Json | null
          ending_balance: number
          id: string
          initial_balance: number
          max_drawdown: number
          period_days: number
          profit_factor: number
          sharpe: number | null
          status: string
          strategy: string
          symbol: string
          timeframe: string
          total_return: number
          trades_count: number
          user_id: string
          win_rate: number
          worst_trade: number
        }
        Insert: {
          avg_loss?: number
          avg_win?: number
          best_trade?: number
          created_at?: string
          details?: Json | null
          ending_balance?: number
          id?: string
          initial_balance?: number
          max_drawdown?: number
          period_days?: number
          profit_factor?: number
          sharpe?: number | null
          status?: string
          strategy: string
          symbol: string
          timeframe: string
          total_return?: number
          trades_count?: number
          user_id: string
          win_rate?: number
          worst_trade?: number
        }
        Update: {
          avg_loss?: number
          avg_win?: number
          best_trade?: number
          created_at?: string
          details?: Json | null
          ending_balance?: number
          id?: string
          initial_balance?: number
          max_drawdown?: number
          period_days?: number
          profit_factor?: number
          sharpe?: number | null
          status?: string
          strategy?: string
          symbol?: string
          timeframe?: string
          total_return?: number
          trades_count?: number
          user_id?: string
          win_rate?: number
          worst_trade?: number
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
      futures_api_connections: {
        Row: {
          api_key_hint: string | null
          created_at: string
          exchange: string
          id: string
          is_connected: boolean
          live_locked: boolean
          paper_mode: boolean
          read_only: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_hint?: string | null
          created_at?: string
          exchange: string
          id?: string
          is_connected?: boolean
          live_locked?: boolean
          paper_mode?: boolean
          read_only?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_hint?: string | null
          created_at?: string
          exchange?: string
          id?: string
          is_connected?: boolean
          live_locked?: boolean
          paper_mode?: boolean
          read_only?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      futures_positions: {
        Row: {
          closed_at: string | null
          entry_price: number
          estimated_fees: number | null
          estimated_liquidation_price: number | null
          exchange: string | null
          exit_price: number | null
          id: string
          is_paper: boolean
          leverage: number
          margin_mode: string
          margin_used: number
          opened_at: string
          pnl: number | null
          position_value: number
          quantity: number
          side: string
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          entry_price: number
          estimated_fees?: number | null
          estimated_liquidation_price?: number | null
          exchange?: string | null
          exit_price?: number | null
          id?: string
          is_paper?: boolean
          leverage: number
          margin_mode?: string
          margin_used: number
          opened_at?: string
          pnl?: number | null
          position_value: number
          quantity: number
          side: string
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          user_id: string
        }
        Update: {
          closed_at?: string | null
          entry_price?: number
          estimated_fees?: number | null
          estimated_liquidation_price?: number | null
          exchange?: string | null
          exit_price?: number | null
          id?: string
          is_paper?: boolean
          leverage?: number
          margin_mode?: string
          margin_used?: number
          opened_at?: string
          pnl?: number | null
          position_value?: number
          quantity?: number
          side?: string
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          user_id?: string
        }
        Relationships: []
      }
      grid_layouts: {
        Row: {
          atr: number | null
          center_price: number
          created_at: string
          id: string
          levels: Json
          lower_bound: number | null
          regime: string | null
          spacing: number
          symbol: string
          updated_at: string
          upper_bound: number | null
          user_id: string
        }
        Insert: {
          atr?: number | null
          center_price: number
          created_at?: string
          id?: string
          levels?: Json
          lower_bound?: number | null
          regime?: string | null
          spacing: number
          symbol: string
          updated_at?: string
          upper_bound?: number | null
          user_id: string
        }
        Update: {
          atr?: number | null
          center_price?: number
          created_at?: string
          id?: string
          levels?: Json
          lower_bound?: number | null
          regime?: string | null
          spacing?: number
          symbol?: string
          updated_at?: string
          upper_bound?: number | null
          user_id?: string
        }
        Relationships: []
      }
      healer_remedies: {
        Row: {
          action: string
          action_params: Json
          confidence: number
          created_at: string
          description: string
          enabled: boolean
          failure_count: number
          id: string
          last_applied_at: string | null
          last_outcome: string | null
          match_pattern: string
          match_type: string
          notes: string | null
          remedy_key: string
          success_count: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          action_params?: Json
          confidence?: number
          created_at?: string
          description: string
          enabled?: boolean
          failure_count?: number
          id?: string
          last_applied_at?: string | null
          last_outcome?: string | null
          match_pattern: string
          match_type?: string
          notes?: string | null
          remedy_key: string
          success_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          action_params?: Json
          confidence?: number
          created_at?: string
          description?: string
          enabled?: boolean
          failure_count?: number
          id?: string
          last_applied_at?: string | null
          last_outcome?: string | null
          match_pattern?: string
          match_type?: string
          notes?: string | null
          remedy_key?: string
          success_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      leverage_settings: {
        Row: {
          consecutive_losses_pause: number
          created_at: string
          cross_margin_enabled: boolean
          default_leverage: Json
          enabled: boolean
          id: string
          live_confirmed_at: string | null
          live_confirmed_by_admin: string | null
          live_enabled: boolean
          live_max_leverage: number
          margin_mode: string
          max_daily_loss_pct: number
          max_leverage_cap: number
          max_risk_per_trade_pct: number
          min_confidence: number
          min_risk_reward: number
          paper_enabled: boolean
          paper_max_leverage: number
          updated_at: string
          user_id: string
        }
        Insert: {
          consecutive_losses_pause?: number
          created_at?: string
          cross_margin_enabled?: boolean
          default_leverage?: Json
          enabled?: boolean
          id?: string
          live_confirmed_at?: string | null
          live_confirmed_by_admin?: string | null
          live_enabled?: boolean
          live_max_leverage?: number
          margin_mode?: string
          max_daily_loss_pct?: number
          max_leverage_cap?: number
          max_risk_per_trade_pct?: number
          min_confidence?: number
          min_risk_reward?: number
          paper_enabled?: boolean
          paper_max_leverage?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          consecutive_losses_pause?: number
          created_at?: string
          cross_margin_enabled?: boolean
          default_leverage?: Json
          enabled?: boolean
          id?: string
          live_confirmed_at?: string | null
          live_confirmed_by_admin?: string | null
          live_enabled?: boolean
          live_max_leverage?: number
          margin_mode?: string
          max_daily_loss_pct?: number
          max_leverage_cap?: number
          max_risk_per_trade_pct?: number
          min_confidence?: number
          min_risk_reward?: number
          paper_enabled?: boolean
          paper_max_leverage?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      liquidation_estimates: {
        Row: {
          created_at: string
          distance_to_liquidation_pct: number
          distance_to_stop_pct: number
          entry_price: number
          estimated_liquidation_price: number
          id: string
          leverage: number
          margin_required: number
          reason: string | null
          safe: boolean
          side: string
          stop_loss: number
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          distance_to_liquidation_pct: number
          distance_to_stop_pct: number
          entry_price: number
          estimated_liquidation_price: number
          id?: string
          leverage: number
          margin_required: number
          reason?: string | null
          safe: boolean
          side: string
          stop_loss: number
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          distance_to_liquidation_pct?: number
          distance_to_stop_pct?: number
          entry_price?: number
          estimated_liquidation_price?: number
          id?: string
          leverage?: number
          margin_required?: number
          reason?: string | null
          safe?: boolean
          side?: string
          stop_loss?: number
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      liquidation_map: {
        Row: {
          cluster_size_usd: number
          id: string
          position_count: number
          price_level: number
          side: string
          source: string
          symbol: string
          updated_at: string
        }
        Insert: {
          cluster_size_usd?: number
          id?: string
          position_count?: number
          price_level: number
          side: string
          source?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          cluster_size_usd?: number
          id?: string
          position_count?: number
          price_level?: number
          side?: string
          source?: string
          symbol?: string
          updated_at?: string
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
      margin_logs: {
        Row: {
          action: string
          amount: number
          balance_after: number | null
          created_at: string
          id: string
          notes: string | null
          position_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          amount: number
          balance_after?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          position_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          balance_after?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          position_id?: string | null
          user_id?: string
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
      news_feed: {
        Row: {
          fetched_at: string
          id: string
          published_at: string
          sentiment: number
          source: string
          summary: string | null
          symbols: string[]
          title: string
          url: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          published_at: string
          sentiment?: number
          source: string
          summary?: string | null
          symbols?: string[]
          title: string
          url: string
        }
        Update: {
          fetched_at?: string
          id?: string
          published_at?: string
          sentiment?: number
          source?: string
          summary?: string | null
          symbols?: string[]
          title?: string
          url?: string
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
      payment_claims: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          sender_cashtag: string
          status: string
          tier: string
          transaction_note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_cashtag: string
          status?: string
          tier: string
          transaction_note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_cashtag?: string
          status?: string
          tier?: string
          transaction_note?: string | null
          updated_at?: string
          user_id?: string
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
      scalp_settings: {
        Row: {
          chase_guard_minutes: number
          created_at: string
          entry_min_15m_pct: number
          entry_min_1h_pct: number
          entry_min_24h_pct: number
          entry_min_5m_pct: number
          hard_stop_loss_pct: number
          id: string
          loss_rotation_cooldown_sec: number
          loss_rotation_enabled: boolean
          loss_rotation_max_loss_pct: number
          loss_rotation_min_age_sec: number
          loss_rotation_momentum_edge_pct: number
          max_capital_usage_pct: number
          max_concurrent_positions: number
          momentum_rotation_min_pct: number
          preset: string
          reentry_breakout_pct: number
          take_profit_pct: number
          target_position_size_usd: number
          trailing_drop_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chase_guard_minutes?: number
          created_at?: string
          entry_min_15m_pct?: number
          entry_min_1h_pct?: number
          entry_min_24h_pct?: number
          entry_min_5m_pct?: number
          hard_stop_loss_pct?: number
          id?: string
          loss_rotation_cooldown_sec?: number
          loss_rotation_enabled?: boolean
          loss_rotation_max_loss_pct?: number
          loss_rotation_min_age_sec?: number
          loss_rotation_momentum_edge_pct?: number
          max_capital_usage_pct?: number
          max_concurrent_positions?: number
          momentum_rotation_min_pct?: number
          preset?: string
          reentry_breakout_pct?: number
          take_profit_pct?: number
          target_position_size_usd?: number
          trailing_drop_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chase_guard_minutes?: number
          created_at?: string
          entry_min_15m_pct?: number
          entry_min_1h_pct?: number
          entry_min_24h_pct?: number
          entry_min_5m_pct?: number
          hard_stop_loss_pct?: number
          id?: string
          loss_rotation_cooldown_sec?: number
          loss_rotation_enabled?: boolean
          loss_rotation_max_loss_pct?: number
          loss_rotation_min_age_sec?: number
          loss_rotation_momentum_edge_pct?: number
          max_capital_usage_pct?: number
          max_concurrent_positions?: number
          momentum_rotation_min_pct?: number
          preset?: string
          reentry_breakout_pct?: number
          take_profit_pct?: number
          target_position_size_usd?: number
          trailing_drop_pct?: number
          updated_at?: string
          user_id?: string
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
      signal_scores: {
        Row: {
          action: string | null
          created_at: string
          ema_alignment_score: number
          id: string
          macd_score: number
          reasoning: string | null
          risk_reward: number | null
          risk_reward_score: number
          rsi_score: number
          sr_score: number
          strategy: string | null
          symbol: string
          total_score: number
          trend_score: number
          user_id: string
          valid: boolean
          volatility_score: number
          volume_score: number
          vwap_score: number
        }
        Insert: {
          action?: string | null
          created_at?: string
          ema_alignment_score?: number
          id?: string
          macd_score?: number
          reasoning?: string | null
          risk_reward?: number | null
          risk_reward_score?: number
          rsi_score?: number
          sr_score?: number
          strategy?: string | null
          symbol: string
          total_score?: number
          trend_score?: number
          user_id: string
          valid?: boolean
          volatility_score?: number
          volume_score?: number
          vwap_score?: number
        }
        Update: {
          action?: string | null
          created_at?: string
          ema_alignment_score?: number
          id?: string
          macd_score?: number
          reasoning?: string | null
          risk_reward?: number | null
          risk_reward_score?: number
          rsi_score?: number
          sr_score?: number
          strategy?: string | null
          symbol?: string
          total_score?: number
          trend_score?: number
          user_id?: string
          valid?: boolean
          volatility_score?: number
          volume_score?: number
          vwap_score?: number
        }
        Relationships: []
      }
      strategy_performance: {
        Row: {
          avg_loss: number | null
          avg_profit: number | null
          avg_win: number | null
          best_trade: number | null
          enabled: boolean
          id: string
          market_regime: Database["public"]["Enums"]["market_regime"]
          max_drawdown: number | null
          profit_factor: number | null
          score: number | null
          strategy: Database["public"]["Enums"]["strategy_type"]
          total_trades: number | null
          updated_at: string | null
          user_id: string | null
          win_rate: number | null
          worst_trade: number | null
        }
        Insert: {
          avg_loss?: number | null
          avg_profit?: number | null
          avg_win?: number | null
          best_trade?: number | null
          enabled?: boolean
          id?: string
          market_regime: Database["public"]["Enums"]["market_regime"]
          max_drawdown?: number | null
          profit_factor?: number | null
          score?: number | null
          strategy: Database["public"]["Enums"]["strategy_type"]
          total_trades?: number | null
          updated_at?: string | null
          user_id?: string | null
          win_rate?: number | null
          worst_trade?: number | null
        }
        Update: {
          avg_loss?: number | null
          avg_profit?: number | null
          avg_win?: number | null
          best_trade?: number | null
          enabled?: boolean
          id?: string
          market_regime?: Database["public"]["Enums"]["market_regime"]
          max_drawdown?: number | null
          profit_factor?: number | null
          score?: number | null
          strategy?: Database["public"]["Enums"]["strategy_type"]
          total_trades?: number | null
          updated_at?: string | null
          user_id?: string | null
          win_rate?: number | null
          worst_trade?: number | null
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
      symbol_cooldowns: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          reason: string | null
          source: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          reason?: string | null
          source?: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          reason?: string | null
          source?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      titan_fusion_signals: {
        Row: {
          conviction: number
          direction: string
          drivers: Json
          features: Json
          generated_at: string
          horizon: string
          id: string
          rationale: string | null
          symbol: string
        }
        Insert: {
          conviction: number
          direction: string
          drivers?: Json
          features?: Json
          generated_at?: string
          horizon?: string
          id?: string
          rationale?: string | null
          symbol: string
        }
        Update: {
          conviction?: number
          direction?: string
          drivers?: Json
          features?: Json
          generated_at?: string
          horizon?: string
          id?: string
          rationale?: string | null
          symbol?: string
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
      trade_journal_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          tags: string[] | null
          trade_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          tags?: string[] | null
          trade_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          tags?: string[] | null
          trade_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          ai_reasoning: string | null
          closed_at: string | null
          confidence: number | null
          created_at: string | null
          duration_seconds: number | null
          entry_price: number
          entry_reasoning: string | null
          exit_price: number | null
          exit_reason: string | null
          fees_estimate: number | null
          id: string
          is_paper: boolean
          market_type: Database["public"]["Enums"]["market_type"]
          pnl: number | null
          quantity: number
          risk_reward: number | null
          score: number | null
          side: Database["public"]["Enums"]["trade_side"]
          slippage_estimate: number | null
          status: Database["public"]["Enums"]["trade_status"]
          stop_loss_price: number | null
          strategy: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string
          take_profit_price: number | null
          user_id: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          closed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          entry_price: number
          entry_reasoning?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          fees_estimate?: number | null
          id?: string
          is_paper?: boolean
          market_type: Database["public"]["Enums"]["market_type"]
          pnl?: number | null
          quantity: number
          risk_reward?: number | null
          score?: number | null
          side: Database["public"]["Enums"]["trade_side"]
          slippage_estimate?: number | null
          status?: Database["public"]["Enums"]["trade_status"]
          stop_loss_price?: number | null
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol: string
          take_profit_price?: number | null
          user_id?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          closed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          entry_price?: number
          entry_reasoning?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          fees_estimate?: number | null
          id?: string
          is_paper?: boolean
          market_type?: Database["public"]["Enums"]["market_type"]
          pnl?: number | null
          quantity?: number
          risk_reward?: number | null
          score?: number | null
          side?: Database["public"]["Enums"]["trade_side"]
          slippage_estimate?: number | null
          status?: Database["public"]["Enums"]["trade_status"]
          stop_loss_price?: number | null
          strategy?: Database["public"]["Enums"]["strategy_type"] | null
          symbol?: string
          take_profit_price?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      trial_reminder_emails_sent: {
        Row: {
          id: string
          reminder_type: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          reminder_type: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          reminder_type?: string
          sent_at?: string
          user_id?: string
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
      strategy_expectancy: {
        Row: {
          avg_loss: number | null
          avg_win: number | null
          expectancy_pct: number | null
          expectancy_per_trade: number | null
          is_paper: boolean | null
          last_trade_at: string | null
          net_pnl: number | null
          sample_size: number | null
          strategy: string | null
          user_id: string | null
          win_rate: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_payment_claim: {
        Args: { p_admin_notes?: string; p_claim_id: string }
        Returns: Json
      }
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
      reject_payment_claim: {
        Args: { p_admin_notes?: string; p_claim_id: string }
        Returns: undefined
      }
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
        | "scalp"
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
        "scalp",
      ],
      trade_side: ["buy", "sell"],
      trade_status: ["open", "closed", "cancelled"],
    },
  },
} as const
