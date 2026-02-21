import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://scdtwfxhtrpdcujwfcpp.supabase.co'
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjZHR3ZnhodHJwZGN1andmY3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTg0ODAsImV4cCI6MjA4NzIzNDQ4MH0.xP9Q1_RQPrGGiWqnJN2S5ceHj9KJCdbWN7XtEwaS3nQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
