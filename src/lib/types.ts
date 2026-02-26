// Supabase Database type — matches @supabase/supabase-js v2 expected shape.
// Regenerate automatically with:
//   npx supabase gen types typescript --project-id <your-project-id>

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id:         string
          name:       string | null
          email:      string | null
          role:       string
          plan:       string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id:         string
          name?:      string | null
          email?:     string | null
          role?:      string
          plan?:      string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?:        string
          name?:      string | null
          email?:     string | null
          role?:      string
          plan?:      string
          avatar_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_categories: {
        Row: {
          id:         string
          name:       string
          slug:       string
          created_at: string
        }
        Insert: {
          id?:        string
          name:       string
          slug:       string
          created_at?: string
        }
        Update: {
          id?:        string
          name?:      string
          slug?:      string
        }
        Relationships: []
      }
      apps: {
        Row: {
          id:               string
          name:             string
          description:      string | null
          category:         string
          external_link:    string | null
          internal_link:    string | null
          background_image: string | null
          created_at:       string
          updated_at:       string
        }
        Insert: {
          id?:              string
          name:             string
          description?:     string | null
          category:         string
          external_link?:   string | null
          internal_link?:   string | null
          background_image?: string | null
          created_at?:      string
          updated_at?:      string
        }
        Update: {
          id?:              string
          name?:            string
          description?:     string | null
          category?:        string
          external_link?:   string | null
          internal_link?:   string | null
          background_image?: string | null
          updated_at?:      string
        }
        Relationships: []
      }
      dre_lancamentos: {
        Row: {
          id:            string
          user_id:       string | null
          valor:         number
          classificacao: 'receita' | 'despesa'
          grupo:         string
          created_at:    string
          updated_at:    string
        }
        Insert: {
          id?:            string
          user_id?:       string | null
          valor:          number
          classificacao:  'receita' | 'despesa'
          grupo:          string
          created_at?:    string
          updated_at?:    string
        }
        Update: {
          id?:            string
          user_id?:       string | null
          valor?:         number
          classificacao?: 'receita' | 'despesa'
          grupo?:         string
          updated_at?:    string
        }
        Relationships: []
      }
      forum_categories: {
        Row: {
          id:         string
          name:       string
          slug:       string
          created_at: string
        }
        Insert: {
          id?:        string
          name:       string
          slug:       string
          created_at?: string
        }
        Update: {
          id?:   string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      forum_topics: {
        Row: {
          id:          string
          category_id: string | null
          author_id:   string | null
          title:       string
          content:     string
          views:       number
          pinned:      boolean
          created_at:  string
          updated_at:  string
        }
        Insert: {
          id?:          string
          category_id?: string | null
          author_id?:   string | null
          title:        string
          content:      string
          views?:       number
          pinned?:      boolean
          created_at?:  string
          updated_at?:  string
        }
        Update: {
          id?:          string
          category_id?: string | null
          author_id?:   string | null
          title?:       string
          content?:     string
          views?:       number
          pinned?:      boolean
          updated_at?:  string
        }
        Relationships: []
      }
      forum_replies: {
        Row: {
          id:         string
          topic_id:   string
          author_id:  string | null
          content:    string
          created_at: string
        }
        Insert: {
          id?:        string
          topic_id:   string
          author_id?: string | null
          content:    string
          created_at?: string
        }
        Update: {
          id?:       string
          topic_id?: string
          content?:  string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_topic_views: {
        Args: { topic_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ── Convenience aliases ───────────────────────────────────────────────────

export type Profile       = Database['public']['Tables']['profiles']['Row']
export type AppCategory   = Database['public']['Tables']['app_categories']['Row']
export type App           = Database['public']['Tables']['apps']['Row']
export type DreLancamento = Database['public']['Tables']['dre_lancamentos']['Row']
export type ForumCategory = Database['public']['Tables']['forum_categories']['Row']
export type ForumTopic    = Database['public']['Tables']['forum_topics']['Row']
export type ForumReply    = Database['public']['Tables']['forum_replies']['Row']

// ── Extended types with joined data ──────────────────────────────────────

export type ForumTopicWithMeta = ForumTopic & {
  profiles:         Pick<Profile, 'name' | 'avatar_url'> | null
  forum_categories: Pick<ForumCategory, 'name' | 'slug'> | null
  reply_count:      number
}

export type ForumReplyWithAuthor = ForumReply & {
  profiles: Pick<Profile, 'name' | 'avatar_url'> | null
}
