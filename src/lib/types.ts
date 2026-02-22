// ── Supabase generated types ─────────────────────────────────────────────
// Run: npx supabase gen types typescript --project-id <id> > src/lib/types.ts
// to regenerate automatically from your Supabase schema.

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id:         string
          name:       string | null
          email:      string | null
          role:       string          // 'user' | 'admin'
          plan:       string          // 'free' | 'pro'
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      app_categories: {
        Row: {
          id:         string
          name:       string
          slug:       string
          created_at: string
        }
        Insert: { name: string; slug: string }
        Update: Partial<Database['public']['Tables']['app_categories']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['apps']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['apps']['Insert']>
      }
      forum_categories: {
        Row: {
          id:         string
          name:       string
          slug:       string
          created_at: string
        }
        Insert: { name: string; slug: string }
        Update: Partial<Database['public']['Tables']['forum_categories']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['forum_topics']['Row'], 'id' | 'views' | 'pinned' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['forum_topics']['Insert']>
      }
      forum_replies: {
        Row: {
          id:         string
          topic_id:   string
          author_id:  string | null
          content:    string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['forum_replies']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['forum_replies']['Insert']>
      }
    }
  }
}

// ── Convenience aliases ───────────────────────────────────────────────────

export type Profile        = Database['public']['Tables']['profiles']['Row']
export type AppCategory    = Database['public']['Tables']['app_categories']['Row']
export type App            = Database['public']['Tables']['apps']['Row']
export type ForumCategory  = Database['public']['Tables']['forum_categories']['Row']
export type ForumTopic     = Database['public']['Tables']['forum_topics']['Row']
export type ForumReply     = Database['public']['Tables']['forum_replies']['Row']

// ── Extended types with joined data ──────────────────────────────────────

export type ForumTopicWithMeta = ForumTopic & {
  profiles:         Pick<Profile, 'name' | 'avatar_url'> | null
  forum_categories: Pick<ForumCategory, 'name' | 'slug'> | null
  reply_count:      number
}

export type ForumReplyWithAuthor = ForumReply & {
  profiles: Pick<Profile, 'name' | 'avatar_url'> | null
}
