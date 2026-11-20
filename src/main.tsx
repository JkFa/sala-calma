import { render } from 'preact'
import '@fontsource/fraunces/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles/base.css'
import './styles/app.css'
import './styles/print.css'
import { App } from './app'
import { applyTheme, settings } from './state/settings'
import { registerSW } from './state/pwa'
import { checkPending } from './state/lesson'

applyTheme(settings.get().theme)
render(<App />, document.getElementById('app')!)
void registerSW()
void checkPending()
