import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Fuel,
  Gauge,
  MapPin,
  Pencil,
  Plus,
  Route,
  Search,
  Truck,
  Users,
  Wrench,
} from 'lucide-react'
import { useStore } from '../data/store'
import { today, type Client, type Site } from '../data/fixtures'
import { useFleet } from '../data/fleet-store'
import {
  fuelEfficiencyKmL,
  getFleetAlerts,
  inspectionItems,
  isTripInProgress,
  vehicleRunningCost,
  type FleetData,
  type FleetDriver,
  type FleetFuelEntry,
  type FleetInspection,
  type FleetMaintenance,
  type FleetTrip,
  type FleetVehicle,
  type MaintenanceStatus,
  type TripStatus,
  type VehicleStatus,
} from '../data/fleet'
import { brl, dateBR, daysBetween, num } from '../lib/format'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, cx, inputCls } from './ui'
import {
  DriverDialog,
  FuelDialog,
  InspectionDialog,
  MaintenanceDialog,
  TripDialog,
  VehicleDialog,
} from './TruckDialogs'

type TabId = 'overview' | 'vehicles' | 'drivers' | 'trips' | 'maintenance' | 'fuel' | 'checklists'
type DialogState =
  | { type: 'vehicle'; id?: string }
  | { type: 'driver'; id?: string }
  | { type: 'trip' }
  | { type: 'maintenance' }
  | { type: 'fuel' }
  | { type: 'inspection' }
  | null

const tabs: { id: TabId; label: string; icon: typeof Truck }[] = [
  { id: 'overview', label: 'Visão geral', icon: Gauge },
  { id: 'vehicles', label: 'Caminhões', icon: Truck },
  { id: 'drivers', label: 'Motoristas', icon: Users },
  { id: 'trips', label: 'Viagens', icon: Route },
  { id: 'maintenance', label: 'Manutenção', icon: Wrench },
  { id: 'fuel', label: 'Abastecimento', icon: Fuel },
  { id: 'checklists', label: 'Checklists', icon: ClipboardCheck },
]

const tripStatuses: TripStatus[] = ['Programada', 'Em carregamento', 'Em trânsito', 'Na obra', 'Retornando', 'Concluída', 'Cancelada']
const maintenanceStatuses: MaintenanceStatus[] = ['Agendada', 'Em andamento', 'Concluída', 'Cancelada']

function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? prefix + '-' + crypto.randomUUID()
    : prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
}

function statusTone(status: VehicleStatus) {
  if (status === 'Disponível') return 'ok'
  if (status === 'Em operação') return 'info'
  if (status === 'Atenção' || status === 'Manutenção') return 'warn'
  return 'neutral'
}

function tripTone(status: TripStatus) {
  if (status === 'Concluída') return 'ok'
  if (status === 'Cancelada') return 'red'
  if (isTripInProgress(status)) return 'info'
  return 'neutral'
}

function maintenanceTone(status: MaintenanceStatus) {
  if (status === 'Concluída') return 'ok'
  if (status === 'Em andamento') return 'warn'
  if (status === 'Cancelada') return 'neutral'
  return 'info'
}

function visibleFleetData(data: FleetData, demoMode: boolean): FleetData {
  const keep = <T extends { demo: boolean }>(items: T[]) => demoMode ? items : items.filter((item) => !item.demo)
  return {
    vehicles: keep(data.vehicles),
    drivers: keep(data.drivers),
    trips: keep(data.trips),
    maintenances: keep(data.maintenances),
    fuelEntries: keep(data.fuelEntries),
    inspections: keep(data.inspections),
  }
}

