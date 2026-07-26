import { createClient } from '@supabase/supabase-js'

// VOID 当前绑定的 Supabase 前端公开配置。
// 环境变量存在时会优先使用环境变量，方便以后切换项目。
const DEFAULT_SUPABASE_URL = 'https://cbdeyvlkuzapormjmepr.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_QvT4bhkExApQVf0mwdqiQw_Zkl3Jcg4'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
