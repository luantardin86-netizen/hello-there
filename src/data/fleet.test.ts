import { describe, expect, it } from 'vitest'
import {
  createDemoFleet,
  fuelEfficiencyKmL,
  getFleetAlerts,
  isTripInProgress,
  vehicleRunningCost,
} from './fleet'

describe('gestão de frota', () => {
  it('identifica apenas viagens que estão operacionalmente em andamento', () => {
    expect(isTripInProgress('Em trânsito')).toBe(true)
    expect(isTripInProgress('Na obra')).toBe(true)
    expect(isTripInProgress('Programada')).toBe(false)
    expect(isTripInProgress('Concluída')).toBe(false)
  })

  it('calcula consumo entre dois abastecimentos completos', () => {
    const data = createDemoFleet()
    expect(fuelEfficiencyKmL(data.fuelEntries, 'fleet-demo-001')).toBe(3)
    expect(fuelEfficiencyKmL(data.fuelEntries, 'fleet-demo-002')).toBeNull()
  })

  it('soma combustível e manutenção como custo acumulado do veículo', () => {
    const data = createDemoFleet()
    expect(vehicleRunningCost(data, 'fleet-demo-001')).toBe(1968)
  })

  it('gera alertas para CNH, documentos e manutenção em atraso', () => {
    const data = createDemoFleet()
    const alerts = getFleetAlerts(data)
    expect(alerts.some((alert) => alert.title.startsWith('CNH'))).toBe(true)
    expect(alerts.some((alert) => alert.title.startsWith('Seguro'))).toBe(true)
    expect(alerts.some((alert) => alert.title.startsWith('Manutenção atrasada'))).toBe(false)
    expect(alerts.some((alert) => alert.title.startsWith('Revisão por hodômetro'))).toBe(false)
  })

  it('avisa quando documentos ou CNH estão sem validade cadastrada', () => {
    const data = createDemoFleet()
    data.vehicles[0].crlvDueAt = ''
    data.vehicles[0].insuranceDueAt = ''
    data.drivers[0].cnhExpiresAt = ''
    const alerts = getFleetAlerts(data)
    expect(alerts.some((alert) => alert.title.includes('CRLV não informado'))).toBe(true)
    expect(alerts.some((alert) => alert.title.includes('Seguro não informado'))).toBe(true)
    expect(alerts.some((alert) => alert.title.includes('CNH sem validade'))).toBe(true)
  })

  it('avisa sobre manutenção preventiva dentro dos próximos 30 dias', () => {
    const data = createDemoFleet()
    data.maintenances[0].status = 'Agendada'
    data.maintenances[0].dueAt = '2026-01-20'
    const alerts = getFleetAlerts(data, '2026-01-01')
    expect(alerts.some((alert) => alert.title.startsWith('Manutenção próxima'))).toBe(true)
  })

  it('não alerta quando documentos e CNH estão fora da janela de 30 dias', () => {
    const data = createDemoFleet()
    data.vehicles.forEach((vehicle) => {
      vehicle.crlvDueAt = '2035-12-31'
      vehicle.insuranceDueAt = '2035-12-31'
      vehicle.nextMaintenanceKm = vehicle.odometerKm + 5000
    })
    data.drivers.forEach((driver) => { driver.cnhExpiresAt = '2035-12-31' })
    expect(getFleetAlerts(data, '2026-01-01')).toHaveLength(0)
  })
})
