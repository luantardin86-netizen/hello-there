import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { createDemoFleet, type FleetData } from './fleet'

const STORAGE_KEY = 'qmx-fleet-v1'

interface FleetStore {
  data: FleetData
  setData: Dispatch<SetStateAction<FleetData>>
  ready: boolean
}

const FleetContext = createContext<FleetStore | null>(null)

function normalizeFleet(value: unknown): FleetData | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<FleetData>
  if (
    !Array.isArray(source.vehicles) ||
    !Array.isArray(source.drivers) ||
    !Array.isArray(source.trips) ||
    !Array.isArray(source.maintenances) ||
    !Array.isArray(source.fuelEntries) ||
    !Array.isArray(source.inspections)
  ) return null

  return {
    vehicles: source.vehicles,
    drivers: source.drivers,
    trips: source.trips,
    maintenances: source.maintenances,
    fuelEntries: source.fuelEntries,
    inspections: source.inspections,
  }
}

export function FleetProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FleetData>(() => createDemoFleet())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = normalizeFleet(JSON.parse(raw))
        if (saved) setData(saved)
      }
    } catch {
      // A tela continua operacional na sessão mesmo se o navegador bloquear o armazenamento.
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Limite de armazenamento ou política do navegador: os dados continuam na memória da sessão.
    }
  }, [data, ready])

  const value = useMemo(() => ({ data, setData, ready }), [data, ready])
  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
}

export function useFleet() {
  const value = useContext(FleetContext)
  if (!value) throw new Error('useFleet deve ser usado dentro de FleetProvider')
  return value
}
