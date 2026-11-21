import { useEffect } from 'preact/hooks'
import { APP } from './config'
import { lesson } from './state/lesson'
import { applyUpdate, isStandalone, pwa } from './state/pwa'
import { useStore } from './state/store'
import { IconLight, IconMic, IconNotebook, IconSchool, IconSliders, Logo } from './ui/icons'
import { go, useRoute } from './ui/router'
import { Home } from './pages/Home'
import { Measure } from './pages/Measure'
import { Light } from './pages/Light'
import { Lessons } from './pages/Lessons'
import { LessonReport } from './pages/LessonReport'
import { Calibrate } from './pages/Calibrate'
import { SettingsPage } from './pages/Settings'
import { School } from './pages/School'
import { Privacy } from './pages/Privacy'
import { Evolution } from './pages/Evolution'
import { EmptyRoom } from './pages/EmptyRoom'
import { BackupPage } from './pages/Backup'

const NAV = [
  { path: 'medir', label: 'Medir', Icon: IconMic },
  { path: 'semaforo', label: 'Semáforo', Icon: IconLight },
  { path: 'aulas', label: 'Aulas', Icon: IconNotebook },
  { path: 'escola', label: 'Escola', Icon: IconSchool },
  { path: 'ajustes', label: 'Ajustes', Icon: IconSliders },
]

const TITLES: Record<string, string> = {
  '': 'Medidor de ruído para a sala de aula',
  medir: 'Medir',
  semaforo: 'Semáforo',
  aulas: 'Aulas',
  aula: 'Relatório da aula',
  evolucao: 'Evolução',
  'sala-vazia': 'Sala vazia',
  backup: 'Backup',
  calibrar: 'Calibrar',
  ajustes: 'Ajustes',
  escola: 'Escola',
  privacidade: 'Privacidade',
}

function UpdateBanner() {
  const p = useStore(pwa)
  const l = useStore(lesson)
  if (!p.needRefresh || l.session) return null
  return (
    <div class="update" role="status">
      <span>Há uma versão nova do app.</span>
      <button class="btn btn-quiet" onClick={applyUpdate}>
        Atualizar agora
      </button>
    </div>
  )
}

function LiveDot() {
  const l = useStore(lesson)
  if (!l.session) return null
  return (
    <a href="#/medir" class="live-dot" aria-label="Aula em andamento: voltar para a medição">
      <span class={`dot ${l.status === 'medindo' ? 'on' : ''}`} />
      {l.status === 'medindo' ? 'medindo' : l.status === 'pausado' ? 'pausada' : 'retomando'}
      {l.pausaVocal && <span class="live-break"> · pausa de voz?</span>}
    </a>
  )
}

export function App() {
  const route = useRoute()
  let page = route[0] ?? ''
  // Aberto como app instalado: começa direto na medição.
  if (page === '' && isStandalone && !sessionStorage.getItem('viu-inicio')) {
    sessionStorage.setItem('viu-inicio', '1')
    go('medir')
    page = 'medir'
  }

  useEffect(() => {
    document.title = `${TITLES[page] ?? APP.name} · ${APP.name}`
  }, [page])

  if (page === 'semaforo') return <Light />

  let content
  switch (page) {
    case 'medir':
      content = <Measure />
      break
    case 'aulas':
      content = <Lessons />
      break
    case 'aula':
      content = <LessonReport id={route[1] ?? ''} />
      break
    case 'evolucao':
      content = <Evolution />
      break
    case 'sala-vazia':
      content = <EmptyRoom />
      break
    case 'backup':
      content = <BackupPage />
      break
    case 'calibrar':
      content = <Calibrate />
      break
    case 'ajustes':
      content = <SettingsPage />
      break
    case 'escola':
      content = <School />
      break
    case 'privacidade':
      content = <Privacy />
      break
    default:
      content = <Home />
  }

  return (
    <div class={`shell page-${page || 'inicio'}`}>
      <a
        href="#conteudo"
        class="skip"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('conteudo')?.focus()
        }}
      >
        Pular para o conteúdo
      </a>
      <header class="topbar">
        <a href="#/" class="brand">
          <Logo size={30} />
          <span>{APP.name}</span>
        </a>
        <LiveDot />
      </header>
      <nav class="tabs" aria-label="Seções">
        {NAV.map(({ path, label, Icon }) => (
          <a key={path} href={`#/${path}`} class="tab" aria-current={page === path || (path === 'aulas' && ['aula', 'evolucao', 'sala-vazia'].includes(page)) || (path === 'ajustes' && page === 'backup') ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <main id="conteudo" tabIndex={-1}>
        <UpdateBanner />
        {content}
      </main>
      <footer class="foot small soft">
        <p>
          Indicador de exposição ao ruído. Não substitui avaliação de fonoaudiologia ou de medicina do trabalho.{' '}
          <a href="#/privacidade">Privacidade</a>
        </p>
      </footer>
    </div>
  )
}
