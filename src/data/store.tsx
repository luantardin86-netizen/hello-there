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
  evaluateRecord,
  quoteContext,
  type EvaluatedQuote,
  type ReceivableRow,
} from './derived'
import { defaultExtras, type QuoteContext } from '../lib/quote'
import { addDays, daysBetween } from '../lib/format'
import { funnelStages, type QuoteStatus, type StageId } from './settings'

const STORAGE_KEY = 'qmx-crm-flow-v2'
const WEBSITE_LEAD_SEEN_KEY = 'qmx-website-leads-seen-v1'

/** Uma única etapa inicia a criação automática do rascunho. */
const stageToQuoteStatus: Partial<Record<StageId, QuoteStatus>> = {
  novo: 'Rascunho',
  atendimento: 'Aguardando informações',
  levantamento: 'Aguardando informações',
  elaboracao: 'Rascunho',
  enviado: 'Enviado ao cliente',
  negociacao: 'Em negociação',
  fechado: 'Aceito',
  perdido: 'Recusado',
}

const quoteStatusToStage: Partial<Record<QuoteStatus, StageId>> = {
  Rascunho: 'elaboracao',
  'Aguardando informações': 'elaboracao',
  'Aguardando aprovação': 'elaboracao',
  'Aprovado internamente': 'elaboracao',
  'Enviado ao cliente': 'enviado',
  'Em negociação': 'negociacao',
  Aceito: 'fechado',
  Recusado: 'perdido',
}

export const stageIndex = (id: StageId) => funnelStages.findIndex((s) => s.id === id)

export interface Toast {
  id: number
  tone: 'ok' | 'erro' | 'info'
  title: string
  body?: string
}

interface PersistedCRM {
  clients: Client[]
  sites: Site[]
  opportunities: Opportunity[]
  quotes: QuoteRecord[]
}

function mergeById<T extends { id: string }>(seed: T[], saved: unknown): T[] {
  if (!Array.isArray(saved)) return seed
  const savedRows = saved.filter((row): row is T => !!row && typeof row === 'object' && typeof (row as T).id === 'string')
  const seedById = new Map(seed.map((row) => [row.id, row]))
  const savedIds = new Set(savedRows.map((row) => row.id))
  return [
    ...savedRows.map((row) => ({ ...(seedById.get(row.id) ?? {} as T), ...row }) as T),
    ...seed.filter((row) => !savedIds.has(row.id)),
  ]
}

function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? prefix + '-' + crypto.randomUUID()
    : prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function historyEntry(text: string) {
  return { at: new Date().toISOString(), by: 'u-adm', text }
}

function nextQuoteNumber(records: QuoteRecord[]) {
  const year = today.slice(0, 4)
  const max = records.reduce((current, record) => {
    const match = record.number.match(/-(\d{4,})$/)
    return Math.max(current, match ? Number(match[1]) : 0)
  }, 0)
  return `ORC-${year}-${String(max + 1).padStart(4, '0')}`
}

interface Store {
  ready: boolean
  demoMode: boolean
  setDemoMode: (v: boolean) => void
  ctx: QuoteContext
  clients: Client[]
  sites: Site[]
  quotes: EvaluatedQuote[]
  opportunities: Opportunity[]
  receivables: ReceivableRow[]
  addClient: (c: Client, site?: Site) => string
  updateClient: (id: string, patch: Partial<Client>) => void
  updateSite: (id: string, patch: Partial<Site>) => void
  /** Muda a etapa; ao entrar em elaboração cria/reutiliza exatamente um rascunho. */
  moveOpportunity: (id: string, to: StageId, historyText: string, patch?: Partial<Opportunity>) => string | null
  addReport: (id: string, text: string) => void
  updateReport: (id: string, reportId: string, text: string) => void
  deleteReport: (id: string, reportId: string) => void
  updateOpportunity: (id: string, patch: Partial<Opportunity>, historyText?: string) => void
  saveQuote: (record: QuoteRecord) => string
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
}

