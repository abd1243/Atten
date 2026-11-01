import { useEffect, useState } from 'react'
import { supabase } from './supabase'

type Sec = { id: string; name: string; semester: number | null }
type Sub = { id: string; code: string; name: string }
type Tch = { id: string; usn: string; full_name: string }
type Asg = { section_id: string; subject_id: string; teacher_id: string }
type View = 'sections' | 'subjects' | 'assign' | 'import' | 'teacher'

async function call(body: object) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/.netlify/functions/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body)
  })
  const j = await r.json().catch(() => ({ error: 'Server did not answer correctly' }))
  if (!r.ok) throw new Error(j.error || 'Request failed')
  return j
}

function Sel({ v, set, ph, opts }: { v: string; set: (s: string) => void; ph: string; opts: [string, string][] }) {
  return <select value={v} onChange={e => set(e.target.value)}><option value="">{ph}</option>
    {opts.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
}

function Form({ fields, btn, onSubmit }: { fields: [string, string, string?][]; btn: string; onSubmit: (v: Record<string, string>) => void }) {
  return (
    <form className="card login" onSubmit={e => {
      e.preventDefault()
      const el = e.currentTarget, f = new FormData(el), v: Record<string, string> = {}
      fields.forEach(([k]) => { v[k] = String(f.get(k) ?? '').trim() })
      onSubmit(v); el.reset()
    }}>
      {fields.map(([k, ph, type]) => <input key={k} name={k} placeholder={ph} type={type ?? 'text'} />)}
      <button className="btn">{btn}</button>
    </form>
  )
}

export default function Manage() {
  const [view, setView] = useState<View>('sections')
  const [secs, setSecs] = useState<Sec[]>([]); const [subs, setSubs] = useState<Sub[]>([])
  const [tchs, setTchs] = useState<Tch[]>([]); const [asg, setAsg] = useState<Asg[]>([])
  const [cnt, setCnt] = useState<Record<string, number>>({}); const [pending, setPending] = useState(0)
  const [msg, setMsg] = useState('')
  const [a, setA] = useState({ s: '', u: '', t: '' })
  const [imp, setImp] = useState({ sec: '', pw: '', txt: '', out: '', busy: false })

  async function load() {
    const [s, u, t, g, m, p] = await Promise.all([
      supabase.from('sections').select('*').order('name'),
      supabase.from('subjects').select('*').order('code'),
      supabase.from('profiles').select('id,usn,full_name').eq('role', 'teacher').order('full_name'),
      supabase.from('teaching_assignments').select('*'),
      supabase.from('section_students').select('section_id'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('must_change_password', true)
    ])
    setSecs((s.data ?? []) as Sec[]); setSubs((u.data ?? []) as Sub[]); setTchs((t.data ?? []) as Tch[]); setAsg((g.data ?? []) as Asg[])
    const c: Record<string, number> = {}
    ;((m.data ?? []) as { section_id: string }[]).forEach(r => { c[r.section_id] = (c[r.section_id] ?? 0) + 1 })
    setCnt(c); setPending(p.count ?? 0)
  }
  useEffect(() => { load() }, [])

  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    const { error } = await p; setMsg(error ? error.message : ok); if (!error) load()
  }
  const secN = (id: string) => secs.find(x => x.id === id)?.name ?? '?'
  const subN = (id: string) => subs.find(x => x.id === id)?.code ?? '?'
  const tchN = (id: string) => tchs.find(x => x.id === id)?.full_name ?? '?'

  async function doImport() {
    const rows = imp.txt.split(/\r?\n/).map(l => {
      const i = l.indexOf(','); return i < 0 ? null : { usn: l.slice(0, i).trim(), name: l.slice(i + 1).trim().replace(/^"|"$/g, '') }
    }).filter((r): r is { usn: string; name: string } => !!r && !!r.usn && !!r.name && !/^(usn|roll)/i.test(r.usn))
    if (!imp.sec || imp.pw.length < 8 || !rows.length) return setImp({ ...imp, out: 'Pick a section, set a password (8+ characters) and add lines like: 1TJ24CS001,Student Name' })
    setImp({ ...imp, busy: true, out: 'Importing…' })
    let created = 0, existing = 0; const errs: string[] = []
    try {
      for (let i = 0; i < rows.length; i += 10) {
        const r = await call({ action: 'import_students', section_id: imp.sec, password: imp.pw, rows: rows.slice(i, i + 10) })
        created += r.created; existing += r.existing; errs.push(...r.errors)
      }
    } catch (e) { errs.push((e as Error).message) }
    setImp(x => ({ ...x, busy: false, out: `Created ${created}, already existed ${existing}.${errs.length ? ' Problems: ' + errs.join('; ') : ''}` }))
    load()
  }

  return (<>
    <h2>Manage</h2>
    <div className="seg wrap">{(['sections', 'subjects', 'assign', 'import', 'teacher'] as View[]).map(v =>
      <button key={v} className={view === v ? 'on' : ''} onClick={() => { setView(v); setMsg('') }}>{v}</button>)}</div>
    {msg && <p className="muted">{msg}</p>}

    {view === 'sections' && (<>
      <Form fields={[['name', 'Section name, e.g. CSE-A'], ['semester', 'Semester (number)', 'number']]} btn="Add section"
        onSubmit={v => run(supabase.from('sections').insert({ name: v.name, semester: v.semester ? Number(v.semester) : null }), 'Section added.')} />
      {secs.map(s => <div className="card item" key={s.id}><b>{s.name}{s.semester ? ` · Sem ${s.semester}` : ''}</b><span className="muted">{cnt[s.id] ?? 0} students</span></div>)}
    </>)}

    {view === 'subjects' && (<>
      <Form fields={[['code', 'Subject code'], ['name', 'Subject name']]} btn="Add subject"
        onSubmit={v => run(supabase.from('subjects').insert({ code: v.code.toUpperCase(), name: v.name }), 'Subject added.')} />
      {subs.map(s => <div className="card item" key={s.id}><b>{s.code}</b><span className="muted">{s.name}</span></div>)}
    </>)}

    {view === 'assign' && (<>
      <div className="card login">
        <Sel v={a.s} set={s => setA({ ...a, s })} ph="Section" opts={secs.map(x => [x.id, x.name])} />
        <Sel v={a.u} set={u => setA({ ...a, u })} ph="Subject" opts={subs.map(x => [x.id, `${x.code} ${x.name}`])} />
        <Sel v={a.t} set={t => setA({ ...a, t })} ph="Teacher" opts={tchs.map(x => [x.id, `${x.full_name} (${x.usn})`])} />
        <button className="btn" disabled={!a.s || !a.u || !a.t}
          onClick={() => run(supabase.from('teaching_assignments').upsert({ section_id: a.s, subject_id: a.u, teacher_id: a.t }, { onConflict: 'section_id,subject_id' }), 'Assigned.')}>Assign teacher</button>
      </div>
      {asg.map(x => <div className="card item" key={x.section_id + x.subject_id}><span><b>{secN(x.section_id)}</b> · {subN(x.subject_id)}</span><span className="muted">{tchN(x.teacher_id)}</span></div>)}
    </>)}

    {view === 'import' && (
      <div className="card login">
        <p className="muted">{pending} students still on the starting password.</p>
        <Sel v={imp.sec} set={sec => setImp({ ...imp, sec })} ph="Section" opts={secs.map(x => [x.id, x.name])} />
        <input type="password" placeholder="Starting password for new students" value={imp.pw} onChange={e => setImp({ ...imp, pw: e.target.value })} />
        <input type="file" accept=".csv,.txt" onChange={async e => { const f = e.target.files?.[0]; if (f) setImp({ ...imp, txt: await f.text() }) }} />
        <textarea rows={6} placeholder={'Or paste lines:\n1TJ24CS001,Student Name'} value={imp.txt} onChange={e => setImp({ ...imp, txt: e.target.value })} />
        <button className="btn" disabled={imp.busy} onClick={doImport}>Import students</button>
        {imp.out && <p className="muted">{imp.out}</p>}
      </div>
    )}

    {view === 'teacher' && (<>
      <Form fields={[['id', 'Staff ID'], ['name', 'Full name'], ['password', 'Starting password', 'password']]} btn="Add teacher"
        onSubmit={async v => { try { await call({ action: 'create_teacher', id: v.id, name: v.name, password: v.password }); setMsg('Teacher added.'); load() } catch (e) { setMsg((e as Error).message) } }} />
      {tchs.map(t => <div className="card item" key={t.id}><b>{t.full_name}</b><span className="muted">{t.usn}</span></div>)}
    </>)}
  </>)
}
