import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// null until .env is filled in, so the app still builds and shows a setup hint
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null
