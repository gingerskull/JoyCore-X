import { Dashboard } from '@/components/Dashboard'
import { DeviceProvider } from '@/contexts/DeviceContext'

function App() {
  return (
    <DeviceProvider>
      <Dashboard />
    </DeviceProvider>
  )
}

export default App
