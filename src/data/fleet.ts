import { addDays, daysBetween } from '../lib/format'
import { today } from './fixtures'

export type VehicleType =
  | 'Betoneira'
  | 'Bomba-lança'
  | 'Bomba estacionária'
  | 'Basculante'
  | 'Caminhão de apoio'
  | 'Outro'

export type VehicleStatus =
  | 'Disponível'
  | 'Em operação'
  | 'Manutenção'
  | 'Atenção'
  | 'Inativo'

export type TripStatus =
  | 'Programada'
  | 'Em carregamento'
  | 'Em trânsito'
  | 'Na obra'
  | 'Retornando'
  | 'Concluída'
  | 'Cancelada'

export type MaintenanceKind = 'Preventiva' | 'Corretiva'
export type MaintenanceStatus = 'Agendada' | 'Em andamento' | 'Concluída' | 'Cancelada'

export interface FleetVehicle {
  id: string
  plate: string
  type: VehicleType
  model: string
  year: number | null
  capacityM3: number | null
  odometerKm: number
  nextMaintenanceKm: number | null
  status: VehicleStatus
  crlvDueAt: string
  insuranceDueAt: string
  notes: string
  demo: boolean
}

export interface FleetDriver {
  id: string
  name: string
  phone: string
  cnhCategory: string
  cnhExpiresAt: string
  active: boolean
  notes: string
  demo: boolean
}

export interface FleetTrip {
  id: string
  date: string
  time: string
  clientId: string
  siteId: string
  quoteId: string | null
  vehicleId: string
  driverId: string
  volumeM3: number
  fck: number | null
  status: TripStatus
  notes: string
  createdAt: string
  demo: boolean
}

export interface FleetMaintenance {
  id: string
  vehicleId: string
  kind: MaintenanceKind
  description: string
  dueAt: string
  odometerKm: number
  cost: number | null
  supplier: string
  nextMaintenanceKm: number | null
  status: MaintenanceStatus
  completedAt: string | null
  notes: string
  demo: boolean
}

export interface FleetFuelEntry {
  id: string
  vehicleId: string
  date: string
  odometerKm: number
  liters: number
  totalCost: number
  fuelType: string
  station: string
  fullTank: boolean
  notes: string
  demo: boolean
}

export interface FleetInspection {
  id: string
  vehicleId: string
  driverId: string
  date: string
  odometerKm: number
  checks: Record<string, boolean>
  notes: string
  demo: boolean
}

export interface FleetData {
  vehicles: FleetVehicle[]
  drivers: FleetDriver[]
  trips: FleetTrip[]
  maintenances: FleetMaintenance[]
  fuelEntries: FleetFuelEntry[]
  inspections: FleetInspection[]
}

export const inspectionItems = [
  'Pneus e rodas',
  'Freios e direção',
  'Luzes e sinalização',
  'Óleo, água e vazamentos',
  'Equipamento (betoneira/bomba)',
  'Documentos e itens de segurança',
] as const

export const tripInProgress: TripStatus[] = [
  'Em carregamento',
  'Em trânsito',
  'Na obra',
  'Retornando',
]

export function isTripInProgress(status: TripStatus) {
  return tripInProgress.includes(status)
}

