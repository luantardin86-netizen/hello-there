import { useState, type FormEvent, type ReactNode } from 'react'
import { Modal, inputCls, cx } from './ui'
import { daysBetween, parseDecimal } from '../lib/format'
import { today } from '../data/fixtures'
import { inspectionItems, type FleetDriver, type FleetFuelEntry, type FleetInspection, type FleetMaintenance, type FleetTrip, type FleetVehicle, type MaintenanceKind, type VehicleStatus, type VehicleType } from '../data/fleet'
import type { Client, Site } from '../data/fixtures'
import type { EvaluatedQuote } from '../data/derived'

type SaveResult = string | null
type VehicleDraft = Omit<FleetVehicle, 'id' | 'demo'>
type DriverDraft = Omit<FleetDriver, 'id' | 'demo'>
type TripDraft = Omit<FleetTrip, 'id' | 'createdAt' | 'demo'>
type MaintenanceDraft = Omit<FleetMaintenance, 'id' | 'completedAt' | 'demo'>
type FuelDraft = Omit<FleetFuelEntry, 'id' | 'demo'>
type InspectionDraft = Omit<FleetInspection, 'id' | 'demo'>

function numberValue(raw: string, label: string, required = true, allowZero = true): number | null {
  const parsed = parseDecimal(raw)
  if (!parsed.ok) throw new Error(label + ': número inválido')
  if (parsed.value === null) {
    if (required) throw new Error(label + ': preencha este campo')
    return null
  }
  if (parsed.value < 0 || (!allowZero && parsed.value === 0)) {
    throw new Error(label + ': informe um valor maior que zero')
  }
  return parsed.value
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  min,
  step,
  inputMode,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  min?: string
  step?: string
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel'
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        inputMode={inputMode}
        required={required}
        min={min}
        step={step}
        placeholder={placeholder}
        className={inputCls()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  required?: boolean
  disabled?: boolean
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}{required ? ' *' : ''}</span>
      <select
        required={required}
        disabled={disabled}
        className={cx(inputCls(), 'disabled:cursor-not-allowed disabled:opacity-50')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione...</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      <textarea rows={3} className={cx(inputCls(), 'h-auto py-2')} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function FormActions({ onClose, submitLabel = 'Salvar registro' }: { onClose: () => void; submitLabel?: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="h-10 rounded-md border border-line px-4 text-sm font-semibold hover:bg-surface-2">Cancelar</button>
      <button type="submit" className="h-10 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong">{submitLabel}</button>
    </div>
  )
}

function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-sm font-medium text-brand">{children}</p>
}

function DialogFrame({ title, subtitle, open, onClose, children }: { title: string; subtitle?: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {subtitle && <p className="mb-4 text-sm text-muted">{subtitle}</p>}
      {children}
    </Modal>
  )
}

const vehicleTypes: VehicleType[] = ['Betoneira', 'Bomba-lança', 'Bomba estacionária', 'Basculante', 'Caminhão de apoio', 'Outro']
const vehicleStatuses: VehicleStatus[] = ['Disponível', 'Em operação', 'Manutenção', 'Atenção', 'Inativo']
const cnhCategories = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']
const fuelTypes = ['Diesel S10', 'Diesel S500', 'Arla 32', 'Gasolina', 'Etanol', 'Outro']

export function VehicleDialog({ open, initial, onClose, onSave }: { open: boolean; initial?: FleetVehicle | null; onClose: () => void; onSave: (value: VehicleDraft) => SaveResult }) {
  const [plate, setPlate] = useState(initial?.plate ?? '')
  const [type, setType] = useState<VehicleType>(initial?.type ?? 'Betoneira')
  const [model, setModel] = useState(initial?.model ?? '')
  const [year, setYear] = useState(initial?.year?.toString() ?? '')
  const [capacity, setCapacity] = useState(initial?.capacityM3?.toString() ?? '')
  const [odometer, setOdometer] = useState(initial?.odometerKm.toString() ?? '0')
  const [nextKm, setNextKm] = useState(initial?.nextMaintenanceKm?.toString() ?? '')
  const [status, setStatus] = useState<VehicleStatus>(initial?.status ?? 'Disponível')
  const [crlv, setCrlv] = useState(initial?.crlvDueAt ?? '')
  const [insurance, setInsurance] = useState(initial?.insuranceDueAt ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      if (plate.trim().length < 7) throw new Error('Informe a placa completa do veículo.')
      if (!model.trim()) throw new Error('Informe marca e modelo do veículo.')
      const yearNumber = numberValue(year, 'Ano', false)
      const capacityNumber = numberValue(capacity, 'Capacidade em m³', false, false)
      const odometerNumber = numberValue(odometer, 'Hodômetro') ?? 0
      const nextNumber = numberValue(nextKm, 'Próxima revisão (km)', false)
      const message = onSave({
        plate: plate.trim().toLocaleUpperCase('pt-BR'),
        type,
        model: model.trim(),
        year: yearNumber,
        capacityM3: capacityNumber,
        odometerKm: odometerNumber,
        nextMaintenanceKm: nextNumber,
        status,
        crlvDueAt: crlv,
        insuranceDueAt: insurance,
        notes: notes.trim(),
      })
      if (message) setError(message)
      else onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o veículo.')
    }
  }

  return (
    <DialogFrame open={open} onClose={onClose} title={initial ? 'Editar caminhão' : 'Cadastrar caminhão'} subtitle="Cadastre a identificação, capacidade, hodômetro e vencimentos. Os dados serão salvos neste navegador.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField label="Placa" value={plate} onChange={setPlate} required placeholder="ABC1D23" />
          <SelectField label="Tipo de veículo" value={type} onChange={(v) => setType(v as VehicleType)} options={vehicleTypes.map((v) => ({ value: v, label: v }))} required />
          <InputField label="Marca e modelo" value={model} onChange={setModel} required placeholder="Ex.: Mercedes-Benz Atego" />
          <InputField label="Ano de fabricação" value={year} onChange={setYear} type="number" min="1900" step="1" inputMode="numeric" />
          {type === 'Betoneira' && <InputField label="Capacidade do tambor (m³)" value={capacity} onChange={setCapacity} type="number" min="0.1" step="0.1" inputMode="decimal" />}
          <InputField label="Hodômetro atual (km)" value={odometer} onChange={setOdometer} type="number" min="0" step="1" required inputMode="numeric" />
          <InputField label="Próxima revisão (km)" value={nextKm} onChange={setNextKm} type="number" min="0" step="1" inputMode="numeric" />
          <SelectField label="Situação operacional" value={status} onChange={(v) => setStatus(v as VehicleStatus)} options={vehicleStatuses.map((v) => ({ value: v, label: v }))} required />
          <InputField label="Validade do CRLV" value={crlv} onChange={setCrlv} type="date" required />
          <InputField label="Validade do seguro" value={insurance} onChange={setInsurance} type="date" required />
        </div>
        <TextAreaField label="Observações" value={notes} onChange={setNotes} placeholder="Garagem, identificação interna, restrições..." />
        <ErrorMessage>{error}</ErrorMessage>
        <FormActions onClose={onClose} />
      </form>
    </DialogFrame>
  )
}

