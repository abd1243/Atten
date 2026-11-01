export type Theme = 'light' | 'dark' | 'system'
export const getTheme = (): Theme => (localStorage.getItem('theme') as Theme) || 'system'
export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#000000' : '#e9e9e9')
}
export function setTheme(t: Theme) { localStorage.setItem('theme', t); applyTheme(t) }
