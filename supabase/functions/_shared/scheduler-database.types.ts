export type SchedulerDatabase = {
  public: {
    Tables: {
      sources: {
        Row: {
          id: string;
          name: string;
          kind: string;
          adapter: string;
          url: string;
          interval_seconds: number;
          enabled: boolean;
          next_fetch_at: string;
          last_success_at: string | null;
          last_error_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          kind: string;
          adapter: string;
          url: string;
          interval_seconds: number;
          enabled?: boolean;
          next_fetch_at?: string;
          last_success_at?: string | null;
          last_error_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          next_fetch_at?: string;
          last_success_at?: string | null;
          last_error_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ingestion_jobs: {
        Row: {
          id: string;
          source_id: string;
          scheduled_for: string;
          status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead_letter';
          attempt_count: number;
          locked_at: string | null;
          started_at: string | null;
          finished_at: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          scheduled_for: string;
          status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead_letter';
          attempt_count?: number;
          locked_at?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead_letter';
          attempt_count?: number;
          locked_at?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
