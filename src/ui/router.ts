import { useEffect, useState } from 'preact/hooks'

export function currentRoute(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}

export function useRoute(): string[] {
  const [r, setR] = useState(currentRoute())
  useEffect(() => {
    const on = () => {
      setR(currentRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

export function go(path: string) {
  location.hash = '#/' + path.replace(/^\//, '')
}
