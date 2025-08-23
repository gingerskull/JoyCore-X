import { Dashboard } from '@/components/Dashboard'
import { DeviceProvider } from '@/contexts/DeviceContext'
import { RawStateConfigProvider } from '@/contexts/RawStateConfigContext'
import { DisplayModeProvider } from '@/contexts/DisplayModeContext'
import { FirmwareUpdatesProvider } from '@/contexts/FirmwareUpdatesProvider'

function App() {
  return (
    <DeviceProvider>
      <RawStateConfigProvider>
        <DisplayModeProvider>
          <FirmwareUpdatesProvider>
            <Dashboard />
          </FirmwareUpdatesProvider>
        </DisplayModeProvider>
      </RawStateConfigProvider>
    </DeviceProvider>
  )
}

export default App