export function createDemoFleet(): FleetData {
  const vehicle1 = 'fleet-demo-001'
  const vehicle2 = 'fleet-demo-002'
  const vehicle3 = 'fleet-demo-003'
  const driver1 = 'driver-demo-001'
  const driver2 = 'driver-demo-002'

  return {
    vehicles: [
      {
        id: vehicle1,
        plate: 'DEMO-001',
        type: 'Betoneira',
        model: 'Caminhão betoneira — demonstração',
        year: 2022,
        capacityM3: 8,
        odometerKm: 120500,
        nextMaintenanceKm: 121000,
        status: 'Em operação',
        crlvDueAt: addDays(today, 180),
        insuranceDueAt: addDays(today, 90),
        notes: 'Veículo fictício para demonstrar o módulo.',
        demo: true,
      },
      {
        id: vehicle2,
        plate: 'DEMO-002',
        type: 'Betoneira',
        model: 'Caminhão betoneira — demonstração',
        year: 2021,
        capacityM3: 10,
        odometerKm: 98500,
        nextMaintenanceKm: 100000,
        status: 'Disponível',
        crlvDueAt: addDays(today, 40),
        insuranceDueAt: addDays(today, 20),
        notes: 'Veículo fictício para demonstrar o módulo.',
        demo: true,
      },
      {
        id: vehicle3,
        plate: 'DEMO-003',
        type: 'Bomba-lança',
        model: 'Caminhão bomba — demonstração',
        year: 2023,
        capacityM3: null,
        odometerKm: 68400,
        nextMaintenanceKm: 69000,
        status: 'Manutenção',
        crlvDueAt: addDays(today, 300),
        insuranceDueAt: addDays(today, 240),
        notes: 'Veículo fictício para demonstrar o módulo.',
        demo: true,
      },
    ],
    drivers: [
      {
        id: driver1,
        name: 'Motorista demonstração A',
        phone: '',
        cnhCategory: 'D',
        cnhExpiresAt: addDays(today, 400),
        active: true,
        notes: '',
        demo: true,
      },
      {
        id: driver2,
        name: 'Motorista demonstração B',
        phone: '',
        cnhCategory: 'E',
        cnhExpiresAt: addDays(today, 15),
        active: true,
        notes: '',
        demo: true,
      },
    ],
    trips: [
      {
        id: 'trip-demo-001',
        date: today,
        time: '08:00',
        clientId: 'cl-1',
        siteId: 'ob-1',
        quoteId: 'orc-1',
        vehicleId: vehicle1,
        driverId: driver1,
        volumeM3: 8,
        fck: 25,
        status: 'Em trânsito',
        notes: 'Exemplo fictício de entrega em andamento.',
        createdAt: new Date().toISOString(),
        demo: true,
      },
    ],
    maintenances: [
      {
        id: 'maintenance-demo-001',
        vehicleId: vehicle3,
        kind: 'Preventiva',
        description: 'Revisão do sistema hidráulico',
        dueAt: today,
        odometerKm: 68400,
        cost: null,
        supplier: '',
        nextMaintenanceKm: 69000,
        status: 'Em andamento',
        completedAt: null,
        notes: 'Registro ilustrativo.',
        demo: true,
      },
    ],
    fuelEntries: [
      {
        id: 'fuel-demo-001',
        vehicleId: vehicle1,
        date: addDays(today, -10),
        odometerKm: 120020,
        liters: 160,
        totalCost: 960,
        fuelType: 'Diesel',
        station: 'Posto demonstração',
        fullTank: true,
        notes: '',
        demo: true,
      },
      {
        id: 'fuel-demo-002',
        vehicleId: vehicle1,
        date: addDays(today, -2),
        odometerKm: 120500,
        liters: 160,
        totalCost: 1008,
        fuelType: 'Diesel',
        station: 'Posto demonstração',
        fullTank: true,
        notes: '',
        demo: true,
      },
    ],
    inspections: [
      {
        id: 'inspection-demo-001',
        vehicleId: vehicle2,
        driverId: driver2,
        date: today,
        odometerKm: 98500,
        checks: Object.fromEntries(inspectionItems.map((item) => [item, true])),
        notes: 'Checklist fictício de demonstração.',
        demo: true,
      },
    ],
  }
}

export interface FleetAlert {
  id: string
  title: string
  detail: string
  severity: 'danger' | 'warning'
}