export function TruckFleet() {
  const { data, setData, ready } = useFleet()
  const { clients, sites, quotes, demoMode, toast } = useStore()
  const [tab, setTab] = useState<TabId>('overview')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [search, setSearch] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('Todos')
  const fleet = useMemo(() => visibleFleetData(data, demoMode), [data, demoMode])
  const alerts = useMemo(() => getFleetAlerts(fleet, today), [fleet])
  const editingVehicle = dialog?.type === 'vehicle' && dialog.id ? fleet.vehicles.find((vehicle) => vehicle.id === dialog.id) ?? null : null
  const editingDriver = dialog?.type === 'driver' && dialog.id ? fleet.drivers.find((driver) => driver.id === dialog.id) ?? null : null

  const closeDialog = () => setDialog(null)

  function saveVehicle(value: Omit<FleetVehicle, 'id' | 'demo'>, id?: string) {
    const duplicate = data.vehicles.some((vehicle) => vehicle.plate.toUpperCase() === value.plate.toUpperCase() && vehicle.id !== id)
    if (duplicate) return 'Já existe um veículo cadastrado com esta placa.'
    setData((current) => ({
      ...current,
      vehicles: id
        ? current.vehicles.map((vehicle) => vehicle.id === id ? { ...vehicle, ...value } : vehicle)
        : [{ ...value, id: makeId('vehicle'), demo: false }, ...current.vehicles],
    }))
    toast({ tone: 'ok', title: id ? 'Veículo atualizado' : 'Caminhão cadastrado', body: value.plate + ' foi salvo na frota.' })
    return null
  }

  function saveDriver(value: Omit<FleetDriver, 'id' | 'demo'>, id?: string) {
    setData((current) => ({
      ...current,
      drivers: id
        ? current.drivers.map((driver) => driver.id === id ? { ...driver, ...value } : driver)
        : [{ ...value, id: makeId('driver'), demo: false }, ...current.drivers],
    }))
    toast({ tone: 'ok', title: id ? 'Motorista atualizado' : 'Motorista cadastrado' })
    return null
  }

  function saveTrip(value: Omit<FleetTrip, 'id' | 'createdAt' | 'demo'>) {
    const vehicle = fleet.vehicles.find((item) => item.id === value.vehicleId)
    const driver = fleet.drivers.find((item) => item.id === value.driverId)
    if (!vehicle || vehicle.status !== 'Disponível') return 'O caminhão selecionado não está disponível.'
    if (!driver || !driver.active) return 'O motorista selecionado não está ativo.'
    const vehicleBooked = fleet.trips.some((trip) => trip.vehicleId === value.vehicleId && trip.date === value.date && trip.status !== 'Concluída' && trip.status !== 'Cancelada')
    const driverBooked = fleet.trips.some((trip) => trip.driverId === value.driverId && trip.date === value.date && trip.status !== 'Concluída' && trip.status !== 'Cancelada')
    if (vehicleBooked) return 'Este caminhão já possui uma viagem não encerrada nesta data.'
    if (driverBooked) return 'Este motorista já possui uma viagem não encerrada nesta data.'
    if (!vehicle.crlvDueAt || daysBetween(value.date, vehicle.crlvDueAt) < 0) return 'CRLV ausente ou vencido na data da viagem.'
    if (!vehicle.insuranceDueAt || daysBetween(value.date, vehicle.insuranceDueAt) < 0) return 'Seguro ausente ou vencido na data da viagem.'
    if (!driver.cnhExpiresAt || daysBetween(value.date, driver.cnhExpiresAt) < 0) return 'CNH ausente ou vencida na data da viagem.'
    if (daysBetween(today, value.date) < 0) return 'Não é possível programar uma viagem para uma data passada.'
    setData((current) => ({
      ...current,
      trips: [{ ...value, id: makeId('trip'), createdAt: new Date().toISOString(), demo: false }, ...current.trips],
    }))
    toast({ tone: 'ok', title: 'Viagem programada', body: vehicle.plate + ' · ' + value.date + ' às ' + value.time })
    return null
  }

  function changeTripStatus(tripId: string, status: TripStatus) {
    const targetTrip = fleet.trips.find((trip) => trip.id === tripId)
    const targetVehicle = targetTrip ? fleet.vehicles.find((vehicle) => vehicle.id === targetTrip.vehicleId) : null
    if (isTripInProgress(status) && targetVehicle && ['Manutenção', 'Atenção', 'Inativo'].includes(targetVehicle.status)) {
      toast({ tone: 'erro', title: 'Veículo indisponível', body: 'Resolva a manutenção ou a ressalva do checklist antes de despachar.' })
      return
    }
    setData((current) => {
      const target = current.trips.find((trip) => trip.id === tripId)
      if (!target) return current
      const trips = current.trips.map((trip) => trip.id === tripId ? { ...trip, status } : trip)
      const anotherActiveTrip = trips.some((trip) => trip.id !== tripId && trip.vehicleId === target.vehicleId && isTripInProgress(trip.status))
      const vehicle = current.vehicles.find((item) => item.id === target.vehicleId)
      const vehicles = current.vehicles.map((item) => {
        if (item.id !== target.vehicleId || !vehicle || item.status === 'Inativo' || item.status === 'Manutenção' || item.status === 'Atenção') return item
        if (isTripInProgress(status) || anotherActiveTrip) return { ...item, status: 'Em operação' as VehicleStatus }
        if (status === 'Concluída' || status === 'Cancelada' || status === 'Programada') return { ...item, status: 'Disponível' as VehicleStatus }
        return item
      })
      return { ...current, trips, vehicles }
    })
    toast({ tone: 'ok', title: 'Status da viagem atualizado', body: status })
  }

  function saveMaintenance(value: Omit<FleetMaintenance, 'id' | 'completedAt' | 'demo'>) {
    const vehicle = fleet.vehicles.find((item) => item.id === value.vehicleId)
    if (!vehicle) return 'Selecione um caminhão válido.'
    if (value.odometerKm < vehicle.odometerKm) return 'O hodômetro informado é menor que o último registrado.'
    setData((current) => ({
      ...current,
      maintenances: [{ ...value, id: makeId('maintenance'), completedAt: null, demo: false }, ...current.maintenances],
      vehicles: current.vehicles.map((item) => item.id === value.vehicleId ? { ...item, odometerKm: Math.max(item.odometerKm, value.odometerKm) } : item),
    }))
    toast({ tone: 'ok', title: 'Ordem de manutenção aberta', body: vehicle.plate + ' · ' + value.kind })
    return null
  }

  function changeMaintenanceStatus(maintenanceId: string, status: MaintenanceStatus) {
    const targetMaintenance = fleet.maintenances.find((item) => item.id === maintenanceId)
    if (status === 'Em andamento' && targetMaintenance && fleet.trips.some((trip) => trip.vehicleId === targetMaintenance.vehicleId && isTripInProgress(trip.status))) {
      toast({ tone: 'erro', title: 'Caminhão em operação', body: 'Conclua ou encerre a viagem antes de iniciar a manutenção.' })
      return
    }
    setData((current) => {
      const previous = current.maintenances.find((item) => item.id === maintenanceId)
      if (!previous) return current
      const maintenances = current.maintenances.map((item) => item.id === maintenanceId
        ? { ...item, status, completedAt: status === 'Concluída' ? new Date().toISOString() : item.completedAt }
        : item)
      const activeTrip = current.trips.some((trip) => trip.vehicleId === previous.vehicleId && isTripInProgress(trip.status))
      const vehicles = current.vehicles.map((vehicle) => {
        if (vehicle.id !== previous.vehicleId || vehicle.status === 'Inativo') return vehicle
        if (status === 'Em andamento') return { ...vehicle, status: 'Manutenção' as VehicleStatus }
        if (status === 'Concluída') {
          return {
            ...vehicle,
            status: activeTrip ? 'Em operação' as VehicleStatus : 'Disponível' as VehicleStatus,
            odometerKm: Math.max(vehicle.odometerKm, previous.odometerKm),
            nextMaintenanceKm: previous.nextMaintenanceKm ?? vehicle.nextMaintenanceKm,
          }
        }
        if ((status === 'Cancelada' || status === 'Agendada') && previous.status === 'Em andamento' && vehicle.status === 'Manutenção') {
          return { ...vehicle, status: activeTrip ? 'Em operação' as VehicleStatus : 'Disponível' as VehicleStatus }
        }
        return vehicle
      })
      return { ...current, maintenances, vehicles }
    })
    toast({ tone: 'ok', title: 'Ordem de serviço atualizada', body: status })
  }

  function saveFuel(value: Omit<FleetFuelEntry, 'id' | 'demo'>) {
    const vehicle = fleet.vehicles.find((item) => item.id === value.vehicleId)
    if (!vehicle) return 'Selecione um caminhão válido.'
    if (value.odometerKm < vehicle.odometerKm) return 'O hodômetro do abastecimento não pode ser menor que o último registrado.'
    setData((current) => ({
      ...current,
      fuelEntries: [{ ...value, id: makeId('fuel'), demo: false }, ...current.fuelEntries],
      vehicles: current.vehicles.map((item) => item.id === value.vehicleId ? { ...item, odometerKm: value.odometerKm } : item),
    }))
    toast({ tone: 'ok', title: 'Abastecimento registrado', body: vehicle.plate + ' · ' + num(value.liters, 2) + ' L' })
    return null
  }

  function saveInspection(value: Omit<FleetInspection, 'id' | 'demo'>) {
    const vehicle = fleet.vehicles.find((item) => item.id === value.vehicleId)
    if (!vehicle) return 'Selecione um veículo válido.'
    if (value.odometerKm < vehicle.odometerKm) return 'O hodômetro informado é menor que o último registrado.'
    const approved = Object.values(value.checks).every(Boolean)
    setData((current) => ({
      ...current,
      inspections: [{ ...value, id: makeId('inspection'), demo: false }, ...current.inspections],
      vehicles: current.vehicles.map((item) => item.id === value.vehicleId
        ? { ...item, odometerKm: Math.max(item.odometerKm, value.odometerKm), status: approved ? (item.status === 'Atenção' ? (current.trips.some((trip) => trip.vehicleId === value.vehicleId && isTripInProgress(trip.status)) ? 'Em operação' : 'Disponível') : item.status) : 'Atenção' }
        : item),
    }))
    toast({
      tone: approved ? 'ok' : 'info',
      title: approved ? 'Checklist aprovado' : 'Veículo sinalizado para atenção',
      body: approved ? vehicle.plate + ' liberado no checklist.' : 'Verifique os itens reprovados antes de escalar o caminhão.',
    })
    return null
  }

  function deactivateVehicle(vehicleId: string) {
    const vehicle = fleet.vehicles.find((item) => item.id === vehicleId)
    if (!vehicle) return
    if (fleet.trips.some((trip) => trip.vehicleId === vehicleId && trip.status !== 'Concluída' && trip.status !== 'Cancelada')) {
      toast({ tone: 'erro', title: 'Não é possível inativar', body: 'Encerre ou cancele as viagens programadas primeiro.' })
      return
    }
    setData((current) => ({ ...current, vehicles: current.vehicles.map((item) => item.id === vehicleId ? { ...item, status: 'Inativo' } : item) }))
    toast({ tone: 'info', title: 'Veículo inativado', body: vehicle.plate + ' continua no histórico.' })
  }

  const activeTrips = fleet.trips.filter((trip) => isTripInProgress(trip.status))
  const upcomingTrips = fleet.trips
    .filter((trip) => trip.status === 'Programada' && daysBetween(today, trip.date) >= 0)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const availableCount = fleet.vehicles.filter((vehicle) => vehicle.status === 'Disponível').length
  const maintenanceCount = fleet.vehicles.filter((vehicle) => vehicle.status === 'Manutenção').length
  const attentionCount = fleet.vehicles.filter((vehicle) => vehicle.status === 'Atenção').length
  const completedTrips = fleet.trips.filter((trip) => trip.status === 'Concluída').length
  const fuelTotal = fleet.fuelEntries.reduce((sum, entry) => sum + entry.totalCost, 0)
  const maintenanceTotal = fleet.maintenances.reduce((sum, entry) => sum + (entry.cost ?? 0), 0)
  const filteredVehicles = fleet.vehicles.filter((vehicle) => {
    const needle = search.trim().toLocaleLowerCase('pt-BR')
    const matchSearch = !needle || [vehicle.plate, vehicle.model, vehicle.type].some((value) => value.toLocaleLowerCase('pt-BR').includes(needle))
    const matchStatus = vehicleFilter === 'Todos' || vehicle.status === vehicleFilter
    return matchSearch && matchStatus
  })

  if (!ready) {
    return <Card><div className="p-8 text-center text-sm text-muted">Carregando os registros locais da frota...</div></Card>
  }

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Caminhões e frota"
        description="Disponibilidade, motoristas, viagens, manutenção, abastecimento e inspeções em um só lugar."
        actions={
          <>
            <Button onClick={() => setDialog({ type: 'trip' })}><Route className="h-4 w-4" /> Programar viagem</Button>
            <Button variant="primary" onClick={() => setDialog({ type: 'vehicle' })}><Plus className="h-4 w-4" /> Novo caminhão</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryCard label="Veículos ativos" value={String(fleet.vehicles.filter((vehicle) => vehicle.status !== 'Inativo').length)} detail={fleet.vehicles.length + ' cadastrados'} icon={<Truck className="h-4 w-4" />} />
        <SummaryCard label="Disponíveis" value={String(availableCount)} detail="Prontos para escala" icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" />
        <SummaryCard label="Em operação" value={String(activeTrips.length)} detail="Viagens em andamento" icon={<Route className="h-4 w-4" />} tone="info" />
        <SummaryCard label="Manutenção" value={String(maintenanceCount)} detail="Fora de operação" icon={<Wrench className="h-4 w-4" />} tone="warn" />
        <SummaryCard label="Alertas" value={String(alerts.length + attentionCount)} detail="Documentos, revisão e checklist" icon={<AlertTriangle className="h-4 w-4" />} tone={alerts.length + attentionCount > 0 ? 'warn' : 'neutral'} />
      </div>

      <div className="mb-5 flex min-w-0 gap-1 overflow-x-auto border-b border-line pb-1">
        {tabs.map((item) => (
          <button key={item.id} onClick={() => setTab(item.id)} className={cx('flex shrink-0 items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-semibold transition-colors', tab === item.id ? 'border-b-2 border-brand bg-surface text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
            <item.icon className="h-4 w-4" /> {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Situação da frota" subtitle="Disponibilidade informada pelos registros e pelas viagens em andamento." />
            {fleet.vehicles.filter((vehicle) => vehicle.status !== 'Inativo').length === 0 ? (
              <EmptyState icon={<Truck className="h-6 w-6" />} title="Frota não cadastrada" action={<Button variant="primary" onClick={() => setDialog({ type: 'vehicle' })}>Cadastrar primeiro caminhão</Button>}>Cadastre a frota para começar a programar as concretagens.</EmptyState>
            ) : (
              <div className="divide-y divide-line">
                {fleet.vehicles.filter((vehicle) => vehicle.status !== 'Inativo').map((vehicle) => {
                  const driver = fleet.trips.find((trip) => trip.vehicleId === vehicle.id && isTripInProgress(trip.status))
                  return (
                    <div key={vehicle.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface-2"><Truck className="h-5 w-5 text-muted" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg font-bold uppercase leading-tight">{vehicle.plate}</p>
                        <p className="truncate text-xs text-muted">{vehicle.type} · {vehicle.model}</p>
                        {driver && <p className="mt-0.5 truncate text-xs text-muted">Motorista: {fleet.drivers.find((item) => item.id === driver.driverId)?.name ?? 'Não identificado'}</p>}
                      </div>
                      <Badge tone={statusTone(vehicle.status)}>{vehicle.status}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Alertas e vencimentos" subtitle="CRLV, seguro, CNH, manutenção e ressalvas de inspeção." />
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 p-5 text-sm text-ok"><CheckCircle2 className="h-5 w-5" /> Nenhum alerta cadastrado para a frota visível.</div>
            ) : (
              <ul className="divide-y divide-line">
                {alerts.slice(0, 10).map((alert) => (
                  <li key={alert.id} className="flex items-start gap-3 px-4 py-3">
                    <AlertTriangle className={cx('mt-0.5 h-4 w-4 shrink-0', alert.severity === 'danger' ? 'text-brand' : 'text-warn')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <p className="text-xs text-muted">{alert.detail}</p>
                    </div>
                    <Badge tone={alert.severity === 'danger' ? 'red' : 'warn'}>{alert.severity === 'danger' ? 'Ação' : 'Atenção'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Viagens em andamento" subtitle="Atualize o andamento conforme o caminhão avança na operação." action={<Button size="sm" onClick={() => setTab('trips')}>Ver viagens</Button>} />
            {activeTrips.length === 0 ? (
              <p className="p-5 text-sm text-muted">Nenhuma viagem em andamento.</p>
            ) : (
              <div className="divide-y divide-line">
                {activeTrips.map((trip) => <TripListItem key={trip.id} trip={trip} fleet={fleet} clients={clients} sites={sites} onStatus={changeTripStatus} />)}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Próximas viagens" subtitle="Reservas futuras vinculadas às obras cadastradas." action={<Button size="sm" onClick={() => setDialog({ type: 'trip' })}><Plus className="h-3.5 w-3.5" /> Programar</Button>} />
            {upcomingTrips.length === 0 ? (
              <p className="p-5 text-sm text-muted">Nenhuma viagem futura programada.</p>
            ) : (
              <div className="divide-y divide-line">
                {upcomingTrips.slice(0, 6).map((trip) => <TripListItem key={trip.id} trip={trip} fleet={fleet} clients={clients} sites={sites} onStatus={changeTripStatus} />)}
              </div>
            )}
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Custos registrados" subtitle="Totais acumulados nos lançamentos locais da frota; não representam o custo contábil completo." />
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <CostCard label="Abastecimento" amount={fuelTotal} caption={fleet.fuelEntries.length + ' lançamento(s)'} icon={<Fuel className="h-4 w-4" />} />
              <CostCard label="Manutenção" amount={maintenanceTotal} caption={fleet.maintenances.filter((item) => item.cost !== null).length + ' ordem(ns) com custo'} icon={<Wrench className="h-4 w-4" />} />
              <CostCard label="Viagens concluídas" amount={completedTrips} caption="Entregas finalizadas" icon={<Route className="h-4 w-4" />} count />
            </div>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Telemetria e GPS" subtitle="Acompanhamento em tempo real depende de um rastreador e de uma integração externa." action={<Badge tone="warn">Não conectado</Badge>} />
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-surface-2"><MapPin className="h-5 w-5 text-muted" /></div>
              <p className="min-w-0 flex-1 text-sm text-muted">O CRM registra viagens, horários, motorista e status informados pela equipe. Localização ao vivo, rotas, quilometragem automática e ETA não são simulados; precisam de um provedor GPS ou aplicativo do motorista conectado.</p>
              <Button onClick={() => setTab('trips')}>Abrir viagens</Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'vehicles' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por placa, modelo ou tipo..." className={cx(inputCls(), 'pl-9')} />
            </label>
            <select className={cx(inputCls(), 'sm:w-48')} value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}>
              <option>Todos</option>
              {(['Disponível', 'Em operação', 'Manutenção', 'Atenção', 'Inativo'] as VehicleStatus[]).map((status) => <option key={status}>{status}</option>)}
            </select>
            <Button variant="primary" onClick={() => setDialog({ type: 'vehicle' })}><Plus className="h-4 w-4" /> Novo caminhão</Button>
          </div>
          {filteredVehicles.length === 0 ? (
            <Card><EmptyState icon={<Truck className="h-6 w-6" />} title="Nenhum veículo encontrado" action={<Button variant="primary" onClick={() => setDialog({ type: 'vehicle' })}>Cadastrar caminhão</Button>}>Ajuste a busca ou registre os veículos da empresa.</EmptyState></Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredVehicles.map((vehicle) => {
                const activeTrip = fleet.trips.find((trip) => trip.vehicleId === vehicle.id && isTripInProgress(trip.status))
                const driver = activeTrip ? fleet.drivers.find((item) => item.id === activeTrip.driverId) : null
                const efficiency = fuelEfficiencyKmL(fleet.fuelEntries, vehicle.id)
                const cost = vehicleRunningCost(fleet, vehicle.id)
                return (
                  <Card key={vehicle.id} className="min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ink text-bg"><Truck className="h-5 w-5" /></div>
                        <div className="min-w-0">
                          <p className="font-display text-2xl font-bold leading-none">{vehicle.plate}</p>
                          <p className="mt-1 truncate text-xs text-muted">{vehicle.model}</p>
                        </div>
                      </div>
                      <Badge tone={statusTone(vehicle.status)}>{vehicle.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-3">
                      <Metric label="Tipo" value={vehicle.type} />
                      <Metric label="Capacidade" value={vehicle.capacityM3 ? num(vehicle.capacityM3, 1) + ' m³' : '—'} />
                      <Metric label="Hodômetro" value={num(vehicle.odometerKm, 0) + ' km'} />
                      <Metric label="Próxima revisão" value={vehicle.nextMaintenanceKm ? num(vehicle.nextMaintenanceKm, 0) + ' km' : 'Não definida'} />
                      <Metric label="Consumo estimado" value={efficiency === null ? 'Sem dados' : num(efficiency, 2) + ' km/L'} />
                      <Metric label="Custos lançados" value={brl(cost)} />
                      {driver && <Metric label="Em operação com" value={driver.name} />}
                      {vehicle.crlvDueAt && <Metric label="CRLV" value={dateBR(vehicle.crlvDueAt)} />}
                      {vehicle.insuranceDueAt && <Metric label="Seguro" value={dateBR(vehicle.insuranceDueAt)} />}
                    </div>
                    {vehicle.notes && <p className="mx-4 mb-3 rounded bg-surface-2 p-2 text-xs text-muted">{vehicle.notes}</p>}
                    <div className="flex flex-wrap gap-2 border-t border-line p-3">
                      <Button size="sm" onClick={() => setDialog({ type: 'vehicle', id: vehicle.id })}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                      <Button size="sm" onClick={() => setDialog({ type: 'maintenance' })}><Wrench className="h-3.5 w-3.5" /> Manutenção</Button>
                      <Button size="sm" onClick={() => setDialog({ type: 'inspection' })}><ClipboardCheck className="h-3.5 w-3.5" /> Checklist</Button>
                      {vehicle.status !== 'Inativo' && <Button size="sm" variant="danger" onClick={() => deactivateVehicle(vehicle.id)}>Inativar</Button>}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'drivers' && (
        <section className="space-y-4">
          <div className="flex justify-end"><Button variant="primary" onClick={() => setDialog({ type: 'driver' })}><Plus className="h-4 w-4" /> Novo motorista</Button></div>
          {fleet.drivers.length === 0 ? (
            <Card><EmptyState icon={<Users className="h-6 w-6" />} title="Nenhum motorista cadastrado" action={<Button variant="primary" onClick={() => setDialog({ type: 'driver' })}>Cadastrar motorista</Button>}>Cadastre os condutores e controle a categoria e validade da CNH.</EmptyState></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {fleet.drivers.map((driver) => {
                const due = driver.cnhExpiresAt ? daysBetween(today, driver.cnhExpiresAt) : null
                const tripsCount = fleet.trips.filter((trip) => trip.driverId === driver.id && trip.status === 'Concluída').length
                return (
                  <Card key={driver.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{driver.name}</p>
                        <p className="mt-1 text-xs text-muted">{driver.phone || 'Telefone não informado'} · CNH {driver.cnhCategory}</p>
                      </div>
                      <Badge tone={driver.active ? 'ok' : 'neutral'}>{driver.active ? 'Ativo' : 'Inativo'}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-muted">CNH até {dateBR(driver.cnhExpiresAt)}</span>
                      <Badge tone={due === null ? 'neutral' : due < 0 ? 'red' : due <= 30 ? 'warn' : 'neutral'}>{due === null ? 'Sem validade' : due < 0 ? 'Vencida' : due <= 30 ? 'Vence em breve' : 'Regular'}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                      <span className="text-xs text-muted">{tripsCount} viagem(ns) concluída(s)</span>
                      <Button size="sm" onClick={() => setDialog({ type: 'driver', id: driver.id })}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'trips' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Programe a entrega, associe cliente, obra, orçamento, caminhão e motorista e atualize cada etapa da operação.</p>
            <Button variant="primary" onClick={() => setDialog({ type: 'trip' })}><Plus className="h-4 w-4" /> Programar viagem</Button>
          </div>
          {fleet.trips.length === 0 ? (
            <Card><EmptyState icon={<Route className="h-6 w-6" />} title="Nenhuma viagem registrada" action={<Button variant="primary" onClick={() => setDialog({ type: 'trip' })}>Programar primeira viagem</Button>}>As viagens podem ser vinculadas aos clientes, obras e orçamentos já cadastrados.</EmptyState></Card>
          ) : (
            <div className="space-y-3">
              {fleet.trips.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map((trip) => <TripCard key={trip.id} trip={trip} fleet={fleet} clients={clients} sites={sites} onStatus={changeTripStatus} />)}
            </div>
          )}
        </section>
      )}

      {tab === 'maintenance' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Ordens preventivas e corretivas, custo, hodômetro e próxima revisão.</p>
            <Button variant="primary" onClick={() => setDialog({ type: 'maintenance' })}><Plus className="h-4 w-4" /> Abrir ordem</Button>
          </div>
          {fleet.maintenances.length === 0 ? (
            <Card><EmptyState icon={<Wrench className="h-6 w-6" />} title="Nenhuma manutenção registrada" action={<Button variant="primary" onClick={() => setDialog({ type: 'maintenance' })}>Registrar manutenção</Button>}>Abra ordens de serviço para acompanhar custos e revisões da frota.</EmptyState></Card>
          ) : (
            <div className="space-y-3">
              {fleet.maintenances.map((item) => {
                const vehicle = fleet.vehicles.find((v) => v.id === item.vehicleId)
                return (
                  <Card key={item.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.description}</p><Badge>{item.kind}</Badge></div>
                        <p className="mt-1 text-xs text-muted">{vehicle?.plate ?? 'Veículo removido'} · abertura/previsão {dateBR(item.dueAt)} · {num(item.odometerKm, 0)} km</p>
                        {item.supplier && <p className="mt-1 text-xs text-muted">Oficina: {item.supplier}</p>}
                        {item.notes && <p className="mt-2 text-sm text-muted">{item.notes}</p>}
                      </div>
                      <div className="text-right">
                        <Badge tone={maintenanceTone(item.status)}>{item.status}</Badge>
                        <p className="mt-2 font-semibold tabular">{item.cost === null ? 'Custo pendente' : brl(item.cost)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="text-xs text-muted">{item.nextMaintenanceKm ? 'Próxima revisão: ' + num(item.nextMaintenanceKm, 0) + ' km' : 'Próxima revisão não definida'}</span>
                      {item.status !== 'Concluída' && item.status !== 'Cancelada' && (
                        <div className="flex gap-2">
                          {item.status === 'Agendada' && <Button size="sm" onClick={() => changeMaintenanceStatus(item.id, 'Em andamento')}>Iniciar serviço</Button>}
                          <Button size="sm" variant="primary" onClick={() => changeMaintenanceStatus(item.id, 'Concluída')}>Concluir</Button>
                          <Button size="sm" variant="ghost" onClick={() => changeMaintenanceStatus(item.id, 'Cancelada')}>Cancelar</Button>
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'fuel' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Controle litros, valor, tipo de combustível e quilometragem por veículo.</p>
            <Button variant="primary" onClick={() => setDialog({ type: 'fuel' })}><Plus className="h-4 w-4" /> Novo abastecimento</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Total registrado" value={brl(fuelTotal)} detail="Abastecimentos da frota visível" icon={<Fuel className="h-4 w-4" />} />
            <SummaryCard label="Litros lançados" value={num(fleet.fuelEntries.reduce((sum, entry) => sum + entry.liters, 0), 2) + ' L'} detail="Volume acumulado" icon={<Gauge className="h-4 w-4" />} />
            <SummaryCard label="Custo de manutenção" value={brl(maintenanceTotal)} detail="Ordens com custo informado" icon={<Wrench className="h-4 w-4" />} />
          </div>
          {fleet.fuelEntries.length === 0 ? (
            <Card><EmptyState icon={<Fuel className="h-6 w-6" />} title="Nenhum abastecimento" action={<Button variant="primary" onClick={() => setDialog({ type: 'fuel' })}>Registrar abastecimento</Button>}>O consumo km/L passa a ser calculado quando houver pelo menos dois abastecimentos de tanque cheio.</EmptyState></Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {fleet.fuelEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((entry) => (
                <FuelCard key={entry.id} entry={entry} fleet={fleet} />
              ))}
            </div>
          )}
          <Card>
            <CardHeader title="Consumo por veículo" subtitle="Estimativa km/L entre os dois últimos registros marcados como tanque cheio." />
            <div className="divide-y divide-line">
              {fleet.vehicles.filter((vehicle) => vehicle.status !== 'Inativo').map((vehicle) => {
                const efficiency = fuelEfficiencyKmL(fleet.fuelEntries, vehicle.id)
                return <div key={vehicle.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="font-semibold">{vehicle.plate}</span><span className="tabular">{efficiency === null ? 'Dados insuficientes' : num(efficiency, 2) + ' km/L'}</span></div>
              })}
            </div>
          </Card>
        </section>
      )}

      {tab === 'checklists' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Inspeção pré-operacional de itens críticos antes de colocar o caminhão na rua.</p>
            <Button variant="primary" onClick={() => setDialog({ type: 'inspection' })}><Plus className="h-4 w-4" /> Novo checklist</Button>
          </div>
          {fleet.inspections.length === 0 ? (
            <Card><EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="Nenhum checklist registrado" action={<Button variant="primary" onClick={() => setDialog({ type: 'inspection' })}>Registrar inspeção</Button>}>Inspeções com ressalvas colocam o veículo em situação de atenção até uma nova verificação aprovada.</EmptyState></Card>
          ) : (
            <div className="space-y-3">
              {fleet.inspections.slice().sort((a, b) => b.date.localeCompare(a.date)).map((inspection) => {
                const vehicle = fleet.vehicles.find((v) => v.id === inspection.vehicleId)
                const driver = fleet.drivers.find((d) => d.id === inspection.driverId)
                const rejected = Object.entries(inspection.checks).filter(([, ok]) => !ok).map(([label]) => label)
                return (
                  <Card key={inspection.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{vehicle?.plate ?? 'Veículo removido'} · {dateBR(inspection.date)}</p>
                        <p className="mt-1 text-xs text-muted">{driver?.name ?? 'Motorista não informado'} · Hodômetro {num(inspection.odometerKm, 0)} km</p>
                      </div>
                      <Badge tone={rejected.length ? 'red' : 'ok'}>{rejected.length ? rejected.length + ' ressalva(s)' : 'Aprovado'}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {inspectionItems.map((item) => <Badge key={item} tone={inspection.checks[item] ? 'ok' : 'red'}>{inspection.checks[item] ? '✓ ' : '× '}{item}</Badge>)}
                    </div>
                    {inspection.notes && <p className="mt-2 text-sm text-muted">{inspection.notes}</p>}
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      {dialog?.type === 'vehicle' && <VehicleDialog key={editingVehicle?.id ?? 'new'} open onClose={closeDialog} initial={editingVehicle} onSave={(value) => saveVehicle(value, editingVehicle?.id)} />}
      {dialog?.type === 'driver' && <DriverDialog key={editingDriver?.id ?? 'new'} open onClose={closeDialog} initial={editingDriver} onSave={(value) => saveDriver(value, editingDriver?.id)} />}
      {dialog?.type === 'trip' && <TripDialog open onClose={closeDialog} onSave={saveTrip} clients={clients} sites={sites} quotes={quotes} vehicles={fleet.vehicles} drivers={fleet.drivers} trips={fleet.trips} />}
      {dialog?.type === 'maintenance' && <MaintenanceDialog open onClose={closeDialog} onSave={saveMaintenance} vehicles={fleet.vehicles} />}
      {dialog?.type === 'fuel' && <FuelDialog open onClose={closeDialog} onSave={saveFuel} vehicles={fleet.vehicles} />}
      {dialog?.type === 'inspection' && <InspectionDialog open onClose={closeDialog} onSave={saveInspection} vehicles={fleet.vehicles} drivers={fleet.drivers} />}
    </>
  )
}

function SummaryCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone?: 'ok' | 'info' | 'warn' | 'neutral' }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 text-muted"><span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>{icon}</div>
      <p className={cx('mt-1 truncate font-display text-2xl font-extrabold tabular sm:text-3xl', tone === 'ok' && 'text-ok', tone === 'info' && 'text-info', tone === 'warn' && 'text-warn')}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{detail}</p>
    </Card>
  )
}

function CostCard({ label, amount, caption, icon, count }: { label: string; amount: number; caption: string; icon: ReactNode; count?: boolean }) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <div className="flex items-center justify-between text-xs font-semibold text-muted">{label}{icon}</div>
      <p className="mt-1 font-display text-2xl font-bold tabular">{count ? num(amount, 0) : brl(amount)}</p>
      <p className="text-xs text-muted">{caption}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p><p className="break-words text-sm font-semibold">{value}</p></div>
}

function TripListItem({ trip, fleet, clients, sites, onStatus }: { trip: FleetTrip; fleet: FleetData; clients: Client[]; sites: Site[]; onStatus: (id: string, status: TripStatus) => void }) {
  const vehicle = fleet.vehicles.find((item) => item.id === trip.vehicleId)
  const driver = fleet.drivers.find((item) => item.id === trip.driverId)
  const client = clients.find((item) => item.id === trip.clientId)
  const site = sites.find((item) => item.id === trip.siteId)
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="w-20 shrink-0 rounded bg-ink px-2 py-1 text-center text-bg">
        <p className="font-display text-lg font-bold leading-none">{trip.date.slice(8, 10)}/{trip.date.slice(5, 7)}</p>
        <p className="text-xs">{trip.time}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{site?.name ?? 'Obra não localizada'}</p>
        <p className="truncate text-xs text-muted">{client?.name ?? 'Cliente não localizado'} · {vehicle?.plate ?? 'Sem veículo'} · {driver?.name ?? 'Sem motorista'}</p>
        <p className="mt-1 flex flex-wrap gap-1"><Badge>{num(trip.volumeM3, 2)} m³</Badge>{trip.fck && <Badge>FCK {trip.fck}</Badge>}<Badge tone={tripTone(trip.status)}>{trip.status}</Badge></p>
      </div>
      <select aria-label="Status da viagem" className={cx(inputCls(), 'h-9 sm:w-44')} value={trip.status} onChange={(event) => onStatus(trip.id, event.target.value as TripStatus)}>
        {tripStatuses.map((status) => <option key={status}>{status}</option>)}
      </select>
    </div>
  )
}

function TripCard({ trip, fleet, clients, sites, onStatus }: { trip: FleetTrip; fleet: FleetData; clients: Client[]; sites: Site[]; onStatus: (id: string, status: TripStatus) => void }) {
  const vehicle = fleet.vehicles.find((item) => item.id === trip.vehicleId)
  const driver = fleet.drivers.find((item) => item.id === trip.driverId)
  const client = clients.find((item) => item.id === trip.clientId)
  const site = sites.find((item) => item.id === trip.siteId)
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-xl font-bold uppercase">{vehicle?.plate ?? 'Veículo removido'} · {dateBR(trip.date)} às {trip.time}</p>
          <p className="mt-1 truncate text-sm font-semibold">{site?.name ?? 'Obra não localizada'}</p>
          <p className="text-xs text-muted">{client?.name ?? 'Cliente não localizado'} · {driver?.name ?? 'Motorista não informado'}</p>
        </div>
        <Badge tone={tripTone(trip.status)}>{trip.status}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5"><Badge>{num(trip.volumeM3, 2)} m³</Badge>{trip.fck && <Badge>FCK {trip.fck}</Badge>}{trip.quoteId && <Badge>Orçamento vinculado</Badge>}</div>
      {trip.notes && <p className="mt-2 text-sm text-muted">{trip.notes}</p>}
      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted"><Clock3 className="mr-1 inline h-3.5 w-3.5" /> Criada em {dateBR(trip.createdAt)}</p>
        <select aria-label="Atualizar etapa da viagem" className={cx(inputCls(), 'sm:w-52')} value={trip.status} onChange={(event) => onStatus(trip.id, event.target.value as TripStatus)}>
          {tripStatuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      </div>
    </Card>
  )
}

function FuelCard({ entry, fleet }: { entry: FleetFuelEntry; fleet: FleetData }) {
  const vehicle = fleet.vehicles.find((item) => item.id === entry.vehicleId)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{vehicle?.plate ?? 'Veículo removido'} · {dateBR(entry.date)}</p>
          <p className="mt-1 text-xs text-muted">{entry.fuelType} · {entry.station || 'Fornecedor não informado'}</p>
        </div>
        <p className="font-display text-xl font-bold tabular">{brl(entry.totalCost)}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <Metric label="Litros" value={num(entry.liters, 2) + ' L'} />
        <Metric label="Hodômetro" value={num(entry.odometerKm, 0) + ' km'} />
        <Metric label="Preço / litro" value={brl(entry.totalCost / entry.liters)} />
      </div>
      {entry.fullTank && <p className="mt-2 text-xs text-ok"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Tanque cheio — considerado no cálculo km/L</p>}
    </Card>
  )
}