export function DriverDialog({ open, initial, onClose, onSave }: { open: boolean; initial?: FleetDriver | null; onClose: () => void; onSave: (value: DriverDraft) => SaveResult }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [category, setCategory] = useState(initial?.cnhCategory ?? 'D')
  const [expiresAt, setExpiresAt] = useState(initial?.cnhExpiresAt ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('Informe o nome do motorista.')
    const message = onSave({ name: name.trim(), phone: phone.trim(), cnhCategory: category, cnhExpiresAt: expiresAt, active, notes: notes.trim() })
    if (message) setError(message)
    else onClose()
  }

  return (
    <DialogFrame open={open} onClose={onClose} title={initial ? 'Editar motorista' : 'Cadastrar motorista'} subtitle="Mantenha a identificação e a validade da CNH atualizadas para evitar escalação irregular.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField label="Nome completo" value={name} onChange={setName} required />
          <InputField label="Telefone" value={phone} onChange={setPhone} type="tel" inputMode="tel" />
          <SelectField label="Categoria da CNH" value={category} onChange={setCategory} options={cnhCategories.map((v) => ({ value: v, label: v }))} required />
          <InputField label="Validade da CNH" value={expiresAt} onChange={setExpiresAt} type="date" required />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Motorista ativo e disponível para escala
        </label>
        <TextAreaField label="Observações" value={notes} onChange={setNotes} />
        <ErrorMessage>{error}</ErrorMessage>
        <FormActions onClose={onClose} />
      </form>
    </DialogFrame>
  )
}

