import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'

export default function ForceChange({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setErr('Use at least 8 characters.')
    if (pw !== pw2) return setErr('Passwords do not match.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setErr(error.message)
    await supabase.rpc('password_changed')
    onDone()
  }
  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Set your password</h1>
        <p className="muted">You signed in with a shared starting password. Choose your own now so nobody else can use your account.</p>
        <input type="password" placeholder="New password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
        <input type="password" placeholder="Repeat new password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="btn">Save password</button>
        <button type="button" className="btn out" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </form>
    </div>
  )
}
