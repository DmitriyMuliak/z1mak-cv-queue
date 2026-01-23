export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_models: {
        Row: {
          api_name: string;
          created_at: string;
          fallback_priority: number;
          id: string;
          provider: string;
          rpd: number;
          rpm: number;
          type: Database['public']['Enums']['ai_model_type'];
          updated_at: string;
        };
        Insert: {
          api_name: string;
          created_at?: string;
          fallback_priority: number;
          id: string;
          provider: string;
          rpd: number;
          rpm: number;
          type: Database['public']['Enums']['ai_model_type'];
          updated_at?: string;
        };
        Update: {
          api_name?: string;
          created_at?: string;
          fallback_priority?: number;
          id?: string;
          provider?: string;
          rpd?: number;
          rpm?: number;
          type?: Database['public']['Enums']['ai_model_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      cv_analyzes: {
        Row: {
          created_at: string;
          error: string | null;
          error_code: string | null;
          expired_at: string | null;
          finished_at: string | null;
          id: string;
          processed_model: string | null;
          requested_model: string;
          result: Json | null;
          resume_id: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          error_code?: string | null;
          expired_at?: string | null;
          finished_at?: string | null;
          id?: string;
          processed_model?: string | null;
          requested_model: string;
          result?: Json | null;
          resume_id?: string | null;
          status: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          error_code?: string | null;
          expired_at?: string | null;
          finished_at?: string | null;
          id?: string;
          processed_model?: string | null;
          requested_model?: string;
          result?: Json | null;
          resume_id?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_limits: {
        Row: {
          created_at: string;
          hard_rpd: number | null;
          lite_rpd: number | null;
          max_concurrency: number | null;
          role: Database['public']['Enums']['user_role'];
          unlimited: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          hard_rpd?: number | null;
          lite_rpd?: number | null;
          max_concurrency?: number | null;
          role: Database['public']['Enums']['user_role'];
          unlimited?: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          hard_rpd?: number | null;
          lite_rpd?: number | null;
          max_concurrency?: number | null;
          role?: Database['public']['Enums']['user_role'];
          unlimited?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      seed_user_limits: {
        Args: {
          _role: Database['public']['Enums']['user_role'];
          _user_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      ai_model_type: 'hard' | 'lite';
      user_role: 'user' | 'admin';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_model_type: ['hard', 'lite'],
      user_role: ['user', 'admin'],
    },
  },
} as const;
