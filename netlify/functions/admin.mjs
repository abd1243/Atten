// Runs on Netlify's server. The secret key lives ONLY here (env var), never in the website code.
import { createClient } from '@supabase/supabase-js'
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOMAIN = 'usn.tjit.app'
const ID_OK = /^[a-z0-9]{3,20}$/i
const json = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  if (!url || !svc) return json(500, { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY (or the URL).' })
  const admin = createClient(url, svc, { auth: { persistSession: false } })

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
  const { data: u } = await admin.auth.getUser(token)
  if (!u?.user) return json(401, { error: 'Not signed in' })
  const { data: me } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle()
  if (me?.role !== 'admin') return json(403, { error: 'Admins only' })

  let b
  try { b = await req.json() } catch { return json(400, { error: 'Bad request' }) }
  if (typeof b.password !== 'string' || b.password.length < 8) return json(400, { error: 'Password must be 8+ characters' })

  async function makeUser(id, name, role) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `${id.toLowerCase()}@${DOMAIN}`, password: b.password, email_confirm: true,
      user_metadata: { full_name: name }
    })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        const { data: p } = await admin.from('profiles').select('id').eq('usn', id.toLowerCase()).maybeSingle()
        return p ? { id: p.id, existing: true } : { error: `${id}: ${error.message}` }
      }
      return { error: `${id}: ${error.message}` }
    }
    if (role !== 'student') await admin.from('profiles').update({ role }).eq('id', data.user.id)
    return { id: data.user.id, existing: false }
  }

  if (b.action === 'create_teacher') {
    if (!ID_OK.test(b.id || '') || !b.name) return json(400, { error: 'Staff ID (letters/numbers) and name are required' })
    const r = await makeUser(b.id, b.name, 'teacher')
    if (r.error) return json(400, { error: r.error })
    if (r.existing) return json(400, { error: 'That ID already exists' })
    return json(200, { ok: true })
  }

  if (b.action === 'import_students') {
    if (!b.section_id || !Array.isArray(b.rows) || b.rows.length > 25) return json(400, { error: 'Bad import request' })
    let created = 0, existing = 0
    const errors = []
    for (const r of b.rows) {
      if (!ID_OK.test(r.usn || '') || !r.name) { errors.push(`Skipped "${r.usn}"`); continue }
      const m = await makeUser(r.usn, r.name, 'student')
      if (m.error) { errors.push(m.error); continue }
      const { error } = await admin.from('section_students')
        .upsert({ section_id: b.section_id, student_id: m.id }, { onConflict: 'section_id,student_id', ignoreDuplicates: true })
      if (error) { errors.push(`${r.usn}: ${error.message}`); continue }
      m.existing ? existing++ : created++
    }
    return json(200, { created, existing, errors })
  }
  return json(400, { error: 'Unknown action' })
}
