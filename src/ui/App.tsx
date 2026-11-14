import { useEffect } from 'react'
import { translate } from '../app/i18n'
import { StoreProvider, useApp } from '../app/StoreContext'
import type { AppStore } from '../app/store'
import { DealScreen } from './screens/DealScreen'
import { GameScreen } from './screens/GameScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SetupScreen } from './screens/SetupScreen'
import { SummaryScreen } from './screens/SummaryScreen'

function Screens() {
  const { screen, settings } = useApp()
  useEffect(() => {
    document.documentElement.lang = settings.lang
    // Заголовок вкладки — тоже строка интерфейса: меняется вместе с языком.
    document.title = translate(settings.lang, 'app.tabTitle')
  }, [settings.lang])

  switch (screen) {
    case 'home':
      return <HomeScreen />
    case 'setup':
      return <SetupScreen />
    case 'deal':
      return <DealScreen />
    case 'game':
      return <GameScreen />
    case 'summary':
      return <SummaryScreen />
  }
}

export function App({ store }: { store: AppStore }) {
  return (
    <StoreProvider store={store}>
      <Screens />
    </StoreProvider>
  )
}
