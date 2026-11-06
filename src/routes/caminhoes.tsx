import { createFileRoute } from '@tanstack/react-router'
import { TruckFleet } from '../components/TruckFleet'

export const Route = createFileRoute('/caminhoes')({
  head: () => ({ meta: [{ title: 'Caminhões e frota — Qualimix CRM' }] }),
  component: TruckFleetPage,
})

function TruckFleetPage() {
  return <TruckFleet />
}
