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
          tipo_usuario: 'titular' | 'colaborador'
          plan:       string
          avatar_url: string | null
          ativo:      boolean
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id:         string
          name?:      string | null
          email?:     string | null
          role?:      string
          tipo_usuario?: 'titular' | 'colaborador'
          plan?:      string
          avatar_url?: string | null
          ativo?:     boolean
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?:        string
          name?:      string | null
          email?:     string | null
          role?:      string
          tipo_usuario?: 'titular' | 'colaborador'
          plan?:      string
          avatar_url?: string | null
          ativo?:     boolean
          expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          id:         string
          email:      string
          expires_at: string | null
          invited_by: string | null
          created_at: string
          used_at:    string | null
        }
        Insert: {
          id?:        string
          email:      string
          expires_at?: string | null
          invited_by?: string | null
          created_at?: string
          used_at?:   string | null
        }
        Update: {
          expires_at?: string | null
          used_at?:    string | null
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
          link_type:        'interno' | 'externo' | null
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
          link_type?:       'interno' | 'externo' | null
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
          link_type?:       'interno' | 'externo' | null
          external_link?:   string | null
          internal_link?:   string | null
          background_image?: string | null
          updated_at?:      string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          id:         string
          nome:       string
          cnpj:       string | null
          logo_url:   string | null
          created_by: string
          ativo:      boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?:        string
          nome:       string
          cnpj?:      string | null
          logo_url?:  string | null
          created_by: string
          ativo?:     boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?:        string
          nome?:      string
          cnpj?:      string | null
          logo_url?:  string | null
          ativo?:     boolean
          updated_at?: string
        }
        Relationships: []
      }
      empresa_membros: {
        Row: {
          id:         string
          empresa_id: string
          user_id:    string
          role:       'admin' | 'membro'
          created_at: string
        }
        Insert: {
          id?:         string
          empresa_id:  string
          user_id:     string
          role?:       'admin' | 'membro'
          created_at?: string
        }
        Update: {
          role?: 'admin' | 'membro'
        }
        Relationships: []
      }
      dre_lancamentos: {
        Row: {
          id:                string
          user_id:           string | null
          empresa_id:        string | null
          descricao:         string | null
          valor:             number
          tipo:              'receita' | 'despesa'
          classificacao:     string
          grupo:             string
          data_lancamento:   string | null
          created_at:        string
          updated_at:        string
        }
        Insert: {
          id?:               string
          user_id?:          string | null
          empresa_id?:       string | null
          descricao?:        string | null
          valor:             number
          tipo:              'receita' | 'despesa'
          classificacao:     string
          grupo:             string
          data_lancamento?:  string | null
          created_at?:       string
          updated_at?:       string
        }
        Update: {
          id?:               string
          user_id?:          string | null
          empresa_id?:       string | null
          descricao?:        string | null
          valor?:            number
          tipo?:             'receita' | 'despesa'
          classificacao?:    string
          grupo?:            string
          data_lancamento?:  string | null
          updated_at?:       string
        }
        Relationships: []
      }
      dre_classificacoes: {
        Row: {
          id:         string
          nome:       string
          tipo:       'receita' | 'despesa'
          ativo:      boolean
          created_at: string
        }
        Insert: {
          id?:         string
          nome:        string
          tipo:        'receita' | 'despesa'
          ativo?:      boolean
          created_at?: string
        }
        Update: {
          id?:    string
          nome?:  string
          tipo?:  'receita' | 'despesa'
          ativo?: boolean
        }
        Relationships: []
      }
      dre_grupos: {
        Row: {
          id:         string
          nome:       string
          tipo:       'receita' | 'despesa'
          ativo:      boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?:         string
          nome:        string
          tipo:        'receita' | 'despesa'
          ativo?:      boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?:         string
          nome?:       string
          tipo?:       'receita' | 'despesa'
          ativo?:      boolean
          updated_at?: string
        }
        Relationships: []
      }
      exemplos_upload: {
        Row: {
          id:         string
          nome:       string
          arquivo:    string | null
          cabecalhos: string[]
          created_at: string
        }
        Insert: {
          id?:         string
          nome:        string
          arquivo?:    string | null
          cabecalhos?: string[]
          created_at?: string
        }
        Update: {
          nome?:       string
          arquivo?:    string | null
          cabecalhos?: string[]
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave:      string
          valor:      string
          updated_at: string
        }
        Insert: {
          chave:       string
          valor:       string
          updated_at?: string
        }
        Update: {
          valor?:      string
          updated_at?: string
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
      termos_aceite: {
        Row: {
          id:          string
          user_id:     string
          version:     string
          app:         string
          accepted_at: string
          ip_address:  string | null
          user_agent:  string | null
        }
        Insert: {
          id?:         string
          user_id:     string
          version?:    string
          app?:        string
          accepted_at?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
        }
        Relationships: []
      }
      dre_classificacao_historico: {
        Row: {
          id:                    string
          empresa_id:            string
          descricao_normalizada: string
          classificacao:         string
          grupo:                 string
          tipo:                  'receita' | 'despesa'
          updated_at:            string
        }
        Insert: {
          id?:                   string
          empresa_id:            string
          descricao_normalizada: string
          classificacao:         string
          grupo:                 string
          tipo:                  'receita' | 'despesa'

          updated_at?:           string
        }
        Update: {
          empresa_id?:            string
          descricao_normalizada?: string
          classificacao?:         string
          grupo?:                 string
          tipo?:                  'receita' | 'despesa'
          updated_at?:            string
        }
        Relationships: []
      }
      labs: {
        Row: {
          id:               string
          empresa_id:       string
          nome:             string
          cnpj:             string | null
          telefone:         string | null
          email:            string | null
          endereco:         string | null
          prazo_medio_dias: number
          observacoes:      string | null
          ativo:            boolean
          created_at:       string
          updated_at:       string
        }
        Insert: {
          id?:               string
          empresa_id:        string
          nome:              string
          cnpj?:             string | null
          telefone?:         string | null
          email?:            string | null
          endereco?:         string | null
          prazo_medio_dias?: number
          observacoes?:      string | null
          ativo?:            boolean
          created_at?:       string
          updated_at?:       string
        }
        Update: {
          nome?:             string
          cnpj?:             string | null
          telefone?:         string | null
          email?:            string | null
          endereco?:         string | null
          prazo_medio_dias?: number
          observacoes?:      string | null
          ativo?:            boolean
          updated_at?:       string
        }
        Relationships: []
      }
      lab_precos: {
        Row: {
          id:           string
          lab_id:       string
          nome_servico: string
          preco:        number
          ativo:        boolean
          created_at:   string
        }
        Insert: {
          id?:          string
          lab_id:       string
          nome_servico: string
          preco?:       number
          ativo?:       boolean
          created_at?:  string
        }
        Update: {
          nome_servico?: string
          preco?:        number
          ativo?:        boolean
        }
        Relationships: []
      }
      lab_kanban_colunas: {
        Row: {
          id:         string
          empresa_id: string
          nome:       string
          ordem:      number
          cor:        string
          created_at: string
        }
        Insert: {
          id?:         string
          empresa_id:  string
          nome:        string
          ordem?:      number
          cor?:        string
          created_at?: string
        }
        Update: {
          nome?:  string
          ordem?: number
          cor?:   string
        }
        Relationships: []
      }
      lab_envios: {
        Row: {
          id:                     string
          lab_id:                 string
          empresa_id:             string
          user_id:                string
          paciente_nome:          string
          tipo_trabalho:          string
          preco_servico:          number | null
          dentes:                 string | null
          cor:                    string | null
          observacoes:            string | null
          status:                 string
          data_envio:             string
          data_entrega_prometida: string | null
          data_entrega_real:      string | null
          created_at:             string
          updated_at:             string
        }
        Insert: {
          id?:                     string
          lab_id:                  string
          empresa_id:              string
          user_id:                 string
          paciente_nome:           string
          tipo_trabalho:           string
          preco_servico?:          number | null
          dentes?:                 string | null
          cor?:                    string | null
          observacoes?:            string | null
          status?:                 string
          data_envio?:             string
          data_entrega_prometida?: string | null
          data_entrega_real?:      string | null
          created_at?:             string
          updated_at?:             string
        }
        Update: {
          paciente_nome?:          string
          tipo_trabalho?:          string
          preco_servico?:          number | null
          dentes?:                 string | null
          cor?:                    string | null
          observacoes?:            string | null
          status?:                 string
          data_envio?:             string
          data_entrega_prometida?: string | null
          data_entrega_real?:      string | null
          updated_at?:             string
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
      listar_membros_empresa: {
        Args: { p_empresa_id: string }
        Returns: {
          user_id: string
          name: string | null
          email: string | null
          tipo_usuario: 'titular' | 'colaborador'
          empresa_role: 'admin' | 'membro'
          created_at: string
        }[]
      }
      vincular_colaborador_empresa: {
        Args: { p_empresa_id: string; p_email: string }
        Returns: {
          user_id: string
          name: string | null
          email: string | null
          tipo_usuario: 'titular' | 'colaborador'
          empresa_role: 'admin' | 'membro'
        }[]
      }
      remover_colaborador_empresa: {
        Args: { p_empresa_id: string; p_user_id: string }
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

export type Profile            = Database['public']['Tables']['profiles']['Row']
export type AppCategory        = Database['public']['Tables']['app_categories']['Row']
export type App                = Database['public']['Tables']['apps']['Row']
export type Empresa            = Database['public']['Tables']['empresas']['Row']
export type EmpresaMembro      = Database['public']['Tables']['empresa_membros']['Row']
export type DreLancamento      = Database['public']['Tables']['dre_lancamentos']['Row']
export type DreClassificacao   = Database['public']['Tables']['dre_classificacoes']['Row']
export type ExemploUpload      = Database['public']['Tables']['exemplos_upload']['Row']
export type Configuracao       = Database['public']['Tables']['configuracoes']['Row']
export type ForumCategory      = Database['public']['Tables']['forum_categories']['Row']
export type ForumTopic         = Database['public']['Tables']['forum_topics']['Row']
export type ForumReply                  = Database['public']['Tables']['forum_replies']['Row']
export type DreClassificacaoHistorico  = Database['public']['Tables']['dre_classificacao_historico']['Row']
export type UserInvitation             = Database['public']['Tables']['user_invitations']['Row']
export type TermosAceite               = Database['public']['Tables']['termos_aceite']['Row']

// ── Extended types with joined data ──────────────────────────────────────

export type ForumTopicWithMeta = ForumTopic & {
  profiles:         Pick<Profile, 'name' | 'avatar_url'> | null
  forum_categories: Pick<ForumCategory, 'name' | 'slug'> | null
  reply_count:      number
}

export type ForumReplyWithAuthor = ForumReply & {
  profiles: Pick<Profile, 'name' | 'avatar_url'> | null
}

// ── Lab Control ───────────────────────────────────────────────────────────

export type Lab              = Database['public']['Tables']['labs']['Row']
export type LabPreco         = Database['public']['Tables']['lab_precos']['Row']
export type LabKanbanColuna  = Database['public']['Tables']['lab_kanban_colunas']['Row']
export type LabEnvio         = Database['public']['Tables']['lab_envios']['Row']