export function TripDialog({
  open,
  onClose,
  onSave,
  clients,
  sites,
  quotes,
  vehicles,
  drivers,
  trips,
}: {
  open: boolean
  onClose: () => void
  onSave: (value: TripDraft) => SaveResult
  clients: Client[]
  sites: Site[]
  quotes: EvaluatedQuote[]
  vehicles: FleetVehicle[]
  drivers: FleetDriver[]
  trips: FleetTrip[]
}) {
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('08:00')
  const [clientId, setClientId] = useState(sites[0]?.clientId ?? clients[0]?.id ?? '')
  const [siteId, setSiteId] = useState(sites.find((s) => s.clientId === (sites[0]?.clientId ?? clients[0]?.id))?.id ?? '')
  const [quoteId, setQuoteId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [volume, setVolume] = useState('')
  const [fck, setFck] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const clientSites = sites.filter((site) => site.clientId === clientId)
  const siteQuotes = quotes.filter((quote) => quote.clientId === clientId && quote.siteId === siteId)
  const usedVehicleIds = new Set(trips.filter((trip) => trip.date === date && trip.status !== 'Concluída' && trip.status !== 'Cancelada').map((trip) => trip.vehicleId))
  const usedDriverIds = new Set(trips.filter((trip) => trip.date === date && trip.status !== 'Concluída' && trip.status !== 'Cancelada').map((trip) => trip.driverId))
  const availableVehicles = vehicles.filter((vehicle) => vehicle.status === 'Disponível' && !usedVehicleIds.has(vehicle.id) && !!vehicle.crlvDueAt && daysBetween(date, vehicle.crlvDueAt) >= 0 && !!vehicle.insuranceDueAt && daysBetween(date, vehicle.insuranceDueAt) >= 0 && (vehicle.nextMaintenanceKm === null || vehicle.odometerKm < vehicle.nextMaintenanceKm))
  const availableDrivers = drivers.filter((driver) => driver.active && !usedDriverIds.has(driver.id) && !!driver.cnhExpiresAt && daysBetween(date, driver.cnhExpiresAt) >= 0)

  function chooseQuote(id: string) {
    setQuoteId(id)
    const quote = quotes.find((item) => item.id === id)
    if (!quote) return
    setClientId(quote.clientId)
    setSiteId(quote.siteId)
    setVolume('')
    if (quote.fck !== null) setFck(String(quote.fck))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      if (!clientId || !siteId) throw new Error('Selecione o cliente e a obra.')
      if (!vehicleId) throw new Error('Selecione um caminhão disponível.')
      if (!driverId) throw new Error('Selecione um motorista disponível.')
      const volumeNumber = numberValue(volume, 'Volume em m³', true, false)
      const fckNumber = numberValue(fck, 'FCK', false, false)
      const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId)
      if (selectedVehicle?.capacityM3 !== null && selectedVehicle?.capacityM3 !== undefined && volumeNumber !== null && volumeNumber > selectedVehicle.capacityM3) {
        throw new Error('O volume desta viagem supera a capacidade do caminhão (' + selectedVehicle.capacityM3.toLocaleString('pt-BR') + ' m³).')
      }
      const message = onSave({
        date,
        time,
        clientId,
        siteId,
        quoteId: quoteId || null,
        vehicleId,
        driverId,
        volumeM3: volumeNumber ?? 0,
        fck: fckNumber,
        status: 'Programada',
        notes: notes.trim(),
      })
      if (message) setError(message)
      else onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível programar a viagem.')
    }
  }

  return (
    <DialogFrame open={open} onClose={onClose} title="Programar viagem / concretagem" subtitle="Vincule a entrega a cliente e obra, reserve veículo e motorista e informe o volume. Só aparecem recursos com documentos válidos na data.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField label="Data da entrega" value={date} onChange={setDate} type="date" required />
          <InputField label="Horário previsto" value={time} onChange={setTime} type="time" required />
          <SelectField label="Cliente" value={clientId} onChange={(id) => { setClientId(id); setSiteId(''); setQuoteId('') }} options={clients.map((client) => ({ value: client.id, label: client.name }))} required />
          <SelectField label="Obra" value={siteId} onChange={(id) => { setSiteId(id); setQuoteId('') }} options={clientSites.map((site) => ({ value: site.id, label: site.name }))} required disabled={!clientId} />
          <SelectField label="Orçamento relacionado (opcional)" value={quoteId} onChange={chooseQuote} options={siteQuotes.map((quote) => ({ value: quote.id, label: quote.number + ' · ' + quote.result.concreteVolume.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m³' }))} disabled={!siteId || siteQuotes.length === 0} />
          <SelectField label="Caminhão disponível" value={vehicleId} onChange={setVehicleId} options={availableVehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plate + ' · ' + vehicle.type }))} required disabled={availableVehicles.length === 0} />
          <SelectField label="Motorista disponível" value={driverId} onChange={setDriverId} options={availableDrivers.map((driver) => ({ value: driver.id, label: driver.name + ' · CNH ' + driver.cnhCategory }))} required disabled={availableDrivers.length === 0} />
          <InputField label="Volume desta viagem (m³)" value={volume} onChange={setVolume} type="number" min="0.01" step="0.01" required inputMode="decimal" />
          <InputField label="FCK (MPa)" value={fck} onChange={setFck} type="number" min="1" step="1" inputMode="numeric" />
        </div>
        {availableVehicles.length === 0 && <p className="text-xs font-medium text-warn">Não há caminhões disponíveis e regulares nesta data. Verifique situação, documentos, revisão e viagens já programadas.</p>}
        {availableDrivers.length === 0 && <p className="text-xs font-medium text-warn">Não há motoristas ativos livres para esta data.</p>}
        <TextAreaField label="Instruções para a operação" value={notes} onChange={setNotes} placeholder="Acesso, janela de descarga, necessidade de bomba..." />
        <ErrorMessage>{error}</ErrorMessage>
        <FormActions onClose={onClose} submitLabel="Programar viagem" />
      </form>
    </DialogFrame>
  )
}

