import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = !!url && !!key
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')
// Students log in with a USN; behind the scenes it becomes an email-style ID.
export const LOGIN_DOMAIN = 'usn.tjit.app'
export const toEmail = (id: string) => `${id.trim().toLowerCase()}@${LOGIN_DOMAIN}`
