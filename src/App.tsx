import { Dashboard } from '@/components/Dashboard'
import { DeviceProvider } from '@/contexts/DeviceContext'
import { RawStateConfigProvider } from '@/contexts/RawStateConfigContext'
import { FirmwareUpdatesProvider } from '@/contexts/FirmwareUpdatesProvider'

function App() {
  return (
    <DeviceProvider>
      <RawStateConfigProvider>
        <FirmwareUpdatesProvider>
          <Dashboard />
        </FirmwareUpdatesProvider>
      </RawStateConfigProvider>
    </DeviceProvider>
  )
}

export default App
