import { useEffect } from 'react'
import { StoreProvider, useApp } from '../app/StoreContext'
import type { AppStore } from '../app/store'
import { DealScreen } from './screens/DealScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SetupScreen } from './screens/SetupScreen'

function Screens() {
  const { screen, settings } = useApp()
  useEffect(() => {
    document.documentElement.lang = settings.lang
  }, [settings.lang])

  switch (screen) {
    case 'home':
      return <HomeScreen />
    case 'setup':
      return <SetupScreen />
    case 'deal':
      return <DealScreen />
    case 'game':
    case 'summary':
      // Игровой экран и итоги — следующие задачи.
      return <main data-screen={screen} />
  }
}

export function App({ store }: { store: AppStore }) {
  return (
    <StoreProvider store={store}>
      <Screens />
    </StoreProvider>
  )
}
