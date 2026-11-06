import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clients as seedClients,
  opportunities as seedOpps,
  quotes as seedQuotes,
  sites as seedSites,
  today,
  type Client,
  type Opportunity,
  type QuoteRecord,
  type Site,
} from './fixtures'
import {
  buildReceivables,
  evaluateAll,
  quoteContext,
  type EvaluatedQuote,
  type ReceivableRow,
} from './derived'
import { defaultExtras, type QuoteContext } from '../lib/quote'
import { addDays } from '../lib/format'
import { funnelStages, type QuoteStatus, type StageId } from './settings'

/** Etapa do funil → status do orçamento vinculado (sincronização). */
const stageToQuoteStatus: Partial<Record<StageId, QuoteStatus>> = {
  elaboracao: 'Rascunho',
  enviado: 'Enviado ao cliente',
  negociacao: 'Em negociação',
  fechado: 'Aceito',
  perdido: 'Recusado',
}
const QUOTE_STAGES: StageId[] = ['elaboracao', 'enviado', 'negociacao', 'fechado']
export const stageIndex = (id: StageId) => funnelStages.findIndex((s) => s.id === id)

/**
 * Estado da sessão. Nesta etapa os registros vêm de fixtures e as inclusões
 * ficam na memória do navegador até a etapa de banco de dados (ver PLAN.md).
 */
export interface Toast {
  id: number
  tone: 'ok' | 'erro' | 'info'
  title: string
  body?: string
}

interface Store {
  demoMode: boolean
  setDemoMode: (v: boolean) => void
  ctx: QuoteContext
  clients: Client[]
  sites: Site[]
  quotes: EvaluatedQuote[]
  opportunities: Opportunity[]
  receivables: ReceivableRow[]
  addClient: (c: Client, site?: Site) => void
  /** Muda a etapa e mantém o orçamento vinculado em sincronia (cria rascunho se preciso). */
  moveOpportunity: (id: string, to: StageId, historyText: string, patch?: Partial<Opportunity>) => string | null
  addReport: (id: string, text: string) => void
  updateOpportunity: (id: string, patch: Partial<Opportunity>, historyText?: string) => void
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
}

