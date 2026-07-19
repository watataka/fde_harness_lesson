// Supabase Database型。`mcp__supabase__generate_typescript_types` の出力をそのまま保存したもの。
// 手動編集しないこと。スキーマ変更後は再生成してこのファイルを丸ごと差し替える。
//
// 注意: `todos` テーブルは本アプリと無関係な既存テーブル（CLAUDE.md 0参照）。
// 本アプリのTodoデータは必ず `task_todos` を使うこと。

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
      settings: {
        Row: {
          evening_time: string
          id: number
          last_carryover_date: string | null
          last_end_notified_date: string | null
          last_start_notified_date: string | null
          morning_time: string
          updated_at: string
          weekend_notification_enabled: boolean
        }
        Insert: {
          evening_time?: string
          id?: number
          last_carryover_date?: string | null
          last_end_notified_date?: string | null
          last_start_notified_date?: string | null
          morning_time?: string
          updated_at?: string
          weekend_notification_enabled?: boolean
        }
        Update: {
          evening_time?: string
          id?: number
          last_carryover_date?: string | null
          last_end_notified_date?: string | null
          last_start_notified_date?: string | null
          morning_time?: string
          updated_at?: string
          weekend_notification_enabled?: boolean
        }
        Relationships: []
      }
      task_todos: {
        Row: {
          carried_over_from_id: string | null
          content: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["todo_status"]
          todo_date: string
          updated_at: string
        }
        Insert: {
          carried_over_from_id?: string | null
          content: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["todo_status"]
          todo_date: string
          updated_at?: string
        }
        Update: {
          carried_over_from_id?: string | null
          content?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["todo_status"]
          todo_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_todos_carried_over_from_id_fkey"
            columns: ["carried_over_from_id"]
            isOneToOne: false
            referencedRelation: "task_todos"
            referencedColumns: ["id"]
          },
        ]
      }
      // 本アプリと無関係な既存テーブル。参照・変更しないこと（CLAUDE.md 0参照）。
      todos: {
        Row: {
          created_at: string
          done: boolean
          id: string
          text: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          text: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          text?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      todo_status: "unset" | "not_started" | "completed" | "continuing"
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
      todo_status: ["unset", "not_started", "completed", "continuing"],
    },
  },
} as const