export function MaintenanceDialog({ open, onClose, onSave, vehicles }: { open: boolean; onClose: () => void; onSave: (value: MaintenanceDraft) => SaveResult; vehicles: FleetVehicle[] }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '')
  const currentVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId)
  const [kind, setKind] = useState<MaintenanceKind>('Preventiva')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState(today)
  const [odometer, setOdometer] = useState(currentVehicle?.odometerKm.toString() ?? '')
  const [cost, setCost] = useState('')
  const [supplier, setSupplier] = useState('')
  const [nextKm, setNextKm] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function changeVehicle(id: string) {
    setVehicleId(id)
    setOdometer(vehicles.find((vehicle) => vehicle.id === id)?.odometerKm.toString() ?? '')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      if (!vehicleId) throw new Error('Selecione um veículo.')
      if (!description.trim()) throw new Error('Descreva o serviço ou defeito.')
      const message = onSave({
        vehicleId,
        kind,
        description: description.trim(),
        dueAt,
        odometerKm: numberValue(odometer, 'Hodômetro') ?? 0,
        cost: numberValue(cost, 'Custo', false),
        supplier: supplier.trim(),
        nextMaintenanceKm: numberValue(nextKm, 'Próxima revisão (km)', false),
        status: 'Agendada',
        notes: notes.trim(),
      })
      if (message) setError(message)
      else onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a manutenção.')
    }
  }

  return (
    <DialogFrame open={open} onClose={onClose} title="Registrar manutenção" subtitle="Abra uma ordem de serviço preventiva ou corretiva e acompanhe sua execução.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Veículo" value={vehicleId} onChange={changeVehicle} options={vehicles.filter((v) => v.status !== 'Inativo').map((v) => ({ value: v.id, label: v.plate + ' · ' + v.type }))} required />
          <SelectField label="Tipo de manutenção" value={kind} onChange={(v) => setKind(v as MaintenanceKind)} options={[{ value: 'Preventiva', label: 'Preventiva' }, { value: 'Corretiva', label: 'Corretiva' }]} required />
          <InputField label="Data prevista / abertura" value={dueAt} onChange={setDueAt} type="date" required />
          <InputField label="Hodômetro na abertura (km)" value={odometer} onChange={setOdometer} type="number" min="0" step="1" required />
          <InputField label="Custo previsto ou realizado (R$)" value={cost} onChange={setCost} type="number" min="0" step="0.01" />
          <InputField label="Fornecedor / oficina" value={supplier} onChange={setSupplier} />
          <InputField label="Próxima revisão em (km)" value={nextKm} onChange={setNextKm} type="number" min="0" step="1" />
        </div>
        <InputField label="Serviço ou defeito" value={description} onChange={setDescription} required placeholder="Ex.: troca de óleo, freios, sistema hidráulico..." />
        <TextAreaField label="Observações e peças" value={notes} onChange={setNotes} />
        <ErrorMessage>{error}</ErrorMessage>
        <FormActions onClose={onClose} submitLabel="Abrir ordem de serviço" />
      </form>
    </DialogFrame>
  )
}

