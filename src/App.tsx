import { Dashboard } from '@/components/Dashboard'
import { DeviceProvider } from '@/contexts/DeviceContext'
import { RawStateConfigProvider } from '@/contexts/RawStateConfigContext'

function App() {
  return (
    <DeviceProvider>
      <RawStateConfigProvider>
        <Dashboard />
      </RawStateConfigProvider>
    </DeviceProvider>
  )
}

export default App