const StoreCtx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(true)
  const [clientRecords, setClientRecords] = useState<Client[]>(seedClients)
  const [siteRecords, setSiteRecords] = useState<Site[]>(seedSites)
  const [opps, setOpps] = useState<Opportunity[]>(seedOpps)
  const [quoteRecords, setQuoteRecords] = useState<QuoteRecord[]>(seedQuotes)
  const [ready, setReady] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    try {
      const demo = localStorage.getItem('qmx-demo')
      if (demo === '0') setDemoModeState(false)
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedCRM>
        setClientRecords(mergeById(seedClients, saved.clients))
        setSiteRecords(mergeById(seedSites, saved.sites))
        setOpps(mergeById(seedOpps, saved.opportunities))
        setQuoteRecords(mergeById(seedQuotes, saved.quotes))
      }
    } catch {
      // Dados inválidos ou armazenamento bloqueado não impedem abrir o CRM.
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      const data: PersistedCRM = {
        clients: clientRecords,
        sites: siteRecords,
        opportunities: opps,
        quotes: quoteRecords,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // A aplicação segue funcionando na sessão caso o navegador bloqueie o armazenamento.
    }
  }, [ready, clientRecords, siteRecords, opps, quoteRecords])

  const setDemoMode = useCallback((v: boolean) => {
    setDemoModeState(v)
    try {
      localStorage.setItem('qmx-demo', v ? '1' : '0')
    } catch {
      // A preferência visual pode permanecer apenas na sessão.
    }
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
    const visibleQuoteRecords = keep(quoteRecords)
    const quotes = evaluateAll(visibleQuoteRecords, ctx)
    const clients = keep(clientRecords)
    const sites = keep(siteRecords)
    const opportunities = keep(opps)
    const receivables = demoMode ? buildReceivables(quotes) : []

    const addClient = (client: Client, site?: Site) => {
      const digits = (value: string) => value.replace(/\D/g, '')
      const candidateDocument = digits(client.document)
      const candidatePhone = digits(client.whatsapp || client.phone)
      const candidateEmail = client.email.trim().toLocaleLowerCase('pt-BR')
      const duplicate = clientRecords.find((row) => {
        if (row.demo !== client.demo) return false
        const sameDocument = candidateDocument.length >= 11 && digits(row.document) === candidateDocument
        const samePhone = candidatePhone.length >= 10 && [row.phone, row.whatsapp].some((value) => digits(value) === candidatePhone)
        const sameEmail = candidateEmail.length > 0 && row.email.trim().toLocaleLowerCase('pt-BR') === candidateEmail
        return row.id === client.id || sameDocument || samePhone || sameEmail
      })
      const persistedClient = duplicate
        ? { ...duplicate, ...client, id: duplicate.id, demo: duplicate.demo }
        : client
      const matchingSite = site ? siteRecords.find((row) =>
        row.id === site.id ||
        (row.clientId === persistedClient.id && row.name.trim().toLocaleLowerCase('pt-BR') === site.name.trim().toLocaleLowerCase('pt-BR')),
      ) : undefined
      const persistedSite = site ? { ...site, id: matchingSite?.id ?? site.id, clientId: persistedClient.id } : undefined

      setClientRecords((rows) => duplicate
        ? rows.map((row) => row.id === duplicate.id ? persistedClient : row)
        : [persistedClient, ...rows],
      )
      if (persistedSite) {
        setSiteRecords((rows) => {
          const existing = rows.find((row) =>
            row.id === persistedSite.id ||
            (row.clientId === persistedClient.id && row.name.trim().toLocaleLowerCase('pt-BR') === persistedSite.name.trim().toLocaleLowerCase('pt-BR')),
          )
          return existing
            ? rows.map((row) => row.id === existing.id ? { ...row, ...persistedSite, id: existing.id } : row)
            : [persistedSite, ...rows]
        })
      }

      // Reenvios da landing/formulário atualizam o contato, mas não duplicam o lead aberto.
      setOpps((rows) => {
        const existing = rows.find((row) => row.clientId === persistedClient.id && row.stage !== 'fechado' && row.stage !== 'perdido')
        if (existing) {
          return rows.map((row) => row.id === existing.id
            ? { ...row, siteId: row.siteId ?? persistedSite?.id ?? null }
            : row,
          )
        }
        return [{
          id: makeId('op'),
          title: persistedSite?.name || `Atendimento — ${persistedClient.name}`,
          clientId: persistedClient.id,
          siteId: persistedSite?.id ?? null,
          stage: 'novo',
          estimatedValue: null,
          ownerId: persistedClient.ownerId,
          source: persistedClient.source || 'Outros',
          enteredAt: today,
          lastContact: null,
          nextContact: today,
          nextAction: 'Primeiro atendimento',
          lossReason: null,
          quoteId: null,
          history: [historyEntry('Lead criado a partir do cadastro de cliente')],
          reports: [],
          demo: persistedClient.demo,
        }, ...rows]
      })
      return persistedClient.id
    }

    const updateClient = (id: string, patch: Partial<Client>) => {
      setClientRecords((rows) => rows.map((client) => client.id === id ? { ...client, ...patch, id } : client))
    }

    const updateSite = (id: string, patch: Partial<Site>) => {
      setSiteRecords((rows) => rows.map((site) => site.id === id ? { ...site, ...patch, id } : site))
      if (patch.clientId) {
        setOpps((rows) => rows.map((opportunity) =>
          opportunity.siteId === id ? { ...opportunity, clientId: patch.clientId!, siteId: id } : opportunity,
        ))
      }
    }

    const moveOpportunity = (
      id: string,
      to: StageId,
      historyText: string,
      patch: Partial<Opportunity> = {},
    ): string | null => {
      const opportunity = opps.find((row) => row.id === id)
      if (!opportunity) return 'Bloqueado: oportunidade não encontrada.'

      let quoteId = opportunity.quoteId
      let linkedQuote = quoteRecords.find((record) => record.id === quoteId || record.opportunityId === id)
      if (opportunity.stage === to && !(to === 'elaboracao' && !linkedQuote)) return null
      const extra: string[] = []

      if (to === 'elaboracao' && !linkedQuote) {
        const client = clientRecords.find((row) => row.id === opportunity.clientId)
        const site = siteRecords.find((row) => row.id === opportunity.siteId)
        const number = nextQuoteNumber(quoteRecords)
        quoteId = makeId('quote')
        const leadInfo = [
          `Lead: ${client?.name ?? opportunity.title}`,
          client?.tradeName && `Nome fantasia: ${client.tradeName}`,
          client?.phone && `Telefone: ${client.phone}`,
          client?.whatsapp && client.whatsapp !== client.phone && `WhatsApp: ${client.whatsapp}`,
          client?.email && `E-mail: ${client.email}`,
          client?.city && `Cidade: ${client.city}`,
          client?.region && `Região: ${client.region}`,
          `Origem: ${opportunity.source}`,
          `Oportunidade: ${opportunity.title}`,
          ...(opportunity.reports ?? []).map((report) => `Relatório (${report.at.slice(0, 10)}): ${report.text}`),
        ].filter(Boolean).join('\n')

        const draft: QuoteRecord = {
          id: quoteId,
          number,
          version: 1,
          createdAt: today,
          validUntil: addDays(today, 15),
          sentAt: null,
          status: 'Rascunho',
          type: 'concreto',
          clientId: opportunity.clientId,
          siteId: site?.id ?? '',
          ownerId: opportunity.ownerId,
          volumeElements: [],
          volumeMargin: '',
          areaElements: [],
          areaMargin: '',
          lines: [],
          extras: defaultExtras(),
          paymentMethodIds: [],
          paymentTerms: '',
          executionDeadline: '',
          notes: leadInfo,
          opportunityId: id,
          demo: opportunity.demo,
        }
        setQuoteRecords((rows) => [draft, ...rows])
        linkedQuote = draft
        extra.push(`Rascunho ${number} criado automaticamente`)
      }

      if (['enviado', 'negociacao', 'fechado'].includes(to) && !linkedQuote) {
        return 'Bloqueado: passe por "Orçamento em elaboração" e salve o rascunho antes de avançar.'
      }

      if (to === 'enviado' && linkedQuote) {
        if (!linkedQuote.validUntil || daysBetween(today, linkedQuote.validUntil) < 0) {
          return 'Bloqueado: defina uma validade vigente para o orçamento antes do envio.'
        }
        const calculated = evaluateRecord(linkedQuote, ctx)
        if (!calculated.canIssue) {
          const firstBlocker = calculated.issues.find((issue) => issue.level === 'bloqueio')
          return `Bloqueado: complete o orçamento antes de enviar. ${firstBlocker?.message ?? 'Há pendências de cálculo.'}`
        }
        if (calculated.needsApproval && linkedQuote.status !== 'Aprovado internamente') {
          return 'Bloqueado: este orçamento exige aprovação interna antes do envio.'
        }
      }

      if (to === 'negociacao' && linkedQuote && !['Enviado ao cliente', 'Em negociação'].includes(linkedQuote.status)) {
        return 'Bloqueado: registre o envio do orçamento antes de iniciar a negociação.'
      }

      if (to === 'fechado' && linkedQuote && !['Enviado ao cliente', 'Em negociação'].includes(linkedQuote.status)) {
        return 'Bloqueado: o orçamento precisa estar enviado ou em negociação antes do fechamento.'
      }

      if (linkedQuote && stageToQuoteStatus[to] && linkedQuote.status !== stageToQuoteStatus[to]) {
        const nextStatus = stageToQuoteStatus[to]!
        setQuoteRecords((rows) => rows.map((record) =>
          record.id === linkedQuote!.id ? { ...record, status: nextStatus } : record,
        ))
        extra.push(`Orçamento vinculado atualizado para "${nextStatus}"`)
      }

      const finalQuoteId = linkedQuote?.id ?? quoteId ?? null
      setOpps((rows) => rows.map((row) => row.id === id
        ? {
            ...row,
            ...patch,
            stage: to,
            quoteId: finalQuoteId,
            history: [...extra.map(historyEntry), historyEntry(historyText), ...row.history],
            nextContact: to === 'fechado' || to === 'perdido' ? null : (patch.nextContact ?? row.nextContact),
          }
        : row,
      ))
      return extra[0] ?? null
    }

    const updateOpportunity = (id: string, patch: Partial<Opportunity>, historyText?: string) => {
      const current = opps.find((row) => row.id === id)
      if (!current) return
      const { stage, ...fields } = patch
      if (stage && stage !== current.stage) {
        const result = moveOpportunity(id, stage, historyText ?? `Etapa alterada: ${current.stage} → ${stage}`, fields)
        if (result?.startsWith('Bloqueado:')) toast({ tone: 'erro', title: 'Não foi possível mover o lead', body: result.slice('Bloqueado:'.length).trim() })
        return
      }
      setOpps((rows) => rows.map((row) => row.id === id
        ? {
            ...row,
            ...fields,
            history: historyText ? [historyEntry(historyText), ...row.history] : row.history,
          }
        : row,
      ))
    }

    const addReport = (id: string, text: string) => {
      const report = { id: makeId('report'), at: new Date().toISOString(), by: 'u-adm', text }
      setOpps((rows) => rows.map((row) => row.id === id
        ? {
            ...row,
            reports: [report, ...(row.reports ?? [])],
            history: [historyEntry('Relatório de atendimento adicionado'), ...row.history],
          }
        : row,
      ))
    }

    const updateReport = (id: string, reportId: string, text: string) => {
      setOpps((rows) => rows.map((row) => row.id === id
        ? {
            ...row,
            reports: (row.reports ?? []).map((report) =>
              (report.id ?? report.at) === reportId ? { ...report, text } : report,
            ),
            history: [historyEntry('Relatório de atendimento editado'), ...row.history],
          }
        : row,
      ))
    }

    const deleteReport = (id: string, reportId: string) => {
      setOpps((rows) => rows.map((row) => row.id === id
        ? {
            ...row,
            reports: (row.reports ?? []).filter((report) => (report.id ?? report.at) !== reportId),
            history: [historyEntry('Relatório de atendimento removido'), ...row.history],
          }
        : row,
      ))
    }

    const saveQuote = (record: QuoteRecord): string => {
      const previous = quoteRecords.find((row) => row.id === record.id)
      const numberTaken = quoteRecords.some((row) => row.number === record.number && row.id !== record.id)
      const merged: QuoteRecord = {
        ...(previous ?? {} as QuoteRecord),
        ...record,
        number: previous?.number ?? (numberTaken ? nextQuoteNumber(quoteRecords) : record.number),
        opportunityId: record.opportunityId ?? previous?.opportunityId,
      }
      setQuoteRecords((rows) => previous
        ? rows.map((row) => row.id === record.id ? merged : row)
        : [merged, ...rows],
      )

      if (merged.opportunityId) {
        const nextStage = quoteStatusToStage[merged.status]
        setOpps((rows) => rows.map((row) => row.id === merged.opportunityId
          ? {
              ...row,
              quoteId: merged.id,
              ...(nextStage && row.stage !== nextStage ? {
                stage: nextStage,
                nextContact: nextStage === 'fechado' || nextStage === 'perdido' ? null : row.nextContact,
                history: [historyEntry(`Etapa sincronizada pelo orçamento: ${nextStage}`), ...row.history],
              } : {}),
              ...(!nextStage ? { history: row.history } : {}),
            }
          : row,
        ))
      }
      return merged.id
    }

    return {
      ready,
      demoMode,
      setDemoMode,
      ctx,
      clients,
      sites,
      quotes,
      opportunities,
      receivables,
      addClient,
      updateClient,
      updateSite,
      moveOpportunity,
      addReport,
      updateReport,
      deleteReport,
      updateOpportunity,
      saveQuote,
      toasts,
      toast,
      dismissToast,
    }
  }, [demoMode, clientRecords, siteRecords, opps, quoteRecords, toasts, toast, dismissToast, setDemoMode])


  // Busca os POSTs recebidos pelo servidor e os importa para o funil.
  // addClient persiste cliente e oportunidade no localStorage usado pelo CRM.
  useEffect(() => {
    if (!ready) return;

    let active = true;
    let requesting = false;

    const syncWebsiteLeads = async () => {
      if (requesting || !active) return;
      requesting = true;

      try {
        const response = await fetch('/api/webhooks/leads/pending', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = (await response.json()) as { leads?: unknown };
        if (!Array.isArray(payload.leads)) return;

        let seen: string[] = [];
        try {
          const saved = localStorage.getItem(WEBSITE_LEAD_SEEN_KEY);
          if (saved) {
            const parsed: unknown = JSON.parse(saved);
            if (Array.isArray(parsed)) seen = parsed.filter((item): item is string => typeof item === 'string');
          }
        } catch {
          // Um marcador corrompido não impede receber leads; addClient também deduplica por telefone.
        }

        const seenIds = new Set(seen);
        let imported = 0;

        for (const item of payload.leads) {
          if (!item || typeof item !== 'object') continue;
          const event = item as {
            id?: unknown;
            nome_cliente?: unknown;
            numero_cliente?: unknown;
            receivedAt?: unknown;
          };
          const id = typeof event.id === 'string' ? event.id : '';
          const name = typeof event.nome_cliente === 'string' ? event.nome_cliente.trim() : '';
          const phone = typeof event.numero_cliente === 'string' ? event.numero_cliente.trim() : '';
          if (!id || seenIds.has(id) || !name || !phone) continue;

          const receivedAt = typeof event.receivedAt === 'string'
            ? event.receivedAt
            : new Date().toISOString();

          value.addClient({
            id: `web-${id}`,
            name,
            tradeName: '',
            document: '',
            phone,
            whatsapp: phone,
            email: '',
            address: '',
            city: '',
            region: '',
            type: 'Outro',
            source: 'Vindo Site',
            ownerId: 'u-adm',
            notes: 'Lead recebido automaticamente via POST da landing page.',
            createdAt: receivedAt.slice(0, 10),
            active: true,
            demo: false,
          });

          seenIds.add(id);
          imported += 1;
          console.info('[CRM] Lead importado para o funil — etapa 1. Novo lead:', {
            id,
            nome_cliente: name,
            numero_cliente: phone,
          });
        }

        if (imported > 0) {
          localStorage.setItem(
            WEBSITE_LEAD_SEEN_KEY,
            JSON.stringify(Array.from(seenIds).slice(-500)),
          );
        }
      } catch (error) {
        console.error('[CRM] Falha ao sincronizar leads recebidos via POST:', error);
      } finally {
        requesting = false;
      }
    };

    void syncWebsiteLeads();
    const interval = window.setInterval(() => void syncWebsiteLeads(), 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [ready, value.addClient]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('useStore fora do StoreProvider')
  return s
}