export function FuelDialog({ open, onClose, onSave, vehicles }: { open: boolean; onClose: () => void; onSave: (value: FuelDraft) => SaveResult; vehicles: FleetVehicle[] }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '')
  const currentVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId)
  const [date, setDate] = useState(today)
  const [odometer, setOdometer] = useState(currentVehicle?.odometerKm.toString() ?? '')
  const [liters, setLiters] = useState('')
  const [cost, setCost] = useState('')
  const [fuelType, setFuelType] = useState('Diesel S10')
  const [station, setStation] = useState('')
  const [fullTank, setFullTank] = useState(true)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function changeVehicle(id: string) {
    setVehicleId(id)
    setOdometer(vehicles.find((vehicle) => vehicle.id === id)?.odometerKm.toString() ?? '')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      if (!vehicleId) throw new Error('Selecione um veículo.')
      const message = onSave({
        vehicleId,
        date,
        odometerKm: numberValue(odometer, 'Hodômetro') ?? 0,
        liters: numberValue(liters, 'Litros', true, false) ?? 0,
        totalCost: numberValue(cost, 'Valor total', true) ?? 0,
        fuelType,
        station: station.trim(),
        fullTank,
        notes: notes.trim(),
      })
      if (message) setError(message)
      else onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o abastecimento.')
    }
  }

  return (
    <DialogFrame open={open} onClose={onClose} title="Registrar abastecimento" subtitle="Registre litros, valor, hodômetro e se o abastecimento completou o tanque para calcular km/L entre dois tanques cheios.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Veículo" value={vehicleId} onChange={changeVehicle} options={vehicles.filter((v) => v.status !== 'Inativo').map((v) => ({ value: v.id, label: v.plate + ' · ' + v.type }))} required />
          <InputField label="Data" value={date} onChange={setDate} type="date" required />
          <InputField label="Hodômetro (km)" value={odometer} onChange={setOdometer} type="number" min="0" step="1" required />
          <InputField label="Litros" value={liters} onChange={setLiters} type="number" min="0.01" step="0.01" required />
          <InputField label="Valor total (R$)" value={cost} onChange={setCost} type="number" min="0" step="0.01" required />
          <SelectField label="Combustível / insumo" value={fuelType} onChange={setFuelType} options={fuelTypes.map((v) => ({ value: v, label: v }))} required />
          <InputField label="Posto / fornecedor" value={station} onChange={setStation} />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={fullTank} onChange={(event) => setFullTank(event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Tanque completado (usar no cálculo de km/L)
        </label>
        <TextAreaField label="Observações" value={notes} onChange={setNotes} />
        <ErrorMessage>{error}</ErrorMessage>
        <FormActions onClose={onClose} submitLabel="Salvar abastecimento" />
      </form>
    </DialogFrame>
  )
}

export function InspectionDialog({ open, onClose, onSave, vehicles, drivers }: { open: boolean; onClose: () => void; onSave: (value: InspectionDraft) => SaveResult; vehicles: FleetVehicle[]; drivers: FleetDriver[] }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '')
  const currentVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId)
  const [driverId, setDriverId] = useState(drivers.find((driver) => driver.active)?.id ?? '')
  const [odometer, setOdometer] = useState(currentVehicle?.odometerKm.toString() ?? '')
  const [checks, setChecks] = useState<Record<string, boolean>>(() => Object.fromEntries(inspectionItems.map((item) => [item, true])))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      if (!vehicleId) throw new Error('Selecione um veículo.')
      const message = onSave({
        vehicleId,
        driverId,
        date: today,
        odometerKm: numberValue(odometer, 'Hodômetro') ?? 0,
        checks,
        notes: notes.trim(),
      })
      if (message) setError(message)
      else onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o checklist.')
    }
  }

  return (
    <DialogFrame open={open} onClose={onClose} title="Checklist pré-operacional" subtitle="Marque os itens conferidos antes de liberar o veículo. Qualquer item reprovado coloca a unidade em atenção.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Veículo" value={vehicleId} onChange={(id) => { setVehicleId(id); setOdometer(vehicles.find((v) => v.id === id)?.odometerKm.toString() ?? '') }} options={vehicles.filter((v) => v.status !== 'Inativo').map((v) => ({ value: v.id, label: v.plate + ' · ' + v.type }))} required />
          <SelectField label="Motorista" value={driverId} onChange={setDriverId} options={drivers.filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))} />
          <InputField label="Hodômetro (km)" value={odometer} onChange={setOdometer} type="number" min="0" step="1" required />
        </div>
        <div className="rounded-md border border-line">
          {inspectionItems.map((item) => (
            <label key={item} className="flex cursor-pointer items-center justify-between gap-3 border-b border-line px-3 py-3 last:border-0">
              <span className="text-sm font-medium">{item}</span>
              <input type="checkbox" checked={checks[item] ?? false} onChange={(event) => setChecks((current) => ({ ...current, [item]: event.target.checked }))} className="h-5 w-5 shrink-0 accent-[var(--brand)]" />
            </label>
          ))}
        </div>
        <TextAreaField label="Descreva itens reprovados ou observações" value={notes} onChange={setNotes} />
        <ErrorMessage>{error}</ErrorMessage>
        <FormActions onClose={onClose} submitLabel="Registrar checklist" />
      </form>
    </DialogFrame>
  )
}
