import { createFileRoute } from '@tanstack/react-router'
import { QuoteBuilder } from '../components/QuoteBuilder'

export const Route = createFileRoute('/orcamentos/novo')({
  validateSearch: (s: Record<string, unknown>): { origem?: string; editar?: string } => ({
    origem: typeof s.origem === 'string' ? s.origem : undefined,
    editar: typeof s.editar === 'string' ? s.editar : undefined,
  }),
  head: () => ({ meta: [{ title: 'Novo orçamento — Qualimix CRM' }] }),
  component: NovoOrcamento,
})

function NovoOrcamento() {
  const { origem, editar } = Route.useSearch()
  return <QuoteBuilder key={editar ?? origem ?? 'novo'} origin={origem} editId={editar} />
}