export function getFleetAlerts(data: FleetData, date = today): FleetAlert[] {
  const alerts: FleetAlert[] = []

  for (const vehicle of data.vehicles.filter((v) => v.status !== 'Inativo')) {
    for (const [label, dueAt] of [
      ['CRLV', vehicle.crlvDueAt],
      ['Seguro', vehicle.insuranceDueAt],
    ] as const) {
      if (!dueAt) {
        alerts.push({
          id: `${vehicle.id}-${label}-missing`,
          title: `${label} não informado · ${vehicle.plate}`,
          detail: 'Cadastre a data de validade para acompanhar o vencimento.',
          severity: 'warning',
        })
        continue
      }
      const days = daysBetween(date, dueAt)
      if (days <= 30) {
        alerts.push({
          id: `${vehicle.id}-${label}`,
          title: `${label} · ${vehicle.plate}`,
          detail: days < 0 ? `Vencido há ${Math.abs(days)} dia(s)` : days === 0 ? 'Vence hoje' : `Vence em ${days} dia(s)`,
          severity: days <= 7 ? 'danger' : 'warning',
        })
      }
    }

    if (
      vehicle.nextMaintenanceKm !== null &&
      vehicle.odometerKm >= vehicle.nextMaintenanceKm
    ) {
      alerts.push({
        id: `${vehicle.id}-maintenance-km`,
        title: `Revisão por hodômetro · ${vehicle.plate}`,
        detail: `Limite de ${vehicle.nextMaintenanceKm.toLocaleString('pt-BR')} km atingido`,
        severity: 'danger',
      })
    }
  }

  for (const driver of data.drivers.filter((d) => d.active)) {
    if (!driver.cnhExpiresAt) {
      alerts.push({
        id: `${driver.id}-cnh-missing`,
        title: `CNH sem validade · ${driver.name}`,
        detail: 'Informe a data de vencimento antes de escalar o motorista.',
        severity: 'warning',
      })
      continue
    }
    const days = daysBetween(date, driver.cnhExpiresAt)
    if (days <= 30) {
      alerts.push({
        id: `${driver.id}-cnh`,
        title: `CNH · ${driver.name}`,
        detail: days < 0 ? `Vencida há ${Math.abs(days)} dia(s)` : days === 0 ? 'Vence hoje' : `Vence em ${days} dia(s)`,
        severity: days <= 7 ? 'danger' : 'warning',
      })
    }
  }

  for (const maintenance of data.maintenances) {
    if (maintenance.status === 'Concluída' || maintenance.status === 'Cancelada') continue
    const days = daysBetween(date, maintenance.dueAt)
    if (days <= 30) {
      const vehicle = data.vehicles.find((v) => v.id === maintenance.vehicleId)
      alerts.push({
        id: `${maintenance.id}-due`,
        title: days < 0
          ? `Manutenção atrasada · ${vehicle?.plate ?? 'Veículo'}`
          : `Manutenção próxima · ${vehicle?.plate ?? 'Veículo'}`,
        detail: days < 0
          ? maintenance.description + ` · vencida há ${Math.abs(days)} dia(s)`
          : maintenance.description + (days === 0 ? ' · vence hoje' : ` · vence em ${days} dia(s)`),
        severity: days <= 7 ? 'danger' : 'warning',
      })
    }
  }

  for (const vehicle of data.vehicles) {
    const latestInspection = data.inspections
      .filter((inspection) => inspection.vehicleId === vehicle.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latestInspection && Object.values(latestInspection.checks).some((ok) => !ok)) {
      alerts.push({
        id: `${latestInspection.id}-inspection`,
        title: `Checklist com ressalva · ${vehicle.plate}`,
        detail: latestInspection.notes || 'Há item(ns) reprovado(s) no último checklist.',
        severity: 'danger',
      })
    }
  }

  return alerts
}

export function fuelEfficiencyKmL(entries: FleetFuelEntry[], vehicleId: string): number | null {
  const full = entries
    .filter((entry) => entry.vehicleId === vehicleId && entry.fullTank)
    .sort((a, b) => a.odometerKm - b.odometerKm)
  if (full.length < 2) return null
  const previous = full[full.length - 2]
  const last = full[full.length - 1]
  const distance = last.odometerKm - previous.odometerKm
  return distance > 0 && last.liters > 0 ? distance / last.liters : null
}

export function vehicleRunningCost(data: FleetData, vehicleId: string): number {
  const fuel = data.fuelEntries
    .filter((entry) => entry.vehicleId === vehicleId)
    .reduce((sum, entry) => sum + entry.totalCost, 0)
  const maintenance = data.maintenances
    .filter((entry) => entry.vehicleId === vehicleId)
    .reduce((sum, entry) => sum + (entry.cost ?? 0), 0)
  return fuel + maintenance
}
