import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured, toEmail } from './supabase'
import { type Theme, getTheme, setTheme, applyTheme } from './theme'
import Manage from './Manage'
import ForceChange from './ForceChange'

type Profile = { id: string; usn: string; full_name: string; role: 'admin' | 'teacher' | 'student'; must_change_password: boolean }
type Tab = 'home' | 'profile' | 'settings' | 'manage'

const ICONS: Record<Tab, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-7 8-7s8 3 8 7',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  manage: 'M4 6h16M4 12h16M4 18h10'
}
const NEXT: Record<Profile['role'], string> = {
  student: 'Your attendance summary will appear here once classes are recorded.',
  teacher: 'Your sections and the attendance marking screen will appear here.',
  admin: 'Sections, subjects, teachers and roster import will appear here.'
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('home')

  useEffect(() => {
    applyTheme(getTheme())
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onMq = () => { if (getTheme() === 'system') applyTheme('system') }
    mq.addEventListener('change', onMq)
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => { data.subscription.unsubscribe(); mq.removeEventListener('change', onMq) }
  }, [])

  useEffect(() => {
    setProfile(undefined)
    if (!session) return
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile((data as Profile) ?? null))
  }, [session])

  if (!configured) return <Center>App is not connected to Supabase yet. Add the two environment variables.</Center>
  if (!ready) return null
  if (!session) return <Login />
  if (profile === undefined) return <Center>Loading…</Center>
  if (profile === null) return <Center>Your account has no profile. Ask the admin.<button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button></Center>
  if (profile.must_change_password) return <ForceChange onDone={() => setProfile({ ...profile, must_change_password: false })} />

  return (
    <div className="app">
      {tab === 'home' && <Home p={profile} />}
      {tab === 'profile' && <ProfileTab p={profile} />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'manage' && profile.role === 'admin' && <Manage />}
      <nav className="nav">
        {(Object.keys(ICONS) as Tab[]).filter(t => t !== 'manage' || profile.role === 'admin').map(t => (
          <button key={t} aria-label={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[t]} /></svg>
          </button>
        ))}
      </nav>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) { return <div className="center">{children}</div> }

function Login() {
  const [id, setId] = useState(''); const [pw, setPw] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(id), password: pw })
    if (error) setErr('Wrong USN or password.')
    setBusy(false)
  }
  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Attendance</h1><p className="muted">T. John Institute of Technology</p>
        <input placeholder="USN / Staff ID" autoCapitalize="characters" autoComplete="username" value={id} onChange={e => setId(e.target.value)} />
        <input placeholder="Password" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy || !id || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

function Home({ p }: { p: Profile }) {
  return (<>
    <div className="hero">
      <p className="muted2">Welcome,</p>
      <h1>{p.full_name.split(' ')[0]}</h1>
      <div><span className="chip">{p.role}</span><span className="chip">{p.usn.toUpperCase()}</span></div>
    </div>
    <div className="card"><p className="muted">{NEXT[p.role]}</p></div>
  </>)
}

function ProfileTab({ p }: { p: Profile }) {
  const initials = p.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (<>
    <h2>Profile</h2>
    <div className="card center-text"><div className="avatar">{initials}</div><h3>{p.full_name}</h3></div>
    <div className="card">
      <Row k="USN / ID" v={p.usn.toUpperCase()} /><Row k="Role" v={p.role} /><Row k="Section" v="Not assigned yet" />
    </div>
  </>)
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="row"><span className="muted">{k}</span><b className="cap">{v}</b></div>

function SettingsTab() {
  const [theme, setT] = useState<Theme>(getTheme())
  const [pw, setPw] = useState(''); const [msg, setMsg] = useState('')
  async function changePw(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setMsg('Use at least 8 characters.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setMsg(error ? 'Could not change password.' : 'Password changed.'); if (!error) setPw('')
  }
  return (<>
    <h2>Settings</h2>
    <div className="card"><p className="muted">Appearance</p>
      <div className="seg">{(['light', 'dark', 'system'] as Theme[]).map(t =>
        <button key={t} className={theme === t ? 'on' : ''} onClick={() => { setTheme(t); setT(t) }}>{t}</button>)}
      </div>
    </div>
    <form className="card login" onSubmit={changePw}>
      <p className="muted">Change password</p>
      <input type="password" placeholder="New password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
      {msg && <p className="muted">{msg}</p>}
      <button className="btn">Update password</button>
    </form>
    <button className="btn out" onClick={() => supabase.auth.signOut()}>Sign out</button>
    <p className="muted center-text">Version 0.1 · Slice 1</p>
  </>)
}