const StoreCtx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(true)
  const [extraClients, setExtraClients] = useState<Client[]>([])
  const [extraSites, setExtraSites] = useState<Site[]>([])
  const [opps, setOpps] = useState<Opportunity[]>(seedOpps)
  const [extraQuotes, setExtraQuotes] = useState<QuoteRecord[]>([])
  const [quoteStatus, setQuoteStatus] = useState<Record<string, QuoteStatus>>({})
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('qmx-demo')
    if (saved === '0') setDemoModeState(false)
  }, [])

  const setDemoMode = useCallback((v: boolean) => {
    setDemoModeState(v)
    localStorage.setItem('qmx-demo', v ? '1' : '0')
  }, [])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((xs) => [...xs, { ...t, id }])
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5000)
  }, [])
  const dismissToast = useCallback(
    (id: number) => setToasts((xs) => xs.filter((x) => x.id !== id)),
    [],
  )

  const value = useMemo<Store>(() => {
    const ctx = quoteContext(demoMode)
    const keep = <T extends { demo: boolean }>(xs: T[]) =>
      demoMode ? xs : xs.filter((x) => !x.demo)
    const allRecords = [...extraQuotes, ...keep(seedQuotes as QuoteRecord[])].map((r) =>
      quoteStatus[r.id] ? { ...r, status: quoteStatus[r.id] } : r,
    )
    const quotes = evaluateAll(allRecords, ctx)
    const allClients = [...extraClients, ...keep(seedClients)]
    const allSites = [...extraSites, ...keep(seedSites)]
    const histEntry = (text: string) => ({ at: new Date().toISOString(), by: 'u-adm', text })
    return {
      demoMode,
      setDemoMode,
      ctx,
      clients: allClients,
      sites: allSites,
      quotes,
      opportunities: keep(opps),
      receivables: demoMode ? buildReceivables(quotes) : [],
      addClient: (c, site) => {
        setExtraClients((xs) => [c, ...xs])
        if (site) setExtraSites((xs) => [site, ...xs])
        // Sincronia Clientes → Funil: todo cliente novo entra como "Novo lead".
        setOpps((xs) => [
          {
            id: `op-${Date.now()}`,
            title: site?.name || `Atendimento — ${c.name}`,
            clientId: c.id,
            siteId: site?.id ?? null,
            stage: 'novo',
            estimatedValue: null,
            ownerId: c.ownerId,
            source: c.source,
            enteredAt: today,
            lastContact: null,
            nextContact: today,
            nextAction: 'Primeiro atendimento',
            lossReason: null,
            quoteId: null,
            history: [histEntry('Lead criado a partir do cadastro de cliente')],
            reports: [],
            demo: false,
          },
          ...xs,
        ])
      },
      moveOpportunity: (id, to, historyText, patch = {}) => {
        const o = opps.find((x) => x.id === id)
        if (!o) return null
        let quoteId = o.quoteId
        const extra: string[] = []
        if (!quoteId && QUOTE_STAGES.includes(to)) {
          const c = allClients.find((x) => x.id === o.clientId)
          const site = allSites.find((x) => x.id === o.siteId) ?? allSites.find((x) => x.clientId === o.clientId)
          const max = allRecords.reduce((m, r) => Math.max(m, Number(r.number.split('-')[2]) || 0), 0)
          const n = max + 1
          quoteId = `orc-l${Date.now()}`
          const number = `ORC-${today.slice(0, 4)}-${String(n).padStart(4, '0')}`
          const leadInfo = [
            `Lead: ${c?.name ?? '—'}`,
            c?.phone && `Telefone: ${c.phone}`,
            c?.whatsapp && c.whatsapp !== c.phone && `WhatsApp: ${c.whatsapp}`,
            c?.email && `E-mail: ${c.email}`,
            c?.city && `Cidade: ${c.city}`,
            `Origem: ${o.source}`,
            `Oportunidade: ${o.title}`,
            ...(o.reports ?? []).map((r) => `Relatório (${r.at.slice(0, 10)}): ${r.text}`),
          ].filter(Boolean).join('\n')
          setExtraQuotes((xs) => [
            {
              id: quoteId!, number, version: 1, createdAt: today, validUntil: addDays(today, 15), sentAt: null,
              status: stageToQuoteStatus[to] ?? 'Rascunho', type: 'concreto', clientId: o.clientId, siteId: site?.id ?? '',
              ownerId: o.ownerId, volumeElements: [], volumeMargin: '', areaElements: [], areaMargin: '', lines: [],
              extras: defaultExtras(), paymentMethodIds: [], paymentTerms: '', executionDeadline: '', notes: leadInfo, demo: false,
            },
            ...xs,
          ])
          extra.push(`Rascunho de orçamento ${number} criado automaticamente`)
        } else if (quoteId && stageToQuoteStatus[to]) {
          const qs = stageToQuoteStatus[to]!
          setQuoteStatus((m) => ({ ...m, [quoteId!]: qs }))
          extra.push(`Orçamento vinculado: status "${qs}"`)
        }
        setOpps((xs) =>
          xs.map((x) =>
            x.id === id
              ? { ...x, ...patch, stage: to, quoteId, history: [...extra.map(histEntry), histEntry(historyText), ...x.history] }
              : x,
          ),
        )
        return extra[0] ?? null
      },
      addReport: (id, text) =>
        setOpps((xs) =>
          xs.map((x) =>
            x.id === id
              ? { ...x, reports: [{ at: new Date().toISOString(), by: 'u-adm', text }, ...(x.reports ?? [])], history: [histEntry('Relatório de atendimento adicionado'), ...x.history] }
              : x,
          ),
        ),
      updateOpportunity: (id, patch, historyText) =>
        setOpps((xs) =>
          xs.map((o) =>
            o.id === id
              ? {
                  ...o,
                  ...patch,
                  history: historyText
                    ? [
                        { at: new Date().toISOString(), by: 'u-adm', text: historyText },
                        ...o.history,
                      ]
                    : o.history,
                }
              : o,
          ),
        ),
      toasts,
      toast,
      dismissToast,
    }
  }, [demoMode, extraClients, extraSites, opps, extraQuotes, quoteStatus, toasts, toast, dismissToast, setDemoMode])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('useStore fora do StoreProvider')
  return s
}
