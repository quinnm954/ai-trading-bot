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
          current_regime: Database["public"]["Enums"]["market_regime"] | null
          enabled: boolean | null
          id: string
          max_capital_usage: number | null
          max_concurrent_trades: number | null
          max_daily_loss: number | null
          max_leverage: number | null
          max_position_size: number | null
          risk_tolerance: string | null
          target_equity: number | null
          trading_mode: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_autonomous_mode?: boolean | null
          allowed_markets?: string[] | null
          bot_status?: Database["public"]["Enums"]["bot_status"] | null
          created_at?: string | null
          current_regime?: Database["public"]["Enums"]["market_regime"] | null
          enabled?: boolean | null
          id?: string
          max_capital_usage?: number | null
          max_concurrent_trades?: number | null
          max_daily_loss?: number | null
          max_leverage?: number | null
          max_position_size?: number | null
          risk_tolerance?: string | null
          target_equity?: number | null
          trading_mode?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_autonomous_mode?: boolean | null
          allowed_markets?: string[] | null
          bot_status?: Database["public"]["Enums"]["bot_status"] | null
          created_at?: string | null
          current_regime?: Database["public"]["Enums"]["market_regime"] | null
          enabled?: boolean | null
          id?: string
          max_capital_usage?: number | null
          max_concurrent_trades?: number | null
          max_daily_loss?: number | null
          max_leverage?: number | null
          max_position_size?: number | null
          risk_tolerance?: string | null
          target_equity?: number | null
          trading_mode?: string
          updated_at?: string | null
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
      positions: {
        Row: {
          avg_entry_price: number
          created_at: string | null
          current_price: number | null
          id: string
          is_paper: boolean
          market_type: Database["public"]["Enums"]["market_type"]
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
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
